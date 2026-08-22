<template>
  <view class="ph">
    <text class="t">工作台建设中</text>
    <text class="s">当前店铺：{{ tenant.name || tenant.code || '未选择' }}</text>
    <button class="btn" @tap="goSelect">切换店铺</button>
  </view>
</template>
<script lang="ts" setup>
import { useTenantStore } from '../../stores/tenantStore';
const tenant = useTenantStore();
function goSelect() { uni.redirectTo({ url: '/pages/channel-select/index' }); }
</script>
<style lang="scss" scoped>
.ph { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: $wa-bg;
  .t { font-size: 36rpx; font-weight: 600; color: $wa-ink; }
  .s { font-size: 26rpx; color: $wa-muted; margin-top: 16rpx; }
  .btn { margin-top: 40rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; padding: 0 48rpx; height: 80rpx; line-height: 80rpx; font-size: 28rpx; }
}
</style>
