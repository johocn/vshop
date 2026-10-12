import { getGraphQLClient } from '../client';

/** shop-api DiyPlan 字段（以 diy-plugin 内联 SDL 为准，shop 侧无 app/userId/templateId） */
export const DIY_PLAN_FIELDS = `
            id
            status
            spec
            bom
            calcVersion
            quoteNo
            expiresAt
            orderLineId
            thumb
            isPublic
            publishedAt
            createdAt
            updatedAt
`;

/** 方案列表（myDiyPlans 返回） */
export async function getMyDiyPlans(params?: { status?: string; skip?: number; take?: number }) {
    const client = getGraphQLClient();
    const query = `
        query MyDiyPlans($status: String, $skip: Int, $take: Int) {
            myDiyPlans(status: $status, skip: $skip, take: $take) {
                items { ${DIY_PLAN_FIELDS} }
                total
            }
        }
    `;
    return client.request(query, {
        status: params?.status,
        skip: params?.skip,
        take: params?.take,
    });
}

/** 单个我的方案 */
export async function getMyDiyPlan(id: string) {
    const client = getGraphQLClient();
    const query = `
        query MyDiyPlan($id: ID!) {
            myDiyPlan(id: $id) { ${DIY_PLAN_FIELDS} }
        }
    `;
    return client.request(query, { id });
}

/** 素材分类（无参数） */
export async function getDiyCategories() {
    const client = getGraphQLClient();
    const query = `
        query DiyCategories {
            diyCategories {
                id
                app
                code
                name
                image
                sortOrder
                enabled
            }
        }
    `;
    return client.request(query);
}

/**
 * 素材列表。SDL：diyMaterials(filter: JSON): DiyMaterialList!
 * filter 为 JSON 标量（非 ListOptions），具体键由服务端 DiyShopService 约定。
 */
export async function getDiyMaterials(filter?: Record<string, any>) {
    const client = getGraphQLClient();
    const query = `
        query DiyMaterials($filter: JSON) {
            diyMaterials(filter: $filter) {
                items {
                    id
                    code
                    name
                    categoryId
                    shape
                    diameter
                    axialLength
                    holeSize
                    attrs
                    render
                    price
                    priceUnit
                    currency
                    stock
                    images
                    renderUrl
                    renderPreset
                }
                total
            }
        }
    `;
    return client.request(query, { filter });
}

/** 作品广场分页列表 */
export async function getDiyGalleryPlans(skip = 0, take = 12) {
    const client = getGraphQLClient();
    const query = `
        query DiyGalleryPlans($skip: Int, $take: Int) {
            diyGalleryPlans(skip: $skip, take: $take) {
                items {
                    id
                    title
                    coverMaterialIds
                    totalAmount
                    totalCount
                    authorName
                    createdAt
                }
                total
            }
        }
    `;
    return client.request(query, { skip, take });
}

/** 广场公开方案详情（未登录可读，用于"用这个方案"） */
export async function getDiyPublicPlan(id: string) {
    const client = getGraphQLClient();
    const query = `
        query DiyPublicPlan($id: ID!) {
            diyPublicPlan(id: $id) {
                id
                title
                spec
                totalAmount
                totalCount
                createdAt
            }
        }
    `;
    return client.request(query, { id });
}
