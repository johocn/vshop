import { getGraphQLClient } from '../client';

export async function getActiveFlashSaleActivities() {
    const client = getGraphQLClient();
    return client.request(`query { activeFlashSaleActivities { id name startAt endAt flashPrice totalStock soldCount limitPerUser productId variantId status } }`);
}

export async function getActiveGroupBuyActivities() {
    const client = getGraphQLClient();
    return client.request(`query { activeGroupBuyActivities { id name description targetCount currentCount maxCount groupPrice leaderDiscount leaderRewardType status startAt endAt productId variantId } }`);
}

/** 我的开团（isLeader=true）/ 我的参团（isLeader=false）；未登录时后端返回空数组 */
export async function getMyGroupBuyOrders(isLeader: boolean) {
    const client = getGraphQLClient();
    return client.request(
        `query($isLeader: Boolean!) { myGroupBuyOrders(isLeader: $isLeader) { id orderId orderCode groupBuyActivityId isLeader status activity { id name targetCount currentCount maxCount groupPrice status startAt endAt productId variantId } } }`,
        { isLeader },
    );
}