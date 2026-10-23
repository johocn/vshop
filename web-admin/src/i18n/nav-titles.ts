import { useLocaleStore } from '../stores/localeStore';

/**
 * 导航标题集中式 i18n 映射：pages.json 路由 path（不带前导斜杠、不含 query）→ nav 命名空间 key。
 * 覆盖 pages.json 全部 94 个页面（无一空标题）；pages.json 不改，中文标题保留为 fallback。
 * 平移自 C 端 src/i18n/nav-titles.ts；web-admin 无原生 tabbar，故无 applyTabbarLabels 部分。
 */
export const NAV_TITLE_KEYS: Record<string, string> = {
    'pages/login/index': 'nav.login',
    'pages/change-password/index': 'nav.changePassword',
    'pages/channel-select/index': 'nav.channelSelect',
    'pages/dashboard/index': 'nav.dashboard',
    'pages/decorate/home/index': 'nav.decorateHome',
    'pages/decorate/theme/index': 'nav.decorateTheme',
    'pages/decorate/shop-info/index': 'nav.decorateShopInfo',
    'pages/decorate/product/index': 'nav.decorateProduct',
    'pages/decorate/category/index': 'nav.decorateCategory',
    'pages/decorate/cart/index': 'nav.decorateCart',
    'pages/decorate/profile/index': 'nav.decorateProfile',
    'pages/product/list/index': 'nav.productList',
    'pages/product/create/index': 'nav.productCreate',
    'pages/product/edit/index': 'nav.productEdit',
    'pages/product/categories/index': 'nav.productCategories',
    'pages/order/list/index': 'nav.orderList',
    'pages/order/detail/index': 'nav.orderDetail',
    'pages/order/ship/index': 'nav.orderShip',
    'pages/order/picking/index': 'nav.orderPicking',
    'pages/order/picking/batch': 'nav.orderPickingBatch',
    'pages/order/payment-timeout/index': 'nav.orderPaymentTimeout',
    'pages/after-sale/list/index': 'nav.afterSaleList',
    'pages/review/list/index': 'nav.reviewList',
    'pages/kb/index/index': 'nav.kbIndex',
    'pages/rider/withdraw/index': 'nav.riderWithdraw',
    'pages/rider/audit/index': 'nav.riderAudit',
    'pages/after-sale/detail/index': 'nav.afterSaleDetail',
    'pages/inventory/stock/index': 'nav.inventoryStock',
    'pages/inventory/stock-doc/purchase/index': 'nav.stockDocPurchase',
    'pages/inventory/stock-doc/transfer/index': 'nav.stockDocTransfer',
    'pages/inventory/stock-doc/stocktake/index': 'nav.stockDocStocktake',
    'pages/inventory/stock-doc/issue/index': 'nav.stockDocIssue',
    'pages/inventory/movements/index': 'nav.inventoryMovements',
    'pages/inventory/alert-rules/index': 'nav.inventoryAlertRules',
    'pages/inventory/stock-doc/index': 'nav.stockDoc',
    'pages/inventory/reservation/index': 'nav.inventoryReservation',
    'pages/inventory/locations/index': 'nav.inventoryLocations',
    'pages/inventory/locations/edit': 'nav.inventoryLocationsEdit',
    'pages/inventory/bins/index': 'nav.inventoryBins',
    'pages/inventory/stocktake/index': 'nav.stocktake',
    'pages/inventory/stocktake/task': 'nav.stocktakeTask',
    'pages/inventory/stocktake/count': 'nav.stocktakeCount',
    'pages/inventory/stocktake/scan': 'nav.stocktakeScan',
    'pages/inventory/stocktake/diff': 'nav.stocktakeDiff',
    'pages/shipping/methods/index': 'nav.shippingMethods',
    'pages/shipping/method-config/index': 'nav.shippingMethodConfig',
    'pages/payment/methods/index': 'nav.paymentMethods',
    'pages/data/dashboard/index': 'nav.dataDashboard',
    'pages/distribution/relations/index': 'nav.distributionRelations',
    'pages/distribution/settle/index': 'nav.distributionSettle',
    'pages/balance/withdraw/index': 'nav.balanceWithdraw',
    'pages/settle/ledger/index': 'nav.settleLedger',
    'pages/media/library/index': 'nav.mediaLibrary',
    'pages/shipping/profile/index': 'nav.shippingProfile',
    'pages/payment/profile/index': 'nav.paymentProfile',
    'pages/campus/config': 'nav.campusConfig',
    'pages/campus/merchant': 'nav.campusMerchant',
    'pages/campus/dispatch': 'nav.campusDispatch',
    'pages/campus/stats': 'nav.campusStats',
    'pages/campus/address-changes': 'nav.campusAddressChanges',
    'pages/campus/buildings': 'nav.campusBuildings',
    'pages/pickup/index': 'nav.pickup',
    'pages/pickup/edit/index': 'nav.pickupEdit',
    'pages/pickup/redeem/index': 'nav.pickupRedeem',
    'pages/coupon/index': 'nav.coupon',
    'pages/coupon/edit/index': 'nav.couponEdit',
    'pages/coupon/issue/index': 'nav.couponIssue',
    'pages/coupon/pick-products/index': 'nav.couponPickProducts',
    'pages/coupon/bundle/index': 'nav.couponBundle',
    'pages/coupon/bundle/edit/index': 'nav.couponBundleEdit',
    'pages/coupon/sale-orders/index': 'nav.couponSaleOrders',
    'pages/coupon/settlements/index': 'nav.couponSettle',
    'pages/coupon/student-verify/index': 'nav.studentVerify',
    'pages/billpay/orders/index': 'nav.billpayOrders',
    'pages/billpay/merchants/index': 'nav.billpayMerchants',
    'pages/promotion/flash-sale/index': 'nav.flashSale',
    'pages/promotion/flash-sale/edit': 'nav.flashSaleEdit',
    'pages/promotion/group-buy/index': 'nav.groupBuy',
    'pages/promotion/group-buy/edit': 'nav.groupBuyEdit',
    'pages/member/level-config/index': 'nav.memberLevelConfig',
    'pages/feedback/faq/index': 'nav.feedbackFaq',
    'pages/feedback/list/index': 'nav.feedbackList',
    'pages/circle/posts/index': 'nav.circlePosts',
    'pages/lottery/prizes/index': 'nav.lotteryPrizes',
    'pages/points/goods/index': 'nav.pointsGoods',
    'pages/points/orders/index': 'nav.pointsOrders',
    'pages/hotel/bookings/index': 'nav.hotelBookings',
    'pages/in-store/redeem/index': 'nav.inStoreRedeem',
    'pages/in-store/bills/index': 'nav.inStoreBills',
    'pages/pos/index': 'nav.pos',
    'pages/platform/tenants/index': 'nav.platformTenants',
    'pages/platform/tenants/detail': 'nav.platformTenantsDetail',
    'pages/platform/roles/index': 'nav.platformRoles',
    'pages/platform/members/index': 'nav.platformMembers',
    'pages/platform/room-templates/index': 'nav.roomTemplates',
    'pages/platform/templates/index': 'nav.styleTemplates',
    'pages/platform/global-config/index': 'nav.globalConfig',
    'pages/platform/product-approval/index': 'nav.productApproval',
    'pages/platform/reconcile/index': 'nav.reconcile',
    'pages/wechat/menu/index': 'nav.wechatMenu',
    'pages/wechat/fans/index': 'nav.wechatFans',
    'pages/wechat/templates/index': 'nav.wechatTemplates',
};

/** url → 表内 path：去 query、去前导斜杠 */
function normalizePath(url: string): string {
    return String(url || '').split('?')[0].replace(/^\//, '');
}

/**
 * 按映射把当前页面导航栏标题设为当前语言的翻译（不依赖页面实例，纯全局）。
 * 翻译走自研 localeStore.t（web-admin 无 vue-i18n 实例）。
 * 页面 meta 尚未挂载（如 App onLaunch 时序）时 uni 会回调 fail，以短重试兜底；
 * H5 下再以 document.title 达成与否校验，防页面 meta 晚挂载导致默认标题回写。
 */
export function applyNavTitle(path: string, attempt = 0): void {
    const key = NAV_TITLE_KEYS[normalizePath(path)];
    if (!key) return;
    const title = String(useLocaleStore().t(key));
    uni.setNavigationBarTitle({
        title,
        success: () => {
            if (typeof document === 'undefined' || document.title === title) return;
            if (attempt < 10) setTimeout(() => applyNavTitle(path, attempt + 1), 100);
        },
        fail: () => {
            if (attempt < 10) setTimeout(() => applyNavTitle(path, attempt + 1), 100);
        },
    });
}

/**
 * 对当前栈顶页面应用导航标题（App onShow / 语言切换等时机调用）。
 * 解决 onLaunch 一次性 apply 覆盖不到的场景：直载/分享链接/收藏直达等入口。
 */
export function applyNavTitleForCurrentPage(attempt = 0): void {
    const pages = getCurrentPages();
    const cur = pages[pages.length - 1] as any;
    if (!cur?.route) {
        // 冷启动 onShow 时页面栈可能尚未就绪，短重试兜底
        if (attempt < 10) setTimeout(() => applyNavTitleForCurrentPage(attempt + 1), 100);
        return;
    }
    applyNavTitle(String(cur.route));
}

/**
 * 启动期路由观察（仅前 5 秒，之后交由导航拦截器）：
 * 深链直载/浏览器前进后退等入口不走 uni 导航 API、拦截器拦不到；onLaunch 单次 apply
 * 时序也可能早于页面 meta 挂载。故在启动早期轮询栈顶路由，每次变化即应用对应语言标题。
 */
let watchStarted = false;

export function startNavTitleWatch(): void {
    if (watchStarted) return;
    watchStarted = true;
    let last = '';
    let n = 0;
    const timer = setInterval(() => {
        const pages = getCurrentPages();
        const cur = pages[pages.length - 1] as any;
        const r = String(cur?.route || '');
        if (r && r !== last) {
            last = r;
            applyNavTitle(r);
        }
        if (++n >= 50) clearInterval(timer);
    }, 100);
}

/**
 * 挂载导航标题拦截器：四类导航成功后按目标页 path 应用当前语言标题。
 * 注意 uni 拦截器 success 回调只带结果（errMsg），目标 url 需在 invoke 钩子里捕获。
 * 与 routeGuard 的导航拦截器互不冲突（各自 addInterceptor 独立生效）。
 */
export function setupNavTitleInterceptor(): void {
    (['navigateTo', 'redirectTo', 'reLaunch', 'switchTab'] as const).forEach((method) => {
        let target = '';
        uni.addInterceptor(method, {
            invoke(args: any) {
                target = String(args?.url || '');
            },
            success() {
                if (target) applyNavTitle(target);
                target = '';
            },
            fail() {
                target = '';
            },
        });
    });
    // 返回不经过 invoke 的目标 url：成功后对新的栈顶页应用标题
    uni.addInterceptor('navigateBack', {
        success() {
            applyNavTitleForCurrentPage();
        },
    });
}
