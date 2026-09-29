# vshop 对齐 usemall 版式 操作手册

## 1. 范围与版本

| 项 | 值 |
|---|---|
| 版本 | v1.5（2026-09-29，拼团页新增「我的开团 / 我的参团」两会话 tab，见 §5.9） |
| 设计文档 | `web-admin/docs/superpowers/specs/2026-09-24-vshop-usemall-alignment-design.md`；本轮：`web-admin/docs/superpowers/specs/2026-09-29-vshop-group-buy-my-tabs-design.md` |
| 执行计划 | `web-admin/docs/superpowers/plans/2026-09-24-vshop-usemall-alignment-plan.md`；本轮：`web-admin/docs/superpowers/plans/2026-09-29-vshop-group-buy-my-tabs-plan.md` |
| 只读探针 | `web-admin/scripts/_smoke_usemall_align.py` |
| 截图脚本 | `web-admin/scripts/_vshop_usemall_shots.mjs`（版式截图，含拼团三 tab）、`web-admin/scripts/_vshop_cart_invalid_shots.mjs`（购物车「已下架」回归 + 截图） |
| 线上环境 | C 端 H5 + shop-api：`https://e.joho.cn`；后台：`https://e.joho.cn/guanli` |
| 本轮范围 | 首页秒杀楼层、分类页双模式、详情页 SKU 弹层与 5 键、购物车勾选真生效/未登录态/推荐/**失效行「已下架」**、秒杀页与拼团页版式（**v1.5 起拼团页含「我的开团 / 我的参团」两 tab**）、结算页发票入口行 |
| 回归账号 | C 端测试客户 `qa-vshop-manual@local.dev` / `Qa123456`（生产新建，customer id=139）；后台 `superadmin` / `z123123` |

> **本文中「备注行」的最终状态是「已回退不做」**，原因见 §5.2。
> **v1.1 相对 v1 的增量**：三类线上阻塞缺陷修复（分类页、秒杀补拉、pm2 内存）+ 演示数据 + 全部截图重采，见 §5.5。
> **v1.2 相对 v1.1 的增量**：二次线上复验发现「购物车冷启动/刷新一律误报空车」，已修复并重新构建部署、复验通过，见 §5.6；线上产物入口哈希随之更新，见 §5.4。
> **v1.3 相对 v1.2 的增量**：v1.2 里被记为「未交付」的购物车失效行（§5.3）已补交付 —— 后端 cjk-plugin 的 shop SDL 扩展 `ProductVariant.enabled`，前端恢复失效行判定与「已下架」标签，见 §5.7；同时首次产生**后端代码改动**并部署，见 §5.4。
> **v1.4 相对 v1.3 的增量**：default 渠道分类体系重建（4 个一级 + 8 个二级，`product-id-filter` 挂真实商品），旧的 4 个空壳分类设为私有；并修复「分类页点二级分类进去商品列表为空」的参数错配，见 §5.8。本轮**只动 H5**，无需重启后端。
> **v1.5 相对 v1.4 的增量**：拼团页从「仅拼团列表」变为 **三 tab**（拼团列表 / 我的开团 / 我的参团），后端新增 shop SDL `myGroupBuyOrders(isLeader)`（**无数据库迁移**），见 §5.9。本轮**含后端改动**，部署顺序为「先后端 → 再 H5」。

---

## 2. 涉及页面与入口

H5 为 hash 路由，`#` 后为页面路径。

| 页面 | 路由 | 进入方式 |
|---|---|---|
| 首页（秒杀楼层 + 返回顶部） | `/#/pages/home/index` | 直接访问站点根，或底部「首页」 |
| 分类页（双模式 + 双悬浮按钮） | `/#/pages/category/index` | 底部「分类」 |
| 商品详情（SKU 弹层 + 底部 5 键） | `/#/pkg-product/pages/detail?slug=<slug>` | 首页/分类页点商品 |
| 购物车（勾选真生效 / 未登录态 / 为你推荐 / 失效行「已下架」） | `/#/pages/cart/index` | 底部「购物车」 |
| 结算页（发票入口行） | `/#/pkg-order/pages/checkout` | 购物车勾选后点「结算」 |
| 秒杀页 | `/#/pkg-promotion/pages/flash-sale` | 首页秒杀楼层右上「更多 ›」；或直接访问 |
| 拼团页（三 tab：拼团列表 / 我的开团 / 我的参团） | `/#/pkg-promotion/pages/group-buy` | 直接访问（首页 sections 内暂无拼团入口；`flash` 楼层的 `source=groupBuy` 枚举已预留但后台不暴露） |

购物车/结算页需登录；未登录时购物车显示引导态（「当前未授权，登录后查看购物车」+「去登录」），这本身是本轮交付项之一。

---

## 3. 后台配置说明

### 3.1 首页「限时精选（秒杀）」楼层

装修页（sections 体系）新增 `flash` 类型 section，字段：

| 字段 | 说明 |
|---|---|
| `type` | 固定 `flash` |
| `title` | 楼层标题，字符串或 locale 字典（`LocalizedText`），逐级回退 |
| `source` | 本轮只开放 `flashSale`（秒杀活动）；`groupBuy` 枚举已预留但**后台下拉不暴露**，等后端字段稳定后再开 |
| `layout` | `row`（横滑单行，默认） / `grid2`（两列网格） |
| `limit` | 最多取几条活动，默认 4，范围 1..20 |

数据来源固定为**进行中的秒杀活动**（`activeFlashSaleActivities`）；商品名与图片 shop-api 不暴露，由前端按 `productId` 补拉（`getProductsByIds`），**补拉失败的那一条单独跳过**，不整块隐藏。

### 3.2 空数据与关闭状态的表现

- 该渠道**没有任何进行中的秒杀活动**时，楼层整块不渲染（不占位、不显示空壳）。
- **单条活动的商品补拉失败时只跳过那一条**，不做整块隐藏；但如果**全部**补拉都失败（例如变量类型写错导致 GraphQL 400），楼层会因 `items.length === 0` 整块消失 —— v1 线上就是这个表现，根因与修复见 §5.5 缺陷 #2。
- 渠道模板为 `marketplace` 时秒杀楼层不渲染。
- 首页 sections 为空时自动回退到默认模板首页（`DefaultHome`）；v1.1 起 default 渠道已写入 `shopContent`，线上走的是 `DynamicHome`（见 §5.5）。

---

## 4. 手机截图（390×844 / dpr=2）

截图目录：`web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/`
采集脚本：`web-admin/scripts/_vshop_usemall_shots.mjs`（Playwright，移动视口 390×844，`deviceScaleFactor=2`）

```bash
# 游客态（购物车引导态）
node web-admin/scripts/_vshop_usemall_shots.mjs
# 登录态（详情 SKU 弹层 / 购物车勾选真生效）——登录走 shop-api 原生登录 + 注入 localStorage
node web-admin/scripts/_vshop_usemall_shots.mjs --user qa-vshop-manual@local.dev --pwd 'Qa123456'
# 只重采分类页三张（不碰购物车存量）
node web-admin/scripts/_vshop_usemall_shots.mjs --only category
# 购物车「已下架」失效行（自带前后对照 + 后台下架/复原，见 §5.7）
node web-admin/scripts/_vshop_cart_invalid_shots.mjs
```

脚本用 `SITE_URL` 指定站点（默认 `https://e.joho.cn`）；Playwright 依赖按 `PW_ROOT` → 本机 vendure 依赖 → 就近 `node_modules` 顺序解析，并自动挑一个已存在的 chromium，无需先跑 `npx playwright install`。

| 文件 | 覆盖点 | 截图内实测内容 |
|---|---|---|
| `home-flash-floor.png` | 首页楼层（含秒杀楼层）+ 返回顶部 | ✅ 轮播 3 图 + 「限时精选」标题 + 倒计时（快照 `21:42:00`，随剩余时间变化）+ 「更多 ›」+ 秒杀价 `¥99.00`（原价 `¥168.00` 划线）+ 库存进度 `0%` + tabbar 角标 `2` |
| `category-modes.png` | 分类页默认模式（二级分类格） | ✅ 左栏 4 个一级分类（温泉度假/汽车服务/黄金珠宝/生鲜食品）；右侧二级分类格「温泉门票 / 温泉住宿」+ 右侧 `⇄` / `↑` 双悬浮按钮（v1.4 重建数据后重采，见 §5.8） |
| `category-sub-list.png` | 点二级分类 → 商品列表页 | ✅ 点「温泉门票」→ `/#/pkg-product/pages/list?collectionSlug=hot-spring-tickets`，「商品列表」页 3 条：国信南山温泉门票 ¥168.00 / 国信南山温泉工作日门票 ¥168.00 / 国信南山节假日门票 ¥198.00 + 「没有更多了」（v1.4 新增，证明二级分类跳转真的按分类筛出商品） |
| `category-mode-list.png` | 分类页另一模式（商品列表） | ✅ 点 `⇄` 后切到商品列表模式，展示「温泉度假」的 6 个商品（国信南山温泉门票 ¥168.00 / 工作日门票 ¥168.00 / 节假日房间 ¥880.00 / 工作日房间 ¥688.00 / 节假日门票 ¥198.00 / 酒店测试-豪华套房 ¥888.00）+ 「没有更多了」（v1.4 重建数据后重采） |
| `detail-sku-sheet.png` | 详情页 + SKU 弹层 | ✅ 页面价 `¥168.00` + 底部 5 键（客服/收藏/购物车/加入购物车/立即购买）；弹层含价格、已选、数量步进、加入购物车、立即购买 |
| `cart-select-real.png` | 购物车勾选真生效 | ✅ 自营 1 件，行项 `☑`、数量 3、`¥168.00`；「为你推荐」4 条；全选 `☑`；合计 `¥504.00`；`结算(1)`；tabbar 角标 3 |
| `cart-select-partial.png` | 同上，取消勾选后 | ✅ 行项 `☐`、全选 `☐`、合计 `¥0.00`、`结算(0)` 置灰禁用 —— **证明勾选参与结算金额与按钮可用性** |
| `cart-invalid-before.png` | 失效行**对照图**（变体在售） | ✅ 行正常色、勾选框 `☑`、全选 `☑`、合计 `¥504.00`、`结算(1)` 橙色可点 |
| `cart-invalid-line.png` | 失效行「已下架」（后台把该变体 `enabled=false`） | ✅ 行灰显（`opacity .55`）+ 灰色「已下架」标签 + 勾选框 `☐`；全选 `☐`、合计 `¥0.00`、`结算(0)` 置灰禁用 —— **证明失效行不参与勾选与结算** |
| `cart-invalid-toast.png` | 点失效行勾选框 | ✅ toast「该商品已下架，请删除」 |
| `cart-guest-and-reco.png` | 购物车未登录引导态 | ✅ 「当前未授权，登录后查看购物车」+「去登录」；未登录时**不渲染**「为你推荐」（推荐区需登录，见 `cart-select-real.png`） |
| `flash-sale-page.png` | 秒杀页 | ✅ 倒计时头 + 活动卡片（秒杀价 `¥99.00` / 原价 `¥168.00` 划线 / 进度 `0%`） |
| `group-buy-page.png` | 拼团页 · 拼团列表 tab | ✅ 顶部三 tab（**拼团列表** / 我的开团 / 我的参团，列表态下划线激活）+ usemall 版式卡片：`¥128.00` / 原价 `¥168.00` 划线 / 进度点 2/3 + 「还差 1 人成团」/ 「3 人团 · 剩 155:55:42」（快照值，随剩余时间变化）/ 「去拼团」（v1.5 重采） |
| `group-buy-mine-leader.png` | 拼团页 · 我的开团 tab（登录态） | ✅ 头行状态「拼团中」+ 「3 人团 · 剩 155:56:45」（快照值）；左图右文卡片（商品名 + 拼团价 `¥128.00` + 进度点 2/3 + 「还差 1 人成团」）；**整宽**「查看订单」按钮（v1.5 新增，见 §5.9） |
| `group-buy-mine-join.png` | 拼团页 · 我的参团 tab（登录态） | ✅ 与「我的开团」同版式，数据源为 `isLeader=false` 的拼团记录（v1.5 新增） |
| `group-buy-mine-guest.png` | 拼团页 · 未登录态 | ✅ 切到「我的开团」时显示引导「登录后查看我的拼团」+「去登录」按钮；不渲染任何团卡片（v1.5 新增） |
| `detail-page.png` | 详情页主体 | ✅ 主图、价格、标题、分享/海报、「已选」行、服务区、底部 5 键 |

> 采集前置：C 端测试客户已登录（`cart-select-*`）；跑脚本时详情页弹层会再加购 1 件，因此购物车数量就是「跑脚本前的存量 + 1」。本版截图是在存量 2 件时采集的，故呈现「1 行 / 数量 3 / 合计 ¥504.00 / 角标 3」。

---

## 5. 验收结论

### 5.1 只读探针（生产 shop-api）

```
== 探针目标：https://e.joho.cn/shop-api ==
[flash] 活动数=1
[flash] productId 断言通过（1 个全部可补拉）
[group-buy] 活动数=1
[group-buy] productId/variantId 断言通过
[facet] 分类=hot-spring 不带过滤=6 单分面(8)过滤=2 该分面count=2
[facet] 服务端过滤生效断言通过
[cart] activeOrder 行数=1（人工核对：勾选 N 行结算时应为 N）
[cart] ORDER_FRAGMENT 的 enabled / stockLevel 断言通过
== 全部断言通过 ==
```

> v1.3 起探针的 `[cart]` 段已带上 `AUTH_TOKEN`（C 端测试客户）实跑，不再走「无 activeOrder，跳过」分支；新增断言要求 shop-api 的 `ProductVariant.enabled` 是 `Boolean`（这是 §5.7 失效行判定的服务端前提）。
>
> **2026-09-29 追加修正（`[facet]` 段）**：原断言用「该分类**全部**分面值的或集」过滤再要求 `totalItems` 变化 —— 该或集必然覆盖分类内全部商品，是恒等式 no-op。v1.3 及更早之所以没暴露，是因为 `collections[0]` 一直是**无商品的空壳分类**（`ids` 为空 → 走「该分类无 facet，跳过」分支）；v1.4 新建 `hot-spring`（6 商品）成为首个顶级分类后，断言首次真正执行并**恒定失败**，还会中断后续 `[cart]` 段。现改为：自动跳过「无商品/无分面」的分类，改用**单个**分面值过滤，断言 `过滤结果 == 该分面 count`（本例 `6 → 2`，与分面「支持邮寄」count=2 吻合），才真正验证服务端过滤生效。

关键点：**`activeGroupBuyActivities` 已能返回 `productId` / `variantId`**（Task 1 的后端 SDL 扩展已上线并生效），这是拼团页「去拼团」能落单的前提。v1.1 中秒杀与拼团均已各有 1 条进行中活动，因此 `[flash]` 补拉断言与 `[group-buy]` 断言都真正跑到了断言体（v1 时因活动数为 0 被跳过）。

### 5.2 结算页备注链路：**验证不通过 → 已按设计 §5.5 回退移除**

设计 §5.5 允许「备注随 `PaymentInput.metadata` 尽力透传」，并要求**必须先用真实链路验证一次**，不通过则退回不做。实测结论是**不通过**，证据链：

1. 前端确实把备注放进了 `PaymentInput.metadata`——`checkout.vue` 调 `addPaymentToOrder(method, { remark })`，而 `src/api/mutations/checkout.ts` 发的是 `addPaymentToOrder(input: { method, metadata })`。
2. 后端 `order.service.js` 把 `input.metadata` 交给 `paymentService.createPayment`。
3. 但 `payment.service.js` 里 Payment 是由**handler 的返回值**构造的：`new Payment({ ...result, method, state })`，**客户端传入的 metadata 不参与构造**。
4. 本系统全部支付 handler 都只返回自己的 metadata、丢弃入参：
   - `cjk-plugin/src/payment/cod-handler.ts` → `metadata: { method: 'cash-on-delivery' }`
   - `wechatpay-plugin/src/wechatpay-handler.ts` → `metadata: { public: {...} }`
   - `cjk-plugin/src/wallet/balance-wallet-payment-handler.ts` → `metadata: { remainingBalance }`
5. 生产库旁证：`payment` 表 36/36 行 metadata 全为 `{"method":"cash-on-delivery"}`，即 handler 写入值，无任何客户端字段。

附带事实：wechatpay handler 注释指出 shop-api 的 `Payment.metadata` resolver 只返回 `metadata.public`，即使存住 C 端也读不到。

**处理**：按兜底移除备注行（模板块、`orderRemark` 状态、`paymentMetadata.remark` 透传、`.remark-block` 样式全部删除），提交 `revert(checkout): 移除订单备注行——实测 metadata 透传不成立`。**发票入口行保留**（零后端改动，跳已有 `pkg-order/pages/invoice-apply.vue`）。

### 5.3 规格偏差与未交付项

| 项 | 说明 |
|---|---|
| 结算页订单备注 | 规格原为「前端暂存 + metadata 尽力透传」，实测链路不成立，按设计兜底**退回不做**（§5.2） |
| 购物车「已下架」行内标签 | ~~未交付~~ → **v1.3 已交付**：原计划补 `ProductVariant.enabled` 判定失效行，v1.2 时因 **shop-api 的 `ProductVariant` 不暴露 `enabled`**（仅 admin-api 有）而回退。v1.3 已在后端 cjk-plugin 的 shop SDL 扩展该字段，前端恢复 `invalid` 状态与「已下架」标签，见 §5.7 |
| 分类页商品为空 | ~~未交付~~ → **v1.4 已修复**（数据 + 代码，见 §5.8）。v1.1 时只是把非法查询改好，商品仍为 0：default 渠道的 4 个一级分类（`electronics`/`home`/`personal-care`/`food`）用的是 `facet-value-filter`（`facetValueIds=["1".."4"]`，来自 `品类` facet），而该渠道**无任何一个在售商品打过 facetValue**，因此分类命中数恒为 0；且这 4 个分类的语义（数码电子/家居生活）与现存商品（温泉门票/汽修/生鲜）完全不匹配 |
| 详情页 SKU 弹层无规格分组、缩略图为灰底占位 | 触发弹层的商品（国信南山温泉工作日门票）只有 1 个变体、`optionGroups` 为空，弹层仍按通用样式显示「已选：请选择规格」且左上缩略图取不到图。属**既有 UX 小瑕疵**，本轮不改 `SkuSheet.vue`，记录为已知偏差 |
| 拼团页「我的开团 / 我的参团」 | ~~需按当前用户筛团的后端查询，本轮不做（spec §1.2）~~ → **v1.5 已交付**（后端 `myGroupBuyOrders` + 前端三 tab，见 §5.9）。注：该项在本轮之前被列为「不做」的依据是 **usemall 参照物本身也未实现**（其 `group.vue` 的 navList 被 `v-if="false"` 隐藏），v1.5 按用户追加需求单独交付 |
| 详情页用户评价区、销量/积分元信息 | 无数据源，采用「有则显示」降级，本轮不新增后端字段（spec R6/R7） |

### 5.4 线上产物核对（v1.5 重新构建部署后复核）

| 产物 | 部署方式 | 线上入口 | 核对 |
|---|---|---|---|
| vshop H5 | 本地构建 → tar → scp → 服务器备份/清空/解压 | `https://e.joho.cn/` | v1.5 重新构建部署后入口为 `assets/index--umdIy5c.js`（已实测 200）；线上 121 个文件，与本地一致 |
| web-admin | `web-admin/scripts/deploy.mjs`（本地构建 → scp → 解压 `/guanli` + nginx reload） | `https://e.joho.cn/guanli/` | 线上 533 个文件；入口 `assets/index-DFicyhQq.js`（该产物已含装修页 `flash` 楼层编辑块：`pages-decorate-home-index.CwPZYhlD.js` 内含 `flashSale`）。**v1.5 未改动 web-admin，未重新部署** |
| vendure 后端 | `git pull --ff-only` + `pm2 restart vendure vendure-worker` | `/shop-api` | v1.5 改动：group-buy-plugin 的 shop SDL 新增 `MyGroupBuyOrder` 类型与 `myGroupBuyOrders(isLeader: Boolean!)` 查询 —— 提交 `cd454ab26`（新增）+ `6ee4a3add`（修复 Postgres `int = varchar` 报错）。重启后实测：未登录返回 `[]`、登录后 `isLeader=true/false` 各返回 1 条含 `orderCode` 的记录 |

> v1.1 曾把 web-admin 入口记为 `assets/index-D5PSCjyp.js`，那是更早一次构建的哈希；线上实际入口是 `assets/index-DFicyhQq.js`（后台产物不入库，`web-admin/dist` 被 gitignore，故以线上实测值为准）。
>
> v1.3 只动 `src/pages/cart/index.vue`、`src/utils/flash-normalize.ts`、`src/api/fragments.ts`（三处均与失效行相关），因此 H5 入口哈希由 v1.2 的 `index-Bwz4jGda.js` 变为 `index-0DlrE3ZT.js`；web-admin 本轮无改动，未重新部署。
>
> v1.4 只动 `src/pages/category/index.vue`、`src/pkg-product/pages/list.vue`（纯前端），H5 入口哈希变为 `index-Dgd4xEQw.js`；**后端与 web-admin 均无改动，未重启、未重新部署**。数据侧改动（建分类/停旧分类/启用 3 个生鲜商品）走 admin-api，无需重启进程。
>
> v1.5 动 `src/pkg-promotion/pages/group-buy.vue`、`src/api/queries/promotion.ts`、5 个 `src/i18n/locales/*.json`（纯前端）+ vendure `group-buy-plugin`（后端），H5 入口哈希变为 `index--umdIy5c.js`；web-admin 无改动。**本轮后端有改动，必须按「先后端 → 再 H5」顺序**：`myGroupBuyOrders` 若在 shop SDL 上线前被前端调用，会被 GraphQL 校验拒绝（`Cannot query field "myGroupBuyOrders"`），「我的开团/我的参团」两 tab 直接报错。
>
> **部署顺序**：后端必须先上线。新的 `ORDER_FRAGMENT` 会带 `enabled`，若 shop SDL 还没这个字段，`activeOrder` 查询会被 GraphQL 校验直接拒绝（`Cannot query field "enabled"`），购物车整体报错。本次即按「先后端 → 再 H5」执行。
>
> v1.5 服务器 `git pull` 时被 `product-survey-plugin` 的本地未提交改动阻塞（`git diff origin/master` 显示差异仅 `.d.ts` 的 prettier 多行/单行格式化与 `.ts` 缺尾换行，**`.js` 完全一致 → 运行时无差异**）。处理：先 `cp` 备份到 `/tmp/vendure_bak/`，再 `git checkout -- packages/product-survey-plugin`，`git pull --ff-only` 成功。
>
> vendure 重启后 `/shop-api` 会有 30–60 秒冷启动 502 窗口，`Start-Sleep` 后重试即恢复。
>
> v1.2 重新构建部署的原因是 §5.6 的购物车冷启动修复；修复只动 `src/pages/cart/index.vue`，因此 H5 入口哈希由 `index-C_Q5FXhL.js` 变为 `index-Bwz4jGda.js`。
>
> 本地构建直接在主工作区 `d:\zhao\vshop` 进行：构建前 `git status` 只有本次计划内的改动与未跟踪的 `web-admin/docs/superpowers/manual/`，**不存在他人未提交 WIP**，故无需走临时 worktree。

### 5.5 v1.1 新增：线上阻塞缺陷修复与演示数据

三轮线上回归中暴露出 3 个**阻塞能否验收**的缺陷，均已修复并上线：

| # | 缺陷 | 根因 | 处理 |
|---|---|---|---|
| 1 | 分类页永远空态 | `src/pages/category/index.vue` 的 collections 查询里写了 **`Collection` 类型不存在的 `facetValues` 字段**，整条 GraphQL 被校验拒绝（`Cannot query field "facetValues" on type "Collection"`），`categories` 恒为空 | 去掉该非法字段；`loadProducts` 同步去掉 `facetValues → facetValueFilters`，改为按 `collectionSlug` 拉取（与 mode=2 语义一致） |
| 2 | 首页秒杀楼层不渲染、秒杀页恒「暂无秒杀活动」 | `src/api/queries/product.ts` 的 `getProductsByIds` 声明 `$ids: [ID!]!`，但 Vendure `ProductFilter.id.in` 是 **`[String!]`**，补拉商品必 400（`Variable "$ids" of type "[ID!]!" used in position expecting type "[String!]"`），且 `FlashSection` 在补拉失败时整块不渲染 | 变量类型改为 `[String!]!`；`web-admin/scripts/_smoke_usemall_align.py` 里复刻的同一条查询一并修正 |
| 3 | 站点间歇 502 / 详情页 `pageerror` / 购物车显示空 | vendure pm2 `restarts=97`、1.8G 内存被吃到只剩 179MB，dmesg 有 `Out of memory: Killed process` —— 进程被内核 OOM 反复杀 | `pm2 delete` + 重建：`vendure --max-old-space-size=512 --max-memory-restart 600M`、`vendure-worker --max-old-space-size=256 --max-memory-restart 400M`，并 `pm2 save` 固化。恢复后两进程 `restarts=0`，available 内存回到 466MB。**注意**：OOM 会让「购物车显示空」变频繁，但该现象真正的可复现根因是客户端时序问题，见 §5.6 |

**为让截图能反映真实版式，在生产 default 渠道造了演示数据**（均为新增，不改动既有数据）：

| 数据 | 明细 |
|---|---|
| 秒杀活动 id=1 | 「限时精选-演示」，`active`，商品 59 / 变体 57（国信南山温泉工作日门票），秒杀价 ¥99.00，库存 100，限购 1，起止 = now-1h ~ now+24h |
| 拼团活动 id=1 | 「拼团演示-温泉门票」，`active`，同商品/变体，拼团价 ¥128.00，成团 3 人，上限 10，团长优惠 ¥10，起止 = now-1h ~ now+7d |
| 渠道 `shopContent` | default 渠道装修 JSON：`banner`（3 图）+ `flash` 楼层（`title={zh-CN:限时精选,en-US:Flash Picks}`、`source=flashSale`、`layout=row`、`limit=4`） |
| C 端测试客户 | `qa-vshop-manual@local.dev` / `Qa123456`（customer id=139，生产 `requireVerification=false`，注册后可立即登录） |

> 上述造数都是一次性运维动作（走 admin-api，脚本为临时文件、未入库），这里只记录**最终值**以便核对与复原。生产 `shopContent` 若后续由后台装修覆盖，秒杀楼层按 §3.1 的字段约定继续生效；活动过期后需重新建一条进行中的活动，秒杀/拼团楼层才会再次出现。

### 5.6 v1.2 新增：购物车冷启动误报空车（已修复）

二次线上复验时发现一个**影响购物车可信度**的缺陷：

| 现象 | 复现 | 根因 | 处理 |
|---|---|---|---|
| 已登录且有商品的账号，**直接打开 / 刷新 `/#/pages/cart/index`** 时页面显示「购物车是空的」、tabbar 角标也消失；但从首页点进购物车一切正常 | Playwright 冷启动直开购物车、以及在购物车页 `reload()`，各等 4s / 12s 两次，均稳定复现；同上下文「先首页再购物车」则正常 | 页面数据是 `onShow` 里一次性拉取：冷启动时 `onShow` 早于 `App.onLaunch` 的 `await initTenant()` 与 `restoreSession()` 完成，`getShopApiHeaders()` 拿到的 `vendure-token` / `Authorization` 都为空，`activeOrder` 恒为 `null`；页面既不重试也不响应登录/渠道就绪事件，于是停在空车态 | `src/pages/cart/index.vue`：`onShow` 先 `await waitTenantReady()`（监听 `tenantStore.tenantReady`，异常时最多等 8s）再拉取；渠道与登录 token 就绪后才发请求 |

复验证据（Playwright，390×844 / dpr=2，同一账号；`no-query` = 无查询串，`with-cb` = 带 `?cb=<时间戳>` 冷加载）：

```
[cart-after-reload] 购物车 自营 1 件 ☑ 国信南山温泉工作日门票 ¥168.00 - 3 + × 为你推荐 … ☑ 全选 合计: ¥504.00 结算(1)   ← 修复后
[no-query / with-cb 各 wait=4000ms / 12000ms] 均为上述正确内容（冷启动直开购物车同结论）；修复前这 5 种走法全部是「购物车是空的」
```

> 说明：v1.1 §5.5 缺陷 #3 曾把「购物车莫名显示空」归因于 vendure OOM；OOM 确有其事且已修，但购物车空车的**可复现根因是本节这个客户端时序问题**，OOM 只会让现象更频繁。两处均已修复。

### 5.7 v1.3 新增：购物车失效行「已下架」（补交付，含后端改动）

v1.2 §5.3 把「购物车『已下架』行内标签」记为**未交付项**，卡在服务端：Vendure 默认只在 `admin-api` 的 `ProductVariant` 上暴露 `enabled`，`shop-api` 的 `ProductVariant` 没有该字段，C 端拿到 `activeOrder` 后无法判定哪一行已下架。v1.3 补上这个缺口。

| 层 | 改动 | 说明 |
|---|---|---|
| 后端 | `packages/cjk-plugin`：`shopApiExtensions` 里新增 `extend type ProductVariant { enabled: Boolean! }` | 直读实体列 `ProductVariant.enabled`，走 GraphQL 默认 fieldResolver，**无需自定义 resolver**（Vendure 未配 `fieldResolver`，只配了 `fieldResolverEnhancers: ['guards']`）。编译产物 `lib/src/plugin.js` 同步做**外科式单点插入**，未整体重编译（`lib` 与 `src` 存在既有漂移，整体重编译会引入缺失模块并启动崩溃） |
| 前端 | `src/api/fragments.ts`：`ORDER_FRAGMENT` 的 `productVariant` 补 `enabled` | 一并补 `stockLevel`，购物车据两者判定行状态 |
| 前端 | `src/utils/flash-normalize.ts`：恢复 `'invalid'` 状态 | `cartLineState(line)` 顺序 = 失效（`!variant \|\| enabled===false`）→ 库存预警（`stockLevel < quantity`）→ 正常 |
| 前端 | `src/pages/cart/index.vue` | 失效行加 `.cart-item--invalid`（灰显 `opacity .55`）与灰色「已下架」标签；`selectableCount` / `allSelected` / `toggleAll` / `loadCart` 自动勾选一律排除失效行；点失效行勾选框 toast「该商品已下架，请删除」；`goCheckout` 暂存未勾选行时**排除失效行**（脏数据不进暂存，但仍从订单移出） |

**为什么必须在 `activeOrder` 上看**：`packages/core/src/api/resolvers/shop/shop-products.resolver.ts` 有 `enabled: { eq: true }` 过滤，已下架变体在 `products` / `search` 里查不到，只能在购物车的 `activeOrder.lines[].productVariant` 上观察到 —— 这正是购物车的真实场景。

线上回归证据（`_vshop_cart_invalid_shots.mjs`，Playwright 390×844 / dpr=2；同一账号，真实链路「加购 → 后台 `updateProductVariants` 置 `enabled=false` → 刷新购物车」）：

```
[1] activeOrder QLKGJTNMDTQH19Q9 行数 = 1
    行 199 国信南山温泉工作日门票 enabled=true stock=IN_STOCK
[2] 后台可见该变体（下架前）enabled = true
[3] 下架前：☑ 国信南山温泉工作日门票 ¥168.00 - 3 + × … ☑ 全选 合计: ¥504.00 结算(1)      → cart-invalid-before.png
[4] admin updateProductVariants enabled=false → ok
    [debug] shop-api 行变体 enabled = 57:false
[5] 下架后：☐ 国信南山温泉工作日门票 已下架 ¥168.00 - 3 + × … ☐ 全选 合计: ¥0.00 结算(0)   → cart-invalid-line.png
    断言：页面含「已下架」标签 ✓
[6] 点失效行勾选框 → toast「该商品已下架，请删除」✓                                    → cart-invalid-toast.png
[7] 复原变体为在售 → shop-api enabled = true
```

结论：失效行①灰显、②带「已下架」标签、③不被自动勾选、④全选不计入、⑤合计与 `结算(N)` 都排除该行、⑥点击提示删除；脚本 `finally` 里把变体复原为在售，**不污染生产数据**（复原后 shop-api `enabled=true` 已实测）。

> **脚本踩坑**：同一 hash URL 的第二次 `page.goto` 会被浏览器当成 same-document 导航、**不重载页面**，页面停在旧数据上（现象酷似「下架没生效」）。脚本里所有页面跳转都带 `?_t=<时间戳>` nonce 强制冷加载；这与 §5.6 的冷启动修复配套。

### 5.8 v1.4 新增：分类页商品为空的排查与修复（数据 + 代码）

**现象**：`/#/pages/category/index` 二级分类格恒「暂无子分类」，切到商品模式恒「暂无商品」。

**只读排查（三份证据链，全部走 SQL + shop-api，不改数据）**：

| 证据 | 结论 |
|---|---|
| 4 个一级分类的 filter | 全是 `facet-value-filter`，`facetValueIds=["1".."4"]`（`品类` facet 的值） |
| 唯一持有这些 facetValue 的 10 个商品 | id 1–10（初始 seed 演示数据，如 `EP-PRO-01` / `NUTS-30PK`），**已在 2026-09-05 18:19 被一次性软删**（该分钟共软删 31 个商品） |
| default 渠道存活商品 vs 带 facet | `alive_products = 18` / `with_facet = 0` → filter 命中 0 |
| 旁证 | `collection_product_variants_product_variant` 是**陈旧缓存**（分类 2/3/4/5 缓存 5/4/3/4 个变体，存活变体 0 个）；collection 成员在 Vendure 3 是**按 filter 动态计算**的，无 `collection_product` 表 |
| 澄清误读 | 「休闲娱乐/养车/美食」等分类属 **t2 渠道**（id 14/16/17/18，`product-id-filter` 手工挂商品）；default 渠道只有 collection 1–5，1 是 `isRoot` 根 |

**处理**：

| 层 | 动作 |
|---|---|
| 数据：新建 | 4 个一级分类（`parentId=1`，`inheritFilters=false`，`product-id-filter`）+ 8 个二级，见下表；名称走 `zh_Hans` 翻译（default 渠道 `availableLanguageCodes` 只有 `zh_Hans`，故未写 en） |
| 数据：停用旧分类 | `electronics`/`home`/`personal-care`/`food`（id 2–5）`isPrivate=true` —— shop-api 不再返回，**可逆**（不硬删）；实测这 4 个只属于 `__default_channel__`，不影响 t1/t2/t3 |
| 数据：启用商品 | 「鲜活小龙虾 / 仙居杨梅 / 现杀黑猪肉」三个生鲜商品商品级与变体级均为 `enabled=false`，shop-api 因此不返回（core 的 shop 商品 resolver 有 `enabled: { eq: true }` 过滤）→ 按用户确认全部启用 |
| 代码：分类页 | `src/pages/category/index.vue` 的 `goList(sub.id)` 把 **collection id 当 `facetValueId`** 传给了列表页（语义错配，点进去必空）→ 改为 `goList(sub.slug)` 并跳 `?collectionSlug=<slug>` |
| 代码：列表页 | `src/pkg-product/pages/list.vue` 只读 `facetValueId`、**完全忽略 `collectionSlug`**（`FloorSection` 的「查看更多」也因此一直在看全量商品）→ 改为两者都读，`collectionSlug` 透传给 `search` |
| 备份 | 改动前 `pg_dump -t collection -t collection_translation -t collection_channels_channel -t collection_product_variants_product_variant -t facet_value_translation --column-inserts` 到服务器 `/home/admin/_backup_collection_1790651200.sql`（30,848 字节 / 74 条 INSERT） |

重建后的分类与 shop-api 实测命中（`search(input:{ groupByProduct:true, collectionSlug })`）：

| 一级分类（id） | 二级分类（id） | 命中数 |
|---|---|---|
| 温泉度假 `hot-spring`(19) | 温泉门票(20) / 温泉住宿(21) | 6 / 3 / 3 |
| 汽车服务 `car-service`(22) | 洗车美容(23) / 轮胎服务(24) / 保养维修(25) | 3 / 1 / 1 / 1 |
| 黄金珠宝 `jewelry`(26) | 黄金首饰(27) | 1 / 1 |
| 生鲜食品 `fresh-food`(28) | 水产海鲜(29) / 时令水果(30) / 肉禽蛋品(31) | 4 / 1 / 1 / 2 |

**未纳入分类存活商品**：`78 优惠券测试商品`（在售，供优惠券测试用）、`72 ok` / `65 pso-15362`（均 `enabled=false`，`65` 无变体），以及 `75 老凤祥黄金珠宝`（`76` 的重复副本，商品级已下架）。

**回归证据**（`_vshop_usemall_shots.mjs --only category`，Playwright 390×844 / dpr=2）：

```
[2] 分类页
  text = 分类 温泉度假 汽车服务 黄金珠宝 生鲜食品 温泉门票 温泉住宿 ⇄ ↑ 首页 分类 购物车 我的
  -> category-modes.png
  点二级分类「温泉门票」-> https://e.joho.cn/#/pkg-product/pages/list?collectionSlug=hot-spring-tickets
  text = 商品列表 🔍 搜索商品 国信南山温泉门票 ¥ 168.00 国信南山温泉工作日门票 ¥ 168.00 国信南山节假日门票 ¥ 198.00 没有更多了
  -> category-sub-list.png
  -> category-mode-list.png
```

---

### 5.9 v1.5 新增：拼团页「我的开团 / 我的参团」（含后端改动）

**背景**：该项在第一轮/第二轮 spec 中均被记为「不做」，依据是 **usemall 参照物本身也未实现** —— `usemall/sub-marketing/pages/group.vue` 的 `navList` 与 `tabClick` 被 `v-if="false"` 整块隐藏，且 `tabClick` 只改索引不重新取数，属废弃死代码。第二轮 spec §8 把它记为开放项并标注了技术前提（`GroupBuyOrder` 无 `customerId`，需经 `orderId` 关联 `Order.customer`）。v1.5 按用户追加需求独立交付。

| 层 | 文件 | 改动 |
|---|---|---|
| 后端 | `packages/group-buy-plugin/src/plugin.ts` | shop SDL 新增 `type MyGroupBuyOrder` 与 `extend type Query { myGroupBuyOrders(isLeader: Boolean!): [MyGroupBuyOrder!]! }` |
| 后端 | `packages/group-buy-plugin/src/group-buy.service.ts` | 注入 `CustomerService`，新增 `findMyOrders(ctx, isLeader)`：`ctx.activeUserId` → `CustomerService.findOneByUserId` 取 customer 主键 → 两步查询（见下） |
| 后端 | `packages/group-buy-plugin/src/group-buy-shop.resolver.ts` | 新增 `@Query() myGroupBuyOrders(@Ctx() ctx, @Args('isLeader') isLeader)` |
| 前端 | `src/api/queries/promotion.ts` | 新增 `getMyGroupBuyOrders(isLeader)` |
| 前端 | `src/pkg-promotion/pages/group-buy.vue` | 三 tab（拼团列表 / 我的开团 / 我的参团）+ 我的团卡片（版式 A）+ 未登录引导 |
| 前端 | `src/i18n/locales/{zh-CN,zh-TW,en,ja,ko}.json` | `promotion.*` 新增 20 键，5 个语言包同步 |

**归属判定与三个坑**（`findMyOrders` 为什么是「两步查询」）：

```ts
// 1) 先查该客户的订单 —— 渠道过滤只在此处（Order 无 channelId 列，必须走 channels M2M 关联）
const orders = await repo(Order).createQueryBuilder('ord')
    .innerJoin('ord.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
    .where('ord.customerId = :customerId', { customerId: Number(customer.id) })
    .select(['ord.id', 'ord.code']).getMany();
// 2) 再按 orderId 反查拼团记录（GroupBuyOrder.orderId 是 varchar，参数化 IN 传字符串，不做原生 join）
const rows = await repo(GroupBuyOrder).find({ where: { orderId: In(orders.map(o => String(o.id))), isLeader }, order: { createdAt: 'DESC' } });
// 3) 批量补活动 → 组装 { id, orderId, orderCode, groupBuyActivityId, isLeader, status, activity }
```

| # | 坑 | 现象 | 处理 |
|---|---|---|---|
| 1 | Postgres `int = varchar` | 首版用 `.innerJoin(Order, 'ord', 'ord.id = gbo.orderId')` → `operator does not exist: integer = character varying` | 改两步查询，JS 侧取 `Order.id` 转字符串喂 `In(...)`（提交 `6ee4a3add`） |
| 2 | `Order` 无 `channelId` 列 | `.where('ord.channelId = :c')` 报列不存在（`channels` 是 M2M） | `innerJoin('ord.channels', ...)` |
| 3 | `GroupBuyOrder.channels` 从未写入 | 用它在拼团记录侧过滤恒为空 | 渠道过滤只放在订单侧 |
| 4 | `ctx.activeUser.id` 是 **User** 主键 | 直接当 customer id 用会查不到 | `CustomerService.findOneByUserId(ctx, ctx.activeUserId)` 桥接 |

**`lib/` 产物**：生产跑 `lib/`，本项目 `lib` 与 `src` 存在既有漂移，整体重编译会引入缺失模块导致启动崩溃 → 只对本包做外科式重编译 `npx tsc -p packages/group-buy-plugin/tsconfig.build.json`（不 rimraf），diff 恰为 11 个预期文件。

**生产造数**（一次性运维动作，未入库；用 QA 客户 `qa-vshop-manual@local.dev` 走完整 shop-api 流程下两单）：

```
订单 157 QLKGJTNMDTQH19Q9  ← joinGroupBuy(activityId:"1", isLeader:true)   我的开团
订单 159 22LP6JDATC6TWFPS  ← joinGroupBuy(activityId:"1", isLeader:false)  我的参团
活动 1「拼团演示-温泉门票」：target 3 / currentCount 2 / active / endAt 2026-10-05
```

下单链路：`addItemToOrder(variantId,1)` → `setOrderShippingAddress` → `setOrderShippingMethod(1)` → `transitionOrderToState('ArrangingPayment')` → `addPaymentToOrder(cod-payment-template)`。

**API 回归（生产 shop-api 实测）**：

| 用例 | 结果 |
|---|---|
| 未登录 `myGroupBuyOrders(isLeader:true/false)` | `[]`（不报错） |
| 登录 · `isLeader:true` | 1 条：`orderId=157`、`orderCode=QLKGJTNMDTQH19Q9`、`activity.id=1`、`status=pending`、活动进度 2/3 |
| 登录 · `isLeader:false` | 1 条：`orderId=159`、`orderCode=22LP6JDATC6TWFPS`、同一活动 |
| 漏传 `isLeader` | GraphQL 校验报错（`isLeader: Boolean!` 必填） |

> 取登录 token 的坑：`CurrentUser` 类型上**没有** `token` 字段，直接查会校验失败 → 必须从响应头 **`vendure-auth-token`** 读取。
>
> PowerShell 引号坑（本轮踩到多次）：给 `ssh` 的远程脚本要用**外层单引号**，否则 `$` 变量会被 PS 插值（`cp: missing destination file operand`）；`$(date +%s)` 会被 PS 当 `Get-Date` 解析；`curl.exe -d '{"query":"..."}'` 的内层双引号会被 PS 剥离导致 JSON 解析错 → 改用 `Invoke-RestMethod` + `ConvertTo-Json`。

**截图与版式缺陷**：首张截图发现「我的团」主按钮**非整宽**（`.gb-card__action` 未设宽度），补 `width: 100%;` 后重建重部署，复核确认为整宽。

---

## 6. 部署与回滚

**铁律**：一律本地构建，服务器只解压 + 重启/重载，绝不在服务器构建（服务器内存不足）。

### 6.1 vshop H5（站点目录 `.../sites/e.joho.cn/index`）

```bash
# 本地
npm run build:h5
tar -czf vshop-h5.tgz -C dist/build/h5 .
scp vshop-h5.tgz joho:/tmp/vshop-h5.tgz

# 服务器（先备份再清空再解压）
S=/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index
sudo cp -r $S $S.bak_$(date +%s)
sudo rm -rf $S && sudo mkdir -p $S
sudo tar -xzf /tmp/vshop-h5.tgz -C $S
sudo chmod -R a+rX $S
```

> 注意：站点父目录 `sites/e.joho.cn/` 不归 `admin` 所有，`cp`/`rm -rf` **必须 sudo**，否则会「Permission denied」但 tar 仍部分解压成功，留下半新半旧的目录。
>
> **宿主路径与容器路径是同一个目录**：openresty 容器 `1Panel-openresty-3I6S` 里 `e.joho.cn.conf` 的 `root` 写的是 `/www/sites/e.joho.cn/index`，该 `/www/sites` 是宿主 `/opt/1panel/apps/openresty/openresty/www/sites` 的 bind mount。因此「宿主 `sudo tar -C $S`」与「宿主机解压到 `/tmp` 再 `docker cp ... <容器>:/www/sites/e.joho.cn/index/`」两种写法等价；v1.3 用的是后者（`rm -rf <容器目录> && mkdir -p` 后 `docker cp /tmp/h5-staging/. <容器>:<目录>/`，再 `chmod -R 777`）。静态目录替换即时生效，**无需 reload nginx**。
>
> 用 PowerShell 走 `ssh` 时注意引号层级：外层用 PowerShell **双引号**、内层用**单引号**；反过来（外层单引号内套双引号）会被 PS 吃掉引号，出现 `rm: missing operand` 这类假报错。能不嵌套就不嵌套（如 `docker exec <c> rm -rf <path>` 单条命令无需 `sh -c`）。
>
> 部署后核对：`docker exec <c> find <目录> -type f | wc -l` 应等于本地构建文件数；更严的做法是把两端「`sha256sum` 清单」拉平比对（v1.3 实测 121/121 全等）。

### 6.2 web-admin（站点目录 `.../sites/e.joho.cn/guanli`）

用 `web-admin/scripts/deploy.mjs`（本地构建 → tar → scp → 服务器解压 + `docker exec 1Panel-openresty-3I6S openresty -s reload`），或按 §6.1 同样步骤换成 `/guanli` 目录后 reload nginx。

### 6.3 后端 vendure

服务器 `git pull --ff-only` + `pm2 restart vendure vendure-worker`；**不要**与前端机制混用。

### 6.4 回滚

各站点目录的兄弟目录即为历史备份，命名 `index.bak_<epoch>` / `guanli.bak_<epoch>`。回滚 = 把备份目录内容覆盖回站点目录：

```bash
S=/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index
sudo rm -rf $S && sudo cp -r ${S}.bak_<epoch> $S && sudo chmod -R a+rX $S
```
