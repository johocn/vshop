<template>
  <view class="cart-page">
    <view v-if="cartLines.length > 0" class="cart-list">
      <view v-for="line in cartLines" :key="line.id" class="cart-item">
        <view class="cart-item__check" @click="toggleSelect(line.id)">
          <text class="check-icon">{{ isSelected(line.id) ? '☑' : '☐' }}</text>
        </view>
        <VImage :src="line.featuredAsset?.preview || ''" width="160rpx" height="160rpx" class="cart-item__img" />
        <view class="cart-item__info">
          <text class="cart-item__name">{{ line.productVariant?.name }}</text>
          <text class="cart-item__spec">{{ line.productVariant?.options?.map((o:any)=>o.name).join(' ') }}</text>
          <view class="cart-item__bottom">
            <PriceTag :price="line.unitPriceWithTax" />
            <view class="qty-control">
              <text class="qty-btn" @click="changeQty(line, -1)">-</text>
              <text class="qty-num">{{ line.quantity }}</text>
              <text class="qty-btn" @click="changeQty(line, 1)">+</text>
            </view>
          </view>
        </view>
        <text class="cart-item__del" @click="removeLine(line.id)">×</text>
      </view>
    </view>
    <EmptyState v-else-if="!loading" text="购物车是空的" />

    <view class="cart-footer" v-if="cartLines.length > 0">
      <view class="cart-footer__left" @click="toggleAll">
        <text class="check-icon">{{ allSelected ? '☑' : '☐' }}</text>
        <text>全选</text>
      </view>
      <view class="cart-footer__right">
        <text class="cart-footer__total">合计: <text class="price">¥{{ totalYuan }}</text></text>
        <button class="cart-footer__btn" :disabled="selectedCount === 0" @click="goCheckout">
          结算({{ selectedCount }})
        </button>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { useUIStore } from '../../stores/ui';
import { getActiveOrder } from '../../api/queries/order';
import { adjustOrderLine, removeOrderLine } from '../../api/mutations/cart';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';

const cart = useCartStore();
const ui = useUIStore();
const loading = ref(true);
const selectedIds = ref<Set<string>>(new Set());

const cartLines = computed(() => cart.lines);
const allSelected = computed(() => cartLines.value.length > 0 && selectedIds.value.size === cartLines.value.length);
const selectedCount = computed(() => selectedIds.value.size);
const totalYuan = computed(() => {
    let total = 0;
    cartLines.value.forEach((l: any) => {
        if (selectedIds.value.has(l.id)) total += l.unitPriceWithTax * l.quantity;
    });
    return (total / 100).toFixed(2);
});

onShow(() => loadCart());

async function loadCart() {
    loading.value = true;
    try {
        const res: any = await getActiveOrder();
        if (res.activeOrder) {
            cart.setOrder(res.activeOrder);
            // Auto-select all
            const ids = new Set<string>();
            (res.activeOrder.lines || []).forEach((l: any) => ids.add(l.id));
            selectedIds.value = ids;
        }
    } catch (e) {}
    loading.value = false;
}

function isSelected(id: string) { return selectedIds.value.has(id); }

function toggleSelect(id: string) {
    const s = new Set(selectedIds.value);
    if (s.has(id)) s.delete(id); else s.add(id);
    selectedIds.value = s;
}

function toggleAll() {
    if (allSelected.value) {
        selectedIds.value = new Set();
    } else {
        const ids = new Set<string>();
        cartLines.value.forEach((l: any) => ids.add(l.id));
        selectedIds.value = ids;
    }
}

async function changeQty(line: any, delta: number) {
    const newQty = line.quantity + delta;
    if (newQty <= 0) { removeLine(line.id); return; }
    try {
        await adjustOrderLine(line.id, newQty);
        await loadCart();
    } catch (e: any) { ui.showToast(e.message); }
}

async function removeLine(id: string) {
    uni.showModal({
        title: '确认', content: '确定删除该商品?',
        success: async (res: any) => {
            if (res.confirm) {
                try {
                    await removeOrderLine(id);
                    selectedIds.value.delete(id);
                    await loadCart();
                    ui.showToast('已删除', 'success');
                } catch (e: any) { ui.showToast(e.message); }
            }
        }
    });
}

function goCheckout() {
    if (selectedCount.value === 0) return;
    uni.navigateTo({ url: '/pkg-order/pages/checkout' });
}
</script>
<style lang="scss" scoped>
.cart-page { min-height: 100vh; padding-bottom: calc(120rpx + 50px); background: $bg-color; }
.cart-list { padding: 20rpx; }
.cart-item {
    display: flex; align-items: flex-start; gap: 16rpx; background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 16rpx; position: relative;
    &__check { padding: 10rpx; }
    &__img { border-radius: $radius-sm; flex-shrink: 0; }
    &__info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__spec { font-size: 22rpx; color: #999; }
    &__bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8rpx; }
    &__del { position: absolute; top: 16rpx; right: 16rpx; font-size: 32rpx; color: #ccc; padding: 8rpx; }
}
.check-icon { font-size: 36rpx; color: $brand-color; }
.qty-control { display: flex; align-items: center; gap: 0; border: 1rpx solid $border-color; border-radius: $radius-sm; }
.qty-btn { width: 56rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 28rpx; background: #f5f5f5; }
.qty-num { width: 64rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 26rpx; border-left: 1rpx solid $border-color; border-right: 1rpx solid $border-color; }
.cart-footer {
    position: fixed; bottom: 50px; left: 0; right: 0; height: 100rpx; background: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20rpx; box-shadow: $shadow;
    &__left { display: flex; align-items: center; gap: 12rpx; font-size: 28rpx; }
    &__right { display: flex; align-items: center; gap: 20rpx; }
    &__total { font-size: 26rpx; .price { font-size: 32rpx; color: $price-color; font-weight: bold; } }
    &__btn { background: $brand-color; color: #fff; font-size: 28rpx; height: 72rpx; padding: 0 40rpx; border-radius: 40rpx; border: none; &[disabled] { opacity: 0.5; } }
}
</style>
