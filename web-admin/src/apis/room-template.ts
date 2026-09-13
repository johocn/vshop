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
