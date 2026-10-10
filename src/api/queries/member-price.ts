import { getGraphQLClient } from '../client';

// 会员价展示查询（vcash-pos-plugin shop-api，仅展示、不参与下单计价）。
// SDL 校准要点（以 vendure packages/vcash-pos-plugin/src/plugin.ts shopSchema 为准）：
//   - myMemberPrice(productIds: [ID!]!): [ProductMemberPrice!]!
//   - ProductMemberPrice { productId applied discountPercent }，未命中时 discountPercent 为 null
//   - 未登录返回空数组；discountPercent 语义：95 = 95 折（支付原价的 95%）

export interface ProductMemberPrice {
    productId: string;
    applied: boolean;
    discountPercent: number | null;
}

/** 当前登录会员在指定商品上的会员价标签（未登录返回 []） */
export async function getMyMemberPrice(productIds: string[]): Promise<ProductMemberPrice[]> {
    if (!productIds.length) return [];
    const client = getGraphQLClient();
    const res: any = await client.request(
        `query MyMemberPrice($productIds: [ID!]!) {
            myMemberPrice(productIds: $productIds) { productId applied discountPercent }
        }`,
        { productIds },
    );
    return res?.myMemberPrice ?? [];
}
