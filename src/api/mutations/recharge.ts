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

/** 在线充值：建单 */
export async function createRechargeOrder(amount: number, remark?: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreateRechargeOrder($amount: Int!, $remark: String) { createRechargeOrder(amount: $amount, remark: $remark) { id amount status paymentMethod paidAt remark createdAt } }`,
        { amount, remark },
    );
}

/** 在线充值：发起微信支付，返回 pay 参数（JSAPI 需 openid） */
export async function createWechatRechargePayment(
    rechargeOrderId: string,
    tradeType?: string,
    openid?: string,
) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreateWechatRechargePayment($rechargeOrderId: ID!, $tradeType: String, $openid: String) { createWechatRechargePayment(rechargeOrderId: $rechargeOrderId, tradeType: $tradeType, openid: $openid) { rechargeOrderId outTradeNo pay { payType prepayId appId timeStamp nonceStr package signType paySign payUrl } } }`,
        { rechargeOrderId, tradeType, openid },
    );
}

/** 真实余额流水（分页） */
export async function getMyBalanceTransactions(options: { take: number; skip: number }) {
    const client = getGraphQLClient();
    return client.request(
        `query MyBalanceTransactions($skip: Int, $take: Int) { myBalanceTransactions(options: { skip: $skip, take: $take }) { items { id type amount balanceBefore balanceAfter orderId remark createdAt } totalItems } }`,
        { skip: options.skip, take: options.take },
    );
}