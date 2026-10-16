export interface ShopTheme {
    primaryColor?: string;
    accentColor?: string;
}

export interface BannerImage {
    image: string;
    link?: string;
}

export type BannerStyle = 'edgeScale';

export interface BannerSection {
    type: 'banner';
    images: BannerImage[];
    /** usemall 版式露边缩放轮播样式（可选，缺省为普通轮播） */
    style?: BannerStyle;
}

export interface NoticeSection {
    type: 'notice';
    text: string;
}

export interface NavItem {
    label: string;
    icon?: string;
    image?: string;
    link?: string;
}

export type NavShape = 'square' | 'round';

export type NavLayout = 'grid5x2' | 'grid4x2' | 'row';

export interface NavSection {
    type: 'nav';
    items: NavItem[];
    shape?: NavShape;
    layout?: NavLayout;
}

export type GoodsLayout = 'compact' | 'masonry' | 'single';

export interface GoodsSection {
    type: 'goods';
    title?: string;
    collectionId?: string;
    layout?: GoodsLayout;
}

export type FlashSource = 'flashSale';
export type FlashLayout = 'row' | 'grid2';

export interface FlashSection {
    type: 'flash';
    /** 后台可配标题；字符串或 locale 字典（LocalizedText） */
    title?: string | Record<string, string>;
    source: FlashSource;
    layout?: FlashLayout;
    /** 楼层最多取几条活动，默认 4，范围 1..20 */
    limit?: number;
}

export interface RichTextSection {
    type: 'richText';
    html: string;
}

export interface VideoSection {
    type: 'video';
    /** 标题；字符串或 locale 字典（LocalizedText） */
    title?: string | Record<string, string>;
    poster?: string;
    videoUrl: string;
}

export interface CouponSection {
    type: 'coupon';
    title?: string | Record<string, string>;
    /** 最多展示张数，默认 6，范围 1..20 */
    limit?: number;
}

export interface PointsGoodsSection {
    type: 'pointsGoods';
    title?: string | Record<string, string>;
    /** 最多展示件数，默认 6，范围 1..20 */
    limit?: number;
}

export interface LimitGoodsSection {
    type: 'limitGoods';
    /** 标题；字符串或 locale 字典（LocalizedText） */
    title?: string | Record<string, string>;
    /** 商品集合 slug（searchProducts 分页取数） */
    collectionSlug?: string;
    /** 楼层最多取几件，默认 6，范围 1..20 */
    limit?: number;
}

export interface HotGoodsSection {
    type: 'hotGoods';
    /** 标题；字符串或 locale 字典（LocalizedText） */
    title?: string | Record<string, string>;
    /** 商品集合 slug（searchProducts 分页加载） */
    collectionSlug?: string;
    /** 每页条数，默认 10，范围 1..20 */
    pageSize?: number;
}

export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection | FlashSection | VideoSection | CouponSection | PointsGoodsSection | LimitGoodsSection | HotGoodsSection;

export interface ShopContent {
    version: number;
    theme?: ShopTheme;
    sections: ShopSection[];
}

const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText', 'flash', 'video', 'coupon', 'pointsGoods', 'limitGoods', 'hotGoods'];

export function parseShopContent(raw: string | null | undefined): ShopContent | null {
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!isValidShopContent(data)) return null;
        return data as ShopContent;
    } catch {
        return null;
    }
}

export function isValidShopContent(data: any): data is ShopContent {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== 1) return false;
    if (!Array.isArray(data.sections)) return false;
    if (data.theme !== undefined && data.theme !== null) {
        if (typeof data.theme !== 'object') return false;
    }
    for (const sec of data.sections) {
        if (!sec || typeof sec !== 'object') return false;
        if (!VALID_TYPES.includes(sec.type)) return false;
        if (sec.type === 'banner' && (!Array.isArray(sec.images) || sec.images.length === 0)) return false;
        if (sec.type === 'banner' && sec.style != null && sec.style !== 'edgeScale') return false;
        if (sec.type === 'notice' && typeof sec.text !== 'string') return false;
        if (sec.type === 'nav' && (!Array.isArray(sec.items) || sec.items.length === 0)) return false;
        if (sec.type === 'goods' && sec.collectionId != null && typeof sec.collectionId !== 'string') return false;
        if (sec.type === 'richText' && typeof sec.html !== 'string') return false;
        if (sec.type === 'flash') {
            if (sec.source !== 'flashSale') return false;
            if (sec.layout != null && sec.layout !== 'row' && sec.layout !== 'grid2') return false;
            if (sec.limit != null && typeof sec.limit !== 'number') return false;
            if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
        }
        if (sec.type === 'video') {
            if (typeof sec.videoUrl !== 'string' || !sec.videoUrl) return false;
            if (sec.poster != null && typeof sec.poster !== 'string') return false;
            if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
        }
        if (sec.type === 'coupon' || sec.type === 'pointsGoods') {
            if (sec.limit != null && (typeof sec.limit !== 'number' || sec.limit < 1 || sec.limit > 20)) return false;
            if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
        }
        if (sec.type === 'limitGoods' || sec.type === 'hotGoods') {
            if (sec.collectionSlug != null && typeof sec.collectionSlug !== 'string') return false;
            if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
            if (sec.type === 'limitGoods' && sec.limit != null && (typeof sec.limit !== 'number' || sec.limit < 1 || sec.limit > 20)) return false;
            if (sec.type === 'hotGoods' && sec.pageSize != null && (typeof sec.pageSize !== 'number' || sec.pageSize < 1 || sec.pageSize > 20)) return false;
        }
    }
    return true;
}