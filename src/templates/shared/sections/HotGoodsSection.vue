<template>
  <view class="hsec" v-if="items.length || loading">
    <view class="hsec__head">
      <view class="hsec__left">
        <view class="hsec__bar" />
        <text class="hsec__title">{{ titleText }}</text>
      </view>
      <text class="hsec__more" @tap="goList">{{ t('hotGoods.more') }} ›</text>
    </view>

    <view class="hsec__grid">
      <view class="hsec__card" v-for="p in items" :key="p.id" @tap="goDetail(p.slug)">
        <image class="hsec__img" :src="p.image" mode="widthFix" />
        <text class="hsec__name">{{ p.name }}</text>
        <view class="hsec__price"><PriceTag :price="p.price" /></view>
      </view>
    </view>

    <view class="hsec__loadmore" v-if="items.length">
      <text class="hsec__loadmore-text" v-if="loading">{{ t('common.loading') }}</text>
      <text class="hsec__loadmore-text" v-else-if="!hasMore">{{ t('common.noMore') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HotGoodsSection } from '../schema';
import { searchProducts } from '../../../api/queries/product';
import PriceTag from '../../../components/PriceTag.vue';

const props = defineProps<{ section: HotGoodsSection }>();
const { t } = useI18n();
const items = ref<Array<{ id: string; name: string; slug: string; price: number; image: string }>>([]);
const loading = ref(false);
const hasMore = ref(true);
const skip = ref(0);
const pageSize = clampPageSize(props.section.pageSize);

const titleText = computed(() => {
    const raw: any = props.section.title;
    if (!raw) return t('hotGoods.title');
    if (typeof raw === 'string') return raw;
    return raw['zh-CN'] || Object.values(raw)[0] || t('hotGoods.title');
});

async function load(reset = false) {
    if (loading.value) return;
    if (!reset && !hasMore.value) return;
    loading.value = true;
    try {
        if (reset) {
            skip.value = 0;
            hasMore.value = true;
        }
        const res: any = await searchProducts({ collectionSlug: props.section.collectionSlug || undefined, take: pageSize, skip: skip.value });
        const list = (res?.search?.items || []).map((p: any) => ({
            id: p.productId,
            name: p.productName,
            slug: p.slug,
            price: getMinPrice(p.priceWithTax),
            image: p.productAsset?.preview || '',
        }));
        items.value = reset ? list : [...items.value, ...list];
        hasMore.value = items.value.length < (res?.search?.totalItems ?? 0);
        skip.value += pageSize;
    } catch (e) {
        console.warn('[HotGoodsSection] load failed', e);
    } finally {
        loading.value = false;
    }
}

function loadMore() { void load(false); }

function clampPageSize(n?: number): number {
    if (!Number.isFinite(Number(n))) return 10;
    const v = Math.floor(Number(n));
    if (v < 1) return 10;
    return Math.min(20, v);
}

// searchProducts 返回 SearchResult.priceWithTax 为 SinglePrice{value} / PriceRange{min,max} 对象
function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }

function goDetail(slug: string) {
    if (slug) uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}` });
}
function goList() {
    if (props.section.collectionSlug) {
        uni.navigateTo({ url: `/pkg-product/pages/list?collectionSlug=${props.section.collectionSlug}` });
    } else {
        uni.switchTab({ url: '/pages/category/index' });
    }
}

onMounted(() => {
    void load(true);
    uni.$on('home-reach-bottom', loadMore);
});
onUnmounted(() => {
    uni.$off('home-reach-bottom', loadMore);
});
</script>

<style lang="scss" scoped>
.hsec { margin: 20rpx; background: #fff; border-radius: $radius-md; padding: 20rpx;
    &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
    &__left { display: flex; align-items: center; gap: 12rpx; }
    &__bar { width: 6rpx; height: 26rpx; border-radius: 6rpx; background: $price-color; }
    &__title { font-size: 32rpx; font-weight: bold; color: $text-color; }
    &__more { font-size: 24rpx; color: #999; }
    &__grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
    &__loadmore { padding: 16rpx 0 4rpx; text-align: center; }
    &__loadmore-text { font-size: 24rpx; color: #999; }
}
.hsec__card { width: 48%; background: #fff; border-radius: 12rpx; margin-bottom: 16rpx; overflow: hidden; }
.hsec__img { display: block; width: 100%; min-height: 240rpx; background: #f5f5f5; }
.hsec__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 26rpx; color: $text-color; padding: 12rpx 16rpx 4rpx; }
.hsec__price { padding: 0 16rpx 16rpx; display: block; }
</style>
