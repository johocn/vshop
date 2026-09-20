<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">{{ $t('decorateProduct.title') }}</text>
        <text class="sub">{{ $t('decorateProduct.sub') }}</text>
      </view>
      <view class="cell row-in">
        <text class="lbl">{{ $t('decorateProduct.layout') }}</text>
        <view class="seg">
          <text :class="{ on: f.layout === 'classic' }" @tap="setLayout('classic')">{{ $t('decorateProduct.layoutClassic') }}</text>
          <text :class="{ on: f.layout === 'floor' }" @tap="setLayout('floor')">{{ $t('decorateProduct.layoutFloor') }}</text>
          <text :class="{ on: f.layout === 'dualBuy' }" @tap="setLayout('dualBuy')">{{ $t('decorateProduct.layoutDualBuy') }}</text>
          <text :class="{ on: f.layout === 'hotel' }" @tap="setLayout('hotel')">{{ $t('decorateProduct.layoutHotel') }}</text>
        </view>
      </view>
      <view class="hint">{{ $t('decorateProduct.layoutHint') }}</view>
    </view>

    <view class="card" v-for="b in BLOCKS" :key="b.key">
      <view class="cell row-in block-head">
        <text class="lbl">{{ $t('decorateProduct.block.' + b.key) }}</text>
        <view class="seg">
          <text :class="{ on: visibleOf(b.key) }" @tap="toggleVisible(b.key)">{{ visibleOf(b.key) ? $t('decorateProduct.show') : $t('decorateProduct.hide') }}</text>
        </view>
      </view>
      <view class="cell col">
        <text class="lbl small">{{ $t('decorateProduct.styleJson') }}</text>
        <textarea
          class="ta"
          v-model="styleText[b.key]"
          :placeholder="b.placeholder"
        />
        <text v-if="styleErr[b.key]" class="err">{{ styleErr[b.key] }}</text>
      </view>
    </view>

    <button class="save" :disabled="saving" @tap="save">{{ saving ? $t('decorateProduct.saving') : $t('decorateProduct.save') }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

// 对齐 nshop layers/base/app/utils/detail-config.ts 的块键与兜底语义
const BLOCKS = [
  { key: 'gallery', placeholder: '{ "imageWidth": 750 }' },
  { key: 'info', placeholder: '{}' },
  { key: 'price', placeholder: '{ "style": "classic" }' },
  { key: 'promo', placeholder: '{ "style": "classic" }' },
  { key: 'service', placeholder: '{ "style": "classic" }' },
  { key: 'variants', placeholder: '{}' },
  { key: 'purchase', placeholder: '{ "style": "classic" }' },
  { key: 'description', placeholder: '{}' },
  { key: 'reviews', placeholder: '{ "visible": true }' },
  { key: 'nearby', placeholder: '{}' },
  { key: 'related', placeholder: '{}' },
  { key: 'datebar', placeholder: '{}' },
  { key: 'roomList', placeholder: '{}' },
  { key: 'pricePreview', placeholder: '{}' },
  { key: 'policy', placeholder: '{}' },
] as const;

const locale = useLocaleStore();
const f = ref({ layout: 'classic' as string });
const styleText = ref<Record<string, string>>({});
const styleErr = ref<Record<string, string>>({});
const saving = ref(false);
let channelId = '';

const BLOCK_KEYS = BLOCKS.map((b) => b.key);

function setLayout(s: string) { f.value.layout = s; }

function visibleOf(key: string): boolean {
  const raw = styleText.value[key]?.trim();
  if (!raw) return true;
  try {
    const v = JSON.parse(raw);
    return v?.visible !== false;
  } catch {
    return true;
  }
}

function toggleVisible(key: string) {
  const raw = styleText.value[key]?.trim();
  let obj: any = {};
  if (raw) {
    try { obj = JSON.parse(raw); } catch { /* 坏 JSON 重置 */ }
  }
  if (typeof obj !== 'object' || obj === null) obj = {};
  obj.visible = obj.visible === false ? true : false;
  styleText.value[key] = JSON.stringify(obj, null, 2);
}

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
  const cf = ch.customFields as any;
  const cfg = safeParse(cf.detailConfig);
  if (cfg?.layout) f.value.layout = cfg.layout;
  for (const k of BLOCK_KEYS) {
    const blk = cfg?.blocks?.[k];
    if (blk && typeof blk === 'object') {
      styleText.value[k] = JSON.stringify(blk, null, 2);
    }
  }
});

async function save() {
  for (const k of BLOCK_KEYS) {
    const raw = styleText.value[k]?.trim();
    if (!raw) continue;
    try { JSON.parse(raw); } catch {
      styleErr.value[k] = locale.t('decorateProduct.invalidJson').replace('{key}', k);
      uni.showToast({ title: locale.t('decorateProduct.invalidJsonToast'), icon: 'none' });
      return;
    }
  }
  saving.value = true;
  const blocks: Record<string, any> = {};
  for (const k of BLOCK_KEYS) {
    const raw = styleText.value[k]?.trim();
    if (raw) blocks[k] = JSON.parse(raw);
  }
  const cfg = { version: 2, layout: f.value.layout, blocks };
  try {
    await updateChannelCustomFields(channelId, { detailConfig: JSON.stringify(cfg) });
    uni.showToast({ title: locale.t('decorateProduct.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('decorateProduct.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; margin-bottom: 24rpx;
    &.head-card { padding: 24rpx 32rpx; }
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; padding: 20rpx 0 8rpx;
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .sub { font-size: 22rpx; color: $wa-muted; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 200rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0;
      &.small { font-size: 24rpx; color: $wa-muted; width: auto; }
    }
    &.col { flex-direction: column; align-items: flex-start;
      .lbl { margin-bottom: 12rpx; }
    }
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    &.block-head { padding: 16rpx 0 8rpx; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .ta { box-sizing: border-box; width: 100%; height: 120rpx; background: $wa-bg; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 24rpx; }
  .hint { font-size: 22rpx; color: $wa-muted; line-height: 1.6; padding: 8rpx 0 16rpx; }
  .err { color: #e6162d; font-size: 22rpx; margin-top: 8rpx; }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
