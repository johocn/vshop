<template>
  <view class="usemall-home">
    <!-- usemall 签名：灰底白胶囊搜索条 -->
    <view class="usemall-home__search" @tap="goSearch">
      <text class="usemall-home__search-tip">{{ t('usemall.searchTip') }}</text>
      <svg class="usemall-home__search-ic" viewBox="0 0 24 24" width="15" height="15">
        <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2" />
        <line x1="15" y1="15" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </view>

    <!-- #ifdef H5 -->
    <template v-for="(sec, i) in visibleSections" :key="i">
      <component :is="SECTION_COMPONENTS[sec.type]" :section="sec" />
    </template>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <!-- 小程序端不支持 <component :is>，v-if 链与 shared/sections.ts 注册表需同步维护 -->
    <template v-for="(sec, i) in visibleSections" :key="i">
      <BannerSection v-if="sec.type === 'banner'" :section="sec" />
      <NoticeSection v-else-if="sec.type === 'notice'" :section="sec" />
      <NavSection v-else-if="sec.type === 'nav'" :section="sec" />
      <GoodsSection v-else-if="sec.type === 'goods'" :section="sec" />
      <RichTextSection v-else-if="sec.type === 'richText'" :section="sec" />
      <FlashSection v-else-if="sec.type === 'flash'" :section="sec" />
      <VideoSection v-else-if="sec.type === 'video'" :section="sec" />
      <CouponSection v-else-if="sec.type === 'coupon'" :section="sec" />
      <PointsGoodsSection v-else-if="sec.type === 'pointsGoods'" :section="sec" />
      <LimitGoodsSection v-else-if="sec.type === 'limitGoods'" :section="sec" />
      <HotGoodsSection v-else-if="sec.type === 'hotGoods'" :section="sec" />
    </template>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTenantStore } from '../../../stores/tenant';
import { SECTION_COMPONENTS } from '../../shared/sections';
// MP 端模板 v-if 链使用；新增楼层类型时 sections.ts 注册表与本链两处都要加
import BannerSection from '../../shared/sections/BannerSection.vue';
import NoticeSection from '../../shared/sections/NoticeSection.vue';
import NavSection from '../../shared/sections/NavSection.vue';
import GoodsSection from '../../shared/sections/GoodsSection.vue';
import RichTextSection from '../../shared/sections/RichTextSection.vue';
import FlashSection from '../../shared/sections/FlashSection.vue';
import VideoSection from '../../shared/sections/VideoSection.vue';
import CouponSection from '../../shared/sections/CouponSection.vue';
import PointsGoodsSection from '../../shared/sections/PointsGoodsSection.vue';
import LimitGoodsSection from '../../shared/sections/LimitGoodsSection.vue';
import HotGoodsSection from '../../shared/sections/HotGoodsSection.vue';

const { t } = useI18n();
const tenantStore = useTenantStore();
const sections = computed(() => tenantStore.mergedShopContent?.sections || tenantStore.shopContent?.sections || []);
const visibleSections = computed(() =>
  sections.value.filter((s: any) => s && typeof s === 'object' && SECTION_COMPONENTS[s.type]),
);

function goSearch() {
  uni.navigateTo({ url: '/pkg-product/pages/search/index' });
}
</script>

<style lang="scss" scoped>
.usemall-home { min-height: 100vh; background: #f5f5f5;

  &__search { display: flex; align-items: center; justify-content: space-between;
    margin: 16rpx 24rpx; height: 72rpx; padding: 0 28rpx;
    background: #fff; border-radius: 999rpx; color: #c0c0c0; }

  &__search-tip { font-size: 26rpx; }

  &__search-ic { color: #c0c0c0; }
}
</style>
