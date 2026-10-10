<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ locale.t('pointsOrders.' + s.label) }}
      </text>
    </view>

    <view class="card" v-for="o in page.items.value" :key="o.id">
      <view class="row">
        <text class="code">{{ o.code }}</text>
        <text class="tag" :class="'tag--' + o.status">{{ locale.t('pointsOrders.status_' + o.status) }}</text>
      </view>
      <text class="name">{{ snapName(o.productSnapshot) }} × {{ o.quantity }}</text>
      <text class="meta">{{ locale.t('pointsOrders.customer') }} #{{ o.customerId }} · {{ fmtTime(o.createdAt) }}</text>
      <view class="amounts">
        <text class="points">{{ o.pointsTotal }} {{ locale.t('pointsOrders.pointsUnit') }}</text>
        <text v-if="o.cashTotal > 0" class="cash">+ ¥{{ fmtMoney(o.cashTotal) }}</text>
      </view>
      <text v-if="o.trackingNo" class="meta">{{ locale.t('pointsOrders.tracking') }}：{{ o.trackingNo }}</text>
      <text v-if="addrText(o.addressSnapshot)" class="addr">{{ addrText(o.addressSnapshot) }}</text>

      <view class="ops">
        <button v-if="o.status === 'pending_payment'" class="op main" @tap="onMarkPaid(o)">{{ locale.t('pointsOrders.markPaid') }}</button>
        <button v-if="o.status === 'pending_ship'" class="op main" @tap="onMarkShipped(o)">{{ locale.t('pointsOrders.markShip') }}</button>
        <button v-if="o.status === 'shipped'" class="op main" @tap="onMarkCompleted(o)">{{ locale.t('pointsOrders.markComplete') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ locale.t('pointsOrders.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ locale.t('pointsOrders.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">{{ locale.t('pointsOrders.empty') }}</view>

    <view class="empty" v-if="page.loadingMore.value">{{ locale.t('pointsOrders.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ locale.t('pointsOrders.noMore') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fetchPointsOrdersAdmin, markPointsOrderPaid, markPointsOrderShipped, markPointsOrderCompleted, type PointsOrderRow } from '../../../apis/points-mall';

const locale = useLocaleStore();

const tabs = [
  { key: 'all', label: 'tabAll' },
  { key: 'pending_payment', label: 'status_pending_payment' },
  { key: 'pending_ship', label: 'status_pending_ship' },
  { key: 'shipped', label: 'status_shipped' },
  { key: 'completed', label: 'status_completed' },
  { key: 'cancelled', label: 'status_cancelled' },
];
const cur = ref('all');

// 状态 tabs：fetcher 闭包读取 cur，切换 tab 后 refresh 即按新状态拉取
const page = useListPage<PointsOrderRow>({
  take: 20,
  fetcher: ({ skip, take }) => fetchPointsOrdersAdmin({ skip, take, status: cur.value === 'all' ? null : cur.value }),
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void page.refresh();
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** cashTotal 分 → 元 */
function fmtMoney(cents: number): string {
  return (Number(cents || 0) / 100).toFixed(2);
}

function pick(snap: Record<string, any> | null | undefined, keys: string[]): string {
  for (const k of keys) {
    const v = snap?.[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}

function snapName(snap?: Record<string, any> | null): string {
  return pick(snap, ['name', 'productName', 'title']) || '—';
}

function addrText(snap?: Record<string, any> | null): string {
  if (!snap) return '';
  const head = [pick(snap, ['name', 'receiverName', 'consignee']), pick(snap, ['phone', 'mobile', 'tel', 'phoneNumber'])].filter(Boolean).join(' ');
  const address = pick(snap, ['address', 'fullAddress'])
    || [pick(snap, ['province']), pick(snap, ['city']), pick(snap, ['district']), pick(snap, ['detail', 'address1', 'street'])].filter(Boolean).join('');
  return [head, address].filter(Boolean).join(' · ');
}

async function run(fn: () => Promise<unknown>, okMsg: string) {
  try {
    await fn();
    toast(okMsg);
    await page.refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('pointsOrders.opFailed'));
  }
}

function onMarkPaid(o: PointsOrderRow) {
  uni.showModal({
    title: locale.t('pointsOrders.paidTitle'),
    content: locale.t('pointsOrders.paidContent'),
    success: (res) => {
      if (res.confirm) void run(() => markPointsOrderPaid(o.id), locale.t('pointsOrders.paidOk'));
    },
  });
}

function onMarkShipped(o: PointsOrderRow) {
  uni.showModal({
    title: locale.t('pointsOrders.shipTitle'),
    editable: true,
    placeholderText: locale.t('pointsOrders.shipPh'),
    success: (res) => {
      if (!res.confirm) return;
      const trackingNo = (res.content || '').trim();
      void run(() => markPointsOrderShipped(o.id, trackingNo || null), locale.t('pointsOrders.shipOk'));
    },
  });
}

function onMarkCompleted(o: PointsOrderRow) {
  uni.showModal({
    title: locale.t('pointsOrders.doneTitle'),
    content: locale.t('pointsOrders.doneContent'),
    success: (res) => {
      if (res.confirm) void run(() => markPointsOrderCompleted(o.id), locale.t('pointsOrders.doneOk'));
    },
  });
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .tabs { display: flex; flex-wrap: wrap; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; gap: 4rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius; white-space: nowrap;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
    .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag { flex-shrink: 0; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx;
      &.tag--pending_payment { color: #c2410c; background: #ffedd5; }
      &.tag--pending_ship { color: #1d4ed8; background: #dbeafe; }
      &.tag--shipped { color: #0e7490; background: #cffafe; }
      &.tag--completed { color: #15803d; background: #dcfce7; }
      &.tag--cancelled { color: #4b5563; background: #f3f4f6; } }
    .name { font-size: 28rpx; color: $wa-ink; }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .amounts { display: flex; align-items: baseline; gap: 16rpx;
      .points { font-size: 28rpx; color: $wa-accent; font-weight: 600; }
      .cash { font-size: 24rpx; color: $wa-ink; } }
    .addr { font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .ops { display: flex; justify-content: flex-end; gap: 12rpx; margin-top: 4rpx;
      .op { min-width: 160rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
