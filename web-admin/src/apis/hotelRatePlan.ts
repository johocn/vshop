// 酒店房价方案管理 API（admin-api GraphQL，P2 Task 9；参照 hotel-inventory.ts 封装）
// 契约：HotelRatePlanInput 全字段可选；update 未传字段沿用现值，memberOnly/dateFrom/dateTo/cancelPolicyOverride 显式 null = 清除
import { getAdminClient } from './client';

export interface HotelRatePlan {
  id: string;
  productVariantId: string;
  code: string;
  name: string;
  adjustType: string; // discount | fixed | surcharge
  adjustValue: number; // discount 千分比（900 = ×0.9）；fixed/surcharge 分
  memberOnly: string | null; // 数字字符串会员等级门槛；null = 全员
  dateFrom: string | null; // YYYY-MM-DD（以入住日为准，含两端）；null = 长期
  dateTo: string | null;
  cancelPolicyOverride: string | null; // JSON {type:'freeUntil'|'nonRefundable', freeUntilHours?}
  enabled: boolean;
}

export interface HotelRatePlanInput {
  code?: string;
  name?: string;
  adjustType?: string;
  adjustValue?: number;
  memberOnly?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  cancelPolicyOverride?: string | null;
  enabled?: boolean;
}

const PLAN_FIELDS = `id productVariantId code name adjustType adjustValue memberOnly dateFrom dateTo cancelPolicyOverride enabled`;

export async function fetchHotelRatePlans(variantId: string): Promise<HotelRatePlan[]> {
  const res = await getAdminClient().request<{ hotelRatePlans: HotelRatePlan[] }>(
    `query HotelRatePlans($variantId: ID!) {
      hotelRatePlans(variantId: $variantId) { ${PLAN_FIELDS} }
    }`,
    { variantId },
  );
  return res.hotelRatePlans ?? [];
}

export async function createHotelRatePlan(variantId: string, input: HotelRatePlanInput): Promise<HotelRatePlan> {
  const res = await getAdminClient().request<{ createHotelRatePlan: HotelRatePlan }>(
    `mutation CreateHotelRatePlan($variantId: ID!, $input: HotelRatePlanInput!) {
      createHotelRatePlan(variantId: $variantId, input: $input) { ${PLAN_FIELDS} }
    }`,
    { variantId, input },
  );
  return res.createHotelRatePlan;
}

export async function updateHotelRatePlan(id: string, input: HotelRatePlanInput): Promise<HotelRatePlan> {
  const res = await getAdminClient().request<{ updateHotelRatePlan: HotelRatePlan }>(
    `mutation UpdateHotelRatePlan($id: ID!, $input: HotelRatePlanInput!) {
      updateHotelRatePlan(id: $id, input: $input) { ${PLAN_FIELDS} }
    }`,
    { id, input },
  );
  return res.updateHotelRatePlan;
}

export async function deleteHotelRatePlan(id: string): Promise<boolean> {
  const res = await getAdminClient().request<{ deleteHotelRatePlan: boolean }>(
    `mutation DeleteHotelRatePlan($id: ID!) {
      deleteHotelRatePlan(id: $id)
    }`,
    { id },
  );
  return res.deleteHotelRatePlan;
}
