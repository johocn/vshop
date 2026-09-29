<template>
  <view class="group-buy">
    <view class="gb-tabs">
      <text
        v-for="tab in tabs"
        :key="tab.key"
        class="gb-tab"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >{{ tab.label }}</text>
    </view>

    <!-- 拼团列表 -->
    <template v-if="activeTab === 'activities'">
      <view v-for="item in activities" :key="item.id" class="gb-card gb-card--stack">
        <view class="gb-card__row">
          <VImage :src="productMap[item.productId]?.featuredAsset?.preview || ''" width="200rpx" height="200rpx" class="gb-card__img" />
          <view class="gb-card__main">
            <text class="gb-card__name">{{ productMap[item.productId]?.name || item.name }}</text>
            <view class="gb-card__prices">
              <text class="gb-card__group">¥{{ (item.groupPrice / 100).toFixed(2) }}</text>
              <text class="gb-card__origin" v-if="origPrice(item)">¥{{ origPrice(item) }}</text>
            </view>
            <view class="gb-card__progress">
              <view class="gb-card__dots">
                <text class="gb-card__dot" v-for="n in Math.min(item.currentCount, 5)" :key="n"></text>
              </view>
              <text class="gb-card__lack">{{ t('promotion.lackPeople', { n: Math.max(0, item.targetCount - item.currentCount) }) }}</text>
            </view>
          </view>
        </view>
        <view class="gb-card__foot">
          <text class="gb-card__tag">{{ t('promotion.groupUnit', { n: item.targetCount }) }} · {{ t('promotion.remainPrefix') }} {{ countdownOf(item) }}</text>
        </view>
        <button class="gb-card__action" @click="joinGroup(item, false)">{{ t('promotion.goGroupBuy') }}</button>
      </view>
      <EmptyState v-if="activities.length === 0" :text="t('promotion.emptyActivities')" />
    </template>

    <!-- 我的开团 / 我的参团 -->
    <template v-else>
      <view v-if="!isLoggedIn" class="gb-gate">
        <text class="gb-gate__text">{{ t('promotion.loginTips') }}</text>
        <button class="gb-gate__btn" @click="goLogin">{{ t('promotion.goLogin') }}</button>
      </view>
      <template v-else>
        <view v-for="order in myOrders" :key="order.id" class="gb-card gb-card--stack">
          <view class="gb-card__head">
            <text class="gb-card__state" :class="'is-' + order.status">{{ mineStateText(order) }}</text>
            <text class="gb-card__tag">{{ mineTagText(order) }}</text>
          </view>
          <view class="gb-card__row">
            <VImage :src="productMap[order.activity?.productId]?.featuredAsset?.preview || ''" width="200rpx" height="200rpx" class="gb-card__img" />
            <view class="gb-card__main">
              <text class="gb-card__name">{{ productMap[order.activity?.productId]?.name || order.activity?.name || '' }}</text>
              <view class="gb-card__prices">
                <text class="gb-card__group">¥{{ minePriceText(order) }}</text>
              </view>
              <view class="gb-card__progress">
                <view class="gb-card__dots">
                  <text class="gb-card__dot" v-for="n in Math.min(order.activity?.currentCount || 0, 5)" :key="n"></text>
                </view>
                <text class="gb-card__lack">{{ mineLackText(order) }}</text>
              </view>
            </view>
          </view>
          <button class="gb-card__action" @click="onPrimary(order)">{{ primaryLabel(order) }}</button>
        </view>
        <EmptyState v-if="myOrders.length === 0" :text="t('promotion.emptyMine')" />
      </template>
    </template>

    <BackTop :threshold="300" />
  </view>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onPageScroll } from '@dcloudio/uni-app';
import { getActiveGroupBuyActivities, getMyGroupBuyOrders } from '../../api/queries/promotion';
import { getProductsByIds } from '../../api/queries/product';
import { getActiveOrder } from '../../api/queries/order';
import { addItemToOrder } from '../../api/mutations/cart';
import { getGraphQLClient } from '../../api/client';
import { useUIStore } from '../../stores/ui';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import BackTop from '../../components/BackTop.vue';
import { useShare } from '../../composables/useShare';
import { formatCountdown } from '../../utils/flash-normalize';

type TabKey = 'activities' | 'leader' | 'join';

const { t } = useI18n();
const activities = ref<any[]>([]);
const myOrders = ref<any[]>([]);
const productMap = ref<Record<string, any>>({});
const activeTab = ref<TabKey>('activities');
const nowTick = ref(Date.now());
const ui = useUIStore();
const auth = useAuthStore();
let timer: ReturnType<typeof setInterval> | null = null;

const isLoggedIn = computed(() => auth.isLoggedIn);
const tabs = computed(() => [
    { key: 'activities' as TabKey, label: t('promotion.tabActivities') },
    { key: 'leader' as TabKey, label: t('promotion.tabMyLeader') },
    { key: 'join' as TabKey, label: t('promotion.tabMyJoin') },
]);

useShare({
    title: '拼团 - 精选好物',
    path: '/pkg-promotion/pages/group-buy',
});

onPageScroll((e: any) => uni.$emit('page-scroll', e));

function countdownOf(item: any): string {
    const end = Date.parse(item.endAt);
    if (!Number.isFinite(end)) return '--:--:--';
    return formatCountdown(Math.max(0, end - nowTick.value));
}

function origPrice(item: any): string {
    const v = (productMap.value[item.productId]?.variants || []).find((x: any) => String(x.id) === String(item.variantId));
    return Number.isFinite(v?.priceWithTax) && v.priceWithTax > item.groupPrice ? (v.priceWithTax / 100).toFixed(2) : '';
}

function minePriceText(order: any): string {
    const p = order.activity?.groupPrice;
    return Number.isFinite(p) ? (p / 100).toFixed(2) : '--';
}

function mineStateText(order: any): string {
    if (order.status === 'success') return t('promotion.formed');
    if (order.status === 'failed') return t('promotion.notFormed');
    return t('promotion.statusPending');
}

function mineLackText(order: any): string {
    const a = order.activity;
    if (!a) return '';
    if (order.status === 'success') return t('promotion.formed');
    if (order.status === 'failed') return t('promotion.notFormed');
    return t('promotion.lackPeople', { n: Math.max(0, a.targetCount - a.currentCount) });
}

function mineTagText(order: any): string {
    const a = order.activity;
    if (!a) return '';
    const base = t('promotion.groupUnit', { n: a.targetCount });
    return a.status === 'active' ? `${base} · ${t('promotion.remainPrefix')} ${countdownOf(a)}` : base;
}

function primaryLabel(order: any): string {
    return order.status === 'failed' ? t('promotion.retryGroup') : t('promotion.viewOrder');
}

/** 当前 tab 需要补拉的商品 id（拼团列表按活动、我的开团/参团按活动所属商品） */
function currentProductIds(): string[] {
    const list = activeTab.value === 'activities'
        ? activities.value.map((a: any) => a.productId)
        : myOrders.value.map((o: any) => o.activity?.productId);
    return Array.from(new Set(list.filter(Boolean).map(String))) as string[];
}

async function loadProducts() {
    const ids = currentProductIds();
    if (ids.length === 0) { productMap.value = {}; return; }
    try {
        const products = await getProductsByIds(ids);
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
    } catch (e) { productMap.value = {}; }
}

async function loadActivities() {
    try {
        const res: any = await getActiveGroupBuyActivities();
        activities.value = res.activeGroupBuyActivities || [];
    } catch (e) { activities.value = []; }
}

async function loadMyOrders() {
    if (!isLoggedIn.value) { myOrders.value = []; return; }
    try {
        const res: any = await getMyGroupBuyOrders(activeTab.value === 'leader');
        myOrders.value = res.myGroupBuyOrders || [];
    } catch (e) { myOrders.value = []; }
}

async function switchTab(key: TabKey) {
    if (activeTab.value === key) return;
    activeTab.value = key;
    productMap.value = {};
    if (key === 'activities') {
        if (activities.value.length === 0) await loadActivities();
    } else {
        await loadMyOrders();
    }
    await loadProducts();
}

function goLogin() {
    uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-promotion/pages/group-buy') });
}

function onPrimary(order: any) {
    if (order.status === 'failed') {
        const slug = productMap.value[String(order.activity?.productId)]?.slug;
        if (!slug) { ui.showToast(t('promotion.activityEnded')); return; }
        uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}` });
        return;
    }
    if (order.orderCode) {
        uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + order.orderCode });
    } else {
        uni.navigateTo({ url: '/pkg-order/pages/orders' });
    }
}

onMounted(async () => {
    await loadActivities();
    await loadProducts();
    timer = setInterval(() => { nowTick.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });

async function joinGroup(activity: any, isLeader: boolean) {
    try {
        // 1) 先确保存在 activeOrder，2) 加购该活动商品，3) 再调用 joinGroupBuy
        const order0: any = await getActiveOrder();
        let orderId = order0?.activeOrder?.id;
        if (!orderId) {
            throw new Error(t('promotion.cartUnavailable'));
        }
        if (activity.variantId) {
            await addItemToOrder(String(activity.variantId), 1);
        }
        const after: any = await getActiveOrder();
        orderId = after?.activeOrder?.id || orderId;

        const client = getGraphQLClient();
        const res: any = await client.request(
            `mutation($activityId:ID!,$orderId:ID!,$isLeader:Boolean!) { joinGroupBuy(activityId:$activityId,orderId:$orderId,isLeader:$isLeader) { id status } }`,
            { activityId: activity.id, orderId, isLeader },
        );
        if (res?.joinGroupBuy?.id) {
            ui.showToast(t('promotion.joinSuccess'), 'success');
            uni.navigateTo({ url: '/pkg-order/pages/checkout' });
        } else {
            ui.showToast(t('promotion.joinFailed'));
        }
    } catch (e: any) {
        ui.showToast(e.message);
    }
}
</script>
<style lang="scss" scoped>
.group-buy { padding: 20rpx; }
.gb-tabs { display: flex; background: #fff; border-radius: $radius-md; margin-bottom: 16rpx; }
.gb-tab { flex: 1; text-align: center; padding: 22rpx 0; font-size: 28rpx; color: $text-color-secondary; position: relative;
    &.active { color: $brand-color; font-weight: bold; &::after { content: ''; position: absolute; bottom: 0; left: 35%; right: 35%; height: 4rpx; background: $brand-color; border-radius: 4rpx; } }
}
.gb-card { display: flex; gap: 16rpx; background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx;
    &--stack { flex-direction: column; }
    &__head { display: flex; align-items: center; justify-content: space-between; }
    &__row { display: flex; gap: 16rpx; }
    &__state { font-size: 24rpx; font-weight: bold;
        &.is-success { color: $brand-color; }
        &.is-failed { color: #999; }
        &.is-pending { color: $price-color; }
    }
    &__img { border-radius: $radius-sm; flex-shrink: 0; }
    &__main { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__name { font-size: 28rpx; font-weight: bold; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__prices { display: flex; align-items: baseline; gap: 12rpx; }
    &__group { font-size: 34rpx; color: $price-color; font-weight: bold; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
    &__progress { display: flex; align-items: center; gap: 12rpx; }
    &__dots { display: flex; gap: 6rpx; }
    &__dot { width: 28rpx; height: 28rpx; border-radius: 50%; background: $brand-color-light; }
    &__lack { font-size: 22rpx; color: $text-color-secondary; }
    &__foot { display: flex; flex-direction: column; align-items: flex-start; margin-top: 12rpx; }
    &__tag { font-size: 22rpx; color: #fff; background: $price-color; border-radius: 8rpx; padding: 2rpx 10rpx; }
    &__action { width: 100%; margin-top: 16rpx; background: $brand-color; color: #fff; border-radius: $radius-md; border: none; height: 72rpx; line-height: 72rpx; font-size: 28rpx; }
}
.gb-gate { display: flex; flex-direction: column; align-items: center; gap: 24rpx; background: #fff; border-radius: $radius-md; padding: 80rpx 20rpx;
    &__text { font-size: 26rpx; color: $text-color-secondary; }
    &__btn { background: $brand-color; color: #fff; border-radius: $radius-md; border: none; height: 72rpx; line-height: 72rpx; font-size: 28rpx; padding: 0 64rpx; }
}
</style>
