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