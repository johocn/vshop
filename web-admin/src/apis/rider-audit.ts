// 骑手注册审核域 admin-api 调用（schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准）
//   - Query riderApplications(status, skip, take): RiderApplicationList { items: [Customer!]!, total: Int! }（F8 分页）
//   - Mutation campusSetRiderStatus(customerId, status): CampusSetRiderStatusResult { status }
//   - Mutation campusUpdateRiderCompliance(customerId, input): RiderComplianceResult（P2-5 健康证/保险/背调）
//   - status：pending（审核中）/ approved（已通过）/ suspended（已暂停）/ none（未申请/已清退）
import { getAdminClient } from './client';

export interface RiderApplicationRow {
  id: string;
  emailAddress: string;
  firstName?: string | null;
  lastName?: string | null;
  customFields: {
    riderStatus?: string | null;
    riderRealName?: string | null;
    riderStudentNo?: string | null;
    riderCampus?: string | null;
    riderIdImg?: string | null;
    riderCredit?: number | null;
    riderOnlineAt?: string | null;
    // P2-5 合规资料
    riderHealthCertNo?: string | null;
    riderHealthCertImg?: string | null;
    riderHealthCertExpiry?: string | null;
    riderInsuranceNo?: string | null;
    riderInsuranceExpiry?: string | null;
    riderBackgroundCheck?: string | null;
    riderBackgroundCheckAt?: string | null;
  };
}

/** 合规判定项（与后端 rider-compliance.ts 同口径） */
export interface RiderComplianceItem {
  key: 'healthCert' | 'insurance' | 'backgroundCheck' | string;
  label: string;
  status: 'ok' | 'expiring' | 'expired' | 'pending' | 'missing' | 'failed' | string;
  expiry?: string | null;
  detail?: string | null;
}

export interface RiderComplianceResult {
  customerId: string;
  ok: boolean;
  blocked: boolean;
  pending: boolean;
  items: RiderComplianceItem[];
}

export interface RiderComplianceInput {
  healthCertNo?: string | null;
  healthCertImg?: string | null;
  healthCertExpiry?: string | null;
  insuranceNo?: string | null;
  insuranceExpiry?: string | null;
  backgroundCheck?: string | null;
}

const APPLICATION_FIELDS = `
  id emailAddress firstName lastName
  customFields {
    riderStatus riderRealName riderStudentNo riderCampus riderIdImg riderCredit riderOnlineAt
    riderHealthCertNo riderHealthCertImg riderHealthCertExpiry
    riderInsuranceNo riderInsuranceExpiry riderBackgroundCheck riderBackgroundCheckAt
  }
`;

/** 按状态分页查询骑手申请/名单 */
export async function fetchRiderApplications(
  status: string,
  skip = 0,
  take = 50,
): Promise<{ items: RiderApplicationRow[]; total: number }> {
  const { riderApplications } = await getAdminClient().request<{
    riderApplications: { items: RiderApplicationRow[]; total: number };
  }>(
    `query RiderApplications($status: String!, $skip: Int, $take: Int) {
      riderApplications(status: $status, skip: $skip, take: $take) {
        items { ${APPLICATION_FIELDS} }
        total
      }
    }`,
    { status, skip, take },
  );
  return { items: riderApplications?.items ?? [], total: riderApplications?.total ?? 0 };
}

/** 审核操作：approved 通过 / suspended 暂停 / none 拒绝（清退） */
export async function campusSetRiderStatus(customerId: string, status: 'approved' | 'suspended' | 'none'): Promise<string> {
  const { campusSetRiderStatus } = await getAdminClient().request<{ campusSetRiderStatus: { status: string } }>(
    `mutation CampusSetRiderStatus($customerId: ID!, $status: String!) {
      campusSetRiderStatus(customerId: $customerId, status: $status) { status }
    }`,
    { customerId, status },
  );
  return campusSetRiderStatus.status;
}

const COMPLIANCE_FIELDS = `
  customerId ok blocked pending
  items { key label status expiry detail }
`;

/** P2-5 合规登记：健康证 / 保险 / 背调（仅传需要更新的字段），返回最新合规判定 */
export async function campusUpdateRiderCompliance(
  customerId: string,
  input: RiderComplianceInput,
): Promise<RiderComplianceResult> {
  const { campusUpdateRiderCompliance } = await getAdminClient().request<{ campusUpdateRiderCompliance: RiderComplianceResult }>(
    `mutation CampusUpdateRiderCompliance($customerId: ID!, $input: RiderComplianceInput!) {
      campusUpdateRiderCompliance(customerId: $customerId, input: $input) { ${COMPLIANCE_FIELDS} }
    }`,
    { customerId, input },
  );
  return campusUpdateRiderCompliance;
}
