<template>
  <view class="page">
    <view class="card" v-for="l in lines" :key="l.id">
      <view class="row">
        <text class="name">{{ l.name }}</text>
        <text class="sku">{{ l.sku }}</text>
      </view>
      <view class="row row-bottom">
        <text class="avail">可发 {{ l.quantity }}</text>
        <view class="qty-op" v-if="l.quantity > 0">
          <text class="btn" :class="{ off: l.picked <= 0 }" @tap="dec(l)">−</text>
          <text class="num">{{ l.picked }}</text>
          <text class="btn" :class="{ off: l.picked >= l.quantity }" @tap="inc(l)">+</text>
        </view>
        <text class="muted" v-else>无剩余可发</text>
      </view>
    </view>

    <view class="card">
      <picker :range="dispatchOptions" :value="dispatchIdx" @change="dispatchIdx = $event.detail.value">
        <view class="row">快递公司：{{ dispatchOptions[dispatchIdx] }} ›</view>
      </picker>
      <input class="tracking" v-model="tracking" placeholder="运单号（选填）" />
    </view>

    <button class="submit" @tap="submit">确认发货</button>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchOrderDetail, partialShip } from '../../../apis/order';

interface Line {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  picked: number;
}

const orderId = ref('');
const lines = ref<Line[]>([]);
const dispatchOptions = ['顺丰', '中通', '圆通', '韵达', '极兔', 'EMS'];
const dispatchIdx = ref(0);
const tracking = ref('');

// 快递公司：将 picker 下标映射为发货 method
function dispatch(idx: number): string {
  return dispatchOptions[idx] || 'standard';
}

function inc(l: Line) {
  if (l.picked < l.quantity) l.picked += 1;
}

function dec(l: Line) {
  if (l.picked > 0) l.picked -= 1;
}

function emptySelected() {
  return !lines.value.some((l) => l.picked > 0);
}

async function submit() {
  if (emptySelected()) {
    uni.showToast({ title: '请选择商品', icon: 'none' });
    return;
  }
  try {
    const parts = lines.value
      .filter((l) => l.picked > 0)
      .map((l) => ({ orderLineId: l.id, quantity: l.picked }));
    await partialShip(orderId.value, parts, dispatch(dispatchIdx.value), tracking.value.trim() || undefined);
    uni.showToast({ title: '发货成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '发货失败', icon: 'none' });
  }
}

onLoad(async (q) => {
  const id: string = (q && (q.id as string)) || '';
  orderId.value = id;
  if (!id) {
    uni.showToast({ title: '缺少订单', icon: 'none' });
    return;
  }
  const order = await fetchOrderDetail(id);
  if (order && order.lines) {
    lines.value = order.lines.map((l) => ({
      id: l.id,
      name: l.productVariant?.name || '',
      sku: l.productVariant?.sku || '',
      quantity: l.quantity,
      picked: l.quantity,
    }));
  }
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
      .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .sku { font-size: 24rpx; color: $wa-muted; }
    }
    .row-bottom { margin-top: 16rpx; align-items: center;
      .avail { font-size: 24rpx; color: $wa-muted; }
      .muted { font-size: 24rpx; color: $wa-muted; }
    }
    .qty-op {
      display: inline-flex; align-items: center; gap: 24rpx;
      .btn {
        width: 52rpx; height: 52rpx; line-height: 48rpx; text-align: center;
        font-size: 34rpx; color: $wa-accent; background: #fff4ea;
        border-radius: 8rpx;
        &.off { color: #ccc; background: $wa-bg; }
      }
      .num { min-width: 48rpx; text-align: center; font-size: 30rpx; color: $wa-ink; }
    }
    .tracking {
      margin-top: 20rpx; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink;
      background: $wa-bg; border-radius: 8rpx;
    }
  }
  .submit {
    margin-top: 12rpx; background: $wa-accent; color: #fff; font-size: 30rpx;
    height: 88rpx; line-height: 88rpx; border-radius: $wa-radius;
  }
}
</style>