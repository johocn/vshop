/**
 * 图片字段工具（URL 形态）：素材库选择结果 → 去重 / 截断
 *
 * 单图字段（max = 1）选中的新图应直接替换旧图；多图字段保留已有并追加新选。
 */
import type { AssetItem } from '../apis/asset';

export function mergeAssetUrls(current: string[], assets: AssetItem[], max = 1): string[] {
    const next = max > 1 ? [...current] : [];
    for (const a of assets) {
        const url = a.preview || a.source;
        if (url && !next.includes(url)) next.push(url);
    }
    return next.slice(0, max);
}
