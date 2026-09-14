# 房型模板库默认房型与 JSON 录入引导 实施计划

> **方案标识：方案 1**（实施要点：后端 seed 18 种默认房型 + 内部表 `RoomTemplateControl` 幂等补种；前端 `room-template-guide.js` 纯函数驱动列表检索与三合一 JSON 引导）。
> **状态：已存档，暂缓执行。** 待其他方案设计完成后一次性统一执行（用户指令 2026-09-14）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为酒店房型模板库内置 18 种国内常用默认房型（幂等 seed），并为建模管理加入 JSON 录入引导与列表检索便利性，全程不破坏既有系统。

**Architecture:** 后端在 vendure cjk-plugin 用「种子常量 + 幂等判定纯函数」在启动时补种默认房型，并用内部表 `RoomTemplateControl` 记录客户删除行为防止重启补回；前端在 web-admin 用框架无关的辅助模块（预设片段 + 引导生成 + 列表过滤）驱动检索栏与新建弹层的三合一 JSON 引导条，均为纯增量 UI，不改既有 GraphQL 契约与保存逻辑。

**Tech Stack:** TypeScript / Vendure 3.6 / NestJS / typeorm；web-admin 为 uni-app(Vue3)+vite；后端单测 vitest，前端纯函数单测 Node 内置 `node:test`。

---
**Spec:** `d:\zhao\vshop\docs\superpowers\specs\2026-09-14-room-template-seeds-and-json-guide-design.md`

---

### Task 1: 后端种子数据 + 内部删除记录表 + 幂等判定纯函数

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template-control.entity.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template-seeds.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template-seed-logic.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template-seeds.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（注册新实体到 entities；启动时调 seed）

- [ ] **Step 1: 创建内部表实体 `RoomTemplateControl`**

```ts
import { Column, Entity } from 'typeorm';
import { VendureEntity } from '@vendure/core';

/**
 * 记录模板删除行为，配合 seed 幂等：客户删除过的房型 code，重启不再补回。
 * 纯内部表，不暴露任何 GraphQL 接口。
 */
@Entity()
export class RoomTemplateControl extends VendureEntity {
    constructor(input?: any) { super(input); }

    @Column({ unique: true })
    code: string;

    @Column({ default: true })
    deleted: boolean;
}
```

- [ ] **Step 2: 创建种子数据文件 `room-template-seeds.ts`**

> 采用「base 默认 + 每房型 override」避免 18 条重复。`name` 用中文共用文案（RoomTemplate.name 实体为 text，支持 string=共用文案）。

```ts
import { RoomTemplate } from './room-template.entity';
import { CancelPolicy, LongStayDiscount, PriceSegment } from './hotel-config';

export type BedType = 'king' | 'twin' | 'single' | 'triple' | 'family' | 'suite';

export interface RoomTemplateSeed {
    code: string;
    name: string;
    sortOrder: number;
    override?: {
        specs?: {
            bedType?: BedType; bedDesc?: string; area?: number; capacity?: number; maxCapacity?: number;
            addBed?: boolean; addBedFeeCent?: number; smoke?: 'allowed' | 'forbidden'; window?: 'has' | 'none';
            breakfast?: 'included' | 'notIncluded'; breakfastCount?: number;
            amenities?: string[]; tags?: string[];
        };
        roomsView?: string;        // 房间特色景观（默认取 tags 首项）
        basePriceCent?: number;
        priceCalendar?: PriceSegment[];
        longStayDiscount?: LongStayDiscount[];
        minNights?: number; maxNights?: number; advanceDays?: number;
        checkInTime?: string; checkOutTime?: string;
        cancelPolicy?: CancelPolicy; depositType?: string;
    };
}

export const ROOM_TEMPLATE_SEEDS: RoomTemplateSeed[] = [
    { code: 'standard-twin', name: '标准双床房', sortOrder: 10, override: { basePriceCent: 28800, specs: { bedType: 'twin', bedDesc: '双床 1.2m×2', area: 28, tags: ['安静', '禁烟'] } } },
    { code: 'standard-king', name: '标准大床房', sortOrder: 20, override: { basePriceCent: 28800, area: 28, tags: ['安静', '禁烟'] } },
    { code: 'superior-king', name: '高级大床房', sortOrder: 30, override: { basePriceCent: 35800, area: 35, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '房内躺椅'], tags: ['城景'] } },
    { code: 'superior-twin', name: '高级双床房', sortOrder: 40, override: { basePriceCent: 35800, specs: { bedType: 'twin', bedDesc: '双床 1.35m×2', area: 35, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '房内躺椅'], tags: ['城景'] } } },
    { code: 'deluxe-king', name: '豪华大床房', sortOrder: 50, override: { basePriceCent: 45800, specs: { bedDesc: '大床 2.0m', area: 42, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '浴缸', '小吧台'], tags: ['湖景', '高层'] } } },
    { code: 'deluxe-twin', name: '豪华双床房', sortOrder: 60, override: { basePriceCent: 45800, specs: { bedType: 'twin', bedDesc: '双床 1.5m×2', area: 42, capacity: 3, maxCapacity: 3, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '浴缸', '小吧台'], tags: ['湖景'] } } },
    { code: 'business-king', name: '商务大床房', sortOrder: 70, override: { basePriceCent: 42800, specs: { area: 38, breakfastCount: 1, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '办公桌', '人体工学椅'], tags: ['商务', '静音'] } } },
    { code: 'business-twin', name: '商务双床房', sortOrder: 80, override: { basePriceCent: 42800, specs: { bedType: 'twin', bedDesc: '双床 1.35m×2', area: 38, breakfastCount: 1, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '办公桌', '人体工学椅'], tags: ['商务', '静音'] } } },
    { code: 'triple', name: '三人间', sortOrder: 90, override: { basePriceCent: 39800, specs: { bedType: 'triple', bedDesc: '单人床 1.2m×3', area: 45, capacity: 3, maxCapacity: 3, breakfastCount: 3, tags: ['宽敞', '家庭'] } } },
    { code: 'family-child', name: '家庭亲子房', sortOrder: 100, override: { basePriceCent: 51800, specs: { bedType: 'family', bedDesc: '大床 1.8m + 1.2m小床', area: 50, capacity: 3, maxCapacity: 4, breakfastCount: 3, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '儿童洗漱用品', '城堡小帐篷'], tags: ['亲子', '卡通'] } } },
    { code: 'executive-king', name: '行政大床房', sortOrder: 110, override: { basePriceCent: 68800, specs: { bedDesc: '大床 2.0m', area: 46, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '行政酒廊', '胶囊咖啡机'], tags: ['行政酒廊', '高层'] } } },
    { code: 'executive-suite', name: '行政套房', sortOrder: 120, override: { basePriceCent: 88800, specs: { bedDesc: '大床 2.0m', area: 65, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '行政酒廊', '独立会客区'], tags: ['行政酒廊', '会客'] } } },
    { code: 'deluxe-suite', name: '豪华套房', sortOrder: 130, override: { basePriceCent: 118800, specs: { bedDesc: '大床 2.0m', area: 75, capacity: 3, maxCapacity: 3, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '客厅', '按摩浴缸'], tags: ['客厅', '泡浴'] }, cancelPolicy: { type: 'freeUntil', freeUntilHours: 48 }, depositType: 'prepay' } },
    { code: 'presidential-suite', name: '总统套房', sortOrder: 140, override: { basePriceCent: 388800, specs: { bedType: 'suite', bedDesc: '大床 2.0m', area: 130, capacity: 4, maxCapacity: 4, breakfastCount: 4, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '独立客厅', '管家服务', '按摩浴缸'], tags: ['顶层', '管家服务'] }, roomsView: '城景', priceCalendar: [{ type: 'weekday', rate: 1.0 }, { type: 'weekend', rate: 1.3 }, { type: 'holiday', rate: 2.0, dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'] }], cancelPolicy: { type: 'freeUntil', freeUntilHours: 48 }, depositType: 'prepay' } },
    { code: 'theme-game', name: '电竞主题房', sortOrder: 150, override: { basePriceCent: 49800, specs: { bedType: 'twin', bedDesc: '电竞双床 1.2m×2', area: 40, breakfast: 'notIncluded', breakfastCount: 0, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '电竞椅', '电竞主机', '降噪耳机'], tags: ['电竞', '高配'] }, roomsView: '园景', priceCalendar: [{ type: 'weekday', rate: 1.0 }, { type: 'weekend', rate: 1.2 }, { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'] }, { type: 'custom', rate: 1.5, dates: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'] }], cancelPolicy: { type: 'nonRefundable' }, depositType: 'prepay' } },
    { code: 'theme-movie', name: '影音主题房', sortOrder: 160, override: { basePriceCent: 46800, specs: { area: 40, breakfast: 'notIncluded', breakfastCount: 0, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '投影', '环绕音响', '氛围灯'], tags: ['影音', '影院'] }, roomsView: '园景', priceCalendar: [{ type: 'weekday', rate: 1.0 }, { type: 'weekend', rate: 1.2 }, { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'] }, { type: 'custom', rate: 1.5, dates: ['2026-07-01', '2026-08-31'] }], cancelPolicy: { type: 'nonRefundable' }, depositType: 'prepay' } },
    { code: 'theme-romantic', name: '情侣蜜月房', sortOrder: 170, override: { basePriceCent: 58800, specs: { bedDesc: '大床 2.0m', area: 45, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '浴缸', '香薰', '玫瑰布置'], tags: ['蜜月', '浪漫'] }, depositType: 'prepay' } },
    { code: 'apartment-family', name: '公寓家庭套房', sortOrder: 180, override: { basePriceCent: 72800, specs: { bedType: 'family', bedDesc: '大床 1.8m + 1.5m', area: 80, capacity: 4, maxCapacity: 5, breakfastCount: 4, amenities: ['空调', '液晶电视', '独立卫浴', '无线网络', '厨房', '洗衣机', '冰箱'], tags: ['家庭', '长住'] }, roomsView: '园景', minNights: 2, depositType: 'prepay' } },
];

/** 默认价格段（16 项中 theme-game 手写扩展；theme-movie/psych 用默认） */
export const DEFAULT_PRICE_CALENDAR: PriceSegment[] = [
    { type: 'weekday', rate: 1.0 },
    { type: 'weekend', rate: 1.2 },
    { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'] },
];

export const DEFAULT_LONG_STAY: LongStayDiscount[] = [
    { minNights: 3, rate: 0.9 },
    { minNights: 5, rate: 0.8 },
];

/** 由种子 + base 生成完整模板输入（DOMAIN 即 RoomTemplate 字段）。 */
export function buildSeedTemplate(seed: RoomTemplateSeed): Omit<RoomTemplate, 'id'> {
    const s = seed.override ?? {};
    const specs = {
        bedType: s.specs?.bedType ?? 'king',
        bedDesc: s.specs?.bedDesc ?? '大床 1.8m',
        area: s.specs?.area ?? 40,
        capacity: s.specs?.capacity ?? 2,
        maxCapacity: s.specs?.maxCapacity ?? 2,
        addBed: s.specs?.addBed ?? false,
        smoke: s.specs?.smoke ?? 'forbidden',
        window: s.specs?.window ?? 'has',
        breakfast: s.specs?.breakfast ?? 'included',
        breakfastCount: s.specs?.breakfastCount ?? 2,
        amenities: s.specs?.amenities ?? ['空调', '液晶电视', '独立卫浴', '无线网络'],
        tags: s.specs?.tags ?? [],
    };
    const view = s.roomsView ?? specs.tags[0] ?? '标准';
    const baseFloor = Math.max(6, Math.floor((specs.area ?? 40) / 10) + 5);
    return {
        code: seed.code,
        name: seed.name,
        enabled: true,
        sortOrder: seed.sortOrder,
        coverAssetId: null,
        specs,
        defaultRooms: Array.from({ length: 6 }, (_, i) => {
            const idx = i % 2; const floor = baseFloor + Math.floor(i / 2);
            return { no: `${floor}0${idx === 0 ? 1 : 2}`, floor, view };
        }),
        basePriceCent: s.basePriceCent ?? 28800,
        priceCalendar: s.priceCalendar ?? DEFAULT_PRICE_CALENDAR.map((p) => ({ ...p, dates: p.dates ? [...p.dates] : undefined })),
        longStayDiscount: s.longStayDiscount ?? DEFAULT_LONG_STAY.map((d) => ({ ...d })),
        minNights: s.minNights ?? 1,
        maxNights: s.maxNights ?? 30,
        advanceDays: s.advanceDays ?? 30,
        checkInTime: s.checkInTime ?? '14:00',
        checkOutTime: s.checkOutTime ?? '12:00',
        cancelPolicy: s.cancelPolicy ?? { type: 'freeUntil', freeUntilHours: 24 },
        depositType: s.depositType ?? 'payAtHotel',
    };
}
```

- [ ] **Step 3: 创建幂等判定纯函数 `room-template-seed-logic.ts`**

```ts
import { ROOM_TEMPLATE_SEEDS, RoomTemplateSeed, buildSeedTemplate } from './room-template-seeds';

/**
 * 决定哪些种子需要插入。
 * rule: 已存在(同名 code) → 跳过；被客户删除(control.deleted) → 跳过且不补回；否则 → 插入。
 * 纯函数，便于单测。
 */
export function resolveSeedActions(existingCodes: Set<string>, deletedCodes: Set<string>): RoomTemplateSeed[] {
    return ROOM_TEMPLATE_SEEDS.filter((s) => !existingCodes.has(s.code) && !deletedCodes.has(s.code));
}

/** 由待插入种子生成完整模板实体输入。 */
export function seedsToInsertInputs(seeds: RoomTemplateSeed[]): Array<Omit<RoomTemplate, 'id'>> {
    return seeds.map(buildSeedTemplate);
}
```

> 注意：Step 3 引用了 `RoomTemplate`，需在文件头 `import { RoomTemplate } from './room-template.entity';`。

- [ ] **Step 4: 写种子/幂等单测 `room-template-seeds.spec.ts`（vitest）**

```ts
import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_SEEDS, DEFAULT_PRICE_CALENDAR, buildSeedTemplate } from './room-template-seeds';
import { resolveSeedActions } from './room-template-seed-logic';
import { validateHotelConfig } from './hotel-config';

describe('RoomTemplate seeds', () => {
    it('库存恰好 18 种且 code 唯一', () => {
        const codes = ROOM_TEMPLATE_SEEDS.map((s) => s.code);
        expect(codes.length).toBe(18);
        expect(new Set(codes).size).toBe(18);
    });

    it('每种种子经 buildSeedTemplate + validateHotelConfig 校验通过', () => {
        for (const seed of ROOM_TEMPLATE_SEEDS) {
            const tpl = buildSeedTemplate(seed);
            const check = validateHotelConfig({ basePriceCent: tpl.basePriceCent, priceCalendar: tpl.priceCalendar ?? undefined, specs: tpl.specs ?? undefined });
            expect(check.valid, `${seed.code}: ${check.errors.join('; ')}`).toBe(true);
        }
    });

    it('默认 6 间房间、房间号/楼层/景观合法', () => {
        const tpl = buildSeedTemplate(ROOM_TEMPLATE_SEEDS[0]);
        expect(tpl.defaultRooms.length).toBe(6);
        for (const r of tpl.defaultRooms!) {
            expect(r.no).toMatch(/^\d+$/);
            expect(r.floor).toBeGreaterThan(0);
            expect(r.view).toBeTruthy();
        }
    });

    it('未含任何既有/deleted code → 全部待插入', () => {
        const out = resolveSeedActions(new Set(), new Set());
        expect(out.length).toBe(18);
    });

    it('已存在同 code → 跳过；已 deleted → 跳过且不补回', () => {
        const out = resolveSeedActions(new Set(['standard-twin']), new Set(['theme-game']));
        expect(out.some((s) => s.code === 'standard-twin')).toBe(false);
        expect(out.some((s) => s.code === 'theme-game')).toBe(false);
        expect(out.some((s) => s.code === 'deluxe-suite')).toBe(true);
    });
});
```

- [ ] **Step 5: 运行单测确认通过**

Run: `powershell -Command "cd d:\zhao\vendure\packages\cjk-plugin; pnpm run test"`
Expected: 5 个用例 PASS（含 18 种、校验、房间、幂等）。

- [ ] **Step 6: 注册 `RoomTemplateControl` 实体 + 接入启动 seed（plugin.ts）**

> 修改 `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`：
> 1. import：`import { RoomTemplateControl } from './hotel/room-template-control.entity';`
> 2. 在 `entities` 数组（含 `RoomTemplate` 的那组）追加 `RoomTemplateControl`。
> 3. 在 `onApplicationBootstrap()`（1527 行附近，`setWalletService` 之后）追加：

```ts
// 幂等补种默认房型模板（不覆盖客户改动；删除过的 code 不补回）
if (this.options.seedDefaultData !== false) {
    const rtService = injector.get(RoomTemplateService);
    await rtService.seedDefaultTemplates();
}
```

> `RoomTemplateService` 已 import（plugin 构造注入）。

- [ ] **Step 7: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/hotel/room-template-control.entity.ts packages/cjk-plugin/src/hotel/room-template-seeds.ts packages/cjk-plugin/src/hotel/room-template-seed-logic.ts packages/cjk-plugin/src/hotel/room-template-seeds.spec.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(hotel): 18 种默认房型种子 + RoomTemplateControl 删除记录表 + 幂等 seed 判定"
```

---

### Task 2: Service 实现 seed 写库 + delete 记录删除

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\hotel\room-template.service.ts`

- [ ] **Step 1: 改造 `delete()` 记录删除行为**

```ts
async delete(id: ID): Promise<void> {
    const repo = this.connection.getRepository(RoomTemplate);
    const entity = await repo.findOneOrFail({ where: { id } as any });
    const controlRepo = this.connection.getRepository(RoomTemplateControl);
    const existing = await controlRepo.findOne({ where: { code: entity.code } as any });
    if (existing) { existing.deleted = true; await controlRepo.save(existing); }
    else { await controlRepo.save(new RoomTemplateControl({ code: entity.code, deleted: true })); }
    await repo.remove(entity);
}
```

- [ ] **Step 2: SDK 新增 `seedDefaultTemplates()`**

```ts
/** 幂等补种默认房型：已存在或已删除的 code 跳过；插入通过 validateHotelConfig 校验。 */
async seedDefaultTemplates(): Promise<number> {
    const rtRepo = this.connection.getRepository(RoomTemplate);
    const controlRepo = this.connection.getRepository(RoomTemplateControl);
    const existing = new Set((await rtRepo.find({ select: ['code'] as any })).map((r) => r.code));
    const deleted = new Set((await controlRepo.find({ select: ['code'] as any })).map((c) => c.code));
    const toInsert = resolveSeedActions(existing, deleted);
    let inserted = 0;
    for (const seed of toInsert) {
        const input = buildSeedTemplate(seed);
        const check = validateHotelConfig({ basePriceCent: input.basePriceCent, priceCalendar: input.priceCalendar ?? undefined, specs: input.specs ?? undefined });
        if (!check.valid) continue; // 单条异常不阻断整体
        await rtRepo.save(rtRepo.create(input as any));
        inserted++;
    }
    return inserted;
}
```

> 需在文件头新增 import：`import { RoomTemplateControl } from './room-template-control.entity';`、`import { resolveSeedActions, seedsToInsertInputs } from './room-template-seed-logic';`（如用到）。

- [ ] **Step 3: 本地构建验证**

Run: `powershell -Command "cd d:\zhao\vendure\packages\cjk-plugin; npm run build"`
Expected: BUILD SUCCESS，无 TS 错误（dist 更新）。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/hotel/room-template.service.ts
git commit -m "feat(hotel): RoomTemplateService 实现幂等默认房型 seed + delete 记录"
```

---

### Task 3: 前端预设片段库 + 引导生成/列表过滤纯函数 + node:test 单测

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\utils\room-template-guide.js`
- Create: `d:\zhao\vshop\web-admin\tests\room-template-guide.test.mjs`

> 说明：web-admin 无 vitest/jest。纯函数写成框架无关 `.js` + JSDoc 类型注解，单测用 Node 内置 `node:test`，`node --test` 直接跑，零依赖。

- [ ] **Step 1: 创建 `room-template-guide.js`（预设片段 + 引导生成 + 列表过滤）**

```js
/**
 * 房型模板录入引导与列表过滤辅助（框架无关，供 web-admin 模板库页使用）。
 * 纯函数，无 uni/Vue/graphql 依赖，可被 node:test 直接测试。
 * @typedef {{code:string, name:string, enabled:boolean, sortOrder:number, basePriceCent:number, specs?:Record<string,any>, priceCalendar?:Array<Record<string,any>>, tags?:string[]}} RoomTemplateItem
 */

// ---------- ① 预设片段库 ----------
export const PRICE_SEGMENT_PRESETS = [
  { label: '平日 1.0', value: { type: 'weekday', rate: 1.0 } },
  { label: '周末 1.2', value: { type: 'weekend', rate: 1.2 } },
  { label: '国庆 1.8', value: { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02', '2026-10-03'] } },
  { label: '春节 2.0', value: { type: 'holiday', rate: 2.0, dates: ['2026-02-17', '2026-02-23'] } },
  { label: '寒暑假 1.5', value: { type: 'custom', rate: 1.5, dates: ['2026-07-01', '2026-07-31'] } },
];
export const LONG_STAY_PRESETS = [
  { label: '连住3晚9折', value: { minNights: 3, rate: 0.9 } },
  { label: '连住5晚8折', value: { minNights: 5, rate: 0.8 } },
];
export const CANCEL_POLICY_PRESETS = [
  { label: '24h免费取消', value: { type: 'freeUntil', freeUntilHours: 24 } },
  { label: '48h免费取消', value: { type: 'freeUntil', freeUntilHours: 48 } },
  { label: '全程不可退', value: { type: 'nonRefundable' } },
];
export const VIEW_PRESETS = ['湖景', '江景', '城景', '海景', '山景', '园景', '夜景'];
export const BED_OPTIONS = [
  { label: '大床', value: 'king' }, { label: '双床', value: 'twin' }, { label: '单人床', value: 'single' },
  { label: '三床', value: 'triple' }, { label: '亲子床', value: 'family' },
];
export const BREAKFAST_OPTIONS = [
  { label: '含 2 份早餐', value: { breakfast: 'included', breakfastCount: 2 } },
  { label: '含 1 份早餐', value: { breakfast: 'included', breakfastCount: 1 } },
  { label: '不含早', value: { breakfast: 'notIncluded', breakfastCount: 0 } },
];
export const DEPOSIT_OPTIONS = [
  { label: '到店付', value: 'payAtHotel' }, { label: '预付', value: 'prepay' }, { label: '无需担保', value: 'none' },
];

// ---------- ② 引导生成纯函数 ----------
/** 把一段对象片段并入 JSON 数组字段（priceCalendar|longStayDiscount）。若目标字段非法返回 null。 */
export function appendSegmentToList(arr, segment, byKey = 'type') {
  if (!Array.isArray(arr)) arr = [];
  const exists = arr.some((x) => x && x[byKey] === segment[byKey]);
  const next = exists ? arr.map((x) => (x[byKey] === segment[byKey] ? { ...x, ...segment } : x)) : [...arr, { ...segment }];
  return JSON.stringify(next);
}

/** 把 {no,floor,view} 房间追加进 rooms 数组（覆盖房间号相同项）。floor 缺省取上一间同楼层或 6。 */
export function appendRoom(rooms, no, floor, view) {
  if (!Array.isArray(rooms)) rooms = [];
  const f = Number.isInteger(floor) && floor > 0 ? floor : (rooms.length ? rooms[rooms.length - 1].floor : 6);
  const next = [...rooms.filter((r) => r.no !== no), { no, floor: f, view: view || '' }];
  return JSON.stringify(next);
}

/** 覆盖 specs 某个键（床型/含早/面积等）。单值覆盖。 */
export function overrideSpecsKey(specs, key, value, merge = false) {
  const base = { ...(specs || {}) };
  if (merge && Array.isArray(base[key]) && Array.isArray(value)) {
    base[key] = Array.from(new Set([...base[key], ...value]));
  } else {
    base[key] = value;
  }
  return JSON.stringify(base);
}

/** 把 holiday/custom 日期区间 'MM-DD' 展开为指定年份的字符串数组 dates。 */
export function expandDateRange(segment, year) {
  const y = year || String(new Date().getFullYear());
  if (!segment.dates || segment.dates.length === 0) return { ...segment, dates: [] };
  const first = segment.dates[0];
  if (first && /^\d{4}-/.test(first)) return { ...segment }; // 已是完整日期
  const dates = segment.dates.map((d) => (d.length === 5 ? `${y}-${d}` : d));
  return { ...segment, dates };
}

// ---------- ③ 列表过滤纯函数 ----------
export const CATEGORY_MAP = [
  { key: 'standard', label: '标准', match: /^(standard|superior)/ },
  { key: 'deluxe', label: '豪华', match: /^(deluxe|business)/ },
  { key: 'family', label: '家庭', match: /^(triple|family-child|apartment)/ },
  { key: 'executive', label: '行政套房', match: /^(executive|\w+-suite|presidential)/ },
  { key: 'theme', label: '主题房', match: /^theme-/ },
];
export function categorize(code) {
  const found = CATEGORY_MAP.find((c) => c.match.test(code || ''));
  return found ? found.key : 'other';
}

export function filterRoomTemplates(list, { q = '', category = 'all', bed = 'all', enabled = 'all', sort = 'sortOrder', order = 'asc' } = {}) {
  const kw = q.trim().toLowerCase();
  let out = (list || []).filter((t) => {
    if (enabled !== 'all' && Boolean(t.enabled) !== (enabled === 'enabled')) return false;
    if (category !== 'all' && categorize(t.code) !== category) return false;
    if (bed !== 'all' && !bedMatch(t, bed)) return false;
    if (kw) {
      const text = [t.name, t.code, t.specs?.bedDesc, ...(t.specs?.tags || []), ...(t.specs?.amenities || [])]
        .filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(kw)) return false;
    }
    return true;
  });
  const dir = order === 'desc' ? -1 : 1;
  out = out.sort((a, b) => {
    if (sort === 'price') return (a.basePriceCent - b.basePriceCent) * dir;
    if (sort === 'sortOrder') return (a.sortOrder - b.sortOrder) * dir;
    return (String(a.name || '').localeCompare(String(b.name || ''), 'zh')) * dir;
  });
  return out;
}

function bedMatch(t, bed) {
  const b = t.specs?.bedType;
  if (bed === 'king') return b === 'king' || b === 'suite';
  if (bed === 'twin') return b === 'twin';
  if (bed === 'triple') return b === 'triple';
  if (bed === 'family') return b === 'family';
  return true;
}

export function bedLabel(bedType) {
  const map = { king: '大床', twin: '双床', single: '单人床', triple: '三床', family: '亲子床', suite: '大床' };
  return map[bedType] || '—';
}
```

> 注意：文件头 `@typedef` 处引用了 `tags` 字段，但 `filterRoomTemplates` 的搜索使用了 `t.specs?.tags`。为使标签可检索，实际模板的 specs JSON 内含 tags；此处兼容 specs 顶层 tags 不存在的情形（不影响）。

- [ ] **Step 2: 写 node:test 单测 `room-template-guide.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSegmentToList, appendRoom, overrideSpecsKey, expandDateRange,
  categorize, filterRoomTemplates, PRICE_SEGMENT_PRESETS, BED_OPTIONS,
} from '../src/utils/room-template-guide.js';

const sample = [
  { code: 'deluxe-suite', name: '豪华套房', enabled: true, sortOrder: 10, basePriceCent: 118800, specs: { bedType: 'suite', bedDesc: '大床 2.0m', tags: ['客厅', '泡浴'] } },
  { code: 'theme-game', name: '电竞主题房', enabled: true, sortOrder: 20, basePriceCent: 49800, specs: { bedType: 'twin', bedDesc: '电竞双床', tags: ['电竞', '高配'] } },
  { code: 'standard-king', name: '标准大床房', enabled: false, sortOrder: 5, basePriceCent: 28800, specs: { bedType: 'king', bedDesc: '大床 1.8m', tags: ['安静'] } },
];

test('appendSegmentToList 相同 type 覆盖、新 segment 追加', () => {
  const out = JSON.parse(appendSegmentToList([{ type: 'weekday', rate: 1.0 }], { type: 'weekday', rate: 1.2 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].rate, 1.2);
  const out2 = JSON.parse(appendSegmentToList(out, { type: 'weekend', rate: 1.2 }));
  assert.equal(out2.length, 2);
});

test('appendRoom 房间号去重重排、floor 缺省取上一间', () => {
  const arr = [{ no: '601', floor: 6, view: '湖景' }];
  const out = JSON.parse(appendRoom(arr, '602', null, '湖景'));
  assert.equal(out.length, 2);
  assert.equal(out[1].floor, 6); // 缺省继承
  const out2 = JSON.parse(appendRoom(out, '601', 7, '城景'));
  assert.equal(out2.length, 2);
  assert.equal(out2.find((r) => r.no === '601').floor, 7);
});

test('overrideSpecsKey 单值覆盖 + 数组合并去重', () => {
  assert.equal(JSON.parse(overrideSpecsKey({ tags: ['湖景'] }, 'tags', ['湖景', '江景'], true)).tags.join(','), '湖景,江景');
  assert.equal(JSON.parse(overrideSpecsKey({ bedType: 'king' }, 'bedType', 'twin')).bedType, 'twin');
});

test('expandDateRange 5位补全年份，4位保持', () => {
  const out = expandDateRange({ type: 'custom', dates: ['07-01', '07-31'] }, 2026);
  assert.deepEqual(out.dates, ['2026-07-01', '2026-07-31']);
  const keep = expandDateRange({ type: 'holiday', dates: ['2026-10-01'] }, 2026);
  assert.deepEqual(keep.dates, ['2026-10-01']);
});

test('categorize code 分类', () => {
  assert.equal(categorize('deluxe-suite'), 'executive');
  assert.equal(categorize('theme-game'), 'theme');
  assert.equal(categorize('some-custom'), 'other');
});

test('filterRoomTemplates 关键词 + 分类 + 床型 + 启用 + 排序', () => {
  assert.equal(filterRoomTemplates(sample, { q: '电竞' }).length, 1);
  assert.equal(filterRoomTemplates(sample, { category: 'executive' }).length, 1);
  assert.equal(filterRoomTemplates(sample, { bed: 'twin' }).length, 1);
  assert.equal(filterRoomTemplates(sample, { enabled: 'enabled' }).length, 2);
  const priceAsc = filterRoomTemplates(sample, { sort: 'price', order: 'asc' });
  assert.equal(priceAsc[0].code, 'standard-king');
  const priceDesc = filterRoomTemplates(sample, { sort: 'price', order: 'desc' });
  assert.equal(priceDesc[0].code, 'deluxe-suite');
});

test('预设片段非空且结构合法', () => {
  assert.ok(PRICE_SEGMENT_PRESETS.length >= 5);
  assert.ok(BED_OPTIONS.length >= 3);
});
```

- [ ] **Step 3: 运行单测确认通过**

Run: `powershell -Command "cd d:\zhao\vshop\web-admin; node --test tests/room-template-guide.test.mjs"`
Expected: 8 个测试全部 PASS。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/utils/room-template-guide.js web-admin/tests/room-template-guide.test.mjs
git commit -m "feat(web-admin): 房型模板录入引导 + 列表过滤纯函数（node:test 单测）"
```

---

### Task 4: 模板库列表检索便利性（搜索/分类/床型/启用/排序 + picker 过滤）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\room-templates\index.vue`

> 前置：阅读现有 `index.vue`，在页顶数据区（`onLoad`/`onShow` 里 `fetchRoomTemplates()` 之后）引入 `filterRoomTemplates`/`categorize`。若页面尚未存在此文件，则先依据 `apis/room-template.ts` 创建完整列表页框架再叠加检索。

- [ ] **Step 1: 引入过滤依赖与响应式检索状态**

```ts
import { filterRoomTemplates, categorize, bedLabel } from '@/utils/room-template-guide';

// 在 data() 增加：
query: '', category: 'all', bed: 'all', enabled: 'all', sortField: 'sortOrder', sortDir: 'asc',
```

- [ ] **Step 2: 模板中渲染检索条**

```vue
<view class="filter-bar">
  <input class="q" v-model="query" placeholder="搜索房型名 / code / 床型 / 标签" @input="onQuery" />
  <scroll-view class="chips-x" scroll-x>
    <view class="chips">
      <text v-for="c in catOpts" :key="c.key" class="chip" :class="{ on: category === c.key }" @tap="category = c.key">{{ c.label }}</text>
    </view>
  </scroll-view>
  <view class="chips">
    <text v-for="b in bedOpts" :key="b.key" class="chip" :class="{ on: bed === b.key }" @tap="bed = b.key">{{ b.label }}</text>
  </view>
</view>
```

> `catOpts` = `[{key:'all',label:'全部'}, ...CATEGORY_MAP, {key:'other',label:'其他'}]`；`bedOpts` = `[{key:'all',label:'全部床型'}, {key:'king',label:'大床'}, {key:'twin',label:'双床'}, {key:'triple',label:'三床'}, {key:'family',label:'多床'}]`。`onQuery` 为防抖：`this.timer && clearTimeout(this.timer); this.timer = setTimeout(() => {}, 300);`（v-model=query 已即时绑定，300ms 仅为体验优化，可直接跳过）。启用/排序筛选并入排序条。

- [ ] **Step 3: 计算属性输出过滤结果 + 计数/空态**

```ts
computed: {
  filteredTemplates() {
    return filterRoomTemplates(this.templates, {
      q: this.query, category: this.category, bed: this.bed, enabled: this.enabled,
      sort: this.sortField, order: this.sortDir,
    });
  },
  templateCount() { return this.filteredTemplates.length; },
},
```

> 模板中列表 `v-for="t in filteredTemplates"`（替换原 `templates`）；列表底部显示 `共 {{ templateCount }} 个模板`；`filteredTemplates.length === 0` 时显示空态 `未找到匹配模板` + 「清除筛选」按钮（重置 query/category/bed/enabled）。排序在排序条放两个开关：`按 [基准价] 升/降`、`启用/全部`。

- [ ] **Step 4: 「选择模板」picker 复用过滤（新建 sku 弹层处）**

> 若列表页有「从模板新建」选择器，将其选项接入同一 `filterRoomTemplates(this.templates, { q: this.tplSearch, category: this.tplCategory })`，并提供 `tplSearch` 输入框。无则跳过此步。

- [ ] **Step 5: 本地构建验证**

Run: `powershell -Command "cd d:\zhao\vshop\web-admin; npm run build:h5"`
Expected: BUILD SUCCESS，无语法错误。

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/platform/room-templates/index.vue
git commit -m "feat(web-admin): 房型模板库列表检索（搜索/分类/床型/启用/排序）"
```

---

### Task 5: 新建/编辑模板弹层三合一 JSON 引导条

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\room-templates\index.vue`

> 前置：找到新建/编辑弹层表单，其中 specs/rooms/priceCalendar/longStayDiscount/取消政策 以 JSON textarea 呈现（或可串行化字段）。引导条插在各 textarea 下方，仅辅助生成文本，不改保存校验。

- [ ] **Step 1: 引导条状态与插入函数**

```ts
import { PRICE_SEGMENT_PRESETS, LONG_STAY_PRESETS, CANCEL_POLICY_PRESETS, VIEW_PRESETS, BED_OPTIONS, BREAKFAST_OPTIONS, DEPOSIT_OPTIONS, appendSegmentToList, appendRoom, overrideSpecsKey, expandDateRange } from '@/utils/room-template-guide';

// data: 
roomNo:'', roomFloor:'', roomView:'', roomCount: 0,

// 方法：
applyPresetSegment(preset) {
  const seg = expandDateRange(preset.value, this.form.year || undefined);
  if (!this.form.priceCalendar) this.form.priceCalendar = [];
  this.form.priceCalendar = JSON.parse(appendSegmentToList(this.form.priceCalendar, seg));
},
addRoomQuick() {
  const no = this.roomNo.trim();
  if (!no) return uni.showToast({ title: '请输入房间号', icon: 'none' });
  if (!this.form.rooms) this.form.rooms = [];
  this.form.rooms = JSON.parse(appendRoom(this.form.rooms, no, Number(this.roomFloor) || null, this.roomView.trim() || this.viewHint));
  this.roomNo = ''; this.roomView = ''; this.roomCount = (this.form.rooms || []).length;
},
applyBed(bed) { this.form.specsRaw = overrideSpecsKey(this.parseSpecs(), 'bedType', bed); },
applyBreakfast(o) { this.form.specsRaw = overrideSpecsKey(this.parseSpecs(), 'breakfast', o.breakfast, false); this.form.specsRaw = overrideSpecsKey(this.parseSpecs(), 'breakfastCount', o.breakfastCount, false); },
applyDeposit(v) { this.form.depositType = v; },
```

> `parseSpecs()` 返回 `this.form.specs`（对象）或 `JSON.parse(this.form.specsRaw)`。保存时沿用既有 `JSON.parse` 逐 JSON 校验，失败 toast 中断不改。

- [ ] **Step 2: 模板中渲染引导条**

```vue
<view class="guide" v-if="isEditing">
  <view class="gl"><text class="glk">常用价格段</text> · 点选插入 priceCalendar</view>
  <view class="chips">
    <text v-for="p in PRICE_SEGMENT_PRESETS" :key="p.label" class="cdot" @tap="applyPresetSegment(p)">{{ p.label }}</text>
  </view>
  <view class="gl"><text class="glk">连住优惠 / 取消政策</text></view>
  <view class="chips">
    <text v-for="p in LONG_STAY_PRESETS" :key="p.label" class="cdot" @tap="this.form.longStayDiscount = JSON.parse(appendSegmentToList(this.form.longStayDiscount || [], p.value, 'minNights'))">{{ p.label }}</text>
    <text v-for="p in CANCEL_POLICY_PRESETS" :key="p.label" class="cdot" @tap="this.form.cancelPolicy = p.value">{{ p.label }}</text>
  </view>
  <view class="gl"><text class="glk">快捷输入房间</text></view>
  <view class="qr">
    <input class="inp" v-model="roomNo" placeholder="房间号 如802" />
    <input class="inp" v-model="roomFloor" placeholder="楼层 如8" type="number" />
    <input class="inp" v-model="roomView" placeholder="特色景观" />
    <text class="btn" @tap="addRoomQuick">＋ 添加</text>
    <text class="badge" v-if="roomCount">已加 {{ roomCount }} 间</text>
  </view>
  <view class="gl"><text class="glk">床型</text></view>
  <view class="chips">
    <text v-for="b in BED_OPTIONS" :key="b.value" class="cdot" @tap="applyBed(b.value)">{{ b.label }}</text>
  </view>
  <view class="gl"><text class="glk">含早 / 押金</text></view>
  <view class="chips">
    <text v-for="o in BREAKFAST_OPTIONS" :key="o.label" class="cdot" @tap="applyBreakfast(o)">{{ o.label }}</text>
    <text v-for="o in DEPOSIT_OPTIONS" :key="o.label" class="cdot" @tap="applyDeposit(o.value)">{{ o.label }}</text>
  </view>
</view>
```

> 引导条仅当 `isEditing`（新建或编辑弹层打开）显示；`PRICE_SEGMENT_PRESETS` 等在 `setup`/`computed` 中暴露为常量引用。保存沿用原 `submit()` 的 JSON.parse 校验流程不变。

- [ ] **Step 3: 本地构建验证**

Run: `powershell -Command "cd d:\zhao\vshop\web-admin; npm run build:h5"`
Expected: BUILD SUCCESS。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/platform/room-templates/index.vue
git commit -m "feat(web-admin): 房型模板新建/编辑三合一 JSON 引导条（价格段/房间/床型/含早押金）"
```

---

### Task 6: 构建验证 + 部署 + 手机视口回归 + 操作手册

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`（op-17 追加）
- Artifacts: 手机视口截图（390×844）

- [ ] **Step 1: 两端全量本地构建**

Run (后端): `powershell -Command "cd d:\zhao\vendure\packages\cjk-plugin; npm run build; cd ..\..; pnpm -w run test"`
Expected: cjk build 成功；单测（含 5 个种子用例）通过。

Run (前端): `powershell -Command "cd d:\zhao\vshop\web-admin; pnpm run build:h5"`
Expected: BUILD SUCCESS。

- [ ] **Step 2: 部署后端（服务器仅 pull + restart）**

Run: `powershell -ExecutionPolicy Bypass -File "d:\zhao\vendure\_deploy.ps1" -Message "feat(hotel): 默认18房型种子 seed + JSON 录入引导 - NonInteractive"`
Expected: 本地构建 → commit → push → 服务器 `git pull && pm2 restart vendure` 成功，`pm2 status` 稳定 online。

- [ ] **Step 3: 部署前端（dist 产物上传服务器）**

Run: `powershell -Command "cd d:\zhao\vshop\web-admin; node scripts/deploy.mjs"`
Expected: dist 已上传，线上 200。

- [ ] **Step 4: GraphQL 冒烟（种子已落库）**

Run: 查询 `d:\zhao\vshop\web-admin\src\apis\room-template.ts` 的 `fetchRoomTemplates()`（或 GraphQL playground 手动执行 `{ roomTemplates { code name } }`）。
Expected: 返回 ≥18 条默认房型（含 deluxe-suite / theme-game / presidential-suite 等），且 `theme-game` 不含早、`presidential-suite` holiday=2.0。

- [ ] **Step 5: 手机视口回归截图（390×844, dpr=2）**

用 Playwright 移动视口对线上模板库页截图（参照既有 `_e2e/_probe_*.py` 模式），至少 1 张：
- `r11_room_templates_list.png`：列表含检索栏（关键词+分类 chips+床型+排序）+ 18+ 模板 + 计数
- `r12_room_template_create_guide.png`：新建弹层引导条三区块 + 引导后 JSON 已填充

- [ ] **Step 6: 操作手册 op-17 追加**

在 `index.html` 的 op-17「房型模板库与酒店版式」章节补：默认 18 房型清单说明 + 列表检索使用 + JSON 录入引导（三合一）使用 + 附 r11/r12 截图。提交。

- [ ] **Step 7: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/static/manual/index.html web-admin/src/static/manual/shots/
git commit -m "docs(manual): op-17 追加默认房型清单 + 列表检索 + JSON 录入引导（附截图）"
```

---

## Self-Review

- **Spec §2 / §2.1（18 房型全字段）** → T1（seeds + buildSeedTemplate 覆盖床型/面积/含早/设施/标签/价格段/规则差异）。完整。
- **Spec §3.1（后端 seed 幂等 + 删除不补回）** → T1 Step3/Step6 + T2（RoomTemplateControl + seedDefaultTemplates + resolveSeedActions）。
- **Spec §3.2（前端预设片段库）** → T3（PRICE_SEGMENT/LONG_STAY/CANCEL/VIEW/BED/BREAKFAST/DEPOSIT）。
- **Spec §3.3（删除记录到内部表）** → T2 Step1。
- **Spec §4.1–4.3（三合一引导）** → T5（appendSegment/appendRoom/overrideSpecsKey）。
- **Spec §4.4（列表检索便利性）** → T4（filterRoomTemplates/categorize + UI）。
- **Spec §6（测试与交付）** → T1/T3 单测 + T6（部署/截图/手册）。
- **类型一致性**：`hotelRoomConfig` 沿用既有；`filterRoomTemplates(list, opts)` 签名在 T3 定义、T4 调用一致；`appendSegmentToList/appendRoom/overrideSpecsKey/expandDateRange` 在 T3 定义、T5 调用一致；`categorize` 在 T3 定义、T4 用。无漂移。
- **占位扫描**：无 TBD/TODO；seeds 18 条全部实值；测试含实际代码与命令。

**说明（在执行中发现可与用户确认）：** T4/T5 均修改同一文件 `room-templates/index.vue`，两任务是串行（T4 先合入后 T5 再改），Subagent-Driven 下需按任务顺序逐子代理执行并在 T5 前确保 T4 已提交，避免冲突。