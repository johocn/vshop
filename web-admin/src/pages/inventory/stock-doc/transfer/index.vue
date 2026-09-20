<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">{{ $t('stockDocTransfer.labelFromLoc') }}</text>
        <picker mode="selector" :range="locNames" @change="onFromChange">
          <view class="picker">{{ curFromName || $t('stockDocTransfer.selectFromLoc') }} ▾</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocTransfer.labelToLoc') }}</text>
        <picker mode="selector" :range="locNames" @change="onToChange">
          <view class="picker">{{ curToName || $t('stockDocTransfer.selectToLoc') }} ▾</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocTransfer.labelVariant') }}</text>
        <input class="ipt" v-model="variantId" type="number" :placeholder="$t('stockDocTransfer.placeholderVariant')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocTransfer.labelQty') }}</text>
        <input class="ipt" v-model="qty" type="number" :placeholder="$t('stockDocTransfer.placeholderQty')" />
      </view>
    </view>
    <view class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? $t('stockDocTransfer.submitting') : $t('stockDocTransfer.submit') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useLocaleStore } from '../../../../stores/localeStore';
import { fetchStockLocations } from '../../../../apis/inventory';
import { createStockDoc } from '../../../../apis/stock-doc';

const locale = useLocaleStore();

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const fromIdx = ref(-1);
const toIdx = ref(-1);
const curFromName = ref('');
const curToName = ref('');
const variantId = ref('');
const qty = ref('');
const saving = ref(false);

function onFromChange(e: any) {
  fromIdx.value = Number(e.detail.value);
  curFromName.value = locNames.value[fromIdx.value];
}
function onToChange(e: any) {
  toIdx.value = Number(e.detail.value);
  curToName.value = locNames.value[toIdx.value];
}

async function onSave() {
  if (fromIdx.value < 0) return uni.showToast({ title: locale.t('stockDocTransfer.requireFrom'), icon: 'none' });
  if (toIdx.value < 0) return uni.showToast({ title: locale.t('stockDocTransfer.requireTo'), icon: 'none' });
  if (toIdx.value === fromIdx.value) return uni.showToast({ title: locale.t('stockDocTransfer.sameLoc'), icon: 'none' });
  if (!variantId.value.trim()) return uni.showToast({ title: locale.t('stockDocTransfer.requireVariant'), icon: 'none' });
  if (!qty.value || Number(qty.value) <= 0) return uni.showToast({ title: locale.t('stockDocTransfer.requireQty'), icon: 'none' });
  saving.value = true;
  try {
    const doc = await createStockDoc({
      type: 'TRANSFER',
      items: [{
        variantId: variantId.value,
        fromStockLocationId: locations.value[fromIdx.value].id,
        toStockLocationId: locations.value[toIdx.value].id,
        qty: Number(qty.value),
      }],
    });
    uni.showToast({ title: locale.t('stockDocTransfer.done').replace('{code}', doc.code), icon: 'success' });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stockDocTransfer.submitFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx;
    .field { margin-bottom: 32rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 12rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink; }
      .picker { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink; }
    }
  }
  .savebar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
    .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  }
}
</style>