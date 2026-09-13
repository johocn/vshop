<template>
  <view class="card">
    <view class="head">
      <view class="left">
        <text class="ord">{{ displayCode }}</text>
        <text v-if="isPendingSign(row.status)" class="tag-p">待收款</text>
        <text v-else class="tag-d">已收款</text>
        <text v-if="today" class="tag-today">今日</text>
      </view>
      <text class="amt">{{ fmt(row.amount) }}</text>
    </view>
    <view class="line">
      <text>收款人（核销人）</text>
      <text>{{ row.collectorName || '—' }}</text>
    </view>
    <view class="line">
      <text>收款方式</text>
      <text>{{ label(row.settleMethod) }}</text>
    </view>
    <view class="line" v-if="row.tenantName">
      <text>归属商户</text>
      <text>{{ row.tenantName }}</text>
    </view>
    <view class="line">
      <text>入账时间</text>
      <text>{{ time(row) }}</text>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed } from 'vue';
import {
  settleMethodLabel,
  isPendingSign,
  rowTime,
  SettlementLedgerRow,
} from '../../../apis/settlement';

const props = defineProps<{ row: SettlementLedgerRow; today?: boolean }>();

const displayCode = computed(() => props.row.orderCode || '#' + props.row.orderId);

function fmt(v: number): string {
  return '¥' + (v / 100).toFixed(2);
}
function label(method?: string | null): string {
  return settleMethodLabel(method);
}
function time(row: SettlementLedgerRow): string {
  const d = rowTime(row);
  if (!d) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>
<style lang="scss" scoped>
.card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
    .left { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0; }
    .ord { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .amt { font-size: 34rpx; font-weight: 800; color: $wa-accent; }
    .tag-p { padding: 2rpx 14rpx; border-radius: 8rpx; font-size: 22rpx; color: #b45309; background: #fef3c7; border: 1rpx solid #fcd34d; }
    .tag-d { padding: 2rpx 14rpx; border-radius: 8rpx; font-size: 22rpx; color: #059669; background: #d1fae5; border: 1rpx solid #6ee7b7; }
    .tag-today { padding: 2rpx 14rpx; border-radius: 8rpx; font-size: 22rpx; color: #1d4ed8; background: #dbeafe; border: 1rpx solid #93c5fd; }
  }
  .line { display: flex; align-items: center; justify-content: space-between; font-size: 26rpx; color: $wa-muted; padding: 6rpx 0; }
}
</style>