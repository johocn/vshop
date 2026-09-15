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
  // 商品富文本描述多语言开关（true 时商品表单展示中文/English Tab）
  multilingualEnabled?: boolean;
  // 税率三态：inclusive=含税价 / zero=零税价 / exclusive=不含税价（默认 inclusive）
  taxMode?: string;
  // 详情页配置 JSON 串（含 blocks.price.style 价格块版式 classic/jdA/jdB）
  detailConfig?: string;
  // 促销/服务方案库 JSON 字符串（[{code,text:{zh_Hans,en}}]）
  promoSchemes?: string;
  serviceSchemes?: string;
  // 店铺引用的风格模板 id（模板库 shop-template-plugin 的 ShopTemplate）
  templateId?: string;
  // 分类/购物车/我的 页面装修 JSON 字符串（web-admin 装修表单写入）
  pageCategoryConfig?: string;
  pageCartConfig?: string;
  pageProfileConfig?: string;
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
        customFields { displayTemplate themeId shopName shopLogo shopIntro servicePhone shopContent multilingualEnabled taxMode detailConfig promoSchemes serviceSchemes templateId pageCategoryConfig pageCartConfig pageProfileConfig }
      }
    }`,
  );
  return activeChannel;
}

export async function updateChannelCustomFields(
  id: string,
  fields: Partial<ChannelCustomFields> & Record<string, unknown>,
): Promise<void> {
  // 安全加固：改走插件端「仅本 channel」resolver（后端强制限定 ctx.channelId，
  // 并禁止改 enabled/tenantNo/isOfficial），租户不再持有核心 UpdateChannel 权限，
  // 从而校验跨租户改渠道画面。
  // 注意：myUpdateChannelCustomFields 返回类型为 JSON! 标量（无子字段），
  // 不能带 { id } 等选择集，否则 GRAPHQL_VALIDATION_FAILED。
  await getAdminClient().request(
    `mutation MyUpdateChannelCustomFields($fields: JSON!) {
      myUpdateChannelCustomFields(input: $fields)
    }`,
    { fields },
  );
}
