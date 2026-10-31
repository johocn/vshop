<template>
  <view v-if="hasContent" class="trust-card">
    <view class="trust-card__head">
      <text class="trust-card__title">{{ t('review.trustTitle') }}</text>
      <view class="trust-card__badges">
        <text v-if="averageRating != null" class="trust-card__badge">{{ averageRating }} {{ t('review.scoreUnit') }}</text>
        <text v-if="goodRate != null" class="trust-card__badge">{{ t('review.trustGoodRate', { n: goodRate }) }}</text>
        <text class="trust-card__badge">{{ t('review.trustReal') }}</text>
      </view>
    </view>
    <!-- 固定顺序：质量 → 服务 → 时间；关闭的行不展示，空文案回落默认 -->
    <view v-for="row in ROWS" :key="row.key" class="trust-card__row">
      <text class="trust-card__label">{{ t(row.labelKey) }}</text>
      <text class="trust-card__text">{{ row.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchStoreTrust, type StoreTrustCopy } from '../api/queries/trust';

const props = withDefaults(defineProps<{
    /** 商品平均分（评价列表页有）,可空 */
    averageRating?: number | string | null;
    /** 好评率 0-100（评价列表页有），可空 */
    goodRate?: number | string | null;
}>(), {
    averageRating: null,
    goodRate: null,
});

const { t } = useI18n();

/** 店铺级信任文案（§113）：一次会话缓存；未配置/失败即三行默认文案 */
const trust = ref<StoreTrustCopy>({
    qualityEnabled: true,
    qualityText: null,
    serviceEnabled: true,
    serviceText: null,
    timeEnabled: true,
    timeText: null,
});

onMounted(async () => {
    trust.value = await fetchStoreTrust();
});

/** 三项顺序固定为 质量 / 服务 / 时间，不随数据源变化；顺带按店铺配置做开关与文案替换 */
const ROWS = computed(() => {
    const cfg = trust.value;
    return [
        { key: 'quality', labelKey: 'review.trustQuality', enabled: cfg.qualityEnabled, text: cfg.qualityText, fallbackKey: 'review.trustQualityText' },
        { key: 'service', labelKey: 'review.trustService', enabled: cfg.serviceEnabled, text: cfg.serviceText, fallbackKey: 'review.trustServiceText' },
        { key: 'time', labelKey: 'review.trustTime', enabled: cfg.timeEnabled, text: cfg.timeText, fallbackKey: 'review.trustTimeText' },
    ]
        .filter(row => row.enabled)
        .map(row => ({ ...row, text: (row.text ?? '').trim() || t(row.fallbackKey) }));
});

/** 三行全关且无评分徽章时整卡不展示，避免只剩一个空标题 */
const hasContent = computed(() => ROWS.value.length > 0 || props.averageRating != null || props.goodRate != null);
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
