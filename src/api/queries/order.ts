import { getGraphQLClient } from '../client';
import { ORDER_FRAGMENT } from '../fragments';

export async function getActiveOrder() {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query ActiveOrder { activeOrder { ...OrderDetail } }`;
    return client.request(query);
}

export async function getOrder(id: string) {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query GetOrder($id: ID!) { order(id: $id) { ...OrderDetail } }`;
    return client.request(query, { id });
}

export async function getOrders(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query GetOrders($options: OrderListOptions) { myOrders(options: $options) { items { ...OrderDetail } totalItems } }`;
    return client.request(query, { options: { take: 10, sort: { createdAt: 'DESC' }, ...options } });
}

export async function getOrderByCode(code: string) {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query OrderByCode($code: String!) { orderByCode(code: $code) { ...OrderDetail } }`;
    return client.request(query, { code });
}

/**
 * C 端查询本人订单的包裹（含承运商/运单号）。shop-api 由 logistics-plugin 提供，
 * 内部按 activeUserId 做归属校验。
 */
export async function getMyOrderPackages(orderId: string) {
    const client = getGraphQLClient();
    const query = `query MyOrderPackages($orderId: ID!) {
        myOrderPackages(orderId: $orderId) { code status trackingNo carrierName courierName }
    }`;
    return client.request(query, { orderId });
}

/**
 * C 端查询本人订单的物流轨迹（按 fulfillment 关联）。shop-api 由 logistics-plugin 提供，
 * 内部校验订单归属（customer.user.id 与 activeUserId 比较）。
 */
export async function getMyOrderTracks(orderId: string) {
    const client = getGraphQLClient();
    const query = `query MyOrderTracks($orderId: ID!) {
        myOrderTracks(orderId: $orderId) {
            id fulfillmentId trackingNo carrierCode carrierName status trackInfo signedAt lastSyncedAt
        }
    }`;
    return client.request(query, { orderId });
}

export async function getEligibleShippingMethods() {
    const client = getGraphQLClient();
    const query = `query { eligibleShippingMethods { id name code price priceWithTax description } }`;
    return client.request(query);
}

/**
 * 按购物车商品的 ShippingProfile 交集查询可用配送方式
 * 返回 null 表示 profileIds 为空（回退到 eligibleShippingMethods）
 */
export async function getEligibleShippingMethodsByProfile(profileIds: string[]) {
    if (!profileIds || profileIds.length === 0) return null;
    const client = getGraphQLClient();
    const query = `query($profileIds: [ID!]!) {
        eligibleShippingMethodsByProfile(profileIds: $profileIds) { id code name }
    }`;
    return client.request(query, { profileIds });
}

/**
 * 按购物车商品的 PaymentProfile 交集查询可用支付方式
 */
export async function getEligiblePaymentMethodsByProfile(profileIds: string[]) {
    if (!profileIds || profileIds.length === 0) return null;
    const client = getGraphQLClient();
    const query = `query($profileIds: [ID!]!) {
        eligiblePaymentMethodsByProfile(profileIds: $profileIds) { id code name }
    }`;
    return client.request(query, { profileIds });
}

/**
 * 按购物车商品的 ShippingProfile 交集查询允许的自提点
 * 返回 null 表示未约束（展示全部），返回 [] 表示约束但交集为空，返回 [locations] 表示交集
 */
export async function getEligiblePickupLocationsByProfile(profileIds: string[]) {
    if (!profileIds || profileIds.length === 0) return null;
    const client = getGraphQLClient();
    const query = `query($profileIds: [ID!]!) {
        eligiblePickupLocationsByProfile(profileIds: $profileIds) { id name type address phoneNumber businessHours }
    }`;
    return client.request(query, { profileIds });
}

/**
 * 检查是否任一 Profile 约束了自提点
 * 用于区分 eligiblePickupLocationsByProfile 返回 [] 的两种情况：
 * - false → 未约束，展示全部自提点
 * - true  → 约束了但交集为空，展示"无可用自提点"
 */
export async function checkPickupLocationConstraint(profileIds: string[]) {
    if (!profileIds || profileIds.length === 0) return false;
    const client = getGraphQLClient();
    const query = `query($profileIds: [ID!]!) {
        checkPickupLocationConstraint(profileIds: $profileIds)
    }`;
    return client.request(query, { profileIds });
}