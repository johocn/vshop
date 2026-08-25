# 订单处理 Web-Admin 增强 · 设计文档

日期：2026-08-25
状态：已批准（用户于 2026-08-25 确认「按这个方案写入 spec」）
范围：vshop 管理后台（web-admin）订单处理相关页面与 API 增强

---

## 1. 背景与目标

当前 web-admin 订单处理已有基本骨架：

- 订单列表：仅状态 Tab（全部/待发货/已发货/已完成）+ 前 20 条，无分页、无搜索
- 订单详情：只读展示顾客 / 收货 / 商品行，无金额明细、无操作按钮
- 发货：整单发货、配送方式写死为 `standard`
- 售后：仅只读列表，无详情、无商家处理动作

本次目标是把四个模块推进到「可日常使用」的完整度：**订单列表增强、订单详情增强、发货体验、售后退款闭环**。

### 关键前提（降低后端改动）

后端能力已相当成熟，本次**基本为 web-admin 前端工作**，后端仅需极少补补：

- 已有 `after-sales-plugin`，多租户/多渠道下卖家侧与买家侧 mutation 齐备：
  - 买家侧：`createAfterSalesRequest` / `cancelAfterSalesRequest` / `updateReturnTracking` / `myAfterSalesRequests` / `afterSalesRequest`
  - 卖家（商家/管理）侧：`approveAfterSalesRequest` / `rejectAfterSalesRequest` / `confirmReturnReceived` / `processAfterSalesRefund` / `retryAfterSalesRefund`
- 类型：`return_refund`（退货退款）/ `refund_only`（仅退款）/ `exchange`（换货）
- 状态机：`Pending → Approved → (Rejected) → Returning → Received → Refunded / RefundFailed → Closed`
- 发货 / 退款 / 取消复用 Vendure core：
  - 发货：`addFulfillmentToOrder(input: FulfillOrderInput!)`，handler 用 `manual-fulfillment`
  - 退款底层：core `orderService.refundOrder → paymentService.createRefund`
  - 取消：订单状态流转到 `Cancelled`（超时取消/防库存泄漏逻辑已在 cjk-plugin 处理）

> 因此后端新增量很小，重点在 web-admin 的 API 封装与页面。

---

## 2. 用户已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 订单列表中「本店 vs 平台转店」 | 上下文自动隔离 + 卡片「来源」标签（不做手动切换视图） |
| 列表是否显示配送方式 | 是，卡片显示主配送方式（多条 shippingLines 时取首条；默认站点聚合单多条时显示合并名） |
| 售后退款落地方式 | 后台闭环，不接支付网关（同意→创建退款单→状态完成，存金额/时间/快照） |
| 订单详情是否支持手动取消 | 支持（待发货阶段可取消） |
| 售后覆盖类型 | 退款（refund_only）+ 退货（return_refund）两类 |

---

## 3. 模块设计

### A · 订单列表（增强）

**页面**：`pages/order/list/index.vue`

- 状态 Tab：全部 / 待付款 / 待发货 / 已发货 / 已完成 / 已取消
- 列表：`take/skip` 分页，触底加载更多（`onReachBottom`），上拉刷新（`onPullDownRefresh`）
- 搜索：按订单号 `code`、顾客姓名/联系方式关键词过滤
- 卡片信息：
  - 订单号、状态徽标（中文 + 颜色）
  - 顾客（姓名·手机尾号）
  - 金额合计（`totalWithTax`）
  - 配送方式（`shippingLines[0].shippingMethod.name`，多条取合并名）
  - 来源标签：根据上下文与 `saleSource`/渠道推导，标注「本店」或「平台转店」
  - 下单时间

**API**：扩展 `apis/order.ts` 的 `fetchOrders`，补查 `shippingLines{ shippingMethod{ name } }`、`createdAt`；新增搜索参数；新增来源字段。

数据隔离：沿用现有 `orders()`（Vendure 按当前 `ctx.channelId` 过滤），切换店铺即自动隔离，无需新增 query。

### B · 订单详情（增强）

**页面**：`pages/order/detail/index.vue`

- 基本信息卡片：订单号、总金额、状态流转时间轴（或当前状态中文）
- 收货信息：收货人、电话、详细地址
- 金额明细：商品小计（`subTotalWithTax`）、运费（`shippingWithTax`）、优惠、合计
- 商品明细：每个行项目含商品名、规格、SKU（`productVariant.sku`）、数量、单价、小计
- 支付信息：付款方式、交易单号、支付时间（`payments`）
- 配送/物流：配送方式、包裹（`fulfillments`）与运单号、发货时间
- 操作按钮（随状态显示）：
  - `WaitingForShipping`：「去发货」「取消订单」
  - `Delivered` / 其它：「查看/发起售后」入口

**API**：扩展 `apis/order.ts` 的 `fetchOrderDetail`，补查金额、支付、fulfillments。

**取消订单**：调用订单状态流转至 `Cancelled`（复用 cjk-plugin 防库存泄漏逻辑），取消后刷新状态。

### C · 发货（按行选品 / 部分发货）

**页面**：`pages/order/ship/index.vue`

- 按行勾选 + 输入每个商品行的发货数量（部分发货）
- 快递公司下拉：选项来自配送方式后台（shipping method 名称）
- 运单号（选填）
- 提交：对被勾选行调 `addFulfillmentToOrder(manual-fulfillment, method, trackingCode)`
- 支持多次发货 → 每次生成一个新包裹；全部行发完订单转「已发货」

**API**：新增 `apis/order.ts` 的部分发货能力（按行与数量拼 `OrderLineInput`），复用现有 `fulfillOrder`/`addFulfillmentToOrder`。

### D · 售后（退款+退货闭环）

**页面**：
- `pages/after-sale/list/index.vue`：售后工单列表（类型 / 状态 / 订单号 / 金额 / 原因），支持状态筛选
- 新增 `pages/after-sale/detail/index.vue`：售后详情 + 商家操作

**商家操作**（复用 after-sales-plugin mutation）：
- 「同意」→ `approveAfterSalesRequest`
- 「拒绝」+ 原因 → `rejectAfterSalesRequest`
- 退货类 `return_refund`：「确认收货退款」→ `confirmReturnReceived`（触发库存回补）
- 「执行退款」→ `processAfterSalesRefund`；失败进入 `RefundFailed`，提供「重试」→ `retryAfterSalesRefund`

**退款落地**：本轮复用现有 `processAfterSalesRefund` 触发的 core 退款；当渠道无真实支付网关时，回显 `Refunded` / `RefundFailed` 状态即可（后台闭环）。金额/时间/结果快照以售后单字段为主。

**API**：新增 `apis/afterSale.ts` 详情查询与商家端操作（approve/reject/confirmReceived/refund/retry）封装。

---

## 4. 横切设计

- **状态 → 中文映射表**：统一维护订单状态与售后状态的中文文案 + 颜色（Tab、徽标、详情共用）
- **空态 / 加载 / 确认弹窗**：列表空态、加载中、操作二次确认（取消、拒绝、退款）
- **分页一致性**：列表使用 take/skip，触底加载与刷新正确维护 `skip`，避免重复

---

## 5. 错误处理

- GraphQL 错误统一走 `graphQlErrorMsg` 提取 `errors[0].message` 展示
- 取消 / 退款 / 发货失败时 toast 明确原因，不静默
- 售后状态不允许的动作（如未 Approved 就退款）由后端校验兜底，前端仅按状态显示可用按钮

---

## 6. 测试 / 验收

- 本地或线上 agent-browser 走通闭环：
  1. 商户/自营店下单（可造数据）
  2. 订单列表按状态筛选、搜索、分页、显示配送方式与来源
  3. 订单详情查看金额/支付/物流，待发货可取消
  4. 发货页部分发货 → 多包裹 → 全部发完 → 已发货
  5. 买家发起售后（退款+退货）→ 商家同意/拒绝 → 退货确认收货 → 执行退款 → Refunded
- 中文状态展示与空态符合预期

---

## 7. 范围外（YAGNI）

- 不接支付网关真实扣款
- 不做换货 `exchange` 流程界面（后端支持，本轮 UI 不单独建设）
- 不做订单列表「本店/转店」手动切换视图
- 不做跨渠道聚合订单的逐商家子单拆分展示（详情取主配送方式）

---

## 8. 涉及文件（预估）

前端（web-admin/src）：
- `apis/order.ts`：扩展查询字段、搜索、分页、部分发货
- `apis/afterSale.ts`：详情 + 商家端操作封装
- `pages/order/list/index.vue`、`pages/order/detail/index.vue`、`pages/order/ship/index.vue`
- `pages/after-sale/list/index.vue`、`pages/after-sale/detail/index.vue`（新增）
- 状态中文映射常量（建议 `pages/order/state.ts` 或 theme）

后端：基本无新增；如取消缺失 mutation 则补一个 core 流转封装（视调研而定）。