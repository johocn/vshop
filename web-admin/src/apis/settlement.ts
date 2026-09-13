// 商户分账台账（merchant_settlement_ledger）查询（admin-api）
// - 到店/货到付款单核销确认收款后，台账 PENDING_SIGN → PAID；
// - 在线支付单结算即 PAID。
// 门店管理按当前渠道隔离（backend 按 tenantChannelId 过滤）。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface SettlementLedgerRow {
  id: string;
  orderId: string;
  /** 订单单号快照（核销收款的到店单为明文单号） */
  orderCode?: string | null;
  tenantChannelId?: string | null;
  tenantName?: string | null;
  amount: number; // 分
  settleMethod?: string | null;
  status?: string | null; // PAID | PENDING_SIGN
  occurredAt?: string | null;
  /** 收款渠道 id（到店核销收款归属门店渠道；在线分账行为空） */
  collectorChannelId?: string | null;
  /** 核销人 / 收款人显示名（核销人即收款人） */
  collectorName?: string | null;
  /** 到店核销收款确认时点 */
  collectedAt?: string | null;
}

export const SETTLE_METHOD_LABELS: Record<string, string> = {
  'balance-wallet': '余额钱包',
  alipay: '支付宝',
  wechatpay: '微信支付',
  stripe: 'Stripe',
  'cash-on-delivery': '货到付款',
  'fixed-aggregate-collection': '聚合码收款',
  'cod-payment-template': '到店付款/货到付款',
  'cloud-payment-template': '到店付款/货到付款',
};

export function settleMethodLabel(method?: string | null): string {
  if (!method) return '—';
  return SETTLE_METHOD_LABELS[method] || method;
}

export function isPendingSign(status?: string | null): boolean {
  return status === 'PENDING_SIGN';
}

/** 台账时点兼容：后端可能返回 ISO 字符串或毫秒时间戳字符串 */
export function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const t = String(value).trim();
  if (!t) return null;
  if (/^\d{10,}$/.test(t)) {
    const n = Number(t);
    const d = new Date(/^\d{13}$/.test(t) ? n : n * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 该台账行的「收款/入账」时点：收款单取 collectedAt，否则取 occurredAt */
export function rowTime(r: SettlementLedgerRow): Date | null {
  return toDate(r.collectedAt) || toDate(r.occurredAt);
}

/** 是否今天 */
export function isToday(value?: string | null): boolean {
  const d = toDate(value);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function fetchSettlementLedgers(orderId?: string): Promise<SettlementLedgerRow[]> {
  try {
    const res = await getAdminClient().request<{ merchantSettlementLedgers: SettlementLedgerRow[] }>(
      `query MerchantSettlementLedgers($orderId: String) {
        merchantSettlementLedgers(orderId: $orderId) {
          id orderId orderCode tenantChannelId tenantName amount settleMethod status
          occurredAt collectorChannelId collectorName collectedAt
        }
      }`,
      { orderId: orderId || undefined },
    );
    return res.merchantSettlementLedgers ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询收款台账失败'));
  }
}