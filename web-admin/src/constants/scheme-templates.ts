// 内置常用促销/服务保障模板（双语），供店铺信息页「常用模板」区一键添加。
// 模板库本身只维护中英两行；其他语言由运营在方案明细行按已开启语言补录。
export interface SchemeTemplate {
  code: string;
  zh: string;
  en: string;
}

export const PROMO_TEMPLATES: SchemeTemplate[] = [
  { code: 'freeShip99', zh: '满99元包邮', en: 'Free shipping over ¥99' },
  { code: 'flashSale', zh: '限时特惠', en: 'Flash sale' },
  { code: 'newUser', zh: '新人专享', en: 'New user offer' },
  { code: 'memberPrice', zh: '会员价', en: 'Member price' },
  { code: 'couponPick', zh: '领券立减', en: 'Coupon discount' },
  { code: 'cut60', zh: '满60减20', en: '¥20 off ¥60' },
];

export const SERVICE_TEMPLATES: SchemeTemplate[] = [
  { code: 'genuine', zh: '正品保障', en: 'Genuine product' },
  { code: 'sevenDay', zh: '7天无理由退换', en: '7-day returns' },
  { code: 'fastShip', zh: '极速发货', en: 'Fast shipping' },
  { code: 'faka', zh: '假一赔十', en: '10x refund' },
  { code: 'nationwide', zh: '全国联保', en: 'Nationwide warranty' },
];

/** 方案明细行：text 为「语言码 → 文案」map（落库即 customFields.promoSchemes[].text） */
export interface SchemeRow {
  code: string;
  text: Record<string, string>;
}

// 添加模板到已选列表：同 code 合并覆盖文案，否则追加；返回新数组（不可变）
export function upsertScheme(list: SchemeRow[], tpl: SchemeTemplate): SchemeRow[] {
  const row: SchemeRow = { code: tpl.code, text: { zh_Hans: tpl.zh, en: tpl.en } };
  const idx = list.findIndex((s) => s.code === tpl.code);
  if (idx >= 0) {
    return list.map((s, i) => (i === idx ? { ...row } : s));
  }
  return [...list, row];
}

export function hasScheme(list: SchemeRow[], code: string): boolean {
  return list.some((s) => s.code === code);
}

/** 明细行 → 落库 JSON：过滤空 code；text 保留所有非空语言（含当前未开启语言的既有译文） */
export function serializeSchemes(list: SchemeRow[]): string {
  return JSON.stringify(
    list
      .filter((s) => s.code.trim())
      .map((s) => {
        const text: Record<string, string> = {};
        for (const [lang, v] of Object.entries(s.text || {})) {
          const tv = (v ?? '').trim();
          if (tv) text[lang] = tv;
        }
        return { code: s.code.trim(), text };
      }),
  );
}

/** 落库 JSON → 明细行：坏 JSON / 非数组返回空数组；text 非对象按空处理 */
export function parseSchemes(raw: string | null | undefined): SchemeRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((s: any) => ({
      code: typeof s?.code === 'string' ? s.code : '',
      text: s?.text && typeof s.text === 'object' && !Array.isArray(s.text) ? { ...s.text } : {},
    }));
  } catch {
    return [];
  }
}
