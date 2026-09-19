<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">源仓库 *</text>
        <picker mode="selector" :range="locNames" @change="onFromChange">
          <view class="picker">{{ curFromName || '请选择源仓库' }} ▾</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">目标仓库 *</text>
        <picker mode="selector" :range="locNames" @change="onToChange">
          <view class="picker">{{ curToName || '请选择目标仓库' }} ▾</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">变体 ID (variantId) *</text>
        <input class="ipt" v-model="variantId" type="number" placeholder="如 42" />
      </view>
      <view class="field">
        <text class="label">移库数量 *</text>
        <input class="ipt" v-model="qty" type="number" placeholder="调拨数量" />
      </view>
    </view>
    <view class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? '提交中…' : '移库' }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchStockLocations } from '../../../../apis/inventory';
import { createStockDoc } from '../../../../apis/stock-doc';

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
  if (fromIdx.value < 0) return uni.showToast({ title: '请选择源仓库', icon: 'none' });
  if (toIdx.value < 0) return uni.showToast({ title: '请选择目标仓库', icon: 'none' });
  if (toIdx.value === fromIdx.value) return uni.showToast({ title: '源仓与目标仓不能相同', icon: 'none' });
  if (!variantId.value.trim()) return uni.showToast({ title: '请填写变体 ID', icon: 'none' });
  if (!qty.value || Number(qty.value) <= 0) return uni.showToast({ title: '请填写正确数量', icon: 'none' });
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
    uni.showToast({ title: `已移库 ${doc.code}`, icon: 'success' });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '提交失败', icon: 'none' });
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