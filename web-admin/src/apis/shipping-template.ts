// 配送方案模板 admin-api 调用（Task 8，schema 已按后端 shipping-template-admin.resolver 校准）
import { getAdminClient } from './client';

export interface ShippingTemplateItem {
  id: string;
  code: string;
  name: string;
  description: string;
  isGlobal: boolean;
}

// 仅取全局模板（isGlobal=true），供「全局方案池」Tab 展示
export async function fetchShippingTemplates(): Promise<ShippingTemplateItem[]> {
  const { shippingTemplates } = await getAdminClient().request<{
    shippingTemplates: { items: ShippingTemplateItem[] };
  }>(`query { shippingTemplates { items { id code name description isGlobal } } }`);
  return shippingTemplates.items.filter((t) => t.isGlobal);
}

// 从全局模板复制出一个本店配送方式实例（copy 独立实例，非引用）
export async function createShippingMethodFromTemplate(templateId: string): Promise<void> {
  await getAdminClient().request(
    `mutation C($templateId: ID!) {
      createShippingMethodFromTemplate(templateId: $templateId) { id }
    }`,
    { templateId },
  );
}

export interface ConfigArg { name: string; value: string; }
export interface ShippingTemplateDetail {
  id: string;
  code: string;
  name: string;
  description: string;
  checker?: { code: string; arguments: ConfigArg[] } | null;
  calculator?: { code: string; arguments: ConfigArg[] } | null;
}

// 读取单个模板（含 checker/calculator，供区域与运费配置页）
export async function fetchShippingTemplate(id: string): Promise<ShippingTemplateDetail | null> {
  const { shippingTemplate } = await getAdminClient().request<{
    shippingTemplate: ShippingTemplateDetail | null;
  }>(`query Template($id: ID!) {
    shippingTemplate(id: $id) {
      id code name description
      checker { code args { name value } }
      calculator { code args { name value } }
    }
  }`, { id });
  return shippingTemplate ?? null;
}

// 更新模板的区域(checker)与运费(calculator)配置
export async function updateShippingTemplateConfig(
  id: string,
  checker: { code: string; arguments: ConfigArg[] } | null,
  calculator: { code: string; arguments: ConfigArg[] } | null,
): Promise<void> {
  await getAdminClient().request(`mutation Up($input: UpdateShippingTemplateInput!) {
    updateShippingTemplate(input: $input) { id }
  }`, {
    input: {
      id,
      ...(checker ? { checker: { code: checker.code, arguments: checker.arguments } } : {}),
      ...(calculator ? { calculator: { code: calculator.code, arguments: calculator.arguments } } : {}),
    },
  });
}