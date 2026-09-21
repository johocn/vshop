// 订单列表筛选纯函数与常量：时间区间 / 状态分组 / 异常类型 / GraphQL filter 组装。
// 全部无副作用、无网络依赖，供页面（服务端过滤）、组件（tab 分组）与单测共用。
// 事实依据（生产 admin-api introspection 实测，见规格第一节）：
//   OrderFilterParameter 中 code/contactName/contactPhone/remark/state/deliveryType/
//   exceptionType/afterSalesStatus 均为 StringOperators；createdAt/orderPlacedAt 为 DateOperators。

/** 时间快捷筛选键：'' 全部 | today 今日 | 7d 近7天 | month 本月 | custom 自定义区间 */
export type TimeRangeKey = '' | 'today' | '7d' | 'month' | 'custom';

export interface TimeRangeInput {
  key?: TimeRangeKey;
  /** 'YYYY-MM-DD'，仅 custom 使用 */
  from?: string;
  /** 'YYYY-MM-DD'，仅 custom 使用（含当日） */
  to?: string;
}

/** 半开区间 [start, end)，ISO 字符串（含时区偏移，服务端按瞬时比较） */
export interface TimeWindow {
  start: string;
  end: string;
}

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseDay(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 纯函数：把快捷键 / 自定义日期翻译为半开区间 [start, end)（ISO）。
 * 无有效条件 → null（调用方据此不拼时间 filter）。非法自定义输入返回 null，不抛异常。
 */
export function resolveTimeWindow(input: TimeRangeInput = {}, now = new Date()): TimeWindow | null {
  const key = input.key || '';
  if (key === 'today') {
    const s = dayStart(now);
    return { start: s.toISOString(), end: addDays(s, 1).toISOString() };
  }
  if (key === '7d') {
    const s = addDays(dayStart(now), -6);
    return { start: s.toISOString(), end: addDays(dayStart(now), 1).toISOString() };
  }
  if (key === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  if (key !== 'custom') return null;
  const f = parseDay(input.from);
  const t = parseDay(input.to);
  if (!f || !t) return null;
  // 起止颠倒（运营手滑）自动交换，避免筛出空结果被当成“搜索不稳定”
  const lo = t.getTime() < f.getTime() ? t : f;
  const hi = t.getTime() < f.getTime() ? f : t;
  return { start: dayStart(lo).toISOString(), end: addDays(dayStart(hi), 1).toISOString() };
}

/** 纯函数：某时间戳是否落在窗口内（商品单本地过滤用）。无时间条件 → 恒真 */
export function inTimeWindow(ts: string | null | undefined, input: TimeRangeInput = {}, now = new Date()): boolean {
  const w = resolveTimeWindow(input, now);
  if (!w) return true;
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(w.start).getTime() && t < new Date(w.end).getTime();
}

/** 状态分组：并集 = ORDER_STATES 全部键（单测保证无遗漏、无重复） */
export interface StateGroupDef {
  key: string;
  states: string[];
}

export const STATE_GROUPS: StateGroupDef[] = [
  { key: 'pending', states: ['Created', 'AddingItems', 'ArrangingPayment'] },
  {
    key: 'active',
    states: [
      'PaymentAuthorized',
      'WaitingForShipping',
      'PartiallyPaymentSettled',
      'PaymentSettled',
      'PartiallyShipped',
      'Shipped',
      'PartiallyDelivered',
      'Delivered',
    ],
  },
  { key: 'done', states: ['Completed'] },
  { key: 'cancelled', states: ['Cancelled', 'Modified', 'Modifying', 'ArrangingAdditionalPayment'] },
];

/** 异常类型取值域（= vendure/packages/delivery-plugin/src/constants.ts 的 ExceptionType） */
export const EXCEPTION_TYPES = ['rejected', 'wrong_address', 'no_recipient', 'damaged', 'other'] as const;

/** 售后「未了结」集合：排除已了结的 Refunded / Rejected / Closed（与 web-admin AFTER_SALE_STATES 同键） */
export const AFTER_SALES_OPEN = ['Pending', 'Approved', 'Returning', 'Received', 'RefundFailed'];

/** 待付款状态集合（统计卡与 tab 共用，避免两处漂移） */
export const UNPAID_STATES = ['ArrangingPayment'];

/** 待发货状态集合：已付款但未发出（含部分付款/待发货/部分发货前态） */
export const TO_SHIP_STATES = ['PaymentAuthorized', 'WaitingForShipping', 'PartiallyPaymentSettled', 'PaymentSettled'];

export interface OrderFilterInput {
  /** 状态多值 → state.in */
  states?: string[];
  /** 关键词 → _or（订单号/联系人/电话/备注） */
  keyword?: string;
  /** 时间条件 → orderPlacedAt.between */
  time?: TimeRangeInput;
  /** 配送方式：'' 不过滤 | 'pickup' 自提 | 'delivery' 快递 */
  delivery?: '' | 'pickup' | 'delivery';
  /** 异常组：exceptionType 非空 */
  exceptionOnly?: boolean;
  /** 异常类型二级筛选 → exceptionType.eq */
  exceptionType?: string;
  /** 售后状态集合 → afterSalesStatus.in */
  afterSales?: string[];
}

/**
 * 纯函数：把 UI 条件翻译为 Vendure OrderFilterParameter 对象。
 * 无任何条件 → null（不发空 filter）。返回值直接作为 GraphQL 变量传参，不做字符串内插（消除注入面）。
 */
export function buildOrderFilter(input: OrderFilterInput = {}, now = new Date()): Record<string, any> | null {
  const filter: Record<string, any> = {};

  if (input.states && input.states.length) filter.state = { in: input.states };
  if (input.afterSales && input.afterSales.length) filter.afterSalesStatus = { in: input.afterSales };
  if (input.exceptionType) filter.exceptionType = { eq: input.exceptionType };
  else if (input.exceptionOnly) filter.exceptionType = { isNull: false };

  const w = resolveTimeWindow(input.time || {}, now);
  if (w) filter.orderPlacedAt = { between: { start: w.start, end: w.end } };

  const kw = (input.keyword || '').trim();
  if (kw) {
    filter._or = [
      { code: { contains: kw } },
      { contactName: { contains: kw } },
      { contactPhone: { contains: kw } },
      { remark: { contains: kw } },
    ];
  }

  if (input.delivery === 'pickup') filter.deliveryType = { eq: 'pickup' };
  else if (input.delivery === 'delivery') filter.deliveryType = { eq: 'delivery' };

  if (!Object.keys(filter).length) return null;
  // 不写 filterOperator：该字段属于 OrderListOptions（filter 的兄弟节点），
  // 写进 filter 内会被 admin-api 拒绝（Field "filterOperator" is not defined by type "OrderFilterParameter"）。
  // 多条件的 AND 语义由 OrderListOptions 默认值提供，无需显式声明——
  // 生产只读探针实测：pickup=17、state.in=1，组合默认=1（=交集，AND），显式 OR 才得 17。
  return filter;
}
