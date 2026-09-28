<template>
  <view class="dynamic-home">
    <template v-for="(sec, i) in sections" :key="i">
      <BannerSection v-if="sec.type === 'banner'" :section="sec" />
      <NoticeSection v-else-if="sec.type === 'notice'" :section="sec" />
      <NavSection v-else-if="sec.type === 'nav'" :section="sec" />
      <GoodsSection v-else-if="sec.type === 'goods'" :section="sec" />
      <RichTextSection v-else-if="sec.type === 'richText'" :section="sec" />
      <FlashSection v-else-if="sec.type === 'flash'" :section="sec" />
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTenantStore } from '../../stores/tenant';
import BannerSection from './sections/BannerSection.vue';
import NoticeSection from './sections/NoticeSection.vue';
import NavSection from './sections/NavSection.vue';
import GoodsSection from './sections/GoodsSection.vue';
import RichTextSection from './sections/RichTextSection.vue';
import FlashSection from './sections/FlashSection.vue';

const tenantStore = useTenantStore();
const sections = computed(() => tenantStore.mergedShopContent?.sections || tenantStore.shopContent?.sections || []);
</script>

<style lang="scss" scoped>
.dynamic-home { min-height: 100vh; background: $bg-color; }
</style>
