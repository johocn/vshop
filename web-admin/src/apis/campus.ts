// 拾光达（校内配送）域 admin-api 调用：店铺配置列表 + upsert
// 后端：campus-delivery-plugin admin-api（campusStoreConfigs / campusUpdateStoreConfig，
// 权限 CampusConfig）。金额字段均为「分」，页面层用 utils/money 做分↔元转换。
import { getAdminClient } from './client';

export interface CampusStoreConfig {
  channelId: string;
  channelName: string;
  channelToken: string;
  routesEnabled: string[];
  deliveryMinutes: number | null;
  minOrderAmount: number | null;
  deliveryFee: number | null;
  storeAddress: string | null;
  storePhone: string | null;
  storeNotice: string | null;
  errandBaseFee: number | null;
}

export interface CampusStoreConfigInput {
  routesEnabled: string[];
  deliveryMinutes?: number | null;
  minOrderAmount?: number | null;
  deliveryFee?: number | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  storeNotice?: string | null;
  errandBaseFee?: number | null;
}

const FIELDS =
  'channelId channelName channelToken routesEnabled deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee';

export async function campusStoreConfigs(): Promise<CampusStoreConfig[]> {
  const res = await getAdminClient().request<{ campusStoreConfigs: CampusStoreConfig[] }>(
    `query { campusStoreConfigs { ${FIELDS} } }`,
  );
  return res.campusStoreConfigs;
}

export async function campusUpdateStoreConfig(
  channelId: string,
  input: CampusStoreConfigInput,
): Promise<CampusStoreConfig> {
  const res = await getAdminClient().request<{ campusUpdateStoreConfig: CampusStoreConfig }>(
    `mutation ($channelId: ID!, $input: CampusStoreConfigInput!) {
      campusUpdateStoreConfig(channelId: $channelId, input: $input) { ${FIELDS} }
    }`,
    { channelId, input },
  );
  return res.campusUpdateStoreConfig;
}

export interface CampusEnsureProfileResult {
  profileId: string;
  profileName: string;
  linkedMethodCodes: string[];
  missingMethodCodes: string[];
  boundVariantCount: number;
}

/** R2/R4 档案冲突治本：get-or-create 渠道合并默认配送档案并补绑未绑档案变体（幂等） */
export async function campusEnsureDefaultShippingProfile(
  channelId: string,
): Promise<CampusEnsureProfileResult> {
  const res = await getAdminClient().request<{ campusEnsureDefaultShippingProfile: CampusEnsureProfileResult }>(
    `mutation ($channelId: ID!) {
      campusEnsureDefaultShippingProfile(channelId: $channelId) {
        profileId profileName linkedMethodCodes missingMethodCodes boundVariantCount
      }
    }`,
    { channelId },
  );
  return res.campusEnsureDefaultShippingProfile;
}
