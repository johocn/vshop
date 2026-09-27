// 装修 JSON schema（web-admin 独立工程，无法 import 主 youshop 的 schema.ts，本地复制一份）
export interface ShopTheme { primaryColor?: string; accentColor?: string; }
export interface BannerImage { image: string; link?: string; }
export interface BannerSection { type: 'banner'; images: BannerImage[]; }
export interface NoticeSection { type: 'notice'; text: string; }
export interface NavItem { label: string; icon?: string; image?: string; link?: string; }
export type NavShape = 'square' | 'round';
export type NavLayout = 'grid5x2' | 'grid4x2' | 'row';
export interface NavSection { type: 'nav'; items: NavItem[]; shape?: NavShape; layout?: NavLayout; }
export type GoodsLayout = 'compact' | 'masonry' | 'single';
export interface GoodsSection { type: 'goods'; title?: string; collectionId?: string; layout?: GoodsLayout; }
export interface RichTextSection { type: 'richText'; html: string; }
// 热门 / 推荐商品积木（与前台 shop-content schema 对齐；本工程无 LocalizedText，标题用 string）
export type GoodsCardLayout = 'compact' | 'sliding' | 'hero';
export interface HotGoodsSection {
  type: 'hot';
  title?: string;
  source?: 'auto' | 'collection';
  collectionId?: string;
  limit?: number;
  layout?: GoodsCardLayout;
}
export interface RecommendGoodsSection {
  type: 'recommend';
  title?: string;
  source?: 'auto' | 'collection' | 'slugs';
  collectionId?: string;
  slugs?: string[];
  limit?: number;
  layout?: GoodsCardLayout;
  dedupe?: boolean;
}
export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection | HotGoodsSection | RecommendGoodsSection;
export interface ShopContent { version: number; theme?: ShopTheme; sections: ShopSection[]; }

const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText', 'hot', 'recommend'];
const GOODS_SOURCES = {
  hot: ['auto', 'collection'],
  recommend: ['auto', 'collection', 'slugs'],
} as const;
const GOODS_CARD_LAYOUTS = ['compact', 'sliding', 'hero'];

export function parseShopContent(raw: string | null | undefined): ShopContent | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!isValidShopContent(data)) return null;
    return data as ShopContent;
  } catch { return null; }
}

export function isValidShopContent(data: any): data is ShopContent {
  if (!data || typeof data !== 'object') return false;
  if (data.version !== 1) return false;
  if (!Array.isArray(data.sections)) return false;
  for (const sec of data.sections) {
    if (!sec || typeof sec !== 'object') return false;
    if (!VALID_TYPES.includes(sec.type)) return false;
    if (sec.type === 'banner' && (!Array.isArray(sec.images) || sec.images.length === 0)) return false;
    if (sec.type === 'notice' && typeof sec.text !== 'string') return false;
    if (sec.type === 'nav' && (!Array.isArray(sec.items) || sec.items.length === 0)) return false;
    if (sec.type === 'goods' && sec.collectionId != null && typeof sec.collectionId !== 'string') return false;
    if (sec.type === 'richText' && typeof sec.html !== 'string') return false;
    if (sec.type === 'hot' || sec.type === 'recommend') {
      // limit：正整数且 ≤ 30
      if (sec.limit != null && (!Number.isInteger(sec.limit) || sec.limit < 1 || sec.limit > 30)) return false;
      // layout：三选一枚举
      if (sec.layout != null && !GOODS_CARD_LAYOUTS.includes(sec.layout)) return false;
      // source：各自枚举（hot 无 slugs）
      const sources: readonly string[] = sec.type === 'hot' ? GOODS_SOURCES.hot : GOODS_SOURCES.recommend;
      if (sec.source != null && !sources.includes(sec.source)) return false;
      // source=slugs 时必须带字符串数组
      if (sec.source === 'slugs' && (!Array.isArray(sec.slugs) || !sec.slugs.every((s: any) => typeof s === 'string'))) return false;
    }
  }
  return true;
}