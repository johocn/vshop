# 多仓拆分发货 · 预留单闭环 设计文档（2026-09-20）

## 1. 目标与范围

在已上线的多仓拆分发货**预留单引擎**（`cjk-plugin` `stock-reservation.service.ts`，Phase C 已交付）之上，补齐**对外接口 + 后台闭环**：

- **现状缺口**：预留单引擎已实现 `reserveOnOrder→allocate→fulfill→release→reconcileScan`，并通过 `StockMovementEvent` 托盘接线下单/发货/取消。但**无任何 admin API 暴露**（无 query/mutation），web-admin 无法查看/操作预留单；发货页 `order/ship` 仅支持「单次部分发货、单个快递」，无法表达「同一订单拆分到多仓库、生成多个 fulfillment」。
- **本设计目标**：
  1. 新增 admin API：预留单查询（列表/详情）+ 操作（备货拆分、核销、释放、对账）。
  2. web-admin 发货页支持**多仓拆分**：一个订单按仓库拆分发货，每个拆分生成独立 fulfillment（方法/运单各自独立）。
  3. 拆分操作内嵌于发货流程（用户确认「拆分入口在发货时」），预留单作为发货分配的支撑单据被自动驱动。

## 2. 已确认决策

1. **能力**：预留单 admin API 提供「完整 CRUD + 操作闭环」（用户选择）——列表、详情、按仓库拆分（allocate）、核销（fulfill）、释放（release）、对账（reconcile protégé）。
2. **拆分入口**：在**订单发货流程**内（用户选择）。用户对订单行做「按仓库拆分 → 各仓分别生成 fulfillment」。
3. **驱动关系**：预留单是发货拆分的底层支撑；web-admin 拆分发货时读取预留单分配结果，校验守恒，并据此生成多 fulfillment。
4. **不破坏**：单仓/未启用多仓的订单走现有发货路径；预留单引擎既有事件接线保持兼容。

## 3. 架构与组件

```
web-admin 发货页 (order/ship 增强)
   │  ordersByWarehouse(): 每个仓库一份 [{orderLineId, qty, method, tracking}]
   ▼
admin-api: shipByWarehouse(orderId, shipments[])   ← 新增 mutation
   │  每个 shipment 独立调用 core createFulfillment（不同 stockLocation 上下文）
   ▼
StockReservationService:
   - onAllocation 已建预留单（下单时自动）
   - 新 admin 接口直接读写预留单：allocate/fulfill/release/reconcileScan
   ▼
StockMovementEvent 托盘（现状保留，衔接 SALE 核销）
```

**核心新增组件**：

### 3.1 admin 接口（ReservationAdminResolver / 复用 stock-doc.admin.resolver 模式）
| GraphQL | 说明 |
|---|---|
| `reservations(filters): ReservationList!` | 预留单列表（按状态/变体/订单/渠道过滤，分页） |
| `reservation(id): Reservation!` | 预留单详情（含 items：仓库、状态、数量） |
| `allocateReservation(id, splits[]): Reservation!` | 按仓库拆分（守恒+物理 onHand 校验，复用引擎 `allocate`） |
| `fulfillReservationItem(id, qty?): ReservationItem!` | 核销单个明细（复用引擎 `fulfill`） |
| `releaseReservation(id): Reservation!` | 释放（复用引擎 `release`，返回物理回补参数） |
| `reservationReconcile: [ReconcileRow!]!` | 对账恒等式逐变体（复用 `reconcileScan`） |

**输出类型按库存插件稳定规则**：独立命名 + 定义在本插件 SDL 内（参考 `StockDocLedgerEntry/List` 的成功经验），避免跨插件重名崩溃。

### 3.2 web-admin 发货拆分（order/ship 增强）
- 现有 `partialShip(orderId, parts, method, tracking)` → 新增 `shipByWarehouse(orderId, shipments[], options?)`。
- `shipments` = `[{ stockLocationId, lines: [{orderLineId, qty}], method, tracking }]`。
- 后端对每个 shipment 在其 `stockLocationId` 上下文触发 `createFulfillment`，累计校验行数量 ≈ 预留单各仓分配量。
- 前端发货页：订单行可按仓库拆分（行选择 + 仓库分配），未指定仓库的行回退单仓旧路径。

## 4. 数据流与服务逻辑

### 4.1 下单 → 预留（现状，不改）
`onAllocation` 按订单行聚合建预留单头 + 按配送方式生成拆分（`SHIP`/`CLICK_COLLECT`）。

### 4.2 web-admin 拆分发货（新增）
1. 进入发货页，加载订单行 + 该单预留单分配（按仓库分组待发数量）。
2. 运营把每行可发数量分配到各仓库（默认按预留分配回填，可调）。
3. 提交 → `shipByWarehouse` → 各 shipment 生成独立 fulfillment → `SALE` 事件落到对应 `stockLocationId` → 预留单明细自动核销（`onSale` 现状接线）。

### 4.3 释放/对账（新增 admin 入口）
释放复用引擎 `release`（默认 `returnPhysical:false`，core 取消链路已回补）；对账暴露 `reservationReconcile` 补上首版 E2E 留白的 DB 佐证能力。

## 5. 错误处理

- 拆分守恒校验失败（Σ拆分 ≠ 预占）→ 抛 `UserInputError`（复用引擎语义）。
- 单仓物理库存不足 → 报错并指出仓库/可发数（复用引擎 `allocate` 校验）。
- 重复释放/已完结 → 幂等返回（引擎现有 `RELEASED/DONE` guard）。
- `createFulfillment` 中途某仓失败 → 事务回滚，无部分生成（逐仓在独立调用，失败前仓已生效——**需在 createFulfillment 复用单仓事务能力或整体包一层事务**，见 §7 风险）。

## 6. 测试与交付

- **单测**：reservation admin resolver 各接口调用服务、守恒/不足校验、释放幂等。
- **集成**：下单自动建预留单 → 拆分发货多 fulfillment → 各仓 SALE → 明细核销 → 释放/对账结果正确。
- **E2E 端到端**：web-admin 拆分销（390×844 手机截图）+ admin-api 回归（补上首版留白的对账恒等式）。
- **手册**：新增「多仓拆分发货」章节 + 手机截图。

## 7. 风险与边界（YAGNI）

- **事务原子性**：多仓多 fulfillment 生成的原子性——需确认 `createFulfillment` 是否可逐仓独立提交 vs 需整体事务。若无法整体事务，采用「逐仓立即生效 + 失败提示 + 预留单状态可查」策略（保留中间态可追溯）。
- **不新增**：改期预留、跨仓自动凑货、盘点联动（不在本次范围）。
- **兼容**：单仓订单/未开物理仓订单完全走旧路径，无行为改变。