<template>
  <view class="product-list-page">
    <SearchBar :model-value="searchTerm" @search="onSearch" placeholder="搜索商品" />
    <view class="list-toolbar">
      <text class="list-toolbar__title">商品列表</text>
      <view class="list-toolbar__toggle" @tap="toggleView">
        <text>{{ viewMode === 'grid' ? '瀑布流' : '双列' }}</text>
      </view>
    </view>
    <scroll-view class="product-list-page__scroll" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="refreshing">
      <view v-if="viewMode === 'grid'" class="product-grid">
        <view v-for="item in products" :key="item.productId" class="product-card" @click="goDetail(item.slug)">
          <VImage :src="item.productAsset?.preview || ''" width="100%" height="320rpx" />
          <view class="product-card__info">
            <text class="product-card__name">{{ item.productName }}</text>
            <PriceTag :price="getMinPrice(item.priceWithTax)" />
          </view>
        </view>
      </view>
      <view v-else class="waterfall">
        <view v-for="(col, ci) in waterfallCols" :key="ci" class="waterfall__col">
          <view v-for="item in col" :key="item.productId" class="waterfall-card" @click="goDetail(item.slug)">
            <VImage :src="item.productAsset?.preview || ''" width="100%" mode="widthFix" />
            <view class="waterfall-card__body">
              <text class="waterfall-card__name">{{ item.productName }}</text>
              <view class="waterfall-card__price-row">
                <PriceTag :price="getMinPrice(item.priceWithTax)" />
              </view>
            </view>
          </view>
        </view>
      </view>
      <view class="product-list-page__footer">
        <LoadingSkeleton v-if="loading" type="product" :count="4" />
        <text v-else-if="!hasMore && products.length > 0" class="footer-text">没有更多了</text>
        <EmptyState v-if="!loading && products.length === 0" text="暂无商品" />
      </view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { searchProducts } from '../../api/queries/product';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import SearchBar from '../../components/SearchBar.vue';
const products = ref<any[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const refreshing = ref(false);
const searchTerm = ref('');
let skip = 0;
const take = 20;
onMounted(async () => {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    searchTerm.value = page?.options?.term || '';
    await loadData();
});
onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await refreshData(); uni.stopPullDownRefresh(); });
async function loadData() {
    if (loading.value || !hasMore.value) return;
    loading.value = true;
    try {
        const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
        const facetValueId = page?.options?.facetValueId;
        const collectionSlug = page?.options?.collectionSlug;
        const res: any = await searchProducts({
            term: searchTerm.value || undefined,
            collectionSlug: collectionSlug || undefined,
            facetValueFilters: facetValueId ? [{ or: [facetValueId] }] : undefined,
            take,
            skip,
        });
        const items = res.search?.items || [];
        products.value = [...products.value, ...items];
        const total = res.search?.totalItems || 0;
        skip += items.length;
        hasMore.value = products.value.length < total;
    } catch (e) { console.error(e); }
    loading.value = false;
}
function loadMore() { loadData(); }
async function refreshData() { skip = 0; hasMore.value = true; products.value = []; await loadData(); }
async function onRefresh() { refreshing.value = true; await refreshData(); refreshing.value = false; }
function onSearch(term: string) { searchTerm.value = term; skip = 0; hasMore.value = true; products.value = []; loadData(); }
function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }
function goDetail(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug }); }
const VIEW_KEY = 'product_list_view_mode';
const viewMode = ref<'grid' | 'waterfall'>((uni.getStorageSync(VIEW_KEY) as 'grid' | 'waterfall') || 'grid');
function toggleView() {
    viewMode.value = viewMode.value === 'grid' ? 'waterfall' : 'grid';
    uni.setStorageSync(VIEW_KEY, viewMode.value);
}
const waterfallCols = computed(() => {
    const cols: any[][] = [[], []];
    products.value.forEach((p, i) => cols[i % 2].push(p));
    return cols;
});
</script>
<style lang="scss" scoped>
.product-list-page { display: flex; flex-direction: column; height: 100vh; &__scroll { flex: 1; } &__footer { padding: 30rpx; text-align: center; } }
.list-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 24rpx;
  &__title { font-size: 30rpx; font-weight: 600; }
  &__toggle { font-size: 24rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 24rpx; padding: 6rpx 20rpx; }
}
.waterfall { display: flex; justify-content: space-between; padding: 16rpx;
  &__col { width: calc(50% - 8rpx); }
}
.waterfall-card { background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx; box-shadow: $shadow;
  &__img { width: 100%; display: block; background: #f7f7f7; }
  &__body { padding: 16rpx; }
  &__name { font-size: 26rpx; color: #333; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  &__price-row { display: flex; align-items: baseline; gap: 8rpx; margin-top: 8rpx; }
}
.product-grid { display: flex; flex-wrap: wrap; padding: 16rpx; }
.product-card { width: calc(50% - 16rpx); margin: 8rpx; background: #fff; border-radius: $radius-md; overflow: hidden; box-shadow: $shadow; &__info { padding: 16rpx; } &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 72rpx; } }
.footer-text { font-size: 24rpx; color: #999; }
</style>
