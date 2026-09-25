// 售后域 admin-api 调用（schema 已按 after-sales-plugin 源码校准）
// 校准结果（vendure/packages/after-sales-plugin/src/plugin.ts + after-sales-admin.resolver.ts）：
//   - 后端 Admin 返回类型为 AfterSalesRequestAdmin，字段：id orderId orderLineId customerId type state
//     reason description evidenceImages refundAmount returnTrackingNo returnCarrier rejectReason
//     receivedQuantity restockJson refundTransactionId actualRefundAmount refundedAt refundError createdAt updatedAt
//     （注意：Admin 类型无 code 字段、无 order{}/items{} 关系，type/state 为 String 而非枚举）
//   - Admin Query 只有 afterSalesRequests(options)（无单查 afterSalesRequest，那是 Shop API 的），
//     故单查详情用列表过滤 id: { eq: $id } 实现
//   - Mutation（入参以源码为准）：
//       approveAfterSalesRequest(id: ID!)
//       rejectAfterSalesRequest(id: ID!, reason: String!)
//       confirmReturnReceived(id: ID!, receivedQuantity: Int)   —— 商家确认收货（receivedQuantity 可省略）
//       processAfterSalesRefund(id: ID!)
//       retryAfterSalesRefund(id: ID!)
//   - refundAmount / actualRefundAmount 单位是分（与 Vendure 金额一致），展示时 /100
import { getAdminClient } from './client';

export interface AfterSaleRow {
  id: string;
  orderId: string;
  orderLineId?: string | null;
  customerId?: string;
  type: string;
  state: string;
  reason?: string | null;
  description?: string | null;
  evidenceImages?: string[] | null;
  refundAmount?: number | null;
  returnTrackingNo?: string | null;
  returnCarrier?: string | null;
  rejectReason?: string | null;
  receivedQuantity?: number | null;
  restockJson?: string | null;
  refundTransactionId?: string | null;
  actualRefundAmount?: number | null;
  refundedAt?: string | null;
  refundError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const AFTER_SALE_FIELDS = `
  id orderId orderLineId customerId type state reason description
  evidenceImages refundAmount returnTrackingNo returnCarrier rejectReason
  receivedQuantity restockJson refundTransactionId actualRefundAmount
  refundedAt refundError createdAt updatedAt
`;

/** 售后工单列表（支持按 state 过滤），返回 items */
export async function fetchAfterSales(state?: string): Promise<AfterSaleRow[]> {
  const filter = state ? `, filter: { state: { eq: "${state}" } }` : '';
  const { afterSalesRequests } = await getAdminClient().request<{
    afterSalesRequests: { items: AfterSaleRow[] };
  }>(
    `query AfterSales($take: Int) {
      afterSalesRequests(options: { take: $take${filter} }) {
        items { ${AFTER_SALE_FIELDS} }
      }
    }`,
    { take: 50 },
  );
  return afterSalesRequests?.items ?? [];
}

// ---- 分页 + 筛选（第 4 轮补齐，G5） ----

export interface AfterSaleListFilter {
  /** 售后单号 / 订单号，精确匹配 */
  keyword?: string;
  /** 售后类型 = AFTER_SALE_TYPES 的 key */
  type?: string;
  /** 申请时间区间（含端点），格式 yyyy-MM-dd */
  from?: string;
  to?: string;
  /** 退款金额区间，单位分 */
  minRefund?: number;
  maxRefund?: number;
}

export type AfterSaleSortBy = 'createdAt' | 'refundAmount';

/** 把 UI 筛选态转成 Vendure 生成的 AfterSalesRequestAdminFilterParameter */
export function buildAfterSaleFilter(f: AfterSaleListFilter): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (f.type) and.push({ type: { eq: f.type } });
  if (f.from || f.to) {
    and.push({
      createdAt: {
        between: {
          start: `${f.from || '1970-01-01'}T00:00:00.000Z`,
          end: `${f.to || '2999-12-31'}T23:59:59.999Z`,
        },
      },
    });
  }
  if (f.minRefund != null || f.maxRefund != null) {
    and.push({ refundAmount: { between: { start: f.minRefund ?? 0, end: f.maxRefund ?? 2147483647 } } });
  }
  if (f.keyword) {
    const kw = f.keyword.trim();
    and.push({ _or: [{ id: { eq: kw } }, { orderId: { eq: kw } }] });
  }
  return and.length ? { _and: and } : {};
}

/** 售后分页列表：skip/take/filter/sort 全部透传给 Vendure 标准列表查询 */
export async function fetchAfterSalePage(p: {
  skip: number;
  take: number;
  filter?: Record<string, unknown>;
  sort?: Record<string, string>;
}): Promise<{ items: AfterSaleRow[]; total: number }> {
  const { afterSalesRequests } = await getAdminClient().request<{
    afterSalesRequests: { items: AfterSaleRow[]; totalItems: number };
  }>(
    `query AfterSalesPage($options: AfterSalesRequestAdminListOptions) {
      afterSalesRequests(options: $options) {
        totalItems
        items { ${AFTER_SALE_FIELDS} }
      }
    }`,
    {
      options: {
        skip: p.skip,
        take: p.take,
        ...(p.filter && Object.keys(p.filter).length ? { filter: p.filter } : {}),
        ...(p.sort ? { sort: p.sort } : {}),
      },
    },
  );
  return {
    items: afterSalesRequests?.items ?? [],
    total: afterSalesRequests?.totalItems ?? 0,
  };
}

/** 售后详情：Admin API 无单查 query，用列表过滤 id 获取单条
 *  注意：afterSalesRequests 的 filter.id / filter.orderId 后端为 String 类型（非 ID），
 *  变量必须声明为 String，否则 GraphQL 校验报 400 导致详情查不到。 */
export async function fetchAfterSale(id: string): Promise<AfterSaleRow | null> {
  const { afterSalesRequests } = await getAdminClient().request<{
    afterSalesRequests: { items: AfterSaleRow[] };
  }>(
    `query AfterSale($id: String!) {
      afterSalesRequests(options: { take: 1, filter: { id: { eq: $id } } }) {
        items { ${AFTER_SALE_FIELDS} }
      }
    }`,
    { id },
  );
  return afterSalesRequests?.items?.[0] ?? null;
}

/** 同意售后 */
export async function approveAfterSale(id: string): Promise<AfterSaleRow> {
  const { approveAfterSalesRequest } = await getAdminClient().request<{ approveAfterSalesRequest: AfterSaleRow }>(
    `mutation ApproveAfterSale($id: ID!) {
      approveAfterSalesRequest(id: $id) { ${AFTER_SALE_FIELDS} }
    }`,
    { id },
  );
  return approveAfterSalesRequest;
}

/** 拒绝售后（reason 为必填入参） */
export async function rejectAfterSale(id: string, reason: string): Promise<AfterSaleRow> {
  const { rejectAfterSalesRequest } = await getAdminClient().request<{ rejectAfterSalesRequest: AfterSaleRow }>(
    `mutation RejectAfterSale($id: ID!, $reason: String!) {
      rejectAfterSalesRequest(id: $id, reason: $reason) { ${AFTER_SALE_FIELDS} }
    }`,
    { id, reason },
  );
  return rejectAfterSalesRequest;
}

/** 确认收货退款（商家收货入库 + 状态置 Received） */
export async function confirmAfterSaleReceived(id: string): Promise<AfterSaleRow> {
  const { confirmReturnReceived } = await getAdminClient().request<{ confirmReturnReceived: AfterSaleRow }>(
    `mutation ConfirmReturnReceived($id: ID!) {
      confirmReturnReceived(id: $id) { ${AFTER_SALE_FIELDS} }
    }`,
    { id },
  );
  return confirmReturnReceived;
}

/** 执行退款 */
export async function processAfterSaleRefund(id: string): Promise<AfterSaleRow> {
  const { processAfterSalesRefund } = await getAdminClient().request<{ processAfterSalesRefund: AfterSaleRow }>(
    `mutation ProcessAfterSalesRefund($id: ID!) {
      processAfterSalesRefund(id: $id) { ${AFTER_SALE_FIELDS} }
    }`,
    { id },
  );
  return processAfterSalesRefund;
}

/** 重试退款（仅 RefundFailed 可用） */
export async function retryAfterSaleRefund(id: string): Promise<AfterSaleRow> {
  const { retryAfterSalesRefund } = await getAdminClient().request<{ retryAfterSalesRefund: AfterSaleRow }>(
    `mutation RetryAfterSalesRefund($id: ID!) {
      retryAfterSalesRefund(id: $id) { ${AFTER_SALE_FIELDS} }
    }`,
    { id },
  );
  return retryAfterSalesRefund;
}