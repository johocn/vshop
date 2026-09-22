<template>
  <!-- 候选订单行：勾选 + 单号 + 收件人 + 完整地址 + 推荐仓（含距离）+「已在批次」标记 -->
  <view class="row" :class="{ on: selected, lock: locked }" @tap="emit('toggle')">
    <view class="check" :class="{ on: selected, lock: locked }"><text v-if="selected">✓</text></view>
    <view class="mid">
      <view class="l1">
        <text class="code">{{ row.code }}</text>
        <text v-if="row.inBatchCode" class="tag warn">
          {{ $t('orderAdmin.picking.alreadyInBatch').replace('{code}', row.inBatchCode) }}
        </text>
      </view>
      <text class="who">{{ row.customerName || '—' }}<text v-if="row.phoneNumber" class="ph"> · {{ row.phoneNumber }}</text></text>
      <text class="addr">{{ row.address }}</text>
      <view class="rec">
        <text class="rl">{{ $t('orderAdmin.picking.recommendWarehouse') }}</text>
        <text v-if="row.recommendedStockLocationId" class="rw">
          {{ warehouseName }}<text v-if="row.distanceKm != null" class="km"> · {{ row.distanceKm }}km</text>
        </text>
        <text v-else class="rn">{{ $t('orderAdmin.picking.recommendNone') }}</text>
      </view>
      <text class="cnt">{{ $t('orderAdmin.picking.itemCount').replace('{n}', String(row.itemCount)) }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { PickOrderSnapshot } from '../../apis/picking';

const props = defineProps<{
  row: PickOrderSnapshot;
  selected: boolean;
  /** 推荐仓名称（页面按 id 查表后传入，组件不自己请求） */
  warehouseName?: string;
}>();
const emit = defineEmits<{ (e: 'toggle'): void }>();

// 已在别的非终态批次里的订单不可再勾选（服务端也会拒绝，这里提前锁住避免误选）
const locked = computed(() => !!props.row.inBatchId);
</script>

<style lang="scss" scoped>
.row {
  display: flex;
  gap: 20rpx;
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 28rpx;
  margin-bottom: 16rpx;
  border: 2rpx solid transparent;

  &.on { background: #fff8f2; border-color: $wa-accent; }
  &.lock { opacity: 0.66; }

  .check {
    flex: none;
    width: 40rpx;
    height: 40rpx;
    margin-top: 4rpx;
    border-radius: 50%;
    border: 2rpx solid $wa-rule;
    display: flex;
    align-items: center;
    justify-content: center;

    &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; font-size: 26rpx; }
    &.lock { background: $wa-bg; border-color: $wa-rule; }
  }

  .mid {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;

    .l1 { display: flex; align-items: center; gap: 12rpx;
      .code { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .tag { font-size: 20rpx; border-radius: 6rpx; padding: 2rpx 12rpx; color: #fff;
        &.warn { background: $wa-accent; }
      }
    }
    .who { font-size: 26rpx; color: $wa-ink; margin-top: 8rpx;
      .ph { color: $wa-muted; font-size: 24rpx; }
    }
    .addr { font-size: 24rpx; color: $wa-muted; margin-top: 6rpx; line-height: 1.5; }
    .rec { display: flex; align-items: center; gap: 10rpx; margin-top: 10rpx;
      .rl { font-size: 22rpx; color: $wa-muted; }
      .rw { font-size: 22rpx; color: $wa-accent; background: #fff4ea; border-radius: 6rpx; padding: 4rpx 12rpx;
        .km { color: $wa-accent; }
      }
      .rn { font-size: 22rpx; color: $wa-danger; background: #fee; border-radius: 6rpx; padding: 4rpx 12rpx; }
    }
    .cnt { font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }
}
</style>