<template>
  <view class="double-grid">
    <view
      v-for="item in items"
      :key="item.id"
      class="double-grid__item"
      @click="$emit('click-item', item.product.slug)"
    >
      <VImage :src="item.product.featuredAsset?.preview || ''" width="100%" height="240rpx" />
      <text class="item-name">{{ item.product.name }}</text>
      <text v-if="itemLabel(item)" class="item-label">{{ itemLabel(item) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import VImage from '../VImage.vue';
import type { FloorItemConfig } from '../../api/queries/collection';

interface FloorProduct {
    id: string;
    productId: string;
    product: { id: string; name: string; slug: string; featuredAsset: { preview: string } | null };
}

const props = defineProps<{
    items: FloorProduct[];
    itemConfig: FloorItemConfig[];
}>();

defineEmits<{ 'click-item': [slug: string] }>();

function itemLabel(item: FloorProduct): string {
    const cfg = props.itemConfig.find(c => c.productId === item.productId);
    return cfg?.label || '';
}
</script>

<style lang="scss" scoped>
.double-grid {
    display: flex; flex-wrap: wrap; gap: 16rpx; padding: 0 20rpx;
    &__item { width: calc(50% - 8rpx); background: $bg-color; border-radius: $radius-md; overflow: hidden; position: relative; }
}
.item-name { font-size: 24rpx; padding: 8rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 64rpx; }
.item-label { position: absolute; top: 8rpx; left: 8rpx; background: $brand-color; color: #fff; font-size: 20rpx; padding: 2rpx 8rpx; border-radius: 4rpx; }
</style>
