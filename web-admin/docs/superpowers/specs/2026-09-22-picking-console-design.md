# 配货台（拣货批次）设计

日期：2026-09-22
页面：`https://e.joho.cn/guanli/#/pages/order/ship/index`（现状单订单发货页）
状态：设计已确认（含 §13 库位补充），待转实施计划

---

## 1. 背景与目标

### 1.1 用户原话

> 发货环节要支持目标发货仓选择 + 快速配货，填写客户地址，打印发货单，按地址小区拼单连在一起。
> 目的：快速找商品、配货、发货。

### 1.2 现状

- [index.vue](../../src/pages/order/ship/index.vue)：**单订单**发货（`onLoad` 只接 `id`）。仓库选项由订单行的**预留明细**反推（`whOptionsFor`），不是全局仓库列表；提交时按仓聚合走 `shipByWarehouse`，无预留则走 `partialShip`。
- [order.ts](../../src/apis/order.ts)：`fetchOrderDetail` 的 fragment 已含 `shippingAddress` / `lines.productVariant` / `fulfillments` / `customFields`；`partialShip` 调 `addFulfillmentToOrder`；`shipByWarehouse` 按仓循环。
- 入口上游：[detail/index.vue](../../src/pages/order/detail/index.vue) 的 `canShip`（`PaymentAuthorized` / `WaitingForShipping`）+ `goShip()`。

### 1.3 缺口（本次要补的）

| 缺口 | 现状 |
|---|---|
| 打印 | **完全没有**。无 `window.print` / 发货单 / 小票；仅 `src/utils/csv.ts` 用 Blob + `<a download>` 导 CSV 可参考 |
| 多订单入口 | 无。发货页只认单个 `id` |
| 地址编辑 | 无组件、无 admin 接口（`setOrderShippingAddress` **只存在于 shop-api 且只作用于活动订单**） |
| 区/小区字段 | 订单地址里没有。下单时 `AddressForm.vue` 只写 `province / city / streetLine1 / streetLine2`，高德级联选出的 `district`、`street` **没落到订单上**；Vendure `Address` 类型本身也无「区」「小区」字段 |
| 货位/库位 | **系统里不存在**。只有仓库 `stockLocation`，所以拣货单只能到「商品 × 数量」，做不到「A区3排2层」 |
| 就近选仓 | 无。但仓库 customFields 已有 `serviceCities / lat / lng / code` 未被使用；`haversineKm()` 已存在 |

### 1.4 目标

把「单订单发货」升级为**配货台**：按目标发货仓聚合，仓管手动把若干待发货订单拼成「拣货批次」，一次拣货、一次打印、批量发货；拣货批次持久化，支持断点续做与多人分工。

---

## 2. 已定决策（8 条，均已与用户逐条确认）

1. **拼单产物 = 分单发货，仅拣货/打印合并**。同批次内每单仍是独立 fulfillment + 独立运单号；不合并包裹、不合并运单。**不动 fulfillment / 运单模型**。
2. **同小区靠后台人工分组**，不做自动聚合。系统只负责「按地址排序好」+「支持手动拼组」。
3. **分组持久化为「拣货批次」**（波次拣货），不是当次会话临时分组，也不是 localStorage。
4. **打印走浏览器打印 HTML**：`window.print()` 调起系统打印，同一份 HTML 用 `@page` 适配 A4 与 100×150 热敏。零第三方依赖。
5. **发货环节可直接改订单收货地址**，保存即写回 Vendure 订单 `shippingAddress`，并保留原地址供对照。
6. **目标发货仓 = 就近自动推荐 + 可手动改**。用仓库 `serviceCities / lat / lng` 推导。
7. **新建「配货台」+ 保留单订单发货页**。两处复用同一套发货表单与打印组件。
8. **四类单据全要**：拣货单（按批次汇总）、发货单/装箱单（按订单）、包裹标签、批次总览单。

---

## 3. 非目标（明确不做）

- 不合并包裹、不合并运单号（决策 1）。
- **改地址不重算运费**：只写 `OrderAddress`，不碰 shipping line。仓管只是修正门牌，不应触发运费变更。
- 不引入货位/库位体系（系统无此概念）。
- 不做自动地理编码选仓的完整方案；v1 以 `serviceCities` 文本命中为主（见 §7）。
- 不做热敏打印机直连（ESC/POS）。
- 不做 PDF 导出。

---

## 4. 数据模型

新增两张表，落在 `D:\zhao\vendure\packages\cjk-plugin`。生产 postgres 走 `synchronize: true`，**新表开机自动建，无需手写 migration**。

### 4.1 `pick_batch`（拣货批次）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | Vendure 标准 ID |
| `code` | varchar，唯一 | 批次号，格式 `PB20260922-001`（日期 + 当日 3 位序号） |
| `stockLocationId` | varchar | 目标发货仓 ID |
| `state` | varchar | 见 §5 状态机 |
| `note` | varchar，可空 | 备注 |
| `createdBy` | varchar，可空 | 创建人，优先取 `TenantMember.displayName` |
| `pickedAt` | datetime，可空 | 进入 PICKED 的时间 |
| `printedAt` | datetime，可空 | 进入 PRINTED 的时间 |
| `shippedAt` | datetime，可空 | 进入 SHIPPED 的时间 |
| `createdAt` / `updatedAt` | datetime | Vendure 内置（`VendureEntity`） |

### 4.2 `pick_batch_order`（批次成员）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | |
| `batchId` | FK → `pick_batch`，级联删除 | |
| `orderId` | varchar | Vendure Order id |
| `addedAt` | datetime | |
| 唯一约束 | `(batchId, orderId)` | 同批次不重复加同一单 |

### 4.3 服务层跨表约束

**同一订单不得同时存在于两个非终态批次中**（终态 = `SHIPPED` / `CANCELLED`）。数据库层拦不住，放在 service 里校验，命中时拒绝并返回明确原因（含冲突批次号）。

### 4.4 参考实现模式

同目录既有 `stock-reservation.entity.ts` + `stock-reservation-item.entity.ts` 是「主表 + 子项表」的现成范式，照它写。

---

## 5. 状态机

```
PENDING(待拣) ──→ PICKED(已拣) ──→ PRINTED(已打印) ──→ SHIPPED(已发货)
     └──────────────┴──────────────┴──→ CANCELLED(已取消)
```

| 状态 | 含义 | 可迁移到 |
|---|---|---|
| `PENDING` | 批次已建，未开始拣货 | `PICKED`、`CANCELLED` |
| `PICKED` | 货已拣齐 | `PRINTED`、`CANCELLED` |
| `PRINTED` | 单据已打印，待发货 | `SHIPPED`、`CANCELLED` |
| `SHIPPED` | **终态**。批次内全部订单都成功生成发货单后才置位 | — |
| `CANCELLED` | **终态**。成员订单释放回待发货池 | — |

**关键规则**：`shipPickBatch` 若部分订单失败，**不置 `SHIPPED`**，保持 `PRINTED`，并返回 `{ succeeded: [], failed: [{ orderId, code, reason }] }`。

状态迁移一律经 `advancePickBatchState`，服务端做合法性校验，非法迁移返回明确原因。

---

## 6. 后端接口（cjk-plugin）

### 6.1 硬规则提醒

`adminApiExtensions` 与 `shopApiExtensions` 是**两套独立 SDL + resolvers 数组**，新增查询/字段必须**双注册**，否则另一侧静默不可用。web-admin 走 `/admin-api`，C 端走 `/shop-api`。

### 6.2 查询（4 个）

| 名称 | 入参 | 返回 |
|---|---|---|
| `pickBatches` | `options`（分页 + 状态/仓筛选） | 列表：`id / code / state / stockLocationId / memberCount / itemCount / createdBy / createdAt` |
| `pickBatch` | `id` | 详情：批次字段 + `members[]`（订单快照：单号 / 收件人 / 电话 / 完整地址 / 商品行 / 推荐仓 / 距离） |
| `pickBatchCandidates` | `options`（默认 `PaymentAuthorized` + `WaitingForShipping`） | 待发货候选订单：订单快照 + `recommendedStockLocationId` + `distanceKm` + `inBatchId`（已在某批次中则回填） |
| `pickBatchPickingList` | `id` | 按 SKU 汇总：`[{ sku, name, qty, orderCodes[] }]` |

### 6.3 变更（7 + 1 个）

| 名称 | 说明 |
|---|---|
| `createPickBatch(input)` | `{ stockLocationId, orderIds[], note? }` → 建批次 + 写成员，校验 §4.3 与 §8.1 |
| `addOrdersToPickBatch(batchId, orderIds[])` | 同上校验；仅 `PENDING` / `PICKED` 可加 |
| `removeOrdersFromPickBatch(batchId, orderIds[])` | 仅 `PENDING` / `PICKED` 可移除 |
| `updatePickBatch(batchId, input)` | 改 `stockLocationId` / `note`；**改仓需重校验全部成员的预留**，失败则整体拒绝 |
| `advancePickBatchState(batchId, to)` | 状态机校验 + 写对应时间戳 |
| `cancelPickBatch(batchId)` | 置 `CANCELLED`，成员释放 |
| `shipPickBatch(batchId, input)` | `{ method, trackingCode? }` → 逐单 `addFulfillmentToOrder`，返回成功/失败两份清单 |
| `updateOrderShippingAddress(orderId, input)` | **本次新增的缺口**。直接更新订单的 `OrderAddress` 行（`fullName / phoneNumber / province / city / streetLine1 / streetLine2 / postalCode / countryCode`）。**不重算运费** |

### 6.4 编译产物硬规则

`packages/cjk-plugin/package.json` 的 `main` = `lib/index.js`，dev-server 的 tsconfig **没有** `@vendure/*` 别名 → **改 `src` 不 build 不生效**。流程必须是：改 `src` → `npm run build`（`rimraf lib && tsc -p tsconfig.build.json`）→ 提交 `src` + `lib`（`lib/` 是 git 跟踪产物）。

### 6.5 本地起服要两个进程

`npm run dev:server` **不含 job worker**，必须另开终端 `npm run dev:worker`，否则任务队列永远 `PENDING`。

### 6.6 schema 快照

`nshop/vshop` 的 `graphql.schema.json` 是**滞后快照（gitignored）**。部署序：**先在服务器部署后端 → 再 `node tmp-refresh-schema.mjs` 从生产 shop-api 重拉 introspection**。后端未部署时要本地验证，用 `nshop/scripts/_patch_schema_*.mjs` 套路给快照打补丁（注意 `nuxi prepare` 不会自动重拉快照）。

---

## 7. 就近选仓算法

复用 `D:\zhao\vendure\packages\cjk-plugin\src\inventory\mirror-math.ts` 里已有的 `haversineKm(lat1, lng1, lat2, lng2)`，**不新写距离算法**。

按优先级：

1. 订单收货地址能拿到坐标（订单地址或关联客户地址上有坐标）→ 在 `serviceCities` **命中该订单 city** 的仓里，取 `haversineKm` 最小者，返回 `distanceKm`。
2. 无坐标但 `serviceCities` 文本命中订单 `city` → 取命中的第一个启用仓，`distanceKm` 返回 `null`（**不要伪造距离**）。
3. 都不命中 → `recommendedStockLocationId = null`，前端提示「请手动选择目标仓」。

**不做**自动地理编码（避免依赖地图配额与网络）。后续若需增强，走 cjk-plugin 既有 `map` 模块（`map.service.ts` + 腾讯/百度 provider）。

---

## 8. 前端设计

### 8.1 页面

| 路径 | 说明 |
|---|---|
| `src/pages/order/picking/index.vue` | **配货台**。三个 Tab：`待发货 12` / `进行中 2` / `已完成`。待发货 Tab = 候选订单列表（按收货地址排序、带就近仓推荐、可勾选）；底部固定条 = `已选 N 单 / M 件` + `新建批次`。进行中/已完成 Tab = 批次卡片列表 |
| `src/pages/order/picking/batch.vue` | **批次详情**。批次信息（code / 目标仓 / 成员数 / 创建人 / 状态）+ 4 个打印入口 + 成员订单列表（含「改地址」入口）+ 底部 `批量发货` |

两页都需在 `pages.json` 注册。

### 8.2 组件（新建 `src/components/picking/`）

| 组件 | 职责 |
|---|---|
| `PickBatchCard.vue` | 批次卡片：code / 仓 / 状态 / 单数 / 件数 / 进入详情 |
| `CandidateOrderRow.vue` | 候选订单行：勾选框 + 单号 + 收件人 + 完整地址 + 推荐仓（含距离）+ 「已在批次」标记 |
| `BatchMemberRow.vue` | 批次成员行：勾选 + 单号 + 收件人 + 商品摘要 + 「改地址」 |
| `WarehousePicker.vue` | 目标仓选择：默认就近推荐、可手动改 |
| `AddressEditSheet.vue` | 地址编辑抽屉：省/市/区/详细地址/电话 + 原地址只读对照 |
| `RegionPicker.vue` | 省/市/区级联。**抽取自** [pickup/edit/index.vue](../../src/pages/pickup/edit/index.vue#L34-L41) 既有的三段 `picker` 实现（`provinceNames / cityNames / districtNames`），不新造 |

### 8.3 复用与改造

- 现有 [ship/index.vue](../../src/pages/order/ship/index.vue) **保留**，作为订单详情跳进来的单订单快捷发货。
- 发货表单与打印组件由两页共用：把 `ship/index.vue` 的「按仓聚合 parts + 提交」逻辑抽到 `src/composables/useShipSubmit.ts`，两页共用。
- 批量交互范式照抄 [inventory/stock/index.vue](../../src/pages/inventory/stock/index.vue)：`selected: Record<string, boolean>` 存勾选 + `checkedRows` 计算 + `checkedRows.length > 0` 渲染批量条。

### 8.4 打印子系统（新建 `src/utils/print/`）

| 文件 | 职责 |
|---|---|
| `print-window.ts` | 建隐藏 `iframe` → 写入完整 HTML（含内联 CSS）→ `onload` 后 `contentWindow.focus(); contentWindow.print()` → 打印后移除 iframe。**不用 `window.open`**（移动端易被拦截）。提供「打开新窗口」兜底入口 |
| `templates/picking-list.ts` | 拣货单：A4 纵向，按 SKU 汇总 + 涉及订单号 + 拣货人签字栏 |
| `templates/shipping-note.ts` | 发货单/装箱单：A4 纵向，按订单，收件人 / 完整地址 / 电话 / 商品明细 / 合计 |
| `templates/parcel-label.ts` | 包裹标签：100×150 热敏，大号订单号 + 收件人 + **小区名** + 电话 + 仓 |
| `templates/batch-overview.ts` | 批次总览单：A4 横向，订单号 / 收件人 / 小区 / 件数 + 拣货人与复核人签字栏 |
| `print.css.ts` | 内联样式常量，含 `@page { size: A4; margin: 12mm }` 与 `@page { size: 100mm 150mm; margin: 4mm }` |

四个模板都是**纯函数**：入参为已组装好的数据，返回 HTML 字符串。便于单测。

### 8.5 i18n（硬规则）

所有前端固定文案走 i18n 字典（`src/locale/zh-CN.json` / `en.json` 同步补词条），命名空间 `orderAdmin.picking.*`，照现有 `orderAdmin.ship.*` 的写法。**禁止只在单一语言写死文字**。

---

## 9. 错误处理与边界

| 场景 | 处理 |
|---|---|
| 订单在该仓无预留 | 拒绝加入批次，返回原因「订单 #A1023 在杭州仓无可用预留」 |
| 订单已在另一非终态批次 | 拒绝，返回冲突批次号 |
| 批次内部分订单发货失败 | 不置 `SHIPPED`，保持 `PRINTED`，返回失败清单，前端逐条展示 |
| 候选列表为空 | 空态文案 + 「去订单列表看看」入口 |
| 就近推荐仓为 `null` | 显示「请手动选择目标仓」，不伪造距离 |
| 改地址失败 | 保留表单输入，toast 展示后端原因，不静默 |
| 打印被浏览器拦截 | 兜底「打开新窗口」，并把单据 HTML 暂存到本地，可重试 |
| 批次已 `SHIPPED` / `CANCELLED` | 详情页只读，隐藏加单/移除/发货按钮 |

---

## 10. 测试与交付（硬规则）

### 10.1 自动化

- **后端单测**：`pickBatch` 服务层状态机迁移（合法/非法各一组）、跨批次唯一约束、就近选仓三种分支（有坐标 / 无坐标命中 / 不命中）、拣货单按 SKU 汇总正确性。参照既有 `*.spec.ts` 风格。
- **前端单测**：`src/utils/print/templates/*` 四个纯函数模板的快照断言。
- **只读探针**：写 `scripts/_smoke_picking_live.py`，只读方式核对生产页面健康状态（照 `_smoke_plan12_live.py` 套路）。

### 10.2 交付物

功能交付 = **实现 + API/e2e 回归 + 手机截图 + 操作手册**。

- **手机视口截图**：标准视口 **390×844，dpr=2（780×1688）**，Playwright 移动视口。至少覆盖：配货台待发货 Tab、配货台进行中 Tab、批次详情、地址编辑抽屉、四种单据打印预览。
- **操作手册**：更新 `docs/inventory-admin-manual/`（现有手册，第 13 章为库存页、第 14 章为订单列表），新增「配货台」章节，含截图。

### 10.3 部署（铁律）

**本地构建**，服务器只做解压 / `pm2 restart`，**绝不在服务器构建**。
- 后端（vendure 仓库）：git pull + `pm2 restart`。
- 前端（vshop/web-admin）：走 `scripts/deploy.mjs`（scp 产物 → 服务器解压/拷入）。
- 部署序：**先后端，再刷 schema 快照，最后前端**。

---

## 11. 实施顺序（建议）

1. 后端：两张实体表 + service（状态机、约束、就近选仓、拣货汇总）+ admin-api 双注册 + `updateOrderShippingAddress` → build → 单测。
2. 后端：库位三表（`storage_zone` / `storage_bin` / `variant_storage_bin`）+ 标准模板生成 + 库位 service + 接口 + `StockDocItemInput.binId` 归位 → build → 单测。
3. 后端部署到服务器 → 重拉 `graphql.schema.json` 快照。
4. 前端：`src/apis/picking.ts` + `src/apis/storage-bin.ts`（新接口调用）+ 配货台列表页。
5. 前端：批次详情页 + 地址编辑（`RegionPicker` 抽取）。
6. 前端：库位管理页 + `BinPicker` + 采购入库页库位归位改造。
7. 前端：打印子系统（4 个模板 + `print-window.ts`），拣货单含库位列与库区分组。
8. 单订单发货页改造：抽出 `useShipSubmit.ts` 共用。
9. i18n 双语词条补齐（含 `inventoryBin.*`）。
10. 手机截图 + 操作手册 + 只读探针 + 部署。

---

## 12. 待用户复核的两个小项

1. 批次号格式 `PB20260922-001`（日期 + 当日 3 位序号，无新序列服务）。
2. 就近选仓 v1 **不做**自动地理编码，以 `serviceCities` 文本命中为主；拿不到坐标时距离显示为空而非估算值。

---

## 13. 库位（货位）体系补充（2026-09-22 追加）

> 用户追加要求：「采购入库环节给商品增加库位，中小型仓库标准设置，拣货显示库位区域」。

### 13.1 定位与边界（关键决策）

**库位只做「路径指路 + 入库归位」，不做「库位级库存账」。**

| 项 | 决策 | 理由 |
|---|---|---|
| 库存粒度 | **仍为「变体 × 仓库」**，`StockLevel` 不变 | Vendure core 的 `StockLevel` 只有 `productVariantId + stockLocationId` 两维，加第三维要改 core 或自建镜像账，风险与工作量不成比例 |
| 库位用途 | ① 采购入库时把 SKU 归位到库位；② 拣货单按库位排序出拣货路径 | 这正是「快速找商品」的诉求 |
| 库位数量 | 一个 SKU 在一个仓**有且仅有一个默认库位** | 中小仓场景；多库位会增加拣货歧义 |
| 是否强制 | **不强制**。未分配库位的 SKU 照常入库/拣货 | 避免历史数据与新商品被卡住 |
| 编码生成 | 服务端按「库区字母-货架号-层号」生成，前端不可乱填 | 保证编码可排序 = 可直接当拣货路径 |
| **档位开关** | **三档可选：`off` / `zone` / `bin`**，默认 `off` | 小客户不必面对空库位体系；zone→bin 可渐进升级且零迁移（见 §13.10） |

### 13.2 数据模型（新增 3 张表）

> **三档共用同一套表结构**：档位只决定「是否展示库位列」，不建新表、不迁数据。后端**始终建这三张表**（`synchronize:true` 零成本）；「关闭」仅降级消费端展示，若关闭时不建表，将来开启反而要迁移，得不偿失。

落在 `D:\zhao\vendure\packages\cjk-plugin`。生产 postgres 走 `synchronize:true` → 开机自动建表；同时按既有 `StockTableMigration` 幂等建表范式在 migration 里补一份（本地 sqlite 需要）。

#### `storage_zone`（库区）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | |
| `tenantChannelId` | varchar | 归属租户渠道（scoping） |
| `stockLocationId` | integer | 所属仓库 |
| `code` | varchar | 库区字母，如 `A` |
| `name` | varchar | 库区名称，如「常温存储区」 |
| `sortOrder` | integer | 拣货顺序（A→B→C→D） |
| `enabled` | boolean | 默认 true |
| 唯一约束 | `(tenantChannelId, stockLocationId, code)` | |

#### `storage_bin`（库位）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | |
| `tenantChannelId` | varchar | |
| `stockLocationId` | integer | 所属仓库（冗余，便于按仓直查） |
| `zoneId` | integer | FK → `storage_zone` |
| `code` | varchar | 完整库位编码，如 `A-01-03` |
| `rowNo` | integer | 货架号（用于排序，避免字符串排序踩 `A-10 < A-2`） |
| `levelNo` | integer | 层号 |
| `enabled` | boolean | 默认 true |
| 唯一约束 | `(tenantChannelId, stockLocationId, code)` | |

> **排序必须用 `zone.sortOrder, rowNo, levelNo` 三元组**，不能用 `code` 字符串排序。

#### `variant_storage_bin`（SKU–库位绑定，三档共用）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | |
| `tenantChannelId` | varchar | |
| `variantId` | integer | 变体 |
| `stockLocationId` | integer | 仓库 |
| `zoneId` | integer | FK → `storage_zone`，**必填** |
| `binId` | integer，**可空** | FK → `storage_bin`。**`bin` 档必填，`zone` 档恒为 null** —— 这是三档共表的接缝 |
| `isDefault` | boolean | 入库首次绑定时为 true |
| `updatedAt` | datetime | |
| 唯一约束 | `(tenantChannelId, variantId, stockLocationId)` | 一个 SKU 一仓一个默认库位 |

> **`zoneId` 必填 + `binId` 可空**是三档方案能「零新表、零迁移」的关键：`zone` 档只写 `zoneId`，升级到 `bin` 档时仅补 `binId`，行不新增、表不改结构。

### 13.3 中小型仓库标准库位模板

`STANDARD_WAREHOUSE_ZONES` 常量（服务层与前端共享同一份定义）：

| 库区 | 名称 | 货架 × 层 | 库位数 |
|---|---|---|---|
| A | 常温存储区 | 2 × 5 | 10 |
| B | 冷藏区 | 1 × 3 | 3 |
| C | 大件区 | 1 × 3 | 3 |
| D | 收货暂存区 | 1 × 2 | 2 |
| **合计** | | | **18** |

- `generateStandardBins(stockLocationId)` mutation **幂等**：已存在编码跳过，可重复点击补齐缺失项。
- 生成后库区/库位均可手改增删，模板只是起手式。

### 13.4 后端接口（新增，双注册）

| 名称 | 类型 | 说明 |
|---|---|---|
| `storageZones(stockLocationId)` | Query | 该仓库库区列表（含库位数） |
| `storageBins(stockLocationId, zoneId?, keyword?)` | Query | 库位列表（含每家 SKU 数、是否被占用） |
| `variantBin(variantId, stockLocationId)` | Query | 某 SKU 在某仓的库位（无则 null） |
| `createStorageZone(input)` / `updateStorageZone(input)` / `deleteStorageZone(id)` | Mutation | 公有库区增删改 |
| `createStorageBin(input)` / `updateStorageBin(input)` / `deleteStorageBin(id)` | Mutation | 库位增删改（删除前校验无 SKU 绑定） |
| `generateStandardBins(stockLocationId)` | Mutation | 一键生成 18 个标准库位（幂等） |
| `bindVariantToBin(variantId, stockLocationId, binId)` | Mutation | 建/改 SKU–库位绑定 |
| `unbindVariantFromBin(variantId, stockLocationId)` | Mutation | 解绑 |

**双注册硬规则**：`adminApiExtensions` 与 `shopApiExtensions` 是两套独立 SDL + resolvers 数组，本套接口 web-admin 走 `/admin-api`，**只需注册 admin 侧**；但为遵守既有约定（cjk-plugin 新查询两侧都写），`variantBin` 这类 C 端可能用到的查询在两侧都注册，写操作仅 admin。实施时必须逐条确认注册位置。

### 13.5 入库归位改造

`StockDocItemInput` 增加 `binId?: ID`（可选）：

- 采购入库（`PURCHASE`）时若传 `binId` → 落库后写/更新 `variant_storage_bin`（该仓首次绑定设 `isDefault=true`）。
- 不传 `binId` → 与现状完全一致（向后兼容），但**若该 SKU 在该仓已有库位，返回的 `StockDoc` 里带 `binsHint`**，前端可提示「建议归位到 A-01-03」。
- `binId` 必须属于该 `toStockLocationId` 仓，否则 `UserInputError`。

### 13.6 拣货单显示库位区域

`pickBatchPickingList` 返回行增加：

| 字段 | 说明 |
|---|---|
| `binCode` | 库位编码，如 `A-01-03`；无绑定 = `null` |
| `zoneCode` / `zoneName` | 库区，用于分组表头 |
| `pathIndex` | 排序序号（`zone.sortOrder, rowNo, levelNo` 归一后的连续序号） |

- **排序**：`pathIndex` 升序；无库位的行 `pathIndex = 9999` 置底。
- **拣货单版式**：按库区分组，组头显示「A · 常温存储区」；未分配库位的行标黄并置底，提示「需先入库归位再拣」。

### 13.7 前端页面

| 路径 | 说明 |
|---|---|
| `src/pages/inventory/bins/index.vue` | **库位管理**。选仓 → 「生成标准库位」按钮 → 按库区分组的库位网格（显示编码 + 已绑 SKU 数）→ 库区/库位增删改 |
| `src/pages/inventory/stock-doc/purchase/index.vue`（改造） | 增加「入库库位」选择器；选定商品+仓后自动带出该 SKU 现库位并高亮提示 |
| `src/components/picking/BinPicker.vue` | 库位级联选择（库区 → 库位），供入库页与绑定页共用 |

### 13.8 i18n 新增命名空间

`inventoryBin.*`（库位管理页）与 `orderAdmin.picking.bin.*`（拣货单库位列），双语同步。

### 13.9 三档开关设计（`binMode`，2026-09-22 定稿）

**三档**：`off`（关闭，现状）→ `zone`（只用库区）→ `bin`（完整库位）。**默认 `off`**，对现网零行为变更。

#### 开关落点

存于 **`Channel.customFields.binMode`**（nullable 文本，取值 `off` / `zone` / `bin`，缺省按 `off`），与既有 `redeemCollectMode` 同一套路，**不新建表**。后台在「店铺/渠道设置」里以单选形式配置。

#### 门控规则（唯一防线）

前端**唯一**判定入口：`src/composables/useBinMode.ts`，导出 `mode` / `showZone` / `showBin`。**所有消费点必须经它判断，禁止各处硬写 if** —— 这是避免「半开状态」（关了库位但拣货单还留空列）的唯一防线。

| 消费点 | `off` | `zone` | `bin` |
|---|---|---|---|
| 拣货单 | 不出现库位列与分组 | 按库区分组，表头显示区名，**不显示库位编码** | 库位编码列 + 按库区分组，编码升序 = 拣货路径 |
| 库位管理页 | 菜单隐藏 | 只维护库区，隐藏库位网格 | 库区 + 标准库位网格（18 个） |
| 采购入库页 | 不显示库位选择器（与现状一致） | 只选库区，写 `zoneId`（`binId = null`） | 选到具体库位，写 `zoneId + binId` |
| 包裹标签 | 不显示库位 | 显示库区 | 显示完整库位编码 |
| 候选订单/批次详情 | 无库位信息 | 显示库区 | 显示库位编码 |

#### 排序键（三档统一）

统一为 `(zone.sortOrder, rowNo || 0, levelNo || 0)`，无绑定的行 `pathIndex = 9999` 置底。`zone` 档下 `rowNo / levelNo` 恒为 0，排序天然退化为「按库区顺序」，**无需分支代码**。

#### 切换语义

- **切换档位不删数据**。`off` 只是隐藏，`zone` 已写的绑定仍保留 `binId` 供升级。
- `zone → bin` 升级：仅需给已有绑定补 `binId`（在库位管理页点选），或下次入库时归位。
- `bin → zone` 降级：`binId` 保留不清，展示层忽略。

#### 测试范围（不交叉组合）

只跑 3 条主路径：`off` / `zone` / `bin` 各走一遍「入库归位 → 建批次 → 拣货单 → 发货」全流程。不做 3 档 × 5 消费点的交叉矩阵。

### 13.10 非目标（本次不做）

- 不做库位级库存数量（只做绑定，不记量）。
- 不做一次入库拆分到多个库位（一条入库明细 = 一个库位）。
- 不做库位容量/体积/重量上限。
- 不做移动端扫码定位库位（本次只做人工选择）。
- 不做「按 SKU 自动推荐库位」（本次只做「带出现有库位」提示）。
