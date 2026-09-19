// 库存单据（采购入库/移库/盘库/手动出库） + 库存流水 admin-api 调用
// 字段对齐后端 schema（cjk-plugin plugin.ts + stock-doc.admin.resolver.ts）：
//   - createStockDoc(input: StockDocCreateInput!): StockDoc!
//       StockDocCreateInput: { type: String!, remark, operator, items: [StockDocItemInput!]! }
//       StockDocItemInput: { variantId: ID!, fromStockLocationId: ID, toStockLocationId: ID,
//                            qty: Int!, realQty: Int, costPrice: Int }
//   - stockMovementLedger(productVariantId, locationId, bizCode, orderLineId, page, pageSize): StockLedgerList!
//       StockLedgerEntry: { id code productVariantId stockLocationId bizType bizCode orderLineId
//                           direction quantity beforeOnHand afterOnHand otherLocationId reason createdAt }
import { getAdminClient } from './client';

export type StockDocType = 'PURCHASE' | 'TRANSFER' | 'STOCKTAKE' | 'ISSUE';

export interface StockDocItemInput {
  variantId: string;
  fromStockLocationId?: string;
  toStockLocationId?: string;
  qty: number;
  realQty?: number;
  costPrice?: number;
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
  page?: number;
  pageSize?: number;
}

export async function fetchMovements(
  params: MovementQueryParams,
): Promise<{ totalItems: number; items: MovementRow[] }> {
  const { stockMovementLedger } = await getAdminClient().request<{
    stockMovementLedger: { totalItems: number; items: MovementRow[] };
  }>(
    `query StockMovementLedger($productVariantId: ID, $locationId: ID, $bizCode: String, $page: Int, $pageSize: Int) {
      stockMovementLedger(productVariantId: $productVariantId, locationId: $locationId, bizCode: $bizCode, page: $page, pageSize: $pageSize) {
        totalItems items { id code productVariantId stockLocationId bizType bizCode orderLineId direction quantity beforeOnHand afterOnHand otherLocationId reason createdAt }
      }
    }`,
    params,
  );
  return stockMovementLedger;
}