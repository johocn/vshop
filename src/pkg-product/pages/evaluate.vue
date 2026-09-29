<template>
  <view class="review-page">
    <view class="review-tabs">
      <text
        v-for="tab in tabs"
        :key="tab.key"
        class="review-tab"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >{{ t(tab.labelKey) }}（{{ tabCount(tab.key) }}）</text>
    </view>
    <view class="review-summary" v-if="stats">
      <text class="review-summary__score">{{ stats.averageRating }} {{ t('review.scoreUnit') }}</text>
      <text class="review-summary__rate">{{ t('review.goodRate') }} {{ stats.goodRate }}%</text>
    </view>

    <scroll-view class="review-page__scroll" scroll-y @scrolltolower="loadMore">
      <ReviewItem
        v-for="r in reviews"
        :key="r.id"
        :review="r"
        :variant-map="variantTextMap"
        :max-images="9"
      />
      <view class="review-page__footer">
        <LoadingSkeleton v-if="loading && reviews.length === 0" type="list" :count="2" />
        <text v-else-if="!hasMore && reviews.length > 0" class="footer-text">{{ t('review.noMore') }}</text>
        <EmptyState v-if="!loading && reviews.length === 0" :text="t('review.empty')" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onReachBottom } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getProduct } from '../../api/queries/product';
import { getProductReviews, getReviewStats } from '../../api/queries/review';
import ReviewItem from '../../components/ReviewItem.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

type TabKey = 'all' | 'good' | 'middle' | 'bad';
/** 与 vendure 只有 rating(Int) 对齐：好评 4-5、中评 3、差评 1-2（spec §4.7） */
const RATING_RANGE: Record<TabKey, { ratingMin?: number; ratingMax?: number }> = {
    all: {},
    good: { ratingMin: 4, ratingMax: 5 },
    middle: { ratingMin: 3, ratingMax: 3 },
    bad: { ratingMin: 1, ratingMax: 2 },
};

const { t } = useI18n();
const product = ref<any>(null);
const stats = ref<any>(null);
const reviews = ref<any[]>([]);
const activeTab = ref<TabKey>('all');
const loading = ref(false);
const hasMore = ref(true);
const tabs: Array<{ key: TabKey; labelKey: string }> = [
    { key: 'all', labelKey: 'review.all' },
    { key: 'good', labelKey: 'review.good' },
    { key: 'middle', labelKey: 'review.middle' },
    { key: 'bad', labelKey: 'review.bad' },
];
let skip = 0;
const take = 10;

const variantTextMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const v of product.value?.variants || []) {
        map[String(v.id)] = (v.options || []).map((o: any) => o.name).join(' / ');
    }
    return map;
});

/** 分档计数由 reviewStats.ratingDistribution 前端求和，不新增接口（spec §4.3） */
function tabCount(key: TabKey): number {
    const s = stats.value;
    if (!s) return 0;
    if (key === 'all') return s.totalCount || 0;
    const dist: any[] = s.ratingDistribution || [];
    const sum = (from: number, to: number) =>
        dist.filter((d) => d.rating >= from && d.rating <= to).reduce((acc, d) => acc + (d.count || 0), 0);
    if (key === 'good') return sum(4, 5);
    if (key === 'middle') return sum(3, 3);
    return sum(1, 2);
}

onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const slug = page?.options?.slug;
    if (!slug) return;
    try {
        const res: any = await getProduct(slug);
        product.value = res.product;
    } catch (e) {
        console.error(e);
    }
    const pid = product.value?.id;
    if (!pid) return;
    try {
        const s: any = await getReviewStats(String(pid));
        stats.value = s.reviewStats;
    } catch (e) {
        console.error(e);
    }
    await loadData();
});

onReachBottom(() => loadMore());

async function loadData() {
    if (loading.value || !hasMore.value) return;
    const pid = product.value?.id;
    if (!pid) return;
    loading.value = true;
    try {
        const res: any = await getProductReviews(String(pid), { take, skip, ...RATING_RANGE[activeTab.value] });
        const items = res.productReviews?.items || [];
        reviews.value = [...reviews.value, ...items];
        const total = res.productReviews?.totalItems || 0;
        skip += items.length;
        hasMore.value = items.length > 0 && reviews.value.length < total;
    } catch (e: any) {
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
    loading.value = false;
}

function loadMore() {
    loadData();
}

function switchTab(key: TabKey) {
    if (activeTab.value === key) return;
    activeTab.value = key;
    skip = 0;
    hasMore.value = true;
    reviews.value = [];
    loadData();
}
</script>

<style lang="scss" scoped>
.review-page { display: flex; flex-direction: column; height: 100vh; background: #f5f5f5;
    &__scroll { flex: 1; padding: 0 20rpx; }
    &__footer { padding: 30rpx; text-align: center; }
}
.review-tabs { display: flex; background: #fff; border-bottom: 1rpx solid $border-color; }
.review-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 25rpx; color: $text-color-secondary;
    &.active { color: $brand-color; font-weight: bold; }
}
.review-summary { display: flex; align-items: center; gap: 16rpx; background: #fff; padding: 16rpx 24rpx;
    &__score { font-size: 28rpx; color: $price-color; font-weight: bold; }
    &__rate { font-size: 24rpx; color: $text-color-secondary; }
}
.footer-text { font-size: 24rpx; color: #999; }
</style>
