import { getGraphQLClient } from '../client';

/** 可领取优惠券列表（领券中心） */
export async function getAvailableCoupons() {
    const client = getGraphQLClient();
    const query = `query AvailableCoupons {
        availableCoupons {
            id name description couponType discountValue
            minSpend maxDiscount startAt endAt
            totalQuantity claimedCount limitPerUser
            isActive isNewUserOnly isGlobal
        }
    }`;
    return client.request(query);
}

/** 我的卡包（已领取的券），可按状态过滤：UNUSED / USED / EXPIRED */
export async function getMyCoupons(status?: string) {
    const client = getGraphQLClient();
    const query = `query MyCoupons($status: String) {
        myCoupons(status: $status) {
            id code status claimedAt usedAt
            coupon {
                id name description couponType discountValue
                minSpend maxDiscount startAt endAt
            }
        }
    }`;
    return client.request(query, { status: status ?? null });
}

/** 校验优惠码是否可用（可选指定订单） */
export async function validateCoupon(code: string, orderId?: string) {
    const client = getGraphQLClient();
    const query = `query ValidateCoupon($code: String!, $orderId: ID) {
        validateCoupon(code: $code, orderId: $orderId) {
            valid message
        }
    }`;
    return client.request(query, { code, orderId: orderId ?? null });
}
