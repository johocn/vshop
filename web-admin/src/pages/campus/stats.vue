<template>
  <view class="page">
    <view class="seg">
      <view class="seg-item" :class="{ on: range === 'today' }" @tap="switchRange('today')">{{ $t('campusStats.range.today') }}</view>
      <view class="seg-item" :class="{ on: range === '7d' }" @tap="switchRange('7d')">{{ $t('campusStats.range.near7') }}</view>
      <view class="seg-item" :class="{ on: range === '30d' }" @tap="switchRange('30d')">{{ $t('campusStats.range.near30') }}</view>
    </view>

    <!-- KPI 2×2 -->
    <view class="stat">
      <view class="stat-card">
        <text class="num">{{ loaded ? stats.kpis.totalOrders : '—' }}</text>
        <text class="lbl">{{ $t('campusStats.kpi.orders') }}</text>
      </view>
      <view class="stat-card">
        <text class="num">{{ loaded ? stats.kpis.onTimeRate + '%' : '—' }}</text>
        <text class="lbl">{{ $t('campusStats.kpi.onTime') }}</text>
      </view>
    </view>
    <view class="stat">
      <view class="stat-card">
        <text class="num">{{ loaded ? stats.kpis.avgDeliveryMinutes + $t('campusStats.unit.min') : '—' }}</text>
        <text class="lbl">{{ $t('campusStats.kpi.avgDelivery') }}</text>
      </view>
      <view class="stat-card">
        <text class="num">{{ loaded ? stats.kpis.timeoutCompensated : '—' }}</text>
        <text class="lbl">{{ $t('campusStats.kpi.compensated') }}</text>
      </view>
    </view>

    <!-- 单量 + 准点率趋势 -->
    <view class="card">
      <text class="sec">{{ $t('campusStats.trend.title') }}</text>
      <CampusStatsChart v-if="loaded" canvas-id="campusStatsChart" :points="stats.dailyTrend" />
    </view>

    <!-- 环节耗时（接单/在途两段，无出餐时间戳不伪造） -->
    <view class="card">
      <text class="sec">{{ $t('campusStats.stages.title') }}</text>
      <view v-for="s in stats.stages" :key="s.key" class="trow">
        <text class="tday">{{ $t('campusStats.stages.' + s.key) }}</text>
        <view class="tbar"><view class="tfill" :style="{ width: stageWidth(s.avgMinutes) }" /></view>
        <text class="tval">{{ s.avgMinutes }}{{ $t('campusStats.unit.min') }}</text>
      </view>
    </view>

    <!-- 超时归因 -->
    <view class="card">
      <text class="sec">{{ $t('campusStats.attribution.title') }}</text>
      <template v-if="attrTotal > 0">
        <view v-for="a in attrRows" :key="a.key" class="trow">
          <text class="tday">{{ $t('campusStats.attribution.' + a.key) }}</text>
          <view class="tbar"><view class="tfill" :class="a.key" :style="{ width: attrWidth(a.count) }" /></view>
          <text class="tval">{{ a.count }}</text>
        </view>
      </template>
      <text v-else class="muted">{{ $t('campusStats.attribution.none') }}</text>
    </view>

    <!-- 店铺准点对比 -->
    <view class="card">
      <text class="sec">{{ $t('campusStats.stores.title') }}</text>
      <view v-if="stats.storeComparison.length" class="thead">
        <text class="hname">{{ $t('campusStats.stores.colStore') }}</text>
        <text class="hcnt">{{ $t('campusStats.stores.colOrders') }}</text>
        <text class="hqty">{{ $t('campusStats.stores.colOnTime') }}</text>
      </view>
      <view v-if="stats.storeComparison.length" class="top">
        <view v-for="s in stats.storeComparison" :key="s.channelId" class="top-row">
          <text class="name">{{ s.channelName }}</text>
          <text class="cnt">{{ s.orders }}</text>
          <text class="qty" :class="{ bad: s.onTimeRate < 80 }">{{ s.onTimeRate }}%</text>
        </view>
      </view>
      <text v-else class="muted">{{ $t('campusStats.stores.empty') }}</text>
    </view>

    <text v-if="err" class="err">{{ err }} <text class="retry" @tap="load">{{ $t('campusStats.retry') }}</text></text>
    <view style="height: 40rpx" />
  </view>
</template>

<script lang="ts" setup>
// 配送数据看板（方案 A）：跨店铺聚合 campusDeliveryStats，今日/7日/30日三档窗口。
// 口径：准点率=deliveredAt ≤ promisedAt+各店 grace；环节耗时=接单/在途两段（无出餐时间戳不伪造数据段）。
import { computed, ref } from 'vue';
import CampusStatsChart from '../../components/CampusStatsChart.vue';
import { campusDeliveryStats, type CampusDeliveryStats } from '../../apis/campus';

const range = ref<'today' | '7d' | '30d'>('7d');
const loaded = ref(false);
const err = ref('');
const stats = ref<CampusDeliveryStats>({
  range: '7d',
  windowStart: '',
  kpis: { totalOrders: 0, onTimeRate: 0, avgDeliveryMinutes: 0, timeoutCompensated: 0 },
  dailyTrend: [],
  stages: [],
  attribution: { merchant: 0, rider: 0, platform: 0 },
  storeComparison: [],
});

async function load(): Promise<void> {
  err.value = '';
  try {
    stats.value = await campusDeliveryStats(range.value);
    loaded.value = true;
  } catch (e) {
    console.error('campusDeliveryStats failed', e);
    loaded.value = false;
    err.value = String(e?.message || e).slice(0, 120);
  }
}

function switchRange(r: 'today' | '7d' | '30d'): void {
  if (range.value === r) return;
  range.value = r;
  load();
}

const stageMax = computed(() => stats.value.stages.reduce((m, s) => Math.max(m, s.avgMinutes), 0));
function stageWidth(v: number): string {
  if (stageMax.value <= 0 || v <= 0) return '0%';
  return `${Math.max(2, Math.round((v / stageMax.value) * 100))}%`;
}

const attrTotal = computed(
  () => stats.value.attribution.merchant + stats.value.attribution.rider + stats.value.attribution.platform,
);
const attrRows = computed(() => [
  { key: 'merchant', count: stats.value.attribution.merchant },
  { key: 'rider', count: stats.value.attribution.rider },
  { key: 'platform', count: stats.value.attribution.platform },
]);
function attrWidth(v: number): string {
  const max = Math.max(...attrRows.value.map((r) => r.count), 1);
  if (v <= 0) return '0%';
  return `${Math.max(2, Math.round((v / max) * 100))}%`;
}

load();
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 40rpx;
  .seg { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .seg-item { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius; background: $wa-card; font-size: 26rpx; color: $wa-muted;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; } } }
  .stat { display: flex; gap: 20rpx; margin-bottom: 20rpx;
    .stat-card { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 16rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-accent; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 24rpx; margin-bottom: 20rpx;
    .sec { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .trow { display: flex; align-items: center; padding: 10rpx 0;
      .tday { width: 120rpx; font-size: 24rpx; color: $wa-muted; }
      .tbar { flex: 1; height: 16rpx; background: $wa-bg; border-radius: 8rpx; margin-right: 16rpx; overflow: hidden;
        .tfill { height: 100%; background: $wa-accent; border-radius: 8rpx;
          &.merchant { background: #ff6600; }
          &.rider { background: #2563eb; }
          &.platform { background: #999; } } }
      .tval { font-size: 24rpx; color: $wa-ink; } }
    .thead { display: flex; padding: 8rpx 0 12rpx; border-bottom: 1rpx solid $wa-rule;
      .hname { flex: 1; font-size: 22rpx; color: $wa-muted; }
      .hcnt { width: 140rpx; font-size: 22rpx; color: $wa-muted; text-align: right; }
      .hqty { width: 140rpx; font-size: 22rpx; color: $wa-muted; text-align: right; } }
    .top-row { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .name { flex: 1; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
      .cnt { width: 140rpx; font-size: 24rpx; color: $wa-ink; text-align: right; margin-right: 0; }
      .qty { width: 140rpx; font-size: 24rpx; color: $wa-ink; font-weight: 600; text-align: right;
        &.bad { color: $wa-danger; } } } }
  .muted { display: block; text-align: center; color: $wa-muted; font-size: 26rpx; padding: 30rpx 0; }
  .err { display: block; text-align: center; color: $wa-danger; font-size: 24rpx; padding: 12rpx 0;
    .retry { color: $wa-accent; margin-left: 12rpx; } }
}
</style>
