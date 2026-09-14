# 物流配送与真实配送记录 设计文档（方案 2-B）

> **方案标识：方案 2 子项目 B（物流配送）**。方案2 拆 4 子项目按序设计：A 库存模型 → B 物流配送 → C 对账 → D 详情页展示。
> **存续：设计定稿，随方案2 各子项目一并存档，待多方案比选后统一执行（暂缓实施）。**

## 1. 目标与范围

为开启物理库存的租户建立**「每单销售 ↔ 一笔真实配送记录」**的硬约束与结构化数据：

- 新增独立 `DeliveryRecord` 实体承载配送/物流全生命周期（录单→运单→轨迹→签收/退回/异常）。
- 覆盖三种顾客交付模式：自营配送（self）、快递（express）、自提点取货（pickup）；另设履约内部链 `transfer`（仓→自提点配送）。
- 每条顾客配送记录关联发货扣减的物理仓（来自方案2-A），为对账（C）提供主档。

**未开启物理仓的租户完全走原流程**（既有 delivery-plugin/发货），不建 `DeliveryRecord`，零影响。

## 2. 已确认决策

1. 配送记录形态：**独立 `DeliveryRecord` 实体**（非 Fulfillment customFields 增强）。
2. 轨迹来源：**录入 + 状态流转，不接第三方 API**；预留轨迹上报接口，后续可平滑升级。
3. 配送粒度：**一条记录 = 一次发货**（一个 source 物理仓 → 收货地址/自提点）。一单可拆 N 条（多仓多包多物流），兼容既有 order-split/order-box。
4. 自提点与物理仓**解耦**：自提点（PickupLocation）是独立交付目的地概念，`stockType: 'own' | 'remote'` 区分门店自提（无需配送）与远程自提（需配送）。

## 3. `DeliveryRecord` 数据模型与状态机

**字段**：
- `orderId`（FK Order）、`fulfillmentId`（FK，可空）
- `sourceLocationId`（FK 物理仓，来自 A 的扣减仓；纯虚拟租户不启用）
- `mode`: `self | express | pickup | transfer`
- `expressCompany`、`trackingNo`（快递/transfer 承运）
- `staffId`、`staffName`（自营送货员快照）
- 收货快照：`receiverName`/`receiverPhone`/`receiverAddress`/`lat`/`lng`
- `pickupLocationId`（pickup 用）、`fromLocationId`/`toLocationId`（transfer 用）
- 时间戳：`createdAt`/`sentAt`/`deliveredAt`/`returnedAt`/`exceptionAt`
- `photos`（自营签收照片）、`remark`、`orderBoxId`（关联拆包）

**状态机**（枚举统一，映射既有 delivery-plugin 语义）：
```
self:    Draft → Assigned/Shipped → InProgress/InTransit → Delivered(拍照签收)
express: Draft → Shipped(有运单)  → InTransit            → Delivered(已签收)
pickup:  PickupPending(备货中) → PickupReady(已到店待取) → Completed(已取走)
transfer:TransferPending → InTransit → Arrived(自提点收货)
公共异常分支：任意态 → Exception / Returned
```

## 4. 生命周期与发货/库存衔接

**创建**：发货时按发货源生成——每个 `sourceLocationId` 一条；纯虚拟租户原流程不建。触发点：Fulfillment 创建/发货后，按订单行 `Allocation` 各 sourceLocationId 分组生成 N 条。

**模式判定**：发货时选 `express`（录物流公司+运单号）或 `self`（交既有 delivery-plugin 派单）；pickup 订单自动 `pickup` 模式。

**与 A 衔接**：
- 发货即 `SALE` 扣该记录 `sourceLocationId` 物理仓 → A 镜像同步虚拟。
- `Returned` 退回：按 A 售后回补回原仓。

**自提点（两种形态，已确认）**：
| stockType | 履约路径 | 配送记录 |
|---|---|---|
| `own` 门店自提（无需配送） | 顾客取件 → 扣自提点仓 onHand → 镜像 | 一条 `pickup`（取件即完成） |
| `remote` 远程自提（需配送） | 两段：仓→自提点（配送）+ 自提点→顾客（取件） | `transfer`（仓→自提点，Arrived 入自提点仓）+ `pickup`（顾客取件扣自提点仓） |

取件扣减统一在**自提点仓**；仓→自提点只是移库（onHand 主仓→自提点仓，虚拟总额不变，A 镜像按 Σ 绑定仓自然处理）。

**防漏单硬约束**：开启物理仓租户，顾客订单进入发货（Fulfillment transition）时每个发货源必须已有 `mode ∈ {self, express, pickup}` 记录，缺失阻塞/告警；`transfer` 不占顾客记录位。

**与既有系统**：delivery-plugin 自营派单保留，作为自营履约内部状态回写；order-split/order-box 按最新行归属建记录，`orderBoxId` 关联。

## 5. 对账衔接（供 C）

`DeliveryRecord` 提供按单/按仓/按配送状态多维度视图；与 A 账本（order:out / mirror / afterSales）按 `orderId`+`sourceLocationId` 对齐，形成「订单→发货仓→配送记录→账本流水」闭环。C 按此核对"每单销售是否有真实配送记录、扣减仓是否一致"。

## 6. 边界

- 未开启物理仓租户：原流程，零影响（已确认）。
- 纯虚拟变体（物理租户内未绑定物理仓的变体）发货：仍建一条记录（`sourceLocationId=null`，表示虚拟/店发），保证硬约束。
- transfer Arrived 入自提点仓触发 A 镜像重算，不直接扣顾客库存。
- 异常/退回：任一转 Exception/Returned，退回按 A 回补。

## 7. 测试与交付

- 状态机迁移单测（4 模式×非法迁移拒绝）；发货按 sourceLocationId 分组生成 N 条；transfer→Arrived 入仓触发镜像；防漏单阻塞。
- 集成：多仓一单→N 条；自营派单→签收；快递录单→签收；门店自提 own；远程自提 remote（transfer+pickup 两段）。
- 两端构建 + 部署 + GraphQL 冒烟 + 手机视口回归 + 操作手册 op-18。

## 8. 非目标（YAGNI，留待后续）

- 第三方物流轨迹 API 接入（预留接口）。
- 物流费用对账（运费结算单，可并入 C 或后续）。
- 跨境/海外物流。