<template>
  <view class="category-page">
    <view class="category-page__left">
      <scroll-view scroll-y class="category-page__nav">
        <view v-for="cat in categories" :key="cat.id"
          class="nav-item" :class="{ active: activeCat?.id === cat.id }"
          @click="selectCategory(cat)">
          <text>{{ cat.name }}</text>
        </view>
      </scroll-view>
    </view>
    <view class="category-page__right">
      <scroll-view scroll-y class="category-page__content">
        <view v-if="subCategories.length" class="sub-grid">
          <view v-for="sub in subCategories" :key="sub.id" class="sub-item" @click="goList(sub.id)">
            <text class="sub-item__name">{{ sub.name }}</text>
          </view>
        </view>
        <view class="product-section" v-if="products.length">
          <text class="section-title">{{ activeCat?.name || '' }} 商品</text>
          <view class="product-grid">
            <view v-for="p in products" :key="p.productId" class="product-mini" @click="goDetail(p.slug)">
              <VImage :src="p.productAsset?.preview || ''" width="100%" height="200rpx" />
              <text class="product-mini__name">{{ p.productName }}</text>
              <PriceTag :price="getMinPrice(p.priceWithTax)" />
            </view>
          </view>
        </view>
        <EmptyState v-if="!loading && products.length === 0 && subCategories.length === 0" text="暂无内容" />
      </scroll-view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getGraphQLClient } from '../../api/client';
import { searchProducts } from '../../api/queries/product';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';

const categories = ref<any[]>([]);
const subCategories = ref<any[]>([]);
const products = ref<any[]>([]);
const activeCat = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
    try {
        const client = getGraphQLClient();
        const res: any = await client.request(`query { collections(options: { topLevelOnly: true }) { items { id name slug children { id name slug } } } }`);
        categories.value = res.collections?.items || [];
        if (categories.value.length > 0) selectCategory(categories.value[0]);
    } catch (e) { console.error(e); }
    loading.value = false;
});

async function selectCategory(cat: any) {
    activeCat.value = cat;
    subCategories.value = cat.children || [];
    products.value = [];
    try {
        const res: any = await searchProducts({ facetValueIds: cat.facetValueIds || [], take: 10, collectionSlug: cat.slug });
        products.value = res.search?.items || [];
    } catch (e) {}
}

function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }
function goList(facetId: string) { uni.navigateTo({ url: '/pkg-product/pages/list?facetValueId=' + facetId }); }
function goDetail(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug }); }
</script>
<style lang="scss" scoped>
.category-page { display: flex; height: 100vh; background: #f5f5f5;
    &__left { width: 180rpx; background: #fff; flex-shrink: 0; }
    &__nav { height: 100vh; }
    &__right { flex: 1; }
    &__content { height: 100vh; padding: 20rpx; }
}
.nav-item { padding: 30rpx 20rpx; font-size: 26rpx; text-align: center; border-left: 4rpx solid transparent;
    &.active { background: #f5f5f5; color: $brand-color; border-left-color: $brand-color; font-weight: bold; }
}
.sub-grid { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 20rpx; }
.sub-item { background: #fff; padding: 20rpx 24rpx; border-radius: $radius-md; font-size: 26rpx; &__name { color: $text-color; } }
.section-title { font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; display: block; }
.product-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.product-mini { width: calc(50% - 6rpx); background: #fff; border-radius: $radius-md; overflow: hidden; &__name { font-size: 24rpx; padding: 8rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 64rpx; } }
</style>
