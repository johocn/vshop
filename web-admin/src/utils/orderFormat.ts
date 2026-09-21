// 订单列表·中国本地化 展示层工具与视图模型（纯函数，SSR/H5 友好）
import type { OrderRow, ShopOrderRow } from '../apis/order';
import { inTimeWindow, TimeRangeInput } from './orderFilter';

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

export interface StatsValue { today: string; unpaid: string; toShip: string; refund: string }

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
    delivery: s.shippingLines?.[0]?.name || '门店自提',
    payment: '',
    time: s.placedAt || '',
    address: formatAddress(s.shippingAddress as ShipAddressLike | null | undefined),
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

// 商品单本地过滤入参：字段与渠道单的服务端 filter 口径一一对应（关键词/时间/配送/状态）
export interface ShopLocalFilter {
  keyword?: string;
  time?: TimeRangeInput;
  delivery?: '' | 'pickup' | 'delivery';
  /** 当前 tab 的状态集合；未指定表示不限状态 */
  states?: string[];
  /** 该 tab 在商品单口径下无对应数据（异常组 / 售后组）→ 直接返回空 */
  unsupported?: boolean;
}

/**
 * 商品单（myShopOrders 全量返回）本地过滤：本地过滤即全量可靠（规格 §3.1）。
 * 渠道单**不再**使用任何本地过滤函数（条件已全部下推服务端），故 filterChannelRows 已删除。
 */
export function filterShopRows(rows: ShopOrderRow[], f: ShopLocalFilter = {}, now = new Date()): ShopOrderRow[] {
  if (f.unsupported) return [];
  const k = (f.keyword || '').trim().toLowerCase();
  const dv = f.delivery || '';
  return rows.filter((o) => {
    if (dv === 'pickup') return false; // 商品单恒快递：选「自提」全排除、选「快递」放行继续下探
    if (!inTimeWindow(o.placedAt, f.time, now)) return false;
    if (f.states?.length && !f.states.includes(o.state)) return false;
    if (!k) return true;
    const prodNames = (o.items || []).map((it) => `${it.productName || ''} ${it.variantName || ''}`).join(' ');
    return [o.code, o.customerName, prodNames].some((v) => (v || '').toLowerCase().includes(k));
  });
}