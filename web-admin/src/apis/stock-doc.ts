// 库存单据（采购入库/移库/盘库/手动出库） + 库存流水 admin-api 调用
// 字段对齐后端 schema（cjk-plugin plugin.ts + stock-doc.admin.resolver.ts）：
//   - createStockDoc(input: StockDocCreateInput!): StockDoc!
//       StockDocCreateInput: { type: String!, remark, operator, items: [StockDocItemInput!]! }
//       StockDocItemInput: { variantId: ID!, fromStockLocationId: ID, toStockLocationId: ID,
//                            qty: Int!, realQty: Int, costPrice: Int, zoneId: ID, binId: ID }
//                            （zoneId/binId 为入库归位可选参数，不传则完全保持旧行为）
//   - stockMovementLedger(productVariantId, locationId, bizCode, orderLineId, page, pageSize): StockLedgerList!
//       StockLedgerEntry: { id code productVariantId stockLocationId bizType bizCode orderLineId
//                           direction quantity beforeOnHand afterOnHand otherLocationId reason createdAt }
import { getAdminClient } from './client';

export type StockDocType = 'PURCHASE' | 'TRANSFER' | 'STOCKTAKE' | 'ISSUE';

/**
 * 手工调数单据备注的**语言无关前缀**（D43）。
 * 库存明细页「调整」走 `createStockDoc(type:'STOCKTAKE')`，与「盘点任务过账单」同 type；
 * 若要按备注区分两者，备注后半段的本地化文案会随语言变化（切英文站即失效），
 * 故固定一个 ASCII 前缀作为稳定判据，本地化文案只作可读性后缀。
 */
export const MANUAL_ADJUST_REMARK_FLAG = 'MANUAL-ADJUST';

export interface StockDocItemInput {
  variantId: string;
  fromStockLocationId?: string;
  toStockLocationId?: string;
  qty: number;
  realQty?: number;
  costPrice?: number;
  /** 入库归位：库区（zone/bin 档均可传；仅传 binId 时服务端自行推导 zoneId） */
  zoneId?: string;
  /** 入库归位：库位（仅 bin 档传） */
  binId?: string;
}

export interface StockDocCreateInput {
  type: StockDocType;
  remark?: string;
  items: StockDocItemInput[];
}

export interface StockDoc {
  id: string;
  code: string;
  type: string;
  remark: string | null;
  operator: string | null;
  createdAt: string;
}

export async function createStockDoc(input: StockDocCreateInput): Promise<StockDoc> {
  const { createStockDoc } = await getAdminClient().request<{ createStockDoc: StockDoc }>(
    `mutation CreateStockDoc($input: StockDocCreateInput!) {
      createStockDoc(input: $input) { id code type remark operator createdAt }
    }`,
    { input },
  );
  return createStockDoc;
}

export interface MovementRow {
  id: string;
  code: string;
  productVariantId: string;
  stockLocationId: string;
  bizType: string;
  bizCode: string | null;
  orderLineId: string | null;
  direction: 'in' | 'out';
  quantity: number;
  beforeOnHand: number | null;
  afterOnHand: number | null;
  otherLocationId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface MovementQueryParams {
  productVariantId?: string;
  locationId?: string;
  bizCode?: string;
  /** 业务类型（order/afterSales/purchase/stockMove/stocktake/stockOut/stockIn/manual/mirror） */
  bizType?: string;
  /** 'in' | 'out'；其它值后端视为不传 */
  direction?: 'in' | 'out';
  /** ISO 时间字符串（含） */
  from?: string;
  /** ISO 时间字符串（含） */
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface MovementSummary {
  inQty: number;
  outQty: number;
}

export async function fetchMovements(
  params: MovementQueryParams,
): Promise<{ totalItems: number; items: MovementRow[]; summary: MovementSummary }> {
  const { stockMovementLedger } = await getAdminClient().request<{
    stockMovementLedger: { totalItems: number; items: MovementRow[]; summary: MovementSummary };
  }>(
    `query StockMovementLedger($productVariantId: ID, $locationId: ID, $bizCode: String, $bizType: String, $direction: String, $from: String, $to: String, $page: Int, $pageSize: Int) {
      stockMovementLedger(productVariantId: $productVariantId, locationId: $locationId, bizCode: $bizCode, bizType: $bizType, direction: $direction, from: $from, to: $to, page: $page, pageSize: $pageSize) {
        totalItems
        summary { inQty outQty }
        items { id code productVariantId stockLocationId bizType bizCode orderLineId direction quantity beforeOnHand afterOnHand otherLocationId reason createdAt }
      }
    }`,
    {
      productVariantId: params.productVariantId ?? null,
      locationId: params.locationId ?? null,
      bizCode: params.bizCode ?? null,
      bizType: params.bizType ?? null,
      direction: params.direction ?? null,
      from: params.from ?? null,
      to: params.to ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    },
  );
  return stockMovementLedger;
}

// ---- 单据中心（Plan 2）----
export interface StockDocSummaryRow {
  id: string;
  code: string;
  type: string;
  remark: string | null;
  operator: string | null;
  createdAt: string;
  itemCount: number;
  totalQty: number;
}

export interface StockDocList {
  totalItems: number;
  items: StockDocSummaryRow[];
}

/** type 传空/非法 → 不过滤（后端白名单校验）；locationId 按明细源/目标仓匹配；from/to 为 ISO 时间串 */
export async function fetchStockDocList(
  params: {
    type?: string;
    locationId?: string;
    from?: string;
    to?: string;
    operator?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<StockDocList> {
  const { stockDocList } = await getAdminClient().request<{ stockDocList: StockDocList }>(
    `query StockDocList($type: String, $locationId: ID, $from: String, $to: String, $operator: String, $page: Int, $pageSize: Int) {
      stockDocList(type: $type, locationId: $locationId, from: $from, to: $to, operator: $operator, page: $page, pageSize: $pageSize) {
        totalItems
        items { id code type remark operator createdAt itemCount totalQty }
      }
    }`,
    {
      type: params.type || null,
      locationId: params.locationId ?? null,
      from: params.from ?? null,
      to: params.to ?? null,
      operator: params.operator ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    },
  );
  return stockDocList;
}