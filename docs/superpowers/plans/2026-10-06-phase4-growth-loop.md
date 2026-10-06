# 四期「增长闭环」Implementation Plan（骑手钱包提现 + 评价有礼追评 + 看板增强）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline，串行) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性实施三个方向——骑手钱包与提现闭环、评价审核通过自动发券/积分 + 7 日追评、web-admin 经营看板四模块增强。

**Architecture:** 方向一在 campus-delivery-plugin 新增 `rider_withdrawal_request` 实体 + rider-wallet.service（余额冻结/退回复用 coupon-balance-port 的 addBalance/deductBalance，底座 = recharge-card-plugin 的 CustomerBalance/BalanceTransaction）；方向二在 review-plugin 的 approveReview 挂奖励钩子（grantCouponIssue + addPoints，Review 加 giftGranted 幂等字段）+ 追评窗口校验；方向三在 operations-plugin 补 4 个聚合查询（复用其 admin resolver 模式）。

**Tech Stack:** Vendure（NestJS/TypeORM）+ uni-app（waimai pkg-rider）+ uni-app（web-admin，useListPage/$wa- 范式）+ vitest 单测 + .secrets E2E 冒烟。

**规范:**
- C 端金额一律「分」存储、展示 ÷100 两位小数；新文案 zh/en i18n 同步
- 串行实施：每方向完成即构建部署验证，最后统一收口（截图 + 手册 + 三仓提交推送）
- 校准点：签名以实际代码为准（本计划给调用侧骨架，签名不符改代码不改结构）
- 共享文件（waimai pages.json / web-admin menus.ts / i18n）只在本计划各 Task 内集中改，避免并行冲突

---

## 第一章 骑手钱包与提现

### Task 1: rider-withdrawal 实体 + 插件注册

**Files:**
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-withdrawal.entity.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`（entities 数组注册）

- [ ] **Step 1: 实体**

```ts
// rider-withdrawal.entity.ts —— 参考 rider-earning.entity.ts 的写法
import { Column, Entity, Index } from 'typeorm';
import { VendureEntity } from '@vendure/core';

@Entity()
@Index(['channelId', 'status'])
export class RiderWithdrawalRequest extends VendureEntity {
    @Column() customerId: string;
    @Column() channelId: string;
    @Column('int') amount: number; // 分
    @Column() channel: string;     // 支付宝 / 微信
    @Column() account: string;     // 收款账号
    @Column({ default: 'PENDING' }) status: 'PENDING' | 'PAID' | 'REJECTED';
    @Column({ type: 'varchar', nullable: true }) remark: string | null;
    @Column({ type: 'varchar', nullable: true }) reviewedBy: string | null;
    @Column({ type: 'datetime', nullable: true }) reviewedAt: Date | null;
    constructor(input?: Partial<RiderWithdrawalRequest>) { super(input); }
}
```

- [ ] **Step 2: plugin entities 数组注册 + `build` 通过**

Run: `yarn build`（vendure 根，或该包的构建命令以 package.json 为准）

- [ ] **Step 3: Commit** `feat(rider): 骑手提现申请实体`

### Task 2: rider-wallet.service（shop-api 四接口）

**Files:**
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-wallet.service.ts`
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-wallet.service.spec.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-shop.resolver.ts`（或 hall-shop.resolver.ts——校准点：myRiderEarnings 挂在哪个 resolver 就挂哪个）

- [ ] **Step 1: 失败单测**（核心三断言）

```ts
// rider-wallet.service.spec.ts —— mock balance port 与 repo
it('withdraw 低于 ¥10 抛错');            // amount < 1000 → '最低提现金额为 ¥10'
it('withdraw 超过可提现余额抛错');        // available=5000, amount=6000 → 错误
it('withdraw 成功：创建 PENDING 申请并扣款冻结'); // balancePort.deductBalance 收到 -amount，repo 存 PENDING
it('reject 解冻退回：addBalance(+amount) 且状态 REJECTED');
```

- [ ] **Step 2: 服务实现**（核心逻辑）

```ts
// rider-wallet.service.ts
// 依赖：TransactionalConnection、coupon-balance-port 的余额端口（rider-task.service 同款注入方式，校准点看其 getCouponBalancePort 用法）
async myRiderWallet(ctx) {
    // 校验已认证骑手（复用 rider.service 的 requireRider 校准点）
    // available = balancePort.getBalance(customerId)
    // frozen = SUM(withdrawal.amount WHERE status='PENDING')
    // totalEarned = SUM(rider_earning.amount + tip WHERE riderCustomerId=me)
    return { available, frozen, totalEarned };
}
async riderBalanceHistory(ctx, skip, take)  // BalanceTransaction 分页倒序（校准点：recharge-card 的流水实体查询写法）
async riderWithdrawRequests(ctx, skip, take) // 本人申请倒序
async riderWithdraw(ctx, input: { amount, channel, account }) {
    // 1. 校验骑手 + amount>=1000 + amount<=available
    // 2. balancePort.deductBalance(customerId, amount, '提现冻结')
    // 3. repo.save(PENDING 申请)
}
async adminList(ctx, options) / adminApprove(ctx, id, remark) // PAID，仅留痕
async adminReject(ctx, id, remark)          // REJECTED + balancePort.addBalance(+amount, '提现驳回退回')
```

- [ ] **Step 3: 跑测试通过 + Commit** `feat(rider): 骑手钱包查询与提现申请（冻结/退回）`

### Task 3: 0 分成单 addBalance 清欠

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.ts:91-119`（校准点：以实际行号为准）

- [ ] **Step 1:** 送达结算处，`amount + tip === 0` 时跳过 `addBalance` 调用（仍写 RiderEarning？否——0 分成单不写 earning，仅 log）。加单测断言：0/0 分成不入账不抛错。
- [ ] **Step 2:** `yarn build` + 相关 spec 通过 + Commit `fix(rider): 0 分成单跳过余额入账避免抛错`

### Task 4: waimai 骑手端钱包页 + 提现页

**Files:**
- Create: `d:\zhao\waimai\src\api\queries\wallet.ts`
- Create: `d:\zhao\waimai\src\pkg-rider\pages\rider-wallet.vue`
- Create: `d:\zhao\waimai\src\pkg-rider\pages\rider-withdraw.vue`
- Modify: `d:\zhao\waimai\src\pages.json`（pkg-rider 分包注册两页）
- Modify: `d:\zhao\waimai\src\pkg-rider\pages\rider-home.vue`（收入卡加「去提现」入口）

- [ ] **Step 1: api 层**（照 rider.ts 模式：gql tag + getGraphQLClient().request）

```ts
// wallet.ts
myRiderWallet()          // { available frozen totalEarned }
riderBalanceHistory(skip, take)
riderWithdrawRequests(skip, take)
riderWithdraw(v: { amount: number; channel: string; account: string })
```

- [ ] **Step 2: rider-wallet.vue**（mockup 定稿版式：余额卡 available 大数字 + frozen/totalEarned 副行 + 申请提现按钮 + 收入明细/提现记录 tabs + 触底加载；金额 ÷100 展示；样式走 $wa-/*token* 既有变量）
- [ ] **Step 3: rider-withdraw.vue**（金额输入 + 收款渠道选择 + 账号输入 + 提交 → toast「申请已提交，等待审核」返回钱包页）
- [ ] **Step 4: pages.json 注册 + rider-home 入口**
- [ ] **Step 5: Commit** `feat(rider): 骑手钱包页与提现申请页`

### Task 5: web-admin 提现审核页

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\rider-withdraw.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\rider\withdraw\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`、`constants/menus.ts`（trade 或 campus 组）、`locale/zh-Hans.json`、`locale/en.json`

- [ ] **Step 1: api**（fetchReviewPage 同款模式：`riderWithdrawals({status, skip, take})` / `approveRiderWithdraw(id, remark)` / `rejectRiderWithdraw(id, remark)`）
- [ ] **Step 2: 审核页**（review/list/index.vue 同款骨架：四 tab 审核中默认/已打款/已驳回/全部 + 通过（确认弹窗）/驳回（editable 弹窗填原因）+ useListPage + $wa- 变量 + $t()）
- [ ] **Step 3: 菜单 + i18n（zh/en 同步）+ Commit** `feat(admin): 骑手提现审核页`

### Task 6: 第一章部署 + E2E 冒烟 + 截图

- [ ] **Step 1:** vendure 构建 + ssh joho git pull + pm2 restart；waimai `node .secrets/deploy-waimai.mjs`；web-admin `npm run deploy`（deploy.mjs）
- [ ] **Step 2:** 写 `waimai/.secrets/rider-withdraw-e2e.cjs`（参照 review-e2e-verify.cjs 模式，渠道 A 冒烟）：骑手认证 → 模拟分成入账 → myRiderWallet 断言 available → riderWithdraw 冻结断言（available 减少、frozen 增加）→ adminReject 退回断言（available 恢复）→ 再申请 → adminApprove → PAID 状态断言 → 清理（把测试申请留 PAID 不影响）
- [ ] **Step 3:** 手机截图 390×844 dpr=2：钱包页（余额卡+明细）、提现记录 tab、web-admin 提现审核页（1440）→ `docs/screenshots/waimai/12-1..3-*.png`
- [ ] **Step 4:** Commit 冒烟脚本（.secrets 不入库则跳过）+ 部署产物差异按需补提交

---

## 第二章 评价有礼 + 追评

### Task 7: 渠道评价奖励配置 + giftGranted 字段 + approveReview 钩子

**Files:**
- Modify: `d:\zhao\vendure\packages\review-plugin\src\review-plugin.ts`（plugin options 或 schema 扩展，校准点：渠道配置读法参照 campusStoreConfigs 模式或直接用 Channel customFields）
- Modify: `d:\zhao\vendure\packages\review-plugin\src\review.entity.ts`（加 `giftGranted: boolean default false`）
- Modify: `d:\zhao\vendure\packages\review-plugin\src\review.service.ts:285-303`（approveReview 钩子）
- Test: `review-plugin/src/review.service.spec.ts`（追加用例）

- [ ] **Step 1: 失败单测**

```ts
it('approve 主评且配置开启 → 发券+积分且 giftGranted=true');   // mock CouponService.grantCouponIssue + MemberLevelService.addPoints
it('重复 approve 幂等：giftGranted=true 不再发');
it('未配置模板/积分为 0 → 只流转状态不发奖');
it('追评 approve 不发奖');
```

- [ ] **Step 2: 实现**（校准点：`grantCouponIssue` 与 `addPoints` 实际签名见 `coupon.service.ts:789-852` / `member-level.service.ts:178-233`；通过 Injector 懒获取避免循环依赖——参照 pickup-eligibility-checker.ts 的 injector.get 模式）

```ts
// approveReview 内，状态置 approved 之后：
if (!review.parentId && !review.giftGranted) {
    const cfg = await this.getGiftConfig(ctx); // { couponTemplateId, points }
    if (cfg.couponTemplateId) { await this.couponService.grantCouponIssue(ctx, {...}); }
    if (cfg.points > 0) { await this.pointsService.addPoints(ctx, customerId, cfg.points, '评价奖励'); }
    review.giftGranted = true; // 任一成功即标记；失败 log warn 不阻塞
}
```

- [ ] **Step 3:** 测试通过 + build + Commit `feat(review): 评价审核通过自动发券/积分（幂等）`

### Task 8: 追评窗口 + followUps 嵌套

**Files:**
- Modify: `review-plugin/src/review.service.ts:174-218`（createFollowUpReview 窗口校验）
- Modify: `review-plugin/src/review-query*`（channelReviews 主评带 followUps，校准点：现有查询文件）

- [ ] **Step 1:** createFollowUpReview 校验：主评 status=approved 且 `now - 主评审核时间 ≤ followUpWindowDays`（默认 7，配置读取与 Task 7 同源）；已删主评不可追评。单测 3 条（窗口内/窗口外/追评的追评）。
- [ ] **Step 2:** channelReviews 主评带 `followUps`（approved 且非删，按时间正序）。
- [ ] **Step 3:** 测试 + Commit `feat(review): 追评窗口校验与嵌套展示`

### Task 9: waimai 评价有礼 + 追评入口

**Files:**
- Modify: `d:\zhao\waimai\src\pkg-order\pages\review-create.vue`（追评模式：query 带 `followUp=1&reviewId=` 时隐藏星级/标签，标题「追加评价」，提交调 createFollowUpReview）
- Modify: `d:\zhao\waimai\src\pkg-order\pages\my-reviews.vue`（已通过主评 + 窗口内显示「追评」按钮；列表项渲染商家回复已有）
- Modify: `d:\zhao\waimai\src\pages\shop\menu.vue`（评论项主评下渲染 followUps 气泡，样式复用商家回复气泡）
- Modify: `d:\zhao\waimai\src\api\queries\waimai.ts`（channelReviews 补 followUps 字段）

- [ ] **Step 1-3:** 按文件逐个改（追评模式 UI 校准点：review-create 现有 props/路由参数）
- [ ] **Step 4:** Commit `feat(review): 追评入口与评论流追评气泡`

### Task 10: 第二章部署 + E2E + 截图

- [ ] **Step 1:** vendure 部署 + waimai 部署；扩展 `review-e2e-verify.cjs`：approve 后断言发券（myCustomerCoupons 出现）+ giftGranted 幂等（再 approve 不重复）+ 追评创建 pending → approve → channelReviews followUps 可见
- [ ] **Step 2:** 手机截图：追评入口/追评提交页/评论 tab 追评气泡 → `13-1..3-*.png`
- [ ] **Step 3:** Commit 冒烟扩展

---

## 第三章 经营看板增强

### Task 11: operations-plugin 4 个聚合查询

**Files:**
- Modify: `d:\zhao\vendure\packages\operations-plugin\src\operations.plugin.ts:111-113` 附近 schema
- Modify: `d:\zhao\vendure\packages\operations-plugin\src\operations-admin.resolver.ts` + 对应 service
- Test: operations-plugin 既有 spec 追加

- [ ] **Step 1: schema**

```graphql
repurchaseRate(days: Int!): Float!          # ≥2 单客户 / 有单客户
reviewOverview: ReviewOverview!             # { avgRating badRate pendingCount withImagesRate }
productSalesTop(days: Int!, take: Int): [ProductSalesItem!]!  # { productId name quantity amount }
riderEfficiency(days: Int!, take: Int): [RiderEfficiencyItem!]! # { customerId name completed onTimeRate }
```

- [ ] **Step 2: 实现**（校准点：dashboardOverview/salesTrend 的聚合写法——同款 TransactionalConnection 原生 SQL/QueryBuilder；riderEfficiency 查 campus-delivery 的任务表，跨插件用 connection.getRepository 即可；渠道隔离沿用现有 resolver 的 ctx.channelId 过滤）
- [ ] **Step 3:** 单测（repo mock 固定聚合数）+ build + Commit `feat(operations): 复购率/评价概览/热销榜/骑手效率聚合`

### Task 12: web-admin 看板模块

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\stats.ts`（新增 4 个 fetch）
- Modify: `d:\zhao\vshop\web-admin\src\pages\data\dashboard\index.vue`（KPI 加复购率/评价均分；卡片加热销 Top5 横条/骑手效率榜/评价概览；版式按 mockup，tag「新」不需要——那是 mockup 标注）
- Modify: `locale/zh-Hans.json` / `en.json`

- [ ] **Step 1:** api + 页面 + i18n（复用 stat-card/card 样式类）
- [ ] **Step 2:** 构建 `npm run build:h5` + Commit `feat(admin): 经营看板四模块`

### Task 13: 第三章部署 + 验证

- [ ] vendure 部署 + web-admin 部署（nginx reload）→ 线上 dashboard 目检（Playwright 1440 截图 `14-1-dashboard.png`）→ Commit

---

## 第四章 收口

### Task 14: 手册 + 三仓提交推送

- [ ] `docs/waimai-操作手册.md` 加「8. 四期：增长闭环」章节（钱包/提现流程图、评价奖励规则、看板说明 + 截图 12-x/13-x/14-1）
- [ ] 三仓 git status → 提交推送（vendure：campus-delivery/review/operations 三插件；waimai：pkg-rider 钱包 + 评价追评；vshop：web-admin + docs）
- [ ] 汇总回复用户（实现清单 + E2E 结果 + 截图索引）
