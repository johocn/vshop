<template>
  <view class="page">
    <view v-if="detail" class="head card">
      <view class="row">
        <text class="code">{{ $t('afterSale.detail.afterSalePrefix') }}{{ detail.id }}</text>
        <text class="st" :style="{ color: stColor }">{{ stLabel }}</text>
      </view>
      <text class="sub">{{ $t('afterSale.detail.orderPrefix') }}{{ detail.orderId }}</text>
      <view class="ops" v-if="hasOps">
        <button v-if="can.approve" class="op main" @tap="onApprove">{{ $t('afterSale.detail.approve') }}</button>
        <button v-if="can.reject" class="op" @tap="onReject">{{ $t('afterSale.detail.reject') }}</button>
        <button v-if="can.receive" class="op main" @tap="onReceive">{{ $t('afterSale.detail.receive') }}</button>
        <button v-if="can.refund" class="op main" @tap="onRefund">{{ $t('afterSale.detail.refund') }}</button>
        <button v-if="can.retry" class="op" @tap="onRetry">{{ $t('afterSale.detail.retry') }}</button>
      </view>
    </view>

    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.infoTitle') }}</text>
      <view class="cell"><text>{{ $t('afterSale.detail.type') }}</text><text class="val">{{ AFTER_SALE_TYPES[detail.type] || detail.type }}</text></view>
      <view class="cell"><text>{{ $t('afterSale.detail.status') }}</text><text class="val">{{ stLabel }}</text></view>
      <view class="cell"><text>{{ $t('afterSale.detail.refundAmount') }}</text><text class="val danger">¥ {{ money(detail.refundAmount) }}</text></view>
      <view class="cell" v-if="detail.reason"><text>{{ $t('afterSale.detail.reason') }}</text><text class="val break">{{ detail.reason }}</text></view>
      <view class="cell" v-if="detail.description"><text>{{ $t('afterSale.detail.description') }}</text><text class="val break">{{ detail.description }}</text></view>
      <view class="cell" v-if="detail.rejectReason"><text>{{ $t('afterSale.detail.rejectReason') }}</text><text class="val break">{{ detail.rejectReason }}</text></view>
      <view class="cell" v-if="detail.receivedQuantity != null"><text>{{ $t('afterSale.detail.receivedQuantity') }}</text><text class="val">{{ detail.receivedQuantity }}</text></view>
      <view class="cell" v-if="detail.refundError"><text>{{ $t('afterSale.detail.refundError') }}</text><text class="val break refund-err">{{ detail.refundError }}</text></view>
      <view class="cell" v-if="detail.actualRefundAmount != null"><text>{{ $t('afterSale.detail.actualRefundAmount') }}</text><text class="val">¥ {{ money(detail.actualRefundAmount) }}</text></view>
      <view class="cell" v-if="detail.refundedAt"><text>{{ $t('afterSale.detail.refundedAt') }}</text><text class="val">{{ fmtTime(detail.refundedAt) }}</text></view>
    </view>

    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.orderSection') }}</text>
      <view class="cell"><text>{{ $t('afterSale.detail.orderNo') }}</text><text class="val break">#{{ detail.orderId }}</text></view>
      <view class="cell" v-if="detail.returnTrackingNo || detail.returnCarrier">
        <text>{{ $t('afterSale.detail.returnLogistics') }}</text>
        <text class="val break">{{ detail.returnCarrier || $t('afterSale.detail.express') }} {{ detail.returnTrackingNo }}</text>
      </view>
      <view class="cell"><text>{{ $t('afterSale.detail.createdAt') }}</text><text class="val">{{ fmtTime(detail.createdAt) }}</text></view>
      <view class="cell" v-if="detail.updatedAt"><text>{{ $t('afterSale.detail.updatedAt') }}</text><text class="val">{{ fmtTime(detail.updatedAt) }}</text></view>
    </view>

    <view v-if="loading" class="empty">{{ $t('afterSale.detail.loading') }}</view>
    <view v-else-if="!detail" class="empty">{{ $t('afterSale.detail.notFound') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchAfterSale,
  approveAfterSale,
  rejectAfterSale,
  confirmAfterSaleReceived,
  processAfterSaleRefund,
  retryAfterSaleRefund,
  AfterSaleRow,
} from '../../../apis/afterSale';
import { AFTER_SALE_STATES, AFTER_SALE_TYPES, stateLabel } from '../../../constants/orderState';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const detail = ref<AfterSaleRow | null>(null);
const loading = ref(false);

const money = (n?: number | null): string => ((n ?? 0) / 100).toFixed(2);

const stLabel = computed(() => stateLabel(AFTER_SALE_STATES, detail.value?.state).label);
const stColor = computed(() => stateLabel(AFTER_SALE_STATES, detail.value?.state).color);

const can = computed(() => {
  const s = detail.value?.state || '';
  const t = detail.value?.type;
  return {
    approve: s === 'Pending',
    reject: s === 'Pending',
    receive: s === 'Approved' && t === 'return_refund',
    refund: ['Approved', 'Received'].includes(s),
    retry: s === 'RefundFailed',
  };
});
const hasOps = computed(() => can.value.approve || can.value.reject || can.value.receive || can.value.refund || can.value.retry);

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function refresh() {
  if (!detail.value?.id) return;
  loading.value = true;
  try {
    detail.value = await fetchAfterSale(detail.value.id);
  } finally {
    loading.value = false;
  }
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

async function run(action: () => Promise<AfterSaleRow>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  }
}

function onApprove() {
  uni.showModal({
    title: locale.t('afterSale.detail.approveTitle'),
    content: locale.t('afterSale.detail.approveContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) run(() => approveAfterSale(detail.value!.id), locale.t('afterSale.detail.approved')); },
  });
}

function onReject() {
  uni.showModal({
    title: locale.t('afterSale.detail.rejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: (res) => {
      if (!res.confirm || !detail.value) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      run(() => rejectAfterSale(detail.value!.id, reason), locale.t('afterSale.detail.rejected'));
    },
  });
}

function onReceive() {
  uni.showModal({
    title: locale.t('afterSale.detail.receiveTitle'),
    content: locale.t('afterSale.detail.receiveContent'),
    success: (res) => { if (res.confirm && detail.value) run(() => confirmAfterSaleReceived(detail.value!.id), locale.t('afterSale.detail.received')); },
  });
}

function onRefund() {
  uni.showModal({
    title: locale.t('afterSale.detail.refundTitle'),
    content: locale.t('afterSale.detail.refundContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) run(() => processAfterSaleRefund(detail.value!.id), locale.t('afterSale.detail.refundInitiated')); },
  });
}

function onRetry() {
  uni.showModal({
    title: locale.t('afterSale.detail.retryTitle'),
    content: locale.t('afterSale.detail.retryContent'),
    success: (res) => { if (res.confirm && detail.value) run(() => retryAfterSaleRefund(detail.value!.id), locale.t('afterSale.detail.retryInitiated')); },
  });
}

onLoad(async (q) => {
  const id: string = (q && (q.id as string)) || '';
  loading.value = true;
  try {
    detail.value = await fetchAfterSale(id);
  } finally {
    loading.value = false;
  }
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
    .line { display: block; font-size: 28rpx; color: $wa-ink; line-height: 1.6; word-break: break-all;
      &.muted { color: $wa-muted; }
    }
    .cell {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 28rpx; color: $wa-ink; padding: 10rpx 0;
      .val { color: $wa-ink; text-align: right;
        &.break { flex: 1; margin-left: 24rpx; word-break: break-all; }
        &.danger { color: $wa-danger; font-weight: 600; }
        &.refund-err { color: $wa-danger; }
      }
    }
  }
  .head {
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 34rpx; font-weight: 600; color: $wa-ink; }
      .st { font-size: 24rpx; }
    }
    .sub { display: block; margin-top: 12rpx; font-size: 26rpx; color: $wa-muted; }
    .ops { margin-top: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap;
      .op {
        min-width: 168rpx; margin: 0; padding: 0 24rpx; height: 64rpx; line-height: 64rpx;
        font-size: 28rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>