<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useTenantStore } from './stores/tenant';
import { useAuthStore } from './stores/auth';
import { setupRouteGuard } from './composables/useAuthGuard';

onLaunch(() => {
    console.log('App Launch');
    const tenantStore = useTenantStore();
    const authStore = useAuthStore();

    // Initialize tenant from config or URL
    tenantStore.initTenant();

    // Restore auth token from storage
    authStore.restoreSession();

    // Capture invite code from URL ref parameter
    // #ifdef H5
    try {
        const url = new URL(window.location.href);
        const refCode = url.searchParams.get('ref');
        if (refCode) {
            authStore.setInviteCode(refCode);
        }
    } catch (e) {}
    // #endif

    // Setup route guard for authenticated pages
    setupRouteGuard();

    // #ifdef H5
    uni.addInterceptor('switchTab', { complete: () => { import('./utils/wechat').then(m => m.resetWxReady()); } });
    uni.addInterceptor('navigateTo', { complete: () => { import('./utils/wechat').then(m => m.resetWxReady()); } });
    uni.addInterceptor('redirectTo', { complete: () => { import('./utils/wechat').then(m => m.resetWxReady()); } });
    // #endif
});
</script>

<style lang="scss">

page {
    background-color: #f5f5f5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
        'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 28rpx;
    color: #333;
}

.container {
    padding: 20rpx;
}
</style>
