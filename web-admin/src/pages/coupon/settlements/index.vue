<template>
  <view class="page">
    <view class="chips">
      <text class="chip" :class="{ on: tab === 'diff' }" @tap="switchTab('diff')">{{ $t('couponSettle.tabDiff') }}</text>
      <text class="chip" :class="{ on: tab === 'settle' }" @tap="switchTab('settle')">{{ $t('couponSettle.tabSettle') }}</text>
    </view>

    <!-- 对账差异 tab -->
    <template v-if="tab === 'diff'">
      <view class="toolbar">
        <button class="run" :disabled="running" @tap="onRunReconcile">{{ running ? $t('couponSettle.running') : $t('couponSettle.runNow') }}</button>
        <view class="seg">
          <text :class="{ on: sevFilter === '' }" @tap="switchSev('')">{{ $t('couponSettle.sevAll') }}</text>
          <text :class="{ on: sevFilter === 'HIGH' }" @tap="switchSev('HIGH')">{{ $t('couponSettle.sevHigh') }}</text>
          <text :class="{ on: sevFilter === 'MEDIUM' }" @tap="switchSev('MEDIUM')">{{ $t('couponSettle.sevMedium') }}</text>
          <text :class="{ on: sevFilter === 'LOW' }" @tap="switchSev('LOW')">{{ $t('couponSettle.sevLow') }}</text>
        </view>
      </view>
      <view class="resolved-sw" @tap="toggleResolved">
        <text class="sw-dot" :class="{ on: includeResolved }"></text>
        <text>{{ $t('couponSettle.showResolved') }}</text>
      </view>

      <view class="card diff" v-for="d in diffs" :key="d.id">
        <view class="top">
          <view class="head">
            <text class="badge" :class="d.severity.toLowerCase()">{{ sevLabel(d.severity) }}</text>
            <text class="type">{{ diffLabel(d.diffType) }}</text>
          </view>
          <text class="when">{{ fmtDT(d.createdAt) }}</text>
        </view>
        <view class="rows">
          <view class="kv" v-if="d.settlementNo">
            <text class="k">{{ $t('couponSettle.settleNo') }}</text>
            <text class="v">{{ d.settlementNo }}</text>
          </view>
          <view class="kv" v-if="d.settlementOrderId">
            <text class="k">{{ $t('couponSettle.settleId') }}</text>
            <text class="v">#{{ d.settlementOrderId }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('couponSettle.runId') }}</text>
            <text class="v">{{ d.runId }}</text>
          </view>
        </view>
        <view class="detail" v-if="prettyDetail(d.detail)">{{ prettyDetail(d.detail) }}</view>
        <view class="ops" v-if="!d.resolvedAt">
          <text class="resolve" @tap="onResolve(d)">{{ $t('couponSettle.markResolved') }}</text>
        </view>
        <view class="resolved-tag" v-else>{{ $t('couponSettle.resolved') }}{{ d.remark ? ' · ' + d.remark : '' }}</view>
      </view>
      <view v-if="!diffs.length && !loading" class="empty">{{ $t('couponSettle.diffEmpty') }}</view>
      <view v-if="loading" class="empty">{{ $t('couponSettle.loading') }}</view>
    </template>

    <!-- 结算单 tab -->
    <template v-else>
      <view class="config-bar" :class="splitConfig?.splitMode">
        <text class="ci">{{ $t('couponSettle.cfgMode') }}</text>
        <text class="cv">{{ $t('couponSettle.mode_' + (splitConfig?.splitMode || 'unknown')) }}</text>
        <text class="ci">{{ $t('couponSettle.cfgOnboard') }}</text>
        <text class="cv" :class="{ ok: splitConfig?.onboardingStatus === 'APPROVED' }">{{ $t('couponSettle.ob_' + (splitConfig?.onboardingStatus || 'NONE')) }}</text>
      </view>
      <view class="kpi">
        <view class="k1">
          <view class="kp"><text class="kn">{{ summary?.total ?? '—' }}</text><text class="kl">{{ $t('couponSettle.kpiTotal') }}</text></view>
          <view class="kp"><text class="kn warn">{{ summary?.pending ?? '—' }}</text><text class="kl">{{ $t('couponSettle.kpiPending') }}</text></view>
          <view class="kp"><text class="kn ok">{{ summary?.paidOut ?? '—' }}</text><text class="kl">{{ $t('couponSettle.kpiPaid') }}</text></view>
        </view>
        <view class="k2">
          <view class="kp"><text class="kv2">¥{{ money(summary?.totalNet ?? 0) }}</text><text class="kl">{{ $t('couponSettle.kpiNet') }}</text></view>
          <view class="kp"><text class="kv2">¥{{ money(summary?.totalCommission ?? 0) }}</text><text class="kl">{{ $t('couponSettle.kpiCommission') }}</text></view>
        </view>
      </view>
      <view class="chips sub">
        <text v-for="t in settleTabs" :key="t.key" class="chip" :class="{ on: settleTab === t.key }" @tap="switchSettleTab(t.key)">{{ $t(t.labelKey) }}</text>
      </view>

      <view class="card" v-for="s in settlements" :key="s.id">
        <view class="top">
          <view class="head">
            <text class="no">{{ s.settlementNo }}</text>
            <text class="badge st" :class="s.status.toLowerCase()">{{ settleLabel(s.status) }}</text>
          </view>
          <text class="value">¥{{ money(s.netAmount) }}</text>
        </view>
        <view class="rows">
          <view class="row">
            <view class="kv">
              <text class="k">{{ $t('couponSettle.faceAmount') }}</text>
              <text class="v">{{ money(s.faceAmount) }}</text>
            </view>
            <view class="kv">
              <text class="k">{{ $t('couponSettle.commission') }}</text>
              <text class="v">{{ money(s.commissionAmount) }}（{{ (s.commissionRateBp / 100).toFixed(2) }}%）</text>
            </view>
          </view>
          <view class="row">
            <view class="kv">
              <text class="k">{{ $t('couponSettle.receipt') }}</text>
              <text class="v">{{ s.splitReceiptNo || '—' }}</text>
            </view>
            <view class="kv">
              <text class="k">{{ $t('couponSettle.redeemRef') }}</text>
              <text class="v">{{ s.redeemRef }}</text>
            </view>
          </view>
          <view class="row">
            <view class="kv">
              <text class="k">{{ $t('couponSettle.mode') }}</text>
              <text class="v">{{ s.splitMode || '—' }}<text v-if="s.voucherType" class="vt"> · {{ $t('couponSettle.vt_' + s.voucherType) }}</text></text>
            </view>
            <view class="kv">
              <text class="k">{{ $t('couponSettle.time') }}</text>
              <text class="v">{{ fmtDT(s.paidOutAt || s.settledAt || s.createdAt) }}</text>
            </view>
          </view>
          <view class="row" v-if="s.status === 'REVERSED'">
            <text class="err rev">{{ $t('couponSettle.reversedTag') }}</text>
          </view>
          <view class="row" v-if="s.lastError">
            <text class="err">{{ s.lastError }}</text>
          </view>
        </view>
      </view>
      <view v-if="!settlements.length && !loading" class="empty">{{ $t('couponSettle.settleEmpty') }}</view>
      <view v-if="loading" class="empty">{{ $t('couponSettle.loading') }}</view>
    </template>

    <view style="height: 140rpx" />
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import {
  fetchCouponReconcileDiffs,
  fetchCouponSettlementOrders,
  fetchCouponSettlementSummary,
  fetchCouponSplitConfig,
  resolveCouponReconcileDiff,
  runCouponReconcile,
  RECONCILE_DIFF_LABELS,
  SETTLE_STATUS_LABELS,
  type CouponReconcileDiffRow,
  type CouponSettlementRow,
  type CouponSettlementSummary,
  type CouponSplitConfig,
} from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';
import { fenToYuanFixed } from '../../../utils/money';

const locale = useLocaleStore();

const tab = ref<'diff' | 'settle'>('diff');
const loading = ref(false);
const running = ref(false);
const PAGE = 20;

// ---- 对账差异 ----
const diffs = ref<CouponReconcileDiffRow[]>([]);
const diffTotal = ref(0);
const sevFilter = ref('');
const includeResolved = ref(false);

const sevLabel = (s: string) => locale.t('couponSettle.sev' + s);
const diffLabel = (t: string) => RECONCILE_DIFF_LABELS[t] || t;

function prettyDetail(raw?: string | null): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

async function loadDiffs() {
  loading.value = true;
  try {
    const res = await fetchCouponReconcileDiffs({
      skip: 0,
      take: PAGE,
      severity: sevFilter.value,
      includeResolved: includeResolved.value,
    });
    diffs.value = res.items;
    diffTotal.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponSettle.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function onRunReconcile() {
  if (running.value) return;
  running.value = true;
  try {
    const r = await runCouponReconcile();
    uni.showToast({
      title: locale
        .t('couponSettle.runDone')
        .replace('{checked}', r.checked)
        .replace('{diffs}', r.diffs)
        .replace('{high}', r.high),
      icon: 'none',
    });
    loadDiffs();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponSettle.runFailed'), icon: 'none' });
  } finally {
    running.value = false;
  }
}

function onResolve(d: CouponReconcileDiffRow) {
  uni.showModal({
    title: locale.t('couponSettle.resolveTitle'),
    content: locale.t('couponSettle.resolveContent').replace('{type}', diffLabel(d.diffType)),
    editable: true,
    placeholderText: locale.t('couponSettle.resolvePh'),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await resolveCouponReconcileDiff(d.id, r.content || undefined);
        d.resolvedAt = new Date().toISOString();
        d.remark = r.content || null;
        uni.showToast({ title: locale.t('couponSettle.resolved'), icon: 'none' });
        if (!includeResolved.value) loadDiffs();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('couponSettle.resolveFailed'), icon: 'none' });
      }
    },
  });
}

function switchSev(s: string) {
  if (sevFilter.value === s) return;
  sevFilter.value = s;
  loadDiffs();
}

function toggleResolved() {
  includeResolved.value = !includeResolved.value;
  loadDiffs();
}

// ---- 结算单 ----
const settleTabs = [
  { key: '', labelKey: 'couponSettle.stAll' },
  { key: 'PENDING', labelKey: 'couponSettle.stPending' },
  { key: 'SETTLED', labelKey: 'couponSettle.stSettled' },
  { key: 'PAID_OUT', labelKey: 'couponSettle.stPaidOut' },
];
const settleTab = ref('');
const settlements = ref<CouponSettlementRow[]>([]);
const settleTotal = ref(0);
const summary = ref<CouponSettlementSummary | null>(null);
const splitConfig = ref<CouponSplitConfig | null>(null);

const money = fenToYuanFixed;
const settleLabel = (s: string) => SETTLE_STATUS_LABELS[s] || s;

async function loadSettlements() {
  loading.value = true;
  try {
    const res = await fetchCouponSettlementOrders({ skip: 0, take: PAGE, status: settleTab.value });
    settlements.value = res.items;
    settleTotal.value = res.totalItems;
    // KPI 与分账配置态并行加载（失败静默：不阻断列表）
    fetchCouponSettlementSummary().then(s => (summary.value = s)).catch(() => undefined);
    fetchCouponSplitConfig().then(c => (splitConfig.value = c)).catch(() => undefined);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponSettle.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function switchSettleTab(key: string) {
  if (settleTab.value === key) return;
  settleTab.value = key;
  settlements.value = [];
  loadSettlements();
}

function fmtDT(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function switchTab(t: 'diff' | 'settle') {
  if (tab.value === t) return;
  tab.value = t;
  if (t === 'diff' && !diffs.value.length) loadDiffs();
  if (t === 'settle' && !settlements.value.length) loadSettlements();
}

async function load() {
  if (tab.value === 'diff') await loadDiffs();
  else await loadSettlements();
}

onShow(() => {
  load();
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
onReachBottom(async () => {
  // 简单分页：触底加载下一页（当前 tab）
  if (loading.value) return;
  if (tab.value === 'diff') {
    if (diffs.value.length >= diffTotal.value && diffTotal.value > 0) return;
    loading.value = true;
    try {
      const res = await fetchCouponReconcileDiffs({
        skip: diffs.value.length,
        take: PAGE,
        severity: sevFilter.value,
        includeResolved: includeResolved.value,
      });
      diffTotal.value = res.totalItems;
      diffs.value = diffs.value.concat(res.items);
    } finally {
      loading.value = false;
    }
  } else {
    if (settlements.value.length >= settleTotal.value && settleTotal.value > 0) return;
    loading.value = true;
    try {
      const res = await fetchCouponSettlementOrders({ skip: settlements.value.length, take: PAGE, status: settleTab.value });
      settleTotal.value = res.totalItems;
      settlements.value = settlements.value.concat(res.items);
    } finally {
      loading.value = false;
    }
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .config-bar { display: flex; align-items: center; gap: 12rpx; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 16rpx; border-left: 6rpx solid #f0821f;
    &.stub { border-left-color: #2563eb; }
    &.wechat { border-left-color: #0a9c6e; }
    .ci { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; }
    .cv { font-size: 24rpx; color: $wa-ink; font-weight: 600; margin-right: 8rpx;
      &.ok { color: #0a9c6e; } } }
  .kpi { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .k1, .k2 { display: flex;
      .kp { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4rpx; }
      .kp + .kp { border-left: 1rpx solid $wa-rule; } }
    .k2 { margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid $wa-rule; }
    .kn { font-size: 36rpx; font-weight: 700; color: $wa-ink;
      &.warn { color: #f0821f; }
      &.ok { color: #0a9c6e; } }
    .kv2 { font-size: 28rpx; font-weight: 700; color: $wa-ink; }
    .kl { font-size: 20rpx; color: $wa-muted; } }
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
    &.sub { margin-top: 4rpx; }
    .chip { font-size: 24rpx; color: $wa-ink; background: $wa-card; border: 1rpx solid $wa-rule; border-radius: 999rpx; padding: 8rpx 24rpx;
      &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } } }
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; gap: 16rpx;
    .run { margin: 0; background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius; padding: 0 28rpx; line-height: 64rpx; height: 64rpx;
      &[disabled] { opacity: 0.6; } }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 22rpx; color: $wa-muted; padding: 8rpx 20rpx; border-radius: 999rpx;
        &.on { background: $wa-accent; color: #fff; } } } }
  .resolved-sw { display: flex; align-items: center; gap: 10rpx; font-size: 22rpx; color: $wa-muted; margin-bottom: 20rpx;
    .sw-dot { width: 28rpx; height: 28rpx; border-radius: 8rpx; border: 2rpx solid $wa-rule; background: $wa-card;
      &.on { background: $wa-accent; border-color: $wa-accent; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .head { display: flex; align-items: center; gap: 12rpx;
        .no { font-size: 26rpx; color: $wa-ink; font-weight: 600; word-break: break-all; }
        .type { font-size: 28rpx; color: $wa-ink; font-weight: 700; } }
      .when { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; margin-left: 12rpx; }
      .value { font-size: 30rpx; color: $wa-ink; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; }
      .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; background: #8a9099; flex-shrink: 0;
        &.high { background: #d92d20; }
        &.medium { background: #f0821f; }
        &.low { background: #7c3aed; }
        &.st.paid_out { background: #0a9c6e; }
        &.st.settled { background: #2563eb; }
        &.st.pending { background: #f0821f; }
        &.st.reversed { background: #7c3aed; }
        &.st.cancelled { background: #bbb; } } }
    .rows { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center; margin-right: 12rpx;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink; word-break: break-all;
            .vt { color: $wa-muted; font-size: 22rpx; } } }
        .err { font-size: 22rpx; color: #d92d20; word-break: break-all;
          &.rev { color: #7c3aed; } } } }
    .detail { margin-top: 14rpx; font-size: 22rpx; color: $wa-muted; background: $wa-bg; border-radius: 12rpx; padding: 12rpx 16rpx; word-break: break-all; }
    .ops { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule;
      .resolve { font-size: 26rpx; color: $wa-accent; } }
    .resolved-tag { margin-top: 14rpx; font-size: 22rpx; color: #0a9c6e; } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
