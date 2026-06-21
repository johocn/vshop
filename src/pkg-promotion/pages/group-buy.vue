<template>
  <view class="group-buy">
    <view v-for="item in activities" :key="item.id" class="gb-card">
      <text class="gb-card__name">{{ item.name }}</text>
      <text class="gb-card__desc">{{ item.description }}</text>
      <view class="gb-card__price"><text>团购价: ¥{{ (item.groupPrice / 100).toFixed(2) }}</text></view>
      <view class="gb-card__info"><text>已参团: {{ item.currentCount }}/{{ item.targetCount }}人</text></view>
      <button class="gb-card__btn" @click="joinGroup(item.id, false)">参团</button>
    </view>
    <EmptyState v-if="activities.length === 0" text="暂无拼团活动" />
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveGroupBuyActivities } from '../../api/queries/promotion';
import { getGraphQLClient } from '../../api/client';
import { useUIStore } from '../../stores/ui';
import EmptyState from '../../components/EmptyState.vue';
const activities = ref<any[]>([]);
const ui = useUIStore();
onMounted(async () => {
    const res: any = await getActiveGroupBuyActivities();
    activities.value = res.activeGroupBuyActivities || [];
});
async function joinGroup(activityId: string, isLeader: boolean) {
    try {
        const client = getGraphQLClient();
        await client.request(`mutation($activityId:ID!,$isLeader:Boolean!) { joinGroupBuy(activityId:$activityId,isLeader:$isLeader) { id status } }`, { activityId, isLeader });
        ui.showToast('参团成功', 'success');
    } catch (e: any) { ui.showToast(e.message); }
}
</script>
<style lang="scss" scoped>
.group-buy { padding: 20rpx; }
.gb-card { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; &__name { font-size: 30rpx; font-weight: bold; display: block; } &__desc { font-size: 26rpx; color: #666; margin: 8rpx 0; display: block; } &__price { color: $price-color; font-size: 32rpx; font-weight: bold; } &__info { font-size: 24rpx; color: #999; margin: 8rpx 0; } &__btn { background: $brand-color; color: #fff; border-radius: $radius-md; border: none; height: 70rpx; font-size: 28rpx; margin-top: 12rpx; } }
</style>