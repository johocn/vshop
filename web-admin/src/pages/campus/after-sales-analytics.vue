<template>
  <view class="page">
    <!-- 时间区间 + 导出（§104） -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesAnalytics.rangeTitle') }}</text>
        <text class="act" :class="{ busy: exporting }" @tap="openExport">
          {{ exporting ? $t('campusAfterSalesAnalytics.exporting') : $t('campusAfterSalesAnalytics.export') }}
        </text>
      </view>
      <view class="seg">
        <text class="seg-i" :class="{ on: range === 'today' }" @tap="setRange('today')">
          {{ $t('campusAfterSalesAnalytics.rangeToday') }}
        </text>
        <text class="seg-i" :class="{ on: range === 'last7' }" @tap="setRange('last7')">
          {{ $t('campusAfterSalesAnalytics.range7d') }}
        </text>
        <text class="seg-i" :class="{ on: range === 'last30' }" @tap="setRange('last30')">
          {{ $t('campusAfterSalesAnalytics.range30d') }}
        </text>
        <text class="seg-i" :class="{ on: range === 'custom' }" @tap="setRange('custom')">
          {{ $t('campusAfterSalesAnalytics.rangeCustom') }}
        </text>
      </view>
      <view v-if="range === 'custom'" class="range-row">
        <picker mode="date" :value="fromDate || todayKey" :end="toDate || todayKey" @change="onPickFrom">
          <view class="ipt picker" :class="{ picked: !!fromDate }">
            {{ fromDate || $t('campusAfterSalesAnalytics.fromPh') }}
          </view>
        </picker>
        <text class="range-sep">~</text>
        <picker mode="date" :value="toDate || fromDate || todayKey" :start="fromDate" :end="todayKey" @change="onPickTo">
          <view class="ipt picker" :class="{ picked: !!toDate }">
            {{ toDate || $t('campusAfterSalesAnalytics.toPh') }}
          </view>
        </picker>
      </view>
      <text class="tip">{{ $t('campusAfterSalesAnalytics.rangeTip') }}</text>
    </view>

    <view v-if="loading" class="hint">{{ $t('campusAfterSalesAnalytics.loading') }}</view>
    <view v-else-if="loadError" class="hint empty">{{ loadError }}</view>
    <template v-else>
      <!-- 当前态势（实时，不受区间影响） -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.liveTitle') }}</text>
          <text class="sub">{{ $t('campusAfterSalesAnalytics.liveSub') }}</text>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="k-n">{{ stats.pending }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.livePending') }}</text>
          </view>
          <view class="kpi">
            <text class="k-n warn">{{ stats.dueSoon }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.liveDueSoon') }}</text>
          </view>
          <view class="kpi">
            <text class="k-n danger">{{ stats.overdue }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.liveOverdue') }}</text>
          </view>
          <view class="kpi">
            <text class="k-n">{{ stats.pendingReply }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.livePendingReply') }}</text>
          </view>
        </view>
        <text class="tip">
          {{ $t('campusAfterSalesAnalytics.liveToday')
            .replace('{handled}', String(stats.todayHandled))
            .replace('{refunded}', String(stats.todayRefunded))
            .replace('{amount}', fenToYuanFixed(stats.todayRefundAmount)) }}
        </text>
      </view>

      <!-- 区间概览 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.overviewTitle') }}</text>
          <view class="pill"><text>{{ rangeLabel }}</text></view>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="k-n">{{ report.total }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.ovTotal') }}</text>
            <text class="k-d" :class="deltaClass(report.total, report.previousTotal)">
              {{ deltaText(report.total, report.previousTotal) }}
            </text>
          </view>
          <view class="kpi">
            <text class="k-n">{{ report.refunded }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.ovRefunded') }}</text>
            <text class="k-d" :class="deltaClass(report.refunded, report.previousRefunded)">
              {{ deltaText(report.refunded, report.previousRefunded) }}
            </text>
          </view>
          <view class="kpi">
            <text class="k-n">¥{{ fenToYuanFixed(report.refundAmount) }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.ovRefundAmount') }}</text>
            <text class="k-d" :class="deltaClass(report.refundAmount, report.previousRefundAmount)">
              {{ deltaText(report.refundAmount, report.previousRefundAmount) }}
            </text>
          </view>
          <view class="kpi">
            <text class="k-n danger">{{ report.overdue }}</text>
            <text class="k-l">{{ $t('campusAfterSalesAnalytics.ovOverdue') }}</text>
            <text class="k-d" :class="deltaClass(report.overdue, report.previousOverdue)">
              {{ deltaText(report.overdue, report.previousOverdue) }}
            </text>
          </view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.overviewTip') }}</text>
      </view>

      <!-- 响应与解决时效 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.slaTitle') }}</text>
        </view>
        <view class="kvs">
          <view class="kv">
            <text class="k">{{ $t('campusAfterSalesAnalytics.slaFirstAvg') }}</text>
            <text class="v">{{ minutesText(report.firstResponseAvgMinutes) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('campusAfterSalesAnalytics.slaFirstMax') }}</text>
            <text class="v">{{ minutesText(report.firstResponseMaxMinutes) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('campusAfterSalesAnalytics.slaResolveAvg') }}</text>
            <text class="v">{{ minutesText(report.resolveAvgMinutes) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('campusAfterSalesAnalytics.slaResolveMax') }}</text>
            <text class="v">{{ minutesText(report.resolveMaxMinutes) }}</text>
          </view>
        </view>
        <view class="chips">
          <text class="chip" :class="{ ok: report.firstResponseOnTargetRate >= 0.9 }">
            {{ $t('campusAfterSalesAnalytics.slaFirstRate')
              .replace('{v}', rateText(report.firstResponseOnTargetRate)) }}
          </text>
          <text class="chip" :class="{ ok: report.resolveOnTargetRate >= 0.9 }">
            {{ $t('campusAfterSalesAnalytics.slaResolveRate')
              .replace('{v}', rateText(report.resolveOnTargetRate)) }}
          </text>
          <text class="chip bad">
            {{ $t('campusAfterSalesAnalytics.slaFirstOverdue').replace('{n}', String(report.firstResponseOverdue)) }}
          </text>
          <text class="chip bad">
            {{ $t('campusAfterSalesAnalytics.slaResolveOverdue').replace('{n}', String(report.resolveOverdue)) }}
          </text>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.slaTip') }}</text>
      </view>

      <!-- 按天趋势 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.trendTitle') }}</text>
        </view>
        <view v-if="!report.byDay.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.trendEmpty') }}</view>
        <view v-for="d in trendRows" :key="d.date" class="trend">
          <text class="t-date">{{ d.date.slice(5) }}</text>
          <view class="t-bar">
            <view class="t-fill" :style="{ width: d.w + '%' }"></view>
          </view>
          <text class="t-val">{{ d.count }}</text>
          <text class="t-refund">¥{{ fenToYuanFixed(d.refundAmount) }}</text>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.trendTip') }}</text>
      </view>

      <!-- 类型 / 状态分布 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.distTitle') }}</text>
        </view>
        <text class="sheet__lbl">{{ $t('campusAfterSalesAnalytics.distType') }}</text>
        <view class="chips">
          <text v-for="t in report.byType" :key="t.type" class="chip">
            {{ typeText(t.type) }} {{ t.count }}
          </text>
          <text v-if="!report.byType.length" class="chip muted">{{ $t('campusAfterSalesAnalytics.none') }}</text>
        </view>
        <text class="sheet__lbl">{{ $t('campusAfterSalesAnalytics.distState') }}</text>
        <view class="chips">
          <text v-for="s in report.byState" :key="s.state" class="chip">
            {{ stateText(s.state) }} {{ s.count }}
          </text>
          <text v-if="!report.byState.length" class="chip muted">{{ $t('campusAfterSalesAnalytics.none') }}</text>
        </view>
      </view>

      <!-- 原因分布 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.reasonTitle') }}</text>
        </view>
        <view v-if="!reasons.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.reasonEmpty') }}</view>
        <view v-for="r in reasons" :key="r.reason" class="reason">
          <view class="r-head">
            <text class="r-name">{{ r.reason }}</text>
            <text class="r-share">{{ rateText(r.share) }}</text>
          </view>
          <view class="r-bar">
            <view class="r-fill" :style="{ width: (r.share * 100).toFixed(1) + '%' }"></view>
          </view>
          <view class="r-meta">
            <text class="r-m">{{ $t('campusAfterSalesAnalytics.reasonReq').replace('{n}', String(r.requestCount)) }}</text>
            <text class="r-m">{{ $t('campusAfterSalesAnalytics.reasonRefund').replace('{n}', String(r.refundCount)) }}</text>
            <text class="r-amt">¥{{ fenToYuanFixed(r.refundAmount) }}</text>
            <text v-if="r.changeRate !== null" class="r-chg" :class="{ up: r.changeRate > 0 }">
              {{ r.changeRate > 0 ? '+' : '' }}{{ (r.changeRate * 100).toFixed(1) }}%
            </text>
          </view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.reasonTip') }}</text>
      </view>

      <!-- 商品退款 Top -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.productTitle') }}</text>
        </view>
        <view v-if="!products.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.productEmpty') }}</view>
        <view v-for="(p, i) in products" :key="p.productId" class="prod">
          <text class="p-rank" :class="{ top: i < 3 }">{{ i + 1 }}</text>
          <view class="p-main">
            <text class="p-name">{{ p.productName }}</text>
            <text class="p-meta">
              {{ $t('campusAfterSalesAnalytics.productMeta')
                .replace('{req}', String(p.requestCount))
                .replace('{refund}', String(p.refundCount)) }}
            </text>
          </view>
          <view class="p-nums">
            <text class="p-amt">¥{{ fenToYuanFixed(p.refundAmount) }}</text>
            <text class="p-rate">{{ rateText(p.requestRate) }}</text>
          </view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.productTip') }}</text>
      </view>

      <!-- 售后评价满意度 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.reviewTitle') }}</text>
          <view class="pill"><text>{{ $t('campusAfterSalesAnalytics.reviewCount').replace('{n}', String(review.total)) }}</text></view>
        </view>
        <view class="score-row">
          <view class="score-box">
            <text class="score-n">{{ review.avgScore ? review.avgScore.toFixed(1) : '—' }}</text>
            <text class="score-l">{{ $t('campusAfterSalesAnalytics.reviewAvg') }}</text>
          </view>
          <view class="score-bars">
            <view v-for="d in reviewRows" :key="d.score" class="s-bar">
              <text class="s-star">{{ d.score }}★</text>
              <view class="s-track"><view class="s-fill" :style="{ width: d.w + '%' }"></view></view>
              <text class="s-n">{{ d.count }}</text>
            </view>
          </view>
        </view>
        <view v-if="review.topTags.length" class="chips">
          <text v-for="t in review.topTags" :key="t.tag" class="chip">
            {{ t.tag }} {{ t.count }}
          </text>
        </view>
        <text class="sheet__lbl">
          {{ $t('campusAfterSalesAnalytics.reviewLow').replace('{n}', String(review.lowScoreCount)) }}
        </text>
        <view v-if="!review.lowScores.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.reviewLowEmpty') }}</view>
        <view v-for="l in review.lowScores" :key="l.id" class="low">
          <view class="l-head">
            <text class="l-score">{{ l.score }}★</text>
            <text class="l-name">{{ l.customerName || $t('campusAfterSalesAnalytics.anonymous') }}</text>
            <text class="l-code">{{ l.orderCode }}</text>
            <text class="l-fu" :class="{ done: l.followedUp }">
              {{ l.followedUp ? $t('campusAfterSalesAnalytics.followed') : $t('campusAfterSalesAnalytics.notFollowed') }}
            </text>
          </view>
          <text class="l-cmt">{{ l.comment || $t('campusAfterSalesAnalytics.noComment') }}</text>
        </view>
      </view>

      <!-- 高频售后顾客 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.customerTitle') }}</text>
        </view>
        <view v-if="!topCustomers.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.customerEmpty') }}</view>
        <view v-for="c in topCustomers" :key="c.customerId" class="cust">
          <view class="c-main">
            <text class="c-name">{{ c.name || $t('campusAfterSalesAnalytics.anonymous') }}</text>
            <text class="c-phone">{{ c.phone }}</text>
            <text v-if="c.blacklisted" class="c-tag">{{ $t('campusAfterSalesAnalytics.blacklisted') }}</text>
          </view>
          <view class="c-nums">
            <text class="c-count">{{ $t('campusAfterSalesAnalytics.customerCount').replace('{n}', String(c.count)) }}</text>
            <text class="c-amt">¥{{ fenToYuanFixed(c.refundAmount) }}</text>
          </view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.customerTip') }}</text>
      </view>

      <!-- 员工处理绩效 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.staffTitle') }}</text>
          <text class="sub">{{ $t('campusAfterSalesAnalytics.staffSub').replace('{n}', String(staffStats.length)) }}</text>
        </view>
        <view v-if="!staffStats.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.staffEmpty') }}</view>
        <view v-for="s in staffStats" :key="s.operatorUserId" class="staff">
          <view class="s-head">
            <text class="s-name">{{ s.operatorName }}</text>
            <text class="s-handled">{{ $t('campusAfterSalesAnalytics.staffHandled').replace('{n}', String(s.handled)) }}</text>
            <text class="s-rate" :class="{ low: s.resolveRate < 60 }">
              {{ $t('campusAfterSalesAnalytics.staffRate').replace('{n}', String(s.resolveRate)) }}
            </text>
          </view>
          <view class="s-meta">
            <text class="s-m">{{ $t('campusAfterSalesAnalytics.staffResolved').replace('{n}', String(s.resolved)) }}</text>
            <text class="s-m">{{ $t('campusAfterSalesAnalytics.staffFirstAvg').replace('{n}', minutesText(s.firstActionAvgMinutes)) }}</text>
            <text class="s-m">{{ $t('campusAfterSalesAnalytics.staffResolveAvg').replace('{n}', minutesText(s.resolveAvgMinutes)) }}</text>
          </view>
          <view class="s-tags">
            <text class="s-tag" :class="{ bad: s.overdueCount > 0 }">
              {{ $t('campusAfterSalesAnalytics.staffOverdue').replace('{n}', String(s.overdueCount)) }}
            </text>
            <text class="s-tag" :class="{ warn: s.escalatedCount > 0 }">
              {{ $t('campusAfterSalesAnalytics.staffEscalated').replace('{n}', String(s.escalatedCount)) }}
            </text>
            <text class="s-tag muted">
              {{ s.reviewCount
                ? $t('campusAfterSalesAnalytics.staffReview').replace('{n}', String(s.reviewCount)).replace('{score}', s.reviewAvgScore.toFixed(1))
                : $t('campusAfterSalesAnalytics.staffNoReview') }}
            </text>
          </view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesAnalytics.staffTip') }}</text>
      </view>

      <!-- 退款流水 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesAnalytics.refundTitle') }}</text>
          <text class="sub">{{ $t('campusAfterSalesAnalytics.refundTotal').replace('{n}', String(refundTotal)) }}</text>
        </view>
        <view v-if="!refunds.length" class="inline-empty">{{ $t('campusAfterSalesAnalytics.refundEmpty') }}</view>
        <view v-for="r in refunds" :key="r.id" class="refund">
          <view class="rf-head">
            <text class="rf-code">{{ r.orderCode }}</text>
            <text class="rf-type">{{ typeText(r.type) }}</text>
            <text class="rf-amt">¥{{ fenToYuanFixed(r.amount) }}</text>
          </view>
          <text v-if="r.reason" class="rf-reason">{{ r.reason }}</text>
          <view class="rf-meta">
            <text class="rf-time">{{ timeText(r.refundedAt) }}</text>
            <text v-if="r.refundTransactionId" class="rf-tx">TX {{ r.refundTransactionId }}</text>
          </view>
        </view>
        <button v-if="refunds.length < refundTotal" class="more" :disabled="loadingMore" @tap="loadMoreRefunds">
          {{ loadingMore ? $t('campusAfterSalesAnalytics.loadingMore') : $t('campusAfterSalesAnalytics.loadMore') }}
        </button>
      </view>
    </template>

    <!-- 导出弹层 -->
    <view v-if="exportOpen" class="mask" @tap.self="closeExport">
      <view class="sheet">
        <view class="sheet__hd">
          <text class="sheet__t">{{ $t('campusAfterSalesAnalytics.exportTitle') }}</text>
          <text class="sheet__x" @tap="closeExport">✕</text>
        </view>
        <text class="sheet__hint">{{ $t('campusAfterSalesAnalytics.exportHint') }}</text>
        <text class="sheet__lbl">{{ $t('campusAfterSalesAnalytics.exportKind') }}</text>
        <view class="kind-list">
          <text
            v-for="k in kinds"
            :key="k.value"
            class="kind"
            :class="{ on: exportKind === k.value }"
            @tap="exportKind = k.value"
          >{{ $t(k.label) }}</text>
        </view>
        <text class="sheet__lbl">{{ $t('campusAfterSalesAnalytics.exportRange') }}</text>
        <text class="export-range">{{ fromKey }} ~ {{ toKey }}</text>
        <view class="sheet__ops">
          <text class="sheet__clear" @tap="closeExport">{{ $t('campusAfterSalesAnalytics.cancel') }}</text>
          <button class="sheet__save" :disabled="exporting" @tap="doExport">
            {{ exporting ? $t('campusAfterSalesAnalytics.exporting') : $t('campusAfterSalesAnalytics.exportNow') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSalesExport,
  campusMerchantAfterSalesProductReport,
  campusMerchantAfterSalesReasonReport,
  campusMerchantAfterSalesRefunds,
  campusMerchantAfterSalesReport,
  campusMerchantAfterSalesReviewSummary,
  campusMerchantAfterSalesStaffStats,
  campusMerchantAfterSalesStats,
  campusMerchantAfterSalesTopCustomers,
  type MerchantAfterSalesProductRow,
  type MerchantAfterSalesReasonRow,
  type MerchantAfterSalesRefundRow,
  type MerchantAfterSalesReport,
  type MerchantAfterSalesReviewSummary,
  type MerchantAfterSalesStaffStat,
  type MerchantAfterSalesStats,
  type MerchantAfterSalesTopCustomer,
} from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();

type RangeKey = 'today' | 'last7' | 'last30' | 'custom';
const range = ref<RangeKey>('last7');
const fromDate = ref('');
const toDate = ref('');
const todayKey = campusDateKey(0);

function campusDateKey(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function timeText(raw?: string | null): string {
  const s = formatDateTime(raw);
  return s ? s.slice(6) : '';
}

/** 区间口径：后端按校园日（UTC+8）解析，end 当日含全天 */
const fromKey = computed(() => {
  if (range.value === 'today') return todayKey;
  if (range.value === 'last7') return campusDateKey(-6);
  if (range.value === 'last30') return campusDateKey(-29);
  return fromDate.value;
});
const toKey = computed(() => {
  if (range.value === 'custom') return toDate.value || fromDate.value;
  return todayKey;
});
const rangeLabel = computed(() =>
  range.value === 'today'
    ? locale.t('campusAfterSalesAnalytics.rangeToday')
    : range.value === 'last7'
      ? locale.t('campusAfterSalesAnalytics.range7d')
      : range.value === 'last30'
        ? locale.t('campusAfterSalesAnalytics.range30d')
        : `${fromDate.value || '—'} ~ ${toDate.value || '—'}`,
);

const emptyReport = (): MerchantAfterSalesReport => ({
  from: '', to: '', total: 0, byType: [], byState: [], refunded: 0, refundAmount: 0, overdue: 0,
  byDay: [], reasons: [], rejectReasons: [],
  firstResponseAvgMinutes: 0, firstResponseMaxMinutes: 0, resolveAvgMinutes: 0, resolveMaxMinutes: 0,
  firstResponseOnTargetRate: 0, resolveOnTargetRate: 0, firstResponseOverdue: 0, resolveOverdue: 0,
  previousTotal: 0, previousRefunded: 0, previousRefundAmount: 0, previousOverdue: 0,
});
const emptyReview = (): MerchantAfterSalesReviewSummary => ({
  total: 0, avgScore: 0, distribution: [], lowScoreCount: 0, lowScores: [], topTags: [],
});

const loading = ref(false);
const loadError = ref('');
const stats = ref<MerchantAfterSalesStats>({
  pending: 0, overdue: 0, timeoutHours: 0, todayHandled: 0, todayRefunded: 0,
  todayRefundAmount: 0, pendingReply: 0, dueSoon: 0, dueSoonHours: 0,
});
const report = ref<MerchantAfterSalesReport>(emptyReport());
const reasons = ref<MerchantAfterSalesReasonRow[]>([]);
const products = ref<MerchantAfterSalesProductRow[]>([]);
const review = ref<MerchantAfterSalesReviewSummary>(emptyReview());
const topCustomers = ref<MerchantAfterSalesTopCustomer[]>([]);
const staffStats = ref<MerchantAfterSalesStaffStat[]>([]);
const refunds = ref<MerchantAfterSalesRefundRow[]>([]);
const refundTotal = ref(0);
const loadingMore = ref(false);

/* ---------- 文案工具 ---------- */
function minutesText(m: number): string {
  if (!m || m <= 0) return '—';
  if (m >= 60) return locale.t('campusAfterSalesAnalytics.hourUnit').replace('{n}', (m / 60).toFixed(1));
  return locale.t('campusAfterSalesAnalytics.minUnit').replace('{n}', String(Math.round(m)));
}

function rateText(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function deltaText(cur: number, prev: number): string {
  if (!prev) return locale.t('campusAfterSalesAnalytics.deltaNone');
  const d = ((cur - prev) / prev) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}% ${locale.t('campusAfterSalesAnalytics.deltaVs')}`;
}

function deltaClass(cur: number, prev: number): string {
  if (!prev) return 'flat';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

const typeKeys: Record<string, string> = {
  refund_only: 'campusAfterSalesAnalytics.typeRefundOnly',
  return_refund: 'campusAfterSalesAnalytics.typeReturnRefund',
  exchange: 'campusAfterSalesAnalytics.typeExchange',
};
const stateKeys: Record<string, string> = {
  Pending: 'campusAfterSalesAnalytics.statePending',
  Receiving: 'campusAfterSalesAnalytics.stateReceiving',
  RefundFailed: 'campusAfterSalesAnalytics.stateFailed',
  Refunded: 'campusAfterSalesAnalytics.stateRefunded',
  Rejected: 'campusAfterSalesAnalytics.stateRejected',
  Approved: 'campusAfterSalesAnalytics.stateApproved',
  Received: 'campusAfterSalesAnalytics.stateReceived',
  Appealed: 'campusAfterSalesAnalytics.stateAppealed',
  Closed: 'campusAfterSalesAnalytics.stateClosed',
  Cancelled: 'campusAfterSalesAnalytics.stateCancelled',
};

function typeText(t: string): string {
  const k = typeKeys[t];
  return k ? locale.t(k) : t;
}
function stateText(s: string): string {
  const k = stateKeys[s];
  return k ? locale.t(k) : s;
}

/* ---------- 图表数据 ---------- */
const trendRows = computed(() => {
  const max = Math.max(1, ...report.value.byDay.map(d => d.count));
  return report.value.byDay.map(d => ({ ...d, w: d.count ? Math.max(6, (d.count / max) * 100) : 0 }));
});

const reviewRows = computed(() => {
  const dist = review.value.distribution || [];
  const max = Math.max(1, ...dist.map(d => d.count));
  return [5, 4, 3, 2, 1].map(score => {
    const count = dist.find(d => Number(d.score) === score)?.count ?? 0;
    return { score, count, w: count ? Math.max(4, (count / max) * 100) : 0 };
  });
});

/* ---------- 加载 ---------- */
async function loadLive(): Promise<void> {
  try {
    stats.value = await campusMerchantAfterSalesStats();
  } catch {
    /* 实时态势失败不阻塞报表 */
  }
}

async function loadAll(): Promise<void> {
  const from = fromKey.value;
  const to = toKey.value;
  const [rep, rea, prod, rv, cust, staff] = await Promise.all([
    campusMerchantAfterSalesReport(from, to),
    campusMerchantAfterSalesReasonReport(from, to, 10),
    campusMerchantAfterSalesProductReport(from, to, 10),
    campusMerchantAfterSalesReviewSummary(from, to),
    campusMerchantAfterSalesTopCustomers(from, to, 10),
    campusMerchantAfterSalesStaffStats(from, to),
  ]);
  report.value = rep;
  reasons.value = rea;
  products.value = prod;
  review.value = rv;
  topCustomers.value = cust;
  staffStats.value = staff;
  const page = await campusMerchantAfterSalesRefunds({ from, to, skip: 0, take: 20 });
  refunds.value = page.items;
  refundTotal.value = page.total;
}

async function reload(): Promise<void> {
  if (range.value === 'custom' && (!fromDate.value || !toDate.value)) return;
  loading.value = true;
  loadError.value = '';
  try {
    await loadAll();
  } catch (err: any) {
    loadError.value = graphQlErrorMsg(err, locale.t('campusAfterSalesAnalytics.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadMoreRefunds(): Promise<void> {
  if (loadingMore.value) return;
  loadingMore.value = true;
  try {
    const page = await campusMerchantAfterSalesRefunds({
      from: fromKey.value, to: toKey.value, skip: refunds.value.length, take: 20,
    });
    refunds.value = [...refunds.value, ...page.items];
    refundTotal.value = page.total;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAnalytics.loadFailed')), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function setRange(key: RangeKey): void {
  if (range.value === key) return;
  range.value = key;
  if (key === 'custom') {
    if (!fromDate.value) fromDate.value = campusDateKey(-6);
    if (!toDate.value) toDate.value = todayKey;
  }
  void reload();
}

function onPickFrom(e: any): void {
  fromDate.value = String(e?.detail?.value ?? '');
  if (toDate.value && fromDate.value > toDate.value) toDate.value = fromDate.value;
  void reload();
}

function onPickTo(e: any): void {
  toDate.value = String(e?.detail?.value ?? '');
  void reload();
}

/* ---------- 导出 CSV（§104） ---------- */
type ExportKind = 'requests' | 'refunds' | 'escalations';
const exportOpen = ref(false);
const exportKind = ref<ExportKind>('requests');
const exporting = ref(false);
const kinds: Array<{ value: ExportKind; label: string }> = [
  { value: 'requests', label: 'campusAfterSalesAnalytics.kindRequests' },
  { value: 'refunds', label: 'campusAfterSalesAnalytics.kindRefunds' },
  { value: 'escalations', label: 'campusAfterSalesAnalytics.kindEscalations' },
];

function openExport(): void {
  if (range.value === 'custom' && (!fromDate.value || !toDate.value)) {
    uni.showToast({ title: locale.t('campusAfterSalesAnalytics.pickRangeFirst'), icon: 'none' });
    return;
  }
  exportOpen.value = true;
}

function closeExport(): void {
  if (exporting.value) return;
  exportOpen.value = false;
}

async function doExport(): Promise<void> {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const csv = await campusMerchantAfterSalesExport({
      from: fromKey.value,
      to: toKey.value,
      kind: exportKind.value,
    });
    if (!csv) {
      uni.showToast({ title: locale.t('campusAfterSalesAnalytics.exportEmpty'), icon: 'none' });
      return;
    }
    const body = csv.charCodeAt(0) === 0xfeff ? csv : `\uFEFF${csv}`;
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `after-sales-${exportKind.value}-${fromKey.value.replace(/-/g, '')}-${toKey.value.replace(/-/g, '')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    exportOpen.value = false;
    uni.showToast({ title: locale.t('campusAfterSalesAnalytics.exportDone'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAnalytics.exportFailed')), icon: 'none' });
  } finally {
    exporting.value = false;
  }
}

onLoad(() => {
  void loadLive();
  void reload();
});

onMounted(() => {
  if (!report.value.total && !loadError.value) void reload();
});

onPullDownRefresh(async () => {
  await Promise.all([loadLive(), reload()]);
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
      .act { font-size: 24rpx; color: $wa-accent; &.busy { opacity: .6; } }
      .sub { font-size: 22rpx; color: $wa-muted; }
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
    .range-row { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; }
    .range-sep { color: $wa-muted; font-size: 26rpx; }
    .tip { display: block; margin-top: 14rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
  }
  .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx;
    font-size: 26rpx; color: $wa-ink; box-sizing: border-box;
    &.picker { color: $wa-muted; }
    &.picker.picked { color: $wa-ink; }
  }
  .range-row .picker { flex: 1; }
  .kpis { display: flex; gap: 16rpx; margin-top: 16rpx;
    .kpi { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 12rpx;
      display: flex; flex-direction: column; align-items: center; gap: 4rpx;
      .k-n { font-size: 34rpx; font-weight: 700; color: $wa-ink;
        &.warn { color: #fa8c16; }
        &.danger { color: #d4380d; }
      }
      .k-l { font-size: 20rpx; color: $wa-muted; }
      .k-d { font-size: 18rpx; color: $wa-muted;
        &.up { color: #d4380d; }
        &.down { color: #237804; }
        &.flat { color: $wa-muted; }
      }
    }
  }
  .kvs { display: flex; flex-wrap: wrap; gap: 12rpx 24rpx; margin-top: 16rpx;
    .kv { width: calc(50% - 12rpx); display: flex; align-items: center; justify-content: space-between;
      background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx;
      .k { font-size: 22rpx; color: $wa-muted; }
      .v { font-size: 24rpx; color: $wa-ink; font-weight: 600; }
    }
  }
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
    .chip { font-size: 22rpx; color: #1677ff; background: #eaf3ff;
      border-radius: 999rpx; padding: 8rpx 20rpx;
      &.ok { color: #237804; background: #f6ffed; }
      &.bad { color: #a8071a; background: #fff1f0; }
      &.muted { color: $wa-muted; background: $wa-bg; }
    }
  }
  .trend { display: flex; align-items: center; gap: 12rpx; padding: 10rpx 0;
    .t-date { width: 76rpx; font-size: 22rpx; color: $wa-muted; }
    .t-bar { flex: 1; height: 18rpx; background: $wa-bg; border-radius: 999rpx; overflow: hidden;
      .t-fill { height: 100%; background: $wa-accent; border-radius: 999rpx; }
    }
    .t-val { width: 56rpx; text-align: right; font-size: 22rpx; color: $wa-ink; font-weight: 600; }
    .t-refund { width: 110rpx; text-align: right; font-size: 20rpx; color: $wa-muted; }
  }
  .reason { padding: 14rpx 0; border-top: 1px solid $wa-rule;
    .r-head { display: flex; align-items: center; gap: 12rpx;
      .r-name { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
      .r-share { font-size: 22rpx; color: $wa-accent; }
    }
    .r-bar { height: 12rpx; background: $wa-bg; border-radius: 999rpx; overflow: hidden; margin: 8rpx 0;
      .r-fill { height: 100%; background: #ffc53d; border-radius: 999rpx; }
    }
    .r-meta { display: flex; align-items: center; gap: 16rpx;
      .r-m { font-size: 20rpx; color: $wa-muted; }
      .r-amt { margin-left: auto; font-size: 22rpx; color: #d4380d; font-weight: 600; }
      .r-chg { font-size: 20rpx; color: #237804;
        &.up { color: #d4380d; }
      }
    }
  }
  .prod { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0;
    border-top: 1px solid $wa-rule;
    .p-rank { flex: none; width: 40rpx; height: 40rpx; border-radius: 50%; background: $wa-bg;
      font-size: 22rpx; color: $wa-muted; text-align: center; line-height: 40rpx;
      &.top { background: #fff7e6; color: #ad6800; font-weight: 700; }
    }
    .p-main { flex: 1; display: flex; flex-direction: column; gap: 4rpx;
      .p-name { font-size: 26rpx; color: $wa-ink; }
      .p-meta { font-size: 20rpx; color: $wa-muted; }
    }
    .p-nums { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx;
      .p-amt { font-size: 24rpx; color: #d4380d; font-weight: 600; }
      .p-rate { font-size: 20rpx; color: $wa-muted; }
    }
  }
  .score-row { display: flex; gap: 24rpx; margin-top: 16rpx;
    .score-box { flex: none; width: 140rpx; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: $wa-bg; border-radius: $wa-radius;
      padding: 16rpx 0;
      .score-n { font-size: 44rpx; font-weight: 700; color: #fa8c16; }
      .score-l { font-size: 20rpx; color: $wa-muted; }
    }
    .score-bars { flex: 1; display: flex; flex-direction: column; gap: 8rpx;
      .s-bar { display: flex; align-items: center; gap: 10rpx;
        .s-star { width: 52rpx; font-size: 20rpx; color: $wa-muted; }
        .s-track { flex: 1; height: 12rpx; background: $wa-bg; border-radius: 999rpx; overflow: hidden;
          .s-fill { height: 100%; background: #ffc53d; border-radius: 999rpx; }
        }
        .s-n { width: 50rpx; text-align: right; font-size: 20rpx; color: $wa-ink; }
      }
    }
  }
  .low { padding: 14rpx 0; border-top: 1px solid $wa-rule;
    .l-head { display: flex; align-items: center; gap: 12rpx;
      .l-score { font-size: 22rpx; color: #d4380d; font-weight: 600; }
      .l-name { font-size: 24rpx; color: $wa-ink; }
      .l-code { font-size: 20rpx; color: $wa-muted; }
      .l-fu { margin-left: auto; font-size: 20rpx; color: #fa8c16;
        &.done { color: #237804; }
      }
    }
    .l-cmt { display: block; margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
  }
  .cust { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0;
    border-top: 1px solid $wa-rule;
    .c-main { flex: 1; display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap;
      .c-name { font-size: 26rpx; color: $wa-ink; }
      .c-phone { font-size: 22rpx; color: $wa-muted; }
      .c-tag { font-size: 20rpx; color: #a8071a; background: #fff1f0; border-radius: 999rpx; padding: 2rpx 14rpx; }
    }
    .c-nums { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx;
      .c-count { font-size: 22rpx; color: $wa-muted; }
      .c-amt { font-size: 24rpx; color: #d4380d; font-weight: 600; }
    }
  }
  .staff { padding: 14rpx 0; border-top: 1px solid $wa-rule;
    .s-head { display: flex; align-items: center; gap: 12rpx;
      .s-name { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
      .s-handled { font-size: 22rpx; color: $wa-muted; }
      .s-rate { font-size: 22rpx; color: #237804; font-weight: 600;
        &.low { color: #d4380d; }
      }
    }
    .s-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx 20rpx; margin-top: 6rpx;
      .s-m { font-size: 20rpx; color: $wa-muted; }
    }
    .s-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 10rpx; margin-top: 8rpx;
      .s-tag { font-size: 20rpx; color: #237804; background: #f6ffed;
        border-radius: 999rpx; padding: 2rpx 14rpx;
        &.bad { color: #a8071a; background: #fff1f0; }
        &.warn { color: #ad6800; background: #fff7e6; }
        &.muted { color: $wa-muted; background: $wa-bg; }
      }
    }
  }
  .refund { padding: 14rpx 0; border-top: 1px solid $wa-rule;
    .rf-head { display: flex; align-items: center; gap: 12rpx;
      .rf-code { flex: 1; font-size: 24rpx; color: $wa-ink; font-weight: 600; }
      .rf-type { font-size: 20rpx; color: #1677ff; background: #eaf3ff; border-radius: 999rpx; padding: 2rpx 14rpx; }
      .rf-amt { font-size: 24rpx; color: #d4380d; font-weight: 600; }
    }
    .rf-reason { display: block; margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; }
    .rf-meta { display: flex; align-items: center; gap: 16rpx; margin-top: 4rpx;
      .rf-time { font-size: 20rpx; color: $wa-muted; }
      .rf-tx { font-size: 20rpx; color: $wa-muted; }
    }
  }
  .more { background: $wa-card; color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius;
    line-height: 76rpx; margin-top: 20rpx; &[disabled] { opacity: .6; }
  }
  .inline-empty { font-size: 24rpx; color: $wa-muted; padding: 28rpx 0; text-align: center; }
  .sheet__lbl { display: block; font-size: 24rpx; color: $wa-ink; margin: 16rpx 0 8rpx; }
}

.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
  display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 88vh; overflow-y: auto; background: $wa-card;
  border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx; box-sizing: border-box;
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__lbl { display: block; font-size: 24rpx; color: $wa-ink; margin: 16rpx 0 8rpx; }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 28rpx; }
  &__clear { flex: none; font-size: 24rpx; color: $wa-muted; padding: 12rpx 8rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
    &[disabled] { opacity: .6; }
  }
  .kind-list { display: flex; flex-direction: column; gap: 12rpx; margin-top: 8rpx;
    .kind { font-size: 26rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius;
      padding: 20rpx 24rpx;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; }
    }
  }
  .export-range { display: block; font-size: 26rpx; color: $wa-ink; background: $wa-bg;
    border-radius: $wa-radius; padding: 18rpx 24rpx; }
}
</style>
