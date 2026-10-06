# 四期「增长闭环」设计 Spec（骑手钱包提现 + 评价有礼追评 + 经营看板增强）

> **For agentic workers:** 本 spec 经用户确认（2026-10-06），版式 mockup 已预览定稿。实施计划见 `docs/superpowers/plans/` 同日文档。

**Goal:** 一次性实施三个方向，补齐骑手收入闭环、放大评价系统运营价值、增强管理端经营洞察。

**总原则:** 最大化复用既有底座（余额/流水、定向发券、积分、追评实体、看板框架），YAGNI 砍掉自动打款/手续费/追评奖励/看板导出。所有用户可见文案走 i18n（zh/en 同步），C 端金额一律「分」存储、展示 ÷100 两位小数。

---

## 方向一：骑手钱包与提现

### 数据模型（campus-delivery-plugin 新建）
`rider_withdrawal_request`：
| 字段 | 类型 | 说明 |
|---|---|---|
| id | ID | |
| customerId | varchar | 骑手（=Customer） |
| channelId | varchar | 渠道隔离 |
| amount | int | 分 |
| channel | varchar | 收款渠道（支付宝/微信） |
| account | varchar | 收款账号 |
| status | varchar | PENDING → PAID / REJECTED |
| remark | varchar nullable | admin 备注（驳回原因） |
| reviewedBy / reviewedAt | nullable | 审核留痕 |

### 余额与流水（零新建）
- 复用 `CustomerBalance`（recharge-card-plugin）+ `BalanceTransaction` 流水；骑手分成入账链路已接 `coupon-balance-port` 的 `addBalance`。
- 申请提现：`deductBalance(-amount)` 记流水「提现冻结」；驳回：`addBalance(+amount)` 记流水「提现驳回退回」；通过打款：仅状态流转（线下打款），无余额变动。

### shop-api（骑手端）
- `myRiderWallet { available frozen totalEarned }`——汇总 CustomerBalance + 冻结中的提现申请合计
- `riderBalanceHistory(skip, take)` → BalanceTransaction 分页
- `riderWithdrawRequests(skip, take)` → 本人提现申请
- `riderWithdraw(input { amount, channel, account })`——校验：已认证骑手 / amount ≥ 1000 分（¥10）/ ≤ 可提现余额；事务内创建 PENDING 申请 + 冻结扣款

### admin-api（web-admin）
- `riderWithdrawals(options { status, skip, take })`
- `approveRiderWithdraw(id, remark)` → PAID（线下打款后操作）
- `rejectRiderWithdraw(id, remark)` → REJECTED + 自动解冻退回（addBalance）

### 前端
- waimai `pkg-rider/pages/rider-wallet.vue`：余额卡（可提现/冻结/累计）+ 提现按钮 + 明细/提现记录 tabs（mockup 定稿版式）；`rider-withdraw.vue`：金额 + 收款渠道 + 账号表单
- rider-home 收入卡加「去提现」入口
- web-admin `pages/rider/withdraw/index.vue`：四 tab（审核中/已打款/已驳回/全部）+ 通过/驳回操作（驳回弹窗填原因），菜单入口 + i18n

### 顺带清欠
修复「0 分成单 addBalance 抛错」：`rider-task.service.ts` 送达结算处 amount+tip=0 时跳过余额入账。

---

## 方向二：评价有礼 + 追评

### 配置（渠道级 customFields，复用 campusStoreConfig 模式）
- `reviewGiftCouponTemplateId`（发券模板，空 = 关闭）
- `reviewGiftPoints`（int，0 = 不发积分）
- `followUpWindowDays`（默认 7）

### 奖励钩子（review-plugin）
- `approveReview` 通过时：主评 && 渠道开启奖励 && 该 review 未发过奖 → `grantCouponIssue`（coupon-plugin 定向发券）+ `addPoints`（member-level-plugin）；失败仅 log 不阻塞审核
- 幂等：Review 加 `giftGranted` boolean 字段；驳回后改判通过补发
- 追评不触发任何奖励

### 追评
- 后端 `createFollowUpReview` 已存在（parentId 关联）：补窗口校验（主评 approved 后 ≤ followUpWindowDays）；追评默认 pending 走先审后显
- `channelReviews` 返回主评时带 `followUps: [...]`（已审核的）
- 前端 waimai：my-reviews 已通过主评显示「追评」入口（窗口内）→ 复用 review-create 页追评模式（纯文字+图，无星级/标签）；menu 评论 tab 主评下渲染追评气泡；评价创建成功 toast 提示奖励规则
- web-admin 评价管理：追评行显示所属主评摘要（parentId → 主评内容前 20 字）

---

## 方向三：经营看板增强

### 后端聚合查询（admin-api，挂在现有 stats 服务所在插件）
- `repurchaseRate(days)`：窗口内 ≥2 单客户数 / 有单客户数
- `reviewOverview`：均分 / 差评率(rating≤3) / 待审数 / 有图占比（review 表聚合）
- `productSalesTop(days, take)`：order lines 聚合（数量+金额）
- `riderEfficiency(days, take)`：campus 任务完成数 + 准时率（按骑手）

### 前端（web-admin data/dashboard 增量）
- KPI 加：复购率(30天)、评价均分
- 卡片加：商品热销 Top5（横条）、骑手效率榜(7天)（排名列表）、评价概览（3 行指标）
- 复用既有 stat-card/card 样式范式；版式按 mockup 定稿

---

## 实施策略与验收
1. 一份实施计划（3 章），串行分方向实施：每方向完成后端单测/冒烟 → 三端构建部署 → 手机截图（390×844 dpr=2）
2. 全部完成后：手册补四期章节、三仓提交推送（一气呵成）
3. 验收：方向一骑手提现全链路 E2E（申请→冻结→驳回退回/通过打款）；方向二评价通过自动发券幂等 + 追评窗口与复审；方向三看板接口返回真实聚合数据
4. **明确不做**：自动打款/微信商家转账、提现手续费、追评奖励、看板数据导出、评价奖励的积分商城兑换页
