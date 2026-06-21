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
import { getOrders } from '../../api/queries/order';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const orders = ref<any[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const refreshing = ref(false);
const activeTab = ref('');
const tabs = [
    { value: '', label: '全部' }, { value: 'Created', label: '待付款' },
    { value: 'PaymentSettled', label: '待发货' }, { value: 'Delivered', label: '待收货' },
    { value: 'Cancelled', label: '已取消' },
];
const statusMap: Record<string, string> = { Created:'待付款', PaymentAuthorized:'待发货', PaymentSettled:'待发货', Delivered:'待收货', Shipped:'待收货', Cancelled:'已取消' };
let skip = 0;
const take = 10;
onShow(() => { if (orders.value.length === 0) loadData(); });
onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await refreshData(); uni.stopPullDownRefresh(); });
async function loadData() {
    if (loading.value || !hasMore.value) return;
    loading.value = true;
    try {
        const filter: any = { take, skip, sort: { createdAt: 'DESC' as const } };
        if (activeTab.value) filter.filter = { state: { eq: activeTab.value } };
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
.orders-page { display: flex; flex-direction: column; height: 100vh; &__scroll { flex: 1; padding: 0 20rpx; } &__footer { padding: 30rpx; text-align: center; } }
.orders-tabs { display: flex; background: #fff; border-bottom: 1rpx solid $border-color; }
.orders-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; position: relative; &.active { color: $brand-color; &::after { content: ''; position: absolute; bottom: 0; left: 30%; right: 30%; height: 4rpx; background: $brand-color; border-radius: 4rpx; } } }
.order-card { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-top: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; font-size: 24rpx; color: $text-color-secondary; } &__state { color: $brand-color; } &__line { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0; } &__name { flex: 1; font-size: 26rpx; } &__qty { font-size: 24rpx; color: #999; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; } }
.footer-text { font-size: 24rpx; color: #999; }
</style>
