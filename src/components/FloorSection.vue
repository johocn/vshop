<template>
  <view class="floor-section" :style="{ backgroundColor: theme.backgroundColor || '#fff' }">
    <view class="floor-section__header" @click="goCollectionList">
      <view class="header-left">
        <text v-if="theme.titleIcon" class="header-icon">{{ theme.titleIcon }}</text>
        <text class="header-title">{{ floor.customFields?.floorTitle || floor.name }}</text>
      </view>
      <view class="header-right">
        <text v-if="floor.customFields?.floorSubtitle" class="header-subtitle">{{ floor.customFields.floorSubtitle }}</text>
        <text class="header-more">查看更多 ›</text>
      </view>
    </view>
    <component
      :is="layoutComponent"
      :items="validItems"
      :item-config="floor.customFields?.floorItemConfig || []"
      @click-item="goDetail"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SingleScroll from './floor/SingleScroll.vue';
import DoubleGrid from './floor/DoubleGrid.vue';
import TripleGrid from './floor/TripleGrid.vue';
import HeroWithList from './floor/HeroWithList.vue';
import type { FloorCollection } from '../api/queries/collection';

const props = defineProps<{ floor: FloorCollection }>();

const layoutMap: Record<string, any> = {
    single_scroll: SingleScroll,
    double_grid: DoubleGrid,
    triple_grid: TripleGrid,
    hero_with_list: HeroWithList,
};

const layoutComponent = computed(() => {
    const layout = props.floor.customFields?.floorLayout || 'double_grid';
    return layoutMap[layout] || DoubleGrid;
});

const theme = computed(() => props.floor.customFields?.floorTheme || { primaryColor: '#ff6600', backgroundColor: '#fff', titleIcon: '' });

// 过滤掉 floorItemConfig 中找不到对应商品的项（悬挂引用跳过）
// 同时保留 productVariants 中所有商品（即使 itemConfig 没有对应配置，只是 label 为空）
const validItems = computed(() => {
    const variants = props.floor.productVariants?.items || [];
    const itemConfig = props.floor.customFields?.floorItemConfig || [];
    const configProductIds = new Set(itemConfig.map(c => c.productId));
    // 只保留在 itemConfig 中有配置的商品（如果 itemConfig 非空）
    // 如果 itemConfig 为空，则保留所有商品
    if (configProductIds.size === 0) return variants;
    return variants.filter(v => configProductIds.has(v.productId));
});

function goDetail(slug: string) {
    uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug });
}

function goCollectionList() {
    uni.navigateTo({ url: '/pkg-product/pages/list?collectionSlug=' + props.floor.slug });
}
</script>

<style lang="scss" scoped>
.floor-section {
    margin-bottom: 20rpx;
    &__header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx; }
}
.header-left { display: flex; align-items: center; gap: 8rpx; }
.header-icon { font-size: 32rpx; }
.header-title { font-size: 32rpx; font-weight: bold; color: #333; }
.header-right { display: flex; align-items: center; gap: 12rpx; }
.header-subtitle { font-size: 24rpx; color: #999; }
.header-more { font-size: 24rpx; color: $brand-color; }
</style>
