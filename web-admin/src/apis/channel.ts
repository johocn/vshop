// 店铺（Channel）域 admin-api 调用（Task 3，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - updateChannel(input:{id, customFields:{...}}) 存在，返回 UpdateChannelResult union
//     （Channel | LanguageNotAvailableError），需用 ... on Channel 取 id/code —— 已实测可用
//     customFields 的 GraphQL 输入类型为 UpdateChannelCustomFieldsInput
//   - 装修字段 displayTemplate/themeId/shopName/shopLogo/shopIntro/servicePhone/shopContent
//     已由 Task 6 在本地 dev-config 的 Channel customFields 补齐（shopContent 为 text，承载序列化 JSON）。
//     本文件用泛型透传，字段名以实际 schema 为准。
import { getAdminClient } from './client';

// 装修字段（Task 6 已补齐后端 Channel customFields）
export interface ChannelCustomFields {
  displayTemplate?: string;
  themeId?: string;
  shopName?: string;
  shopLogo?: string;
  shopIntro?: string;
  servicePhone?: string;
  // shopContent 为 text 类型，存装修 JSON 字符串（Vendure 3.6.4 无 type:'json'）
  shopContent?: string;
}

export interface ActiveChannelInfo {
  id: string;
  code: string;
  customFields: ChannelCustomFields;
}

export async function fetchActiveChannel(): Promise<ActiveChannelInfo> {
  const { activeChannel } = await getAdminClient().request<{ activeChannel: ActiveChannelInfo }>(
    `query {
      activeChannel {
        id code
        customFields { displayTemplate themeId shopName shopLogo shopIntro servicePhone shopContent }
      }
    }`,
  );
  return activeChannel;
}

export async function updateChannelCustomFields(
  id: string,
  fields: Partial<ChannelCustomFields> & Record<string, unknown>,
): Promise<void> {
  await getAdminClient().request(
    `mutation UpdateChannel($id: ID!, $fields: UpdateChannelCustomFieldsInput!) {
      updateChannel(input: { id: $id, customFields: $fields }) {
        ... on Channel { id code }
        ... on ErrorResult { errorCode message }
      }
    }`,
    { id, fields },
  );
}
