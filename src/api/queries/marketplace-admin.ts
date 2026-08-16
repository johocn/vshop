import { getGraphQLClient } from '../client';

/**
 * 商家提交商品上架 marketplace（置审批中）。
 * 返回 { submitForMarketplace: boolean }
 */
export async function submitForMarketplace(productId: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation SubmitForMarketplace($productId: ID!) {
            submitForMarketplace(productId: $productId)
        }
    `;
    return client.request(mutation, { productId });
}

/**
 * 商家查询自己名下商品的审批状态。
 * 返回 { myMerchantProducts: Array<{ id, name, slug, barcode, internalCode, marketplaceStatus, rejectReason, listedInMarketplace }> }
 */
export async function getMyMerchantProducts() {
    const client = getGraphQLClient();
    const query = `
        query MyMerchantProducts {
            myMerchantProducts {
                id
                name
                slug
                barcode
                internalCode
                marketplaceStatus
                rejectReason
                listedInMarketplace
            }
        }
    `;
    return client.request(query);
}

/**
 * 平台运营查询待审批上架商品列表。
 * 返回 { marketplacePendingProducts: Array<{ id, name, slug, barcode, internalCode, marketplaceStatus, rejectReason, listedInMarketplace }> }
 */
export async function getMarketplacePendingProducts() {
    const client = getGraphQLClient();
    const query = `
        query MarketplacePendingProducts {
            marketplacePendingProducts {
                id
                name
                slug
                barcode
                internalCode
                marketplaceStatus
                rejectReason
                listedInMarketplace
            }
        }
    `;
    return client.request(query);
}

/**
 * 平台运营审批通过。
 * 返回 { marketplaceApprove: boolean }
 */
export async function approveMarketplaceProduct(productId: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation MarketplaceApprove($productId: ID!) {
            marketplaceApprove(productId: $productId)
        }
    `;
    return client.request(mutation, { productId });
}

/**
 * 平台运营驳回，需填写原因。
 * 返回 { marketplaceReject: boolean }
 */
export async function rejectMarketplaceProduct(productId: string, reason: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation MarketplaceReject($productId: ID!, $reason: String!) {
            marketplaceReject(productId: $productId, reason: $reason)
        }
    `;
    return client.request(mutation, { productId, reason });
}