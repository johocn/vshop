// 预留单 admin-api 客户端（对齐 stock-reservation.admin.resolver 的 SDL）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface ReservationItem {
  id: string; reservationId: string; stockLocationId: string;
  qty: number; fulfillType: string; status: string;
}
export interface Reservation {
  id: string; orderId: string; orderLineId: string; variantId: string;
  totalQty: number; status: string; tenantChannelId: string | null;
  createdAt: string; expiresAt: string | null; items: ReservationItem[];
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

export interface ReservationListParams {
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 预留单列表。注意：**不要**带 `items { ... }` 子选择集 ——
 * `reservations` resolver 返回的是实体列表，`Reservation.items` 在 SDL 里是非空列表但列表接口不装配它，
 * 带子选择集会被 GraphQL 以 non-null 违例报错（详情走 `reservation(id)`，它显式拼了 items）。
 */
export async function fetchReservations(
  params: ReservationListParams = {},
): Promise<{ totalItems: number; items: Reservation[] }> {
  const c = getAdminClient();
  try {
    const r = await c.request<{ reservations: { totalItems: number; items: Reservation[] } }>(
      `query ($status: String, $page: Int, $pageSize: Int) {
        reservations(status: $status, page: $page, pageSize: $pageSize) {
          totalItems
          items { id orderId orderLineId variantId totalQty status tenantChannelId createdAt expiresAt }
        }
      }`,
      { status: params.status ?? null, page: params.page ?? 1, pageSize: params.pageSize ?? 20 },
    );
    return r.reservations ?? { totalItems: 0, items: [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '预留单查询失败'));
  }
}

/** 手动释放（后端 releaseReservation(id) → service.release(returnPhysical:false)） */
export async function releaseReservationAdmin(id: string): Promise<Reservation> {
  const c = getAdminClient();
  try {
    const r = await c.request<{ releaseReservation: Reservation }>(
      `mutation ($id: ID!) {
        releaseReservation(id: $id) { id orderId orderLineId variantId totalQty status tenantChannelId createdAt expiresAt }
      }`,
      { id },
    );
    return r.releaseReservation;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '预留单释放失败'));
  }
}
