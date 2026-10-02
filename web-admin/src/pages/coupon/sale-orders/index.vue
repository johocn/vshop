<template>
  <view class="page">
    <view class="chips">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="chip"
        :class="{ on: tab === t.key }"
        @tap="switchTab(t.key)"
      >{{ $t(t.labelKey) }}</text>
    </view>

    <view class="card" v-for="o in items" :key="o.id">
      <view class="top">
        <view class="head">
          <text class="no">#{{ o.id }}</text>
          <text class="badge" :class="o.status.toLowerCase()">{{ statusLabel(o.status) }}</text>
        </view>
        <text class="value">¥{{ money(o.amount) }}</text>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('couponSaleOrders.sourceLabel') }}</text>
            <text class="v">{{ sourceLabel(o) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('couponSaleOrders.payModeLabel') }}</text>
            <text class="v">{{ payModeLabel(o.payMode) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('couponSaleOrders.customerLabel') }}</text>
            <text class="v">{{ $t('couponSaleOrders.customerId').replace('{id}', o.customerId) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('couponSaleOrders.timeLabel') }}</text>
            <text class="v">{{ fmtDT(o.paidAt || o.createdAt) }}</text>
          </view>
        </view>
        <view class="row" v-if="o.orderId">
          <text class="sub">{{ $t('couponSaleOrders.orderRef').replace('{id}', o.orderId) }}</text>
        </view>
      </view>
      <view class="ops" v-if="o.status === 'PAID'">
        <text class="refund" @tap="onRefund(o)">{{ $t('couponSaleOrders.refund') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('couponSaleOrders.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('couponSaleOrders.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('couponSaleOrders.loadingMore') }}</view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  fetchCouponSaleOrders, refundCouponSaleOrder,
  SALE_STATUS_LABELS, SALE_PAY_MODE_LABELS, type CouponSaleOrderRow,
} from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const tabs = [
  { key: '', labelKey: 'couponSaleOrders.tabAll' },
  { key: 'PENDING', labelKey: 'couponSaleOrders.tabPending' },
  { key: 'PAID', labelKey: 'couponSaleOrders.tabPaid' },
  { key: 'REFUNDED', labelKey: 'couponSaleOrders.tabRefunded' },
  { key: 'CANCELLED', labelKey: 'couponSaleOrders.tabCancelled' },
];
const tab = ref('');

const items = ref<CouponSaleOrderRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const money = (cents: number) => (cents / 100).toFixed(2);
const statusLabel = (s: string) => SALE_STATUS_LABELS[s] || s;
const payModeLabel = (m: string) => SALE_PAY_MODE_LABELS[m] || m;

/** 来源：加价购（随主订单）> 券包 > 单券券商城 */
function sourceLabel(o: CouponSaleOrderRow): string {
  if (o.payMode === 'ORDER_SURCHARGE') return locale.t('couponSaleOrders.sourceSurcharge');
  if (o.bundleId) return locale.t('couponSaleOrders.sourceBundle');
  return locale.t('couponSaleOrders.sourceSingle');
}

function fmtDT(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    const res = await fetchCouponSaleOrders({ skip: 0, take: PAGE, status: tab.value });
    items.value = res.items;
    totalItems.value = res.totalItems;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    const res = await fetchCouponSaleOrders({ skip: items.value.length, take: PAGE, status: tab.value });
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } finally {
    loadingMore.value = false;
  }
}

function switchTab(key: string) {
  if (tab.value === key) return;
  tab.value = key;
  items.value = [];
  load();
}

function onRefund(o: CouponSaleOrderRow) {
  uni.showModal({
    title: locale.t('couponSaleOrders.refundTitle'),
    content: locale.t('couponSaleOrders.refundContent').replace('{id}', o.id).replace('{amount}', money(o.amount)),
    editable: true,
    placeholderText: locale.t('couponSaleOrders.refundReasonPh'),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const updated = await refundCouponSaleOrder(o.id, r.content || undefined);
        Object.assign(o, updated);
        uni.showToast({ title: locale.t('couponSaleOrders.refunded'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('couponSaleOrders.refundFailed'), icon: 'none' });
      }
    },
  });
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
    .chip { font-size: 24rpx; color: $wa-ink; background: $wa-card; border: 1rpx solid $wa-rule; border-radius: 999rpx; padding: 8rpx 24rpx;
      &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .head { display: flex; align-items: center;
        .no { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
        .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; background: #8a9099;
          &.paid { background: #0a9c6e; }
          &.pending { background: #f0821f; }
          &.refunded { background: #7c3aed; }
          &.cancelled { background: #bbb; } } }
      .value { font-size: 30rpx; color: $wa-danger; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; } }
    .rows { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink; } }
        .sub { font-size: 22rpx; color: $wa-muted; } } }
    .ops { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule;
      .refund { font-size: 26rpx; color: #e64340; } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>