<template>
  <view class="page">
    <!-- 核销输入 -->
    <view class="claim-card">
      <input
        class="code-input"
        v-model="code"
        placeholder="请输入核销码"
        :maxlength="6"
        confirm-type="done"
        @confirm="onClaim"
      />
      <button class="claim-btn" :disabled="claiming" @tap="onClaim">{{ claiming ? '核销中…' : '核销' }}</button>
    </view>

    <!-- 待核销自提单列表 -->
    <text class="sec-title">待核销自提单</text>
    <view class="card" v-for="r in orders" :key="r.id">
      <view class="head">
        <text class="code">#{{ r.orderCode || r.orderId }}</text>
        <text class="st" :style="{ color: stateLabel(REDEMPTION_STATES, r.status).color }">{{ stateLabel(REDEMPTION_STATES, r.status).label }}</text>
      </view>
      <view class="line">
        <text>核销码</text>
        <text class="mono">{{ r.code }}</text>
      </view>
      <view class="line" v-if="r.claimedAt">
        <text>核销时间</text>
        <text>{{ formatTime(r.claimedAt) }}</text>
      </view>
    </view>
    <view v-if="!orders.length" class="empty">暂无待核销自提单</view>

    <view style="height: 140rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { fetchPickupOrders, claimPickup, PickupRedemptionItem } from '../../../apis/pickup';
import { REDEMPTION_STATES, stateLabel } from '../../../constants/orderState';

const code = ref('');
const orders = ref<PickupRedemptionItem[]>([]);
const claiming = ref(false);

function formatTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadList(): Promise<void> {
  try {
    orders.value = await fetchPickupOrders(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  }
}

onLoad(async (q) => {
  const c = (q && (q.code as string)) || '';
  const orderId = (q && (q.orderId as string)) || '';
  if (c) {
    code.value = c;
  } else if (orderId) {
    // 订单详情「去核销」跳转只带 orderId 时，从核销记录匹配出该单核销码预填
    try {
      const list = await fetchPickupOrders(false);
      const hit = list.find((r) => String(r.orderId) === orderId);
      if (hit) code.value = hit.code;
    } catch (_e) {
      /* 匹配失败不阻塞，用户可手输 */
    }
  }
});

// onShow 在每次进入/返回本页时刷新列表（含核销成功后）
onShow(() => { loadList(); });

async function onClaim(): Promise<void> {
  const c = code.value.trim();
  if (!c) {
    uni.showToast({ title: '请输入核销码', icon: 'none' });
    return;
  }
  claiming.value = true;
  try {
    await claimPickup(c);
    uni.showToast({ title: '核销成功', icon: 'success' });
    code.value = '';
    await loadList();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '核销失败', icon: 'none' });
  } finally {
    claiming.value = false;
  }
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .claim-card {
    display: flex; align-items: center; gap: 16rpx;
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 24rpx;
    .code-input {
      flex: 1; height: 72rpx; padding: 0 24rpx; font-size: 32rpx; letter-spacing: 4rpx;
      background: $wa-bg; border-radius: $wa-radius; color: $wa-ink;
    }
    .claim-btn {
      margin: 0; min-width: 168rpx; height: 72rpx; line-height: 72rpx; padding: 0 24rpx;
      font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius;
      &[disabled] { opacity: 0.6; }
    }
  }
  .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
      .code { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
      .st { font-size: 24rpx; }
    }
    .line {
      display: flex; align-items: center; justify-content: space-between; font-size: 26rpx;
      color: $wa-muted; padding: 6rpx 0;
      .mono { color: $wa-ink; letter-spacing: 2rpx; font-weight: 600; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>