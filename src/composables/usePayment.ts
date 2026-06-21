import { wxRequestPayment, redirectPayment, getPlatform } from "../utils/platform";

export type PaymentMethod = "wechatpay" | "alipay" | "cod" | "balance-pay";

export interface PaymentResult {
    success: boolean;
    message?: string;
    orderCode?: string;
}

/**
 * Handle payment based on method and response from server.
 * - wechatpay: JSAPI in mini-program, H5 redirect in browser
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
                // WeChat JSAPI payment in mini-program
                try {
                    await wxRequestPayment(paymentData.prepayId || paymentData.metadata?.prepayId);
                    return { success: true, orderCode: paymentData.orderCode };
                } catch (e: any) {
                    return { success: false, message: e.errMsg || "支付取消" };
                }
            } else if (platform === "h5") {
                // WeChat H5 payment - redirect
                if (paymentData.h5Url || paymentData.metadata?.h5Url) {
                    redirectPayment(paymentData.h5Url || paymentData.metadata.h5Url);
                    return { success: true, message: "请在微信中完成支付" };
                }
                return { success: false, message: "请在微信中打开" };
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