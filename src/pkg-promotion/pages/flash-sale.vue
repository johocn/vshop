<template>
  <view class="flash-sale">
    <view class="flash-head" v-if="items.length">
      <text class="flash-head__title">限时秒杀</text>
      <view class="flash-head__clock" v-if="countdown">
        <text class="flash-head__lbl">距结束</text>
        <text class="flash-head__val">{{ countdown }}</text>
      </view>
    </view>

    <view class="flash-grid">
      <view v-for="item in items" :key="item.activityId" class="flash-card" @click="goProduct(item)">
        <view class="flash-card__media">
          <VImage :src="productMap[item.productId]?.featuredAsset?.preview || ''" width="100%" height="300rpx" />
          <text class="flash-card__badge">秒杀价</text>
        </view>
        <text class="flash-card__name">{{ productMap[item.productId]?.name || item.name }}</text>
        <view class="flash-card__prices">
          <PriceTag :price="item.flashPrice" />
          <text class="flash-card__origin" v-if="origPrice(item)">¥{{ origPrice(item) }}</text>
        </view>
        <view class="flash-card__progress">
          <progress :percent="soldPercent(item)" stroke-width="6" activeColor="#e0433f" />
          <text class="flash-card__pct">{{ soldPercent(item) }}%</text>
        </view>
      </view>
    </view>

    <EmptyState v-if="items.length === 0" text="暂无秒杀活动" />
    <BackTop :threshold="300" />
  </view>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { onPageScroll } from '@dcloudio/uni-app';
import { getActiveFlashSaleActivities } from '../../api/queries/promotion';
import { getProductsByIds } from '../../api/queries/product';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import BackTop from '../../components/BackTop.vue';
import { useShare } from '../../composables/useShare';
import { earliestEndAt, formatCountdown, normalizeFlashActivities, soldPercent, type FlashItem } from '../../utils/flash-normalize';

const items = ref<FlashItem[]>([]);
const productMap = ref<Record<string, any>>({});
const countdown = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

useShare({
    title: '限时秒杀 - 精选好物',
    path: '/pkg-promotion/pages/flash-sale',
});

onPageScroll((e: any) => uni.$emit('page-scroll', e));

function tick() {
    const end = earliestEndAt(items.value);
    if (end === null) { countdown.value = ''; return; }
    const remain = end - Date.now();
    if (remain <= 0) {
        countdown.value = '00:00:00';
        stopTimer();
        items.value = [];
        uni.showToast({ title: '秒杀活动已结束', icon: 'none' });
        return;
    }
    countdown.value = formatCountdown(remain);
}

function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

async function load() {
    try {
        const res: any = await getActiveFlashSaleActivities();
        items.value = normalizeFlashActivities(res?.activeFlashSaleActivities || [], Date.now());
        if (items.value.length === 0) return;
        const products = await getProductsByIds(Array.from(new Set(items.value.map((i) => i.productId))));
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
        items.value = items.value.filter((i) => !!map[i.productId]);
        tick();
        timer = setInterval(tick, 1000);
    } catch (e) { items.value = []; }
}

onMounted(load);
onUnmounted(stopTimer);

function goProduct(it: FlashItem) {
    const slug = productMap.value[it.productId]?.slug;
    if (!slug) return;
    uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}&flashSaleActivityId=${it.activityId}` });
}
function origPrice(it: FlashItem): string {
    const v = (productMap.value[it.productId]?.variants || []).find((x: any) => String(x.id) === String(it.variantId));
    return Number.isFinite(v?.priceWithTax) && v.priceWithTax > it.flashPrice ? (v.priceWithTax / 100).toFixed(2) : '';
}
</script>
<style lang="scss" scoped>
.flash-sale { padding: 20rpx; }
.flash-head { display: flex; align-items: center; gap: 16rpx; background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx;
    &__title { font-size: 32rpx; font-weight: bold; }
    &__clock { display: flex; align-items: center; gap: 8rpx; background: #111; border-radius: 20rpx; padding: 4rpx 16rpx; }
    &__lbl { font-size: 20rpx; color: #fff; }
    &__val { font-size: 22rpx; color: #fff; font-weight: bold; }
}
.flash-grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.flash-card { width: calc(50% - 8rpx); background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx;
    &__media { position: relative; }
    &__badge { position: absolute; left: 0; top: 12rpx; background: $price-color; color: #fff; font-size: 20rpx; padding: 4rpx 12rpx; border-top-right-radius: 12rpx; border-bottom-right-radius: 12rpx; }
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; padding: 10rpx 12rpx 0; height: 66rpx; }
    &__prices { display: flex; align-items: baseline; gap: 10rpx; padding: 6rpx 12rpx 0; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
    &__progress { padding: 8rpx 12rpx 12rpx; }
    &__pct { font-size: 20rpx; color: #999; }
}
</style>
