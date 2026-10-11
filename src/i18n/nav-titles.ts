import { i18n } from './index';

/**
 * 导航标题集中式 i18n 映射：pages.json 路由 path（不带前导斜杠、不含 query）→ nav 命名空间 key。
 * 仅收录用户侧页面；pages/admin/ 下内部工具页与 globalStyle 的 Youshop 品牌名不参与。
 * 表中查不到的 path 不做任何处理，保留 pages.json 里的中文默认标题作为 fallback。
 */
export const NAV_TITLE_KEYS: Record<string, string> = {
    // 主包
    'pages/home/index': 'nav.home',
    'pages/category/index': 'nav.category',
    'pages/cart/index': 'nav.cart',
    'pages/login/index': 'nav.login',
    'pages/register/index': 'nav.register',
    'pages/profile/index': 'nav.profile',
    'pages/webview/index': 'nav.webviewPay',
    'pages/landing/invite': 'nav.invite',
    // pkg-product
    'pkg-product/pages/list': 'nav.productList',
    'pkg-product/pages/detail': 'nav.productDetail',
    'pkg-product/pages/evaluate': 'nav.productEvaluate',
    // pkg-order
    'pkg-order/pages/checkout': 'nav.checkout',
    'pkg-order/pages/payment': 'nav.payment',
    'pkg-order/pages/pay-result': 'nav.payResult',
    'pkg-order/pages/orders': 'nav.orders',
    'pkg-order/pages/order-detail': 'nav.orderDetail',
    'pkg-order/pages/invoice-apply': 'nav.invoiceApply',
    'pkg-order/pages/invoices': 'nav.invoices',
    'pkg-order/pages/order-evaluate': 'nav.orderEvaluate',
    // pkg-after-sale
    'pkg-after-sale/pages/apply': 'nav.afterSaleApply',
    'pkg-after-sale/pages/list': 'nav.afterSaleList',
    'pkg-after-sale/pages/detail': 'nav.afterSaleDetail',
    // pkg-promotion
    'pkg-promotion/pages/flash-sale': 'nav.flashSale',
    'pkg-promotion/pages/group-buy': 'nav.groupBuy',
    'pkg-promotion/pages/coupons': 'nav.coupons',
    'pkg-promotion/pages/coupon-code': 'nav.couponCode',
    'pkg-promotion/pages/coupon-mall': 'nav.couponMall',
    'pkg-promotion/pages/live-list': 'nav.liveList',
    'pkg-promotion/pages/live-room': 'nav.liveRoom',
    // pkg-user
    'pkg-user/pages/profile': 'nav.userCenter',
    'pkg-user/pages/addresses': 'nav.addresses',
    'pkg-user/pages/recharge': 'nav.recharge',
    'pkg-user/pages/balance-history': 'nav.balanceHistory',
    'pkg-user/pages/withdraw': 'nav.withdraw',
    'pkg-user/pages/faq': 'nav.faq',
    'pkg-user/pages/feedback': 'nav.feedback',
    'pkg-user/pages/lottery': 'nav.lottery',
    'pkg-user/pages/member-center': 'nav.memberCenter',
    'pkg-user/pages/points-history': 'nav.pointsHistory',
    'pkg-user/pages/points-mall': 'nav.pointsMall',
    'pkg-user/pages/distribution': 'nav.distribution',
    'pkg-user/pages/logistics': 'nav.logistics',
    'pkg-user/pages/invoice-titles': 'nav.invoiceTitles',
    'pkg-user/pages/my-reviews': 'nav.myReviews',
    'pkg-user/pages/change-password': 'nav.changePassword',
    'pkg-user/pages/agreement': 'nav.agreement',
    'pkg-user/pages/points-goods-list': 'nav.pointsGoodsList',
    'pkg-user/pages/points-goods-detail': 'nav.pointsGoodsDetail',
    'pkg-user/pages/points-goods-confirm': 'nav.pointsGoodsConfirm',
    'pkg-user/pages/points-orders': 'nav.pointsOrders',
    'pkg-user/pages/favorites': 'nav.favorites',
    // pkg-circle
    'pkg-circle/pages/feed': 'nav.circleFeed',
    'pkg-circle/pages/detail': 'nav.circleDetail',
    'pkg-circle/pages/publish': 'nav.circlePublish',
};

/** url → 表内 path：去 query、去前导斜杠 */
function normalizePath(url: string): string {
    return String(url || '').split('?')[0].replace(/^\//, '');
}

/**
 * 按映射把当前页面导航栏标题设为当前语言的翻译（不依赖页面实例，纯全局）。
 * 页面 meta 尚未挂载（如 App onLaunch 时序）时 uni 会回调 fail，以短重试兜底；
 * H5 下再以 document.title 达成与否校验，防页面 meta 晚挂载导致默认标题回写。
 */
export function applyNavTitle(path: string, attempt = 0): void {
    const key = NAV_TITLE_KEYS[normalizePath(path)];
    if (!key) return;
    const title = String((i18n.global as any).t(key));
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
 * 挂载导航标题拦截器：四类导航成功后按目标页 path 应用当前语言标题。
 * 注意 uni 拦截器 success 回调只带结果（errMsg），目标 url 需在 invoke 钩子里捕获。
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
}
