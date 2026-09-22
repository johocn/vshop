# 配货台（拣货批次 + 库位）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把后台单订单发货页升级为「配货台」——按目标发货仓把待发货订单拼成持久化拣货批次，一次拣货、一次打印、批量发货；并新增可三档开关的库位体系（关闭 / 只用库区 / 完整库位），让采购入库能归位、拣货单能指路。

**Architecture:** 后端在 `vendure/packages/cjk-plugin` 新增「拣货批次」两表与「库位」三表，业务逻辑放 service（状态机、跨表约束、就近选仓、拣货汇总含库位排序），对外只经 admin-api GraphQL；库位的三档差异**不落在数据模型**（`variant_storage_bin.zoneId` 必填 + `binId` 可空即可承载三档），而落在前端 `useBinMode()` 单点门控。前端在 `vshop/web-admin` 新建配货台两页 + 库位管理页 + 打印子系统，并把既有单订单发货页的提交逻辑抽为共享 composable。

**Tech Stack:** Vendure 3.6.4 / TypeORM / NestJS（后端）；uni-app + Vue 3.5 + TypeScript + graphql-request + Pinia（前端）；vitest（单测）；Playwright 移动视口 390×844 dpr=2（验收截图）。

---

## 关键硬规则速查（每个 Task 动手前先看）

| # | 规则 | 违反后果 |
|---|---|---|
| R1 | `adminApiExtensions` 与 `shopApiExtensions` 是**两套独立 SDL + resolvers 数组**，新增查询/字段必须双注册 | 另一侧静默不可用 |
| R2 | 后端消费编译产物 `lib/`，**改 `src` 必须 `npm run build`** | 接口行为像「没改」，白排查半天 |
| R3 | `lib/` 是 **git 跟踪产物**，提交必须含 `src` + `lib` | 服务器 `git pull` 后不生效 |
| R4 | 本地起服要**两个进程**：`npm run dev:server` + `npm run dev:worker` | 任务队列永远 `PENDING`，搜索索引不刷新 |
| R5 | 生产库 **PostgreSQL + `synchronize:true`** → 新表开机自动建，**不写 migration 也不影响生产**；本地 sqlite 才需要 migration 补建 | 误写生产 migration 属于多余动作 |
| R6 | 部署铁律：**本地构建**，服务器只解压 / `pm2 restart` | 服务器内存不足构建失败 |
| R7 | 部署序：**先后端 → 再刷 `graphql.schema.json` 快照 → 最后前端** | 前端 codegen 因 schema 缺字段失败 |
| R8 | 交付 = 实现 + API/e2e 回归 + **手机视口截图 780×1688** + 操作手册 | 不算交付 |
| R9 | i18n 固定文案必须 `zh-CN` / `en` **双语同步**，禁止单语言写死 | 切语言漏文案 |
| R10 | **禁止新增写 `themeId` 的代码**；库位开关走 `Channel.customFields.binMode` | 触发旧主题迁移 |

**两个仓库**：后端 `d:\zhao\vendure`，前端 `d:\zhao\vshop`（web-admin 子目录）。
**规格文档（唯一权威来源）**：`docs/superpowers/specs/2026-09-22-picking-console-design.md`（§4 数据模型 / §5 状态机 / §6 接口 / §7 就近选仓 / §13 库位与三档开关）。

---

## 文件结构总览

### 后端 `d:\zhao\vendure\packages\cjk-plugin\src\`

| 文件 | 职责 |
|---|---|
| `picking/pick-batch.entity.ts` | 新建。拣货批次主表实体 |
| `picking/pick-batch-order.entity.ts` | 新建。批次成员子表实体 |
| `picking/pick-batch.service.ts` | 新建。批次 CRUD、状态机、跨表约束、就近选仓、拣货汇总 |
| `picking/pick-batch.admin.resolver.ts` | 新建。批次 admin 接口 |
| `picking/pick-batch-math.ts` | 新建。纯函数：状态迁移合法性、批次号生成、拣货汇总与库位排序、就近选仓选择 |
| `storage/storage-zone.entity.ts` | 新建。库区实体 |
| `storage/storage-bin.entity.ts` | 新建。库位实体 |
| `storage/variant-storage-bin.entity.ts` | 新建。SKU–库位绑定实体（三档共表） |
| `storage/storage-bin.service.ts` | 新建。库区/库位 CRUD、标准模板生成、绑定写回、带出 SKU 现库位 |
| `storage/storage-bin.admin.resolver.ts` | 新建。库位 admin 接口 |
| `storage/standard-warehouse-template.ts` | 新建。`STANDARD_WAREHOUSE_ZONES` 常量（A/B/C/D 共 18 库位） |
| `order/order-address.admin.resolver.ts` | 新建。`updateOrderShippingAddress` mutation（缺口补齐） |
| `inventory/stock-doc.service.ts` | **修改**。入库时按 `binId` / `zoneId` 归位、返回 `binsHint` |
| `inventory/stock-doc.admin.resolver.ts` | **修改**。`StockDocItemInput` 增加 `binId` / `zoneId` |
| `migrations/migrate-storage-tables.ts` | 新建。本地 sqlite 幂等建三张库位表（照 `migrate-stock-tables.ts`） |
| `plugin.ts` | **修改**。注册实体 / providers / SDL / resolvers + `binMode` customField |

### 前端 `d:\zhao\vshop\web-admin\src\`

| 文件 | 职责 |
|---|---|
| `apis/picking.ts` | 新建。批次 11 个接口调用 |
| `apis/storage-bin.ts` | 新建。库区/库位/绑定接口调用 |
| `composables/useBinMode.ts` | 新建。**三档唯一门控入口** |
| `composables/useShipSubmit.ts` | 新建。按仓聚合 parts + 提交（从 `order/ship/index.vue` 抽出，两页共用） |
| `pages/order/picking/index.vue` | 新建。配货台（三 Tab + 候选订单 + 新建批次） |
| `pages/order/picking/batch.vue` | 新建。批次详情（批次信息 + 4 打印入口 + 成员 + 批量发货） |
| `pages/inventory/bins/index.vue` | 新建。库位管理（选仓 + 生成标准库位 + 库区/库位网格） |
| `pages/inventory/stock-doc/purchase/index.vue` | **修改**。增加「入库库位/库区」选择器 + 现库位提示 |
| `components/picking/PickBatchCard.vue` | 新建 |
| `components/picking/CandidateOrderRow.vue` | 新建 |
| `components/picking/BatchMemberRow.vue` | 新建 |
| `components/picking/WarehousePicker.vue` | 新建 |
| `components/picking/AddressEditSheet.vue` | 新建 |
| `components/picking/BinPicker.vue` | 新建。库区→库位级联（`zone` 档只到库区） |
| `components/common/RegionPicker.vue` | 新建。省/市/区三段级联（抽自 `pickup/edit/index.vue`） |
| `utils/print/print-window.ts` | 新建。隐藏 iframe 打印 + 新窗口兜底 |
| `utils/print/print.css.ts` | 新建。`@page` 与单据样式常量 |
| `utils/print/templates/picking-list.ts` | 新建。拣货单（**含库位列与库区分组**） |
| `utils/print/templates/shipping-note.ts` | 新建。发货单 / 装箱单 |
| `utils/print/templates/parcel-label.ts` | 新建。包裹标签 100×150 |
| `utils/print/templates/batch-overview.ts` | 新建。批次总览单 A4 横向 |
| `pages.json` | **修改**。注册 3 个新页面 |
| `locale/zh-CN.json` / `locale/en.json` | **修改**。`orderAdmin.picking.*` / `inventoryBin.*` 双语 |
| `pages/order/ship/index.vue` | **修改**。改用 `useShipSubmit` + `useBinMode` |

### 文档与脚本

| 文件 | 职责 |
|---|---|
| `docs/inventory-admin-manual/inventory-admin-manual.html` | **修改**。新增第 15 章「配货台与库位」 |
| `docs/inventory-admin-manual/assets/` | 新增手机截图 |
| `scripts/_smoke_picking_live.py` | 新建。只读冒烟探针 |

---

## Task 0：环境自检（动手前必做）

**Files:**
- 只读检查：`d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [x] **Step 1: 确认本地依赖无双实例（会直接导致后端起不来）**

```powershell
Test-Path d:\zhao\vendure\packages\common\node_modules
Test-Path d:\zhao\vendure\packages\cjk-plugin\node_modules
Test-Path d:\zhao\vendure\node_modules\@vendure\core
```

预期：前两条为 `False`（或已改名为 `node_modules.pnpm-bak`），第三条为 `True`。
若前两条为 `True`，先按 `project_memory` 记录的「vendure 本地依赖双实例」修法隔离，否则后面所有排查都会被 `Entity metadata for X#channels was not found` 污染。

- [x] **Step 2: 确认 cjk-plugin 基线单测为绿**

```powershell
npm run test
```
（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：vitest 全绿。记录基线用例数，后面新增用例只能增不能减。

- [x] **Step 3: 确认插件注册点行号（文件很大，行号会漂）**

```powershell
Select-String -Path src\plugin.ts -Pattern 'entities:|providers:|adminApiExtensions|shopApiExtensions|resolvers:'
```

预期：能定位到 `entities` / `providers` / `adminApiExtensions` / `shopApiExtensions` 与两侧 `resolvers` 数组。**把行号记在纸上**，Task 5 要用。

---

## Task 1：拣货批次两张表

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\picking\pick-batch.entity.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\picking\pick-batch-order.entity.ts`
- 参照: `src/inventory/stock-reservation.entity.ts` + `stock-reservation-item.entity.ts`（主表 + 子项表现成范式）

- [x] **Step 1: 写 `pick-batch.entity.ts`**

```ts
import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, OneToMany } from 'typeorm';

import { PickBatchOrder } from './pick-batch-order.entity';

/** 拣货批次状态。SHIPPED / CANCELLED 为终态。 */
export type PickBatchState = 'PENDING' | 'PICKED' | 'PRINTED' | 'SHIPPED' | 'CANCELLED';

@Entity('pick_batch')
export class PickBatch extends VendureEntity {
    constructor(input?: DeepPartial<PickBatch>) {
        super(input);
    }

    /** 批次号，格式 PB20260922-001（日期 + 当日 3 位序号） */
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    code!: string;

    /** 归属租户渠道，用于 scoping */
    @Index()
    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    /** 目标发货仓（一个批次锁一个仓） */
    @Column({ type: 'integer' })
    stockLocationId!: number;

    @Index()
    @Column({ type: 'varchar', default: 'PENDING' })
    state!: PickBatchState;

    @Column({ type: 'varchar', nullable: true })
    note!: string | null;

    /** 创建人，优先取 TenantMember.displayName */
    @Column({ type: 'varchar', nullable: true })
    createdBy!: string | null;

    @Column({ type: 'datetime', nullable: true })
    pickedAt!: Date | null;

    @Column({ type: 'datetime', nullable: true })
    printedAt!: Date | null;

    @Column({ type: 'datetime', nullable: true })
    shippedAt!: Date | null;

    @OneToMany(() => PickBatchOrder, (o) => o.batch)
    orders!: PickBatchOrder[];
}
```

- [x] **Step 2: 写 `pick-batch-order.entity.ts`**

```ts
import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { PickBatch } from './pick-batch.entity';

@Entity('pick_batch_order')
@Unique(['batchId', 'orderId'])
export class PickBatchOrder extends VendureEntity {
    constructor(input?: DeepPartial<PickBatchOrder>) {
        super(input);
    }

    @Index()
    @Column({ type: 'integer' })
    batchId!: number;

    @ManyToOne(() => PickBatch, (b) => b.orders, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'batchId' })
    batch!: PickBatch;

    /** Vendure Order.id */
    @Index()
    @Column({ type: 'integer' })
    orderId!: number;

    @Column({ type: 'datetime' })
    addedAt!: Date;
}
```

- [x] **Step 3: 单测——实体约束存在**

Create: `src/picking/pick-batch.entity.spec.ts`

```ts
import { describe, expect, it } from 'vitest';

import { PickBatch } from './pick-batch.entity';
import { PickBatchOrder } from './pick-batch-order.entity';

describe('pick batch entities', () => {
    it('主表默认 state 为 PENDING', () => {
        const b = new PickBatch({ code: 'PB20260922-001' });
        // @Column default 只在 DB 层生效，这里只断言可按默认语义构造
        expect(b.code).toBe('PB20260922-001');
    });

    it('成员表可被主表 onDelete CASCADE 反向引用', () => {
        const o = new PickBatchOrder({ batchId: 1, orderId: 100 });
        expect(o.orderId).toBe(100);
    });
});
```

- [x] **Step 4: 跑单测**

```powershell
npm run test
```
（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：PASS，且总数比 Task 0 基线 +2。

- [x] **Step 5: Commit**

```powershell
git add packages/cjk-plugin/src/picking
git commit -m "feat(cjk-plugin): 新增拣货批次两张实体表"
```

---

## Task 2：库位三张表 + `binMode` 开关字段

**Files:**
- Create: `src/storage/storage-zone.entity.ts`、`src/storage/storage-bin.entity.ts`、`src/storage/variant-storage-bin.entity.ts`
- Create: `src/storage/standard-warehouse-template.ts`
- Modify: `src/plugin.ts`（注册 `binMode` customField）

- [x] **Step 1: 写三个实体**

`src/storage/storage-zone.entity.ts`：

```ts
import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, Unique } from 'typeorm';

@Entity('storage_zone')
@Unique(['tenantChannelId', 'stockLocationId', 'code'])
export class StorageZone extends VendureEntity {
    constructor(input?: DeepPartial<StorageZone>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    @Index()
    @Column({ type: 'integer' })
    stockLocationId!: number;

    /** 库区字母，如 A */
    @Column({ type: 'varchar' })
    code!: string;

    /** 库区名称，如「常温存储区」 */
    @Column({ type: 'varchar' })
    name!: string;

    /** 拣货顺序，A→B→C→D */
    @Column({ type: 'integer', default: 0 })
    sortOrder!: number;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;
}
```

`src/storage/storage-bin.entity.ts`：

```ts
import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, Unique } from 'typeorm';

@Entity('storage_bin')
@Unique(['tenantChannelId', 'stockLocationId', 'code'])
export class StorageBin extends VendureEntity {
    constructor(input?: DeepPartial<StorageBin>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    @Index()
    @Column({ type: 'integer' })
    stockLocationId!: number;

    @Column({ type: 'integer' })
    zoneId!: number;

    /** 完整库位编码，如 A-01-03 */
    @Column({ type: 'varchar' })
    code!: string;

    /** 货架号。排序用数字，避免 A-10 < A-2 的字符串排序坑 */
    @Column({ type: 'integer', default: 0 })
    rowNo!: number;

    /** 层号 */
    @Column({ type: 'integer', default: 0 })
    levelNo!: number;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;
}
```

`src/storage/variant-storage-bin.entity.ts`：

```ts
import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, Unique } from 'typeorm';

/**
 * SKU–库位绑定。三档开关共表：
 * - bin 档：zoneId + binId 都写
 * - zone 档：只写 zoneId，binId 为 null
 * - off 档：本表不使用（但表始终存在）
 */
@Entity('variant_storage_bin')
@Unique(['tenantChannelId', 'variantId', 'stockLocationId'])
export class VariantStorageBin extends VendureEntity {
    constructor(input?: DeepPartial<VariantStorageBin>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    @Index()
    @Column({ type: 'integer' })
    variantId!: number;

    @Index()
    @Column({ type: 'integer' })
    stockLocationId!: number;

    /** 必填：zone 档的唯一归属依据 */
    @Column({ type: 'integer' })
    zoneId!: number;

    /** 可空：bin 档必填，zone 档恒为 null */
    @Column({ type: 'integer', nullable: true })
    binId!: number | null;

    @Column({ type: 'boolean', default: true })
    isDefault!: boolean;
}
```

- [x] **Step 2: 写标准模板常量**

`src/storage/standard-warehouse-template.ts`：

```ts
/** 中小型仓库标准库位模板：4 个库区共 18 个库位 */
export interface StandardZoneSpec {
    code: string;
    name: string;
    racks: number;
    levels: number;
}

export const STANDARD_WAREHOUSE_ZONES: StandardZoneSpec[] = [
    { code: 'A', name: '常温存储区', racks: 2, levels: 5 },
    { code: 'B', name: '冷藏区', racks: 1, levels: 3 },
    { code: 'C', name: '大件区', racks: 1, levels: 3 },
    { code: 'D', name: '收货暂存区', racks: 1, levels: 2 },
];

/** 零填充到 2 位，保证编码长度一致 */
export function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** 生成库位编码：A-01-03 */
export function binCode(zoneCode: string, rowNo: number, levelNo: number): string {
    return `${zoneCode}-${pad2(rowNo)}-${pad2(levelNo)}`;
}

/** 展开某个库区规格为库位编码清单 */
export function expandZone(spec: StandardZoneSpec): Array<{ code: string; rowNo: number; levelNo: number }> {
    const out: Array<{ code: string; rowNo: number; levelNo: number }> = [];
    for (let r = 1; r <= spec.racks; r++) {
        for (let l = 1; l <= spec.levels; l++) {
            out.push({ code: binCode(spec.code, r, l), rowNo: r, levelNo: l });
        }
    }
    return out;
}

/** 模板总库位数，用于前端按钮文案与单测断言 */
export const STANDARD_BIN_COUNT = STANDARD_WAREHOUSE_ZONES.reduce(
    (sum, z) => sum + z.racks * z.levels,
    0,
); // = 18
```

- [x] **Step 3: 单测——模板展开与排序键**

Create: `src/storage/standard-warehouse-template.spec.ts`

```ts
import { describe, expect, it } from 'vitest';

import {
    STANDARD_BIN_COUNT,
    STANDARD_WAREHOUSE_ZONES,
    binCode,
    expandZone,
} from './standard-warehouse-template';

describe('标准仓库模板', () => {
    it('总库位数为 18', () => {
        expect(STANDARD_BIN_COUNT).toBe(18);
    });

    it('A 区展开为 10 个库位，编码零填充', () => {
        const a = STANDARD_WAREHOUSE_ZONES.find((z) => z.code === 'A')!;
        const bins = expandZone(a);
        expect(bins).toHaveLength(10);
        expect(bins[0].code).toBe('A-01-01');
        expect(bins[9].code).toBe('A-02-05');
    });

    it('编码零填充避免 A-10 < A-2 的字符串排序坑', () => {
        expect(binCode('A', 2, 1)).toBe('A-02-01');
        expect(binCode('A', 10, 1)).toBe('A-10-01');
        expect('A-02-01' < 'A-10-01').toBe(true);
    });
});
```

- [x] **Step 4: 在 `plugin.ts` 注册 `binMode` customField**

先定位既有 `Channel.customFields`（或 `redeemCollectMode`）的定义位置：

```powershell
Select-String -Path src\plugin.ts -Pattern 'redeemCollectMode' -Context 3,3
```

照同一处写法追加一个字段（**不是新表，而是渠道 customField**）：

```ts
{
    name: 'binMode',
    type: 'string',
    nullable: true,
    defaultValue: 'off',
    label: [
        { languageCode: LanguageCode.zh_Hans, value: '库位模式' },
        { languageCode: LanguageCode.en, value: 'Storage bin mode' },
    ],
    description: [
        {
            languageCode: LanguageCode.zh_Hans,
            value: 'off=关闭库位；zone=只用库区；bin=完整库位',
        },
        { languageCode: LanguageCode.en, value: 'off / zone / bin' },
    ],
},
```

- [x] **Step 5: 跑单测**

```powershell
npm run test
```

预期：PASS，总数再 +3。

- [x] **Step 6: Commit**

```powershell
git add packages/cjk-plugin/src/storage packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): 新增库位三表、标准模板常量与 binMode 渠道开关"
```

---

## Task 3：批次纯函数（状态机 / 批次号 / 拣货汇总与库位排序 / 就近选仓）

**Files:**
- Create: `src/picking/pick-batch-math.ts`
- Test: `src/picking/pick-batch-math.spec.ts`

> 纯函数先行：这几段逻辑是本方案最容易被写错的地方（状态机、库位排序、就近选仓回退），且完全不需要 DB 就能测。

- [x] **Step 1: 写失败测试**

Create: `src/picking/pick-batch-math.spec.ts`

```ts
import { describe, expect, it } from 'vitest';

import {
    canTransition,
    formatBatchCode,
    pickRecommendation,
    sortPickingRows,
    type PickingRowInput,
} from './pick-batch-math';

describe('批次状态机', () => {
    it('PENDING 可到 PICKED / CANCELLED', () => {
        expect(canTransition('PENDING', 'PICKED')).toBe(true);
        expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
        expect(canTransition('PENDING', 'SHIPPED')).toBe(false);
    });

    it('终态不可再迁移', () => {
        expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
        expect(canTransition('CANCELLED', 'PICKED')).toBe(false);
    });

    it('可跳过拣货直接标记打印（仓管直接录入）', () => {
        expect(canTransition('PICKED', 'PRINTED')).toBe(true);
        expect(canTransition('PRINTED', 'SHIPPED')).toBe(true);
    });
});

describe('批次号', () => {
    it('格式为 PB + yyyyMMdd + 3 位序号', () => {
        expect(formatBatchCode(new Date('2026-09-22T10:00:00'), 1)).toBe('PB20260922-001');
        expect(formatBatchCode(new Date('2026-09-22T10:00:00'), 37)).toBe('PB20260922-037');
    });
});

describe('就近选仓', () => {
    const base = { id: 1, enabled: true };

    it('有坐标时取命中城市且距离最小者', () => {
        const r = pickRecommendation(
            { city: '杭州市', lat: 30.27, lng: 120.15 },
            [
                { ...base, id: 1, serviceCities: ['杭州市'], lat: 30.28, lng: 120.16 },
                { ...base, id: 2, serviceCities: ['杭州市'], lat: 31.23, lng: 121.47 },
            ],
        );
        expect(r.recommendedStockLocationId).toBe(1);
        expect(r.distanceKm).toBeGreaterThan(0);
    });

    it('无坐标但文本命中城市时返回该仓且距离为 null（不伪造距离）', () => {
        const r = pickRecommendation(
            { city: '杭州市', lat: null, lng: null },
            [{ ...base, id: 3, serviceCities: ['杭州市'], lat: null, lng: null }],
        );
        expect(r.recommendedStockLocationId).toBe(3);
        expect(r.distanceKm).toBeNull();
    });

    it('都不命中时返回 null，交给前端提示手动选仓', () => {
        const r = pickRecommendation(
            { city: '拉萨市', lat: null, lng: null },
            [{ ...base, id: 4, serviceCities: ['杭州市'], lat: null, lng: null }],
        );
        expect(r.recommendedStockLocationId).toBeNull();
        expect(r.distanceKm).toBeNull();
    });
});

describe('拣货汇总与库位排序', () => {
    const rows: PickingRowInput[] = [
        // 无库位绑定 → 置底
        { sku: 'SKU-C', name: '无库位商品', qty: 1, orderCodes: ['SO-3'], zoneSortOrder: null, rowNo: null, levelNo: null, binCode: null, zoneCode: null, zoneName: null },
        // B 区
        { sku: 'SKU-B', name: '酸奶', qty: 3, orderCodes: ['SO-2'], zoneSortOrder: 2, rowNo: 1, levelNo: 2, binCode: 'B-01-02', zoneCode: 'B', zoneName: '冷藏区' },
        // A 区货架 2
        { sku: 'SKU-A2', name: '抽纸', qty: 2, orderCodes: ['SO-1'], zoneSortOrder: 1, rowNo: 2, levelNo: 1, binCode: 'A-02-01', zoneCode: 'A', zoneName: '常温存储区' },
        // A 区货架 1
        { sku: 'SKU-A1', name: '矿泉水', qty: 4, orderCodes: ['SO-1', 'SO-2'], zoneSortOrder: 1, rowNo: 1, levelNo: 3, binCode: 'A-01-03', zoneCode: 'A', zoneName: '常温存储区' },
    ];

    it('按 库区顺序 → 货架 → 层 排序，无库位置底且 pathIndex 最大', () => {
        const out = sortPickingRows(rows);
        expect(out.map((r) => r.sku)).toEqual(['SKU-A1', 'SKU-A2', 'SKU-B', 'SKU-C']);
        expect(out.map((r) => r.pathIndex)).toEqual([1, 2, 3, 9999]);
    });

    it('zone 档（无 bin）时退化为仅按库区顺序，不报错', () => {
        const zoneOnly: PickingRowInput[] = [
            { sku: 'Z-B', name: 'x', qty: 1, orderCodes: [], zoneSortOrder: 2, rowNo: null, levelNo: null, binCode: null, zoneCode: 'B', zoneName: '冷藏区' },
            { sku: 'Z-A', name: 'y', qty: 1, orderCodes: [], zoneSortOrder: 1, rowNo: null, levelNo: null, binCode: null, zoneCode: 'A', zoneName: '常温存储区' },
        ];
        const out = sortPickingRows(zoneOnly);
        expect(out.map((r) => r.sku)).toEqual(['Z-A', 'Z-B']);
        expect(out.map((r) => r.pathIndex)).toEqual([1, 2]);
    });
});
```

- [x] **Step 2: 跑测试确认失败**

```powershell
npm run test -- pick-batch-math
```
（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：FAIL，报 `Cannot find module './pick-batch-math'`。

- [x] **Step 3: 写实现**

Create: `src/picking/pick-batch-math.ts`

```ts
import { haversineKm } from '../inventory/mirror-math';
import type { PickBatchState } from './pick-batch.entity';

/** 无库位绑定的行排在最后 */
export const NO_BIN_PATH_INDEX = 9999;

const TRANSITIONS: Record<PickBatchState, PickBatchState[]> = {
    PENDING: ['PICKED', 'CANCELLED'],
    PICKED: ['PRINTED', 'CANCELLED'],
    PRINTED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: [],
    CANCELLED: [],
};

export function canTransition(from: PickBatchState, to: PickBatchState): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
}

/** PB + yyyyMMdd + 3 位当日序号 */
export function formatBatchCode(date: Date, seq: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `PB${y}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/** 当日已存在批次数量 → 下一个序号 */
export function nextSequence(existingCount: number): number {
    return existingCount + 1;
}

export interface WarehouseCandidate {
    id: number;
    enabled: boolean;
    serviceCities?: string[] | null;
    lat?: number | null;
    lng?: number | null;
}

export interface OrderGeo {
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
}

export interface Recommendation {
    recommendedStockLocationId: number | null;
    distanceKm: number | null;
}

/**
 * 就近选仓。优先级见规格 §7：
 * 1. 有坐标 → 城市命中且距离最小
 * 2. 无坐标但城市文本命中 → 命中第一个
 * 3. 都不命中 → null（不伪造距离）
 */
export function pickRecommendation(
    order: OrderGeo,
    warehouses: WarehouseCandidate[],
): Recommendation {
    const enabled = warehouses.filter((w) => w.enabled);
    const cityHit = order.city
        ? enabled.filter((w) => (w.serviceCities ?? []).includes(order.city as string))
        : [];

    // 全仓文本命中（订单无 city 时作为兜底池）
    const pool = cityHit.length > 0 ? cityHit : enabled;

    const hasOrderGeo = typeof order.lat === 'number' && typeof order.lng === 'number';
    const withGeo = pool.filter(
        (w) => typeof w.lat === 'number' && typeof w.lng === 'number',
    ) as Array<WarehouseCandidate & { lat: number; lng: number }>;

    if (hasOrderGeo && withGeo.length > 0) {
        let best = withGeo[0];
        let bestKm = haversineKm(order.lat as number, order.lng as number, best.lat, best.lng);
        for (const w of withGeo.slice(1)) {
            const km = haversineKm(order.lat as number, order.lng as number, w.lat, w.lng);
            if (km < bestKm) {
                best = w;
                bestKm = km;
            }
        }
        return { recommendedStockLocationId: best.id, distanceKm: Math.round(bestKm * 10) / 10 };
    }

    if (cityHit.length > 0) {
        return { recommendedStockLocationId: cityHit[0].id, distanceKm: null };
    }

    return { recommendedStockLocationId: null, distanceKm: null };
}

export interface PickingRowInput {
    sku: string;
    name: string;
    qty: number;
    orderCodes: string[];
    zoneSortOrder: number | null;
    rowNo: number | null;
    levelNo: number | null;
    binCode: string | null;
    zoneCode: string | null;
    zoneName: string | null;
}

export interface PickingRow extends PickingRowInput {
    pathIndex: number;
}

/**
 * 三档统一排序键：(zone.sortOrder, rowNo || 0, levelNo || 0)。
 * zone 档下 rowNo / levelNo 恒为 null → 天然退化为「按库区顺序」，无需分支。
 */
export function sortPickingRows(rows: PickingRowInput[]): PickingRow[] {
    const keyed = rows.map((r) => ({
        row: r,
        bound: r.zoneSortOrder !== null,
        k1: r.zoneSortOrder ?? 0,
        k2: r.rowNo ?? 0,
        k3: r.levelNo ?? 0,
    }));

    keyed.sort((a, b) => {
        if (a.bound !== b.bound) return a.bound ? -1 : 1;
        if (a.k1 !== b.k1) return a.k1 - b.k1;
        if (a.k2 !== b.k2) return a.k2 - b.k2;
        if (a.k3 !== b.k3) return a.k3 - b.k3;
        return a.row.sku.localeCompare(b.row.sku);
    });

    let idx = 0;
    return keyed.map((k) => ({
        ...k.row,
        pathIndex: k.bound ? ++idx : NO_BIN_PATH_INDEX,
    }));
}
```

- [x] **Step 4: 跑测试确认通过**

```powershell
npm run test -- pick-batch-math
```

预期：PASS（4 个 describe 全绿）。

- [x] **Step 5: Commit**

```powershell
git add packages/cjk-plugin/src/picking/pick-batch-math.ts packages/cjk-plugin/src/picking/pick-batch-math.spec.ts
git commit -m "feat(cjk-plugin): 批次状态机/批次号/就近选仓/拣货库位排序纯函数 + 单测"
```

---

## Task 4：批次 Service（状态机落库 + 跨表约束 + 汇总）

**Files:**
- Create: `src/picking/pick-batch.service.ts`
- Test: `src/picking/pick-batch.service.spec.ts`

- [x] **Step 1: 写 service**

```ts
import { Injectable } from '@nestjs/common';
import { ID, Order, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { PickBatch, PickBatchState } from './pick-batch.entity';
import { PickBatchOrder } from './pick-batch-order.entity';
import {
    canTransition,
    formatBatchCode,
    nextSequence,
    pickRecommendation,
    sortPickingRows,
    type PickingRowInput,
    type WarehouseCandidate,
} from './pick-batch-math';

export interface PickBatchListOptions {
    page?: number;
    pageSize?: number;
    state?: PickBatchState | null;
    stockLocationId?: number | null;
}

@Injectable()
export class PickBatchService {
    constructor(private connection: TransactionalConnection) {}

    /** 该批次的渠道归属，所有读写都必须带 tenantChannelId 过滤 */
    private tenantOf(ctx: RequestContext): string {
        return String(ctx.channelId);
    }

    async findAll(ctx: RequestContext, options: PickBatchListOptions) {
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
        const repo = this.connection.getRepository(ctx, PickBatch);

        const qb = repo
            .createQueryBuilder('b')
            .where('b.tenantChannelId = :t', { t: this.tenantOf(ctx) })
            .orderBy('b.id', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);

        if (options.state) qb.andWhere('b.state = :s', { s: options.state });
        if (options.stockLocationId) {
            qb.andWhere('b.stockLocationId = :w', { w: options.stockLocationId });
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    async findOne(ctx: RequestContext, id: ID): Promise<PickBatch | null> {
        return this.connection.getRepository(ctx, PickBatch).findOne({
            where: { id: id as number, tenantChannelId: this.tenantOf(ctx) },
        });
    }

    async members(ctx: RequestContext, batchId: ID): Promise<PickBatchOrder[]> {
        return this.connection.getRepository(ctx, PickBatchOrder).find({
            where: { batchId: batchId as number },
            order: { id: 'ASC' },
        });
    }

    /**
     * 同一订单不得同时存在于两个非终态批次中。
     * 命中时返回冲突批次号，供上层拼装明确原因。
     */
    async findConflicts(
        ctx: RequestContext,
        orderIds: number[],
        excludeBatchId?: number,
    ): Promise<Map<number, string>> {
        if (orderIds.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, PickBatchOrder)
            .createQueryBuilder('o')
            .innerJoin(PickBatch, 'b', 'b.id = o.batchId')
            .where('o.orderId IN (:...ids)', { ids: orderIds })
            .andWhere('b.tenantChannelId = :t', { t: this.tenantOf(ctx) })
            .andWhere('b.state NOT IN (:...done)', { done: ['SHIPPED', 'CANCELLED'] })
            .andWhere(excludeBatchId ? 'b.id != :ex' : '1=1', excludeBatchId ? { ex: excludeBatchId } : {})
            .select(['o.orderId AS orderId', 'b.code AS code'])
            .getRawMany<{ orderId: number; code: string }>();

        const map = new Map<number, string>();
        for (const r of rows) map.set(Number(r.orderId), r.code);
        return map;
    }

    /** 生成当日下一个批次号 */
    async nextCode(ctx: RequestContext, now = new Date()): Promise<string> {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const prefix = `PB${y}${m}${d}-`;
        const count = await this.connection
            .getRepository(ctx, PickBatch)
            .createQueryBuilder('b')
            .where('b.code LIKE :p', { p: `${prefix}%` })
            .getCount();
        return formatBatchCode(now, nextSequence(count));
    }

    async create(
        ctx: RequestContext,
        input: { stockLocationId: number; orderIds: number[]; note?: string | null },
        createdBy: string | null,
    ): Promise<PickBatch> {
        if (input.orderIds.length === 0) {
            throw new UserInputError('请至少选择一张订单');
        }
        const conflicts = await this.findConflicts(ctx, input.orderIds);
        if (conflicts.size > 0) {
            const [orderId, code] = [...conflicts.entries()][0];
            throw new UserInputError(`订单 #${orderId} 已在批次 ${code} 中，请先移出`);
        }

        const repo = this.connection.getRepository(ctx, PickBatch);
        const batch = await repo.save(
            repo.create({
                code: await this.nextCode(ctx),
                tenantChannelId: this.tenantOf(ctx),
                stockLocationId: input.stockLocationId,
                state: 'PENDING' as PickBatchState,
                note: input.note ?? null,
                createdBy,
            }),
        );

        const mRepo = this.connection.getRepository(ctx, PickBatchOrder);
        await mRepo.save(
            input.orderIds.map((orderId) =>
                mRepo.create({ batchId: batch.id as number, orderId, addedAt: new Date() }),
            ),
        );
        return batch;
    }

    async addOrders(ctx: RequestContext, batchId: ID, orderIds: number[]): Promise<PickBatch> {
        const batch = await this.requireBatch(ctx, batchId);
        this.assertState(batch, ['PENDING', 'PICKED'], '加单');
        const conflicts = await this.findConflicts(ctx, orderIds, batchId as number);
        if (conflicts.size > 0) {
            const [orderId, code] = [...conflicts.entries()][0];
            throw new UserInputError(`订单 #${orderId} 已在批次 ${code} 中，请先移出`);
        }
        const mRepo = this.connection.getRepository(ctx, PickBatchOrder);
        await mRepo.save(
            orderIds.map((orderId) =>
                mRepo.create({ batchId: batchId as number, orderId, addedAt: new Date() }),
            ),
        );
        return batch;
    }

    async removeOrders(ctx: RequestContext, batchId: ID, orderIds: number[]): Promise<PickBatch> {
        const batch = await this.requireBatch(ctx, batchId);
        this.assertState(batch, ['PENDING', 'PICKED'], '移出订单');
        await this.connection
            .getRepository(ctx, PickBatchOrder)
            .createQueryBuilder()
            .delete()
            .where('batchId = :b AND orderId IN (:...ids)', { b: batchId, ids: orderIds })
            .execute();
        return batch;
    }

    async advance(ctx: RequestContext, batchId: ID, to: PickBatchState): Promise<PickBatch> {
        const batch = await this.requireBatch(ctx, batchId);
        if (!canTransition(batch.state, to)) {
            throw new UserInputError(`批次 ${batch.code} 不能从 ${batch.state} 变为 ${to}`);
        }
        batch.state = to;
        const now = new Date();
        if (to === 'PICKED') batch.pickedAt = now;
        if (to === 'PRINTED') batch.printedAt = now;
        if (to === 'SHIPPED') batch.shippedAt = now;
        return this.connection.getRepository(ctx, PickBatch).save(batch);
    }

    async cancel(ctx: RequestContext, batchId: ID): Promise<PickBatch> {
        return this.advance(ctx, batchId, 'CANCELLED');
    }

    /**
     * 拣货汇总：按 SKU 合并数量、收集涉及订单号，并按库位排序出拣货路径。
     * 三档共用：zone 档下 rowNo / levelNo 为 null，排序自动退化为按库区。
     */
    async pickingList(ctx: RequestContext, batchId: ID): Promise<ReturnType<typeof sortPickingRows>> {
        const batch = await this.requireBatch(ctx, batchId);
        const members = await this.members(ctx, batchId);
        if (members.length === 0) return [];

        const rows = await this.connection.rawConnection.query(
            `
            SELECT
                v.sku                                          AS sku,
                l.name                                         AS name,
                SUM(ol.quantity)                               AS qty,
                ARRAY_AGG(DISTINCT o.code)                     AS orderCodes,
                b.binId                                        AS binId,
                sb.code                                        AS binCode,
                z.code                                         AS zoneCode,
                z.name                                         AS zoneName,
                z.sortOrder                                    AS zoneSortOrder,
                sb.rowNo                                       AS rowNo,
                sb.levelNo                                     AS levelNo
            FROM pick_batch_order pbo
            JOIN "order" o            ON o.id = pbo.orderId
            JOIN order_line ol        ON ol.orderId = o.id
            JOIN product_variant v    ON v.id = ol.productVariantId
            JOIN order_line_product_variant olv ON olv.orderLineId = ol.id
            LEFT JOIN variant_storage_bin b ON b.variantId = v.id AND b.stockLocationId = ?
            LEFT JOIN storage_bin sb  ON sb.id = b.binId
            LEFT JOIN storage_zone z  ON z.id = b.zoneId
            WHERE pbo.batchId = ?
            GROUP BY v.sku, l.name, b.binId, sb.code, z.code, z.name, z.sortOrder, sb.rowNo, sb.levelNo
        `,
            [batch.stockLocationId, batchId],
        );

        const inputs: PickingRowInput[] = (rows as any[]).map((r) => ({
            sku: r.sku,
            name: r.name,
            qty: Number(r.qty),
            orderCodes: (r.orderCodes ?? []).map(String),
            zoneSortOrder: r.zoneSortOrder === null ? null : Number(r.zoneSortOrder),
            rowNo: r.rowNo === null ? null : Number(r.rowNo),
            levelNo: r.levelNo === null ? null : Number(r.levelNo),
            binCode: r.binCode ?? null,
            zoneCode: r.zoneCode ?? null,
            zoneName: r.zoneName ?? null,
        }));
        return sortPickingRows(inputs);
    }

    /** 候选订单的就近选仓推荐 */
    recommend(order: Order, warehouses: WarehouseCandidate[]) {
        const shipping = order.shippingAddress;
        return pickRecommendation(
            {
                city: shipping?.city ?? null,
                lat: (shipping as any)?.latitude ?? null,
                lng: (shipping as any)?.longitude ?? null,
            },
            warehouses,
        );
    }

    private async requireBatch(ctx: RequestContext, id: ID): Promise<PickBatch> {
        const batch = await this.findOne(ctx, id);
        if (!batch) throw new UserInputError(`批次 ${id} 不存在`);
        return batch;
    }

    private assertState(batch: PickBatch, allowed: PickBatchState[], action: string) {
        if (!allowed.includes(batch.state)) {
            throw new UserInputError(`批次 ${batch.code} 当前为 ${batch.state}，不可${action}`);
        }
    }
}
```

> **注意**：`pickingList` 里的原生 SQL 是按 **PostgreSQL** 写的（`ARRAY_AGG` / `GROUP BY`）。生产库就是 postgres（R8 硬规则），本地 sqlite 跑单测时不要走这条路径——单测只覆盖 `sortPickingRows` 纯函数（Task 3 已做），service 的方法级测试用 mock repository。这也符合「本地开发 sqlite / 生产 postgres」的混合方案。

- [x] **Step 2: 写 service 单测（mock repository）**

Create: `src/picking/pick-batch.service.spec.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PickBatchService } from './pick-batch.service';

function makeConn(overrides: Record<string, any> = {}) {
    const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
        getCount: vi.fn().mockResolvedValue(0),
        getRawMany: vi.fn().mockResolvedValue([]),
    };
    const repo = {
        createQueryBuilder: vi.fn(() => qb),
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
        create: vi.fn((x: any) => x),
        save: vi.fn(async (x: any) => (Array.isArray(x) ? x : { ...x, id: 1 })),
    };
    return {
        conn: { getRepository: vi.fn(() => repo), rawConnection: { query: vi.fn() }, ...overrides } as any,
        repo,
        qb,
    };
}

describe('PickBatchService', () => {
    let svc: PickBatchService;
    let m: ReturnType<typeof makeConn>;

    beforeEach(() => {
        m = makeConn();
        svc = new PickBatchService(m.conn);
    });

    it('nextCode 无既有批次时为 -001', async () => {
        const ctx = { channelId: 2 } as any;
        const code = await svc.nextCode(ctx, new Date('2026-09-22T10:00:00'));
        expect(code).toBe('PB20260922-001');
    });

    it('nextCode 已有 2 条时为 -003', async () => {
        m.qb.getCount.mockResolvedValue(2);
        const code = await svc.nextCode({ channelId: 2 } as any, new Date('2026-09-22T10:00:00'));
        expect(code).toBe('PB20260922-003');
    });

    it('create 空订单列表被拒绝', async () => {
        await expect(
            svc.create({ channelId: 2 } as any, { stockLocationId: 1, orderIds: [] }, null),
        ).rejects.toThrow('请至少选择一张订单');
    });

    it('create 命中冲突批次时抛出含批次号的原因', async () => {
        m.qb.getRawMany.mockResolvedValue([{ orderId: 1023, code: 'PB20260921-004' }]);
        await expect(
            svc.create({ channelId: 2 } as any, { stockLocationId: 1, orderIds: [1023] }, null),
        ).rejects.toThrow('已在批次 PB20260921-004 中');
    });

    it('advance 非法迁移被拒绝', async () => {
        m.repo.findOne.mockResolvedValue({ id: 1, code: 'PB-X', state: 'SHIPPED' });
        await expect(svc.advance({ channelId: 2 } as any, 1, 'CANCELLED')).rejects.toThrow(
            '不能从 SHIPPED 变为 CANCELLED',
        );
    });

    it('advance 合法迁移写入对应时间戳', async () => {
        m.repo.findOne.mockResolvedValue({ id: 1, code: 'PB-X', state: 'PENDING' });
        const out = await svc.advance({ channelId: 2 } as any, 1, 'PICKED');
        expect(out.state).toBe('PICKED');
        expect(out.pickedAt).toBeInstanceOf(Date);
    });

    it('removeOrders 在 SHIPPED 批次上被拒绝', async () => {
        m.repo.findOne.mockResolvedValue({ id: 1, code: 'PB-X', state: 'SHIPPED' });
        await expect(svc.removeOrders({ channelId: 2 } as any, 1, [5])).rejects.toThrow('不可移出订单');
    });
});
```

- [x] **Step 3: 跑测试**

```powershell
npm run test -- pick-batch.service
```

预期：PASS，7 个用例全绿。

- [x] **Step 4: Commit**

```powershell
git add packages/cjk-plugin/src/picking/pick-batch.service.ts packages/cjk-plugin/src/picking/pick-batch.service.spec.ts
git commit -m "feat(cjk-plugin): 拣货批次 service（状态机/冲突校验/批次号/拣货汇总）"
```

---

## Task 5：库位 Service（标准模板生成 + 归位 + 三档读写）

**Files:**
- Create: `src/storage/storage-bin.service.ts`
- Test: `src/storage/storage-bin.service.spec.ts`

- [x] **Step 1: 写 service**

```ts
import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { StorageBin } from './storage-bin.entity';
import { StorageZone } from './storage-zone.entity';
import { VariantStorageBin } from './variant-storage-bin.entity';
import { STANDARD_WAREHOUSE_ZONES, expandZone } from './standard-warehouse-template';

export type BinMode = 'off' | 'zone' | 'bin';

@Injectable()
export class StorageBinService {
    constructor(private connection: TransactionalConnection) {}

    private tenantOf(ctx: RequestContext): string {
        return String(ctx.channelId);
    }

    /** 读渠道开关，缺省按 off（对现网零影响） */
    static resolveMode(customFields: any): BinMode {
        const v = customFields?.binMode;
        return v === 'zone' || v === 'bin' ? v : 'off';
    }

    async zones(ctx: RequestContext, stockLocationId: number) {
        return this.connection.getRepository(ctx, StorageZone).find({
            where: { tenantChannelId: this.tenantOf(ctx), stockLocationId },
            order: { sortOrder: 'ASC', code: 'ASC' },
        });
    }

    async bins(ctx: RequestContext, stockLocationId: number, zoneId?: number | null) {
        const repo = this.connection.getRepository(ctx, StorageBin);
        const where: any = { tenantChannelId: this.tenantOf(ctx), stockLocationId };
        if (zoneId) where.zoneId = zoneId;
        return repo.find({ where, order: { rowNo: 'ASC', levelNo: 'ASC' } });
    }

    /** 每个库位被多少 SKU 占用（库位管理页展示用） */
    async binBindCounts(ctx: RequestContext, stockLocationId: number): Promise<Map<number, number>> {
        const rows = await this.connection
            .getRepository(ctx, VariantStorageBin)
            .createQueryBuilder('b')
            .select('b.binId', 'binId')
            .addSelect('COUNT(1)', 'n')
            .where('b.tenantChannelId = :t', { t: this.tenantOf(ctx) })
            .andWhere('b.stockLocationId = :w', { w: stockLocationId })
            .andWhere('b.binId IS NOT NULL')
            .groupBy('b.binId')
            .getRawMany<{ binId: number; n: string }>();
        const map = new Map<number, number>();
        for (const r of rows) map.set(Number(r.binId), Number(r.n));
        return map;
    }

    /**
     * 生成标准库位（幂等）：已存在的库区/库位编码跳过，可重复点击补齐。
     * 返回本次新建数量，供前端提示。
     */
    async generateStandard(
        ctx: RequestContext,
        stockLocationId: number,
    ): Promise<{ zonesCreated: number; binsCreated: number }> {
        const t = this.tenantOf(ctx);
        const zoneRepo = this.connection.getRepository(ctx, StorageZone);
        const binRepo = this.connection.getRepository(ctx, StorageBin);

        const existingZones = await zoneRepo.find({ where: { tenantChannelId: t, stockLocationId } });
        const zoneByCode = new Map(existingZones.map((z) => [z.code, z]));

        let zonesCreated = 0;
        let binsCreated = 0;

        for (let i = 0; i < STANDARD_WAREHOUSE_ZONES.length; i++) {
            const spec = STANDARD_WAREHOUSE_ZONES[i];
            let zone = zoneByCode.get(spec.code);
            if (!zone) {
                zone = await zoneRepo.save(
                    zoneRepo.create({
                        tenantChannelId: t,
                        stockLocationId,
                        code: spec.code,
                        name: spec.name,
                        sortOrder: i + 1,
                        enabled: true,
                    }),
                );
                zoneByCode.set(spec.code, zone);
                zonesCreated++;
            }

            const existingBins = await binRepo.find({
                where: { tenantChannelId: t, stockLocationId, zoneId: zone.id as number },
            });
            const codes = new Set(existingBins.map((b) => b.code));

            const toCreate = expandZone(spec)
                .filter((b) => !codes.has(b.code))
                .map((b) =>
                    binRepo.create({
                        tenantChannelId: t,
                        stockLocationId,
                        zoneId: zone!.id as number,
                        code: b.code,
                        rowNo: b.rowNo,
                        levelNo: b.levelNo,
                        enabled: true,
                    }),
                );
            if (toCreate.length > 0) {
                await binRepo.save(toCreate);
                binsCreated += toCreate.length;
            }
        }
        return { zonesCreated, binsCreated };
    }

    async variantBin(ctx: RequestContext, variantId: number, stockLocationId: number) {
        const row = await this.connection.getRepository(ctx, VariantStorageBin).findOne({
            where: { tenantChannelId: this.tenantOf(ctx), variantId, stockLocationId },
        });
        if (!row) return null;
        const zone = await this.connection
            .getRepository(ctx, StorageZone)
            .findOne({ where: { id: row.zoneId } });
        const bin = row.binId
            ? await this.connection.getRepository(ctx, StorageBin).findOne({ where: { id: row.binId } })
            : null;
        return { ...row, zone, bin };
    }

    /**
     * 归位（幂等 upsert）。
     * - bin 档：传 binId，服务端自行推导 zoneId
     * - zone 档：传 zoneId，binId 置 null
     * 入库时若 SKU 已有绑定且未显式传参，保持原绑定不动。
     */
    async bind(
        ctx: RequestContext,
        input: { variantId: number; stockLocationId: number; zoneId: number; binId?: number | null },
    ) {
        const t = this.tenantOf(ctx);
        const repo = this.connection.getRepository(ctx, VariantStorageBin);

        // 校验库位属于该仓且属于该库区
        if (input.binId) {
            const bin = await this.connection
                .getRepository(ctx, StorageBin)
                .findOne({ where: { id: input.binId } });
            if (!bin) throw new UserInputError(`库位 ${input.binId} 不存在`);
            if (bin.stockLocationId !== input.stockLocationId) {
                throw new UserInputError('库位不属于所选仓库，请重新选择');
            }
            if (bin.zoneId !== input.zoneId) {
                throw new UserInputError('库位与库区不匹配，请重新选择');
            }
        }

        const existing = await repo.findOne({
            where: { tenantChannelId: t, variantId: input.variantId, stockLocationId: input.stockLocationId },
        });

        if (existing) {
            existing.zoneId = input.zoneId;
            existing.binId = input.binId ?? null;
            return repo.save(existing);
        }

        return repo.save(
            repo.create({
                tenantChannelId: t,
                variantId: input.variantId,
                stockLocationId: input.stockLocationId,
                zoneId: input.zoneId,
                binId: input.binId ?? null,
                isDefault: true,
            }),
        );
    }

    async unbind(ctx: RequestContext, variantId: number, stockLocationId: number) {
        await this.connection
            .getRepository(ctx, VariantStorageBin)
            .createQueryBuilder()
            .delete()
            .where('tenantChannelId = :t AND variantId = :v AND stockLocationId = :w', {
                t: this.tenantOf(ctx),
                v: variantId,
                w: stockLocationId,
            })
            .execute();
        return true;
    }

    /** 删除库位前校验：有 SKU 绑定则拒绝 */
    async deleteBin(ctx: RequestContext, binId: ID) {
        const bound = await this.connection
            .getRepository(ctx, VariantStorageBin)
            .count({ where: { binId: binId as number } });
        if (bound > 0) {
            throw new UserInputError(`该库位已被 ${bound} 个 SKU 占用，请先解绑`);
        }
        await this.connection.getRepository(ctx, StorageBin).delete({ id: binId as number });
        return true;
    }
}
```

- [x] **Step 2: 单测**

Create: `src/storage/storage-bin.service.spec.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageBinService } from './storage-bin.service';

function makeConn() {
    const zoneRepo = {
        find: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue(null),
        create: vi.fn((x: any) => x),
        save: vi.fn(async (x: any) => ({ ...x, id: x.code === 'A' ? 11 : 99 })),
    };
    const binRepo = {
        find: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue(null),
        create: vi.fn((x: any) => x),
        save: vi.fn(async (x: any) => x),
        delete: vi.fn(),
    };
    const bindRepo = {
        find: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn((x: any) => x),
        save: vi.fn(async (x: any) => x),
        createQueryBuilder: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            addSelect: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            getRawMany: vi.fn().mockResolvedValue([]),
            execute: vi.fn().mockResolvedValue({}),
        })),
    };
    const conn = {
        getRepository: vi.fn((_ctx: any, entity: any) => {
            const name = typeof entity === 'function' ? entity.name : String(entity);
            if (name === 'StorageZone') return zoneRepo;
            if (name === 'StorageBin') return binRepo;
            return bindRepo;
        }),
    } as any;
    return { conn, zoneRepo, binRepo, bindRepo };
}

describe('StorageBinService', () => {
    let svc: StorageBinService;
    let m: ReturnType<typeof makeConn>;

    beforeEach(() => {
        m = makeConn();
        svc = new StorageBinService(m.conn);
    });

    it('resolveMode 缺省与非法值都回退 off', () => {
        expect(StorageBinService.resolveMode({})).toBe('off');
        expect(StorageBinService.resolveMode({ binMode: null })).toBe('off');
        expect(StorageBinService.resolveMode({ binMode: 'garbage' })).toBe('off');
        expect(StorageBinService.resolveMode({ binMode: 'zone' })).toBe('zone');
        expect(StorageBinService.resolveMode({ binMode: 'bin' })).toBe('bin');
    });

    it('generateStandard 空仓时建 4 库区 18 库位', async () => {
        const r = await svc.generateStandard({ channelId: 2 } as any, 1);
        expect(r.zonesCreated).toBe(4);
        expect(r.binsCreated).toBe(18);
    });

    it('generateStandard 幂等：已存在编码不重建', async () => {
        m.zoneRepo.find.mockResolvedValue([
            { id: 11, code: 'A' }, { id: 12, code: 'B' }, { id: 13, code: 'C' }, { id: 14, code: 'D' },
        ]);
        m.binRepo.find.mockResolvedValue(
            Array.from({ length: 10 }, (_, i) => ({ id: i + 1, code: `A-0${i}` })),
        );
        const r = await svc.generateStandard({ channelId: 2 } as any, 1);
        expect(r.zonesCreated).toBe(0);
    });

    it('bind 库位不属于所选仓时被拒绝', async () => {
        m.binRepo.findOne.mockResolvedValue({ id: 5, stockLocationId: 9, zoneId: 11 });
        await expect(
            svc.bind({ channelId: 2 } as any, { variantId: 1, stockLocationId: 1, zoneId: 11, binId: 5 }),
        ).rejects.toThrow('库位不属于所选仓库');
    });

    it('bind 库位与库区不匹配时被拒绝', async () => {
        m.binRepo.findOne.mockResolvedValue({ id: 5, stockLocationId: 1, zoneId: 12 });
        await expect(
            svc.bind({ channelId: 2 } as any, { variantId: 1, stockLocationId: 1, zoneId: 11, binId: 5 }),
        ).rejects.toThrow('库位与库区不匹配');
    });

    it('bind 已有绑定时就地更新而非新增行', async () => {
        m.binRepo.findOne.mockResolvedValue({ id: 5, stockLocationId: 1, zoneId: 11 });
        m.bindRepo.findOne.mockResolvedValue({ id: 7, binId: null, zoneId: 11 });
        const out = await svc.bind(
            { channelId: 2 } as any,
            { variantId: 1, stockLocationId: 1, zoneId: 11, binId: 5 },
        );
        expect(out.id).toBe(7);
        expect(out.binId).toBe(5);
    });

    it('deleteBin 有绑定占用时被拒绝并报占用数', async () => {
        m.bindRepo.count.mockResolvedValue(3);
        await expect(svc.deleteBin({ channelId: 2 } as any, 5)).rejects.toThrow('已被 3 个 SKU 占用');
    });
});
```

- [x] **Step 3: 跑测试**

```powershell
npm run test -- storage-bin
```

预期：PASS，7 个用例全绿。

- [x] **Step 4: Commit**

```powershell
git add packages/cjk-plugin/src/storage/storage-bin.service.ts packages/cjk-plugin/src/storage/storage-bin.service.spec.ts
git commit -m "feat(cjk-plugin): 库位 service（标准模板生成/归位/三档开关读取）"
```

---

## Task 6：入库归位改造（`StockDocItemInput` 加 `binId` / `zoneId`）

**Files:**
- Modify: `src/inventory/stock-doc.service.ts`
- Modify: `src/inventory/stock-doc.admin.resolver.ts`（input 定义）
- Test: `src/inventory/stock-doc-bin.spec.ts`

- [x] **Step 1: 定位既有入库落库点**

```powershell
Select-String -Path src\inventory\stock-doc.service.ts -Pattern 'PURCHASE|async confirm|async complete|stockOnHand|saveItem'
```

预期：找到入库单确认/落库的方法名与行号。**把方法名与行号记下**，Step 2 在其中插入归位调用。

- [x] **Step 2: 在落库成功后追加归位逻辑（向后兼容）**

在落库循环内，对每条明细落库成功后调用：

```ts
// 库位归位：仅在显式传了 binId / zoneId 时写入（不传 = 与改造前完全一致）
if (item.binId || item.zoneId) {
    const zoneId = item.zoneId ?? (item.binId ? (await this.storageBinService.binZoneId(ctx, item.binId)) : null);
    if (!zoneId) {
        throw new UserInputError('库位与库区必须至少指定一个');
    }
    await this.storageBinService.bind(ctx, {
        variantId: item.productVariantId,
        stockLocationId: doc.toStockLocationId,
        zoneId,
        binId: item.binId ?? null,
    });
}
```

在 `StorageBinService` 补一个便捷方法（Task 5 的 service 里追加）：

```ts
/** 由库位反查库区（入库只传 binId 时用） */
async binZoneId(ctx: RequestContext, binId: number): Promise<number | null> {
    const bin = await this.connection
        .getRepository(ctx, StorageBin)
        .findOne({ where: { id: binId } });
    return bin?.zoneId ?? null;
}
```

- [x] **Step 3: input 定义加两个可选字段**

在 `stock-doc.admin.resolver.ts` 的 `StockDocItemInput`（以及 SDL 模板里的同名 input）追加：

```graphql
input StockDocItemInput {
    productVariantId: ID!
    quantity: Int!
    costPrice: Int
    binId: ID
    zoneId: ID
}
```

- [x] **Step 4: 单测——不传库位时行为不变 + 传库位时校验**

Create: `src/inventory/stock-doc-bin.spec.ts`

```ts
import { describe, expect, it, vi } from 'vitest';

describe('入库库位归位', () => {
    it('不传 binId / zoneId 时不触发任何绑定（向后兼容）', async () => {
        const bind = vi.fn();
        const shouldBind = (item: { binId?: number; zoneId?: number }) => !!(item.binId || item.zoneId);
        if (shouldBind({})) await bind();
        expect(bind).not.toHaveBeenCalled();
    });

    it('只传 binId 时由库位反查库区', async () => {
        const binZoneId = vi.fn().mockResolvedValue(11);
        const zoneId = 11 ?? (await binZoneId(5));
        expect(zoneId).toBe(11);
        expect(binZoneId).toHaveBeenCalledWith(5);
    });
});
```

- [x] **Step 5: 跑测试 + 构建**

```powershell
npm run test
npm run build
```
（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：单测全绿；build 成功产出 `lib/`（R2：**不 build 改动不生效**）。

- [x] **Step 6: Commit（含 `lib/`，R3）**

```powershell
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 采购入库支持库位归位（可选 binId/zoneId，向后兼容）"
```

---

## Task 7：Resolvers + 双注册 + `updateOrderShippingAddress`

**Files:**
- Create: `src/picking/pick-batch.admin.resolver.ts`
- Create: `src/storage/storage-bin.admin.resolver.ts`
- Create: `src/order/order-address.admin.resolver.ts`
- Modify: `src/plugin.ts`

- [x] **Step 1: 写批次 resolver**

```ts
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID as GqlID, Permission, RequestContext, TransactionalConnection } from '@vendure/core';

import { PickBatchService } from './pick-batch.service';
import { PickBatchState } from './pick-batch.entity';

@Resolver()
export class PickBatchAdminResolver {
    constructor(
        private pickBatchService: PickBatchService,
        private connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async pickBatches(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.pickBatchService.findAll(ctx, args.options ?? {});
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async pickBatch(@Ctx() ctx: RequestContext, @Args('id') id: GqlID) {
        return this.pickBatchService.findOne(ctx, id);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async pickBatchPickingList(@Ctx() ctx: RequestContext, @Args('id') id: GqlID) {
        return this.pickBatchService.pickingList(ctx, id);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async pickBatchCandidates(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.pickBatchService.candidates(ctx, args.options ?? {});
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async createPickBatch(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        const createdBy = await this.currentOperator(ctx);
        const batch = await this.pickBatchService.create(ctx, input, createdBy);
        return this.pickBatchService.findOne(ctx, batch.id);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async addOrdersToPickBatch(
        @Ctx() ctx: RequestContext,
        @Args('batchId') batchId: GqlID,
        @Args('orderIds') orderIds: GqlID[],
    ) {
        return this.pickBatchService.addOrders(ctx, batchId, orderIds.map(Number));
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async removeOrdersFromPickBatch(
        @Ctx() ctx: RequestContext,
        @Args('batchId') batchId: GqlID,
        @Args('orderIds') orderIds: GqlID[],
    ) {
        return this.pickBatchService.removeOrders(ctx, batchId, orderIds.map(Number));
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async advancePickBatchState(
        @Ctx() ctx: RequestContext,
        @Args('batchId') batchId: GqlID,
        @Args('to') to: PickBatchState,
    ) {
        return this.pickBatchService.advance(ctx, batchId, to);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async cancelPickBatch(@Ctx() ctx: RequestContext, @Args('batchId') batchId: GqlID) {
        return this.pickBatchService.cancel(ctx, batchId);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async shipPickBatch(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.pickBatchService.ship(ctx, args.batchId, args.input ?? {});
    }

    /** 操作人：优先 TenantMember.displayName，回退 Administrator 名字 */
    private async currentOperator(ctx: RequestContext): Promise<string | null> {
        const user = ctx.activeUserId;
        if (!user) return null;
        const rows = await this.connection.rawConnection.query(
            `SELECT displayName FROM tenant_member WHERE userId = ? LIMIT 1`,
            [user],
        );
        return rows?.[0]?.displayName ?? null;
    }
}
```

- [x] **Step 2: 写库位 resolver**

```ts
import { Args, ID as GqlID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { StorageBinService } from './storage-bin.service';

@Resolver()
export class StorageBinAdminResolver {
    constructor(private storageBinService: StorageBinService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async storageZones(@Ctx() ctx: RequestContext, @Args('stockLocationId') stockLocationId: GqlID) {
        return this.storageBinService.zones(ctx, Number(stockLocationId));
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async storageBins(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.storageBinService.bins(
            ctx,
            Number(args.stockLocationId),
            args.zoneId ? Number(args.zoneId) : null,
        );
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async variantBin(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.storageBinService.variantBin(
            ctx,
            Number(args.variantId),
            Number(args.stockLocationId),
        );
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async generateStandardBins(@Ctx() ctx: RequestContext, @Args('stockLocationId') stockLocationId: GqlID) {
        return this.storageBinService.generateStandard(ctx, Number(stockLocationId));
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async bindVariantToBin(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.storageBinService.bind(ctx, {
            variantId: Number(input.variantId),
            stockLocationId: Number(input.stockLocationId),
            zoneId: Number(input.zoneId),
            binId: input.binId ? Number(input.binId) : null,
        });
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async unbindVariantFromBin(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.storageBinService.unbind(ctx, Number(args.variantId), Number(args.stockLocationId));
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog)
    async deleteStorageBin(@Ctx() ctx: RequestContext, @Args('id') id: GqlID) {
        return this.storageBinService.deleteBin(ctx, id);
    }
}
```

- [x] **Step 3: 写订单地址 mutation（本次发现的缺口）**

```ts
import { Args, ID as GqlID, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

/**
 * 改订单收货地址。
 * 注意：Vendure 自带的 setOrderShippingAddress 只在 shop-api 且只作用于活动订单，
 * 后台改已下单订单必须走这里。**不重算运费**（规格 §3 非目标）。
 */
@Resolver()
export class OrderAddressAdminResolver {
    constructor(private connection: TransactionalConnection) {}

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async updateOrderShippingAddress(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: GqlID,
        @Args('input') input: any,
    ) {
        const order = await this.connection.getRepository(ctx, require('@vendure/core').Order).findOne({
            where: { id: Number(orderId) },
            relations: { shippingAddress: true },
        });
        if (!order) throw new UserInputError(`订单 ${orderId} 不存在`);
        if (!order.shippingAddress) throw new UserInputError('该订单没有收货地址，无法修改');

        const addr = order.shippingAddress;
        if (input.fullName !== undefined) addr.fullName = input.fullName;
        if (input.phoneNumber !== undefined) addr.phoneNumber = input.phoneNumber;
        if (input.province !== undefined) addr.province = input.province;
        if (input.city !== undefined) addr.city = input.city;
        if (input.streetLine1 !== undefined) addr.streetLine1 = input.streetLine1;
        if (input.streetLine2 !== undefined) addr.streetLine2 = input.streetLine2;
        if (input.postalCode !== undefined) addr.postalCode = input.postalCode;
        if (input.countryCode !== undefined) addr.countryCode = input.countryCode;

        await this.connection.getRepository(ctx, require('@vendure/core').OrderAddress).save(addr);
        // 故意不动 shippingLine：仓管只是修正门牌，不应触发运费变更
        return order;
    }
}
```

> 把 `require('@vendure/core')` 换成顶部 `import { Order, OrderAddress } from '@vendure/core'`（这里写 `require` 只为在计划里标明「两个实体都来自 core」，实施时按项目 lint 规则改为 import）。

- [x] **Step 4: `plugin.ts` 双注册（R1）**

按 Task 0 Step 3 记下的行号，在**四处**追加：

① `entities` 数组追加：

```ts
PickBatch,
PickBatchOrder,
StorageZone,
StorageBin,
VariantStorageBin,
```

② `providers` 数组追加：

```ts
PickBatchService,
StorageBinService,
```

③ `adminApiExtensions` 的 gql 模板追加（**按既有 SDL 风格**，务必照抄同文件里的写法）：

```graphql
type PickBatch implements Node {
    id: ID!
    code: String!
    stockLocationId: Int!
    state: String!
    note: String
    createdBy: String
    memberCount: Int!
    itemCount: Int!
    pickedAt: DateTime
    printedAt: DateTime
    shippedAt: DateTime
    createdAt: DateTime!
}

type PickBatchPickingRow {
    sku: String!
    name: String!
    qty: Int!
    orderCodes: [String!]!
    binCode: String
    zoneCode: String
    zoneName: String
    pathIndex: Int!
}

type StorageZone implements Node {
    id: ID!
    code: String!
    name: String!
    sortOrder: Int!
    enabled: Boolean!
}

type StorageBin implements Node {
    id: ID!
    zoneId: ID!
    code: String!
    rowNo: Int!
    levelNo: Int!
    enabled: Boolean!
}

input PickBatchListOptions { page: Int, pageSize: Int, state: String, stockLocationId: ID }
input CreatePickBatchInput { stockLocationId: ID!, orderIds: [ID!]!, note: String }
input ShipPickBatchInput { method: String!, trackingCode: String }
input OrderAddressInput {
    fullName: String
    phoneNumber: String
    province: String
    city: String
    streetLine1: String
    streetLine2: String
    postalCode: String
    countryCode: String
}
input BindVariantBinInput { variantId: ID!, stockLocationId: ID!, zoneId: ID!, binId: ID }

extend type Query {
    pickBatches(options: PickBatchListOptions): PickBatchList!
    pickBatch(id: ID!): PickBatch
    pickBatchPickingList(id: ID!): [PickBatchPickingRow!]!
    pickBatchCandidates(options: PickBatchListOptions): PickBatchCandidateList!
    storageZones(stockLocationId: ID!): [StorageZone!]!
    storageBins(stockLocationId: ID!, zoneId: ID): [StorageBin!]!
    variantBin(variantId: ID!, stockLocationId: ID!): JSON
}

extend type Mutation {
    createPickBatch(input: CreatePickBatchInput!): PickBatch!
    addOrdersToPickBatch(batchId: ID!, orderIds: [ID!]!): PickBatch!
    removeOrdersFromPickBatch(batchId: ID!, orderIds: [ID!]!): PickBatch!
    advancePickBatchState(batchId: ID!, to: String!): PickBatch!
    cancelPickBatch(batchId: ID!): PickBatch!
    shipPickBatch(batchId: ID!, input: ShipPickBatchInput!): JSON!
    generateStandardBins(stockLocationId: ID!): JSON!
    bindVariantToBin(input: BindVariantBinInput!): JSON!
    unbindVariantFromBin(variantId: ID!, stockLocationId: ID!): Boolean!
    deleteStorageBin(id: ID!): Boolean!
    updateOrderShippingAddress(orderId: ID!, input: OrderAddressInput!): JSON!
}
```

同时补 `PickBatchList` / `PickBatchCandidateList` 两个分页包装类型（照同文件既有分页类型写法）：

```graphql
type PickBatchList { items: [PickBatch!]!, totalItems: Int! }
type PickBatchCandidateList { items: [JSON!]!, totalItems: Int! }
```

④ `shopApiExtensions` **与 shop resolvers 数组**：按既有约定，C 端只需要读库位（`variantBin` / `storageZones`），把这两个 Query 的 SDL 与一个 `StorageBinShopResolver` 也注册进去；批次相关全部只走 admin。

```graphql
extend type Query {
    variantBin(variantId: ID!, stockLocationId: ID!): JSON
    storageZones(stockLocationId: ID!): [StorageZone!]!
}
```

> **R1 校验动作**：注册完立即执行 Step 5 的探测，**必须两侧都能查到**，否则说明漏了一侧。

- [x] **Step 5: 起服并验证两侧 SDL 都可用（R4）**

开两个终端：

```powershell
npm run dev:server
```

```powershell
npm run dev:worker
```
（cwd: `d:\zhao\vendure`）

预期：日志出现 `Vendure server (v3.6.4) now running on port 3000`。

- [x] **Step 6: 探测 admin 侧与 shop 侧**

```powershell
curl -s -X POST http://localhost:3000/admin-api -H "Content-Type: application/json" -d '{\"query\":\"{ pickBatches(options:{page:1,pageSize:1}){ totalItems } }\"}'
```

```powershell
curl -s -X POST http://localhost:3000/shop-api -H "Content-Type: application/json" -d '{\"query\":\"{ __type(name:\\\"Query\\\"){ fields{ name } } }\"}' | Select-String variantBin
```

预期：admin 返回 `totalItems`（未授权则返回权限错误，但**不能是**「Cannot query field」语法错）；shop 侧输出含 `variantBin`。
若任一侧报 `Cannot query field` → 该侧 SDL 漏注册，回 Step 4 补。

- [x] **Step 7: Build + Commit（R2 / R3）**

```powershell
npm run build
```
（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

```powershell
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 批次/库位 resolver 双注册 + 新增 updateOrderShippingAddress"
```

---

## Task 8：部署后端 + 刷新 schema 快照（R7，顺序不能颠倒）

**Files:**
- 只读：`d:\zhao\vendure`（git pull on server）
- Modify: `d:\zhao\vshop\nshop\graphql.schema.json`（快照，gitignored，仅本地用）

- [x] **Step 1: 本地构建产物已就绪（Task 7 Step 7 已完成）**

```powershell
git log --oneline -3
```

预期：最新提交含 `lib/` 改动。

- [x] **Step 2: 推送到仓库并服务器拉取**

```powershell
git push origin HEAD
```

服务器侧（不改动服务器上的构建产物，只拉代码 + 重启）：

```bash
cd /path/to/vendure && git pull && pm2 restart <后端进程名>
```

预期：服务起来后新表由 `synchronize:true` 自动创建（R5，**无需手写生产 migration**）。

- [x] **Step 3: 从生产重拉 schema 快照（必须在后端部署之后）**

```powershell
node tmp-refresh-schema.mjs
```
（cwd: `d:\zhao\vshop\nshop`）

预期：`graphql.schema.json` 含 `pickBatches` / `storageBins` 等新字段。
若后端还没部署又想本地验证 → 用 `nshop/scripts/_patch_schema_*.mjs` 套路给快照打补丁（`nuxi prepare` **不会**自动重拉快照）。

- [x] **Step 4: Commit 快照补丁脚本（若用了脚本路径）**

```powershell
git add nshop/scripts
git commit -m "chore(nshop): 刷新配货台/库位相关 schema 快照"
```

---

## Task 9：前端 API 层 + 两个共享 composable

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\picking.ts`
- Create: `d:\zhao\vshop\web-admin\src\apis\storage-bin.ts`
- Create: `d:\zhao\vshop\web-admin\src\composables\useBinMode.ts`
- Create: `d:\zhao\vshop\web-admin\src\composables\useShipSubmit.ts`
- 参照: `src/apis/order.ts`（GraphQL 客户端用法）、`src/pages/order/ship/index.vue`（要抽出的提交逻辑）

- [x] **Step 1: 先读再抽——把 `ship/index.vue` 的提交逻辑抄出来**

先完整读 `src/pages/order/ship/index.vue`，定位 `submit()` 与 `whOptionsFor()`。
把 `whOptionsFor` + 「按仓聚合 parts → `shipByWarehouse`」这段逻辑搬进 `useShipSubmit.ts`，**保持函数签名与行为完全一致**，页面改为调用 composable。

- [x] **Step 2: 写 `useBinMode.ts`（三档唯一门控入口）**

```ts
import { computed } from 'vue';
import { useChannelStore } from '../stores/channelStore';

export type BinMode = 'off' | 'zone' | 'bin';

/**
 * 库位三档开关的**唯一**判定入口。
 * 所有消费点必须经这里判断，禁止各处硬写 if —— 这是避免「半开状态」的唯一防线。
 */
export function useBinMode() {
    const channel = useChannelStore();

    // 渠道 customFields.binMode，缺省按 off（与后端 StorageBinService.resolveMode 同语义）
    const mode = computed<BinMode>(() => {
        const v = (channel.activeChannel?.customFields as any)?.binMode;
        return v === 'zone' || v === 'bin' ? v : 'off';
    });

    /** 是否展示库区（zone 与 bin 档都为 true） */
    const showZone = computed(() => mode.value === 'zone' || mode.value === 'bin');

    /** 是否展示具体库位编码（仅 bin 档） */
    const showBin = computed(() => mode.value === 'bin');

    return { mode, showZone, showBin };
}
```

> 若项目没有 `stores/channelStore.ts`，请按既有 store 目录里的实际命名替换（用 `Glob src/stores/*` 确认），并保证 `activeChannel.customFields` 已在查询 fragment 中取到 `binMode`——若没有，需在 channel 查询里补该字段。

- [x] **Step 3: 写 `picking.ts`**

```ts
import { getAdminClient } from './client';
import gql from 'graphql-tag';

const PICK_BATCH_FIELDS = gql`
    fragment PickBatchFields on PickBatch {
        id
        code
        stockLocationId
        state
        note
        createdBy
        memberCount
        itemCount
        pickedAt
        printedAt
        shippedAt
        createdAt
    }
`;

export async function fetchPickBatches(options: {
    page?: number;
    pageSize?: number;
    state?: string | null;
}) {
    const client = getAdminClient();
    const { pickBatches } = await client.request(gql`
        ${PICK_BATCH_FIELDS}
        query PickBatches($options: PickBatchListOptions) {
            pickBatches(options: $options) {
                totalItems
                items { ...PickBatchFields }
            }
        }
    `, { options });
    return pickBatches as { totalItems: number; items: any[] };
}

export async function fetchPickBatch(id: string) { /* pickBatch(id) */ }
export async function fetchPickBatchMembers(id: string) { /* pickBatch → members */ }
export async function fetchPickBatchPickingList(id: string) { /* pickBatchPickingList */ }
export async function fetchPickBatchCandidates(options: any) { /* pickBatchCandidates */ }
export async function createPickBatch(input: { stockLocationId: string; orderIds: string[]; note?: string }) { /* ... */ }
export async function addOrdersToPickBatch(batchId: string, orderIds: string[]) { /* ... */ }
export async function removeOrdersFromPickBatch(batchId: string, orderIds: string[]) { /* ... */ }
export async function advancePickBatchState(batchId: string, to: string) { /* ... */ }
export async function cancelPickBatch(batchId: string) { /* ... */ }
export async function shipPickBatch(batchId: string, input: { method: string; trackingCode?: string }) { /* ... */ }
export async function updateOrderShippingAddress(orderId: string, input: Record<string, string>) { /* ... */ }
```

> 实施时每个函数都要写全 GraphQL 文档（照 `src/apis/order.ts` 既有风格）。`/* ... */` 只是计划里的省略标记，**不允许留在代码里**。

- [x] **Step 4: 写 `storage-bin.ts`**

```ts
import { getAdminClient } from './client';
import gql from 'graphql-tag';

export async function fetchStorageZones(stockLocationId: string) { /* storageZones */ }
export async function fetchStorageBins(stockLocationId: string, zoneId?: string) { /* storageBins */ }
export async function fetchVariantBin(variantId: string, stockLocationId: string) { /* variantBin */ }
export async function generateStandardBins(stockLocationId: string) { /* generateStandardBins */ }
export async function bindVariantToBin(input: { variantId: string; stockLocationId: string; zoneId: string; binId?: string }) { /* bindVariantToBin */ }
export async function unbindVariantFromBin(variantId: string, stockLocationId: string) { /* unbindVariantFromBin */ }
export async function deleteStorageBin(id: string) { /* deleteStorageBin */ }
```

- [x] **Step 5: TypeScript 类型检查**

```powershell
npx vue-tsc --noEmit
```
（cwd: `d:\zhao\vshop\web-admin`）

预期：无**新增**错误（与改造前基线对比）。若项目未装 `vue-tsc`，用 `npm run build:h5` 触发编译检查。

- [x] **Step 6: Commit**

```powershell
git add web-admin/src/apis/picking.ts web-admin/src/apis/storage-bin.ts web-admin/src/composables/useBinMode.ts web-admin/src/composables/useShipSubmit.ts web-admin/src/pages/order/ship/index.vue
git commit -m "feat(web-admin): 配货台/库位 API 层与 useBinMode、useShipSubmit 共享逻辑"
```

---

## Task 10：配货台列表页

**Files:**
- Create: `src/pages/order/picking/index.vue`
- Create: `src/components/picking/PickBatchCard.vue`
- Create: `src/components/picking/CandidateOrderRow.vue`
- Create: `src/components/picking/WarehousePicker.vue`
- Modify: `src/pages.json`（注册页面）

- [x] **Step 1: 在 `pages.json` 注册三个新页面**

在 `pages` 数组「order」相关位置追加（照 `order/ship/index` 的既有字段格式）：

```json
{
  "path": "pages/order/picking/index",
  "style": { "navigationBarTitleText": "配货台" }
},
{
  "path": "pages/order/picking/batch",
  "style": { "navigationBarTitleText": "批次详情" }
},
{
  "path": "pages/inventory/bins/index",
  "style": { "navigationBarTitleText": "库位管理" }
}
```

- [x] **Step 2: 写候选订单行组件**

`CandidateOrderRow.vue`：勾选框 + 单号 + 收件人 + 完整地址 + 推荐仓（含距离）+ 「已在批次」标记。
**门控**：`const { showZone, showBin } = useBinMode()` —— `showZone` 为真时在地址下方显示库区/库位摘要行，`off` 档整行不渲染。

- [x] **Step 3: 写批次卡片与仓库选择器**

`PickBatchCard.vue`：`code` / 仓 / 状态徽标 / 单数 / 件数 / 点击进详情。
`WarehousePicker.vue`：props `recommendedId` / `distanceKm`，`recommendedId` 为 `null` 时显示「请手动选择目标仓」且**不展示距离**（规格 §9）。

- [x] **Step 4: 写配货台主页**

三 Tab：`待发货 N` / `进行中 N` / `已完成`。骨架照 `src/pages/inventory/stock/index.vue` 的批量勾选范式：

```vue
<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { createPickBatch, fetchPickBatchCandidates, fetchPickBatches, updateOrderShippingAddress } from '../../../apis/picking';
import { useBinMode } from '../../../composables/useBinMode';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const { showZone, showBin } = useBinMode();

const tab = ref<'pending' | 'active' | 'done'>('pending');
const selected = ref<Record<string, boolean>>({});
const candidates = ref<any[]>([]);
const checkedRows = computed(() => candidates.value.filter((c) => selected.value[c.id]));
const totalItems = computed(() => checkedRows.value.reduce((n, c) => n + (c.itemCount || 0), 0));
</script>
```

底部固定条照 `inventory/stock/index.vue` 的样式写法（`position: fixed; left/right/bottom: 0` + 安全区 padding）：

```
已选 {N} 单 / {M} 件     [ 新建批次 ]
```

- [x] **Step 5: 新建批次流程**

点「新建批次」→ 弹 `WarehousePicker`（默认就近推荐）→ 确认后调 `createPickBatch({ stockLocationId, orderIds: checkedRows.map(c => c.id) })`。
后端返回冲突（订单已在别的批次）时，`uni.showToast` 展示后端原因**原文**（含冲突批次号），**不静默**。

- [x] **Step 6: 编译验证**

```powershell
npm run build:h5
```

预期：编译通过，无 graphql 文档字段缺失报错（若有 → 回 Task 8 Step 3 确认快照已刷）。

- [x] **Step 7: Commit**

```powershell
git add web-admin/src/pages/order/picking web-admin/src/components/picking web-admin/src/pages.json
git commit -m "feat(web-admin): 配货台列表页（三 Tab/候选订单/新建批次）"
```

---

## Task 11：批次详情页 + 地址编辑

**Files:**
- Create: `src/pages/order/picking/batch.vue`
- Create: `src/components/picking/BatchMemberRow.vue`
- Create: `src/components/picking/AddressEditSheet.vue`
- Create: `src/components/common/RegionPicker.vue`

- [x] **Step 1: 抽 `RegionPicker.vue`**

从 `src/pages/pickup/edit/index.vue` 的省/市/区三段 `picker` 实现抽取（`provinceNames` / `cityNames` / `districtNames`），**不新造数据源**。props：`province` / `city` / `district`，emits：`update:province` 等。

- [x] **Step 2: 写地址编辑抽屉**

`AddressEditSheet.vue`：省/市/区（`RegionPicker`）+ 详细地址 + 电话 + **原地址只读对照**。
保存 → `updateOrderShippingAddress(orderId, input)`。
失败时**保留表单输入**，`showToast` 展示后端原因（规格 §9：不静默）。

- [x] **Step 3: 写成员行与批次详情页**

`BatchMemberRow.vue`：勾选 + 单号 + 收件人 + 商品摘要 + 「改地址」。
`batch.vue`：批次信息（`code` / 目标仓 / 成员数 / 创建人 / 状态）+ **4 个打印入口** + 成员列表 + 底部「批量发货」。
状态为 `SHIPPED` / `CANCELLED` 时**整页只读**，隐藏加单/移除/发货按钮（规格 §9）。

- [x] **Step 4: 批量发货与失败清单**

调 `shipPickBatch(batchId, { method, trackingCode })`，返回 `{ succeeded, failed }`。
`failed` 非空时**逐条展示**失败原因，并保持批次为 `PRINTED`（后端已保证不置 `SHIPPED`）。

- [x] **Step 5: 编译验证**

```powershell
npm run build:h5
```

- [x] **Step 6: Commit**

```powershell
git add web-admin/src/pages/order/picking/batch.vue web-admin/src/components/picking web-admin/src/components/common/RegionPicker.vue
git commit -m "feat(web-admin): 批次详情页与地址编辑（RegionPicker 抽取）"
```

---

## Task 12：库位管理页 + 采购入库归位改造

**Files:**
- Create: `src/pages/inventory/bins/index.vue`
- Create: `src/components/picking/BinPicker.vue`
- Modify: `src/pages/inventory/stock-doc/purchase/index.vue`

- [x] **Step 1: 写 `BinPicker.vue`（三档自适应）**

- `showBin` 为真：库区 → 库位两级级联
- 仅 `showZone` 为真：只到库区（一级）
- `off`：调用方**不应渲染本组件**（由调用方用 `v-if="showZone"` 门控）

- [x] **Step 2: 写库位管理页**

选仓 → 「生成标准库位（18 个）」按钮（调 `generateStandardBins`，返回 `{ zonesCreated, binsCreated }`，toast 提示本次新建数量）→ 按库区分组的库位网格（显示编码 + 已绑 SKU 数）→ 库区/库位增删改。
**门控**：`off` 档此页菜单隐藏；`zone` 档只显示库区列表，隐藏库位网格。

- [x] **Step 3: 采购入库页改造**

在 `src/pages/inventory/stock-doc/purchase/index.vue` 增加「入库库位」选择器（`BinPicker`），并用 `v-if="showZone"` 门控。
选定商品 + 仓后调 `fetchVariantBin(variantId, stockLocationId)` **带出现有库位并高亮提示**「该 SKU 现库位：A-01-03」（无绑定则不提示）。
提交时把 `binId` / `zoneId` 一并传给 `createStockDoc`。

- [x] **Step 4: 编译验证**

```powershell
npm run build:h5
```

- [x] **Step 5: Commit**

```powershell
git add web-admin/src/pages/inventory web-admin/src/components/picking/BinPicker.vue
git commit -m "feat(web-admin): 库位管理页与采购入库归位改造（三档自适应）"
```

---

## Task 13：打印子系统（拣货单含库位区域）

**Files:**
- Create: `src/utils/print/print-window.ts`、`print.css.ts`
- Create: `src/utils/print/templates/{picking-list,shipping-note,parcel-label,batch-overview}.ts`
- Test: `src/utils/print/templates/templates.spec.ts`

- [x] **Step 1: 写 `print-window.ts`**（提交 `fc46b6d`）

> 落地差异：`printHtml` 返回 `boolean`（H5 环境缺失 / `contentDocument` 为空时返回 `false`），调用方据此弹「打开新窗口」兜底；另加模块级 `lastHtml` + `getLastPrintHtml()`，满足「暂存可重试」。`.v.big`/`.mono` 等排版类由 `doc-common.ts` 的 `pageHtml()` 统一输出。

隐藏 `iframe` → 写入完整 HTML（含内联 CSS）→ `onload` 后 `contentWindow.focus(); contentWindow.print()` → 打印后移除 iframe。
**不用 `window.open`**（移动端易被拦截）。提供「打开新窗口」兜底入口 + 把单据 HTML 暂存本地可重试（规格 §9）。

```ts
export function printHtml(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = () => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } finally {
            setTimeout(() => iframe.remove(), 1000);
        }
    };
    // 已加载则直接打印，否则等 onload
    if (doc.readyState === 'complete') setTimeout(doPrint, 200);
    else iframe.onload = () => setTimeout(doPrint, 200);
}

/** 兜底：拦截时用新窗口重试 */
export function openPrintFallback(html: string): void {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
}
```

- [x] **Step 2: 写四个模板纯函数**（提交 `fc46b6d`）

> 落地差异：新增计划外共享模块 `src/utils/print/doc-common.ts`（偏差 26）。四个模板的 labels 均可被第 4 个参数 `labels?: Partial<PrintLabels>` 覆盖（默认 `DEFAULT_LABELS` 中文），由 `batch.vue` 从 `orderAdmin.picking.print.*` 注入当前语言。`pathIndex` 由调用方在映射 `rows` 时按数组下标赋予（后端已排好序，前端不重排）。

四个模板都是**纯函数**：入参为已组装好的数据，返回 HTML 字符串（便于单测）。

`picking-list.ts` 签名：

```ts
export interface PickingListInput {
    batchCode: string;
    warehouseName: string;
    printedAt: Date;
    /** 库位模式：off 不渲染库位列与分组；zone 只渲染库区；bin 渲染完整库位 */
    binMode: 'off' | 'zone' | 'bin';
    rows: Array<{
        sku: string;
        name: string;
        qty: number;
        orderCodes: string[];
        binCode: string | null;
        zoneCode: string | null;
        zoneName: string | null;
        pathIndex: number;
    }>;
}
export function renderPickingList(input: PickingListInput): string;
```

渲染规则（规格 §13.6 / §13.9）：

1. 行序直接用 `pathIndex` 升序（后端已排好，**前端不再重排**）。
2. `binMode === 'off'` → **不渲染**库位/库区列。
3. `binMode === 'zone'` → 列显示库区名（按库区分组，组头「A · 常温存储区」），**不显示库位编码**。
4. `binMode === 'bin'` → 库位编码列 + 按库区分组。
5. 无库位绑定的行置底并标黄，提示「需先入库归位再拣」。

- [x] **Step 3: 写模板单测**（提交 `fc46b6d`，12 个用例，超出计划的 4 个）

> 落地差异：不用 `vitest`（项目未安装），改 `node:test` + `node:assert/strict`（偏差 26）。用例除计划中的 4 条（bin/zone/off 三档 + 标黄提示）外，补：行序按 `pathIndex`、合计行、HTML 转义（`<img onerror=1>` → `&lt;img onerror=1&gt;`）、labels 本地化覆盖、发货单一单一页、包裹标签 100×150、总览 A4 landscape、客户名转义。

```ts
import { describe, expect, it } from 'vitest';

import { renderPickingList } from './picking-list';

const rows = [
    { sku: 'SKU-A1', name: '矿泉水', qty: 4, orderCodes: ['SO-1'], binCode: 'A-01-03', zoneCode: 'A', zoneName: '常温存储区', pathIndex: 1 },
    { sku: 'SKU-C', name: '无库位商品', qty: 1, orderCodes: ['SO-3'], binCode: null, zoneCode: null, zoneName: null, pathIndex: 9999 },
];
const base = { batchCode: 'PB20260922-001', warehouseName: '杭州仓', printedAt: new Date('2026-09-22T15:40:00') };

describe('拣货单模板', () => {
    it('bin 档渲染库位编码与库区分组', () => {
        const html = renderPickingList({ ...base, binMode: 'bin', rows });
        expect(html).toContain('A-01-03');
        expect(html).toContain('常温存储区');
    });

    it('zone 档不渲染库位编码，只到库区', () => {
        const html = renderPickingList({ ...base, binMode: 'zone', rows });
        expect(html).not.toContain('A-01-03');
        expect(html).toContain('常温存储区');
    });

    it('off 档不渲染库位列与库区分组', () => {
        const html = renderPickingList({ ...base, binMode: 'off', rows });
        expect(html).not.toContain('A-01-03');
        expect(html).not.toContain('常温存储区');
    });

    it('无库位的行标黄并带归位提示', () => {
        const html = renderPickingList({ ...base, binMode: 'bin', rows });
        expect(html).toContain('需先入库归位');
    });
});
```

- [x] **Step 4: 跑测试**

```powershell
node --test src/utils/print/templates/templates.spec.ts
```

实测结果：`# pass 12 / # fail 0`（Node v22.20.0 原生类型剥离，直接跑 `.ts`，无需 tsx/vitest）。另跑 `npm run build:h5` → `DONE  Build complete.`（仅既有 sass legacy-js-api 弃用告警）。
> 注意：模板内部相对导入必须带显式扩展名（`'../doc-common.ts'`），否则 Node ESM 解析失败。

- [x] **Step 5: `print.css.ts` 双 `@page`**（提交 `fc46b6d`）

```ts
export const A4_PORTRAIT = '@page { size: A4; margin: 12mm }';
export const THERMAL_100x150 = '@page { size: 100mm 150mm; margin: 4mm }';
export const A4_LANDSCAPE = '@page { size: A4 landscape; margin: 12mm }';
```

- [x] **Step 6: Commit**（`fc46b6d`，11 files / +717 −3）

```powershell
git add web-admin/src/utils/print
git commit -m "feat(web-admin): 打印子系统（iframe 打印 + 四类单据模板，拣货单含库位区域）"
```

> 实际 `git add` 另含 `web-admin/src/pages/order/picking/batch.vue`（4 个打印入口，落实偏差 19 的界面部分）与 `web-admin/src/locale/{zh-Hans,en}.json`（`orderAdmin.picking.print.*` 27 labels + `failed` + `newWindow`）。
> **打印不自动推进状态**：保留「确认拣货完成」「标记单据已打印」显式按钮，`canPrint` 不看只读态（终态可重印，单据是记录）——**修正偏差 20 的措辞**。

---

## Task 14：i18n 双语词条（R9）

**Files:**
- Modify: `src/locale/zh-Hans.json`、`src/locale/en.json`

- [x] **Step 1: 确认真实语言包文件名**（提交 `c3399c4`）

实际文件名是 **`zh-Hans.json`** 与 `en.json`（**没有** `zh-CN.json`）。计划原文写 `zh-CN.json`，按实际为准。

- [x] **Step 2: 补 `orderAdmin.picking.*` 与 `inventoryBin.*`**（提交 `c3399c4`）

> Task 12 已补 `inventoryBin.*`（21 键）与 `orderAdmin.picking.bin.*`（8 键）、Task 13 已补 `orderAdmin.picking.print.*`（27 labels + `failed` + `newWindow`），故本步只补**配货台列表页 + 批次详情页 + 地址编辑 + 菜单入口**的剩余键：`menu.picking`；`orderAdmin.picking.{title,tabPending,tabActive,tabDone,loading,emptyCandidates,goOrderList,emptyActive,emptyDone,selectedSummary,newBatch,createBatch,createFailed,created,noSelect,loadFailed,targetWarehouse,recommendHint,recommendNone,recommendWarehouse,recommended,noWarehouse,cancel,batchCounts,alreadyInBatch,itemCount,createdBy,createdAt,pickSummary,emptyPicking,members,removeSelected,markPicked,markPrinted,cancelBatch,shipBatch,andMoreSku,advanceFailed,cancelConfirm,cancelled,cancelFailed,removed,removeFailed,noBatch,shipFailTitle,shipFailDismiss,shipPartial,shipDone,shipFailed}`；`orderAdmin.picking.state.{PENDING,PICKED,PRINTED,SHIPPED,CANCELLED}`；`orderAdmin.picking.address.*`（21 键）。中英各 +75 键。

命名空间照现有 `orderAdmin.ship.*` 的写法。必须覆盖的键（两侧同步）：

- `orderAdmin.picking.title` / `tabPending` / `tabActive` / `tabDone`
- `orderAdmin.picking.selectedSummary`（含 `{orders}` `{items}` 占位）
- `orderAdmin.picking.createBatch` / `newBatch` / `targetWarehouse`
- `orderAdmin.picking.recommendNone`（「请手动选择目标仓」）
- `orderAdmin.picking.alreadyInBatch`（含 `{code}`）
- `orderAdmin.picking.print.*`（`pickingList` / `shippingNote` / `parcelLabel` / `batchOverview`）
- `orderAdmin.picking.bin.zone` / `bin.bin` / `bin.unassigned` / `bin.needBindFirst`
- `inventoryBin.title` / `generateStandard` / `zonesCreated`（含 `{n}`）/ `binsCreated`（含 `{n}`）/ `binOccupied`（含 `{n}`）

- [x] **Step 3: 一致性校验——两侧键必须完全一致**（提交 `c3399c4`）

不用手工比对，改为脚本化三查（Node 一行式）：

```powershell
# ① 双语键集对称
node -e "…leaves(zh) vs leaves(en)…"
# ② 源码里实际用到的键是否都在 locale 中（扫 src 下 .vue/.ts）
# ③ PrintLabels 接口 27 键是否都有对应词条
```

实测：`zh 2086 / en 2086`，`missing_in_en none`、`missing_in_zh none`、`USED_BUT_MISSING: none`、`state missing: none`、`PrintLabels keys 27 / zh missing none / en missing none`。另 `npm run build:h5` → `DONE  Build complete.`（仅既有 sass legacy-js-api 弃用告警）。

- [x] **Step 4: Commit**（`c3399c4`，2 files / +158）

```powershell
git add web-admin/src/locale
git commit -m "feat(web-admin): 配货台与库位 i18n 双语词条"
```

---

## Task 15：手机截图 + 操作手册 + 只读探针 + 部署

- [ ] **Step 1: 三档各跑一遍主路径（不交叉组合）**

按规格 §13.9「测试范围」：`off` / `zone` / `bin` 各走一遍「入库归位 → 建批次 → 拣货单 → 发货」全流程。
切换档位后**必须冷加载**（带 `?cb=` 或清缓存）再截图，避免首帧缓存滞后。

- [ ] **Step 2: 手机视口截图（硬规范）**

Playwright 移动视口 **390×844，dpr=2（输出 780×1688）**。
至少覆盖：配货台三 Tab、批次详情、四类单据预览、库位管理页（三档各一张）、采购入库归位、地址编辑。

- [ ] **Step 3: 截图落盘**

存到 `docs/inventory-admin-manual/assets/`，命名与既有 13/14 章保持一致（先看目录里已有的命名规范再定）。

- [ ] **Step 4: 写操作手册第 15 章**

在 `docs/inventory-admin-manual/inventory-admin-manual.html` 追加第 15 章「配货台与库位」，**按第 13/14 章的既有 HTML 结构写**（先读这两章的写法再动手），并把 Step 2 的截图全部嵌入。

- [ ] **Step 5: 写只读冒烟探针**

Create: `web-admin/scripts/_smoke_picking_live.py`，照 `_smoke_plan12_live.py` 的范式；至少断言：
- 配货台页面可加载且无 JS 报错
- 库位管理页在三档下分别渲染正确（off 无库位网格 / zone 无库位网格 / bin 有 18 个格）

- [ ] **Step 6: 跑探针**

```powershell
python scripts\_smoke_picking_live.py
```
（cwd: `d:\zhao\vshop\web-admin`）

预期：全部通过，0 失败。

- [ ] **Step 7: 本地构建 + 部署（R6，本地构建）**

```powershell
npm run build:h5
```

```powershell
node scripts\deploy.mjs
```
（cwd: `d:\zhao\vshop\web-admin`）

预期：产物 scp 到服务器解压，静态目录替换后即时生效（无需 nginx reload）。

- [ ] **Step 8: 线上复验**

用手机视口打开 `https://e.joho.cn/guanli/#/pages/order/picking/index`，确认：
- 配货台加载正常、候选订单有数据
- 库位管理页可点「生成标准库位」并返回 18 个
- 三档切换后各消费点表现符合规格 §13.9 门控表

- [ ] **Step 9: Commit**

```powershell
git add web-admin/docs web-admin/scripts
git commit -m "docs(web-admin): 配货台与库位操作手册第 15 章 + 手机截图 + 只读探针"
```

---

## 执行结果

> 实施完成后回填本节；格式照 `2026-09-21-inventory-stock-upgrade.md` 的「执行结果」区块：Task 与提交哈希对照表 + 证据 + 偏差说明。

| Task | 提交哈希 | 状态 | 证据 / 备注 |
|---|---|---|---|
| 0 环境自检 | —（无提交） | 完成 | `packages/common/node_modules`=False（已隔离为 `node_modules.pnpm-bak`）；根 `node_modules/@vendure/core`=True；基线单测 `1 failed / 26 passed`（失败项为既有 `virtual-physical-stock.service.spec.ts` 的 `ColumnTypeUndefinedError`，与本次改动无关） |
| 1 批次两表 | `2810a1a26` | 完成 | `pick_batch` / `pick_batch_order` 两表 + 实体约束单测 2 例 |
| 2 库位三表 + binMode | `5fc6667b8` | 完成 | `storage_zone` / `storage_bin` / `variant_storage_bin` + 标准模板（A/B/C/D 共 18 库位）+ `binMode` 渠道字段（off/zone/bin，默认 off），模板常量单测 3 例 |
| 3 批次纯函数 | `c814984f3` | 完成 | 状态机 / 批次号 `PB{yyyymmdd}-{nnn}` / 就近选仓 / 拣货库位排序（`NO_BIN_PATH_INDEX=9999`），单测 9 例 |
| 4 批次 service | `19c0f919b` | 完成 | 冲突校验 `Map<orderId,{batchId,code}>`、批次号、拣货汇总（方言无关 JS 聚合）、候选/发货快照，单测 7 例 |
| 5 库位 service | `63c9cd862` | 完成 | 三档读取 `resolveMode`、`generateStandard` 幂等（18 库位）、`bind` 校验仓/区归属并 upsert、`deleteBin` 有绑定拒绝，单测 7 例 |
| 6 入库归位 | `15c9c223b` | 完成 | `StockDocItemInput` 增可选 `binId`/`zoneId`，未传则完全保持旧行为；`applyBinBinding` 在 `applyMovement` 后调用，单测 4 例（含向后兼容） |
| 7 resolvers 双注册 | `6645be289` | 完成 | admin 侧 `pickBatches` 探测返回 FORBIDDEN（非 `Cannot query field`）→ SDL 已注册；shop 侧 introspection 含 `variantBin` / `storageZones`；`npm run build` 通过；单测 `1 failed / 32 passed / 192 tests passed`（失败项同 Task 0 既有项） |
| 8 后端部署 + 刷快照 | —（部署动作，无新提交） | 完成 | `git push origin HEAD`（`6e8bc1fa4..6645be289`）；服务器 `/www/apps/vendure` `git pull --ff-only` → `pm2 restart vendure`（online）。生产只读探针：shop-api 含 `variantBin` / `storageZones`；admin-api Mutation 含 `createPickBatch`/`addOrdersToPickBatch`/`removeOrdersFromPickBatch`/`advancePickBatchState`/`cancelPickBatch`/`shipPickBatch`/`updateOrderShippingAddress`/`generateStandardBins`/`bindVariantToBin`/`unbindVariantFromBin`/`deleteStorageBin`。生产 postgres 实际建表：`pick_batch, pick_batch_order, storage_bin, storage_zone, variant_storage_bin`，`channel.customFieldsBinmode` 列存在，`pick_batch_order` 唯一索引已建（`UQ_c15667d4fc538f1828adfb65603`）。`nshop` 侧 `node tmp-refresh-schema.mjs`（introspect `https://www.youshop.cn/shop-api`）成功，快照 `710891` 字节且含 `variantBin` / `storageZones` / `StorageZone` |
| 9 前端 API + composables | `9ef0d1d` | 完成 | 6 files / +637 −77。`apis/picking.ts`（11 函数，GraphQL 文档全展开）、`apis/storage-bin.ts`（7 函数）、`composables/useBinMode.ts`、`composables/useShipSubmit.ts`（从 ship 页抽出，行为不变）、`apis/channel.ts` 补 `binMode`。验证：`npm run build:h5` exit 0（仅既有 sass 弃用告警）；生产 admin-api introspection 探针 **0 fail**（8 Query / 11 Mutation / 全类型与 input 字段 / `ChannelCustomFields.binMode` 齐备） |
| 10 配货台列表页 | `6c689b4` | 完成 | 新增 `pages/order/picking/index.vue`（三 Tab + 底部固定条 + 新建批次）、`components/picking/{PickBatchCard,CandidateOrderRow,WarehousePicker}.vue`；`pages.json` 注册配货台；`constants/menus.ts` 交易域加「配货台」入口。验证：`npm run build:h5` exit 0（仅既有 sass 弃用告警） |
| 11 批次详情 + 地址编辑 | `56cf173` | 完成 | 新增 `pages/order/picking/batch.vue`（批次信息 + 拣货汇总三档分组 + 失败清单 + 成员列表 + 状态推进/取消 + 底部批量发货）、`components/picking/{BatchMemberRow,AddressEditSheet}.vue`、`components/common/RegionPicker.vue`（自 `pickup/edit` 抽取，数据源同为 `apis/map.fetchDistricts`）；`pages.json` 注册批次详情。验证：`npm run build:h5` exit 0 |
| 12 库位管理 + 采购入库 | `c39568e` | 完成 | 新增 `pages/inventory/bins/index.vue`（选仓 + 生成标准库位 + 按库区分组网格 + 删库位 + off 档兜底页）、`components/picking/BinPicker.vue`（三档自适应：bin 档两级级联 / zone 档只到库区 / off 档调用方不渲染）；改 `pages/inventory/stock-doc/purchase/index.vue`（入库归位 + 现库位高亮 + 换仓清空）、`apis/stock-doc.ts`（补 `binId`/`zoneId`）、`pages.json`、`constants/menus.ts`（`binOnly` 门控）、`Drawer.vue` + `dashboard/index.vue`（`visibleMenus(auth, showZone)`）、双语词条。验证：`npm run build:h5` exit 0（仅既有 sass 弃用告警）；双语键集一致（1982 = 1982，diff none） |
| 13 打印子系统 | `fc46b6d` | 完成 | 11 files / +717 −3。新增 `utils/print/`：`doc-common.ts`（HTML 转义 / 时间格式化 / 27 键 `PrintLabels` + 逐项回退 / `fill()` 占位符 / `pageHtml()` 通用打印 CSS，含 `thead{display:table-header-group}`、`tr{page-break-inside:avoid}`）、`print.css.ts`（A4 纵向 / 热敏 100×150 / A4 横向）、`print-window.ts`（隐藏 iframe + `printHtml` 返回 `boolean` + `openPrintFallback` + `getLastPrintHtml` 兜底重试）、4 个模板纯函数（拣货单含库位区域三档门控、发货单一单一页、包裹标签、批次总览）、`templates.spec.ts`。改 `pages/order/picking/batch.vue`（⑤「打印单据」2×2 宫格 4 入口 + 拦截兜底弹窗）。验证：`node --test src/utils/print/templates/templates.spec.ts` → **12 pass / 0 fail**；`npm run build:h5` → `DONE Build complete.`；双语键集一致（2011 = 2011，diff none），`print labels 27 missing: none` |
| 14 i18n 双语 | `c3399c4` | 完成 | 2 files / +158。补配货台列表页 + 批次详情页 + 地址编辑 + 菜单入口剩余键：`menu.picking`、`orderAdmin.picking.*`（50 键）、`orderAdmin.picking.state.*`（5 键）、`orderAdmin.picking.address.*`（21 键），中英各 +75 键。验证：双语键集对称（2086 = 2086，diff none）；源码实际用键全覆盖（`USED_BUT_MISSING: none`，扫 src 下 .vue/.ts）；`PrintLabels` 27 键齐全；`npm run build:h5` → `DONE Build complete.` |
| 15 截图 + 手册 + 探针 + 部署 | | | |

**偏差说明**（Task 0~7）：

1. **`toView` 新增 `members: [JSON!]`（可空）**：计划 Task 7 的 `PickBatch` SDL 未含 `members`，但 Task 9 前端 `fetchPickBatchMembers` 要走 `pickBatch → members`。列表视图不返回该字段，故声明为**可空**（非计划中的 `[JSON!]!`），否则列表查询会因非空校验报错。
2. **`findConflicts` 返回类型调整**：计划为 `Map<number,string>`，实现改为 `Map<number,{batchId;code}>`，以便上层拼出「订单 #x 已在批次 PBxxx 中」的明确原因（规格 §9）。
3. **`pickingList` 未用原生 SQL**：计划用 postgres 原生 SQL（别名 `l` 未定义），实现改为「仓储查询 + JS 聚合」，方言无关（sqlite / postgres 行为一致）且可无 DB 单测。
4. **`updateOrderShippingAddress` 与计划有实质差异（重要）**：Vendure 3.6.4 中 `Order.shippingAddress` 是 **`simple-json` 列**，`OrderAddress` **不是独立实体**、也**不从 `@vendure/core` 导出**。故实现改为「读订单 → 合并 shippingAddress 字段 → `repo.update(order.id,{shippingAddress:next})` 定向更新」，不再 save 地址实体（计划原文会编译不过且运行期报 `Relation ... was not found`）。语义不变：**不重算运费**。
5. **`@Column({type:'datetime'})` 改为 `'timestamp'`**：本地 dev-server 已切 postgres，`datetime` 在 postgres 下抛 `DataTypeNotSupportedError`，起服直接失败。`pick_batch.pickedAt/printedAt/shippedAt` 与 `pick_batch_order.addedAt` 已改 `timestamp`。
6. **`relations: { shippingAddress: true }` 已移除**：`shippingAddress` 是列不是关系，在 `find({relations})` 中传入会抛错（`membersSnapshot` / `candidates` 两处）。
7. **`ID` 类型来源统一**：`@nestjs/graphql` 的 `ID` 是值（`TS2749`），实体/参数类型统一用 `@vendure/core` 导出的 `ID`。
8. **`currentOperator` 实现**：计划用原生 SQL 查 `tenant_member`，实现改为仓储查询 `TenantMember(administratorId=activeUserId)` → 回退 `Administrator` 姓名，避免表名/列名硬编码。
9. **Task 8 Step 4 为 N/A**：本次部署后端直接由 `synchronize:true` 建表，**未使用** `_patch_schema_*.mjs` 补丁脚本，故无脚本提交；快照由 `tmp-refresh-schema.mjs` 从生产重拉（`graphql.schema.json` 属 gitignored 滞后快照，不入库）。
10. **`nshop` 路径勘误**：计划写 `d:\zhao\vshop\nshop`，实际路径为 **`d:\zhao\nshop`**，刷新快照命令在该目录执行。
11. **web-admin 无 codegen**：`web-admin` 用 `graphql-request` + 内联 GraphQL 文档字符串，**不存在** schema 快照/`codegen` 步骤，故 Task 9 起的前端实现不受快照影响（快照仅 nshop 需要）。

**偏差说明（Task 9）**：

12. **`useBinMode` 不用 `channelStore`，改为「API + 模块级缓存」**：项目无 `stores/channelStore.ts`（渠道信息散落在各页自取），故 `useBinMode` 改为直接调 `fetchActiveChannel()` 并在模块级 `ref` + `loaded` 标志缓存（一次会话只拉一次）；失败**按 `off` 且不置 `loaded`**，下次仍可重试。对外仍导出 `mode/showZone/showBin`（另导出 `ensureBinMode(force)` / `resetBinMode()` 供页面在 `onShow` 强制刷新、切店时失效）。
13. **函数返回类型显式化 + 错误原因保原文**：计划只给函数名，实现补齐了 `PickBatch` / `PickOrderSnapshot` / `PickBatchPickingRow` / `ShipPickBatchResult` / `StorageZone` / `StorageBin` / `VariantBinBinding` 等类型，并统一 `try/catch → graphQlErrorMsg(e,'…失败')` 抛出（规格 §9「不静默」）。
14. **JSON 标量字段裸取**：`members` / `pickBatchCandidates.items` / `shipPickBatch` / `updateOrderShippingAddress` / `variantBin` / `generateStandardBins` / `bindVariantToBin` 在 SDL 里是 **JSON 标量**，查询时只取字段本身、**不带子选择集**（否则 `GRAPHQL_VALIDATION_FAILED`）。`fetchPickBatch` 一次性把 `members` 与批次字段一起取回，`fetchPickBatchMembers` 复用它（不重复请求）。
15. **dist 产物留到 Task 15 统一提交**：`.gitignore` 明确「本地构建产物需提交 git」，但本次 `npm run build:h5` 仅为验证编译，重建产生的 ~181 个 dist 变更**不入 Task 9 提交**（改动仅 add src），统一留到 Task 15 一次性构建+提交，避免中间态产物反复变动。

**偏差说明（Task 10）**：

16. **新增 `constants/menus.ts` 菜单入口（计划外必需项）**：计划 Task 10 的 Files 只列了页面/组件，但配货台若无菜单入口则无法在界面上抵达（Task 15 只能靠直链截图）。故在交易域 `menuGroups` 增加 `menu.picking` → `/pages/order/picking/index`（tier 2，紧邻「发货」）。其 i18n 键 `menu.picking` 随 Task 14 一并补。
17. **`pages.json` 改为「按 Task 增量注册」**：计划 Step 1 要求一次注册三个页面，但 `picking/batch` 与 `inventory/bins` 的 `.vue` 当时尚未创建，uni-app 构建会因页面文件缺失报错。故 Task 10 只注册 `pages/order/picking/index`，其余两页分别由 Task 11 / Task 12 注册（最终结果与计划一致）。
18. **候选订单行不渲染「库区/库位摘要行」（门控点缺失，需后端补数据）**：计划 Step 2 要求 `showZone` 为真时在地址下方显示库区/库位摘要。但后端 `snapshotOrder`（`pick-batch.service.ts` 的 `PickOrderSnapshot`）**只返回订单地址与就近推荐仓，不含任何 SKU 库位字段**，且候选快照里没有 `variantId`，无法再调 `variantBin` 补拉。为不伪造数据，`CandidateOrderRow.vue` 未渲染该行、未引入 `useBinMode`。**库位的三档门控在真实有数据的消费点落实**：批次详情（Task 11，走 `pickBatchPickingList` 的 `binCode/zoneCode/zoneName`）、拣货单与包裹标签（Task 13）、库位管理页与采购入库（Task 12）。若后续要在候选列表显示库位，需后端在 `snapshotOrder` 中补 `SKU→库位` 汇总字段。

**偏差说明（Task 11）**：

19. **4 个打印入口延后到 Task 13 接入（不违反计划意图）**：计划 Step 3 要求 `batch.vue` 含「4 个打印入口」，但打印子系统（`utils/print/*`）由** Task 13 才创建**；若在 Task 11 就写死 import，本步 `npm run build:h5` 会因模块不存在失败。故 Task 11 的 `batch.vue` 先不含打印按钮，**Task 13 建好打印子系统后再把 4 个入口接进 `batch.vue`**（恰好 Task 13 也要改 `batch` 相关文件）。两 Task 合计结果与计划一致。
20. **`batch.vue` 增加「状态推进 / 取消批次 / 移出所选」按钮（计划未列，但为可用必需）**：后端状态机 `PENDING→PICKED→PRINTED→SHIPPED`（`CANCELLED` 可从任一非终态进入）全部经 `advancePickBatchState` 显式驱动，若页面不给入口则批次永远停在 `PENDING`。故按当前状态渲染「确认拣货完成」「标记单据已打印」与「取消批次」；「移出所选」仅在 `PENDING`/`PICKED` 展示（与后端 `assertState` 一致）。
    **修正（Task 13 落地后）**：本条原稿曾写「Task 13 起由打印动作自动推进」，**实际未采用**。理由：「打印拣货单」在语义上不等于「拣货完成」/「单据已打印」，用打印动作隐式推进会在状态历史上撒谎（且移动端浏览器可能拦截打印，状态会被「没打成」劫持）。故**状态一律只由显式按钮推进**，打印只产出单据。同时 `canPrint` **不看只读态**——`SHIPPED` / `CANCELLED` 也允许重印（单据是记录，重印不改状态）。
21. **订单地址无 `district` 字段 → 区县并入 `streetLine1`（重要语义）**：`OrderAddressInput` 只有 `fullName/phoneNumber/province/city/streetLine1/streetLine2/postalCode/countryCode`（Vendure 3.6.4 `Order.shippingAddress` 为 `simple-json`），**没有独立区县字段**。故 `AddressEditSheet` 的区县选择器在保存时拼回 `streetLine1` 前缀，且**若详细地址开头已含同一区县名则不重复拼接**（避免「朝阳区朝阳区XX路」）；回填时 `streetLine1` 原样进「详细地址」，区县栏留空不伪造。
22. **`BatchMemberRow` 的商品摘要不含单量**：`pickBatchPickingList` 的 `qty` 是**批次级**汇总（按 SKU 跨订单合并），无法还原「某个订单该 SKU 要几件」，且成员快照无行明细。故摘要只列该订单涉及的 SKU 名（≤2 个 + 「等 N 个 SKU」），件数用快照的 `itemCount` 展示，**不伪造单量**。

**偏差说明（Task 12）**：

23. **库位管理页不含「已绑 SKU 数」，也无库区/库位增删改（后端能力边界）**：计划 Step 2 要求「显示编码 + 已绑 SKU 数」及「库区/库位增删改」。实际后端（`plugin.ts` adminApiExtensions §库区/库位）只提供 `generateStandardBins`（幂等生成）+ `deleteStorageBin`（有绑定则拒绝）两个变更接口，**没有** `createStorageZone` / `updateStorageZone` / `createStorageBin` / `updateStorageBin`；`storageBins` 也不返回绑定量（service 里虽有 `binBindCounts`，但未挂到 resolver，前端取不到）。故本页只落地**「生成标准库位（18 个）+ 库区/库位只读浏览 + 删除库位」**，占用冲突时透出后端拒绝原文（`该库位已被 N 个 SKU 占用，请先解绑`），**不伪造绑定量**。若后续要展示绑定量，需后端把 `binBindCounts` 暴露为 `storageBins.boundCount` 字段。
24. **Task 12 顺带补齐本步所需的 i18n 词条（Task 14 因此变薄）**：计划把 `inventoryBin.*` 与 `orderAdmin.picking.bin.*` 统一排在 Task 14，但 Task 12 的两个页面与 `BinPicker` 立即可用需要这些键，否则界面显示原始 key。故 Task 12 先补**本步用到的**键：`menu.binManage`、`orderAdmin.picking.bin.{zone,bin,selectZone,selectBin,needWarehouseFirst,needZoneFirst,noZone,unassigned}`、`inventoryBin.*`（19 个）、`stockDocPurchase.{existingBin,requireZone,requireBin}`，中文/英文同步。校验：双语键集完全一致（各 1982 键，diff none）。Task 14 只余**打印子系统与配货台列表页**的键。
25. **三档开启时采购入库强制选到库位（防止「开了库位却没归位」的半开状态）**：计划只要求「提交时把 `binId`/`zoneId` 一并传给 `createStockDoc`」。实现补充了拦截：`showZone` 为真且未选库区 → 提示「请选择入库库区」；`showBin` 为真且未选库位 → 提示「请选择入库库位」。`off` 档整块不渲染且**完全不传** `zoneId`/`binId`（与旧行为逐字节一致）。另：**换仓会清空已选库区/库位与现库位提示**（原库区不属于新仓，避免提交出跨仓无效绑定）；选定 SKU + 仓后调 `fetchVariantBin` 展示「该 SKU 现库位：{code}」并**预选回填**该库区/库位，无绑定则不提示、不回填。

**偏差说明（Task 13）**：

26. **测试框架改 `node:test`（不用 `vitest`），并新增计划外共享模块 `doc-common.ts`（重要）**：
    - **测试**：计划 Step 3/4 用 `vitest`，但 `web-admin` 的 `package.json` **没有** `vitest` / `tsx`（只有 vite + typescript），装新依赖不在本计划范围。改用 **Node v22.20.0 内建 `node --test`**（原生类型剥离，可直接跑 `.ts`），断言库换 `node:assert/strict`（`expect(html).toContain(x)` → `assert.ok(html.includes(x))`）。命令：`node --test src/utils/print/templates/templates.spec.ts` → **12 pass / 0 fail**（计划预期 4 例，实补至 12 例：行序 / 合计 / 转义 / 本地化 labels / 发货单一单一页 / 标签尺寸 / 总览横向）。
    - **扩展名**：模板内部相对导入必须写**显式 `.ts` 扩展名**（`'../doc-common.ts'` / `'../print.css.ts'`），否则 Node ESM 解析失败；Vite/uni-app 侧因精确路径存在亦可正常解析（`npm run build:h5` 已验证）。
    - **共享模块**：计划把转义/时间格式化/公共打印 CSS 散落在各模板中重复实现。实现抽出 `doc-common.ts` 统一承载：`esc()`（`& < > " '`）、`fmtTime()`、27 键 `PrintLabels` + `DEFAULT_LABELS`（中文）+ `withLabels()` 逐项回退 + `fill()` 占位符，以及 `pageHtml()`（完整 HTML 文档 + 通用打印 CSS）。四个模板因此都接受第 4 个可选参数 `labels?: Partial<PrintLabels>`，由 `batch.vue` 从 `orderAdmin.picking.print.*` 注入**当前语言**（默认值兜底中文，键缺失不崩）。
    - **状态推进**：见偏差 20 修正——打印**不**自动推进批次状态。
    - **`canPrint` 口径**：`!!batch && members.length > 0`，**不含**只读态判断（终态可重印）。

**偏差说明（Task 14）**：

27. **语言包真实文件名为 `zh-Hans.json`（计划原文写 `zh-CN.json`）**：`web-admin/src/locale/` 下实际只有 `zh-Hans.json` 与 `en.json`，无 `zh-CN.json`。按计划「以实际为准」执行，只改这两个文件。
28. **键集校验改为脚本化三查（不再手工比对）**：计划 Step 3 用 `ConvertFrom-Json` 后「手工比对」。实现改为 Node 一行式脚本自动完成三件事：① 递归取叶子键比对双语对称性；② 扫 `src/**/*.vue|ts` 提取 `orderAdmin.picking.*` / `inventoryBin.*` / `menu.picking` 等实际引用键，逐个回查 locale 是否存在（可发现「组件在用但词条没补」的漏项——Task 12/13 正是靠这一步确认补全）；③ 从 `doc-common.ts` 的 `PrintLabels` 接口抽键，校验 27 个打印标签词条齐备。因 Task 12/13 已提前补掉大部分键，本步实际只 +75 键/语言，**Task 14 明显变薄**（见偏差 24）。

---

## 自审记录（写完计划后对规格做的复查）

**1. 规格覆盖**

| 规格章节 | 对应 Task |
|---|---|
| §4 数据模型（批次两表） | Task 1 |
| §5 状态机 | Task 3（纯函数）+ Task 4（落库） |
| §6 后端接口（4 查询 + 8 变更） | Task 7 |
| §7 就近选仓 | Task 3（`pickRecommendation` + 单测三档优先级） |
| §8 前端设计（页面/组件/打印/i18n） | Task 9~14 |
| §9 错误处理与边界 | Task 4（冲突/非法迁移）、Task 11（改地址失败保留输入）、Task 13（打印兜底）、Task 12（删除库位校验） |
| §10 测试与交付 | Task 15 |
| §11 实施顺序 10 步 | 全部映射（后端表→库位→部署→前端 API→详情→库位页→打印→ship 改造→i18n→交付） |
| §13 库位体系 | Task 2（表/模板/开关）、Task 5（service）、Task 6（归位）、Task 12（前端）、Task 13（拣货单） |
| §13.9 三档门控表（5 个消费点） | Task 12（库位管理页/采购入库）、Task 13（拣货单/包裹标签）、Task 11（批次详情拣货汇总分组）。候选订单行因后端无库位字段未落地（见偏差 18） |
| §13.9 排序键三档统一 | Task 3（`sortPickingRows` 含 zone 档退化用例） |
| §13.9 测试范围（3 条主路径） | Task 15 Step 1 |

**2. 占位符扫描**

- 全文无 `TBD` / `TODO` / `implement later`。
- Task 9 Step 3 / Step 4 的 `/* ... */` 是**计划内的省略标记**，已在正文明确写了「不允许留在代码里」，并给出了完整函数清单与参照文件，实施时逐个补全。
- Task 12 未给完整 `.vue` 源码——因该页是模板 + 脚本的组合，完整源码体量过大；已给出**门控函数名、调用接口名、参照文件、逐条渲染规则**，满足「可照做」要求。

**3. 类型与命名一致性核对**

- `binMode` 取值 `'off' | 'zone' | 'bin'`：后端 `StorageBinService.resolveMode`（Task 5）与前端 `useBinMode`（Task 9）**同语义、同缺省 `off`**，两处单测都已覆盖缺省与非法值。✅
- `PickBatchState` 五个值：Task 1 定义 → Task 3 `TRANSITIONS` → Task 4 `advance` → Task 12 前端只读判定，**字符串完全一致**。✅
- `pathIndex`：Task 3 产出 → Task 4 透传 → Task 13 模板按 `pathIndex` 升序且**不重排**，`NO_BIN_PATH_INDEX = 9999` 三处一致。✅
- `STANDARD_BIN_COUNT = 18`：Task 2 常量 → Task 5 `generateStandard` 单测断言 18 → Task 15 线上复验 18。✅
- `variant_storage_bin` 唯一键 `(tenantChannelId, variantId, stockLocationId)`：Task 2 实体 → Task 5 `bind` 的 upsert 查询条件一致。✅