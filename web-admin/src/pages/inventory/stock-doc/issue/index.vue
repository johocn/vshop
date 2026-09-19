<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">源仓库 *</text>
        <picker mode="selector" :range="locNames" @change="onLocChange">
          <view class="picker">{{ curLocName || '请选择源仓库' }} ▾</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">变体 ID (variantId) *</text>
        <input class="ipt" v-model="variantId" type="number" placeholder="如 42" />
      </view>
      <view class="field">
        <text class="label">出库数量 *</text>
        <input class="ipt" v-model="qty" type="number" placeholder="出库数量" />
      </view>
      <view class="field">
        <text class="label">原因</text>
        <input class="ipt" v-model="remark" placeholder="选填，如 报损/领用" />
      </view>
    </view>
    <view class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? '提交中…' : '出库' }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchStockLocations } from '../../../../apis/inventory';
import { createStockDoc } from '../../../../apis/stock-doc';

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const curLocName = ref('');
const variantId = ref('');
const qty = ref('');
const remark = ref('');
const saving = ref(false);

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  curLocName.value = locNames.value[locIdx.value];
}

async function onSave() {
  if (locIdx.value < 0) return uni.showToast({ title: '请选择源仓库', icon: 'none' });
  if (!variantId.value.trim()) return uni.showToast({ title: '请填写变体 ID', icon: 'none' });
  if (!qty.value || Number(qty.value) <= 0) return uni.showToast({ title: '请填写正确数量', icon: 'none' });
  saving.value = true;
  try {
    const doc = await createStockDoc({
      type: 'ISSUE',
      remark: remark.value.trim() || undefined,
      items: [{
        variantId: variantId.value,
        fromStockLocationId: locations.value[locIdx.value].id,
        qty: Number(qty.value),
      }],
    });
    uni.showToast({ title: `已出库 ${doc.code}`, icon: 'success' });
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