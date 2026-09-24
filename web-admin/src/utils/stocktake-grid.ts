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