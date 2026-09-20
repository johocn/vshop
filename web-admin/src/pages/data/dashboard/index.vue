<template>
  <view class="page">
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
      <text class="sec">{{ $t('dataDashboard.salesTrend') }}</text>
      <TrendChart :points="trend" />
    </view>

    <view class="card">
      <text class="sec">{{ $t('dataDashboard.topTitle') }}</text>
      <view v-if="topList.length" class="top">
        <view class="top-row" v-for="(t, i) in topList" :key="t.categoryId">
          <text class="rank" :class="{ hot: i < 3 }">{{ i + 1 }}</text>
          <text class="name">{{ t.categoryName || $t('dataDashboard.uncategorized') }}</text>
          <text class="cnt">{{ t.orderCount }} {{ $t('dataDashboard.orderUnit') }}</text>
          <text class="gmv">¥{{ (t.gmv / 100).toFixed(0) }}</text>
        </view>
      </view>
      <text v-else class="muted">{{ $t('dataDashboard.empty') }}</text>
    </view>

    <view style="height: 140rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
// 数据看板完整版：今日概览（KPI）+ 近 7 日销售趋势（canvas 双线）+ 销量 Top 榜（品类）
// 统计源：operations-plugin dashboardOverview / salesTrend / categoryTop（已支付口径）。
// 任一接口失败时对应区块显示 "—"/空，不硬编码 0 假装有数据。
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import TrendChart from '../../../components/TrendChart.vue';
import { fetchTodayOverview, type TodayOverview } from '../../../apis/stats';
import { fetchSalesTrend, fetchCategoryTop, type TrendPoint, type CategoryTopRow } from '../../../apis/operations';

const ov = ref<TodayOverview | null>(null);
const trend = ref<TrendPoint[]>([]);
const topList = ref<CategoryTopRow[]>([]);

onMounted(async () => {
  try { ov.value = await fetchTodayOverview(); } catch (e) { console.error('fetchTodayOverview failed', e); ov.value = null; }
  try { trend.value = await fetchSalesTrend(7); } catch (e) { console.error('fetchSalesTrend failed', e); trend.value = []; }
  try { topList.value = await fetchCategoryTop(7); } catch (e) { console.error('fetchCategoryTop failed', e); topList.value = []; }
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .stat { display: flex; gap: 20rpx; margin-bottom: 24rpx;
    .stat-card { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 16rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-accent; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 24rpx; margin-bottom: 20rpx;
    .sec { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .top-row { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .rank { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 8rpx; font-size: 24rpx; color: $wa-muted; background: $wa-rule; margin-right: 16rpx;
        &.hot { background: $wa-accent; color: #fff; font-weight: 700; } }
      .name { flex: 1; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
      .cnt { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
      .gmv { font-size: 26rpx; color: $wa-danger; font-weight: 600; } } }
  .muted { display: block; text-align: center; color: $wa-muted; font-size: 26rpx; padding: 40rpx 0; }
}
</style>
