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
  /** 计费方式 calculator code，如 自提/同城=pickup-point/employee-pickup/local-delivery，门店自提=store-pickup，快递=tiered-* */
  calcCode: string;
  /** 固定运费（分），仅自提/同城计费类型有效 */
  shippingPrice: number;
}

function readArgs(args?: Array<{ name: string; value: string }> | null): Record<string, string> {
  return (args || []).reduce<Record<string, string>>((acc, a) => { acc[a.name] = a.value; return acc; }, {});
}

export async function fetchShippingMethods(): Promise<ShippingRow[]> {
  const { shippingMethods } = await getAdminClient().request<{
    shippingMethods: { items: Array<ShippingRow & { customFields: { enabled: boolean } | null; calculator: { code: string; args: Array<{ name: string; value: string }> } | null }> };
  }>(`query { shippingMethods { items { id code name description calculator { code args { name value } } customFields { enabled } } } }`);
  return shippingMethods.items.map((m) => {
    const calcCode = m.calculator?.code || '';
    const feeArgs = readArgs(m.calculator?.args);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      description: m.description,
      enabled: m.customFields?.enabled ?? true,
      calcCode,
      shippingPrice: Number(feeArgs.shippingPrice || 0),
    };
  });
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

// 更新配送方式实例的固定运费（分）。用于自提/同城计费类型的租户级运费配置。
export async function updateShippingMethodShippingPrice(id: string, shippingPrice: number): Promise<void> {
  await getAdminClient().request(`mutation Fee($id: ID!, $shippingPrice: Int!) {
    updateShippingMethodShippingPrice(id: $id, shippingPrice: $shippingPrice) { id }
  }`, { id, shippingPrice });
}
