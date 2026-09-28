import { getGraphQLClient } from '../client';

export async function applyFlashSale(activityId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ApplyFlashSale($activityId: ID!) { applyFlashSale(activityId: $activityId) { id code totalWithTax } }`;
    return client.request(mutation, { activityId });
}
