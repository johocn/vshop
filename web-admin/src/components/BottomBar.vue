<template>
  <view class="bar">
    <view v-for="it in items" :key="it.key" class="bar-item" :class="{ on: it.key === current }" @tap="go(it)">
      <text class="icon">{{ it.icon }}</text>
      <text class="label">{{ locale.t(it.label) }}</text>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { useLocaleStore } from '../stores/localeStore';
const props = defineProps<{ current: string }>();
const locale = useLocaleStore();
const items = [
  { key: 'dashboard', icon: '⌂', label: 'menu.workbench', url: '/pages/dashboard/index' },
  { key: 'product', icon: '＋', label: 'menu.productShort', url: '/pages/product/create/index' },
  { key: 'order', icon: '单', label: 'menu.order', url: '/pages/order/list/index' },
  { key: 'mine', icon: '我', label: 'menu.mine', url: '/pages/dashboard/index?mine=1' },
];
function go(it: any) { if (it.key !== props.current) uni.switchTab ? uni.navigateTo({ url: it.url, fail: () => ({}) }) : uni.navigateTo({ url: it.url }); }
</script>
<style lang="scss" scoped>
.bar { position: fixed; left: 0; right: 0; bottom: 0; height: 100rpx; background: #fff; border-top: 1rpx solid $wa-rule; display: flex; z-index: 10;
  .bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: $wa-muted;
    .icon { font-size: 40rpx; } .label { font-size: 22rpx; margin-top: 4rpx; }
    &.on { color: $wa-accent; }
  }
}
</style>
