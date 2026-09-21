<template>
  <view>
    <!-- 关键词搜索：服务端过滤（订单号/顾客/手机号/备注） -->
    <view class="search">
      <input :value="kw" class="kw" :placeholder="$t('orderListComp.search.searchPlaceholder')" confirm-type="search" @confirm="emit('search')" @input="onInput" />
      <text class="btn" @tap="emit('search')">{{ $t('orderListComp.search.search') }}</text>
    </view>

    <!-- 时间快捷筛选条：可与状态分组 tab 组合（今日 + 待发货 等） -->
    <view class="chiprow">
      <text class="f-chip" :class="{ on: timeKey === 'today' }" @tap="emit('time', 'today')">{{ $t('orderAdmin.orderList.dateToday') }}</text>
      <text class="f-chip" :class="{ on: timeKey === '7d' }" @tap="emit('time', '7d')">{{ $t('orderAdmin.orderList.date7d') }}</text>
      <text class="f-chip" :class="{ on: timeKey === 'month' }" @tap="emit('time', 'month')">{{ $t('orderAdmin.orderList.dateMonth') }}</text>
      <text class="f-chip" :class="{ on: timeKey === 'custom' }" @tap="emit('time', 'custom')">{{ $t('orderAdmin.orderList.dateCustom') }}</text>
    </view>

    <!-- 自定义区间：仅在选中「自定义」时展开 -->
    <view v-if="timeKey === 'custom'" class="chiprow">
      <picker mode="date" :value="customFrom" @change="onFrom">
        <text class="f-chip" :class="{ on: !!customFrom }">{{ customFrom || $t('orderAdmin.orderList.timeFrom') }}</text>
      </picker>
      <text class="tilde">~</text>
      <picker mode="date" :value="customTo" @change="onTo">
        <text class="f-chip" :class="{ on: !!customTo }">{{ customTo || $t('orderAdmin.orderList.timeTo') }}</text>
      </picker>
    </view>

    <!-- 配送筛选 -->
    <view class="chiprow">
      <text class="f-chip" :class="{ on: delivery === 'delivery' }" @tap="emit('delivery', 'delivery')">{{ $t('orderAdmin.orderList.deliveryExpress') }}</text>
      <text class="f-chip" :class="{ on: delivery === 'pickup' }" @tap="emit('delivery', 'pickup')">{{ $t('orderAdmin.orderList.deliveryPickup') }}</text>
      <text v-if="hasFilter" class="f-clear" @tap="emit('clear')">{{ $t('orderListComp.search.clear') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 搜索 + 时间快捷筛选 + 配送筛选。条件由页面转交 utils/orderFilter.ts 组装为服务端 filter。
import { computed } from 'vue';
import type { TimeRangeKey } from '../../utils/orderFilter';

const props = withDefaults(
  defineProps<{
    kw: string;
    timeKey: TimeRangeKey;
    customFrom: string;
    customTo: string;
    delivery: '' | 'pickup' | 'delivery';
  }>(),
  { kw: '', timeKey: '', customFrom: '', customTo: '', delivery: '' }
);
const emit = defineEmits<{
  (e: 'search'): void;
  (e: 'update:kw', v: string): void;
  (e: 'time', v: Exclude<TimeRangeKey, ''>): void;
  (e: 'range', r: { from: string; to: string }): void;
  (e: 'delivery', v: 'pickup' | 'delivery'): void;
  (e: 'clear'): void;
}>();

const hasFilter = computed(() => !!(props.kw || props.timeKey || props.delivery));

function onInput(e: any) {
  emit('update:kw', e.detail.value);
}
function onFrom(e: any) {
  emit('range', { from: e.detail.value, to: props.customTo });
}
function onTo(e: any) {
  emit('range', { from: props.customFrom, to: e.detail.value });
}
</script>

<style lang="scss" scoped>
.search {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
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

.chiprow {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
  flex-wrap: wrap;

  .tilde { color: $wa-muted; font-size: 24rpx; }

  .f-chip {
    font-size: 26rpx;
    color: $wa-muted;
    background: $wa-card;
    padding: 10rpx 24rpx;
    border-radius: 999rpx;
    border: 1rpx solid #e8edf5;

    &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; font-weight: 600; }
  }

  .f-clear { font-size: 24rpx; color: $wa-muted; text-decoration: underline; cursor: pointer; }
}
</style>
