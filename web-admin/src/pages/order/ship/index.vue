<template>
  <view class="page">
    <view class="card">
      <view class="cell"><text>配送方式</text><input v-model="method" placeholder="standard" /></view>
      <view class="cell"><text>运单号</text><input v-model="tracking" placeholder="选填" /></view>
    </view>
    <button class="save" @tap="submit">确认发货</button>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fulfillOrder, fetchOrderDetail } from '../../../apis/order';
const id = ref('');
const method = ref('standard');
const tracking = ref('');
const lineIds = ref<string[]>([]);
onMounted(async () => {
  id.value = ((getCurrentPages().at(-1) as any)?.options?.id) || '';
  const d: any = await fetchOrderDetail(id.value);
  lineIds.value = (d?.lines || []).map((l: any) => l.id);
});
async function submit() {
  if (!lineIds.value.length) { uni.showToast({ title: '无待发货商品', icon: 'none' }); return; }
  try {
    await fulfillOrder(lineIds.value, method.value, tracking.value);
    uni.showToast({ title: '已发货', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 800);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '发货失败', icon: 'none' });
  }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx;
    .cell { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      text { width: 160rpx; font-size: 28rpx; color: $wa-ink; }
      input { flex: 1; font-size: 28rpx; color: $wa-ink; }
    }
  }
  .save { margin-top: 24rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; font-size: 30rpx; }
}
</style>
