<template>
  <view v-if="visible && tpl" class="cds-mask" @click="$emit('close')">
    <view class="cds-sheet" @click.stop>
      <!-- 活动大图：有图则顶部通栏展示，加载失败或无图则整块隐藏 -->
      <image v-if="heroSrc" class="cds-hero" mode="aspectFill" :src="heroSrc" @error="heroFail = true" />
      <view class="cds-head">
        <view class="cds-left">
          <text class="cds-amount">{{ amountText }}</text>
          <text class="cds-cond">{{ condText }}</text>
        </view>
        <view class="cds-info">
          <view class="cds-row">
            <text class="cds-name">{{ tpl.name }}</text>
            <text class="cds-scene">{{ sceneText }}</text>
          </view>
          <text class="cds-price">¥{{ priceYuan }}</text>
        </view>
      </view>
      <template v-if="paragraphs.length">
        <text class="cds-sec">{{ $t('couponMall.secIntro') }}</text>
        <view class="cds-intro">
          <template v-for="(p, i) in paragraphs" :key="i">
            <text v-if="p.type === 'text'" class="cds-para">{{ p.content }}</text>
            <image v-else-if="!imgFail" class="cds-img" mode="widthFix" :src="p.content" @error="imgFail = true" />
            <text v-else class="cds-img-fail">{{ $t('couponMall.imageFail') }}</text>
          </template>
        </view>
      </template>
      <text class="cds-sec">{{ $t('couponMall.secScope') }}</text>
      <view class="cds-chips">
        <text class="cds-pill">{{ scopeText }}</text>
        <text class="cds-pill">{{ sceneText }}</text>
      </view>
      <view v-if="tpl.validDays || tpl.perUserLimit" class="cds-usage">
        <text v-if="tpl.validDays" class="cds-urow">{{ $t('couponMall.validDaysTip', { d: tpl.validDays }) }}</text>
        <text v-if="tpl.perUserLimit" class="cds-urow">{{ $t('couponMall.perUserLimitTip', { n: tpl.perUserLimit }) }}</text>
      </view>
      <view class="cds-notice">
        <text class="cds-notice-b">{{ $t('couponMall.secNotice') }}</text>
        <text class="cds-notice-t">{{ $t('couponMall.noticeText') }}</text>
      </view>
      <view class="cds-cta">
        <text class="cds-big">¥{{ priceYuan }}</text>
        <button class="cds-buy" @click="$emit('buy')">{{ $t('couponMall.buyNow') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { parseDetailParagraphs } from '../../utils/coupon-detail';

const props = defineProps<{
    visible: boolean;
    tpl: Record<string, any> | null;
    /** 左侧面额大字（父页面用 formatAmount/formatUnit 格式化，保持与卡片一致） */
    amountText?: string;
    /** 左侧门槛文案（父页面 formatCondition） */
    condText?: string;
}>();
defineEmits<{ (e: 'close'): void; (e: 'buy'): void }>();

const { t, locale } = useI18n();
const imgFail = ref(false);
const heroFail = ref(false);
watch(() => [props.visible, props.tpl], () => { imgFail.value = false; heroFail.value = false; });

/** 顶部活动大图：无图或加载失败时为空，不占位 */
const heroSrc = computed(() => {
    const src = String(props.tpl?.activityImage ?? '').trim();
    return src && !heroFail.value ? src : '';
});

/** description（本地化字符串或 LocalizedText 映射）按当前语言取值后图文分段，映射缺当前语言回退任一语言 */
const paragraphs = computed(() => {
    const desc = props.tpl?.description as string | Record<string, string> | undefined;
    if (!desc) return [];
    const raw = typeof desc === 'string'
        ? desc
        : desc[String(locale.value)] || Object.values(desc)[0] || '';
    return raw ? parseDetailParagraphs(String(raw)) : [];
});

/** 使用场景文案（与页面 usageTag 同映射） */
const sceneText = computed(() => {
    const s = (props.tpl?.usageScene || 'ONLINE').toUpperCase();
    if (s === 'IN_STORE') return t('couponMall.sceneStore');
    if (s === 'ALL') return t('couponMall.sceneUniversal');
    return t('couponMall.sceneOnline');
});

const scopeText = computed(() =>
    (!props.tpl?.scope || props.tpl.scope === 'ALL') ? t('couponMall.scopeAll') : t('couponMall.scopeLimited'),
);

/** 售价分 → 元（与页面 yuan() 同规则：整百去尾零） */
const priceYuan = computed(() => {
    const cents = props.tpl?.salePrice || 0;
    return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
});
</script>

<style lang="scss" scoped>
.cds-mask {
    position: fixed; left: 0; right: 0; top: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.45); z-index: 999;
    display: flex; align-items: flex-end; justify-content: center;
}
.cds-sheet {
    width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0;
    padding: 32rpx; padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
    max-height: 72vh; overflow-y: auto; box-sizing: border-box;
}
.cds-head { display: flex; gap: 24rpx; }
.cds-hero {
    width: 100%; height: 300rpx; border-radius: $radius-md;
    margin-bottom: 24rpx; display: block; background: #f2f3f5;
}
.cds-left {
    min-width: 180rpx; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    border-right: 2rpx dashed $border-color; padding-right: 24rpx;
}
.cds-amount { font-size: 48rpx; font-weight: bold; color: $brand-color; line-height: 1.1; }
.cds-cond { font-size: 22rpx; color: #999; margin-top: 8rpx; }
.cds-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.cds-row { display: flex; align-items: center; gap: 10rpx; flex-wrap: wrap; }
.cds-name { font-size: 30rpx; font-weight: bold; color: #333; }
.cds-scene {
    font-size: 18rpx; font-weight: bold; color: $brand-color;
    background: rgba($brand-color, 0.1); border-radius: 6rpx; padding: 2rpx 10rpx;
}
.cds-price { font-size: 32rpx; font-weight: bold; color: $brand-color; margin-top: 10rpx; }
.cds-sec {
    display: block; font-size: 26rpx; font-weight: bold; color: #333;
    margin: 28rpx 0 12rpx; border-left: 6rpx solid $brand-color; padding-left: 12rpx;
}
.cds-intro { display: flex; flex-direction: column; gap: 12rpx; }
.cds-para { font-size: 26rpx; color: #666; line-height: 1.6; }
.cds-img { width: 100%; border-radius: $radius-md; }
.cds-img-fail { font-size: 22rpx; color: #bbb; text-align: center; padding: 20rpx 0; }
.cds-chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.cds-pill {
    font-size: 22rpx; color: #666; border: 1rpx solid $border-color;
    border-radius: 999rpx; padding: 4rpx 20rpx;
}
.cds-usage { display: flex; flex-direction: column; gap: 8rpx; }
.cds-urow { font-size: 24rpx; color: #666; line-height: 1.6; }
.cds-notice { background: #f7f7f7; border-radius: $radius-md; padding: 20rpx 24rpx; margin-top: 28rpx; }
.cds-notice-b { font-size: 24rpx; font-weight: bold; color: #333; display: block; margin-bottom: 8rpx; }
.cds-notice-t { font-size: 24rpx; color: #999; line-height: 1.6; }
.cds-cta { display: flex; justify-content: space-between; align-items: center; margin-top: 32rpx; }
.cds-big { font-size: 40rpx; font-weight: bold; color: $brand-color; }
.cds-buy {
    background: $brand-color; color: #fff; border: none;
    font-size: 28rpx; padding: 0 64rpx; height: 80rpx; line-height: 80rpx;
    border-radius: 40rpx;
    &::after { border: none; }
}
</style>
