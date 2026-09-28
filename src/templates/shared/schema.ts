export interface ShopTheme {
    primaryColor?: string;
    accentColor?: string;
}

export interface BannerImage {
    image: string;
    link?: string;
}

export interface BannerSection {
    type: 'banner';
    images: BannerImage[];
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

export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection | FlashSection;

export interface ShopContent {
    version: number;
    theme?: ShopTheme;
    sections: ShopSection[];
}

const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText', 'flash'];

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
    }
    return true;
}