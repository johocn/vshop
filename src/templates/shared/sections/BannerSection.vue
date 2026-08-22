<template>
  <view class="banner-sec">
    <swiper v-if="images.length > 1" class="swiper" circular autoplay indicator-dots>
      <swiper-item v-for="(img, i) in images" :key="i" @tap="go(img.link)">
        <image class="img" :src="img.image" mode="aspectFill" />
      </swiper-item>
    </swiper>
    <image v-else class="img single" :src="images[0]?.image" mode="aspectFill" @tap="go(images[0]?.link)" />
  </view>
</template>

<script setup lang="ts">
import type { BannerSection } from '../schema';

const props = defineProps<{ section: BannerSection }>();
const images = props.section.images;

function go(link?: string) {
  if (link) uni.navigateTo({ url: link });
}
</script>

<style lang="scss" scoped>
.banner-sec { margin: 20rpx; border-radius: 16rpx; overflow: hidden; }
.swiper { height: 320rpx; }
.img { width: 100%; height: 320rpx; }
.img.single { display: block; }
</style>