import { getGraphQLClient } from '../client';

/**
 * 查询已审批上架的聚合商品（public，default token 可查）。
 * 返回 { marketplaceProducts: Array<{ id, name, slug, merchantChannel: { id, code, name } }> }
 *
 * ⚠️ C 端不返回 barcode/internalCode（内部编码仅用于后台审批/商家管理）。
 * ⚠️ 线上 shop-api 的 marketplaceProducts 目前不接受 take/skip 参数，
 *    真正的服务端分页需 vendure 侧配合；此处仅在客户端分批渲染。
 */
export async function getMarketplaceProducts() {
    const client = getGraphQLClient();
    const query = `
        query MarketplaceProducts {
            marketplaceProducts {
                id
                name
                slug
                merchantChannel { id code name }
            }
        }
    `;
    return client.request(query);
}

/**
 * 查询当前顾客所有 marketplace 商家子单（待逐单支付清单）。
 * 返回 { myMarketplaceSellerOrders: Array<{ id, code, state, totalWithTax, sellerChannelName, lines: [{ id, productName, quantity, unitPriceWithTax, linePriceWithTax }] }> }
 */
export async function getMyMarketplaceSellerOrders(): Promise<any> {
    const client = getGraphQLClient();
    const query = `
        query MyMarketplaceSellerOrders {
            myMarketplaceSellerOrders {
                id
                code
                state
                totalWithTax
                sellerChannelName
                lines {
                    id
                    productName
                    quantity
                    unitPriceWithTax
                    linePriceWithTax
                }
            }
        }
    `;
    return client.request(query);
}

/**
 * 对指定的 marketplace 商家子单逐单支付。
 * @param orderId 商家子单 id
 * @param method 该商家自己的支付方式（如 wechatpay / balance-pay）
 * @param metadata 支付所需元数据（如微信 openid）
 * 返回 { payMarketplaceSellerOrder: Order 或 ErrorResult }
 */
export async function payMarketplaceSellerOrder(orderId: string, method: string, metadata?: Record<string, any>): Promise<any> {
    const client = getGraphQLClient();
    const query = `
        mutation PaySeller($orderId: ID!, $method: String!, $metadata: JSON) {
            payMarketplaceSellerOrder(orderId: $orderId, method: $method, metadata: $metadata) {
                ... on Order {
                    id code state
                    payments { id method amount state metadata }
                }
                ... on ErrorResult { errorCode message }
            }
        }
    `;
    return client.request(query, { orderId, method, metadata: metadata || {} });
}