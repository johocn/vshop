import { getGraphQLClient } from '../client';

// CouponTemplate 全字段（领券中心 / 积分商城共用）。
// type: CouponType = FIXED | PERCENT | FULL | FREE_SHIPPING
// discountValue：FIXED/FULL 为金额（分）；PERCENT 为 1-99 折扣值（85 = 8.5折）；FREE_SHIPPING 无意义。
const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount pointsPrice perUserLimit
    scope categoryId variantId enabled shopId usageScene createdAt updatedAt
    claimable claimCode validDays newCustomerOnly memberLevel
    distributionChannels salePrice
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

/** 券包（出售型）：items 仅含 templateId + quantity，模板详情需用 catalogue.templates 映射 */
const BUNDLE_FIELDS = `
    id name description salePrice enabled channelId
    items { id bundleId templateId quantity }
`;

/** 出售单字段（券商城购买/余额支付/轮询支付结果共用） */
const SALE_ORDER_FIELDS = `
    id customerId payMode templateId bundleId orderId amount status
    paidAt refundedAt createdAt
`;

/** 券商城目录：可售单券 + 启用券包；scene: ONLINE | IN_STORE | ALL，缺省 ONLINE */
export async function getCouponSaleCatalogue(scene?: string) {
    const client = getGraphQLClient();
    const query = `query CouponSaleCatalogue($scene: CouponUsageScene) {
        couponSaleCatalogue(scene: $scene) {
            templates {
                ${COUPON_TEMPLATE_FIELDS}
            }
            bundles {
                ${BUNDLE_FIELDS}
            }
        }
    }`;
    return client.request(query, { scene: scene ?? null });
}

/** 我的出售单（含 PENDING/PAID/…），微信回调异步结算后轮询确认用 */
export async function getMyCouponSaleOrders() {
    const client = getGraphQLClient();
    const query = `query MyCouponSaleOrders {
        myCouponSaleOrders {
            ${SALE_ORDER_FIELDS}
        }
    }`;
    return client.request(query);
}

/** 积分商城：可用积分兑换的券模板列表 */
export async function getPointsMallTemplates() {
    const client = getGraphQLClient();
    const query = `query PointsMallTemplates {
        pointsMallTemplates {
            ${COUPON_TEMPLATE_FIELDS}
        }
    }`;
    return client.request(query);
}

/** 商品专属券绑定字段（含模板详情） */
const PRODUCT_COUPON_BINDING_FIELDS = `
    id productId variantIds couponTemplateId enabled displayOrder
    badgeText promoTitle
    template {
        ${COUPON_TEMPLATE_FIELDS}
    }
`;

/** 商品专属券：查询指定商品可领取/可加价购的券绑定列表（含模板详情） */
export async function getProductCoupons(productId: string) {
    const client = getGraphQLClient();
    const query = `query ProductCoupons($productId: ID!) {
        productCoupons(productId: $productId) {
            ${PRODUCT_COUPON_BINDING_FIELDS}
        }
    }`;
    return client.request(query, { productId });
}

/** 按券码精准查当前用户自己的单张券（券码页轮询核销状态用），非本人券返回 null */
export async function getMyCouponByCode(code: string) {
    const client = getGraphQLClient();
    const query = `query MyCouponByCode($code: String!) {
        customerCouponByCode(code: $code) {
            id customerId templateId code status issuedBy
            reservedOrderId usedOrderId issuedAt usedAt expiredAt
            createdAt updatedAt
            template {
                ${COUPON_TEMPLATE_FIELDS}
            }
        }
    }`;
    return client.request(query, { code });
}