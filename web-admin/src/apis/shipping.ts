// 配送域 admin-api 调用（Task 9，schema 已实测校准）
// 校准结果（本地 admin-api 实测）：
//   - shippingMethods { totalItems items { id code name description } } —— 可用
//     （ShippingMethod 含 name 字段，作为展示名；无 enabled 字段，配送方式仅档案展示）
import { getAdminClient } from './client';

export interface ShippingRow {
  id: string;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
}

export async function fetchShippingMethods(): Promise<ShippingRow[]> {
  const { shippingMethods } = await getAdminClient().request<{
    shippingMethods: { items: Array<ShippingRow & { customFields: { enabled: boolean } | null }> };
  }>(`query { shippingMethods { items { id code name description customFields { enabled } } } }`);
  return shippingMethods.items.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    enabled: m.customFields?.enabled ?? true,
  }));
}

// 配送方式启用/停用（customFields.enabled 启停开关）
export async function setShippingEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(`mutation S($i: UpdateShippingMethodInput!) {
    updateShippingMethod(input: $i) { id }
  }`, { i: { id, customFields: { enabled } } });
}

export async function updateShippingMethod(id: string, name: string, description: string): Promise<void> {
  await getAdminClient().request(`mutation Up($input: UpdateShippingMethodInput!) {
    updateShippingMethod(input: $input) { id }
  }`, { input: { id, translations: [{ languageCode: 'zh_Hans', name, description }] } });
}

export async function deleteShippingMethod(id: string): Promise<void> {
  await getAdminClient().request(`mutation Del($id: ID!) { deleteShippingMethod(id: $id) { result } }`, { id });
}
