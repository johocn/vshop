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
    <template v-for="(sec, i) in visibleSections" :key="i">
      <component :is="SECTION_COMPONENTS[sec.type]" :section="sec" />
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTenantStore } from '../../stores/tenant';
import { SECTION_COMPONENTS } from './sections';

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
