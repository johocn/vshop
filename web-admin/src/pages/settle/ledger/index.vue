<template>
  <view class="page">
    <view class="kpis" v-if="rows.length">
      <view class="kpi">
        <text class="v">{{ fmt(stat.paid) }}</text>
        <text class="l">已收</text>
      </view>
      <view class="kpi">
        <text class="v warn">{{ fmt(stat.pending) }}</text>
        <text class="l">待收款</text>
      </view>
      <view class="kpi">
        <text class="v">{{ fmt(stat.total) }}</text>
        <text class="l">合计</text>
      </view>
    </view>

    <text class="sec-title">收款台账（{{ rows.length }}）</text>
    <view class="card" v-for="r in rows" :key="r.id">
      <view class="head">
        <view class="left">
          <text class="ord">#{{ r.orderId }}</text>
          <text v-if="isPendingSign(r.status)" class="tag-p">待收款</text>
          <text v-else class="tag-d">已收款</text>
        </view>
        <text class="amt">{{ fmt(r.amount) }}</text>
      </view>
      <view class="line">
        <text>方式</text>
        <text>{{ settleMethodLabel(r.settleMethod) }}</text>
      </view>
      <view class="line" v-if="r.tenantName">
        <text>商户</text>
        <text>{{ r.tenantName }}</text>
      </view>
      <view class="line">
        <text>入账时间</text>
        <text>{{ formatTime(r.occurredAt) }}</text>
      </view>
    </view>
    <view v-if="!rows.length" class="empty">
      <text class="e1">暂无收款台账记录</text>
      <text class="e2">到店/货到付款单核销并确认收款后，会在此登记一笔收款</text>
    </view>

    <view style="height: 140rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchSettlementLedgers,
  settleMethodLabel,
  isPendingSign,
  SettlementLedgerRow,
} from '../../../apis/settlement';

const rows = ref<SettlementLedgerRow[]>([]);

const stat = computed(() => {
  const paid = rows.value.filter((r) => !isPendingSign(r.status)).reduce((s, r) => s + r.amount, 0);
  const pending = rows.value.filter((r) => isPendingSign(r.status)).reduce((s, r) => s + r.amount, 0);
  return { paid, pending, total: paid + pending };
});

function fmt(v: number): string {
  return '¥' + (v / 100).toFixed(2);
}
function formatTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load(): Promise<void> {
  try {
    rows.value = await fetchSettlementLedgers();
    rows.value.sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime());
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  }
}

onShow(() => { load(); });
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; margin-bottom: 24rpx;
  .kpi { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 12rpx; text-align: center;
    .v { font-size: 34rpx; font-weight: 800; color: $wa-ink; &.warn { color: #b45309; } }
    .l { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }
}
.sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
.card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
    .left { display: flex; align-items: center; gap: 12rpx; }
    .ord { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .amt { font-size: 34rpx; font-weight: 800; color: $wa-accent; }
    .tag-p { padding: 2rpx 14rpx; border-radius: 8rpx; font-size: 22rpx; color: #b45309; background: #fef3c7; border: 1rpx solid #fcd34d; }
    .tag-d { padding: 2rpx 14rpx; border-radius: 8rpx; font-size: 22rpx; color: #059669; background: #d1fae5; border: 1rpx solid #6ee7b7; }
  }
  .line { display: flex; align-items: center; justify-content: space-between; font-size: 26rpx; color: $wa-muted; padding: 6rpx 0; }
}
.empty { text-align: center; color: $wa-muted; padding: 100rpx 24rpx;
  .e1 { display: block; font-size: 30rpx; color: $wa-ink; margin-bottom: 12rpx; }
  .e2 { display: block; font-size: 24rpx; line-height: 1.6; }
}
</style>