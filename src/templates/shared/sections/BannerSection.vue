<template>
  <view class="banner-sec" :class="{ 'banner-sec--edge': isEdge }">
    <swiper v-if="images.length > 1" class="swiper" circular autoplay indicator-dots
      :previous-margin="isEdge ? '30px' : ''" :next-margin="isEdge ? '30px' : ''"
      indicator-color="rgba(255,255,255,0.6)" indicator-active-color="#ff6a6c" @change="onChange">
      <swiper-item v-for="(img, i) in images" :key="i" @tap="go(img.link)">
        <view class="edge-item" :class="{ 'edge-item--on': isEdge && edgeIdx === i }">
          <image class="img" :src="img.image" mode="aspectFill" />
        </view>
      </swiper-item>
    </swiper>
    <image v-else class="img single" :src="images[0]?.image" mode="aspectFill" @tap="go(images[0]?.link)" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BannerSection } from '../schema';

const props = defineProps<{ section: BannerSection }>();
const images = props.section.images;
const isEdge = computed(() => props.section.style === 'edgeScale' && images.length > 1);
const edgeIdx = ref(0);

function onChange(e: any) {
  if (e?.detail && typeof e.detail.current === 'number') edgeIdx.value = e.detail.current;
}

function go(link?: string) {
  if (link) uni.navigateTo({ url: link });
}
</script>

<style lang="scss" scoped>
.banner-sec { margin: 20rpx; border-radius: 16rpx; overflow: hidden; }
.swiper { height: 320rpx; }
.img { width: 100%; height: 320rpx; }
.img.single { display: block; }

/* usemall 露边缩放样式：两侧露边 + 非当前项缩小（纯增量，style 缺省时不生效） */
.banner-sec--edge { border-radius: 0; overflow: visible; }
.banner-sec--edge .swiper { height: 360rpx; }
.banner-sec--edge .img { border-radius: 16rpx; }
.banner-sec--edge .img.single { border-radius: 16rpx; }
.edge-item { height: 360rpx; padding: 0 6rpx; transform: scale(0.93); transition: transform 0.3s ease; }
.edge-item--on { transform: scale(1); }
</style>
