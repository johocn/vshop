<template>
  <view class="double-grid">
    <view
      v-for="item in items"
      :key="item.id"
      class="double-grid__item"
    >
      <view @click="$emit('click-item', item.product.slug)">
        <VImage :src="item.product.featuredAsset?.preview || ''" width="100%" height="240rpx" />
        <text class="item-name">{{ item.product.name }}</text>
        <PriceTag :price="getItemPrice(item)" />
      </view>
      <view class="item-cart" @click.stop="$emit('add-cart', item)">
        <text class="cart-icon">+</text>
      </view>
      <text v-if="itemLabel(item)" class="item-label">{{ itemLabel(item) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import VImage from '../VImage.vue';
import PriceTag from '../PriceTag.vue';
import type { FloorItemConfig } from '../../api/queries/collection';

interface FloorProduct {
    id: string;
    productId: string;
    product: {
        id: string;
        name: string;
        slug: string;
        featuredAsset: { preview: string } | null;
        variants: Array<{ price: number; priceWithTax: number; currencyCode: string }>;
    };
}

const props = defineProps<{
    items: FloorProduct[];
    itemConfig: FloorItemConfig[];
}>();

defineEmits<{ 'click-item': [slug: string]; 'add-cart': [item: FloorProduct] }>();

function itemLabel(item: FloorProduct): string {
    const cfg = props.itemConfig.find(c => c.productId === item.productId);
    return cfg?.label || '';
}

function getItemPrice(item: FloorProduct): number {
    const variants = item.product.variants || [];
    if (variants.length === 0) return 0;
    return Math.min(...variants.map(v => v.priceWithTax));
}
</script>

<style lang="scss" scoped>
.double-grid {
    display: flex; flex-wrap: wrap; gap: 16rpx; padding: 0 20rpx;
    &__item { width: calc(50% - 8rpx); background: $bg-color; border-radius: $radius-md; overflow: hidden; position: relative; padding-bottom: 16rpx; }
}
.item-name { font-size: 24rpx; padding: 8rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 64rpx; }
.item-label { position: absolute; top: 8rpx; left: 8rpx; background: $brand-color; color: #fff; font-size: 20rpx; padding: 2rpx 8rpx; border-radius: 4rpx; }
.item-cart { position: absolute; bottom: 8rpx; right: 8rpx; width: 44rpx; height: 44rpx; background: $brand-color; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    .cart-icon { color: #fff; font-size: 28rpx; line-height: 1; }
}
</style>
