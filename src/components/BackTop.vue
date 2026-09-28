<template>
  <view v-if="visible" class="back-top" :style="{ bottom }" @tap="toTop">
    <text class="back-top__icon">↑</text>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = withDefaults(defineProps<{ threshold?: number; bottom?: string }>(), {
    threshold: 300,
    bottom: '120rpx',
});

const visible = ref(false);

function onScroll() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    // H5 / 小程序统一：优先用页面滚动事件回调写入的 scrollTop
    const top = Number(page?.__scrollTop ?? 0);
    visible.value = top > props.threshold;
}

function handlePageScroll(e: any) {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    if (page) page.__scrollTop = e?.detail?.scrollTop ?? 0;
    onScroll();
}

function toTop() {
    uni.pageScrollTo({ scrollTop: 0, duration: 300 });
}

onMounted(() => {
    uni.$on('page-scroll', handlePageScroll);
    onScroll();
});

onUnmounted(() => {
    uni.$off('page-scroll', handlePageScroll);
});
</script>

<style lang="scss" scoped>
.back-top {
    position: fixed; right: 24rpx; z-index: 90;
    width: 80rpx; height: 80rpx; border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center;
    &__icon { color: #fff; font-size: 36rpx; line-height: 1; }
}
</style>
