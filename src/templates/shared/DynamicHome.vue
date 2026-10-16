<template>
  <view class="dynamic-home">
    <view class="dynamic-home__diy-entry" @click="navTo('/pkg-diy/pages/gallery')">
      <text class="diy-entry__icon">📿</text>
      <view class="diy-entry__text">
        <text class="diy-entry__title">{{ t('diy.gallery.title') }}</text>
        <text class="diy-entry__subtitle">{{ t('diy.gallery.subtitle') }}</text>
      </view>
      <text class="diy-entry__arrow">›</text>
    </view>
    <!-- #ifdef H5 -->
    <template v-for="(sec, i) in visibleSections" :key="i">
      <component :is="SECTION_COMPONENTS[sec.type]" :section="sec" />
    </template>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <!-- 小程序端不支持 <component :is>，v-if 链与 shared/sections.ts 注册表需同步维护：新增楼层类型两处都要加 -->
    <template v-for="(sec, i) in visibleSections" :key="i">
      <BannerSection v-if="sec.type === 'banner'" :section="sec" />
      <NoticeSection v-else-if="sec.type === 'notice'" :section="sec" />
      <NavSection v-else-if="sec.type === 'nav'" :section="sec" />
      <GoodsSection v-else-if="sec.type === 'goods'" :section="sec" />
      <RichTextSection v-else-if="sec.type === 'richText'" :section="sec" />
      <FlashSection v-else-if="sec.type === 'flash'" :section="sec" />
      <VideoSection v-else-if="sec.type === 'video'" :section="sec" />
      <CouponSection v-else-if="sec.type === 'coupon'" :section="sec" />
    </template>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTenantStore } from '../../stores/tenant';
import { SECTION_COMPONENTS } from './sections';
// 楼层组件直接 import：MP 端模板 v-if 链使用；H5 端模板分支未引用（多打进包一点，可接受）。
// 同步提醒：新增楼层类型时，上方 MP v-if 链与 shared/sections.ts 注册表两处都要加。
import BannerSection from './sections/BannerSection.vue';
import NoticeSection from './sections/NoticeSection.vue';
import NavSection from './sections/NavSection.vue';
import GoodsSection from './sections/GoodsSection.vue';
import RichTextSection from './sections/RichTextSection.vue';
import FlashSection from './sections/FlashSection.vue';
import VideoSection from './sections/VideoSection.vue';
import CouponSection from './sections/CouponSection.vue';

const { t } = useI18n();
const tenantStore = useTenantStore();
const sections = computed(() => tenantStore.mergedShopContent?.sections || tenantStore.shopContent?.sections || []);
const visibleSections = computed(() =>
  sections.value.filter((s: any) => s && typeof s === 'object' && SECTION_COMPONENTS[s.type]),
);

function navTo(url: string) { uni.navigateTo({ url }); }
</script>

<style lang="scss" scoped>
.dynamic-home {
    min-height: 100vh;
    background: $bg-color;

    &__diy-entry {
        display: flex;
        align-items: center;
        gap: 16rpx;
        background: #fff;
        padding: 20rpx 24rpx;
        margin-bottom: 16rpx;
    }
}

.diy-entry {
    &__icon { font-size: 44rpx; }
    &__text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
    &__subtitle { font-size: 22rpx; color: $text-color-placeholder; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__arrow { font-size: 40rpx; color: $text-color-placeholder; }
}
</style>
