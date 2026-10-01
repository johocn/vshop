// 到店买单 admin-api 调用（coupon-plugin，schema 见 spec §9.1）。
// 金额单位一律为「分」；页面展示时用 fenToYuan 转元。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface InStoreBillQuote {
  ok: boolean;
  reason?: string | null;
  couponCode?: string | null;
  couponName?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  minSpend?: number | null;
  originalAmount?: number | null;
  discountAmount?: number | null;
  finalAmount?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  expiresAt?: string | null;
}

export interface InStoreBillRow {
  id: string;
  channelId: string;
  couponCode: string;
  couponTemplateId: string;
  couponName?: string | null;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  discountType: string;
  discountValue: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  operatorId: string;
  operatorName?: string | null;
  remark?: string | null;
  billedAt: string;
  createdAt: string;
}

export interface InStoreBillSummary {
  count: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
}

export interface InStoreBillQueryOptions {
  skip?: number;
  take?: number;
  couponCode?: string;
  from?: string | null;
  to?: string | null;
}

const QUOTE_FIELDS = `ok reason couponCode couponName discountType discountValue minSpend originalAmount discountAmount finalAmount customerName customerPhone expiresAt`;
const BILL_FIELDS = `id channelId couponCode couponTemplateId couponName customerId customerName customerPhone discountType discountValue originalAmount discountAmount finalAmount operatorId operatorName remark billedAt createdAt`;

/** 分 → 元（两位小数） */
export function fenToYuan(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return (cents / 100).toFixed(2);
}

/** 折扣展示：PERCENT 80 → “8 折”；FIXED/FULL → “减 ¥x” */
export function discountLabel(type?: string | null, discountValue?: number | null): string {
  if (discountValue == null) return '—';
  if (type === 'PERCENT') {
    const zhe = discountValue / 10;
    return `${zhe % 1 === 0 ? zhe : zhe.toFixed(1)} 折`;
  }
  return `减 ¥${fenToYuan(discountValue)}`;
}

/** 试算（不传 originalAmount = 只取券信息） */
export async function quoteInStoreBill(code: string, originalAmount?: number | null): Promise<InStoreBillQuote> {
  try {
    const { inStoreBillQuote } = await getAdminClient().request<{ inStoreBillQuote: InStoreBillQuote }>(
      `query InStoreBillQuote($code: String!, $originalAmount: Int) {
        inStoreBillQuote(code: $code, originalAmount: $originalAmount) { ${QUOTE_FIELDS} }
      }`,
      { code, originalAmount: originalAmount ?? null },
    );
    return inStoreBillQuote;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询优惠券失败'));
  }
}

/** 核销并落流水（平台不收款，实付金额由商户线下收取） */
export async function redeemInStoreBill(code: string, originalAmount: number, remark?: string): Promise<InStoreBillRow> {
  try {
    const { inStoreBillRedeem } = await getAdminClient().request<{ inStoreBillRedeem: InStoreBillRow }>(
      `mutation InStoreBillRedeem($code: String!, $originalAmount: Int!, $remark: String) {
        inStoreBillRedeem(code: $code, originalAmount: $originalAmount, remark: $remark) { ${BILL_FIELDS} }
      }`,
      { code, originalAmount, remark: remark?.trim() || null },
    );
    return inStoreBillRedeem;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '核销失败'));
  }
}

/** 流水明细分页 */
export async function fetchInStoreBills(options: InStoreBillQueryOptions = {}): Promise<{ items: InStoreBillRow[]; totalItems: number }> {
  try {
    const { inStoreBills } = await getAdminClient().request<{
      inStoreBills: { items: InStoreBillRow[]; totalItems: number };
    }>(
      `query InStoreBills($options: InStoreBillListOptions) {
        inStoreBills(options: $options) { items { ${BILL_FIELDS} } totalItems }
      }`,
      {
        options: {
          skip: options.skip ?? 0,
          take: options.take ?? 20,
          couponCode: options.couponCode || null,
          from: options.from || null,
          to: options.to || null,
        },
      },
    );
    return { items: inStoreBills?.items ?? [], totalItems: inStoreBills?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载买单流水失败'));
  }
}

/** 流水汇总（笔数 / 原价 / 优惠 / 实收） */
export async function fetchInStoreBillSummary(options: { from?: string | null; to?: string | null } = {}): Promise<InStoreBillSummary> {
  try {
    const { inStoreBillSummary } = await getAdminClient().request<{ inStoreBillSummary: InStoreBillSummary }>(
      `query InStoreBillSummary($options: InStoreBillSummaryOptions) {
        inStoreBillSummary(options: $options) { count originalTotal discountTotal finalTotal }
      }`,
      { options: { from: options.from || null, to: options.to || null } },
    );
    return inStoreBillSummary ?? { count: 0, originalTotal: 0, discountTotal: 0, finalTotal: 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载买单汇总失败'));
  }
}
