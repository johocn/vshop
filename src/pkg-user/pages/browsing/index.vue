<template>
  <view class="browsing-page">
    <!-- 顶部清空入口（有记录才显示） -->
    <view v-if="items.length" class="browsing-page__toolbar">
      <text class="browsing-page__clear" @click="onClearAll">{{ t('browsing.clear') }}</text>
    </view>

    <!-- 按今天/昨天/更早分组渲染 -->
    <view v-for="g in groups" :key="g.label" class="browsing-page__group">
      <text class="browsing-page__group-title">{{ t('browsing.' + g.label) }}</text>
      <view v-for="it in g.items" :key="it.slug" class="browse-item">
        <view class="browse-item__main" @click="goDetail(it.slug)">
          <view class="browse-item__imgwrap">
            <VImage :src="it.image" width="112rpx" height="112rpx" mode="aspectFill" />
          </view>
          <view class="browse-item__info">
            <text class="browse-item__name">{{ it.name }}</text>
            <PriceTag :price="it.price" />
          </view>
        </view>
        <text class="browse-item__del" @click.stop="onRemove(it)">×</text>
      </view>
    </view>

    <EmptyState v-if="!items.length" :text="t('browsing.empty')" />
    <text class="browsing-page__tip">{{ t('browsing.localTip') }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBrowsingHistory, type BrowsingItem } from '../../../composables/useBrowsingHistory';
import VImage from '../../../components/VImage.vue';
import PriceTag from '../../../components/PriceTag.vue';
import EmptyState from '../../../components/EmptyState.vue';

const { t } = useI18n();
const { list: items, remove, clear, groupByDay } = useBrowsingHistory();

const groups = computed(() => groupByDay(items.value));

function goDetail(slug: string) {
    uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug });
}

/** 单删一条足迹 */
function onRemove(it: BrowsingItem) {
    remove(it.slug);
}

/** 清空足迹：showModal 二次确认 */
function onClearAll() {
    uni.showModal({
        title: t('browsing.clear'),
        success: (res: any) => {
            if (res.confirm) clear();
        },
    });
}
</script>

<style lang="scss" scoped>
.browsing-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx;
    &__toolbar { display: flex; justify-content: flex-end; margin-bottom: 8rpx; }
    &__clear { font-size: 26rpx; color: $text-color-secondary; padding: 8rpx 0; }
    &__group { margin-bottom: 24rpx; }
    &__group-title { display: block; font-size: 28rpx; font-weight: bold; color: $text-color; padding: 8rpx 0 16rpx; }
    &__tip { display: block; text-align: center; font-size: 22rpx; color: #bbb; padding: 40rpx 0 20rpx; }
}
.browse-item {
    position: relative; background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx;
    &__main { display: flex; gap: 20rpx; align-items: center; }
    &__imgwrap { flex-shrink: 0; border-radius: $radius-sm; overflow: hidden; }
    &__info {
        flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; align-self: stretch;
    }
    &__name {
        font-size: 28rpx; color: $text-color;
        display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
    }
    &__del {
        position: absolute; top: 8rpx; right: 20rpx; font-size: 36rpx; color: #ccc; padding: 8rpx;
    }
}
</style>
