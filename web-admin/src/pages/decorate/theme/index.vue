<template>
  <view class="page">
    <view class="tip">{{ $t('decorateTheme.tip') }}</view>
    <view class="theme" v-for="t in themes" :key="t.id" :class="{ on: t.id === cur }" @tap="pick(t)">
      <view class="swatch" :style="{ background: t.color }" />
      <text class="t-name">{{ t.name }}</text>
      <text v-if="t.id === cur" class="t-on">✓</text>
    </view>
    <button class="save" @tap="save">{{ $t('decorateTheme.save') }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const themes = [
  { id: 'taobao-orange', name: '淘宝橙', color: '#ff6600' },
  { id: 'fresh', name: '生鲜绿', color: '#43a047' },
  { id: 'dark', name: '深色科技', color: '#1a1a1a' },
];
const cur = ref(themes[0].id);
let channelId = '';

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  cur.value = (ch.customFields as any)?.themeId || themes[0].id;
});

function pick(t: any) { cur.value = t.id; }

async function save() {
  await updateChannelCustomFields(channelId, { themeId: cur.value });
  uni.showToast({ title: locale.t('decorateTheme.saved'), icon: 'success' });
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .tip { font-size: 24rpx; color: $wa-muted; margin-bottom: 24rpx; }
  .theme { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius;
    padding: 28rpx 32rpx; margin-bottom: 20rpx; border: 2rpx solid transparent;
    .swatch { width: 48rpx; height: 48rpx; border-radius: 12rpx; margin-right: 24rpx; }
    .t-name { flex: 1; font-size: 30rpx; color: $wa-ink; }
    .t-on { color: $wa-accent; font-size: 32rpx; font-weight: 700; }
    &.on { border-color: $wa-accent; }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
