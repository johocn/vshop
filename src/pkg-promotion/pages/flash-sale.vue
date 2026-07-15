<template>
  <view class="flash-sale">
    <view v-for="item in activities" :key="item.id" class="flash-card" @click="goProduct(item)">
      <view class="flash-card__info">
        <text class="flash-card__name">{{ item.name }}</text>
        <view class="flash-card__price"><text class="flash-card__flash">¥{{ (item.flashPrice / 100).toFixed(2) }}</text></view>
        <view class="flash-card__progress">
          <progress :percent="Math.round(item.soldCount / item.totalStock * 100)" stroke-width="8" activeColor="#ff6600" />
          <text>已售 {{ item.soldCount }}/{{ item.totalStock }}</text>
        </view>
      </view>
    </view>
    <EmptyState v-if="activities.length === 0" text="暂无秒杀活动" />
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveFlashSaleActivities } from '../../api/queries/promotion';
import EmptyState from '../../components/EmptyState.vue';
import { useShare } from '../../composables/useShare';
const activities = ref<any[]>([]);
useShare({
    title: '限时秒杀 - 精选好物',
    path: '/pkg-promotion/pages/flash-sale',
});
onMounted(async () => {
    try {
        const res: any = await getActiveFlashSaleActivities();
        activities.value = res.activeFlashSaleActivities || [];
    } catch (e) { console.error(e); }
});
function goProduct(item: any) { uni.navigateTo({ url: '/pkg-product/pages/detail?id=' + item.productId }); }
</script>
<style lang="scss" scoped>
.flash-sale { padding: 20rpx; }
.flash-card { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; &__name { font-size: 30rpx; font-weight: bold; } &__flash { color: $price-color; font-size: 40rpx; font-weight: bold; } &__progress { margin-top: 12rpx; text { font-size: 22rpx; color: #999; } } }
</style>