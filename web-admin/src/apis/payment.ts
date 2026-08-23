// 支付域 admin-api 调用（Task 9，schema 已实测校准）
// 校准结果（本地 admin-api 实测）：
//   - paymentMethods { totalItems items { id code name description enabled } } —— 可用
//   - updatePaymentMethod(input: { id, enabled }) → { id code enabled } —— 可用（已实测 toggle）
import { getAdminClient } from './client';

export interface PaymentRow {
  id: string;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
}

export async function fetchPaymentMethods(): Promise<PaymentRow[]> {
  const { paymentMethods } = await getAdminClient().request<{
    paymentMethods: { items: PaymentRow[] };
  }>(`query { paymentMethods { items { id code name description enabled } } }`);
  return paymentMethods.items;
}

export async function setPaymentEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetPay($input: UpdatePaymentMethodInput!) {
      updatePaymentMethod(input: $input) { id enabled }
    }`,
    { input: { id, enabled } },
  );
}

export async function updatePaymentMethod(id: string, name: string, description: string): Promise<void> {
  await getAdminClient().request(`mutation Up($input: UpdatePaymentMethodInput!) {
    updatePaymentMethod(input: $input) { id }
  }`, { input: { id, translations: [{ languageCode: 'zh_Hans', name, description }] } });
}

export async function deletePaymentMethod(id: string): Promise<void> {
  await getAdminClient().request(`mutation Del($id: ID!) { deletePaymentMethod(id: $id) { result } }`, { id });
}
