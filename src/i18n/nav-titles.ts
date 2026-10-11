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
 * 对当前栈顶页面应用导航标题（App onShow / 语言切换等时机调用）。
 * 解决 onLaunch 一次性 apply 覆盖不到的场景：tabbar 页直载（meta 挂载晚于重试窗口）、
 * 分享链接/收藏直达等入口。
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
 * uni-app H5 对 tabbar 页直载是「先起首页再内部切 tab」，内部切换不走 uni.switchTab API、
 * 拦截器拦不到；onLaunch/onShow 单次 apply 也只会落在首页。故在启动早期轮询栈顶路由，
 * 每次变化即应用对应语言标题，覆盖直载/分享直达/初始切 tab 等入口。
 */
let watchStarted = false;
let tabbarApplied = false;

/**
 * 原生 tabbar 标签 i18n：pages.json tabBar.list 顺序固定（0首页/1分类/2购物车/3我的），
 * 文案复用 nav.* 词条（与对应页面标题同 key），uni.setTabBarItem 逐项应用。
 * 全部成功前置 tabbarApplied=false，由启动观察循环重试（onShow 时 tabbar 可能尚未挂载）；
 * 查不到词条时跳过该项保留中文默认。
 */
export function applyTabbarLabels(): void {
    const items: Array<{ index: number; key: string }> = [
        { index: 0, key: 'nav.home' },
        { index: 1, key: 'nav.category' },
        { index: 2, key: 'nav.cart' },
        { index: 3, key: 'nav.profile' },
    ];
    const t = i18n.global.t as (k: string) => string;
    let failed = false;
    items.forEach(({ index, key }) => {
        const label = t(key);
        if (!label || label === key) return;
        uni.setTabBarItem({
            index,
            text: label,
            success: () => {},
            fail: () => {
                failed = true;
            },
        });
    });
    tabbarApplied = !failed;
}

export function startNavTitleWatch(): void {
    if (watchStarted) return;
    watchStarted = true;
    applyTabbarLabels();
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
        if (!tabbarApplied) applyTabbarLabels();
        if (++n >= 50) clearInterval(timer);
    }, 100);
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
    // 返回不经过 invoke 的目标 url：成功后对新的栈顶页应用标题（如语言切换页返回）
    uni.addInterceptor('navigateBack', {
        success() {
            applyNavTitleForCurrentPage();
        },
    });
}
