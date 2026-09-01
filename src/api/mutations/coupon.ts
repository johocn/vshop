import { getGraphQLClient } from '../client';

const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount pointsPrice perUserLimit
    scope categoryId variantId enabled shopId createdAt updatedAt
`;

// coupon 应用/领取/清除抛错（UserInputError）的友好中文映射。
// key 为 GraphQL 错误码（extensions.code）或 message 中的唯一标识（如 COUPON_SCOPE_MISMATCH）。
const COUPON_ERROR_MAP: Record<string, string> = {
    COUPON_SCOPE_MISMATCH: '本券仅限本店商品订单使用',
};

// 后端 UserInputError 的 message 段落 → 中文兜底（错误码未覆盖时按子串匹配）
const COUPON_ERROR_MESSAGES: Array<[string, string]> = [
    ['Coupon not found or does not belong to you', '优惠券不存在或不属于您'],
    ['Coupon is not in a usable state', '该优惠券当前不可用'],
    ['Coupon template is disabled', '该优惠券已下架'],
    ['Coupon has expired', '优惠券已过期'],
    ['Coupon not yet started', '优惠券尚未开始'],
    ['Coupon not yet active', '优惠券尚未生效'],
    ['Per-user coupon limit reached', '已达该券每人限领次数'],
    ['Coupon sold out', '该优惠券已抢完'],
    ['Coupon redeemed', '该优惠券已领取'],
    ['Order total below minimum spend', '未达到该券使用门槛'],
    ['No active order to apply coupon', '暂无可使用该券的订单'],
    ['Order has no customer', '订单信息不完整，请稍后重试'],
    ['No customer for the current user', '登录状态异常，请重新登录'],
];

/** 将 coupon 接口抛出的 GraphQL 错误规范化为友好中文提示（不复用已删除的 CouponValidationResult） */
export function couponErrorMessage(e: any): string {
    const errors = e?.response?.errors || e?.errors || [];
    for (const er of errors) {
        const code = er?.extensions?.code || er?.code;
        if (code && COUPON_ERROR_MAP[code]) return COUPON_ERROR_MAP[code];
    }
    const msg = String(e?.message || '');
    for (const key of Object.keys(COUPON_ERROR_MAP)) {
        if (msg.includes(key)) return COUPON_ERROR_MAP[key];
    }
    for (const [en, zh] of COUPON_ERROR_MESSAGES) {
        if (msg.includes(en)) return zh;
    }
    return e?.message || '优惠券不可用';
}

/** 领取优惠券（按模板 id，成功返回 CustomerCoupon） */
export async function claimCoupon(templateId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimCoupon($templateId: ID!) {
        claimCoupon(templateId: $templateId) {
            id customerId templateId code status issuedBy
            reservedOrderId usedOrderId issuedAt usedAt expiredAt createdAt updatedAt
            template { ${COUPON_TEMPLATE_FIELDS} }
        }
    }`;
    return client.request(mutation, { templateId });
}

/** 将优惠码应用到当前活动订单（一单一券），成功返回更新后的 Order；失败抛错。 */
export async function applyCouponToOrder(code: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ApplyCouponToOrder($code: String!) {
        applyCouponToOrder(code: $code) {
            id totalWithTax discounts { amountWithTax }
        }
    }`;
    return client.request(mutation, { code });
}

/** 清除当前活动订单上已应用的优惠券，成功返回更新后的 Order。 */
export async function clearCouponFromOrder() {
    const client = getGraphQLClient();
    const mutation = `mutation ClearCouponFromOrder {
        clearCouponFromOrder {
            id totalWithTax discounts { amountWithTax }
        }
    }`;
    return client.request(mutation);
}