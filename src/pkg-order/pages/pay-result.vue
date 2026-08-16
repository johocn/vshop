<template>
  <view class="pay-result">
    <view class="pay-result__icon">
      <text v-if="status === 'success'" style="font-size: 120rpx;">✅</text>
      <text v-else-if="status === 'pending'" style="font-size: 120rpx;">⏳</text>
      <text v-else style="font-size: 120rpx;">❌</text>
    </view>
    <text class="pay-result__title">{{ statusText }}</text>
    <text v-if="orderCodes.length === 1" class="pay-result__code">订单号: {{ orderCodes[0] }}</text>
    <view v-else class="pay-result__codes">
      <text class="pay-result__codes-title">本次共生成 {{ orderCodes.length }} 笔订单</text>
      <view v-for="code in orderCodes" :key="code" class="pay-result__code-item">
        <text>订单号: {{ code }}</text>
        <text class="pay-result__code-link" @click="viewOrder(code)">查看</text>
      </view>
    </view>
    <view class="pay-result__actions">
      <button class="btn-primary" @click="viewOrder(orderCodes[0] || '')">查看订单</button>
      <button class="btn-secondary" @click="goHome">继续购物</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';

const status = ref('pending');
const orderCodes = ref<string[]>([]);

const statusText = computed(() => {
    switch (status.value) {
        case 'success': return '支付成功';
        case 'pending': return '等待支付确认';
        default: return '支付失败';
    }
});

onLoad((query: any) => {
    status.value = query?.status || 'pending';
    // 兼容单订单 code 参数 与 多订单 codes 参数（逗号分隔）
    const single = query?.code;
    const multi = query?.codes;
    if (single) {
        orderCodes.value = [single];
    } else if (multi) {
        orderCodes.value = String(multi).split(',').filter(Boolean);
    }
});

function viewOrder(code: string) {
    if (!code) return;
    uni.redirectTo({ url: '/pkg-order/pages/order-detail?code=' + code });
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
    &__codes { width: 100%; margin-bottom: 60rpx; }
    &__codes-title { display: block; font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; text-align: center; }
    &__code-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background: #f7f7f7; border-radius: $radius-md; margin-bottom: 12rpx; font-size: 26rpx; color: $text-color-secondary; }
    &__code-link { color: $brand-color; }
    &__actions { width: 100%; display: flex; flex-direction: column; gap: 20rpx; }
}
.btn-primary { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; border: none; }
.btn-secondary { background: #fff; color: $text-color; border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
</style>