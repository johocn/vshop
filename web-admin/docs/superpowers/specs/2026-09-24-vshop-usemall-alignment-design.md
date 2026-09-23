# vshop 小程序端对齐 usemall 版式 设计稿

- 日期：2026-09-24
- 状态：设计已定稿，待评审通过后进入实施计划
- 相关资产：`vshop/src`（uni-app C 端，含 H5 与小程序）、`vshop/web-admin`（后台装修页）、`vendure/packages/group-buy-plugin`（本轮唯一后端改动）
- 承接：`docs/superpowers/specs/2026-09-20-shop-style-theme-unify-design.md`（五级可回退风格体系）、nshop 侧同主题手册 `usemall-mall-layout.md`
- **设计输入约定**：以 **usemall 源码逐页 diff（`D:\zhao\usemall`）** 为设计输入，不以截图或通用 mockup 作为设计依据；截图只用于最后 390×844 手机视口验收。

---

## 1. 目标与非目标

### 1.1 目标

把 vshop 的**商品与交易主链页面版式**对齐 usemall，并补齐本轮确认的 A 档能力 + 秒杀/拼团。

| 需求原文 | 落法 |
|---|---|
| 首页对齐 usemall | 新增「限时精选（秒杀）」楼层，走 sections 装修体系（后台可配）+ 全局返回顶部 |
| 分类页对齐 | 左一级类目 + 右侧**可切换内容区**（二级分类格 / 商品列表）+ 商品列表上拉分页 + 右下「切换 + 返回顶部」双悬浮按钮 |
| 详情页对齐 | 规格从内联选项组改为**已选规格行 + 底部 SKU 弹层**；价格区加活动标签/划线价/价格说明；底部栏 3 键 → 5 键 |
| 购物车对齐 | **勾选真生效** + 行内失效/库存预警标签 + 未登录态 + 为你推荐区 |
| 结算页对齐 | 加发票入口行、订单备注行（前端暂存） |
| 秒杀/拼团 | 两个分包页按 usemall 版式重做，并修复现状缺陷 |

### 1.2 非目标（本轮不做）

| 不做项 | 原因 |
|---|---|
| 积分抵扣 | 已实测存在于 `pkg-order/pages/checkout.vue`（`redeemPoints`、与余额混合、可用积分提示），无需改 |
| 会员价展示、收藏、分销等其余 B 档 | 本轮范围锁 A 档 + 秒杀/拼团；`favorite-plugin` 有 Query/Mutation 但未注册进 dev-config |
| 详情页「用户评价区」 | 需新增 shop-api 评价查询 + 列表区 + 查看全部页，属独立能力，后续单独开一轮 |
| 拼团页「我的开团 / 我的参团」两个 tab | 需按当前用户筛团的新后端查询，后续单独开 |
| 结算页备注落库 | 本轮前端暂存，不动后端 |
| 分包结构调整 | `pkg-product`/`pkg-order`/`pkg-after-sale`/`pkg-promotion`/`pkg-user` **原样保留**（小程序主包体积限制） |
| 购物车/结算页既有业务逻辑 | 分箱规则、支付合并、COD 核销收款、台账等一律不碰 |

---

## 2. 现状核查与复用清单

以下结论均来自一手代码与配置核查，非推测。

| 能力 | 现状 | 本次处理 |
|---|---|---|
| 秒杀后端 | `FlashSalePlugin` 已注册（`dev-config.ts`），shop-api 已有 `activeFlashSaleActivities`、`applyFlashSale(activityId)` | 直接复用，不新建 |
| 拼团后端 | `GroupBuyPlugin` 已注册，shop-api 已有 `activeGroupBuyActivities`、`joinGroupBuy` | 复用，但需补字段（见 §6.2） |
| C 端活动接口封装 | `src/api/queries/promotion.ts` 两个查询已就绪 | 复用 |
| 装修 sections 体系 | `src/templates/shared/schema.ts`（`VALID_TYPES=['banner','notice','nav','goods','richText']`）+ `DynamicHome.vue`（componentMap） | 扩展 `flash` 类型 |
| 后台装修页 | `web-admin/src/pages/decorate/home/index.vue` 编辑 5 种 section，写 `Channel.customFields.shopContent`；web-admin 是独立工程，**schema 是本地副本** | 新增 flash 编辑块，四处同步 |
| collection 驱动的商品楼层 | `src/components/FloorSection.vue` + `components/floor/{SingleScroll,DoubleGrid,TripleGrid,HeroWithList}.vue`，配置在 Collection 的 `customFields.floorLayout/floorItemConfig` | **与本次无关，不动** |
| 模板特性开关 | `src/templates/registry.ts` 的 `features.flashSale`（marketplace 模板为 `false`） | 作为楼层门控 |
| 购物车 | `src/pages/cart/index.vue`：勾选是「假勾选」（只影响合计与计数，结算仍全量）；无未登录态、无推荐区 | 见 §5.4 |
| 结算页 | `pkg-order/pages/checkout.vue` 已含积分抵扣；发票有独立页 `pkg-order/pages/invoice-apply.vue` | 只加入口行 |
| 商品详情 | `pkg-product/pages/detail.vue`：规格为内联 `optionGroups`，底部 3 键（海报/加购/立即购买） | 见 §5.3 |
| 分享 | `src/composables/useShare.ts` 已具备 | 复用 |
| 返回顶部 | **不存在**（usemall 有通用组件 `components/use-totop/use-totop.vue`，阈值 `scrollTop > top` 才显示） | 新增主包组件 |
| i18n | `src/i18n/locales/{zh-CN,zh-TW,en,ja,ko}.json` + `web-admin/src/locale/{zh-Hans,en}.json` | 新增词条同步 5+2 包 |

---

## 3. 核心决策记录（用户已逐条确认）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 载体与分包 | 载体 = **vshop（uni-app）**；**分包结构必须保持不动**（小程序主包体积限制）。新公共组件放主包，分包页可引用主包组件，反向禁止 |
| 2 | 范围 | **A 档 + 秒杀/拼团**；不做积分抵扣（已完成）、会员价、收藏、分销 |
| 3 | 秒杀楼层实现方式 | 走 **sections 装修体系**（新增 `flash` 类型，后台可配），不硬编码 |
| 4 | 购物车勾选 | **真正生效**：结算前把未勾选行移出当前订单并本地暂存，返回购物车或支付完成后恢复 |
| 5 | 楼层版式 | **布局可切换**（`layout: 'row' | 'grid2'`），**默认 `row`（横滑单行）** |
| 6 | 详情页「积分 · 销量 · 分享」行 | **降级实现**：「分享」必做（复用 `useShare`）；「销量 / 积分」**有数据才渲染、无数据不占位**，本轮不新增后端字段 |
| 7 | 详情页用户评价区 | **本次不做**，后续单独开 |
| 8 | 结算页订单备注 | **前端暂存，不动后端** |
| 9 | 拼团页 tab | **只做「拼团列表」**，另外两个 tab 后续 |
| 10 | 执行结构 | 按能力**纵切**（每个纵切一个独立任务），连续执行到底 |

---

## 4. 总体架构与落点

### 4.1 新增 / 改动文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/templates/shared/schema.ts` | 改 | 加 `FlashSection` 类型 + `VALID_TYPES` + 校验分支 |
| `src/templates/shared/DynamicHome.vue` | 改 | componentMap 加 `flash` |
| `src/templates/shared/sections/FlashSection.vue` | **新增** | 限时精选楼层（取数、倒计时、两种 layout、回退） |
| `web-admin/src/templates/shared/schema.ts` | 改 | 与 C 端手动同步（独立工程，无法 import） |
| `web-admin/src/pages/decorate/home/index.vue` | 改 | flash 编辑块 + 新增按钮 + `typeLabel` |
| `web-admin/src/locale/{zh-Hans,en}.json` | 改 | 装修页新词条 |
| `src/components/BackTop.vue` | **新增**（主包） | 返回顶部，阈值 300px |
| `src/components/SkuSheet.vue` | **新增**（主包） | 详情页规格弹层 |
| `src/utils/flash-normalize.ts` | **新增** | 活动归一化 + 失效判定的纯函数 |
| `src/api/queries/product.ts` | 改 | `searchProducts` 增 `facetValueFilters` 入参 |
| `src/api/fragments.ts` | 改 | `ORDER_FRAGMENT` 的 `productVariant` 补 `enabled` / `stockLevel` |
| `src/pages/home/index.vue` | 改 | 接入 BackTop |
| `src/pages/category/index.vue` | 改 | mode 切换 + 分页 + facet 迁移 + 双悬浮按钮 |
| `src/pkg-product/pages/list.vue` | 改 | facet 迁移 |
| `src/pkg-product/pages/detail.vue` | 改 | 已选规格行 + 弹层 + 价格区 + 底部 5 键 |
| `src/pages/cart/index.vue` | 改 | 勾选真生效 + 行内状态标签 + 未登录态 + 推荐区 |
| `src/stores/cart.ts` | 改 | 未勾选行暂存/回填 |
| `src/pkg-order/pages/pay-result.vue` | 改 | 支付成功后回填 `pendingLines` 并清空暂存 |
| `src/pkg-order/pages/checkout.vue` | 改 | 发票入口行 + 备注行（前端暂存） |
| `src/pkg-promotion/pages/flash-sale.vue` | 改 | 版式改造 |
| `src/pkg-promotion/pages/group-buy.vue` | 改 | 版式改造 + 修 `joinGroupBuy` 调用 |
| `src/api/queries/promotion.ts` | 改 | 拼团查询补字段（配合 §6.2） |
| `vendure/packages/group-buy-plugin/src/plugin.ts` | 改（后端） | shop-api SDL 补 2 字段 |

### 4.2 `flash` section 契约

```ts
export type FlashSource = 'flashSale';        // 'groupBuy' 枚举预留，本轮不在后台下拉暴露（见 R5）
export type FlashLayout = 'row' | 'grid2';    // 默认 'row'

export interface FlashSection {
    type: 'flash';
    title?: string | Record<string, string>;   // 后台可配，缺省走 i18n 字典
    source: FlashSource;
    layout?: FlashLayout;
    limit?: number;                            // 默认 4，范围 1..20
}
```

校验规则（C 端与后台两份 `isValidShopContent` 同步）：`source` 必须为 `'flashSale'`；`layout` 缺省按 `'row'` 处理；`limit` 缺省 4、越界按 4 处理；`title` 允许字符串或 locale 字典。

**装修 JSON 只存取数配置，不存商品快照** —— 商品数据实时拉接口，避免装修 JSON 与活动状态脱节。

### 4.3 渲染与回退

- 调用 `template.features.flashSale`：为 `false` 时整块不渲染（marketplace 模板即关闭）。
- 取数失败 / 活动列表为空 / 活动归一化后无有效项 → **整块不渲染**（不留白、不占位）。
- 楼层内的「更多 ›」在有数据时才显示。
- 首页仍走既有 `hasShopContent` 分支：没有装修数据的店铺行为完全不变。

---

## 5. 逐页设计

### 5.1 首页

- `src/pages/home/index.vue` 新增 `<BackTop />`（滚动 > 300px 渐显，点击 `pageScrollTo(0)`）。
- `DynamicHome` 增加 `flash` 渲染分支。
- **秒杀楼层版式**（`layout` 可切换；`limit` 默认 4，决定楼层最多取几条活动，两种 layout 共用同一取数）：
  - `row`（默认）：标题行 `⚡ 限时精选 | 距结束 hh:mm:ss | 更多 ›` + 单行横滑列表（每张卡占屏宽约 1/3，首屏可见约 3 张，超出部分横向滑动，共 `limit` 张）。
  - `grid2`：同样标题行 + 双列网格，共 `limit` 格，一屏扫全（默认 4 格 = 2 行）。
  - 卡片内容：图片、名称（最多 2 行）、秒杀价（品牌色）+ 划线原价、角标「秒杀价」、已售进度条 + 百分比。
- **倒计时规则**：整块**只挂一个计时器**，取所有活动里**最先结束**的 `endAt`；到点后重新取数，无有效活动则整块隐藏。**不逐卡挂计时器**（活动数多时会失控）。
- **点击**：卡片 → `/pkg-product/pages/detail?slug=<slug>&flashSaleActivityId=<id>`；「更多」→ `/pkg-promotion/pages/flash-sale`。

**与 usemall 的语义差异（必须记录）**：usemall 是「一个活动含多件商品」（`seckillData.goods_objs`），顶部一个活动级倒计时；vshop 的 `activeFlashSaleActivities` 是**每个活动绑一件商品**的扁平列表。因此楼层卡片是「一卡一活动」，倒计时只能提到楼层级。

### 5.2 分类页

对齐 usemall `pages/tabbar/category.vue`：左一级类目（垂直 `scroll-view`）+ 右侧内容区，右下角**竖排两个悬浮按钮**（`⇄` 切换模式 / `↑` 返回顶部），切换按钮不随模式变化。

- 新增 `mode` 状态：`1` = 二级分类格（保留现有 `sub-grid` 版式）、`2` = 商品列表（双列卡片：图、标题 2 行、价格、划线价）。
- 商品列表接**上拉分页**（现状写死 `take: 10` 且无加载更多），到底显示「没有更多了」。
- **facet 迁移**：`facetValueIds` 在 schema 里是 `@deprecated`，新代码一律用 `facetValueFilters: [{ or: [id] }]`。需给 `searchProducts` 增 `facetValueFilters` 入参，并把两个调用方（`pages/category/index.vue`、`pkg-product/pages/list.vue`）一并迁过去。
- 过滤粒度说明：过滤发生在 `ProductVariant` 上，`groupByProduct` 只做归并。

### 5.3 详情页

对齐 usemall `sub-goods/pages/detail.vue` 的模块顺序：轮播/视频 → 价格区 → 标题 → 元信息行 → 已选规格入口 → （评价区，本轮不做）→ 详情 → 价格说明 → 底部操作栏。

- **价格区**：活动标签（秒杀时显示「秒杀价」）、现价、划线原价、「价格说明 ›」入口。
- **元信息行**：只固定渲染「分享」（复用 `useShare`）；销量/积分**有数据才渲染**，无数据不占位（决策 6）。
- **规格改造**：移除内联 `optionGroups`，改为「已选：<规格> · <数量> 件」入口行，点击弹出 `SkuSheet.vue`。弹层结构：SKU 小图 + 价格 + 库存/限购 + 已选行 + 规格组（选中态）+ 数量器 + 底部「加入购物车 / 立即购买」。选中规格驱动价格与库存联动；库存不足的选项置灰不可选。
- **底部操作栏**：3 键 → 5 键（客服 1 : 收藏 1 : 购物车 1 : 加入购物车 2 : 立即购买 2）。收藏本轮**只做按钮占位**（`favorite-plugin` 未注册，点击给「敬请期待」提示），不接接口。
- **秒杀价生效链路（现状澄清，重要）**：仅当订单上应用了活动才享活动价。详情页拿到 `flashSaleActivityId` 后，在「加入购物车 / 立即购买」成功后需调用 `applyFlashSale(activityId)`；前端不自行算折扣。

### 5.4 购物车

对齐 usemall `pages/tabbar/cart.vue`：

- **未登录态**：空态文案「当前未授权，登录后查看购物车」+「去登录」按钮。
- **商品行**：左侧勾选框 + 图 + **行内状态标签**（会员价 / 库存不足「仅剩 N 件」/ 已下架），右侧名称、规格、价格与划线价、数量器、删除。
  - **修正**：失效与库存预警在 usemall 是**行内标签**，不是独立分区（此前记录有误，以此为准）。
  - 失效行灰显、不可勾选，只能删除。
- **为你推荐**：底部结算栏上方，双列商品卡；复用现有商品查询，按当前渠道取热销。
- **底部结算栏**：「全选 | 合计 ¥x.xx | 去结算(N)」，N 为已勾选行数。
- **勾选真生效（核心）**：
  1. `src/stores/cart.ts` 新增 `pendingLines` 暂存（持久化到 `uni.setStorage`，防小程序被回收），**只存未勾选行**，结构 `{ variantId, quantity }[]`。
  2. 点「去结算」时，对**未勾选行**逐行 `removeOrderLine` 移出 `activeOrder`，并把该行写入 `pendingLines`；随后照常 `navigateTo('/pkg-order/pages/checkout')`——此时订单内只剩已勾选行。
  3. **回填时机有两处，二者语义不同，不可混淆**：
     - `src/pages/cart/index.vue` 的 `onShow`：若存在 `pendingLines` 且当前不在结算流程中，则逐行 `addItemToOrder` 回填，成功后清空 `pendingLines`。
     - `src/pkg-order/pages/pay-result.vue`：进入本页即代表本次结算已结束（无论成功/失败/待确认），**先把 `pendingLines` 逐行回填再清空**。
     - ⚠️ 关键：`pendingLines` 里装的是**未购买**的行，所以支付完成后必须**回填**它们，**不能清空丢弃**（否则这些商品永久丢失）。已购买的行在支付时随订单消耗，本就不在 `pendingLines` 中，不存在「重复加回」问题。
  4. 回填时遇库存不足的行**逐行跳过**并提示，不阻断其余行；回填本身幂等（成功一行即从暂存放移除一行）。
- **失效/库存判定数据源**：给 `ORDER_FRAGMENT` 的 `productVariant` 补 `enabled` 与 `stockLevel` 两个字段即可，**无后端改动**。`line.productVariant` 为空也按失效处理。

### 5.5 结算页

只加两处，**结算页业务逻辑与提交流程一行不碰**（分箱、支付合并、COD 核销、台账等）。

- **发票入口行**：跳已有的 `pkg-order/pages/invoice-apply.vue`，零后端改动。
- **订单备注行**：`textarea`，前端暂存 + 尽力随支付请求的 `PaymentInput.metadata.remark` 透传（Vendure 原生字段，无需后端改）。
  - **风险与兜底**：若某支付方式不经 `addPaymentToOrder`（如跳转支付回传），备注可能丢失。实现时**必须先用真实链路验证一次**；若验证不通过，则本行退回「不做备注」并回报，不硬凑。

### 5.6 秒杀页 / 拼团页（均在 `pkg-promotion` 分包，路由不变）

**秒杀页**（对齐 `sub-marketing/pages/seckill.vue`）：

- 顶部一个倒计时卡（取最先结束的 `endAt`，与首页同理，全页一个计时器）。
- 双列商品网格：图、名称、「秒杀价」角标、秒杀价 + 划线原价、已售进度。
- 底部返回顶部。
- 到点（`@end`）清空并提示「秒杀活动已结束」。

**拼团页**（对齐 `sub-marketing/pages/group.vue`）：

- 顶部 tab 只做「拼团列表」（另两个 tab 本轮不做，界面上不出现）。
- 卡片：商品图、名称、团价 + 划线原价、参团进度（头像点 + 「还差 N 人成团」）、「N 人团 · 剩 mm:ss」标签、「去拼团」按钮。
- **必须修复现状缺陷**：现有调用 `joinGroupBuy(activityId, isLeader)` 漏了必填的 `orderId`，必然报错。正确顺序 = 先确保存在 `activeOrder` → 再加购该活动商品 → 再 `joinGroupBuy(activityId, orderId, isLeader)`。
- 拼团倒计时取 `endAt`，同样整页一个计时器。

---

## 6. 接口与数据契约

### 6.1 前端需改的 fragment / 查询

| 位置 | 改动 | 原因 |
|---|---|---|
| `ORDER_FRAGMENT.productVariant` | 补 `enabled`、`stockLevel` | 购物车失效/库存预警判定 |
| `searchProducts` | 增 `facetValueFilters?: Array<{ or: string[] }>` | facet 过滤去弃用写法 |
| `activeGroupBuyActivities`（前端查询） | 补 `productId`、`variantId` | 拼团卡片需要商品与图（配合 §6.2） |
| 秒杀商品补拉 | 按 `productId` 批量补拉商品名与图 | shop-api 的 `FlashSaleActivity` **不暴露商品名/图**，只暴露 `productId`/`variantId`；沿用 nshop 首页既有「按 id 补拉」套路，前端解决 |

### 6.2 本轮唯一后端改动

`vendure/packages/group-buy-plugin/src/plugin.ts` 的 `shopApiExtensions` SDL 中，`GroupBuyActivity` 补两个字段：

```graphql
productId: ID!
variantId: ID!
```

实体 `GroupBuyActivity` **已有** `productId`/`variantId` 两列，只是 shop-api 未暴露，因此这是纯 SDL 暴露改动，无数据库迁移。

**改法提醒**：后端消费编译产物 `lib/`，必须「改 `src` → `npm run build` → 提交 `src` + `lib`」；只改 `src` 不 build 不生效。

### 6.3 已发现的现状缺陷（本轮顺带修复，均需在计划中单列）

| # | 缺陷 | 影响 |
|---|---|---|
| D1 | `group-buy.vue` 调 `joinGroupBuy` 漏必填 `orderId` | 拼团功能现状必然失败 |
| D2 | `pages/category/index.vue` 使用已弃用的 `facetValueIds` | 服务端可能忽略过滤，商品列表串类目 |
| D3 | 分类页商品列表写死 `take: 10`、无分页 | 类目下商品看不全 |

---

## 7. i18n / 多城市 / 回退

**i18n（多语言）**
- 新增词条必须同步 5 个 C 端语言包：`zh-CN` / `zh-TW` / `en` / `ja` / `ko`；后台同步 `web-admin/src/locale/{zh-Hans,en}.json`。
- 前端固定文案走 i18n 字典；后台可配文案（如楼层标题）用 `LocalizedText = string | Record<locale, string>`，逐级回退：当前 locale → defaultLocale → 首个值 → 内建占位 → i18n 字典。
- 禁止只在单一语言里写死文字；数组型文案用 `tm()` 取。

**多城市**
- 本次涉及的分类、详情、购物车、秒杀拼团**都不按城市分流**（秒杀库存是全局的），无需城市判断分支。
- 但所有图片等静态资源 URL 必须用**基于当前访问域名的动态 origin**（走 `VImage`），**禁止硬编码域名**。

**回退**
- `flash` section 三级回退：接口失败 → 空 → 配置非法，任一命中整块不渲染。
- 模板特性开关 `features.flashSale=false` 时不渲染。
- 无装修数据的店铺仍走模板兜底首页，行为不变。

---

## 8. 测试与验收

**逐页验收（硬性）**
1. 本地构建通过。
2. 部署后再验收（本地构建 → 上传 → 服务器解压/`pm2 restart`，绝不在服务器构建）。
3. **每页用 390×844 手机视口（dpr=2）截图**，并把截图补进操作手册：`web-admin/docs/superpowers/manual/vshop-usemall-alignment/`。

**探针脚本断言**（新建 `vshop/web-admin/scripts/_smoke_usemall_align.py`，沿用同目录既有 `_smoke_picking_live.py` 套路）
- 秒杀：`activeFlashSaleActivities` 返回条数 > 0，且归一化后 `productId` 全部可补拉到商品。
- 拼团：`activeGroupBuyActivities` 返回项含 `productId`/`variantId`（验证 §6.2 生效）。
- 购物车勾选：勾 2 行去结算后 `activeOrder.lines` 数量 = 2（其余行进入 `pendingLines`）；模拟回到购物车触发回填后，`activeOrder.lines` 数量恢复为原值。
- 分类：带 `facetValueFilters` 与不带时 `totalItems` 不同（证明服务端过滤生效）。
- 详情：`applyFlashSale` 后订单出现活动折扣行。

**验收口径**
- 判定以 390×844 手机视口截图为准，不以桌面视口或代码阅读为准。
- 每一纵切完成后立刻回归，不攒到最后一起验。

---

## 9. 已知偏差与风险

| # | 项 | 说明与应对 |
|---|---|---|
| R1 | 购物车勾选真生效的实现方式 | vshop 用 Vendure `activeOrder`，**结算必然全量**，与 usemall（自有购物车表，可部分结算）本质不同。只能「移出 + 暂存 + 回填」模拟。已知偏差：行 id 会变、促销与优惠券按剩余行重算（这本就是应有行为） |
| R2 | 暂存与回填的边界 | `pendingLines` 只装**未购买**行，支付完成后必须**回填**而非清空（见 §5.4 第 3 步）；回填逐行幂等，遇库存不足逐行跳过并提示 |
| R3 | 结算页备注 | 依赖 `PaymentInput.metadata` 透传，若链路不通则退回不做（见 §5.5） |
| R4 | 秒杀楼层商品名/图 | shop-api 不暴露，靠前端按 `productId` 补拉；补拉失败的那一条**单独跳过**，不整块隐藏 |
| R5 | 拼团楼层 | 本轮 `source` 只支持 `flashSale`；`groupBuy` 枚举预留但**不在后台下拉里暴露**，等 §6.2 字段上线后再开 |
| R6 | 收藏按钮 | 本轮只占位，不接接口（`favorite-plugin` 未注册） |
| R7 | 展示层元信息 | 销量/积分无数据源，采用「有则显示」降级，可能与 usemall 版式有细微差异 |
| R8 | 后端改动范围 | 只有 §6.2 一处 SDL 暴露；不改任何数据库结构，不需要迁移脚本 |

---

## 10. 实施顺序（按能力纵切，每纵切一个独立任务）

| 纵切 | 内容 | 完成判据 |
|---|---|---|
| V1 底座 | schema 四处同步、`flash` section 契约、`BackTop.vue`、后台装修页 flash 编辑块、i18n 词条骨架 | 后台能配出 flash 楼层；无装修数据店铺首页行为不变 |
| V2 首页楼层 | `FlashSection.vue` 取数/渲染/两种 layout/回退、商品补拉、首页接入 BackTop | 楼层正常显示、倒计时正确、空数据整块不渲染 |
| V3 分类页 | `mode` 切换、双悬浮按钮、上拉分页、facet 迁移（含 D2/D3） | 两种模式可切；分页正常；带 filter 后 `totalItems` 变化 |
| V4 详情页 | `SkuSheet.vue`、已选规格行、价格区、元信息行降级、底部 5 键、`applyFlashSale` 联动 | 弹层选规格驱动价格与库存；秒杀价能落到订单 |
| V5 购物车 | fragment 补字段、勾选真生效（暂存/回填）、行内状态标签、未登录态、推荐区 | 勾 2 行 → 结算只有 2 行；返回后恢复 |
| V6 秒杀/拼团 + 结算 | 两页版式改造、修 D1、§6.2 后端字段、结算页发票与备注行 | 拼团「去拼团」成功；备注链路验证结论明确 |

---

## 11. 待办与开放项

- §5.5 备注透传链路的验证结论（通过 → 保留；不通过 → 退回不做并记录）。
- §6.2 后端字段上线后，是否开放 `flash` section 的 `groupBuy` 来源（本轮先不开）。
- 详情页评价区、拼团页另外两个 tab：另开一轮，各自独立 spec。