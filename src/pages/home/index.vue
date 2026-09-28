<template>
  <view class="home-page" @scroll="broadcastScroll">
    <TenantBar />
    <DynamicHome v-if="hasShopContent" />
    <component v-else :is="currentHome" />
    <BackTop />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onPageScroll } from '@dcloudio/uni-app';
import { useTenantStore } from '../../stores/tenant';
import { useAuthStore } from '../../stores/auth';
import { useShare } from '../../composables/useShare';
import DefaultHome from '../../templates/default/pages/HomeContent.vue';
import FreshHome from '../../templates/fresh/pages/HomeContent.vue';
import MarketplaceHome from '../../templates/marketplace/pages/HomeContent.vue';
import DynamicHome from '../../templates/shared/DynamicHome.vue';
import TenantBar from '../../components/TenantBar.vue';
import BackTop from '../../components/BackTop.vue';

const tenantStore = useTenantStore();
const authStore = useAuthStore();
const { templateCode } = tenantStore;
const channelName = computed(() => tenantStore.tenantName);
const inviteCode = computed(() => authStore.inviteCode);
const hasShopContent = computed(() => !!tenantStore.mergedShopContent?.sections?.length);
const templateMap: Record<string, any> = { default: DefaultHome, fresh: FreshHome, marketplace: MarketplaceHome };
const currentHome = computed(() => templateMap[templateCode] || DefaultHome);

useShare({
    title: `${channelName.value} - 精选好物`,
    path: inviteCode.value ? `/?ref=${inviteCode.value}` : '/',
});

function broadcastScroll(e: any) {
    uni.$emit('page-scroll', e);
}
onPageScroll((e: any) => broadcastScroll(e));
</script>

<style lang="scss" scoped>
.home-page { min-height: 100vh; background: $bg-color; }
</style>