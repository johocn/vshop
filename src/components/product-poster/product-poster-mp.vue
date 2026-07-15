<!-- #ifdef MP-WEIXIN -->
<template>
  <view class="poster-overlay" @click="$emit('close')">
    <view class="poster-container" @click.stop>
      <canvas canvas-id="posterCanvas" class="poster-canvas" />
      <view class="poster-actions" v-if="posterImagePath">
        <button class="poster-btn" @click="savePoster">保存到相册</button>
        <button class="poster-btn poster-btn--close" @click="$emit('close')">关闭</button>
      </view>
      <view class="poster-loading" v-if="!posterImagePath">
        <text>海报生成中...</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { PosterData } from './usePosterData';

const props = defineProps<{ data: PosterData }>();
defineEmits<{ close: [] }>();

const posterImagePath = ref('');

onMounted(() => {
    drawPoster();
});

async function drawPoster() {
    const ctx = uni.createCanvasContext('posterCanvas');
    const d = props.data;

    // 背景
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, 750, 1200);

    // 商城名
    ctx.setFillStyle('#333333');
    ctx.setFontSize(28);
    ctx.fillText(d.channelName, 80, 60);

    // 商品主图
    if (d.productImage) {
        try {
            const imgInfo = await uni.getImageInfo({ src: d.productImage });
            ctx.drawImage(imgInfo.path, 0, 100, 750, 750);
        } catch {}
    }

    // 价格
    ctx.setFillStyle('#e93b3b');
    ctx.setFontSize(48);
    ctx.fillText(`¥${d.price}`, 40, 920);

    // 原价
    if (d.originalPrice) {
        ctx.setFillStyle('#999999');
        ctx.setFontSize(28);
        ctx.fillText(`¥${d.originalPrice}`, 200, 920);
    }

    // 小程序码
    if (d.qrCodeBase64) {
        const wxacodePath = `data:image/png;base64,${d.qrCodeBase64}`;
        try {
            const imgInfo = await uni.getImageInfo({ src: wxacodePath });
            ctx.drawImage(imgInfo.path, 40, 1000, 150, 150);
        } catch {}
    }

    // 邀请码
    if (d.inviteCode) {
        ctx.setFillStyle('#999999');
        ctx.setFontSize(24);
        ctx.fillText(`邀请码：${d.inviteCode}`, 210, 1080);
    }

    ctx.draw(false, () => {
        setTimeout(() => {
            uni.canvasToTempFilePath({
                canvasId: 'posterCanvas',
                success: (res: any) => { posterImagePath.value = res.tempFilePath; },
                fail: () => { uni.showToast({ title: '海报生成失败', icon: 'none' }); },
            });
        }, 200);
    });
}

function savePoster() {
    if (!posterImagePath.value) return;
    uni.saveImageToPhotosAlbum({
        filePath: posterImagePath.value,
        success: () => uni.showToast({ title: '保存成功', icon: 'success' }),
        fail: (err: any) => {
            if (err.errMsg.includes('auth deny')) {
                uni.showModal({
                    title: '提示',
                    content: '需要相册权限才能保存海报，请前往设置开启',
                    confirmText: '去设置',
                    success: (res) => { if (res.confirm) uni.openSetting({}); },
                });
            }
        },
    });
}
</script>

<style lang="scss" scoped>
.poster-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.poster-container { background: #fff; border-radius: 12rpx; padding: 20rpx; }
.poster-canvas { width: 750rpx; height: 1200rpx; }
.poster-actions { margin-top: 20rpx; display: flex; gap: 20rpx; justify-content: center; }
.poster-btn { padding: 16rpx 40rpx; font-size: 28rpx; border: 1rpx solid #ddd; border-radius: 8rpx; background: #fff; }
.poster-btn--close { color: #999; }
.poster-loading { padding: 40rpx; text-align: center; }
</style>
<!-- #endif -->
