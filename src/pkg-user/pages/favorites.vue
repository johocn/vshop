<template>
  <view class="fav-page">
    <view
      v-for="f in items"
      :key="f.productId"
      class="fav-card"
      :class="{ 'fav-card--off': !f.isOnSale }"
    >
      <view class="fav-card__main" @click="goProduct(f)">
        <view class="fav-card__imgwrap">
          <VImage :src="f.image" height="160rpx" width="160rpx" />
          <view v-if="!f.isOnSale" class="fav-card__badge">{{ t('pointsGoods.offShelf') }}</view>
        </view>
        <view class="fav-card__info">
          <text class="fav-card__name">{{ f.name }}</text>
          <text class="fav-card__price">¥{{ (f.priceWithTax / 100).toFixed(2) }}</text>
          <view
            v-if="f.pointsPrice != null"
            class="fav-card__points"
            @click.stop="goProduct(f)"
          >{{ t('pointsGoods.pointsRedeemable', { n: f.pointsPrice }) }}</view>
        </view>
      </view>
      <view class="fav-card__actions">
        <button class="fav-btn fav-btn--ghost" @click="removeFavorite(f)">{{ t('pointsGoods.removeFavorite') }}</button>
        <button class="fav-btn" :disabled="!f.isOnSale" @click="goProduct(f)">{{ t('pointsGoods.goBuy') }}</button>
      </view>
    </view>

    <EmptyState
      v-if="items.length === 0 && !loading"
      :text="t('pointsGoods.emptyFavorites')"
      :button-text="t('pointsGoods.goShopping')"
      @action="goShopping"
    />
    <view v-if="loading" class="fav-page__loading">{{ t('common.loading') }}</view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onReachBottom } from '@dcloudio/uni-app';
import { getMyFavorites, toggleProductFavorite } from '../../api/queries/points-mall';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUIStore();

const { items, loading, loadMore } = usePagination<any>({
    fetchFn: async ({ take, skip }) => {
        if (!auth.isLoggedIn) return { items: [], totalItems: 0 };
        const r: any = await getMyFavorites({ take, skip });
        return r?.myFavorites || { items: [], totalItems: 0 };
    },
});

onMounted(() => {
    if (!auth.isLoggedIn) auth.requireLogin('/pkg-user/pages/favorites');
});

onReachBottom(() => loadMore());

/** 取消收藏：成功后本地移除 */
async function removeFavorite(f: any) {
    try {
        await toggleProductFavorite(String(f.productId));
        items.value = items.value.filter((i: any) => String(i.productId) !== String(f.productId));
        ui.showToast(t('pointsGoods.favoriteRemoved'), 'success');
    } catch (e: any) {
        ui.showToast(e?.response?.errors?.[0]?.message || e?.message || t('pointsGoods.operationFailed'), 'error');
    }
}

/** myFavorites 无积分商品 id，卡片/角标统一跳普通商品详情 */
function goProduct(f: any) {
    uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + f.slug });
}

function goShopping() {
    uni.switchTab({ url: '/pages/category/index' });
}
</script>

<style lang="scss" scoped>
.fav-page {
    min-height: 100vh;
    background: $bg-color;
    padding: 20rpx;
    padding-bottom: 40rpx;
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}
.fav-card {
    background: #fff;
    border-radius: $radius-md;
    padding: 24rpx;
    margin-bottom: 20rpx;
    &--off { opacity: .55; }
    &__main { display: flex; gap: 20rpx; }
    &__imgwrap { position: relative; flex-shrink: 0; }
    &__badge {
        position: absolute;
        top: 0;
        right: 0;
        background: rgba(0, 0, 0, .6);
        color: #fff;
        font-size: 20rpx;
        padding: 4rpx 12rpx;
        border-radius: 0 0 0 $radius-sm;
    }
    &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    &__name {
        font-size: 28rpx;
        color: $text-color;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
    }
    &__price { font-size: 30rpx; font-weight: bold; color: $price-color; }
    &__points {
        align-self: flex-start;
        font-size: 22rpx;
        color: $brand-color;
        background: $brand-color-light;
        padding: 6rpx 16rpx;
        border-radius: $radius-sm;
    }
    &__actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 20rpx; }
}
.fav-btn {
    background: $brand-color;
    color: #fff;
    font-size: 26rpx;
    padding: 0 30rpx;
    height: 60rpx;
    line-height: 60rpx;
    border-radius: 30rpx;
    border: none;
    &--ghost { background: #fff; color: #666; border: 1rpx solid $border-color; }
}
</style>
