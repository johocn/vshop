// 五级合并纯函数（youshop 侧，与 nshop 同一套语义）：
// L0 全局默认（代码内建） ← L1 全局配置(ShopGlobalConfig) ← L2 风格模板(ShopTemplate)
//   ← L3 店铺覆盖(channel customFields) ← L4 页面/模块内建默认（各页消费方）
// 合并规则：逐级深合并，未配置项回退上一级；数组/标量直接覆盖。

import { PALETTE_PRESETS } from './palette-presets';
import type { PaletteToken } from './palette-presets';

export interface ThemeTokens {
  primaryColor?: string;
  accentColor?: string;
  radius?: number | string;
  [key: string]: unknown;
}

export interface ThemePaletteData {
  scheme?: string;
  name?: string;
  tokens?: PaletteToken;
}

export interface ShopGlobalConfigData {
  id?: string;
  app?: string;
  themeTokens?: Record<string, any> | null;
  defaults?: Record<string, any> | null;
}

export interface ShopTemplateData {
  id?: string;
  name?: string;
  app?: string;
  theme?: Record<string, any> | null;
  pages?: Record<string, any> | null;
  version?: number;
  enabled?: boolean;
}

/** 页面 key → L3 店铺覆盖 channel.customFields 字段名 */
export const PAGE_CF_FIELD: Record<string, string> = {
  product: 'detailConfig',
  home: 'shopContent',
  category: 'pageCategoryConfig',
  cart: 'pageCartConfig',
  profile: 'pageProfileConfig',
};

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 深合并：仅普通对象递归合并；数组/标量直接覆盖；null/undefined 跳过 */
export function deepMerge<T extends Record<string, any>>(
  ...sources: (T | null | undefined)[]
): T {
  const out: Record<string, any> = {};
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null) continue;
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = deepMerge(out[k], v);
      } else {
        out[k] = v;
      }
    }
  }
  return out as T;
}

/** 解析模板 theme 中的配色：优先按 palette.scheme 从预设查询并展开 tokens；
 *  无 scheme 或未知 scheme → 回退 {}，有 scheme 且带显式 tokens 时二者并存（显式覆盖预设）。 */
export function resolvePaletteTokens(template: ShopTemplateData | null): PaletteToken | null {
  const palette = template?.theme?.palette as ThemePaletteData | null | undefined;
  if (!palette || typeof palette !== 'object') return null;
  const preset = typeof palette.scheme === 'string' ? PALETTE_PRESETS[palette.scheme] : undefined;
  const presetTokens = preset ? preset.tokens : {};
  return deepMerge<PaletteToken>({}, presetTokens, palette.tokens ?? null);
}

/** 解析渠道 L3 令牌覆盖（Vendure text customField）；坏 JSON/非对象 → null（视为不覆盖） */
export function parseThemeTokensOverride(raw: string | null | undefined): Record<string, any> | null {
  return parseJsonText(raw);
}

/** 主题令牌合并：L1 全局 themeTokens ← L2 模板（palette 展开 + 显式 theme）← L3 店铺覆盖 */
export function mergeThemeTokens(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelThemeOverride?: Record<string, any> | null,
): ThemeTokens {
  return deepMerge<ThemeTokens>(
    {},
    globalConfig?.themeTokens ?? null,
    resolvePaletteTokens(template),
    template?.theme ?? null,
    channelThemeOverride ?? null,
  );
}

/** 解析店铺覆盖 JSON 字符串（Vendure text customField）；坏 JSON/非对象 → null */
export function parseJsonText(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

/** 单页五级合并：L0 {} ← L1 defaults[page] ← L2 template.pages[page] ← L3 店铺覆盖 JSON */
export function mergePageConfig(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelCfs: Record<string, any> | null,
  page: string,
): Record<string, any> | null {
  const field = PAGE_CF_FIELD[page];
  const shopRaw = field ? channelCfs?.[field] ?? null : null;
  const shop =
    typeof shopRaw === 'string'
      ? parseJsonText(shopRaw)
      : isPlainObject(shopRaw)
        ? shopRaw
        : null;
  const merged = deepMerge(
    {},
    globalConfig?.defaults?.[page] ?? null,
    template?.pages?.[page] ?? null,
    shop,
  );
  return Object.keys(merged).length ? merged : null;
}

/** 版式注册白名单（与 src/templates/layouts.ts LAYOUT_COMPONENTS 同步；'dynamic' = 积木装修渲染器） */
export const KNOWN_LAYOUTS = ['default', 'fresh', 'marketplace', 'dynamic'] as const;
export type HomeLayout = (typeof KNOWN_LAYOUTS)[number];

/** layout 五级解析：L0 'default' ← L1 defaults.home.layout ← L2 pages.home.layout ← L3 displayTemplate；
 *  坏值/未知值回 'default'（纯函数，SSR/双端安全） */
export function resolveHomeLayout(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelCfs: Record<string, any> | null,
): HomeLayout {
  const pick = (v: unknown): string | null =>
    typeof v === 'string' && v && KNOWN_LAYOUTS.includes(v as HomeLayout) ? v : null;
  const l1 = pick((globalConfig?.defaults as any)?.home?.layout);
  const l2 = pick(template?.pages?.home?.layout);
  const l3 = pick(channelCfs?.displayTemplate);
  return (l3 ?? l2 ?? l1 ?? 'default') as HomeLayout;
}
