import { ref } from 'vue';

const KEY = 'vshop:search-history';
const MAX = 10;

/** 搜索历史：本地存储（去重置顶，最多 MAX 条），供搜索页回填与快捷搜索 */
export function useSearchHistory() {
    const list = ref<string[]>((uni.getStorageSync(KEY) as string[]) || []);

    /** 新增词条：去重置顶，超出上限淘汰最旧 */
    function add(term: string) {
        const t = term.trim();
        if (!t) return;
        list.value = [t, ...list.value.filter(x => x !== t)].slice(0, MAX);
        uni.setStorageSync(KEY, list.value);
    }

    function remove(term: string) {
        list.value = list.value.filter(x => x !== term);
        uni.setStorageSync(KEY, list.value);
    }

    function clear() {
        list.value = [];
        uni.removeStorageSync(KEY);
    }

    return { list, add, remove, clear };
}
