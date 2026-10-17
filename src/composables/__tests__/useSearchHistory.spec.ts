/**
 * useSearchHistory 单元测试（vitest，node 环境）：
 * - add：去重置顶 / 空白串 no-op / 上限 10 条淘汰最旧
 * - remove：单删并回写存储
 * - clear：清空并删除存储 key
 * - 初始化：从本地存储恢复
 * uni 存储以全局 stub 模拟（与真实 uni.getStorageSync 缺失返回 '' 对齐）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchHistory } from '../useSearchHistory';

const KEY = 'vshop:search-history';
let store: Record<string, unknown>;

beforeEach(() => {
    store = {};
    (globalThis as any).uni = {
        getStorageSync: (k: string) => (k in store ? store[k] : ''),
        setStorageSync: (k: string, v: unknown) => { store[k] = v; },
        removeStorageSync: (k: string) => { delete store[k]; },
    };
});

describe('useSearchHistory', () => {
    it('add：去重并置顶', () => {
        const { list, add } = useSearchHistory();
        add('a'); add('b'); add('c'); add('a');
        expect(list.value).toEqual(['a', 'c', 'b']);
    });

    it('add：空白串不记录', () => {
        const { list, add } = useSearchHistory();
        add('   ');
        expect(list.value).toEqual([]);
        add('x');
        add('  ');
        expect(list.value).toEqual(['x']);
    });

    it('add：上限 10 条，淘汰最旧', () => {
        const { list, add } = useSearchHistory();
        for (let i = 1; i <= 12; i++) add('词' + i);
        expect(list.value).toHaveLength(10);
        expect(list.value[0]).toBe('词12');
        expect(list.value).not.toContain('词1');
        expect(list.value).not.toContain('词2');
        expect(list.value).toContain('词3');
    });

    it('add：每次变更回写存储', () => {
        const { add } = useSearchHistory();
        add('a');
        expect(store[KEY]).toEqual(['a']);
    });

    it('remove：删除指定词条并回写', () => {
        const { list, add, remove } = useSearchHistory();
        add('a'); add('b');
        remove('a');
        expect(list.value).toEqual(['b']);
        expect(store[KEY]).toEqual(['b']);
    });

    it('clear：清空列表并删除存储 key', () => {
        const { list, add, clear } = useSearchHistory();
        add('a'); add('b');
        clear();
        expect(list.value).toEqual([]);
        expect(KEY in store).toBe(false);
    });

    it('初始化：从本地存储恢复历史', () => {
        store[KEY] = ['x', 'y'];
        const { list } = useSearchHistory();
        expect(list.value).toEqual(['x', 'y']);
    });
});
