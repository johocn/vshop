import { getGraphQLClient } from '../client';

export async function getActiveFlashSaleActivities() {
    const client = getGraphQLClient();
    return client.request(`query { activeFlashSaleActivities { id name startAt endAt flashPrice totalStock soldCount limitPerUser productId variantId status } }`);
}

export async function getActiveGroupBuyActivities() {
    const client = getGraphQLClient();
    return client.request(`query { activeGroupBuyActivities { id name description targetCount currentCount maxCount groupPrice leaderDiscount leaderRewardType status startAt endAt } }`);
}