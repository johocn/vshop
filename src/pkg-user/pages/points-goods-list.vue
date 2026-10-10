<template>
  <view class="pgl-page">
    <!-- 顶部积分余额卡 -->
    <view class="pgl-page__top">
      <view class="pgl-page__top-info">
        <text class="pgl-page__label">{{ t('pointsGoods.myPoints') }}</text>
        <text class="pgl-page__points">{{ points ?? '--' }}</text>
      </view>
      <button class="pgl-page__btn" @click="goCouponMall">{{ t('pointsGoods.goExchangeCoupons') }}</button>
    </view>

    <!-- 商品两列网格 -->
    <view class="pgl-grid">
      <view
        v-for="g in items"
        :key="g.id"
        class="pgl-card"
        :class="{ 'pgl-card--soldout': !g.inStock }"
        @click="goDetail(g)"
      >
        <view class="pgl-card__imgwrap">
          <VImage :src="g.image" height="320rpx" />
          <view v-if="!g.inStock" class="pgl-card__badge">{{ t('pointsGoods.soldOut') }}</view>
        </view>
        <view class="pgl-card__body">
          <text class="pgl-card__name">{{ g.name }}</text>
          <view class="pgl-card__price">
            <text class="pgl-card__points">{{ g.pointsPrice }}{{ t('pointsGoods.pointsUnit') }}</text>
            <text v-if="g.cashPrice > 0" class="pgl-card__cash">+¥{{ (g.cashPrice / 100).toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

    <EmptyState v-if="items.length === 0 && !loading" :text="t('pointsGoods.emptyGoods')" />
    <view v-if="loading" class="pgl-page__loading">{{ t('common.loading') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onReachBottom } from '@dcloudio/uni-app';
import { getMyMemberInfo } from '../../api/queries/member';
import { getPointsProducts } from '../../api/queries/points-mall';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const points = ref<number | null>(null);

const { items, loading, loadMore } = usePagination<any>({
    fetchFn: async ({ take, skip }) => {
        const r: any = await getPointsProducts({ take, skip });
        return r?.pointsProducts || { items: [], totalItems: 0 };
    },
});

onMounted(async () => {
    if (!auth.isLoggedIn) return; // 游客不查余额，避免 401 噪音
    try {
        const r: any = await getMyMemberInfo();
        points.value = r?.myMemberInfo?.points ?? null;
    } catch (e) {
        points.value = null;
    }
});

onReachBottom(() => loadMore());

function goCouponMall() {
    uni.navigateTo({ url: '/pkg-user/pages/points-mall' });
}

function goDetail(g: any) {
    uni.navigateTo({ url: '/pkg-user/pages/points-goods-detail?id=' + g.id });
}
</script>

<style lang="scss" scoped>
.pgl-page {
    min-height: 100vh;
    background: $bg-color;
    padding-bottom: 40rpx;
    &__top {
        background: $brand-color;
        color: #fff;
        padding: 40rpx 30rpx;
        display: flex;
        justify-content: space-between;
        align-items: center;
        &-info { display: flex; flex-direction: column; }
    }
    &__label { font-size: 24rpx; opacity: .9; }
    &__points { font-size: 52rpx; font-weight: bold; margin-top: 8rpx; }
    &__btn {
        background: rgba(255, 255, 255, .2);
        color: #fff;
        font-size: 26rpx;
        padding: 0 28rpx;
        height: 64rpx;
        line-height: 64rpx;
        border-radius: 32rpx;
        border: none;
    }
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}
.pgl-grid {
    display: flex;
    flex-wrap: wrap;
    padding: 20rpx;
    gap: 20rpx;
}
.pgl-card {
    width: calc(50% - 10rpx);
    background: #fff;
    border-radius: $radius-md;
    overflow: hidden;
    &--soldout { opacity: .55; }
    &__imgwrap { position: relative; }
    &__badge {
        position: absolute;
        top: 0;
        right: 0;
        background: rgba(0, 0, 0, .6);
        color: #fff;
        font-size: 22rpx;
        padding: 6rpx 18rpx;
        border-radius: 0 0 0 $radius-md;
    }
    &__body { padding: 16rpx 20rpx 20rpx; }
    &__name {
        font-size: 28rpx;
        color: $text-color;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        line-height: 1.4;
        min-height: 78rpx;
    }
    &__price { display: flex; align-items: baseline; margin-top: 10rpx; flex-wrap: wrap; }
    &__points { font-size: 34rpx; font-weight: bold; color: $brand-color; }
    &__cash { font-size: 24rpx; color: $brand-color; margin-left: 8rpx; }
}
</style>
