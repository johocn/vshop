# 已知边界批次 C Implementation Plan（#3a 起提配置化 / #7 抽奖固定消耗·渠道配置共存）

**Goal:** 消化边界 #3 与 #7：余额提现起提金额从后端常量改为渠道级配置；抽奖消耗新增「固定每次消耗」模式（渠道级配置，null=按奖品 consume 现状，两模式共存可切换）。模式 A（用户 2026-10-12 确认）。

**Architecture:** 复用既有 Channel customFields 体系：`dev-config.ts` 定义 `minWithdrawalAmount` / `lotteryFixedCost`（int nullable，分/积分）；业务侧统一 `ctx.channel?.customFields` 读取（项目成熟模式，redemption/shop-template 同款）；`myUpdateChannelCustomFields`（cjk-plugin，无白名单限制）为租户写入通道。未配置一律回退现状行为（起提 1000 分 / 按奖品 consume）。

**Tech Stack:** Vendure 3.x、uni-app Vue3（vshop C端 + web-admin）。

**注意：** 五语言词条同步；数组/参数化文案规范；部署三端（vendure git pull+restart、C 端 tar→scp、web-admin deploy.mjs）。

---

### Task 1: 后端配置定义与读取（vendure）

**Files:**
- Modify: `packages/dev-server/dev-config.ts`（Channel customFields 加两字段）
- Modify: `packages/recharge-card-plugin/src/balance-withdrawal.service.ts`（request 校验读配置，回退 1000）
- Modify: `packages/recharge-card-plugin/src/balance-withdrawal.resolvers.ts` + `plugin.ts`（myBalanceWithFrozen 返回 minWithdrawalAmount）
- Modify: `packages/lottery-plugin/src/lottery.service.ts`（draw 固定消耗分支）+ `plugin.ts`（lotteryCostConfig 查询 + 类型）
- Modify: 两插件 e2e 补用例

- [ ] Step 1: dev-config Channel customFields：`minWithdrawalAmount`（int nullable，标签「提现起提金额(分)」）、`lotteryFixedCost`（int nullable，标签「抽奖每次固定消耗(积分)」）
- [ ] Step 2: recharge-card request：`minAmount = Number(ctx.channel?.customFields?.minWithdrawalAmount) > 0 ? ... : 1000`；myBalanceWithFrozen 返回三字段（resolver 读 channel customFields）
- [ ] Step 3: lottery draw：fixedCost 配置 >=0 且有限时进入固定模式（fixed>0 则 spendPoints；record.consume=fixed；抽奖结果不变）；新增 `lotteryCostConfig: { mode: 'perPrize'|'fixed', fixedCost: Int }` 未登录可访问
- [ ] Step 4: e2e：recharge-card 配置 5000 后 2000 拒/5000 过；lottery 固定 50 后中任意奖扣 50

### Task 2: C 端（vshop src）

**Files:**
- Modify: `src/api/queries/withdraw.ts`（myBalanceWithFrozen 带 minWithdrawalAmount）、lottery 查询（带 lotteryCostConfig）
- Modify: `src/pkg-user/pages/withdraw.vue`（动态起提提示 + 本地校验）
- Modify: `src/pkg-user/pages/lottery.vue`（fixed 模式：隐藏每格 consume、顶部统一「每次 X 积分」；结果弹窗固定消耗）
- Modify: 五语言 `src/i18n/locales/*.json`

- [ ] Step 1: withdraw.vue：`minWithdrawalAmount` 展示「最低 ¥N」+ 提交前本地校验 toast（后端校验仍兜底）
- [ ] Step 2: lottery.vue：costConfig fixed 模式 → 九宫格每格 consume 文案隐藏、转盘上方显示固定消耗；perPrize 模式渲染不变
- [ ] Step 3: 五语言新增 withdraw.minHint / lottery.fixedCostHint / lottery.resultConsumeFixed 等

### Task 3: web-admin

**Files:**
- Modify: `src/apis/channel.ts`（接口 + query 加字段）
- Modify: `src/pages/decorate/shop-info/index.vue`（表单加两输入框：起提金额(元)/抽奖固定消耗(积分)，空=不配置）
- Modify: `src/locale/{zh-Hans,en}.json`

- [ ] Step 1: channel.ts ChannelCustomFields 加 `minWithdrawalAmount` / `lotteryFixedCost`（number|null）
- [ ] Step 2: shop-info 表单两 cell（数字输入）+ onLoad 回填 + save payload（空串→null）

### Task 4: 收尾一气呵成

- [ ] Step 1: vendure tsc + e2e（recharge-card、lottery）；web-admin 构建；C 端 build:h5
- [ ] Step 2: 手册 batch3 补「十、已知边界批次 C」
- [ ] Step 3: 两仓提交推送 + 部署三端 + curl 200 验证
