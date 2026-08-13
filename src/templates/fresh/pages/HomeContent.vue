<template>
  <view class="fresh-home">
    <view class="fresh-home__hero">
      <text class="fresh-home__title">新鲜好物</text>
      <text class="fresh-home__subtitle">每天为你精选</text>
    </view>
    <view class="fresh-home__shortcuts">
      <view class="shortcut" @click="navTo('/pkg-promotion/pages/flash-sale')"><text>⚡ 秒杀</text></view>
      <view class="shortcut" @click="navTo('/pkg-promotion/pages/group-buy')"><text>👥 拼团</text></view>
    </view>
    <FloorSection
      v-for="floor in floors"
      :key="floor.id"
      :floor="floor"
      @add-cart="handleFloorAddCart"
    />
    <view v-if="floors.length === 0" class="fresh-home__products">
      <view v-for="p in products" :key="p.productId" class="fresh-product">
        <view class="fresh-product__main" @click="goDetail(p.slug)">
          <VImage :src="p.productAsset?.preview || ''" width="200rpx" height="200rpx" />
          <view class="fresh-product__info">
            <text>{{ p.productName }}</text>
            <PriceTag :price="getMinPrice(p.priceWithTax)" />
          </view>
        </view>
        <view class="fresh-product__cart" @click.stop="handleAddCart(p)">
          <text class="cart-icon">+</text>
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
    try { const res: any = await searchProducts({ take: 10 }); products.value = res.search?.items || []; } catch (e) {}
    try {
        const res: any = await getEnabledFloors();
        const allFloors = res.collections?.items || [];
        floors.value = filterActiveFloors(allFloors).slice(0, 3);
    } catch (e) { console.error('加载楼层失败', e); }

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
.fresh-home {
    &__hero { background: linear-gradient(135deg, #07c160, #4dd599); padding: 60rpx 30rpx; color: #fff; & .fresh-home__title { font-size: 48rpx; font-weight: bold; display: block; } & .fresh-home__subtitle { font-size: 26rpx; opacity: 0.8; } }
    &__shortcuts { display: flex; gap: 16rpx; padding: 20rpx; }
    &__products { padding: 0 20rpx; }
}
.shortcut { flex: 1; background: #fff; padding: 20rpx; border-radius: $radius-md; text-align: center; font-size: 28rpx; box-shadow: $shadow; }
.fresh-product { display: flex; background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 12rpx; align-items: center;
    &__main { flex: 1; display: flex; }
    &__info { flex: 1; padding-left: 16rpx; display: flex; flex-direction: column; justify-content: space-between; font-size: 28rpx; }
    &__cart { width: 56rpx; height: 56rpx; background: #07c160; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        .cart-icon { color: #fff; font-size: 32rpx; line-height: 1; }
    }
}
</style>
