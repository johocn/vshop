<template>
  <view class="nav-sec">
    <view class="nav-item" v-for="(it, i) in section.items" :key="i" @tap="go(it.link)">
      <text class="icon">{{ it.icon || '•' }}</text>
      <text class="label">{{ it.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { NavSection } from '../schema';
const props = defineProps<{ section: NavSection }>();
function go(link?: string) {
  if (link) uni.navigateTo({ url: link });
}
</script>

<style lang="scss" scoped>
.nav-sec { display: flex; flex-wrap: wrap; margin: 20rpx; padding: 20rpx 0; background: #fff; border-radius: 16rpx; }
.nav-item { width: 25%; display: flex; flex-direction: column; align-items: center; padding: 16rpx 0; }
.icon { font-size: 48rpx; }
.label { font-size: 24rpx; color: #333; margin-top: 8rpx; }
</style>