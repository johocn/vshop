<template>
  <view class="page">
    <view class="card" v-for="l in lines" :key="l.id">
      <view class="row">
        <text class="name">{{ l.name }}</text>
        <text class="sku">{{ l.sku }}</text>
      </view>
      <view class="row row-bottom">
        <text class="avail">可发 {{ l.availQty }}</text>
        <view class="wh-pick" v-if="l.whOptions.length > 0">
          <picker :range="whLabels(l)" :value="l.whIdx" @change="l.whIdx = Number($event.detail.value)">
            <view class="wh-txt">仓库：{{ whLabels(l)[l.whIdx] }} ›</view>
          </picker>
        </view>
        <view class="qty-op" v-if="l.availQty > 0">
          <text class="btn" :class="{ off: l.picked <= 0 }" @tap="dec(l)">−</text>
          <text class="num">{{ l.picked }}</text>
          <text class="btn" :class="{ off: l.picked >= l.availQty }" @tap="inc(l)">+</text>
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
import { fetchOrderDetail, partialShip, shipByWarehouse, ShipLinePart } from '../../../apis/order';
import { fetchReservationByOrder, Reservation } from '../../../apis/reservation';

interface WhOption {
  stockLocationId: string;
  qty: number;
}

interface Line {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  availQty: number;
  picked: number;
  whOptions: WhOption[];
  whIdx: number;
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

// 该行的仓库选项文案（仓库 id + 预留数量）
function whLabels(l: Line): string[] {
  return l.whOptions.map((o) => `${o.stockLocationId}（${o.qty}）`);
}

// 按订单行聚合预留明细：预留单 items 里该 orderLineId 各仓数量
function whOptionsFor(lineId: string, reservations: Reservation[]): WhOption[] {
  const map = new Map<string, number>();
  for (const r of reservations) {
    if (r.orderLineId !== lineId) continue;
    for (const it of r.items) {
      if (!it.stockLocationId) continue;
      map.set(it.stockLocationId, (map.get(it.stockLocationId) || 0) + it.qty);
    }
  }
  return [...map.entries()].map(([stockLocationId, qty]) => ({ stockLocationId, qty }));
}

function inc(l: Line) {
  if (l.picked < l.availQty) l.picked += 1;
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
  const method = dispatch(dispatchIdx.value);
  const trackingCode = tracking.value.trim() || undefined;
  const hasRes = lines.value.some((l) => l.whOptions.length > 0);
  try {
    if (hasRes) {
      // 多仓：按仓库聚合 parts，逐仓生成独立 fulfillment
      const byWh = new Map<string, ShipLinePart[]>();
      for (const l of lines.value) {
        if (l.picked <= 0) continue;
        const wh = l.whOptions[l.whIdx]?.stockLocationId || '未分仓';
        const arr = byWh.get(wh) || [];
        arr.push({ orderLineId: l.id, quantity: l.picked });
        byWh.set(wh, arr);
      }
      const shipments = [...byWh.entries()].map(([stockLocationId, parts]) => ({
        stockLocationId,
        parts,
        method,
        trackingCode,
      }));
      const { fails } = await shipByWarehouse(orderId.value, shipments);
      if (fails.length) {
        uni.showToast({ title: `部分发货失败：${fails.join('；')}`, icon: 'none', duration: 3000 });
        return;
      }
    } else {
      // 无预留单：保持原单仓 partialShip 路径
      const parts = lines.value
        .filter((l) => l.picked > 0)
        .map((l) => ({ orderLineId: l.id, quantity: l.picked }));
      await partialShip(orderId.value, parts, method, trackingCode);
    }
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
  // 预留单查询失败静默降级：无预留单走原单仓路径，不影响现有流程
  const [order, reservations] = await Promise.all([
    fetchOrderDetail(id),
    fetchReservationByOrder(id).catch(() => [] as Reservation[]),
  ]);
  if (order && order.lines) {
    lines.value = order.lines.map((l) => {
      const whOptions = whOptionsFor(l.id, reservations);
      const availQty = whOptions.length
        ? whOptions.reduce((s, o) => s + o.qty, 0)
        : l.quantity;
      return {
        id: l.id,
        name: l.productVariant?.name || '',
        sku: l.productVariant?.sku || '',
        quantity: l.quantity,
        availQty,
        whOptions,
        whIdx: 0,
        picked: availQty, // 默认按预留分配回填各仓数量
      };
    });
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
      .wh-pick {
        .wh-txt {
          font-size: 24rpx; color: $wa-accent; padding: 8rpx 16rpx;
          background: #fff4ea; border-radius: 8rpx;
        }
      }
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
