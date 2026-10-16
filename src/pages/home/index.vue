<template>
  <view class="home-page" @scroll="broadcastScroll">
    <TenantBar />
    <!-- #ifdef H5 -->
    <component :is="layoutComponent" />
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <!-- 小程序端不支持 <component :is>，回退 v-if 硬编码链；与 templates/layouts.ts 注册表同步维护 -->
    <DynamicHome v-if="hasShopContent" />
    <FreshHome v-else-if="layoutKey === 'fresh'" />
    <MarketplaceHome v-else-if="layoutKey === 'marketplace'" />
    <DefaultHome v-else />
    <!-- #endif -->
    <BackTop />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onPageScroll } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { useTenantStore } from '../../stores/tenant';
import { useAuthStore } from '../../stores/auth';
import { useShare } from '../../composables/useShare';
import { KNOWN_LAYOUTS } from '../../utils/merge-config';
// #ifdef H5
import { LAYOUT_COMPONENTS } from '../../templates/layouts';
// #endif
// #ifndef H5
// 小程序端 v-if 链直接静态引入（无运行时动态组件能力）
import DynamicHome from '../../templates/shared/DynamicHome.vue';
import FreshHome from '../../templates/fresh/pages/HomeContent.vue';
import MarketplaceHome from '../../templates/marketplace/pages/HomeContent.vue';
import DefaultHome from '../../templates/default/pages/HomeContent.vue';
// #endif
import TenantBar from '../../components/TenantBar.vue';
import BackTop from '../../components/BackTop.vue';

const { t } = useI18n();
const tenantStore = useTenantStore();
const authStore = useAuthStore();
const channelName = computed(() => tenantStore.tenantName);
const inviteCode = computed(() => authStore.inviteCode);
const hasShopContent = computed(() => !!tenantStore.mergedShopContent?.sections?.length);
const layoutKey = computed(() => {
    if (hasShopContent.value) return 'dynamic'; // sections 优先（原体系行为）
    const k = tenantStore.homeLayout || 'default';
    return KNOWN_LAYOUTS.includes(k as any) ? k : 'default';
});
// #ifdef H5
const layoutComponent = computed(() => LAYOUT_COMPONENTS[layoutKey.value]);
// #endif
useShare({
    title: `${channelName.value} - ${t('home.shareTitle')}`,
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