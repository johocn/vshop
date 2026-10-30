<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusMerchantAfterSales.loading') }}</view>
    <template v-else>
      <!-- 概览（§81）：待处理数不受分页/筛选影响，供商家一眼看清有多少单等处理 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusMerchantAfterSales.title') }}</text>
          <view class="pill"><text>{{ pillText }}</text></view>
        </view>
        <view class="seg">
          <text class="seg-i" :class="{ on: tab === 'pending' }" @tap="setTab('pending')">
            {{ $t('campusMerchantAfterSales.segPending') }}
          </text>
          <text class="seg-i" :class="{ on: tab === 'done' }" @tap="setTab('done')">
            {{ $t('campusMerchantAfterSales.segDone') }}
          </text>
        </view>
        <text class="tip">{{ $t('campusMerchantAfterSales.tip') }}</text>
      </view>

      <view v-if="!filtered.length" class="hint empty">
        {{ tab === 'pending' ? $t('campusMerchantAfterSales.emptyPending') : $t('campusMerchantAfterSales.emptyDone') }}
      </view>
      <view v-else class="list">
        <view v-for="r in filtered" :key="r.id" class="as">
          <view class="a-head">
            <text class="a-code">{{ r.orderCode }}</text>
            <text class="a-amount">¥{{ fenToYuanFixed(r.refundAmount) }}</text>
            <text class="a-state" :class="stateClass(r.state)">{{ stateText(r.state) }}</text>
          </view>
          <view class="a-sub">
            <text class="a-type">{{ typeText(r.type) }}</text>
            <text class="a-cust">{{ r.customerName || $t('campusMerchantAfterSales.anonCustomer') }}</text>
            <text class="a-time">{{ timeText(r.createdAt) }}</text>
          </view>
          <text class="a-reason">{{ r.reason }}</text>
          <text v-if="r.description" class="a-desc">{{ r.description }}</text>
          <view v-if="r.evidenceImages.length || r.messageCount" class="a-meta">
            <text v-if="r.evidenceImages.length" class="a-meta-i">
              {{ $t('campusMerchantAfterSales.evidence').replace('{n}', String(r.evidenceImages.length)) }}
            </text>
            <text v-if="r.messageCount" class="a-meta-i">
              {{ $t('campusMerchantAfterSales.msgCount').replace('{n}', String(r.messageCount)) }}
            </text>
          </view>
          <text v-if="r.rejectReason" class="a-reject">
            {{ $t('campusMerchantAfterSales.rejectReasonLbl') }}：{{ r.rejectReason }}
          </text>
          <text v-if="r.refundedAt" class="a-refunded">
            {{ $t('campusMerchantAfterSales.refundedTip').replace('{t}', timeText(r.refundedAt)) }}
          </text>
          <view v-if="r.state === 'Pending'" class="a-ops">
            <text class="op-reject" @tap="openReject(r)">{{ $t('campusMerchantAfterSales.btnReject') }}</text>
            <button class="op-approve" :disabled="busyId === r.id" @tap="approve(r)">
              {{ $t('campusMerchantAfterSales.btnApprove') }}
            </button>
          </view>
        </view>
      </view>
    </template>

    <!-- 驳回：理由必填（顾客在 C 端可见，并可据此申诉） -->
    <view v-if="rejectTarget" class="mask" @tap.self="closeReject">
      <view class="sheet">
        <view class="sheet__hd">
          <text class="sheet__t">{{ $t('campusMerchantAfterSales.rejectTitle') }}</text>
          <text class="sheet__x" @tap="closeReject">✕</text>
        </view>
        <text class="sheet__sub">{{ rejectTarget.orderCode }} · ¥{{ fenToYuanFixed(rejectTarget.refundAmount) }}</text>
        <text class="sheet__hint">{{ $t('campusMerchantAfterSales.rejectHint') }}</text>
        <input
          v-model="rejectReason"
          class="sheet__input"
          maxlength="200"
          :placeholder="$t('campusMerchantAfterSales.rejectPh')"
        />
        <view class="sheet__ops">
          <text class="sheet__clear" @tap="closeReject">{{ $t('campusMerchantAfterSales.cancel') }}</text>
          <button class="sheet__save" :disabled="rejectBusy" @tap="submitReject">
            {{ $t('campusMerchantAfterSales.rejectSubmit') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSales,
  campusMerchantAfterSalesApprove,
  campusMerchantAfterSalesReject,
  type MerchantAfterSalesList,
  type MerchantAfterSalesRow,
} from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const loading = ref(true);
/** 待处理 = 后端 state=Pending；已处理 = 全量但剔除 Pending（含已退款/已驳回/退款失败/申诉） */
const tab = ref<'pending' | 'done'>('pending');
const data = ref<MerchantAfterSalesList | null>(null);
const busyId = ref('');
const rejectTarget = ref<MerchantAfterSalesRow | null>(null);
const rejectReason = ref('');
const rejectBusy = ref(false);

const items = computed(() => data.value?.items ?? []);
const filtered = computed(() =>
  tab.value === 'pending' ? items.value.filter(r => r.state === 'Pending') : items.value.filter(r => r.state !== 'Pending'),
);
const pillText = computed(() => {
  const pending = data.value?.pendingCount ?? 0;
  if (!pending) return locale.t('campusMerchantAfterSales.pillNone');
  return locale.t('campusMerchantAfterSales.pillPending').replace('{n}', String(pending));
});

function timeText(raw?: string | null): string {
  const s = formatDateTime(raw);
  return s ? s.slice(6) : '';
}

function stateText(state: string): string {
  const map: Record<string, string> = {
    Pending: locale.t('campusMerchantAfterSales.stPending'),
    Refunded: locale.t('campusMerchantAfterSales.stRefunded'),
    Rejected: locale.t('campusMerchantAfterSales.stRejected'),
    RefundFailed: locale.t('campusMerchantAfterSales.stFailed'),
    Appealed: locale.t('campusMerchantAfterSales.stAppealed'),
    Closed: locale.t('campusMerchantAfterSales.stClosed'),
    Received: locale.t('campusMerchantAfterSales.stReceived'),
    Approved: locale.t('campusMerchantAfterSales.stApproved'),
  };
  return map[state] ?? state;
}

function stateClass(state: string): string {
  if (state === 'Pending') return 'wait';
  if (state === 'RefundFailed') return 'bad';
  if (state === 'Refunded') return 'ok';
  return 'mute';
}

function typeText(type: string): string {
  const map: Record<string, string> = {
    refund_only: locale.t('campusMerchantAfterSales.typeRefundOnly'),
    return_refund: locale.t('campusMerchantAfterSales.typeReturn'),
    exchange: locale.t('campusMerchantAfterSales.typeExchange'),
  };
  return map[type] ?? type;
}

async function reload(): Promise<void> {
  const initial = !data.value;
  if (initial) loading.value = true;
  try {
    data.value = await campusMerchantAfterSales(null);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function setTab(next: 'pending' | 'done'): void {
  tab.value = next;
}

/** 同意：仅退款单由后端链式退款到账，前端只需确认一次（金额写进弹窗避免误点） */
function approve(r: MerchantAfterSalesRow): void {
  uni.showModal({
    title: locale.t('campusMerchantAfterSales.approveTitle'),
    content: locale.t('campusMerchantAfterSales.approveBody')
      .replace('{code}', r.orderCode)
      .replace('{amount}', fenToYuanFixed(r.refundAmount)),
    confirmText: locale.t('campusMerchantAfterSales.btnApprove'),
    cancelText: locale.t('campusMerchantAfterSales.cancel'),
    success: async res => {
      if (!res.confirm) return;
      busyId.value = r.id;
      try {
        const updated = await campusMerchantAfterSalesApprove(r.id);
        uni.showToast({
          title: updated.state === 'Refunded'
            ? locale.t('campusMerchantAfterSales.toastApproved')
            : locale.t('campusMerchantAfterSales.toastApprovePending'),
          icon: 'none',
        });
        await reload();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.approveFailed')), icon: 'none' });
      } finally {
        busyId.value = '';
      }
    },
  });
}

function openReject(r: MerchantAfterSalesRow): void {
  rejectTarget.value = r;
  rejectReason.value = '';
}

function closeReject(): void {
  if (rejectBusy.value) return;
  rejectTarget.value = null;
  rejectReason.value = '';
}

async function submitReject(): Promise<void> {
  const target = rejectTarget.value;
  if (!target) return;
  const reason = rejectReason.value.trim();
  if (!reason) {
    uni.showToast({ title: locale.t('campusMerchantAfterSales.rejectRequired'), icon: 'none' });
    return;
  }
  rejectBusy.value = true;
  try {
    await campusMerchantAfterSalesReject(target.id, reason);
    uni.showToast({ title: locale.t('campusMerchantAfterSales.toastRejected'), icon: 'none' });
    rejectTarget.value = null;
    rejectReason.value = '';
    await reload();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.rejectFailed')), icon: 'none' });
  } finally {
    rejectBusy.value = false;
  }
}

onMounted(() => {
  void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .hint.empty { padding: 60rpx 32rpx; line-height: 1.6; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
    }
    .pill { padding: 8rpx 24rpx; border-radius: 999rpx; background: $wa-rule;
      text { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
    }
    .seg { display: flex; gap: 12rpx; margin: 20rpx 0 8rpx;
      .seg-i { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
        padding: 12rpx 0; border-radius: $wa-radius; background: $wa-bg;
        &.on { background: $wa-accent; color: #fff; font-weight: 600; }
      }
    }
    .tip { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
  }
  .list { display: flex; flex-direction: column; gap: 16rpx;
    .as { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 12rpx;
      .a-head { display: flex; align-items: center; gap: 12rpx;
        .a-code { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .a-amount { font-size: 30rpx; color: #d4380d; font-weight: 700; }
        .a-state { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
          &.wait { color: #fa8c16; background: #fff7e6; }
          &.bad { color: #d4380d; background: #fdecec; }
          &.ok { color: #237804; background: #f6ffed; }
          &.mute { color: #8c8c8c; background: $wa-rule; }
        }
      }
      .a-sub { display: flex; align-items: center; gap: 12rpx;
        .a-type { font-size: 22rpx; color: #1677ff; background: #eaf3ff;
          border-radius: 999rpx; padding: 4rpx 16rpx; }
        .a-cust { flex: 1; font-size: 24rpx; color: $wa-muted; }
        .a-time { font-size: 22rpx; color: $wa-muted; }
      }
      .a-reason { font-size: 26rpx; color: $wa-ink; line-height: 1.5; }
      .a-desc { font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
      .a-meta { display: flex; gap: 16rpx;
        .a-meta-i { font-size: 22rpx; color: $wa-muted; }
      }
      .a-reject { font-size: 24rpx; color: #d4380d; line-height: 1.5; }
      .a-refunded { font-size: 22rpx; color: #237804; }
      .a-ops { display: flex; align-items: center; gap: 20rpx; margin-top: 4rpx;
        .op-reject { flex: none; font-size: 26rpx; color: $wa-muted;
          border: 1.5px solid $wa-rule; border-radius: 999rpx; padding: 10rpx 32rpx; }
        .op-approve { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; background: $wa-accent;
          color: #fff; font-size: 26rpx; border-radius: 999rpx; border: none;
          &[disabled] { opacity: .6; }
        }
      }
    }
  }
}
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
  display: flex; align-items: flex-end; }
.sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx;
  box-sizing: border-box;
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__sub { display: block; font-size: 26rpx; color: $wa-ink; margin-bottom: 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__input { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx;
    font-size: 28rpx; box-sizing: border-box; }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 24rpx; }
  &__clear { flex: none; font-size: 24rpx; color: $wa-muted; padding: 12rpx 8rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
    &[disabled] { opacity: .6; }
  }
}
</style>
