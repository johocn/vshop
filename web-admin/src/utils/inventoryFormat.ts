// 库存页面（Plan 2）纯函数：金额/时间格式化 + 枚举 → i18n key 映射
// 约定：金额一律以「分」为单位存储（后端 `value`/`costPrice`/单据金额为 Int 分），仅展示层转元。
// 全部为无副作用纯函数，便于 `npx tsx --test` 单测。

/** 分 → 元字符串（2 位小数）；非法/NaN → '0.00' */
export function fenToYuan(fen: number): string {
  const n = Number(fen);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

/** 分 → 带符号金额；null/负数/非法 → '—'（列表里「无成本价」占位） */
export function moneyLabel(fen: number | null | undefined): string {
  if (fen === null || fen === undefined) return '—';
  const n = Number(fen);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `¥${fenToYuan(n)}`;
}

/** 建议补货量 = max(0, ceil(safetyStock - onHand))；非法 → 0 */
export function suggestQty(safetyStock: number, onHand: number): number {
  const s = Number(safetyStock);
  const h = Number(onHand);
  if (!Number.isFinite(s) || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.ceil(s - h));
}

/** 弹层数量输入解析：非负整数（截断小数）；非法/负数/空 → fallback */
export function parseQtyInput(raw: string | number | null | undefined, fallback = 0): number {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

const BIZ_KEYS: Record<string, string> = {
  order: 'move.order',
  afterSales: 'move.afterSales',
  stockIn: 'move.stockIn',
  stockOut: 'move.stockOut',
  stockMove: 'move.stockMove',
  stocktake: 'move.stocktake',
  purchase: 'move.purchase',
  manual: 'move.manual',
  mirror: 'move.mirror',
};

/** 流水业务类型 → i18n key（未知/空 → 'move.manual'） */
export function bizTypeKey(bizType: string | null | undefined): string {
  return BIZ_KEYS[String(bizType ?? '')] ?? 'move.manual';
}

/** 流水方向 → i18n key（只有 'out' 视为出库） */
export function dirKey(direction: string | null | undefined): 'move.in' | 'move.out' {
  return String(direction ?? '') === 'out' ? 'move.out' : 'move.in';
}

/** 库存分桶 → i18n key（未知/空 → 'bucket.all'） */
export function bucketKey(bucket: string | null | undefined): string {
  const b = String(bucket ?? '');
  if (b === 'out') return 'bucket.out';
  if (b === 'low') return 'bucket.low';
  if (b === 'ok') return 'bucket.ok';
  return 'bucket.all';
}

/** 排序 key 白名单 → i18n key；非法 → 'sort.stockAsc' */
export function sortKey(sort: string | null | undefined): string {
  const s = String(sort ?? '');
  if (s === 'stockDesc') return 'sort.stockDesc';
  if (s === 'gapDesc') return 'sort.gapDesc';
  if (s === 'valueDesc') return 'sort.valueDesc';
  return 'sort.stockAsc';
}

/** ISO 时间 → 'MM-DD HH:mm'（本地时区）；空/非法 → '' */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 日期分组键 'YYYY-MM-DD'（本地时区，流水页按日分组）；空/非法 → '' */
export function dayKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}