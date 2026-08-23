// 支付档案（PaymentProfile）admin-api 调用
// schema 已通过本地 admin-api 实测校准（cjk-plugin payment-profile-admin.resolver）：
//   - paymentProfiles(options) 返回 PaymentProfileList { items { id name code description isGlobal
//     installmentOptions paymentMethods } totalItems }（OBJECT 不暴露 createdAt/updatedAt/ownerChannelId）
//   - createPaymentProfile(输入 CreatePaymentProfileInput!)，paymentMethodIds 必填且非空
//   - deletePaymentProfile(id) 返回 Boolean!（实测为 true）
import { getAdminClient } from './client';

export interface PaymentProfileItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isGlobal: boolean;
  installmentOptions?: Record<string, unknown> | null;
  isTenantDefault: boolean;
  paymentMethodIds: string[];
  methodConfigs?: { paymentMethodId: string; mode: string; options?: Record<string, unknown> | null }[];
}

export interface PaymentProfileInput {
  name: string;
  code: string;
  description?: string;
  isGlobal?: boolean;
  installmentOptions?: Record<string, unknown>;
  isTenantDefault?: boolean;
  /** create 必填，至少一个支付方式 */
  paymentMethodIds: string[];
  methodConfigs?: { paymentMethodId: string; mode: string; options?: Record<string, unknown> | null }[];
}

export async function fetchPaymentProfiles(): Promise<PaymentProfileItem[]> {
  const { paymentProfiles } = await getAdminClient().request<{
    paymentProfiles: { items: PaymentProfileItem[]; totalItems: number };
  }>(`query PaymentProfiles {
    paymentProfiles {
      items {
        id name code description isGlobal installmentOptions isTenantDefault
        paymentMethods { id code }
        methodConfigs { paymentMethodId mode options }
      }
      totalItems
    }
  }`);
  return paymentProfiles.items;
}

export async function createPaymentProfile(input: PaymentProfileInput): Promise<string> {
  const { createPaymentProfile } = await getAdminClient().request<{
    createPaymentProfile: { id: string };
  }>(`mutation CreatePaymentProfile($input: CreatePaymentProfileInput!) {
    createPaymentProfile(input: $input) { id }
  }`, { input });
  return createPaymentProfile.id;
}

export async function updatePaymentProfile(
  id: string,
  input: Partial<PaymentProfileInput>,
): Promise<void> {
  const { paymentMethodIds, methodConfigs, ...rest } = input;
  await getAdminClient().request<{
    updatePaymentProfile: { id: string };
  }>(`mutation UpdatePaymentProfile($input: UpdatePaymentProfileInput!) {
    updatePaymentProfile(input: $input) { id }
  }`, {
    input: { id, ...rest, ...(paymentMethodIds !== undefined ? { paymentMethodIds } : {}),
      ...(methodConfigs !== undefined ? { methodConfigs } : {}) },
  } as { input: { id: string } & Record<string, unknown> });
}

/** 设为租户默认档案；全局档案后端会拒绝 */
export async function setTenantDefaultPaymentProfile(id: string): Promise<void> {
  await getAdminClient().request<{ setTenantDefaultPaymentProfile: boolean }>(
    `mutation SetTenantDefault($id: ID!) { setTenantDefaultPaymentProfile(id: $id) }`, { id },
  );
}

export async function deletePaymentProfile(id: string): Promise<void> {
  await getAdminClient().request<{ deletePaymentProfile: boolean }>(
    `mutation DeletePaymentProfile($id: ID!) { deletePaymentProfile(id: $id) }`,
    { id },
  );
}

export interface PaymentMethodRef { id: string; code: string; }
export async function fetchPaymentMethods(): Promise<PaymentMethodRef[]> {
  const { paymentMethods } = await getAdminClient().request<{ paymentMethods: { items: PaymentMethodRef[] } }>(
    `query { paymentMethods { items { id code } } }`,
  );
  return paymentMethods.items;
}