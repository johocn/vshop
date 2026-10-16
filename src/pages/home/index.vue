<template>
  <view class="home-page" @scroll="broadcastScroll">
    <TenantBar />
    <component :is="layoutComponent" />
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
import { LAYOUT_COMPONENTS, FALLBACK_LAYOUT } from '../../templates/layouts';
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
    const k = tenantStore.homeLayout;
    return LAYOUT_COMPONENTS[k] ? k : FALLBACK_LAYOUT;
});
const layoutComponent = computed(() => LAYOUT_COMPONENTS[layoutKey.value]);
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