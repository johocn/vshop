// 商户分账台账（merchant_settlement_ledger）查询（admin-api）
// - 到店/货到付款单核销确认收款后，台账 PENDING_SIGN → PAID；
// - 在线支付单结算即 PAID。
// 门店管理按当前渠道隔离（backend 按 tenantChannelId 过滤）。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface SettlementLedgerRow {
  id: string;
  orderId: string;
  tenantChannelId?: string | null;
  tenantName?: string | null;
  amount: number; // 分
  settleMethod?: string | null;
  status?: string | null; // PAID | PENDING_SIGN
  occurredAt?: string | null;
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

export async function fetchSettlementLedgers(orderId?: string): Promise<SettlementLedgerRow[]> {
  try {
    const res = await getAdminClient().request<{ merchantSettlementLedgers: SettlementLedgerRow[] }>(
      `query MerchantSettlementLedgers($orderId: String) {
        merchantSettlementLedgers(orderId: $orderId) {
          id orderId tenantChannelId tenantName amount settleMethod status occurredAt
        }
      }`,
      { orderId: orderId || undefined },
    );
    return res.merchantSettlementLedgers ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询收款台账失败'));
  }
}