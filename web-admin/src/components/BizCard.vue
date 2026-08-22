<template>
  <view class="biz" @tap="$emit('tap')">
    <text class="biz-name">{{ name }}</text>
    <text v-if="badge" class="biz-badge">{{ badge }}</text>
  </view>
</template>
<script lang="ts" setup>
defineProps<{ name: string; badge?: string }>();
defineEmits(['tap']);
</script>
<style lang="scss" scoped>
.biz { background: $wa-card; border-radius: 20rpx; padding: 28rpx 22rpx; display: flex; align-items: center; justify-content: space-between;
  .biz-name { font-size: 30rpx; color: $wa-ink; font-weight: 500; }
  .biz-badge { font-size: 22rpx; color: $wa-accent; }
}
</style>
