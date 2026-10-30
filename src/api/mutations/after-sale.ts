import { getGraphQLClient } from '../client';

export async function createAfterSalesRequest(input: any) {
    const client = getGraphQLClient();
    return client.request(`mutation CreateAfterSales($input: CreateAfterSalesRequestInput!) { createAfterSalesRequest(input: $input) { id orderId state reason refundAmount createdAt } }`, { input });
}

export async function cancelAfterSalesRequest(id: string) {
    const client = getGraphQLClient();
    return client.request(`mutation CancelAfterSales($id: ID!) { cancelAfterSalesRequest(id: $id) { id state } }`, { id });
}

export async function updateReturnTracking(id: string, trackingNo: string, carrier: string) {
    const client = getGraphQLClient();
    return client.request(`mutation UpdateTracking($id: ID!, $trackingNo: String!, $carrier: String!) { updateReturnTracking(id: $id, trackingNo: $trackingNo, carrier: $carrier) { id state returnTrackingNo returnCarrier } }`, { id, trackingNo, carrier });
}

/** 售后协商留言（§82）：顾客与商家双向可见，售后单关闭后禁言 */
export async function addAfterSalesMessage(id: string, content: string, images?: string[]) {
    const client = getGraphQLClient();
    return client.request(`mutation AddAfterSalesMessage($id: ID!, $content: String!, $images: [String!]) { addAfterSalesMessage(id: $id, content: $content, images: $images) { id senderType senderName content images createdAt } }`, { id, content, images: images?.length ? images : null });
}

/** 售后协商留言列表（§82）：createdAt 正序 */
export async function listAfterSalesMessages(id: string, take = 100) {
    const client = getGraphQLClient();
    return client.request(`query AfterSalesMessages($id: ID!, $options: AfterSalesMessageListOptions) { afterSalesMessages(id: $id, options: $options) { items { id senderType senderName content images createdAt } totalItems } }`, { id, options: { take } });
}
