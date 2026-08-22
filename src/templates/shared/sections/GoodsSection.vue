<template>
  <view class="goods-sec" v-if="products.length">
    <text class="title" v-if="section.title">{{ section.title }}</text>
    <view class="grid">
      <view class="card" v-for="p in products" :key="p.id" @tap="go(p.slug)">
        <image class="thumb" :src="p.featuredAsset?.preview" mode="aspectFill" />
        <text class="name">{{ p.name }}</text>
        <text class="price">¥{{ p.price }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { GoodsSection } from '../schema';
import { getEnabledFloors } from '../../../api/queries/collection';

const props = defineProps<{ section: GoodsSection }>();
const products = ref<Array<{ id: string; name: string; slug: string; price: number; featuredAsset: { preview: string } | null }>>([]);

onMounted(async () => {
  try {
    const res: any = await getEnabledFloors();
    const floors = res?.collections?.items || [];
    const target = floors.find((f: any) => f.id === props.section.collectionId);
    if (target?.productVariants?.items) {
      products.value = target.productVariants.items.map((v: any) => ({
        id: v.product.id,
        name: v.product.name,
        slug: v.product.slug,
        price: v.product.variants?.[0]?.priceWithTax ?? v.product.variants?.[0]?.price ?? 0,
        featuredAsset: v.product.featuredAsset,
      }));
    }
  } catch (e) {
    console.warn('[GoodsSection] load failed', e);
  }
});

function go(slug: string) {
  uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}` });
}
</script>

<style lang="scss" scoped>
.goods-sec { margin: 20rpx; }
.title { font-size: 32rpx; font-weight: bold; padding: 10rpx 0 20rpx; }
.grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.card { width: 48%; background: #fff; border-radius: 16rpx; margin-bottom: 20rpx; overflow: hidden; }
.thumb { width: 100%; height: 300rpx; }
.name { font-size: 26rpx; color: #333; padding: 12rpx 16rpx 4rpx; display: block; }
.price { font-size: 30rpx; color: #e64340; font-weight: bold; padding: 0 16rpx 16rpx; display: block; }
</style>