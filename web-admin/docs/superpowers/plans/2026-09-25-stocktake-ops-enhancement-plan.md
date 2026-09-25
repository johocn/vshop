# 盘库运营增强（分页 / 统计 / 草稿 / 导出 / 打印）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把协同盘库从「能盘完」补到「能运营」：看板分页、按库位/按盘点人的作业量统计、DRAFT 草稿先存后发、前端+后端双轨 CSV 导出、打印视图（受控渲染下像素级一致），并把回归固化成可执行的脚本门禁。

**Architecture:** 后端（`vendure/packages/cjk-plugin`）新增纯函数层（状态过滤解析 / 统计聚合 / CSV 序列化）与 2 个 mutation、2 个 query；草稿采用「发布时才物化」，把 `createTask` 的清单生成拆成可复用的 `materializeTask`。前端（`vshop/web-admin`，uni-app H5）看板改服务端多状态过滤 + 触底追加，详情新增「统计」页签，差异页加导出与打印（打印样式用 mm/pt 绝对单位钉死，由 Playwright 像素基线守护）。

**Tech Stack:** Vendure 3.6.4 + TypeORM + Vitest（后端）；uni-app 3 + Vue 3.5 + Pinia + SCSS（前端 H5）；Playwright(Python) + Pillow + numpy（截图与像素基线）。

**规格出处：** `docs/superpowers/specs/2026-09-25-stocktake-ops-enhancement-design.md`（下称「规格」）。本文所有 `§x` 均指该规格章节。

---

## 文件结构（先锁定职责，再拆任务）

**后端 `d:\zhao\vendure\packages\cjk-plugin`**

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/stocktake/stocktake-math.ts` | 修改 | 纯函数层：+ `parseStateFilter`、`aggregateByBin`、`aggregateByCounter`、`toCsv`、`CSV_MAX_ROWS` |
| `src/stocktake/stocktake-ops.spec.ts` | 新增 | 上述纯函数的单测（vitest） |
| `src/stocktake/stocktake.service.ts` | 修改 | `listTasks` 接 `states`；拆分 `materializeTask`；+ `openTask` / `updateTask` / `statsOf` / `exportOf`；`diffOf` 补库位编码解析 |
| `src/stocktake/stocktake.admin.resolver.ts` | 修改 | + 4 个入口（2 mutation / 2 query） |
| `src/plugin.ts` | 修改 | `adminApiExtensions` SDL：+ 输入字段、+ 2 类型组、+ 4 入口 |
| `lib/**` | 重建 | `npm run build` 产物（git 跟踪，必须与 src 同提交） |

**前端 `d:\zhao\vshop\web-admin`**

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/apis/stocktake.ts` | 修改 | + `states` / `state` / `openStocktakeTask` / `updateStocktakeTask` / `fetchStocktakeStats` / `stocktakeExport` |
| `src/locale/zh-Hans.json`、`src/locale/en.json` | 修改 | `stocktake.board.*` / `stocktake.task.stats.*` / `stocktake.diff.*` 新词条（两份必须同步） |
| `src/pages/inventory/stocktake/index.vue` | 修改 | 分页 + 触底追加 + 已结束页签改 `states` + 草稿页签 + 新建双按钮 |
| `src/pages/inventory/stocktake/task.vue` | 修改 | 统计页签（按库位/按盘点人）+ 草稿态动作条 |
| `src/pages/inventory/stocktake/diff.vue` | 修改 | 工具条（导出/完整导出/打印）+ 打印根节点与打印样式（§7.5） |
| `_e2e/_verify_print_baseline.py` | 新增 | 打印像素基线录制/比对（§10.5） |
| `_e2e/baselines/print/<case>/` | 新增 | 基线图与 `env.json` |
| `scripts/_smoke_stocktake_live.py` | 修改 | 新入口只读冒烟 |
| `package.json` | 修改 | `test:smoke:live` / `test:e2e:stocktake` / `verify:manual` / `verify:print` |

**文档**：`docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（未发布修复手册，新增一章）、`src/static/manual/index.html`（线上用户手册，新增 op-39）。

**约定（全阶段生效）**

- 后端改 `src` 后必须 `npm run build`（`lib/` 是 git 跟踪产物，src+lib 同一提交）。
- **无实体变更（规格 §4）**：不新增表 / 字段 / migration —— `stocktake_task.state` 已含 `DRAFT`，`stocktake_line` 已具备统计与导出所需全部字段；生产 postgres 走 `synchronize: true` 开机同步，**不手写 migration**。Task 3 的 `targetZoneCode` 是 resolver 计算字段，不是数据库列。
- 生产只读：不在生产建任务 / 发布 / 过账，不可验证项如实记 `SKIP`（沿用偏差 #50 先例）。
- 临时脚本用完删除；证据截图存 `docs/webadmin-bugfix-manual/assets/`。
- Git 身份 `johocn` / `johocn@163.com`；提交信息用 `docs|feat|build|test(scope):` 前缀。
- 计划正文不回头改；与规格不一致只写本文末尾「偏差说明区」。

---

# 阶段一 · 后端（cjk-plugin）

命令统一在 `d:\zhao\vendure\packages\cjk-plugin` 下执行（下称「plugin 目录」）。

## Task 1: `parseStateFilter` 纯函数（规格 §7.1）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-ops.spec.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake-math.ts`

- [ ] **Step 1: 写失败测试**

新建 `src/stocktake/stocktake-ops.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { parseStateFilter } from './stocktake-math';

describe('parseStateFilter（规格 §7.1）', () => {
    it('state 单值优先于 states', () => {
        expect(parseStateFilter({ state: 'OPEN', states: ['POSTED'] }))
            .toEqual({ mode: 'one', values: ['OPEN'] });
    });

    it('无 state 时用 states 多值，并过滤空串与空白', () => {
        expect(parseStateFilter({ states: ['POSTED', '', '  ', 'CANCELLED'] }))
            .toEqual({ mode: 'many', values: ['POSTED', 'CANCELLED'] });
    });

    it('都为空 → 不过滤', () => {
        expect(parseStateFilter({})).toEqual({ mode: 'none', values: [] });
        expect(parseStateFilter({ states: [] })).toEqual({ mode: 'none', values: [] });
        expect(parseStateFilter({ state: '', states: [] })).toEqual({ mode: 'none', values: [] });
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（plugin 目录）: `npm test -- stocktake-ops`
Expected: FAIL —— `parseStateFilter is not a function`（或导出不存在）。

- [ ] **Step 3: 实现纯函数**

在 `src/stocktake/stocktake-math.ts` 末尾追加（与既有纯函数同风格：无副作用、无 DB、无 ctx）：

```ts
export type StateFilterMode = 'none' | 'one' | 'many';

export interface StateFilter {
    mode: StateFilterMode;
    values: string[];
}

/**
 * 列表状态过滤解析（规格 §7.1）：state（单值）优先 → states（多值）→ 都为空则不过滤。
 * 优先级必须写单测锁住：前端「已结束」页签只下发 states，历史调用方只下发 state。
 */
export function parseStateFilter(options?: { state?: string | null; states?: string[] | null }): StateFilter {
    const one = options?.state ? String(options.state).trim() : '';
    if (one) return { mode: 'one', values: [one] };
    const many = (options?.states || []).map((s) => String(s || '').trim()).filter(Boolean);
    if (many.length) return { mode: 'many', values: many };
    return { mode: 'none', values: [] };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- stocktake-ops`
Expected: PASS（3 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/stocktake/stocktake-math.ts src/stocktake/stocktake-ops.spec.ts
git commit -m "feat(stocktake): 状态过滤解析纯函数 parseStateFilter"
```

## Task 2: 把 `states` 接进服务端与 SDL（规格 §3.1 / §6.1）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts:1703`（`StocktakeTaskOptionsInput`）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake.service.ts:123-136`（`listTasks`）

- [ ] **Step 1: SDL 增字段**

`src/plugin.ts` 第 1703 行整行替换为（**注意：真实类型名是 `StocktakeTaskOptionsInput`，不是规格 §6.1 写的 `StocktakeTaskListOptions`**）：

```graphql
                input StocktakeTaskOptionsInput { page: Int, pageSize: Int, state: String, states: [String!], activityCode: String, stockLocationId: ID }
```

- [ ] **Step 2: service 用纯函数决策 where**

`src/stocktake/stocktake.service.ts` 的 `listTasks` 里，把

```ts
        if (options?.state) where.state = options.state;
```

替换为：

```ts
        // 规格 §3.1：state 单值优先，其次 states 多值（In），两者皆空则不过滤。
        // 「已结束」页签必须走多值，否则前端本地过滤 + 分页会串页（第 2 页看起来缺人）。
        const stateFilter = parseStateFilter(options);
        if (stateFilter.mode === 'one') where.state = stateFilter.values[0];
        else if (stateFilter.mode === 'many') where.state = In(stateFilter.values);
```

并在同文件的 `./stocktake-math` 导入列表中补 `parseStateFilter,`（该文件已从 `'typeorm'` 导入 `In`，无需新增依赖）。

- [ ] **Step 3: 编译确认无类型错误**

Run（plugin 目录）: `npm run build`
Expected: 成功，`lib/` 重建、无 TS 报错。

- [ ] **Step 4: 提交**

```bash
git add src/plugin.ts src/stocktake/stocktake.service.ts lib
git commit -m "feat(stocktake): 列表支持 states 多状态过滤"
```

## Task 3: 差异行补库位编码（打印/导出的「库位编码 / 库位」列来源）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts:1652-1666`（`StocktakeVarianceRow`）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\stocktake\stocktake.service.ts:487-519`（`diffOf`）

**背景（为什么必须做）：** 现在 `diffOf` 把 `targetBinCode` 硬编码为 `null`（`stocktake.service.ts:509`），且 `StocktakeVarianceRow` 没有库区字段。规格 §7.5 的差异表头两列（库位编码 22mm / 库位 30mm）与 §7.4 的 `variance` CSV 前两列都取自这里，不补就只能永远打印 `—`。

- [ ] **Step 1: SDL 增库区编码字段**

`src/plugin.ts` 的 `type StocktakeVarianceRow` 内，把 `targetBinCode: String` 这一行下方补一行：

```graphql
                    targetZoneCode: String
```

- [ ] **Step 2: `diffOf` 解析编码**

`src/stocktake/stocktake.service.ts` 的 `diffOf` 中，在 `const summary = summarizeVariance(...)` 之后、`return {` 之前插入：

```ts
        // 规格 §7.5/§7.4：差异表与 variance CSV 的「库位编码 / 库位」列需要真实编码。
        // 汇总只带 targetZoneId/targetBinId，这里按 id 反查编码（空集合不发查询）。
        const targetZoneIds = Array.from(new Set(summary.byVariant.map((v) => v.targetZoneId).filter((x): x is number => x !== null)));
        const targetBinIds = Array.from(new Set(summary.byVariant.map((v) => v.targetBinId).filter((x): x is number => x !== null)));
        const zoneCodeById = new Map<number, string>();
        const binCodeById = new Map<number, string>();
        if (targetZoneIds.length) {
            const zs = await this.connection.getRepository(ctx, StorageZone).find({ where: { id: In(targetZoneIds) } as any });
            for (const z of zs) zoneCodeById.set(Number(z.id), z.code);
        }
        if (targetBinIds.length) {
            const bs = await this.connection.getRepository(ctx, StorageBin).find({ where: { id: In(targetBinIds) } as any });
            for (const b of bs) binCodeById.set(Number(b.id), b.code);
        }
```

再把 `rows` 映射里的

```ts
                targetBinCode: null,
```

替换为：

```ts
                targetBinCode: v.targetBinId === null ? null : (binCodeById.get(v.targetBinId) ?? null),
                targetZoneCode: v.targetZoneId === null ? null : (zoneCodeById.get(v.targetZoneId) ?? null),
```

（`StorageBin` / `StorageZone` 在该文件顶部已导入；`In` 已导入。）

- [ ] **Step 3: 编译 + 本地冒烟看真值**

Run: `npm run build`
Expected: 成功。

Run（plugin 仓库根 `d:\zhao\vendure`）: `git stash list` 之外的临时验证放到 Task 9 的冒烟脚本里统一做；本步只需编译通过 + 用 `npm test` 确认既有 32 条单测仍全绿。

Run: `npm test`
Expected: PASS（既有用例不受影响）。

- [ ] **Step 4: 提交**

```bash
git add src/plugin.ts src/stocktake/stocktake.service.ts lib
git commit -m "feat(stocktake): 差异行补真库位/库区编码（打印与导出用）"
```

## Task 4: 作业量统计聚合纯函数（规格 §7.3）

**Files:**
- Modify: `src/stocktake/stocktake-ops.spec.ts`（追加用例）
- Modify: `src/stocktake/stocktake-math.ts`（追加实现）

- [ ] **Step 1: 写失败测试**

在 `src/stocktake/stocktake-ops.spec.ts` 追加（并在文件顶部 import 里加 `aggregateByBin, aggregateByCounter, type StatLine`）：

```ts
const line = (p: Partial<StatLine>): StatLine => ({
    waveId: 1, zoneId: null, zoneCode: null, binId: null, binCode: null,
    isExtra: false, countedQty: null, countedById: null, countedByName: null, countedAt: null, ...p,
});

describe('aggregateByBin（规格 §7.3）', () => {
    it('按 (zoneId, binId) 分组；未归位行单列并置末；已盘要求 countedQty !== null', () => {
        const rows = aggregateByBin([
            line({ zoneId: 7, zoneCode: 'A', binId: 71, binCode: 'A-01', countedQty: 5 }),
            line({ zoneId: 7, zoneCode: 'A', binId: 71, binCode: 'A-01' }),          // 未盘
            line({ zoneId: 7, zoneCode: 'A', binId: 71, binCode: 'A-01', isExtra: true, countedQty: 2 }),
            line({ zoneId: 8, zoneCode: 'B', binId: 81, binCode: 'B-01', countedQty: 1 }),
            line({ countedQty: 3 }),                                                // 未归位
        ]);
        expect(rows.map((r) => [r.zoneCode, r.binCode, r.expectedLines, r.countedLines, r.uncountedLines, r.extraLines]))
            .toEqual([
                ['A', 'A-01', 2, 1, 1, 1],
                ['B', 'B-01', 1, 1, 0, 0],
                [null, null, 0, 1, 0, 0],
            ]);
    });

    it('同变体多行不做合并（只数作业量，不摊差异）', () => {
        const rows = aggregateByBin([
            line({ zoneId: 1, zoneCode: 'A', binId: 11, binCode: 'A-01', countedQty: 1 }),
            line({ zoneId: 1, zoneCode: 'A', binId: 11, binCode: 'A-01', countedQty: 9 }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].expectedLines).toBe(2);
        expect(rows[0].countedLines).toBe(2);
    });
});

describe('aggregateByCounter（规格 §7.3）', () => {
    it('只统计已盘行；按 countedLines 降序；waveCount 去重；lastCountedAt 取最大', () => {
        const rows = aggregateByCounter([
            line({ waveId: 1, countedQty: 1, countedById: 'm1', countedByName: '张三', countedAt: new Date('2026-09-01T10:00:00Z') }),
            line({ waveId: 2, countedQty: 1, countedById: 'm1', countedByName: '张三', countedAt: new Date('2026-09-02T10:00:00Z') }),
            line({ waveId: 2, countedQty: 1, isExtra: true, countedById: 'm1', countedByName: '张三', countedAt: new Date('2026-09-02T11:00:00Z') }),
            line({ waveId: 3, countedQty: 1, countedById: 'm2', countedByName: '李四', countedAt: new Date('2026-09-03T10:00:00Z') }),
            line({ waveId: 3 }),   // 未盘 → 不计入
        ]);
        expect(rows.map((r) => [r.countedByName, r.countedLines, r.extraLines, r.waveCount]))
            .toEqual([['张三', 3, 1, 2], ['李四', 1, 0, 1]]);
        expect(rows[0].lastCountedAt).toEqual(new Date('2026-09-02T11:00:00Z'));
    });

    it('countedById 为空的行归「未知」组（输出 null）', () => {
        const rows = aggregateByCounter([line({ countedQty: 4 })]);
        expect(rows).toEqual([{ countedById: null, countedByName: null, countedLines: 1, extraLines: 0, waveCount: 1, lastCountedAt: null }]);
    });

    it('零行（DRAFT / 空任务）返回空数组而不是抛错（规格 §9）', () => {
        expect(aggregateByBin([])).toEqual([]);
        expect(aggregateByCounter([])).toEqual([]);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- stocktake-ops`
Expected: FAIL —— `aggregateByBin is not a function`。

- [ ] **Step 3: 实现聚合**

在 `src/stocktake/stocktake-math.ts` 末尾追加：

```ts
/** 统计输入行：StocktakeLine 的纯函数投影（不引入实体依赖） */
export interface StatLine {
    waveId: number;
    zoneId: number | null;
    zoneCode: string | null;
    binId: number | null;
    binCode: string | null;
    isExtra: boolean;
    countedQty: number | null;
    countedById: string | null;
    countedByName: string | null;
    countedAt: Date | null;
}

export interface BinStat {
    zoneId: number | null;
    zoneCode: string | null;
    binId: number | null;
    binCode: string | null;
    expectedLines: number;
    countedLines: number;
    uncountedLines: number;
    extraLines: number;
}

export interface CounterStat {
    countedById: string | null;
    countedByName: string | null;
    countedLines: number;
    extraLines: number;
    waveCount: number;
    lastCountedAt: Date | null;
}

/**
 * 按库位聚合（规格 §7.3）：只出作业量，不出任何差异数量/金额
 * （差异是变体口径，摊到库位会重复计数 —— 规格 §3.3）。
 */
export function aggregateByBin(lines: StatLine[]): BinStat[] {
    const groups = new Map<string, BinStat>();
    for (const l of lines) {
        const key = `${l.zoneId ?? ''}|${l.binId ?? ''}`;
        let g = groups.get(key);
        if (!g) {
            g = {
                zoneId: l.zoneId, zoneCode: l.zoneCode, binId: l.binId, binCode: l.binCode,
                expectedLines: 0, countedLines: 0, uncountedLines: 0, extraLines: 0,
            };
            groups.set(key, g);
        }
        if (l.zoneCode && !g.zoneCode) g.zoneCode = l.zoneCode;
        if (l.binCode && !g.binCode) g.binCode = l.binCode;
        if (l.isExtra) {
            g.extraLines += 1;
            if (l.countedQty !== null) g.countedLines += 1;
            continue;
        }
        g.expectedLines += 1;
        if (l.countedQty !== null) g.countedLines += 1;
        else g.uncountedLines += 1;
    }
    const byName = (a: string | null, b: string | null) => String(a ?? '~').localeCompare(String(b ?? '~'));
    return Array.from(groups.values()).sort((a, b) => {
        // 未归位组（zoneId/binId 皆空）置末，其余按 zoneCode → binCode 升序
        const aOrphan = a.zoneId === null && a.binId === null ? 1 : 0;
        const bOrphan = b.zoneId === null && b.binId === null ? 1 : 0;
        if (aOrphan !== bOrphan) return aOrphan - bOrphan;
        return byName(a.zoneCode, b.zoneCode) || byName(a.binCode, b.binCode);
    });
}

/** 按盘点人聚合（规格 §7.3）：只统计「确实被盘过」的行（含盘盈行）。 */
export function aggregateByCounter(lines: StatLine[]): CounterStat[] {
    const groups = new Map<string, CounterStat & { waves: Set<number> }>();
    for (const l of lines) {
        if (l.countedQty === null) continue;
        const key = l.countedById ?? '';
        let g = groups.get(key);
        if (!g) {
            g = {
                countedById: l.countedById, countedByName: l.countedByName,
                countedLines: 0, extraLines: 0, waveCount: 0, lastCountedAt: null, waves: new Set<number>(),
            };
            groups.set(key, g);
        }
        if (l.countedByName && !g.countedByName) g.countedByName = l.countedByName;
        g.countedLines += 1;
        if (l.isExtra) g.extraLines += 1;
        g.waves.add(l.waveId);
        if (l.countedAt && (!g.lastCountedAt || l.countedAt > g.lastCountedAt)) g.lastCountedAt = l.countedAt;
    }
    return Array.from(groups.values())
        .map(({ waves, ...rest }) => ({ ...rest, waveCount: waves.size }))
        .sort((a, b) => b.countedLines - a.countedLines || String(a.countedByName ?? '').localeCompare(String(b.countedByName ?? '')));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- stocktake-ops`
Expected: PASS（8 个用例全绿 = `parseStateFilter` 3 + `aggregateByBin` 2 + `aggregateByCounter` 3，其中「零行返回空数组」为自审补充的 §9 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/stocktake/stocktake-math.ts src/stocktake/stocktake-ops.spec.ts
git commit -m "feat(stocktake): 作业量统计聚合纯函数（按库位 / 按盘点人）"
```

## Task 5: CSV 序列化纯函数（规格 §7.4）

**Files:**
- Modify: `src/stocktake/stocktake-ops.spec.ts`（追加用例）
- Modify: `src/stocktake/stocktake-math.ts`（追加实现）

- [ ] **Step 1: 写失败测试**

追加（顶部 import 加 `CSV_MAX_ROWS, toCsv`）：

```ts
describe('toCsv（规格 §7.4）', () => {
    it('BOM 前置 + CRLF 行尾', () => {
        expect(toCsv([['a', 1], ['b', 2]])).toBe('\uFEFFa,1\r\nb,2\r\n');
    });

    it('逗号 / 引号 / 换行转义：整体引号包裹，内部引号翻倍', () => {
        expect(toCsv([['x,y', 'he said "hi"', 'l1\nl2']])).toBe('\uFEFF"x,y","he said ""hi""","l1\nl2"\r\n');
    });

    it('null/undefined → 空字段；boolean → 是/否；Date → ISO', () => {
        expect(toCsv([[null, undefined, true, false, new Date('2026-09-25T02:00:00.000Z')]]))
            .toBe('\uFEFF,,,,是,否,2026-09-25T02:00:00.000Z\r\n');
    });

    it('行数上限：超出截断且倍数正确', () => {
        const rows = Array.from({ length: CSV_MAX_ROWS + 5 }, (_, i) => [i]);
        const csv = toCsv(rows);
        expect(csv.trimEnd().split('\r\n')).toHaveLength(CSV_MAX_ROWS);
        const capped = toCsv(rows, 3);
        expect(capped.trimEnd().split('\r\n')).toHaveLength(3);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- stocktake-ops`
Expected: FAIL —— `toCsv is not a function`。

- [ ] **Step 3: 实现序列化**

在 `src/stocktake/stocktake-math.ts` 末尾追加：

```ts
export type CsvCell = string | number | boolean | Date | null | undefined;

/** 导出行数上限（规格 §7.4）：超出即截断并置 truncated=true */
export const CSV_MAX_ROWS = 20000;

/**
 * CSV 序列化（规格 §7.4，前后端同一规则）：
 * ① 首字符 BOM（Excel 中文不乱码）② 行尾 CRLF ③ 含 , " \n \r 时整体引号包裹、内部 " 翻倍
 * ④ null/undefined → 空字段；boolean → 是/否；Date → ISO ⑤ 行数上限截断。
 */
export function toCsv(rows: CsvCell[][], maxRows: number = CSV_MAX_ROWS): string {
    const cell = (v: CsvCell): string => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'boolean') return v ? '是' : '否';
        if (v instanceof Date) return v.toISOString();
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '\uFEFF' + rows.slice(0, maxRows).map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- stocktake-ops`
Expected: PASS（11 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/stocktake/stocktake-math.ts src/stocktake/stocktake-ops.spec.ts
git commit -m "feat(stocktake): CSV 序列化纯函数 toCsv"
```

## Task 6: 草稿——拆出 `materializeTask`，新增 `openTask` / `updateTask`（规格 §3.2 / §7.2）

**Files:**
- Modify: `src/stocktake/stocktake.service.ts:192-293`（`createTask`）
- Modify: `src/stocktake/stocktake.service.ts`（新增 `materializeTask` / `openTask` / `updateTask`，放在 `createTask` 之后）

- [ ] **Step 1: 用「建头 / 物化」两段重写 `createTask`**

把 `createTask` 整体替换为下面两段代码（`buildTaskHead` + `materializeTask` + 精简后的 `createTask`）。**`materializeTask` 内部的清单生成算法一行不动**（规格 §7.2：只换调用位置与档位来源）：

```ts
    /** 任务头落库（草稿与直接创建共用；DRAFT 不物化盘次与应盘行） */
    private async buildTaskHead(
        ctx: RequestContext,
        input: any,
        opts: { binModeAtCreate: string; state: 'DRAFT' | 'OPEN'; scopeJson: string },
    ): Promise<StocktakeTask> {
        const tenant = this.tenantOf(ctx);
        const operator = await this.currentOperator(ctx);
        const codeList = await this.connection.getRepository(ctx, StocktakeTask).find({
            where: { tenantChannelId: tenant }, select: ['code'],
        });
        const seq = nextTaskSeq(codeList.map((t) => t.code), new Date());
        return this.connection.getRepository(ctx, StocktakeTask).save(new StocktakeTask({
            code: formatTaskCode(new Date(), seq), tenantChannelId: tenant,
            stockLocationId: Number(input.stockLocationId),
            activityCode: input.activityCode ? String(input.activityCode).trim() : null,
            name: String(input.name).trim(),
            scopeJson: opts.scopeJson,
            binModeAtCreate: opts.binModeAtCreate,
            state: opts.state,
            createdById: operator.id, createdByName: operator.name,
            note: input.note ?? null,
        }));
    }

    /** 默认档位（渠道 customFields.binMode；缺省 off） */
    private async currentBinMode(ctx: RequestContext): Promise<'off' | 'zone' | 'bin'> {
        const channel = await this.connection.getRepository(ctx, Channel).findOne({ where: { id: ctx.channelId as any } });
        return ((channel?.customFields as any)?.binMode || 'off') as 'off' | 'zone' | 'bin';
    }

    /**
     * 物化：解析范围 → 双源合并 → 建盘次与应盘行（规格 §7.2）。
     * 直接创建与「草稿发布」共用；必须在一个事务内调用（txCtx）。
     */
    private async materializeTask(ctx: RequestContext, txCtx: RequestContext, task: StocktakeTask, binMode: 'off' | 'zone' | 'bin'): Promise<void> {
        const tenant = task.tenantChannelId;
        const stockLocationId = Number(task.stockLocationId);
        const raw = JSON.parse(task.scopeJson || '{}');
        const scope: StocktakeScope = {
            zones: (raw.zones || []).map(Number),
            categoryIds: (raw.categoryIds || []).map(Number),
            variantIds: await this.resolveScopeVariants(ctx, {
                zones: [], categoryIds: raw.categoryIds || [], variantIds: raw.variantIds || [], includeZeroBook: false,
            }),
            includeZeroBook: !!raw.includeZeroBook,
        };
        const autoSplitByZone = raw.autoSplitByZone !== false;

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

        const expected = buildExpected({ binMode, bookRows, bindRows, variantMeta, zoneMeta, scope, autoSplitByZone });
        if (!expected.waves.some((w) => w.expectedCount > 0)) {
            throw new UserInputError('该范围下没有可盘的商品（既无账面也无归位记录），请检查圈选条件或仓库');
        }
        for (let i = 0; i < expected.waves.length; i++) {
            const w = expected.waves[i];
            const wave = await this.connection.getRepository(txCtx, StocktakeWave).save(new StocktakeWave({
                tenantChannelId: tenant, taskId: Number(task.id), scopeType: w.scopeType,
                zoneId: w.zoneId, zoneCode: w.zoneCode, zoneName: w.zoneName,
                state: 'OPEN', expectedCount: w.expectedCount, countedCount: 0,
                assigneeId: null, assigneeName: null, claimedAt: null, submittedAt: null,
            }));
            const rows = expected.linesByWave[i].map((l) => new StocktakeLine({
                tenantChannelId: tenant, taskId: Number(task.id), waveId: Number(wave.id),
                variantId: l.variantId, variantSku: l.variantSku, variantName: l.variantName,
                zoneId: l.zoneId, binId: l.binId, zoneCode: l.zoneCode, binCode: l.binCode,
                bookQty: l.bookQty, countedQty: null, isExtra: false,
            }));
            if (rows.length) await this.connection.getRepository(txCtx, StocktakeLine).save(rows);
        }
    }

    async createTask(ctx: RequestContext, input: any): Promise<StocktakeTaskView> {
        const stockLocationId = Number(input.stockLocationId);
        if (!stockLocationId) throw new UserInputError('请选择盘点仓库');
        if (!input.name || !String(input.name).trim()) throw new UserInputError('请填写任务名称');
        const state: 'DRAFT' | 'OPEN' = String(input.state || 'OPEN').toUpperCase() === 'DRAFT' ? 'DRAFT' : 'OPEN';
        if (input.state && !['DRAFT', 'OPEN'].includes(String(input.state).toUpperCase())) {
            throw new UserInputError(`任务状态只能是 DRAFT 或 OPEN（收到 ${input.state}）`);
        }

        return this.connection.withTransaction(ctx, async (txCtx) => {
            if (state === 'DRAFT') {
                // 草稿只写任务头（规格 §3.2）：不解析 categoryIds → variantIds、不物化；
                // 档位留空串（列非空），发布时按当时渠道档位写入。
                const head = await this.buildTaskHead(txCtx, input, {
                    binModeAtCreate: '', state: 'DRAFT', scopeJson: JSON.stringify(input.scope || {}),
                });
                return this.buildTaskView(txCtx, head);
            }
            const binMode = await this.currentBinMode(ctx);
            const scope = input.scope || {};
            const head = await this.buildTaskHead(txCtx, input, {
                binModeAtCreate: binMode, state: 'OPEN', scopeJson: JSON.stringify(scope),
            });
            await this.materializeTask(ctx, txCtx, head, binMode);
            head.state = 'OPEN';
            await this.connection.getRepository(txCtx, StocktakeTask).save(head);
            return this.buildTaskView(txCtx, head);
        });
    }

    /** 草稿发布（规格 §3.2 / §5）：仅 DRAFT 可发；发布时才物化盘次与应盘行 */
    async openTask(ctx: RequestContext, taskId: ID): Promise<StocktakeTaskView> {
        const task = await this.assertTask(ctx, taskId);
        if (task.state !== 'DRAFT') throw new UserInputError(`任务 ${task.code} 已发布（当前状态 ${task.state}），不能重复发布`);
        return this.connection.withTransaction(ctx, async (txCtx) => {
            const binMode = await this.currentBinMode(ctx);
            task.binModeAtCreate = binMode;      // 规格 §3.2：以发布时档位为准
            await this.connection.getRepository(txCtx, StocktakeTask).save(task);
            await this.materializeTask(ctx, txCtx, task, binMode);
            task.state = 'OPEN';
            const saved = await this.connection.getRepository(txCtx, StocktakeTask).save(task);
            return this.buildTaskView(txCtx, saved);
        });
    }

    /** 草稿编辑（规格 §5）：仅 DRAFT 可改；状态不经此路径变更 */
    async updateTask(ctx: RequestContext, taskId: ID, input: any): Promise<StocktakeTaskView> {
        const task = await this.assertTask(ctx, taskId);
        if (task.state !== 'DRAFT') throw new UserInputError(`任务 ${task.code} 已发布，范围不可再改（起草稿后再编辑）`);
        if (input.name !== undefined && input.name !== null) {
            if (!String(input.name).trim()) throw new UserInputError('请填写任务名称');
            task.name = String(input.name).trim();
        }
        if (input.activityCode !== undefined) task.activityCode = input.activityCode ? String(input.activityCode).trim() : null;
        if (input.note !== undefined) task.note = input.note ?? null;
        if (input.stockLocationId !== undefined && input.stockLocationId !== null) {
            const loc = Number(input.stockLocationId);
            if (!loc) throw new UserInputError('盘点仓库不合法');
            task.stockLocationId = loc;
        }
        if (input.scope !== undefined) {
            const scope = { ...(input.scope || {}) };
            if (input.autoSplitByZone !== undefined) (scope as any).autoSplitByZone = input.autoSplitByZone !== false;
            task.scopeJson = JSON.stringify(scope);
        }
        return this.buildTaskView(ctx, await this.connection.getRepository(ctx, StocktakeTask).save(task));
    }
```

**注意**：`autoSplitByZone` 从 `input` 顶层挪进 `scopeJson`（草稿发布时才能还原），因此前端保存草稿时要把该开关写进 `scope`。直接创建的语义不变（`raw.autoSplitByZone !== false` 与旧行为 `input.autoSplitByZone !== false` 等价）。

- [ ] **Step 2: SDL 增 `state` 入参与两个 mutation**

`src/plugin.ts`：

1) `input StocktakeTaskInput`（第 1692-1699 行）内补一行 `state: String`（放在 `note: String` 之后）：

```graphql
                input StocktakeTaskInput {
                    stockLocationId: ID!
                    name: String!
                    activityCode: String
                    scope: StocktakeScopeInput
                    autoSplitByZone: Boolean
                    note: String
                    state: String
                }
```

2) 新增更新入参（放在 `input StocktakeTaskInput` 块之后）：

```graphql
                input StocktakeTaskUpdateInput { name: String, activityCode: String, note: String, stockLocationId: ID, scope: StocktakeScopeInput, autoSplitByZone: Boolean }
```

3) `extend type Mutation` 内、`createStocktakeTask` 之后补两行：

```graphql
                    openStocktakeTask(taskId: ID!): StocktakeTask!
                    updateStocktakeTask(taskId: ID!, input: StocktakeTaskUpdateInput!): StocktakeTask!
```

- [ ] **Step 3: resolver 增两个 mutation**

`src/stocktake/stocktake.admin.resolver.ts`，在 `createStocktakeTask` 之后插入：

```ts
    @Mutation()
    @Allow('StocktakeCount' as Permission)
    async openStocktakeTask(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.openTask(ctx, args.taskId);
    }

    @Mutation()
    @Allow('StocktakeCount' as Permission)
    async updateStocktakeTask(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.updateTask(ctx, args.taskId, args.input);
    }
```

- [ ] **Step 4: 编译 + 既有单测回归**

Run: `npm run build`
Expected: 成功（若报 `head.state` 只读之类错误，检查 `StocktakeTask.state` 声明为可变 `state!: StocktakeTaskState`，实体已符合）。

Run: `npm test`
Expected: PASS（32 + 11 条全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/plugin.ts src/stocktake/stocktake.service.ts src/stocktake/stocktake.admin.resolver.ts lib
git commit -m "feat(stocktake): 草稿 DRAFT 与发布时物化（open/update mutation）"
```

## Task 7: `stocktakeStats` / `stocktakeExport`（规格 §6.3 / §6.4 / §7.3 / §7.4）

**Files:**
- Modify: `src/stocktake/stocktake.service.ts`（新增 `statsOf` / `exportOf`）
- Modify: `src/plugin.ts`（SDL）
- Modify: `src/stocktake/stocktake.admin.resolver.ts`（两个 query）

- [ ] **Step 1: service 实现 `statsOf`**

在 `src/stocktake/stocktake.service.ts` 的「差异与过账」区之前插入：

```ts
    // ------------------------------------------------------------ 统计与导出

    /** 统计输入行投影（纯函数入参，规格 §7.3） */
    private async statLinesOf(ctx: RequestContext, taskId: ID): Promise<StatLine[]> {
        const lines = await this.connection.getRepository(ctx, StocktakeLine).find({ where: { taskId: Number(taskId) } });
        return lines.map((l) => ({
            waveId: Number(l.waveId), zoneId: l.zoneId, zoneCode: l.zoneCode, binId: l.binId, binCode: l.binCode,
            isExtra: l.isExtra, countedQty: l.countedQty, countedById: l.countedById, countedByName: l.countedByName,
            countedAt: l.countedAt,
        }));
    }

    /** 作业量统计（规格 §6.3）：DRAFT / 零行任务返回空结构，不报错 */
    async statsOf(ctx: RequestContext, taskId: ID) {
        await this.assertTask(ctx, taskId, { allowPosted: true });
        const lines = await this.statLinesOf(ctx, taskId);
        return {
            expectedLines: lines.filter((l) => !l.isExtra).length,
            countedLines: lines.filter((l) => l.countedQty !== null).length,
            byBin: aggregateByBin(lines),
            byCounter: aggregateByCounter(lines),
        };
    }
```

- [ ] **Step 2: service 实现 `exportOf`**

紧接 `statsOf` 之后追加（列定义严格照规格 §7.4 表）：

```ts
    /**
     * 全量导出（规格 §6.4 / §7.4）：后端只出 CSV（不引 exceljs/xlsx，守部署铁律）。
     * 四个 kind 与前端「当前视图导出」共用同一份列定义；行数超上限即截断并标记。
     */
    async exportOf(ctx: RequestContext, taskId: ID, kind: string) {
        const task = await this.assertTask(ctx, taskId, { allowPosted: true });
        const lines = await this.statLinesOf(ctx, taskId);
        const ALL = ['variance', 'lines', 'by_bin', 'by_counter'];
        if (!ALL.includes(kind)) throw new UserInputError(`不支持的导出类型 ${kind}（可选：${ALL.join(' / ')}）`);

        let header: string[] = [];
        let body: CsvCell[][] = [];

        if (kind === 'lines') {
            header = ['库位编码', '库位', '变体 SKU', '变体名称', '账面数', '实盘数', '是否盘盈', '盘点人', '盘点时间', '备注'];
            const detail = await this.connection.getRepository(ctx, StocktakeLine).find({ where: { taskId: Number(task.id) }, order: { id: 'ASC' } });
            body = detail.map((l) => [
                l.binCode ?? '', l.zoneCode ?? '', l.variantSku, l.variantName, l.bookQty,
                l.countedQty, l.isExtra, l.countedByName ?? '', l.countedAt, l.note ?? '',
            ]);
        } else if (kind === 'by_bin') {
            header = ['库区', '库位', '应盘', '已盘', '未盘', '盘盈'];
            body = aggregateByBin(lines).map((r) => [r.zoneCode ?? '', r.binCode ?? '', r.expectedLines, r.countedLines, r.uncountedLines, r.extraLines]);
        } else if (kind === 'by_counter') {
            header = ['盘点人', '已盘', '盘盈', '涉及盘次', '最后活动时间'];
            body = aggregateByCounter(lines).map((r) => [r.countedByName ?? '', r.countedLines, r.extraLines, r.waveCount, r.lastCountedAt]);
        } else {
            header = ['库位编码', '库位', '变体 SKU', '变体名称', '盘点数', '快照账面', '过账账面', '差异', '盘盈', '账面变动'];
            const d = await this.diffOf(ctx, task.id);
            body = d.rows.map((r) => [
                r.targetBinCode ?? '', r.targetZoneCode ?? '', r.variantSku, r.variantName, r.countedTotal,
                r.snapBookQty, r.currentBookQty, r.diff, r.isExtra, r.snapBookQty !== r.currentBookQty,
            ]);
        }

        const truncated = body.length > CSV_MAX_ROWS;
        const content = toCsv([header, ...body.slice(0, CSV_MAX_ROWS)]);
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
        return {
            filename: `stocktake-${task.code}-${kind}-${stamp}.csv`,
            mimeType: 'text/csv;charset=utf-8',
            content,
            totalRows: body.length,
            truncated,
        };
    }
```

- [ ] **Step 3: SDL 增类型与入口**

`src/plugin.ts`：

1) 在 `type StocktakePostResult` 之后插入：

```graphql
                type StocktakeBinStat {
                    zoneId: ID
                    zoneCode: String
                    binId: ID
                    binCode: String
                    expectedLines: Int!
                    countedLines: Int!
                    uncountedLines: Int!
                    extraLines: Int!
                }
                type StocktakeCounterStat {
                    countedById: String
                    countedByName: String
                    countedLines: Int!
                    extraLines: Int!
                    waveCount: Int!
                    lastCountedAt: DateTime
                }
                type StocktakeStats {
                    expectedLines: Int!
                    countedLines: Int!
                    byBin: [StocktakeBinStat!]!
                    byCounter: [StocktakeCounterStat!]!
                }
                type StocktakeExportFile { filename: String!, mimeType: String!, content: String!, totalRows: Int!, truncated: Boolean! }
```

2) `extend type Query` 内补两行：

```graphql
                    stocktakeStats(taskId: ID!): StocktakeStats!
                    stocktakeExport(taskId: ID!, kind: String!): StocktakeExportFile!
```

- [ ] **Step 4: resolver 增两个 query**

`src/stocktake/stocktake.admin.resolver.ts`，在 `stocktakeResolveCode` 之后插入：

```ts
    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeStats(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.statsOf(ctx, args.taskId);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    async stocktakeExport(@Ctx() ctx: RequestContext, @Args() args: any) {
        return this.stocktakeService.exportOf(ctx, args.taskId, String(args.kind));
    }
```

- [ ] **Step 5: 补 import、编译、跑测**

`stocktake.service.ts` 顶部 `./stocktake-math` 导入补：`aggregateByBin, aggregateByCounter, toCsv, CSV_MAX_ROWS, type CsvCell, type StatLine`。

Run: `npm run build` → 成功；Run: `npm test` → PASS。

- [ ] **Step 6: 提交**

```bash
git add src/plugin.ts src/stocktake/stocktake.service.ts src/stocktake/stocktake.admin.resolver.ts lib
git commit -m "feat(stocktake): 作业量统计与全量 CSV 导出（stats/export query）"
```

## Task 8: 后端上线（本地构建 → 服务器 pull + restart）

**Files:** 无（部署动作）

- [ ] **Step 1: 本地重建并确认产物入库**

Run（plugin 目录）: `npm run build`，确认 `lib/stocktake/` 内出现新文件（如 `lib/stocktake/stocktake-ops` 不适用，纯函数在 `lib/stocktake/stocktake-math.js`）。

- [ ] **Step 2: 提交并推送**

```bash
git add -A src lib
git commit -m "build(cjk-plugin): 重建 lib 以收录盘库运营增强"
git push
```

- [ ] **Step 3: 服务器拉取重启（服务器不构建）**

Run: `ssh joho "cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure"`
Expected: Fast-forward 列出 `packages/cjk-plugin/src/...` 与 `lib/...`；pm2 状态 `online`。

- [ ] **Step 4: 线上 schema 冒烟（只读）**

在 Task 9 的脚本里执行（下一步），此时先确认 `https://e.joho.cn/admin-api` 返回 200：

Run: `curl -s -o NUL -w "%{http_code}" https://e.joho.cn/admin-api -X POST -H "Content-Type: application/json" -d '{"query":"{__typename}"}'`
Expected: `200`。

## Task 9: 只读冒烟扩展（规格 §10.3）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\scripts\_smoke_stocktake_live.py`

- [ ] **Step 1: 读现有脚本，找到插入点**

Run: 打开 `scripts/_smoke_stocktake_live.py` 确认现有 helper（**勿另起一套**）：
`check(name, ok, detail='')` / `skip`（如已实现）/ `gql(pg, q, var=None, api='admin')` / `data(pg, q, var=None, tag='', api='admin')`（返回 JSON 的 `data`，出错时计 FAIL 并返回 `None`）/ `http_gql(url, q, var, channel_token)` / `login(pg)` / `set_channel(pg, token)` / `goto(pg, path, settle)`。

插入点两处：
1. 第 1 节「SDL 齐备」的两份名单各补新入口（`Query` 补 `stocktakeStats`、`stocktakeExport`；`Mutation` 补 `openStocktakeTask`、`updateStocktakeTask`）。
2. 第 3 节 `stocktakeDiff` 断言之后、第 4 节「shop-api 不含盘库字段」之前，插入新的「盘库运营增强」只读断言块（此时 `pg` 仍是目标渠道、`t2_items` 已就绪）。

- [ ] **Step 2: 追加只读断言**

第 1 节名单改为：

```python
    for f in ['stocktakeTasks', 'stocktakeTask', 'stocktakeWaves', 'stocktakeExpectedLines',
              'stocktakeDiff', 'stocktakeResolveCode', 'variantBinsByLocation', 'binOccupancy',
              'stocktakeStats', 'stocktakeExport']:
        check('Query %s 已注册' % f, f in qnames)
    for f in ['createStocktakeTask', 'addStocktakeWave', 'assignStocktakeWave', 'claimStocktakeWave',
              'releaseStocktakeWave', 'saveStocktakeCounts', 'submitStocktakeWave', 'postStocktake',
              'cancelStocktakeTask', 'cancelStocktakeWave', 'openStocktakeTask', 'updateStocktakeTask']:
        check('Mutation %s 已注册' % f, f in mnames)
```

第 3 节末尾插入（**全部只读**：不建任务、不发布、不导出写盘）：

```python
    # ---- 盘库运营增强（2026-09-25 规格 §10.3）：新入口只读断言 ----
    many = data(pg, 'query($o: StocktakeTaskOptionsInput){ stocktakeTasks(options:$o){ totalItems items { id code state } } }',
                {'o': {'page': 1, 'pageSize': 5, 'states': ['POSTED', 'CANCELLED']}}, 'statesFilter')
    m_items = ((many or {}).get('stocktakeTasks') or {}).get('items') or []
    m_states = {x['state'] for x in m_items}
    check('states 多值过滤可用（只回终态）', bool(many) and m_states.issubset({'POSTED', 'CANCELLED'}),
          'states=%s' % sorted(m_states))

    if t2_items:
        tid = str(t2_items[0]['id'])
        st = data(pg, 'query($id: ID!){ stocktakeStats(taskId:$id){ expectedLines countedLines byBin { binCode expectedLines countedLines } byCounter { countedByName countedLines } } }',
                  {'id': tid}, 'stats')
        check('stocktakeStats 可只读调用', bool(st) and st.get('stocktakeStats') is not None,
              str((st or {}).get('stocktakeStats'))[:160])

        ex = data(pg, 'query($id: ID!, $k: String!){ stocktakeExport(taskId:$id, kind:$k){ filename mimeType totalRows truncated content } }',
                  {'id': tid, 'k': 'by_bin'}, 'export')
        f = ((ex or {}).get('stocktakeExport')) or {}
        check('stocktakeExport 返回 CSV（含 BOM）', (f.get('content') or '').startswith('\ufeff'),
              str(f.get('filename')))
        check('stocktakeExport 未落盘（只取内容，totalRows 有值）', f.get('totalRows') is not None)
    else:
        check('stocktakeStats / stocktakeExport（无任务，跳过）', True, 'SKIP：%s 下暂无盘点任务' % CHANNEL)
```

（`shop-api` 未泄漏由既有第 4 节承担，本任务不动；DRAFT 任务下的「全零不报错」属写操作场景，生产只读不做，由 Task 18 在非生产或 SKIP 中记录。）

- [ ] **Step 3: 跑线上只读冒烟**

Run（`d:\zhao\vshop\web-admin`）: `python scripts/_smoke_stocktake_live.py`
Expected: 全部 PASS；**不建任务、不发布、不导出写盘**。新增入口若在旧后端上跑失败，说明 Task 8 未生效 —— 先回 Task 8 排查，不得改断言绕过。

- [ ] **Step 4: 提交**

```bash
git add scripts/_smoke_stocktake_live.py
git commit -m "test(stocktake): 只读冒烟覆盖 states/stats/export 新入口"
```

---

# 阶段二 · 前端（vshop/web-admin）

命令统一在 `d:\zhao\vshop\web-admin` 下执行。前端只有 `dev:h5` / `build:h5`，本地验收流程：`npm run build:h5` → `node scripts/serve-h5.mjs`（脚本已存在）→ Playwright 打 `http://localhost:<port>`。

## Task 10: API 层扩展

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\stocktake.ts`

- [ ] **Step 1: 类型定义**

在 `StocktakeDiff` 接口之后插入：

```ts
export interface StocktakeBinStat {
  zoneId?: string | null;
  zoneCode?: string | null;
  binId?: string | null;
  binCode?: string | null;
  expectedLines: number;
  countedLines: number;
  uncountedLines: number;
  extraLines: number;
}

export interface StocktakeCounterStat {
  countedById?: string | null;
  countedByName?: string | null;
  countedLines: number;
  extraLines: number;
  waveCount: number;
  lastCountedAt?: string | null;
}

export interface StocktakeStats {
  expectedLines: number;
  countedLines: number;
  byBin: StocktakeBinStat[];
  byCounter: StocktakeCounterStat[];
}

/** 后端全量导出（规格 §6.4）：content 是完整 CSV 文本（含 BOM） */
export interface StocktakeExportFile {
  filename: string;
  mimeType: string;
  content: string;
  totalRows: number;
  truncated: boolean;
}
```

- [ ] **Step 1b: 差异行补 `targetZoneCode`（与后端 Task 3 对齐）**

后端 Task 3 已把 `targetZoneCode` 填进 `StocktakeVarianceRow`，前端不请求就永远拿不到（打印「库位」列与 variance CSV 第 2 列都靠它）。

1) 顶部 `DIFF_FIELDS` 的 `rows {...}` 行内，在 `targetBinCode` 之后插入 `targetZoneCode`，改后整行为：

```
  rows { variantId variantSku variantName countedTotal bookQty diff isExtra binChanged targetZoneId targetBinId targetBinCode targetZoneCode snapBookQty currentBookQty }
```

2) `StocktakeVarianceRow` 接口里，`targetBinCode?: string | null;` 之后插入：

```ts
  targetZoneCode?: string | null;
```

- [ ] **Step 2: `fetchStocktakeTasks` 支持 `states`**

把该函数签名与查询变量改为（只改这两处，`TASK_FIELDS` 不动）：

```ts
export async function fetchStocktakeTasks(options?: {
  page?: number; pageSize?: number; state?: string; states?: string[]; activityCode?: string; stockLocationId?: string;
}): Promise<{ totalItems: number; items: StocktakeTask[] }> {
```

```ts
      `query StocktakeTasks($options: StocktakeTaskOptionsInput) {
        stocktakeTasks(options: $options) { totalItems items { ${TASK_FIELDS} } }
      }`,
      {
        options: {
          page: options?.page ?? 1,
          pageSize: options?.pageSize ?? 20,
          state: options?.state ?? null,
          states: options?.states ?? null,
          activityCode: options?.activityCode ?? null,
          stockLocationId: options?.stockLocationId ?? null,
        },
      },
```

- [ ] **Step 3: `createStocktakeTask` 支持草稿 + 把拆盘开关写进 scope**

签名与 input 改为：

```ts
export async function createStocktakeTask(input: {
  stockLocationId: string; name: string; activityCode?: string | null;
  scope?: { zones?: number[]; categoryIds?: number[]; variantIds?: number[]; includeZeroBook?: boolean; autoSplitByZone?: boolean } | null;
  autoSplitByZone?: boolean | null; note?: string | null;
  /** 规格 §3.2：DRAFT = 只存任务头（发布时才物化） */
  state?: 'DRAFT' | 'OPEN';
}): Promise<StocktakeTask> {
```

```ts
        input: {
          stockLocationId: input.stockLocationId,
          name: input.name,
          activityCode: input.activityCode ?? null,
          // 草稿发布时要按保存时的开关还原，故写进 scope（顶层字段保留仅为 SDL 兼容）
          scope: input.scope
            ? { ...input.scope, autoSplitByZone: input.scope.autoSplitByZone ?? input.autoSplitByZone ?? null }
            : null,
          autoSplitByZone: input.autoSplitByZone ?? null,
          note: input.note ?? null,
          state: input.state ?? null,
        },
```

- [ ] **Step 4: 新增 4 个函数**

追加到「变更」区末尾（`cancelStocktakeWave` 之后）：

```ts
/** 草稿发布（仅 DRAFT）：服务端在同一事务内物化盘次与应盘行 */
export async function openStocktakeTask(taskId: string): Promise<StocktakeTask> {
  try {
    const r = await getAdminClient().request<{ openStocktakeTask: StocktakeTask }>(
      `mutation OpenStocktakeTask($taskId: ID!) { openStocktakeTask(taskId: $taskId) { ${TASK_FIELDS} } }`,
      { taskId },
    );
    return r.openStocktakeTask;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '草稿发布失败'));
  }
}

/** 草稿编辑（仅 DRAFT）：可改名称 / 活动码 / 备注 / 仓库 / 圈范围 */
export async function updateStocktakeTask(taskId: string, input: {
  name?: string; activityCode?: string | null; note?: string | null; stockLocationId?: string;
  scope?: { zones?: number[]; categoryIds?: number[]; variantIds?: number[]; includeZeroBook?: boolean; autoSplitByZone?: boolean } | null;
}): Promise<StocktakeTask> {
  try {
    const r = await getAdminClient().request<{ updateStocktakeTask: StocktakeTask }>(
      `mutation UpdateStocktakeTask($taskId: ID!, $input: StocktakeTaskUpdateInput!) {
        updateStocktakeTask(taskId: $taskId, input: $input) { ${TASK_FIELDS} }
      }`,
      { taskId, input },
    );
    return r.updateStocktakeTask;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '草稿保存失败'));
  }
}

/** 作业量统计（规格 §6.3）：DRAFT / 零行任务返回空结构 */
export async function fetchStocktakeStats(taskId: string): Promise<StocktakeStats> {
  try {
    const r = await getAdminClient().request<{ stocktakeStats: StocktakeStats }>(
      `query StocktakeStats($taskId: ID!) {
        stocktakeStats(taskId: $taskId) {
          expectedLines countedLines
          byBin { zoneId zoneCode binId binCode expectedLines countedLines uncountedLines extraLines }
          byCounter { countedById countedByName countedLines extraLines waveCount lastCountedAt }
        }
      }`,
      { taskId },
    );
    return r.stocktakeStats;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点统计查询失败'));
  }
}

/** 后端全量导出（规格 §6.4）：kind ∈ variance | lines | by_bin | by_counter */
export async function stocktakeExport(taskId: string, kind: string): Promise<StocktakeExportFile> {
  try {
    const r = await getAdminClient().request<{ stocktakeExport: StocktakeExportFile }>(
      `query StocktakeExport($taskId: ID!, $kind: String!) {
        stocktakeExport(taskId: $taskId, kind: $kind) { filename mimeType content totalRows truncated }
      }`,
      { taskId, kind },
    );
    return r.stocktakeExport;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '导出失败'));
  }
}
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`（若仓库 tsconfig 名称不同，用 `npx vue-tsc --noEmit`）
Expected: 仅出现**既有基线报错**；`apis/stocktake.ts` 无新报错（基线报错清单在计划末尾「偏差说明区」记录）。

- [ ] **Step 6: 提交**

```bash
git add src/apis/stocktake.ts
git commit -m "feat(stocktake): API 层补草稿/统计/导出/states"
```

## Task 11: 前端 CSV 序列化与列定义（与后端同一规则）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\utils\stocktake-grid.ts`

- [ ] **Step 1: 追加 `toCsv` 与 variance 列定义**

在 `src/utils/stocktake-grid.ts` 末尾追加：

```ts
export type CsvCell = string | number | boolean | null | undefined;

/** variance 列定义（规格 §7.4，与后端 exportOf 的 variance 列一致） */
export const VARIANCE_CSV_COLUMNS = [
  '库位编码', '库位', '变体 SKU', '变体名称', '盘点数', '快照账面', '过账账面', '差异', '盘盈', '账面变动',
] as const;

/**
 * CSV 序列化（规格 §7.4：前后端同一规则，规则变更必须两端同步）
 * ① 首字符 BOM ② 行尾 CRLF ③ 含 , " \n \r 时整体引号包裹、内部 " 翻倍 ④ null/undefined 空、boolean 是/否
 */
export function toCsv(rows: CsvCell[][]): string {
  const cell = (v: CsvCell): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '是' : '否';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
```

- [ ] **Step 2: 提交**

```bash
git add src/utils/stocktake-grid.ts
git commit -m "feat(stocktake): 前端 CSV 序列化与 variance 列定义"
```

## Task 11B: 前端 i18n 词条补齐（zh-Hans + en 必须同步）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

**为什么单独成任务：** Task 12–15 引用的新词条全部落在这里，一次补齐、两份同步；漏词条不会构建失败（`t()` 原样返回 key），只会在界面上显形，必须在页面任务之前做完。

- [ ] **Step 1: `zh-Hans.json` 三处插入**

1) `stocktake.board` 块内，`"modeOffHint"` 那一行之后（block 收尾前）追加：

```json
      "tabDraft": "草稿",
      "formSaveDraft": "存为草稿",
      "formSaved": "已保存草稿",
      "createDraftDone": "已存为草稿 {code}",
      "saveFailed": "保存失败",
      "editTask": "编辑盘点范围",
      "loadedOf": "已加载 {loaded} / 共 {total} 条",
      "loadingMore": "加载中…",
      "noMore": "没有更多了"
```

2) `stocktake.task` 块内，`"cannotEdit"` 那一行之后（block 收尾前）追加：

```json
      "tabWaves": "盘次",
      "tabStats": "统计",
      "draftHint": "草稿只保存盘点范围；发布时按当前库存与商品集合生成应盘清单",
      "editScope": "编辑范围",
      "publish": "发布任务",
      "publishDone": "已发布 {code}（{waves} 个盘次）",
      "stats": {
        "byBin": "按库位",
        "byCounter": "按盘点人",
        "colBin": "库位",
        "colExpected": "应盘",
        "colCounted": "已盘",
        "colUncounted": "未盘",
        "colExtra": "盘盈",
        "colCounter": "盘点人",
        "colWaves": "盘次",
        "unknown": "未知",
        "orphan": "未归位",
        "empty": "暂无统计数据",
        "loadFailed": "统计加载失败",
        "scopeNote": "统计口径：按盘点行所属库位与录入人聚合，只反映作业量，不改变库存"
      }
```

3) `stocktake.diff` 块内，`"noPermission"` 那一行之后（block 收尾前）追加：

```json
      "exportView": "导出 CSV",
      "exportFull": "完整导出",
      "print": "打印",
      "exportEmpty": "无数据可导出",
      "exportDone": "已导出 {n} 行",
      "exportTruncated": "数据超过上限，已导出前 {n} 行",
      "exportFailed": "导出失败",
      "cancel": "取消",
      "kindVariance": "差异明细（variance）",
      "kindLines": "盘点行（lines）",
      "kindByBin": "按库位（by_bin）",
      "kindByCounter": "按盘点人（by_counter）",
      "printColBinCode": "库位编码",
      "printColZone": "库位",
      "printColSku": "变体 SKU",
      "printColName": "变体名称",
      "printColCounted": "盘点数",
      "printColSnapBook": "快照账面",
      "printColBook": "过账账面",
      "printColDiff": "差异",
      "printColExtra": "盘盈",
      "footerTask": "任务号",
      "footerAt": "打印时间"
```

- [ ] **Step 2: `en.json` 同结构同位置插入**

1) `stocktake.board`：

```json
      "tabDraft": "Draft",
      "formSaveDraft": "Save as draft",
      "formSaved": "Draft saved",
      "createDraftDone": "Saved as draft {code}",
      "saveFailed": "Save failed",
      "editTask": "Edit scope",
      "loadedOf": "Loaded {loaded} / {total}",
      "loadingMore": "Loading…",
      "noMore": "No more items"
```

2) `stocktake.task`：

```json
      "tabWaves": "Waves",
      "tabStats": "Stats",
      "draftHint": "A draft only stores the scope; waves and expected lines are generated on publish using current stock and products",
      "editScope": "Edit scope",
      "publish": "Publish task",
      "publishDone": "Published {code} ({waves} waves)",
      "stats": {
        "byBin": "By bin",
        "byCounter": "By counter",
        "colBin": "Bin",
        "colExpected": "Expected",
        "colCounted": "Counted",
        "colUncounted": "Uncounted",
        "colExtra": "Extra",
        "colCounter": "Counter",
        "colWaves": "Waves",
        "unknown": "Unknown",
        "orphan": "Unassigned",
        "empty": "No stats yet",
        "loadFailed": "Failed to load stats",
        "scopeNote": "Stats aggregate count lines by bin and counter; they reflect workload only and never change stock"
      }
```

3) `stocktake.diff`：

```json
      "exportView": "Export CSV",
      "exportFull": "Full export",
      "print": "Print",
      "exportEmpty": "Nothing to export",
      "exportDone": "Exported {n} rows",
      "exportTruncated": "Row limit exceeded, exported first {n} rows",
      "exportFailed": "Export failed",
      "cancel": "Cancel",
      "kindVariance": "Variance",
      "kindLines": "Count lines",
      "kindByBin": "By bin",
      "kindByCounter": "By counter",
      "printColBinCode": "Bin code",
      "printColZone": "Bin",
      "printColSku": "SKU",
      "printColName": "Variant",
      "printColCounted": "Counted",
      "printColSnapBook": "Book (snapshot)",
      "printColBook": "Book (post)",
      "printColDiff": "Diff",
      "printColExtra": "Extra",
      "footerTask": "Task",
      "footerAt": "Printed at"
```

- [ ] **Step 3: JSON 合法性校验**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locale/zh-Hans.json','utf8'));JSON.parse(require('fs').readFileSync('src/locale/en.json','utf8'));console.log('JSON OK')"`
Expected: `JSON OK`（多一个逗号就抛 SyntaxError）。

- [ ] **Step 4: 词条覆盖自查**

Run: `node -e "const z=require('./src/locale/zh-Hans.json'),e=require('./src/locale/en.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);const a=new Set(f(z)),b=new Set(f(e));console.log('zh-only:',[...a].filter(k=>!b.has(k)),'| en-only:',[...b].filter(k=>!a.has(k)))"`
Expected: 两个数组均为空（zh / en 键集完全一致）。

- [ ] **Step 5: 提交**

```bash
git add src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(stocktake): 补分页/草稿/统计/导出/打印词条（zh+en 同步）"
```

## Task 12: 看板分页 + 草稿页签 + 新建表单抽成组件（规格 §8.1）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\stocktake\TaskFormSheet.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\index.vue`

**为什么抽组件：** 规格 §8.2 要求草稿详情的「编辑范围」复用新建抽屉并预填 —— 把表单抽成 `TaskFormSheet.vue`（`mode: create | edit`），看板与草稿详情共用一份，避免两处表单漂移。

- [ ] **Step 1: 新建 `src/components/stocktake/TaskFormSheet.vue`**

```vue
<template>
  <view v-if="visible" class="mask" @tap="close">
    <view class="sheet" @tap.stop>
      <text class="st">{{ mode === 'edit' ? $t('stocktake.board.editTask') : $t('stocktake.board.newTask') }}</text>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formWarehouse') }}</text>
        <picker mode="selector" :range="locNames" @change="onLocChange">
          <view class="pk">{{ locName || $t('stocktake.board.formSelectWarehouse') }} ▾</view>
        </picker>
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formName') }}</text>
        <input class="ipt" v-model="name" :placeholder="$t('stocktake.board.formNamePlaceholder')" />
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formActivity') }}</text>
        <input class="ipt" v-model="activityCode" :placeholder="$t('stocktake.board.formActivityPlaceholder')" />
      </view>

      <view v-if="showZone" class="field">
        <text class="lb">{{ $t('stocktake.board.formZones') }}</text>
        <view v-if="!zones.length" class="hint">{{ $t('stocktake.board.scopeAll') }}</view>
        <view class="chips">
          <text v-for="z in zones" :key="z.id" class="chip" :class="{ on: pickedZones.includes(Number(z.id)) }"
            @tap="toggleZone(Number(z.id))">{{ z.code }}</text>
        </view>
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formCategories') }}</text>
        <view class="chips">
          <text v-for="c in cats" :key="c.id" class="chip" :class="{ on: pickedCats.includes(Number(c.id)) }"
            @tap="toggleCat(Number(c.id))">{{ c.name }}</text>
        </view>
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formVariants') }}</text>
        <input class="ipt" v-model="variantIds" placeholder="12,34,56" />
      </view>

      <view class="field row" @tap="includeZeroBook = !includeZeroBook">
        <text class="lb rm">{{ $t('stocktake.board.formIncludeZero') }}</text>
        <text class="sw" :class="{ on: includeZeroBook }">{{ includeZeroBook ? '✓' : '' }}</text>
      </view>

      <view v-if="showZone" class="field row" @tap="autoSplitByZone = !autoSplitByZone">
        <text class="lb rm">{{ $t('stocktake.board.formAutoSplit') }}</text>
        <text class="sw" :class="{ on: autoSplitByZone }">{{ autoSplitByZone ? '✓' : '' }}</text>
      </view>
      <view v-else class="hint">{{ $t('stocktake.board.modeOffHint') }}</view>

      <!-- 草稿态：编辑只保存；新建：双动作（存草稿 / 创建并发布） -->
      <view v-if="mode === 'edit'" class="acts">
        <button class="submit" :disabled="busy || !canCount" @tap="onSaveDraft">
          {{ busy ? $t('stocktake.board.formSubmitting') : $t('stocktake.board.formSaveDraft') }}
        </button>
      </view>
      <view v-else class="acts">
        <button class="ghost" :disabled="busy || !canCount" @tap="onCreateDraft">{{ $t('stocktake.board.formSaveDraft') }}</button>
        <button class="submit" :disabled="busy || !canCount" @tap="onCreateOpen">
          {{ busy ? $t('stocktake.board.formSubmitting') : $t('stocktake.board.formSubmit') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { createStocktakeTask, updateStocktakeTask, type StocktakeTask } from '../../apis/stocktake';
import { fetchStockLocations } from '../../apis/inventory';
import { fetchStorageZones, type StorageZone } from '../../apis/storage-bin';
import { fetchCollectionsOptimized, type CollectionItem } from '../../apis/collection';
import { useLocaleStore } from '../../stores/localeStore';
import { useAuthStore } from '../../stores/authStore';
import { useBinMode } from '../../composables/useBinMode';
import { parseScopeJson } from '../../utils/stocktake-grid';

const props = defineProps<{ visible: boolean; mode: 'create' | 'edit'; draft?: StocktakeTask | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', task: StocktakeTask, kind: 'draft' | 'open'): void }>();

const locale = useLocaleStore();
const auth = useAuthStore();
const { showZone } = useBinMode();
const canCount = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakeCount'));

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const locName = ref('');
const zones = ref<StorageZone[]>([]);
const cats = ref<CollectionItem[]>([]);
const pickedZones = ref<number[]>([]);
const pickedCats = ref<number[]>([]);
const name = ref('');
const activityCode = ref('');
const variantIds = ref('');
const includeZeroBook = ref(false);
const autoSplitByZone = ref(true);
const busy = ref(false);

const close = () => emit('close');
const toggleZone = (id: number) => { pickedZones.value = pickedZones.value.includes(id) ? pickedZones.value.filter((x) => x !== id) : [...pickedZones.value, id]; };
const toggleCat = (id: number) => { pickedCats.value = pickedCats.value.includes(id) ? pickedCats.value.filter((x) => x !== id) : [...pickedCats.value, id]; };

function parseVariantIds(raw: string): number[] {
  return String(raw || '').split(/[,，\s]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

async function loadZones(locId: string) {
  if (!showZone.value || !locId) { zones.value = []; return; }
  try { zones.value = await fetchStorageZones(locId); } catch { zones.value = []; }
}

/** 打开时装载仓库/分类；编辑模式按草稿预填（规格 §8.2） */
watch(() => props.visible, async (v) => {
  if (!v) return;
  if (!locations.value.length) {
    locations.value = await fetchStockLocations();
    locNames.value = locations.value.map((l) => l.name);
  }
  if (!cats.value.length) {
    try { cats.value = await fetchCollectionsOptimized(50); } catch { cats.value = []; }
  }
  if (props.mode === 'edit' && props.draft) {
    const d = props.draft;
    const idx = locations.value.findIndex((l) => String(l.id) === String(d.stockLocationId));
    locIdx.value = idx;
    locName.value = idx >= 0 ? locations.value[idx].name : '';
    name.value = d.name;
    activityCode.value = d.activityCode || '';
    const s = parseScopeJson(d.scopeJson) as any;
    includeZeroBook.value = !!s.includeZeroBook;
    autoSplitByZone.value = s.autoSplitByZone !== false;
    pickedZones.value = (s.zones || []).map(Number);
    pickedCats.value = (s.categoryIds || []).map(Number);
    variantIds.value = (s.variantIds || []).join(',');
    await loadZones(String(d.stockLocationId || ''));
  } else if (props.mode === 'create') {
    locIdx.value = -1;
    locName.value = '';
    name.value = '';
    activityCode.value = '';
    variantIds.value = '';
    includeZeroBook.value = false;
    autoSplitByZone.value = true;
    pickedZones.value = [];
    pickedCats.value = [];
    await loadZones(String(locations.value[0]?.id || ''));
  }
});

async function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  const hit = locations.value[locIdx.value];
  locName.value = hit?.name ?? '';
  pickedZones.value = [];
  await loadZones(String(hit?.id || ''));
}

function buildScope() {
  return {
    zones: showZone.value ? pickedZones.value : [],
    categoryIds: pickedCats.value,
    variantIds: parseVariantIds(variantIds.value),
    includeZeroBook: includeZeroBook.value,
    autoSplitByZone: showZone.value ? autoSplitByZone.value : false,
  };
}

/** mode=edit → 保存草稿；mode=create + draft=true → 存草稿 */
async function onSaveDraft() {
  const hit = locations.value[locIdx.value];
  if (!hit) return uni.showToast({ title: locale.t('stocktake.board.formRequireWarehouse'), icon: 'none' });
  if (!name.value.trim()) return uni.showToast({ title: locale.t('stocktake.board.formRequireName'), icon: 'none' });
  busy.value = true;
  try {
    const scope = buildScope();
    if (props.mode === 'edit' && props.draft) {
      const t = await updateStocktakeTask(String(props.draft.id), {
        name: name.value.trim(), activityCode: activityCode.value.trim() || null,
        stockLocationId: String(hit.id), scope,
      });
      uni.showToast({ title: locale.t('stocktake.board.formSaved'), icon: 'none' });
      emit('saved', t, 'draft');
    } else {
      const t = await createStocktakeTask({
        stockLocationId: String(hit.id), name: name.value.trim(),
        activityCode: activityCode.value.trim() || null, scope, autoSplitByZone: scope.autoSplitByZone, state: 'DRAFT',
      });
      uni.showToast({ title: locale.t('stocktake.board.createDraftDone').replace('{code}', t.code), icon: 'none' });
      emit('saved', t, 'draft');
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.saveFailed'), icon: 'none' });
  } finally { busy.value = false; }
}

async function onCreateOpen() {
  const hit = locations.value[locIdx.value];
  if (!hit) return uni.showToast({ title: locale.t('stocktake.board.formRequireWarehouse'), icon: 'none' });
  if (!name.value.trim()) return uni.showToast({ title: locale.t('stocktake.board.formRequireName'), icon: 'none' });
  busy.value = true;
  try {
    const scope = buildScope();
    const t = await createStocktakeTask({
      stockLocationId: String(hit.id), name: name.value.trim(),
      activityCode: activityCode.value.trim() || null, scope, autoSplitByZone: scope.autoSplitByZone, state: 'OPEN',
    });
    uni.showToast({
      title: locale.t('stocktake.board.createDone').replace('{code}', t.code).replace('{waves}', String(t.waveCount)),
      icon: 'none',
    });
    emit('saved', t, 'open');
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.createFailed'), icon: 'none' });
  } finally { busy.value = false; }
}
</script>

<style lang="scss" scoped>
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
  .acts { display: flex; gap: 20rpx; margin-top: 12rpx;
    .ghost { flex: 1; background: $wa-bg; color: $wa-ink; font-size: 28rpx; border-radius: $wa-radius; }
    .submit { flex: 2; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
  }
}
</style>
```

- [ ] **Step 2: `index.vue` 换成组件 + 分页**

1) 模板：把第 33–102 行整段 `<!-- ⑤ 新建任务表单 -->` 的 `<view v-if="formVisible" ...>…</view>` 替换为：

```vue
    <!-- ⑤ 新建任务：双动作（存草稿 / 创建并发布），表单已抽成组件 -->
    <TaskFormSheet :visible="formVisible" mode="create" @close="formVisible = false" @saved="onFormSaved" />
```

并在列表分组之后、`loading/empty` 之前插入分页脚注：

```vue
    <view v-if="tasks.length" class="footnote">{{ $t('stocktake.board.loadedOf').replace('{loaded}', String(tasks.length)).replace('{total}', String(totalItems)) }}</view>
    <view v-if="loadingMore" class="more">{{ $t('stocktake.board.loadingMore') }}</view>
    <view v-else-if="tasks.length && tasks.length >= totalItems" class="more">{{ $t('stocktake.board.noMore') }}</view>
```

2) 脚本：`import` 顶部补 `onReachBottom`（与 `onPullDownRefresh, onShow` 同一行导入）与组件：

```ts
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import TaskFormSheet from '../../../components/stocktake/TaskFormSheet.vue';
```

删除 `createStocktakeTask` 导入（表单组件内已用），保留 `fetchStocktakeTasks, type StocktakeTask`。

3) 页签定义（`tabs`）替换为 5 个（新增草稿）：

```ts
const tabs = [
  { key: 'all', label: 'stocktake.board.tabAll' },
  { key: 'DRAFT', label: 'stocktake.board.tabDraft' },
  { key: 'COUNTING', label: 'stocktake.board.tabCounting' },
  { key: 'COUNTED', label: 'stocktake.board.tabToPost' },
  { key: 'closed', label: 'stocktake.board.tabClosed' },
] as const;
```

4) 新增分页状态与 `reload` 重写（替换原 `reload()` 与 `switchTab`）：

```ts
const page = ref(1);
const totalItems = ref(0);
const loadingMore = ref(false);

/** 页签 → 服务端状态过滤（规格 §3.1：「已结束」必须下发多值，否则分页串页） */
function serverStateFilter(): { state?: string; states?: string[] } {
  if (tab.value === 'closed') return { states: ['POSTED', 'CANCELLED'] };
  if (tab.value === 'all') return {};
  return { state: tab.value };
}

async function reload() {
  loading.value = true;
  page.value = 1;
  try {
    const r = await fetchStocktakeTasks({
      page: 1, pageSize: 50, ...serverStateFilter(), stockLocationId: locId.value || undefined,
    });
    tasks.value = r.items;
    totalItems.value = r.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 触底追加下一页（规格 §8.1）：不重置已有列表；加载中上锁防重复请求 */
async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (tasks.value.length >= totalItems.value) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const r = await fetchStocktakeTasks({
      page: next, pageSize: 50, ...serverStateFilter(), stockLocationId: locId.value || undefined,
    });
    const seen = new Set(tasks.value.map((t) => String(t.id)));
    tasks.value = [...tasks.value, ...r.items.filter((t) => !seen.has(String(t.id)))];
    totalItems.value = r.totalItems;
    page.value = next;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.loadFailed'), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function switchTab(k: string) {
  tab.value = k;
  reload();
}

/** 表单组件回调：草稿或已发布都只需刷新列表 */
async function onFormSaved() {
  formVisible.value = false;
  await reload();
}

onReachBottom(() => { void loadMore(); });
```

5) 删除文件中已不再使用的表单状态与函数（`submitting / formLocIdx / formLocName / formZones / formCats / pickedZones / pickedCats / form / openForm / onFormLocChange / toggleZone / toggleCat / parseVariantIds / onCreate`），并把 `openForm` 的调用点改为：

```ts
async function openForm() {
  if (!canCount.value) return;   // 无能盘权限：浮动按钮已置灰，双保险不打开表单
  formVisible.value = true;
}
```

（保留 `locations / locNames / locIdx / locId / curLocName` 与仓库筛选逻辑；`fetchStorageZones / fetchCollectionsOptimized` 的导入若不再被 `index.vue` 使用则一并删除，避免 `noUnusedLocals` 报错。）

- [ ] **Step 3: 构建验证**

Run: `npm run build:h5`
Expected: 构建成功；若报未使用导入或未定义引用，按报错清理（`index.vue` 不该再引用被抽走的表单变量）。

- [ ] **Step 4: 本地手机视口走查**

Run: `node scripts/serve-h5.mjs`（记下端口），再用 `python scripts/_probe_stocktake_local.py` 同款登录方式打开看板。
Expected: 5 个页签可见；切换「已结束」不再混入在盘任务；列表底部出现「已加载 x / 共 y 条」；下拉刷新回到第 1 页。

- [ ] **Step 5: 提交**

```bash
git add src/components/stocktake/TaskFormSheet.vue src/pages/inventory/stocktake/index.vue
git commit -m "feat(stocktake): 看板分页与草稿页签，新建表单抽成 TaskFormSheet"
```

## Task 13: 任务详情——统计页签 + 草稿态动作条（规格 §8.2）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\task.vue`

- [ ] **Step 1: 模板加页签与草稿分支**

在任务信息卡之后、`<!-- ② 盘次列表 -->` 之前插入页签条：

```vue
    <!-- ② 页签：盘次 / 统计（草稿无盘次，不显示页签） -->
    <view v-if="task && task.state !== 'DRAFT'" class="tabs">
      <view class="tb" :class="{ on: view === 'waves' }" @tap="view = 'waves'">{{ $t('stocktake.task.tabWaves') }}</view>
      <view class="tb" :class="{ on: view === 'stats' }" @tap="openStats">{{ $t('stocktake.task.tabStats') }}</view>
    </view>
```

把「② 盘次列表」整块包进条件：

```vue
    <!-- ③ 盘次列表：认领 / 进入录入 / 释放 / 指派 / 取消 -->
    <template v-if="view === 'waves'">
      <text class="sec">{{ $t('stocktake.task.waves') }}</text>
      <WaveCard
        v-for="w in waves"
        :key="w.id"
        :wave="w"
        :is-owner="isMine(w)"
        :is-admin="isAdmin"
        :label-zone="$t('stocktake.task.waveZone')"
        :label-unassigned="$t('stocktake.task.waveUnassigned')"
        :label-whole="$t('stocktake.task.waveWhole')"
        @claim="onClaim(w)"
        @assign="onAssign(w)"
        @release="onRelease(w)"
        @enter="onEnter(w)"
        @cancel="onCancelWave(w)"
      />
      <view v-if="task && !waves.length" class="empty">{{ $t('stocktake.board.empty') }}</view>
    </template>

    <!-- ④ 统计：按库位 / 按盘点人（只做作业量，规格 §3.3） -->
    <view v-if="view === 'stats'" class="stats">
      <view class="seg">
        <view class="sg" :class="{ on: statsSeg === 'bin' }" @tap="statsSeg = 'bin'">{{ $t('stocktake.task.stats.byBin') }}</view>
        <view class="sg" :class="{ on: statsSeg === 'counter' }" @tap="statsSeg = 'counter'">{{ $t('stocktake.task.stats.byCounter') }}</view>
      </view>
      <view v-if="statsLoading" class="empty">{{ $t('stocktake.board.loading') }}</view>
      <template v-else-if="stats">
        <view v-if="statsSeg === 'bin'" class="tbl">
          <view class="tr th">
            <text class="c1">{{ $t('stocktake.task.stats.colBin') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colExpected') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colCounted') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colUncounted') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colExtra') }}</text>
          </view>
          <view v-for="r in stats.byBin" :key="String(r.zoneId) + '-' + String(r.binId)" class="tr">
            <text class="c1">{{ binLabel(r) }}</text>
            <text class="c2">{{ r.expectedLines }}</text>
            <text class="c2">{{ r.countedLines }}</text>
            <text class="c2" :class="{ warn: r.uncountedLines > 0 }">{{ r.uncountedLines }}</text>
            <text class="c2">{{ r.extraLines }}</text>
          </view>
          <view v-if="!stats.byBin.length" class="empty">{{ $t('stocktake.task.stats.empty') }}</view>
        </view>
        <view v-else class="tbl">
          <view class="tr th">
            <text class="c1">{{ $t('stocktake.task.stats.colCounter') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colCounted') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colExtra') }}</text>
            <text class="c2">{{ $t('stocktake.task.stats.colWaves') }}</text>
          </view>
          <view v-for="r in stats.byCounter" :key="String(r.countedById)" class="tr">
            <text class="c1">{{ r.countedByName || $t('stocktake.task.stats.unknown') }}</text>
            <text class="c2">{{ r.countedLines }}</text>
            <text class="c2">{{ r.extraLines }}</text>
            <text class="c2">{{ r.waveCount }}</text>
          </view>
          <view v-if="!stats.byCounter.length" class="empty">{{ $t('stocktake.task.stats.empty') }}</view>
        </view>
        <text class="note">{{ $t('stocktake.task.stats.scopeNote') }}</text>
      </template>
    </view>
```

吸底动作条改为按状态分支（草稿态：编辑范围 / 发布任务）：

```vue
    <!-- ⑤ 吸底：草稿态为「编辑范围 / 发布任务 / 取消任务」；其余为「取消任务 / 查看差异并过账」 -->
    <view class="savebar">
      <template v-if="task && task.state === 'DRAFT'">
        <button class="ghost" :disabled="working" @tap="editVisible = true">{{ $t('stocktake.task.editScope') }}</button>
        <button class="main" :disabled="working" @tap="onOpenTask">{{ $t('stocktake.task.publish') }}</button>
      </template>
      <template v-else>
        <button class="ghost" :disabled="working" @tap="onCancelTask">{{ $t('stocktake.task.cancelTask') }}</button>
        <button class="main" :disabled="!readyToPost" @tap="goDiff">{{ $t('stocktake.task.toDiff') }}</button>
      </template>
    </view>
    <view v-if="task && task.state === 'DRAFT'" class="tip">{{ $t('stocktake.task.draftHint') }}</view>
    <view v-else-if="task && openWaveCount > 0" class="tip">
      {{ $t('stocktake.task.notReady').replace('{n}', String(openWaveCount)) }}
    </view>

    <TaskFormSheet :visible="editVisible" mode="edit" :draft="task" @close="editVisible = false" @saved="onDraftSaved" />
```

- [ ] **Step 2: 脚本**

import 与状态：

```ts
import TaskFormSheet from '../../../components/stocktake/TaskFormSheet.vue';
import { fetchStocktakeStats, openStocktakeTask, type StocktakeStats } from '../../../apis/stocktake';
```

```ts
/** 视图：盘次 / 统计（统计按需加载，避免进详情就多发一次请求） */
const view = ref<'waves' | 'stats'>('waves');
const statsSeg = ref<'bin' | 'counter'>('bin');
const stats = ref<StocktakeStats | null>(null);
const statsLoading = ref(false);
const editVisible = ref(false);
```

新增函数：

```ts
async function openStats() {
  view.value = 'stats';
  if (stats.value || statsLoading.value) return;
  statsLoading.value = true;
  try {
    stats.value = await fetchStocktakeStats(taskId.value);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.stats.loadFailed'), icon: 'none' });
  } finally {
    statsLoading.value = false;
  }
}

/** 库位标签：库区-库位；未归位组显示「未归位」 */
function binLabel(r: { zoneCode?: string | null; binCode?: string | null }): string {
  const z = r.zoneCode || '';
  const b = r.binCode || '';
  if (!z && !b) return locale.t('stocktake.task.stats.orphan');
  return [z, b].filter(Boolean).join('-');
}

async function onOpenTask() {
  if (working.value) return;
  working.value = true;
  try {
    const t = await openStocktakeTask(taskId.value);
    uni.showToast({ title: locale.t('stocktake.task.publishDone').replace('{waves}', String(t.waveCount)), icon: 'none' });
    await reload();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.opFailed'), icon: 'none' });
  } finally {
    working.value = false;
  }
}

async function onDraftSaved() {
  editVisible.value = false;
  await reload();
}
```

`reload()` 补一行：状态变化后统计要重取（草稿发布后旧空结构会误导），在 `reload` 内 `waves.value = ...` 之后加：

```ts
    stats.value = null;
```

- [ ] **Step 3: 样式**

`.tabs` 与 `.stats .seg` 用与看板一致的浅色分段样式，追加到 `<style lang="scss" scoped>` 内：

```scss
.tabs { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin: 20rpx 0 4rpx;
  .tb { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius; font-size: 26rpx; color: $wa-ink;
    &.on { background: $wa-accent; color: #fff; }
  }
}
.stats { margin-top: 12rpx;
  .seg { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 12rpx;
    .sg { flex: 1; text-align: center; padding: 14rpx 0; border-radius: $wa-radius; font-size: 25rpx; color: $wa-ink;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .tbl { background: $wa-card; border-radius: $wa-radius; padding: 12rpx 24rpx;
    .tr { display: flex; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid $wa-rule;
      &.th .c1, &.th .c2 { color: $wa-muted; font-size: 22rpx; }
      .c1 { flex: 1; font-size: 24rpx; color: $wa-ink; }
      .c2 { width: 96rpx; text-align: right; font-size: 24rpx; color: $wa-ink;
        &.warn { color: $wa-danger; }
      }
    }
  }
  .note { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 14rpx; padding: 0 8rpx; }
}
```

- [ ] **Step 4: 构建 + 本地走查**

Run: `npm run build:h5`
Expected: 成功。

走查（本地）：新建一个草稿任务 → 详情显示「编辑范围 / 发布任务」+ 草稿提示 → 点「发布任务」→ 出现盘次与页签、提示消失；打开「统计」→ 两张表可切换。

- [ ] **Step 5: 提交**

```bash
git add src/pages/inventory/stocktake/task.vue
git commit -m "feat(stocktake): 详情统计页签与草稿态动作条"
```

## Task 14: 差异页工具条与双轨导出（规格 §8.3 / §7.4）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\diff.vue`

- [ ] **Step 1: 工具条模板**

在 `.page` 内、四宫格之前插入（三个按钮：当前视图 CSV / 完整导出 / 打印）：

```vue
    <!-- ① 工具条：导出与打印（非 H5 平台隐藏，见 §8.4） -->
    <view class="tools">
      <text class="tbtn" @tap="exportCurrentView">{{ $t('stocktake.diff.exportView') }}</text>
      <text class="tbtn" @tap="exportFull">{{ $t('stocktake.diff.exportFull') }}</text>
      <text class="tbtn" @tap="onPrint">{{ $t('stocktake.diff.print') }}</text>
    </view>
```

底部再插入一个「完整导出类型」选择用的动作面板（导出四类数据时选 kind）：

```vue
    <view v-if="kindVisible" class="kinds">
      <view class="krow" v-for="k in kinds" :key="k.kind" @tap="pickKind(k.kind)">{{ $t(k.label) }}</view>
      <view class="krow cancel" @tap="kindVisible = false">{{ $t('stocktake.diff.cancel') }}</view>
    </view>
```

- [ ] **Step 2: 脚本**

`diff.vue` 顶部现状（第 88 / 90 行）是一条 vue 导入 + 一条 apis 导入；本任务把 apis 那条**整行替换**为（**同一模块只能有一条 import，勿另起一行，否则 `Duplicate identifier`**）：

```ts
import { fetchStocktakeDiff, fetchStocktakeTask, postStocktake, stocktakeExport, type StocktakeDiff, type StocktakeExportFile, type StocktakeTask } from '../../../apis/stocktake';
import { toCsv, VARIANCE_CSV_COLUMNS } from '../../../utils/stocktake-grid';
```

（`type StocktakeTask` 本任务就要用——`printTask` 的类型；Task 15 不再重复导入。`computed / ref` 已存在，`vue` 那条本任务不动。`utils/stocktake-grid` 此前未被 `diff.vue` 导入，这条是新增行。）

新增状态与函数：

```ts
const kindVisible = ref(false);
const kinds = [
  { kind: 'variance', label: 'stocktake.diff.kindVariance' },
  { kind: 'lines', label: 'stocktake.diff.kindLines' },
  { kind: 'by_bin', label: 'stocktake.diff.kindByBin' },
  { kind: 'by_counter', label: 'stocktake.diff.kindByCounter' },
] as const;

/** 浏览器落盘（H5）：Blob + a[download]；文件名沿用后端命名规则 */
function saveText(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stampName(kind: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `stocktake-${taskCode.value || 'task'}-${kind}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}.csv`;
}

/** 当前视图导出（规格 §3.4）：内存数据即时落盘，不等待网络 */
function exportCurrentView() {
  const rows = diff.value?.rows || [];
  if (!rows.length) {
    uni.showToast({ title: locale.t('stocktake.diff.exportEmpty'), icon: 'none' });
    return;
  }
  const body = rows.map((r) => [
    r.targetBinCode || '', r.targetZoneCode || '', r.variantSku, r.variantName, r.countedTotal,
    r.snapBookQty, r.currentBookQty, r.diff, r.isExtra, r.snapBookQty !== r.currentBookQty,
  ]);
  saveText(stampName('variance'), 'text/csv;charset=utf-8', toCsv([[...VARIANCE_CSV_COLUMNS], ...body]));
  uni.showToast({ title: locale.t('stocktake.diff.exportDone').replace('{n}', String(body.length)), icon: 'none' });
}

function exportFull() { kindVisible.value = true; }

async function pickKind(kind: string) {
  kindVisible.value = false;
  try {
    const f: StocktakeExportFile = await stocktakeExport(taskId.value, kind);
    saveText(f.filename, f.mimeType, f.content);
    uni.showToast({
      title: f.truncated
        ? locale.t('stocktake.diff.exportTruncated').replace('{n}', String(f.totalRows))
        : locale.t('stocktake.diff.exportDone').replace('{n}', String(f.totalRows)),
      icon: 'none', duration: f.truncated ? 3500 : 2000,
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.diff.exportFailed'), icon: 'none' });
  }
}

function onPrint() {
  // 打印根节点常驻 DOM（打印样式内 display 切换），此处只需触发系统打印
  window.print();
}
```

并补两个 ref（`taskCode` 供导出文件名，`printTask` 供 Task 15 的打印任务头；两处 `loadDiff` 回填一次到位，Task 15 不再重复声明）：

```ts
const taskCode = ref('');
/** 打印区任务头数据（Task 15 消费） */
const printTask = ref<StocktakeTask | null>(null);
```

在 `loadDiff()` 里回填：

```ts
async function loadDiff() {
  diff.value = await fetchStocktakeDiff(taskId.value);
  const t = await fetchStocktakeTask(taskId.value);
  taskState.value = t?.state || '';
  taskCode.value = t?.code || '';
  printTask.value = t;
}
```

- [ ] **Step 3: 工具条样式**

```scss
.tools { display: flex; gap: 16rpx; margin-bottom: 16rpx;
  .tbtn { flex: 1; text-align: center; font-size: 25rpx; color: $wa-ink; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 0; }
}
.kinds { position: fixed; left: 24rpx; right: 24rpx; bottom: calc(160rpx + env(safe-area-inset-bottom));
  background: $wa-card; border-radius: $wa-radius; overflow: hidden; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15);
  .krow { padding: 26rpx 32rpx; font-size: 27rpx; color: $wa-ink; border-bottom: 1rpx solid $wa-rule;
    &.cancel { text-align: center; color: $wa-muted; border-bottom: 0; }
  }
}
```

- [ ] **Step 4: 构建 + 本地导出走查**

Run: `npm run build:h5` → 成功。

走查（本地）：打开差异页 → 点「导出 CSV」应立即下载 `stocktake-xxx-variance-*.csv`；点「完整导出」选 `by_bin` 下载并核对中文列名不乱码（用 Excel/Numbers 打开）；空差异任务点导出应提示「无数据可导出」而非下空文件。

- [ ] **Step 5: 提交**

```bash
git add src/pages/inventory/stocktake/diff.vue
git commit -m "feat(stocktake): 差异页双轨导出（当前视图 / 后端全量）"
```

## Task 15: 差异页打印视图与打印样式（规格 §3.5 / §7.5 / §8.3）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\stocktake\diff.vue`

**本节是打印样式的唯一出处（规格 §7.5）**：所有几何用 `mm` / `pt` 钉死，禁用自适应列宽、禁用主题变量、禁用 `px/rem/em/%`（表格总宽除外），缩放固定 100%。

- [ ] **Step 1: 模板——屏幕内容包一层 `.st-screen`，并新增打印区**

1) 在模板根 `<view class="page">` 之后插入 `<view class="st-screen">`，并把原有的 ①–⑤ 五块（`<!-- ① 摘要四宫格 -->` 到吸底 `.postbar` 结束）整段包进去，然后在 `.postbar` 之后闭合 `</view>`。改后骨架为：

```vue
  <view class="page">
    <view class="st-screen">
      ...① 摘要四宫格 / ② 账面变动 / ③ 未盘清单 / ④ 差异表 / ⑤ 吸底过账条（原样不动）...
    </view>
    <!-- ⑥ 打印区（下方插入） -->
  </view>
```

2) 在上一步的 `</view>`（`.st-screen` 闭合）之后、`</view>`（`.page` 闭合）之前插入打印区。**必须用原生 `<table>` + `<thead>`**：续页表头重复靠 `thead { display: table-header-group }`，用 `<view>` 拼不出可重复表头。

```vue
    <!-- ⑥ 打印区：屏幕不显示（.st-print{display:none}），仅 @media print 显示（规格 §7.5） -->
    <view v-if="diff" class="st-print">
      <!-- 任务头：只在第一页（position: static，禁用 fixed） -->
      <view class="p-head">
        <view class="p-title">{{ printTask?.code || '—' }} · {{ printTask?.name || '' }}</view>
        <view class="p-sub">
          {{ $t('stocktake.task.warehouse') }}: {{ printTask?.locationName || '—' }}
          <text v-if="printTask?.activityCode"> | {{ $t('stocktake.task.activity') }}: {{ printTask.activityCode }}</text>
        </view>
      </view>

      <!-- 四宫格（独立块级外壳，break-inside: avoid） -->
      <view class="p-sum">
        <view class="p-cell"><text class="p-n">{{ diff.expectedTotal }}</text><text class="p-l">{{ $t('stocktake.diff.summaryExpected') }}</text></view>
        <view class="p-cell"><text class="p-n">{{ diff.countedTotal }}</text><text class="p-l">{{ $t('stocktake.diff.summaryCounted') }}</text></view>
        <view class="p-cell"><text class="p-n">{{ diff.uncountedCount }}</text><text class="p-l">{{ $t('stocktake.diff.summaryUncounted') }}</text></view>
        <view class="p-cell"><text class="p-n">{{ diff.extraCount }}</text><text class="p-l">{{ $t('stocktake.diff.summaryExtra') }}</text></view>
      </view>

      <!-- 差异表：9 列，列宽按 §7.5 固定分配（合计 186mm） -->
      <view class="p-sec">
        <table class="p-tbl">
          <thead>
            <tr>
              <th class="c1">{{ $t('stocktake.diff.printColBinCode') }}</th>
              <th class="c2">{{ $t('stocktake.diff.printColZone') }}</th>
              <th class="c3">{{ $t('stocktake.diff.printColSku') }}</th>
              <th class="c4">{{ $t('stocktake.diff.printColName') }}</th>
              <th class="c5 num">{{ $t('stocktake.diff.printColCounted') }}</th>
              <th class="c6 num">{{ $t('stocktake.diff.printColSnapBook') }}</th>
              <th class="c7 num">{{ $t('stocktake.diff.printColBook') }}</th>
              <th class="c8 num">{{ $t('stocktake.diff.printColDiff') }}</th>
              <th class="c9 num">{{ $t('stocktake.diff.printColExtra') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in diff.rows" :key="r.variantId">
              <td class="c1">{{ r.targetBinCode || '—' }}</td>
              <td class="c2">{{ r.targetZoneCode || '—' }}</td>
              <td class="c3">{{ r.variantSku }}</td>
              <td class="c4">{{ r.variantName }}</td>
              <td class="c5 num">{{ r.countedTotal }}</td>
              <td class="c6 num">{{ r.snapBookQty }}</td>
              <td class="c7 num">{{ r.currentBookQty }}</td>
              <td class="c8 num">{{ r.diff > 0 ? '+' + r.diff : r.diff }}</td>
              <td class="c9 num">{{ r.isExtra ? '1' : '' }}</td>
            </tr>
            <tr v-if="!diff.rows.length">
              <td class="p-empty" colspan="9">{{ $t('stocktake.diff.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </view>

      <!-- 未盘清单（印刷版必须带上，否则过账依据不完整） -->
      <view v-if="diff.uncountedCount > 0" class="p-sec">
        <view class="p-sec-t">{{ $t('stocktake.diff.uncountedTitle').replace('{n}', String(diff.uncountedCount)) }}</view>
        <table class="p-tbl p-unc">
          <thead>
            <tr>
              <th class="u1">{{ $t('stocktake.diff.printColSku') }}</th>
              <th class="u2">{{ $t('stocktake.diff.printColName') }}</th>
              <th class="u3 num">{{ $t('stocktake.diff.colBook') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in diff.uncountedLines" :key="l.id">
              <td class="u1">{{ l.variantSku }}</td>
              <td class="u2">{{ l.variantName }}</td>
              <td class="u3 num">{{ l.bookQty }}</td>
            </tr>
          </tbody>
        </table>
      </view>

      <!-- 页脚：任务号 + 打印时间（无页码，理由见 §7.5「页码」行） -->
      <view class="p-foot">
        <text>{{ $t('stocktake.diff.footerTask') }}: {{ printTask?.code || '—' }}</text>
        <text>{{ $t('stocktake.diff.footerAt') }}: {{ printAt }}</text>
      </view>
    </view>
```

**若 H5 编译器不接受原生 `<table>`（表现为 DOM 里没有 `table` 或样式不生效）**：改用 `v-html` 兜底——删掉上面两个 `<table>` 块，换成 `<view class="p-sec" v-html="printTableHtml"></view>` 与 `<view class="p-sec" v-html="printUncountedHtml"></view>`，并加下列 computed（`computed` 已在文件顶部导入，直接写即可；样式类名保持不变，非 scoped 全局样式照旧命中）：

```ts
function esc(s: unknown) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const printTableHtml = computed(() => {
  const th = ['printColBinCode', 'printColZone', 'printColSku', 'printColName', 'printColCounted', 'printColSnapBook', 'printColBook', 'printColDiff', 'printColExtra']
    .map((k, i) => `<th class="c${i + 1}${i >= 4 ? ' num' : ''}">${esc(locale.t('stocktake.diff.' + k))}</th>`).join('');
  const rows = (diff.value?.rows || []).map((r) => `<tr><td class="c1">${esc(r.targetBinCode || '—')}</td><td class="c2">${esc(r.targetZoneCode || '—')}</td>`
    + `<td class="c3">${esc(r.variantSku)}</td><td class="c4">${esc(r.variantName)}</td><td class="c5 num">${esc(r.countedTotal)}</td>`
    + `<td class="c6 num">${esc(r.snapBookQty)}</td><td class="c7 num">${esc(r.currentBookQty)}</td>`
    + `<td class="c8 num">${esc(r.diff > 0 ? '+' + r.diff : r.diff)}</td><td class="c9 num">${r.isExtra ? '1' : ''}</td></tr>`).join('');
  const body = rows || '<tr><td class="p-empty" colspan="9">' + esc(locale.t('stocktake.diff.empty')) + '</td></tr>';
  return `<table class="p-tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
});
const printUncountedHtml = computed(() => {
  const lines = diff.value?.uncountedLines || [];
  if (!lines.length) return '';
  const th = `<th class="u1">${esc(locale.t('stocktake.diff.printColSku'))}</th><th class="u2">${esc(locale.t('stocktake.diff.printColName'))}</th><th class="u3 num">${esc(locale.t('stocktake.diff.colBook'))}</th>`;
  const body = lines.map((l) => `<tr><td class="u1">${esc(l.variantSku)}</td><td class="u2">${esc(l.variantName)}</td><td class="u3 num">${esc(l.bookQty)}</td></tr>`).join('');
  return `<table class="p-tbl p-unc"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
});
```

走 v-html 兜底时，`<view v-if="diff.uncountedCount > 0" class="p-sec">` 的小标题 `p-sec-t` 保留不动，只把其中的 `<table>` 换成 `v-html` 容器。

- [ ] **Step 2: 脚本——`printTask` / `printAt` / `onPrint`**

import 只改 `vue` 那一条（`diff.vue` 第 88 行现状是 `import { computed, ref } from 'vue';`，`computed` 已被页面用着，**不能删**）：

```ts
import { computed, onMounted, ref } from 'vue';
```

apis 那条 Task 14 已经补全（含 `fetchStocktakeDiff` / `fetchStocktakeTask` / `type StocktakeTask`），本任务**不要再动**。

新增状态与函数（`printTask` 已在 Task 14 声明，此处**不要重复声明**）：

```ts
/**
 * 打印时间：§10.5 基线要可复现，截图脚本会用 window.__STOCKTAKE_PRINT_AT__ 冻结；
 * 未冻结时取当前时间（本地 yyyy-MM-dd HH:mm）。
 */
function currentStamp() {
  const frozen = (window as any).__STOCKTAKE_PRINT_AT__;
  const d = frozen ? new Date(frozen) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const printAt = ref(currentStamp());

onMounted(() => { printAt.value = currentStamp(); });
```

把 Task 14 写的 `onPrint` 替换为（打印前刷新时间戳，保证纸上时间就是出纸时间）：

```ts
function onPrint() {
  printAt.value = currentStamp();
  // 打印根节点常驻 DOM（打印样式内 display 切换），此处只需触发系统打印
  window.print();
}
```

- [ ] **Step 3: 打印样式（独立非 scoped 块，逐条落实 §7.5）**

在 `<style lang="scss" scoped>` 块**之后**再追加一个不带 `scoped` 的样式块（scoped 会改写选择器，`v-html` 与 `@page` 都不吃它）：

```vue
<style lang="scss">
/* 打印样式：唯一出处是规格 §7.5。不引用主题变量；几何只用 mm、字号只用 pt；
   禁用 transform: scale / zoom / vw / 自适应列宽；缩放固定 100%。 */
.st-print { display: none; }

@media print {
  @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }

  html, body { margin: 0; padding: 0; background: #fff; }
  .page { background: #fff !important; padding: 0 !important; }
  .st-screen { display: none !important; }

  .st-print { display: block; width: 186mm; background: #fff; color: #000;
    font-family: "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
    font-size: 8.5pt; line-height: 12pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* 任务头：只在第一页 */
  .p-head { break-inside: avoid; padding-bottom: 2mm; border-bottom: 0.2mm solid #000; }
  .p-title { font-size: 14pt; line-height: 18pt; font-weight: 700; }
  .p-sub { font-size: 8.5pt; line-height: 12pt; margin-top: 1mm; }

  /* 四宫格 */
  .p-sum { display: flex; break-inside: avoid; margin: 3mm 0; border: 0.2mm solid #000; }
  .p-cell { flex: 1; text-align: center; padding: 1.5mm 0; border-left: 0.2mm solid #000; }
  .p-cell:first-child { border-left: 0; }
  .p-n { display: block; font-size: 12pt; line-height: 14pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .p-l { display: block; font-size: 8.5pt; line-height: 12pt; }

  /* 分区外壳：各自不跨页 */
  .p-sec { break-inside: avoid; margin-top: 3mm; }
  .p-sec-t { font-size: 8.5pt; line-height: 12pt; font-weight: 700; margin-bottom: 1mm; }

  /* 表格：固定布局，禁用斑马纹 */
  .p-tbl { table-layout: fixed; border-collapse: collapse; width: 186mm; }
  .p-tbl th, .p-tbl td { border-bottom: 0.2mm solid #000; padding: 0.8mm 1mm; text-align: left;
    font-size: 8.5pt; line-height: 12pt; overflow-wrap: anywhere; }
  .p-tbl thead { display: table-header-group; }
  .p-tbl thead th { background: #F2F2F2; border-top: 0.2mm solid #000; font-weight: 700; }
  .p-tbl tbody tr { break-inside: avoid; height: 6mm; }
  .p-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
  .p-tbl .p-empty { text-align: center; border-bottom: 0; }

  /* 差异表列宽（§7.5 定值，合计 186mm） */
  .p-tbl .c1 { width: 22mm; } .p-tbl .c2 { width: 30mm; } .p-tbl .c3 { width: 38mm; }
  .p-tbl .c4 { width: 17mm; } .p-tbl .c5 { width: 17mm; } .p-tbl .c6 { width: 17mm; }
  .p-tbl .c7 { width: 15mm; } .p-tbl .c8 { width: 12mm; } .p-tbl .c9 { width: 18mm; }
  /* 未盘清单列宽（§7.5 未定义，本计划新增，合计 186mm） */
  .p-unc .u1 { width: 30mm; } .p-unc .u2 { width: 138mm; } .p-unc .u3 { width: 18mm; }

  /* 页脚 */
  .p-foot { break-inside: avoid; margin-top: 3mm; padding-top: 1mm; border-top: 0.2mm solid #000;
    font-size: 7.5pt; line-height: 10pt; display: flex; justify-content: space-between; }
}
</style>
```

- [ ] **Step 4: 构建 + 打印预览走查**

Run: `npm run build:h5` → 成功。

走查（本地 `npm run build:h5` → `node scripts/serve-h5.mjs` → 浏览器打开差异页 → Ctrl/Cmd+P 预览）：
1. 预览首屏必须是**任务头 → 四宫格 → 差异表 → 未盘清单 → 页脚**，屏幕上原有的页签/按钮/吸底过账条**不得出现**。
2. 差异表表头灰底、上下黑边，列宽与屏幕版明显不同（SKU 列最宽 38mm）。
3. 多页时第 2 页起顶部应重复表头（Chromium 打印预览里可翻页确认）。
4. A4 纵向、无横向裁切、无缩放。
5. DevTools 里确认 `.st-print table` 真实存在（若不存在 → 走 Step 1 的 `v-html` 兜底）。

- [ ] **Step 5: 提交**

```bash
git add src/pages/inventory/stocktake/diff.vue
git commit -m "feat(stocktake): 差异页打印视图与像素级打印样式"
```

## Task 16: 打印像素基线脚本与基线录制（规格 §3.5 / §7.5 / §10.5）

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_print_baseline.py`
- Create: `d:\zhao\vshop\web-admin\_e2e\baselines\print\<case>\page-N.png` + `env.json`（`--record` 生成）

**为什么这样取基线（坑已探明）：** 本机无任何 PDF 解析/光栅化库（`pypdf` / `PyPDF2` / `pypdfium2` / `fitz` 全缺，实测只有 `pillow` + `numpy` + `playwright`），所以逐页 PNG 由**元素截图 + 按 271mm 内容高切片**得到；PDF 只用正则读 `/MediaBox` 与页数做结构断言。「PDF 文本可复制」改为 DOM 文本断言（详见计划末尾偏差说明区）。

- [ ] **Step 1: 新建 `_e2e/_verify_print_baseline.py`**

```python
# -*- coding: utf-8 -*-
"""打印像素基线（规格 §3.5 / §7.5 / §10.5）

受控渲染契约（与 _e2e/baselines/print/<case>/env.json 同源）：
  Playwright Chromium + emulateMedia({media:'print'}) + 视口 794x1123 @dpr2
  光栅化：element.screenshot(.st-print) → PIL 按 271mm 内容高切片成页（本机无 PDF 光栅化库）
  比对：同机逐像素零容差；跨机/跨版本自动降级为结构断言并输出 SKIP pixel（不虚报 PASS）

用法（在 web-admin 目录下）：
  python _e2e/_verify_print_baseline.py --task <taskId>                # 比对
  python _e2e/_verify_print_baseline.py --task <taskId> --record       # 录基线
  python _e2e/_verify_print_baseline.py --task <taskId> --record --force
  python _e2e/_verify_print_baseline.py --task <id> --empty-task <id>  # 追加 empty-a4
  python _e2e/_verify_print_baseline.py                                # 用环境变量 WA_PRINT_TASK
环境变量：WA_PRINT_BASE（默认 https://e.joho.cn/guanli/）、WA_PRINT_TASK、WA_SMOKE_USER、WA_SMOKE_PWD、WA_SMOKE_CHANNEL
退出码：0 = 全部通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用
"""
import argparse
import io
import json
import os
import platform
import re
import time
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 pillow + numpy → %s' % e)
    raise SystemExit(2)
try:
    import playwright
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

MM = 96.0 / 25.4                      # 1mm = 3.779528 CSS px @96dpi
CONTENT_W_MM, CONTENT_H_MM = 186.0, 271.0
CONTENT_W_CSS = CONTENT_W_MM * MM
CONTENT_H_CSS = CONTENT_H_MM * MM
PAGE_H_DEV = int(round(CONTENT_H_CSS * 2))          # 271mm @dpr2 → 2049 设备像素
VIEW = {'width': 794, 'height': 1123}
DPR = 2
COL_MM = [22.0, 30.0, 38.0, 17.0, 17.0, 17.0, 15.0, 12.0, 18.0]
COL_TOL_MM = 0.3
WIDTH_TOL_MM = 0.3
FONT_STACK = '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
PRINT_AT = '2026-09-25 10:00'                       # 冻结打印时间，保证页脚可复现
BIG_ROWS = 120

BASE = os.environ.get('WA_PRINT_BASE', 'https://e.joho.cn/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL = os.environ.get('WA_SMOKE_CHANNEL', 't2')
ROOT = Path(__file__).resolve().parent
BASE_DIR = ROOT / 'baselines' / 'print'

FAILS, SKIPS = [], []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def skip(name, why):
    print('  SKIP %s %s' % (name, why))
    SKIPS.append('%s：%s' % (name, why))


# ------------------------------------------------------------------ 浏览器侧

def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""async ([code]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})});
      const d = await r.json();
      const cs = ((d.data||{}).myTenantAccess||{}).channels || [];
      const c = cs.find(x=>x.code===code);
      if(!c) return 'NOCHANNEL:' + cs.map(x=>x.code).join(',');
      localStorage.setItem('wa_channel_token', c.token);
      localStorage.setItem('wa_channel_code', c.code);
      return 'OK';
    }""", [CHANNEL])
    if ok != 'OK':
        print('ENV-FAIL: 登录/渠道注入失败 %s' % ok)
        raise SystemExit(2)


def open_diff(pg, tid):
    url = '%s#/pages/inventory/stocktake/diff?taskId=%s&cb=%d' % (BASE, tid, int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.wait_for_selector('.st-print', state='attached', timeout=40000)
    time.sleep(2.0)


def measure(pg):
    return pg.evaluate("""() => {
      const root = document.querySelector('.st-print');
      if (!root) return null;
      const mm = (px) => px * 25.4 / 96;
      const r = root.getBoundingClientRect();
      const ths = [...document.querySelectorAll('.st-print .p-tbl thead th')].map(t => mm(t.getBoundingClientRect().width));
      const thead = document.querySelector('.st-print .p-tbl thead');
      const tr = document.querySelector('.st-print .p-tbl tbody tr');
      const cs = getComputedStyle(root);
      const over = [];
      for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width > 186.5 || b.right > r.left + 186.5) over.push((el.className || el.tagName) + ':' + b.width.toFixed(1));
      }
      return {
        widthMM: mm(r.width), heightMM: mm(r.height), colsMM: ths,
        theadDisplay: thead ? getComputedStyle(thead).display : '',
        trBreak: tr ? getComputedStyle(tr).breakInside : '',
        fontFamily: cs.fontFamily,
        colorAdjust: cs.printColorAdjust || cs.webkitPrintColorAdjust,
        scrollW: root.scrollWidth, clientW: root.clientWidth,
        overflow: over.slice(0, 5), text: root.innerText,
      };
    }""")


def inject_big(pg, n):
    return pg.evaluate("""(n) => {
      const tb = document.querySelector('.st-print .p-tbl tbody');
      if (!tb) return -1;
      const rows = [...tb.querySelectorAll('tr')].filter(r => !r.querySelector('.p-empty'));
      if (!rows.length) return -2;
      const src = rows[0];
      for (let i = 0; i < n; i++) tb.appendChild(src.cloneNode(true));
      return tb.querySelectorAll('tr').length;
    }""", n)


# ------------------------------------------------------------------ 图像侧

def slice_pages(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    w, h = im.size
    n = max(1, int((h + PAGE_H_DEV - 1) // PAGE_H_DEV))
    pages = []
    for i in range(n):
        top = i * PAGE_H_DEV
        band = im.crop((0, top, w, min(h, top + PAGE_H_DEV)))
        canvas = Image.new('RGB', (w, PAGE_H_DEV), (255, 255, 255))
        canvas.paste(band, (0, 0))          # 末页补白：内容上移/下移都能被 diff 抓到
        pages.append(canvas)
    return w, pages


def arr(img):
    return np.asarray(img, dtype=np.int16)


def build_env(pg, tid, m, pages):
    return {
        'case_task_id': str(tid),
        'title': m['text'].split('\n')[0] if m.get('text') else '',
        'pages': pages,
        'page_h_dev': PAGE_H_DEV,
        'fingerprint': {
            'chromium': pg.evaluate('() => navigator.userAgent'),
            'playwright': getattr(playwright, '__version__', 'unknown'),
            'os': platform.platform(),
            'python': platform.python_version(),
            'viewport': VIEW, 'dpr': DPR,
            'content_mm': [CONTENT_W_MM, CONTENT_H_MM],
            'page_h_dev': PAGE_H_DEV,
            'font_stack': FONT_STACK,
            'print_at': PRINT_AT,
        },
        'recorded_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }


FP_KEYS = ['chromium', 'playwright', 'os', 'viewport', 'dpr', 'content_mm', 'page_h_dev', 'print_at']


def pdf_asserts(pg, case, expect_pages):
    b = pg.pdf(format='A4', print_background=True, prefer_css_page_size=True,
               margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
    n = len(re.findall(rb'/Type\s*/Page[^s]', b))
    check('%s PDF 页数 >= 切片页数' % case, n >= expect_pages, 'pdf=%d png=%d' % (n, expect_pages))
    box = re.search(rb'/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)', b)
    if not box:
        check('%s PDF 含 MediaBox' % case, False, '未匹配到 /MediaBox')
        return
    w, h = float(box.group(3)), float(box.group(4))
    check('%s PDF 页尺寸 = A4（595.276 x 841.89pt ±0.5）' % case,
          abs(w - 595.276) <= 0.5 and abs(h - 841.89) <= 0.5, '%.3f x %.3f pt' % (w, h))


def geometry_asserts(case, m, code):
    check('%s 打印区宽度 = 186mm（±0.3）' % case, m and abs(m['widthMM'] - CONTENT_W_MM) <= WIDTH_TOL_MM,
          '%.2fmm' % (m['widthMM'] if m else -1))
    if not m:
        return
    check('%s 差异表 9 列' % case, len(m['colsMM']) == 9, 'cols=%d' % len(m['colsMM']))
    bad = [(i + 1, round(w, 2), COL_MM[i]) for i, w in enumerate(m['colsMM']) if i < 9 and abs(w - COL_MM[i]) > COL_TOL_MM]
    check('%s 列宽符合 §7.5（±0.3mm）' % case, not bad, '偏差=%s' % bad)
    check('%s thead 为 table-header-group（续页重复机制）' % case, m['theadDisplay'] == 'table-header-group', m['theadDisplay'])
    check('%s 数据行 break-inside = avoid' % case, m['trBreak'] == 'avoid', m['trBreak'])
    check('%s 打印字体栈已显式声明' % case, 'PingFang SC' in m['fontFamily'], m['fontFamily'][:60])
    check('%s print-color-adjust = exact' % case, m['colorAdjust'] == 'exact', str(m['colorAdjust']))
    check('%s 无横向溢出' % case, not m['overflow'] and m['scrollW'] <= m['clientW'] + 1,
          'overflow=%s scroll=%s/%s' % (m['overflow'], m['scrollW'], m['clientW']))
    t = m['text'] or ''
    check('%s DOM 文本含任务号' % case, code in t, 'code=%s' % code)
    check('%s DOM 文本含「差异」「未盘」' % case, ('差异' in t) and ('未盘' in t), '')


def task_meta(pg, tid):
    """返回 'code|state'（每次按 taskId 现取，empty-a4 用的是另一个任务）"""
    raw = pg.evaluate("""async ([id]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query($id: ID!){ stocktakeTask(id:$id){ code state } }', variables:{id}})});
      const d = await r.json();
      const x = ((d.data||{}).stocktakeTask) || {};
      return (x.code || '') + '|' + (x.state || '');
    }""", [str(tid)])
    code, state = (raw or '|').split('|', 1)
    return code, state


def run(pg, case, tid, record, force, big=False):
    print('\n[%s] task=%s' % (case, tid))
    code, state = task_meta(pg, tid)
    check('%s 任务可查且已终态（免受并发改动影响）' % case, bool(code) and state == 'POSTED',
          'code=%s state=%s' % (code, state))
    open_diff(pg, tid)
    if big:
        n = inject_big(pg, BIG_ROWS)
        check('%s 注入行成功' % case, n >= BIG_ROWS, 'rows=%s' % n)
    m = measure(pg)
    geometry_asserts(case, m, code)
    png = pg.locator('.st-print').screenshot()
    w, pages = slice_pages(png)
    check('%s 光栅宽度 = 186mm @dpr2（±2px）' % case, abs(w - round(CONTENT_W_CSS * DPR)) <= 2,
          'w=%d 期望=%d' % (w, round(CONTENT_W_CSS * DPR)))
    if big:
        check('%s 内容跨 >= 3 页' % case, len(pages) >= 3, 'pages=%d' % len(pages))
    pdf_asserts(pg, case, len(pages))

    folder = BASE_DIR / case
    env_now = build_env(pg, tid, m, len(pages))
    if record:
        if folder.exists() and not force:
            check('%s 基线已存在（要覆盖请加 --force）' % case, False, str(folder))
            return
        folder.mkdir(parents=True, exist_ok=True)
        for i, p in enumerate(pages):
            p.save(folder / ('page-%d.png' % (i + 1)))
        (folder / 'env.json').write_text(json.dumps(env_now, ensure_ascii=False, indent=2), encoding='utf-8')
        print('  REC  %s → %d 页 + env.json' % (folder, len(pages)))
        return

    env_path = folder / 'env.json'
    if not env_path.exists():
        check('%s 基线存在' % case, False, '未找到 %s（先跑 --record）' % env_path)
        return
    env_old = json.loads(env_path.read_text(encoding='utf-8'))
    diff_keys = [k for k in FP_KEYS if env_old['fingerprint'].get(k) != env_now['fingerprint'].get(k)]
    if diff_keys:
        skip('%s 像素比对' % case, '渲染环境指纹不符 %s（结构断言照跑）' % diff_keys)
        return
    if env_old.get('pages') != len(pages):
        check('%s 页数与基线一致' % case, False, 'baseline=%s now=%s' % (env_old.get('pages'), len(pages)))
        return
    bad_pages = []
    for i, p in enumerate(pages):
        old = Image.open(folder / ('page-%d.png' % (i + 1))).convert('RGB')
        if old.size != p.size:
            bad_pages.append('page-%d 尺寸 %s≠%s' % (i + 1, p.size, old.size))
            continue
        a, b = arr(p), arr(old)
        mask = (a != b).any(axis=2)
        n = int(mask.sum())
        if n:
            out = np.asarray(p).copy()
            out[mask] = [255, 0, 0]
            d = BASE_DIR / '_diff' / case
            d.mkdir(parents=True, exist_ok=True)
            Image.fromarray(out).save(d / ('page-%d.png' % (i + 1)))
            bad_pages.append('page-%d 差异像素 %d（最大通道差 %d）' % (i + 1, n, int(np.abs(a - b).max())))
    check('%s 逐页像素零容差一致' % case, not bad_pages, '；'.join(bad_pages[:3]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--task', default=os.environ.get('WA_PRINT_TASK', ''))
    ap.add_argument('--empty-task', default=os.environ.get('WA_PRINT_EMPTY_TASK', ''))
    ap.add_argument('--record', action='store_true')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    if not a.task:
        print('ENV-FAIL: 缺 --task（或环境变量 WA_PRINT_TASK）——基线必须钉死一个固定的历史任务 id')
        raise SystemExit(2)

    print('受控渲染：viewport=%s dpr=%d content=%.0fx%.0fmm page_h_dev=%d' % (VIEW, DPR, CONTENT_W_MM, CONTENT_H_MM, PAGE_H_DEV))
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport=VIEW, device_scale_factor=DPR, locale='zh-CN')
        ctx.add_init_script("window.__STOCKTAKE_PRINT_AT__ = '%s'" % PRINT_AT)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: errs.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
        pg.emulate_media(media='print')
        login(pg)

        run(pg, 'diff-a4', str(a.task), a.record, a.force)
        if a.empty_task:
            run(pg, 'empty-a4', str(a.empty_task), a.record, a.force)
        else:
            skip('empty-a4', '未提供 --empty-task / WA_PRINT_EMPTY_TASK')
        run(pg, 'big-a4', str(a.task), a.record, a.force, big=True)

        check('全程无 JS 运行时异常', not [e for e in errs if e.startswith('PAGEERR')], str([e for e in errs if e.startswith('PAGEERR')][:2]))
        print('  console.error 计数 = %d' % len([e for e in errs if e.startswith('CONSOLE')]))
        b.close()

    print('\n===== 打印基线：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 脚本自检**

Run: `python -c "import ast,pathlib;ast.parse(pathlib.Path('_e2e/_verify_print_baseline.py').read_text(encoding='utf-8'));print('AST OK')"`
Expected: `AST OK`

Run: `python _e2e/_verify_print_baseline.py --help`
Expected: 打印 usage，无异常。

Run（缺 `--task` 时必须是 ENV-FAIL 而不是崩栈）: `python _e2e/_verify_print_baseline.py`
Expected: `ENV-FAIL: 缺 --task ...`，退出码 2。

- [ ] **Step 3: 选定基线任务并录制**

挑一个**已过账、行数够多（≥ 40 行）**的历史任务作 `diff-a4` / `big-a4` 的数据源（已终态任务不会再变，基线才稳）：

Python 侧没有 `os.environ` 之外的取法，两条路选一条即可（`--task` 优先于环境变量）：

```powershell
# 方式一：直接传参（推荐）
python _e2e/_verify_print_baseline.py --task <taskId> --record --force

# 方式二：先设环境变量，再不带参跑
$env:WA_PRINT_TASK = '<taskId>'
python _e2e/_verify_print_baseline.py --record --force
```

Expected: 每个 case 打印 `REC ... → N 页 + env.json`；`_e2e/baselines/print/diff-a4/`、`big-a4/` 下出现 `page-1.png …` 与 `env.json`；无 FAIL。

`empty-a4` 需要「无差异」任务（`rows` 与 `uncountedLines` 都为空）；找到就再跑：

```powershell
python _e2e/_verify_print_baseline.py --task <taskId> --empty-task <emptyTaskId> --record --force
```

找不到就保持 SKIP（脚本会明说原因，**不许拿有差异任务冒充空态**）。

- [ ] **Step 4: 立即复跑比对（基线必须能自证）**

Run: `python _e2e/_verify_print_baseline.py --task <taskId>`
Expected: `PASS`；每个 case 打印 `OK  ... 逐页像素零容差一致`，不产生 `_diff/` 目录。

- [ ] **Step 5: 负向验证（证明基线不是永远绿）**

把 `diff.vue` 打印样式里的 `.p-tbl tbody tr { ... height: 6mm; }` 临时改成 `height: 7mm`，重新 `npm run build:h5` 并（本地 serve）跑同一命令。

Expected: `FAIL ... 逐页像素零容差一致 page-N 差异像素 xxxxx`，且 `_e2e/baselines/print/_diff/<case>/page-N.png` 生成、红色标出差异区。

随后改回 `6mm`、重建、复跑 → 恢复 `PASS`；删除 `_diff/` 临时产物。

- [ ] **Step 6: 提交（脚本 + 基线一起进仓）**

```bash
git add _e2e/_verify_print_baseline.py _e2e/baselines/print
git commit -m "test(stocktake): 打印像素基线脚本与 A4 基线（diff/empty/big）"
```

## Task 17: 工程门禁脚本（规格 §11）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\package.json`

- [ ] **Step 1: 加四个脚本**

把 `"scripts"` 块整体替换为：

```json
  "scripts": {
    "dev:h5": "uni",
    "build:h5": "uni build",
    "test:smoke:live": "python scripts/_smoke_stocktake_live.py",
    "test:e2e:stocktake": "python _e2e/_verify_stocktake_ops_e2e.py",
    "verify:manual": "python _e2e/_verify_manual_docs.py",
    "verify:print": "python _e2e/_verify_print_baseline.py"
  }
```

约定（四个脚本统一遵守，已在各自的 import 处实现）：缺 `python` / `playwright` / `pillow` / `numpy` 一律打印 `ENV-FAIL: ...` 并以**退出码 2** 结束（区别于断言失败的 1），不伪装成 PASS。

- [ ] **Step 2: 校验**

Run: `npm pkg get scripts`
Expected: 六个键齐全，无语法错误。

Run: `npm run verify:print`（未设 `WA_PRINT_TASK` 时）
Expected: `ENV-FAIL: 缺 --task ...`，退出码 2（`npm` 会打印 `npm ERR!` 包裹，属预期）。

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "build(web-admin): 盘库回归门禁脚本（smoke/e2e/manual/print）"
```

## Task 18: T46–T53 手机视口截图回归（规格 §9 / §10.4 / §10.2）

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_stocktake_ops_e2e.py`
- Create: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\assets\stocktake-ops-46..53-*.png`

移动视口铁律：`390×844`、`deviceScaleFactor: 2`（= 780×1688）、`is_mobile`、`has_touch`；每张图断言 **0 pageerror / 0 console.error**。打印区本身**不**由手机截图证明（A4 几何手机视口证明不了），由 Task 16 的 A4 基线承担（规格 §9）。

- [ ] **Step 1: 新建 `_e2e/_verify_stocktake_ops_e2e.py`**

```python
# -*- coding: utf-8 -*-
"""盘库运营增强 · 手机视口截图回归（T46–T53，规格 §9 / §10.4）

铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。
写操作护栏：默认只读。草稿相关用例需要 DRAFT 任务；没有现成草稿时，
  必须显式设 WA_SHOT_ALLOW_WRITE=1 才创建一个 DRAFT（不动库存、只写任务头），跑完立即取消；
  目标域名含 e.joho.cn（生产）时**硬拦**，一律不写。
退出码：0 = 通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用
"""
import os
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_SHOT_BASE', 'https://e.joho.cn/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL = os.environ.get('WA_SMOKE_CHANNEL', 't2')
LOC = os.environ.get('WA_SMOKE_LOC', '3')
ALLOW_WRITE = os.environ.get('WA_SHOT_ALLOW_WRITE', '0') == '1'
IS_PROD = 'e.joho.cn' in BASE
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'webadmin-bugfix-manual' / 'assets'

FAILS, SKIPS = [], []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def skip(name, why):
    print('  SKIP %s %s' % (name, why))
    SKIPS.append('%s：%s' % (name, why))


def gql(pg, q, v=None):
    return pg.evaluate("""async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const h = {'Content-Type':'application/json'};
      if (t) h['Authorization'] = 'Bearer ' + t;
      if (ct) h['vendure-token'] = ct;
      const r = await fetch('/admin-api', {method:'POST', headers:h, body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, v or {}])


def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""async ([code]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})});
      const d = await r.json();
      const cs = ((d.data||{}).myTenantAccess||{}).channels || [];
      const c = cs.find(x=>x.code===code);
      if(!c) return 'NOCHANNEL:' + cs.map(x=>x.code).join(',');
      localStorage.setItem('wa_channel_token', c.token);
      localStorage.setItem('wa_channel_code', c.code);
      return 'OK';
    }""", [CHANNEL])
    if ok != 'OK':
        print('ENV-FAIL: 登录失败 %s' % ok)
        raise SystemExit(2)


def goto(pg, path, settle=6.0):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def shot(pg, tag, note):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('stocktake-ops-%s.png' % tag)
    pg.screenshot(path=str(f))
    check('%s %s → %s' % (tag, note, f.name), f.exists() and f.stat().st_size > 5000, '%d B' % (f.stat().st_size if f.exists() else 0))


def errs_of(bag):
    """规格 §10.2：每张图都要 0 pageerror **且** 0 console.error —— 两者都算异常。
    bag 是累积的：一旦出现过异常，后续所有断言都会带上它（保守但不虚报）。"""
    return [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]


def main():
    if IS_PROD and ALLOW_WRITE:
        print('ENV-FAIL: 目标是生产域名且开了 WA_SHOT_ALLOW_WRITE —— 拒绝执行（生产只读）')
        raise SystemExit(2)

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True, locale='zh-CN')
        pg = ctx.new_page()
        bag = []
        pg.on('pageerror', lambda e: bag.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: bag.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
        login(pg)

        # 数据准备：一个已过账任务（用于 T51–T53）、一个草稿（T47–T48）
        tasks = gql(pg, 'query{ stocktakeTasks(options:{page:1,pageSize:50}){ totalItems items{ id code state } } }')
        items = (((tasks.get('data') or {}).get('stocktakeTasks') or {}).get('items')) or []
        posted = next((t for t in items if t['state'] == 'POSTED'), None)
        counting = next((t for t in items if t['state'] in ('OPEN', 'COUNTING', 'COUNTED')), None)
        draft = next((t for t in items if t['state'] == 'DRAFT' and t.get('code', '').startswith('SHOT-')), None)
        created = None
        if not draft and ALLOW_WRITE:
            r = gql(pg, """mutation($input: StocktakeTaskInput!){
                 createStocktakeTask(input:$input){ id code state } }""",
                    {'input': {'stockLocationId': str(LOC), 'name': 'SHOT-DRAFT', 'state': 'DRAFT', 'scope': {'zones': [], 'categoryIds': [], 'variantIds': [], 'includeZeroBook': False, 'autoSplitByZone': False}}})
            draft = (((r.get('data') or {}).get('createStocktakeTask')) or None)
            created = draft['id'] if draft else None
            check('创建临时草稿（仅任务头，不动库存）', bool(draft), str(r.get('errors'))[:160])

        # ---------- T46 看板分页：触底增量 ----------
        goto(pg, 'pages/inventory/stocktake/index', 8)
        check('T46 看板页签 >= 4（含草稿）', pg.locator('.tabs .tb').count() >= 4, 'tabs=%d' % pg.locator('.tabs .tb').count())
        before = pg.locator('.tcard').count()
        for _ in range(3):
            pg.mouse.wheel(0, 4000)
            time.sleep(1.2)
        after = pg.locator('.tcard').count()
        check('T46 触底后条目不减（分页追加不重置）', after >= before, 'before=%d after=%d' % (before, after))
        check('T46 出现分页脚注', pg.locator('.footnote').count() >= 1, 'footnote=%d' % pg.locator('.footnote').count())
        shot(pg, '46-pagination', '看板分页触底')
        check('T46 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # ---------- T47 / T48 草稿 ----------
        if draft:
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % draft['id'], 8)
            check('T47 草稿详情显示草稿态提示', '草稿' in pg.inner_text('body'), pg.inner_text('body')[:60].replace('\n', '|'))
            check('T47 草稿态动作条含「发布任务」', pg.locator('text=发布任务').count() >= 1)
            shot(pg, '47-draft-detail', '草稿详情与动作条')
            check('T47 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            goto(pg, 'pages/inventory/stocktake/index', 8)
            pg.locator('.tabs .tb', has_text='草稿').first.click()
            time.sleep(3)
            pg.locator('text=新建盘点任务').first.click()
            time.sleep(2)
            check('T48 抽屉双按钮：存为草稿 + 创建并发布',
                  pg.locator('text=存为草稿').count() >= 1 and pg.locator('text=创建并发布').count() >= 1)
            shot(pg, '48-new-draft-buttons', '新建抽屉双动作')
            check('T48 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        else:
            skip('T47/T48 草稿相关', '无 DRAFT 任务且未开 WA_SHOT_ALLOW_WRITE（生产只读）')

        # ---------- T49 / T50 统计 ----------
        if counting:
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % counting['id'], 8)
            pg.locator('.tabs .tb', has_text='统计').first.click()
            time.sleep(4)
            check('T49 统计表（按库位）有表头', pg.locator('.stats .tbl .th').count() >= 1)
            shot(pg, '49-stats-by-bin', '统计 · 按库位')
            check('T49 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            pg.locator('.stats .seg .sg', has_text='按盘点人').first.click()
            time.sleep(3)
            check('T50 统计表（按盘点人）有表头', pg.locator('.stats .tbl .th').count() >= 1)
            shot(pg, '50-stats-by-counter', '统计 · 按盘点人')
            check('T50 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        else:
            skip('T49/T50 统计', '无可盘点状态任务（OPEN/COUNTING/COUNTED）')

        # ---------- T51 / T52 / T53 差异页工具条 ----------
        if posted:
            goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % posted['id'], 8)
            check('T51 工具条三按钮', pg.locator('.tools .tbtn').count() == 3, 'btns=%d' % pg.locator('.tools .tbtn').count())
            shot(pg, '51-diff-toolbar', '差异页工具条（导出/完整导出/打印）')
            check('T51 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            # 规格 §10.2 要求「打印工具条**与打印区**」都要有手机视口截图。
            # 打印区在屏幕上 display:none（只属于 print 媒体），故临时注入样式强制显形来证明「分区与列数」；
            # A4 几何仍由 Task 16 基线承担，这张图只证明入口与分区存在。
            pg.add_style_tag(content='.st-print{display:block !important} .st-screen{display:none !important}')
            time.sleep(1)
            check('T51b 打印区九列差异表 + 未盘清单 + 页脚齐备（强制显形后）',
                  pg.locator('.st-print .p-tbl thead th').count() == 9 and pg.locator('.st-print .p-foot').count() == 1,
                  'ths=%d foot=%d' % (pg.locator('.st-print .p-tbl thead th').count(),
                                      pg.locator('.st-print .p-foot').count()))
            shot(pg, '51b-print-region', '打印区（屏幕强制显形：任务头/四宫格/差异表/未盘清单/页脚）')
            check('T51b 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            with pg.expect_download(timeout=15000) as dl:
                pg.locator('.tools .tbtn').nth(0).click()
            name = dl.value.suggested_filename
            check('T52 当前视图导出真实落盘', name.startswith('stocktake-') and name.endswith('.csv'), name)
            time.sleep(0.6)
            shot(pg, '52-export-toast', '导出落盘提示')

            pg.locator('.tools .tbtn').nth(1).click()
            time.sleep(2)
            check('T53 完整导出动作面板四项 + 取消', pg.locator('.kinds .krow').count() >= 5, 'rows=%d' % pg.locator('.kinds .krow').count())
            shot(pg, '53-export-kinds', '完整导出类型面板（打印入口同屏可见）')
            check('T53 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        else:
            skip('T51/T52/T53 差异页', '无已过账任务')

        # 清理：取消本次创建的临时草稿
        if created:
            gql(pg, 'mutation($id: ID!){ cancelStocktakeTask(taskId:$id){ id state } }', {'id': created})
            check('临时草稿已取消（不留残留）', True, 'id=%s' % created)
        b.close()

    print('\n===== 手机视口截图回归：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 与真实 DOM 对齐（必须实测，不许猜类名）**

脚本里的 `.tcard`（看板任务卡，已按 `src/components/stocktake/TaskCard.vue` 实测根类名 `tcard` 写死）、`.kinds .krow`、`.tools .tbtn`、`.stats .seg .sg`、`.tabs .tb`、`.footnote` 取自 Task 12–15 的模板类名与 `index.vue` 现状。

Run: `python _e2e/_verify_stocktake_ops_e2e.py`
先跑一遍看 `T46 触底后条目不减` 的 `before/after` —— 若为 0，说明该选择器在当前 DOM 下取不到任务卡（模板类名可能被改），打开 `index.vue` / `TaskCard.vue` 核对真实类名改掉再跑。**只允许改选择器，不许放宽断言。**

- [ ] **Step 3: 正式跑 + 收图**

Run: `npm run test:e2e:stocktake`
Expected: `PASS`；`docs/webadmin-bugfix-manual/assets/` 下出现
`stocktake-ops-46-pagination.png` / `47-draft-detail.png` / `48-new-draft-buttons.png` / `49-stats-by-bin.png` / `50-stats-by-counter.png` / `51-diff-toolbar.png` / `51b-print-region.png` / `52-export-toast.png` / `53-export-kinds.png`（缺草稿时的 T47/T48 → SKIP，原因写在输出里）。
逐张肉眼确认：**手机竖版、无横向滚动、无错位/空白页**。

- [ ] **Step 4: 提交**

```bash
git add _e2e/_verify_stocktake_ops_e2e.py docs/webadmin-bugfix-manual/assets/stocktake-ops-4*.png docs/webadmin-bugfix-manual/assets/stocktake-ops-5*.png
git commit -m "test(stocktake): T46-T53 手机视口截图回归与证据图"
```

## Task 19: 手册、线上用户手册、部署与偏差记录

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`（新增一章，含 Task 18 截图与线上复验记录）
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`（线上用户手册新增 op-39）
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_manual_docs.py`
- Modify: 本计划文件末尾「偏差说明区」（回填实测值）

- [ ] **Step 1: 修复手册新增一章**

在 `webadmin-bugfix-manual.html` 的目录后追加 `<section id="stocktake-ops">`，标题 `16.9.8 盘库运营增强：分页 / 草稿 / 统计 / 导出 / 打印`，内容按下列小标题逐条写实（每条都要有截图或命令）：
1. 变更清单（后端 4 个入口 + 前端 3 页 + 打印样式 + 门禁脚本）。
2. 分页行为：`已加载 x / 共 y 条` 语义、触底追加、下拉刷新回第 1 页；贴 `stocktake-ops-46-pagination.png`。
3. 草稿：`存为草稿` → `草稿` 页签可见 → 详情「编辑范围 / 发布任务」；贴 `47/48` 两张图（SKIP 时写明原因与"待有草稿任务时补"）。
4. 统计：按库位 / 按盘点人两张表的列义与「只反映作业量」口径；贴 `49/50`。
5. 导出：当前视图（前端即时落盘）vs 完整导出（后端 4 种 kind、BOM、20000 行截断）；贴 `51/52/53`。
6. 打印：`Ctrl/Cmd+P` 走浏览器打印；打印版式契约（A4 纵向、边距 12/12/14mm、内容 186×271mm、固定列宽、续页表头重复、无页码）与「受控渲染像素级一致 / 跨机降级 / 物理打印机只保证几何与分页」三层承诺；贴 `51b-print-region.png`（打印区强制显形，证明分区与九列），并引用 Task 16 基线路径。
7. 回归门禁：`npm run test:smoke:live` / `test:e2e:stocktake` / `verify:manual` / `verify:print` 的用途、退出码语义（0/1/2）。
8. 线上复验记录：日期、命令、结论、SKIP 项（照实写）。

- [ ] **Step 2: 线上用户手册新增 op-39**

在 `src/static/manual/index.html` 现有 `op-38` 之后追加 `op-39`（用户向、不写内部术语）：看板分页与已结束筛选、草稿先存后发、统计看作业量、导出 CSV（Excel 打开中文不乱码）、打印盘点结果单。截图引用 `assets/stocktake-ops-51-diff-toolbar.png` 等（路径与线上静态目录一致）。

- [ ] **Step 3: 新建 `_e2e/_verify_manual_docs.py`**

```python
# -*- coding: utf-8 -*-
"""交付文档门禁（规格 §11）：修复手册章节 / 线上手册 op-39 / 截图落盘 三件事可验证。

用法：python _e2e/_verify_manual_docs.py
环境变量：WA_MANUAL_URL（默认 https://e.joho.cn/guanli/static/manual/index.html）
退出码：0 = 通过；1 = 失败；2 = 环境不可用
"""
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / 'docs' / 'webadmin-bugfix-manual' / 'webadmin-bugfix-manual.html'
USER_MANUAL = ROOT / 'src' / 'static' / 'manual' / 'index.html'
ASSETS = ROOT / 'docs' / 'webadmin-bugfix-manual' / 'assets'
PLAN = ROOT / 'docs' / 'superpowers' / 'plans' / '2026-09-25-stocktake-ops-enhancement-plan.md'
URL = os.environ.get('WA_MANUAL_URL', 'https://e.joho.cn/guanli/static/manual/index.html')
SHOTS = ['stocktake-ops-46-pagination.png', 'stocktake-ops-51-diff-toolbar.png',
         'stocktake-ops-51b-print-region.png', 'stocktake-ops-53-export-kinds.png']

FAILS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def main():
    if not FIX.exists() or not USER_MANUAL.exists():
        print('ENV-FAIL: 手册文件缺失 %s / %s' % (FIX, USER_MANUAL))
        raise SystemExit(2)
    fix = FIX.read_text(encoding='utf-8')
    check('修复手册含盘库运营增强章', 'id="stocktake-ops"' in fix and '16.9.8' in fix)
    check('修复手册引用门禁命令', 'verify:print' in fix and 'test:e2e:stocktake' in fix)
    um = USER_MANUAL.read_text(encoding='utf-8')
    check('线上手册源文件含 op-39', 'op-39' in um)
    missing = [s for s in SHOTS if not (ASSETS / s).exists()]
    check('关键截图已落盘', not missing, str(missing))
    check('计划文件含偏差说明区', PLAN.exists() and '偏差说明区' in PLAN.read_text(encoding='utf-8'))
    imgs = re.findall(r'assets/(stocktake-ops-[0-9a-z\-]+\.png)', fix + um)
    gone = sorted({i for i in imgs if not (ASSETS / i).exists()})
    check('手册引用的截图全部存在', not gone, str(gone[:5]))
    try:
        with urllib.request.urlopen(URL, timeout=30) as r:
            body = r.read().decode('utf-8', 'ignore')
        check('线上手册已含 op-39', 'op-39' in body, URL)
    except Exception as e:  # noqa: BLE001
        check('线上手册可达', False, '%s %s' % (URL, str(e)[:120]))
    print('\n===== 文档门禁：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: 本地构建并部署前端**

Run: `npm run build:h5` → 成功
Run: `node scripts/deploy.mjs` → 按脚本提示校验通过（本地构建 → scp 产物 → 服务器解压；**不在服务器构建**）

- [ ] **Step 5: 线上复验**

Run: `npm run verify:manual`
Expected: `PASS`（线上手册含 `op-39`、截图与章节齐备）。
Run: `npm run test:smoke:live`
Expected: `PASS`（含 Task 9 新增的 5 条只读断言）。
Run: `npm run test:e2e:stocktake`
Expected: `PASS`（生产 + 无草稿时 T47/T48 记 SKIP）。
Run（本地 serve 的差异页 + 固定任务）: `python _e2e/_verify_print_baseline.py --task <taskId>`
Expected: `PASS` 或（换机/换 Chromium 版本时）结构断言 PASS + `SKIP <case> 像素比对`。

- [ ] **Step 6: 回填「偏差说明区」的实测值**

把本计划末尾偏差说明区中标着「执行时回填」的行补成实测值（`tsc` 基线报错清单、基线任务的 `id/code`、Chromium 版本、SKIP 项清单），**不许留空、不许写「无」而不给依据**。

- [ ] **Step 7: 提交并推送**

```bash
git add docs/webadmin-bugfix-manual src/static/manual/index.html _e2e/_verify_manual_docs.py docs/superpowers/plans/2026-09-25-stocktake-ops-enhancement-plan.md
git commit -m "docs(stocktake): 修复手册新章 + 线上手册 op-39 + 文档门禁脚本 + 偏差回填"
git push
```

---

# 偏差说明区（与规格不一致 / 环境限制 / 自审修正）

> 纪律：计划正文不回头改；执行中发现的任何不一致**只写在这里**，逐条给依据，不虚报。

| # | 类别 | 内容 | 依据 / 处置 |
|---|---|---|---|
| D1 | 命名偏差 | 规格 §6.1 写 `StocktakeTaskListOptions`，真实 SDL 类型名是 `StocktakeTaskOptionsInput` | Task 2 按真实名实现，并已在 Task 2 Step 1 显式标注；不改规格正文 |
| D2 | 实体约束 | `StocktakeTask.binModeAtCreate` 是 not-nullable varchar，草稿期无法存 `null` | 草稿期写空串 `''`，发布时写入当时渠道档位（Task 6） |
| D3 | 参数归属 | `autoSplitByZone` 原是顶层入参，草稿发布时需还原 | 同时写进 `scopeJson`；顶层字段保留仅为 SDL 兼容（Task 6/10） |
| D4 | 列语义收窄 | 规格 §7.4 的前两列「库位编码 / 库位」实现为 `targetBinCode` / `targetZoneCode` | `StorageBin` 只有 `code`（无名称字段）、`StorageZone.name` 本轮未纳入 SDL；两列承载「库位编码 + 库区编码」（Task 3/7/15） |
| D5 | 环境缺失 | 本机无任何 PDF 解析/光栅化库（`pypdf` / `PyPDF2` / `pypdfium2` / `fitz` 全缺） | 规格 §7.5 的「PDF 文本可复制」断言降级为 **DOM 文本断言** + PDF `/MediaBox` 与页数结构断言；逐页 PNG 由元素截图 + 271mm 切片得到（Task 16）。`SKIP: PDF 文本抽取` |
| D6 | 断言降级 | 续页表头重复无法在无 PDF 光栅化时做逐页像素比对 | 断言机制（`thead` computed 为 `table-header-group`）+ PDF 页数；`SKIP: 续页表头像素`（Task 16） |
| D7 | 规格扩展 | 未盘清单列宽（30 / 138 / 18mm）规格 §7.5 未定义 | 本计划新增固定分配，合计 186mm，满足单位纪律（Task 15） |
| D8 | 规格扩展 | 打印页脚「任务号 / 打印时间」两个标签词条 | §7.5 只写「任务号 / 打印时间」，词条键名为本计划新增（Task 11B/15） |
| D9 | 自审修正 | Task 14 的 variance CSV 第 2 列原写死空串 `''`，与后端 Task 7 的 `targetZoneCode` 不一致 | 自审时已改为 `r.targetZoneCode || ''`（执行前修正，非执行期偏差） |
| D10 | 计划补全 | 自审发现 Task 12–15 引用的 i18n 词条没有落点、前端缺 `targetZoneCode` 请求字段 | 新增 `Task 11B`（词条）与 `Task 10 Step 1b`（字段），属**执行前**补任务 |
| D11 | 既有基线（前端，已回填） | 前端类型检查的既有报错清单 | 本仓**未装 vue-tsc**、`package.json` 也无 type-check 脚本，故按计划的后备命令改用 `npx tsc --noEmit -p tsconfig.json`。**实测基线 = 24 条**（Task 10 由执行者与审查者**各独立跑一次**，结果逐条一致）：`apis/coupon.ts(144,30)` TS2345；`apis/product.ts(584,24)(587,20)` TS2304 + `(587,30)` TS7006；`utils/print/templates/{batch-overview,parcel-label,picking-list,shipping-note}.ts` 各 2 条 TS5097；`utils/print/templates/templates.spec.ts` 6 条（2×TS2307 + 4×TS5097）；`utils/scanner.ts(223,52)(223,71)(228,30)` TS2339（`MediaTrackCapabilities.focusMode/focusDistance`）；`utils/stocktake-grid.spec.ts` 3 条（2×TS2307 + 1×TS5097）。上述文件均**早于** Task 10 存在（`git cat-file -e <Task 9 HEAD>` 已核）。`apis/stocktake.ts` **0 条** → Task 10 判据满足。**判读口径**：前端类型检查的通过基线是「除这 24 条外零新增」，不得据此放宽 Task 10 及之后任何任务的断言 |
| D12 | 已回填（结论：基线未能录制） | `diff-a4` / `big-a4` 基线钉住的任务 `id` / `code` / 行数，以及录制时的 Chromium 版本 | **基线未录制**（根因见 D41）：生产 `t2` 渠道 21 条任务全部 `CANCELLED`、`diff.rows` **全部为 0**、无 POSTED 任务；`--task 17`（`code=TK20260924-017`，`expected=22` / `counted=0` / `rows=0` / `uncountedLines=22`）是数据最全的一条，仍**无差异行** → `big-a4` 注入源为空（`inject_big=-2`）。故 `_e2e/baselines/print/` **未生成**、`env.json` 不存在，计划 Step 6 的 `git add _e2e/baselines/print` **未执行**（未伪造空基线）。**受控渲染指纹（本次实跑环境，供将来录基线时逐键对表）**：Chromium **151.0.7922.34**（`navigator.userAgent` = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36`）、playwright(python) **1.62.0**（注：脚本里 `playwright.__version__` 实测为空串，指纹字段取不到值，故以此处为准）、viewport `794x1123` @dpr2、`content_mm=[186,271]`、`page_h_dev=2049`、`print_at='2026-09-25 10:00'` |
| D13 | 已验证（已回填） | 草稿截图（T47/T48）在「生产只读 + 无现成草稿」下的 SKIP 记录，或本地/非生产环境补测结论 | **生产侧仍 SKIP，本地可写后端已补测**。① **生产**：Task 19 实跑 `npm run test:e2e:stocktake`（生产、未设任何 `WA_*`、`WA_SHOT_ALLOW_WRITE` 关闭）输出 `INFO 渠道 t2（loc=3）任务 totalItems=21；POSTED=None；可盘点=None；DRAFT=None` 与 `SKIP T47/T48 草稿相关 无 DRAFT 任务且未开 WA_SHOT_ALLOW_WRITE（生产只读）`（同一轮 `T49/T50`、`T51/T52/T53` 亦 SKIP，汇总 `PASS（失败 0 / SKIP 3）`）——未伪造。② **非生产补测（结论已拿到）**：Task 18 在**本地可写后端**（`http://localhost:3000/admin-api`，本机 Postgres `vendure` 库）跑出两张**真实草稿截图**：`stocktake-ops-47-draft-detail.png`（72736 B）/ `stocktake-ops-48-new-draft-buttons.png`（113871 B），均为 780×1688 手机视口；环境与实跑命令见 **D45**、截图 ↔ 任务 id 映射见 **D51**（对应本轮新建 DRAFT `id=34 / TK20260925-012`，跑完已取消）。③ 两图已随 Task 19 进入修复手册 16.9.8（`assets/`）与线上手册 op-39（`src/static/manual/shots/`），并由 `npm run verify:manual` 断言落盘 |
| D14 | 风险预留 | uni-app H5 模板若不吃原生 `<table>`，续页表头机制失效 | Task 15 Step 1 已给出 `v-html` 兜底代码；若走兜底，回填本条并说明样式命中情况 |
| D15 | 既有基线（后端） | 后端 `npm test` 存在与本次改动**无关**的既有失败套件：`src/inventory/virtual-physical-stock.service.spec.ts` 抛 `ColumnTypeUndefinedError: Column type for StockReservationItemEntity#reservationId is not defined`（该实体 `@Column()` 未写类型，vitest 侧拿不到装饰器元数据） | 执行 Task 3 时实测复现：单跑 `npx vitest --config vitest.config.mts --run src/inventory/virtual-physical-stock.service.spec.ts` 同样失败（`Test Files 1 failed / Tests no tests`），与盘库改动无关。**判读口径**：后端 `npm test` 的通过基线是「除该套件外全绿」（本轮回填时实测 235 passed / 36 个套件通过），不得据此放宽任何盘库断言，也不在本轮顺手修这个既有问题 |
| D16 | 计划内部矛盾（执行期发现） | Task 4 的**实现**与**用例 1** 各自偏离规格 §7.3：① 实现把 `isExtra` 行也累加进 `countedLines`，而 §7.3 写死 `countedLines = 组内 !isExtra 且 countedQty !== null 的行数`；② 用例 1 断言「未归位组」`expectedLines = 0`，但该组那行 `line({ countedQty: 3 })` 是 `!isExtra`，按 §7.3 应为 `1` —— 二者不能同时满足，且计划给出的两段代码互不自洽 | **一律以规格 §7.3 为准**（执行 Task 4 时由执行者按此修正，计划正文不改）：① 实现的 `isExtra` 分支改为 `g.extraLines += 1; continue;`（不再动 `countedLines`）；② 用例 1 未归位组期望改为 `[null, null, 1, 1, 0, 0]`。其余用例（aggregateByBin 用例 2、aggregateByCounter 3 条）经验算与 §7.3 一致，不动。**已执行**：commit `b88adfed1`，`npm test -- stocktake-ops` 8/8 全绿 |
| D17 | 计划笔误（执行前发现） | Task 5 的 `toCsv` 用例 3 期望串字段数算错：输入 `[[null, undefined, true, false, new Date(...)]]` 是 **5** 格，期望却写成 `'\uFEFF,,,,是,否,ISO\r\n'`（**6** 格，多一个空字段），照抄必然失败 | 按规格 §7.4 第 4 条，正确期望为 `'\uFEFF,,是,否,2026-09-25T02:00:00.000Z\r\n'`。执行 Task 5 时直接用正确值，计划正文不改（其余 3 条用例经验算与 §7.4 一致）。**已执行**：commit `ec38f2ada`，实测 `stocktake-ops.spec.ts:92` 落盘即该正确值，12/12 全绿 |
| D18 | 计划笔误（执行前发现） | Task 5 Step 4 写「Expected: PASS（11 个用例全绿）」，但 Task 4 交付的 `stocktake-ops.spec.ts` 实测为 **8** 个用例（parseStateFilter 3 + aggregateByBin 2 + aggregateByCounter 3），Task 5 再加 4 个 = **12** | 执行 Task 5 的通过判据为 **12 passed**（不是 11）。计划正文不改。**已执行**：commit `ec38f2ada`，`npm test -- stocktake-ops` 实测 12 passed / 0 failed |
| D19 | 计划缺陷（执行前发现，会导致生产回归） | Task 6 的 `createTask` 把 `scopeJson` 改成存**原始 `input.scope`**，而 `materializeTask` 只读 `raw.autoSplitByZone`；但**现网前端把开关传在顶层**（`index.vue:280` `autoSplitByZone: showZone.value ? form.value.autoSplitByZone : false`，**不圈库区时恒为 `false`**），`scope` 内没有该字段。按计划原样实现后 `raw.autoSplitByZone` 为 `undefined` → `!== false` → **true**，在 `binMode` 为 `zone`/`bin` 的渠道下，默认建任务的 `false`（整仓单盘次）会回归成按库区拆盘次。计划第 703 行「直接创建的语义不变」只在「顶层字段被归并进 scope」时才成立，而该归并此前只排在 Task 10（前端）——Task 8 后端上线到 Task 10 前端上线之间存在回归窗口 | **补一行 SDL 兼容归并**（使计划自称的「语义不变」真正成立）：在 `createTask` 的 `withTransaction` 之前计算 `const scope: any = { ...(input.scope || {}) }; if (scope.autoSplitByZone === undefined && input.autoSplitByZone !== undefined) scope.autoSplitByZone = input.autoSplitByZone !== false;` 并把 `JSON.stringify(scope)` 用于 DRAFT 与 OPEN 两个分支（与 Task 6 `updateTask` 第 697 行的归并写法同源）。计划正文不改。**已执行**：commit `b10f7a159`，`stocktake.service.ts:312-318` 落地该归并，两个分支均改用 `scopeJson` |
| D20 | 语义变化（可接受，用户可见） | 同上改动导致 `scopeJson` 持久化内容变化：旧实现存的是**已把 `categoryIds` 展开成 `variantIds`** 的 scope，新实现存**原始 scope**（`materializeTask` 在物化时再展开）。前端 `scopeBadges()` 按 `variantIds.length` 出 `V:N` 徽标，故「按分类圈选」的任务徽标 V 计数会从「展开后的变体数」变为「显式勾选的变体数」 | 属**显示口径更贴近用户意图**的变化（`buildExpected` 只消费 `scope.zones` / `scope.variantIds` / `scope.includeZeroBook`，不消费 `categoryIds`，物化结果不变）；`task.vue:80-84` 仅用于展示。如实记录，不额外处理 |
| D21 | 构建产物节奏 | Task 4 / Task 5 只改了 `src/stocktake/stocktake-math.ts` 未重建 `lib/`（按计划 Task 5 的说明「本任务不产出 lib，Task 8 统一构建」），因此 `b88adfed1` / `ec38f2ada` 两个提交里的 `lib/` 相对 src 是**滞后的** | 无实际影响（部署只认 Task 8 从 HEAD 全新构建的 `lib/`）。Task 6 Step 4 的 `npm run build` 已把 `lib/src/stocktake/stocktake-math.*` 一并同步进 `b10f7a159`，HEAD 的 src 与 lib 现为一致。如实记录 |
| D22 | 判据偏差（已回填） | Task 6 Step 4 写「Expected: PASS（32 + 11 条全绿）」，与实测不符 | 实测 `Test Files 1 failed | 36 passed (37)`、`Tests 244 passed (244)`，唯一失败套件为 D15 的既有基线 `virtual-physical-stock.service.spec.ts`。判读口径同 D15（除该套件外全绿） |
| D23 | 口径歧义（规格未写明，**不改实现**，如实记录待裁决） | 规格 §7.3 只写死了**组内**口径（`aggregateByBin.countedLines = 组内 !isExtra 且 countedQty !== null`），**未写明** `StocktakeStats` 顶层 `expectedLines` / `countedLines` 的公式。计划 Task 7 的 `statsOf` 取 `expectedLines = !isExtra 行数`（与 §7.3 组内口径一致），但 `countedLines = countedQty !== null 的行数`（**含 isExtra**）——两半口径不同源；若消费方按 `expectedLines - countedLines` 推算「未盘」会出现负值 | **判定依据（非规格原文，属推论）**：① §7.3 节标题即「口径写死」，顶层字段属同一「统计」特性；② 同一页面并排的既有 `buildTaskView` 用 `countedTotal = !isExtra && countedQty !== null`（`stocktake.service.ts:118`），且计划里 `expectedLines` 已按该口径写；③ 顶层只有 `expectedLines`/`countedLines` 两字段、无 `uncountedLines`/`extraLines`，形态就是「进度对」。**倾向口径**：`countedLines` 应加 `!isExtra`。但因规格无原文可依，**本轮不改实现**（不擅自发明口径），仅记录；实际影响面：前端 Task 13 只渲染 `byBin`/`byCounter` 两张表、不显示顶层值，Task 9 冒烟只断言字段存在不断言值，故不影响本轮交付。如需统一，请在后续任务中裁决 |
| D24 | 口径差异（跟单点，如实记录） | 导出文件名时间戳的时区不一致：后端 Task 7 用 `new Date().toISOString().slice(0,16)`（**UTC**），前端 Task 14 的 `stampName()` 用 `getFullYear/getHours`（**本地时区**）。规格 §7.4 只规定 `{yyyymmddHHmm}`、未规定时区，两者都「合规」但同一用户先后用「导出 CSV」与「完整导出」会拿到相差时区偏移的两个文件名 | 仅影响文件名可读性，不影响 CSV 内容与列定义。本轮不改（改哪一端都需要先确定「以服务端时间还是用户本地时间」的策略，属规格未定义项）。**实测证据**（Task 9 线上冒烟）：后端返回 `filename=stocktake-TK20260925-002-by_bin-202609250529.csv`，而该次冒烟提交时间为 `2026-09-25 13:30:29 +0800` → 文件名为 UTC 05:29，**比本地时间早 8 小时**，证实上述差异 |
| D25 | 执行调整（已执行） | Task 8 Step 2 要求单独提交 `build(cjk-plugin): 重建 lib 以收录盘库运营增强`，但 Task 6/7 已各自 `npm run build` 并随提交带上 `lib/`，Task 8 Step 1 的重建是**空改动**（`git status` 干净），无法成提交 | 跳过该空提交，**不伪造**。Task 8 的实际推送为一次性推送 7 个提交 `ad084e016..2a3a64e9a`（`dd402db80` → `2a3a64e9a`）。**已执行** |
| D26 | 启动窗口（已实测） | Task 8 Step 3 重启后 `pm2 restart vendure` 到 admin-api 可用之间有启动窗口：首次 `curl` 得 **502 Bad Gateway（openresty）** | 属正常启动期（Vendure `synchronize: true` 建表同步耗时），非故障。`pm2 restart` 后约 **55 秒** 复测得 `admin-api HTTP=200`，`pm2 list` 显示 `vendure online`、uptime 58s。**新 schema 已生效的独立证据**（免鉴权探测，字段存在则报 FORBIDDEN、不存在则报 Cannot query field）：`{ stocktakeStats(taskId: 1) { expectedLines } }` → `FORBIDDEN / path: stocktakeStats`；`mutation { openStocktakeTask(taskId: 1) { id } }` → `FORBIDDEN / path: openStocktakeTask`。两者均为鉴权错而非 schema 错 → **结论：部署健康** |
| D27 | 计划缺陷（执行期发现，会导致运行时请求被拒） | 计划 **Task 10 Step 3**、**Task 12 `buildScope()`**（第 1625 行）、**Task 18 第 3059 行**都把 `autoSplitByZone` 写进 `scope`，但真实 SDL 是 `input StocktakeScopeInput { zones: [Int!], categoryIds: [Int!], variantIds: [Int!], includeZeroBook: Boolean }`（`plugin.ts:1717`，随 `2a3a64e9a` 已部署到生产）——**没有该字段**；Task 6 Step 2 的 SDL 片段也只给 `StocktakeTaskInput` 加了 `state`，从未扩过 `StocktakeScopeInput`。graphql-js 对输入对象的未定义字段是**硬校验**，前端一旦按计划把该字段塞进 `scope`，`createStocktakeTask` / `updateStocktakeTask` 会直接被拒（`Field "autoSplitByZone" is not defined by type "StocktakeScopeInput"`）——即「建草稿 / 建任务 / 存草稿」三条路径全废 | **判定依据**：① 权威契约 = 已部署 SDL + 主设计（`autoSplitByZone` 本来就是 `StocktakeTaskInput` 顶层入参，现网旧前端 `index.vue:280` 也传在顶层）；② 后端 `stocktake.service.ts:318-324`（createTask）与第 697 行（updateTask）**已经**把顶层开关归并进 `scopeJson`，因此「顶层传参」即可满足计划 D3 要求的「写进 scopeJson、草稿发布时还原」，**无需动 SDL、无需二次部署生产**。**处置（前端单侧归一，生产后端零改动；由 Task 10 执行者上报、审查者核实后授权）**：在 `apis/stocktake.ts` 的 `createStocktakeTask` / `updateStocktakeTask` 里把 `scope` 归一为「只透传 4 个合法字段」，并把调用方混在 `scope` 里的 `autoSplitByZone` **上提到顶层**——由此 **Task 12 / Task 13 的计划代码可原样保留**（`buildScope()` 继续产出带该开关的 `scope`，无需改计划）。计划正文不改。**已执行**：commit `c730211`，`npx tsc --noEmit -p tsconfig.json` 复跑仍为 24 条既有基线、`apis/stocktake.ts` 0 条 |
| D28 | 已回填（承接 D27，同因；**已修脚本**+注释） | Task 18 第 3059 行的草稿截图脚本用**裸 HTTP body** 直接 POST，绕过了 `apis/stocktake.ts` 的归一逻辑，其 `scope` 里同样带了 `autoSplitByZone` | 执行 Task 18 时把该字段从 `scope` **上提到顶层** `autoSplitByZone`（与 `createStocktakeTask` 归一逻辑同源），计划正文不改。**实测（已建草稿成功）**：`创建临时草稿（仅任务头，不动库存）` → `OK`，`code=TK20260925-012`（id 34）；introspection 证据（`input StocktakeScopeInput { zones categoryIds variantIds includeZeroBook }` 无该字段、顶层 `StocktakeTaskInput` 含该字段）见 **D46**；两图产物与任务 id 映射见 **D51 / D13**。Task 19 复跑**生产**路径时该分支被 SKIP（生产无 DRAFT，见 D13①），故生产侧不重复验证 |
| D29 | 路径偏差（执行期发现，影响每个前端任务的 git 命令） | 计划里**所有**前端 git 命令与「Files」路径都写成相对 `web-admin`（如 `git add src/apis/stocktake.ts`、`git add src/locale/zh-Hans.json`），但**真实 git 仓库根是 `d:\zhao\vshop`**（`git rev-parse --show-toplevel` = `D:/zhao/vshop`），`web-admin` 只是其子目录——照抄计划的 `git add` 会因路径不存在直接失败 | 处置：前端任务暂存/提交路径统一加 `web-admin/` 前缀，提交信息不变。另：Task 11B Step 5 计划提交信息原文为「补分页/草稿/统计/导出/打印词条（zh+en 同步）」，实际执行用了同义的「补齐 Task 12-15 所需 i18n 词条（zh-Hans/en 同步）」。**已执行**：前端 5 个提交（`8316b82`/`6dbe818`/`c730211`/`12d727e`/`e667e53`）均按 `web-admin/` 前缀暂存 |
| D30 | 验证记录（Task 11 / 11B，非偏差） | — | 审查者独立复跑：`npx tsc --noEmit -p tsconfig.json` = **24 条既有基线**、`utils/stocktake-grid.ts` **0 条**；`node --test src/utils/stocktake-grid.spec.ts` = **15 tests / 15 pass / 0 fail**；i18n 侧 zh/en 各 **+52 key、lost=0**，两份 key 集合完全一致（2304 = 2304），`JSON.parse` 通过。commit `12d727e` / `e667e53` |
| D31 | 验证记录（Task 12，非偏差） | — | 审查者独立复核 commit `bce2249`：`git show` 逐段核对 `index.vue` 增删——删除内联表单段与 `onCreate`/`onFormLocChange`/`toggleZone`/`toggleCat`/`parseVariantIds` 及专属 ref，新增 DRAFT 页签、`serverStateFilter()`、`reload()`/`loadMore()`、`onReachBottom` 与 `footnote`/`more` 脚注。`TaskFormSheet.vue` 经 `import { createStocktakeTask, updateStocktakeTask } from '../../apis/stocktake'` **走 API 层**（故 D27 的 scope 归一仍生效），第 171 行 `buildScope()` 保留 `autoSplitByZone`（满足 D27），`emit('saved', task, kind)` 与父页 `@saved="onFormSaved"` 签名一致。**独立复跑**：`npx tsc --noEmit -p tsconfig.json` = 24 条既有基线（两文件 0 条）；`npm run build:h5` = `DONE Build complete.`（exit 0，仅 Sass legacy-js-api 弃用警告）；`node --test src/utils/stocktake-grid.spec.ts` = 15 pass。页签集合 = `all / DRAFT / COUNTING / COUNTED / closed`，`closed` 下发 `states:['POSTED','CANCELLED']`、`all` 不下发、其余下发单值 `state`（与规格 §3.1 一致）。TaskFormSheet 引用的 i18n 键全部存在（含既有 `stocktake.board.loadFailed`） |
| D32 | 执行期观察（Task 12，需后续任务知悉） | ① 计划给脚注加了 `class="footnote"` 却**没给对应样式**，当前按默认样式渲染；② `web-admin/dist` 是 **git 跟踪的构建产物**（499 个文件），中间任务跑 `build:h5` 会弄脏工作区（本次实测：98 删除 + 1 修改 + 99 新增） | ① Task 18 打手机视图（390×844）截图时须确认该脚注视觉效果是否可接受，不可接受再按需补样式（计划未给，不自造）；② 因此**严禁 `git add -A` / `git add .`**（会误纳入 dist 与临时产物），dist 由 Task 19 统一 `build:h5` 后单独提交。**已记录**：Task 12 提交仅含 2 个源文件（未纳入 dist） |
| D33 | 计划笔误（执行期发现） | Task 13 Step 2 的 `onOpenTask` 写 `locale.t('stocktake.task.publishDone').replace('{waves}', String(t.waveCount))`，但实际词条（Task 11B 已落地，`zh-Hans.json:1407` / `en.json:1407`）为 `"已发布 {code}（{waves} 个盘次）"` / `"Published {code} ({waves} waves)"`——**含 `{code}` 与 `{waves}` 两个占位符**；照抄只会替换后者，UI 上残留字面量 `{code}` | 处置：代码内**两个占位符都替换**（`...replace('{code}', String(t.code)).replace('{waves}', String(t.waveCount))`），计划正文不改、i18n 词条不改（词条本身无错）。**已执行**：commit `9ea9614`，`task.vue:211` 即为双替换写法 |
| D34 | 验证记录（Task 13，非偏差）+ 一处走查延后 | 计划 Step 4 后半要求本地走查「新建草稿任务 → 详情显示草稿动作条 → 发布 → 出现盘次与页签 → 打开统计切两表」 | **走查延后**：本环境无可写后端实例（生产按纪律只读，不允许建任务/发布），故**未执行**该交互走查，也未起 dev server；如实记录，交由 **Task 18 的 e2e（T46–T53 + T51b 手机视口截图）** 覆盖。**审查者独立复核** commit `9ea9614`：`git show` 与计划 Step 1–3 逐段一致（页签条插于信息卡后、盘次块包进 `v-if="view === 'waves'"`、统计块 `v-if="view === 'stats'"` 含 byBin/byCounter 两表与 `scopeNote`、savebar 按 `task.state === 'DRAFT'` 分支、`draftHint`/`notReady` 互斥提示、`TaskFormSheet` 绑 `editVisible`+`mode="edit"`+`:draft="task"`、`reload()` 内新增 `stats.value = null`、`openStats`/`binLabel`/`onOpenTask`/`onDraftSaved` 与样式段齐备），暂存区仅 1 个源文件（未纳入 dist）。**独立复跑**：`npx tsc --noEmit -p tsconfig.json` = **24 条既有基线**、`stocktake/task.vue` **0 条**；`node --test src/utils/stocktake-grid.spec.ts` = **15 tests / 15 pass / 0 fail**；`npm run build:h5` = `DONE Build complete.`（exit 0，仅 Sass legacy-js-api 弃用警告） |
| D35 | 计划与规格不一致（执行期发现，**未实现，待裁决**） | 规格 §8.4 末条要求「非 H5 平台（条件编译）**隐藏导出与打印按钮**，并给出『请使用完整导出』提示」；计划 Task 14 Step 1 的模板注释也自称「导出与打印（非 H5 平台隐藏，见 §8.4）」，**但计划给出的模板代码里没有任何条件编译**（`<!-- #ifdef H5 -->` / `#ifndef H5` 均无），且 Task 11B 补齐的 52 个 i18n key 里**没有**该提示词条 | **处置：按计划代码原样实现（不加条件编译），如实记录待裁决**。依据：① 本轮交付端只有 H5——`npm run build:h5` 是唯一构建门禁、部署产物就是 H5 dist，非 H5 端不在本轮交付范围，该缺口对交付物**零功能影响**；② 规格该句**自身语义不自洽**——既说「隐藏导出与打印按钮」又让用户「请使用完整导出」，而「完整导出」与「导出 CSV」同为导出按钮，且三按钮全部依赖 DOM API（`Blob` + `a[download]` + `window.print`），照做必须先裁决「究竟隐藏哪几个」；③ 补提示需新增 i18n 键、改动两份 locale 文件，超出本任务声明的 Files 范围。**影响面**：仅影响未来若编译小程序/App 端时的按钮可用性。**未实现**，如需补齐请裁决后再做 |
| D36 | 验证记录（Task 14，非偏差）+ 一处走查延后 | 计划 Step 4 后半要求本地走查「导出 CSV 立即下载 `stocktake-xxx-variance-*.csv`、完整导出选 by_bin 并核对中文列名不乱码、空差异提示『无数据可导出』」 | **走查延后**：本环境无可写后端（生产按纪律只读），未执行该三处点击走查、未起 dev server；如实记录，交由 Task 18 的 e2e 覆盖。**审查者独立复核** commit `3ec2732`：`git show` 与计划 Step 1–3 一致（工具条三按钮插于四宫格前、`kinds` 动作面板 `v-if="kindVisible"` 含 4 个 kind + 取消行、apis 那条 import **整行替换**为含 `stocktakeExport`/`StocktakeExportFile`/`StocktakeTask` 的单行并新增 `utils/stocktake-grid` 一行导入、`loadDiff` 回填 `taskCode`/`printTask`（`printTask` 仅声明待 Task 15 消费，`tsconfig` 无 `noUnusedLocals` 故无报错）、`saveText`/`stampName`/`exportCurrentView`/`exportFull`/`pickKind`/`onPrint` 逐字照抄、样式两段齐备），暂存区仅 1 个源文件（未纳入 dist）。**列序对齐自检（执行者给出、审查者复核代码通过）**：`VARIANCE_CSV_COLUMNS` 10 列（库位编码/库位/变体 SKU/变体名称/盘点数/快照账面/过账账面/差异/盘盈/账面变动）与 `exportCurrentView` 的 `body` 十项**逐位对齐**；`toCsv` 内部已带 BOM，调用处未重复拼 `\uFEFF`。**独立复跑**：`npx tsc --noEmit -p tsconfig.json` = **24 条既有基线**、`stocktake/diff.vue` **0 条**；`node --test src/utils/stocktake-grid.spec.ts` = **15 tests / 15 pass / 0 fail**；`npm run build:h5` = `DONE Build complete.`（exit 0） |
| D37 | 框架行为导致计划代码失效（执行期发现，**已修复**，涉及计划外第 2 个文件） | 计划 Task 15 Step 3 要求「在 `<style lang="scss" scoped>` 之后追加一个**不带 `scoped`** 的打印样式块（scoped 会改写选择器，`v-html` 与 `@page` 都不吃它）」。**实测：uni-app H5 会给除 `App.vue` 外的所有 SFC 的每个 `<style>` 无条件补 `scoped`**（`node_modules/@dcloudio/uni-cli-shared/dist/vite/plugins/cssScoped.js` 的 `addScoped()`）。构建产物实测（`dist/build/h5/assets/diff-ItlfZuN7.css`）：`html[data-v-c7d59089],body[data-v-c7d59089]{margin:0;padding:0;background:#fff}` —— 计划里那条 `html, body { margin: 0; padding: 0; background: #fff; }` **被改写后永不命中**，而浏览器对 `body` 的默认 **8px** 外边距会叠加在 `@page` 的 12mm 版心之外，使 `width:186mm` 的 `.st-print` 溢出 186mm 版心，触发 Chromium 整页缩放 → **直接破坏 §7.5/§10.5 的像素基线** | **处置（最小修复，计划正文不改）**：把页面级打印归零搬到唯一豁免 `addScoped` 的 `src/App.vue` 全局样式块内（新增 `@media print { html, body { margin:0; padding:0; background:#fff; } }`），并把 `diff.vue` 内那条失效规则**删掉、改为一句话注释指向 `App.vue`**（避免留死代码误导）。**其余打印规则不受影响**：`.st-print/.st-screen/.p-*` 与 `table/thead/th/td` 全部由本组件渲染、都带 `data-v-*` 属性，故改写后的选择器照常命中；`@page` 是 at-rule 未被改写（产物实测 `@media print{@page{size:A4 portrait;margin:12mm 12mm 14mm}`，末位 `12mm` 被压缩器按等价值省略）。**附带结论**：计划 Step 1 提供的 **`v-html` 兜底方案在本项目不可用**（`v-html` 注入的节点拿不到 `data-v-*`，scoped 打印样式会全部不命中）——幸好原生 `<table>` 经产物验证成立，无需兜底。**已执行**：commit `01a1898`（`App.vue` + `diff.vue`，2 文件）；独立复跑 typecheck = 24 条基线（两文件 0 条）、`build:h5` = `DONE Build complete.`，且产物 `index-DHHok16B.css` 含**无 `data-v` 的** `@media print{html,body{margin:0;padding:0;background:#fff}}`（已全局生效） |
| D38 | 验证记录（Task 15，非偏差）+ 包裹范围裁定 + 走查延后 | 计划 Step 1 说把「①–⑤ 五块」包进 `.st-screen`；但 Task 14 已在四宫格前插了工具条、在 `.postbar` 后插了 `kinds` 动作面板 | ① **包裹范围裁定**：规格 §8.3 要求打印时隐藏「导航、页签与按钮」，故 `.st-screen` 实际包裹**从工具条 `<view class="tools">` 起、到 `kinds` 动作面板闭合止**（`.page` 下只剩 `.st-screen` 与 `.st-print` 两个子节点），否则打印会漏出三个按钮与浮层。② **走查延后**：计划 Step 4 的「Ctrl/Cmd+P 预览核对 5 项」需登录态 + 真实任务 id，本环境无可写后端、按纪律不连生产，**未执行**；交由 Task 16 打印基线脚本与 Task 18 e2e 覆盖（其中第 5 项「DevTools 里 `table` 真实存在」已用编译产物静态证据替代：`h("table",{class:"p-tbl"},[h("thead",...),h("th",{class:"c1"}...` 与 `colspan:"9"` 均在 `dist/build/h5/assets/pages-inventory-stocktake-diff.S3u3pzip.js` 中，`h` = `createElementVNode`）。**审查者独立复核** commit `6aa9c14`：`git show` 与计划 Step 1–3 一致（打印区 `v-if="diff"` 含任务头 `p-head`/四宫格 `p-sum`/9 列差异表 `p-tbl`（列宽 22+30+38+17+17+17+15+12+18=186mm）/未盘清单 `p-unc` 3 列（30+138+18=186mm）/页脚 `p-foot`；`import { computed, onMounted, ref }` 保留 computed；`currentStamp()` 读 `window.__STOCKTAKE_PRINT_AT__` 冻结、`onMounted` 刷新、`onPrint` 先刷新时间戳再 `window.print()`）；`printTask`/`taskCode` 各仅 1 处声明（未重复）；打印样式块（`diff.vue:456` 起）**零 `$wa-` 引用**、几何全 `mm`、字号全 `pt`。**独立复跑**：`npx tsc --noEmit -p tsconfig.json` = **24 条既有基线**、`stocktake/diff.vue` **0 条**；`node --test src/utils/stocktake-grid.spec.ts` = **15 tests / 15 pass / 0 fail**；`npm run build:h5` = `DONE Build complete.`（exit 0） |
| D39 | 计划缺陷（执行期发现，**已修脚本**，3 处） | ① `task_meta`（计划 2706–2714）的 raw fetch 只带 `Authorization`、**缺 `vendure-token`** → 后端返回 `FORBIDDEN`、`data.stocktakeTask=null` → `code` 恒为空串，于是「任务可查且已终态」恒 FAIL，且「DOM 文本含任务号」因 `'' in text` 恒真而**变成空过**（假 PASS 陷阱）；② `measure()`（计划 2594）的列宽选择器 `.st-print .p-tbl thead th` 会同时命中**差异表(9) + 未盘清单表(3) = 12** 列 → 「差异表 9 列」恒 FAIL（计划作者似假设 POSTED 任务 `uncountedCount==0` 只有一张表）；③ 溢出判定（计划 2601）拿 CSS px 的 `b.width` 直接与 `186.5`（**mm** 阈值）比较，任何 >186.5px 的元素都被判溢出 → 「无横向溢出」对任何数据恒 FAIL | 处置：**在脚本内修正这三处并加注释**（①补 `'vendure-token': localStorage.wa_channel_token`；②改为只在第一张 `.p-tbl` 内量 `thead th`；③新增 mm→px 换算 `lim = 186.5*96/25.4`），计划正文不改。**修复后实测**：「任务可查」由 FAIL 变 SKIP（`code=TK20260924-017 state=CANCELLED`）、「差异表 9 列」`cols=9`、列宽偏差 `[]`、溢出 `overflow=[] scroll=703/703`、「DOM 文本含任务号」由**空过**变为真实命中 `code=TK20260924-017`。**已执行**：commit `0041c9d` |
| D40 | 实现缺陷（Task 15 已交付代码，Task 16 验证期发现，**已修复**） | `.p-tbl`（`table-layout: fixed; width: 186mm`）配 `.p-tbl th, .p-tbl td { padding: 0.8mm 1mm }` 却**未声明 `box-sizing`** → 默认 `content-box` 使**每列实际宽 = §7.5 定值 + 2mm**，9 列合计 **203.92mm**（实测各列 23.99/31.99/39.99/18.99/18.99/18.99/16.99/13.99/19.99mm；`.st-print` `scrollWidth=771px` vs `clientWidth=703px`＝186mm）→ 打印时表格**横向超出 A4 可印区 18mm 会被裁切**；未盘清单表同因（30+138+18+6＝192mm）。违反 §7.5 | 处置：`.p-tbl th, .p-tbl td` 增加 `box-sizing: border-box`（§7.5 的列宽语义本就是「含内边距的最终列宽」），计划正文不改。**修复前后同一脚本、同一数据实跑对照**：列宽偏差 `[(1,23.99,22.0),(2,31.99,30.0),…,(9,19.99,18.0)]` → `[]`；`无横向溢出` `overflow=['p-head:703.0','p-title:703.0','p-sub:703.0',…] scroll=771/703` → `overflow=[] scroll=703/703`。**已执行**：commit `e3fe842` |
| D41 | 数据现状（阻塞，**如实记录，未伪造**） | 生产 `t2` 渠道 `stocktakeTasks` 共 21 条，**全部 `state=CANCELLED`、`countedTotal=0`、`postedAt=null`**；按 `state:"POSTED"` 查询 `totalItems=0`；逐条查 `stocktakeDiff` 得 **21 条 `rows.length` 全为 0**（`expected` 为 22 / 20 / 1，`uncountedLines` 相应 22 / 20 / 1）→ **① 没有任何 POSTED 任务；② 没有「`rows` 与 `uncountedLines` 皆空」的空态任务** | **后果（全部 SKIP，不虚报）**：`diff-a4` / `empty-a4` / `big-a4` **三个 case 基线全部无法录制**（`_e2e/baselines/print/` 未生成）；逐页像素零容差比对、`big-a4` 注入 120 行、跨 ≥3 页、计划 Step 4「基线自证 PASS」、计划 Step 5 负向验证（`.p-tbl tbody tr` 6mm→7mm）**全部 SKIP**；计划 Step 6 的 `git add _e2e/baselines/print` 未执行。**本轮负向控制改由真实数据提供**：同一脚本、同一任务（`--task 17`），在 D40 修复前跑出 4 条 FAIL（9 列/列宽/溢出/任务号空过掩盖），修复后全 OK → 证明断言对真实回归敏感（不是「永远绿」）。要想真正录制基线，需先在生产产生一个 **POSTED 且有差异行** 的任务（属写操作，本轮按纪律不做） |
| D42 | 计划外增补（**用户裁决后新增**，3 项） | 计划脚本默认 `BASE=https://e.joho.cn/guanli/`（打的是**生产旧构建**，其 `diff.vue` 里根本没有 `.st-print`，必然超时），且本机无可写后端（`localhost:3000` 无监听）；`scripts/serve-h5.mjs` 的 `/admin-api` 代理是**纯 HTTP**（`http.request`），无法反代 https 生产 | 按用户裁决「本地构建 + `/admin-api` 反代到生产（**只读**）」落地三处增补：**(a)** 新增 `WA_API_ORIGIN`——非空时注册 Playwright `page.route('**/admin-api')` → `route.fetch(url=API_ORIGIN+'/admin-api')` + `route.fulfill(response=resp)`，**只读转发**（保留原 method / headers / post body）；为空时**不注册任何路由**，面向生产的默认路径零改动。**(b)** 「任务必须 POSTED」的硬断言：`state=='POSTED'` 保持原 `check`，其它**能读到 code 的终态**降级为显式 `SKIP`（理由写进输出），`code` 为空仍 FAIL。**(c)** 无有效数据行时**拒绝写基线**（不生成空的/伪造的 `page-1.png`），并把跨页/像素断言转 SKIP；`empty-a4` 例外（空态正是其预期），改为校验 `--empty-task` 语义确实为空。**实跑命令**：`$env:WA_PRINT_BASE='http://localhost:5280/guanli/'; $env:WA_API_ORIGIN='https://e.joho.cn'; python _e2e/_verify_print_baseline.py --task 17` |
| D43 | 验证记录（Task 16，非偏差） | — | **真机实跑（本地 dist + 生产只读数据）**：`--task 17`（`TK20260924-017`）→ `===== 打印基线：PASS（失败 0 / SKIP 7）=====`，exit code **0**。逐条 OK：打印区宽度 `186.00mm`、差异表 `cols=9`、列宽偏差 `[]`、`thead`＝`table-header-group`、数据行 `break-inside=avoid`、字体栈含 `PingFang SC`、`print-color-adjust=exact`、`overflow=[] scroll=703/703`、DOM 文本含任务号 `TK20260924-017`、DOM 含「差异」「未盘」、光栅宽度 `w=1406`（期望 1406）、PDF 页数 `pdf=2 ≥ png=1`、PDF 页尺寸 `594.960 x 841.920 pt`（A4 容差内）、全程无 JS 运行时异常（`PAGEERR` 0、`console.error` 0）。7 条 SKIP 全部注明「数据不足」或「未提供 `--empty-task`」（根因见 D41）。**Step 2 自检**：`AST OK`；`--help` 正常打印 usage；缺 `--task` → `ENV-FAIL: 缺 --task（或环境变量 WA_PRINT_TASK）——基线必须钉死一个固定的历史任务 id`、exit **2**。**审查者独立复核** commit `335382d` + `0041c9d`（脚本，407 行中约 350 行逐字照抄计划，仅增补 (a)(b)(c) 与 D39 三处修正）与 `e3fe842`（样式，+3/-1）：`git show` 与本轮报告的差异清单逐条一致；`git status --short` 仅含预期文件，`dist/` 已被 `.gitignore` 排除 |
| D44 | 既有结论更新（执行期发现，供 Task 18 / 19 知悉） | D32 记录「`web-admin/dist` 是 git 跟踪的构建产物（499 个文件），中间任务跑 `build:h5` 会弄脏工作区（实测 98 删除 + 1 修改 + 99 新增）」 | 该状态**已不成立**：commit `a6aa59e chore(web-admin): 解除 dist/build/h5 跟踪并加入 .gitignore（发布走 scripts/deploy.mjs scp）` 之后，`git ls-files web-admin/dist` 计数 = **0**，`git check-ignore -v` 命中 `.gitignore:15:web-admin/dist/`。故本轮两次 `npm run build:h5` 后 `git status --short` **仅剩预期源文件改动**（`_e2e/_verify_print_baseline.py` + `stocktake/diff.vue`）。**判读口径**：D32 的「严禁 `git add -A`」仍作为一般纪律保留，但「`build:h5` 会弄脏工作区」已不再适用；前端发布改由 `scripts/deploy.mjs` scp 产物（Task 19） |
| D45 | 环境替代（执行期决定，**本地可写后端**） | 计划 Task 18 默认打生产 `https://e.joho.cn/guanli/`（脚本 `BASE` 默认值），而本轮按纪律生产只读、且生产侧无法产生 DRAFT/OPEN fixture | 处置：改用**本地可写后端** `http://localhost:3000/admin-api`（`d:\zhao\vendure\packages\dev-server` 的 Vendure dev-server，数据库为**本机 Postgres `vendure` 库**，已注册 `CjkPlugin`，盘库新能力齐全），前端先 `npm run build:h5`（`DONE Build complete.`）再 `node scripts/serve-h5.mjs`（5280；其 `/admin-api` 代理默认即 `localhost:3000`，**未设** `WA_API_ORIGIN`）。**实跑命令**：`$env:WA_SHOT_BASE='http://localhost:5280/guanli/'; $env:WA_SMOKE_USER='superadmin@china.test'; $env:WA_SMOKE_PWD='superadmin'; $env:WA_SMOKE_CHANNEL='shop-a'; $env:WA_SMOKE_LOC='1'; $env:WA_SHOT_ALLOW_WRITE='1'; python _e2e/_verify_stocktake_ops_e2e.py`。**风险如实记录**：① 本地库数据 ≠ 生产 `t2`（接入前本地 `shop-a` 25 条：21 CANCELLED + 4 POSTED，id 7–31；生产现状见 D41）；② 写操作全部落在**本机库**（建任务头/盘次、跑完取消，不动库存），对生产**零写操作**；③ 脚本 `IS_PROD` 硬拦保留（BASE 含 `e.joho.cn` 且开 `WA_SHOT_ALLOW_WRITE` 即 exit 2）；④ `login()` 用 `myTenantAccess.channels` 注入渠道令牌（实测含 `shop-a` → `shop-a-token`），未走 UI 选店那步。
| D46 | 计划缺陷（D28 已点名，**已修脚本**+注释） | 计划 3059 行的建草稿 input 把 `autoSplitByZone` 塞进 `scope` | 实测 introspection（`POST localhost:3000/admin-api` 查 `__type`）：`input StocktakeScopeInput { zones categoryIds variantIds includeZeroBook }`（**无** `autoSplitByZone`），而顶层 `input StocktakeTaskInput { stockLocationId name activityCode scope autoSplitByZone note state }` → 照抄会被 GraphQL 以「未定义字段」硬拒。处置：`autoSplitByZone` **上提到顶层**（与 `src/apis/stocktake.ts:265–276` 的 `createStocktakeTask` 归一逻辑同源），计划正文不改。实测：`创建临时草稿（仅任务头，不动库存）` OK，`code=TK20260925-012`（id 34）。
| D47 | 计划缺陷（**已修脚本**+注释） | 计划 3090–3091 行 T48 断言 `text=创建并发布`，与真实词条不符 | 实测 `src/locale/zh-Hans.json`：`stocktake.board.formSubmit` =「创建任务」(:1353)、`stocktake.board.formSaveDraft` =「存为草稿」(:1362) → 照抄**恒 FAIL**。处置：**只**把文案改成真实标签，并把断言范围**收紧**到抽屉动作条（`.acts .ghost` 含「存为草稿」且 `.acts .submit` 含「创建任务」两按钮），**未放宽**。实测 `ghost=1 submit=1` → OK。
| D48 | 计划缺陷（**已修脚本**+注释） | 计划 3126–3129 行 T51b 数 `.st-print .p-tbl thead th == 9`，会把**差异表(9 列) + 未盘清单表(3 列)** 一起数进来 | 实测本轮 diff 页用的任务（id 15 / `TK20260924-009`）`uncountedCount=18` → `all-tbl-ths=12`，原断言**恒 FAIL**（与 Task 16 已记录的 **D39②** 同类）。处置：只在**第一张** `.p-tbl` 内数 `thead th`，仍要求 `== 9`；`.p-foot == 1` 不变。实测 `first-tbl-ths=9 all-tbl-ths=12 foot=1` → OK。
| D49 | 计划缺陷（**本轮新发现，已修脚本**+注释） | 计划 3124–3144 行执行顺序有坑：T51b 注入 `.st-screen{display:none !important}` 拍完打印区后，T52/T53 仍要 click `.tools .tbtn`（位于 `.st-screen` 内）→ Playwright 因元素不可见**恒超时**（默认 30s），脚本会以 traceback 中断、后两张图都产不出来 | 处置：拍完 51b 后注入**反向样式**把屏幕区还原（`.st-screen{display:block !important} .st-print{display:none !important}`）再跑 T52/T53，断言一律不变。实测：T52 真实落盘 `stocktake-TK20260924-009-variance-202609251545.csv`、T53 `rows=5`；截图 52/53 中工具条已恢复可见。
| D50 | fixture 缺口（计划外增补，**已修脚本**+注释） | 计划 3098/3106 行靠 `state in ('OPEN','COUNTING','COUNTED')` 找统计页签的任务，本地 `shop-a` **一条都没有** → T49/T50 会**永远 SKIP** | 处置：按计划既有「`WA_SHOT_ALLOW_WRITE` 才建、跑完取消」模式，在列表查询前补建一个 **OPEN fixture**（`state:'OPEN'`、`stockLocationId=WA_SMOKE_LOC`、空 scope、顶层 `autoSplitByZone:false`），跑完 `cancelStocktakeTask`。实测：`可盘点=TK20260925-011`（id 33）；因 OPEN 会物化应盘行（DRAFT 不会），统计「按库位」有**真实 1 行**（未归位 组：应盘 19 / 已盘 0 / 未盘 19 / 盘盈 0）。**未能做到的部分如实记录**：原想让「按盘点人」也有 1–2 行数据，试过 `saveStocktakeCounts(waveId, inputs:[{lineId, countedQty}])`——但 `superadmin@china.test` 在本店**没有 TenantMember 行**（`claimStocktakeWave` 返回 `UserInputError: 当前账号不是本店人员，无法认领盘次`），而 `saveCounts` 首行的 `waveOwnerError` 要求盘次已被**自己**认领，故**放弃写盘点数**；「按盘点人」保持空表（截图 50 显示「暂无统计数据」），断言仍为「有表头」**未放宽**。
| D51 | 验证记录（Task 18，非偏差）+ 三处观察 | — | 实跑 `===== 手机视口截图回归：PASS（失败 0 / SKIP 0）=====`，exit **0**；9 张图逐条 `OK`（含每张「无 JS 异常」= `[]`，即 0 `pageerror` / 0 `console.error`），PIL 逐张复核尺寸均 **780×1688**：46-pagination 111587 B、47-draft-detail 72736 B、48-new-draft-buttons 113871 B、49-stats-by-bin 92813 B、50-stats-by-counter 92608 B、51-diff-toolbar 64410 B、51b-print-region 177470 B、52-export-toast 66748 B、53-export-kinds 88812 B。**截图 ↔ 本地数据对应关系**：46 → 看板全量 28 张卡（建 fixture 前 26 条 = 22 CANCELLED + 4 POSTED，建 OPEN 后 27，建 DRAFT 后 28），页脚「已加载 28 / 共 28 条」；47/48 → 本轮**新建** DRAFT `id=34 / TK20260925-012`（已取消）；49/50 → 本轮**新建** OPEN `id=33 / TK20260925-011`（已取消）；51/51b/52/53 → 既有 **POSTED** `id=15 / TK20260924-009`（`countedTotal=1`、`rows=1`、`uncountedCount=18`；其余 3 条 POSTED 为 id 14/`TK20260924-008`、id 13/`TK20260924-007`、id 9/`TK20260924-003`）。**观察 ①**：T46 的「触底增量」在本环境**未被真正触发**（28 张卡 < `pageSize 50`，单页即到底，`before=28 after=28`）；计划该断言 `after >= before` 对单页数据本就偏弱，本轮**未产生第二页**，也未为凑分页额外灌任务。**观察 ②**：51b 为拍打印区临时强制显形，`width:186mm` 的打印表格在 390px 视口下必然横向溢出、列头竖排折行（截图可见「库位编码」折成 4 行）；这是强制显形的必然结果，A4 几何正确性仍由 Task 16 基线承担（规格 §9）。**观察 ③**：计划 Step 2 列出的选择器（`.tcard`/`.tabs .tb`/`.footnote`/`.stats .tbl .th`/`.stats .seg .sg`/`.tools .tbtn`/`.kinds .krow`/`.st-print .p-tbl`/`.p-foot`）逐项实测与当前源码一致（`.tabs .tb`=5、`.tools .tbtn`=3、`.kinds .krow`=5），**未改任何选择器**。**残留如实记录**：为核实 SDL 归属曾在本地库手工建过一条 OPEN 任务并立即取消（`id=32 / TK20260925-010`，终态 CANCELLED）；本轮脚本的 fixture（id 33/34）也已在末尾取消，本地库无「非终态」残留。
| D52 | 计划缺陷（Task 19 执行期发现，**已修脚本**+注释） | 计划 3256 行的 `re.findall(r'assets/(stocktake-ops-…)', fix + um)` **只匹配 `assets/`**，而线上手册的引用写在 `shots/` 下（`src/static/manual/index.html` 既有形如 `src="shots/t45_board_no_permission_390.png"`）→ 线上手册引用的截图**永远不会被这条断言覆盖**（空过＝假 PASS 陷阱） | 处置：`_e2e/_verify_manual_docs.py` 改为 `refs(text, prefix)` **按目录分别解析、分别断言**——修复手册的 `assets/` 对 `docs/webadmin-bugfix-manual/assets`，线上手册的 `shots/` 对 `src/static/manual/shots`，逐张 `Path.exists()`；其余断言（`id="stocktake-ops"`、`16.9.8`、`verify:print`+`test:e2e:stocktake`、`op-39`、关键截图落盘、计划含「偏差说明区」、线上手册可达且含 op-39）**照抄未放宽**。**实测有效性**：部署前同一脚本只有最后一条 FAIL、其余 6 条 OK；部署后 7/7 OK → `===== 文档门禁：PASS（失败 0）=====`，证明该断言非空过。另注：9 张图**物理落盘**在 `src/static/manual/shots/`（字节数与 `docs/webadmin-bugfix-manual/assets/` 逐张一致），`op-39` 用**相对路径** `src="shots/stocktake-ops-*.png"` 引用（部署后即 `https://e.joho.cn/guanli/static/manual/shots/…`） |
| D53 | 部署记录（Task 19，非偏差） | — | ① `npm run build:h5` → `DONE Build complete.`（exit 0，仅 Sass `legacy-js-api` 弃用警告）；产物核对：`dist/build/h5/static/manual/index.html` **159943 B**（含 `op-39`）、`static/manual/shots/stocktake-ops-*.png` **9 张齐全**。② `node scripts/deploy.mjs`（cwd `web-admin`）→ `[deploy] 产物校验通过: 48682 KB` → tar → scp → 服务器解压 → **`deploy done`** → `nginx: configuration file /usr/local/openresty/nginx/conf/nginx.conf test is successful` + `signal process started`（reload）；站点目录 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli`。③ 沙箱内**一次通过**（未需 `dangerouslyDisableSandbox`；`scp`/`ssh` 走 `~/.ssh/config` 主机 `joho` 正常）。④ `web-admin/scripts/_wa_admin.tar` 由 deploy.mjs 的 `finally` 自行清理（`Test-Path` 实测不存在） |
| D54 | 线上复验记录（Task 19，非偏差）+ 一处如实处置 | — | 四条命令**全部 exit 0**，逐条输出已写入修复手册 16.9.8 第 8 小节：① `npm run verify:manual` → `===== 文档门禁：PASS（失败 0）=====`；② `npm run test:smoke:live` → `===== 盘库冒烟结果：PASS（失败 0 项）=====`（`stocktakeTasks totalItems=21`、`states` 多值过滤只回终态、`stocktakeStats`/`stocktakeExport` 可调用且 CSV 含 BOM、`shop-api` 泄漏 `[]`、看板 `tabs=5`、`console.error=0`；1 条 SKIP＝渠道收口无可比渠道）；③ `npm run test:e2e:stocktake`（**生产、未设任何 `WA_*`、`WA_SHOT_ALLOW_WRITE` 关闭**）→ `===== 手机视口截图回归：PASS（失败 0 / SKIP 3）=====`，T46 三条 OK（`tabs=5` / `before=21 after=21` / `footnote=1`），**SKIP 3 组**＝T47/T48（无 DRAFT）、T49/T50（无可盘点状态任务）、T51/T52/T53（无已过账任务）；脚本 `INFO` 行实测 `渠道 t2（loc=3）任务 totalItems=21；POSTED=None；可盘点=None；DRAFT=None`（与 D41 一致，未伪造）；④ `python _e2e/_verify_print_baseline.py --task 17`（默认打已部署生产 `https://e.joho.cn/guanli/`，只读）→ `===== 打印基线：PASS（失败 0 / SKIP 7）=====`，结构断言全 OK（`186.00mm` / `cols=9` / 列宽偏差 `[]` / `overflow=[] scroll=703/703` / PDF `594.960 x 841.920 pt` / 文本含 `TK20260924-017` / 0 JS 异常），**SKIP 7 条**全部注明「数据不足」或「未提供 `--empty-task`」（`_e2e/baselines/print/` 仍未生成，未伪造）。**如实处置（生产 e2e 会重写配图）**：③ 用**生产数据**重写了 `docs/webadmin-bugfix-manual/assets/stocktake-ops-46-pagination.png`（110274 B、21 张卡），跑完已 `git checkout -- web-admin/docs/webadmin-bugfix-manual/assets/` **还原**为已提交的本地 fixture 版本（111587 B、28 张卡），以保持手册配图与 **D51** 的「截图 ↔ 任务 id」映射一致（`git status --short` 复核该目录已干净）。全程除「部署本次 H5 产物」外**无任何生产写操作**（未建任务 / 未发布 / 未改数据） |
| D55 | 授权与推送（Task 19 Step 7） | 计划 Step 4 的 `node scripts/deploy.mjs`（生产部署）与 Step 7 的 `git push` | **用户已明确授权**本轮生产部署与 `git push`，故两步按计划原文执行（不再适用「未获授权不推送」的常规纪律）。提交信息按计划原文：`docs(stocktake): 修复手册新章 + 线上手册 op-39 + 文档门禁脚本 + 偏差回填`；暂存路径**逐条指定且全部带 `web-admin/` 前缀**、**未用** `git add -A` / `git add .`：`web-admin/docs/webadmin-bugfix-manual/`、`web-admin/src/static/manual/`、`web-admin/_e2e/_verify_manual_docs.py`、`web-admin/docs/superpowers/plans/2026-09-25-stocktake-ops-enhancement-plan.md` |
| D56 | 验证增强（Task 19 后追补，用户指令「请补充渲染级截图验证方案」） | 规格 §11 的文档门禁（`_verify_manual_docs.py`）只做**静态判定**——「截图文件是否落盘 + 页面是否含 `op-39`」；手册引用的图 404 / 0 字节 / 路径写错 / 尺寸错版**都发现不了**，且上一轮对线上手册的复验只到 HTTP 层（页面 200、PNG 200），未证明「真渲染出图」 | 按用户裁决落地（独立门禁 / L1 离线 + L2 线上 / 写进修复手册 16.9.8）：① **新增** `web-admin/_e2e/_verify_manual_render.py`——L1 离线用 `file://` 渲染《修复手册》`#stocktake-ops` 与《用户手册源》`openChapter('op-39')`；L2 线上打开已部署手册同断言，外加**每张 PNG 响应码 200** 与**线上 `shots/` 与本地逐张字节一致**（防缺图/旧图）；断言口径＝区块可达 + 图数 `9` + 每图 `complete` 且 `naturalWidth>0` + 尺寸 `780x1688` + 0 pageerror / 0 console.error；手机视口 `390x844 @dpr2` 取证截图；退出码沿用既有约定 `0/1/2`。② `package.json` 增 `verify:manual:render`。③ 修复手册 16.9.8 增第 9 小节「渲染级截图验证」+ 取证图 `assets/manual-render-online-op39.png`（**239566 B**）。**驱动要点（上一轮探针失败根因）**：手册是单文件 JS 书、**无 hash 路由**，`#op-39` 与按文本点导航项**都定位不到**，必须调页内全局函数 `openChapter(id)`（`renderReader()` 注入 `#readerContent`）。**实测**：`npm run verify:manual:render` → **20 条断言全 OK** → `===== 渲染级验证：PASS（失败 0）=====`，exit **0**（L1 修复手册 9 图 / L1 用户手册源 9 图 / L2 线上 9 图，逐图 `complete=true`、`naturalWidth=780`、`naturalHeight=1688`；线上响应码集合 `{200}` n=9、与本地 `shots/` 字节逐张一致；0 JS 异常）。**计划正文未改**（本行即唯一追补区） |
| D57 | 执行期修正（同一追补，**已修脚本**+注释） | D56 方案的 L1 断言原按「`#stocktake-ops` 区块内**全部** `img`」计数 `= 9`；而修复手册 16.9.8 第 9 小节把**取证图**放进了同一区块 → 复跑实测 `got=10`，门禁**如实 FAIL**（是断言口径错位，不是该放宽） | 处置：三层断言的选择器统一**收敛为交付截图** `img[src*="stocktake-ops-"]`（`#stocktake-ops` 与 `#readerContent` 各自套用），**图数仍要求 `=== 9`**、解码（`complete` + `naturalWidth>0`）与尺寸（`780x1688`）断言**一律不变**。复跑 `npm run verify:manual:render` → **20 条断言全 OK** → `===== 渲染级验证：PASS（失败 0）=====`，exit **0**；取证图字节稳定 `239566 B`。同批 `npm run verify:manual` 亦为 `===== 文档门禁：PASS（失败 0）=====`（7 条全 OK） |