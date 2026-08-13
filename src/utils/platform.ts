/** Platform detection and adaptation utilities */

export type PlatformType = "mp-weixin" | "mp-alipay" | "h5" | "app";

export function getPlatform(): PlatformType {
    // #ifdef MP-WEIXIN
    return "mp-weixin";
    // #endif
    // #ifdef H5
    return "h5";
    // #endif
    // #ifdef APP-PLUS
    return "app";
    // #endif
    return "h5";
}

export function isWechatMiniProgram(): boolean {
    return getPlatform() === "mp-weixin";
}

export function isH5(): boolean {
    return getPlatform() === "h5";
}

export function isApp(): boolean {
    return getPlatform() === "app";
}

/** WeChat JSAPI payment parameters (signed by backend) */
export interface WxPayParams {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
}

/** WeChat JSAPI payment (mini-program) - 接收后端生成的完整签名参数 */
export function wxRequestPayment(params: WxPayParams): Promise<void> {
    return new Promise((resolve, reject) => {
        // #ifdef MP-WEIXIN
        uni.requestPayment({
            provider: "wxpay",
            timeStamp: params.timeStamp,
            nonceStr: params.nonceStr,
            package: params.package,
            signType: params.signType as "MD5" | "HMAC-SHA256" | "RSA",
            paySign: params.paySign,
            success: () => resolve(),
            fail: (err: any) => reject(err),
        });
        // #endif
        // #ifndef MP-WEIXIN
        reject(new Error("WeChat payment only available in mini-program"));
        // #endif
    });
}

/** Redirect to external payment URL (H5 / Alipay) */
export function redirectPayment(payUrl: string): void {
    // #ifdef H5
    window.location.href = payUrl;
    // #endif
    // #ifdef MP-WEIXIN
    // Mini-program cannot redirect to external URL, use webview
    uni.navigateTo({ url: "/pages/webview/index?url=" + encodeURIComponent(payUrl) });
    // #endif
    // #ifdef APP-PLUS
    plus.runtime.openURL(payUrl);
    // #endif
}

/** Get WeChat mini-program scene parameters */
export function getSceneParams(): Record<string, string> {
    const params: Record<string, string> = {};
    // #ifdef MP-WEIXIN
    try {
        const launchInfo = uni.getLaunchOptionsSync();
        if (launchInfo?.query) {
            Object.assign(params, launchInfo.query);
        }
        if (launchInfo?.scene) {
            params.scene = String(launchInfo.scene);
        }
    } catch (e) {}
    // #endif
    return params;
}

function generateNonceStr(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}