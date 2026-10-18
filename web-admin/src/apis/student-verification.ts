import { getAdminClient } from './client';

/** 学生认证审核项（人工审核流，coupon-plugin studentVerifications） */
export interface StudentVerificationItem {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  status: 'none' | 'pending' | 'approved' | 'rejected';
  school: string | null;
  studentNo: string | null;
  idImg: string | null;
  reviewedAt: string | null;
}

const FIELDS = `customerId customerName customerEmail status school studentNo idImg reviewedAt`;

export async function fetchStudentVerifications(status?: string): Promise<StudentVerificationItem[]> {
  const res = await getAdminClient().request<{ studentVerifications: StudentVerificationItem[] }>(
    `query StudentVerifications($status: String) { studentVerifications(status: $status) { ${FIELDS} } }`,
    { status: status || null },
  );
  return res.studentVerifications;
}

export async function reviewStudentVerification(customerId: string, approve: boolean): Promise<StudentVerificationItem> {
  const res = await getAdminClient().request<{ reviewStudentVerification: StudentVerificationItem }>(
    `mutation ReviewStudent($customerId: ID!, $approve: Boolean!) { reviewStudentVerification(customerId: $customerId, approve: $approve) { ${FIELDS} } }`,
    { customerId, approve },
  );
  return res.reviewStudentVerification;
}
