// 订单域 admin-api 调用（Task 3 + Task 8，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - orders(options:{take,skip,filter:{state:{eq}}}) { totalItems items { id code state totalWithTax } } —— 可用
//   - order(id) { id code state totalWithTax currencyCode customer { id firstName lastName emailAddress }
//       shippingAddress { fullName streetLine1 city province countryCode postalCode phoneNumber }
//       lines { id quantity productVariant { id name sku } } } —— 可用（Task 8 实测）
//   - 发货 mutation 不是计划里的 fulfillOrder，实际为 addFulfillmentToOrder(input: FulfillOrderInput!)
//     FulfillOrderInput = { lines: [OrderLineInput!]!, handler: ConfigurableOperationInput! }
//     OrderLineInput = { orderLineId: ID!, quantity: Int! }
//     handler 用 manual-fulfillment（args: method / trackingCode），实测返回 { id state method trackingCode }
//     （注意：OrderLine 无 productVariantId 字段，需用 productVariant { id }）
import { getAdminClient } from './client';

export interface OrderRow {
  id: string;
  code: string;
  state: string;
  active: boolean;
  totalWithTax: number;
  createdAt: string;
  currencyCode: string;
  orderPlacedAt?: string | null;
  customer?: { id: string; firstName: string; lastName: string; emailAddress?: string } | null;
  shippingLines?: Array<{ shippingMethod: { id: string; code: string; name: string } | null }>;
  customFields?: { deliveryType?: string | null };
}

export interface FulfillmentResult {
  id: string;
  state: string;
  method?: string;
  trackingCode?: string;
}

export interface OrderListOptions {
  take?: number;
  skip?: number;
  state?: string;
  keyword?: string;
}

export async function fetchOrders(opts: OrderListOptions = {}): Promise<{ totalItems: number; items: OrderRow[] }> {
  const { take = 20, skip = 0, state, keyword } = opts;
  const extra = state ? `, filter: { state: { eq: "${state}" } }` : '';
  const { orders } = await getAdminClient().request<{
    orders: { totalItems: number; items: OrderRow[] };
  }>(
    `query Orders($take: Int, $skip: Int) {
      orders(options: { take: $take, skip: $skip${extra} }) {
        totalItems
        items {
          id code state active totalWithTax createdAt currencyCode orderPlacedAt
          customer { id firstName lastName emailAddress }
          shippingLines { shippingMethod { id code name } }
          customFields { deliveryType }
        }
      }
    }`,
    { take, skip },
  );
  let items = orders.items;
  if (keyword) {
    const k = keyword.trim().toLowerCase();
    items = items.filter((o) => (o.code || '').toLowerCase().includes(k));
  }
  return { totalItems: orders.totalItems, items };
}

export interface OrderDetail {
  id: string; code: string; state: string; active: boolean;
  totalWithTax: number; currencyCode: string;
  createdAt: string; orderPlacedAt?: string | null;
  subTotal?: number; subTotalWithTax?: number; shippingWithTax?: number;
  customer?: { id: string; firstName: string; lastName: string; emailAddress?: string; phoneNumber?: string } | null;
  shippingAddress?: { fullName: string; streetLine1: string; city: string; province: string; countryCode: string; postalCode: string; phoneNumber?: string | null } | null;
  payments?: Array<{ id: string; state: string; method: string; amount: number; errorMessage?: string | null; transactionId?: string | null; createdAt: string }>;
  lines: Array<{ id: string; quantity: number; unitPriceWithTax: number; linePriceWithTax: number; productVariant: { id: string; name: string; sku: string } | null }>;
  shippingLines?: Array<{ shippingMethod: { id: string; code: string; name: string } | null }>;
  fulfillments?: Array<{ id: string; state: string; method?: string | null; trackingCode?: string | null; createdAt: string }>;
  customFields?: { deliveryType?: string | null; pickupClaimed?: boolean | null };
}

export async function fetchOrder(id: string): Promise<OrderDetail | null> {
  const { order } = await getAdminClient().request<{ order: OrderDetail | null }>(
    `query Order($id: ID!) {
      order(id: $id) {
        id code state totalWithTax currencyCode
        customer { id firstName lastName }
        lines { id quantity productVariant { id name sku } }
      }
    }`,
    { id },
  );
  return order;
}

// Task 8：订单详情（含金额/支付/物流/自提自定义字段），供详情页使用
const ORDER_DETAIL_FIELDS = `
  id code state active totalWithTax currencyCode createdAt orderPlacedAt
  subTotal subTotalWithTax shippingWithTax taxSummary { taxBase taxTotal }
  customer { id firstName lastName emailAddress phoneNumber }
  shippingAddress { fullName streetLine1 city province countryCode postalCode phoneNumber }
  payments { id state method amount errorMessage transactionId createdAt }
  lines { id quantity unitPriceWithTax linePriceWithTax productVariant { id name sku } }
  shippingLines { shippingMethod { id code name } }
  fulfillments { id state method trackingCode createdAt }
  customFields { deliveryType pickupClaimed }
`;

export async function fetchOrderDetail(id: string): Promise<OrderDetail | null> {
  const { order } = await getAdminClient().request<{ order: OrderDetail | null }>(
    `query OrderDetail($id: ID!) {
      order(id: $id) {${ORDER_DETAIL_FIELDS}}
    }`,
    { id },
  );
  return order;
}

// 取消订单：通过 transitionOrderToState(id, "Cancelled")，成功返回 true
export async function cancelOrder(orderId: string): Promise<boolean> {
  const { transitionOrderToState } = await getAdminClient().request<{
    transitionOrderToState?: { state?: string } | { errorCode?: string; message?: string } | null;
  }>(
    `mutation Cancel($id: ID!) {
      transitionOrderToState(id: $id, state: "Cancelled") {
        ... on Order { state }
        ... on ErrorResult { errorCode message }
      }
    }`,
    { id: orderId },
  );
  const r = transitionOrderToState as any;
  if (r && r.state) return true;
  throw new Error((r && r.message ? r.message : '取消失败') || '取消失败');
}

// 部分发货（按行选品 / 快递公司 / 多包裹）
export interface ShipLinePart { orderLineId: string; quantity: number }

export async function partialShip(
  orderId: string,
  parts: ShipLinePart[],
  method = 'standard',
  trackingCode?: string,
): Promise<FulfillmentResult> {
  if (!parts.length) throw new Error('请选择要发货的商品');
  const lines = parts.map((p) => ({ orderLineId: p.orderLineId, quantity: p.quantity }));
  const args = [{ name: 'method', value: method }];
  if (trackingCode) args.push({ name: 'trackingCode', value: trackingCode });
  const res = await getAdminClient().request<{
    addFulfillmentToOrder: FulfillmentResult | { errorCode: string; message: string };
  }>(
    `mutation Fulfill($input: FulfillOrderInput!) {
      addFulfillmentToOrder(input: $input) {
        ... on Fulfillment { id state method trackingCode }
        ... on ErrorResult { errorCode message }
      }
    }`,
    { input: { lines, handler: { code: 'manual-fulfillment', arguments: args } } },
  );
  const r = res.addFulfillmentToOrder;
  if ('errorCode' in r) { const e = r as any; throw new Error(`发货失败: ${e.message || e.errorCode}`); }
  return r as FulfillmentResult;
}
