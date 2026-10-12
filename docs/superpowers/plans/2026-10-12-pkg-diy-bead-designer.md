# P6 DIY 串珠定制模块（vshop uni-app 主线）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 vshop（uni-app/Vue3 主线）新增 `pkg-diy` 分包，实现串珠设计器（4 种算量模式 + 槽位混搭变径 + 装饰项 + 贴图渲染三级回退）、计算明细/BOM、作品广场（公开方案参观/一键购买）、我的作品，全链路复用已上线 vendure diy-plugin，不新增服务。

**Architecture:** 三层改动顺序依赖——① `@diy/calc` v2（vendure 仓库纯函数包：多素材槽位收敛、qtyOverride 反向、sequence 序列模式、decor 只计价）；② vendure diy-plugin（素材 renderUrl/renderPreset 字段、DiyPlan isPublic、diyGalleryPlans 公开查询、publishDiyPlan/copyDiyPlan、公开方案下单校验）；③ vshop `pkg-diy`（vendor calc 源码 + api 层 + 4 页面 + canvas 渲染器 + i18n 全语言）。服务端下单复算与 C 端演示共用同一份 calc 源码（vendure workspace 直依赖 / vshop vendor），保证同构。

**Tech Stack:** TypeScript（纯函数）、Vendure（diy-plugin shop-api）、uni-app 3 + Vue3 + vite、graphql-request、pinia、vue-i18n、Canvas 2D（H5/小程序双端）。

**硬约束（全程遵守）:**
- 不走 Taro 路径、不新增服务；beaddiy 分支仅作交互参考（`git -C D:\zhao\vshop show beaddiy:<path>`）
- 金额一律「分」整数，尺寸一律毫米；服务端实时复算价格为成交价
- 静态资源走 oss-plugin 静态目录，禁止硬编码域名
- i18n 五语言（zh-CN/zh-TW/en/ja/ko）同步补齐；文案兜底链 当前 locale → defaultLocale → 首个值
- 交付铁律：手机视口截图 390×844 dpr=2 + 操作手册 + 一气呵成提交/推送/部署

---

## 文件结构总览

**vendure 仓库（d:\zhao\vendure）**
```
packages/diy-calc/
  src/types.ts                  # 修改：SlotRole 增 decor、SlotSelection 增 arrange
  src/sequence.ts               # 新建：generateSequence / sequenceGeometry
  src/bracelet-calculator.ts    # 重写内部：多槽位收敛 + qtyOverride + decor
  test/*.test.ts                # 新增用例
packages/diy-plugin/src/
  entities/diy-material.entity.ts   # 修改：+renderUrl +renderPreset
  entities/diy-plan.entity.ts       # 修改：+isPublic +publishedAt
  api/shop-api.resolver.ts          # 修改（按现有文件名就近）：新查询/变更
  api/diy-shop.service.ts           # 修改：gallery/publish/copy/public 下单校验
  test/*.test.ts                    # 增用例
packages/dev-server/src/migrations/ # 新迁移（跟随 P5 现有 diy 迁移所在目录）
```

**vshop 仓库（D:\zhao\vshop）**
```
src/pkg-diy/
  vendor/diy-calc/              # 新建：vendure packages/diy-calc/src 全量拷贝（带来源头注释）
  utils/bead-render.ts          # 新建：Canvas 渲染器（preset 三级回退）
  components/BeadRing.vue       # 新建：环形预览组件
  components/ModeChips.vue      # 新建：算量模式切换
  components/MaterialSheet.vue  # 新建：混搭选料面板
  components/SequenceStrip.vue  # 新建：自由模式序列条（movable-view 拖拽）
  components/CalcDetailSheet.vue# 新建：计算明细/BOM 弹层
  pages/designer.vue            # 新建：设计器
  pages/plan-detail.vue         # 新建：方案详情（明细+BOM+下单/分享）
  pages/gallery.vue             # 新建：作品广场
  pages/my-plans.vue            # 新建：我的作品
src/api/queries/diy.ts          # 新建
src/api/mutations/diy.ts        # 新建
src/pages.json                  # 修改：pkg-diy 分包 + preloadRule
src/locales/*.json              # 修改：5 语言补 diy.* 词条
```

---

## Task 1: @diy/calc v2 —— 类型扩展 + 序列纯函数（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\diy-calc\src\types.ts`
- Create: `d:\zhao\vendure\packages\diy-calc\src\sequence.ts`
- Test: `d:\zhao\vendure\packages\diy-calc\test\sequence.test.ts`（目录以 P5 现有 44 用例所在目录为准）

- [ ] **Step 1: 写失败测试**

```ts
// test/sequence.test.ts
import { describe, it, expect } from 'vitest';
import { generateSequence, sequenceGeometry } from '../src/sequence';
import { CalcMaterial, SlotSelection } from '../src/types';

const materials: CalcMaterial[] = [
  { id: 'm1', code: 'NH-8', name: '南红', price: 250, diameter: 8, axialLength: 8, shape: '圆珠', holeSize: 1.0 },
  { id: 'm2', code: 'QJ-10', name: '青金', price: 180, diameter: 10, axialLength: 10, shape: '圆珠', holeSize: 1.0 },
  { id: 'sp', code: 'JG-4', name: '金隔', price: 60, diameter: 4, axialLength: 2, shape: '隔片', holeSize: 1.2 },
  { id: 'de', code: 'LS-1', name: '流苏', price: 1200, diameter: null as any, axialLength: null as any, shape: '装饰', holeSize: null },
];

describe('generateSequence', () => {
  it('均匀交替模式按槽位轮转铺满', () => {
    const slots: SlotSelection[] = [
      { role: 'main', materialId: 'm1' },
      { role: 'main', materialId: 'm2' },
    ];
    const seq = generateSequence(slots, 'alternate', 6);
    expect(seq).toEqual(['m1', 'm2', 'm1', 'm2', 'm1', 'm2']);
  });
  it('隔片 every 语义不变：每 (every+1) 颗插 1 片', () => {
    const slots: SlotSelection[] = [{ role: 'main', materialId: 'm1' }, { role: 'spacer', materialId: 'sp', every: 2 }];
    const seq = generateSequence(slots, 'alternate', 6);
    expect(seq.filter(x => x === 'sp').length).toBe(2);
  });
  it('random 模式含全部材料且长度正确（固定种子）', () => {
    const slots: SlotSelection[] = [{ role: 'main', materialId: 'm1' }, { role: 'main', materialId: 'm2' }];
    const seq = generateSequence(slots, 'random', 7, () => 0.4);
    expect(seq.length).toBe(7);
    expect(new Set(seq)).toEqual(new Set(['m1', 'm2']));
  });
});

describe('sequenceGeometry（自由模式逐颗求和）', () => {
  it('中心线=Σ(轴向+gap)，内孔按加权径回退，decor 不进几何', () => {
    const seq = ['m1', 'm2', 'm1', 'sp', 'm1', 'm2', 'm1'];
    const { calc, bom } = sequenceGeometry(seq, materials, 0.5, 155);
    // 中心线 = 8+0.5 + 10+0.5 + 8+0.5 + 2+0.5 + 8+0.5 + 10+0.5 + 8+0.5 = 57.5mm
    expect(Math.round(calc!.centerCircumference * 10) / 10).toBeCloseTo(57.5, 1);
    expect(calc!.count).toBe(6 + 1); // 6 主珠/隔珠 + 1 隔片（全部计入颗数）
    expect(bom.items.find(i => i.materialId === 'de')).toBeUndefined();
    expect(bom.totalAmount).toBe(4 * 250 + 2 * 180 + 1 * 60); // 主珠 m1×4 + m2×2 + sp×1
  });
  it('空序列返回空 BOM 不抛错', () => {
    const { calc, bom } = sequenceGeometry([], materials, 0.5, 155);
    expect(calc).toBeNull();
    expect(bom.totalAmount).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd d:\zhao\vendure\packages\diy-calc && pnpm vitest run test/sequence.test.ts
```
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 types.ts 扩展**

```ts
// types.ts —— 仅列改动（保留其余不动）
export type SlotRole = 'main' | 'spacer' | 'focal' | 'decor';
// SlotSelection 增加可选字段（旧数据不受影响）：
export interface SlotSelection {
  role: SlotRole;
  materialId: string;
  every?: number;
  qtyOverride?: number | null;
  /** v2：排列方式，仅影响序列生成，不影响几何收敛 */
  arrange?: 'alternate' | 'random' | 'zoned';
}
```

- [ ] **Step 4: 实现 sequence.ts**

```ts
// src/sequence.ts —— 自由模式序列生成与逐颗几何（纯函数）
import { CalcBom, CalcBomItem, CalcMaterial, CalcResult, SlotSelection } from './types';

type Rng = () => number;

/** 各槽位按 qtyOverride 权重（无则均分）把 total 颗分配到槽位 */
function allocate(slots: SlotSelection[], total: number): Map<string, number> {
  const weights = slots.map(s => Math.max(0, Number(s.qtyOverride ?? 0)));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (sum <= 0) {
    const each = Math.max(1, Math.floor(total / slots.length));
    slots.forEach((s, i) => out.set(s.materialId + '#' + i, i === 0 ? total - each * (slots.length - 1) : each));
    return out;
  }
  let used = 0;
  slots.forEach((s, i) => {
    const n = i === slots.length - 1 ? total - used : Math.floor((total * weights[i]) / sum);
    out.set(s.materialId + '#' + i, n);
    used += n;
  });
  return out;
}

/** 均匀交替：槽位轮转；zoned：槽位分区；random：加权随机（rng 可注入便于测试） */
export function generateSequence(slots: SlotSelection[], mode: 'alternate' | 'random' | 'zoned', total: number, rng: Rng = Math.random): string[] {
  const pool: string[] = [];
  allocate(slots, total).forEach((n, key) => {
    const materialId = key.split('#')[0];
    for (let i = 0; i < n; i++) pool.push(materialId);
  });
  if (mode === 'random') {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  if (mode === 'zoned') {
    // 反转使槽位顺序成区（allocate 按槽位序生成，已天然分区，无需处理）
  }
  return pool;
}

/** 自由序列几何：中心线=Σ(轴向长+gap)，内孔/反馈复用加权平均口径 */
export function sequenceGeometry(
  sequence: string[],
  materials: CalcMaterial[],
  gap: number,
  wristSize: number,
  ease: number,
): { calc: CalcResult | null; bom: CalcBom } {
  const byId = new Map(materials.map(m => [m.id, m]));
  const loop = sequence.filter(id => {
    const m = byId.get(id);
    return m && m.role !== 'decor';
  });
  const EMPTY = { items: [] as CalcBomItem[], totalCount: 0, totalAmount: 0, cord: null, geometry: null };
  if (loop.length === 0) return { calc: null, bom: EMPTY };

  const pitches = loop.map(id => {
    const m = byId.get(id)!;
    return (m.axialLength ?? m.diameter ?? 8) + gap;
  });
  const ds = loop.map(id => byId.get(id)!.diameter ?? 8);
  const centerCircumference = pitches.reduce((a, b) => a + b, 0);
  const pitchAvg = centerCircumference / loop.length;
  const dAvg = ds.reduce((a, b) => a + b, 0) / loop.length;
  // 与既有 innerCircOf 同口径：中心线正多边形回退，内孔 = 中心线 - π·dAvg
  const innerCircumference = Math.max(0, centerCircumference - Math.PI * dAvg);
  const clearance = innerCircumference - wristSize;
  const calc: CalcResult = {
    count: loop.length,
    countInitial: loop.length,
    centerCircumference,
    innerCircumference,
    feedback: feedbackOf(clearance),
    clearance,
    adjustHint: null,
    cordLength: centerCircumference + CORD_TAIL,
    cordDiameter: pickCordDiameter(loop),
  };
  // BOM：环上素材聚合 + decor 槽位（qtyOverride ?? 1，只计价）
  const items: CalcBomItem[] = [];
  const counts = new Map<string, number>();
  loop.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  counts.forEach((qty, id) => items.push(bomItemOf(byId.get(id)!, qty)));
  for (const s of decorSlots) {
    const m = byId.get(s.materialId);
    if (m) items.push(bomItemOf(m, Math.max(1, s.qtyOverride ?? 1)));
  }
  const aggregated = aggregateItems(items);
  return {
    calc,
    bom: {
      items: aggregated,
      totalCount: aggregated.reduce((s, i) => s + i.qty, 0),
      totalAmount: aggregated.reduce((s, i) => s + i.subtotal, 0),
      cord: { length: calc.cordLength, diameter: calc.cordDiameter, note: '弹力线，打结收尾留量 160mm' },
      geometry: { innerCircumference, feedback: calc.feedback, clearance },
    },
  };
}
```

实现注意：`CORD_TAIL = 160`、`pickCordDiameter`、`feedbackOf`、`bomItemOf`、`aggregateItems` 从 `./bracelet-calculator.ts` 抽出为共享导出（重构成具名导出，calculator 与 sequence 共用，勿复制粘贴）；`decorSlots` 为参数（见 Task 2 签名，`sequenceGeometry(seq, materials, gap, wristSize, ease, decorSlots = [])`）。`CalcMaterial.role` 若类型上无 role 字段，则在 types.ts 的 CalcMaterial 上补 `role?: SlotRole`（populate 数据回填）。

- [ ] **Step 5: 跑测试通过**

```bash
cd d:\zhao\vendure\packages\diy-calc && pnpm vitest run
```
预期：sequence 新用例 + 原有 44 用例全 PASS。

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\vendure && git add packages/diy-calc && git commit -m "feat(diy-calc): v2 sequence 纯函数 + 类型扩展（decor/arrange/qtyOverride）"
```

---

## Task 2: @diy/calc v2 —— bracelet-calculator 多槽位重写（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\diy-calc\src\bracelet-calculator.ts`
- Test: `d:\zhao\vendure\packages\diy-calc\test\bracelet-v2.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// test/bracelet-v2.test.ts
import { describe, it, expect } from 'vitest';
import { braceletCalculator } from '../src/bracelet-calculator';

const materials = [
  { id: 'm1', code: 'NH-8', name: '南红', price: 250, diameter: 8, axialLength: 8, shape: '圆珠', holeSize: 1.0 },
  { id: 'm2', code: 'QJ-10', name: '青金', price: 180, diameter: 10, axialLength: 10, shape: '圆珠', holeSize: 1.0 },
  { id: 'sp', code: 'JG-4', name: '金隔', price: 60, diameter: 4, axialLength: 2, shape: '隔片', holeSize: 1.2 },
  { id: 'de', code: 'LS-1', name: '流苏', price: 1200, diameter: 20, axialLength: 20, shape: '装饰', holeSize: null },
];
const input = (slots: any[], params: any = {}) => ({ calculatorKey: 'bracelet', materials, slots, params } as any);

describe('v2 多主珠混搭（定手围收敛）', () => {
  it('两个主珠槽位均分收敛，BOM 聚合两行，几何用加权径', () => {
    const { calc, bom } = braceletCalculator(input([
      { role: 'main', materialId: 'm1' },
      { role: 'main', materialId: 'm2' },
      { role: 'spacer', materialId: 'sp', every: 2 },
    ], { wristSize: 160, fit: 'comfortable' }));
    expect(calc).not.toBeNull();
    expect(bom.items.length).toBe(3); // m1 + m2 + sp
    expect(bom.totalAmount).toBeGreaterThan(0);
    // 内孔与手围差值收敛在 ±20mm 内（收敛生效）
    expect(Math.abs(calc!.innerCircumference - 175)).toBeLessThan(25);
  });
  it('decor 槽位只进 BOM 不进几何', () => {
    const { calc, bom } = braceletCalculator(input([
      { role: 'main', materialId: 'm1' },
      { role: 'decor', materialId: 'de', qtyOverride: 1 },
    ]));
    expect(bom.items.find(i => i.materialId === 'de')!.qty).toBe(1);
    expect(bom.totalAmount).toBeGreaterThanOrEqual(1200);
  });
});

describe('v2 定颗数反向模式（qtyOverride 全指定）', () => {
  it('颗数锁定，内孔随颗数变化', () => {
    const { calc } = braceletCalculator(input([
      { role: 'main', materialId: 'm1', qtyOverride: 20 },
      { role: 'spacer', materialId: 'sp', every: 2, qtyOverride: 6 },
    ], { wristSize: 160 }));
    expect(calc!.count).toBe(26); // 20 + 6（无 focal）
  });
});

describe('v1 向后兼容', () => {
  it('单主珠旧 spec 计算结果与 v1 一致（数量级校验）', () => {
    const { calc, bom } = braceletCalculator(input([{ role: 'main', materialId: 'm1' }], { wristSize: 160 }));
    expect(calc!.count).toBeGreaterThan(10);
    expect(bom.items.length).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd d:\zhao\vendure\packages\diy-calc && pnpm vitest run test/bracelet-v2.test.ts
```
预期：FAIL。

- [ ] **Step 3: 重写 calculator（完整实现）**

```ts
// src/bracelet-calculator.ts（v2 完整替换；共享 CORD_TAIL/CORD_DIAMETERS/bomItemOf/pickCordDiameter/feedbackOf 保持导出）
import { angleOf, computeBraceletGeometry, easeOf, feedbackOf, innerCircOf } from './bracelet';
import { CalcBom, CalcBomItem, CalcMaterial, Calculator, CalculatorInput, CalcResult, SlotSelection } from './types';

export const CORD_TAIL = 160;
const CORD_DIAMETERS = [1.0, 0.8, 0.6];

export function bomItemOf(m: CalcMaterial, qty: number): CalcBomItem {
  const spec = m.diameter != null ? `${m.diameter}mm ${m.shape}` : m.shape;
  return { materialId: m.id, code: m.code, name: m.name, spec, unitPrice: m.price, qty, subtotal: qty * m.price };
}
export function aggregateItems(items: CalcBomItem[]): CalcBomItem[] {
  const map = new Map<string, CalcBomItem>();
  for (const it of items) {
    const ex = map.get(it.materialId);
    if (ex) { ex.qty += it.qty; ex.subtotal += it.subtotal; } else map.set(it.materialId, { ...it });
  }
  return [...map.values()];
}
export function pickCordDiameterOf(holeMin: number | null): number {
  if (holeMin == null) return 1.0;
  const max = Math.min(holeMin - 0.2, 1.0);
  return CORD_DIAMETERS.find(d => d <= max) ?? 0.6;
}
export function feedbackOf(clearance: number) { /* 原 bracelet.ts feedbackOf，保持原实现 */ }

export const braceletCalculator: Calculator = (input: CalculatorInput) => {
  const byId = new Map(input.materials.map(m => [m.id, m]));
  const EMPTY = { calc: null, bom: { items: [], totalCount: 0, totalAmount: 0, cord: null, geometry: null } as CalcBom };
  const mainSels = input.slots.filter(s => s.role === 'main' && byId.get(s.materialId));
  const mainSelsOk = mainSels.filter(s => byId.get(s.materialId));
  if (mainSelsOk.length === 0) return EMPTY;

  const W = Number(input.params.wristSize ?? 155);
  const fit = String(input.params.fit ?? 'comfortable');
  const gap = Number(input.params.gap ?? 0.5);
  const ease = easeOf(fit);

  const focalSel = input.slots.find(s => s.role === 'focal' && byId.get(s.materialId));
  const focal = focalSel ? byId.get(focalSel.materialId)! : undefined;
  const spacerSels = input.slots.filter(s => s.role === 'spacer' && byId.get(s.materialId));
  const decorSels = input.slots.filter(s => s.role === 'decor' && byId.get(s.materialId));

  // 收敛/固定两种模式：全部主珠槽位都带 qtyOverride → 固定；否则收敛（qtyOverride 作权重）
  const fixed = mainSelsOk.every(s => s.qtyOverride != null) && mainSelsOk.length > 0;
  const axial = (m: CalcMaterial) => m.axialLength ?? m.diameter ?? 8;
  const diam = (m: CalcMaterial) => m.diameter ?? m.axialLength ?? 8;

  // 加权平均主珠径（决定 LCenter 的 π·d 项）
  const weights = mainSelsOk.map(s => Math.max(1, s.qtyOverride ?? 1));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const dMainAvg = mainSelsOk.reduce((acc, s, i) => acc + diam(byId.get(s.materialId)!) * weights[i], 0) / wSum;

  const LCenter = W + ease + Math.PI * dMainAvg;
  const RTarget = LCenter / (2 * Math.PI);
  const tFocal = focal ? axial(focal) : 0;
  const spacerQtyTotal = () => spacerSels.reduce((a, s) => a + Math.floor((fixedCount(s) ?? total) / (s.every ?? 2) + 1), 0);
  // spacer 总量按「每 (every+1) 颗插 1 片」对总颗数近似：floor(total/(every+1)) 按每槽独立
  function fixedCount(s: SlotSelection): number | null { return s.qtyOverride != null ? Math.max(1, s.qtyOverride) : null; }

  let total = 0;
  let mainCounts: number[] = [];
  let spacerCounts: number[] = [];
  if (fixed) {
    mainCounts = mainSelsOk.map(s => fixedCount(s)!);
    spacerCounts = spacerSels.map(s => fixedCount(s) ?? 0);
    total = mainCounts.reduce((a, b) => a + b, 0) + spacerCounts.reduce((a, b) => a + b, 0) + (focal ? 1 : 0);
  } else {
    const geo = computeBraceletGeometry({ wristSize: W, diameter: dMainAvg, axialLength: dMainAvg, gap, ease });
    total = geo.count;
    // §7.3 二次收敛推广到 k 个主珠槽位（≤3 轮）
    for (let round = 0; round < 3; round++) {
      mainCounts = mainSelsOk.map((s, i) => Math.max(0, Math.floor((total * weights[i]) / wSum)));
      // 余数给权重最大的槽位
      const rest = total - mainCounts.reduce((a, b) => a + b, 0);
      if (rest > 0) mainCounts[weights.indexOf(Math.max(...weights))] += rest;
      spacerCounts = spacerSels.map(s => Math.floor(total / (Math.max(1, Math.floor(s.every ?? 2)) + 1)));
      let used = 0;
      mainSelsOk.forEach((s, i) => (used += mainCounts[i] * angleOf(axial(byId.get(s.materialId)!) + gap, RTarget)));
      spacerSels.forEach((s, i) => (used += spacerCounts[i] * angleOf(axial(byId.get(s.materialId)!) + gap, RTarget)));
      if (focal) used += angleOf(tFocal + gap, RTarget);
      if (used <= 0) { total = 0; break; }
      // 按当前构成反推可行颗数
      const perAvg = used / total;
      const next = Math.max(1, Math.floor((2 * Math.PI) / perAvg));
      if (next === total) break;
      total = next;
    }
  }

  // 几何展示值（加权平均，与 v1 口径一致）
  const allLoop = [
    ...mainSelsOk.map((s, i) => ({ m: byId.get(s.materialId)!, n: mainCounts[i] })),
    ...spacerSels.map((s, i) => ({ m: byId.get(s.materialId)!, n: spacerCounts[i] })),
    ...(focal ? [{ m: focal, n: 1 }] : []),
  ];
  const totalCount = allLoop.reduce((a, x) => a + x.n, 0);
  if (totalCount === 0) return EMPTY;
  const pitchAvg = allLoop.reduce((a, x) => a + x.n * (axial(x.m) + gap), 0) / totalCount;
  const dAvg = allLoop.reduce((a, x) => a + x.n * diam(x.m), 0) / totalCount;
  const innerCircumference = totalCount >= 2 ? innerCircOf(totalCount, pitchAvg, dAvg) : 0;
  const clearance = innerCircumference - W;
  const centerCircumference = totalCount >= 2 ? (Math.PI * pitchAvg) / Math.sin(Math.PI / totalCount) : LCenter;

  const items: CalcBomItem[] = allLoop.filter(x => x.n > 0).map(x => bomItemOf(x.m, x.n));
  decorSels.forEach(s => items.push(bomItemOf(byId.get(s.materialId)!, Math.max(1, s.qtyOverride ?? 1))));
  const aggregated = aggregateItems(items);
  const holes = allLoop.filter(x => x.n > 0).map(x => x.m.holeSize).filter((h): h is number => h != null);
  const cordDiameter = pickCordDiameterOf(holes.length ? Math.min(...holes) : null);
  const calc: CalcResult = {
    count: totalCount,
    countInitial: fixed ? totalCount : total,
    centerCircumference,
    innerCircumference,
    feedback: feedbackOf(clearance),
    clearance,
    adjustHint: null,
    cordLength: centerCircumference + CORD_TAIL,
    cordDiameter,
  };
  return {
    calc,
    bom: {
      items: aggregated,
      totalCount: aggregated.reduce((s, i) => s + i.qty, 0),
      totalAmount: aggregated.reduce((s, i) => s + i.subtotal, 0),
      cord: { length: calc.cordLength, diameter: cordDiameter, note: '弹力线，打结收尾留量 160mm' },
      geometry: { innerCircumference, feedback: calc.feedback, clearance },
    },
  };
};
```

实现注意：`feedbackOf` 从 `./bracelet` 原样 re-export，勿重复实现；`computeBraceletGeometry` 仅在收敛模式初始值处使用；保持 `braceletCalculator` 导出名不变（plugin 注册处零改动）。

- [ ] **Step 4: 跑全部 calc 测试**

```bash
cd d:\zhao\vendure\packages\diy-calc && pnpm vitest run
```
预期：原 44 + 新增用例全 PASS（原用例是向后兼容的验收线）。

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vendure && git add packages/diy-calc && git commit -m "feat(diy-calc): v2 多主珠/隔片槽位收敛 + qtyOverride 定颗数 + decor 只计价"
```

---

## Task 3: vendure 插件 —— 素材渲染字段 + 方案公开字段 + 迁移

**Files:**
- Modify: `d:\zhao\vendure\packages\diy-plugin\src\entities\diy-material.entity.ts`
- Modify: `d:\zhao\vendure\packages\diy-plugin\src\entities\diy-plan.entity.ts`
- Create: 迁移文件（放 P5 现有 diy 迁移同目录，命名跟随现有模式，如 `packages/dev-server/src/migrations/17xx-diy-render-and-public.ts`）

- [ ] **Step 1: 实体加列（typeorm 联合类型列必须显式列类型——P5 踩坑铁律）**

```ts
// diy-material.entity.ts 追加
@Column({ type: 'varchar', nullable: true })
renderUrl: string | null;   // 透明底统一光照贴图（静态目录）
@Column({ type: 'varchar', nullable: true })
renderPreset: string | null; // glass | jade | jade-flower | amber | pearl | metal | wood | matte | null

// diy-plan.entity.ts 追加
@Column({ type: 'boolean', default: false })
isPublic: boolean;
// 日期可空列唯一正解：@Column({ type: Date })（P5 实证，勿用 'timestamp'/'datetime' 字符串）
@Column({ type: Date, nullable: true })
publishedAt: Date | null;
```

- [ ] **Step 2: 迁移文件（import type 铁律；pg/sqlite 双方言）**

```ts
// 迁移文件骨架（类名/时间戳前缀按现有序列递增）
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DiyRenderAndPublic1728700000000 implements MigrationInterface {
  name = 'DiyRenderAndPublic1728700000000';
  async up(qr: QueryRunner): Promise<void> {
    const isPg = qr.connection.options.type === 'postgres';
    if (isPg) {
      await qr.query(`ALTER TABLE "diy_material" ADD COLUMN IF NOT EXISTS "renderUrl" varchar`);
      await qr.query(`ALTER TABLE "diy_material" ADD COLUMN IF NOT EXISTS "renderPreset" varchar`);
      await qr.query(`ALTER TABLE "diy_plan" ADD COLUMN IF NOT EXISTS "isPublic" boolean NOT NULL DEFAULT false`);
      await qr.query(`ALTER TABLE "diy_plan" ADD COLUMN IF NOT EXISTS "publishedAt" timestamp`);
    } else {
      await qr.query(`ALTER TABLE "diy_material" ADD COLUMN "renderUrl" varchar`);
      await qr.query(`ALTER TABLE "diy_material" ADD COLUMN "renderPreset" varchar`);
      await qr.query(`ALTER TABLE "diy_plan" ADD COLUMN "isPublic" boolean NOT NULL DEFAULT 0`);
      await qr.query(`ALTER TABLE "diy_plan" ADD COLUMN "publishedAt" datetime`);
    }
  }
  async down(qr: QueryRunner): Promise<void> { /* 按现有迁移惯例：drop 上述列 */ }
}
```
注册：跟随 P5 迁移的注册位置（dev-config 迁移列表）加入数组。

- [ ] **Step 3: 本地 dev 起服验证迁移跑通**

```bash
cd d:\zhao\vendure && pnpm --filter @zhao/dev-server build && pnpm --filter @zhao/dev-server dev
```
预期：启动日志无迁移报错，diy_material/diy_plan 新列存在。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vendure && git add packages/diy-plugin packages/dev-server && git commit -m "feat(diy-plugin): 素材 renderUrl/renderPreset + 方案 isPublic/publishedAt + 迁移"
```

---

## Task 4: vendure shop-api —— 渲染字段透出 + 发布/广场/复制/公开下单

**Files:**
- Modify: `d:\zhao\vendure\packages\diy-plugin\src\api\`（schema 扩展与 resolver 文件按 P5 现有 diyCategories 所在文件就近修改）
- Test: `d:\zhao\vendure\packages\diy-plugin\test\`（跟随现有 33 用例组织）

- [ ] **Step 1: schema 扩展（SDL，并入现有 extension）**

```graphql
type DiyMaterial implements Node { renderUrl: String  renderPreset: String }   # 并入现有 DiyMaterial 定义
type DiyPlan implements Node { isPublic: Boolean!  publishedAt: DateTime }     # 并入现有 DiyPlan 定义
extend type Mutation {
  publishDiyPlan(id: ID!, isPublic: Boolean!): DiyPlan!
  copyDiyPlan(id: ID!): DiyPlan!
}
extend type Query {
  """作品广场：仅 isPublic=true 的已报价方案，Public 无需登录"""
  diyGalleryPlans(skip: Int = 0, take: Int = 12): DiyGalleryList!
}
type DiyGalleryItem { id: ID!  title: String!  coverMaterialIds: [String!]!  totalAmount: Int!  totalCount: Int!  authorName: String  createdAt: DateTime! }
type DiyGalleryList { items: [DiyGalleryItem!]!  total: Int! }
```

- [ ] **Step 2: service 实现（关键逻辑完整代码）**

```ts
// diy-shop.service.ts 追加
async publishDiyPlan(ctx: RequestContext, userId: ID, planId: ID, isPublic: boolean): Promise<DiyPlan> {
  const plan = await this.repo.findOne({ where: { id: planId, ownerUserId: String(userId) } });
  if (!plan) throw new UserInputError('PLAN_NOT_FOUND_OR_NOT_OWNER');
  plan.isPublic = isPublic;
  plan.publishedAt = isPublic ? new Date() : null;
  return this.repo.save(plan);
}

async diyGalleryPlans(ctx: RequestContext, skip: number, take: number): Promise<{ items: DiyGalleryItem[]; total: number }> {
  const qb = this.repo.createQueryBuilder('p')
    .where('p.isPublic = :pub', { pub: true })
    .orderBy('p.publishedAt', 'DESC')
    .skip(skip).take(Math.min(take, 50));
  const [plans, total] = await qb.getManyAndCount();
  return {
    total,
    items: plans.map(p => ({
      id: p.id,
      title: planTitleOf(p),                    // 取 spec 主素材名组合（如「南红青金 · 16cm」，LocalizedText 当前语言）
      coverMaterialIds: coverMaterialIdsOf(p),  // spec.slots 去重前 3 个 materialId，C 端自渲染封面
      totalAmount: p.bomSnapshot?.totalAmount ?? 0,
      totalCount: p.bomSnapshot?.totalCount ?? 0,
      authorName: p.ownerName ?? null,
      createdAt: p.createdAt,
    })),
  };
}

async copyDiyPlan(ctx: RequestContext, userId: ID, planId: ID): Promise<DiyPlan> {
  const src = await this.repo.findOne({ where: { id: planId } });
  if (!src || (!src.isPublic && src.ownerUserId !== String(userId))) throw new UserInputError('PLAN_NOT_ACCESSIBLE');
  const copy = this.repo.create({ ...src, id: undefined as any, ownerUserId: String(userId), status: 'draft', isPublic: false, publishedAt: null, createdAt: undefined, updatedAt: undefined });
  return this.repo.save(copy);
}
```

- [ ] **Step 3: 公开方案下单校验（改 createOrderFromPlan 现有归属校验）**

```ts
// 原：仅 owner 可下单；改为：
const plan = await this.repo.findOne({ where: { id: planId } });
if (!plan) throw new UserInputError('PLAN_NOT_FOUND');
const isOwner = plan.ownerUserId === String(userId);
if (!isOwner && !plan.isPublic) throw new UserInputError('PLAN_NOT_ACCESSIBLE');
// 复算 BOM 用服务端实时素材价（现逻辑不动）；下单成功后方案归属保持原作者，订单 customFields 记 diyPlanId + copiedFrom
```

- [ ] **Step 4: resolver 注册（跟随 diyCategories 模式：Public 装饰器/无 auth 校验）** —— `diyGalleryPlans` 加 Public；`publishDiyPlan`/`copyDiyPlan` 需登录（activeUserId）。逐条接入 shop-api resolver 文件。

- [ ] **Step 5: 测试**（跟随现有 vitest 组织）新增 3 用例：publish 仅 owner；gallery 只出 isPublic；copyDiyPlan 匿名不可复制非公开方案。跑 `pnpm --filter diy-plugin test`（以 P5 实际命令为准）+ e2e 全量回归。

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\vendure && git add packages/diy-plugin && git commit -m "feat(diy-plugin): shop-api 渲染字段 + publish/gallery/copy + 公开方案下单"
```

---

## Task 5: vendure 全量回归 + 生产构建 + 推送

- [ ] **Step 1:** `cd d:\zhao\vendure\packages\diy-calc && pnpm vitest run` → 全 PASS
- [ ] **Step 2:** diy-plugin 单测 + e2e 全量（P5 同款命令）→ 全 PASS
- [ ] **Step 3:** `cd d:\zhao\vendure && npx tsc -p tsconfig.prod.json` → 0 error（lib/ 与 dev-server/dist 均入 git）
- [ ] **Step 4:** `git add -A && git commit -m "chore: prod build" && git push origin master`

---

## Task 6: vshop —— vendor calc + API 层 + i18n

**Files:**
- Create: `src/pkg-diy/vendor/diy-calc/`（拷贝 `d:\zhao\vendure\packages\diy-calc\src\*.ts` 全量 + `README.md` 注明来源 commit）
- Create: `src/api/queries/diy.ts`、`src/api/mutations/diy.ts`
- Modify: `src/locales/{zh-CN,zh-TW,en,ja,ko}.json`

- [ ] **Step 1: vendor 拷贝**

```bash
mkdir -p D:\zhao\vshop\src\pkg-diy\vendor\diy-calc
Copy-Item d:\zhao\vendure\packages\diy-calc\src\*.ts D:\zhao\vshop\src\pkg-diy\vendor\diy-calc\
```
目录头加 `// vendored from d:\zhao\vendure packages/diy-calc@<commit-sha>，勿手改，同步走拷贝`。

- [ ] **Step 2: API 层（graphql-request，跟随 client.ts 既有模式）**

```ts
// src/api/queries/diy.ts
import { getGraphQLClient } from '../client';

export const DIY_CATEGORIES = `query { diyCategories { id code name } }`;
export const DIY_MATERIALS = `query ($filter: JSON, $skip: Int, $take: Int) {
  diyMaterials(options: { skip: $skip, take: $take, filter: $filter }) { total items { id code name price diameter axialLength shape holeSize renderUrl renderPreset imageUrl } } }`;
export const DIY_GALLERY = `query ($skip: Int, $take: Int) { diyGalleryPlans(skip: $skip, take: $take) { total items { id title coverMaterialIds totalAmount totalCount authorName createdAt } } }`;
export const MY_DIY_PLANS = `query ($status: String, $skip: Int, $take: Int) { myDiyPlans(status: $status, skip: $skip, take: $take) { total items { id status title spec bomSnapshot totalAmount createdAt isPublic } } }`;
export const MY_DIY_PLAN = `query ($id: ID!) { myDiyPlan(id: $id) { id status spec bomSnapshot totalAmount isPublic } }`;

export const diyCategories = () => getGraphQLClient().request(DIY_CATEGORIES);
export const diyMaterials = (filter: any, skip = 0, take = 50) =>
  getGraphQLClient().request(DIY_MATERIALS, { filter, skip, take });
export const diyGallery = (skip = 0, take = 12) => getGraphQLClient().request(DIY_GALLERY, { skip, take });
export const myDiyPlans = (status?: string, skip = 0, take = 20) =>
  getGraphQLClient().request(MY_DIY_PLANS, { status, skip, take });
export const myDiyPlan = (id: string) => getGraphQLClient().request(MY_DIY_PLAN, { id });
```
> 字段名以生产 introspection 为准（P5 已实测 diyMaterials/diyCategories/myDiyPlans 签名；Task 4 新字段上线后再补 renderUrl/renderPreset/isPublic 相关 query）。参数名 `options/filter` 若与现网签名不符，以 introspection 结果修正——实现时先打一次内省确认。

```ts
// src/api/mutations/diy.ts
import { getGraphQLClient } from '../client';

export const CREATE_DIY_PLAN = `mutation ($input: JSON!) { createDiyPlan(input: $input) { id status } }`;
export const QUOTE_DIY_PLAN = `mutation ($id: ID!, $input: JSON) { quoteDiyPlan(id: $id, input: $input) { id totalAmount bom } }`;
export const CREATE_ORDER_FROM_PLAN = `mutation ($id: ID!) { createOrderFromPlan(id: $id) { ...OrderFragment } }`;
export const PUBLISH_DIY_PLAN = `mutation ($id: ID!, $isPublic: Boolean!) { publishDiyPlan(id: $id, isPublic: $isPublic) { id isPublic } }`;
export const COPY_DIY_PLAN = `mutation ($id: ID!) { copyDiyPlan(id: $id) { id status } }`;
// 导出函数同上模式；input 为 spec v2 JSON（结构见 Task 7 designer 保存逻辑）
```

- [ ] **Step 3: i18n 词条（五语言同步，键全表如下）**

| key | zh-CN | zh-TW | en | ja | ko |
|---|---|---|---|---|---|
| diy.title | 珠宝定制 | 珠寶定製 | Custom Jewelry | ジュエリー定制 | 주얼리 커스텀 |
| diy.designer | 串珠设计师 | 串珠設計師 | Bead Designer | ビーズデザイナー | 비드 디자이너 |
| diy.mode.byWrist | 定手围·算颗数 | 定手圍·算顆數 | By wrist | 手首回りから | 손목 기준 |
| diy.mode.byCount | 定颗数·看内孔 | 定顆數·看內孔 | By count | 顆数から | 수 기준 |
| diy.mode.pattern | 混搭排列 | 混搭排列 | Pattern | パターン | 패턴 |
| diy.mode.free | 自由拖拽 | 自由拖拽 | Free drag | フリードラッグ | 자유 배치 |
| diy.slot.main | 主珠 | 主珠 | Main beads | メインビーズ | 메인 비드 |
| diy.slot.spacer | 隔片 | 隔片 | Spacers | スペーサー | 스페이서 |
| diy.slot.focal | 焦点珠 | 焦點珠 | Focal | フォーカル | 포커스 |
| diy.slot.decor | 装饰 | 裝飾 | Charms | 装飾 | 장식 |
| diy.arrange.alternate | 均匀交替 | 均勻交替 | Alternate | 均等交互 | 교대 |
| diy.arrange.random | 随机混编 | 隨機混編 | Random | ランダム | 랜덤 |
| diy.arrange.zoned | 分区排列 | 分區排列 | Zoned | ゾーン | 구역 |
| diy.fit.snug | 贴合 | 貼合 | Snug | タイト | 타이트 |
| diy.fit.comfortable | 舒适 | 舒適 | Comfortable | 快適 | 편안함 |
| diy.fit.loose | 宽松 | 寬鬆 | Loose | ゆったり | 여유 |
| diy.wristSize | 手围 | 手圍 | Wrist size | 手首回り | 손목 둘레 |
| diy.beadCount | 颗数 | 顆數 | Bead count | 顆数 | 구슬 수 |
| diy.innerCirc | 内孔周长 | 內孔周長 | Inner circumference | 内周 | 안둘레 |
| diy.feedback.tight | 过紧 | 過緊 | Too tight | 締すぎ | 너무 타이트함 |
| diy.feedback.fit | 合适 | 合適 | Just right | ちょうど良い | 딱 맞음 |
| diy.feedback.loose | 宽松 | 寬鬆 | Loose | ゆるい | 헐거움 |
| diy.cord | 配线 | 配線 | Cord | コード | 코드 |
| diy.knotTail | 含打结留量 | 含打結留量 | incl. knot tail | 結び余り含む | 매듭 여유 포함 |
| diy.calcDetail | 计算明细 | 計算明細 | Calc details | 計算詳細 | 계산 상세 |
| diy.bom | BOM 明细 | BOM 明細 | BOM details | BOM 詳細 | BOM 상세 |
| diy.total | 合计 | 合計 | Total | 合計 | 합계 |
| diy.save | 保存方案 | 保存方案 | Save design | デザイン保存 | 디자인 저장 |
| diy.publish | 公开到作品广场 | 公開到作品廣場 | Publish to Gallery | ギャラリーへ公開 | 갤러리에 공개 |
| diy.unpublish | 取消公开 | 取消公開 | Unpublish | 公開取消 | 공개 취소 |
| diy.gallery | 作品广场 | 作品廣場 | Gallery | ギャラリー | 갤러리 |
| diy.gallery.useThis | 用这个方案 | 用這個方案 | Use this design | このデザインを使う | 이 디자인 사용 |
| diy.myPlans | 我的作品 | 我的作品 | My designs | マイデザイン | 내 디자인 |
| diy.quote | 生成报价单 | 生成報價單 | Get quote | 見積取得 | 견적 생성 |
| diy.order | 加入购物车 | 加入購物車 | Add to cart | カートへ | 장바구니 |
| diy.loginRequired | 请先登录 | 請先登錄 | Please sign in | ログインしてください | 로그인 필요 |
| diy.copyPlan | 复制到我的方案 | 復製到我的方案 | Copy to my designs | マイデザインへ複製 | 내 디자인으로 복사 |
| diy.perBead | /颗 | /顆 | /pc | /個 | /개 |

写入方式：五语言 json 同步增补 `diy` 节点（注意 `tm()` 数组类文案不在本期）。

- [ ] **Step 4: 提交**

```bash
cd D:\zhao\vshop && git add src/pkg-diy/vendor src/api src/locales && git commit -m "feat(pkg-diy): vendor @diy/calc v2 + diy api 层 + i18n 五语言"
```

---

## Task 7: vshop —— Canvas 渲染器 + BeadRing 组件

**Files:**
- Create: `src/pkg-diy/utils/bead-render.ts`
- Create: `src/pkg-diy/components/BeadRing.vue`

- [ ] **Step 1: bead-render.ts（完整实现）**

```ts
// 渲染三级回退：sprite 贴图 → preset 多层合成 → 纯色
// preset 层级定义（与效果板一致）
export interface RenderPreset {
  base: string;            // 底色（无贴图时兜底）
  sheen: number;           // 透光/润透层 alpha（0=无）
  highlight: number;       // 高光强度 0~1
  bubbles: boolean;        // 气泡纹理（琉璃）
  inclusions: boolean;     // 棉点/飘花（玉）
  doubleHighlight?: boolean; // 金属
}
export const PRESETS: Record<string, RenderPreset> = {
  glass:       { base: '#2E6BC4', sheen: 0.14, highlight: 0.9,  bubbles: true,  inclusions: false },
  jade:        { base: '#8FAE92', sheen: 0.10, highlight: 0.55, bubbles: false, inclusions: true },
  'jade-flower': { base: '#3E8E62', sheen: 0.13, highlight: 0.65, bubbles: false, inclusions: true },
  amber:       { base: '#DBA85B', sheen: 0,    highlight: 0.5,  bubbles: false, inclusions: true },
  pearl:       { base: '#EDE4E0', sheen: 0.14, highlight: 0.9,  bubbles: false, inclusions: false },
  metal:       { base: '#C8A23A', sheen: 0,    highlight: 1.0,  bubbles: false, inclusions: false, doubleHighlight: true },
  wood:        { base: '#6B4A32', sheen: 0,    highlight: 0.3,  bubbles: false, inclusions: false },
  matte:       { base: '#B5451F', sheen: 0,    highlight: 0.75, bubbles: false, inclusions: false },
};

export interface RenderBead {
  x: number; y: number; r: number;          // 圆心与半径（px）
  color: string;                            // 素材主色（imageUrl 取色或后台配置）
  preset?: string | null;                   // renderPreset
  sprite?: HTMLImageElement | null;         // renderUrl 加载结果
  seed?: number;                            // 纹理随机种子（稳定渲染）
}

/** 确定性伪随机（棉点/气泡位置稳定，避免重绘跳动） */
function rnd(seed: number) { let s = seed || 1; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function drawBead(ctx: CanvasRenderingContext2D, b: RenderBead) {
  const { x, y, r } = b;
  if (b.sprite) { // L1 贴图
    ctx.drawImage(b.sprite, x - r, y - r, r * 2, r * 2);
    return;
  }
  const p = PRESETS[b.preset ?? ''] ?? null;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = p ? p.base : b.color;      // L2 preset 多层 / L3 纯色
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (p) {
    if (p.sheen > 0) { ctx.fillStyle = `rgba(255,255,255,${p.sheen})`; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.75, 0, Math.PI * 2); ctx.fill(); }
    if (p.inclusions || p.bubbles) {
      const rng = rnd(b.seed ?? 7);
      const n = p.bubbles ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, d = rng() * r * 0.6;
        ctx.fillStyle = `rgba(255,255,255,${p.bubbles ? 0.5 : 0.35})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.04 + rng() * 0.05), 0, Math.PI * 2); ctx.fill();
      }
    }
    // 主高光
    ctx.fillStyle = `rgba(255,255,255,${p.highlight * 0.85})`;
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.3, r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill();
    if (p.doubleHighlight) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.35, r * 0.14, 0, Math.PI * 2); ctx.fill(); }
    // 底部阴影增强立体
    const grad = ctx.createRadialGradient(x, y + r * 0.4, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grad; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

export function drawRing(ctx: CanvasRenderingContext2D, beads: RenderBead[], cx: number, cy: number, rx: number, ry: number, rotation = -Math.PI / 2) {
  const n = beads.length;
  beads.forEach((b, i) => {
    const a = rotation + (Math.PI * 2 * i) / n;
    b.x = cx + rx * Math.cos(a); b.y = cy + ry * Math.sin(a);
    drawBead(ctx, b);
  });
}

/** sprite 预加载（H5: Image；小程序: canvas.createImage 由调用方注入 loader） */
export function loadSprites(urls: (string | null)[], loader: (src: string) => Promise<HTMLImageElement>): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  return Promise.all(urls.filter((u): u is string => !!u).map(async u => {
    try { map.set(u, await loader(u)); } catch { /* 贴图失败静默降级 */ }
  })).then(() => map);
}
```

- [ ] **Step 2: BeadRing.vue（完整实现）**

```vue
<!-- src/pkg-diy/components/BeadRing.vue -->
<template>
  <canvas type="2d" class="bead-ring" :style="{ width: width + 'rpx', height: height + 'rpx' }" :canvas-id="canvasId" :id="canvasId" />
</template>
<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { drawRing, loadSprites, RenderBead } from '../utils/bead-render';

const props = defineProps<{
  canvasId: string;
  width: number; height: number;       // rpx
  beads: Array<{ materialId: string; color: string; diameterMm: number; preset?: string | null; renderUrl?: string | null }>;
  mmPerPx?: number;                    // 直径 mm → px 比例，默认 1.4
}>();
let ctx: CanvasRenderingContext2D | null = null;
let canvasW = 0, canvasH = 0;
const sprites = new Map<string, HTMLImageElement>();

async function loader(src: string): Promise<HTMLImageElement> {
  // #ifdef H5
  return new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = rej; img.src = src; });
  // #endif
  // #ifndef H5
  return Promise.reject(new Error('sprite-fallback')); // 小程序端首期走 preset 层，Task 11 视验证补 createImage
  // #endif
}

async function render() {
  if (!ctx) return;
  const scale = (props.mmPerPx ?? 1.4);
  const rs: RenderBead[] = props.beads.map((b, i) => ({
    x: 0, y: 0, r: (b.diameterMm * scale) / 2,
    color: b.color, preset: b.preset, sprite: sprites.get(b.renderUrl ?? '') ?? null,
    seed: i + 1,
  }));
  ctx.clearRect(0, 0, canvasW, canvasH);
  drawRing(ctx, rs, canvasW / 2, canvasH / 2, canvasW / 2 - Math.max(...rs.map(r => r.r)) - 2, canvasH / 2 - Math.max(...rs.map(r => r.r)) - 2);
}
onMounted(async () => {
  const q = uni.createSelectorQuery().in(getCurrentInstance());
  q.select(`#${props.canvasId}`).fields({ node: true, size: true }).exec(async (res: any) => {
    const node = res?.[0]?.node; if (!node) return;
    const dpr = uni.getSystemInfoSync().pixelRatio;
    node.width = res[0].width * dpr; node.height = res[0].height * dpr;
    ctx = node.getContext('2d'); ctx!.scale(dpr, dpr);
    canvasW = res[0].width; canvasH = res[0].height;
    sprites.clear();
    const urls = props.beads.map(b => b.renderUrl).filter(Boolean) as string[];
    Object.assign(sprites, await loadSprites(urls, loader as any));
    render();
  });
});
watch(() => props.beads, render, { deep: true });
</script>
```

- [ ] **Step 3: H5 冒烟**：`pnpm dev:h5`，临时在 designer 页放 `<BeadRing>` 传 3 颗测试珠，浏览器确认三层回退渲染正常（贴图 404 时自动 preset 层）。
- [ ] **Step 4: 提交**

```bash
cd D:\zhao\vshop && git add src/pkg-diy && git commit -m "feat(pkg-diy): bead-render 三级回退渲染器 + BeadRing 组件"
```

---

## Task 8: vshop —— designer.vue 设计器（4 模式 + 混搭 + 装饰 + 自由拖拽）

**Files:**
- Create: `src/pkg-diy/pages/designer.vue`
- Create: `src/pkg-diy/components/ModeChips.vue`、`MaterialSheet.vue`、`SequenceStrip.vue`、`CalcDetailSheet.vue`

- [ ] **Step 1: spec v2 类型与状态（designer 页内 composable）**

```ts
// src/pkg-diy/composables/useDesigner.ts
import { ref, computed } from 'vue';
import { braceletCalculator } from '../vendor/diy-calc/bracelet-calculator';
import { generateSequence, sequenceGeometry } from '../vendor/diy-calc/sequence';
import type { CalcMaterial, SlotSelection } from '../vendor/diy-calc/types';

export type DesignerMode = 'byWrist' | 'byCount' | 'pattern' | 'free';

export function useDesigner(materials: CalcMaterial[]) {
  const mode = ref<DesignerMode>('byWrist');
  const params = ref({ wristSize: 160, fit: 'comfortable' as 'snug' | 'comfortable' | 'loose', gap: 0.5 });
  const slots = ref<SlotSelection[]>([{ role: 'main', materialId: '' }]);
  const sequence = ref<string[]>([]);

  const result = computed(() => {
    if (mode.value === 'free') return sequenceGeometry(sequence.value, materials, params.value.gap, params.value.wristSize, easeOf());
    return braceletCalculator({ calculatorKey: 'bracelet', materials, slots: slots.value, params: { ...params.value } } as any);
  });
  function easeOf() { return params.value.fit === 'snug' ? 5 : params.value.fit === 'loose' ? 25 : 15; }
  /** free 模式从 pattern 结果一键转入 */
  function enterFree() { mode.value = 'free'; sequence.value = generateSequence(slots.value.filter(s => s.role !== 'decor'), 'alternate', result.value?.calc?.count ?? 0); }
  return { mode, params, slots, sequence, result, enterFree };
}
```

- [ ] **Step 2: designer.vue 主页面**

模板结构（完整实现，样式用 rpx、主题变量 `$brand-color`/css var，BEM 类名 `diy-*`）：

```vue
<template>
  <view class="diy-designer">
    <view class="diy-preview">
      <BeadRing canvas-id="diyPreview" :width="640" :height="380" :beads="previewBeads" />
      <view class="diy-preview__price">{{ totalAmountYuan }}</view>
      <view class="diy-preview__fit" @tap="showCalc = true">{{ innerCircLabel }} · {{ feedbackLabel }}</view>
    </view>
    <ModeChips v-model="designer.mode.value" :count="designer.result.value?.calc?.count" />
    <view v-if="designer.mode.value !== 'free'" class="diy-params">
      <text>{{ t('diy.wristSize') }} {{ (designer.params.value.wristSize / 10).toFixed(1) }}cm</text>
      <slider :value="designer.params.value.wristSize" min="130" max="210" @change="onWrist" />
      <view class="diy-chips">
        <text v-for="f in ['snug','comfortable','loose']" :key="f" :class="['diy-chip', { 'diy-chip--on': designer.params.value.fit === f }]" @tap="designer.params.value.fit = f">{{ t('diy.fit.' + f) }}</text>
      </view>
    </view>
    <MaterialSheet
      v-model:slots="designer.slots.value"
      :materials="materials"
      :mode="designer.mode.value"
      @enter-free="designer.enterFree()"
      @update-sequence="designer.sequence.value = $event"
    />
    <SequenceStrip v-if="designer.mode.value === 'free'" v-model="designer.sequence.value" :materials="materials" />
    <view class="diy-cta" @tap="onSave">{{ t('diy.save') }} · {{ totalAmountYuan }}</view>
    <CalcDetailSheet v-model:show="showCalc" :result="designer.result.value" />
  </view>
</template>
```

script 要点（完整逻辑）：
- `onLoad`：`Promise.all([diyCategories(), diyMaterials(null)])` 填充素材；已登录且有 `planId` 参数则 `myDiyPlan(planId)` 回填 spec 编辑
- `previewBeads` computed：free 模式映射 sequence；pattern 模式由 `generateSequence(slots, arrange, count)` 生成展示序列（arrange chips 传 slots[].arrange）
- `onSave`：未登录跳 `/pages/login/index`（复用 `useAuth().requireLogin()`）；`createDiyPlan({ templateCode: 'bracelet-classic', mode, params, slots, sequence })` → 得 `planId` → `quoteDiyPlan(planId)` 服务端复算，弹「已保存，服务端报价 ¥X」与前端一致校验（不一致以服务端为准并提示）
- 金额分转元展示 `((totalAmount ?? 0) / 100).toFixed(1)`

- [ ] **Step 3: SequenceStrip 自由拖拽（跨端方案）**：H5 用 pointerdown/move 重排序数组；小程序用 `movable-area` + `movable-view`（direction="all"），drop 时按最近插入位重排 `sequence`；长按弹删除确认。两套实现放同组件 `#ifdef` 分支。

- [ ] **Step 4: H5 手动回归**：4 模式切换、改素材实时见价、decor 不影响颗数、free 拖拽重排后内孔变化、保存得 planId。
- [ ] **Step 5: 提交**

```bash
cd D:\zhao\vshop && git add src/pkg-diy && git commit -m "feat(pkg-diy): 设计器 4 模式 + 混搭选料 + 自由拖拽序列 + 计算明细"
```

---

## Task 9: vshop —— plan-detail.vue（明细/BOM/下单/分享）

**Files:**
- Create: `src/pkg-diy/pages/plan-detail.vue`

- [ ] **Step 1: 页面实现**：`onLoad(planId)` → `myDiyPlan`（自己的）或 `diyGalleryPlans` 项（他人公开的，走 gallery 传参）→ 展示 BeadRing 封面渲染 + CalcDetailSheet 常开（几何行/BOM 行/合计）。操作区按钮组：
- 自己的方案：`quoteDiyPlan` 刷新报价 / `publishDiyPlan(isPublic)` 公开或取消 / `createOrderFromPlan` 下单（跳订单确认页 `/pkg-order/pages/confirm`，携带返回的 orderLineId，复用现有下单链路）
- 他人公开方案：`copyDiyPlan` 复制到自己名下跳设计器编辑 / 直接 `createOrderFromPlan` 下单
- 分享：`onShareAppMessage` 返回 `{ title: plan.title, path: '/pkg-diy/pages/plan-detail?planId=' + id, imageUrl: 静态分享图 }`（微信转发卡片复用现有分享体系）
- [ ] **Step 2: 提交**

```bash
cd D:\zhao\vshop && git add src/pkg-diy && git commit -m "feat(pkg-diy): 方案详情（报价/公开/下单/复制/分享）"
```

---

## Task 10: vshop —— gallery.vue + my-plans.vue + 路由入口

**Files:**
- Create: `src/pkg-diy/pages/gallery.vue`、`src/pkg-diy/pages/my-plans.vue`
- Modify: `src/pages.json`、home 页入口

- [ ] **Step 1: gallery.vue**：`diyGallery` 分页加载（onReachBottom 追加）；顶部筛选 chips（推荐=默认排序/最新=按 createdAt——首期仅两种，无独立筛选接口）；卡片 = BeadRing 缩略（coverMaterialIds 渲染）+ 标题 + 作者 + 价格 + 「用这个」按钮 → `plan-detail?planId=&from=gallery`。
- [ ] **Step 2: my-plans.vue**：`myDiyPlans(status)` 状态分段（draft/quoted/ordered 全部）；卡片点击进 plan-detail；下拉刷新。
- [ ] **Step 3: pages.json 注册**

```jsonc
// src/pages.json subPackages 追加
{ "root": "pkg-diy", "pages": [
  { "path": "pages/designer", "style": { "navigationBarTitleText": "串珠设计师" } },
  { "path": "pages/plan-detail", "style": { "navigationBarTitleText": "方案详情" } },
  { "path": "pages/gallery", "style": { "navigationBarTitleText": "作品广场" } },
  { "path": "pages/my-plans", "style": { "navigationBarTitleText": "我的作品" } }
] }
```
home 页金刚区/服务入口按现有页面结构新增「珠宝定制」入口 → `/pkg-diy/pages/gallery`（首页无金刚区则放「分类」页顶部 banner，实现时按实际布局就近落位并在手册记录）。

- [ ] **Step 4: 提交**

```bash
cd D:\zhao\vshop && git add src/pages.json src/pages/index src/pkg-diy && git commit -m "feat(pkg-diy): 作品广场 + 我的作品 + 路由与首页入口"
```

---

## Task 11: vshop 全量验证 + 截图 + 手册

- [ ] **Step 1:** `pnpm build:h5` 成功（产物 dist/build/h5）
- [ ] **Step 2: 手机视口截图（硬规范 390×844 dpr=2）**：Playwright 移动视口遍历 designer（4 模式各 1 张）/ plan-detail / gallery / my-plans，存 `docs/screenshots/pkg-diy/`
- [ ] **Step 3: 操作手册** `docs/pkg-diy-操作手册.md`：功能路径、4 模式说明、公开/购买流程、截图嵌入、测试用例清单
- [ ] **Step 4:** 微信小程序端 `pnpm build:mp-weixin` 确认可构建（SequenceStrip movable 分支无 H5 API 泄漏）

---

## Task 12: 收尾部署（一气呵成）

- [ ] **Step 1: vendure 部署（P5 机制）**

```bash
# 服务器 /www/apps/vendure
git pull && CI=true pnpm install --trust-lockfile && pm2 restart all
# 验证：启动日志 DiyPlugin initialized、新迁移执行、curl shop-api { diyGalleryPlans { total } } = 200
```
- [ ] **Step 2: vshop H5 部署**：先探测站点目录 `ssh <host> "ls /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/"` 确认 H5 真实目录（勿被宿主 /www/sites 干扰）；本地 `pnpm build:h5` 产物整目录覆盖上传；`curl -s https://e.joho.cn/ | grep <new-asset-hash>` 验证。
- [ ] **Step 3:** 冒烟：线上 gallery 打开、设计器保存得 planId、quote 与本地同构一致、公开方案他人可见可下单。
- [ ] **Step 4:** 两仓库各自 push（vendure master、vshop master）；memory 更新 P6 完成状态与踩坑。

---

## Self-Review 记录

- 规格覆盖：4 算量模式（T1/T2/T8）、混搭变径（T2/T8）、打结留量（v1 已有，前端展示 T8/T9）、装饰计价（T2）、贴图渲染三级回退（T7）、保存/广场/购买/分享（T4/T9/T10）、i18n（T6）、部署（T12）✅
- 类型一致性：`SlotSelection.arrange/qtyOverride`、`sequenceGeometry(seq, materials, gap, wristSize, ease, decorSlots)`、`bomItemOf/aggregateItems/pickCordDiameterOf` 在 T1/T2 间一致 ✅
- 风险点已标注：GraphQL 字段名以生产 introspection 为准（T6）；小程序 sprite loader 首期降级 preset 层（T7）；首页入口落位按实际布局（T10）
