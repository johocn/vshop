<template>
  <view class="notice-sec">
    <text class="icon">📢</text>
    <text class="text">{{ section.text }}</text>
  </view>
</template>

<script setup lang="ts">
import type { NoticeSection } from '../schema';
defineProps<{ section: NoticeSection }>();
</script>

<style lang="scss" scoped>
.notice-sec { display: flex; align-items: center; margin: 20rpx; padding: 20rpx; background: #fff8e6; border-radius: 12rpx; }
.icon { margin-right: 12rpx; }
.text { font-size: 26rpx; color: #b8860b; flex: 1; }
</style>