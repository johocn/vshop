import { ref, onMounted } from 'vue';

interface PaginationOptions<T> {
    fetchFn: (params: { take: number; skip: number }) => Promise<{ items: T[]; totalItems: number }>;
    take?: number;
}

/**
 * Infinite scroll + pull-to-refresh composable for list pages.
 * Usage in page:
 *   const { items, loading, hasMore, loadMore, refresh } = usePagination({ fetchFn: loadProducts });
 *   onReachBottom(() => loadMore());
 *   onPullDownRefresh(async () => { await refresh(); uni.stopPullDownRefresh(); });
 */
export function usePagination<T = any>(options: PaginationOptions<T>) {
    const take = options.take || 20;
    const items = ref<T[]>([]) as any;
    const loading = ref(false);
    const hasMore = ref(true);
    const totalItems = ref(0);
    /** 最近一次加载失败的错误（页面据此展示错误态 + 重试按钮），成功即清空 */
    const error = ref('');
    let skip = 0;

    async function loadMore() {
        if (loading.value || !hasMore.value) return;
        loading.value = true;
        try {
            const result = await options.fetchFn({ take, skip });
            const newItems = result.items || [];
            items.value = [...items.value, ...newItems];
            totalItems.value = result.totalItems || 0;
            skip += newItems.length;
            hasMore.value = newItems.length > 0 && items.value.length < totalItems.value;
            error.value = '';
        } catch (e: any) {
            console.error('Pagination load error:', e);
            error.value = e?.response?.errors?.[0]?.message || e?.message || String(e);
        }
        loading.value = false;
    }

    async function refresh() {
        skip = 0;
        hasMore.value = true;
        items.value = [];
        await loadMore();
    }

    onMounted(() => loadMore());

    return { items, loading, hasMore, totalItems, error, loadMore, refresh };
}
