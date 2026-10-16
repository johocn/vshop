<template>
  <view class="sec-video">
    <text v-if="titleText" class="sec-video__title">{{ titleText }}</text>
    <video
      class="sec-video__player"
      :src="section.videoUrl"
      :poster="section.poster || ''"
      :controls="true"
      object-fit="contain"
      @error="onError"
    />
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { VideoSection as VideoSectionData } from '../schema';

const props = defineProps<{ section: VideoSectionData }>();
const { t, locale } = useI18n();

// title 双语渲染：与 FlashSection 同款模式（字符串直出；字典按当前 locale 取，逐级回退）
const titleText = computed(() => {
    const raw: any = props.section.title;
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    return raw[locale.value] || raw['zh-CN'] || Object.values(raw)[0] || '';
});

function onError() {
    uni.showToast({ title: locale.value.startsWith('zh') ? '视频加载失败' : 'Video failed to load', icon: 'none' });
}
</script>
<style lang="scss" scoped>
.sec-video {
    padding: 20rpx 24rpx;
    background: #fff;
    margin-bottom: 16rpx;

    &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; margin-bottom: 16rpx; }
    &__player { width: 100%; height: 400rpx; border-radius: $radius-md; background: #000; }
}
</style>
