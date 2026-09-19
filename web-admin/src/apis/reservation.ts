// 预留单 admin-api 客户端（对齐 stock-reservation.admin.resolver 的 SDL）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface ReservationItem {
  id: string; reservationId: string; stockLocationId: string;
  qty: number; fulfillType: string; status: string;
}
export interface Reservation {
  id: string; orderId: string; orderLineId: string; variantId: string;
  totalQty: number; status: string; tenantChannelId: string | null;
  createdAt: string; items: ReservationItem[];
}

export async function fetchReservationByOrder(orderId: string): Promise<Reservation[]> {
  const c = getAdminClient();
  try {
    const r = await c.request<{ reservations: { items: Reservation[]; totalItems: number } }>(
      `query ($orderId: ID) { reservations(orderId: $orderId, pageSize: 100) { totalItems items {
        id orderId orderLineId variantId totalQty status tenantChannelId createdAt
        items { id reservationId stockLocationId qty fulfillType status }
      } } }`,
      { orderId },
    );
    return r.reservations.items ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '预留单查询失败'));
  }
}
