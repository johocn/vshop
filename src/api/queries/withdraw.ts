import { getGraphQLClient } from '../client';

/** 我的余额（含冻结）：可提余额 = balance，冻结中 = frozenBalance（SDL: myBalanceWithFrozen） */
export async function getMyBalanceWithFrozen() {
    const client = getGraphQLClient();
    return client.request(`query MyBalanceWithFrozen {
        myBalanceWithFrozen { balance frozenBalance }
    }`);
}

/** 我的提现记录（分页；SDL: myBalanceWithdrawals(options: { skip, take })） */
export async function getMyBalanceWithdrawals(options: { take: number; skip: number }) {
    const client = getGraphQLClient();
    return client.request(
        `query MyBalanceWithdrawals($skip: Int, $take: Int) {
            myBalanceWithdrawals(options: { skip: $skip, take: $take }) {
                items { id amount method accountInfo status remark createdAt }
                totalItems
            }
        }`,
        { skip: options.skip, take: options.take },
    );
}

/** 申请提现（金额单位分；method: wechat/alipay/bank） */
export async function requestBalanceWithdrawal(amount: number, method: string, accountInfo: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation RequestBalanceWithdrawal($amount: Int!, $method: String!, $accountInfo: String!) {
            requestBalanceWithdrawal(amount: $amount, method: $method, accountInfo: $accountInfo) { id status }
        }`,
        { amount, method, accountInfo },
    );
}
