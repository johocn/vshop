/** 全局配置结构化字段表：高频字段提到表单，未列出的仍走 JSON 高级兜底。 */
export type FieldKind = 'color' | 'number' | 'select' | 'boolean';

export interface ConfigField {
  /** 相对 { themeTokens, defaults } 的点路径 */
  path: string;
  kind: FieldKind;
  /** i18n key 后缀，实际 key = `platformGlobalConfig.` + labelKey */
  labelKey: string;
  options?: string[];
  min?: number;
  max?: number;
}

/** 详情页版式（与 ProductDetailRenderer 的 layout 取值一致） */
export const PRODUCT_LAYOUTS = ['classic', 'floor', 'dualBuy'];

/** 详情页功能块（与详情装修页块清单保持一致） */
const PRODUCT_BLOCKS: Array<[key: string, labelKey: string]> = [
  ['gallery', 'blockGallery'],
  ['price', 'blockPrice'],
  ['promo', 'blockPromo'],
  ['service', 'blockService'],
  ['params', 'blockParams'],
  ['reviews', 'blockReviews'],
  ['description', 'blockDescription'],
];

export const GLOBAL_CONFIG_FIELDS: ConfigField[] = [
  { path: 'themeTokens.primaryColor', kind: 'color', labelKey: 'primaryColor' },
  { path: 'themeTokens.accentColor', kind: 'color', labelKey: 'accentColor' },
  { path: 'themeTokens.radius', kind: 'number', labelKey: 'radius', min: 0, max: 48 },
  { path: 'defaults.product.layout', kind: 'select', labelKey: 'layoutLabel', options: PRODUCT_LAYOUTS },
  ...PRODUCT_BLOCKS.map(([key, labelKey]) => ({
    path: `defaults.product.blocks.${key}`,
    kind: 'boolean' as const,
    labelKey,
  })),
];

/** 单字段校验：返回错误码（拼 i18n key `err_<code>`），null = 通过。
 *  空值视为「不设置，沿用上级」，不算非法。 */
export function validateField(f: ConfigField, raw: unknown): string | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  switch (f.kind) {
    case 'color':
      return /^#[0-9a-fA-F]{6}$/.test(String(raw)) ? null : 'color';
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 'number';
      if (f.min != null && n < f.min) return 'min';
      if (f.max != null && n > f.max) return 'max';
      return null;
    }
    case 'select':
      return f.options?.includes(String(raw)) ? null : 'select';
    case 'boolean':
      return typeof raw === 'boolean' ? null : 'boolean';
    default:
      return null;
  }
}