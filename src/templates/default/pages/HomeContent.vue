<template>
  <view class="default-home">
    <swiper class="default-home__banner" autoplay :indicator-dots="true" circular>
      <swiper-item v-for="i in 3" :key="i"><view class="banner-placeholder">Banner {{ i }}</view></swiper-item>
    </swiper>
    <view class="default-home__nav">
      <view class="nav-item" @click="navTo('/pkg-promotion/pages/flash-sale')"><text class="nav-icon">⚡</text><text>秒杀</text></view>
      <view class="nav-item" @click="navTo('/pkg-promotion/pages/group-buy')"><text class="nav-icon">👥</text><text>拼团</text></view>
      <view class="nav-item" @click="navTo('/pkg-promotion/pages/coupons')"><text class="nav-icon">🎫</text><text>优惠券</text></view>
      <view class="nav-item" @click="navTo('/pkg-user/pages/recharge')"><text class="nav-icon">💳</text><text>充值</text></view>
    </view>
    <FloorSection
      v-for="floor in floors"
      :key="floor.id"
      :floor="floor"
      @add-cart="handleFloorAddCart"
    />
    <view v-if="floors.length === 0" class="default-home__section">
      <text class="section-title">推荐商品</text>
      <view class="product-grid">
        <view v-for="p in products" :key="p.productId" class="product-mini">
          <view @click="goDetail(p.slug)">
            <VImage :src="p.productAsset?.preview || ''" width="100%" height="240rpx" />
            <text class="product-mini__name">{{ p.productName }}</text>
            <PriceTag :price="getMinPrice(p.priceWithTax)" />
          </view>
          <view class="product-mini__cart" @click.stop="handleAddCart(p)">
            <text class="cart-icon">+</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { searchProducts } from '../../../api/queries/product';
import { getEnabledFloors, filterActiveFloors, type FloorCollection } from '../../../api/queries/collection';
import { addItemToOrder } from '../../../api/mutations/cart';
import { getActiveOrder } from '../../../api/queries/order';
import { useCartStore } from '../../../stores/cart';
import { useAuthStore } from '../../../stores/auth';
import { useUIStore } from '../../../stores/ui';
import VImage from '../../../components/VImage.vue';
import PriceTag from '../../../components/PriceTag.vue';
import FloorSection from '../../../components/FloorSection.vue';

const products = ref<any[]>([]);
const floors = ref<FloorCollection[]>([]);
const cart = useCartStore();
const auth = useAuthStore();
const ui = useUIStore();

let pendingAddCart: { variantId: string } | null = null;
let offLogin: (() => void) | null = null;

onMounted(async () => {
    try {
        const res: any = await searchProducts({ take: 10 });
        products.value = res.search?.items || [];
    } catch (e) {}

    try {
        const res: any = await getEnabledFloors();
        const allFloors = res.collections?.items || [];
        floors.value = filterActiveFloors(allFloors).slice(0, 3);
    } catch (e) {
        console.error('加载楼层失败', e);
    }

    offLogin = auth.onLogin(async () => {
        try {
            const res: any = await getActiveOrder();
            if (res.activeOrder) cart.setOrder(res.activeOrder);
        } catch (e) {}
    });
});

onUnmounted(() => {
    if (offLogin) offLogin();
});

function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }
function navTo(url: string) { uni.navigateTo({ url }); }
function goDetail(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug }); }

async function handleAddCart(product: any) {
    if (!product?.productVariantId) {
        ui.showToast('商品信息不完整');
        return;
    }
    try {
        await addItemToOrder(product.productVariantId, 1);
        const res: any = await getActiveOrder();
        if (res.activeOrder) cart.setOrder(res.activeOrder);
        ui.showToast('已加入购物车', 'success');
    } catch (e: any) { ui.showToast(e.message || '加入失败'); }
}

async function handleFloorAddCart(item: any) {
    if (!item?.id) {
        ui.showToast('商品信息不完整');
        return;
    }
    try {
        await addItemToOrder(item.id, 1);
        const res: any = await getActiveOrder();
        if (res.activeOrder) cart.setOrder(res.activeOrder);
        ui.showToast('已加入购物车', 'success');
    } catch (e: any) { ui.showToast(e.message || '加入失败'); }
}
</script>
<style lang="scss" scoped>
.default-home {
    &__banner { height: 360rpx; .banner-placeholder { height: 360rpx; background: linear-gradient(135deg, $brand-color, #ff9966); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 40rpx; } }
    &__nav { display: flex; background: #fff; padding: 30rpx 0; margin-bottom: 20rpx; }
    &__section { background: #fff; padding: 20rpx; margin-bottom: 20rpx; }
}
.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; .nav-icon { font-size: 48rpx; margin-bottom: 8rpx; } text { font-size: 24rpx; } }
.section-title { font-size: 32rpx; font-weight: bold; display: block; margin-bottom: 16rpx; }
.product-grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.product-mini { width: calc(50% - 8rpx); background: $bg-color; border-radius: $radius-md; overflow: hidden; position: relative;
    &__name { font-size: 24rpx; padding: 8rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 64rpx; }
    &__cart { position: absolute; bottom: 8rpx; right: 8rpx; width: 48rpx; height: 48rpx; background: $brand-color; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        .cart-icon { color: #fff; font-size: 32rpx; line-height: 1; }
    }
}
</style>
