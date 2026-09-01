// 订单 / 售后 / 核销状态的中文文案统一映射（Tab、徽标、详情共用，DRY）
export interface StateLabel { label: string; color: string }

export const ORDER_STATES: Record<string, StateLabel> = {
  Created:               { label: '已下单',     color: '#72767b' },
  AddingItems:           { label: '加购中',     color: '#72767b' },
  ArrangingPayment:      { label: '待付款',     color: '#f59e0b' },
  PaymentAuthorized:     { label: '待发货',     color: '#2563eb' },
  WaitingForShipping:    { label: '待发货',     color: '#2563eb' },
  PartiallyPaymentSettled: { label: '部分付款', color: '#f59e0b' },
  PaymentSettled:        { label: '已付款',     color: '#059669' },
  PartiallyShipped:      { label: '部分发货',   color: '#2563eb' },
  Shipped:               { label: '已发货',     color: '#059669' },
  PartiallyDelivered:    { label: '部分收货',   color: '#2563eb' },
  Delivered:             { label: '已收货',     color: '#059669' },
  Completed:             { label: '已完成',     color: '#72767b' },
  Cancelled:             { label: '已取消',     color: '#e64340' },
  Modified:              { label: '已修改',     color: '#f59e0b' },
  Modifying:             { label: '修改中',     color: '#f59e0b' },
  ArrangingAdditionalPayment: { label: '补款中', color: '#f59e0b' },
};

export const AFTER_SALE_STATES: Record<string, StateLabel> = {
  Pending:      { label: '待处理', color: '#f59e0b' },
  Approved:     { label: '已同意', color: '#2563eb' },
  Rejected:     { label: '已拒绝', color: '#e64340' },
  Returning:    { label: '退回中', color: '#2563eb' },
  Received:     { label: '已收货', color: '#72767b' },
  Refunded:     { label: '已退款', color: '#059669' },
  RefundFailed: { label: '退款失败', color: '#e64340' },
  Closed:       { label: '已关闭', color: '#72767b' },
};

export const AFTER_SALE_TYPES: Record<string, string> = {
  refund_only:   '仅退款',
  return_refund: '退货退款',
  exchange:      '换货',
};

export const REDEMPTION_STATES: Record<string, StateLabel> = {
  generated: { label: '待核销', color: '#2563eb' },
  redeemed:  { label: '已核销', color: '#059669' },
  void:      { label: '已作废', color: '#e64340' },
};

export const PICKUP_TYPE_LABELS: Record<string, string> = {
  store:    '门店自提',
  point:    '自提点自提',
  employee: '职工单位自提',
};

export const FULFILLMENT_CHANNEL_KIND: Record<string, string> = {
  delivery: '快递',
  pickup:   '自提',
};

export function stateLabel(map: Record<string, StateLabel>, key?: string | null): StateLabel {
  return (key && map[key]) || { label: key || '—', color: '#72767b' };
}