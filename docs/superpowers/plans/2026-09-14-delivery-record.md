# 物流配送与真实配送记录（方案 2 子项目 B）实施计划

> **方案标识：方案 2 子项目 B**。**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **前置**：先执行「方案 2-A」计划（本计划消费 `VirtualPhysicalStockService.adjustStockPublic` 与 `kind` 字段）。未开启物理仓租户自动跳过（原流程零影响）。
> Spec：`d:\zhao\vshop\docs\superpowers\specs\2026-09-14-delivery-record-design.md`

**Goal:** 为开启物理库存的租户建立 `DeliveryRecord`（每单销售 ↔ 一笔真实配送记录），覆盖 self/express/pickup 三种顾客交付模式 + transfer 内部履约链，发货扣减仓与配送记录强一致。

**Architecture:** 复用既有：delivery-plugin（自营派单/签收，状态映射）、cjk-plugin 的 `PickupLocation`（自提点）、`Order.deliveryType/selectedPickupLocationId`。新增 `DeliveryRecord` 实体 + 状态机纯函数 + Service；在 `StockMovementEvent` SALE 阻塞处理器（方案2-A 同事件第二个 handler）按 `orderId+stockLocationId` 分组生成顾客记录（天然防漏单）；自提点加 `stockType`（own/remote），remote 走 `transfer` 记录（Arrived 入自提点仓并触发镜像）。

**Tech Stack:** Vendure 3.6.4、TypeORM、Vitest、GraphQL（cjk-plugin 内实现）。

**关键事实（已探明）**
- `PickupLocation` 实体：`cjk-plugin/src/pickup/pickup-location.entity.ts`（name/type/address/coordinates{lat,lng}/channels/enabled/sortOrder 等）。
- `Order` customFields 含 `deliveryType`（delivery/pickup）、`selectedPickupLocationId`、`pickupType`（`order-custom-fields.ts`）。
- delivery-plugin：`DeliveryService` 方法 `startDelivery/markDelivered/reportException/reassignDelivery`，状态 `Assigned/InProgress/Delivered/Exception`（`delivery-plugin/src/delivery.service.ts`）。
- SALE 阻塞处理器注册模式参照方案2-A Task A4；`Sale` 含 `productVariantId/stockLocationId/quantity/orderLine`。
- 未开启物理仓租户：`ctx.channel.customFields.physicalStockEnabled === true` 才建记录。

---

## Task B1: DeliveryRecord 实体 + 状态机纯函数 + 单测（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-record.entity.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-state.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-state.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { DELIVERY_TRANSITIONS, validateDeliveryTransition } from './delivery-state';

describe('delivery-state', () => {
    it('self/express 正常链路合法', () => {
        expect(validateDeliveryTransition('self', 'Draft', 'Shipped')).toBe(true);
        expect(validateDeliveryTransition('express', 'Shipped', 'InTransit')).toBe(true);
        expect(validateDeliveryTransition('self', 'InProgress', 'Delivered')).toBe(true);
    });

    it('pickup 链路合法', () => {
        expect(validateDeliveryTransition('pickup', 'PickupPending', 'PickupReady')).toBe(true);
        expect(validateDeliveryTransition('pickup', 'PickupReady', 'Completed')).toBe(true);
    });

    it('transfer 链路合法', () => {
        expect(validateDeliveryTransition('transfer', 'TransferPending', 'InTransit')).toBe(true);
        expect(validateDeliveryTransition('transfer', 'InTransit', 'Arrived')).toBe(true);
    });

    it('非法迁移拒绝', () => {
        expect(validateDeliveryTransition('express', 'Draft', 'Delivered')).toBe(false);
        expect(validateDeliveryTransition('self', 'Delivered', 'InProgress')).toBe(false);
        expect(validateDeliveryTransition('pickup', 'Draft', 'Completed')).toBe(false);
    });

    it('异常分支合法', () => {
        expect(validateDeliveryTransition('express', 'Shipped', 'Exception')).toBe(true);
        expect(validateDeliveryTransition('express', 'Exception', 'Returned')).toBe(true);
        expect(validateDeliveryTransition('self', 'InTransit', 'Returned')).toBe(true);
    });

    it('未知状态/模式拒绝', () => {
        expect(validateDeliveryTransition('express', 'Nope', 'Shipped')).toBe(false);
        expect(validateDeliveryTransition('unknown', 'Draft', 'Shipped')).toBe(false);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- delivery-state`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现状态机纯函数**

```ts
export type DeliveryMode = 'self' | 'express' | 'pickup' | 'transfer';
export type DeliveryState =
    | 'Draft'
    | 'Shipped'
    | 'InTransit'
    | 'Delivered'
    | 'Assigned'
    | 'InProgress'
    | 'PickupPending'
    | 'PickupReady'
    | 'Completed'
    | 'TransferPending'
    | 'Arrived'
    | 'Exception'
    | 'Returned';

export const DELIVERY_TRANSITIONS: Record<DeliveryMode, Record<DeliveryState, DeliveryState[]>> = {
    self: {
        Draft: ['Assigned', 'Shipped', 'InProgress', 'InTransit', 'Exception', 'Returned'],
        Assigned: ['InProgress', 'InTransit', 'Exception', 'Returned'],
        InProgress: ['Delivered', 'Exception', 'Returned'],
        InTransit: ['Delivered', 'Exception', 'Returned'],
        Shipped: ['InTransit', 'Exception', 'Returned'],
        Delivered: [],
        Exception: ['Returned', 'InTransit', 'InProgress'],
        Returned: [],
        TransferPending: [], PickupPending: [], PickupReady: [], Completed: [], Arrived: [],
    },
    express: {
        Draft: ['Shipped', 'Exception', 'Returned'],
        Shipped: ['InTransit', 'Exception', 'Returned'],
        InTransit: ['Delivered', 'Exception', 'Returned'],
        Delivered: [],
        Exception: ['Returned', 'InTransit'],
        Returned: [],
        Assigned: [], InProgress: [], TransferPending: [], PickupPending: [], PickupReady: [], Completed: [], Arrived: [],
    },
    pickup: {
        PickupPending: ['PickupReady', 'Exception', 'Returned'],
        PickupReady: ['Completed', 'Exception', 'Returned'],
        Completed: [],
        Exception: ['Returned', 'PickupReady'],
        Returned: [],
        Draft: [], Shipped: [], InTransit: [], Delivered: [], Assigned: [], InProgress: [],
        TransferPending: [], Arrived: [],
    },
    transfer: {
        TransferPending: ['InTransit', 'Exception'],
        InTransit: ['Arrived', 'Exception', 'Returned'],
        Arrived: [],
        Exception: ['Returned', 'InTransit', 'TransferPending'],
        Returned: [],
        Draft: [], Shipped: [], Delivered: [], Assigned: [], InProgress: [],
        PickupPending: [], PickupReady: [], Completed: [],
    },
};

export function validateDeliveryTransition(
    mode: DeliveryMode,
    from: DeliveryState,
    to: DeliveryState,
): boolean {
    const table = DELIVERY_TRANSITIONS[mode];
    if (!table) {
        return false;
    }
    const allowed = table[from];
    if (!allowed) {
        return false;
    }
    return allowed.includes(to);
}
```

- [ ] **Step 4: 实体**

```ts
import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';
import { DeliveryMode, DeliveryState } from './delivery-state';

@Entity()
export class DeliveryRecord extends VendureEntity {
    constructor(input?: DeepPartial<DeliveryRecord>) {
        super(input);
    }

    @Index()
    @Column()
    orderId: ID;

    @Column({ type: 'varchar', nullable: true })
    fulfillmentId?: ID | null;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    sourceLocationId?: ID | null;

    @Column({ default: 'self' })
    mode: DeliveryMode;

    @Column({ default: 'Draft' })
    status: DeliveryState;

    @Column({ type: 'varchar', nullable: true })
    expressCompany?: string | null;

    @Column({ type: 'varchar', nullable: true })
    trackingNo?: string | null;

    @Column({ type: 'varchar', nullable: true })
    staffId?: string | null;

    @Column({ type: 'varchar', nullable: true })
    staffName?: string | null;

    @Column({ type: 'varchar', nullable: true })
    receiverName?: string | null;

    @Column({ type: 'varchar', nullable: true })
    receiverPhone?: string | null;

    @Column({ type: 'varchar', nullable: true })
    receiverAddress?: string | null;

    @Column({ type: 'float', nullable: true })
    lat?: number | null;

    @Column({ type: 'float', nullable: true })
    lng?: number | null;

    @Column({ type: 'varchar', nullable: true })
    pickupLocationId?: ID | null;

    @Column({ type: 'varchar', nullable: true })
    fromLocationId?: ID | null;

    @Column({ type: 'varchar', nullable: true })
    toLocationId?: ID | null;

    /** transfer 明细 [{variantId, quantity}] */
    @Column({ type: 'text', nullable: true })
    itemsJson?: string | null;

    @Column({ type: 'datetime', nullable: true })
    sentAt?: Date | null;

    @Column({ type: 'datetime', nullable: true })
    deliveredAt?: Date | null;

    @Column({ type: 'datetime', nullable: true })
    returnedAt?: Date | null;

    @Column({ type: 'datetime', nullable: true })
    exceptionAt?: Date | null;

    @Column({ type: 'text', nullable: true })
    photos?: string | null;

    @Column({ type: 'varchar', nullable: true })
    remark?: string | null;

    @Column({ type: 'varchar', nullable: true })
    orderBoxId?: string | null;
}
```

- [ ] **Step 5: 运行测试 + 提交**

Run: `npm test -w @vendure/cjk-plugin -- delivery-state`
Expected: 6 个用例 PASS
Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功
提交：

```bash
git add packages/cjk-plugin/src/delivery
git commit -m "feat(cjk): DeliveryRecord 实体 + 四模式状态机纯函数"
```

## Task B2: DeliveryRecordService + 单测

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-record.service.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-record.service.spec.ts`

- [ ] **Step 1: 写失败测试（createFromSales 分组 + transition 校验）**

```ts
import { describe, expect, it, vi } from 'vitest';
import { DeliveryRecordService } from './delivery-record.service';

describe('DeliveryRecordService', () => {
    function makeService(overrides: Record<string, any> = {}) {
        const saved: any[] = [];
        const svc: any = new DeliveryRecordService({} as any, {} as any);
        Object.assign(svc, {
            connection: {
                getRepository: vi.fn().mockReturnValue({
                    find: vi.fn().mockResolvedValue([]),
                    save: vi.fn(async (e: any) => { saved.push(e); return e; }),
                }),
            },
            physicalEnabled: vi.fn(async () => true),
            orderLinesRepo: { find: vi.fn().mockResolvedValue([{ id: 'ol1', orderId: 'o1' }]) },
            ...overrides,
        });
        svc.__saved = saved;
        return svc;
    }

    it('SALE 按 orderId+sourceLocationId 分组生成记录（2 仓=2 条）', async () => {
        const svc = makeService();
        const sales: any[] = [
            { productVariantId: 'p1', stockLocationId: 'l1', quantity: 2, orderLine: { id: 'ol1' } },
            { productVariantId: 'p1', stockLocationId: 'l2', quantity: 3, orderLine: { id: 'ol1' } },
        ];
        await svc.createFromSales({} as any, sales);
        expect(svc.__saved.length).toBe(2);
        const modes = svc.__saved.map((s: any) => s.mode);
        expect(modes).toEqual(['self', 'self']);
    });

    it('未开启物理仓租户跳过', async () => {
        const svc = makeService({ physicalEnabled: vi.fn(async () => false) });
        await svc.createFromSales({} as any, [{ productVariantId: 'p1', stockLocationId: 'l1', quantity: 1 }] as any);
        expect(svc.__saved.length).toBe(0);
    });

    it('已存在同 orderId+sourceLocationId 未完成记录则跳过（防重复）', async () => {
        const svc = makeService({
            connection: {
                getRepository: vi.fn().mockReturnValue({
                    find: vi.fn().mockResolvedValue([{ id: 'd1', status: 'Draft' }]),
                    save: vi.fn(async (e: any) => { svc.__saved.push(e); return e; }),
                }),
            },
        });
        await svc.createFromSales({} as any, [{ productVariantId: 'p1', stockLocationId: 'l1', quantity: 1, orderLine: { id: 'ol1' } }] as any);
        expect(svc.__saved.length).toBe(0);
    });

    it('非法状态迁移抛错', async () => {
        const svc = makeService({
            connection: {
                getRepository: vi.fn().mockReturnValue({
                    findOne: vi.fn().mockResolvedValue({ id: 'd1', mode: 'express', status: 'Draft' }),
                    save: vi.fn(async (e: any) => e),
                }),
            },
        });
        await expect(svc.transition({} as any, 'd1', 'Delivered')).rejects.toThrow(/非法状态迁移/);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- delivery-record.service`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现服务**

```ts
import { Injectable } from '@nestjs/common';
import { ID, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { Sale } from '@vendure/core';
import { DeliveryRecord } from './delivery-record.entity';
import { DeliveryMode, DeliveryState, validateDeliveryTransition } from './delivery-state';

const loggerCtx = 'DeliveryRecordService';

@Injectable()
export class DeliveryRecordService {
    constructor(private connection: TransactionalConnection) {}

    private physicalEnabled(ctx: RequestContext): boolean {
        return Boolean((ctx.channel.customFields as any)?.physicalStockEnabled);
    }

    /** 依 SALE 事件生成顾客配送记录：按 orderId+sourceLocationId 分组，幂等防重 */
    async createFromSales(ctx: RequestContext, sales: Sale[]): Promise<DeliveryRecord[]> {
        if (!this.physicalEnabled(ctx) || !sales?.length) {
            return [];
        }
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        // orderLine -> orderId
        const lineIds = [...new Set(sales.map(s => String((s.orderLine as any)?.id ?? s.orderLineId)))].filter(Boolean);
        const orderLines = lineIds.length
            ? await this.connection.getRepository(ctx, 'OrderLine' as any).find({ where: { id: In(lineIds) } })
            : [];
        const lineOrderMap = new Map(orderLines.map((ol: any) => [String(ol.id), String(ol.orderId)]));

        const groups = new Map<string, { orderId: string; sourceLocationId: ID | null; quantity: number; lineIds: string[] }>();
        for (const sale of sales) {
            const lineId = String((sale.orderLine as any)?.id ?? sale.orderLineId);
            const orderId = lineOrderMap.get(lineId) ?? String((sale as any).orderId ?? '');
            if (!orderId) {
                continue;
            }
            const key = `${orderId}|${sale.stockLocationId}`;
            const g = groups.get(key) ?? {
                orderId, sourceLocationId: sale.stockLocationId, quantity: 0, lineIds: [],
            };
            g.quantity += sale.quantity;
            g.lineIds.push(lineId);
            groups.set(key, g);
        }

        const created: DeliveryRecord[] = [];
        for (const g of groups.values()) {
            const dup = await repo.find({
                where: {
                    orderId: g.orderId as any,
                    sourceLocationId: g.sourceLocationId as any,
                },
            });
            const open = dup.filter(d => d.status !== 'Delivered' && d.status !== 'Completed' && d.status !== 'Returned');
            if (open.length) {
                continue; // 防重复
            }
            const record = await repo.save(
                new DeliveryRecord({
                    orderId: g.orderId as any,
                    sourceLocationId: g.sourceLocationId as any,
                    mode: 'self',
                    status: 'Draft',
                }),
            );
            created.push(record);
            Logger.info(`配送记录已生成: order=${g.orderId} loc=${g.sourceLocationId}`, loggerCtx);
        }
        return created;
    }

    /** 状态流转（校验合法迁移 + 记录时间戳） */
    async transition(ctx: RequestContext, id: ID, to: DeliveryState): Promise<DeliveryRecord> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        const record = await repo.findOne({ where: { id: id as any } });
        if (!record) {
            throw new Error(`配送记录不存在: ${id}`);
        }
        if (!validateDeliveryTransition(record.mode, record.status, to)) {
            throw new Error(`非法状态迁移: ${record.mode} ${record.status} -> ${to}`);
        }
        record.status = to;
        const now = new Date();
        if (to === 'Delivered' || to === 'Completed') {
            record.deliveredAt = now;
        } else if (to === 'Returned') {
            record.returnedAt = now;
        } else if (to === 'Exception') {
            record.exceptionAt = now;
        } else if (to === 'Shipped' || to === 'Assigned' || to === 'InProgress') {
            record.sentAt = now;
        }
        return repo.save(record);
    }

    /** 快递录单 */
    async setExpress(
        ctx: RequestContext,
        id: ID,
        expressCompany: string,
        trackingNo: string,
    ): Promise<DeliveryRecord> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        const record = await repo.findOne({ where: { id: id as any } });
        if (!record) {
            throw new Error(`配送记录不存在: ${id}`);
        }
        record.mode = 'express';
        record.expressCompany = expressCompany;
        record.trackingNo = trackingNo;
        if (record.status === 'Draft') {
            record.status = 'Shipped';
            record.sentAt = new Date();
        }
        return repo.save(record);
    }

    /** 自营指派 */
    async assignStaff(ctx: RequestContext, id: ID, staffId: string, staffName?: string): Promise<DeliveryRecord> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        const record = await repo.findOne({ where: { id: id as any } });
        if (!record) {
            throw new Error(`配送记录不存在: ${id}`);
        }
        record.staffId = staffId;
        record.staffName = staffName ?? null;
        if (record.status === 'Draft') {
            record.status = 'Assigned';
            record.sentAt = new Date();
        }
        return repo.save(record);
    }

    /** 自提点模式重设（pickup 订单发货时调用） */
    async markAsPickup(
        ctx: RequestContext,
        id: ID,
        pickupLocationId: ID,
        mode: DeliveryMode = 'pickup',
    ): Promise<DeliveryRecord> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        const record = await repo.findOne({ where: { id: id as any } });
        if (!record) {
            throw new Error(`配送记录不存在: ${id}`);
        }
        record.mode = mode;
        record.pickupLocationId = pickupLocationId as any;
        if (record.status === 'Draft') {
            record.status = mode === 'transfer' ? 'TransferPending' : 'PickupPending';
        }
        return repo.save(record);
    }

    /** transfer 到达：入自提点仓（toLocationId），触发 A 镜像 */
    async markTransferArrived(
        ctx: RequestContext,
        id: ID,
        adjustStockPublic: (ctx: RequestContext, variantId: ID, locationId: ID, delta: number, reason: string, meta?: any) => Promise<void>,
    ): Promise<DeliveryRecord> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        const record = await repo.findOne({ where: { id: id as any } });
        if (!record) {
            throw new Error(`配送记录不存在: ${id}`);
        }
        if (record.mode !== 'transfer' || !record.toLocationId || !record.itemsJson) {
            throw new Error(`非 transfer 记录或无明细，无法收货`);
        }
        if (record.status !== 'InTransit') {
            throw new Error(`状态须为 InTransit 才能收货: ${record.status}`);
        }
        const items: Array<{ variantId: string; quantity: number }> = JSON.parse(record.itemsJson);
        for (const item of items) {
            await adjustStockPublic(ctx, item.variantId as any, record.toLocationId, item.quantity, `自提点收货(record=${record.id})`, {
                bizType: 'stockIn',
                bizCode: `transfer-${record.id}`,
            });
        }
        record.status = 'Arrived';
        record.deliveredAt = new Date();
        return repo.save(record);
    }
}
```

> 顶部补 `import { In } from 'typeorm';`。`OrderLine` 实体未显式 import 时用 `'OrderLine' as any` 名查询（TypeORM 按实体名解析）。

- [ ] **Step 4: 运行测试**

Run: `npm test -w @vendure/cjk-plugin -- delivery-record.service`
Expected: 4 个用例 PASS（mock 细节如 `orderLinesRepo` 键不匹配时按实现调整测试内 mock 结构）

- [ ] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/delivery
git commit -m "feat(cjk): DeliveryRecordService（SALE 生成/状态流转/快递/自营/自提/transfer 收货）"
```

## Task B3: SALE 阻塞处理器生成配送记录 + pickup 判定

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\virtual-physical-stock.service.ts`（syncDeliveryRecords 调用）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（onApplicationBootstrap 注册）

- [ ] **Step 1: 在 VirtualPhysicalStockService 追加配送记录生成**

```ts
    /** SALE 后生成顾客配送记录（方案2-B）；pickup 订单标记自提模式 */
    async syncDeliveryRecords(ctx: RequestContext, sales: Sale[]): Promise<void> {
        const records = await this.deliveryRecordService.createFromSales(ctx, sales);
        if (!records.length) {
            return;
        }
        // pickup 订单：按订单级配送方式重设模式
        const orderIds = [...new Set(records.map(r => String(r.orderId)))];
        const orderRepo = this.connection.getRepository(ctx, Order);
        const orders = await orderRepo.find({ where: { id: In(orderIds) } });
        for (const order of orders) {
            const c = (order.customFields as any) ?? {};
            if (c.deliveryType === 'pickup' && c.selectedPickupLocationId) {
                for (const rec of records.filter(r => String(r.orderId) === String(order.id))) {
                    await this.deliveryRecordService.markAsPickup(ctx, rec.id, c.selectedPickupLocationId);
                }
            }
        }
    }
```

构造注入追加：`private deliveryRecordService: DeliveryRecordService`，import `Order` 与 `In`。

- [ ] **Step 2: 镜像 handler 内追加调用**

`syncVirtualMirror` 的 handler 改为（plugin.ts 的 registerMirrorHandler 调用处）：

```ts
    registerMirrorHandler(): void {
        this.eventBus.registerBlockingEventHandler({
            event: StockMovementEvent,
            id: 'cjk-plugin.sync-virtual-mirror',
            handler: async event => {
                if (event.type === 'SALE') {
                    const sales = event.stockMovements as Sale[];
                    await this.syncVirtualMirror(event.ctx, sales);
                    await this.syncDeliveryRecords(event.ctx, sales);
                }
                return undefined;
            },
        });
    }
```

- [ ] **Step 3: 构建**

Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add packages/cjk-plugin/src/inventory packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk): SALE 阻塞处理器生成配送记录（含 pickup 判定）"
```

## Task B4: 自提点 stockType + transfer 手动链路

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\pickup\pickup-location.entity.ts`（加 stockType 列）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-record.service.ts`（createTransfer）

- [ ] **Step 1: PickupLocation 加 stockType**

在 `pickup-location.entity.ts` 加列：

```ts
    /** own=门店自提（自带库存，取件即扣）；remote=远程自提（需仓→自提点配送） */
    @Column({ type: 'varchar', default: 'own' })
    stockType: string;
```

- [ ] **Step 2: createTransfer 方法**

`delivery-record.service.ts` 追加：

```ts
    /** 创建内部配送（transfer）：主仓 -> 自提点仓 */
    async createTransfer(
        ctx: RequestContext,
        input: {
            orderId: ID;
            fromLocationId: ID;
            toLocationId: ID;
            items: Array<{ variantId: ID; quantity: number }>;
            expressCompany?: string;
            trackingNo?: string;
        },
    ): Promise<DeliveryRecord> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        return repo.save(
            new DeliveryRecord({
                orderId: input.orderId,
                mode: 'transfer',
                status: 'TransferPending',
                fromLocationId: input.fromLocationId,
                toLocationId: input.toLocationId,
                itemsJson: JSON.stringify(input.items),
                expressCompany: input.expressCompany ?? null,
                trackingNo: input.trackingNo ?? null,
            }),
        );
    }
```

- [ ] **Step 3: 构建 + 提交**

Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

```bash
git add packages/cjk-plugin/src/pickup packages/cjk-plugin/src/delivery
git commit -m "feat(cjk): 自提点 stockType + transfer 创建"
```

## Task B5: admin resolver + SDL + 构建部署

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\delivery\delivery-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（SDL + providers）

- [ ] **Step 1: resolver**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { DeliveryRecordService } from './delivery-record.service';
import { DeliveryState } from './delivery-state';

@Resolver()
export class DeliveryAdminResolver {
    constructor(private deliveryRecordService: DeliveryRecordService) {}

    @Query()
    @Allow(Permission.SuperAdmin, Permission.ReadOrder)
    async deliveryRecords(@Ctx() ctx: RequestContext, @Args('orderId', { nullable: true }) orderId?: ID) {
        // 返回该租户配送记录；按订单过滤
        return this.deliveryRecordService.findByOrder(ctx, orderId);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async deliveryTransition(@Ctx() ctx: RequestContext, @Args('id') id: ID, @Args('to') to: DeliveryState) {
        return this.deliveryRecordService.transition(ctx, id, to);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async deliverySetExpress(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('expressCompany') expressCompany: string,
        @Args('trackingNo') trackingNo: string,
    ) {
        return this.deliveryRecordService.setExpress(ctx, id, expressCompany, trackingNo);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async deliveryAssignStaff(@Ctx() ctx: RequestContext, @Args('id') id: ID, @Args('staffId') staffId: string, @Args('staffName', { nullable: true }) staffName?: string) {
        return this.deliveryRecordService.assignStaff(ctx, id, staffId, staffName);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async deliveryCreateTransfer(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('fromLocationId') fromLocationId: ID,
        @Args('toLocationId') toLocationId: ID,
        @Args('itemsJson') itemsJson: string,
    ) {
        return this.deliveryRecordService.createTransfer(ctx, {
            orderId, fromLocationId, toLocationId,
            items: JSON.parse(itemsJson),
        });
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, Permission.UpdateOrder)
    async deliveryTransferArrived(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.deliveryRecordService.markTransferArrived(ctx, id, (c, v, l, d, r, m) =>
            (this as any).__adjustStock(c, v, l, d, r, m),
        );
    }
}
```

> 注：`deliveryTransferArrived` 的库存入仓回调在 resolver 内无 `VirtualPhysicalStockService`；改为在 resolver 构造注入 `VirtualPhysicalStockService` 并直接调用其注入的 `inventoryService.adjustStockPublic`（构造注入 `private virtualPhysicalStockService: VirtualPhysicalStockService`，`markTransferArrived` 回调传 `(c,v,l,d,r,m) => this.virtualPhysicalStockService.adjustStockPublic(c,v,l,d,r,m)`；`adjustStockPublic` 若未在 VirtualPhysicalStockService 暴露则透传其私有 `inventoryService` 调用）。据此调整实现。

`DeliveryRecordService.findByOrder` 补一个方法（B2 未写）：

```ts
    async findByOrder(ctx: RequestContext, orderId?: ID): Promise<DeliveryRecord[]> {
        const repo = this.connection.getRepository(ctx, DeliveryRecord);
        if (orderId) {
            return repo.find({ where: { orderId: orderId as any } });
        }
        return repo.find({});
    }
```

- [ ] **Step 2: plugin.ts SDL 追加**

```graphql
type DeliveryRecord {
    id: ID!
    orderId: ID!
    fulfillmentId: ID
    sourceLocationId: ID
    mode: String!
    status: String!
    expressCompany: String
    trackingNo: String
    staffId: String
    staffName: String
    receiverName: String
    receiverPhone: String
    receiverAddress: String
    lat: Float
    lng: Float
    pickupLocationId: ID
    fromLocationId: ID
    toLocationId: ID
    itemsJson: String
    sentAt: DateTime
    deliveredAt: DateTime
    returnedAt: DateTime
    exceptionAt: DateTime
    photos: String
    remark: String
    orderBoxId: String
}

extend type Query {
    deliveryRecords(orderId: ID): [DeliveryRecord!]!
}

extend type Mutation {
    deliveryTransition(id: ID!, to: String!): DeliveryRecord!
    deliverySetExpress(id: ID!, expressCompany: String!, trackingNo: String!): DeliveryRecord!
    deliveryAssignStaff(id: ID!, staffId: String!, staffName: String): DeliveryRecord!
    deliveryCreateTransfer(orderId: ID!, fromLocationId: ID!, toLocationId: ID!, itemsJson: String!): DeliveryRecord!
    deliveryTransferArrived(id: ID!): DeliveryRecord!
}
```

`DateTime` 标量若未引入，改用 `String`（时间戳以 ISO 字符串返回——resolver 需 toString 适配，或在实体上定义 `@Column` 为 `varchar` 存 ISO）。以仓库既有 SDL 中时间字段的标量用法为准统一。

providers 追加 `DeliveryAdminResolver`；entities 追加 `DeliveryRecord`。

- [ ] **Step 3: 全量单测 + 构建**

Run: `npm test -w @vendure/cjk-plugin`
Expected: 全部 PASS
Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

- [ ] **Step 4: 部署 + 线上冒烟**

Run: `powershell -ExecutionPolicy Bypass -File ".\_deploy.ps1" -Message "feat(cjk): 方案2-B 配送记录（实体/状态机/SALE生成/pickup/transfer）"`（工作目录 `d:\zhao\vendure`）
Expected: 服务器 pull + restart 成功

```bash
curl -s https://e.joho.cn/admin-api | Select-String -Pattern "deliveryRecords" | Select-Object -First 3
```
Expected: 命中 `deliveryRecords`

- [ ] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/delivery packages/cjk-plugin/src/pickup packages/cjk-plugin/src/plugin.ts
git commit -m "chore: 方案2-B 部署"
```
