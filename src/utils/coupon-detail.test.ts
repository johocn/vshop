import { describe, expect, it } from 'vitest';
import { hasDetail, parseDetailParagraphs } from './coupon-detail';

describe('hasDetail', () => {
    it('有内容 true / 空白与缺省 false', () => {
        expect(hasDetail({ 'zh-CN': '介绍' }, 'zh-CN')).toBe(true);
        expect(hasDetail({ 'zh-CN': ' ' }, 'zh-CN')).toBe(false);
        expect(hasDetail(null, 'zh-CN')).toBe(false);
    });
});

describe('parseDetailParagraphs', () => {
    it('图文分段 + 非法标记回退', () => {
        expect(parseDetailParagraphs('行一\n![图](https://a.com/1.png)\n![图]()')).toEqual([
            { type: 'text', content: '行一' },
            { type: 'image', content: 'https://a.com/1.png' },
            { type: 'text', content: '![图]()' },
        ]);
    });
});
