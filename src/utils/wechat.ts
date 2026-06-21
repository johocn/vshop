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

/** Initialize wx.config with backend signature */
async function initWxConfig(): Promise<void> {
    const { getJsapiSignature } = await import('../api/queries/wechat');
    const url = window.location.href.split('#')[0];
    const sig = await getJsapiSignature(url);
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
