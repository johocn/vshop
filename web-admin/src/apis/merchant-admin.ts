// 商户（Merchant）/ 门店（MerchantStore）后台 API（merchant-plugin admin schema）
import { getAdminClient } from './client';

export interface MerchantItem {
  id: string;
  code: string;
  name: string;
  shortName?: string | null;
  logo?: string | null;
  brand?: string | null;
  intro?: string | null;
  tags?: string[] | null;
  legalName?: string | null;
  licenseNo?: string | null;
  licenseImage?: string | null;
  licenseExpiry?: string | null;
  merchantType: string;
  industry?: string | null;
  category?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  servicePhone?: string | null;
  complaintPhone?: string | null;
  email?: string | null;
  wechat?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  address?: string | null;
  ownerChannelId?: string | null;
  claimStatus: string;
  contractNo?: string | null;
  cooperationStart?: string | null;
  cooperationEnd?: string | null;
  commissionRate?: number | null;
  source: string;
  settlementType?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  taxNo?: string | null;
  invoiceTitle?: string | null;
  status: string;
  statusReason?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantStoreItem {
  id: string;
  merchantId: string;
  code: string;
  name: string;
  storeType: string;
  sortOrder: number;
  weight: number;
  province?: string | null;
  city?: string | null;
  cityCode?: string | null;
  district?: string | null;
  street?: string | null;
  addressLine?: string | null;
  detail?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  navigationAddress?: string | null;
  phoneNumber?: string | null;
  backupPhone?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  servicePhone?: string | null;
  businessHours?: string | null;
  businessHoursText?: string | null;
  status: string;
  statusNote?: string | null;
  acceptingOrders: boolean;
  coverImage?: string | null;
  photos?: string[] | null;
  notice?: string | null;
  tags?: string[] | null;
  facilities?: string[] | null;
  externalIds?: string | null;
  supportsRedemption: boolean;
  redemptionHours?: string | null;
  dailyRedeemLimit?: number | null;
  requiresReservation: boolean;
  reservationPhone?: string | null;
  supportsDelivery: boolean;
  deliveryRadiusKm?: number | null;
  deliveryFee?: number | null;
  minOrderAmount?: number | null;
  deliveryMinutes?: number | null;
  isPublic: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantStoreClaimItem {
  id: string;
  storeId: string;
  channelId: string;
  role: string;
  status: string;
  contractNo?: string | null;
  claimedAt?: string | null;
  verifiedAt?: string | null;
}

export interface MerchantStoreStaffItem {
  id: string;
  storeId: string;
  userId: string;
  name?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const MERCHANT_FIELDS = `
  id code name shortName logo brand intro tags legalName licenseNo licenseImage licenseExpiry
  merchantType industry category contactName contactPhone servicePhone complaintPhone email wechat
  province city district street address ownerChannelId claimStatus contractNo cooperationStart
  cooperationEnd commissionRate source settlementType bankName bankAccountName bankAccountNo taxNo
  invoiceTitle status statusReason closedAt createdAt updatedAt
`;

const STORE_FIELDS = `
  id merchantId code name storeType sortOrder weight province city cityCode district street addressLine detail
  postalCode lat lng navigationAddress phoneNumber backupPhone managerName managerPhone servicePhone
  businessHours businessHoursText status statusNote acceptingOrders coverImage photos notice tags facilities
  externalIds
  supportsRedemption redemptionHours dailyRedeemLimit requiresReservation reservationPhone
  supportsDelivery deliveryRadiusKm deliveryFee minOrderAmount deliveryMinutes isPublic enabled
  createdAt updatedAt
`;

export async function fetchMerchants(options: {
  skip?: number;
  take?: number;
  keyword?: string;
  status?: string;
  claimStatus?: string;
} = {}): Promise<{ items: MerchantItem[]; totalItems: number }> {
  const { merchants } = await getAdminClient().request<{
    merchants: { items: MerchantItem[]; totalItems: number };
  }>(
    `query Merchants($options: MerchantListOptions) {
      merchants(options: $options) { items { ${MERCHANT_FIELDS} } totalItems }
    }`,
    { options: { take: 100, skip: 0, ...options } },
  );
  return merchants;
}

export async function fetchMerchant(id: string): Promise<MerchantItem | null> {
  const { merchant } = await getAdminClient().request<{ merchant: MerchantItem | null }>(
    `query Merchant($id: ID!) { merchant(id: $id) { ${MERCHANT_FIELDS} } }`,
    { id },
  );
  return merchant;
}

export async function createMerchant(input: Record<string, any>): Promise<MerchantItem> {
  const { createMerchant: res } = await getAdminClient().request<{ createMerchant: MerchantItem }>(
    `mutation CreateMerchant($input: CreateMerchantInput!) {
      createMerchant(input: $input) { ${MERCHANT_FIELDS} }
    }`,
    { input },
  );
  return res;
}

export async function updateMerchant(input: Record<string, any>): Promise<MerchantItem> {
  const { updateMerchant: res } = await getAdminClient().request<{ updateMerchant: MerchantItem }>(
    `mutation UpdateMerchant($input: UpdateMerchantInput!) {
      updateMerchant(input: $input) { ${MERCHANT_FIELDS} }
    }`,
    { input },
  );
  return res;
}

export async function fetchMerchantStores(options: {
  skip?: number;
  take?: number;
  merchantId?: string;
  city?: string;
  status?: string;
  keyword?: string;
} = {}): Promise<{ items: MerchantStoreItem[]; totalItems: number }> {
  const { merchantStores } = await getAdminClient().request<{
    merchantStores: { items: MerchantStoreItem[]; totalItems: number };
  }>(
    `query MerchantStores($options: MerchantStoreListOptions) {
      merchantStores(options: $options) { items { ${STORE_FIELDS} } totalItems }
    }`,
    { options: { take: 100, skip: 0, ...options } },
  );
  return merchantStores;
}

export async function fetchMerchantStore(id: string): Promise<MerchantStoreItem | null> {
  const { merchantStore } = await getAdminClient().request<{ merchantStore: MerchantStoreItem | null }>(
    `query MerchantStore($id: ID!) { merchantStore(id: $id) { ${STORE_FIELDS} } }`,
    { id },
  );
  return merchantStore;
}

export async function createMerchantStore(input: Record<string, any>): Promise<MerchantStoreItem> {
  const { createMerchantStore: res } = await getAdminClient().request<{
    createMerchantStore: MerchantStoreItem;
  }>(
    `mutation CreateMerchantStore($input: CreateMerchantStoreInput!) {
      createMerchantStore(input: $input) { ${STORE_FIELDS} }
    }`,
    { input },
  );
  return res;
}

export async function updateMerchantStore(input: Record<string, any>): Promise<MerchantStoreItem> {
  const { updateMerchantStore: res } = await getAdminClient().request<{
    updateMerchantStore: MerchantStoreItem;
  }>(
    `mutation UpdateMerchantStore($input: UpdateMerchantStoreInput!) {
      updateMerchantStore(input: $input) { ${STORE_FIELDS} }
    }`,
    { input },
  );
  return res;
}

export async function fetchStoreClaims(storeId: string): Promise<MerchantStoreClaimItem[]> {
  const { merchantStoreClaims } = await getAdminClient().request<{
    merchantStoreClaims: MerchantStoreClaimItem[];
  }>(
    `query StoreClaims($storeId: ID!) {
      merchantStoreClaims(storeId: $storeId) {
        id storeId channelId role status contractNo claimedAt verifiedAt
      }
    }`,
    { storeId },
  );
  return merchantStoreClaims;
}

export async function claimStore(input: {
  storeId: string;
  channelId: string;
  role?: string;
  contractNo?: string;
}): Promise<void> {
  await getAdminClient().request(
    `mutation ClaimStore($storeId: ID!, $channelId: ID!, $role: String, $contractNo: String) {
      claimMerchantStore(storeId: $storeId, channelId: $channelId, role: $role, contractNo: $contractNo) { id }
    }`,
    input,
  );
}

export async function revokeStoreClaim(storeId: string, channelId: string): Promise<void> {
  await getAdminClient().request(
    `mutation RevokeClaim($storeId: ID!, $channelId: ID!) {
      revokeMerchantStoreClaim(storeId: $storeId, channelId: $channelId)
    }`,
    { storeId, channelId },
  );
}

export async function fetchStoreStaff(storeId: string): Promise<MerchantStoreStaffItem[]> {
  const { merchantStoreStaff } = await getAdminClient().request<{
    merchantStoreStaff: MerchantStoreStaffItem[];
  }>(
    `query StoreStaff($storeId: ID!) {
      merchantStoreStaff(storeId: $storeId) {
        id storeId userId name phone role status lastLoginAt createdAt updatedAt
      }
    }`,
    { storeId },
  );
  return merchantStoreStaff;
}

export async function upsertStoreStaff(input: {
  storeId: string;
  userId: string;
  name?: string;
  phone?: string;
  role?: string;
  status?: string;
}): Promise<MerchantStoreStaffItem> {
  const { upsertMerchantStoreStaff } = await getAdminClient().request<{
    upsertMerchantStoreStaff: MerchantStoreStaffItem;
  }>(
    `mutation UpsertStoreStaff($input: UpsertMerchantStoreStaffInput!) {
      upsertMerchantStoreStaff(input: $input) {
        id storeId userId name phone role status lastLoginAt createdAt updatedAt
      }
    }`,
    { input },
  );
  return upsertMerchantStoreStaff;
}
