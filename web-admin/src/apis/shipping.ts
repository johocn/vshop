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
}

export async function fetchShippingMethods(): Promise<ShippingRow[]> {
  const { shippingMethods } = await getAdminClient().request<{
    shippingMethods: { items: ShippingRow[] };
  }>(`query { shippingMethods { items { id code name description } } }`);
  return shippingMethods.items;
}
