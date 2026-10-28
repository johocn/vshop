<template>
  <view class="page">
    <view class="head">
      <text class="title">{{ $t('campusSales.title') }}</text>
      <text class="sub">{{ $t('campusSales.subtitle') }}</text>
    </view>

    <view class="seg">
      <view class="seg-item" :class="{ on: range === 'today' }" @tap="switchRange('today')">{{ $t('campusSales.rangeToday') }}</view>
      <view class="seg-item" :class="{ on: range === '7d' }" @tap="switchRange('7d')">{{ $t('campusSales.range7d') }}</view>
      <view class="seg-item" :class="{ on: range === '30d' }" @tap="switchRange('30d')">{{ $t('campusSales.range30d') }}</view>
    </view>

    <text v-if="!loaded && !err" class="muted">{{ $t('campusSales.loading') }}</text>
    <text v-else-if="loaded && isEmpty" class="muted">{{ $t('campusSales.empty') }}</text>

    <template v-else-if="loaded">
      <!-- KPI：单量 / GMV / 客单价 / 新客数 / 复购率，带环比 -->
      <view class="kpis">
        <view v-for="c in kpiCards" :key="c.key" class="kpi">
          <text class="num">{{ c.value }}</text>
          <text class="lbl">{{ $t(c.label) }}</text>
          <view class="cmp" :class="pctClass(c.pct)">
            <text class="hint">{{ $t('campusSales.compareHint') }}</text>
            <text v-if="c.pct === null" class="pct">{{ $t('campusSales.noPrev') }}</text>
            <text v-else class="pct">{{ c.pct > 0 ? '↑' : c.pct < 0 ? '↓' : '' }}{{ Math.abs(c.pct).toFixed(1) }}%</text>
          </view>
        </view>
      </view>

      <!-- 趋势：7d/30d 按日；today 按时段 0-23 -->
      <view class="card">
        <view class="secrow">
          <text class="sec">{{ range === 'today' ? $t('campusSales.hourlyTitle') : $t('campusSales.trendTitle') }}</text>
          <text v-if="trendTotal > 0" class="expo" @tap="exportTrend">{{ $t('campusSales.exportTrend') }}</text>
        </view>
        <template v-if="trendPoints.length && trendTotal > 0">
          <view class="tmeta">
            <text class="tm on">{{ activePoint.label }}</text>
            <text class="tm">{{ $t('campusSales.kpiOrders') }} {{ activePoint.orders }}</text>
            <text class="tm">¥{{ fenToYuanFixed(activePoint.gmvFen) }}</text>
          </view>
          <view class="chart">
            <view v-for="(p, i) in trendPoints" :key="i" class="col" @tap="activeIndex = i">
              <view class="track">
                <view class="bar" :class="{ on: i === activeIndex }" :style="{ height: barHeight(p.orders) }" />
              </view>
              <text class="xl">{{ axisLabel(i, p.label) }}</text>
            </view>
          </view>
          <view class="lg">
            <view class="lg-item"><view class="dot" /><text>{{ $t('campusSales.kpiOrders') }}</text></view>
            <text class="lg-tip">{{ $t('campusSales.trendHint') }}</text>
          </view>
        </template>
        <text v-else class="muted">{{ $t('campusSales.empty') }}</text>
      </view>

      <!-- 菜品四象限：横轴销量 / 纵轴销售额，十字线为中位数 -->
      <view class="card">
        <text class="sec">{{ $t('campusSales.quadrantTitle') }}</text>
        <template v-if="products.length">
          <view class="qhead">
            <text class="ax">{{ $t('campusSales.colQty') }} →</text>
            <text class="ax">{{ $t('campusSales.colGmv') }} ↑</text>
          </view>
          <view class="quad">
            <view class="quad-in">
              <view class="vline" :style="{ left: medX }" />
              <view class="hline" :style="{ bottom: medY }" />
              <text class="ql tl premium">{{ $t('campusSales.quadPremium') }}</text>
              <text class="ql tr star">{{ $t('campusSales.quadStar') }}</text>
              <text class="ql bl slow">{{ $t('campusSales.quadSlow') }}</text>
              <text class="ql br traffic">{{ $t('campusSales.quadTraffic') }}</text>
              <view
                v-for="p in scatter" :key="p.productId"
                class="pt" :class="p.quadrant"
                :style="{ left: p.left, bottom: p.bottom }"
              />
            </view>
          </view>
        </template>
        <text v-else class="muted">{{ $t('campusSales.empty') }}</text>
      </view>

      <!-- Top 商品表 -->
      <view class="card">
        <view class="secrow">
          <text class="sec">{{ $t('campusSales.productsTitle') }}</text>
          <text v-if="products.length" class="expo" @tap="exportProducts">{{ $t('campusSales.exportCsv') }}</text>
        </view>
        <view v-if="products.length" class="thead">
          <text class="hname">{{ $t('campusSales.colName') }}</text>
          <text class="hqty">{{ $t('campusSales.colQty') }}</text>
          <text class="hgmv">{{ $t('campusSales.colGmv') }}</text>
          <text class="hquad">{{ $t('campusSales.colQuadrant') }}</text>
        </view>
        <view v-for="p in topProducts" :key="p.productId" class="prow">
          <text class="pname">{{ p.name }}</text>
          <text class="pqty">{{ p.quantity }}</text>
          <text class="pgmv">¥{{ fenToYuanFixed(p.gmvFen) }}</text>
          <text class="pquad" :class="p.quadrant">{{ $t(quadLabel(p.quadrant)) }}</text>
        </view>
        <text v-if="!products.length" class="muted">{{ $t('campusSales.empty') }}</text>
      </view>

      <!-- 复购分群 -->
      <view class="card">
        <view class="secrow">
          <text class="sec">{{ $t('campusSales.cohortsTitle') }}</text>
          <text v-if="cohortTotal > 0" class="expo" @tap="exportUsers">{{ $t('campusSales.exportUsers') }}</text>
        </view>
        <template v-if="cohortTotal > 0">
          <view v-for="r in cohortRows" :key="r.key" class="crow">
            <text class="cname">{{ $t(r.label) }}</text>
            <view class="cbar"><view class="cfill" :style="{ width: r.pct + '%' }" /></view>
            <view class="cval">
              <text class="ccnt">{{ r.count }}</text>
              <text class="cpct">{{ r.pct }}%</text>
            </view>
          </view>
        </template>
        <text v-else class="muted">{{ $t('campusSales.empty') }}</text>
      </view>
    </template>

    <text v-if="err" class="err">{{ err }} <text class="retry" @tap="load">{{ $t('campusSales.retry') }}</text></text>
    <view style="height: 40rpx" />
  </view>
</template>

<script lang="ts" setup>
// 经营分析：跨店铺聚合 campusSalesStats，今日/7日/30日三档窗口。
// 口径：销售单=已付款未取消且非跑腿；GMV/aov 单位「分」，展示走 utils/money 统一转元。
import { computed, ref } from 'vue';
import { campusSalesStats, type CampusSalesStats } from '../../apis/campus';
import { downloadCsv } from '../../utils/csv';
import { fenToYuanFixed } from '../../utils/money';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusViewDispatch');
const locale = useLocaleStore();

const TOP_N = 10;

const range = ref<'today' | '7d' | '30d'>('7d');
const loaded = ref(false);
const err = ref('');
const activeIndex = ref(0);
const stats = ref<CampusSalesStats>({
  range: '7d',
  windowStart: '',
  kpis: { orders: 0, gmvFen: 0, aovFen: 0, customers: 0, newCustomers: 0, repurchaseRate: 0 },
  prev: { orders: 0, gmvFen: 0, aovFen: 0, customers: 0, newCustomers: 0, repurchaseRate: 0 },
  compare: { ordersPct: 0, gmvPct: 0, aovPct: 0, repurchaseRatePct: 0 },
  hourlyHeat: [],
  dailyTrend: [],
  products: [],
  cohorts: { once: 0, twiceToFour: 0, loyal: 0 },
  medianQuantity: 0,
  medianGmvFen: 0,
});

async function load(): Promise<void> {
  err.value = '';
  try {
    stats.value = await campusSalesStats(range.value);
    loaded.value = true;
    activeIndex.value = trendPoints.value.length - 1;
  } catch (e) {
    console.error('campusSalesStats failed', e);
    loaded.value = false;
    err.value = String(e?.message || e).slice(0, 120);
  }
}

function switchRange(r: 'today' | '7d' | '30d'): void {
  if (range.value === r) return;
  range.value = r;
  load();
}

const isEmpty = computed(() => stats.value.kpis.orders === 0);

/** 环比：后端在上期为 0 时也返回 0，这里按 prev 判空 → null 表示无上期数据 */
function pctOf(cur: number, prev: number): number {
  if (prev <= 0) return 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

interface KpiCard { key: string; label: string; value: string; pct: number | null }

const kpiCards = computed<KpiCard[]>(() => {
  const k = stats.value.kpis;
  const p = stats.value.prev;
  const c = stats.value.compare;
  return [
    { key: 'orders', label: 'campusSales.kpiOrders', value: String(k.orders), pct: p.orders > 0 ? c.ordersPct : null },
    { key: 'gmv', label: 'campusSales.kpiGmv', value: '¥' + fenToYuanFixed(k.gmvFen), pct: p.gmvFen > 0 ? c.gmvPct : null },
    { key: 'aov', label: 'campusSales.kpiAov', value: '¥' + fenToYuanFixed(k.aovFen), pct: p.aovFen > 0 ? c.aovPct : null },
    {
      key: 'newCustomers',
      label: 'campusSales.kpiNewCustomers',
      value: String(k.newCustomers),
      pct: p.newCustomers > 0 ? pctOf(k.newCustomers, p.newCustomers) : null,
    },
    {
      key: 'repurchase',
      label: 'campusSales.kpiRepurchase',
      value: k.repurchaseRate + '%',
      pct: p.customers > 0 ? c.repurchaseRatePct : null,
    },
  ];
});

function pctClass(v: number | null): string {
  if (v === null || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

// ===== 趋势 =====
interface TrendCol { label: string; orders: number; gmvFen: number }

const trendPoints = computed<TrendCol[]>(() => {
  if (range.value === 'today') {
    return stats.value.hourlyHeat.map((h) => ({ label: String(h.hour), orders: h.orders, gmvFen: h.gmvFen }));
  }
  return stats.value.dailyTrend.map((d) => ({ label: d.date, orders: d.orders, gmvFen: d.gmvFen }));
});

const trendMax = computed(() => Math.max(...trendPoints.value.map((p) => p.orders), 0));
const trendTotal = computed(() => trendPoints.value.reduce((s, p) => s + p.orders, 0));
const activePoint = computed<TrendCol>(
  () => trendPoints.value[activeIndex.value] ?? trendPoints.value[trendPoints.value.length - 1] ?? { label: '', orders: 0, gmvFen: 0 },
);

function barHeight(v: number): string {
  if (v <= 0 || trendMax.value <= 0) return '0%';
  return `${Math.max(2, Math.round((v / trendMax.value) * 100))}%`;
}

/** 标签密度：今日每 3 小时、7 日全显示、30 日每 5 天 + 最后一天 */
function axisLabel(i: number, label: string): string {
  if (range.value === 'today') return i % 3 === 0 ? label : '';
  if (range.value === '7d') return label;
  return i % 5 === 0 || i === trendPoints.value.length - 1 ? label : '';
}

// ===== 四象限 =====
const products = computed(() => stats.value.products);
const topProducts = computed(() => products.value.slice(0, TOP_N));

const xMax = computed(() => Math.max(...products.value.map((p) => p.quantity), stats.value.medianQuantity * 1.6, 1));
const yMax = computed(() => Math.max(...products.value.map((p) => p.gmvFen), stats.value.medianGmvFen * 1.6, 1));

function pos(v: number, max: number): string {
  if (max <= 0) return '2%';
  return `${Math.min(98, Math.max(2, Math.round((v / max) * 1000) / 10))}%`;
}

const scatter = computed(() =>
  products.value.map((p) => ({
    ...p,
    left: pos(p.quantity, xMax.value),
    bottom: pos(p.gmvFen, yMax.value),
  })),
);

const medX = computed(() => pos(stats.value.medianQuantity, xMax.value));
const medY = computed(() => pos(stats.value.medianGmvFen, yMax.value));

const QUADRANT_LABEL: Record<string, string> = {
  star: 'campusSales.quadStar',
  traffic: 'campusSales.quadTraffic',
  premium: 'campusSales.quadPremium',
  slow: 'campusSales.quadSlow',
};

function quadLabel(q: string): string {
  return QUADRANT_LABEL[q] || QUADRANT_LABEL.slow;
}

/** 文件名日期戳 YYYYMMDD */
function todayStamp(): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
}

/** P4-1-4 导出：商品结构明细（口径与页面一致，金额单位元、固定两位小数） */
function exportProducts(): void {
  if (!products.value.length) {
    uni.showToast({ title: locale.t('campusSales.exportEmpty'), icon: 'none' });
    return;
  }
  const rows = products.value.map((x) => [
    x.name,
    String(x.quantity),
    fenToYuanFixed(x.gmvFen),
    locale.t(quadLabel(x.quadrant)),
  ]);
  downloadCsv(
    `${locale.t('campusSales.exportFileName')}-${todayStamp()}.csv`,
    [
      locale.t('campusSales.colName'),
      locale.t('campusSales.colQty'),
      locale.t('campusSales.colGmv'),
      locale.t('campusSales.colQuadrant'),
    ],
    rows,
  );
  uni.showToast({
    title: locale.t('campusSales.exportDone').replace('{n}', String(rows.length)),
    icon: 'none',
  });
}

/** P4-1-4 导出：用户结构明细（下单客户 / 新老客 / 复购分群，占比基数=窗口内下单客户数） */
function exportUsers(): void {
  const k = stats.value.kpis;
  if (k.customers <= 0) {
    uni.showToast({ title: locale.t('campusSales.exportEmpty'), icon: 'none' });
    return;
  }
  const total = k.customers;
  const c = stats.value.cohorts;
  const pct = (n: number) => String(Math.round((n / total) * 1000) / 10);
  const row = (seg: string, count: number) => [seg, String(count), pct(count)];
  const rows = [
    row(locale.t('campusSales.segCustomers'), total),
    row(locale.t('campusSales.segNew'), k.newCustomers),
    row(locale.t('campusSales.segOld'), Math.max(0, total - k.newCustomers)),
    row(locale.t('campusSales.segRepeat'), c.twiceToFour + c.loyal),
    row(locale.t('campusSales.cohortOnce'), c.once),
    row(locale.t('campusSales.cohortTwice'), c.twiceToFour),
    row(locale.t('campusSales.cohortLoyal'), c.loyal),
  ];
  downloadCsv(
    `${locale.t('campusSales.exportUsersFileName')}-${todayStamp()}.csv`,
    [locale.t('campusSales.colSegment'), locale.t('campusSales.colCustomers'), locale.t('campusSales.colPct')],
    rows,
  );
  uni.showToast({
    title: locale.t('campusSales.exportDone').replace('{n}', String(rows.length)),
    icon: 'none',
  });
}

/** P4-1-4 导出：经营趋势明细（today=24 时段，7d/30d=按日；金额单位元） */
function exportTrend(): void {
  if (trendTotal.value <= 0) {
    uni.showToast({ title: locale.t('campusSales.exportEmpty'), icon: 'none' });
    return;
  }
  const rows = trendPoints.value.map((p) => [
    range.value === 'today' ? `${p.label}:00` : p.label,
    String(p.orders),
    fenToYuanFixed(p.gmvFen),
  ]);
  downloadCsv(
    `${locale.t('campusSales.exportTrendFileName')}-${todayStamp()}.csv`,
    [locale.t('campusSales.colPoint'), locale.t('campusSales.kpiOrders'), locale.t('campusSales.colTrendGmv')],
    rows,
  );
  uni.showToast({
    title: locale.t('campusSales.exportDone').replace('{n}', String(rows.length)),
    icon: 'none',
  });
}

// ===== 复购分群 =====
const cohortTotal = computed(() => stats.value.cohorts.once + stats.value.cohorts.twiceToFour + stats.value.cohorts.loyal);

const cohortRows = computed(() => {
  const c = stats.value.cohorts;
  const total = cohortTotal.value;
  const row = (key: string, label: string, count: number) => ({
    key,
    label,
    count,
    pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  });
  return [
    row('once', 'campusSales.cohortOnce', c.once),
    row('twice', 'campusSales.cohortTwice', c.twiceToFour),
    row('loyal', 'campusSales.cohortLoyal', c.loyal),
  ];
});

load();
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 40rpx;
  .head { padding: 8rpx 0 20rpx;
    .title { display: block; font-size: 36rpx; font-weight: 600; color: $wa-ink; }
    .sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; } }
  .seg { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .seg-item { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius; background: $wa-card; font-size: 26rpx; color: $wa-muted;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; } } }

  .kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20rpx; margin-bottom: 20rpx;
    .kpi { min-width: 0; background: $wa-card; border-radius: $wa-radius; padding: 30rpx 20rpx;
      display: flex; flex-direction: column; align-items: center;
      &:nth-child(5) { grid-column: 1 / -1; }
      .num { font-size: 38rpx; font-weight: 600; color: $wa-accent; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; }
      .cmp { display: flex; align-items: center; gap: 8rpx; margin-top: 10rpx;
        .hint { font-size: 20rpx; color: $wa-muted; }
        .pct { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
        &.up .pct { color: $wa-success; }
        &.down .pct { color: $wa-danger; } } } }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 24rpx; margin-bottom: 20rpx;
    .secrow { display: flex; align-items: center; justify-content: space-between;
      .sec { margin-bottom: 0; }
      .expo { font-size: 24rpx; color: $wa-accent; } }
    .sec { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }

    .tmeta { display: flex; align-items: center; gap: 20rpx; margin-bottom: 16rpx;
      .tm { font-size: 22rpx; color: $wa-muted;
        &.on { color: $wa-accent; font-weight: 600; } } }
    .chart { display: flex; align-items: flex-end;
      .col { flex: 1; display: flex; flex-direction: column; align-items: center;
        .track { width: 70%; height: 200rpx; display: flex; align-items: flex-end; justify-content: center; }
        .bar { width: 100%; background: rgba(255, 102, 0, 0.55); border-radius: 6rpx 6rpx 0 0;
          &.on { background: $wa-accent; } }
        .xl { height: 20rpx; line-height: 20rpx; font-size: 18rpx; color: $wa-muted; margin-top: 8rpx; } } }
    .lg { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx;
      .lg-item { display: flex; align-items: center; gap: 8rpx; font-size: 20rpx; color: $wa-muted;
        .dot { width: 12rpx; height: 12rpx; border-radius: 2rpx; background: $wa-accent; } }
      .lg-tip { flex: 1; text-align: right; font-size: 20rpx; color: $wa-muted; } }

    .qhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx;
      .ax { font-size: 20rpx; color: $wa-muted; } }
    .quad { position: relative; width: 100%; padding-bottom: 50%; background: $wa-bg; border-radius: $wa-radius; overflow: hidden;
      .quad-in { position: absolute; left: 0; top: 0; right: 0; bottom: 0; }
      .vline { position: absolute; top: 0; bottom: 0; width: 1rpx; background: $wa-muted; opacity: 0.6; }
      .hline { position: absolute; left: 0; right: 0; height: 1rpx; background: $wa-muted; opacity: 0.6; }
      .ql { position: absolute; font-size: 20rpx; font-weight: 600;
        &.tl { left: 10rpx; top: 8rpx; }
        &.tr { right: 10rpx; top: 8rpx; }
        &.bl { left: 10rpx; bottom: 8rpx; }
        &.br { right: 10rpx; bottom: 8rpx; }
        &.star { color: $wa-accent; }
        &.traffic { color: #2563eb; }
        &.premium { color: #16a34a; }
        &.slow { color: $wa-muted; } }
      .pt { position: absolute; width: 16rpx; height: 16rpx; border-radius: 999rpx; transform: translate(-50%, 50%);
        background: $wa-muted;
        &.star { background: $wa-accent; }
        &.traffic { background: #2563eb; }
        &.premium { background: #16a34a; }
        &.slow { background: #b0b0b0; } } }

    .thead { display: flex; padding: 8rpx 0 12rpx; border-bottom: 1rpx solid $wa-rule;
      .hname { flex: 1; font-size: 22rpx; color: $wa-muted; }
      .hqty { width: 100rpx; font-size: 22rpx; color: $wa-muted; text-align: right; }
      .hgmv { width: 170rpx; font-size: 22rpx; color: $wa-muted; text-align: right; }
      .hquad { width: 100rpx; font-size: 22rpx; color: $wa-muted; text-align: right; } }
    .prow { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .pname { flex: 1; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
      .pqty { width: 100rpx; font-size: 24rpx; color: $wa-ink; text-align: right; }
      .pgmv { width: 170rpx; font-size: 24rpx; color: $wa-ink; text-align: right; }
      .pquad { width: 100rpx; font-size: 22rpx; text-align: right; font-weight: 600;
        &.star { color: $wa-accent; }
        &.traffic { color: #2563eb; }
        &.premium { color: #16a34a; }
        &.slow { color: $wa-muted; } } }

    .crow { display: flex; align-items: center; padding: 14rpx 0;
      .cname { width: 130rpx; font-size: 24rpx; color: $wa-muted; }
      .cbar { flex: 1; height: 16rpx; background: $wa-bg; border-radius: 8rpx; margin-right: 16rpx; overflow: hidden;
        .cfill { height: 100%; background: $wa-accent; border-radius: 8rpx; } }
      .cval { width: 150rpx; display: flex; align-items: baseline; justify-content: flex-end; gap: 10rpx;
        .ccnt { font-size: 24rpx; color: $wa-ink; font-weight: 600; }
        .cpct { font-size: 22rpx; color: $wa-muted; } } } }

  .muted { display: block; text-align: center; color: $wa-muted; font-size: 26rpx; padding: 30rpx 0; }
  .err { display: block; text-align: center; color: $wa-danger; font-size: 24rpx; padding: 12rpx 0;
    .retry { color: $wa-accent; margin-left: 12rpx; } }
}
</style>
