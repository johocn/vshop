// 订单域 admin-api 调用（Task 3，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - orders(options:{take,skip,filter:{state:{eq}}}) { totalItems items { id code state totalWithTax } } —— 可用
//   - order(id) { id code state totalWithTax currencyCode customer { id firstName lastName }
//       lines { id quantity productVariant { id name sku } } } —— 可用
//   - 发货 mutation 不是计划里的 fulfillOrder，实际为 addFulfillmentToOrder(input: FulfillOrderInput!)
//     FulfillOrderInput = { lines: [OrderLineInput!]!, handler: ConfigurableOperationInput! }
//     OrderLineInput = { orderLineId: ID!, quantity: Int! }
//     handler 用 manual-fulfillment（args: method / trackingCode），实测返回 { id state method }
//     （注意：OrderLine 无 productVariantId 字段，需用 productVariant { id }）
import { getAdminClient } from './client';

export interface OrderRow {
  id: string;
  code: string;
  state: string;
  totalWithTax: number;
  customerId?: string;
}

export interface FulfillmentResult {
  id: string;
  state: string;
  method?: string;
}

export async function fetchOrders(
  take = 20,
  skip = 0,
  state?: string,
): Promise<{ totalItems: number; items: OrderRow[] }> {
  const { orders } = await getAdminClient().request<{
    orders: { totalItems: number; items: OrderRow[] };
  }>(
    `query Orders($take: Int, $skip: Int, $state: String) {
      orders(options: { take: $take, skip: $skip, filter: { state: { eq: $state } } }) {
        totalItems items { id code state totalWithTax }
      }
    }`,
    { take, skip, state },
  );
  return orders;
}

export interface OrderLineItem {
  id: string;
  quantity: number;
  productVariant: { id: string; name: string; sku: string } | null;
}

export interface OrderDetail extends OrderRow {
  currencyCode: string;
  customer: { id: string; firstName: string; lastName: string } | null;
  lines: OrderLineItem[];
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

// 发货：先取订单行组装 lines，再调 addFulfillmentToOrder（manual-fulfillment handler）
export async function shipOrder(
  orderId: string,
  method = 'standard',
  trackingCode?: string,
): Promise<FulfillmentResult> {
  const { order } = await getAdminClient().request<{ order: { lines: Array<{ id: string; quantity: number }> } | null }>(
    `query OrderLines($id: ID!) { order(id: $id) { lines { id quantity } } }`,
    { id: orderId },
  );
  if (!order || order.lines.length === 0) {
    throw new Error('order not found or has no lines');
  }
  const lines = order.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity }));
  const args = [{ name: 'method', value: method }];
  if (trackingCode) {
    args.push({ name: 'trackingCode', value: trackingCode });
  }
  const res = await getAdminClient().request<{ addFulfillmentToOrder: FulfillmentResult }>(
    `mutation Fulfill($input: FulfillOrderInput!) {
      addFulfillmentToOrder(input: $input) {
        ... on Fulfillment { id state method }
        ... on ErrorResult { errorCode message }
      }
    }`,
    { input: { lines, handler: { code: 'manual-fulfillment', arguments: args } } },
  );
  return res.addFulfillmentToOrder;
}
