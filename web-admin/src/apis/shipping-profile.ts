// 配送档案（ShippingProfile）admin-api 调用
// schema 已通过本地 admin-api 实测校准（cjk-plugin shipping-profile-admin.resolver）：
//   - shippingProfiles(options) 返回 ShippingProfileList { items { id name code description isGlobal
//     freeShippingThreshold shippingMethods pickupLocations } totalItems }（OBJECT 不暴露 createdAt/updatedAt/ownerChannelId）
//   - PickupLocation 类型无 code 字段，仅查询 id
//   - createShippingProfile(输入 CreateShippingProfileInput!)，shippingMethodIds 必填且非空
//   - deleteShippingProfile(id) 返回 Boolean!（实测为 true）
import { getAdminClient } from './client';

export interface ShippingProfileItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isGlobal: boolean;
  freeShippingThreshold: number | null;
  shippingMethodIds: string[];
  pickupLocationIds: string[];
}

export interface ShippingProfileInput {
  name: string;
  code: string;
  description?: string;
  isGlobal?: boolean;
  freeShippingThreshold?: number;
  /** create 必填，至少一个配送方式 */
  shippingMethodIds: string[];
  /** undefined=不变（create 时省略），[]=清空，[ids]=设置 */
  pickupLocationIds?: string[];
}

export async function fetchShippingProfiles(): Promise<ShippingProfileItem[]> {
  const { shippingProfiles } = await getAdminClient().request<{
    shippingProfiles: { items: ShippingProfileItem[]; totalItems: number };
  }>(`query ShippingProfiles {
    shippingProfiles {
      items {
        id name code description isGlobal freeShippingThreshold
        shippingMethods { id code }
        pickupLocations { id }
      }
      totalItems
    }
  }`);
  return shippingProfiles.items;
}

export async function createShippingProfile(input: ShippingProfileInput): Promise<string> {
  const { createShippingProfile } = await getAdminClient().request<{
    createShippingProfile: { id: string };
  }>(`mutation CreateShippingProfile($input: CreateShippingProfileInput!) {
    createShippingProfile(input: $input) { id }
  }`, { input });
  return createShippingProfile.id;
}

export async function updateShippingProfile(
  id: string,
  input: Partial<ShippingProfileInput>,
): Promise<void> {
  const { shippingMethodIds, pickupLocationIds, ...rest } = input;
  await getAdminClient().request<{
    updateShippingProfile: { id: string };
  }>(`mutation UpdateShippingProfile($input: UpdateShippingProfileInput!) {
    updateShippingProfile(input: $input) { id }
  }`, {
    input: { id, ...rest, ...(shippingMethodIds !== undefined ? { shippingMethodIds } : {}),
      ...(pickupLocationIds !== undefined ? { pickupLocationIds } : {}) },
  } as { input: { id: string } & Record<string, unknown> });
}

export async function deleteShippingProfile(id: string): Promise<void> {
  await getAdminClient().request<{ deleteShippingProfile: boolean }>(
    `mutation DeleteShippingProfile($id: ID!) { deleteShippingProfile(id: $id) }`,
    { id },
  );
}

export interface ShippingMethodRef { id: string; code: string; }
export async function fetchShippingMethods(): Promise<ShippingMethodRef[]> {
  const { shippingMethods } = await getAdminClient().request<{ shippingMethods: { items: ShippingMethodRef[] } }>(
    `query { shippingMethods { items { id code } } }`,
  );
  return shippingMethods.items;
}