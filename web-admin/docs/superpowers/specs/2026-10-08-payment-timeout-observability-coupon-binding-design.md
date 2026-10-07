# web-admin 完善：支付超时观测 + 优惠券管理深化 — 设计文档

> 日期：2026-10-08 ｜ 状态：设计定稿（mockup 已确认：观测页版式 A、券绑定区块） ｜ 涉及仓：`d:\zhao\vendure`、`d:\zhao\vshop\web-admin`

## 1. 背景与目标

- 后端已上线「待付款超时任务」（`PaymentTimeoutTask` 实体 + Job：10min 提醒 / 15min 取消 / 补偿扫描），但管理端**无任何可见性**——看不到哪些单被自动取消、通知是否发出、任务是否失败。
- 优惠券模板的「商品专享券绑定」后端 admin API 已齐（list/bind/unbind），但 web-admin 编辑页**只在新建时可带 productId**，无改绑/解绑 UI。
- 目标：补齐上述两个管理端缺口，做法为**最小增量**（复用现成数据与 API，不做事件历史流双写）。

## 2. 范围

**做**：
- A1 后端：campus-delivery-plugin 新增 admin 查询/统计/手动执行三组接口
- A2 前端：web-admin 订单组新增「支付超时观测」页（版式 A：KPI 行 → 筛选条 → 任务表）
- C1 前端：券编辑页 + 券详情弹层嵌入「商品绑定卡片」（搜索→绑定/解绑）
- C2 券统计核查：确认 `couponTemplates` 返回的 KPI 字段是否含领取/核销计数；缺则 coupon-plugin 补 stats 字段，详情弹层展示

**不做（YAGNI）**：
- 方案二（Order history 双写、订单详情时间线展示超时事件）
- 观测页 B 版式（7 日趋势图）与 C 版式（队列控制台）
- 整体 QA 走查（后续单独批次）

## 3. 后端设计（d:\zhao\vendure\packages\campus-delivery-plugin）

`PaymentTimeoutTask` 表已在生产存在（Task 13 建表），字段含 `orderId/channelId/type(REMIND|CANCEL)/dueAt/status(PENDING|EXECUTED|CANCELLED|FAILED)/expectedState/retryCount/lastError`。**零迁移**。

新增 `payment-timeout-admin.resolver.ts`（挂 admin-api，走现有 Administrator 登录守卫）：

```graphql
# 查询：任务分页列表，join 订单摘要
paymentTimeoutTasks(status: String, type: String, from: DateTime, to: DateTime, skip: Int, take: Int): PaymentTimeoutTaskList!
  # item: { id, orderId, orderCode, orderState, orderTotalWithTax, type, status, dueAt, retryCount, lastError, createdAt }

# 统计：观测页 KPI 行数据源
paymentTimeoutStats: PaymentTimeoutStats!
  # { todayRemind, todayCancel, todayFailed, pendingOpenOrders }  // pendingOpenOrders=滞留待付(ArrangingPayment 超过15min)单数

# 手动执行：仅 PENDING/FAILED 可执行；复用 Job 内执行逻辑（抽公共方法），条件更新防并发
executePaymentTimeoutTask(id: ID!): PaymentTimeoutTask!
  # PENDING：按 type 立即执行（REMIND 发提醒 / CANCEL 立即取消）
  # FAILED：重试（沿用 retryCount/lastError 机制）
  # EXECUTED/CANCELLED：抛业务错误码 PAYMENT_TIMEOUT_TASK_NOT_EXECUTABLE

# 重发提醒：已执行 REMIND 行的「重发提醒」操作（不经任务状态机，直接调通知）
resendPaymentTimeoutRemind(orderId: ID!): Boolean!

# 手动补偿：触发一次补偿扫描（Job 的 runCompensation 同源逻辑），处理逾期 PENDING 任务
runPaymentTimeoutCompensation: Int!   # 返回本次处理条数
```

实现要点：
- 执行逻辑从 `payment-timeout.job.ts` 抽出可复用方法（Job 定时与手动执行共用一处）
- 并发防护：`UPDATE ... WHERE id=? AND status='PENDING'`（或等价事务），更新行数=0 即返回业务错误
- 查询按 `createdAt desc` 排序；`lastError` 原样返回（前端截断展示）
- coupon-plugin（C2 若需）：`couponTemplates` admin 查询结果补 `issuedCount/redeemedCount` 两个字段（基于现有领取/核销记录聚合）

## 4. 前端设计（d:\zhao\vshop\web-admin）

### 4.1 支付超时观测页（版式 A，mockup 已确认）

- 新文件：`src/apis/paymentTimeout.ts`（graphql-request，复用 `apis/client.ts`）、`src/pages/order/payment-timeout/index.vue`
- 页面结构：KPI 行（今日提醒/今日取消/失败/滞留待付）→ 筛选条（状态/类型/日期 + 「手动补偿」入口）→ 任务表（订单号/类型/状态/到期/操作）
- 行为：
  - PENDING 行显示到期倒计时（`dueAt - now`，分钟级）；操作=「立即执行」
  - REMIND 已执行行操作=「重发提醒」（调 `resendPaymentTimeoutRemind`）
  - 筛选条「手动补偿」= 调 `runPaymentTimeoutCompensation`，返回处理条数提示
  - FAILED 行红色标注 `retryCount x/x`，操作=「重试」，lastError 悬浮/截断展示
  - 全部行可跳转订单详情（现有 order/detail 路由）
  - 手动执行需二次确认（confirm 弹层），成功后刷新列表与 KPI
- 菜单：订单组（order/list 同级）新增「支付超时观测」入口
- i18n：所有新文案 `zh-Hans.json` / `en.json` 同步补齐，禁止硬编码中文

### 4.2 券绑定卡片（mockup 已确认）

- 新组件：`src/components/coupon/CouponBindingCard.vue`，嵌入 `pages/coupon/edit/index.vue`（券类型=商品专享券时显示）与 `pages/coupon/CouponDetailModal.vue`
- 结构：已绑列表（商品名/SKU/价格/「解绑」）→ 商品搜索框 → 搜索结果行（「+ 绑定」）
- API：对接 coupon-plugin 现有 `couponBindingAdmin`（`listByTemplateAdmin` / `bindProducts` / `unbindProduct`）；若 `apis/coupon.ts` 缺这些调用则补齐
- 改绑/解绑成功后提示「即时生效」（后端已主动失效 binding 缓存）
- 搜索复用现有商品搜索接口（pick-products 页已有先例）

### 4.3 券统计展示（C2）

- 券详情弹层增加统计块：领取数 / 已核销数 / 核销率；数据取 `couponTemplates` 的 KPI 字段（缺则后端补）

## 5. 错误处理

- 后端：execute 并发冲突/状态不允许 → 业务错误码 + 中文 message（走现有 GameException/HttpException 风格）
- 前端：GraphQL 错误统一走现有 client 错误提示；手动操作失败不刷新列表，成功才刷新
- 观测页空态/加载态/分页遵循现有页面模式

## 6. 测试与交付

- 后端：vitest 覆盖 resolver——列表过滤分页、stats 计数、execute 三态（PENDING 执行成功 / EXECUTED 拒绝 / FAILED 重试）；沿用 campus-delivery-plugin 包内现有测试模式
- 前端：`npm run build` 通过 + 现有回归；**桌面视口截图**（admin 为桌面后台，标准 1440×900）新增两页截图归档并补进操作手册（`src/static/manual/index.html` 增「支付超时观测」「券商品绑定」两节）
- 手机截图硬规范不适用于本桌面后台
- 收口：两仓提交推送 → vendure 服务器 git pull + pm2 restart（部署协议）→ web-admin 走 `scripts/deploy.mjs`
