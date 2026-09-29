# vshop 对齐 usemall 版式 · 第二轮（SKU 弹层收口 + 评价体系）设计稿

- 日期：2026-09-29
- 状态：设计已定稿，待复核通过后进入实施计划
- 承接：`docs/superpowers/specs/2026-09-24-vshop-usemall-alignment-design.md`（第一轮，已交付，提交 `a12dac7`）
- 设计输入：**usemall 源码逐页 diff（`D:\zhao\usemall`）** + vendure review-plugin 一手代码核查；不以截图或通用 mockup 作为设计依据
- 载体：`vshop/src`（uni-app C 端，含 H5 与小程序）

---

## 1. 背景与本轮范围

第一轮交付后，vshop 的商品与交易主链页面版式已与 usemall 对齐，但第一轮 spec 中声明的 A 档遗留偏差只收口了部分。本轮按 **「仅版式对齐闭环」** 标准收口剩余项：以 usemall 源码为唯一参照物，把「usemall 有、vshop 没有」的版式补齐，把「usemall 也没有」的项从待办中剔除。

### 1.1 范围

| 编号 | 交付项 | 参照物 |
|---|---|---|
| S1 | 详情页 SKU 弹层补规格分组计数与单规格降级 | `usemall/sub-goods/pages/detail.vue` 规格弹出框 |
| S2 | 详情页评价区（含平均分 + 好评率摘要） | `usemall/sub-goods/pages/detail.vue` 05 评价区 |
| S3 | 商品评价页（4 分档，新增页面） | `usemall/sub-goods/pages/evaluate.vue` |
| S4 | 订单评价提交页（新增页面） | `usemall/sub-user/pages/order/order-evaluate.vue` |
| S5 | 我的评价页（新增页面） | 无参照物，用户追加要求 |
| S6 | 后端：review-plugin shop SDL 支持分档筛选 | 无参照物，S3 的技术前置 |

### 1.2 非目标（本轮不做）

| 不做项 | 依据 |
|---|---|
| 收藏按钮接真实接口 | `favorite-plugin` 未注册进 `dev-config.ts`，后端不可用（沿用第一轮 R6） |
| 销量 / 积分补数据源 | 沿用第一轮决策 6：有数据才渲染、无数据不占位 |
| 评价追评、评价有用计数、修改/删除评价 | usemall 评价页无这些元素 |
| 评价「有图 / 标签」筛选 | usemall `evaluate.vue` 只有 4 个星级档 tab |
| 订单备注落库 | 沿用第一轮决策 8：前端暂存，不动后端 |
| 评价图片/视频中的「视频」 | usemall 评价上传只有图片 |
| 全站 i18n 化 | 见 §8 开放项 |

### 1.3 执行结构（纵切）

按能力纵切为两个独立任务，各自可独立验收：

| 纵切 | 覆盖 | 依赖 |
|---|---|---|
| V1 | S1 详情页 SKU 弹层收口 | 前端 + fragment 改动，零后端 |
| V2 | S2 → S6 评价体系（详情区 / 评价页 / 提交页 / 我的评价页 / 后端分档） | 依赖 S6 后端改动的 V2 分档部分 |

V1 与 V2 无共享代码，可任意顺序执行。

### 1.4 已完成（前置交付）

| 交付项 | 状态 | 依据 |
|---|---|---|
| 拼团页「我的开团 / 我的参团」两 tab | **已交付**（2026-09-29，提交 `0c51499`，含后端 `myGroupBuyOrders(isLeader)`、5 个语言包 20 键、4 张手机视口截图与手册 §5.9） | 一手核查发现参照物未实现（见 §2.1 末行），故**不计入本轮对齐范围**；后经用户追加确认为**独立需求**，另立 spec 交付：`2026-09-29-vshop-group-buy-my-tabs-design.md` |

---

## 2. 一手核查结论

以下结论均来自源码直读，非推测。

### 2.1 usemall 侧

| 位置 | 事实 |
|---|---|
| `sub-goods/pages/detail.vue` L403-L455 | 规格弹层：头部图 `sku.img \|\| goods.img`（有回退）；规格组标题为 `{{item.name}} ({{item.arrs.length}})`；chip 选中态按操作类型换色；底部数量行带库存文案 |
| `sub-goods/pages/detail.vue` L217-L254 | 05 评价区位于 **06 详情富文本之前**；结构为「用户评价（N）」+「查看全部 ›」+ 前若干条（头像 / 昵称 / 星级 / 日期 / 内容 clamp-2 / 图片）；**无**平均分、好评率、星级分布、热门标签 |
| `sub-goods/pages/detail.vue` L932-L934 | 标题计数来自接口的 `evaluate_cnt` |
| `sub-goods/pages/evaluate.vue` | 4 个 chip「全部 / 好评 / 中评 / 差评」+ 各自计数（聚合 `review_type`）；列表含图片（点击预览）与「商家回复」（`clamp-lh`，点击展开/收起） |
| `sub-user/pages/order/order-evaluate.vue` | 一单多商品 → 每商品一块：商品卡 + 「宝贝评分」+ 星级选择器（默认 5）+ textarea（`maxlength=260`）+ 图片上传 + 「公开显示您的头像、昵称」开关；提交走 `uni.showModal` 二次确认 |
| `sub-user/pages/order/order-evaluate.vue` L139-L152 | 星级 → 文案映射：1 = 差评，2/3 = 中评，4/5 = 好评 |
| `sub-user/pages/order/order-evaluate.vue` L160-L171 | 内容为空时**自动填入**「此用户没有填写评价」（该校验被注释掉） |
| `sub-user/pages/order/order.vue` L137-L139、`order-detail.vue` L316-L317 | 入口按钮「我要评价」，仅 `state == '待评价'` 时显示 |
| `sub-marketing/pages/group.vue` L5-L14 | 拼团页三 tab 被 `v-if="false"` 隐藏，为废弃死代码 |

### 2.2 vendure 侧

| 位置 | 事实 |
|---|---|
| `packages/review-plugin/src/plugin.ts` L96-L197 | shop SDL 已完整暴露：`productReviews` / `myReviews` / `reviewStats` / `productRating` / `createReview` / `updateReview` / `deleteReview` / `createFollowUpReview` / `markReviewHelpful` |
| `packages/review-plugin/src/plugin.ts` L125-L128 | shop 版 `ReviewListOptions` **只有 `skip` / `take`**，不支持星级档筛选 |
| `packages/dev-server/dev-config.ts` | `ReviewPlugin.init()` **已注册**（L451）→ 后端零新建 |
| `packages/review-plugin/src/review.service.ts` L33 | `ALLOWED_ORDER_STATES = ['Delivered', 'Completed']` |
| 同上 L48-L110 | `createReview` 强约束：必须传 `orderLineId`；订单须属当前 customer；订单须处于 Delivered/Completed；同一 `orderLineId` 同一 customer **只能评一次**；`content` 非空；`status` 由 `autoApprove` 决定，未开启则为 `pending` |
| 同上 L269-L291 | `getProductReviews` 固定 `status = approved` 且 `parentId IS NULL` → 只返回已审核主评 |
| 同上 L312-L353 | `getReviewStats` 返回 `totalCount` / `goodRate` / `averageRating` / `ratingDistribution` / `topTags`；`goodRate` 定义为 `rating >= 4` 占比 |
| 同上 L293-L301 | `getMyReviews` 按 customer 全量返回（**无分页、无 status 过滤**），未剔除 `deleted` |
| `packages/review-plugin/src/review.entity.ts` | `Review` 类型**无商品名 / 商品图 / 规格名快照**，只有 `productId` / `variantId` / `orderLineId` |

### 2.3 vshop 侧可复用资产

| 资产 | 用途 |
|---|---|
| `src/components/ImageUpload.vue` | 评价图片上传（已用于 `pkg-after-sale/pages/apply.vue`） |
| `src/api/queries/product.ts` 的 `getProductsByIds(ids)` | 按 id 批量补商品名与主图（已用于秒杀/拼团），**恰好满足我的评价页需求** |
| `src/api/queries/product.ts` 的 `getProduct(slug)` | 取商品详情（含 `variants[].options[]`），用于评价页的规格名映射 |
| `src/components/EmptyState.vue` / `LoadingSkeleton.vue` / `VImage.vue` | 列表空态、骨架、图片，直接复用 |

### 2.4 已定位的缺陷根因

| 缺陷 | 根因（源码级） |
|---|---|
| SKU 弹层缩略图恒为灰底 | `src/api/fragments.ts` 的 `PRODUCT_DETAIL_FRAGMENT`（L18-L32）**未请求 `featuredAsset`** —— 商品级与 `variants` 级都没有。因此 `SkuSheet.vue` 的回退链 `currentVariant.featuredAsset?.preview \|\| product.featuredAsset?.preview` 两级**在数据层就恒为 `undefined`**，占位分支必然命中。这不是渲染问题，是查询字段缺失 |
| 单规格商品出现「请选择规格」 | `SkuSheet.vue` 的 `pickedText` 与 `detail.vue` 的 `pickedSummary` 都以「是否已选 `optionGroups` 中的选项」判定；单规格商品 `optionGroups` 为空 → 判定恒为未选 → 落到兜底文案 |
| 规格组无计数 | 模板未渲染 `group.options.length` |
| 订单评价无法发起 | `ORDER_FRAGMENT` 的 `productVariant` 选择集**未含 `productId`**，而 `createReview` 必须传 `productId` |

---

## 3. 决策记录（用户已逐条确认）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 「完善」的判定标准 | **仅版式对齐闭环**：只收口第一轮声明的 A 档遗留偏差，不做全面功能对等 |
| 2 | 评价体系深度 | **只读 + 发表评价**（不做追评、有用、修改、删除） |
| 3 | 收藏按钮 / 销量 / 积分 | **都不动** |
| 4 | 拼团页两个 tab | **不计入对齐范围**（参照物亦未实现）。**2026-09-29 修订**：用户追加确认为独立需求，已单独交付，见 §1.4 |
| 5 | 评价分档筛选 | **扩 shop SDL**：`ReviewListOptions` 加 `ratingMin` / `ratingMax`（小后端改动，无数据库迁移） |
| 6 | 评价审核口径 | **保持 pending 审核流**，提交后明确提示「审核通过后展示」 |
| 7 | 详情页评价区摘要 | **加平均分 + 好评率**（取自现有 `reviewStats`，零额外接口） |
| 8 | 我的评价页 | **做**（新增页面，个人中心入口） |

---

## 4. 设计

### 4.0 详情页新版块顺序（对齐 usemall）

```
轮播图
价格行（PriceTag + 划线原价 + 秒杀价 badge）
价格说明 ›
标题
元信息行（分享 / 海报 / 销量 / 积分）
已选规格入口行
─────────────── 以下为本轮改动区 ───────────────
用户评价（N）        查看全部 ›      ← S2 新增
4.7 分 | 好评率 92%
评价条目 × 2
───────────────
商品详情（富文本 / 视频 / 卖点）
底部 5 键栏
```

评价区**必须在详情富文本之前**，与 usemall 的 05 → 06 顺序一致。

### 4.1 S1 · 详情页 SKU 弹层

**文件**：`src/components/SkuSheet.vue`、`src/pkg-product/pages/detail.vue`

| 改动 | 现状 | 目标 |
|---|---|---|
| 规格组标题 | 仅 `{{ group.name }}` | `{{ group.name }} ({{ group.options.length }})`，对齐 usemall |
| 单规格降级 | `optionGroups` 为空时仍渲染规格区容器；`pickedText` 落到 `t('sku.pleasePick')` | `optionGroups.length === 0` → 规格区**整段不渲染**；`pickedText` 取选中变体名，不出现「请选择规格」 |
| 已选入口行 | `pickedSummary` 无选中时返回「请选择规格」 | 顺序：已选选项名 join ` / ` → 无 `optionGroups` 时取 `selectedVariant.name` → 都取不到才兜底「请选择规格」 |
| 缩略图 | 回退链**代码上**已有，但 `PRODUCT_DETAIL_FRAGMENT` 未请求 `featuredAsset`，两级在数据层恒为 `undefined`（见 §2.4） | 在 `PRODUCT_DETAIL_FRAGMENT` 的商品级与 `variants` 级各补 `featuredAsset { preview }`，回退链才真正生效 |

**不改**：数量步进与库存上限、秒杀活动模式下的按钮文案、`action` 事件载荷结构（`{ action, variantId, quantity }`）。

### 4.2 S2 · 详情页评价区

**文件**：`src/pkg-product/pages/detail.vue`

- **位置**：`product-detail__info` 之后、`product-detail__rich` 之前（见 §4.0）
- **结构**：
  - 标题行：左「用户评价（N）」，右「查看全部 ›」
  - 摘要行：「`{averageRating}` 分 | 好评率 `{goodRate}%`」
  - 条目 × 2
- **数据**：
  - `productReviews(productId: <product.id>, options: { take: 2 })` → `items` 作条目、`totalItems` 作标题计数
  - `reviewStats(productId: <product.id>)` → `averageRating` / `goodRate`
  - 两个查询并行；**任一失败或 `totalItems === 0` → 整块不渲染**，不阻塞主内容
- **条目字段映射**：

| 展示 | 来源 | 缺失处理 |
|---|---|---|
| 头像 | 无此字段 | 取 `customerName` 首字符做圆形占位 |
| 昵称 | `customerName` | 为 `null`（匿名）→ 显示 i18n/常量「匿名用户」 |
| 星级 | `rating`（1-5） | — |
| 日期 | `createdAt` | 格式化为 `yyyy/MM/dd` |
| 内容 | `content` | 两行截断（clamp-2） |
| 图片 | `images` | 最多取 3 张；点击 `uni.previewImage`；为空则不渲染该行 |
| 规格 | `variantId` | 在 `product.variants` 中按 id 匹配，取 `options[].name` join ` / `；匹配不到则不渲染该行 |
| 商家回复 | 不展示 | usemall 详情页评价区不展示回复 |

- **点击**：整块与「查看全部 ›」→ `/pkg-product/pages/evaluate?slug=<product.slug>`

### 4.3 S3 · 商品评价页（新增）

**文件**：`src/pkg-product/pages/evaluate.vue`（分包 `pkg-product`）

- **路由**：`/pkg-product/pages/evaluate?slug=<productSlug>`
  - 只传 `slug`：页面内 `getProduct(slug)` 一次拿到 `id`、`name`、`variants[].options[]`，既作 `productReviews` 的入参，又作规格名映射表，**避免第二个查询**
- **权限**：无需登录（`productReviews` 为 public）
- **4 个分档 chip**：全部 / 好评 / 中评 / 差评
  - 计数从 `reviewStats(productId).ratingDistribution` 前端求和（`好评 = rating 4 + 5`，`中评 = 3`，`差评 = 1 + 2`，`全部 = totalCount`），**不新增接口**
- **列表**：`productReviews(productId, { skip, take: 10, ratingMin, ratingMax })`
  - 上拉分页；`hasMore = 已加载条数 < totalItems`；到底显示「没有更多了」
  - 切换 chip 时 `skip` 归零、列表清空重拉
- **条目**：头像首字符 / `customerName` / 星级 / 日期 / 内容（clamp-2）/ 图片（最多 9 张，点击预览）/ 规格行 / 商家回复
  - 商家回复：`reply`，默认两行截断，点击切换展开/收起（对齐 usemall）
- **空态**：`EmptyState`「暂无评价」
- **加载态**：首屏 `LoadingSkeleton`，翻页不显示骨架

### 4.4 S4 · 订单评价提交页（新增）

**文件**：`src/pkg-order/pages/order-evaluate.vue`（分包 `pkg-order`）

- **路由**：`/pkg-order/pages/order-evaluate?code=<orderCode>`（用 `code`，与 `orders.vue` / `order-detail.vue` 现有约定一致）
- **数据**：`getOrderByCode(code)` → `order.lines[]`，每行提供 `id`（即 `orderLineId`）、`productVariant.id`、`productVariant.productId`、`featuredAsset.preview`、`productVariant.name`、`unitPriceWithTax`、`quantity`
  - 其中 `productVariant.productId` **当前 fragment 未请求**，需按 §4.8 补入 `ORDER_FRAGMENT`
- **权限**：需登录（`createReview` 为 authenticated）；未登录跳 `/pages/login/index`
- **每个待评 line 一块表单**（对齐 usemall）：
  - 商品卡：缩略图 + 名称 + 规格 + 数量 + 单价
  - 评分行：「宝贝评分」+ 当前档位文案（好评 / 中评 / 差评）+ 星级选择器，**默认 5 星**
  - 内容区：`textarea`，`maxlength=260`，占位「请输入评价内容」
  - 图片区：复用 `ImageUpload`，`max-count=6`
  - 匿名开关：「公开显示您的头像、昵称」，默认**公开**（`isAnonymous = false`）
  - 多商品时每块上方显示「商品 1 / 商品 2 …」
- **提交**：
  1. 校验：每个待评块的 `content` 去空白后必须非空 → 否则 toast「请填写评价内容」并中止
  2. `uni.showModal` 二次确认
  3. 串行调用 `createReview({ productId, orderLineId, variantId, rating, content, images, isAnonymous })`
  4. 全部成功 → toast「评价已提交，审核通过后展示」→ `uni.navigateBack()`
  5. 部分失败 → 保留失败块，toast「N 件商品评价提交失败，请重试」，已成功块从表单移除
- **与 usemall 的一处刻意差异**：usemall 在内容为空时自动填入「此用户没有填写评价」；本页改为**前端拦截必填**。原因：vendure `createReview` 的 `assertContent` 要求 `content` 非空，补默认文案会向评价库写入无意义内容。

**入口**（两处，条件一致）：
- `src/pkg-order/pages/orders.vue` 订单卡片底部
- `src/pkg-order/pages/order-detail.vue` 操作区
- 显示条件：`['Delivered','Completed'].includes(order.state)` 且该订单**存在未评 line**
- 未评判定：`onShow` 时拉一次 `myReviews`，用返回的 `orderLineId` 建 Set，与 `order.lines[].id` 比对；全部已评则该订单显示「已评价」（不可点）
- 未登录：不展示入口按钮

### 4.5 S5 · 我的评价页（新增）

**文件**：`src/pkg-user/pages/my-reviews.vue`（分包 `pkg-user`）
**入口**：`src/pkg-user/pages/profile.vue` 菜单新增一项「我的评价」

- **路由**：`/pkg-user/pages/my-reviews`
- **权限**：需登录（`myReviews` 为 authenticated）；未登录跳 `/pages/login/index`
- **数据**：
  1. `myReviews` 一次全量拉取，前端剔除 `status === 'deleted'`
  2. 去重收集 `productId` → `getProductsByIds(ids)` 补商品名与主图，建 `id → { name, featuredAsset.preview }` 映射；**查不到的 id 跳过该条**（该函数已有此语义）
- **tab**：全部 / 待审核（`pending`）/ 已通过（`approved`）/ 已驳回（`rejected`），计数前端计算
- **条目**：商品缩略图 + 商品名 + 状态标签 + 星级 + 日期 + 评价内容
- **状态标签配色**：`pending` → 警示色、`approved` → 成功色、`rejected` → 危险色（此处状态即主要编码变量，符合语义色使用条件）
- **只读**：不提供修改/删除/追评入口
- **空态**：`EmptyState`「暂无评价」

### 4.6 S6 · 后端改动（vendure review-plugin）

| 文件 | 改动 |
|---|---|
| `packages/review-plugin/src/types.ts` | `ReviewListOptions` 增加 `ratingMin?: number;` `ratingMax?: number;` |
| `packages/review-plugin/src/plugin.ts` | **仅 shop** 的 `ReviewListOptions` input 增加 `ratingMin: Int`、`ratingMax: Int`；admin 版不动 |
| `packages/review-plugin/src/review.service.ts` | `getProductReviews` 在既有 `where` 上按需叠加 `rating` 条件 |

**过滤实现约束**：`getProductReviews` 走 `listQueryBuilder.build()`，同一列不能挂两个 FindOperator。按以下分支合并为单个操作符：

| 入参 | FindOperator |
|---|---|
| 仅 `ratingMin` | `MoreThanOrEqual(ratingMin)` |
| 仅 `ratingMax` | `LessThanOrEqual(ratingMax)` |
| 两者都有 | `Between(ratingMin, ratingMax)` |
| 都没有 | 不叠加（行为与现状完全一致） |

- 入参越界（<1 或 >5）或 `min > max` → 忽略该参数（不抛错，避免拖垮 C 端列表）
- **不做数据库迁移**：`review` 表已有 `rating` 列
- **不改** `getReviews`（admin 版），避免影响后台评价管理页

### 4.7 S3 分档映射表

| chip | rating 区间 | 后端参数 |
|---|---|---|
| 全部 | — | 不传 `ratingMin` / `ratingMax` |
| 好评 | 4 – 5 | `ratingMin=4, ratingMax=5` |
| 中评 | 3 – 3 | `ratingMin=3, ratingMax=3` |
| 差评 | 1 – 2 | `ratingMin=1, ratingMax=2` |

### 4.8 文件清单

**新增（vshop）**

| 文件 | 说明 |
|---|---|
| `src/api/queries/review.ts` | `productReviews` / `reviewStats` / `myReviews` / `createReview` 四个操作的 GraphQL 封装 |
| `src/pkg-product/pages/evaluate.vue` | S3 商品评价页 |
| `src/pkg-order/pages/order-evaluate.vue` | S4 订单评价提交页 |
| `src/pkg-user/pages/my-reviews.vue` | S5 我的评价页 |

**修改（vshop）**

| 文件 | 说明 |
|---|---|
| `src/api/fragments.ts` | S1：`PRODUCT_DETAIL_FRAGMENT` 商品级与 `variants` 级各补 `featuredAsset { preview }`；S4：`ORDER_FRAGMENT` 的 `productVariant` 补 `productId` |
| `src/components/SkuSheet.vue` | S1 分组计数 + 单规格降级 |
| `src/pkg-product/pages/detail.vue` | S1 `pickedSummary`；S2 评价区 |
| `src/pkg-order/pages/orders.vue` | S4 入口按钮 + 未评判定 |
| `src/pkg-order/pages/order-detail.vue` | S4 入口按钮 + 未评判定 |
| `src/pkg-user/pages/profile.vue` | S5 菜单入口 |
| `src/pages.json` | 注册 3 个新页面 |
| `src/i18n/locales/{zh-CN,zh-TW,en,ja,ko}.json` | 见 §4.9 |

**修改（vendure）**

| 文件 | 说明 |
|---|---|
| `packages/review-plugin/src/types.ts` | S6 |
| `packages/review-plugin/src/plugin.ts` | S6 |
| `packages/review-plugin/src/review.service.ts` | S6 |

### 4.9 i18n

新增词条（5 个语言包同步，`review.*` 命名空间）：

```
review.title            用户评价
review.viewAll          查看全部
review.scoreUnit        分
review.goodRate         好评率
review.all              全部
review.good             好评
review.middle           中评
review.bad              差评
review.empty            暂无评价
review.noMore           没有更多了
review.reply            商家回复
review.expand           展开
review.collapse         收起
review.anonymousUser    匿名用户
review.scoreLabel       宝贝评分
review.contentPlaceholder 请输入评价内容
review.contentRequired  请填写评价内容
review.uploadHint       上传图片（最多 6 张）
review.publicProfile    公开显示您的头像、昵称
review.submit           提交评价
review.submitted        评价已提交，审核通过后展示
review.partialFailed    {n} 件商品评价提交失败，请重试
review.myReviews        我的评价
review.myOrderReviewBtn 我要评价
review.reviewed         已评价
review.statusPending    待审核
review.statusApproved   已通过
review.statusRejected   已驳回
review.goodsIndex       商品 {n}
```

**已知偏差**：vshop 现有商品/订单页面文案为**中文硬编码**。本轮新增页面沿用该既例，i18n 键先建后接，不做全站改造（见 §8）。

---

## 5. 错误处理与边界

| 场景 | 处理 |
|---|---|
| 详情页 `productReviews` / `reviewStats` 任一失败 | 评价区整块不渲染，不阻塞商品主内容，不弹错 |
| 详情页商品无评价 | 同上（`totalItems === 0`） |
| 商品评价页首屏失败 | 显示空态 + toast |
| 评价页翻页失败 | 保留已加载列表，`hasMore` 不变，toast 提示 |
| 评价列表图片加载失败 | `VImage` 既有占位逻辑 |
| 提交页未登录 | 跳 `/pages/login/index` |
| 提交时订单状态非 Delivered/Completed | 后端 `UserInputError('Order must be delivered before reviewing')` → toast 原文 |
| 同一 orderLine 重复提交 | 后端 `UserInputError('You have already reviewed this order line')` → toast 原文，并把该块标记为已评 |
| 提交内容为空白 | 前端拦截（§4.4） |
| 图片上传失败 | `ImageUpload` 既有失败提示 |
| 我的评价页 `myReviews` 失败 | 空态 + toast |
| 我的评价页商品批量补拉缺 id | 跳过该条，不渲染占位 |
| 我的评价页评价量大 | 已知限制（`myReviews` 无分页），见 §6 R4 |

---

## 6. 风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | `createReview` 要求订单处于 Delivered/Completed，测试环境可能没有可评订单 | 验收前先把测试订单流转到 Delivered |
| R2 | `autoApprove=false` → 新评价 `status=pending`，C 端商品页看不到，易被误判为「提交失败」 | 提交后明确 toast；我的评价页「待审核」标签可见；操作手册写明 |
| R3 | vendure 后端改动需重新部署并重启服务才生效 | 按既有 vendure 部署流程执行；部署前确认是否需附构建产物 |
| R4 | `myReviews` 无分页参数，评价量大时全量拉取 | 记录为已知限制；后续如需分页再扩 shop SDL |
| R5 | 详情页评价区规格行依赖 `product.variants`；商品评价页依赖 URL 传 `slug` | 匹配不到则不渲染该行，不阻塞列表 |
| R6 | 我的评价页需按 `productId` 补商品信息，商品被删除后缺失 | 跳过该条（`getProductsByIds` 既有语义） |
| R7 | 评价区插入位置若放错（放到富文本之后）会偏离 usemall | 见 §4.0，验收时按顺序目视确认 |
| R8 | `PRODUCT_DETAIL_FRAGMENT` / `ORDER_FRAGMENT` 为多页共享，补字段会增大所有消费页的响应体 | 两处均为**新增字段、无破坏性**；`featuredAsset` 仅多一个 preview URL，`productId` 为一个 ID，体积影响可忽略 |
| R9 | 本轮新增 3 个页面会增大分包体积 | 3 页均落在分包（`pkg-product` / `pkg-order` / `pkg-user`），不影响小程序主包（沿用第一轮决策 1） |

---

## 7. 验收

### 7.1 手机视口截图（390×844，dpr = 2，即 780×1688）

| # | 截图 | 断言 |
|---|---|---|
| 1 | 详情页 SKU 弹层（多规格商品） | 规格组标题带 `(N)` 计数 |
| 2 | 详情页 SKU 弹层（单规格商品） | 规格区整段消失；已选行显示变体名，无「请选择规格」 |
| 3 | 详情页评价区 | 顺序在详情富文本**之前**；标题计数、平均分、好评率、2 条评价齐全 |
| 4 | 商品评价页 · 全部 | 4 个 chip 计数正确 |
| 5 | 商品评价页 · 差评 | 列表随档变化，计数与列表条数自洽 |
| 6 | 订单评价页 | 多商品块、星级、图片、匿名开关；提交成功 toast |
| 7 | 我的评价页 | 三种状态标签各自配色正确 |

截图补入 `docs/superpowers/manual/vshop-usemall-alignment/README.md`（手册升 v1.5），截图脚本扩展 `web-admin/scripts/_vshop_usemall_shots.mjs`。

### 7.2 API 回归

| 用例 | 期望 |
|---|---|
| `productReviews(productId, {ratingMin:4, ratingMax:5})` | 只返回 4-5 星、`status=approved`、`parentId=null` 的主评 |
| `productReviews(productId, {ratingMin:3, ratingMax:3})` | 只返回 3 星 |
| `productReviews(productId)` | 行为与改动前完全一致 |
| `productReviews(productId, {ratingMin:9})` | 忽略越界参数，退化为不筛选 |
| `createReview` 正常路径 | 返回 `status = pending` |
| `createReview` 重复同一 `orderLineId` | `UserInputError` |
| `createReview` 订单未 Delivered | `UserInputError('Order must be delivered before reviewing')` |

### 7.3 部署

- vshop 前端：本地 `npm run build:h5` → 打包 → scp → 站点目录解压（沿用第一轮流程）
- vendure 后端：按既有 vendure 部署流程（见 R3）
- 提交：仅 `git add` 计划内文件，不提交 `dist`

---

## 8. 待办与开放项

| 项 | 说明 |
|---|---|
| 全站 i18n 化 | 本轮新增页面沿用中文硬编码；键已建好，后续统一接入 |
| 我的评价页分页 | 依赖 shop SDL 的 `myReviews` 加 `skip` / `take` |
| 评价「有图 / 标签」筛选 | 依赖 shop SDL 扩 `hasImages` / `tag` |
| 追评、评价有用计数、修改/删除评价 | 后端已具备，前端未做 |
| 拼团页「我的开团 / 我的参团」 | **已关闭，不再是开放项**：参照物亦未实现，故非对齐项；2026-09-29 作为独立需求单独交付（新增 shop SDL `myGroupBuyOrders(isLeader)`，经 `orderId` 关联 `Order.customer` 反查，无迁移），见 §1.4 与 `2026-09-29-vshop-group-buy-my-tabs-design.md` |
| 收藏按钮接真实接口 | 需先注册 `favorite-plugin` 到 `dev-config.ts` |
| 销量 / 积分数据源 | 需后端补商品自定义字段并回填 |
