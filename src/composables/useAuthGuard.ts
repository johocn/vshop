import { useAuthStore } from '../stores/auth';

/** Pages that require authentication */
const AUTH_REQUIRED_PATHS = [
    '/pkg-order/pages/checkout',
    '/pkg-order/pages/orders',
    '/pkg-order/pages/order-detail',
    '/pkg-order/pages/payment',
    '/pkg-order/pages/pay-result',
    '/pkg-order/pages/invoices',
    '/pkg-order/pages/invoice-apply',
    '/pkg-after-sale/pages/apply',
    '/pkg-after-sale/pages/list',
    '/pkg-user/pages/profile',
    '/pkg-user/pages/addresses',
    '/pkg-user/pages/recharge',
    '/pkg-user/pages/balance-history',
    '/pkg-user/pages/distribution',
    '/pkg-user/pages/member-center',
    '/pkg-user/pages/points-history',
    '/pkg-user/pages/points-mall',
    '/pkg-user/pages/invoice-titles',
    '/pages/admin/merchant-submit',
    '/pages/admin/platform-approve',
    '/pages/admin/distribution-settle',
];

/**
 * Check if current page requires auth, redirect to login if needed.
 * Call in page onShow or use globally in App.vue onLaunch.
 */
export function checkAuth(url?: string): boolean {
    const authStore = useAuthStore();
    const currentPath = url || getCurrentPageRoute();
    const needsAuth = AUTH_REQUIRED_PATHS.some(p => currentPath.startsWith(p));
    if (needsAuth && !authStore.token) {
        uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent(currentPath) });
        return false;
    }
    return true;
}

function getCurrentPageRoute(): string {
    const pages = getCurrentPages();
    if (pages.length === 0) return '';
    const page = pages[pages.length - 1] as any;
    return '/' + (page.route || '');
}

/**
 * Global route interceptor - call once in App.vue onLaunch.
 * Intercepts uni.navigateTo/redirectTo/switchTab/reLaunch.
 */
export function setupRouteGuard() {
    const originalNavigateTo = uni.navigateTo;
    const originalRedirectTo = uni.redirectTo;
    const originalSwitchTab = uni.switchTab;
    const originalReLaunch = uni.reLaunch;

    function guardUrl(originalFn: any, options: any) {
        const url = options?.url?.split('?')[0] || '';
        if (AUTH_REQUIRED_PATHS.some(p => url.startsWith(p))) {
            const authStore = useAuthStore();
            if (!authStore.token) {
                // 用原始 navigateTo 跳登录，避免拦截器递归
                originalNavigateTo.call(uni, { url: '/pages/login/index?redirect=' + encodeURIComponent(options.url) });
                return;
            }
        }
        return originalFn.call(uni, options);
    }

    uni.navigateTo = function (options: any) { return guardUrl(originalNavigateTo, options); } as any;
    uni.redirectTo = function (options: any) { return guardUrl(originalRedirectTo, options); } as any;
    uni.switchTab = function (options: any) { return guardUrl(originalSwitchTab, options); } as any;
    uni.reLaunch = function (options: any) { return guardUrl(originalReLaunch, options); } as any;
}
