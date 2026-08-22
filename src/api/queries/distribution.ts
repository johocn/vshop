import { getGraphQLClient } from '../client';

/**
 * 分销结算 API 封装（金额单位：分，前端显示时 yuan = cents / 100）。
 * 全部走 shop-api，后台操作由后端 @Allow(SuperAdmin,…) 门控。
 */

// ---------- C 端 ----------

/** 当前登录用户的经销商档案（未申请为 null）。返回 { myDistributorProfile } */
export async function getMyDistributorProfile() {
    const client = getGraphQLClient();
    const query = `
        query MyDistributorProfile {
            myDistributorProfile {
                id
                customerId
                level
                status
                totalEarnings
                availableBalance
                frozenBalance
                referralCode
            }
        }
    `;
    return client.request(query);
}

/** 当前用户的佣金明细。返回 { myCommissionRecords: { items, totalItems } } */
export async function getMyCommissionRecords(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query MyCommissionRecords($options: CommissionRecordListOptions) {
            myCommissionRecords(options: $options) {
                items {
                    id
                    distributorId
                    orderId
                    commissionType
                    commissionRate
                    orderAmount
                    commissionAmount
                    status
                    settledAt
                    createdAt
                }
                totalItems
            }
        }
    `;
    return client.request(query, { options });
}

/** 当前用户的提现记录。返回 { myWithdrawalRequests } */
export async function getMyWithdrawalRequests(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query MyWithdrawalRequests($options: WithdrawalRequestListOptions) {
            myWithdrawalRequests(options: $options) {
                items {
                    id
                    distributorId
                    amount
                    method
                    accountInfo
                    status
                    reviewedAt
                    paidAt
                    createdAt
                }
                totalItems
            }
        }
    `;
    return client.request(query, { options });
}

/** 申请成为经销商。referredByCode 为推荐码（无则 null）。返回 { applyDistributor } */
export async function applyDistributor(referredByCode?: string | null) {
    const client = getGraphQLClient();
    const mutation = `
        mutation ApplyDistributor($referredByCode: String) {
            applyDistributor(referredByCode: $referredByCode) {
                id
                status
            }
        }
    `;
    return client.request(mutation, { referredByCode: referredByCode ?? null });
}

/** 发起提现申请。amountYuan 单位元（内部转分）。返回 { requestWithdrawal } */
export async function requestWithdrawal(amountYuan: number, method: string, accountInfo: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation RequestWithdrawal($amount: Int!, $method: WithdrawalMethod!, $accountInfo: String!) {
            requestWithdrawal(amount: $amount, method: $method, accountInfo: $accountInfo) {
                id
                amount
                method
                status
            }
        }
    `;
    const amount = Math.round(amountYuan * 100);
    return client.request(mutation, { amount, method, accountInfo });
}

// ---------- 后台 ----------

/** 后台查询分销员列表（含 customerEmail）。返回 { distributors } */
export async function getAdminDistributors(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query AdminDistributors($options: DistributorListOptions) {
            distributors(options: $options) {
                items {
                    id
                    customerId
                    customerEmail
                    level
                    status
                    totalEarnings
                    availableBalance
                    frozenBalance
                    referralCode
                    createdAt
                }
                totalItems
            }
        }
    `;
    return client.request(query, { options });
}

/** 后台查询佣金记录。返回 { commissionRecords } */
export async function getAdminCommissionRecords(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query AdminCommissionRecords($options: CommissionRecordListOptions) {
            commissionRecords(options: $options) {
                items {
                    id
                    distributorId
                    orderId
                    commissionType
                    commissionRate
                    orderAmount
                    commissionAmount
                    status
                    settledAt
                    createdAt
                }
                totalItems
            }
        }
    `;
    return client.request(query, { options });
}

/** 后台查询提现申请。返回 { withdrawalRequests } */
export async function getAdminWithdrawalRequests(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query AdminWithdrawalRequests($options: WithdrawalRequestListOptions) {
            withdrawalRequests(options: $options) {
                items {
                    id
                    distributorId
                    amount
                    method
                    accountInfo
                    status
                    reviewedAt
                    paidAt
                    createdAt
                }
                totalItems
            }
        }
    `;
    return client.request(query, { options });
}

/** 后台审批分销员（pending → active）。返回 { approveDistributor } */
export async function approveDistributorAdmin(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation ApproveDistributor($id: ID!) {
            approveDistributor(id: $id) { id status }
        }
    `;
    return client.request(mutation, { id });
}

/** 后台冻结分销员（active → frozen）。返回 { freezeDistributor } */
export async function freezeDistributorAdmin(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation FreezeDistributor($id: ID!) {
            freezeDistributor(id: $id) { id status }
        }
    `;
    return client.request(mutation, { id });
}

/** 后台审批提现（pending → approved）。返回 { approveWithdrawal } */
export async function approveWithdrawalAdmin(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation ApproveWithdrawal($id: ID!) {
            approveWithdrawal(id: $id) { id status }
        }
    `;
    return client.request(mutation, { id });
}

/** 后台驳回提现（pending → rejected）。返回 { rejectWithdrawal } */
export async function rejectWithdrawalAdmin(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation RejectWithdrawal($id: ID!) {
            rejectWithdrawal(id: $id) { id status }
        }
    `;
    return client.request(mutation, { id });
}

/** 后台标记提现已打款（approved → paid）。返回 { markWithdrawalPaid } */
export async function markWithdrawalPaidAdmin(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation MarkWithdrawalPaid($id: ID!) {
            markWithdrawalPaid(id: $id) { id status }
        }
    `;
    return client.request(mutation, { id });
}

/** 后台触发立即结算（将到期 pending 佣金转 confirmed 并入可用余额）。返回 { settleCommissionsNow } */
export async function settleCommissionsNowAdmin() {
    const client = getGraphQLClient();
    const mutation = `
        mutation SettleCommissionsNow {
            settleCommissionsNow
        }
    `;
    return client.request(mutation);
}

/** 金额工具：分 → 元（保留两位） */
export function formatYuan(cents?: number | null): string {
    if (cents == null) return '0.00';
    return (cents / 100).toFixed(2);
}