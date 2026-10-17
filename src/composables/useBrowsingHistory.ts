import { ref } from 'vue';

export interface BrowsingItem {
    slug: string;
    id: string;
    name: string;
    /** 含税分（与商品卡 priceWithTax 同口径） */
    price: number;
    image: string;
    ts: number;
}

const KEY = 'vshop:browsing-history';
const MAX = 100;
const DAY_MS = 86400000;

/** 我的足迹：本地存储（按 slug 去重置顶，最多 MAX 条），仅保存在本机 */
export function useBrowsingHistory() {
    const list = ref<BrowsingItem[]>((uni.getStorageSync(KEY) as BrowsingItem[]) || []);

    /** 新增足迹：同 slug 去重置顶，超出上限淘汰最旧 */
    function add(item: Omit<BrowsingItem, 'ts'>) {
        list.value = [{ ...item, ts: Date.now() }, ...list.value.filter(x => x.slug !== item.slug)].slice(0, MAX);
        uni.setStorageSync(KEY, list.value);
    }

    function remove(slug: string) {
        list.value = list.value.filter(x => x.slug !== slug);
        uni.setStorageSync(KEY, list.value);
    }

    function clear() {
        list.value = [];
        uni.removeStorageSync(KEY);
    }

    /** 纯函数：按本地日期分今天/昨天/更早三组（空组不返回），供页面与测试用 */
    function groupByDay(items: BrowsingItem[]): Array<{ label: 'today' | 'yesterday' | 'earlier'; items: BrowsingItem[] }> {
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const today = startOfDay(new Date());
        const yesterday = today - DAY_MS;
        const groups: Array<{ label: 'today' | 'yesterday' | 'earlier'; items: BrowsingItem[] }> = [
            { label: 'today', items: [] },
            { label: 'yesterday', items: [] },
            { label: 'earlier', items: [] },
        ];
        for (const it of items) {
            const day = startOfDay(new Date(it.ts));
            if (day >= today) groups[0].items.push(it);
            else if (day >= yesterday) groups[1].items.push(it);
            else groups[2].items.push(it);
        }
        return groups.filter(g => g.items.length > 0);
    }

    return { list, add, remove, clear, groupByDay };
}
