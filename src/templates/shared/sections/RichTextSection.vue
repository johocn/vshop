<template>
  <view class="rich-sec">
    <rich-text :nodes="safeHtml" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RichTextSection } from '../schema';
import { sanitizeRichHtml } from '../../../utils/html';

const props = defineProps<{ section: RichTextSection }>();
// 后台可编辑富文本必须净化：rich-text 在 H5 以 innerHTML 渲染，未净化可致存储型 XSS
const safeHtml = computed(() => sanitizeRichHtml(props.section.html));
</script>

<style lang="scss" scoped>
.rich-sec { margin: 20rpx; padding: 20rpx; background: #fff; border-radius: 16rpx; }
</style>