<template>
  <view class="page">
    <view class="card">
      <view class="field" v-if="id">
        <text class="label">{{ $t('flashSaleEdit.statusLabel') }}</text>
        <view class="chips"><text class="chip readonly">{{ statusLabel(detail?.status) }}</text></view>
        <text class="tip">{{ $t('flashSaleEdit.statusTip') }}</text>
      </view>

      <view class="field">
        <text class="label">{{ $t('flashSaleEdit.nameLabel') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('flashSaleEdit.phName')" />
      </view>

      <view class="pair">
        <view class="field">
          <text class="label">{{ $t('flashSaleEdit.startAtLabel') }}</text>
          <picker mode="date" :value="form.startAt || ''" @change="form.startAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.startAt || $t('flashSaleEdit.chooseDate') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">{{ $t('flashSaleEdit.endAtLabel') }}</text>
          <picker mode="date" :value="form.endAt || ''" @change="form.endAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.endAt || $t('flashSaleEdit.chooseDate') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
      </view>
      <text class="dtime-tip">{{ $t('flashSaleEdit.dateTip') }}</text>

      <view class="field">
        <text class="label">{{ $t('flashSaleEdit.priceLabel') }}</text>
        <input class="ipt" v-model="form.priceYuan" type="digit" :placeholder="$t('flashSaleEdit.phPrice')" />
        <text class="tip">{{ $t('flashSaleEdit.priceTip') }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('flashSaleEdit.stockLabel') }}</text>
        <input class="ipt" v-model="form.totalStock" type="number" :placeholder="$t('flashSaleEdit.phStock')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('flashSaleEdit.limitLabel') }} <text class="opt">{{ $t('flashSaleEdit.zeroUnlimited') }}</text></text>
        <input class="ipt" v-model="form.limitPerUser" type="number" :placeholder="$t('flashSaleEdit.phLimit')" />
      </view>

      <view class="field">
        <text class="label">{{ $t('flashSaleEdit.productIdLabel') }}</text>
        <input class="ipt" v-model="form.productId" :placeholder="$t('flashSaleEdit.phProductId')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('flashSaleEdit.variantIdLabel') }}</text>
        <input class="ipt" v-model="form.variantId" :placeholder="$t('flashSaleEdit.phVariantId')" />
        <text class="tip">{{ $t('flashSaleEdit.variantIdTip') }}</text>
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">{{ $t('flashSaleEdit.back') }}</button>
      <button class="btn main" @tap="onSave">{{ $t('flashSaleEdit.save') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchFlashSaleActivity, createFlashSaleActivity, updateFlashSaleActivity,
  FlashSaleActivity, FlashSaleStatus,
} from '../../../apis/flashSale';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';

const locale = useLocaleStore();

const id = ref<string | null>(null);
const detail = ref<FlashSaleActivity | null>(null);

const STATUS_KEY: Record<FlashSaleStatus, string> = {
  upcoming: 'flashSaleList.statusUpcoming',
  active: 'flashSaleList.statusActive',
  ended: 'flashSaleList.statusEnded',
};
const statusLabel = (s?: FlashSaleStatus) => (s ? locale.t(STATUS_KEY[s] || s) : '-');

const form = ref({
  name: '',
  startAt: '',
  endAt: '',
  priceYuan: '',
  totalStock: '',
  limitPerUser: '0',
  productId: '',
  variantId: '',
});

function toInt(s: string): number { return Math.max(0, Math.round(Number(s) || 0)); }

/** 日期选择器取当天整段（与优惠券编辑页同口径）：开始日 0 点起、结束日 23:59:59 止 */
function buildInput() {
  const f = form.value;
  const model: Record<string, unknown> = {
    name: f.name.trim(),
    flashPrice: Math.max(1, Math.round((Number(f.priceYuan) || 0) * 100)),
    totalStock: toInt(f.totalStock),
    limitPerUser: toInt(f.limitPerUser),
    productId: f.productId.trim(),
    variantId: f.variantId.trim(),
  };
  if (f.startAt) model.startAt = `${f.startAt}T00:00:00.000Z`;
  if (f.endAt) model.endAt = `${f.endAt}T23:59:59.999Z`;
  return model;
}

async function onSave() {
  const f = form.value;
  if (!f.name.trim()) { uni.showToast({ title: locale.t('flashSaleEdit.requireName'), icon: 'none' }); return; }
  if (!f.startAt || !f.endAt) { uni.showToast({ title: locale.t('flashSaleEdit.requireDate'), icon: 'none' }); return; }
  if (f.startAt > f.endAt) { uni.showToast({ title: locale.t('flashSaleEdit.invalidDateRange'), icon: 'none' }); return; }
  if (!(Number(f.priceYuan) > 0)) { uni.showToast({ title: locale.t('flashSaleEdit.requirePrice'), icon: 'none' }); return; }
  if (toInt(f.totalStock) <= 0) { uni.showToast({ title: locale.t('flashSaleEdit.requireStock'), icon: 'none' }); return; }
  if (!f.productId.trim()) { uni.showToast({ title: locale.t('flashSaleEdit.requireProduct'), icon: 'none' }); return; }
  if (!f.variantId.trim()) { uni.showToast({ title: locale.t('flashSaleEdit.requireVariant'), icon: 'none' }); return; }
  try {
    if (id.value) {
      await updateFlashSaleActivity({ id: id.value, ...buildInput() });
    } else {
      await createFlashSaleActivity(buildInput() as any);
    }
    uni.showToast({ title: locale.t('flashSaleEdit.saved') });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('flashSaleEdit.saveFailed'), icon: 'none' });
  }
}

async function loadAll() {
  if (!id.value) return;
  try {
    const c = await fetchFlashSaleActivity(id.value);
    if (!c) return;
    detail.value = c;
    form.value = {
      name: c.name || '',
      startAt: c.startAt ? c.startAt.slice(0, 10) : '',
      endAt: c.endAt ? c.endAt.slice(0, 10) : '',
      priceYuan: c.flashPrice != null ? String(c.flashPrice / 100) : '',
      totalStock: String(c.totalStock ?? 0),
      limitPerUser: String(c.limitPerUser ?? 0),
      productId: c.productId || '',
      variantId: c.variantId || '',
    };
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('flashSaleEdit.loadFailed'), icon: 'none' });
  }
}

onLoad((query: any) => {
  if (query?.id) id.value = query?.id as string;
});
onMounted(loadAll);

function goBack() { backToHome(); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .field { margin-bottom: 20rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx;
        .opt { font-size: 22rpx; color: #aaa; font-weight: 400; } }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%; }
      .vpicker { display: flex; align-items: center; justify-content: space-between; }
      .caret { color: $wa-muted; font-size: 24rpx; }
      .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; } }
    .pair { display: flex; gap: 12rpx;
      .field { flex: 1; margin-bottom: 0; } }
    .dtime-tip { display: block; margin: 6rpx 0 20rpx; font-size: 22rpx; color: $wa-muted; }
    .chips { display: flex; flex-wrap: wrap; gap: 12rpx;
      .chip { font-size: 24rpx; background: $wa-bg; border: 1rpx solid $wa-rule; border-radius: 999rpx; padding: 8rpx 24rpx; color: $wa-ink;
        &.readonly { color: #0a9c6e; border-color: #0a9c6e; } } } }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; } }
}
</style>
