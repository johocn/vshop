// 租户多语言配置读写（cjk-plugin tenantSettings / updateTenantMultiLanguage）
// 注意：multiLanguage 在 schema 中是 JSON 标量；updateTenantMultiLanguage 入参为
// TenantSectionPatchInput { channelId: ID!, patch: JSON! }，patch 内即多语言配置对象。
// 写入必须走本接口（后端会同步 Vendure 原生 availableLanguages / defaultLanguageCode），
// 不要用 myUpdateChannelCustomFields 直写 customFields —— 那样不会同步原生语言字段，
// C 端 availableLanguageCodes 仍为空，链路照样断。
import { getAdminClient } from './client';

export interface MultiLanguageConfig {
  availableLanguageCodes?: string[];
  defaultLanguageCode?: string;
  translationWorkflowEnabled?: boolean;
  operationalCopy?: {
    tenantName?: string[];
    serviceNotice?: string[];
    invoiceHeader?: string[];
  };
}

/** 读当前渠道多语言配置；失败由调用方兜底（返回 null 表示未配置） */
export async function fetchTenantMultiLanguage(
  channelId: string,
): Promise<MultiLanguageConfig | null> {
  const { tenantSettings } = await getAdminClient().request<{
    tenantSettings: { multiLanguage: MultiLanguageConfig | null };
  }>(
    `query TenantMultiLanguage($channelId: ID!) {
      tenantSettings(channelId: $channelId) { multiLanguage }
    }`,
    { channelId },
  );
  return tenantSettings?.multiLanguage ?? null;
}

/** 写当前渠道多语言配置（后端同步原生语言字段），返回写入后的完整配置 */
export async function updateTenantMultiLanguage(
  channelId: string,
  patch: MultiLanguageConfig,
): Promise<MultiLanguageConfig | null> {
  const { updateTenantMultiLanguage } = await getAdminClient().request<{
    updateTenantMultiLanguage: { multiLanguage: MultiLanguageConfig | null };
  }>(
    `mutation UpdateTenantMultiLanguage($input: TenantSectionPatchInput!) {
      updateTenantMultiLanguage(input: $input) { multiLanguage }
    }`,
    { input: { channelId, patch } },
  );
  return updateTenantMultiLanguage?.multiLanguage ?? null;
}

/** 当前渠道 id（轻量查询；供无 channelId 上下文的页面用） */
export async function fetchActiveChannelId(): Promise<string> {
  const { activeChannel } = await getAdminClient().request<{
    activeChannel: { id: string };
  }>(`query ActiveChannelId { activeChannel { id } }`);
  return activeChannel?.id ?? '';
}
