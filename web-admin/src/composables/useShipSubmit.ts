// 发货提交共享逻辑（Task 9 从 pages/order/ship/index.vue 抽出，行为与签名保持一致）。
// 供「单订单发货页」与「配货台批次详情页」共用。
import { partialShip, shipByWarehouse, ShipLinePart } from '../apis/order';
import { Reservation } from '../apis/reservation';

export interface WhOption {
  stockLocationId: string;
  qty: number;
}

export interface ShipLine {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  availQty: number;
  picked: number;
  whOptions: WhOption[];
  whIdx: number;
}

/** 快递公司选项与下标 -> 发货 method 的映射（沿用发货页原有硬编码清单） */
export const DISPATCH_OPTIONS = ['顺丰', '中通', '圆通', '韵达', '极兔', 'EMS'];

export function dispatchMethod(idx: number): string {
  return DISPATCH_OPTIONS[idx] || 'standard';
}

/** 该行的仓库选项文案（仓库 id + 预留数量） */
export function whLabels(l: ShipLine): string[] {
  return l.whOptions.map((o) => `${o.stockLocationId}（${o.qty}）`);
}

/** 按订单行聚合预留明细：预留单 items 里该 orderLineId 各仓数量 */
export function whOptionsFor(lineId: string, reservations: Reservation[]): WhOption[] {
  const map = new Map<string, number>();
  for (const r of reservations) {
    if (r.orderLineId !== lineId) continue;
    for (const it of r.items) {
      if (!it.stockLocationId) continue;
      map.set(it.stockLocationId, (map.get(it.stockLocationId) || 0) + it.qty);
    }
  }
  return [...map.entries()].map(([stockLocationId, qty]) => ({ stockLocationId, qty }));
}

export type ShipSubmitResult =
  | { kind: 'empty' }
  | { kind: 'partialFail'; fails: string[] }
  | { kind: 'ok' };

/**
 * 提交本次发货。有预留单时按仓聚合 parts 逐仓生成独立 fulfillment（shipByWarehouse）；
 * 无预留单保持原单仓 partialShip 路径。失败原因原文回传，由调用方 toast（不静默）。
 * 抛出异常表示整体失败（如无预留路径的 partialShip 报错）。
 */
export async function submitShipment(
  orderId: string,
  lines: ShipLine[],
  method: string,
  trackingCode?: string,
): Promise<ShipSubmitResult> {
  if (!lines.some((l) => l.picked > 0)) return { kind: 'empty' };

  const hasRes = lines.some((l) => l.whOptions.length > 0);
  if (hasRes) {
    // 多仓：按仓库聚合 parts，逐仓生成独立 fulfillment
    const byWh = new Map<string, ShipLinePart[]>();
    for (const l of lines) {
      if (l.picked <= 0) continue;
      const wh = l.whOptions[l.whIdx]?.stockLocationId || '未分仓';
      const arr = byWh.get(wh) || [];
      arr.push({ orderLineId: l.id, quantity: l.picked });
      byWh.set(wh, arr);
    }
    const shipments = [...byWh.entries()].map(([stockLocationId, parts]) => ({
      stockLocationId,
      parts,
      method,
      trackingCode,
    }));
    const { fails } = await shipByWarehouse(orderId, shipments);
    if (fails.length) return { kind: 'partialFail', fails };
    return { kind: 'ok' };
  }

  // 无预留单：保持原单仓 partialShip 路径
  const parts = lines
    .filter((l) => l.picked > 0)
    .map((l) => ({ orderLineId: l.id, quantity: l.picked }));
  await partialShip(orderId, parts, method, trackingCode);
  return { kind: 'ok' };
}

export function useShipSubmit() {
  return { submitShipment, whOptionsFor, whLabels, dispatchMethod, dispatchOptions: DISPATCH_OPTIONS };
}