<template>
  <view class="trust-card">
    <view class="trust-card__head">
      <text class="trust-card__title">{{ t('review.trustTitle') }}</text>
      <view class="trust-card__badges">
        <text v-if="averageRating != null" class="trust-card__badge">{{ averageRating }} {{ t('review.scoreUnit') }}</text>
        <text v-if="goodRate != null" class="trust-card__badge">{{ t('review.trustGoodRate', { n: goodRate }) }}</text>
        <text class="trust-card__badge">{{ t('review.trustReal') }}</text>
      </view>
    </view>
    <!-- 固定顺序：质量 → 服务 → 时间 -->
    <view v-for="row in ROWS" :key="row.key" class="trust-card__row">
      <text class="trust-card__label">{{ t(row.labelKey) }}</text>
      <text class="trust-card__text">{{ t(row.textKey) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

withDefaults(defineProps<{
    /** 商品平均分（评价列表页有）,可空 */
    averageRating?: number | string | null;
    /** 好评率 0-100（评价列表页有），可空 */
    goodRate?: number | string | null;
}>(), {
    averageRating: null,
    goodRate: null,
});

const { t } = useI18n();

/** 三项顺序固定为 质量 / 服务 / 时间，不随数据源变化 */
const ROWS = [
    { key: 'quality', labelKey: 'review.trustQuality', textKey: 'review.trustQualityText' },
    { key: 'service', labelKey: 'review.trustService', textKey: 'review.trustServiceText' },
    { key: 'time', labelKey: 'review.trustTime', textKey: 'review.trustTimeText' },
];
</script>

<style lang="scss" scoped>
.trust-card { background: #fff; border-radius: $radius-md; padding: 20rpx 24rpx; margin-bottom: 20rpx;
    &__head { display: flex; align-items: center; gap: 12rpx; }
    &__title { font-size: 26rpx; font-weight: bold; color: $text-color; flex-shrink: 0; }
    &__badges { display: flex; flex-wrap: wrap; gap: 10rpx; margin-left: auto; justify-content: flex-end; }
    &__badge { font-size: 20rpx; color: #07c160; background: #eafaf0; border-radius: 20rpx; padding: 4rpx 14rpx; }
    &__row { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 14rpx; }
    &__label { font-size: 22rpx; color: $brand-color; background: $brand-color-light; border-radius: 8rpx; padding: 2rpx 12rpx; flex-shrink: 0; }
    &__text { font-size: 22rpx; color: $text-color-secondary; line-height: 1.5; }
}
</style>
