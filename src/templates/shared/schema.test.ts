import { describe, it, expect } from 'vitest';
import { parseShopContent } from './schema';

const base = { version: 1 };
const ok = (sec: any) => parseShopContent(JSON.stringify({ ...base, sections: [sec] })) !== null;
const bad = (sec: any) => parseShopContent(JSON.stringify({ ...base, sections: [sec] })) === null;

describe('usemall 签名楼层 schema', () => {
    it('接受合法 limitGoods', () => {
        expect(ok({ type: 'limitGoods', title: '限时精选', collectionSlug: 'limited', limit: 6 })).toBe(true);
    });
    it('limitGoods 缺省字段合法', () => {
        expect(ok({ type: 'limitGoods' })).toBe(true);
    });
    it('limitGoods limit 越界拒绝', () => {
        expect(bad({ type: 'limitGoods', limit: 21 })).toBe(true);
        expect(bad({ type: 'limitGoods', limit: 0 })).toBe(true);
    });
    it('接受合法 hotGoods', () => {
        expect(ok({ type: 'hotGoods', title: '热门推荐', collectionSlug: 'hot', pageSize: 10 })).toBe(true);
    });
    it('hotGoods pageSize 非法拒绝', () => {
        expect(bad({ type: 'hotGoods', pageSize: 0 })).toBe(true);
        expect(bad({ type: 'hotGoods', pageSize: 21 })).toBe(true);
    });
    it('collectionSlug 非字符串拒绝', () => {
        expect(bad({ type: 'limitGoods', collectionSlug: 123 })).toBe(true);
    });
});

describe('banner style 增强字段', () => {
    it('style=edgeScale 合法', () => {
        expect(ok({ type: 'banner', images: [{ image: 'a.png' }], style: 'edgeScale' })).toBe(true);
    });
    it('无 style 的旧配置兼容', () => {
        expect(ok({ type: 'banner', images: [{ image: 'a.png' }] })).toBe(true);
    });
    it('非法 style 拒绝', () => {
        expect(bad({ type: 'banner', images: [{ image: 'a.png' }], style: 'fancy' })).toBe(true);
    });
});
