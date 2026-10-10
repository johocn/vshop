# 积分商品商城 + 商品收藏 设计文档

- 日期：2026-10-10
- 状态：已批准（用户确认方案 A + 版式 B + 全部 mockup）
- 来源：usemall → vshop 迁移差距审计（矩阵外缺口 #1 商品收藏、#4 积分商品下单流）
- 关联批次：usemall-parity batch3 之后的矩阵外补齐

## 1. 背景与目标

usemall 功能对照审计确认矩阵内 23 项已全部迁移收口，但页面级深扫发现 8 项矩阵外缺口。本设计补齐其中价值最高的两项：

1. **商品收藏**：usemall 有 collect 页 + member-collect 表；vshop 商品详情页收藏按钮为占位（toast「敬请期待」），无收藏体系（购物圈帖子收藏已有，商品收藏全无）。
2. **积分商品下单流**：usemall 有 integral/goods/create/order/order-detail 完整积分商品订单流（积分当钱花）；vshop 积分体系目前仅「积分兑券 + 结账抵现」，无积分商品直接下单。

成功标准：C 端可收藏商品、可浏览积分商品并完成「纯积分 / 积分+现金」两种兑换，订单可在 web-admin 履约；e2e 回归通过；手机截图补入操作手册。

## 2. 方案决策

### 2.1 后端：方案 A —— 独立 points-mall-plugin（已选定）

新建独立 Vendure 插件，对齐 usemall 的独立积分体系模式。积分订单不复用 core Order 计价体系，与批次2 已验证的安全底线一致（不把自定义计算器注册进全局价格策略链）。

- 积分扣减复用 member-level-plugin 的 `spendPoints()` 原子扣减 + SPEND 流水（coupon-plugin 已有跨插件调用先例，直接照搬注入方式）。
- 收藏实体放同一插件内，toggle 模式参照 shopping-circle-plugin。
- 插件骨架参照 shopping-circle-plugin，在 dev-config 注册。

否决的方案 B（复用 core Order + customFields.pointsPrice + 促销冲抵）：必须动 OrderItemPriceCalculationStrategy 全局策略链，会撞酒店逐晚计价等复合兜底；积分订单与普通订单混表需大量过滤逻辑；支付回调耦合 core 支付流程。

### 2.2 C 端入口：版式 B —— 独立入口（已选定）

「我的」页菜单新增「积分商品」入口（与「积分兑换」「积分抽奖」等并存），独立整页列表，右上角「去兑券」与既有积分兑换页互链。不动现有积分兑换页结构。

## 3. C 端设计（vshop uni-app H5）

### 3.1 页面清单

| 页面 | 路径（pkg-points 下） | 要点 |
|------|----------------------|------|
| 积分商品列表 | points-goods/list | 版式 B 独立入口；顶部积分余额卡 + 商品卡网格（图/名称/积分价+现金价/已兑件数）；右上「去兑券」跳积分兑换页 |
| 积分商品详情 | points-goods/detail | 轮播图；价格区三态（纯积分/混合价/可选划线市场价）+ 已兑件数；兑换说明卡（库存/每人限兑/有效期）；图文详情；底部栏 = 收藏（同源 toggle）+「立即兑换」 |
| 确认兑换 | points-goods/confirm | 商品卡 + 数量步进；实物=收货地址卡（复用现有地址簿）；虚拟=「虚拟权益·兑换后即时到账」提示行；明细（消耗积分/余额变化/现金应付）；纯积分商品无现金行 |
| 积分订单列表/详情 | points-orders/list, detail | 状态 tabs；展示积分/现金/快照/状态/时间；混合价待支付可重试支付或取消（取消退积分） |
| 我的收藏 | favorites/list | 收藏卡片（图/名称/现价/收藏数）；在积分商品池内的商品显示「N积分可兑」打通提示；操作=加入购物车 + ♥取消收藏；下架/删除商品置灰 |

### 3.2 收藏激活改造

- 商品详情页收藏按钮从占位改为真实 toggle（ProductFavorite），与「我的收藏」页、积分商品详情页收藏三处同源。
- 登录态校验沿用现有拦截（未登录引导登录）。

### 3.3 i18n

- 新增页面全部文案走 i18n 字典，五语言（zh-CN/en-US/zh-TW/ja/ko，以仓库既有语言包清单为准）同步补齐，禁止单一语言写死。
- 商品标题/图/规格引用商品本体多语言数据，不在积分商品实体重复存储。

## 4. 后端设计（points-mall-plugin）

### 4.1 实体（4 个）

**ProductFavorite**
- 字段：`customerId`、`productId`、`channelId`、`createdAt`
- 约束：`@Unique(['customerId','productId'])`（渠道维度：customerId 本身已随租户/渠道隔离，唯一键二元即可）
- toggle 语义：存在则删（返回 favorited=false），不存在则建；`@Transaction` 包裹防并发重复

**PointsProduct**
- 字段：`productId`、`variantId`、`pointsPrice`(int)、`cashPrice`(int, 分，0=纯积分)、`deliveryType`(physical/virtual)、`stock`、`perUserLimit`、`redeemedCount`、`validFrom`、`validTo`、`status`(启用/停用)、`sortOrder`、渠道隔离
- 积分价按变体生效（与秒杀价 flashPrice 同口径）
- 虚拟商品核销有效期复用 validTo，不加新字段
- 标题/图/规格引用商品本体，不重复存

**PointsOrder**
- 字段：`code`(如 PO+日期+序列)、`customerId`、`pointsProductId`、商品快照(JSON：title/image/spec)、`quantity`、`pointsTotal`、`cashTotal`(分)、`deliveryType`、`addressSnapshot`(JSON：姓名/电话/省市区/详址，实物必填)、`status`、`trackingNo`(可选)、`paidAt`/`shippedAt`/`completedAt`、渠道隔离
- 状态机：
  - 纯积分+虚拟：扣分后直接 `completed`
  - 纯积分+实物：`pending_ship` → `shipped` → `completed`
  - 混合价：`pending_payment`（已扣积分+已生成支付单）→ 支付回调后转 `pending_ship`(实物)/`completed`(虚拟) → 同上
  - `cancelled`：未支付取消（退积分）；后台可关单

**PointsOrderPayment**
- 字段：`orderId`、`amount`(分)、`status`(pending/paid)、`transactionId`、`createdAt`
- 参照 recharge-card 微信支付单模式；订单可重新拉起支付（复用未支付 payment 或新建）

### 4.2 Shop API（C 端）

- Query：`pointsProducts`（启用中，含余额/可兑状态）、`pointsProduct(id)`、`myPointsOrders(status, 分页)`、`myPointsOrder(id)`、`myFavorites(分页，含下架标记)`、商品详情扩展 `favoriteCount`/`myFavorited`
- Mutation：
  - `toggleProductFavorite(productId)` → `{ favorited, favoriteCount }`
  - `createPointsOrderExchange(pointsProductId, quantity, addressId?)`（核心，`@Transaction`）：
    1. 校验 PointsProduct 状态/有效期/库存/限兑（redeemedCount+quantity ≤ perUserLimit）
    2. 实物校验 addressId 有效并快照
    3. `memberLevelService.spendPoints(customer, pointsTotal, remark=积分订单号)` 原子扣分（不足抛 INSUFFICIENT_POINTS）
    4. 扣 stock、redeemedCount+quantity
    5. 建 PointsOrder（快照落库）
    6. 混合价：建 PointsOrderPayment(pending)，返回微信支付参数（参照充值 createWechatRechargePayment 同模式）；纯积分：直接推进状态
  - `cancelPointsOrder(id)`：仅 `pending_payment` 可取消，事务内退积分（refund 流水 remark 记订单号）+ 回补库存/redeemedCount + 订单置 cancelled
  - `retryPointsOrderPayment(id)`：重新返回支付参数

### 4.3 支付回调

- shop-api 路由：`pointsOrderNotify`（参照 recharge 微信回调：验签 → PointsOrderPayment 带原状态条件的原子更新 pending→paid（幂等，重复回调直接幂等返回成功）→ 推进 PointsOrder 状态 → paidAt）

### 4.4 Admin API（web-admin）

- `pointsProducts`（全量含停用）/ `createPointsProduct` / `updatePointsProduct` / `deletePointsProduct`
- `pointsOrders(status, 分页)` / `pointsOrder(id)` / `markPointsOrderPaid(id)`（线下收款兜底）/ `markPointsOrderShipped(id, trackingNo?)` / `markPointsOrderCompleted(id)`

### 4.5 错误处理

- INSUFFICIENT_POINTS / OUT_OF_STOCK / PER_USER_LIMIT_EXCEEDED / NOT_IN_VALIDITY / ORDER_NOT_CANCELLABLE 等业务错误码，C 端映射 toast 文案。
- 支付失败/未支付：订单停 `pending_payment`，可重试或取消退积分；不自动回滚积分（除取消路径）。

## 5. web-admin（管理端）

工作台 ☰ 营销组新增两项，行内编辑卡模式（参照抽奖奖品管理/帖子管理）：

1. **积分商品管理**：选商品/变体（选择器）+ 积分价、现金价（0=纯积分）、履约类型（实物/虚拟）、库存、每人限兑、有效期（起止）、排序、启用开关；新增/编辑/停用；启用即时生效。
2. **积分订单管理**：状态 tabs（待支付/待发货/已发货/已完成/已取消/全部）；卡片=订单号/商品快照/数量/消耗积分/现金/客户/时间/地址；操作：待支付→「标记已收款」（线下兜底，走 markPointsOrderPaid）；待发货→「标记发货」（弹窗可选填单号）；已发货→「标记完成」。

## 6. 工程规范

- 插件注册：dev-config 挂载 points-mall-plugin；实体迁移随插件生成。
- 渠道隔离：所有查询按 activeChannel 过滤（与批次3 各插件同法）。
- i18n：五语言同步；管理端文案进 web-admin 语言包。
- 安全：shop-api 所有查询/变更基于当前登录 customer；admin 权限沿用现有权限池模式（新增对应权限项）。

## 7. 测试与验收

- e2e（参照批次3 插件 spec 模式，points-mall-plugin e2e）：
  - 收藏：toggle 往返幂等、favoriteCount 计数、myFavorites 下架标记
  - 纯积分下单：扣分/SPEND 流水 remark、库存与已兑计数、虚拟直 completed、实物 pending_ship
  - 混合价：pending_payment → 模拟回调 → 状态推进 + paidAt；重复回调幂等
  - 拒绝路径：积分不足/库存不足/超限兑/过期不可兑
  - 取消：退积分 refund 流水 + 回补库存；已支付订单不可取消
- 手机截图（硬规范）：Playwright 390×844 dpr=2 移动视口，覆盖列表/详情/确认兑换/积分订单/我的收藏五页，补入操作手册。
- 回归：既有积分兑券、结账抵现、会员价链路不受影响（spendPoints 复用不改动其内部实现）。

## 8. 不做清单（YAGNI）

- 自动超时关单任务（一期不做；支持手动取消退分 + 后台关单）
- 收藏夹分类/云同步购物车
- 积分商品分类筛选与搜索（列表一期平铺 + 排序）
- 虚拟商品核销码体系（虚拟权益下单即到账，核销走后续需求）
- 发货物流对接（trackingNo 手工录入即可）
