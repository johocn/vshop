# vshop 对齐 usemall 版式 操作手册

## 1. 范围与版本

| 项 | 值 |
|---|---|
| 版本 | v1.2（2026-09-29，二次线上复验：修复购物车冷启动误报空车，见 §5.6） |
| 设计文档 | `web-admin/docs/superpowers/specs/2026-09-24-vshop-usemall-alignment-design.md` |
| 执行计划 | `web-admin/docs/superpowers/plans/2026-09-24-vshop-usemall-alignment-plan.md` |
| 只读探针 | `web-admin/scripts/_smoke_usemall_align.py` |
| 截图脚本 | `web-admin/scripts/_vshop_usemall_shots.mjs` |
| 线上环境 | C 端 H5 + shop-api：`https://e.joho.cn`；后台：`https://e.joho.cn/guanli` |
| 本轮范围 | 首页秒杀楼层、分类页双模式、详情页 SKU 弹层与 5 键、购物车勾选真生效/未登录态/推荐、秒杀页与拼团页版式、结算页发票入口行 |
| 回归账号 | C 端测试客户 `qa-vshop-manual@local.dev` / `Qa123456`（生产新建，customer id=139）；后台 `superadmin` / `z123123` |

> **本文中「备注行」的最终状态是「已回退不做」**，原因见 §5.2。
> **v1.1 相对 v1 的增量**：三类线上阻塞缺陷修复（分类页、秒杀补拉、pm2 内存）+ 演示数据 + 全部截图重采，见 §5.5。
> **v1.2 相对 v1.1 的增量**：二次线上复验发现「购物车冷启动/刷新一律误报空车」，已修复并重新构建部署、复验通过，见 §5.6；线上产物入口哈希随之更新，见 §5.4。

---

## 2. 涉及页面与入口

H5 为 hash 路由，`#` 后为页面路径。

| 页面 | 路由 | 进入方式 |
|---|---|---|
| 首页（秒杀楼层 + 返回顶部） | `/#/pages/home/index` | 直接访问站点根，或底部「首页」 |
| 分类页（双模式 + 双悬浮按钮） | `/#/pages/category/index` | 底部「分类」 |
| 商品详情（SKU 弹层 + 底部 5 键） | `/#/pkg-product/pages/detail?slug=<slug>` | 首页/分类页点商品 |
| 购物车（勾选真生效 / 未登录态 / 为你推荐） | `/#/pages/cart/index` | 底部「购物车」 |
| 结算页（发票入口行） | `/#/pkg-order/pages/checkout` | 购物车勾选后点「结算」 |
| 秒杀页 | `/#/pkg-promotion/pages/flash-sale` | 首页秒杀楼层右上「更多 ›」；或直接访问 |
| 拼团页 | `/#/pkg-promotion/pages/group-buy` | 直接访问（首页 sections 内暂无拼团入口；`flash` 楼层的 `source=groupBuy` 枚举已预留但后台不暴露） |

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
```

脚本用 `SITE_URL` 指定站点（默认 `https://e.joho.cn`）；Playwright 依赖按 `PW_ROOT` → 本机 vendure 依赖 → 就近 `node_modules` 顺序解析，并自动挑一个已存在的 chromium，无需先跑 `npx playwright install`。

| 文件 | 覆盖点 | 截图内实测内容 |
|---|---|---|
| `home-flash-floor.png` | 首页楼层（含秒杀楼层）+ 返回顶部 | ✅ 轮播 3 图 + 「限时精选」标题 + 倒计时（快照 `21:42:00`，随剩余时间变化）+ 「更多 ›」+ 秒杀价 `¥99.00`（原价 `¥168.00` 划线）+ 库存进度 `0%` + tabbar 角标 `2` |
| `category-modes.png` | 分类页默认模式（二级分类格） | ✅ 左栏 4 个一级分类（数码电子/家居生活/个人护理/食品饮品）；右侧 `📦 暂无子分类`（数据原因见 §5.3）+ 右侧 `⇄` / `↑` 双悬浮按钮 |
| `category-mode-list.png` | 分类页另一模式（商品列表） | ✅ 点 `⇄` 后切到商品列表模式，右侧「暂无商品」空态（数据原因见 §5.3） |
| `detail-sku-sheet.png` | 详情页 + SKU 弹层 | ✅ 页面价 `¥168.00` + 底部 5 键（客服/收藏/购物车/加入购物车/立即购买）；弹层含价格、已选、数量步进、加入购物车、立即购买 |
| `cart-select-real.png` | 购物车勾选真生效 | ✅ 自营 1 件，行项 `☑`、数量 3、`¥168.00`；「为你推荐」4 条；全选 `☑`；合计 `¥504.00`；`结算(1)`；tabbar 角标 3 |
| `cart-select-partial.png` | 同上，取消勾选后 | ✅ 行项 `☐`、全选 `☐`、合计 `¥0.00`、`结算(0)` 置灰禁用 —— **证明勾选参与结算金额与按钮可用性** |
| `cart-guest-and-reco.png` | 购物车未登录引导态 | ✅ 「当前未授权，登录后查看购物车」+「去登录」；未登录时**不渲染**「为你推荐」（推荐区需登录，见 `cart-select-real.png`） |
| `flash-sale-page.png` | 秒杀页 | ✅ 倒计时头 + 活动卡片（秒杀价 `¥99.00` / 原价 `¥168.00` 划线 / 进度 `0%`） |
| `group-buy-page.png` | 拼团页 | ✅ usemall 版式卡片：`¥128.00` / 原价 `¥168.00` 划线 / 「还差 3 人成团」/ 「3 人团 · 剩 165:53:03」（快照值）/ 「去拼团」 |
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
[facet] 该分类无 facet，跳过过滤断言
[cart] 无 activeOrder，跳过（需登录且有购物车）
== 全部断言通过 ==
```

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
| 购物车「已下架」行内标签 | 原计划补 `ProductVariant.enabled` 判定失效行；实测 **shop-api 的 `ProductVariant` 不暴露 `enabled`**（仅 admin-api 有），`OrderLine.productVariant` 又是 `NON_NULL`，C 端无法判定「已下架」。已回退 `enabled` 字段与 `invalid` 状态，**只保留库存预警**（「仅剩 N 件」）。这是**未交付项**，若需此能力须先在后端 shop SDL 暴露该字段 |
| 分类页商品为空 | **代码已修好**（见 §5.5），但生产默认渠道的 4 个一级分类（`electronics`/`home`/`personal-care`/`food`）用的是 `facet-value-filter`（`facetValueIds=["1".."4"]`，来自 `品类` facet），而**该渠道 18 个商品无一打任何 facetValue**，因此这些分类的 `children` 与商品命中数均为 0 —— 属**数据前置缺失，非本次改动**。另外这 4 个分类在语义上也不匹配现有商品（温泉门票/汽修/生鲜），因此未擅自给商品打 facet |
| 详情页 SKU 弹层无规格分组、缩略图为灰底占位 | 触发弹层的商品（国信南山温泉工作日门票）只有 1 个变体、`optionGroups` 为空，弹层仍按通用样式显示「已选：请选择规格」且左上缩略图取不到图。属**既有 UX 小瑕疵**，本轮不改 `SkuSheet.vue`，记录为已知偏差 |
| 拼团页「我的开团 / 我的参团」 | 需按当前用户筛团的后端查询，本轮不做（spec §1.2） |
| 详情页用户评价区、销量/积分元信息 | 无数据源，采用「有则显示」降级，本轮不新增后端字段（spec R6/R7） |

### 5.4 线上产物核对（v1.2 重新构建部署后复核）

| 产物 | 部署方式 | 线上入口 | 核对 |
|---|---|---|---|
| vshop H5 | 本地构建 → tar → scp → 服务器备份/清空/解压 | `https://e.joho.cn/` | 本地构建的 **121 个文件在线上逐文件核验全部 200**（非 200 共 0 个）；`index.html` 指向 `assets/index-Bwz4jGda.js` |
| web-admin | `web-admin/scripts/deploy.mjs`（本地构建 → scp → 解压 `/guanli` + nginx reload） | `https://e.joho.cn/guanli/` | 线上 533 个文件；入口 `assets/index-DFicyhQq.js`（该产物已含装修页 `flash` 楼层编辑块：`pages-decorate-home-index.CwPZYhlD.js` 内含 `flashSale`） |
| vendure 后端 | 本轮无后端代码改动，未重新部署 | `/shop-api` | 探针 `== 全部断言通过 ==`；`activeGroupBuyActivities` 已返回 `productId`/`variantId` |

> v1.1 曾把 web-admin 入口记为 `assets/index-D5PSCjyp.js`，那是更早一次构建的哈希；线上实际入口是 `assets/index-DFicyhQq.js`（后台产物不入库，`web-admin/dist` 被 gitignore，故以线上实测值为准）。
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
