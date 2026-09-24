<template>
  <!-- 任务卡片：任务号 / 仓 / 状态徽标 / 进度条 / 盘次进度 / 圈范围徽标 / 过账单据 -->
  <view class="tcard" @tap="emit('open')">
    <view class="top">
      <text class="code">{{ task.code }}</text>
      <text class="st" :class="stateClass">{{ $t('stocktake.state.' + task.state) }}</text>
    </view>
    <view class="mid">
      <text class="wh">{{ task.locationName || '—' }}</text>
      <text class="cnt">{{ $t('stocktake.board.progress').replace('{done}', String(p.counted)).replace('{total}', String(p.expected)) }}</text>
    </view>
    <view class="bar"><view class="fill" :style="{ width: p.percent + '%' }" /></view>
    <view class="foot">
      <text class="nm">{{ task.name }}</text>
      <text class="sc">{{ scopeText }}</text>
      <text class="wv">{{ $t('stocktake.board.waves').replace('{done}', String(task.submittedWaveCount)).replace('{total}', String(task.waveCount)) }}</text>
    </view>
    <view v-if="task.postedStockDocId" class="doc">
      {{ $t('stocktake.board.postedDoc').replace('{code}', String(task.postedStockDocId)) }}
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { StocktakeTask } from '../../apis/stocktake';
import { parseScopeJson, scopeBadges, taskProgress } from '../../utils/stocktake-grid';

const props = defineProps<{ task: StocktakeTask }>();
const emit = defineEmits<{ (e: 'open'): void }>();

const p = computed(() => taskProgress(props.task));

// 圈范围徽标（Z:2 / C:1 / V:3 / ALL）：坏 JSON 由 parseScopeJson 容错退回默认
const scopeText = computed(() => scopeBadges(parseScopeJson(props.task.scopeJson)).join(' '));

// 状态 → 徽标配色（状态机六值固定，见规格 §5）
const stateClass = computed(() => {
  switch (props.task.state) {
    case 'POSTED': return 'ok';
    case 'COUNTED': return 'ready';
    case 'CANCELLED': return 'dead';
    case 'COUNTING': return 'doing';
    default: return 'idle';
  }
});
</script>

<style lang="scss" scoped>
.tcard {
  background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx;
  .top { display: flex; align-items: center;
    .code { flex: 1; font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-muted;
      &.idle { background: $wa-muted; }
      &.doing { background: $wa-accent; }
      &.ready { background: $wa-ink; }
      &.ok { background: $wa-success; }
      &.dead { background: $wa-muted; }
    }
  }
  .mid { display: flex; align-items: center; margin-top: 14rpx;
    .wh { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .cnt { font-size: 24rpx; color: $wa-muted; }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin-top: 14rpx; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; border-radius: 6rpx; }
  }
  .foot { display: flex; align-items: center; margin-top: 12rpx;
    .nm { flex: 1; font-size: 23rpx; color: $wa-muted; }
    .sc { font-size: 20rpx; color: $wa-muted; background: $wa-bg; border-radius: 6rpx; padding: 2rpx 12rpx; margin-right: 12rpx; }
    .wv { font-size: 23rpx; color: $wa-muted; }
  }
  .doc { margin-top: 10rpx; font-size: 22rpx; color: $wa-success; }
}
</style>