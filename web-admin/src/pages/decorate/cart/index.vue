<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">购物车页装修</text>
        <text class="sub">保存到 pageCartConfig，逐级覆盖模板/全局默认</text>
      </view>
      <view class="cell">
        <text class="lbl">标题</text>
        <input v-model="f.title" placeholder="购物车" />
      </view>
      <view class="cell row-in">
        <text class="lbl">推荐区</text>
        <view class="seg">
          <text :class="{ on: f.showRecommend }" @tap="f.showRecommend = true">显示</text>
          <text :class="{ on: !f.showRecommend }" @tap="f.showRecommend = false">隐藏</text>
        </view>
      </view>
      <view class="cell row-in">
        <text class="lbl">结算按钮样式</text>
        <view class="seg">
          <text :class="{ on: f.checkoutStyle === 'classic' }" @tap="f.checkoutStyle = 'classic'">经典</text>
          <text :class="{ on: f.checkoutStyle === 'full' }" @tap="f.checkoutStyle = 'full'">通栏</text>
        </view>
      </view>
      <view class="hint">「通栏」结算按钮横贯整行；「经典」为右侧常规宽度。</view>
    </view>
    <button class="save" :disabled="saving" @tap="save">{{ saving ? '保存中…' : '保存' }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';

const f = ref({ title: '购物车', showRecommend: true, checkoutStyle: 'classic' });
const saving = ref(false);
let channelId = '';

function safeParse(raw: string | undefined): any {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const cfg = safeParse((ch.customFields as any).pageCartConfig);
  if (cfg) {
    f.value = {
      title: cfg.title ?? f.value.title,
      showRecommend: cfg.showRecommend !== false,
      checkoutStyle: cfg.checkoutStyle === 'full' ? 'full' : 'classic',
    };
  }
});

async function save() {
  saving.value = true;
  try {
    await updateChannelCustomFields(channelId, { pageCartConfig: JSON.stringify({ version: 1, ...f.value }) });
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; }
  .head { display: flex; align-items: baseline; justify-content: space-between; padding: 20rpx 0 8rpx;
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .sub { font-size: 22rpx; color: $wa-muted; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .hint { font-size: 22rpx; color: $wa-muted; line-height: 1.6; padding: 8rpx 0 16rpx; }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
