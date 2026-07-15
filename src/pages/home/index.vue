<template>
  <view class="home-page">
    <TenantBar />
    <component :is="currentHome" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTenantStore } from '../../stores/tenant';
import { useAuthStore } from '../../stores/auth';
import { useShare } from '../../composables/useShare';
import DefaultHome from '../../templates/default/pages/HomeContent.vue';
import FreshHome from '../../templates/fresh/pages/HomeContent.vue';
import TenantBar from '../../components/TenantBar.vue';

const tenantStore = useTenantStore();
const authStore = useAuthStore();
const { templateCode } = tenantStore;
const channelName = computed(() => tenantStore.tenantName);
const inviteCode = computed(() => authStore.inviteCode);
const templateMap: Record<string, any> = { default: DefaultHome, fresh: FreshHome };
const currentHome = computed(() => templateMap[templateCode.value] || DefaultHome);

useShare({
    title: `${channelName.value} - 精选好物`,
    path: inviteCode.value ? `/?ref=${inviteCode.value}` : '/',
});
</script>

<style lang="scss" scoped>
.home-page { min-height: 100vh; background: $bg-color; }
</style>