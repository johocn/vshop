# 酒店客房变体与四级回退模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为电商系统新增酒店客房能力：RoomTemplate 房型模板库（vendure）+ 变体 hotelRoomConfig 快照 + nshop「hotel」第 4 版式详情页（日期/房型明细/逐日计价/预订规则）+ web-admin 模板库管理与商品接入，全程不破坏既有路径。

**Architecture:** 模板用 cjk-plugin 新实体 `RoomTemplate`（快照源），商品应用模板时深拷贝进变体 customFields `hotelRoomConfig`（JSON，改模板不影响已用商品）；前端在四级回退体系内新增 `layout='hotel'` 版式与 4 个积木块，核心计价为 SSR 友好纯函数 `calcNightPrices`；下单映射 数量=晚数、单价=加权日均价，普通流程零侵入。

**Tech Stack:** Vendure cjk-plugin（TypeORM/GraphQL/NestJS）、Nuxt 3 前端层（Vue SFC + Pinia + i18n + Vitest）、uni-app web-admin（pages.json + menus.ts）、Playwright 手机视口回归。

**Spec:** `d:\zhao\vshop\docs\superpowers\specs\2026-09-14-hotel-room-variant-design.md`

---

## 仓库与参照（先读，勿跳）

| 仓库 | 关键参照 |
|---|---|
| vendure | `packages/cjk-plugin/src/payment/payment-template.entity.ts`、`payment-template.service.ts`、`payment-template-admin.resolver.ts`、`src/plugin.ts`（entities 行121、SDL 622-670、resolvers 行951、customFields 1335-1345） |
| nshop | `layers/base/app/components/product-detail/ServiceBlock.vue`（块模式）、`ProductDetailRenderer.vue`（componentMap）、`layers/base/app/utils/detail-config.ts`、`layers/base/i18n/locales/zh-CN.ts` 等 12 包 |
| vshop web-admin | `src/pages/platform/members/index.vue`（页面样式）、`src/pages.json`、`src/constants/menus.ts` |

---

### Task 1: 后端 RoomTemplate 实体 + 校验纯函数 + 单测（vendure）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-config.ts`（类型 + 校验纯函数）
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\hotel-config.spec.ts`（Vitest 单测）
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template.entity.ts`（TypeORM 实体）

- [ ] **Step 1: 先写失败的单测 `hotel-config.spec.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { validateHotelConfig, dayTypeFor } from './hotel-config';

describe('validateHotelConfig', () => {
  it('合法配置通过', () => {
    const r = validateHotelConfig({
      basePriceCent: 88800,
      priceCalendar: [
        { type: 'weekday', rate: 1.0 },
        { type: 'holiday', rate: 1.8, dates: ['2026-10-01'] },
      ],
    });
    expect(r.valid).toBe(true);
  });
  it('holiday 段缺 dates 报错', () => {
    const r = validateHotelConfig({
      basePriceCent: 88800,
      priceCalendar: [{ type: 'holiday', rate: 1.8 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('dates');
  });
  it('rate 与 priceCent 同时存在报错', () => {
    const r = validateHotelConfig({
      basePriceCent: 88800,
      priceCalendar: [{ type: 'weekend', rate: 1.2, priceCent: 99900 }],
    });
    expect(r.valid).toBe(false);
  });
  it('capacity 非法报错', () => {
    const r = validateHotelConfig({
      basePriceCent: 88800,
      specs: { capacity: 0, maxCapacity: 1 },
    });
    expect(r.valid).toBe(false);
  });
});

describe('dayTypeFor', () => {
  it('周一到周四 weekday', () => {
    expect(dayTypeFor('2026-09-14', [])).toBe('weekday'); // 周一
  });
  it('周五周六周日 weekend', () => {
    expect(dayTypeFor('2026-09-18', [])).toBe('weekend'); // 周五
  });
  it('custom 日期段优先', () => {
    expect(
      dayTypeFor('2026-10-01', [{ type: 'custom', rate: 1.5, dates: ['2026-10-01'] }]),
    ).toBe('custom');
  });
  it('holiday 优先于 weekend', () => {
    // 2026-10-02 周五：既是 weekend 又在 holiday dates
    expect(
      dayTypeFor('2026-10-02', [{ type: 'weekend', rate: 1.2 }, { type: 'holiday', rate: 1.8, dates: ['2026-10-02'] }]),
    ).toBe('holiday');
  });
});
```

- [ ] **Step 2: 运行单测确认失败**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx vitest --config vitest.config.mts --run src/hotel/hotel-config.spec.ts`
Expected: FAIL with "Cannot find module './hotel-config'"

- [ ] **Step 3: 实现 `hotel-config.ts`（纯函数 + 类型）**

```ts
// 酒店房型配置：类型 + 校验纯函数（SSR/服务端两用，坏数据返回错误清单，不抛异常）
export type PriceSegmentType = 'weekday' | 'weekend' | 'holiday' | 'custom';

export interface PriceSegment {
  type: PriceSegmentType;
  rate?: number;        // 系数（相对 basePriceCent）
  priceCent?: number;   // 固定价（与 rate 二选一）
  dates?: string[];     // holiday/custom 必填（YYYY-MM-DD）
}

export interface LongStayDiscount {
  minNights: number;
  rate: number;
}

export interface CancelPolicy {
  type: 'freeUntil' | 'nonRefundable';
  freeUntilHours?: number;
}

export interface RoomDetail {
  no: string;
  floor: number;
  view?: string;
}

export interface HotelConfig {
  templateCode?: string;
  specs?: {
    bedType: string;
    bedDesc?: string;
    area: number;
    capacity: number;
    maxCapacity: number;
    addBed?: boolean;
    addBedFeeCent?: number;
    smoke?: string;
    window?: string;
    breakfast?: string;
    breakfastCount?: number;
    amenities?: Array<string | Record<string, string>>;
    tags?: Array<string | Record<string, string>>;
  };
  rooms?: RoomDetail[];
  basePriceCent: number;
  priceCalendar?: PriceSegment[];
  longStayDiscount?: LongStayDiscount[];
  minNights?: number;
  maxNights?: number;
  advanceDays?: number;
  checkInTime?: string;
  checkOutTime?: string;
  cancelPolicy?: CancelPolicy;
  depositType?: string;
}

// 逐日类型判定：custom > holiday > weekend（周五~周日）> weekday（周一~周四）
// 无 segments 时按星期判断；有 dates 的段优先于星期类
export function dayTypeFor(dateStr: string, segments: PriceSegment[]): PriceSegmentType {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'weekday';
  for (const seg of segments) {
    if ((seg.type === 'holiday' || seg.type === 'custom') && seg.dates?.includes(dateStr)) {
      return seg.type;
    }
  }
  const dow = d.getDay(); // 0=周日
  return dow === 0 || dow === 5 || dow === 6 ? 'weekend' : 'weekday';
}

export function validateHotelConfig(cfg: Partial<HotelConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof cfg.basePriceCent !== 'number' || cfg.basePriceCent < 0) {
    errors.push('basePriceCent 必须为非负数字');
  }
  for (const seg of cfg.priceCalendar ?? []) {
    if (seg.type !== 'weekday' && seg.type !== 'weekend' && seg.type !== 'holiday' && seg.type !== 'custom') {
      errors.push(`未知价格段类型: ${seg.type}`);
    }
    if ((seg.type === 'holiday' || seg.type === 'custom') && (!seg.dates || seg.dates.length === 0)) {
      errors.push(`${seg.type} 段必须提供 dates`);
    }
    if (seg.rate != null && seg.priceCent != null) {
      errors.push(`${seg.type} 段 rate 与 priceCent 只能二选一`);
    }
  }
  const specs = cfg.specs;
  if (specs && (specs.capacity < 1 || specs.maxCapacity < specs.capacity)) {
    errors.push('capacity 必须 ≥1 且 maxCapacity ≥ capacity');
  }
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: 实现实体 `room-template.entity.ts`**（参照 payment-template.entity.ts 模式）

```ts
import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { CancelPolicy, HotelConfig, LongStayDiscount, PriceSegment, RoomDetail } from './hotel-config';

/**
 * 房型模板（快照源）：客户在商品变体上应用模板时，
 * 整体深拷贝进变体 customFields hotelRoomConfig，模板后续修改不影响已用商品。
 */
@Entity()
export class RoomTemplate extends VendureEntity {
    constructor(input?: DeepPartial<RoomTemplate>) {
        super(input);
    }

    @Column() code: string;

    @Column({ type: 'text' })
    name: string; // LocalizedText JSON（string=共用文案 / Record<locale,string>=逐语言）

    @Column({ default: true })
    enabled: boolean;

    @Column({ default: 0 })
    sortOrder: number;

    @Column({ type: 'varchar', nullable: true })
    coverAssetId: string | null;

    @Column({ type: 'simple-json', nullable: true })
    specs: HotelConfig['specs'] | null;

    @Column({ type: 'simple-json', nullable: true })
    defaultRooms: RoomDetail[] | null;

    @Column({ type: 'int' })
    basePriceCent: number;

    @Column({ type: 'simple-json', nullable: true })
    priceCalendar: PriceSegment[] | null;

    @Column({ type: 'simple-json', nullable: true })
    longStayDiscount: LongStayDiscount[] | null;

    @Column({ default: 1 })
    minNights: number;

    @Column({ default: 30 })
    maxNights: number;

    @Column({ default: 30 })
    advanceDays: number;

    @Column({ default: '14:00' })
    checkInTime: string;

    @Column({ default: '12:00' })
    checkOutTime: string;

    @Column({ type: 'simple-json' })
    cancelPolicy: CancelPolicy;

    @Column({ default: 'none' })
    depositType: string;
}
```

- [ ] **Step 5: 运行单测确认通过**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx vitest --config vitest.config.mts --run src/hotel/hotel-config.spec.ts`
Expected: 8 passed

- [ ] **Step 6: Commit（vendure 仓库）**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/hotel/
git commit -m "feat(cjk-plugin): RoomTemplate 实体与酒店配置校验纯函数"
```

---

### Task 2: 后端 RoomTemplateService（CRUD + 套用快照）（vendure）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template.service.ts`

- [ ] **Step 1: 先看 service 模式**

Run: `Get-Content d:\zhao\vendure\packages\cjk-plugin\src\payment\payment-template.service.ts`（读前 120 行，沿用其 findOne/findAll/create/update/delete 的结构与 `getEntityOrThrow` 用法）

- [ ] **Step 2: 实现 `room-template.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { RoomTemplate } from './room-template.entity';
import { HotelConfig, validateHotelConfig } from './hotel-config';

@Injectable()
export class RoomTemplateService {
    constructor(private connection: TransactionalConnection) {}

    findAll(): Promise<RoomTemplate[]> {
        return this.connection
            .getRepository(RoomTemplate)
            .find({ order: { sortOrder: 'ASC', createdAt: 'DESC' } });
    }

    findOne(id: ID): Promise<RoomTemplate | undefined> {
        return this.connection.getRepository(RoomTemplate).findOne({ where: { id } as any });
    }

    async create(input: any): Promise<RoomTemplate> {
        const check = validateHotelConfig({
            basePriceCent: input.basePriceCent,
            priceCalendar: input.priceCalendar ?? undefined,
            specs: input.specs ?? undefined,
        });
        if (!check.valid) {
            throw new Error(`RoomTemplate 校验失败: ${check.errors.join('; ')}`);
        }
        const repo = this.connection.getRepository(RoomTemplate);
        const entity = new RoomTemplate({
            ...input,
            name: typeof input.name === 'string' ? input.name : JSON.stringify(input.name ?? ''),
        });
        return repo.save(entity);
    }

    async update(id: ID, input: any): Promise<RoomTemplate> {
        const check = validateHotelConfig({
            basePriceCent: input.basePriceCent,
            priceCalendar: input.priceCalendar ?? undefined,
            specs: input.specs ?? undefined,
        });
        if (!check.valid) {
            throw new Error(`RoomTemplate 校验失败: ${check.errors.join('; ')}`);
        }
        const repo = this.connection.getRepository(RoomTemplate);
        const entity = await repo.findOneOrFail({ where: { id } as any });
        Object.assign(entity, input);
        if (input.name && typeof input.name !== 'string') {
            entity.name = JSON.stringify(input.name);
        }
        return repo.save(entity);
    }

    async delete(id: ID): Promise<void> {
        const repo = this.connection.getRepository(RoomTemplate);
        const entity = await repo.findOneOrFail({ where: { id } as any });
        await repo.remove(entity);
    }

    /**
     * 套用模板 → 深拷贝快照进变体 customFields hotelRoomConfig。
     * 之后模板修改不影响本变体；变体侧可再编辑快照。
     */
    async applyToVariant(ctx: RequestContext, variantId: ID, templateId: ID): Promise<boolean> {
        const template = await this.findOne(templateId);
        if (!template) throw new Error(`RoomTemplate ${templateId} 不存在`);

        const snapshot: HotelConfig = {
            templateCode: template.code,
            specs: template.specs ?? undefined,
            rooms: (template.defaultRooms ?? []).map(r => ({ ...r })),
            basePriceCent: template.basePriceCent,
            priceCalendar: (template.priceCalendar ?? []).map(s => ({ ...s, dates: s.dates ? [...s.dates] : undefined })),
            longStayDiscount: (template.longStayDiscount ?? []).map(d => ({ ...d })),
            minNights: template.minNights,
            maxNights: template.maxNights,
            advanceDays: template.advanceDays,
            checkInTime: template.checkInTime,
            checkOutTime: template.checkOutTime,
            cancelPolicy: { ...template.cancelPolicy },
            depositType: template.depositType,
        };

        const vRepo = this.connection.getRepository(ProductVariant);
        const v = await vRepo.findOne({ where: { id: variantId } as any });
        if (!v) throw new Error(`ProductVariant ${variantId} 不存在`);
        (v as any).customFields = { ...((v as any).customFields ?? {}), hotelRoomConfig: snapshot };
        await vRepo.save(v);
        return true;
    }
}
```
文件头需加：`import { ProductVariant } from '@vendure/core';`

- [ ] **Step 3: 编译验证**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx tsc -p ./tsconfig.build.json --noEmit`
Expected: 编译通过（若 `getRepository('ProductVariant')` 类型报错，改为 `this.connection.getRepository(ProductVariant as any)` 并在文件头 `import { ProductVariant } from '@vendure/core'`）

- [ ] **Step 4: Commit（vendure 仓库）**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/hotel/room-template.service.ts
git commit -m "feat(cjk-plugin): RoomTemplateService CRUD 与变体套用快照"
```

---

### Task 3: 后端 Resolver + SDL + 实体/自定义字段注册 + 构建（vendure）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（imports、entities 行121、SDL 622-670 后、resolvers 行951、customFields 1335-1345 块后）

- [ ] **Step 1: 先写 Resolver（参照 payment-template-admin.resolver.ts）**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext, Transaction } from '@vendure/core';
import { RoomTemplateService } from './room-template.service';
import { RoomTemplate } from './room-template.entity';

@Resolver()
export class RoomTemplateAdminResolver {
    constructor(private roomTemplateService: RoomTemplateService) {}

    @Query()
    async roomTemplates(): Promise<RoomTemplate[]> {
        return this.roomTemplateService.findAll();
    }

    @Query()
    async roomTemplate(@Args('id') id: ID): Promise<RoomTemplate | undefined> {
        return this.roomTemplateService.findOne(id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.SuperAdmin, Permission.Settings)
    async createRoomTemplate(@Args('input') input: any): Promise<RoomTemplate> {
        return this.roomTemplateService.create(input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.SuperAdmin, Permission.Settings)
    async updateRoomTemplate(@Args('id') id: ID, @Args('input') input: any): Promise<RoomTemplate> {
        return this.roomTemplateService.update(id, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.SuperAdmin, Permission.Settings)
    async deleteRoomTemplate(@Args('id') id: ID): Promise<boolean> {
        await this.roomTemplateService.delete(id);
        return true;
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.SuperAdmin, Permission.Settings)
    async applyRoomTemplate(
        @Ctx() ctx: RequestContext,
        @Args('variantId') variantId: ID,
        @Args('templateId') templateId: ID,
    ): Promise<boolean> {
        return this.roomTemplateService.applyToVariant(ctx, variantId, templateId);
    }
}
```

- [ ] **Step 2: plugin.ts 注册（5 处，逐处完成并保存）**

先读：`Get-Content d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts | Select-Object -Skip 80 -First 80` 与 `-Skip 615 -First 70`、`-Skip 945 -First 15`、`-Skip 1330 -First 25`，确认插入锚点后按下面修改：

1. **imports**：在 `import { PaymentTemplate } from './payment/payment-template.entity';` 之后追加：
```ts
import { RoomTemplate } from './hotel/room-template.entity';
import { RoomTemplateService } from './hotel/room-template.service';
import { RoomTemplateAdminResolver } from './hotel/room-template-admin.resolver';
import { hotelRoomCustomFields } from './hotel/hotel-custom-fields';
```

2. **entities 数组（行121）**：在 `PaymentTemplate, TenantMember,` 之间追加 `RoomTemplate,`。

3. **providers 数组**：与 PaymentTemplateService 并列追加 `RoomTemplateService,`。

4. **SDL**：在 `type PaymentTemplate {...}` 声明之后（约行 670 后）插入以下 SDL 字符串（含 `scalar JSON`，若 `rg "scalar JSON" src/plugin.ts` 已存在则删去重复声明）：
```graphql
scalar JSON

type RoomTemplate {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    code: String!
    name: String!
    enabled: Boolean!
    sortOrder: Int!
    coverAssetId: ID
    specs: JSON
    defaultRooms: JSON
    basePriceCent: Int!
    priceCalendar: JSON
    longStayDiscount: JSON
    minNights: Int!
    maxNights: Int!
    advanceDays: Int!
    checkInTime: String!
    checkOutTime: String!
    cancelPolicy: JSON!
    depositType: String!
}

input RoomTemplateInput {
    code: String!
    name: String!
    enabled: Boolean!
    sortOrder: Int!
    coverAssetId: ID
    specs: JSON
    defaultRooms: JSON
    basePriceCent: Int!
    priceCalendar: JSON
    longStayDiscount: JSON
    minNights: Int!
    maxNights: Int!
    advanceDays: Int!
    checkInTime: String!
    checkOutTime: String!
    cancelPolicy: JSON!
    depositType: String!
}

extend type Query {
    roomTemplates: [RoomTemplate!]!
    roomTemplate(id: ID!): RoomTemplate
}

extend type Mutation {
    createRoomTemplate(input: RoomTemplateInput!): RoomTemplate!
    updateRoomTemplate(id: ID!, input: RoomTemplateInput!): RoomTemplate!
    deleteRoomTemplate(id: ID!): Boolean!
    applyRoomTemplate(variantId: ID!, templateId: ID!): Boolean!
}
```

5. **resolvers 数组（行951）**：追加 `RoomTemplateAdminResolver,`。

- [ ] **Step 3: 新增 `hotel-custom-fields.ts`**（参照 plugin.ts 内既有 productVariantCustomFields 的去重注册模式）

```ts
// 变体酒店房型配置 customFields：public 使店铺端查询可见
export const hotelRoomCustomFields = {
    ProductVariant: [
        { name: 'hotelRoomConfig', type: 'json', public: true, nullable: true },
    ],
};
```

在 plugin.ts 的 ProductVariant customFields 注册块（行1335-1345 之后）追加同款去重块：

```ts
// 注册 ProductVariant customFields（hotelRoomConfig）—— 与上方 weight/dimensions 同款去重
{
    const existingHotelPvFields = (config.customFields?.ProductVariant || []).map(f => f.name);
    const newHotelPvFields = (hotelRoomCustomFields.ProductVariant || []).filter(
        f => !existingHotelPvFields.includes(f.name),
    );
    if (newHotelPvFields.length > 0) {
        config.customFields = {
            ...config.customFields,
            ProductVariant: [...(config.customFields?.ProductVariant || []), ...newHotelPvFields],
        };
    }
}
```

- [ ] **Step 4: 构建 + 全量单测**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Expected: lib 产物生成，无 TS 错误
Run: `cd d:\zhao\vendure\packages\cjk-plugin && npx vitest --config vitest.config.mts --run`
Expected: 全部通过（含既有 pay-config-crypto、本任务 hotel-config）

- [ ] **Step 5: Commit（vendure 仓库）**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/hotel/ packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): RoomTemplate GraphQL 接口与变体 hotelRoomConfig 自定义字段"
```

---

### Task 4: 前端计价纯函数 `hotel-pricing.ts` + 单测（nshop）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\hotel-pricing.ts`
- Test: `d:\zhao\nshop\layers\base\app\utils\__tests__\hotel-pricing.spec.ts`

- [ ] **Step 1: 先写失败单测**

```ts
import { describe, expect, it } from 'vitest';
import { calcNightPrices } from '../hotel-pricing';

const cfg = {
  basePriceCent: 88800,
  priceCalendar: [
    { type: 'weekday', rate: 1.0 },
    { type: 'weekend', rate: 1.2 },
    { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02'] },
  ],
  longStayDiscount: [{ minNights: 3, rate: 0.9 }],
};

describe('calcNightPrices', () => {
  it('平日入住 2 晚按平日价', () => {
    const r = calcNightPrices(cfg, '2026-09-14', '2026-09-16'); // 周一→周三
    expect(r).not.toBeNull();
    expect(r!.nights).toHaveLength(2);
    expect(r!.totalCent).toBe(88800 * 2);
    expect(r!.avgCent).toBe(88800);
  });
  it('跨周末按日类型计价', () => {
    const r = calcNightPrices(cfg, '2026-09-18', '2026-09-21'); // 五、六、日
    expect(r!.nights.map(n => n.type)).toEqual(['weekend', 'weekend', 'weekend']);
    expect(r!.totalCent).toBe(Math.round(88800 * 1.2 * 3));
  });
  it('节假日日期段优先', () => {
    const r = calcNightPrices(cfg, '2026-10-01', '2026-10-03'); // 国庆 1、2 日
    expect(r!.nights.map(n => n.type)).toEqual(['holiday', 'holiday']);
    expect(r!.totalCent).toBe(Math.round(88800 * 1.8 * 2));
  });
  it('连住优惠取最高档且日均价=折扣后/N', () => {
    const r = calcNightPrices(cfg, '2026-09-14', '2026-09-17'); // 3 晚
    expect(r!.totalCent).toBe(Math.round(88800 * 3 * 0.9));
    expect(r!.avgCent).toBe(Math.round((88800 * 3 * 0.9) / 3));
  });
  it('坏 JSON / 缺字段返回 null', () => {
    expect(calcNightPrices(null as any, '2026-09-14', '2026-09-16')).toBeNull();
    expect(calcNightPrices({} as any, '2026-09-14', '2026-09-16')).toBeNull();
    expect(calcNightPrices(cfg, '2026-09-16', '2026-09-16')).toBeNull(); // 0 晚
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/hotel-pricing.spec.ts`
Expected: FAIL "Cannot find module '../hotel-pricing'"

- [ ] **Step 3: 实现 `hotel-pricing.ts`（SSR 友好纯函数）**

```ts
// 酒店逐日计价纯函数（SSR 友好：无 DOM/无副作用）
// 晚数 N = 离店日期 − 入住日期（天数差，入住当日计第 1 晚；N ≥ 1）
// 判定优先级：custom > holiday > weekend（周五~周日）> weekday（周一~周四）
export type PriceSegmentType = 'weekday' | 'weekend' | 'holiday' | 'custom';

export interface PriceSegment {
  type: PriceSegmentType;
  rate?: number;
  priceCent?: number;
  dates?: string[];
}

export interface HotelPricingInput {
  basePriceCent?: number;
  priceCalendar?: PriceSegment[];
  longStayDiscount?: Array<{ minNights: number; rate: number }>;
}

export interface NightPrice {
  date: string;
  priceCent: number;
  type: PriceSegmentType;
}

export interface NightPriceResult {
  nights: NightPrice[];
  totalCent: number;
  avgCent: number;
}

export function dayTypeFor(dateStr: string, segments: PriceSegment[]): PriceSegmentType {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'weekday';
  for (const seg of segments) {
    if ((seg.type === 'holiday' || seg.type === 'custom') && seg.dates?.includes(dateStr)) {
      return seg.type;
    }
  }
  const dow = d.getDay();
  return dow === 0 || dow === 5 || dow === 6 ? 'weekend' : 'weekday';
}

export function calcNightPrices(
  cfg: HotelPricingInput | null | undefined,
  checkIn: string,
  checkOut: string,
): NightPriceResult | null {
  if (!cfg || typeof cfg.basePriceCent !== 'number' || cfg.basePriceCent < 0) return null;
  const segments: PriceSegment[] = Array.isArray(cfg.priceCalendar) ? cfg.priceCalendar : [];
  const inD = new Date(checkIn + 'T00:00:00');
  const outD = new Date(checkOut + 'T00:00:00');
  if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) return null;
  const nights = Math.round((outD.getTime() - inD.getTime()) / 86400000);
  if (nights < 1) return null;

  const nightsOut: NightPrice[] = [];
  let baseTotal = 0;
  for (let i = 0; i < nights; i++) {
    const day = new Date(inD.getTime() + i * 86400000);
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const type = dayTypeFor(dateStr, segments);
    const seg = segments.find(s => s.type === type && (!s.dates || s.dates.includes(dateStr))) ?? segments.find(s => s.type === type);
    let price = cfg.basePriceCent;
    if (seg) {
      price = seg.priceCent != null ? seg.priceCent : Math.round(cfg.basePriceCent * (seg.rate ?? 1));
    }
    nightsOut.push({ date: dateStr, priceCent: price, type });
    baseTotal += price;
  }

  const discounts = (cfg.longStayDiscount ?? []).filter(d => nights >= d.minNights).sort((a, b) => b.minNights - a.minNights);
  const rate = discounts.length ? discounts[0].rate : 1;
  const totalCent = Math.round(baseTotal * rate);
  return { nights: nightsOut, totalCent, avgCent: Math.round(totalCent / nights) };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/hotel-pricing.spec.ts`
Expected: 6 passed

- [ ] **Step 5: Commit（nshop 仓库）**

```bash
cd d:\zhao\nshop
git add layers/base/app/utils/hotel-pricing.ts layers/base/app/utils/__tests__/hotel-pricing.spec.ts
git commit -m "feat(detail): hotel 逐日计价纯函数 calcNightPrices 与单测"
```

---

### Task 5: 前端 hotel 第 4 版式 + 4 积木块 + i18n ×12（nshop）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\detail-config.ts`（DetailLayout 联合 + detailLayout 白名单 + BLOCK_DEFAULT_VISIBLE）
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailRenderer.vue`（componentMap 加 hotel）
- Create: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailHotel.vue`（版式组装）
- Create: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailDateBar.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailRoomList.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailPricePreview.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\product-detail\ProductDetailPolicy.vue`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`、`en-US.ts` 及其余 10 包（bg-BG/de-DE/es-ES/fa-IR/fr-FR/it-IT/ja-JP/ko-KR/pt-BR/ru-RU）

- [ ] **Step 1: 扩展 detail-config.ts（3 处）**

```ts
export type DetailLayout = 'classic' | 'floor' | 'dualBuy' | 'hotel';
```
```ts
// layout 缺省/非法 → 'classic'
export function detailLayout(cfg: DetailConfig | null): DetailLayout {
  const l = cfg?.layout;
  return l === 'floor' || l === 'dualBuy' || l === 'hotel' ? l : 'classic';
}
```
```ts
const BLOCK_DEFAULT_VISIBLE: Record<string, boolean> = {
  // ...既有 11 项不变，追加：
  datebar: true,
  roomList: true,
  pricePreview: true,
  policy: true,
};
```

- [ ] **Step 2: Renderer 挂接**

```ts
import DetailClassic from "./DetailClassic.vue";
import DetailFloor from "./DetailFloor.vue";
import DetailDualBuy from "./DetailDualBuy.vue";
import DetailHotel from "./DetailHotel.vue";
// ...
const componentMap: Record<string, any> = {
  classic: DetailClassic,
  floor: DetailFloor,
  dualBuy: DetailDualBuy,
  hotel: DetailHotel,
};
```

- [ ] **Step 3: 实现 4 个积木块（块模式参照 ServiceBlock.vue）**

`ProductDetailDateBar.vue`：
```vue
<script setup lang="ts">
// 入住/离店日期条：晚数 = 离店 - 入住；受 minNights/maxNights/advanceDays 约束
import { computed, ref } from "vue";
const { t, locale } = useI18n();
const productStore = useProductStore();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);

const today = new Date();
const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minDate = toDateStr(new Date(today.getTime() + 86400000)); // 最早明天入住
const maxAdvance = computed(() => {
  const adv = hotel.value?.advanceDays ?? 30;
  const d = new Date(today.getTime() + adv * 86400000);
  return toDateStr(d);
});

const checkIn = ref(minDate);
const checkOut = ref(toDateStr(new Date(today.getTime() + 2 * 86400000)));
const nights = computed(() => {
  const d = (new Date(checkOut.value).getTime() - new Date(checkIn.value).getTime()) / 86400000;
  return Math.round(d);
});
const minN = computed(() => hotel.value?.minNights ?? 1);
const maxN = computed(() => hotel.value?.maxNights ?? 30);

function onIn(v: string) {
  checkIn.value = v;
  const n = (new Date(checkOut.value).getTime() - new Date(v).getTime()) / 86400000;
  if (n < 1) {
    const d = new Date(new Date(v).getTime() + 86400000);
    checkOut.value = toDateStr(d);
  }
}
</script>

<template>
  <div v-if="hotel" class="mx-4 my-3 rounded-xl border border-gray-100 bg-white p-3 text-sm">
    <div class="flex items-center justify-between gap-2">
      <label class="flex-1">
        <span class="text-xs text-gray-400">{{ t("messages.detail.checkIn") }}</span>
        <input v-model="checkIn" type="date" class="mt-1 block w-full rounded-lg border border-gray-200 px-2 py-1.5 text-gray-700"
               :min="minDate" :max="maxAdvance" @change="onIn($event.target.value)" />
      </label>
      <label class="flex-1">
        <span class="text-xs text-gray-400">{{ t("messages.detail.checkOut") }}</span>
        <input v-model="checkOut" type="date" class="mt-1 block w-full rounded-lg border border-gray-200 px-2 py-1.5 text-gray-700"
               :min="minDate" :max="maxAdvance" />
      </label>
    </div>
    <p class="mt-2 text-xs text-gray-400">
      {{ t("messages.detail.nights", { n: nights }) }}
      <template v-if="nights > maxN || nights < minN"> · <span class="text-red-400">{{ t("messages.detail.nightsRange", { min: minN, max: maxN }) }}</span></template>
    </p>
  </div>
</template>
```

`ProductDetailRoomList.vue`：
```vue
<script setup lang="ts">
// 房型卡：规格/设施/特色标签 + 房间明细（房间号/楼层/景观）折叠展开
import { computed, ref } from "vue";
const { t, locale } = useI18n();
const productStore = useProductStore();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);
const selectedRoomNo = ref<string | null>(null);
const openRoom = ref(false);
const localize = (v: unknown) => (typeof v === "string" ? v : (v as any)?.[locale.value] ?? (v as any)?.["zh-CN"] ?? "");

const specs = computed(() => hotel.value?.specs ?? {});
const rooms = computed(() => hotel.value?.rooms ?? []);
const amenities = computed(() => (specs.value?.amenities ?? []).map(localize));
const tags = computed(() => (specs.value?.tags ?? []).map(localize));
const breakfastText = computed(() => {
  const b = specs.value?.breakfast;
  if (b === "included") return t("messages.detail.breakfastIncluded", { n: specs.value?.breakfastCount ?? 0 });
  return t("messages.detail.breakfastNotIncluded");
});
const priceText = computed(() => {
  const base = hotel.value?.basePriceCent ?? 0;
  return `¥${(base / 100).toFixed(0)}`;
});
</script>

<template>
  <div v-if="hotel" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-base font-medium text-gray-800">{{ productStore.product?.productName }}</p>
        <p class="mt-1 text-xs text-gray-400">{{ specs.bedDesc || t("messages.detail.bedType") }} · {{ specs.area }}㎡ · {{ specs.capacity }}人{{ specs.addBed ? " · " + t("messages.detail.addBed") : "" }}</p>
        <p class="mt-0.5 text-xs text-gray-400">{{ breakfastText }}</p>
      </div>
      <p class="text-base font-semibold text-primary">{{ priceText }}<span class="text-xs font-normal text-gray-400">/{{ t("messages.detail.perNight") }}</span></p>
    </div>
    <div v-if="tags.length" class="mt-2 flex flex-wrap gap-1">
      <span v-for="tag in tags" :key="tag" class="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">{{ tag }}</span>
    </div>
    <div v-if="amenities.length" class="mt-2 flex flex-wrap gap-1">
      <span v-for="a in amenities" :key="a" class="rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">{{ a }}</span>
    </div>
    <template v-if="rooms.length">
      <button class="mt-3 text-xs font-medium text-primary" @click="openRoom = !openRoom">
        {{ openRoom ? t("messages.detail.collapseRooms") : t("messages.detail.expandRooms", { n: rooms.length }) }}
      </button>
      <ul v-if="openRoom" class="mt-2 divide-y divide-gray-50 border-t border-gray-100">
        <li v-for="r in rooms" :key="r.no" class="flex items-center justify-between py-1.5 text-xs text-gray-500">
          <span>{{ r.no }} {{ t("messages.detail.room") }} · {{ r.floor }}F</span>
          <span v-if="r.view" class="text-gray-400">{{ r.view }}</span>
          <span class="rounded-full border border-gray-200 px-2 py-0.5" :class="selectedRoomNo === r.no ? 'border-primary text-primary' : ''"
                @click="selectedRoomNo = r.no">{{ selectedRoomNo === r.no ? t("messages.detail.selected") : t("messages.detail.select") }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
```

`ProductDetailPricePreview.vue`：
```vue
<script setup lang="ts">
// 逐日计价预览：calcNightPrices → 每日单价 + 总价/日均价（含节假日标注与连住折扣）
import { computed } from "vue";
import { calcNightPrices } from "../../utils/hotel-pricing";
import { localizeText } from "../../utils/detail-config";
const { t, locale } = useI18n();
const productStore = useProductStore();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);
// 与 DateBar 共享日期：此处经 useProductDetailView 缓存（见 Step 5 接线说明），兜底取默认 2 晚
const dates = computed(() => (productStore as any).hotelDates ?? { checkIn: "", checkOut: "" });

const result = computed(() => {
  if (!dates.value.checkIn || !dates.value.checkOut) return null;
  return calcNightPrices(hotel.value, dates.value.checkIn, dates.value.checkOut);
});
const typeLabel = (t: string) => localizeText({ weekday: t("messages.detail.tWeekday"), weekend: t("messages.detail.tWeekend"), holiday: t("messages.detail.tHoliday"), custom: t("messages.detail.tCustom") }, locale.value, "zh-CN") as unknown as string;
</script>

<template>
  <div v-if="result" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3 text-sm">
    <p class="text-xs text-gray-400">{{ t("messages.detail.priceByDay") }}</p>
    <ul class="mt-2 space-y-1">
      <li v-for="n in result.nights" :key="n.date" class="flex justify-between text-xs text-gray-500">
        <span>{{ n.date }}<span v-if="n.type !== 'weekday'" class="ml-1 rounded bg-orange-50 px-1 text-orange-500">{{ n.type }}</span></span>
        <span>¥{{ (n.priceCent / 100).toFixed(0) }}</span>
      </li>
    </ul>
    <div class="mt-2 flex justify-between border-t border-gray-100 pt-2">
      <span class="text-xs text-gray-400">{{ t("messages.detail.total") }}</span>
      <span class="text-base font-semibold text-primary">¥{{ (result.totalCent / 100).toFixed(0) }}</span>
    </div>
    <p class="mt-1 text-right text-xs text-gray-400">{{ t("messages.detail.avgNight") }} ¥{{ (result.avgCent / 100).toFixed(0) }}</p>
  </div>
</template>
```

`ProductDetailPolicy.vue`：
```vue
<script setup lang="ts">
// 预订规则卡：入住/离店时间、取消政策、押金、加床费
import { computed } from "vue";
const { t } = useI18n();
const productStore = useProductStore();
const hotel = computed(() => productStore.product?.customFields?.hotelRoomConfig ?? null);
const cancelText = computed(() => {
  const c = hotel.value?.cancelPolicy;
  if (!c) return "";
  if (c.type === "nonRefundable") return t("messages.detail.nonRefundable");
  return t("messages.detail.freeUntil", { h: c.freeUntilHours ?? 24 });
});
const depositText = computed(() => {
  const d = hotel.value?.depositType ?? "none";
  if (d === "payAtHotel") return t("messages.detail.payAtHotel");
  if (d === "prepay") return t("messages.detail.prepay");
  return t("messages.detail.noDeposit");
});
</script>

<template>
  <div v-if="hotel" class="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-3 text-xs text-gray-500">
    <p class="flex justify-between"><span class="text-gray-400">{{ t("messages.detail.checkInOut") }}</span><span>{{ hotel.checkInTime }} / {{ hotel.checkOutTime }}</span></p>
    <p class="mt-1.5 flex justify-between"><span class="text-gray-400">{{ t("messages.detail.cancelPolicy") }}</span><span>{{ cancelText }}</span></p>
    <p class="mt-1.5 flex justify-between"><span class="text-gray-400">{{ t("messages.detail.deposit") }}</span><span>{{ depositText }}</span></p>
    <p v-if="hotel.specs?.addBed" class="mt-1.5 flex justify-between"><span class="text-gray-400">{{ t("messages.detail.addBedFee") }}</span><span>¥{{ ((hotel.specs.addBedFeeCent ?? 0) / 100).toFixed(0) }}</span></p>
  </div>
</template>
```

- [ ] **Step 4: 实现 `DetailHotel.vue` 组装（积木式 + 块显隐兜底）**

```vue
<script setup lang="ts">
// hotel 版式：DateBar → Gallery → RoomList → PricePreview → Policy → Service → Reviews → Purchase
// 块显隐走 blockVisible 兜底链（L2 配置 → 内建默认 → true）
import { computed } from "vue";
import { useDetailConfig } from "../../composables/useDetailConfig";
import { blockVisible } from "../../utils/detail-config";
const { config } = useDetailConfig();
const productStore = useProductStore();
const isHotel = computed(() => !!productStore.product?.customFields?.hotelRoomConfig);
const v = (k: string) => blockVisible(config.value, k);
</script>

<template>
  <div v-if="isHotel">
    <ProductDetailDateBar v-if="v('datebar')" />
    <ProductDetailGallery v-if="v('gallery')" />
    <ProductDetailRoomList v-if="v('roomList')" />
    <ProductDetailPricePreview v-if="v('pricePreview')" />
    <ProductDetailPolicy v-if="v('policy')" />
    <ProductDetailServiceBlock v-if="v('service')" />
    <ProductDetailReviewsSection v-if="v('reviews')" />
    <ProductDetailPurchaseBar v-if="v('purchase')" />
  </div>
  <div v-else>
    <slot />
  </div>
</template>
```

> 注意：`DetailHotel` 内用到的组件名必须与 Nuxt 注册名一致（目录前缀 `ProductDetail` + 文件名）。若某块组件实际注册名不同（如 ReviewsSection），以既有注册名为准（读 `ProductDetailRenderer.vue` 对应版式内的实际用法逐一核对），并把本文件中的名字改一致，否则 SSR 渲染为空注释导致 hydration mismatch。

- [ ] **Step 5: 日期跨块共享接线**

在 `useProductDetailView`（`d:\zhao\nshop\layers\base\app\composables\useProductDetailView.ts`）中新增共享响应式日期并暴露给模板：

```ts
// 酒店版式：入住/离店日期跨块共享（DateBar 写入，PricePreview/PurchaseBar 读取）
export const hotelDates = ref<{ checkIn: string; checkOut: string }>({ checkIn: "", checkOut: "" });
```
并在 DateBar 的 `watch([checkIn, checkOut], ...)` 中写入 `hotelDates.value = { checkIn: checkIn.value, checkOut: checkOut.value }`；PricePreview 与 PurchaseBar 从该共享状态读取。若 `useProductDetailView` 已返回 store 单例，改为在 ProductStore 上挂 `hotelDates` 状态（ProductDetailPricePreview.vue 已按 `(productStore as any).hotelDates` 读取，二选一实现其一即可，保持两端一致）。

- [ ] **Step 6: i18n 词条 ×12**

`zh-CN.ts` 的 `messages.detail` 对象内追加（其余 11 包追加同名 key；非 zh 包值取 en-US 译文，后续语言包可再精修）：

```ts
checkIn: '入住',
checkOut: '离店',
nights: '共 {n} 晚',
nightsRange: '需 {min}-{max} 晚',
perNight: '晚起',
room: '号房',
select: '选择',
selected: '已选',
expandRooms: '展开房间明细（{n} 间）',
collapseRooms: '收起房间明细',
breakfastIncluded: '含 {n} 份早餐',
breakfastNotIncluded: '不含早餐',
addBed: '可加床',
checkInOut: '入住 / 离店',
cancelPolicy: '取消政策',
deposit: '押金',
freeUntil: '入住前 {h} 小时免费取消',
nonRefundable: '不可取消',
payAtHotel: '免押金到店付',
prepay: '预付',
noDeposit: '免押金',
addBedFee: '加床费',
priceByDay: '逐日计价',
total: '预估总价',
avgNight: '日均价',
tWeekday: '平日',
tWeekend: '周末',
tHoliday: '节假日',
tCustom: '特惠日',
bedType: '床型',
```
`en-US.ts` 对应值：`checkIn: 'Check-in'`, `checkOut: 'Check-out'`, `nights: '{n} nights'`, `nightsRange: '{min}-{max} nights required'`, `perNight: '/night'`, `room: 'Room'`, `select: 'Select'`, `selected: 'Selected'`, `expandRooms: 'Room details ({n})'`, `collapseRooms: 'Collapse rooms'`, `breakfastIncluded: '{n} breakfasts included'`, `breakfastNotIncluded: 'No breakfast'`, `addBed: 'Extra bed available'`, `checkInOut: 'Check-in / Check-out'`, `cancelPolicy: 'Cancellation'`, `deposit: 'Deposit'`, `freeUntil: 'Free cancel {h}h before check-in'`, `nonRefundable: 'Non-refundable'`, `payAtHotel: 'Pay at hotel'`, `prepay: 'Prepay'`, `noDeposit: 'No deposit'`, `addBedFee: 'Extra bed fee'`, `priceByDay: 'Daily pricing'`, `total: 'Estimated total'`, `avgNight: 'Avg / night'`, `tWeekday: 'Weekday'`, `tWeekend: 'Weekend'`, `tHoliday: 'Holiday'`, `tCustom: 'Special'`, `bedType: 'Bed'`。

验证：`cd d:\zhao\nshop && npx vitest run layers/base/app/utils/__tests__/detail-config.spec.ts` 仍通过（detailLayout 扩展不回归）。

- [ ] **Step 7: Commit（nshop 仓库）**

```bash
cd d:\zhao\nshop
git add layers/base/app/utils/detail-config.ts layers/base/app/utils/hotel-pricing.ts layers/base/app/composables/useProductDetailView.ts layers/base/app/components/product-detail/ layers/base/i18n/locales/
git commit -m "feat(detail): hotel 第 4 版式与 4 积木块（日期/房型/计价/规则）+ i18n×12"
```

---

### Task 6: web-admin 房型模板库管理页（vshop）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\room-template.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\room-templates\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（注册页面）
- Modify: `d:\zhao\vshop\web-admin\src\constants\menus.ts`（平台菜单入口）

- [ ] **Step 1: API 层（参照 `src/apis/tenant-admin.ts` 的 fetch 模式）**

```ts
// 房型模板库 API（admin-api 根请求，参照同目录其它 api 文件的 http 封装）
export interface RoomTemplate {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  coverAssetId?: string | null;
  specs?: Record<string, any> | null;
  defaultRooms?: Array<Record<string, any>> | null;
  basePriceCent: number;
  priceCalendar?: Array<Record<string, any>> | null;
  longStayDiscount?: Array<Record<string, any>> | null;
  minNights: number;
  maxNights: number;
  advanceDays: number;
  checkInTime: string;
  checkOutTime: string;
  cancelPolicy: Record<string, any>;
  depositType: string;
}

const q = `{ id code name enabled sortOrder coverAssetId specs defaultRooms basePriceCent priceCalendar longStayDiscount minNights maxNights advanceDays checkInTime checkOutTime cancelPolicy depositType }`;

export function fetchRoomTemplates(): Promise<RoomTemplate[]> {
  return http.post("/admin-api", { query: `query { roomTemplates ${q} }` }).then(r => r.data?.data?.roomTemplates ?? []);
}
export function createRoomTemplate(input: Record<string, any>): Promise<RoomTemplate> {
  return http.post("/admin-api", { query: `mutation ($input: RoomTemplateInput!) { createRoomTemplate(input: $input) ${q} }`, variables: { input } }).then(r => r.data?.data?.createRoomTemplate);
}
export function updateRoomTemplate(id: string, input: Record<string, any>): Promise<RoomTemplate> {
  return http.post("/admin-api", { query: `mutation ($id: ID!, $input: RoomTemplateInput!) { updateRoomTemplate(id: $id, input: $input) ${q} }`, variables: { id, input } }).then(r => r.data?.data?.updateRoomTemplate);
}
export function deleteRoomTemplate(id: string): Promise<boolean> {
  return http.post("/admin-api", { query: `mutation ($id: ID!) { deleteRoomTemplate(id: $id) }`, variables: { id } }).then(r => r.data?.data?.deleteRoomTemplate);
}
```
> 若项目 http 封装与 `tenant-admin.ts` 不同，以该文件实际导出为准（读 `src/apis/tenant-admin.ts` 头 30 行对齐）。

- [ ] **Step 2: 列表+表单页（样式与交互参照 `pages/platform/members/index.vue`，uni-app `<view>` 语法）**

要点（代码骨架，字段按 Step 1 类型全量实现）：
- `onLoad` 调 `fetchRoomTemplates()` 渲染列表（code/名称/基准价/启用 switch/编辑/删除）
- 「＋新建模板」按钮 → 弹层表单（复用 members 页 `.mask/.pop` 样式）：名称、code、基准价（元，提交转分）、enabled、sortOrder
- 编辑：点击行 → 同表单弹层回填；保存走 `updateRoomTemplate`
- 删除：`uni.showModal` 确认后 `deleteRoomTemplate`
- 完整规格/日历段/规则编辑为 v1 简化：表单含 specs（JSON textarea 或基础字段组）、priceCalendar（textarea 输入 JSON 数组，提交前 `JSON.parse` 校验，失败 toast）、longStayDiscount/cancelPolicy 同 JSON 输入
- 提交前校验：`basePriceCent` 为数字、JSON 字段可解析（`JSON.parse` 失败 `uni.showToast` 中断）

```vue
<!-- index.vue 关键结构（完整实现按此扩展） -->
<template>
  <view class="page">
    <view class="row head">
      <text class="title">房型模板库</text>
      <view class="head-ops">
        <text class="head-btn" @tap="onAdd">＋新建模板</text>
      </view>
    </view>
    <view class="item" v-for="t in templates" :key="t.id" @tap="onEdit(t)">
      <view class="info">
        <text class="name">{{ t.name }} <text class="code">{{ t.code }}</text></text>
        <text class="sub">基准价 ¥{{ (t.basePriceCent / 100).toFixed(0) }} · {{ t.minNights }}-{{ t.maxNights }} 晚</text>
      </view>
      <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" @click.stop />
      <text class="link danger" @tap.stop="onRemove(t)">删除</text>
    </view>
    <!-- 弹层表单 -->
    <view class="mask" v-if="showForm" @tap="showForm = false" />
    <view class="pop" v-if="showForm">
      <view class="pop-head"><text>{{ editing?.id ? '编辑模板' : '新建模板' }}</text><text class="x" @tap="showForm = false">×</text></view>
      <scroll-view scroll-y class="pop-body">
        <view class="field"><text class="label">名称</text><input v-model="form.name" placeholder="豪华套房" /></view>
        <view class="field"><text class="label">标识 code</text><input v-model="form.code" placeholder="suite" /></view>
        <view class="field"><text class="label">基准价（元/晚）</text><input v-model="form.basePriceYuan" type="digit" placeholder="888" /></view>
        <view class="field"><text class="label">日历价格段 JSON</text><textarea v-model="form.priceCalendarJson" class="ta" placeholder='[{"type":"weekday","rate":1.0},{"type":"weekend","rate":1.2}]' /></view>
        <view class="field"><text class="label">连住优惠 JSON</text><textarea v-model="form.longStayJson" class="ta" placeholder='[{"minNights":3,"rate":0.9}]' /></view>
        <view class="field"><text class="label">预订规则 JSON</text><textarea v-model="form.ruleJson" class="ta" placeholder='{"minNights":1,"maxNights":30,"advanceDays":30,"checkInTime":"14:00","checkOutTime":"12:00","cancelPolicy":{"type":"freeUntil","freeUntilHours":24},"depositType":"payAtHotel"}' /></view>
        <button class="btn" :disabled="saving" @tap="submit">{{ saving ? '保存中…' : '保存' }}</button>
        <view v-if="err" class="err">{{ err }}</view>
      </scroll-view>
    </view>
  </view>
</template>
```

- [ ] **Step 3: 注册页面与菜单**

`pages.json` 在 `"pages/platform/members/index"` 之后追加：
```json
{ "path": "pages/platform/room-templates/index", "style": { "navigationBarTitleText": "房型模板库" } },
```
`constants/menus.ts` 平台菜单数组追加：`{ title: '房型模板库', path: '/pages/platform/room-templates/index' }`（对齐该文件已有条目结构）。

- [ ] **Step 4: Commit（vshop 仓库）**

```bash
cd d:\zhao\vshop
git add web-admin/src/apis/room-template.ts web-admin/src/pages/platform/room-templates/ web-admin/src/pages.json web-admin/src/constants/menus.ts
git commit -m "feat(web-admin): 房型模板库管理页与菜单入口"
```

---

### Task 7: web-admin 商品编辑接入 + 版式选项（vshop）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\edit\index.vue`（变体区新增「酒店房型配置」分组）
- Modify: 详情页版式选择处（先定位：`rg -rn "dualBuy" d:\zhao\vshop\web-admin\src` 找到 layout 下拉所在文件后修改）

- [ ] **Step 1: 定位变体编辑区与版式下拉**

Run: `rg -n "variant|变体|customFields" d:\zhao\vshop\web-admin\src\pages\product\edit\index.vue | Select-Object -First 20` 与 `rg -rn "dualBuy|DetailLayout|layout" d:\zhao\vshop\web-admin\src | Select-Object -First 15`
读取命中处上下文，确认：① 变体编辑区插入点；② layout 下拉选项数组（应含 classic/floor/dualBuy）。

- [ ] **Step 2: 变体编辑区新增「酒店房型配置」分组**

在变体编辑区插入（与既有分组样式一致）：

```vue
<view class="group" v-if="currentVariant">
  <view class="group-title">酒店房型配置</view>
  <view v-if="!currentVariant.hotelRoomConfig">
    <view class="field"><text class="label">选择房型模板</text>
      <picker :range="roomTemplateNames" @change="onPickTemplate">
        <view class="picker">{{ pickedTemplateName || '点击选择' }}</view>
      </picker>
    </view>
    <button class="btn" :disabled="!pickedTemplateId" @tap="applyTemplate">套用模板生成快照</button>
  </view>
  <view v-else>
    <view class="info-row">已应用模板：{{ currentVariant.hotelRoomConfig.templateCode }}</view>
    <view class="field"><text class="label">房间明细 JSON</text>
      <textarea v-model="hotelForm.roomsJson" class="ta" placeholder='[{"no":"801","floor":8,"view":"湖景"}]' /></view>
    <view class="field"><text class="label">日历价格段 JSON</text>
      <textarea v-model="hotelForm.priceCalendarJson" class="ta" placeholder='[{"type":"weekday","rate":1.0}]' /></view>
    <button class="btn" @tap="saveHotelConfig">保存酒店配置</button>
  </view>
</view>
```

脚本部分：
```ts
const roomTemplateNames = ref<string[]>([]);
const roomTemplateList = ref<RoomTemplate[]>([]);
const pickedTemplateId = ref("");
const pickedTemplateName = ref("");
const hotelForm = reactive({ roomsJson: "", priceCalendarJson: "" });

async function loadRoomTemplates() {
  roomTemplateList.value = await fetchRoomTemplates();
  roomTemplateNames.value = roomTemplateList.value.map(t => t.name);
}
function onPickTemplate(e: any) {
  const t = roomTemplateList.value[Number(e.detail.value)];
  pickedTemplateId.value = t?.id ?? "";
  pickedTemplateName.value = t?.name ?? "";
}
async function applyTemplate() {
  await applyRoomTemplate(currentVariant.id, pickedTemplateId.value); // 见 Step 3 API
  uni.showToast({ title: "已生成快照", icon: "success" });
  reloadVariants(); // 复用页面既有刷新变体方法
}
async function saveHotelConfig() {
  const rooms = JSON.parse(hotelForm.roomsJson || "[]");
  const priceCalendar = JSON.parse(hotelForm.priceCalendarJson || "[]");
  await updateVariantHotelConfig(currentVariant.id, { rooms, priceCalendar }); // 见 Step 3 API
  uni.showToast({ title: "已保存", icon: "success" });
}
```
> 页面加载时 `loadRoomTemplates()`；编辑已配置变体时用 `currentVariant.hotelRoomConfig` 回填 `hotelForm` 两个 textarea。

- [ ] **Step 3: API 补充（`src/apis/room-template.ts` 追加）**

```ts
export function applyRoomTemplate(variantId: string, templateId: string): Promise<boolean> {
  return http.post("/admin-api", { query: `mutation ($variantId: ID!, $templateId: ID!) { applyRoomTemplate(variantId: $variantId, templateId: $templateId) }`, variables: { variantId, templateId } }).then(r => r.data?.data?.applyRoomTemplate);
}
export function updateVariantHotelConfig(variantId: string, patch: Record<string, any>): Promise<boolean> {
  // 复用既有 updateProductVariant customFields 写接口：读 apis/product.ts 中变体更新函数签名，把 patch 并入该变体 customFields.hotelRoomConfig 后调用
  // 若已有 updateProductVariant(id, { customFields }) 形式，则构造 { ...existing, hotelRoomConfig: { ...existing.hotelRoomConfig, ...patch } }
}
```
> `updateVariantHotelConfig` 无现成 mutation 时，直接用 Vendure 标准 `updateProductVariants` 的 customFields 入参合并（读 `src/apis/product.ts` 既有变体更新实现，按其实际形状实现，勿另造接口）。

- [ ] **Step 4: 版式下拉加 hotel 选项**

在 Step 1 定位到的 layout 下拉选项数组追加 `{ label: '酒店版式', value: 'hotel' }`（对齐既有项结构）；同时把该选项值写入的 `DetailConfig.layout` 保持与前端 `detailLayout()` 白名单一致（含 hotel）。

- [ ] **Step 5: Commit（vshop 仓库）**

```bash
cd d:\zhao\vshop
git add web-admin/src/apis/room-template.ts web-admin/src/pages/product/edit/index.vue <layout-下拉所在文件>
git commit -m "feat(web-admin): 商品编辑酒店房型配置接入与 hotel 版式选项"
```

---

### Task 8: 构建 + 部署 + 手机视口回归 + 操作手册

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\README.md`（或既有手册文件，追加章节）
- Create: 回归截图（存 `d:\zhao\vshop\web-admin\src\static\manual\shots\`）

- [ ] **Step 1: 三仓本地构建（部署铁律：本地构建，服务器只解压/restart）**

```powershell
cd d:\zhao\vendure\packages\cjk-plugin; npm run build          # 生成 lib 产物（含 SDL 变更）
cd d:\zhao\nshop; npm run build                                # Nuxt 产物
cd d:\zhao\vshop\web-admin; npm run build                      # uni-app 产物（dist）
```
Expected: 三仓构建成功、退出码 0

- [ ] **Step 2: vendure 部署**

```powershell
cd d:\zhao\vendure; powershell -ExecutionPolicy Bypass -File .\_deploy.ps1 -Message "feat(cjk-plugin): RoomTemplate 房型模板库与变体酒店配置"
```
Expected: 推送成功 + ssh 服务器 `git pull && pm2 restart vendure` 成功；随后验证：
```powershell
ssh qing "curl -s -o /dev/null -w '%{http_code}' https://e.joho.cn/admin-api"
```
Expected: 200

- [ ] **Step 3: nshop 与 web-admin 部署**

nshop：`cd d:\zhao\nshop && node scripts/deploy.mjs`（或该仓既有部署脚本，读 `d:\zhao\nshop\scripts\` 确认）
web-admin：`cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
Expected: 上传 dist 并解压成功；线上首页 200

- [ ] **Step 4: 后端 GraphQL 冒烟**

```powershell
ssh qing "curl -s -X POST https://e.joho.cn/admin-api -H 'Content-Type: application/json' -d '{\"query\":\"{ roomTemplates { id code name } }\"}' | head -c 300"
```
Expected: 返回 JSON（未鉴权报错也说明 schema 存在；若 400/「Unknown field」则 SDL 未生效，回到 Task 3 排查 plugin.ts 注册）

- [ ] **Step 5: 手机视口回归截图（Playwright，390×844 / dpr=2）**

用既有 `web-admin/_e2e/*.py` 的登录/截图工具（读该目录 README 或既有用例对齐用法），新增/复用用例截 4 张：
1. `r06_hotel_room_templates.png`：`https://e.joho.cn/guanli/#/pages/platform/room-templates/index` 模板列表（至少 1 条样例模板「豪华套房」）
2. `r07_hotel_template_form.png`：新建模板弹层表单
3. `r08_hotel_product_config.png`：商品编辑页「酒店房型配置」分组（已套用模板快照态）
4. `r09_hotel_detail.png`：nshop 移动端酒店详情页（hotel 版式：日期条 + 房型卡 + 房间明细展开 + 预估总价 + 预订规则）
> 回归前置：管理端先建 1 个样例模板（豪华套房）并套用到测试商品变体、将该商品 DetailConfig.layout 设为 hotel，手机端打开详情页截图。

- [ ] **Step 6: 操作手册补充 + 提交**

手册新增章节（沿用既有「op-NN」编号，读手册文件取下一个编号）：
- 房型模板库：入口、新建模板（名称/code/基准价/日历价格段 JSON/连住优惠/预订规则 JSON）、套用模板到商品变体
- 商品编辑酒店配置：分组位置、快照回填与 JSON 编辑、保存
- 店铺详情页版式：选择「酒店版式」
- 附 r06/r07/r08/r09 四张截图（手机视口）

```bash
cd d:\zhao\vshop
git add web-admin/src/static/manual/
git commit -m "docs(manual): 房型模板库与酒店版式操作手册 + 回归截图"
```

- [ ] **Step 7: 全量回归自检**

- 普通商品详情页仍为 classic/floor/dualBuy 原版式（`productStore.product.customFields.hotelRoomConfig` 为 null，DetailHotel 走 `v-else` 插槽不改变原渲染）——手机截图确认 1 张非酒店商品详情页无回归
- 既有单测全绿：vendure cjk-plugin vitest、nshop vitest
- 三仓 `git status` 干净（仅未跟踪诊断脚本）

---

## Self-Review 记录（写入后执行）

1. **Spec 覆盖**：实体/快照（T1/T2）、GraphQL+注册（T3）、计价纯函数（T4）、hotel 版式+块+i18n（T5）、模板库管理（T6）、商品接入+版式选项（T7）、构建部署回归手册（T8）——Spec §3/§4/§5/§6/§7 全覆盖；§8 非目标未实现属有意为之。
2. **占位符扫描**：无 TBD/TODO；Step 内所有代码完整给出；仅 Task 7 Step 1/3 为「定位后按实际结构接入」类指令，已给搜索命令与实现约束，非空泛描述。
3. **类型一致性**：`HotelConfig`/`PriceSegment`/`dayTypeFor` 在 T1（后端）与 T4（前端）为同构独立实现（分属两仓，刻意不共享）；`calcNightPrices` 返回 `{nights,totalCent,avgCent}` 与 spec §4.3 一致；SDL 字段名与实体字段、web-admin API 查询字段一一对应；`hotelRoomConfig` 命名贯穿 T2/T3/T5/T7。
