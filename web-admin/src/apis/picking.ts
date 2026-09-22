// 配货台（拣货批次）域 admin-api 调用（Task 9）
// 契约来源：cjk-plugin/src/plugin.ts 的 adminApiExtensions（Task 8 已双注册并部署到生产）
// 注意：members / pickBatchCandidates.items / shipPickBatch / updateOrderShippingAddress
// 在 SDL 里都是 JSON 标量 —— 查询/变更时只能取字段本身，不能带子选择集（否则 GRAPHQL_VALIDATION_FAILED）。
import { getAdminClient, graphQlErrorMsg } from './client';

export type PickBatchState = 'PENDING' | 'PICKED' | 'PRINTED' | 'SHIPPED' | 'CANCELLED';

export interface PickBatch {
  id: string;
  code: string;
  stockLocationId: number;
  state: PickBatchState | string;
  note?: string | null;
  createdBy?: string | null;
  memberCount: number;
  itemCount: number;
  pickedAt?: string | null;
  printedAt?: string | null;
  shippedAt?: string | null;
  createdAt: string;
}

/** 候选订单 / 批次成员共用的订单快照（pick-batch.service.ts snapshotOrder） */
export interface PickOrderSnapshot {
  id: string;
  code: string;
  state: string;
  customerName?: string | null;
  phoneNumber?: string | null;
  province?: string | null;
  city?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  postalCode?: string | null;
  address: string;
  itemCount: number;
  recommendedStockLocationId?: string | null;
  distanceKm?: number | null;
  inBatchId?: string | null;
  inBatchCode?: string | null;
}

/** 拣货单行（按 SKU 汇总，含库位/库区与拣货路径序号） */
export interface PickBatchPickingRow {
  sku: string;
  name: string;
  qty: number;
  orderCodes: string[];
  binCode?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  pathIndex: number;
}

export interface ShipPickBatchResult {
  succeeded: Array<{ orderId: string; code: string; fulfillmentId: string | null }>;
  failed: Array<{ orderId: string; code: string; reason: string }>;
}

export interface PickBatchListOptions {
  page?: number;
  pageSize?: number;
  state?: string | null;
  stockLocationId?: string | number | null;
}

const PICK_BATCH_FIELDS = `
  id code stockLocationId state note createdBy memberCount itemCount
  pickedAt printedAt shippedAt createdAt
`;

function normalizeOptions(options: PickBatchListOptions): Record<string, any> {
  const out: Record<string, any> = {};
  if (options.page !== undefined) out.page = options.page;
  if (options.pageSize !== undefined) out.pageSize = options.pageSize;
  if (options.state) out.state = options.state;
  if (options.stockLocationId !== undefined && options.stockLocationId !== null && options.stockLocationId !== '') {
    out.stockLocationId = String(options.stockLocationId);
  }
  return out;
}

/** 批次列表（分页 + 状态/仓筛选） */
export async function fetchPickBatches(
  options: PickBatchListOptions = {},
): Promise<{ totalItems: number; items: PickBatch[] }> {
  try {
    const { pickBatches } = await getAdminClient().request<{
      pickBatches: { totalItems: number; items: PickBatch[] };
    }>(
      `query PickBatches($options: PickBatchListOptions) {
        pickBatches(options: $options) {
          totalItems
          items {${PICK_BATCH_FIELDS}}
        }
      }`,
      { options: normalizeOptions(options) },
    );
    return { totalItems: pickBatches?.totalItems ?? 0, items: pickBatches?.items ?? [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '批次列表查询失败'));
  }
}

/** 批次详情（含 members 订单快照，members 为 JSON 标量 -> 单独取回再挂到 PickBatch 上） */
export async function fetchPickBatch(id: string): Promise<(PickBatch & { members?: PickOrderSnapshot[] | null }) | null> {
  try {
    const { pickBatch } = await getAdminClient().request<{
      pickBatch: (PickBatch & { members?: PickOrderSnapshot[] | null }) | null;
    }>(
      `query PickBatch($id: ID!) {
        pickBatch(id: $id) {
          ${PICK_BATCH_FIELDS}
          members
        }
      }`,
      { id },
    );
    return pickBatch;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '批次详情查询失败'));
  }
}

/** 批次成员订单快照（pickBatch.members） */
export async function fetchPickBatchMembers(id: string): Promise<PickOrderSnapshot[]> {
  const batch = await fetchPickBatch(id);
  return (batch?.members ?? []) as PickOrderSnapshot[];
}

/** 拣货单行（按 SKU 汇总，含库位/库区与路径序号） */
export async function fetchPickBatchPickingList(id: string): Promise<PickBatchPickingRow[]> {
  try {
    const { pickBatchPickingList } = await getAdminClient().request<{
      pickBatchPickingList: PickBatchPickingRow[];
    }>(
      `query PickBatchPickingList($id: ID!) {
        pickBatchPickingList(id: $id) {
          sku name qty orderCodes binCode zoneCode zoneName pathIndex
        }
      }`,
      { id },
    );
    return pickBatchPickingList ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '拣货单查询失败'));
  }
}

/** 待发货候选订单（默认 PaymentAuthorized / WaitingForShipping，带就近仓推荐与在批次标记） */
export async function fetchPickBatchCandidates(
  options: PickBatchListOptions = {},
): Promise<{ totalItems: number; items: PickOrderSnapshot[] }> {
  try {
    const { pickBatchCandidates } = await getAdminClient().request<{
      pickBatchCandidates: { totalItems: number; items: PickOrderSnapshot[] };
    }>(
      `query PickBatchCandidates($options: PickBatchListOptions) {
        pickBatchCandidates(options: $options) {
          totalItems
          items
        }
      }`,
      { options: normalizeOptions(options) },
    );
    return {
      totalItems: pickBatchCandidates?.totalItems ?? 0,
      items: (pickBatchCandidates?.items ?? []) as PickOrderSnapshot[],
    };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '候选订单查询失败'));
  }
}

/** 新建批次（服务端校验：同订单不得同时存在于两个非终态批次） */
export async function createPickBatch(input: {
  stockLocationId: string | number;
  orderIds: string[];
  note?: string;
}): Promise<PickBatch> {
  try {
    const { createPickBatch } = await getAdminClient().request<{ createPickBatch: PickBatch }>(
      `mutation CreatePickBatch($input: CreatePickBatchInput!) {
        createPickBatch(input: $input) {${PICK_BATCH_FIELDS}}
      }`,
      {
        input: {
          stockLocationId: String(input.stockLocationId),
          orderIds: input.orderIds.map(String),
          note: input.note ?? null,
        },
      },
    );
    return createPickBatch;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '新建批次失败'));
  }
}

/** 加单到批次（仅 PENDING / PICKED 可加） */
export async function addOrdersToPickBatch(batchId: string, orderIds: string[]): Promise<PickBatch> {
  try {
    const { addOrdersToPickBatch } = await getAdminClient().request<{ addOrdersToPickBatch: PickBatch }>(
      `mutation AddOrdersToPickBatch($batchId: ID!, $orderIds: [ID!]!) {
        addOrdersToPickBatch(batchId: $batchId, orderIds: $orderIds) {${PICK_BATCH_FIELDS}}
      }`,
      { batchId, orderIds: orderIds.map(String) },
    );
    return addOrdersToPickBatch;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加单失败'));
  }
}

/** 从批次移除订单（仅 PENDING / PICKED 可移除） */
export async function removeOrdersFromPickBatch(batchId: string, orderIds: string[]): Promise<PickBatch> {
  try {
    const { removeOrdersFromPickBatch } = await getAdminClient().request<{ removeOrdersFromPickBatch: PickBatch }>(
      `mutation RemoveOrdersFromPickBatch($batchId: ID!, $orderIds: [ID!]!) {
        removeOrdersFromPickBatch(batchId: $batchId, orderIds: $orderIds) {${PICK_BATCH_FIELDS}}
      }`,
      { batchId, orderIds: orderIds.map(String) },
    );
    return removeOrdersFromPickBatch;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '移除订单失败'));
  }
}

/** 状态推进（服务端做状态机合法性校验，非法迁移返回明确原因） */
export async function advancePickBatchState(batchId: string, to: PickBatchState | string): Promise<PickBatch> {
  try {
    const { advancePickBatchState } = await getAdminClient().request<{ advancePickBatchState: PickBatch }>(
      `mutation AdvancePickBatchState($batchId: ID!, $to: String!) {
        advancePickBatchState(batchId: $batchId, to: $to) {${PICK_BATCH_FIELDS}}
      }`,
      { batchId, to },
    );
    return advancePickBatchState;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '状态推进失败'));
  }
}

/** 取消批次（成员订单释放回待发货池） */
export async function cancelPickBatch(batchId: string): Promise<PickBatch> {
  try {
    const { cancelPickBatch } = await getAdminClient().request<{ cancelPickBatch: PickBatch }>(
      `mutation CancelPickBatch($batchId: ID!) {
        cancelPickBatch(batchId: $batchId) {${PICK_BATCH_FIELDS}}
      }`,
      { batchId },
    );
    return cancelPickBatch;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '取消批次失败'));
  }
}

/** 批量发货：逐单独立 fulfillment；全部成功才置 SHIPPED，有失败则返回失败清单 */
export async function shipPickBatch(
  batchId: string,
  input: { method: string; trackingCode?: string },
): Promise<ShipPickBatchResult> {
  try {
    const { shipPickBatch } = await getAdminClient().request<{ shipPickBatch: ShipPickBatchResult }>(
      `mutation ShipPickBatch($batchId: ID!, $input: ShipPickBatchInput!) {
        shipPickBatch(batchId: $batchId, input: $input)
      }`,
      {
        batchId,
        input: { method: input.method, trackingCode: input.trackingCode ?? null },
      },
    );
    return {
      succeeded: shipPickBatch?.succeeded ?? [],
      failed: shipPickBatch?.failed ?? [],
    };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '批量发货失败'));
  }
}

/** 改订单收货地址（只写 OrderAddress，不重算运费） */
export async function updateOrderShippingAddress(
  orderId: string,
  input: {
    fullName?: string;
    phoneNumber?: string;
    province?: string;
    city?: string;
    streetLine1?: string;
    streetLine2?: string;
    postalCode?: string;
    countryCode?: string;
  },
): Promise<{ id: string; code: string; shippingAddress: Record<string, any> }> {
  try {
    const { updateOrderShippingAddress } = await getAdminClient().request<{
      updateOrderShippingAddress: { id: string; code: string; shippingAddress: Record<string, any> };
    }>(
      `mutation UpdateOrderShippingAddress($orderId: ID!, $input: OrderAddressInput!) {
        updateOrderShippingAddress(orderId: $orderId, input: $input)
      }`,
      { orderId, input },
    );
    return updateOrderShippingAddress;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '地址保存失败'));
  }
}