<template>
  <view class="price-tag" :class="{ 'price-tag--large': large }">
    <text class="price-tag__symbol">¥</text>
    <text class="price-tag__value">{{ displayPrice }}</text>
    <text v-if="originalPrice" class="price-tag__original">¥{{ formatOriginal }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    price: number;
    originalPrice?: number;
    large?: boolean;
}>(), { large: false });

const displayPrice = computed(() => (props.price / 100).toFixed(2));
const formatOriginal = computed(() => props.originalPrice ? (props.originalPrice / 100).toFixed(2) : '');
</script>

<style lang="scss" scoped>
.price-tag {
    display: inline-flex; align-items: baseline;
    color: $price-color;
    &__symbol { font-size: 24rpx; }
    &__value { font-size: 32rpx; font-weight: bold; }
    &--large &__value { font-size: 48rpx; }
    &--large &__symbol { font-size: 28rpx; }
    &__original { font-size: 22rpx; color: #999; text-decoration: line-through; margin-left: 8rpx; }
}
</style>