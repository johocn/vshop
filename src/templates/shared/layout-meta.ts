// 五级积木模板体系 · 版式注册元数据（纯数据，供 C 端与 web-admin 共用）
export interface LayoutMeta {
  code: string;
  labelZh: string;
  labelEn: string;
  /** 是否消费 sections（积木楼层） */
  consumesSections: boolean;
  /** 该版式认识的楼层类型（consumesSections=false 时为空） */
  sectionTypes: string[];
}

export const LAYOUT_META: LayoutMeta[] = [
  { code: 'default', labelZh: '默认模板', labelEn: 'Default', consumesSections: false, sectionTypes: [] },
  { code: 'fresh', labelZh: '清新模板', labelEn: 'Fresh', consumesSections: false, sectionTypes: [] },
  { code: 'marketplace', labelZh: '市场模板', labelEn: 'Marketplace', consumesSections: false, sectionTypes: [] },
  {
    code: 'dynamic', labelZh: '积木装修', labelEn: 'Dynamic', consumesSections: true,
    sectionTypes: ['banner', 'notice', 'nav', 'goods', 'richText', 'flash', 'video', 'coupon', 'pointsGoods'],
  },
];
