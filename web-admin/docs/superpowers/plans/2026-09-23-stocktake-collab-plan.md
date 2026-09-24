# 多人协同盘库（Stocktake）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有「单人一次性盘库」之上落地任务化协同盘库 —— 一个任务一个仓库、按库区拆盘次、盘次可指派/认领并独占、多人并行录入、全部提交后一次性汇总过账（生成 1 张 ST 单据），并补齐「库位 → SKU」反向查询缺口。

**Architecture:** 后端在 `vendure/packages/cjk-plugin` 新增「盘库」三表（任务 `stocktake_task` / 盘次 `stocktake_wave` / 应盘行 `stocktake_line`）+ 纯函数层（状态机 / 任务号 / 应盘清单生成 / 差异汇总 / 扫码解析 / 过账计划）+ service（渠道收口、独占锁、事务）+ **仅 admin-api** 的 SDL/resolvers；过账完全复用既有 `StockDoc`（`type=STOCKTAKE`，`realQty` 覆盖式 + `applyBinBinding` 归位），不新建过账机制。前端在 `vshop/web-admin` 新建任务看板 / 任务详情 / 手机录入页（版式 B）/ 扫码快盘（版式 C）/ 差异页 5 页，三档差异由既有 `useBinMode()` 单点门控。

**Tech Stack:** Vendure 3.6.4 / TypeORM / NestJS（后端，vitest 单测）；uni-app + Vue 3.5 + TypeScript + graphql-request + Pinia（前端，`node --test` 单测）；Playwright 移动视口 390×844 dpr=2（验收截图）。

---

## 关键硬规则速查（每个 Task 动手前先看）

| # | 规则 | 违反后果 |
|---|---|---|
| R1 | `adminApiExtensions` 与 `shopApiExtensions` 是**两套独立 SDL + resolvers 数组**。本设计**有意只注册 admin**（规格 §3.8），**不要**顺手加 shop 侧 | 加错侧等于给 C 端开了后台接口 |
| R2 | 后端消费编译产物 `lib/`，**改 `src` 必须 `npm run build`** | 接口行为像「没改」，白排查半天 |
| R3 | `lib/` 是 **git 跟踪产物**，提交必须含 `src` + `lib` | 服务器 `git pull` 后不生效 |
| R4 | 本地起服要**两个进程**：`npm run dev:server` + `npm run dev:worker` | 任务队列永远 `PENDING` |
| R5 | 生产库 **PostgreSQL + `synchronize:true`** → 三张新表开机自动建，**不写 migration**；本地 dev-server 也已切 postgres | 误写 migration 属多余动作；且 `datetime` 列类型在 postgres 会抛 `DataTypeNotSupportedError` |
| R6 | 部署铁律：**本地构建**，服务器只 `git pull --ff-only` / 解压 + `pm2 restart` | 服务器内存不足构建失败 |
| R7 | TimeORM 日期列一律用 `{ type: 'timestamp' }`，**不要用 `'datetime'`** | postgres 起服直接失败（既有踩坑） |
| R8 | 交付 = 实现 + API/e2e 回归 + **手机视口截图 390×844 dpr=2（780×1688）** + 操作手册补图 | 不算交付 |
| R9 | i18n 固定文案必须 `zh-Hans` / `en` **双语同步**（真实文件是 `zh-Hans.json`，不是 `zh-CN.json`） | 切语言漏文案 |
| R10 | 所有新查询必须按 `String(ctx.channelId)` 收口（列名沿既有约定 `tenantChannelId`）。`ProductVariant` 是 **ChannelAware**，裸仓储查询不过滤渠道 | 跨渠道串数据（配货台已有前车之鉴） |
| R11 | 盈亏一律**按变体汇总**（`SUM(countedQty)`），**禁止逐行相减** | 盘盈行与应盘行同变体并存时重复计入 |
| R12 | 前端单测**没有 vitest** → 用 `node --test`（原生类型剥离）；相对导入**必须写显式 `.ts` 扩展名** | 测试跑不起来 |
| R13 | 设计方案（4 个页面版式）**先用内联可视化 mockup 预览定稿**，再写页面代码 | 版式返工 |

**两个仓库**：后端 `d:\zhao\vendure`，前端 `d:\zhao\vshop`（`web-admin` 子目录）。
**规格文档（唯一权威来源）**：`vshop/web-admin/docs/superpowers/specs/2026-09-23-stocktake-collab-design.md`。
**格式与踩坑参考**：`vshop/web-admin/docs/superpowers/plans/2026-09-22-picking-console-plan.md`（同体系的前序计划，偏差说明里有大量实测教训）。

---

## 文件结构总览

### 后端 `d:\zhao\vendure\packages\cjk-plugin\src\`

| 文件 | 职责 |
|---|---|
| `stocktake/stocktake-task.entity.ts` | 新建。任务主表实体（`stocktake_task`） |
| `stocktake/stocktake-wave.entity.ts` | 新建。盘次实体（`stocktake_wave`） |
| `stocktake/stocktake-line.entity.ts` | 新建。应盘行实体（`stocktake_line`） |
| `stocktake/stocktake-math.ts` | 新建。纯函数：任务/盘次状态机、任务号、应盘清单生成、账面快照归并、差异汇总、扫码解析、过账计划 |
| `stocktake/stocktake-math.spec.ts` | 新建。上述纯函数单测（vitest） |
| `stocktake/stocktake.service.ts` | 新建。渠道收口、建任务事务、盘次认领/指派/释放、批量录入、提交、差异查询、过账事务 |
| `stocktake/stocktake.service.spec.ts` | 新建。service 纯逻辑单测（无 DB 部分：权限判定、状态断言、错误原因文案） |
| `stocktake/stocktake-permissions.ts` | 新建。两个 `PermissionDefinition`（`StocktakeCount` / `StocktakePost`） |
| `stocktake/stocktake.admin.resolver.ts` | 新建。盘库 admin 接口（6 查询 + 10 变更） |
| `storage/bin-query.math.ts` | 新建。纯函数：分页钳制、`zoneId`+`binId` 归属校验、占用概览归并 |
| `storage/bin-query.math.spec.ts` | 新建。上述纯函数单测 |
| `storage/storage-bin.service.ts` | **修改**。新增 `variantBinsByLocation()`（分页明细）、`binOccupancy()`（含空格概览）、`findBinByCode()`、`findZoneBin()` |
| `storage/storage-bin.admin.resolver.ts` | **修改**。新增两个只读查询 `variantBinsByLocation` / `binOccupancy` |
| `tenant/role-templates.ts` | **修改**。角色模板补 `StocktakeCount` / `StocktakePost` |
| `plugin.ts` | **修改**。注册 3 实体 + `StocktakeService` provider + 权限定义注入 + storage SDL 扩两项 + 盘库 SDL 块（仅 admin）+ admin resolvers 追加 `StocktakeAdminResolver` |

### 前端 `d:\zhao\vshop\web-admin\src\`

| 文件 | 职责 |
|---|---|
| `apis/stocktake.ts` | 新建。盘库 6 查询 + 10 变更调用（照 `apis/storage-bin.ts` 风格，统一 `graphQlErrorMsg`） |
| `utils/stocktake-grid.ts` | 新建。纯函数：格子宫格归组、进度计算、行筛选、差异格式化 |
| `utils/stocktake-grid.spec.ts` | 新建。`node --test` 单测 |
| `composables/useStocktakeScope.ts` | 新建。当前任务/盘次上下文 + 进度计算（录入页与扫码页共用） |
| `components/stocktake/TaskCard.vue` | 新建。任务卡片（进度条 + 活动分组标记 + 过账入口） |
| `components/stocktake/WaveCard.vue` | 新建。盘次卡片（认领/指派/释放/进度） |
| `components/stocktake/BinGrid.vue` | 新建。库区 → 格子宫格（含占用角标与空格） |
| `components/stocktake/CountLineRow.vue` | 新建。应盘行（SKU + 账面提示 + 数量输入 + 已盘标记） |
| `pages/inventory/stocktake/index.vue` | 新建。任务看板 |
| `pages/inventory/stocktake/task.vue` | 新建。任务详情（盘次管理 + 进度 + 退回） |
| `pages/inventory/stocktake/count.vue` | 新建。手机录入页（版式 B） |
| `pages/inventory/stocktake/scan.vue` | 新建。扫码快盘（版式 C） |
| `pages/inventory/stocktake/diff.vue` | 新建。差异页（过账前唯一决策点） |
| `pages.json` | **修改**。注册 5 个新页面（按 Task 增量注册，见偏差预案） |
| `constants/menus.ts` | **修改**。`MenuItem` 增 `perm?: string`；`visibleMenus` 增权限过滤；库存域增 `menu.stocktakeTask` |
| `locale/zh-Hans.json` / `locale/en.json` | **修改**。`stocktake.*` 与 `menu.stocktakeTask` 双语词条 |

### 文档与脚本

| 文件 | 职责 |
|---|---|
| `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` | **修改**。追加第 16 章「多人协同盘库」 |
| `docs/webadmin-bugfix-manual/assets/` + `src/static/manual/shots/` | 新增手机视口截图（双落点） |
| `scripts/_smoke_stocktake_live.py` | 新建。只读冒烟探针（照 `_smoke_picking_live.py`） |
| `_e2e/_shot_stocktake.py` | 新建。Playwright 手机视口截图脚本 |
| `docs/superpowers/plans/2026-09-23-stocktake-collab-plan.md` | 本文件（执行完回填「执行结果」） |

---

## Task 0：环境自检（动手前必做）

**Files:**
- 只读检查：`d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 确认本地依赖无双实例**

```powershell
Test-Path d:\zhao\vendure\packages\common\node_modules
Test-Path d:\zhao\vendure\packages\cjk-plugin\node_modules
Test-Path d:\zhao\vendure\node_modules\@vendure\core
```

预期：前两条为 `False`（或已改名为 `node_modules.pnpm-bak`），第三条为 `True`。
若前两条为 `True`，先按 `project_memory` 记录的「vendure 本地依赖双实例」修法隔离（`common` / `coupon-plugin` 整目录改名 `node_modules.pnpm-bak`；`core` 用 Node 安全遍历删除），否则后面所有排查都会被 `Entity metadata for X#channels was not found` 污染。

- [ ] **Step 2: 确认 cjk-plugin 基线单测为绿**

```powershell
npm run test
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：记录基线用例数（既有已知失败项若仍存在，一并记录，后续只允许新增用例、不允许新增失败）。

- [ ] **Step 3: 记录插件注册点行号（文件很大，行号会漂）**

```powershell
Select-String -Path src\plugin.ts -Pattern 'entities: \[|providers: \[|adminApiExtensions|shopApiExtensions|resolvers: \[|customPermissions'
```

预期：能定位到 `entities` 数组、`providers` 数组、`adminApiExtensions`（含库位 SDL 块与 `resolvers` 数组）、`shopApiExtensions`、以及 `config.authOptions.customPermissions` 的既有注入点。**把行号记在纸上**，Task 6 要用。

- [ ] **Step 4: 记录既有约定（照抄，不另创风格）**

```powershell
Select-String -Path src\picking\pick-batch.entity.ts -Pattern 'tenantChannelId|timestamp|@Unique|@Index'
Select-String -Path src\storage\storage-bin.service.ts -Pattern 'tenantOf|binBindCounts|resolveMode'
```

预期：
- `pick-batch.entity.ts` 里 `tenantChannelId` 的**声明类型**（varchar / int）—— 本计划三表**照抄**该类型，保证同源语义。
- `binBindCounts(ctx, stockLocationId): Map<number, number>` 存在且按渠道 + 仓库收口 —— Task 3 的 `binOccupancy` 直接复用，不重写聚合。

- [ ] **Step 5: 确认本地 postgres 连接方式（Task 1 要查新表）**

```powershell
Select-String -Path packages\dev-server\.env -Pattern 'DB_|DATABASE|POSTGRES' | Select-Object -First 20
```

（cwd: `d:\zhao\vendure`）

预期：拿到本地 postgres 的连接变量（常见为 `DATABASE_URL`，或拆分的 `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME`）。**记下变量名**，Task 1 Step 5 要用。

---

## Task 1：盘库三张表

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-task.entity.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-wave.entity.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-line.entity.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\entities.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（`entities` 数组末尾追加 3 项）

- [ ] **Step 1: 写失败的实体约束单测**

```ts
// src/stocktake/entities.spec.ts
import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { StocktakeTask } from './stocktake-task.entity';
import { StocktakeWave } from './stocktake-wave.entity';
import { StocktakeLine } from './stocktake-line.entity';

const storage = getMetadataArgsStorage();

function columns(target: Function): string[] {
    return storage.columns
        .filter((c) => (c.target as unknown) === target)
        .map((c) => c.propertyName);
}
function uniques(target: Function): string[][] {
    return storage.uniques
        .filter((u) => (u.target as unknown) === target)
        .map((u) => (u.columns as string[]).slice().sort());
}
function indices(target: Function): string[][] {
    return storage.indices
        .filter((i) => (i.target as unknown) === target)
        .map((i) => (i.columns as string[]).slice().sort());
}
function has(list: string[][], target: string[]): boolean {
    const want = target.slice().sort().join('|');
    return list.some((c) => c.join('|') === want);
}

describe('盘库三表实体约束', () => {
    it('stocktake_task 关键列齐备且 (tenantChannelId, code) 唯一', () => {
        const cols = columns(StocktakeTask);
        for (const c of [
            'code', 'tenantChannelId', 'stockLocationId', 'activityCode', 'name',
            'scopeJson', 'binModeAtCreate', 'state', 'createdById', 'createdByName',
            'postedStockDocId', 'postedAt', 'note',
        ]) {
            expect(cols).toContain(c);
        }
        expect(has(uniques(StocktakeTask), ['tenantChannelId', 'code'])).toBe(true);
    });

    it('stocktake_wave 关键列齐备且按 taskId 建索引', () => {
        const cols = columns(StocktakeWave);
        for (const c of [
            'tenantChannelId', 'taskId', 'scopeType', 'zoneId', 'zoneCode', 'zoneName',
            'assigneeId', 'assigneeName', 'state', 'expectedCount', 'countedCount',
            'claimedAt', 'submittedAt',
        ]) {
            expect(cols).toContain(c);
        }
        expect(has(indices(StocktakeWave), ['taskId'])).toBe(true);
    });

    it('stocktake_line 关键列与三个索引齐备', () => {
        const cols = columns(StocktakeLine);
        for (const c of [
            'tenantChannelId', 'taskId', 'waveId', 'variantId', 'variantSku', 'variantName',
            'zoneId', 'binId', 'zoneCode', 'binCode', 'bookQty', 'countedQty',
            'isExtra', 'countedById', 'countedByName', 'countedAt', 'note',
        ]) {
            expect(cols).toContain(c);
        }
        const idx = indices(StocktakeLine);
        expect(has(idx, ['taskId', 'waveId'])).toBe(true);
        expect(has(idx, ['waveId', 'countedQty'])).toBe(true);
        expect(has(idx, ['taskId', 'variantId'])).toBe(true);
    });

    it('stocktake_line 唯一约束防同盘次同变体同库位重复行', () => {
        expect(has(uniques(StocktakeLine), ['taskId', 'waveId', 'variantId', 'binId'])).toBe(true);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/stocktake/entities.spec.ts
```

预期：FAIL，报 `Cannot find module './stocktake-task.entity'`。

- [ ] **Step 3: 写三个实体**

```ts
// src/stocktake/stocktake-task.entity.ts
import { Column, Entity, Index, Unique } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/** 任务状态（规格 §5）：DRAFT → OPEN → COUNTING → COUNTED → POSTED，任意非终态可 CANCELLED */
export type StocktakeTaskState = 'DRAFT' | 'OPEN' | 'COUNTING' | 'COUNTED' | 'POSTED' | 'CANCELLED';

/**
 * 盘库任务：一个任务 = 一个仓库；多仓协同靠 activityCode 分组，各仓独立过账（规格 §3.3）。
 */
@Entity()
@Unique(['tenantChannelId', 'code'])
@Index(['tenantChannelId', 'state'])
@Index(['tenantChannelId', 'activityCode'])
export class StocktakeTask extends VendureEntity {
    constructor(input?: DeepPartial<StocktakeTask>) {
        super(input);
    }

    /** 任务号，前缀 TK（避开单据前缀 ST，防混淆） */
    @Column({ type: 'varchar' })
    code!: string;

    /** 渠道收口键（硬性 R10）：写入 String(ctx.channelId)，所有查询按此过滤 */
    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    @Column({ type: 'int' })
    stockLocationId!: number;

    /** 盘点活动分组码（多仓归一组），可为空 */
    @Column({ type: 'varchar', nullable: true })
    activityCode!: string | null;

    @Column({ type: 'varchar' })
    name!: string;

    /** 圈范围条件快照（JSON 文本）：{ zones, categoryIds, variantIds, includeZeroBook } */
    @Column({ type: 'text' })
    scopeJson!: string;

    /** 建任务时的档位（off/zone/bin）：避免中途改档导致语义漂移 */
    @Column({ type: 'varchar' })
    binModeAtCreate!: string;

    @Column({ type: 'varchar' })
    state!: StocktakeTaskState;

    @Column({ type: 'varchar', nullable: true })
    createdById!: string | null;

    @Column({ type: 'varchar', nullable: true })
    createdByName!: string | null;

    @Column({ type: 'int', nullable: true })
    postedStockDocId!: number | null;

    @Column({ type: 'timestamp', nullable: true })
    postedAt!: Date | null;

    @Column({ type: 'text', nullable: true })
    note!: string | null;
}
```

```ts
// src/stocktake/stocktake-wave.entity.ts
import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/**
 * 盘次状态（规格 §4.2/§5）。
 * 说明：规格 §4.2 的枚举里含 `RELEASED`，本实现**不落库该状态** —— 「释放」语义 =
 * 回到 `OPEN` 且清空 assigneeId（可再次被认领），用状态 + 负责人两个字段即可表达，
 * 不额外增加一个瞬时状态（详见末节「自审记录」的类型一致性核对）。
 */
export type StocktakeWaveState = 'OPEN' | 'CLAIMED' | 'COUNTING' | 'SUBMITTED' | 'CANCELLED';

/** 盘次范围类型：zone=按库区 / whole=off 档整仓 / unassigned=未归位桶 */
export type StocktakeScopeType = 'zone' | 'whole' | 'unassigned';

/**
 * 盘次：同一时刻只有一个负责人（独占锁），可指派也可开放认领（规格 §3.6）。
 */
@Entity()
@Index(['taskId'])
@Index(['tenantChannelId', 'assigneeId'])
export class StocktakeWave extends VendureEntity {
    constructor(input?: DeepPartial<StocktakeWave>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    @Column({ type: 'int' })
    taskId!: number;

    @Column({ type: 'varchar' })
    scopeType!: StocktakeScopeType;

    @Column({ type: 'int', nullable: true })
    zoneId!: number | null;

    /** 冗余快照：库区改名后仍可对账 */
    @Column({ type: 'varchar', nullable: true })
    zoneCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    zoneName!: string | null;

    /** TenantMember.id；null = 待认领 */
    @Column({ type: 'varchar', nullable: true })
    assigneeId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    assigneeName!: string | null;

    @Column({ type: 'varchar' })
    state!: StocktakeWaveState;

    /** 快照：应盘项数（进度分母） */
    @Column({ type: 'int', default: 0 })
    expectedCount!: number;

    /** 已盘项数（冗余加速） */
    @Column({ type: 'int', default: 0 })
    countedCount!: number;

    @Column({ type: 'timestamp', nullable: true })
    claimedAt!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    submittedAt!: Date | null;
}
```

```ts
// src/stocktake/stocktake-line.entity.ts
import { Column, Entity, Index, Unique } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/**
 * 应盘行（规格 §4.3）。
 * 注意：`bookQty` 是「该变体在该仓」的账面快照，**仅供行内提示**，
 * 差异一律按变体汇总计算（R11），禁止逐行相减。
 * 唯一约束里 `binId` 可空 → postgres 中 NULL 互不相等，故「未归位桶」允许同变体多行（符合预期）。
 */
@Entity()
@Unique(['taskId', 'waveId', 'variantId', 'binId'])
@Index(['taskId', 'waveId'])
@Index(['waveId', 'countedQty'])
@Index(['taskId', 'variantId'])
export class StocktakeLine extends VendureEntity {
    constructor(input?: DeepPartial<StocktakeLine>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    tenantChannelId!: string;

    @Column({ type: 'int' })
    taskId!: number;

    @Column({ type: 'int' })
    waveId!: number;

    @Column({ type: 'int' })
    variantId!: number;

    /** 快照：商品改名后仍可对账 */
    @Column({ type: 'varchar' })
    variantSku!: string;

    @Column({ type: 'varchar' })
    variantName!: string;

    @Column({ type: 'int', nullable: true })
    zoneId!: number | null;

    @Column({ type: 'int', nullable: true })
    binId!: number | null;

    @Column({ type: 'varchar', nullable: true })
    zoneCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    binCode!: string | null;

    @Column({ type: 'int', default: 0 })
    bookQty!: number;

    /** 实盘数；null = 未盘 */
    @Column({ type: 'int', nullable: true })
    countedQty!: number | null;

    /** 盘盈行（清单外登记的） */
    @Column({ type: 'boolean', default: false })
    isExtra!: boolean;

    @Column({ type: 'varchar', nullable: true })
    countedById!: string | null;

    @Column({ type: 'varchar', nullable: true })
    countedByName!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    countedAt!: Date | null;

    @Column({ type: 'text', nullable: true })
    note!: string | null;
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/stocktake/entities.spec.ts
```

预期：PASS，4 个用例全绿。

- [ ] **Step 5: 注册实体到插件**

修改 `src/plugin.ts` 的 `entities: [...]` 数组，在末尾（既有 `PickBatch, PickBatchOrder, StorageZone, StorageBin, VariantStorageBin` 之后）追加：

```ts
        StocktakeTask,
        StocktakeWave,
        StocktakeLine,
```

并在文件头部 import 区（照既有实体 import 风格）追加：

```ts
import { StocktakeTask } from './stocktake/stocktake-task.entity';
import { StocktakeWave } from './stocktake/stocktake-wave.entity';
import { StocktakeLine } from './stocktake/stocktake-line.entity';
```

- [ ] **Step 6: 编译 + 起服确认三表自动建**

```powershell
npm run build
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：`tsc` exit 0。

```powershell
npm run dev:server
```

（cwd: `d:\zhao\vendure\packages\dev-server`；另开终端跑 `npm run dev:worker`）

预期：日志出现 `Vendure server (v3.6.4) now running on port 3000`，且**无** `Entity metadata for ... was not found`。

然后确认表已建（连接变量名以 Task 0 Step 5 记录的实际为准；下例按 `DATABASE_URL`）：

```powershell
# cwd: d:\zhao\vendure\packages\dev-server
node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query(\"select tablename from pg_tables where tablename like 'stocktake_%' order by 1\")).then(r=>{console.log(r.rows.map(x=>x.tablename).join(','));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```

预期输出：`stocktake_line,stocktake_task,stocktake_wave`。
若 `.env` 用的是拆分变量（`DB_HOST` 等），改用 `psql -h <host> -p <port> -U <user> -d <db> -c "select tablename from pg_tables where tablename like 'stocktake_%' order by 1"`。

- [ ] **Step 7: 提交**

```bash
git add packages/cjk-plugin/src/stocktake packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/lib
git commit -m "feat(stocktake): 新增盘库三表（任务/盘次/应盘行）"
```

（cwd: `d:\zhao\vendure`；**必须带 `lib/`**，见 R3）

---

## Task 2：盘库纯函数（状态机 / 任务号 / 应盘清单 / 差异汇总 / 扫码解析 / 过账计划）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-math.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-math.spec.ts`

本 Task 是整个盘库**正确性的中枢**：规格 §6.1（清单生成）、§6.2（差异汇总，R11）、§6.3（过账计划）、§8.3（扫码优先级）全部落在这一层，且全部可无 DB 单测。

- [ ] **Step 1: 写失败的状态机与任务号单测**

```ts
// src/stocktake/stocktake-math.spec.ts
import { describe, expect, it } from 'vitest';
import {
    buildExpected, buildPostItems, canTaskTransition, canWaveTransition,
    formatTaskCode, nextTaskSeq, resolveScanCode, summarizeVariance, variantSnapBook,
} from './stocktake-math';

describe('任务/盘次状态机', () => {
    it('任务：DRAFT → OPEN → COUNTING → COUNTED → POSTED 合法，跳级与终态出边非法', () => {
        expect(canTaskTransition('DRAFT', 'OPEN')).toBe(true);
        expect(canTaskTransition('OPEN', 'COUNTING')).toBe(true);
        expect(canTaskTransition('COUNTING', 'COUNTED')).toBe(true);
        expect(canTaskTransition('COUNTED', 'POSTED')).toBe(true);
        expect(canTaskTransition('DRAFT', 'COUNTING')).toBe(false);
        expect(canTaskTransition('POSTED', 'COUNTING')).toBe(false);
        expect(canTaskTransition('CANCELLED', 'OPEN')).toBe(false);
    });

    it('任务：任意非终态可取消，终态不可取消', () => {
        for (const s of ['DRAFT', 'OPEN', 'COUNTING', 'COUNTED'] as const) {
            expect(canTaskTransition(s, 'CANCELLED')).toBe(true);
        }
        expect(canTaskTransition('POSTED', 'CANCELLED')).toBe(false);
        expect(canTaskTransition('CANCELLED', 'CANCELLED')).toBe(false);
    });

    it('盘次：OPEN → CLAIMED → COUNTING → SUBMITTED；释放回到 OPEN；SUBMITTED 后不可再变', () => {
        expect(canWaveTransition('OPEN', 'CLAIMED')).toBe(true);
        expect(canWaveTransition('CLAIMED', 'COUNTING')).toBe(true);
        expect(canWaveTransition('COUNTING', 'SUBMITTED')).toBe(true);
        expect(canWaveTransition('CLAIMED', 'OPEN')).toBe(true);   // 释放
        expect(canWaveTransition('COUNTING', 'OPEN')).toBe(true);  // 释放
        expect(canWaveTransition('SUBMITTED', 'OPEN')).toBe(false);
        expect(canWaveTransition('SUBMITTED', 'COUNTING')).toBe(false);
    });

    it('任务号：TK + 日期 + 三位流水，且取当日最大流水 +1', () => {
        const now = new Date('2026-09-23T10:00:00+08:00');
        expect(formatTaskCode(now, 7)).toBe('TK20260923-007');
        expect(nextTaskSeq([], now)).toBe(1);
        expect(nextTaskSeq(['TK20260923-001', 'TK20260923-003'], now)).toBe(4);
        expect(nextTaskSeq(['TK20260922-009', 'TK20260923-002'], now)).toBe(3);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/stocktake/stocktake-math.spec.ts
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：FAIL，`Cannot find module './stocktake-math'`。

- [ ] **Step 3: 写失败的核心算法单测**

追加到同一个 spec 文件：

```ts
describe('应盘清单生成（规格 §6.1）', () => {
    const variantMeta = new Map([
        [11, { sku: 'SKU-A', name: '甲商品' }],
        [22, { sku: 'SKU-B', name: '乙商品' }],
        [33, { sku: 'SKU-C', name: '丙商品' }],
    ]);
    const zoneMeta = new Map([
        [1, { code: 'A', name: 'A 区' }],
        [2, { code: 'B', name: 'B 区' }],
    ]);
    const scope = { zones: [], categoryIds: [], variantIds: [], includeZeroBook: false };

    it('binMode=off：只建一个 whole 盘次，全部行库位为空', () => {
        const r = buildExpected({
            binMode: 'off',
            bookRows: [{ variantId: 11, quantity: 5 }, { variantId: 22, quantity: 3 }],
            bindRows: [{ variantId: 11, zoneId: 1, binId: 101 }],
            variantMeta, zoneMeta, scope,
        });
        expect(r.waves).toHaveLength(1);
        expect(r.waves[0].scopeType).toBe('whole');
        expect(r.waves[0].expectedCount).toBe(2);
        expect(r.linesByWave[0].every((l) => l.zoneId === null && l.binId === null)).toBe(true);
    });

    it('binMode=bin：已归位按 (zone,bin) 拆行 + 未归位进 unassigned 桶（双源合并）', () => {
        const r = buildExpected({
            binMode: 'bin',
            bookRows: [{ variantId: 11, quantity: 5 }, { variantId: 22, quantity: 3 }],
            bindRows: [
                { variantId: 11, zoneId: 1, binId: 101, zoneCode: 'A', binCode: 'A-01-01' },
                { variantId: 33, zoneId: 2, binId: 201, zoneCode: 'B', binCode: 'B-01-01' },
            ],
            variantMeta, zoneMeta, scope,
        });
        const byType = (t: string) => r.waves.findIndex((w) => w.scopeType === t);
        expect(byType('zone')).toBe(0);
        expect(byType('unassigned')).toBe(1);
        const zoneWave = r.linesByWave[0];
        expect(zoneWave.map((l) => l.variantId).sort()).toEqual([11, 33]);
        // 变体 22 只有账面、无绑定 → 未归位桶
        const unassigned = r.linesByWave[1];
        expect(unassigned.map((l) => l.variantId)).toEqual([22]);
        expect(unassigned[0].bookQty).toBe(3);
        expect(unassigned[0].zoneId).toBeNull();
    });

    it('binMode=bin：同一变体多绑定 → 多行，且每行 bookQty 相同（行内提示，不参与相减）', () => {
        const r = buildExpected({
            binMode: 'bin',
            bookRows: [{ variantId: 11, quantity: 5 }],
            bindRows: [
                { variantId: 11, zoneId: 1, binId: 101 },
                { variantId: 11, zoneId: 1, binId: 102 },
            ],
            variantMeta, zoneMeta, scope,
        });
        expect(r.linesByWave[0]).toHaveLength(2);
        expect(r.linesByWave[0].map((l) => l.bookQty)).toEqual([5, 5]);
        // 同变体多条绑定 → 同变体多行，但 variantId 相同（差异计算必须按变体汇总）
        expect(r.linesByWave[0].map((l) => l.variantId)).toEqual([11, 11]);
    });

    it('同变体多账面行按 variantId 归并求和；includeZeroBook=false 时 0 库存不入清单', () => {
        const r = buildExpected({
            binMode: 'off',
            bookRows: [{ variantId: 11, quantity: 2 }, { variantId: 11, quantity: 3 }, { variantId: 22, quantity: 0 }],
            bindRows: [], variantMeta, zoneMeta, scope,
        });
        expect(r.linesByWave[0]).toHaveLength(1);
        expect(r.linesByWave[0][0].bookQty).toBe(5);
    });

    it('scope.variantIds 限定变体集合（专项盘）；scope.zones 之外的绑定退入未归位桶而不丢行', () => {
        const r = buildExpected({
            binMode: 'bin',
            bookRows: [{ variantId: 11, quantity: 5 }, { variantId: 22, quantity: 3 }],
            bindRows: [
                { variantId: 11, zoneId: 2, binId: 201 },
                { variantId: 22, zoneId: 1, binId: 101 },
            ],
            variantMeta, zoneMeta,
            scope: { ...scope, zones: [1], variantIds: [22] },
        });
        expect(r.waves.map((w) => w.scopeType)).toEqual(['zone']);
        expect(r.linesByWave[0].map((l) => l.variantId)).toEqual([22]);
    });

    it('zone 档绑定只有 zoneId（binId 为 null）时行与盘次仍正确', () => {
        const r = buildExpected({
            binMode: 'zone',
            bookRows: [{ variantId: 11, quantity: 5 }],
            bindRows: [{ variantId: 11, zoneId: 1, binId: null }],
            variantMeta, zoneMeta, scope,
        });
        expect(r.waves[0].scopeType).toBe('zone');
        expect(r.waves[0].zoneCode).toBe('A');
        expect(r.linesByWave[0][0].binId).toBeNull();
    });
});

describe('差异汇总（规格 §6.2，R11 按变体汇总）', () => {
    const currentBook = [{ variantId: 11, quantity: 4 }];

    it('同一变体多行 → 汇总相减，绝不逐行相减', () => {
        const r = summarizeVariance(
            [
                { id: 1, variantId: 11, countedQty: 3, isExtra: false, bookQty: 4, zoneId: 1, binId: 101 },
                { id: 2, variantId: 11, countedQty: 2, isExtra: false, bookQty: 4, zoneId: 1, binId: 102 },
            ],
            currentBook,
            [{ variantId: 11, zoneId: 1, binId: 101 }],
        );
        expect(r.byVariant).toHaveLength(1);
        expect(r.byVariant[0].countedTotal).toBe(5);
        expect(r.byVariant[0].diff).toBe(1); // 5 - 4，不是 (3-4)+(2-4)
    });

    it('盘盈行计入实盘、账面按 0；未盘行不计入实盘但必须列出', () => {
        const r = summarizeVariance(
            [
                { id: 1, variantId: 11, countedQty: null, isExtra: false, bookQty: 4, zoneId: 1, binId: 101 },
                { id: 2, variantId: 22, countedQty: 2, isExtra: true, bookQty: 0, zoneId: null, binId: null },
            ],
            currentBook,
            [],
        );
        expect(r.uncountedLineIds).toEqual([1]);
        expect(r.extraLineIds).toEqual([2]);
        const v22 = r.byVariant.find((v) => v.variantId === 22)!;
        expect(v22.diff).toBe(2);
        const v11 = r.byVariant.find((v) => v.variantId === 11)!;
        expect(v11.countedTotal).toBe(0);
        expect(v11.diff).toBe(-4); // 未盘行不计实盘，但差异仍按 0-4 体现（过账前需 confirm 跳过）
    });

    it('账面快照与当前账面不一致 → recheck 并列出变动变体', () => {
        const r = summarizeVariance(
            [{ id: 1, variantId: 11, countedQty: 4, isExtra: false, bookQty: 5, zoneId: 1, binId: 101 }],
            currentBook,
            [{ variantId: 11, zoneId: 1, binId: 101 }],
        );
        expect(r.recheck).toBe(true);
        expect(r.changedVariants).toEqual([{ variantId: 11, snapBookQty: 5, currentBookQty: 4 }]);
        expect(r.byVariant[0].diff).toBe(0); // 以当前账面重算 → 无差异
    });

    it('实盘所在格 ≠ 当前绑定 → binChanged（过账时顺手归位）', () => {
        const r = summarizeVariance(
            [{ id: 1, variantId: 11, countedQty: 4, isExtra: false, bookQty: 4, zoneId: 1, binId: 999 }],
            currentBook,
            [{ variantId: 11, zoneId: 1, binId: 101 }],
        );
        expect(r.byVariant[0].diff).toBe(0);
        expect(r.byVariant[0].binChanged).toBe(true);
        expect(r.byVariant[0].targetBinId).toBe(999);
    });

    it('variantSnapBook 取非盘盈行的账面快照', () => {
        const m = variantSnapBook([
            { id: 1, variantId: 11, countedQty: null, isExtra: false, bookQty: 7, zoneId: null, binId: null },
            { id: 2, variantId: 11, countedQty: 1, isExtra: true, bookQty: 0, zoneId: null, binId: null },
        ]);
        expect(m.get(11)).toBe(7);
    });
});

describe('过账计划（规格 §6.3）', () => {
    it('只对有差异或库位变更的变体生成项；无变化不生成', () => {
        const summary = summarizeVariance(
            [
                { id: 1, variantId: 11, countedQty: 6, isExtra: false, bookQty: 4, zoneId: 1, binId: 101 },
                { id: 2, variantId: 22, countedQty: 3, isExtra: false, bookQty: 3, zoneId: 1, binId: 102 },
                { id: 3, variantId: 33, countedQty: 2, isExtra: true, bookQty: 0, zoneId: null, binId: null },
            ],
            [{ variantId: 11, quantity: 4 }, { variantId: 22, quantity: 3 }],
            [{ variantId: 11, zoneId: 1, binId: 101 }, { variantId: 22, zoneId: 1, binId: 102 }],
        );
        const plan = buildPostItems({ summary, stockLocationId: 5 });
        expect(plan.items.map((i) => i.variantId).sort()).toEqual([11, 33]);
        expect(plan.items.find((i) => i.variantId === 11)).toEqual({
            variantId: 11, toStockLocationId: 5, realQty: 6, zoneId: 1, binId: 101,
        });
        expect(plan.items.find((i) => i.variantId === 33)!.realQty).toBe(2);
    });

    it('无差异但库位变更 → 生成项，realQty 取当前账面（触发归位而不动数量）', () => {
        const summary = summarizeVariance(
            [{ id: 1, variantId: 22, countedQty: 3, isExtra: false, bookQty: 3, zoneId: 2, binId: 201 }],
            [{ variantId: 22, quantity: 3 }],
            [{ variantId: 22, zoneId: 1, binId: 101 }],
        );
        const plan = buildPostItems({ summary, stockLocationId: 5 });
        expect(plan.items).toHaveLength(1);
        expect(plan.items[0]).toEqual({
            variantId: 22, toStockLocationId: 5, realQty: 3, zoneId: 2, binId: 201,
        });
    });
});

describe('扫码解析（规格 §8.3 优先级）', () => {
    const ctx = {
        bins: [{ binId: 101, binCode: 'A-01-01', zoneId: 1 }],
        lines: [{ lineId: 7, variantId: 11, sku: 'SKU-A', barcode: '6901111111111', internalCode: 'IN-A' }],
        variants: [{ variantId: 99, sku: 'SKU-X', barcode: '6909999999999', internalCode: 'IN-X' }],
    };

    it('库位码优先：切格', () => {
        expect(resolveScanCode('A-01-01', ctx)).toEqual({ kind: 'bin', binId: 101, binCode: 'A-01-01', zoneId: 1 });
    });

    it('内部码 / 条形码 / SKU 均能命中断行', () => {
        expect(resolveScanCode('IN-A', ctx)).toMatchObject({ kind: 'line', lineId: 7, variantId: 11 });
        expect(resolveScanCode('6901111111111', ctx)).toMatchObject({ kind: 'line', lineId: 7, variantId: 11 });
        expect(resolveScanCode('SKU-A', ctx)).toMatchObject({ kind: 'line', lineId: 7, variantId: 11 });
    });

    it('清单内变体优先于清单外同码变体（避免误判盘盈）', () => {
        const dup = {
            bins: ctx.bins,
            lines: [{ lineId: 7, variantId: 11, sku: 'DUP', barcode: null, internalCode: null }],
            variants: [{ variantId: 99, sku: 'DUP', barcode: null, internalCode: null }],
        };
        expect(resolveScanCode('DUP', dup)).toMatchObject({ kind: 'line', lineId: 7 });
    });

    it('清单外但可识别变体 → extra（允许登记盘盈）', () => {
        expect(resolveScanCode('6909999999999', ctx)).toEqual({ kind: 'extra', variantId: 99, sku: 'SKU-X', name: undefined });
    });

    it('完全无法识别 → none（前端提示条码未登记）', () => {
        expect(resolveScanCode('XXX-UNKNOWN', ctx)).toEqual({ kind: 'none', raw: 'XXX-UNKNOWN' });
        expect(resolveScanCode('   ', ctx)).toEqual({ kind: 'none', raw: '' });
    });
});
```

- [ ] **Step 4: 跑测试确认失败**

```powershell
npx vitest run src/stocktake/stocktake-math.spec.ts
```

预期：FAIL（同一模块尚不存在）。

- [ ] **Step 5: 写实现**

```ts
// src/stocktake/stocktake-math.ts
/**
 * 盘库纯函数层：状态机 / 任务号 / 应盘清单生成 / 差异汇总 / 扫码解析 / 过账计划。
 * 全部无副作用、无 DB，供 service 与单测共用（规格 §6 全部落在这里）。
 */
import type { StocktakeScopeType, StocktakeTaskState, StocktakeWaveState } from './stocktake-task.entity';

export type { StocktakeTaskState, StocktakeWaveState, StocktakeScopeType };

export type BinMode = 'off' | 'zone' | 'bin';

export const TASK_STATES: StocktakeTaskState[] = ['DRAFT', 'OPEN', 'COUNTING', 'COUNTED', 'POSTED', 'CANCELLED'];
export const WAVE_STATES: StocktakeWaveState[] = ['OPEN', 'CLAIMED', 'COUNTING', 'SUBMITTED', 'CANCELLED'];

const TASK_EDGES: Record<StocktakeTaskState, StocktakeTaskState[]> = {
    DRAFT: ['OPEN', 'CANCELLED'],
    OPEN: ['COUNTING', 'COUNTED', 'CANCELLED'],
    COUNTING: ['COUNTED', 'CANCELLED'],
    COUNTED: ['POSTED', 'CANCELLED'],
    POSTED: [],
    CANCELLED: [],
};

const WAVE_EDGES: Record<StocktakeWaveState, StocktakeWaveState[]> = {
    OPEN: ['CLAIMED', 'CANCELLED'],
    CLAIMED: ['COUNTING', 'OPEN', 'CANCELLED'],   // → OPEN 即「释放」（清空负责人）
    COUNTING: ['SUBMITTED', 'OPEN', 'CANCELLED'], // → OPEN 即「释放」（清空负责人）
    SUBMITTED: [],
    CANCELLED: [],
};

export function canTaskTransition(from: StocktakeTaskState, to: StocktakeTaskState): boolean {
    return (TASK_EDGES[from] || []).includes(to);
}

export function canWaveTransition(from: StocktakeWaveState, to: StocktakeWaveState): boolean {
    return (WAVE_EDGES[from] || []).includes(to);
}

/** 任务号：TK + yyyymmdd + 三位流水 */
export function formatTaskCode(now: Date, seq: number): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `TK${y}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/** 从既有任务号里取当日最大流水 +1（跨渠道各算各的，调用方传入本渠道的号） */
export function nextTaskSeq(codes: string[], now: Date): number {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `TK${y}${m}${d}-`;
    let max = 0;
    for (const code of codes) {
        if (!code || !code.startsWith(prefix)) continue;
        const n = Number.parseInt(code.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max + 1;
}

// ---------------------------------------------------------------- 应盘清单

export interface StocktakeScope {
    /** 限定盘次集合（库区 id）；空数组 = 全部库区 */
    zones: number[];
    /** 分类限定；**由 service 先解析成 variantIds 再合并进 variantIds**，纯函数不碰商品数据 */
    categoryIds: number[];
    /** 限定变体集合（专项盘）；空数组 = 不限 */
    variantIds: number[];
    includeZeroBook: boolean;
}

export interface BookRow { variantId: number; quantity: number; }
export interface BindRow { variantId: number; zoneId: number; binId: number | null; zoneCode?: string | null; binCode?: string | null; }
export interface VariantMeta { sku: string; name: string; }
export interface ZoneMeta { code: string; name: string; }

export interface ExpectedLine {
    variantId: number;
    variantSku: string;
    variantName: string;
    zoneId: number | null;
    binId: number | null;
    zoneCode: string | null;
    binCode: string | null;
    bookQty: number;
}

export interface ExpectedWave {
    scopeType: StocktakeScopeType;
    zoneId: number | null;
    zoneCode: string | null;
    zoneName: string | null;
    expectedCount: number;
}

export interface BuildExpectedInput {
    binMode: BinMode;
    bookRows: BookRow[];
    bindRows: BindRow[];
    variantMeta: Map<number, VariantMeta>;
    zoneMeta: Map<number, ZoneMeta>;
    scope: StocktakeScope;
}

export interface BuildExpectedResult {
    waves: ExpectedWave[];
    /** 与 waves 同序同长：linesByWave[i] 属于 waves[i] */
    linesByWave: ExpectedLine[][];
}

/**
 * 应盘清单 = 已归位 ∪ 有账面（规格 §3.4/§6.1）。
 * - bookRows 先按 variantId 归并求和（同变体多库存行）
 * - 有绑定 → 每个 (zoneId, binId) 一行；无绑定 → 未归位桶
 * - scope.zones 之外的绑定 → 也退入未归位桶（**不丢行**）
 * - binMode=off → 只建一个 whole 盘次，库位一律为空
 */
export function buildExpected(input: BuildExpectedInput): BuildExpectedResult {
    const { binMode, bookRows, bindRows, variantMeta, zoneMeta, scope } = input;

    const book = new Map<number, number>();
    for (const r of bookRows) {
        book.set(r.variantId, (book.get(r.variantId) || 0) + (r.quantity || 0));
    }
    if (!scope.includeZeroBook) {
        for (const [variantId, qty] of Array.from(book.entries())) {
            if (qty <= 0) book.delete(variantId);
        }
    }

    const bindByVariant = new Map<number, BindRow[]>();
    for (const b of bindRows) {
        const list = bindByVariant.get(b.variantId) || [];
        list.push(b);
        bindByVariant.set(b.variantId, list);
    }

    const scopeVariants = scope.variantIds.length ? new Set(scope.variantIds) : null;
    const scopeZones = scope.zones.length ? new Set(scope.zones) : null;

    const candidates = new Set<number>([...book.keys(), ...bindByVariant.keys()]);
    const meta = (variantId: number): VariantMeta => variantMeta.get(variantId) || { sku: `#${variantId}`, name: '' };
    const bookOf = (variantId: number) => book.get(variantId) || 0;

    // waveKey: 'zone:{id}' | 'unassigned' | 'whole'
    const groups = new Map<string, { wave: ExpectedWave; lines: ExpectedLine[] }>();

    const ensureGroup = (key: string, make: () => ExpectedWave) => {
        let g = groups.get(key);
        if (!g) {
            g = { wave: make(), lines: [] };
            groups.set(key, g);
        }
        return g;
    };

    for (const variantId of Array.from(candidates).sort((a, b) => a - b)) {
        if (scopeVariants && !scopeVariants.has(variantId)) continue;
        const m = meta(variantId);
        const bookQty = bookOf(variantId);
        const binds = (bindByVariant.get(variantId) || []).filter((b) => !scopeZones || scopeZones.has(b.zoneId));

        if (binMode === 'off') {
            const g = ensureGroup('whole', () => ({
                scopeType: 'whole', zoneId: null, zoneCode: null, zoneName: null, expectedCount: 0,
            }));
            g.lines.push({
                variantId, variantSku: m.sku, variantName: m.name,
                zoneId: null, binId: null, zoneCode: null, binCode: null, bookQty,
            });
            continue;
        }

        if (!binds.length) {
            const g = ensureGroup('unassigned', () => ({
                scopeType: 'unassigned', zoneId: null, zoneCode: null, zoneName: null, expectedCount: 0,
            }));
            g.lines.push({
                variantId, variantSku: m.sku, variantName: m.name,
                zoneId: null, binId: null, zoneCode: null, binCode: null, bookQty,
            });
            continue;
        }

        for (const b of binds) {
            const zm = zoneMeta.get(b.zoneId);
            const g = ensureGroup(`zone:${b.zoneId}`, () => ({
                scopeType: 'zone',
                zoneId: b.zoneId,
                zoneCode: b.zoneCode ?? zm?.code ?? null,
                zoneName: zm?.name ?? null,
                expectedCount: 0,
            }));
            g.lines.push({
                variantId, variantSku: m.sku, variantName: m.name,
                zoneId: b.zoneId, binId: b.binId,
                zoneCode: b.zoneCode ?? zm?.code ?? null, binCode: b.binCode ?? null,
                bookQty,
            });
        }
    }

    const keys = Array.from(groups.keys()).sort((a, b) => {
        const rank = (k: string) => (k === 'whole' ? 0 : k === 'unassigned' ? 2 : 1);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const na = Number(a.split(':')[1] || 0);
        const nb = Number(b.split(':')[1] || 0);
        return na - nb;
    });

    const waves: ExpectedWave[] = [];
    const linesByWave: ExpectedLine[][] = [];
    for (const key of keys) {
        const g = groups.get(key)!;
        g.wave.expectedCount = g.lines.length;
        waves.push(g.wave);
        linesByWave.push(g.lines);
    }
    return { waves, linesByWave };
}

// ---------------------------------------------------------------- 差异汇总

export interface VarianceInputLine {
    id: number;
    variantId: number;
    countedQty: number | null;
    isExtra: boolean;
    bookQty: number;
    zoneId: number | null;
    binId: number | null;
}

export interface VariantVariance {
    variantId: number;
    countedTotal: number;
    bookQty: number;
    snapBookQty: number;
    diff: number;
    isExtra: boolean;
    binChanged: boolean;
    targetZoneId: number | null;
    targetBinId: number | null;
}

export interface VarianceSummary {
    expectedTotal: number;
    countedLineCount: number;
    uncountedCount: number;
    extraCount: number;
    byVariant: VariantVariance[];
    uncountedLineIds: number[];
    extraLineIds: number[];
    changedVariants: { variantId: number; snapBookQty: number; currentBookQty: number }[];
    recheck: boolean;
}

/** 非盘盈行的账面快照（同变体各行相同，取首个） */
export function variantSnapBook(lines: VarianceInputLine[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const l of lines) {
        if (l.isExtra) continue;
        if (!m.has(l.variantId)) m.set(l.variantId, l.bookQty);
    }
    return m;
}

/**
 * 差异汇总（规格 §6.2）：**以变体为最小比对单位**。
 * 实盘合计 = SUM(countedQty)（含盘盈行，未盘行不计入）；盈亏 = 实盘合计 - 当前账面。
 */
export function summarizeVariance(
    lines: VarianceInputLine[],
    currentBook: BookRow[],
    currentBind: BindRow[],
): VarianceSummary {
    const bookMap = new Map<number, number>();
    for (const r of currentBook) bookMap.set(r.variantId, (bookMap.get(r.variantId) || 0) + (r.quantity || 0));
    const bindMap = new Map<number, BindRow>();
    for (const b of currentBind) bindMap.set(b.variantId, b);
    const snap = variantSnapBook(lines);

    const grouped = new Map<number, VarianceInputLine[]>();
    for (const l of lines) {
        const list = grouped.get(l.variantId) || [];
        list.push(l);
        grouped.set(l.variantId, list);
    }

    const uncountedLineIds: number[] = [];
    const extraLineIds: number[] = [];
    const byVariant: VariantVariance[] = [];
    const changedVariants: VarianceSummary['changedVariants'] = [];

    for (const l of lines) {
        if (l.isExtra) extraLineIds.push(l.id);
        else if (l.countedQty === null) uncountedLineIds.push(l.id);
    }

    for (const variantId of Array.from(grouped.keys()).sort((a, b) => a - b)) {
        const rows = grouped.get(variantId)!;
        const countedTotal = rows.reduce((s, l) => s + (l.countedQty === null ? 0 : l.countedQty), 0);
        const currentBookQty = bookMap.get(variantId) || 0;
        const snapBookQty = snap.get(variantId) || 0;
        const diff = countedTotal - currentBookQty;

        // 目标库位 = 最后一条「已盘且带库位」的行
        const located = rows.filter((l) => l.countedQty !== null && (l.zoneId !== null || l.binId !== null));
        const target = located.length ? located[located.length - 1] : null;
        const cur = bindMap.get(variantId) || null;
        const binChanged = !!target && (
            !cur ||
            (cur.zoneId ?? null) !== (target.zoneId ?? null) ||
            (cur.binId ?? null) !== (target.binId ?? null)
        );

        const isExtra = rows.every((l) => l.isExtra);
        if (diff !== 0 || binChanged || isExtra) {
            byVariant.push({
                variantId, countedTotal, bookQty: currentBookQty, snapBookQty, diff, isExtra, binChanged,
                targetZoneId: target ? target.zoneId ?? null : null,
                targetBinId: target ? target.binId ?? null : null,
            });
        }
        if (currentBookQty !== snapBookQty) {
            changedVariants.push({ variantId, snapBookQty, currentBookQty });
        }
    }

    return {
        expectedTotal: lines.filter((l) => !l.isExtra).length,
        countedLineCount: lines.filter((l) => !l.isExtra && l.countedQty !== null).length,
        uncountedCount: uncountedLineIds.length,
        extraCount: extraLineIds.length,
        byVariant,
        uncountedLineIds,
        extraLineIds,
        changedVariants,
        recheck: changedVariants.length > 0,
    };
}

// ---------------------------------------------------------------- 过账计划

export interface PostPlanItem {
    variantId: number;
    toStockLocationId: number;
    realQty: number;
    zoneId: number | null;
    binId: number | null;
}

export interface PostPlan { items: PostPlanItem[]; }

/**
 * 过账项（规格 §6.3 步骤 5）：
 * - 有差异 → realQty = 实盘合计
 * - 无差异但库位变更 → realQty = 当前账面（仅触发原地归位，不动数量）
 * - 两者都不是 → 不生成项
 */
export function buildPostItems(input: { summary: VarianceSummary; stockLocationId: number }): PostPlan {
    const { summary, stockLocationId } = input;
    const items: PostPlanItem[] = [];
    for (const v of summary.byVariant) {
        if (v.diff === 0 && !v.binChanged) continue;
        items.push({
            variantId: v.variantId,
            toStockLocationId: stockLocationId,
            realQty: v.diff === 0 ? v.bookQty : v.countedTotal,
            zoneId: v.targetZoneId,
            binId: v.targetBinId,
        });
    }
    return { items };
}

// ---------------------------------------------------------------- 扫码解析

export interface ScanBin { binId: number; binCode: string; zoneId: number; }
export interface ScanLine { lineId: number; variantId: number; sku: string; barcode: string | null; internalCode: string | null; }
export interface ScanVariant { variantId: number; sku: string; barcode: string | null; internalCode: string | null; name?: string; }

export type ScanHit =
    | { kind: 'bin'; binId: number; binCode: string; zoneId: number }
    | { kind: 'line'; lineId: number; variantId: number }
    | { kind: 'extra'; variantId: number; sku: string; name?: string }
    | { kind: 'none'; raw: string };

/**
 * 扫码解析优先级（规格 §8.3）：库位码 → 内部码 → 条形码 → SKU → 未命中。
 * 命中的永远是「任务内应盘行」优先，其次才是清单外变体（避免把清单内变体误登记为盘盈）。
 */
export function resolveScanCode(raw: string, ctx: { bins: ScanBin[]; lines: ScanLine[]; variants: ScanVariant[] }): ScanHit {
    const code = (raw || '').trim();
    if (!code) return { kind: 'none', raw: '' };

    const bin = ctx.bins.find((b) => b.binCode === code);
    if (bin) return { kind: 'bin', binId: bin.binId, binCode: bin.binCode, zoneId: bin.zoneId };

    const hitLine = (v: ScanLine | ScanVariant): boolean => v.internalCode === code || v.barcode === code || v.sku === code;

    const line = ctx.lines.find(hitLine);
    if (line) return { kind: 'line', lineId: line.lineId, variantId: line.variantId };

    const variant = ctx.variants.find(hitLine);
    if (variant) return { kind: 'extra', variantId: variant.variantId, sku: variant.sku, name: variant.name };

    return { kind: 'none', raw: code };
}
```

**注意**：`resolveScanCode` 的 `extra` 分支里 `name: variant.name` 在测试中标注为 `name: undefined`（测试的 ctx 未给 name）—— 若实现返回 `{variantId,sku,name:undefined}`，`toEqual({kind:'extra',variantId:99,sku:'SKU-X',name:undefined})` 在 vitest 下通过（`toEqual` 忽略 undefined 属性）。若想严格，把该断言改为 `toMatchObject({kind:'extra',variantId:99,sku:'SKU-X'})`；**实施时按后者写，更稳**。

- [ ] **Step 6: 跑测试确认通过**

```powershell
npx vitest run src/stocktake/stocktake-math.spec.ts
```

预期：PASS（16 个用例全绿）。

- [ ] **Step 7: 提交**

```bash
git add packages/cjk-plugin/src/stocktake
git commit -m "feat(stocktake): 盘库纯函数（状态机/任务号/应盘清单/差异汇总/扫码/过账计划）"
```

（cwd: `d:\zhao\vendure`；本 Task 只有 `src` 变更，`lib` 由 Task 6 统一 build 后一起提交也可 —— 但**推荐每 Task 都 build**，避免积压）

---

## Task 3：库位 → SKU 反向查询（`variantBinsByLocation` + `binOccupancy`）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\storage\bin-query.math.ts`
- Test: `d:\zhao\vendure\packages\cjk-plugin\src\storage\bin-query.math.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\storage\storage-bin.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\storage\storage-bin.admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（storage admin SDL 块内追加 `extend type Query`）

**实现口径（重要，先看）**：明细查询走「**一次 SQL 取本仓全部绑定行 + 一次 `In(variantIds)` 补商品字段 → JS 侧过滤/排序/分页**」。
理由有三：① 建任务本身就要全量读绑定（规格 §6.1 步骤 2），量级天然有界；② 与库位管理页、配货台的既有做法（仓储查询 + JS 聚合，方言无关）一致，sqlite/postgres 行为相同；③ 让过滤/排序/分页全部落在**可无 DB 单测的纯函数**里（总数的正确性不靠 SQL 方言）。`binOccupancy` **复用既有 `binBindCounts()`**，聚合逻辑零新增。

- [ ] **Step 1: 写失败的纯函数单测**

```ts
// src/storage/bin-query.math.spec.ts
import { describe, expect, it } from 'vitest';
import {
    assertZoneBinMatch, buildOccupancyRows, clampPageSize, filterVariantBins,
    matchKeyword, normalizePage, paginate, sortVariantBins, type VariantBinRow,
} from './bin-query.math';

const row = (p: Partial<VariantBinRow>): VariantBinRow => ({
    bindingId: 1, variantId: 11, sku: 'SKU-A', variantName: '甲', barcode: null, internalCode: null,
    zoneId: 1, zoneCode: 'A', zoneName: 'A 区', zoneSortOrder: 1, binId: 101, binCode: 'A-01-01',
    rowNo: 1, levelNo: 1, isDefault: false, ...p,
});

describe('分页与归属校验', () => {
    it('pageSize 默认 50、上限 200、非法值回落默认', () => {
        expect(clampPageSize(undefined)).toBe(50);
        expect(clampPageSize(0)).toBe(50);
        expect(clampPageSize(-3)).toBe(50);
        expect(clampPageSize(10)).toBe(10);
        expect(clampPageSize(9999)).toBe(200);
    });

    it('page 默认 1、非法值回落 1', () => {
        expect(normalizePage(undefined)).toBe(1);
        expect(normalizePage(0)).toBe(1);
        expect(normalizePage(3)).toBe(3);
    });

    it('zoneId + binId 不匹配 → 回传明确原因；匹配或未传 → null', () => {
        expect(assertZoneBinMatch(undefined, undefined, null)).toBeNull();
        expect(assertZoneBinMatch(1, 101, 1)).toBeNull();
        expect(assertZoneBinMatch(1, 201, 2)).toContain('库位');
        expect(assertZoneBinMatch(1, 999, null)).toContain('库位');
    });
});

describe('过滤 / 排序 / 分页', () => {
    const rows = [
        row({ bindingId: 1, variantId: 11, sku: 'SKU-B', zoneId: 1, binId: 102, rowNo: 1, levelNo: 2 }),
        row({ bindingId: 2, variantId: 22, sku: 'SKU-A', zoneId: 1, binId: 101, rowNo: 1, levelNo: 1 }),
        row({ bindingId: 3, variantId: 33, sku: 'SKU-C', zoneId: 2, binId: 201, zoneSortOrder: 2, rowNo: 1, levelNo: 1 }),
    ];

    it('keyword 前缀匹配 sku / barcode / internalCode（大小写不敏感）', () => {
        expect(matchKeyword(row({ sku: 'ABC-1' }), 'abc')).toBe(true);
        expect(matchKeyword(row({ barcode: '690111' }), '690')).toBe(true);
        expect(matchKeyword(row({ internalCode: 'IN-X' }), 'in-')).toBe(true);
        expect(matchKeyword(row({ sku: 'ABC-1' }), 'zzz')).toBe(false);
        expect(matchKeyword(row({ sku: 'ABC-1' }), '')).toBe(true);
    });

    it('过滤：zoneId / binId / keyword 逐级收窄', () => {
        expect(filterVariantBins(rows, { zoneId: 1 }).map((r) => r.bindingId)).toEqual([1, 2]);
        expect(filterVariantBins(rows, { binId: 201 }).map((r) => r.bindingId)).toEqual([3]);
        expect(filterVariantBins(rows, { keyword: 'SKU-A' }).map((r) => r.bindingId)).toEqual([2]);
    });

    it('排序：zone.sortOrder → rowNo → levelNo → sku', () => {
        expect(sortVariantBins(rows).map((r) => r.bindingId)).toEqual([2, 1, 3]);
    });

    it('分页：totalItems 为过滤后总数，items 为当前页', () => {
        const p = paginate(sortVariantBins(rows), 1, 2);
        expect(p.totalItems).toBe(3);
        expect(p.items.map((r) => r.bindingId)).toEqual([2, 1]);
        const p2 = paginate(sortVariantBins(rows), 2, 2);
        expect(p2.items.map((r) => r.bindingId)).toEqual([3]);
    });
});

describe('库位占用概览', () => {
    it('含空格（skuCount=0），并复用同样的排序键', () => {
        const bins = [
            { zoneId: 1, zoneCode: 'A', zoneName: 'A 区', zoneSortOrder: 1, binId: 101, binCode: 'A-01-01', rowNo: 1, levelNo: 1 },
            { zoneId: 1, zoneCode: 'A', zoneName: 'A 区', zoneSortOrder: 1, binId: 102, binCode: 'A-01-02', rowNo: 1, levelNo: 2 },
        ];
        const out = buildOccupancyRows(bins, new Map([[101, 2]]));
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ binId: 101, skuCount: 2 });
        expect(out[1]).toMatchObject({ binId: 102, skuCount: 0 });
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/storage/bin-query.math.spec.ts
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：FAIL，`Cannot find module './bin-query.math'`。

- [ ] **Step 3: 写实现**

```ts
// src/storage/bin-query.math.ts
/**
 * 「库位 → SKU」反向查询的纯函数层（规格 §7.1）。
 * 过滤 / 排序 / 分页 / 占用归并全部在此，service 只负责取数与补水，便于无 DB 单测。
 */

export const BIN_PAGE_DEFAULT = 50;
export const BIN_PAGE_MAX = 200;

export interface VariantBinRow {
    bindingId: number;
    variantId: number;
    sku: string;
    variantName: string;
    barcode: string | null;
    internalCode: string | null;
    zoneId: number;
    zoneCode: string;
    zoneName: string;
    zoneSortOrder: number;
    binId: number | null;
    binCode: string | null;
    rowNo: number | null;
    levelNo: number | null;
    isDefault: boolean;
}

export interface BinRowInput {
    zoneId: number;
    zoneCode: string;
    zoneName: string;
    zoneSortOrder: number;
    binId: number;
    binCode: string;
    rowNo: number | null;
    levelNo: number | null;
}

export interface BinOccupancyRow {
    zoneId: number;
    zoneCode: string;
    zoneName: string;
    binId: number;
    binCode: string;
    rowNo: number | null;
    levelNo: number | null;
    skuCount: number;
}

export function clampPageSize(pageSize?: number | null): number {
    if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) return BIN_PAGE_DEFAULT;
    return Math.min(Math.floor(pageSize), BIN_PAGE_MAX);
}

export function normalizePage(page?: number | null): number {
    if (!page || !Number.isFinite(page) || page <= 0) return 1;
    return Math.floor(page);
}

/** `zoneId` + `binId` 同时传入时校验从属关系；返回错误原因（null = 通过） */
export function assertZoneBinMatch(zoneId?: number | null, binId?: number | null, binZoneId?: number | null): string | null {
    if (binId === undefined || binId === null) return null;
    if (binZoneId === undefined || binZoneId === null) {
        return `库位 #${binId} 不存在或已被删除`;
    }
    if (zoneId !== undefined && zoneId !== null && String(binZoneId) !== String(zoneId)) {
        return `库位 #${binId} 不属于库区 #${zoneId}`;
    }
    return null;
}

/** 前缀匹配 sku / barcode / internalCode（大小写不敏感；空关键词恒真） */
export function matchKeyword(row: VariantBinRow, keyword?: string | null): boolean {
    const k = (keyword || '').trim().toLowerCase();
    if (!k) return true;
    const fields = [row.sku, row.barcode, row.internalCode];
    return fields.some((f) => !!f && f.toLowerCase().startsWith(k));
}

export function filterVariantBins(
    rows: VariantBinRow[],
    filter: { zoneId?: number | null; binId?: number | null; keyword?: string | null; includeDisabled?: boolean },
): VariantBinRow[] {
    return rows.filter((r) => {
        if (filter.zoneId !== undefined && filter.zoneId !== null && String(r.zoneId) !== String(filter.zoneId)) return false;
        if (filter.binId !== undefined && filter.binId !== null && String(r.binId) !== String(filter.binId)) return false;
        return matchKeyword(r, filter.keyword);
    });
}

/** 与库位管理页一致的排序键：zone.sortOrder → rowNo → levelNo → sku */
export function sortVariantBins(rows: VariantBinRow[]): VariantBinRow[] {
    return rows.slice().sort((a, b) => {
        if (a.zoneSortOrder !== b.zoneSortOrder) return a.zoneSortOrder - b.zoneSortOrder;
        const ar = a.rowNo || 0;
        const br = b.rowNo || 0;
        if (ar !== br) return ar - br;
        const al = a.levelNo || 0;
        const bl = b.levelNo || 0;
        if (al !== bl) return al - bl;
        return a.sku.localeCompare(b.sku);
    });
}

export function paginate<T>(rows: T[], page: number, pageSize: number): { totalItems: number; items: T[] } {
    const p = normalizePage(page);
    const size = clampPageSize(pageSize);
    return { totalItems: rows.length, items: rows.slice((p - 1) * size, p * size) };
}

/** 全部启用库位 + 占用数 → 概览（含空格，前端可直接渲染角标） */
export function buildOccupancyRows(bins: BinRowInput[], counts: Map<number, number>): BinOccupancyRow[] {
    return bins
        .map((b) => ({ ...b, skuCount: counts.get(b.binId) || 0 }))
        .sort((a, b) =>
            a.zoneSortOrder - b.zoneSortOrder ||
            (a.rowNo || 0) - (b.rowNo || 0) ||
            (a.levelNo || 0) - (b.levelNo || 0),
        );
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/storage/bin-query.math.spec.ts
```

预期：PASS（8 个用例全绿）。

- [ ] **Step 5: service 增加 4 个方法**

在 `src/storage/storage-bin.service.ts` 末尾追加（**先读该文件既有的 `tenantOf` / `resolveMode` / `bins()` / `binBindCounts()` 实现，照其风格与字段命名**）：

```ts
    /** 本仓全部绑定行 → 明细行（含商品字段），供 variantBinsByLocation 过滤/排序/分页 */
    private async loadVariantBinRows(ctx: RequestContext, stockLocationId: ID, includeDisabled = false) {
        const tenant = tenantOf(ctx);
        const bindings = await this.connection.getRepository(ctx, VariantStorageBin).find({
            where: { tenantChannelId: tenant, stockLocationId: Number(stockLocationId) },
        });
        const zones = await this.connection.getRepository(ctx, StorageZone).find({
            where: { tenantChannelId: tenant, stockLocationId: Number(stockLocationId) },
        });
        const bins = await this.connection.getRepository(ctx, StorageBin).find({
            where: { tenantChannelId: tenant, stockLocationId: Number(stockLocationId) },
        });
        const zoneById = new Map(zones.map((z) => [z.id as number, z]));
        const binById = new Map(bins.map((b) => [b.id as number, b]));
        const variantIds = Array.from(new Set(bindings.map((b) => Number(b.variantId))));
        const variants = variantIds.length
            ? await this.connection.getRepository(ctx, ProductVariant).find({ where: { id: In(variantIds) } })
            : [];
        const variantById = new Map(variants.map((v) => [v.id as number, v]));

        const rows: VariantBinRow[] = [];
        for (const binding of bindings) {
            const zone = zoneById.get(Number(binding.zoneId));
            const bin = binding.binId ? binById.get(Number(binding.binId)) : undefined;
            const variant = variantById.get(Number(binding.variantId));
            if (!variant) continue;                              // 变体被删 → 该行不出现
            if (!zone && !bin) continue;                         // 库区与库位都缺失 → 孤儿绑定，不出现
            if (!includeDisabled && ((zone && !zone.enabled) || (bin && !bin.enabled))) continue;
            const barcode = (variant.customFields as any)?.barcode ?? null;
            const internalCode = (variant.customFields as any)?.internalCode ?? null;
            rows.push({
                bindingId: binding.id as number,
                variantId: Number(binding.variantId),
                sku: variant.sku,
                variantName: variant.name || variant.sku,
                barcode, internalCode,
                zoneId: Number(binding.zoneId),
                zoneCode: zone?.code ?? '',
                zoneName: zone?.name ?? '',
                zoneSortOrder: (zone as any)?.sortOrder ?? 0,
                binId: bin ? (bin.id as number) : null,
                binCode: bin ? bin.code : null,
                rowNo: bin ? (bin as any).rowNo ?? null : null,
                levelNo: bin ? (bin as any).levelNo ?? null : null,
                isDefault: !!(binding as any).isDefault,
            });
        }
        return rows;
    }

    /** 库位/库区 → SKU 明细分页（规格 §7.1 接口 1） */
    async variantBinsByLocation(
        ctx: RequestContext,
        args: { stockLocationId: ID; zoneId?: ID; binId?: ID; keyword?: string; includeDisabled?: boolean; page?: number; pageSize?: number },
    ): Promise<{ totalItems: number; items: VariantBinRow[] }> {
        const binId = args.binId ? Number(args.binId) : null;
        if (binId !== null) {
            const bin = await this.connection.getRepository(ctx, StorageBin).findOne({
                where: { tenantChannelId: tenantOf(ctx), id: binId },
            });
            const err = assertZoneBinMatch(args.zoneId ? Number(args.zoneId) : null, binId, bin ? Number(bin.zoneId) : null);
            if (err) throw new UserInputError(err);
        }
        const rows = await this.loadVariantBinRows(ctx, args.stockLocationId, !!args.includeDisabled);
        const filtered = sortVariantBins(filterVariantBins(rows, {
            zoneId: args.zoneId ? Number(args.zoneId) : null,
            binId, keyword: args.keyword, includeDisabled: args.includeDisabled,
        }));
        return paginate(filtered, args.page ?? 1, args.pageSize ?? BIN_PAGE_DEFAULT);
    }

    /** 全部启用库位的占用概览（含空格，喂格子宫格；规格 §7.1 接口 2） */
    async binOccupancy(ctx: RequestContext, stockLocationId: ID, zoneId?: ID): Promise<BinOccupancyRow[]> {
        const tenant = tenantOf(ctx);
        const zoneWhere: any = { tenantChannelId: tenant, stockLocationId: Number(stockLocationId) };
        if (zoneId) zoneWhere.id = Number(zoneId);
        const zones = await this.connection.getRepository(ctx, StorageZone).find({ where: { ...zoneWhere, enabled: true } });
        const zoneIds = zones.map((z) => z.id as number);
        if (!zoneIds.length) return [];
        const bins = await this.connection.getRepository(ctx, StorageBin).find({
            where: { tenantChannelId: tenant, stockLocationId: Number(stockLocationId), zoneId: In(zoneIds) } as any,
        });
        const zoneById = new Map(zones.map((z) => [z.id as number, z]));
        const inputs: BinRowInput[] = bins
            .filter((b) => b.enabled)
            .map((b) => {
                const z = zoneById.get(Number(b.zoneId));
                return {
                    zoneId: Number(b.zoneId),
                    zoneCode: z?.code ?? '',
                    zoneName: z?.name ?? '',
                    zoneSortOrder: (z as any)?.sortOrder ?? 0,
                    binId: b.id as number,
                    binCode: b.code,
                    rowNo: (b as any).rowNo ?? null,
                    levelNo: (b as any).levelNo ?? null,
                };
            });
        const counts = await this.binBindCounts(ctx, stockLocationId);
        return buildOccupancyRows(inputs, counts);
    }
```

**注意（实施时逐条核对，不符就按实际改）**：
- `StorageZone` / `StorageBin` 是否真有 `enabled`、`sortOrder`、`rowNo`、`levelNo` 字段：`enabled/rowNo/levelNo` 在 `storage-bin.entity.ts` 已确认；`sortOrder` 若不存在，改用 `code` 排序并把 `zoneSortOrder` 传 `0`（**不要臆造字段**）。
- `StorageBin` 关联库区的外键属性名（`zoneId`）以实体实际为准。
- `variant.customFields.barcode / internalCode` 的读取方式：先跑一次 `npx vitest run` 通过后再起服，用 Step 7 的探针实测 `barcode` 是否非空；若为空，改用 `this.connection.getMetadata(ProductVariant)` 动态取自定义列名（照 Vendure 的 `customFields*` 列命名），并把结论写进代码注释。
- 若 `binBindCounts` 的签名是 `(ctx, stockLocationId: ID)` 且内部已 `Number()` 转换，直接传原值即可。

- [ ] **Step 6: resolver 暴露两个只读查询**

在 `src/storage/storage-bin.admin.resolver.ts` 追加（照该文件既有 `@Query() @Allow(Permission.ReadCatalog)` 风格）：

```ts
    @Query()
    @Allow(Permission.ReadCatalog)
    async variantBinsByLocation(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.storageBinService.variantBinsByLocation(ctx, args);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async binOccupancy(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.storageBinService.binOccupancy(ctx, args.stockLocationId, args.zoneId);
    }
```

在 `src/plugin.ts` 的 **storage admin SDL 块内**（既有 `extend type Query { storageZones storageBins variantBin }` 那一处，Task 0 Step 3 记下的行号附近）追加：

```graphql
            type VariantBinPage { totalItems: Int!, items: [VariantBinItem!]! }
            type VariantBinItem {
                bindingId: ID!
                variantId: ID!
                sku: String!
                variantName: String!
                barcode: String
                internalCode: String
                zoneId: ID!
                zoneCode: String!
                zoneName: String!
                binId: ID
                binCode: String
                rowNo: Int
                levelNo: Int
                isDefault: Boolean!
            }
            type BinOccupancy {
                zoneId: ID!
                zoneCode: String!
                zoneName: String!
                binId: ID!
                binCode: String!
                rowNo: Int
                levelNo: Int
                skuCount: Int!
            }
            extend type Query {
                variantBinsByLocation(stockLocationId: ID!, zoneId: ID, binId: ID, keyword: String, includeDisabled: Boolean, page: Int, pageSize: Int): VariantBinPage!
                binOccupancy(stockLocationId: ID!, zoneId: ID): [BinOccupancy!]!
            }
```

- [ ] **Step 7: 编译 + 起服 + 实测两个查询**

```powershell
npm run build
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）预期 exit 0。

起服（`npm run dev:server` + `npm run dev:worker`，cwd `packages/dev-server`），然后用 Task 6 的探针脚本（或先手工在 `http://localhost:3000/admin-api` 的 GraphQL Playground 用本地 superadmin 登录）跑：

```graphql
query {
  binOccupancy(stockLocationId: "1") { binId binCode skuCount }
  variantBinsByLocation(stockLocationId: "1", pageSize: 5) { totalItems items { variantId sku zoneCode binCode barcode } }
}
```

预期：`binOccupancy` 返回默认仓 **18 个格子**（含 `skuCount = 0` 的空格）；`variantBinsByLocation` 的 `totalItems` 与库位管理页绑定数一致；`barcode`/`internalCode` 能取到值（取不到就按 Step 5 的注意项修读法）。

- [ ] **Step 8: 提交**

```bash
git add packages/cjk-plugin/src/storage packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/lib
git commit -m "feat(storage): 新增库位→SKU 反向查询（variantBinsByLocation/binOccupancy）"
```

（cwd: `d:\zhao\vendure`）

---

## Task 4：盘库 Service（建任务固化清单 / 盘次独占 / 批量录入 / 提交取消）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-math.ts`（追加 3 个纯函数）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-math.spec.ts`（追加用例）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（`providers` 追加 `StocktakeService`）

- [ ] **Step 1: 写失败的「状态派生 + 独占锁」单测**

追加到 `src/stocktake/stocktake-math.spec.ts`：

```ts
describe('状态派生与独占锁（规格 §5/§3.6）', () => {
    it('盘次有录入即进入 COUNTING；已 SUBMITTED 不回退', () => {
        expect(resolveWaveStateAfterCount('OPEN', 1)).toBe('COUNTING');
        expect(resolveWaveStateAfterCount('CLAIMED', 2)).toBe('COUNTING');
        expect(resolveWaveStateAfterCount('SUBMITTED', 2)).toBe('SUBMITTED');
        expect(resolveWaveStateAfterCount('CANCELLED', 0)).toBe('CANCELLED');
    });

    it('全部盘次 SUBMITTED/CANCELLED → 任务 COUNTED；仍有未提交 → COUNTING', () => {
        expect(resolveTaskStateAfterWaves('OPEN', [{ state: 'SUBMITTED' }, { state: 'CANCELLED' }])).toBe('COUNTED');
        expect(resolveTaskStateAfterWaves('COUNTING', [{ state: 'SUBMITTED' }, { state: 'COUNTING' }])).toBe('COUNTING');
        expect(resolveTaskStateAfterWaves('COUNTED', [{ state: 'SUBMITTED' }, { state: 'OPEN' }])).toBe('COUNTING');
        expect(resolveTaskStateAfterWaves('POSTED', [{ state: 'SUBMITTED' }])).toBe('POSTED');
        expect(resolveTaskStateAfterWaves('OPEN', [])).toBe('OPEN');
    });

    it('非负责人操作 → 回传含负责人姓名的原因；无人认领 → 要求先认领', () => {
        expect(waveOwnerError(null, '12', '张三')).toContain('认领');
        expect(waveOwnerError('12', '12', '张三')).toBeNull();
        expect(waveOwnerError('12', '99', '张三')).toContain('张三');
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx vitest run src/stocktake/stocktake-math.spec.ts
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

预期：FAIL，`resolveWaveStateAfterCount is not a function`。

- [ ] **Step 3: 追加 3 个纯函数**

追加到 `src/stocktake/stocktake-math.ts`：

```ts
/** 录入后盘次状态：有实盘即 COUNTING；终态不回退（幂等保护） */
export function resolveWaveStateAfterCount(current: StocktakeWaveState, countedCount: number): StocktakeWaveState {
    if (current === 'SUBMITTED' || current === 'CANCELLED') return current;
    return countedCount > 0 ? 'COUNTING' : current;
}

/** 盘次集合变化后任务状态：全部 SUBMITTED/CANCELLED → COUNTED；否则（已有盘次）COUNTING */
export function resolveTaskStateAfterWaves(
    current: StocktakeTaskState,
    waves: { state: StocktakeWaveState }[],
): StocktakeTaskState {
    if (current === 'POSTED' || current === 'CANCELLED') return current;
    if (!waves.length) return current === 'DRAFT' ? 'DRAFT' : current;
    const allDone = waves.every((w) => w.state === 'SUBMITTED' || w.state === 'CANCELLED');
    return allDone ? 'COUNTED' : 'COUNTING';
}

/** 盘次独占校验（规格 §3.6）：非负责人/未认领一律拒绝并回传原因 */
export function waveOwnerError(
    assigneeId: string | null | undefined,
    operatorId: string | null | undefined,
    assigneeName?: string | null,
): string | null {
    if (!assigneeId) return '该盘次尚未认领，请先认领后再操作';
    if (String(assigneeId) !== String(operatorId)) {
        return `该盘次已被 ${assigneeName || '其他人员'} 认领，无法操作`;
    }
    return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

```powershell
npx vitest run src/stocktake/stocktake-math.spec.ts
```

预期：PASS（19 个用例全绿）。

- [ ] **Step 5: 写 `StocktakeService` 骨架 + 建任务事务**

```ts
// src/stocktake/stocktake.service.ts
import {
    ID, Injector, Logger, RequestContext, TransactionalConnection, UserInputError,
    ProductVariant, StockLevel, StockLocation, Product, Channel, UserInputError as _UserInputError,
} from '@vendure/core';
import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { StocktakeLine } from './stocktake-line.entity';
import { StocktakeTask, StocktakeTaskState } from './stocktake-task.entity';
import { StocktakeWave, StocktakeWaveState } from './stocktake-wave.entity';
import { StorageBin } from '../storage/storage-bin.entity';
import { StorageZone } from '../storage/storage-zone.entity';
import { VariantStorageBin } from '../storage/variant-storage-bin.entity';
import {
    buildExpected, buildPostItems, canTaskTransition, canWaveTransition, formatTaskCode,
    nextTaskSeq, resolveScanCode, resolveTaskStateAfterWaves, resolveWaveStateAfterCount,
    summarizeVariance, type BindRow, type BookRow, type StocktakeScope, type VarianceInputLine,
    waveOwnerError,
} from './stocktake-math';
import { StockDocService } from '../inventory/stock-doc.service';

export interface StocktakeOperator { id: string | null; name: string | null; }

export interface StocktakeTaskView {
    id: number; code: string; stockLocationId: number; locationName: string | null;
    activityCode: string | null; name: string; scopeJson: string; binModeAtCreate: string;
    state: StocktakeTaskState; createdById: string | null; createdByName: string | null;
    postedStockDocId: number | null; postedAt: Date | null; note: string | null;
    createdAt: Date; expectedTotal: number; countedTotal: number;
    waveCount: number; submittedWaveCount: number;
}

@Injectable()
export class StocktakeService {
    constructor(
        private connection: TransactionalConnection,
        private stockDocService: StockDocService,
        private injector: Injector,
    ) {}

    private get repo() {
        return this.connection.rawConnection.getRepository(StocktakeTask);
    }

    /** 渠道收口键（硬性 R10）：与既有 storage-bin.service.ts 的 tenantOf 同源 */
    private tenantOf(ctx: RequestContext): string {
        return String(ctx.channelId);
    }

    /** 当前操作人：优先 TenantMember.displayName，回退 Administrator 姓名（照 pick-batch.admin.resolver 的实现） */
    async currentOperator(ctx: RequestContext): Promise<StocktakeOperator> {
        if (!ctx.activeUserId) return { id: null, name: null };
        try {
            const member = await this.connection.getRepository(ctx, TenantMember).findOne({
                where: { administratorId: String(ctx.activeUserId) },
            });
            if (member) return { id: String(member.id), name: member.displayName || null };
            const admin = await this.connection.getRepository(ctx, Administrator).findOne({
                where: { id: ctx.activeUserId as any },
            });
            if (admin) {
                const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ');
                return { id: null, name: name || null };
            }
        } catch (e) {
            Logger.warn(`盘库：解析操作人失败 ${(e as Error).message}`, 'Stocktake');
        }
        return { id: null, name: null };
    }

    // ------------------------------------------------------------ 读

    private async buildTaskView(ctx: RequestContext, task: StocktakeTask): Promise<StocktakeTaskView> {
        const waves = await this.connection.getRepository(ctx, StocktakeWave).find({ where: { taskId: task.id } });
        const lines = await this.connection.getRepository(ctx, StocktakeLine).find({ where: { taskId: task.id } });
        let locationName: string | null = null;
        try {
            const loc = await this.connection.getRepository(ctx, StockLocation).findOne({ where: { id: task.stockLocationId as any } });
            locationName = loc?.name ?? null;
        } catch { /* 仓库被删 → 不阻塞列表 */ }
        return {
            id: task.id, code: task.code, stockLocationId: task.stockLocationId, locationName,
            activityCode: task.activityCode, name: task.name, scopeJson: task.scopeJson,
            binModeAtCreate: task.binModeAtCreate, state: task.state,
            createdById: task.createdById, createdByName: task.createdByName,
            postedStockDocId: task.postedStockDocId, postedAt: task.postedAt, note: task.note,
            createdAt: task.createdAt,
            expectedTotal: lines.filter((l) => !l.isExtra).length,
            countedTotal: lines.filter((l) => !l.isExtra && l.countedQty !== null).length,
            waveCount: waves.length,
            submittedWaveCount: waves.filter((w) => w.state === 'SUBMITTED').length,
        };
    }

    async listTasks(ctx: RequestContext, options?: any): Promise<{ totalItems: number; items: StocktakeTaskView[] }> {
        const where: any = { tenantChannelId: this.tenantOf(ctx) };
        if (options?.state) where.state = options.state;
        if (options?.activityCode) where.activityCode = options.activityCode;
        if (options?.stockLocationId) where.stockLocationId = Number(options.stockLocationId);
        const page = Number(options?.page) > 0 ? Number(options.page) : 1;
        const pageSize = Math.min(Number(options?.pageSize) > 0 ? Number(options.pageSize) : 20, 100);
        const [tasks, totalItems] = await this.connection.getRepository(ctx, StocktakeTask).findAndCount({
            where, order: { id: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize,
        });
        const items: StocktakeTaskView[] = [];
        for (const t of tasks) items.push(await this.buildTaskView(ctx, t));
        return { totalItems, items };
    }

    async getTask(ctx: RequestContext, id: ID): Promise<StocktakeTaskView | null> {
        const task = await this.assertTask(ctx, id, { allowPosted: true });
        return this.buildTaskView(ctx, task);
    }

    async listWaves(ctx: RequestContext, taskId: ID): Promise<StocktakeWave[]> {
        await this.assertTask(ctx, taskId, { allowPosted: true });
        return this.connection.getRepository(ctx, StocktakeWave).find({
            where: { taskId: Number(taskId) }, order: { id: 'ASC' },
        });
    }

    /** 任务取回 + 渠道收口 + 状态校验（所有写路径共用；越权一律 UserInputError） */
    private async assertTask(ctx: RequestContext, id: ID, opts?: { allowPosted?: boolean }): Promise<StocktakeTask> {
        const task = await this.connection.getRepository(ctx, StocktakeTask).findOne({ where: { id: Number(id) } });
        if (!task) throw new UserInputError(`盘点任务 #${id} 不存在`);
        if (task.tenantChannelId !== this.tenantOf(ctx)) throw new UserInputError(`盘点任务 #${id} 不属于当前店铺`);
        if (!opts?.allowPosted && task.state === 'POSTED') throw new UserInputError(`任务 ${task.code} 已过账，无法再修改`);
        if (!opts?.allowPosted && task.state === 'CANCELLED') throw new UserInputError(`任务 ${task.code} 已取消`);
        return task;
    }

    private async assertWave(ctx: RequestContext, id: ID, opts?: { allowTerminal?: boolean }): Promise<StocktakeWave> {
        const wave = await this.connection.getRepository(ctx, StocktakeWave).findOne({ where: { id: Number(id) } });
        if (!wave) throw new UserInputError(`盘次 #${id} 不存在`);
        if (wave.tenantChannelId !== this.tenantOf(ctx)) throw new UserInputError(`盘次 #${id} 不属于当前店铺`);
        if (!opts?.allowTerminal && (wave.state === 'SUBMITTED' || wave.state === 'CANCELLED')) {
            throw new UserInputError(`盘次 #${id} 已提交或已取消，无法再修改`);
        }
        return wave;
    }
```

**`providers` 注册（改 `plugin.ts`）**：在既有 `providers: [...]` 数组末尾追加 `StocktakeService,`，并 import。

- [ ] **Step 6: 实现建任务（清单固化，一个事务）**

追加到 `stocktake.service.ts`：

```ts
    // ------------------------------------------------------------ 建任务

    /** scope.categoryIds → variantIds（商品数据不在纯函数里碰） */
    private async resolveScopeVariants(ctx: RequestContext, scope: StocktakeScope): Promise<number[]> {
        const variantIds = new Set<number>((scope.variantIds || []).map(Number));
        const categoryIds = (scope.categoryIds || []).map(Number);
        if (categoryIds.length) {
            const products = await this.connection.getRepository(ctx, Product).find({
                relations: { facetValues: true },
                where: { facetValues: { id: In(categoryIds) } } as any,
            });
            const productIds = products.map((p) => p.id as number);
            if (productIds.length) {
                const variants = await this.connection.getRepository(ctx, ProductVariant).find({
                    where: { productId: In(productIds) } as any,
                });
                for (const v of variants) variantIds.add(v.id as number);
            }
        }
        return Array.from(variantIds);
    }

    async createTask(ctx: RequestContext, input: any): Promise<StocktakeTaskView> {
        const tenant = this.tenantOf(ctx);
        const operator = await this.currentOperator(ctx);
        const stockLocationId = Number(input.stockLocationId);
        if (!stockLocationId) throw new UserInputError('请选择盘点仓库');
        if (!input.name || !String(input.name).trim()) throw new UserInputError('请填写任务名称');

        const channel = await this.connection.getRepository(ctx, Channel).findOne({ where: { id: ctx.channelId as any } });
        const binMode = ((channel?.customFields as any)?.binMode || 'off') as 'off' | 'zone' | 'bin';

        const scope: StocktakeScope = {
            zones: (input.scope?.zones || []).map(Number),
            categoryIds: (input.scope?.categoryIds || []).map(Number),
            variantIds: await this.resolveScopeVariants(ctx, {
                zones: [], categoryIds: input.scope?.categoryIds || [], variantIds: input.scope?.variantIds || [],
                includeZeroBook: false,
            }),
            includeZeroBook: !!input.scope?.includeZeroBook,
        };

        // 双源：有账面（stockLevels）+ 已归位（variant_storage_bin）
        const levels = await this.connection.getRepository(ctx, StockLevel).find({
            where: { stockLocationId: stockLocationId as any },
        });
        const bookRows: BookRow[] = levels.map((l) => ({ variantId: Number(l.productVariantId), quantity: l.stockOnHand }));
        const bindEntities = await this.connection.getRepository(ctx, VariantStorageBin).find({
            where: { tenantChannelId: tenant, stockLocationId },
        });
        const zones = await this.connection.getRepository(ctx, StorageZone).find({
            where: { tenantChannelId: tenant, stockLocationId },
        });
        const bins = await this.connection.getRepository(ctx, StorageBin).find({
            where: { tenantChannelId: tenant, stockLocationId },
        });
        const zoneById = new Map(zones.map((z) => [z.id as number, z]));
        const binById = new Map(bins.map((b) => [b.id as number, b]));
        const bindRows: BindRow[] = bindEntities
            .filter((b) => {
                const z = zoneById.get(Number(b.zoneId));
                return !!z && z.enabled && (!b.binId || !!binById.get(Number(b.binId))?.enabled);
            })
            .map((b) => ({
                variantId: Number(b.variantId),
                zoneId: Number(b.zoneId),
                binId: b.binId ? Number(b.binId) : null,
                zoneCode: zoneById.get(Number(b.zoneId))?.code ?? null,
                binCode: b.binId ? binById.get(Number(b.binId))?.code ?? null : null,
            }));

        const variantIds = Array.from(new Set([...bookRows.map((r) => r.variantId), ...bindRows.map((r) => r.variantId)]));
        const variants = variantIds.length
            ? await this.connection.getRepository(ctx, ProductVariant).find({ where: { id: In(variantIds) } })
            : [];
        const variantMeta = new Map(variants.map((v) => [v.id as number, { sku: v.sku, name: v.name || v.sku }]));
        const zoneMeta = new Map(zones.map((z) => [z.id as number, { code: z.code, name: z.name }]));

        const expected = buildExpected({ binMode, bookRows, bindRows, variantMeta, zoneMeta, scope });
        if (!expected.waves.some((w) => w.expectedCount > 0)) {
            throw new UserInputError('该范围下没有可盘的商品（既无账面也无归位记录），请检查圈选条件或仓库');
        }

        return this.connection.withTransaction(ctx, async (txCtx) => {
            const codeList = await this.connection.getRepository(txCtx, StocktakeTask).find({
                where: { tenantChannelId: tenant }, select: ['code'],
            });
            const seq = nextTaskSeq(codeList.map((t) => t.code), new Date());
            const code = formatTaskCode(new Date(), seq);

            const task = await this.connection.getRepository(txCtx, StocktakeTask).save(new StocktakeTask({
                code, tenantChannelId: tenant, stockLocationId,
                activityCode: input.activityCode ? String(input.activityCode).trim() : null,
                name: String(input.name).trim(),
                scopeJson: JSON.stringify(scope),
                binModeAtCreate: binMode,
                state: 'OPEN',
                createdById: operator.id, createdByName: operator.name,
                note: input.note ?? null,
            }));

            for (let i = 0; i < expected.waves.length; i++) {
                const w = expected.waves[i];
                const wave = await this.connection.getRepository(txCtx, StocktakeWave).save(new StocktakeWave({
                    tenantChannelId: tenant, taskId: task.id, scopeType: w.scopeType,
                    zoneId: w.zoneId, zoneCode: w.zoneCode, zoneName: w.zoneName,
                    state: 'OPEN', expectedCount: w.expectedCount, countedCount: 0,
                    assigneeId: null, assigneeName: null, claimedAt: null, submittedAt: null,
                }));
                const rows = expected.linesByWave[i].map((l) => new StocktakeLine({
                    tenantChannelId: tenant, taskId: task.id, waveId: wave.id,
                    variantId: l.variantId, variantSku: l.variantSku, variantName: l.variantName,
                    zoneId: l.zoneId, binId: l.binId, zoneCode: l.zoneCode, binCode: l.binCode,
                    bookQty: l.bookQty, countedQty: null, isExtra: false,
                }));
                if (rows.length) await this.connection.getRepository(txCtx, StocktakeLine).save(rows);
            }
            return this.buildTaskView(txCtx, task);
        });
    }
```

**验收（Task 4 内不含真实数据盘点）**：本 Task 结束时用 Step 9 的探针只跑「建任务」，断言 **`waves` 数 = 该仓启用的库区数 + 1（未归位桶）**、`expectedCount` 之和 = 明细行数，然后 **`cancelStocktakeTask` 清掉测试任务**。

- [ ] **Step 7: 实现盘次动作（指派 / 认领 / 释放 / 取消）+ 补盘次**

追加：

```ts
    // ------------------------------------------------------------ 盘次动作

    async addWave(ctx: RequestContext, taskId: ID, input: any): Promise<StocktakeWave> {
        await this.assertTask(ctx, taskId);
        const scopeType = String(input.scopeType || '');
        if (!['zone', 'whole', 'unassigned'].includes(scopeType)) {
            throw new UserInputError('盘次范围类型不合法（zone / whole / unassigned）');
        }
        if (scopeType === 'zone' && !input.zoneId) throw new UserInputError('按库区拆盘次时必须指定库区');
        // 复用建任务时的清单生成口径：把该范围内尚未落入任何盘次的行补进来
        throw new UserInputError('暂不支持手工补盘次：请在建任务时由系统按库区自动拆分（P1 再开放）');
    }

    async assignWave(ctx: RequestContext, waveId: ID, assigneeId?: string | null): Promise<StocktakeWave> {
        const wave = await this.assertWave(ctx, waveId);
        if (wave.state === 'COUNTING' && assigneeId && String(assigneeId) !== String(wave.assigneeId)) {
            throw new UserInputError('该盘次已开始录入，无法改派；请先释放再由新负责人认领');
        }
        if (!assigneeId) return this.releaseWave(ctx, waveId);
        const member = await this.connection.getRepository(ctx, TenantMember).findOne({
            where: { id: Number(assigneeId) } as any,
        });
        if (!member || member.channelId !== this.tenantOf(ctx)) throw new UserInputError('指定的负责人不存在或不属于当前店铺');
        wave.assigneeId = String(member.id);
        wave.assigneeName = member.displayName || null;
        wave.claimedAt = wave.claimedAt ?? new Date();
        if (wave.state === 'OPEN') wave.state = 'CLAIMED';
        this.connection.getRepository(ctx, StocktakeWave).save(wave);
        return wave;
    }

    async claimWave(ctx: RequestContext, waveId: ID): Promise<StocktakeWave> {
        const wave = await this.assertWave(ctx, waveId);
        const operator = await this.currentOperator(ctx);
        if (!operator.id) throw new UserInputError('当前账号不是本店人员，无法认领盘次');
        if (wave.assigneeId) {
            if (String(wave.assigneeId) === String(operator.id)) return wave; // 幂等
            throw new UserInputError(`该盘次已被 ${wave.assigneeName || '其他人员'} 认领`);
        }
        wave.assigneeId = operator.id;
        wave.assigneeName = operator.name;
        wave.claimedAt = new Date();
        if (wave.state === 'OPEN') wave.state = 'CLAIMED';
        return this.connection.getRepository(ctx, StocktakeWave).save(wave);
    }

    async releaseWave(ctx: RequestContext, waveId: ID): Promise<StocktakeWave> {
        const wave = await this.assertWave(ctx, waveId);
        const operator = await this.currentOperator(ctx);
        const err = waveOwnerError(wave.assigneeId, operator.id, wave.assigneeName);
        if (err) throw new UserInputError(err);
        wave.assigneeId = null;
        wave.assigneeName = null;
        wave.claimedAt = null;
        wave.state = 'OPEN';
        return this.connection.getRepository(ctx, StocktakeWave).save(wave);
    }

    async cancelWave(ctx: RequestContext, waveId: ID): Promise<StocktakeWave> {
        const wave = await this.assertWave(ctx, waveId);
        if (!canWaveTransition(wave.state, 'CANCELLED')) throw new UserInputError(`盘次当前状态 ${wave.state} 不可取消`);
        wave.state = 'CANCELLED';
        const saved = await this.connection.getRepository(ctx, StocktakeWave).save(wave);
        await this.syncTaskState(ctx, wave.taskId);
        return saved;
    }

    async cancelTask(ctx: RequestContext, taskId: ID): Promise<StocktakeTaskView> {
        const task = await this.assertTask(ctx, taskId);
        if (!canTaskTransition(task.state, 'CANCELLED')) throw new UserInputError(`任务当前状态 ${task.state} 不可取消`);
        task.state = 'CANCELLED';
        const saved = await this.connection.getRepository(ctx, StocktakeTask).save(task);
        const waves = await this.connection.getRepository(ctx, StocktakeWave).find({ where: { taskId: task.id } });
        for (const w of waves) {
            if (w.state !== 'SUBMITTED' && w.state !== 'CANCELLED') {
                w.state = 'CANCELLED';
                await this.connection.getRepository(ctx, StocktakeWave).save(w);
            }
        }
        return this.buildTaskView(ctx, saved);
    }

    /** 盘次集合变化后同步任务状态 */
    private async syncTaskState(ctx: RequestContext, taskId: number): Promise<StocktakeTaskState> {
        const task = await this.connection.getRepository(ctx, StocktakeTask).findOne({ where: { id: taskId } });
        if (!task) throw new UserInputError(`盘点任务 #${taskId} 不存在`);
        const waves = await this.connection.getRepository(ctx, StocktakeWave).find({ where: { taskId } });
        const next = resolveTaskStateAfterWaves(task.state, waves);
        if (next !== task.state) {
            task.state = next;
            await this.connection.getRepository(ctx, StocktakeTask).save(task);
        }
        return task.state;
    }
```

**关于 `addStocktakeWave`**：规格 §7 列了这个接口，但「手工补盘次」必须重算该范围的行集合（与 `buildExpected` 同源），否则会出现「盘次存在但无行」。本计划**明确最小实现**：接口保留在 SDL 里但返回明确的「暂不支持」原因（**不静默失败**），自动拆分已覆盖需求（§6.1 步骤 5）。这条要写进手册的「残留缺口」。若实施时想直接做全，照 `createTask` 的清单生成逻辑抽一个私有方法重用即可。

- [ ] **Step 8: 实现批量录入（`saveStocktakeCounts`）**

追加：

```ts
    // ------------------------------------------------------------ 录入

    async saveCounts(ctx: RequestContext, waveId: ID, inputs: any[]): Promise<StocktakeWave> {
        const wave = await this.assertWave(ctx, waveId);
        const operator = await this.currentOperator(ctx);
        const ownerErr = waveOwnerError(wave.assigneeId, operator.id, wave.assigneeName);
        if (ownerErr) throw new UserInputError(ownerErr);
        if (!Array.isArray(inputs) || !inputs.length) throw new UserInputError('请提交至少一行盘点数量');

        const task = await this.assertTask(ctx, wave.taskId);

        return this.connection.withTransaction(ctx, async (txCtx) => {
            const lines = await this.connection.getRepository(txCtx, StocktakeLine).find({ where: { waveId: wave.id } });
            const byId = new Map(lines.map((l) => [l.id as number, l]));
            const byVariant = new Map<number, StocktakeLine[]>();
            for (const l of lines) {
                const list = byVariant.get(Number(l.variantId)) || [];
                list.push(l);
                byVariant.set(Number(l.variantId), list);
            }

            for (const item of inputs) {
                const qty = Number(item.countedQty);
                if (!Number.isFinite(qty) || qty < 0) throw new UserInputError('盘点数量必须是不小于 0 的整数');
                let target: StocktakeLine | undefined;
                if (item.lineId) {
                    target = byId.get(Number(item.lineId));
                    if (!target) throw new UserInputError(`应盘行 #${item.lineId} 不属于本次盘次`);
                } else if (item.variantId) {
                    // 扫到已在清单内的变体 → 更新原行（规格 §6.2 配套规则：不新建行）
                    const same = byVariant.get(Number(item.variantId)) || [];
                    const binId = item.binId ? Number(item.binId) : null;
                    target = same.find((l) => (l.binId ?? null) === binId) || same[0];
                }
                if (!target) {
                    // 完全清单外 → 建盘盈行（isExtra=true，账面按 0）
                    const variantId = Number(item.variantId);
                    if (!variantId) throw new UserInputError('清单外登记必须提供商品（variantId）');
                    const variant = await this.connection.getRepository(txCtx, ProductVariant).findOne({ where: { id: variantId } });
                    if (!variant) throw new UserInputError(`商品 #${variantId} 不存在`);
                    target = new StocktakeLine({
                        tenantChannelId: this.tenantOf(ctx), taskId: task.id, waveId: wave.id,
                        variantId, variantSku: variant.sku, variantName: variant.name || variant.sku,
                        zoneId: item.zoneId ? Number(item.zoneId) : null, binId: item.binId ? Number(item.binId) : null,
                        zoneCode: null, binCode: null, bookQty: 0, isExtra: true,
                    });
                }
                target.countedQty = Math.floor(qty);
                target.countedById = operator.id;
                target.countedByName = operator.name;
                target.countedAt = new Date();
                if (item.note !== undefined) target.note = item.note ?? null;
                if (item.zoneId) target.zoneId = Number(item.zoneId);
                if (item.binId) target.binId = Number(item.binId);
                await this.connection.getRepository(txCtx, StocktakeLine).save(target);
            }

            const fresh = await this.connection.getRepository(txCtx, StocktakeLine).find({ where: { waveId: wave.id } });
            wave.countedCount = fresh.filter((l) => l.countedQty !== null).length;
            wave.state = resolveWaveStateAfterCount(wave.state, wave.countedCount);
            await this.connection.getRepository(txCtx, StocktakeWave).save(wave);
            await this.syncTaskState(txCtx, wave.taskId);
            return wave;
        });
    }

    async submitWave(ctx: RequestContext, waveId: ID): Promise<StocktakeWave> {
        const wave = await this.assertWave(ctx, waveId);
        const operator = await this.currentOperator(ctx);
        const ownerErr = waveOwnerError(wave.assigneeId, operator.id, wave.assigneeName);
        if (ownerErr) throw new UserInputError(ownerErr);
        if (!canWaveTransition(wave.state, 'SUBMITTED')) throw new UserInputError(`盘次当前状态 ${wave.state} 不可提交`);
        wave.state = 'SUBMITTED';
        wave.submittedAt = new Date();
        const saved = await this.connection.getRepository(ctx, StocktakeWave).save(wave);
        await this.syncTaskState(ctx, wave.taskId);
        return saved;
    }
```

- [ ] **Step 9: 编译 + 单测 + 建任务实测（含清理）**

```powershell
npx vitest run src/stocktake
npm run build
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）预期：单测全绿、build exit 0。

起服后在 Playground（本地 superadmin）跑：

```graphql
mutation { createStocktakeTask(input: {
  stockLocationId: "1", name: "本地自检-盘库", activityCode: "LOCAL-TEST"
  scope: { includeZeroBook: false }, autoSplitByZone: true
}) { id code state expectedTotal waveCount } }
```

预期：`code` 形如 `TK20260923-001`；`waveCount` = 本仓启用库区数 + 1（未归位桶，若存在未归位变体）；`expectedTotal` = 明细行数。

```graphql
mutation { cancelStocktakeTask(taskId: "<上一步的 id>") { id state } }
```

预期 `state = CANCELLED`（**测试任务必须清理**，不留残渣）。

- [ ] **Step 10: 提交**

```bash
git add packages/cjk-plugin/src/stocktake packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/lib
git commit -m "feat(stocktake): 盘库 service（建任务固化清单/盘次独占/批量录入/提交取消）"
```

---

## Task 5：过账（差异查询 + 过账事务，复用既有 ST 单据）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake.service.ts`

**为什么过账不写新机制**：`stock-doc.service.ts` 的 `STOCKTAKE` 分支已实现 `realQty` 覆盖式（`adjust.setPhysicalStock`）并在传 `zoneId`/`binId` 时经 `applyBinBinding()` 归位 —— 本 Task 只负责「算准 items」和「幂等 + 状态推进」，绝不新增库存写入路径。

- [ ] **Step 1: 实现差异查询 `diffOf`**

追加到 `stocktake.service.ts`：

```ts
    // ------------------------------------------------------------ 差异与过账

    /** 读当前账面（StockLevel）+ 当前绑定（variant_storage_bin）→ 差异汇总 */
    private async loadCurrentState(ctx: RequestContext, task: StocktakeTask, variantIds: number[]) {
        if (!variantIds.length) return { currentBook: [] as BookRow[], currentBind: [] as BindRow[] };
        const levels = await this.connection.getRepository(ctx, StockLevel).find({
            where: { stockLocationId: task.stockLocationId as any, productVariantId: In(variantIds) } as any,
        });
        const currentBook: BookRow[] = levels.map((l) => ({ variantId: Number(l.productVariantId), quantity: l.stockOnHand }));
        const binds = await this.connection.getRepository(ctx, VariantStorageBin).find({
            where: { tenantChannelId: task.tenantChannelId, stockLocationId: task.stockLocationId, variantId: In(variantIds) } as any,
        });
        const currentBind: BindRow[] = binds.map((b) => ({
            variantId: Number(b.variantId), zoneId: Number(b.zoneId), binId: b.binId ? Number(b.binId) : null,
        }));
        return { currentBook, currentBind };
    }

    async diffOf(ctx: RequestContext, taskId: ID) {
        const task = await this.assertTask(ctx, taskId, { allowPosted: true });
        const lines = await this.connection.getRepository(ctx, StocktakeLine).find({ where: { taskId: task.id } });
        const variantIds = Array.from(new Set(lines.map((l) => Number(l.variantId))));
        const { currentBook, currentBind } = await this.loadCurrentState(ctx, task, variantIds);
        const input: VarianceInputLine[] = lines.map((l) => ({
            id: l.id as number, variantId: Number(l.variantId), countedQty: l.countedQty,
            isExtra: l.isExtra, bookQty: l.bookQty,
            zoneId: l.zoneId, binId: l.binId,
        }));
        const summary = summarizeVariance(input, currentBook, currentBind);
        const skuOf = new Map(lines.map((l) => [Number(l.variantId), { sku: l.variantSku, name: l.variantName }]));
        return {
            summary,
            rows: summary.byVariant.map((v) => ({
                variantId: String(v.variantId),
                variantSku: skuOf.get(v.variantId)?.sku ?? `#${v.variantId}`,
                variantName: skuOf.get(v.variantId)?.name ?? '',
                countedTotal: v.countedTotal, bookQty: v.bookQty, diff: v.diff,
                isExtra: v.isExtra, binChanged: v.binChanged,
                targetZoneId: v.targetZoneId === null ? null : String(v.targetZoneId),
                targetBinId: v.targetBinId === null ? null : String(v.targetBinId),
                targetBinCode: null,
                snapBookQty: v.snapBookQty, currentBookQty: v.bookQty,
            })),
            uncountedLines: lines.filter((l) => !l.isExtra && l.countedQty === null),
            changedVariants: summary.changedVariants.map((c) => ({
                variantId: String(c.variantId),
                variantSku: skuOf.get(c.variantId)?.sku ?? `#${c.variantId}`,
                snapBookQty: c.snapBookQty, currentBookQty: c.currentBookQty,
            })),
        };
    }
```

- [ ] **Step 2: 实现过账事务 `post`**

追加：

```ts
    async post(ctx: RequestContext, taskId: ID, confirm?: boolean) {
        const task = await this.assertTask(ctx, taskId, { allowPosted: true });
        if (task.state === 'POSTED') throw new UserInputError(`任务 ${task.code} 已过账，请勿重复操作`);
        if (task.state !== 'COUNTED') throw new UserInputError(`任务当前状态 ${task.state}，需全部盘次提交后才能过账`);

        const waves = await this.connection.getRepository(ctx, StocktakeWave).find({ where: { taskId: task.id } });
        const pending = waves.filter((w) => w.state !== 'SUBMITTED' && w.state !== 'CANCELLED');
        if (pending.length) {
            throw new UserInputError(`还有 ${pending.length} 个盘次未提交（${pending.map((w) => w.id).join(', ')}），无法过账`);
        }

        const diff = await this.diffOf(ctx, task.id);
        if (diff.summary.uncountedCount > 0 && !confirm) {
            return {
                ok: false, stockDocId: null, diff,
                message: `有 ${diff.summary.uncountedCount} 项未盘，若确认跳过请勾选后重试`,
            };
        }
        if (diff.summary.recheck && !confirm) {
            return {
                ok: false, stockDocId: null, diff,
                message: `盘点期间账面发生变动（${diff.summary.changedVariants.length} 个商品），已按当前账面重算，请确认后继续`,
            };
        }

        const plan = buildPostItems({ summary: diff.summary, stockLocationId: task.stockLocationId });
        if (!plan.items.length) throw new UserInputError('没有需要过账的差异（数量与库位均无变化）');

        return this.connection.withTransaction(ctx, async (txCtx) => {
            const items = plan.items.map((i) => ({
                variantId: String(i.variantId),
                toStockLocationId: String(i.toStockLocationId),
                qty: i.realQty,
                realQty: i.realQty,
                zoneId: i.zoneId === null ? undefined : String(i.zoneId),
                binId: i.binId === null ? undefined : String(i.binId),
            }));
            const doc = await this.stockDocService.create(txCtx, {
                type: 'STOCKTAKE',
                items,
                note: `盘点任务 ${task.code}`,
            } as any);
            task.state = 'POSTED';
            task.postedStockDocId = (doc as any)?.id ?? null;
            task.postedAt = new Date();
            const saved = await this.connection.getRepository(txCtx, StocktakeTask).save(task);
            return { ok: true, stockDocId: String(task.postedStockDocId ?? ''), diff, message: `已生成盘点单据 ${task.code}` };
        });
    }
```

**说明（实施时按 `stock-doc.service.ts` 的 `StockDocItemInput` 实际字段对齐）**：`qty` 在 STOCKTAKE 分支里不参与（`target = item.realQty ?? item.qty`），故 `qty` 传 `realQty` 即可；**若 `StockDocItemInput` 里 `qty` 是必填，就传 `realQty`；若 `realQty` 是可选且必须显式给**，按实际签名调整，不要为了凑字段编造语义。`zoneId` / `binId` 为 null 时**不要传 `undefined` 之外的假值**（不传即不动归位，符合规格 §10「盘盈行找不到库位允许为空」）。

- [ ] **Step 3: 幂等与终态保护自测（本地最小链路）**

起服后，在 Playground 按顺序跑一遍：

```graphql
# ① 建任务
mutation { createStocktakeTask(input: { stockLocationId: "1", name: "本地过账自检", scope: { includeZeroBook: false } }) { id code } }
# ② 逐盘次认领（当前账号须是本店人员；否则先用 assignStocktakeWave 指派给自己）
mutation { claimStocktakeWave(waveId: "<waveId>") { id state assigneeName } }
# ③ 录入（countedQty 故意与账面不同，制造差异）
mutation { saveStocktakeCounts(waveId: "<waveId>", inputs: [{ lineId: "<lineId>", countedQty: 1 }]) { id state countedCount } }
# ④ 提交
mutation { submitStocktakeWave(waveId: "<waveId>") { id state } }
# ⑤ 差异
query { stocktakeDiff(taskId: "<taskId>") { uncountedCount extraCount recheck rows { variantSku countedTotal bookQty diff } } }
# ⑥ 过账（未盘项存在时第一次应被拒，confirm=true 再试）
mutation { postStocktake(taskId: "<taskId>", confirm: true) { ok stockDocId message } }
# ⑦ 重复过账
mutation { postStocktake(taskId: "<taskId>") { ok message } }
```

预期：③ 后盘次 `state = COUNTING`、`countedCount` 与录入行数一致；④ 后任务 `state = COUNTED`；⑤ 的 `recheck` 与实际账面是否变动一致；⑥ 返回 `ok=true` 并有 `stockDocId`；⑦ **报错**「已过账，请勿重复操作」。

**库存复位（必做）**：过账会真实改库存。用既有接口把被测变体还原为盘点前账面：

```graphql
mutation { setVariantStock(productVariantId: "<v>", stockLocationId: "1", stockOnHand: <盘点前的账面>) }
```

并把该 `stockDocId` 与复位动作记入手册「测试数据与复位」小节。

- [ ] **Step 4: 编译 + 单测 + 提交**

```powershell
npx vitest run src/stocktake
npm run build
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）

```bash
git add packages/cjk-plugin/src/stocktake packages/cjk-plugin/lib
git commit -m "feat(stocktake): 差异查询与过账（复用 ST 单据，幂等 + 账面重算）"
```

---

## Task 6：权限点 + SDL + Resolvers（**仅 admin-api**）+ build + 只读探针

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-permissions.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake.admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\role-templates.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（盘库 SDL 块 + `resolvers` 数组 + `customPermissions` 注入）
- Create: `d:\zhao\vshop\web-admin\scripts\_probe_stocktake_local.py`

- [ ] **Step 1: 写两个权限点**

```ts
// src/stocktake/stocktake-permissions.ts
import { PermissionDefinition } from '@vendure/core';

/** 能盘：建任务 / 拆盘次 / 认领 / 录入 / 提交 */
export const StocktakeCountPermission = new PermissionDefinition({
    name: 'StocktakeCount',
    description: '多人协同盘库：建任务、拆盘次、认领、录入、提交',
});

/** 能过账：差异复核 + 一键过账（与「能盘」刻意分开，规格 §9） */
export const StocktakePostPermission = new PermissionDefinition({
    name: 'StocktakePost',
    description: '多人协同盘库：差异复核与过账',
});

export const stocktakePermissionDefinitions = [StocktakeCountPermission, StocktakePostPermission];
```

**先读** `src/tenant/tenant-permissions.ts` 确认 `new PermissionDefinition({...})` 的构造签名与命名风格（该文件是本插件既有 4 处先例），不一致就以实际为准。

- [ ] **Step 2: 角色模板补权限点**

在 `src/tenant/role-templates.ts` 的 `OFFICIAL_ROLE_TEMPLATES` 里：

```ts
// tenant-admin（仓管主管）：两个都给
permissions: [ /* 既有项 */ 'StocktakeCount', 'StocktakePost' ],

// stock（"库存"，仓管/盘点员）：只给能盘
permissions: [ 'ReadCatalog', 'ReadProduct', 'UpdateProduct', 'ReadOrder', 'StocktakeCount' ],
```

`sales` / `cashier` 都不加。**注意**：既有租户的角色是**已落库的 `Role.permissions` 数组**，改模板**不会**自动给老角色补权限 —— 这条要写进手册「升级须知」：需要管理员在「角色管理」里重新套用模板或手工勾选新权限点（本地与生产各确认一次）。

- [ ] **Step 3: 写 Resolver（6 查询 + 10 变更）**

```ts
// src/stocktake/stocktake.admin.resolver.ts
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, TransactionalConnection } from '@vendure/core';

import { StocktakeService } from './stocktake.service';
import { StocktakeLine } from './stocktake-line.entity';

/** 差异视图：service 返回 { summary, rows, ... }，SDL 要扁平字段，故此处统一映射 */
function toDiffView(d: any) {
    return {
        expectedTotal: d.summary.expectedTotal,
        countedTotal: d.summary.countedLineCount,
        uncountedCount: d.summary.uncountedCount,
        extraCount: d.summary.extraCount,
        diffCount: d.summary.byVariant.filter((v: any) => v.diff !== 0).length,
        rows: d.rows,
        uncountedLines: d.uncountedLines,
        recheck: d.summary.recheck,
        changedVariants: d.changedVariants,
    };
}

@Resolver()
export class StocktakeAdminResolver {
    constructor(
        private stocktakeService: StocktakeService,
        private connection: TransactionalConnection,
    ) {}

    // ---------------------------------------------------------- 查询

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeTasks(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.listTasks(ctx, args.options);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeTask(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.getTask(ctx, args.id);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeWaves(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.listWaves(ctx, args.taskId);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeExpectedLines(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.listLines(ctx, args);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeDiff(@Ctx() ctx: RequestContext, @Args() args: any) {
        return toDiffView(await this.stocktakeService.diffOf(ctx, args.taskId));
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeResolveCode(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.resolveCode(ctx, args.taskId, args.code);
    }

    // ---------------------------------------------------------- 变更

    @Mutation()
    @Allow('StocktakeCount')
    async createStocktakeTask(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.createTask(ctx, args.input);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async addStocktakeWave(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.addWave(ctx, args.taskId, args.input);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async assignStocktakeWave(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.assignWave(ctx, args.waveId, args.assigneeId);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async claimStocktakeWave(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.claimWave(ctx, args.waveId);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async releaseStocktakeWave(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.releaseWave(ctx, args.waveId);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async saveStocktakeCounts(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.saveCounts(ctx, args.waveId, args.inputs);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async submitStocktakeWave(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.submitWave(ctx, args.waveId);
    }

    @Mutation()
    @Allow('StocktakePost')
    async postStocktake(@Ctx() ctx: RequestContext, @Args() args: any) {
        const r = await this.stocktakeService.post(ctx, args.taskId, args.confirm);
        return { ...r, diff: r.diff ? toDiffView(r.diff) : null };
    }

    @Mutation()
    @Allow('StocktakeCount')
    async cancelStocktakeTask(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.cancelTask(ctx, args.taskId);
    }

    @Mutation()
    @Allow('StocktakeCount')
    async cancelStocktakeWave(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.cancelWave(ctx, args.waveId);
    }
}
```

**还差 service 的两个方法（本 Step 一并补）**：

```ts
    /** 应盘行分页 + 已盘/未盘/差异/盘盈筛选 */
    async listLines(ctx: RequestContext, args: any): Promise<{ totalItems: number; items: StocktakeLine[] }> {
        const task = await this.assertTask(ctx, args.taskId, { allowPosted: true });
        const where: any = { taskId: task.id };
        if (args.waveId) where.waveId = Number(args.waveId);
        let lines = await this.connection.getRepository(ctx, StocktakeLine).find({ where, order: { id: 'ASC' } });
        const f = args.filter || {};
        if (f.onlyCounted) lines = lines.filter((l) => l.countedQty !== null);
        if (f.onlyUncounted) lines = lines.filter((l) => !l.isExtra && l.countedQty === null);
        if (f.onlyExtra) lines = lines.filter((l) => l.isExtra);
        if (f.onlyDiff) {
            const diff = await this.diffOf(ctx, task.id);
            const diffIds = new Set(diff.rows.filter((r: any) => r.diff !== 0).map((r: any) => String(r.variantId)));
            lines = lines.filter((l) => diffIds.has(String(l.variantId)));
        }
        const kw = String(args.keyword || '').trim().toLowerCase();
        if (kw) lines = lines.filter((l) => l.variantSku.toLowerCase().includes(kw) || l.variantName.toLowerCase().includes(kw));
        const page = Number(args.page) > 0 ? Number(args.page) : 1;
        const pageSize = Math.min(Number(args.pageSize) > 0 ? Number(args.pageSize) : 50, 200);
        return { totalItems: lines.length, items: lines.slice((page - 1) * pageSize, page * pageSize) };
    }

    /** 扫码解析：库位码 / 任务内应盘行 / 清单外变体（规格 §7/§8.3） */
    async resolveCode(ctx: RequestContext, taskId: ID, code: string) {
        const task = await this.assertTask(ctx, taskId, { allowPosted: true });
        const tenant = task.tenantChannelId;
        const bins = await this.connection.getRepository(ctx, StorageBin).find({ where: { tenantChannelId: tenant, stockLocationId: task.stockLocationId } });
        const lines = await this.connection.getRepository(ctx, StocktakeLine).find({ where: { taskId: task.id } });
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({ where: { id: In(lines.map((l) => Number(l.variantId))) } });
        const scanLines = lines.map((l) => {
            const v = variants.find((x) => Number(x.id) === Number(l.variantId));
            return {
                lineId: l.id as number, variantId: Number(l.variantId), sku: l.variantSku,
                barcode: ((v?.customFields as any)?.barcode ?? null),
                internalCode: ((v?.customFields as any)?.internalCode ?? null),
            };
        });
        const hit = resolveScanCode(String(code || ''), {
            bins: bins.map((b) => ({ binId: b.id as number, binCode: b.code, zoneId: Number(b.zoneId) })),
            lines: scanLines,
            variants: [],   // 清单外变体：先只按「清单内码」解析；未命中时再按条码/内部码/SKU 反查商品
        });
        if (hit.kind !== 'none') {
            const line = lines.find((l) => l.id === (hit as any).lineId);
            return {
                kind: hit.kind, binId: (hit as any).binId ? String((hit as any).binId) : null,
                binCode: (hit as any).binCode ?? null, zoneId: (hit as any).zoneId ? String((hit as any).zoneId) : null,
                lineId: (hit as any).lineId ? String((hit as any).lineId) : null,
                variantId: line ? String(line.variantId) : null,
                variantSku: line?.variantSku ?? null, variantName: line?.variantName ?? null,
                message: null,
            };
        }
        // 清单外：按 SKU / 内部码 / 条形码反查本渠道商品（CM 时序：先精确 SKU，再扫自定义字段）
        const raw = String(code || '').trim();
        const all = await this.connection.getRepository(ctx, ProductVariant).find({ take: 5000 });
        const found = all.find((v) =>
            v.sku === raw ||
            (v.customFields as any)?.barcode === raw ||
            (v.customFields as any)?.internalCode === raw,
        );
        if (found) {
            return {
                kind: 'extra', binId: null, binCode: null, zoneId: null, lineId: null,
                variantId: String(found.id), variantSku: found.sku, variantName: found.name || found.sku,
                message: '该商品不在应盘清单内，可登记为盘盈',
            };
        }
        return { kind: 'none', binId: null, binCode: null, zoneId: null, lineId: null, variantId: null, variantSku: null, variantName: null, message: '未匹配到商品或库位，请手动输入' };
    }
```

**注意**：`resolveCode` 的「清单外反查」若嫌 `take: 5000` 粗暴，改为按 `sku` 精确查 + 两个自定义字段精确查的三次查询（推荐，别拉全表）。**实施时按后者写**，并把这一取舍写进代码注释。

- [ ] **Step 4: 注册 SDL（**只进 `adminApiExtensions`**）**

在 `src/plugin.ts` 的 `adminApiExtensions.schema()` 模板串内（**盘库 SDL 块**，紧邻既有库位块之后）追加：

```graphql
            type StocktakeTask {
                id: ID!
                code: String!
                stockLocationId: ID!
                locationName: String
                activityCode: String
                name: String!
                scopeJson: String!
                binModeAtCreate: String!
                state: String!
                createdById: String
                createdByName: String
                postedStockDocId: ID
                postedAt: DateTime
                note: String
                createdAt: DateTime!
                expectedTotal: Int!
                countedTotal: Int!
                waveCount: Int!
                submittedWaveCount: Int!
            }
            type StocktakeTaskList { totalItems: Int!, items: [StocktakeTask!]! }
            type StocktakeWave {
                id: ID!
                taskId: ID!
                scopeType: String!
                zoneId: ID
                zoneCode: String
                zoneName: String
                assigneeId: String
                assigneeName: String
                state: String!
                expectedCount: Int!
                countedCount: Int!
                claimedAt: DateTime
                submittedAt: DateTime
            }
            type StocktakeLine {
                id: ID!
                taskId: ID!
                waveId: ID!
                variantId: ID!
                variantSku: String!
                variantName: String!
                zoneId: ID
                binId: ID
                zoneCode: String
                binCode: String
                bookQty: Int!
                countedQty: Int
                isExtra: Boolean!
                countedById: String
                countedByName: String
                countedAt: DateTime
                note: String
            }
            type StocktakeLinePage { totalItems: Int!, items: [StocktakeLine!]! }
            type StocktakeVarianceRow {
                variantId: ID!
                variantSku: String!
                variantName: String!
                countedTotal: Int!
                bookQty: Int!
                diff: Int!
                isExtra: Boolean!
                binChanged: Boolean!
                targetZoneId: ID
                targetBinId: ID
                targetBinCode: String
                snapBookQty: Int!
                currentBookQty: Int!
            }
            type StocktakeBookChange { variantId: ID!, variantSku: String!, snapBookQty: Int!, currentBookQty: Int! }
            type StocktakeDiff {
                expectedTotal: Int!
                countedTotal: Int!
                uncountedCount: Int!
                extraCount: Int!
                diffCount: Int!
                rows: [StocktakeVarianceRow!]!
                uncountedLines: [StocktakeLine!]!
                recheck: Boolean!
                changedVariants: [StocktakeBookChange!]!
            }
            type StocktakeScanHit {
                kind: String!
                binId: ID
                binCode: String
                zoneId: ID
                lineId: ID
                variantId: ID
                variantSku: String
                variantName: String
                message: String
            }
            type StocktakePostResult { ok: Boolean!, stockDocId: ID, diff: StocktakeDiff, message: String }
            input StocktakeScopeInput { zones: [Int!], categoryIds: [Int!], variantIds: [Int!], includeZeroBook: Boolean }
            input StocktakeTaskInput {
                stockLocationId: ID!
                name: String!
                activityCode: String
                scope: StocktakeScopeInput
                autoSplitByZone: Boolean
                note: String
            }
            input StocktakeWaveInput { scopeType: String!, zoneId: ID }
            input StocktakeCountEntryInput { lineId: ID, variantId: ID, countedQty: Int!, zoneId: ID, binId: ID, note: String }
            input StocktakeLineFilterInput { onlyCounted: Boolean, onlyUncounted: Boolean, onlyDiff: Boolean, onlyExtra: Boolean }
            input StocktakeTaskOptionsInput { page: Int, pageSize: Int, state: String, activityCode: String, stockLocationId: ID }
            extend type Query {
                stocktakeTasks(options: StocktakeTaskOptionsInput): StocktakeTaskList!
                stocktakeTask(id: ID!): StocktakeTask
                stocktakeWaves(taskId: ID!): [StocktakeWave!]!
                stocktakeExpectedLines(taskId: ID!, waveId: ID, filter: StocktakeLineFilterInput, keyword: String, page: Int, pageSize: Int): StocktakeLinePage!
                stocktakeDiff(taskId: ID!): StocktakeDiff!
                stocktakeResolveCode(taskId: ID!, code: String!): StocktakeScanHit!
            }
            extend type Mutation {
                createStocktakeTask(input: StocktakeTaskInput!): StocktakeTask!
                addStocktakeWave(taskId: ID!, input: StocktakeWaveInput!): StocktakeWave!
                assignStocktakeWave(waveId: ID!, assigneeId: String): StocktakeWave!
                claimStocktakeWave(waveId: ID!): StocktakeWave!
                releaseStocktakeWave(waveId: ID!): StocktakeWave!
                saveStocktakeCounts(waveId: ID!, inputs: [StocktakeCountEntryInput!]!): StocktakeWave!
                submitStocktakeWave(waveId: ID!): StocktakeWave!
                postStocktake(taskId: ID!, confirm: Boolean): StocktakePostResult!
                cancelStocktakeTask(taskId: ID!): StocktakeTask!
                cancelStocktakeWave(waveId: ID!): StocktakeWave!
            }
```

同一文件的 `adminApiExtensions.resolvers: [...]` 数组末尾追加 `StocktakeAdminResolver,`（并 import）。

**`customPermissions` 注入**：在 `configuration: config => { ... }` 里，照既有 4 处写法追加：

```ts
        config.authOptions.customPermissions = [
            ...(config.authOptions.customPermissions || []),
            ...stocktakePermissionDefinitions,
        ];
```

- [ ] **Step 5: build + 起服 + 只读探针（新建脚本）**

```powershell
npm run build
```

（cwd: `d:\zhao\vendure\packages\cjk-plugin`）预期 exit 0。

新建 `d:\zhao\vshop\web-admin\scripts\_probe_stocktake_local.py`（**照 `scripts/_smoke_picking_live.py` 的登录与请求写法**：复制其 `login()` / `gql()` 两个函数，仅改 BASE 与断言列表；BASE 默认 `http://localhost:3000`，可用 `WA_SMOKE_BASE` 覆盖）：

```python
"""盘库接口只读探针（本地/生产通用）。默认只读；写链路自检在 Task 7 以 --write 开启。"""
import argparse, json, os, sys
import urllib.request

BASE = os.environ.get('WA_SMOKE_BASE', 'http://localhost:3000')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')

FAILED = []

def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + ((' | ' + str(detail)) if detail else ''))
    if not cond:
        FAILED.append(name)

def post(path, payload, cookie=None):
    req = urllib.request.Request(BASE.rstrip('/') + path, data=json.dumps(payload).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    if cookie:
        req.add_header('Cookie', cookie)
    with urllib.request.urlopen(req) as resp:
        cookie_out = resp.headers.get('Set-Cookie')
        return json.loads(resp.read().decode('utf-8')), cookie_out or cookie

def login():
    payload = {'query': 'mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id identifier } } }' % (USER, PWD)}
    data, cookie = post('/admin-api', payload)
    if data.get('errors'):
        print('登录失败：', data['errors']); sys.exit(1)
    return cookie

def gql(cookie, query):
    data, _ = post('/admin-api', {'query': query}, cookie)
    return data

QUERY_NAMES = ['stocktakeTasks', 'stocktakeTask', 'stocktakeWaves', 'stocktakeExpectedLines',
               'stocktakeDiff', 'stocktakeResolveCode', 'variantBinsByLocation', 'binOccupancy']
MUTATION_NAMES = ['createStocktakeTask', 'addStocktakeWave', 'assignStocktakeWave', 'claimStocktakeWave',
                  'releaseStocktakeWave', 'saveStocktakeCounts', 'submitStocktakeWave', 'postStocktake',
                  'cancelStocktakeTask', 'cancelStocktakeWave']

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='启用写链路自检（建任务/录入/提交/过账/复位）')
    args = ap.parse_args()
    cookie = login()

    intro = gql(cookie, '{ __schema { queryType { fields { name } } mutationType { fields { name } } } }')
    qs = {f['name'] for f in intro['data']['__schema']['queryType']['fields']}
    ms = {f['name'] for f in intro['data']['__schema']['mutationType']['fields']}
    for n in QUERY_NAMES:
        check('admin Query.%s 已注册' % n, n in qs)
    for n in MUTATION_NAMES:
        check('admin Mutation.%s 已注册' % n, n in ms)

    # 渠道收口（必测项）：只返回本渠道任务，且字段可查
    r = gql(cookie, '{ stocktakeTasks(options: { page: 1, pageSize: 5 }) { totalItems items { id code state waveCount expectedTotal } } }')
    check('stocktakeTasks 可查且按渠道收口（无 errors）', not r.get('errors'), r.get('errors'))

    # 反向查询
    o = gql(cookie, '{ binOccupancy(stockLocationId: "1") { binId binCode skuCount } }')
    check('binOccupancy 可查', not o.get('errors'), o.get('errors'))
    if not o.get('errors'):
        rows = o['data']['binOccupancy']
        check('binOccupancy 返回格子（含空格）', len(rows) > 0 and any(x['skuCount'] == 0 for x in rows), 'n=%d' % len(rows))

    b = gql(cookie, '{ variantBinsByLocation(stockLocationId: "1", pageSize: 5) { totalItems items { variantId sku zoneCode binCode barcode } } }')
    check('variantBinsByLocation 可查', not b.get('errors'), b.get('errors'))

    # 有意单侧注册的验证：shop-api 不应有盘库字段
    shop = post('/shop-api', {'query': '{ __schema { queryType { fields { name } } } }'}, None)[0]
    shop_names = {f['name'] for f in shop['data']['__schema']['queryType']['fields']} if not shop.get('errors') else set()
    check('shop-api 不含盘库查询（有意单侧注册）', not any(n in shop_names for n in QUERY_NAMES), sorted(n for n in QUERY_NAMES if n in shop_names))

    if args.write:
        write_checks(cookie)

    print('\n%s' % ('全部通过' if not FAILED else '失败 %d 项：%s' % (len(FAILED), FAILED)))
    sys.exit(1 if FAILED else 0)

def write_checks(cookie):
    # 写链路自检（本地库专用；生产不要跑 --write）
    import time
    name = '自检-盘库-%d' % int(time.time())
    c = gql(cookie, 'mutation { createStocktakeTask(input: { stockLocationId: "1", name: "%s", activityCode: "SMOKE" }) { id code waveCount expectedTotal } }' % name)
    check('建任务成功', not c.get('errors'), c.get('errors'))
    if c.get('errors'):
        return
    task = c['data']['createStocktakeTask']
    check('任务号形如 TKyyyymmdd-nnn', task['code'].startswith('TK') and '-' in task['code'], task['code'])
    check('已自动拆盘次', task['waveCount'] > 0, task['waveCount'])
    # 未认领盘次录入必须被拒（独占锁）
    w = gql(cookie, '{ stocktakeWaves(taskId: "%s") { id state assigneeId expectedCount } }' % task['id'])
    waves = w['data']['stocktakeWaves']
    check('盘次默认待认领', all(x['assigneeId'] is None for x in waves))
    wid = waves[0]['id']
    ln = gql(cookie, '{ stocktakeExpectedLines(taskId: "%s", waveId: "%s", pageSize: 1) { items { id variantId } } }' % (task['id'], wid))
    line = ln['data']['stocktakeExpectedLines']['items'][0]
    denied = gql(cookie, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 1 }]) { id } }' % (wid, line['id']))
    check('未认领时录入被拒（独占锁）', bool(denied.get('errors')) and '认领' in json.dumps(denied['errors'], ensure_ascii=False), denied.get('errors'))
    # 认领 → 录入 → 提交
    cl = gql(cookie, 'mutation { claimStocktakeWave(waveId: "%s") { id state assigneeName } }' % wid)
    check('认领成功', not cl.get('errors'), cl.get('errors'))
    sv = gql(cookie, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 1 }]) { id state countedCount } }' % (wid, line['id']))
    check('录入成功且盘次进入 COUNTING', not sv.get('errors') and sv['data']['saveStocktakeCounts']['state'] == 'COUNTING', sv.get('errors') or sv['data'])
    sb = gql(cookie, 'mutation { submitStocktakeWave(waveId: "%s") { id state } }' % wid)
    check('提交成功', not sb.get('errors') and sb['data']['submitStocktakeWave']['state'] == 'SUBMITTED', sb.get('errors') or sb['data'])
    # 清理：取消任务（本地写自检不过账，避免动库存）
    cc = gql(cookie, 'mutation { cancelStocktakeTask(taskId: "%s") { id state } }' % task['id'])
    check('取消任务成功（清理）', not cc.get('errors') and cc['data']['cancelStocktakeTask']['state'] == 'CANCELLED', cc.get('errors') or cc['data'])

if __name__ == '__main__':
    main()
```

- [ ] **Step 6: 跑只读探针**

```powershell
python scripts\_probe_stocktake_local.py
```

（cwd: `d:\zhao\vshop\web-admin`；需本地 dev-server 已起）

预期：**0 fail** —— 8 个 Query / 10 个 Mutation 已注册；`binOccupancy` 有空格；`shop-api` 不含盘库查询；`stocktakeTasks` 无 errors。

- [ ] **Step 7: 提交**

```bash
# 后端
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(stocktake): 权限点/SDL/Resolvers（仅 admin-api）"
```

```bash
# 前端仓库（探针脚本）
git add scripts/_probe_stocktake_local.py
git commit -m "test(stocktake): 盘库只读探针脚本"
```

---

## Task 7：本地写链路自检（建任务 → 认领 → 录入 → 提交 → 过账 → 复位）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\scripts\_probe_stocktake_local.py`

**目的**：过账会真实改库存，**只在本地 dev-server 验证**；生产库在 Task 8 只做只读 + 建任务/取消（**绝不过账**）。

- [ ] **Step 1: 扩展 `--post` 链路（在 `write_checks` 之后追加）**

在探针脚本里新增 `post_checks(cookie, task_id)`，并在 `--write` 分支末尾调用；内容为：先把该任务的**全部盘次**认领/录入/提交，再走差异与过账、断言库存变化、然后复位。关键断言（实施时按此写）：

```python
def post_checks(cookie, task_id):
    """过账链路自检（本地专用）：故意制造差异 → 过账 → 断言库存变化 → 复位"""
    # ① 取盘点前的账面（stockLevels）
    before = gql(cookie, '{ stockLevels(locationId: "1", page: 1, pageSize: 1000) { items { productVariantId stockOnHand } } }')
    book_before = {i['productVariantId']: i['stockOnHand'] for i in before['data']['stockLevels']['items']}

    # ② 全部盘次：认领 → 录入（第 1 行改成 0，制造 -N 差异）→ 提交
    waves = gql(cookie, '{ stocktakeWaves(taskId: "%s") { id } }' % task_id)['data']['stocktakeWaves']
    target_variant = None
    for w in waves:
        gql(cookie, 'mutation { claimStocktakeWave(waveId: "%s") { id } }' % w['id'])
        lines = gql(cookie, '{ stocktakeExpectedLines(taskId: "%s", waveId: "%s", pageSize: 200) { items { id variantId } } }' % (task_id, w['id']))['data']['stocktakeExpectedLines']['items']
        if lines:
            target_variant = lines[0]['variantId']
            gql(cookie, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 0 }]) { id } }' % (w['id'], lines[0]['id']))
        gql(cookie, 'mutation { submitStocktakeWave(waveId: "%s") { id } }' % w['id'])

    # ③ 差异必须看到未盘项（其余行未盘）
    d = gql(cookie, '{ stocktakeDiff(taskId: "%s") { uncountedCount rows { variantSku countedTotal bookQty diff } } }' % task_id)
    check('差异页可读且能列出未盘项', not d.get('errors') and d['data']['stocktakeDiff']['uncountedCount'] > 0, d.get('errors') or d['data'])

    # ④ 不 confirm 必须被拒（未盘项存在）
    p1 = gql(cookie, 'mutation { postStocktake(taskId: "%s") { ok message } }' % task_id)
    check('有未盘项时过账被拒', not p1.get('errors') and p1['data']['postStocktake']['ok'] is False, p1.get('errors') or p1['data'])

    # ⑤ confirm 过账成功
    p2 = gql(cookie, 'mutation { postStocktake(taskId: "%s", confirm: true) { ok stockDocId message } }' % task_id)
    check('过账成功并返回 stockDocId', not p2.get('errors') and p2['data']['postStocktake']['ok'] is True and p2['data']['postStocktake']['stockDocId'], p2.get('errors') or p2['data'])

    # ⑥ 重复过账被拒（幂等保护）
    p3 = gql(cookie, 'mutation { postStocktake(taskId: "%s", confirm: true) { ok } }' % task_id)
    check('重复过账被拒', bool(p3.get('errors')), p3.get('errors'))

    # ⑦ 库存已按实盘更新（目标变体被写成 0）
    after = gql(cookie, '{ stockLevels(locationId: "1", page: 1, pageSize: 1000) { items { productVariantId stockOnHand } } }')
    nb = {i['productVariantId']: i['stockOnHand'] for i in after['data']['stockLevels']['items']}
    check('过账后物理库存已更新为目标值', nb.get(target_variant) == 0, 'variant=%s before=%s after=%s' % (target_variant, book_before.get(target_variant), nb.get(target_variant)))

    # ⑧ 复位（必做）：把该变体还原为盘点前账面
    if target_variant in book_before:
        gql(cookie, 'mutation { setVariantStock(productVariantId: "%s", stockLocationId: "1", stockOnHand: %d) }' % (target_variant, book_before[target_variant]))
        back = gql(cookie, '{ stockLevels(locationId: "1", page: 1, pageSize: 1000) { items { productVariantId stockOnHand } } }')
        rb = {i['productVariantId']: i['stockOnHand'] for i in back['data']['stockLevels']['items']}
        check('库存已复位到盘点前账面', rb.get(target_variant) == book_before.get(target_variant), 'variant=%s want=%s got=%s' % (target_variant, book_before.get(target_variant), rb.get(target_variant)))
```

`write_checks` 里建任务后**不要立刻取消**，改为把 `task['id']` 返回给 `post_checks` 使用；只在 `--write` 且**不带** `--post` 时走「建完即取消」的清理路径。

- [ ] **Step 2: 跑写链路自检**

```powershell
python scripts\_probe_stocktake_local.py --write --post
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：**0 fail**。重点关注 7 条：未认领录入被拒 / 认领成功 / 录入进 COUNTING / 提交成功 / 有未盘项过账被拒 / confirm 过账成功且有 stockDocId / 重复过账被拒 / 库存更新与复位。

- [ ] **Step 3: 记录测试数据与复位动作**

把下列内容记到手册第 16 章的「测试数据与复位」小节（Task 15 落笔时用）：
- 本地过账自检生成的任务 `code`、其 `postedStockDocId`、被改动的 `variantId` 与「已复位为盘点前账面 N」的事实。

- [ ] **Step 4: 提交**

```bash
git add scripts/_probe_stocktake_local.py
git commit -m "test(stocktake): 探针扩展本地过账链路自检（含库存复位）"
```

（cwd: `d:\zhao\vshop\web-admin`）

---

## Task 8：部署后端 + 生产只读回归（不刷 nshop 快照）

**Files:**
- 无新增文件（部署动作 + 探针复跑）

**关于 R7（部署序）**：本轮**所有新增 SDL 都在 admin-api**，`shop-api` 一行未改 → **不需要**刷新 `nshop` 的 `graphql.schema.json` 快照。这一点**必须在生产用只读探针显式验证**（`shop-api` 不含盘库字段），而不是口头假设。

- [ ] **Step 1: 本地构建产物已随提交入库**

```powershell
git status --short
git log --oneline -3
```

（cwd: `d:\zhao\vendure`）预期：`packages/cjk-plugin/lib` 无未提交改动（前几个 Task 都已 build 并提交）。

- [ ] **Step 2: 推送 + 服务器拉取重启**

```powershell
git push origin HEAD
```

服务器（照既有部署路径，配货台计划记录的是 `/www/apps/vendure`）：

```bash
cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure && pm2 status
```

预期：`pm2 status` 显示 `vendure` 为 `online`；启动日志无 `Entity metadata ... was not found`。

- [ ] **Step 3: 生产只读回归**

```powershell
$env:WA_SMOKE_BASE='https://www.youshop.cn'
python scripts\_probe_stocktake_local.py
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：**0 fail**，其中三条是本次的关键证据：
1. 8 个 Query / 10 个 Mutation 在生产 admin-api 已注册；
2. `shop-api` **不含**盘库查询（有意单侧注册 + 无需刷快照的依据）；
3. `binOccupancy` 在生产返回格子且含空格。

- [ ] **Step 4: 生产渠道收口必测（规格 §12 列为必测）**

生产上 t2 渠道（配货台已验证 `activeChannel=t2`）执行：

```powershell
# ① t2 建一个任务（不产生库存影响）
python -c "..."   # 或在 Playground 用 vendors token 切到 t2 后：
mutation { createStocktakeTask(input: { stockLocationId: "<t2 的物理仓 id>", name: "渠道收口自检", activityCode: "SMOKE-T2" }) { id code } }
# ② 断言 t1（默认渠道）看不到它：切换 channel token 后
query { stocktakeTasks(options: { activityCode: "SMOKE-T2" }) { totalItems } }
# ③ 清理
mutation { cancelStocktakeTask(taskId: "<上一步 id>") { id state } }
```

预期：② 在另一渠道下 `totalItems = 0`；③ 返回 `CANCELLED`。**结论写进手册**（渠道收口是前车之鉴，必须有显式断言）。

- [ ] **Step 5: 记录部署证据**

把「push 的 commit 范围、服务器重启时间、探针 0 fail 的输出、渠道收口结论、t2 测试任务的 code 与其 CANCELLED 状态」记入手册第 16 章的「回归证据」小节（Task 15 落笔）。

---

## Task 9：前端纯函数层 + API 层 + 4 页版式 mockup 定稿

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\utils\stocktake-grid.ts`
- Create: `d:\zhao\vshop\web-admin\src\utils\stocktake-grid.spec.ts`
- Create: `d:\zhao\vshop\web-admin\src\apis\stocktake.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\storage-bin.ts`（追加 `fetchBinOccupancy`）

**前置**：Task 8 已把后端部署到生产（或本地 dev-server 已起），SDL 字段名以 Task 6 的 admin SDL 块为唯一契约。

- [ ] **Step 1: 5 个版式 mockup 内联可视化预览（R13 硬性前置）**

用 `dynamic-ui` 技能，以 `PureShowWidget` **内联渲染** 下列手机版式（390×844 比例的静态 mockup，不写真机、不建文件）：

| 编号 | 页面 | 必含元素 |
|---|---|---|
| M1 | 任务看板 | 顶部状态 Tab（全部/盘点中/待过账/已结束）、活动码分组标题、任务卡（进度条 + 「已盘 x/y」+ 盘次数 + 过账徽标）、右下「新建任务」浮动按钮 |
| M2 | 任务详情 | 头部（任务号/仓库/活动码/状态徽标）+ 进度条；盘次卡（库区名 / 负责人 / 进度 / `认领·指派·释放` 三按钮的不同可用态）；底部「查看差异并过账」（全部提交后才可用） |
| M3 | 手机录入页（版式 B） | 顶部进度 + 筛选（全部/未盘/已盘）；库区横向 Tab；格子宫格（**空格子可见** + 有货格子带 SKU 数角标 + 未盘格子描边提示）；点开格子后的行列表（SKU / 账面提示 / 数字输入 / 已盘勾）；「未归位」独立区块；底部固定条（已盘 x/y + 提交盘次 + 扫码按钮） |
| M4 | 扫码快盘（版式 C） | 大号当前 SKU + 商品名 + 账面数、实盘输入（大号数字键盘）、`+1` 快捷、上一件/下一件、顶部进度与「退出」 |
| M5 | 差异页 | 摘要四宫格（应盘 / 已盘 / 未盘 / 盘盈）；未盘项折叠清单 + 「确认跳过 N 项未盘」勾选；差异表（SKU / 实盘 / 账面 / 差异 / 归位变更 / 盘盈标记）；账面变动 `recheck` 黄色提示条；底部「过账」按钮 |

**必须停下来等用户确认版式**。用 `AskUserQuestion` 让用户在「按 M1~M5 直接定稿」与「逐页看 A/B 变体再选」之间二选一；若选后者，对争议页（通常是 M3）额外渲染 2 个变体。

**用户确认版式前不要开始 Task 10 的页面代码**（R13）。

- [ ] **Step 2: 写失败的纯函数单测**

```ts
// src/utils/stocktake-grid.spec.ts
// 运行：node --test src/utils/stocktake-grid.spec.ts
// 注意：相对导入必须带显式 .ts 扩展名（node 原生类型剥离要求，见 R12）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  binLabel, clampCounted, compareBin, diffSummary, filterLines, groupBinsByZone, isCounted,
  nextUncountedLine, parseScopeJson, scopeBadges, sortLines, taskProgress, waveProgress,
} from './stocktake-grid.ts';

const bins = [
  { zoneId: '1', zoneCode: 'A', zoneName: '常温区', binId: '11', binCode: 'A-02', rowNo: 1, levelNo: 2, skuCount: 0 },
  { zoneId: '1', zoneCode: 'A', zoneName: '常温区', binId: '10', binCode: 'A-01', rowNo: 1, levelNo: 1, skuCount: 3 },
  { zoneId: '2', zoneCode: 'B', zoneName: '冷藏区', binId: '20', binCode: 'B-01', rowNo: 1, levelNo: 1, skuCount: 1 },
];
const zones = [
  { id: '2', code: 'B', name: '冷藏区', sortOrder: 2 },
  { id: '1', code: 'A', name: '常温区', sortOrder: 1 },
];

const lineA = { id: '1', taskId: 't', waveId: 'w', variantId: '101', variantSku: 'SKU-A', variantName: '矿泉水', zoneId: '1', binId: '10', zoneCode: 'A', binCode: 'A-01', bookQty: 5, countedQty: null, isExtra: false };
const lineB = { ...lineA, id: '2', variantId: '102', variantSku: 'SKU-B', zoneCode: 'B', binCode: 'B-01', countedQty: 5 };
const lineC = { ...lineA, id: '3', variantId: '103', variantSku: 'SKU-C', zoneId: null, binId: null, zoneCode: null, binCode: null, bookQty: 0, countedQty: 2, isExtra: true };

describe('数量与已盘判定', () => {
  it('负数归 0、小数向下取整、非法值归 0', () => {
    assert.equal(clampCounted(-3), 0);
    assert.equal(clampCounted('7.9'), 7);
    assert.equal(clampCounted('abc'), 0);
    assert.equal(clampCounted(null), 0);
  });

  it('countedQty 为 null/undefined 算未盘，0 算已盘', () => {
    assert.equal(isCounted({ countedQty: null }), false);
    assert.equal(isCounted({ countedQty: undefined }), false);
    assert.equal(isCounted({ countedQty: 0 }), true);
  });
});

describe('库区 → 格子宫格（版式 B 主视图）', () => {
  it('库区按 sortOrder 排，格子按 rowNo/levelNo 排，空格子保留', () => {
    const g = groupBinsByZone(bins, zones);
    assert.deepEqual(g.map((z) => z.zoneCode), ['A', 'B']);
    assert.deepEqual(g[0].bins.map((b) => b.binCode), ['A-01', 'A-02']);
    assert.equal(g[0].bins[1].skuCount, 0);
  });

  it('库区摘要给出 SKU 合计与空格数', () => {
    const g = groupBinsByZone(bins, zones);
    assert.equal(g[0].skuTotal, 3);
    assert.equal(g[0].emptyBins, 1);
  });

  it('无库区元数据时退回行内快照的编码与名称', () => {
    const g = groupBinsByZone(bins, []);
    assert.equal(g.length, 2);
    assert.equal(g[0].zoneName, '常温区');
  });

  it('rowNo/levelNo 相同的空格子（zone 档）按编码排', () => {
    const rows = [
      { ...bins[1], binId: 'x', binCode: 'A-09', rowNo: 0, levelNo: 0 },
      { ...bins[1], binId: 'y', binCode: 'A-03', rowNo: 0, levelNo: 0 },
    ];
    assert.deepEqual([...rows].sort(compareBin).map((b) => b.binCode), ['A-03', 'A-09']);
  });
});

describe('进度计算', () => {
  it('盘次进度：已盘/应盘四舍五入；应盘 0 项视为 100%', () => {
    assert.deepEqual(waveProgress({ expectedCount: 10, countedCount: 3, state: 'COUNTING' }), { counted: 3, expected: 10, percent: 30, done: false });
    assert.equal(waveProgress({ expectedCount: 10, countedCount: 10, state: 'COUNTING' }).done, true);
    assert.equal(waveProgress({ expectedCount: 0, countedCount: 0, state: 'SUBMITTED' }).percent, 100);
    assert.equal(waveProgress({ expectedCount: 4, countedCount: 4, state: 'SUBMITTED' }).done, true);
  });

  it('任务进度：COUNTED/POSTED 视为完成，应盘 0 项为 100%', () => {
    assert.equal(taskProgress({ expectedTotal: 8, countedTotal: 2, waveCount: 3, submittedWaveCount: 1, state: 'COUNTING' }).percent, 25);
    assert.equal(taskProgress({ expectedTotal: 0, countedTotal: 0, waveCount: 1, submittedWaveCount: 1, state: 'COUNTED' }).percent, 100);
    assert.equal(taskProgress({ expectedTotal: 8, countedTotal: 8, waveCount: 3, submittedWaveCount: 3, state: 'COUNTED' }).done, true);
    assert.equal(taskProgress({ expectedTotal: 8, countedTotal: 0, waveCount: 3, submittedWaveCount: 0, state: 'OPEN' }).done, false);
  });
});

describe('应盘行排序与筛选', () => {
  it('未盘行优先，其次按库区码 → 库位码 → SKU；未归位（无库区码）排最后', () => {
    assert.deepEqual(sortLines([lineB, lineC, lineA]).map((l) => l.id), ['1', '2', '3']);
  });

  it('筛选：未盘 / 已盘 / 盘盈 / 差异四类，多条件为「与」', () => {
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyUncounted: true }).map((l) => l.id), ['1']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyCounted: true }).map((l) => l.id), ['2', '3']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyExtra: true }).map((l) => l.id), ['3']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyDiff: true }).map((l) => l.id), ['3']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyCounted: true, onlyUncounted: true }), []);
  });
});

describe('圈范围与差异摘要', () => {
  it('scopeJson 容错解析：坏 JSON / null 一律退回默认，缺 includeZeroBook 按 true', () => {
    assert.deepEqual(parseScopeJson(null), { zones: [], categoryIds: [], variantIds: [], includeZeroBook: true });
    assert.deepEqual(parseScopeJson('not-json'), { zones: [], categoryIds: [], variantIds: [], includeZeroBook: true });
    assert.deepEqual(parseScopeJson('{"zones":[1,"2"],"includeZeroBook":false}'), { zones: [1, 2], categoryIds: [], variantIds: [], includeZeroBook: false });
    assert.equal(parseScopeJson('{}').includeZeroBook, true);
  });

  it('圈范围徽标：空范围给 ALL，有范围给「维度:数量」', () => {
    assert.deepEqual(scopeBadges(parseScopeJson(null)), ['ALL']);
    assert.deepEqual(scopeBadges({ zones: [1, 2], categoryIds: [], variantIds: [], includeZeroBook: true }), ['Z:2']);
  });

  it('差异摘要：有未盘项或账面变动 → needConfirm', () => {
    assert.equal(diffSummary({ expectedTotal: 10, countedTotal: 7, uncountedCount: 3, extraCount: 0, diffCount: 0, recheck: false }).needConfirm, true);
    assert.equal(diffSummary({ expectedTotal: 10, countedTotal: 10, uncountedCount: 0, extraCount: 0, diffCount: 0, recheck: true }).needConfirm, true);
    assert.equal(diffSummary({ expectedTotal: 10, countedTotal: 10, uncountedCount: 0, extraCount: 1, diffCount: 1, recheck: false }).needConfirm, false);
  });

  it('格子标签：bin 档给库位码，zone 档给库区码，都缺给占位符', () => {
    assert.equal(binLabel({ zoneCode: 'A', binCode: 'A-01' }, true), 'A-01');
    assert.equal(binLabel({ zoneCode: 'A', binCode: 'A-01' }, false), 'A');
    assert.equal(binLabel({ zoneCode: null, binCode: null }, true), '—');
  });
});

describe('单件专注（版式 C）的下一件', () => {
  it('从当前件之后循环找未盘；全盘完返回 null；当前件为空时取第一件未盘', () => {
    const rows = [lineA, lineB, lineC];
    assert.equal(nextUncountedLine(rows, '2')?.id, '1');
    assert.equal(nextUncountedLine(rows, null)?.id, '1');
    assert.equal(nextUncountedLine([lineB, lineC], '2'), null);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```powershell
node --test src\utils\stocktake-grid.spec.ts
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：FAIL，报 `Cannot find module './stocktake-grid.ts'`。

- [ ] **Step 4: 实现 `stocktake-grid.ts`**

```ts
// 盘库页面纯函数层（无 uni / 无网络 / 无 store 依赖，可被 node --test 直接跑）
// 契约来源：cjk-plugin/src/plugin.ts adminApiExtensions 的盘库 SDL（Task 6 落地）
// 依赖方向：页面 → useStocktakeScope → apis/stocktake → 本文件（纯函数只在最底层，不许反向 import）

export interface StocktakeLineRow {
  id: string;
  taskId: string;
  waveId: string;
  variantId: string;
  variantSku: string;
  variantName: string;
  zoneId?: string | null;
  binId?: string | null;
  zoneCode?: string | null;
  binCode?: string | null;
  bookQty: number;
  countedQty?: number | null;
  isExtra: boolean;
  countedById?: string | null;
  countedByName?: string | null;
  countedAt?: string | null;
  note?: string | null;
}

export interface BinOccupancyRow {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  binId: string;
  binCode: string;
  rowNo?: number | null;
  levelNo?: number | null;
  skuCount: number;
}

export interface ZoneLike {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
}

export interface ZoneGroup {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  bins: BinOccupancyRow[];
  skuTotal: number;
  emptyBins: number;
}

export interface WaveLike {
  expectedCount: number;
  countedCount: number;
  state: string;
}

export interface TaskLike {
  expectedTotal: number;
  countedTotal: number;
  waveCount: number;
  submittedWaveCount: number;
  state: string;
}

export interface Progress {
  counted: number;
  expected: number;
  percent: number;
  done: boolean;
}

export interface ScopeShape {
  zones: number[];
  categoryIds: number[];
  variantIds: number[];
  includeZeroBook: boolean;
}

export interface DiffLike {
  expectedTotal: number;
  countedTotal: number;
  uncountedCount: number;
  extraCount: number;
  diffCount: number;
  recheck: boolean;
}

export type LineFilter = {
  onlyCounted?: boolean;
  onlyUncounted?: boolean;
  onlyDiff?: boolean;
  onlyExtra?: boolean;
};

export const DEFAULT_SCOPE: ScopeShape = { zones: [], categoryIds: [], variantIds: [], includeZeroBook: true };

/** 数量钳制：负值归 0，小数向下取整，非法值归 0（SDL countedQty 为非负 int） */
export function clampCounted(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** 是否已盘（countedQty 非 null/undefined；0 也是已盘） */
export function isCounted(line: Pick<StocktakeLineRow, 'countedQty'>): boolean {
  return line.countedQty !== null && line.countedQty !== undefined;
}

/** 格子排序键：行号 → 层号 → 编码（zone 档 rowNo/levelNo 为 null 时退化为编码序） */
export function compareBin(a: BinOccupancyRow, b: BinOccupancyRow): number {
  const r = (a.rowNo ?? 0) - (b.rowNo ?? 0);
  if (r !== 0) return r;
  const l = (a.levelNo ?? 0) - (b.levelNo ?? 0);
  if (l !== 0) return l;
  return String(a.binCode ?? '').localeCompare(String(b.binCode ?? ''));
}

/** 库区 → 格子宫格：空格子保留（一眼看出漏盘），库区按 sortOrder → 编码排 */
export function groupBinsByZone(rows: BinOccupancyRow[], zones: ZoneLike[]): ZoneGroup[] {
  const order = new Map<string, number>();
  const meta = new Map<string, ZoneLike>();
  (zones || []).forEach((z) => {
    order.set(String(z.id), z.sortOrder ?? 0);
    meta.set(String(z.id), z);
  });

  const buckets = new Map<string, BinOccupancyRow[]>();
  (rows || []).forEach((r) => {
    const k = String(r.zoneId);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  });

  return [...buckets.entries()]
    .map(([zoneId, bins]) => {
      const z = meta.get(zoneId);
      const sorted = [...bins].sort(compareBin);
      return {
        zoneId,
        zoneCode: z?.code ?? bins[0]?.zoneCode ?? zoneId,
        zoneName: z?.name ?? bins[0]?.zoneName ?? '',
        bins: sorted,
        skuTotal: sorted.reduce((s, b) => s + (Number(b.skuCount) || 0), 0),
        emptyBins: sorted.filter((b) => !Number(b.skuCount)).length,
      };
    })
    .sort((a, b) => (order.get(a.zoneId) ?? 0) - (order.get(b.zoneId) ?? 0) || a.zoneCode.localeCompare(b.zoneCode));
}

const pct = (counted: number, expected: number): number =>
  expected > 0 ? Math.min(100, Math.round((counted / expected) * 100)) : 100;

/** 盘次进度（分母 = expectedCount 快照，不随盘盈行变化） */
export function waveProgress(w: WaveLike): Progress {
  const expected = Math.max(0, Math.floor(Number(w?.expectedCount) || 0));
  const counted = Math.max(0, Math.floor(Number(w?.countedCount) || 0));
  return {
    counted,
    expected,
    percent: pct(counted, expected),
    done: w?.state === 'SUBMITTED' || (expected > 0 && counted >= expected),
  };
}

/** 任务进度（看板卡片进度条） */
export function taskProgress(t: TaskLike): Progress {
  const expected = Math.max(0, Math.floor(Number(t?.expectedTotal) || 0));
  const counted = Math.max(0, Math.floor(Number(t?.countedTotal) || 0));
  return {
    counted,
    expected,
    percent: pct(counted, expected),
    done: t?.state === 'POSTED' || t?.state === 'COUNTED' || (expected > 0 && counted >= expected),
  };
}

/** 应盘行排序：未盘优先 → 库区码 → 库位码 → SKU；未归位（无库区码）排最后 */
export function compareLine(a: StocktakeLineRow, b: StocktakeLineRow): number {
  const ua = isCounted(a) ? 1 : 0;
  const ub = isCounted(b) ? 1 : 0;
  if (ua !== ub) return ua - ub;
  const az = a.zoneCode ?? '\uffff';
  const bz = b.zoneCode ?? '\uffff';
  if (az !== bz) return az.localeCompare(bz);
  const ab = a.binCode ?? '\uffff';
  const bb = b.binCode ?? '\uffff';
  if (ab !== bb) return ab.localeCompare(bb);
  return String(a.variantSku ?? '').localeCompare(String(b.variantSku ?? ''));
}

export function sortLines(lines: StocktakeLineRow[]): StocktakeLineRow[] {
  return [...(lines || [])].sort(compareLine);
}

/** 行筛选（规格 §7「未盘点可单独筛出」）：多条件是「与」关系；onlyDiff 为行级近似，精确差异按变体见差异页 */
export function filterLines(lines: StocktakeLineRow[], filter?: LineFilter): StocktakeLineRow[] {
  const f = filter || {};
  return (lines || []).filter((l) => {
    if (f.onlyCounted && !isCounted(l)) return false;
    if (f.onlyUncounted && isCounted(l)) return false;
    if (f.onlyExtra && !l.isExtra) return false;
    if (f.onlyDiff && !(l.isExtra || (isCounted(l) && Number(l.countedQty) !== Number(l.bookQty)))) return false;
    return true;
  });
}

/** scopeJson 容错解析：坏 JSON / 缺字段一律退回默认（绝不抛错，页面不能因脏数据白屏） */
export function parseScopeJson(raw?: string | null): ScopeShape {
  if (!raw) return { ...DEFAULT_SCOPE };
  try {
    const o = JSON.parse(raw);
    const arr = (v: unknown): number[] =>
      Array.isArray(v) ? v.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    return {
      zones: arr(o?.zones),
      categoryIds: arr(o?.categoryIds),
      variantIds: arr(o?.variantIds),
      includeZeroBook: o?.includeZeroBook === undefined ? true : !!o.includeZeroBook,
    };
  } catch {
    return { ...DEFAULT_SCOPE };
  }
}

/** 圈范围徽标片段（页面用 i18n 模板拼：`ALL` / `Z:2` / `C:1,V:3`） */
export function scopeBadges(scope: ScopeShape): string[] {
  const out: string[] = [];
  if (scope.zones?.length) out.push(`Z:${scope.zones.length}`);
  if (scope.categoryIds?.length) out.push(`C:${scope.categoryIds.length}`);
  if (scope.variantIds?.length) out.push(`V:${scope.variantIds.length}`);
  return out.length ? out : ['ALL'];
}

/** 差异页摘要：未盘项或账面变动都需要用户显式确认后才能过账（规格 §3.5/§6.2） */
export function diffSummary(d: DiffLike): { uncounted: number; extra: number; diff: number; needConfirm: boolean } {
  const uncounted = Math.max(0, Number(d?.uncountedCount) || 0);
  const extra = Math.max(0, Number(d?.extraCount) || 0);
  const diff = Math.max(0, Number(d?.diffCount) || 0);
  return { uncounted, extra, diff, needConfirm: uncounted > 0 || !!d?.recheck };
}

/** 格子标签：bin 档给库位码，zone 档只给库区码 */
export function binLabel(row: { zoneCode?: string | null; binCode?: string | null }, showBin: boolean): string {
  const bin = row?.binCode || null;
  if (showBin && bin) return bin;
  return row?.zoneCode || bin || '—';
}

/** 单件专注（版式 C）的「下一件未盘」：从 currentId 之后循环找，全盘完返回 null */
export function nextUncountedLine(lines: StocktakeLineRow[], currentId?: string | null): StocktakeLineRow | null {
  const rows = sortLines(lines);
  if (!rows.length) return null;
  const idx = currentId ? rows.findIndex((l) => String(l.id) === String(currentId)) : -1;
  for (let i = 1; i <= rows.length; i++) {
    const cand = rows[(idx + i + rows.length) % rows.length];
    if (!isCounted(cand)) return cand;
  }
  return null;
}
```

- [ ] **Step 5: 跑测试确认通过**

```powershell
node --test src\utils\stocktake-grid.spec.ts
```

预期：PASS，13 个用例全绿（`pass 13 / fail 0`）。

- [ ] **Step 6: 写 `apis/stocktake.ts`（6 查询 + 10 变更）**

照 `apis/storage-bin.ts` 的风格：`getAdminClient()` + `graphQlErrorMsg(e, '…失败')`，字段名逐字对齐 Task 6 的 SDL。

```ts
// 盘库域 admin-api 调用（Task 9）
// 契约来源：cjk-plugin/src/plugin.ts 的 adminApiExtensions 盘库 SDL 块（仅 admin 注册，规格 §3.8）
// 注意：scopeJson 在 SDL 里是 String（前端自行 parseScopeJson）；日期字段是 DateTime（字符串）。
import { getAdminClient, graphQlErrorMsg } from './client';
import type { BinOccupancyRow, StocktakeLineRow } from '../utils/stocktake-grid';

export interface StocktakeTask {
  id: string;
  code: string;
  stockLocationId: string;
  locationName?: string | null;
  activityCode?: string | null;
  name: string;
  scopeJson: string;
  binModeAtCreate: string;
  state: string;
  createdById?: string | null;
  createdByName?: string | null;
  postedStockDocId?: string | null;
  postedAt?: string | null;
  note?: string | null;
  createdAt: string;
  expectedTotal: number;
  countedTotal: number;
  waveCount: number;
  submittedWaveCount: number;
}

export interface StocktakeWave {
  id: string;
  taskId: string;
  scopeType: string;
  zoneId?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  state: string;
  expectedCount: number;
  countedCount: number;
  claimedAt?: string | null;
  submittedAt?: string | null;
}

export interface StocktakeVarianceRow {
  variantId: string;
  variantSku: string;
  variantName: string;
  countedTotal: number;
  bookQty: number;
  diff: number;
  isExtra: boolean;
  binChanged: boolean;
  targetZoneId?: string | null;
  targetBinId?: string | null;
  targetBinCode?: string | null;
  snapBookQty: number;
  currentBookQty: number;
}

export interface StocktakeDiff {
  expectedTotal: number;
  countedTotal: number;
  uncountedCount: number;
  extraCount: number;
  diffCount: number;
  rows: StocktakeVarianceRow[];
  uncountedLines: StocktakeLineRow[];
  recheck: boolean;
  changedVariants: { variantId: string; variantSku: string; snapBookQty: number; currentBookQty: number }[];
}

export interface StocktakeScanHit {
  kind: string;
  binId?: string | null;
  binCode?: string | null;
  zoneId?: string | null;
  lineId?: string | null;
  variantId?: string | null;
  variantSku?: string | null;
  variantName?: string | null;
  message?: string | null;
}

const TASK_FIELDS = `id code stockLocationId locationName activityCode name scopeJson binModeAtCreate state
  createdById createdByName postedStockDocId postedAt note createdAt
  expectedTotal countedTotal waveCount submittedWaveCount`;

const WAVE_FIELDS = `id taskId scopeType zoneId zoneCode zoneName assigneeId assigneeName state
  expectedCount countedCount claimedAt submittedAt`;

const LINE_FIELDS = `id taskId waveId variantId variantSku variantName zoneId binId zoneCode binCode
  bookQty countedQty isExtra countedById countedByName countedAt note`;

const DIFF_FIELDS = `
  expectedTotal countedTotal uncountedCount extraCount diffCount recheck
  rows { variantId variantSku variantName countedTotal bookQty diff isExtra binChanged targetZoneId targetBinId targetBinCode snapBookQty currentBookQty }
  uncountedLines { ${LINE_FIELDS} }
  changedVariants { variantId variantSku snapBookQty currentBookQty }`;

// ---------------------------------------------------------------- 查询

/** 任务列表（按渠道收口在服务端；state/activityCode/stockLocationId 为可选筛选） */
export async function fetchStocktakeTasks(options?: {
  page?: number; pageSize?: number; state?: string; activityCode?: string; stockLocationId?: string;
}): Promise<{ totalItems: number; items: StocktakeTask[] }> {
  try {
    const r = await getAdminClient().request<{ stocktakeTasks: { totalItems: number; items: StocktakeTask[] } }>(
      `query StocktakeTasks($options: StocktakeTaskOptionsInput) {
        stocktakeTasks(options: $options) { totalItems items { ${TASK_FIELDS} } }
      }`,
      {
        options: {
          page: options?.page ?? 1,
          pageSize: options?.pageSize ?? 20,
          state: options?.state ?? null,
          activityCode: options?.activityCode ?? null,
          stockLocationId: options?.stockLocationId ?? null,
        },
      },
    );
    return r.stocktakeTasks ?? { totalItems: 0, items: [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务查询失败'));
  }
}

/** 任务详情（不存在返回 null） */
export async function fetchStocktakeTask(id: string): Promise<StocktakeTask | null> {
  try {
    const r = await getAdminClient().request<{ stocktakeTask: StocktakeTask | null }>(
      `query StocktakeTask($id: ID!) { stocktakeTask(id: $id) { ${TASK_FIELDS} } }`,
      { id },
    );
    return r.stocktakeTask ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务详情查询失败'));
  }
}

/** 盘次列表（含未认领；按 zoneCode 排序由服务端保证，前端只做展示） */
export async function fetchStocktakeWaves(taskId: string): Promise<StocktakeWave[]> {
  try {
    const r = await getAdminClient().request<{ stocktakeWaves: StocktakeWave[] }>(
      `query StocktakeWaves($taskId: ID!) { stocktakeWaves(taskId: $taskId) { ${WAVE_FIELDS} } }`,
      { taskId },
    );
    return r.stocktakeWaves ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点盘次查询失败'));
  }
}

/** 应盘行（waveId 可空 = 全任务；filter/keyword 由服务端过滤） */
export async function fetchStocktakeExpectedLines(args: {
  taskId: string; waveId?: string | null; filter?: Record<string, boolean> | null;
  keyword?: string | null; page?: number; pageSize?: number;
}): Promise<{ totalItems: number; items: StocktakeLineRow[] }> {
  try {
    const r = await getAdminClient().request<{ stocktakeExpectedLines: { totalItems: number; items: StocktakeLineRow[] } }>(
      `query StocktakeExpectedLines($taskId: ID!, $waveId: ID, $filter: StocktakeLineFilterInput, $keyword: String, $page: Int, $pageSize: Int) {
        stocktakeExpectedLines(taskId: $taskId, waveId: $waveId, filter: $filter, keyword: $keyword, page: $page, pageSize: $pageSize) {
          totalItems items { ${LINE_FIELDS} }
        }
      }`,
      {
        taskId: args.taskId,
        waveId: args.waveId ?? null,
        filter: args.filter ?? null,
        keyword: args.keyword ?? null,
        page: args.page ?? 1,
        pageSize: args.pageSize ?? 200,
      },
    );
    return r.stocktakeExpectedLines ?? { totalItems: 0, items: [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '应盘清单查询失败'));
  }
}

/** 差异（过账前唯一决策点） */
export async function fetchStocktakeDiff(taskId: string): Promise<StocktakeDiff> {
  try {
    const r = await getAdminClient().request<{ stocktakeDiff: StocktakeDiff }>(
      `query StocktakeDiff($taskId: ID!) { stocktakeDiff(taskId: $taskId) { ${DIFF_FIELDS} } }`,
      { taskId },
    );
    return r.stocktakeDiff;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点差异查询失败'));
  }
}

/** 扫码解析：库位码 → 定位格子；内部码/条形码 → 命中断行；两者都不是 → 清单外盘盈候选 */
export async function resolveStocktakeCode(taskId: string, code: string): Promise<StocktakeScanHit> {
  try {
    const r = await getAdminClient().request<{ stocktakeResolveCode: StocktakeScanHit }>(
      `query StocktakeResolveCode($taskId: ID!, $code: String!) {
        stocktakeResolveCode(taskId: $taskId, code: $code) { kind binId binCode zoneId lineId variantId variantSku variantName message }
      }`,
      { taskId, code },
    );
    return r.stocktakeResolveCode;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '扫码解析失败'));
  }
}

// ---------------------------------------------------------------- 变更

/** 建任务（服务端在同一事务内固化应盘清单 + 拆盘次） */
export async function createStocktakeTask(input: {
  stockLocationId: string; name: string; activityCode?: string | null;
  scope?: { zones?: number[]; categoryIds?: number[]; variantIds?: number[]; includeZeroBook?: boolean } | null;
  autoSplitByZone?: boolean | null; note?: string | null;
}): Promise<StocktakeTask> {
  try {
    const r = await getAdminClient().request<{ createStocktakeTask: StocktakeTask }>(
      `mutation CreateStocktakeTask($input: StocktakeTaskInput!) { createStocktakeTask(input: $input) { ${TASK_FIELDS} } }`,
      {
        input: {
          stockLocationId: input.stockLocationId,
          name: input.name,
          activityCode: input.activityCode ?? null,
          scope: input.scope ?? null,
          autoSplitByZone: input.autoSplitByZone ?? null,
          note: input.note ?? null,
        },
      },
    );
    return r.createStocktakeTask;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务创建失败'));
  }
}

/** 追加盘次（本轮最小实现：服务端会返回「暂不支持」的明确原因） */
export async function addStocktakeWave(taskId: string, input: { scopeType: string; zoneId?: string | null }): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ addStocktakeWave: StocktakeWave }>(
      `mutation AddStocktakeWave($taskId: ID!, $input: StocktakeWaveInput!) { addStocktakeWave(taskId: $taskId, input: $input) { ${WAVE_FIELDS} } }`,
      { taskId, input: { scopeType: input.scopeType, zoneId: input.zoneId ?? null } },
    );
    return r.addStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次新增失败'));
  }
}

/** 指派（assigneeId 传 null 表示改为待认领） */
export async function assignStocktakeWave(waveId: string, assigneeId?: string | null): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ assignStocktakeWave: StocktakeWave }>(
      `mutation AssignStocktakeWave($waveId: ID!, $assigneeId: String) { assignStocktakeWave(waveId: $waveId, assigneeId: $assigneeId) { ${WAVE_FIELDS} } }`,
      { waveId, assigneeId: assigneeId ?? null },
    );
    return r.assignStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次指派失败'));
  }
}

/** 认领（独占锁定；他人已认领会被拒并回传原因） */
export async function claimStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ claimStocktakeWave: StocktakeWave }>(
      `mutation ClaimStocktakeWave($waveId: ID!) { claimStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.claimStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次认领失败'));
  }
}

/** 释放（退回待认领，清空负责人） */
export async function releaseStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ releaseStocktakeWave: StocktakeWave }>(
      `mutation ReleaseStocktakeWave($waveId: ID!) { releaseStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.releaseStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次释放失败'));
  }
}

/** 批量录入（lineId 命中清单行；variantId 用于清单外盘盈行） */
export async function saveStocktakeCounts(
  waveId: string,
  inputs: { lineId?: string | null; variantId?: string | null; countedQty: number; zoneId?: string | null; binId?: string | null; note?: string | null }[],
): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ saveStocktakeCounts: StocktakeWave }>(
      `mutation SaveStocktakeCounts($waveId: ID!, $inputs: [StocktakeCountEntryInput!]!) { saveStocktakeCounts(waveId: $waveId, inputs: $inputs) { ${WAVE_FIELDS} } }`,
      {
        waveId,
        inputs: inputs.map((i) => ({
          lineId: i.lineId ?? null,
          variantId: i.variantId ?? null,
          countedQty: i.countedQty,
          zoneId: i.zoneId ?? null,
          binId: i.binId ?? null,
          note: i.note ?? null,
        })),
      },
    );
    return r.saveStocktakeCounts;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点录入失败'));
  }
}

/** 提交盘次（终态；提交后不可再录入） */
export async function submitStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ submitStocktakeWave: StocktakeWave }>(
      `mutation SubmitStocktakeWave($waveId: ID!) { submitStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.submitStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次提交失败'));
  }
}

/** 过账（confirm=true 才允许跳过未盘项/接受账面变动） */
export async function postStocktake(
  taskId: string,
  confirm = false,
): Promise<{ ok: boolean; stockDocId?: string | null; diff?: StocktakeDiff | null; message?: string | null }> {
  try {
    const r = await getAdminClient().request<{ postStocktake: { ok: boolean; stockDocId?: string | null; diff?: StocktakeDiff | null; message?: string | null } }>(
      `mutation PostStocktake($taskId: ID!, $confirm: Boolean) {
        postStocktake(taskId: $taskId, confirm: $confirm) { ok stockDocId message diff { ${DIFF_FIELDS} } }
      }`,
      { taskId, confirm },
    );
    return r.postStocktake;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点过账失败'));
  }
}

/** 取消任务（非终态可取消） */
export async function cancelStocktakeTask(taskId: string): Promise<StocktakeTask> {
  try {
    const r = await getAdminClient().request<{ cancelStocktakeTask: StocktakeTask }>(
      `mutation CancelStocktakeTask($taskId: ID!) { cancelStocktakeTask(taskId: $taskId) { ${TASK_FIELDS} } }`,
      { taskId },
    );
    return r.cancelStocktakeTask;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务取消失败'));
  }
}

/** 取消单个盘次（任务状态随之派生） */
export async function cancelStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ cancelStocktakeWave: StocktakeWave }>(
      `mutation CancelStocktakeWave($waveId: ID!) { cancelStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.cancelStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次取消失败'));
  }
}
```

- [ ] **Step 7: 在 `apis/storage-bin.ts` 末尾追加占用概览查询**

`binOccupancy` 属于库位域，不放 stocktake（避免域混装）：

```ts
/** 库位占用概览（含空格子；zoneId 可选，不传取全仓） */
export async function fetchBinOccupancy(stockLocationId: string, zoneId?: string): Promise<BinOccupancyRow[]> {
  try {
    const { binOccupancy } = await getAdminClient().request<{ binOccupancy: BinOccupancyRow[] }>(
      `query BinOccupancy($stockLocationId: ID!, $zoneId: ID) {
        binOccupancy(stockLocationId: $stockLocationId, zoneId: $zoneId) {
          zoneId zoneCode zoneName binId binCode rowNo levelNo skuCount
        }
      }`,
      { stockLocationId, zoneId: zoneId ?? null },
    );
    return binOccupancy ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库位占用查询失败'));
  }
}
```

文件顶部补 import：

```ts
import type { BinOccupancyRow } from '../utils/stocktake-grid';
```

- [ ] **Step 8: 类型检查**

```powershell
npx vue-tsc --noEmit -p tsconfig.json
```

（cwd: `d:\zhao\vshop\web-admin`；若该仓库没有此脚本，用 `npx tsc --noEmit` 或 `npm run lint`，以仓库既有命令为准）

预期：exit 0，无新增类型错误。

- [ ] **Step 9: 提交**

```bash
git add src/utils/stocktake-grid.ts src/utils/stocktake-grid.spec.ts src/apis/stocktake.ts src/apis/storage-bin.ts
git commit -m "feat(stocktake): 前端盘库 API 层与纯函数层（含单测）"
```

（cwd: `d:\zhao\vshop`）

---

## Task 10：任务看板页（`pages/inventory/stocktake/index.vue`）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\stocktake\TaskCard.vue`
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（增量注册本页）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`src\locale\en.json`（`stocktake.board.*` / `stocktake.state.*`）

**版式**：以 Task 9 Step 1 用户确认的 M1 为准。

- [ ] **Step 1: 注册页面（`pages.json`）**

在 `pages/inventory/bins/index` 那一行之后插入：

```json
    { "path": "pages/inventory/stocktake/index", "style": { "navigationBarTitleText": "协同盘库", "enablePullDownRefresh": true } },
```

- [ ] **Step 2: 补 i18n 词条（中英同步，R9）**

`src/locale/zh-Hans.json`（与既有 `inventoryBin` 同级，插在其后）：

```json
  "stocktake": {
    "state": {
      "DRAFT": "草稿",
      "OPEN": "待认领",
      "COUNTING": "盘点中",
      "COUNTED": "待过账",
      "POSTED": "已过账",
      "CANCELLED": "已取消"
    },
    "waveState": {
      "OPEN": "待认领",
      "CLAIMED": "已认领",
      "COUNTING": "录入中",
      "SUBMITTED": "已提交",
      "CANCELLED": "已取消"
    },
    "board": {
      "title": "协同盘库",
      "tabAll": "全部",
      "tabCounting": "盘点中",
      "tabToPost": "待过账",
      "tabClosed": "已结束",
      "newTask": "新建盘点任务",
      "pickWarehouse": "请先选择仓库",
      "activityGroup": "盘点活动 {code}",
      "activityNone": "未分组",
      "progress": "已盘 {done}/{total}",
      "waves": "{done}/{total} 盘次已提交",
      "postedDoc": "过账单据 {code}",
      "empty": "暂无盘点任务",
      "loading": "加载中…",
      "loadFailed": "盘点任务加载失败",
      "formWarehouse": "仓库 *",
      "formSelectWarehouse": "请选择仓库",
      "formName": "任务名称 *",
      "formNamePlaceholder": "如：9 月全仓盘点",
      "formActivity": "盘点活动码（多仓分组，可空）",
      "formActivityPlaceholder": "如：202609",
      "formZones": "圈定库区（不选 = 全仓）",
      "formCategories": "圈定分类（不选 = 全部）",
      "formVariants": "指定变体 ID（逗号分隔，可空）",
      "formIncludeZero": "包含账面为 0 的变体",
      "formAutoSplit": "按库区自动拆盘次",
      "formSubmit": "创建任务",
      "formSubmitting": "创建中…",
      "formRequireWarehouse": "请选择仓库",
      "formRequireName": "请填写任务名称",
      "createDone": "已创建 {code}（{waves} 个盘次）",
      "createFailed": "创建失败",
      "scopeAll": "全仓",
      "modeOffHint": "当前店铺未开启库区/库位，将按整仓单个盘次盘点"
    }
  },
```

`src/locale/en.json`（同结构、同键，值用英文）：

```json
  "stocktake": {
    "state": {
      "DRAFT": "Draft",
      "OPEN": "Open",
      "COUNTING": "Counting",
      "COUNTED": "To post",
      "POSTED": "Posted",
      "CANCELLED": "Cancelled"
    },
    "waveState": {
      "OPEN": "Open",
      "CLAIMED": "Claimed",
      "COUNTING": "Counting",
      "SUBMITTED": "Submitted",
      "CANCELLED": "Cancelled"
    },
    "board": {
      "title": "Stocktake",
      "tabAll": "All",
      "tabCounting": "Counting",
      "tabToPost": "To post",
      "tabClosed": "Closed",
      "newTask": "New stocktake task",
      "pickWarehouse": "Pick a warehouse first",
      "activityGroup": "Activity {code}",
      "activityNone": "Ungrouped",
      "progress": "Counted {done}/{total}",
      "waves": "{done}/{total} waves submitted",
      "postedDoc": "Posted doc {code}",
      "empty": "No stocktake task",
      "loading": "Loading…",
      "loadFailed": "Failed to load tasks",
      "formWarehouse": "Warehouse *",
      "formSelectWarehouse": "Pick a warehouse",
      "formName": "Task name *",
      "formNamePlaceholder": "e.g. September full count",
      "formActivity": "Activity code (multi-warehouse grouping, optional)",
      "formActivityPlaceholder": "e.g. 202609",
      "formZones": "Zones in scope (none = whole warehouse)",
      "formCategories": "Categories in scope (none = all)",
      "formVariants": "Variant IDs (comma separated, optional)",
      "formIncludeZero": "Include variants with zero book qty",
      "formAutoSplit": "Split waves by zone",
      "formSubmit": "Create task",
      "formSubmitting": "Creating…",
      "formRequireWarehouse": "Pick a warehouse",
      "formRequireName": "Task name is required",
      "createDone": "Created {code} ({waves} waves)",
      "createFailed": "Create failed",
      "scopeAll": "Whole warehouse",
      "modeOffHint": "Bins are disabled for this shop; counting will run as one whole-warehouse wave"
    }
  },
```

**JSON 合法性自检**：

```powershell
node -e "JSON.parse(require('fs').readFileSync('src/locale/zh-Hans.json','utf8'));JSON.parse(require('fs').readFileSync('src/locale/en.json','utf8'));console.log('ok')"
```

（cwd: `d:\zhao\vshop\web-admin`）预期 `ok`。

- [ ] **Step 3: 写 `components/stocktake/TaskCard.vue`**

```vue
<template>
  <!-- 任务卡片：任务号 / 仓 / 状态徽标 / 进度条 / 盘次进度 / 过账单据 -->
  <view class="tcard" @tap="emit('open')">
    <view class="top">
      <text class="code">{{ task.code }}</text>
      <text class="st" :class="stateClass">{{ $t('stocktake.state.' + task.state) }}</text>
    </view>
    <view class="mid">
      <text class="wh">{{ task.locationName || '—' }}</text>
      <text class="cnt">{{ $t('stocktake.board.progress').replace('{done}', String(p.counted)).replace('{total}', String(p.expected)) }}</text>
    </view>
    <view class="bar"><view class="fill" :style="{ width: p.percent + '%' }" /></view>
    <view class="foot">
      <text class="nm">{{ task.name }}</text>
      <text class="wv">{{ $t('stocktake.board.waves').replace('{done}', String(task.submittedWaveCount)).replace('{total}', String(task.waveCount)) }}</text>
    </view>
    <view v-if="task.postedStockDocId" class="doc">
      {{ $t('stocktake.board.postedDoc').replace('{code}', String(task.postedStockDocId)) }}
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { StocktakeTask } from '../../apis/stocktake';
import { taskProgress } from '../../utils/stocktake-grid';

const props = defineProps<{ task: StocktakeTask }>();
const emit = defineEmits<{ (e: 'open'): void }>();

const p = computed(() => taskProgress(props.task));

// 状态 → 徽标配色（状态机六值固定，见规格 §5）
const stateClass = computed(() => {
  switch (props.task.state) {
    case 'POSTED': return 'ok';
    case 'COUNTED': return 'ready';
    case 'CANCELLED': return 'dead';
    case 'COUNTING': return 'doing';
    default: return 'idle';
  }
});
</script>

<style lang="scss" scoped>
.tcard {
  background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx;
  .top { display: flex; align-items: center;
    .code { flex: 1; font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-muted;
      &.idle { background: $wa-muted; }
      &.doing { background: $wa-accent; }
      &.ready { background: $wa-ink; }
      &.ok { background: $wa-success; }
      &.dead { background: $wa-muted; }
    }
  }
  .mid { display: flex; align-items: center; margin-top: 14rpx;
    .wh { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .cnt { font-size: 24rpx; color: $wa-muted; }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin-top: 14rpx; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; border-radius: 6rpx; }
  }
  .foot { display: flex; align-items: center; margin-top: 12rpx;
    .nm { flex: 1; font-size: 23rpx; color: $wa-muted; }
    .wv { font-size: 23rpx; color: $wa-muted; }
  }
  .doc { margin-top: 10rpx; font-size: 22rpx; color: $wa-success; }
}
</style>
```

- [ ] **Step 4: 写看板页 `pages/inventory/stocktake/index.vue`**

```vue
<template>
  <view class="page">
    <!-- ① 状态 Tab -->
    <view class="tabs">
      <view v-for="t in tabs" :key="t.key" class="tb" :class="{ on: tab === t.key }" @tap="switchTab(t.key)">
        <text class="tl">{{ $t(t.label) }}</text>
      </view>
    </view>

    <!-- ② 仓库筛选 -->
    <view class="filter">
      <picker mode="selector" :range="locNames" @change="onLocChange">
        <view class="picker">{{ curLocName || $t('stocktake.board.pickWarehouse') }} ▾</view>
      </picker>
      <text v-if="locId" class="clear" @tap="clearLoc">✕</text>
    </view>

    <!-- ③ 任务列表：按 activityCode 分组（多仓协同 = 同活动码合并展示） -->
    <view v-for="grp in groups" :key="grp.key" class="group">
      <text class="gh">{{ grp.label }}</text>
      <TaskCard v-for="t in grp.items" :key="t.id" :task="t" @open="goTask(t.id)" />
    </view>

    <view v-if="loading && !tasks.length" class="more">{{ $t('stocktake.board.loading') }}</view>
    <view v-else-if="!tasks.length" class="empty">{{ $t('stocktake.board.empty') }}</view>

    <!-- ④ 新建任务浮动按钮 -->
    <view class="fab" @tap="openForm">＋ {{ $t('stocktake.board.newTask') }}</view>

    <!-- ⑤ 新建任务表单 -->
    <view v-if="formVisible" class="mask" @tap="formVisible = false">
      <view class="sheet" @tap.stop>
        <text class="st">{{ $t('stocktake.board.newTask') }}</text>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formWarehouse') }}</text>
          <picker mode="selector" :range="locNames" @change="onFormLocChange">
            <view class="pk">{{ formLocName || $t('stocktake.board.formSelectWarehouse') }} ▾</view>
          </picker>
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formName') }}</text>
          <input class="ipt" v-model="form.name" :placeholder="$t('stocktake.board.formNamePlaceholder')" />
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formActivity') }}</text>
          <input class="ipt" v-model="form.activityCode" :placeholder="$t('stocktake.board.formActivityPlaceholder')" />
        </view>

        <!-- 库区多选仅在三档开启时有意义 -->
        <view v-if="showZone" class="field">
          <text class="lb">{{ $t('stocktake.board.formZones') }}</text>
          <view v-if="!formZones.length" class="hint">{{ $t('stocktake.board.scopeAll') }}</view>
          <view class="chips">
            <text
              v-for="z in formZones"
              :key="z.id"
              class="chip"
              :class="{ on: pickedZones.includes(Number(z.id)) }"
              @tap="toggleZone(Number(z.id))"
            >{{ z.code }}</text>
          </view>
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formCategories') }}</text>
          <view class="chips">
            <text
              v-for="c in formCats"
              :key="c.id"
              class="chip"
              :class="{ on: pickedCats.includes(Number(c.id)) }"
              @tap="toggleCat(Number(c.id))"
            >{{ c.name }}</text>
          </view>
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formVariants') }}</text>
          <input class="ipt" v-model="form.variantIds" placeholder="12,34,56" />
        </view>

        <view class="field row" @tap="form.includeZeroBook = !form.includeZeroBook">
          <text class="lb rm">{{ $t('stocktake.board.formIncludeZero') }}</text>
          <text class="sw" :class="{ on: form.includeZeroBook }">{{ form.includeZeroBook ? '✓' : '' }}</text>
        </view>

        <view v-if="showZone" class="field row" @tap="form.autoSplitByZone = !form.autoSplitByZone">
          <text class="lb rm">{{ $t('stocktake.board.formAutoSplit') }}</text>
          <text class="sw" :class="{ on: form.autoSplitByZone }">{{ form.autoSplitByZone ? '✓' : '' }}</text>
        </view>
        <view v-else class="hint">{{ $t('stocktake.board.modeOffHint') }}</view>

        <button class="submit" :disabled="submitting" @tap="onCreate">
          {{ submitting ? $t('stocktake.board.formSubmitting') : $t('stocktake.board.formSubmit') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import TaskCard from '../../../components/stocktake/TaskCard.vue';
import { createStocktakeTask, fetchStocktakeTasks, type StocktakeTask } from '../../../apis/stocktake';
import { fetchStockLocations } from '../../../apis/inventory';
import { fetchStorageZones, type StorageZone } from '../../../apis/storage-bin';
import { fetchCollectionsOptimized, type CollectionItem } from '../../../apis/collection';
import { useLocaleStore } from '../../../stores/localeStore';
import { useBinMode } from '../../../composables/useBinMode';
import { scopeBadges, parseScopeJson } from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const { showZone, ensureBinMode } = useBinMode();

const tabs = [
  { key: 'all', label: 'stocktake.board.tabAll' },
  { key: 'COUNTING', label: 'stocktake.board.tabCounting' },
  { key: 'COUNTED', label: 'stocktake.board.tabToPost' },
  { key: 'closed', label: 'stocktake.board.tabClosed' },
] as const;

const tab = ref<string>('all');
const tasks = ref<StocktakeTask[]>([]);
const loading = ref(false);

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const locId = ref('');
const curLocName = ref('');

const formVisible = ref(false);
const submitting = ref(false);
const formLocIdx = ref(-1);
const formLocName = ref('');
const formZones = ref<StorageZone[]>([]);
const formCats = ref<CollectionItem[]>([]);
const pickedZones = ref<number[]>([]);
const pickedCats = ref<number[]>([]);
const form = ref({ name: '', activityCode: '', variantIds: '', includeZeroBook: false, autoSplitByZone: true });

// 分组：有活动码 → 按活动码；无 → 归「未分组」
const groups = computed(() => {
  const map = new Map<string, StocktakeTask[]>();
  for (const t of tasks.value) {
    const k = t.activityCode || '__none__';
    const arr = map.get(k);
    if (arr) arr.push(t);
    else map.set(k, [t]);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: key === '__none__'
      ? locale.t('stocktake.board.activityNone')
      : locale.t('stocktake.board.activityGroup').replace('{code}', key),
    items,
  }));
});

async function reload() {
  loading.value = true;
  try {
    const state = tab.value === 'all' ? undefined
      : tab.value === 'closed' ? 'POSTED'
      : tab.value;
    const r = await fetchStocktakeTasks({
      page: 1,
      pageSize: 50,
      state,
      stockLocationId: locId.value || undefined,
    });
    tasks.value = state === 'POSTED'
      ? r.items.filter((t) => t.state === 'POSTED' || t.state === 'CANCELLED')
      : r.items;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function switchTab(k: string) {
  tab.value = k;
  reload();
}

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  const hit = locations.value[locIdx.value];
  locId.value = hit ? String(hit.id) : '';
  curLocName.value = hit?.name ?? '';
  reload();
}

function clearLoc() {
  locIdx.value = -1;
  locId.value = '';
  curLocName.value = '';
  reload();
}

function goTask(id: string) {
  uni.navigateTo({ url: `/pages/inventory/stocktake/task?id=${id}` });
}

async function openForm() {
  formVisible.value = true;
  if (!locations.value.length) {
    locations.value = await fetchStockLocations();
    locNames.value = locations.value.map((l) => l.name);
  }
  if (showZone.value && !formZones.value.length) {
    try {
      // 库区按仓库取；仓库未选时先不取，选仓后 onFormLocChange 再取
      const first = locations.value[0];
      if (first) formZones.value = await fetchStorageZones(String(first.id));
    } catch { formZones.value = []; }
  }
  if (!formCats.value.length) {
    try { formCats.value = await fetchCollectionsOptimized(50); } catch { formCats.value = []; }
  }
}

async function onFormLocChange(e: any) {
  formLocIdx.value = Number(e.detail.value);
  const hit = locations.value[formLocIdx.value];
  formLocName.value = hit?.name ?? '';
  pickedZones.value = [];
  if (showZone.value && hit) {
    try { formZones.value = await fetchStorageZones(String(hit.id)); } catch { formZones.value = []; }
  }
}

function toggleZone(id: number) {
  pickedZones.value = pickedZones.value.includes(id)
    ? pickedZones.value.filter((x) => x !== id)
    : [...pickedZones.value, id];
}

function toggleCat(id: number) {
  pickedCats.value = pickedCats.value.includes(id)
    ? pickedCats.value.filter((x) => x !== id)
    : [...pickedCats.value, id];
}

function parseVariantIds(raw: string): number[] {
  return String(raw || '')
    .split(/[,，\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function onCreate() {
  const hit = locations.value[formLocIdx.value];
  if (!hit) return uni.showToast({ title: locale.t('stocktake.board.formRequireWarehouse'), icon: 'none' });
  if (!form.value.name.trim()) return uni.showToast({ title: locale.t('stocktake.board.formRequireName'), icon: 'none' });
  submitting.value = true;
  try {
    const t = await createStocktakeTask({
      stockLocationId: String(hit.id),
      name: form.value.name.trim(),
      activityCode: form.value.activityCode.trim() || null,
      scope: {
        zones: showZone.value ? pickedZones.value : [],
        categoryIds: pickedCats.value,
        variantIds: parseVariantIds(form.value.variantIds),
        includeZeroBook: form.value.includeZeroBook,
      },
      autoSplitByZone: showZone.value ? form.value.autoSplitByZone : false,
    });
    uni.showToast({
      title: locale.t('stocktake.board.createDone').replace('{code}', t.code).replace('{waves}', String(t.waveCount)),
      icon: 'none',
    });
    formVisible.value = false;
    form.value = { name: '', activityCode: '', variantIds: '', includeZeroBook: false, autoSplitByZone: true };
    pickedZones.value = [];
    pickedCats.value = [];
    await reload();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.createFailed'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onShow(async () => {
  await ensureBinMode();
  if (!locations.value.length) {
    try {
      locations.value = await fetchStockLocations();
      locNames.value = locations.value.map((l) => l.name);
    } catch { /* 仓库列表失败不阻塞任务列表 */ }
  }
  await reload();
});

onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});

// 圈范围徽标：供后续版本在卡片上展示（本轮保留 scopeBadges 引用，避免纯函数无消费点）
export { scopeBadges, parseScopeJson };
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }
.tabs { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 16rpx;
  .tb { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius;
    &.on { background: $wa-accent; .tl { color: #fff; } }
    .tl { font-size: 26rpx; color: $wa-ink; }
  }
}
.filter { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 16rpx;
  .picker { font-size: 27rpx; color: $wa-ink; }
  .clear { margin-left: auto; font-size: 28rpx; color: $wa-muted; padding: 0 8rpx; }
}
.group { margin-bottom: 24rpx;
  .gh { display: block; font-size: 24rpx; color: $wa-muted; margin: 0 0 12rpx 8rpx; }
}
.more, .empty { text-align: center; font-size: 26rpx; color: $wa-muted; padding: 80rpx 0; }
.fab { position: fixed; right: 32rpx; bottom: calc(40rpx + env(safe-area-inset-bottom)); background: $wa-accent; color: #fff;
  font-size: 27rpx; padding: 20rpx 32rpx; border-radius: 40rpx; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15);
}
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 88vh; overflow-y: auto; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
  .st { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 24rpx; }
  .field { margin-bottom: 26rpx;
    &.row { display: flex; align-items: center; }
    .lb { display: block; font-size: 25rpx; color: $wa-muted; margin-bottom: 12rpx;
      &.rm { margin-bottom: 0; flex: 1; }
    }
    .ipt, .pk { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 27rpx; color: $wa-ink; }
    .sw { width: 56rpx; height: 56rpx; line-height: 56rpx; text-align: center; border-radius: $wa-radius;
      background: $wa-bg; color: $wa-muted; font-size: 28rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .chips { display: flex; flex-wrap: wrap;
    .chip { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 10rpx 22rpx; margin: 0 12rpx 12rpx 0;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .hint { font-size: 23rpx; color: $wa-muted; }
  .submit { margin-top: 12rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
```

**注意**：`export { scopeBadges, parseScopeJson }` 在 `<script setup>` 里不合法（`<script setup>` 不允许 `export`）→ **实施时删掉这一行**，改为在卡片上真正使用：在 `TaskCard.vue` 的 `.foot` 加一行 `scope` 文本（`scopeBadges(parseScopeJson(task.scopeJson)).join(' ')`）。**TaskCard 的最终稿以本句为准**。

- [ ] **Step 5: 手机视口自测（390×844）**

```powershell
npm run dev:h5
```

（cwd: `d:\zhao\vshop\web-admin`；若既有脚本名不同，用该仓库惯用的 H5 启动命令）

浏览器 DevTools 切 iPhone 12 Pro（390×844）；直达 `http://localhost:<port>/#/pages/inventory/stocktake/index`。逐项确认：
1. 四个 Tab 可切换，切「已结束」只看到 `POSTED`/`CANCELLED`；
2. 无仓库筛选时列出全部任务；选仓后只剩该仓任务；
3. 新建任务 → 填仓库 + 名称 → 创建成功 toast 带 `TK…` 任务号与盘次数，列表出现新卡片；
4. `binMode=off` 时表单不出现库区/自动拆盘次，只提示整仓单盘次。

- [ ] **Step 6: 提交**

```bash
git add src/pages.json src/locale/zh-Hans.json src/locale/en.json src/components/stocktake/TaskCard.vue src/pages/inventory/stocktake/index.vue
git commit -m "feat(stocktake): 任务看板页与任务卡片（按活动码分组）"
```

（cwd: `d:\zhao\vshop`）

---

## Task 11：任务详情页（`pages/inventory/stocktake/task.vue`）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\stocktake\WaveCard.vue`
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\task.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（增量注册本页）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`src\locale\en.json`（`stocktake.task.*`）

**版式**：以 Task 9 Step 1 用户确认的 M2 为准。

- [ ] **Step 1: 注册页面**

```json
    { "path": "pages/inventory/stocktake/task", "style": { "navigationBarTitleText": "盘点任务" } },
```

- [ ] **Step 2: 补 i18n 词条（追加到 Task 10 的 `stocktake` 对象内，中英同步）**

zh-Hans（加在 `"board": { ... },` 之后）：

```json
    "task": {
      "header": "任务信息",
      "warehouse": "仓库",
      "activity": "盘点活动",
      "createdBy": "创建人",
      "createdAt": "创建时间",
      "scope": "盘点范围",
      "waves": "盘次",
      "waveZone": "库区 {code}",
      "waveWhole": "整仓",
      "waveUnassigned": "未归位桶",
      "waveProgress": "已盘 {done}/{total}",
      "assignee": "负责人",
      "none": "待认领",
      "assign": "指派",
      "claim": "认领",
      "release": "释放",
      "enter": "进入录入",
      "cancelWave": "取消盘次",
      "cancelTask": "取消任务",
      "toDiff": "查看差异并过账",
      "notReady": "还有 {n} 个盘次未提交",
      "assignedTo": "已指派给 {name}",
      "claimed": "已认领",
      "released": "已释放，退回待认领",
      "cancelled": "已取消",
      "opFailed": "操作失败",
      "loadFailed": "任务加载失败",
      "pickMember": "选择负责人",
      "posted": "已过账，单据 {code}",
      "cannotEdit": "该盘次已提交，不能再录入"
    },
```

en（同位置）：

```json
    "task": {
      "header": "Task info",
      "warehouse": "Warehouse",
      "activity": "Activity",
      "createdBy": "Created by",
      "createdAt": "Created at",
      "scope": "Scope",
      "waves": "Waves",
      "waveZone": "Zone {code}",
      "waveWhole": "Whole warehouse",
      "waveUnassigned": "Unassigned bin",
      "waveProgress": "Counted {done}/{total}",
      "assignee": "Owner",
      "none": "Unclaimed",
      "assign": "Assign",
      "claim": "Claim",
      "release": "Release",
      "enter": "Enter count",
      "cancelWave": "Cancel wave",
      "cancelTask": "Cancel task",
      "toDiff": "Review diff & post",
      "notReady": "{n} wave(s) not submitted yet",
      "assignedTo": "Assigned to {name}",
      "claimed": "Claimed",
      "released": "Released to unclaimed",
      "cancelled": "Cancelled",
      "opFailed": "Operation failed",
      "loadFailed": "Failed to load task",
      "pickMember": "Pick an owner",
      "posted": "Posted, doc {code}",
      "cannotEdit": "This wave is submitted and read-only"
    },
```

- [ ] **Step 3: 写 `components/stocktake/WaveCard.vue`**

```vue
<template>
  <!-- 盘次卡片：库区 / 负责人 / 状态 / 进度 + 认领·指派·释放 / 进入录入 -->
  <view class="wcard">
    <view class="top">
      <text class="zn">{{ zoneLabel }}</text>
      <text class="st" :class="stateClass">{{ $t('stocktake.waveState.' + wave.state) }}</text>
    </view>
    <view class="mid">
      <text class="as">{{ $t('stocktake.task.assignee') }}：{{ wave.assigneeName || $t('stocktake.task.none') }}</text>
      <text class="pg">{{ $t('stocktake.task.waveProgress').replace('{done}', String(p.counted)).replace('{total}', String(p.expected)) }}</text>
    </view>
    <view class="bar"><view class="fill" :style="{ width: p.percent + '%' }" /></view>
    <view class="ops">
      <text v-if="canClaim" class="b primary" @tap="emit('claim')">{{ $t('stocktake.task.claim') }}</text>
      <text v-if="canEnter" class="b" @tap="emit('enter')">{{ $t('stocktake.task.enter') }}</text>
      <text v-if="canRelease" class="b" @tap="emit('release')">{{ $t('stocktake.task.release') }}</text>
      <text v-if="canAssign" class="b" @tap="emit('assign')">{{ $t('stocktake.task.assign') }}</text>
      <text v-if="canCancel" class="b danger" @tap="emit('cancel')">{{ $t('stocktake.task.cancelWave') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { StocktakeWave } from '../../apis/stocktake';
import { waveProgress } from '../../utils/stocktake-grid';

const props = defineProps<{
  wave: StocktakeWave;
  /** 当前登录人是否为该盘次负责人（前端只做按钮可见性，最终由服务端独占锁裁决） */
  isOwner: boolean;
  /** 是否为管理员（可指派/强制释放/取消盘次） */
  isAdmin: boolean;
}>();
const emit = defineEmits<{
  (e: 'claim'): void; (e: 'assign'): void; (e: 'release'): void; (e: 'enter'): void; (e: 'cancel'): void;
}>();

const p = computed(() => waveProgress(props.wave));

// 盘次标签：库区 / 整仓 / 未归位桶（规格 §4.2 scopeType 三值）
const zoneLabel = computed(() => {
  const w = props.wave;
  if (w.scopeType === 'unassigned') return `${props.isOwner ? '' : ''}`.length >= 0 ? '' : '';
  return '';
});

const canClaim = computed(() => props.wave.state === 'OPEN');
const canEnter = computed(() => ['CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isOwner);
const canRelease = computed(() => ['CLAIMED', 'COUNTING'].includes(props.wave.state) && (props.isOwner || props.isAdmin));
const canAssign = computed(() => ['OPEN', 'CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isAdmin);
const canCancel = computed(() => ['OPEN', 'CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isAdmin);

const stateClass = computed(() => {
  switch (props.wave.state) {
    case 'SUBMITTED': return 'ok';
    case 'CANCELLED': return 'dead';
    case 'COUNTING': return 'doing';
    case 'CLAIMED': return 'ready';
    default: return 'idle';
  }
});
</script>

<style lang="scss" scoped>
.wcard {
  background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx;
  .top { display: flex; align-items: center;
    .zn { flex: 1; font-size: 29rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-muted;
      &.idle { background: $wa-muted; }
      &.ready { background: $wa-ink; }
      &.doing { background: $wa-accent; }
      &.ok { background: $wa-success; }
      &.dead { background: $wa-muted; }
    }
  }
  .mid { display: flex; align-items: center; margin-top: 14rpx;
    .as { flex: 1; font-size: 25rpx; color: $wa-ink; }
    .pg { font-size: 24rpx; color: $wa-muted; }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin-top: 14rpx; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; border-radius: 6rpx; }
  }
  .ops { display: flex; flex-wrap: wrap; margin-top: 18rpx;
    .b { font-size: 25rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 12rpx 26rpx; margin: 0 14rpx 12rpx 0;
      &.primary { background: $wa-accent; color: #fff; }
      &.danger { color: $wa-danger; }
    }
  }
}
</style>
```

**注意（实施时按此写）**：上面的 `zoneLabel` 计算属性我写坏了（返回空串的无意义分支）。改为：

```ts
const zoneLabel = computed(() => {
  const w = props.wave;
  if (w.scopeType === 'unassigned') return i18nUnassigned;
  if (w.scopeType === 'whole') return i18nWhole;
  return `${w.zoneCode || ''} ${w.zoneName || ''}`.trim() || i18nWhole;
});
```

其中文案由父组件通过 props 传入（组件内不引 `useLocaleStore`，保持可测试）：

```ts
const props = defineProps<{
  wave: StocktakeWave;
  isOwner: boolean;
  isAdmin: boolean;
  /** 三种盘次的展示文案由父组件用 i18n 备好，组件不碰 i18n */
  labelUnassigned: string;
  labelWhole: string;
}>();
```

- [ ] **Step 4: 写详情页 `pages/inventory/stocktake/task.vue`**

```vue
<template>
  <view class="page">
    <view v-if="task" class="card">
      <view class="top">
        <text class="code">{{ task.code }}</text>
        <text class="st" :class="stateClass">{{ $t('stocktake.state.' + task.state) }}</text>
      </view>
      <view class="bar"><view class="fill" :style="{ width: p.percent + '%' }" /></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.warehouse') }}</text><text class="v">{{ task.locationName || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.activity') }}</text><text class="v">{{ task.activityCode || $t('stocktake.board.activityNone') }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.scope') }}</text><text class="v">{{ scopeLabel }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.createdBy') }}</text><text class="v">{{ task.createdByName || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.createdAt') }}</text><text class="v">{{ timeLabel(task.createdAt) }}</text></view>
      <view v-if="task.postedStockDocId" class="posted">
        {{ $t('stocktake.task.posted').replace('{code}', String(task.postedStockDocId)) }}
      </view>
    </view>

    <text class="sec">{{ $t('stocktake.task.waves') }}</text>
    <WaveCard
      v-for="w in waves"
      :key="w.id"
      :wave="w"
      :is-owner="String(w.assigneeId || '') === String(myMemberId)"
      :is-admin="isAdmin"
      :label-unassigned="$t('stocktake.task.waveUnassigned')"
      :label-whole="$t('stocktake.task.waveWhole')"
      @claim="onClaim(w)"
      @assign="onAssign(w)"
      @release="onRelease(w)"
      @enter="onEnter(w)"
      @cancel="onCancelWave(w)"
    />
    <view v-if="!waves.length" class="empty">{{ $t('stocktake.board.empty') }}</view>

    <view class="savebar">
      <button class="ghost" :disabled="working" @tap="onCancelTask">{{ $t('stocktake.task.cancelTask') }}</button>
      <button class="main" :disabled="!readyToPost" @tap="goDiff">{{ $t('stocktake.task.toDiff') }}</button>
    </view>
    <view v-if="!readyToPost && task" class="tip">
      {{ $t('stocktake.task.notReady').replace('{n}', String(openWaveCount)) }}
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import WaveCard from '../../../components/stocktake/WaveCard.vue';
import {
  cancelStocktakeTask, cancelStocktakeWave, claimStocktakeWave, fetchStocktakeTask, fetchStocktakeWaves,
  releaseStocktakeWave, assignStocktakeWave, type StocktakeTask, type StocktakeWave,
} from '../../../apis/stocktake';
import { useLocaleStore } from '../../../stores/localeStore';
import { useAuthStore } from '../../../stores/authStore';
import { scopeBadges, parseScopeJson, taskProgress } from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const auth = useAuthStore();

const taskId = ref('');
const task = ref<StocktakeTask | null>(null);
const waves = ref<StocktakeWave[]>([]);
const working = ref(false);
/** 当前登录人的 TenantMember.id（服务端会用同一口径比对独占锁） */
const myMemberId = ref<string>('');

const p = computed(() => taskProgress(task.value ?? { expectedTotal: 0, countedTotal: 0, waveCount: 0, submittedWaveCount: 0, state: 'OPEN' }));
const isAdmin = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakePost'));
const openWaveCount = computed(() => waves.value.filter((w) => !['SUBMITTED', 'CANCELLED'].includes(w.state)).length);
const readyToPost = computed(() => !!task.value && task.value.state === 'COUNTED' && openWaveCount.value === 0);
const scopeLabel = computed(() => {
  const s = parseScopeJson(task.value?.scopeJson);
  const badges = scopeBadges(s);
  return badges.join(' · ') + (s.includeZeroBook ? '' : ` (${locale.t('stocktake.board.formIncludeZero')}: ✕)`);
});
const stateClass = computed(() => {
  switch (task.value?.state) {
    case 'POSTED': return 'ok';
    case 'COUNTED': return 'ready';
    case 'CANCELLED': return 'dead';
    case 'COUNTING': return 'doing';
    default: return 'idle';
  }
});

const timeLabel = (s?: string | null) => String(s || '').replace('T', ' ').slice(0, 16);

async function reload() {
  if (!taskId.value) return;
  try {
    task.value = await fetchStocktakeTask(taskId.value);
    waves.value = await fetchStocktakeWaves(taskId.value);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.loadFailed'), icon: 'none' });
  }
}

/** 把当前登录人解析为 TenantMember.id（服务端独占锁按这个 id 比对） */
async function loadMyMemberId() {
  // authStore 若已缓存 memberId 直接用；否则尝试从成员列表里按当前管理员匹配
  const anyAuth = auth as any;
  if (anyAuth.memberId) { myMemberId.value = String(anyAuth.memberId); return; }
  myMemberId.value = '';
}

async function guard(fn: () => Promise<any>, okKey: string) {
  if (working.value) return;
  working.value = true;
  try {
    await fn();
    uni.showToast({ title: locale.t(okKey), icon: 'none' });
    await reload();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.opFailed'), icon: 'none' });
  } finally {
    working.value = false;
  }
}

const onClaim = (w: StocktakeWave) => guard(() => claimStocktakeWave(String(w.id)), 'stocktake.task.claimed');
const onRelease = (w: StocktakeWave) => guard(() => releaseStocktakeWave(String(w.id)), 'stocktake.task.released');
const onCancelWave = (w: StocktakeWave) => guard(() => cancelStocktakeWave(String(w.id)), 'stocktake.task.cancelled');
const onCancelTask = () => guard(() => cancelStocktakeTask(taskId.value), 'stocktake.task.cancelled');

async function onAssign(w: StocktakeWave) {
  if (auth.isSuperAdmin) {
    // 超管可直接把盘次改成待认领（不引入成员选择器，避免本轮范围外的新页面）
    return guard(() => assignStocktakeWave(String(w.id), null), 'stocktake.task.released');
  }
  try {
    const members = await fetchStockLocations(); // 占位：仅用于触发一次网络，实施时替换为成员列表 API
    void members;
  } catch { /* 忽略 */ }
  uni.showToast({ title: locale.t('stocktake.task.pickMember'), icon: 'none' });
}

function onEnter(w: StocktakeWave) {
  if (!['CLAIMED', 'COUNTING'].includes(w.state)) {
    uni.showToast({ title: locale.t('stocktake.task.cannotEdit'), icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/inventory/stocktake/count?taskId=${taskId.value}&waveId=${w.id}` });
}

function goDiff() {
  if (!readyToPost.value) return;
  uni.navigateTo({ url: `/pages/inventory/stocktake/diff?taskId=${taskId.value}` });
}

onLoad((q: any) => { taskId.value = String(q?.id || ''); });
onShow(async () => {
  await loadMyMemberId();
  await reload();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }
.card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx;
  .top { display: flex; align-items: center;
    .code { flex: 1; font-size: 32rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-muted;
      &.idle { background: $wa-muted; } &.ready { background: $wa-ink; }
      &.doing { background: $wa-accent; } &.ok { background: $wa-success; } &.dead { background: $wa-muted; }
    }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin: 18rpx 0; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; }
  }
  .kv { display: flex; margin-top: 12rpx;
    .k { width: 150rpx; font-size: 25rpx; color: $wa-muted; }
    .v { flex: 1; font-size: 25rpx; color: $wa-ink; }
  }
  .posted { margin-top: 16rpx; font-size: 24rpx; color: $wa-success; }
}
.sec { display: block; font-size: 24rpx; color: $wa-muted; margin: 28rpx 0 14rpx 8rpx; }
.empty { text-align: center; font-size: 26rpx; color: $wa-muted; padding: 60rpx 0; }
.savebar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
  .ghost { flex: 1; background: $wa-bg; color: $wa-ink; font-size: 28rpx; border-radius: $wa-radius; }
  .main { flex: 2; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
}
.tip { position: fixed; left: 32rpx; right: 32rpx; bottom: calc(150rpx + env(safe-area-inset-bottom));
  font-size: 23rpx; color: $wa-muted; text-align: center;
}
</style>
```

**实施时必须替换的两处占位**（写代码时按此改，不留 `占位` 字样）：

1. `loadMyMemberId()`：先看 `authStore` 是否已有当前用户的 `TenantMember.id`；没有则在 `apis/` 里补一个最小查询
   `fetchMyTenantMember()`（`tenantMembers` 列表按当前 `administratorId` 过滤，取第一条的 `id`）。
   若后端已有等价接口（`web-admin` 的角色/成员页用过），**优先复用**，不要新造。
2. `onAssign()`：本轮**指派**只提供「管理员 → 改为待认领（`assigneeId = null`）」这一条路径
   （规格 §3.6 的完整指派需要成员选择器，属本轮范围外）。若 `web-admin` 已有成员列表 API，则补一个简单的
   `uni.showActionSheet` 选择负责人；否则保留「仅改为待认领」并在手册「残留缺口」记录。

- [ ] **Step 5: 手机视口自测（390×844）**

1. 看板点任务卡 → 详情页显示任务号 / 仓 / 活动码 / 进度 / 创建人；
2. 盘次卡片：`OPEN` 显示「认领」；认领后显示「进入录入 / 释放」；
3. 全部盘次提交后，「查看差异并过账」由灰变亮；未提交时提示「还有 N 个盘次未提交」；
4. 「取消盘次」后该盘次变灰、任务进度随之变化。

- [ ] **Step 6: 提交**

```bash
git add src/pages.json src/locale/zh-Hans.json src/locale/en.json src/components/stocktake/WaveCard.vue src/pages/inventory/stocktake/task.vue
git commit -m "feat(stocktake): 任务详情页与盘次卡片（认领/释放/进入录入）"
```

（cwd: `d:\zhao\vshop`）

---

## Task 12：手机录入页（版式 B）+ 共享 composable

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\composables\useStocktakeScope.ts`
- Create: `d:\zhao\vshop\web-admin\src\components\stocktake\BinGrid.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\stocktake\CountLineRow.vue`
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\count.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（增量注册本页）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`src\locale\en.json`（`stocktake.count.*`）

**版式**：以 Task 9 Step 1 用户确认的 M3 为准。

- [ ] **Step 1: 注册页面**

```json
    { "path": "pages/inventory/stocktake/count", "style": { "navigationBarTitleText": "盘点录入" } },
```

- [ ] **Step 2: 补 i18n 词条（中英同步）**

zh-Hans（加在 `"task": { ... },` 之后）：

```json
    "count": {
      "title": "盘点录入",
      "waveOf": "盘次：{zone}",
      "progress": "已盘 {done}/{total}",
      "filterAll": "全部",
      "filterUncounted": "未盘",
      "filterCounted": "已盘",
      "noZone": "本仓未启用库区，直接按清单录入",
      "unassignedBlock": "未归位（账上有货未绑库位）",
      "zoneSummary": "本库区 SKU {sku} 项 · 空格 {empty} 个",
      "bookQty": "账面 {n}",
      "countedMark": "已盘",
      "extraMark": "盘盈",
      "emptyZone": "该库区无应盘项",
      "save": "保存录入",
      "saving": "保存中…",
      "submit": "提交盘次",
      "submitting": "提交中…",
      "submitConfirm": "提交后本盘次不能再录入，确认提交？",
      "submitDone": "盘次已提交",
      "savedCount": "已保存 {n} 行",
      "noChange": "没有需要保存的改动",
      "scanEntry": "扫码快盘",
      "requireClaim": "请先在任务详情页认领该盘次",
      "loadFailed": "应盘清单加载失败",
      "operationFailed": "操作失败",
      "extraAdd": "登记盘盈",
      "extraPlaceholder": "变体 ID",
      "extraQty": "实盘数",
      "extraDone": "已登记盘盈"
    },
```

en：

```json
    "count": {
      "title": "Count entry",
      "waveOf": "Wave: {zone}",
      "progress": "Counted {done}/{total}",
      "filterAll": "All",
      "filterUncounted": "Uncounted",
      "filterCounted": "Counted",
      "noZone": "Zones are disabled here; count straight from the list",
      "unassignedBlock": "Unassigned (stock on book without a bin)",
      "zoneSummary": "{sku} SKUs in this zone · {empty} empty bins",
      "bookQty": "Book {n}",
      "countedMark": "Counted",
      "extraMark": "Extra",
      "emptyZone": "No line to count in this zone",
      "save": "Save",
      "saving": "Saving…",
      "submit": "Submit wave",
      "submitting": "Submitting…",
      "submitConfirm": "You cannot edit this wave after submitting. Submit now?",
      "submitDone": "Wave submitted",
      "savedCount": "{n} line(s) saved",
      "noChange": "Nothing to save",
      "scanEntry": "Scan mode",
      "requireClaim": "Claim this wave on the task page first",
      "loadFailed": "Failed to load expected lines",
      "operationFailed": "Operation failed",
      "extraAdd": "Register extra",
      "extraPlaceholder": "Variant ID",
      "extraQty": "Counted qty",
      "extraDone": "Extra registered"
    },
```

- [ ] **Step 3: 写共享 composable `composables/useStocktakeScope.ts`**

```ts
// 盘次上下文（录入页版式 B / 扫码快盘版式 C 共用）：任务 + 当前盘次 + 应盘行 + 草稿 + 进度
// 所有写操作都经服务端独占锁裁决，前端只负责把明确的错误原因透传出来。
import { computed, ref } from 'vue';
import {
  fetchStocktakeExpectedLines, fetchStocktakeTask, fetchStocktakeWaves, saveStocktakeCounts,
  type StocktakeTask, type StocktakeWave,
} from '../apis/stocktake';
import {
  clampCounted, filterLines, isCounted, sortLines, waveProgress,
  type LineFilter, type StocktakeLineRow,
} from '../utils/stocktake-grid';

const PAGE_SIZE = 500;

export function useStocktakeScope() {
  const taskId = ref('');
  const waveId = ref('');
  const task = ref<StocktakeTask | null>(null);
  const wave = ref<StocktakeWave | null>(null);
  const lines = ref<StocktakeLineRow[]>([]);
  const filter = ref<LineFilter>({});
  const loading = ref(false);
  const saving = ref(false);

  /** 本地草稿：lineId → 输入框字符串；不存在的键表示该行未改动 */
  const drafts = ref<Record<string, string>>({});

  const progress = computed(() =>
    waveProgress(wave.value ?? { expectedCount: 0, countedCount: 0, state: 'OPEN' }),
  );

  /** 只看当前盘次：CLAIMED/COUNTING 可写，SUBMITTED/CANCELLED 只读 */
  const canEdit = computed(() => !!wave.value && ['CLAIMED', 'COUNTING'].includes(wave.value.state));

  const visibleLines = computed(() => filterLines(lines.value, filter.value));

  /** 未归位桶的行（zoneId 为 null）单独成区块 */
  const unassignedLines = computed(() => visibleLines.value.filter((l) => !l.zoneId));

  function setDraft(lineId: string, v: string) {
    drafts.value = { ...drafts.value, [lineId]: v };
  }

  /** 输入框的值：优先草稿，其次已盘值，未盘为空串 */
  function draftOf(line: StocktakeLineRow): string {
    const d = drafts.value[line.id];
    if (d !== undefined) return d;
    return isCounted(line) ? String(line.countedQty) : '';
  }

  /** 待保存行：草稿钳制值与该行已盘值不同才提交（避免无改动也打网络） */
  function pendingInputs(): { lineId: string; countedQty: number }[] {
    const out: { lineId: string; countedQty: number }[] = [];
    for (const l of lines.value) {
      const raw = drafts.value[l.id];
      if (raw === undefined) continue;
      const qty = clampCounted(raw);
      const cur = isCounted(l) ? Number(l.countedQty) : null;
      if (cur === qty) continue;
      out.push({ lineId: String(l.id), countedQty: qty });
    }
    return out;
  }

  async function loadLines() {
    if (!taskId.value) return;
    const r = await fetchStocktakeExpectedLines({
      taskId: taskId.value,
      waveId: waveId.value || null,
      page: 1,
      pageSize: PAGE_SIZE,
    });
    lines.value = sortLines(r.items);
    drafts.value = {};
  }

  /** 打开盘次上下文（count.vue / scan.vue 共用入口） */
  async function load(id: string, wid: string) {
    loading.value = true;
    try {
      taskId.value = id;
      waveId.value = wid;
      task.value = await fetchStocktakeTask(id);
      const waves = await fetchStocktakeWaves(id);
      wave.value = waves.find((w) => String(w.id) === String(wid)) ?? null;
      if (!wave.value && waves.length) {
        wave.value = waves[0];
        waveId.value = String(waves[0].id);
      }
      await loadLines();
    } finally {
      loading.value = false;
    }
  }

  /** 仅刷新盘次（录入后同步 countedCount / state） */
  async function refreshWave() {
    if (!taskId.value) return;
    const waves = await fetchStocktakeWaves(taskId.value);
    wave.value = waves.find((w) => String(w.id) === String(waveId.value)) ?? wave.value;
  }

  /** 批量保存草稿；返回实际写入行数 */
  async function save(): Promise<number> {
    const inputs = pendingInputs();
    if (!inputs.length) return 0;
    saving.value = true;
    try {
      wave.value = await saveStocktakeCounts(waveId.value, inputs);
      await loadLines();
      return inputs.length;
    } finally {
      saving.value = false;
    }
  }

  /** 单行即时保存（扫码快盘用） */
  async function saveLine(lineId: string, qty: number): Promise<void> {
    const v = clampCounted(qty);
    saving.value = true;
    try {
      wave.value = await saveStocktakeCounts(waveId.value, [{ lineId, countedQty: v }]);
      const hit = lines.value.find((l) => String(l.id) === String(lineId));
      if (hit) hit.countedQty = v;
      drafts.value = {};
    } finally {
      saving.value = false;
    }
  }

  /** 清单外盘盈登记（variantId + 实盘数） */
  async function addExtra(variantId: string, qty: number): Promise<void> {
    saving.value = true;
    try {
      wave.value = await saveStocktakeCounts(waveId.value, [{ variantId, countedQty: clampCounted(qty) }]);
      await loadLines();
    } finally {
      saving.value = false;
    }
  }

  return {
    taskId, waveId, task, wave, lines, filter, loading, saving, drafts,
    progress, canEdit, visibleLines, unassignedLines,
    setDraft, draftOf, pendingInputs, load, refreshWave, loadLines, save, saveLine, addExtra,
  };
}
```

- [ ] **Step 4: 写 `components/stocktake/BinGrid.vue`**

```vue
<template>
  <!-- 版式 B 主视图：库区 → 格子宫格（空格子保留、有货带 SKU 角标、选中高亮） -->
  <view class="bgrid">
    <view class="ztabs">
      <text
        v-for="g in groups"
        :key="g.zoneId"
        class="zt"
        :class="{ on: String(activeZoneId) === String(g.zoneId) }"
        @tap="emit('pickZone', g.zoneId)"
      >{{ g.zoneCode }}</text>
    </view>

    <view v-if="active" class="cells">
      <view
        v-for="b in active.bins"
        :key="b.binId"
        class="cell"
        :class="{ empty: !b.skuCount, on: String(selectedBinId) === String(b.binId) }"
        @tap="emit('pickBin', b.binId)"
      >
        <text class="cc">{{ b.binCode }}</text>
        <text class="cn">{{ b.skuCount }}</text>
      </view>
    </view>
    <view v-else class="none">{{ emptyText }}</view>

    <view v-if="active" class="sum">{{ summaryText(active) }}</view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ZoneGroup } from '../../utils/stocktake-grid';

const props = defineProps<{
  groups: ZoneGroup[];
  activeZoneId?: string | null;
  selectedBinId?: string | null;
  emptyText: string;
  /** 「本库区 SKU x 项 · 空格 y 个」文案由父组件用 i18n 备好 */
  summaryText: (g: ZoneGroup) => string;
}>();
const emit = defineEmits<{ (e: 'pickZone', id: string): void; (e: 'pickBin', id: string): void }>();

const active = computed(() =>
  props.groups.find((g) => String(g.zoneId) === String(props.activeZoneId)) ?? null,
);
</script>

<style lang="scss" scoped>
.bgrid {
  .ztabs { display: flex; overflow-x: auto; white-space: nowrap; padding-bottom: 12rpx;
    .zt { display: inline-block; font-size: 26rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius;
      padding: 12rpx 28rpx; margin-right: 12rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .cells { display: flex; flex-wrap: wrap;
    .cell { width: 150rpx; height: 120rpx; margin: 0 16rpx 16rpx 0; border-radius: $wa-radius; background: $wa-card;
      display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2rpx solid transparent;
      .cc { font-size: 24rpx; color: $wa-ink; }
      .cn { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
      &.empty { background: #fafafa; .cn { color: #c8c8c8; } }
      &.on { border-color: $wa-accent; }
    }
  }
  .none { font-size: 25rpx; color: $wa-muted; padding: 40rpx 0; }
  .sum { font-size: 23rpx; color: $wa-muted; margin-top: 8rpx; }
}
</style>
```

- [ ] **Step 5: 写 `components/stocktake/CountLineRow.vue`**

```vue
<template>
  <!-- 应盘行：SKU + 名称 + 账面提示 + 数量输入 + 已盘/盘盈标记 -->
  <view class="lrow" :class="{ done: counted, extra: line.isExtra }">
    <view class="left">
      <text class="sku">{{ line.variantSku }}</text>
      <text class="nm">{{ line.variantName }}</text>
      <text class="bk">{{ $t('stocktake.count.bookQty').replace('{n}', String(line.bookQty)) }}</text>
    </view>
    <view class="right">
      <input
        class="qty"
        type="number"
        :disabled="!editable"
        :value="modelValue"
        :placeholder="counted ? '' : '—'"
        @input="emit('update:modelValue', ($event as any).detail.value)"
      />
      <text v-if="counted" class="tag ok">{{ $t('stocktake.count.countedMark') }}</text>
      <text v-else-if="line.isExtra" class="tag ex">{{ $t('stocktake.count.extraMark') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { isCounted, type StocktakeLineRow } from '../../utils/stocktake-grid';

const props = defineProps<{
  line: StocktakeLineRow;
  modelValue: string;
  editable: boolean;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const counted = computed(() => isCounted(props.line));
</script>

<style lang="scss" scoped>
.lrow {
  display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 12rpx;
  .left { flex: 1;
    .sku { display: block; font-size: 27rpx; color: $wa-ink; }
    .nm { display: block; font-size: 23rpx; color: $wa-muted; margin-top: 4rpx; }
    .bk { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
  }
  .right { display: flex; align-items: center;
    .qty { width: 140rpx; text-align: center; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 0; font-size: 28rpx; color: $wa-ink; }
    .tag { font-size: 20rpx; border-radius: 6rpx; padding: 4rpx 12rpx; margin-left: 12rpx; color: #fff;
      &.ok { background: $wa-success; }
      &.ex { background: $wa-accent; }
    }
  }
  &.done { .sku { color: $wa-success; } }
}
</style>
```

- [ ] **Step 6: 写录入页 `pages/inventory/stocktake/count.vue`**

```vue
<template>
  <view class="page">
    <!-- ① 顶部：盘次 + 进度 + 筛选 + 扫码入口 -->
    <view class="head">
      <view class="hrow">
        <text class="wt">{{ $t('stocktake.count.waveOf').replace('{zone}', waveLabel) }}</text>
        <text class="pg">{{ $t('stocktake.count.progress').replace('{done}', String(progress.counted)).replace('{total}', String(progress.expected)) }}</text>
      </view>
      <view class="bar"><view class="fill" :style="{ width: progress.percent + '%' }" /></view>
      <view class="frow">
        <text
          v-for="f in filters"
          :key="f.key"
          class="fb"
          :class="{ on: activeFilter === f.key }"
          @tap="setFilter(f.key)"
        >{{ $t(f.label) }}</text>
        <text class="scan" @tap="goScan">{{ $t('stocktake.count.scanEntry') }}</text>
      </view>
    </view>

    <view v-if="!canEdit" class="warn">{{ $t('stocktake.count.requireClaim') }}</view>

    <!-- ② 版式 B：库区 → 格子宫格（binMode = zone/bin 时） -->
    <template v-if="showZone">
      <BinGrid
        :groups="zoneGroups"
        :active-zone-id="activeZoneId"
        :selected-bin-id="selectedBinId"
        :empty-text="$t('stocktake.count.emptyZone')"
        :summary-text="zoneSummary"
        @pick-zone="pickZone"
        @pick-bin="pickBin"
      />
    </template>

    <!-- ③ 行清单：选中格子 / off 档全量；未盘优先（sortLines 已排好） -->
    <view class="list">
      <text v-if="showZone && selectedBinId" class="sub">
        {{ $t('stocktake.count.zoneSummary').replace('{sku}', String(binLines.length)).replace('{empty}', '0') }}
      </text>
      <CountLineRow
        v-for="l in binLines"
        :key="l.id"
        :line="l"
        :editable="canEdit"
        :model-value="draftOf(l)"
        @update:model-value="(v: string) => setDraft(l.id, v)"
      />
      <view v-if="!binLines.length" class="empty">{{ $t('stocktake.count.emptyZone') }}</view>
    </view>

    <!-- ④ 未归位桶（账上有货但未绑库位；规格 §3.4） -->
    <template v-if="showZone && unassignedLines.length">
      <text class="sec">{{ $t('stocktake.count.unassignedBlock') }}</text>
      <CountLineRow
        v-for="l in unassignedLines"
        :key="l.id"
        :line="l"
        :editable="canEdit"
        :model-value="draftOf(l)"
        @update:model-value="(v: string) => setDraft(l.id, v)"
      />
    </template>

    <!-- ⑤ 底部固定条 -->
    <view class="savebar">
      <button class="ghost" :disabled="saving || !canEdit" @tap="onSave">{{ saving ? $t('stocktake.count.saving') : $t('stocktake.count.save') }}</button>
      <button class="main" :disabled="saving || !canEdit" @tap="onSubmit">{{ $t('stocktake.count.submit') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import BinGrid from '../../../components/stocktake/BinGrid.vue';
import CountLineRow from '../../../components/stocktake/CountLineRow.vue';
import { fetchBinOccupancy, fetchStorageZones, type StorageBin, type StorageZone } from '../../../apis/storage-bin';
import { submitStocktakeWave } from '../../../apis/stocktake';
import { useLocaleStore } from '../../../stores/localeStore';
import { useBinMode } from '../../../composables/useBinMode';
import { useStocktakeScope } from '../../../composables/useStocktakeScope';
import { groupBinsByZone, isCounted, type BinOccupancyRow } from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const { showZone, ensureBinMode } = useBinMode();
const scope = useStocktakeScope();

const filters = [
  { key: 'all', label: 'stocktake.count.filterAll' },
  { key: 'uncounted', label: 'stocktake.count.filterUncounted' },
  { key: 'counted', label: 'stocktake.count.filterCounted' },
] as const;
const activeFilter = ref<string>('all');

const occupancy = ref<BinOccupancyRow[]>([]);
const activeZoneId = ref<string>('');
const selectedBinId = ref<string>('');

const { progress, canEdit, visibleLines, unassignedLines, setDraft, draftOf, save, wave } = scope;

const zoneGroups = computed(() => groupBinsByZone(occupancy.value, [] as StorageZone[]));

const waveLabel = computed(() => {
  const w = wave.value;
  if (!w) return '—';
  if (w.scopeType === 'unassigned') return locale.t('stocktake.task.waveUnassigned');
  if (w.scopeType === 'whole') return locale.t('stocktake.task.waveWhole');
  return `${w.zoneCode || ''} ${w.zoneName || ''}`.trim() || locale.t('stocktake.task.waveWhole');
});

const zoneSummary = (g: { skuTotal: number; emptyBins: number }) =>
  locale.t('stocktake.count.zoneSummary').replace('{sku}', String(g.skuTotal)).replace('{empty}', String(g.emptyBins));

/** 当前要显示的行：off 档 → 全部；bin 档选中格子 → 该格子行；未选 → 全部（先看总览） */
const binLines = computed(() => {
  if (!showZone.value) return visibleLines.value;
  if (!selectedBinId.value) return visibleLines.value;
  return visibleLines.value.filter((l) => String(l.binId || '') === String(selectedBinId.value));
});

function setFilter(key: string) {
  activeFilter.value = key;
  scope.filter.value =
    key === 'uncounted' ? { onlyUncounted: true }
    : key === 'counted' ? { onlyCounted: true }
    : {};
}

function pickZone(id: string) {
  activeZoneId.value = id;
  selectedBinId.value = '';
}

function pickBin(id: string) {
  // 同格子二次点击 = 取消选中（回到全量）
  selectedBinId.value = String(selectedBinId.value) === String(id) ? '' : id;
}

async function loadOccupancy() {
  const locId = (scope.task.value as any)?.stockLocationId;
  if (!showZone.value || !locId) { occupancy.value = []; return; }
  try {
    occupancy.value = await fetchBinOccupancy(String(locId));
    if (!activeZoneId.value && occupancy.value.length) activeZoneId.value = String(occupancy.value[0].zoneId);
  } catch { occupancy.value = []; }
}

async function onSave() {
  try {
    const n = await save();
    uni.showToast({
      title: n ? locale.t('stocktake.count.savedCount').replace('{n}', String(n)) : locale.t('stocktake.count.noChange'),
      icon: 'none',
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.count.operationFailed'), icon: 'none' });
  }
}

function onSubmit() {
  uni.showModal({
    title: locale.t('stocktake.count.submit'),
    content: locale.t('stocktake.count.submitConfirm'),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await save();                                  // 先落草稿，避免漏保存
        await submitStocktakeWave(String(scope.waveId.value));
        uni.showToast({ title: locale.t('stocktake.count.submitDone'), icon: 'success' });
        setTimeout(() => uni.navigateBack(), 700);
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('stocktake.count.operationFailed'), icon: 'none' });
      }
    },
  });
}

function goScan() {
  uni.navigateTo({ url: `/pages/inventory/stocktake/scan?taskId=${scope.taskId.value}&waveId=${scope.waveId.value}` });
}

onLoad(async (q: any) => {
  await ensureBinMode();
  try {
    await scope.load(String(q?.taskId || ''), String(q?.waveId || ''));
    await loadOccupancy();
    // 默认筛选：未盘（对上「已盘点/未盘点」需求原文）
    setFilter('uncounted');
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.count.loadFailed'), icon: 'none' });
  }
});

// 盘次变化（如 off 档只有一个盘次）后重新取占用
watch(() => scope.wave.value?.id, loadOccupancy);

onShow(() => { setFilter(activeFilter.value); });

// 保留 isCounted 引用：顶部筛选后的行统计会用到（实施时按需使用，勿留未使用 import）
void isCounted;
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }
.head { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
  .hrow { display: flex; align-items: center;
    .wt { flex: 1; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .pg { font-size: 24rpx; color: $wa-muted; }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin-top: 14rpx; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; }
  }
  .frow { display: flex; align-items: center; margin-top: 18rpx;
    .fb { font-size: 25rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 10rpx 24rpx; margin-right: 12rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
    .scan { margin-left: auto; font-size: 25rpx; color: $wa-accent; }
  }
}
.warn { font-size: 24rpx; color: $wa-danger; margin: 0 0 16rpx 8rpx; }
.sec { display: block; font-size: 24rpx; color: $wa-muted; margin: 24rpx 0 12rpx 8rpx; }
.list { margin-top: 20rpx;
  .sub { display: block; font-size: 23rpx; color: $wa-muted; margin-bottom: 12rpx; }
}
.empty { text-align: center; font-size: 25rpx; color: $wa-muted; padding: 60rpx 0; }
.savebar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
  .ghost { flex: 1; background: $wa-bg; color: $wa-ink; font-size: 28rpx; border-radius: $wa-radius; }
  .main { flex: 1; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
}
</style>
```

**实施时按此修的两点**：

1. `groupBinsByZone(occupancy.value, [] as StorageZone[])` 里的 `[]` 换成真实库区列表（`fetchStorageZones(locId)`），否则库区排序与名称只能用行内快照。`loadOccupancy()` 里一并拉 `fetchStorageZones`。
2. 删掉 `void isCounted;` 与对应 import（若无实际使用）——**不要留未使用 import**。
3. `StorageBin` 类型若未使用，一并从 import 里删掉。

- [ ] **Step 7: 手机视口自测（390×844）**

1. 从任务详情点「进入录入」→ 顶部显示盘次与进度；默认筛选「未盘」；
2. `binMode=bin` 时：库区 Tab 可切换；格子有 SKU 角标，空格子可见且不可点出内容；点格子后行列表只剩该格子的行，再点一次回到全部；
3. 输入数量 → 「保存录入」toast 显示「已保存 N 行」，进度条与「已盘 x/y」同步增长；
4. 切「已盘」只看已盘行；切「未盘」看不到已盘行；
5. 「提交盘次」二次确认后成功返回，盘次卡状态变「已提交」；
6. 未认领盘次直接进来 → 顶部红字提示「请先认领」。

- [ ] **Step 8: 提交**

```bash
git add src/pages.json src/locale/zh-Hans.json src/locale/en.json src/composables/useStocktakeScope.ts src/components/stocktake/BinGrid.vue src/components/stocktake/CountLineRow.vue src/pages/inventory/stocktake/count.vue
git commit -m "feat(stocktake): 手机录入页（版式 B：库区→格子宫格）与共享盘次上下文"
```

（cwd: `d:\zhao\vshop`）

---

## Task 13：扫码快盘（版式 C，`pages/inventory/stocktake/scan.vue`）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\scan.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

**前置**：Task 9 Step 1 的 mockup **M4（扫码快盘）已获用户确认**；Task 12 的 `useStocktakeScope` 与 `stocktake-grid.ts` 已落地（本 Task 直接复用，不新建 composable）。

**本 Task 不重写扫码**：一律走既有 `src/utils/scanner.ts` 的 `scanCode()`，失败按 `ScannerError.code` 分流（`MANUAL` → 展开页内手动输入条；`CANCEL` → 静默；`FAILED` → toast 提示开权限）。微信内置浏览器恒定 `MANUAL`（`scanner.ts` 已处理），所以手动输入条是**必须**的，不是可选优化。

- [ ] **Step 1: 注册页面（`pages.json`）**

在 Task 12 插入的 `pages/inventory/stocktake/count` 那一行之后插入：

```json
    { "path": "pages/inventory/stocktake/scan", "style": { "navigationBarTitleText": "扫码快盘" } },
```

- [ ] **Step 2: 补 i18n 词条（中英同步，R9）**

`src/locale/zh-Hans.json`（加在 Task 12 的 `"count": { ... },` 之后）：

```json
    "scan": {
      "title": "扫码快盘",
      "progress": "已盘 {done}/{total}",
      "exit": "退出",
      "bookQty": "账面 {n}",
      "allDone": "当前清单已全部盘完",
      "prev": "上一件",
      "next": "下一件",
      "skip": "跳过",
      "confirmNext": "确认并下一件",
      "scan": "扫码定位",
      "manual": "手动输入",
      "manualPlaceholder": "库位码 / 内部码 / 条形码 / SKU",
      "query": "查询",
      "savedOne": "已保存 {sku}",
      "hitBin": "已定位库位 {code}",
      "hitLine": "已定位 {sku}",
      "extraTitle": "清单外商品",
      "extraAsk": "「{code}」不在应盘清单内，登记为盘盈？",
      "extraNeedVariant": "该码未匹配到商品，无法登记盘盈",
      "extraDone": "已登记盘盈",
      "manualHint": "当前环境不支持扫码，请手动输入编码",
      "scanFailed": "扫码识别失败",
      "loadFailed": "盘次加载失败",
      "requireClaim": "请先在任务详情页认领该盘次",
      "noBin": "本仓未启用库位，扫码只做清单定位"
    },
```

`src/locale/en.json`（同位置）：

```json
    "scan": {
      "title": "Scan mode",
      "progress": "Counted {done}/{total}",
      "exit": "Exit",
      "bookQty": "Book {n}",
      "allDone": "All lines in this list are counted",
      "prev": "Previous",
      "next": "Next",
      "skip": "Skip",
      "confirmNext": "Save & next",
      "scan": "Scan",
      "manual": "Manual input",
      "manualPlaceholder": "Bin / internal code / barcode / SKU",
      "query": "Query",
      "savedOne": "{sku} saved",
      "hitBin": "Bin {code} located",
      "hitLine": "{sku} located",
      "extraTitle": "Not in list",
      "extraAsk": "\"{code}\" is not in the expected list. Register as extra?",
      "extraNeedVariant": "No variant matched this code; cannot register an extra",
      "extraDone": "Extra registered",
      "manualHint": "Scanning is unavailable here; enter the code manually",
      "scanFailed": "Scan failed",
      "loadFailed": "Failed to load the wave",
      "requireClaim": "Claim this wave on the task page first",
      "noBin": "Bins are disabled here; scanning only locates lines"
    },
```

- [ ] **Step 3: 写扫码快盘页 `pages/inventory/stocktake/scan.vue`**

```vue
<template>
  <view class="page">
    <!-- ① 顶部：进度 + 退出 -->
    <view class="top">
      <text class="pg">
        {{ $t('stocktake.scan.progress').replace('{done}', String(progress.counted)).replace('{total}', String(progress.expected)) }}
      </text>
      <text class="exit" @tap="exit">{{ $t('stocktake.scan.exit') }}</text>
    </view>

    <text v-if="!canEdit" class="warn">{{ $t('stocktake.scan.requireClaim') }}</text>
    <text v-else-if="!showZone" class="warn muted">{{ $t('stocktake.scan.noBin') }}</text>

    <!-- ② 当前件（大号，单件专注） -->
    <view v-if="current" class="cur">
      <text class="sku">{{ current.variantSku }}</text>
      <text class="nm">{{ current.variantName }}</text>
      <text class="bk">{{ $t('stocktake.scan.bookQty').replace('{n}', String(current.bookQty)) }}</text>
      <text class="loc">{{ binLabel(current, showBin) }}</text>
    </view>
    <view v-else class="cur empty">
      <text class="sku">{{ $t('stocktake.scan.allDone') }}</text>
    </view>

    <!-- ③ 实盘输入（大号数字 + 加减快捷） -->
    <view class="qty">
      <text class="minus" @tap="bump(-1)">−1</text>
      <input
        class="ipt"
        type="number"
        :disabled="!canEdit"
        :value="qty"
        placeholder="—"
        @input="qty = ($event as any).detail.value"
      />
      <text class="plus" @tap="bump(1)">+1</text>
    </view>

    <!-- ④ 操作：上一件 / 确认并下一件 / 跳过 -->
    <view class="acts">
      <text class="a ghost" @tap="step(-1)">{{ $t('stocktake.scan.prev') }}</text>
      <text class="a main" :class="{ dis: !canEdit }" @tap="confirmNext">{{ $t('stocktake.scan.confirmNext') }}</text>
      <text class="a ghost" @tap="step(1)">{{ $t('stocktake.scan.skip') }}</text>
    </view>

    <!-- ⑤ 扫码 / 手动输入 -->
    <view class="scanwrap">
      <text class="sbtn" @tap="onScan">{{ $t('stocktake.scan.scan') }}</text>
      <text class="sbtn ghost" @tap="showManual = !showManual">{{ $t('stocktake.scan.manual') }}</text>
    </view>
    <view v-if="showManual" class="manual">
      <input
        class="mipt"
        :placeholder="$t('stocktake.scan.manualPlaceholder')"
        :value="manual"
        @input="manual = ($event as any).detail.value"
      />
      <text class="mbtn" @tap="onManual">{{ $t('stocktake.scan.query') }}</text>
    </view>

    <!-- ⑥ 命中提示条 -->
    <view v-if="hitMsg" class="hit">{{ hitMsg }}</view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { resolveStocktakeCode } from '../../../apis/stocktake';
import { useLocaleStore } from '../../../stores/localeStore';
import { useBinMode } from '../../../composables/useBinMode';
import { useStocktakeScope } from '../../../composables/useStocktakeScope';
import { ScannerError, scanCode } from '../../../utils/scanner';
import {
  binLabel, clampCounted, isCounted, nextUncountedLine, sortLines, type StocktakeLineRow,
} from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const { showBin, showZone, ensureBinMode } = useBinMode();

const scope = useStocktakeScope();
const { taskId, waveId, lines, progress, canEdit, saveLine, addExtra, load } = scope;

const currentId = ref('');
const qty = ref('');
const manual = ref('');
const showManual = ref(false);
const hitMsg = ref('');

function toast(msg: string, icon: 'none' | 'success' = 'none') {
  uni.showToast({ title: msg, icon, duration: 2500 });
}

// 排序后的全量（上一件/下一件按此顺序循环）
const ordered = computed<StocktakeLineRow[]>(() => sortLines(lines.value));

// 当前件：显式 id 优先；id 为空或已不在清单 → 退回第一件未盘
const current = computed<StocktakeLineRow | null>(() => {
  const hit = lines.value.find((l) => String(l.id) === String(currentId.value));
  return hit ?? nextUncountedLine(lines.value, null);
});

// 切件时把输入框重置为该行的已盘值（未盘为空串，避免把上一件的数字带到下一件）
watch(current, (c) => {
  qty.value = c && isCounted(c) ? String(c.countedQty) : '';
  currentId.value = c ? String(c.id) : '';
});

function bump(delta: number) {
  qty.value = String(Math.max(0, clampCounted(qty.value) + delta));
}

function step(delta: number) {
  const arr = ordered.value;
  if (!arr.length) return;
  const i = arr.findIndex((l) => String(l.id) === String(currentId.value));
  if (i < 0) {
    currentId.value = String(arr[0].id);
    return;
  }
  currentId.value = String(arr[(i + delta + arr.length) % arr.length].id);
}

async function confirmNext() {
  const c = current.value;
  if (!c || !canEdit.value) return;
  try {
    await saveLine(String(c.id), clampCounted(qty.value));
    hitMsg.value = locale.t('stocktake.scan.savedOne').replace('{sku}', c.variantSku);
    // 保存后服务端 count 已变，用本地快照推下一件（lines 里的 countedQty 已被 saveLine 就地更新）
    const next = nextUncountedLine(lines.value, String(c.id));
    currentId.value = next ? String(next.id) : '';
  } catch (e: any) {
    toast(e?.message || locale.t('stocktake.count.operationFailed'));
  }
}

/** 扫到码后的统一处理（扫码与手动输入共用） */
async function handleCode(raw: string) {
  const code = String(raw || '').trim();
  if (!code || !taskId.value) return;
  try {
    const hit = await resolveStocktakeCode(taskId.value, code);
    if (hit.kind === 'bin') {
      hitMsg.value = locale.t('stocktake.scan.hitBin').replace('{code}', hit.binCode || code);
      // 定位到该格子的第一件未盘（同格子只做「跳到下一件」，不做筛选，保持单件专注语义）
      const inBin = ordered.value.find(
        (l) => String(l.binId || '') === String(hit.binId || '') && !isCounted(l),
      );
      if (inBin) currentId.value = String(inBin.id);
      return;
    }
    if (hit.kind === 'line' && hit.lineId) {
      currentId.value = String(hit.lineId);
      hitMsg.value = locale.t('stocktake.scan.hitLine').replace('{sku}', hit.variantSku || '');
      return;
    }
    // 清单外：登记盘盈（须能解析出 variantId，否则无法建行）
    const vid = hit.variantId || '';
    const label = hit.variantSku || code;
    uni.showModal({
      title: locale.t('stocktake.scan.extraTitle'),
      content: locale.t('stocktake.scan.extraAsk').replace('{code}', label),
      success: async (r) => {
        if (!r.confirm) return;
        if (!vid) {
          toast(locale.t('stocktake.scan.extraNeedVariant'));
          return;
        }
        try {
          await addExtra(String(vid), clampCounted(qty.value));
          hitMsg.value = locale.t('stocktake.scan.extraDone');
        } catch (e: any) {
          toast(e?.message || locale.t('stocktake.count.operationFailed'));
        }
      },
    });
  } catch (e: any) {
    toast(e?.message || locale.t('stocktake.scan.scanFailed'));
  }
}

async function onScan() {
  try {
    await handleCode(await scanCode());
  } catch (e: any) {
    const code = e instanceof ScannerError ? e.code : '';
    if (code === 'CANCEL') return;                       // 用户主动取消 → 静默
    if (code === 'MANUAL') {                             // 微信内置/非安全上下文 → 展开手动输入
      showManual.value = true;
      hitMsg.value = e?.message || locale.t('stocktake.scan.manualHint');
      return;
    }
    toast(e?.message || locale.t('stocktake.scan.scanFailed')); // FAILED（相机无法打开）
  }
}

async function onManual() {
  const c = manual.value;
  manual.value = '';
  await handleCode(c);
}

function exit() {
  uni.navigateBack();
}

onLoad(async (q: any) => {
  await ensureBinMode();
  try {
    await load(String(q?.taskId || ''), String(q?.waveId || ''));
  } catch (e: any) {
    toast(e?.message || locale.t('stocktake.scan.loadFailed'));
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx; }

.top { display: flex; align-items: center; margin-bottom: 16rpx;
  .pg { flex: 1; font-size: 25rpx; color: $wa-muted; }
  .exit { font-size: 25rpx; color: $wa-accent; }
}
.warn { display: block; font-size: 24rpx; color: $wa-danger; margin: 0 0 12rpx 8rpx;
  &.muted { color: $wa-muted; }
}

.cur { background: $wa-card; border-radius: $wa-radius; padding: 36rpx 32rpx; text-align: center;
  .sku { display: block; font-size: 44rpx; font-weight: 700; color: $wa-ink; }
  .nm { display: block; font-size: 26rpx; color: $wa-muted; margin-top: 10rpx; }
  .bk { display: block; font-size: 26rpx; color: $wa-ink; margin-top: 18rpx; }
  .loc { display: block; font-size: 24rpx; color: $wa-accent; margin-top: 8rpx; }
  &.empty .sku { font-size: 30rpx; color: $wa-muted; font-weight: 500; }
}

.qty { display: flex; align-items: center; margin-top: 24rpx;
  .ipt { flex: 1; text-align: center; background: $wa-card; border-radius: $wa-radius;
    padding: 28rpx 0; font-size: 48rpx; color: $wa-ink; }
  .minus, .plus { width: 140rpx; text-align: center; font-size: 30rpx; color: $wa-ink;
    background: $wa-card; border-radius: $wa-radius; padding: 34rpx 0; }
  .minus { margin-right: 16rpx; }
  .plus { margin-left: 16rpx; color: #fff; background: $wa-accent; }
}

.acts { display: flex; gap: 16rpx; margin-top: 24rpx;
  .a { flex: 1; text-align: center; font-size: 28rpx; border-radius: $wa-radius; padding: 26rpx 0; }
  .ghost { background: $wa-card; color: $wa-ink; }
  .main { background: $wa-accent; color: #fff; }
  .dis { opacity: .5; }
}

.scanwrap { display: flex; gap: 16rpx; margin-top: 28rpx;
  .sbtn { flex: 1; text-align: center; font-size: 27rpx; border-radius: $wa-radius; padding: 24rpx 0;
    background: $wa-accent; color: #fff;
    &.ghost { background: $wa-card; color: $wa-accent; }
  }
}
.manual { display: flex; align-items: center; margin-top: 16rpx;
  .mipt { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 22rpx 24rpx; font-size: 26rpx; color: $wa-ink; }
  .mbtn { margin-left: 16rpx; font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; padding: 22rpx 32rpx; }
}

.hit { margin-top: 20rpx; font-size: 24rpx; color: $wa-ink; background: $wa-card;
  border-radius: $wa-radius; padding: 18rpx 24rpx; }
</style>
```

**实施时按此修的两点**：

1. `watch(current, ...)` 里会写 `currentId.value`，而 `current` 依赖 `currentId`。当写入值与当前相同时（`current` 由 fallback 算出、`currentId` 为空）会再触发一次 watch，但因为 `current` 计算出的**对象引用不变**，watch 不会二次触发，不会死循环。若实施时用了 `{ deep: true }` 会打破这个前提 —— **不要加 `deep`**。
2. `saveLine` 已在 composable 内就地更新该行的 `countedQty`，所以 `nextUncountedLine(lines.value, ...)` 能立刻跳过刚盘完的件。**不要再额外调一次 `loadLines()`**（会清空本地草稿并多打一次网络）。

- [ ] **Step 4: 手机视口自测（390×844）**

1. 从录入页点「扫码快盘」进入 → 顶部进度与录入页一致；当前件为大号 SKU + 商品名 + 账面数 + 库位码；
2. 点「+1」→ 数字递增；点「确认并下一件」→ toast「已保存 SKU-A」且**自动跳到下一件未盘**；
3. 全部盘完 → 中央显示「当前清单已全部盘完」，`确认并下一件` 不再生效；
4. 电脑浏览器点「扫码定位」→ 弹出相机授权/`FAILED` 提示，**不白屏**（本地 `http://localhost` 属安全上下文，通常会真开摄像头）；
5. 强制走手动输入：点「手动输入」展开输入条 → 输入一个**已归位变体的 SKU** → 命中并定位（提示「已定位 SKU-x」）；
6. 输入一个**清单外**的商品 SKU → 弹「登记为盘盈？」→ 确认后提示「已登记盘盈」，返回录入页「全部」筛选能看到该行带「盘盈」标；
7. 输入不存在的码 → 弹窗提示「该码未匹配到商品，无法登记盘盈」，**不报错不白屏**；
8. 未认领盘次进入 → 顶部红字「请先在任务详情页认领该盘次」，且输入框与按钮不可用。

- [ ] **Step 5: 提交**

```bash
git add src/pages.json src/locale/zh-Hans.json src/locale/en.json src/pages/inventory/stocktake/scan.vue
git commit -m "feat(stocktake): 扫码快盘（版式 C：单件专注 + 扫码定位 + 清单外盘盈登记）"
```

（cwd: `d:\zhao\vshop`）

---

## Task 14：差异页与过账（`pages/inventory/stocktake/diff.vue`）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\diff.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

**前置**：mockup **M5（差异页）已获用户确认**；后端 `stocktakeDiff` / `postStocktake` 已在 Task 5、Task 6 落地并部署（Task 8）。

**这是「过账前唯一决策点」**（规格 §3.5）：一条错误路径都不能省 —— 未盘项须**显式勾选**才能过账；账面变动须**二次确认**（服务端返回 `recheck` → 弹窗 → 带 `confirm=true` 重发）。**不要**在这一页做「一键盲过」。

- [ ] **Step 1: 注册页面（`pages.json`）**

在 Task 13 插入的 `pages/inventory/stocktake/scan` 那一行之后插入：

```json
    { "path": "pages/inventory/stocktake/diff", "style": { "navigationBarTitleText": "盘点差异" } },
```

- [ ] **Step 2: 补 i18n 词条（中英同步，R9）**

`src/locale/zh-Hans.json`（加在 Task 13 的 `"scan": { ... },` 之后）：

```json
    "diff": {
      "title": "盘点差异",
      "summaryExpected": "应盘",
      "summaryCounted": "已盘",
      "summaryUncounted": "未盘",
      "summaryExtra": "盘盈",
      "colSku": "SKU",
      "colCounted": "实盘",
      "colBook": "账面",
      "colDiff": "差异",
      "colBin": "归位",
      "binChanged": "库位变更 → {code}",
      "extraMark": "盘盈",
      "uncountedTitle": "未盘项（{n}）",
      "uncountedHint": "未盘项账面不变；确认过账即视为跳过",
      "skipConfirm": "确认跳过 {n} 项未盘",
      "recheckBar": "建任务后账面已变动：{n} 个变体的账面数与快照不一致，过账将按当前账面重算",
      "changedTitle": "账面变动明细",
      "changedRow": "{sku}：快照 {snap} → 当前 {cur}",
      "post": "过账",
      "posting": "过账中…",
      "postDone": "过账完成，已生成盘点单据",
      "postFailed": "过账失败",
      "needSkip": "仍有未盘项，须先勾选「确认跳过未盘项」",
      "needRecheck": "账面已变动，确认按当前账面重算并过账？",
      "confirmPost": "确认过账",
      "notCounted": "任务尚未全部完成盘点（需所有盘次已提交），暂不可过账",
      "posted": "本任务已过账，不可重复过账",
      "empty": "暂无差异",
      "loadFailed": "差异加载失败"
    },
```

`src/locale/en.json`（同位置）：

```json
    "diff": {
      "title": "Variance",
      "summaryExpected": "Expected",
      "summaryCounted": "Counted",
      "summaryUncounted": "Uncounted",
      "summaryExtra": "Extra",
      "colSku": "SKU",
      "colCounted": "Counted",
      "colBook": "Book",
      "colDiff": "Diff",
      "colBin": "Bin",
      "binChanged": "Bin changed → {code}",
      "extraMark": "Extra",
      "uncountedTitle": "Uncounted ({n})",
      "uncountedHint": "Uncounted lines keep their book qty; posting skips them",
      "skipConfirm": "Confirm skipping {n} uncounted line(s)",
      "recheckBar": "Book qty changed after the task was created: {n} variant(s) differ from the snapshot; posting recomputes from the current book qty",
      "changedTitle": "Book changes",
      "changedRow": "{sku}: snapshot {snap} → now {cur}",
      "post": "Post",
      "posting": "Posting…",
      "postDone": "Posted; a stock document was created",
      "postFailed": "Posting failed",
      "needSkip": "Uncounted lines remain; tick \"Confirm skipping\" first",
      "needRecheck": "Book qty changed. Post with the current book qty?",
      "confirmPost": "Post now",
      "notCounted": "The task is not fully counted yet (all waves must be submitted)",
      "posted": "This task is already posted",
      "empty": "No variance",
      "loadFailed": "Failed to load variance"
    },
```

- [ ] **Step 3: 写差异页 `pages/inventory/stocktake/diff.vue`**

```vue
<template>
  <view class="page">
    <!-- ① 摘要四宫格 -->
    <view class="sum" v-if="diff">
      <view class="cell">
        <text class="n">{{ diff.expectedTotal }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryExpected') }}</text>
      </view>
      <view class="cell">
        <text class="n ok">{{ diff.countedTotal }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryCounted') }}</text>
      </view>
      <view class="cell">
        <text class="n" :class="{ warn: diff.uncountedCount > 0 }">{{ diff.uncountedCount }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryUncounted') }}</text>
      </view>
      <view class="cell">
        <text class="n" :class="{ warn: diff.extraCount > 0 }">{{ diff.extraCount }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryExtra') }}</text>
      </view>
    </view>

    <!-- ② 账面变动提示条（过账必须二次确认） -->
    <view v-if="diff && diff.recheck" class="recheck">
      <text class="rt">{{ $t('stocktake.diff.recheckBar').replace('{n}', String(diff.changedVariants.length)) }}</text>
      <text class="sec">{{ $t('stocktake.diff.changedTitle') }}</text>
      <text v-for="c in diff.changedVariants" :key="c.variantId" class="crow">
        {{ $t('stocktake.diff.changedRow').replace('{sku}', c.variantSku).replace('{snap}', String(c.snapBookQty)).replace('{cur}', String(c.currentBookQty)) }}
      </text>
    </view>

    <!-- ③ 未盘项折叠清单 + 显式跳过勾选 -->
    <view v-if="diff && diff.uncountedCount > 0" class="blk">
      <view class="bh" @tap="showUncounted = !showUncounted">
        <text class="bt">{{ $t('stocktake.diff.uncountedTitle').replace('{n}', String(diff.uncountedCount)) }}</text>
        <text class="caret">{{ showUncounted ? '▾' : '▸' }}</text>
      </view>
      <text class="hint">{{ $t('stocktake.diff.uncountedHint') }}</text>
      <template v-if="showUncounted">
        <view v-for="l in diff.uncountedLines" :key="l.id" class="urow">
          <text class="usku">{{ l.variantSku }}</text>
          <text class="unm">{{ l.variantName }}</text>
          <text class="ubk">{{ $t('stocktake.count.bookQty').replace('{n}', String(l.bookQty)) }}</text>
        </view>
      </template>
      <view class="skip" @tap="skipConfirmed = !skipConfirmed">
        <view class="box" :class="{ on: skipConfirmed }" />
        <text class="skt">{{ $t('stocktake.diff.skipConfirm').replace('{n}', String(diff.uncountedCount)) }}</text>
      </view>
    </view>

    <!-- ④ 差异表（按变体汇总，不是逐行相减） -->
    <view class="blk">
      <text class="bt">{{ $t('stocktake.diff.colDiff') }}</text>
      <view v-if="diff && diff.rows.length" class="thead">
        <text class="c1">{{ $t('stocktake.diff.colSku') }}</text>
        <text class="c2">{{ $t('stocktake.diff.colCounted') }}</text>
        <text class="c2">{{ $t('stocktake.diff.colBook') }}</text>
        <text class="c2">{{ $t('stocktake.diff.colDiff') }}</text>
      </view>
      <view v-for="r in diff?.rows || []" :key="r.variantId" class="trow">
        <view class="c1">
          <text class="sku">{{ r.variantSku }}</text>
          <text class="nm">{{ r.variantName }}</text>
          <text v-if="r.isExtra" class="tag">{{ $t('stocktake.diff.extraMark') }}</text>
          <text v-if="r.binChanged" class="bin">
            {{ $t('stocktake.diff.binChanged').replace('{code}', r.targetBinCode || '—') }}
          </text>
        </view>
        <text class="c2">{{ r.countedTotal }}</text>
        <text class="c2">{{ r.bookQty }}</text>
        <text class="c2" :class="r.diff > 0 ? 'plus' : r.diff < 0 ? 'minus' : ''">{{ r.diff > 0 ? '+' + r.diff : r.diff }}</text>
      </view>
      <view v-if="diff && !diff.rows.length" class="empty">{{ $t('stocktake.diff.empty') }}</view>
    </view>

    <!-- ⑤ 底部固定条：过账（仅 StocktakePost 可见可用） -->
    <view class="postbar">
      <text v-if="blockedReason" class="block">{{ blockedReason }}</text>
      <button class="main" :disabled="!canPost" @tap="onPost(false)">
        {{ posting ? $t('stocktake.diff.posting') : $t('stocktake.diff.post') }}
      </button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchStocktakeDiff, fetchStocktakeTask, postStocktake, type StocktakeDiff } from '../../../apis/stocktake';
import { useLocaleStore } from '../../../stores/localeStore';
import { useAuthStore } from '../../../stores/authStore';

const locale = useLocaleStore();
const auth = useAuthStore();

const taskId = ref('');
const diff = ref<StocktakeDiff | null>(null);
const taskState = ref('');
const posting = ref(false);
const skipConfirmed = ref(false);
const showUncounted = ref(false);

/** 过账权限（规格 §9：能盘 ≠ 能过账） */
const canPostPermission = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakePost'));

/** 前置条件：任务 COUNTED、有权限、未过账 */
const blockedReason = computed(() => {
  if (!canPostPermission.value) return locale.t('stocktake.count.noPermission');
  if (taskState.value === 'POSTED') return locale.t('stocktake.diff.posted');
  if (taskState.value !== 'COUNTED') return locale.t('stocktake.diff.notCounted');
  return '';
});

/** 未盘项必须显式勾选才能过账（规格 §6.2 / §10） */
const canPost = computed(() => {
  if (posting.value || blockedReason.value || !diff.value) return false;
  return diff.value.uncountedCount === 0 || skipConfirmed.value;
});

async function loadDiff() {
  diff.value = await fetchStocktakeDiff(taskId.value);
  const t = await fetchStocktakeTask(taskId.value);
  taskState.value = t?.state || '';
}

async function onPost(confirm: boolean) {
  if (posting.value) return;
  posting.value = true;
  try {
    const r = await postStocktake(taskId.value, confirm);
    if (r.ok) {
      uni.showToast({ title: locale.t('stocktake.diff.postDone'), icon: 'success', duration: 2500 });
      setTimeout(() => uni.navigateBack(), 900);
      return;
    }
    // 未成功：把失效原因与最新差异回填，再给下一步动作（绝不静默失败）
    if (r.diff) diff.value = r.diff;
    const need = r.diff?.recheck ? locale.t('stocktake.diff.needRecheck') : locale.t('stocktake.diff.needSkip');
    if (r.diff?.recheck) {
      uni.showModal({
        title: locale.t('stocktake.diff.post'),
        content: (r.message ? r.message + '\n' : '') + need,
        confirmText: locale.t('stocktake.diff.confirmPost'),
        success: (m) => { if (m.confirm) void onPost(true); },
      });
      return;
    }
    uni.showToast({ title: r.message || need, icon: 'none', duration: 3000 });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.diff.postFailed'), icon: 'none', duration: 3000 });
  } finally {
    posting.value = false;
  }
}

onLoad(async (q: any) => {
  taskId.value = String(q?.taskId || '');
  try {
    await loadDiff();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.diff.loadFailed'), icon: 'none' });
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }

.sum { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 0;
  .cell { flex: 1; text-align: center;
    .n { display: block; font-size: 38rpx; font-weight: 700; color: $wa-ink;
      &.ok { color: $wa-success; }
      &.warn { color: $wa-danger; }
    }
    .l { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }
}

.recheck { background: #fff8e6; border-radius: $wa-radius; padding: 22rpx 24rpx; margin-top: 20rpx;
  .rt { display: block; font-size: 24rpx; color: #a86b00; }
  .sec { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 14rpx; }
  .crow { display: block; font-size: 23rpx; color: $wa-ink; margin-top: 8rpx; }
}

.blk { background: $wa-card; border-radius: $wa-radius; padding: 22rpx 24rpx; margin-top: 20rpx;
  .bt { display: block; font-size: 26rpx; font-weight: 600; color: $wa-ink; }
  .bh { display: flex; align-items: center;
    .bt { flex: 1; }
    .caret { font-size: 24rpx; color: $wa-muted; }
  }
  .hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 10rpx; }
}

.urow { display: flex; align-items: center; margin-top: 14rpx;
  .usku { font-size: 24rpx; color: $wa-ink; }
  .unm { flex: 1; font-size: 22rpx; color: $wa-muted; margin-left: 12rpx; }
  .ubk { font-size: 22rpx; color: $wa-muted; }
}
.skip { display: flex; align-items: center; margin-top: 18rpx;
  .box { width: 34rpx; height: 34rpx; border: 2rpx solid $wa-rule; border-radius: 6rpx;
    &.on { background: $wa-accent; border-color: $wa-accent; }
  }
  .skt { font-size: 24rpx; color: $wa-ink; margin-left: 14rpx; }
}

.thead { display: flex; align-items: center; margin-top: 16rpx; padding-bottom: 10rpx; border-bottom: 1rpx solid $wa-rule;
  .c1 { flex: 1; font-size: 22rpx; color: $wa-muted; }
  .c2 { width: 110rpx; text-align: right; font-size: 22rpx; color: $wa-muted; }
}
.trow { display: flex; align-items: center; padding: 18rpx 0; border-bottom: 1rpx solid $wa-rule;
  .c1 { flex: 1;
    .sku { display: block; font-size: 26rpx; color: $wa-ink; }
    .nm { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
    .tag { font-size: 20rpx; color: #fff; background: $wa-accent; border-radius: 6rpx; padding: 2rpx 10rpx; }
    .bin { display: block; font-size: 21rpx; color: $wa-accent; margin-top: 4rpx; }
  }
  .c2 { width: 110rpx; text-align: right; font-size: 26rpx; color: $wa-ink;
    &.plus { color: $wa-success; }
    &.minus { color: $wa-danger; }
  }
}
.empty { text-align: center; font-size: 24rpx; color: $wa-muted; padding: 40rpx 0; }

.postbar { position: fixed; left: 0; right: 0; bottom: 0;
  padding: 18rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
  .block { display: block; font-size: 23rpx; color: $wa-danger; margin-bottom: 12rpx; text-align: center; }
  .main { width: 100%; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  .main[disabled] { opacity: .5; }
}
</style>
```

**实施时按此修的一点**：`locale.t('stocktake.count.noPermission')` 复用了 Task 12 的 `count` 块 —— 若 Task 12 的词条里**没有** `noPermission`（该块只列了 `requireClaim` 等），请在本 Task 的 `stocktake.diff` 块内补一条 `"noPermission": "无过账权限"` / `"noPermission": "No permission to post"`，并把上面这行改成 `locale.t('stocktake.diff.noPermission')`。**不要**留一个取不到的词条 key（`t()` 会原样返回 key 字符串）。

- [ ] **Step 4: 手机视口自测（390×844）**

1. 任务详情点「查看差异并过账」→ 进入差异页，四宫格数字与应盘行统计一致；
2. 有未盘项时：过账按钮**置灰**，点不动；展开未盘清单 → 勾选「确认跳过 N 项未盘」后按钮才可点；
3. 盘点过程中改动过账面（用 `adjustStock` 或另一张单据改一个变体的库存）→ 差异页顶部出现黄色 `recheck` 提示条，并列出「SKU：快照 x → 当前 y」；
4. 点「过账」→ 因账面变动被拦 → 弹「账面已变动，确认按当前账面重算并过账？」→ 确认后过账成功，toast「过账完成」，返回任务详情可见状态「已过账」；
5. 再次进入差异页 → 按钮置灰并提示「本任务已过账，不可重复过账」（幂等保护）；
6. 无 `StocktakePost` 权限的账号（用「库存」角色账号）→ 按钮置灰且提示「无过账权限」；
7. **本机验证完成后把被改动的变体库存复位**（`adjustStock` 改回原值），并把复位前后的值记入手册。

- [ ] **Step 5: 提交**

```bash
git add src/pages.json src/locale/zh-Hans.json src/locale/en.json src/pages/inventory/stocktake/diff.vue
git commit -m "feat(stocktake): 差异页与过账（未盘显式跳过 + 账面变动二次确认 + 权限门控）"
```

（cwd: `d:\zhao\vshop`）

---

## Task 15：前端权限消费 · 菜单 · 文档化角色配置

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\constants\menus.ts`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

**前置**：Task 6 Step 1/2 已在后端注册权限点并把 `StocktakeCount` / `StocktakePost` 写进角色模板。本 Task 只补**前端消费**（菜单门控 + 词条），不改后端。

**为什么菜单要新增权限门控而不是只靠 `binOnly`**：规格 §9 要求「菜单可见 + 录入与提交按钮」按 `StocktakeCount` 收口。既有的 `visibleMenus(auth, showBins)` 只支持 `binOnly`（库位档位）一种过滤，没有权限维；所以这里给 `MenuItem` 加一个**可选** `perm` 字段，保持既有 6 个域与 `buildPlatformGroup` 的门控写法不变。

- [ ] **Step 1: `MenuItem` 增 `perm` 字段**

`src/constants/menus.ts`，替换 `MenuItem` 接口：

```ts
export interface MenuItem {
  label: string;
  url?: string;
  tier: 1 | 2 | 3;
  action?: string;
  /** 仅在启用库位功能（binMode = zone/bin）时可见，由 useBinMode 门控 */
  binOnly?: boolean;
  /** 需要的权限点；缺省 = 不校验。isSuperAdmin 一律放行（与 buildPlatformGroup 同口径） */
  perm?: string;
}
```

- [ ] **Step 2: 库存域增「协同盘库」入口**

`src/constants/menus.ts` 的 `menu.domain.product` 组（库存相关菜单都挂在这里），把原有 `menu.stocktake` 那一行**改名为「快捷盘点」并降为 tier 2，前面插入新入口**：

```ts
      { label: 'menu.stocktakeTask', url: '/pages/inventory/stocktake/index', tier: 1, perm: 'StocktakeCount' },
      { label: 'menu.stocktake', url: '/pages/inventory/stock-doc/stocktake/index', tier: 2 },
```

（即：新任务体系为库存域 tier 1 主入口；既有「快捷盘点」页保留、tier 2，**不删、不改行为**。）

- [ ] **Step 3: `visibleMenus` 增权限过滤**

`src/constants/menus.ts`，替换 `visibleMenus` 实现：

```ts
/** showBins 为真时（binMode = zone/bin）才展示 binOnly 菜单项；perm 项按权限过滤，超管放行 */
export function visibleMenus(auth: MenuAuthLite, showBins = false): MenuGroup[] {
  const pg = buildPlatformGroup(auth);
  const visible = (i: MenuItem): boolean => {
    if (i.binOnly && !showBins) return false;
    if (i.perm && !(auth.isSuperAdmin || auth.hasPermission(i.perm))) return false;
    return true;
  };
  // 过滤后为空的组不再渲染（既有的 6 个域都还有其它项，故对现状无视觉影响）
  const base = menuGroups
    .map((g) => ({ ...g, items: g.items.filter(visible) }))
    .filter((g) => g.items.length > 0);
  return [...base, ...(pg ? [pg] : [])];
}
```

- [ ] **Step 4: 补菜单词条（中英同步，R9）**

`src/locale/zh-Hans.json` 的 `menu` 块（L47 附近，与既有 `"stocktake": "盘库"` 同处）：

```json
    "stocktakeTask": "协同盘库",
```

并把既有 `"stocktake": "盘库"` 改成：

```json
    "stocktake": "快捷盘点",
```

`src/locale/en.json` 同位置：

```json
    "stocktakeTask": "Stocktake tasks",
```

既有 `"stocktake": "Stocktake"` 改成：

```json
    "stocktake": "Quick stocktake",
```

**注意**：L1090 与 L1119 各有一处嵌套的 `"stocktake": "盘库"`（工作台/其它分组的副本），**保持不动** —— 它们对应的是别的结构的 key，不在本次改动范围。改完用第 5 步的命令核对只有预期的那一行变了。

- [ ] **Step 5: 类型检查 + 词条核对**

```powershell
npx vue-tsc --noEmit -p tsconfig.json
```

```powershell
node -e "const z=require('./src/locale/zh-Hans.json'),e=require('./src/locale/en.json');const k=['stocktakeTask','stocktake'];for(const x of k){if(!z.menu[x]||!e.menu[x])throw new Error('缺词条 '+x)}console.log('menu 词条 OK:',k.map(x=>x+'='+z.menu[x]).join(' '))"
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：类型检查 0 错误；第二行打印 `menu 词条 OK: stocktakeTask=协同盘库 stocktake=快捷盘点`。

若报 `Cannot find module './src/locale/zh-Hans.json'`，说明当前 shell 的 cwd 不是 `web-admin`（JSON 用 `require` 需要相对 cwd 的路径），按计划头部的 cwd 约定重跑即可。

- [ ] **Step 6: 手机视口自测（390×844）**

1. 用**超管**账号登录 → 「库存」域第一项为「协同盘库」，点进去到任务看板；
2. 用**没有** `StocktakeCount` 权限的角色账号登录（如「销售」）→ 「库存」域**看不到**「协同盘库」，且直接输 URL 进页面时后端接口返回权限错误（前端 toast 出后端原文，不白屏）；
3. 「快捷盘点」入口仍在（tier 2，文案已改名），点进去是既有页面，行为与改造前一致；
4. 超管之外、持有 `StocktakeCount` 的账号（如「库存」角色，Task 6 已加）→ 能看到「协同盘库」。

- [ ] **Step 7: 提交**

```bash
git add src/constants/menus.ts src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(stocktake): 菜单权限门控（MenuItem.perm）与「协同盘库」入口；快捷盘点降为二级"
```

（cwd: `d:\zhao\vshop`）

---

## Task 16：回归探针 · 手机截图 · 手册第 16 章 · 部署复验

**Files:**
- Create: `d:\zhao\vshop\web-admin\scripts\_smoke_stocktake_live.py`
- Create: `d:\zhao\vshop\web-admin\_e2e\_shot_stocktake.py`
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`（追加第 16 章 + 改 footer）
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\assets\`（新增截图）
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\shots\`（新增截图，双落点）
- Modify: 本文件（回填 `## 执行结果`）

**前置**：Task 8 后端已部署；Task 9~15 前端已全部提交。**构建与部署一律本地执行**，服务器只解压 + `pm2 restart`。

- [ ] **Step 1: 写只读冒烟探针 `scripts/_smoke_stocktake_live.py`**

照 `scripts/_smoke_picking_live.py` 的范式（同登录、同渠道注入、同 `check()` 计数），**全程只读**：

```python
# -*- coding: utf-8 -*-
# 多人协同盘库 · 只读冒烟（Task 16 Step 1）
# 覆盖五件事，**全程不建任务、不过账、不改库存**：
#  1) 盘库 admin SDL 齐备（6 查询 + 10 变更）
#  2) 权限点已注册进 Vendure 的 Permission 枚举（StocktakeCount / StocktakePost）
#  3) 数据面可查且按渠道收口（stocktakeTasks / stocktakeDiff / binOccupancy / variantBinsByLocation）
#  4) 前端三页可达、关键 DOM 存在、无 JS 运行时异常
#  5) shop-api **不含**盘库字段（规格 §3.8：有意只注册 admin，须显式断言，防将来误加）
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_SMOKE_BASE', 'https://e.joho.cn/guanli/')
LOC = os.environ.get('WA_SMOKE_LOC', '3')  # 默认仓

FAILS = []
ERRS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def gql(pg, q, var=None, api='admin'):
    return pg.evaluate("""async ([q, v, api]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const r = await fetch('/' + api + '-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':ct},
        body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, var, api])


def data(pg, q, var=None, tag='', api='admin'):
    d = gql(pg, q, var, api)
    if d.get('errors'):
        FAILS.append('%s GraphQL 报错 %s' % (tag, str(d['errors'])[:200]))
        return None
    return d['data']


def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const cs=(d.data.myTenantAccess.channels||[]);
        const c=cs.find(x=>x.code==='t2');
        if(!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token);
        localStorage.setItem('wa_channel_code','t2');
        window.__otherToken = (cs.find(x=>x.code!=='t2')||{}).token || '';
        return 'OK';
      });
    }""")
    check('登录并注入渠道令牌', ok == 'OK', ok)


def set_channel(pg, token):
    pg.evaluate('(t) => localStorage.setItem("wa_channel_token", t)', token)
    time.sleep(0.4)


def goto(pg, path, settle=6.0):
    """uni-app H5 hash 路由：改 hash 不重载，必须冷加载"""
    url = BASE + '#/' + path
    url += ('&' if '?' in url else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


TASK_Q = 'query{ stocktakeTasks(options:{page:1,pageSize:5}){ totalItems items{ id code state } } }'

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: ERRS.append('PAGEERR:' + str(e)[:200]))
    pg.on('console', lambda m: ERRS.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)

    login(pg)

    # ---------- 1) SDL 齐备 ----------
    print('[1] 盘库 SDL 齐备（仅 admin-api）')
    qs = data(pg, 'query{ __type(name:"Query"){ fields{ name } } }', None, 'queryType')
    ms = data(pg, 'query{ __type(name:"Mutation"){ fields{ name } } }', None, 'mutationType')
    qnames = {f['name'] for f in qs['__type']['fields']} if qs else set()
    mnames = {f['name'] for f in ms['__type']['fields']} if ms else set()
    for f in ['stocktakeTasks', 'stocktakeTask', 'stocktakeWaves', 'stocktakeExpectedLines',
              'stocktakeDiff', 'stocktakeResolveCode', 'variantBinsByLocation', 'binOccupancy']:
        check('Query %s 已注册' % f, f in qnames)
    for f in ['createStocktakeTask', 'addStocktakeWave', 'assignStocktakeWave', 'claimStocktakeWave',
              'releaseStocktakeWave', 'saveStocktakeCounts', 'submitStocktakeWave', 'postStocktake',
              'cancelStocktakeTask', 'cancelStocktakeWave']:
        check('Mutation %s 已注册' % f, f in mnames)

    # ---------- 2) 权限点枚举 ----------
    print('[2] 权限点已注册')
    perm = data(pg, 'query{ __type(name:"Permission"){ enumValues{ name } } }', None, 'perm')
    pnames = {v['name'] for v in perm['__type']['enumValues']} if perm else set()
    check('Permission StocktakeCount', 'StocktakeCount' in pnames)
    check('Permission StocktakePost', 'StocktakePost' in pnames)

    # ---------- 3) 数据面 + 渠道收口 ----------
    print('[3] 数据面（t2）')
    t2 = data(pg, TASK_Q, None, 'tasks')
    t2_items = (t2 or {}).get('stocktakeTasks', {}).get('items', [])
    check('stocktakeTasks 可查', t2 is not None, 'totalItems=%s' % ((t2 or {}).get('stocktakeTasks', {}).get('totalItems')))

    occ = data(pg, 'query($id: ID!){ binOccupancy(stockLocationId:$id){ binId binCode skuCount } }',
               {'id': LOC}, 'occupancy')
    occ_n = len(occ['binOccupancy']) if occ else -1
    check('binOccupancy 可查（含空格）', occ_n > 0, 'bins=%d' % occ_n)
    if occ and occ['binOccupancy']:
        check('binOccupancy 返回含空格子（skuCount = 0）',
              any(x['skuCount'] == 0 for x in occ['binOccupancy']),
              'zeros=%d' % len([x for x in occ['binOccupancy'] if x['skuCount'] == 0]))

    vb = data(pg, 'query($id: ID!){ variantBinsByLocation(stockLocationId:$id, page:1, pageSize:5){ totalItems items{ sku binCode } } }',
              {'id': LOC}, 'variantBins')
    check('variantBinsByLocation 分页可查', vb is not None,
          'totalItems=%s items=%s' % ((vb or {}).get('variantBinsByLocation', {}).get('totalItems'),
                                      len((vb or {}).get('variantBinsByLocation', {}).get('items', []))))

    if t2_items:
        tid = str(t2_items[0]['id'])
        d = data(pg, 'query($taskId: ID!){ stocktakeDiff(taskId:$taskId){ expectedTotal countedTotal uncountedCount extraCount diffCount recheck } }',
                 {'taskId': tid}, 'diff')
        check('stocktakeDiff 可查', d is not None and d['stocktakeDiff'] is not None,
              'task=%s %s' % (t2_items[0]['code'], str((d or {}).get('stocktakeDiff'))[:120]))
        check('任务状态取值合法', t2_items[0]['state'] in
              {'DRAFT', 'OPEN', 'COUNTING', 'COUNTED', 'POSTED', 'CANCELLED'}, t2_items[0]['state'])
    else:
        check('stocktakeDiff 可查（无任务，跳过）', True, 'SKIP：t2 下暂无盘点任务')

    # 渠道收口：换另一渠道再查，两边 id 集合必须无交集（前车之鉴，规格 §12 必测）
    other = pg.evaluate('() => window.__otherToken || ""')
    if other and t2_items:
        set_channel(pg, other)
        oth = data(pg, TASK_Q, None, 'tasksOther')
        oth_items = (oth or {}).get('stocktakeTasks', {}).get('items', [])
        inter = {str(x['id']) for x in t2_items} & {str(x['id']) for x in oth_items}
        check('渠道收口：两渠道任务 id 无交集', len(inter) == 0, '交集=%s' % list(inter))
        set_channel(pg, pg.evaluate('() => localStorage.getItem("wa_channel_code") === "t2" ? null : null') or other)
    else:
        check('渠道收口（无可比渠道或无任务，跳过）', True, 'SKIP')

    # ---------- 4) shop-api 不含盘库字段（有意单侧注册） ----------
    print('[4] shop-api 不含盘库字段（规格 §3.8）')
    sq = data(pg, 'query{ __type(name:"Query"){ fields{ name } } }', None, 'shopQuery', api='shop')
    snames = {f['name'] for f in sq['__type']['fields']} if sq else set()
    leaked = [f for f in ['stocktakeTasks', 'stocktakeTask', 'stocktakeDiff', 'binOccupancy', 'variantBinsByLocation']
              if f in snames]
    check('shop-api 未泄漏盘库字段', len(leaked) == 0, '泄漏=%s' % leaked)

    # ---------- 5) 页面可达 ----------
    print('[5] 前端页面')
    goto(pg, 'pages/inventory/stocktake/index', 8)
    check('看板页有状态 Tab', pg.locator('.tb').count() >= 3, 'tabs=%d' % pg.locator('.tb').count())
    check('看板页正文非空白', len(pg.inner_text('body').strip()) > 20,
          pg.inner_text('body')[:60].replace('\n', '|'))

    if t2_items:
        tid = str(t2_items[0]['id'])
        goto(pg, 'pages/inventory/stocktake/task?id=%s' % tid, 8)
        check('任务详情页有盘次卡', pg.locator('.wcard').count() >= 1, 'waves=%d' % pg.locator('.wcard').count())
        goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % tid, 8)
        check('差异页有摘要四宫格或阻塞提示',
              pg.locator('.sum').count() >= 1 or len(pg.inner_text('body').strip()) > 20)

    js_err = [e for e in ERRS if e.startswith('PAGEERR')]
    check('无 JS 运行时异常', len(js_err) == 0, str(js_err[:3]))
    print('  console.error 计数 =', len([e for e in ERRS if e.startswith('CONSOLE')]), str(ERRS[:2]))
    b.close()

print('\n===== 盘库冒烟结果：%s（失败 %d 项）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
for f in FAILS:
    print('  -', f)
raise SystemExit(1 if FAILS else 0)
```

**实施时按此修的一点**：上面渠道收口一段里 `set_channel(pg, ... or other)` 这一行是为了**还原**渠道 token 而写的绕路（`window.__otherToken` 在 `localStorage.clear()` 后失效）。实施时改为**开头就把 t2 的 token 保存到局部变量**（`T2_TOKEN = pg.evaluate('() => localStorage.getItem("wa_channel_token")')`），收口校验结束后 `set_channel(pg, T2_TOKEN)` 还原。**不要**留着现在这种自赋值的写法。

- [ ] **Step 2: 本地跑探针（先起本地 dev server + worker）**

两个终端（R7）：

```powershell
npm run dev:server
```

```powershell
npm run dev:worker
```

再跑探针（本地前端 dev server 端口以实际为准，配货台探针用的是 5280）：

```powershell
$env:WA_SMOKE_BASE="http://localhost:5280/guanli/"; python scripts\_smoke_stocktake_live.py
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：末尾打印 `===== 盘库冒烟结果：PASS（失败 0 项）=====`，退出码 0。

若失败项集中在 `[5] 前端页面`，先确认 dev server 已就绪且页面路径与 Task 10~14 的 `pages.json` 注册一致；若失败项在 `[1]`，先去 `Task 6 Step 5` 的 build 产物（`packages/cjk-plugin/lib/`）确认 SDL 已编译进 `lib`（R4：后端消费 `lib/`，不消费 `src/`）。

- [ ] **Step 3: 写手机截图脚本 `_e2e/_shot_stocktake.py`**

照 `_e2e/_shot_picking_console.py` 的范式（同登录/渠道/冷加载/隐藏 dev 悬浮钮）。**全程可逆**：建的任务全部 `cancelStocktakeTask` 收尾，**绝不过账**（不过账即不改库存）。

```python
# -*- coding: utf-8 -*-
# 多人协同盘库 · 操作手册截图（Task 16 Step 3）
# 手机视口 390x844 dpr=2（输出 780x1688）。
# 数据准备走真实 admin-api 且**全程可逆**：建任务 → 捞盘次 → 认领 → 录入几行 → 提交盘次 → 截差异页 → 取消任务。
# **绝不调 postStocktake**（过账会真实改库存）。
import os
import shutil
import time

from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)

SHOTS = []
ERRS = []


def gql(pg, q, var=None):
    return pg.evaluate("""async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':ct},
        body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, var])


def gql_data(pg, q, var=None, tag=''):
    d = gql(pg, q, var)
    if d.get('errors'):
        raise SystemExit('[%s] GraphQL 失败：%s' % (tag, str(d['errors'])[:400]))
    return d['data']


def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c=(d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if(!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token);
        localStorage.setItem('wa_channel_code','t2');
        return 'OK';
      });
    }""")
    print('  登录/渠道 =', ok)
    if ok != 'OK':
        raise SystemExit('渠道注入失败')


def set_mode(pg, mode):
    gql_data(pg, 'mutation($f: JSON!){ myUpdateChannelCustomFields(input:$f) }', {'f': {'binMode': mode}}, 'set_mode')
    print('  binMode ->', mode)


def goto(pg, path, settle=6.0):
    url = BASE + '#/' + path
    url += ('&' if '?' in url else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def hide_devtools(pg):
    try:
        pg.evaluate("""() => {
          for (const e of document.querySelectorAll('div')) {
            if (e.className) continue;
            if (getComputedStyle(e).position !== 'fixed') continue;
            const r = e.getBoundingClientRect();
            if (Math.round(r.width) === 30 && Math.round(r.height) === 30 && r.right > 300) e.style.display = 'none';
          }
        }""")
    except Exception:  # noqa: BLE001
        pass


def shot(pg, name, full=False):
    hide_devtools(pg)
    pg.screenshot(path=SHOT + name, full_page=full)
    SHOTS.append(name)
    print('  shot:', name)


# ---------------- 数据准备（可逆） ----------------
def make_task(pg, loc_id, name, activity, auto_split=True):
    d = gql_data(pg,
                 'mutation($input: StocktakeTaskInput!){ createStocktakeTask(input:$input){ id code state expectedTotal waveCount binModeAtCreate } }',
                 {'input': {'stockLocationId': str(loc_id), 'name': name, 'activityCode': activity,
                            'scope': None, 'autoSplitByZone': auto_split, 'note': None}}, 'createTask')
    t = d['createStocktakeTask']
    print('  建任务 =', t['code'], t['state'], '应盘', t['expectedTotal'], '盘次', t['waveCount'])
    return t


def waves(pg, tid):
    return gql_data(pg, 'query($taskId: ID!){ stocktakeWaves(taskId:$taskId){ id zoneId zoneCode zoneName scopeType state expectedCount countedCount assigneeId } }',
                    {'taskId': str(tid)}, 'waves')['stocktakeWaves']


def claim(pg, wid):
    return gql_data(pg, 'mutation($waveId: ID!){ claimStocktakeWave(waveId:$waveId){ id state assigneeName countedCount } }',
                    {'waveId': str(wid)}, 'claim')['claimStocktakeWave']


def count_some(pg, tid, wid, n=2):
    """给该盘次前 n 行写入实盘（账面 +1），制造差异，让差异页有内容"""
    lines = gql_data(pg, 'query($taskId: ID!, $waveId: ID!){ stocktakeExpectedLines(taskId:$taskId, waveId:$waveId, page:1, pageSize:%d){ items{ id variantId bookQty } } }' % n,
                     {'taskId': str(tid), 'waveId': str(wid)}, 'lines')['stocktakeExpectedLines']['items']
    inputs = [{'lineId': str(l['id']), 'variantId': None, 'countedQty': int(l['bookQty']) + 1,
               'zoneId': None, 'binId': None, 'note': None} for l in lines]
    if not inputs:
        print('    (该盘次无应盘行，跳过录入)')
        return 0
    r = gql_data(pg, 'mutation($waveId: ID!, $inputs: [StocktakeCountEntryInput!]!){ saveStocktakeCounts(waveId:$waveId, inputs:$inputs){ id state countedCount } }',
                 {'waveId': str(wid), 'inputs': inputs}, 'save')['saveStocktakeCounts']
    print('  录入 %d 行 -> 盘次 %s 已盘 %d' % (len(inputs), r['state'], r['countedCount']))
    return len(inputs)


def submit(pg, wid):
    return gql_data(pg, 'mutation($waveId: ID!){ submitStocktakeWave(waveId:$waveId){ id state } }',
                    {'waveId': str(wid)}, 'submit')['submitStocktakeWave']


def cancel_task(pg, tid):
    d = gql_data(pg, 'mutation($taskId: ID!){ cancelStocktakeTask(taskId:$taskId){ id code state } }',
                 {'taskId': str(tid)}, 'cancelTask')['cancelStocktakeTask']
    print('  取消任务 =', d['code'], d['state'])


def release(pg, wid):
    return gql_data(pg, 'mutation($waveId: ID!){ releaseStocktakeWave(waveId:$waveId){ id state assigneeId } }',
                    {'waveId': str(wid)}, 'release')['releaseStocktakeWave']


# ---------------- 主流程 ----------------
ORIGIN_MODE = 'off'
LOC = ''
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: ERRS.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: ERRS.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)

        login(pg)
        ch = gql_data(pg, 'query{ activeChannel{ id code customFields{ binMode } } }', None, 'channel')['activeChannel']
        ORIGIN_MODE = (ch.get('customFields') or {}).get('binMode') or 'off'
        print('  原始 binMode =', ORIGIN_MODE)

        locs = gql_data(pg, 'query{ stockLocations{ items{ id name } } }', None, 'locs')['stockLocations']['items']
        hit = next((l for l in locs if l['name'] == '默认仓'), locs[0])
        LOC = str(hit['id'])
        print('  目标仓 =', LOC, hit['name'])

        # ===== 1) 看板空态 + 新建弹窗 =====
        goto(pg, 'pages/inventory/stocktake/index', 8)
        shot(pg, 'stocktake_board_empty_390.png')
        if pg.locator('.fab').count():
            pg.locator('.fab').first.tap()
            time.sleep(2.5)
            shot(pg, 'stocktake_new_sheet_390.png')
            if pg.locator('.btn.ghost').count():
                pg.locator('.btn.ghost').first.tap()
            time.sleep(1.5)

        # ===== 2) bin 档：建任务 → 详情 → 录入 → 差异 =====
        set_mode(pg, 'bin')
        t = make_task(pg, LOC, '协同盘库-演示-常温', 'ACT-2026-09-23')
        ws = waves(pg, t['id'])
        print('  盘次数 =', len(ws))

        goto(pg, 'pages/inventory/stocktake/index', 8)
        shot(pg, 'stocktake_board_bin_390.png')
        goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 8)
        shot(pg, 'stocktake_task_bin_390.png', full=True)

        if ws:
            w0 = ws[0]
            claim(pg, w0['id'])
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 7)
            shot(pg, 'stocktake_task_claimed_390.png', full=True)

            goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (t['id'], w0['id']), 8)
            print('  录入页 库区Tab=%d 格子=%d 行=%d' % (
                pg.locator('.ztabs .zt').count(), pg.locator('.bg').count(), pg.locator('.lrow').count()))
            shot(pg, 'stocktake_count_bin_390.png', full=True)
            if pg.locator('.bg').count():
                pg.locator('.bg').first.tap()
                time.sleep(1.8)
                shot(pg, 'stocktake_count_grid_sel_390.png', full=True)
            if pg.locator('.scan').count():
                pg.locator('.scan').first.tap()
                time.sleep(3)
                shot(pg, 'stocktake_scan_390.png')
                if pg.locator('.sbtn.ghost').count():
                    pg.locator('.sbtn.ghost').first.tap()
                    time.sleep(1.5)
                    shot(pg, 'stocktake_scan_manual_390.png')
                pg.go_back()
                time.sleep(3)

            cnt = count_some(pg, t['id'], w0['id'], 2)
            goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (t['id'], w0['id']), 8)
            shot(pg, 'stocktake_count_saved_390.png', full=True)
            submit(pg, w0['id'])

            goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % t['id'], 8)
            print('  差异页 摘要=%d 差异行=%d 未盘勾选=%d' % (
                pg.locator('.sum').count(), pg.locator('.trow').count(), pg.locator('.skip').count()))
            shot(pg, 'stocktake_diff_390.png', full=True)
            if pg.locator('.skip').count():
                pg.locator('.skip').first.tap()
                time.sleep(1.5)
                shot(pg, 'stocktake_diff_skip_390.png', full=True)

            # 释放盘次，让详情页呈现「待认领」态（与已认领态对照）
            release(pg, w0['id'])
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 7)
            shot(pg, 'stocktake_task_open_390.png', full=True)

        # ===== 3) zone 档 =====
        set_mode(pg, 'zone')
        tz = make_task(pg, LOC, '协同盘库-演示-库区档', 'ACT-2026-09-23', auto_split=True)
        wzz = waves(pg, tz['id'])
        goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (tz['id'], wzz[0]['id'] if wzz else ''), 8)
        shot(pg, 'stocktake_count_zone_390.png', full=True)
        cancel_task(pg, tz['id'])

        # ===== 4) off 档 =====
        set_mode(pg, 'off')
        to = make_task(pg, LOC, '协同盘库-演示-整仓', 'ACT-2026-09-23', auto_split=False)
        wo = waves(pg, to['id'])
        goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (to['id'], wo[0]['id'] if wo else ''), 8)
        shot(pg, 'stocktake_count_off_390.png', full=True)
        cancel_task(pg, to['id'])

        # ===== 5) 收尾：取消演示任务 =====
        cancel_task(pg, t['id'])
        goto(pg, 'pages/inventory/stocktake/index', 8)
        shot(pg, 'stocktake_board_done_390.png')
        print('  页面异常 =', ERRS[:5] if ERRS else '无')
        b.close()
finally:
    try:
        with sync_playwright() as p2:
            b2 = p2.chromium.launch(headless=True)
            pg2 = b2.new_context(viewport={'width': 390, 'height': 844}).new_page()
            login(pg2)
            set_mode(pg2, 'off')
            print('  已还原 binMode = off')
            b2.close()
    except Exception as e:  # noqa: BLE001
        print('  !! 档位还原失败，请手工改回 off：', str(e)[:160])

os.makedirs(MANUAL, exist_ok=True)
for n in SHOTS:
    shutil.copy(SHOT + n, MANUAL + n)
print('copied %d shots -> manual assets' % len(SHOTS))
print('done')
```

**实施时按此修的两点**：

1. 脚本里的 `pg.go_back()` 在 uni-app H5 hash 路由下可能回不到预期页 —— 若扫码页截图后返回异常，改为 `goto(pg, 'pages/inventory/stocktake/count?...')` 重新进入录入页。
2. 选择器（`.fab` / `.ztabs .zt` / `.bg` / `.lrow` / `.scan` / `.sbtn.ghost` / `.trow` / `.skip` / `.wcard`）必须与 Task 10~14 **实际写出的 class 名逐一核对**；本脚本是照计划正文的 class 写的，若实施时改了 class，**以实际为准同步脚本**（截图脚本用错选择器 = 白跑一轮）。

- [ ] **Step 4: 本地跑截图脚本并肉眼核对**

```powershell
python _e2e\_shot_stocktake.py
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：输出约 14 张 `stocktake_*_390.png`，末尾 `copied N shots -> manual assets`，且 `已还原 binMode = off`。

**逐张核对清单**（对照 Task 9 Step 1 已确认的 M1~M5）：

| 截图 | 必须看到 |
|---|---|
| `stocktake_board_empty_390.png` | 空态文案，不是白屏 |
| `stocktake_new_sheet_390.png` | 新建弹窗：仓库 picker + 库区多选 + 分类多选 + 变体 ID + 两个开关 |
| `stocktake_board_bin_390.png` | 任务卡：进度条 + 「已盘 x/y」+ 盘次数 + 活动码分组标题 |
| `stocktake_task_bin_390.png` | 头部四要素（任务号/仓库/活动码/状态徽标）+ 盘次卡三按钮 |
| `stocktake_task_claimed_390.png` | 已认领盘次显示负责人名，按钮态与待认领不同 |
| `stocktake_count_bin_390.png` | 库区横向 Tab + **空格子可见** + 有货格子带 SKU 角标 + 底部固定条 |
| `stocktake_count_grid_sel_390.png` | 选中格子后行列表只剩该格子的行 |
| `stocktake_count_saved_390.png` | 已盘行带绿标、进度条增长 |
| `stocktake_scan_390.png` | 大号 SKU + 账面数 + 大号数字输入 + `+1` |
| `stocktake_scan_manual_390.png` | 手动输入条展开 |
| `stocktake_diff_390.png` | 摘要四宫格 + 差异表（按变体汇总，不是逐行） |
| `stocktake_diff_skip_390.png` | 勾选态 + 未盘清单 |
| `stocktake_count_zone_390.png` | 有库区 Tab、**无格子**（zone 档） |
| `stocktake_count_off_390.png` | **无库区无格子** + 兜底文案（off 档） |

任何一张与预期不符 → 回到对应 Task 修代码，**不要**靠改脚本掩盖。

- [ ] **Step 5: 追加操作手册第 16 章**

在 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 的第 15 章末尾（`<h3>15.7 验收截图（共 27 张）</h3>` 那一节结束、`<footer>` 之前）插入：

```html
    <h2>16 多人协同盘库 · 任务 / 盘次 / 差异过账（2026-09-23）</h2>

    <h3>16.1 能力概览</h3>
    <p>在既有「单人一次性盘库」之上新增任务化协同盘库：<b>任务</b>（一任务一仓 + 盘点活动分组）→ <b>盘次</b>（按库区拆分，可指派/可认领、独占锁定）→ <b>应盘清单</b>（双源合并：已归位 ∪ 有账面，未归位进单独桶）→ <b>汇总后一次性人工过账</b>（生成 1 张 ST 单据）。</p>
    <ul>
      <li>多人协同：盘次认领后他人无法录入/提交（后端拒绝并回传原因）；能盘的人与能过账的人分开（两个权限点）。</li>
      <li>不同仓库：同一 <code>activityCode</code> 在看板合并显示，各仓独立过账。</li>
      <li>按库存区域 / 按货品：圈范围支持库区 + 分类 + 指定变体清单（专项盘即只用货品维度圈范围）。</li>
      <li>内部码 / 条形码：扫码先解库位码定位格子，再按内部码 → 条形码 → SKU 顺序命中断行；清单外提示登记盘盈。</li>
      <li>已盘 / 未盘：<code>countedQty IS NULL</code> 判定，进度分母 = <code>expectedCount</code>，未盘项可单独筛出。</li>
      <li>分批次盘点：一个任务拆多个盘次并行，全部提交后一次性汇总过账。</li>
    </ul>

    <h3>16.2 后端实现（vendure · cjk-plugin）</h3>
    <table>
      <tr><th>项</th><th>内容</th></tr>
      <tr><td>新增表（3）</td><td><code>stocktake_task</code>（任务）/ <code>stocktake_wave</code>（盘次）/ <code>stocktake_line</code>（应盘行）。由 <code>synchronize:true</code> 开机自动建表，<b>未写 migration</b>（遵循项目数据库策略：生产 postgres）</td></tr>
      <tr><td>渠道收口</td><td>三张表均带 <code>tenantChannelId</code>，全部查询按 <code>String(ctx.channelId)</code> 过滤（承接配货台「候选订单跨渠道串入」的教训）</td></tr>
      <tr><td>接口注册</td><td><b>仅 <code>adminApiExtensions</code></b>（6 查询 + 10 变更），<b>有意不注册 shop-api</b>（C 端无盘点需求）；回归中已显式断言 shop-api 未泄漏</td></tr>
      <tr><td>权限点</td><td><code>StocktakeCount</code>（建任务/拆盘次/认领/录入/提交）、<code>StocktakePost</code>（过账）。<code>tenant-admin</code> 模板两个都发，「库存」角色只发 <code>StocktakeCount</code></td></tr>
      <tr><td>库位反查（缺口补齐）</td><td>新增两个只读查询：<code>variantBinsByLocation</code>（库位→SKU 明细，分页）与 <code>binOccupancy</code>（全部启用库位占用概览，<b>含空格子</b>，复用既有 <code>binBindCounts()</code>）</td></tr>
      <tr><td>盈亏口径</td><td><b>按变体汇总</b>：实盘合计 − 仓库当前账面；<b>不逐行相减</b>（盘盈行与应盘行同变体并存时逐行会算两次；与 <code>createStockDoc</code> 的 <code>realQty</code> 覆盖式语义一致）</td></tr>
      <tr><td>过账</td><td>复用既有 <code>StockDoc(type='STOCKTAKE')</code> 通道（≤ 前缀 <code>ST</code>）：差异项传 <code>realQty = 实盘合计</code>；无差异但库位变更的传当前账面 + <code>zoneId/binId</code>（触发 <code>applyBinBinding</code> 顺手归位）；任务转 <code>POSTED</code> 并记 <code>postedStockDocId</code>，重复过账直接拒绝</td></tr>
      <tr><td>构建产物</td><td>dev-server 消费 <code>lib/</code>（<code>main = lib/index.js</code>），改 <code>src</code> 必须 <code>npm run build</code>；提交带 <code>src</code> + <code>lib</code></td></tr>
    </table>

    <h3>16.3 前端实现（vshop / web-admin）</h3>
    <table>
      <tr><th>文件</th><th>职责</th></tr>
      <tr><td><code>src/utils/stocktake-grid.ts</code></td><td>纯函数层：格子宫格归组、进度、行排序/筛选、圈范围解析、差异摘要、下一件未盘（<code>node --test</code> 单测）</td></tr>
      <tr><td><code>src/apis/stocktake.ts</code></td><td>盘库 6 查询 + 10 变更（照 <code>apis/storage-bin.ts</code> 风格，统一 <code>graphQlErrorMsg</code>）</td></tr>
      <tr><td><code>src/composables/useStocktakeScope.ts</code></td><td>盘次上下文（录入页 B 与扫码页 C 共用）：任务/盘次/应盘行/草稿/进度/独占可写判定</td></tr>
      <tr><td><code>src/components/stocktake/</code></td><td><code>TaskCard</code> / <code>WaveCard</code> / <code>BinGrid</code>（空格子可见）/ <code>CountLineRow</code></td></tr>
      <tr><td>页面（5）</td><td>任务看板 <code>stocktake/index</code>、任务详情 <code>stocktake/task</code>、手机录入 <code>stocktake/count</code>（版式 B：库区→格子宫格）、扫码快盘 <code>stocktake/scan</code>（版式 C：单件专注）、差异页 <code>stocktake/diff</code>（过账前唯一决策点）</td></tr>
      <tr><td>菜单</td><td><code>MenuItem</code> 增 <code>perm</code>；库存域新增 tier 1「协同盘库」（<code>StocktakeCount</code> 门控）；既有「盘库」改名「快捷盘点」并降为 tier 2，<b>行为不变</b></td></tr>
      <tr><td>三档门控</td><td><code>useBinMode</code> 决定录入页形态：<code>off</code> 无库区（整仓单盘次）、<code>zone</code> 到库区、<code>bin</code> 到格子（空格子可见）</td></tr>
      <tr><td>扫码</td><td><b>复用</b>既有 <code>src/utils/scanner.ts</code> 的 <code>scanCode()</code>，不自写扫码；失败按 <code>MANUAL</code>/<code>CANCEL</code>/<code>FAILED</code> 分流，微信内置恒为手动输入（故页内保留手动输入条）</td></tr>
    </table>

    <h3>16.4 回归测试与证据</h3>
    <p><b>后端单测（vitest）</b>：<code>stocktake-math.spec.ts</code>（状态机/任务号/应盘清单/差异汇总/扫码解析/过账计划）、<code>stocktake.service.spec.ts</code>（独占锁与状态派生）、<code>bin-query.math.spec.ts</code>（分页钳制/归属校验/占用归并）。</p>
    <p><b>前端单测（node --test）</b>：<code>node --test src/utils/stocktake-grid.spec.ts</code>，13 用例全绿。</p>
    <p><b>本地写链路自检</b>：建任务 → 认领 → 录入 → 提交 → 过账 → <b>库存复位</b>（过账会真实改库存，故只在本机执行，生产绝不执行）。</p>
    <p><b>线上只读冒烟</b>：<code>python scripts/_smoke_stocktake_live.py</code>，覆盖 SDL 齐备、权限点枚举、数据面可查、<b>渠道收口无交集</b>、<b>shop-api 未泄漏盘库字段</b>、三页可达且无 JS 异常 —— 结果 0 fail。</p>
    <p>（执行时把真实输出、任务 code、渠道收口结论、探针退出码填在本节。）</p>

    <h3>16.5 升级须知</h3>
    <ul>
      <li><b>老角色不会自动获得新权限点</b>：改的是角色<b>模板</b>，已落库的 <code>Role.permissions</code> 数组不会变。需管理员在「角色管理」里重新套用模板或手工勾选 <code>StocktakeCount</code> / <code>StocktakePost</code>（本地与生产各确认一次）。</li>
      <li><b>库位档位</b>：盘库页形态由渠道 <code>binMode</code> 决定（<code>off</code>/<code>zone</code>/<code>bin</code>）；任务会存档建任务时的档位（<code>binModeAtCreate</code>），<b>建任务后改档不影响进行中的任务</b>。</li>
      <li><b>本次不做</b>（P1/P2）：周期轮盘（排期）、多轮复盘留痕、库位级账目分摊、差异导出、库位偏差统计。差异页与手册均已注明。</li>
      <li><b>synchronize 建表</b>：三张新表随服务启动自动创建，无需手工执行 SQL。</li>
    </ul>

    <h3>16.6 验收结论（线上 e.joho.cn/guanli，手机 390×844 dpr=2）</h3>
    <p>（执行时填写：探针输出摘要 / 截图张数 / 已知偏差。）</p>

    <h3>16.7 验收截图</h3>
    <p>（执行时插入 <code>assets/stocktake_*_390.png</code> 的 <code>&lt;img&gt;</code> 标签，逐张配一句说明。）</p>
```

并把 `<footer>` 文案改为（在既有追加记录后补本次）：

```html
  <footer>vShop · web-admin 后台修复操作手册 · 生成于 2026-09-04（2026-09-13 追加第 12 章，2026-09-21 追加第 13 章，2026-09-22 追加第 14 章，2026-09-23 追加第 15 章，2026-09-23 追加第 16 章） · 适用于 Nuxt/Vue3 uni-app H5 前端</footer>
```

同时补目录（`<h3>目录</h3>` 那一节）里的一条：

```html
      <li>16 多人协同盘库 · 任务 / 盘次 / 差异过账（2026-09-23）</li>
```

- [ ] **Step 6: 本地构建 + 部署（绝不在服务器构建）**

```powershell
node scripts\deploy.mjs
```

（cwd: `d:\zhao\vshop`）

预期：脚本自动本地构建 → 打印产物大小校验通过 → scp 到服务器 → 服务器解压/拷入（nshop/web-admin 走 `deploy.mjs`，**不是** git pull）。

记录：产物大小、执行时间、脚本最后一行输出。

- [ ] **Step 7: 线上复验**

```powershell
$env:WA_SMOKE_BASE="https://e.joho.cn/guanli/"; python scripts\_smoke_stocktake_live.py
```

（cwd: `d:\zhao\vshop\web-admin`）

预期：`PASS（失败 0 项）`，退出码 0。**渠道收口与 shop-api 未泄漏两项必须是 OK**（规格 §12 列为必测）。

再跑一次截图脚本（打生产），把生产截图覆盖/补充到手册第 16.7 节：

```powershell
python _e2e\_shot_stocktake.py
```

（若脚本内 `BASE` 仍指向 `localhost:5280`，执行时临时改为 `https://e.joho.cn/guanli/`；**线上仍绝不调 `postStocktake`**。）

- [ ] **Step 8: 提交**

```bash
git add scripts/_smoke_stocktake_live.py _e2e/_shot_stocktake.py docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html docs/webadmin-bugfix-manual/assets src/static/manual/shots
git commit -m "test(stocktake): 只读冒烟探针 + 手机视口截图 + 手册第 16 章"
```

（cwd: `d:\zhao\vshop`）

---

## 执行结果

> 执行每个 Task 后**立即回填本表**（提交哈希 + 状态 + 证据）。证据栏写可复核的东西：命令、输出摘要、截图文件名、探针退出码、任务 code。

| Task | 内容 | 提交哈希 | 状态 | 证据 / 备注 |
|---|---|---|---|---|
| 0 | 环境自检 | — | ✅ 已完成 | 无 typeorm 双实例；基线 229 用例/35 套件；注册点行号已记；DB 变量确认 |
| 1 | 盘库三张表 | `19ecfc592` | ✅ 已完成 | 三表实体 + plugin 注册；起服实测自动建表通过 |
| 2 | 盘库纯函数 + 单测 | `818cf46d3` | ✅ 已完成 | 新增 22 用例；状态机/任务号/应盘清单/差异汇总/扫码/过账计划 |
| 3 | 库位 → SKU 反向查询 | `1c686314c` | ✅ 已完成 | 8 用例 + 起服实测 `variantBinsByLocation`/`binOccupancy`；渠道收口实测（shop-b 返回 0） |
| 4 | 盘库 Service（建任务/盘次/录入/提交） | `7ac36eda8` | ✅ 已完成 | 3 用例 + bootstrap 实测建任务链路；夹具清理完毕 |
| 5 | 过账（差异查询 + 过账事务） | `f8535f820`、`64fe535bf` | ✅ 已完成 | `diffOf`+`post`；自检先误将未盘变体清零，经用户裁决改为**真跳过**后复验「未盘变体账面保持不变 18/18」 |
| 6 | 权限点 + SDL + Resolvers + 只读探针 | 后端 `b51f8534c`、前端 `8454e20` | ✅ 已完成 | 探针 24 项 / 0 fail；shop-api 未泄漏盘库字段；`binOccupancy` 含空格 n=18；`npm test` 230 用例无新增失败 |
| 7 | 本地写链路自检（过账 + 复位） | 前端 `1909a64` | ✅ 已完成 | `_probe_stocktake_local.py --write --post` 全 PASS：未认领录入被拒✓ 认领✓ 进 `COUNTING`✓ 提交✓ 任务进 `COUNTED`✓ 差异 `uncountedCount=18`✓ 有未盘项过账被拒✓ 过账成功（`stockDocId=3`）✓ 重复过账被拒✓ variant 1 库存 1000→0✓ **未盘变体账面不变 18/18**✓ 已复位 1000✓；测试任务 `code=TK20260924-002`。本地 shop-a 补 `TenantMember` 夹具（见偏差 #20），残留经 `_cleanup_stocktake_residue.mjs` 清理（删 line=38/wave=2/task=2/doc_item=1/doc=1/ledger=2；复核 `tasks=0 waves=0 lines=0 docs=0 loc1_total=6940 loc1_rows=19`） |
| 8 | 部署后端 + 生产只读回归 | vendure `b91343562..b51f8534c`（含 Task 5/6 全部后端产物） | ✅ 已完成 | **Step1-2**：push fast-forward 成功，服务器 HEAD=`b51f8534c`；`pm2 restart vendure` 后日志确认 `stocktake_task`/`stocktake_wave`/`stocktake_line` 三表自动建（含索引与唯一约束），bootstrap 10:48 AM（pid 3045798）。**Step3**：生产只读探针（`https://e.joho.cn` + t2/loc3）**24/24 PASS**：8 Query + 10 Mutation 已注册、`stocktakeTasks` 按渠道收口无 errors、`binOccupancy` n=18 含空格、`variantBinsByLocation` 可查、**shop-api 不含盘库查询**（故 nshop `graphql.schema.json` 无需刷新）。**Step4**：渠道收口验证 **8/8 PASS**——t2 建任务 `TK20260924-001`（id=1, waves=1, expected=20）；t2 自己查到 `totalItems=1`；**t1 `totalItems=0`**；**`__default_channel__` `totalItems=0`**；t1 直查该 id 被拒「盘点任务 #1 不属于当前店铺」；t2 `cancelStocktakeTask` → `CANCELLED`。副作用留意：日志见既有 `synchronize:true` 的 DROP/ALTER（非本次新增） |
| 9 | 前端纯函数 + API 层 + mockup 定稿 | 前端 `ed6379c` | ✅ 已完成 | ①**Step1 版式已定稿**：5 页 mockup 以 3 个内联可视化预览并排呈现（M1+M2 / M3 / M4+M5，非 tab 翻页式），用户裁定「五页全部定稿」。②`stocktake-grid.ts`（261 行）+ `stocktake-grid.spec.ts`（133 行）：先失败（`ERR_MODULE_NOT_FOUND`）后 **pass 15 / fail 0**（计划写「13 个用例」，实际 15 个，见偏差 #22）。③`apis/stocktake.ts`（370 行）：6 查询 + 10 变更，`StocktakeCountEntryInput` 已对齐。④`storage-bin.ts` 追加 `fetchBinOccupancy`。⑤`npx vue-tsc --noEmit` 仓库既有 1348 处报错，本次增量仅 +3 且全在新 spec（`@types/node` 未安装 / `allowImportingTsExtensions` 未开，与既有 `templates.spec.ts` 同类），**三个生产文件零报错**（见偏差 #23） |
| 10 | 任务看板页 | `b832ff1` | ✅ 已完成 | ①5 文件：`pages.json` 注册本页；中英 i18n 新增 `stocktake.state/waveState/board`（中英成对）；`components/stocktake/TaskCard.vue`（含 scope 徽标消费 `scopeBadges(parseScopeJson(task.scopeJson))`）；`pages/inventory/stocktake/index.vue`（状态 Tab + 仓库筛选 + 按活动码分组 + 新建任务弹层）。②删掉计划里 `<script setup>` 内非法的 `export { scopeBadges, parseScopeJson }`（自审已标注），改为卡片真正消费，`index.vue` 不再 import 该两项。③「已结束」Tab 改为不下发 state、前端按 `POSTED||CANCELLED` 收敛（偏差 #25）。④验证：`npm run build:h5` 编译通过（仅既有 sass legacy 告警）；`vue-tsc` 增量仅 `$t`-in-template 一类（与既有页面同源，无逻辑/类型错误）；本地 dev server（`VITE_API_URL=https://e.joho.cn`）**手机视口 390×844 dpr2** 实测 t2 渠道看板：四 Tab / 仓库筛选 / 活动码分组「盘点活动 SMOKE-T2」/ 任务卡 `TK20260924-001`（「已取消」徽标 + 进度条 + 已盘 0/20 + ALL scope 徽标 + 0/1 盘次已提交）/ 右下浮动「＋新建盘点任务」全部正常，**0 pageerror / 0 console error** |
| 11 | 任务详情页 | `124df13` | ✅ 已完成 | ①5 源文件 + 5 张手机视口截图：`pages.json` 注册 `pages/inventory/stocktake/task`（`?id=`）；中英 i18n 新增 `stocktake.task.*`（30 键中英成对）；`components/stocktake/WaveCard.vue`（**按修正版**：`zoneLabel` 三值 + 文案 props，脚本内不引 `useLocaleStore`）；`pages/inventory/stocktake/task.vue`；截图 `src/static/manual/shots/t11_{detail_open,assign_sheet,detail_assigned,wave_cancelled,task_cancelled}.png`。②**计划 Step4「实施时必须替换的两处占位」已替换**：`loadMyMemberId()` 复用既有 `fetchMyTenantMembers()` 按 `administratorId === auth.userId` 匹配（偏差 #28）；`onAssign()` 实现 `uni.showActionSheet` 成员选择器 +（已认领时）「待认领」项（偏差 #27）。③验证：`npm run build:h5` 改前/改后两次均 `Build complete`（仅既有 sass legacy 告警）；`vue-tsc` 过滤 `$t` 后 stocktake 增量 **0**（仅 Task 9 既有 3 处 spec 报错）；本地 dev server（`VITE_API_URL=https://e.joho.cn`）**手机视口 390×844 dpr2** 实测 t2 渠道 **0 pageerror / 0 console error**，覆盖 Step5 四条：①任务信息卡 任务号/仓库/活动码（未分组）/范围 `ALL (包含账面为 0 的变体: ✕)`/创建人/创建时间 + 进度条；②`OPEN` 盘次显示「认领·指派·取消盘次」+ 过账按钮 **disabled** + 提示「还有 1 个盘次未提交」；③指派面板列出 t2 成员（陈店长/田经理）→ toast「已指派给 陈店长」→ 卡片变「已认领 / 负责人：陈店长」，且 **`isOwner=false` 时无「进入录入 / 释放」**（负例证明 `isOwner` 门控生效；再点「待认领」被服务端独占锁拒「该盘次已被 田经理 认领」）；④「取消盘次」→ 盘次变灰无按钮、提示消失、任务态随 `resolveTaskStateAfterWaves` 推进；收尾「取消任务」→ `已取消` 且过账按钮转 disabled。④**环境限制（非页面缺陷）**：生产登录账号在 t2 无 `tenant_member` 行 → 「认领」被服务端独占锁拒绝并**如实回显** toast「当前账号不是本店人员，无法认领盘次」（与偏差 #20 同因；Task 7 本地探针已用 fixture 验证认领正例），故 `isOwner=true` 的「进入录入/释放」正例未在生产演示——其显隐为纯 `state + isOwner` 判定。⑤测试数据残留：t2 新增 `TK20260924-002` / `TK20260924-003`（脚本创建、已 `cancelStocktakeTask` → `CANCELLED`），留待 Task 16 手册统一说明 |
| 12 | 手机录入页（版式 B）+ 共享 composable | `c6cf15f` | ✅ 已完成 | ①**8 源文件 + 8 张手机视口截图**：`pages.json` 注册 `pages/inventory/stocktake/count`（`?taskId=&waveId=`）；中英 i18n 新增 `stocktake.count.*`（31 键中英成对）；`composables/useStocktakeScope.ts`（盘次上下文：`task/wave/lines/filter/drafts/progress/canEdit/visibleLines/unassignedLines` + `load/save/saveLine/addExtra`，`canEdit` 只看盘次状态 `CLAIMED/COUNTING`）；`components/stocktake/BinGrid.vue`（库区横向 Tab → 格子宫格 → 库区摘要）；`components/stocktake/CountLineRow.vue`；`pages/inventory/stocktake/count.vue`；截图 `src/static/manual/shots/t12_{readonly_uncounted,readonly_binpicked,editable_zone_uncounted,editable_binpicked,editable_input,editable_unassigned,editable_filter_all,off_mode}.png`。②**计划 Step6「实施时按此修」3 点已全部落实**（库区真实列表 `fetchStorageZones` 参与 `groupBinsByZone`；删 `void isCounted` 与 import；删未用 `StorageBin` import），**另修 3 处计划代码缺陷**（偏差 #31/#32/#33）+ 补 `goScan` fail 回调（偏差 #34）。③验证：`npm run build:h5` → `Build complete`（仅既有 sass legacy 告警）；`vue-tsc` 过滤 `$t` 后 stocktake 增量 **0**（仅 Task 9 既有 3 处 spec 报错）；本地 dev server（`VITE_API_URL=https://e.joho.cn`）**手机视口 390×844 dpr2** 实测 t2 渠道 **0 pageerror / 0 console error**，覆盖 Step7 六条：①顶部「盘次：A 常温存储区」+ 进度「已盘 0/1」+ 进度条 + 全部/未盘/已盘筛选 + 扫码快盘；②bin 档库区 Tab A/B/C/D 可切、10 个格子（9 空格）可见、「本库区 SKU 1 项 · 空格 9 个」，点格子描边高亮 + 「本格子 1 项」且行清单收敛到该格子（1 行），再点一次回到库区全量；③输入 `3` → 输入框回显 `3`（**只填不保存，未触发任何落库写入**）；④切「全部/未盘」筛选生效；⑤未认领/已取消盘次直接进来 → 顶部红字「请先在任务详情页认领该盘次」+ 输入 `disabled`（负例）；bin 档 `off` 兜底 → 无网格 + 「本仓未启用库区，直接按清单录入」+ 20 行清单可直接录。④**环境限制（非页面缺陷）**：生产登录账号在 t2 无 `tenant_member` 行 → 无法认领 → 改用「新建演示任务 `TK20260924-007` 并把两个盘次指派给陈店长（`state→CLAIMED`）」演示可录入态（`canEdit` 只看盘次状态，不依赖 owner），全程不触发保存/提交（偏差 #35，与 #20 同因）。⑤收尾：演示任务 `TK20260924-004/005/006/007` 全部 `cancelStocktakeTask` → `CANCELLED`；t2 `binMode` 复原 `off` 并复核 `activeChannel.customFields.binMode=off`；3 个临时脚本已删除、`dist` 已 `git restore` |
| 13 | 扫码快盘（版式 C） | `aaa6f8c` | ✅ 已完成 | ①**4 源文件 + 13 张手机视口截图**：`pages.json` 注册 `pages/inventory/stocktake/scan`（`?taskId=&waveId=`）；中英 i18n 新增 `stocktake.scan.*`（23 键中英成对，含自审新增 `otherWave`）；`pages/inventory/stocktake/scan.vue`（版式 C 单件专注：大号 SKU/名称/账面/库位 + `−1`/输入/`+1` + 上一件/确认并下一件/跳过 + 扫码定位/手动输入 + 命中提示条 `.hit`）；截图 `src/static/manual/shots/t13_scan_{readonly,editable,plus1,save_denied,scan_result,manual_hitbin,manual_hitline,other_wave,extra_modal,extra_result,none_code,progression,off_mode}.png`。②**计划 Step4 八条全部覆盖 + 3 条额外汇总**（详见下方证据）。③验证：`npm run build:h5` → `Build complete`（仅既有 sass legacy 告警）；`vue-tsc` 过滤 `$t` 后 `stocktake/scan.vue` **13 处全为基线 `Property '$t'`、逻辑/类型零报错**；本地 dev server（`VITE_API_URL=https://e.joho.cn`）**手机视口 390×844 dpr2** 实测 t2 渠道 **0 pageerror / 0 console error**。④**实测证据逐条**：**未认领盘次** → 红字「请先在任务详情页认领该盘次」+ 输入 `disabled=True`（负例）；**已认领（指派陈店长）** → 无红字 + 输入 `disabled=False`；**加减快捷** `"" →+1 "1" →+1 "2" →-1 "1"`；**确认并下一件** → toast「该盘次已被 陈店长 认领，无法操作」（保存 owner 锁由服务端如实回显）；**跳过/上一件** 单件推进有效；**扫码**（headless 无相机）→ toast「无法打开相机，请在浏览器地址栏允许摄像头权限后重试，或改用【手动输入】」且 `#scanner-h5-region` overlay=0（不白屏，符合「手动输入优先」预期）；**手动输库位码** `A-01-01` → 「已定位库位 A-01-01」；**手动输 SKU** `COUPON-TEST-V1` → 「已定位 COUPON-TEST-V1」；**他盘次 SKU** `LY-NS-199` → 「该商品不在本盘次清单内（可能属于本任务的其他盘次）」（新守卫生效，见偏差 #38）；**清单外盘盈**：建窄范围演示任务（`scope.variantIds=[74]`，应盘 1 行）→ 手动输目录内其它 SKU `P1788779821524` → 弹窗「清单外商品 / 「P1788779821524」不在应盘清单内，登记为盘盈？/ 取消 / 确定」→ 确定后被服务端如实拒「该盘次已被 陈店长 认领，无法操作」；**不存在的码** `ZZZ-NOT-EXIST-13` → 「该码未匹配到商品，无法登记盘盈」（见偏差 #37）；**未归位盘次（21 行）** → 「跳过」推至 `LY-HDL-138`、「上一件」回到 `ACS-1788910073029`，单件专注推进有效；**off 档兜底** → 红字「本仓未启用库位，扫码只做清单定位」且库位显示退化为 `A`（库区码）。⑤**环境限制（非页面缺陷）**：保存/盘盈登记的**写入正例**在生产不可演示（见偏差 #39，与 #20/#35 同因），写入链路已由 Task 7 本地写链路探针全 PASS 覆盖。⑥收尾：演示任务 `TK20260924-016/017/018` 全部 `cancelStocktakeTask` → `CANCELLED`；t2 `binMode` 复原 `off` 并复核 `activeChannel.customFields.binMode=off`；3 个临时脚本（`_t13_probe.py`/`_t13_diag.py`/`_t13_scan_verify.py`）已删除、`dist` 已 `git restore`。⑦测试数据残留：`TASK13-SCAN` 名下 `TK20260924-008/009/011/012/013/014/015/016/017/018` 共 10 个任务全部 `CANCELLED`，留待 Task 16 手册统一说明 |
| 14 | 差异页与过账 | `52f69a8` | ✅ 已完成 | ①**4 源文件 + 7 张手机视口截图**：`pages.json` 注册 `pages/inventory/stocktake/diff`（`?taskId=`）；中英 i18n 新增 `stocktake.diff.*`（计划 28 键 + 计划 Step3「实施时按此修」要求的 `noPermission`，中英成对）；`pages/inventory/stocktake/diff.vue`（四宫格摘要 / 账面变动提示条 `.recheck` + `changedVariants` 明细 / 未盘项折叠清单 `.blk .bh` + `.urow` + 显式跳过勾选 `.skip` / 差异表 `.thead/.trow` / 吸底过账条 `.postbar`）；截图 `src/static/manual/shots/t14_diff_{summary,uncounted_expanded,skip_checked,confirm_modal,post_done,posted_reenter,no_permission}.png`。②**计划原稿缺陷已修 1 处**（过账死路，偏差 #41）；**计划未覆盖的既有缺陷已修 1 处**（硬刷新丢权限上下文，偏差 #42）。③验证：`npm run build:h5` → `Build complete`（仅既有 sass legacy 告警）；`npx vue-tsc --noEmit -p tsconfig.json` 过滤 `$t` 后 `stocktake/diff.vue` **逻辑/类型零报错**（21 处全为仓库基线 `Property '$t'`）、`App.vue` **零报错**；**本地全链路探针 `_t14_diff_verify.py` 32 项断言 / 0 fail**（环境说明见偏差 #43），手机视口 390×844 dpr2。④**Step4 七条逐条证据**：**①四宫格** 摘要原文 `19 应盘 / 1 已盘 / 18 未盘 / 0 盘盈`，与应盘行统计一致；**②未盘门控** 未勾选时 `uni-button` 带 `disabled` 且 opacity 0.5（点不动）→ 展开 18 行未盘清单 → 勾选「确认跳过 18 项未盘」后 `disabled` 消失、按钮可点；**③账面变动提示条** 黄色条「建任务后账面已变动：1 个变体的账面数与快照不一致…」+ 明细「NF-WATER-500：快照 1008 → 当前 1013」；**④过账二次确认** 点「过账」→ 被服务端拦下（原文「有 18 项未盘，若确认跳过请勾选后重试」）→ 弹窗「…\n账面已变动，确认按当前账面重算并过账？」→ 点「确认过账」→ toast「过账完成，已生成盘点单据」→ 任务 `POSTED` 且 `postedStockDocId=7` → 被测变体账面由 1013 落为实盘 1012；**⑤幂等保护** 再进差异页 → 按钮置灰 + 红字「本任务已过账，不可重复过账」；**⑥能盘 ≠ 能过账** 临时建 `E2E-NOPOST` 角色（仅 `ReadCatalog`）+ 受限账号 → 按钮置灰 + 红字「无过账权限」，**且直连 `/admin-api` 调 `postStocktake(confirm:true)` 被服务端拒**（`FORBIDDEN: You are not currently authorized to perform this action`），前端门控与服务端门控双证；**⑦复位** 被测变体 `NF-WATER-500` 账面 **1008 →（盘中改账）1013 →（实盘）1012 →（过账后）1012 →（复位）1008**，终值已复核等于初值（该组数字待 Task 16 手册收录）。⑤收尾：本地演示任务 `TK20260924-005..009` 均落 `POSTED`（终态不可取消，本地库留档）；临时受限账号/角色已删（含按邮箱清掉 `Administrator` 本体，见偏差 #43）；`dist` 已 `git restore` |
| 15 | 菜单权限门控 + i18n | `50857b8` | ✅ 已完成 | ①**3 源文件 + 1 探针 + 7 张手机视口截图**：`src/constants/menus.ts`（`MenuItem` 增可选 `perm`；库存域插入 tier 1 `menu.stocktakeTask → /pages/inventory/stocktake/index`（`perm: 'StocktakeCount'`），既有 `menu.stocktake` 改名「快捷盘点」并降 tier 2、URL 不变；`visibleMenus` 增权限过滤 + 空组剔除，`binOnly` 语义与 `buildPlatformGroup` 写法不变）；中英 i18n 的 `menu` 块补 `stocktakeTask`（协同盘库 / Stocktake tasks）并把 `stocktake` 改为「快捷盘点 / Quick stocktake」（L1090/1119 两处嵌套同名键按要求**未动**）；`scripts/_t15_menu_verify.py`；截图 `src/static/manual/shots/t15_menu_{superadmin_dashboard,sales_dashboard,stock_dashboard,superadmin_board,superadmin_quick_stocktake,sales_board_direct,noread_board_direct}.png`。②验证：`node -e` 词条核对打印 `menu 词条 OK: stocktakeTask=协同盘库 stocktake=快捷盘点`；`npx vue-tsc --noEmit -p tsconfig.json` 全仓基线 1453 处报错中 **`constants/menus.ts` 零命中**（增量 0）；`npm run build:h5` → `DONE Build complete.`（仅既有 sass legacy 告警）。③**本地探针 `_t15_menu_verify.py` 29 项断言 / 0 fail**（退出码 0），手机视口 390×844 dpr2；**Step6 四条逐条证据**：**①超管** 商品域菜单 `['分类','＋新增商品','商品列表','库存预警','采购入库','移库','**协同盘库**','快捷盘点','手动出库','库存流水','仓库管理','图片库']`——新入口排在「快捷盘点」之前；计算样式 `协同盘库=rgb(255,255,255)`（tier 1 实心渐变白字）/ `快捷盘点=rgb(255,102,0)`（tier 2 描边主色）；点「协同盘库」→ `#/pages/inventory/stocktake/index`，看板 4 个状态 Tab + 「＋新建任务」浮动按钮渲染；**②销售（`t0-sales`，含 `ReadCatalog`、不含 `StocktakeCount`）** 商品域菜单中**无「协同盘库」**且域未被整块清空、「快捷盘点」仍在；**③既有「快捷盘点」** 点击落到 `#/pages/inventory/stock-doc/stocktake/index` 且 `.savebar .save` 渲染（行为与改造前一致）；**④「库存」角色（`t0-stock`，本地库已含 `StocktakeCount`）** 商品域菜单**可见「协同盘库」**。④**权限纵深双重证据**：销售直连 `/pages/inventory/stocktake/index` **不白屏**（看板 4 Tab 正常渲染），但直连 `/admin-api` 调 `createStocktakeTask` 被服务端拒（`FORBIDDEN: You are not currently authorized to perform this action`）；另建「无 `ReadCatalog`」临时角色账号直连 URL → 页面 top 层弹出后端原文 `You are not currently authorized to perform this action` toast 且 DOM 未白屏（Step6 第 2 条的「后端接口返回权限错误 + 前端 toast 出后端原文」由该负例覆盖，见偏差 #45）。⑤收尾：临时账号 `e2e-t15-{sales,stock,noread}@test.local` 三个成员关联 + `Administrator` 本体（按邮箱 `deleteAdministrator`）与临时角色 `E2E-T15-NOREAD` 全部删除，**未改动任何内置角色**（`t0-sales`/`t0-stock` 仅读取）；`dist` 已 `git restore` |
| 16 | 回归探针 + 手机截图 + 手册 + 部署 | `f5831d8`、`fd8072e` | ✅ 已完成 | ①**回归探针**：`scripts/_smoke_stocktake_live.py`（只读，唯一写入由 `WA_SMOKE_SETMODE` 控制默认关）。**本地**（5281 dev server + 本地 vendure）跑出 **OK=35 / FAIL=0，退出码 0**——8 Query + 10 Mutation 已注册、`StocktakeCount`/`StocktakePost` 可枚举、`stocktakeTasks`/`binOccupancy(loc=1, bins=18, zeros=17)`/`variantBinsByLocation`/`stocktakeDiff` 可查、任务状态取值合法、**渠道收口：两渠道任务 id 无交集（`channel=__default_channel__ totalItems=0 交集=[]`）**、shop-api 未泄漏盘库字段 OK、三页可达 0 JS 异常。**线上**（`https://e.joho.cn/guanli/` + t2/loc3）**PASS 0 项失败**：8+10 已注册、2 权限点可枚举、`stocktakeTasks totalItems=18`、`binOccupancy loc=3 bins=18 zeros=17`、`variantBinsByLocation totalItems=0`、`stocktakeDiff(TK20260924-018)` = `{expectedTotal:1, countedTotal:0, uncountedCount:1, extraCount:0, diffCount:0, recheck:false}`、**shop-api 未泄漏 OK**、看板 tabs=4、三页可达 **pageerror=0**（唯一 console.error 为 `ERR_CONNECTION_CLOSED` 网络抖动，非页面异常）；**渠道收口如实记 SKIP**（登录账号只属 t2，取不到可比渠道，不虚报 OK；该断言已由 Task 8 用显式渠道令牌在生产验证 8/8 PASS，见偏差 #50）。②**手机视口截图 25 张**（`_e2e/_shot_stocktake.py`，390×844 dpr=2 输出 780×1688，全程可逆、**绝不调 `postStocktake`**）：**本地 17 张** `stocktake_{board_first,board_empty,new_sheet,task_open,task_assigned,count_readonly,count_zone_selected,count_bin_selected,count_editable,scan_readonly,scan_hitbin,scan_manual,scan_extra,none_code,diff_summary,diff_skip,post_done}_390.png`；**线上 8 张** `stocktake_live_{board,new_sheet,task,count,count_grid_sel,scan,diff,done}_390.png`（另用 `stocktake_live_*` 命名避免覆盖本地证据）。逐图肉眼核对通过：线上看板 4 页签 + 历史残留任务全 `CANCELLED`；线上录入页库区 Tab A/B/C/D + 10 格（A-01-01 有 1 件）+ 汇总「本库区 SKU 1 项 · 空格 9 个」+ 未认领红字提示；线上差异页 `20 应盘 / 0 已盘 / 20 未盘 / 0 盘盈` + 差异「暂无差异」+ 过账按钮置灰 + 红字「任务尚未全部完成盘点（需所有盘次已提交），暂不可过账」；**线上 0 pageerror / 0 console.error**。③**顺带发现并修复 1 处缺陷**（偏差 #47）：`BinGrid.vue` 在 zone 档仍渲染库位格子，违反规格 §8.2「zone 档只到库区、不暴露库位码」→ 补 `showCells` prop（仅 bin 档为真），`count.vue` 传 `:show-cells="showBin"`，复跑确认 `zone 档 库区Tab=4 格子=0`（代码提交 `f5831d8`）。④**手册**：`docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 追加第 16 章（16.1 能力概览 / 16.2 后端表 / 16.3 前端表 / 16.4 回归测试与证据 6 行断言表 / 16.5 升级须知 / 16.6 验收结论「本地 ok + 线上 warn」双 callout / 16.7 验收截图 A–K 组 25 张 + 故障排查 8 条 + 涉及文件与回滚）+ 目录条目 + footer 文案；校验 `<section` 16/16 平衡、`<footer>` 1 处、25 张 `assets/stocktake_*.png` 引用**全部存在**。16.4 关键数据：前端单测 `node --test src/utils/stocktake-grid.spec.ts` → **15 用例 / 6 套件全绿**（偏差 #48）；`NF-WATER-500` 数字链 `1008 →（盘中改账）1013 →（实盘）1012 →（过账后）1012 →（复位）1008`，`stockDocId=3`。16.6 如实收录既有偏差 #45 边界（**前端未做按钮级置灰**，权限只落菜单门控 + 服务端权限点 + owner 锁三层）与 #40（`autoSplitByZone` 无实际效果）。⑤**部署**（用户于 2026-09-24 确认「执行部署」）：`node scripts\deploy.mjs`（cwd 实为 `web-admin`，计划写的 cwd 有误，见偏差 #49）→ `uni build` 成功 → **产物校验通过 45964 KB** → scp 到 `joho` → 服务器解压到 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli` + 备份轮转 → nginx `syntax is ok` + `signal process started` → **`deploy done`**；本地构建、服务器只解压不构建（部署铁律）。⑥**生产写入边界（严格自守）**：线上唯一写入 = 建 1 个演示任务 `TK20260924-019`（已 `cancelStocktakeTask` → `CANCELLED`）+ 可逆切档 `binMode off → bin → off`（已复核 `activeChannel.customFields.binMode=off`）；**未认领、未录入、未提交、全程未调 `postStocktake`**（探针与截图脚本均无过账路径）。⑦**残留数据**：生产 `TK20260924-001..019` 全部 `CANCELLED`（含 Task 8/11/12/13/16 各轮演示任务）；本地 `TK20260924-005..009` 落 `POSTED`（Task 14 过账终态，本地库留档，不可取消）、`TK20260924-010..016` `CANCELLED`。⑧**清理**：4 个临时日志（`_t16_live.log`/`_t16_run1.log`/`_t16_shot.log`/`_t16_shot2.log`）+ `_tsc16.log` 已删除；测试后 `Remove-Item -Recurse -Force web-admin\dist\build\h5` + `git restore web-admin\dist` 已执行。⑨**基线**：`npx vue-tsc --noEmit -p tsconfig.json` 仓库既有 1453 处报错（与 Task 15 同基线，本轮零新增源文件）；前端单测 15 用例/6 套件全绿。⑩**提交拆两条**（计划只要求 1 条，见偏差 #51）：`f5831d8` zone 档渲染缺陷修复、`fd8072e` 探针 + 25 张截图 + 手册第 16 章（53 files changed, 764 insertions(+), 1 deletion(-)） |
| 16 续 | 偏差 #40 / #45 追补（2026-09-25 裁决「四项一起做」） | 后端 `ad084e016`、前端 `d336df9` | ✅ 已完成 | ①**#40 后端补实现**：`buildExpected` 增可选 `autoSplitByZone`（`false` = 整仓一个 `whole` 盘次、行仍保留库位归属；缺省 / `true` = 按库区拆），`createTask` 透传 `input.autoSplitByZone !== false`；`npx vitest --config vitest.config.mts --run src/stocktake/stocktake-math.spec.ts` → **28 tests passed**，`npm run build` 重出 `lib/`。②**#45 前端补齐**：权限并入 `useStocktakeScope.canEdit`（`canCount`），`index/count/scan` 三页置灰 + 提示三段分因 + 中英各 3 键。③**后端探针** `_t40_autosplit_verify.py` **8/8 PASS**：ON → `TK20260925-001` waveCount=2 `[('zone','A',2),('unassigned',None,17)]`；OFF → `TK20260925-002` waveCount=1 `[('whole',None,19)]`；应盘总数两态一致 19/19；binMode `off→bin→` **已还原 `off`**。④**手机视口证据** `_t40_t45_shot.py` **18/18 PASS / 7 张 780×1688 / 0 JS 异常**：`t40_new_sheet_split_{on,off}_390.png`、`t40_task_waves_{on,off}_390.png`（OFF 任务 `TK20260925-006` 仅 1 个「整仓」盘次、已盘 0/19）、`t45_{board,count,scan}_no_permission_390.png`（受限账号：看板红字 + fab `opacity=0.5` 且点不开新建表单；录入/扫码输入框 `disabled` + 按钮置灰）；**服务端同时仍拒 `createStocktakeTask`（`FORBIDDEN`）**，故为「前端置灰 + 服务端拦截」双证。⑤收尾：本地 `TK20260925-001..008` 全部 `CANCELLED`；临时受限成员 / `Administrator` 本体 / 角色已删；`binMode` 已还原 `off`。⑥**基线**：`npx vue-tsc --noEmit -p tsconfig.json` 本轮 **1456 处**（`$t` 类 1372 / 非 `$t` 类 84，非 `$t` 类全部落在既有基线文件如 `utils/print/templates/*`、`utils/stocktake-grid.spec.ts`），四个改动文件**仅 `$t`-in-template 一类**。⑦**提交**：后端 `ad084e016`、前端 `d336df9`，文档见本轮 docs 提交 |

### 偏差说明区

> 实施过程中凡是**与计划正文不一致**的地方，都要在这里留一条（写「计划怎么写的 → 实际怎么做的 → 为什么」）。计划正文一律不回头改（便于复盘计划本身的准确度）。

| # | 位置 | 计划 | 实际 | 原因 |
|---|---|---|---|---|
| 1 | 数据模型（规格 §4.1 的 `channelId`） | `channelId` | `tenantChannelId`（varchar） | 与 `variant_storage_bin` / 既有库位实体同源，`String(ctx.channelId)` 收口 |
| 2 | 盘次状态机（规格 §4.2 的 `RELEASED`） | `RELEASED` 为独立状态 | **舍弃**，release = 回到 `OPEN` 并清空负责人 | 「退回待认领」与 `OPEN` 语义完全重合，多一个状态只是多一条要维护的边 |
| 3 | 盘次状态机（规格 §5 的 `ASSIGNED`） | `ASSIGNED` 与 `CLAIMED` 并列 | 统一并入 `CLAIMED` | 是否为同一状态对业务无差别（都表示「有负责人、可录入」），两条边会产生不可达组合 |
| 4 | SDL 字段类型 | — | `scopeJson: String`、时间取 `DateTime`、id 取 `ID` | `scopeJson` 是坏 JSON 容错的文本快照，前端自行 `parseScopeJson`；GraphQL 无 JSON 标量约定，走 String 最省事 |
| 5 | Task 3 明细查询实现 | 逐级 SQL 过滤 + 数据库分页 | 一次 SQL 取全量绑定 + `In(variantIds)` 补商品字段 → JS 过滤/排序/分页 | 单渠道单仓的绑定量可控（千级），一次查完避免多次 round-trip 与动态 SQL 拼接 |
| 6 | `binOccupancy` 聚合 | 规格已给出「复用 `binBindCounts()`」 | 照做，新增 resolver + SDL，**聚合逻辑零新增** | 规格 §7.1 明确要求口径一致 |
| 7 | Task 5 过账验证范围 | — | **只在本地**验证（会真实改库存），生产**绝不**调 `postStocktake` | 与配货台「不真实发货」同一处置原则 |
| 8 | 菜单门控 | 规格 §9 只说「按新权限点门控」 | 计划新增 `MenuItem.perm` 字段 + `visibleMenus` 权限过滤 | 既有 `visibleMenus` 只有 `binOnly` 一个维度，无权限维 |
| 9 | Task 11 指派入口 | 规格 §9「可指派」 | 本轮管理员指派**仅支持「改为待认领」**（`assigneeId = null`） | 前端缺「租户成员列表」查询（`fetchMyTenantMember()` 本轮只补「取自己」）；完整成员选择器留 P1 |
| 10 | Task 12 录入页库区列表 | — | `groupBinsByZone(occupancy, [])` 的 `[]` 要换成 `fetchStorageZones(locId)` 真实结果 | 否则库区排序与名称只能用行内快照，与库位管理页口径不一致 |
| 11 | 前端单测框架 | 计划（含既有打印模板计划）写 vitest | 改用 `node --test`（相对导入带显式 `.ts`） | web-admin 未安装 vitest，既有 `templates.spec.ts` 已是 `node --test` 先例 |
| 12 | 前端 schema 快照 | 规格 §12 提示「需刷新/打补丁 `graphql.schema.json`」 | 本轮**不刷** nshop 快照 | 本轮只注册 admin-api，**无 shop-api 变更** → 快照缺的字段不影响 nshop codegen；并由只读探针显式断言 shop-api 未泄漏盘库字段 |
| 13 | Task 13/14 的 mockup 前置 | R13 要求「版式先预览定稿」 | 复用 Task 9 Step 1 已确认的 M4/M5，**不重复出稿** | 同一批页面版式，重复出稿无增量信息 |
| 14 | 未盘变体过账语义（规格 §6.2 / Task 2 单测 / Task 5 `post`） | 差异仍按 `0 - 账面` 体现（`diff=-4`），`confirm` 后按 `realQty=0` 生成过账项 → 实际「清零」 | `summarizeVariance` 增加 `hasCounted` 判定，**整变体未盘不进 `byVariant`**，故天然不进 `buildPostItems` → 过账**真跳过**，账面保持不变 | 规格 §6.2 字面是「未盘项账面不变」，原实现与字面矛盾且会静默清零库存；用户于 2026-09-24 裁决「真跳过」。未盘项仍由 `uncountedLines`/`uncountedCount` 列出，前端差异表不显示未盘行（未盘走独立折叠清单） |
| 15 | 计数入参类型名 | SDL `input StocktakeCountInput` | **改名为 `StocktakeCountEntryInput`**（计划 L2853/L2870/L3941/L6981 已同步改名） | `@vendure/inventory-plugin`（dev-config 已加载）的 admin SDL 已占用 `input StocktakeCountInput`，同名 `extendSchema` 冲突导致**服务无法启动**；该插件不在本计划可改范围 |
| 16 | 探针渠道 token | 计划给的探针用裸 `superadmin`（无渠道 token） | 照 `_smoke_picking_live.py` 带上 `vendure-token`（默认 `shop-a`，`WA_SMOKE_CHANNEL` 可覆盖） | 裸 superadmin 落默认渠道，而 Task 3 库位夹具在 shop-a；渠道收口会让 `binOccupancy` 返回空 → 断言假失败 |
| 17 | 探针鉴权方式 | 计划用 Cookie 会话 | admin-api 实测走 **Bearer**（裸 Cookie 返回 FORBIDDEN），令牌取自 login 响应 `session` cookie 内 base64 的 `token` | 实测行为，已在探针内注释 |
| 18 | Task 8 生产回归入口 | `WA_SMOKE_BASE='https://www.youshop.cn'` | 生产 admin-api 实际在 **`https://e.joho.cn/admin-api`** | `www.youshop.cn/admin-api` 实测 404（Page not found: /admin-api）；`calibrate-prices.mjs` 亦默认指向 e.joho.cn。已实测 200 / 282 字段 |
| 19 | Task 8 生产夹具渠道与仓库 | `WA_SMOKE_CHANNEL='shop-a'` / `WA_SMOKE_LOC='1'` | 生产**无 shop-a 渠道**，库位夹具在 **`t2` / location 3（默认仓）**（bins=18，empty=17） | 生产渠道列表实测为 `official-01..20 / __default_channel__ / t1..t3 / t24 / test-marketplace-shop`；盘库夹具只建在 t2 |
| 20 | Task 7 本地夹具 | 计划未提 `TenantMember` | 本地 shop-a 补 1 行 `tenant_member(id=21, administratorId='1', channelId='3', displayName='Super Admin')` 并**保留** | 本地 shop-a 原无 `TenantMember`，superadmin 认领被拒「当前账号不是本店人员」；用户裁决「清残留、留夹具」 |
| 21 | Task 8 Step4 渠道收口脚本的 `vendure-token` | 直接用渠道 code（`t2` / `t1` / `__default_channel__`） | 改用 **渠道 token**（`myTenantAccess.channels { token }` 按 code 匹配后取值） | `vendure-token` 头期望的是 token 而非 code，传 code 报 `No Channel with the token "t2" could be found` |
| 22 | Task 9 Step 5 单测数量 | 「预期 PASS，13 个用例全绿」 | 实际 **15 个用例 / 6 个套件**，全绿 | 计划内计数笔误（6 个 describe 分节合计 15 个 `it`）；断言逐字落地未改，规格与实现无冲突 |
| 23 | Task 9 Step 8 类型检查预期 | 「exit 0，无新增类型错误」 | `npx vue-tsc --noEmit -p tsconfig.json` **exit 2**：仓库**既有** 1348 处报错（`$t`、`apis/coupon.ts` 等），本次增量 **+3** 且全落在新 spec 文件（`@types/node` 未安装 → TS2307；`tsconfig.json` 未开 `allowImportingTsExtensions` → TS5097，与既有 `print/templates/templates.spec.ts` 同类）；`stocktake-grid.ts` / `apis/stocktake.ts` / `storage-bin.ts` **零报错** | 仓库既有工程配置缺陷（缺 `@types/node`、tsconfig 未开该选项），非本次引入；修 tsconfig 超出 Task 9 范围，故只量化增量 |
| 24 | Task 9 Step 1 mockup 呈现方式 | 「用 `PureShowWidget` 内联渲染 M1~M5」 | **未采用单 widget + tab 切换**，改为 3 个预览并排呈现（M1+M2 / M3 / M4+M5） | 首次以 tab 式单 widget 提交时用户中断并要求「重新提问」——翻页式预览不利于同时对比审阅；并排式可直接看到全部版式 |
| 25 | Task 10 看板「已结束」Tab 的取数 | `state: 'POSTED'` 下发服务端 + 前端再 `filter(state==='POSTED'||'CANCELLED')` | 该 Tab **不下发 state**，只由前端按 `POSTED||CANCELLED` 收敛 | 服务端 `state` 仅支持单值等值过滤（`stocktake.service.ts:125`），传 `POSTED` 时返回集里**永远不会有** CANCELLED，原写法会让「已结束」看不到已取消任务，与 Step 5 自测第 1 条矛盾 |
| 26 | Task 11 `WaveCard` 的 `canRelease` | `['CLAIMED','COUNTING'] && (isOwner \|\| isAdmin)` | 收窄为 `&& isOwner` | 服务端 `releaseWave` 走 `waveOwnerError`（`stocktake-math.ts:407-417`）强制独占锁：非负责人一律被拒「该盘次已被 X 认领，无法操作」。原写法会让持有 `StocktakePost` 的非负责人看到一个点了必报错的按钮；实测负例（指派给他人后）确认无「释放」按钮 |
| 27 | Task 11 指派入口（supersede 偏差 #9） | 偏差 #9：本轮**仅支持**「管理员 → 改为待认领」，完整成员选择器留 P1 | 实现 `uni.showActionSheet` **成员选择器**（`fetchMyTenantMembers()`）+ 已认领时附「待认领」项；偏差 #9 的「留 P1」作废 | 计划 Step4「实施时必须替换的两处占位」第 2 条明确授权：「若 web-admin 已有成员列表 API，则补一个简单的 `uni.showActionSheet` 选择负责人」——既有 `apis/tenant-admin.ts:295` `fetchMyTenantMembers()`（`tenantMembers` 查询仅需 `Authenticated`+本店成员）正是该 API，故无需留缺口 |
| 28 | Task 11「取自己」的成员查询 | 补一个最小查询 `fetchMyTenantMember()` | **不新增查询**，复用既有 `fetchMyTenantMembers()` 并按 `administratorId === authStore.userId` 匹配自己 | 计划 Step4 第 1 条要求「若后端已有等价接口，**优先复用**，不要新造」；`tenantMembers` 已返回 `administratorId`，等价且零新增 |
| 29 | Task 11 底部「还有 N 个盘次未提交」提示的显隐 | `v-if="task && !readyToPost"` | 收窄为 `v-if="task && openWaveCount > 0"` | 原条件在**已取消**任务上会显示「还有 0 个盘次未提交」（实测 `TK20260924-001` 复现）：此时 `state!=='COUNTED'` 使 `readyToPost=false`，而 `openWaveCount=0`，文案与事实矛盾。`openWaveCount>0` 是唯一让该文案为真的条件 |
| 30 | Task 11 `WaveCard` 的文案 props 数量 | 修正版只列 2 个（`labelUnassigned` / `labelWhole`） | 扩为 **3 个**，增 `labelZone`（`库区 {code}` 模板串） | 计划 Step2 已定义 `stocktake.task.waveZone` 词条，而修正版 `zoneLabel` 的库区分支直出 `${zoneCode} ${zoneName}` → 该词条会成死键；改为由父组件传入同一批「三种范围文案」后，词条被消费且组件脚本仍零 i18n 依赖 |
| 31 | Task 12 Step6 `binLines` 与 `unassignedLines` 的取值 | `binLines` = `visibleLines`（未选格子时），`unassignedLines` = `visibleLines.filter(l => !l.zoneId)` | `binLines` 在 zone 档改为只取**已归位行**（`visibleLines.filter(l => !!l.zoneId)`），off 档仍为全量 | 计划原文在同一屏内让同一行出现两次：zone 档下未归位行既进主清单又进 ④ 未归位桶。实测 `未归位桶` 盘次（19 行）渲染出 **38 行 / 38 个输入框**（19+19）。两处虽共用同一 draft 不会写错数据，但视觉重复且用户会以为是两组数据；zone 档主清单只表示「有库位归属的行」，未归位行归 ④ 区块唯一定义 |
| 32 | Task 12 Step6 模板里的 `saving` | 模板用 `saving`，但 `const { ... } = scope` 未解构它 | 解构补入 `saving` | `vue-tsc` 报 `count.vue(69,40)/(70,39): Property 'saving' does not exist`。计划原样照抄会让吸底两按钮的「保存中…」文案失效、`saving` 期间不置灰（运行期 `_ctx.saving` 为 undefined，静默降级而非报错，故不跑类型检查极易漏掉） |
| 33 | Task 12 Step2 词条清单 | 无 `binSummary` / `emptyBin` | 新增两键（中英成对）：`binSummary`「本格子 {n} 项」/ `emptyBin`「该格子无应盘项」 | 计划 Step6 用 `zoneSummary` 硬凑格子文案（`.replace('{sku}', binLines.length).replace('{empty}','0')`），会渲染成「本库区 SKU 1 项 · 空格 0 个」——把「格子数」塞进「库区 SKU 项数」语义错位；且选中格子后清空文案与「未选库区」清空文案需区分，故按语义补两键 |
| 34 | Task 12 Step6 `goScan()` | 只 `uni.navigateTo`，无 `fail` | 补 `fail: () => uni.showToast(...)` 回调 | Task 12 先于 Task 13 落地，`pages/inventory/stocktake/scan` 此时**尚未注册**；无 `fail` 回调时点击「扫码快盘」在 H5 上静默无反应（既不跳转也无提示），会被误判为按钮失效。补回调后至少给出「操作失败」toast，Task 13 注册页面后自然恢复跳转 |
| 35 | Task 12 Step7 第3条「输入 → 保存录入」 | 期望在生产实测「已保存 N 行」并观察进度增长 | **未在生产触发落库**：改用「新建演示任务 + 两个盘次指派给陈店长」演示可录入态，仅验证输入框可编辑与回显 | 与偏差 #20 同因：生产登录账号在 t2 无 `tenant_member` 行 → 认领被服务端独占锁拒绝；`saveCounts` 亦强制 owner 校验 → 生产无法演示保存正例。`canEdit` 只看盘次状态（`CLAIMED/COUNTING`）不看 owner，故「指派给店长」即可让页面进入可录入态；保存/提交链路已由 Task 7 本地写链路探针（fixture）全 PASS 覆盖 |
| 36 | Task 12 Step7 第2条「点格子后行列表只剩该格子的行」 | 隐含「格子里的行数 = 该格子的应盘行数」 | 成立但需前提：**任务行快照的 binMode 与当前 binMode 一致**。实测建任务后改档/改绑时，会出现「格子角标 1 个 SKU，但该格子行清单 0 行、19 行全落未归位桶」 | 两个数据源不同源：格子宫格来自**实时** `binOccupancy`（`variant_storage_bin` 当前绑定），行清单来自**建任务时**的行快照（`zoneId/binId` 冻结）。Task 13/14 与 Task 16 手册需按「同一 binMode 下建任务」演示，否则两处数字对不上易被当成 Bug |
| 37 | Task 13 Step3 `handleCode` 的 `none` 分支 | 计划把 `kind === 'none'` 也走「登记为盘盈？」弹窗 | 改为**直接提示**「该码未匹配到商品，无法登记盘盈」，不弹窗 | 与 Step4 第 7 条自相矛盾（Step4 明确「输入一个不存在的码 → 提示未匹配」）；且 `kind === 'none'` 时服务端未解析出任何 variant，`addExtra` 无对象可挂，弹窗确认后必然失败——弹窗只会多制造一次无效往返。实测 `ZZZ-NOT-EXIST-13` 走新分支，提示正确 |
| 38 | Task 13 Step3 `handleCode` 的 `line` 分支 | 命中的 `line` 直接 `currentId = hit.lineId` 并提示「已定位 {sku}」 | 先在本盘次行集合里查找该 id，**找不到则如实提示**「该商品不在本盘次清单内（可能属于本任务的其他盘次）」 | 服务端 `resolveCode` 按**整任务**的行解析，而本页只装载**当前盘次**的行。实测用另一盘次的 SKU `LY-NS-199`：页面纹丝不动却提示「已定位 LY-NS-199」——谎报会让用户以为跳转按钮失效。为此新增 i18n 键 `stocktake.scan.otherWave`（中英成对） |
| 39 | Task 13 Step4 第 2/6 条「确认并下一件 → 已保存 N 行 / 确认盘盈后提示已登记」 | 期望在生产实测**写入正例** | **未在生产触发落库**：保存与盘盈登记均被服务端 owner 锁如实拒绝（toast「该盘次已被 陈店长 认领，无法操作」） | 与偏差 #20/#35 同因：生产登录账号在 t2 无 `tenant_member` 行 → 无法认领；沿用「把盘次指派给陈店长」让页面进入可录入态（`canEdit` 只看盘次状态），而 `saveLine`/`addExtra` 的 owner 校验由服务端如实回显——该拒绝 toast 本身即错误路径证据。写入正例已由 Task 7 本地写链路探针（fixture）全 PASS 覆盖 |
| 40 | 建任务入参 `autoSplitByZone`（Task 10 新建弹层开关） | 关闭时「不按库区拆盘次」 | **该入参后端从未消费**：只要行有库位归属，仍会拆出 `zone` 盘次 + `unassigned` 盘次 | `stocktake.service.ts` 的 `createTask` 未引用该字段，`buildExpected` 的分组只由「行是否有库位绑定」决定（有绑定 → `zone:{id}`，无 → `unassigned`）。实测传 `autoSplitByZone: false` 仍得 2 个盘次（`zone` 1 行 + `unassigned` 21 行）。Task 10 该开关当前**无实际效果**，Task 14/16 需据此调整文案或由后端补实现 |
| 41 | Task 14 Step3/Step4 的过账按钮（本页**过账死路**） | 按钮固定 `@tap="onPost(false)"`，仅在返回 `r.diff.recheck` 时才弹二次确认并升级为 `confirm=true` | 重构为：按钮只调 `onPost()`；「未盘的显式同意」= 勾选（勾选本身即门控）；`recheck` 时**先 `sendPost(false)` 试探 → 弹窗 → 点「确认过账」后 `confirm=true` 重发**；并把 `disabled` 直接绑到 `canPost`（含跳过勾选） | 原稿在「**有未盘项 + 已勾选跳过 + 无账面变动**」时**永远过不了账**：服务端 `post()`（`stocktake.service.ts`）的 `uncountedCount>0 && !confirm` 守卫**先于** `recheck && !confirm` 守卫，两者都只认 `confirm=true`；而按钮只发 `false`，被拒后因 `recheck=false` 既不弹窗也不重试，只剩一条 toast。本地 COUNTED 任务（18 项未盘 + 0 账面变动）实测复现。改后 Step4 第 2 条（未盘勾选门控）与第 4 条（账面变动二次确认）由同一段代码同时满足 |
| 42 | 计划未覆盖：**硬刷新/深链进内页后的权限上下文** | 计划假定 `auth.permissions` / `auth.isSuperAdmin` 随会话可用（Task 14 权限门控直接消费） | 在 `src/App.vue` 的 `onLaunch` 内补一次 `auth.loadAccess()`（有令牌才拉、失败静默） | Pinia 在整页跳转/刷新后重建，而 `auth.access` **只**由 `login()` / `channel-select` / `change-password` 三处填充：超管硬刷新进差异页时 `access=null`、`username=''` → 门控误判「无过账权限」，按钮无谓置灰（实测复现，见截图 `t14_diff_skip_checked.png` 首轮红字「无过账权限」）。该缺陷不止影响本页（`task.vue` 的 `isAdmin`、`shipping/profile`、`pickup`、`platform/roles` 等同样门控），故在应用入口统一补拉一次，而非逐页打补丁 |
| 43 | Task 14 Step4「手机视口自测」的执行环境与收尾 | 沿用 Task 11/12/13 的**生产**只读演示（dev server `VITE_API_URL=https://e.joho.cn`） | 改在**本地**全链路验证（本地 vendure `localhost:3000` + 本地 PostgreSQL + 第二个 dev server 5281），生产未做任何写入 | 过账是整条链路上**唯一会真实改库存**的动作，必须验证到「账面真的落为实盘值」；而生产登录账号在 t2 无 `tenant_member` 行（偏差 #20/#35/#39 同因）→ 认领/录入/提交/过账全被 owner 锁拒，差异页根本进不了 `COUNTED`。故本地起 `dev:server` + `dev:worker` 跑通全链路；为可重复执行，制造 `recheck` 用**相对量**（账面 `+5` → 实盘 `+4`）而非绝对值，脚本自带预清理（取消上一轮 `activityCode=T14` 的非终态任务并把行账面复位回建任务快照）。收尾复位 `NF-WATER-500` 账面、删临时角色/受限账号——**注意 `deleteTenantAdministrator` 只解关联不删 `Administrator` 本体**，仅删成员会让邮箱被占、下轮 `createTenantAdministrator` 报 `An administrator with this email address already exists`，故必须另按邮箱调 `deleteAdministrator` 清干净 |
| 44 | Task 15 Step6 第 1 条「『库存』域第一项为『协同盘库』」 | 计划把新入口描述为库存域的**第一项** | 实测该菜单域是**「商品」域**（`menu.domain.product`，商品与库存菜单同域，顺序为 `分类/＋新增商品/商品列表/库存预警/采购入库/移库/**协同盘库**/快捷盘点/…`），新入口是库存段内**紧邻旧入口之前**的那一项；且 `tier` **只改样式不重排**（`tierStyle` 仅返回背景/边框/颜色），视觉上的「主入口」靠 tier 1 实心白字体现 | 计划把「tier 1」误当成排序手段。探针据此改为两条可证伪断言：①`sup.index('协同盘库') < sup.index('快捷盘点')`；②计算样式 tier 1 = `rgb(255,255,255)`（实心渐变白字）、tier 2 = `rgb(255,102,0)`（描边主色）。若日后确实要求「排在域内最前」，需调整 `menuGroups` 数组顺序（属新需求，不在本 Task） |
| 45 | Task 15 Step6 第 2 条「没有 `StocktakeCount` 的账号（如销售）直连 URL → 后端接口返回权限错误」 | 预期销售账号直连页面即被后端拒 | 实测**销售账号（`t0-sales`，含 `ReadCatalog`）直连看板可正常只读打开**（盘库 6 个读接口都只 `@Allow(ReadCatalog)`）；该条的「后端返回权限错误 + toast 出原文、不白屏」改用**另建的「无 `ReadCatalog`」临时角色账号**验证（实测 toast 原文 `You are not currently authorized to perform this action`，DOM 未白屏），销售账号侧改以「直连 `/admin-api` 调 `createStocktakeTask` 被服务端 `FORBIDDEN` 拒」作为纵深证据 | 计划把「读」与「写」的权限点混为一谈：`stocktakeTasks`/`stocktakeDiff` 等查询只要 `ReadCatalog`，只有 10 个 mutation 才要 `StocktakeCount`。**附带确认（属规格 §9 未落项，非本 Task 范围）**：`stocktake/index.vue`、`count.vue`、`scan.vue` 目前**未做按钮级前端置灰**，「录入与提交按钮按 `StocktakeCount` 收口」实际只落在**菜单门控**（本 Task）+ **服务端权限点**（10 个 mutation 全 `@Allow('StocktakeCount')`）+ **owner 锁**三层兜底；如需前端也置灰，应另立任务（Task 16 手册需如实说明该边界） |
| 46 | Task 16 两个脚本（探针 / 截图）的结构与运行方式 | 计划给的是两段**线性脚本正文**（探针写死 `BASE='https://e.joho.cn/guanli/'`、shop-api 走页面内 `fetch('/shop-api')`；截图脚本 Step 7 要求「临时改 BASE 再跑」） | 做三处工程化改造 + 一处分支新增：①**shop-api 断言改直连** HTTP（新增 `http_gql()` + `WA_SMOKE_SHOP_API`）——本地 vite dev server 的 proxy 只映射 `/admin-api`，页面内 `fetch('/shop-api')` 会打到 dev server 自己返回非 JSON，本地跑必然假失败；线上走默认值。②**BASE / 账号 / 渠道 / 仓库全部环境变量化**（`WA_SMOKE_*` / `WA_SHOT_*`），本地与线上共用同一份脚本，避免「临时改正文」。③**选择器按实际 class 同步**：格子是 `.cells .cell`（计划写的 `.bg` 不存在）、关闭新建弹窗点 `.mask` 顶部空白（计划写的 `.btn.ghost` 不存在）、看板空态在「本仓已有历史任务」时改为条件产出「本仓第一屏」；探针另把「释放已提交盘次」的非法路径断言改成「已提交 + 待认领并存」的可观测形态。④截图脚本新增 `WA_SHOT_LIVE=1` **线上只读分支**（`class _LiveDone` 正常出口 + 收尾 `finally` 还原 `ORIGIN_MODE`；线上截图另用 `stocktake_live_*` 命名，**不覆盖本地证据**）；原脚本 `finally` 硬编码 `set_mode(pg2, 'off')` 改为还原 `ORIGIN_MODE`。 | 计划正文是一次性脚本的写法，直接照抄会导致「本地跑不通 shop-api 断言」「跑线上需改正文易留残改」「选择器与实际 DOM 对不上」。环境变量化让同一脚本可复跑三遍（本地探针 / 线上探针 / 线上截图）而零正文改动，也满足「线上只读、可逆」的硬约束 |
| 47 | 规格 §8.2 / Task 12 Step4 核对表「zone 档只到库区」 | Task 12 已交付的 `BinGrid.vue` 模板为 `<view v-if="active" class="cells">`——**zone 档同样渲染库位格子** | 补 `showCells: boolean` prop（默认不渲染），`count.vue` 传 `:show-cells="showBin"`；`v-if="active && showCells"` 出格子，`v-else-if="!active"` 出「无归位」空态 | Task 16 Step 4 逐条核对时发现：zone 档本应「只到库区、不暴露库位码」，实际却把 `A-01-01` 这类库位码渲染出来，与规格 §8.2 及 Task 12 Step4 自测核对表矛盾（Task 12 当时未覆盖 zone 档截图故漏判）。修复后复跑：`zone 档 库区Tab=4 格子=0（zone 档应为 0 格）`、`bin 档 格子=10`。属**前序 Task 遗留缺陷**，单独一条提交 `f5831d8` 便于回溯 |
| 48 | Task 16 Step 5 手册 16.4「前端单测」数量 | 计划写「13 个用例」（承 Task 9 原稿） | 手册按**实测 15 用例 / 6 套件**写 | 与偏差 #22 同源：计划内的用例计数笔误（6 个 `describe` 分节合计 15 个 `it`），断言逐字落地未改。手册是给运维看的验收文档，以实测为准 |
| 49 | Task 16 Step 6 部署命令的工作目录 | `node scripts\deploy.mjs`（隐含 cwd = `d:\zhao\vshop`） | 实际脚本在 **`web-admin/scripts/deploy.mjs`**，cwd 须为 `d:\zhao\vshop\web-admin` | 按计划原话在 `d:\zhao\vshop` 执行报 `Cannot find module 'D:\zhao\vshop\scripts\deploy.mjs'`；Glob 定位到真实路径后成功。计划 Step 6 的 cwd 写法有误（该脚本此前由 Task 8 的部署流程引入，位于 web-admin 内） |
| 50 | Task 16 Step 7 线上「渠道收口」断言 | 计划要求线上复验「换另一渠道再查，两边任务 id 集合无交集」 | **线上如实记为 SKIP**（非 OK、非 FAIL），并在手册 16.6 说明缘由 | 生产登录账号 `guoxinnanshan@163.com` 的 `myTenantAccess.channels` **只含 t2**；加了「退回 admin `channels{items}` 再找一个」的兜底后仍拿不到可比渠道（该账号无更广渠道可见性）。**不虚报 OK**：该断言的证据改由 Task 8 在生产用**显式渠道令牌**（t2 / t1 / `__default_channel__`）验证 —— 8/8 PASS（t2 自见 1 条、t1 与默认渠道各 0 条、跨渠道直查被拒、取消成功）。本地侧该断言本轮**实测通过**（`channel=__default_channel__ totalItems=0 交集=[]`） |
| 51 | Task 16 Step 8 提交粒度与手册目录条目 | 计划给出**单条**提交（`git commit -m "test(stocktake): …"`）；手册目录条目为裸 `<li>16 多人协同盘库 …</li>` | 拆成**两条**：`f5831d8`（zone 档缺陷修复，fix）+ `fd8072e`（探针 + 25 张截图 + 手册第 16 章，test/docs）；手册目录条目按既有惯例补锚点 `<a href="#stocktake-collab">` | ①zone 档缺陷属**功能修复**（改的是已交付页面的渲染行为），与「测试/文档」混在一条会让 `git log` 无法区分「改了啥行为」与「加了啥证据」；拆分后 `git bisect`/回滚精度更高。②手册目录其余 15 章条目**全部带锚点链接**（可点击跳转），裸文本会破坏目录可用性一致性 |
| 52 | 偏差 #40（建任务 `autoSplitByZone` 后端从未消费） | 原稿只把它登记为「已知缺陷 + 待办」（编辑手册 16.8.7 ① 也是这么写的） | **补实现**：`buildExpected` 增可选入参 `autoSplitByZone`（`false` = 不拆，整仓一个 `whole` 盘次，且行**仍保留** `zoneId/binId`；缺省 / `true` = 按库区拆），`stocktake.service.ts` 的 `createTask` 透传 `input.autoSplitByZone !== false`；新增 2 个对照单测；`npm run build` 重出 `lib/` | 用户 2026-09-25 裁决「四项一起做」的第一项。**语义定稿**：该开关只影响**盘次拆分**，不影响**行快照**——行若丢掉库位归属，录入页格子宫格与「未归位桶」就退化，等于用一个开关顺手砍掉两个功能。故 `false` 时仍按绑定给行打 `zoneId/binId`，只是全部塞进同一个 `whole` 盘次 |
| 53 | 偏差 #45（前端未做按钮级置灰，只落菜单门控 + 服务端权限点 + owner 锁三层） | 原稿把它登记为「规格 §9 未落项 + 如需置灰应另立任务」 | **补齐 UI 层**：权限并入 `useStocktakeScope.canEdit`（新增 `canCount = isSuperAdmin \|\| hasPermission('StocktakeCount')`，与「盘次处于 CLAIMED/COUNTING」相与），`count.vue` / `scan.vue` 复用同一处收口即覆盖输入框与保存/提交按钮；`index.vue` 另加 `canCount` 门控浮动新建按钮（置灰 + 拦截 `openForm()`）与提交按钮；三页提示改为「无权限 → 未认领 → 未启用库位」三段分因；中英各补 3 条词条 | 用户 2026-09-25 裁决的第二项。`canEdit` 原本只看盘次状态，把权限直接并进去可让两个录入页**零散改**收口成一处；提示分因是必要配套——否则无权限用户会看到「请先认领」，按提示去认领反而更困惑。补齐后置灰为**四层**（新增 UI 层，原三层仍在） |
| 54 | 本轮（#40 / #45 追补）的类型检查基线 | Task 15 / Task 16 记录基线为 **1453** 处 | 本轮 `npx vue-tsc --noEmit -p tsconfig.json` 实测 **1456** 处（`$t` 类 1372 / 非 `$t` 类 84）。非 `$t` 类抽查全部落在**既有基线文件**（`utils/print/templates/*.ts` 的 TS5097、`utils/print/templates.spec.ts` 与 `utils/stocktake-grid.spec.ts` 的 TS2307/TS5097 等）；本轮改动的 4 个文件（`useStocktakeScope.ts` / `index.vue` / `count.vue` / `scan.vue`）报错**仅 `$t`-in-template 一类**，`useStocktakeScope.ts` 零报错 | 与 Task 9 同类既有工程配置缺陷（缺 `@types/node`、tsconfig 未开 `allowImportingTsExtensions`）同源。差异 3 处未逐条定位归属（属同类基线计数波动），故**只如实记「本轮实测值 + 改动文件零新增」**，不声称与前轮逐条同源 |

---

## 自审记录（写完计划后对规格做的复查）

### 1. 规格覆盖映射（规格章节 → Task）

| 规格章节 / 条目 | 落点 Task |
|---|---|
| §1.1 多人协同（盘次指派/认领/独占） | Task 1（实体）、4（Service 独占锁）、11（详情页） |
| §1.1 不同仓库（一任务一仓 + activityCode 分组） | Task 1、4、10（看板分组） |
| §1.1 按库存区域（按库区拆盘次） | Task 2（清单生成）、4（拆盘次）、12（库区 Tab） |
| §1.1 按货品（分类/指定变体圈范围） | Task 2（`scopeJson` 过滤）、10（新建弹窗） |
| §1.1 内部码 / 条形码 | Task 2（扫码解析优先级）、6（`stocktakeResolveCode`）、13（扫码页） |
| §1.1 已盘点 / 未盘点 | Task 2（`countedQty IS NULL`）、9（`isCounted`/`filterLines`）、12（筛选条） |
| §1.1 分批次盘点（分片推进，汇总后过账） | Task 4（盘次）、5（过账）、14（差异页） |
| §1.2 非目标（周期轮盘/多轮复盘/冻结/审批/库位级账面） | **不实现**；Task 16 手册 16.5「本次不做」显式声明 |
| §2 复用清单（StockDoc STOCKTAKE / applyBinBinding / scanner / barcode / fetchStock / 三档开关 / 权限） | Task 2、5（复用 ST + 归位）、6（权限点）、13（复用 scanner）、12（`useBinMode`） |
| §2 缺口：库位 → SKU 反向查询 | Task 3（`variantBinsByLocation` + `binOccupancy`）、6（SDL 注册）、9（前端 API） |
| §3.1 双轨口径（不引入库位级账面） | Task 2（`bookQty` 仅作行内提示）、5（按变体汇总） |
| §3.3 仓库边界（一任务一仓） | Task 1（`stockLocationId` 单值）、4（建任务校验） |
| §3.4 应盘清单双源合并 + 未归位桶 | Task 2（清单生成）、12（未归位区块） |
| §3.5 汇总后一次性人工过账 | Task 5（`post` 要求所有盘次终态）、14（差异页唯一决策点） |
| §3.6 分工（指派 + 认领 + 释放） | Task 4（三个动作）、6（SDL）、11（三按钮） |
| §3.7 版式 B 为主 + C 入口 | Task 12（B）、13（C） |
| §3.8 仅 admin-api 注册 | Task 6 Step 4（只写 `adminApiExtensions`）、Task 16 探针（shop-api 未泄漏断言） |
| §4 数据模型（三表字段与索引） | Task 1（实体 + `entities.spec.ts`） |
| §5 状态机（任务/盘次/应盘行） | Task 2（`stocktake-math.ts` 状态迁移纯函数 + 单测）、Task 4（`resolveWaveStateAfterCount` / `resolveTaskStateAfterWaves`） |
| §6.1 应盘清单生成（双源合并 + scope 过滤 + `expectedCount`） | Task 2（纯函数）、4（建任务事务） |
| §6.2 差异计算（按变体汇总 / 未盘不计入 / 盘盈账面按 0 / 账面变动 `recheck`） | Task 2（差异汇总纯函数）、5（`diffOf`）、14（页面呈现） |
| §6.2 配套规则（清单内命中更新原行，清单外才建 `isExtra`） | Task 4（`saveStocktakeCounts`）、13（扫码登记盘盈） |
| §6.3 过账七步（校验 → 跳过确认 → 账面变动 `confirm` → 汇总 → 生成 items → `createStockDoc` → 置 `POSTED`） | Task 5 |
| §7 查询 6 项 + 变更 10 项 | Task 6（SDL + Resolver 全量）、9（前端 API 全量） |
| §7.1 两个反向查询的过滤/排序/渠道/分页/边界/测试点 | Task 3（含 `assertZoneBinMatch` + 单测）、6（SDL）、16（探针含空格断言） |
| §8.1 五个页面 | Task 10、11、12、13、14 |
| §8.1 菜单挂库存分组 + 保留快捷盘点 | Task 15 |
| §8.2 三档门控（off/zone/bin 三形态） | Task 12（`showZone`/`showBin` 分支）、16（三档截图） |
| §8.3 扫码识别规则（库位码 → 内部码 → 条形码 → SKU → 清单外） | Task 2（解析优先级纯函数）、6（resolver）、13（页面分流 + 手动输入兜底） |
| §8.4 i18n 双语同步 | Task 10、11、12、13、14、15 每个 Task 的独立 i18n Step（中英成对给出） |
| §9 权限模型（两点 + 角色模板 + 前端门控） | Task 6 Step 1/2（后端）、14（过账按钮）、15（菜单） |
| §10 边界情况（13 条） | Task 2（重复扫/未归位/改名/删变体/账面变动/未盘/盘点外/重复过账/改档）、Task 4（他人已认领）、Task 6（渠道串单） |
| §11 YAGNI（不做的 6 项） | 全篇未实现；Task 16 手册显式列出 |
| §12 生产就绪（渠道隔离/权限/幂等/事务/可回滚/构建产物/schema 快照） | Task 4~6（事务与幂等）、Task 6（权限）、Task 8（部署序）、Task 16（渠道收口必测 + 快照说明） |
| §14 验收标准 12 条 | 逐条对应见下 |

**§14 验收标准逐条落点**：

| 验收条 | 落点 |
|---|---|
| 1 应盘清单固化正确（含未归位桶、专项盘） | Task 2 单测 + Task 4 建任务事务 + Task 7 实测 |
| 2 多仓同活动码合并显示、各仓独立过账 | Task 10（看板按 `activityCode` 分组）+ Task 5（过账按 taskId） |
| 3 盘次可指派/认领，认领后他人不可录入提交 | Task 4（独占锁）+ Task 6 单测 + Task 7 |
| 4 手机端按库区→库位盘完并提交；扫码定位/命中/盘盈 | Task 12 + Task 13 + Task 16 截图 |
| 5 已盘/未盘进度实时正确、未盘可筛出 | Task 2（进度纯函数）+ Task 12（筛选条） |
| 6 差异页显示跨格汇总盈亏 + 盘盈 + 未盘 | Task 5（`diffOf`）+ Task 14 |
| 7 账面变动需二次确认、以过账时账面重算 | Task 5（`recheck` + `confirm`）+ Task 14（弹窗） |
| 8 过账生成 1 张 ST 且物理库存正确；重复过账被拒 | Task 5 + Task 7（本地）+ Task 14（幂等提示） |
| 9 无 `StocktakePost` 看不到按钮且接口拒绝 | Task 6（`@Permission`）+ Task 14/15（前端门控） |
| 10 跨渠道不可见 | Task 6 Step 3（渠道收口）+ Task 8 Step 4（生产必测）+ Task 16（探针断言） |
| 11 三档下页面表现正确 | Task 12（三形态）+ Task 16（三档截图） |
| 12 手机视口截图补齐手册 + API/e2e 回归通过 | Task 16 |

**未覆盖项（有意）**：规格 §13 的 P1/P2 阶段内容（专项盘圈选器精修、差异导出、库位偏差统计、周期轮盘）不在本轮，属规格明示的后置阶段。

### 2. 占位符扫描

对全文做了如下模式的排查：`TBD` / `TODO` / `待补充` / `类似 Task N` / `酌情` / `适当处理` / `略` / `...`（作为省略号出现在代码块内表示「同上」）。

结果：

- **无** `TBD` / `TODO` / `待补充` / `酌情` / `适当处理`。
- 代码块一律给全量可粘贴内容（含 import、含 style）；**没有**「参照 Task N 的代码」式的引用。
- 每个 i18n Step 都给出**中英成对**的完整 JSON 片段，没有「其余语言同理」。
- 每个 Task 都有**明确的验证动作**（精确命令 + 预期输出，或手机视口逐条自测清单）。
- 「实施时按此修」段落**不是占位符**：它们是在写计划过程中发现的、有计划正文级缺陷的具体修正（已给出改法），实施者按修正版写即可，不需要自行设计。

### 3. 类型与命名一致性核对

| 跨 Task 共享符号 | 定义处 | 使用处 | 一致？ |
|---|---|---|---|
| `StocktakeService` 方法名（`createTask` / `claimWave` / `assignWave` / `releaseWave` / `saveCounts` / `submitWave` / `diffOf` / `post` / `cancelTask` / `cancelWave`） | Task 4、5 | Task 6 Resolver | ✅（Resolver 只做参数映射与 `toDiffView` 扁平化） |
| SDL 查询/变更名 | Task 6 | Task 9 `apis/stocktake.ts`、Task 13/14 页面 | ✅ 逐字一致（`stocktakeExpectedLines` / `stocktakeResolveCode` / `voteStocktake` 无此名 → 实为 `postStocktake`） |
| `TASK_FIELDS` / `WAVE_FIELDS` / `LINE_FIELDS` / `DIFF_FIELDS` | Task 9 Step 6 | Task 9 各函数、Task 13/14 | ✅ 片段集中定义，未在别处重复手写字段列表 |
| `StocktakeTask` / `StocktakeWave` / `StocktakeLineRow` / `StocktakeVarianceRow` / `StocktakeDiff` / `StocktakeScanHit` | Task 9 | Task 10~14 | ✅ 页面 import 的类型名与定义一致 |
| `useStocktakeScope()` 返回项（`load` / `save` / `saveLine` / `addExtra` / `canEdit` / `visibleLines` / `unassignedLines` / `draftOf` / `setDraft` / `progress` / `wave`） | Task 12 Step 3 | Task 12 count.vue、Task 13 scan.vue | ✅ 两个页面都从 `scope` 解构同名项；Task 13 **未**新增 composable 字段 |
| `stocktake-grid.ts` 导出（`clampCounted` / `isCounted` / `binLabel` / `sortLines` / `filterLines` / `nextUncountedLine` / `groupBinsByZone` / `waveProgress` / `taskProgress` / `diffSummary` / `parseScopeJson` / `scopeBadges` / `compareBin`） | Task 9 Step 4 | Task 10~14 | ✅ Task 13 用到 `binLabel`/`clampCounted`/`isCounted`/`nextUncountedLine`/`sortLines`，均在 Step 4 已定义 |
| `binLabel(row, showBin)` 签名 | Task 9 Step 4 | Task 13 模板 `binLabel(current, showBin)` | ✅（第二参数为 `showBin` 布尔，不是 composable 的 `showZone`） |
| `fetchBinOccupancy(stockLocationId, zoneId?)` | Task 9 Step 7 | Task 12 count.vue | ✅ |
| 权限点字符串 `StocktakeCount` / `StocktakePost` | Task 6 Step 1/2（后端定义 + 角色模板） | Task 14（`hasPermission('StocktakePost')`）、Task 15（`perm: 'StocktakeCount'`）、Task 16 探针（枚举断言） | ✅ 三处拼写一致，且探针会从 `Permission` 枚举反查 |
| 页面路径 | Task 10~14 的 `pages.json` 增量 | 菜单（Task 15）、跳转（Task 11→14、Task 12→13） | ✅ `pages/inventory/stocktake/{index,task,count,scan,diff}`，`task` 页传 `?id=`、其余传 `?taskId=&waveId=` |
| WaveCard 的 props（`labelUnassigned` / `labelWhole` 由 props 传入，组件不碰 i18n） | Task 11 修正版 | Task 11 详情页 | ✅（Task 11 已给出修正版；组件内**不得**再调 `$t`） |
| 后端实体字段 `tenantChannelId` | Task 1 | Task 2~5 查询 | ✅（与规格 §4.1 的 `channelId` 差异已记入偏差 1） |

**核对中发现并已在正文修掉的 3 处不一致**（留存备查）：

1. Task 5 `post()` 内 `qty: i.diffQtyPlaceholder ?? i.realQty` → 改为 `qty: i.realQty`。
2. Task 4 `saveCounts` 里的死代码 `const pump = ...` → 删除。
3. Task 10 看板页 `<script setup>` 里 `export { scopeBadges, parseScopeJson }` **语法非法** → 改为在 `TaskCard.vue` 的 `.foot` 真正消费 `scopeBadges(parseScopeJson(task.scopeJson)).join(' ')`。

**另发现并已在正文标注的 3 处需实施时替换的写法**（见各 Task 的「实施时按此修」）：

1. Task 11 `WaveCard.vue` 的 `zoneLabel` 计算属性写坏（存在返回空串的无意义分支）→ 已给修正版，并把 `labelUnassigned` / `labelWhole` 改为 props 传入。
2. Task 12 `count.vue`：`groupBinsByZone(occupancy.value, [] as StorageZone[])` 的 `[]` 必须换成 `fetchStorageZones(locId)` 的真实结果；删掉 `void isCounted;` 与未使用的 `StorageBin` import。
3. Task 16 探针的渠道 token 还原写法用了 `window.__otherToken` 绕路 → 改为开头保存 `T2_TOKEN` 局部变量后还原。

---

**计划到此结束。** 全文 16 个 Task，每个 Task 都是「写代码 → 验证 → 提交 → 回填执行结果」的闭环；Task 9 的 mockup 与 Task 16 的截图/手册是硬性前置与收尾，不可跳过。

**执行方式（二选一）**：

1. **Subagent-Driven（推荐）** —— 每个 Task 派一个全新 subagent 实现，Task 之间由主会话评审（对得上「零上下文工程师可照做」的写法），迭代快、上下文干净。
2. **Inline Execution** —— 在当前会话按 Task 顺序直接执行，按批次设检查点（适合需要频繁看中间结果时）。

选定后我按对应流程开始，**不会**在未确认前动手写业务代码。

---

### 执行决策（2026-09-23 用户已定）

- **执行方式：方案 1（Subagent-Driven）** —— 每个 Task 派全新 subagent 实现，Task 之间由主会话评审。
- **推进节奏：连续执行到底**（Task 0 → Task 16 不停），但 **Task 9 的 4 页 mockup 预览仍是硬性停点**：必须等用户挑定版式后才继续 Task 10。
- **启动时机：暂缓** —— 等另一份方案（「方案 2」）完成编写后，两份方案一并执行。**在用户明确示意开始前，本计划不进入实施。**