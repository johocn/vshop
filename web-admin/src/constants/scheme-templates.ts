// 内置常用促销/服务保障模板（双语），供店铺信息页「常用模板」区一键添加
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

export interface SchemeRow {
  code: string;
  zh: string;
  en: string;
}

// 添加模板到已选列表：同 code 合并覆盖文案，否则追加；返回新数组（不可变）
export function upsertScheme(list: SchemeRow[], tpl: SchemeTemplate): SchemeRow[] {
  const row: SchemeRow = { code: tpl.code, zh: tpl.zh, en: tpl.en };
  const idx = list.findIndex((s) => s.code === tpl.code);
  if (idx >= 0) {
    return list.map((s, i) => (i === idx ? { ...row } : s));
  }
  return [...list, row];
}

export function hasScheme(list: SchemeRow[], code: string): boolean {
  return list.some((s) => s.code === code);
}
