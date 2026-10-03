import { getGraphQLClient } from '../client';

const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount pointsPrice perUserLimit
    scope categoryId variantId enabled shopId usageScene createdAt updatedAt
    claimable claimCode validDays newCustomerOnly memberLevel
    distributionChannels salePrice
`;

const CUSTOMER_COUPON_FIELDS = `
    id customerId templateId code status issuedBy
    reservedOrderId usedOrderId issuedAt usedAt expiredAt createdAt updatedAt
    template { ${COUPON_TEMPLATE_FIELDS} }
`;

const SALE_ORDER_FIELDS = `
    id customerId payMode templateId bundleId orderId amount status
    paidAt refundedAt createdAt
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
    ['You can only apply coupons to your own order', '只能对本人订单使用优惠券'],
    ['Binding not found', '商品专属券不存在或已下架'],
    ['Coupon is not claimable', '该券暂不可领取'],
    ['Invalid claim code', '兑换码无效'],
    ['Claim code not available in this shop', '该兑换码在当前店铺不可用'],
    ['Coupon is for new customers only', '该券仅限新客领取'],
    // —— 券商城 / 出售单 / 加价购 / 积分兑换 ——
    ['Balance payment is not available', '余额支付暂不可用，请改用微信支付'],
    ['Payment gateway not configured', '支付通道未配置，请稍后再试'],
    ['Coupon sale order not found', '出售单不存在或不属于当前店铺'],
    ['templateId or bundleId is required', '请选择要购买的券或券包'],
    ['Only one of templateId / bundleId is allowed', '单券与券包只能二选一'],
    ['Coupon is not for sale', '该券暂不可购买'],
    ['Coupon has no sale price', '该券暂不可购买'],
    ['Coupon is not available in this shop', '该券在当前店铺不可用'],
    ['Coupon bundle not found', '券包不存在或已下架'],
    ['Coupon bundle has no sale price', '该券包暂不可购买'],
    ['Coupon bundle is empty', '该券包暂无可发放的券'],
    ['Bundle template', '券包内含不可用的券，暂不可购买'],
    ['Balance refund is not available', '余额退款暂不可用，请联系客服'],
    ['Please refund the main order instead', '该券随主订单购买，请在订单中申请退款'],
    ['Coupon already used, refund rejected', '券已使用，无法退款'],
    ['Coupon sale order is', '该出售单当前不可支付或退款'],
    ['Order does not belong to the current customer', '只能操作本人的订单'],
    ['Coupon already attached to this order', '该券已加购'],
    ['Coupon is not available for online orders', '该券仅限到店使用，无法线上加购'],
    ['This coupon is not exchangeable with points', '该券暂不支持积分兑换'],
    ['Points service is not enabled', '积分功能暂不可用'],
    ['Insufficient points', '积分不足'],
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
            ${CUSTOMER_COUPON_FIELDS}
        }
    }`;
    return client.request(mutation, { templateId });
}

/** 凭兑换码领券，成功返回 CustomerCoupon */
export async function redeemCouponByCode(claimCode: string) {
    const client = getGraphQLClient();
    const mutation = `mutation RedeemCouponByCode($claimCode: String!) {
        redeemCouponByCode(claimCode: $claimCode) {
            ${CUSTOMER_COUPON_FIELDS}
        }
    }`;
    return client.request(mutation, { claimCode });
}

/** 积分兑换券，成功返回 { spentPoints, coupon } */
export async function exchangeCouponWithPoints(templateId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ExchangeCouponWithPoints($templateId: ID!) {
        exchangeCouponWithPoints(templateId: $templateId) {
            spentPoints
            coupon { ${CUSTOMER_COUPON_FIELDS} }
        }
    }`;
    return client.request(mutation, { templateId });
}

/** 创建出售单（templateId / bundleId 二选一），返回 PENDING 单 */
export async function createCouponSaleOrder(input: { templateId?: string; bundleId?: string }) {
    const client = getGraphQLClient();
    const mutation = `mutation CreateCouponSaleOrder($templateId: ID, $bundleId: ID) {
        createCouponSaleOrder(templateId: $templateId, bundleId: $bundleId) {
            ${SALE_ORDER_FIELDS}
        }
    }`;
    return client.request(mutation, {
        templateId: input.templateId ?? null,
        bundleId: input.bundleId ?? null,
    });
}

/** 生成券商城微信支付参数（openid 由后端从客户档案推导，前端可不传） */
export async function createWechatCouponPayment(saleOrderId: string, tradeType?: string, openid?: string) {
    const client = getGraphQLClient();
    const mutation = `mutation CreateWechatCouponPayment($saleOrderId: ID!, $tradeType: String, $openid: String) {
        createWechatCouponPayment(saleOrderId: $saleOrderId, tradeType: $tradeType, openid: $openid) {
            saleOrderId
            outTradeNo
            pay { payType prepayId appId timeStamp nonceStr package signType paySign payUrl }
        }
    }`;
    return client.request(mutation, { saleOrderId, tradeType: tradeType ?? null, openid: openid ?? null });
}

/** 券商城出售单余额支付（同步结算） */
export async function payCouponSaleWithBalance(id: string) {
    const client = getGraphQLClient();
    const mutation = `mutation PayCouponSaleWithBalance($id: ID!) {
        payCouponSaleWithBalance(id: $id) {
            ${SALE_ORDER_FIELDS}
        }
    }`;
    return client.request(mutation, { id });
}

/** 取消出售单（仅 PENDING） */
export async function cancelCouponSaleOrder(id: string) {
    const client = getGraphQLClient();
    const mutation = `mutation CancelCouponSaleOrder($id: ID!) {
        cancelCouponSaleOrder(id: $id) {
            ${SALE_ORDER_FIELDS}
        }
    }`;
    return client.request(mutation, { id });
}

/** 加价购：挂券到活动订单（券价随主订单结算），成功返回 CouponSaleOrder */
export async function attachCouponToOrder(orderId: string, templateId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation AttachCouponToOrder($orderId: ID!, $templateId: ID!) {
        attachCouponToOrder(orderId: $orderId, templateId: $templateId) {
            ${SALE_ORDER_FIELDS}
        }
    }`;
    return client.request(mutation, { orderId, templateId });
}

/** 取消加价购（移除 surcharge + 出售单置 CANCELLED） */
export async function detachCouponFromOrder(orderId: string, templateId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation DetachCouponFromOrder($orderId: ID!, $templateId: ID!) {
        detachCouponFromOrder(orderId: $orderId, templateId: $templateId)
    }`;
    return client.request(mutation, { orderId, templateId });
}

/** 判断模板分发渠道是否包含指定渠道（distributionChannels 为逗号分隔字符串） */
export function templateHasChannel(tpl: any, channel: string): boolean {
    const raw = tpl?.distributionChannels;
    if (!raw) return false;
    return String(raw)
        .split(',')
        .map((s: string) => s.trim().toUpperCase())
        .includes(channel.toUpperCase());
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