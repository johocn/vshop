<template>
  <view class="headbar">
    <text class="title">{{ $t('menu.order') }}</text>
    <view class="stats">
      <view class="stat" @tap="emit('stat-tap', '')">
        <text class="num">{{ stats.today }}</text>
        <text class="lbl">{{ $t('orderListComp.head.today') }}</text>
      </view>
      <view class="stat" @tap="emit('stat-tap', 'ArrangingPayment')">
        <text class="num">{{ stats.unpaid }}</text>
        <text class="lbl">{{ $t('orderAdmin.orderList.tabPendingPay') }}</text>
      </view>
      <view class="stat" @tap="emit('stat-tap', 'PaymentAuthorized')">
        <text class="num">{{ stats.toShip }}</text>
        <text class="lbl">{{ $t('orderAdmin.orderList.tabPendingShip') }}</text>
      </view>
      <view class="stat" @tap="emit('stat-tap', 'Cancelled')">
        <text class="num">{{ stats.refund }}</text>
        <text class="lbl">{{ $t('orderListComp.head.refundPending') }}</text>
      </view>
    </view>
    <view class="redeem-btn" @tap="emit('redeem')">{{ $t('orderListComp.head.redeemCode') }}<text v-if="redeemableCount > 0" class="redeem-badge">{{ redeemableCount }}</text></view>
  </view>
</template>

<script lang="ts" setup>
import type { StatsValue } from '../../utils/orderFormat';

// 顶部标题 + 统计（今日/待付款/待发货/待退款）+ 核销码兑换入口，自原页面 headbar 原样迁移
defineProps<{ stats: StatsValue; redeemableCount: number }>();
const emit = defineEmits<{
  (e: 'stat-tap', key: string): void;
  (e: 'redeem'): void;
}>();
</script>

<style lang="scss" scoped>
.headbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 20rpx;

  .title { font-size: 34rpx; color: $wa-ink; font-weight: 700; margin-right: auto; }

  .redeem-btn {
    position: relative;
    background: $wa-accent;
    color: #fff;
    font-size: 26rpx;
    padding: 10rpx 28rpx;
    border-radius: 999rpx;

    .redeem-badge {
      position: absolute;
      top: -10rpx;
      right: -10rpx;
      min-width: 32rpx;
      height: 32rpx;
      line-height: 32rpx;
      padding: 0 8rpx;
      border-radius: 999rpx;
      background: $wa-danger;
      color: #fff;
      font-size: 20rpx;
      text-align: center;
    }
  }

  .stats {
    display: flex;
    flex: 1 0 100%;
    order: 3;
    gap: 16rpx;
    margin-top: 16rpx;
    margin-bottom: 0;

    .stat {
      flex: 1;
      background: $wa-card;
      border-radius: $wa-radius;
      padding: 20rpx 0;
      text-align: center;
      display: flex;
      flex-direction: column;
      cursor: pointer;

      .num { font-size: 36rpx; color: $wa-ink; font-weight: 700; }
      .lbl { margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; }
    }
  }
}

@media (min-width: 768px) {
  .headbar { flex-wrap: nowrap; }
  .headbar .stats { flex: 1; order: 1; margin: 0 24px; }
  .headbar .title { order: 0; }
  .headbar .redeem-btn { order: 2; }
}
</style>
