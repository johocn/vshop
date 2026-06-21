<template>
  <view class="empty-state">
    <text class="empty-state__icon">📦</text>
    <text class="empty-state__text">{{ text }}</text>
    <button v-if="buttonText" class="empty-state__btn" @click="$emit('action')">{{ buttonText }}</button>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ text?: string; buttonText?: string }>(), { text: '暂无数据' });
defineEmits(['action']);
</script>

<style lang="scss" scoped>
.empty-state {
    display: flex; flex-direction: column; align-items: center; padding: 100rpx 40rpx;
    &__icon { font-size: 120rpx; margin-bottom: 20rpx; }
    &__text { font-size: 28rpx; color: #999; margin-bottom: 30rpx; }
    &__btn { font-size: 28rpx; color: $brand-color; border: 1rpx solid $brand-color; padding: 12rpx 40rpx; border-radius: $radius-md; }
}
</style>