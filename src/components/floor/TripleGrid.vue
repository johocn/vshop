<template>
  <view class="triple-grid" :class="{ 'triple-grid--double': isNarrowScreen }">
    <view
      v-for="item in items"
      :key="item.id"
      class="triple-grid__item"
      @click="$emit('click-item', item.product.slug)"
    >
      <VImage :src="item.product.featuredAsset?.preview || ''" width="100%" height="180rpx" />
      <text class="item-name">{{ item.product.name }}</text>
      <text v-if="itemLabel(item)" class="item-label">{{ itemLabel(item) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import VImage from '../VImage.vue';
import type { FloorItemConfig } from '../../api/queries/collection';

interface FloorProduct {
    id: string;
    productId: string;
    product: { id: string; name: string; slug: string; featuredAsset: { preview: string } | null };
}

const props = defineProps<{
    items: FloorProduct[];
    itemConfig: FloorItemConfig[];
}>();

defineEmits<{ 'click-item': [slug: string] }>();

const isNarrowScreen = ref(false);

function checkScreen() {
    // #ifdef H5
    isNarrowScreen.value = window.innerWidth < 480;
    // #endif
}

onMounted(() => {
    // #ifdef H5
    window.addEventListener('resize', checkScreen);
    checkScreen();
    // #endif
});

onUnmounted(() => {
    // #ifdef H5
    window.removeEventListener('resize', checkScreen);
    // #endif
});

function itemLabel(item: FloorProduct): string {
    const cfg = props.itemConfig.find(c => c.productId === item.productId);
    return cfg?.label || '';
}
</script>

<style lang="scss" scoped>
.triple-grid {
    display: flex; flex-wrap: wrap; gap: 12rpx; padding: 0 20rpx;
    &__item { width: calc(33.33% - 8rpx); background: $bg-color; border-radius: $radius-md; overflow: hidden; position: relative; }
    &--double .triple-grid__item { width: calc(50% - 6rpx); }
}
.item-name { font-size: 22rpx; padding: 6rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 56rpx; }
.item-label { position: absolute; top: 6rpx; left: 6rpx; background: $brand-color; color: #fff; font-size: 18rpx; padding: 2rpx 6rpx; border-radius: 4rpx; }
</style>
