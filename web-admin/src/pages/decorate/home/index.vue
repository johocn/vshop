<template>
  <view class="page">
    <view class="sec-row">
      <text class="lbl">轮播图</text>
      <view class="muted">编辑轮播项（MVP 先存文本占位，图片上传见 Task 7）</view>
    </view>
    <view class="sec-row">
      <text class="lbl">宫格导航</text>
      <view class="muted">占位：后续接入装修实体后编辑</view>
    </view>
    <view class="sec-row">
      <text class="lbl">推荐位</text>
      <view class="muted">占位：后续接入装修实体后编辑</view>
    </view>
    <button class="save" @tap="save">保存装修</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';

// shopContent 为 Channel customFields 的 text 字段，存序列化 JSON 字符串
const content = ref<Record<string, unknown>>({});
let channelId = '';

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const raw = (ch.customFields as any)?.shopContent;
  if (raw) {
    try { content.value = JSON.parse(raw); } catch { content.value = {}; }
  }
});

async function save() {
  await updateChannelCustomFields(channelId, { shopContent: JSON.stringify(content.value) });
  uni.showToast({ title: '已保存', icon: 'success' });
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .sec-row { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .lbl { font-size: 30rpx; color: $wa-ink; font-weight: 600; display: block; margin-bottom: 8rpx; }
    .muted { font-size: 24rpx; color: $wa-muted; }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
