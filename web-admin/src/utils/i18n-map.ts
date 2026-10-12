// 多语言内容编辑公共类型与工具（与 vendure feedback-plugin CONTENT_LOCALES 对齐）
export const CONTENT_LOCALES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export type LocaleMap = Record<string, string>;

/** UTF-8 字节数（32KB 上限等校验用） */
export function bytesOf(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 清洗语言映射：去空白值、trim；脏数据（非字符串/空）直接丢弃 */
export function cleanLocaleMap(m?: LocaleMap | null): LocaleMap {
  const out: LocaleMap = {};
  if (!m) return out;
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** 单语言最大字节数（上限校验按语言逐条计，不做求和） */
export function localeMapBytes(m?: LocaleMap | null): number {
  return Object.values(m ?? {}).reduce((acc, v) => Math.max(acc, bytesOf(String(v ?? ''))), 0);
}
