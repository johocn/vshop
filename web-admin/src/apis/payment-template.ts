// 支付方案模板 admin-api 调用（Task 9，schema 已按后端 payment-template-admin.resolver 校准）
import { getAdminClient } from './client';

export interface PaymentTemplateItem {
  id: string;
  code: string;
  name: string;
  description: string;
  isGlobal: boolean;
}

// 仅取全局模板（isGlobal=true），供「全局方案池」Tab 展示
export async function fetchPaymentTemplates(): Promise<PaymentTemplateItem[]> {
  const { paymentTemplates } = await getAdminClient().request<{
    paymentTemplates: { items: PaymentTemplateItem[] };
  }>(`query { paymentTemplates { items { id code name description isGlobal } } }`);
  return paymentTemplates.items.filter((t) => t.isGlobal);
}

// 从全局模板复制出一个本店支付方式实例（copy 独立实例，非引用）
export async function createPaymentMethodFromTemplate(templateId: string): Promise<void> {
  await getAdminClient().request(
    `mutation C($templateId: ID!) {
      createPaymentMethodFromTemplate(templateId: $templateId) { id }
    }`,
    { templateId },
  );
}