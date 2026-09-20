<template>
  <view class="page">
    <view class="kpis" v-if="rows.length">
      <view class="kpi today">
        <text class="v">{{ fmt(stat.todayPaid.amount) }}</text>
        <text class="l">{{ $t('settleLedger.todayLabel').replace('{count}', stat.todayPaid.count) }}</text>
      </view>
      <view class="kpi">
        <text class="v">{{ fmt(stat.paid.amount) }}</text>
        <text class="l">{{ $t('settleLedger.paidLabel').replace('{count}', stat.paid.count) }}</text>
      </view>
      <view class="kpi">
        <text class="v warn">{{ fmt(stat.pending.amount) }}</text>
        <text class="l">{{ $t('settleLedger.pendingLabel').replace('{count}', stat.pending.count) }}</text>
      </view>
    </view>

    <view class="toolbar">
      <view class="seg">
        <text :class="{ on: filter === 'all' }" @tap="filter = 'all'">{{ $t('settleLedger.all') }}</text>
        <text :class="{ on: filter === 'paid' }" @tap="filter = 'paid'">{{ $t('settleLedger.paid') }}</text>
        <text :class="{ on: filter === 'pending' }" @tap="filter = 'pending'">{{ $t('settleLedger.pending') }}</text>
      </view>
      <button class="exp" @tap="onExport">{{ $t('settleLedger.exportCsv') }}</button>
    </view>

    <view class="sec-title" v-if="todayRows.length">{{ $t('settleLedger.todayTitle').replace('{n}', todayRows.length) }}</view>
    <LedgerCard v-for="r in todayRows" :key="'t' + r.id" :row="r" :today="true" />
    <view class="empty-inline" v-if="rows.length && !todayRows.length">
      <text>{{ $t('settleLedger.todayEmpty') }}</text>
    </view>

    <view class="sec-title">{{ $t('settleLedger.ledgerTitle').replace('{n}', filteredRows.length) }}</view>
    <LedgerCard v-for="r in filteredRows" :key="r.id" :row="r" />

    <view v-if="!rows.length" class="empty">
      <text class="e1">{{ $t('settleLedger.emptyTitle') }}</text>
      <text class="e2">{{ $t('settleLedger.emptyDesc') }}</text>
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
  settleMethodLabel,
  SettlementLedgerRow,
} from '../../../apis/settlement';
import { downloadCsv, fmtDateTime } from '../../../utils/csv';
import LedgerCard from './LedgerCard.vue';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const rows = ref<SettlementLedgerRow[]>([]);

const filter = ref<'all' | 'paid' | 'pending'>('all');
const filteredRows = computed(() => {
  if (filter.value === 'paid') return paidRows.value;
  if (filter.value === 'pending') return pendingRows.value;
  return rows.value;
});

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function onExport() {
  const list = filteredRows.value;
  if (!list.length) { uni.showToast({ title: locale.t('settleLedger.noData'), icon: 'none' }); return; }
  const headers = [
    locale.t('settleLedger.time'),
    locale.t('settleLedger.orderNo'),
    locale.t('settleLedger.collector'),
    locale.t('settleLedger.channel'),
    locale.t('settleLedger.method'),
    locale.t('settleLedger.amount'),
    locale.t('settleLedger.status'),
  ];
  const rowsCsv = list.map((r) => {
    const d = rowTime(r);
    const ch = r.collectorChannelId ? locale.t('settleLedger.channelStore').replace('{channel}', r.collectorChannelId) : locale.t('settleLedger.channelOnline');
    return [
      d ? fmtDateTime(d) : '',
      r.orderCode || '',
      r.collectorName || '',
      ch,
      settleMethodLabel(r.settleMethod),
      (r.amount / 100).toFixed(2),
      isPendingSign(r.status) ? locale.t('settleLedger.pending') : locale.t('settleLedger.paid'),
    ];
  });
  const now = new Date();
  const name = `收款台账_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}.csv`;
  downloadCsv(name, headers, rowsCsv);
  uni.showToast({ title: locale.t('settleLedger.exported').replace('{count}', list.length), icon: 'none' });
}

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
    uni.showToast({ title: e?.message || locale.t('settleLedger.loadFailed'), icon: 'none' });
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
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
  .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
    text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 24rpx; border-radius: 999rpx;
      &.on { background: $wa-accent; color: #fff; } } }
  .exp { margin: 0; background: $wa-card; color: $wa-accent; font-size: 26rpx; border: 1rpx solid $wa-accent; border-radius: $wa-radius; }
}
.sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin: 8rpx 0 16rpx; }
.empty-inline { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 40rpx 0; }
.empty { text-align: center; color: $wa-muted; padding: 100rpx 24rpx;
  .e1 { display: block; font-size: 30rpx; color: $wa-ink; margin-bottom: 12rpx; }
  .e2 { display: block; font-size: 24rpx; line-height: 1.6; }
}
</style>