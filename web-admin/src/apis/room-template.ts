// 房型模板库 API（admin-api GraphQL，参照同目录 tenant-admin.ts 的 getAdminClient 封装）
import { getAdminClient } from './client';

export interface RoomTemplate {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  coverAssetId?: string | null;
  specs?: Record<string, any> | null;
  defaultRooms?: Array<Record<string, any>> | null;
  basePriceCent: number;
  priceCalendar?: Array<Record<string, any>> | null;
  longStayDiscount?: Array<Record<string, any>> | null;
  minNights: number;
  maxNights: number;
  advanceDays: number;
  checkInTime: string;
  checkOutTime: string;
  cancelPolicy: Record<string, any>;
  depositType: string;
}

const ROOM_TEMPLATE_FIELDS = `id code name enabled sortOrder coverAssetId specs defaultRooms basePriceCent priceCalendar longStayDiscount minNights maxNights advanceDays checkInTime checkOutTime cancelPolicy depositType`;

export async function fetchRoomTemplates(): Promise<RoomTemplate[]> {
  const res = await getAdminClient().request<{ roomTemplates: RoomTemplate[] }>(
    `query RoomTemplates { roomTemplates { ${ROOM_TEMPLATE_FIELDS} } }`,
  );
  return res.roomTemplates ?? [];
}

export async function createRoomTemplate(input: Record<string, any>): Promise<RoomTemplate> {
  const res = await getAdminClient().request<{ createRoomTemplate: RoomTemplate }>(
    `mutation CreateRoomTemplate($input: RoomTemplateInput!) { createRoomTemplate(input: $input) { ${ROOM_TEMPLATE_FIELDS} } }`,
    { input },
  );
  return res.createRoomTemplate;
}

export async function updateRoomTemplate(id: string, input: Record<string, any>): Promise<RoomTemplate> {
  const res = await getAdminClient().request<{ updateRoomTemplate: RoomTemplate }>(
    `mutation UpdateRoomTemplate($id: ID!, $input: RoomTemplateInput!) { updateRoomTemplate(id: $id, input: $input) { ${ROOM_TEMPLATE_FIELDS} } }`,
    { id, input },
  );
  return res.updateRoomTemplate;
}

export async function deleteRoomTemplate(id: string): Promise<boolean> {
  const res = await getAdminClient().request<{ deleteRoomTemplate: boolean }>(
    `mutation DeleteRoomTemplate($id: ID!) { deleteRoomTemplate(id: $id) }`,
    { id },
  );
  return res.deleteRoomTemplate;
}

// ---- 商品变体酒店配置（商品编辑页接入，Task 7）----

/** 读取变体的 hotelRoomConfig 快照（未配置返回 null） */
export async function fetchVariantHotelConfig(
  variantId: string,
): Promise<Record<string, any> | null> {
  const res = await getAdminClient().request<{
    productVariant: { customFields: { hotelRoomConfig?: Record<string, any> | null } } | null;
  }>(
    `query VariantHotelConfig($id: ID!) {
      productVariant(id: $id) { customFields { hotelRoomConfig } }
    }`,
    { id: variantId },
  );
  return res.productVariant?.customFields?.hotelRoomConfig ?? null;
}

/** 套用房型模板 → 后端深拷贝快照进变体 customFields.hotelRoomConfig（模板后续修改不影响本变体） */
export async function applyRoomTemplate(variantId: string, templateId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ applyRoomTemplate: boolean }>(
    `mutation ApplyRoomTemplate($variantId: ID!, $templateId: ID!) {
      applyRoomTemplate(variantId: $variantId, templateId: $templateId)
    }`,
    { variantId, templateId },
  );
  return !!res.applyRoomTemplate;
}

/**
 * 局部更新变体酒店配置：patch 并入该变体现有 customFields.hotelRoomConfig 后整体写回。
 * 无现成变体 customFields 专用接口，复用 Vendure 标准 updateProductVariants mutation。
 */
export async function updateVariantHotelConfig(
  variantId: string,
  patch: Record<string, any>,
): Promise<boolean> {
  const existing = (await fetchVariantHotelConfig(variantId)) ?? {};
  const merged = { ...existing, ...patch };
  const res = await getAdminClient().request<{
    updateProductVariants: Array<{ id: string }>;
  }>(
    `mutation UpdateVariantHotelConfig($input: [UpdateProductVariantInput!]!) {
      updateProductVariants(input: $input) { id }
    }`,
    { input: [{ id: variantId, customFields: { hotelRoomConfig: merged } }] },
  );
  return !!res.updateProductVariants?.length;
}
