<template>
  <view class="lsec" v-if="items.length">
    <view class="lsec__head">
      <view class="lsec__left">
        <view class="lsec__bar" />
        <text class="lsec__title">{{ titleText }}</text>
      </view>
      <text class="lsec__more" @tap="goList">{{ t('limitGoods.more') }} ›</text>
    </view>

    <scroll-view scroll-x class="lsec__row" :show-scrollbar="false">
      <view class="lsec__card" v-for="p in items" :key="p.id" @tap="goDetail(p.slug)">
        <image class="lsec__img" :src="p.image" mode="aspectFill" />
        <text class="lsec__name">{{ p.name }}</text>
        <view class="lsec__price"><PriceTag :price="p.price" /></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LimitGoodsSection } from '../schema';
import { searchProducts } from '../../../api/queries/product';
import PriceTag from '../../../components/PriceTag.vue';

const props = defineProps<{ section: LimitGoodsSection }>();
const { t } = useI18n();
const items = ref<Array<{ id: string; name: string; slug: string; price: number; image: string }>>([]);

const titleText = computed(() => {
    const raw: any = props.section.title;
    if (!raw) return t('limitGoods.title');
    if (typeof raw === 'string') return raw;
    return raw['zh-CN'] || Object.values(raw)[0] || t('limitGoods.title');
});

onMounted(async () => {
    try {
        const res: any = await searchProducts({ collectionSlug: props.section.collectionSlug || undefined, take: clampLimit(props.section.limit) });
        items.value = (res?.search?.items || []).map((p: any) => ({
            id: p.productId,
            name: p.productName,
            slug: p.slug,
            price: Math.min(...(p.priceWithTax || [0])),
            image: p.productAsset?.preview || '',
        }));
    } catch (e) {
        items.value = []; // 取数失败整块不渲染（与其他楼层容错语义一致）
        console.warn('[LimitGoodsSection] load failed', e);
    }
});

function clampLimit(n?: number): number {
    if (!Number.isFinite(Number(n))) return 6;
    const v = Math.floor(Number(n));
    if (v < 1) return 6;
    return Math.min(20, v);
}

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
</script>

<style lang="scss" scoped>
.lsec { margin: 20rpx; background: #fff; border-radius: $radius-md; padding: 20rpx;
    &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
    &__left { display: flex; align-items: center; gap: 12rpx; }
    &__bar { width: 6rpx; height: 26rpx; border-radius: 6rpx; background: $price-color; }
    &__title { font-size: 32rpx; font-weight: bold; color: $text-color; }
    &__more { font-size: 24rpx; color: #999; }
    &__row { white-space: nowrap; }
}
.lsec__card { display: inline-block; width: 240rpx; margin-right: 16rpx; vertical-align: top; white-space: normal; }
.lsec__img { display: block; width: 240rpx; height: 240rpx; border-radius: 12rpx; }
.lsec__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; color: $text-color; padding: 10rpx 8rpx 0; height: 66rpx; }
.lsec__price { padding: 6rpx 8rpx 0; }
</style>
