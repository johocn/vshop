<template>
  <view class="pay-result">
    <view class="pay-result__icon">
      <text v-if="status === 'success'" style="font-size: 120rpx;">✅</text>
      <text v-else-if="status === 'pending'" style="font-size: 120rpx;">⏳</text>
      <text v-else style="font-size: 120rpx;">❌</text>
    </view>
    <text class="pay-result__title">{{ statusText }}</text>
    <text class="pay-result__code" v-if="orderCode">订单号: {{ orderCode }}</text>
    <view class="pay-result__actions">
      <button class="btn-primary" @click="viewOrder">查看订单</button>
      <button class="btn-secondary" @click="goHome">继续购物</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';

const status = ref('pending');
const orderCode = ref('');

const statusText = computed(() => {
    switch (status.value) {
        case 'success': return '支付成功';
        case 'pending': return '等待支付确认';
        default: return '支付失败';
    }
});

onLoad((query: any) => {
    status.value = query?.status || 'pending';
    orderCode.value = query?.code || '';
});

function viewOrder() {
    uni.redirectTo({ url: '/pkg-order/pages/order-detail?code=' + orderCode.value });
}
function goHome() {
    uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style lang="scss" scoped>
.pay-result {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx;
    &__icon { margin-bottom: 30rpx; }
    &__title { font-size: 36rpx; font-weight: bold; margin-bottom: 16rpx; }
    &__code { font-size: 26rpx; color: $text-color-secondary; margin-bottom: 60rpx; }
    &__actions { width: 100%; display: flex; flex-direction: column; gap: 20rpx; }
}
.btn-primary { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; border: none; }
.btn-secondary { background: #fff; color: $text-color; border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
</style>
