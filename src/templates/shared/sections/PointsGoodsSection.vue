<template>
  <view class="sec-points" v-if="done">
    <text v-if="titleText" class="sec-points__title">{{ titleText }}</text>
    <scroll-view v-if="items.length" scroll-x class="sec-points__row" :show-scrollbar="false">
      <view class="pg-card" v-for="g in items" :key="g.id" @tap="goDetail(g)">
        <view class="pg-card__media">
          <VImage :src="g.image" width="100%" height="220rpx" />
        </view>
        <text class="pg-card__name">{{ g.name }}</text>
        <text class="pg-card__points">{{ g.pointsPrice }}{{ t('pointsGoods.pointsUnit') }}</text>
      </view>
    </scroll-view>
    <text v-else class="sec-points__empty">{{ t('homeSections.pointsGoods.empty') }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PointsGoodsSection as PointsGoodsSectionData } from '../schema';
import { getPointsProducts } from '../../../api/queries/points-mall';
import VImage from '../../../components/VImage.vue';

const props = defineProps<{ section: PointsGoodsSectionData }>();
const { t, locale } = useI18n();

const items = ref<any[]>([]);
const done = ref(false); // 拉取成功才渲染楼层；失败静默整块不渲染
let loadStarted = false; // loading 防抖：只拉一次

// title 双语渲染：与 FlashSection/VideoSection 同款模式
const titleText = computed(() => {
    const raw: any = props.section.title;
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    return raw[locale.value] || raw['zh-CN'] || Object.values(raw)[0] || '';
});

function clampLimit(n?: number): number {
    if (!Number.isFinite(Number(n))) return 6;
    const v = Math.floor(Number(n));
    if (v < 1) return 6;
    return Math.min(20, v);
}

function goDetail(g: any) {
    uni.navigateTo({ url: '/pkg-user/pages/points-goods-detail?id=' + g.id });
}

async function load() {
    if (loadStarted || done.value) return;
    loadStarted = true;
    try {
        const res: any = await getPointsProducts({ skip: 0, take: clampLimit(props.section.limit) });
        items.value = res?.pointsProducts?.items || [];
        done.value = true;
    } catch (e) {
        // 失败静默：整块不渲染
        console.warn('[PointsGoodsSection] load failed', e);
    }
}

onMounted(() => void load());
</script>

<style lang="scss" scoped>
.sec-points {
    padding: 20rpx 24rpx;
    background: #fff;
    margin-bottom: 16rpx;

    &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; margin-bottom: 16rpx; }
    &__row { white-space: nowrap; }
    &__empty { display: block; font-size: 24rpx; color: $text-color-placeholder; padding: 16rpx 0; }
}
.pg-card {
    display: inline-block;
    width: 240rpx;
    margin-right: 16rpx;
    border-radius: $radius-md;
    overflow: hidden;
    background: #fff;
    vertical-align: top;
    white-space: normal;

    &__media { background: $bg-color; }
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; color: $text-color; padding: 10rpx 12rpx 0; height: 66rpx; }
    &__points { display: block; font-size: 26rpx; font-weight: 600; color: $price-color; padding: 6rpx 12rpx 12rpx; }
}
</style>
