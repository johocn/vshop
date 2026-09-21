<template>
  <view class="kpibar">
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ summary.skuCount }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.sku') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.skuSub') }}</text>
    </view>
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ summary.onHandTotal }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.onHand') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.onHandSub') }}</text>
    </view>
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ money }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.value') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.valueSub') }}</text>
    </view>
    <view class="cell danger" @tap="emit('pick', 'out')">
      <text class="v">{{ summary.outCount }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.out') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.outSub') }}</text>
    </view>
    <view class="cell warn" @tap="emit('pick', 'low')">
      <text class="v">{{ summary.lowCount }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.low') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.lowSub') }}</text>
    </view>
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ summary.outbound7d }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.outbound7d') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.outboundSub') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { InventoryStockSummary } from '../../apis/inventory';
import { fenToYuan } from '../../utils/inventoryFormat';

// 概览 6 卡：缺货/低库存可点击 = 按对应分桶筛选；其余卡片仅陈述（emit 空串 = 取消分桶）
const props = defineProps<{ summary: InventoryStockSummary }>();
const emit = defineEmits<{ (e: 'pick', bucket: string): void }>();

const money = computed(() => `¥${fenToYuan(props.summary.valueTotal)}`);
</script>

<style lang="scss" scoped>
.kpibar {
  /* 用 grid 定 3 列（与 mockup 手机态一致）：flex + calc(33.33% - 16rpx) 在 H5 端
     因 flex 基准与内容 min-size 交互会被挤成 2 列，实测量得单卡 174px（=半行）。 */
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 20rpx;

  .cell {
    min-width: 0;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 20rpx 16rpx;
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    .v { font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .l { font-size: 24rpx; color: $wa-ink; margin-top: 6rpx; }
    .s { font-size: 20rpx; color: $wa-muted; margin-top: 4rpx; }

    &.danger .v { color: $wa-danger; }
    &.warn .v { color: $wa-accent; }
  }
}

/* 桌面态：6 卡一行（卡片变宽后单行铺开，避免 3 列时大量留白） */
@media (min-width: 768px) {
  .kpibar {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }
}
</style>