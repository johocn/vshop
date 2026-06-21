import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCartStore = defineStore('cart', () => {
    const order = ref<any>(null);
    const loading = ref(false);

    const totalQuantity = computed(() => order.value?.totalQuantity || 0);
    const totalPrice = computed(() => order.value?.totalWithTax || 0);
    const lines = computed(() => order.value?.lines || []);
    const isEmpty = computed(() => totalQuantity.value === 0);

    function setOrder(newOrder: any) { order.value = newOrder; }
    function clearCart() { order.value = null; }

    function formatPrice(cents: number): string {
        return (cents / 100).toFixed(2);
    }

    return { order, loading, totalQuantity, totalPrice, lines, isEmpty, setOrder, clearCart, formatPrice };
});