<template>
  <view class="dynamic-home">
    <component
      v-for="(sec, i) in sections"
      :key="i"
      :is="componentFor(sec.type)"
      :section="sec"
    />
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

const tenantStore = useTenantStore();
const sections = computed(() => tenantStore.shopContent?.sections || []);

const componentMap: Record<string, any> = {
  banner: BannerSection,
  notice: NoticeSection,
  nav: NavSection,
  goods: GoodsSection,
  richText: RichTextSection,
};

function componentFor(type: string): any {
  return componentMap[type] || null;
}
</script>

<style lang="scss" scoped>
.dynamic-home { min-height: 100vh; background: $bg-color; }
</style>