<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { watch } from 'vue';
import { useTenantStore } from './stores/tenant';
import { useAuthStore } from './stores/auth';
import { useCartStore } from './stores/cart';
import { setupRouteGuard } from './composables/useAuthGuard';
import { getActiveOrder } from './api/queries/order';
import { setSessionToken } from './api/client';

// 模板库主题令牌 → 根节点 CSS 变量（H5；小程序由 uni.scss 兜底编译色）
function applyThemeTokens(tokens: Record<string, any>) {
    // #ifdef H5
    const el = document.documentElement;
    if (!el) return;
    if (tokens.primaryColor) {
        el.style.setProperty('--brand-color', tokens.primaryColor);
        el.style.setProperty('--theme-primary', tokens.primaryColor);
    }
    if (tokens.accentColor) {
        el.style.setProperty('--brand-color-light', tokens.accentColor);
        el.style.setProperty('--theme-accent', tokens.accentColor);
    }
    if (tokens.radius !== undefined && tokens.radius !== '') {
        el.style.setProperty('--theme-radius', String(tokens.radius));
    }
    // #endif
}

onLaunch(async (options: any) => {
    console.log('App Launch');
    const tenantStore = useTenantStore();
    const authStore = useAuthStore();
    const cartStore = useCartStore();

    watch(
        () => tenantStore.themeTokens,
        (tokens) => applyThemeTokens(tokens || {}),
        { immediate: true },
    );

    // Initialize tenant from domain or URL (async)
    await tenantStore.initTenant();

    // Restore auth token from storage (must be after initTenant sets token)
    await authStore.restoreSession();
    tenantStore.tenantReady = true;

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

    // 小程序: 从 scene 参数解析 r=邀请码
    // #ifdef MP-WEIXIN
    try {
        const scene = options?.query?.scene || options?.scene;
        if (scene) {
            const decoded = decodeURIComponent(scene);
            const params = new URLSearchParams(decoded);
            const refCode = params.get('r');
            if (refCode) {
                authStore.setInviteCode(refCode);
            }
        }
    } catch (e) {}
    // #endif

    // Setup route guard for authenticated pages
    setupRouteGuard();

    // Initialize cart badge (both logged-in and guest)
    try {
        const res: any = await getActiveOrder();
        if (res.activeOrder) cartStore.setOrder(res.activeOrder);
        else cartStore.updateBadge();
    } catch (e) {}

    authStore.onLogin(async () => {
        setSessionToken(''); // clear guest session token, JWT takes over
        try {
            const res: any = await getActiveOrder();
            if (res.activeOrder) cartStore.setOrder(res.activeOrder);
        } catch (e) {}
    });

    authStore.onLogout(() => {
        setSessionToken(''); // clear session token, new anonymous session will be created
        cartStore.clearCart();
    });

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
