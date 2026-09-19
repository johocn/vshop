<template>
  <view class="product-detail" v-if="product">
    <swiper class="product-detail__gallery" :indicator-dots="true" autoplay>
      <swiper-item v-for="asset in product.assets" :key="asset.id">
        <VImage :src="asset.preview" width="100%" height="750rpx" mode="aspectFit" />
      </swiper-item>
    </swiper>
    <view class="product-detail__info">
      <PriceTag :price="selectedVariant?.priceWithTax || 0" :large="true" />
      <text class="product-detail__name">{{ product.name }}</text>
      <view class="product-detail__specs" v-if="product.optionGroups?.length">
        <view v-for="group in product.optionGroups" :key="group.id" class="spec-group">
          <text class="spec-group__label">{{ group.name }}</text>
          <view class="spec-group__options">
            <text v-for="opt in group.options" :key="opt.id"
              class="spec-option" :class="{ active: selectedOptions[group.id] === opt.id }"
              @click="selectOption(group.id, opt.id)">{{ opt.name }}</text>
          </view>
        </view>
      </view>
    </view>
    <view class="product-detail__rich" v-if="mainVideo || descHtml || sellingPoint">
      <view v-if="mainVideo" class="rich__video">
        <video :src="mainVideo.source" controls class="rich__video-tag"></video>
      </view>
      <text v-if="sellingPoint" class="rich__sp">{{ sellingPoint }}</text>
      <MpHtml v-if="descHtml" :content="descHtml" class="rich__mp" />
    </view>
    <view class="product-detail__bar">
      <button class="product-detail__poster-btn" @click="showPoster = true">海报</button>
      <button class="product-detail__cart-btn" @click="addToCart">加入购物车</button>
      <button class="product-detail__buy-btn" @click="buyNow">立即购买</button>
    </view>
    <ProductPoster v-if="showPoster" :product="product" @close="showPoster = false" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useProductShare } from '../../composables/useShare';
import { getProduct } from '../../api/queries/product';
import { addItemToOrder } from '../../api/mutations/cart';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { useTenantStore } from '../../stores/tenant';
import { getActiveOrder } from '../../api/queries/order';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import ProductPoster from '../../components/product-poster/product-poster.vue';
import { pickTranslation } from '../../utils/locale';
import { stripHtmlToText, buildShareMeta } from '../../utils/html';
import MpHtml from 'mp-html/dist/uni-app/components/mp-html/mp-html.vue';

const product = ref<any>(null);
const selectedOptions = ref<Record<string, string>>({});
const cart = useCartStore();
const auth = useAuthStore();
const ui = useUIStore();
const tenant = useTenantStore();
const showPoster = ref(false);

let pendingAction: 'cart' | 'buy' | null = null;
let offLogin: (() => void) | null = null;

const selectedVariant = computed(() => {
    if (!product.value?.variants?.length) return null;
    const opts = Object.values(selectedOptions.value);
    return product.value.variants.find((v: any) =>
        v.options?.every((o: any) => opts.includes(o.id))
    ) || product.value.variants[0];
});

const sellingPoint = computed(() => (product.value?.customFields?.sellingPoint as string) ?? '');
const descHtml = computed(() => pickTranslation(product.value?.translations || []));
const mainVideo = computed(() => {
    const vid = product.value?.customFields?.videoAssetId;
    if (!vid) return null;
    return (product.value?.assets || []).find((a: any) => String(a.id) === String(vid)) || null;
});

onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const slug = page?.options?.slug;
    if (!slug) return;
    try {
        const res: any = await getProduct(slug);
        product.value = res.product;
        // Auto-select first options
        if (product.value?.optionGroups) {
            product.value.optionGroups.forEach((g: any) => {
                if (g.options?.length > 0) selectedOptions.value[g.id] = g.options[0].id;
            });
        }
    } catch (e) { console.error(e); }
    // WeChat share
    if (product.value) {
      const meta = buildShareMeta({
        productName: product.value.name || '',
        featureImage: product.value.featuredAsset?.preview || '',
        assetsImages: (product.value.assets || []).map((a: any) => a.preview).filter(Boolean),
        textDescription: stripHtmlToText(pickTranslation(product.value.translations || [])),
        shareImageUrl: tenant.shareImageUrl || '',
        shopName: tenant.shopName || '',
        shopIntro: tenant.shopIntro || '',
        origin: window.location.origin,
        defaultImage: '/static/share-default.jpg',
        defaultTitle: 'Youshop - 精选好物',
        defaultDesc: '精选好物推荐',
      });
      useProductShare(meta.title, slug, meta.imgUrl, meta.desc);
    }
});

function selectOption(groupId: string, optionId: string) {
    selectedOptions.value = { ...selectedOptions.value, [groupId]: optionId };
}

async function addToCart() {
    if (!selectedVariant.value) return;
    try {
        await addItemToOrder(selectedVariant.value.id, 1);
        const res: any = await getActiveOrder();
        if (res.activeOrder) cart.setOrder(res.activeOrder);
        ui.showToast('已加入购物车', 'success');
    } catch (e: any) { ui.showToast(e.message); }
}

async function buyNow() {
    if (!selectedVariant.value) return;
    if (!auth.isLoggedIn) {
        pendingAction = 'buy';
        uni.navigateTo({ url: '/pages/login/index' });
        return;
    }
    await addToCart();
    uni.navigateTo({ url: '/pkg-order/pages/checkout' });
}

onMounted(async () => {
    offLogin = auth.onLogin(async () => {
        if (pendingAction === 'cart') {
            pendingAction = null;
            await addToCart();
        } else if (pendingAction === 'buy') {
            pendingAction = null;
            await addToCart();
            uni.navigateTo({ url: '/pkg-order/pages/checkout' });
        } else {
            try {
                const res: any = await getActiveOrder();
                if (res.activeOrder) cart.setOrder(res.activeOrder);
            } catch (e) {}
        }
    });
});

onUnmounted(() => {
    if (offLogin) offLogin();
});
</script>

<style lang="scss" scoped>
.product-detail {
    padding-bottom: 120rpx;
    &__info { background: #fff; padding: 20rpx; }
    &__name { font-size: 32rpx; font-weight: bold; margin-top: 16rpx; display: block; }
    &__bar { position: fixed; bottom: 0; left: 0; right: 0; height: 100rpx; background: #fff; display: flex; gap: 16rpx; padding: 0 20rpx; align-items: center; box-shadow: $shadow; }
    &__cart-btn { flex: 1; height: 80rpx; background: $brand-color-light; color: $brand-color; font-size: 28rpx; border-radius: $radius-md; border: none; }
    &__buy-btn { flex: 1; height: 80rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; border: none; }
}
.spec-group {
    margin-top: 20rpx;
    &__label { font-size: 24rpx; color: $text-color-secondary; }
    &__options { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
}
.spec-option {
    padding: 8rpx 24rpx; font-size: 24rpx; border: 1rpx solid $border-color; border-radius: $radius-sm;
    &.active { border-color: $brand-color; color: $brand-color; background: $brand-color-light; }
}
.product-detail__rich { margin-top: 16rpx; background: #fff; }
.rich__video { padding: 16rpx 0; }
.rich__video-tag { width: 100%; height: 380rpx; display: block; }
.rich__sp { display: block; padding: 0 20rpx 8rpx; font-size: 26rpx; color: $text-color-secondary; }
.rich__mp { padding: 0 20rpx 20rpx; }
</style>