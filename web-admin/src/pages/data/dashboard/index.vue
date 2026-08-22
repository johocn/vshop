<template>
  <view class="page">
    <view class="stat">
      <view class="stat-card">
        <text class="num">{{ ov ? ov.orderCount : '—' }}</text>
        <text class="lbl">今日订单</text>
      </view>
      <view class="stat-card">
        <text class="num">{{ ov ? '¥' + (ov.revenue / 100).toFixed(2) : '—' }}</text>
        <text class="lbl">今日销售额</text>
      </view>
      <view class="stat-card">
        <text class="num">{{ ov ? ov.lowStock : '—' }}</text>
        <text class="lbl">库存预警</text>
      </view>
    </view>
    <text class="muted plan">（趋势图 / 商品排行接入 dashboard 插件后补）</text>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
// 数据看板概览（Task 10）：今日订单 / 今日销售额 / 库存预警
// 统计源见 src/apis/stats.ts（orders createdAt 过滤 + stockLevels 低库存计数，均实测校准）。
// 加载失败或统计源不可用时显示 "—"，不硬编码 0 假装有数据。
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchTodayOverview, type TodayOverview } from '../../../apis/stats';

const ov = ref<TodayOverview | null>(null);
onMounted(async () => {
  try {
    ov.value = await fetchTodayOverview();
  } catch (e) {
    console.error('fetchTodayOverview failed', e);
    ov.value = null;
  }
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .stat { display: flex; gap: 20rpx; margin-bottom: 24rpx;
    .stat-card { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 16rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-accent; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; }
    }
  }
  .plan { display: block; font-size: 24rpx; color: $wa-muted; text-align: center; margin-top: 24rpx; }
}
</style>
