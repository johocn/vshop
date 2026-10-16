<template>
  <view class="sec-coupon" v-if="done">
    <text v-if="titleText" class="sec-coupon__title">{{ titleText }}</text>
    <scroll-view v-if="items.length" scroll-x class="sec-coupon__row" :show-scrollbar="false">
      <view class="coupon-card" v-for="c in items" :key="c.id" @tap="goCentre">
        <view class="coupon-card__amount">
          <text class="coupon-card__value">{{ valueText(c) }}</text>
          <text class="coupon-card__cond">{{ condText(c) }}</text>
        </view>
        <view class="coupon-card__info">
          <text class="coupon-card__name">{{ c.name }}</text>
          <text class="coupon-card__claim">{{ t('homeSections.coupon.claim') }} ›</text>
        </view>
      </view>
    </scroll-view>
    <text v-else class="sec-coupon__empty">{{ t('homeSections.coupon.empty') }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CouponSection as CouponSectionData } from '../schema';
import { getCouponCentre } from '../../../api/queries/coupon';

const props = defineProps<{ section: CouponSectionData }>();
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

/** 大字：FIXED/FULL 显示金额（分→元）；PERCENT 显示折扣（85 → 8.5折）；FREE_SHIPPING 显示免配送费（沿用券中心同款规则） */
function valueText(c: any): string {
    if (c.type === 'FREE_SHIPPING') return t('promotion.freeShipping');
    if (c.type === 'PERCENT') {
        const zhe = c.discountValue / 10;
        const zheText = zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
        return t('promotion.percentOff', { zhe: zheText, off: 100 - c.discountValue });
    }
    return (c.discountValue / 100).toString();
}

/** 门槛：与券中心 formatCondition 同款规则 */
function condText(c: any): string {
    const minSpend = c.minSpend ? c.minSpend / 100 : 0;
    if (c.type === 'FREE_SHIPPING') return c.description || t('promotion.freeShipping');
    if (c.type === 'FULL') return t('coupons.noThresholdDirect');
    if (!minSpend) return t('coupons.noThreshold');
    return t('coupons.spendAvailable', { amount: minSpend });
}

function clampLimit(n?: number): number {
    if (!Number.isFinite(Number(n))) return 6;
    const v = Math.floor(Number(n));
    if (v < 1) return 6;
    return Math.min(20, v);
}

function goCentre() {
    uni.navigateTo({ url: '/pkg-promotion/pages/coupons' });
}

async function load() {
    if (loadStarted || done.value) return;
    loadStarted = true;
    try {
        const res: any = await getCouponCentre();
        const list: any[] = res?.couponCentre || [];
        items.value = list.slice(0, clampLimit(props.section.limit));
        done.value = true;
    } catch (e) {
        // 失败静默：整块不渲染
        console.warn('[CouponSection] load failed', e);
    }
}

onMounted(() => void load());
</script>

<style lang="scss" scoped>
.sec-coupon {
    padding: 20rpx 24rpx;
    background: #fff;
    margin-bottom: 16rpx;

    &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; margin-bottom: 16rpx; }
    &__row { white-space: nowrap; }
    &__empty { display: block; font-size: 24rpx; color: $text-color-placeholder; padding: 16rpx 0; }
}
.coupon-card {
    display: inline-flex;
    align-items: center;
    width: 380rpx;
    margin-right: 16rpx;
    border-radius: $radius-md;
    overflow: hidden;
    vertical-align: top;
    white-space: normal;
    background: #fff;

    &__amount {
        width: 130rpx;
        padding: 20rpx 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: $price-color;
        color: #fff;
    }
    &__value { font-size: 32rpx; font-weight: bold; max-width: 110rpx; overflow: hidden; text-overflow: ellipsis; }
    &__cond { font-size: 18rpx; margin-top: 6rpx; max-width: 110rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__info { flex: 1; min-width: 0; padding: 16rpx 16rpx; display: flex; flex-direction: column; gap: 10rpx; background: rgba($price-color, 0.08); }
    &__name { font-size: 24rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__claim { font-size: 22rpx; color: $price-color; font-weight: 600; }
}
</style>
