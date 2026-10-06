import { wxRequestPayment, redirectPayment, getPlatform } from "../utils/platform";

export type PaymentMethod =
    | "wechatpay" | "wechatpay-yourbao-h5" | "wechatpay-youshop-jsapi"
    | "alipay" | "cod" | "balance-pay" | "aggregate-pay";

/**
 * 按端/域名解析实际使用的微信支付方法 code（分端分支付方案）：
 * - 小程序 → wechatpay（yourbao 小程序商户）
 * - H5 yourbao 域 → wechatpay-yourbao-h5（yourbao 公众号 JSAPI）
 * - H5 youshop 域（及其他） → wechatpay-youshop-jsapi（youshop 公众号 JSAPI）
 */
export function resolveWechatMethodCode(): PaymentMethod {
    // #ifdef MP-WEIXIN
    return "wechatpay";
    // #endif
    // #ifdef H5
    try {
        const host = window.location.hostname || '';
        if (host.includes('yourbao')) return "wechatpay-yourbao-h5";
        return "wechatpay-youshop-jsapi";
    } catch {
        return "wechatpay-youshop-jsapi";
    }
    // #endif
    // #ifdef APP-PLUS
    return "wechatpay";
    // #endif
}

/** 是否微信支付系方法（wechatpay / wechatpay-yourbao-h5 / wechatpay-youshop-jsapi） */
export function isWechatpayMethod(method: string): boolean {
    return method === 'wechatpay' || method.startsWith('wechatpay-');
}

export interface PaymentResult {
    success: boolean;
    message?: string;
    orderCode?: string;
}

/**
 * Handle payment based on method and response from server.
 * - wechatpay: JSAPI in mini-program, H5 redirect in browser, Dev Bypass redirect in dev
 * - alipay: redirect to payment URL
 * - cod: immediate success
 * - balance-pay: immediate success (deducted server-side)
 */
export async function handlePayment(
    method: PaymentMethod,
    paymentData: any,
): Promise<PaymentResult> {
    const platform = getPlatform();

    // 微信支付系（wechatpay / wechatpay-yourbao-h5 / wechatpay-youshop-jsapi）统一走此分支
    if (isWechatpayMethod(method)) {
            if (platform === "mp-weixin") {
                // WeChat JSAPI payment in mini-program: 后端返回完整签名参数
                // Shop API 的 Payment.metadata 只暴露 metadata.public 字段
                try {
                    const m = paymentData.metadata?.public || paymentData.metadata || paymentData;
                    await wxRequestPayment({
                        timeStamp: m.timeStamp,
                        nonceStr: m.nonceStr,
                        package: m.package,
                        signType: m.signType,
                        paySign: m.paySign,
                    });
                    return { success: true, orderCode: paymentData.orderCode };
                } catch (e: any) {
                    return { success: false, message: e.errMsg || "支付取消" };
                }
            } else if (platform === "h5") {
                // H5: Dev Bypass 返回相对 URL /wechatpay/dev-pay?orderCode=xxx
                // 生产 H5 返回完整 h5_url
                // Shop API 的 Payment.metadata 只暴露 metadata.public 字段
                const pub = paymentData.metadata?.public || paymentData.metadata || {};
                const rawUrl =
                    paymentData.h5Url ||
                    pub.h5Url ||
                    pub.payUrl ||
                    paymentData.payUrl;
                if (rawUrl) {
                    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
                    const fullUrl = rawUrl.startsWith('http')
                        ? rawUrl
                        : `${baseUrl}${rawUrl}`;
                    redirectPayment(fullUrl);
                    return { success: true, message: "请在微信中完成支付" };
                }
                return { success: false, message: "未获取到支付链接" };
            } else {
                // APP - native WeChat SDK
                // #ifdef APP-PLUS
                return new Promise((resolve) => {
                    uni.requestPayment({
                        provider: "wxpay",
                        orderInfo: paymentData,
                        success: () => resolve({ success: true, orderCode: paymentData.orderCode }),
                        fail: (err: any) => resolve({ success: false, message: err.errMsg }),
                    });
                });
                // #endif
                return { success: false, message: "不支持的支付方式" };
            }
    }

    switch (method) {
        case "alipay":
            if (paymentData.payUrl || paymentData.metadata?.payUrl) {
                redirectPayment(paymentData.payUrl || paymentData.metadata.payUrl);
                return { success: true, message: "请在支付宝中完成支付" };
            }
            // #ifdef APP-PLUS
            return new Promise((resolve) => {
                uni.requestPayment({
                    provider: "alipay",
                    orderInfo: paymentData.orderString || paymentData.metadata?.orderString,
                    success: () => resolve({ success: true, orderCode: paymentData.orderCode }),
                    fail: (err: any) => resolve({ success: false, message: err.errMsg }),
                });
            });
            // #endif
            return { success: false, message: "支付宝支付参数缺失" };

        case "cod":
            return { success: true, message: "货到付款，请在收货时支付" };

        case "aggregate-pay":
            return { success: true, message: "已扫码聚合收款码，请确认到账后发货" };

        case "balance-pay":
            return { success: true, message: "余额支付成功" };

        default:
            return { success: false, message: "未知支付方式: " + method };
    }
}

