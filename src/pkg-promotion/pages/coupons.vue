<template>
  <view class="coupons-page">
    <view class="coupons-tabs">
      <text class="tab" :class="{ active: tab === 'apply' }" @click="tab = 'apply'">使用优惠码</text>
      <text class="tab" :class="{ active: tab === 'active' }" @click="tab = 'active'">已使用</text>
    </view>
    <view v-if="tab === 'apply'" class="coupons-apply">
      <text class="coupons-apply__tip">在购物车或结算时输入优惠码即可使用</text>
      <view class="coupons-apply__row">
        <input v-model="couponCode" placeholder="输入优惠码" class="input" />
        <button @click="applyCoupon" class="coupons-apply__btn">使用</button>
      </view>
    </view>
    <view v-else class="coupons-active">
      <view v-for="code in activeCoupons" :key="code" class="coupon-card">
        <view class="coupon-card__left">
          <text class="coupon-card__icon">🎁</text>
          <text class="coupon-card__code">{{ code }}</text>
        </view>
        <button class="coupon-card__remove" @click="removeCoupon(code)">移除</button>
      </view>
      <EmptyState v-if="activeCoupons.length === 0" text="暂无使用的优惠券" />
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { applyCouponCode, removeCouponCode } from '../../api/mutations/cart';
import { getActiveOrder } from '../../api/queries/order';
import { useUIStore } from '../../stores/ui';
import { useCartStore } from '../../stores/cart';
import EmptyState from '../../components/EmptyState.vue';
import { useShare } from '../../composables/useShare';
const ui = useUIStore();
const cart = useCartStore();
useShare({
    title: '优惠券 - 精选好物',
    path: '/pkg-promotion/pages/coupons',
});
const tab = ref('apply');
const couponCode = ref('');
const activeCoupons = ref<string[]>([]);
onMounted(async () => {
    try { const res: any = await getActiveOrder(); if (res.activeOrder) { activeCoupons.value = res.activeOrder.couponCodes || []; cart.setOrder(res.activeOrder); } } catch (e) {}
});
async function applyCoupon() {
    if (!couponCode.value) return;
    try {
        const res: any = await applyCouponCode(couponCode.value);
        if (res.applyCouponCode?.couponCodes) { activeCoupons.value = res.applyCouponCode.couponCodes; cart.setOrder(res.applyCouponCode); }
        ui.showToast('优惠券已应用', 'success');
        couponCode.value = '';
        tab.value = 'active';
    } catch (e: any) { ui.showToast(e.message); }
}
async function removeCoupon(code: string) {
    try {
        const res: any = await removeCouponCode(code);
        if (res.removeCouponCode) { activeCoupons.value = res.removeCouponCode.couponCodes || []; cart.setOrder(res.removeCouponCode); }
        ui.showToast('已移除', 'success');
    } catch (e: any) { ui.showToast(e.message); }
}
</script>
<style lang="scss" scoped>
.coupons-page { padding: 20rpx; }
.coupons-tabs { display: flex; background: #fff; border-radius: $radius-md; margin-bottom: 20rpx; overflow: hidden; }
.tab { flex: 1; text-align: center; padding: 24rpx; font-size: 28rpx; &.active { background: $brand-color; color: #fff; } }
.coupons-apply { background: #fff; padding: 30rpx; border-radius: $radius-md; &__tip { font-size: 26rpx; color: #999; margin-bottom: 20rpx; display: block; } &__row { display: flex; gap: 16rpx; } &__btn { background: $brand-color; color: #fff; border: none; border-radius: $radius-md; height: 80rpx; font-size: 28rpx; white-space: nowrap; } }
.coupons-active { }
.coupon-card { display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 24rpx; border-radius: $radius-md; margin-bottom: 12rpx; &__left { display: flex; align-items: center; gap: 16rpx; } &__icon { font-size: 40rpx; } &__code { font-size: 28rpx; font-weight: bold; } &__remove { font-size: 24rpx; color: #999; border: 1rpx solid $border-color; background: #fff; border-radius: $radius-sm; padding: 8rpx 20rpx; } }
.input { flex: 1; height: 80rpx; border: 1rpx solid $border-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 28rpx; }
</style>
