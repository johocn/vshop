<template>
  <view class="dist-page">
    <view class="dist-page__header">
      <text>分销中心</text>
      <text class="dist-page__tip">分享商品链接赚取佣金</text>
    </view>
    <button class="dist-page__apply" @click="applyDist">申请成为分销商</button>
  </view>
</template>
<script setup lang="ts">
import { getGraphQLClient } from '../../api/client';
import { useUIStore } from '../../stores/ui';
import { useAuthStore } from '../../stores/auth';

const ui = useUIStore();
const authStore = useAuthStore();

async function applyDist() {
    try {
        const client = getGraphQLClient();
        const referredByCode = authStore.inviteCode || null;
        await client.request(
            `mutation ApplyDistributor($referredByCode: String) {
                applyDistributor(referredByCode: $referredByCode) {
                    id status
                }
            }`,
            { referredByCode }
        );
        ui.showToast('申请成功', 'success');
    } catch (e: any) { ui.showToast(e.message); }
}
</script>
<style lang="scss" scoped>
.dist-page { padding: 20rpx; &__header { background: $brand-color; color: #fff; padding: 40rpx; border-radius: $radius-md; margin-bottom: 20rpx; text { font-size: 36rpx; font-weight: bold; display: block; } & .dist-page__tip { font-size: 24rpx; opacity: 0.8; margin-top: 8rpx; } } &__apply { background: #fff; color: $brand-color; border: 1rpx solid $brand-color; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; } }
</style>