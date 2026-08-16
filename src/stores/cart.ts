import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const CART_TAB_INDEX = 2;

export const useCartStore = defineStore('cart', () => {
    const order = ref<any>(null);
    const loading = ref(false);

    const totalQuantity = computed(() => order.value?.totalQuantity || 0);
    const totalPrice = computed(() => order.value?.totalWithTax || 0);
    const lines = computed(() => order.value?.lines || []);
    const isEmpty = computed(() => totalQuantity.value === 0);

    /**
     * 按商家分组购物车行。
     * 当前 line 的 productVariant 未携带 merchantRef（ORDER/CART fragment 不含该 customField），
     * 因此预留扩展点：优先读取 line.productVariant.customFields.merchantRef；
     * 若缺失则归入"自营"分组（单组）。
     */
    const groupedLines = computed(() => {
        const groups: Array<{ key: string; name: string; lines: any[] }> = [];
        const index = new Map<string, number>();
        lines.value.forEach((line: any) => {
            const merchantRef = line?.productVariant?.customFields?.merchantRef;
            const key = merchantRef ? String(merchantRef) : 'self';
            if (!index.has(key)) {
                index.set(key, groups.length);
                groups.push({ key, name: merchantRef ? `商家 ${merchantRef}` : '自营', lines: [] });
            }
            groups[index.get(key)!].lines.push(line);
        });
        return groups;
    });

    function updateBadge() {
        const qty = totalQuantity.value;
        if (qty > 0) {
            uni.setTabBarBadge({ index: CART_TAB_INDEX, text: String(qty) });
        } else {
            uni.removeTabBarBadge({ index: CART_TAB_INDEX });
        }
    }

    function setOrder(newOrder: any) {
        order.value = newOrder;
        updateBadge();
    }
    function clearCart() {
        order.value = null;
        updateBadge();
    }

    function formatPrice(cents: number): string {
        return (cents / 100).toFixed(2);
    }

    return { order, loading, totalQuantity, totalPrice, lines, groupedLines, isEmpty, setOrder, clearCart, formatPrice, updateBadge };
});