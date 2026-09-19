<template>
  <view class="scope">
    <text v-for="s in scopes" :key="s.key" :class="{ on: s.key === scope }" @tap="emit('change', s.key)">{{ s.label }}</text>
  </view>
</template>

<script lang="ts" setup>
// 本店渠道单 / 本店商品单 切换，自原页面 scope 块原样迁移
defineProps<{ scopes: { key: string; label: string }[]; scope: string }>();
const emit = defineEmits<{ (e: 'change', key: string): void }>();
</script>

<style lang="scss" scoped>
.scope {
  display: flex;
  margin-bottom: 16rpx;
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 8rpx;

  text {
    flex: 1;
    text-align: center;
    padding: 16rpx 0;
    font-size: 26rpx;
    color: $wa-muted;
    border-radius: $wa-radius;

    &.on { color: #fff; background: $wa-ink; font-weight: 600; }
  }
}
</style>
