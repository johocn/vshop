// 订单列表·中国本地化 展示层工具与视图模型（纯函数，SSR/H5 友好）
import type { OrderRow, ShopOrderRow } from '../apis/order';

// —— 展示视图模型：把渠道单/商品单两种异构数据统一成同一渲染结构 ——
export interface OrderGood {
  name: string;
  qty: number;
  price: number;
}
export interface OrderView {
  id: string;
  code: string;
  state: string;
  customerName: string;
  phoneMask: string; // 已有手机号 → ' · 138****6732'；无 → ''
  delivery: string; // 自提 / 快递 / 具体配送方式名
  payment: string; // 支付方式名；无 → ''
  time: string; // 下单时间原始串（页面再排版时间格式）
  goods: OrderGood[];
  total: number; // 实付（分）
}

export function maskPhone(p?: string | null): string {
  const s = (p || '').replace(/\s/g, '');
  if (s.length < 7) return s || '';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

export function fmtMoney(cents: number): string {
  return ((cents || 0) / 100).toFixed(2);
}

export function isToday(ts?: string | null, now = new Date()): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export const TO_SHIP_STATES = ['PaymentAuthorized', 'PaymentSettled'];
export function isToBeShipped(s: string): boolean {
  return TO_SHIP_STATES.includes(s);
}
// 待退款：本期用「已取消」近似（真实售后/退款数需二期接售后接口）
export function isRefundApprox(s: string): boolean {
  return s === 'Cancelled';
}

export interface StatsValue { today: string; toShip: string; refund: string }

export function computeStats(rows: { state: string; placedAt?: string | null }[], now = new Date()): StatsValue {
  let today = 0;
  let toShip = 0;
  let refund = 0;
  for (const o of rows) {
    if (isToday(o.placedAt, now)) today += 1;
    if (isToBeShipped(o.state)) toShip += 1;
    if (isRefundApprox(o.state)) refund += 1;
  }
  return { today: String(today), toShip: String(toShip), refund: String(refund) };
}

function customerNameOf(o: OrderRow): string {
  const c = o.customer;
  if (c) {
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    if (name) return name;
    if (c.emailAddress) return c.emailAddress;
  }
  return '顾客';
}

export function channelToView(o: OrderRow): OrderView {
  const phone = o.customer?.phoneNumber || o.shippingLines?.[0]?.shippingAddress?.phoneNumber || '';
  const payment = o.payments?.[0]?.method || '';
  return {
    id: o.id,
    code: o.code,
    state: o.state,
    customerName: customerNameOf(o),
    phoneMask: phone ? ` · ${maskPhone(phone)}` : '',
    delivery: o.customFields?.deliveryType === 'pickup' ? '自提' : o.shippingLines?.[0]?.shippingMethod?.name || '快递',
    payment,
    time: o.orderPlacedAt || o.createdAt || '',
    goods: (o.lines || []).map((l) => ({
      name: l.productVariant?.name || (l as any).productName || '',
      qty: Number(l.quantity || 0),
      price: Number(l.linePriceWithTax || 0),
    })),
    total: Number(o.totalWithTax || 0),
  };
}

export function shopToView(s: ShopOrderRow): OrderView {
  return {
    id: s.orderId,
    code: s.code,
    state: s.state,
    customerName: s.customerName || '顾客',
    phoneMask: '', // 本店商品单接口不返回手机号 → 显示空（桌面表格该列也空）
    delivery: '快递', // myShopOrders 无配送方式字段，取近似
    payment: '', // myShopOrders 无支付方式字段
    time: s.placedAt || '',
    goods: (s.items || []).map((it) => ({
      name: it.productName || it.variantName || '',
      qty: Number(it.quantity || 0),
      price: Number(it.lineTotalWithTax || 0),
    })),
    total: Number(s.totalWithTax || 0),
  };
}

export function goodsTotalQty(v: OrderView): number {
  return v.goods.reduce((a, g) => a + g.qty, 0);
}
// 幽灵单（0 件 0 元）过滤：与旧 isGhost 语义一致
export function isGhostView(v: OrderView): boolean {
  return goodsTotalQty(v) <= 0;
}