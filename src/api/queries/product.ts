import { getGraphQLClient } from '../client';
import { PRODUCT_CARD_FRAGMENT, PRODUCT_DETAIL_FRAGMENT } from '../fragments';

export async function searchProducts(input: {
    term?: string; facetValueIds?: string[]; collectionSlug?: string;
    take?: number; skip?: number; sort?: string; groupByProduct?: boolean;
}) {
    const client = getGraphQLClient();
    const query = `
        ${PRODUCT_CARD_FRAGMENT}
        query SearchProducts($input: SearchInput!) {
            search(input: $input) {
                items { ...ProductCard }
                totalItems
                facetValues { facetValue { id name } count }
            }
        }
    `;
    return client.request(query, { input: { groupByProduct: true, take: 20, ...input } });
}

export async function getProduct(slug: string) {
    const client = getGraphQLClient();
    const query = `
        ${PRODUCT_DETAIL_FRAGMENT}
        query GetProduct($slug: String!) {
            product(slug: $slug) { ...ProductDetail }
        }
    `;
    return client.request(query, { slug });
}

export async function getCollections(options?: { take?: number }) {
    const client = getGraphQLClient();
    const query = `
        query GetCollections($options: CollectionListOptions) {
            collections(options: $options) {
                items { id name slug parent { name } featuredAsset { preview } }
                totalItems
            }
        }
    `;
    return client.request(query, { options: { take: 50, ...options } });
}