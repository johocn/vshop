<template>
  <view class="page">
    <view class="kpis" v-if="rows.length">
      <view class="kpi today">
        <text class="v">{{ fmt(stat.todayPaid.amount) }}</text>
        <text class="l">今日收款 {{ stat.todayPaid.count }} 笔</text>
      </view>
      <view class="kpi">
        <text class="v">{{ fmt(stat.paid.amount) }}</text>
        <text class="l">已收 {{ stat.paid.count }} 笔</text>
      </view>
      <view class="kpi">
        <text class="v warn">{{ fmt(stat.pending.amount) }}</text>
        <text class="l">待收款 {{ stat.pending.count }} 笔</text>
      </view>
    </view>

    <view class="sec-title" v-if="todayRows.length">今日收款明细（{{ todayRows.length }}）</view>
    <LedgerCard v-for="r in todayRows" :key="'t' + r.id" :row="r" :today="true" />
    <view class="empty-inline" v-if="rows.length && !todayRows.length">
      <text>今日暂无已完成收款</text>
    </view>

    <view class="sec-title">收款台账（{{ rows.length }}）</view>
    <LedgerCard v-for="r in rows" :key="r.id" :row="r" />

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
  isPendingSign,
  rowTime,
  isToday,
  SettlementLedgerRow,
} from '../../../apis/settlement';
import LedgerCard from './LedgerCard.vue';

const rows = ref<SettlementLedgerRow[]>([]);

const paidRows = computed(() => rows.value.filter((r) => !isPendingSign(r.status)));
const pendingRows = computed(() => rows.value.filter((r) => isPendingSign(r.status)));
const todayRows = computed(() => paidRows.value.filter((r) => isToday(rowTime(r)?.toISOString?.() ?? '')));

const stat = computed(() => {
  const sum = (list: SettlementLedgerRow[]) =>
    list.reduce(
      (s, r) => ({ amount: s.amount + r.amount, count: s.count + 1 }),
      { amount: 0, count: 0 },
    );
  return {
    paid: sum(paidRows.value),
    pending: sum(pendingRows.value),
    total: sum(rows.value),
    todayPaid: sum(todayRows.value),
  };
});

function fmt(v: number): string {
  return '¥' + (v / 100).toFixed(2);
}

async function load(): Promise<void> {
  try {
    const list = await fetchSettlementLedgers();
    rows.value = list.sort((a, b) => (rowTime(b)?.getTime() ?? 0) - (rowTime(a)?.getTime() ?? 0));
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
    &.today { background: $wa-accent; .v, .l { color: #fff; } }
    .v { font-size: 32rpx; font-weight: 800; color: $wa-ink; &.warn { color: #b45309; } }
    .l { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }
}
.sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin: 8rpx 0 16rpx; }
.empty-inline { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 40rpx 0; }
.empty { text-align: center; color: $wa-muted; padding: 100rpx 24rpx;
  .e1 { display: block; font-size: 30rpx; color: $wa-ink; margin-bottom: 12rpx; }
  .e2 { display: block; font-size: 24rpx; line-height: 1.6; }
}
</style>