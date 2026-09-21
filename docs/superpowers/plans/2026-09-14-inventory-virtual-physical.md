# 虚拟库存 × 物理库存（子项目 A：库存模型）实施计划

> **方案标识：方案 2 子项目 A**。**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **前置**：本计划独立可测；B（物流）/C（对账）/D（展示）计划依赖本计划的实体与接口，须先执行本计划。
> Spec：`d:\zhao\vshop\docs\superpowers\specs\2026-09-14-virtual-physical-inventory-design.md`

**Goal:** 为租户引入「虚拟仓=网络可售源、物理仓=真实库存」双库存模型：物理驱动变体的虚拟库存由系统镜像为 Σ 绑定物理仓 onHand，销售分配/发货扣减落到物理仓。

**Architecture:** 在既有 inventory-plugin（账本/就近库存）+ logistics-plugin（Nearest/Matrix 分配策略链、StockLocation lat/lng、OrderLine 原分配仓）之上增量叠加：① `StockLocation.customFields.kind`（virtual/physical）+ 新 `VariantLocationBinding` 关联表；② `StockMovementEvent` SALE 阻塞处理器做虚拟镜像同步（同事务，账本 `bizType='mirror'`）；③ 新建 `PhysicalAwareStockLocationStrategy extends MatrixStockLocationStrategy`，物理驱动变体只从绑定物理仓分配；④ 店铺端 `variantStockInfo` 查询返回 saleableStock/stockDetail/physicalStockEnabled。

**Tech Stack:** Vendure 3.6.4（core/inventory-plugin/logistics-plugin/cjk-plugin，npm workspace）、TypeORM、Vitest、GraphQL。

**关键事实（已探明，勿再重查）**
- `StockMovementEvent` 字段：`{ctx, stockMovements: StockMovement[], type}`；`Sale extends StockMovement`（含 `productVariantId`/`stockLocationId`/`quantity`）。
- inventory-plugin 已注册阻塞处理器 `inventory-plugin.record-order-sales-out`（`inventory.plugin.ts:486-494`，SALE→`recordOrderSalesOut`）。
- `adjustStockForLocation(ctx, variantId, locationId, delta, reason, meta?: LedgerMeta)` 是 **protected**（`inventory.service.ts:76-115`）；写 `StockAdjustment.businessReason` + 可选账本。
- `LedgerBizType` 在 `stock-ledger.service.ts:8-16`（8 种，无 mirror）。
- `StockLocationService.create(ctx, {name, description})` 会自动 `assignToCurrentChannel`（`stock-location.service.ts:84-96`）；实体无 code 字段，坐标在 customFields（logistics-plugin `catalog-custom-fields.ts:44-64`：lat/lng/serviceCities）。
- `StockLocationStrategy` 接口（`core/src/config/catalog/stock-location-strategy.ts`）：`getAvailableStock(ctx, productVariantId, stockLevels)` / `forAllocation` / `forRelease` / `forSale` / `forCancellation`。
- `MatrixStockLocationStrategy extends NearestStockLocationStrategy extends MultiChannelStockLocationStrategy`（`logistics-plugin/src/matrix-stock-location-strategy.ts`），全局注册于 dev-server；父类 forAllocation/forSale 内部按「渠道可见仓」过滤（`stockLevelAppliesToActiveChannel`）。
- Channel customFields 在 `cjk-plugin/src/tenant/tenant-channel-custom-fields.ts`（已含 employeePickupMode/defaultLocation 等开关先例）。
- 测试基建：cjk-plugin 用 vitest + `vi.fn().mockResolvedValue(...)` 构造 mock 实例（参照 `tenant-config-admin.resolver.spec.ts`）；inventory-plugin 用原型链调用私有方法（`inventory.service.spec.ts:12-17`）。
- cjk-plugin 的 plugin.ts：`entities` 数组（含 RoomTemplate 等）、`customFields` 注册（Channel/Order/Customer/ProductVariant/ShippingMethod/Asset）、`onApplicationBootstrap`（DefaultDataService.seed 先例）。

---

## Task A1: kind/code 自定义字段 + physicalStockEnabled 开关 + 账本 mirror 类型

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-location-custom-fields.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-channel-custom-fields.ts`（末尾数组追加一项）
- Modify: `d:\zhao\vendure\packages\inventory-plugin\src\stock-ledger.service.ts:8-16`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（customFields 注册处）

- [ ] **Step 1: 新建 StockLocation customFields 文件**

```ts
import { CustomFields, LanguageCode } from '@vendure/core';

/**
 * 仓库性质与编码：
 * - kind: virtual=虚拟仓（网络销售可售源），physical=物理仓（真实库存）
 * - code: 租户内唯一标识。虚拟仓={tenantCode}-virtual；默认物理仓={tenantCode}；附加物理仓={tenantCode}-{alias}
 */
export const stockLocationCustomFields: CustomFields = {
    StockLocation: [
        {
            name: 'kind',
            type: 'string',
            defaultValue: 'virtual',
            options: [
                { value: 'virtual', label: [{ languageCode: LanguageCode.zh_Hans, value: '虚拟仓' }] },
                { value: 'physical', label: [{ languageCode: LanguageCode.zh_Hans, value: '物理仓' }] },
            ],
            label: [{ languageCode: LanguageCode.zh_Hans, value: '仓库性质' }],
        },
        {
            name: 'code',
            type: 'string',
            nullable: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '仓库编码' }],
        },
    ],
};
```

- [ ] **Step 2: Channel 追加 physicalStockEnabled 开关**

在 `tenant-channel-custom-fields.ts` 的 `Channel` 数组末尾（`taxMode` 项之后）追加：

```ts
        {
            name: 'physicalStockEnabled',
            type: 'boolean',
            defaultValue: false,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '开启物理库存' },
                { languageCode: LanguageCode.en, value: 'Enable Physical Stock' },
            ],
        },
```

- [ ] **Step 3: 账本类型加 mirror**

`stock-ledger.service.ts:8-16` 的 `LedgerBizType` 追加一行：

```ts
    | 'mirror'
```

- [ ] **Step 4: plugin.ts 注册 StockLocation customFields**

在 `cjk-plugin/src/plugin.ts` 的 `customFields` 注册对象中（与既有 Channel/Order 等并列）加入：

```ts
        ...stockLocationCustomFields,
```

并在文件顶部 import 区加入：`import { stockLocationCustomFields } from './inventory/stock-location-custom-fields';`

- [ ] **Step 5: 构建验证**

Run: `npm run build -w @vendure/cjk-plugin`（工作目录 `d:\zhao\vendure`）
Expected: 构建成功，无类型错误。随后提交：

```bash
git add packages/cjk-plugin/src/inventory/stock-location-custom-fields.ts packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts packages/inventory-plugin/src/stock-ledger.service.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk): StockLocation kind/code 字段 + physicalStockEnabled 开关 + 账本 mirror 类型"
```

## Task A2: VariantLocationBinding 实体 + 注册

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\variant-location-binding.entity.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（entities 数组）

- [ ] **Step 1: 新建实体**

```ts
import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * 变体 × 物理仓 绑定。某变体有绑定记录 => 物理驱动变体：
 * 虚拟库存 = Σ 绑定物理仓 onHand（镜像），销售分配只落绑定物理仓。
 */
@Entity()
export class VariantLocationBinding extends VendureEntity {
    constructor(input?: DeepPartial<VariantLocationBinding>) {
        super(input);
    }

    @Index()
    @Column()
    variantId: ID;

    @Index()
    @Column()
    locationId: ID;

    @Column({ default: false })
    isDefault: boolean;
}
```

- [ ] **Step 2: plugin.ts entities 注册**

在 `plugin.ts` 的 `entities` 数组（含 RoomTemplate 处）追加：

```ts
        VariantLocationBinding,
```

顶部 import：`import { VariantLocationBinding } from './inventory/variant-location-binding.entity';`

- [ ] **Step 3: 构建验证 + 提交**

Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功。提交：

```bash
git add packages/cjk-plugin/src/inventory/variant-location-binding.entity.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk): VariantLocationBinding 实体（变体×物理仓绑定）"
```

## Task A3: 镜像纯函数 + 单测（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\mirror-math.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\mirror-math.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { calcMirrorDelta, haversineKm, pickLocationsByIds, sumBoundOnHand } from './mirror-math';

describe('mirror-math', () => {
    it('sumBoundOnHand 只累加绑定仓', () => {
        const levels = [
            { locationId: 'l1', onHand: 5 },
            { locationId: 'l2', onHand: 7 },
            { locationId: 'v1', onHand: 100 },
        ];
        expect(sumBoundOnHand(levels, ['l1', 'l2'])).toBe(12);
    });

    it('calcMirrorDelta = boundTotal - currentVirtual', () => {
        expect(calcMirrorDelta(10, 12)).toBe(2);
        expect(calcMirrorDelta(10, 8)).toBe(-2);
        expect(calcMirrorDelta(10, 10)).toBe(0);
    });

    it('pickLocationsByIds 过滤出绑定物理仓', () => {
        const locs = [
            { id: 'l1' as string, name: 'a' },
            { id: 'l2' as string, name: 'b' },
            { id: 'v1' as string, name: 'v' },
        ];
        expect(pickLocationsByIds(locs, ['l1', 'l2']).map(l => l.id)).toEqual(['l1', 'l2']);
    });

    it('haversineKm 距离计算', () => {
        // 北京天安门 ~ 上海人民广场，约 1067 km
        const km = haversineKm(39.9087, 116.3975, 31.2304, 121.4737);
        expect(km).toBeGreaterThan(1000);
        expect(km).toBeLessThan(1150);
    });

    it('haversineKm 同点距离为 0', () => {
        expect(haversineKm(30, 120, 30, 120)).toBe(0);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- mirror-math`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现纯函数**

```ts
import { ID } from '@vendure/core';

export interface StockLevelLike {
    locationId: ID;
    onHand: number;
}

export function sumBoundOnHand(levels: StockLevelLike[], boundLocationIds: ID[]): number {
    const set = new Set(boundLocationIds.map(String));
    return levels.reduce((sum, l) => (set.has(String(l.locationId)) ? sum + l.onHand : sum), 0);
}

export function calcMirrorDelta(currentVirtual: number, boundTotal: number): number {
    return boundTotal - currentVirtual;
}

export function pickLocationsByIds<T extends { id: ID }>(locations: T[], ids: ID[]): T[] {
    const set = new Set(ids.map(String));
    return locations.filter(l => set.has(String(l.id)));
}

/** 地球半径 km，Haversine 公式（与 inventory.service.locationDistanceKm 同源） */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -w @vendure/cjk-plugin -- mirror-math`
Expected: 5 个用例 PASS

- [ ] **Step 5: 提交**

```bash
git add packages/cjk-plugin/src/inventory/mirror-math.ts packages/cjk-plugin/src/inventory/mirror-math.spec.ts
git commit -m "feat(cjk): 镜像/距离纯函数 mirror-math + 单测"
```

## Task A4: VirtualPhysicalStockService + SALE 镜像阻塞处理器

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\virtual-physical-stock.service.ts`
- Modify: `d:\zhao\vendure\packages\inventory-plugin\src\inventory.service.ts`（加 public 包装方法）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（providers 注册 + onApplicationBootstrap 注册镜像 handler）
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\virtual-physical-stock.service.spec.ts`

- [ ] **Step 1: 写失败测试（syncVirtualMirror 行为）**

```ts
import { describe, expect, it, vi } from 'vitest';
import { VirtualPhysicalStockService } from './virtual-physical-stock.service';

function makeService(overrides: Record<string, any> = {}) {
    const svc: any = new VirtualPhysicalStockService(
        {} as any, { create: vi.fn() } as any, {} as any, {} as any,
    );
    Object.assign(svc, {
        ensureVirtualLocation: vi.fn().mockResolvedValue({ id: 'v1' }),
        connection: { getRepository: vi.fn() },
        stockLevelService: { getStockLevels: vi.fn() },
        inventoryService: { adjustStockPublic: vi.fn().mockResolvedValue(undefined) },
        ...overrides,
    });
    return svc;
}

describe('VirtualPhysicalStockService.syncVirtualMirror', () => {
    it('物理驱动变体按 Σ 绑定仓同步虚拟仓', async () => {
        const svc = makeService({
            stockLevelService: {
                getStockLevels: vi.fn().mockResolvedValue([
                    { stockLocationId: 'v1', stockOnHand: 10 },
                    { stockLocationId: 'l1', stockOnHand: 5 },
                    { stockLocationId: 'l2', stockOnHand: 7 },
                ]),
            },
            connection: {
                getRepository: vi.fn().mockReturnValue({
                    find: vi.fn().mockResolvedValue([
                        { variantId: 'p1', locationId: 'l1' },
                        { variantId: 'p1', locationId: 'l2' },
                    ]),
                }),
            },
        });
        const sales: any[] = [
            { productVariantId: 'p1', stockLocationId: 'l1', quantity: 2 },
        ];
        await svc.syncVirtualMirror({ channel: { code: 't1' } } as any, sales);
        // 10 + (12 - 10) = 12
        expect(svc.inventoryService.adjustStockPublic).toHaveBeenCalledWith(
            expect.anything(), 'p1', 'v1', 2, expect.stringContaining('镜像'), expect.objectContaining({ bizType: 'mirror' }),
        );
    });

    it('无绑定变体跳过', async () => {
        const svc = makeService({
            connection: {
                getRepository: vi.fn().mockReturnValue({ find: vi.fn().mockResolvedValue([]) }),
            },
        });
        await svc.syncVirtualMirror({ channel: { code: 't1' } } as any, [{ productVariantId: 'p0', stockLocationId: 'v1', quantity: 1 }] as any);
        expect(svc.inventoryService.adjustStockPublic).not.toHaveBeenCalled();
    });

    it('镜像差额为 0 不写流水', async () => {
        const svc = makeService({
            stockLevelService: {
                getStockLevels: vi.fn().mockResolvedValue([
                    { stockLocationId: 'v1', stockOnHand: 12 },
                    { stockLocationId: 'l1', stockOnHand: 12 },
                ]),
            },
            connection: {
                getRepository: vi.fn().mockReturnValue({
                    find: vi.fn().mockResolvedValue([{ variantId: 'p1', locationId: 'l1' }]),
                }),
            },
        });
        await svc.syncVirtualMirror({ channel: { code: 't1' } } as any, [{ productVariantId: 'p1', stockLocationId: 'l1', quantity: 1 }] as any);
        expect(svc.inventoryService.adjustStockPublic).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- virtual-physical-stock`
Expected: FAIL（模块不存在）

- [ ] **Step 3: inventory-plugin 加 public 包装**

在 `inventory.service.ts` 的 `adjustStockForLocation`（protected）之后追加 public 包装：

```ts
    /**
     * 公共入口：跨插件调整某仓库存（镜像同步等用），语义与 adjustStockForLocation 一致。
     */
    async adjustStockPublic(
        ctx: RequestContext,
        variantId: ID,
        locationId: ID,
        delta: number,
        reason: string,
        meta?: LedgerMeta,
    ): Promise<void> {
        return this.adjustStockForLocation(ctx, variantId, locationId, delta, reason, meta);
    }
```

确认 `InventoryService` 已从 `inventory-plugin/src/index.ts` 导出；未导出则追加 `export { InventoryService } from './inventory.service';`。

- [ ] **Step 4: 实现服务**

```ts
import { Injectable } from '@nestjs/common';
import {
    EventBus, ID, RequestContext, StockLevelService, StockLocationService,
    StockMovementEvent, TransactionalConnection, Logger,
} from '@vendure/core';
import { Sale } from '@vendure/core';
import { InventoryService } from '@vendure/inventory-plugin';
import { In } from 'typeorm';
import { StockLocation } from '@vendure/core';
import { VariantLocationBinding } from './variant-location-binding.entity';
import { calcMirrorDelta, sumBoundOnHand } from './mirror-math';

const loggerCtx = 'VirtualPhysicalStockService';

@Injectable()
export class VirtualPhysicalStockService {
    constructor(
        private connection: TransactionalConnection,
        private stockLocationService: StockLocationService,
        private stockLevelService: StockLevelService,
        private inventoryService: InventoryService,
        private eventBus: EventBus,
    ) {}

    virtualCode(channelCode: string): string {
        return `${channelCode}-virtual`;
    }

    async ensureVirtualLocation(ctx: RequestContext): Promise<StockLocation> {
        const code = this.virtualCode(ctx.channel.code);
        const repo = this.connection.getRepository(ctx, StockLocation);
        const existing = await repo
            .createQueryBuilder('loc')
            .where('loc.customFields.code = :code', { code })
            .getOne();
        if (existing) {
            return existing;
        }
        const loc = await this.stockLocationService.create(ctx, {
            name: `${ctx.channel.code} 虚拟仓`,
            description: '网络销售可售源（系统自动创建）',
        });
        loc.customFields = { ...((loc.customFields as any) ?? {}), kind: 'virtual', code } as any;
        await repo.save(loc);
        Logger.info(`虚拟仓已创建: ${code}`, loggerCtx);
        return loc;
    }

    async ensureDefaultPhysicalLocation(ctx: RequestContext): Promise<StockLocation> {
        const code = ctx.channel.code;
        const repo = this.connection.getRepository(ctx, StockLocation);
        const existing = await repo
            .createQueryBuilder('loc')
            .where('loc.customFields.code = :code', { code })
            .getOne();
        if (existing) {
            return existing;
        }
        const loc = await this.stockLocationService.create(ctx, {
            name: `${ctx.channel.code} 默认仓`,
            description: '物理库存默认仓（开启物理库存时自动创建）',
        });
        loc.customFields = { ...((loc.customFields as any) ?? {}), kind: 'physical', code } as any;
        await repo.save(loc);
        Logger.info(`默认物理仓已创建: ${code}`, loggerCtx);
        return loc;
    }

    /** 替换式写入变体绑定；校验每个仓为物理仓且归属当前租户 */
    async setVariantBindings(
        ctx: RequestContext,
        variantId: ID,
        bindings: Array<{ locationId: ID; isDefault: boolean }>,
    ): Promise<VariantLocationBinding[]> {
        const repo = this.connection.getRepository(ctx, VariantLocationBinding);
        await repo.delete({ variantId: variantId as any });
        const saved: VariantLocationBinding[] = [];
        for (const b of bindings) {
            const loc = await this.connection.getEntityOrThrow(ctx, StockLocation, b.locationId);
            const kind = (loc.customFields as any)?.kind;
            if (kind !== 'physical') {
                throw new Error(`仓库 ${b.locationId} 非物理仓，无法绑定`);
            }
            const ownerCode = String((loc.customFields as any)?.code ?? '');
            if (ownerCode !== ctx.channel.code && !ownerCode.startsWith(`${ctx.channel.code}-`)) {
                throw new Error(`仓库 ${b.locationId} 不属于当前租户`);
            }
            const savedBinding = await repo.save(
                new VariantLocationBinding({ variantId, locationId: b.locationId, isDefault: b.isDefault }),
            );
            saved.push(savedBinding);
        }
        return saved;
    }

    /** SALE 后镜像：物理驱动变体的虚拟仓 onHand 同步为 Σ 绑定物理仓 onHand（同事务） */
    async syncVirtualMirror(ctx: RequestContext, sales: Sale[]): Promise<void> {
        if (!sales?.length) {
            return;
        }
        const virtual = await this.ensureVirtualLocation(ctx);
        const variantIds = [...new Set(sales.map(s => String(s.productVariantId)))];
        const bindingRepo = this.connection.getRepository(ctx, VariantLocationBinding);
        for (const variantId of variantIds) {
            const bindings = await bindingRepo.find({ where: { variantId: variantId as any } });
            if (!bindings.length) {
                continue;
            }
            const boundIds = bindings.map(b => b.locationId);
            const levels = await this.stockLevelService.getStockLevels(ctx, variantId as ID);
            const boundTotal = sumBoundOnHand(
                levels.map(l => ({ locationId: l.stockLocationId, onHand: l.stockOnHand })),
                boundIds,
            );
            const currentVirtual =
                levels.find(l => String(l.stockLocationId) === String(virtual.id))?.stockOnHand ?? 0;
            const delta = calcMirrorDelta(currentVirtual, boundTotal);
            if (delta === 0) {
                continue;
            }
            await this.inventoryService.adjustStockPublic(
                ctx,
                variantId as ID,
                virtual.id,
                delta,
                `虚拟镜像同步(variant=${variantId})`,
                { bizType: 'mirror', bizCode: `mirror-${variantId}` },
            );
            Logger.info(`镜像同步: variant=${variantId} 虚拟仓 ${currentVirtual} -> ${boundTotal}`, loggerCtx);
        }
    }

    /** 注册 SALE 阻塞处理器（镜像必须在 core 扣库同一事务内执行） */
    registerMirrorHandler(): void {
        this.eventBus.registerBlockingEventHandler({
            event: StockMovementEvent,
            id: 'cjk-plugin.sync-virtual-mirror',
            handler: event => {
                if (event.type === 'SALE') {
                    return this.syncVirtualMirror(event.ctx, event.stockMovements as Sale[]);
                }
                return undefined;
            },
        });
    }
}
```

> 注：`stockLevelService.getStockLevels(ctx, variantId)` 返回 `StockLevel[]`（含 `stockLocationId`/`stockOnHand`/`stockAllocated`）；若该签名在本地 core 版本不同，改用 `stockLevelService.getStockLevel(ctx, variantId, locationId)` 逐仓读取并组装 levels（单测按本文件签名编写，实现时以实际签名为准做等值适配）。

- [ ] **Step 5: plugin.ts 注册服务 + 镜像 handler**

providers 数组追加：`VirtualPhysicalStockService`（import 自 `./inventory/virtual-physical-stock.service`）；`onApplicationBootstrap` 中追加：

```ts
        this.injector.get(VirtualPhysicalStockService).registerMirrorHandler();
```

- [ ] **Step 6: 运行测试 + 构建**

Run: `npm test -w @vendure/cjk-plugin -- virtual-physical-stock`
Expected: 3 个用例 PASS
Run: `npm run build -w @vendure/cjk-plugin; npm run build -w @vendure/inventory-plugin`
Expected: 两包构建成功

- [ ] **Step 7: 提交**

```bash
git add packages/cjk-plugin/src/inventory packages/cjk-plugin/src/plugin.ts packages/inventory-plugin/src/inventory.service.ts
git commit -m "feat(cjk): 虚拟镜像服务+StockMovementEvent SALE 阻塞处理器（账本 mirror）"
```

## Task A5: PhysicalAwareStockLocationStrategy（绑定感知分配）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\physical-aware-stock-location-strategy.ts`
- Modify: `d:\zhao\vendure\packages\dev-server\src\vendure-config.ts`（stockLocationStrategy 替换）
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\physical-aware-stock-location-strategy.spec.ts`

- [ ] **Step 1: 写失败测试（绑定感知：候选仓收窄 + getAvailableStock 只算虚拟仓）**

```ts
import { describe, expect, it, vi } from 'vitest';
import { PhysicalAwareStockLocationStrategy } from './physical-aware-stock-location-strategy';

describe('PhysicalAwareStockLocationStrategy', () => {
    function makeStrategy(overrides: Record<string, any> = {}) {
        const s: any = new PhysicalAwareStockLocationStrategy();
        Object.assign(s, {
            bindingService: { findByVariant: vi.fn().mockResolvedValue([]) },
            connection: { getRepository: vi.fn() },
            requestContextCache: { get: vi.fn((_ctx: any, _k: string, fn: any) => fn()) },
            ...overrides,
        });
        return s;
    }

    it('无绑定变体：候选仓原样交给父类逻辑（纯虚拟）', async () => {
        const s = makeStrategy();
        const superSpy = vi.spyOn(PhysicalAwareStockLocationStrategy.prototype as any, 'forAllocation');
        // 无绑定 => 走父类；此处仅断言不抛错并返回调用父类的分支
        const locations = [{ id: 'v1' }];
        const result = await s.forAllocation({} as any, locations, { productVariantId: 'p0' }, 3);
        // 纯虚拟（无绑定）时父类方法被调用；mock 父类抛错则证明走了分支
        expect(superSpy).toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('物理驱动变体：只把绑定物理仓传给父类', async () => {
        const s = makeStrategy({
            bindingService: {
                findByVariant: vi.fn().mockResolvedValue([
                    { variantId: 'p1', locationId: 'l1', isDefault: true },
                    { variantId: 'p1', locationId: 'l2', isDefault: false },
                ]),
            },
            connection: {
                getRepository: vi.fn().mockReturnValue({
                    find: vi.fn().mockResolvedValue([
                        { id: 'l1' }, { id: 'l2' },
                    ]),
                }),
            },
        });
        const parent = PhysicalAwareStockLocationStrategy.prototype as any;
        const orig = parent.forAllocation;
        parent.forAllocation = vi.fn(async (_ctx: any, locs: any[], _line: any, _qty: number) => locs);
        try {
            const result = await s.forAllocation({} as any, [{ id: 'v1' }], { productVariantId: 'p1' }, 3);
            expect(result.map((l: any) => l.id).sort()).toEqual(['l1', 'l2']);
        } finally {
            parent.forAllocation = orig;
        }
    });

    it('getAvailableStock：物理驱动只统计虚拟仓', async () => {
        const s = makeStrategy({
            bindingService: {
                findByVariant: vi.fn().mockResolvedValue([{ variantId: 'p1', locationId: 'l1' }]),
            },
            requestContextCache: {
                get: vi.fn((_ctx: any, _k: string, fn: any) => fn()),
            },
            locationKindOf: vi.fn(async (ctx: any, id: string) => (id === 'v1' ? 'virtual' : 'physical')),
        });
        s.locationKindOf = vi.fn(async (_ctx: any, id: string) => (id === 'v1' ? 'virtual' : 'physical'));
        const levels = [
            { stockLocationId: 'v1', stockOnHand: 12, stockAllocated: 0 },
            { stockLocationId: 'l1', stockOnHand: 12, stockAllocated: 0 },
        ];
        const result = await s.getAvailableStock({} as any, 'p1', levels as any);
        expect(result.stockOnHand).toBe(12);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- physical-aware`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现策略**

```ts
import { Injector, ID, In, RequestContext, StockLevel, StockLocation } from '@vendure/core';
import { MatrixStockLocationStrategy } from '@vendure/logistics-plugin';
import { VariantLocationBindingService } from './variant-location-binding.service';
import { pickLocationsByIds } from './mirror-math';

/**
 * 绑定感知库存策略：在 MatrixStockLocationStrategy（就近+门禁+矩阵）之上，
 * 物理驱动变体（有 VariantLocationBinding）只从绑定物理仓分配/发货；
 * 纯虚拟变体完全走父类逻辑（虚拟仓为唯一渠道仓）。
 * 物理仓挂渠道（create 默认行为），父类渠道过滤天然通过。
 */
export class PhysicalAwareStockLocationStrategy extends MatrixStockLocationStrategy {
    protected bindingService: VariantLocationBindingService;

    override async init(injector: Injector): Promise<void> {
        await super.init(injector);
        this.bindingService = injector.get(VariantLocationBindingService);
    }

    private async boundLocations(ctx: RequestContext, variantId: ID): Promise<StockLocation[] | null> {
        const bindings = await this.bindingService.findByVariant(variantId);
        if (!bindings.length) {
            return null;
        }
        const locs = await this.connection.getRepository(ctx, StockLocation).find({
            where: { id: In(bindings.map(b => b.locationId)) },
            loadEagerRelations: false,
        });
        return pickLocationsByIds(locs, bindings.map(b => b.locationId));
    }

    override async getAvailableStock(
        ctx: RequestContext,
        productVariantId: ID,
        stockLevels: StockLevel[],
    ): Promise<{ stockOnHand: number; stockAllocated: number }> {
        const bindings = await this.bindingService.findByVariant(productVariantId);
        if (!bindings.length) {
            return super.getAvailableStock(ctx, productVariantId, stockLevels);
        }
        // 物理驱动：只统计虚拟仓（镜像值即 Σ 物理仓），避免与物理仓原始值重复计算
        let stockOnHand = 0;
        let stockAllocated = 0;
        for (const level of stockLevels) {
            const kind = await this.locationKindOf(ctx, level.stockLocationId);
            if (kind === 'virtual') {
                stockOnHand += level.stockOnHand;
                stockAllocated += level.stockAllocated;
            }
        }
        return { stockOnHand, stockAllocated };
    }

    private async locationKindOf(ctx: RequestContext, locationId: ID): Promise<string> {
        return this.requestContextCache.get(ctx, `PhysicalAware.kind.${locationId}`, async () => {
            const loc = await this.connection.getEntityOrThrow(ctx, StockLocation, locationId, {
                loadEagerRelations: false,
            });
            return String((loc.customFields as any)?.kind ?? 'virtual');
        });
    }

    override async forAllocation(
        ctx: RequestContext,
        stockLocations: StockLocation[],
        orderLine: any,
        quantity: number,
    ) {
        const bound = await this.boundLocations(ctx, orderLine.productVariantId);
        if (!bound) {
            return super.forAllocation(ctx, stockLocations, orderLine, quantity);
        }
        return super.forAllocation(ctx, bound, orderLine, quantity);
    }

    override async forSale(
        ctx: RequestContext,
        stockLocations: StockLocation[],
        orderLine: any,
        quantity: number,
    ) {
        const bound = await this.boundLocations(ctx, orderLine.productVariantId);
        if (!bound) {
            return super.forSale(ctx, stockLocations, orderLine, quantity);
        }
        return super.forSale(ctx, bound, orderLine, quantity);
    }

    override async forRelease(
        ctx: RequestContext,
        stockLocations: StockLocation[],
        orderLine: any,
        quantity: number,
    ) {
        const bound = await this.boundLocations(ctx, orderLine.productVariantId);
        if (!bound) {
            return super.forRelease(ctx, stockLocations, orderLine, quantity);
        }
        return super.forRelease(ctx, bound, orderLine, quantity);
    }

    override async forCancellation(
        ctx: RequestContext,
        stockLocations: StockLocation[],
        orderLine: any,
        quantity: number,
    ) {
        const bound = await this.boundLocations(ctx, orderLine.productVariantId);
        if (!bound) {
            return super.forCancellation(ctx, stockLocations, orderLine, quantity);
        }
        return super.forCancellation(ctx, bound, orderLine, quantity);
    }
}
```

- [ ] **Step 4: 实现 VariantLocationBindingService**

新建 `d:\zhao\vendure\packages\cjk-plugin\src\inventory\variant-location-binding.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { VariantLocationBinding } from './variant-location-binding.entity';

@Injectable()
export class VariantLocationBindingService {
    constructor(private connection: TransactionalConnection) {}

    findByVariant(variantId: ID): Promise<VariantLocationBinding[]> {
        return this.connection
            .getRepository(undefined as any, VariantLocationBinding)
            .find({ where: { variantId: variantId as any } });
    }

    findByVariants(variantIds: ID[]): Promise<VariantLocationBinding[]> {
        return this.connection
            .getRepository(undefined as any, VariantLocationBinding)
            .find({ where: { variantId: In(variantIds.map(String)) } });
    }
}
```

> 注：`TransactionalConnection.getRepository(ctx, entity)` 的 ctx 在纯查询场景可传 `undefined`（既有 cjk-plugin 代码已有此用法先例时保持一致；否则在调用处传 ctx）。本 service 的方法签名保持 `findByVariant(variantId)`，策略与服务内调用时自行传 ctx 适配。

- [ ] **Step 5: dev-server 注册策略**

在 `d:\zhao\vendure\packages\dev-server\src\vendure-config.ts` 找到 `catalogOptions.stockLocationStrategy` 的注册处，替换为：

```ts
        stockLocationStrategy: new PhysicalAwareStockLocationStrategy(),
```

import：`import { PhysicalAwareStockLocationStrategy } from '@vendure/cjk-plugin';`（确认 cjk-plugin 的 index.ts 导出该策略；未导出则追加 `export { PhysicalAwareStockLocationStrategy } from './inventory/physical-aware-stock-location-strategy';`）

- [ ] **Step 6: 运行测试 + 构建**

Run: `npm test -w @vendure/cjk-plugin -- physical-aware`
Expected: 3 个用例 PASS（其中用例 1 的 superSpy 断言按实际父类调用路径调整——若父类方法为 async，改为断言 `expect(superSpy).toHaveBeenCalled()` 并 `await` 结果）
Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

- [ ] **Step 7: 提交**

```bash
git add packages/cjk-plugin/src/inventory packages/dev-server/src/vendure-config.ts
git commit -m "feat(cjk): PhysicalAwareStockLocationStrategy 绑定感知分配 + VariantLocationBindingService"
```

## Task A6: 店铺端 variantStockInfo 查询

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\inventory-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（SDL 追加 + resolver 注册）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { InventoryShopResolver } from './inventory-shop.resolver';

describe('InventoryShopResolver.variantStockInfo', () => {
    function makeResolver(overrides: Record<string, any> = {}) {
        const r: any = new InventoryShopResolver(
            {} as any, {} as any, {} as any,
        );
        Object.assign(r, {
            stockService: {
                getSaleableAndDetail: vi.fn().mockResolvedValue({
                    saleableStock: 12,
                    physicalStockEnabled: true,
                    stockDetail: [
                        { locationId: 'l1', name: '默认仓', lat: 30, lng: 120, onHand: 12, distanceKm: 3.2 },
                    ],
                }),
            },
            ...overrides,
        });
        return r;
    }

    it('返回 saleableStock + stockDetail + physicalStockEnabled', async () => {
        const r = makeResolver();
        const out = await r.variantStockInfo({ channel: { code: 't1' } } as any, 'p1');
        expect(out.saleableStock).toBe(12);
        expect(out.physicalStockEnabled).toBe(true);
        expect(out.stockDetail[0].locationId).toBe('l1');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -w @vendure/cjk-plugin -- inventory-shop`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 resolver + 服务方法**

resolver 文件：

```ts
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, ID } from '@vendure/core';
import { VirtualPhysicalStockService } from './virtual-physical-stock.service';

@Resolver()
export class InventoryShopResolver {
    constructor(private virtualPhysicalStockService: VirtualPhysicalStockService) {}

    @Query()
    @Allow(Permission.Public)
    async variantStockInfo(
        @Ctx() ctx: RequestContext,
        @Args('variantId') variantId: ID,
        @Args('lat', { nullable: true }) lat?: number,
        @Args('lng', { nullable: true }) lng?: number,
    ) {
        return this.virtualPhysicalStockService.getSaleableAndDetail(ctx, variantId, lat, lng);
    }
}
```

`virtual-physical-stock.service.ts` 追加方法：

```ts
    /** 店铺端：saleableStock（虚拟仓可售）+ 物理驱动时的绑定仓明细（距离就近排序） */
    async getSaleableAndDetail(
        ctx: RequestContext,
        variantId: ID,
        lat?: number | null,
        lng?: number | null,
    ) {
        const virtual = await this.ensureVirtualLocation(ctx);
        const levels = await this.stockLevelService.getStockLevels(ctx, variantId);
        const physicalStockEnabled = Boolean((ctx.channel.customFields as any)?.physicalStockEnabled);
        const bindings = await this.connection
            .getRepository(ctx, VariantLocationBinding)
            .find({ where: { variantId: variantId as any } });
        const virtualOnHand =
            levels.find(l => String(l.stockLocationId) === String(virtual.id))?.stockOnHand ?? 0;

        let stockDetail: any[] = [];
        if (physicalStockEnabled && bindings.length) {
            const boundIds = bindings.map(b => b.locationId);
            const locs = await this.connection
                .getRepository(ctx, StockLocation)
                .find({ where: { id: In(boundIds) }, loadEagerRelations: false });
            const origin = lat != null && lng != null ? { lat, lng } : null;
            stockDetail = locs
                .map(loc => {
                    const level = levels.find(l => String(l.stockLocationId) === String(loc.id));
                    const c = (loc.customFields as any) ?? {};
                    const distanceKm = origin
                        ? haversineKm(origin.lat, origin.lng, c.lat ?? 0, c.lng ?? 0)
                        : null;
                    return {
                        locationId: loc.id,
                        name: loc.name,
                        lat: c.lat ?? null,
                        lng: c.lng ?? null,
                        onHand: level?.stockOnHand ?? 0,
                        distanceKm,
                    };
                })
                .sort((a, b) => {
                    if (a.distanceKm == null) return 1;
                    if (b.distanceKm == null) return -1;
                    return a.distanceKm - b.distanceKm;
                });
        }
        return {
            variantId,
            saleableStock: virtualOnHand,
            physicalStockEnabled,
            stockDetail,
        };
    }
```

顶部 import 追加：`import { In } from 'typeorm';`、`import { StockLocation } from '@vendure/core';`、`import { haversineKm } from './mirror-math';`

- [ ] **Step 4: plugin.ts 追加 SDL**

在 plugin.ts 的 shop SDL 追加：

```graphql
type VariantStockDetail {
    locationId: ID!
    name: String!
    lat: Float
    lng: Float
    onHand: Int!
    distanceKm: Float
}

type VariantStockInfo {
    variantId: ID!
    saleableStock: Int!
    physicalStockEnabled: Boolean!
    stockDetail: [VariantStockDetail!]!
}

extend type Query {
    variantStockInfo(variantId: ID!, lat: Float, lng: Float): VariantStockInfo!
}
```

resolver 注册：`providers` 追加 `InventoryShopResolver`。

- [ ] **Step 5: 运行测试 + 构建**

Run: `npm test -w @vendure/cjk-plugin -- inventory-shop`
Expected: PASS
Run: `npm run build -w @vendure/cjk-plugin`
Expected: 构建成功

- [ ] **Step 6: 提交**

```bash
git add packages/cjk-plugin/src/inventory packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk): variantStockInfo 店铺端查询（saleableStock/stockDetail/physicalStockEnabled）"
```

## Task A7: 端到端验证与部署

**Files:**
- 无新文件；执行验证与部署

- [ ] **Step 1: 全量单测**

Run: `npm test -w @vendure/cjk-plugin`（工作目录 `d:\zhao\vendure`）
Expected: 全部 PASS（含既有 + 新增）

- [ ] **Step 2: 本地起服冒烟（可选，有 dev-server）**

Run: `npm run dev:server` 或按仓库既有启动脚本，检查启动日志无 schema 校验错误；admin-api 冒烟 `variantStockInfo` 查询。

- [ ] **Step 3: 部署（遵循部署铁律：本地构建，服务器只 pull + restart）**

Run: `powershell -ExecutionPolicy Bypass -File ".\_deploy.ps1" -Message "feat(cjk): 虚拟×物理库存模型（kind/code/binding/镜像/分配策略/variantStockInfo）"`（工作目录 `d:\zhao\vendure`）
Expected: 构建 cjk-plugin（core/logistics/inventory 如涉依赖改动一并构建）→ commit → push → 服务器 `git pull + pm2 restart` → 退出码 0

- [ ] **Step 4: 线上冒烟**

```bash
# admin-api introspection 确认 VariantStockInfo 类型存在
curl -s https://e.joho.cn/admin-api | Select-String -Pattern "VariantStockInfo" | Select-Object -First 3
```
Expected: 命中 `VariantStockInfo`/`variantStockInfo`

- [ ] **Step 5: 提交**

```bash
git add -A packages/cjk-plugin/src packages/inventory-plugin/src packages/logistics-plugin/src packages/dev-server/src
git commit -m "chore: 方案2-A 部署" # 若 _deploy.ps1 已提交则跳过
```
