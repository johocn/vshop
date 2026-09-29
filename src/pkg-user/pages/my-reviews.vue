<template>
  <view class="mr-page">
    <view class="mr-tabs">
      <text
        v-for="tab in tabs"
        :key="tab.key"
        class="mr-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >{{ t(tab.labelKey) }}（{{ tabCount(tab.key) }}）</text>
    </view>

    <view v-for="item in visibleItems" :key="item.review.id" class="mr-item">
      <view class="mr-item__head">
        <VImage :src="item.product?.featuredAsset?.preview || ''" width="120rpx" height="120rpx" />
        <view class="mr-item__info">
          <text class="mr-item__name">{{ item.product?.name || '' }}</text>
          <view class="mr-item__meta">
            <text class="mr-item__stars">{{ starText(item.review.rating) }}</text>
            <text class="mr-item__date">{{ dateText(item.review.createdAt) }}</text>
          </view>
        </view>
        <text class="mr-item__status" :class="'mr-item__status--' + item.review.status">{{ statusText(item.review.status) }}</text>
      </view>
      <text class="mr-item__content">{{ item.review.content }}</text>
    </view>

    <EmptyState v-if="!loading && visibleItems.length === 0" :text="t('review.empty')" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getMyReviews } from '../../api/queries/review';
import { getProductsByIds } from '../../api/queries/product';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import EmptyState from '../../components/EmptyState.vue';

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';

const { t } = useI18n();
const auth = useAuthStore();
const items = ref<Array<{ review: any; product: any }>>([]);
const loading = ref(false);
const activeTab = ref<TabKey>('all');
const tabs: Array<{ key: TabKey; labelKey: string }> = [
    { key: 'all', labelKey: 'review.all' },
    { key: 'pending', labelKey: 'review.statusPending' },
    { key: 'approved', labelKey: 'review.statusApproved' },
    { key: 'rejected', labelKey: 'review.statusRejected' },
];

const visibleItems = computed(() =>
    activeTab.value === 'all' ? items.value : items.value.filter((i) => i.review.status === activeTab.value),
);

function tabCount(key: TabKey): number {
    return key === 'all' ? items.value.length : items.value.filter((i) => i.review.status === key).length;
}

function statusText(status: string): string {
    if (status === 'pending') return t('review.statusPending');
    if (status === 'approved') return t('review.statusApproved');
    if (status === 'rejected') return t('review.statusRejected');
    return status;
}

function starText(rating: number): string {
    const r = Math.min(5, Math.max(0, Number(rating) || 0));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function dateText(raw: string): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

onMounted(async () => {
    if (!auth.isLoggedIn) {
        auth.requireLogin('/pkg-user/pages/my-reviews');
        return;
    }
    loading.value = true;
    try {
        const res: any = await getMyReviews();
        // myReviews 无 status 过滤且未剔除 deleted，前端自行剔除
        const list = (res.myReviews || []).filter((r: any) => r.status !== 'deleted');
        const ids = Array.from(new Set(list.map((r: any) => String(r.productId)).filter(Boolean)));
        // getProductsByIds 查不到的 id 不返回 → 该条商品信息缺失时跳过
        const products = ids.length ? await getProductsByIds(ids) : [];
        const map = new Map<string, any>(products.map((p: any) => [String(p.id), p]));
        items.value = list
            .map((r: any) => ({ review: r, product: map.get(String(r.productId)) }))
            .filter((i: any) => !!i.product);
    } catch (e: any) {
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
    loading.value = false;
});
</script>

<style lang="scss" scoped>
.mr-page { padding: 0 20rpx 40rpx; }
.mr-tabs { display: flex; background: #fff; border-radius: $radius-md; margin: 20rpx 0; }
.mr-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 24rpx; color: $text-color-secondary;
    &.active { color: $brand-color; font-weight: bold; }
}
.mr-item { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx;
    &__head { display: flex; gap: 16rpx; align-items: flex-start; }
    &__info { flex: 1; }
    &__name { font-size: 26rpx; color: $text-color; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__meta { display: flex; align-items: center; gap: 12rpx; margin-top: 8rpx; }
    &__stars { font-size: 22rpx; color: $price-color; letter-spacing: 2rpx; }
    &__date { font-size: 22rpx; color: #999; }
    &__status { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 20rpx; flex-shrink: 0;
        &--pending { color: $price-color; background: #fff3e6; }
        &--approved { color: #07c160; background: #eafaf0; }
        &--rejected { color: #e34d59; background: #fdecee; }
    }
    &__content { display: block; margin-top: 12rpx; font-size: 26rpx; color: $text-color-secondary; line-height: 1.5; }
}
</style>
