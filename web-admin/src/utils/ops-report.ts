// 作业分析报表纯函数：时间窗口切分、KPI 聚合、差异趋势、CSV 行组装。
// 口径见 docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §7.3（务必与规格一致，勿自行发明口径）。
import type { PickBatch } from '../apis/picking';
import type { StocktakeTask, StocktakeDiff } from '../apis/stocktake';

export const SHIPPED_BATCH_STATES = ['SHIPPED', 'HANDOVER', 'REVIEWED'];

export interface OpsWindow {
  start: Date;
  /** 含 */
  end: Date;
  /** 7 | 30 */
  days: number;
}

/** 近 N 天窗口（含今日）：[今天-(N-1) 00:00, 明天 00:00) */
export function buildOpsWindow(days: number, now = new Date()): OpsWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { start, end, days };
}

export function inWindow(iso: string | null | undefined, w: OpsWindow): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= w.start.getTime() && t < w.end.getTime();
}

/** 'YYYY-MM-DD'（本地时区），用于订单列表 custom 时间窗口 */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function countBatches(batches: PickBatch[], w: OpsWindow): number {
  return batches.filter((b) => SHIPPED_BATCH_STATES.includes(String(b.state)) && inWindow(b.createdAt, w)).length;
}

export function sumShippedItems(rows: Array<{ totalQuantity?: number | null }>): number {
  return rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0);
}

/** 已提交/已过账的盘点任务（DRAFT/OPEN/COUNTING/CANCELLED 不计） */
const DONE_TASK_STATES = ['SUBMITTED', 'POSTED'];

export function countStocktakeTasks(tasks: StocktakeTask[], w: OpsWindow): number {
  return tasks.filter((t) => DONE_TASK_STATES.includes(String(t.state)) && inWindow(t.createdAt, w)).length;
}

export interface VarianceRate {
  expected: number;
  diff: number;
  /** 百分比，两位小数字符串；分母为 0 → '0.00' */
  rate: string;
}

export function varianceRate(diffs: StocktakeDiff[]): VarianceRate {
  let expected = 0;
  let diff = 0;
  for (const d of diffs) {
    expected += d?.expectedTotal ?? 0;
    diff += Math.abs(d?.diffCount ?? 0);
  }
  return { expected, diff, rate: expected > 0 ? ((diff / expected) * 100).toFixed(2) : '0.00' };
}

export interface TrendPointRow {
  day: string;
  expected: number;
  diff: number;
}

/** 按日聚合差异趋势（任务归期用 createdAt）；窗口内每一天都有行（无数据日为 0） */
export function varianceTrend(
  pairs: Array<{ createdAt: string; diff: StocktakeDiff }>,
  w: OpsWindow,
): TrendPointRow[] {
  const byDay = new Map<string, { expected: number; diff: number }>();
  for (let i = 0; i < w.days; i++) {
    const d = new Date(w.start);
    d.setDate(d.getDate() + i);
    byDay.set(ymd(d), { expected: 0, diff: 0 });
  }
  for (const p of pairs) {
    const key = ymd(new Date(p.createdAt));
    const cell = byDay.get(key);
    if (!cell) continue;
    cell.expected += p.diff?.expectedTotal ?? 0;
    cell.diff += Math.abs(p.diff?.diffCount ?? 0);
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, ...v }));
}

export interface CounterRow {
  /** 空串表示未记录操作人（页面渲染为「未记录」占位） */
  operator: string;
  count: number;
  qty: number;
}

/**
 * 作业员明细：按操作人聚合单据数与件数（期间用单据 createdAt 归期）。
 * 排序按单据数降序，同数按操作人升序（保证渲染顺序稳定，不随接口返回顺序抖动）。
 */
export function groupByOperator(
  rows: Array<{ operator?: string | null; createdAt?: string | null; totalQty?: number | null }>,
  w: OpsWindow,
): CounterRow[] {
  const map = new Map<string, { count: number; qty: number }>();
  for (const r of rows) {
    if (!inWindow(r.createdAt, w)) continue;
    const key = (r.operator ?? '').trim();
    const cell = map.get(key) ?? { count: 0, qty: 0 };
    cell.count += 1;
    cell.qty += r.totalQty ?? 0;
    map.set(key, cell);
  }
  return [...map.entries()]
    .map(([operator, v]) => ({ operator, ...v }))
    .sort((a, b) => b.count - a.count || a.operator.localeCompare(b.operator));
}