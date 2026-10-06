/** 金额分↔元转换（拾光达配置页用）：分存储/传输，页面展示与录入用元 */

/** 分 → 元字符串（去尾零，最多两位小数；null/undefined → ''） */
export function fenToYuan(fen: number | null | undefined): string {
  if (fen == null) return '';
  const s = (fen / 100).toFixed(2);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** 元字符串 → 分；非法（空/非数字/负数/超两位小数）→ null，由调用方拦截提示 */
export function yuanToFen(input: string): number | null {
  const s = (input ?? '').trim();
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
