import { getGraphQLClient } from '../client';

/**
 * 查询已审批上架的聚合商品（public，default token 可查）。
 * 返回 { marketplaceProducts: Array<{ id, name, slug, barcode, internalCode, merchantChannel: { id, code, name } }> }
 */
export async function getMarketplaceProducts() {
    const client = getGraphQLClient();
    const query = `
        query MarketplaceProducts {
            marketplaceProducts {
                id
                name
                slug
                barcode
                internalCode
                merchantChannel { id code name }
            }
        }
    `;
    return client.request(query);
}