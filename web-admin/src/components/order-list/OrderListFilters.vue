<template>
  <view>
    <view class="search">
      <input :value="kw" class="kw" :placeholder="$t('orderListComp.search.searchPlaceholder')" confirm-type="search" @confirm="emit('search')" @input="onInput" />
      <text class="btn" @tap="emit('search')">{{ $t('orderListComp.search.search') }}</text>
    </view>
    <view class="filters">
      <picker :range="deliveryOpts" :value="deliveryIdx" @change="onDeliveryPick">
        <text class="f-chip" :class="{ on: !!deliveryLabel }">{{ deliveryLabel || $t('orderListComp.search.delivery') }} ▾</text>
      </picker>
      <picker :range="dateOpts" :value="dateIdx" @change="onDatePick">
        <text class="f-chip" :class="{ on: !!dateLabel }">{{ dateLabel || $t('orderListComp.search.date') }} ▾</text>
      </picker>
      <text v-if="deliveryLabel || dateLabel" class="f-clear" @tap="emit('clear')">{{ $t('orderListComp.search.clear') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 搜索框 + 配送/时间筛选，自原页面 search / filters 块原样迁移
// picker 下标 → 过滤值映射与页面 deliveryArr/dateArr 语义一致（组件内建，避免多传一对 props）
const DELIVERY_VALUES = ['', 'pickup', 'express'] as const;
const DATE_VALUES = ['', 'today', '7d', '30d'] as const;

withDefaults(
  defineProps<{
    kw: string;
    deliveryLabel: string;
    dateLabel: string;
    deliveryIdx: number;
    dateIdx: number;
    deliveryOpts: string[];
    dateOpts: string[];
  }>(),
  {
    deliveryIdx: 0,
    dateIdx: 0,
    deliveryOpts: () => ['自提', '快递'],
    dateOpts: () => ['今日', '近7天', '近30天'],
  }
);
const emit = defineEmits<{
  (e: 'search'): void;
  (e: 'delivery', v: '' | 'pickup' | 'express'): void;
  (e: 'date', v: '' | 'today' | '7d' | '30d'): void;
  (e: 'clear'): void;
  (e: 'update:kw', v: string): void; // 支持父级 v-model:kw 双向绑定（除 plan 列出的操作事件外的必要补充）
}>();

function onInput(e: any) {
  emit('update:kw', e.detail.value);
}
function onDeliveryPick(e: any) {
  emit('delivery', DELIVERY_VALUES[e.detail.value] as '' | 'pickup' | 'express');
}
function onDatePick(e: any) {
  emit('date', DATE_VALUES[e.detail.value] as '' | 'today' | '7d' | '30d');
}
</script>

<style lang="scss" scoped>
.search {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 8rpx 16rpx 8rpx 24rpx;

  .kw { flex: 1; font-size: 26rpx; color: $wa-ink; }

  .btn {
    flex-shrink: 0;
    padding: 12rpx 32rpx;
    font-size: 26rpx;
    color: #fff;
    background: $wa-accent;
    border-radius: $wa-radius;
  }
}

.filters {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
  flex-wrap: wrap;

  .f-chip {
    font-size: 26rpx;
    color: $wa-muted;
    background: $wa-card;
    padding: 10rpx 24rpx;
    border-radius: 999rpx;
    border: 1rpx solid #e8edf5;

    &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
  }

  .f-clear { font-size: 24rpx; color: $wa-muted; text-decoration: underline; cursor: pointer; }
}
</style>
