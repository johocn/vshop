<template>
  <view class="page">
    <view class="head">
      <text class="title">{{ $t('campusMonitor.title') }}</text>
      <text class="sub">{{ $t('campusMonitor.subtitle') }}</text>
    </view>

    <text v-if="loading" class="muted">{{ $t('campusMonitor.loading') }}</text>
    <text v-else-if="err" class="muted">{{ err }}</text>

    <template v-else>
      <view class="kpis">
        <view v-for="c in kpis" :key="c.key" class="kpi">
          <text class="num">{{ c.value }}</text>
          <text class="lbl">{{ $t(c.label) }}</text>
        </view>
      </view>

      <view class="card">
        <text class="sec">{{ $t('campusMonitor.trendTitle') }}</text>
        <view class="chart">
          <view v-for="p in stats.trend" :key="p.date" class="col">
            <view class="track">
              <view class="bar" :style="{ height: barHeight(p.events) }" />
            </view>
            <text class="xl">{{ p.date.slice(5) }}</text>
            <text class="xe" :class="{ on: p.errors > 0 }">{{ p.errors }}</text>
          </view>
        </view>
        <text class="hint">{{ $t('campusMonitor.trendHint') }}</text>
      </view>

      <view class="card">
        <text class="sec">{{ $t('campusMonitor.topTitle') }}</text>
        <view v-if="stats.topEvents.length">
          <view v-for="e in stats.topEvents" :key="e.name" class="trow">
            <text class="tname">{{ e.name }}</text>
            <text class="tval">{{ e.count }}</text>
          </view>
        </view>
        <text v-else class="muted">{{ $t('campusMonitor.empty') }}</text>
      </view>

      <view class="seg">
        <view class="seg-item" :class="{ on: tab === 'events' }" @tap="switchTab('events')">{{ $t('campusMonitor.tabEvents') }}</view>
        <view class="seg-item" :class="{ on: tab === 'errors' }" @tap="switchTab('errors')">{{ $t('campusMonitor.tabErrors') }}</view>
      </view>

      <template v-if="tab === 'events'">
        <view v-for="e in eventList.items" :key="e.id" class="item">
          <view class="ihead">
            <text class="iname">{{ e.eventName }}</text>
            <text class="itime">{{ fmt(e.createdAt) }}</text>
          </view>
          <text class="iline">{{ e.page || '-' }}</text>
          <text v-if="e.props" class="iprops">{{ e.props }}</text>
        </view>
        <text v-if="!eventList.items.length" class="muted">{{ $t('campusMonitor.empty') }}</text>
      </template>

      <template v-else>
        <view v-for="r in errorList.items" :key="r.id" class="item">
          <view class="ihead">
            <text class="iname" :class="r.level">{{ r.source }} · {{ r.level }}</text>
            <text class="itime">{{ fmt(r.createdAt) }}</text>
          </view>
          <text class="iline">{{ r.message }}</text>
          <text class="iline muted">{{ r.page || '-' }}</text>
          <text v-if="r.stack" class="istack">{{ r.stack }}</text>
        </view>
        <text v-if="!errorList.items.length" class="muted">{{ $t('campusMonitor.empty') }}</text>
      </template>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  fetchErrorReports,
  fetchTrackEvents,
  fetchTrackStats,
  type ErrorReportRow,
  type TrackEventRow,
  type TrackEventStats,
} from '../../apis/telemetry';
import { track } from '../../utils/telemetry';

const loading = ref(true);
const err = ref('');
const tab = ref<'events' | 'errors'>('events');
const stats = ref<TrackEventStats>({
  todayEvents: 0,
  totalEvents: 0,
  todayErrors: 0,
  totalErrors: 0,
  affectedUsers: 0,
  trend: [],
  topEvents: [],
});
const eventList = ref<{ items: TrackEventRow[]; totalItems: number }>({ items: [], totalItems: 0 });
const errorList = ref<{ items: ErrorReportRow[]; totalItems: number }>({ items: [], totalItems: 0 });

const kpis = computed(() => [
  { key: 'todayEvents', label: 'campusMonitor.kpiTodayEvents', value: stats.value.todayEvents },
  { key: 'todayErrors', label: 'campusMonitor.kpiTodayErrors', value: stats.value.todayErrors },
  { key: 'affectedUsers', label: 'campusMonitor.kpiUsers', value: stats.value.affectedUsers },
  { key: 'totalEvents', label: 'campusMonitor.kpiTotalEvents', value: stats.value.totalEvents },
]);

const maxEvents = computed(() => Math.max(1, ...stats.value.trend.map(p => p.events)));

function barHeight(n: number): string {
  const pct = Math.round((n / maxEvents.value) * 100);
  return `${Math.max(n > 0 ? 8 : 2, pct)}%`;
}

function fmt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(5, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadStats() {
  loading.value = true;
  err.value = '';
  try {
    stats.value = await fetchTrackStats();
    await loadList();
  } catch (e: any) {
    err.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
}

async function loadList() {
  try {
    if (tab.value === 'events') {
      eventList.value = await fetchTrackEvents(undefined, 0, 20);
    } else {
      errorList.value = await fetchErrorReports(undefined, 0, 20);
    }
  } catch (e: any) {
    err.value = String(e?.message || e);
  }
}

function switchTab(next: 'events' | 'errors') {
  if (tab.value === next) return;
  tab.value = next;
  track('monitor_tab_switch', { tab: next });
  void loadList();
}

onMounted(() => {
  track('monitor_open');
  void loadStats();
});
</script>

<style lang="scss" scoped>
.page {
  padding: 24rpx;
}
.head {
  padding: 8rpx 4rpx 20rpx;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  color: #1f2937;
}
.sub {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #8a94a6;
}
.muted {
  display: block;
  padding: 24rpx 4rpx;
  font-size: 26rpx;
  color: #8a94a6;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
}
.kpi {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx 12rpx;
  text-align: center;
  box-shadow: 0 2rpx 10rpx rgba(31, 41, 55, 0.05);
}
.num {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  color: #1f2937;
}
.lbl {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a94a6;
}
.card {
  margin-top: 18rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 22rpx;
  box-shadow: 0 2rpx 10rpx rgba(31, 41, 55, 0.05);
}
.sec {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16rpx;
}
.chart {
  display: flex;
  align-items: flex-end;
  gap: 10rpx;
  height: 220rpx;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}
.track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar {
  width: 60%;
  background: linear-gradient(180deg, #6ea8fe, #3b82f6);
  border-radius: 6rpx 6rpx 0 0;
  min-height: 4rpx;
}
.xl {
  margin-top: 8rpx;
  font-size: 20rpx;
  color: #8a94a6;
}
.xe {
  font-size: 20rpx;
  color: #cbd5e1;
}
.xe.on {
  color: #ef4444;
  font-weight: 600;
}
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #8a94a6;
}
.trow {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f1f5f9;
}
.tname {
  font-size: 26rpx;
  color: #334155;
}
.tval {
  font-size: 26rpx;
  font-weight: 600;
  color: #3b82f6;
}
.seg {
  display: flex;
  margin-top: 18rpx;
  background: #fff;
  border-radius: 14rpx;
  overflow: hidden;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  font-size: 26rpx;
  color: #64748b;
}
.seg-item.on {
  color: #2563eb;
  font-weight: 600;
  background: #eff6ff;
}
.item {
  margin-top: 14rpx;
  background: #fff;
  border-radius: 14rpx;
  padding: 20rpx;
  box-shadow: 0 2rpx 10rpx rgba(31, 41, 55, 0.04);
}
.ihead {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.iname {
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
}
.iname.warn {
  color: #d97706;
}
.iname.error {
  color: #dc2626;
}
.itime {
  font-size: 22rpx;
  color: #94a3b8;
}
.iline {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #475569;
  word-break: break-all;
}
.iprops {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #94a3b8;
  word-break: break-all;
}
.istack {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: #94a3b8;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
