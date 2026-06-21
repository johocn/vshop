<template>
  <view class="home-page">
    <!-- Template-driven home content -->
    <component :is="currentHome" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTenantStore } from '../../stores/tenant';
import DefaultHome from '../../templates/default/pages/HomeContent.vue';
import FreshHome from '../../templates/fresh/pages/HomeContent.vue';

const { templateCode } = useTenantStore();
const templateMap: Record<string, any> = { default: DefaultHome, fresh: FreshHome };
const currentHome = computed(() => templateMap[templateCode.value] || DefaultHome);
</script>

<style lang="scss" scoped>
.home-page { min-height: 100vh; background: $bg-color; }
</style>