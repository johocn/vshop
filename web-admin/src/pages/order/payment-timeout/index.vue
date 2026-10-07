<template>
  <view class="page">
    <view class="kpis">
      <view class="kpi">
        <text class="n">{{ stats.todayRemind }}</text>
        <text class="l">{{ $t('ptStats.todayRemind') }}</text>
      </view>
      <view class="kpi">
        <text class="n">{{ stats.todayCancel }}</text>
        <text class="l">{{ $t('ptStats.todayCancel') }}</text>
      </view>
      <view class="kpi" :class="{ warn: stats.totalFailed > 0 }">
        <text class="n">{{ stats.totalFailed }}</text>
        <text class="l">{{ $t('ptStats.totalFailed') }}</text>
      </view>
      <view class="kpi" :class="{ warn: stats.pendingOverdue > 0 }">
        <text class="n">{{ stats.pendingOverdue }}</text>
        <text class="l">{{ $t('ptStats.pendingOverdue') }}</text>
      </view>
    </view>

    <view class="filters">
      <picker :range="statusLabels" @change="(e: any) => onStatusPick(Number(e.detail.value))">
        <view class="chip">{{ statusLabel(fStatus) }} ▾</view>
      </picker>
      <picker :range="typeLabels" @change="(e: any) => onTypePick(Number(e.detail.value))">
        <view class="chip">{{ typeLabel(fType) }} ▾</view>
      </picker>
      <view class="chip" :class="{ on: fToday }" @tap="toggleToday">{{ $t('ptFilter.today') }}</view>
      <view class="btn" @tap="onCompensate">{{ $t('ptFilter.compensate') }}</view>
    </view>

    <view class="table">
      <view class="row thead">
        <text class="c1">{{ $t('ptTable.order') }}</text>
        <text class="c2">{{ $t('ptTable.type') }}</text>
        <text class="c3">{{ $t('ptTable.status') }}</text>
        <text class="c4">{{ $t('ptTable.dueAt') }}</text>
        <text class="c5">{{ $t('ptTable.action') }}</text>
      </view>
      <view v-for="r in items" :key="r.id" class="row" :class="{ failed: r.status === 'FAILED' }">
        <text class="c1 link" @tap="goOrder(r)">{{ r.orderCode || ('#' + r.orderId) }}</text>
        <text class="c2">{{ typeLabel(r.type) }}</text>
        <text class="c3">
          <text class="pill" :class="r.status.toLowerCase()">
            {{ statusLabel(r.status) }}<template v-if="r.status === 'FAILED'"> · {{ r.retryCount }}/3</template>
          </text>
        </text>
        <text class="c4">{{ dueText(r) }}</text>
        <text class="c5 link" v-if="r.status === 'PENDING'" @tap="onExecute(r)">{{ $t('ptAction.execute') }}</text>
        <text class="c5 link" v-else-if="r.status === 'FAILED'" @tap="onExecute(r)">{{ $t('ptAction.retry') }}</text>
        <text class="c5 link" v-else-if="r.type === 'REMIND' && r.status === 'EXECUTED'" @tap="onResend(r)">{{ $t('ptAction.resend') }}</text>
        <text class="c5" v-else>—</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('ptTable.empty') }}</view>

    <view class="pager" v-if="total > items.length">
      <text class="link" v-if="skip > 0" @tap="prev">{{ $t('ptTable.prev') }}</text>
      <text class="link" @tap="next">{{ $t('ptTable.next') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import {
  executePaymentTimeoutTask, fetchPaymentTimeoutStats, fetchPaymentTimeoutTasks,
  resendPaymentTimeoutRemind, runPaymentTimeoutCompensation,
  PaymentTimeoutStats, PaymentTimeoutTaskRow,
} from '../../../apis/paymentTimeout';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const t = useLocaleStore().t;

const stats = ref<PaymentTimeoutStats>({ todayRemind: 0, todayCancel: 0, totalFailed: 0, pendingOverdue: 0 });
const items = ref<PaymentTimeoutTaskRow[]>([]);
const total = ref(0);
const skip = ref(0);
const take = 20;
const loading = ref(false);
const fStatus = ref('');
const fType = ref('');
const fToday = ref(false);

const statusOptions = [
  { value: '', label: t('ptStatus.all') }, { value: 'PENDING', label: t('ptStatus.pending') },
  { value: 'EXECUTED', label: t('ptStatus.executed') }, { value: 'CANCELLED', label: t('ptStatus.cancelled') },
  { value: 'FAILED', label: t('ptStatus.failed') },
];
const typeOptions = [
  { value: '', label: t('ptType.all') }, { value: 'REMIND', label: t('ptType.remind') }, { value: 'CANCEL', label: t('ptType.cancel') },
];
const statusLabels = statusOptions.map((s) => s.label);
const typeLabels = typeOptions.map((s) => s.label);
const statusLabel = (v: string) => statusOptions.find((s) => s.value === v)?.label ?? v;
const typeLabel = (v: string) => typeOptions.find((s) => s.value === v)?.label ?? v;

// PENDING 显示剩余分钟倒计时 / 已逾期；终态显示到期时间
function dueText(r: PaymentTimeoutTaskRow): string {
  const due = new Date(r.dueAt);
  if (r.status !== 'PENDING') return due.toLocaleString();
  const diff = due.getTime() - Date.now();
  return diff > 0 ? `${t('ptTable.leftIn')} ${Math.ceil(diff / 60000)} ${t('ptTable.min')}` : t('ptTable.overdue');
}

const goOrder = (r: PaymentTimeoutTaskRow) => uni.navigateTo({ url: `/pages/order/detail/index?id=${r.orderId}` });

async function reload() {
  loading.value = true;
  try {
    let from: string | undefined;
    let to: string | undefined;
    if (fToday.value) {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      from = s.toISOString();
      to = new Date().toISOString();
    }
    const [list, st] = await Promise.all([
      fetchPaymentTimeoutTasks({ status: fStatus.value || undefined, type: fType.value || undefined, from, to, skip: skip.value, take }),
      fetchPaymentTimeoutStats(),
    ]);
    items.value = list.items;
    total.value = list.total;
    stats.value = st;
  } catch (e) {
    uni.showToast({ title: graphQlErrorMsg(e), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

const next = () => { skip.value += take; reload(); };
const prev = () => { skip.value = Math.max(0, skip.value - take); reload(); };
const toggleToday = () => { fToday.value = !fToday.value; skip.value = 0; reload(); };
const onStatusPick = (i: number) => { fStatus.value = statusOptions[i]?.value ?? ''; skip.value = 0; reload(); };
const onTypePick = (i: number) => { fType.value = typeOptions[i]?.value ?? ''; skip.value = 0; reload(); };

// 确认弹层 → 成功才 reload；失败 toast 不刷新
const confirmThen = (msg: string, fn: () => Promise<any>) => uni.showModal({
  title: t('ptConfirm.title'),
  content: msg,
  success: (m) => {
    if (!m.confirm) return;
    fn().then(reload).catch((e: any) => uni.showToast({ title: graphQlErrorMsg(e), icon: 'none' }));
  },
});

const onExecute = (r: PaymentTimeoutTaskRow) => confirmThen(t('ptConfirm.execute'), () => executePaymentTimeoutTask(r.id));
const onResend = (r: PaymentTimeoutTaskRow) => confirmThen(t('ptConfirm.resend'), () => resendPaymentTimeoutRemind(r.id));
const onCompensate = () => confirmThen(t('ptConfirm.compensate'), async () => {
  const n = await runPaymentTimeoutCompensation();
  uni.showToast({ title: t('ptToast.compensated').replace('{n}', String(n)), icon: 'none' });
});

onMounted(reload);
onPullDownRefresh(async () => { await reload(); uni.stopPullDownRefresh(); });
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 120rpx;

  .kpis {
    display: flex;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 24rpx 0;
    margin-bottom: 24rpx;

    .kpi {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;

      .n { font-size: 40rpx; color: $wa-ink; font-weight: 700; }
      .l { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }

      &.warn .n { color: $wa-danger; }
    }
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 24rpx;

    picker { margin: 0 16rpx 16rpx 0; }

    .chip {
      font-size: 24rpx;
      color: $wa-ink;
      background: $wa-card;
      border: 1rpx solid #e8edf5;
      border-radius: 999rpx;
      padding: 10rpx 26rpx;

      &.on { color: $wa-accent; border-color: $wa-accent; }
    }

    .btn {
      margin-left: auto;
      background: $wa-accent;
      color: #fff;
      font-size: 24rpx;
      border-radius: 999rpx;
      padding: 12rpx 30rpx;
    }
  }

  .table {
    background: $wa-card;
    border-radius: $wa-radius;
    overflow: hidden;

    .row {
      display: flex;
      align-items: center;
      padding: 22rpx 24rpx;
      border-top: 1rpx solid $wa-rule;

      &.thead {
        border-top: none;
        background: #fafbfc;
        font-size: 22rpx;
        color: $wa-muted;
      }

      &.failed .c1 { color: $wa-danger; }
    }

    .c1 { flex: 1.6; font-size: 26rpx; color: $wa-ink; }
    .c2 { flex: 0.8; font-size: 24rpx; color: $wa-ink; }
    .c3 { flex: 1.3; }
    .c4 { flex: 1.4; font-size: 22rpx; color: $wa-muted; }
    .c5 { flex: 0.9; font-size: 24rpx; text-align: right; color: $wa-muted; }

    .link { color: $wa-accent; }

    .pill {
      display: inline-block;
      font-size: 20rpx;
      color: #fff;
      border-radius: 16rpx;
      padding: 4rpx 14rpx;

      &.pending { background: #bbb; }
      &.executed { background: $wa-success; }
      &.failed { background: $wa-danger; }
      &.cancelled { background: $wa-muted; }
    }
  }

  .empty {
    text-align: center;
    color: $wa-muted;
    font-size: 28rpx;
    padding: 80rpx 0;
  }

  .pager {
    display: flex;
    justify-content: center;
    padding: 24rpx 0;

    .link { margin: 0 28rpx; font-size: 26rpx; }
  }
}
</style>
