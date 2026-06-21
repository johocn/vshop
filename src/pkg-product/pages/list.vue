<template>
  <view class="product-list-page">
    <SearchBar :model-value="searchTerm" @search="onSearch" placeholder="搜索商品" />
    <scroll-view class="product-list-page__scroll" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="refreshing">
      <view class="product-grid">
        <view v-for="item in products" :key="item.productId" class="product-card" @click="goDetail(item.slug)">
          <VImage :src="item.productAsset?.preview || ''" width="100%" height="320rpx" />
          <view class="product-card__info">
            <text class="product-card__name">{{ item.productName }}</text>
            <PriceTag :price="getMinPrice(item.priceWithTax)" />
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
import { ref, onMounted } from 'vue';
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
        const res: any = await searchProducts({ term: searchTerm.value || undefined, facetValueIds: facetValueId ? [facetValueId] : undefined, take, skip });
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
</script>
<style lang="scss" scoped>
.product-list-page { display: flex; flex-direction: column; height: 100vh; &__scroll { flex: 1; } &__footer { padding: 30rpx; text-align: center; } }
.product-grid { display: flex; flex-wrap: wrap; padding: 16rpx; }
.product-card { width: calc(50% - 16rpx); margin: 8rpx; background: #fff; border-radius: $radius-md; overflow: hidden; box-shadow: $shadow; &__info { padding: 16rpx; } &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 72rpx; } }
.footer-text { font-size: 24rpx; color: #999; }
</style>
