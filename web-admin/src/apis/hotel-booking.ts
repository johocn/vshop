// 酒店预订管理 API（admin-api GraphQL，P3 Task 13；参照 hotel-inventory.ts 封装）
// 数据源：cjk-plugin hotelBookings/hotelBookingCheckIn/hotelBookingComplete/hotelBookingForceCancel
import { getAdminClient } from './client';

export interface HotelBookingRow {
  id: string;
  orderId: string;
  orderLineId: string;
  orderCode: string | null;
  productVariantId: string;
  variantName: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
  roomCount: number;
  status: string; // pendingDeposit | confirmed | checkedIn | completed | cancelled | noShow
  ratePlanCode: string | null;
  totalCent: number;
  guestName: string | null;
  guestPhone: string | null;
  bookingCode: string | null;
  cancelDeadlineAt: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

const BOOKING_FIELDS = `id orderId orderLineId orderCode productVariantId variantName checkIn checkOut nights roomCount status ratePlanCode totalCent guestName guestPhone bookingCode cancelDeadlineAt confirmedAt checkedInAt completedAt cancelledAt cancelReason createdAt`;

/** 简版列表（后端 id DESC 上限 200，一次拉全；total=items.length 不分页） */
export async function fetchHotelBookings(
  filter: { status?: string | null } = {},
): Promise<{ items: HotelBookingRow[]; total: number }> {
  const res = await getAdminClient().request<{ hotelBookings: HotelBookingRow[] }>(
    `query HotelBookings($status: String) {
      hotelBookings(filter: { status: $status }) { ${BOOKING_FIELDS} }
    }`,
    { status: filter.status ?? null },
  );
  const items = res.hotelBookings ?? [];
  return { items, total: items.length };
}

/** 取 GraphQL 错误首条消息（UserInputError 等） */
export function gqlErrMsg(e: unknown): string {
  return (
    (e as any)?.response?.errors?.[0]?.message ??
    (e as any)?.message ??
    String(e)
  );
}

/** 到店核销：凭 8 位入住码（后端校验 confirmed 且当日 ∈ [checkIn, checkOut)） */
export async function checkInBooking(code: string): Promise<HotelBookingRow> {
  const res = await getAdminClient().request<{ hotelBookingCheckIn: HotelBookingRow }>(
    `mutation HotelBookingCheckIn($code: String!) {
      hotelBookingCheckIn(code: $code) { ${BOOKING_FIELDS} }
    }`,
    { code: String(code ?? '').trim() },
  );
  return res.hotelBookingCheckIn;
}

/** 完成离店（仅 checkedIn） */
export async function completeBooking(id: string): Promise<HotelBookingRow> {
  const res = await getAdminClient().request<{ hotelBookingComplete: HotelBookingRow }>(
    `mutation HotelBookingComplete($id: ID!) {
      hotelBookingComplete(id: $id) { ${BOOKING_FIELDS} }
    }`,
    { id },
  );
  return res.hotelBookingComplete;
}

/** 强制取消（pendingDeposit/confirmed → cancelled 并释放锁房；退款走 Task 14 售后单） */
export async function forceCancelBooking(id: string, reason?: string): Promise<HotelBookingRow> {
  const res = await getAdminClient().request<{ hotelBookingForceCancel: HotelBookingRow }>(
    `mutation HotelBookingForceCancel($id: ID!, $reason: String) {
      hotelBookingForceCancel(id: $id, reason: $reason) { ${BOOKING_FIELDS} }
    }`,
    { id, reason: reason ?? null },
  );
  return res.hotelBookingForceCancel;
}
