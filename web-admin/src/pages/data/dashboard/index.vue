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

    <view class="seg">
      <view
        class="seg-item"
        :class="{ on: days === 7 }"
        @tap="days = 7; loadDynamic()"
      >{{ $t('dataDashboard.near7') }}</view>
      <view
        class="seg-item"
        :class="{ on: days === 30 }"
        @tap="days = 30; loadDynamic()"
      >{{ $t('dataDashboard.near30') }}</view>
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

    <view style="height: 140rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
// 数据看板完整版：今日概览（KPI）+ 近 7/30 日销售趋势（canvas 双线）+ 销量 Top 榜（品类）+ 库存健康卡。
// 统计源：operations-plugin dashboardOverview / salesTrend / categoryTop（已支付口径）。
// 库存健康：lowStock 取自 dashboardOverview.inventory；outOfStock / totalSku 取自 stockLevels
// （fetchInventoryHealth，默认仓，缺数据时前端不伪造，显示 "−"）。
// 任一接口失败时对应区块显示 "—"/空，不硬编码 0 假装有数据。
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import TrendChart from '../../../components/TrendChart.vue';
import { fetchTodayOverview, type TodayOverview } from '../../../apis/stats';
import { fetchSalesTrend, fetchCategoryTop, type TrendPoint, type CategoryTopRow } from '../../../apis/operations';
import { fetchInventoryHealth, type InventoryHealth } from '../../../apis/inventory';

const ov = ref<TodayOverview | null>(null);
const trend = ref<TrendPoint[]>([]);
const topList = ref<CategoryTopRow[]>([]);
const inv = ref<InventoryHealth | null>(null);
const days = ref<7 | 30>(7);

async function loadDynamic() {
  try { trend.value = await fetchSalesTrend(days.value); } catch (e) { console.error('fetchSalesTrend failed', e); trend.value = []; }
  try { topList.value = await fetchCategoryTop(days.value); } catch (e) { console.error('fetchCategoryTop failed', e); topList.value = []; }
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
      &.on { background: $wa-accent; color: #fff; font-weight: 600; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 24rpx; margin-bottom: 20rpx;
    .sec { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .top-row { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .rank { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 8rpx; font-size: 24rpx; color: $wa-muted; background: $wa-rule; margin-right: 16rpx;
        &.hot { background: $wa-accent; color: #fff; font-weight: 700; } }
      .name { flex: 1; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
      .cnt { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
      .qty { font-size: 22rpx; color: $wa-ink; font-weight: 600; margin-right: 20rpx; }
      .gmv { font-size: 26rpx; color: $wa-danger; font-weight: 600; } } }
  .health { display: flex; gap: 20rpx;
    .health-cell { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 28rpx 12rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-ink; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; } } }
  .muted { display: block; text-align: center; color: $wa-muted; font-size: 26rpx; padding: 40rpx 0; }
}
</style>