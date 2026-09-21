<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelToLoc') }}</text>
        <picker mode="selector" :range="locNames" @change="onLocChange">
          <view class="picker">{{ curLocName || $t('stockDocPurchase.selectLoc') }} ▾</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelVariant') }}</text>
        <input class="ipt" v-model="variantId" type="number" :placeholder="$t('stockDocPurchase.placeholderVariant')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelQty') }}</text>
        <input class="ipt" v-model="qty" type="number" :placeholder="$t('stockDocPurchase.placeholderQty')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelCost') }}</text>
        <input class="ipt" v-model="costPrice" type="number" :placeholder="$t('stockDocPurchase.optional')" />
      </view>
    </view>
    <view class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? $t('stockDocPurchase.submitting') : $t('stockDocPurchase.submit') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../../stores/localeStore';
import { fetchStockLocations } from '../../../../apis/inventory';
import { createStockDoc } from '../../../../apis/stock-doc';

const locale = useLocaleStore();

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const curLocName = ref('');
const variantId = ref('');
const qty = ref('');
const costPrice = ref('');
const saving = ref(false);

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  curLocName.value = locNames.value[locIdx.value];
}

async function onSave() {
  if (locIdx.value < 0) return uni.showToast({ title: locale.t('stockDocPurchase.requireLoc'), icon: 'none' });
  if (!variantId.value.trim()) return uni.showToast({ title: locale.t('stockDocPurchase.requireVariant'), icon: 'none' });
  if (!qty.value || Number(qty.value) <= 0) return uni.showToast({ title: locale.t('stockDocPurchase.requireQty'), icon: 'none' });
  saving.value = true;
  try {
    const doc = await createStockDoc({
      type: 'PURCHASE',
      items: [{
        variantId: variantId.value,
        toStockLocationId: locations.value[locIdx.value].id,
        qty: Number(qty.value),
        costPrice: costPrice.value ? Number(costPrice.value) : undefined,
      }],
    });
    uni.showToast({ title: locale.t('stockDocPurchase.done').replace('{code}', doc.code), icon: 'success' });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stockDocPurchase.submitFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

// 支持从库存主页「补货」带参进入：?variantId=&qty=&locationId=（契约 1.6）
onLoad(async (q: any) => {
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
  const wantLoc = String(q?.locationId ?? '');
  if (wantLoc) {
    const i = locations.value.findIndex((l) => l.id === wantLoc);
    if (i >= 0) {
      locIdx.value = i;
      curLocName.value = locations.value[i].name;
    }
  }
  if (q?.variantId) variantId.value = String(q.variantId);
  if (q?.qty) qty.value = String(q.qty);
  if (q?.variantId || q?.qty) {
    uni.showToast({ title: locale.t('stockDocPurchase.prefilled'), icon: 'none' });
  }
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