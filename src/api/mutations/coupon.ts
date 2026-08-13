import { getGraphQLClient } from '../client';

/** 领取优惠券 */
export async function claimCoupon(couponId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimCoupon($couponId: ID!) {
        claimCoupon(couponId: $couponId) { id code status }
    }`;
    return client.request(mutation, { couponId });
}

/**
 * 将优惠券绑定到指定订单。
 * 后端返回 CouponValidationResult { valid discountAmount error }，
 * 应用成功后需调用 getActiveOrder 刷新订单数据。
 */
export async function applyCoupon(orderId: string, code: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ApplyCoupon($orderId: ID!, $code: String!) {
        applyCoupon(orderId: $orderId, code: $code) {
            valid
            discountAmount
            error
        }
    }`;
    return client.request(mutation, { orderId, code });
}

/**
 * 移除订单上绑定的优惠券。
 * 调用后端 removeCoupon mutation：清除 customFields.appliedCouponCode 并触发价格重新计算。
 * 应用成功后需调用 getActiveOrder 刷新订单数据。
 */
export async function removeAppliedCoupon(orderId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation RemoveCoupon($orderId: ID!) {
        removeCoupon(orderId: $orderId)
    }`;
    return client.request(mutation, { orderId });
}
