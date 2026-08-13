<template>
  <scroll-view scroll-x class="single-scroll" :show-scrollbar="false">
    <view class="single-scroll__inner">
      <view
        v-for="item in items"
        :key="item.id"
        class="single-scroll__item"
        :style="{ width: itemWidth }"
      >
        <view @click="$emit('click-item', item.product.slug)">
          <VImage :src="item.product.featuredAsset?.preview || ''" width="100%" height="200rpx" />
          <text class="item-name">{{ item.product.name }}</text>
          <PriceTag :price="getItemPrice(item)" />
        </view>
        <view class="item-cart" @click.stop="$emit('add-cart', item)">
          <text class="cart-icon">+</text>
        </view>
        <text v-if="itemLabel(item)" class="item-label">{{ itemLabel(item) }}</text>
      </view>
    </view>
  </scroll-view>
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

const itemWidth = '240rpx';

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
.single-scroll {
    white-space: nowrap;
    &__inner { display: inline-flex; gap: 16rpx; padding: 0 20rpx; }
    &__item { display: inline-block; background: $bg-color; border-radius: $radius-md; overflow: hidden; position: relative; padding-bottom: 12rpx; }
}
.item-name { font-size: 24rpx; padding: 8rpx; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-label { position: absolute; top: 8rpx; left: 8rpx; background: $brand-color; color: #fff; font-size: 20rpx; padding: 2rpx 8rpx; border-radius: 4rpx; }
.item-cart { position: absolute; bottom: 8rpx; right: 8rpx; width: 40rpx; height: 40rpx; background: $brand-color; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    .cart-icon { color: #fff; font-size: 24rpx; line-height: 1; }
}
</style>
