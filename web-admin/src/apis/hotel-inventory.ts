// 酒店房量管理 API（admin-api GraphQL，P1 Task 4；参照同目录 room-template.ts 封装）
import { getAdminClient } from './client';

export interface HotelRoomDay {
  id: string;
  productVariantId: string;
  date: string; // YYYY-MM-DD
  totalRooms: number;
  closed: boolean;
}

export interface HotelAvailabilityDay {
  date: string;
  priceCent: number;
  dayType: string; // weekday | weekend | holiday | custom
  remaining: number | null; // null = 不限房
  closed: boolean;
}

export async function fetchHotelRoomDays(variantId: string, month: string): Promise<HotelRoomDay[]> {
  const res = await getAdminClient().request<{ hotelRoomDays: HotelRoomDay[] }>(
    `query HotelRoomDays($variantId: ID!, $month: String!) {
      hotelRoomDays(variantId: $variantId, month: $month) { id productVariantId date totalRooms closed }
    }`,
    { variantId, month },
  );
  return res.hotelRoomDays ?? [];
}

export async function fetchHotelAvailability(
  variantId: string,
  from: string,
  to: string,
): Promise<HotelAvailabilityDay[]> {
  const res = await getAdminClient().request<{ hotelAvailability: HotelAvailabilityDay[] }>(
    `query HotelAvailability($variantId: ID!, $from: String!, $to: String!) {
      hotelAvailability(variantId: $variantId, from: $from, to: $to) { date priceCent dayType remaining closed }
    }`,
    { variantId, from, to },
  );
  return res.hotelAvailability ?? [];
}

export async function setHotelRoomDay(
  variantId: string,
  date: string,
  patch: { totalRooms?: number; closed?: boolean },
): Promise<HotelRoomDay> {
  const res = await getAdminClient().request<{ setHotelRoomDay: HotelRoomDay }>(
    `mutation SetHotelRoomDay($variantId: ID!, $date: String!, $totalRooms: Int, $closed: Boolean) {
      setHotelRoomDay(variantId: $variantId, date: $date, totalRooms: $totalRooms, closed: $closed) { id date totalRooms closed }
    }`,
    { variantId, date, totalRooms: patch.totalRooms ?? null, closed: patch.closed ?? null },
  );
  return res.setHotelRoomDay;
}

/** 批量 upsert [from, to] 含两端；weekdays 0-6 过滤（0=周日）；返回写入行数 */
export async function batchSetHotelRoomDays(
  variantId: string,
  from: string,
  to: string,
  patch: { totalRooms?: number; closed?: boolean; weekdays?: number[] },
): Promise<number> {
  const res = await getAdminClient().request<{ batchSetHotelRoomDays: number }>(
    `mutation BatchSetHotelRoomDays($variantId: ID!, $from: String!, $to: String!, $totalRooms: Int, $closed: Boolean, $weekdays: [Int!]) {
      batchSetHotelRoomDays(variantId: $variantId, from: $from, to: $to, totalRooms: $totalRooms, closed: $closed, weekdays: $weekdays)
    }`,
    {
      variantId,
      from,
      to,
      totalRooms: patch.totalRooms ?? null,
      closed: patch.closed ?? null,
      weekdays: patch.weekdays ?? null,
    },
  );
  return res.batchSetHotelRoomDays;
}
