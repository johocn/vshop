import { getGraphQLClient } from '../client';

export async function redeemRechargeCard(code: string, pin?: string) {
    const client = getGraphQLClient();
    return client.request(`mutation RedeemCard($code: String!, $pin: String) { redeemRechargeCard(code: $code, pin: $pin) { success faceValue newBalance cardCode } }`, { code, pin });
}

export async function getMyBalance() {
    const client = getGraphQLClient();
    return client.request(`query { myRechargeBalance }`);
}

export async function getMyRechargeHistory() {
    const client = getGraphQLClient();
    return client.request(`query { myRechargeHistory { id code faceValue state redeemedAt createdAt } }`);
}