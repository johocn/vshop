/**
 * useBrowsingHistory 单元测试（vitest，node 环境）：
 * - add：按 slug 去重置顶 / 上限 100 条淘汰最旧 / 回写存储
 * - remove：单删；clear：清空并删 key
 * - groupByDay 分组边界：今天 23:59 → today，昨天 00:00 → yesterday，前天 → earlier，空组不返回
 * uni 存储以全局 stub 模拟；时间戳按本地时区构造（与 groupByDay 的本地日期口径一致）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useBrowsingHistory, type BrowsingItem } from '../useBrowsingHistory';

const KEY = 'vshop:browsing-history';
let store: Record<string, unknown>;

beforeEach(() => {
    store = {};
    (globalThis as any).uni = {
        getStorageSync: (k: string) => (k in store ? store[k] : ''),
        setStorageSync: (k: string, v: unknown) => { store[k] = v; },
        removeStorageSync: (k: string) => { delete store[k]; },
    };
});

/** 构造足迹项（ts 由 add 内部生成） */
function item(slug: string, over: Partial<Omit<BrowsingItem, 'ts'>> = {}): Omit<BrowsingItem, 'ts'> {
    return { slug, id: 'p-' + slug, name: '商品' + slug, price: 990, image: 'https://cdn/' + slug + '.jpg', ...over };
}

/** 相对今天偏移 dayOffset 天的本地时刻时间戳 */
function at(dayOffset: number, h: number, m: number): number {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
}

describe('useBrowsingHistory', () => {
    it('add：同 slug 去重置顶且 ts 更新', () => {
        const { list, add } = useBrowsingHistory();
        add(item('a'));
        add(item('b'));
        add(item('a'));
        expect(list.value.map(x => x.slug)).toEqual(['a', 'b']);
        expect(list.value[0].ts).toBeGreaterThanOrEqual(list.value[1].ts);
    });

    it('add：上限 100 条，淘汰最旧', () => {
        const { list, add } = useBrowsingHistory();
        for (let i = 1; i <= 102; i++) add(item('s' + i));
        expect(list.value).toHaveLength(100);
        expect(list.value[0].slug).toBe('s102');
        expect(list.value.map(x => x.slug)).not.toContain('s1');
        expect(list.value.map(x => x.slug)).not.toContain('s2');
    });

    it('add：回写存储', () => {
        const { add } = useBrowsingHistory();
        add(item('a'));
        expect((store[KEY] as BrowsingItem[])[0].slug).toBe('a');
    });

    it('remove：按 slug 删除并回写', () => {
        const { list, add, remove } = useBrowsingHistory();
        add(item('a')); add(item('b'));
        remove('a');
        expect(list.value.map(x => x.slug)).toEqual(['b']);
        expect((store[KEY] as BrowsingItem[]).map(x => x.slug)).toEqual(['b']);
    });

    it('clear：清空列表并删除存储 key', () => {
        const { list, add, clear } = useBrowsingHistory();
        add(item('a'));
        clear();
        expect(list.value).toEqual([]);
        expect(KEY in store).toBe(false);
    });

    it('groupByDay：今天 23:59 归 today', () => {
        const { groupByDay } = useBrowsingHistory();
        const groups = groupByDay([{ ...item('a'), ts: at(0, 23, 59) }]);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('today');
        expect(groups[0].items[0].slug).toBe('a');
    });

    it('groupByDay：昨天 00:00 归 yesterday', () => {
        const { groupByDay } = useBrowsingHistory();
        const groups = groupByDay([{ ...item('b'), ts: at(-1, 0, 0) }]);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('yesterday');
    });

    it('groupByDay：前天归 earlier，三组按 today/yesterday/earlier 排列，空组不返回', () => {
        const { groupByDay } = useBrowsingHistory();
        const groups = groupByDay([
            { ...item('c'), ts: at(-2, 12, 0) },
            { ...item('b'), ts: at(-1, 8, 30) },
            { ...item('a'), ts: at(0, 9, 0) },
        ]);
        expect(groups.map(g => g.label)).toEqual(['today', 'yesterday', 'earlier']);
        expect(groups.map(g => g.items[0].slug)).toEqual(['a', 'b', 'c']);
    });

    it('groupByDay：空列表返回空数组', () => {
        const { groupByDay } = useBrowsingHistory();
        expect(groupByDay([])).toEqual([]);
    });
});
