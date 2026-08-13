const fs = require('fs');
const path = require('path');

// File 1: utils/wechat.ts
const wechatTs = `// #ifdef H5
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
`;

// File 2: api/queries/wechat.ts
const queriesDir = path.join('e:/code/vshop/src/api/queries');
if (!fs.existsSync(queriesDir)) fs.mkdirSync(queriesDir, { recursive: true });

const wechatQuery = `import { getGraphQLClient, deduped } from '../client';

export interface JsapiSignatureResult {
    appId: string;
    timestamp: number;
    nonceStr: string;
    signature: string;
}

export async function getJsapiSignature(url: string): Promise<JsapiSignatureResult> {
    const key = 'wechatJsapiSignature:' + url;
    return deduped(key, async () => {
        const client = getGraphQLClient();
        const data = await client.request(\\\`
            query WechatJsapiSignature(\\\$url: String!) {
                wechatJsapiSignature(url: \\\$url) {
                    appId
                    timestamp
                    nonceStr
                    signature
                }
            }
        \\\`, { url });
        return data.wechatJsapiSignature;
    });
}
`;

fs.writeFileSync('e:/code/vshop/src/utils/wechat.ts', wechatTs, 'utf8');
fs.writeFileSync('e:/code/vshop/src/api/queries/wechat.ts', wechatQuery, 'utf8');
console.log('Task 4 files created OK');
