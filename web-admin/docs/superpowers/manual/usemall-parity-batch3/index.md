# usemall→vshop 批次 3 补齐：操作手册与截图（F05 余额提现 / F11 常见问题与意见反馈 / F19 购物圈 / F20 积分抽奖）

> 生成日期：2026-10-10 ｜ 视口规范：Playwright 移动端 **390×844、deviceScaleFactor=2**（实际 780×1688 像素）
> 截图环境：本地 dev-server（`http://localhost:3000`，postgres 库）+ C 端 `npm run dev:h5`（5180）+ web-admin `scripts/serve-h5.mjs`（5280，`/admin-api` 代理 3000）。全部为本地真实取数截图，无生产写操作。

---

## 一、批次 3 范围总览

| # | 交付物 | 端 | 入口 / 位置 | 对应提交 |
|---|--------|----|-------------|----------|
| F05 | 余额提现三态机（申请冻结→审核→打款/驳回退回） | vendure + C 端 + web-admin | C 端「我的→余额提现」；后台 分销组→「余额提现审核」 | vendure `cd5ef7024`；vshop `7bc78db` |
| F11 | 常见问题（FAQ 分组折叠面板）+ 意见反馈（类型/标题/内容/图片/联系方式） | vendure（新建 feedback-plugin）+ 双端 | C 端「我的→常见问题 / 意见反馈」；后台 营销组→「FAQ 管理 / 意见反馈」 | vendure `6a2c9e25c`；vshop `810ae40` |
| F19 | 购物圈（双列瀑布流 / 帖子详情 / 发布 + 点赞收藏，后台置顶/隐藏） | vendure（新建 shopping-circle-plugin）+ 双端 | C 端「我的→购物圈」；后台 营销组→「帖子管理」 | vendure `15df56b3b`；vshop `de05f65` |
| F20 | 积分抽奖（九宫格、服务端加权开奖、按奖品消耗积分扣减） | vendure（新建 lottery-plugin）+ 双端 | C 端「我的→积分抽奖」；后台 营销组→「积分抽奖奖品」 | vendure `1c6073ebb`；vshop `5e86491` |

**业务链路要点**：

- **F05**：复用 recharge-card-plugin 的 `CustomerBalance`（可用/冻结双列）+ `BalanceTransaction` 流水；申请提现原子条件扣减（余额不足即拒），pending→approved→paid / pending|approved→rejected（驳回解冻回补，带原状态条件的原子更新防重复回补）；**起提 ¥10**。
- **F11**：FAQ 未登录可看（`faqs` 无需登录），按 `type` 分组（register/order/pay/afterSale/account）；反馈需登录，title≤20、contactWay≤30，type 为英文 key（bug/experience/other）。
- **F19**：帖子按渠道隔离，feed 只出 published；点赞/收藏为 toggle（`@Unique(postId,customerId)` 幂等往返）；`nickname` 由后端按 customer 补齐。
- **F20**：服务端加权开奖（`weight` 相对权重，**weight=0 仅展示、永不抽中**）；**每次抽中按所中奖品的 `consume` 扣积分（consume=0 为免费抽奖）**；`prizeIndex` = 奖品数组下标，C 端九宫格同序渲染，前端不随机。

---

## 二、C 端使用流程

所有入口都在 C 端 **「我的」页菜单**（与余额明细/收货地址等并排）：**余额提现 / 购物圈 / 积分抽奖 / 常见问题 / 意见反馈**。

### 2.1 余额提现（F05）

1. 「我的→余额提现」进入提现页：上半显示**可提余额**（冻结金额单独灰字提示），下半为申请表单（金额-元、收款方式 picker：微信/支付宝/银行卡、收款账号）与提现记录列表。
2. 金额最低 **¥10**（后端 1000 分硬校验），提交后可用余额即时转入冻结，记录状态为「待审核」。

![C 端余额提现页（表单态，可提余额 ¥500.00）](c-withdraw.png)

3. 状态机：待审核 →（商家「通过」）已通过 →（「标记已打款」）已打款；待审核/已通过可「驳回」，驳回后金额解冻退回可用余额并写 UNFREEZE 流水。

### 2.2 常见问题（F11）

「我的→常见问题」：顶部横滑 tab（全部/注册登录/订单/支付/售后/账户，与后端 `type` 对齐），点击问题行展开答案（折叠面板）。未登录可看。

![C 端常见问题页（订单类已展开）](c-faq.png)

### 2.3 意见反馈（F11）

「我的→意见反馈」：反馈类型 picker（功能异常/体验问题/其他）+ 标题（≤20 字必填）+ 描述（必填）+ 图片补充（最多 3 张，走 `uploadCustomerAsset`）+ 联系方式（≤30 字选填）。提交后可在后台「意见反馈」列表看到处理状态（待处理/处理中/已解决）。

![C 端意见反馈页（表单态）](c-feedback.png)

### 2.4 购物圈（F19）

1. 「我的→购物圈」进入双列瀑布流 feed，卡片含首图/标题/正文截断/作者/♡点赞 · ☆收藏数；右下角「＋发布」悬浮按钮进发布页。
2. 发布页：标题（≤50 字选填）+ 正文（必填）+ 图片（最多 6 张）。**关联商品暂缓**（见「已知边界」#2），发布不选商品。
3. 帖子详情：图片轮播（swiper）/视频（videoUrl 优先）+ 标题/正文/作者/时间 + 底部操作条**点赞 ♥ / 收藏 ★ / 分享**（再次点击取消，计数 ±1）；「买同款」仅当帖子带 productId 时出现。

![C 端购物圈瀑布流（两条帖子，各 ♡1 · ☆1）](c-circle-feed.png)

![C 端帖子详情（已赞已藏态）](c-circle-detail.png)

![C 端发布帖子页（表单态）](c-circle-publish.png)

### 2.5 积分抽奖（F20）

1. 「我的→积分抽奖」：上部「我的积分」卡 + 3×3 九宫格（8 个奖品位循环展示奖品池 + 中央「抽奖」格）+ 下部「我的中奖记录」。
2. 点击抽奖 → 服务端按 weight 加权开奖并**按所中奖品 consume 扣积分** → 前端跑马灯（1.5 圈先快后慢）停在 prizeIndex 对应格 → 弹中奖结果（consume=0 显示「本次为免费抽奖」）。
3. 积分不足时后端报错原样 toast；weight=0 的奖项仅展示不参与开奖。

![C 端积分抽奖九宫格（7 奖品，含免费与谢谢参与）](c-lottery.png)

![C 端中奖弹窗（50元优惠券礼包，本次消耗 100 积分）](c-lottery-result.png)

---

## 三、web-admin 使用流程

登录（本地预览 `http://localhost:5280/guanli/`，生产 `https://e.joho.cn/guanli/`）→ 选择店铺 → 工作台右上 ☰ 菜单抽屉。

### 3.1 余额提现审核（分销组 →「余额提现审核」）

`/pages/balance/withdraw/index`。五态 tabs（待审核/已通过/已打款/已驳回/全部，默认待审核）。卡片展示金额/客户/收款方式/收款账号/申请时间；待审核单有「通过」「驳回」按钮（驳回弹备注框），已通过单有「标记已打款」。所有状态流转走带原状态条件的原子更新，重复点击不会二次流转。

![后台余额提现审核页（一条 ¥100 待审核）](admin-balance-withdraw.png)

### 3.2 FAQ 管理（营销组 →「FAQ 管理」）

`/pages/feedback/faq/index`。行内编辑卡片：标题/内容 textarea + 分组徽标 + 启用开关 + 排序数字，底部「保存 / 删除」；右上「＋ 新增问题」推入空卡。**保存即全量生效**（C 端 faqs 实时按 enabled=true + type 过滤拉取）。

![后台 FAQ 管理（3 条行内编辑卡）](admin-feedback-faq.png)

### 3.3 意见反馈（营销组 →「意见反馈」）

`/pages/feedback/list/index`。四态 tabs（待处理/处理中/已解决/全部）；卡片含标题/类型徽标/客户/内容摘要/图片缩略（点击 `uni.previewImage` 大图）/联系方式/提交时间；待处理单可「处理中」「已解决」（置 handledAt）。

![后台意见反馈列表（两条待处理）](admin-feedback-list.png)

### 3.4 帖子管理（营销组 →「帖子管理」）

`/pages/circle/posts/index`。卡片含首图缩略/标题/作者/点赞收藏数/发布时间/状态（已发布）；操作「置顶」切换（isPinned，feed 内优先靠前）与「隐藏/恢复」（status published↔hidden，隐藏后 C 端 feed 与详情不再出现）。

![后台帖子管理（两条已发布，各点赞收藏 1）](admin-circle-posts.png)

### 3.5 积分抽奖奖品（营销组 →「积分抽奖奖品」）

`/pages/lottery/prizes/index`。奖项行内编辑卡：图（换图）/名称/权重/消耗积分/库存/排序/启用开关；文案提示「**权重越高越易中，0 = 仅展示、不参与抽取**」「**抽中该奖品时消耗的积分，0 = 免费抽奖**」；「＋ 新增奖项」＋「全量保存」。C 端九宫格按排序同序渲染，新增/改配即时生效。

![后台积分抽奖奖品配置（7 个奖项行内编辑卡）](admin-lottery-prizes.png)

---

## 四、暂缓项补齐（2026-10-10）

批次 3 收尾时遗留的 4 个暂缓项已全部补齐（vendure `6059aa7b6` + `0230556c0`；vshop `d92a2c1` + `8af8650` + `695bacc`）：

### 4.1 购物圈发布支持关联商品（vshop `d92a2c1`）

发布页新增「关联商品（可选）」区块：关键词搜索商品（shop-api search，groupByProduct 口径）→ 点选候选即进入**已选卡片态**（首图 + 名称 + 价格 + 「移除」），再次发布时随 `createCirclePost` 透传 `productId`；帖子详情页「买同款」入口随之恢复（仅当帖子带 productId 时出现）。

![C 端发布帖子页（关联商品已选卡片态）](c-publish.png)

### 4.2 web-admin 抽奖奖品页新增「抽奖记录」tab（vshop `8af8650`）

「积分抽奖奖品」页顶部改为双 tab（**奖品配置 / 抽奖记录**）。抽奖记录 tab 首次切入加载、上滑分页，每条含奖品图/名称/消耗积分/用户/时间，倒序排列（最新在上）。

![后台抽奖奖品页（抽奖记录 tab，5 条记录）](admin-lottery-records.png)

### 4.3 C 端商品详情会员价标签（vshop `695bacc` + vendure `6059aa7b6`）

商品详情价格区在「秒杀价」旁新增**会员价标签**（如「会员9.5折」）与折后参考价（约¥xx，当前变体价 × 折扣向下取整到分）。数据来自 vcash-pos-plugin shop-api 只读查询 `myMemberPrice`（登录后按 `customer.customFields.memberLevel` × 商品主分类命中 MemberPriceRule；global 规则免分类直接命中全场商品）。

**仅展示不算价语义（重要）**：标签与参考价**只是展示层信息，不参与下单计价**——会员真实下单优惠仍走批次 2 的 `tier_discount` 订单级促销（成长值达标 → 金卡及以上专属95折），结算页金额以订单促销计算为准。拉取失败/未登录/未命中时静默降级不渲染，不影响商品主内容。

![C 端商品详情（价格区带「会员9.5折」标签与约¥2.14 参考价）](c-detail.png)

### 4.4 抽奖启用奖品数量上限 8（vendure `0230556c0`）

lottery-plugin 服务端校验**启用状态奖品数量上限 8 个**：后台「＋ 新增奖项」或全量保存时启用数超过 8 将被拒绝（前端同步提示）。九宫格 8 奖位与奖品池容量对齐，防止奖项溢出抽奖位。

### 4.5 复现造数口径（本地 dev-server）

- 测试顾客 `hayden.zieme12@hotmail.com / test`（shop-api `registerCustomerAccount` 注册，customer id=9），admin-api `updateCustomer` 将 `customFields.memberLevel` 提为 **2**；
- admin-api `createMemberPriceRule` 建 **global 会员价规则**（scope=global、memberLevel=2、discountPercent=95、active=true，channelId=1，规则 id=1，global 免分类覆盖种子商品）；
- admin-api `adjustPoints(customerId:9, amount:10000)` 充积分 → shop-api `drawLottery` 抽 3 次产生记录；
- 截图注入：C 端走登录页真实登录（需以 sessionStorage `sso_auto_jumped=1` 阻断企业 SSO 自动跳转）；web-admin 注入 `wa_auth_token`/`wa_user_id`/`wa_channel_code`/`wa_channel_token` 同前。

---

## 五、已知边界（暂缓项与口径）

1. **会员价规则仍不参与 shop-api 下单计价（口径更新）**：按行改价的 MemberPriceRule 引擎仍只在 admin/POS 侧；C 端通过只读 `myMemberPrice` 查询**仅展示**会员价标签（见「暂缓项补齐」4.3），下单优惠以 `tier_discount` 订单级促销为准——不把规则计算器注册进全局价格策略链。
2. **购物圈发布页选商品已补齐（2026-10-10）**：发布时按关键词搜索全店商品选中关联（见「暂缓项补齐」4.1）；「从我的订单/收藏快捷选商品」增强另立任务。
3. **提现额度与打款离线**：起提 ¥10 为后端常量（暂未开放渠道级配置）；「标记已打款」仅做状态记账，实际打款（微信商家转账/支付宝转账）线下完成，无支付通道对接。
4. **收款账号明文存储**：`accountInfo` 按业务需要明文展示于后台审核页（打款要用）；如需合规加固另立任务。
5. **FAQ 分组固定**：C 端 tab（注册登录/订单/支付/售后/账户）为前端硬编码映射，后端 type 新增值需同步前端 tab。
6. **反馈类型为英文 key**：C 端提交 bug/experience/other，后台徽标经 locale（`feedbackManage.type_*`）转义；直接改库为中文值会在后台露出原始 key。
7. **抽奖消耗为「所中奖品」的 consume**：不是固定每次消耗——奖品可分别定价（0=免费）；weight=0 仅展示。抽奖记录/库存由后端维护，后台奖品卡库存会随抽取递减。
8. **购物圈分享 = 复制链接**：H5 无原生分享面板，详情页「分享」复制帖子链接到剪贴板。
9. **截图数据为本地造数**：本手册截图使用 dev-server 播种库 + 手工造数（见下），生产环境页面结构一致、数据不同。

---

## 六、验证记录（2026-10-10）

| 验证项 | 结果 |
|--------|------|
| vendure e2e（批次3 四插件，各自包内 spec） | recharge-card 余额提现三态机 / feedback / shopping-circle / lottery 全绿（批次收尾报告见计划 Task 10） |
| 双端构建 | vshop `build:h5` 0 error（150 assets 新产物，`chore(c端)` 提交）；web-admin `build:h5` 0 error（606 文件） |
| 本地端到端造数走查 | admin 造 FAQ×3、奖项×7（含 consume=0 免费奖与谢谢参与）、zhangsan 积分 +10000 / 余额 +¥500；C 端发帖×2 并点赞收藏、提交提现 ¥100（待审核）、抽奖 2 次（谢谢参与 -10 / 50元券 -100，积分 10000→9890） |
| 截图 | 13 张（C 端 8 + 后台 5），390×844 @2x，全部人工目检通过（本目录） |
| 暂缓项补齐（同日） | hayden memberLevel=2 + global 规则（95 折）造数 → `myMemberPrice` 全部命中 applied=true；`drawLottery` ×3 产生记录；补齐截图 3 张（c-publish / admin-lottery-records / c-detail，均为新增文件）目检通过，详情页「会员9.5折」标签成功显示 |

### 本地测试环境说明（复现用）

- 后端：`d:\zhao\vendure\packages\dev-server`，`npm run dev:server`（:3000，DB=postgres `vendure` 库，synchronize:true 自动建表）。
- C 端：`d:\zhao\vshop`，`npm run dev:h5`（:5180）。
- web-admin 预览：`d:\zhao\vshop\web-admin`，`node scripts/serve-h5.mjs`（:5280，`/admin-api` → localhost:3000）。
- 本地管理员：`superadmin@china.test / superadmin`（bootstrap 自带 `superadmin` 在播种库无 roles，勿用）；C 端测试顾客：`zhangsan@test.cn / test`（customer id=1，本批造数后积分 9890、余额 ¥400、金卡会员）。
- 造数手段：admin-api 登录（`Authorization: Bearer` + `vendure-token: default-token` 头）→ `saveFaq` / `createLotteryPrize` / `adjustPoints(customerId, amount, remark)` / `adminAdjustBalance({ customerId, amount, type:'adjust', remark })`；shop-api 以 zhangsan 会话调 `createFeedback` / `createCirclePost` / `toggleCircleLike` / `toggleCircleFavorite` / `requestBalanceWithdrawal`。
- 截图注入：C 端 localStorage `auth_token`/`auth_userId`；web-admin `wa_auth_token`/`wa_user_id`/`wa_channel_code`（`__default_channel__`）/`wa_channel_token`（`default-token`）。

---

## 七、截图索引

| 文件 | 内容 | 目检要点 |
|---|---|---|
| `c-withdraw.png` | C 端余额提现页（表单态） | 可提余额 ¥500.00、金额 100、收款账号 zs_alipay_2026、提现记录空态 |
| `c-faq.png` | C 端常见问题 | 6 分组 tab、3 条 FAQ、首条展开显示答案 |
| `c-feedback.png` | C 端意见反馈（表单态） | 类型=功能异常、标题/描述/联系方式已填、图片补充（最多 3 张） |
| `c-circle-feed.png` | C 端购物圈瀑布流 | 双列两卡、首图/标题截断/♡1 · ☆1、右下发布悬浮钮 |
| `c-circle-detail.png` | C 端帖子详情 | 轮播图指示点、标题/正文/时间、底部 ♥1 ★1 分享（激活态橙色） |
| `c-circle-publish.png` | C 端发布帖子（表单态） | 标题 8/50 计数、正文已填、图片（最多 6 张）、发布按钮 |
| `c-publish.png` | C 端发布帖子（**关联商品已选卡片态**，暂缓项补齐新增） | 标题/正文已填、关联商品区块选中「农夫山泉天然水 ¥2.26」+ 移除钮、发布按钮 |
| `c-lottery.png` | C 端积分抽奖九宫格 | 我的积分 10000、8 奖位循环 7 奖品（免费/积分标注）、中央抽奖格、记录空态 |
| `c-lottery-result.png` | C 端中奖弹窗 | 中奖结果徽标、奖品图、「恭喜获得 50元优惠券礼包」、本次消耗 100 积分、开心收下 |
| `admin-balance-withdraw.png` | 后台余额提现审核 | 待审核 tab、¥100.00 卡（客户#1·微信·zs_alipay_2026）、通过/驳回 |
| `admin-feedback-faq.png` | 后台 FAQ 管理 | 3 张行内编辑卡（订单/支付/售后徽标、启用开关、排序、保存/删除、＋新增问题） |
| `admin-feedback-list.png` | 后台意见反馈 | 待处理 tab、两卡类型徽标（功能异常/体验问题）、处理中/已解决按钮 |
| `admin-circle-posts.png` | 后台帖子管理 | 两卡首图缩略、已发布徽标、点赞 1 · 收藏 1、置顶/隐藏 |
| `admin-lottery-prizes.png` | 后台抽奖奖品配置 | 7 张奖项卡（#8-14：图/名称/权重/消耗积分/库存/排序/启用）、0 权重与 0 消耗文案说明 |
| `admin-lottery-records.png` | 后台抽奖记录 tab（暂缓项补齐新增） | 双 tab 激活「抽奖记录」、5 条记录（奖品图/名称/消耗积分/用户/时间倒序） |
| `c-detail.png` | C 端商品详情（**会员价标签态**，暂缓项补齐新增） | 价格区 ¥2.26 +「会员9.5折」徽标 + 约¥2.14 参考价、价格说明入口 |
