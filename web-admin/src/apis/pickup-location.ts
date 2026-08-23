// 自提点 admin-api 调用（cjk-plugin pickup-location）
import { getAdminClient } from './client';

export type PickupLocationType = 'store' | 'point' | 'employee';

export interface PickupLocationItem {
  id: string;
  name: string;
  type: PickupLocationType;
  address: string | null;
  phoneNumber?: string | null;
  businessHours?: string | null;
}

export async function fetchPickupLocations(): Promise<PickupLocationItem[]> {
  const { pickupLocations } = await getAdminClient().request<{
    pickupLocations: { items: PickupLocationItem[]; totalItems: number };
  }>(`query PickupLocations {
    pickupLocations {
      items { id name type address phoneNumber businessHours }
      totalItems
    }
  }`);
  return pickupLocations.items ?? [];
}

export async function createPickupLocation(input: {
  name: string;
  type: PickupLocationType;
  address: string;
}): Promise<string> {
  const { createPickupLocation } = await getAdminClient().request<{
    createPickupLocation: { id: string };
  }>(`mutation CreatePickupLocation($input: CreatePickupLocationInput!) {
    createPickupLocation(input: $input) { id }
  }`, { input });
  return createPickupLocation.id;
}