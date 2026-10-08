// 骑手注册审核域 admin-api 调用（schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准）
//   - Query riderApplications(status, skip, take): RiderApplicationList { items: [Customer!]!, total: Int! }（F8 分页）
//   - Mutation campusSetRiderStatus(customerId, status): CampusSetRiderStatusResult { status }
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
  };
}

const APPLICATION_FIELDS = `
  id emailAddress firstName lastName
  customFields {
    riderStatus riderRealName riderStudentNo riderCampus riderIdImg riderCredit riderOnlineAt
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
