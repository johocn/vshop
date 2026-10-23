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


