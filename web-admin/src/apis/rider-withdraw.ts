// 骑手提现审核域 admin-api 调用（schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准）
//   - Query riderWithdrawals(status, skip, take): [RiderWithdrawalRequest!]!（普通数组，无 totalItems）
//   - Mutation approveRiderWithdraw(id, remark) / rejectRiderWithdraw(id, remark)
//   - status：PENDING（审核中）/ PAID（已打款）/ REJECTED（已驳回）
//   - 金额字段 amount 单位为分
import { getAdminClient } from './client';

export interface RiderWithdrawRow {
  id: string;
  customerId: string;
  channelId: string;
  amount: number;
  channel: string;
  account: string;
  status: 'PENDING' | 'PAID' | 'REJECTED' | string;
  remark?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string | null;
}

const WITHDRAW_FIELDS = `
  id customerId channelId amount channel account status
  remark reviewedBy reviewedAt createdAt
`;

/**
 * 提现申请分页：后端返回数组无 total，取 take+1 条探测下一页。
 * 有第 take+1 条 → total = skip + take + 1（hasMore=true）；否则 total = skip + 实际条数。
 */
export async function fetchWithdrawPage(p: {
  skip: number;
  take: number;
  status?: string;
}): Promise<{ items: RiderWithdrawRow[]; total: number }> {
  const { riderWithdrawals } = await getAdminClient().request<{ riderWithdrawals: RiderWithdrawRow[] }>(
    `query RiderWithdrawals($status: String, $skip: Int, $take: Int) {
      riderWithdrawals(status: $status, skip: $skip, take: $take) { ${WITHDRAW_FIELDS} }
    }`,
    { status: p.status || null, skip: p.skip, take: p.take + 1 },
  );
  const rows = riderWithdrawals ?? [];
  const probe = rows.length > p.take;
  return {
    items: rows.slice(0, p.take),
    total: probe ? p.skip + p.take + 1 : p.skip + rows.length,
  };
}

/** 通过（标记 PAID 留痕；金额已在申请时冻结扣减） */
export async function approveRiderWithdraw(id: string, remark?: string): Promise<RiderWithdrawRow> {
  const { approveRiderWithdraw } = await getAdminClient().request<{ approveRiderWithdraw: RiderWithdrawRow }>(
    `mutation ApproveRiderWithdraw($id: ID!, $remark: String) {
      approveRiderWithdraw(id: $id, remark: $remark) { ${WITHDRAW_FIELDS} }
    }`,
    { id, remark: remark || null },
  );
  return approveRiderWithdraw;
}

/** 驳回（状态 REJECTED 并自动退回冻结金额） */
export async function rejectRiderWithdraw(id: string, remark?: string): Promise<RiderWithdrawRow> {
  const { rejectRiderWithdraw } = await getAdminClient().request<{ rejectRiderWithdraw: RiderWithdrawRow }>(
    `mutation RejectRiderWithdraw($id: ID!, $remark: String) {
      rejectRiderWithdraw(id: $id, remark: $remark) { ${WITHDRAW_FIELDS} }
    }`,
    { id, remark: remark || null },
  );
  return rejectRiderWithdraw;
}
