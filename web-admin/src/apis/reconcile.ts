// 四流对账 admin-api 调用（方案2-C，schema 已线上冒烟确认）
import { getAdminClient } from './client';

export interface ReconcileBatch {
  id: string;
  date: string;
  status: string;
  d1Count: number;
  d2Count: number;
  d3Count: number;
  d4Count: number;
  orderTotal: number;
  trigger: string;
}

export interface ReconcileLine {
  id: string;
  batchId: string;
  orderId: string;
  diffTypes: string;
  status: string;
}

export async function fetchBatches(): Promise<ReconcileBatch[]> {
  const { reconciliationBatches } = await getAdminClient().request<{ reconciliationBatches: ReconcileBatch[] }>(
    `query { reconciliationBatches { id date status d1Count d2Count d3Count d4Count orderTotal trigger } }`,
  );
  return reconciliationBatches;
}

export async function fetchLines(batchId: string): Promise<ReconcileLine[]> {
  const { reconciliationLines } = await getAdminClient().request<{ reconciliationLines: ReconcileLine[] }>(
    `query($batchId: ID!) { reconciliationLines(batchId: $batchId) { id batchId orderId diffTypes status } }`,
    { batchId },
  );
  return reconciliationLines;
}

// 幂等：同日已有 done 批次时返回 null
export async function runReconciliation(date: string): Promise<ReconcileBatch | null> {
  const { runReconciliation } = await getAdminClient().request<{ runReconciliation: ReconcileBatch | null }>(
    `mutation($date: String!) { runReconciliation(date: $date) { id date status d1Count d2Count d3Count d4Count } }`,
    { date },
  );
  return runReconciliation;
}

export async function rerunLine(lineId: string): Promise<ReconcileLine> {
  const { rerunReconciliationOrder } = await getAdminClient().request<{ rerunReconciliationOrder: ReconcileLine }>(
    `mutation($lineId: ID!) { rerunReconciliationOrder(lineId: $lineId) { id status diffTypes } }`,
    { lineId },
  );
  return rerunReconciliationOrder;
}
