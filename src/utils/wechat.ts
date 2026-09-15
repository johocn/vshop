// #ifdef H5
declare const wx: any;

let wxLoadPromise: Promise<void> | null = null;
let wxReadyPromise: Promise<void> | null = null;

/** Dynamically load WeChat JS-SDK script */
function loadWechatJS(): Promise<void> {
    if (wxLoadPromise) return wxLoadPromise;
    wxLoadPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined') { resolve(); return; }
        if (typeof wx !== 'undefined') { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load WeChat JS-SDK'));
        document.head.appendChild(script);
    });
    return wxLoadPromise;
}

/** Check if current browser is WeChat */
export function isWechatBrowser(): boolean {
    try { return /MicroMessenger/i.test(navigator.userAgent); } catch { return false; }
}

/** 从当前渠道 zhao-sso provider 取 JS-SDK 签名（与 youshop.cn 同款接口，多域名共用同一公众号签名） */
async function fetchJssdkSignature(url: string): Promise<{ appId?: string; timestamp?: number; nonceStr?: string; signature?: string } | null> {
    const { useTenantStore } = await import('../stores/tenant');
    let tenant = useTenantStore();
    let provider = tenant.ssoProviders.find((p) => p.protocol === 'zhao-sso');
    // ssoProviders 通常仅在登录页加载；直接在分享页签名时懒加载一次后重试
    if (!provider) {
        try { await tenant.loadSsoProviders(); } catch { /* 忽略 */ }
        provider = tenant.ssoProviders.find((p) => p.protocol === 'zhao-sso');
    }
    if (!provider?.baseUrl) {
        console.warn('[wechat] signature: no zhao-sso provider baseUrl');
        return null;
    }
    try {
        const res = await fetch(`${provider.baseUrl}/v1/auth/jssdk-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, appType: 'official_account' }),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('[wechat] signature fetch failed:', e);
        return null;
    }
}

/** Initialize wx.config with zhao-sso signature */
async function initWxConfig(): Promise<void> {
    const url = window.location.href.split('#')[0];
    const sig = await fetchJssdkSignature(url);
    if (!sig?.signature) {
        // 签名不可用时静默降级：抛错由 ensureWxReady 的调用方(catch)兜底
        throw new Error('jssdk signature unavailable');
    }
    wx.config({
        debug: false,
        appId: sig.appId,
        timestamp: sig.timestamp,
        nonceStr: sig.nonceStr,
        signature: sig.signature,
        jsApiList: [
            'updateAppMessageShareData',
            'updateTimelineShareData',
            'onMenuShareAppMessage',
            'onMenuShareTimeline',
        ],
        openTagList: [],
    });
    return new Promise<void>((resolve, reject) => {
        wx.ready(() => resolve());
        wx.error((err: any) => reject(err));
    });
}

/** Ensure wx is ready - singleton promise */
export function ensureWxReady(): Promise<void> {
    if (!isWechatBrowser()) return Promise.resolve();
    if (wxReadyPromise) return wxReadyPromise;
    wxReadyPromise = loadWechatJS().then(() => initWxConfig());
    return wxReadyPromise;
}

/** Reset wx ready state (e.g. after SPA navigation with URL change) */
export function resetWxReady() {
    wxReadyPromise = null;
}
// #endif
