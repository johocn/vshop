import { wxRequestPayment, redirectPayment, getPlatform } from "../utils/platform";

export type PaymentMethod = "wechatpay" | "alipay" | "cod" | "balance-pay";

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

    switch (method) {
        case "wechatpay":
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

        case "balance-pay":
            return { success: true, message: "余额支付成功" };

        default:
            return { success: false, message: "未知支付方式: " + method };
    }
}
