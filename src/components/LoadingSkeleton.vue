<template>
  <view class="skeleton" :class="'skeleton--' + type">
    <view v-if="type === 'product'" class="skeleton-product">
      <view v-for="i in count" :key="i" class="skeleton-product__item">
        <view class="skeleton-product__img skeleton-animate"></view>
        <view class="skeleton-product__info">
          <view class="skeleton-product__title skeleton-animate"></view>
          <view class="skeleton-product__price skeleton-animate"></view>
        </view>
      </view>
    </view>
    <view v-else-if="type === 'list'" class="skeleton-list">
      <view v-for="i in count" :key="i" class="skeleton-list__item">
        <view class="skeleton-list__avatar skeleton-animate"></view>
        <view class="skeleton-list__content">
          <view class="skeleton-list__line skeleton-animate" style="width: 80%"></view>
          <view class="skeleton-list__line skeleton-animate" style="width: 60%"></view>
        </view>
      </view>
    </view>
    <view v-else class="skeleton-card">
      <view v-for="i in count" :key="i" class="skeleton-card__block">
        <view class="skeleton-card__header skeleton-animate"></view>
        <view class="skeleton-card__body skeleton-animate"></view>
        <view class="skeleton-card__footer skeleton-animate"></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
    type?: 'product' | 'list' | 'card';
    count?: number;
}>();
</script>

<style lang="scss" scoped>
.skeleton-animate {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: $radius-sm;
}
@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
.skeleton-product {
    display: flex; flex-wrap: wrap; padding: 16rpx;
    &__item { width: calc(50% - 16rpx); margin: 8rpx; background: #fff; border-radius: $radius-md; overflow: hidden; }
    &__img { width: 100%; height: 320rpx; }
    &__info { padding: 16rpx; }
    &__title { height: 36rpx; margin-bottom: 12rpx; }
    &__price { height: 32rpx; width: 40%; }
}
.skeleton-list {
    padding: 20rpx;
    &__item { display: flex; gap: 20rpx; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
    &__avatar { width: 100rpx; height: 100rpx; border-radius: $radius-md; flex-shrink: 0; }
    &__content { flex: 1; display: flex; flex-direction: column; gap: 16rpx; }
    &__line { height: 28rpx; }
}
.skeleton-card {
    padding: 20rpx;
    &__block { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx; }
    &__header { height: 36rpx; width: 50%; margin-bottom: 20rpx; }
    &__body { height: 120rpx; margin-bottom: 16rpx; }
    &__footer { height: 28rpx; width: 30%; }
}
</style>
