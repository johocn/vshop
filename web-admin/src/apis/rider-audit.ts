// 骑手注册审核域 admin-api 调用（schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准）
//   - Query riderApplications(status): [Customer!]!（Customer.customFields 含 rider* 字段，无分页参数）
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

/** 按状态查询骑手申请/名单（后端 getMany 全量返回，无分页） */
export async function fetchRiderApplications(status: string): Promise<RiderApplicationRow[]> {
  const { riderApplications } = await getAdminClient().request<{ riderApplications: RiderApplicationRow[] }>(
    `query RiderApplications($status: String!) {
      riderApplications(status: $status) { ${APPLICATION_FIELDS} }
    }`,
    { status },
  );
  return riderApplications ?? [];
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
