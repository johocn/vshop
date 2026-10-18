// 代买单（委托单模式）admin-api 调用（bill-pay-plugin，schema 已按插件 SDL 校准）
// 校准要点（对齐 vendure bill-pay-plugin/src/plugin.ts adminApiExtensions）：
//   - Query  billPayOrdersAdmin(options: BillPayOrderListOptions): BillPayOrderList!
//            billPayOrderAdmin(id: ID!): BillPayOrder!
//            merchantAgreements: [MerchantAgreement!]!
//   - Mutation updateBillPayQuote(id, quoteAmount, note) / acceptBillPayOrder(id) /
//            completeBillPayOrder(id, actualAmount, proofUrl, note) / settleBillPayOrder(id) /
//            refundBillPayOrder(id, reason) / saveMerchantAgreement(input, id)
//   - 权限：自定义 BillPayManage（服务端校验；菜单侧同权限点过滤）
//   - 金额单位一律「分」；settleRate 为百分数整数（85 = 8.5 折）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface BillPayOrderRow {
  id: string;
  code?: string | null;
  customerId: string;
  merchantName: string;
  expectedAmount: number;
  quoteAmount?: number | null;
  actualAmount?: number | null;
  discountDetail?: { rule: string; label?: unknown; amount: number }[] | null;
  status: string;
  remark?: string | null;
  quoteNote?: string | null;
  quoteExpireAt?: string | null;
  proofUrl?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  completedAt?: string | null;
  settledAt?: string | null;
  refundedAt?: string | null;
  completeNote?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface MerchantAgreementRow {
  id: string;
  merchantName: string;
  settleRate: number;
  settleMode: string;
  contact?: string | null;
  note?: string | null;
  createdAt?: string | null;
}

export const BILLPAY_STATUS_LABELS: Record<string, string> = {
  PENDING_QUOTE: '待报价',
  QUOTED: '待支付',
  PAID: '已支付',
  IN_SERVICE: '代付中',
  COMPLETED: '已完成',
  SETTLED: '已结算',
  CANCELLED: '已取消',
  REFUNDED: '已退款',
};

const ORDER_FIELDS = `id code customerId merchantName expectedAmount quoteAmount actualAmount
  discountDetail status remark quoteNote quoteExpireAt proofUrl paymentMethod
  paidAt completedAt settledAt refundedAt completeNote createdAt updatedAt`;

export async function fetchBillPayOrders(options: {
  skip: number;
  take: number;
  status?: string;
}): Promise<{ items: BillPayOrderRow[]; totalItems: number }> {
  try {
    const { billPayOrdersAdmin } = await getAdminClient().request<{
      billPayOrdersAdmin: { items: BillPayOrderRow[]; totalItems: number };
    }>(
      `query BillPayOrdersAdmin($options: BillPayOrderListOptions) {
        billPayOrdersAdmin(options: $options) { items { ${ORDER_FIELDS} } totalItems }
      }`,
      { options: { skip: options.skip, take: options.take, status: options.status || undefined } },
    );
    return { items: billPayOrdersAdmin?.items ?? [], totalItems: billPayOrdersAdmin?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载委托单失败'));
  }
}

export async function fetchBillPayOrder(id: string): Promise<BillPayOrderRow> {
  try {
    const { billPayOrderAdmin } = await getAdminClient().request<{ billPayOrderAdmin: BillPayOrderRow }>(
      `query BillPayOrderAdmin($id: ID!) { billPayOrderAdmin(id: $id) { ${ORDER_FIELDS} } }`,
      { id },
    );
    return billPayOrderAdmin;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载委托单详情失败'));
  }
}

export async function updateBillPayQuote(id: string, quoteAmount: number, note: string): Promise<BillPayOrderRow> {
  try {
    const { updateBillPayQuote } = await getAdminClient().request<{ updateBillPayQuote: BillPayOrderRow }>(
      `mutation UpdateBillPayQuote($id: ID!, $quoteAmount: Int!, $note: String!) {
        updateBillPayQuote(id: $id, quoteAmount: $quoteAmount, note: $note) { ${ORDER_FIELDS} }
      }`,
      { id, quoteAmount, note },
    );
    return updateBillPayQuote;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '报价失败'));
  }
}

export async function acceptBillPayOrder(id: string): Promise<BillPayOrderRow> {
  try {
    const { acceptBillPayOrder } = await getAdminClient().request<{ acceptBillPayOrder: BillPayOrderRow }>(
      `mutation AcceptBillPayOrder($id: ID!) { acceptBillPayOrder(id: $id) { ${ORDER_FIELDS} } }`,
      { id },
    );
    return acceptBillPayOrder;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '接单失败'));
  }
}

export async function completeBillPayOrder(
  id: string,
  actualAmount: number,
  proofUrl: string,
  note?: string,
): Promise<BillPayOrderRow> {
  try {
    const { completeBillPayOrder } = await getAdminClient().request<{ completeBillPayOrder: BillPayOrderRow }>(
      `mutation CompleteBillPayOrder($id: ID!, $actualAmount: Int!, $proofUrl: String!, $note: String) {
        completeBillPayOrder(id: $id, actualAmount: $actualAmount, proofUrl: $proofUrl, note: $note) { ${ORDER_FIELDS} }
      }`,
      { id, actualAmount, proofUrl, note: note || undefined },
    );
    return completeBillPayOrder;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '凭证回传失败'));
  }
}

export async function settleBillPayOrder(id: string): Promise<BillPayOrderRow> {
  try {
    const { settleBillPayOrder } = await getAdminClient().request<{ settleBillPayOrder: BillPayOrderRow }>(
      `mutation SettleBillPayOrder($id: ID!) { settleBillPayOrder(id: $id) { ${ORDER_FIELDS} } }`,
      { id },
    );
    return settleBillPayOrder;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '结算失败'));
  }
}

export async function refundBillPayOrder(id: string, reason?: string): Promise<BillPayOrderRow> {
  try {
    const { refundBillPayOrder } = await getAdminClient().request<{ refundBillPayOrder: BillPayOrderRow }>(
      `mutation RefundBillPayOrder($id: ID!, $reason: String) {
        refundBillPayOrder(id: $id, reason: $reason) { ${ORDER_FIELDS} }
      }`,
      { id, reason: reason || undefined },
    );
    return refundBillPayOrder;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '退款失败'));
  }
}

const AGREEMENT_FIELDS = `id merchantName settleRate settleMode contact note createdAt`;

export async function fetchMerchantAgreements(): Promise<MerchantAgreementRow[]> {
  try {
    const { merchantAgreements } = await getAdminClient().request<{ merchantAgreements: MerchantAgreementRow[] }>(
      `query MerchantAgreements { merchantAgreements { ${AGREEMENT_FIELDS} } }`,
    );
    return merchantAgreements ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载商家协议失败'));
  }
}

export async function saveMerchantAgreement(input: {
  merchantName: string;
  settleRate: number;
  settleMode?: string;
  contact?: string;
  note?: string;
}, id?: string): Promise<MerchantAgreementRow> {
  try {
    const { saveMerchantAgreement } = await getAdminClient().request<{ saveMerchantAgreement: MerchantAgreementRow }>(
      `mutation SaveMerchantAgreement($input: MerchantAgreementInput!, $id: ID) {
        saveMerchantAgreement(input: $input, id: $id) { ${AGREEMENT_FIELDS} }
      }`,
      { input: { ...input, settleMode: input.settleMode || 'PER_ORDER' }, id: id || undefined },
    );
    return saveMerchantAgreement;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存商家协议失败'));
  }
}
