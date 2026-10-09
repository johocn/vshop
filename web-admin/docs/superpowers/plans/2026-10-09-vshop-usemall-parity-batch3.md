# usemall→vshop 批次 3 补齐 实施计划（F05 余额提现 / F11 常见问题与意见反馈 / F19 购物圈 / F20 积分抽奖）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 usemall 相对 vshop 缺失的 4 个特性：余额提现（F05）、常见问题+意见反馈（F11）、购物圈（F19）、积分抽奖（F20）。前两者复用/新建后端能力，后两个新建 vendure 插件；每个特性含 后端+e2e → C 端页 → web-admin 管理页 全链路。

**Architecture:** F05 扩展 recharge-card-plugin：复用 `CustomerBalance`（balance+frozenBalance，@Unique customer+channel）+ `BalanceTransaction`（type 枚举已含 freeze/unfreeze），新增 `BalanceWithdrawalRequest` 实体与三态机——状态机与原子扣减**逐行仿** distribution-plugin `WithdrawalService`（带原状态条件的原子更新防重复回补；Postgres camelCase 列需双引号）。F11/F19/F20 新建插件，骨架全件套仿 checkin-plugin；F20 经**直注** `MemberLevelService.spendPoints`（checkin-plugin 已验证此软依赖桥可用）扣积分。生产建表依赖 dev-config postgres 分支 `synchronize: true`（dev-config.ts:547），新实体自动建表、无需 migration。

**Tech Stack:** Vendure 3.6.4（npm workspaces + lerna，lib 产物入库）+ vshop uni-app C 端 + web-admin uni-app 手机后台。提交横跨 `d:\zhao\vendure` 与 `d:\zhao\vshop` 两仓。

设计依据：[2026-10-09-vshop-usemall-parity-design.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-design.md) ｜ 矩阵：[2026-10-09-vshop-usemall-parity-matrix.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md)

---

## 0. 前置事实与执行口径（已一手核实，写代码前不要再猜）

**两仓提交规范**
1. 中文 message、临时文件 `git commit -F`（`[IO.File]::WriteAllText($p,$m,[Text.UTF8Encoding]::new($false))`）、PowerShell 5.1 禁止 `&&`、只 add 本 Task 文件。
2. **2026-10-08 教训**：新实体 Date 列一律省略 type（`@Column({ nullable: true })`）或 `type:'timestamp'`，**禁止 `type:'datetime'`**。
3. vendure 包 e2e 跑前删缓存：`Remove-Item -Recurse -Force <pkg>\e2e\__data__ -ErrorAction SilentlyContinue`。

**已核实的参照系（写各 Task 前仍须 Read 基准文件，但结构以此为准）**
4. F05 余额体系：`packages/recharge-card-plugin/src/customer-balance.entity.ts`（customerId/channelId/balance/frozenBalance，`@Unique(['customer','channel'])`）；`balance-transaction.entity.ts`（`BalanceTransactionType` 已含 `FREEZE/UNFREEZE`，amount 语义=balance 变化量、balanceBefore/After 快照，金额单位**分**）。shop-api 已有 `myRechargeBalance`/`myRechargeHistory`。
5. F05 状态机范本：`packages/distribution-plugin/src/withdrawal.service.ts`——①原子条件扣减 `.update().set({ balance: () => '"balance" - X' }).where('id=:id').andWhere('"balance" >= X')`（**camelCase 列必须双引号**，affected===0 抛余额不足）②`transition(ctx,id,from,patch)` 带原状态条件更新防重复流转 ③reject 时解冻回补、markPaid 时冻结出账。admin SDL 全文模式见 `distribution-plugin/src/plugin.ts:30-110`（`implements Node` + `PaginatedList` + `ListOptions` input）。
6. F20 积分桥：`packages/member-level-plugin/src/member-level.service.ts:201` `spendPoints(ctx, customerId, amount, orderId?, remark?)` → 扣失败抛 `UserInputError`，成功返回新余额；余额不足由调用方透传错误。**直注可行**：checkin-plugin `checkin.service.ts:13,64` 即直接 `private memberService: MemberLevelService`（无 exports 声明，Nest 上下文可注入），e2e 配置同时 `MemberLevelPlugin.init({}) + 本插件.init({})`。peerDependencies 仿 `packages/checkin-plugin/package.json`（`"@vendure/member-level-plugin": "^0.0.1"`）。
7. 新插件全件套 = checkin-plugin 布局：`src/{plugin.ts,constants.ts,types.ts,*.entity.ts,*.service.ts,*.resolver.ts}` + 根 `index.ts`（re-export）+ `package.json`（main/types 指 lib，e2e script `cross-env PACKAGE=<name> vitest --config vitest.config.mts --run`）+ `tsconfig.json`（extends 根，outDir lib，include `["src","index.ts"]`）+ `vitest.config.mts`（include `**/*.e2e-spec.ts`）。gql 内联用 `const { gql } = require('graphql-tag');`（checkin 式）或 `import gql from 'graphql-tag'`（distribution 式），二选一保持包内一致。
8. e2e 模板：`packages/checkin-plugin/e2e/checkin.e2e-spec.ts`——sqljs initializer + `mergeConfig(testConfig(), { plugins:[...], paymentOptions:{...} })` + `server.init({ initialData, productsCsvPath: '../../core/e2e/fixtures/e2e-products-minimal.csv', customerCount: 1 })` + `shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com','test')`。
9. **生产建表**：dev-config postgres 分支 `synchronize: true`（dev-config.ts:547）→ 新实体部署后自动建表，无需 migration；部署后以 introspection 验证新类型。dev-config 注册点：import 区（L32-75 一带）+ `plugins:` 数组（L332 起；`MemberLevelPlugin.init()` L474、`CheckinPlugin.init()` L478 附近插入）。
10. **vendure 部署**（deploy-plan.md）：本地 `npm run build`（lerna）→ `node deploy-pack.js` → `tar -czf vendure-prod.tar.gz vendure-prod/` → scp → 服务器 sudo 解压 + `npm install --production --legacy-peer-deps` + `pm2 restart`；**服务器不跑 tsc**。⚠️ `deploy-pack.js` 的 `PLUGINS` 清单已过期（缺 member-level/checkin/review/favorite/coupon 等），Task 9 按当时 dev-config 插件清单全量对齐 + 新增本批 3 包。
11. web-admin 模式：审核页模板 `src/pages/rider/withdraw/index.vue`（tabs + `useListPage` + `uni.showModal` 通过/驳回 + `fenToYuanFixed`）；API 文件模板 `src/apis/rider-withdraw.ts`（take+1 探页）与 `src/apis/groupBuy.ts`（`getAdminClient()` + interface + `graphQlErrorMsg`）；菜单唯一数据源 `src/constants/menus.ts`（marketing 组 L95-107、distribution 组 L109-116）；locale 双语 `src/locale/zh-Hans.json`+`en.json` 同步补 key。
12. C 端模式：API `src/api/queries|mutations/<域>.ts`（`getGraphQLClient()` 裸字符串 query，参照 `api/queries/member.ts`）；页面 `usePagination` + `EmptyState`（参照 `pkg-user/pages/balance-history.vue`）；图片上传 `uploadCustomerAsset()`（`api/mutations/upload.ts`，售后凭证同款 multipart 规范）；入口 `src/pages/profile/index.vue` 菜单 `navTo('/pkg-x/pages/y')`；路由 `src/pages.json` subPackages 平铺注册。**C 端文案跟随批次 1 既有页面做法硬编码中文**（相邻页面一致，i18n 改造另立任务），web-admin 走 locale key。
13. usemall 参照页：FAQ `sub-user/pages/setting/faq.vue`（type 横滑 tab 过滤，state='启用'）；反馈 `setting/feedback.vue`（类型+标题≤20+内容+图片+联系方式≤30）；抽奖 `sub-user/pages/integral/lottery.vue`（**服务端开奖返回 prizeIndex**，每次消耗 consume_integral，奖品 id/name/img）；购物圈发布 `sub-shopping/pages/note.vue`（标题≤50+正文+图片/视频+关联商品）。
14. **F19 命名规避**：vendure 已有 community-plugin（社区团购语义），购物圈一律用 `shopping-circle-plugin` / `CirclePost` / `circleXxx` 命名，禁止 community/circle-plugin 字样。

**C 端页面路由规划（本批新增）**

| 特性 | C 端页（vshop 仓 src/） | web-admin 页（web-admin 仓内 src/） | 菜单归属 |
|---|---|---|---|
| F05 | `pkg-user/pages/withdraw.vue` | `pages/balance/withdraw/index.vue` | distribution 组 |
| F11 | `pkg-user/pages/faq.vue`、`pkg-user/pages/feedback.vue` | `pages/feedback/faq/index.vue`、`pages/feedback/list/index.vue` | marketing 组 |
| F19 | `pkg-circle/pages/feed.vue`、`pkg-circle/pages/detail.vue`、`pkg-circle/pages/publish.vue` | `pages/circle/posts/index.vue` | marketing 组 |
| F20 | `pkg-user/pages/lottery.vue` | `pages/lottery/prizes/index.vue` | marketing 组 |

---

## Task 1: F05 后端 —— recharge-card-plugin 余额提现（实体 + 服务 + 双端 resolver + e2e）

**Files:**
- Create: `d:\zhao\vendure\packages\recharge-card-plugin\src\balance-withdrawal-request.entity.ts`
- Create: `d:\zhao\vendure\packages\recharge-card-plugin\src\balance-withdrawal.service.ts`
- Create: `d:\zhao\vendure\packages\recharge-card-plugin\src\balance-withdrawal.resolvers.ts`（admin+shop resolver 同文件，小而内聚）
- Modify: `d:\zhao\vendure\packages\recharge-card-plugin\src\plugin.ts`（挂实体/服务/resolver/SDL）
- Modify: `d:\zhao\vendure\packages\recharge-card-plugin\index.ts`（re-export）
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`（无需改：插件已注册；仅备忘）
- Test: `d:\zhao\vendure\packages\recharge-card-plugin\e2e\balance-withdrawal.e2e-spec.ts`

- [ ] **Step 1: 读基准文件**

Read `withdrawal.service.ts`（distribution）、`recharge-card.service.ts` 的 `addBalance`（BalanceTransaction 写入口径）、`recharge-card-shop.resolver.ts`、`plugin.ts`（recharge-card）、`e2e/recharge-card.e2e-spec.ts` 全文。

- [ ] **Step 2: 实体**

```ts
import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity()
export class BalanceWithdrawalRequest extends VendureEntity {
    constructor(input?: DeepPartial<BalanceWithdrawalRequest>) {
        super(input);
    }

    @Column() customerId: number;

    @Column({ type: 'int' }) amount: number; // 分

    @Column({ type: 'varchar' }) method: 'wechat' | 'alipay' | 'bank';

    @Column({ type: 'text' }) accountInfo: string; // 收款账号明文（展示与打款用）

    @Column({ type: 'varchar', default: 'pending' }) status: 'pending' | 'approved' | 'rejected' | 'paid';

    @Column({ type: 'text', nullable: true }) remark: string | null;

    @Column({ nullable: true }) reviewedAt: Date;   // 日期列省略 type（2026-10-08 教训）

    @Column({ nullable: true }) paidAt: Date;

    @ManyToOne(() => Channel) channel: Channel;

    @Column() channelId: number;
}
```

- [ ] **Step 3: 服务（逐行仿 WithdrawalService 三态机）**

```ts
import { Injectable } from '@nestjs/common';
import { ID, ListQueryBuilder, ListQueryOptions, Logger, PaginatedList, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { loggerCtx } from './constants';
import { BalanceTransaction, BalanceTransactionType } from './balance-transaction.entity';
import { BalanceWithdrawalRequest } from './balance-withdrawal-request.entity';
import { CustomerBalance } from './customer-balance.entity';

@Injectable()
export class BalanceWithdrawalService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    private async getBalanceRow(ctx: RequestContext, customerId: number): Promise<CustomerBalance> {
        const repo = this.connection.getRepository(ctx, CustomerBalance);
        let row = await repo.findOne({ where: { customerId, channelId: ctx.channelId as any } });
        if (!row) {
            row = await repo.save({ customerId, channelId: ctx.channelId, balance: 0, frozenBalance: 0 } as any);
        }
        return row;
    }

    async myBalance(ctx: RequestContext, customerId?: number): Promise<{ balance: number; frozenBalance: number }> {
        const cid = customerId ?? (await this.requireCustomerId(ctx));
        const row = await this.getBalanceRow(ctx, cid);
        return { balance: row.balance, frozenBalance: row.frozenBalance };
    }

    async findMyRequests(ctx: RequestContext, options?: ListQueryOptions<BalanceWithdrawalRequest>): Promise<PaginatedList<BalanceWithdrawalRequest>> {
        const cid = await this.requireCustomerId(ctx);
        return this.listQueryBuilder
            .build(BalanceWithdrawalRequest, options, { ctx, channelId: ctx.channelId, where: { customerId: cid } as any })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    async findAll(ctx: RequestContext, options?: ListQueryOptions<BalanceWithdrawalRequest>): Promise<PaginatedList<BalanceWithdrawalRequest>> {
        return this.listQueryBuilder
            .build(BalanceWithdrawalRequest, options, { ctx, channelId: ctx.channelId })
            .getManyAndCount();
    }

    /** 申请提现：原子条件扣减 balance 并入 frozenBalance（仿 distribution withdrawal.service.ts:77-90） */
    async request(ctx: RequestContext, amount: number, method: 'wechat' | 'alipay' | 'bank', accountInfo: string): Promise<BalanceWithdrawalRequest> {
        const minAmount = 1000; // 分，¥10 起提（可在后续按 Channel customFields 开放配置）
        if (!Number.isInteger(amount) || amount <= 0) throw new UserInputError('Invalid withdrawal amount');
        if (amount < minAmount) throw new UserInputError(`Minimum withdrawal amount is ${minAmount} (cents)`);
        if (!accountInfo?.trim()) throw new UserInputError('accountInfo is required');
        const cid = await this.requireCustomerId(ctx);

        // 余额为 0 的顾客不建行直接拒绝（getBalanceRow 会建 0 行，扣减自然失败，此处先查避免无谓建行）
        const row = await this.connection.getRepository(ctx, CustomerBalance).findOne({ where: { customerId: cid, channelId: ctx.channelId as any } });
        if (!row) throw new UserInputError('Insufficient balance');

        // 原子条件扣减：camelCase 列 Postgres 下必须双引号
        const claim = await this.connection.getRepository(ctx, CustomerBalance)
            .createQueryBuilder()
            .update(CustomerBalance)
            .set({ balance: () => `"balance" - ${amount}`, frozenBalance: () => `"frozenBalance" + ${amount}` })
            .where('id = :id', { id: row.id })
            .andWhere(`"balance" >= ${amount}`)
            .execute();
        if (claim.affected === 0) throw new UserInputError('Insufficient balance');

        const after = await this.connection.getRepository(ctx, CustomerBalance).findOneByOrFail({ id: row.id });
        await this.connection.getRepository(ctx, BalanceTransaction).save({
            customerId: cid, type: BalanceTransactionType.FREEZE, amount: -amount,
            balanceBefore: row.balance, balanceAfter: after.balance, remark: '提现冻结', channelId: ctx.channelId,
        } as any);

        const saved = await this.connection.getRepository(ctx, BalanceWithdrawalRequest).save({
            customerId: cid, amount, method, accountInfo: accountInfo.trim(), status: 'pending',
            channel: { id: ctx.channelId }, channelId: ctx.channelId,
        } as any);
        Logger.info(`Balance withdrawal ${saved.id} requested by customer ${cid}, amount ${amount}`, loggerCtx);
        return saved;
    }

    /** 状态流转：pending→approved→paid；pending/approved→rejected。带原状态条件的原子更新防重复（仿 withdrawal.service.ts:114-138） */
    private async transition(ctx: RequestContext, id: ID, from: Array<BalanceWithdrawalRequest['status']>, patch: Partial<Pick<BalanceWithdrawalRequest, 'status' | 'reviewedAt' | 'paidAt' | 'remark'>>): Promise<BalanceWithdrawalRequest> {
        const repo = this.connection.getRepository(ctx, BalanceWithdrawalRequest);
        const claim = await repo.createQueryBuilder()
            .update(BalanceWithdrawalRequest)
            .set(patch as any)
            .where('id = :id', { id })
            .andWhere('status IN (:...from)', { from })
            .execute();
        const request = await repo.findOne({ where: { id } as any });
        if (!request) throw new Error(`BalanceWithdrawalRequest ${id} not found`);
        if (!claim.affected) throw new UserInputError(`Withdrawal ${id} is ${request.status}, cannot be marked as ${patch.status}`);
        return request;
    }

    async approve(ctx: RequestContext, id: ID, remark?: string): Promise<BalanceWithdrawalRequest> {
        return this.transition(ctx, id, ['pending'], { status: 'approved', reviewedAt: new Date(), remark: remark ?? null });
    }

    /** 驳回：解冻回补 balance，写 UNFREEZE 流水（transition 只成功一次 → 不会重复回补） */
    async reject(ctx: RequestContext, id: ID, remark?: string): Promise<BalanceWithdrawalRequest> {
        const request = await this.transition(ctx, id, ['pending', 'approved'], { status: 'rejected', reviewedAt: new Date(), remark: remark ?? '驳回' });
        const row = await this.connection.getRepository(ctx, CustomerBalance).findOneByOrFail({ customerId: request.customerId, channelId: request.channelId as any });
        const before = row.balance;
        row.frozenBalance -= request.amount;
        row.balance += request.amount;
        await this.connection.getRepository(ctx, CustomerBalance).save(row);
        await this.connection.getRepository(ctx, BalanceTransaction).save({
            customerId: request.customerId, type: BalanceTransactionType.UNFREEZE, amount: request.amount,
            balanceBefore: before, balanceAfter: row.balance, remark: '提现驳回退回', channelId: request.channelId,
        } as any);
        return request;
    }

    /** 打款完成：冻结出账（balance 不变，无流水） */
    async markPaid(ctx: RequestContext, id: ID): Promise<BalanceWithdrawalRequest> {
        const request = await this.transition(ctx, id, ['approved'], { status: 'paid', paidAt: new Date() });
        const row = await this.connection.getRepository(ctx, CustomerBalance).findOneByOrFail({ customerId: request.customerId, channelId: request.channelId as any });
        row.frozenBalance -= request.amount;
        await this.connection.getRepository(ctx, CustomerBalance).save(row);
        return request;
    }

    private async requireCustomerId(ctx: RequestContext): Promise<number> {
        if (!ctx.activeUserId) throw new UserInputError('Must be logged in');
        return ctx.activeUserId as unknown as number; // 与 recharge-card.service.ts resolveCustomerId 口径对齐——执行时 Read 该函数：若其用 customerService 换 Customer.id，则此处照抄同款解析
    }
}
```

> ⚠️ `requireCustomerId` **必须**在 Step 1 读 `recharge-card.service.ts` 的 `resolveCustomerId`（L121-133，`customerService.findOneByUserId` 解析 Customer.id）后照抄同款实现（可将其改为 public 或在本服务复制），确保与既有余额键一致——这是余额体系最容易踩的坑（User.id vs Customer.id 混用导致流水分裂）。

- [ ] **Step 4: plugin.ts 挂载（SDL + resolvers）**

在 `recharge-card-plugin/src/plugin.ts`：entities 数组加 `BalanceWithdrawalRequest`；providers 加 `BalanceWithdrawalService`；shopApiExtensions.schema 追加（保留既有内容）：

```ts
type BalanceWithdrawalRequest implements Node { id: ID! customerId: ID! amount: Int! method: String! accountInfo: String! status: String! remark: String reviewedAt: DateTime paidAt: DateTime createdAt: DateTime! }
type BalanceWithdrawalList implements PaginatedList { items: [BalanceWithdrawalRequest!]! totalItems: Int! }
type MyBalanceWithFrozen { balance: Int! frozenBalance: Int! }
input BalanceWithdrawalListOptions
extend type Query {
    myBalanceWithFrozen: MyBalanceWithFrozen!
    myBalanceWithdrawals(options: BalanceWithdrawalListOptions): BalanceWithdrawalList!
}
extend type Mutation { requestBalanceWithdrawal(amount: Int!, method: String!, accountInfo: String!): BalanceWithdrawalRequest! }
```

adminApiExtensions.schema 追加同款 type/List/Options +：

```ts
extend type Query { balanceWithdrawals(options: BalanceWithdrawalListOptions): BalanceWithdrawalList! }
extend type Mutation {
    approveBalanceWithdrawal(id: ID!, remark: String): BalanceWithdrawalRequest!
    rejectBalanceWithdrawal(id: ID!, remark: String): BalanceWithdrawalRequest!
    markBalanceWithdrawalPaid(id: ID!): BalanceWithdrawalRequest!
}
```

（type 内字段按实体与既有 admin SDL 风格合并进现有模板字符串；resolver 文件两套 @Resolver() 类分别挂 Query/Mutation，mutation 加 `@Transaction()`，admin 端不加 `@Allow(Permission.Authenticated)`、shop 端加——仿 `checkin-shop.resolver.ts`。）

- [ ] **Step 5: e2e**

新建 `e2e/balance-withdrawal.e2e-spec.ts`（模板=同包既有 spec 头部 + 下方用例）：

```ts
it('withdrawal lifecycle: request freezes balance, reject refunds, approve+paid clears frozen', async () => {
    // 0) 前置：先经 admin/既有充值路径给种子客户入账 10000 分（e2e 里最稳的是直接 adminClient 调
    //    既有 admin 加余额 mutation 或 service；以 Step 1 读到的 admin SDL 为准；若无则 shopClient 走 redeemRechargeCard）
    // 1) requestBalanceWithdrawal(amount: 2000, method: "wechat", accountInfo: "test@example.com")
    //    → myBalanceWithFrozen { balance: 8000, frozenBalance: 2000 }；myBalanceWithdrawals.items[0].status == "pending"
    // 2) rejectBalanceWithdrawal → balance 回 10000、frozen 0、status "rejected"
    // 3) 再申请 2000 → approveBalanceWithdrawal（status approved）→ markBalanceWithdrawalPaid（status paid、frozen 0）
    // 4) 余额不足：requestBalanceWithdrawal(amount: 999999) 报 UserInputError
    // 5) 幂等：对同一 id 二次 reject 抛错（transition 防重）
});
```

（注释步骤必须落成真实代码；入账路径以 Step 1 实读为准。）

- [ ] **Step 6: 跑 e2e + 提交（vendure 仓）**

```powershell
Remove-Item -Recurse -Force d:\zhao\vendure\packages\recharge-card-plugin\e2e\__data__ -ErrorAction SilentlyContinue
cd d:\zhao\vendure\packages\recharge-card-plugin; npm run e2e
```
Expected：新 spec 全绿 + 既有 recharge-card spec 不回归。

```powershell
git -C d:\zhao\vendure add packages/recharge-card-plugin/src packages/recharge-card-plugin/index.ts packages/recharge-card-plugin/e2e/balance-withdrawal.e2e-spec.ts
$msg = 'feat(recharge-card): 余额提现三态机（申请冻结/驳回退回/打款出账）+ e2e（F05 批次3）'
[IO.File]::WriteAllText("$env:TEMP\cm_b3t1.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vendure commit -F "$env:TEMP\cm_b3t1.txt"
```

---

## Task 2: F05 前端 —— C 端提现页 + web-admin 余额提现审核页

**Files:**
- Create: `d:\zhao\vshop\src\api\queries\withdraw.ts`（含 mutation）
- Create: `d:\zhao\vshop\src\pkg-user\pages\withdraw.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（pkg-user 数组加 `pages/withdraw`）、`src\pages\profile\index.vue`（「余额明细」项下加「余额提现」入口，navTo 同款）
- Create: `d:\zhao\vshop\web-admin\src\apis\balanceWithdraw.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\balance\withdraw\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`、`src\constants\menus.ts`（distribution 组加 `menu.balanceWithdraw`）、`src\locale\zh-Hans.json` + `en.json`

- [ ] **Step 1: C 端 API + 页面**

`src/api/queries/withdraw.ts`（仿 `api/queries/member.ts` 裸字符串风格）：

```ts
import { getGraphQLClient } from '../client';

export async function getMyBalanceWithFrozen() {
    return getGraphQLClient().request(`query { myBalanceWithFrozen { balance frozenBalance } }`);
}
export async function getMyBalanceWithdrawals(skip: number, take: number) {
    return getGraphQLClient().request(
        `query($skip: Int, $take: Int) { myBalanceWithdrawals(options: { skip: $skip, take: $take }) {
            items { id amount method accountInfo status remark createdAt } totalItems } }`,
        { skip, take },
    );
}
export async function requestBalanceWithdrawal(amount: number, method: string, accountInfo: string) {
    return getGraphQLClient().request(
        `mutation($amount: Int!, $method: String!, $accountInfo: String!) {
            requestBalanceWithdrawal(amount: $amount, method: $method, accountInfo: $accountInfo) { id status } }`,
        { amount, method, accountInfo },
    );
}
```

`src/pkg-user/pages/withdraw.vue`：上半「可提余额」（`getMyBalanceWithFrozen`，分→元 `/100` 展示）+ 表单（金额输入-元、收款方式 picker：微信/支付宝/银行卡、账号输入）+ 提交按钮（`requestBalanceWithdrawal(Math.round(元*100), ...)`，成功 toast 后刷新余额与列表）+ 下半「提现记录」（`usePagination` + `EmptyState`，行样式仿 `balance-history.vue`：金额/状态/时间）。构建：`cd d:\zhao\vshop; npm run build:h5` → 0 error。

- [ ] **Step 2: web-admin API + 审核页**

`src/apis/balanceWithdraw.ts`（仿 `apis/rider-withdraw.ts` 的 take+1 探页）：

```ts
import { getAdminClient, graphQlErrorMsg } from './client';

export interface BalanceWithdrawRow {
  id: string; customerId: string; amount: number; method: string; accountInfo: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | string; remark?: string | null;
  reviewedAt?: string | null; paidAt?: string | null; createdAt?: string | null;
}
const FIELDS = `id customerId amount method accountInfo status remark reviewedAt paidAt createdAt`;

export async function fetchBalanceWithdrawPage(p: { skip: number; take: number; status?: string }): Promise<{ items: BalanceWithdrawRow[]; total: number }> {
  try {
    const { balanceWithdrawals } = await getAdminClient().request<{ balanceWithdrawals: { items: BalanceWithdrawRow[]; totalItems: number } }>(
      `query BW($options: BalanceWithdrawalListOptions) { balanceWithdrawals(options: $options) { items { ${FIELDS} } totalItems } }`,
      { options: { skip: p.skip, take: p.take, filter: p.status ? { status: { eq: p.status } } : undefined } },
    );
    return { items: balanceWithdrawals?.items ?? [], total: balanceWithdrawals?.totalItems ?? 0 };
  } catch (e: any) { throw new Error(graphQlErrorMsg(e, '加载提现申请失败')); }
}
export async function approveBalanceWithdrawal(id: string, remark?: string) { /* mutation approveBalanceWithdrawal(id, remark) */ }
export async function rejectBalanceWithdrawal(id: string, remark?: string) { /* mutation rejectBalanceWithdrawal(id, remark) */ }
export async function markBalanceWithdrawalPaid(id: string) { /* mutation markBalanceWithdrawalPaid(id) */ }
```

（三个 mutation 函数体按 Task 1 Step 4 的 admin SDL 写全，返回 `{ ${FIELDS} }`，错误处理同款；status 过滤若 ListOptions 不支持 filter 则后端加 `status: String` 参数——以 Step 前实读 SDL 为准，勿臆造。）

`src/pages/balance/withdraw/index.vue`：**整页仿 `pages/rider/withdraw/index.vue`**——tabs 改 `pending/approved/paid/rejected/ALL` 五态；卡片操作：pending →「通过」+「驳回」（showModal，驳回必填备注）；approved →「标记已打款」。状态样式四色沿用 `.st-*` 类改。locale key 用 `balanceWithdraw.*` 全套（tab/status/按钮/确认文案，中英两份）。

- [ ] **Step 3: 注册 + 菜单 + 构建 + 提交（vshop 仓）**

pages.json 两处注册；menus.ts distribution 组（L109-116）加 `{ label: 'menu.balanceWithdraw', url: '/pages/balance/withdraw/index', tier: 2 }`；locale 两文件加 `menu.balanceWithdraw`（"余额提现审核"/"Balance Withdrawals"）+ `balanceWithdraw.*` 页面 key。

```powershell
cd d:\zhao\vshop\web-admin; npm run build:h5
git -C d:\zhao\vshop add src/api/queries/withdraw.ts src/pkg-user/pages/withdraw.vue src/pages.json src/pages/profile/index.vue web-admin/src/apis/balanceWithdraw.ts web-admin/src/pages/balance web-admin/src/pages.json web-admin/src/constants/menus.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
$msg = 'feat: 余额提现 C 端页 + 后台审核页（F05 批次3）'
[IO.File]::WriteAllText("$env:TEMP\cm_b3t2.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b3t2.txt"
```

---

## Task 3: F11 后端 —— 新建 feedback-plugin（常见问题 + 意见反馈）

**Files:**
- Create: `d:\zhao\vendure\packages\feedback-plugin\{package.json,tsconfig.json,vitest.config.mts,index.ts}`（逐字仿 checkin-plugin 三配置件，只改包名与 e2e script 的 `PACKAGE=feedback-plugin`）
- Create: `d:\zhao\vendure\packages\feedback-plugin\src\{constants.ts,types.ts,faq-entry.entity.ts,feedback.entity.ts,feedback.service.ts,feedback.resolvers.ts,plugin.ts}`

- [ ] **Step 1: 实体（FAQ + 反馈）**

```ts
// faq-entry.entity.ts
import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';

@Entity()
export class FaqEntry extends VendureEntity {
    constructor(input?: DeepPartial<FaqEntry>) { super(input); }

    @Column({ type: 'varchar' }) title: string;      // 问题
    @Column({ type: 'text' }) content: string;       // 答案
    @Column({ type: 'varchar', default: 'general' }) type: string; // 分组：general/order/pay/afterSale/account
    @Column({ type: 'int', default: 0 }) sort: number;
    @Column({ type: 'boolean', default: true }) enabled: boolean;

    @ManyToMany(() => Channel) @JoinTable() channels: Channel[]; // 渠道隔离仿 WithdrawalRequest
}
```

```ts
// feedback.entity.ts
import { Column, Entity, Unique } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

@Entity()
export class Feedback extends VendureEntity {
    constructor(input?: DeepPartial<Feedback>) { super(input); }

    @Column() customerId: number;
    @Column({ type: 'varchar', default: 'other' }) type: string;   // 功能异常/体验问题/其他
    @Column({ type: 'varchar', length: 20 }) title: string;        // ≤20 字（对齐 usemall）
    @Column({ type: 'text' }) content: string;
    @Column({ type: 'text', nullable: true }) imgs: string | null; // JSON 字符串数组（uploadCustomerAsset 的 source 列表）
    @Column({ type: 'varchar', length: 30, nullable: true }) contactWay: string | null; // ≤30 字
    @Column({ type: 'varchar', default: 'pending' }) status: 'pending' | 'processing' | 'resolved';
    @Column({ nullable: true }) handledAt: Date;   // 日期列省略 type
}
```

- [ ] **Step 2: service + resolver + plugin.ts（SDL 内联）**

service（`TransactionalConnection` + `ListQueryBuilder`，仿 WithdrawalService 查询风格）：
- shop：`faqs(ctx, type?)`（enabled=true，type 传入则等值过滤，orderBy sort ASC/id ASC）；`createFeedback(ctx, input)`（登录校验 `ctx.activeUserId`，title/contactWay 长度校验对齐实体，imgs 为数组时 `JSON.stringify` 存储）；`myFeedbacks(ctx, options)`。
- admin：`faqs(ctx, options)` / `saveFaq(ctx, input)`（有 id 更新无 id 新建）/ `deleteFaq(ctx, id)` / `feedbacks(ctx, options)` / `updateFeedbackStatus(ctx, id, status)`（置 handledAt）。

plugin.ts 仿 checkin（`PluginCommonModule` + shopApiExtensions/adminApiExtensions 双段）：

```ts
// shopApiExtensions（节选）
type FaqEntry implements Node { id: ID! title: String! content: String! type: String! sort: Int! }
type Feedback implements Node { id: ID! customerId: ID! type: String! title: String! content: String! imgs: String contactWay: String status: String! createdAt: DateTime! }
type FeedbackList implements PaginatedList { items: [Feedback!]! totalItems: Int! }
input FeedbackListOptions
extend type Query { faqs(type: String): [FaqEntry!]!  myFeedbacks(options: FeedbackListOptions): FeedbackList! }
extend type Mutation { createFeedback(input: CreateFeedbackInput!): Feedback! }
input CreateFeedbackInput { type: String title: String! content: String! imgs: [String!] contactWay: String }
// adminApiExtensions（节选）
type FaqEntryList implements PaginatedList { items: [FaqEntry!]! totalItems: Int! }
input FaqEntryListOptions
input SaveFaqInput { id: ID title: String! content: String! type: String sort: Int enabled: Boolean }
extend type Query { faqEntries(options: FaqEntryListOptions): FaqEntryList!  feedbacks(options: FeedbackListOptions): FeedbackList! }
extend type Mutation { saveFaq(input: SaveFaqInput!): FaqEntry!  deleteFaq(id: ID!): Boolean!  updateFeedbackStatus(id: ID!, status: String!): Feedback! }
```

shop resolver 的 Query/Mutation 一律 `@Allow(Permission.Authenticated)`——**例外**：`faqs` 不加（未登录可看 FAQ，对齐 usemall）。

- [ ] **Step 3: e2e**

`e2e/feedback.e2e-spec.ts`（模板=checkin spec 头部，plugins 只挂本插件）：
1. admin `saveFaq` 两条（type: order/general）→ shop `faqs` 全量 2 条、`faqs(type:"order")` 1 条、`faqs` 不含 enabled=false 的（先 saveFaq 一条 enabled:false 验证）。
2. shop `createFeedback`（title 20 字、imgs 两个 url）→ `myFeedbacks` 1 条 status pending；admin `feedbacks` 1 条；`updateFeedbackStatus(id, "resolved")` → handledAt 非空。
3. title 超长（21 字）报 UserInputError。

- [ ] **Step 4: dev-config 注册 + 跑 e2e + 提交（vendure 仓）**

dev-config.ts：import 区加 `import { FeedbackPlugin } from '@vendure/feedback-plugin';`，plugins 数组 `CheckinPlugin.init(),`（L478）后加 `FeedbackPlugin.init(),`。

```powershell
Remove-Item -Recurse -Force d:\zhao\vendure\packages\feedback-plugin\e2e\__data__ -ErrorAction SilentlyContinue
cd d:\zhao\vendure\packages\feedback-plugin; npm run build; npm run e2e
git -C d:\zhao\vendure add packages/feedback-plugin packages/dev-server/dev-config.ts
$msg = 'feat(feedback): 新建 feedback-plugin（FAQ+意见反馈，shop/admin 双端）+ e2e（F11 批次3）'
[IO.File]::WriteAllText("$env:TEMP\cm_b3t3.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vendure commit -F "$env:TEMP\cm_b3t3.txt"
```

（lib/ 产物入库惯例与既有包一致；`git status` 确认无 node_modules/__data__ 混入。）

---

## Task 4: F11 前端 —— C 端常见问题/意见反馈页 + web-admin 两页

**Files:**
- Create: `d:\zhao\vshop\src\api\queries\feedback.ts`（含 mutation）
- Create: `d:\zhao\vshop\src\pkg-user\pages\faq.vue`、`d:\zhao\vshop\src\pkg-user\pages\feedback.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（pkg-user 加两页）、`src\pages\profile\index.vue`（加「常见问题」「意见反馈」入口）
- Create: `d:\zhao\vshop\web-admin\src\apis\feedback.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\feedback\faq\index.vue`、`d:\zhao\vshop\web-admin\src\pages\feedback\list\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`、`src\constants\menus.ts`（marketing 组加 `menu.faqManage`、`menu.feedbackList`）、`src\locale\zh-Hans.json` + `en.json`

- [ ] **Step 1: C 端 FAQ 页**（仿 usemall faq.vue 交互）：顶部横滑 tab（全部/注册登录/订单/支付/售后/账户——type 硬编码映射）+ `faqs` 查询按 type 过滤 + 折叠面板（标题行点击展开 content，`v-show` 本地 state 即可）。`src/api/queries/feedback.ts` 的 faq 部分先写：`getFaqs(type?: string)`。

- [ ] **Step 2: C 端意见反馈页**（仿 usemall feedback.vue 字段）：类型 picker（功能异常/体验问题/其他）+ 标题 input（maxlength 20）+ 内容 textarea + 图片上传（**复用 `uploadCustomerAsset()`**，最多 3 张，九宫格预览+删除）+ 联系方式 input（maxlength 30）+ 提交按钮（校验标题/内容必填，成功 toast 后 `uni.navigateBack()`）。API：`createFeedback(input)`。

- [ ] **Step 3: web-admin FAQ 管理页**：`apis/feedback.ts`（`fetchFaqPage(take,skip)`/`saveFaq(input)`/`deleteFaq(id)`，模式同 groupBuy.ts）+ 页面 = 列表卡片（title/type 徽标/enabled 开关）+「新增」按钮弹 `uni.showModal` 无法承载富表单 → **采用行内编辑卡片**：新增时推入一张空卡片，title/content textarea 直接绑定，保存调 saveFaq。操作按钮「保存/删除/启用切换」。

- [ ] **Step 4: web-admin 反馈列表页**：tabs（pending/processing/resolved/全部）+ `useListPage` 列表卡片（title/type/内容前 60 字/图片缩略 `v-for` img @tap 预览 `uni.previewImage`/联系方式/时间）+ 操作：pending → 「处理中」「已解决」两个按钮（`updateFeedbackStatus`）。locale key `feedbackManage.*` 全套中英。

- [ ] **Step 5: 构建 + 提交（vshop 仓）**：双端 `npm run build:h5` 0 error 后按 Task 2 Step 5 模式提交（add 列表对应替换）：

```powershell
$msg = 'feat: 常见问题/意见反馈 C 端页 + 后台 FAQ 管理与反馈列表（F11 批次3）'
```

---

## Task 5: F19 后端 —— 新建 shopping-circle-plugin（帖子 / 点赞 / 收藏）

**Files:**
- Create: `d:\zhao\vendure\packages\shopping-circle-plugin\{package.json,tsconfig.json,vitest.config.mts,index.ts}`（checkin 三配置件改 `PACKAGE=shopping-circle-plugin`）
- Create: `d:\zhao\vendure\packages\shopping-circle-plugin\src\{constants.ts,types.ts,circle-post.entity.ts,circle-like.entity.ts,circle-favorite.entity.ts,circle.service.ts,circle.resolvers.ts,plugin.ts}`

- [ ] **Step 1: 实体**

```ts
// circle-post.entity.ts
import { Column, Entity, ManyToOne, Index } from 'typeorm';
import { Channel, DeepPartial, VendureEntity } from '@vendure/core';

@Entity()
export class CirclePost extends VendureEntity {
    constructor(input?: DeepPartial<CirclePost>) { super(input); }

    @Column() customerId: number;
    @Column({ type: 'varchar', length: 50, nullable: true }) title: string | null; // ≤50（对齐 usemall note.vue）
    @Column({ type: 'text' }) content: string;
    @Column({ type: 'text', nullable: true }) images: string | null;   // JSON 字符串数组（asset source）
    @Column({ type: 'varchar', nullable: true }) videoUrl: string | null;
    @Column({ type: 'varchar', nullable: true }) productId: string | null; // 「买同款」跳转
    @Column({ type: 'int', default: 0 }) likeCount: number;
    @Column({ type: 'int', default: 0 }) favoriteCount: number;
    @Column({ type: 'varchar', default: 'published' }) status: 'published' | 'hidden';
    @Column({ type: 'boolean', default: false }) isPinned: boolean;

    @ManyToOne(() => Channel) channel: Channel;
    @Column() channelId: number;
}
```

```ts
// circle-like.entity.ts / circle-favorite.entity.ts —— 同构，仅类名不同
import { Column, Entity, Unique } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

@Entity()
@Unique(['postId', 'customerId'])
export class CircleLike extends VendureEntity {
    constructor(input?: DeepPartial<CircleLike>) { super(input); }
    @Column() postId: number;
    @Column() customerId: number;
    @Column() channelId: number;
    @Column({ nullable: true }) createdAt: Date;
}
```

- [ ] **Step 2: service**

`CircleService`：
- `feed(ctx, options: { skip, take }, viewerCustomerId?)`：`listQueryBuilder`（channelId 隔离 + `where: { status: 'published' }`，orderBy `isPinned DESC, id DESC`——ListQueryBuilder 不便双序时用 qb 手写 `orderBy` 后 `getManyAndCount`）；返回 items 附 `viewerLiked/viewerFavorited`（viewer 登录且命中 Like/Favorite 表）。
- `myPosts(ctx, options)`、`createPost(ctx, input)`（登录校验、title≤50、images JSON 化、默认 published）、`findOne(ctx, id, viewerCustomerId?)`。
- `toggleLike(ctx, postId)`：`@Unique` 冲突即取消（find 存在则 remove + likeCount-1；否则 insert + likeCount+1），返回 `{ liked, likeCount }`；`toggleFavorite` 同构返回 `{ favorited, favoriteCount }`。两个 toggle 的计数更新与行写在**同一 service 方法**内，resolver 端 `@Transaction()` 包裹。
- admin：`adminFeed(ctx, options)`（不过滤 status）、`updatePost(ctx, { id, status?, isPinned? })`（隐藏/置顶）。

- [ ] **Step 3: SDL + resolvers + plugin.ts**

```ts
// shop（节选）
type CirclePost implements Node { id: ID! customerId: ID! nickname: String title: String content: String! images: [String!]! videoUrl: String productId: ID likeCount: Int! favoriteCount: Int! viewerLiked: Boolean! viewerFavorited: Boolean! isPinned: Boolean! createdAt: DateTime! }
type CirclePostList implements PaginatedList { items: [CirclePost!]! totalItems: Int! }
input CirclePostListOptions
extend type Query { circleFeed(options: CirclePostListOptions): CirclePostList!  myCirclePosts(options: CirclePostListOptions): CirclePostList!  circlePost(id: ID!): CirclePost }
extend type Mutation { createCirclePost(input: CreateCirclePostInput!): CirclePost!  toggleCircleLike(postId: ID!): ToggleCircleResult!  toggleCircleFavorite(postId: ID!): ToggleCircleResult! }
input CreateCirclePostInput { title: String content: String! images: [String!] videoUrl: String productId: ID }
type ToggleCircleResult { liked: Boolean! favorited: Boolean! likeCount: Int! favoriteCount: Int! }
// admin（节选）
extend type Query { circlePosts(options: CirclePostListOptions): CirclePostList! }
extend type Mutation { updateCirclePost(input: UpdateCirclePostInput!): CirclePost! }
input UpdateCirclePostInput { id: ID! status: String isPinned: Boolean }
```

> `nickname`：service 组装时经 `customerService.findOne(ctx, customerId)` 批量/逐条取 `firstName`（帖子量小，逐条可接受；取不到给 '用户'）。SDL 其余字段与实体对齐，写 SDL 时同步校对 Step 2 返回形状。

- [ ] **Step 4: e2e**：①shop createPost（title 51 字报错；正常发帖）→ circleFeed 1 条 ②toggleLike ×1 → liked=true count=1；×2 → liked=false count=0（幂等往返）③toggleFavorite 同理 ④admin updateCirclePost status hidden → feed 不再出现 ⑤未登录 createPost 报错。

- [ ] **Step 5: dev-config 注册 + e2e + 提交**：dev-config import + `FeedbackPlugin.init(),` 后加 `ShoppingCirclePlugin.init(),`；跑 build+e2e；提交（模式同 Task 3 Step 4）：

```powershell
$msg = 'feat(shopping-circle): 新建购物圈插件（帖子/点赞/收藏/买同款，feed+详情+管理）+ e2e（F19 批次3）'
```

---

## Task 6: F19 前端 —— C 端购物圈三页 + web-admin 内容管理

**Files:**
- Create: `d:\zhao\vshop\src\api\queries\circle.ts`（含 mutation）
- Create: `d:\zhao\vshop\src\pkg-circle\pages\feed.vue`、`detail.vue`、`publish.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（**新增 subPackage** `{ "root": "pkg-circle", "pages": [feed/detail/publish 三项] }`）、`src\pages\profile\index.vue`（加「购物圈」入口）
- Create: `d:\zhao\vshop\web-admin\src\apis\circle.ts`、`d:\zhao\vshop\web-admin\src\pages\circle\posts\index.vue`
- Modify: web-admin `pages.json`、`menus.ts`（marketing 组加 `menu.circleManage`）、locale 两文件

- [ ] **Step 1: C 端 API**（`src/api/queries/circle.ts`）：`getCircleFeed(skip,take)` / `getMyCirclePosts(skip,take)` / `getCirclePost(id)` / `createCirclePost(input)` / `toggleCircleLike(postId)` / `toggleCircleFavorite(postId)`——裸字符串风格同 member.ts。

- [ ] **Step 2: feed.vue（双列瀑布流）**：两列 `view` 数组按奇偶分流（items 按 index % 2 入列），卡片 = 首图（`mode="widthFix"`，无图显示文字卡）+ title/content 两行截断 + 点赞数行；`usePagination` 上拉加载；右上「发布」悬浮按钮 → `/pkg-circle/pages/publish`；卡片 @tap → detail。
- [ ] **Step 3: detail.vue**：images 轮播（`swiper`）或 video（videoUrl 有值优先 `<video>`）+ title/content + 点赞/收藏按钮（toggle 后本地态翻转 + 计数 ±1）+「分享」（`uni.setClipboardData` 复制链接；H5 无原生分享面板）+「买同款」（productId 有值时 `navTo('/pkg-product/pages/detail?id='+productId)`，无值隐藏）。
- [ ] **Step 4: publish.vue**（仿 usemall note.vue 字段）：title input（maxlength 50）+ content textarea + 图片上传（复用 `uploadCustomerAsset`，≤6 张，可删）+「从我的订单/收藏选商品」**降级为手动填商品 ID 不可行** → 简化为：发布页不选商品（productId 留空），后续增强另立任务（矩阵已注明该口径）；提交后 navigateBack 并触发 feed 刷新（`onShow` 重拉）。
- [ ] **Step 5: web-admin 帖子管理页**：`apis/circle.ts`（`fetchCirclePostPage`/`updateCirclePost`）+ 页面 = `useListPage` 卡片列表（首图缩略/title/作者/点赞收藏数/状态）+ 操作「置顶切换」「隐藏/恢复」（status published↔hidden）。locale `circleManage.*` 中英。
- [ ] **Step 6: 构建 + 提交**（vshop 仓，模式同前，`$msg = 'feat: 购物圈 C 端 feed/详情/发布 + 后台内容管理（F19 批次3）'`）。

---

## Task 7: F20 后端 —— 新建 lottery-plugin（九宫格积分抽奖，spendPoints 桥）

**Files:**
- Create: `d:\zhao\vendure\packages\lottery-plugin\{package.json,tsconfig.json,vitest.config.mts,index.ts}`（checkin 三配置件改 `PACKAGE=lottery-plugin`；**peerDependencies 加 `"@vendure/member-level-plugin": "^0.0.1"`，devDependencies 加 `"@vendure/member-level-plugin": "0.0.1"`**——照抄 checkin-plugin/package.json L15-25）
- Create: `d:\zhao\vendure\packages\lottery-plugin\src\{constants.ts,types.ts,lottery-prize.entity.ts,lottery-draw.entity.ts,lottery.service.ts,lottery.resolvers.ts,plugin.ts}`

- [ ] **Step 1: 实体**

```ts
// lottery-prize.entity.ts
import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

@Entity()
export class LotteryPrize extends VendureEntity {
    constructor(input?: DeepPartial<LotteryPrize>) { super(input); }

    @Column({ type: 'varchar' }) name: string;        // 奖项名（如「谢谢参与」）
    @Column({ type: 'varchar', nullable: true }) image: string | null; // 奖品图 URL
    @Column({ type: 'int' }) weight: number;          // 中奖权重（相对值；0=停用该奖项）
    @Column({ type: 'boolean', default: true }) enabled: boolean;
    @Column({ type: 'int', default: 0 }) sort: number;
    @Column({ type: 'int', nullable: true }) channelId: number | null; // null=全渠道通用
}
```

```ts
// lottery-draw.entity.ts
import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

@Entity()
export class LotteryDraw extends VendureEntity {
    constructor(input?: DeepPartial<LotteryDraw>) { super(input); }

    @Column() customerId: number;
    @Column() prizeId: number;
    @Column({ type: 'varchar' }) prizeName: string;
    @Column({ type: 'int' }) pointsSpent: number;
    @Column() channelId: number;
    @Column({ nullable: true }) createdAt: Date;  // 日期列省略 type
}
```

- [ ] **Step 2: service（服务端开奖，直注 MemberLevelService）**

```ts
import { Injectable } from '@nestjs/common';
import { ID, ListQueryBuilder, ListQueryOptions, Logger, PaginatedList, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { MemberLevelService } from '@vendure/member-level-plugin';   // 软依赖桥：checkin-plugin 同款直注

import { loggerCtx } from './constants';
import { LotteryDraw } from './lottery-draw.entity';
import { LotteryPrize } from './lottery-prize.entity';

@Injectable()
export class LotteryService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private memberService: MemberLevelService,
    ) {}

    async drawConfig(ctx: RequestContext): Promise<{ pointsPerDraw: number; prizes: Array<{ id: number; name: string; image: string | null }> }> {
        const prizes = await this.enabledPrizes(ctx);
        return { pointsPerDraw: LotteryPlugin.options.pointsPerDraw ?? 100, prizes: prizes.map(p => ({ id: p.id, name: p.name, image: p.image })) };
    }

    private async enabledPrizes(ctx: RequestContext): Promise<LotteryPrize[]> {
        return this.connection.getRepository(ctx, LotteryPrize).find({
            where: { enabled: true } as any,
            order: { id: 'ASC' },   // prizeIndex = 该排序下的数组下标，C 端九宫格必须同序渲染
        });
    }

    /** 开奖：先扣积分（不足即抛，事务回滚）再按权重取奖并落抽奖记录。resolver 端 @Transaction() 包裹 */
    async draw(ctx: RequestContext): Promise<{ prizeIndex: number; prizeId: number; prizeName: string; image: string | null; pointsSpent: number }> {
        if (!ctx.activeUserId) throw new UserInputError('Must be logged in');
        const pointsPerDraw = LotteryPlugin.options.pointsPerDraw ?? 100;
        const prizes = await this.enabledPrizes(ctx);
        if (!prizes.length) throw new UserInputError('Lottery is not configured');

        const customer = await this.resolveCustomer(ctx); // 仿 checkin requireCustomer：customerService.findOneByUserId
        const balance = await this.memberService.spendPoints(ctx, customer.id, pointsPerDraw, null, '积分抽奖'); // 不足时抛 UserInputError，事务回滚
        Logger.info(`lottery customer ${customer.id} spent ${pointsPerDraw}, balance ${balance}`, loggerCtx);

        const total = prizes.reduce((s, p) => s + (p.weight > 0 ? p.weight : 0), 0);
        if (total <= 0) throw new UserInputError('Lottery is not configured');
        let roll = Math.floor(Math.random() * total);
        let picked = prizes[prizes.length - 1];
        let prizeIndex = prizes.length - 1;
        for (let i = 0; i < prizes.length; i++) {
            if (prizes[i].weight <= 0) continue;
            roll -= prizes[i].weight;
            if (roll < 0) { picked = prizes[i]; prizeIndex = i; break; }
        }

        await this.connection.getRepository(ctx, LotteryDraw).save({
            customerId: customer.id, prizeId: picked.id, prizeName: picked.name,
            pointsSpent: pointsPerDraw, channelId: ctx.channelId,
        } as any);
        return { prizeIndex, prizeId: picked.id, prizeName: picked.name, image: picked.image, pointsSpent: pointsPerDraw };
    }

    async myDraws(ctx: RequestContext, options?: ListQueryOptions<LotteryDraw>): Promise<PaginatedList<LotteryDraw>> {
        // 仿 member-level getMyPointsHistory：activeUserId → customer.id → listQueryBuilder(channelId 隔离, where customerId)
    }

    async adminPrizes(ctx: RequestContext): Promise<LotteryPrize[]> { /* 全量含 weight/enabled，orderBy sort,id */ }
    async savePrizes(ctx: RequestContext, input: Array<Partial<LotteryPrize>>): Promise<boolean> { /* 全量 upsert：有 id 更新，无 id 新建 */ }
    async adminDraws(ctx: RequestContext, options?: ListQueryOptions<LotteryDraw>): Promise<PaginatedList<LotteryDraw>> { /* listQueryBuilder */ }
}
```

（`resolveCustomer`/`myDraws`/`adminPrizes`/`savePrizes` 四个方法体按注释落全，参照系：checkin.service `requireCustomer` L69-78、member-level.service `getMyPointsHistory` L246-258。）

- [ ] **Step 3: SDL + plugin.ts**

```ts
// shop
type LotteryPrizeInfo { id: Int! name: String! image: String }
type LotteryDrawInfo implements Node { id: ID! customerId: ID! prizeId: ID! prizeName: String! pointsSpent: Int! createdAt: DateTime }
type LotteryDrawList implements PaginatedList { items: [LotteryDrawInfo!]! totalItems: Int! }
type LotteryConfig { pointsPerDraw: Int! prizes: [LotteryPrizeInfo!]! }
type LotteryDrawResult { prizeIndex: Int! prizeId: Int! prizeName: String! image: String pointsSpent: Int! }
input LotteryDrawListOptions
extend type Query { lotteryConfig: LotteryConfig!  myLotteryDraws(options: LotteryDrawListOptions): LotteryDrawList! }
extend type Mutation { drawLottery: LotteryDrawResult! }   // @Transaction() + @Allow(Permission.Authenticated)
// admin
type LotteryPrize implements Node { id: ID! name: String! image: String weight: Int! enabled: Boolean! sort: Int! }
extend type Query { lotteryPrizes: [LotteryPrize!]!  lotteryDraws(options: LotteryDrawListOptions): LotteryDrawList! }
extend type Mutation { saveLotteryPrizes(input: [SaveLotteryPrizeInput!]!): Boolean! }
input SaveLotteryPrizeInput { id: ID name: String! image: String weight: Int! enabled: Boolean! sort: Int }
```

plugin.ts providers 加 `{ provide: LOTTERY_PLUGIN_OPTIONS, useFactory: () => LotteryPlugin.options }`；`static options: LotteryPluginOptions = {}`；`init(options?: { pointsPerDraw?: number })`——仿 CheckinPlugin。

- [ ] **Step 4: e2e**（plugins: `[MemberLevelPlugin.init({}), LotteryPlugin.init({ pointsPerDraw: 100 })]`）：
1. admin 先 `saveLotteryPrizes` 三档（一等奖 weight 1 / 谢谢参与 weight 98 / 二等奖 weight 1）。
2. admin `adjustPoints(customerId, 1000)` → shop `drawLottery`：返回 prizeIndex ∈ [0,3)、pointsSpent=100；`myMemberInfo { points }` 减少 100；`myLotteryDraws.totalItems` = 1。
3. 积分耗尽（adjustPoints -1000 后）drawLottery 报错（spendPoints 抛错且事务回滚 → myLotteryDraws 不新增）。
4. prizes 为空时（enabled 全 false）drawLottery 报 'Lottery is not configured'。
   （adjustPoints 的 admin SDL 名以 Step 前实读 member-level admin resolver 为准。）

- [ ] **Step 5: dev-config 注册 + e2e + 提交**：dev-config 加 `import { LotteryPlugin } from '@vendure/lottery-plugin';` + `MemberLevelPlugin.init(),`（L474）后插 `LotteryPlugin.init({ pointsPerDraw: 100 }),`；build+e2e；提交：

```powershell
$msg = 'feat(lottery): 新建积分抽奖插件（服务端加权开奖，spendPoints 桥扣积分）+ e2e（F20 批次3）'
```

---

## Task 8: F20 前端 —— C 端九宫格转盘页 + web-admin 奖品配置

**Files:**
- Create: `d:\zhao\vshop\src\api\queries\lottery.ts`（含 mutation）
- Create: `d:\zhao\vshop\src\pkg-user\pages\lottery.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（pkg-user 加 `pages/lottery`）、`src\pages\profile\index.vue`（加「积分抽奖」入口）
- Create: `d:\zhao\vshop\web-admin\src\apis\lottery.ts`、`d:\zhao\vshop\web-admin\src\pages\lottery\prizes\index.vue`
- Modify: web-admin `pages.json`、`menus.ts`（marketing 组加 `menu.lotteryPrizes`）、locale 两文件

- [ ] **Step 1: C 端 API**：`getLotteryConfig()` / `drawLottery()` / `getMyLotteryDraws(skip,take)`。

- [ ] **Step 2: lottery.vue（自绘九宫格，无第三方转盘库）**：
- 布局：3×3 grid，8 个奖品位（prizes 不足 8 时循环补位渲染——**开奖 prizeIndex 以 prizes 数组下标为准**，补位仅是视觉重复，转圈动画按 prizeIndex 落格）+ 中间「抽奖」按钮格。奖品位顺序 `prize-config 顺序（id ASC）` 渲染，与后端 prizeIndex 同源。
- 交互：点击抽奖 → 按钮禁用 → `drawLottery()` 拿 `{prizeIndex, prizeName}` → 前端跑马灯动画（高亮格顺时针递进，先快后慢约 12 步，最终停在 `(prizeIndex 对应格)`）→ `uni.showModal` 展示「恭喜获得 xxx」→ 刷新 myLotteryDraws。**禁止前端随机**（服务端开奖结果唯一可信）。
- 上半「我的积分」（`getMyMemberInfo()`，`api/queries/member.ts` 既有）+「每次抽奖消耗 N 积分」（config.pointsPerDraw）+ 下方「我的抽奖记录」列表（prizeName/pointsSpent/时间，usePagination）。
- 积分不足时后端报错原样 toast 展示。

- [ ] **Step 3: web-admin 奖品配置页**：`apis/lottery.ts`（`fetchLotteryPrizes`/`saveLotteryPrizes`/`fetchLotteryDrawPage`）+ 页面两段：①「奖项配置」卡片列表（name/image URL/weight/enabled 开关，行内编辑 + 新增卡片 + 全量保存，仿 Task 4 FAQ 管理交互；weight 说明文案「权重越高越易中，0=停用」）②「抽奖记录」tabs（直接复用同页下半：customerId/prizeName/pointsSpent/时间 useListPage）。locale `lotteryManage.*` 中英。

- [ ] **Step 4: 构建 + 提交**（vshop 仓，`$msg = 'feat: 积分抽奖九宫格 C 端页 + 后台奖项配置（F20 批次3）'`）。

---

## Task 9: vendure 本地构建 + 生产部署（deploy-pack 清单同步）

**Files:**
- Modify: `d:\zhao\vendure\deploy-pack.js`（PLUGINS 清单）

- [ ] **Step 1: 同步 PLUGINS 清单**。以当时 `packages/dev-server/dev-config.ts` import 的插件为全集，逐一核对 `deploy-pack.js` PLUGINS 数组：补齐缺失的既有包（member-level-plugin、checkin-plugin、review-plugin、favorite-plugin、coupon-plugin、shop-template-plugin、pickup-plugin、recharge-card-plugin 已在列——以实读 dev-config 结果为准）+ 新增 `feedback-plugin`、`shopping-circle-plugin`、`lottery-plugin`。
- [ ] **Step 2: 本地全量构建**

```powershell
cd d:\zhao\vendure; npm run build
```
Expected：lerna 全包 0 error（新 3 包 lib/ 产物生成）。

- [ ] **Step 3: 打包 + 上传 + 服务器部署**（deploy-plan.md §9 流程 + 批次 1 部署实操口径；ssh 用户 admin、sudo -n 可用、远程命令整段 base64 传递）：

```powershell
cd d:\zhao\vendure; node deploy-pack.js
tar -czf vendure-prod.tar.gz vendure-prod/
scp vendure-prod.tar.gz admin@<SERVER>:/tmp/
# ssh base64 包装：解压到 /opt/vendure-prod（先备份现状）→ npm install --production --legacy-peer-deps → pm2 restart
```
部署前先在服务器 `sudo cp -r /opt/vendure-prod /opt/vendure-prod.bak.$(date +%Y%m%d)`（保留最近一份即可）。服务器不跑 tsc/lerna。

- [ ] **Step 4: 部署验证**（生产 `https://e.joho.cn`）：
1. `pm2 status` 两进程 online、`pm2 logs --lines 50` 无 ERROR。
2. introspection 验证新类型在线：POST `/shop-api` `{__typename}` + 定向查询 `faqs { id }`（未登录可查）、`lotteryConfig { pointsPerDraw }`；admin-api 登录后验 `balanceWithdrawals`/`circlePosts`/`lotteryPrizes`/`faqEntries`。
3. 数据库新表存在（`synchronize:true` 自动建表）：psql `\dt` 过滤 balance_withdrawal_request/faq_entry/feedback/circle_post/circle_like/circle_favorite/lottery_prize/lottery_draw。
4. curl `https://e.joho.cn` 200。
- [ ] **Step 5: 提交（vendure 仓）**：`git add deploy-pack.js` + `$msg = 'chore(deploy): deploy-pack 清单对齐 dev-config 并加入批次3三插件'`。

---

## Task 10: 双端回归、手机截图、手册与收尾（一气呵成）

- [ ] **Step 1: 回归**：recharge-card/feedback/shopping-circle/lottery 四包 e2e 全绿 + member-level 代表性套件 1 个 + vshop/web-admin `build:h5` 双 0 error。
- [ ] **Step 2: 手机截图**（390×844 dpr=2，Playwright 移动视口，存 `web-admin/docs/superpowers/manual/usemall-parity-batch3/assets/`）：C 端提现页、提现记录、FAQ 页、意见反馈页、购物圈 feed/详情/发布、抽奖转盘（含中奖弹窗）、web-admin 余额审核页/FAQ 管理/反馈列表/帖子管理/奖项配置（serve-h5.mjs + 本地 dev-server 走真实接口造数）。截图脚本存临时目录不入库。
- [ ] **Step 3: 手册** `web-admin/docs/superpowers/manual/usemall-parity-batch3/index.md`：范围表（F05/F11/F19/F20 × C 端/后台/接口）、各后台页操作步骤、业务规则（起提 ¥10 与冻结/退回口径；FAQ type 分组；帖子隐藏/置顶；抽奖权重与 prizeIndex 同序说明、每抽 100 积分来自 dev-config 选项）、已知边界（分享=复制链接；发布页选商品暂缓；F20 抽奖消耗为部署级配置）、验证记录（e2e/build/部署 introspection）。
- [ ] **Step 4: 收尾提交**（两仓，`$msg` 分别为 `'docs(manual): 批次3 操作手册与截图'`（vshop）与 vendure 如有遗漏则补提交）。
- [ ] **Step 5: 部署 + 推送 + 汇报**：C 端 tar→scp→sudo 站点替换 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（批次 1 命令）→ curl 200；web-admin `node scripts/deploy.mjs`；`git -C d:\zhao\vshop push` + `git -C d:\zhao\vendure push`；汇报（交付清单/验证记录/部署结果/已知边界）。
