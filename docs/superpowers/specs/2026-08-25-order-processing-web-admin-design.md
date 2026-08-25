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

本次目标是把四个模块推进到「可日常使用」的完整度：**订单列表增强、订单详情增强、发货体验、售后退款闭环**；同时把到店履约补全：**多种自提（门店/职工单位/自提点）、到店自提核销、门店收银（固定聚合码收款）**。

### 关键前提（降低后端改动）

后端能力已相当成熟，本次**基本为 web-admin 前端工作**，后端仅需极少补补：

- 已有 `after-sales-plugin`，多租户/多渠道下卖家侧与买家侧 mutation 齐备：
  - 买家侧：`createAfterSalesRequest` / `cancelAfterSalesRequest` / `updateReturnTracking` / `myAfterSalesRequests` / `afterSalesRequest`
  - 卖家（商家/管理）侧：`approveAfterSalesRequest` / `rejectAfterSalesRequest` / `confirmReturnReceived` / `processAfterSalesRefund` / `retryAfterSalesRefund`
- 售后类型：`return_refund`（退货退款）/ `refund_only`（仅退款）/ `exchange`（换货）
- 状态机：`Pending → Approved → (Rejected) → Returning → Received → Refunded / RefundFailed → Closed`
- 到店自提核销（pickup-plugin，后端已完整）：
  - `PickupRedemption` 实体：`code`（6 位核销码）、`status`（generated/redeemed/void）、`claimedAt`、`claimedByUserId`、`claimChannel`（customer/shop）
  - Admin：`pickupRedemptions`、`myPickupOrders`、`claimPickupByShop(code)`（店员核销，强校验归本店）
  - Shop/C 端：`myPickupCode(orderId)`、`claimMyPickup(orderId, code)`
  - Order 自定义字段：`deliveryType`（delivery/pickup）、`pickupClaimed`
  - 自提单需 fulfillment 已 `Shipped`（备货完成）才可核销；核销后置 `pickupClaimed=true`、履约转 `Delivered`；订单取消自动作废核销码
- 三种自提点类型（cjk-plugin / pickup）：`store`（门店）/ `point`（自提点）/ `employee`（职工单位）；配送档案以 `store-pickup` / `pickup-point` / `employee-pickup` 分别限定自提点范围；C 端下单已支持 `setOrderPickupLocation` 选择自提点
- 发货 / 退款 / 取消复用 Vendure core：
  - 发货：`addFulfillmentToOrder(input: FulfillOrderInput!)`，handler 用 `manual-fulfillment`
  - 退款底层：core `orderService.refundOrder → paymentService.createRefund`
  - 取消：订单状态流转到 `Cancelled`（超时取消/防库存泄漏逻辑已在 cjk-plugin 处理）

> 因此后端新增量很小，重点在 web-admin 的 API 封装与页面。唯一全新后端能力为「固定聚合码收款」支付方式（见模块 G）。

---

## 2. 用户已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 订单列表中「本店 vs 平台转店」 | 上下文自动隔离 + 卡片「来源」标签（不做手动切换视图） |
| 列表是否显示配送方式 | 是，卡片显示主配送方式（多条 shippingLines 时取首条；默认站点聚合单多条时显示合并名） |
| 售后退款落地方式 | 后台闭环，不接支付网关（同意→创建退款单→状态完成，存金额/时间/快照） |
| 订单详情是否支持手动取消 | 支持（待发货阶段可取消） |
| 售后覆盖类型 | 退款（refund_only）+ 退货（return_refund）两类 |
| 到店履约方式 | 快递 + 门店自提 / 职工单位自提 / 自提点自提（三类到店履约纳入订单处理） |
| 到店自提核销 | 必做；收银台/核销列表按核销码核销（后端 pickup-plugin 已就绪，纯 web-admin UI） |
| 门店收银 | 聚合码收款：按订单金额收款、确认后完成 + 扣库存 + 记录；收款方式固定命名「固定聚合码收款」 |
| 固定聚合码收款支付方式 | 独立为一种支付方式，设为**全局可用**，租户在支付档案「引用到本店」后使用 |
| 收款落地 | 确认收款仅记录，不接真实聚合支付/收款网关（店员确认已到账即完成） |

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

### E · 到店履约方式 + 「固定聚合码收款」支付方式

**履约方式（订单处理视角）**
- 订单在处理页完整展示履约方式：**快递 / 门店自提 / 职工单位自提 / 自提点自提**（`deliveryType` + `shippingLines[].shippingMethod`）
- 自提单展示：所选自提点（名称/地址）、核销状态（未核销/已提货）、核销码
- 三种自提点类型沿用 `store / point / employee`，配送档案的 `store-pickup / pickup-point / employee-pickup` 限定范围不变，本轮不重构

**「固定聚合码收款」支付方式（唯一需新后端的能力）**
- 新增一种全局支付方式模板，命名固定为**「固定聚合码收款」**
- 特点：**全局可用**；租户在【支付档案】「引用到本店」后即可在店内收银使用
- 语义：到店收银时按订单应付金额收款（顾客扫门店固定聚合码付款到商户），店员确认已到账后，系统记录一笔该支付方式的收款并完成订单
- 复用现有「配送/支付全局方案池 → 引用到本店」机制，不改其数据结构；仅新增一个全局模板与对应欠费标记

### F · 到店自提核销（纯 web-admin）

- **核销列表页** `pages/pickup/redeem/index.vue`（或收银台子页）：
  - 展示本店待核销自提单：订单号、核销码、状态（generated/redeemed/void）、顾客、金额、自提点
  - 状态筛选（待核销 / 已核销 / 已作废）
- **核销操作**：输入 / 扫码核销码 → 调 `claimPickupByShop(code)` → 校验归本店 → 置 `redeemed`、订单 `pickupClaimed=true`、履约转 `Delivered`、记录 `claimedBy`
- **订单详情接入**：自提单显示核销码与「核销」入口；已核销显示核销人与时间；取消订单自动作废核销码
- API：`apis/pickup.ts`（`pickupRedemptions` / `myPickupOrders` / `claimPickupByShop`）

### G · 门店收银（固定聚合码收款）

**收银台页** `pages/pos/index.vue`：
- 录入 / 扫码核销码，或按订单号检索 → 调出订单，显示**应付金额**与**待交付商品/服务**
- 收款方式默认「固定聚合码收款」（需租户已在支付档案引用启用）；顾客扫门店固定聚合收款码付款
- 店员点「**确认收款**」→ 系统：记录收款流水（金额/时间/方式/店员）→ 订单完成 → 扣减库存 → 若为自提单同步核销
- 已在线支付过的自提单：只核销、不重复收款（金额为 0 / 已付清则不显示收款按钮）
- 收银完成后可打印/展示交接凭证（金额、商品、时间）

**与核销的融合**：收银台既是「收款」也是「核销」入口；对已付自提单仅核销，对未付单收款后完成。

---

## 4. 横切设计

- **状态 → 中文映射表**：统一维护订单状态、售后状态、核销状态的（generated/redeemed/void）中文文案 + 颜色（Tab、徽标、详情共用）
- **履约/支付方式展示**：列表与详情统一展示 `deliveryType`（快递/自提类型）与支付方式（含「固定聚合码收款」）
- **空态 / 加载 / 确认弹窗**：列表空态、加载中、操作二次确认（取消、拒绝、退款、核销、确认收款）
- **分页一致性**：列表使用 take/skip，触底加载与刷新正确维护 `skip`，避免重复

---

## 5. 错误处理

- GraphQL 错误统一走 `graphQlErrorMsg` 提取 `errors[0].message` 展示
- 取消 / 退款 / 发货 / 核销 / 确认收款失败时 toast 明确原因，不静默
- 核销强校验归本店：非本店核销码由后端拒绝（`claimPickupByShop` 已内置渠道校验），前端仅展示本店可核销单
- 售后 / 核销状态不允许的动作（如未 Shipped 就核销、未 Approved 就退款）由后端校验兜底，前端仅按状态显示可用按钮

---

## 6. 测试 / 验收

- 本地或线上 agent-browser 走通闭环：
  1. 商户/自营店下单（可造数据）
  2. 订单列表按状态筛选、搜索、分页、显示配送方式与来源
  3. 订单详情查看金额/支付/物流，待发货可取消
  4. 发货页部分发货 → 多包裹 → 全部发完 → 已发货
  5. 买家发起售后（退款+退货）→ 商家同意/拒绝 → 退货确认收货 → 执行退款 → Refunded
  6. 自提单（门店/职工单位/自提点）：下单→生成核销码→备货完成→店员按核销码核销→ redeemed / 订单完成
  7. 支付档案「引用到本店」「固定聚合码收款」→ 门店收银台按订单收款/确认完成/扣库存/记录流水
- 中文状态展示与空态符合预期

---

## 7. 范围外（YAGNI）

- 不接支付网关真实扣款、不接真实聚合支付/收款网关
- 不做换货 `exchange` 流程界面（后端支持，本轮 UI 不单独建设）
- 不做订单列表「本店/转店」手动切换视图
- 不做跨渠道聚合订单的逐商家子单拆分展示（详情取主配送方式）
- 门店收银不做「无单商品自助建档收银」（收银台按既有订单收款+核销）
- 不改三选自提点类型与配送档案范围的数据结构（`store/point/employee` 沿用）

---

## 8. 涉及文件（预估）

前端（web-admin/src）：
- `apis/order.ts`：扩展查询字段（配送方式、履约方式、支付）、搜索、分页、部分发货
- `apis/afterSale.ts`：售后详情 + 商家端操作封装
- `apis/pickup.ts`（新增）：核销列表 / `claimPickupByShop` / 待核销自提单
- `apis/payment.ts`：支付档案「固定聚合码收款」全局模板与引用
- `pages/order/list/index.vue`、`pages/order/detail/index.vue`、`pages/order/ship/index.vue`
- `pages/after-sale/list/index.vue`、`pages/after-sale/detail/index.vue`（新增）
- `pages/pickup/redeem/index.vue`（新增，到店自提核销）
- `pages/pos/index.vue`（新增，门店收银台）
- `pages/shipping/profile/index.vue`、`pages/payment/profile/index.vue`：接入履约/转账方式与「固定聚合码收款」引用展示
- 状态中文映射常量（订单/售后/核销）

后端（vendure）：
- 新增「固定聚合码收款」全局支付方式模板（含全局可用 + 租户引用入口）；若现有全局方案池机制可承载则仅加模板/seed
- 其余核销/售后/发货/取消能力已在 pickup-plugin / after-sales-plugin / core 就绪，原则上无新增