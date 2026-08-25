// 到店自提核销 admin-api 调用（pickup-plugin，schema 已实际校准）
// 校准结果（pickup-plugin 真实 schema）：
//   - Query myPickupOrders(options: PickupListOptions): PickupRedemptionList!  —— 本店待核销（后端只返回 generated 状态）
//   - Query pickupRedemptions(options: PickupListOptions): PickupRedemptionList! —— 全部核销记录
//     PickupListOptions = { skip: Int, take: Int }
//   - Mutation claimPickupByShop(code: String!): PickupRedemption!
//   - PickupRedemption = { id, orderId, orderCode, code, status, claimedAt, claimChannel }
//  注：返回的是核销凭据对象，不含订单 state/totalWithTax/customer；核销码在 redemption.code，
//      不在 Order 自定义字段上。myPickupOrders 已天然只返回 pending(generated)，无需前端过滤。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface PickupRedemptionItem {
  id: string;
  orderId: string;
  orderCode: string | null;
  code: string;
  status: string;
  claimedAt?: string | null;
  claimChannel?: string | null;
}

const REDEMPTION_FIELDS = `id orderId orderCode code status claimedAt claimChannel`;

/** 取本店待核销（onlyPending=true，即后端 myPickupOrders/generated）或全部核销记录 */
export async function fetchPickupOrders(onlyPending = true): Promise<PickupRedemptionItem[]> {
  const query = onlyPending ? 'myPickupOrders' : 'pickupRedemptions';
  const res = await getAdminClient().request<Record<string, { items: PickupRedemptionItem[]; totalItems: number }>>(
    `query PickupOrders($options: PickupListOptions) {
      ${query}(options: $options) {
        items { ${REDEMPTION_FIELDS} }
        totalItems
      }
    }`,
    { options: { take: 100, skip: 0 } },
  );
  return res[query]?.items ?? [];
}

/** 店员核销自提单；成功返回凭据，失败抛对用户友好的 message */
export async function claimPickup(code: string): Promise<PickupRedemptionItem> {
  try {
    const res = await getAdminClient().request<{ claimPickupByShop: PickupRedemptionItem }>(
      `mutation ClaimPickup($code: String!) {
        claimPickupByShop(code: $code) { ${REDEMPTION_FIELDS} }
      }`,
      { code },
    );
    return res.claimPickupByShop;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '核销失败'));
  }
}