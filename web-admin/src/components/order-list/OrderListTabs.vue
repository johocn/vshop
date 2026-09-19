<template>
  <view class="tabs">
    <text v-for="s in shown" :key="s.key" :class="{ on: s.key === cur }" @tap="emit('change', s.key)">{{ s.label }}</text>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ORDER_LIST_LAYOUTS, OrderListLayoutKey } from '../../constants/orderListLayouts';

const props = defineProps<{ tabs: { key: string; label: string; keys?: string[] }[]; cur: string; layout: string }>();
const emit = defineEmits<{ (e: 'change', key: string): void }>();

// blocks.stateColumnFirst（status-first / status-group）时状态类 tab 前置，「全部」殿后
const blocks = computed(() => ORDER_LIST_LAYOUTS[props.layout as OrderListLayoutKey]?.blocks || ORDER_LIST_LAYOUTS.classic.blocks);
const shown = computed(() =>
  blocks.value.stateColumnFirst
    ? [...props.tabs.filter((t) => t.key !== ''), ...props.tabs.filter((t) => t.key === '')]
    : props.tabs
);
</script>

<style lang="scss" scoped>
.tabs {
  display: flex;
  margin-bottom: 24rpx;
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 8rpx;

  text {
    flex: 1;
    text-align: center;
    padding: 16rpx 0;
    font-size: 26rpx;
    color: $wa-muted;
    border-radius: $wa-radius;

    &.on { color: #fff; background: $wa-accent; font-weight: 600; }
  }
}
</style>
