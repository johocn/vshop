<template>
  <view class="orders-page">
    <view class="orders-tabs">
      <text v-for="t in tabs" :key="t.value" class="orders-tab" :class="{ active: activeTab === t.value }" @click="switchTab(t.value)">{{ t.label }}</text>
    </view>
    <scroll-view class="orders-page__scroll" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="refreshing">
      <view v-for="order in orders" :key="order.id" class="order-card" @click="goDetail(order.code)">
        <view class="order-card__header">
          <text class="order-card__code">{{ order.code }}</text>
          <text class="order-card__state">{{ statusMap[order.state] || order.state }}</text>
        </view>
        <view v-for="line in order.lines?.slice(0, 3)" :key="line.id" class="order-card__line">
          <VImage :src="line.featuredAsset?.preview || ''" width="100rpx" height="100rpx" />
          <text class="order-card__name">{{ line.productVariant?.name }}</text>
          <text class="order-card__qty">x{{ line.quantity }}</text>
        </view>
        <view class="order-card__footer">
          <text>共{{ order.totalQuantity }}件</text>
          <PriceTag :price="order.totalWithTax" />
        </view>
        <view class="order-card__actions" v-if="canReview(order) || isFullyReviewed(order)">
          <button v-if="canReview(order)" class="order-card__review-btn" @click.stop="goEvaluate(order.code)">{{ t('review.myOrderReviewBtn') }}</button>
          <text v-else class="order-card__reviewed">{{ t('review.reviewed') }}</text>
        </view>
      </view>
      <view class="orders-page__footer">
        <LoadingSkeleton v-if="loading" type="list" :count="3" />
        <text v-else-if="!hasMore && orders.length > 0" class="footer-text">没有更多了</text>
        <EmptyState v-if="!loading && orders.length === 0" text="暂无订单" />
      </view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getOrders } from '../../api/queries/order';
import { getMyReviews } from '../../api/queries/review';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const { t } = useI18n();
const auth = useAuthStore();
const orders = ref<any[]>([]);
const reviewedLineIds = ref<Set<string>>(new Set());
const loading = ref(false);
const hasMore = ref(true);
const refreshing = ref(false);
const activeTab = ref('');
const tabs = [
    { value: '', label: '全部' }, { value: 'ArrangingPayment', label: '待付款' },
    { value: 'PaymentAuthorized,PaymentSettled', label: '待发货' }, { value: 'Delivered', label: '待收货' },
    { value: 'Cancelled', label: '已取消' },
];
const statusMap: Record<string, string> = { ArrangingPayment:'待付款', Created:'待付款', PaymentAuthorized:'待发货', PaymentSettled:'待发货', Delivered:'待收货', Shipped:'待收货', Cancelled:'已取消' };
let skip = 0;
const take = 10;
onShow(() => {
    if (orders.value.length === 0) loadData();
    loadReviewedLines();
});

/** 拉一次我的评价，用 orderLineId 建 Set，供入口按钮判定未评/已评 */
async function loadReviewedLines() {
    if (!auth.isLoggedIn) {
        reviewedLineIds.value = new Set();
        return;
    }
    try {
        const res: any = await getMyReviews();
        const set = new Set<string>();
        for (const r of res.myReviews || []) {
            if (r.orderLineId && r.status !== 'deleted') set.add(String(r.orderLineId));
        }
        reviewedLineIds.value = set;
    } catch (e) {
        console.error(e);
    }
}

/** 可评价：订单已送达/已完成，且存在未评 line */
function canReview(order: any): boolean {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order?.state)) return false;
    return (order?.lines || []).some((l: any) => !reviewedLineIds.value.has(String(l.id)));
}

/** 全部已评：状态到位但没有未评 line */
function isFullyReviewed(order: any): boolean {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order?.state)) return false;
    return (order?.lines || []).length > 0 && (order?.lines || []).every((l: any) => reviewedLineIds.value.has(String(l.id)));
}

function goEvaluate(code: string) {
    uni.navigateTo({ url: '/pkg-order/pages/order-evaluate?code=' + code });
}
onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await refreshData(); uni.stopPullDownRefresh(); });
async function loadData() {
    if (loading.value || !hasMore.value) return;
    loading.value = true;
    try {
        const filter: any = { take, skip, sort: { createdAt: 'DESC' as const } };
        if (activeTab.value) {
            const states = activeTab.value.split(',').filter(Boolean);
            filter.filter = { state: states.length > 1 ? { in: states } : { eq: states[0] } };
        }
        const res: any = await getOrders(filter);
        const items = res.myOrders?.items || [];
        orders.value = [...orders.value, ...items];
        const total = res.myOrders?.totalItems || 0;
        skip += items.length;
        hasMore.value = orders.value.length < total;
    } catch (e) { console.error(e); }
    loading.value = false;
}
function loadMore() { loadData(); }
async function refreshData() { skip = 0; hasMore.value = true; orders.value = []; await loadData(); }
async function onRefresh() { refreshing.value = true; await refreshData(); refreshing.value = false; }
function switchTab(val: string) { activeTab.value = val; skip = 0; hasMore.value = true; orders.value = []; loadData(); }
function goDetail(code: string) { uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + code }); }
</script>
<style lang="scss" scoped>
.orders-page { display: flex; flex-direction: column; height: 100vh; &__scroll { flex: 1; box-sizing: border-box; padding: 0 20rpx; } &__footer { padding: 30rpx; text-align: center; } }
.orders-tabs { display: flex; background: #fff; border-bottom: 1rpx solid $border-color; }
.orders-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; position: relative; &.active { color: $brand-color; &::after { content: ''; position: absolute; bottom: 0; left: 30%; right: 30%; height: 4rpx; background: $brand-color; border-radius: 4rpx; } } }
.order-card { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-top: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; font-size: 24rpx; color: $text-color-secondary; } &__state { color: $brand-color; } &__line { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0; } &__name { flex: 1; font-size: 26rpx; } &__qty { font-size: 24rpx; color: #999; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; } }
.footer-text { font-size: 24rpx; color: #999; }
.order-card__actions { display: flex; justify-content: flex-end; align-items: center; margin-top: 16rpx; }
.order-card__review-btn { height: 64rpx; line-height: 64rpx; padding: 0 32rpx; font-size: 26rpx; border-radius: 32rpx; border: 1rpx solid $brand-color; background: #fff; color: $brand-color; }
.order-card__reviewed { font-size: 24rpx; color: #999; }
</style>
