/**
 * 券详情图文分段（与 nshop utils/coupon-mall.ts 同规则：整行 `![图](url)` 为图片段，其余为文本段）。
 * description 为本地化后的纯字符串（后端按会话语言本地化），兼容 LocalizedText 映射（如 { "zh-CN": "...", "en": "..." }）。
 */

export interface DetailParagraph {
    type: 'text' | 'image';
    content: string;
}

const IMG_LINE_RE = /^!\[[^\]]*\]\(([^)]+)\)$/;

/** 按行分段：整行图片标记解析为图片段，非法标记（如 URL 为空）回退为文本段 */
export function parseDetailParagraphs(text: string): DetailParagraph[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map<DetailParagraph>((line) => {
            const m = IMG_LINE_RE.exec(line);
            return m && m[1] ? { type: 'image', content: m[1] } : { type: 'text', content: line };
        });
}

/** description（字符串或 LocalizedText 映射）非空白才视为有详情；映射时当前语言缺失回退任一语言内容 */
export function hasDetail(description: unknown, locale: string): boolean {
    if (!description) return false;
    if (typeof description === 'string') return description.trim().length > 0;
    const map = description as Record<string, string>;
    const text = map[locale] || Object.values(map)[0] || '';
    return text.trim().length > 0;
}
