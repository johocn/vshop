// cjk 租户核销体系调用（admin-api，redemption-* schema）
// 与 pickup-plugin 那套 Shop 模型+ManageOwnShop 不同：
//   - myPendingRedemptions(options): 本租户渠道待核销自提单（deliveryType=pickup 且未核销）
//   - redemptionClaim(code): 按核销码核销（后端按当前租户 channel 指纹精确检索 + UpdateOrder 鉴权）
// 授权：租户管理员/superadmin 均有 Permission.UpdateOrder
import { getAdminClient, graphQlErrorMsg } from './client';

export interface PendingRedemptionLine {
  name: string;
  quantity: number;
  lineTotalWithTax: number;
}

export interface PendingRedemption {
  orderId: string;
  orderCode: string;
  code: string;
  status: string; // active | expiring_soon | expired
  expiresAt?: string | null;
  version: number;
  claimed: boolean;
  /** 支付方式 code；命中 COD_PAYMENT_CODES 即到店/货到付款 */
  paymentType?: string | null;
  /** 是否已确认到店收款 */
  collected?: boolean;
  /** 本单交付商品清单 */
  lines: PendingRedemptionLine[];
}

export interface RedemptionOrder {
  id: string;
  code: string;
  state: string;
  totalWithTax?: number;
}

export interface RedemptionLookupResult {
  order?: RedemptionOrder | null;
  claimed: boolean;
  claimedAt?: string | null;
  status: string;
  expiresAt?: string | null;
  version: number;
  reissueable: boolean;
  paymentType?: string | null;
  collected: boolean;
}

export interface RedemptionClaimResult {
  claimed: boolean;
  claimedAt?: string | null;
  message?: string | null;
  status: string;
  expiresAt?: string | null;
  version: number;
  order?: RedemptionOrder | null;
  /** true = 该 COD 单未收款且为强制收款模式，必须先确认收款才能核销 */
  collectRequired?: boolean;
  /** 核销是否已同步确认到店收款 */
  collected?: boolean;
}

/** 到店/货到付款（COD）支付方式 code（与后端 COD_PAYMENT_CODES 一致） */
export const IS_COD_CODES = [
  'cash-on-delivery',
  'cod',
  'cod-payment-template',
  'cloud-payment-template',
  'fixed-aggregate-collection',
];
export function isCodPaymentType(paymentType?: string | null): boolean {
  return !!paymentType && IS_COD_CODES.includes(paymentType);
}

const PENDING_FIELDS =
  'orderId orderCode code status expiresAt version claimed paymentType collected lines { name quantity lineTotalWithTax }';

export async function fetchPendingRedemptions(
  take = 100,
): Promise<{ items: PendingRedemption[]; totalItems: number }> {
  const res = await getAdminClient().request<{
    myPendingRedemptions: { items: PendingRedemption[]; totalItems: number };
  }>(
    `query MyPendingRedemptions($options: RedemptionListOptions) {
      myPendingRedemptions(options: $options) {
        items { ${PENDING_FIELDS} }
        totalItems
      }
    }`,
    { options: { take, skip: 0 } },
  );
  return {
    items: res.myPendingRedemptions?.items ?? [],
    totalItems: res.myPendingRedemptions?.totalItems ?? 0,
  };
}

export async function lookupRedemption(
  code: string,
): Promise<RedemptionLookupResult | null> {
  try {
    const res = await getAdminClient().request<{ redemptionLookup: RedemptionLookupResult }>(
      `query RedemptionLookup($code: String!) {
        redemptionLookup(code: $code) {
          order { id code state totalWithTax }
          claimed
          claimedAt
          status
          expiresAt
          version
          reissueable
          paymentType
          collected
        }
      }`,
      { code },
    );
    return res.redemptionLookup ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询订单失败'));
  }
}

export async function claimRedemption(
  code: string,
  collect?: boolean,
): Promise<{ ok: boolean; message: string; result?: RedemptionClaimResult }> {
  try {
    const res = await getAdminClient().request<{ redemptionClaim: RedemptionClaimResult }>(
      `mutation RedemptionClaim($code: String!, $collect: Boolean) {
        redemptionClaim(code: $code, collect: $collect) {
          claimed
          claimedAt
          message
          status
          expiresAt
          version
          collectRequired
          collected
          order { id code state totalWithTax }
        }
      }`,
      { code, collect: collect || undefined },
    );
    const r = res.redemptionClaim;
    return { ok: true, message: r?.message || 'ok', result: r };
  } catch (e: any) {
    return { ok: false, message: graphQlErrorMsg(e, '核销失败') };
  }
}

// —— 智能解码：统一从「二维码 JSON 载荷 / RD: 一维条码 / 纯 6 位码」中提取核销码 ——
// 后端生成：二维码 redemptionQrPayload = {"o":orderCode,"c":code,"ts":..,"s":..}；一维码 redemptionBarcodePayload = RD:orderCode:code
const RE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function decodeRedemptionInput(input: string): string {
  const t = (input ?? '').trim();
  if (!t) return '';
  // 1) 二维码 JSON 载荷
  if (t.startsWith('{')) {
    try {
      const p = JSON.parse(t);
      if (p && typeof p.c === 'string' && RE_CODE.test(p.c.toUpperCase())) {
        return p.c.toUpperCase();
      }
    } catch {
      /* 非 JSON → 继续判定 */
    }
    return '';
  }
  // 2) 一维条码 RD:orderCode:code
  if (t.toUpperCase().startsWith('RD:')) {
    const parts = t.split(':');
    const code = (parts[parts.length - 1] || '').trim().toUpperCase();
    return RE_CODE.test(code) ? code : '';
  }
  // 3) 纯 6 位码（手动输入/字母数字扫码）→ 归一化后交后端指纹校验
  return /^[A-Z0-9]{6}$/.test(t.toUpperCase()) ? t.toUpperCase() : '';
}