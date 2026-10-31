# waimai 外卖（校园配送 + 骑手端）操作手册

上线日期：2026-10-06 ｜ H5 站点：**https://www.yourbao.cn/waimai/**
后端：Vendure（campus-delivery-plugin）｜ 验证：e2e 冒烟 S1-S8 全 PASS（见 `docs/verify/2026-10-waimai-e2e.md`）

## 1. 学生点单流程（五步）

| 步骤 | 页面 | 操作 |
| --- | --- | --- |
| ① 选店铺 | 首页 | 搜索或点店铺卡（商家自送 + 校内骑手接力，满20减4） |
| ② 点餐 | 店铺菜单 | 左侧分类选菜，右侧「+」加购 |
| ③ 结算 | 确认订单 | 选配送方式（校园配送）→ 分区（东区 ¥2.00）→ 宿舍楼 → 送达时段 → 支付方式 → 提交订单 |
| ④ 支付 | — | 到店支付（COD）/ 微信 JSAPI（生产配置后生效） |
| ⑤ 跟踪 | 订单跟踪 | 配送进度四步：商家接单 → 骑手取餐 → 配送中 → 已送达；可申请售后 / 再来一单 |

### 学生端截图

![首页](screenshots/waimai/8-1-home.png)
![菜单](screenshots/waimai/8-2-menu.png)
![确认订单](screenshots/waimai/8-3-checkout.png)
![订单跟踪](screenshots/waimai/8-4-order-detail.png)

## 2. 骑手流程（入驻 → 接单 → 配送 → 送达）

| 步骤 | 页面 | 操作 |
| --- | --- | --- |
| ① 入驻 | 我的 → 骑手入驻 | 填真实姓名/学号/校区（+学生证照片选填）提交，管理员审核（一般 1 个工作日）。已通过则直接进大厅 |
| ② 接单大厅 | 骑手首页 | 打开「接单中」开关上线；大厅实时出单（跨店铺聚合，加急置顶、小费降序），点击抢单 |
| ③ 到店取货 | 配送中 | 到店后点「我已到店 · 开始取货」；未取货可转单 |
| ④ 送达 | 配送中 | 点「我已送达（拍照存证）」拍照提交 → 已送达 ✓ 分成实时入账 |
| ⑤ 异常/转单 | 配送中 | 已取货转单需拍照交接；联系不上学生走「异常上报」平台介入 |

骑手信用分规则：初始 100，送达 +2；拒单/超时未抢扣分；**低于 60 禁止抢单**（大厅可见但 grab 报 FORBIDDEN）。

### 骑手端截图

![骑手入驻](screenshots/waimai/8-5-rider-join.png)
![接单大厅](screenshots/waimai/8-6-rider-home.png)
![待取货](screenshots/waimai/8-7a-rider-delivering-assigned.png)
![配送中](screenshots/waimai/8-7b-rider-delivering-inprogress.png)
![已送达](screenshots/waimai/8-7c-rider-delivering-delivered.png)
![我的收入](screenshots/waimai/8-8-rider-earning.png)

## 3. 管理员操作入口

| 事项 | 入口 |
| --- | --- |
| 骑手审核 | Vendure 管理台 → 客户 → 找到申请人 → customFields `riderStatus` 置 `approved`（或 GraphQL `campusSetRiderStatus(customerId, status)`，需 CampusAuditRider 权限） |
| 信用分调整 | admin-api `updateCustomer(input: { id, customFields: { riderCredit } })`（无专用界面） |
| 订单干预 | 管理台订单：cancelOrder / transitionOrderToState / settlePayment |
| 店铺上下架/暂停 | 渠道 customFields（waimaiStoreList 读 paused/promoText） |
| 骑手提现审核 | web-admin → 单 → 提现审核（四期，见 §8.1） |
| 造数（测试环境） | `node docs/verify/waimai-e2e-prepare.cjs`（幂等：店铺渠道/校区/时段/冒烟商品/账号） |

## 4. 部署与冒烟复跑

```bash
# H5 部署（本地构建 → scp → 服务器解压，绝不在服务器构建）
node d:\zhao\waimai\.secrets\deploy-waimai.mjs

# 生产冒烟（期望 E2E SMOKE PASS，幂等可重复跑；脚本会临时调低起送价并在结束时自动还原）
node d:\zhao\vshop\docs\verify\waimai-e2e-smoke.cjs
```

- 部署产物落点：服务器 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/yourbao/waimai/`（容器内路径 `/www/sites/...`），静态替换即时生效无需 reload。
- nginx conf：`conf.d/www.yourbao.cn.conf`（改前备份 `.bak_waimai_20261006`）。
- 冒烟账号：`smoke-order@yourbao.cn` / `smoke-rider@yourbao.cn`（Wm@Smoke123）。

## 5. 校园配送二期（R2/R4/R5 + 起送价硬校验）

上线日期：2026-10-06。设计文档：`docs/superpowers/specs/2026-10-06-campus-delivery-phase2-design.md`。

### 5.1 路线速查（全端统一标准语句）

| 码 | 名称 | 说明 |
| --- | --- | --- |
| R1 | 商家自送+拾光达接力 | 商家送至校门口，拾光传信者接力送到手 |
| R2 | 快递到校+拾光达接力 | 快递到校后，拾光传信者代取并送达 |
| R3 | 档口+拾光达接力 | 档口现做，拾光传信者送至楼层 |
| R4 | 到店自取 | 凭取件码到店自取 |
| R5 | 校内拾光达 | 拾光传信者按下单需求跑腿代办 |

### 5.2 新增功能一览

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| R5 校内拾光达（跑腿单） | 首页「校内拾光达」入口卡 → 发单页 | 服务类型（代取快递/带饭/帮买/其他）+ 起止点 + 物品描述 + 跑腿费（起步价可配）+ 小费滑杆；支付后自动进接单大厅 |
| 我的跑腿单 | 发单页右上「我的跑腿单」 | 跑腿单列表与状态跟踪 |
| R2 快递到校 | checkout 校园配送 tab 选 R2 | 快递段运费按商家标准；校内接力段 ¥0（接力费在发接力单时单独付） |
| R2 已到校确认 | R2 订单详情 | 快递到校后点「快递已到校」（二次确认，不可撤销）→ 自取或发接力 |
| R2 接力子卡 | R2 原单详情 | 实时反查关联 R5 接力单状态（接力中/已接单/已退款），退款后可重发 |
| R4 到店自取 | checkout「到店自取」 | 自提点=店铺地址；订单详情显示核销码，到店出示核销或自助核销 |
| 起送价硬校验 | 下单时（后端拦截） | 商品金额（含税）未达店铺起送价时拦截，提示「未满起送价 ¥X」；R5 跑腿单豁免 |

### 5.3 R2 学生操作流（快递到校）

```
checkout 选 R2 下单支付 → 等快递到校（订单卡显示「快递配送中」）
  → 点「快递已到校」→ 二次确认（确认后不可撤销）
  → 选择取件方式：
     ① 我去自取：凭取件通知到校内代收点自取，取到后「确认收货」完成订单
     ② 发 R5 接力：跳转发单页（自动预填 A 点=校内代收点、B 点=默认宿舍楼），
        支付接力费后进大厅等传信者代取送达
```

- 接力单退款语义：**只退接力单的跑腿费+小费，R2 原单不退**（快递已到校）；接力失败自动降级为自取，原单回到「请选择取件方式」可再次发接力。
- 确认到校为不可撤销操作，误触请走客服人工。

### 5.4 R5 发单流（校内拾光达）

首页点「校内拾光达」→ 发单页：选服务类型 → 填 A 点（取）/ B 点（送）→ 物品描述 → 跑腿费（不低于起步价）+ 小费（可选）→ 提交支付。运力紧张时提示「当前运力紧张，接单可能延迟」但不阻断发单；入厅后订单卡显示「平台调度中」，滞留超时自动加急置顶 → 强派 → 调度看板人工介入 → 自动退款（T0-T4 降级链路）。

### 5.5 后台配置项（web-admin 拾光达配置页）

| 配置 | 字段 | 说明 |
| --- | --- | --- |
| 跑腿起步价 | `errandBaseFee`（元输入，分存储） | R5 发单页跑腿费下限；未配置默认 ¥2 |
| 起送价 | `minOrderAmount`（分） | 商品单下单硬校验（含税口径）；留空=不校验；R5 跑腿单不受限 |
| 店铺地址 | `storeAddress` | 保存时自动绑定该店为 R4 自提点（名称=店铺名）；清空不影响已有自提点 |
| 启用路线 | `routesEnabled` | 勾选后 checkout 才显示对应路线选项 |
| R4 前置（Vendure 管理台） | — | 渠道需绑定 `store-pickup` 运费方式；商品变体配送档案需含 store-pickup。**推荐直接点配置页「初始化配送档案」按钮**（见 5.8） |

### 5.6 二期截图

![首页拾光达入口](screenshots/waimai/9-1-home-entry.png)
![发单页](screenshots/waimai/9-2-errand-create.png)
![我的跑腿单](screenshots/waimai/9-3-errand-list.png)
![checkout R2 选项](screenshots/waimai/9-4-checkout-r2.png)
![R2 到校确认](screenshots/waimai/9-5a-r2-preparing.png)
![R2 二次确认](screenshots/waimai/9-5b-r2-confirm-modal.png)
![R2 选取件方式](screenshots/waimai/9-5c-r2-arrived.png)
![接力子卡](screenshots/waimai/9-6-relay-card.png)
![R4 核销码](screenshots/waimai/9-7-r4-pickup-code.png)
![后台跑腿起步价](screenshots/waimai/9-8-admin-errand-fee.png)

### 5.7 常见问题

- **接力单退款了，我的快递单钱退吗？** 不退。退款只退接力单的跑腿费+小费，快递原单照常（快递已到校），可在原单重新发接力或自取。
- **起送价按什么算？** 按商品含税金额（页面所见金额）；不含配送费。跑腿单（R5）不校验起送价。
- **「快递已到校」点错了怎么办？** 确认后不可撤销，联系客服人工处理。
- **R5 发单后没人接？** 走平台降级保护：5 分钟加急置顶 → 超时强派 → 调度人工介入 → 最终自动退款，无需手动催单。
- **R4 核销码找不到了？** 订单详情页随时可查，码一生对一单、已核销会显示「已核销」。

### 5.8 配送档案初始化（R2/R4 共用档案，三期）

R2（快递到校）与 R4（到店自取）依赖同一变体档案出配送方式（cjk 分箱按变体 `shippingProfileId` 单值分箱）。拾光达配置页每张店铺卡底部提供**「初始化配送档案」**按钮：

- 点击后自动 **get-or-create** 该渠道租户默认档案「拾光达默认配送档案」，合并 `store-pickup` + `courier-delivery` 两种方式（union 补齐，不删已有绑定），并把两种方式幂等绑定到渠道；
- 渠道内**未绑定档案的商品变体**自动补绑到该默认档案（已显式绑定的变体不触碰）；
- **幂等**，可重复点击；结果弹窗展示已绑定方式与补绑商品数；缺少方式时提示对应路线暂不可用。

![配置页初始化按钮](screenshots/waimai/10-2-campus-config-profile-btn.png)
![初始化结果弹窗](screenshots/waimai/10-3-campus-config-profile-done.png)


## 6. 评价系统（三期：先审后显）

订单完成（Delivered）后，学生可对商品发布图文评价；评价**先审后显**——`pending` 状态对 C 端不可见，管理员「通过」后才进入店铺评论流，并写回商品评分聚合（`reviewRating` / `reviewCount`，商品卡角标直接读）。

### 6.1 学生端（waimai H5）

**写评价**：订单详情页在订单完成后出现「写评价」入口 → 进入评价页（A 经典分节版式）：商品信息卡 + 5 星选择（触点折算档位，1-5 星文案联动）+ 标签快选（口味赞/分量足/配送快/包装好/性价比高）+ 文字评价 + 图片上传（最多 3 张）+ 匿名开关。发布后进入「审核中」。

![评价创建页](screenshots/waimai/11-1-review-create.png)

**我的评价**：「我的-我的评价」查看本人全部评价（状态徽标：审核中/已通过/未通过；展示商家回复；支持删除 = 软删，删除后评论流不可见、商品评分回落）。每笔订单每条明细仅可评价一次。

![我的评价](screenshots/waimai/11-3-my-reviews.png)

### 6.2 店铺评论 tab（menu）

店铺页「评论」tab（A 摘要卡版式）：综合评分摘要卡（大均分 + 1-5 星分布条 + 总条数 + 好评率）→ 筛选 chips（全部/有图/好评/差评）→ 评论列表（头像/昵称（匿名脱敏）、星级、内容、图片缩略（点击预览）、标签、商家回复气泡），触底自动加载更多。首次切到评论 tab 才拉取数据（首屏不浪费请求）。

![店铺评论 tab](screenshots/waimai/11-2-menu-review-tab.png)

商品卡评分角标：商品有已审核评价后，商品卡显示「★ 4.8 N条评价」。

### 6.3 管理端审核（web-admin）

「单 - 评价管理」四 tab：**待审核**（默认）/ 已通过 / 已驳回 / 全部：

- **通过 / 驳回**：pending 评价可双向操作；驳回后可再改判「通过」（先审后显的唯一放行入口）；
- **回复**：已通过的主评可回复（弹窗输入），回复内容展示在 C 端评论流气泡与「我的评价」；
- 图片点击放大预览；软删评价不在列表出现。

![待审核](screenshots/waimai/11-4-admin-review-pending.png)
![已通过（含商家回复）](screenshots/waimai/11-5-admin-review-approved.png)

### 6.4 部署与冒烟复跑

```bash
# H5 部署（同外卖主链路，本地构建 → scp → 解压，即时生效）
node .secrets/deploy-waimai.mjs

# 生产 E2E 冒烟（24 断言：订单 Delivered → createReview pending → 双流不可见 →
# approve 可见+发奖（积分/定向券，幂等双闸）→ stats/hasImages/评分聚合 → 回复 →
# 追评（创建 pending → approve → 评论流气泡）→ myReviews → 软删回落 → 起送价还原）
node .secrets/review-e2e-verify.cjs   # 期望 REVIEW-E2E PASS，幂等可重复跑
```

冒烟走渠道 A（canteen-a-token）真实下单链路（临时调低起送价，结束自动还原 1500）；评价数据用软删收尾不留痕。


## 7. 已知限制 / 待办

- R5 载体变体（id=86）`trackInventory=false` 且已分配到店铺渠道——R5 发单购物车载体行依赖，勿回收/重开库存。
- 微信 JSAPI 支付需在生产配置商户参数后生效；当前冒烟走 COD 授权链路。
- 大厅单滞留 >5 分钟自动加急置顶；强派（T2/T3）调度已具备（DispatchJobService），默认关闭。
- 提现打款为线下转账（管理员审核通过后自行转账并标记「已打款」），无线上支付通道对接。
- 评价奖励的定向券依赖券模板 `distributionChannels` 含 `GRANT` 渠道；未配置的渠道 approve 只发积分（或均不发）。

## 8. 四期：增长闭环

上线日期：2026-10-06。设计文档：`docs/superpowers/specs/2026-10-06-phase4-growth-loop-design.md`。三个方向：骑手钱包与提现闭环、评价有礼 + 追评、经营看板增强。

### 8.1 骑手钱包与提现

**钱包（骑手端）**：「我的 → 骑手首页 → 收入卡 → 去提现」进入钱包页——余额卡（可提现大数字 + 冻结/累计收入副行）+「收入明细 / 提现记录」两个 tab（触底加载）。分成随送达实时入账（`status=credited`）。

![骑手钱包](screenshots/waimai/12-1-rider-wallet.png)

**申请提现**：金额输入（最低 ¥10，不可超可提现余额）+ 收款渠道 + 账号 → 提交后金额立即**冻结**（可提现减少、冻结增加），toast「申请已提交，等待审核」。

![提现申请](screenshots/waimai/12-2-rider-withdraw.png)
![提现记录](screenshots/waimai/12-3-rider-withdraw-list.png)

**管理员审核（web-admin）**：「单 → 提现审核」四 tab：**审核中**（默认）/ 已打款 / 已驳回 / 全部。

- **通过**：确认弹窗 → 状态置 PAID（线下已转账后操作）；
- **驳回**：填驳回原因 → 冻结金额全额退回可提现余额。

![提现审核（web-admin）](screenshots/waimai/12-4-admin-withdraw-pending.png)

流程：`送达 → 分成入账 → 申请提现（冻结）→ 管理员通过（PAID）/ 驳回（退回）`。

E2E 冒烟（认证 → 入账 → 冻结 → 驳回退回 → 再申请 → 通过 PAID）：

```bash
node .secrets/rider-withdraw-e2e.cjs   # 期望 WITHDRAW-E2E PASS，幂等可重复跑
```

### 8.2 评价有礼 + 追评

**奖励规则**：主评**审核通过**时自动发奖（先审后显，发奖发生在放行时刻，防刷屏）：

- **积分**：渠道配置的评价奖励积分（当前 50 分），写入会员积分流水（remark 含「评价」）；
- **定向券**：渠道配置的券模板定向发放一张（模板须含 `GRANT` 发放渠道）；
- **幂等双闸**：`giftGranted` 标记 + `reviewedAt` 审核时间，重复 approve 不重复发奖；追评 approve 不发奖；未配置奖励的渠道只流转状态。

**追评**：主评通过后 **7 日内**可在「我的评价」对该订单主评**追评一次**（「追评」按钮），追评同样先审后显；通过后以气泡形式嵌在店铺评论 tab 的主评下方。已删主评不可追评，追评不允许再追评。

![我的评价-追评按钮](screenshots/waimai/13-1-my-reviews-followup-btn.png)
![追加评价表单](screenshots/waimai/13-2-review-create-followup.png)
![评论流追评气泡](screenshots/waimai/13-3-menu-followup-bubble.png)

E2E 冒烟：`node .secrets/review-e2e-verify.cjs`（24/24 PASS，含发奖/幂等/追评链路，见 §6.4）。

### 8.3 经营看板增强（web-admin）

「数据 → 数据看板 → 经营数据」新增四期区块：

| 区块 | 口径 |
| --- | --- |
| 复购率 KPI | 窗口（近 7/30 天）内有效下单客户中 ≥2 单客户占比（%） |
| 评价均分 KPI | 全量已审核主评均分（不随窗口） |
| 热销商品榜 | 窗口内有效订单按商品**件数**排序 Top5，附金额 |
| 骑手效率榜 | 窗口内送达单按骑手聚合：完成单数 + 准时率（基于承诺送达时段，无时段的单不参与准时率分母） |
| 评价概览 | 均分 / 差评率（≤2 星）/ 待审核数 / 带图率 |

![经营看板（web-admin）](screenshots/waimai/14-1-dashboard.png)

任一接口失败对应卡片显示「—」（不伪造 0）。部署：vendure 走服务器 `git pull + pm2 restart`；web-admin 走 `node scripts/deploy.mjs`（本地构建 scp）。

## 9. 个人中心（地址簿 + 资料编辑 + 发票 + 邀请）

上线日期：2026-10-07。后端为纯加法：campus-delivery-plugin customFields（Address `zoneId/buildingId/route`、Customer `avatarUrl/invoiceTitles`、Order `invoiceApplied/invoiceInfo`，物理列开机自动建）+ shop mutation `applyOrderInvoice`；前端新增 pkg-user 分包六页，地址簿复用 Vendure Address 原生 CRUD，零新实体。

### 9.1 版式 B「外卖资产区」与入口总览

我的 tab 自上而下：**橙头部**（头像圆 + 昵称 + 电话/「未绑定电话」+ 编辑资料入口；未登录显示「点击登录」）→ **资产区四宫格**（优惠券·即将上线灰态 / 常用地址 / 发票抬头 / 邀请好友）→ **订单四态快捷条**（待付款 / 待送达 / 待评价 / 退款售后，跳订单列表带状态筛选）→ **菜单组**（我的评价 / 我的跑腿单 / 联系客服 / 关于拾光达 / 成为传信者）→ 退出登录。

![个人中心-版式B](screenshots/waimai/15-1-profile.png)

### 9.2 常用地址（下单自动带出）

「资产区 → 常用地址」进入地址簿，底部「新增地址」：

- **字段**：联系人（必填）、手机号（11 位校验）、分区 → 楼栋级联单选（数据源与下单页同源）、房号（选填，拼入楼栋明细）、存为默认地址开关；
- **列表操作**：点击进编辑、右侧「删除」（二次确认）、「设为默认」；默认地址带橙色「默认」徽标；
- **失效地址**：分区/楼栋被删除或停用后，地址置灰标「**待更新**」，不可设默认、不可供下单选用，仅可进编辑页修正（跨店铺的脏数据同理不生效）；
- **下单联动**：checkout 进入时若默认地址的分区/楼栋命中当前店铺配置，自动预选分区与楼栋（**送达时段不预存，仍需手选**），分区选择区上方显示默认地址摘要行，可点击改选。

![地址簿-默认与待更新](screenshots/waimai/15-2-address-book.png)

### 9.3 资料编辑

橙头部「编辑资料」进入：头像（点击换图，走既有上传通道）+ 昵称 + 电话，保存后返回即刷新。未上传头像时回显 SSO 头像/首字占位。

![资料编辑](screenshots/waimai/15-3-profile-edit.png)

### 9.4 发票（抬头管理 + 订单开票申请）

- **抬头管理**：「资产区 → 发票抬头」，最多 **5 条**（超限前端拦截）；个人抬头必填名称+邮箱，企业抬头另需税号（15-20 位字母数字校验）；数组首位为默认。
- **订单开票**：订单详情页对**已支付且未申请过**的订单显示「开发票」按钮 → 底部弹层选抬头 + 接收邮箱（默认带抬头邮箱）→ 提交后按钮区转为「已提交开票申请」只读条（展示抬头快照摘要）。幂等：`invoiceApplied` 闸防重复申请，商家线下人工开票（B 端本期不流转）。

![发票抬头管理](screenshots/waimai/15-4-invoice-titles.png)

### 9.5 邀请好友与关于

- **邀请好友**：展示当前用户邀请码（SSO 侧生成写入）大字号卡片，「复制邀请链接」拼 `?invite_code=<码>` 复制分享；
- **关于拾光达**：版本号 + 客服电话（`VITE_SERVICE_PHONE` 环境变量，当前待运营提供，未配置显示「未配置」）+ 用户协议 / 隐私政策。

![邀请好友](screenshots/waimai/15-5-invite.png)
![关于拾光达](screenshots/waimai/15-6-about.png)

暗色主题下个人中心保持固定浅色版式（品牌橙头部不变，无样式破碎）：

![暗色抽查](screenshots/waimai/15-7-profile-dark.png)

### 9.6 冒烟复跑

```bash
python scripts/_smoke_profile.py   # waimai 仓库根执行，期望 E2E SMOKE PASS (10/10)，幂等可重复跑
```

覆盖：登录 → campusZones/Buildings → 地址创建（customFields 落库）→ 地址簿默认徽标渲染 → 发票抬头 JSON 写回 → 邀请码注入与页面渲染 → 已支付订单 `applyOrderInvoice` 首调成功（或幂等已申请）→ 重复申请被拒 `INVOICE_ALREADY_APPLIED` → 七张 390×844 dpr=2 截图。

已知限制：客服电话待运营提供后填 `.env.production` / `.env.development` 重新部署；发票为轻量版，B 端流转 / 第三方自动开票不在本期。

## 10. 优惠券（券 C 端闭环）

上线日期：2026-10-07。学生端全链路：领券中心领券 → 券包管理 → 下单自动试挂最优 → 支付核销。

### 10.1 功能入口与学生操作流

- **领券中心**：个人中心「资产区 → 优惠券」进入券包，点「去领券中心」；或券包页内直达。两个 tab：
  - **可领取**：已开始的券模板，点「立即领取」即入券包（每张券每人限领 1 张，重复领取被拦截 toast）；
  - **即将开始**：未开始的券模板（`couponCentreUpcoming`），可提前浏览、到点领取。
- **我的券包**：三个 tab——未使用（可「去使用」直达领券中心关联商品）/ 已使用 / 已过期，空态均有引导按钮。
- **商品专属券 chip**：店铺菜单页已绑券的商品行显示「领取」chip（商品维度专属券，与通用券分开展示），点击即领。
- **下单选券**：checkout 页「优惠券」行自动**试挂当前最优可用券**（无可用券显示默认文案）；点行弹选券弹层——可用券（勾选切换）/ 不可用券（灰态 + 原因：未达门槛等）；支持换券 / 不使用。
- **核销链路**：领取 UNUSED → 支付成功自动核销 USED → 角标 -1；退款 RETURNED；到期 EXPIRED。

**券优惠口径**（以 `coupon-promotion-condition.ts` 为唯一权威）：折扣券按折数（`discountValue=85` 即 8.5 折），优惠 = 商品小计 × (100−折数)/100；免邮券优惠 = 配送费；固定/满减券优惠 = min(面额， 商品小计)；门槛按**商品小计**判断（不含运费）。

### 10.2 截图

![领券中心-可领取](screenshots/waimai/coupon-centre-claimable.png)
![领券中心-即将开始](screenshots/waimai/coupon-centre-upcoming-empty.png)
![我的券包-未使用](screenshots/waimai/my-coupons-unused.png)
![我的券包-已使用空态](screenshots/waimai/my-coupons-used-empty.png)
![我的券包-已过期空态](screenshots/waimai/my-coupons-expired-empty.png)
![checkout 优惠券行](screenshots/waimai/checkout-coupon-row.png)
![选券弹层](screenshots/waimai/checkout-coupon-sheet.png)
![商品行专属券 chip](screenshots/waimai/shop-menu-coupon-chip.png)
![个人中心券入口角标](screenshots/waimai/profile-coupon-entry.png)

### 10.3 冒烟复跑

```bash
python scripts/_smoke_coupon.py   # waimai 仓库根执行，期望 E2E SMOKE PASS，幂等可重复跑
```

覆盖：登录 → 券中心双 tab → 券包三 tab → checkout 自动试挂 + 选券弹层 → 菜单 chip → profile 角标 → 清理购物车。生产冒烟（只领不下单）可用环境变量覆写 `SMOKE_BASE` / `SMOKE_CHANNEL` 跑同脚本。

## 11. 订单通知（微信公众号模板消息）

上线日期：2026-10-07。campus-notify 加法扩展：订单域 4 事件模板推送 + 待付款提醒/超时取消定时任务。

### 11.1 推送事件一览

| 事件 | 触发时机 | 说明 |
|------|----------|------|
| 下单成功 orderPlaced | 订单支付成功（转入 PaymentSettled/授权完成） | 推送店铺确认信息 |
| 待付款提醒 paymentPending | 订单停在待支付 **+10 分钟** | 定时任务扫描触发，提醒尽快支付 |
| 取消通知 orderCancelled | 商家/系统/超时取消订单 | **用户本人主动取消不推**（避免打扰） |
| 售后进度 afterSales | 售后审核通过 Approved / 已退款 Refunded / 退款失败 RefundFailed 三节点 | 其余售后状态不推 |

- **落地页跳转**：消息点击跳转 H5——由 campus 配置的 `h5BaseUrl` 拼接订单/售后详情路径（禁硬编码域名）。
- **待付款超时取消**：+15 分钟未支付自动取消（先释放库存分配再取消，到点复查订单状态，非待支付则幂等跳过；与既有 30 分钟 OrderTimeoutPlugin 共存，先到先得）。取消同样触发「取消通知」。
- **静默跳过**：用户无 openid、渠道未配置对应模板 ID 时静默跳过，不报错不重试。

### 11.2 运维配置（**上线必做**）

1. **微信公众号申领模板**：在公众号后台「广告与服务 → 模板消息」申领 4 个订单类模板，拿到 4 个模板 ID：
   - 下单成功通知 / 待付款提醒 / 订单取消通知 / 售后进度通知；
2. **web-admin 填配置**：登录 `https://e.joho.cn` → 校园配送 → 店铺配置页，每个店铺渠道填：
   - 4 个新模板 ID（下单成功 / 待付款提醒 / 取消通知 / 售后进度）——与既有 5 个模板字段（接单/骑手接单/出餐完成/送达/异常处理）并列；
   - `h5BaseUrl`（H5 站点域名，如 `https://www.yourbao.cn/waimai/index.html`）；
3. **验证**：配置后下一笔真实订单即走推送；也可用 pm2 日志关键字 `CampusNotify` / `PaymentTimeout` 观察发送调用（未配置模板时日志为静默跳过）。


## 12. 骑手提现与审核（2026-10-08 P2 收尾）

### 12.1 流程

1. **骑手端**（www.yourbao.cn/waimai/）：收入页「去提现」入口 → 骑手钱包（可提现/审核中/累计收入三数 + 收入明细/提现记录双 tab）→ 申请提现（≥¥10，支付宝/微信 + 收款账号）。**提交即冻结**（可提现减少、审核中增加）；同骑手存在审核中申请时不可重复申请（后端防重拦截，报「您有审核中的提现申请」）。
2. **管理后台**（e.joho.cn/guanli，订单 → 骑手提现审核）：待审核/已打款/已驳回/全部四 tab → **通过**（线下微信/支付宝转账完成后操作，标记已打款仅留痕，不再动账）或 **驳回**（必填备注，冻结金额自动退回骑手余额）。
3. **资金口径**：申请冻结 = deductBalance；驳回退回 = addBalance；资金固定默认渠道上下文，管理端跨渠道可审核；累计收入跨渠道汇总（2026-10-08 修复：此前按默认渠道过滤恒为 0）。

### 12.2 调度配置（campusConfig，admin-api `campusConfig` 查询 / web-admin 配置页可调）

- `autoAssignMinutes`（默认 10）：大厅 open 单滞留超时 → T2 强派最佳在线骑手（信用分高者优先）
- `autoRefundMinutes`（默认 30）：无人接超时 → T4 全额原路退款 + 订单取消 + no_rider 标记 + 定向补偿券
- `inProgressSlaMinutes`（默认 45）：配送中 SLA 告警阈值
- 大厅排序：滞留 >5min「加急」置顶 → 小费降序 → 入厅时间升序；前端自动加急徽标
- `paused`：运力总开关。2026-10-08 生产核验：全部渠道 paused=false、阈值均为默认值（10/30/45），调度默认开启无需配置

### 12.3 验证记录

- E2E：`node .secrets/rider-withdraw-e2e.cjs` → `RIDER-WITHDRAW-E2E PASS`（13 断言：注入余额/冻结/越界拒/驳回退回/**防重 duplicateBlock**/通过留痕/流水与记录可查；开头自动驳回遗留 PENDING 保证幂等）
- 冒烟：`waimai-e2e-smoke.cjs` S1-S8 PASS（2026-10-08 订单 342/343）
- 截图：`vshop/docs/screenshots/waimai/p2-cleanup/`（5 张 780×1688：收入页/钱包页/提现记录/申请页/web-admin 审核页，逐张目检合格）

## 13. 商家小票打印（C-Lodop，58mm 热敏，2026-10-20）

### 13.1 原理与前提

- 纯前端驱动：web-admin 工作台页通过 **C-Lodop** 浏览打印服务（跑在商家电脑 `http://localhost:8000`，备用 18000）静默打印到商家本机/局域网 WiFi 热敏打印机，免第三方账号、免计费。
- **前提（缺一不可）**：① 商家电脑安装并启动 C-Lodop 服务（官网下载 C-Lodop 云打印服务）；② 打印机与本机连通并设为默认打印机（驱动里测过自检页）；③ 工作台页保持开启（浏览器关闭即停自动打印）；④ 建议 Chrome/Edge（HTTPS 页加载 localhost 打印服务属浏览器豁免，Safari 等可能拦截）。

### 13.2 店铺配置（web-admin 拾光达配置页 → 「小票打印」）

| 打印时机 | 行为 |
| --- | --- |
| **关闭** | 不自动打印，仅可手动补打 |
| **支付后打印** | 工作台轮询（10s）发现新已支付单（30min 内）且未打印 → 自动出票 |
| **接单后打印** | 商家点「接单」成功后自动出票（打印失败不阻塞接单，可补打） |

- 配置存 `campus_fulfillment_config.printMode`，非法值一律按关闭处理。

### 13.3 工作台（商家接单页）

- 顶部打印状态条：显示当前自动打印模式；未检测到 C-Lodop → 黄条提示安装指引。
- 每张订单卡有「**补打**」按钮（全部 tab 含预约单可用，不受 30min 限制）；打印成功回写 `waimaiPrintedAt`（防重复自动打印 + 补打留痕）。
- 小票内容：店铺名/电话 → 单号/下单时间/路线/分区楼栋/送达时段 → 商品明细（名称×数量+金额）→ 商品小计/配送费/合计 → 尾注（暂不含整单备注：备注功能未上线）。

### 13.4 截图

![工作台打印状态条与补打按钮](screenshots/waimai/9-1-merchant-print.png)

![配置页小票打印三选一](screenshots/waimai/9-2-config-printmode.png)

![58mm 小票版式](screenshots/waimai/9-3-receipt-58mm.png)

### 13.5 验证记录（2026-10-20）

- vendure `pnpm build` / web-admin `npm run build:h5` 均通过；plugin.ts 两段 schema 过 graphql parse 校验（admin 块含 `campusMerchantMarkPrinted`/`printMode` 新字段）。
- Playwright 移动视口（390×844 dpr=2）mock 自测：工作台打印状态条/补打按钮/接单按钮渲染 PASS；配置页三选一与提示文案 PASS；58mm 小票版式截图目检 PASS（219px 窄幅无溢出）。
- 真机打印需商家电脑装 C-Lodop 后自测：工作台点「补打」应出票；无 C-Lodop 时点补打 → toast「未检测到打印服务」（已验证失败路径）。
- **本机真机联调（2026-10-21 PASS）**：装 C-Lodop 6.647 Win64（Inno 静默参数 `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`，装后需手动启动 `CLodopService64.exe /install /start`，监听 8000/18000/8443/9200）→ 页面加载 CLodopfuncs.js 得 `LODOP.VERSION=6.6.4.7` → `SET_PRINTER_INDEXA('OneNote (Desktop)')` → `PRINT()` → Win32_PrintJob 队列实见任务 `waimai-WA26001`（Printing|OK），C-Lodop→spooler 链路闭环。注意：「Microsoft Print to PDF」验证会弹「位置不可用」（SYSTEM 会话默认保存路径 systemprofile\Desktop 不可用）——**这是 PDF 虚拟打印机特有问题，真实 WiFi 热敏打印机直接出纸不受影响**。

## 14. 订单备注（顾客给商家留言，2026-10-21）

P1 对标缺口。顾客在**确认订单页**（应付金额下方）可填「订单备注」（选填，≤200 字），随单写入 `Order customFields.note`（transition 前 `setOrderCustomFields` 持久化，空值清除残留）；商家工作台订单卡显示黄色备注条；58mm 小票在送达时段下方打印「备注：」行。

![确认订单页备注输入](screenshots/waimai/14-1-checkout-note.png)

- 链路：C 端 checkout.vue `orderNote` → `setOrderCustomFields({note})`（api/mutations/checkout.ts）→ `Order customFields.note`（custom-fields.ts，synchronize 自动建列）→ 看板 `MerchantBoardOrder.note`（merchant-admin.service.ts）→ 工作台 `.note` 黄条 + `lodop.ts` 小票 noteHtml（虚线上方、商品表之前）。
- 约束：200 字前端截断（maxlength + slice 双保险）；i18n 双语已补（zh-Hans/en 各 2 条 checkout + 2 条 campusMerchant）；无备注的订单卡不渲染备注条、小票不打备注行。
- 商家无需任何配置，装好小票打印（§13）即自动带上备注。

![商家工作台备注条](screenshots/waimai/14-2-merchant-note.png)

![58mm 小票备注行](screenshots/waimai/14-3-receipt-note.png)

- 验证（2026-10-21）：三端构建通过（campus-delivery-plugin / waimai / web-admin）；checkout 备注卡真实组件自测（输入 + 字数统计渲染 PASS）；`buildReceiptHtml` 真实函数输出含备注行（219px 窄幅无溢出）；工作台 mock 数据自测（有备注订单显示黄条、无备注不显示，对照 PASS）。
- 生产验证（2026-10-21 PASS）：三端部署上线；**注意两个生产坑**：① 主库 `synchronize: false`（dev-config.ts:253），新增 Order customField 后 `pm2 restart` **不会自动建列**，需手动 `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsNote" varchar(255);`；② vendure 插件 **lib 编译产物必须随提交入库**（首提只 add 了 src → 服务器 lib 停旧版 schema 缺 note，补提 lib 后生效）。最终探针：`setOrderCustomFields(input:{customFields:{note:"probe"}})` 返回 `NO_ACTIVE_ORDER_ERROR`（过 schema 校验、无 session 预期错误）= note 上线确认。

## 15. 履约 P1 卡点修复（运单对账 / 出餐闸门 / 交接码 / 时间线纠偏，2026-10-23）

- **A 外部运单轮询对账**：`DeliveryProvider.queryStatus`（达达 `/api/order/status/query`、美团 `/api/order/query`）由网关 `syncDeliveryStatus` 驱动既有幂等状态机；调度 job 对 `hallStatus=third_party` 在途单每 5min 主动查一次（`customFields.thirdPartySyncAt` 限频），平台回调丢失也能自动推进。未实现 queryStatus 的平台静默跳过。
- **B 时间线纠偏**：`src/utils/timeline.ts` 按实际 `deliveryPlan` 判定段数；R1/R2 降级为 `campus_rider`（缺交接点/商户超时/外部失败）后只渲染「商家接单→传信者到店取餐→配送中→已送达」一段，不再显示永不完结的第二段。
- **C R2 出餐闸门**：R2 支付后先 `pending_merchant`，商家接单（accepted）→ 出餐完成（cookingDone）才转 `pending_dispatch` 由运营推送外部快递；商户接单超时 / 已接单久未出餐分别降级传信者到店取餐直送。
- **D 交接码**：第一段送达校园交接点入接力大厅时生成 4 位 `customFields.handoverCode`（+`handoverCodeAt`）。**商家工作台**订单卡显示「取餐交接码」，学生订单详情同步可见；骑手端开始取货必须输入该码，`campusStartTask(orderId, code)` 校验不符返回「交接码不正确」，防丢餐扯皮。骑手组卡批量开始取货时逐单弹码输入，取消则中止整组。
- 配置/运维：新增 Order customFields 三列（`customFieldsHandovercode` / `customFieldsHandovercodeat` / `customFieldsThirdpartysyncat`），生产已验证自动建列；外部平台凭据（`DADA_*` / `MEITUAN_*`）未配置时推送与轮询均静默跳过。
- 验证（2026-10-23）：campus 230 用例、gateway 32 用例全绿；三端本地构建通过；生产 `admin-api/shop-api 200`，日志确认「外部快递状态回调已接入订单履约」。

### 15.1 真机截图（390×844 dpr=2，真实链路：R1 建单 → 商家接单/出餐 → 送达交接点生成交接码 → 骑手抢单取货）

**① 骑手点「我已到店 · 开始取货」弹出取餐码校验层**（接力单必填 4 位码，错误会被后端拒绝）

![骑手取餐码弹层](screenshots/waimai/p1-1-rider-handover-code.png)

![取餐码弹层细节](screenshots/waimai/p1-1b-rider-code-dialog.png)

**② 学生订单详情展示「取餐交接码」**（第一段送达交接点后生成，第二段骑手须核对）

![订单详情交接码](screenshots/waimai/p1-2-order-handover-code.png)

**③ 商家工作台「配送中」页签订单卡展示取餐交接码**（交付给骑手核对）

![商家工作台交接码](screenshots/waimai/p1-3-merchant-handover-code.png)

![商家订单卡细节](screenshots/waimai/p1-3b-merchant-card.png)

- 复核要点：三处展示的码值一致（本次 9390）；订单号一致（本次 SKJ8MN47VQDQK4JJ）；时间线为两段（第一段「商户已送达交接点」已完成，第二段进行中）。
- 线上验证使用 `canteen-a-token` 渠道临时配置 R1 交接点「桂1栋驿站」，截图后已清空该配置，未留脏数据。

## 16. 超时赔付 + 工作台云打印增强（P0 收尾，2026-10-23）

### 16.1 超时赔付（后台配置 + 自动发券）

- **后端全链路**（vendure `bd6aad357`）：订单支付时固化「承诺送达时间」；实际送达超过 承诺时间 + 宽限分钟 即自动发赔付券，每单只赔一次；归因留痕（赔给谁、为什么赔可查）。
- **配置入口**：web-admin 拾光达配置页 → 展开店铺卡 → 「超时赔付」区：
  - 开关（默认**关**，灰度开启）；宽限分钟（默认 10）；赔付券模板 ID（**必须独立**，不要与无骑手补偿券共用）。
  - 未填券模板 ID 时只告警不真正发券，页面有黄条提醒，请补齐后再开启。
- 配置存 `campus_fulfillment_config.timeoutCompensation*` 三字段，旧表单保存不会清空已配值。

![超时赔付配置区](screenshots/waimai/16-1-timeout-config.png)

### 16.2 工作台云打印增强（商家接单页）

在 §13 小票打印基础上增强（`printMode` 非「关闭」时顶部显示打印条）：

- **连接探测**：进入工作台自动探测 C-Lodop，未连接显红态「打印服务未连接，本单未出票」；装好/启动服务后点「**重新连接**」即恢复，无需刷新页面。
- **未出票可见可补**：打印失败的单据在顶部汇总「{n} 单未出票」，点「**重试打印**」串行补打；新单超过 2 分钟仍未出票，订单卡上显示「未出票」徽标。
- **使用说明**：打印条右侧「使用说明」弹窗，四步指引（装 C-Lodop 设自启 → 打印机开机纸足 → Chrome/Edge 保持页面 → 点重新连接自动补打）。

![工作台打印条未连接态](screenshots/waimai/16-2-merchant-print.png)

![使用说明弹窗](screenshots/waimai/16-3-merchant-print-help.png)

### 16.3 验证记录（2026-10-23）

- web-admin 构建通过，新词条已打进产物（`index-Bo7Ux-3J.js` 含 timeoutCouponMissing/printRetryFailed）；vendure 已推送并部署（`/www/apps/vendure` reset 至 `bd6aad357` + pm2 restart，JobQueue 正常）。
- 线上回归：admin-api 200；部署的插件 lib 含 `timeoutCompensationEnabled`；站点 `index.html` 引用新 chunk，chunk 内含新词条。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli 真实环境）：超时赔付配置区（开启态含宽限分钟/券模板/告警）PASS；工作台打印条未连接红态 + 重新连接 + 使用说明 PASS；说明弹窗 PASS。截图用 `test-marketplace-shop` 临时开 `printMode=onPaid`，**截后已恢复 off，无脏配置**。

## 17. 配送体系体检补齐（P1 三项 + P2 运营缺口，2026-10-23）

### 17.1 改址差额闭环（P1-1）

- 顾客改址产生 `diff` 后进「改址台账」，待收/待退两栏金额直接可读。
- 点「结清」可选 **补收 / 退款 / 免收**；退款走真实退款链路（订单支付方式原路退），必须填 **结清说明**，可填 **退款单号** 作为凭证；已结清记录保留操作人与时间。
- 订单详情页新增「改址记录」区：每次改址显示「原址 → 新址 / 差额 / 结清状态 / 时间」，改址按钮受 `CampusConfig` 权限控制（无权限用户不可见）。

![改址台账](screenshots/waimai/17-3-address-ledger.png)

### 17.2 结算页实时配送费（P1-2）

- 结算页分区改为展示与下单同口径的 **实时配送费**（`campusZones { price addFee }`），高峰/供需/手动倍率加价体现在分区 chip 上；运费行下方追加提示「含高峰/供需加价 ¥x」，避免「结算价 ≠ 实付价」。
- 订单详情分区 chip 同样取实时价，历史订单保留快照价。

### 17.3 履约参数与时段容量（P1-3）

配置页新增「履约参数（当前店铺）」：佣金率、自动派单开关与时限、配送中 SLA 告警、商家超时未接单转派时限、商家确认收货开关、无骑手补偿券模板；下方「送达时段容量」按店铺展示今日各时段容量与已锁定量。

![履约参数与时段容量](screenshots/waimai/17-1-fulfillment-config.png)

### 17.4 楼栋与分区管理（P2-9）

- 楼栋坐标页「分区管理」面板：分区可 **改名 / 改基价（元）**，保存后仅影响此后新订单，历史订单保留快照。
- 楼栋编辑面板底部新增 **删除楼栋**：二次确认；若已有订单引用该楼栋则拒绝并提示引用单数（防脏数据）。

![分区管理](screenshots/waimai/17-2-zone-manage.png)

### 17.5 调度中心外部快递（P2-8）

- R2/R3 订单卡展示「路线 · 快递状态」与外部单号；大厅卡可 **推送快递**（达达/美团二选一，二次确认），进行中列表头支持 **批量推送**；已推送未完结单可 **取消外部快递**（R2 回待派单、R3 回大厅）。
- 已推送且在途的单再次推送会被后端幂等拦截，异常/已取消状态允许换家重推。

### 17.6 订单详情补配送信息 + 页面权限（P2-4/P2-5）

订单详情新增「校园配送信息」卡：履约路线、配送状态、送达时段、骑手、交接码、第三方单号与快递员姓名/电话（无值不显示空行）。

![订单详情配送信息](screenshots/waimai/17-5-order-detail.png)

各校园页接入权限守卫：配置/楼栋/改址台账 → `CampusConfig`，调度/看板 → `CampusViewDispatch`，商家接单 → `CampusMerchant`；无权限进页面提示并自动返回。

### 17.7 验证记录（2026-10-23）

- 三仓均已提交推送并部署：vendure `521af5e18`（服务器 `git pull` + `pm2 restart vendure --update-env`，admin/shop API 200）、web-admin `788167a1`（`node scripts/deploy.mjs`，nginx reload OK）、waimai `2057519`（`node .secrets/deploy-waimai.mjs`，站点 200）。
- 线上 schema 已生效：`campusZones { price addFee breakdown }`、`campusSettleAddressChange(note)`、`campusUpdateZone`、`campusDeleteBuilding`、`campusAdminDispatchExternal`、`campusAdminCancelExternal`。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli）：履约参数/时段容量 PASS、分区管理（改名/改价/保存）PASS、改址台账 PASS（当前无改址记录，空态正常）、调度中心 PASS、订单详情「校园配送信息」PASS（订单 415，R1，骑手 #188）、「代顾客修改地址」按权限显示 PASS。
- 已知数据限制：线上无 R2/R3 订单与改址记录，外部快递推送按钮与改址历史列表本次未取得真实数据截图；接入真实 R2/R3 单后按 §17.5/§17.1 复验即可。
- ~~未做（P3 数据卫生，按用户选择延后）~~：`thirdPartyFee` 字段清理、改址成功通知、跑腿报价与结算同口径一致性收口 —— **已于同日补齐，详见 §18**。

## 18. P3 数据卫生清理（2026-10-23）

### 18.1 thirdPartyFee 死字段清理

- 订单级「外部快递费用」快照字段（`customFields.thirdPartyFee`）全仓无查询/报表/对端消费，已删除字段定义与唯一写入点（外部推单成功时）。
- 启动迁移幂等执行 `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsthirdpartyfee"`：**历史值不可恢复**；门店级运费基数 `thirdPartyBaseFee`（R2 第三方到校基价）语义不同，完全保留不受影响。

### 18.2 改址成功通知

- 后台「校园配置 → 节点通知模板」新增 **改址成功模板ID**（`notifyTemplateAddressChanged`，留空不通知）。
- 运营在订单详情「代顾客修改地址」成功后，顾客收到公众号模板消息：订单号、商品摘要、新址（`分区·楼栋`），点击跳转 H5 订单详情。
- 幂等口径：`dedupe_key = campus:addressChanged:{orderId}:{改址台账记录id}`，同一订单多次改址各推一条，且不会吞掉退款到账等既有售后通知。

![改址成功模板ID](screenshots/waimai/p3-cleanup/02-address-changed-input.png)

### 18.3 跑腿报价与结算同口径

- 发单页起步价（`ErrandService.getErrandBaseFee`）与结算实收（ShippingCalculator `campusErrandCalculator`）共用 `quoteDynamicBaseFee`：同一动态计价配置、同一加价规则、同一 `maxAddFee` 封顶。
- 新增 `errand-quote-consistency.spec.ts` 锁定回归：动态计价关闭时两处均 200 分；`manualMultiplier=1.5 + maxAddFee=100` 时两处均 300 分，且 metadata 拆解（baseFee 200 / addFee 100 / scope errand）一致。

### 18.4 验证记录（2026-10-23）

- 部署：vendure `72b932de7` 推送后服务器 `git pull` + `pm2 restart vendure --update-env`，shop-api 200；web-admin `node scripts/deploy.mjs`（nginx reload OK）。
- 数据库核对：`order` 表已无 `customFieldsthirdpartyfee` 列；`campus_fulfillment_config` 已新增 `notifyTemplateAddressChanged` 列。
- 线上 schema：`campusStoreConfigs { notifyTemplateAddressChanged }` 返回 null 正常；`campusUpdateStoreConfig(input.notifyTemplateAddressChanged)` 保存回读 PASS。
- 单测：插件全量 269 passed（含 `campus-notify` 11 条、`waimai-store`、`third-party-delivery`、新增 `errand-quote-consistency` 2 条）。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli）：配置页「改址成功模板ID」可见可填 PASS。

![校园配置-改址成功模板](screenshots/waimai/p3-cleanup/01-campus-config-address-notify.png)

## 19. 配送体系补漏（P4：资金/权限/闭环，2026-10-23）

### 19.1 支付成功后才进大厅（未支付不进厅、不可抢）

- 入厅闸门从「下单即入厅」改为 **支付成功（Authorized/Settled）后入厅**；未支付订单不再出现在调度大厅，也不会被骑手抢单。
- 幂等：同一订单 Authorized → Settled 两次事件只入厅一次（DB 重读 `hallStatus` 判重）；已取消订单即使收到支付事件也不入厅。
- 下单成功通知保持原有时点（下单即发），与入厅解耦。

### 19.2 取消/退款释放时段锁位

- 时段容量锁位改为「下单锁定、取消释放」：订单进入 `Cancelled`（含用户取消、退款、超时未支付关闭）时自动 `lockedCount - 1`，并用 `GREATEST(..., 0)` 兜底防负数。
- 之前只加不减会导致时段容量被历史取消单占满；现在运营「送达时段容量」看板的已锁定数可随取消回落到真实值。

### 19.3 调度权限拆分 + 跨店校验

- 新增权限 **`CampusDispatch`**（调度写操作）；`CampusViewDispatch` 仅保留看板只读。上线启动时自动给**已持有** `CampusViewDispatch` 的角色补授 `CampusDispatch`，不会因拆分失权。
- 派单 / 退回大厅 / 异常处置 / 外部快递推送与取消均要求 `CampusDispatch`；前端在仅有看板权限时显示黄条「当前账号仅有看板权限…」并隐藏写操作按钮。
- 三个调度写操作新增**订单所属渠道校验**：跨店订单直接拒绝（`订单不属于当前店铺`），防止多店铺场景误操作他家订单。

### 19.4 商家拒单/缺货（全额退款并取消）

商家接单页「待接单 / 备餐中」卡片新增 **拒单** 按钮（危险色，置于按钮链末尾防误触）：

1. 点「拒单」→ 选择原因：**商品售罄 / 临时打烊 / 超出配送范围 / 其他原因**；
2. 二次确认弹层显示订单号与「全额退款并取消，不可撤销」；
3. 确认后按 **已退总额只退剩余**（避免重复退款），取消订单并通知顾客（取消原因写入通知文案）。

![商家拒单按钮](screenshots/waimai/p4-delivery/02-merchant-board.png)

![拒单原因选择](screenshots/waimai/p4-delivery/04-reject-reasons.png)

![拒单二次确认](screenshots/waimai/p4-delivery/05-reject-confirm.png)

### 19.5 改址联动（交接点快照 / 外部运单重推）

- **R1/R2**：顾客改址后按新楼栋坐标重算最近交接点，并回写订单 `handoverPoint*` 快照；餐已到交接点（`open`）或已被骑手取走（`grabbed/delivered`）时**不改快照**，避免把骑手指向错误位置。
- **R3 外部快递在途**（已接单/已取货）改址：自动取消外部运单并回到 `pending_dispatch` 等重新推送，同时保留 `deliveryPlan=external_courier` 以便重推成功；取消失败只告警不阻断改址。
- 未配置交接点或楼栋无坐标时保留旧快照，不做破坏性清空。

### 19.6 外部快递节点通知 + 赔付回扫窗口可配

- 外部快递 **接单 / 取货** 两个节点新增顾客通知（复用「骑手已接单」模板，`dedupe` 后缀区分节点，不会与出餐完成通知互相吞掉）。
- 超时赔付回扫窗口从固定 24h 改为**可配**（`timeoutCompensationWindowHours`，1–168 小时，默认 24）：长账期/补赔场景可放大窗口，配置入口在「超时赔付」区（履约参数与店铺卡均可改）。

![赔付回扫窗口配置](screenshots/waimai/p4-delivery/01-timeout-window.png)

### 19.7 验证记录（2026-10-23）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；`npx vitest --config vitest.config.mts --run` **29 文件 / 269 用例全 PASS**；web-admin `npm run build:h5` + `node scripts/deploy.mjs` PASS。
- 部署：vendure `885e7915d` 推送后服务器 `git pull` + `pm2 restart vendure --update-env`，admin-api 200；web-admin `d73e935b` 部署，nginx reload OK。
- 数据库核对：`campus_fulfillment_config.timeoutCompensationWindowHours` 已建列（default 24）；`role.permissions` 中 `senior-admin` 已自动补授 `CampusDispatch`（与 `CampusViewDispatch` 同角色并存）。
- 线上 schema：`campusMerchantRejectOrder(orderId, reason)` 已注册；`campusStoreConfigs` / `campusUpdateStoreConfig` 含 `timeoutCompensationWindowHours`。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：赔付回扫窗口可见可填 PASS；待接单卡片「拒单」按钮 + 原因浮层 + 二次确认弹层 PASS；调度中心页面正常、写操作按钮对 `CampusDispatch` 账号可见 PASS。
- 截图说明：为展示拒单按钮，临时将一笔历史订单的 `hallStatus` 置为 `pending_merchant` 并隐去骑手信息，**截后已还原**（`grabbed` + 原骑手），未触发退款、无脏数据。
- 数据限制：线上无 R2/R3 在途订单与改址记录，改址联动与外部快递节点通知本次未取得真实数据截图，接入真实数据后按 §19.5/§19.6 复验即可。

## 20. 配送体系二次体检（P0 五项：终态一致性 / 看板干净 / 统计口径，2026-10-24）

第二轮只读审计发现 17 项体系性遗漏（不含 P4 已修 8 项），本轮先修 P0 五项。核心问题：**骑手送达只写 `deliveryStatus`，不写 `hallStatus`**，导致送达后的订单在调度墙、商家台、统计里长期「滞留配送中」（线上实测 14 单）。

### 20.1 骑手送达同步写终态 `hallStatus=delivered`

- `RiderTaskService.deliver()` 在写入 `deliveryStatus=delivered` 的同时写 `hallStatus=delivered`（与 R2/R3 外部直送的终态一致）。
- 影响面：送达后订单立即退出调度看板「进行中」、商家工作台「配送中」、自动扫描（`DispatchJobService` 只扫活跃状态），不再被 SLA 超时告警反复计入。
- 前端/接口无需改动，`delivered` 已是既有终态枚举。

### 20.2 调度看板 / 商家工作台过滤终态单

- 调度中心看板：`cancelled` / `no_rider_final` / `delivered` 三类终态单不再进入「大厅待接 / 进行中 / 告警」；`exception_final`（已处置）仍进「异常处置记录」留痕。
- 兼容**历史脏数据**：即使 `hallStatus` 仍为 `grabbed`，只要 `deliveryStatus=delivered` 也不再进墙/进栏。
- 商家工作台：`deliveryStatus=delivered` 的单不再出现在「配送中」等流转栏（今日完成数与金额口径不变）。

![调度中心：终态单不进墙](screenshots/waimai/p5-delivery/01-dispatch-terminal-clean.png)

![商家接单：配送中无送达残留](screenshots/waimai/p5-delivery/02-merchant-delivered-clean.png)

### 20.3 第一段送达加前置状态校验

- `completeFirstLeg`（R1 商户送交接点 / 自营快递送达）新增状态前置校验：
  - `deliveryPlan=merchant` 必须处于 `merchant_delivering`；
  - `deliveryPlan=owned` 必须处于 `owned_dispatched`。
- 不符时返回「第一段已送达或订单状态已变更，请刷新后重试」。防止商家重复点击把已回大厅（`open`）或已送达的单**再次** `enterHallForHandover`：重置 `hallStatus`、清空骑手、重生成交接码。

### 20.4 配送统计只计校园履约单

- 「配送看板」SQL 增加 `hallStatus IS NOT NULL` 过滤：普通快递、自提等非校园履约单不再计入有效单量 / 准点率 / 环节耗时 / 店铺对比。
- 线上实测（近 7 天）：修复前口径 24 单，修复后 **4 单**（14 单校园履约 − 10 单取消）；与真实业务量一致。

![配送看板：有效单量回到校园履约口径](screenshots/waimai/p5-delivery/03-stats-scope.png)

### 20.5 时段更新加渠道归属校验

- `updateSlot` 查询条件增加 `channelId`：只能修改**本渠道**时段，跨租户传别人家时段 id 返回「时段不存在」。
- 与分区/楼栋/店铺配置的渠道隔离保持一致。

### 20.6 存量脏数据幂等回填

- 启动迁移 `p4OpsHardeningSql` 追加幂等 UPDATE：`deliveryStatus=delivered` 且 `hallStatus` 非终态（`delivered/cancelled/no_rider_final/exception_final`）的单统一回填 `hallStatus=delivered`。
- 线上执行结果：14 单 `grabbed + delivered` → **14 单 `delivered + delivered`**，与 20.1 后续新单口径一致。

### 20.7 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；`npx vitest --config vitest.config.mts --run` **29 文件 / 276 用例全 PASS**（新增送达终态、看板终态过滤、第一段前置校验、统计口径、时段渠道隔离用例）。
- 部署：vendure `67fed74d9` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online，启动日志无迁移报错。
- 数据库核对：`grabbed + delivered` 脏数据 14 → 0；近 7 天校园履约 14 单、非取消 4 单，与看板「有效单量 4」一致。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli）：调度中心「大厅待接 0 / 进行中 0 / 异常处置记录留痕」PASS；商家接单各栏无送达残留 PASS；配送看板有效单量 4、趋势图正常 PASS。
- 未修项（P1/P2 共 12 项）见本轮审计清单：催单门槛、异常超时升级、骑手钱包累计口径、信用分并发、改址楼栋跨店校验、通知去重键、多实例扫描幂等、拒单/退款行锁等，后续按优先级推进。

## 21. 配送体系 P1/P2 加固（2026-10-24）

上一轮 P0 五项之后，按优先级完成剩余 P1/P2 共 10 组修复，聚焦**资金安全、并发一致性、跨店权限、卡单闭环**。

### 21.1 资金安全：退款按订单串行化

- 商家拒单、T4 无人接自动退款：在「查已退总额 → 退差额 → 取消」复合动作外增加 PG 会话级咨询锁（key=`campus:refund:<orderId>`），同一订单的退款/取消只能串行执行。
- 商家端并发点击拒单：未抢到锁直接提示「该订单正在退款处理中，请稍后重试」；T4 与商家拒单并发：未抢到锁的扫描路径本轮跳过，下轮再试。
- 效果：杜绝「两边同时查已退=0 → 各退一笔」的双退风险。

### 21.2 骑手钱包累计收入口径

- 「累计收入」由 `SUM(amount + tip)` 改为 `SUM(amount)`：入账本来只加 `amount`（小费已含在分成金额内），原口径把小费重复展示。
- 已提现/可用余额不动，仅修正展示口径。

### 21.3 骑手信用分并发安全

- `RiderCreditService.adjust` 改为单条原子 SQL：`GREATEST(0, COALESCE(credit,100) + delta)`，保留 0 下限，不再「事务内读 → 事务外写」导致并发扣分互相覆盖。

### 21.4 跨店铺归属校验（改址 / 下单选址）

- 改址：分区必须属于当前店铺，楼栋必须属于所选分区且同店铺。
- C 端下单选址（`setDeliveryTarget`）：同样校验分区/楼栋渠道归属，防止把订单地址写到别家渠道。
- 时段更新：只能改本渠道时段（见 §20.5）。

### 21.5 手动强派资质校验

- 运营中心手动派单/改派前校验目标骑手：必须 `riderStatus=approved` 且信用分 ≥ 60，否则拒绝并提示原因。
- 避免把订单强派给停用/低信用骑手。

### 21.6 多实例调度扫描幂等

- 调度扫描（每分钟）增加 PG 咨询锁 `campus:dispatch:scan`：多副本/多进程部署时同一轮只有一个实例执行，抢不到锁的本轮跳过。
- 杜绝重复强派、重复扣分、重复退款；锁随扫描连接释放，进程崩溃由连接关闭兜底。

### 21.7 顾客催单放宽 + 调度墙告警

- 催单不再要求已有骑手：待接单、备餐中、大厅待接、配送中均可催（10 分钟限频不变）。
- 调度中心新增「顾客催单」告警（30 分钟内有效），运营可优先处理；已送达/取消/退款完结等终态拒绝催单。
- Web 管理端补充中英文案（`alertUrged`）。

### 21.8 异常上报超时升级

- 骑手上报异常时记录 `exceptionReportedAt`；调度扫描发现「异常上报超过 SLA（`inProgressSlaMinutes`，默认 45 分钟）仍未处置」→ 自动回大厅重派（等价运营「重派」），异常类型/照片/说明保留供追责，`campusCause=exception_timeout` 留痕。
- 同时把回厅时间刷新为当前，避免同轮 T4 立即按超时退款。
- 异常上报增加状态校验：仅「已接单/配送中」可上报。

### 21.9 通知去重键修正

- 「骑手已接单」通知的 `dedupe_key` 追加骑手 id + 时间戳：改派、回厅重抢后的新通知不再被首次接单的幂等键吞掉。
- 同一次发送内的重试仍保持同一键，不会产生重复消息。

### 21.10 时段时区与过期校验

- 可订时段列表改用**本地时区**日期比较（原 `toISOString()` 为 UTC，凌晨 0–8 点会算错一天）。
- 当天已结束时段的隐藏；下单时再次校验「历史日期 / 当天已结束」→ 提示「时段已过期，请重新选择」。

![调度中心：页面正常渲染（催单告警按需出现）](screenshots/waimai/p6-delivery/01-dispatch-board.png)

### 21.11 验证记录（2026-10-24）

- 构建：campus-delivery-plugin `npm run build` 通过；web-admin `deploy.mjs` 本地构建通过（产物校验 60.7MB）。
- 单测：**29 文件 / 287 用例全 PASS**（新增：退款锁 mock、信用分原子更新、强派资质、催单阶段、异常状态与升级、时段过期/跨店、通知后缀、异常超时扫描）。
- 部署：vendure `1978170a9` 线上重启 online；web-admin 产物已发布并 nginx reload。
- 迁移：启动幂等补列 `order.customFieldsExceptionreportedat` 已生成（生产库核对存在）。
- 手机视口（390×844 dpr=2）：调度中心正常渲染，异常处置记录留痕正常，PASS。
- 已知展示问题（非本次改动引入）：异常处置记录时间显示 `NaN:NaN`，历史数据缺少可解析时间字段，留待后续统一修时区/格式化。

## 22. 配送体系第三轮审计（P0/P1 八项加固，2026-10-24）

第三轮只读审计发现 13 项遗漏（P0 3 项 / P1 5 项 / P2 5 项），本轮修复 P0+P1 共 8 项，聚焦**容量口径、重复赔付/重复配送、退款与外部运单并发**。

### 22.1 时段锁位幂等（容量虚增修复）

- 原逻辑：订单一取消就 `lockedCount - 1`，但未支付取消、容量已满未锁位的单从未加过容量 → 每次取消都在**虚增**余量，可超卖。
- 现在：锁位成功时写 `slotLocked=true`（与容量递增同源）；取消时用单条 `UPDATE ... WHERE slotLocked=true RETURNING slotId` **原子认领**，只有真正锁过位的单才归还容量，同一单只归还一次。
- 迁移 `p4OpsHardeningSql` 新增 `customFieldsSlotlocked` 列（默认 false），并把**在途预约单**回填为已锁位（历史未落标记，避免其取消时无法归还）。

### 22.2 异常处置幂等 + 取消单拦截

- 异常处置（重派/退差价/补偿券/全额退）改为**原子认领**：先 `UPDATE ... RETURNING` 消费异常态，失败直接提示「该异常已处置，请刷新后重试」。并发双击/双运营操作只有一路生效，不再二次发券或二次小额退款。
- 已取消订单（`state=Cancelled`）直接拒绝处置。
- 处置动作抛错时**回滚认领**（恢复 `hallStatus/deliveryStatus=exception`），保留异常态供重试，避免「标记已处置但钱没退」。
- 重派后把 `hallEnteredAt` 刷新为当前时间，防止同一轮扫描按旧入厅时间立即触发 T4 自动退款。

### 22.3 退款串行化补齐（异常处置 / 改址差额）

- 上一轮退款锁只覆盖商家拒单与 T4；本轮把 **异常处置退差价/全额退**、**改址差额结清** 也纳入同一把订单级锁 `campus:refund:<orderId>`。
- 改址差额在锁内**复查台账 refundId**，防并发结清双退；抢不到锁提示「该订单正在退款处理中，请稍后重试」。

### 22.4 外部运单回调幂等与防回退

- 回调状态加入推进序 `pending < accepted < pickup < delivered`：同状态重复、旧状态乱序到达一律忽略。
- 送达回调若订单**已离开 `third_party`**（已进大厅 / 已被抢 / 已送达），只补终态与快递员信息，**不再二次 `enterHallForHandover`**——原逻辑会重置大厅、清空骑手、重生成交接码，造成重复配送与二次分成。

### 22.5 外部推送订单级锁

- `dispatchExternal` 增加订单级咨询锁 `campus:thirdparty:<orderId>`，幂等判断与下单在同一锁内；并发推送第二路提示「该订单正在推送外部快递，请稍后重试」，防产生两张外部运单（孤儿单 + 双倍运费）。

### 22.6 手动强派在线校验

- 强派前校验骑手心跳 `riderOnlineAt`：超过 5 分钟（与 `CapacityService` 在线窗口一致）直接拒绝「该骑手当前不在线，无法派单」，避免派给离线骑手后 15 分钟必然回厅。

### 22.7 调度扫描按渠道加锁 + 故障隔离

- 扫描锁从全局 `campus:dispatch:scan` 改为**按渠道** `campus:dispatch:scan:<channelId>`：多实例下各渠道可并行，单渠道慢不再拖住其他渠道。
- 单渠道扫描异常只记日志并继续后续渠道，不再中断整轮。

![调度中心：大厅/进行中/异常留痕正常](screenshots/waimai/p7-delivery/01-dispatch-board.png)

![履约参数与时段容量](screenshots/waimai/p7-delivery/02-campus-config.png)

![配送看板](screenshots/waimai/p7-delivery/03-campus-stats.png)

### 22.8 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；`npx vitest --config vitest.config.mts --run` **29 文件 / 302 用例全 PASS**（新增：锁位标记与解锁幂等、强派离线拒绝、异常重复认领/取消单/失败回滚、外部回调幂等与防回退、按渠道扫描锁与渠道故障隔离）。
- 部署：vendure `158ed8b2a` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online，启动日志无迁移/插件报错。
- 数据库核对：`order.customFieldsSlotlocked` 列已建（boolean，默认 false）；历史 24 单带时段订单全部为终态（取消 11 / 无人接退款 9 / 已送达 4），在途回填 0 单，符合预期。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：调度中心、履约参数与时段容量、配送看板均正常渲染，无控制台错误。

## 23. 配送体系第四轮审计（P2 五项收口，2026-10-24）

第三轮遗留的 5 项 P2 已全部修复，均为「不会立刻抛错但长期留脏数据/体验缺口」的问题。

### 23.1 骑手入驻状态保护

- 原逻辑：`applyRider` 无条件把 `riderStatus` 写回 `pending`——**已通过审核的骑手重新提交资料会被打回待审**（当天无法接单）；**已停用骑手也能自助复申请**绕过停用。
- 现在：已通过者仅更新资料、保留 `approved`；已停用者直接拒绝并提示联系管理员；仅 `none/pending` 才进入待审。

### 23.2 通知去重键细分（售后进度 / 重复异常）

- 售后进度通知固定键 `campus:afterSales:{orderId}`：同一售后单「审核通过 → 退款到账」只推第一条，后续节点被 SSO 幂等吞掉。现按 `toState` 加后缀，每个进度各推一条（发送重试仍幂等）。
- 异常处置通知同理：重派后再次异常处置原本会被首次通知的键吞掉；现以**本次异常上报时间**作后缀，每次处置都送达，同一报告的发送重试不重复。

### 23.3 统计/商家看板日界固定 UTC+8

- 原逻辑用服务器本地时区 `setHours(0,0,0,0)` 取「今日」；迁移到 UTC 机器或容器后「今日单量/今日营收/小时趋势」整体偏移 8 小时。
- 新增 `campus-time`（`startOfCampusDay` / `campusHour` / `campusDayKey`，固定 UTC+8 无夏令时），配送看板与商家接单台统一使用；当前服务器为 CST 时结果不变，换机器不再漂移。

### 23.4 骑手送达单条原子写

- 原逻辑两步：先原子认领 `deliveryStatus=delivered`，再单独一次更新 `hallStatus/照片/分成/位置清空`；两步之间宕机会留下「已送达但仍挂配送中」的半完成单（调度墙/骑手台状态不一致）。
- 现在认领与全部终态字段在**同一条 UPDATE** 内落库，仍以 `RETURNING id` 防并发双送达/双分成。

### 23.5 T2 强派按在途负载轮转

- 原逻辑所有超时无人接的单都派给排序第一的骑手（信用最高），一人被连续塞单、其余在线骑手闲置。
- 现在按「在途单数」轮转：负载更低者优先，平局仍按信用分/最近活跃排序；同一轮内派出一单即累加负载，多单自动分摊到不同骑手。

![骑手入驻审核：状态保护后重提不降级](screenshots/waimai/p8-p2/01-rider-audit.png)

![商家接单台：今日完成口径按 UTC+8 日界](screenshots/waimai/p8-p2/02-merchant-board.png)

![调度中心：T2 轮转派单](screenshots/waimai/p8-p2/03-dispatch-board.png)

### 23.6 验证记录（2026-10-24）

- 构建与单测：`npm run build` 通过；全量 `npx vitest --config vitest.config.mts --run` **29 文件 / 309 用例全 PASS**（新增：入驻状态保护 3 例、送达单条原子写/并发拒绝 2 例、UTC+8 日界断言、T2 轮转与负载均衡 2 例、重复异常 dedupe 后缀）。
- 部署：vendure `4675a4341` 推送 → 服务器 `git reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online，`shop-api` 正常应答，启动日志无报错。
- 手机视口截图（390×844 dpr=2，canteen-a 渠道）：骑手入驻审核、商家接单台、调度中心均正常渲染；控制台仅打印插件（CLodop 本地端口）CORS 提示，与本轮改动无关。

## 24. 配送体系第四轮审计（P1/P2 九项收口，2026-10-24）

本轮聚焦「并发与异常路径」：先读后写的状态覆盖、重复事件重放、外部运单取消失败后的资金风险。九项已全部修复并部署。

### 24.1 预约单放量不再被误判超时（P1）

- 原逻辑：预约单放量后，商家接单超时 / R2 出餐超时 / 自营池超时仍以 `createdAt` 计时。预约单可能几小时前就下单，**一放量即被判超时**：R1 直接转自营、R2 直接跳过商家确认进大厅。
- 现在：放量时写 `hallEnteredAt` 作为计时锚点，上述兜底统一按 `hallEnteredAt ?? createdAt` 起算；放量本身改为「仅 scheduled 态」条件写，与取消并发时不复活订单。

### 24.2 提现审核真原子（P1）

- 原逻辑：`repo.update(id, ...)` 只按主键更新，`affected` 恒为 1，不是原子认领。并发「通过 + 驳回」都可能成功 → 可能**又退款又标记已打款**。
- 现在：改为 `UPDATE ... WHERE id=? AND status='PENDING'`，`affected=0` 即已处理，直接报「该申请已处理」。驳回退回失败时按 `id + status='REJECTED'` 条件补偿回 PENDING，可安全重试。

### 24.3 外部运单取消失败不再回落重推（P1）

- 原逻辑：调度兜底发现外部快递久未送达 → 调平台取消，无论成功失败都回落本地（R2 重新待推送 / R3 回大厅）→ 旧运单仍在跑，新运单再推一次，**双运单双份运费**。
- 现在：取消未确认（返回非 ok / 抛错）时保持 `third_party` 不回落，写 `campusCause=external_cancel_failed` 并记错误日志，下一轮继续尝试取消，直到平台确认。仅「确认取消成功」或「本来就没有外部运单（skipped）」才回落。

### 24.4 改址时外部取消失败不再静默（P1）

- 原逻辑：改址流程调外部取消失败只打一条 warn，订单继续按**旧地址**配送，运营无感知。
- 现在：失败写 `campusCause=address_change_cancel_failed` 并记 error 日志（明确提示 still routed to old address / manual follow-up required）；调度中心该单会显示「改址取消失败，仍按旧地址配送，需人工跟进」，改址台账仍按原流程核对运费差额。

### 24.5 调度/商家状态写入改条件更新（P2）

- 调度扫描（商家接单超时、R2 出餐超时、商家送达超时、外部推送超时、自营池超时、自营送达超时）与商家端（接单/拒单/出餐）原本都是「先读后写」无条件 `update`。并发下用户取消已脱厅（`cancelled`），仍会被改回 `open/pending_merchant` 重新进大厅被抢。
- 现在统一走 `HallService.transitionFrom`（单条 `UPDATE ... WHERE hallStatus = ANY(from)` + `RETURNING id`）：不命中即跳过本轮，已取消/已送达单不再被复活；商家操作不命中则提示「订单状态已变更，请刷新」。扫描查询同时整体排除 `order.state = Cancelled`。

### 24.6 时段锁位幂等（P2）

- 原逻辑：支付事件重放/并发二次入厅会对同一单**重复递增 `lockedCount`**，取消只释放一次 → 时段容量永久少 1，最终显示「已满」但实际还有空位。
- 现在：先原子认领订单 `slotLocked(false→true)`，认领失败视为已锁位直接返回；容量满时回滚认领标记（避免未占位却释放名额）。取消/退款释放也按 `slotLocked(true→false)` 原子认领，同一单只归还一次。

### 24.7 分成落库兜底与 0 分成（P2）

- `deliver` 的 `RiderEarning.save` + `addBalance` 整体加 try/catch：落库失败时订单已送达、客户端重试会被状态机挡住，因此记 error 日志（含订单号与金额）供人工补账，不再静默丢失。
- 0 分成判据改为只看 `earning`（小费已计入分成）：修复 `earning=0 & tip>0` 仍写 0 元 pending、钱包补账永久报错的问题。

### 24.8 异常超时重派清痕迹（P2）

- 原逻辑：异常上报超时自动重派只回厅，`deliveryStatus` 仍为 `exception`、异常类型/照片/上报时间全部保留 → 新骑手端继续显示「异常单」，且本轮会再次命中超时规则。
- 现在：单条 CAS 完成「回厅 + 清空异常痕迹 + 重置 `hallEnteredAt`」，`campusCause=exception_timeout` 留痕供复盘。

### 24.9 超时赔付剔除已退款订单（P2）

- 原逻辑：赔付扫描只排除 `order.state = Cancelled`；「先退款、后取消」或退款流程中的订单仍会被发超时券。
- 现在：查询加 `NOT EXISTS` 子查询，支付单退款合计 ≥ 支付金额的订单一律不参与赔付。

![骑手提现审核：并发双审只允许一次（原子认领）](screenshots/waimai/p9-round4/01-rider-withdraw.png)

![调度中心：状态条件写与异常重派留痕](screenshots/waimai/p9-round4/02-dispatch-board.png)

![改址台账：外部取消失败后仍按旧地址配送，需在调度中心跟进](screenshots/waimai/p9-round4/03-address-changes.png)

### 24.10 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；全量 `npx vitest --config vitest.config.mts --run` **29 文件 / 318 用例全 PASS**（新增：CAS 未命中跳过、外部取消失败保持 third_party、预约单按 hallEnteredAt 计时、锁位幂等与满员回滚、提现并发 affected=0、0 分成跳过入账、锁内复查已被抢单/取消、赔付 SQL 含退款排除）。
- 部署：vendure `8d916559d` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online，启动日志无报错，`shop-api` 正常应答。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：骑手提现审核、调度中心、改址台账均正常渲染，无控制台错误。

## 25. 配送体系第五轮审计（P1 两项 + P2 七项收口，2026-10-24）

本轮只查「并发窗口 + 回调重放 + 外部平台异常」这三类容易漏的路径，全部修复已上线。

### 25.1 外部运单推送改为「落库成功才算推送」（P1）

- 原逻辑：先把订单写成 `third_party`，再调外部平台建运单。若期间用户取消 / 被改派，运单仍会建出来，形成「已取消单复活 / 孤儿运单双份运费」。
- 现在：调用平台建单成功后，用条件写（`UPDATE ... WHERE hallStatus IN ('pending_merchant','accepted','pending_dispatch','third_party') AND state <> 'Cancelled'`）落库；未命中立即调用平台 `cancelDelivery` 撤销运单，并向商家报「订单状态已变更（可能已取消），外部运单已撤销」。撤销失败记 error 日志供人工核对。

### 25.2 交接入厅 / 平台回调 / 自营接单 / 第一段完结全部条件写（P1）

- 交接入厅（`enterHallForHandover`）、平台回调（`onDeliveryStatus`）、自营骑手接单（`acceptOwned`）、R1/R2 第一段完结统一改为条件写；不命中只记 warn 或明确报错，**绝不把已取消单改回大厅被再次抢单**。
- 大厅列表与派单查询整体排除 `order.state = Cancelled`：已取消单即使 `hallStatus` 未及时清，也不会出现在骑手大厅、运营调度墙、顺路打包组内。

### 25.3 骑手「开始配送」条件写（P2）

- `start()` 由「先读后写」改为单条条件更新（`deliveryStatus='assigned'` + 本人 + `hallStatus='grabbed'` + 未取消）。订单已被取消或改派时直接提示「订单已被取消或改派，无法开始配送」，不再把别人的单改成 `in_progress`。

### 25.4 改址后外部运单用实时地址 + 在途骑手通知（P2）

- 外部平台运单地址不再用入厅时的旧快照，改为实时读取楼栋名 + `deliveryDetail`（回退 `streetLine1`）。
- 改址时若已有骑手在途，向该骑手推送订阅消息（订单号 + 新分区/新楼栋），减少「送到旧地址」。

### 25.5 超时赔付先抢闸再发券（P2）

- 原逻辑：先发券再写 `timeoutCompensatedAt`，并发（多实例/重试）可能重复发券。
- 现在：先条件抢占赔付闸（`timeoutcompensatedAt IS NULL`），抢到才发券；发券失败/服务不可用则释放闸位供下轮重试，避免「扣了闸却没赔」。

### 25.6 运营回厅 / 改派校验结果（P2）

- `backToHall` 未命中（订单已取消或已脱厅）时，调度中心明确报「订单已取消或已不在履约流程中，无法回大厅」；改派分支报「订单已取消，无法重新派送」，不再静默成功。

### 25.7 异常回滚与处置留痕条件写 + 未处置告警（P2）

- 异常处置的「回滚」与「留痕」均由 `repo.update` 改为条件写：仅 `exception_final`（留痕）/ 活单态（回滚）可写，已取消单不会被写回。
- 调度墙新增告警：`exception_final` 且 `deliveryStatus='exception'` 且无 `exceptionHandledAt` → 「异常处置未完成（已标记但未赔付/未留痕），请人工核对补处理」。用于覆盖「处置中途宕机/失败」的漏赔。

### 25.8 预约单不挤占调度扫描窗口（P2）

- 扫描排序改为「非预约单优先 + 预约单按 `scheduledFor` 升序」，`take(200)` 不再被大量未到点预约单占满导致 open 强派 / 超时退款被扫出窗口。

### 25.9 顺路打包条件写（P2）

- `packRoutes` 写 `routeGroupId` 改为条件写（仅 `hallStatus='open'` 且未取消），仅同步实际命中行到内存快照；日志输出命中数/组内总数，便于排查并发脱厅。

### 25.10 顺带修复：调度墙处置时间 NaN:NaN（2026-10-24）

- `datetime` 自定义字段按 `String` 标量返回时会退化成毫秒数，前端 `hhmm` 解析失败显示 `NaN:NaN`。`board()` 显式转 ISO 字符串，异常处置记录时间显示恢复正常（如 `08:35`）。

![调度中心：异常处置记录时间正常显示，已取消单不进墙](screenshots/waimai/p9-round5/01-dispatch-board.png)

![商家接单：条件写不命中会提示状态已变更](screenshots/waimai/p9-round5/02-merchant-orders.png)

![改址台账：改址后外部运单用实时地址，在途骑手收到通知](screenshots/waimai/p9-round5/03-address-changes.png)

### 25.11 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；全量 `npm run test` **30 文件 / 338 用例全 PASS**（新增：外部推送 CAS 未命中撤单、入厅/回调/自营接单/第一段 CAS 未命中拒绝、已取消单送达回调不复活、R3 异常回大厅刷新计时锚点、赔付抢闸与释放闸、打包条件写、处置时间 ISO）。
- 部署：vendure `c0796a2b9` + `ffe99450c` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`；`shop-api` 返回 200，启动日志无新增报错；`campusDispatchBoard` 返回 `handledAt` 为 ISO（`2026-10-07T00:35:14.972Z`）。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：调度中心（异常处置记录时间恢复 `hh:mm`）、商家接单、改址台账均正常渲染，无接口报错（商家页仅本地打印控件 CORS 提示，与业务无关）。

## 26. 配送体系第六轮审计（P1 两项 + P2 三项收口，2026-10-24）

本轮专查「骑手提交流程 / 跨租户配置 / 赔付闸长期占用 / 定时任务出错隔离」四类残余风险，五项已修复上线。

### 26.1 骑手送达与异常上报加「已取消」守卫（P1）

- 原逻辑：`deliver()` 的原子更新只校验 `deliveryStatus='in_progress'`，`reportException()` 为「先读后写」。若用户下单后取消退款、而骑手端仍提交送达/异常，已取消单会被改成 `delivered` 并入账分成（钱已退 + 分成照发），异常上报也会把取消单拉回配送态。
- 现在：
  - `deliver()` 的 UPDATE 追加 `AND "state" <> 'Cancelled'`，未命中提示「订单已被取消或处理，无法送达」，不再写分成、不加信用分；
  - `reportException()` 改为单条条件写（本人 + `deliveryStatus IN ('assigned','in_progress')` + 未取消），未命中提示「订单已被取消或改派，无法上报异常」。

### 26.2 履约配置租户隔离（P1）

- 原逻辑：`campusStoreConfigs`（店铺配置列表）、`campusUpdateStoreConfig`（保存配置）、`campusEnsureDefaultShippingProfile`（补默认配送档案）仅校验 `CampusConfig` 权限。租户管理员持有该权限即可读取全部店铺配置、按任意 `channelId` 改写别家店铺的运费/模板/交接点，甚至给别家补绑配送档案。
- 现在：
  - 列表：平台超管看全部；租户管理员只返回本渠道（`ctx.channelId`）一条；
  - 保存配置 / 补默认档案：非平台超管只能操作本渠道，越权返回「无权操作其他店铺的履约配置」；
  - 平台超管仍可跨店铺运维（`Permission.SuperAdmin` 判定）。

### 26.3 超时赔付「空券」不再占死赔付闸（P2）

- 原逻辑：抢到赔付闸后调券端口发券，若端口返回空数组（未抛错），仍继续把空 `couponId` 写入订单 → 闸已占用、券未发出，该单永久漏赔。
- 现在：`couponId` 为空时立即释放赔付闸并记 warn，下一轮自动重试。

### 26.4 赔付闸过期回收（P2）

- 原逻辑：赔付闸（`timeoutCompensatedAt`）一旦写入只能人工清，若发券成功但留痕落库失败/进程中断，该单永久卡在「已认领、无券」。
- 现在：扫描与抢闸均接受「券 id 为空且认领超过 15 分钟」的僵死认领重新赔付；真实已赔付单（有券 id）依旧不再扫。

### 26.5 调度扫描逐单隔离（P2）

- 原逻辑：调度扫描（未取货回收 / 预约放量 / 商家超时入厅 / 强派 / 自动退款 / 路线兜底 / 异常超时 / 超时赔付）均为 `for` 循环串行 await，任一单抛错（DB 抖动、外部平台异常）会中断整轮，后续订单全部积压到下一分钟。
- 现在：所有逐单循环均加 try/catch，单笔失败只记 error 日志并跳过，同轮其余订单继续处理；渠道级锁与 `scanChannelWithLock` 故障隔离保持不变。

### 26.6 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；全量 `npm run test` **31 文件 / 354 用例全 PASS**（新增：骑手送达 CAS 守卫、异常上报条件写与未命中拒绝、超时赔付空券放闸、赔付闸 15min 过期回收、调度单笔退款异常不阻断、履约配置租户隔离 6 例）。
- 部署：vendure `f193c916c`（+ 同批飞书管理群 `69ffb2e17`）推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`；`shop-api` 返回 200，启动日志无新增报错。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：拾光达配置（「履约参数（当前店铺）· 按登录渠道生效」）、调度中心、商家接单均正常渲染，无接口报错（页面浮层「无访问权限」为本地打印控件 CLodop 的越权提示，与业务无关）。

![拾光达配置：履约参数按当前登录渠道生效（租户隔离后仍可正常保存）](screenshots/waimai/p9-round6/01-store-config.png)

![调度中心：异常处置记录与大厅/进行中看板正常](screenshots/waimai/p9-round6/02-dispatch-board.png)

![商家接单：条件写不命中会提示状态已变更](screenshots/waimai/p9-round6/03-merchant-orders.png)

## 27. 配送体系第七轮审计（P1 两项 + P2 两项收口，2026-10-24）

本轮复查「跨租户数据可见性 / 无界历史查询 / 定时任务并发」三类残余风险，四项已修复上线（另有 1 项 P3 竞态与 1 项需业务确认项本轮不修）。

### 27.1 配送看板按渠道隔离（P1）

- 原逻辑：`deliveryStats` 只按 `hallStatus IS NOT NULL` 取窗口内全部订单，无渠道过滤。任何持有看板权限的租户管理员都能看到**其他店铺**的「店铺准点对比」单量与准点率，构成跨租户数据泄漏。
- 现在：非平台超管（`Permission.SuperAdmin` 之外）查询强制追加 `channel.id = ctx.channelId`，只统计本渠道；平台超管仍可看全平台汇总。
- 前端无需改动：接口返回结构不变，店铺级账号打开「配送看板」即只见本店。

### 27.2 待付款任务管理渠道作用域（P1）

- 原逻辑：`paymentTimeoutTasks` / `paymentTimeoutStats` 仅要求 `ReadOrder`，`executePaymentTimeoutTask` / `resendPaymentTimeoutRemind` 仅要求 `UpdateOrder`，服务端也无渠道过滤。租户管理员可列举、手动执行甚至**取消其他店铺的待付款订单**（订单超时取消会释放库存并通知顾客）。
- 现在：
  - 列表：非平台超管自动过滤 `channelId = ctx.channelId`；
  - 统计四项 KPI 同样按渠道收口；
  - 手动执行 / 重发提醒先校验任务归属，越权返回「任务不属于当前店铺」；
  - 平台超管保持跨店运维能力。

### 27.3 商家工作台只拉活跃单（P2）

- 原逻辑：`board()` 按渠道拉取**全部** `hallStatus` 非空订单（含 `delivered` / `cancelled` / `exception_final` / `no_rider_final`），并连带 `lines + productVariant`。门店经营越久，历史单持续膨胀，接单台首屏越来越慢、内存压力持续增长。
- 现在：SQL 限定活跃状态集合（`pending_merchant / accepted / open / grabbed / pending_dispatch / third_party / owned_pool / owned_dispatched / merchant_delivering / scheduled`）；内存中的终态/已送达过滤保留作双保险。今日完成数仍走独立查询，不受影响。

### 27.4 待付款任务并发收口 + 库存幂等释放（P2）

- 原逻辑：
  - 同一任务可能被「定时队列 + 手动执行 + 5 分钟补偿扫描」三路同时命中，重复发提醒、重复 `cancelOrder`；
  - 取消路径先 `createReleasesForOrderLines` 再 `cancelOrder`，若取消失败进入重试，下一轮会**再次释放同一批分配**（重复生成 Release、重复回补可用库存）。
- 现在：
  - `runTask` 外层加任务级 PG 咨询锁 `campus:paytimeout:<taskId>`（会话级，锁内重新读取任务状态），抢不到锁的队列轮次静默跳过、手动执行返回 `PAYMENT_TIMEOUT_TASK_BUSY`；
  - 库存释放改用**幂等** `createOutstandingReleasesForOrderLines`（按 allocations + sales − releases 计算未释放余量），重试/并发不会重复释放；
  - `cancelOrder` 抛错时复查订单状态，若已 `Cancelled` 视为成功（不再无限重试），且跳过重复的「订单已自动取消」通知。

![支付超时观测：列表/统计按当前店铺渠道收口，历史任务仍可查](screenshots/waimai/p9-round7/01-payment-timeout.png)

![配送看板：店铺级账号只看本渠道数据，KPI 与趋势正常](screenshots/waimai/p9-round7/02-campus-stats.png)

![商家接单：仅拉取活跃流转单，今日完成口径不受影响](screenshots/waimai/p9-round7/03-merchant-orders.png)

### 27.5 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `npm run build` 通过；全量 `npm run test` **31 文件 / 361 用例全 PASS**（新增：看板非超管渠道过滤、待付款任务列表渠道过滤/跨渠道执行与重发拒绝、任务锁抢不到拒绝、取消已完成视为成功且不重复通知）。
- 部署：vendure `4be57e67a` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online；`shop-api` 返回 200（`activeChannel` 正常应答）。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：支付超时观测、配送看板、商家接单均正常渲染，无接口报错（页面浮层「无访问权限」为本地打印控件 CLodop 的越权提示，与业务无关）。

## 28. 配送体系第八轮审计（P1 两项 + P2 四项 + 调度扫描修复，2026-10-24）

### 28.1 改址差额口径修正 + 订单级改址锁（P1）

- **原问题**：差额基准恒取 `order.shippingWithTax`（下单快照、从不回写），A→B→A 连续改址会按同一旧价重复记差额；且改址无并发保护，双击/双标签页可双写台账并按旧价各算一次。
- **现在**：差额基准取**最近一次改址台账的 newFee**（无改址史才回退下单快照）；C 端自助改址与后台代改全程包在 PG 会话咨询锁 `campus:address:<orderId>` 内，锁内重读订单再校验/落库；抢不到锁返回「该订单正在处理其他改址，请稍后重试」。
- 运营口径：台账差额始终相对「上一笔改址后的生效运费」，结清只影响台账，不回写订单运费。

### 28.2 配送中/已送达禁止用户取消（P1）

- 新增订单取消守卫（`campusCancelGuardProcess`），仅拦截 **C 端 shop API** 发起的 `→ Cancelled`：
  - 已送达：提示「订单已送达，无法取消，请申请售后」；
  - `deliveryStatus = assigned / in_progress`、`thirdPartyState = accepted / pickup`、`hallStatus = grabbed / third_party / owned_dispatched / merchant_delivering`：提示「骑手已接单或配送中，无法取消，请联系客服或申请售后」。
- 后台与系统取消（商家拒单、调度强制取消/异常处置、支付超时关闭）不受影响。

### 28.3 退款支付单口径统一（P2）

- 商家拒单、调度 T4、异常处置、改址负差额 4 处退款统一只选 **state ∈ Settled/Authorized 且仍有余额** 的支付单；全额流程逐张退「剩余余额」，重试/并发天然幂等。
- 无可退余额时统一提示「订单无可退支付余额（可能未支付或已全额退款）」；超额提示「退款金额超过可退余额（订单可能已全额退款）」。

### 28.4 R1 商户自配送改址触达商户（P2）

- 改址成功后写入 `campusCause = address_changed`，并推送飞书事件 `campus_address_changed`（订单号 + 新旧「分区·楼栋」），避免商户仍按旧楼栋配送；推送失败不阻断改址。
- 有骑手单仍按原骑手通知链路触达，不重复打扰商户。

### 28.5 飞书回调 fail-closed + 多令牌（P2）

- 未配置 `FEISHU_VERIFY_TOKEN` 时业务事件一律 403；令牌不符也 403（日志只记事件类型与令牌长度，不打印原文）。
- 支持**逗号分隔多令牌**（事件订阅与卡片回调各一份），令牌兼容 `header.token` / `event.token`；`challenge` 握手先回显（不回显任何业务数据）。

### 28.6 后台配置入参校验（P2）

- 分区：名称非空、运费为非负整数（分）；
- 楼栋：名称非空、分区必须属于当前登录店铺、经纬度范围（±90 / ±180）；
- 时段：日期 `YYYY-MM-DD`、时刻 `HH:mm`、开始早于结束、容量 1–9999、分区归属校验、同店同日同分区同开始时间不允许重复。
- 前端原本无校验的脏输入现在会在接口层被拒绝并返回中文原因。

### 28.7 追加修复：调度扫描 orderBy 被 TypeORM 误判别名

- **原问题**（第五轮引入、线上潜伏）：扫描使用 `take + join` 会走 TypeORM 的 distinct 分页子查询，该路径把 CASE 表达式里的 `CASE WHEN order` 当作别名解析 → 每轮扫描**所有渠道**整轮失败（`"CASE WHEN order" alias was not found`），自动强派/回厅/退款兜底实际未执行。
- **现在**：改用 `limit`（查询已按 `channel.id` 过滤，一单只命中一行，不会产生重复行），ORDER BY 表达式正常生成 SQL；重启后日志该报错计数 0。

### 28.8 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `tsc` 构建通过；全量 **34 文件 / 385 用例全 PASS**（新增 `refund-payment` 4、`cancel-guard.process` 7、`campus-config-validation` 7；`dispatch-job` 48、`feishu` 26 全绿）。
- 部署：vendure `a8bad81b8 → 37546b731 → 7abe6cf3c` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online；`shop-api` 200。
- 线上探针（admin-api）：`campusCreateZone` 空名称 → 「分区名称不能为空」、负运费 → 「分区运费必须为非负整数（分）」、`campusCreateSlot` 非法日期 → 「日期格式必须为 YYYY-MM-DD」，均 `USER_INPUT_ERROR`（脏数据未落库）。
- 线上日志：重启后 9 分钟窗口内 `alias was not found` / `CampusDispatch scan failed` 均为 **0**。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：
  - 校园配置页正常渲染（动态计价试算、履约参数按当前店铺生效）；
  - 改址台账（KPI 三卡 + 状态筛选，当前无改址记录，空态正常）；
  - 商家接单（活跃单视图，提示「未开启商家接单确认」为店铺当前配置，与本次修复无关）。
  - 页面浮层「无访问权限」为本地打印控件 CLodop 的跨域提示，与业务无关。

![校园配置：动态计价试算与履约参数（当前店铺）](screenshots/waimai/p9-round8/01-campus-config.png)

![改址台账：差额口径按最近一次改址生效运费（当前无记录）](screenshots/waimai/p9-round8/02-address-changes.png)

![商家接单：拒单退款改走可退余额口径](screenshots/waimai/p9-round8/03-merchant-orders.png)

- 已知限制：取消守卫只在 C 端取消路径生效，未构造真实在途订单做线上取消拦截截图（由 7 个单测覆盖各状态组合）；接真实在途单后可按 §28.2 复验。




## 29. 配送体系第九轮审计（P1 权限 + P2 履约并发 + P3 回调/入参，2026-10-24）

### 29.1 C 端与骑手接口权限显式化（P1）

- **背景（Vendure 权限默认值）**：resolver 不写 `@Allow` 时，`auth-guard` 传给 `DefaultEntityAccessControlStrategy` 的权限列表为空，该策略 `permissions.length === 0 → return true`——**即「不写 @Allow」= 完全公开**，不是「默认需登录」。
- 本轮按语义显式分三类：
  - **Public（公开只读）**：`campusZones` / `campusBuildings` / `campusCapacityCheck` / `campusShopSlots` / `campusErrandVariant` / `waimaiStoreList`（下单前选楼、运力预检、跑腿估价）。
  - **Authenticated（需登录）**：骑手入驻/资料/钱包/余额流水/提现、任务列表与开始/送达/转单/异常上报/位置上报/催单、大厅抢单/拒单/收益、跑腿信息写入、R2 转寄、发票申请。
  - **Owner**：`campusSetDeliveryTarget` 写当前 activeOrder，游客会话同样可用。
- **线上探针**：匿名 `campusCapacityCheck` 正常返回；匿名 `myRiderProfile` 返回 `FORBIDDEN`（修复前可匿名读）。

### 29.2 送达 / 开始配送 / 位置 / 异常上报改条件写（P2）

- 送达：单条 `UPDATE` 同时写 `deliveryStatus=delivered`、`hallStatus=delivered`、照片、分成、清位置，并把条件锚定在 **当前骑手 + `deliveryStatus=in_progress` + `hallStatus=grabbed` + `state <> 'Cancelled'`**（原来只有 deliveryStatus 条件，改派窗口内旧骑手仍可完成送达并领分成）。
- 开始配送：条件锚定 `assigned + 当前骑手 + hallStatus=grabbed + 未取消`。
- 位置上报：条件锚定当前骑手 + `assigned/in_progress`；坐标先做范围校验（`|lat| <= 90`、`|lng| <= 180`）。
- 异常上报：条件锚定当前骑手 + `assigned/in_progress`；类型限 `merchant_issue / no_recipient / food_spilled / other` 四类白名单。
- 未命中统一提示「订单已被取消或改派，无法…」，不再出现「已取消单被改成送达/异常」。

### 29.3 骑手分成按订单所属渠道解析（P2）

- 分成比例取自**订单所属渠道**的履约配置（读不到才回退当前 ctx 渠道）：跨店订单此前用访问者渠道算比例，会按错误比例入账。
- 为此订单归属校验同时加载 `channels` 关系。

### 29.4 后台强制回厅需交接说明（P2）

- 订单已取货（`deliveryStatus=in_progress`）时，后台「回大厅」必须填写交接说明，否则提示「骑手已取货，强制回大厅需填写交接说明」。
- 说明以 `transferNote / transferAt / campusCause=admin_force_back` 与「回厅复位字段」**同一条条件 UPDATE 落库**，运营可在订单详情回溯是谁、何时、因何把已取餐订单退回大厅。
- 接口签名：`campusBackToHall(orderId: ID!, note: String)`（note 可空）。

### 29.5 取消脱厅原子化（P3）

- `exitHall` 由「先读 hallStatus 再 update」改为**单条条件 UPDATE**：仅活跃流转态改 `cancelled`，`grabbed` 单用 `CASE WHEN 旧 hallStatus='grabbed'` 连带清 `deliveryStaffId/deliveryStatus/assignedAt`。
- 消除与调度 T4 写 `no_rider_final` 的竞态（原先读到 grabbed 后、写入前被判终态，仍会被覆盖成 cancelled）。

### 29.6 外部快递回调防串（P3）

- 状态序补 `cancelled / exception` 为终态档：终态之后到达的任何回调一律忽略（原先 `cancelled` 无档位，迟到 `delivered` 可能把已回大厅的单再入厅）。
- 回调运单号与订单当前 `thirdPartyNo` 不一致时直接丢弃：换运力重推后，旧运单的迟到回调不得污染新运单状态。

### 29.7 在线骑手渠道过滤 + 时段锁位容量列比较（P3）

- 在线骑手池增加 `customer.channels` 渠道过滤：骑手资格本身按渠道生效，原先会把 A 店单派给 B 店骑手（其资格校验会直接拒绝，造成无效派单）。
- 时段锁位容量条件改为数据库列比较 `"lockedCount" < "capacity"`：不再用读取时的快照，管理员并发调低容量也不会超额。

### 29.8 入参校验与隐私收敛（P3）

- 骑手入驻：姓名/学号/校区 trim 后非空、各 ≤30 字；证件图地址 ≤500 字。
- 骑手状态：仅 `none / approved / suspended`，非 `approved` 时同时清 `riderOnlineAt`（停用即强制下线，不再出现在在线运力池）。
- 发票抬头：非空、≤500 字。
- 用户侧查骑手：`campusOrderRider` 只返回姓名/信用分/位置/预计时间，**手机号恒为 null**（脱敏）。

### 29.9 验证记录（2026-10-24）

- 构建与单测：`tsc` 构建通过；campus-delivery-plugin 全量 **34 文件 / 394 用例全 PASS**（较上轮 385 +9：后台回厅交接说明、位置上报条件写/坐标校验、旧运单号与终态回调、骑手入参/状态白名单；脱厅用例按条件写重写）。
- 部署：vendure `a098f5f7c` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online；`shop-api` 正常应答。
- 线上探针：匿名 `campusCapacityCheck` → `{paused:false, ridersOnline:0}`；匿名 `myRiderProfile` → `FORBIDDEN`（权限显式化生效）。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，canteen-a 渠道）：调度中心（大厅待接/告警/异常处置记录）、拾光达配置（动态计价试算 + 履约参数）、楼栋坐标均正常渲染，无控制台错误（浮层「无访问权限」为本地打印控件 CLodop 的越权提示，与业务无关）。
- **口径记录（本轮不改代码）**：① 骑手钱包/累计收入为**平台级跨渠道汇总**（分成流水记在各店铺渠道，钱包查询固定默认渠道上下文，按渠道过滤会恒为 0）；② 送达完成后再发生的异常/退款**不回收已入账分成**（配送已履约），如需追回走人工或信用分。

![调度中心：大厅待接/滞留告警/异常处置记录正常](screenshots/waimai/p9-round9/01-dispatch.png)

![拾光达配置：动态计价试算与履约参数（当前店铺）](screenshots/waimai/p9-round9/02-campus-config.png)

![楼栋坐标：公开只读接口正常返回](screenshots/waimai/p9-round9/03-buildings.png)




## 30. 配送体系第十轮审计（P1 履约快照 + P2 静默失败/白名单/隔离 + P3 边界收口，2026-10-24）

### 30.1 商家确认模式自动入厅重置履约快照（P1）

- 商家接单确认开启时，超过 `merchantAcceptMinutes` 未确认的订单会自动入厅（`open`）。原实现只改 `hallStatus`，遗留 `deliveryPlan=merchant / handoverMode=...`，后续兜底规则按旧快照判断，可能出现「已入厅却仍按商户配送统计/页面显示商户配送」。
- 现在自动入厅同时写 `deliveryPlan='campus_rider'`、`handoverMode=''`（内存快照同步更新），入厅后的订单立即按传信者抢单口径参与后续调度。

### 30.2 出餐超时兜底覆盖 R1（P1）

- 原出餐超时（`merchant_cooking_timeout`）只兜底 R2：R1 已接单但久未出餐的单，只有渠道仍开启「商家接单确认」时才会被处理；渠道一旦关闭确认模式，遗留 `accepted` 单会**永久卡死**（不退款、不进墙、不告警）。
- 现在 R1/R2 的 `accepted` 单超 `merchantAutoOpenMinutes` 统一降级 `open + campus_rider`，清 `handoverMode`，飞书事件文案标注路线（`（R1）/（R2）`）。

### 30.3 无人接单自动退款失败不再静默终态（P2）

- T4 超时退款抛错时，原实现仍把订单写成 `no_rider_final` 终态：运营看板看不到、订单不再重试、顾客钱也没退。
- 现在失败写 `hallStatus='refund_failed'` + `campusCause='refund_failed'`，并推送飞书「无人接单自动退款失败」；调度看板新增 `refund_failed` 告警（类型 `exception`，提示「请人工退款/取消」），订单继续留在活跃列表可人工处置。

### 30.4 配送配置写入白名单（P2）

- `campusUpdateFulfillmentConfig` 原先把入参直接展开写库：可注入 `channelId/id` 等非配置字段，也可写入负数/超大数值导致后续调度按异常阈值运行。
- 现在仅接受 44 个已声明配置字段；未知字段直接报「不支持的配置字段」；整数区间校验（分成比例 0–100、各超时/分钟 1–240、商家接单 0–240、金额 0–1000 万分即 10 万元）；字符串限长（门店地址 200、电话 32、公告 500、H5 域名 200、模板 ID 128）；`routesEnabled` 仅 R1–R5 且去重；`printMode` 白名单。

### 30.5 骑手审核与列表按渠道隔离（P2）

- 骑手审核状态写回、审核列表原实现未校验 Customer 归属渠道，A 店管理员可用 B 店 customerId 停用/通过骑手。
- 现在写状态前先按 `customer.channels` 校验（不在当前店铺 → 「骑手不存在或不属于当前店铺」）；审核列表同样 join 渠道过滤。

### 30.6 跑腿单入参校验（P2）

- `campusSetErrandInfo` 增加：`kind` 白名单（`pickup_express / bring_food / buy / other`）；起点/终点必填且 ≤100 字；备注 ≤200 字；来源单号 ≤64 字；小费为整数、0–10 万元。
- 分区/楼栋必须属于当前店铺；同时传分区与楼栋时校验楼栋归属该分区；仅传楼栋时按楼栋反查分区名回填，避免跨店 ID 串店计价与调度。

### 30.7 P3 边界收口

- **配送目标**：路线必须在该店铺 `routesEnabled` 内（否则「该配送路线当前不可用」）；预约时段必须属于所选分区。
- **异常赔付**：`refund_diff` 金额必须为正整数且不超过订单实付，防止越权超额退款。
- **拒单扣分**：先条件写脱厅成功（未命中则报「订单已取消或已终态，无法拒单」）后再扣信用分，不再对终态单扣分。
- **外部快递取消**：`cancel` 外层加 `campus:thirdparty:{orderId}` 咨询锁（3 次 ×300ms 重试），推送与取消并发时提示「该订单正在推送/取消外部快递，请稍后重试」，避免重复取消/双运单。
- **取消事件顺序**：订单 `Cancelled` 事件由三个并行 fire-and-forget 改为串行 `cancel → exitHall → slotLock.unlock`，每步独立 catch，避免时段锁位先释放、外部运单仍在途。
- **待付款任务去重**：同单同类型已有 PENDING 任务时不再重复创建，防止重复提醒/提前取消。
- **分页钳制**：骑手收益、余额流水、提现申请、审核列表 `skip ≥ 0`、`take 1–200`（审核列表上限 500），不再接受负数/超大分页。
- **文本限长**：提现渠道 ≤30 字、账号 ≤100 字；商家拒单原因 ≤200 字；骑手姓名/学号/校区 ≤30 字、证件图 ≤500 字（第九轮已加）。
- **条件写补齐**：R2 到校确认 `markArrived`、发票申请 `applyOrderInvoice` 改为单条 `UPDATE ... WHERE 旧态 + state <> 'Cancelled' RETURNING id`，未命中提示「订单状态已变更，请刷新」/`INVOICE_ALREADY_APPLIED`。
- **收藏商品**：`campusToggleFavoriteVariant` 校验 variant 归属当前渠道，防跨店收藏他店 variant。
- **口径说明**：骑手提现列表为**平台级**（钱包余额跨渠道汇总），按设计不限定店铺渠道。

### 30.8 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `tsc` 构建通过；全量 **34 文件 / 410 用例全 PASS**（较上轮 394 +16：R1 出餐兜底、跑腿入参 7 项、配置白名单/路线/时段、骑手跨渠道拒绝、赔付金额越界、markArrived 条件写与未命中）。
- 部署：vendure `2d9092aa0` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online；`shop-api` 正常应答，JobQueue（payment-timeout / order-timeout 等）全部启动。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，当前登录店铺渠道）：调度中心（异常待处理含赔付金额校验、大厅待接、异常处置记录）、校园配置（动态计价试算与履约参数）、商家接单均正常渲染。
- 已知限制：`refund_failed` 为新增告警类型，需真实「超时无骑手 + 退款接口失败」才能触发线上截图，链路由单测覆盖；`delivery-stats` 30 天全量聚合、`tick` 仅扫描已配置渠道为既定设计，本轮未改。

![调度中心：异常待处理（赔付金额校验）/大厅待接/异常处置记录正常](screenshots/waimai/p9-round10/01-dispatch.png)

![校园配置：动态计价试算与履约参数（写入白名单生效）](screenshots/waimai/p9-round10/02-campus-config.png)

![商家接单：活跃单视图正常](screenshots/waimai/p9-round10/03-merchant.png)

## 31. 配送体系第十一轮审计（P1 资金幂等 + P2 配置边界/回调条件写 + P3 可观测性，2026-10-24）

### 31.1 骑手分成入账防重复加余额（P1）

- 送达分成与钱包补账原实现「先查 pending → 直接 `addBalance` → 置 credited」，余额端口 `addBalance` 无业务幂等键。多端同时读钱包（骑手 App + 后台）或送达重试时，同一笔 pending 分成可能被**加两次余额**。
- 现在两处都先做行级 CAS 认领（`UPDATE rider_earning SET status='crediting' WHERE id=$1 AND status=旧态 RETURNING id`），只有认领成功的进程才入账，成功置 `credited`、失败回 `pending` 待下次补账。
- 补账额外纳入「超过 10 分钟仍停留在 `crediting`」的残留行（入账链路中断不会永久卡款）；入账端口异常时中断本轮，避免逐条打错误日志。
- 残余风险（已注释标注）：入账成功但进程在置 `credited` 前崩溃 → 10 分钟后会被再次补账，仅能靠「补账成功」日志人工对账。

### 31.2 配送配置结构化校验（P2）

- 经纬度：`storeLat` 必须 ∈[-90,90]、`storeLng` ∈[-180,180] 且为有限数，否则「storeLat 必须是合法的纬度」。
- 结构化字段：`routeFirstLeg / providerShopNo / dynamicPricing` 必须是对象（字符串/数组 → 拒绝，防 JSON 列写坏导致交接点/动态计价静默失效）。
- 交接点：`handoverPoints` 必须是 `{路线: [{lat,lng}]}`，逐项校验数组与坐标，非法时提示「交接点 R2 坐标不合法」。

### 31.3 外部快递回调改条件写（P2/P3）

- 中间态回调（pending/accepted/pickup）原为「读当前状态 → 比对推进序 → 写回」，并发下可能把已推进的状态回退。现在改为单条条件 `UPDATE`（`WHERE customFieldsThirdpartystate = 读取值 AND state <> 'Cancelled'`），未命中即忽略并记日志、不再发接单通知。
- 迟到送达回调（订单已脱厅进大厅）同样走条件写，**已取消订单不会被写回 `delivered`**（否则取消退款后仍按送达统计）。

### 31.4 P3 可观测性与条件写收口

- **飞书去重键**：未显式传 `dedupeKey` 时，缺省键由 `orderCode` 改为 `orderCode:事件标题`，同一订单 2 分钟内连发「取货超时告警」+「回厅」等不同事件不再被吞（显式传键的调用语义不变）。
- **reassign 重置入厅时间**：改条件写 `transitionFrom(['open'])`，并发取消时不把终态单改回履约态，未命中记告警日志。
- **调度积压告警**：单渠道单轮扫描达 200 单上限时，除日志外推送飞书「调度扫描积压」（按渠道去重键），提醒运营增派运力/清理异常单；年轻订单被 oldest-first 饿死的问题在运营侧可见。
- **评估未改**：异常处置发补偿券极端情况下可能重复，但单客户发券走事务、失败即回滚，且 `grantCoupon` 无幂等键，风险极低，暂不改代码。

### 31.5 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `tsc` 构建通过；全量 **34 文件 / 425 用例全 PASS**（较上轮 410 +15：补账认领成功/未命中/失败回 pending、坐标与结构化配置/交接点校验、扫描积压告警、外部中间态条件写未命中）。
- 部署：vendure `7d481a1a1` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online；`shop-api` 应答 `{"data":{"activeChannel":{"id":"1","code":"__default_channel__"}}}`，JobQueue（payment-timeout / order-timeout 等）全部启动。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，当前登录店铺渠道）：调度中心、校园配置（含「配送超时赔付」新参数区）、商家接单均正常渲染。

![调度中心：正常渲染](screenshots/waimai/p9-round11/01-dispatch.png)

![校园配置：履约参数与动态计价试算正常](screenshots/waimai/p9-round11/02-campus-config.png)

![商家接单：活跃单视图正常](screenshots/waimai/p9-round11/03-merchant.png)

## 32. 配送体系第十二轮审计（P1 退款结算不静默吞单 + P2 退款失败留痕告警 + P3 分成落库告警，2026-10-24）

### 32.1 退款结算失败后已退总额虚高导致少退（P1）

- Vendure 退款是**两步**：`refundOrder` 只创建退款单（`state=Pending`），`settleRefund` 才真实打款并置 `Settled`。原实现的「已退总额」直接 `SUM(refund.total)`，**Pending 退款单也算进已退金额**。
- 后果：一次结算失败（网关/余额异常）后，退款单仍停在 `Pending` 且占额；商家重试拒单、或异常处置 `refund_all` 重试时，可退余额被算成 0 → **直接跳过退款并取消订单，客户静默少退**。
- 现在：① 已退总额排除 `state='Failed'` 的退款单；② 新增统一入口 `settleRefundOrMarkFailed`：结算抛错时把退款单置 `Failed`（保留审计痕迹，不删除记录）后重抛；③ 商家拒单、异常处置退款、无人接单 T4 自动退款**三条退款路径全部改用该入口**。
- 运营口径：`Failed` 退款单请在 `paymentMethod` 中人工核对后重新退款；历史遗留的 `Pending` 退款单（服务器无 `psql`，未能直接盘点）同样需人工对账一次。

### 32.2 异常处置退款失败无留痕无告警（P2）

- 异常处置 `refund_diff / refund_all` 原实现退款失败只 `restore()` 回滚认领并抛错：订单退回原异常态，但**没有失败标记、没有告警**，运营无从得知「客户没收到退款」。
- 现在：失败时条件写 `hallStatus='refund_failed'` + `campusCause='refund_failed'`（仅当订单仍在 `exception_final` 且未被取消，未命中则不覆盖），并推送飞书「异常处置退款失败」（去重键 `exception_refund_failed:{订单号}`）；已成功标记失败时**不再回滚认领**，避免状态在 `refund_failed` 与异常态之间来回跳。
- 发券类处置失败仍走原回滚逻辑（异常态保留、可重试），与退款类区分。

### 32.3 骑手分成落库失败补告警（P3）

- 订单送达后分成落库失败**无法重试**（订单已是终态），原实现只打 `Logger.error`，等于静默丢钱。
- 现在落库异常时推送飞书「骑手分成落库失败」（含订单号、分成金额、原因、去重键 `earning_persist_failed:{订单号}`），运营可人工补账。
- **复核后未改码**：异常处置「认领成功但进程崩溃、未写处置结果」的场景，调度墙已对「`exception_final` + `deliveryStatus='exception'` + 无 `exceptionHandledAt`」的订单常驻告警，无需再加代码。

### 32.4 复核确认无问题项

- 飞书去重 Map 每次调用清理超过 2 分钟的历史键，不会无界增长；`withAdvisoryLock` 同 runner 持有/释放，异常时释放失败由连接回收兜底。
- `delivery-stats` 非 SuperAdmin 已按渠道过滤且剔除 `Cancelled`；`dispatch-admin` 所有写操作均经 `assertOrderInChannel`；取消守卫仅拦截 C 端取消，调度/后台取消不受影响。

### 32.5 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `tsc` 构建通过；全量 **34 文件 / 432 用例全 PASS**（较上轮 425 +7：已退总额排除 Failed、结算失败置 Failed、异常处置退款失败标记+告警、未命中不告警、发券失败仍回滚、分成落库失败告警）。
- 部署：vendure `1591d9c98` 推送 → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，`HEAD is now at 1591d9c98`、pm2 online；`shop-api` 应答 `{"data":{"activeChannel":{"id":"1","code":"__default_channel__"}}}`，JobQueue（payment-timeout / order-timeout 等）全部 Starting。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，当前登录店铺渠道）：调度中心、校园配置、商家接单均正常渲染。

![调度中心：大厅待接/告警正常渲染](screenshots/waimai/p9-round12/01-dispatch.png)

![校园配置：动态计价试算与履约参数正常](screenshots/waimai/p9-round12/02-campus-config.png)

![商家接单：活跃单视图正常](screenshots/waimai/p9-round12/03-merchant.png)

## 33. 配送体系第十三轮审计（P1 改址差额退款接统一结算 + P2 台账并发/告警 + P3 校验与口径，2026-10-24）

### 33.1 改址差额退款未走统一结算入口（P1）

- 第十二轮统一了「商家拒单 / 异常处置 / 无人接单」三条退款路径，但**遗漏了第 4 条：改址差额退款**（`address-change.service.ts` 的 `refundAmount`）。原实现只调用 `refundOrder` 创建退款单，**从不结算**，退款单长期停在 `Pending`：钱没打给客户，且按 32.1 的口径占掉已退额度。
- 现在 `refundAmount` 末行统一调用 `settleRefundOrMarkFailed`：结算成功即真实打款，失败置 `Failed` 留痕、不占额度、可由运营重试。
- 运营口径：改址台账「待退顾客」金额在结清后即已真实打款，不再需要人工另行退款。

### 33.2 改址台账与订单地址并发写（P2）

- **台账 `refundId` 落库改条件写**：结清差额原为「锁内查重 → 退款 → `repo.save`」，锁外并发/重试可能把同一行写成两条退款。现在在退款锁内用 `UPDATE ... WHERE id=? AND "refundId" IS NULL` 落库，`affected=0` 直接判「该差额已退款」，重复请求不会二次打款。
- **调度墙新增常驻告警** `address_change_cancel_failed`：改址后原外部运力单取消失败（旧运单仍会把餐送到旧地址）原来只写日志，调度中心完全看不到。现在该订单在调度墙的异常区常驻提示「请人工取消并按新址重推」。
- **改址失败回滚台账**：订单地址写库失败时删除已插入的台账行，避免留下「有台账、无改址」的幽灵记录。

### 33.3 P3 配置校验与统计口径

- **`updateStoreConfig` 补校验**（此前只挡负数）：各配送时长/金额参数加区间校验与整数归一；`routesEnabled` 去重并过滤非法值；门店坐标校验 `lat ∈ [-90,90]`、`lng ∈ [-180,180]`，传 `null` 可清空。
- **骑手分成按实收小费计**：原先按订单 `cf.tip` 计算，跑腿小费 surcharge 未落库时会虚高分成。现在按实际收取的 `跑腿小费` surcharge 金额累加计算，未收取即按 0 计。
- **T4 无人接单补偿券失败独立告警**：发券异常原被外层 catch 记为「退款失败」，券静默丢失。现在发券单独 try/catch，失败推飞书「无人接单补偿券发放失败」（去重键 `compensation_coupon_failed:{订单号}`），退款/取消流程不受影响。
- **外部运力取消回退改条件写**：`doCancel` 成功后不再「读后无条件写」，改 `transitionFrom(['third_party'])` 条件写，避免并发/已取消订单被复活；未命中仅补写第三方状态。
- **台账列表 `skip` 钳制**（负数归零）；结清备注限制 200 字。

### 33.4 复核后未改项

- 骑手钱包 `sumEarned` 含 `pending` 分成：口径为「应得」，与提现可用的 `available` 分开展示，符合业务定义。
- `campusErrandVariant` 建商品为幂等 upsert，并发重复调用不会产生重复变体。

### 33.5 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `tsc` 构建通过；全量 **35 文件 / 447 用例全 PASS**（较上轮 432 +15：改址退款结算/结算失败置 Failed/台账 CAS 未命中/备注超长/改址失败回滚台账、配置区间与坐标校验、routes 去重、小费实际口径、改址取消失败告警、补偿券失败告警、`doCancel` 三种条件写分支；同时修正 12 轮遗留的 `refundRepo.findOne` 测试缺口）。
- 部署：vendure `941f96cee` 推送（服务器 HEAD `c6d054de9`，含本轮全部提交）→ `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online、内存正常；JobQueue（payment-timeout / order-timeout / after-sales-timeout 等）全部启动；`shop-api` 正常应答（GET 400，POST 正常），`coupon-expire` 定时任务正常跑批次。
- lib 产物核验：服务器 `lib/src/address-change.service.js` 含 `settleRefundOrMarkFailed`、`lib/src/dispatch-admin.service.js` 含 `address_change_cancel_failed`，确认编译产物与源码一致。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，当前登录店铺渠道）：调度中心、改址台账、校园配置均正常渲染。

![调度中心：告警与大厅正常渲染](screenshots/waimai/p9-round13/01-dispatch.png)

![改址台账：待处理/待退/待收差额指标正常](screenshots/waimai/p9-round13/02-address-changes.png)

![校园配置：履约参数与动态计价试算正常](screenshots/waimai/p9-round13/03-campus-config.png)

## 34. 配送体系第十四轮审计（P2 入厅竞态/供需加价口径 + P3 分页/日界/流水/心跳/小费，2026-10-24）

### 34.1 入厅写改条件写，堵「已取消单复活」（P2）

- **问题**：支付成功回调 `HallService.onOrderPlaced` 原为「读一次订单判 `Cancelled` → 无条件 `repo.update` 写 `hallStatus`」。读与写之间无锁无 CAS，用户取消与支付回调并发时，已退款单会被写回 `open/pending_merchant`；商家工作台只按 `hallStatus` 拉活跃单、不看 `state`，于是工作台会冒出已取消单。
- **修复**：入厅统一走 `transitionFrom(..., [''])` 条件写（`COALESCE(hallStatus,'')=''` 且 `state <> 'Cancelled'`），命中才写履约快照与目标态；未命中则**归还本次已锁的时段容量**（`slotLock.unlock`，原子认领保证只释放一次）并打 warn，不再写任何字段、不再通知骑手。
- 运营口径：已取消/已入厅订单不会再回到商家工作台或抢单大厅；时段名额不会因取消竞态泄漏。

### 34.2 结算运费补齐在线骑手数，供需加价阈值真正生效（P2）

- **问题**：`quoteDynamicFee` 的供需命中条件为「积压 ≥ 阈值 **且** 在线骑手 ≤ `riderThreshold`」，但 `shipping-calculator` 三处报价（跑腿起步价 / 第三方到校基价 / 分区运费）都**没传 `onlineRiders`**，函数按 `0` 兜底 → 骑手条件恒成立，只要积压达标就加价。同时改址补差报价传了真实骑手数，**同一单结算价与改址价口径不一致**（骑手充足时结算仍被加价）。
- **修复**：新增 `readOnlineRiderCount`（approved 且 5min 内有点击心跳，按渠道 30s 缓存，与 `CapacityService.listOnlineRiders` 同口径），三处报价统一传入；`riderThreshold`/`releaseRiders` 恢复正常语义（骑手充足或回落到 `releaseRiders` 以上即不加价）。
- 运营口径：动态计价配置里的「在线骑手阈值」现在是真实生效的，调整后顾客结算价与改址补差价一致。

### 34.3 P3 健壮性收口

- **待付款任务分页参数钳制**：`listTasks` 的 `skip` 归零下限、`take` 限 1–100（GraphQL 可传负数，负 `skip` 会生成非法 `OFFSET` 直接报错），与骑手申请列表/提现列表同口径。
- **「今日」统计改校园 UTC+8 日界**：`getStats` 原用服务器本地 `setHours(0,0,0,0)`，与 `campus-time.ts`（骑手统计/飞书日报）口径不一致；服务器时区变更后会整体漂移 8 小时。现统一 `startOfCampusDay(Date.now())`。
- **骑手信用分流水失败告警**：分数为原子 UPDATE（无法回滚），流水 `save` 失败原先静默；现在捕获并 `Logger.warn`（含 customer/delta/reason），分数照常返回，避免调用方误判失败而重复加减分。
- **上下线仅限已过审骑手**：`setOnline(true)` 增加 `riderStatus==='approved'` 校验（none/pending/suspended 一律拒绝，下线不受限），避免待审/停用账号写心跳污染在线运力口径。
- **跑腿小费「先清后加」失败回补**：新增小费失败时尽力回补刚清掉的旧小费再抛错，避免用户已填小费在改单后静默丢失。

### 34.4 复核后未改项

- 提现列表/审核跨渠道：代码注释明确为**平台级**设计（余额与流水固定默认渠道口径），渠道管理员能否拿到 `CampusAuditRider` 属权限配置问题，非代码缺陷。
- 骑手分成「入账成功但崩溃前未置 credited」的极小窗口重复入账：治本需余额端口提供幂等键，超出配送插件范围，维持代码内已声明的残余风险（靠日志人工对账）。
- 时段/预约、动态高峰时段按服务器本地时区解析：生产服务器实测 `Asia/Shanghai`（CST=UTC+8），无实际偏差。
- `cancel-guard`、最低起送价、发票 CAS、收藏归属校验、配送档案租户隔离、R4 打标、R2 到校 CAS：本轮复核正常。

### 34.5 验证记录（2026-10-24）

- 构建与单测：campus-delivery-plugin `tsc` 构建通过；全量 **35 文件 / 457 用例全 PASS**（较上轮 447 +10：入厅 CAS 未命中/命中两分支、供需加价骑手充足与紧张两档、分页钳制、信用分流水失败告警、setOnline 审核态三分支、小费失败回补）。
- 部署：vendure `fe8510261` → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，`HEAD is now at fe8510261`、pm2 online、内存正常；JobQueue（payment-timeout / order-timeout / after-sales-timeout 等）全部启动，`coupon-expire` 定时批次正常。
- lib 产物核验：`lib/src/hall.service.js` 含 `enter hall skipped`、`lib/src/shipping-calculator.js` 含 `readOnlineRiderCount`、`lib/src/payment-timeout-admin.service.js` 含 `startOfCampusDay`。
- 手机视口截图（390×844 dpr=2，e.joho.cn/guanli，当前登录店铺渠道）：支付超时观测看板、校园配置均正常渲染。

![支付超时观测：四指标看板与任务分页正常（本轮钳制与日界生效）](screenshots/waimai/p9-round14/01-payment-timeout.png)

![校园配置：动态计价供需阈值配置正常（在线骑手数已入结算报价）](screenshots/waimai/p9-round14/02-campus-config.png)

## 35. 第十五轮：骑手信用自动恢复收口（2026-10-25）

### 35.1 背景与生产实测缺陷

上一轮之后并行会话提交了 `3d850b310`（超时赔付默认开 + 骑手信用自动恢复），本轮审计在该提交里发现 2 项 P1，且生产已 100% 复现。

- **P1-1 原生 SQL 列名未加引号**：`rider_credit_log` 物理列是带引号的 camelCase（`"customerId"`/`"channelId"`，见建表 SQL），`sweepRecovery` 里写成裸 `customerId`，PostgreSQL 折叠成小写 → 列不存在。生产日志每分钟每渠道刷：`credit recovery sweep failed channel=107: column "customerid" does not exist`，功能**完全不生效**且淹没其他告警。
- **P1-2 缺恢复去重窗口**：原 SQL 只排除「近 7 天有 timeout 扣分」，没有「近 7 天已恢复过」的判断。dispatch sweep 每 60 秒一轮，修好列名后会变成同一骑手每分钟 +5 分，约 20 分钟从 0 回满 100，「7 天恢复一次」失效，信用 <60 的接单屏蔽几乎形同虚设。

### 35.2 本轮修复

- **列名引号**：`SELECT DISTINCT "customerId"`、`log."customerId" = c.id`、`log."channelId" = $1`、`log."createdAt" >= $2` 全部改成带引号写法。
- **恢复节奏（既定口径：每 7 天最多 +5 一次）**：新增 `NOT EXISTS (... reason = 'recovery_7d_clean' AND "createdAt" >= $2)`，与超时扣分排除共用同一个 7 天窗口。
- **`adjust` 回退值夹紧（P3）**：UPDATE 未匹配行（顾客不存在）时回退值由 `100+delta` 改为 `Math.min(100, Math.max(0, 100+delta))`，不再出现 105 这类越界值。
- **P6 迁移改一次性（P2）**：新增 `campus_migration_marker` 表，先用 `INSERT ... ON CONFLICT DO NOTHING RETURNING name` 抢占 `p6-default-compensation`；抢到才执行 `FALSE→TRUE`。否则运营在后台关掉超时赔付，每次重启/部署都会被翻回开（自动发券=真金白银）。
- **补单测（P3）**：新增 5 个用例（候选逐个加分并落流水、候选为空、SQL 引号与去重文本断言、单个失败继续、无匹配行回退夹紧）。

### 35.3 验证记录

- 全量单测：campus-delivery-plugin **35 文件 / 462 用例全 PASS**（较上轮 457 +5）；`tsc` 构建通过，`lib/` 产物随提交入库。
- 部署：`df3456758` → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，`HEAD is now at df3456758`、pm2 online。
- 生产日志（重启后 3 轮 sweep，约 3 分钟）：
  - `column "customerid" does not exist` 计数 **0**（部署前每分钟每渠道一条）。
  - 恢复按预期只跑一次：`credit recovery channel=113: +1 rider(s) +5pt`、`credit recovery channel=1: +1 rider(s) +5pt`；后续 sweep 无重复加分 → 7 天去重生效。
- 手机视口截图（390×844 dpr=2，`e.joho.cn/guanli`）：骑手入驻审核页信用分列、校园配置页均正常。

![骑手入驻审核：信用分列（自动恢复按 7 天窗口 +5）](screenshots/waimai/p9-round15/01-rider-credit.png)

![校园配置：超时赔付开关默认开（P6 仅执行一次，关掉后不会被重启覆盖）](screenshots/waimai/p9-round15/02-campus-config.png)

## 36. 第十六轮：待付款超时补偿改自管定时器（2026-10-25）

### 36.1 背景与生产实测缺陷

本轮静态审计覆盖第三方运力、路线矩阵、配送统计、公众号通知、店铺配置、骑手任务、校园配置 7 个模块（均未发现 P1/P2），随后做生产数据健康检查时发现**系统性遗漏（P1）**：

- **生产从不执行 Vendure `ScheduledTask`**：`dev-config.ts` 设 `schedulerOptions.runTasksInWorkerOnly: true`，而生产 pm2 只启动 `prod-start.js → dist/index`（API 服务器），**没有 worker 进程**（`index-worker.ts` 只在 `npm run dev` 时跑）。`SchedulerService` 因此从未注册任何计划任务，启动日志里也从来没有 `Registered scheduled task` 行。
- **SQL JobQueue 不按 `delay` 排队**：`scheduleForOrder` 带 `delay` 入队的提醒/取消 job，实测在**创建当秒**就被消费（`job_record.createdAt == startedAt`），`process()` 看到 `now < dueAt` 直接 return、任务保持 PENDING —— 设计上完全依赖补偿扫描重新入队。
- **补偿扫描是 ScheduledTask → 从不运行** ⇒ 待付款提醒/取消在生产**100% 失效**。实证：10-14 起的 20 条 `payment_timeout_task` 至今 PENDING（retryCount=0、lastError=null），订单 385/386/387/388/390/391 在 `ArrangingPayment` 卡了 **11 天**未被取消（占用库存与结算数据）。
- 遗留数据：订单 269（10-06）`hallStatus='in_progress'` + `deliveryStatus=exception`。当前状态机不会产生 `in_progress`（配送中是 `hallStatus=grabbed` + `deliveryStatus=in_progress`），且 `exceptionReportedAt` 为空，调度扫描的异常超时升级按设计跳过 —— 属旧版本遗留测试单，非现网功能缺陷。

### 36.2 本轮修复

- **`PaymentTimeoutJob` 新增自管补偿循环**：`startCompensationLoop(intervalMs=5min)` / `stopCompensationLoop()`，30s 后首跑（等 JobQueue 初始化），`running` 标志防上一轮未结束时堆叠，异常只 `Logger.warn` 不中断后续轮次；实现 `OnApplicationShutdown` 在停机时清理定时器。
- **插件启动顺序**：`onApplicationBootstrap` 中 `PaymentTimeoutJob.init()` 完成后再 `startCompensationLoop()`，与 `DispatchJobService.start()`、`FeishuDigestService.start()` 的自管定时器部署形态对齐（生产无 worker 的唯一可行形态）。
- **移除 ScheduledTask 注册**：删除 `payment-timeout-compensation` 的 `ScheduledTask` 定义与 `config.schedulerOptions` 注入，避免未来补 worker 时两套机制重复入队。
- **补偿可观测性**：`runCompensation` 增加 `jobQueue` 未就绪短路（启动窗口返回 0）与重入队条数日志（`compensation re-enqueued N overdue task(s)`），运营可在 `pm2 logs vendure` 直接确认补偿心跳。
- **新增 5 个单测**：30s 首跑 + 5min 周期 / 重复 start 幂等 / 上一轮未结束时跳过 / 补偿异常吞错不抛出 / `onApplicationShutdown` 清理定时器（另加 `jobQueue` 未就绪返回 0）。

### 36.3 验证记录

- 全量单测：campus-delivery-plugin **35 文件 / 467 用例全 PASS**（较上轮 462 +5）；`tsc` 构建通过，`lib/` 产物随提交入库（`lib/src/payment-timeout.job.js` 含 `startCompensationLoop`，插件 JS 不再有 ScheduledTask）。
- 部署：`42fd789f9` → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env`，pm2 online。
- 生产实测（重启后 80s）：
  - 日志首次出现 `[PaymentTimeout] compensation re-enqueued 20 overdue task(s)`，随后 20 条任务全部终结（stale 的按订单终态 CANCELLED，其余 EXECUTED）。
  - 卡单 385/386/387/388/390/391 全部自动取消（`Cancelled`）；395/396（已支付）任务按 stale 作废，订单状态不受影响。
  - 库内统计：`payment_timeout_task` 仅剩 `CANCELLED 95 / EXECUTED 17`，**PENDING 与 FAILED 均为 0**；`PENDING AND dueAt < now()` 为 **0**。
- 手机视口截图（390×844 dpr=2，`e.joho.cn/guanli`）：支付超时观测页四指标全为 0（今日提醒/今日取消/累计失败/**逾期滞留 0**，即本轮修复的直接判据），订单列表正常。

![支付超时观测：逾期滞留归零，任务全部已执行/已取消（本轮修复直接判据）](screenshots/waimai/p9-round16/01-payment-timeout.png)

![订单列表：卡单已自动取消，页面正常](screenshots/waimai/p9-round16/02-order-list.png)

### 36.4 遗留与建议（非配送插件范围）

- Vendure 内置 `order-timeout`、`clean-sessions`、`after-sales-timeout`、`flash-sale-status`、`group-buy-check` 等同样依赖 `ScheduledTask`，**生产同样不执行**（库内 `job_record` 最后一批补偿入队停在 10-23）。若希望这些平台级补偿恢复，可在 `dev-config.ts` 设 `schedulerOptions.runTasksInWorkerOnly: false`（单进程部署的官方推荐做法，需重新构建 dev-server `dist` 并重启），或另起 `index-worker` pm2 进程。本轮按配送体系范围只修校园插件自有链路，未改动全局配置。
- 订单 269 等 10-06 遗留测试单（`hallStatus='in_progress'`）不影响现网流转，建议运营侧归档处理，不做代码兜底（状态机已不产出该状态）。

## 37. 第十七轮：两处原生 SQL 漏加列名引号（2026-10-25）

### 37.1 背景与生产缺陷

本轮复核并行会话提交 `3cdf068fc`（FAILED 任务接飞书告警）未发现 P1/P2（告警去重、扫描上限、异常不阻断均正确），随后对全插件 `rawConnection` 原生 SQL 做**列名引号全量复查**（round 15 曾因裸写 `customerId` 导致生产每分钟报错），又发现两处同类遗漏：

1. **飞书「确认恢复」指令完全不可用（P1）**：`feishu.command.service.buildRestoreSQL()` 生成
   `UPDATE "order" SET customFieldsHallstatus='open', customFieldsExceptionaction=NULL, ...`，
   5 个列名全部裸写。PostgreSQL 会把裸写标识符折叠为小写（`customfieldshallstatus`），
   而物理列是 `customFieldsHallstatus` → 生产执行必报 `column ... does not exist`，
   指令回复「恢复失败」。SQLite 单测大小写不敏感，因此一直未暴露。
2. **「合并默认配送档案」补绑变体报错（P1）**：`shipping-profile-ensure.service.bindUnboundVariants`
   的 QueryBuilder 原始 where 写成 `v.customFieldsShippingprofileid IS NULL`（未加引号），
   同样在 PG 报 `column v.customfieldsshippingprofileid does not exist`，未绑变体补绑直接失败。

> 根因同源：本 fork 的 customFields 物理列名保留首字母大写（`customFieldsHallstatus` /
> `customFieldsShippingprofileid`），任何原生 SQL 与 QueryBuilder 原始条件都必须双引号包裹。

### 37.2 本轮修复

- `buildRestoreSQL()`：5 个列名全部改为 `"customFieldsXxx"` 形式，恢复指令在 PG 可执行。
- `bindUnboundVariants`：where 改为 `v."customFieldsShippingprofileid" IS NULL`，
  UPDATE 语句原本已加引号无需改动。
- 单测补 **PG 回归断言**（SQLite 单测无法暴露大小写问题，只能断言写法）：
  - `feishu.spec.ts`：每个 SET 字段的列名必须匹配 `^"customFields[A-Za-z]+"$`；
  - `shipping-profile-ensure.service.spec.ts`：变体过滤 where 必须包含 `"customFieldsShippingprofileid"`，且不得出现裸写 `v.customFields`。

### 37.3 验证记录

- 全量单测：**35 文件 / 471 用例全 PASS**（较上轮 467 +4）；`tsc` 构建通过，`lib/` 随提交入库。
- 全插件原生 SQL 复查：`customFields` 裸写仅上述两处，其余（rider-task / dispatch-job / dispatch-admin / slot-lock / r2-mark / campus-invoice / rider-credit / 迁移脚本 / 收藏表）均已双引号；自建表 `campus_favorite_shop` 等 camelCase 列亦已加引号。
- 部署 `0e1094a45` 后在生产 PG 用 `EXPLAIN`（不执行、无副作用）验证两条语句可正常解析：
  - `Update on "order" ... Index Scan ... (id = 269)`；
  - `Update on product_variant ... Filter: ("customFieldsShippingprofileid" IS NULL)`。
- 手机视口截图（390×844 dpr=2）：配送档案页正常渲染（门店自提 / default 租户默认档案 / 全局档案均可见）。

![配送档案页：本轮修复的「补绑未绑变体」链路所在模块](screenshots/waimai/p9-round17/01-shipping-profile.png)

## 38. 平台级计划任务恢复执行（2026-10-25）

### 38.1 决策与改动

经确认，本轮把「计划任务只在 worker 执行」改为**单进程执行**（生产 pm2 只有 API 进程、无 worker）：

- `packages/dev-server/dev-config.ts`：`schedulerOptions.runTasksInWorkerOnly: true → false`，同步重建 `dist/dev-config.js` 并随提交入库。
- 影响面：此前在生产**完全停摆**的平台功能全部恢复 —— 待付款补偿（校园插件已另改自管定时器）、订单超时释放预留（order-timeout）、售后超时、会话清理、积分订单过期/退款重试、订单自动完成、预售/秒杀/拼团状态切换、运营内容生命周期、支付计划扫描等。
- 本地开发注意：`npm run dev` 会 server+worker 各跑一次计划任务（补偿类幂等，无副作用）。

### 38.2 验证记录

- 部署 `df3d14e65` 后启动日志出现 `Registered scheduled task: ...`（此前从未出现），并逐条 `Executing scheduled task ... completed successfully`：
  `points-order-refund-retry`、`order-complete-auto`、`operations-content-lifecycle`、`operations-product-stats`、`pre-sale-status-transition`、`payment-schedule-scan`、`points-order-expiry`、`release-expired-reservations`、`flash-sale-status-transition`、`group-buy-check`。
- 部署后 10 分钟内新入队任务：`order-timeout 55 条 / after-sales-timeout 6 条`，全部 `COMPLETED`；`pm2 error.log` 近 900 行无任何 error/failed/column does not exist。
- 遗留测试单 269 已归档：`hallStatus 'in_progress' → 'exception_final'`（未改订单状态与金额），全库 `hallStatus='in_progress' 且超 3 小时` 归零。
- 本轮为服务端配置修复，无 UI 变更，取证以启动日志与 `job_record` 统计为准。

## 39. 第十八轮：六项体验级（P3）缺陷一并收口（2026-10-25）

### 39.1 修复清单

| # | 问题 | 修复 |
|---|---|---|
| 1 | `updateStoreConfig` 未传字段被置 null（后台局部更新会清空配送时长/运费/公告/模板/H5 域名等） | 改为「未传即保留，显式传 null 才清空」；`printMode` 同样未传不改 |
| 2 | 无配置行时 `timeoutCompensationEnabled` 显示 false（实体默认 true，保存任一字段后突变 true） | 视图默认值对齐实体 `default: true` |
| 3 | 配送看板「店铺准点对比」店名显示 `canteen-a` 这类渠道 code | 优先取 `Channel.customFields.shopName`（中文店铺名），缺失再回退 code |
| 4 | `campus-notify` 以 `Number(ssoId)` 下发，脏数据会变成 NaN | ssoId 非数字时记 warn 并跳过，不再请求下游 |
| 5 | `rider-task.transfer` 回厅与清位置/写交接存证是两次独立写，中间被取消会半更新 | 并入 `backToHall` 同一条 CAS 语句；`transferPhotos` 按 simple-array 逗号分隔写 |
| 6 | FAILED 任务飞书告警「先标记后推送」，推送失败也静默 24h | `pushEvent` 返回送达结果，去重键改为送达成功后才登记；失败下一轮重试 |

### 39.2 验证记录

- 单测：`npm test` 35 文件 **474 用例全过**（新增 3 个用例：配置未传保留、ssoId 非数字跳过、告警失败重试）。
- 生产部署 `ef79cafda`（`git reset --hard + pm2 restart`）启动正常，`Registered scheduled task` 全部在册，无 error。
- 配置保留（channel 114 `canteen-b`，只传 `routesEnabled` 原值）：回读 `deliveryMinutes=24`、`storeAddress=东门美食广场 2 号铺`、`storeNotice=午市高峰出餐较慢…` 全部保留 → PASS。
- 店名（临时给 channel 113 写 `shopName=一食堂` 后查看板）：`storeComparison` 返回 `channelName=一食堂`，验证完立即还原为 NULL → PASS。
- 转单单条 CAS（列名含 `customFieldsRiderlat/Riderlng/Transferphotos/Transfernote/Transferat`）在生产 PG `EXPLAIN` 通过，无 `column does not exist`。
- 无配置行默认值：生产各渠道均已存在配置行，无法造「无行」场景，由单测覆盖（`timeoutCompensationEnabled: true`）。
- 手机视口截图（390×844 dpr=2）：`docs/screenshots/waimai/p9-round18/01-delivery-stats.png`、`02-store-config.png`（看板店铺对比仍显示 code 属预期，该渠道未配中文店名）。
- 已知未改（仅记录）：`delivery-stats` 中未配 `shopName` 的渠道仍显示 code；`web-admin` 无店铺配置界面，本项只能由接口验证。

## 40. 配送体系 P1/P2 十项能力交付（2026-10-25）

### 40.1 交付清单

| # | 能力 | 后端（vendure） | C 端（waimai） | 后台（vshop/web-admin） |
|---|---|---|---|---|
| 1 | 商家语音播报 | — | — | 商家看板：`speechSynthesis` 中文播报（多单带数量）→ 无语音回退提示音；新单浏览器通知；首个手势解锁音频与通知授权；localStorage 记忆开关（`wa_voice_alert`） |
| 2 | 骑手导航 | `campusRiderNav(orderId)` 返回店铺/楼栋坐标 | 配送中列表「导航」按钮，1 个目标直达 `uni.openLocation`，多目标 ActionSheet 选择，无坐标给文案提示 | — |
| 3 | 营业时间自动开关 | `campusOrderGateProcess`：进入 `ArrangingPayment` 前校验营业时间（跑腿单豁免）；`WaimaiStore.openNow` | 菜单/首页以 `openNow` 为准；商家手动暂停显示「商家休息中 · 暂停接单，可先加购」 | — |
| 4 | 一键沽清 | `product.customFields.waimaiSoldOut` + 闸门拦截 | 菜单售罄标签、禁止加购（仍展示，智能替代生效） | `/pages/campus/products` 搜索分页 + 售罄开关（乐观更新失败回滚） |
| 5 | 客服站内工单 | 工单实体 + `campusCreateSupportTicket` / `campusMySupportTickets` / `campusReplySupportTicket` | `/pkg-user/pages/support-tickets`：分类/订单号/500 字/3 图，列表含状态与商家回复 | 运营中心「客服工单」tab：筛选、回复、关闭 |
| 6 | 骑手申诉 | 申诉实体 + 待审唯一约束 + 审核回补信用分 | `/pkg-rider/pages/rider-appeal`：信用分概览、理由+证据图、历史状态与审核意见 | 运营中心「骑手申诉」tab：通过（可回补分值）/驳回 |
| 7 | 下单黑名单 | 黑名单表 + 闸门校验（用户/手机号） | 下单失败直接展示后端文案「该账号暂不可下单…」 | 运营中心「黑名单」tab：按用户 ID/手机号增删 |
| 8 | 班次 + 在线时长 + 运力预警 | 班次表、在线会话累计、`capacity-alert.job` 推飞书 | `/pkg-rider/pages/rider-shifts`：未来 14 天班次与时长 | 运营中心「班次与在线」tab：按日 CRUD + 当天在线时长排行 |
| 9 | 用户给骑手评分 | 评分表（按订单幂等 upsert）+ 均分聚合 | 评价页骑手 1-5 星 + 4 个标签（未点星跳过、失败不阻断商品评价）；骑手首页展示均分 | 运营中心「骑手评分」tab：均分与评价明细 |
| 10 | 短信兜底 | `campus-sms.service` 适配器，env 未配置时静默跳过 | — | — |

### 40.2 验证记录

- 后端单测：`npm test` **37 文件 / 491 用例全过**；`npm run build`（tsc）成功，`lib/` 产物随提交入库。
- 生产部署：`/www/apps/vendure` → `git reset --hard origin/master`（`e958cab69`）+ `pm2 restart vendure`，启动 online、无崩溃循环。
- Schema 上线探针（生产）：`waimaiStoreList { openNow }` 返回 `canteen-a=true / canteen-b=false`；`campusSupportTickets` 未带 token 返回 `FORBIDDEN`（字段已存在，非 unknown field）。
- Admin API 实测（superadmin + `vendure-token`）：工单/申诉/黑名单/班次/在线时长/评分均可读；`campusMerchantProducts` 默认渠道 116、`canteen-a` 3、`canteen-b` 2（渠道隔离正确）。
- C 端 e2e（生产真数据）：提交工单 → 后台回复 → 工单页显示「已回复」+ 商家回复；提交申诉 → 后台「待审核」可审批；后台建 10:00-14:00 班次 → 骑手「我的班次」显示 4.0 小时；沽清「麻辣拌面」→ 菜单出现「售罄」且加号禁用 → 验证后已回滚为在售。
- 手机视口截图（390×844 dpr=2）：`docs/screenshots/waimai/p1p2/` 下 01 菜单售罄、02 首页营业状态、03 工单、04 骑手评分、05 申诉、06 班次、07 骑手首页评分、08 运营中心工单、09 申诉/黑名单/班次/评分四个 tab、10 一键沽清、11 商家语音开关。
- 连带修复：①菜单 `menu.etaBar/etaBarNextDay/etaHint` 文案键缺失（第 38 轮遗留）导致页面显示原始 key，已补中英；②骑手评分星级默认 5 星改为 0 星（点星才提交）；③后台 `usePermGuard` 在 `access` 异步加载前误判，改为最多等 6s 再判定（修复超级管理员直连被误提示并回退）。
- 已知/待补充：`waimai` 工作区仍有与本轮无关的未提交改动（结算页 ETA 区块移除、江湖模块），部署产物按仓库提交版本构建（部署时临时暂存 `checkout.vue`，部署后还原工作区），不影响本轮功能；后台账号若未开通 `CampusDispatch` / `CampusMerchant` 权限仍按原逻辑拦截（`@Allow` 后端兜底）。

## 41. 运力预警飞书推送完善（2026-10-25）

### 41.1 能力说明

| 维度 | 行为 |
|---|---|
| 分级 | **无在线骑手**（critical）：在线骑手 0 人且待抢单 ≥ `NO_RIDER_BACKLOG`；**骑手紧张**（warning）：在线骑手 ≤ `TIGHT_RIDERS` 且待抢单 ≥ `TIGHT_BACKLOG` |
| 内容 | 店铺名（优先 `channel.customFields.shopName`，缺省回退渠道 code）+ 待抢单量 + 最久等待分钟 + 在线骑手数 + 处置建议 + 调度看板链接（后台运营中心） |
| 定向 | 按渠道推送：该店铺群 + 平台群；未配置店铺群时只发平台群；完全没有群映射时退回 `FEISHU_WEBHOOK`，告警不静默丢失 |
| @所有人 | critical 默认 @所有人（`CAPACITY_ALERT_AT_ALL=false` 可关）；warning 不 @ |
| 冷却 | 同渠道同级别 30 分钟；**级别升级（紧张→无骑手）绕过冷却立即推**；**仅送达成功才占冷却**，推送失败下一轮自动重试 |
| 恢复 | 渠道回到健康后补一条「运力已恢复」（含骑手数/待抢单量），每轮恢复只推一次 |
| 降级 | `FEISHU_ENABLED=false` 或发送通道未配置时只写日志（保留冷却，避免刷日志），不影响订单主流程 |
| 在线会话 | 每轮顺带把心跳超过 5 分钟的 `campus_rider_session` 关账（在线时长统计收口） |

### 41.2 环境变量（均可选，留空用默认）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CAPACITY_ALERT_ENABLED` | `true` | 总开关；`false` 时只关闭运力预警定时器，不影响其他配送功能 |
| `CAPACITY_ALERT_INTERVAL_MIN` | `5` | 扫描周期（分钟，最小 1） |
| `CAPACITY_ALERT_BOOT_DELAY_SEC` | `60` | 启动首跑延迟（秒），等连接池/事件总线就绪 |
| `CAPACITY_ALERT_COOLDOWN_MIN` | `30` | 同渠道同级别冷却（分钟；`0` = 不冷却） |
| `CAPACITY_ALERT_NO_RIDER_BACKLOG` | `1` | 无骑手告警的待抢单量下限 |
| `CAPACITY_ALERT_TIGHT_BACKLOG` | `5` | 运力紧张的待抢单量下限 |
| `CAPACITY_ALERT_TIGHT_RIDERS` | `2` | 运力紧张的在线骑手数上限 |
| `CAPACITY_ALERT_AT_ALL` | `true` | 严重告警是否 @所有人 |
| `CAPACITY_ALERT_CHANNELS` | 空（全部） | 只告警指定渠道 code，逗号分隔（如 `canteen-a,canteen-b`），避免演示店铺噪声 |
| `CAPACITY_ALERT_LINK` | 空 | 覆盖告警里的调度看板链接 |
| `ADMIN_UI_BASE_URL` | `https://e.joho.cn` | 后台域名（可带 `/guanli`），用于拼看板链接 |

> 修改 env 后需 `pm2 restart vendure` 生效；启动日志会打印当前阈值与渠道白名单：`[CampusCapacity] 运力预警已启动：…`

### 41.3 验证记录

- 单测：`packages/campus-delivery-plugin` `npm test` → **38 文件 / 507 用例全过**（新增 9 个运力预警用例 + 3 个飞书定向推送用例）；`npm run build` 成功，`lib/` 随提交入库。
- 生产部署：`git reset --hard origin/master`（`c26e7ee47`）+ `pm2 restart vendure`；启动日志：`运力预警已启动：每 5 分钟扫描，冷却 30 分钟，阈值 无骑手≥1 单 / 紧张≥5 单且≤2 人，渠道 全部`。
- 端到端自检（生产，临时收紧阈值后已还原）：`CAPACITY_ALERT_CHANNELS=canteen-a`、`TIGHT_BACKLOG=0`、`TIGHT_RIDERS=99`、首跑 5s、冷却 5 分钟 → 12:13 触发 `[CampusCapacity] 运力预警 channel=113(canteen-a) severity=warning backlog=0 oldest=0min riders=0 delivered=true`，飞书平台群实际收到告警；随后移除自检 env 并重启，日志恢复默认阈值，`shop-api` 400（正常探针）。
- 恢复通知、升级绕过冷却、失败不占冷却、渠道白名单、未启用降级、env 解析、看板链接拼接均由单测覆盖（生产当前无「告警→恢复」天然数据，未造单验证）。
- 涉及文件：`capacity-alert.job.ts`、`feishu/feishu.client.ts`（`broadcast` 新增 `channel` 定向 + 无命退回 webhook）、`feishu/feishu-notify.service.ts`（`pushEvent/push` 新增 `target`，暴露 `enabled`）；新增 `capacity-alert.job.spec.ts`。

## 42. 配送体系 P2/P3 六项收口（2026-10-25）

### 42.1 交付清单

| # | 能力 | 后端（vendure） | C 端（waimai） | 后台（vshop/web-admin） |
|---|---|---|---|---|
| P2-1 | 工单/申诉全链路提醒 | `campusReplySupportTicket` / `campusReviewRiderAppeal` 后推飞书（`support_ticket` / `rider_appeal`）+ 站内信（`Message` + `MessageDelivery`，失败静默降级） | 工单页/申诉页展示回复与审核意见 | 运营中心「客服工单/骑手申诉」tab 红点 + 60s 轮询刷新 |
| P2-2 | 提现打款留痕 | 提现实体新增 `payoutRef` / `payoutProof`；`approveRiderWithdraw` 必填流水号（空白报「请填写打款流水号」）；启动幂等补列 | 钱包「提现记录」PAID 行展示「流水号 xxx」；流水查询含 `payoutRef` | 提现审核页「通过」弹窗顺序填写流水号 + 凭证 URL；PAID 卡片展示流水号 |
| P3-1 | 班次与接单联动 | 店铺配置 `shiftCheckEnabled`；`hall-grab.service` 抢单前 `assertShiftAllowed`（跨零点排班支持；强派单不拦） | 抢单失败提示后端文案 | 拾光达配置「履约参数」新增「班次校验」开关 |
| P3-2 | 黑名单自动规则 + 批量导入 | 订单转 `Cancelled` 写 `campusCancelCause`（shop=customer，其余=system/ops）；`blacklist-scan.job` 每 6h（首跑 120s）按店铺阈值扫描近 30 天主动取消，命中自动拉黑并推飞书 `blacklist_auto`；`campusImportBlacklist`（≤500 条、手机号/用户分类计数） | — | 「黑名单」tab 新增「批量导入黑名单」卡片（按类型逐行解析，完成后提示 新增/跳过/无效）；配置页新增「自动拉黑阈值（次）」，0=关闭 |
| P3-3 | 骑手评价明细 | `campusMyRiderReviews(skip,take)` 仅返回当前登录骑手本人评价（渠道隔离） | 骑手大厅均分下方展示最近 5 条：星级/标签/留言/时间（`MM-DD HH:mm`） | — |
| P3-4 | 飞书/短信配置核对 | 飞书支持平台群 + 店铺群定向（§41）；短信适配器 env 未配置静默跳过 | — | — |

### 42.2 数据库变更（启动幂等迁移 `AddWithdrawPayoutMigration`）

```sql
ALTER TABLE rider_withdrawal_request ADD COLUMN IF NOT EXISTS "payoutRef" varchar(255);
ALTER TABLE rider_withdrawal_request ADD COLUMN IF NOT EXISTS "payoutProof" varchar(255);
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "shiftCheckEnabled" boolean DEFAULT false;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "blacklistAutoCancelCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsCampuscancelcause" varchar(255);
```

> customFields 在 PG 中是独立列（非 JSON）；列名按 TypeORM 实际生成名书写，已用 `information_schema.columns` 核对。

### 42.3 验证记录

- 单测：`packages/campus-delivery-plugin` `npm test` → **41 文件 / 533 用例全过**（新增 `blacklist-scan.job.spec.ts` 4 例、`support.service` 导入 4 例、提现/班次/评价相关断言）；`npm run build`（tsc）成功，`lib/` 随提交入库。
- 部署：vendure `90adc1cbc`（`git reset --hard origin/master` + `pm2 restart vendure --update-env`，online、启动无迁移报错）；web-admin `4ba0c3db`（`node scripts/deploy.mjs`，nginx reload OK）；waimai `eb25d48`（`node .secrets/deploy-waimai.mjs`，站点 200）。
- 生产库列核对：`campus_fulfillment_config.shiftCheckEnabled / blacklistAutoCancelCount`、`rider_withdrawal_request.payoutRef / payoutProof`、`order.customFieldsCampuscancelcause` 均存在。
- Schema 探针：`shop-api` 查询 `campusMyRiderReviews` 未登录返回 `FORBIDDEN`（字段存在而非 unknown field）；部署的 `lib` 含 `campusImportBlacklist` / `campusMyRiderReviews`。
- 生产实测（真数据）：
  - P2-2：骑手创建 ¥10 提现 → 后台通过并登记 `ALIPAY-20261025-0001` → 钱包「提现记录」显示「已打款 / 流水号 ALIPAY-20261025-0001」，可用余额 90→80 元、冻结归零。
  - P3-2：`campusImportBlacklist(type:"phone", values:["13800000000","abc","13800000001"])` 返回 `{added:2, skipped:0, invalid:1}`；后台黑名单列表出现两条「生效中」记录。
  - P3-3：骑手端 `campusMyRiderReviews` 返回 3 条评价（tags 为数组、按时间倒序），大厅显示均分 4.7 · 3 条评价 与逐条评价。
- 手机视口截图（390×844 dpr=2）：`docs/screenshots/waimai/p2p3/` 下 `01/02` 骑手大厅评价、`03` 钱包打款流水号、`04` 提现审核已打款、`05/06` 配置页班次校验与自动拉黑阈值、`07/08` 黑名单列表与批量导入卡片。
- 演示数据说明：P3-3 截图所需评价为**入库演示数据**（3 条，绑定历史已送达订单 273/274/275），黑名单两条为上述导入接口实测写入；如需清理：`DELETE FROM campus_rider_review WHERE "riderCustomerId"=150 AND "channelId"=113;`、`DELETE FROM campus_blacklist WHERE reason='批量导入线上验证';`。
- 已知：`waimai` 仓库 `tests/timeline.spec.ts`、`tests/store-display.spec.ts` 共 22 例为**历史遗留失败**（路线文案改名后用例期望未同步，涉及文件本轮未改动）；其余 7 个测试文件 114 例全过。

## 43. 配送体系全量审计补漏（P1 + P2 + P3 九项收口，2026-10-25）

### 43.1 交付清单

| # | 能力 | 后端（vendure） | C 端（waimai） | 后台（vshop/web-admin） |
|---|---|---|---|---|
| P1-1 | 提现打款失败回退 | 提现状态新增 `FAILED` + `failReason` 列；`adminMarkFailed` 以 `UPDATE ... WHERE status='PAID'` 原子认领后置 `FAILED`，再按默认渠道上下文 `addBalance` 退回余额；退回失败补偿恢复 `PAID` 并抛「退回失败」可重试；新增 admin mutation `campusMarkWithdrawFailed(id, reason)`（权限 `CampusAuditRider`，原因必填 ≤255 字符） | 提现记录展示 `FAILED` 徽标与失败原因 | 提现审核 PAID 卡片新增「标记打款失败」：弹窗必填原因 → 退回余额；FAILED 卡片展示失败原因 |
| P2-1 | 提现表冷启动建表 | 迁移 `AddWithdrawPayoutMigration` 补 `CREATE TABLE IF NOT EXISTS rider_withdrawal_request`（含全部列）与 `failReason` 补列；新环境/灾备不再因缺表导致 `ALTER` 失败 | — | — |
| P2-2 | 停用骑手回收在途任务 | `setRiderStatus` 非 `approved`（suspended/reset）时执行 `reclaimActiveTasks`：裸 SQL 把 `assigned/in_progress` 且 hallStatus 属活跃池的订单回 `open`，清空骑手/派单快照（已取消订单不动） | — | 骑手审核「停用/重置」即时生效，不再遗留悬挂任务 |
| P2-3 | 后台新增分区入口 | 复用既有 `campusCreateZone(name, fee)` | — | 楼栋坐标页「分区管理」面板底部新增「新增分区名称 + 运费(元) + 新增」，创建后刷新筛选列表 |
| P2-4 | 已支付未接单自助取消 | 后端 `cancel-guard.process` 口径不变（守卫既有） | 订单详情 `canCancel` 镜像守卫：`Created/AddingItems/ArrangingPayment` 可取消；已支付仅当未送达、`deliveryStatus` 非 `assigned/in_progress`、三方状态非 `accepted/pickup`、`hallStatus` 非 `grabbed/third_party/owned_dispatched/merchant_delivering` 时可取消 | — |
| P3-1 | 跑腿商品初始化入口 | 复用既有 `campusEnsureErrandProducts`（0 元载体，幂等） | — | 商品页提示卡片「初始化跑腿商品」，重复执行安全 |
| P3-2 | 骑手拒单入口 | 复用既有 `campusRejectAssignment`（校验本人 + `assigned` → 回厅 → 信用分 `CREDIT_REJECT`） | 配送页 assigned 任务（组内子单与独立卡）新增「拒单」：二次确认后回大厅并扣信用分 | — |
| P3-3 | Schema drift 噪音清理 | 6 个实体补 7 个具名 `@Index`（`idx_campus_*`，与库内索引同名），启动日志不再输出 campus 相关 `DROP INDEX` | — | — |
| P3-4 | 短信兜底通道说明 | `CampusSmsService` 仅在 env 齐备时启用（见 43.3） | — | — |

### 43.2 数据库变更（启动幂等迁移 `AddWithdrawPayoutMigration`）

```sql
CREATE TABLE IF NOT EXISTS rider_withdrawal_request (...);  -- 历史缺失，本轮补建（全部列，含 reviewedAt/failReason）
ALTER TABLE rider_withdrawal_request ADD COLUMN IF NOT EXISTS "failReason" varchar(255);
```

> 迁移**未新增索引**：实体已声明 `@Index(['channelId','status'])` 由 TypeORM 自动命名，迁移里再 `CREATE INDEX` 会制造新的 drift。

### 43.3 短信通道配置说明（未配置即静默跳过）

- 启用条件：`SMS_GATEWAY_URL` 与 `SMS_GATEWAY_KEY` 同时存在；缺任一 → `configured=false`，`send()` 直接返回 false，**不伪造发送成功、不阻塞业务主流程**（公众号模板消息仍是第 1 通道）。
- 网关契约：`POST {SMS_GATEWAY_URL}`，Header `Authorization: Bearer {SMS_GATEWAY_KEY}`，body `{ phone, content, signName }`，2xx 视为成功；超时 8s，失败仅 `Logger.warn` 留痕。
- 可选变量：`SMS_SIGN_NAME`（短信签名，缺省空串）。
- 落地方式：写入 `packages/dev-server/.env` 后 `pm2 restart vendure --update-env`（改环境变量必须带 `--update-env`）。
- 现状：生产未配置短信网关，通知仅走公众号模板消息 + 站内信，属预期行为。

### 43.4 验证记录

- 单测：`packages/campus-delivery-plugin` `npm test` → **41 文件 / 538 用例全过**（新增 5 例 `adminMarkFailed`：原因必填、仅 PAID 可回退、成功退回、并发 `affected=0`、退回失败补偿；`rider.service.spec` 补 `rawConnection` mock）；`npm run build`（tsc）成功，`lib/` 随提交入库。
- 部署：vendure `bdc6f6f91`、web-admin `1bddcf8a`、waimai `2ab3b38`（三仓库均已推送 `origin/master`；vendure 服务器 `git reset --hard origin/master` + `pm2 restart vendure --update-env`，online）。
- 启动日志：最新一轮启动**无 campus `DROP INDEX`**（原 7 条已消失；coupon/in_store_bill 等非本轮范围仍在）；无新增报错（`CJKPlugin 默认数据初始化失败 duplicate key` 为 3:44 / 4:00 / 4:46 多次复现的历史问题，与本轮无关）。
- 生产库核对：`rider_withdrawal_request` 含 `failReason / payoutRef / payoutProof / status`；7 个 `idx_campus_*` 索引均在库；迁移未产生多余索引。
- Schema 探针：admin-api `mutation campusMarkWithdrawFailed` 未授权返回 `FORBIDDEN`（字段存在，非 unknown field）。
- 手机视口截图（390×844 dpr=2，`docs/screenshots/waimai/p8/`）：`01` 提现审核（待审）、`02` 已打款 tab 展示「标记打款失败」按钮、`03b` 楼栋页「分区管理」展开后的新增分区行（名称/运费/新增）、`04` 商品页「初始化跑腿商品」卡片；页面 console 无错误。
- 未做线上破坏性验证：打款失败回退会真实改动骑手余额，故仅以 5 例单测覆盖；如需演练，可在测试渠道对一笔 PAID 申请执行。
- 待核实（本轮未改动）：① 骑手分成明细缺 admin 台账查询；② 骑手位置仅实时上报、无轨迹留存。（已在本手册 §44 收口）

## 44. 配送体系补漏：骑手分成台账 + 骑手轨迹留存（2026-10-25）

### 44.1 交付清单

| # | 能力 | 后端（vendure） | 后台（vshop/web-admin） |
|---|---|---|---|
| P8-4-1 | 骑手分成台账（admin） | 新增只读 `RiderLedgerService.earningsLedger` + Query `campusRiderEarnings(from,to,riderCustomerId,status,orderCode,skip,take)`（权限 `CampusAuditRider`）；按渠道隔离，日期/骑手/状态/订单号筛选，返回当页明细 + 全量合计；写入侧（`RiderTaskService`）不变 | 新增页 `pages/campus/rider-earnings`（菜单「骑手分成台账」，tier 2）：筛选（起止日期 / 骑手 / 状态 chips / 订单号）+ 汇总条（合计分成 / 笔数 / 其中小费）+ 卡片流（骑手名、金额、订单号、小费、状态标签、时间）+「查看该单轨迹 ›」 |
| P8-4-2 | 骑手轨迹落库 | 新增表 `campus_rider_location` + 实体 `CampusRiderLocation` + 幂等迁移 `AddRiderLocationMigration`；骑手上报实时位置时同事务外补一条 `INSERT ... SELECT ... WHERE NOT EXISTS`（同单 5s 去重，失败只告警不影响实时跟踪）；`DispatchJobService` 每 6h 清理 30 天前点位 | — |
| P8-4-3 | 轨迹查询（admin） | Query `campusOrderRiderTrack(orderId, orderCode)` 与 `campusRiderTrack(riderCustomerId, from, to)`（权限 `CampusViewDispatch`）；累计 haversine 距离、单次上限 5000 点 | 新增页 `pages/campus/rider-track`（菜单「骑手轨迹」，tier 1）：双 tab「按订单 / 按骑手时段」，汇总（点数 / 距离 / 时长）+ 归一化折线（起点绿 / 终点主色）+ 点位列表（最新在前）+ 30 天保留说明；从台账卡片可带订单号直达本页 |

### 44.2 接口与口径

- 分成口径：`amount = floor((配送费 + 小费) × 骑手分成比例 / 100)`，金额单位**分**；台账合计 `SUM(amount)`，小费单列仅为展示，不重复计入。
- 日期口径：`from` / `to` 为东八区自然日 `YYYY-MM-DD`，`to` 含当日 24:00；骑手时段区间上限 **31 天**，结束早于开始直接报错。
- 订单号：纯数字按 `orderId` 精确匹配，否则 `order.code ILIKE '%xx%'` 模糊；「按订单」轨迹先按订单号反查，并校验订单归属当前渠道，未命中报 `USER_INPUT_ERROR：订单不存在或不属于当前店铺`。
- 分成状态白名单：`credited`（已入账）/ `pending`（待入账）/ `crediting`（入账中）。
- 轨迹展示：单次最多 5000 点（`truncated` 标记），前端抽稀到 ≤300 段；折线按经纬度等比例缩放绘制，**非地图底图**（不依赖地图 SDK/密钥）。

### 44.3 数据库变更（启动幂等迁移）

```sql
CREATE TABLE IF NOT EXISTS campus_rider_location (
  id SERIAL PRIMARY KEY,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "channelId" int NOT NULL,
  "orderId" int NOT NULL,
  "riderCustomerId" int NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  "reportedAt" timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS idx_campus_rider_location_order ON campus_rider_location ("orderId", "reportedAt");
CREATE INDEX IF NOT EXISTS idx_campus_rider_location_rider ON campus_rider_location ("channelId", "riderCustomerId", "reportedAt");
CREATE INDEX IF NOT EXISTS idx_campus_rider_earning_channel_created ON rider_earning ("channelId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_campus_rider_earning_rider_created ON rider_earning ("riderCustomerId", "createdAt");
```

> 生产 `synchronize:false`，全部走 `OnApplicationBootstrap` + `IF NOT EXISTS`，重复启动安全；索引具名且与实体 `@Index` 同名，不产生 drift。

### 44.4 验证记录

- 单测：`packages/campus-delivery-plugin` `npm test` → **42 文件 / 546 用例全过**（新增 `rider-ledger.service.spec`，以及 `rider-task-extra.spec` 的轨迹 INSERT 断言）；`npm run build`（tsc）通过。
- 生产探针（超管）：
  - `campusRiderEarnings`（默认渠道，无筛选）→ `total=2, sumAmount=100, sumTip=100`，两条为 `#Y23RBC2Z9BU78X69`（骑手 148）/ `#ZW56SE6YGZ2YTXNK`（骑手 132）。
  - `campusOrderRiderTrack(orderCode:"__none__")` → `USER_INPUT_ERROR：订单不存在或不属于当前店铺`（渠道隔离与错误分支生效）。
  - 库表核对：`campus_rider_location` 与 `idx_campus_rider_location_order`、`idx_campus_rider_location_rider`、`idx_campus_rider_earning_channel_created`、`idx_campus_rider_earning_rider_created` 全部就位。
- 部署：vendure `b208393bb`（服务器 `git pull` + `pm2 restart vendure`，online）；web-admin `node scripts/deploy.mjs`（本地构建，产物约 60 MB，服务器解压 + `nginx -t`/reload 通过）。vshop 页面/菜单/i18n 与本文同批提交。
- 手机视口截图（390×844 dpr=2，`docs/screenshots/waimai/p8-ledger/`）：
  - `01-rider-earnings.png`：汇总条「¥1.00 合计分成 / 2 笔数 / ¥1.00 其中小费」，两张卡片含骑手名、`+¥金额`、订单号、状态徽标「已入账」、小费、时间与「查看该单轨迹 ›」，页面 console 无错误。
  - `02-rider-track-order.png`：按订单号 `ZW56SE6YGZ2YTXNK` 查得 10 点 / 0.54 km / 27 min，折线图 + 起点（绿）/终点图例 + 点位列表（最新在前），页面 console 无错误。
- 造数说明：截图用 10 个轨迹点为临时数据（订单 `ZW56SE6YGZ2YTXNK`，`id` 1–10），截图后已 `DELETE` 清空，`campus_rider_location` 当前 0 行；台账两条为真实历史分成流水。
- 权限提示：台账需 `CampusAuditRider`、轨迹需 `CampusViewDispatch`；`guoxinnanshan@163.com` 对同类既有接口 `riderApplications` 亦返回 `FORBIDDEN`，属账号授权范围，非接口缺陷。

## 45. 常用功能 P0 收尾：在线客服工作台 + 差评申诉审核（2026-10-26）

### 45.1 交付清单

| # | 能力 | 后端（vendure） | 后台（vshop/web-admin） |
|---|---|---|---|
| P0-3 | 在线客服 IM | `campus-delivery-plugin` 新增 `chat.entities.ts` / `chat.service.ts` / `chat-shop.resolver.ts` / `chat-admin.resolver.ts`：表 `campus_chat_conversation` + `campus_chat_message`；顾客 6 个方法（`campusMyChatConversations` / `campusStartChat` / `campusChatMessages` / `campusSendChatMessage` / `campusMarkChatRead` / `campusCloseChat`），后台 5 个方法（`campusChatConversations` / `campusChatUnread` / `campusAdminChatMessages` / `campusReplyChat` / `campusCloseChatConversation`） | 新增页 `pages/campus/chat`（菜单「在线客服」，tier 1，权限 `CampusDispatch`）：全部会话 / 待回复双 tab + 未读数、会话卡片（首字头像、订单号、最后一条、未读角标、已结束态）、全屏聊天面板（顾客/客服气泡、图片预览、输入框与发送、结束会话） |
| P0-4 | 差评申诉审核 | `review-plugin`：Review 扩展 `appealStatus / appealReason / appealImages / appealAt / appealResult / appealReviewedAt`；Query `reviewAppeals(options)`、Mutation `approveReviewAppeal` / `rejectReviewAppeal`；通过申诉置 `hidden` 并重算商品评分 | 评价管理新增第 5 个页签「差评申诉」：待审核 / 已通过 / 已驳回子筛选，卡片展示评价原文与图片、申诉理由与凭证、平台说明；待审核可「通过申诉 / 驳回申诉」（自绘弹窗：影响说明 + 审核说明选填）；普通页签卡片同步显示申诉留痕 |

### 45.2 接口与口径

- **会话复用**：`campusStartChat(orderCode?, subject?)` 按「顾客 + 订单号（或主题）+ status=open」复用同一条会话，避免重复开工单；结束会话后再次发起会新建一条。
- **未读双口径**：顾客侧 `unreadForCustomer` 在打开会话并 `campusMarkChatRead` 后清零；运营侧 `unreadForAdmin` 只在 `campusReplyChat` 后清零，语义为「待回复」，页面文案统一为「待回复 / Awaiting reply」。
- **轮询而非长连接**：两端均以 5s 间隔 `afterId` 增量拉取（`campusChatMessages` / `campusAdminChatMessages`，`take` 默认 200），会话列表同频静默刷新；`onHide` / `onUnload` 清理定时器。
- **消息体**：`senderType` 取 `customer | admin`；`content` 与 `images`（URL 数组）至少有一项；后台回复 `campusReplyChat(conversationId, content)`。
- **申诉状态机**：`pending`（待审核）→ `approved`（通过，评价 `status=hidden`，退出展示与评分聚合）/ `rejected`（驳回，评价维持原状，仅留痕）；`appealResult` 为平台说明，`appealReviewedAt` 为审核时间。
- **申诉入口门槛**（C 端）：仅主评、星级 ≤ 3、未隐藏/未删除，且当前无待审/已通过申诉时可提交；理由必填，凭证图最多 3 张。
- **权限**：客服工作台 `CampusDispatch`；评价与申诉沿用评价管理现有权限（`ReadOrder` / `UpdateOrder` 口径不变）。

### 45.3 数据库变更（启动幂等迁移）

> 本轮新增表与列均并入既有幂等迁移 `p8-p0-privacy-food-safety.ts`（`OnApplicationBootstrap` + `IF NOT EXISTS`），生产 `synchronize:false` 下重复启动安全。

```sql
CREATE TABLE IF NOT EXISTS campus_chat_conversation (
  id SERIAL PRIMARY KEY,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "channelId" int NOT NULL,
  "customerId" int NOT NULL,
  "orderCode" varchar,
  subject varchar,
  status varchar NOT NULL DEFAULT 'open',
  "lastMessage" text,
  "lastMessageAt" timestamptz,
  "lastSenderType" varchar,
  "unreadForCustomer" int NOT NULL DEFAULT 0,
  "unreadForAdmin" int NOT NULL DEFAULT 0,
  "closedAt" timestamptz);
CREATE TABLE IF NOT EXISTS campus_chat_message (
  id SERIAL PRIMARY KEY,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "conversationId" int NOT NULL,
  "senderType" varchar NOT NULL,
  "senderId" int,
  content text,
  images text,
  "readAt" timestamptz);
ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "appealStatus" varchar;
ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "appealReason" text;
ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "appealImages" text;
ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "appealAt" timestamptz;
ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "appealResult" text;
ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "appealReviewedAt" timestamptz;
```

### 45.4 验证记录

- 构建：`packages/campus-delivery-plugin`、`packages/review-plugin` 均以 `npx tsc -p ./tsconfig.build.json` 通过（根仓库全量 `pnpm build` 仍会因 `@vendure/dashboard` 失败，沿用只构建目标包的口径）；web-admin `pnpm build:h5` 通过（仅 Sass legacy API 弃用告警）。
- 手机视口截图（390×844 dpr=2，`docs/screenshots/waimai/p10-common-features/`，本地 dist 静态服务 + admin-api 全 mock）：
  - `01-admin-review-appeal-pending.png`：「差评申诉」页签选中，子筛选「待审核 / 已通过 / 已驳回」，2 张待审核申诉卡（星级、待审核徽标、评价原文与图、申诉理由、凭证图、通过/驳回申诉）。
  - `02-admin-review-appeal-modal.png`：自绘审核弹窗（标题「通过该申诉」、影响说明、审核说明输入框、取消/确定）。
  - `03-admin-chat-list.png`：会话列表 3 条（待回复 2 角标、已结束标记、共 3 个会话），tab 未读数「2」。
  - `04-admin-chat-panel.png`：聊天面板（顾客姓名、订单号 + 手机号、会话状态与「结束会话」、4 条气泡含 1 张图片、输入区与发送按钮），面板顶部已让出 H5 导航栏高度。
- 截图脚本：`node scripts/shots-p10-common-features.cjs`（本轮未部署，故本地静态服务 `dist/build/h5` 前缀 `/guanli/` + `page.route('**/admin-api')` 全 mock，预置 `wa_auth_token` / `wa_channel_token` / `wa_channel_code`）。

### 45.5 边界与已知限制

- **无长连接**：轮询口径在 5s 级别，极端并发下首屏/新消息最多延迟一轮；后续如需秒级可换 SSE。
- **会话不绑定单一订单**：`orderCode` 仅作展示与复用键，顾客从「帮助中心」发起的会话可无订单号。
- **申诉通过即隐藏**：`approved` 后评价 `status=hidden`，C 端列表不再展示且评分聚合剔除；如需恢复需人工改库（暂无「撤销通过」入口）。
- **审核说明选填**：留空时 `appealResult` 为 `null`，C 端不渲染「平台说明」行。
- **H5 原生 editable 弹窗不可用**：uni-app H5 下 `uni.showModal({ editable: true, content })` 内容与输入框重叠，故申诉审核改为页面内自绘弹窗（其余确认型弹窗仍用原生）。

> 同批 C 端（waimai-v39）交付：帮助中心/订单详情在线客服入口、客服会话页、我的评价差评申诉、店铺食安公示（见 `waimai-v39/docs/waimai-操作手册-常用功能.md` §147）。

### 45.6 部署记录（2026-10-26 已上线）

| 目标 | 方式 | 结果 |
|------|------|------|
| 后端（vendure） | 本地构建两个插件产物 → `git push` → 服务器 `git pull --ff-only` + `pm2 restart vendure --update-env` | `eb70db84a..4d382ce08` 快进成功，重启后 `↺189 online`；`/health` 返回 `{"status":"ok"}` |
| 后台（vshop/web-admin） | `node scripts/deploy.mjs`（本地 `build:h5` → 校验 61.4 MB → tar/scp → 解压 + `openresty -t && -s reload`） | nginx 语法检查通过并 reload，`https://www.yourbao.cn/guanli/` 返回 200 |
| C 端（waimai-v39） | `node .secrets/deploy-waimai.mjs`（本地 `build:h5` → 校验 3.6 MB → tar/scp → 解压） | `https://www.yourbao.cn/waimai/` 返回 200 |

幂等迁移已落地（生产 `synchronize:false`，靠 `OnApplicationBootstrap` 执行）：

- 新增表 `campus_chat_conversation`（`unreadForAdmin` / `unreadForCustomer` / `lastSenderType` / `status` / `orderCode`）、`campus_chat_message`（`images` / `readAt` / `senderType`）。
- `campus_fulfillment_config` 新增：`privacyNumberEnabled` / `privacyNumberProvider` / `privacyNumberPrefix` / `privacyNumberTtlMinutes`、`foodLicenseNo` / `foodLicenseImage` / `foodLicenseExpiry` / `foodSafetyGrade` / `foodSafetyCommitmentImage` / `kitchenLiveUrl` / `kitchenLiveEnabled`。
- `review` 新增：`appealStatus` / `appealReason` / `appealImages` / `appealAt` / `appealResult` / `appealReviewedBy` / `appealReviewedAt`。

GraphQL 字段在线核验（服务器本地 `curl`）：

- `shop-api` 新增 Query：`campusMyChatConversations`、`campusChatMessages`；Mutation：`campusStartChat`、`campusSendChatMessage`、`campusMarkChatRead`、`campusCloseChat`、`appealReview`。未带 token 请求返回 `FORBIDDEN`（字段存在，权限生效）。
- `admin-api` 新增 Query：`campusChatConversations`、`campusChatUnread`、`campusAdminChatMessages`、`reviewAppeals`；Mutation：`campusReplyChat`、`campusCloseChatConversation`、`approveReviewAppeal`、`rejectReviewAppeal`；`Review` 类型含全部 6 个 `appeal*` 字段。

## 46. P1-1 打包费 / 餐盒费（2026-10-26）

### 46.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | `campus_fulfillment_config` 新增 `packingFeeEnabled / packingFeeMode / packingFeeAmount / packingFeeCap / packingFeeLabel`；`Product` 自定义字段 `waimaiPackingFee`（单件覆盖价，`null`=沿用店铺）；新增 `packing-fee.ts`（`quotePackingFee` 纯函数，前后端同口径）与 `packing-fee.process.ts`（`OrderProcess`，进 `ArrangingPayment` 前落一条 `sku=campus-packing-fee` 的 surcharge） |
| 后台（web-admin） | 「校园配置」新增「打包费/餐盒费」区块（开关、计费方式、金额、单笔封顶、C 端展示名）；「商品管理」卡片 meta 显示打包费口径 + 「改打包费」底部 sheet（留空=店铺默认、填 0=本商品免收） |
| C 端（waimai-v39） | 结算页汇总新增打包费行（展示名取后台配置，空则「打包费」）；应付合计含打包费；详见 `waimai-v39/docs/waimai-操作手册-常用功能.md` §148 |

### 46.2 口径

- **两种计费方式**：`perItem` 按件累加（`Σ 单件价 × 件数`）；`perOrder` 每单固定金额。
- **商品级覆盖**：`waimaiPackingFee != null` 时用商品价替换店铺单件价（仅 `perItem` 生效）；`0` 表示该商品不收打包费。
- **封顶**：`packingFeeCap` 非空时最终金额取 `min(计算值, cap)`；配置时校验 `cap >= amount`。
- **落账时机**：订单进入 `ArrangingPayment` 前由 `campusPackingFeeProcess` 计算并写 surcharge；同一订单重复进入会先按 `sku` 删旧再加新，幂等。
- **跑腿单豁免**：`customFields.orderKind === 'errand'` 直接跳过，不收打包费。
- **结算口径一致**：surcharge 参与 `totalWithTax`，与页面展示同源，不存在「页面显示但不计入实付」。

### 46.3 权限与校验

- 配置写入口沿用「校园配置」既有权限；商品级改价走新增 mutation `campusMerchantSetProductPackingFee(productId, packingFee)`，权限 `CampusMerchant`。
- 金额范围：`packingFeeAmount` 0~100000 分、`packingFeeCap` 0~1000000 分；开启打包费但金额 ≤ 0 时后台保存报错。
- 计费方式白名单校验（非 `perItem`/`perOrder` 落回 `perItem`）。

### 46.4 数据库变更（启动幂等迁移 `P8P1PackingFeeMigration`）

```sql
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "packingFeeEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "packingFeeMode" varchar(16) NOT NULL DEFAULT 'perItem';
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "packingFeeAmount" int NOT NULL DEFAULT 0;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "packingFeeCap" int;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "packingFeeLabel" varchar(32);
ALTER TABLE product ADD COLUMN IF NOT EXISTS "customFieldsWaimaipackingfee" int;
```

> 与 P0 一致：生产 `synchronize:false`，全部由 `OnApplicationBootstrap` + `IF NOT EXISTS` 保证重复启动安全。

### 46.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0）；web-admin `npm run build:h5` 通过。
- 手机视口截图（390×844 dpr=2，`docs/screenshots/waimai/p11-packing-fee/`，本地 dist 静态服务 + admin-api 全 mock）：
  - `05-admin-config-packing-section.png`：「打包费/餐盒费」区块展开态——「已开启打包费」、计费方式「按件累加 / 每单固定」、打包费金额 0.5、单笔封顶 1、C 端展示名称「餐盒费」。
  - `06-admin-product-packing-sheet.png`：商品卡片三口径（`¥1.00` / `店铺默认` / `¥0.00`）+ 底部「商品打包费」sheet（提示「留空 = 沿用店铺配置，填 0 = 不收打包费」、输入框、清除/保存）。
- 截图脚本：`node scripts/shots-p11-packing-fee.cjs`。

### 46.6 边界与已知限制

- **仅影响新单**：打包费在进入支付前计算，已创建的订单与已支付订单不会补收。
- **不参与优惠**：打包费为 surcharge，不进入满减/券的可优惠金额计算（与运费同口径）。
- **按件口径的件数**：取订单行 `quantity` 累加，不含加料/套餐子项（待 P1-2 套餐落地后统一）。
- **未做按商品分类差异计费**：当前只有店铺级默认 + 商品级覆盖两级。

### 46.7 部署记录（2026-10-26 已上线）

| 目标 | 方式 | 结果 |
|------|------|------|
| 后端（vendure） | 本地构建插件产物 → `git push` → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env` | `bc9b0c4c9` 首次部署**启动失败**（`Mutation.campusMerchantSetProductPackingFee defined in resolvers, but not in schema` —— 该 mutation 被误写进 `extend type Query`），修正后 `2dc29eed7` 重启，`Nest application successfully started`、pm2 online |
| 后台（vshop/web-admin） | `node scripts/deploy.mjs` | 产物校验 61441 KB，`openresty -t` 通过并 reload |
| C 端（waimai-v39） | `node .secrets/deploy-waimai.mjs` | 产物校验 3639 KB，解压完成 |

线上核验（服务器本地 `curl`）：

- `https://www.yourbao.cn/waimai/` → 200；`https://www.yourbao.cn/guanli/` → 200；`shop-api` 正常应答。
- `admin-api` 内省 `CampusStoreConfigWithChannel` 已含 `packingFeeEnabled / packingFeeMode / packingFeeAmount / packingFeeCap / packingFeeLabel`；`Mutation.campusMerchantSetProductPackingFee` 已上线。
- 幂等迁移建列核验（`information_schema`）：`campus_fulfillment_config` 的 5 个 `packingFee*` 列、`product.customFieldsWaimaipackingfee` 均已存在，`product` 表列数 36。

> 教训：Vendure 的 `adminApiExtensions` 中 `extend type Query` 与 `extend type Mutation` 是两个独立块，新增 mutation 必须落在 `extend type Mutation` 内；否则启动期 GraphQL schema 校验直接失败，进程 crash-loop（本次靠 `~/.pm2/logs/vendure-out.log` 定位）。

## 47. P1-2 加料/小料 + 套餐/组合商品（2026-10-26）

### 47.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | `Product` 新增自定义字段 `waimaiAddonGroups`（加料组 JSON）、`waimaiCombo`（套餐内容 JSON）；`OrderLine` 新增 `waimaiAddons`（加料引用 JSON）；新增 `addon-fee.ts`（解析/白名单校验/计价纯函数）与 `addon-fee.process.ts`（`campusAddonFeeProcess`，进 `ArrangingPayment` 前落 `sku=campus-addon-fee` 的 surcharge）；`merchant-admin` 新增 `campusMerchantSetProductAddonGroups` / `campusMerchantSetProductCombo` |
| 后台（web-admin） | 「商品管理」卡片新增「改加料 N」「改套餐 M」入口；两个底部 sheet：加料组（组名/最少选/最多选/选项名/加价元，最多 5 组、每组 12 项）与套餐内容（套餐名/单品名/份数/参考价，最多 20 项） |
| C 端（waimai-v39） | 规格弹层展示套餐内容（含「立省」）与加料组多选（含加价、必选/最多提示、头部价格叠加）；购物车与订单详情行内展示加料；结算页新增「加料费」行并计入应付；详见 `waimai-v39/docs/waimai-操作手册-常用功能.md` §149 |

### 47.2 口径

- **加料只存引用**：`OrderLine.customFields.waimaiAddons` 仅保存 `[{ g: 组名, n: 选项名 }]`，**不存金额**；单价一律由服务端按商品当前 `waimaiAddonGroups` 解析，客户端传任意字符串都无法凭空产生费用。
- **合并语义**：Vendure 判定「同商品同行」时会比对 `customFields`，因此加料必须在 `addItemToOrder` 当次写入，避免先建空行再回写导致重复行。
- **计费**：单行加料费 = 该行已选加料的单份加价和 × 件数；订单级合计在进入 `ArrangingPayment` 前写成一条 surcharge（`sku=campus-addon-fee`），重复进入先按 sku 删旧再加新，幂等。
- **套餐仅展示**：`waimaiCombo` 用于 C 端展示「套餐含什么 / 立省多少」与后厨备餐参考，**不参与计价**；套装售价仍由商品自身价格决定。
- **清洗上限**：加料组 ≤5、每组选项 ≤12、单份加价 ≤1000 元、组名字数 ≤20；套餐单品 ≤20、份数 1~99。
- **跑腿单豁免**：`orderKind=errand` 不收加料费。

### 47.3 权限与校验

- 两个配置 mutation 均使用 `CampusPermissions.CampusMerchant`。
- 加料组保存校验：组数 ≤5、每组选项 ≤12、加价 0~100000 分、`min ≤ max ≤ 选项数`；套餐保存校验：单品 ≤20、单品名非空、参考价可空。
- 解析层容错：非法 JSON / 结构异常一律退空（不抛错），商品改配置后旧订单行上的失效引用会被白名单丢弃，不再计费。

### 47.4 数据库变更（启动幂等迁移 `P8P1AddonComboMigration`）

```sql
ALTER TABLE product ADD COLUMN IF NOT EXISTS "customFieldsWaimaiaddongroups" text;
ALTER TABLE product ADD COLUMN IF NOT EXISTS "customFieldsWaimaicombo" text;
ALTER TABLE order_line ADD COLUMN IF NOT EXISTS "customFieldsWaimaiaddons" text;
```

> 与 P1-1 同款：`OnApplicationBootstrap` + `IF NOT EXISTS`，重复启动安全。

### 47.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0，新增 `lib/src/addon-fee.*`、`lib/src/addon-fee.process.*`、`lib/src/migrations/p8-p1-2-addon-combo.*`）；web-admin `npm run build:h5` 通过；C 端 `npm run build:h5` 通过。
- 手机视口截图（390×844 dpr=2，`docs/screenshots/waimai/p12-addon-combo/`，本地 dist 静态服务 + admin-api 全 mock）：
  - `07-admin-products-addon-combo-entry.png`：商品卡片 meta 显示「改加料 2 / 改套餐 3」，无配置商品显示 0。
  - `08-admin-product-addon-sheet.png`：两组加料回填（加料：加蛋 ¥2.00 / 加辣免费 / 加芝士 ¥3.00；主食（必选 1）：米饭 / 馒头），最少选/最多选可编辑。
  - `09-admin-product-combo-sheet.png`：套餐名称「单人套餐」+ 3 个内含单品（宫保鸡丁 1×28.00 / 米饭 1×2.00 / 冰粉 1×6.00）。
- 截图脚本：`node scripts/shots-p12-addon-combo.cjs`。

### 47.6 边界与已知限制

- **不参与优惠**：加料费为 surcharge，不进入满减/券的可优惠金额计算。
- **仅影响新单**：配置变更只影响后续进支付流程的订单，已支付订单金额不变。
- **加料不支持独立库存**：加料不扣减库存、不单独沽清；依靠商品售罄统一控制。
- **套餐不拆行**：套餐内容不生成子订单行，后厨按套餐文案备餐；库存只按主商品扣减。

### 47.7 部署记录（2026-10-26）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `6273fa967 feat(campus): P1-2 套餐/组合商品 + 加料（小料）`（仅 `packages/campus-delivery-plugin`，含 `lib/` 产物）→ `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `[NestApplication] Nest application successfully started`；pm2 `vendure` online |
| 后端 | 幂等迁移校验：`product.customFieldsWaimaiaddongroups`、`product.customFieldsWaimaicombo`、`order_line.customFieldsWaimaiaddons` | 三列均已存在（重复启动无报错） |
| 后端 | admin-api 内省 | `campusMerchantSetProductAddonGroups`、`campusMerchantSetProductCombo` 均在 Mutation 列表（共 629 个） |
| 后端 | shop-api 内省 | `addItemToOrder` 已带 `customFields: OrderLineCustomFieldsInput`，其 `inputFields` 含 `waimaiAddons` |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61454 KB，解压后 nginx reload 成功；线上 `guanli/assets/index-C8Wc2nKM.js` 含「改加料 / 套餐内容」 |
| C 端 | `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs` | 产物校验 3648 KB，`deploy done`；线上 `yourbao/waimai/assets/index-jUVfrupl.js` 含「加料费」 |
| 线上 | `https://www.yourbao.cn/waimai/`、`https://www.yourbao.cn/guanli/` | 均 HTTP 200 |

> 说明：启动日志中 `[CJKPlugin] 默认数据初始化失败: duplicate key ...` 为既有噪声（每次重启均出现），不影响本项目功能。

操作入口：
- 商家/平台后台：校园外卖 → 商品管理 → 商品卡片「改加料 N」「改套餐 N」。
- C 端：店铺 → 商品 → 规格弹层（套餐卡片 + 加料组）→ 购物车/结算/订单详情展示「加料：xxx」与「加料费」。

## 48. P1-3 商家自助经营后台（2026-10-27）

### 48.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | `merchant-admin` 新增三个能力：`campusMerchantStoreProfile`（读营业时间/公告/电话/营业状态）、`campusMerchantUpdateStore`（自助改营业时间与门店资料）、`campusMerchantRevenue`（今日/近 7 日经营数据 + 逐日趋势）；GraphQL 新增 `MerchantStoreProfile`、`CampusMerchantRevenue*` 类型 |
| 后台（web-admin） | 新增页面「经营设置」（`pages/campus/store-settings`）：营业状态 pill（营业中/非营业时段/临时休息）+ 临时休息开关 + 营业时间输入（含 3 个预设）+ 店铺公告/联系电话 + 经营数据（今日/近 7 日分段、单量/营业额/客单价/取消退款、近 7 日柱状图）；商家工作台顶部新增「经营设置」入口条；菜单与导航标题、中英 i18n 同步 |
| C 端（waimai-v39） | **本轮无改动**：C 端店铺页的营业时间、`openNow` 营业状态、店铺公告本就消费 `Channel.customFields.waimaiBusinessHours` 与运营中心配置，商家自助修改后即时生效 |

### 48.2 口径

- **营业时间唯一源**：写入 `Channel.customFields.waimaiBusinessHours`，与打烊拦截（`order-gate.process.ts`）、C 端店铺页（`waimai-store.service.ts` 的 `businessHours` / `openNow`）同一数据源，**不由配置表另存一份**，避免两处口径漂移。
- **格式**：支持单时段 `10:00-22:00` 与多时段逗号分隔 `10:00-14:00,17:00-21:00`；支持跨零点 `18:00-02:00`；留空 = 全天营业。解析复用 `business-hours.ts`（UTC+8）。
- **营业状态判定**：`openNow = 在营业时段内 && !临时休息`；临时休息（`campusMerchantSetPaused`）优先于营业时间，恢复后自动按营业时间开闭店。
- **营业额口径**：只统计 `deliveryStatus = delivered` 且有 `deliveredAt` 的订单，**按送达日归帐**（跨零点订单计入实际送达当天），金额取 `totalWithTax`；客单价 = 营业额 / 已完成单量（四舍五入到分）。
- **取消退款口径**：`state = Cancelled` 的订单按**创建日**归帐，金额取取消时的 `totalWithTax`，不影响营业额分子。
- **统计范围**：仅本渠道（`order.channels` 含当前店铺）且 `customFields.hallStatus IS NOT NULL` 的校园外卖单；跑腿单不计入营业额。

### 48.3 权限与校验

- 三个接口均使用 `CampusPermissions.CampusMerchant`；页面由 `usePermGuard('CampusMerchant')` 把关，菜单项 `perm: 'CampusMerchant'`。
- `campusMerchantUpdateStore` 校验：营业时间长度 ≤100 字符；非空时必须能被 `parseBusinessHours` 解析，否则直接报「营业时间格式不正确，示例：10:00-22:00 或 10:00-14:00,17:00-21:00」。
- 仅改当前 `ctx.channelId` 对应渠道，跨店无法读写。
- 前端保存前做一次轻量正则预校验，避免明显格式错误打到后端。

### 48.4 数据库变更

无。营业时间沿用既有 `channel."customFieldsWaimaibusinesshours"` 列，公告/电话沿用配置表字段，本轮不新增表/列，也无需幂等迁移。

### 48.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0）；web-admin `npm run build:h5` 通过（`DONE Build complete.`，产物 61470 KB）。
- 手机视口截图（390×844 dpr=2，`docs/screenshots/waimai/p13-merchant-self-service/`，本地 dist 静态服务 + admin-api 全 mock）：
  - `01-admin-merchant-entry.png`：工作台顶栏后「经营设置 ›」入口，今日完成 23 单 / ¥684。
  - `02-admin-store-settings-today.png`：状态 pill「营业中」，营业时间回填 `10:00-14:00,17:00-21:00`，公告 18/500，电话回填，今日 KPI（23 单 / ¥684 / ¥29.74，取消 1 单 ¥26）。
  - `03-admin-store-settings-last7.png`：切到「近 7 日」后 KPI（156 单 / ¥4586 / ¥29.4，取消 5 单 ¥132）与 7 根逐日柱（528/745/612/892/689/436/684）。
  - `04-admin-store-settings-paused-edit.png`：临时休息开启后 pill 变「临时休息」、开关置灰橙，营业时间可编辑为 `18:00-02:00`。
- 截图脚本：`node scripts/shots-p13-store-settings.cjs`（mock 覆盖 `myTenantAccess` / `campusMerchantBoard` / `campusMerchantStoreProfile` / `campusMerchantRevenue` / `campusMerchantSetPaused` / `campusMerchantUpdateStore`）。
- 线上 schema：未登录请求 `campusMerchantStoreProfile`、`campusMerchantRevenue`、`campusMerchantUpdateStore` 均返回 `FORBIDDEN`（字段存在、仅缺权限），未出现「Cannot query field」。

### 48.6 边界与已知限制

- **不做商品编辑/分类排序**：商品上下架、沽清、加料、套餐已在「商品管理」页，完整商品资料仍走通用商品管理，不在本页重复。
- **不做评价回复**：评价回复与差评申诉审核已在评价管理完成。
- **不做结算/抽佣**：配置中无平台抽佣字段，经营数据只展示流水与单量，不做分账计算。
- **营业额不含未送达单**：待配送/配送中的订单不计入营业额，只计入取消统计（若取消）。
- **取消退款按创建日**：跨零点取消的订单可能落在前一日，与送达归日口径并存，看板会分别标注「取消退款」「退款金额」字段。

### 48.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `6f0d34e25 feat(campus): P1-3 商家自助经营（营业时间/门店资料/经营数据）`（仅 `packages/campus-delivery-plugin`，含 `lib/` 产物）→ `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `[NestApplication] Nest application successfully started`；pm2 `vendure` online |
| 后端 | 线上 admin-api 字段校验（未登录探针） | `campusMerchantStoreProfile` / `campusMerchantRevenue` / `campusMerchantUpdateStore` 均返回 `FORBIDDEN`，无 schema 校验错误 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61470 KB，解压后 nginx reload 成功；线上 `guanli/assets/pages-campus-store-settings.Dl66DGp_.js` 存在且含 `campusStoreSettings`，入口 bundle 含「经营设置」 |
| C 端 | 本轮无改动，不部署 | 沿用上一轮产物 |
| 线上 | `https://e.joho.cn/guanli/`（后台）、`https://www.yourbao.cn/waimai/`（C 端） | 均 HTTP 200 |

操作入口：
- 商家后台：校园外卖 → 商家接单（工作台）→ 顶部「经营设置」→ 营业状态/营业时间/门店信息/经营数据。
- C 端：店铺页顶部即时反映营业状态、营业时间与店铺公告，无需改动。

## 49. P1-4 云打印（飞鹅 / 易联云）+ KDS 出餐屏（2026-10-27）

### 49.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | 新增 `campus_print_job` 打印任务表 + `campus_fulfillment_config` 五个打印通道列（幂等迁移 `p8-p1-4-cloud-print-kds.ts`）；新增 `CloudPrintService`：`printOrder`（按订单出票并回写 `waimaiPrintedAt`）、`testPrint`（不绑定订单的连通性测试）、`recentJobs`（排障）、服务商签名直连（飞鹅 SHA1 / 易联云 MD5）；`merchant-admin` 新增 `kitchenQueue`（KDS 队列）与 `cloudPrint / cloudPrintTest / printJobs`；`acceptOrder` 在 `printMode = onAccepted` 且通道非本地时自动触发云端出票；GraphQL 新增 `CampusKitchenTicket / CampusKitchenQueue / CampusPrintResult / CampusPrintJob` 类型与 2 个 Query + 2 个 Mutation |
| 后台（web-admin） | 新增「出餐屏」页面（`pages/campus/kitchen`）：待接单 / 备餐中两列、10s 自动轮询（切走暂停）、等待时长分级（≥15min 橙 / ≥25min 红）、加料与备注直显、未出票徽标、一键「开始制作 / 出餐完成」；商家工作台顶部新增「出餐屏」入口；打印条按通道分流（本地 C-Lodop 沿用原链路、云通道显示「已配置/未配置」并提供「测试打印」），使用说明分本地/云端两套文案；拾光达配置 → 小票打印新增「打印通道 / 服务商账号 / 打印机编号 / 服务商密钥 / 打印联数」；菜单、导航标题、中英 i18n 同步 |
| C 端（waimai-v39） | **本轮无改动**：小票内容、订单状态机、加料展示均由既有链路提供，云打印只是把「谁来出票」从浏览器插件换成服务端直连 |

### 49.2 打印通道口径

- **`printProvider`**：`local`（默认，浏览器 C-Lodop，需收银电脑开着工作台）/ `feie`（飞鹅云）/ `yilianyun`（易联云）。白名单校验，非法值拒绝保存。
- **本地通道不变**：`merchant.vue` 仍走 `printReceipt58` + `campusMerchantMarkPrinted`，未配置 C-Lodop 时才提示重连；切到云通道后不再探测 Lodop。
- **云通道由服务端出票**：`campusMerchantCloudPrint(orderId)` → `CloudPrintService.printOrder` → 成功后写 `customFields.waimaiPrintedAt`（与本地通道同一「已出票」口径，KDS 未出票徽标、工作台未出票计数通用）。
- **自动打印时机**：`printMode = onPaid` 由前端在支付后队列触发（云通道调 mutation）；`printMode = onAccepted` 由后端 `acceptOrder` 直接触发，避免前端漏打。
- **失败不阻塞接单/出餐**：云打印异常一律收敛为 `{ ok: false, error }` 并落 `campus_print_job.status = failed`，接单、出餐流程照常推进，失败可在打印任务/工作台重试。
- **打印联数**：`printCopies` 1–5 整数，超范围回落 1。

### 49.3 服务商签名

| 服务商 | 端点 | 关键参数 | 成功判定 |
|---|---|---|---|
| 飞鹅 | `https://api.feieyun.cn/Api/Open/` | `apiname=Open_printMsg`、`sn`、`content`、`times`、`sig = SHA1(user + ukey + stime)` | `ret = 0` |
| 易联云 | `https://open-api.10ss.net/oauth/oauth`（取 token）+ `/print/index` | `client_id` + `client_secret` + `machine_code`、`sign = MD5(client_id + timestamp + client_secret)` | `error = 0` |

- 易联云 token 进程内缓存，`expires_in` 前 5 分钟失效重取，避免每单换 token。
- 所有外呼统一 8s 超时（`AbortController`），非 JSON 响应按失败处理并记 `errorMessage`。

### 49.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_fulfillment_config` | 新增 `printProvider varchar(16) NOT NULL DEFAULT 'local'`、`printAccount varchar(64)`、`printDeviceSn varchar(64)`、`printDeviceKey varchar(128)`、`printCopies int NOT NULL DEFAULT 1` |
| `campus_print_job`（新表） | `id / createdAt / updatedAt / orderId / channelId / provider / deviceSn / status / triggerType / copies / dryRun / errorMessage / durationMs / content`，索引 `IDX_campus_print_job_channel_created (channelId, createdAt DESC)` |

迁移形态：`OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`，重复启动安全；异常只打日志不阻断启动。

### 49.5 KDS 出餐屏口径

- **队列来源**：`hallStatus IN ('pending_merchant','accepted')` 的当前渠道订单，按 `createdAt` 升序出票；`pending` = 待接单，`cooking` = 备餐中。
- **等待时长**：从 `createdAt`（支付时间）起算到当前分钟；`≥ KDS_WARN_MINUTES(15)` → `warn`（橙），`≥ KDS_LATE_MINUTES(25)` → `late`（红底）。
- **票面内容**：单号、等待时长、送达楼栋/时段、下单时间、未出票徽标、每行「商品名 ×数量」+ 加料（`addonDisplayText` 快照）、备注。
- **操作与工作台同源**：开始制作 = `campusMerchantAcceptOrder`，出餐完成 = `campusMerchantCookingDone`，不存在第二套状态机。

### 49.6 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0，`lib/` 随提交入库）；web-admin `npx uni build` 通过（`DONE Build complete.`）。
- 截图（`docs/screenshots/waimai/p14-cloud-print-kds/`，本地 dist 静态服务 + admin-api 全 mock）：
  - `01-admin-merchant-cloud-print-entry.png`：打印条「自动打印：支付后出票 · 飞鹅云打印 · 已配置」+「测试打印 / 使用说明」，顶部新增「出餐屏（后厨大屏）›」入口。
  - `02-admin-kitchen-desktop.png`（1280×900）：两列 2 待接单 / 1 备餐中 / 1 超时；A2400007 已等 6 分钟（灰边）、A2400008 已等 18 分钟（橙边 + 未出票徽标 + 备注「少放盐，餐具两副」）、A2400006 已等 31 分钟（红底红边）；加料「+ 加辣 / 多花生」「+ 加饭」「+ 可乐 ×2」逐行展示。
  - `03-admin-kitchen-mobile.png`（390×844）：窄屏堆叠为单列，字号与按钮保持可点。
  - `04-admin-config-print-provider-cloud.png`：打印通道选中「飞鹅云」，回填账号 `feie-user-001`、SN、密钥（密文）、联数 2，三通道按钮完整可见。
  - `05-admin-config-print-provider-local.png`：切回「本地（C-Lodop）」后云字段整体隐藏，仅保留联数。
- 截图脚本：`node scripts/shots-p14-cloud-print-kds.cjs`（mock 覆盖 `campusMerchantBoard` / `campusMerchantKitchenQueue` / `campusMerchantPrintJobs` / `campusMerchantCloudPrint(Test)` / `campusMerchantAcceptOrder` / `campusMerchantCookingDone` / `campusStoreConfigs`）。
- 生产库核验（`information_schema`）：`campus_fulfillment_config` 的 `printProvider / printAccount / printDeviceSn / printDeviceKey / printCopies` 五列与 `campus_print_job` 表均已存在。
- 线上 schema：`admin-api` 未登录请求 `campusMerchantKitchenQueue { pendingCount cookingCount lateCount }`、`campusMerchantPrintJobs(limit: 1)` 返回授权错误（非「Cannot query field」），类型已生效。
- 线上产物：`guanli/assets/pages-campus-kitchen.CM1SMfyc.js`（6767B）、`kitchen-BDpvmxNE.css`（4398B）均 200；入口 bundle 含 `pages/campus/kitchen`、`campusKitchen`、`printChannelSection`。

### 49.7 边界与已知限制

- **飞鹅/易联云未联调真实打印机**：签名与参数按官方文档实现，本轮以「结构 + 失败收敛 + 任务留痕」为目标；真实设备需商家填自己的账号/SN/密钥后点「测试打印」验证。
- **云打印不含图片/二维码**：票面为纯文本（`<BR>` 换行、`<CB>` 店名、`<B>` 合计），不打印菜品图或取餐二维码。
- **不打补丁式重打队列**：工作台「补打」在云通道是重新调 `campusMerchantCloudPrint`，不做客户端排队重试（服务端已留任务记录）。
- **KDS 不做语音播报**：语音播报沿用工作台（新单提醒），出餐屏只做视觉提醒。
- **KDS 无自动接单**：待接单卡片必须人工点「开始制作」，避免误接单。

### 49.8 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `24964f16a feat(campus): P1-4 云打印（飞鹅/易联云）+ KDS 出餐屏`（`packages/campus-delivery-plugin` src + lib）→ `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `[NestApplication] Nest application successfully started`；pm2 `vendure` online；无迁移报错 |
| 后端 | 生产 PG（`1Panel-postgresql-pIe0`）`information_schema` 核验 | 5 个 `print*` 列 + `campus_print_job` 表存在 |
| 后端 | 线上 `admin-api` 字段探针（未登录） | `campusMerchantKitchenQueue` / `campusMerchantPrintJobs` 授权错误，schema 校验通过 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61492 KB，nginx reload 成功；`guanli/assets/pages-campus-kitchen.CM1SMfyc.js`、`kitchen-BDpvmxNE.css` 均 200 |
| C 端 | 本轮无改动，不部署 | 沿用上一轮产物 |
| 线上 | `https://e.joho.cn/guanli/`（后台）、`https://www.yourbao.cn/waimai/`（C 端） | 均 HTTP 200 |

操作入口：
- 打印通道：拾光达配置 → 展开店铺卡片 → 小票打印 → 打印通道（本地 / 飞鹅云 / 易联云）→ 填账号/设备编号/密钥/联数 → 保存。
- 连通性测试：商家接单（工作台）→ 顶部打印条「测试打印」。
- 出餐屏：商家接单（工作台）→ 顶部「出餐屏（后厨大屏）」→ 两列卡片点「开始制作 / 出餐完成」。

## 50. P2-1 小程序上架配置（2026-10-27）

### 50.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | `campus_fulfillment_config` 新增 6 个 `mp*` 列（幂等迁移 `p9-p2-mp-listing.ts`）；`WaimaiStoreService.updateStoreConfig` 增加 AppID/版本/隐私 URL 格式校验、上架状态白名单、「置为已上架前 6 项资料必须齐全」的强制校验；GraphQL `CampusStoreConfigWithChannel` 暴露 6 个配置字段与 2 个计算字段 `mpReady / mpMissing`，`CampusStoreConfigInput` 增加 6 个可空入参 |
| 后台（web-admin） | 拾光达配置 → 店铺卡片新增「小程序上架」区块：AppID / 服务类目 / 版本号 / 隐私保护指引地址 4 个输入 + 5 个上架状态胶囊（3+2 网格，窄屏不溢出）+ 审核备注 + 「上架前检查」6 项清单（实时 ✓/○，缺项时给出提示语）；保存前做 AppID/版本/隐私 URL 格式校验，状态选「已上架」而资料缺项时直接 toast 拦截；中英 i18n 各 30 个 key |
| C 端（waimai-v39） | **本轮无改动**：上架信息属运营侧资料，`WaimaiStore`（C 端店铺类型）有意不暴露 `mp*` 字段 |

### 50.2 上架前检查与状态口径

- **上架状态**（`mpListingStatus`，默认 `draft`）：`draft` 未提交 / `inReview` 审核中 / `online` 已上架 / `rejected` 审核驳回 / `offline` 已下架。白名单校验，非法值拒绝保存。
- **上架前检查 6 项**（key 与服务端 `mpMissing` 完全一致，前后端口径同源）：

| key | 取值来源 | 说明 |
|---|---|---|
| `appId` | `mpAppId` | 小程序 AppID，`wx` + 16 位十六进制 |
| `category` | `mpCategory` | 服务类目（如「餐饮/外卖」），≤64 字符 |
| `version` | `mpVersion` | 上架版本号，`x.y` 或 `x.y.z` |
| `privacyUrl` | `mpPrivacyUrl` | 用户隐私保护指引地址，http(s)，≤255 字符 |
| `contactPhone` | `storePhone` | **复用** P1-3 门店联系电话，不重复录入 |
| `licenseNo` | `foodLicenseNo` | **复用** 食安公示的食品经营许可证号 |

- **强制点**：保存时若 `mpListingStatus = online` 而检查项有缺，服务端抛 `UserInputError('上架前请先补齐：...')`，后台同口径 toast 拦截，避免「资料缺项却对外宣称已上架」。
- **计算字段**：`mpReady`（6 项是否齐全）、`mpMissing`（缺项 key 数组）随配置返回，供任何端复用，不必各自重算。

### 50.3 权限与校验

- **权限**：沿用 `CampusConfig`（后台页面 `usePermGuard('CampusConfig')`），未新增权限点；数据范围仍由 `campusStoreConfigs` 的渠道可见性决定（平台超管看全部渠道，租户只看本渠道）。
- **写入口**：后台配置页走 `WaimaiStoreService.updateStoreConfig`，未加入 `CampusConfigService` 的 `WRITABLE_FIELDS`（该路径服务于平台配置场景，小程序上架是运营资料，单入口即可）。
- **格式校验**：AppID `/^wx[0-9a-f]{16}$/i`；版本 `/^\d{1,3}(\.\d{1,3}){1,2}$/`；隐私 URL `/^https?:\/\/[^\s]+$/i` 且 ≤255；类目 ≤64；审核备注 ≤500。空串一律落库为 `NULL`（与既有可空字段口径一致）。

### 50.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_fulfillment_config` | 新增 `mpAppId varchar(64)`、`mpCategory varchar(64)`、`mpVersion varchar(32)`、`mpListingStatus varchar(16) NOT NULL DEFAULT 'draft'`、`mpPrivacyUrl varchar(255)`、`mpReviewNote varchar(500)` |

迁移形态：`OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS`，逐条执行、单条失败只打 `[P9P2MpListingMigration] failed:` 日志不阻断启动，重复启动安全。

### 50.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0，`lib/` 随提交入库）；web-admin `npx uni build` 通过（`DONE Build complete.`）。
- 截图（`docs/screenshots/waimai/p15-mp-listing/`，本地 dist 静态服务 + admin-api 全 mock）：
  - `01-admin-mp-listing-ready.png`：资料齐全 + 状态「已上架」，检查清单 6 项全 ✓，底部提示「资料齐全，可提交上架」。
  - `02-admin-mp-listing-missing.png`：AppID 与食品许可证缺失、状态为「未提交」，清单对应 2 项为 ○ 且提示缺项。
  - `03-admin-mp-listing-rejected.png`：状态「审核驳回」+ 审核备注回填驳回原因，5 个状态胶囊按 3+2 排布无横向溢出。
- 截图脚本：`node scripts/shots-p15-mp-listing.cjs`（mock 覆盖 `myTenantAccess` / `campusStoreConfigs` / `campusUpdateStoreConfig` / `me`）。
- 生产库核验（`information_schema`）：`campus_fulfillment_config` 的 `mpAppId / mpCategory / mpListingStatus / mpPrivacyUrl / mpReviewNote / mpVersion` 六列均已存在。
- 线上 schema：`admin-api` 未登录请求 `campusStoreConfigs { channelId mpAppId mpListingStatus mpReady mpMissing }` 返回 `FORBIDDEN`（非「Cannot query field」），字段已生效。
- 线上产物：`guanli/assets/campus.ArCLfqrv.js`（15433B）、`pages-campus-config.BogVdX2H.js`（66936B）均 200，`https://e.joho.cn/guanli/` 首页 200。

### 50.6 边界与已知限制

- **不调微信审核接口**：本项是「资料台账 + 上架前检查 + 审核状态留痕」，不自动提交微信审核、也不同步真实审核结果；状态需运营按后台/微信后台实际情况手工维护。
- **AppID 仅作记录**：不用于登录态、不校验与渠道微信配置是否一致（渠道 AppID 仍由既有微信登录配置维护）。
- **类目不做白名单**：微信服务类目由平台审核，这里只要求填写，不做枚举校验。
- **复用字段联动**：`contactPhone` 与 `licenseNo` 依赖 P1-3 门店电话与食安公示许可证号，改动这两处会同步影响上架检查结果（属于有意的单一数据源）。
- **C 端无感知**：小程序上架信息不进入 C 端任何接口，不影响店铺页/下单链路。

### 50.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `1f9cd48cc feat(campus): P2-1 小程序上架配置（上架前检查 + 审核状态留痕）`（`packages/campus-delivery-plugin` src + lib）→ `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `HEAD is now at 1f9cd48cc`；pm2 `vendure` online；无迁移报错 |
| 后端 | 生产 PG（`1Panel-postgresql-pIe0`）`information_schema` 核验 | 6 个 `mp*` 列存在 |
| 后端 | 线上 `admin-api` 字段探针（未登录） | `campusStoreConfigs` 返回 `FORBIDDEN`，schema 校验通过 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61500 KB，nginx reload 成功；`pages-campus-config` / `campus` chunk 均 200 |
| C 端 | 本轮无改动，不部署 | 沿用上一轮产物 |
| 线上 | `https://e.joho.cn/guanli/`（后台）、`https://www.yourbao.cn/waimai/`（C 端） | 均 HTTP 200 |

操作入口：
- 资料维护：拾光达配置 → 展开店铺卡片 → 「小程序上架」→ 填 AppID / 服务类目 / 版本号 / 隐私保护指引 → 选上架状态 →（审核驳回时）填审核备注 → 保存。
- 上架前自查：同区块底部「上架前检查」清单，✓ 为已具备、○ 为缺项；6 项全 ✓ 才能保存为「已上架」。

## 51. P2-2 语音/拍照搜索（2026-10-27）

### 51.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | 新增 `SearchAssistProvider` 抽象 + 内置 mock 实现（`search-assist.ts`）；`SearchAssistService` 按渠道读取服务商配置并统一收敛成「关键词」；`campus_fulfillment_config` 新增 2 列（幂等迁移 `p9-p2-search-assist.ts`）；shop-api 公开只读 Query `campusSearchAssist(type, payload)`；admin-api `CampusStoreConfigWithChannel` / `CampusStoreConfigInput` 暴露两个服务商字段，`updateStoreConfig` 加白名单校验 |
| 后台（web-admin） | 拾光达配置 → 店铺卡片新增「语音/拍照搜索」区块：语音搜索服务商、拍照搜索服务商两组胶囊（内置 mock / 未开启，标签独立一行、两等分不溢出）+ 说明文案；中英 i18n 各 6 个 key |
| C 端（waimai-v39） | 首页搜索栏右侧新增 🎤 / 📷 两个入口（`.assist-btn`）：点语音→识别中 toast→取关键词入框并直接搜索；点拍照→调起选图→识别→入框搜索；多关键词时 toast「识别到：A / B」，失败按服务端 `error` 或兜底文案提示；中英 i18n 各 4 个 key |

### 51.2 配置口径与识别契约

- **配置值**（`voiceSearchProvider` / `imageSearchProvider`，默认 `mock`）：

| 值 | 含义 |
|---|---|
| `mock` | 内置模拟识别：不调用任何外部服务，结果稳定可复现（联调 / 截图 / 回归用） |
| `none` | 入口关闭：C 端调用直接抛 `UserInputError`（语音=「店铺未开启语音搜索」，拍照=「店铺未开启拍照搜索」） |

- **白名单**：`SEARCH_ASSIST_PROVIDER_NAMES = ['mock', 'none']`，后台保存非白名单值直接拒绝；后续接入讯飞/微信同声传译/视觉识别时，只需新增 provider 实现并加入白名单与 `SEARCH_ASSIST_PROVIDERS` 注册表，**不改 GraphQL 契约、不改 C 端**。
- **返回结构** `CampusSearchAssistResult`：`ok / type / provider / text / keywords / latencyMs / error`，`keywords` 已由 `normalizeKeywords` 归一（去空白、去重、单词 ≤20 字、最多 4 个）。
- **异常口径**：识别过程中的失败一律收敛为 `{ ok:false, error }`（不抛异常，避免 C 端整页报错）；只有「类型非法 / 店铺未开启 / 服务商未注册」这类调用方错误才抛 `UserInputError`。
- **mock 取词规则**：payload 是可读文本（≤40 字、非 URL / base64 / 文件路径、无图片音频扩展名）→ 按 `,，、;；空白` 切词；否则（URL、`blob:`、`wxfile://`、系统路径、空）→ 用 `type:payload` 稳定哈希从 10 词品类库取 1–2 个词，保证同一输入结果恒定。
- **C 端行为**：识别结果只消费 `keywords[0]` 触发 `pickWord` → 写入搜索历史 + 跨店商品搜索；多词时先 toast 提示其余关键词，不阻塞搜索。

### 51.3 权限与校验

- **读**：`campusSearchAssist` 为 `@Allow(Permission.Public)` 公开只读，无需登录（C 端首页未登录也可用语音/拍照搜索）。
- **配置读**：服务端按 `ctx.channelId` 读 `campus_fulfillment_config`，渠道间互不影响；无配置行时回落 `mock`。
- **写**：沿用 `CampusConfig` 权限（后台 `usePermGuard('CampusConfig')`），写入口仍是 `WaimaiStoreService.updateStoreConfig`，新增两字段白名单校验，未新增权限点。
- **不限流**：本轮 mock 无外部成本，未加频控；接真实服务商时需在 provider 侧或网关侧追加限流/配额（见 51.6）。

### 51.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_fulfillment_config` | 新增 `voiceSearchProvider varchar(16) NOT NULL DEFAULT 'mock'`、`imageSearchProvider varchar(16) NOT NULL DEFAULT 'mock'` |

迁移形态：`OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS`，逐条执行、单条失败只打 `[P9P2SearchAssistMigration] failed:` 日志不阻断启动，重复启动安全。

### 51.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0，`lib/` 随提交入库）；web-admin `npx uni build` 通过；C 端 `npx uni build` 通过（`DONE Build complete.`）。
- 后台截图（`docs/screenshots/waimai/p16-search-assist/`，本地 dist 静态服务 + admin-api 全 mock，脚本 `web-admin/scripts/shots-p16-search-assist.cjs`）：
  - `01-admin-search-assist-both-on.png`：语音 / 拍照均为「内置 mock」，两组胶囊各占一行、标签独立成行不换行。
  - `02-admin-search-assist-image-off.png`：拍照搜索切到「未开启」，语音仍为「内置 mock」，两行选中态互不影响。
- C 端截图（`docs/screenshots/p16-search-assist/`，本地 dist 静态服务 + shop-api 全 mock，脚本 `.secrets/p16-search-assist-shots.cjs`）：
  - `01-home-search-assist-entry.png`：首页搜索栏右侧 🎤 / 📷 两个圆形入口。
  - `02-home-voice-search-result.png`：点 🎤 识别出「宫保鸡丁」→ 关键词入框 + 跨店商品「商品」结果 2 条（两家店）。
  - `03-home-image-search-keywords.png`：点 📷 模拟选图 → 识别出「炸鸡 / 汉堡」→ 取首词「炸鸡」入框，命中无结果时展示「是不是想找 / 换个品类试试」兜底。
- 生产库核验（`information_schema`）：`campus_fulfillment_config` 的 `voiceSearchProvider / imageSearchProvider` 两列均已存在。
- 线上 shop-api 探针（`https://www.yourbao.cn/shop-api`，未登录）：
  - `campusSearchAssist(type: "voice")` → `{"ok":true,"provider":"mock","keywords":["麻辣烫","奶茶"]}`
  - `campusSearchAssist(type: "image", payload: "dish.png")` → `keywords:["凉拌黄瓜","香菇滑鸡饭"]`（修复后不再回显文件名）
- 线上产物：`guanli/assets/pages-campus-config.Cnv8HkCf.js`（68307B）、`campus.F95msgkb.js`（15473B）均 200，`https://e.joho.cn/guanli/` 首页 200。

### 51.6 边界与已知限制

- **只有 mock**：本轮不接真实 ASR/OCR，识别结果与真实语音/图片无关；`text` 字段仅用于回显。
- **payload 不上传**：C 端把选图/录音的本地地址直接作为 `payload` 传入，服务端 mock 不会下载或存储该文件；接真实服务商时需改为「先上传取 URL，再传 URL」。
- **不限流不限大小**：GraphQL 入参 `payload` 未做长度硬限制（mock 内部只用前 40 字判断文本），接真实服务商前必须补大小/时长限制与频控。
- **入口始终展示**：C 端不查询「店铺是否开启」，由服务端 `none` 抛错后在 C 端 toast 提示；若需隐藏入口，需新增一个公开只读的开关查询。
- **关键词质量**：mock 词库固定 10 个外卖品类词，只为联调可对齐，不代表识别准确率。

### 51.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `29694c129 feat(campus): P2-2 语音/拍照搜索（Provider 抽象 + mock + 渠道级开关）` + `ff07af399 fix(campus): P2-2 mock 识别不再把文件路径/URL 当关键词`（`packages/campus-delivery-plugin` src + lib）→ `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `HEAD is now at ff07af399`；pm2 `vendure` online；无迁移报错 |
| 后端 | 生产 PG（`1Panel-postgresql-pIe0`）`information_schema` 核验 | `voiceSearchProvider / imageSearchProvider` 两列存在 |
| 后端 | 线上 `shop-api` 探针（未登录，voice / image 各一次） | 均 `ok:true`，`provider:"mock"`，关键词为词库词 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61503 KB，nginx reload 成功；`pages-campus-config` / `campus` chunk 均 200 |
| C 端 | `cd D:\zhao\waimai-v39 && npx uni build` → `node .secrets/deploy-waimai.mjs` | 构建 `DONE Build complete.`；部署脚本返回成功 |
| 线上 | `https://e.joho.cn/guanli/`（后台）、`https://www.yourbao.cn/waimai/`（C 端） | 均 HTTP 200 |

操作入口：
- 服务商配置：拾光达配置 → 展开店铺卡片 → 「语音/拍照搜索」→ 两个服务商各选「内置 mock / 未开启」→ 保存。
- C 端使用：首页搜索栏右侧 🎤（语音）/ 📷（拍照）→ 识别出的关键词自动入框并直接搜索。

## 52. P2-3 广告位与商家自助投放计费（2026-10-27）

### 52.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | 新增实体 `CampusAdCampaign`（表 `campus_ad_campaign`）+ `ad-slots.ts`（广告位定义 / 报价 / 状态视图）+ `CampusAdService` + admin/shop 两套 resolver；admin-api 新增 `campusAdSlots` / `campusMerchantAds` / `campusAdCampaigns` 与 `campusMerchantCreateAd` / `campusMerchantPayAd` / `campusMerchantCancelAd` / `campusReviewAd`；shop-api 新增公开只读 `campusActiveAds(slot)`；幂等建表迁移 `p9-p3-ad-campaign.ts` |
| 后台（web-admin） | 新增页面 `/pages/campus/ads`「广告投放」，双 tab：我的投放（商家自助）/ 平台审核（平台）；含广告位选择、标题、起止日期、图片地址、跳转链接、实时报价、下单/支付/取消，以及平台侧筛选 + 通过/驳回（驳回必填原因）；侧边菜单项「广告投放」（商家或平台任一权限可见）；中英 i18n 各约 50 个 key |
| C 端（waimai-v39） | 首页新增 `.ad-banner` 横滑广告区（在投广告，最多 3 条）；店铺页顶部新增 `.shop-ad` 广告条；无图时降级为主题色文字卡；均展示「推广」标签 + 标题 +「至 YYYY-MM-DD」；点击按链接类型跳 webview 或站内页；中英 i18n 各 2 个 key |

### 52.2 计费与状态口径

- **广告位与单价**（`ad-slots.ts`，分/天，写死在代码里；后续调价只影响新单）：

| code | 名称 | 单价 |
|---|---|---|
| `homeBanner` | 首页横幅 | ¥15.00 / 天（1500 分） |
| `shopTop` | 店铺页顶部 | ¥8.00 / 天（800 分） |

- **报价规则**：天数含首尾（`end - start + 1`），1 ~ 90 天；`end < start`、日期非 `YYYY-MM-DD`、超过 90 天、广告位不在白名单，一律 `UserInputError`。总价 = 天数 × 单价，**下单即固化** `unitPriceFen / totalFen` 到投放单上。
- **状态机**：`pendingPay`（下单）→ 支付 → `pendingReview`（待审核）→ 通过 `running` / 驳回 `rejected`；`pendingPay | pendingReview` 可 `cancelled`；`running` 且已过结束日 → 对外视图改写为 `finished`（**不落库**，按 `campusDayKey` 实时判定，无需定时任务）。
- **素材校验**：标题 1~40 字；`imageUrl` 必须 `http(s)://` 且 ≤512 字；`linkUrl` 必须 `http(s)://` 或 `/pages/` 开头且 ≤255 字；审核备注 ≤200 字，驳回必填。
- **展示规则（C 端）**：仅 `status = running` 且 `startDate <= 今天 <= endDate` 的广告；同一广告位按 `totalFen DESC, createdAt ASC` 取前 3 条；返回精简字段（`id/slot/title/imageUrl/linkUrl/endDate`）。
- **模拟支付**：`pay` 生成 `ADPAY-<时间戳>-<随机 4 位>` 流水号并写 `paidAt`；对已支付/投放中/已结束重复调用幂等返回，不重复扣费（本轮未接真实支付渠道）。

### 52.3 权限与校验

- **商家侧**（`CampusMerchant`）：`campusAdSlots` / `campusMerchantAds` / 下单 / 支付 / 取消，一律按 `ctx.channelId` 隔离，只能看到与操作本渠道投放单（`findOwn` 同时校验 id + channelId）。
- **平台侧**（`CampusConfig`）：`campusAdCampaigns(status, channelId)` 默认本渠道、可指定渠道，`take 200`，状态过滤在内存完成（`finished` 是派生态，SQL 无法直接过滤）；`campusReviewAd` 仅 `pendingReview` 可审。
- **C 端**：`campusActiveAds` 为 `@Allow(Permission.Public)`，未登录可读；只返回投放窗口内的精简字段，不暴露价格、审核备注、支付流水。
- **菜单权限**：`constants/menus.ts` 的 `perm` 由 `string` 扩展为 `string | string[]`（任一命中即可），「广告投放」配置为 `['CampusMerchant','CampusConfig']`，商家与平台账号都能看到入口；页面内再按权限显隐 tab。

### 52.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_ad_campaign`（新建） | `id`、`createdAt`、`updatedAt`、`channelId`、`slot`、`title`、`imageUrl`、`linkUrl`、`startDate`（date）、`endDate`（date）、`days`、`unitPriceFen`、`totalFen`、`status`、`payRef`、`paidAt`、`reviewNote`、`reviewedBy`、`reviewedAt`、`createdBy`，共 20 列 |
| 索引 | `idx_campus_ad_channel_slot (channelId, slot, status)` |

迁移形态：`OnApplicationBootstrap` + `CREATE TABLE / CREATE INDEX IF NOT EXISTS`，语句逐条执行、单条失败只打 `[P9P3AdCampaignMigration] failed:` 日志不阻断启动，重复启动安全（生产 `synchronize: false`）。

### 52.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0，`lib/` 随提交入库）；web-admin `node scripts/deploy.mjs` 内含 `npm run build:h5` 通过；C 端 `npx uni build` 通过（`DONE Build complete.`）。
- 后台截图（`docs/screenshots/waimai/p17-ads/`，本地 dist 静态服务 + admin-api 全 mock，脚本 `web-admin/scripts/shots-p17-ads.cjs`）：
  - `01-admin-ads-merchant.png`：我的投放 tab，广告位/标题/日期/报价（`3 天 × 单价 = ¥45.00`）表单 + 4 张投放单卡（待支付 / 待审核 / 投放中 / 已驳回），对应按钮为「去支付 / 取消投放」或仅展示状态。
  - `02-admin-ads-review-reject.png`：平台审核 tab，筛选胶囊「全部 / 待审核 / 投放中 / 已结束 / 已驳回」+ 驳回弹框（标题「驳回投放」、副标题带广告名、按钮「取消 / 确定」横排）。
- C 端截图（`docs/screenshots/p17-ads/`，本地 dist 静态服务 + shop-api 全 mock，脚本 `.secrets/p17-ads-shots.cjs`）：
  - `01-home-banner-ad.png`：首页横滑广告区 2 条（1 条有图 + 1 条无图文字卡），三行文案「推广 / 标题 / 至 YYYY-MM-DD」不重叠，无图卡为主题色底深色字。
  - `02-shop-top-ad.png`：店铺页店铺卡片下方广告条，样式与首页一致、无溢出。
- 生产库核验（`information_schema`）：`campus_ad_campaign` 存在，20 列（`id, createdAt, updatedAt, channelId, slot, title, imageUrl, linkUrl, startDate, endDate, days, unitPriceFen, totalFen, status, payRef, paidAt, reviewNote, reviewedBy, reviewedAt, createdBy`）。
- 线上 shop-api 探针（`https://www.yourbao.cn/shop-api`，未登录）：`campusActiveAds(slot: "homeBanner")` → `{"data":{"campusActiveAds":[]}}`（生产尚无在投广告，接口与表均正常）。
- 线上产物：`guanli/assets/pages-campus-ads.DbRhO8C9.js`（12886B）、`guanli/assets/ads-B357MlO2.css`（5551B）均 200；`waimai/assets/search.Vc-E-T4L.js` 200 且包含 `campusActiveAds` 查询。

### 52.6 边界与已知限制

- **模拟支付**：`campusMerchantPayAd` 只改状态 + 写流水号，不对接微信/支付宝，也没有对账、退款、发票；接真实支付时需改为「下单 → 拉起支付 → 回调置 pendingReview」。
- **无素材上传**：C 端/后台都只填图片 URL，不提供上传；跨域图片需自行保证可访问。
- **无曝光/点击统计**：本轮不埋点、不回收投放效果数据，按天计费不区分展示量。
- **单广告位最多展示 3 条**：按总价降序取前 3，第 4 条起即使审核通过也不会曝光；平台侧未做「同时段超卖」校验。
- **审核只有一审**：通过/驳回后不可再改判，驳回需新建投放单；`cancelled / rejected` 不退款（本轮未收款）。
- **平台列表 take 200**：超量需按时间分页，当前未提供分页参数。
- **广告位固定**：广告位与单价写死在后端代码，新增广告位需改代码 + 重新发布。

### 52.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `47d0c2b54 feat(campus): P2-3 广告位与商家自助投放计费（按天计费 + 平台审核 + C 端在投广告）` → 服务器重启后启动失败：`Query.campusAdSlots defined in resolvers, but not in schema`（同一 resolver 同时注册进 admin/shop 两套 schema）→ 修复提交 `48329f8b7 fix(campus): P2-3 广告 resolver 拆 admin/shop 两套` → `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | 首次部署 crash loop（restarts 264→290）；修复后 `uptime 45s` 稳定、pm2 online、启动日志无 schema 报错 |
| 后端 | 生产 PG（`1Panel-postgresql-pIe0`）`information_schema` 核验 | `campus_ad_campaign` 20 列存在 |
| 后端 | 线上 `shop-api` 探针 | `campusActiveAds` 返回空数组，无报错 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61526 KB，nginx reload 成功；`pages-campus-ads` chunk 200 |
| C 端 | `cd D:\zhao\waimai-v39 && npx uni build` → `node .secrets/deploy-waimai.mjs` | 构建 `DONE Build complete.`；产物校验 3655 KB；部署返回 `200 deploy done` |
| 线上 | `https://e.joho.cn/guanli/`（后台）、`https://www.yourbao.cn/waimai/`（C 端） | 均 HTTP 200 |

操作入口：
- 商家自助投放：后台侧边「广告投放」→ 我的投放 → 选广告位、填标题/起止日期（图片与链接选填）→ 看实时报价 → 提交投放 → 「去支付」（模拟）→ 等待平台审核。
- 平台审核：后台侧边「广告投放」→ 平台审核 → 按状态筛选 → 「通过 / 驳回」（驳回填原因）→ 通过后广告按日期自动出现在 C 端。
- C 端展示：首页 `homeBanner` 横滑区、店铺页店铺卡片下方 `shopTop` 广告条，点击按链接跳转。

## 53. P2-4 智能取餐柜 + 无人配送接口占位（2026-10-27）

### 53.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | 新增实体 `CampusLockerStation`（表 `campus_locker_station`）+ `unmanned-delivery.ts`（无人配送服务商清单 / 适配器契约）+ `CampusLockerService` + admin/shop 两套 resolver；admin-api 新增 `campusLockerStations` / `campusUnmannedChannel` 与 `campusCreateLockerStation` / `campusUpdateLockerStation` / `campusDeleteLockerStation` / `campusUpdateUnmannedChannel` / `campusRequestUnmannedDelivery`；shop-api 新增公开只读 `campusLockerStations` / `campusUnmannedDeliveryChannel`；幂等建表迁移 `p9-p4-locker.ts` |
| 后台（web-admin） | 新增页面 `/pages/campus/locker`「取餐柜与无人配送」，双 tab：取餐柜站点（新增表单 + 站点卡列表，编辑/启用停用/删除）与无人配送通道（开关 + 服务商 + 接口地址 + 密钥）；侧边菜单项「取餐柜与无人配送」（商家或平台任一权限可见）；中英 i18n 各约 60 个 key |
| C 端（waimai-v39） | 店铺页店铺卡内新增取餐柜入口条（有启用站点或无人配送已开通时显示），点击弹出取餐柜弹层：站点列表（名称/位置/可用格口/服务商/开放时间/取餐指引）+ 无人配送开通提示 + 说明脚注；中英 i18n 新增 `locker` 区块 |

### 53.2 数据模型与接口口径

- **取餐柜站点**（`campus_locker_station`，14 列）：`id / createdAt / updatedAt / channelId / name / location / provider / totalCells / availableCells / openHours / pickupGuide / enabled / sort / createdBy`；索引 `idx_campus_locker_channel (channelId, enabled)`。
- **服务商编码**：取餐柜 `provider` 白名单 `self`（自建）/ `mock`（模拟通道（占位））/ `meituan`（美团无人车）/ `xinshiji`（新石器无人车）；对外视图 `providerName` 由编码翻译（`self` → 「自建」，其余取无人配送服务商中文名）。
- **字段校验**：`name` 必填 ≤64；`location` 必填 ≤255；`totalCells` 0~2000 整数；`availableCells` ≥0 且 ≤ `totalCells`；`openHours` 正则 `^\d{2}:\d{2}-\d{2}:\d{2}$`（可空）；`pickupGuide` ≤500（可空）；`sort` 0~999。创建时必填项缺失直接 `UserInputError`，更新时只校验传入字段。
- **无人配送通道**（配置挂在 `campus_fulfillment_config`，4 列）：`unmannedDeliveryEnabled`(boolean) / `unmannedDeliveryProvider`(varchar 16) / `unmannedDeliveryEndpoint`(varchar 255) / `unmannedDeliveryKey`(varchar 128)。
- **服务商清单**（`unmanned-delivery.ts`）：`none`（未开通）/ `mock`（模拟通道（占位），无需 endpoint/key）/ `meituan`（美团无人车，需 endpoint + key）/ `xinshiji`（新石器无人车，需 endpoint + key）。选 `none` 自动关闭；**开启时**若服务商需要 endpoint/key 而缺配置，直接 `UserInputError` 拒绝保存。
- **调用占位**（`campusRequestUnmannedDelivery(orderId)`）：通道未开启 → `status=disabled`；缺接口地址/密钥 → `status=unconfigured`；否则返回 `requestNo = UD-<时间戳>-<4 位随机>` 与 `status=accepted`（占位受理，**未向任何厂商真实下发运单**）。
- **对外视图**：后台 `channel` 不回密钥明文，只回 `keyConfigured` 布尔 + `needsEndpoint/needsKey`；C 端 `campusUnmannedDeliveryChannel` 只回 `{ enabled, provider, providerName }`。

### 53.3 权限与校验

- **商家侧**（`CampusMerchant`）：`campusLockerStations`（本渠道含停用站点）、`campusUnmannedChannel`（只读状态）、`campusRequestUnmannedDelivery`；一律按 `ctx.channelId` 隔离。
- **平台侧**（`CampusConfig`）：站点增删改、`campusUpdateUnmannedChannel` 通道配置。
- **C 端**：`campusLockerStations` / `campusUnmannedDeliveryChannel` 为 `@Allow(Permission.Public)`，未登录可读；只返回启用站点与开通状态，不暴露停用站点/接口地址/密钥。
- **resolver 拆分**：admin 与 shop 两套 schema 字段不同，拆为 `CampusLockerAdminResolver` 与 `CampusLockerShopResolver` 两个类分别注册，规避「defined in resolvers, but not in schema」启动崩溃（P2-3 曾踩坑）。
- **菜单权限**：`constants/menus.ts` 新增「取餐柜与无人配送」，`perm` = `['CampusMerchant','CampusConfig']`；页面内再按 `CampusConfig` 显隐可写操作（商家只读）。

### 53.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_locker_station`（新建） | `id`、`createdAt`、`updatedAt`、`channelId`、`name`、`location`、`provider`、`totalCells`、`availableCells`、`openHours`、`pickupGuide`、`enabled`、`sort`、`createdBy`，共 14 列 |
| 索引 | `idx_campus_locker_channel (channelId, enabled)` |
| `campus_fulfillment_config`（补列） | `unmannedDeliveryEnabled`(boolean NOT NULL DEFAULT false)、`unmannedDeliveryProvider`(varchar 16 NOT NULL DEFAULT 'mock')、`unmannedDeliveryEndpoint`(varchar 255)、`unmannedDeliveryKey`(varchar 128) |

迁移形态：`OnApplicationBootstrap` + `CREATE TABLE / CREATE INDEX / ALTER TABLE ADD COLUMN IF NOT EXISTS`，语句逐条执行、单条失败只打 `[P9P4LockerMigration] failed:` 日志不阻断启动，重复启动安全（生产 `synchronize: false`）。

### 53.5 验证记录

- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过（exit 0，`lib/` 随提交入库）；web-admin `node scripts/deploy.mjs` 内含 `npm run build:h5` 通过；C 端 `npx uni build` 通过（`DONE Build complete.`）。
- 后台截图（`docs/screenshots/waimai/p18-locker/`，本地 dist 静态服务 + admin-api 全 mock，脚本 `web-admin/scripts/shots-p18-locker.cjs`）：
  - `01-admin-locker-stations.png`：取餐柜站点 tab，3 张站点卡（自建启用 / 美团无人车启用 / 自建停用），含 pill（启用/停用）、`可用 a / 共 t 格`、开放时间、排序与「编辑 / 启用|停用 / 删除」。
  - `02-admin-unmanned-channel.png`：无人配送通道 tab，开关开启态 + 4 个服务商胶囊（选中「模拟通道（占位）」）+ 提示文案 + 「保存配置」按钮，无溢出。
  - `03-admin-locker-edit-modal.png`：编辑弹框「编辑柜机 | 东区 3 号楼智能柜 | 取消 / 保存」。
- C 端截图（`docs/screenshots/p18-locker/`，本地 dist 静态服务 + shop-api 全 mock，脚本 `.secrets/p18-locker-shots.cjs`）：
  - `01-shop-locker-bar.png`：店铺卡内入口条「3 个智能取餐柜可用」。
  - `02-shop-locker-sheet.png`：取餐柜弹层标题「智能取餐柜 · 无人配送」+ 3 条站点 + 「模拟通道（占位） 已开通，下单后可选择无人配送」+ 说明脚注。
- 生产库核验（`information_schema`）：`campus_locker_station` 存在，14 列（`id, createdAt, updatedAt, channelId, name, location, provider, totalCells, availableCells, openHours, pickupGuide, enabled, sort, createdBy`）；`campus_fulfillment_config` 补出 4 列（`unmannedDeliveryEnabled, unmannedDeliveryProvider, unmannedDeliveryEndpoint, unmannedDeliveryKey`）。
- 线上 shop-api 探针（`https://www.yourbao.cn/shop-api`，未登录）：`campusLockerStations` → `[]`；`campusUnmannedDeliveryChannel` → `{"enabled":false,"provider":"mock","providerName":"模拟通道（占位）"}`（生产尚未登记站点、未开启通道，接口与表均正常）。
- 线上产物：`guanli/assets/pages-campus-locker.C-BRNFfe.js`（14864B）、`guanli/assets/locker-CKYIkUJt.css`（5070B）、`guanli/assets/campus.Dac9OSG5.js`（含 `campusLockerStations`）、`waimai/assets/pages-shop-menu.DcH_bF6T.js`（含 `campusLockerStations`）均 200。

### 53.6 边界与已知限制

- **无人配送为接口占位**：`campusRequestUnmannedDelivery` 只做配置校验 + 模拟受理（返回单号），**未向美团/新石器等真实厂商下发运单**；接真实 SDK 时替换 `CampusLockerService.requestDelivery` 内部逻辑即可，返回结构与配置不变。
- **无取餐柜 SDK / 开柜码**：本轮只落站点与格口规模，不接柜机硬件、不生成取餐码 / 开柜指令，C 端只做「展示 + 引导」。
- **格口数为手工维护**：`availableCells` 由运营在后台手工填写，未接实时占用/释放，也无「已投递/已取走」状态流转。
- **密钥明文存库**：`unmannedDeliveryKey` 以明文存 `campus_fulfillment_config`（不回显明文，只回 `keyConfigured`），未做加密/密钥托管。
- **服务商写死代码**：服务商清单与需不需要 endpoint/key 写死在后端 `unmanned-delivery.ts`，新增服务商需改代码 + 重新发布。
- **列表上限**：后台站点 `take 200`、C 端 `take 50`，超量未分页。
- **无人配送与结算脱节**：通道开启不影响下单运费/骑手派单逻辑，仅作能力开关与展示。
- **停用站点不对外**：C 端只读 `enabled = true` 的站点，停用即时从 C 端消失。

### 53.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `645b8cd45 feat(campus): P2-4 智能取餐柜站点 + 无人配送通道接口占位` → `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | restarts 290→291，`pm2 online`，启动日志 `GraphQLModule Mapped {/shop-api}`、`{/admin-api}` 正常，**无 schema 报错**（`[P9P4LockerMigration] failed` 未出现）；仅有一条既有的 `[CJKPlugin] 默认数据初始化失败: duplicate key`（历史遗留，无关） |
| 后端 | 生产 PG（`1Panel-postgresql-pIe0`）`information_schema` 核验 | `campus_locker_station` 14 列存在；`campus_fulfillment_config` 4 列 `unmannedDelivery*` 存在 |
| 后端 | 线上 `shop-api` 探针 | `campusLockerStations` 返回 `[]`；`campusUnmannedDeliveryChannel` 返回 `{enabled:false,provider:"mock",providerName:"模拟通道（占位）"}`，无报错 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61551 KB，nginx reload 成功；`pages-campus-locker.C-BRNFfe.js`、`campus.Dac9OSG5.js` 均 200 且含 `campusLockerStations` |
| C 端 | `cd D:\zhao\waimai-v39 && npx uni build` → `node .secrets/deploy-waimai.mjs` | 构建 `DONE Build complete.`；产物校验 3661 KB；部署返回 `200 deploy done`；`pages-shop-menu.DcH_bF6T.js` 200 且含 `campusLockerStations` |
| 线上 | `https://e.joho.cn/guanli/`（后台）、`https://www.yourbao.cn/waimai/`（C 端） | 均 HTTP 200 |

操作入口：
- 平台配置取餐柜：后台侧边「取餐柜与无人配送」→ 取餐柜站点 → 填名称/位置/服务商/格口/开放时间/取餐指引/排序 → 「新增柜机」；列表可「编辑 / 启用|停用 / 删除」。
- 平台配置无人配送：同页 → 无人配送通道 → 打开开关 → 选服务商（模拟通道免配置；美团/新石器需填接口地址与密钥）→ 「保存配置」。
- C 端展示：店铺页店铺卡内「🔒 N 个智能取餐柜可用」入口条 → 点击查看站点列表与无人配送开通状态。

## 54. P2-5 骑手合规：健康证 / 保险 / 背景调查（2026-10-27）

### 54.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | Customer 新增 7 个合规自定义字段（健康证编号/照片/到期日、保险单号/到期日、背调状态/时间）；新增纯函数模块 `rider-compliance.ts`（判定 + 入参归一化）+ 单测 `rider-compliance.spec.ts`（10 例）；admin-api 新增 `campusUpdateRiderCompliance(customerId, input)`，shop-api `myRiderProfile` 扩展 `compliance` / `riderHealthCertExpiry` / `riderInsuranceExpiry`，`applyRider` 新增 `healthCertImg`；上线/接单闸门与 `setOnline` 按合规结果拦截；幂等补列迁移 `p9-p5-rider-compliance.ts` |
| 后台（web-admin） | 骑手入驻审核页卡片内新增「合规资料（健康证 / 保险 / 背调）」块：状态胶囊（合规/即将到期/待完善/已失效）+ 三行逐项状态（有效/即将到期/已过期/审核中/未登记/未通过）+ 到期日；「合规登记」就地展开表单（健康证编号、到期日、保险单号、到期日、背调四态）；保存后返回 `blocked` 直接提示失效原因；中英 i18n 各约 30 个 key |
| C 端（waimai-v39） | 入驻页新增「健康证照片（选填）」上传并随申请提交；已通过态的「已通过审核」卡内展示合规资料只读块；接单大厅顶部新增合规提醒横幅（已失效 / 即将到期 / 待完善三色），列出异常项与到期日；合规失效时「接单中」开关前置拦截并提示；中英 i18n 新增 `comp*` 文案 |

### 54.2 数据模型与接口口径

- **字段（Customer 自定义字段，共 7 个）**：`riderHealthCertNo`(string) / `riderHealthCertImg`(string) / `riderHealthCertExpiry`(datetime) / `riderInsuranceNo`(string) / `riderInsuranceExpiry`(datetime) / `riderBackgroundCheck`(string，值域 `none|pending|passed|failed`) / `riderBackgroundCheckAt`(datetime)。
- **判定口径**（`evaluateRiderCompliance`，后台与 C 端前端同口径复刻）：
  - 健康证：无编号且无照片 → `missing`；有登记则按到期日 → `ok` / `expiring`（≤30 天）/ `expired`。
  - 保险：无单号 → `missing`；有登记按到期日 → `ok` / `expiring` / `expired`。
  - 背调：`passed` → `ok`；`failed` → `failed`；`pending` → `pending`；其余 → `missing`。
  - 汇总：`blocked = 任一 expired 或 failed`；`pending = 任一 missing 或 pending`；`ok = !blocked && !pending`。
- **拦截策略（灰度）**：**只在「已登记但失效」时阻断**（健康证/保险过期、背调 `failed`）；未登记只算「待完善」不阻断，避免一次性锁死存量骑手。拦截点两处：`assertApprovedRider`（抢单/任务类接口前置）与 `setOnline(true)`（上线开关），均抛 `UserInputError('骑手合规资料已失效（健康证/保险过期或背调未通过），请联系管理员')`。
- **登记 mutation**：`campusUpdateRiderCompliance(customerId: ID!, input: RiderComplianceInput!)` 返回 `RiderComplianceResult { customerId ok blocked pending items { key label status expiry detail } }`；`RiderComplianceInput` 全字段可选，**按字段存在性写库**（不传 = 不改动）；文本 >128 字符、日期非法、背调值非法均 `UserInputError`；写非法背调时同时刷新 `riderBackgroundCheckAt`。
- **C 端只读**：shop-api `RiderProfile` 新增 `compliance`（无 `customerId`）、`riderHealthCertExpiry`、`riderInsuranceExpiry`；`applyRider(..., healthCertImg: String)` 仅接收照片 URL（≤500），编号与到期日仍由后台登记。

### 54.3 权限与校验

- **后台写**：`CampusPermissions.CampusAuditRider`（骑手审核权限）；只动合规字段，不改 `riderStatus`（审核通过/暂停仍是 `campusSetRiderStatus`）。
- **后台读**：沿用 `riderApplications` 返回 `customFields`，新增 7 个字段已在 `APPLICATION_FIELDS` 中显式列出（GraphQL 需逐字段声明）。
- **C 端读**：`myRiderProfile` 为 `Permission.Authenticated`（仅本人）；`compliance` 不含 `customerId`，避免跨账号信息泄露。
- **校验边界**：所有合规文本 ≤128、照片 URL ≤500、到期日必须可 `Date` 解析；`healthCertImg` 上传沿用既有 `uploadCustomerAsset`（客户资产上传通道）。

### 54.4 数据库变更

| 表 | 变更 |
|---|---|
| `customer`（补列） | `customFieldsRiderhealthcertno`(varchar 255)、`customFieldsRiderhealthcertimg`(varchar 255)、`customFieldsRiderhealthcertexpiry`(timestamp)、`customFieldsRiderinsuranceno`(varchar 255)、`customFieldsRiderinsuranceexpiry`(timestamp)、`customFieldsRiderbackgroundcheck`(varchar 255)、`customFieldsRiderbackgroundcheckat`(timestamp)，共 7 列 |

列名按 Vendure 自定义字段物理列规则（`customFields` + 字段名首字母大写其余小写）。迁移仍为 `OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS`，逐条执行、单条失败只打 `[P9P5RiderComplianceMigration] failed:` 日志不阻断启动。

### 54.5 验证记录

- 单测：`npx vitest --config vitest.config.mts --run src/rider-compliance.spec.ts` → **10 passed**（未登记不阻断 / 全有效 / 过期阻断 / 背调 failed 阻断 / 30 天内 expiring / 仅照片算已登记 / 归一化各校验分支）。
- 构建：`packages/campus-delivery-plugin` `npx tsc -p ./tsconfig.build.json` 通过；web-admin `node scripts/deploy.mjs` 通过（产物校验 61561 KB）；C 端 `npx uni build` 通过（`DONE Build complete.`）。
- 后台截图（`docs/screenshots/waimai/p19-rider-compliance/`，本地 dist 静态服务 + admin-api 全 mock，脚本 `web-admin/scripts/shots-p19-rider-compliance.cjs`）：
  - `01-admin-rider-compliance-list.png`：三张卡片分别呈现「待完善（健康证/保险/背调均未登记）」「即将到期（健康证 2026-11-15 橙色、保险 2027-06-30 绿色）」「已失效 · 禁止接单（健康证与保险均过期、背调未通过）」。
  - `02-admin-rider-compliance-form.png`：展开的合规登记表单——健康证编号/到期日、保险单号/到期日、背调四态胶囊（默认「未开始」）。
  - `03-admin-rider-compliance-blocked.png`：保存返回 `blocked` 后的收起态与提示。
- C 端线上截图（`docs/screenshots/waimai/p19-rider-compliance/`，脚本 `waimai-v39/scripts/_shot_rider_compliance.py`，线上 smoke-rider 账号）：
  - `04-rider-home-compliance-banner.png`：接单大厅顶部灰色提醒条「合规资料待完善，不影响接单」+「健康证 / 保险 / 背景调查」摘要，说明线上 shop-api `compliance` 字段已生效。
  - `05-rider-join-compliance.png`：入驻页「已通过审核」卡内合规资料块：健康证/保险/背景调查三行均「未登记」，右上角「待完善」胶囊。
- 生产库核验（`information_schema`）：`customer` 表 `customFieldsRider%` 列共 **14 列**（7 旧 + 7 新），新列名与上面表格一致。
- 线上产物：`guanli/assets/pages-rider-audit-index.CgpK3XzS.js`、`guanli/assets/rider-audit.DtaPASdU.js`、`waimai/assets/pkg-rider-pages-rider-home.BA3Rouy9.js`、`waimai/assets/pkg-rider-pages-rider-join.BrsboWC4.js` 均 HTTP 200。

### 54.6 边界与已知限制

- **合规资料仅后台登记**：骑手端不上传编号/到期日（只能上传健康证照片加快审核），保险单号与背调结果完全由平台录入，无骑手自助续期流程。
- **无到期提醒**：30 天 `expiring` 只在前端展示，未接入短信/公众号模板消息，也未做定时任务扫描。
- **背调不接三方**：`riderBackgroundCheck` 为人工录入的四态枚举，未对接任何背调服务商。
- **未登记不阻断**：存量骑手若从未登记合规资料，仍可正常接单（仅「待完善」提示）；如需强合规需运营侧另行收紧口径。
- **照片仅存 URL**：健康证照片走客户资产库，未做 OCR 识别，也未校验图片内容。
- **前端同口径复刻**：后台与 C 端的 `expiring` 判定（30 天）与后端为各自实现，改动阈值需三处同步（`rider-compliance.ts`、`audit/index.vue`、`rider-home.vue`）。
- **无操作审计**：`campusUpdateRiderCompliance` 未写操作日志（谁在何时改了谁的合规资料），排查依赖经验。

### 54.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `2185fc208 feat(campus): P2-5 骑手合规字段 + 判定模块 + 审核登记接口` → push → 服务器 `git reset --hard origin/master + pm2 restart vendure --update-env` | `pm2 online`，`/shop-api`、`/admin-api` 映射正常，无 schema 报错，无 `[P9P5RiderComplianceMigration] failed` |
| 后端 | 生产 PG `information_schema` 核验 | `customer` 表 `customFieldsRider%` 共 14 列 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61561 KB，nginx reload 成功；`pages-rider-audit-index.CgpK3XzS.js`、`rider-audit.DtaPASdU.js` 均 200 |
| 后台 | vshop 提交 `47079223 feat(campus-admin): P2-5 骑手审核页合规资料登记与阻断提示` → `git push` | `61cc5232..47079223 master -> master` |
| C 端 | `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs`（内含 `uni build`） | 产物校验 3668 KB，`200 deploy done`；`pkg-rider-pages-rider-home.BA3Rouy9.js`、`pkg-rider-pages-rider-join.BrsboWC4.js` 均 200 |
| C 端 | waimai 提交 `aa62f52 feat(rider): P2-5 骑手端合规展示与健康证上传` → `git push origin HEAD:master` | `ec12154..aa62f52 HEAD -> master` |
| 线上 | 登录态探针（smoke-rider）访问 `#/pkg-rider/pages/rider-home`、`#/pkg-rider/pages/rider-join` | 均正常渲染合规提醒与合规资料块（见 54.5 截图），证明线上 `compliance` 字段链路通 |

操作入口：
- 平台登记合规：后台「骑手入驻审核」→ 目标骑手卡片 → 「合规资料」块 → 「合规登记」→ 填健康证编号/到期日、保险单号/到期日、背调状态 → 「保存合规资料」；返回「已失效」时会提示该骑手已被禁止接单。
- 骑手自查：C 端「我的 → 传信者中心」进接单大厅，顶部横幅显示合规提醒；「传信者入驻」页可查看合规资料只读明细。

## 55. P2-6 骑手侧「联系顾客」号码保护（2026-10-27）

### 55.1 交付清单

| 端 | 能力 |
|---|---|
| 后端（vendure） | **本轮无改动**。号码保护能力此前已落地：`PrivacyNumberService`（mask / mock / aliyun / tencent 四种 provider，缺凭证运行时降级，绝不阻断订单流程）+ `RiderTaskService.customerContact`（归属校验 + 只回 `display/callable`）+ shop-api `campusRiderCustomerContact(orderId)` |
| 后台（web-admin） | **本轮无改动**。商家工作台的「联系顾客」已在 P0 阶段接入 `campusMerchantCustomerContact` |
| C 端（waimai-v39） | 骑手配送页新增「📞 联系顾客」入口（独立任务卡底排、路线任务组子单操作行各一处）；点击拉取 `campusRiderCustomerContact`，弹窗展示 `display`（脱敏号/虚拟号）与号码保护提示，`callable` 有值时「拨打」直接 `uni.makePhoneCall`，为空时只给「知道了」；中英 i18n 各新增 7 个 key |

### 55.2 数据模型与接口口径

- **接口**：`campusRiderCustomerContact(orderId: ID!): CampusPrivacyContact!`，返回 `{ protected, display, callable, provider, expiresAt, note }`；`Permission.Authenticated` + service 内 `assertApprovedRider` + `deliveryStaffId` 归属校验，非本单骑手直接 `ForbiddenError`。
- **四种展示形态**：
  - 未开启号码保护 → `protected=false`，`display = callable =` 真实号（行为与旧版一致）。
  - `mask`（默认兜底）→ `display` = `138****5678` 脱敏号，`callable = null`（不可拨，前端只给提示）。
  - `mock` → 同渠道/订单/真实号在 TTL（默认 60 分钟）内稳定的虚拟号，`callable` 可拨但**不真实转接**，`note` 明示「mock 虚拟号仅本地演示」。
  - `aliyun / tencent` → 缺 `PRIVACY_ALIYUN_KEY` / `PRIVACY_TENCENT_KEY` 环境变量时运行时降级为脱敏号，`note` 带上降级原因。
- **配置来源**：`campus_fulfillment_config` 的 `privacyNumberEnabled / privacyNumberProvider / privacyNumberTtlMinutes / privacyNumberPrefix`，后台「运营中心配置 → 号码保护」区块维护。
- **前端展示口径**：`display` 优先；`protected=true` 追加「号码保护中，请勿向他人透露该号码」；`note` 原样透出（降级/演示原因）。

### 55.3 权限与校验

- **仅本单骑手**：`assertOwner(ctx, orderId)` 比对 `order.customFields.deliveryStaffId === rider.id`，跨骑手/跨渠道一律 403。
- **真实号不出服务端**：开启号码保护后接口响应中不含真实手机号，只有 `display/callable`。
- **前端不可绕过**：C 端只做展示与拨号，不缓存号码；`callable` 为空时弹窗不给「拨打」按钮，避免给出打不通的号码。
- **顾客无手机号**：`display` 为空时提示「顾客未留手机号，请通过在线客服联系」，不落空弹窗。

### 55.4 数据库变更

无。P2-6 复用既有 `campus_fulfillment_config` 的 4 个 `privacyNumber*` 列与 `Customer.phoneNumber`。

### 55.5 验证记录

- 构建：C 端 `npx uni build` 通过（`DONE Build complete.`），`node .secrets/deploy-waimai.mjs` 产物校验 3670 KB。
- 线上截图（`docs/screenshots/waimai/p20-rider-contact/`，脚本 `waimai-v39/scripts/_shot_rider_contact.py`；线上 smoke-rider 登录，任务列表与联系方式按渠道 token 局部 mock，其余走真实线上）：
  - `01-rider-delivering-contact-entry.png`：配送中任务卡底排三按钮「🧭 导航 / 📞 联系顾客 / 异常上报」，单卡无重复（mock 按 `vendure-token` 只对 canteen-a 返回任务，规避跨渠道聚合重复拼接）。
  - `02-rider-contact-protected-modal.png`：弹窗「联系顾客」+ 虚拟号 `1700001234` + 「号码保护中，请勿向他人透露该号码」+ mock 演示说明 +「取消 / 拨打」。
- 线上产物：`waimai/assets/pkg-rider-pages-rider-delivering.DZ6CLaRi.js`（20352B）、`waimai/assets/rider-delivering-Byto0GA5.css`（4454B）均 HTTP 200。

### 55.6 边界与已知限制

- **mock 不真实转接**：`mock` provider 生成的虚拟号只做演示，拨过去不会接通；真实可用需接阿里云/腾讯云 AXB 号池（接口位置已预留，解码后仍会降级为脱敏号）。
- **无通话记录/回拨**：不记录通话、不支持顾客回拨骑手，双方只能单向拨出。
- **无有效期倒计时**：弹窗不展示 `expiresAt` 剩余时间，过期后重新点击会重新解析（mock 下会拿到同一号码直至 TTL 结束）。
- **骑手不可见真实号**：即便业务需要（如顾客电话不通需换号联系），骑手侧也拿不到真实号，只能走在线客服。
- **仅配送页入口**：接单大厅、历史订单、钱包等页面均无「联系顾客」入口，超出配送中的单不提供。
- **依赖渠道配置**：号码保护按渠道（`campus_fulfillment_config`）开关，跨渠道聚合任务时各单按各自渠道口径解析。

### 55.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无改动（`campusRiderCustomerContact` 与 `PrivacyNumberService` 已在线上） | 未重启 |
| 后台 | 无改动 | 未部署 |
| C 端 | `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs`（内含 `uni build`） | `DONE Build complete.`；产物校验 3670 KB；`200 deploy done`；`pkg-rider-pages-rider-delivering.DZ6CLaRi.js`、`rider-delivering-Byto0GA5.css` 均 200 |
| C 端 | waimai 提交 `feat(rider): P2-6 骑手配送页「联系顾客」号码保护入口` → `git push origin HEAD:master` | 见仓库记录 |
| 线上 | 登录态探针（smoke-rider）访问 `#/pkg-rider/pages/rider-delivering` | 入口按钮渲染正常，「联系顾客」弹窗按号码保护口径展示（见 55.5 截图） |

操作入口：
- 骑手联系顾客：C 端「配送中」页 → 任务卡底排「📞 联系顾客」→ 弹窗确认号码后「拨打」；脱敏降级时只展示号码不可拨。
- 平台配置号码保护：后台「运营中心配置」→「号码保护」→ 开关 + 服务商（mask / mock / 阿里云 / 腾讯云）+ 有效期分钟数 + 号池前缀 → 保存。

## 56. P3-1 口味偏好云端同步（2026-10-27）

### 56.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | `Customer` 新增自定义字段 `tasteProfile`（text，JSON）；shop 接口 `campusMyTasteProfile`（读，未登录返回空串）/ `campusUpdateTasteProfile(input: String!)`（写，空串=清除）；启动幂等补列 |
| C 端（waimai） | 「我的口味」页登录后自动拉取云端并回填、保存/清空时上行；结算页取 `activeCustomer.customFields.tasteProfile` 云端优先覆盖本机；底部提示文案改为「登录后自动同步到账户，换设备也能恢复」 |
| 后台 | 无改动 |

> C 端原有 `utils/taste-profile.ts`（辣度/忌口/过敏原/餐具 + 备注拼装 + 菜品命中提示）保持不变，本轮只补「云端层」，结构与存量数据完全兼容。

### 56.2 数据模型与接口口径

- 存储：`customer."customFieldsTasteprofile"`（text）。JSON 结构与 C 端 `TasteProfile` 一致：`{spicy:'none|mild|medium|hot'|'', avoid:[], allergens:[], tableware:0-5}`。
- 读：`campusMyTasteProfile: String`，登录态返回原始 JSON 串，未登录返回 `""`（游客继续走本机存储）。
- 写：`campusUpdateTasteProfile(input:String!): String!`，返回已落库的原文；`""` 表示清除（写 NULL）。
- 合并口径（C 端）：
  1. 页面/结算页先读本机值渲染，避免白屏；
  2. `getActiveCustomer()` 返回的 `customFields.tasteProfile` 非空 → 以云端覆盖本机（`writeTasteProfile(JSON.parse(cloud))`）；
  3. 云端为空且本机有设置 → 静默上行一次（首次打通账户）；
  4. 上行失败静默降级，本机仍是权威副本，不阻塞下单。

### 56.3 权限与校验

- 权限：`Permission.Authenticated`（读、写均为登录态；`activeUserId` 为空时读返回空串、写抛 `NOT_LOGGED_IN`）。
- 服务端校验：长度 ≤2000 字符；非空时必须是合法 JSON 且为对象（数组/标量拒绝，报「口味偏好格式不合法」）。
- 键值白名单校验在 C 端 `normalizeProfile` 完成（非法 key 丢弃、tableware 夹取 0–5），服务端不重复实现语义校验。

### 56.4 数据库变更（启动幂等迁移 `P9P6TasteProfileMigration`）

```sql
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "customFieldsTasteprofile" text;
```

> `DB_SYNC=0` 的生产环境靠此补列；`IF NOT EXISTS` 重复启动安全，失败只 `console.error('[P9P6TasteProfileMigration] failed: ...')` 不阻断启动。

### 56.5 验证记录

- 编译：`packages/campus-delivery-plugin` `npm run build`（rimraf lib + tsc）通过。
- 部署后端后 `pm2 list` → `vendure online`，`pm2 logs --nostream` 无 error、无 `[P9P6TasteProfileMigration] failed`；服务器 HEAD `44808f108`。
- 线上端到端（脚本 `waimai-v39/scripts/_shot_taste_cloud.py`，真实 shop-api 不 mock）：
  - 写：`campusUpdateTasteProfile` 返回 `{"spicy":"mild","avoid":["coriander","onion"],"allergens":["peanut"],"tableware":2}`；
  - 读：`campusMyTasteProfile` 返回同串 → 证明物理列已存在且可往返；
  - 截图 `01-taste-profile-cloud-restored.png`：辣度「微辣」、忌口「香菜/葱」、过敏原「花生」、餐具「2」均已回填，预览「微辣；忌香菜、葱；对花生过敏；需 2 份餐具」。
  - 截图 `02-checkout-taste-restored.png`：结算页订单备注自动带出同一摘要，餐具份数 2。
- 构建：C 端 `uni build` 通过（`DONE Build complete.`），`node .secrets/deploy-waimai.mjs` 产物校验 3671 KB、`200 deploy done`。

### 56.6 边界与已知限制

- **仅整档覆盖**：云端保存的是完整 JSON，无字段级合并；两端同时修改以「最后一次保存」为准。
- **无版本/时间戳**：不记录更新时间，冲突时无法判断新旧，只能依赖保存顺序。
- **游客不落库**：未登录用户的口味偏好仍只在本机，注册后首次进入口味页才会自动上行。
- **不上行到商家侧**：口味偏好只影响本单备注，不进入商家顾客画像/常客标签。
- **多端并发**：手机与平板同时打开口味页时，先保存者会被后者覆盖（无冲突提示）。

### 56.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `44808f108 feat(campus): P3-1 口味偏好云端同步（Customer 字段 + shop 读写接口 + 幂等补列）` → `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `HEAD is now at 44808f108`；pm2 `vendure` online；无 schema/迁移报错 |
| 后台 | 无改动 | 未部署 |
| C 端 | `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs`（内含 `uni build`） | `DONE Build complete.`；产物校验 3671 KB；`200 deploy done` |
| 线上 | 登录态探针（smoke-rider）读写 `campusMyTasteProfile` / `campusUpdateTasteProfile` | 写读一致；口味页与结算页均按云端值渲染（见 56.5 截图） |

操作入口：
- 顾客设置口味：C 端「我的 → 我的口味」→ 选辣度/忌口/过敏原/餐具 → 「保存并带入下单」（登录态同时保存到账户）。
- 换设备恢复：新设备登录后打开「我的口味」或结算页，自动拉取云端偏好并回填。
- 清除：口味页底部「清空口味偏好」→ 本机与云端同时清空。

## 57. P3-2 商家经营数据导出 CSV（2026-10-27）

### 57.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | `CampusMerchantRevenueDay` 增 `cancelled` / `cancelledAmount`；`CampusMerchantRevenue` 增 `days30`（近 30 日含今日，30 条）；`MerchantAdminService.revenue()` 查询窗口由 7 日扩到 30 日，近 7 日/今日口径显式收窄 |
| 后台（web-admin） | 经营设置页「经营数据」卡片底部新增「导出 CSV（近 30 日）」按钮 + 说明；`apis/campus.ts` 类型与查询字段同步 `days30`；`utils/csv.ts` 复用 `downloadCsv`（BOM UTF-8，Excel 中文兼容） |
| C 端 | 无改动 |

### 57.2 接口口径

- `campusMerchantRevenue { today, last7, days, days30 }`：
  - `today` / `last7`：窗口汇总，字段 `orders / gross / avgTicket / cancelled / cancelledAmount`（分）；
  - `days`：近 7 日逐日（含今日），字段 `date(MM-DD) / orders / gross / cancelled / cancelledAmount`；
  - `days30`：近 30 日逐日（含今日，固定 30 条，无订单的日期补 0），字段同上，**与 `days` 同口径**（`days` ≡ `days30` 的末 7 条）。
- 归日规则（两处一致）：
  - 已送达单：按 `customFields.deliveredAt` 归日（跨零点计入实际送达当天），`gross` 累加 `totalWithTax`；
  - 取消单：按「下单日」（`createdAt`）归日，`cancelled` 计件、`cancelledAmount` 按全额退款（`totalWithTax`）计入。
- 范围：仅统计当前渠道（`ctx.channelId`）且 `customFields.hallStatus` 非空的校园订单。
- CSV 列：`日期(MM-DD), 完成单量, 营业额(元), 取消单量, 退款金额(元)`；金额固定两位小数（`fenToYuanFixed`），行序为时间正序（09-28 → 10-27 这类 30 行）。

### 57.3 后台交互

- 按钮固定导出**近 30 日**，不受页面「今日 / 近 7 日」分段影响（分段只切换 KPI 桶）。
- 文件名：`经营数据-近30日-YYYYMMDD.csv`（取浏览器本地日期；英文环境为 `revenue-last30d-YYYYMMDD.csv`）。
- 表头随语言切换（zh-Hans / en 同名 key `campusStoreSettings.csv*`）。
- 无数据时不产生空文件，提示「暂无可导出的数据」。
- 纯浏览器端 `Blob` 生成，不请求服务端导出接口、不落盘服务器。

### 57.4 验证记录

- 编译：`packages/campus-delivery-plugin` `npm run build` 通过。
- 后台构建：`npm run build:h5` → `DONE Build complete.`。
- 本地 mock 取证（`web-admin/scripts/shots-p20-csv-export.cjs`，390×844 dpr=2，mock admin-api）：
  - `01-store-settings-export-entry.png`：经营数据卡片底部按钮「导出 CSV（近 30 日）」与说明完整展示；
  - `02-store-settings-export-window.png` + `02-exported-revenue-last30d.csv`：点击按钮捕获真实下载，31 行（表头 + 30 日）、带 UTF-8 BOM、金额两位小数、`09-28` 起 `10-27` 止。
- 线上核验：
  - GraphQL 探针（superadmin / 渠道 `canteen-a-token`）：`days30` 返回 30 条（09-28 → 10-27），`days` 与 `days30` 末 7 条数值一致；
  - 真实登录导出（`web-admin/scripts/_shot_p20_csv_export_live.py`）：社区站点 `#/pages/campus/store-settings` 出现导出按钮，下载文件 `经营数据-近30日-20261027.csv`，30 行数据；
  - 截图 `03-live-store-settings-export.png`、`03-live-revenue-last30d.csv`。

### 57.5 边界与已知限制

- **固定 30 日窗口**：不支持自定义起止日期；更长周期需另加区间参数（本轮未做）。
- **日期仅 MM-DD**：跨年导出时同年内无歧义，但跨年数据无法从 CSV 行本身区分年份（依赖文件名日期推算）。
- **无成本/抽成口径**：只含单量、营业额、取消与退款金额，不含食材成本、平台佣金、骑手分成。
- **取消金额是全额退款**：与页面「退款金额」同口径，不区分部分退款。
- **无审计留痕**：文件在浏览器生成，服务端不记录谁在何时导出。
- **不做公式注入转义**：CSV 值全部来自服务端统计（数字/日期），不含用户输入文本；若后续追加店铺名等文本列需补 `=`/`+` 前缀转义。

### 57.6 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `8aca63831 feat(campus): P3-2 商家经营数据近 30 日逐日明细（days30 + 取消/退款逐日口径）` → `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `HEAD is now at 8aca63831`；pm2 `vendure` online |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61564 KB；nginx 配置检查通过 + 重载；`deploy done` |
| C 端 | 无改动 | 未部署 |
| 线上 | 探针 + 真实登录导出 | 30 条逐日数据；下载文件名/表头/行数符合预期 |

操作入口：
- 商家工作台「经营设置」→ 拉到「经营数据」卡片 → 点「导出 CSV（近 30 日）」→ 浏览器直接下载 `经营数据-近30日-YYYYMMDD.csv`。
- 逐日看数：卡片内「今日 / 近 7 日」切换 KPI，下方柱状图为近 7 日营业额；更长时间跨度用导出的 CSV 在 Excel 里看。

## 58. P3-3 骑手大厅批量接单（2026-10-27）

> 本轮边界：大厅「顺路组聚合 / 整组抢单 / 顺路 N 单徽标」为既有 plan 3.3 能力（`routeGroupId`、`hall-grab.service.ts` 整组抢单），**未重复开发**；本轮只补增量——一次勾选多单批量接单、逐单独立事务、逐单结果回传。

### 58.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | 新增 `type CampusGrabResult { orderId: ID! ok: Boolean! message: String }`；shop Mutation 新增 `campusGrabOrders(orderIds: [ID!]!): [CampusGrabResult!]!`（`hall-shop.resolver.ts`，`type: () => [GraphQLID]`） |
| C 端（waimai） | 大厅卡片整体可点勾选（左侧圆点 ✓）、底部固定批量栏（已选 N 单 / 清除 / 批量接单（N））、按渠道分组 + 每 10 单分块提交、勾选态随轮询收敛、成功提示并跳转在途页；i18n 6 个 key |
| 后台（web-admin） | 无改动 |

### 58.2 接口口径

- 入参：`orderIds: [ID!]!`，服务端先去重；长度 0 抛 `USER_INPUT_ERROR`「请先选择要接的订单」，>10 抛「一次最多接 10 单」（**校验在循环之前，不产生任何副作用**）。
- 前置：`assertApprovedRider(ctx)`——未入驻/未通过审核的账号整体拒绝。
- 逐单执行：每单复用既有 `grab(ctx, id)` 单抢逻辑（独立事务 + `pessimistic_write` 行锁 + 渠道/班次/信用分校验），**单条失败不中断其余**，结果按入参顺序返回 `[{ orderId, ok, message }]`。
- 失败语义：`ok:false` + 后端原文（如「手慢了，该订单已被抢」「不能抢自己的订单」），不做批量整体报错。
- 渠道隔离：抢单按 `ctx.channelId` 校验，跨渠道订单必须分组提交（C 端按 `channelToken` 分组，逐组带各自 token 调用）。

### 58.3 C 端交互

- 点击大厅卡片任意位置切换勾选；「一键接单」按钮为 `@tap.stop`，不会误触发勾选。
- 底部批量栏仅在有勾选时出现，大厅底部自动留出 200rpx 安全间距。
- 单次上限 10 单（`PICK_LIMIT`），超限 toast「一次最多选 10 单」。
- 轮询刷新后自动剔除已消失（被他人接走/取消）的勾选，避免整批提交时必然失败。
- 提交结果：全部成功 → toast「已接 N 单」；部分成功 → toast「已接 N 单，M 单未成功」；有成功则 600ms 后跳转配送任务页；全部失败 → toast 首条失败原文并留在大厅（勾选已清空可重选）。
- 失败中含「已被抢」的单会标记 `taken`（置灰、按钮禁用），防止重复点击。

### 58.4 验证记录

- 后端编译：`packages/campus-delivery-plugin` `npm run build` 通过（`GraphQLID` 显式声明列表标量）。
- 线上探针（smoke-rider / 渠道 `canteen-a-token`，均无副作用）：
  - `orderIds: []` → `USER_INPUT_ERROR`「请先选择要接的订单」；
  - `orderIds: ["9100001","9100002","9100003"]` → `ok:false` × 3，`message` 均为「手慢了，该订单已被抢」（逐单结果、整体不报错）；
  - 11 个 id → 「一次最多接 10 单」。
- C 端线上取证（`scripts/_shot_rider_batch.py`，390×844 dpr=2，大厅数据 mock 三单、批量结果 mock 全成功）：
  - `01-rider-hall-batch-idle.png`：大厅常态（无勾选、无底栏）；
  - `02-rider-hall-picked-batchbar.png`：两单已勾选（橙色 ✓）+ 底栏「已选 2 单 / 清除 / 批量接单（2）」，同组单带「顺路 3 单」既有徽标；
  - `03-rider-hall-batch-done-toast.png`：提交后勾选清空、底栏收回，toast「已接 2 单」；
  - `04-rider-delivering-after-batch.png`：600ms 后自动落到 `#/pkg-rider/pages/rider-delivering`（成功分支链路）。
- 产物：`docs/screenshots/p22-rider-batch-grab/`。

### 58.5 边界与已知限制

- **非原子**：不保证「全成功或全失败」，部分成功是正常结果，客户端按逐单结果处理。
- **单渠道 ≤10**：一次提交的批量上限 10 单；超过需自行分批（C 端已自动分块，但超 10 单会串行多轮，耗时可感知）。
- **串行执行**：逐单独立事务按顺序执行，不是并发抢单，极端并发下后几单被抢的概率略高。
- **无重试**：失败单不自动重试，只标记「已被抢」置灰。
- **无全选/反选**：仅支持逐张点选（避免误接全厅单）。
- **轻量校验**：仅空数组与 >10 两个前置校验，其余（班次、信用分、合规）沿用单抢的既有拦截。

### 58.6 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `19c99e4c2 feat(campus): P3-3 骑手批量接单 campusGrabOrders（逐单独立事务 + 逐单结果）` → `git push origin master` → 服务器 `git fetch + reset --hard origin/master + pm2 restart vendure --update-env` | `HEAD is now at 19c99e4c2`；pm2 `vendure` online |
| C 端 | `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs` | `DONE Build complete.`；产物校验 3829 KB；`deploy done` |
| 后台 | 无改动 | 未部署 |

**构建修复说明（同轮）**：C 端仓库此前被半迁移提交引入三处未跟踪 WIP 依赖（`pages.json` 引用 `jh-library/jh-teahouse/jh-chamber` 但对应 `.vue` 未入库、`jh-admin.vue` 依赖未入库的 `scene/`、`jh-library.vue` 样式块残留孤立的 `gap: 10px; }` 两行导致 sass `expected "{"`）。本轮补齐三页源码与 `scene/` 目录、删掉孤立两行，构建恢复，产物由缺失江湖三页的 2206 KB 回到完整形态 3829 KB，线上主包重新含 `jh-library / jh-teahouse / jh-chamber` 路由。

操作入口：
- 骑手小程序「接单大厅」→ 点卡片任意位置勾选（圆点变橙 ✓）→ 底部「批量接单（N）」→ 成功 toast 后自动进入「配送任务」页。
- 只想接一单：直接点卡片内的「一键接单」，行为与旧版一致。

## 59. P3-4 配送费阶梯计价（2026-10-27）

> 本轮边界：动态计价（`dynamic-pricing.ts`：高峰/供需/手动倍率）与「满X元免配送费」（`freeShippingThreshold`）均为既有能力，**未重复开发**；本轮只补缺口——按订单商品金额分档替换分区运费基价。

### 59.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | 新增 `delivery-fee-tiers.ts`（严格校验/宽松解析/取档纯函数）；`campus-fulfillment-config.entity.ts` 加 `deliveryFeeTiers`（simple-json）；迁移 `P9P7DeliveryFeeTiersMigration` 幂等补列；`shipping-calculator.ts` 结算按档位改基价并在 metadata 输出 `baseFee / tier`；`campus-config.service.ts` 写入口校验；`waimai-store.service.ts` 读写透出；5 处 SDL 加 `deliveryFeeTiers: String`；单测新增 3 例 |
| 后台（web-admin） | 配置页「配送费阶梯（按订单金额）」区块：门槛/配送费两输入、增删行（上限 10 档）、保存前校验（空行跳过、非法金额与重复门槛拦截、升序重排）；`campus.ts` 字段与 FIELDS；i18n 7 个 key |
| C 端（waimai） | `WAIMAI_STORE_LIST` 增加 `deliveryFeeTiers`；结算页按商品金额命中档位改运费展示，并在运费行下提示「满 ¥{门槛} 本单配送费 ¥{档位费}」；i18n 1 个 key |

### 59.2 配置与接口口径

- 存储：`campus_fulfillment_config.deliveryFeeTiers`（`jsonb`），GraphQL 统一以 `String`（JSON）透出：`[{"minAmount":分,"fee":分}]`，`null` = 不启用；最多 10 档。
- 写入校验（`normalizeDeliveryFeeTiers`）：必须是数组、每项为对象、门槛与运费为整数且非负、门槛不可重复；自动按门槛升序；失败抛 `UserInputError`（后台原文提示）。
- 结算解析（`parseDeliveryFeeTiers`）：宽松处理——丢脏项、去重、截断 10 档、升序，**永不抛错**，避免脏配置把结账链路打挂。
- 计算优先级（`shipping-calculator.ts` → `quoteZoneFee`）：满X元免配送费达标 → 0；否则取「门槛 ≤ 商品金额」的最高档 `fee` 作为基价；未达最低档回退分区 `zone.fee`；动态加价（高峰/供需/手动）在基价之上叠加。
- metadata 新增 `baseFee`（实际采用的基价）与 `tier {minAmount, fee}`（命中的档位），保留 `zoneFee`（分区原价）便于对账排查。
- 查询透出：`campusStoreConfigs`、`campusStoreConfigWithChannel`、`waimaiStoreList` 均返回 `deliveryFeeTiers`。
- 写入入口：`campusUpdateStoreConfig` / `campusStoreConfigWithChannel`（input）与 `waimaiUpdateStoreConfig` 均可写；传 `null` 或空串即关闭。

### 59.3 后台交互

- 入口：拾光达配置页 → 点开渠道卡片 → 「配送费阶梯（按订单金额）」区块（位于「满X元免配送费」之后）。
- 每行两个输入：`满(元)` / `配送费(元)`，行尾「删除」；未满 10 档时显示「+ 添加阶梯」。
- 保存校验：整行为空则跳过；只填一半、金额非法或门槛重复（toast「阶梯门槛不能重复」）直接拦下；提交前按门槛升序转分，全空提交 `null`。
- 提示文案说明口径：达到门槛后该档配送费替换分区运费，未达最低档仍按分区原价，满X元免配送费优先。

### 59.4 C 端结算展示

- `waimaiStoreList.deliveryFeeTiers` → `parseFeeTiers`（升序、坏数据当未配置）。
- 运费行：命中档位时显示「档位费 + 动态加价」（加价取 `zone.addFee`，无该字段时取 `zone.price - zone.fee`）；未命中退回分区原价。
- 档位提示：命中档位且未满免时，运费行下方追加「满 ¥{门槛} 本单配送费 ¥{档位费}」；满免达标后该提示被满免明细取代（满免优先）。
- 最终金额仍由后端 calculator 出价，页面为同口径预估。

### 59.5 验证记录

- 后端单测：`npx vitest run src/shipping-calculator.spec.ts` → 15/15 通过（新增 3 例：命中最高档 `goods=4500 → 100` 且 metadata 带 `tier/zoneFee/baseFee`；未达最低档回退 300；满免优先 `goods=3500 ≥ 3000 → 0`）。
- 插件构建：`npm run build` 通过（rimraf lib + tsc）。
- 线上探针（渠道 `canteen-a-token`，`campusUpdateStoreConfig` + `waimaiStoreList`）：写入两档后读回
  `[{"minAmount":2000,"fee":100},{"minAmount":3000,"fee":50}]`，字段透出正常。
- 后台 UI 保存链路（`e.joho.cn/guanli/` 配置页，非 API 直写）：展开 `canteen-a` 卡片 → 填两档 → 点「保存」→ 请求
  `campusUpdateStoreConfig` 200、toast「已保存」，`waimaiStoreList` 读回同一 JSON；复测时曾因该渠道「超时赔付已开启但未选券模板」
  被前端拦下（toast「开启超时赔付前请选择赔付券模板」），补齐券模板后保存即通过，说明拦截来自既有校验而非阶梯字段。
- C 端线上取证（`scripts/_shot_fee_tiers.py`，390×844 dpr=2）：
  - `admin-fee-tiers-config.png`：后台配置页两档阶梯（满 20 → 1.00、满 30 → 0.50）；
  - `checkout-tier-zone-original.png`：商品 ¥16.36（未达档）→ 运费 ¥2.00，无档位提示；
  - `checkout-tier-20.png`：商品 ¥20.45（命中满 20 档）→ 运费 ¥1.00 + 提示「满 ¥20 本单配送费 ¥1」，calculator 出价 100；
  - `checkout-tier-30.png`：商品 ¥30.68（命中满 30 档）→ 运费 ¥0.50 + 提示「满 ¥30 本单配送费 ¥0.5」，calculator 出价 50。
- 产物目录：`docs/screenshots/p23-fee-tiers/`。
- 取证后已清理：`deliveryFeeTiers` 恢复 `null`，草稿单删除。

### 59.6 边界与已知限制

- **仅结算生效**：分区预览接口（`campusZones`）没有订单金额，仍返回分区原价；阶梯只在提交结算时按购物车金额改价，C 端结算页用同口径本地预估。
- **动态计价叠加口径**：档位费只替换「基价」，动态加价仍按分区原价口径叠加；启用手动倍率时 C 端预估与实际可能有小额差异，最终以结算为准。
- **满免优先**：满X元免配送费达标时阶梯不生效（运费直接 0），这是刻意优先级。
- **店铺级全局**：不区分分区、配送方式（R1/R3 等）与时段；需要差异化时只能拆店铺渠道。
- **上限 10 档**：超过需合并分档；门槛为 0 的档等价于全局最低基价。
- **脏数据宽松**：结算侧解析永不抛错，脏档位被静默丢弃；排查以后台配置原文与 metadata 的 `tier` 为准。
- **保存前置依赖**：后台保存会先跑整卡片校验，任一既有项不合法都会拦下（如「超时赔付」开启却未选赔付券模板、开通 R1/R2 却无交接点）；遇到「保存没反应」先看 toast 文案，按提示补齐其他配置项即可，与本阶梯无关。
- **取证后已还原**：`canteen-a` 的阶梯、交接点、赔付券模板均已清回原状（`null` / `[]`）。

### 59.7 部署记录（2026-10-27）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `03e3eda1b feat(campus): P3-4 配送费阶梯计价（按订单金额分档替换分区运费基价）` → `git push origin master` → 服务器拉取 + `pm2 restart vendure --update-env` | `HEAD is now at 03e3eda1b`；pm2 `vendure` online；迁移 `P9P7DeliveryFeeTiersMigration` 随启动补列 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61639 KB；nginx 检查通过 + 重载；`deploy done` |
| C 端 | `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs` | `DONE Build complete.`；产物校验 3830 KB；`deploy done` |
| 线上 | admin 探针 + C 端三态取证 | 档位读写、结算出价、页面提示全部一致；取证后配置已清回 `null` |

操作入口：
- 平台/商家工作台「拾光达配置」→ 展开渠道卡片 → 「配送费阶梯（按订单金额）」→ 填「满(元)」「配送费(元)」→「+ 添加阶梯」可加档 → 保存。
- 顾客端下单：结算页运费行按商品金额自动取档；命中档位时显示「满 ¥X 本单配送费 ¥Y」，满X元免配送费达标的订单优先免运费。

## 60. P4-1 销售侧经营 BI（2026-10-28）

> 本轮边界：履约看板（`campusDeliveryStats`/`stats.vue`：准点率、环节耗时、超时归因）与 `sales-plugin`（销售员代下单业绩）均为既有能力，**未重复开发**；本轮只补缺口——菜品结构、用户结构与时段销售视角。

### 60.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | 新增 `sales-stats.service.ts`（纯函数 `aggregateSalesStats` + `customSalesWindow` + 服务）、`sales-stats.resolver.ts`；`campus-delivery.plugin.ts` 注册服务/解析器并新增 SDL `campusSalesStats(range, from, to)` 及 8 个类型；单测 `sales-stats.service.spec.ts` 18 例 |
| 后台（web-admin） | 新增页面 `pages/campus/sales.vue`（经营分析）；`apis/campus.ts` 新增 `campusSalesStats(range, from?, to?)` 与类型；注册 `pages.json`、菜单 `constants/menus.ts`（履约域，权限 `CampusViewDispatch`）、导航标题 `i18n/nav-titles.ts`；中英 i18n 命名空间 `campusSales`；商品表「导出 CSV」+ 复购分群「导出用户结构」（P4-1-4，客户端生成，复用 `utils/csv.ts` 的 `downloadCsv`）；导出窗口选单第四项「自定义日期…」+ 起止日期弹层（任意起止日期） |

### 60.2 口径与接口

- 查询：`campusSalesStats(range: String, from: String, to: String)`，`range ∈ today | 7d | 30d`（非法值回退 `7d`）；`from`/`to` 传 `YYYY-MM-DD` 时按**自定义任意起止日期**统计（响应 `range=custom`）。权限同履约看板 `CampusPermissions.CampusViewDispatch`；非平台超管按 `ctx.channelId` 隔离。
- 窗口：`today` = 校园时区（UTC+8）今日 0 点起；`7d` / `30d` = **对齐自然日**的「近 N 个自然日 0 点起」（含今日），保证日趋势补零区间与总单量自洽。
- 自定义区间（`custom`）：`from` 当天 0 点 ~ `to` **次日** 0 点（含首尾两天）；上一窗口为紧邻的等长区间（`start - (end - start) → start`）；日趋势按实际天数逐日补零。参数校验：`from`/`to` 必须同时传、格式须为日期、结束不得早于开始、跨度上限 **366 天**，违规抛 `UserInputError`（前端展示后端 message）。
- 环比：`7d/30d` 对比紧邻等长窗口；`today` 对比「昨日 0 点 → 昨日同刻」；`compare` 为百分比数值，上期为 0 时返回 0（前端据 `prev.orders` 是否为 0 显示「—」）。
- 销售单：排除 `Draft / AddingItems / ArrangingPayment / Cancelled`，并排除跑腿单（`customFields.errandKind` 非空，跑腿无商品会污染四象限与客单价）。
- KPI：`orders` 有效单量；`gmvFen` = 订单 `totalWithTax` 汇总（**含配送费/打包费**）；`aovFen = gmvFen / orders`；`customers` 去重客户数（游客单不计）；`newCustomers` = 该客户全历史首单落在本窗口内；`repurchaseRate` = 窗口内 ≥2 单客户 / 下单客户。
- 菜品四象限：按**商品**（聚合规格）统计销量与 `linePriceWithTax`；以「销量中位数 × 销售额中位数」分档（`>=` 中位为高）：`star` 明星（双高）/ `traffic` 引流（高销低额）/ `premium` 利润（低销高额）/ `slow` 滞销（双低）；中位数基于全部有销量商品，返回列表取 Top 50（按销售额降序）。
- 商品名取 `ProductTranslation`（优先 `zh-Hans`/`zh`，否则第一条），避免 Top 商品显示 `#id`。
- 复购分群：窗口内下单次数 1 / 2-4 / 5+ 三桶（客户数）。
- 时段热力：固定 24 档（0-23 时），今日未来时段为 0；日趋势仅 `7d/30d` 返回（`today` 为空数组，前端改用时段柱）。

### 60.3 后台交互

- 入口：后台「履约 → 经营分析」（`pages/campus/sales`）。
- 顶部三档切换（今日 / 近 7 日 / 近 30 日），切换即重新拉取；加载中、空数据（「窗口内暂无经营数据」）、接口失败（可点「重试」）三态齐备。
- 5 张 KPI 卡（单量 / GMV / 客单价 / 新客数 / 复购率），每张带环比：正数绿色 ↑、负数红色 ↓、无上期数据为「—」。
- 经营趋势：`7d/30d` 用日趋势柱、`today` 用 24 时段柱；柱高=单量，点柱标题行显示该点日期/时段 + 单量 + 金额。
- 菜品四象限：十字线取 `medianQuantity` / `medianGmvFen`，散点按象限着色，四角标注 利润/明星/滞销/引流；下方 Top 10 商品表（名称、销量、销售额、象限）。
- 复购分群：1 单 / 2-4 单 / 5+ 单三条横向进度条，右侧显示人数与占比。
- 金额字段单位「分」，页面统一经既有 `src/utils/money.ts` 的 `fenToYuanFixed` 转元展示。
- 导出窗口（含自定义）：三类导出点击后先弹「今日 / 近 7 日 / 近 30 日 / 自定义日期…」；选前三档按该窗口重新请求；选「自定义日期…」再弹起止日期层（`picker mode="date"` 两个，默认最近 7 个自然日，含起止两天，跨度 >366 天或结束早于开始就地 toast 拦截），确定后按 `campusSalesStats(null, from, to)` 取数，文件名后缀为 `-YYYYMMDD至YYYYMMDD`；任一步取消都不发起请求。

### 60.4 验证记录

- 单测：`npx vitest run packages/campus-delivery-plugin/src/sales-stats.service.spec.ts` → **14/14 通过**（窗口/中位数/取消与跑腿排除/分群边界/四象限/时段/空数据/日趋势补零）。
- 插件构建：`npm run build` 通过（rimraf lib + tsc）。
- 线上探针（`campusSalesStats` 三档，平台超管会话）：
  - `today`：0 单 / GMV 0（今日暂无成交，页面显示空态）；
  - `7d`：1 单 / GMV ¥2.05 / 客单价 ¥2.05 / 新客 1 / 环比单量 ↓90.0%、GMV ↓69.4%；
  - `30d`：81 单 / GMV ¥3081.45 / 客单价 ¥38.04 / 客户 11 / 新客 9 / 复购率 54.5% / 环比单量 ↑161.3%；`products=9`、`cohorts={5,4,2}`。
  - 自洽断言（脚本自动化）：`sum(hourlyHeat.orders) == kpis.orders`、`sum(dailyTrend.orders) == kpis.orders`（`today` 除外）、`aovFen == round(gmvFen/orders)`，三档全部 PASS。
- 后台线上取证（`web-admin/scripts/shots-p24-sales-bi.cjs`，390×844 dpr=2，产物目录 `docs/screenshots/waimai/p24-sales-bi/`）：
  - `02-admin-sales-today.png`：今日档空数据态（「窗口内暂无经营数据」）；
  - `03-admin-sales-7d.png`：近 7 日 KPI 与环比（↓90.0% / ↓69.4% / ↑206.0%）、日趋势 7 柱、Top 商品「可乐鸡排饭」；
  - `04-admin-sales-30d.png`：近 30 日 81 单、GMV ¥3081.45、复购率 54.5%、Top 商品商品名已取翻译字段（不再出现 `#id`）；
  - `05-admin-sales-csv-export.png` + `商品结构明细-20261028.csv`：近 30 日档点「导出 CSV」，实得 9 行数据，表头 `名称,销量,销售额,象限`。
- 导出（P4-1-4）：线上点「导出 CSV」→ 下载 `商品结构明细-20261028.csv`，**9 行数据**，表头 `名称,销量,销售额,象限`，首行 `酒店测试-豪华套房,1,888.00,利润`（金额两位小数、象限已本地化）。
- 导出（P4-1-4 扩展 · 用户结构）：复购分群卡片「导出用户结构」→ 先选导出窗口（今日 / 近 7 日 / 近 30 日，与页面当前窗口解耦）→ 下载 `用户结构明细-近 30 日-20261028.csv`，**7 行数据**，表头 `分群,人数,占比(%)`；近 30 日实得 `下单客户（合计）11 / 新客 9（81.8%）/ 老客 2（18.2%）/ 复购客户（≥2 单）6（54.5%）/ 1 单 5（45.5%）/ 2-4 单 4（36.4%）/ 5+ 单 2（18.2%）`，分群三档人数合计 11 = 下单客户数、复购占比 54.5% = 页面复购率、新客+老客 = 合计，均自洽。取证：`09-admin-sales-export-range.png`（窗口弹层）、`10-admin-sales-export-toast.png` + `用户结构明细-近 30 日-20261028.csv`（`web-admin/scripts/shots-p4-exports2.cjs`）。
- 用户结构导出口径：占比基数 = 窗口内下单客户数（游客下单不计入，与 KPI 客户口径一致）；「复购客户（≥2 单）」= 2-4 单 + 5+ 单；今日档无成交时按钮不展示。
- 导出窗口（P4-1-4 扩展）：商品结构 / 用户结构 / 经营趋势三类导出点击后均先弹「今日 / 近 7 日 / 近 30 日 / 自定义日期…」选择，选前三档时按该窗口重新请求 `campusSalesStats(range)` 再生成 CSV，文件名带窗口后缀（如 `-近 30 日`）；选「自定义日期…」走下方任意起止日期链路；取消弹层不发起请求。
- 商品结构导出（按分类）：窗口选完后弹「按分类筛选」层，候选取自该窗口商品数据（不额外请求），「全部分类」= 不过滤；仅过滤 CSV 行，卡片与 KPI 仍为全店数据。
- 导出（P4-1-4 扩展 · 经营趋势）：趋势卡片「导出趋势」→ 选窗口 → 下载 `经营趋势明细-近 30 日-20261028.csv`，近 30 日 **30 行**（含无成交日补 0），表头 `时段/日期,单量,金额(元)`，单量列合计 81 = KPI 单量；今日档导出 24 行、首列为 `HH:00`。取证：`07-admin-sales-trend-export.png` + `经营趋势明细-20261028.csv`。
- 修复记录（本轮上线中发现并已修复）：
  1. 初次上线日趋势单量和（81）≠ 总单量（83）：7d/30d 原为滚动窗口，与自然日补零区间错位 → 改为「近 N 个自然日」对齐，复测 81 = 81；
  2. Top 商品显示 `#85`：`Product.name` 非实体列（走翻译表）→ 补 join `product.translations` 并按中文取名称，复测显示「可乐鸡排饭」。
- 任意起止日期（本轮新增）：
  - 单测：`vitest run src/sales-stats.service.spec.ts` → **19/19 通过**，新增 4 例覆盖：`customSalesWindow` 口径（`from` 0 点 ~ `to` 次日 0 点、上一窗口紧邻等长）、首尾日订单都计入而区间外（`to` 次日 0 点、`from` 前一刻）不计入当前区间（跨界的 `from` 前一刻订单只进上期）、区间整体在过去（`windowEnd < now`）时按实际天数补零、非法入参（空/非日期/倒序/超 366 天）抛 `UserInputError`；另 1 例覆盖商品行 `categories`（多分类全量带出、名称优先中文、无分类为空数组）。
  - 线上探针（node 直连 admin-api，平台超管会话）：`from=今天-6 & to=今天` 与 `range=7d` 的 `kpis`/`prev`/`dailyTrend` **完全一致**（自动断言 `true`），即自定义口径与预设窗口对齐；过去区间 `10-08~10-14` 返回 7 天补零、6 单 / GMV ¥512.10；错误分支三例分别返回「结束日期不能早于开始日期」「自定义区间需同时传 from 与 to」「自定义区间不能超过 366 天」。
  - 后台线上取证（`web-admin/scripts/shots-sales-custom-range.cjs`，390×844 dpr=2，产物目录 `docs/screenshots/waimai/p24-sales-bi/`）：`11-admin-sales-export-custom-entry.png`（动作面板 4 项 + 取消）、`12-admin-sales-export-custom-sheet.png`（自定义导出区间：说明「按自然日统计，含起止两天，最长 366 天」、默认 `2026-10-22 ~ 2026-10-28`、取消/确定）、`13-admin-sales-export-custom-toast.png` + `经营趋势明细-20261022至20261028-20261028.csv`（**7 行**，10-22 ~ 10-28 逐日补零，10-23 为 1 单 ¥2.05，与接口数据一致）。
- 商品结构导出按分类筛选（本轮新增）：
  - 接口：商品行新增 `categories { id name }`（所属 `Collection`，可能多个）；归类关系取 `ProductVariant.collections`（Vendure 3 已无 `Product.collections` 关系，首次按 `product.collections` join 被 `Relation with property path collections in entity was not found` 拒绝后修正），分类名取 `collection_translations` 中文优先。
  - 交互：商品结构导出在选完窗口后弹「按分类筛选」层，候选取自本次导出窗口的商品数据（不额外请求），选中后仅过滤 CSV 行，卡片与 KPI 仍为全店数据；文件名追加 `-<分类名>`（未选分类则不加）。
  - 线上探针：`range=30d` 共 9 个商品，其中 7 个带分类、`可乐鸡排饭` 未分类（该商品 `collections` 与 `tenantCategoryRef` 均为空）。
  - 后台线上取证（`web-admin/scripts/shots-sales-category.cjs`）：`14-admin-sales-export-category-sheet.png`（14 个候选项，含「全部分类」）、选「水产海鲜」→ `15-admin-sales-export-category-toast.png` + `商品结构明细-近 30 日-水产海鲜-20261028.csv`（**1 行**：`鲜活小龙虾,8,406.00,明星`）。

### 60.5 边界与已知限制

- **GMV 含配送费与打包费**：`totalWithTax` 口径；如需纯商品 GMV，看「菜品四象限」的 `gmvFen`（按 `linePriceWithTax` 汇总）。
- **未接成本价**：本轮按默认口径（销量 × 销售额）分四象限，仓库无成本字段；若后续要真毛利，需给 `ProductVariant` 增加成本价并补录入口。
- **新客需回查客户首单**：窗口内出现过的客户会触发一次 `MIN(createdAt)` 分组查询；客户量极大时需观察该查询耗时。
- **游客单**：计入单量与 GMV，不计入客户数/新客/复购/分群。
- **租户隔离同履约看板**：平台超管看全渠道汇总，店铺级账号只看本渠道（避免跨店数据泄露）。
- **四象限中位数含全部有销量商品**，列表只展示 Top 50；冷门商品不会因未展示而漏算分档线。
- **今日未来时段为 0**：时段热力不做预测，仅展示已发生数据。
- **任意起止日期仅作用于导出**：页面主视图仍是今日/7 日/30 日三档（避免把任意区间误当全站筛选）；自定义区间上限 366 天，超出由后端拦截；区间整体在过去时「今日档」语义不适用，导出趋势固定走逐日口径。
- **分类筛选只覆盖已归类商品**：分类取自 Collection 归属（Vendure 3 落在 `ProductVariant` 上），未归类商品只出现在「全部分类」导出里；候选项仅列出本窗口内出现过的分类，故不同窗口的候选可能不同。

### 60.6 部署记录（2026-10-28）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `0f89aba8e`（P4-1 后端聚合）→ `004372f65`（窗口对齐自然日）→ `3e08a50fb`（商品名取翻译）→ `git push origin master` → 服务器 `git pull` + `pm2 restart vendure` | 三档接口均 200 且自洽断言 PASS；pm2 `vendure` online（重启计数 371+） |
| 后端（任意起止日期） | 提交 `4ed5a1eac`（`campusSalesStats(from,to)` + `customSalesWindow`）→ 服务器 `git fetch + git checkout origin/master -- packages/campus-delivery-plugin/{src,lib}` + `pm2 restart vendure --update-env` | pm2 `vendure` online；线上探针 `custom == 7d` 断言 PASS、三类非法参数均按预期报错 |
| 后端（分类筛选） | 提交 `bbb8838d7`（`categories` 字段/SDL）→ `6e77f75ac`（改走 `ProductVariant.collections`）→ 服务器同法更新 + `pm2 restart vendure` | pm2 `vendure` online（重启计数 435）；线上探针 `range=30d` 9 个商品中 7 个带分类，`水产海鲜(29)` 等名称中文正确 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61678 → 61724 KB；nginx 检查通过 + 重载；`deploy done` |

---

## 61. P4-2 评价品质闭环（差评预警 / 归因 / 自动致歉券，2026-10-28）

> 本轮边界：评价的「先审后显 + 差评申诉审核」为既有能力（§6 / §45），**未重复开发**；本轮补的是「差评落库 → 自动归因 → 自动补偿 → 后台回评/关闭」的闭环。

### 61.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | 新增 `review-alert.ts`（纯函数归因词典 + 预警判定）、`review-alert.entity.ts`（`CampusReviewAlertRule` / `CampusReviewAlert`）、`review-alert.service.ts`、`review-alert.resolver.ts`、`migrations/p10-review-alert.ts`（幂等建表 + 唯一索引）；`ReviewService.createReview` 落库后调用 `recordFromReview`（try/catch 不阻断主流程）；admin SDL 新增 `ReviewAlertRule` / `ReviewAlert` / `ReviewAlertList` / `ReviewAlertStats` 4 类型 + 4 Query + 4 Mutation；单测 `review-alert.spec.ts` 22 例 |
| 后台（web-admin） | 评价管理页新增「品质预警」页签（`pages/review/list/index.vue`）：统计 KPI、规则摘要与「调整规则」弹窗、状态筛选、预警卡片；`apis/review.ts` 新增 7 个预警接口与类型；中英 i18n 命名空间 `review.alert` 40+ 键；预警明细「导出预警」CSV（P4-2 扩展，跟随当前状态 + 时间段筛选，上限 500 条） |

### 61.2 口径与接口

- **触发**：`rating <= rule.maxRating`（默认 2 星，可调 1/2/3）**或** 正文命中严重项（`异物` / `变质`，覆盖「5 星 + 正文写头发」的高星差评）。
- **归因标签**：10 类（异物 / 变质 / 少送漏送 / 口味差 / 分量少 / 不新鲜 / 变凉 / 配送慢 / 包装差 / 态度差），按词典顺序去重取前 3；纯子串匹配，英文词一并覆盖。
- **自动致歉券**：规则里配置 `couponTemplateId` 时，预警落库后立即以 `GRANT` 渠道给该顾客发一张券；发放失败/未配模板不阻断评价，`couponStatus` 记 `failed` / `none`，后台可「补发券」重试。
- **状态机**：`new`（待处理）→ `replied`（一键回评，同时写回 `Review.reply` + `repliedAt`）/ `closed`（无需回评时的兜底，可留处置备注）。
- **接口**：Query `reviewAlertRule` / `reviewAlerts(options:{skip,take,status})` / `reviewAlert(id)` / `reviewAlertStats`；Mutation `updateReviewAlertRule` / `replyReviewAlert` / `resendReviewAlertCoupon` / `closeReviewAlert`。规则每渠道一条，所有查询按 `ctx.channelId` 隔离。
- **统计**：`newCount` 待处理、`totalCount` 累计、`compensatedCount` 已发券、`last7dCount` 近 7 天。

### 61.3 后台交互

- 入口：后台「订单 → 评价管理 → 品质预警」页签。
- 顶部 4 格 KPI（待处理 / 累计预警 / 已补偿 / 近 7 天）+ 规则摘要行（`≤ N 星自动预警 · 致歉券模板 #id`），右侧「调整规则」。
- 「调整规则」弹窗：启用开关、触发星级 1/2/3、致歉券模板 ID（留空=只预警不发券），保存即生效。
- 状态筛选：待处理 / 已回评 / 已关闭 / 全部。
- 预警卡片：星级、商品名、评价时间、正文、归因标签（橙色小标签）、致歉券行（已发放显示券码，失败提示可补发）、处置说明。
- 操作：一键回评（3 条场景模板：异物致歉 / 口味温度 / 配送少送，可自由编辑，最多 500 字）、补发券（仅未发放/失败时出现）、关闭预警（可填说明）。

### 61.4 验证记录

- 单测：`pnpm --filter @vendure/review-plugin test` → `review-alert.spec.ts` **22/22**、`review.service.spec.ts` **19/19** 全部通过（e2e 套件需 `--package` 参数，属既有约定，非本轮回归）。
- 插件构建：`pnpm --filter @vendure/review-plugin build` 通过（rimraf lib + tsc）。
- 线上冒烟（`scripts/_p4_2_alert_smoke.py`，真实站点 + 真实登录）：
  - 造数：`smoke-order@yourbao.cn` 已送达订单 `X959KY3VGE68XBUZ`（line 460，商品「可乐鸡排饭」）提交 1 星评价「菜里有一根头发，米饭也是凉的，太失望了」；
  - 结果：预警 id 3 生成、标签 `["异物","变凉"]`、`couponStatus=issued` 券码 `C-XPCL-PYK4`、`reviewAlertStats={new:1,total:1,compensated:1,last7d:1}`、`productName=可乐鸡排饭`；
  - **6/6 PASS**：预警已生成 / 标签命中(异物+变凉) / 致歉券已发 / 券包可见(含券码) / 待处理计数>0 / 商品名已解析。
- 后台线上取证（`web-admin/scripts/shots-p25-review-alert.cjs`，390×844 dpr=2，产物目录 `docs/screenshots/waimai/p25-review-alert/`）：
  - `01-admin-review-alert-list.png`：KPI「1 待处理 / 1 累计 / 1 已补偿 / 1 近 7 天」、规则行、卡片含「异物 / 变凉」标签与券码 `C-XPCL-PYK4`；
  - `02-admin-review-alert-rule.png`：规则弹窗（启用开关 / 1-3 星 / 模板 ID）；
  - `03-admin-review-alert-reply-sheet.png`：一键回评弹窗，选中「异物致歉」模板后正文自动填充；
  - `04-admin-review-alert-replied.png`：提交后「已回评」页签，卡片状态转绿、待处理计数归 0；
  - `05-c-end-coupon-wallet.png`：C 端「我的优惠券 → 未使用」可见「差评致歉券-冒烟 ¥5 满 0 可用，有效期至 2026.11.11」。
- 导出（P4-2 扩展）：品质预警页签「导出预警」→ 弹层选时间段（全部时间 / 近 7 天 / 近 30 天），跟随当前状态筛选，单次最多 500 条（后端 `ReviewAlertListOptions.from/to`，非法时间报 `起始时间不合法`）。
  - 线上点「全部时间」→ `品质预警明细-20261028.csv`，1 行：`2026-10-28 08:57,1,可乐鸡排饭,异物/变凉,致歉券已发放：C-XPCL-PYK4,已回评,菜里有一根头发，米饭也是凉的，太失望了`；
  - 点「近 7 天」→ `品质预警明细-近7天-20261028.csv`，同样 1 行；接口侧另验 `from=明日 → 0 条`、`from=一年前 → 1 条`、`from=非法 → USER_INPUT_ERROR`。
  - 表头 `时间,星级,商品,归因,致歉券,状态,评价正文`，标签以 `/` 连接、正文压空白并截 300 字；取证 `06-admin-review-alert-export.png`、`07-admin-review-alert-export-range.png`、`08-admin-review-alert-export-toast.png`（`web-admin/scripts/shots-p4-exports.cjs` / `shots-p25-alert-range.cjs`）。
- 导出统计（P4-2 扩展）：同页签新增「导出统计」→ 同样先选时间段，按**归因标签 / 商品 / 星级**三个维度分组，输出 `维度,名称,条数,占比(%)`，每个维度内按条数倒序，占比基数 = 本次导出行数。
  - 线上点「全部时间」→ `品质预警统计-20261028.csv`，3 行：`归因,异物/变凉,1,100` / `商品,可乐鸡排饭,1,100` / `星级,1 星,1,100`；取证 `09-admin-review-alert-stats.png`（`shots-p4-exports2.cjs`）。
- 修复记录（本轮上线中发现并已修复）：
  1. 冒烟首跑标签只命中「异物」，「米饭也是凉的」未命中 `变凉`：词典只有「凉了/冷了」，补「凉的 / 凉透」并加单测，重新构建部署后复测 6/6 PASS；
  2. 部署脚本一度重启 `nshop`（youshop 前端服务）而非 `vendure`（API 服务），导致新词典未生效；经 `pm2 jlist` 确认 API 进程名为 `vendure`、cwd `packages/dev-server`，重启后生效。

### 61.5 边界与已知限制

- **归因靠关键词**：词典为子串匹配，方言/反讽（如「凉得真快，谢谢啊」）可能误判；`tags` 仅作分诊提示，最终处置仍由商家判断。
- **致歉券需先建券模板**：后台填的是券模板 ID，模板本身仍在「优惠券 → 模板」里维护（类型建议 `FULL` + `claimable=false` + `distributionChannels=GRANT`）。
- **同一订单行只能评价一次**：复测需另造未评价的已送达订单行（或清理该评价），不能重复提交。
- **同一评价只生成一条预警**（`reviewId` 唯一索引），补发券不会重复发预警。
- **回评内容写在评价上**：`replyReviewAlert` 同步 `Review.reply`，C 端展示位与普通「回复」一致；预警记录只留状态与处置备注。
- **规则每渠道一条**：多店铺各自配置，平台超管切换渠道后看到的是当前渠道规则。

### 61.6 部署记录（2026-10-28）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `21f1b6f00`（P4-2 后端）→ `95983386a`（Alert Node 接口/PaginatedList 修正）→ `3a54f3705`（词典补「凉的/凉透」）→ `git push origin master` → 服务器 `git checkout origin/master -- packages/review-plugin/{src,lib}/src/review-alert.*` + `pm2 restart vendure` | 冒烟 6/6 PASS；`pm2` 中 `vendure` online（重启计数 389） |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61699 KB；nginx 检查通过 + 重载；`deploy done` |

## 62. P4-4 前端埋点 + 错误上报闭环（2026-10-28）

> 本轮补齐「C 端/后台行为埋点 → 服务端批量落库 → 后台监控看板」的全链路，并让前端异常自动上报，替代此前靠日志翻查的排障方式。

### 62.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure） | 新增 `telemetry.entities.ts`（`CampusTrackEvent` / `CampusErrorReport`）、`migrations/p11-telemetry.ts`（幂等建表 + 渠道/时间索引）、`telemetry.ts`（纯函数：字段裁剪、批内去重、批量上限、7 日趋势补零、UTC+8 归日）、`telemetry.service.ts`、`telemetry.resolver.ts`（`TelemetryShopResolver` 匿名上报 / `TelemetryAdminResolver` 统计查询）、单测 `telemetry.spec.ts` 10 例 |
| C 端（waimai-v39） | 新增 `src/utils/telemetry.ts`（5s 批量队列 / 队列上限 10 / 单会话错误上限 10 / 页面自动 `page_view` / H5 `error`+`unhandledrejection`+`uni.onError` 兜底）；`App.vue` 启动即 `installTelemetry()`、`onHide` 冲队列；`main.ts` 注册 `app.config.errorHandler`；加购、下单、支付成功、提交评价 4 个关键动作埋点 |
| 后台（web-admin） | 新增 `src/utils/telemetry.ts`（与 C 端同构，`source=admin`）；`pages/campus/monitor.vue` 系统监控页（4 KPI + 7 日柱状 + Top 事件 + 埋点明细/错误上报双页签）；`src/apis/telemetry.ts`；菜单与 `pages.json`/`nav-titles.ts` 注册；中英 i18n |

### 62.2 口径与接口

- **上报接口（shop，匿名可用）**：`campusTrackEvents(input:{events:[{eventName,page,sessionId,props,createdAt}]})` 返回入库条数；`campusReportError(input:{source,level,message,stack,page,url})` 返回布尔。渠道按 `ctx.channelId` 自动归属，登录态额外写 `customerId`。
- **去重**：批内按「事件名 + 页面 + 会话 + 属性」去重；错误按「消息 + 页面」在 60 秒窗口内只落一条，避免同一个异常刷屏。
- **限额**：单批最多 50 条、字段裁剪（`eventName` 64 / `page` 128 / `props` 2KB / `message` 1KB / `stack` 4KB）；C 端队列 10 条、单会话错误上限 10 条。
- **统计接口（admin）**：`campusTrackEventStats` 返回 `todayEvents / totalEvents / todayErrors / totalErrors / affectedUsers`（今日去重顾客，游客不计）+ `trend`（固定 7 天，缺日补 0，按 UTC+8 归日）+ `topEvents`；`campusTrackEventList(eventName,skip,take)`、`campusErrorReportList(level,skip,take)` 为分页明细。
- **埋点事件**：`page_view`（每次导航自动）、`add_to_cart`、`submit_order`、`pay_success`、`review_submit`、`monitor_open` / `monitor_tab_switch`（后台自身）。

### 62.3 后台交互

- 入口：后台「系统 → 系统监控」（`pages/campus/monitor`）。
- 顶部 4 格 KPI：今日事件 / 今日错误 / 今日活跃用户 / 累计事件；下接 7 日柱状图（悬停看当日条数）。
- 「Top 事件」按次数倒序；下方双页签：埋点明细（事件名 / 时间 / 页面 / 属性 JSON）、错误上报（来源 · 级别 / 时间 / 消息 / 页面 / 栈首行）。
- 页面自身也上报 `monitor_open` 与切换页签的 `monitor_tab_switch`，可作为「上报链路是否通畅」的自检信号。

### 62.4 验证记录

- 单测：`telemetry.spec.ts` **10/10** 通过（裁剪、批内去重、批量截断、非法入参、错误归一、趋势补零与跨零点归日）。
- 插件构建：`npx tsc -p tsconfig.build.json` 通过；`lib` 打包上传 + `pm2 restart vendure`。
- 线上冒烟（真实站点，非伪造请求）：
  - C 端：真实外卖站点 `https://www.yourbao.cn/waimai/#/pages/shop/menu?token=canteen-a-token&cid=113` 加购 → 入库 `add_to_cart`（channel 113 / page `/pages/shop/menu`）+ `page_view`；随后在页面内抛未捕获 Promise 异常 → 入库 `c-end · error`「P4-4 站点冒烟：未捕获 Promise 异常（购物车同步）」。
  - 后台：监控页自上报 `monitor_open` / `monitor_tab_switch`；切换渠道 `canteen-a` 后统计随渠道隔离。
  - 数据库核对（`campus_track_event` / `campus_error_report` 分组统计）：`add_to_cart` 3 条、`page_view` 8 条、`submit_order` / `pay_success` 各 2 条、`review_submit` 1 条；错误 4 条（`c-end` 3 条 + `admin` 1 条），`page` 字段均已非空。
- 截图取证：
  - C 端 `D:\zhao\waimai-v39\docs\screenshots\p44-telemetry\`：`01-c-end-add-to-cart.png`（真实外卖店铺页加购）、`02-c-end-cart-page.png`（加购后进结算）。
  - 后台 `D:\zhao\vshop\docs\screenshots\waimai\p44-telemetry\`：`01-admin-monitor-overview.png`（KPI「20 今日事件 / 4 今日错误 / 1 今日活跃用户 / 20 累计事件」+ 7 日柱状）、`02-admin-monitor-top-events.png`、`03-admin-monitor-events.png`（明细首行即真实 C 端 `page_view` / `add_to_cart` 13:10 `/pages/shop/menu`）、`04-admin-monitor-errors.png`（错误首条即真实未捕获 Promise 异常）。
- 修复记录（本轮上线中发现并已修复）：
  1. `type CampusTrackEvent` / `CampusErrorReport` 未 `implements Node`，与 `PaginatedList.items: [Node!]!` 冲突，Vendure 启动即报 GraphQL 校验错误并反复重启（公网 503）；补 `implements Node` 后恢复；
  2. `onLaunch` 阶段页面栈为空，首条 `page_view` 的 `page` 为空串；`currentPagePath()` 增加 `location.hash` 兜底（`#/pages/...`），C 端与后台同步修复；
  3. 登录态造数需覆盖「今日活跃用户」，改用冒烟账号 `smoke-order@yourbao.cn` 带 `Authorization: Bearer` 上报后 KPI 才非 0（游客不计入活跃）。

### 62.5 边界与已知限制

- **埋点非强一致**：队列 5 秒批量、切后台/关页面可能丢失最后一批；`props` 只保留 2KB，超限会被截断并标记。
- **不支持自定义事件名**：后台只按已知事件做 Top 统计，新增事件需在代码里加 `track()` 调用，无需改后端。
- **错误上报有采样上限**：单会话 10 条，避免异常循环把库写满；需要全量排查时应看服务器日志。
- **活跃用户口径**：按 `customerId` 去重，未登录游客的事件会计入事件数但不计入活跃用户。
- **明细无清理任务**：`campus_track_event` 会持续增长，量大后需按 `createdAt` 归档（当前数据规模可忽略）。

### 62.6 部署记录（2026-10-28）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `af7c448b6`（P4-4 后端）→ `git push origin master`；服务器 `npx tsc -p tsconfig.build.json` → tar `lib` → scp 覆盖 `packages/campus-delivery-plugin/lib` → `pm2 restart vendure --update-env` | `ss -ltnp` 确认监听 3020；`https://www.yourbao.cn/shop-api` 返回 `{"data":{"__typename":"Query"}}` |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61712 KB；nginx 检查通过 + 重载；`deploy done` |
| C 端 | 提交 `197892c`（P4-4 C 端埋点）→ `cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs` | 产物校验 3833 KB；远端解压 + 备份轮转；站点返回 200 |

## 63. C 端日常功能补强：订单快捷操作 + 店内搜索空态（2026-10-28）

### 63.1 交付清单

| 端 | 内容 |
|---|---|
| C 端（waimai） | `src/pages/orders/index.vue`：订单卡片快捷区新增「催单」「申请售后」直达（复用 `api/mutations/campus.urgeOrder` 与 `pkg-order/pages/after-sale-create`）；`src/pages/shop/menu.vue`：店内搜索无结果改为专属空态 + 热搜 chips 兜底；i18n 新增 `menu.emptySearch` 中英各 1 条（其余复用 `orderDetail.urgeBtn / afterSaleBtn / urgeTitle…`） |

### 63.2 口径与交互

- **催单**：`customFields.deliveryStatus` 存在且不属于 `delivered / exception`、且本单未催过才显示；点击弹二次确认 → `urgeOrder(order.id)` → 成功后就地打 `urged` 标记，按钮即时消失（与订单详情页 `canUrge` 同口径）。
- **申请售后**：仅「已送达 24 小时内 + 无进行中售后单 + 订单未取消」显示，点击进 `/pkg-order/pages/after-sale-create?code=…`；已有售后单的订单仍走上方的「售后处理中」标记直达详情。
- **搜索空态**：关键词非空且当前分类筛完为 0 时显示「没有找到与「{k}」相关的商品」，并展示店铺热搜词（取热销商品名），点词直接替换关键词；分类本身为空仍显示「该分类暂无商品」。

### 63.3 验证记录（线上 www.yourbao.cn/waimai）

- 搜索：输入「不存在的菜品zzz」→ 空态文案正确、热搜 chips 为 `可乐鸡排饭 / 麻辣拌面 / 校园跑腿服务`（`01-menu-search-empty.png`）。
- 订单列表：登录 smoke-order 账号可见 20 张卡片；将一笔订单造数为 `deliveryStatus=in_progress` 后出现「催单 追踪骑手 开发票 再来一单」，一笔刚送达订单出现「申请售后 开发票 再来一单」（`02-orders-quick-actions.png`）。
- 造数用备份还原了两笔订单的 `customFieldsDeliverystatus / customFieldsDeliveredat`，远端与本地临时脚本均已删除；其余 18 张卡片仍只有「开发票 / 再来一单」，无多余按钮（回归通过）。

### 63.4 边界

- 催单仅对校园履约单生效（需有 `deliveryStatus`）；第三方配送/自提单不显示。
- 列表售后入口只做直达，不替代详情页完整申请流程；超过 24h 后入口隐藏，需走客服/详情页处理。
- 热搜为空时（新店无销量）只显示空态文案，不展示 chips。

### 63.5 部署记录

- C 端：`cd D:\zhao\waimai-v39 && node .secrets/deploy-waimai.mjs` → 产物校验 3835 KB、远端解压 + 备份轮转、站点返回 200。

## 64. 待付款订单续付（C 端补付入口，2026-10-28）

### 64.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure / campus-delivery-plugin） | 新增 Shop mutation `campusResumePaymentOrder(orderId: ID!): Order!`（`src/resume-payment-shop.resolver.ts` + SDL + resolver 注册）。Vendure Shop API 原生没有「切换活跃订单」能力，而 `addPaymentToOrder` 只作用于 `session.activeOrder`，导致下单后未支付成功的订单无法再次支付 |
| C 端（waimai） | `src/utils/resume-pay.ts`（续付编排：活跃购物车冲突守卫 → 切换活跃订单 → 选支付方式 → `addPaymentToOrder` → JSAPI 拉起收银台 → 轮询结算 → 失败 `cancelPayment` 回滚）；`src/api/client.ts` 新增 `getChannelClient(channelToken)`；`src/api/mutations/checkout.ts` 新增 `setActiveOrder`；`src/pages/orders/index.vue` 订单卡片「去支付」+ 金额确认弹层；`src/pkg-order/pages/order-detail.vue` 底部操作区同款入口；i18n 中英各 7 条（`orders.payNow / payTitle / payConfirm / paying / payBlockedTitle / payBlocked / payFail` + `orderDetail.payNow`） |

### 64.2 口径与交互

- **入口**：仅 `state === 'ArrangingPayment'` 的订单显示「去支付」（列表卡片快捷区首个主色按钮、详情页操作区首个按钮）。
- **支付方式选择**：`eligiblePaymentMethods` 中优先 `wechatpay-yourbao-h5`（H5 公众号 JSAPI）、其次 `wechatpay`、最后第一个可用；拉起收银台前把渠道专属 PM code 归一为 `wechatpay`，避免平台适配层识别失败。
- **渠道隔离**：订单列表按渠道聚合而来，续付全程用订单所属渠道的 `vendure-token`（`getChannelClient`），不依赖当前 `tenantStore.token`，跨店订单同样可付。
- **活跃购物车冲突守卫**：切换活跃订单前先查当前渠道的 `activeOrder`；若它不是本单且 `lines.length > 0`，返回 `blocked` 并提示「当前购物车还有 N 件商品未结算，请先完成或清空购物车后再支付该订单」。实测 Vendure 在 `ArrangingPayment` 状态下会拒绝加购（`ORDER_MODIFICATION_ERROR`），该守卫覆盖跨设备/新购物车等非常规场景。
- **失败回滚**：JSAPI 取消/失败时调用 `cancelPayment` 取消该笔 payment，订单保持 `ArrangingPayment` 可再次补付。
- **成功跳转**：`success / pending` 均跳 `/pkg-order/pages/pay-result?code=…&status=…`（与结算页支付结果口径一致）。
- **后端安全校验**：订单必须属于当前登录客户（`order.customer.user.id === ctx.activeUserId`），否则 `ORDER_NOT_FOUND`；非 `ArrangingPayment` 状态返回 `ORDER_NOT_PAYABLE`。

### 64.3 验证记录（线上 www.yourbao.cn/waimai，测试学生真实会话）

`resume-pay-e2e.cjs` 全部 PASS：

| 步骤 | 结果 |
|---|---|
| 造数 | 加购 → `campusSetDeliveryTarget(东区/桂2栋, R1)` → `campusSetShippingMethod(campus-errand-smoke)` → `transitionOrderToState(ArrangingPayment)` → 订单 434 / `6PW4GX5RVCKVWKZ3` |
| 切换活跃订单 | `campusResumePaymentOrder(434)` 返回同单；`activeOrder.id == 434` |
| 状态锁 | `ArrangingPayment` 活跃时加购被拒（`ORDER_MODIFICATION_ERROR`），说明同渠道不会与有商品的购物车并存 |
| 越权/状态校验 | 已支付订单（403）→ `ORDER_NOT_PAYABLE`；匿名调用 → `ORDER_NOT_FOUND` |
| UI 列表 | 真实数据卡片显示「待付款 … 去支付」，其余卡片无多余按钮（`01-orders-pay-btn.png`） |
| UI 弹层 | 点击「去支付」→「继续支付 / 确认支付 ¥2.00？支付成功后商家将开始备餐。取消 确定」（`02-pay-confirm-modal.png`） |
| UI 支付尝试 | 浏览器非微信环境：`wechatpay` 支付被微信拒（payment `Declined`）→ toast 提示（`03-pay-result-toast.png`）；订单仍 `ArrangingPayment`、活跃订单仍是本单（`04-orders-after-fail.png`），可再次点「去支付」 |
| 数据清理 | `cancelMyOrder(434)` → 清 `session.activeOrderId`、`payment / order_line / surcharge / order` → `orderByCode` 查无此单 |

### 64.4 边界与已知限制

- 真实支付成功需在微信内置浏览器/小程序中完成；桌面浏览器只能验证「拉起支付 → 微信拒绝 → 回滚」链路。
- 续付不会重置订单已写入的备注/餐具/发票信息（沿用原单），仅补支付这一步。
- `Created / AddingItems` 订单不走本入口（属购物车阶段，应去结算页完成地址与配送方式）。
- 同一订单重复点击会复用同一活跃订单；已取消/已支付订单入口自动消失（状态轮询 30s 内刷新）。

### 64.5 部署记录（2026-10-28）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `2f3477856` → `git push origin master`；服务器 `git fetch origin master && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib` → `pm2 restart vendure --update-env` | 重启后 503 约 8s；Schema 探针 `Mutation` 含 `campusResumePaymentOrder` |
| C 端 | `node_modules/.bin/uni.cmd build`（DONE Build complete）→ `WA_SKIP_BUILD=1 node .secrets/deploy-waimai.mjs` | 产物校验 3842 KB；站点返回 200 |

## 65. 沽清日常闭环：全店批量沽清/恢复 + C 端售罄实时同步（2026-10-28）

单品「一键沽清」在 P1/P2 期已上线（商品级 `customFields.waimaiSoldOut` + 下单闸门拦截 + C 端售罄标签）。本轮补两处日常高频缺口：**打烊/备料不足时逐个开关太慢**、**商家沽清后顾客菜单要重进才生效**。

### 65.1 交付清单

| 端 | 内容 |
|---|---|
| 后端（vendure / campus-delivery-plugin） | Admin mutation `campusMerchantSetAllProductsSoldOut(soldOut: Boolean!): CampusMerchantSoldOutBatchResult!`（`merchant-admin.service.ts#setAllProductsSoldOut`）：按 `ctx.channelId` 批量 UPDATE 本店商品 `customFieldsWaimaisoldout`，`UPDATE … RETURNING p.id` 统计实际影响条数；权限沿用 `CampusPermissions.CampusMerchant` |
| 后台（web-admin） | `pages/campus/products` 顶部新增「全店沽清 / 全店恢复」两个按钮 + 二次确认弹层（写明「C 端仍展示但不可加购、已下单不受影响」），成功后 toast「已更新 N 件商品」并重载列表；`apis/campus-ops.ts` 新增 `setMerchantAllProductsSoldOut`；中英 i18n 各 9 键 |
| C 端（waimai） | `pages/shop/menu.vue` 新增 `syncSoldOut()` 静默同步：`onShow`（从购物车/详情返回、切后台再回）与「加购被拒（售罄 toast）」时，按商品 id 回填 `waimaiSoldOut` 与规格 `stockLevel/enabled`；只改字段、不重建分类、不打断滚动位置 |

### 65.2 口径与交互

- **批量范围**：仅当前店铺渠道（`ctx.channelId`）的商品；跨渠道/其它店不受影响。
- **恢复语义**：全店恢复会把「此前单品沽清」的商品一并恢复，弹层已明示；用于打烊后第二天开门。
- **售罄表现**：C 端仍展示商品与「售罄」标签，加号禁用；售罄商品恒定排到分类末尾；加购请求仍被下单闸门二次拦截。
- **实时同步**：菜单页首次加载后仅做静默同步，不重新计算分类/筛选；同步失败静默忽略，下次回前台或下次加购被拒时重试。

### 65.3 验证记录（线上）

| 步骤 | 结果 |
|---|---|
| Schema 探针（admin-api） | `Mutation` 字段含 `campusMerchantSetAllProductsSoldOut` |
| 批量沽清（测试渠道 t2，38 件商品） | `campusMerchantSetAllProductsSoldOut(soldOut: true)` → `{ok:true, soldOut:true, count:38}` |
| 批量恢复 | `soldOut: false` → `{ok:true, soldOut:false, count:38}`；DB 复核 `t2 soldout=0/total=38`、`canteen-a soldout=0/total=3`（线上店未受影响） |
| 产物上线 | 后台产物 61729 KB、nginx 重载成功；服务器站点 `assets/index-CvpTqWet.js` 含「全店沽清」文案、`campus-ops.MXiZVhBg.js` 含新 mutation |
| C 端 | 产物 3842 KB、站点 200 |

### 65.4 边界与已知限制

- 批量操作是「全店」粒度，不支持只对某个分类批量沽清；需要分类粒度时仍逐个开关。
- 后台是全店覆盖，不区分商品是否参与其它渠道；批量恢复同样作用于本店全部商品。
- C 端同步不改变已加入购物车的行项目，商家沽清后老购物车行仍可在结算时被下单闸门拦截提示。

### 65.5 部署记录（2026-10-28）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 提交 `26eab68eb` → `git push origin master`；服务器 `git fetch origin master && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib` → `pm2 restart vendure --update-env` | `vendure` online（重启计数 442） |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs`（内含 `uni build` + tar/scp/解压/备份轮转 + nginx reload） | 产物校验 61729 KB；`nginx -t` 通过并 reload |
| C 端 | `node_modules/.bin/uni.cmd build` → `WA_SKIP_BUILD=1 node .secrets/deploy-waimai.mjs` | 产物校验 3842 KB；站点返回 200 |

## 66. 沽清次日自动恢复（2026-10-28）

打烊用「全店沽清」后常忘记恢复，第二天开市菜品仍售罄。本轮加**每日 04:00 自动恢复**，且只恢复「全店沽清」批次，单品手动沽清不受影响。

### 66.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | 迁移 `p11-soldout-auto-restore`（幂等）：建表 `campus_soldout_batch("channelId","productId")` 唯一索引 + `channel."customFieldsWaimaisoldoutautorestore" boolean DEFAULT true`；`SoldOutAutoRestoreJob`（启动 2 分钟后首检、每 10 分钟一轮、每日仅跑一次，本地时间 04:00 起执行）按店铺恢复批次内商品并清空登记；`merchant-admin.service` 新增 `get/setSoldOutAutoRestore`、`clearSoldOutBatch` |
| 后端接口 | Query `campusMerchantSoldOutAutoRestore: CampusSoldOutAutoRestore!`（enabled/pending）；Mutation `campusMerchantSetSoldOutAutoRestore(enabled: Boolean!)` |
| 后台 | 一键沽清页新增开关「次日 04:00 自动恢复沽清」+ 文案「当前登记 N 件；单品手动沽清不受影响」，切换即存；`apis/campus-ops.ts` 同步两个接口 |

### 66.2 口径

- 只有通过「全店沽清」标记的商品会进入批次表；单打开关任意方向都会清掉该商品的批次登记（手动意图优先）。
- 关闭开关时批次登记保留，重新开启后下一个 04:00 继续生效。
- 自动恢复只把 `waimaiSoldOut` 置回 false，不动上下架/库存；C 端下次 `onShow` 静默同步后即可加购。

### 66.3 验证记录（线上）

| 步骤 | 结果 |
|---|---|
| 初始状态 | `{enabled:true, pending:0}` |
| 全店沽清（t2，38 件） | `count:38` → `pending:38` |
| 关/开开关 | `enabled:false,pending:38` → `enabled:true,pending:38`（登记保留） |
| 全店恢复 | `count:38` → `pending:0`；DB `campus_soldout_batch=0`、`t2_soldout=0`、开关列存在 |
| 后台产物 | 61731 KB；服务器 `assets/index-CKfRVSll.js` 含「次日 04:00 自动恢复沽清」、`campus-ops.CHk-q8yE.js` 含新接口 |

### 66.4 踩坑与修正

首版把开关声明为 `Channel` customField 并注册批次实体，生产 schema sync 与迁移并发加列触发 PG `42703 column ... does not exist`，站点 503。修正：开关列只由幂等迁移补、服务层用原生 SQL 读写，批次表不注册实体（纯 SQL），重启后正常。

### 66.5 部署记录

- 后端：`878155494`（首版）→ `756a9682e`（修正），服务器 checkout `src/lib` + `pm2 restart vendure`。
- 后台：`cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` → 产物 61731 KB，nginx reload 成功。

## 67. 营业时间自动开关门 + 打烊前提醒（2026-10-28）

营业时段外「不可下单」的下单闸门与 C 端「休息中」展示此前已存在，缺的是**商家侧不可见**：看不到什么时候自动打烊、临打烊没人提醒、C 端页面停留时状态不刷新。本轮补齐这三处。

### 67.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | `business-hours.ts` 新增纯函数 `nextBusinessTransition(raw, now)`：返回「下一次自动开门 / 自动打烊」的 `action / at / inMinutes / today`，作为前后端唯一时间口径；`merchant-admin.service` 的 `campusMerchantBoard` 增加 `openNow / businessHours / nextTransition`，`campusMerchantStoreProfile` 增加 `nextTransition`；`campus-delivery.plugin.ts` 新增 GraphQL 类型 `CampusBusinessTransition` |
| 后台 | 新增 `web-admin/src/utils/closing-reminder.ts`（打烊前 15 分钟橙色横幅 + 语音播报，与 `orderAlertHub` 相互独立）；商家工作台顶栏下新增倒计时条「今日 21:00 自动打烊 · 还剩 12 分钟」/「明日 10:00 自动开门 · 还剩 674 分钟」，≤15 分钟变橙；营业状态开关文案三分支（营业中 / 已打烊（临时休息）/ 已打烊（非营业时段））；经营设置页「营业时间」下方展示下次切换文案，并新增「打烊前提醒」开关，页面挂载后每分钟回读一次 profile |
| C 端 | `pages/shop/menu.vue` 的 30s 轮询从「固定刷新」改为「跨边界回读」：比较 `getStoreStatus().state === 'closed'` 是否翻转，翻转即重拉店铺信息，页面停留时也能在开门/打烊瞬间切换「休息中」 |

### 67.2 口径与契约

- `nextBusinessTransition`：在相邻三天（k=-1/0/+1）内把每个时段 `start` 视作「开门」、`end` 视作「打烊」，取**严格大于当前分钟**的最小边界；未配置营业时间返回 `null`。
- 时区固定 UTC+8（`campusNowMinutes`），支持多时段与跨零点（如 `18:00-02:00`）。
- **营业状态是「算出来」的，不是定时任务写出来的**：`openNow` 由营业时段 + 当前时间实时计算，下单闸门同样实时校验，因此不存在「定时任务漏跑导致状态卡死」的问题。
- `openNow` 与 `paused` 正交：`paused=true` 是商家手动「临时休息」，`openNow=false` 是营业时段外；后台按此分文案，C 端统一呈现「休息中」。
- 提醒阈值 `CLOSING_WARN_MIN = 15`：仅 `nextTransition.action === 'close' && inMinutes <= 15` 触发；去重键 `${today?'T':'N'}|${at}` 存 `localStorage.closingWarnFiredAt`，同一场次只提醒一次；语音 12s 互斥（`closingWarnTtsLock`）、横幅 15s 自动隐藏；`localStorage.closingWarnMuted` 记录开关关闭态。

### 67.3 权限与校验

- 读：`campusMerchantBoard` / `campusMerchantStoreProfile` 沿用既有商家权限，原生 SQL 按 `ctx.channelId` 过滤，跨店铺不可见。
- 写：本轮未新增写接口，营业时间仍由 `updateStoreProfile` 写入渠道自定义字段。
- 下单闸门：`order-gate.process.ts` 在 `toState=ArrangingPayment` 时校验营业时间（跑腿单豁免），打烊抛 `UserInputError('店铺已打烊（营业时间 ...），暂不可下单')`——本轮未改动，只补商家端可见性。

### 67.4 数据库变更

无。复用既有渠道自定义字段。**踩坑**：生产库实际列名为全小写 `customFieldsWaimaibusinesshours`（TypeORM 建列时对 customFields 转小写），原生 SQL 写成驼峰会报 `42703 column "customFieldsWaimaiBusinessHours" does not exist`。

### 67.5 验证记录

| 步骤 | 结果 |
|---|---|
| 单测 | `vitest run src/business-hours.spec.ts` → 14 tests passed（`nextBusinessTransition` 5 组：未配置→null / 营业中→close / 打烊后→今日·明日 open / 跨零点 / 整点边界） |
| 编译 | `tsc -p tsconfig.build.json` exit 0，`lib/` 随提交入库 |
| 线上探针（t2 `10:00-22:55`，当时 22:46） | board / profile 均 `openNow:true`，`nextTransition:{action:"close",at:"22:55",inMinutes:9,today:true}` |
| 线上探针（t2 `10:00-22:00`） | `openNow:false`，`nextTransition:{action:"open",at:"10:00",inMinutes:674,today:false}` |
| 还原 t2 营业时间 | `businessHours:null, openNow:true, nextTransition:null` |
| 后台截图（`docs/screenshots/waimai/p17-business-clock/`，脚本 `web-admin/scripts/shots-p17-business-clock.cjs`） | `01-admin-board-closing-soon.png`：clock「今日 21:00 自动打烊 · 还剩 12 分钟」、warn=true、横幅「打烊提醒：营业时间 21:00 结束，还有 12 分钟，请及时处理未完成订单」；`02-admin-board-closed-by-hours.png`：「明日 10:00 自动开门 · 还剩 674 分钟」、开关「已打烊」；`03-admin-settings-next-close.png`：经营设置下次切换文案 +「临时休息 / 打烊前提醒」两行 |
| 线上产物哈希 | C 端 `pages-shop-menu.EewP3qNt.js` 本地/线上 MD5 均 `042430AB8F19B0FFB06D7804B25B2B50`；后台 `pages-campus-store-settings.DuaRdXyU.js` 均 `AFEC444F1B6F333FA29F6F74E5C923A5` |

### 67.6 边界与已知限制

- 提醒只在页面打开时生效（商家工作台 / 经营设置页在前台）：关掉浏览器收不到任何提醒，需要不漏提醒得接公众号模板消息或短信。
- C 端靠 30s 轮询 + `onShow` 刷新，不是长连接；开门瞬间最长约 30s 展示滞后，但下单闸门是服务端实时校验，不会误下单。
- 营业时段为单档配置（每天相同），不支持节假日 / 单日例外。
- 时区固定 UTC+8，多时区门店不适用。
- 打烊后已支付订单不受影响，仍按既有流程履约。

### 67.7 部署记录（2026-10-28）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `7b2b609d5`（功能）+ `9cd6a9ac1`（原生 SQL 列名修正）→ `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online；探针通过 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61736 KB；nginx reload 成功 |
| C 端 | `npx uni build` → `WA_SKIP_BUILD=1 node .secrets/deploy-waimai.mjs` | `DONE Build complete.`；部署 3842 KB，`200 deploy done` |
| 线上 | `https://e.joho.cn/guanli/`、`https://www.yourbao.cn/waimai/` | 均 HTTP 200（后台域名是 `e.joho.cn`；`www.yourbao.cn/guanli/` 会走 nginx fallback 返回 562B HTML，不能用于产物校验） |

操作入口：
- 商家工作台：顶部状态开关下方倒计时条；临近打烊（≤15 分钟）自动弹橙色横幅 + 语音播报。
- 经营设置：营业时间下方「下次 21:00 自动打烊」提示 + 「打烊前提醒」开关（关掉后不再横幅/播报）。
- C 端店铺页：页面停留跨过开门/打烊时刻，30s 内自动切换「休息中」或恢复可下单。

## 68. 菜品每日限量 / 每人限购（2026-10-29）

沽清（§65/§66）解决的是「卖完了就别卖」，但商家常需要「今天只做 20 份」「每人最多买 2 份」这类额度控制：既不想手动盯着剩几份再点沽清，也要防止单个顾客扫货。本轮补上商品级每日限量 + 每人限购，售完自动按沽清口径展示，次日随 §66 的自动恢复一起归零。

### 68.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | 新增 `daily-limit.ts`（纯函数 `normalizeLimit / remainingOf / checkDailyLimit / localDayRange` + 原生 SQL `queryDailySold / findDailyLimitViolation`，前后端唯一口径）；`Product` 自定义字段新增 `waimaiDailyLimit` / `waimaiPerUserLimit`；`merchant-admin.service` 商品列表返回 `dailyLimit / perUserLimit / soldToday / remaining` 并新增 `setProductLimit`；`waimai-store.service` 新增公开查询 `dailyStock`；`order-gate.process.ts` 在营业时间 / 黑名单 / 沽清之后追加第 4 道闸门；幂等迁移 `p12-daily-limit.ts` |
| 后台 | `pages/campus/products.vue` 商品卡新增「限量 每日 20 份（已售 17，剩 3） · 每人限购 2 份」行与「改限量」入口，弹层内填每日限量 / 每人限购（留空 = 不限），带「清除 / 保存」；`apis/campus-ops.ts` 新增 `setMerchantProductLimit`；中英 i18n 新增 15 个 key |
| C 端 | `pages/shop/menu.vue` 商品卡新增「仅剩 N 份」标签（剩余 ≤10 份才展示，售完走既有「售罄」样式）；加购前本地校验「每人限购 / 当日剩余」，命中即 toast 拦截；加购成功本地扣减额度；回前台 / 售罄同步时顺带刷新额度；`api/queries/waimai.ts` 新增 `fetchDailyStock` |

### 68.2 口径与契约

- **额度按 UTC+8 当日已支付订单实时聚合，不落用量表**：`localDayRange` 取本地日 `[00:00, 次日 00:00)`，统计 `orderPlacedAt` 落在区间内、`state ∈ PaymentAuthorized / PaymentSettled / PartiallyShipped / Shipped / PartiallyDelivered / Delivered` 的订单行数量。次日自然归零，**无需定时任务重置**（与 §66 的沽清自动恢复互不影响）。
- **渠道口径**：Vendure `Order` 没有 `channelId` 列（渠道是多对多），按 `order_channels_channel` 关联过滤 —— 踩坑见 68.4。
- **配置语义**：留空 / `null` / `0` / 负数 → 不限；上限 9999；`perUserLimit > dailyLimit` 拒绝保存。
- **校验优先级**：`每人限购` 先于 `全店剩余`，文案分别为「商品「X」每人限购 N 份，您今日已购买 M 份」「商品「X」今日限量 N 份，还剩 R 份，请调整数量」；服务端闸门在结算时复核（本单不计入自身）。
- **C 端展示阈值**：`LEFT_TAG_MAX = 10` —— `0 < remaining ≤ 10` 才显示「仅剩 N 份」，避免大额限量也刷成噪音；`remaining = 0` 直接走 `goodSoldOut`，与商家一键沽清同一样式。
- **未登录**：`campusProductDailyStock` 的 `myToday / myRemaining` 返回 `null`，C 端只做全店剩余拦截，限购由服务端结算闸门兜底。

### 68.3 权限与校验

- 读：`campusMerchantProducts` 沿用 `CampusMerchant` 权限，`assertProductInChannel` 保证只能看到本渠道商品；`campusProductDailyStock` 为 `@Allow(Permission.Public)`，只返回当前渠道有限量配置的商品，不暴露成本/库存等其他字段。
- 写：`campusMerchantSetProductLimit` 为 `CampusMerchant`，先校验商品归属渠道，再校验数值范围与「每人限购 ≤ 每日限量」。
- 下单闸门：`order-gate.process.ts` 在 `toState = ArrangingPayment` 时依次校验营业时间（跑腿单豁免）→ 黑名单 → 沽清 → 每日限量 / 每人限购，命中抛 `UserInputError`，订单保持原状态。

### 68.4 数据库变更

| 表 | 变更 |
|---|---|
| `product` | 新增 `customFieldsWaimaidailylimit int`、`customFieldsWaimaiperuserlimit int`（列名全小写，TypeORM 对 customFields 转小写） |

迁移形态：`OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS`，逐条执行、单条失败只打日志不阻断启动，重复启动安全（生产 `synchronize: false`）。

**踩坑（本轮两处，均在线上探针暴露后修复）**：
1. `CampusProductDailyStock` 类型只写在 admin-api 扩展里，shop-api 引用后启动即崩：`extendSchema ERROR: Unknown type "CampusProductDailyStock"`，进程反复重启（`pm2` 重启计数飙升）。修复：类型在 admin / shop 两套扩展各自声明（commit `c850166d4`）。
2. 当日销量 SQL 误用 `o."channelId"`：Vendure `Order` 无此列（渠道为多对多），报 `column o.channelId does not exist`。修复：改 `EXISTS (SELECT 1 FROM order_channels_channel occ WHERE occ."orderId" = o.id AND occ."channelId" = $1)`（commit `2f1368777`）。

### 68.5 验证记录

| 步骤 | 结果 |
|---|---|
| 单测 | `vitest run src/daily-limit.spec.ts` → 9 tests passed（`normalizeLimit` / `remainingOf` / `checkDailyLimit` / `localDayRange` 四组，含 UTC+8 跨日边界） |
| 编译 | `tsc -p tsconfig.build.json` exit 0（`TSC OK`），`lib/` 随提交入库 |
| 生产库核验 | `information_schema`：`product` 两列 `customFieldsWaimaidailylimit` / `customFieldsWaimaiperuserlimit` 均存在 |
| 线上 shop-api | 未配置限量时 `campusProductDailyStock` → `[]`；临时把商品 83 设为「每日 5 / 每人 2」后 → `[{productId:"83",dailyLimit:5,perUserLimit:2,soldToday:0,remaining:5,myToday:null,myRemaining:null}]`（未登录 my 为 null） |
| 线上 admin-api | `campusMerchantSetProductLimit(productId:"83",dailyLimit:5,perUserLimit:2)` → `{ok:true,dailyLimit:5,perUserLimit:2,soldToday:0,remaining:5}`；随后 `dailyLimit:null,perUserLimit:null` 还原 → `remaining:null`，shop-api 恢复 `[]` |
| 后台截图（`docs/screenshots/waimai/p18-daily-limit/`，脚本 `web-admin/scripts/shots-p18-daily-limit.cjs`） | `01`：宫保鸡丁「限量 每日 20 份（已售 17，剩 3） · 每人限购 2 份」、米饭「每日 50（已售 46，剩 4） · 每人 5」、凉拌黄瓜「限量 不限」；`02`：弹层标题「每日限量 / 每人限购」、提示「额度按今日已支付订单实时统计（当前已售 17 份），次日自动归零」、两输入回填 `20` / `2` |
| C 端截图（同上目录，本地 waimai dist + shop-api 全 mock） | `03`：商品卡「仅剩 3 份」「仅剩 8 份」；`04`：点凉拌黄瓜「+」→ toast「每人限购 1 份，您今日还可买 0 份」 |
| 线上产物 | C 端 `assets/index-CKjOEQl4.js` 含「仅剩」；后台 `assets/index-53P1YYbk.js` 含「每日限量」 |

### 68.6 边界与已知限制

- **并发可略超额度**：额度是「下单前查已支付订单」的乐观校验，两个顾客同时结算可能各买到剩余份数，服务端闸门只做最终兜底，不是强一致性锁（与既有沽清同口径）。
- **只统计已支付**：待付款 / 已取消订单不占额度；顾客下单不付 → 额度不减少，超时关闭后也不需回补。
- **未登录不知自己已购**：C 端 `myRemaining` 为 null 时本地只能拦全店剩余，限购在结算时由服务端拦截。
- **额度与多规格共享**：额度挂在商品（Product）上，多个规格共用同一份当日份数。
- **不做跨日预约**：只按当日已支付统计，不支持「明天留 5 份」这类预约额度。
- **不占库存**：限量是「可售份数」上限，不写入 Vendure StockLevel，库存与限量各自独立校验。

### 68.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `51d30f2cc`（功能）+ `c850166d4`（shop-api 类型补声明）+ `2f1368777`（渠道关联 SQL 修正）→ `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online，启动日志无 `extendSchema` 报错；探针全通过 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61741 KB；nginx reload 成功 |
| C 端 | `npx uni build` → `node .secrets/deploy-waimai.mjs` | `DONE Build complete.`；产物校验 3845 KB，`200 deploy done` |
| 线上 | `https://e.joho.cn/guanli/`、`https://www.yourbao.cn/waimai/` | 均 HTTP 200（后台域名是 `e.joho.cn`） |

操作入口：
- 后台商品管理：商品卡「限量」行 →「改限量」→ 填每日限量 / 每人限购（留空 = 不限）→ 保存；已售与剩余实时显示。
- C 端店铺页：剩余 ≤10 份时商品名旁显示「仅剩 N 份」，售完自动变「售罄」；超限加购直接 toast 拦截。

## 69. 商家自动接单（2026-10-29）

「商家接单确认模式」（`merchantConfirmEnabled`）让支付后的订单先停在「待接单」，等人点确认。单量一多，高峰期商家来不及点，订单干等甚至触发超时兜底转自营。本轮补上**自动接单**：营业中且未临时休息时，新单在「延迟秒数」后自动确认进入备餐，与手动接单完全同一条状态机（出餐屏、云打印、用户通知一并生效）；休息 / 非营业 / 打到每日上限时静默退回人工。

### 69.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | 新增 `auto-accept.ts`（纯函数 `normalizeAutoAcceptRoutes / isAutoAcceptDue / canAutoAcceptStatus` + 常量 `AUTO_ACCEPT_*`，前后端唯一口径）；`CampusFulfillmentConfig` 新增 4 列；`Order` 自定义字段新增 `autoAcceptedAt`；`merchant-admin.service` 抽出 `transitionToAccepted(ctx, orderId, trigger)`（手动/自动共用），新增 `autoAcceptSettings / updateAutoAccept / countAutoAcceptedToday`；新增 `auto-accept.job.ts`（15s 周期、首跑延迟 45s、按渠道咨询锁）；GraphQL `campusMerchantAutoAccept` 查询 + `campusMerchantUpdateAutoAccept` 变更；幂等迁移 `p13-auto-accept.ts` |
| 后台 | `pages/campus/store-settings.vue` 营业状态卡后新增「自动接单」卡（启用开关 + 延迟秒数 + 每日上限 + 今日已自动接单数 + 适用路线 chips + 保存）；`apis/campus.ts` 新增两个接口；中英 i18n 各 22 个 key |
| C 端 | 无改动：自动接单只改变商家侧状态，C 端仍按既有订单轮询看到「商家已接单」 |

### 69.2 口径与契约

- **触发内核与手动接单一致**：`transitionToAccepted` 用条件写 `hall.transitionFrom(ctx, orderId, ['pending_merchant'], { hallStatus:'accepted', autoAcceptedAt? })`，CAS 失败即视为已被人工接单 / 取消 / 超时兜底转出，自动任务直接跳过，**不会重复接单**。
- **等待时长口径**：`enteredAt = customFieldsHallenteredat ?? createdAt`，`elapsed ≥ delaySeconds` 才接。延迟范围 0-600 秒，0 = 立即接；留出的窗口用于顾客改址 / 商家拒单。
- **营业闸门**：`openNow = isWithinBusinessHours(channel.waimaiBusinessHours) && !cfg.paused`，与 C 端下单闸门、店铺页「营业中」同口径；休息或非营业时段**不自动接**（避免无人出餐），订单继续待接单等人工处理。
- **每日上限**：`autoAcceptDailyLimit`（0-999，0 = 不限）按 **UTC+8 自然日** 统计当天 `autoAcceptedAt` 落在当日区间的订单数，达上限后本轮停止接单、新单回到人工；跨零点自动归零，无需定时重置任务。
- **适用范围**：`autoAcceptRoutes` 只接受 `R1 / R2 / R3`（商户自送 / 第三方快递 / 校园传信者），未勾选路线的订单不自动接；空数组回落全选（不允许一条都不选）。
- **前置条件**：店铺须开启「商家接单确认模式」——否则支付后订单直接进配送流程、不存在 `pending_merchant`，自动接单无处生效（后台卡片会显式提示）。
- **多实例幂等**：每个渠道用 `pg_try_advisory_lock(hashtext('campus:autoaccept:<channelId>'))` 串行化，拿不到锁直接跳过本轮；单渠道单轮最多扫 50 单，积压按 id 升序先接最老的。
- **接单即出票**：若 `printMode = onAccepted` 且打印通道非 local，自动接单同样触发云打印；用户通知走 `orderAccepted` 模板（未配置模板则静默跳过）。

### 69.3 权限与校验

- 读 `campusMerchantAutoAccept` / 写 `campusMerchantUpdateAutoAccept` 均为 `CampusMerchant` 权限，渠道由 `ctx.channelId` 决定，不能跨店。
- `updateAutoAccept` 只组装 4 个白名单字段后走 `CampusConfigService.updateConfig`，复用其整型区间（延迟 0-600 / 上限 0-999）与路线合法性校验；非法路线整批拒绝。
- 后台保存前本地再校验一次（整数、区间、至少勾一条路线），避免把明显错误送进服务端。

### 69.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_fulfillment_config` | `"autoAcceptEnabled" boolean NOT NULL DEFAULT false`、`"autoAcceptDelaySeconds" int NOT NULL DEFAULT 30`、`"autoAcceptDailyLimit" int NOT NULL DEFAULT 0`、`"autoAcceptRoutes" text NOT NULL DEFAULT '["R1","R2","R3"]'`（simple-json 存 text） |
| `order` | `"customFieldsAutoacceptedat" timestamp`（列名全小写，TypeORM 对 customFields 转小写） |

迁移形态：`OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS`，重复启动安全（生产 `synchronize: false`）。

**踩坑（线上探针暴露后修复）**：p13 迁移最初把 4 个配置列写成全小写（`autoacceptenabled` 等），但 TypeORM 实体列物理名是 **camelCase 保留大小写**（同表既有 `"merchantConfirmEnabled"` 即为证据）。后端一上线，`getConfig` 的 SELECT 找不到列 → 商家经营设置 / 工作台 / 任何读履约配置的接口全部报 `column does not exist`。修复：①生产库 `ALTER TABLE ... RENAME COLUMN` 立即改名恢复线上；②迁移源码与 `auto-accept.job.ts` 的 `WHERE "autoAcceptEnabled" = true` 同步改为 camelCase（commit `8bdac7947`），重新部署后启动迁移因 `IF NOT EXISTS` 自动空跑。

**同轮修掉的既有阻断**：`updateConfig` 的「开启超时赔付必须有券模板」校验原本无条件执行，而生产 28 个渠道全是「赔付默认开 + 无模板」，导致**任何**配置写入（临时休息、公告/电话、自动接单）都被拒。已把该收窄为**仅在本次 patch 触碰赔付字段时校验**（commit `4890f717f`），临时休息与设置保存恢复可用。

### 69.5 验证记录

| 步骤 | 结果 |
|---|---|
| 单测 | `vitest run src/auto-accept.spec.ts src/campus-config.service.spec.ts` → 7 + 20 tests passed（路线清洗 / 开关与休息 / 延迟边界含 0 秒 / 适用范围 / 日上限 19→20 卡点 / 状态判定；配置服务 20 项回归含新字段区间） |
| 编译 | `npm run build`（`rimraf lib && tsc -p tsconfig.build.json`）exit 0，`lib/` 随提交入库 |
| 生产库核验 | `information_schema`：4 列均为 camelCase 且存在；`order` 的 `customFieldsAutoacceptedat` 存在；改名后重启无列缺失报错 |
| 线上 admin-api（28 个渠道逐个） | `campusMerchantAutoAccept` 全部返回 `{enabled:false,delaySeconds:30,dailyLimit:0,routes:["R1","R2","R3"],acceptedToday:0,openNow:true,...}` —— 证明 `getConfig` 恢复正常 |
| 配置写入 | 测试渠道 `t1`：`campusMerchantUpdateAutoAccept(enabled:true,delaySeconds:5,dailyLimit:2)` → 回读一致；`campusMerchantSetPaused(paused:true)` → `{ok:true}`（赔付校验收窄生效） |
| 真实自动接单 | 受控单 `order 25`（t1）置为 `pending_merchant`（入厅 60s 前）→ 下一轮 tick 自动变 `accepted`，`customFieldsAutoacceptedat` 落库；⚠ 首次测试时暂停开关尚未生效，订单在暂停前被接走，重做严格时序后结论成立 |
| 临休不接 | t1 `paused=true` 期间把同一单置为 `pending_merchant`，等待 35s 仍为 `pending_merchant` 且 `autoacceptedat` 为空 |
| 恢复后继续接 | t1 `paused=false` 后下一轮 tick（约 8s）订单变 `accepted`，`customFieldsAutoacceptedat` 落库 |
| 日计数 | 回读 `acceptedToday:1`，与 `customFieldsAutoacceptedat` 当日订单数一致 |
| 还原 | 订单 `customFields*` 清空回原状；t1 配置复位（enabled=false / 30s / 0 / 全路线 / paused=false），不留测试痕迹 |
| 后台截图（`docs/screenshots/waimai/p69-auto-accept/`，脚本 `web-admin/scripts/shots-p69-auto-accept.cjs`） | `01`：关闭态「未启用」+ 提示「本店未开启「商家接单确认模式」，自动接单暂不生效」；`02`：开启态「已启用」、延迟 `5`、上限 `2`、「今日已自动接单 1 单」、三条路线全部高亮、按钮「保存自动接单」 |

### 69.6 边界与已知限制

- **需要接单确认模式**：未开启 `merchantConfirmEnabled` 的店铺没有 `pending_merchant` 环节，自动接单不生效（后台卡片有提示，不做隐式切换）。
- **乐观并发**：自动任务与人工接单同时到达时由条件写兜底，只有一方成功；不会出现「重复接单」或「接单与拒单并存」。
- **休息 / 非营业一律不接**：为保证「有人出餐」，休息时段、营业时段外都不自动接，订单积压到恢复营业后下一轮 tick 才处理。
- **日上限按订单数**：计数口径是「当天被自动接单的订单条数」，同一单被人工接走不计入；上限 0 表示不限，跨零点自然归零。
- **仅三步状态机**：自动接单只做 `pending_merchant → accepted`，不代替出餐 / 拒绝；接单后商家仍可拒单（走既有拒单退款）。
- **local 打印通道不联动**：`printProvider = local` 依赖收银电脑页面，自动接单不保证出票，需切云打印才能「接单即出票」。

### 69.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `3a1358ca3`（功能）+ `8bdac7947`（配置列名 camelCase 修复）+ `4890f717f`（赔付券校验收窄）→ `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online；`https://e.joho.cn/health` 200；启动日志无列缺失报错 |
| 生产库 | `ALTER TABLE campus_fulfillment_config RENAME COLUMN "autoacceptenabled" TO "autoAcceptEnabled"`（另三列同理） | 4 列全部 camelCase；`getConfig` 与自动接单探测恢复正常 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs`（两次：首次带 `{n}` 未插值的卡片，修复后二次部署） | 产物校验 61748 KB；nginx reload 成功 |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：后台「经营设置」→「自动接单」卡片 → 打开「启用自动接单」→ 设延迟秒数（0-600）/ 每日上限（0 = 不限）→ 勾选适用配送方式 → 保存。卡片第一行会提示「本店未开启商家接单确认模式」时先联系运营开启确认模式。

## 70. 营业日历：指定日期休业（2026-10-29）

营业时间管「每天几点到几点」，临时休息管「现在歇一会儿」，但都表达不了「国庆休 3 天」「设备检修一天」这类**按自然日**的停业。本轮补上**营业日历**：商家登记若干休业日期（可带备注），当天 C 端店铺页显示「今日休业（备注）」并禁止下单，次日 0 点自动恢复，无需人再手动开门。

### 70.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | 新增 `closure-calendar.ts`（纯函数：`normalizeClosureDates` 写入严格校验 / `safeClosureDates` 读取宽松兜底 / `closedToday` / `nextClosure` + 常量 `MAX_CLOSURE_ENTRIES=30`、`CLOSURE_HORIZON_DAYS=90`、`CLOSURE_NOTE_MAX=40`）；`closure-calendar.spec.ts` 9 个用例；`CampusFulfillmentConfig` 新增 `closureDates`（simple-json text）；`campus-config.service` 白名单 + 写入校验；`waimai-store.service` 店铺列表新增 `closedToday / closureNote` 并统一 `openNow` 口径；`merchant-admin.service` 新增 `updateClosureDates`，`storeProfile / board / autoAcceptSettings` 三处 `openNow` 同步收紧；`order-gate.process` 新增 `findTodayClosure` 闸门（1b）；`auto-accept.job` 休业日不自动接单；resolver 新增 `campusMerchantSetClosureDates(dates: String)`（JSON 字符串入参）；幂等迁移 `p14-closure-calendar.ts` |
| 后台 | `pages/campus/store-settings.vue` 营业状态卡后新增「营业日历」卡（pill 今日休业/已设 N 天、今日休业提示、休业列表删除、日期选择器 + 备注 + 添加、保存休业日历）；营业状态 pill 增加「今日休业」；`apis/campus.ts` 新增 `campusMerchantSetClosureDates` 并扩字段；中英 i18n 各 17 个 key |
| C 端 | `api/queries/waimai.ts` 店铺列表查询加 `closedToday closureNote`；`pages/shop/menu.vue` 今日休业文案（含备注）+ 禁止结算、跨校园日自动回读；`pkg-order/pages/cart.vue` 购物车按店拦截并展示「今日休业 · 暂停接单」；`utils/store-filter.ts`「仅看营业中」过滤休业店铺；中英 i18n 各 2 个 key |

### 70.2 口径与契约

- **可下单三条件**：`openNow = 营业时段内 && 未临时休息 && 今日不在休业日历`。C 端列表、商家工作台/经营设置/自动接单设置、下单闸门、自动接单任务共用同一判定，不存在某一端「以为在营业」。
- **按校园自然日（UTC+8）**：日期键 `YYYY-MM-DD` 由 `campusDayKey(now)` 生成，与营业时间、经营数据统计同一天口径；「次日自动恢复」即跨过 0 点日期键变化，不依赖定时任务。
- **写入严格 / 读取宽松**：`campusMerchantSetClosureDates` 走 `normalizeClosureDates` —— 非数组、格式错、假日期（如 `2026-02-30`）、早于今天、超出今天起 90 天、备注超 40 字、超过 30 条，任一条都整批拒绝并回中文原因；读取侧 `safeClosureDates` 对脏条目（JSON 解析失败、字段缺失、已过期）逐条忽略，**绝不因为一条脏数据让整店营业判定失败**。
- **整表覆盖语义**：接口入参是完整列表，传 `[]` 即清空；同日期重复时后者覆盖前者（前端「添加」时同日只更新备注并提示）。
- **闸门文案**：命中休业时 `UserInputError("本店今日休业（备注），暂不可下单，请明日再来")`；跑腿单（errand）豁免，与营业时间校验同规则。
- **与临时休息的区别**：临时休息（`paused`）立即生效且需人手动恢复，C 端文案「商家休息中」；休业日历按日期自动生效/自动恢复，文案「今日休业（备注）」，两者互不覆盖。

### 70.3 权限与校验

- 读写均为 `CampusMerchant` 权限；渠道由 `ctx.channelId` 决定，商家只能改本店日历。
- `updateConfig` 白名单新增 `closureDates`，其余字段（营业时间/公告/电话/暂停/自动接单）仍沿用既有校验，互不影响。
- 后台在提交前先本地校验（今天起 90 天内、30 条上限、备注 40 字），服务端仍做最终裁决，两侧口径一致。

### 70.4 数据库变更

| 表 | 变更 |
|---|---|
| `campus_fulfillment_config` | `"closureDates" text`（simple-json：`[{date:'YYYY-MM-DD', note?:string}]`，NULL/空 = 不启用） |

迁移形态：`OnApplicationBootstrap` + `ADD COLUMN IF NOT EXISTS`；列名按实体 camelCase 保留大小写（§69 的踩坑结论），重复启动安全（生产 `synchronize: false`）。

### 70.5 验证记录

| 步骤 | 结果 |
|---|---|
| 单测 | `vitest run src/closure-calendar.spec.ts src/order-gate.process.spec.ts src/campus-config-validation.spec.ts src/schema-consistency.spec.ts` → 9 + 9 + 7 + 3 共 28 tests passed（含「今日休业拦截 + 备注文案」用例、假日期/过去日期/超范围拒绝、跨日恢复） |
| 编译 | `tsc -p tsconfig.build.json --noEmit` exit 0；`npm run build`（`rimraf lib && tsc`）exit 0，`lib/` 随提交入库 |
| 生产库核验 | `information_schema`：`campus_fulfillment_config."closureDates"` 存在（camelCase） |
| 线上 admin-api | 渠道 `canteen-b`：`campusMerchantSetClosureDates([今日 §70探针, 明日 国庆假期])` → 回读 `{openNow:false, closedToday:true, closureNote:'§70探针', closureDates:2 条}` |
| 线上 shop-api | 同一时刻 `waimaiStoreList` 对应店铺 `{openNow:false, closedToday:true, closureNote:'§70探针'}` —— C 端列表口径一致 |
| 校验拒绝 | 过去日期 `2020-01-01` → `休业日期不能早于今天：2020-01-01`；假日期 `2026-02-30` → `休业日期格式不合法：「2026-02-30」（需 YYYY-MM-DD）` |
| 还原 | 回写原空列表 → `{openNow:true, closedToday:false, closureNote:null}`，shop-api 同步恢复；测试渠道无残留 |
| 线上 C 端（`https://www.yourbao.cn/waimai/` 店铺页，临时登记今日休业「设备检修」） | 顶部条幅「🌙 今日休业（设备检修） · 暂停接单，可先加购」；底部按钮文案变「已打烊」且置灰不可点；无 GraphQL 报错；取证后已清空休业日期并回读恢复正常 |
| 后台截图（`docs/screenshots/waimai/p70-closure-calendar/`，脚本 `web-admin/scripts/shots-p70-closure-calendar.cjs`） | `01`：营业状态 pill「今日休业」+ 营业日历 pill「今日休业」+ 提示「今日休业（国庆假期）：C 端展示「今日休业」并停止下单，明日 0 点自动恢复营业。」+ 今日/明日两条列表；`02`：营业中 + pill「已设 2 天」+ 两条未来休业（校园运动会 / 设备检修）+ 新增表单与「保存休业日历」 |

### 70.6 边界与已知限制

- **只按日期、不按时段**：休业日历以自然日为单位（整天停业），半天休业请用「临时休息」。
- **不校验营业时间**：休业日即使配置了营业时间也不营业；反之非营业时段即使没有休业记录也不可下单——两者是「与」关系。
- **最多 30 条 / 90 天视界**：只覆盖今天起 90 天，超出会被拒绝；长假期需逐日登记（可一次提交多日）。
- **不自动通知顾客**：登记休业不会推送消息；已下单未出餐的订单仍需人工处理（点击「拒单退款」）。
- **跑腿单不受限**：与营业时间一致，跑腿代购不受休业日历限制。
- **次日恢复依赖服务端时钟**：以 UTC+8 自然日为准；若服务器时间异常，恢复时点会偏移。

### 70.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `555afb6bc` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online；启动迁移自动加列，无报错 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 产物校验 61756 KB；nginx reload 成功 |
| C 端 | `npx uni build` → `node .secrets/deploy-waimai.mjs` | `DONE Build complete.`；产物校验 3845 KB，`200 deploy done` |

操作入口：后台「经营设置」→「营业日历」→ 选择日期（今天起 90 天内）+ 填备注（选填）→「+ 添加」→ 可删除已有日期 →「保存休业日历」。今日命中休业时，卡片 pill 与「营业状态」pill 均显示「今日休业」并给出恢复说明。

## 71. 休业日未出餐订单提醒（2026-10-29）

§70 的边界里留了一条：登记休业不会通知顾客，**休业当天已下单未出餐的订单仍需人工处理**。商家往往在休业日不看工作台，导致 `待接单 / 备餐中` 的存量单一直挂着，顾客等到超时。本轮把这条边界变成可见提醒：休业当天只要有未出餐订单，商家工作台顶部与经营设置营业日历卡都会醒目提示，并支持一键跳到对应栏。

### 71.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | `merchant-admin.service.ts` 的 `MerchantBoard` / `MerchantStoreProfile` 各新增 `unfinishedOrders`，`MerchantBoard` 另加 `closedToday` / `closureNote`；`board()` 用已算出的 `pending/cooking` 列表计数（`pending.length + cooking.length`），`storeProfile()` 用一条 `getCount()`（`hallStatus IN ('pending_merchant','accepted')`）轻量计数；GraphQL schema 为 `CampusMerchantBoard` 与 `MerchantStoreProfile` 补三个字段 |
| 后台 | `pages/campus/merchant.vue` 新增红色提醒条（今日休业且有未出餐时显示，点击切到「待接单」或「备餐中」栏）；`pages/campus/store-settings.vue` 营业日历卡新增同款红字提示；`apis/campus.ts` 扩字段与查询；中英 i18n 各 2 个 key（`campusMerchant.closedWithUnfinished` / `campusStoreSettings.closureUnfinished`） |
| C 端 | 无改动（提醒只面向商家） |

### 71.2 口径与契约

- **未出餐 = 待接单 + 备餐中**：`unfinishedOrders = pending_merchant + accepted` 的条数；出餐完成（`open`，进入大厅/待取货）即退出该计数，配送中、待推送等栏不计。避免把「已交给骑手」的单误报成「没出餐」。
- **只在休业日提示**：前端条件是 `closedToday && unfinishedOrders > 0`；非休业日即使有未接单也不弹这个提醒（工作台本来就有「待接单」角标与语音播报）。
- **提示不阻断操作**：休业只是停止**新单**，存量单仍需正常接单/出餐/拒单，因此提醒条只做跳转引导，不提供禁用按钮。
- **与 C 端口径同源**：`closedToday` / `closureNote` 复用 `closedToday(safeClosureDates(cfg.closureDates))`，与 §70 的 C 端「今日休业」、下单闸门完全一致，不会出现「C 端休业、后台以为营业」。
- **计数实时性**：工作台 10s 轮询 board，经营设置进入页面即读 storeProfile，刷新粒度与既有工作台一致。

### 71.3 权限与校验

- `campusMerchantBoard` / `campusMerchantStoreProfile` 均为 `CampusMerchant` 权限，渠道由 `ctx.channelId` 决定，只统计本店订单，与现有查询共用同一渠道隔离。

### 71.4 数据库变更

无（新增字段全部为运行时聚合，不落库）。

### 71.5 验证记录

| 步骤 | 结果 |
|---|---|
| 编译 | 后端 `npm run build`（`rimraf lib && tsc -p tsconfig.build.json`）exit 0，`lib/` 随提交入库；后台 `npm run build:h5`（uni build）`DONE Build complete.` |
| 单测 | `vitest --run` 全量 628 例：610 passed / 18 failed —— 18 个失败均为既有历史用例（`waimai-store.service.spec` 云打印校验前置、`rider-task.service.spec` 飞书告警断言），与 §71 改动文件无关；`closure-calendar.spec` 9 例仍全绿 |
| 线上 admin-api（渠道 `canteen-a`） | 现状 `{closedToday:false, closureNote:null, unfinishedOrders:0, closureDates:[]}`；临时登记今日休业「§71探针」→ `storeProfile{closedToday:true, closureNote:'§71探针', unfinishedOrders:0}`、`board{closedToday:true, closureNote:'§71探针', unfinishedOrders:0}`，字段全部可解析 |
| 计数一致性 | `board.unfinishedOrders === board.pending.length + board.cooking.length`（探针时均为 0，`ok:true`） |
| 还原 | 回写原空列表 → `{closedToday:false, closureNote:null, closureDates:[]}`，生产无残留 |
| 后台截图（`docs/screenshots/waimai/p71-closure-unfinished/`，脚本 `web-admin/scripts/shots-p71-closure-unfinished.cjs`） | `01`：商家工作台顶部红色条「今日休业（设备检修），仍有 3 单未出餐，请尽快处理 ›」，下方「待接单 2 / 备餐中 1」与两张待接单卡片；`02`：经营设置·营业日历卡内红字「今日休业仍有 3 单未出餐，请到商家工作台「待接单/备餐中」尽快处理。」 |

### 71.6 边界与已知限制

- **只提醒不代处理**：不会自动接单、不会自动拒单；休业日存量单如何处置（照做 / 拒单退款）仍由商家决定。
- **口径不含配送环节**：`待推送快递 / 外部快递中 / 待自营接单 / 配送中` 均不计入「未出餐」；若这些环节也卡单，需看对应栏角标。
- **依赖工作台轮询**：提醒依赖页面刷新（10s 轮询或进入页面），不是推送通知；商家完全不开页面时不会看到。
- **休业登记本身不通知顾客**：§70 的边界仍在，本轮只减少商家漏处理，不改变对顾客的告知方式。

### 71.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `319afb03c` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online，重启无报错 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61758 KB；nginx reload 成功（`signal process started`） |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台（「商家接单」页）顶部出现红色条「今日休业（备注），仍有 N 单未出餐，请尽快处理」，点击即跳到「待接单」（无待接单时跳「备餐中」）；经营设置 →「营业日历」卡内同样有红字提示，便于设置休业时先看还有没有存量单。

## 72. 营业日历：批量连选日期区间（2026-10-29）

§70 的营业日历只能一天一天加：国庆休 7 天要重复点 7 次日期、填 7 次备注。本轮把「新增休业日期」升级为**起止区间批量添加**——选「开始日期 ~ 结束日期」，一次写入区间内每一天（同一备注），结束日期留空仍是原来的单日用法。后端与 C 端零改动：`campusMerchantSetClosureDates(dates: String)` 入参本就是完整列表，批量只是前端一次写入多条。

### 72.1 交付清单

| 端 | 内容 |
|---|---|
| 后台 | `pages/campus/store-settings.vue` 营业日历「新增休业日期」改为「开始日期 ~ 结束日期」双 picker + 备注 + 一次添加；新增 `newEndDate` / `onPickEndDate`、`expandDateRange`（UTC 逐日展开，含首尾）；`addClosure` 支持区间批量（结束≥开始、单次 ≤30 天、整表 ≤30 条、已存在日期只更新备注）；`onPickDate` 在开始日期晚于已选结束时自动清空结束日期；中英 i18n 各 5 个 key（`closureRangeEndPh` / `closureRangeHint` / `closureRangeBad` / `closureRangeMax` / `closureRangeAdded`），并把 `closureDatePh` 文案改为「选择开始日期」 |
| 后端 | 无改动（复用 §70 的整表覆盖接口与 `normalizeClosureDates` 校验） |
| C 端 | 无改动（休业日判定与文案完全沿用 §70） |

### 72.2 口径与契约

- **区间含首尾**：`start..end` 逐日生成，如 `2026-10-30 ~ 2026-11-05` = 7 条；日期串用 UTC 零点累加 86 400 000 ms 生成，不受浏览器时区/夏令时影响，与后端 `campusDayKey`（UTC+8）同一天口径。
- **结束留空 = 单日**：`end = 结束日期 || 开始日期`，老用法（只点一个日期）行为不变。
- **同一备注**：区间内每一天共用当前备注输入；备注为空时列表显示「未填备注」。
- **已存在日期只更新备注**：不重复占位、不增加条数，避免区间与已有单日条目重叠时出现重复行；新日期按日期升序插入列表。
- **上限与 §70 一致**：单次区间 ≤30 天、整表 ≤30 条、今天起 90 天视界、备注 ≤40 字；前端先拦，服务端 `normalizeClosureDates` 仍整批裁决。
- **保存仍是整表覆盖**：添加只改本地列表，点「保存休业日历」后才落库并对 C 端生效。

### 72.3 权限与校验

- 未新增接口与权限：仍是 `CampusMerchant` 权限 + `ctx.channelId` 渠道隔离，商家只能改本店日历。
- 前端本地校验：开始/结束日期格式与 90 天范围、`结束 ≥ 开始`、单次区间 ≤30 天、整表 ≤30 条、备注 ≤40 字；结束日期 picker 的 `start` 绑定为已选开始日期，从交互上就先挡住「结束早于开始」，开始日期后移时会把早于它的结束日期清空。
- 服务端校验不变（`normalizeClosureDates` 对假日期、过去日期、超范围、超条数整批拒绝并回中文原因）。

### 72.4 数据库变更

无（`campus_fulfillment_config."closureDates"` 沿用 §70，数据结构与写入语义完全不变）。

### 72.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5`（uni build）`DONE Build complete.`，仅 Sass legacy-js-api 弃用告警 |
| 截图脚本交互 | 脚本在 1200×900 桌面尺寸下写入 `input[type=date]` 并派发 `change`（等价用户点选），再缩回 390×844 出图；`01 pick true`，读取状态 `range:["2026-10-30","2026-11-05"]`、`note:"国庆假期"` |
| 批量添加结果 | 点击「+ 添加」后 `items` 一次出现 7 条（`2026-10-30`…`2026-11-05`，备注均为「国庆假期」）、pill 变「已设 7 天」、Toast「已批量添加 7 天休业日期」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 后台截图（`docs/screenshots/waimai/p72-closure-range/`，脚本 `web-admin/scripts/shots-p72-closure-range.cjs`） | `01`：营业日历卡 pill「未设置休业」、区间选择器 `2026-10-30 ~ 2026-11-05`、备注「国庆假期」、两段提示（区间用法 + 90 天/30 条/40 字规则）；`02`：pill「已设 7 天」+ 7 条同备注休业行（各带「删除」）+ Toast「已批量添加 7 天休业日期」，表单已清空待下次录入 |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200；本次为纯前端改动，未改动后端/C 端，故未重复 admin-api 探针 |

### 72.6 边界与已知限制

- **只支持连续区间**：不连续的多个区间（如 10-30~11-01 + 11-05~11-07）需分两次添加。
- **单次 ≤30 天**：超过 30 天的长假需拆成两段；整表仍受 §70 的 30 条上限约束，添加时若会超限会直接提示「最多设置 30 条休业日期」。
- **区间无预览**：添加后需在列表核对日期是否齐全（最多 30 条，一屏可滚动查看）。
- **备注统一**：一次批量只有一个备注，同一区间内不能逐日写不同备注；需要区别时按段分别添加。
- **未保存不生效**：批量只改本地列表，刷新页面即丢失，仍需点「保存休业日历」。
- **休业日存量单提醒仍看 §71**：批量登记不会处理已下单未出餐的订单，休业当天工作台红色提醒照旧。

### 72.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs`（脚本内含 `build:h5`） | `DONE Build complete.`；产物校验 61760 KB；nginx `syntax is ok` + reload `signal process started`，`deploy done` |
| 后端 | 无改动，未部署 | — |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：后台「经营设置」→「营业日历」→「新增休业日期」选开始日期，再选结束日期（留空 = 仅当天）→ 填备注（选填，区间内共用）→「+ 添加」，一次写入区间内所有日期（已存在的日期自动改为该备注）→「保存休业日历」生效。

## 73. 商家工作台：批量接单 / 批量出餐（2026-10-29）

饭点高峰一批订单同时进店，工作台只能一单一单点「接单」「出餐完成」。本轮在「待接单」「备餐中」两栏加**多选 + 批量条**：勾选若干单后一次「批量接单」或「批量出餐」，后端逐单走**既有单笔状态机**（接单通知、接单即出票、按路线分流出餐全部复用），失败单跳过并在结果里回报，不会把已成功的单回滚。

### 73.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | 新增 `batch-orders.ts` 纯函数 + `batch-orders.spec.ts`；`merchant-admin.service.ts` 新增 `batchAcceptOrders` / `batchCookingDone` / 私有 `runBatch`；`merchant-admin.resolver.ts` 新增 2 个 mutation；`campus-delivery.plugin.ts` schema 新增 `campusMerchantBatchAcceptOrders(orderIds: [ID!]!)` / `campusMerchantBatchCookingDoneOrders(orderIds: [ID!]!)` 与 `CampusMerchantBatchResult { ok: Int!, failed: [CampusMerchantBatchFailure!]! }` |
| 后台 | `pages/campus/merchant.vue`：卡片勾选框（仅待接单/备餐中显示）、已选描边、当前栏「已选 N」角标、批量条（全选 / 已选 N 单 / 批量接单·批量出餐 / 处理中禁用）、二次确认弹窗、结果 Toast（全成功 / 部分失败带首条原因）；换栏与轮询自动收敛勾选集合；`apis/campus.ts` 新增 2 个接口封装与类型；中英 i18n 各 13 个 key |
| C 端 | 无改动 |

### 73.2 口径与契约

- **逐单复用既有状态机**：批量接单内部就是循环调用 `acceptOrder`（`pending_merchant → accepted`，含顾客通知、`printMode=onAccepted` 的云打印、自动接单留痕口径不变）；批量出餐循环调用 `cookingDone`（按 `fulfillmentRoute`/`deliveryPlan` 分流到 `merchant_delivering / owned_dispatched / pending_dispatch / owned_pool / open`）。不新增任何状态，也不绕过条件写防并发。
- **失败跳过、部分成功**：每单单独 `try/catch`，失败（状态已变更、已脱厅、订单不存在、非本店）只进 `failed[]`，后续单继续执行；返回 `{ ok: 成功单数, failed: [{ orderId, message }] }`，后台按 `ok + failed.length` 汇总提示。
- **入参闸门**：`normalizeBatchOrderIds` 对 `orderIds` 去空白、去重（重复项不占上限名额）、保持勾选顺序；空集合 →「请选择要操作的订单」，超过 50 单 →「单次最多批量操作 50 单，请分批处理」（均以 `UserInputError` 回显后台）。
- **本地打印口径**：`printMode=onAccepted` 且本地通道（C-Lodop）时，批量接单成功后前端对**成功单**逐张入打印队列（沿用串行队列 + 失败退避重试一次）；云通道由后端接单即出票，不重复打。
- **勾选集合自动收敛**：切换 tab、或 10s 轮询后订单已流转/被取消时，失效 id 自动移出勾选，避免对过期单重复点批量。

### 73.3 权限与校验

- 两个新 mutation 均 `@Allow(CampusPermissions.CampusMerchant)`，且沿用 `assertChannelOrder` 的 `ctx.channelId` 店铺隔离——批量里混入其它店铺/不存在的单只会在 `failed[]` 里回报「订单不存在或不属于当前店铺」。
- 前端拦截：未勾选时批量按钮禁用；批量执行中按钮禁用并显示「处理中…」；执行前必须过二次确认弹窗（文案含单数与被执行动作）。
- 服务端拦截：空集合 / 超 50 单直接拒绝；单笔状态机自身的校验（状态不匹配、并发条件写失败）继续按原样生效。

### 73.4 数据库变更

无（不新增表/列/枚举，批量只是对既有 `hallStatus` 状态机的多次条件写）。

### 73.5 验证记录

| 步骤 | 结果 |
|---|---|
| 单测 | `npx vitest run src/batch-orders.spec.ts`：5 例全绿（去重保序、单值入参、空集合/全空白报错、恰好 50 可用 / 51 报错、重复项不占名额） |
| 后端编译 | `npm run build`（`rimraf lib && tsc -p tsconfig.build.json`）exit 0，`lib/` 随提交入库 |
| 后台构建 | `node scripts/deploy.mjs`（内含 `build:h5`）`DONE Build complete.`，仅 Sass legacy-js-api 弃用告警；产物校验 61766 KB |
| 截图脚本交互 | `01`：点「全选」后状态 `count:"已选 2 单"`、`picks:2`、`selectedCodes:["A2400007","A2400008"]`、tab 角标 `2`；`02`：弹窗标题「确认批量接单」、正文「将对已选 2 单执行接单，失败订单会自动跳过并在结果中提示。」、按钮 `["取消","批量接单"]`；确认后 mock 按状态机把 2 单搬入备餐中，`03`：备餐中 3 单、`count:"已选 3 单"`、按钮「批量出餐」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 schema（`canteen-a-token`） | `__type(name:"Mutation")` 含 `campusMerchantBatchAcceptOrders` / `campusMerchantBatchCookingDoneOrders`；`CampusMerchantBatchResult` 字段 `["ok","failed"]` |
| 线上入参闸门 | 空集合 → `"请选择要操作的订单"`；51 单 → `"单次最多批量操作 50 单，请分批处理"` |
| 线上失败回报（不改真实单） | 两个不存在单号 → `{ok:0, failed:[{99990001,"订单不存在或不属于当前店铺"},{99990002,"订单不存在或不属于当前店铺"}]}`；探针时 `board{待接单 0, 备餐中 0}`，生产无残留 |
| 后台截图（`docs/screenshots/waimai/p73-batch-orders/`，脚本 `web-admin/scripts/shots-p73-batch-orders.cjs`） | `01`：待接单 2 单全选，批量条「全选 · 已选 2 单 · 批量接单」，两张卡片橙色勾选 + 描边；`02`：批量接单二次确认弹窗；`03`：备餐中 3 单全选，批量条「批量出餐」 |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 73.6 边界与已知限制

- **单次上限 50 单**：更多订单需分批；上限前后端同口径，前端多选不设上限也会被服务端拒绝（提示分批）。
- **串行执行、非事务**：批量按顺序逐单处理，单笔失败不回滚已成功的单；网络中断时已处理的单已落库，未处理的停下，重试前请刷新看板。
- **只覆盖两栏**：待推送快递 / 外部快递中 / 待自营接单 / 配送中等仍是一单一单操作（这些动作多为平台/骑手侧，不属商家批量场景）。
- **不做批量拒单**：拒单涉及退款 + 取消，属不可逆高危操作，仍保持一单一确认，避免误退全款。
- **打印耗时随单量线性**：本地 C-Lodop 通道批量接单后逐张出票，50 单会排队较久；大批量建议用云打印通道（服务端直连）。
- **勾选不跨栏保留**：切到其它栏会清空勾选，防止把待接单的单带到备餐中按钮上执行。

### 73.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `e7f9da366` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online（重启后 10s 内正常拉起） |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61766 KB；nginx `syntax is ok` + reload `signal process started`，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → 选「待接单」或「备餐中」→ 批量条点「全选」或逐单点卡片左上角勾选框 → 点「批量接单」/「批量出餐」→ 确认弹窗点确认 → Toast 汇总（全成功提示「已成功 N 单」，有失败提示「成功 X 单，失败 Y 单（原因）」）。

## 74. 商家工作台：订单检索 / 筛选 / 按楼栋分组（2026-10-29）

饭点订单多起来后，工作台十个分栏里的卡片只能靠肉眼翻找：找某一单要滑屏、找某一栋楼的几单要来回扫。本轮在看板上方加**检索 + 筛选条**：一个输入框按**单号（可只输后 4/8 位）、楼栋、区域、顾客手机尾号、备注**匹配；区域用 chips 一键收窄；再加**按楼栋分组拣单**开关，同楼栋的单自动聚到一组、组头显示单数与最早等待分钟，便于一次集中拣同一栋楼。卡片同时展示**脱敏顾客手机号**（点击复制），便于与顾客对单。

### 74.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | `merchant-admin.service.ts`：`board()` 查询增加 `leftJoinAndSelect('order.customer','customer')`；`toDto` 增 `customerPhone`，取值 `privacy.mask(customer.phoneNumber)`（复用号码保护的脱敏口径，绝不返回明文）；`MerchantBoardOrder` 接口同步加字段；`campus-delivery.plugin.ts` schema `MerchantBoardOrder` 新增 `customerPhone: String` |
| 后台 | `pages/campus/merchant.vue`：检索条（关键词输入 + 清空）、区域 chips（全部区域 + 本栏实际出现的区域）、按楼栋分组开关、结果计数条（共 N / M 单 + 清除筛选）、检索无结果专属空态、卡片脱敏手机行（点击复制）、组头（楼栋 + 单数 + 最早等待）；过滤/分组变化清空勾选，全选只作用于可见单；`apis/campus.ts` 类型增 `customerPhone`；中英 i18n 各 10 个 key |
| C 端 | 无改动 |

### 74.2 口径与契约

- **关键词多字段一次匹配**：`单号`（含后 4 位、8 位，「A2400007」输 `0007` 即命中）、`楼栋`、`区域`、`备注`、`脱敏手机号里的数字段`；全部不区分大小写，命中任一即保留。空关键词 = 不过滤。
- **区域 chips**：取当前栏实际出现的区域（不受自身筛选影响，已选中的 chip 不会因筛掉其它单而消失）；`全部区域` 即取消区域筛选。
- **计数口径**：计数条显示 `共 N / M 单`，N = 命中单数、M = 当前栏总单数；分栏角标仍显示该栏总单数（不随筛选变化），避免商家误判整店单量。
- **空态分层**：筛选生效且 0 命中 → 「没有匹配的订单：试试单号后 4 位、楼栋名、手机尾号或备注关键词」+「清除筛选」按钮；筛选未生效且该栏本来就空 → 沿用「暂无订单」。两者不混用。
- **脱敏手机**：后端即脱敏（`11 位 → 138****1111`，非 11 位保留首尾），前端只做展示与复制；复制的是脱敏文本，不产生明文外泄；未登录顾客手机为空时该行不显示。
- **分组口径**：按 `区域 + 楼栋` 分组（同名楼栋跨区域不混组），组内保持后端原顺序（等待时间升序），组间按「最早等待分钟」降序（等最久的先拣）；关闭分组 = 单组无组头，铺平展示。分组只影响展示，不改变后端查询。
- **批量勾选联动（承接 §73）**：关键词或区域变化、切分组开关，都立即清空勾选；「全选」只选**当前可见单**（筛选/分组后的列表），因此批量接单/出餐不会误伤被筛掉的单；10s 轮询后已流转单仍会被自动移出勾选。
- **纯前端过滤**：看板本只拉活跃流转单（量级通常几十单），检索在内存内完成，不额外打 GraphQL；历史单/已送达单需到运营侧的订单列表查询。

### 74.3 权限与校验

- 无新增 Query/Mutation：`campusMerchantBoard` 仍 `@Allow(CampusPermissions.CampusMerchant)`，并沿用 `ctx.channelId` 店铺隔离——检索只能看到本店活跃单。
- 手机号脱敏在服务端完成，前端拿不到明文；即使前端被篡改也无法从看板接口取得完整手机号（明文仅 `orders` 等运营接口在具备 ReadOrder 权限时可见）。
- 前端仅做展示层筛选，不改变任何写操作资格：拒单/接单/出餐等仍走原有二次确认与状态机校验。

### 74.4 数据库变更

无（不新增表/列/枚举；只是查询多 join 了既有 `customer` 关系，DTO 多一个派生字段）。

### 74.5 验证记录

| 步骤 | 结果 |
|---|---|
| 脱敏函数 | 编译产物直测 `new PrivacyNumberService(null).mask('13800001111')` → `138****1111`；`mask('abc')` → `a***c`；`mask(null)` → `null` |
| 后端编译 | `npm run build`（`rimraf lib && tsc -p tsconfig.build.json`）exit 0，`lib/` 随提交入库 |
| 后台构建 | `node scripts/deploy.mjs`（内含 `build:h5`）`DONE Build complete.`，仅 Sass legacy-js-api 弃用告警；产物校验 61773 KB；nginx `syntax is ok` + reload，`deploy done` |
| 截图脚本交互 | `01`：输入「宿舍」→ `count:"共 3 / 4 单"`、卡片 `["A2400007","A2400009","A2400010"]`、`phones:["手机：138****1111","手机：137****3333","手机：136****4444"]`、chips `["全部区域","东区","西区"]`；`02`：开启分组 → 组头 `东区 1 号宿舍楼/1 单/最早等 25 分钟`、`西区 7 号教学楼/1 单/最早等 18 分钟`、`东区 3 号宿舍楼/2 单/最早等 6 分钟`（按等待降序）；`03`：输入 `zzz` → 空态 true、`共 0 / 4 单`、卡片 0 张、批量条自动隐藏 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 schema（`canteen-a-token` + Bearer 令牌） | `campusMerchantBoard { pending { code customerPhone } ... }` 返回 200、无 `FORBIDDEN`、无字段校验错误 → `customerPhone` 已上线 |
| 线上数据现状 | 探针时该渠道活跃单为 0（各栏皆空），且历史订单 `customer.phoneNumber` 多为 `null`，故生产暂无样本可展示脱敏值；脱敏取值以编译产物直测 + 截图 mock 覆盖 |
| 后台截图（`docs/screenshots/waimai/p74-order-search/`，脚本 `web-admin/scripts/shots-p74-order-search.cjs`） | `01` 检索命中态（计数 + 区域 chips + 脱敏手机行）；`02` 按楼栋分组（三组组头）；`03` 检索无结果空态（含「清除筛选」） |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 74.6 边界与已知限制

- **星号段不可匹配**：脱敏号形如 `138****1111`，中间 4 位以星号替身，故按手机尾号只能命中**可见数字段**（如 `138`、`1111`）；若顾客完整尾号落在星号段（如 `5678`），关键词搜不到。需要按完整手机号精确定位时，请走运营侧订单查询或号码保护虚拟号。
- **只在活跃单范围内检索**：看板不拉历史单/已送达单，检索不能替代订单报表；跨日对账请到运营后台订单列表。
- **关键词不匹配商品名/骑手名**：按需求只覆盖单号/楼栋/区域/手机/备注；搜商品或骑手仍在对应分栏内翻找（如需要可后续扩展为按行项目匹配）。
- **区域 chips 依赖后端 `campusZone`**：未配置区域的单不进任何 chip 命中（选「全部区域」仍可见），也不会被分组到有名字的楼栋组头下（会显示为空白前缀组）。
- **分组不改变处理顺序**：只影响展示聚合，实际出餐/接单仍按各卡按钮执行；批量动作受 §73 的单次 50 单上限约束。
- **复制的是脱敏文本**：如需拨号请联系运营侧或依赖号码保护的虚拟号（本地提示「已复制到剪贴板」，粘贴后不可直接拨通）。

### 74.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `6922ffd2f` → `git push origin master`（`e7f9da366..6922ffd2f`）→ 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib && pm2 restart vendure --update-env` | pm2 `vendure` online；重启后 admin-api 正常应答 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61773 KB；nginx `syntax is ok` + reload `signal process started`，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页顶部 → 在检索框输入单号后几位 / 楼栋名 / 区域 / 手机可见数字 / 备注关键词（或点区域 chip 收窄）→ 顶部计数条显示「共 N / M 单」，右侧「清除筛选」一键复位 → 需要按楼栋集中拣单时打开「按楼栋分组」，组头即楼栋 + 单数 + 最早等待分钟 → 卡片「手机：138****1111 ⧉」点击即复制脱敏号。

## 75. 商家今日已完成明细 + 对账（2026-10-29）

打烊前要对账：今天做成了多少单、收了多少、退了多少，哪几单是刷单/异常单。本轮给商家加**「已完成对账」页**：按区间（今日 / 近 7 日 / 自定义）列出**已送达订单明细**（单号、时间、实收、楼栋、脱敏手机、菜品、备注），顶部 5 个汇总指标（完成单量 / 订单总额 / 退款金额 / 实收总额 / 客单价），列表支持关键词检索（同 §74 口径），并可**一键复制对账清单**到剪贴板发给老板或贴进表格。

### 75.1 交付清单

| 端 | 内容 |
|---|---|
| 后端 | `merchant-admin.service.ts`：新增 `MerchantCompletedOrder` / `MerchantCompletedOrders` 类型与 `completedOrders(ctx, { from, to, take, skip })` 方法——区间汇总（`COUNT` + `SUM(subTotalWithTax + shippingWithTax)`）、明细分页（`lines`/`productVariant`/`customer` 关联，按 `deliveredAt` 倒序）、当页订单退款聚合（`refund` JOIN `payment`，排除 `Failed`）、区间退款总额、楼栋/骑手名批量补全、`privacy.mask` 脱敏手机；`merchant-admin.resolver.ts` 新增 Query `campusMerchantCompletedOrders`；`campus-delivery.plugin.ts` 新增 SDL 类型 `CampusMerchantCompletedOrder` / `CampusMerchantCompletedOrders` 并在 Query 中声明 |
| 后台 | 新建 `pages/campus/completed-orders.vue`（区间切换 + 自定义日期 + 5 指标 + 检索 + 明细卡 + 复制清单 + 分页加载）；`pages/campus/merchant.vue` 顶部「今日完成（单）/（金额）」两个 stat 可点进对账页；`apis/campus.ts` 新增 `campusMerchantCompletedOrders` 查询与类型，并给 `ORDER_FIELDS` 补 `customerPhone`（§74 实际未请求该字段）；`pages.json` 注册新页；中英 i18n 新增 `campusCompleted` 命名空间 |
| C 端 | 无改动 |

### 75.2 口径与契约

- **已完成口径**：`customFields.deliveryStatus = 'delivered'` **且** `customFields.deliveredAt` 落在区间内（与工作台「今日完成」同源，避免把退款后仍标 delivered 的异常单算进成交）。区间为**左闭右开**：`[start, end)`。
- **校园时区日界**：区间按 UTC+8 自然日计算（`startOfCampusDay` / `campusDayKey`），不随部署服务器时区漂移；「今日」= 校园时区今天 0 点至当前时刻；「近 7 日」= 今天往前 6 个自然日 0 点至当前时刻；「自定义」= 起始日 0 点至结束日**次日** 0 点（含结束日当天）。
- **金额口径（分）**：订单总额 = `subTotalWithTax + shippingWithTax`（即顾客实付口径的订单金额，含配送费）；退款金额 = 未失败退款单（`refund.state <> 'Failed'`）的 `total` 之和；实收总额 = 订单总额 − 退款金额；客单价 = 实收总额 / 完成单量（四舍五入取整分）。前端以 `fenToYuan` 展示。
- **汇总与明细关系**：汇总（单量/总额/退款/客单）由**全区间**聚合查询得出，不受分页截断；明细按 `take`（默认 100，上限 300）分页追加，前端「加载更多」时保留服务端汇总不重算。
- **退款按订单聚合**：当页订单先取 id 集合，再用一条原生 SQL 按 `payment."orderId"` 聚合退款（`GROUP BY`），避免 N+1；`Failed` 退款不计入，退款中的单不影响已完成口径。
- **检索（复用 §74 口径）**：单号（含纯数字后 4/8 位）、脱敏手机可见数字、楼栋、区域、菜品行文本（`宫保鸡丁×1`）、备注、骑手名；不区分大小写，命中任一即保留。检索在内存内完成，不额外打 GraphQL。
- **复制清单**：按**当前筛选结果**生成纯文本（抬头「外卖已完成对账清单」+ 区间 + 单量/总额/退款/实收/客单 + 逐单「单号 时间 实收 楼栋 菜品 手机」），走 `uni.setClipboardData`，粘贴即入表格；复制的是脱敏手机号文本。

### 75.3 权限与校验

- Query `campusMerchantCompletedOrders` 仅 `@Allow(CampusPermissions.CampusMerchant)`，与工作台同权限位；沿用 `ctx.channelId` 店铺隔离（`leftJoin order.channels` + channel 过滤），商家只能看本店单。
- 服务端入参校验：`from`/`to` 非法日期 → `时间区间格式不合法`；`start >= end` → `结束时间必须晚于开始时间`；跨度 > 92 天 → `查询区间不能超过 92 天`（防止误传超长区间把工作台拖慢）；`take` 夹在 1..300、`skip >= 0`。
- 手机号在服务端脱敏后才返回，前端拿不到明文；脱敏与 §74 同一 `PrivacyNumberService`。

### 75.4 数据库变更

无（不新增表/列/枚举/迁移；全部为既有表的聚合查询）。

### 75.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0（`npm run build` 根构建会因无关的 `@vendure/dashboard` 失败，故按包构建）；`lib/` 随提交入库 |
| 后端 SQL 口径（生产库直测） | `select count(*), count("customFieldsDeliveredat") from "order" where "customFieldsDeliverystatus"='delivered'` 可按渠道分组返回；`order` 表**无** `total` / `totalWithTax` 列（实体 getter），聚合必须落到 `subTotalWithTax + shippingWithTax` |
| 首次上线问题（已修复） | 线上 Query 报 `syntax error at or near "order"` → 定位为 `SUM(order.total)` 引用 getter 无对应列，TypeORM 未替换别名；改为 `SUM(COALESCE("subTotalWithTax",0)+COALESCE("shippingWithTax",0))` 后恢复 |
| 线上启动问题（已修复） | 服务器 `git checkout` 后 pm2 反复崩溃 `Cannot find module './migrations/p15-support-ticket-after-sales'` → 该迁移文件此前只存在于本地、未入库；补提交（`4cd4da32e`）并重新 checkout 后 `vendure` online、3020 端口正常监听 |
| 线上 schema（`canteen-a-token` + Bearer 令牌） | `campusMerchantCompletedOrders(from, to, take)` 返回 200，`total/totalAmount/refundAmount/netAmount/avgTicket/start/end/items` 字段齐全，无 `FORBIDDEN`、无字段校验错误；非法区间分别返回对应中文校验错误 |
| 线上数据现状 | 探针时 `canteen-a` 渠道 14 单 `delivered` 但 `customFields.deliveredAt` 全为 `NULL`（历史测试单在 `deliveredAt` 字段上线前产生），故返回空集 + 零汇总，属口径内正常表现；有真实送达单后即出现明细 |
| 后台构建 | `node scripts/deploy.mjs`（内含 `build:h5`）`DONE Build complete.`；产物校验 61789 KB；nginx `syntax is ok` + reload，`deploy done` |
| 截图脚本交互（`web-admin/scripts/shots-p75-completed-orders.cjs`） | `01`：今日区间 → KPI `8 完成单量 / ¥311.50 订单总额 / ¥26.00 退款金额 / ¥285.50 实收总额 / ¥35.69 客单价`、计数 `共 8 / 8 条`；`02`：输入「宿舍」→ `共 6 / 8 条`；`03`：输入 `zzz` → `共 0 / 8 条` + 空态文案「没有匹配的订单：试试单号后 4 位、楼栋名、手机尾号或商品关键词」；`04`：点「复制对账清单」→ `uni-toast` 渲染「已复制到剪贴板」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 后台截图（`docs/screenshots/waimai/p75-completed-orders/`） | `01` 今日汇总 + 明细列表（含退款单标签）；`02` 检索命中；`03` 检索空态；`04` 复制 toast |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 75.6 边界与已知限制

- **依赖 `deliveredAt`**：历史单若只有 `deliveryStatus='delivered'` 而无 `deliveredAt`（字段上线前的旧单），不会进入对账；如需追溯旧单请用运营侧订单列表。
- **以「送达时间」归属日期**：跨零点送达的单按送达日归账（例如 23:59 下单、00:05 送达算次日），与「下单日」统计口径不同。
- **退款只看退款单金额**：部分退款按退款单 `total` 计入；退款失败（`Failed`）不计入实收扣减，订单仍按全额计入总额，实际到账以支付渠道为准。
- **分页与汇总分离**：单量很大时明细需「加载更多」，但顶部汇总始终是全区间的；`take` 上限 300，超长区间（>92 天）被拒。
- **检索为内存过滤**：只作用于**已加载**的明细，翻页后新数据不会自动重过滤（需重新加载/切区间）。
- **无条件单量趋势图**：本轮只做列表 + 汇总 + 复制，趋势图仍在「经营设置」页的今日/近 7 日柱状里看。
- **客单价为实收口径**：含退款扣减，与「订单总额 / 单量」的毛口径可能不同（有退款时略低）。

### 75.7 部署记录（2026-10-29）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `ba990579c`（§75 主功能）→ `4cd4da32e`（补 p15 迁移文件，修复启动崩溃）→ `ba1e8e06d`（改用 `totalWithTax`）→ `45565daac`（改按 `subTotalWithTax + shippingWithTax` 聚合）；每次 `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | 最终 pm2 `vendure` online，`*:3020` 正常监听，admin-api 200 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61789 KB；nginx `syntax is ok` + reload `signal process started`，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页顶部 → 点「今日完成（单）」或「今日完成（金额）」任一卡片 → 进入「已完成对账」页 → 顶部切「今日 / 近 7 日 / 自定义」（自定义选起止日期）→ 看 5 个指标（完成单量、订单总额、退款金额、实收总额、客单价）→ 需要找某一单时在检索框输入单号后几位 / 楼栋 / 手机可见数字 / 菜品 / 备注 → 点右上「复制对账清单」，粘贴即得纯文本台账（含区间与汇总，手机号为脱敏）。

## §76 商家发起退款 / 部分退款

> 目标：已送达订单出现少送、洒漏、品质问题时，商家不必等运营介入，可直接在工作台对**本店订单**发起整单或部分退款，金额原路退回顾客支付账户，退款原因随退款单留痕。

### 76.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | `completedOrders` 增加 `refundable`（已支付 − 已退）；新增 `merchantRefund()`（校验 → 订单级咨询锁 → 按支付单余额分摊退 → 售后触达 → 回执） |
| 后端 | `.../src/merchant-admin.resolver.ts` | 新增 Mutation `campusMerchantRefundOrder(orderId, amount, reason)`，`@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | SDL：`CampusMerchantCompletedOrder.refundable: Int!`、新类型 `CampusMerchantRefundResult`、Mutation 声明 |
| 后台 | `web-admin/src/apis/campus.ts` | `MerchantCompletedOrder.refundable` + `campusMerchantRefundOrder()` |
| 后台 | `web-admin/src/pages/campus/completed-orders.vue` | 订单卡「退款 · 可退 ¥x」入口 + 退款面板（金额/全额退款/原因）+ 二次确认 + 成功刷新 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | `campusCompleted` 新增 18 个退款文案键 |
| 截图 | `docs/screenshots/waimai/p76-merchant-refund/` | 5 张：退款入口 / 全额面板 / 部分退款面板 / 二次确认 / 成功 toast |
| 脚本 | `web-admin/scripts/shots-p76-merchant-refund.cjs` | 截图脚本（mock `campusMerchantRefundOrder` 并按金额扣减可退，验证列表即时刷新） |

### 76.2 口径与契约

- **可退余额 `refundable`（分）**：`已支付 − 已退`。已支付 = 该单 `payment.state in ('Settled','Authorized')` 的 `amount` 之和（与 `refundablePayments` 同口径）；已退 = 该单非 `Failed` 退款单 `total` 之和（与 §75 对账口径一致）。未支付、已全额退款订单返回 0，前端据此隐藏退款入口。
- **退款金额入参**：`amount` 单位**分**（前端元输入 × 100 取整），必须为正整数且 ≤ 可退余额；提交前前端先做一次本地校验，服务端锁内再按最新余额复核。
- **分摊规则**：一个订单可能有多张支付单（拆单支付/补差价），退款按「新→旧」逐张退、每张不超过该张剩余可退，累加凑够本次金额；每张单独走 `orderService.refundOrder` + `settleRefundOrMarkFailed`，与运营异常处置同一通道。
- **留痕**：退款原因写入 Vendure `refund.reason`，格式 `merchant refund (<单号>): <商家填写的原因>`；退款单本身（金额/时间/状态/原因）即审计记录，可在 Vendure 后台与 `refund` 表追溯。
- **回执 `CampusMerchantRefundResult`**：`ok` / `amount`（本次实际退款，分）/ `refundedTotal`（该单累计已退，排除 Failed）/ `refundable`（处理后剩余可退）。
- **顾客触达**：退款成功后调用 `notify.user(..., 'afterSales', '商家退款 ¥x 已原路退回')`，走既有售后模板；未配置模板/短信网关时静默跳过，不影响退款结果。

### 76.3 权限与校验

- Mutation 仅 `@Allow(CampusPermissions.CampusMerchant)`；先按 `order.channels` 与 `ctx.channelId` 比对，**跨店订单直接拒绝**（`订单不存在或不属于当前店铺`）。
- 状态校验：仅 `customFields.deliveryStatus = 'delivered'` 的订单可发起退款（`仅已送达订单可发起退款`）；在途单请走「拒单」（备餐中）或运营异常处置，避免配送与退款错位。
- 入参校验：原因为空 → `请填写退款原因`；原因 > 200 字 → `退款原因不能超过 200 个字符`；金额 ≤ 0 或非数字 → `退款金额必须大于 0`。
- 并发：对订单加 `pg_try_advisory_lock(hashtext('campus:refund:<orderId>'))`，占用中返回 `该订单正在退款处理中，请稍后重试`；与拒单/运营处置共用同一把锁，锁内重新统计余额，杜绝并发双退超退。
- 余额校验：锁内 `remaining ≤ 0` → `该订单已无可退余额`；`amount > remaining` → `退款金额超过可退余额（最多可退 ¥x.xx）`。
- 结算失败：`settleRefundOrMarkFailed` 将退款单置 `Failed`，不计入 `refundedTotal` 与可退扣减，回执如实返回剩余可退。

### 76.4 数据库变更

无（不新增表/列/枚举/迁移）。复用既有 `refund`（金额/原因/状态）、`payment`（订单归属/状态）与 `order.customFields.deliveryStatus`。

### 76.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0；`lib/` 随提交入库 |
| 部署 | 提交 `6df534a3c` → `git push origin master` → 服务器 `git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env`；`*:3020` 监听正常，`admin-api` 200 |
| 线上 schema 探针（`canteen-a-token` + superadmin Bearer） | `campusMerchantCompletedOrders(take:5){ items { refundable } }` 正常返回（新字段已上线）；`campusMerchantRefundOrder` 已注册 |
| 线上校验分支 | `reason:"  "` → `请填写退款原因`；`amount:0` → `退款金额必须大于 0`；`orderId:"999999"` → `订单不存在或不属于当前店铺`（未对真实订单发起退款，避免污染生产数据） |
| 后台构建部署 | `node scripts/deploy.mjs`：`DONE Build complete.` → nginx `syntax is ok` + reload → `deploy done` |
| 截图脚本交互（`shots-p76-merchant-refund.cjs`） | `01`：5 单中 4 单显示「退款 · 可退 ¥32.50 / ¥2.00 / ¥61.00 / ¥29.00」，已全退的 `A2400003` 无入口；`02`：点「全额退款」金额自动填 `32.50`；`03`：部分退款输入 `8` + 原因；`04`：二次确认弹窗「将退款 ¥8.00，原路退回顾客支付账户，确认继续？」；`05`：确认后 toast「退款成功：¥8.00」，列表 KPI 退款金额 ¥71.00 → ¥79.00、`A2400004` 可退 ¥61.00 → ¥53.00 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 76.6 边界与已知限制

- **仅已送达订单**：在途/备餐中订单不在本入口开放（备餐中请用「拒单」整单退；配送中异常请走运营异常处置），避免顾客仍在等餐时钱已退。
- **不能退配送费以外的手续费**：退款金额按「已支付 − 已退」计算，含配送费；Vendure `refund.shipping/adjustment` 显式给 0，不做运费单独退。
- **退款原因只做留痕**：不参与任何自动判定（不触发黑名单、不影响评分），仅供对账追溯。
- **不自动关单/改单**：退款后订单仍保持 `delivered`，状态与送达记录不变；如需关单请走运营处置。
- **退款渠道以支付单为准**：原路退回由支付 provider 决定；线下/现金单若未经过支付通道（无 `Settled` 支付单），可退余额为 0，无法在本入口退款。
- **无独立退款记录页**：本轮只在订单卡与面板显示「已退/可退」，逐笔记录（时间/原因）在 Vendure 后台与 `refund` 表查看。
- **单张支付单退款失败不自动重试**：该张置 `Failed` 后需重新发起（余额仍保留），不会自动补偿。

### 76.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `6df534a3c` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | pm2 `vendure` online，`*:3020` 正常监听，`admin-api` 200 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；nginx `syntax is ok` + reload，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页顶部 → 点「今日完成（单）」或「今日完成（金额）」→ 进入「已完成对账」页 → 找到需要售后的订单卡片 → 点「退款 · 可退 ¥x」→ 面板内填金额（点「全额退款」可一键填满可退金额）→ 填退款原因（20 字内说清问题）→ 点「确认退款」→ 弹窗二次确认 → 确认后顾客支付账户原路退回，页面「已退/可退」与顶部退款金额即时刷新。

## §77 商家退款记录台账（含工作台可退款入口）

> 目标：把 §76 的「商家发起退款」沉淀成可追溯的**退款台账**——商家在一个页面里看清区间内退了多少笔、退了多少钱、有没有失败单，并能从**工作台首屏**直接对已送达订单发起退款，而不必先进对账页再找单。退款面板与退款接口在「对账页 / 台账页 / 工作台」三处共用同一份实现，避免三套校验漂移。

### 77.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | 新增 `refunds()`（区间+分页查退款单、按渠道隔离、汇总成功/失败笔数与金额、回填楼栋/区域、剥掉 `merchant refund` 前缀并判定来源）；新增 `MerchantRefundRow` / `MerchantRefundList` 接口 |
| 后端 | `.../src/merchant-admin.resolver.ts` | 新增 Query `campusMerchantRefunds(from, to, take, skip)`，`@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | SDL：Query 声明 + 类型 `CampusMerchantRefundRow` / `CampusMerchantRefunds` |
| 后台 | `web-admin/src/apis/campus.ts` | `MerchantRefundRow` / `MerchantRefundList` 类型 + `campusMerchantRefunds()` |
| 后台 | `web-admin/src/components/campus/RefundSheet.vue`（新建） | **共用退款面板**：全额/部分金额、原因、本地校验、二次确认、调用 `campusMerchantRefundOrder`，emit `done` |
| 后台 | `web-admin/src/pages/campus/refund-records.vue`（新建） | 退款台账页：区间（今日/近 7 日/自定义）+ 3 指标 + 失败提示 + 检索 + 复制台账 + 加载更多 |
| 后台 | `web-admin/src/pages/campus/completed-orders.vue` | 重构：删掉内联退款面板与提交逻辑，改为复用 `RefundSheet` |
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 新增「退款记录」入口 + 首屏「已送达 · 可退款」区块（最多 5 条）+ 复用 `RefundSheet` |
| 后台 | `web-admin/src/pages.json` | 注册 `pages/campus/refund-records`（下拉刷新开启） |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增 `campusRefundSheet` / `campusRefundRecords` 命名空间；`campusMerchant` 补 4 个入口文案 |
| 截图 | `docs/screenshots/waimai/p77-refund-records/` | 5 张：台账列表 / 检索命中 / 空态 / 工作台可退入口 / 工作台退款面板 |
| 脚本 | `web-admin/scripts/shots-p77-refund-records.cjs` | 截图脚本（mock `campusMerchantRefunds` 与 `campusMerchantCompletedOrders`） |

### 77.2 口径与契约

- **退款单口径**：退款单经 `payment` 回落到 `order`，再判定订单是否属于 `ctx.channelId`；区间按退款单**创建时间** `refund."createdAt"` 过滤，左闭右开 `[start, end)`。与 §75「按送达时间」不同，台账回答的是「什么时候退的」，对账回答的是「哪天的单」。
- **金额单位（分）**：`amount` = 订单金额；`total` = 笔数；`amount`（列表项）= 该笔退款金额；汇总 `amount` = 非 `Failed` 退款单 `total` 之和；`failedCount` / `failedAmount` 为 `state = 'Failed'` 的笔数与金额。前端统一 `fenToYuanFixed` 展示。
- **失败单口径**：`Failed` 不计入退款笔数/退款金额（钱实际没退出去），单独计数并在页面顶部提示「另有退款失败 ¥x：未计入退款金额，请到平台侧核实支付渠道后重试」；但计入 `total`（列表可见）。
- **列表项契约 `CampusMerchantRefundRow`**：`id / orderId / code / amount / state / reason / source / createdAt / building / zone`。`source` 由原因前缀判定：`merchant` = 商家在 §76 入口发起（`refund.reason` 形如 `merchant refund (<单号>): <原因>`），`platform` = 运营异常处置/无骑手自动退款等其他来源。
- **原因展示**：服务端用正则 `/^merchant refund \([^)]*\):\s*/` 剥掉留痕前缀，前端展示纯原因；无原因显示「—」。
- **楼栋/区域回填**：当页退款单先取 `orderId` 集合，再用仓储 `findByIds` + `CampusBuilding.findByIds` 批量回填 `building` / `zone`，避免逐行 N+1。
- **汇总与明细分层**：汇总由一条 `COUNT(*) FILTER (WHERE r.state <> 'Failed')` / `SUM(...) FILTER` 聚合查询得出，覆盖**全区间**；明细 `take` 默认 100、上限 300，前端「加载更多」以 `skip = 已加载条数` 追加。
- **检索**：单号（含纯数字后几位）、楼栋、区域、原因文本，客户端内存过滤，不额外打 GraphQL；复制台账只复制**当前检索结果**，汇总按非 `Failed` 口径现算。
- **工作台可退款入口**：`merchant.vue` 用 `campusMerchantCompletedOrders({take:20})` 单独拉取（**不参与 10s 轮询**，避免每次轮询多打一条 Query），只展示 `refundable > 0` 的前 5 条，标题点击跳台账页，条目点击开共用 `RefundSheet`。

### 77.3 权限与校验

- Query `campusMerchantRefunds` 仅 `@Allow(CampusPermissions.CampusMerchant)`；沿用 `ctx.channelId` 店铺隔离——通过订单-渠道关联表 `order_channels_channel`（`orderId` / `channelId` 两列）`EXISTS` 判定，`EXISTS` 而非 JOIN 避免一单多渠道路径产生重复行。
- 服务端入参校验沿用 §75 口径：`from`/`to` 非法 → `时间区间格式不合法`；`start >= end` → `结束时间必须晚于开始时间`；跨度 > 92 天 → `查询区间不能超过 92 天`；`take` 夹在 1..300，`skip >= 0`。
- 退款动作仍走 §76 的 `campusMerchantRefundOrder`：面板本地先校验「金额 > 0、不超过可退、原因必填」，服务端锁内再复核余额，三处入口共用同一 Mutation，不存在绕过校验的通道。
- 前端三处入口均受 `usePermGuard('CampusMerchant')` 保护，越权用户直接看不到页面。

### 77.4 数据库变更

无（不新增表/列/枚举/迁移）。读取既有 `refund`（`total` / `state` / `reason` / `createdAt`）、`payment`（`orderId`）、`order`（`code` / customFields）与关联表 `order_channels_channel`。

### 77.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0；`lib/` 随提交入库 |
| 首次上线问题（已修复） | 线上 Query 报 `relation "order_channels" does not exist` → 直查生产库 `information_schema.tables` 发现 TypeORM 惯用命名为 `order_channels_channel`（列 `orderId` / `channelId`）；修正后提交 `1e1774198` 重新部署，错误消失 |
| 线上 schema 探针（`canteen-a-token` + superadmin Bearer） | `campusMerchantRefunds(take:3)` 返回 200 且 `errors` 为空，`items/count/amount/failedCount/failedAmount/total/start/end` 字段齐全 |
| 线上校验分支 | `from:2026-10-30,to:2026-10-01` → `结束时间必须晚于开始时间`；`from:2025-01-01,to:2026-10-30` → `查询区间不能超过 92 天`；不带 Bearer → `FORBIDDEN: You are not currently authorized to perform this action` |
| 线上真实数据（宽区间 `2026-08-01 ~ 2026-10-30`） | 42 笔 / ¥591.51 / 失败 0；楼栋回填正常（如「桂1栋」）；来源判定正确——无骑手自动退款 `no_rider auto refund (...)` 归类 `platform` |
| 后台构建部署 | `node scripts/deploy.mjs`：`DONE Build complete.` → 产物校验 61816 KB → nginx `syntax is ok` + reload → `deploy done` |
| 截图脚本交互（`shots-p77-refund-records.cjs`） | `01`：台账 KPI `4 退款笔数 / ¥99.00 / 1 失败笔数`，失败提示「另有退款失败 ¥12.00…」，5 行明细含来源与原因；`02`：检索 `0001` → `共 1 / 5 笔`；`03`：近 7 日空态 → `共 0 / 0 笔` + 「该时间段暂无退款记录」；`04`：工作台出现 3 条可退款单（`A2400001 ¥24.50` / `A2400002 ¥2.00` / `A2400004 ¥41.00`）；`05`：点第一条开面板，金额框 `8`、原因已填 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 77.6 边界与已知限制

- **按退款时间归账**：一笔退款归在「退款单创建日」，而非原订单日；与 §75 对账的「按送达日」口径不同，跨日退款两边数字会对不上，属预期。
- **失败单只是留痕**：`Failed` 退款单不计入金额，需人工到支付渠道核实后重试，页面不会自动补偿。
- **来源判定基于原因前缀**：只有 §76 入口写入 `merchant refund (<单号>): …` 前缀的才显示「商家发起」；运营手工在 Vendure 后台填的退款原因会被归为平台，属名称层面的近似。
- **楼栋依赖 `CampusBuilding` 档案**：楼栋/区域来自订单 customFields 与楼栋表，档案缺失时显示「—」，不影响金额与原因。
- **检索与复制仅作用于已加载明细**：翻页后不会自动重过滤（需重新加载或切区间）；复制的是当前筛选后的文本，无 Excel 导出。
- **工作台只显示前 5 条可退款单**：更多需点标题「查看全部」进台账页；工作台区块不参与 10s 轮询，退款成功后仅局部刷新该区块与工作台主列表。
- **无图表**：本轮不做退款趋势/来源占比图，只做列表 + 汇总 + 检索 + 复制。

### 77.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `904349e6c`（§77 主功能）→ `1e1774198`（修正关联表名为 `order_channels_channel`）；两次均 `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | 最终 pm2 `vendure` online，`*:3020` 正常监听，`admin-api` 200 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61816 KB；nginx `syntax is ok` + reload，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → ① 想直接给刚送达的单退款：看首屏「已送达 · 可退款」区块（最多 5 条，显示单号与楼栋）→ 点右侧「退款 · ¥x」→ 面板填金额/原因 → 确认；② 想看退款流水：点该区块标题或顶部「退款记录」入口 → 进「退款记录」页 → 切「今日 / 近 7 日 / 自定义」→ 看 3 个指标与失败提示 → 检索单号后几位 / 楼栋 / 区域 / 原因 → 「复制台账」粘成纯文本 → 列表底部「加载更多」翻历史；③ 需要看到全部可退单时点「查看全部」进「已完成对账」页。

## §78 顾客催单商家侧闭环

> 目标：顾客在小程序点「催一催」后，此前只有骑手端能感知，商家工作台与后厨毫无提示。本节把催单信号接到**商家侧**：工作台首屏出现「有 N 笔顾客催单待确认」蓝色提醒条，单卡显示「顾客催单」标签 + 催单时间 + 「已知晓」按钮；后厨出餐屏同步显示「催单」统计并把催单票据置顶。商家点「已知晓」只解除商家侧提醒，不影响骑手端催单标记。

### 78.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/migrations/p16-merchant-urge-ack.ts`（新建） | 幂等迁移：`CREATE TABLE IF NOT EXISTS campus_urge_ack` + 唯一索引 `(channelId, orderId)`，随 `onApplicationBootstrap` 执行（生产 `DB_SYNC=0`） |
| 后端 | `.../src/merchant-admin.service.ts` | `MerchantBoardOrder` 加 `urged/urgedAt`；`MerchantBoard` 加 `urgedCount`；`KitchenTicket` 加 `urged`、`KitchenQueue` 加 `urgedCount`；新增 `ackUrge()`、私有 `urgeAckMap()`（批量取已知晓时间）、导出 `isUrgePending()`；`board()` 统计 `urgedCount`，`kitchenQueue()` 催单票置顶并统计 |
| 后端 | `.../src/merchant-admin.resolver.ts` | 新增 Mutation `campusMerchantAckUrge(orderId)`，`@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | 注册 `P16MerchantUrgeAckMigration` 到 providers；SDL 补 `urged/urgedAt/urgedCount` 字段与 Mutation |
| 后台 | `web-admin/src/apis/campus.ts` | 类型补 `urged/urgedAt/urgedCount`，Query 补字段；新增 `campusMerchantAckUrge(orderId)` |
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 顶部蓝色 `urgebar` 提醒条 + 单卡 `urge-row`（催单标签/时间/已知晓）+ `goUrged()` / `ackUrge()` + 样式 |
| 后台 | `web-admin/src/pages/campus/kitchen.vue` | 顶部「催单」统计（`stat.urge` 蓝色高亮）+ 票据催单标签 `tk-urged` + 样式 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | `campusMerchant` 补 `urgeBar/urgeTag/urgeAt/urgeAck/urgeAcked`；`campusKitchen` 补 `urgedCount/urged` |
| 截图 | `docs/screenshots/waimai/p78-merchant-urge/` | 3 张：出餐屏催单 / 工作台催单条与卡片 / 点已知晓后消失 |
| 脚本 | `web-admin/scripts/shots-p78-merchant-urge.cjs` | 截图脚本（mock `campusMerchantBoard` / `campusMerchantKitchenQueue` / `campusMerchantAckUrge`） |

### 78.2 口径与契约

- **「待处理催单」定义**：`order.customFields.urged === true` 且 `urgedAt` 存在，并且「已知晓」时间 `ackedAt` 为空或早于 `urgedAt`。顾客再次催单会刷新 `urgedAt` → 若晚于上次 `ackedAt` 则重新变为待处理（`isUrgePending()` 单点判定）。
- **独立小表，不改 order 结构**：商家「已知晓」时间落 `campus_urge_ack`（`channelId` / `orderId` / `ackedAt`）小表，唯一键 `(channelId, orderId)`；避免给高频读写的 `order` 加列、避开生产 `DB_SYNC=0` 的加列风险。
- **只清商家侧**：`ackUrge` 只 upsert 小表，**不改** `order.customFields.urged/urgedAt`——骑手端催单标记、顾客端「已催」状态都不受影响，商家与骑手/顾客是两套认知。
- **幂等 ack**：`INSERT … ON CONFLICT (channelId, orderId) DO UPDATE SET ackedAt = now()`，重复点「已知晓」不会报错，只更新时间。
- **board 契约**：`CampusMerchantBoard.urgedCount` = 当前活跃列表里 `urged=true` 的单数；`MerchantBoardOrder.urged` 为布尔、`urgedAt` 为 `DateTime`（从未催单为 null）。
- **出餐屏契约**：`CampusKitchenQueue.urgedCount`；`CampusKitchenTicket.urged`；`kitchenQueue()` 内 `tickets.sort((a,b)=> Number(b.urged)-Number(a.urged) || +a.createdAt - +b.createdAt)`——催单票置顶，同状态按支付先后。
- **前端交互**：顶部 `urgebar`（`v-if urgedCount>0`，点击 `goUrged()` 跳到第一个含催单的栏）；卡片 `urge-row` 中的「已知晓」调 `campusMerchantAckUrge`，成功后本地 `o.urged=false`、`urgedCount-1`、toast「已确认收到催单」，不触发整板刷新。

### 78.3 权限与校验

- Mutation `campusMerchantAckUrge` 仅 `@Allow(CampusPermissions.CampusMerchant)`；无 Bearer 访问返回 `FORBIDDEN: You are not currently authorized to perform this action`。
- 渠道隔离：先 `findOne(Order, {id, relations:['channels']})`，订单必须属于 `ctx.channelId`，否则 `USER_INPUT_ERROR: 订单不存在或不属于当前店铺`（不区分「不存在」与「非本店」，避免枚举他人订单）。
- 状态校验：`cf.urged !== true || !cf.urgedAt` → `USER_INPUT_ERROR: 该订单没有待处理的顾客催单`。
- 前端 `usePermGuard('CampusMerchant')` 保护两个页面；「已知晓」按钮以 `actingId` 防重复点击。

### 78.4 数据库变更

- 新增表 `campus_urge_ack`：`id serial PK`、`createdAt/updatedAt timestamptz`、`channelId integer`、`orderId integer`、`ackedAt timestamptz`，唯一索引 `campus_urge_ack_channel_order (channelId, orderId)`。
- 由 `P16MerchantUrgeAckMigration` 在 `onApplicationBootstrap` 用 `CREATE TABLE/INDEX IF NOT EXISTS` 幂等创建（生产 `DB_SYNC=0` 不靠 schema sync）。
- **不新增 `order` 列**，不碰既有 `customFields*` 列。

### 78.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0；`lib/` 随提交入库（提交 `091faf080`） |
| 生产迁移 | `SELECT to_regclass('campus_urge_ack')` → `campus_urge_ack`；`information_schema.columns` 6 列（id/createdAt/updatedAt/channelId/orderId/ackedAt）齐全 |
| 线上 schema 探针（`canteen-a-token` + superadmin Bearer） | `campusMerchantBoard { urgedCount pending{id code urged urgedAt} cooking{id urged} }` → HTTP 200、无 `errors`、`urgedCount:0`、`urged`/`urgedAt` 字段可解析 |
| 线上校验分支 | `campusMerchantAckUrge(orderId:"999999999")` → `订单不存在或不属于当前店铺`（`USER_INPUT_ERROR`）；同一请求不带 Bearer → `FORBIDDEN` |
| 后台构建部署 | `node scripts/deploy.mjs`：`DONE Build complete.` → 产物校验 61819 KB → nginx `syntax is ok` + reload → `deploy done` |
| 截图脚本交互（`shots-p78-merchant-urge.cjs`） | `01`：出餐屏顶部 `2 待接单 / 1 备餐中 / 0 超时 / 1 催单`，`stat.urge` 蓝色高亮，`A2400002` 票据带蓝色「催单」标签且置顶；`02`：工作台顶部「有 1 笔顾客催单待确认，点击查看」，`A2400002` 卡片显示「顾客催单 / 12:59 催单 / 已知晓」；`03`：点「已知晓」后提醒条与催单行消失、toast「已确认收到催单」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 78.6 边界与已知限制

- **仅活跃单提醒**：`urgedCount` 只统计活跃列（待接单/备餐中等），订单结束后催单不再展示，历史催单不回溯。
- **商家与骑手两套认知**：商家「已知晓」不改变 `order.customFields.urged/urgedAt`，骑手端仍可见催单标记；同一催单在两端独立处理属预期。
- **无主动推送**：不向商家发公众号/短信，仅工作台 10s 轮询与出餐屏 10s 轮询刷新；后厨若未开大屏则只能在刷新后看到。
- **依赖骑手端催单频控**：`urgedAt` 由 C 端 `campusUrgeOrder`（骑手任务服务 `urgeOrder`，10 分钟频控）写入；短时间内重复催只刷新最后一次时间，不会产生多条待处理。
- **店铺隔离**：ack 记录带 `channelId`，一店确认不影响另一店（同一物理订单只归属一个渠道时无差异）。
- **无批量「全部已知晓」**：需逐单点确认；催单数通常很少，未做批量操作。

### 78.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `091faf080` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | pm2 `vendure` online，迁移表已建，`admin-api` 200 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61819 KB；nginx `syntax is ok` + reload，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → ① 若顶部出现蓝色「有 N 笔顾客催单待确认，点击查看」提醒条，点它自动跳到含催单的订单栏；② 在催单订单卡片上看到「顾客催单」标签与催单时间，点右侧「已知晓」即解除商家侧提醒（toast「已确认收到催单」）；③ 后厨「出餐屏」顶部「催单」统计变蓝、催单票据带「催单」标签并置顶，优先制作。

## §79 商家备餐汇总

> 目标：后厨每天开工前都要盘「今天一共要做多少份什么、加料各多少份」，此前只能一单一单翻工作台卡片心算。本节在商家工作台加「备餐汇总」入口：按商品聚合**今日待做份数**（待接单 + 备餐中）、**今日已出餐份数**，并把加料/口味按份累加；「复制备货清单」得到纯文本，可直接发给后厨或采购备料。

### 79.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | 新增接口 `MerchantPrepAddon` / `MerchantPrepItem`；新增 `prepSummary(ctx)` 聚合今日份数 |
| 后端 | `.../src/merchant-admin.resolver.ts` | 新增 Query `campusMerchantPrepSummary`，`@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | SDL 补 `CampusMerchantPrepAddon` / `CampusMerchantPrepItem` 类型与 Query 字段 |
| 后台 | `web-admin/src/apis/campus.ts` | 类型 `CampusPrepAddon` / `CampusPrepItem`；`campusMerchantPrepSummary()` |
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 「备餐汇总 ›」入口条 + 底部抽屉面板（行内「商品名 / 加料份数 / ×待做 / 已出 n」）+ `刷新` / `复制备货清单` |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | `campusMerchant` 补 `prepEntry/prepTitle/prepHint/prepEmpty/prepDoneTag/prepRefresh/prepCopy/prepCopied/prepCopyTitle` |
| 截图 | `docs/screenshots/waimai/p79-prep-summary/` | 2 张：备餐汇总面板 / 复制成功 toast |
| 脚本 | `web-admin/scripts/shots-p79-prep-summary.cjs` | 截图脚本（mock `campusMerchantBoard` / `campusMerchantPrepSummary`） |

### 79.2 口径与契约

- **「待做」定义**：`order.customFields.hallStatus ∈ ('pending_merchant','accepted')`——与出餐屏 `kitchenQueue()` 同源，即还没出餐的单；按 `hallStatus` 拆成 `pendingQty`（待接单）与 `cookingQty`（备餐中），`todoQty = pending + cooking`。
- **「已做」定义**：`order.customFields.deliveryStatus = 'delivered'` 且 `deliveredAt >= startOfCampusDay(now)`——与工作台「今日完成」同一校园日界，跨 0 点自动归零。
- **按商品聚合**：以 `lines.productVariant.name` 为键，份数取 `line.quantity`（同一商品多规格/多行会累加到同名商品）。
- **加料份数**：`addonDisplayText(line.customFields.waimaiAddons)` 按 `' / '` 切分得到单项加料名，每项按该行 `quantity` 累加（如「加辣 ×3」= 3 份该商品各加了辣）。
- **排序**：`todoQty desc → totalQty desc → name`——要做的多的排前面，便于按优先级备料。
- **契约**：`campusMerchantPrepSummary: [CampusMerchantPrepItem!]!`，`CampusMerchantPrepItem { name pendingQty cookingQty doneQty todoQty totalQty addons { name quantity } }`；`totalQty = todoQty + doneQty`。
- **前端交互**：入口条点开即拉一次（`openPrep()` → `loadPrep()`），**不参与工作台 10s 轮询**——避免为空看板增加高频查询；面板内「刷新」手动重拉。
- **复制格式**：首行「今日备货清单」，每行 `商品名 ×待做份数`（`doneQty>0` 追加「（已出 n）」作为续做参考）；加料份数只在面板内展示，不写入复制文本（后厨按份备料已够用）。

### 79.3 权限与校验

- Query `campusMerchantPrepSummary` 仅 `@Allow(CampusPermissions.CampusMerchant)`；无 Bearer 访问返回 `FORBIDDEN: You are not currently authorized to perform this action`。
- 渠道隔离：两次查询都 `leftJoin order.channels` 并 `channel.id = ctx.channelId`，只聚合本店订单。
- 前端 `usePermGuard('CampusMerchant')` 保护页面；拉取失败用 `graphQlErrorMsg(err, opFailed)` toast，不打断看板。
- 只读查询，无写操作、无副作用（不建表、不改状态）。

### 79.4 数据库变更

- **无变更**：本节为纯查询聚合，复用既有 `order` / `order_line` 与 `customFields.hallStatus/deliveryStatus/deliveredAt/waimaiAddons`，不新增表、不新增列，因此不新增 `p17` 迁移。

### 79.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0；`lib/` 随提交入库（提交 `14f303c41`） |
| 线上 schema 探针（`canteen-a-token` + superadmin Bearer） | `campusMerchantPrepSummary { name pendingQty cookingQty doneQty todoQty totalQty addons { name quantity } }` → HTTP 200、`errors` 为空、字段全部可解析 |
| 线上数据现状 | 探针时该渠道今日活跃单与今日达单单均为 0，故返回空数组 `[]`（口径内正常表现，有单后即出现明细） |
| 线上校验分支 | 同一请求不带 Bearer → `You are not currently authorized to perform this action`（`FORBIDDEN`） |
| 后台构建部署 | `node scripts/deploy.mjs`：`DONE Build complete.` → 产物校验 61825 KB → nginx `syntax is ok` + reload → `deploy done` |
| 截图脚本交互（`shots-p79-prep-summary.cjs`） | `01`：面板标题「今日备餐汇总」，3 行：宫保鸡丁 `×3` / `已出 5` / `加辣 ×3 · 多花生 ×2`、香菇滑鸡饭 `×1` / `已出 2` / `加饭 ×2`、米饭 `×4` / `已出 7`，底部「刷新」「复制备货清单」；`02`：点「复制备货清单」→ toast「清单已复制」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 79.6 边界与已知限制

- **只统计同商品同名聚合**：聚合键是 `productVariant.name`，不同规格（如「大份/小份」）若同名会被合并；规格命名不同则各自成行。
- **已出餐只算今日**：按 `deliveredAt` 与校园日界计算，历史单不回溯；`deliveredAt` 为 `NULL` 的老单不计入「已出」。
- **不做备料消耗/库存联动**：仅份数汇总，不扣原材料库存、不生成采购单。
- **加料仅统计已下单加料**：`waimaiAddons` 为空的商品行不显示加料区；顾客备注文本不参与聚合。
- **无实时推送**：面板打开即拉一次 + 手动刷新，不随新单自动增量刷新（要看最新需再点「刷新」）。
- **复制为纯文本**：不含价格与小计，仅商品名 × 份数（+已出参考），便于贴进群里或记事本。

### 79.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `14f303c41` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | pm2 `vendure` online；`admin-api` 200，探针字段可解析 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61825 KB；nginx `syntax is ok` + reload，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → ① 找到「出餐屏（后厨大屏）›」下方的「备餐汇总 ›」入口条，点开底部面板；② 面板按「要做的多」排序显示今日各商品的 `×待做份数`、`已出 n` 与加料份数（如「加辣 ×3 · 多花生 ×2」）；③ 点「刷新」拉取最新份数，点「复制备货清单」得到「今日备货清单 + 每行商品 ×待做（已出 n）」纯文本，粘贴发给后厨或采购即可备料。

## §80 商家营业日报

> 目标：此前商家只能看「今日 / 近 7 日」的四个总数（单量、营业额、客单价、退款），既不区分时段也看不到商品结构，更没法回看某一天。本节新增「营业日报」页：任选最近 30 天中的某一天，看单日 KPI、**与昨日 / 近 7 日均值的百分比对比**、**24 小时时段分布**、**商品销量 Top5**，并一键「复制日报」成纯文本（可直接发群里或存档）。

### 80.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | 新增接口 `MerchantDailyHour` / `MerchantDailyProduct` / `MerchantDailyCompare` / `MerchantDailyReport`；新增 `dailyReport(ctx, date)` 单日聚合 |
| 后端 | `.../src/merchant-admin.resolver.ts` | 新增 Query `campusMerchantDailyReport(date)`，`@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | SDL 补 `CampusDailyHourPoint` / `CampusDailyProductRow` / `CampusDailyCompare` / `CampusMerchantDailyReport` 与 Query 字段 |
| 后台 | `web-admin/src/apis/campus.ts` | 类型 `CampusDailyHourPoint` / `CampusDailyProductRow` / `CampusDailyCompare` / `CampusDailyReport`；`campusMerchantDailyReport(date)` |
| 后台 | `web-admin/src/pages/campus/daily-report.vue`（新建） | 日报页：日期切换（前一天/日期选择/后一天 + 今天/昨天快捷）、KPI 四块、对比两条、时段柱状、Top5 列表、复制日报 |
| 后台 | `web-admin/src/pages.json` | 注册路由 `pages/campus/daily-report`（标题「营业日报」，支持下拉刷新） |
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 工作台入口条「营业日报 ›」+ `goDailyReport()` |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | `campusMerchant.dailyReportEntry`；新增命名空间 `campusDailyReport`（18 个文案） |
| 截图 | `docs/screenshots/waimai/p80-daily-report/` | 4 张：工作台入口 / 日报（今天）/ 日报（昨天）/ 复制 toast |
| 脚本 | `web-admin/scripts/shots-p80-daily-report.cjs` | 截图脚本（mock `campusMerchantDailyReport` 两套数据，按 `date` 变量切换） |

### 80.2 口径与契约

- **单日口径**：完成单量/营业额按 `deliveryStatus='delivered'` 且 `deliveredAt` 落在所选校园日 `[00:00, 次日 00:00)`；跨零点订单计入**实际送达当天**（与经营设置页、工作台「今日完成」一致）。
- **退款口径**：`state='Cancelled'` 按 `createdAt` 归日、金额取订单 `totalWithTax`（与 `merchantRevenue` 的「取消退款」同源）；即「取消单按下单日、完成单按送达日」，两个指标归日基准不同，页面文案写「退款（n 单）」避免误读。
- **时段分布**：按 `deliveredAt` 的校园小时（UTC+8）分桶，`hourly` 数组 `{hour, orders, gross}`；**今天只出到当前小时**（0..now），历史日 **24 点全出**。
- **商品 Top5**：以 `lines.productVariant.name` 聚合，`qty` = 份数（`line.quantity`），`amount` = 折后行小计（`linePriceWithTax` 汇总），按 `qty desc → amount desc → name` 取前 5。
- **对比口径**：`prev` = 前一日同口径（零填充）；`last7Avg` = 前 7 日（不含当日）**日均**，其中 `orders`/`gross` 为 7 天均摊、`avgTicket` 为 7 日整体客单价。前端算百分比，基数为 0 时显示「—」（不做除零）。
- **契约**：`campusMerchantDailyReport(date: String): CampusMerchantDailyReport!`；`date` 缺省 = 今天；`campusMerchantDailyReport { date orders gross avgTicket cancelled cancelledAmount hourly{hour orders gross} topProducts{name qty amount} prev{orders gross avgTicket} last7Avg{orders gross avgTicket} }`。
- **一次查询**：单条 SQL 覆盖「所选日 + 前 7 日」窗口（`createdAt >= date-7d`），内存分桶，不做多次往返。
- **复制格式**：`营业日报 YYYY-MM-DD` / KPI 一行 / 「较昨日：单量 ±x% · 营业额 ±x%」/「较近 7 日均值：…」/ 高峰时段 / Top5 商品名 ×份数 一行。

### 80.3 权限与校验

- Query `campusMerchantDailyReport` 仅 `@Allow(CampusPermissions.CampusMerchant)`；无 Bearer 访问返回 `FORBIDDEN: You are not currently authorized to perform this action`。
- 渠道隔离：`leftJoin order.channels` + `channel.id = ctx.channelId`，只聚合本店订单。
- 日期校验：格式非 `YYYY-MM-DD` → `USER_INPUT_ERROR: 日期格式不合法（YYYY-MM-DD）`；晚于今天 → `不能查看未来日期的营业日报`；早于今天-29 天 → `营业日报最多回看 30 天`。
- 前端：`usePermGuard('CampusMerchant')`；日期箭头在边界处置灰（`canPrev/canNext`），picker `:end="todayKey"` 从源头上挡住未来日期；拉取失败 toast 不打断页面。
- 只读查询，无写操作。

### 80.4 数据库变更

- **无变更**：纯查询聚合，复用既有 `order` / `order_line` 与 `customFields.hallStatus/deliveryStatus/deliveredAt`，不新增表、不新增列，不新增迁移。

### 80.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0；`lib/` 随提交入库 |
| 后台构建 | `npm run build:h5` → `DONE Build complete.`（新增页面与路由编译通过） |
| 截图脚本交互（`shots-p80-daily-report.cjs`） | `01`：工作台入口条依次为「经营设置 / 出餐屏（后厨大屏）/ 备餐汇总 / **营业日报** / 退款记录」；`02`：日期 `2026-10-30`、「今天」高亮，KPI `23 / ¥684.00 / ¥29.74 / ¥26.00`（退款 1 单），对比「较昨日 单量 +15.0% · 营业额 +14.4%」「较近 7 日均值 单量 +9.5% · 营业额 +11.8%」，24 根时段柱且 12 点高亮为「高峰 12:00（7 单）」，Top5 宫保鸡丁 ×18 ¥1296.00 … 可乐 ×5 ¥25.00；`03`：切「昨天」→ 日期 `2026-10-29`、KPI `19 / ¥589.00 / ¥31.00 / ¥52.00`、对比转负（-20.8% / -18.9%）；`04`：点「复制日报」→ toast「日报已复制」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 schema 探针（`canteen-a-token` + superadmin Bearer） | `campusMerchantDailyReport`（缺省=今天）→ HTTP 200、`errors` 为空、`date:"2026-10-30"`、`hourly` 20 点（只到当前小时）、`topProducts:[]`；`date:"2026-10-29"` → `date` 一致、`hourly` **24 点全出** |
| 线上校验分支 | 未来日期 `2026-11-30` → `不能查看未来日期的营业日报`；`2020-01-01` → `营业日报最多回看 30 天`；`2026/10/30` → `日期格式不合法（YYYY-MM-DD）`；无 Bearer → `You are not currently authorized to perform this action`（`FORBIDDEN`） |
| 线上数据现状 | 探针时该渠道今日/昨日均无完成单（KPI 全 0），属口径内正常表现；有真实送达单后即出数 |
| 后台构建部署 | `node scripts/deploy.mjs`：`DONE Build complete.` → 产物校验 61839 KB → nginx `syntax is ok` + reload → `deploy done` |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 80.6 边界与已知限制

- **退款口径与完成口径归日不同**：取消单按下单日、完成单按送达日；同一笔「昨天下单、今天送达后取消」不会同时出现在两天的完成与退款里，但读数字时需注意两列不是同一基准。
- **退款只算取消单**：部分退款（`Refund` 记录）不计入日报的退款金额——需要精确流水请看「退款记录」页（§77）。
- **时段分布只看送达时间**：按送达小时分桶，不是下单小时；商家想看「什么时候下单多」需要另做口径。
- **今天只到当前小时**：今天 15:00 打开只有 0–15 点柱，后面时段为空柱，不代表没单。
- **对比为纯前端百分比**：基数为 0（昨日无单/近 7 日无单）时显示「—」，不显示 100%。
- **回看上限 30 天**：更早的历史请用「经营设置」页近 30 日明细导出（§57）。
- **不做自动推送**：日报不向公众号/短信推送，需要分享时用「复制日报」手动粘贴。

### 80.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `a46f70f63` → `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | `pm2 vendure online`（重启计数 636）、`admin-api` HTTP 200、探针通过 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61839 KB；nginx `syntax is ok` + reload，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → ① 点「备餐汇总 ›」下方的「营业日报 ›」进入日报页；② 用「‹ / 日期 / ›」翻前一天、后一天，或点「今天 / 昨天」快捷切换（最远回看 30 天）；③ 看四块 KPI、两条对比（较昨日 / 较近 7 日均值）、时段柱状（橙色柱为全峰时段）与商品销量 Top5；④ 点底部「复制日报」得到纯文本日报，直接粘贴到群里或记事本。

## §81 商家售后处理

> 目标：售后闭环此前只打通了「顾客提交」这一半——C 端已能提交退款售后申请（后端 `@vendure/after-sales-plugin` 早就完整），但校区商家工作台没有任何售后入口，商家既不知道有谁申请了退款，也不能同意或驳回，只能等平台运营介入。本节新增「售后申请」页：按「待处理 / 已处理」两档列出本店售后单（单号、金额、状态、类型、顾客、原因、描述、凭证数、留言数、驳回理由、退款到账时间），待处理单可「同意退款」（仅退款单同意即原路退款到账）或「驳回」（理由必填、顾客可见并可申诉）。

### 81.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | 新增 `MerchantAfterSalesRow` / `MerchantAfterSalesList`；`afterSalesList(ctx, state?)`、`afterSalesApprove(ctx, id)`、`afterSalesReject(ctx, id, reason)` 与私有 `assertChannelAfterSales` / `afterSalesOne` / `afterSalesMessageCounts` / `toAfterSalesRow`；惰性注入 `AfterSalesService` |
| 后端 | `.../src/merchant-admin.resolver.ts` | 新增 Query `campusMerchantAfterSales(state)` 与 Mutation `campusMerchantAfterSalesApprove(id)` / `campusMerchantAfterSalesReject(id, reason)`，均 `@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | SDL 补 `CampusMerchantAfterSalesItem` / `CampusMerchantAfterSalesList` 与三条字段 |
| 后台 | `web-admin/src/apis/campus.ts` | 类型 `MerchantAfterSalesRow` / `MerchantAfterSalesList`；`campusMerchantAfterSales(state?)`、`campusMerchantAfterSalesApprove(id)`、`campusMerchantAfterSalesReject(id, reason)` |
| 后台 | `web-admin/src/pages/campus/merchant-after-sales.vue`（新建） | 售后页：概览（待处理数 pill）+ 待处理/已处理分档 + 售后卡（含凭证/留言/驳回理由/到账时间）+ 同意（确认弹窗）/驳回（底部理由弹层） |
| 后台 | `web-admin/src/pages.json` | 注册路由 `pages/campus/merchant-after-sales`（标题「售后申请」，支持下拉刷新） |
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 工作台入口条「售后申请 ›」+ `goAfterSales()` |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | `campusMerchant.afterSalesEntry`；新增命名空间 `campusMerchantAfterSales`（32 个文案） |
| 截图 | `docs/screenshots/waimai/p81-merchant-after-sales/` | 6 张：工作台入口 / 待处理列表 / 驳回弹层 / 驳回成功 toast / 已处理终态 / 同意退款确认 |
| 脚本 | `web-admin/scripts/shots-p81-after-sales.cjs` | 截图脚本（mock 5 条售后单，覆盖待处理 ×2、已退款、已驳回、退款失败） |

### 81.2 口径与契约

- **归属口径**：售后单本身挂了 `channels`，但列表以**订单渠道**为准（`leftJoin a.order → leftJoin o.channels`，`c.id = ctx.channelId`）并按「`o.customFields.hallStatus` 非空」限定外卖单——平台代建的售后单也能正确归到门店。
- **排序与上限**：`createdAt DESC`，最多 50 条；`pendingCount` 不受 `state` 筛选影响（恒为 Pending 总数，供概览 pill），`total` 为本店售后单总数。
- **同意语义**：委托 `AfterSalesService.approveRequest()`；`refund_only` 由插件链式 `Received → 执行退款 → Refunded`，即商家一次操作就退款到账（失败则落在 `RefundFailed`），前端按返回状态出「已退款到账 / 已同意，退款处理中」两种 toast。
- **驳回语义**：`rejectRequest(ctx, id, reason)` 仅 `Pending` 可拒，理由落 `rejectReason`，顾客在 C 端售后详情可见并可申诉（申诉后状态变 `Appealed`，回到「已处理」档）。
- **金额单位**：接口返回**分**，前端 `fenToYuanFixed()` 渲染为 `¥32.50`。
- **一次拉全量**：前端只发一次 `campusMerchantAfterSales(null)`（不带 `state`），「待处理 / 已处理」在本地按 `state === 'Pending'` 分两档过滤，切档不产生额外请求。
- **契约**：
  - `campusMerchantAfterSales(state: String): CampusMerchantAfterSalesList!`（`state` 空=全部，`Pending`=待处理）
  - `campusMerchantAfterSalesApprove(id: ID!): CampusMerchantAfterSalesItem!`
  - `campusMerchantAfterSalesReject(id: ID!, reason: String!): CampusMerchantAfterSalesItem!`
  - 行字段：`id orderId orderCode state type reason description refundAmount rejectReason evidenceImages messageCount customerName createdAt refundedAt`。

### 81.3 权限与校验

- 三条接口均 `@Allow(CampusPermissions.CampusMerchant)`；无 Bearer 访问返回 `FORBIDDEN: You are not currently authorized to perform this action`。
- **渠道校验**（`assertChannelAfterSales`）：售后单自身或所属订单的 `channels` 命中 `ctx.channelId` 才允许操作，否则 `USER_INPUT_ERROR: 售后单不存在或不属于当前店铺`——越权与「猜 id」都被挡住。
- **状态校验**：同意/驳回前都要求 `state === 'Pending'`，已处理单再点返回 `该售后申请已处理，不能重复操作`（防止重复退款）。
- **理由校验**：空理由 → `请填写驳回理由（顾客可见）`；超过 200 字 → `驳回理由最多 200 字`（前端 `maxlength=200` 同步拦截）。
- **插件缺失降级**：`AfterSalesService` 通过 `new Injector(this.moduleRef).get()` 惰性注入并缓存，取不到时打 `Logger.warn` 并抛 `售后插件未安装，暂不能处理售后申请`；留言数统计（原生 SQL `after_sales_message`）失败时降级为 0，不影响清单可用。
- 前端 `usePermGuard('CampusMerchant')` 保护页面；失败统一 toast，不打断列表。

### 81.4 数据库变更

- **无变更**：复用售后插件既有表 `after_sales_request`（售后单）与 `after_sales_message`（协商留言），只做只读统计（留言条数），不新增表、不新增列、不新增迁移。

### 81.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` exit 0；`lib/` 编译产物随提交入库 |
| 后台构建 | `npm run build:h5` → `DONE Build complete.`（新页面与路由编译通过） |
| 截图脚本交互（`shots-p81-after-sales.cjs`） | `01`：工作台入口条依次为「经营设置 / 出餐屏（后厨大屏）/ 备餐汇总 / 营业日报 / **售后申请** / 退款记录」；`02`：「待处理 2 单」，A2400001 `¥32.50`（凭证 2 张 · 留言 2 条）、A2400004 `¥2.00`（凭证 1 张），均带「驳回 / 同意退款」；`03`：点「驳回」→ 底部弹层「驳回售后」+ 理由输入框；`04`：填理由提交 → toast「已驳回该售后申请」，列表剩 1 单待处理、pill 变「待处理 1 单」；`05`：切「已处理」→ A2400004 已驳回（带驳回理由）、A2400005 已退款、A2400007 已驳回（带驳回理由）、A2400009 退款失败；`06`：切回「待处理」点「同意退款」→ 确认弹窗「订单 A2400001 将退款 ¥32.50，原路退回顾客支付账户，确认继续？」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 schema 探针（`canteen-a-token` + superadmin Bearer） | `campusMerchantAfterSales` → HTTP 200、`errors` 为空、`pendingCount:1 total:3`，行内 `orderCode` 为真实单号（`6CBGCT4A2GVXLLHV` / `6F8NEP1E186B236A` / `B9EEVSFV7FQ6NH1A`）、`refundAmount:100`、`messageCount` 与 `evidenceImages` 正常；`state:"Pending"` → 只回 1 条 |
| 线上校验分支 | `campusMerchantAfterSalesApprove(id: 99999999)` → `售后单不存在或不属于当前店铺`；`campusMerchantAfterSalesReject(id: 99999999, reason: "x")` → 同上；无 Bearer → `FORBIDDEN: You are not currently authorized to perform this action` |
| 后台构建部署 | `node scripts/deploy.mjs`：`DONE Build complete.` → 产物校验 61856 KB → nginx `syntax is ok` + reload → `deploy done` |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 81.6 边界与已知限制

- **只处理「顾客已提交」的售后**：商家主动退款仍在「退款记录」页（§76/§77）；本页不新建售后单。
- **换货/退货流程不由本页驱动**：`return_refund` / `exchange` 类型的单也会列出，但同意后仍走插件的后续（收货/换货）状态，商家在详情面板的协商记录里沟通（回复能力见 §82）。
- **同意即退款，无二次金额编辑**：金额由顾客申请值决定，商家不能在本页改小额退；需要按差额退款请走「退款记录」的部分退款。
- **退款到账依赖支付渠道**：同意后状态可能短时停在 `Refunded` 之前的中间态（渠道异步回执），刷新即可看到最终态；`RefundFailed` 需人工排查（本页无重试按钮）。
- **列表上限 50 条**：超过 50 条时更早的售后单不会出现（含「已处理」档），需要查更早记录暂无入口。
- **无入口红点/角标**：工作台「售后申请 ›」入口不显示待处理数角标，需进页看 pill；后续可加。
- **驳回理由 200 字上限**：超出前端截断、后端报错，长说明建议先在 C 端留言沟通。

### 81.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `baeb9f0c5`（+ 修复单号的 `a1f8d0813`）→ `git push origin master` → 服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | `pm2 vendure online`（重启计数 638）、`admin-api` HTTP 200、探针字段全部可解析且单号非空 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `DONE Build complete.`；产物校验 61856 KB；nginx `syntax is ok` + reload，`deploy done` |
| C 端 | 无改动，未部署 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → ① 点「营业日报 ›」下方的「售后申请 ›」进入售后页，顶部 pill 显示「待处理 N 单」；② 默认在「待处理」档，看单号、金额、类型、顾客、原因与描述、凭证数/留言数；③ 同意退款：点「同意退款」→ 弹窗确认金额 → 确定后提示「已退款到账」并自动刷新；④ 驳回：点「驳回」→ 底部弹层填写理由（必填，顾客可见）→ 提交后 toast「已驳回该售后申请」；⑤ 切「已处理」档可看已退款（含到账时间）、已驳回（含驳回理由）、退款失败的终态单；⑥ 点任意一张卡打开详情面板（凭证大图 / 处理进度 / 协商记录），待处理与申诉单可在底部输入框直接回复顾客。

## §82 售后详情面板（协商对话 + 凭证预览 + 状态时间线）

> 目标：§81 只把售后做成「只读清单」——商家能看到有单、能同意或驳回，但看不到顾客传的凭证原图、看不到状态流转过程，也无法就「少送一份米饭」这类争议和顾客说清楚。本节把售后单升级成**可沟通的工单**：点卡片打开全屏详情面板，左中右三块一次看完「凭证九宫格（可点开原图）→ 处理进度时间线 → 协商记录气泡」，底部输入框直接回复顾客；同一条对话在顾客 C 端售后详情里同步可见并可继续留言。

### 82.1 交付清单

| 端 | 文件 | 说明 |
|---|---|---|
| 后端 | `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | `afterSalesDetail(ctx, id)`（售后单 + 留言 + 状态历史 + 退款失败留痕）、`afterSalesReply(ctx, id, content, images)`（渠道 + 状态校验后调 `AfterSalesService.addMessage(ctx, id, 'admin', …)`）；私有 `afterSalesMessageRows` / `afterSalesHistoryRows`（原生 SQL 直读 `after_sales_message` / `after_sales_state_history`，表缺失时降级空数组） |
| 后端 | `.../src/merchant-admin.resolver.ts` | Query `campusMerchantAfterSalesDetail(id)`、Mutation `campusMerchantAfterSalesReply(id, content, images)`，均 `@Allow(CampusPermissions.CampusMerchant)` |
| 后端 | `.../src/campus-delivery.plugin.ts` | SDL：`CampusMerchantAfterSalesMessage` / `CampusMerchantAfterSalesHistory` / `CampusMerchantAfterSalesDetail` 及两条字段 |
| 后台 | `web-admin/src/apis/campus.ts` | 类型 `MerchantAfterSalesMessage` / `MerchantAfterSalesHistory` / `MerchantAfterSalesDetail`；`campusMerchantAfterSalesDetail(id)`、`campusMerchantAfterSalesReply(id, content, images?)` |
| 后台 | `web-admin/src/pages/campus/merchant-after-sales.vue` | 卡片 `@tap` 打开全屏详情面板（头部单号/金额、凭证九宫格 `uni.previewImage`、状态时间线、对话气泡左顾客右商家、底部输入框 + 发送、只读态提示）；列表卡非待处理行显示「点击查看详情 ›」 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | `campusMerchantAfterSales` 增 18 条（详情/凭证/时间线/对话/发送/只读等） |
| C 端 | `src/pkg-after-sale/pages/detail.vue` | 顶部状态/金额；凭证缩略图可点开原图；处理进度时间线；协商记录气泡（顾客右、商家左）；底部留言输入框（`Closed` 置灰提示）；原有「填退货物流」「取消申请」保留 |
| C 端 | `src/api/mutations/after-sale.ts` | `addAfterSalesMessage(id, content, images?)`、`listAfterSalesMessages(id, take)` |
| C 端 i18n | `src/i18n/locales/*.json`（5 语言） | `afterSaleDetail` 增 25 条（时间线/凭证/对话/发送/9 个状态名） |
| 截图 | `docs/screenshots/waimai/p82-after-sales-chat/` | 6 张：列表详情入口 / 面板-凭证+时间线 / 面板-空对话 / 回复后气泡 / 已退款只读 / 凭证大图预览 |
| 脚本 | `web-admin/scripts/shots-p82-after-sales-chat.cjs` | mock 3 单（2 待处理 + 1 已退款）含留言与状态历史；留言图片用内联 SVG data URL，避免外链 404 |

### 82.2 口径与契约

- **归属口径**：`afterSalesDetail` / `afterSalesReply` 都先走 `assertChannelAfterSales`（售后单自身或所属订单的 `channels` 命中 `ctx.channelId`），跨渠道 id 直接报 `售后单不存在或不属于当前店铺`。
- **可回复状态**：仅「待处理 `Pending`」与「顾客申诉 `Appealed`」可回复；`Refunded` / `Rejected` / `RefundFailed` / `Closed` 只读——前端输入框换成「该售后已结束，仅可查看记录」，后端再兜一层（当前线上提交版本为 `Closed` 禁言，见 82.7）。
- **留言上限**：正文必填、≤1000 字（插件 `MESSAGE_MAX_LENGTH`）、图片 ≤3 张（插件 `MESSAGE_MAX_IMAGES`）；后台输入框 `maxlength=200` 前置收敛，超限由后端返回可读错误。
- **详情读出**：留言正序最多 100 条（`messageTotal` 同步回传）；状态历史正序最多 50 条，前端首条额外补「顾客提交售后申请」占位。
- **降级**：`after_sales_message` / `after_sales_state_history` 查询异常一律返回空数组，详情照常打开（时间线只剩首条）。
- **契约**：
  - `campusMerchantAfterSalesDetail(id: ID!): CampusMerchantAfterSalesDetail!`
  - `campusMerchantAfterSalesReply(id: ID!, content: String!, images: [String!]): CampusMerchantAfterSalesMessage!`
  - `CampusMerchantAfterSalesDetail { request messages messageTotal stateHistory refundError actualRefundAmount timeoutHours }`
  - 留言字段：`id senderType senderName content images createdAt`；历史字段：`fromState toState createdAt`。

### 82.3 权限与校验

- 两条接口均 `@Allow(CampusPermissions.CampusMerchant)`；无 Bearer 返回 `FORBIDDEN: You are not currently authorized to perform this action`。
- `senderType` 由服务端固定写 `admin`（不接受前端传值），发送人姓名由插件按当前登录管理员解析，顾客侧看到的即门店/操作人名称。
- 空内容 → `USER_INPUT_ERROR: Message content is required`；超 1000 字 / 超 3 图由插件拒绝，商家 service 包成 `留言失败：…`。
- 越权与闭环双保险：渠道校验 → 状态校验 → 插件 `addMessage` 内的 `Closed` 禁言。
- C 端只能看到自己的售后：插件 shop 侧 `listMessages` 以 `customerId` 隔离，`addAfterSalesMessage` 校验归属。

### 82.4 数据库变更

- **无变更**：读写沿用售后插件既有表 `after_sales_message`（协商留言）与 `after_sales_state_history`（状态流转），不新增表/列/迁移。

### 82.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `cd packages/campus-delivery-plugin && npx tsc -p tsconfig.build.json` → 通过；`lib/` 产物随提交入库 |
| 后台构建 | `npm run build:h5` → `DONE Build complete.`（新面板与新增文案编译通过） |
| 截图脚本（`shots-p82-after-sales-chat.cjs`） | `01`：列表两张待处理卡（A2400001 `¥32.50`、A2400004 `¥2.00`）；`02`：点开 A2400001 → 面板「顾客凭证 3 张 / 处理进度（顾客提交售后申请 → 待处理）/ 协商记录 2 条（顾客左、商家右）」；`03`：切 A2400004 → 「协商记录 0」+ 空态提示「暂无协商记录，可在下方直接回复顾客」；`04`：输入「马上给您补一份米饭，师傅已重新出锅～」→ 发送 → 右侧新增商家气泡，协商记录 1、列表卡留言数同步 +1；`05`：切「已处理」点 A2400005（已退款）→ 时间线三条（提交 → 待退货 → 已退款），底部显示「该售后已结束，仅可查看记录」；`06`：点凭证缩略图 → `uni.previewImage` 大图覆盖层正常 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上 schema 探针 | 实测 `https://e.joho.cn/admin-api/`（`vendure-token: canteen-a-token`，superadmin 登录）：`campusMerchantAfterSalesDetail(id="27")` 返回 `request{... overdue}` + `messages[1]` + `messageTotal:1` + `stateHistory`（`null→Pending→Rejected→Appealed`）+ `refundError:null` + `actualRefundAmount:null` + `timeoutHours:48`；`campusMerchantAfterSalesReply(id="25")`（待处理）→ 返回 `id:"6" senderType:"admin" senderName:"Super Admin" createdAt` 并写入成功，复查详情 `messages` 可见该条 |
| 线上校验分支 | 不存在 id `999999` → `售后单不存在或不属于当前店铺`（`USER_INPUT_ERROR`）；无 Bearer → `You are not currently authorized to perform this action`（`FORBIDDEN`）；**回复状态边界实测为「仅 `Closed` 禁言」**：`Appealed`(id=27)、`Refunded`(id=26) 仍可写入 → 后端宽松、前端（`canReply`）只放行 `Pending`/`Appealed`，已结束单在 UI 上只读 |
| 后台部署 | `node scripts/deploy.mjs` → 构建 + 产物校验 + nginx reload → `deploy done` |
| 线上 | `https://e.joho.cn/guanli/` HTTP 200 |

### 82.6 边界与已知限制

- **后台只能发文字**：面板输入框不带选图，商家侧图片消息仅做展示（顾客上传的凭证与留言图可点开原图）。
- **C 端留言不做分页**：一次取 100 条，超出后更早消息不展示（插件列表本身支持 skip/take）。
- **时间线不含操作人**：只展示「从什么状态 → 到什么状态 + 时间」，不显示由谁触发（插件历史表有 `operatorUserId`，未回传）。
- **状态时间线与列表状态可能短暂不一致**：退款异步回执期间刷新详情即可。
- **面板为前端覆盖层**：H5 下从页面头部下方开始铺满（`top: var(--window-top)`），App/小程序端全屏。

### 82.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `vendure` 提交 `f7f950a89`（售后详情/协商留言，随 §81 一并提交并推送）→ 服务器执行 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env` | `pm2 restart vendure` 返回 `[vendure](1) ✓ online`；`admin-api` 探针 `campusMerchantAfterSalesDetail` / `campusMerchantAfterSalesReply` 均可用（明细见 82.5） |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | 构建 `DONE Build complete.` → `[deploy] 产物校验通过: 61869 KB` → nginx `configuration ... test is successful` + reload → `deploy done` |
| C 端 | `src/pkg-after-sale/pages/detail.vue` + i18n 随 vshop 提交 `0c7afbef`；未单独部署 H5 站点 | — |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200 |

操作入口：商家工作台「商家接单」页 → 「售后申请 ›」→ ① 点任意售后卡（待处理卡直接点卡片，已处理卡点右下「点击查看详情 ›」）；② 面板自上而下看单号/金额/状态、顾客与原因、凭证九宫格（点图放大）、处理进度时间线、协商记录；③ 待处理/申诉单在底部输入框写回复 → 「发送」→ 右侧出现商家气泡，列表「留言 n 条」同步 +1；④ 已退款、已驳回、退款失败、已关闭的单底部显示「该售后已结束，仅可查看记录」；⑤ 顾客在小程序「售后详情」看到同一条对话，可继续留言（商家与平台回复以左侧气泡展示）。

## §84 售后异常收口（退款失败置顶 + 一键重试 + 状态筛选）

### 84.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/merchant-after-sales.vue` | ① 顶部五档筛选（全部 / 待处理 / 已退款 / 已驳回 / 退款失败），横向可滚动；② 退款失败单**始终置顶**；③ 失败卡显示「退款失败，可重试或联系顾客」+ 红色「重试退款」按钮；④ 点击后确认弹窗写明订单号与金额，成功后 toast 并刷新列表 |
| 后台 | `web-admin/src/apis/campus.ts` | 新增 `campusMerchantAfterSalesRetryRefund(id)`（mutation，返回售后行） |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增 13 条：5 个筛选项 + 空态 + 重试按钮/标题/正文/提示/三条结果文案 |
| 截图 | `docs/screenshots/waimai/p84-after-sales-retry/` | 4 张：失败卡置顶带重试 / 确认弹窗 / 重试成功 toast / 筛选「退款失败」 |
| 脚本 | `web-admin/scripts/shots-p84-after-sales-retry.cjs` | mock 5 单（2 失败 + 1 驳回 + 1 已退款 + 1 待处理），重试后把目标单改为已退款 |

### 84.2 口径与契约

```graphql
mutation campusMerchantAfterSalesRetryRefund(id: ID!): CampusMerchantAfterSalesItem!
```

- **仅 `RefundFailed` 可重试**：其他状态由后端 `assertChannelAfterSales(ctx, id, ['RefundFailed'])` 挡回。
- **30 秒冷却**：同一售后单 30 秒内再次点击 → `退款重试过于频繁，请 30 秒后再试`（内存记录，重启即清）。
- **重试复用插件退款核心**（`AfterSalesService.retryRefund`，按剩余可退额度继续退），失败原文透传：`退款重试失败：<原因>`。
- **筛选口径**：一次拉全量（`state: null`），前端按状态过滤；`退款失败` 一档等价 `state === 'RefundFailed'`。`退款失败` 在「全部 / 已退款」等任何视图里都排最前。
- **失败原因**：列表卡只给结论提示，具体错误原文在详情面板「退款失败：<原因>」一行（§82 已实现）。

### 84.3 权限与校验

| 场景 | 结果 |
|---|---|
| 未登录 / 无 Bearer | `FORBIDDEN` |
| 非本店售后 id | `售后单不存在或不属于当前店铺`（`USER_INPUT_ERROR`） |
| 非 `RefundFailed` 状态重试 | `该售后申请已处理，不能重复操作`（`assertChannelAfterSales(ctx, id, ['RefundFailed'])`，实测 `Appealed` 单返回此文案） |
| 30 秒内重复重试 | `退款重试过于频繁，请 30 秒后再试` |
| 权限点 | `CampusMerchant`（与售后列表/同意/驳回一致） |

### 84.4 数据库变更

无（复用 `after_sales_request` 既有 `state` / `refundError` 字段与插件状态机）。

### 84.5 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图脚本 | `01`：A2400006（¥32.50）/ A2400007（¥12.00）两条退款失败卡置顶，均带「重试退款」；`02`：点重试 → 弹窗「订单 A2400006 的 ¥32.50 将再次尝试原路退款，确认继续？」；`03`：确认后 A2400006 变「已退款」并显示「退款到账 21:38」，toast「重试成功，退款已到账」；`04`：切「退款失败」筛选项 → 列表只剩 A2400007 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上后端探针 | `login(superadmin)` 200 取得 Bearer；`campusMerchantAfterSales` → `total: 3 / pendingCount: 2`（`27 Appealed` / `26 Refunded` / `25 Pending`）；`campusMerchantAfterSalesRetryRefund(27)` → `USER_INPUT_ERROR 该售后申请已处理，不能重复操作`；`(99999)` → `售后单不存在或不属于当前店铺`；无 Bearer → `FORBIDDEN` |
| 线上后台产物 | `pages-campus-merchant-after-sales.WFIR3QTG.js` 与 `merchant-after-sales-BvKf_MhX.css` 均含 `op-retry` / `flt__i`；`/guanli/`、该 chunk、该 css 均 HTTP 200 |

> 生产库当前没有 `RefundFailed` 状态的售后单，**成功重试链路只在 mock 截图里验证**（真实重试需等出现退款失败的实例）。


### 84.6 边界与已知限制

- **分页「加载更多」未做**：售后列表后端仍只接受 `state`（无 `skip/take`/`totalItems`），超过 50 条时一次性全量返回；计划里的分页筛选留到后端补 `options` 参数后再接。
- **重试冷却在进程内存**：多实例部署时每实例独立计时，且重启即清；真正的幂等兜底靠插件退款核心。
- **筛选是前端过滤**：全量一次拉回后本地过滤，单店售后量级（数百条）可接受；量再大需改为服务端筛选 + 分页。
- **失败原因不在列表**：列表项不返回 `refundError`，需点卡片进详情面板查看原文（避免列表接口字段膨胀）。

### 84.7 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `campusMerchantAfterSalesRetryRefund` 随 `vendure` 提交 `afe94345c` 入库；服务器 `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin && pm2 restart vendure --update-env`（服务器 HEAD `95983386a`） | pm2 `vendure ✓ online`；`lib/src/merchant-admin.resolver.js` 含 `campusMerchantAfterSalesRetryRefund`；探针可用（见 84.5） |
| 后台 | `node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61871 KB` → nginx `configuration ... test is successful` + reload → `deploy done`；线上 chunk 含新类名 |

操作入口：商家工作台「商家接单」页 → 「售后申请 ›」→ ① 顶部筛选条选「退款失败」只看失败单（不选则失败单自动置顶）；② 失败卡点「重试退款」→ 弹窗核对订单号与金额 → 确认；③ 成功 toast「重试成功，退款已到账」，卡片转「已退款」，30 秒内再点会被拦下。

## §85 备餐汇总实时刷新

### 85.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 备餐汇总面板打开即起 10s 轮询；连续 3 次份数无变化降到 30s，一有变化立刻回 10s；面板顶部显示「自动刷新 · 刚刚更新 / n 秒前 / n 分钟前」；关闭面板或页面切后台即停，保留手动「刷新」 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增 3 条：`prepJustNow` / `prepAgoSec` / `prepAgoMin` |
| 截图 | `docs/screenshots/waimai/p85-prep-live/` | 3 张：面板首屏（刚刚更新）/ 11s 后自动刷新份数上涨（未点任何按钮）/ 手动刷新 |
| 脚本 | `web-admin/scripts/shots-p85-prep-live.cjs` | mock `campusMerchantPrepSummary` 每次调用份数 +1~2，真实等待 11s 验证无需点击 |

### 85.2 口径与实现

- 复用 `campusMerchantPrepSummary`（§79），**无新增接口、无后端改动**。
- 计时用 `setTimeout` 链而非 `setInterval`：上一轮返回才排下一轮，天然不会并发重复请求（另有 `prepInFlight` 兜底）。
- 指纹只比 `商品名|待做份数|已出份数|加料条数`，避免整表 JSON 深比较；连续 3 次相同 → 降频到 30s。
- 相对时间文案由 1s 心跳 `prepTick` 驱动，只更新文字不发请求。
- 轮询失败静默（不弹 toast 干扰后厨），计入「无变化」次数并继续降频；手动「刷新」立即拉取并重置计数。

### 85.3 校验与边界

| 场景 | 行为 |
|---|---|
| 面板打开 | 首屏 `loadPrep()` 立刻拉一次，随后 10s 一次 |
| 面板关闭 / 页面卸载 | `stopPrepLive()` 清 `setTimeout` + 心跳，Network 归零 |
| H5 标签页隐藏 | 该轮跳过请求，10s 后再判断（等价暂停） |
| 连续 3 轮份数不变 | 间隔切 30s；任一商品份数变化立刻回 10s |
| 请求挂起 | `prepInFlight` 拦住下一轮，不会叠加 |

### 85.4 验证记录

| 步骤 | 结果 |
|---|---|
| 构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 打开面板：`宫保鸡丁 ×3 / 香菇滑鸡饭 ×2 / 凉拌黄瓜 ×1`，顶部「自动刷新 · 刚刚更新」 |
| 截图 02 | 不点任何按钮等 11s：份数变 `×5 / ×3 / ×2`（mock 每次 +1~2），文案仍「刚刚更新」——证明 10s 轮询生效 |
| 截图 03 | 点「刷新」后 `×7 / ×4 / ×3`，节流计数重置 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上产物 | `pages-campus-merchant.C9SUmEht.js` + `merchant-CUB91zZE.css` 含 `ps-sync` |

### 85.5 边界与限制

- 面板只在前台可见时轮询；**工作台自身的 10s board 轮询不受影响**，两者叠加后单店每分钟约 8~12 次轻查询，可接受。
- 降频只降「份数无变化」的面板轮询，board 仍是固定 10s（新单提醒不能被拖慢）。

### 85.6 部署记录（2026-10-30）

| 端 | 动作 | 结果 |
|---|---|---|
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61873 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 | `https://e.joho.cn/guanli/` | HTTP 200，chunk 含 `ps-sync` |

操作入口：商家工作台「商家接单」页 → 「备餐汇总 ›」→ 面板顶部会显示「自动刷新 · 刚刚更新」，新单进来后份数自己涨（最多 10s 延迟）；后厨长时间无新单时自动降为 30s 一次；关掉面板即停止请求。

## §83 商家工作台「今日待办」中心

### 83.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后端 | `vendure` `packages/campus-delivery-plugin/src/merchant-admin.service.ts` | `board()` 增三个计数：`afterSalesPending`（Pending + Appealed 售后单）、`refundFailed`（RefundFailed）、`overdueOrders`（待接单/备餐中等待 ≥25 分钟，与出餐屏 `late` 同口径）；售后两个数字用**一次 groupBy 聚合**拿到，不为两个数字发两条 count |
| 后端 | 同插件 `src/campus-delivery.plugin.ts` | SDL `CampusMerchantBoard` 补 `afterSalesPending / refundFailed / overdueOrders: Int!` |
| 后台 | `web-admin/src/apis/campus.ts` | `CampusMerchantBoard` 类型与 board 查询补三字段 |
| 后台 | `web-admin/src/pages/campus/merchant.vue` | ① 顶部「今日待办」条：售后 / 催单 / 退款失败 / 出餐超时 四个 chip，**数字 0 的项不渲染，全 0 时整条不占位**；② 点 chip 跳转：售后/退款失败 → 售后列表，催单 → 对应栏，超时 → 出餐屏；③ 入口条「售后申请」「退款记录」右侧红底白字角标 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增 5 条：`todoTitle / todoAfterSales / todoUrged / todoRefundFailed / todoOverdue` |
| 截图 | `docs/screenshots/waimai/p83-todo-center/` | 3 张：四类待办有数（含入口角标）/ 全部清零（待办条消失）/ 只剩售后+退款失败（0 的项不渲染） |
| 脚本 | `web-admin/scripts/shots-p83-todo-center.cjs` | mock board 三种计数组合，靠整页 reload 切换状态（仅改 hash 不会重载应用） |

### 83.2 口径与契约

```graphql
campusMerchantBoard {
  ... afterSalesPending: Int! refundFailed: Int! overdueOrders: Int!
}
```

- **渠道隔离**：三个计数都按 `ctx.channelId` 过滤；售后计数沿用 `afterSalesList` 的 `a→order→channels` join 与 `hallStatus IS NOT NULL`，与售后列表页口径一致。
- **超时口径**：与出餐屏 `KDS_LATE_MINUTES = 25` 同源，只算 `pending_merchant` / `accepted` 两态，备餐完成即退出。
- **零请求增量**：工作台已有 10s board 轮询，三个数字搭同一次请求刷新，不新增接口、不新增轮询。
- **视觉优先**：`退款失败`、`出餐超时` 用红色 chip（`warn`），售后/催单用主题橙色。

### 83.3 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 「今日待办」条一行放下 4 个 chip：`售后 2 · 催单 1 · 退款失败 1 · 出餐超时 1`，后两者红底；「售后申请」角标 `2`、「退款记录」角标 `1` |
| 截图 02 | 四项全 0 → `.todobar` 不存在（`todoBar:false`），入口角标同时消失 |
| 截图 03 | 只有售后 3 / 退款失败 2 → chip 只渲染 2 个，`出餐超时` 不出现 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 线上后端探针 | `campusMerchantBoard` → `afterSalesPending: 2 / refundFailed: 0 / overdueOrders: 0 / urgedCount: 0`；与 `campusMerchantAfterSales.pendingCount: 2` 同口径（列表为 `27:Appealed / 26:Refunded / 25:Pending`）；无 Bearer → `FORBIDDEN` |
| 线上后台产物 | `pages-campus-merchant.CU7Fi7zh.js` + `merchant-c9lMlVT_.css` 含 `todobar` / `e-badge`；`/guanli/` HTTP 200 |

### 83.4 边界与已知限制

- **上线顺序**：三计数随 vendure `origin/master` `a016ced96` 上线，后台才是后部署的一侧；以后回滚后台到「早于本批次」的版本不受影响（旧版不请求这三个字段），但**回滚后端要先回滚后台**，否则 board 查询会报 `Cannot query field "afterSalesPending"`。
- 待办数字是「全量待处理」，不是「今日新增」：跨天未处理的售后仍计入，直到处理完（与售后列表页的 `pendingCount` 一致）。
- 超时只覆盖「待接单 + 备餐中」，配送段超时在各配送栏自身提示，不重复计入。

### 83.5 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `git fetch origin master -q && git checkout origin/master -- packages/campus-delivery-plugin packages/notification-plugin && pm2 restart vendure --update-env`（vendure `origin/master` = `a016ced96`） | pm2 `vendure ✓ online`；`lib/merchant-admin.service.js` 含 `afterSalesPending`、`lib/campus-delivery.plugin.js` 含 `overdueOrders`；探针可用（见 83.3） |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61875 KB` → nginx `test is successful` + reload → `deploy done`；线上 chunk 含 `todobar` / `e-badge` |
| 数据库 | 未执行 `vendure migrate`：生产未设 `DB_SYNC=0`，`dev-config.ts` 的 `synchronize: process.env.DB_SYNC !== '0'` 为 true，重启时由 TypeORM 自动同步 p17/p18 结构 | 启动无迁移报错，board 查询正常 |

操作入口：商家工作台「商家接单」页 → 顶部「今日待办」条 → 点「售后 2」跳售后列表（退款失败单已置顶）、点「催单 1」跳有催单的订单栏、点「出餐超时 1」进出餐屏；全部处理完后整条自动消失。

## §86 每日日报推送（已上线）

### 86.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后端 | `campus-delivery-plugin/src/daily-report-push.job.ts` | 每 30 分钟扫描开启推送的渠道，到点（店铺设定 `HH:MM`，默认 21:30）按渠道级 PG 咨询锁单飞执行，汇总当日 `delivered` 单量/营业额/客单价/高峰时段/热销前 5，经 Feishu 推送；同一天只推一次（写 `waimaiDailyPushLastDate`） |
| 后端 | `campus-delivery-plugin/src/migrations/p23-daily-push.ts` | 幂等补列（`customFieldsWaimaidailypushenabled/time/lastdate`），生产 `synchronize:false` 必备 |
| 后端 | `campus-delivery-plugin/src/custom-fields.ts` / `merchant-admin.service.ts` / `merchant-admin.resolver.ts` / `campus-delivery.plugin.ts` / `index.ts` | Channel 三字段 + `storeProfile` 回传 + `campusMerchantUpdateDailyPush` mutation + SDL/注册/bootstrap 启动 |
| 后台 | `web-admin/src/apis/campus.ts` | `MerchantStoreProfile` 增 `dailyPushEnabled / dailyPushTime`；`STORE_PROFILE_FIELDS` 补两字段；新增 `campusMerchantUpdateDailyPush(enabled, time)` |
| 后台 | `web-admin/src/pages/campus/store-settings.vue` | 新增「每日日报推送」卡片：开关 + 开启后展开「推送时间」（默认 21:30）+ 说明 + 「保存推送设置」；`applyProfile` 回填开关与时间 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增 8 条：`dailyPushTitle/Toggle/Desc/TimeLabel/TimeHint/Save/Saved/BadTime` |
| 截图 | `docs/screenshots/waimai/p86-daily-push/` | 3 张：关闭态 / 开启态（时间 21:30）/ 填 `2130` 保存被拦并提示 |
| 脚本 | `web-admin/scripts/shots-p86-daily-push.cjs` | mock 门店资料 + 推送保存 mutation |

### 86.2 契约（前后端一致）

```graphql
mutation { campusMerchantUpdateDailyPush(enabled: Boolean!, time: String) { ...MerchantStoreProfile } }
type MerchantStoreProfile { ... dailyPushEnabled: Boolean! dailyPushTime: String! }
```

### 86.3 校验与边界

- 时间用 `^([01]\d|2[0-3]):[0-5]\d$` 前端先拦，非法直接 toast「时间格式应为 HH:MM（如 21:30）」，不发请求。
- 关闭开关时时间框隐藏、时间不参与校验，保存传 `enabled:false`。
- 保存成功后用 `applyProfile(p, false)` 只回填开关/时间，不覆盖正在编辑的公告与电话。

### 86.4 验证记录

| 步骤 | 结果 |
|---|---|
| 构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 关闭态：标题「每日日报推送」、说明文案、`保存推送设置`，无时间框 |
| 截图 02 | 点开关：开关变橙、展开「推送时间 = 21:30」、出现时间格式说明 |
| 截图 03 | 填 `2130` 点保存：弹 toast「时间格式应为 HH:MM（如 21:30）」，未发请求 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |

### 86.5 生产探针（admin-api，`canteen-a` 渠道）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantStoreProfile { dailyPushEnabled dailyPushTime }` | 关闭态基线：`false / "21:30"` PASS |
| 2 | `campusMerchantUpdateDailyPush(enabled:true, time:"21:30")` | `true / "21:30"` PASS |
| 3 | `time:"2130"`（非法格式） | `errors[0] = 推送时间格式应为 HH:MM（如 21:30）`，未落库 PASS |
| 4 | `enabled:true, time:null` | 时间回落 `"21:30"` PASS |
| 5 | `enabled:false` | 复原关闭态（生产基线）PASS |
| 6 | 两个接口不带 Bearer | 均 `FORBIDDEN`（未越权）PASS |

### 86.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 数据库 | 生产 `DB_SYNC=0`（`synchronize:false`），Channel 三列由 `/tmp/fix86.sh` 直连 PG 执行 `ALTER TABLE "public"."channel" ADD COLUMN IF NOT EXISTS ...`（`customFieldsWaimaidailypushenabled` boolean、`customFieldsWaimaidailypushtime` varchar(5)、`customFieldsWaimaidailypushlastdate` varchar(10)） | `information_schema` 确认三列存在 |
| 后端 | 统一在**干净基线**（`git worktree --detach origin/master`）编译 `packages/campus-delivery-plugin`，scp `lib` 产物（`daily-report-push.job.js`、`migrations/p23-daily-push.js`、`custom-fields.js`、`merchant-admin.service.js`、`merchant-admin.resolver.js`、`campus-delivery.plugin.js`、`index.js`）→ `pm2 restart vendure --update-env` | `uptime > 3min`、restarts 不再增长；`http://127.0.0.1:3020/health` → `{"status":"ok"}` |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61878 KB` → nginx `test is successful` + reload → `deploy done`；线上 `index-DOJDQ0eV.js`、`pages-campus-store-settings.xgJyChUY.js`、`campus.D3cOcTa5.js` 均 200 且命中 `dailyPush`；`https://e.joho.cn/guanli/` 200 |

**踩坑**：新 customFields 一旦随 `lib` 上线，启动期就有查询命中 `Channel`，缺列会直接 `QueryFailedError: column Channel.customFieldsWaimaidailypushenabled does not exist` 打进重启循环（restarts 逐秒上涨、`/health` 无响应）；p23 迁移是 `OnApplicationBootstrap`，来不及救启动期查询，必须先在库里补列。**回滚注意**：先回滚后台（旧版不请求两字段）再回滚后端。

## §87 云打印任务排障面板（已上线）

后端 `campusMerchantPrintJobs` 与 `campusMerchantCloudPrint`（重打）此前已就绪，但后台没有任何入口：云打印失败后商家只能看到「未出票」，看不到服务商返回的真实原因，也无法按单重打。本段补一个纯前端面板。

### 87.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/merchant.vue` | 打印条（云通道）新增「打印任务」按钮；新增面板：最近 20 条留痕（订单号 / 服务商 / 触发方式 / 联数 / 耗时 / 干跑标记 / 时间），失败行展示服务商原因并标红，行尾「重打」按订单重发出票；底部「刷新」 |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增 15 条：`printJobsEntry/Title/Hint/Empty/Refresh/Reprint/Ok/Failed/TestJob/CopiesUnit/DryRun/TriggerAuto/TriggerManual/TriggerTest/ReprintOk` |
| 截图 | `docs/screenshots/waimai/p87-print-jobs/` | 3 张：入口按钮 / 面板（含失败行）/ 点重打后转成功并提示 |
| 脚本 | `web-admin/scripts/shots-p87-print-jobs.cjs` | mock 看板（`printProvider=feie`）+ 打印留痕 + 重打 mutation |

### 87.2 契约（前端直接复用已有后端）

```graphql
query ($limit: Int) { campusMerchantPrintJobs(limit: $limit) { id orderId orderCode provider deviceSn status triggerType copies dryRun errorMessage durationMs createdAt } }
mutation ($orderId: ID!) { campusMerchantCloudPrint(orderId: $orderId) { ok provider dryRun jobId error } }
```

### 87.3 校验与边界

- 入口仅云通道出现（`printProvider !== 'local'`）：本地 C-Lodop 通道的失败原因在浏览器侧（顶部打印条重试），没有服务端留痕可查。
- 面板每次打开都重新拉取，翻页不做，固定 `limit: 20`（与后端默认一致，够排障不留冗余）。
- 只有绑定订单的留痕（`orderId` 非空）才渲染「重打」；测试打印的行（`orderId = null`）只展示不断言。
- 重打期间该行按钮 `disabled`（`jobReprinting` 单值锁），成功后自动刷新列表，失败直接 toast 服务商原因（`r.error` 优先，兜底「小票打印失败」）。
- 失败原因原文展示、不截断也不改写：服务商错误码（如飞鹅 `1002 打印机不在线`）是商家排查电源/网络/SN 的直接依据。

### 87.4 验证记录

| 步骤 | 结果 |
|---|---|
| 构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 打印条：`自动打印：支付后出票 · 飞鹅云打印 · 已配置`，按钮 `测试打印 / 打印任务 / 使用说明` |
| 截图 02 | 面板标题「云打印任务」+ 提示「最近 20 条出票留痕…」；5 行留痕，首行 `A2400002` 标「失败」并展示 `飞鹅云返回 1002：打印机不在线…`；「测试打印」行显示 `干跑` |
| 截图 03 | 点首行「重打」→ toast「已重新出票」，该行转为「成功」（940ms），失败原因消失 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |

### 87.5 生产探针（admin-api，`canteen-a` 渠道）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantPrintJobs(limit:20)` 带 Bearer | 200，返回数组（当前渠道暂无留痕 → `[]`），字段无裁剪、无报错 PASS |
| 2 | 同一 query 不带 Bearer | `FORBIDDEN`（You are not currently authorized…）PASS |

### 87.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无（复用既有 `campusMerchantPrintJobs` / `campusMerchantCloudPrint`，无需迁移） | 探针即验证 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61883 KB` → nginx `test is successful` + reload → `deploy done`；线上 `index-DxmZBuUk.js`（200 / 894154 B）与 `pages-campus-merchant.YvwqWM2o.js`（200 / 40631 B）均命中 `printJobsEntry`；`https://e.joho.cn/guanli/` 200 |

## §88 评价申诉「撤销通过」（已上线）

此前平台审核通过申诉后评价被置为 `hidden`，一旦误判只能人工改库恢复：后台没有任何撤销入口，评分聚合也不会回补。本段补平台侧撤销：恢复展示、回补评分、留痕（操作人/原因/时间），并把申诉状态回退为「已驳回」，商家侧看到的状态同步回退。

### 88.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后端 | `review-plugin/src/review.service.ts` | 新增 `revokeReviewAppeal(ctx, id, note)`：校验 `appealStatus === 'approved'` 且 `status === 'hidden'` → 原因必填且 ≤300 字 → 状态回退 `rejected`、`appealResult` 追加「撤销通过：原因」、写 `appealReviewedBy/At` → 评价恢复 `approved` → 主评（`parentId` 为空）重算商品评分 |
| 后端 | `review-plugin/src/review-admin.resolver.ts` / `plugin.ts` | adminSchema 增 `Mutation.revokeReviewAppeal(id: ID!, note: String): Review!`；resolver `@Allow(Permission.UpdateOrder)`；`lib/` 同步编译产物 |
| 后台 | `web-admin/src/apis/review.ts` | 新增 `revokeReviewAppeal(id, note)`（mutation `revokeReviewAppeal`，返回 `id status appealStatus appealResult appealReviewedAt`） |
| 后台 | `web-admin/src/pages/review/list/index.vue` | 申诉卡在「待审核（通过/驳回按钮）」之外补 `appealStatus === 'approved'` 分支的「撤销通过」按钮；`appealDialog.kind` 扩为 `approve / reject / revoke`，标题/说明/占位按 kind 切换；提交时 revoke 原因必填 |
| 后台 | `locale/zh-Hans.json` / `en.json` | 新增 6 条：`revokeAppealBtn / revokeAppealTitle / revokeAppealContent / revokeAppealNotePlaceholder / revokeAppealEmpty / appealRevoked` |
| 截图 | `docs/screenshots/waimai/p88-appeal-revoke/` | 4 张：已通过卡片撤销入口 / 撤销弹窗（原因必填）/ 撤销成功 toast / 切「已驳回」后状态回退并留痕 |
| 脚本 | `web-admin/scripts/shots-p88-p90.cjs` | mock `reviewAppeals`（按 `options.status` 过滤）+ `revokeReviewAppeal`（回写 rejected/approved 与留痕） |

### 88.2 契约（前后端一致）

```graphql
mutation ($id: ID!, $note: String) {
  revokeReviewAppeal(id: $id, note: $note) { id status appealStatus appealResult appealReviewedBy appealReviewedAt }
}
```

- `note` 在 schema 上可空，但服务端强制必填（空串报「请填写撤销原因」），避免无因撤销。
- 复用既有 appeal 字段，不新增 customFields / 表列，无需改库。

### 88.3 校验与边界

- 两道前置校验顺序固定：先 `仅已通过的申诉可撤销`（`appealStatus !== 'approved'`），再 `评价当前不是隐藏态，无需撤销`（`status !== 'hidden'`）——即「已通过但评价已被别处恢复」也不会重复回补评分。
- 原因长度上限 300 字（与申诉理由同常量 `MAX_APPEAL_REASON`）。
- 留痕拼接前先剥掉上一段末尾标点（`。；;，,`），最终形如 `已通过：…评价隐藏；撤销通过：经复核该申诉证据不足，恢复评价展示`，不会出现「。；」。
- 只对主评重算评分：追评（`parentId` 非空）不进聚合，撤销追评不做评分回补。
- 前端按钮只在 `appealStatus === 'approved'` 卡片出现；「已驳回」卡片不再显示任何操作，防止反复撤销。
- 撤销成功后原地刷新列表（不整页重载），并把用户当前筛选保持不动，本次截图即用「已驳回」筛选复核结果。

### 88.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后端编译 | `tsc -p packages/review-plugin/tsconfig.json` → exit 0 |
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 评价管理 →「差评申诉」→ 筛选「已通过」：2 张卡均显示状态「已通过（评价已隐藏）」，操作区只有 `撤销通过` |
| 截图 02 | 点「撤销通过」：弹窗标题「撤销通过该申诉」、说明「撤销后该评价恢复展示并重新计入商品评分，申诉状态回退为「已驳回」。」、`取消 / 确定` |
| 截图 03 | 填原因「经复核该申诉证据不足，恢复评价展示」→ 确定：toast「已撤销通过」，列表剩余 1 张已通过卡片 |
| 截图 04 | 切「已驳回」：同一评价显示「已驳回」，申诉说明末段为「…评价隐藏；撤销通过：经复核该申诉证据不足，恢复评价展示」 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |

### 88.5 生产探针（admin-api，`canteen-a` 渠道）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `reviews(options:{take:5})` 带 Bearer | 返回 5 条（`9:deleted / 11:pending / 12:approved`），字段正常 PASS |
| 2 | `revokeReviewAppeal(id:"9", note:"探针验证")`（`appealStatus=null`） | `errors[0] = 仅已通过的申诉可撤销`，数据未变 PASS |
| 3 | 同一单 `note:""` | 同样在第一步被拦（未走到原因校验），说明校验顺序正确 PASS |
| 4 | `revokeReviewAppeal(id:"9999999")` | `No Review with the id "9999999" could be found` PASS |
| 5 | 同 mutation 不带 Bearer | `You are not currently authorized to perform this action` PASS |

生产库当前没有「已通过且隐藏」的真实评价（探针 2 返回 `appealStatus=null`），因此**未对生产数据执行真实撤销**；正向路径由后台 mock 截图与本地逻辑覆盖。

### 88.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | vendure `4515d0931 feat(review): 评价申诉撤销通过（§88）`（`packages/review-plugin/src` + `lib`）→ `git push origin master` → 服务器 `git fetch + reset --hard origin/master` + `pm2 restart vendure --update-env` | `HEAD is now at 4515d0931`；修复下条缺列后 `pm2 vendure online`、`/health` 200、`https://e.joho.cn/admin-api` 200 |
| 数据库 | 重启首轮进入崩溃循环：`QueryFailedError: column Channel.customFieldsWaimaiaftersalesmonthlypushenabled does not exist`（本批之前 §94~§97 的 customFields 只在代码里，生产 `DB_SYNC=0` 从未补列）→ `/tmp/fix-cols.js` 用 `pg` 直连 `vendure` 库，把 p24/p25/p26/p27 的幂等 DDL（`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`）逐条执行 | p24 5 条 / p25 7 条 / p26 12 条 / p27 4 条全 ok；`information_schema` 确认 channel 的 4 个月度推送列存在，重启后不再报错 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61889 KB` → nginx `test is successful` + reload → `deploy done`；线上 `pages-review-list-index.QBkNb1MQ.js`（200 / 27172 B）命中 `revokeReviewAppeal` |

**踩坑**：`p25`~`p27` 都是 `OnApplicationBootstrap` 迁移，救不了「启动期 `ChannelService.initChannels` 查询」；只要代码先上线、列还没补，进程就会一直重启（`↺` 逐秒上涨、`/health` 000、admin-api 503）。顺序必须是「先补列 → 再重启」。

## §89 经营数据导出自定义起止日期（已上线）

§57 的经营数据导出固定 30 日窗口，日期列只有 `MM-DD`，跨年无法区分，商家想导「上个月」或「某个活动周期」只能导全部。本段补起止日期选择、完整日期列与区间校验。

### 89.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后端（已在线，本段验证） | `campus-delivery-plugin/src/merchant-admin.service.ts` | `MerchantRevenueDay` 增 `dateFull`（`YYYY-MM-DD`）；新增 `revenueRange(ctx, from, to)`：`^\d{4}-\d{2}-\d{2}$` 校验、`to < from` 报错、区间 >366 天报错，逐日聚合并补 0，口径与 `revenue().days30` 一致 |
| 后端（已在线，本段验证） | `merchant-admin.resolver.ts` / `campus-delivery.plugin.ts` | `campusMerchantRevenueRange(from: String!, to: String!): [CampusMerchantRevenueDay!]!`，权限 `CampusMerchant` |
| 后台 | `web-admin/src/apis/campus.ts` | `MerchantRevenueDay` 增 `dateFull`；`revenue`/`days30` 查询补 `dateFull`；新增 `campusMerchantRevenueRange(from, to)` |
| 后台 | `web-admin/src/pages/campus/store-settings.vue` | 导出区新增两个 `picker mode="date"` 起止选择（默认 `今日-29天 ~ 今日`，结束日上限今天）、`至` 分隔、按钮文案「导出 CSV（所选区间）」、`exporting` 期间按钮禁用；`exportCsv()` 改 async：先拦非法区间 → 拉 `campusMerchantRevenueRange` → CSV 用 `dateFull` → 文件名带区间 → toast「已导出 {n} 天」 |
| 后台 | `locale/zh-Hans.json` / `en.json` | 新增 7 条：`exportRangeJoin / exporting / exportRangeInvalid / exportRangeTooLong / exportFail / exportDone`（`已导出 {n} 天`），改 `exportCsv`（导出 CSV（所选区间））、`exportHint`、`exportFileName`（经营数据）、`csvDate`（日期(YYYY-MM-DD)） |
| 截图 | `docs/screenshots/waimai/p89-export-range/` | 3 张：区间条（`2026-10-02 至 2026-10-31` + 区间按钮 + 提示）/ 导出后 toast「已导出 30 天」/ 真实下载 CSV 的预览（表头与 30 行逐日明细） |
| 脚本 | `web-admin/scripts/shots-p88-p90.cjs` | mock `campusMerchantRevenueRange` 按 `from/to` 逐日造数；用 `page.waitForEvent('download')` 真抓 CSV，再据其内容渲染预览页截图 |

### 89.2 契约（前后端一致）

```graphql
query ($from: String!, $to: String!) {
  campusMerchantRevenueRange(from: $from, to: $to) { date dateFull orders gross cancelled cancelledAmount }
}
```

CSV 列：`日期(YYYY-MM-DD),完成单量,营业额(元),取消单量,退款金额(元)`；文件名 `经营数据-<FROM 紧凑>-<TO 紧凑>.csv`（如 `经营数据-20261002-20261031.csv`），BOM + CRLF，Excel 直接双击可读。

### 89.3 校验与边界

- 前端先拦：`to < from` → 「结束日期不能早于开始日期」；区间 >366 天 → 「导出区间不能超过 366 天」；均不发请求。
- 后端同口径二次校验（`日期格式须为 YYYY-MM-DD` / `结束日期不能早于开始日期` / `导出区间不能超过 366 天`），前端被绕过也拦得住。
- 起止「含首尾两天」，缺单日为 0 行，保证行数 = 区间天数；实测 `2026-10-02 ~ 2026-10-31` = 30 行。
- 日期列改 `dateFull` 后，跨年区间（如 `2025-12-20 ~ 2026-01-10`）不会再出现重复的 `12-20`/`01-10`。
- 结束日期 picker 的 `:end` 绑今天，避免导出未来空区间；开始日期不做下限，历史数据可任意回溯（上限由 366 天规则兜住）。
- **已知限制（截图取舍）**：uni-app H5 的 `picker` 在 headless 下是原生弹层（`.uni-picker-container` 常驻 `display:none`，click/tap 均不展开），所以没有「日期选择器展开」截图，改为「区间条 + 真实 CSV 导出结果」两张证据。

### 89.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 导出区：`2026-10-02 至 2026-10-31` 两枚日期 chip、按钮「导出 CSV（所选区间）」、提示「…区间最长 366 天。」 |
| 截图 02 | 点导出：`page.waitForEvent('download')` 捕获成功，250ms 后截图，toast「已导出 30 天」，按钮未置灰 |
| 截图 03 | 真实 CSV 内容：文件名 `经营数据-20261002-20261031.csv`、表头 `日期(YYYY-MM-DD),完成单量,营业额(元),取消单量,退款金额(元)`、30 行，首行 `2026-10-02,26,756.60,2,52.00` |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |

### 89.5 生产探针（admin-api，`canteen-a` 渠道）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `from:"2026-10-01" to:"2026-10-31"` | 31 行，`first { date:"10-01", dateFull:"2026-10-01" }`、`last { date:"10-31", dateFull:"2026-10-31" }`（生产该渠道当前无单，金额均为 0）PASS |
| 2 | `from:"2026-10-31" to:"2026-10-01"` | `结束日期不能早于开始日期` PASS |
| 3 | `from:"2024-01-01" to:"2026-12-31"` | `导出区间不能超过 366 天` PASS |
| 4 | `from:"2026/10/01"` | `日期格式须为 YYYY-MM-DD` PASS |
| 5 | 同一 query 不带 Bearer | `You are not currently authorized to perform this action` PASS |

### 89.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无新增（`campusMerchantRevenueRange` / `dateFull` 随 §88 前的 vendure 基线已在线上，本轮仅重启复核） | 探针 1 返回 31 行带 `dateFull`，见 89.5 |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61889 KB` → nginx `test is successful` + reload → `deploy done`；线上 `pages-campus-store-settings.BeO0qkzn.js`（200 / 22049 B）命中 `exportRangeJoin`，公共 `index-DK33Wkvj.js`（200 / 895616 B）命中 `exportDone` |

操作入口：商家工作台 →「经营设置」→「经营数据」卡 → 选起止日期 → 「导出 CSV（所选区间）」。

## §90 广告素材后台上传（已上线）

§P9-3 的广告投放只允许手填图片 URL，商家手头没有图床就无法投放。本段复用已有媒体库（`MediaLibraryModal` + `assetLibrary` 上传能力）：可直接在弹层上传新图，也可从已上传素材里选，选完自动回填 URL 并出缩略预览。

### 90.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/ads.vue` | 「图片地址」cell 重排为纵向：URL 输入框（整行）+ 第二行「从媒体库选图」按钮 + 缩略预览（`image`，点开 `uni.previewImage`）+ 第三行小字提示；底部挂 `<MediaLibraryModal v-model:visible="mediaOpen" :max="1" media-type="image" @confirm="onPickAsset" />`；`onPickAsset` 取 `assets[0].source` 回填 `imageUrl` 并 `pickSeq += 1` |
| 后台 | `locale/zh-Hans.json` / `en.json` | 新增 2 条：`pickImage`（从媒体库选图）、`pickHint`（可在弹层内上传新图或选已有素材，自动回填地址） |
| 截图 | `docs/screenshots/waimai/p90-ad-media/` | 3 张：图片地址行（按钮+提示）/ 媒体库弹层（3 张素材、`已选 0/1`、含上传入口）/ 选中后回填 URL + 缩略图（`已选 1/1`） |
| 脚本 | `web-admin/scripts/shots-p88-p90.cjs` | mock `assetLibrary` / `assetTags`（3 条 SVG 素材，静态服务直出）+ `campusAdSlots` |

### 90.2 契约（复用已有接口，无新增）

```graphql
query ($take: Int, $skip: Int, $tags: [String!], $ids: [ID!]) { assetLibrary(take: $take, skip: $skip, tags: $tags, ids: $ids) { items { id name preview source mimeType width height assetTags } totalItems } }
```

提交投放仍走原 `campusMerchantCreateAd(..., imageUrl: String)`，只是 `imageUrl` 由选图回填，不再靠手抄。

### 90.3 校验与边界

- `:max="1"` + `media-type="image"`：单选且只列图片素材，避免把 PDF/视频塞进 Banner。
- 回填取 `source`（原图地址）而不是 `preview`（缩略图），C 端按原图渲染。
- 手动粘贴 URL 仍可用（输入框保留），选图只是快捷路径；`imageUrl` 为空时提交仍按旧逻辑传 `null`。
- **uni H5 输入框占位层**：`<input>` 编译成 `uni-input`，其 placeholder 是否隐藏取决于组件内部状态，程序化改值后 placeholder 会残留；选图后把输入框 `:key` 换成 `pickSeq` 强制重挂载，值来自 prop 初始化即正常显示（打字时不动 key，不会丢焦点）。
- 行内塞「输入框 + 按钮 + 提示 + 缩略图」会把输入框挤成 0 宽（长 URL 不可见），因此改成上下三行布局。

### 90.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 广告投放「新建投放」：「图片地址」行显示 URL 输入框占位「可选填，http(s) 图片地址」+「从媒体库选图」+ 提示文案 |
| 截图 02 | 点按钮：媒体库弹层打开，3 条素材（`广告素材-1/2/3.svg`）、底部「已选 0/1」 |
| 截图 03 | 选第 1 张 → 确定：弹层关闭，URL 输入框显示回填地址、右侧缩略图出现、`已选 1/1` |
| 回归 | 重跑脚本时翻出「URL 已回填但输入框显示占位」的旧问题，按 90.3 第二条修正后复测通过 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |

### 90.5 生产探针

| # | 用例 | 结果 |
|---|---|---|
| 1 | 纯前端改造（复用 `assetLibrary` / `campusMerchantCreateAd`），无新 GraphQL 字段 | 无需后端探针 |
| 2 | 线上 chunk | `pages-campus-ads.wcuTqoat.js` 200 / 13709 B，命中 `pickImage` 与媒体库组件 `MediaLibraryModal` |

### 90.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无 | — |
| 后台 | `cd D:\zhao\vshop\web-admin && node scripts/deploy.mjs` | `[deploy] 产物校验通过: 61889 KB` → nginx `test is successful` + reload → `deploy done`；线上 `pages-campus-ads.wcuTqoat.js`（200 / 13709 B）命中 `pickImage` |

操作入口：商家工作台 →「广告投放」→「新建投放」→ 图片地址行点「从媒体库选图」→ 上传或选素材 → 确定后自动回填。

## §100 售后管理：操作审计 / 值班排班 / 补偿挽留（已上线）

§100 的后端（vendure `4d73ead43`、`efaf872aa`）已在线上，但 web-admin 此前完全没有对应界面：商家看不到谁在什么时间对哪张售后单做了什么、无法维护售后值班人员，也无法沉淀常用的“退款 + 券”挽留方案。本段在「售后申请」页顶部加三个入口，落到同一新页 `after-sales-ops.vue`，用 `?tab=audit|duty|plan` 直达三块功能，避免工作台入口继续膨胀。

### 100.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/after-sales-ops.vue` | 新页，三 Tab：① 操作审计（今日/近 7 日/自定义区间 + 动作下拉（全部/同意退款/驳回/关闭售后/转交/指派/重试退款/升级仲裁）+ 处理人下拉；`take:50` 游标式「加载更多」；「导出 CSV」按当前筛选条件落盘）② 值班排班（周视图 周日~周六 分组，行内显示 `09:00~15:00`，跨零点显示 `18:00~次日 03:00`；右下「新增值班」sheet + 「保存排班」整体覆盖）③ 补偿挽留（方案卡片：名称/启停标签/退款或“只发券”/券名/备注 + 编辑·启停·删除；sheet 表单：名称、退款金额（元，留空=只发券）、券模板选择、备注、启用开关） |
| 后台 | `web-admin/src/apis/campus.ts` | 新增 §100 九组封装与类型：`campusMerchantAfterSalesAssignees` / `campusMerchantAfterSalesAuditLogs` / `campusMerchantAfterSalesAuditExport` / `campusMerchantAfterSalesDutyRoster` / `campusMerchantSetAfterSalesDutyRoster` / `campusMerchantAfterSalesCompensationPlans` / `campusMerchantSaveAfterSalesCompensationPlan` / `campusMerchantDeleteAfterSalesCompensationPlan`（插在 `campusMerchantDispatchExternal` 之前） |
| 后台 | `web-admin/src/pages/campus/merchant-after-sales.vue` | 顶部卡片内新增 `.ops-entry` 三个 chip：「操作审计 / 值班排班 / 补偿挽留」，点击 `uni.navigateTo('/pages/campus/after-sales-ops?tab=...')` |
| 后台 | `web-admin/src/pages.json` | 注册 `pages/campus/after-sales-ops`（`navigationBarTitleText: 售后管理`、`enablePullDownRefresh: true`） |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增命名空间 `campusAfterSalesOps`（中/英各 92 条），覆盖三块功能全部文案（含 7 个动作名、`wdSun..wdSat`、`dutyOvernight`、`dutyNoStaff`、方案表单与删除确认） |
| 截图 | `docs/screenshots/waimai/p100-after-sales-ops/` | 7 张：售后申请页三入口 / 审计今日 / 审计自定义区间 / 值班周视图 / 新增值班 sheet / 补偿方案列表 / 编辑方案 sheet |
| 脚本 | `web-admin/scripts/shots-p100-after-sales-ops.cjs` | mock `campusMerchantAfterSalesAssignees`（张伟、李娜）、`campusMerchantAfterSalesDutyRoster`（含两条跨零点班次）、`campusMerchantAfterSalesCompensationPlans`（3 条）、`campusMerchantAfterSalesAuditLogs`（5 条）、券模板列表 |

### 100.2 契约

```graphql
query { campusMerchantAfterSalesAssignees { id name identifier } }            # 仅本店渠道角色管理员

query ($from: String, $to: String, $action: String, $actorUserId: ID, $take: Int, $skip: Int) {
  campusMerchantAfterSalesAuditLogs(from: $from, to: $to, action: $action, actorUserId: $actorUserId, take: $take, skip: $skip) {
    id requestId orderCode action actorUserId actorName detail createdAt
  }
}
query ($from: String, $to: String, $action: String, $actorUserId: ID) {
  campusMerchantAfterSalesAuditExport(from: $from, to: $to, action: $action, actorUserId: $actorUserId)   # 返回 CSV 文本
}

query { campusMerchantAfterSalesDutyRoster { weekday startMin endMin userId userName } }
mutation ($entries: String!) { campusMerchantSetAfterSalesDutyRoster(entries: $entries) { weekday startMin endMin userId userName } }

query { campusMerchantAfterSalesCompensationPlans { id name refundAmount couponTemplateId note enabled createdAt } }
mutation ($id: ID, $name: String!, $refundAmount: Int!, $couponTemplateId: String, $note: String, $enabled: Boolean) {
  campusMerchantSaveAfterSalesCompensationPlan(id: $id, name: $name, refundAmount: $refundAmount,
    couponTemplateId: $couponTemplateId, note: $note, enabled: $enabled) { id name refundAmount couponTemplateId note enabled createdAt }
}
mutation ($id: ID!) { campusMerchantDeleteAfterSalesCompensationPlan(id: $id) { ...同上字段 } }
```

**关键边界：`from` / `to` 是 `YYYY-MM-DD` 的“校园日”（UTC+8），不是 ISO 瞬时。** 后端 `campusDayStart` / `campusDayEnd` 会把 `to` 解释为“含当日全天”（`< 次日 0 点`）。首版前端误传 ISO 瞬时，生产直接报 `USER_INPUT_ERROR: 开始日期格式无效，应为 YYYY-MM-DD` 且查询返回 null；改为直接传日期键后恢复正常。前端「今日」传 `today=today`，「近 7 日」传 `campusDateKey(-6)~today`。

`campusMerchantSetAfterSalesDutyRoster` 的 `entries` 是 **JSON 字符串**（前端在 API 层 `JSON.stringify`），保存语义为**整表替换**：传 `[]` 即清空。`weekday` 0=周日…6=周六，`startMin/endMin` 为当日分钟数，跨零点用 `endMin >= 1440`（如 18:00~次日 03:00 → 1080~1620）。

### 100.3 校验与边界

- **审计分页**：后端不返回总数，前端以“返回满 50 条则视为可能还有更多”推断 `hasMore`，`skip` 取当前已加载条数。
- **审计区间**：选「自定义」时起止日期都为空则不请求（提示「请先选择起止日期」）；改开始日期后若结束日期早于它，自动清空结束日期。
- **处理人为空**：`campusMerchantAfterSalesAssignees` 生产当前返回 `[]`（本店未分配渠道管理员）。此时值班 Tab 顶部显示橙色提示「本店暂无可排班的渠道管理员……」，提交新增值班时拦截并提示「请选择值班人员」；审计的处理人下拉只保留「全部处理人」。
- **跨零点**：新增值班时 `end < start` 自动 `endMin += 1440` 并提示「结束时间早于开始时间，已按跨零点（次日）处理」；`end === start` 直接拒绝（「起止时间不能相同」）。
- **整体覆盖**：值班保存把本地编辑后的整表一次性提交，不做增量 diff——避免“删了又加”出现重复班次。
- **CSV 导出**：直接落后端返回的文本；缺 BOM 时前端补 `\uFEFF`（Excel 打开中文不乱码），文件名 `after-sales-audit-YYYYMMDD.csv`；筛选结果为空时提示「当前筛选条件下暂无可导出的记录」，不生成空文件。
- **金额分↔元**：方案表单按“元”输入，提交前 `yuanToFen` 转换并校验两位小数；留空按 0 处理（= 只发券不退款），券模板也留空则显示「不发券」。

### 100.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 售后申请页顶部出现「操作审计 / 值班排班 / 补偿挽留」三个 chip |
| 截图 02 | 审计默认「今日」：列表 5 条，每条含售后单号、订单号、动作、处理人、详情、时间 |
| 截图 03 | 切「自定义」：起止日期行出现且默认填今日，动作/处理人下拉可用 |
| 截图 04 | 值班周视图：周一 `09:00~15:00 张伟` + `18:00~次日 03:00 李娜`，周五 `17:00~次日 02:00 张伟`，其余显示「未排班」 |
| 截图 05 | 点「新增值班」：sheet 含星期、起止时间、值班人员选择器与「添加」按钮 |
| 截图 06 | 补偿方案 3 条：宫保鸡丁套餐 ¥5 + 券、出餐超时 10 元券（只发券）、停用的「差评安抚」 |
| 截图 07 | 点「编辑」：sheet 回填名称/金额/券模板/备注/启用开关 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |
| 首次失败 | 脚本第 06 步用 `.mask` 点击关闭值班 sheet，被 `uni-page-head` 拦截 pointer events → 改点 `.sheet__x`（✕）后通过 |

### 100.5 生产探针（admin-api，`canteen-a` 渠道）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesAuditLogs(from:"2026-10-24", to:"2026-10-31")` | `[]`，无错误（该渠道尚无售后操作记录）PASS |
| 2 | 同上 + `action:"approve", actorUserId:"1"` | `[]`，无错误 PASS |
| 3 | `campusMerchantAfterSalesAuditExport(from:"2026-10-24", to:"2026-10-31")` | 返回 CSV 文本，表头 `售后单号,订单号,操作,处理人,处理人ID,详情,操作时间`（带 BOM）PASS |
| 4 | 传 ISO 瞬时（旧实现） | `USER_INPUT_ERROR: 开始日期格式无效，应为 YYYY-MM-DD`，返回 null → 已按 100.2 修正为日期键 |
| 5 | `campusMerchantAfterSalesAssignees` / `DutyRoster` / `CompensationPlans` | 均 `[]`（本店未分配管理员、未排班、未建方案）PASS |
| 6 | `campusMerchantSetAfterSalesDutyRoster(entries:"[{userId:\"1\",weekday:1,startMin:600,endMin:840}]")` 写入后复核 | 写入成功、读取回显一致；随后用 `entries:"[]"` 重置，复核已回到 `[]`（**探针写入了生产数据，已清理**） |

### 100.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无新增（§100 resolver / service 随 vendure `4d73ead43`、`efaf872aa` 已在线上） | 探针 1~5 全部命中，见 100.5 |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs`（脚本内部先构建） | `[deploy] 产物校验通过: 61929 KB` → nginx `test is successful` + reload → `deploy done`；线上 `https://e.joho.cn/guanli/` 200，`assets/pages-campus-after-sales-ops.C25BPx73.js` 200 / 21157 B、`assets/after-sales-ops-BEGlCMsQ.css` 200 / 8154 B |

操作入口：商家工作台 →「售后申请」→ 顶部「操作审计 / 值班排班 / 补偿挽留」→ 对应 Tab 筛选、导出、排班或维护方案。

## §101 售后工作台：待办概览 / 批量处置 / 一键补偿（已上线）

§100 解决的是“看得见历史动作”和“排班 / 方案配置”，但商家每天的处置动作仍是逐单点开：不知道今天有多少单待同意、哪些已经超时、退款失败要不要补跑；同意 / 驳回也只能一单一单来。本段新增 `after-sales-workbench.vue`，在「售后申请」页顶部加「售后工作台」入口，把线上已有的 `campusMerchantAfterSalesWorkbench` / `AfterSalesTasks` / 批量 / 补偿发放接口接出来，做成“概览 → 筛选 → 勾选 → 批量处置 → 一键补偿”的闭环。

### 101.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/after-sales-workbench.vue` | 新页，四块：① 待办概览 9 个计数（待同意 / 待收货 / 退款失败 / 待回复 / 已超时 / 即将超时 / 回访到期 / SLA 暂停 / 已升级），点前 7 个即按对应状态或 `attention` 筛选，卡底显示「最久待处理 N 小时」；② 自动化任务（待执行 / 执行失败 / 全部 分段，`take` 10 ↔ 50，「立即执行」补跑失败任务，失败行展示 `第 n/m 次失败原因`）；③ 售后单列表（关键词搜索订单号 / 顾客 / 手机号、状态分段带计数、关注项 chip 可清除、全选本页、分页 `take:20`）；④ 固定底栏：批量同意 / 批量驳回 / 批量关闭 / 批量指派 / 补偿挽留 |
| 后台 | `web-admin/src/apis/campus.ts` | 新增 9 个封装与类型：`campusMerchantAfterSalesWorkbench` / `campusMerchantAfterSalesTasks` / `campusMerchantAfterSalesRunTask` / `campusMerchantAfterSalesWorkItems`（`campusMerchantAfterSales` + `attention`）/ `campusMerchantAfterSalesBatchApprove` / `BatchReject` / `BatchClose` / `BatchAssign` / `campusMerchantAfterSalesApplyCompensation`（插在 `campusMerchantDispatchExternal` 之前） |
| 后台 | `web-admin/src/pages/campus/merchant-after-sales.vue` | 顶部新增 `.wb-entry` 入口条「售后工作台 ›」，`uni.navigateTo('/pages/campus/after-sales-workbench')` |
| 后台 | `web-admin/src/pages.json` | 注册 `pages/campus/after-sales-workbench`（`navigationBarTitleText: 售后工作台`、`enablePullDownRefresh: true`） |
| 后台 | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增命名空间 `campusAfterSalesWorkbench`（中 / 英各约 80 条），覆盖概览 chip、任务状态与类型、9 个售后状态、批量与补偿全部提示 |
| 截图 | `docs/screenshots/waimai/p101-after-sales-workbench/` | 7 张：概览 / 批量操作条 / 批量驳回 sheet / 批量指派 sheet / 补偿方案 sheet / 退款失败筛选 / 任务全部 |
| 脚本 | `web-admin/scripts/shots-p101-after-sales-workbench.cjs` | mock `Workbench`（9 项计数 + 最久 10 小时）、`Tasks`（待执行 / 失败 / 已执行 4 条）、`Assignees`（张伟、李娜）、`CompensationPlans`（3 条含停用）、`campusMerchantAfterSales`（6 条含超时 / 风险 / 升级 / 待复核 / SLA 暂停 / 换货物流） |

### 101.2 契约

```graphql
query { campusMerchantAfterSalesWorkbench {
  toApprove toReceive refundFailed pendingReply overdue dueSoon slaPaused followUpDue escalated
  oldestPendingAt oldestPendingHours } }

query ($status: String, $skip: Int, $take: Int) {
  campusMerchantAfterSalesTasks(status: $status, skip: $skip, take: $take) {
    items { id type requestId status dueAt attempt maxAttempt retryCount lastError executedAt } total } }
mutation ($id: ID!) { campusMerchantAfterSalesRunTask(id: $id) { ...同上字段 } }

query ($state: String, $attention: String, $keyword: String, $skip: Int, $take: Int, ...) {
  campusMerchantAfterSales(state: $state, attention: $attention, keyword: $keyword, skip: $skip, take: $take) {
    items { id orderCode state type refundAmount customerName createdAt overdue unread dueSoon tags
            assigneeUserId assigneeName riskReason slaPaused slaPausedReason escalated
            refundReviewPending exchangeTrackingNo exchangeCarrier }
    pendingCount total stateCounts { state count } skip take } }

mutation ($ids: [ID!]!) { campusMerchantAfterSalesBatchApprove(ids: $ids) { id success state message } }
mutation ($ids: [ID!]!, $reason: String!) { campusMerchantAfterSalesBatchReject(ids: $ids, reason: $reason) { id success state message } }
mutation ($ids: [ID!]!, $reason: String!) { campusMerchantAfterSalesBatchClose(ids: $ids, reason: $reason) { id success state message } }
mutation ($ids: [ID!]!, $userId: ID) { campusMerchantAfterSalesBatchAssign(ids: $ids, userId: $userId) { id success state message } }

mutation ($id: ID!, $planId: ID!) {
  campusMerchantAfterSalesApplyCompensation(id: $id, planId: $planId) { ok refundAmount couponGranted message } }
```

**批量接口返回的是逐条回执，不是整批成败。** 单条失败（已处置 / 状态不允许 / 大额转复核）只体现在该条的 `success:false` + `message`，不影响其余单据；前端按 `成功 x 单，失败 y 单` 汇总，全失败时直接显示首条 `message`。

**`attention` 四个取值**：`overdue`（已超时）/ `dueSoon`（即将超时）/ `unread`（有新留言待回复）/ `followUp`（回访到期），与概览 chip 一一对应；`slaPaused` / `escalated` 只做展示（后端没有对应的 attention 值），不参与筛选。

**`ApplyCompensation` 的服务端语义**：只接受 `Pending` 态单据与已启用方案；先按方案的 `refundAmount` 退款，退款失败则降级为“只发券”，随后关闭售后单、通知顾客并写审计。返回 `ok / refundAmount（分）/ couponGranted / message`，`couponGranted=false` 时用 `message` 向商家说明降级原因。

### 101.3 校验与边界

- **单批上限 50**：前端选到第 51 条即提示「单批最多选择 50 单」，`全选本页` 也只取前 50 条；后端 `normalizeBatchIds` 同样做去重、正整数、≤50 校验，超限直接报错。
- **驳回 / 关闭必须填原因**：sheet 内 textarea `maxlength=200`，`trim()` 后为空不提交（提示「请填写原因」）；整批共用同一原因。
- **补偿挽留只能单选**：多选时点「补偿挽留」直接提示「补偿挽留仅支持单张售后单」，不打开 sheet；停用方案可点但提示「该方案已停用」，不会选中。
- **确认弹窗带金额**：`compConfirmBody` 为「将退款 ¥x.xx 并关闭售后单，确认继续？」，金额来自方案 `refundAmount` 的 分→元 转换（`fenToYuanFixed`），避免商家误按大额方案。
- **任务可执行范围**：仅 `pending` / `failed` 显示「立即执行」；`executed` / `cancelled` 只读，后端也会拒绝重复执行。执行后本地刷新任务列表与概览计数。
- **分页与计数**：列表 `take:20` 游标式「加载更多」，`hasMore = 已加载 < total`；状态分段上的数字取自 `stateCounts`，「全部」为各状态合计，与概览计数口径一致。
- **筛选叠加**：点概览 chip 会重置状态与关注项后重新拉取；关键词搜索可与状态、关注项叠加；清除关注项 chip 只清 `attention`，保留状态筛选。
- **权限**：页面入口 `usePermGuard('CampusMerchant')`，仅商家渠道管理员可见可操作。

### 101.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 概览 9 个计数（6/2/3/4/2/3/2/1/1）+「最久待处理 10 小时，请优先处置」+ 任务卡 2 条待执行 + 售后单「共 6 单」 |
| 截图 02 | 勾选 2 单：行首变选中态，底栏出现「已选 2 单」与 5 个批量按钮 |
| 截图 03 | 批量驳回 sheet：标题「批量驳回」、原因 textarea（回填测试原因）、取消 / 提交 |
| 截图 04 | 批量指派 sheet：「取消指派 / 张伟 zhangwei / 李娜 lina」三项，确认按钮 |
| 截图 05 | 补偿方案 sheet：3 条方案（¥5 + 券 / 仅发券 / ¥15 停用），顶部显示「已选 1 单」，底部提示退款失败会降级只发券 |
| 截图 06 | 切「退款失败」分段：列表只剩 1 条 `A2400003`（¥2.00，退款失败 + 新留言 + 风险） |
| 截图 07 | 任务切「全部」：4 条（待执行 2、失败 1 带「第 2/3 次失败原因：微信退款通道返回 SYSTEMERROR」、已执行 1） |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出（mock 环境） |
| 首次失败 | ① 第 03 步 `fill('.area')` 命中 `uni-textarea` 外层节点报 `Element is not an <input>` → 改为 `.area textarea`；② 第 07 步原用「显示全部」只扩大 `take` 不切状态，仍只 2 条 → 改为点任务「全部」分段，复测通过 |

### 101.5 生产探针（admin-api，`canteen-a` 渠道，只读）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesWorkbench` | `toApprove:2, toReceive:0, refundFailed:0, pendingReply:0, overdue:1, dueSoon:0, slaPaused:0, followUpDue:0, escalated:0, oldestPendingHours:582` PASS |
| 2 | `campusMerchantAfterSalesTasks(status:"pending", take:5)` | `items: [], total: 0`（该渠道当日无待执行任务）PASS |
| 3 | 同上 `status:"failed"` | `items: [], total: 0` PASS |
| 4 | `campusMerchantAfterSales(attention:"overdue", take:5)` | 命中 1 条（`id:25`，`state:Pending`，`overdue:true`），`pendingCount:2`、`stateCounts: Appealed 1 / Pending 1 / Refunded 1` PASS |
| 5 | `attention:"dueSoon" / "unread" / "followUp"` | 均 `items:[]`、无错误，筛选链路生效 PASS |
| 6 | 8 个字段存在性（introspection） | `Workbench` / `Tasks` 在 Query，`BatchApprove / BatchReject / BatchClose / BatchAssign / ApplyCompensation / RunTask` 在 Mutation PASS（**只做 introspection，未调用任何写接口**） |

### 101.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无新增（工作台 / 任务 / 批量 / 补偿发放随 vendure 既有版本已在线上） | 探针 1~6 全部命中，见 101.5 |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs`（脚本内部先构建） | `[deploy] 产物校验通过: 61970 KB` → nginx `test is successful` + reload → `deploy done`；线上 `https://e.joho.cn/guanli/` 200，`assets/pages-campus-after-sales-workbench.USLz48W-.js` 200 / 21059 B、`assets/after-sales-workbench-R70qd06W.css` 200 / 9802 B |

操作入口：商家工作台 →「售后申请」→ 顶部「售后工作台 ›」→ 点概览计数筛选、勾选单据后走底部批量处置，或单选一张后「补偿挽留」按方案一键退款 / 发券并关闭。

## §102 售后处置详情：单动作闭环 + 标签 / 回复模板配置（已上线）

§101 解决了“批量处置”，但真正难处理的单子仍缺一个处置台：改派谁、SLA 要不要暂停、要不要升级仲裁、退款失败怎么补、退货物流回传了没、大额退款谁来复核——这些动作原来散落在列表弹层里或根本没有入口。本段新增 `after-sales-detail.vue` 作为单张售后单的处置工作台，把 P1 审计里缺的 9 类动作（指派 / 转交 / 升级仲裁 / SLA 暂停恢复 / 回访 / 线下退款 / 退款复核 / 退货换货 / 关闭）全部接出来；同时把「售后标签」「回复模板」两个配置并入运营页，让商家能自建分类与话术。

### 102.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 | `web-admin/src/pages/campus/after-sales-detail.vue` | 新页，11 张卡：① 概览（状态 pills / 顾客 / 地址 / 订单总额 / 实际退款 / SLA 剩余 / 原因 / 凭证图 / 超时提示）② 售后商品 ③ 售后标签（点「编辑标签」多选）④ 处置动作（按状态动态生成）⑤ 退款复核（`.attention` 高亮）⑥ 退货物流（仅非 `refund_only`，运单号 + 轨迹 + 收货地址）⑦ SLA 暂停记录 + 升级仲裁 ⑧ 回访记录 ⑨ 内部备注 ⑩ 协商沟通（快捷模板 + 发送）⑪ 状态时间线 + 指派留痕 |
| 后台 | `web-admin/src/pages/campus/after-sales-ops.vue` | 新增「售后标签」「回复模板」两个 tab：标签卡（`# 名称` + `已用 n 单` + 编辑 / 删除）；模板卡（内容 + 分类 / 关键词标签 + 排序），模板带本地搜索 + 分类筛选 |
| 后台 | `web-admin/src/pages/campus/after-sales-workbench.vue` | 列表行尾新增「处置 ›」入口，跳转 `after-sales-detail?id=` |
| 后台 | `web-admin/src/pages.json` | 注册 `pages/campus/after-sales-detail`（`navigationBarTitleText: 售后处置`、`enablePullDownRefresh: true`） |
| 后台 | `web-admin/src/apis/campus.ts` | §102 段新增类型（`MerchantAfterSalesDisposalDetail` / `Tag` / `ReplyTemplate` / `Note` / `OfflineRefundResult` / `ReturnLogistics` / `RefundReview` / `Rules` / `Address` / `Assignee`）与约 24 个封装（详见 102.2） |
| i18n | `web-admin/src/locale/zh-Hans.json` / `en.json` | 新增命名空间 `campusAfterSalesDetail`（207 条）；`campusAfterSalesOps` 补 2 个 tab 与 44 条标签 / 模板文案；`campusAfterSalesWorkbench` 补 `dispose` |
| 截图 | `docs/screenshots/waimai/p102-after-sales-detail/` | 11 张：概览 / 动作区 / 退款复核 / 指派 sheet / 线下退款 sheet / 标签 sheet / 退货单物流 / 运营页标签 tab / 模板 tab / 模板编辑 sheet / 工作台处置入口 |
| 脚本 | `web-admin/scripts/shots-p102-after-sales-detail.cjs` | mock 处置详情 `D801`（Pending / 仅退款 / 超时 / 待复核）与 `D805`（Received / 退货退款 / SLA 暂停）、标签 / 模板 / 备注 / 退款复核 / 退货物流 / 收货地址 / 规则 / 指派对象；凭证图用 data-URI SVG，离线可跑 |

### 102.2 契约

```graphql
query ($id: ID!) { campusMerchantAfterSalesDetail(id: $id) {
  request { id orderId orderCode state type reason description refundAmount rejectReason
            evidenceImages messageCount customerName createdAt refundedAt overdue unread
            dueSoon tags assigneeUserId assigneeName riskReason slaPaused slaPausedReason
            escalated refundReviewPending exchangeTrackingNo exchangeCarrier }
  messages { id senderType senderName content images createdAt } messageTotal
  stateHistory { fromState toState createdAt operatorUserId operatorName }
  refundError actualRefundAmount timeoutHours customerPhone
  shippingAddress { fullName phoneNumber address }
  orderItems { name quantity unitPrice } orderTotal
  assignHistory { fromUserId fromName toUserId toName reason createdAt }
  followUps { id method result note nextAt operatorName createdAt }
  slaPauses { id reason pausedAt resumedAt pausedMs }
  escalations { id requestId reason priority status createdBy creatorName createdAt resolvedAt resolution }
} }

# 标签
query { campusMerchantAfterSalesTags { id name usedCount } }
mutation campusMerchantSaveAfterSalesTag(id, name) { id name usedCount }
mutation campusMerchantDeleteAfterSalesTag(id)
mutation campusMerchantSetAfterSalesTags(id, tagIds)   # 全量覆盖该单标签

# 回复模板
query ($category: String, $keyword: String) {
  campusMerchantAfterSalesReplyTemplates(category: $category, keyword: $keyword) {
    id content createdAt category keywords sortOrder } }
mutation campusMerchantSaveAfterSalesReplyTemplate(id, content, category, keywords, sortOrder)
mutation campusMerchantDeleteAfterSalesReplyTemplate(id)

# 处置动作（均为 mutation，入参见 src/apis/campus.ts §102 段）
campusMerchantAfterSalesAddFollowUp / ReviewFollowUp           # 回访登记 / 标记完成
campusMerchantAfterSalesOfflineRefund                          # 线下退款：金额(分) + 方式 + 备注
campusMerchantAfterSalesConfirmReturn / ExchangeShip           # 确认收货 / 换货发货
campusMerchantAfterSalesRecordReturnLogistics                  # 回传运单 + 轨迹
campusMerchantAfterSalesResolveRefundReview(id, approve, note) # 退款复核通过 / 驳回
campusMerchantAfterSalesEscalate / EscalationResolve           # 升级仲裁 / 填写结论
campusMerchantAfterSalesPauseSla / ResumeSla                   # SLA 暂停 / 恢复
campusMerchantAfterSalesRemind                                 # 催办提醒
campusMerchantAfterSalesAssign / Transfer                      # 指派 / 转交
campusMerchantAfterSalesCloseOne                               # 关闭售后（复用 Close）
campusMerchantAfterSalesAddNote / DeleteNote                   # 内部备注

# 只读辅助
query { campusMerchantAfterSalesAssignees { id name identifier } }
query campusMerchantAfterSalesNotes(id)
query campusMerchantAfterSalesReturnLogistics(id)
query { campusMerchantAfterSalesRefundReviews(status) { ... } }   # status 枚举：Pending / Approved / Rejected
query { campusMerchantAfterSalesRules { timeoutHours autoApproveHours refundAutoRetry
        firstResponseTargetHours resolveTargetHours dueSoonHours refundReviewThreshold } }
query { campusMerchantAfterSalesReturnAddress }                   # 后端为 JSON 字符串（空串=未配置）
```

**动作矩阵**（`state` + 标志位计算，17 种动作都收敛到同一个底部 sheet）：`Pending/Appealed` → 同意 / 驳回；`Received` → 确认收货 / 换货发货；`RefundFailed` → 重试退款；`Pending/Received/RefundFailed` → 线下退款 / 催办 / 关闭；`slaPaused` 时只给「恢复 SLA」，否则给「暂停 SLA」；未 `escalated` 才给「升级仲裁」；指派 / 转交对所有状态开放。

**`campusMerchantAfterSalesRefundReviews` 的 `status` 必须是 PascalCase**（`Pending` / `Approved` / `Rejected`），传小写会被后端直接拒（见 102.5 探针 5）。

**`campusMerchantAfterSalesReturnAddress` 是标量而非对象**：后端返回 JSON 字符串（未配置时为空串），前端 `campus.ts` 负责解析成 `{ fullName, phoneNumber, address }`；解析失败时把整串当 `address` 展示，空串则隐藏「退回地址」区块。

### 102.3 校验与边界

- **动作按状态收敛**：不在当前状态的动作不渲染，避免“点了才知道不允许”；后端仍会二次校验状态，失败时用 `graphQlErrorMsg` 弹出。
- **标签全量覆盖**：标签 sheet 多选后一次 `SetAfterSalesTags`，提交的是完整 `tagIds` 数组（不是增量），清空全部标签即传空数组。
- **模板搜索在前端**：`tplFiltered` 对已拉取列表做内容 / 关键词匹配，分类 picker 叠加过滤；编辑 sheet `maxlength=300`，`sortOrder` 仅接受整数。
- **线下退款金额**：输入元、提交转分（`yuanToFen`），上限为当前可退金额；确认弹层文案带实际金额，避免误操作。
- **退款复核**：仅 `status=Pending` 且 `requestId` 命中当前单才展示该卡；`selfRequested` 时提示“本人发起需他人复核”；通过即继续退款，驳回写 `note`。
- **SLA 与升级互斥展示**：`slaPaused=true` 时动作区只出现「恢复 SLA」；`escalated=true` 后不再出现「升级仲裁」，历史记录仍完整展示（优先级 / 状态 / 结论）。
- **退货物流入口**：`type === 'refund_only'` 时整张卡不渲染；`Received` 态才出现「确认收货 / 换货发货」。
- **空态与失败**：`id` 缺失直接提示并给「重试」；`reload` 失败展示错误文案 + 重试按钮；侧表（备注 / 复核 / 物流 / 地址 / 规则）单个失败静默降级为空，不影响主详情。
- **金额与时间口径**：全链路后端分、前端元（`fenToYuanFixed` / `yuanToFen`），时间统一 `formatDateTime`。
- **权限**：`usePermGuard('CampusMerchant')`，仅商家渠道管理员可见可操作。

### 102.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.`（Sass legacy-js-api 弃用告警可忽略） |
| 截图 01 | 概览：`A2400001` ¥32.50 + 7 个 pill（待处理 / 仅退款 / 已超时 / 新留言 / 待退款复核 / 配送超时 / 老客）+ 顾客 / 地址 / 订单总额 / 实际退款 / SLA 剩余 16 小时 + 2 张凭证缩略图 + 超时提示；商品 3 项；标签 2 个 |
| 截图 02 | 动作区 11 个按钮（同意退款 / 驳回 / 线下退款 / 催办提醒 / 暂停 SLA / 升级仲裁 / 指派处理人 / 转交他人 / 关闭售后 / 复核通过 / 复核驳回），处理人「张伟」 |
| 截图 03 | 退款复核卡 ¥32.50，申请人张伟，复核通过 / 复核驳回 |
| 截图 04 | 指派 sheet：取消指派 / 张伟 / 李娜 / 王强 四项 |
| 截图 05 | 线下退款 sheet：金额回填 20.00，方式选择器 |
| 截图 06 | 标签 sheet：配送超时 / 少送漏送 / 异物投诉 / 老客，已选项高亮 |
| 截图 07 | `id=805` 退货单：pills 待收货 / 退货退款 / 即将超时 / SLA 暂停 / 少送漏送；动作为确认收货 / 换货发货 / 恢复 SLA；退货物流卡运单号 `SF1234567890 · 顺丰` + 3 条轨迹 + 退回地址 |
| 截图 08/09/10 | 运营页「售后标签」4 个、模板 3 条；模板编辑 sheet「新增回复模板」 |
| 截图 11 | 工作台 2 行均出现「处置 ›」入口，点击跳转详情成功（`goCount:2, goOk:true`） |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 首次失败 | ① 标签卡按钮绑定了未定义的 `openTags`（sheet 打不开，`.sheet .opt` 超时）→ 改为 `openSheet('tags')`；② 第 07 步同页仅改 hash 不触发 `onLoad`，仍显示 801 数据 → 改为 `?r=805#/...` 强制重载；③ 01/02 截图完全相同（`scrollIntoViewIfNeeded` 判定“已可见”不滚动）→ 改 `scrollIntoView({block:'center'})` |

### 102.5 生产探针（admin-api，`canteen-a` 渠道，只读）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesTags` | `[]`（标签表为空，属未配置正常态）PASS |
| 2 | `campusMerchantAfterSalesReplyTemplates` | `[]`（模板表为空，属未配置正常态）PASS |
| 3 | `campusMerchantAfterSalesRules` | `timeoutHours:48, autoApproveHours:0, refundAutoRetry:1, firstResponseTargetHours:0, resolveTargetHours:0, dueSoonHours:12, refundReviewThreshold:0` PASS |
| 4 | `campusMerchantAfterSalesReturnAddress` | 首次按对象选择集查询报 `Field must not have a selection since type "String!"` → 确认后端为标量；改裸查询返回 `""`。**已按 JSON 字符串改造前端解析** |
| 5 | `campusMerchantAfterSalesRefundReviews(status:"pending")` | 报 `复核状态只能是 Pending / Approved / Rejected` → 改传 `Pending` 后返回 `[]` PASS（**前端已同步改为 PascalCase**） |
| 6 | `campusMerchantAfterSalesDetail(id)` | 复核队列为空，取不到 `requestId`，跳过（未构造假 id 触发副作用） |

### 102.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无新增（§102 依赖的查询 / 变更随 vendure 既有版本在线） | 探针 1~6 见 102.5，其中 2 项契约差异已在前端适配 |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs`（脚本内部先构建） | `[deploy] 产物校验通过: 62058 KB` → nginx `test is successful` + reload → `deploy done`；线上 `assets/pages-campus-after-sales-detail.B1Cg1378.js` 200 / 41171 B、`assets/after-sales-detail-BtnTCEj0.css` 200 / 9503 B |
| 线上入口 | `https://e.joho.cn/guanli/` 首页 index.html | 入口 chunk 与本地构建一致（200） |

操作入口：商家工作台 →「售后申请」→ 售后工作台或列表行「处置 ›」→ 售后处置详情页（选动作、编辑标签、登记回访 / 备注 / 轨迹、复核退款）；运营页 →「售后标签」「回复模板」两个 tab 维护分类与话术。


## §103 售后运营增强包（已上线）

### 103.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 API | `web-admin/src/apis/campus.ts`（§103 段） | 规则阈值保存、退货收件地址保存、批量备注 / 催办 / 打标、单张 / 批量处理小票、风险标记 / 解除、本店黑名单增删查、顾客售后档案、智能话术推荐、处理人负载、退款流水、退款失败重试排期 |
| 运营页 | `web-admin/src/pages/campus/after-sales-ops.vue` | 新增「售后规则」「顾客黑名单」两个 tab：7 项 SLA 阈值表单 + 退货收件地址表单（保存 / 清除）；黑名单列表 + 顾客售后档案 sheet（单数 / 已退款 / 累计金额 / 最近售后） |
| 工作台 | `web-admin/src/pages/campus/after-sales-workbench.vue` | 「处理人负载」卡（未完结 / 超时 / 临期）；批量工具栏「更多」二级 sheet：批量备注 / 批量催办 / 批量打标 / 打印处理小票 |
| 详情页 | `web-admin/src/pages/campus/after-sales-detail.vue` | 动作区新增「打印处理小票」「智能话术」「标记风险」；小票纯文本 sheet、话术推荐 sheet（点击填入回复框） |
| i18n | `web-admin/src/locale/{zh-Hans,en}.json` | `campusAfterSalesOps` 新增 tabRules / rules / addr / bl / prof 键；`campusAfterSalesWorkbench` 新增 batchMore；`campusAfterSalesDetail` 新增 slip / suggest / risk 键 |
| 截图脚本 | `web-admin/scripts/shots-p103-after-sales-ops-plus.cjs` | 13 张（390×844 dpr2，本地静态服务器 + playwright mock admin-api） |
| 截图 | `docs/screenshots/waimai/p103-after-sales-ops-plus/` | 01~13（规则 / 保存 / 退货地址 / 黑名单 / 顾客档案 / 负载 / 批量工具 4 张 / 详情动作 / 小票 / 话术） |

### 103.2 契约

```graphql
# 规则阈值（0 = 关闭该项自动化）
mutation ($timeoutHours: Int, $autoApproveHours: Int, $refundAutoRetry: Int,
          $firstResponseTargetHours: Int, $resolveTargetHours: Int, $dueSoonHours: Int, $refundReviewThreshold: Int) {
  campusMerchantUpdateAfterSalesRules(...) {
    timeoutHours autoApproveHours refundAutoRetry firstResponseTargetHours
    resolveTargetHours dueSoonHours refundReviewThreshold
  }
}
# 退货收件地址：入参为 JSON 字符串（空串 = 清除）
mutation ($address: String!) { campusMerchantUpdateAfterSalesReturnAddress(address: $address) }
query { campusMerchantAfterSalesReturnAddress }   # 标量 JSON 字符串，未配置为 ""

# 批量工具：逐单返回成功/失败
mutation campusMerchantAfterSalesBatchNote(ids: [ID!]!, content: String!)   { id success state message }
mutation campusMerchantAfterSalesBatchRemind(ids: [ID!]!, note: String)     { id success state message }
mutation campusMerchantAfterSalesBatchTag(ids: [ID!]!, tagIds: [ID!]!)      { id success state message }

# 小票（纯文本，批量按入参顺序返回）
query campusMerchantAfterSalesPrintSlip(id: ID!)
query campusMerchantAfterSalesPrintSlips(ids: [ID!]!)

# 风控
mutation campusMerchantAfterSalesRiskFlag(id: ID!, reason: String)   # 空原因用后端默认文案
mutation campusMerchantAfterSalesRiskClear(id: ID!)

# 本店顾客黑名单
mutation campusMerchantBlacklistAfterSalesCustomer(customerId: ID!, reason: String)
mutation campusMerchantUnblacklistAfterSalesCustomer(customerId: ID!)
query campusMerchantAfterSalesBlacklist(skip: Int, take: Int) {
  id customerId customerName phone reason createdBy createdAt
}
query campusMerchantAfterSalesCustomerProfile(customerId: ID!) {
  customerId name phone blacklisted requestCount refundedCount refundAmount
  firstAt lastAt recent { id orderCode type state amount createdAt }
}

# 智能话术 / 负载 / 退款流水 / 重试排期
query campusMerchantAfterSalesSuggestedReplies(id: ID!) { id content score }
query campusMerchantAfterSalesAssigneeLoad { assigneeUserId assigneeName openCount overdueCount dueSoonCount }
query campusMerchantAfterSalesRefunds(from: String, to: String, skip: Int, take: Int) {
  items { id orderCode type reason amount refundedAt refundTransactionId } total
}
mutation campusMerchantAfterSalesScheduleRefundRetry(id: ID!) {
  id type requestId status dueAt attempt maxAttempt retryCount lastError executedAt
}
```

**金额口径**：`refundReviewThreshold` 后端为「分」，表单展示与输入为「元」（`fenToYuan` / `yuanToFen`）；规则其余阈值均为整数小时 / 次数，`0` 表示关闭。

**`campusMerchantAfterSalesAuditLogs` 返回的是行数组**（`[CampusMerchantAfterSalesAuditRow]`），不是 `{ items, total }` 分页对象；前端按数组消费（探针 6 已确认）。

**`campusMerchantAfterSalesBlacklist` 的 `customerId` 可为 `null`**（仅手机号维度拉黑，如批量导入数据），此时列表页隐藏「查看档案 / 解除」入口。

### 103.3 校验与边界

- **规则表单**：7 项全部 `type="number"`，保存时仅提交有值项；后端二次校验，失败用 `graphQlErrorMsg` 弹 toast。
- **退货地址**：必填「详细地址」，前端 `JSON.stringify({ fullName, phoneNumber, address })` 提交；「清除地址」提交空串，C 端随即隐藏退货地址区块。
- **批量工具**：一次最多对已勾选单批量执行；结果逐单返回 `success / message`，部分失败时 toast 汇总成功数，不中断。
- **批量打标是整体替换**：提交完整 `tagIds`（与单张详情页标签语义一致），不是追加。
- **小票**：后端返回纯文本凭证，前端原样渲染在等宽 `white-space: pre` 的 sheet 内，不解析样式。
- **风险标记**：`reason` 留空用后端默认文案；解除不带原因；标记后列表与详情展示「风险」标识，便于优先复核。
- **顾客档案**只读聚合（售后单数 / 已退款单 / 累计退款 / 最近售后），不做写操作；拉黑与解除从档案或黑名单行发起。
- **负载统计**仅覆盖未完结（`openCount`）、超时（`overdueCount`）、临期（`dueSoonCount`），含「未指派」一行。
- **权限**：全部页面 `usePermGuard('CampusMerchant')`。

### 103.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.`（仅 Sass legacy-js-api 弃用告警） |
| 截图 01/02 | 规则 tab：7 项阈值回填 `48/0/1/4/24/12/0`，改「处理时限」为 24 后保存成功并保持新值 |
| 截图 03 | 退货地址卡：收货人「张伟」、电话 `13800001111`、详细地址「第一食堂 1 号档口 · 退货暂存柜」正确回填 |
| 截图 04/05 | 黑名单 2 条（王同学 / 赵同学）；点「查看档案」打开「顾客售后档案」：5 售后单 / 4 已退款 / ¥86.00 累计退款 |
| 截图 06 | 工作台「处理人负载」：张伟 未完结 6 / 超时 2 / 临期 1；李娜 3 / 0 / 2 |
| 截图 07~10 | 勾选 2 单 →「更多批量工具」四项（批量备注 / 批量催办 / 批量打标 / 打印处理小票）逐个打开 sheet 正常 |
| 截图 11 | 详情动作区 12 个按钮含「打印处理小票」「智能话术」「标记风险」 |
| 截图 12 | 「处理小票」sheet 正常展示纯文本凭证 |
| 截图 13 | 「智能话术推荐」3 条推荐话术，可按分数排序展示 |
| 页面报错 | 脚本 `pageerror` / `console error` 均无输出 |
| 首次失败 | ① `shots` 脚本 `page.on('pageerror', ...)` 少一个右括号导致 SyntaxError → 补齐；② `.card .ipt` 是 `uni-input` 包装层，`fill()` 报 "Element is not an <input>" → 改 `.fld input` / `.card input`；③ 退货地址三输入框始终为空、且 mock 端 `returnAddress` 仅在详情页被请求 → 定位为 `after-sales-ops.vue` 漏 import `campusMerchantAfterSalesReturnAddress`，`loadAddress()` 静默抛 ReferenceError；补齐 import 后重新构建、重跑截图正常 |

### 103.5 生产探针（admin-api，`canteen-a` 渠道，只读）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesRules` | `timeoutHours:48, autoApproveHours:0, refundAutoRetry:1, firstResponseTargetHours:0, resolveTargetHours:0, dueSoonHours:12, refundReviewThreshold:0` PASS |
| 2 | `campusMerchantAfterSalesReturnAddress` | `""`（未配置，正常态）PASS |
| 3 | `campusMerchantAfterSalesBlacklist(skip:0,take:5)` | 2 条（`customerId:null`、仅手机号 `138****0000/0001`）PASS |
| 4 | `campusMerchantAfterSalesAssigneeLoad` | `未指派 openCount:2 overdueCount:2 dueSoonCount:0` PASS |
| 5 | `campusMerchantAfterSalesRefunds(skip:0,take:3)` | `total:1`（`#26 6F8NEP1E186B236A` refund_only 少送 ¥1.00）PASS |
| 6 | `campusMerchantAfterSalesAuditLogs(skip:0,take:5)` | `[]` PASS；**确认返回行数组而非分页对象** |
| 7 | `campusMerchantAfterSalesTags` / `campusMerchantAfterSalesReplyTemplates` | `[]` / `[]`（未配置正常态）PASS |
| 8 | `campusMerchantAfterSalesStaffStats(from,to)` | **已修复（2026-10-31）**：原报 `could not determine data type of parameter $2`，根因为 `escalatedRows` / `reviewRows` 两条 SQL 沿用 `>= $3 AND < $4` 却只传 3 个参数（`$2` 未被引用 → PG 无法推断类型）；改为 `$2/$3` 后返回 `operatorUserId / operatorName / handled / resolved / firstActionAvgMinutes / resolveAvgMinutes / overdueCount / escalatedCount / resolveRate / reviewCount / reviewAvgScore`，实测 3 行 PASS |

### 103.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | **热修 2026-10-31**：改 `packages/campus-delivery-plugin/src/merchant-admin.service.ts` 两处 SQL 参数位（`$3/$4` → `$2/$3`），`npx tsc -p tsconfig.build.json` 编译，仅覆盖上传 `lib/src/merchant-admin.service.js` → `pm2 restart vendure`（restarts 824，status online，admin-api 200）；修复后 staffStats 实测返回 3 行 | PASS |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs`（脚本内部先构建） | `[deploy] 产物校验通过: 62177 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 chunk | `https://e.joho.cn/guanli/assets/` | `pages-campus-after-sales-ops.Cwu_hajP.js` 200 / 42406 B、`pages-campus-after-sales-workbench.eZYO0HIe.js` 200 / 29391 B、`pages-campus-after-sales-detail.Cs_SC49J.js` 200 / 45064 B、`after-sales-ops-BXfLTzro.css` 200 / 10956 B |

操作入口：商家工作台 →「售后申请」→ 运营页新增「售后规则」「顾客黑名单」两个 tab；售后工作台勾选多单 → 批量栏「更多」→ 批量备注 / 催办 / 打标 / 打印处理小票；售后详情 → 动作区「打印处理小票」「智能话术」「标记风险」。


## §104 售后数据报表与导出（已上线）

### 104.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 API | `web-admin/src/apis/campus.ts`（§104 段） | 当前态势（stats）、区间报表（report，含环比）、原因分布、商品退款排行、评价满意度、高频顾客、员工绩效（staffStats）、退款流水（分页）、CSV 导出（按条件 / 按选中单） |
| 新页 | `web-admin/src/pages/campus/after-sales-analytics.vue` | 统计区间（今日 / 近 7 日 / 近 30 日 / 自定义）→ 当前态势 → 区间概览（含环比）→ 时效（首响 / 完结 / 达标率）→ 按天趋势 → 类型 / 状态分布 → 原因分布 → 商品退款 Top10 → 评价满意度 → 高频顾客 → 员工绩效 → 退款流水分页 → 导出 sheet |
| 注册 | `web-admin/src/pages.json` | `pages/campus/after-sales-analytics`，`enablePullDownRefresh: true` |
| 入口 | `web-admin/src/pages/campus/merchant-after-sales.vue` | 顶部入口胶囊新增「售后分析」（与「售后自动化」并列） |
| i18n | `web-admin/src/locale/{zh-Hans,en}.json` | 新增 `campusAfterSalesAnalytics`（114 键） |
| 截图脚本 | `web-admin/scripts/shots-p104-after-sales-analytics.cjs` | 11 张 |
| 截图 | `docs/screenshots/waimai/p104-after-sales-analytics/` | 01~07 + 08 员工绩效 + 09/09b 退款流水 + 10 导出 sheet + 11 入口 |

### 104.2 契约

```graphql
query campusMerchantAfterSalesStats {
  pending overdue timeoutHours todayHandled todayRefunded todayRefundAmount
  pendingReply dueSoon dueSoonHours
}

query ($from: String!, $to: String!) { campusMerchantAfterSalesReport(from: $from, to: $to) {
  from to total byType { type count } byState { state count } refunded refundAmount overdue
  byDay { date count refunded refundAmount } reasons { reason count } rejectReasons { reason count }
  firstResponseAvgMinutes resolveAvgMinutes firstResponseOnTargetRate resolveOnTargetRate
  firstResponseOverdue resolveOverdue
  previousTotal previousRefunded previousRefundAmount previousOverdue
} }

query ($from: String!, $to: String!) { campusMerchantAfterSalesReasonReport(from: $from, to: $to, limit: Int) {
  reason requestCount refundCount refundAmount share changeRate } }
query ($from: String!, $to: String!) { campusMerchantAfterSalesProductReport(from: $from, to: $to, limit: Int) {
  productId productName requestCount refundCount refundAmount requestRate } }
query ($from: String!, $to: String!) { campusMerchantAfterSalesReviewSummary(from: $from, to: $to) {
  total avgScore lowScoreCount distribution { score count } topTags { tag count } } }
query ($from: String!, $to: String!) { campusMerchantAfterSalesTopCustomers(from: $from, to: $to, limit: Int) {
  customerId name phone count refundAmount blacklisted } }
query ($from: String!, $to: String!) { campusMerchantAfterSalesStaffStats(from: $from, to: $to) {
  operatorUserId operatorName handled resolved firstActionAvgMinutes resolveAvgMinutes
  overdueCount escalatedCount resolveRate reviewCount reviewAvgScore } }

# 导出：kind = requests | refunds | escalations | staff（返回 CSV 文本，含 UTF-8 BOM）
query ($from: String!, $to: String!, $kind: String!, $state: String, $type: String,
       $keyword: String, $assigneeUserId: ID) {
  campusMerchantAfterSalesExport(from: $from, to: $to, kind: $kind,
    state: $state, type: $type, keyword: $keyword, assigneeUserId: $assigneeUserId) }
# 按选中单导出：kind 仅 requests | refunds
query ($ids: [ID!]!, $kind: String!) { campusMerchantAfterSalesExportByIds(ids: $ids, kind: $kind) }
```

**`kind` 取值严格受限**：条件导出 `requests | refunds | escalations | staff`（`staff` = 员工处理绩效，见 §106），按选中单导出 `requests | refunds`（传其它值后端拒绝）。

**员工绩效已接入页面（2026-10-31）**：`campusMerchantAfterSalesStaffStats` 的 SQL 参数位缺陷已于 2026-10-31 热修（详见 103.5 / 103.6），随后新增前端封装 `campusMerchantAfterSalesStaffStats(from, to)` 并在「高频售后顾客」之后渲染「员工处理绩效」卡片，展示 11 字段：处理人（`operatorName`）、处理量（`handled`）、完结数（`resolved`）、完结率（`resolveRate`，后端已是 0~100 整数，前端直接拼 `%`）、首响均时（`firstActionAvgMinutes`）、完结均时（`resolveAvgMinutes`）、在途超时（`overdueCount`）、升级仲裁（`escalatedCount`）、评价数与均分（`reviewCount / reviewAvgScore`）。列表按处理量倒序；完结率 < 60% 标红，超时 > 0 标红、升级 > 0 标橙，无评价显示「暂无评价」。

### 104.3 校验与边界

- **区间口径**：`from/to` 为校园日 `YYYY-MM-DD`，`to` 含当日全天；自定义区间以 `picker mode="date"` 选择，切换区间即整体重查。
- **环比**：`previous*` 字段为上一等长区间，页面用 `(本期 - 上期) / 上期` 计算涨跌，上期为 0 时显示「—」。
- **百分比字段**：`firstResponseOnTargetRate` / `resolveOnTargetRate` / `share` / `requestRate` 后端为百分比数值，前端直接拼 `%`，不再 ×100。
- **退款流水分页**：`skip/take` 增量加载（「加载更多」），到底后按钮变「没有更多」。
- **CSV 导出**：`exportCsv` 返回含 BOM 的文本，前端 `Blob` + `a.download` 落盘；文件名带区间与 kind 中文名。
- **空态**：各卡片独立空态（「暂无数据」），单个查询失败不影响其它卡片。
- **权限**：`usePermGuard('CampusMerchant')`。

### 104.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 概览：区间 today/7d/30d/custom 分段 + 当前态势 KPI + 区间总单量 / 退款 / 超时 + 环比 |
| 截图 02 | 时效：首响均时 / 完结核均时 / 首响达标率 / 完结达标率 / 超时数 |
| 截图 03 / 04 / 05 | 按天趋势、原因分布（含退款占比）、商品退款 Top10 |
| 截图 06 / 07 | 评价满意度（均分 / 低分占比 / 星级分布 / 高频标签）、高频顾客（含是否拉黑） |
| 截图 08 | 员工绩效：4 行（张伟（店长）/ 李静（客服）/ SuperAdmin / 王强（后厨）），处理量、完结率（82% / 67% / 25% / 0%）、完结数、首响均时、完结均时（96 分钟→1.6 小时）、在途超时 / 升级仲裁 / 评价数与均分、无评价显示「暂无评价」 |
| 截图 09 / 09b | 退款流水首屏 + 「加载更多」第二页 |
| 截图 10 | 导出 sheet「导出售后数据」：四种导出内容（售后单明细 / 退款流水 / 升级仲裁记录 / 员工处理绩效，后项见 §106）+ 区间回显 + 「导出」按钮 |
| 截图 11 | 商家售后页顶部入口出现「售后分析」胶囊 |
| 页面报错 | 无 `pageerror` / `console error` |

### 104.5 生产探针（admin-api，`canteen-a` 渠道，只读，区间 `2026-10-01 ~ 2026-10-31`）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesStats` | `pending:2, overdue:1, timeoutHours:48, dueSoonHours:12`，其余为 0 PASS |
| 2 | `campusMerchantAfterSalesReport` | `total:3`；`byType:[refund_only×3]`；`byState:[Appealed 1 / Pending 1 / Refunded 1]` PASS |
| 3 | `campusMerchantAfterSalesReasonReport` | `少送 requestCount:3 refundCount:1 refundAmount:100 share:100 changeRate:null` PASS |
| 4 | `campusMerchantAfterSalesProductReport` | `可乐鸡排饭 requestCount:3 refundCount:1 refundAmount:100 requestRate:4` PASS |
| 5 | `campusMerchantAfterSalesReviewSummary` | `total:0`，星级分布 1~5 全 0，`topTags:[]`（区间内无评价）PASS |
| 6 | `campusMerchantAfterSalesTopCustomers` | `下单冒烟 customerId:149 count:3 refundAmount:300 blacklisted:false` PASS |
| 7 | `campusMerchantAfterSalesRefunds` | `total:1`（`#26` refund_only 少送 ¥1.00）PASS |
| 8 | `campusMerchantAfterSalesExport(kind:"requests")` | `CSV_LEN=292`，首行 BOM + `售后单号,订单号,类型,状态,申请原因,驳回/关闭原因,申请时间,退款金额(元),退款时间` PASS |
| 9 | `campusMerchantAfterSalesStaffStats(from,to)` | **已修复（2026-10-31 热修，详见 103.5/103.6）**：返回 3 行（`operatorUserId:160 handled:3 overdueCount:1`、`operatorUserId:1 SuperAdmin handled:2 resolved:1` 等）PASS；字段为 `operatorUserId / operatorName / handled / resolved / firstActionAvgMinutes / resolveAvgMinutes / overdueCount / escalatedCount / resolveRate / reviewCount / reviewAvgScore` |

### 104.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 热修 2026-10-31（同 §103.6）：`campus-delivery-plugin` 两处 SQL 参数位改为 `$2/$3`，编译后覆盖 `lib/src/merchant-admin.service.js` 并 `pm2 restart vendure` | 探针 1~9 全部 PASS |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs` | `[deploy] 产物校验通过: 62182 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 chunk | `https://e.joho.cn/guanli/assets/` | `pages-campus-after-sales-analytics.8H2RRkqu.js` 200 / 26334 B、`after-sales-analytics-MwjnbohM.css` 200 / 12748 B（员工绩效接入后重新部署） |

操作入口：商家工作台 →「售后申请」→ 顶部入口「售后分析」→ 选择区间查看报表；右上「导出」选择导出内容与区间，生成 CSV。


## §105 售后自动化（已上线）

### 105.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后台 API | `web-admin/src/apis/campus.ts`（§105 段） | 自动分流规则增删改查、自动化设置（自动分配 / 异常预警）、月度摘要推送 |
| 新页 | `web-admin/src/pages/campus/after-sales-automation.vue` | 规则列表（启用开关 / 优先级 / 动作 / 匹配条件）→ 规则编辑 sheet → 自动分配设置卡 → 异常预警设置卡 → 月度推送设置卡 |
| 注册 | `web-admin/src/pages.json` | `pages/campus/after-sales-automation`，`enablePullDownRefresh: true` |
| 入口 | `web-admin/src/pages/campus/merchant-after-sales.vue` | 顶部入口胶囊「售后自动化」 |
| i18n | `web-admin/src/locale/{zh-Hans,en}.json` | 新增 `campusAfterSalesAutomation`（79 键） |
| 截图脚本 | `web-admin/scripts/shots-p105-after-sales-automation.cjs` | 10 张 |
| 截图 | `docs/screenshots/waimai/p105-after-sales-automation/` | 01~09（规则列表 / 编辑 sheet 空与填充 / 保存 / 开关 / 自动分配 / 预警 / 月度推送 / 入口） |

### 105.2 契约

```graphql
query { campusMerchantAfterSalesAutoRules {
  id name priority enabled matchType matchReason minAmount maxAmount action rejectReason createdAt } }

# id 为空 = 新增；action = approve | reject | escalate
mutation ($id: ID, $name: String!, $action: String!, $priority: Int, $enabled: Boolean,
          $matchType: String, $matchReason: String, $minAmount: Int, $maxAmount: Int, $rejectReason: String) {
  campusMerchantSaveAfterSalesAutoRule(...) {
    id name priority enabled matchType matchReason minAmount maxAmount action rejectReason createdAt } }
mutation ($id: ID!) { campusMerchantDeleteAfterSalesAutoRule(id: $id) }

# 自动化设置（仅传需修改项，阈值 0 = 关闭）
mutation ($autoAssignEnabled: Boolean, $autoAssignMax: Int, $alertEnabled: Boolean,
          $alertRefundRate: Int, $alertOverdueCount: Int) {
  campusMerchantUpdateAfterSalesAutomation(...) {
    autoAssignEnabled autoAssignMax alertEnabled alertRefundRate alertOverdueCount
    monthlyPushEnabled monthlyPushDay monthlyPushTime } }

# 月度摘要推送：day 1-28，time HH:MM
mutation ($enabled: Boolean!, $day: Int, $time: String) {
  campusMerchantUpdateAfterSalesMonthlyPush(enabled: $enabled, day: $day, time: $time) { ...同 StoreProfile } }

# 只读设置
query { campusMerchantStoreProfile {
  autoAssignEnabled autoAssignMax alertEnabled alertRefundRate alertOverdueCount
  monthlyPushEnabled monthlyPushDay monthlyPushTime } }
```

**单位约定**：`minAmount` / `maxAmount` 为「分」（表单输入元，提交转分）；`alertRefundRate` 为**百分比整数**（如 8 = 8%），不是小数；`monthlyPushDay` 取 1~28。

### 105.3 校验与边界

- **动作枚举**：`approve`（自动同意退款）/ `reject`（自动驳回）/ `escalate`（自动升级仲裁）；picker label 必须走 `locale.t()`，直接渲染键名会显示原始 i18n key（已修复，见 105.4）。
- **匹配条件**：`matchType`（全部售后类型 / 仅退款 / 退货退款 …）+ `matchReason` 关键词 + 金额区间，任一为空表示不限。
- **优先级**：数字越小越先命中；同优先级按创建先后。
- **启用开关**：列表行内即时切换 `enabled`，失败回滚并 toast。
- **自动分配**：`autoAssignEnabled` + `autoAssignMax`（单人在办上限），0 或关闭即不自动分配。
- **异常预警**：`alertRefundRate`（退款率百分比阈值）与 `alertOverdueCount`（超时单量阈值），任一 0 表示关闭该指标。
- **月度推送**：`day` 1~28（避免月末缺失），`time` `HH:MM`（picker mode="time"），关闭仅传 `enabled=false`。
- **权限**：`usePermGuard('CampusMerchant')`。

### 105.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 01 | 规则列表：空态提示 + 「新增规则」入口 |
| 截图 02 / 03 | 规则 sheet 空态与填充态：名称「小额仅退款自动同意（试用）」、动作「自动同意退款」、匹配「全部售后类型」、金额 0.01~20、优先级 15、启用开关 |
| 截图 04 / 05 | 保存后列表出现新规则；行内启用开关切换成功 |
| 截图 06 | 自动分配卡：开关 + 单人在办上限 + 近 7 日「建议分配参考」Top5（按处理量→完结率排序，见 §106） |
| 截图 07 | 异常预警卡：退款率阈值 + 超时单量阈值 |
| 截图 08 / 08b | 月度推送卡：开关 + 日期 picker + 时间 picker |
| 截图 09 | 商家售后页顶部入口「售后自动化」胶囊 |
| 页面报错 | 无 `pageerror` / `console.error` |
| 首次失败 | 规则 sheet 的 picker 显示原始键名 `campusAfterSalesAutomation.actApprove` / `matchAny`（静态数组 label 存的是 key）→ 改为基于 `actionKeys` / `matchTypeKeys` 的 computed + `locale.t()`，并同步 3 处 `.value` 引用；重新构建后截图正确 |

### 105.5 生产探针（admin-api，`canteen-a` 渠道，只读）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesAutoRules` | `[]`（未配置规则，正常态）PASS |
| 2 | `campusMerchantStoreProfile` | `autoAssignEnabled:false autoAssignMax:0 alertEnabled:false alertRefundRate:0 alertOverdueCount:0 monthlyPushEnabled:false monthlyPushDay:1 monthlyPushTime:"21:30"` PASS |

### 105.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | 无新增 | 探针 1~2 见 105.5 |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs` | `[deploy] 产物校验通过: 62177 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 chunk | `https://e.joho.cn/guanli/assets/` | `pages-campus-after-sales-automation.CikEJVr7.js` 200 / 18301 B、`after-sales-automation-DsEu8Lff.css` 200 / 5456 B、`pages-campus-merchant-after-sales.Co6tPiuc.js` 200 / 16344 B |

操作入口：商家工作台 →「售后申请」→ 顶部入口「售后自动化」→ 维护自动分流规则、自动分配与异常预警、月度摘要推送。


## §106 员工绩效联动：CSV 导出 / 值班排班 / 自动分配（已上线）

### 106.1 交付清单

| 端 | 文件 | 内容 |
|---|---|---|
| 后端 | `vendure/packages/campus-delivery-plugin/src/merchant-admin.service.ts`（`afterSalesExport`） | 新增 `kind=staff` 分支：直接复用 `afterSalesStaffStats(ctx, from, to)` 的口径生成 CSV（11 列），不受状态 / 类型 / 关键词 / 处理人筛选影响 |
| 后台 API | `web-admin/src/apis/campus.ts` | `campusMerchantAfterSalesExport` 的 `kind` 联合类型扩展为 `requests | refunds | escalations | staff` |
| 售后分析页 | `web-admin/src/pages/campus/after-sales-analytics.vue` | 导出 sheet「导出内容」新增第 4 项「员工处理绩效」（`ExportKind` 同步扩展） |
| 值班排班 | `web-admin/src/pages/campus/after-sales-ops.vue` | 值班 chip 追加「近 7 日处理量 · 完结率」小标签；进入 duty tab 时拉取一次 `campusMerchantAfterSalesStaffStats` |
| 自动分配 | `web-admin/src/pages/campus/after-sales-automation.vue` | 自动分配卡新增「建议分配参考（近 7 日）」Top5 列表，按处理量倒序、同量再按完结率倒序 |
| i18n | `web-admin/src/locale/{zh-Hans,en}.json` | `campusAfterSalesAnalytics.kindStaff`；`campusAfterSalesAutomation.assignSuggest{Lbl,Meta,Empty,Tip}`；`campusAfterSalesOps.dutyStat{,Tip}`（中英各 6 键） |
| 截图脚本 | `shots-p104-after-sales-analytics.cjs`（第 10 张改选「员工处理绩效」）、`shots-p105-after-sales-automation.cjs`（新增 staffStats mock + `.staff__row` 断言）、`shots-p100-after-sales-ops.cjs`（新增 staffStats mock） | — |
| 截图 | `docs/screenshots/waimai/p104-after-sales-analytics/`、`p105-after-sales-automation/`、`p100-after-sales-ops/` | 10 导出 sheet（4 种导出内容）、06 自动分配建议参考、04/05 值班 chip 处理参考 |

### 106.2 契约与口径

```graphql
# 与服务端同签名，新增 kind=staff（返回 CSV 文本，含 UTF-8 BOM）
query ($from: String!, $to: String!, $kind: String!) {
  campusMerchantAfterSalesExport(from: $from, to: $to, kind: $kind)
}
```

- **导出列**：`操作人ID, 操作人, 处理量, 完结数, 完结率%, 首响均时(分), 完结均时(分), 在途超时, 升级仲裁, 评价数, 评价均分`（`resolveRate` 后端已是 0~100 整数，直接输出）。
- **口径一致**：`kind=staff` 与 `campusMerchantAfterSalesStaffStats` 完全同源（同一区间、同一 SQL），因此页面卡片数值与导出文件必然一致。
- **筛选不生效**：该类型按人聚合，`state/type/keyword/assigneeUserId` 一律忽略；`from/to` 仍受「最长一年」与「开始不晚于结束」校验。
- **建议参考排序**：区间固定为近 7 日（`today-6 ~ today`，校园日 UTC+8）；`handled` 倒序 → 同量按 `resolveRate` 倒序 → 取前 5。
- **值班 chip**：按值班条目 `userId` 查 `staffByUser` 映射，命中才渲染 `{h} 单 · 完结 {r}%`；接口失败整体降级为空映射，不影响排班读取与保存。

### 106.3 校验与边界

- **非法 kind** 仍由后端 `导出类型无效` 拒绝（白名单现为 `requests | refunds | escalations | staff`）。
- **行数**：单次上限 5000 行（员工绩效行数等于当期有处理记录的操作人数，通常远低于上限）。
- **空数据**：当期无人经手时 CSV 只有表头；页面建议参考为空时显示「近 7 日暂无处理记录」。
- **权限**：三个页面均为 `usePermGuard('CampusMerchant')`。

### 106.4 验证记录

| 步骤 | 结果 |
|---|---|
| 后台构建 | `npm run build:h5` → `DONE Build complete.` |
| 截图 10（p104） | 导出 sheet 四选一：售后单明细 / 退款流水 / 升级仲裁记录 / **员工处理绩效**（默认选中该项） |
| 截图 06（p105） | 自动分配卡：开关 + 单人在办上限 + 「建议分配参考（近 7 日）」#1 张伟 34 单 · 完结率 91%、#2 李静 28 单 · 完结率 93%、#3 王强 21 单 · 完结率 71%、#4 赵敏 12 单 · 完结率 92% |
| 截图 04/05（p100） | 值班 chip 带处理参考：周一 09:00~15:00 张伟「34 单 · 完结 91%」、跨零点 18:00~次日 03:00 李娜「28 单 · 完结 93%」 |
| 页面报错 | 三个脚本均无 `pageerror` / `console error` |
| 首次失败 | `after-sales-ops.vue` 重复声明 `campusDateKey`（页内已有同名函数）导致 `build:h5` 报错 → 删除重复定义、复用既有函数后构建通过 |

### 106.5 生产探针（admin-api，`canteen-a` 渠道，只读，区间 `2026-10-01 ~ 2026-10-31`）

| # | 用例 | 结果 |
|---|---|---|
| 1 | `campusMerchantAfterSalesExport(kind:"staff")` | PASS：BOM 前缀 + 11 列表头 `操作人ID,操作人,处理量,完结数,完结率%,首响均时(分),完结均时(分),在途超时,升级仲裁,评价数,评价均分`；1 行数据 `160,操作人 #160,3,0,0,0,0,1,0,0,0` |

### 106.6 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `npx tsc -p tsconfig.build.json` → 覆盖 `/www/apps/vendure/packages/campus-delivery-plugin/lib/src/merchant-admin.service.js(+.map)` → `pm2 restart vendure` | restarts 826，status online；探针 1 PASS |
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs`（二次部署含值班 chip 两行布局修正） | `[deploy] 产物校验通过: 62186 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 chunk | `https://e.joho.cn/guanli/assets/` | `pages-campus-after-sales-analytics.CfiB_vK3.js` 200 / 26394 B、`after-sales-analytics-DAEtPRTp.css` 200 / 12748 B、`pages-campus-after-sales-automation.D58hP-9A.js` 200 / 19606 B、`after-sales-automation-B1zkRaqb.css` 200 / 6023 B、`pages-campus-after-sales-ops.Bk2PJl9v.js` 200 / 42959 B、`after-sales-ops-BdptS6WB.css` 200 / 11362 B |

操作入口：售后分析页「导出」→ 选「员工处理绩效」；「售后申请」→ 值班排班（chip 处理参考）；「售后申请」→ 售后自动化 → 自动分配卡（建议分配参考）。

## §107 自提点 ↔ 门店关联与列表检索（已上线）

后端在 §76-§81 阶段已给 `pickup_location` 加了 `merchantStoreId`（实体 + 索引 + 迁移回填），但后台一直没接：建点时选不了门店、列表看不到归属、点多了只能滚动找。本节把「建点关联门店 → 列表按门店标记 → 关键字/城市检索」补齐，并与平台端门店详情（§108）共用同一份 API。

### 107.1 交付清单

| 端 | 文件 | 改动 |
|---|---|---|
| 后台 API | `web-admin/src/apis/pickup-location.ts` | `PickupLocationItem` / `CreatePickupLocationInput` 增 `merchantStoreId`；`FIELDS` 增该字段；列表 `take` 100 → 500；新增 `fetchPickupLocationsByStore(storeId)`（服务端 `filter.merchantStoreId`，避免只在前 100 条里筛） |
| 后台页 | `web-admin/src/pages/pickup/edit/index.vue` | 类型下方新增「关联门店」picker（首项「不关联门店」）；`onLoad` 支持 `?merchantStoreId=` 预选（门店详情「新增自提点」跳入）；保存显式传 `null` 才能解除已有绑定 |
| 后台页 | `web-admin/src/pages/pickup/index.vue` | 「本店 / 全局池」两个 tab 都加搜索框 + 城市 picker；卡片 meta 行显示 `🏬 门店名`；空态区分「暂无」与「没有匹配的自提点」 |
| i18n | `zh-Hans.json` / `en.json` | `pickupPage.searchPh/allCities/emptyMatch`、`pickupEdit.storeLabel/storeTip/storeUnlink` |
| 截图 | `docs/screenshots/waimai/pickup-store-link/` | 8 张：列表带门店标签 / 关键字命中 / 城市筛选 / 无匹配 / 全局池筛选 / 编辑页未关联 / 关联门店弹层 / 已关联回显 |
| 脚本 | `web-admin/scripts/shots-pickup-store-link.cjs` | mock `pickupLocations`（按 `filter: { isPublic` 区分本店与全局池）、`merchantStores`、`pickupLocation`；390×844 dpr2 |

### 107.2 契约与口径

- **列表上限**：`take: 500`。门店数 + 自提点数在同一租户内远小于 500；超过时仍只取首页，属已知限制。
- **门店名展示**：`loadStoreNames()` 只在首次 `reload()` 时拉一次 `merchantStores(take:500)` 建 `id → name` 映射；失败时静默隐藏门店标签，不阻断列表。
- **筛选为前端过滤**：对已加载数组按 `city` 精确匹配 + 关键字命中 `name/address/city/district/street/contactPerson/phoneNumber`；城市存「城市名」而非 picker 索引，避免列表增删后索引漂移指向别的城市。
- **解除绑定**：`merchantStoreId` 必须显式传 `null`（`undefined` 会被后端视为「不修改」），前端保存时用 `form.merchantStoreId || null`。
- **跳入预选**：`pages/pickup/edit/index?merchantStoreId=xx` 仅填充表单，不改后端；门店详情页的「新增自提点」按钮走该入口（§108）。

### 107.3 校验与边界

| # | 用例 | 结果 |
|---|---|---|
| 1 | 列表默认态：4 条自提点中 3 条有关联门店，meta 行显示 `🏬 第一食堂` / `🏬 第二食堂` / `🏬 西门便利店`，无关联的一条不显示 | PASS |
| 2 | 关键字「西门」→ 仅剩「西门便利店取货点」 | PASS |
| 3 | 城市切「上海市」→ 剩 2 条（西门便利店 / 南区快递驿站） | PASS |
| 4 | 关键字「不存在的点」→ 空态「没有匹配的自提点」（非「暂无自提点」） | PASS |
| 5 | 全局池 tab：筛选条可用，2 条全局点正常展示 | PASS |
| 6 | 编辑页（`id=pl4`，未关联）：picker 显示「不关联门店」，说明文案完整 | PASS |
| 7 | 编辑页打开关联门店弹层：选项为「不关联门店 / 第一食堂（C01）/ 第二食堂（C02）/ 西门便利店（S01）」 | PASS |
| 8 | 编辑页（`id=pl3`，已关联）：picker 回显「西门便利店（S01）」 | PASS |
| 9 | 截图脚本 `shots-pickup-store-link.cjs` 全程无 `pageerror` / `console error` | PASS |

### 107.4 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs` | `[deploy] 产物校验通过: 62186 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 chunk | `https://e.joho.cn/guanli/assets/` | `pages-pickup-index.l0yd-ykU.js` 200 / 8098 B、`pages-pickup-edit-index.1eCuTald.js` 200 / 14829 B、`pickup-location.Dfh16vF2.js` 200 / 2073 B |

## §108 平台端商户管理 / 门店管理（已上线）

平台角色（超管 / 运营）维护商户（Merchant）与门店（MerchantStore）：证照与主体信息、合作与结算、认领渠道、门店员工，以及门店名下的关联自提点。四个页面在 §76-§81 阶段已由后端 `merchant-plugin` 提供 resolver，但前端源文件一直未入库（菜单/路由/文案已接好），本节补齐页面并把两处缺陷修掉。

### 108.1 交付清单

| 端 | 文件 | 改动 |
|---|---|---|
| 后台 API | `web-admin/src/apis/merchant-admin.ts` | `MerchantItem` / `MerchantStoreItem` / `MerchantStoreClaimItem` / `MerchantStoreStaffItem` 类型与 `MERCHANT_FIELDS` / `STORE_FIELDS`；`fetchMerchants` / `fetchMerchant` / `createMerchant` / `updateMerchant` / `fetchMerchantStores` / `fetchMerchantStore` / `createMerchantStore` / `updateMerchantStore` / `fetchStoreClaims` / `claimStore` / `revokeStoreClaim` / `fetchStoreStaff` / `upsertStoreStaff` |
| 组件 | `web-admin/src/components/MediaUrlField.vue` | 媒体 URL 字段（单值 / 多值，`max` 控制上限），商户 logo、许可证、门店封面与相册复用 |
| 后台页 | `web-admin/src/pages/platform/merchants/index.vue` | 商户列表：搜索（回车）+ 状态/认领筛选、状态与认领徽章、门店数量（`merchantStores(take:500)` 聚合）、编辑/查看门店/停用启用 |
| 后台页 | `web-admin/src/pages/platform/merchants/detail.vue` | 商户详情 6 区块：基本信息 / 主体资质 / 联系方式 / 注册地址 / 合作与结算 / 下属门店（可跳新增门店） |
| 后台页 | `web-admin/src/pages/platform/stores/index.vue` | 门店列表：搜索 + 商户/城市/状态筛选（`?merchantId=` 预选）、营业/停用/公开展示徽章、地址与坐标缺失提示、编辑/停用启用 |
| 后台页 | `web-admin/src/pages/platform/stores/detail.vue` | 门店详情 9 区块（含券核销、配送能力）+ 关联自提点 + 门店员工 + 租户认领（仅超管），支持地图选点 |
| 缺陷修复 | 同上两个 `index.vue` | ① 商户列表首次进入不加载（`onShow` 的 `firstShow` 直接 return）→ 改为每次 `onShow` 都 `load()`；② 搜索框回车 `@confirm="load"` 把事件对象当 `append` 传入 → 改为 `@confirm="load()"`，避免重复追加卡片 |
| 截图 | `docs/screenshots/waimai/platform-merchant-store/` | 12 张：商户列表 / 关键字 / 状态筛选 / 商户详情基本 / 合作与结算 / 门店列表 / 按商户筛选 / 门店详情基本 / 营业配送 / 自提点+员工+认领 / 添加员工弹窗 / 新建门店空白表单 |
| 脚本 | `web-admin/scripts/shots-platform-merchant-store.cjs` | mock `merchants` / `merchant` / `merchantStores` / `merchantStore` / `merchantStoreClaims` / `merchantStoreStaff` / `tenants` / `tenantAdministrators` / `pickupLocations`；按 `options` 的 keyword/status/claimStatus/merchantId/city 做过滤；390×844 dpr2 |

### 108.2 契约与口径

- **入口**：`constants/menus.ts` 平台组 `menu.merchantList` → `/pages/platform/merchants/index`、`menu.merchantStoreList` → `/pages/platform/stores/index`；四页已在 `pages.json` 注册，标题走 `i18n/nav-titles.ts`。
- **GraphQL**：查询 `merchants(options)` / `merchant(id)` / `merchantStores(options)` / `merchantStore(id)` / `merchantStoreClaims(storeId)` / `merchantStoreStaff(storeId)`；变更 `createMerchant` / `updateMerchant` / `createMerchantStore` / `updateMerchantStore` / `claimMerchantStore` / `revokeMerchantStoreClaim` / `upsertMerchantStoreStaff`。
- **金额口径**：门店 `deliveryFee` / `minOrderAmount` 后端存「分」，表单按「元」编辑，保存 `Math.round(元 * 100)`；展示 `cents / 100`。
- **佣金口径**：后端存万分比，表单按百分比编辑：读 `commissionRate / 100`（8.5 → `0.085`%），存 `Math.round(百分比 * 100)`。
- **门店数量**：商户列表每次 `load()` 拉一次 `merchantStores(take:500)` 聚合 `merchantId → 门店数`，失败静默不影响列表。
- **关联自提点**：门店详情复用 §107 的 `fetchPickupLocationsByStore(storeId)`（服务端 `filter.merchantStoreId`）；「新增自提点」跳 `pages/pickup/edit/index?merchantStoreId=<storeId>`，回来自动刷新。
- **员工候选**：超管走 `tenantAdministrators(首条认领渠道)`，普通租户管理员走 `tenantMyMembers()`；认领区块仅 `auth.isSuperAdmin` 可见。
- **状态与删除**：停用/启用为 `enabled` 软开关（`updateMerchantStore({ enabled })`），商户停用为 `status: SUSPENDED`；均二次确认，不提供物理删除。

### 108.3 校验与边界

| # | 用例 | 结果 |
|---|---|---|
| 1 | 商户列表默认态：3 户（正常/暂停/正常），认领徽章「已认领 / 已认领 / 未认领」，编码行带门店数「2 家 / 1 家 / 1 家」 | PASS |
| 2 | 搜索「咖啡」回车 → 仅「南门咖啡工作室」1 条，无重复追加 | PASS |
| 3 | 状态筛选「暂停」→ 仅「西门便利店」，操作项由「停用」变「启用」 | PASS |
| 4 | 商户详情区块齐全：基本信息 / 主体资质 / 联系方式 / 注册地址 / 合作与结算 / 下属门店 · 共 2 家 | PASS |
| 5 | 合作与结算回显：认领状态 `CLAIMED`、合同号、合作起止、佣金 `0.085`%、结算 `T+1`、开户行/户名/账号/税号 | PASS |
| 6 | 门店列表 4 条：营业中 / 已关闭（+ 已停用）/ 营业中（不公开）/ 暂停营业，缺失经纬度一条显示「缺坐标」 | PASS |
| 7 | `?merchantId=m1` → 仅第一食堂名下 2 家，商户筛选回显「第一食堂运营有限公司」 | PASS |
| 8 | 门店详情 9 区块齐全，含经营信息、券核销、配送能力 | PASS |
| 9 | 配送能力：配送费 ¥2、起送价 ¥0、预计送达 30 分钟（分→元换算正确） | PASS |
| 10 | 关联自提点 2 条（其中 1 条标「停用」）；门店员工 2 条（经理 · 在职 / 店员 · 已停用）；租户认领 2 条（`ACTIVE` 有「撤销」，`PENDING` 无） | PASS |
| 11 | 添加员工弹窗：后台用户 picker（王强 · 13900002222）、姓名、电话、门店角色、员工状态 + 取消/确定 | PASS |
| 12 | 新建门店 `?merchantId=m1`：所属商户预选「第一食堂运营有限公司」，编码/名称留空 | PASS |
| 13 | 截图脚本 `shots-platform-merchant-store.cjs` 全程无 `pageerror` / `console error` | PASS |

### 108.4 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后台 | `node D:\zhao\vshop\web-admin\scripts\deploy.mjs` | `[deploy] 产物校验通过: 62186 KB` → nginx `test is successful` + reload → `deploy done` |
| 线上 chunk | `https://e.joho.cn/guanli/assets/` | `pages-platform-merchants-index.BhdMBcCJ.js` 200 / 5202 B、`pages-platform-merchants-detail.BGpTCA1s.js` 200 / 17707 B、`pages-platform-stores-index.mZi0c3p4.js` 200 / 5573 B、`pages-platform-stores-detail.aMuDdIJN.js` 200 / 32130 B、`merchant-admin.DdqOc13G.js` 200 / 4019 B |

## §109 券卡改版：活动图缩略 / 海报卡 / 券详情通栏大图（已上线）

顾客端券卡原先左侧是一块固定渐变色价格牌（金额 + 券类型），券信息挤在右侧；券种类一多，列表辨识度低。本版把「活动图」`activityImage` 引到 C 端：左侧改为活动图缩略（无图时用券名首字兜底），价格与类型标签移入右侧信息区；券商城单券卡升级为通栏沉浸海报卡（顶部大图 + 券信息 + 购买按钮）；券详情弹层顶部增加活动通栏大图。

### 109.1 交付清单

| 端 | 文件 | 改动 |
|---|---|---|
| 查询层 | `src/api/queries/coupon.ts` | `COUPON_TEMPLATE_FIELDS` 增加 `activityImage`（券中心 / 我的卡包 / 券商城 / 积分商城 / 商品专属券 5 处查询同时生效） |
| 组件 | `src/pkg-promotion/components/CouponDetailSheet.vue` | 顶部新增 `.cds-hero` 通栏活动大图（`heroSrc` 计算属性：无图或 `@error` 加载失败时整块隐藏、不占位）；`watch` 同时监听 `visible` 与 `tpl`，切换券时重置失败标记 |
| 页面 | `src/pkg-promotion/pages/coupons.vue` | 领券中心 / 到店券 / 我的卡包三个列表的 `coupon-card__left` 渐变块改为 `coupon-card__thumb`（活动图 `aspectFill` 或首字兜底 `couponInitial`）；金额行与类型标签移入右侧 `__info` |
| 页面 | `src/pkg-promotion/pages/coupon-mall.vue` | 领券 / 积分 / 卡包同样改缩略图；**券商城单券卡**改为 `coupon-card--poster`（`flex-direction: column`，活动图 100% × 320rpx 通栏，金额行移到券名下方） |

### 109.2 契约与口径

- **字段**：`CouponTemplate.activityImage`（后端 `varchar(1024) nullable`，由 `add-coupon-activity-image` 迁移幂等补列）；后台「优惠券编辑」页已可填写，空值合法。
- **兜底口径**：`couponInitial(name)` 取券名首字；券名缺失时取 `t('coupons.nameFallback')` / `t('couponMall.nameFallback')`（中「优惠券」→「优」、英「Coupon」→「C」），不硬编码中文。
- **图片失败**：列表卡不做逐项 error 兜底（保持灰底），仅券详情大图做整块隐藏，避免弹层顶部出现破图。
- **版式**：普通券卡 `min-height: 200rpx`、缩略图 `180rpx` 宽 `align-self: stretch`；海报卡缩略图 100% 宽、高 `320rpx`、金额字号 `48rpx`（普通卡 `40rpx`）。
- **兼容**：`saleTemplates` / `mc.template` 均可能为 `null`，全部用可选链读取 `activityImage` / `name`，无 template 时不报错。

### 109.3 校验与边界

| # | 用例 | 结果 |
|---|---|---|
| 1 | 领券中心 3 张券（`activityImage = null`）：左侧灰底首字兜底「新 / 全 / 免」，金额行与类型标签在右侧 | PASS（`fallbackThumbs=3`、`imageThumbs=0`） |
| 2 | 领券中心 mock 带图 3 张：活动图 `aspectFill` 铺满缩略区、无拉伸变形 | PASS |
| 3 | 我的卡包（UNUSED 2 张）：1 张带图 + 1 张首字兜底「门」，已用券整体 `opacity .65` | PASS |
| 4 | 券商城「领券」tab：3 张带图券卡，券名 + 场景标签 + 条件/时间齐全 | PASS |
| 5 | 券商城「购券」tab：`posterCards=3` 通栏海报卡，活动图、券名、金额、库存进度、购买按钮均完整无裁切 | PASS |
| 6 | 券商城「卡包」tab：临期券（带「剩 N 天」角标）+ 带图券各 1 张 | PASS |
| 7 | 点击海报卡打开券详情：`cds-mask` / `cds-hero` 均出现，顶图 + 金额 + 券名 + 券介绍 + 适用范围 + 购买须知 + 底部购买按钮完整 | PASS |
| 8 | 线上 `CouponTemplate` 内省：40 字段含 `activityImage`；`couponCentre` 返回 3 条、`activityImage` 均为 `null`（不影响渲染） | PASS |

### 109.4 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| C 端 | `npm run build:h5` → `tar -czf` → `scp joho:/tmp/` → 解压至 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（解压前 `index.html` 备份为 `index.bak_<ts>.html`） | 产物 2373 KB / 725 KB 包，`DEPLOY_OK`（仅目录属主 root 导致 utime/chmod 告警，文件内容已更新） |
| 线上 chunk | `https://e.joho.cn/assets/` | `index-C9ljofZU.js` 200 / 753499 B、`pkg-promotion-pages-coupons.c3R8-uvN.js` 200 / 14931 B、`pkg-promotion-pages-coupon-mall.fBI2dNA2.js` 200 / 28370 B、`coupon-mall-DQ8HRY_Z.css` 200 / 11920 B，Content-Length 与本地一致 |
| 线上标记 | 抓取 chunk 正文 | CSS 含 `poster`（海报卡）、JS 含 `activityImage`（字段已带入查询） |
| 截图 | `docs/screenshots/promotion/coupon-cards/` | 7 张 390×844 dpr2：`01` 首字兜底 / `02` 带图券卡 / `03` 我的卡包 / `04` 券商城领券 / `05` 海报卡 / `06` 券商城卡包 / `07` 券详情弹层 |
| 截图脚本 | `scripts/_shots_coupons.cjs` | 本地 http 服务 `dist/build/h5`（hash 路由）+ `page.route` 按 GraphQL 操作名 mock；复跑两次结果一致 |

---

## §110 售后列表服务端分页 / 失败原因直显 / 商家回复配图（已上线）

**操作入口**：后台「售后管理」（经营 › 售后管理 › 售后申请）。

售后列表原先一次性拉全量再在前端过滤：单量一多首屏就卡，且「哪些单退款失败、为什么失败」要逐条点进详情才看得到，商家协商时也只能发文字。本版改为**服务端分页 + 服务端状态筛选**（每页 20 条，chip 上带全店计数），**退款失败原因直接印在列表卡上**，并把商家回复升级为**可发图（≤6 张）**。

### 110.1 交付清单

| 端 | 文件 | 改动 |
|---|---|---|
| 后台页面 | `web-admin/src/pages/campus/merchant-after-sales.vue` | 列表改用 `campusMerchantAfterSalesWorkItems`（`state` + `skip` + `take=20`）；筛选 chip 显示计数并改 `pickFilter` 服务端重查；失败卡新增 `.a-fail` 原因条；底部新增 `.more`（加载更多 / 已显示全部）；详情面板回复区改为「图片条 + ＋号 + 输入框 + 发送」 |
| 后台 API | `web-admin/src/apis/campus.ts` | `MerchantAfterSalesRow` 增加 `refundError: string \| null`；工作台清单 items 选择集补 `refundError`；approve/reject/retry/detail 查询同步补齐 |
| 后台 i18n | `web-admin/src/locale/zh-Hans.json`、`en.json` | `campusMerchantAfterSales` 新增 7 键：`refundFailReason` / `loadMore` / `loadingMore` / `noMore` / `imageLimit` / `imageUploading` / `imageUploadFailed` |
| 后端 | `vendure/packages/campus-delivery-plugin/src/merchant-admin.service.ts` | `MerchantAfterSalesRow` 增 `refundError`；`toAfterSalesRow()` 回传 `row.refundError ?? null`（SDL `CampusMerchantAfterSalesItem.refundError: String` 同批落位） |
| 截图 | `docs/screenshots/waimai/p110-after-sales-list/` | 4 张 390×844 dpr2：`01` 首屏分页+计数+失败原因 / `02` 加载更多后已到底 / `03` 筛选退款失败 / `04` 回复配图 |
| 截图脚本 | `web-admin/scripts/shots-p110-after-sales-list.cjs` | 本地静态服务 `dist/build/h5`（`/guanli/`）+ `page.route('**/admin-api')` 按 GraphQL 操作名 mock（含 `stateCounts` / `skip` / `take` / `createAssets` 上传） |

### 110.2 口径与契约

- **分页**：`PAGE = 20`，首次 `skip=0`；「加载更多」用 `skip = 已加载条数` 追加，`items.length >= total` 时按钮换成「已显示全部」。
- **筛选**：切 chip 即回 `skip=0` 重查（不叠加本地过滤）；chip 数字来自 `stateCounts`（**全店计数，不受分页影响**），「全部」为各状态求和。
- **失败置顶**：`RefundFailed` 在**当前已加载页内**置顶排序，不是跨页全局置顶（翻页后新加载的失败单同样会排到本页最前）。
- **失败原因**：仅 `state === 'RefundFailed'` 且 `refundError` 非空时渲染「退款失败原因：…」；成功重试后该行自然消失（状态变 `Refunded`）。
- **回复配图**：上限 6 张；选图后先 `uploadAsset`（资产库 multipart）拿到 `asset.source` 再显示缩略图，发送时随 `images` 一并提交；单图失败仅 toast，不回滚已选图。
- **可回复态**：仅 `Pending` / `Appealed` 可写（与后端 `AFTER_SALES_PENDING_STATES` 一致），其余状态面板底部只读。

### 110.3 权限与校验

- 页面 `usePermGuard('CampusMerchant')`；后端 `campusMerchantAfterSales` 一律按 `ctx.channelId` 限定本店，跨店不可见。
- 回复留言走既有 `campusMerchantAfterSalesReply`：非待处理态直接拒绝；`content` 必填（纯图片不带文字会提示「请先输入回复内容」），`images` 为 URL 数组（≤6 由前端约束）。
- 图片白名单沿用资产库：png/jpeg/webp/gif、单图 ≤10MB；上传者记为当前管理员。

### 110.4 数据库变更

- 本次**本功能无新增表/列**：`refundError` 为售后单既有列，只是补到列表回传。
- 同批部署另带上 R5/R7 的 `p37-support-ticket-system` 迁移（`campus_support_ticket` 增 `source`/`dedupeKey`、`customerId` 改可空、唯一索引；订单补 `customFieldsExceptionresolvedat`），由插件 bootstrap 幂等执行，与本页无耦合。

### 110.5 验证记录

| # | 用例 | 结果 |
|---|---|---|
| 1 | 后台 `npm run build:h5` | PASS（仅 sass legacy-js-api 弃用告警） |
| 2 | 首屏 25 单：chip「全部25 / 待处理2 / 已退款20 / 已驳回0 / 退款失败3」，前 3 条失败单置顶，2 条带红色原因条，底部「加载更多」 | PASS（`cardCount=20`） |
| 3 | 点「加载更多」 | PASS（`cardCount=25`、`.more__end`=「已显示全部」） |
| 4 | 点「退款失败」chip | PASS（服务端返回 `total=3`，chip 高亮） |
| 5 | 打开 Pending 单详情 → ＋号选图并上传 | PASS（`.r-img=1`、输入框占位正常、按钮「发送」） |
| 6 | 线上内省 `CampusMerchantAfterSalesItem` | PASS（`admin-api` 含 `refundError`；`shop-api` 不含，符合仅商家可见） |
| 7 | 线上 chunk | PASS（`assets/pages-campus-merchant-after-sales.Dui7VNo_.js` 200 / 19137 B，正文含 `refundFailReason`、`loadMore`） |
| 8 | 后端 `tsc -p tsconfig.build.json` + `vitest`（support / dispatch-job / hall / feishu） | PASS（4 文件 169 用例） |

### 110.6 边界与已知限制

1. 本页只提供**状态**筛选；关键词 / 金额区间 / 标签 / 负责人 / 风险等高级筛选仍在「售后工作台」（§101）。
2. 「加载更多」按已加载条数取 `skip`：若翻页期间有新单进入，可能出现个别重复或漏项；下拉刷新即从第一页重查。
3. 失败单置顶只在**已加载页内**生效，跨页不是全局排序；想只看失败单请用「退款失败」chip。
4. 回复必须带文字（纯图发不出），如需只发图请先打一句说明。
5. 回复图片存资产库（可被图库管理页看到），不随售后单删除而级联清理。

### 110.7 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 后端 | `git push origin master`（`83b5afa5b`）→ 服务器 `git fetch origin master` + `git checkout origin/master -- packages/campus-delivery-plugin` + `pm2 restart vendure --update-env` | 上线成功，`grep refundError` 命中 5 处；启动日志无报错，p37 迁移随 bootstrap 执行 |
| 后台 | `npm run build:h5` → `node scripts/deploy.mjs`（含 `nginx -t` + reload） | 产物校验通过 62191 KB，`deploy done` |
| 线上标记 | `https://e.joho.cn/guanli/assets/…` | 页面 chunk 200 / 19137 B，含 `refundFailReason`、`loadMore` |
| 截图 | `docs/screenshots/waimai/p110-after-sales-list/` | 4 张（`01` 首屏 / `02` 已到底 / `03` 筛失败 / `04` 回复配图） |

---

## §111 评价页三条规则：信任签名卡 / 好评送礼仅三项 / 仅差评展示改进项（已上线）

**操作入口**：顾客端「写评价」（订单详情 › 去评价）、「商品评价列表」（商品详情 › 评价）、「我的评价」；外卖 C 端 `https://www.yourbao.cn/waimai/` 写评价页。

评价页此前只有星级 + 一组通用标签，既没有「这家店凭什么值得信」的固定口径，也会在顾客打 5 星时仍展示「哪些需要改进」暗示不满意；「好评送礼」则完全缺失。本版统一三条规则：**信任签名卡按「质量 → 服务 → 时间」固定顺序**、**好评送礼只保留质量/服务/时间三项**、**只有 1~3 星才展示「哪些需要改进」**。

### 111.1 交付清单

| 端 | 文件 | 改动 |
|---|---|---|
| C 端组件 | `src/components/TrustSignatureCard.vue`（新建） | 三行固定顺序（`quality` → `service` → `time`）+ 徽章（平均分 / 好评率 / 真实评价）；未传 `averageRating` / `goodRate` 时对应徽章隐藏 |
| 写评价 | `src/pkg-order/pages/order-evaluate.vue` | 顶部 `TrustSignatureCard`；每行星级 `≤3` 时展示「哪些需要改进」5 标签（与正面标签互斥）；全部 `≥4` 星时展示好评送礼 3 项；`tags` 提交合并；路由参数改 `onLoad` |
| 商品评价列表 | `src/pkg-product/pages/evaluate.vue` | 原 `.review-summary` 统计块替换为签名卡（带平均分 / 好评率）；`slug` 改由 `onLoad` 读取 |
| 我的评价 | `src/pkg-user/pages/my-reviews.vue` | 顶部签名卡（只读，仅「真实评价」徽章） |
| 外卖 C 端 | `waimai-v39/src/pkg-order/pages/review-create.vue` | 页面内联签名卡三行；`rating ≤3` 展示改进项并隐藏正面标签；`rating ≥4` 展示好评送礼 3 项；`watch(rating)` 互斥清空；`submitTags()` 合并提交 |
| 国际文案（C 端） | `src/i18n/locales/{zh-CN,zh-TW,en,ja,ko}.json` | `review` 块新增 20 键（`trust*` / `gift*` / `improve*`） |
| 国际文案（外卖 C 端） | `waimai-v39/src/locale/{zh-Hans,en}.json` | `reviewCreate` 块新增同名 20 键 |
| 截图 | `docs/screenshots/waimai/p111-review-rules/` | 4 张 390×844 dpr2：`01` 5 星好评 / `02` 2 星中评 / `03` 商品评价列表签名卡 / `04` 我的评价签名卡 |
| 截图脚本 | `scripts/_shots_review_rules.cjs` | 本地静态服务 `dist/build/h5`（hash 路由）+ `page.route('**/*shop-api*')` 按 GraphQL 操作名 mock |

### 111.2 口径与契约

- **固定顺序**：信任签名卡恒为「质量 → 服务 → 时间」，由常量 `ROWS` 决定，不随数据或评分动态排序。
- **纯前端文案**：三维文案与徽章均不读后端字段（后端 `review` 只有 `rating` / `tags` / `giftGranted`），本轮不新增字段与接口。
- **徽章**：平均分（`4.8 分`）、好评率（`好评率 96%`）、`真实评价`；缺数据即隐藏，不伪造 `0` 或 `—`。写评价页与我的评价页无统计数据源 → 只显示「真实评价」。
- **好评阈值**：4~5 星 = 好评，1~3 星 = 差评。
- **好评送礼**：只保留「质量 / 服务 / 时间」三项，且仅在**本次所有商品都 ≥4 星**（`allGood`）时出现；`giftChoice` 只是前端选择，不上行、不落库，实际礼包发放仍由后端既有 `giftGranted` 流程控制。
- **仅好评不推测不满意**：好评时改进块 `v-if` 不成立，页面不出现「哪些需要改进」。
- **互斥**：`1~3` 星时正面标签块隐藏、改进块出现；`4~5` 星反之。改进标签 5 项（口味一般 / 分量不足 / 配送慢 / 包装破损 / 性价比低），提交时与正面 tags 合并进 `tags` 数组（互斥下至多一组）。

### 111.3 权限与校验

- 复用既有 `createReview`：`rating` 为 1~5 整数、`tags` 为字符串数组（可选）；**无新增权限点**。
- 未登录点开写评价页：先跳登录页，登录后回跳 `auth.requireLogin('/pkg-order/pages/order-evaluate?code=…')`。
- 路由参数统一走 `onLoad(options)`：H5 无 `getCurrentPages` 全局，旧写法在深链下取不到 `code` / `slug`，页面会空白（本轮一并修复）。

### 111.4 数据库变更

- **无**：未新增表/列，`customer_review.rating` / `tags` / `giftGranted` 沿用；三维签名、送礼选项均不落库。

### 111.5 验证记录

| # | 用例 | 结果 |
|---|---|---|
| 1 | C 端 `npm run build:h5` | PASS（仅 sass `legacy-js-api` 弃用告警） |
| 2 | 写评价页 5 星 | PASS（`trustRows` 依次为「质量…/服务…/时间…」；`giftOpts=质量/服务/时间`；`giftVisible=true`；`improveVisible=false`） |
| 3 | 写评价页 2 星 | PASS（`giftVisible=false`；`improveTags` 5 项；正面标签块隐藏） |
| 4 | 商品评价列表 | PASS（`trustBadges=4.8 分 / 好评率 96% / 真实评价`，三行顺序正确、无遮挡） |
| 5 | 我的评价 | PASS（仅「真实评价」徽章，空态「暂无评价」正常，不遮挡 tab） |
| 6 | 外卖 C 端 `pnpm build:h5` + 部署 | PASS（产物校验 3851 KB，`deploy done`） |
| 7 | 线上 chunk | PASS（清单见 111.7） |
| 8 | i18n JSON | PASS（7 个文件 `JSON.parse` 校验通过，键名一一对应） |

### 111.6 边界与已知限制

1. 好评阈值写在各自页面的 `allGood` computed（`>= 4`）；若要改成「5 星才算好」需同步改 C 端写评价页与外卖 C 端写评价页两处。
2. 外卖 C 端本轮只改写评价页；其商品评价列表、我的评价页未接入签名卡。
3. 「好评送礼」只是展示与选择，无后端发放记录（除既有 `giftGranted` 布尔），顾客选择什么不落库、也不产生券。
4. 三维文案为全店统一固定口径，不随店铺/商品差异（无后端字段支撑）。
5. 我的评价页与写评价页没有平均分 / 好评率来源，故只有「真实评价」徽章；带分数的徽章仅商品评价列表页生效。

### 111.7 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| C 端 | `npm run build:h5` → `tar -czf`（727 KB）→ `scp joho:/tmp/h5_b111.tar.gz` → 解压至 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（解压前 `index.html` 备份为 `index.bak_<ts>.html`） | `tar` 退出码 2，仅 root 属主目录 utime/chmod 告警，文件内容已更新 |
| 线上 chunk（C 端） | `https://e.joho.cn/assets/…` | `index-ncRLLn6V.js` 200 / 756981 B、`TrustSignatureCard.BU-u9aNY.js` 200 / 1563 B、`TrustSignatureCard-DdF_sL0o.css` 200 / 919 B、`pkg-order-pages-order-evaluate.UmlQE4B3.js` 200 / 6787 B、`pkg-product-pages-evaluate.C_cz_93R.js` 200 / 3338 B、`pkg-user-pages-my-reviews.Cy3iApJz.js` 200 / 3278 B、`order-evaluate-DmbNDPyP.css` 200 / 3254 B，体积与本地一致 |
| 外卖 C 端 | `node .secrets/deploy-waimai.mjs`（本地 `pnpm build:h5` → 校验 3851 KB → tar/scp → 服务器解压 + 备份轮转） | `https://www.yourbao.cn/waimai/` 返回 200；`pkg-order-pages-review-create.CZjriyrY.js` 正文含 `trustQuality` / `giftQuality` |
| 截图 | `docs/screenshots/waimai/p111-review-rules/` | 4 张（`01` 好评 / `02` 中评 / `03` 评价列表 / `04` 我的评价） |

## §112 外卖 C 端补接信任签名卡：店铺评价页 / 我的评价页（已上线）

**操作入口**：外卖 C 端 `https://www.yourbao.cn/waimai/` 店铺首页 ›「评论」Tab；「我的」› 我的评价。

§111 已给 C 端（vshop）三个评价页接上信任签名卡，但外卖 C 端（waimai-v39）只改了「写评价」页，店铺评价 Tab 与「我的评价」页仍是旧版式（§111.6 已知限制 2）。本节把这两页补齐，口径与 §111 完全一致：**质量 → 服务 → 时间 固定顺序**、**徽章缺数据即隐藏**。

### 112.1 交付清单

| 端 | 文件 | 改动 |
|---|---|---|
| 外卖 C 端组件 | `src/components/TrustSignatureCard.vue`（新建） | 三行固定顺序（`ROWS` 常量）+ 徽章（平均分 / 好评率 / 真实评价）；未传 `averageRating` / `goodRate` 时对应徽章隐藏 |
| 店铺评价 Tab | `src/pages/shop/menu.vue` | 评论面板顶部接入签名卡；徽章取 `channelReviewStats` 的 `averageRating` / `goodRate`，`totalCount = 0` 时传 `null`（不展示「0 分 / 0%」） |
| 我的评价 | `src/pkg-order/pages/my-reviews.vue` | 页面顶部接入签名卡（只读，仅「真实评价」徽章），位于加载态/空态之上 |
| 国际文案 | `src/locale/{zh-Hans,en}.json` | 新增 `reviewTrust` 块 10 键（`title` / `real` / `scoreUnit` / `goodRate` / `quality*` / `service*` / `time*`） |
| 截图 | `docs/screenshots/common-features-v43/` | 2 张 390×844 dpr2：`01` 店铺评价 Tab（canteen-a，有 1 条评价 → 三徽章）/ `02` 我的评价（仅「真实评价」） |

### 112.2 口径与契约

- **固定顺序**：`ROWS` 常量恒为「质量 → 服务 → 时间」，不随评分或数据动态排序。
- **纯前端文案**：三维文案、徽章均不读后端字段；后端 `review` 仍只有 `rating` / `tags` / `giftGranted`，本轮不新增字段与接口。
- **徽章**：平均分（`4 分`）、好评率（`好评率 100%`）、`真实评价`；缺数据即隐藏。店铺评价 Tab 的数据源是**整店（渠道）维度** `channelReviewStats`，不是单商品维度。
- **零数据不伪造**：`reviewStats.totalCount = 0` 时 `trustAvg` / `trustGoodRate` 计算为 `null`，只留「真实评价」徽章（canteen-b 无评价即此态）。
- **只读语义**：「我的评价」页只读展示信任承诺，不提供送礼/改进项交互（那两项只属于写评价页）。
- **与摘要卡共存**：店铺评价 Tab 的签名卡在评分摘要卡之上，摘要卡继续承担星级分布；两处数字同源同值。

### 112.3 权限与校验

- `channelReviewStats` / `channelReviews` 为 public（按 `vendure-token` 渠道），`myReviews` 走既有登录态；**无新增权限点**。
- 卡片为纯展示组件，不产生写操作，无入参校验需求；`averageRating` / `goodRate` 由页面按 `totalCount` 收口为 `null`。
- 无路由参数改动（两页均为固定入口）。

### 112.4 数据库变更

- **无**：未新增表/列，未新增 GraphQL 字段。

### 112.5 验证记录

| # | 用例 | 结果 |
|---|---|---|
| 1 | `npm run build:h5`（waimai-v39） | PASS（仅 sass `legacy-js-api` 弃用告警） |
| 2 | `npm test`（waimai-v39） | PASS（7 文件 / 87 用例全绿） |
| 3 | 店铺评价 Tab（canteen-a，1 条评价） | PASS（`信任签名=true / 真实评价=true / 好评率=true`；截图 `01` 徽章为「4 分 / 好评率 100% / 真实评价」，三行顺序正确） |
| 4 | 店铺评价 Tab（canteen-b，0 条评价） | PASS（只显示「真实评价」，不出现「0 分 / 0%」；空态文案正常） |
| 5 | 我的评价（登录态用户） | PASS（`信任签名=true / 真实评价=true / 好评率=false`，符合只读口径；3 条评价与筛选不受遮挡，截图 `02`） |
| 6 | 部署 | PASS（`deploy-waimai.mjs` 产物校验 3854 KB，`deploy done`） |
| 7 | 线上 chunk | PASS（清单见 112.7，体积与本地一致） |

截图取数方式：本地静态服务 `dist/build/h5`（挂在 `/waimai` 前缀）+ 同源 `POST /shop-api` 代理到 `https://www.yourbao.cn/shop-api`，真实数据直出，不做 mock。

### 112.6 边界与已知限制

1. 店铺评价 Tab 的徽章与评分摘要卡同屏展示均分/好评率，信息有重复；保留摘要卡是因为星级分布图仍需要它，若后续要合并需先定版式。
2. 「我的评价」页无统计口径（按用户维度不聚合评分），因此永远只有「真实评价」徽章，与 §111.6 第 5 条一致。
3. 三维文案仍是全店统一固定口径，不随店铺/商品差异（后端无字段支撑）。
4. 店铺评价 Tab 的统计按**渠道（整店）**口径，不是当前筛选 chip（有图/好评/差评）下的子集口径；切换筛选不会改变徽章数字。
5. §111.6 已知限制 2（外卖 C 端评价列表/我的评价未接入签名卡）**已收敛**，本节无新增限制。

### 112.7 部署记录

| 端 | 动作 | 结果 |
|---|---|---|
| 外卖 C 端 | `node .secrets/deploy-waimai.mjs`（本地 `pnpm build:h5` → 校验 3854 KB → tar/scp → 服务器解压 + 备份轮转） | `deploy done`；`https://www.yourbao.cn/waimai/` 200 |
| 线上 chunk | `https://www.yourbao.cn/waimai/assets/…` | `index-CzRMHcLX.js` 200 / 677456 B（与本地一致）、`pages-shop-menu.DjFq9wCB.js` 200 / 73013 B、`pkg-order-pages-my-reviews.txiKwfWy.js` 200 / 8712 B、`TrustSignatureCard.hRGW-oBM.js` 200 / 1512 B（正文含 `reviewTrust`）、`TrustSignatureCard-BrCLHOCA.css` 200 / 859 B、`my-reviews-D1D4h_W1.css` 200 / 4958 B |
| 截图 | `docs/screenshots/common-features-v43/` | 2 张（`01` 店铺评价 Tab / `02` 我的评价） |
| C 端（vshop） | 无需重新部署 | 本节仅改外卖 C 端；§111 验收脚本重跑 4 张截图字节无变化 |

















