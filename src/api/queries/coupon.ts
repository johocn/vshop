import { getGraphQLClient } from '../client';

// CouponTemplate 全字段（领券中心 / 积分商城共用）。
// type: CouponType = FIXED | PERCENT | FULL | FREE_SHIPPING
// discountValue：FIXED/FULL 为金额（分）；PERCENT 为 1-99 折扣值（85 = 8.5折）；FREE_SHIPPING 无意义。
const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount pointsPrice perUserLimit
    scope categoryId variantId enabled shopId createdAt updatedAt
`;

/** 领券中心：当前可领取的优惠券模板列表 */
export async function getCouponCentre() {
    const client = getGraphQLClient();
    const query = `query CouponCentre {
        couponCentre {
            ${COUPON_TEMPLATE_FIELDS}
        }
    }`;
    return client.request(query);
}

/** 我的卡包（已领取的券），可按状态过滤：UNUSED / USED / RETURNED / EXPIRED / INVALID */
export async function getMyCoupons(status?: string) {
    const client = getGraphQLClient();
    const query = `query MyCoupons($status: CouponStatus) {
        myCoupons(status: $status) {
            id customerId templateId code status issuedBy
            reservedOrderId usedOrderId issuedAt usedAt expiredAt
            createdAt updatedAt
            template {
                ${COUPON_TEMPLATE_FIELDS}
            }
        }
    }`;
    return client.request(query, { status: status ?? null });
}