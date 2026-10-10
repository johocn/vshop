// 积分商城 admin-api 调用（schema 以 docs/superpowers/plans/2026-10-10-points-mall-favorites.md adminSchema 为准）
//   - Query pointsProductsAdmin(options { skip, take }) / pointsOrdersAdmin(options { skip, take, status })
//   - Mutation createPointsProduct / updatePointsProduct / deletePointsProduct（Boolean）
//     markPointsOrderPaid / markPointsOrderShipped(id, trackingNo?) / markPointsOrderCompleted
//   - PointsProductAdmin { id productId variantId pointsPrice cashPrice deliveryType stock perUserLimit redeemedCount validFrom validTo status sortOrder }
//   - PointsOrderAdmin { id code customerId quantity pointsTotal cashTotal deliveryType status productSnapshot addressSnapshot trackingNo paidAt shippedAt completedAt createdAt }
//   - cashPrice/cashTotal 单位为分；deliveryType 'physical'|'virtual'；status 'enabled'|'disabled'
//   - update 不支持修改 productId / variantId（仅价格、库存、有效期、状态等）
import { getAdminClient, graphQlErrorMsg } from './client';

export type PointsDeliveryType = 'physical' | 'virtual';
export type PointsProductStatus = 'enabled' | 'disabled';
export type PointsOrderStatus = 'pending_payment' | 'pending_ship' | 'shipped' | 'completed' | 'cancelled';

export interface PointsProductRow {
  id: string;
  productId: string;
  variantId: string;
  pointsPrice: number;
  cashPrice: number;
  deliveryType: PointsDeliveryType | string;
  stock: number;
  perUserLimit: number;
  redeemedCount: number;
  validFrom?: string | null;
  validTo?: string | null;
  status: PointsProductStatus | string;
  sortOrder: number;
}

export interface PointsProductInput {
  productId: string;
  variantId: string;
  pointsPrice: number;
  cashPrice?: number | null;
  deliveryType: PointsDeliveryType | string;
  stock: number;
  perUserLimit?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  status?: PointsProductStatus | string;
  sortOrder?: number;
}

export interface PointsProductUpdateInput extends Partial<Omit<PointsProductInput, 'productId' | 'variantId'>> {
  id: string;
}

export interface PointsOrderRow {
  id: string;
  code: string;
  customerId: string;
  quantity: number;
  pointsTotal: number;
  cashTotal: number;
  deliveryType: PointsDeliveryType | string;
  status: PointsOrderStatus | string;
  productSnapshot?: Record<string, any> | null;
  addressSnapshot?: Record<string, any> | null;
  trackingNo?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
}

const PRODUCT_FIELDS = `id productId variantId pointsPrice cashPrice deliveryType stock perUserLimit redeemedCount validFrom validTo status sortOrder`;
const ORDER_FIELDS = `id code customerId quantity pointsTotal cashTotal deliveryType status productSnapshot addressSnapshot trackingNo paidAt shippedAt completedAt createdAt`;

export async function fetchPointsProductsAdmin(options: { skip?: number; take?: number; keyword?: string | null } = {}): Promise<{ items: PointsProductRow[]; total: number }> {
  const skip = options.skip ?? 0;
  const take = options.take ?? 100;
  const keyword = options.keyword || null;
  try {
    const { pointsProductsAdmin } = await getAdminClient().request<{ pointsProductsAdmin: { items: PointsProductRow[]; totalItems: number } }>(
      `query PointsProductsAdmin($skip: Int, $take: Int, $keyword: String) {
        pointsProductsAdmin(options: { skip: $skip, take: $take, keyword: $keyword }) { items { ${PRODUCT_FIELDS} } totalItems }
      }`,
      { skip, take, keyword },
    );
    return { items: pointsProductsAdmin?.items ?? [], total: pointsProductsAdmin?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载积分商品失败'));
  }
}

export async function createPointsProduct(input: PointsProductInput): Promise<PointsProductRow> {
  try {
    const { createPointsProduct } = await getAdminClient().request<{ createPointsProduct: PointsProductRow }>(
      `mutation CreatePointsProduct($input: CreatePointsProductInput!) { createPointsProduct(input: $input) { ${PRODUCT_FIELDS} } }`,
      { input },
    );
    return createPointsProduct;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '新增积分商品失败'));
  }
}

export async function updatePointsProduct(input: PointsProductUpdateInput): Promise<PointsProductRow> {
  try {
    const { updatePointsProduct } = await getAdminClient().request<{ updatePointsProduct: PointsProductRow }>(
      `mutation UpdatePointsProduct($input: UpdatePointsProductInput!) { updatePointsProduct(input: $input) { ${PRODUCT_FIELDS} } }`,
      { input },
    );
    return updatePointsProduct;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '更新积分商品失败'));
  }
}

export async function deletePointsProduct(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deletePointsProduct: boolean }>(
      `mutation DeletePointsProduct($id: ID!) { deletePointsProduct(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除积分商品失败'));
  }
}

export async function fetchPointsOrdersAdmin(options: { skip?: number; take?: number; status?: string | null; keyword?: string | null } = {}): Promise<{ items: PointsOrderRow[]; total: number }> {
  const skip = options.skip ?? 0;
  const take = options.take ?? 20;
  const status = options.status ?? null;
  const keyword = options.keyword || null;
  try {
    const { pointsOrdersAdmin } = await getAdminClient().request<{ pointsOrdersAdmin: { items: PointsOrderRow[]; totalItems: number } }>(
      `query PointsOrdersAdmin($skip: Int, $take: Int, $status: String, $keyword: String) {
        pointsOrdersAdmin(options: { skip: $skip, take: $take, status: $status, keyword: $keyword }) { items { ${ORDER_FIELDS} } totalItems }
      }`,
      { skip, take, status, keyword },
    );
    return { items: pointsOrdersAdmin?.items ?? [], total: pointsOrdersAdmin?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载积分订单失败'));
  }
}

export async function markPointsOrderPaid(id: string): Promise<PointsOrderRow> {
  try {
    const { markPointsOrderPaid } = await getAdminClient().request<{ markPointsOrderPaid: PointsOrderRow }>(
      `mutation MarkPointsOrderPaid($id: ID!) { markPointsOrderPaid(id: $id) { ${ORDER_FIELDS} } }`,
      { id },
    );
    return markPointsOrderPaid;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '标记收款失败'));
  }
}

export async function markPointsOrderShipped(id: string, trackingNo?: string | null): Promise<PointsOrderRow> {
  try {
    const { markPointsOrderShipped } = await getAdminClient().request<{ markPointsOrderShipped: PointsOrderRow }>(
      `mutation MarkPointsOrderShipped($id: ID!, $trackingNo: String) { markPointsOrderShipped(id: $id, trackingNo: $trackingNo) { ${ORDER_FIELDS} } }`,
      { id, trackingNo: trackingNo || null },
    );
    return markPointsOrderShipped;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '标记发货失败'));
  }
}

export async function markPointsOrderCompleted(id: string): Promise<PointsOrderRow> {
  try {
    const { markPointsOrderCompleted } = await getAdminClient().request<{ markPointsOrderCompleted: PointsOrderRow }>(
      `mutation MarkPointsOrderCompleted($id: ID!) { markPointsOrderCompleted(id: $id) { ${ORDER_FIELDS} } }`,
      { id },
    );
    return markPointsOrderCompleted;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '标记完成失败'));
  }
}
