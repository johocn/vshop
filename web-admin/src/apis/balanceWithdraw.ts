// 余额提现审核域 admin-api 调用（schema 以 vendure/packages/recharge-card-plugin/src/plugin.ts adminApiExtensions 为准）
//   - Query balanceWithdrawals(options: BalanceWithdrawalListOptions): BalanceWithdrawalList（PaginatedList，含 totalItems）
//   - BalanceWithdrawalListOptions = { skip, take, status: String }（status 直挂标量，非 filter）
//   - Mutation approveBalanceWithdrawal(id, remark) / rejectBalanceWithdrawal(id, remark) / markBalanceWithdrawalPaid(id)
//   - status：pending（待审核）/ approved（已通过）/ paid（已打款）/ rejected（已驳回）
//   - 金额字段 amount 单位为分
import { getAdminClient, graphQlErrorMsg } from './client';

export interface BalanceWithdrawRow {
  id: string;
  customerId: string;
  amount: number;
  method: string;
  accountInfo: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | string;
  remark?: string | null;
  reviewedAt?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
}

const WITHDRAW_FIELDS = `
  id customerId amount method accountInfo status
  remark reviewedAt paidAt createdAt
`;

export async function fetchBalanceWithdrawPage(p: {
  skip: number;
  take: number;
  status?: string;
}): Promise<{ items: BalanceWithdrawRow[]; total: number }> {
  try {
    const { balanceWithdrawals } = await getAdminClient().request<{
      balanceWithdrawals: { items: BalanceWithdrawRow[]; totalItems: number };
    }>(
      `query BalanceWithdrawals($options: BalanceWithdrawalListOptions) {
        balanceWithdrawals(options: $options) { items { ${WITHDRAW_FIELDS} } totalItems }
      }`,
      { options: { skip: p.skip, take: p.take, status: p.status || undefined } },
    );
    return { items: balanceWithdrawals?.items ?? [], total: balanceWithdrawals?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载提现申请失败'));
  }
}

/** 通过（pending → approved，冻结金额待打款） */
export async function approveBalanceWithdrawal(id: string, remark?: string): Promise<BalanceWithdrawRow> {
  try {
    const { approveBalanceWithdrawal } = await getAdminClient().request<{ approveBalanceWithdrawal: BalanceWithdrawRow }>(
      `mutation ApproveBalanceWithdrawal($id: ID!, $remark: String) {
        approveBalanceWithdrawal(id: $id, remark: $remark) { ${WITHDRAW_FIELDS} }
      }`,
      { id, remark: remark || null },
    );
    return approveBalanceWithdrawal;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '操作失败'));
  }
}

/** 驳回（pending/approved → rejected，解冻退回客户余额） */
export async function rejectBalanceWithdrawal(id: string, remark?: string): Promise<BalanceWithdrawRow> {
  try {
    const { rejectBalanceWithdrawal } = await getAdminClient().request<{ rejectBalanceWithdrawal: BalanceWithdrawRow }>(
      `mutation RejectBalanceWithdrawal($id: ID!, $remark: String) {
        rejectBalanceWithdrawal(id: $id, remark: $remark) { ${WITHDRAW_FIELDS} }
      }`,
      { id, remark: remark || null },
    );
    return rejectBalanceWithdrawal;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '操作失败'));
  }
}

/** 标记已打款（approved → paid，冻结出账） */
export async function markBalanceWithdrawalPaid(id: string): Promise<BalanceWithdrawRow> {
  try {
    const { markBalanceWithdrawalPaid } = await getAdminClient().request<{ markBalanceWithdrawalPaid: BalanceWithdrawRow }>(
      `mutation MarkBalanceWithdrawalPaid($id: ID!) {
        markBalanceWithdrawalPaid(id: $id) { ${WITHDRAW_FIELDS} }
      }`,
      { id },
    );
    return markBalanceWithdrawalPaid;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '操作失败'));
  }
}
