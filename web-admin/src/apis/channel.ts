// 店铺（Channel）域 admin-api 调用（Task 3，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - updateChannel(input:{id, customFields:{...}}) 存在，返回 UpdateChannelResult union
//     （Channel | LanguageNotAvailableError），需用 ... on Channel 取 id/code —— 已实测可用
//     customFields 的 GraphQL 输入类型为 UpdateChannelCustomFieldsInput
//   - 计划里的装修字段 displayTemplate/themeId/shopName/shopLogo/shopIntro/servicePhone
//     在本机 admin schema 的 ChannelCustomFields 中【不存在】。
//     实际 ChannelCustomFields 为分销/积分/签到/任务等配置字段（如 distributionEnabled、
//     directCommissionRate、pointsEarnRatio、checkinPoints、taskSharePoints 等）。
//     装修字段需后端二轮补 customFields 后再启用；本文件用泛型透传，字段名以实际 schema 为准。
import { getAdminClient } from './client';

// 装修字段（计划定义，待后端补字段后启用）
export interface ChannelCustomFields {
  displayTemplate?: string;
  themeId?: string;
  shopName?: string;
  shopLogo?: string;
  shopIntro?: string;
  servicePhone?: string;
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
