<template>
  <view class="tabs">
    <text class="tab-all" :class="{ on: cur === '' }" @tap="emit('change', '')">{{ $t('orderListComp.tabs.all') }}</text>
    <view v-for="g in groups" :key="g.key" class="grp">
      <view class="gh" @tap="toggle(g.key)">
        <text class="g-label">{{ g.label }}</text>
        <text v-if="g.count" class="g-cnt">{{ g.count }}</text>
        <text class="che">{{ isOpen(g.key) ? '⌃' : '⌄' }}</text>
      </view>
      <view v-if="isOpen(g.key)" class="gtabs">
        <text
          v-for="t in g.tabs"
          :key="t.key"
          class="gtab"
          :class="{ on: t.key === cur }"
          @tap="emit('change', t.key)"
        >{{ t.label }}</text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

// 分组折叠 tab：默认全部展开；分组计数来自服务端 totalItems（页面 loadCounts）。
// tabs 的语义（states / exceptionOnly / exceptionType / afterSales）由页面定义，本组件只渲染。
const props = withDefaults(
  defineProps<{
    groups: { key: string; label: string; count?: number; tabs: { key: string; label: string }[] }[];
    cur: string;
  }>(),
  { groups: () => [], cur: '' }
);
const emit = defineEmits<{ (e: 'change', key: string): void }>();

const closed = ref<Record<string, boolean>>({});
function isOpen(key: string) {
  return closed.value[key] !== true;
}
function toggle(key: string) {
  closed.value = { ...closed.value, [key]: !closed.value[key] };
}

// 选中项落在折叠组内时自动展开，避免“选了却看不见”
const curGroupKey = computed(() => props.groups.find((g) => g.tabs.some((t) => t.key === props.cur))?.key || '');
watch(curGroupKey, (k) => {
  if (k && closed.value[k]) closed.value = { ...closed.value, [k]: false };
});
</script>

<style lang="scss" scoped>
.tabs {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 16rpx 20rpx;
  margin-bottom: 16rpx;

  .tab-all {
    display: block;
    text-align: center;
    padding: 14rpx 0;
    font-size: 26rpx;
    color: $wa-muted;
    border-radius: $wa-radius;
    background: #f4f6fa;
    margin-bottom: 12rpx;

    &.on { color: #fff; background: $wa-accent; font-weight: 600; }
  }

  .grp {
    border-top: 1rpx solid #eef1f6;
    padding-top: 10rpx;
    margin-top: 4rpx;

    .gh {
      display: flex;
      align-items: center;
      gap: 12rpx;
      padding: 8rpx 4rpx;
      cursor: pointer;

      .g-label { font-size: 26rpx; font-weight: 700; color: $wa-ink; }
      .g-cnt { font-size: 20rpx; color: $wa-muted; background: #f0f2f7; border-radius: 999rpx; padding: 2rpx 14rpx; }
      .che { margin-left: auto; font-size: 22rpx; color: $wa-muted; }
    }

    .gtabs {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
      padding: 4rpx 0 12rpx;

      .gtab {
        font-size: 24rpx;
        color: $wa-muted;
        background: #f6f7fa;
        border: 1rpx solid #e7eaf0;
        border-radius: 999rpx;
        padding: 8rpx 22rpx;

        &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      }
    }
  }
}
</style>
