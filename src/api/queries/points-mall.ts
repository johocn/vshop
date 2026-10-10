import { getGraphQLClient } from '../client';

/** PointsProduct 公开字段串（列表/详情复用） */
const POINTS_PRODUCT_FIELDS = `
            id productId variantId name slug image pointsPrice cashPrice deliveryType
            stock perUserLimit myRedeemedCount redeemedCount validFrom validTo sortOrder priceWithTax inStock
        `;

/** PointsOrder 字段串（下单返回/订单列表复用） */
const POINTS_ORDER_FIELDS = `
            id code customerId quantity pointsTotal cashTotal deliveryType status
            productSnapshot { productId variantId name image spec }
            addressSnapshot { name phone province city district detail }
            trackingNo paidAt shippedAt completedAt createdAt
        `;

/** 积分商品列表（分页，游客可浏览） */
export async function getPointsProducts(options: { skip: number; take: number }) {
    const client = getGraphQLClient();
    return client.request(
        `query PointsProducts($skip: Int, $take: Int) {
            pointsProducts(options: { skip: $skip, take: $take }) {
                items { ${POINTS_PRODUCT_FIELDS} }
                totalItems
            }
        }`,
        { skip: options.skip, take: options.take },
    );
}

/** 积分商品详情 */
export async function getPointsProduct(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `query PointsProduct($id: ID!) { pointsProduct(id: $id) { ${POINTS_PRODUCT_FIELDS} } }`,
        { id },
    );
}

/** 我的收藏（分页，需登录） */
export async function getMyFavorites(options: { skip: number; take: number }) {
    const client = getGraphQLClient();
    return client.request(
        `query MyFavorites($skip: Int, $take: Int) {
            myFavorites(options: { skip: $skip, take: $take }) {
                items { productId name slug image priceWithTax isOnSale pointsPrice favoritedAt }
                totalItems
            }
        }`,
        { skip: options.skip, take: options.take },
    );
}

/** 商品收藏元信息（收藏数 + 我是否已收藏，游客可查） */
export async function getProductFavoriteMeta(productId: string) {
    const client = getGraphQLClient();
    return client.request(
        `query ProductFavoriteMeta($productId: ID!) {
            productFavoriteMeta(productId: $productId) { favoriteCount myFavorited }
        }`,
        { productId },
    );
}

/** 我的积分订单（分页；status 可选：pending_payment/pending_ship/shipped/completed/cancelled） */
export async function getMyPointsOrders(options: { skip: number; take: number; status?: string }) {
    const client = getGraphQLClient();
    return client.request(
        `query MyPointsOrders($skip: Int, $take: Int, $status: String) {
            myPointsOrders(options: { skip: $skip, take: $take, status: $status }) {
                items { ${POINTS_ORDER_FIELDS} }
                totalItems
            }
        }`,
        { skip: options.skip, take: options.take, status: options.status },
    );
}

/** 切换商品收藏（返回最新收藏状态与总数，需登录） */
export async function toggleProductFavorite(productId: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation ToggleProductFavorite($productId: ID!) {
            toggleProductFavorite(productId: $productId) { favorited favoriteCount }
        }`,
        { productId },
    );
}

/** 创建积分兑换订单（实物必传 addressId；返回 PointsOrder） */
export async function createPointsOrderExchange(input: { pointsProductId: string; quantity: number; addressId?: string }) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreatePointsOrderExchange($input: CreatePointsOrderInput!) {
            createPointsOrderExchange(input: $input) { ${POINTS_ORDER_FIELDS} }
        }`,
        { input },
    );
}

/** 混合价积分订单拉起微信支付（pay 结构与充值接口 createWechatRechargePayment 一致） */
export async function createPointsOrderPayment(pointsOrderId: string, tradeType?: string, openid?: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreatePointsOrderPayment($pointsOrderId: ID!, $tradeType: String, $openid: String) {
            createPointsOrderPayment(pointsOrderId: $pointsOrderId, tradeType: $tradeType, openid: $openid) {
                pointsOrderId outTradeNo pay
            }
        }`,
        { pointsOrderId, tradeType, openid },
    );
}

/** 取消积分订单（仅待支付可取消） */
export async function cancelPointsOrder(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CancelPointsOrder($id: ID!) { cancelPointsOrder(id: $id) { id status } }`,
        { id },
    );
}
