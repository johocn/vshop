<template>
  <view class="page">
    <view v-if="detail" class="head card">
      <view class="row">
        <text class="code">售后 #{{ detail.id }}</text>
        <text class="st" :style="{ color: stColor }">{{ stLabel }}</text>
      </view>
      <text class="sub">订单 #{{ detail.orderId }}</text>
      <view class="ops" v-if="hasOps">
        <button v-if="can.approve" class="op main" @tap="onApprove">同意</button>
        <button v-if="can.reject" class="op" @tap="onReject">拒绝</button>
        <button v-if="can.receive" class="op main" @tap="onReceive">确认收货退款</button>
        <button v-if="can.refund" class="op main" @tap="onRefund">执行退款</button>
        <button v-if="can.retry" class="op" @tap="onRetry">重试退款</button>
      </view>
    </view>

    <view class="card" v-if="detail">
      <text class="sec-title">售后信息</text>
      <view class="cell"><text>类型</text><text class="val">{{ AFTER_SALE_TYPES[detail.type] || detail.type }}</text></view>
      <view class="cell"><text>状态</text><text class="val">{{ stLabel }}</text></view>
      <view class="cell"><text>退款金额</text><text class="val danger">¥ {{ money(detail.refundAmount) }}</text></view>
      <view class="cell" v-if="detail.reason"><text>原因</text><text class="val break">{{ detail.reason }}</text></view>
      <view class="cell" v-if="detail.description"><text>说明</text><text class="val break">{{ detail.description }}</text></view>
      <view class="cell" v-if="detail.rejectReason"><text>拒绝原因</text><text class="val break">{{ detail.rejectReason }}</text></view>
      <view class="cell" v-if="detail.receivedQuantity != null"><text>实收数量</text><text class="val">{{ detail.receivedQuantity }}</text></view>
      <view class="cell" v-if="detail.refundError"><text>退款错误</text><text class="val break refund-err">{{ detail.refundError }}</text></view>
      <view class="cell" v-if="detail.actualRefundAmount != null"><text>实退金额</text><text class="val">¥ {{ money(detail.actualRefundAmount) }}</text></view>
      <view class="cell" v-if="detail.refundedAt"><text>退款时间</text><text class="val">{{ fmtTime(detail.refundedAt) }}</text></view>
    </view>

    <view class="card" v-if="detail">
      <text class="sec-title">订单 / 物流 / 时间</text>
      <view class="cell"><text>订单号</text><text class="val break">#{{ detail.orderId }}</text></view>
      <view class="cell" v-if="detail.returnTrackingNo || detail.returnCarrier">
        <text>退货物流</text>
        <text class="val break">{{ detail.returnCarrier || '快递' }} {{ detail.returnTrackingNo }}</text>
      </view>
      <view class="cell"><text>申请时间</text><text class="val">{{ fmtTime(detail.createdAt) }}</text></view>
      <view class="cell" v-if="detail.updatedAt"><text>更新时间</text><text class="val">{{ fmtTime(detail.updatedAt) }}</text></view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="!detail" class="empty">未找到该售后工单</view>
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
    toast(e?.message || '操作失败');
  }
}

function onApprove() {
  uni.showModal({
    title: '同意售后',
    content: `确认同意该售后申请并退款 ¥${money(detail.value?.refundAmount)} 吗？`,
    success: (res) => { if (res.confirm && detail.value) run(() => approveAfterSale(detail.value!.id), '已同意'); },
  });
}

function onReject() {
  uni.showModal({
    title: '拒绝售后',
    editable: true,
    placeholderText: '请输入拒绝原因',
    success: (res) => {
      if (!res.confirm || !detail.value) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast('请输入拒绝原因'); return; }
      run(() => rejectAfterSale(detail.value!.id, reason), '已拒绝');
    },
  });
}

function onReceive() {
  uni.showModal({
    title: '确认收货退款',
    content: '确认已收到退货，将回补库存并进入退款流程？',
    success: (res) => { if (res.confirm && detail.value) run(() => confirmAfterSaleReceived(detail.value!.id), '已确认收货'); },
  });
}

function onRefund() {
  uni.showModal({
    title: '执行退款',
    content: `确认执行退款 ¥${money(detail.value?.refundAmount)} 吗？`,
    success: (res) => { if (res.confirm && detail.value) run(() => processAfterSaleRefund(detail.value!.id), '退款已发起'); },
  });
}

function onRetry() {
  uni.showModal({
    title: '重试退款',
    content: '确认重试退款吗？',
    success: (res) => { if (res.confirm && detail.value) run(() => retryAfterSaleRefund(detail.value!.id), '重试已发起'); },
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