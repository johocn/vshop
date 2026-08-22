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
    link?: string;
}

export interface NavSection {
    type: 'nav';
    items: NavItem[];
}

export interface GoodsSection {
    type: 'goods';
    title?: string;
    collectionId: string;
}

export interface RichTextSection {
    type: 'richText';
    html: string;
}

export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection;

export interface ShopContent {
    version: number;
    theme?: ShopTheme;
    sections: ShopSection[];
}

const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText'];

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
        if (sec.type === 'goods' && typeof sec.collectionId !== 'string') return false;
        if (sec.type === 'richText' && typeof sec.html !== 'string') return false;
    }
    return true;
}