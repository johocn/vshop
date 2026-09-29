<template>
  <view class="review-item">
    <view class="review-item__head">
      <text class="review-item__avatar">{{ avatarText }}</text>
      <text class="review-item__name">{{ review.customerName || t('review.anonymousUser') }}</text>
      <text class="review-item__date">{{ dateText }}</text>
    </view>
    <text class="review-item__stars">{{ starText }}</text>
    <text v-if="specText" class="review-item__spec">{{ specText }}</text>
    <text class="review-item__content">{{ review.content }}</text>
    <view v-if="images.length" class="review-item__images">
      <view v-for="(img, i) in images" :key="i" class="review-item__img" @click="preview(i)">
        <VImage :src="img" width="200rpx" height="200rpx" />
      </view>
    </view>
    <view v-if="review.reply" class="review-item__reply" @click="replyExpanded = !replyExpanded">
      <text class="review-item__reply-label">{{ t('review.reply') }}</text>
      <text class="review-item__reply-text" :class="{ 'review-item__reply-text--clamp': !replyExpanded }">{{ review.reply }}</text>
      <text class="review-item__reply-toggle">{{ replyExpanded ? t('review.collapse') : t('review.expand') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import VImage from './VImage.vue';

const props = withDefaults(defineProps<{
    review: any;
    /** variantId → 规格文案（如「红色 / L」），由调用方按商品 variants 构建 */
    variantMap?: Record<string, string>;
    /** 最多展示几张图：详情页 3，评价页 9 */
    maxImages?: number;
}>(), {
    variantMap: () => ({}),
    maxImages: 9,
});

const { t } = useI18n();
const replyExpanded = ref(false);

const avatarText = computed(() => {
    const name = String(props.review?.customerName || '');
    return name ? name.slice(0, 1) : t('review.anonymousUser').slice(0, 1);
});

const dateText = computed(() => {
    const raw = props.review?.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
});

const starText = computed(() => {
    const rating = Math.min(5, Math.max(0, Number(props.review?.rating) || 0));
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
});

const specText = computed(() => {
    const vid = props.review?.variantId;
    if (!vid) return '';
    return props.variantMap?.[String(vid)] || '';
});

const images = computed<string[]>(() => (props.review?.images || []).slice(0, props.maxImages));

function preview(index: number) {
    const urls = props.review?.images || [];
    if (!urls.length) return;
    uni.previewImage({ urls, current: urls[index] });
}
</script>

<style lang="scss" scoped>
.review-item { background: #fff; padding: 24rpx 0; border-bottom: 1rpx solid $border-color;
    &__head { display: flex; align-items: center; gap: 12rpx; }
    &__avatar { width: 56rpx; height: 56rpx; border-radius: 50%; background: $brand-color-light; color: $brand-color; font-size: 26rpx; text-align: center; line-height: 56rpx; }
    &__name { flex: 1; font-size: 26rpx; color: $text-color; }
    &__date { font-size: 22rpx; color: #999; }
    &__stars { display: block; margin-top: 10rpx; font-size: 24rpx; color: $price-color; letter-spacing: 2rpx; }
    &__spec { display: block; margin-top: 6rpx; font-size: 22rpx; color: #999; }
    &__content { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 10rpx; font-size: 26rpx; color: $text-color; line-height: 1.5; }
    &__images { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
    &__img { width: 200rpx; height: 200rpx; border-radius: $radius-sm; overflow: hidden; }
    &__reply { margin-top: 14rpx; padding: 16rpx; background: #f7f7f7; border-radius: $radius-sm; }
    &__reply-label { font-size: 22rpx; color: $brand-color; display: block; }
    &__reply-text { font-size: 24rpx; color: $text-color-secondary; line-height: 1.5; display: block; margin-top: 6rpx;
        &--clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    }
    &__reply-toggle { font-size: 22rpx; color: $brand-color; display: block; margin-top: 6rpx; }
}
</style>
