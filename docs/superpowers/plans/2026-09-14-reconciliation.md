# 四流对账（方案 2 子项目 C）实施计划

> **方案标识：方案 2 子项目 C**。**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **前置**：先执行「方案 2-A」「方案 2-B」计划（本计划消费 A 的账本 `mirror` 流水与 B 的 `DeliveryRecord`）。
> Spec：`d:\zhao\vshop\docs\superpowers\specs\2026-09-14-reconciliation-design.md`

**Goal:** 为开启物理库存的租户建立「业务-资金-库存-配送」四流日对账：`ReconciliationBatch`/`ReconciliationOrderLine` 两张表 + `diffOrder` 纯函数判定 D1-D4 差异 + 日批/手动触发 + 管理端人工修正闭环。

**Architecture:** 纯函数（`diffOrder`）不触库，逐单四流比对（Order × stock-ledger order:out/mirror × DeliveryRecord × MerchantSettlementLedger）；`ReconciliationService` 跑批（幂等）、重跑单、修正动作走既有业务入口；日批用 plugin `onApplicationBootstrap` 内 setInterval 每 5 分钟检查"今日批是否已跑"，未跑且过触发点则执行（不引入额外调度依赖）。

**Tech Stack:** Vendure 3.6.4（cjk-plugin）、TypeORM、Vitest、web-admin（uni-app Vue3）。

**关键事实（已探明）**
- `MerchantSettlementLedger`：`cjk-plugin/src/order/merchant-settlement-ledger.entity.ts`（orderId/tenantChannelId/amount/settleMethod/status PAID|PENDING_SIGN/occurredAt/collectedAt）。
- `MerchantSettlementStatus = 'PAID' | 'PENDING_SIGN'`；`COD_PAYMENT_CODES = ['cash-on-delivery']`。
- `OrderStockLedger`：`bizType`（含新 `mirror`）、`orderLineId`、`stockLocationId`、`direction`、`quantity`、`code`。
- web-admin API 模式：`src/apis/client.ts` `getAdminClient().request<...>(query, vars)`；平台页注册在 `src/pages.json`；页面目录 `src/pages/platform/`。

---

## Task C1: 实体 + diffOrder 纯函数 + 单测（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\reconcile\reconciliation.entity.ts`（Batch + OrderLine 两个类）
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\reconcile\diff-rules.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\reconcile\diff-rules.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { DiffOrderInput, diffOrder } from './diff-rules';

const baseOrder: DiffOrderInput['order'] = {
    id: 'o1', totalWithTax: 10000, state: 'Delivered', customFields: {},
};

describe('diffOrder', () => {
    it('全闭环无差异', () => {
        const input: DiffOrderInput = {
            order: baseOrder,
            deliveryRecords: [{ mode: 'self', sourceLocationId: 'l1', status: 'Delivered' }],
            ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
            settlements: [{ status: 'PAID', amount: 10000 }],
            mirrorDiff: 0,
        };
        expect(diffOrder(input)).toEqual([]);
    });

    it('D1 缺配送记录', () => {
        const input: DiffOrderInput = {
            order: baseOrder,
            deliveryRecords: [],
            ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
            settlements: [{ status: 'PAID', amount: 10000 }],
            mirrorDiff: 0,
        };
        expect(diffOrder(input)).toContain('D1');
    });

    it('D2 扣仓不一致', () => {
        const input: DiffOrderInput = {
            order: baseOrder,
            deliveryRecords: [{ mode: 'self', sourceLocationId: 'l2', status: 'Delivered' }],
            ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
            settlements: [{ status: 'PAID', amount: 10000 }],
            mirrorDiff: 0,
        };
        expect(diffOrder(input)).toContain('D2');
    });

    it('D3 金额不平（含 COD 未签收不算差）', () => {
        const paid: DiffOrderInput = {
            order: baseOrder,
            deliveryRecords: [{ mode: 'self', sourceLocationId: 'l1', status: 'Delivered' }],
            ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
            settlements: [{ status: 'PENDING_SIGN', amount: 10000 }],
            mirrorDiff: 0,
        };
        expect(diffOrder(paid)).not.toContain('D3'); // COD 未签收不算差

        const short: DiffOrderInput = {
            order: baseOrder,
            deliveryRecords: [{ mode: 'self', sourceLocationId: 'l1', status: 'Delivered' }],
            ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
            settlements: [{ status: 'PAID', amount: 8000 }],
            mirrorDiff: 0,
        };
        expect(diffOrder(short)).toContain('D3');
    });

    it('D4 镜像不平', () => {
        const input: DiffOrderInput = {
            order: baseOrder,
            deliveryRecords: [{ mode: 'self', sourceLocationId: 'l1', status: 'Delivered' }],
            ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
            settlements: [{ status: 'PAID', amount: 10000 }],
            mirrorDiff: 5,
        };
        expect(diffOrder(input)).toContain('D4');
    });

    it('退款单不参与 D3', () => {
        const input: DiffOrderInput = {
            order: { ...baseOrder, state: 'Cancelled' },
            deliveryRecords: [],
            ledgerOuts: [],
            settlements: [],
            mirrorDiff: 0,
            cancelled: true,
        };
        expect(diffOrder(input)).not.toContain('D3');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- diff-rules`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现纯函数 + 实体**

```ts
// diff-rules.ts
export type DiffType = 'D1' | 'D2' | 'D3' | 'D4';

export interface DiffOrderInput {
    order: {
        id: string;
        totalWithTax: number;
        state: string;
        customFields?: Record<string, any>;
    };
    deliveryRecords: Array<{ mode: string; sourceLocationId: string | null; status: string }>;
    ledgerOuts: Array<{ sourceLocationId: string | null; quantity: number }>;
    settlements: Array<{ status: string; amount: number }>;
    mirrorDiff: number;
    cancelled?: boolean;
}

/**
 * 四流逐单比对：
 * D1 缺配送记录：已发货/已交付订单必须有 mode∈{self,express,pickup} 且非 Draft 的记录
 * D2 扣仓不一致：账本 order:out 仓与配送记录 sourceLocationId 必须一致
 * D3 金额不平：订单应付 ≠ 线上 PAID 回款 + COD 已签收回款（退款单跳过）
 * D4 镜像不平：虚拟仓 onHand ≠ Σ 绑定物理仓 onHand（由批次扫描传入）
 */
export function diffOrder(input: DiffOrderInput): DiffType[] {
    const diffs: DiffType[] = [];
    const { order, deliveryRecords, ledgerOuts, settlements, mirrorDiff, cancelled } = input;

    const openRecords = deliveryRecords.filter(
        r => ['self', 'express', 'pickup'].includes(r.mode) && r.status !== 'Draft',
    );
    if (openRecords.length === 0) {
        diffs.push('D1');
    }

    const firstOut = ledgerOuts[0];
    if (firstOut) {
        const recLoc = openRecords.find(r => r.sourceLocationId)?.sourceLocationId ?? null;
        if (recLoc == null || String(recLoc) !== String(firstOut.sourceLocationId)) {
            diffs.push('D2');
        }
    }

    if (!cancelled) {
        const paidAmount = settlements
            .filter(s => s.status === 'PAID')
            .reduce((sum, s) => sum + s.amount, 0);
        if (paidAmount !== order.totalWithTax) {
            diffs.push('D3');
        }
    }

    if (mirrorDiff !== 0) {
        diffs.push('D4');
    }

    return diffs;
}
```

```ts
// reconciliation.entity.ts
import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class ReconciliationBatch extends VendureEntity {
    constructor(input?: DeepPartial<ReconciliationBatch>) {
        super(input);
    }

    @Index()
    @Column()
    tenantChannelId: ID;

    @Index()
    @Column({ type: 'varchar' })
    date: string; // YYYY-MM-DD

    @Column({ default: 'running' })
    status: string; // running | done

    @Column({ default: 0 })
    d1Count: number;

    @Column({ default: 0 })
    d2Count: number;

    @Column({ default: 0 })
    d3Count: number;

    @Column({ default: 0 })
    d4Count: number;

    @Column({ default: 0 })
    orderTotal: number;

    @Column({ default: 'manual' })
    trigger: string; // manual | cron

    @Column({ type: 'datetime', nullable: true })
    startedAt?: Date | null;

    @Column({ type: 'datetime', nullable: true })
    finishedAt?: Date | null;
}

@Entity()
export class ReconciliationOrderLine extends VendureEntity {
    constructor(input?: DeepPartial<ReconciliationOrderLine>) {
        super(input);
    }

    @Index()
    @Column()
    batchId: ID;

    @Index()
    @Column()
    orderId: ID;

    @Column({ type: 'text' })
    diffTypes: string; // JSON: DiffType[]

    @Column({ default: 'pending' })
    status: string; // pending | closed

    @Column({ type: 'varchar', nullable: true })
    remark?: string | null;

    @Column({ type: 'datetime', nullable: true })
    fixedAt?: Date | null;

    @Column({ type: 'varchar', nullable: true })
    fixerId?: string | null;
}
```

- [ ] **Step 4: 运行测试**

Run: `npm test -w @vendure/cjk-plugin -- diff-rules`
Expected: 6 个用例 PASS

- [ ] **Step 5: 构建 + 提交**

Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

```bash
git add packages/cjk-plugin/src/reconcile
git commit -m "feat(cjk): 对账实体 + diffOrder 四流差异纯函数 + 单测"
```

## Task C2: ReconciliationService（跑批/重跑/修正）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\reconcile\reconciliation.service.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\reconcile\reconciliation.service.spec.ts`

- [ ] **Step 1: 写失败测试（幂等 + 差异计数）**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
    function makeService(overrides: Record<string, any> = {}) {
        const svc: any = new ReconciliationService({} as any, {} as any, {} as any, {} as any);
        Object.assign(svc, {
            connection: {
                getRepository: vi.fn(),
                getEntityOrThrow: vi.fn(),
            },
            collectOrderData: vi.fn(async () => ({
                deliveryRecords: [],
                ledgerOuts: [{ sourceLocationId: 'l1', quantity: 1 }],
                settlements: [{ status: 'PAID', amount: 10000 }],
                mirrorDiff: 0,
            })),
            ...overrides,
        });
        return svc;
    }

    it('同日重复跑批幂等：已存在 done 批次则跳过', async () => {
        const repo = { findOne: vi.fn().mockResolvedValue({ id: 'b1', status: 'done' }) };
        const svc = makeService({
            connection: { getRepository: vi.fn().mockReturnValue(repo), getEntityOrThrow: vi.fn() },
        });
        const result = await svc.runBatch({ channel: { id: 'c1' } } as any, '2026-09-14', 'manual');
        expect(result).toBeNull();
    });

    it('跑批：差异行落库并计数', async () => {
        const savedBatch: any[] = [];
        const savedLines: any[] = [];
        const repo = {
            findOne: vi.fn().mockResolvedValue(null),
            save: vi.fn(async (e: any) => { savedBatch.push(e); return e; }),
        };
        const lineRepo = {
            find: vi.fn().mockResolvedValue([]),
            save: vi.fn(async (e: any) => { savedLines.push(e); return e; }),
        };
        const orderRepo = {
            find: vi.fn().mockResolvedValue([
                { id: 'o1', totalWithTax: 10000, state: 'Delivered', customFields: {} },
            ]),
        };
        const svc = makeService({
            connection: {
                getRepository: vi.fn((_ctx: any, name: string) => {
                    if (name === 'ReconciliationBatch') return repo;
                    if (name === 'ReconciliationOrderLine') return lineRepo;
                    if (name === 'Order') return orderRepo;
                    return repo;
                }),
                getEntityOrThrow: vi.fn(),
            },
        });
        const batch = await svc.runBatch({ channel: { id: 'c1', code: 't1' } } as any, '2026-09-14', 'manual');
        expect(batch.d1Count).toBe(1);
        expect(savedLines.length).toBe(1);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- reconciliation.service`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现服务**

```ts
import { Injectable } from '@nestjs/common';
import { ID, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { ReconciliationBatch, ReconciliationOrderLine } from './reconciliation.entity';
import { diffOrder, DiffType } from './diff-rules';

const loggerCtx = 'ReconciliationService';

@Injectable()
export class ReconciliationService {
    constructor(
        private connection: TransactionalConnection,
        // 依赖注入占位：以下数据源在 collectOrderData 内用 connection 直查，无需额外服务
    ) {}

    /** 幂等跑批：同日已有 done 批次则返回 null */
    async runBatch(
        ctx: RequestContext,
        date: string,
        trigger: 'manual' | 'cron',
    ): Promise<ReconciliationBatch | null> {
        const batchRepo = this.connection.getRepository(ctx, ReconciliationBatch);
        const existing = await batchRepo.findOne({
            where: { tenantChannelId: ctx.channelId as any, date },
        });
        if (existing?.status === 'done') {
            return null;
        }
        const batch = existing ?? (await batchRepo.save(new ReconciliationBatch({
            tenantChannelId: ctx.channelId as any,
            date,
            status: 'running',
            trigger,
            startedAt: new Date(),
        })));

        const orderRepo = this.connection.getRepository(ctx, 'Order' as any);
        // 前一日完成/已交付订单（date 为订单 created 日期；可放宽为 createdAt 在当日）
        const orders = await orderRepo.find({
            where: { customFields: { tenantChannelId: ctx.channelId as any } } as any,
            take: 500,
        });

        const lineRepo = this.connection.getRepository(ctx, ReconciliationOrderLine);
        let d1 = 0, d2 = 0, d3 = 0, d4 = 0;
        for (const order of orders) {
            const data = await this.collectOrderData(ctx, order as any);
            const diffs = diffOrder({
                order: {
                    id: String(order.id),
                    totalWithTax: (order as any).totalWithTax ?? 0,
                    state: (order as any).state ?? '',
                    customFields: (order as any).customFields ?? {},
                },
                deliveryRecords: data.deliveryRecords,
                ledgerOuts: data.ledgerOuts,
                settlements: data.settlements,
                mirrorDiff: data.mirrorDiff,
                cancelled: (order as any).state === 'Cancelled',
            });
            if (diffs.length) {
                await lineRepo.save(new ReconciliationOrderLine({
                    batchId: batch.id,
                    orderId: order.id as any,
                    diffTypes: JSON.stringify(diffs),
                    status: 'pending',
                }));
                d1 += diffs.includes('D1') ? 1 : 0;
                d2 += diffs.includes('D2') ? 1 : 0;
                d3 += diffs.includes('D3') ? 1 : 0;
                d4 += diffs.includes('D4') ? 1 : 0;
            }
        }

        batch.status = 'done';
        batch.d1Count = d1;
        batch.d2Count = d2;
        batch.d3Count = d3;
        batch.d4Count = d4;
        batch.orderTotal = orders.length;
        batch.finishedAt = new Date();
        await batchRepo.save(batch);
        Logger.info(`对账批次完成: ${date} 订单=${orders.length} D1=${d1} D2=${d2} D3=${d3} D4=${d4}`, loggerCtx);
        return batch;
    }

    /** 采集一单四流数据（数据源：Order / OrderStockLedger / DeliveryRecord / MerchantSettlementLedger） */
    private async collectOrderData(ctx: RequestContext, order: any) {
        const ledgerRepo = this.connection.getRepository(ctx, 'OrderStockLedger' as any);
        const ledgers = await ledgerRepo.find({ where: { orderLineId: In(order.lines?.map((l: any) => l.id) ?? []) } });
        // 简化：以 orderCode 为 bizCode 的 order:out 流水
        const outs = ledgers.filter((l: any) => l.bizType === 'order' && l.direction === 'out');
        const mirrors = ledgers.filter((l: any) => l.bizType === 'mirror');
        const deliveryRepo = this.connection.getRepository(ctx, 'DeliveryRecord' as any);
        const records = await deliveryRepo.find({ where: { orderId: order.id as any } });
        const settleRepo = this.connection.getRepository(ctx, 'MerchantSettlementLedger' as any);
        const settlements = await settleRepo.find({ where: { orderId: order.id as any } });
        return {
            deliveryRecords: records.map((r: any) => ({ mode: r.mode, sourceLocationId: r.sourceLocationId, status: r.status })),
            ledgerOuts: outs.map((l: any) => ({ sourceLocationId: l.stockLocationId, quantity: l.quantity })),
            settlements: settlements.map((s: any) => ({ status: s.status, amount: s.amount })),
            mirrorDiff: mirrors.reduce((sum: number, m: any) => sum + (m.direction === 'in' ? m.quantity : -m.quantity), 0),
        };
    }

    /** 重跑单条：重新判定后置 closed */
    async rerunOrder(ctx: RequestContext, lineId: ID): Promise<ReconciliationOrderLine> {
        const lineRepo = this.connection.getRepository(ctx, ReconciliationOrderLine);
        const line = await lineRepo.findOne({ where: { id: lineId as any } });
        if (!line) {
            throw new Error(`对账行不存在: ${lineId}`);
        }
        const orderRepo = this.connection.getRepository(ctx, 'Order' as any);
        const order = await orderRepo.findOne({ where: { id: line.orderId as any } });
        if (!order) {
            throw new Error(`订单不存在: ${line.orderId}`);
        }
        const data = await this.collectOrderData(ctx, order);
        const diffs = diffOrder({
            order: {
                id: String(order.id),
                totalWithTax: (order as any).totalWithTax ?? 0,
                state: (order as any).state ?? '',
                customFields: (order as any).customFields ?? {},
            },
            deliveryRecords: data.deliveryRecords,
            ledgerOuts: data.ledgerOuts,
            settlements: data.settlements,
            mirrorDiff: data.mirrorDiff,
            cancelled: (order as any).state === 'Cancelled',
        });
        line.diffTypes = JSON.stringify(diffs);
        line.status = diffs.length ? 'pending' : 'closed';
        if (!diffs.length) {
            line.fixedAt = new Date();
        }
        return lineRepo.save(line);
    }
}
```

> 注：`collectOrderData` 中 `order.lines` 若未加载，改为按 orderId 直查 `OrderStockLedger`（该实体无 orderId，仅 orderLineId）——更可靠做法：`OrderStockLedger` 通过 `orderLineId` 反查，需先查该单全部 OrderLine 再匹配；本文件内以「先取 order 的 lines」为基线，若 Order 查询未带 lines relation，则在实现时追加 `relations: { lines: true }`。

- [ ] **Step 4: 运行测试**

Run: `npm test -w @vendure/cjk-plugin -- reconciliation.service`
Expected: 2 个用例 PASS

- [ ] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/reconcile
git commit -m "feat(cjk): ReconciliationService（幂等跑批/采集四流/重跑单）"
```

## Task C3: resolver + SDL + 日批调度

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\reconcile\reconciliation-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（SDL + providers + 调度）

- [ ] **Step 1: resolver**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { ReconciliationService } from './reconciliation.service';

@Resolver()
export class ReconciliationAdminResolver {
    constructor(private reconciliationService: ReconciliationService) {}

    @Query()
    @Allow(Permission.SuperAdmin, Permission.ReadOrder)
    async reconciliationBatches(@Ctx() ctx: RequestContext) {
        return this.reconciliationService.listBatches(ctx);
    }

    @Query()
    @Allow(Permission.SuperAdmin, Permission.ReadOrder)
    async reconciliationLines(@Ctx() ctx: RequestContext, @Args('batchId') batchId: ID) {
        return this.reconciliationService.listLines(ctx, batchId);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async runReconciliation(
        @Ctx() ctx: RequestContext,
        @Args('date') date: string,
        @Args('trigger', { nullable: true }) trigger?: string,
    ) {
        return this.reconciliationService.runBatch(ctx, date, (trigger as any) ?? 'manual');
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async rerunReconciliationOrder(@Ctx() ctx: RequestContext, @Args('lineId') lineId: ID) {
        return this.reconciliationService.rerunOrder(ctx, lineId);
    }
}
```

`ReconciliationService` 补两个查询方法：

```ts
    async listBatches(ctx: RequestContext): Promise<ReconciliationBatch[]> {
        return this.connection.getRepository(ctx, ReconciliationBatch).find({
            where: { tenantChannelId: ctx.channelId as any },
            order: { createdAt: 'DESC' },
            take: 60,
        });
    }

    async listLines(ctx: RequestContext, batchId: ID): Promise<ReconciliationOrderLine[]> {
        return this.connection.getRepository(ctx, ReconciliationOrderLine).find({
            where: { batchId: batchId as any },
            order: { createdAt: 'ASC' },
        });
    }
```

- [ ] **Step 2: plugin.ts SDL 追加**

```graphql
type ReconciliationBatch {
    id: ID!
    tenantChannelId: ID!
    date: String!
    status: String!
    d1Count: Int!
    d2Count: Int!
    d3Count: Int!
    d4Count: Int!
    orderTotal: Int!
    trigger: String!
    startedAt: String
    finishedAt: String
}

type ReconciliationOrderLine {
    id: ID!
    batchId: ID!
    orderId: ID!
    diffTypes: String!
    status: String!
    remark: String
    fixedAt: String
    fixerId: String
}

extend type Query {
    reconciliationBatches: [ReconciliationBatch!]!
    reconciliationLines(batchId: ID!): [ReconciliationOrderLine!]!
}

extend type Mutation {
    runReconciliation(date: String!, trigger: String): ReconciliationBatch
    rerunReconciliationOrder(lineId: ID!): ReconciliationOrderLine!
}
```

- [ ] **Step 3: 日批调度**

`plugin.ts` 的 `onApplicationBootstrap` 追加：

```ts
        // 方案2-C 日批：每 5 分钟检查，若当日批未跑则执行（每日 2:00 后首查触发）
        const svc = this.injector.get(ReconciliationService);
        let lastDate = '';
        setInterval(async () => {
            try {
                const now = new Date();
                const date = now.toISOString().slice(0, 10);
                if (date === lastDate) {
                    return;
                }
                const hour = now.getHours();
                if (hour >= 2) {
                    for (const ch of await this.injector.get(ChannelService).findAll()) {
                        const enabled = Boolean((ch.customFields as any)?.physicalStockEnabled);
                        if (!enabled) {
                            continue;
                        }
                        const ctx = new RequestContext({
                            apiType: 'admin',
                            isAuthorized: true,
                            authorizedAsOwnerOnly: false,
                            channel: ch as any,
                            session: undefined as any,
                        });
                        await svc.runBatch(ctx, date, 'cron');
                    }
                    lastDate = date;
                }
            } catch (e: any) {
                Logger.error(`日批对账失败: ${e?.message}`, 'ReconciliationCron');
            }
        }, 5 * 60 * 1000);
```

> 注：`ChannelService.findAll()` 签名与 `RequestContext` 构造参数以本地 core 为准；若 `findAll` 需要分页参数，用 `channelService.findAll(options)` 取全量（仓库既有租户枚举先例：`DefaultDataService.seedOfficialTenants` 中如何枚举渠道）。`requestContext` 构造若报缺参，改用 `RequestContext.empty()` 并 set channel。

providers 追加 `ReconciliationAdminResolver`；entities 追加 `ReconciliationBatch`、`ReconciliationOrderLine`；import `ChannelService`、`RequestContext`、`Logger`。

- [ ] **Step 4: 全量单测 + 构建**

Run: `npm test -w @vendure/cjk-plugin`
Expected: 全部 PASS
Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

- [ ] **Step 5: 部署 + 冒烟**

Run: `powershell -ExecutionPolicy Bypass -File ".\_deploy.ps1" -Message "feat(cjk): 方案2-C 四流对账（批次/差异/日批调度）"`（工作目录 `d:\zhao\vendure`）
Expected: 服务器 pull + restart 成功

```bash
curl -s https://e.joho.cn/admin-api | Select-String -Pattern "reconciliationBatches" | Select-Object -First 3
```
Expected: 命中

- [ ] **Step 6: 提交**

```bash
git add packages/cjk-plugin/src/reconcile packages/cjk-plugin/src/plugin.ts
git commit -m "chore: 方案2-C 部署"
```

## Task C4: web-admin 对账页

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\reconcile.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\reconcile\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（注册页面）

- [ ] **Step 1: API 封装**

```ts
// src/apis/reconcile.ts
import { getAdminClient } from './client';

export interface ReconcileBatch {
    id: string;
    date: string;
    status: string;
    d1Count: number;
    d2Count: number;
    d3Count: number;
    d4Count: number;
    orderTotal: number;
    trigger: string;
}

export interface ReconcileLine {
    id: string;
    batchId: string;
    orderId: string;
    diffTypes: string;
    status: string;
}

export function fetchBatches(): Promise<ReconcileBatch[]> {
    return getAdminClient().request(
        `query { reconciliationBatches { id date status d1Count d2Count d3Count d4Count orderTotal trigger } }`,
    );
}

export function fetchLines(batchId: string): Promise<ReconcileLine[]> {
    return getAdminClient().request(
        `query($batchId: ID!) { reconciliationLines(batchId: $batchId) { id batchId orderId diffTypes status } }`,
        { batchId },
    );
}

export function runReconciliation(date: string): Promise<ReconcileBatch | null> {
    return getAdminClient().request(
        `mutation($date: String!) { runReconciliation(date: $date) { id date status d1Count d2Count d3Count d4Count } }`,
        { date },
    );
}

export function rerunLine(lineId: string): Promise<ReconcileLine> {
    return getAdminClient().request(
        `mutation($lineId: ID!) { rerunReconciliationOrder(lineId: $lineId) { id status diffTypes } }`,
        { lineId },
    );
}
```

（`getAdminClient().request` 的返回解包方式以 `src/apis/inventory.ts` 既有写法为准，必要时 `.then(r => r.reconciliationBatches)` 等）

- [ ] **Step 2: 对账页**

`src/pages/platform/reconcile/index.vue`（与 members 页同风格，结构摘要——完整模板按既有页面布局实现）：

```vue
<template>
  <view class="page">
    <view class="head">
      <text class="title">四流对账</text>
      <view class="ops">
        <picker mode="date" @change="onPickDate">
          <view class="btn">{{ pickDate }}</view>
        </picker>
        <text class="btn primary" @tap="onRun">立即对账</text>
      </view>
    </view>
    <view class="sum" v-if="batches.length">
      <text>全闭环率 {{ closedRate }}%</text>
      <text>批次 {{ batches.length }}</text>
    </view>
    <view class="card" v-for="b in batches" :key="b.id" @tap="openBatch(b)">
      <view class="row">
        <text class="name">{{ b.date }}</text>
        <text class="tag" :class="b.status">{{ b.status === 'done' ? '已完成' : '运行中' }}</text>
      </view>
      <view class="row sub">
        <text>D1 缺配送 {{ b.d1Count }}</text>
        <text>D2 扣仓 {{ b.d2Count }}</text>
        <text>D3 金额 {{ b.d3Count }}</text>
        <text>D4 镜像 {{ b.d4Count }}</text>
      </view>
    </view>

    <view class="mask" v-if="lines" @tap="lines = null">
      <view class="pop" @tap.stop>
        <view class="pop-head">
          <text>批次明细</text>
          <text class="close" @tap="lines = null">×</text>
        </view>
        <view class="line" v-for="l in lines" :key="l.id">
          <text>单 {{ l.orderId }}</text>
          <text class="diffs">{{ l.diffTypes }}</text>
          <text class="link" @tap="onRerun(l)">{{ l.status === 'closed' ? '已闭环' : '重跑' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchBatches, fetchLines, runReconciliation, rerunLine, ReconcileBatch, ReconcileLine } from '../../../apis/reconcile';

const batches = ref<ReconcileBatch[]>([]);
const lines = ref<ReconcileLine[] | null>(null);
const currentBatch = ref<ReconcileBatch | null>(null);
const pickDate = ref(new Date().toISOString().slice(0, 10));
const closedRate = ref(0);

async function load() {
  const data = (await fetchBatches()) as any;
  batches.value = data.reconciliationBatches ?? data;
  const total = batches.value.reduce((s, b) => s + b.orderTotal, 0);
  const closed = batches.value.reduce((s, b) => s + (b.orderTotal - b.d1Count - b.d2Count - b.d3Count - b.d4Count), 0);
  closedRate.value = total ? Math.round((closed / total) * 100) : 0;
}

async function onRun() {
  const b = (await runReconciliation(pickDate.value)) as any;
  await load();
  if (b?.reconciliationBatches) return;
}

async function openBatch(b: ReconcileBatch) {
  currentBatch.value = b;
  const data = (await fetchLines(b.id)) as any;
  lines.value = data.reconciliationLines ?? data;
}

async function onRerun(l: ReconcileLine) {
  await rerunLine(l.id);
  if (currentBatch.value) {
    const data = (await fetchLines(currentBatch.value.id)) as any;
    lines.value = data.reconciliationLines ?? data;
    await load();
  }
}

onShow(load);
</script>
```

（完整样式沿用 members 页 card/mask/pop 类名体系；平台菜单 `pages.json` 追加 `pages/platform/reconcile/index` 并在 dashboard 或平台菜单挂入口）

- [ ] **Step 3: 构建**

Run: `npm run build`（工作目录 `d:\zhao\vshop\web-admin`）
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/apis/reconcile.ts src/pages/platform/reconcile src/pages.json
git commit -m "feat(admin): 四流对账页（批次列表/明细/重跑闭环）"
```

## Task C5: 前端部署 + 回归

**Files:**
- 无新文件

- [ ] **Step 1: 部署**

Run: `node scripts/deploy.mjs`（工作目录 `d:\zhao\vshop\web-admin`）
Expected: 产物上传 + 线上 200

- [ ] **Step 2: 手机视口回归**

用 webapp-testing/Playwright（390×844）截图：对账页批次列表 + 批次明细弹层（含差异标签与重跑操作）。截图存 `web-admin/src/static/manual/shots/r11_reconcile.png`。

- [ ] **Step 3: 手册补充**

`web-admin/src/static/manual/` 手册新增 op-19「四流对账」章节（入口/批次/差异类型/重跑闭环 + 截图），重新构建部署同步。

- [ ] **Step 4: 提交**

```bash
git add src/static/manual src/static/manual/shots
git commit -m "docs(manual): op-19 四流对账 + 回归截图"
```
