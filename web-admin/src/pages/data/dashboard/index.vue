<template>
  <view class="page">
    <!-- 视图分段：经营数据（既有卡片）/ 作业分析（长期报表）。两视图共用下方 7/30 天分段，不新增路由与侧边栏项 -->
    <view class="seg views">
      <view class="seg-item" :class="{ on: view === 'biz' }" @tap="view = 'biz'">{{ $t('dataDashboard.view.biz') }}</view>
      <view class="seg-item" :class="{ on: view === 'ops' }" @tap="switchOps">{{ $t('dataDashboard.view.ops') }}</view>
    </view>

    <view class="seg">
      <view class="seg-item" :class="{ on: days === 7 }" @tap="switchDays(7)">{{ $t('dataDashboard.near7') }}</view>
      <view class="seg-item" :class="{ on: days === 30 }" @tap="switchDays(30)">{{ $t('dataDashboard.near30') }}</view>
    </view>

    <template v-if="view === 'biz'">
      <view class="stat">
        <view class="stat-card">
          <text class="num">{{ ov ? ov.orderCount : '—' }}</text>
          <text class="lbl">{{ $t('dataDashboard.todayOrders') }}</text>
        </view>
        <view class="stat-card">
          <text class="num">{{ ov ? '¥' + (ov.revenue / 100).toFixed(2) : '—' }}</text>
          <text class="lbl">{{ $t('dataDashboard.todayRevenue') }}</text>
        </view>
        <view class="stat-card">
          <text class="num">{{ ov ? ov.lowStock : '—' }}</text>
          <text class="lbl">{{ $t('dataDashboard.lowStock') }}</text>
        </view>
      </view>

      <view class="card">
        <text class="sec">{{ days === 7 ? $t('dataDashboard.salesTrend') : $t('dataDashboard.salesTrend30') }}</text>
        <TrendChart :points="trend" />
      </view>

      <view class="card">
        <text class="sec">{{ days === 7 ? $t('dataDashboard.topTitle') : $t('dataDashboard.topTitle30') }}</text>
        <view v-if="topList.length" class="top">
          <view class="top-row" v-for="(t, i) in topList" :key="t.categoryId">
            <text class="rank" :class="{ hot: i < 3 }">{{ i + 1 }}</text>
            <text class="name">{{ t.categoryName || $t('dataDashboard.uncategorized') }}</text>
            <text class="cnt">{{ t.orderCount }} {{ $t('dataDashboard.orderUnit') }}</text>
            <text class="qty">{{ t.quantity ?? '−' }}</text>
            <text class="gmv">¥{{ (t.gmv / 100).toFixed(0) }}</text>
          </view>
        </view>
        <text v-else class="muted">{{ $t('dataDashboard.empty') }}</text>
      </view>

      <view class="card">
        <text class="sec">{{ $t('dataDashboard.inventoryHealth') }}</text>
        <view class="health">
          <view class="health-cell">
            <text class="num">{{ ov ? ov.lowStock : '—' }}</text>
            <text class="lbl">{{ $t('dataDashboard.lowStock') }}</text>
          </view>
          <view class="health-cell">
            <text class="num">{{ inv ? inv.outOfStock : '−' }}</text>
            <text class="lbl">{{ $t('dataDashboard.outOfStock') }}</text>
          </view>
          <view class="health-cell">
            <text class="num">{{ inv ? inv.totalSku : '−' }}</text>
            <text class="lbl">{{ $t('dataDashboard.totalSku') }}</text>
          </view>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="stat">
        <view class="stat-card">
          <text class="num">{{ opsNum(ops.pickCount) }}</text>
          <text class="lbl">{{ $t('dataDashboard.ops.pickCount') }}</text>
        </view>
        <view class="stat-card">
          <text class="num">{{ opsNum(ops.shippedItems) }}</text>
          <text class="lbl">{{ $t('dataDashboard.ops.shippedItems') }}</text>
        </view>
      </view>
      <view class="stat">
        <view class="stat-card">
          <text class="num">{{ opsNum(ops.stocktakeCount) }}</text>
          <text class="lbl">{{ $t('dataDashboard.ops.stocktakeCount') }}</text>
        </view>
        <view class="stat-card">
          <text class="num">{{ ops.rate === null ? '—' : ops.rate + '%' }}</text>
          <text class="lbl">{{ $t('dataDashboard.ops.varianceRate') }}</text>
        </view>
      </view>

      <!-- 盘点差异趋势：页面内轻量条状行（与导出 CSV 同源同值；不复用经营视图的 GMV 双线组件） -->
      <view class="card">
        <text class="sec">{{ $t('dataDashboard.ops.varianceTrend') }}</text>
        <text class="hint">{{ $t('dataDashboard.ops.trendHint') }}</text>
        <view v-for="r in varRows" :key="r.day" class="trow">
          <text class="tday">{{ r.day }}</text>
          <view class="tbar"><view class="tfill" :style="{ width: barWidth(r) }" /></view>
          <text class="tval">{{ r.diff }} / {{ r.expected }}</text>
        </view>
      </view>

      <view class="card">
        <text class="sec">{{ $t('dataDashboard.ops.byCounter') }}</text>
        <view v-for="c in ops.byCounter" :key="c.operator" class="top-row">
          <text class="name">{{ c.operator || $t('dataDashboard.ops.unknownOperator') }}</text>
          <text class="cnt">{{ c.count }} {{ $t('dataDashboard.ops.rowCount') }}</text>
          <text class="qty">{{ c.qty }} {{ $t('dataDashboard.ops.rowQty') }}</text>
        </view>
        <text v-if="!ops.byCounter.length" class="muted">{{ $t('dataDashboard.empty') }}</text>
      </view>

      <view class="card">
        <text class="exp" @tap="exportCsv">{{ $t('dataDashboard.ops.exportCsv') }}</text>
      </view>
    </template>

    <view style="height: 140rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
// 数据看板：经营数据（KPI + 销售趋势 + Top 榜 + 库存健康）与作业分析（长期报表）两视图，共用 7/30 天分段。
// 经营视图统计源：operations-plugin dashboardOverview / salesTrend / categoryTop；库存健康 lowStock 取 dashboardOverview、
// outOfStock / totalSku 取 stockLevels（缺数据不伪造，显示 "−"）。
// 作业视图口径见 docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §7.3，聚合逻辑为 utils/ops-report.ts 纯函数。
// 任一接口失败时对应 KPI 显示 "—"（不使用 0 假装有数据）。
import { computed, ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import TrendChart from '../../../components/TrendChart.vue';
import { fetchTodayOverview, type TodayOverview } from '../../../apis/stats';
import { fetchSalesTrend, fetchCategoryTop, type TrendPoint, type CategoryTopRow } from '../../../apis/operations';
import { fetchInventoryHealth, type InventoryHealth } from '../../../apis/inventory';
import { fetchPickBatches } from '../../../apis/picking';
import { fetchStocktakeTasks, fetchStocktakeDiff, type StocktakeDiff } from '../../../apis/stocktake';
import { fetchOrders } from '../../../apis/order';
import { fetchStockDocOperatorStats } from '../../../apis/stock-doc';
import { buildOrderFilter } from '../../../utils/orderFilter';
import { downloadCsv } from '../../../utils/csv';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  buildOpsWindow,
  countBatches,
  countStocktakeTasks,
  inWindow,
  sumShippedItems,
  varianceRate,
  varianceTrend,
  ymd,
  type CounterRow,
  type TrendPointRow,
} from '../../../utils/ops-report';

const locale = useLocaleStore();

const ov = ref<TodayOverview | null>(null);
const trend = ref<TrendPoint[]>([]);
const topList = ref<CategoryTopRow[]>([]);
const inv = ref<InventoryHealth | null>(null);
const days = ref<7 | 30>(7);

const view = ref<'biz' | 'ops'>('biz');

// 已发货族订单状态（含部分发货/已送达族，与「发货件数」口径一致）
const SHIPPED_ORDER_STATES = ['Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered'];

interface OpsState {
  /** null = 该数据源拉取失败，页面显示 "—"（不伪造 0） */
  pickCount: number | null;
  shippedItems: number | null;
  stocktakeCount: number | null;
  /** 百分比两位小数字符串；null = 数据源失败 */
  rate: string | null;
  byCounter: CounterRow[];
}

/** 作业视图 KPI 状态：null → 渲染 "—" */
const ops = ref<OpsState>({ pickCount: null, shippedItems: null, stocktakeCount: null, rate: null, byCounter: [] });
/** 差异趋势原始行（页面条状行与 CSV 导出同源同值） */
const varRows = ref<TrendPointRow[]>([]);

const trendMax = computed(() => varRows.value.reduce((m, r) => Math.max(m, r.diff), 0));

async function loadDynamic() {
  try { trend.value = await fetchSalesTrend(days.value); } catch (e) { console.error('fetchSalesTrend failed', e); trend.value = []; }
  try { topList.value = await fetchCategoryTop(days.value); } catch (e) { console.error('fetchCategoryTop failed', e); topList.value = []; }
}

/** 切换 7/30 天：两个视图共用，按当前视图各自重载 */
function switchDays(d: 7 | 30): void {
  if (days.value === d) return;
  days.value = d;
  if (view.value === 'biz') loadDynamic();
  else loadOps();
}

async function loadOps(): Promise<void> {
  const w = buildOpsWindow(days.value);

  // ① 拣货单数：统计期内已完成的拣货批次数（按批次 createdAt 归期）
  let pickCount: number | null = null;
  try {
    const batches = await fetchPickBatches({ pageSize: 100 });
    pickCount = countBatches(batches.items, w);
  } catch (e) { console.error('ops batches failed', e); }

  // ② 发货件数：统计期内已发货族订单的 totalQuantity 合计（按订单 createdAt 归期，分页累加上限 10 页 = 1000 单）
  let shippedItems: number | null = null;
  try {
    const filter = buildOrderFilter({
      states: SHIPPED_ORDER_STATES,
      time: { key: 'custom', from: ymd(w.start), to: ymd(new Date(w.end.getTime() - 1)) },
    });
    const acc: Array<{ totalQuantity?: number | null }> = [];
    for (let page = 1; page <= 10; page++) {
      const r = await fetchOrders({ take: 100, skip: (page - 1) * 100, filter });
      acc.push(...r.items);
      if (acc.length >= r.totalItems || !r.items.length) break;
    }
    shippedItems = sumShippedItems(acc);
  } catch (e) { console.error('ops orders failed', e); }

  // ③④ 盘库次数 + 差异率 + 差异趋势：逐任务取差异，单任务失败不阻塞整表
  let stocktakeCount: number | null = null;
  let rate: string | null = null;
  let rows: TrendPointRow[] = [];
  try {
    const tasks = await fetchStocktakeTasks({ pageSize: 100 });
    stocktakeCount = countStocktakeTasks(tasks.items, w);
    const scoped = tasks.items.filter(
      (t) => ['SUBMITTED', 'POSTED'].includes(String(t.state)) && inWindow(t.createdAt, w),
    );
    const pairs: Array<{ createdAt: string; diff: StocktakeDiff }> = [];
    for (const t of scoped) {
      try { pairs.push({ createdAt: t.createdAt, diff: await fetchStocktakeDiff(t.id) }); } catch { /* 单任务失败不阻塞整表 */ }
    }
    rate = varianceRate(pairs.map((p) => p.diff)).rate;
    rows = varianceTrend(pairs, w);
  } catch (e) { console.error('ops stocktake failed', e); }

  // ⑤ 作业员明细：服务端按操作人聚合（D46），无「最近 100 条」窗口上限
  // 口径（排除 STOCKTAKE）已随之下沉到 SQL，见 stockDocOperatorStats 的实现注释
  let byCounter: CounterRow[] = [];
  try {
    const stats = await fetchStockDocOperatorStats({
      from: w.start.toISOString(),
      to: new Date(w.end.getTime() - 1).toISOString(),
    });
    byCounter = stats.map((s) => ({ operator: s.operator, count: s.count, qty: s.qty }));
  } catch (e) { console.error('ops docs failed', e); }

  ops.value = { pickCount, shippedItems, stocktakeCount, rate, byCounter };
  varRows.value = rows;
}

function switchOps(): void {
  if (view.value === 'ops') return;
  view.value = 'ops';
  loadOps();
}

/** number | null → 字符串；null 渲染为 "—" */
function opsNum(v: number | null): string {
  return v === null ? '—' : String(v);
}

/** 差异条宽度：按窗口内最大差异归一；0 差异不画条（不伪造最小长度） */
function barWidth(r: TrendPointRow): string {
  if (trendMax.value <= 0 || r.diff <= 0) return '0%';
  return `${Math.max(2, Math.round((r.diff / trendMax.value) * 100))}%`;
}

function exportCsv(): void {
  downloadCsv(
    `ops-report-${days.value}d-${ymd(new Date())}.csv`,
    [locale.t('dataDashboard.ops.csvDay'), locale.t('dataDashboard.ops.csvExpected'), locale.t('dataDashboard.ops.csvDiff')],
    varRows.value.map((r) => [r.day, String(r.expected), String(r.diff)]),
  );
}

onMounted(async () => {
  try { ov.value = await fetchTodayOverview(); } catch (e) { console.error('fetchTodayOverview failed', e); ov.value = null; }
  try { inv.value = await fetchInventoryHealth(); } catch (e) { console.error('fetchInventoryHealth failed', e); inv.value = null; }
  await loadDynamic();
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .stat { display: flex; gap: 20rpx; margin-bottom: 24rpx;
    .stat-card { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 16rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-accent; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; } } }
  .seg { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .seg-item { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius; background: $wa-card; font-size: 26rpx; color: $wa-muted;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; } }
    &.views { margin-bottom: 16rpx; } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 24rpx; margin-bottom: 20rpx;
    .sec { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .hint { display: block; font-size: 22rpx; color: $wa-muted; margin: -10rpx 0 16rpx; }
    .top-row { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .rank { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 8rpx; font-size: 24rpx; color: $wa-muted; background: $wa-rule; margin-right: 16rpx;
        &.hot { background: $wa-accent; color: #fff; font-weight: 700; } }
      .name { flex: 1; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
      .cnt { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
      .qty { font-size: 22rpx; color: $wa-ink; font-weight: 600; margin-right: 20rpx; }
      .gmv { font-size: 26rpx; color: $wa-danger; font-weight: 600; } }
    .trow { display: flex; align-items: center; padding: 8rpx 0;
      .tday { width: 150rpx; font-size: 22rpx; color: $wa-muted; }
      .tbar { flex: 1; height: 16rpx; background: $wa-bg; border-radius: 8rpx; margin-right: 16rpx; overflow: hidden;
        .tfill { height: 100%; background: $wa-danger; border-radius: 8rpx; } }
      .tval { font-size: 22rpx; color: $wa-ink; } }
    .exp { display: block; text-align: center; font-size: 28rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; padding: 22rpx 0; } }
  .health { display: flex; gap: 20rpx;
    .health-cell { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 28rpx 12rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-ink; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; } } }
  .muted { display: block; text-align: center; color: $wa-muted; font-size: 26rpx; padding: 40rpx 0; }
}
</style>