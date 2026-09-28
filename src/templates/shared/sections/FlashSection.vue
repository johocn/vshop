<template>
  <view class="flash-sec" v-if="items.length">
    <view class="flash-sec__head">
      <view class="flash-sec__left">
        <text class="flash-sec__title">{{ titleText }}</text>
        <view class="flash-sec__clock" v-if="countdown">
          <text class="flash-sec__clock-lbl">{{ t('flash.endsIn') }}</text>
          <text class="flash-sec__clock-val">{{ countdown }}</text>
        </view>
      </view>
      <text class="flash-sec__more" @tap="goMore">{{ t('flash.more') }} ›</text>
    </view>

    <scroll-view v-if="layout === 'row'" scroll-x class="flash-sec__row" :show-scrollbar="false">
      <view class="flash-card flash-card--row" v-for="it in items" :key="it.activityId" @tap="goDetail(it)">
        <view class="flash-card__media">
          <VImage :src="assetOf(it.productId)" width="100%" height="220rpx" />
          <text class="flash-card__badge">{{ t('flash.badge') }}</text>
        </view>
        <text class="flash-card__name">{{ nameOf(it) }}</text>
        <view class="flash-card__prices">
          <PriceTag :price="it.flashPrice" />
          <text class="flash-card__origin" v-if="originOf(it)">¥{{ fmt(originOf(it)) }}</text>
        </view>
        <view class="flash-card__progress">
          <progress :percent="soldPercent(it)" stroke-width="6" :activeColor="progressColor" />
          <text class="flash-card__pct">{{ soldPercent(it) }}%</text>
        </view>
      </view>
    </scroll-view>

    <view v-else class="flash-sec__grid">
      <view class="flash-card" v-for="it in items" :key="it.activityId" @tap="goDetail(it)">
        <view class="flash-card__media">
          <VImage :src="assetOf(it.productId)" width="100%" height="300rpx" />
          <text class="flash-card__badge">{{ t('flash.badge') }}</text>
        </view>
        <text class="flash-card__name">{{ nameOf(it) }}</text>
        <view class="flash-card__prices">
          <PriceTag :price="it.flashPrice" />
          <text class="flash-card__origin" v-if="originOf(it)">¥{{ fmt(originOf(it)) }}</text>
        </view>
        <view class="flash-card__progress">
          <progress :percent="soldPercent(it)" stroke-width="6" :activeColor="progressColor" />
          <text class="flash-card__pct">{{ soldPercent(it) }}%</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FlashSection } from '../schema';
import { getActiveFlashSaleActivities } from '../../../api/queries/promotion';
import { getProductsByIds } from '../../../api/queries/product';
import { earliestEndAt, formatCountdown, normalizeFlashActivities, soldPercent, type FlashItem } from '../../../utils/flash-normalize';
import { useTenantStore } from '../../../stores/tenant';
import { getTemplateConfig } from '../../registry';
import VImage from '../../../components/VImage.vue';
import PriceTag from '../../../components/PriceTag.vue';

const props = defineProps<{ section: FlashSection }>();
const { t } = useI18n();
const tenantStore = useTenantStore();

const items = ref<FlashItem[]>([]);
const productMap = ref<Record<string, any>>({});
const countdown = ref('');
const progressColor = '#e0433f';

let timer: ReturnType<typeof setInterval> | null = null;

const layout = computed(() => (props.section.layout === 'grid2' ? 'grid2' : 'row'));

const titleText = computed(() => {
    const raw: any = props.section.title;
    if (!raw) return t('flash.title');
    if (typeof raw === 'string') return raw;
    const locale = 'zh-CN';
    return raw[locale] || raw['zh-CN'] || Object.values(raw)[0] || t('flash.title');
});

function assetOf(productId: string): string {
    return productMap.value[productId]?.featuredAsset?.preview || '';
}

function nameOf(it: FlashItem): string {
    const p = productMap.value[it.productId];
    return p?.name || it.name || t('flash.fallbackName');
}

/** 划线原价：优先取该活动的 variant 价格，取不到则不显示（降级） */
function originOf(it: FlashItem): number | null {
    const p = productMap.value[it.productId];
    const v = (p?.variants || []).find((x: any) => String(x.id) === String(it.variantId));
    const price = v?.priceWithTax;
    if (!Number.isFinite(price) || price <= it.flashPrice) return null;
    return price;
}

function fmt(cents: number): string {
    return (cents / 100).toFixed(2);
}

function tick() {
    const end = earliestEndAt(items.value);
    if (end === null) {
        countdown.value = '';
        return;
    }
    const remain = end - Date.now();
    if (remain <= 0) {
        countdown.value = '00:00:00';
        stopTimer();
        void load(); // 到点重新取数；取不到有效项时整块不渲染
        return;
    }
    countdown.value = formatCountdown(remain);
}

function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

async function load() {
    try {
        const res: any = await getActiveFlashSaleActivities();
        const normalized = normalizeFlashActivities(res?.activeFlashSaleActivities || [], Date.now());
        const limit = clampLimit(props.section.limit);
        items.value = normalized.slice(0, limit);

        if (items.value.length === 0) return;

        // 按 productId 批量补拉商品名/图/原价；补拉失败的那条单独跳过
        const ids = Array.from(new Set(items.value.map((i) => i.productId)));
        const products = await getProductsByIds(ids);
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
        items.value = items.value.filter((i) => !!map[i.productId]);

        tick();
        stopTimer();
        timer = setInterval(tick, 1000);
    } catch (e) {
        // 取数失败 → 整块不渲染（items 保持为空）
        items.value = [];
        console.warn('[FlashSection] load failed', e);
    }
}

function clampLimit(n?: number): number {
    if (!Number.isFinite(Number(n))) return 4;
    const v = Math.floor(Number(n));
    if (v < 1) return 4;
    return Math.min(20, v);
}

function goDetail(it: FlashItem) {
    const slug = productMap.value[it.productId]?.slug || '';
    if (!slug) return;
    uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}&flashSaleActivityId=${it.activityId}` });
}

function goMore() {
    uni.navigateTo({ url: '/pkg-promotion/pages/flash-sale' });
}

onMounted(() => {
    // 模板特性门控：marketplace 模板关闭秒杀
    const features = getTemplateConfig(tenantStore.templateCode)?.features as any;
    if (features && features.flashSale === false) return;
    void load();
});

onUnmounted(() => stopTimer());
</script>

<style lang="scss" scoped>
.flash-sec { margin: 20rpx; background: #fff; border-radius: $radius-md; padding: 20rpx;
    &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
    &__left { display: flex; align-items: center; gap: 12rpx; }
    &__title { font-size: 32rpx; font-weight: bold; color: $text-color; }
    &__clock { display: flex; align-items: center; gap: 8rpx; background: #111; border-radius: 20rpx; padding: 4rpx 16rpx; }
    &__clock-lbl { font-size: 20rpx; color: #fff; }
    &__clock-val { font-size: 22rpx; color: #fff; font-weight: bold; }
    &__more { font-size: 24rpx; color: #999; }
    &__row { white-space: nowrap; }
    &__grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
}
.flash-card { background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx;
    &--row { display: inline-block; width: 240rpx; margin-right: 16rpx; white-space: normal; vertical-align: top; }
    &__media { position: relative; }
    &__badge { position: absolute; left: 0; top: 12rpx; background: $price-color; color: #fff; font-size: 20rpx; padding: 4rpx 12rpx; border-top-right-radius: 12rpx; border-bottom-right-radius: 12rpx; }
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; color: $text-color; padding: 10rpx 12rpx 0; height: 66rpx; }
    &__prices { display: flex; align-items: baseline; gap: 10rpx; padding: 6rpx 12rpx 0; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
    &__progress { padding: 8rpx 12rpx 12rpx; }
    &__pct { font-size: 20rpx; color: #999; }
}
.flash-sec__grid .flash-card { width: calc(50% - 8rpx); }
</style>
