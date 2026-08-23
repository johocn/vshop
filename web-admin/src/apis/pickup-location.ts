// 自提点 admin-api 调用（cjk-plugin pickup-location）
import { getAdminClient } from './client';

export type PickupLocationType = 'store' | 'point' | 'employee';

export interface PickupLocationCoordinates {
  lat: number;
  lng: number;
}

export interface PickupLocationItem {
  id: string;
  name: string;
  type: PickupLocationType;
  address: string | null;
  contactPerson?: string | null;
  phoneNumber?: string | null;
  businessHours?: string | null;
  coordinates?: PickupLocationCoordinates | null;
  photos?: string[] | null;
  remark?: string | null;
  sortOrder?: number;
  enabled?: boolean;
  isPublic?: boolean;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
}

export interface CreatePickupLocationInput {
  name: string;
  type: PickupLocationType;
  address: string;
  contactPerson?: string;
  phoneNumber?: string;
  businessHours?: string;
  coordinates?: PickupLocationCoordinates;
  photos?: string[];
  remark?: string;
  sortOrder?: number;
  enabled?: boolean;
  isPublic?: boolean;
  province?: string;
  city?: string;
  district?: string;
  street?: string;
}

export type UpdatePickupLocationInput = Partial<CreatePickupLocationInput> & { id: string };

const FIELDS = `id name type address contactPerson phoneNumber businessHours coordinates photos remark sortOrder enabled isPublic province city district street`;

export async function fetchPickupLocations(): Promise<PickupLocationItem[]> {
  const { pickupLocations } = await getAdminClient().request<{
    pickupLocations: { items: PickupLocationItem[]; totalItems: number };
  }>(`query PickupLocations {
    pickupLocations(options: { take: 100, skip: 0 }) {
      items { ${FIELDS} }
      totalItems
    }
  }`);
  return pickupLocations.items ?? [];
}

export async function fetchPickupLocation(id: string): Promise<PickupLocationItem | null> {
  const { pickupLocation } = await getAdminClient().request<{
    pickupLocation: PickupLocationItem | null;
  }>(`query PickupLocation($id: ID!) {
    pickupLocation(id: $id) { ${FIELDS} }
  }`, { id });
  return pickupLocation ?? null;
}

export async function createPickupLocation(input: CreatePickupLocationInput): Promise<string> {
  const { createPickupLocation } = await getAdminClient().request<{
    createPickupLocation: { id: string };
  }>(`mutation CreatePickupLocation($input: CreatePickupLocationInput!) {
    createPickupLocation(input: $input) { id }
  }`, { input });
  return createPickupLocation.id;
}

export async function updatePickupLocation(input: UpdatePickupLocationInput): Promise<string> {
  const { updatePickupLocation } = await getAdminClient().request<{
    updatePickupLocation: { id: string };
  }>(`mutation UpdatePickupLocation($input: UpdatePickupLocationInput!) {
    updatePickupLocation(input: $input) { id }
  }`, { input });
  return updatePickupLocation.id;
}

export async function deletePickupLocation(id: string): Promise<boolean> {
  const { deletePickupLocation } = await getAdminClient().request<{
    deletePickupLocation: boolean;
  }>(`mutation DeletePickupLocation($id: ID!) {
    deletePickupLocation(id: $id)
  }`, { id });
  return !!deletePickupLocation;
}