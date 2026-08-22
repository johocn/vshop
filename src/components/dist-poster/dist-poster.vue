<template>
  <view>
    <canvas canvas-id="distPoster" id="distPoster" class="dist-poster" />
    <view class="dist-poster-bar">
      <button class="dist-poster-save" @click="save">保存海报</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { generateH5InviteQr } from '../../utils/poster-qr';
import { useUIStore } from '../../stores/ui';

const props = defineProps<{
    channelName: string;
    inviterName: string;
    inviteCode: string;
}>();

const ui = useUIStore();

const W = 600;
const H = 1000;

async function draw(): Promise<void> {
    let qr = '';
    try {
        qr = await generateH5InviteQr(props.inviteCode);
    } catch (e) {
        console.error('生成推广二维码失败', e);
    }
    const q = uni.createCanvasContext('distPoster');
    // 背景
    const grad = q.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ff7d00');
    grad.addColorStop(1, '#ff3d00');
    q.setFillStyle(grad);
    q.fillRect(0, 0, W, H);
    // 文本
    q.setFillStyle('#ffffff');
    q.setFontSize(52);
    q.setTextAlign('center');
    q.fillText(props.channelName, W / 2, 220);
    q.setFontSize(36);
    q.fillText(`${props.inviterName} 邀你一起逛`, W / 2, 300);
    q.setFillStyle('#ffe9d6');
    q.setFontSize(28);
    q.fillText(`推荐码：${props.inviteCode}`, W / 2, 360);
    // 二维码
    if (qr) {
        q.drawImage(`data:image/png;base64,${qr}`, W / 2 - 140, 480, 280, 280);
    }
    // 提示
    q.setFillStyle('#fff');
    q.setFontSize(24);
    q.fillText('长按扫码进商城', W / 2, 860);
    q.draw();
}

function save() {
    uni.canvasToTempFilePath({
        canvasId: 'distPoster',
        success: (res) => {
            uni.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => ui.showToast('海报已保存到相册', 'success'),
                fail: () => ui.showToast('保存失败，请检查相册权限'),
            });
        },
        fail: () => ui.showToast('海报生成失败'),
    });
}

onMounted(() => {
    draw();
});
</script>

<style scoped>
.dist-poster { width: 600rpx; height: 1000rpx; border-radius: 24rpx; overflow: hidden; }
.dist-poster-bar { padding: 32rpx 0; }
.dist-poster-save { width: 100%; height: 88rpx; line-height: 88rpx; background: #ff7d00; color: #fff; border-radius: 999rpx; }
</style>