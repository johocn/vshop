<template>
  <view class="search-bar">
    <view class="search-bar__inner">
      <text class="search-bar__icon">🔍</text>
      <input
        class="search-bar__input"
        v-model="keyword"
        :placeholder="placeholder"
        confirm-type="search"
        @confirm="doSearch"
      />
      <text v-if="keyword" class="search-bar__clear" @click="clearSearch">×</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
    placeholder?: string;
    modelValue?: string;
}>();
const emit = defineEmits<{
    'update:modelValue': [value: string];
    'search': [value: string];
}>();

const keyword = ref(props.modelValue || '');

function doSearch() {
    emit('update:modelValue', keyword.value);
    emit('search', keyword.value);
}

function clearSearch() {
    keyword.value = '';
    emit('update:modelValue', '');
    emit('search', '');
}
</script>

<style lang="scss" scoped>
.search-bar {
    padding: 16rpx 20rpx; background: #fff; position: sticky; top: 0; z-index: 10;
    &__inner { display: flex; align-items: center; background: #f5f5f5; border-radius: 40rpx; padding: 0 24rpx; height: 72rpx; }
    &__icon { font-size: 28rpx; margin-right: 12rpx; }
    &__input { flex: 1; font-size: 28rpx; height: 72rpx; }
    &__clear { font-size: 36rpx; color: #999; padding: 0 12rpx; }
}
</style>
