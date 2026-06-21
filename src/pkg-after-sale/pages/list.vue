<template>
  <view class="after-sale-list">
    <view v-for="item in list" :key="item.id" class="as-card" @click="goDetail(item.id)">
      <view class="as-card__header"><text>订单: {{ item.orderId }}</text><text class="as-card__state">{{ item.state }}</text></view>
      <text class="as-card__reason">{{ item.reason }}</text>
      <text class="as-card__amount">退款: ¥{{ (item.refundAmount / 100).toFixed(2) }}</text>
    </view>
    <EmptyState v-if="list.length === 0" text="暂无售后记录" />
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getGraphQLClient } from '../../api/client';
import EmptyState from '../../components/EmptyState.vue';
const list = ref<any[]>([]);
onMounted(async () => {
    try {
        const client = getGraphQLClient();
        const res: any = await client.request(`query { myAfterSalesRequests { items { id orderId state reason refundAmount createdAt } totalItems } }`);
        list.value = res.myAfterSalesRequests?.items || [];
    } catch (e) { console.error(e); }
});
function goDetail(id: string) { uni.navigateTo({ url: '/pkg-after-sale/pages/detail?id=' + id }); }
</script>
<style lang="scss" scoped>
.after-sale-list { padding: 20rpx; }
.as-card { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 16rpx; &__header { display: flex; justify-content: space-between; font-size: 24rpx; color: $text-color-secondary; } &__state { color: $brand-color; } &__reason { font-size: 28rpx; margin: 8rpx 0; display: block; } &__amount { color: $price-color; font-size: 26rpx; } }
</style>