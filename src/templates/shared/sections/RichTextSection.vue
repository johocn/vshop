<template>
  <view class="rich-sec">
    <rich-text :nodes="section.html" />
  </view>
</template>

<script setup lang="ts">
import type { RichTextSection } from '../schema';
defineProps<{ section: RichTextSection }>();
</script>

<style lang="scss" scoped>
.rich-sec { margin: 20rpx; padding: 20rpx; background: #fff; border-radius: 16rpx; }
</style>