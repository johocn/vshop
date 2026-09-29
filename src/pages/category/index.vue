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
      <scroll-view scroll-y class="category-page__content" @scrolltolower="onReachBottom">
        <!-- mode=1：二级分类格 -->
        <view v-if="mode === 1">
          <view v-if="subCategories.length" class="sub-grid">
            <view v-for="sub in subCategories" :key="sub.id" class="sub-item" @click="goList(sub.slug)">
              <text class="sub-item__name">{{ sub.name }}</text>
            </view>
          </view>
          <EmptyState v-if="!subCategories.length" text="暂无子分类" />
        </view>

        <!-- mode=2：商品列表 -->
        <view v-else class="product-grid">
          <view v-for="p in products" :key="p.productId" class="product-mini" @click="goDetail(p.slug)">
            <VImage :src="p.productAsset?.preview || ''" width="100%" height="240rpx" />
            <text class="product-mini__name">{{ p.productName }}</text>
            <PriceTag :price="getMinPrice(p.priceWithTax)" />
          </view>
          <text v-if="!hasMore && products.length > 0" class="list-footer">没有更多了</text>
          <EmptyState v-if="!loadingMore && products.length === 0" text="暂无商品" />
        </view>
      </scroll-view>

      <view class="fab-group">
        <view class="fab" @click="toggleMode">⇄</view>
        <view class="fab" @click="toTop">↑</view>
      </view>
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
const loadingMore = ref(false);
// 默认进入商品列表（mode=2）：左侧一级分类 + 右侧商品网格，首屏即可见商品
const mode = ref(2);

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
    skip.value = 0;
    hasMore.value = true;
    await loadProducts(true);
}

const skip = ref(0);
const take = 20;
const hasMore = ref(true);

async function loadProducts(reset = false) {
    if (!activeCat.value) return;
    if (loadingMore.value) return;
    if (!reset && !hasMore.value) return;
    loadingMore.value = true;
    try {
        const res: any = await searchProducts({
            collectionSlug: activeCat.value.slug,
            take,
            skip: reset ? 0 : skip.value,
        });
        const items = res.search?.items || [];
        products.value = reset ? items : [...products.value, ...items];
        const total = res.search?.totalItems || 0;
        skip.value = products.value.length;
        hasMore.value = products.value.length < total;
    } catch (e) {
        console.error(e);
    }
    loadingMore.value = false;
}

function toggleMode() {
    mode.value = mode.value === 1 ? 2 : 1;
    if (mode.value === 2) {
        // 进入商品列表时按需首次加载
        if (products.value.length === 0) void loadProducts(true);
    }
}

function onReachBottom() {
    if (mode.value === 2) void loadProducts(false);
}

function toTop() {
    uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }
function goList(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/list?collectionSlug=' + slug }); }
function goDetail(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug }); }
</script>
<style lang="scss" scoped>
.category-page { display: flex; height: 100vh; background: #f5f5f5;
    &__left { width: 180rpx; background: #fff; flex-shrink: 0; }
    &__nav { height: 100vh; }
    &__right { flex: 1; }
    &__content { height: 100vh; padding: 20rpx; box-sizing: border-box; }
}
.nav-item { padding: 30rpx 20rpx; font-size: 26rpx; text-align: center; border-left: 4rpx solid transparent;
    &.active { background: #f5f5f5; color: $brand-color; border-left-color: $brand-color; font-weight: bold; }
}
.sub-grid { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 20rpx; }
.sub-item { background: #fff; padding: 20rpx 24rpx; border-radius: $radius-md; font-size: 26rpx; &__name { color: $text-color; } }
.section-title { font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; display: block; }
.product-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.product-mini { width: calc(50% - 6rpx); background: #fff; border-radius: $radius-md; overflow: hidden; &__name { font-size: 24rpx; padding: 8rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 64rpx; } }
.fab-group { position: fixed; right: 24rpx; bottom: 200rpx; display: flex; flex-direction: column; gap: 20rpx; }
.fab { width: 84rpx; height: 84rpx; border-radius: 50%; background: rgba(0,0,0,0.45); color: #fff; font-size: 36rpx; display: flex; align-items: center; justify-content: center; }
.list-footer { display: block; width: 100%; text-align: center; font-size: 24rpx; color: #999; padding: 24rpx 0; }
</style>
