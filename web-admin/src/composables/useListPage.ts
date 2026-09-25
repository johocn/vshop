// 列表页公共层：分页 + 下拉刷新 + 上滑加载 + 筛选态 + 竞态防护。
// 契约见 docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §4.1。
// 用法：在页面 setup 中调用；composable 内部已注册 onReachBottom / onPullDownRefresh。
import { computed, ref, type Ref } from 'vue';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';

export interface ListQueryParams {
  skip: number;
  take: number;
  filter: Record<string, unknown>;
  sort?: Record<string, string>;
}

export interface ListPageOptions<T> {
  fetcher: (p: ListQueryParams) => Promise<{ items: T[]; total: number }>;
  /** 每页条数，默认 20 */
  take?: number;
  /** 是否立即加载首页，默认 true */
  immediate?: boolean;
  /** 是否仅在窄屏（< 768px）做上滑加载，桌面端交给页面自己的分页条，默认 true */
  mobileOnly?: boolean;
  /** 失败回调，默认 uni.showToast */
  onError?: (e: unknown) => void;
}

export function useListPage<T>(options: ListPageOptions<T>) {
  const take = options.take ?? 20;
  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const loadingMore = ref(false);
  const finished = ref(false);
  const error = ref('');
  const filter = ref<Record<string, unknown>>({});
  const sort = ref<Record<string, string> | undefined>(undefined);

  // 竞态防护：自增请求序号，只有最新一次结果允许写入
  let seq = 0;

  const shown = computed(() => items.value.length);
  const hasMore = computed(() => items.value.length < total.value);

  function isMobile(): boolean {
    if (!options.mobileOnly) return true;
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  }

  function fail(e: unknown) {
    const msg = (e as any)?.response?.errors?.[0]?.message ?? (e as any)?.message ?? String(e);
    error.value = msg;
    if (options.onError) options.onError(e);
    else uni.showToast({ title: msg, icon: 'none' });
  }

  async function loadFirst() {
    const my = ++seq;
    loading.value = true;
    loadingMore.value = false;
    error.value = '';
    try {
      const r = await options.fetcher({ skip: 0, take, filter: filter.value, sort: sort.value });
      if (my !== seq) return;
      items.value = r.items;
      total.value = r.total;
      finished.value = r.items.length >= r.total;
    } catch (e) {
      if (my === seq) fail(e); // 失败保留上一次结果，不清空
    } finally {
      if (my === seq) loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || finished.value) return;
    if (!isMobile()) return;
    const my = ++seq;
    loadingMore.value = true;
    try {
      const r = await options.fetcher({
        skip: items.value.length,
        take,
        filter: filter.value,
        sort: sort.value,
      });
      if (my !== seq) return;
      items.value = items.value.concat(r.items);
      total.value = r.total;
      finished.value = r.items.length === 0 || items.value.length >= r.total;
    } catch (e) {
      if (my === seq) fail(e);
    } finally {
      if (my === seq) loadingMore.value = false;
    }
  }

  async function refresh() {
    finished.value = false;
    await loadFirst();
  }

  async function applyFilter(f: Record<string, unknown>) {
    filter.value = f;
    await refresh();
  }

  async function resetFilter() {
    filter.value = {};
    await refresh();
  }

  function setSort(s?: Record<string, string>) {
    sort.value = s;
    return refresh();
  }

  // ---- onLoad query 双向同步（进详情返回不丢筛选；同时支持分享/深链） ----
  function syncFromQuery(query: Record<string, string | undefined>) {
    const next: Record<string, unknown> = { ...filter.value };
    for (const [k, v] of Object.entries(query)) {
      if (k.startsWith('f_') && v != null && v !== '') next[k.slice(2)] = v;
    }
    filter.value = next;
  }
  function toQuery(): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(filter.value)) {
      if (v == null || v === '') continue;
      parts.push(`f_${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join('&');
  }

  onReachBottom(loadMore);
  onPullDownRefresh(async () => {
    await refresh();
    uni.stopPullDownRefresh();
  });
  if (options.immediate !== false) void loadFirst();

  return {
    items, total, loading, loadingMore, finished, error, filter, sort,
    shown, hasMore,
    loadFirst, loadMore, refresh, applyFilter, resetFilter, setSort,
    syncFromQuery, toQuery,
  };
}