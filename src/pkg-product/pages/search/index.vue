<template>
  <view class="search-page">
    <!-- 顶部搜索框 + 按钮 -->
    <view class="search-page__bar">
      <view class="search-page__field">
        <text class="search-page__icon">🔍</text>
        <input
          class="search-page__input"
          v-model="keyword"
          :placeholder="t('search.placeholder')"
          confirm-type="search"
          :focus="true"
          @confirm="doSearch"
        />
        <text v-if="keyword" class="search-page__clear" @click="keyword = ''">×</text>
      </view>
      <text class="search-page__btn" @click="doSearch">{{ t('search.btn') }}</text>
    </view>

    <scroll-view scroll-y class="search-page__body" @scrolltolower="loadMore">
      <!-- 结果态 -->
      <template v-if="searched">
        <view v-if="products.length" class="search-page__grid">
          <view v-for="p in products" :key="p.productId" class="product-card" @click="goDetail(p.slug)">
            <VImage :src="p.productAsset?.preview || ''" width="100%" height="320rpx" mode="aspectFit" />
            <text class="product-card__name">{{ p.productName }}</text>
            <view class="product-card__price">
              <PriceTag :price="getMinPrice(p.priceWithTax)" />
            </view>
          </view>
        </view>
        <text v-if="products.length && !hasMore" class="search-page__footer">{{ t('common.noMore') }}</text>
        <EmptyState v-if="!loading && !products.length" :text="t('search.noResult')" />
      </template>

      <!-- 默认态：搜索历史 + 热门搜索 -->
      <template v-else>
        <view v-if="historyList.length" class="search-page__section">
          <view class="search-page__section-head">
            <text class="search-page__section-title">{{ t('search.history') }}</text>
            <text class="search-page__section-clear" @click="clearHistory">{{ t('search.clearHistory') }}</text>
          </view>
          <view class="search-page__chips">
            <view v-for="w in historyList" :key="w" class="chip" @click="searchTerm(w)">{{ w }}</view>
          </view>
        </view>

        <view v-if="hotWords.length" class="search-page__section">
          <text class="search-page__section-title">{{ t('search.hot') }}</text>
          <view class="search-page__chips">
            <view v-for="(w, i) in hotWords" :key="w" class="chip" @click="searchTerm(w)">
              <text v-if="i < 3" class="chip__rank" :class="'chip__rank--' + (i + 1)">{{ i + 1 }}</text>
              <text>{{ w }}</text>
            </view>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { onLoad } from '@dcloudio/uni-app';
import { searchProducts } from '../../../api/queries/product';
import { useSearchHistory } from '../../../composables/useSearchHistory';
import VImage from '../../../components/VImage.vue';
import PriceTag from '../../../components/PriceTag.vue';
import EmptyState from '../../../components/EmptyState.vue';

const { t, tm } = useI18n();
const { list: historyList, add: addHistory, clear: clearHistory } = useSearchHistory();

const TAKE = 20;
const keyword = ref('');
const searched = ref(false);
const products = ref<any[]>([]);
const loading = ref(false);
const skip = ref(0);
const hasMore = ref(true);

/** 热词是数组词条，须用 tm 取（t() 只支持字符串） */
const hotWords = computed<string[]>(() => (tm('search.hotWords') as string[]) || []);

/** SearchResult 价格：单规格 value，区间取 min（与分类页同口径） */
function getMinPrice(price: any): number {
    return price?.value ?? price?.min ?? 0;
}

function searchTerm(w: string) {
    keyword.value = w;
    doSearch();
}

function doSearch() {
    const term = keyword.value.trim();
    if (!term) return;
    keyword.value = term;
    addHistory(term);
    searched.value = true;
    void loadProducts(true);
}

async function loadProducts(reset = false) {
    if (loading.value) return;
    if (!reset && !hasMore.value) return;
    loading.value = true;
    try {
        const res: any = await searchProducts({
            term: keyword.value.trim(),
            take: TAKE,
            skip: reset ? 0 : skip.value,
            groupByProduct: true,
        });
        const items = res.search?.items || [];
        products.value = reset ? items : [...products.value, ...items];
        const total = res.search?.totalItems || 0;
        skip.value = products.value.length;
        hasMore.value = products.value.length < total;
    } catch (e) {
        console.error(e);
    }
    loading.value = false;
}

function loadMore() {
    void loadProducts(false);
}

function goDetail(slug: string) {
    uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug });
}

onLoad((options: any) => {
    const q = String(options?.q || '').trim();
    if (q) {
        keyword.value = q;
        doSearch();
    }
});
</script>

<style lang="scss" scoped>
.search-page { display: flex; flex-direction: column; height: 100vh; background: $bg-color; }
.search-page__bar {
    display: flex; align-items: center; gap: 16rpx; padding: 16rpx 20rpx; background: #fff;
}
.search-page__field {
    flex: 1; display: flex; align-items: center; background: $bg-color; border-radius: 40rpx; padding: 0 24rpx; height: 72rpx;
}
.search-page__icon { font-size: 28rpx; margin-right: 12rpx; }
.search-page__input { flex: 1; font-size: 28rpx; height: 72rpx; }
.search-page__clear { font-size: 36rpx; color: #999; padding: 0 12rpx; }
.search-page__btn {
    font-size: 28rpx; color: #fff; background: $brand-color; border-radius: 40rpx;
    padding: 0 30rpx; height: 72rpx; line-height: 72rpx;
}
.search-page__body { flex: 1; height: 0; padding: 20rpx; box-sizing: border-box; }
.search-page__section { margin-bottom: 36rpx; }
.search-page__section-head {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
}
.search-page__section-title {
    display: block; font-size: 28rpx; font-weight: bold; color: $text-color;
}
.search-page__section-head .search-page__section-title { margin-bottom: 0; }
.search-page__section-clear { font-size: 24rpx; color: $text-color-placeholder; }
.search-page__chips { display: flex; flex-wrap: wrap; gap: 16rpx; }
.chip {
    display: flex; align-items: center; gap: 6rpx; background: #fff; border-radius: 999rpx;
    padding: 12rpx 24rpx; font-size: 26rpx; color: $text-color;
    &__rank {
        font-style: italic; font-weight: bold; font-size: 24rpx; margin-right: 4rpx;
        &--1 { color: $price-color; }
        &--2 { color: $brand-color; }
        &--3 { color: $warning-color; }
    }
}
.search-page__grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.product-card {
    width: calc(50% - 6rpx); background: #fff; border-radius: $radius-md; overflow: hidden;
    &__name {
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        font-size: 26rpx; color: $text-color; padding: 8rpx 16rpx 0; height: 76rpx;
    }
    &__price { padding: 8rpx 16rpx 16rpx; }
}
.search-page__footer { display: block; text-align: center; font-size: 24rpx; color: #999; padding: 24rpx 0; }
</style>
