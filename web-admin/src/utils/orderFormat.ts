// 订单列表·中国本地化 展示层工具与视图模型（纯函数，SSR/H5 友好）
import type { OrderRow, ShopOrderRow } from '../apis/order';

// —— 展示视图模型：把渠道单/商品单两种异构数据统一成同一渲染结构 ——
export interface OrderGood {
  name: string;
  qty: number;
  price: number;
  image?: string; // 商品缩略图完整 URL；本店商品单无图 → undefined
}
export interface OrderView {
  id: string;
  code: string;
  state: string;
  customerName: string;
  phoneMask: string; // 已有手机号 → ' · 138****6732'；无 → ''
  delivery: string; // 自提 / 快递 / 具体配送方式名
  address: string; // 省市区+街道 完整地址；无 → ''
  payment: string; // 支付方式名；无 → ''
  time: string; // 下单时间原始串（页面再排版时间格式）
  goods: OrderGood[];
  total: number; // 实付（分）
}

// 缩略图完整 URL：Vendure source 是相对路径，动态拼当前访问域名（禁硬编码）
export function imageFullUrl(src?: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${src}`;
}

// 可发货状态集合（订单已支付/待履约，可进入发货页）
export const SHIPPABLE_STATES = ['PaymentAuthorized', 'PaymentSettled', 'WaitingForShipping', 'PartiallyPaymentSettled'];
export function isShippable(state: string): boolean {
  return SHIPPABLE_STATES.includes(state);
}

// 待付款(可催付)：order 状态机实测, 待付款 = ArrangingPayment
export function isUnpaid(state: string): boolean {
  return state === 'ArrangingPayment';
}

// 物流着色：待发货橙 / 已发货蓝 / 已完成绿 / 已取消灰；未命中 → fallback(沿用订单状态原色, 如待付款红)
export const LOGISTICS_COLORS: Record<string, string> = {
  PaymentAuthorized: '#E8930C', PaymentSettled: '#E8930C', WaitingForShipping: '#E8930C', PartiallyPaymentSettled: '#E8930C',
  Shipped: '#2B88D9', PartiallyShipped: '#2B88D9',
  Completed: '#1FAE5F',
  Cancelled: '#9095A2',
};
export function shipColor(state: string, fallback = ''): string {
  return LOGISTICS_COLORS[state] || fallback;
}

// 生成催付文案(纯函数)。顾客名为默认占位'顾客'时省略称谓; shopName 缺省则该行省略。
export function buildReminderText(o: OrderView, opts?: { shopName?: string }): string {
  const shop = opts?.shopName ? `${opts.shopName} ` : '';
  const name = o.customerName && o.customerName !== '顾客' ? `，${o.customerName}` : '';
  return [
    `${shop}有一笔订单待支付${name}，请尽快完成付款：`,
    `订单号：${o.code}`,
    `金额：¥${fmtMoney(o.total)}`,
    '点击链接或登录确认支付，谢谢支持！',
  ].join('\n');
}

export function maskPhone(p?: string | null): string {
  const s = (p || '').replace(/\s/g, '');
  if (s.length < 7) return s || '';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

export interface ShipAddressLike {
  fullName?: string | null;
  streetLine1?: string | null;
  city?: string | null;
  province?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
}

// 省市区+街道 拼接，去空；无 → ''
export function formatAddress(a?: ShipAddressLike | null): string {
  if (!a) return '';
  const parts = [a.province, a.city, a.streetLine1].map((s) => (s || '').trim()).filter(Boolean);
  return parts.join(' ');
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

export interface StatsValue { today: string; unpaid: string; toShip: string; refund: string }

export function computeStats(rows: { state: string; placedAt?: string | null }[], now = new Date()): StatsValue {
  let today = 0;
  let unpaid = 0;
  let toShip = 0;
  let refund = 0;
  for (const o of rows) {
    if (isToday(o.placedAt, now)) today += 1;
    if (isUnpaid(o.state)) unpaid += 1;
    if (isToBeShipped(o.state)) toShip += 1;
    if (isRefundApprox(o.state)) refund += 1;
  }
  return { today: String(today), unpaid: String(unpaid), toShip: String(toShip), refund: String(refund) };
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
  const phone = o.customer?.phoneNumber || o.shippingAddress?.phoneNumber || '';
  const payment = o.payments?.[0]?.method || '';
  return {
    id: o.id,
    code: o.code,
    state: o.state,
    customerName: customerNameOf(o),
    phoneMask: phone ? ` · ${maskPhone(phone)}` : '',
    delivery: o.customFields?.deliveryType === 'pickup' ? '门店自提' : o.shippingLines?.[0]?.shippingMethod?.name || '快递',
    payment,
    time: o.orderPlacedAt || o.createdAt || '',
    address: formatAddress(o.shippingAddress),
    goods: (o.lines || []).map((l) => ({
      name: l.productVariant?.name || (l as any).productName || '',
      qty: Number(l.quantity || 0),
      price: Number(l.linePriceWithTax || 0),
      image: imageFullUrl(l.productVariant?.featuredAsset?.source),
    })),
    total: Number(o.totalWithTax || 0),
  };
}

export function shopToView(s: ShopOrderRow, thumbMap: Record<string, string> = {}): OrderView {
  return {
    id: s.orderId,
    code: s.code,
    state: s.state,
    customerName: s.customerName || '顾客',
    phoneMask: '', // 本店商品单接口不返回手机号 → 显示空
    delivery: '快递',
    payment: '',
    time: s.placedAt || '',
    address: '', // 本店商品单接口无地址
    goods: (s.items || []).map((it) => ({
      name: it.productName || it.variantName || '',
      qty: Number(it.quantity || 0),
      price: Number(it.lineTotalWithTax || 0),
      image: thumbMap[it.productId] ? imageFullUrl(thumbMap[it.productId]) : '',
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

export interface OrderFilter {
  kw?: string;            // 关键词（订单号/顾客/手机号/商品名）
  delivery?: '' | 'pickup' | 'express';
  dateRange?: '' | 'today' | '7d' | '30d';
}

function rowTime(row: { orderPlacedAt?: string | null; createdAt?: string }): string {
  return row.orderPlacedAt || row.createdAt || '';
}

function deliveryOf(row: { customFields?: { deliveryType?: string | null } | null }): 'pickup' | 'express' {
  return row.customFields?.deliveryType === 'pickup' ? 'pickup' : 'express';
}

function withinDate(ts: string, range: '' | 'today' | '7d' | '30d', now = new Date()): boolean {
  if (!range || !ts) return true;
  const d = new Date(ts).getTime();
  if (Number.isNaN(d)) return true;
  const start = new Date(now);
  if (range === 'today') start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - (range === '7d' ? 7 : 30));
  return d >= start.getTime();
}

// 渠道单原始行过滤（Vendure 无这些服务端过滤 → 对已加载页生效）
export function filterChannelRows(rows: OrderRow[], f: OrderFilter = {}, now = new Date()): OrderRow[] {
  const k = (f.kw || '').trim().toLowerCase();
  const dc = f.delivery || '';
  return rows.filter((o) => {
    if (dc && deliveryOf(o) !== dc) return false;
    if (f.dateRange && !withinDate(rowTime(o), f.dateRange, now)) return false;
    if (!k) return true;
    const cust = o.customer;
    const name = `${cust?.firstName || ''} ${cust?.lastName || ''}`.trim();
    const phone = cust?.phoneNumber || o.shippingAddress?.phoneNumber || '';
    const prodNames = (o.lines || []).map((l) => l.productVariant?.name || '').join(' ');
    return [o.code, name, cust?.emailAddress, phone, prodNames].some((v) => (v || '').toLowerCase().includes(k));
  });
}

// 商品单原始行过滤（myShopOrders 全量 → 完全可靠）
export function filterShopRows(rows: ShopOrderRow[], f: OrderFilter = {}, now = new Date()): ShopOrderRow[] {
  const k = (f.kw || '').trim().toLowerCase();
  const dc = f.delivery || '';
  return rows.filter((o) => {
    if (dc === 'pickup') return false; // 商品单恒快递；选「自提」全排除、选「快递」放行继续下探
    if (f.dateRange && !withinDate(o.placedAt || '', f.dateRange, now)) return false;
    if (!k) return true;
    const prodNames = (o.items || []).map((it) => `${it.productName || ''} ${it.variantName || ''}`).join(' ');
    return [o.code, o.customerName, prodNames].some((v) => (v || '').toLowerCase().includes(k));
  });
}