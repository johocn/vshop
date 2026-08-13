<template>
  <view class="hero-list">
    <view v-if="heroItem" class="hero-list__hero" @click="$emit('click-item', heroItem.product.slug)">
      <VImage :src="heroItem.product.featuredAsset?.preview || ''" width="100%" height="320rpx" />
      <view class="hero-overlay">
        <text class="hero-name">{{ heroItem.product.name }}</text>
        <PriceTag :price="getItemPrice(heroItem)" />
        <text v-if="heroLabel" class="hero-label">{{ heroLabel }}</text>
      </view>
      <view class="hero-cart" @click.stop="$emit('add-cart', heroItem)">
        <text class="cart-icon">+</text>
      </view>
    </view>
    <view class="hero-list__list">
      <view
        v-for="item in restItems"
        :key="item.id"
        class="hero-list__item"
      >
        <view class="item-content" @click="$emit('click-item', item.product.slug)">
          <VImage :src="item.product.featuredAsset?.preview || ''" width="120rpx" height="120rpx" />
          <view class="item-info">
            <text class="item-name">{{ item.product.name }}</text>
            <PriceTag :price="getItemPrice(item)" />
            <text v-if="itemLabel(item)" class="item-label">{{ itemLabel(item) }}</text>
          </view>
        </view>
        <view class="item-cart" @click.stop="$emit('add-cart', item)">
          <text class="cart-icon">+</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

const heroItem = computed(() => props.items[0] || null);
const restItems = computed(() => props.items.slice(1, 5));

const heroLabel = computed(() => {
    if (!heroItem.value) return '';
    const cfg = props.itemConfig.find(c => c.productId === heroItem.value!.productId);
    return cfg?.label || '';
});

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
.hero-list {
    padding: 0 20rpx;
    &__hero { position: relative; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx; }
    &__list { display: flex; flex-direction: column; gap: 12rpx; }
    &__item { display: flex; gap: 12rpx; background: $bg-color; border-radius: $radius-md; padding: 12rpx; align-items: center; }
}
.hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.6)); padding: 20rpx; }
.hero-name { color: #fff; font-size: 28rpx; font-weight: bold; display: block; }
.hero-label { color: #fff; font-size: 22rpx; background: $brand-color; padding: 2rpx 8rpx; border-radius: 4rpx; display: inline-block; margin-top: 4rpx; }
.hero-cart { position: absolute; bottom: 16rpx; right: 16rpx; width: 56rpx; height: 56rpx; background: $brand-color; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    .cart-icon { color: #fff; font-size: 32rpx; line-height: 1; }
}
.item-content { flex: 1; display: flex; gap: 12rpx; }
.item-info { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 4rpx; }
.item-name { font-size: 24rpx; }
.item-label { font-size: 20rpx; color: $brand-color; }
.item-cart { width: 44rpx; height: 44rpx; background: $brand-color; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    .cart-icon { color: #fff; font-size: 28rpx; line-height: 1; }
}
</style>
