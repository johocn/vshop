// 售后动作可用性与状态展示的**唯一来源**（列表页与详情页共用）。
// 严格对齐服务端状态机 vendure/packages/after-sales-plugin/src/types.ts 的 STATE_TRANSITIONS：
//   approve / reject          : Pending
//   confirmReturnReceived     : Returning
//   processAfterSalesRefund   : Received
//   retryAfterSalesRefund     : RefundFailed
//   arbitrateAfterSales       : Appealed（平台仲裁；外卖售后四期新增）
import { AFTER_SALE_STATES, stateLabel, type StateLabel } from './orderState';

export interface AfterSaleActionAvailability {
  approve: boolean;
  reject: boolean;
  receive: boolean;
  refund: boolean;
  retry: boolean;
  /** 换货发货（仅 exchange 单 Received 态；三期新增） */
  exchangeShip: boolean;
  /** 平台仲裁（Appealed 态；外卖售后四期新增） */
  arbitrate: boolean;
}

export function afterSaleActions(state?: string | null, type?: string | null): AfterSaleActionAvailability {
  const s = state ?? '';
  return {
    approve: s === 'Pending',
    reject: s === 'Pending',
    receive: s === 'Returning',
    refund: s === 'Received',
    retry: s === 'RefundFailed',
    exchangeShip: s === 'Received' && type === 'exchange',
    arbitrate: s === 'Appealed',
  };
}

export function hasAfterSaleActions(state?: string | null, type?: string | null): boolean {
  const a = afterSaleActions(state, type);
  return a.approve || a.reject || a.receive || a.refund || a.retry || a.exchangeShip || a.arbitrate;
}

export function afterSaleStateLabel(state?: string | null): StateLabel {
  return stateLabel(AFTER_SALE_STATES, state);
}

/** 列表页签：key 为服务端 state（'' = 全部），label 为 afterSale.list.* 下的词条名 */
export const AFTER_SALE_TABS: { key: string; label: string }[] = [
  { key: 'Pending', label: 'tabPending' },
  { key: 'Appealed', label: 'tabAppealed' },
  { key: 'Approved', label: 'tabToReturn' },
  { key: 'Returning', label: 'tabToReceive' },
  { key: 'Received', label: 'tabToRefund' },
  { key: 'RefundFailed', label: 'tabRefundFailed' },
  { key: '', label: 'tabAll' },
  { key: 'Rejected', label: 'tabRejected' },
  { key: 'Closed', label: 'tabClosed' },
];

/** 主流程 5 节点（与 C 端同一套划分） */
export const AFTER_SALE_PROGRESS: string[] = [
  'Pending',
  'Approved',
  'Returning',
  'Received',
  'Refunded',
];

export function afterSaleProgressIndex(state?: string | null): number {
  const s = state ?? '';
  const i = AFTER_SALE_PROGRESS.indexOf(s);
  if (i >= 0) return i;
  if (s === 'RefundFailed') return 3;
  if (s === 'ExchangeShipped') return 4;
  if (s === 'Rejected' || s === 'Closed' || s === 'Appealed') return 0;
  return -1;
}

export interface AfterSaleWaiting {
  text: string;
  over24h: boolean;
}

/** 已等待时长文案：{d} 天 {h} 小时 / {h} 小时 / {m} 分钟 */
export function afterSaleWaiting(
  createdAt: string | null | undefined,
  t: (key: string) => string,
  now: number = Date.now(),
): AfterSaleWaiting {
  if (!createdAt) return { text: '', over24h: false };
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) return { text: '', over24h: false };
  const ms = Math.max(0, now - start);
  const over24h = ms > 24 * 60 * 60 * 1000;
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const text = d > 0
    ? t('afterSale.list.waitingDays').replace('{d}', String(d)).replace('{h}', String(h))
    : h > 0
      ? t('afterSale.list.waitingHours').replace('{h}', String(h))
      : t('afterSale.list.waitingMinutes').replace('{m}', String(m));
  return { text, over24h };
}
