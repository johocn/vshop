import { describe, expect, it } from 'vitest';
import { mergeAssetUrls } from './media';
import type { AssetItem } from '../apis/asset';

function asset(id: string, preview: string, source = ''): AssetItem {
    return { id, preview, source } as AssetItem;
}

describe('图片库字段工具', () => {
    it('按 preview URL 去重并保持顺序', () => {
        const out = mergeAssetUrls(['https://a.png'], [asset('1', 'https://a.png'), asset('2', 'https://b.png')], 9);
        expect(out).toEqual(['https://a.png', 'https://b.png']);
    });

    it('单图字段截断为 1，preview 缺失时回退 source', () => {
        expect(mergeAssetUrls([], [asset('1', 'https://a.png'), asset('2', 'https://b.png')], 1)).toEqual(['https://a.png']);
        expect(mergeAssetUrls([], [asset('3', '', 'https://c.png')], 1)).toEqual(['https://c.png']);
    });

    it('单图字段选新图时替换旧图（上传后可直接使用）', () => {
        expect(mergeAssetUrls(['https://old.png'], [asset('9', 'https://new.png')], 1)).toEqual(['https://new.png']);
    });
});
