# web-admin 完善：支付超时观测 + 优惠券管理深化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理端补齐「待付款超时任务」可观测性（列表/KPI/手动补偿）与「商品专享券 SKU 绑定」管理 UI。

**Architecture:** 后端在 campus-delivery-plugin 内把 Job 执行核心抽出共用，新增 AdminService + AdminResolver（2 查询 3 变更），零数据库迁移；前端 web-admin 新增观测页（版式 A）与券绑定卡片组件，全部文案走 i18n。spec：`d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-08-payment-timeout-observability-coupon-binding-design.md`。

**Tech Stack:** Vendure 2.x（NestJS GraphQL 装饰器、TransactionalConnection）、TypeORM（Between/LessThan/In）、web-admin = uni-app Vue3 + graphql-request、vitest。

**关键仓约定：**
- vendure 仓 `d:\zhao\vendure`（分支 master）；测试文件与源码同目录 `*.spec.ts`，跑法 `cd d:\zhao\vendure\packages\campus-delivery-plugin && npx vitest run`
- web-admin 仓根 `d:\zhao\vshop`（web-admin 为子目录）；构建 `cd d:\zhao\vshop\web-admin && npm run build`
- PowerShell：不支持 `&&`（用 `;` 分隔）；git commit 用多个 `-m`

---

### Task 1: Job 抽核 — `executeTaskNow` / `resendRemind` / `runCompensation` 返回数

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout.job.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout-admin.spec.ts`（新建，自包含 stub，不依赖现有 job spec 的 harness）

- [ ] **Step 1: 写失败测试**

新建 `payment-timeout-admin.spec.ts`（本 Task 只写 Job 部分；Task 2 在同文件追加 Service 部分）：

```ts
import { describe, expect, it, vi } from 'vitest';
import { PaymentTimeoutJob, PAYMENT_REMIND_MS } from './payment-timeout.job';
import { PaymentTimeoutStatus, PaymentTimeoutTask, PaymentTimeoutType } from './payment-timeout.entity';

function makeJob(overrides: Record<string, any> = {}) {
    const tasks: PaymentTimeoutTask[] = [];
    const taskRepo = {
        findOne: vi.fn(async ({ where }: any) => tasks.find(t => t.id === where.id) ?? null),
        save: vi.fn(async (t: any) => t),
        find: vi.fn(async () => []),
        count: vi.fn(async () => 0),
        createQueryBuilder: vi.fn(),
    };
    const job = new PaymentTimeoutJob(
        {} as any, // jobQueueService：executeTaskNow 不用队列
        { rawConnection: { getRepository: () => taskRepo } } as any,
        { findOne: vi.fn(async () => ({ id: 1, state: 'ArrangingPayment', lines: [] })) } as any, // orderService
        { findOne: vi.fn(async () => ({ id: 1 })) } as any, // channelService
        { createReleasesForOrderLines: vi.fn(async () => undefined) } as any, // stockMovementService
        { user: vi.fn(async () => undefined) } as any, // notify
        { getConfig: vi.fn(async () => ({ h5BaseUrl: 'https://h5.test' })) } as any, // campusConfig
    ) as any;
    (job as any).taskRepo = taskRepo;
    return { job, taskRepo, tasks, notify: (job as any).notify, orderService: (job as any).orderService };
}

function pendingTask(partial: Partial<PaymentTimeoutTask> = {}): PaymentTimeoutTask {
    return new PaymentTimeoutTask({
        id: 1, orderId: 1, channelId: 1, type: PaymentTimeoutType.CANCEL,
        status: PaymentTimeoutStatus.PENDING, expectedState: 'ArrangingPayment',
        dueAt: new Date(Date.now() - 60 * 1000), retryCount: 0, lastError: null, ...partial,
    } as any);
}

describe('PaymentTimeoutJob.executeTaskNow', () => {
    it('PENDING 任务手动执行成功（无视 dueAt 已过与否）→ EXECUTED', async () => {
        const { job, tasks, notify } = makeJob();
        const t = pendingTask({ type: PaymentTimeoutType.REMIND, dueAt: new Date(Date.now() + PAYMENT_REMIND_MS) });
        tasks.push(t);
        const out = await job.executeTaskNow(1);
        expect(out.status).toBe(PaymentTimeoutStatus.EXECUTED);
        expect(notify.user).toHaveBeenCalled();
    });

    it('CANCEL 任务执行：释放库存 + cancelOrder + orderCancelled 通知', async () => {
        const { job, tasks, notify, orderService } = makeJob();
        tasks.push(pendingTask());
        await job.executeTaskNow(1);
        expect(orderService.cancelOrder).toHaveBeenCalled();
        expect(notify.user).toHaveBeenCalledWith(expect.anything(), 1, 'orderCancelled', expect.anything(), expect.anything());
    });

    it('EXECUTED / CANCELLED → 抛 NOT_EXECUTABLE', async () => {
        const { job, tasks } = makeJob();
        tasks.push(pendingTask({ status: PaymentTimeoutStatus.EXECUTED }));
        await expect(job.executeTaskNow(1)).rejects.toThrow('PAYMENT_TIMEOUT_TASK_NOT_EXECUTABLE');
    });

    it('FAILED 任务可重试，成功后回到 EXECUTED', async () => {
        const { job, tasks } = makeJob();
        tasks.push(pendingTask({ status: PaymentTimeoutStatus.FAILED, retryCount: 3, lastError: 'boom' }));
        const out = await job.executeTaskNow(1);
        expect(out.status).toBe(PaymentTimeoutStatus.EXECUTED);
        expect(out.lastError).toBeNull();
    });

    it('resendRemind：REMIND 任务直发 paymentPending，不经状态机', async () => {
        const { job, tasks, notify } = makeJob();
        tasks.push(pendingTask({ type: PaymentTimeoutType.REMIND, status: PaymentTimeoutStatus.EXECUTED }));
        await expect(job.resendRemind(1)).resolves.toBe(true);
        expect(notify.user).toHaveBeenCalledWith(expect.anything(), 1, 'paymentPending', undefined, 'https://h5.test');
    });

    it('resendRemind：CANCEL 任务 → 抛 REMIND_TASK_NOT_FOUND', async () => {
        const { job, tasks } = makeJob();
        tasks.push(pendingTask({ type: PaymentTimeoutType.CANCEL }));
        await expect(job.resendRemind(1)).rejects.toThrow('PAYMENT_TIMEOUT_REMIND_TASK_NOT_FOUND');
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest run payment-timeout-admin.spec.ts`
Expected: FAIL —— `executeTaskNow is not a function` / `resendRemind is not a function`

- [ ] **Step 3: 改造 job.ts**

在 `payment-timeout.job.ts` 做三处修改（`process` 中段抽为 `runTask`，新增两个公有方法）：

3a. `process` 改为只做门卫，把 try/catch 整段移入私有 `runTask`（原逻辑逐行保留）：

```ts
    async process(data: PaymentTimeoutJobData): Promise<void> {
        const task = await this.taskRepo.findOne({ where: { id: data.taskId as any } });
        if (!task || task.status !== PaymentTimeoutStatus.PENDING) return;
        if (new Date() < new Date(task.dueAt)) return; // SQL JobQueue 忽略 delay → 补偿扫描兜底
        await this.runTask(task);
    }

    /** 执行核心（定时队列与手动执行共用）：状态复查 → 提醒/取消 → 落库 */
    private async runTask(task: PaymentTimeoutTask): Promise<void> {
        try {
            // ↓↓↓ 原 process() 的 try{} 内全部逻辑原样搬入（buildCtx → findOne order → 状态不符 CANCELLED → REMIND/CANCEL 分支 → EXECUTED 落库）↓↓↓
        } catch (e: any) {
            // ↓↓↓ 原 catch{} 原样搬入（retryCount/lastError/FAILED 判定），含末尾 `if (task.status !== FAILED) throw e` ↓↓↓
        }
    }
```

3b. 新增公有方法（放在 `runCompensation` 之前）：

```ts
    /** 手动执行：PENDING（无视 dueAt）/ FAILED 重试；EXECUTED/CANCELLED 拒绝。条件防并发：执行前复查状态 */
    async executeTaskNow(taskId: number): Promise<PaymentTimeoutTask> {
        const task = await this.taskRepo.findOne({ where: { id: taskId as any } });
        if (!task) throw new Error('PAYMENT_TIMEOUT_TASK_NOT_FOUND');
        if (task.status === PaymentTimeoutStatus.EXECUTED || task.status === PaymentTimeoutStatus.CANCELLED) {
            throw new Error('PAYMENT_TIMEOUT_TASK_NOT_EXECUTABLE');
        }
        await this.runTask(task);
        return task;
    }

    /** 手动重发提醒：按任务取 orderId/channelId 直发通知，不经状态机 */
    async resendRemind(taskId: number): Promise<boolean> {
        const task = await this.taskRepo.findOne({ where: { id: taskId as any } });
        if (!task || task.type !== PaymentTimeoutType.REMIND) throw new Error('PAYMENT_TIMEOUT_REMIND_TASK_NOT_FOUND');
        const ctx = await this.buildCtx(task.channelId);
        if (!ctx) throw new Error('PAYMENT_TIMEOUT_CHANNEL_NOT_FOUND');
        const order = await this.orderService.findOne(ctx, task.orderId as any);
        if (!order) throw new Error('PAYMENT_TIMEOUT_ORDER_NOT_FOUND');
        this.notify.user(ctx, order.id, 'paymentPending', undefined, await this.h5Base(ctx));
        return true;
    }
```

3c. `runCompensation` 返回处理条数（签名 `Promise<void>` → `Promise<number>`，末尾加 `return overdue.length;`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run payment-timeout-admin.spec.ts` 与全量 `npx vitest run`
Expected: 新 spec 6 条 PASS；既有 `payment-timeout.job.spec.ts` 5 条仍 PASS（全量绿）

- [ ] **Step 5: 提交**

```powershell
cd d:\zhao\vendure; git add packages/campus-delivery-plugin/src/payment-timeout.job.ts packages/campus-delivery-plugin/src/payment-timeout-admin.spec.ts; git commit -m "feat(campus-delivery): payment-timeout job 抽核支持手动执行/重发提醒/补偿计数"
```

---

### Task 2: AdminService + AdminResolver + schema + 注册

**Files:**
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout-admin.service.ts`
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`（providers、resolvers 数组 L362、adminApiExtensions.schema gql 模板末尾）
- Test: `payment-timeout-admin.spec.ts` 追加 Service describe

- [ ] **Step 1: 追加失败测试（Service）**

在 `payment-timeout-admin.spec.ts` 追加（导入 PaymentTimeoutAdminService）：

```ts
import { Between, LessThan } from 'typeorm';
import { PaymentTimeoutAdminService } from './payment-timeout-admin.service';

describe('PaymentTimeoutAdminService', () => {
    function makeService(tasks: PaymentTimeoutTask[], orders: any[] = []) {
        const taskRepo = {
            findAndCount: vi.fn(async (opts: any) => {
                let list = tasks.filter(t => (!opts.where.status || t.status === opts.where.status) && (!opts.where.type || t.type === opts.where.type));
                return [list.slice(opts.skip ?? 0, (opts.skip ?? 0) + (opts.take ?? 20)), list.length];
            }),
            count: vi.fn(async ({ where }: any) => {
                if ('status' in where && where.status === PaymentTimeoutStatus.PENDING) return 2; // pendingOverdue
                if ('type' in where && where.type === PaymentTimeoutType.REMIND) return 12;      // todayRemind
                if ('type' in where && where.type === PaymentTimeoutType.CANCEL) return 5;       // todayCancel
                return 1;                                                                        // totalFailed
            }),
        };
        const orderRepo = { find: vi.fn(async () => orders) };
        const svc = new PaymentTimeoutAdminService(
            { rawConnection: { getRepository: (e: any) => (e === Order ? orderRepo : taskRepo) } } as any,
            { executeTaskNow: vi.fn(async (id: number) => tasks.find(t => t.id === id)), runCompensation: vi.fn(async () => 3) } as any,
        ) as any;
        (svc as any).taskRepo = taskRepo; (svc as any).orderRepo = orderRepo;
        return { svc, taskRepo, orderRepo };
    }

    it('listTasks：返回任务 + 订单摘要映射', async () => {
        const t = pendingTask();
        const { svc } = makeService([t], [{ id: 1, code: 'A1001', state: 'Cancelled' }]);
        const out = await svc.listTasks({ status: 'PENDING', skip: 0, take: 20 });
        expect(out.total).toBe(1);
        expect(out.items[0]).toMatchObject({ orderCode: 'A1001', orderState: 'Cancelled' });
    });

    it('getStats：四项计数', async () => {
        const { svc } = makeService([]);
        const s = await svc.getStats();
        expect(s).toEqual({ todayRemind: 12, todayCancel: 5, totalFailed: 1, pendingOverdue: 2 });
    });

    it('executeTask 委托 job；runCompensationNow 返回条数', async () => {
        const t = pendingTask(); const { svc } = makeService([t]);
        await svc.executeTask(1);
        expect((svc as any).job.executeTaskNow).toHaveBeenCalledWith(1);
        await expect(svc.runCompensationNow()).resolves.toBe(3);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run payment-timeout-admin.spec.ts`
Expected: FAIL —— `PaymentTimeoutAdminService is not exported`

- [ ] **Step 3: 实现 Service**

新建 `payment-timeout-admin.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { Between, In, LessThan } from 'typeorm';
import { Order, TransactionalConnection } from '@vendure/core';

import { PaymentTimeoutJob } from './payment-timeout.job';
import { PaymentTimeoutStatus, PaymentTimeoutTask, PaymentTimeoutType } from './payment-timeout.entity';

export interface PaymentTimeoutTaskRow extends PaymentTimeoutTask { orderCode: string | null; orderState: string | null; }

@Injectable()
export class PaymentTimeoutAdminService {
    private taskRepo = this.connection.rawConnection.getRepository(PaymentTimeoutTask);
    private orderRepo = this.connection.rawConnection.getRepository(Order);

    constructor(
        private connection: TransactionalConnection,
        private job: PaymentTimeoutJob,
    ) {}

    async listTasks(opts: { status?: string; type?: string; from?: Date; to?: Date; skip?: number; take?: number; }) {
        const take = Math.min(opts.take ?? 20, 100);
        const where: Record<string, any> = {};
        if (opts.status) where.status = opts.status;
        if (opts.type) where.type = opts.type;
        if (opts.from || opts.to) where.dueAt = Between(opts.from ?? new Date(0), opts.to ?? new Date('2999-12-31'));
        const [tasks, total] = await this.taskRepo.findAndCount({
            where: where as any, order: { dueAt: 'DESC' } as any, skip: opts.skip ?? 0, take,
        });
        const ids = [...new Set(tasks.map(t => Number(t.orderId)))];
        const orders = ids.length ? await this.orderRepo.find({ where: { id: In(ids) } as any }) : [];
        const byId = new Map(orders.map((o: any) => [Number(o.id), o]));
        const items: PaymentTimeoutTaskRow[] = tasks.map(t => ({
            ...t,
            orderCode: byId.get(Number(t.orderId))?.code ?? null,
            orderState: byId.get(Number(t.orderId))?.state ?? null,
        }));
        return { items, total };
    }

    async getStats() {
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const [todayRemind, todayCancel, totalFailed, pendingOverdue] = await Promise.all([
            this.taskRepo.count({ where: { type: PaymentTimeoutType.REMIND, status: PaymentTimeoutStatus.EXECUTED, dueAt: Between(startOfDay, new Date()) } as any }),
            this.taskRepo.count({ where: { type: PaymentTimeoutType.CANCEL, status: PaymentTimeoutStatus.EXECUTED, dueAt: Between(startOfDay, new Date()) } as any }),
            this.taskRepo.count({ where: { status: PaymentTimeoutStatus.FAILED } as any }),
            this.taskRepo.count({ where: { status: PaymentTimeoutStatus.PENDING, dueAt: LessThan(new Date()) } as any }),
        ]);
        return { todayRemind, todayCancel, totalFailed, pendingOverdue };
    }

    executeTask(id: number) { return this.job.executeTaskNow(id); }
    resendRemind(taskId: number) { return this.job.resendRemind(taskId); }
    runCompensationNow() { return this.job.runCompensation(); }
}
```

注意：测试桩里 `getRepository` 按实体类区分，实现中两个 repo 字段在构造器执行时初始化——测试先 `new` 后覆盖字段即可（桩已按此设计）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run payment-timeout-admin.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: Resolver + schema + 注册**

5a. 新建 `payment-timeout-admin.resolver.ts`：

```ts
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';

import { PaymentTimeoutAdminService } from './payment-timeout-admin.service';

@Resolver()
export class PaymentTimeoutAdminResolver {
    constructor(private admin: PaymentTimeoutAdminService) {}

    @Query()
    @Allow(Permission.ReadOrder as any)
    async paymentTimeoutTasks(
        @Ctx() ctx: RequestContext,
        @Args({ name: 'status', type: () => String, nullable: true }) status?: string,
        @Args({ name: 'type', type: () => String, nullable: true }) type?: string,
        @Args({ name: 'from', type: () => Date, nullable: true }) from?: Date,
        @Args({ name: 'to', type: () => Date, nullable: true }) to?: Date,
        @Args({ name: 'skip', type: () => Int, nullable: true }) skip?: number,
        @Args({ name: 'take', type: () => Int, nullable: true }) take?: number,
    ) {
        return this.admin.listTasks({ status, type, from, to, skip, take });
    }

    @Query()
    @Allow(Permission.ReadOrder as any)
    async paymentTimeoutStats(@Ctx() ctx: RequestContext) {
        return this.admin.getStats();
    }

    @Mutation()
    @Allow(Permission.UpdateOrder as any)
    async executePaymentTimeoutTask(@Args({ name: 'id', type: () => ID }) id: ID) {
        return this.admin.executeTask(Number(id));
    }

    @Mutation()
    @Allow(Permission.UpdateOrder as any)
    async resendPaymentTimeoutRemind(@Args({ name: 'taskId', type: () => ID }) taskId: ID) {
        return this.admin.resendRemind(Number(taskId));
    }

    @Mutation()
    @Allow(Permission.UpdateOrder as any)
    async runPaymentTimeoutCompensation() {
        return this.admin.runCompensationNow();
    }
}
```

5b. `campus-delivery.plugin.ts` 三处注册：
- 顶部 import：`import { PaymentTimeoutAdminResolver } from './payment-timeout-admin.resolver';` 与 `import { PaymentTimeoutAdminService } from './payment-timeout-admin.service';`
- `providers` 数组追加 `PaymentTimeoutAdminService,`（紧跟 `PaymentTimeoutJob,` 之后）
- `resolvers: [CampusConfigAdminResolver, RiderAdminResolver, DispatchAdminResolver, MerchantAdminResolver],`（L362）改为追加 `PaymentTimeoutAdminResolver`

5c. adminApiExtensions.schema gql 模板**末尾**（闭合反引号前）追加，`extend` 关键字与模板内现有写法保持一致（先看现有 Query/Mutation 用不用 extend）：

```graphql
type PaymentTimeoutTaskRow {
    id: ID!
    orderId: ID!
    channelId: ID!
    orderCode: String
    orderState: String
    type: String!
    status: String!
    dueAt: DateTime!
    retryCount: Int!
    lastError: String
}
type PaymentTimeoutTaskList { items: [PaymentTimeoutTaskRow!]! total: Int! }
type PaymentTimeoutStats { todayRemind: Int! todayCancel: Int! totalFailed: Int! pendingOverdue: Int! }
extend type Query {
    paymentTimeoutTasks(status: String, type: String, from: DateTime, to: DateTime, skip: Int, take: Int): PaymentTimeoutTaskList!
    paymentTimeoutStats: PaymentTimeoutStats!
}
extend type Mutation {
    executePaymentTimeoutTask(id: ID!): PaymentTimeoutTask!
    resendPaymentTimeoutRemind(taskId: ID!): Boolean!
    runPaymentTimeoutCompensation: Int!
}
```

注意 `executePaymentTimeoutTask` 返回 `PaymentTimeoutTask!`——实体未暴露到 schema，需再补一个透出类型：`type PaymentTimeoutTask { id: ID! orderId: ID! type: String! status: String! dueAt: DateTime! retryCount: Int! lastError: String }`（resolver 返回的实体字段匹配即可）。

- [ ] **Step 6: 全量测试 + 类型检查**

Run: `npx vitest run`（全绿）与 `cd d:\zhao\vendure; npx tsc --noEmit -p packages/campus-delivery-plugin`（或该包既有检查方式；若包无独立 tsconfig 则用仓内既有构建命令验证编译通过）
Expected: 测试全绿，编译无错误

- [ ] **Step 7: 提交**

```powershell
cd d:\zhao\vendure; git add packages/campus-delivery-plugin/src; git commit -m "feat(campus-delivery): payment-timeout admin 查询/统计/手动执行接口"
```

---

### Task 3: web-admin 观测页（apis + 页面 + 路由/菜单 + i18n）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\paymentTimeout.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\order\payment-timeout\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（order 分组加一行）
- Modify: `d:\zhao\vshop\web-admin\src\constants\menus.ts`（trade 域 order 分组加一项）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` / `src\locale\en.json`

- [ ] **Step 1: apis/paymentTimeout.ts**

```ts
import { getAdminClient } from './client';

export interface PaymentTimeoutTaskRow {
    id: string; orderId: string; channelId: string;
    orderCode: string | null; orderState: string | null;
    type: 'REMIND' | 'CANCEL';
    status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'FAILED';
    dueAt: string; retryCount: number; lastError: string | null;
}
export interface PaymentTimeoutStats { todayRemind: number; todayCancel: number; totalFailed: number; pendingOverdue: number; }

export async function fetchPaymentTimeoutTasks(opts: { status?: string; type?: string; from?: string; to?: string; skip?: number; take?: number }) {
    const res = await getAdminClient().request<any>(`
        query($status: String, $type: String, $from: DateTime, $to: DateTime, $skip: Int, $take: Int) {
            paymentTimeoutTasks(status: $status, type: $type, from: $from, to: $to, skip: $skip, take: $take) {
                items { id orderId channelId orderCode orderState type status dueAt retryCount lastError }
                total
            }
        }`, opts as any);
    return res.paymentTimeoutTasks as { items: PaymentTimeoutTaskRow[]; total: number };
}

export async function fetchPaymentTimeoutStats(): Promise<PaymentTimeoutStats> {
    const res = await getAdminClient().request<any>(`query { paymentTimeoutStats { todayRemind todayCancel totalFailed pendingOverdue } }`);
    return res.paymentTimeoutStats;
}

export async function executePaymentTimeoutTask(id: string): Promise<void> {
    await getAdminClient().request<any>(`mutation($id: ID!) { executePaymentTimeoutTask(id: $id) { id status } }`, { id });
}

export async function resendPaymentTimeoutRemind(taskId: string): Promise<void> {
    await getAdminClient().request<any>(`mutation($taskId: ID!) { resendPaymentTimeoutRemind(taskId: $taskId) }`, { taskId });
}

export async function runPaymentTimeoutCompensation(): Promise<number> {
    const res = await getAdminClient().request<any>(`mutation { runPaymentTimeoutCompensation }`);
    return res.runPaymentTimeoutCompensation as number;
}
```

- [ ] **Step 2: 观测页 pages/order/payment-timeout/index.vue**

骨架（版式 A，沿用 coupon/edit 的 card/field/chip 样式惯例；script setup + $t）：

```vue
<template>
  <view class="page">
    <view class="kpis">
      <view class="kpi"><text class="n">{{ stats.todayRemind }}</text><text class="l">{{ $t('ptStats.todayRemind') }}</text></view>
      <view class="kpi"><text class="n">{{ stats.todayCancel }}</text><text class="l">{{ $t('ptStats.todayCancel') }}</text></view>
      <view class="kpi" :class="{ warn: stats.totalFailed > 0 }"><text class="n">{{ stats.totalFailed }}</text><text class="l">{{ $t('ptStats.totalFailed') }}</text></view>
      <view class="kpi" :class="{ warn: stats.pendingOverdue > 0 }"><text class="n">{{ stats.pendingOverdue }}</text><text class="l">{{ $t('ptStats.pendingOverdue') }}</text></view>
    </view>

    <view class="filters">
      <picker :range="statusOptions" range-key="label" @change="e => { fStatus = statusOptions[e.detail.value].value; reload(); }">
        <view class="chip">{{ statusLabel(fStatus) }} ▾</view>
      </picker>
      <picker :range="typeOptions" range-key="label" @change="e => { fType = typeOptions[e.detail.value].value; reload(); }">
        <view class="chip">{{ typeLabel(fType) }} ▾</view>
      </picker>
      <view class="chip" :class="{ on: fToday }" @tap="toggleToday">{{ $t('ptFilter.today') }}</view>
      <view class="btn" @tap="onCompensate">{{ $t('ptFilter.compensate') }}</view>
    </view>

    <view class="thead row">
      <text class="c1">{{ $t('ptTable.order') }}</text><text class="c2">{{ $t('ptTable.type') }}</text>
      <text class="c3">{{ $t('ptTable.status') }}</text><text class="c4">{{ $t('ptTable.dueAt') }}</text><text class="c5">{{ $t('ptTable.action') }}</text>
    </view>
    <view v-for="r in items" :key="r.id" class="row" :class="{ failed: r.status === 'FAILED' }">
      <text class="c1 link" @tap="goOrder(r)">{{ r.orderCode || ('#' + r.orderId) }}</text>
      <text class="c2">{{ typeLabel(r.type) }}</text>
      <text class="c3"><text class="pill" :class="r.status.toLowerCase()">{{ statusLabel(r.status) }}<template v-if="r.status === 'FAILED'"> · {{ r.retryCount }}/3</template></text></text>
      <text class="c4">{{ dueText(r) }}</text>
      <text class="c5 link" v-if="r.status === 'PENDING'" @tap="onExecute(r)">{{ $t('ptAction.execute') }}</text>
      <text class="c5 link" v-else-if="r.status === 'FAILED'" @tap="onExecute(r)">{{ $t('ptAction.retry') }}</text>
      <text class="c5 link" v-else-if="r.type === 'REMIND' && r.status === 'EXECUTED'" @tap="onResend(r)">{{ $t('ptAction.resend') }}</text>
      <text class="c5" v-else>—</text>
    </view>
    <view v-if="!items.length && !loading" class="empty">{{ $t('common.empty') }}</view>
    <view class="pager" v-if="total > items.length">
      <text class="link" v-if="skip > 0" @tap="prev">{{ $t('common.prev') }}</text>
      <text class="link" @tap="next">{{ $t('common.next') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    executePaymentTimeoutTask, fetchPaymentTimeoutStats, fetchPaymentTimeoutTasks,
    resendPaymentTimeoutRemind, runPaymentTimeoutCompensation,
    type PaymentTimeoutStats, type PaymentTimeoutTaskRow,
} from '../../../apis/paymentTimeout';

const { t } = useI18n();
const stats = ref<PaymentTimeoutStats>({ todayRemind: 0, todayCancel: 0, totalFailed: 0, pendingOverdue: 0 });
const items = ref<PaymentTimeoutTaskRow[]>([]);
const total = ref(0); const skip = ref(0); const take = 20; const loading = ref(false);
const fStatus = ref(''); const fType = ref(''); const fToday = ref(false);
const statusOptions = [
    { value: '', label: t('ptStatus.all') }, { value: 'PENDING', label: t('ptStatus.pending') },
    { value: 'EXECUTED', label: t('ptStatus.executed') }, { value: 'CANCELLED', label: t('ptStatus.cancelled') },
    { value: 'FAILED', label: t('ptStatus.failed') },
];
const typeOptions = [{ value: '', label: t('ptType.all') }, { value: 'REMIND', label: t('ptType.remind') }, { value: 'CANCEL', label: t('ptType.cancel') }];
const statusLabel = (v: string) => statusOptions.find(s => s.value === v)?.label ?? v;
const typeLabel = (v: string) => typeOptions.find(s => s.value === v)?.label ?? v;

function dueText(r: PaymentTimeoutTaskRow) {
    const due = new Date(r.dueAt);
    if (r.status !== 'PENDING') return due.toLocaleString();
    const diff = due.getTime() - Date.now();
    return diff > 0 ? `${t('ptTable.leftIn')} ${Math.ceil(diff / 60000)} ${t('ptTable.min')}` : t('ptTable.overdue');
}
const goOrder = (r: PaymentTimeoutTaskRow) => uni.navigateTo({ url: `/pages/order/detail/index?id=${r.orderId}` });

async function reload() {
    loading.value = true;
    try {
        const today = fToday.value ? new Date(); const to = fToday.value ? new Date(); : null;
        // eslint 上不容许上写法，实际实现：
        let from: string | undefined; let toStr: string | undefined;
        if (fToday.value) { const s = new Date(); s.setHours(0, 0, 0, 0); from = s.toISOString(); toStr = new Date().toISOString(); }
        const [list, st] = await Promise.all([
            fetchPaymentTimeoutTasks({ status: fStatus.value || undefined, type: fType.value || undefined, from, to: toStr, skip: skip.value, take }),
            fetchPaymentTimeoutStats(),
        ]);
        items.value = list.items; total.value = list.total; stats.value = st;
    } finally { loading.value = false; }
}
const next = () => { skip.value += take; reload(); };
const prev = () => { skip.value = Math.max(0, skip.value - take); reload(); };
const toggleToday = () => { fToday.value = !fToday.value; skip.value = 0; reload(); };

const confirmThen = (msg: string, fn: () => Promise<any>) => uni.showModal({
    title: t('common.confirm'), content: msg, success: (m) => { if (m.confirm) fn().then(reload).catch((e: any) => uni.showToast({ title: e?.response?.errors?.[0]?.message || String(e), icon: 'none' })); },
});
const onExecute = (r: PaymentTimeoutTaskRow) => confirmThen(t('ptConfirm.execute'), () => executePaymentTimeoutTask(r.id));
const onResend = (r: PaymentTimeoutTaskRow) => confirmThen(t('ptConfirm.resend'), () => resendPaymentTimeoutRemind(r.id));
const onCompensate = () => confirmThen(t('ptConfirm.compensate'), async () => {
    const n = await runPaymentTimeoutCompensation();
    uni.showToast({ title: t('ptToast.compensated').replace('{n}', String(n)), icon: 'none' });
});

onMounted(reload);
</script>

<style>
/* 复用站内 .page/.card 惯例：白底卡片、chip 圆角、pill 状态色（PENDING 灰、EXECUTED 绿、FAILED 红、CANCELLED 灰） */
</style>
```

实现说明（执行者注意）：上面 `reload()` 中 `const today = ...` 一行是伪码残迹，**实现时删掉**，只保留 `from/toStr` 分支；样式按现有页面（如 `pages/coupon/index.vue`）的卡片/表格类名风格补全。

- [ ] **Step 3: 路由/菜单注册**

`src/pages.json` order 分组（L23-27 区间）追加：

```json
{ "path": "pages/order/payment-timeout/index", "style": { "navigationBarTitleText": "支付超时观测", "enablePullDownRefresh": true } },
```

`src/constants/menus.ts` trade 域（L53 `menu.order` 之后）插入：

```ts
{ label: 'menu.paymentTimeout', url: '/pages/order/payment-timeout/index', tier: 2 },
```

- [ ] **Step 4: i18n 双语同步**

`src/locale/zh-Hans.json` 与 `src/locale/en.json` 各追加同名键（值一一对应）：

| 键 | zh-Hans | en |
|---|---|---|
| menu.paymentTimeout | 支付超时观测 | Payment Timeout |
| ptStats.todayRemind | 今日提醒 | Reminded today |
| ptStats.todayCancel | 今日取消 | Cancelled today |
| ptStats.totalFailed | 累计失败 | Failed tasks |
| ptStats.pendingOverdue | 滞留逾期 | Overdue pending |
| ptFilter.today | 今日 | Today |
| ptFilter.compensate | 手动补偿 | Compensate |
| ptTable.order | 订单号 | Order |
| ptTable.type | 类型 | Type |
| ptTable.status | 状态 | Status |
| ptTable.dueAt | 到期 | Due |
| ptTable.action | 操作 | Action |
| ptTable.leftIn | 剩 | in |
| ptTable.min | 分钟 | min |
| ptTable.overdue | 已逾期 | Overdue |
| ptType.all / remind / cancel | 全部 / 提醒 / 取消 | All / Remind / Cancel |
| ptStatus.all / pending / executed / cancelled / failed | 全部 / 待执行 / 已执行 / 已作废 / 失败 | All / Pending / Executed / Cancelled / Failed |
| ptAction.execute / retry / resend | 立即执行 / 重试 / 重发提醒 | Execute / Retry / Resend |
| ptConfirm.execute / resend / compensate | 确认立即执行该任务？ / 确认重发该订单的待付款提醒？ / 确认执行一次补偿扫描？ | Execute this task now? / Resend the pending-payment reminder? / Run a compensation scan? |
| ptToast.compensated | 已处理 {n} 条 | {n} tasks processed |

- [ ] **Step 5: 构建验证 + 提交**

Run: `cd d:\zhao\vshop\web-admin; npm run build`
Expected: 构建成功无类型错误

```powershell
cd d:\zhao\vshop; git add web-admin/src; git commit -m "feat(web-admin): 支付超时观测页（列表/KPI/手动补偿）"
```

---

### Task 4: 券绑定卡片 + 详情弹层统计块

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\coupon.ts`（追加 3 个绑定 API）
- Create: `d:\zhao\vshop\web-admin\src\components\coupon\CouponBindingCard.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\coupon\edit\index.vue`（渠道含 PRODUCT 且已有模板 id 时渲染卡片）
- Modify: `d:\zhao\vshop\web-admin\src\pages\coupon\CouponDetailModal.vue`（顶部统计块）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` / `en.json`（couponBinding.* / couponDetailModal.stats* 键）

- [ ] **Step 1: 确认后端 binding admin 字段名**

Run: `grep -rn "listByTemplateAdmin\|bindProducts\|unbindProduct" d:\zhao\vendure\packages\coupon-plugin\src`
以输出为准确定 GraphQL 字段名与参数（预期形如 `couponBindingListByTemplateAdmin(templateId)` / `couponBindingBindProducts(templateId, productIds)` / `couponBindingUnbindProduct(templateId, bindingId)`；若命名不同，下述代码按实际改名）。

- [ ] **Step 2: apis/coupon.ts 追加绑定 API**

```ts
export interface TemplateBindingRow { id: string; productId: string; productVariantId: string; }

export async function fetchTemplateBindings(templateId: string): Promise<TemplateBindingRow[]> {
    const res = await getAdminClient().request<any>(
        `query($id: ID!) { couponBindingListByTemplateAdmin(templateId: $id) { id productId productVariantId } }`, { id: templateId });
    return res.couponBindingListByTemplateAdmin ?? [];
}

export async function bindTemplateProducts(templateId: string, productIds: string[]): Promise<void> {
    await getAdminClient().request<any>(
        `mutation($id: ID!, $productIds: [ID!]!) { couponBindingBindProducts(templateId: $id, productIds: $productIds) { id } }`,
        { id: templateId, productIds });
}

export async function unbindTemplateProduct(templateId: string, bindingId: string): Promise<void> {
    await getAdminClient().request<any>(
        `mutation($id: ID!, $bindingId: ID!) { couponBindingUnbindProduct(templateId: $id, bindingId: $bindingId) { id } }`,
        { id: templateId, bindingId });
}
```

（若 Step 1 查得参数/字段名不同，按实际改。）

- [ ] **Step 3: CouponBindingCard.vue**

按已确认 mockup 实现：已绑列表（商品名/SKU/价格/解绑）→ 搜索框 → 结果行（+绑定）。商品搜索复用 `fetchPickerProducts(term, ...)`（`apis/product`，pick-products 页先例，L112 有调用参数可参考）；商品名/价格从搜索结果缓存映射，绑定行内尽量展示（无则显示 productId）。解绑需 `uni.showModal` 确认。成功后 emit('changed') 并重载列表。文案键：`couponBinding.title / boundCount / searchPh / search / bind / unbind / confirmUnbind / saveFirst / unbound / bound`（zh/en 同步，en 例：Product Bindings / bound / Search products… / Search / Bind / Unbind / Unbind this product? / Save the template first / Unbound / Bound）。

- [ ] **Step 4: 接入券编辑页**

`pages/coupon/edit/index.vue` 在「分发渠道」field 之后插入：

```vue
<view class="field" v-if="form.channels.includes('PRODUCT')">
  <text class="label">{{ $t('couponBinding.title') }}</text>
  <CouponBindingCard v-if="form.id" :template-id="form.id" />
  <text v-else class="tip">{{ $t('couponBinding.saveFirst') }}</text>
</view>
```

（uni-app easycom 自动注册组件；若项目未启用 easycom，则按现有组件引入方式手动 import。）

- [ ] **Step 5: 详情弹层统计块**

`CouponDetailModal.vue` 顶部（tabs 之上）加一行统计：领取数 / 已核销数 / 核销率。数据源用该弹层现有的 issued/used 列表查询 total（先 grep `apis/coupon.ts` L360-390 区间确认现有 fetch 函数名与其返回 total 字段，若两个查询一次返回则直接用；否则并发两个 count 查询）。文案键：`couponDetailModal.statsIssued / statsUsed / statsRate`（zh：领取 / 已核销 / 核销率；en：Issued / Redeemed / Redemption rate）。

- [ ] **Step 6: 构建 + 提交**

Run: `npm run build` 通过。

```powershell
cd d:\zhao\vshop; git add web-admin/src; git commit -m "feat(web-admin): 商品专享券绑定卡片 + 券详情统计块"
```

---

### Task 5: 截图归档 + 操作手册 + 部署收口

**Files:**
- Create: `d:\zhao\vshop\web-admin\scripts\_shot_payment_timeout.py`（Playwright 桌面截图）
- Create: `d:\zhao\vshop\web-admin\docs\screenshots\payment-timeout\`（截图 2 张）
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`（追加两节）

- [ ] **Step 1: 本地起 web-admin 预览并对生产后端截图**

Playwright 桌面视口 **1440×900**（admin 为桌面后台，不适用手机截图规范）：登录生产 admin-api（superadmin 账号，复用登录 mutation `login(username,password){...on CurrentUser{id identifier}}` 与 vendure-token 渠道头），分别截「支付超时观测」页与「券编辑页绑定卡片区」。脚本参照 `d:\zhao\waimai\scripts\_shot_coupon_pages.py` 的 Playwright 写法，但 viewport 用 `1440,900`、`is_mobile=False`。截图存 `docs/screenshots/payment-timeout/`。

- [ ] **Step 2: 操作手册补两节**

`src/static/manual/index.html` 先读文件看现有章节标记模式，仿照追加：
- 「支付超时观测」：KPI 含义、筛选、立即执行/重试/重发提醒/手动补偿的操作时机（正常情况无需人工干预）
- 「商品专享券绑定」：新建券（含 PRODUCT 渠道）保存后绑定商品；改绑/解绑即时生效
并在手册中嵌入 Step 1 截图。

- [ ] **Step 3: 全量回归**

Run: vendure 包 `npx vitest run` 全绿；web-admin `npm run build` 成功。
Run: 线上部署后冒烟——admin-api GraphQL 查 `paymentTimeoutStats` 返回四字段；券编辑页绑定列表可开。

- [ ] **Step 4: 提交 + 部署**

```powershell
cd d:\zhao\vshop; git add web-admin; git commit -m "docs(web-admin): 支付超时观测/券绑定手册与截图"; git push
cd d:\zhao\vendure; git push
```

部署（按各仓既有机制）：
- vendure：服务器 `git pull && pm2 restart`（走部署协议；SSH 命令整段 base64 传避免 PowerShell 变量坑）
- web-admin：`cd d:\zhao\vshop\web-admin; node scripts/deploy.mjs`

- [ ] **Step 5: 收口确认**

部署后 `sleep 2` 再验：admin-api `paymentTimeoutTasks(skip:0, take:5)` 正常返回；观测页线上可打开（截图对比）；失败即按 pm2 日志回查，必要时 `git revert` + 重部署。

---

## Self-Review 记录

- Spec 覆盖：§3 五接口→Task 1/2；§4.1 观测页→Task 3；§4.2 绑定卡片→Task 4；§4.3 统计块→Task 4 Step 5；§5 错误处理→Task 3 confirmThen/错误码、Task 1 状态拒绝；§6 测试/手册/部署→Task 1-2 TDD + Task 5。✔
- 类型一致：`executeTaskNow/resendRemind/runCompensation(): number` 在 Task 1 定义、Task 2 引用一致；`PaymentTimeoutTaskRow` 前后端字段一致。✔
- 已知留白（执行者现场核对，非占位符）：binding admin 字段名（Task 4 Step 1 先 grep）、`extend` 关键字对齐现有 schema 模板、CouponDetailModal 现有 fetch 函数名、easycom 是否启用。每处都给了核对命令与兜底方案。
