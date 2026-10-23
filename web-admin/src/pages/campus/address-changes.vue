<template>
  <view class="page">
    <!-- KPI：待处理笔数 / 待退顾客 / 待收差额 -->
    <view class="stat">
      <view class="stat-card">
        <text class="num">{{ loaded ? stats.pendingCount : '—' }}</text>
        <text class="lbl">{{ $t('campusAddressChanges.kpi.pending') }}</text>
      </view>
      <view class="stat-card">
        <text class="num refund">{{ loaded ? '¥' + fenToYuanFixed(stats.pendingRefund) : '—' }}</text>
        <text class="lbl">{{ $t('campusAddressChanges.kpi.refund') }}</text>
      </view>
      <view class="stat-card">
        <text class="num collect">{{ loaded ? '¥' + fenToYuanFixed(stats.pendingCollect) : '—' }}</text>
        <text class="lbl">{{ $t('campusAddressChanges.kpi.collect') }}</text>
      </view>
    </view>

    <view class="seg">
      <view class="seg-item" :class="{ on: status === '' }" @tap="switchStatus('')">{{ $t('campusAddressChanges.filter.all') }}</view>
      <view class="seg-item" :class="{ on: status === 'pending' }" @tap="switchStatus('pending')">{{ $t('campusAddressChanges.filter.pending') }}</view>
      <view class="seg-item" :class="{ on: status === 'settled' }" @tap="switchStatus('settled')">{{ $t('campusAddressChanges.filter.settled') }}</view>
    </view>

    <view v-if="!loaded && !err" class="hint">{{ $t('campusAddressChanges.loading') }}</view>
    <view v-else-if="!rows.length && !err" class="hint">{{ $t('campusAddressChanges.empty') }}</view>

    <view v-for="r in rows" :key="r.id" class="row">
      <view class="row-head">
        <view class="head-left">
          <text class="code">{{ r.orderCode }}</text>
          <text class="src" :class="{ admin: r.source === 'admin' }">{{ sourceLabel(r) }}</text>
        </view>
        <text class="badge" :class="badgeOf(r)">{{ statusLabel(r) }}</text>
      </view>
      <view class="addr">
        <view class="addr-line">
          <text class="tag">{{ $t('campusAddressChanges.from') }}</text>
          <text class="addr-text">{{ addrText(r.fromZone, r.fromBuilding, r.fromDetail) }}</text>
        </view>
        <view class="addr-line">
          <text class="tag to">{{ $t('campusAddressChanges.to') }}</text>
          <text class="addr-text">{{ addrText(r.toZone, r.toBuilding, r.toDetail) }}</text>
        </view>
      </view>
      <view class="row-foot">
        <view class="fees">
          <text class="fee">{{ feeLabel(r) }}</text>
          <text class="diff" :class="diffClass(r.diff)">{{ diffLabel(r.diff) }}</text>
        </view>
        <view class="ops">
          <template v-if="r.status === 'pending'">
            <text v-if="r.diff > 0" class="op primary" @tap="settle(r, 'collect')">{{ $t('campusAddressChanges.op.collect') }}</text>
            <text v-if="r.diff < 0" class="op primary" @tap="settle(r, 'refund')">{{ $t('campusAddressChanges.op.refund') }}</text>
            <text class="op" @tap="settle(r, 'waive')">{{ $t('campusAddressChanges.op.waive') }}</text>
          </template>
          <text v-else class="op" @tap="settle(r, 'pending')">{{ $t('campusAddressChanges.op.revert') }}</text>
        </view>
      </view>
      <!-- 结清凭证：补收必填（收款方式/流水号），退款/免收选填 -->
      <view class="note-line" v-if="r.status === 'pending'">
        <input
          class="note-input"
          :value="noteOf[r.id]"
          :placeholder="r.diff > 0 ? $t('campusAddressChanges.collectNotePh') : $t('campusAddressChanges.notePh')"
          @input="(e: any) => (noteOf[r.id] = e.detail.value)"
        />
      </view>
      <text class="settle-info" v-if="r.status === 'settled' && (r.settleNote || r.refundId)">
        <text v-if="r.settleNote">{{ $t('campusAddressChanges.settleNote') }}{{ r.settleNote }}</text>
        <text v-if="r.refundId"> · {{ $t('campusAddressChanges.refundId') }}{{ r.refundId }}</text>
      </text>
      <text class="reason" v-if="r.reason">{{ $t('campusAddressChanges.reason') }}{{ r.reason }}</text>
      <text class="time">{{ $t('campusAddressChanges.createdAt') }}{{ fmtTime(r.createdAt) }}<text v-if="r.settledAt"> · {{ $t('campusAddressChanges.settledAt') }}{{ fmtTime(r.settledAt) }}</text></text>
    </view>

    <view v-if="hasMore" class="more" @tap="loadMore">
      {{ loadingMore ? $t('campusAddressChanges.loadingMore') : $t('campusAddressChanges.loadMore') }}
    </view>

    <text v-if="err" class="err">{{ err }} <text class="retry" @tap="load">{{ $t('campusAddressChanges.retry') }}</text></text>
    <view style="height: 40rpx" />
  </view>
</template>

<script lang="ts" setup>
// 改址台账（运营端）：顾客自助改址产生的运费差额「多退少补」，逐笔结清留痕。
// 口径：diff>0 待收顾客、diff<0 待退顾客；零差额改址在写入时即视为结清（waive）。
import { ref, reactive } from 'vue';
import {
  campusAddressChanges,
  campusAddressChangeStats,
  campusSettleAddressChange,
  type CampusAddressChangeRow,
  type CampusAddressChangeStats,
} from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusConfig');

const locale = useLocaleStore();
const status = ref<'' | 'pending' | 'settled'>('');
const rows = ref<CampusAddressChangeRow[]>([]);
const stats = ref<CampusAddressChangeStats>({ total: 0, pendingCount: 0, pendingCollect: 0, pendingRefund: 0 });
const loaded = ref(false);
const err = ref('');
const busyId = ref('');
const noteOf = reactive<Record<string, string>>({});
const PAGE_SIZE = 20;
const skip = ref(0);
const hasMore = ref(false);
const loadingMore = ref(false);

async function load(): Promise<void> {
  err.value = '';
  skip.value = 0;
  try {
    const [list, s] = await Promise.all([
      campusAddressChanges(status.value || null, 0, PAGE_SIZE),
      campusAddressChangeStats(),
    ]);
    rows.value = list ?? [];
    hasMore.value = (list?.length ?? 0) >= PAGE_SIZE;
    skip.value = rows.value.length;
    stats.value = s;
    loaded.value = true;
  } catch (e: any) {
    console.error('campusAddressChanges failed', e);
    loaded.value = false;
    err.value = graphQlErrorMsg(e, locale.t('campusAddressChanges.loadFailed'));
  }
}

/** 台账分页：每页 20，按 skip 追加 */
async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const list = await campusAddressChanges(status.value || null, skip.value, PAGE_SIZE);
    rows.value = rows.value.concat(list ?? []);
    hasMore.value = (list?.length ?? 0) >= PAGE_SIZE;
    skip.value = rows.value.length;
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('campusAddressChanges.loadFailed')), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function switchStatus(s: '' | 'pending' | 'settled'): void {
  if (status.value === s) return;
  status.value = s;
  load();
}

function addrText(zone: string, building: string, detail: string | null): string {
  return [zone, building, detail].filter((x) => !!x).join(' · ');
}

function feeLabel(r: CampusAddressChangeRow): string {
  return locale
    .t('campusAddressChanges.fee')
    .replace('{old}', '¥' + fenToYuanFixed(r.oldFee))
    .replace('{new}', '¥' + fenToYuanFixed(r.newFee));
}

function diffLabel(diff: number): string {
  if (diff === 0) return locale.t('campusAddressChanges.diff.zero');
  const amount = '¥' + fenToYuanFixed(Math.abs(diff));
  return diff > 0
    ? locale.t('campusAddressChanges.diff.collect').replace('{amount}', amount)
    : locale.t('campusAddressChanges.diff.refund').replace('{amount}', amount);
}

function diffClass(diff: number): string {
  return diff > 0 ? 'collect' : diff < 0 ? 'refund' : '';
}

function sourceLabel(r: CampusAddressChangeRow): string {
  return r.source === 'admin'
    ? locale.t('campusAddressChanges.source.admin')
    : locale.t('campusAddressChanges.source.customer');
}

function badgeOf(r: CampusAddressChangeRow): string {
  if (r.status === 'settled') return 'done';
  return r.diff > 0 ? 'collect' : r.diff < 0 ? 'refund' : 'done';
}

function statusLabel(r: CampusAddressChangeRow): string {
  if (r.status !== 'settled') return locale.t('campusAddressChanges.status.pending');
  const key = r.settleAction === 'collect' ? 'collected' : r.settleAction === 'refund' ? 'refunded' : 'waived';
  return locale.t('campusAddressChanges.status.' + key);
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function settle(r: CampusAddressChangeRow, action: string): Promise<void> {
  if (busyId.value) return;
  const note = (noteOf[r.id] ?? '').trim();
  // 补收必须留凭证（收款方式/流水号），退款/免收选填；与后端 settle 校验一致
  if (action === 'collect' && !note) {
    uni.showToast({ title: locale.t('campusAddressChanges.collectNoteRequired'), icon: 'none' });
    return;
  }
  const confirmText = action === 'collect'
    ? locale.t('campusAddressChanges.confirmCollect').replace('{amount}', '¥' + fenToYuanFixed(Math.abs(r.diff)))
    : action === 'refund'
      ? locale.t('campusAddressChanges.confirmRefund').replace('{amount}', '¥' + fenToYuanFixed(Math.abs(r.diff)))
      : action === 'waive'
        ? locale.t('campusAddressChanges.confirmWaive')
        : locale.t('campusAddressChanges.confirmRevert');
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusAddressChanges.confirmTitle'),
      content: confirmText,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  busyId.value = r.id;
  try {
    const saved = await campusSettleAddressChange(r.id, action, note || null);
    const i = rows.value.findIndex((x) => x.id === r.id);
    if (i >= 0) {
      if (status.value === '' || saved.status === status.value) rows.value.splice(i, 1, saved);
      else rows.value.splice(i, 1);
    }
    delete noteOf[r.id];
    stats.value = await campusAddressChangeStats();
    uni.showToast({ title: locale.t('campusAddressChanges.settled'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('campusAddressChanges.settleFailed')), icon: 'none' });
  } finally {
    busyId.value = '';
  }
}

load();
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 40rpx;
  .stat { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .stat-card { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 28rpx 12rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 36rpx; font-weight: 600; color: $wa-accent;
        &.refund { color: $wa-danger; }
        &.collect { color: #2563eb; } }
      .lbl { font-size: 22rpx; color: $wa-muted; margin-top: 10rpx; text-align: center; } } }
  .seg { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .seg-item { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius; background: $wa-card; font-size: 26rpx; color: $wa-muted;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; } } }
  .hint { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }
  .row { background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 20rpx;
    .row-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
      .head-left { display: flex; align-items: center; gap: 12rpx; }
      .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .src { font-size: 20rpx; color: $wa-muted; background: $wa-bg; border-radius: 6rpx; padding: 2rpx 10rpx;
        &.admin { color: $wa-accent; background: rgba(255, 122, 0, 0.12); } }
      .badge { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; color: $wa-muted; background: $wa-bg;
        &.collect { color: #2563eb; background: rgba(37, 99, 235, 0.1); }
        &.refund { color: $wa-danger; background: rgba(220, 38, 38, 0.1); }
        &.done { color: #16a34a; background: rgba(22, 163, 74, 0.1); } } }
    .addr { display: flex; flex-direction: column; gap: 8rpx; padding: 12rpx 0; border-top: 1rpx solid $wa-rule; border-bottom: 1rpx solid $wa-rule;
      .addr-line { display: flex; align-items: flex-start; gap: 12rpx;
        .tag { flex-shrink: 0; font-size: 22rpx; color: $wa-muted; border: 1rpx solid $wa-rule; border-radius: 6rpx; padding: 2rpx 10rpx;
          &.to { color: $wa-accent; border-color: $wa-accent; } }
        .addr-text { flex: 1; font-size: 26rpx; color: $wa-ink; word-break: break-all; } } }
    .row-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 14rpx;
      .fees { display: flex; flex-direction: column; gap: 4rpx;
        .fee { font-size: 22rpx; color: $wa-muted; }
        .diff { font-size: 26rpx; font-weight: 600; color: $wa-ink;
          &.collect { color: #2563eb; }
          &.refund { color: $wa-danger; } } }
      .ops { display: flex; gap: 16rpx;
        .op { font-size: 24rpx; color: $wa-accent; padding: 8rpx 20rpx; border: 1rpx solid $wa-accent; border-radius: 999rpx;
          &.primary { background: $wa-accent; color: #fff; } } } }
    .reason { display: block; font-size: 22rpx; color: $wa-ink; padding-top: 10rpx; }
    .note-line { padding-top: 12rpx;
      .note-input { font-size: 24rpx; background: $wa-bg; border-radius: 8rpx; padding: 10rpx 14rpx; } }
    .settle-info { display: block; font-size: 22rpx; color: $wa-muted; padding-top: 10rpx; word-break: break-all; }
    .time { display: block; font-size: 22rpx; color: $wa-muted; padding-top: 8rpx; } }
  .more { text-align: center; font-size: 26rpx; color: $wa-accent; padding: 20rpx 0; }
  .err { display: block; text-align: center; color: $wa-danger; font-size: 24rpx; padding: 12rpx 0;
    .retry { color: $wa-accent; margin-left: 12rpx; } }
}
</style>
