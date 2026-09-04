# vShop Web-Admin 订单列表页·中国本地化改造（设计文档）

- 日期：2026-09-04
- 项目：`web-admin`（uni-app H5，Vue3 + `<script setup>` + SCSS）
- 目标页面：`/pages/order/list/index.vue`
- 状态：已确认设计，待转实现计划

## 1. 背景与目标

当前运营端订单列表是一个精简单列卡片列表（scope 切换 + 状态 tab + 搜索 + 卡片），字段密度低、非中文电商运营常见形态、桌面宽屏下排版稀松。本次按「中国本地化」改造为**手机卡片 + 桌面表格**的响应式订单管理页，补齐中国电商运营订单常见字段与入口，并接入已有核销功能。

### 成功标准
- 手机端（<768px）为单列卡片，字段齐全、信息密度适中；
- 桌面端（≥768px）为字段密集型表格，顺带缓解桌面宽屏短板；
- 顶部统计条（今日订单/待发货/待退款）可实时统计；
- 核销功能有顶栏入口 + 自提未核销单卡片/表格快捷入口；
- 复用现有 `orderState.ts` 状态映射与核销页，业务逻辑不重复。

## 2. 范围

### 本期（In scope）
- 页面结构重排：统计条 → 顶栏核销入口 → scope 切换 → 状态 tab → 搜索 → 列表。
- 手机卡片 + 桌面表格响应式双形态。
- 统计条：今日订单 / 待发货 / 待退款（来源：本店商品单全量实时统计）。
- 核销顶栏入口 + 自提未核销单「去核销」快捷（复用核销页）。
- 手机号脱敏、金额、时间、配送/自提标识、支付方式展示。

### 非目标（Out of scope）
- 真实售后退款数（待退款本期用「已取消/售后近似」，二期接售后接口）。
- 后端字段/接口新增（除在现有查询里按需取字段外，不改 shop-plugin / admin-api schema）。
- 批量操作、导出、多选（不在本期）。

## 3. 页面结构

自上而下，手机与桌面一致：

1. 统计条：`今日订单 / n`、`待发货 / n`、`待退款 / n`。
2. 顶栏右侧「核销码」入口按钮。
3. 一行 scope 切换：`本店渠道单` / `本店商品单`。
4. 状态 tab：全部 / 待付款 / 待发货 / 已发货 / 已完成 / 已取消（沿用现状 tabs，key 对齐 Vendure 状态机）。
5. 搜索：订单号 / 顾客 / 手机号。
6. 列表：手机=卡片，桌面=表格；底部 loading / 空态 / 加载更多。

## 4. 双形态展示

### 4.1 手机卡片（<768px）
每个订单一张卡片，字段：
- 头部：订单号（右上方向状态色标）。
- 顾客行：收货人 + 手机号脱敏 + 「· 快递 / 自提」(配送类型)。
- 商品行：商品缩略图占位 + 名称/规格 + 单价×数量，可多行。
- 底部：下单时间 + 支付方式；右侧实付金额（¥ 强调色）。
- 操作区（右对齐）：始终显示「详情」；自提未核销单额外显示「去核销」（主色）。发货/催付/导出等动作不在本期。

### 4.2 桌面表格（≥768px）
表格列：
`订单号 | 商品 | 收货人/电话 | 配送 | 实付 | 下单时间 | 状态 | 操作`；操作列含「去核销」(自提未核销) +「详情」。表头吸顶，容器横向滚动兜底。

## 5. 统计条（数据源与口径）

- 单一来源：`fetchShopOrders()`（本店商品单 `myShopOrders`）全量快照，与当前 scope/tab 无关，代表"我的店铺"概览；一次性拉取，成本低。
- 今日订单 = `placedAt` 为当天的单数。
- 待发货 = `state ∈ {PaymentAuthorized, PaymentSettled, WaitingForShipping}`。
- 待退款 = 本期近似 = `state === Cancelled` 或售后中标记；真实退款数需售后/退款接口，二期接入（标注占位）。

## 6. 核销功能集成

- 顶栏「核销码」按钮 → `uni.navigateTo('/pages/pickup/redeem/index')`（该页已含扫码/输码/待核销自提单列表）。
- 卡片/表格「去核销」快捷：仅对"自提未核销"订单显示。
  - 判定：列表加载时调一次 `fetchPickupOrders(false)` 取全部核销凭据（含 `orderId / status / claimedAt`），过滤出"未核销"的 `orderId` 集合；命中的订单显示「去核销」。
  - 该方式双 scope 通用、零后端改动（复用核销凭据这一权威数据源，不依赖 Order 自定义字段是否被返回）。
  - 点击 → `uni.navigateTo('/pages/pickup/redeem/index?orderId=<id>')`，核销页已有按 orderId 匹配预填核销码逻辑。

## 7. 数据访问

### 本店渠道单（`fetchOrders`）
现有 `ORDER_FIELDS` 仅含 `code/state/totalWithTax/totalQuantity/createdAt/orderPlacedAt/customer/shippingLines/customFields{deliveryType}`。本次为展示收货人+手机号、支付方式等，需按需在查询里补充字段（字段可用性以 admin-api schema 校准为准，实现时验证）：
- 手机号：`customer.phoneNumber` 或 `shippingAddress.phoneNumber`（脱敏）。
- 支付方式：`payments { method }`。
- 自提核销态：`customFields { deliveryType pickupClaimed }`（仅作辅助，主判定仍用核销凭据集合）。

> 实现前置校验：确认 `orders` 查询返回 `customer.phoneNumber / payments / shippingAddress` 的可行性（记入实现计划 Task 0 校准）。

### 本店商品单（`fetchShopOrders`）
返回 `customerName / placedAt / items{...}`，无手机号/支付方式。桌面表格手机号列在本 scope 下显示 `—`（并隐藏支付/自提态细分列或留空），卡片则隐藏手机号/支付方式行。核销「去核销」判定仍用核销凭据集合，不受影响。

## 8. 组件与架构

- 全部改造集中在 `src/pages/order/list/index.vue`（模板 + 脚本 + 样式）与 `src/apis/order.ts`（字段补充，如有）。
- 复用：`src/constants/orderState.ts`（`ORDER_STATES / stateLabel`）；`src/apis/pickup.ts`（`fetchPickupOrders`）。
- 不新增全局组件；如需缩略图占位用一个内联字体/背景色块即可（无真实商品图 URL）。
- 保持单一职责：统计计算、核销集合、列表加载各自为独立函数，互不耦合。

## 9. 数据处理流

1. `onMounted`：并行发起 ① `fetchShopOrders()`（统计）② 当前 scope 的列表加载 ③ `fetchPickupOrders(false)`（核销集合）。统计与列表可各自独立，失败互不影响（统计失败静默给 `—`）。
2. 列表加载逻辑沿用现状（`load / loadMore`，`isGhost` 空单过滤，双 scope 分支）。
3. 渲染时按断点（媒体查询）确定卡片或表格，`v-if`/`v-show` 控制 `pageMedia`（H5 端用 CSS media query，或 `uni.getSystemInfo` + resize 监听）。

## 10. 错误处理与边界

- 统计接口失败：不阻塞列表，统计显示 `—`。
- 核销凭据拉取失败：不阻塞，仅隐藏「去核销」快捷（顶栏入口仍可用）。
- 手机号缺失：脱敏函数返回 `—`。
- `isGhost` 空单过滤沿用现状，避免 0 件 0 元幽灵单上榜。
- 桌面表格横向溢出：外层 `overflow-x:auto` 兜底。

## 11. 测试

- 手机（390×844）与桌面（1440×900）双视口截图。
- 用例：统计数字正确（今日/待发/待退）；scope 切换；tab/搜索过滤；自提未核销单出现「去核销」并正确跳核销页；已核销/快递单不出现「去核销」；手机卡片与桌面表格字段一致；空态/加载更多/下拉刷新。

## 12. 交付

- 实现 + 手机截图 + 桌面截图 + 操作手册补充（视觉伴侣 mockup 可作为页面结构参考）。

## 涉及文件（预估）
- `src/pages/order/list/index.vue`（主体改造）
- `src/apis/order.ts`（查询字段补充，视校准结果）
- 若新增脱敏/统计等纯函数：就近放页面或 `src/utils/`。