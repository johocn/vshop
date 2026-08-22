// 分销域 admin-api 调用（Task 11，schema 已实测校准）
// 校准结果（本地 admin-api 实测）：
//   - 分销 query 名是 distributors（distribution-plugin 提供），返回 DistributorList { totalItems items }
//   - 佣金结算 query 名是 commissionRecords（不是计划里的 settlements），返回 CommissionRecordList { totalItems items }
//   - Distributor 字段：id customerId parentId level status totalEarnings availableBalance frozenBalance referralCode createdAt
//   - CommissionRecord 字段：id distributorId orderId commissionType commissionRate orderAmount commissionAmount status settledAt createdAt
//   - 金额单位是分（与 Vendure 金额一致），页面 /100 显示
//   - commissionRate 是基点（1000 = 10%）；commissionType：direct/indirect
//   - DistributorStatus：active/frozen/pending；CommissionStatus：pending/confirmed/paid/cancelled
import { getAdminClient } from './client';

export interface DistributorRow {
  id: string;
  customerId: string;
  parentId?: string | null;
  level: number;
  status: string;
  totalEarnings: number;
  availableBalance: number;
  frozenBalance: number;
  referralCode: string;
  createdAt?: string | null;
}

export interface CommissionRow {
  id: string;
  distributorId: string;
  orderId: string;
  commissionType: string;
  commissionRate: number;
  orderAmount: number;
  commissionAmount: number;
  status: string;
  settledAt?: string | null;
  createdAt?: string | null;
}

export async function fetchDistributors(
  take = 20,
  skip = 0,
): Promise<{ totalItems: number; items: DistributorRow[] }> {
  const { distributors } = await getAdminClient().request<{
    distributors: { totalItems: number; items: DistributorRow[] };
  }>(
    `query Distributors($take: Int, $skip: Int) {
      distributors(options: { take: $take, skip: $skip }) {
        totalItems items {
          id customerId parentId level status totalEarnings availableBalance frozenBalance referralCode createdAt
        }
      }
    }`,
    { take, skip },
  );
  return distributors;
}

export async function fetchCommissions(
  take = 20,
  skip = 0,
): Promise<{ totalItems: number; items: CommissionRow[] }> {
  const { commissionRecords } = await getAdminClient().request<{
    commissionRecords: { totalItems: number; items: CommissionRow[] };
  }>(
    `query Commissions($take: Int, $skip: Int) {
      commissionRecords(options: { take: $take, skip: $skip }) {
        totalItems items {
          id distributorId orderId commissionType commissionRate orderAmount commissionAmount status settledAt createdAt
        }
      }
    }`,
    { take, skip },
  );
  return commissionRecords;
}
