<!-- #ifdef H5 -->
<template>
  <view class="poster-overlay" @click="$emit('close')">
    <view class="poster-container" @click.stop>
      <view ref="posterRef" class="poster-canvas">
        <view class="poster-header">
          <text class="poster-channel-name">{{ data.channelName }}</text>
        </view>
        <image class="poster-product-image" :src="data.productImage" crossorigin="anonymous" mode="aspectFit" />
        <view class="poster-price-row">
          <text class="poster-price">¥{{ data.price }}</text>
          <text v-if="data.originalPrice" class="poster-original-price">¥{{ data.originalPrice }}</text>
        </view>
        <text class="poster-title">{{ data.productTitle }}</text>
        <view class="poster-footer">
          <image class="poster-qr" :src="'data:image/png;base64,' + data.qrCodeBase64" mode="aspectFit" />
          <view class="poster-footer-text">
            <text class="poster-scan-tip">扫码购买</text>
            <text v-if="data.inviteCode" class="poster-invite-code">邀请码：{{ data.inviteCode }}</text>
          </view>
        </view>
      </view>
      <view class="poster-actions">
        <button class="poster-btn" @click="savePoster">长按保存图片</button>
        <button class="poster-btn poster-btn--close" @click="$emit('close')">关闭</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { toPng } from 'html-to-image';
import type { PosterData } from './usePosterData';

const props = defineProps<{ data: PosterData }>();
defineEmits<{ close: [] }>();

const posterRef = ref<HTMLElement | null>(null);
const posterDataUrl = ref('');

onMounted(async () => {
    if (posterRef.value) {
        try {
            posterDataUrl.value = await toPng(posterRef.value, {
                pixelRatio: 2,
                cacheBust: true,
                backgroundColor: '#ffffff',
            });
        } catch (e) {
            console.error('海报生成失败', e);
        }
    }
});

function savePoster() {
    if (posterDataUrl.value) {
        const link = document.createElement('a');
        link.download = 'product-poster.png';
        link.href = posterDataUrl.value;
        link.click();
    }
}
</script>

<style lang="scss" scoped>
.poster-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.poster-container { background: #fff; border-radius: 12rpx; padding: 20rpx; max-width: 90vw; }
.poster-canvas { width: 600rpx; background: #fff; }
.poster-header { padding: 20rpx; text-align: center; }
.poster-channel-name { font-size: 32rpx; font-weight: bold; }
.poster-product-image { width: 600rpx; height: 600rpx; }
.poster-price-row { padding: 20rpx; display: flex; align-items: baseline; gap: 20rpx; }
.poster-price { font-size: 48rpx; color: #e93b3b; font-weight: bold; }
.poster-original-price { font-size: 28rpx; color: #999; text-decoration: line-through; }
.poster-title { padding: 0 20rpx 20rpx; font-size: 28rpx; color: #333; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.poster-footer { display: flex; align-items: center; padding: 20rpx; gap: 20rpx; border-top: 1rpx solid #eee; }
.poster-qr { width: 150rpx; height: 150rpx; }
.poster-footer-text { display: flex; flex-direction: column; gap: 8rpx; }
.poster-scan-tip { font-size: 24rpx; color: #666; }
.poster-invite-code { font-size: 22rpx; color: #999; }
.poster-actions { margin-top: 20rpx; display: flex; gap: 20rpx; justify-content: center; }
.poster-btn { padding: 16rpx 40rpx; font-size: 28rpx; border: 1rpx solid #ddd; border-radius: 8rpx; background: #fff; }
.poster-btn--close { color: #999; }
</style>
<!-- #endif -->
