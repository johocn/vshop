// 售后域 admin-api 调用（Task 8，schema 已实测校准）
// 校准结果（本地 admin-api 实测）：
//   - 售后 query 名是 afterSalesRequests（after-sales-plugin 提供），不是计划里的 afterSales
//   - afterSalesRequests(options:{take,skip}) { totalItems items { ... } } —— 可用
//   - AfterSalesRequestAdmin 字段：id orderId orderLineId type state reason description
//     evidenceImages refundAmount returnTrackingNo returnCarrier rejectReason receivedQuantity
//     restockJson refundTransactionId actualRefundAmount refundedAt refundError customerId createdAt updatedAt
//   - 注意：无 code 字段，列表用 id 展示；refundAmount 单位是分（与 Vendure 金额一致）
import { getAdminClient } from './client';

export interface AfterSaleRow {
  id: string;
  orderId: string;
  type: string;
  state: string;
  reason?: string | null;
  description?: string | null;
  refundAmount?: number | null;
  returnTrackingNo?: string | null;
  returnCarrier?: string | null;
  rejectReason?: string | null;
  createdAt?: string | null;
}

export async function fetchAfterSales(
  take = 20,
  skip = 0,
): Promise<{ totalItems: number; items: AfterSaleRow[] }> {
  const { afterSalesRequests } = await getAdminClient().request<{
    afterSalesRequests: { totalItems: number; items: AfterSaleRow[] };
  }>(
    `query AfterSales($take: Int, $skip: Int) {
      afterSalesRequests(options: { take: $take, skip: $skip }) {
        totalItems items {
          id orderId type state reason description refundAmount
          returnTrackingNo returnCarrier rejectReason createdAt
        }
      }
    }`,
    { take, skip },
  );
  return afterSalesRequests;
}
