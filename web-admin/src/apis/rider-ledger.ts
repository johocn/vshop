// 骑手分成台账 + 轨迹查询（schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准）
//   - Query campusRiderEarnings(from, to, riderCustomerId, status, orderCode, skip, take): CampusRiderEarningList
//   - Query campusOrderRiderTrack(orderId): CampusRiderTrack
//   - Query campusRiderTrack(riderCustomerId, from, to): CampusRiderTrack
//   - 金额单位：分；日期参数为 YYYY-MM-DD（东八区自然日）
import { getAdminClient } from './client';

export interface RiderEarningRow {
  id: string;
  orderId: string;
  orderCode?: string | null;
  riderCustomerId: string;
  riderName: string;
  amount: number;
  tip: number;
  status: 'credited' | 'pending' | 'crediting' | string;
  createdAt: string;
}

export interface RiderEarningPage {
  items: RiderEarningRow[];
  total: number;
  sumAmount: number;
  sumTip: number;
}

const EARNING_FIELDS = `
  id orderId orderCode riderCustomerId riderName amount tip status createdAt
`;

export async function fetchRiderEarnings(p: {
  from?: string;
  to?: string;
  riderCustomerId?: string;
  status?: string;
  orderCode?: string;
  skip?: number;
  take?: number;
}): Promise<RiderEarningPage> {
  const { campusRiderEarnings } = await getAdminClient().request<{ campusRiderEarnings: RiderEarningPage }>(
    `query CampusRiderEarnings($from: String, $to: String, $riderCustomerId: ID, $status: String, $orderCode: String, $skip: Int, $take: Int) {
      campusRiderEarnings(from: $from, to: $to, riderCustomerId: $riderCustomerId, status: $status, orderCode: $orderCode, skip: $skip, take: $take) {
        items { ${EARNING_FIELDS} }
        total sumAmount sumTip
      }
    }`,
    {
      from: p.from || null,
      to: p.to || null,
      riderCustomerId: p.riderCustomerId || null,
      status: p.status || null,
      orderCode: p.orderCode || null,
      skip: p.skip ?? 0,
      take: p.take ?? 20,
    },
  );
  return {
    items: campusRiderEarnings?.items ?? [],
    total: campusRiderEarnings?.total ?? 0,
    sumAmount: campusRiderEarnings?.sumAmount ?? 0,
    sumTip: campusRiderEarnings?.sumTip ?? 0,
  };
}

export interface RiderTrackPoint {
  id: string;
  orderId: string;
  orderCode?: string | null;
  riderCustomerId: string;
  lat: number;
  lng: number;
  reportedAt: string;
}

export interface RiderTrack {
  orderId?: string | null;
  orderCode?: string | null;
  riderCustomerId?: string | null;
  riderName?: string | null;
  points: RiderTrackPoint[];
  distanceMeters: number;
  truncated: boolean;
}

const TRACK_FIELDS = `
  orderId orderCode riderCustomerId riderName distanceMeters truncated
  points { id orderId orderCode riderCustomerId lat lng reportedAt }
`;

/** 订单维度轨迹：orderId / orderCode 二选一（订单号优先，支持 #A1024 形式） */
export async function fetchOrderRiderTrack(p: { orderId?: string; orderCode?: string }): Promise<RiderTrack> {
  const { campusOrderRiderTrack } = await getAdminClient().request<{ campusOrderRiderTrack: RiderTrack }>(
    `query CampusOrderRiderTrack($orderId: ID, $orderCode: String) {
      campusOrderRiderTrack(orderId: $orderId, orderCode: $orderCode) { ${TRACK_FIELDS} }
    }`,
    { orderId: p.orderId || null, orderCode: p.orderCode || null },
  );
  return campusOrderRiderTrack;
}

export async function fetchRiderTrack(riderCustomerId: string, from: string, to: string): Promise<RiderTrack> {
  const { campusRiderTrack } = await getAdminClient().request<{ campusRiderTrack: RiderTrack }>(
    `query CampusRiderTrack($riderCustomerId: ID!, $from: String!, $to: String!) {
      campusRiderTrack(riderCustomerId: $riderCustomerId, from: $from, to: $to) { ${TRACK_FIELDS} }
    }`,
    { riderCustomerId, from, to },
  );
  return campusRiderTrack;
}
