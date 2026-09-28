<template>
  <view class="group-buy">
    <view v-for="item in activities" :key="item.id" class="gb-card">
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
          <text class="gb-card__lack">还差 {{ Math.max(0, item.targetCount - item.currentCount) }} 人成团</text>
        </view>
        <view class="gb-card__foot">
          <text class="gb-card__tag">{{ item.targetCount }} 人团 · 剩 {{ countdownOf(item) }}</text>
          <button class="gb-card__btn" @click="joinGroup(item, false)">去拼团</button>
        </view>
      </view>
    </view>
    <EmptyState v-if="activities.length === 0" text="暂无拼团活动" />
    <BackTop :threshold="300" />
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { onPageScroll } from '@dcloudio/uni-app';
import { getActiveGroupBuyActivities } from '../../api/queries/promotion';
import { getProductsByIds } from '../../api/queries/product';
import { getActiveOrder } from '../../api/queries/order';
import { addItemToOrder } from '../../api/mutations/cart';
import { getGraphQLClient } from '../../api/client';
import { useUIStore } from '../../stores/ui';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import BackTop from '../../components/BackTop.vue';
import { useShare } from '../../composables/useShare';
import { formatCountdown } from '../../utils/flash-normalize';

const activities = ref<any[]>([]);
const productMap = ref<Record<string, any>>({});
const nowTick = ref(Date.now());
const ui = useUIStore();
let timer: ReturnType<typeof setInterval> | null = null;

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

async function loadProducts() {
    const ids = Array.from(new Set(activities.value.map((a: any) => a.productId).filter(Boolean).map(String))) as string[];
    if (ids.length === 0) return;
    try {
        const products = await getProductsByIds(ids);
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
    } catch (e) { productMap.value = {}; }
}

onMounted(async () => {
    try {
        const res: any = await getActiveGroupBuyActivities();
        activities.value = res.activeGroupBuyActivities || [];
    } catch (e) { activities.value = []; }
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
            throw new Error('购物车不可用，请稍后重试');
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
            ui.showToast('参团成功', 'success');
            uni.navigateTo({ url: '/pkg-order/pages/checkout' });
        } else {
            ui.showToast('参团失败，请重试');
        }
    } catch (e: any) {
        ui.showToast(e.message);
    }
}
</script>
<style lang="scss" scoped>
.group-buy { padding: 20rpx; }
.gb-card { display: flex; gap: 16rpx; background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx;
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
    &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6rpx; }
    &__tag { font-size: 22rpx; color: #fff; background: $price-color; border-radius: 8rpx; padding: 2rpx 10rpx; }
    &__btn { background: $brand-color; color: #fff; border-radius: $radius-md; border: none; height: 64rpx; line-height: 64rpx; font-size: 26rpx; padding: 0 32rpx; }
}
</style>
