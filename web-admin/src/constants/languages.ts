// Vendure LanguageCode 枚举对应的 12 种语言清单（唯一真相源，UI 与提交共用）
// label 用各语言「本族名」，不随界面语言翻译
export interface LanguageOption {
  /** Vendure LanguageCode */
  code: string;
  /** 本族名，UI 直接展示 */
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'zh_Hans', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'bg', label: 'Български' },
  { code: 'fa', label: 'فارسی' },
];

/** 兜底语言：必须开启且不可关闭（C 端回退终点） */
export const FALLBACK_LANGUAGE_CODE = 'zh_Hans';

/** 默认开启语言集合（方案 A：中英双语起步） */
export const DEFAULT_LANGUAGE_CODES = ['zh_Hans', 'en'];

/** 语言码 → 本族名；未知码原样返回 */
export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** 按 LANGUAGES 声明顺序规范化语言码集合（去重 + 过滤未知码） */
export function normalizeLanguageCodes(codes: string[]): string[] {
  const set = new Set(codes);
  return LANGUAGES.map((l) => l.code).filter((c) => set.has(c));
}
