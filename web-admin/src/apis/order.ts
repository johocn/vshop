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
import { getAdminClient, graphQlErrorMsg } from './client';

export interface OrderRow {
  id: string;
  code: string;
  state: string;
  active: boolean;
  totalWithTax: number;
  totalQuantity: number;
  createdAt: string;
  currencyCode: string;
  orderPlacedAt?: string | null;
  customer?: { id: string; firstName: string; lastName: string; emailAddress?: string; phoneNumber?: string } | null;
  shippingAddress?: {
    fullName?: string | null;
    streetLine1?: string | null;
    city?: string | null;
    province?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
    phoneNumber?: string | null;
  } | null;
  shippingLines?: Array<{
    shippingMethod: { id: string; code: string; name: string } | null;
  }>;
  lines?: Array<{ quantity: number; productVariant?: { name: string; featuredAsset?: { source?: string | null } | null } | null; linePriceWithTax?: number }>;
  payments?: Array<{ method?: string }>;
  customFields?: { deliveryType?: string | null; pickupClaimed?: boolean | null };
}

// 订单列表查询字段（含中国本地化所需的 手机号/支付方式/商品行/自提态）
const ORDER_FIELDS = `
  id code state active totalWithTax totalQuantity createdAt currencyCode orderPlacedAt
  customer { id firstName lastName emailAddress phoneNumber }
  lines { quantity productVariant { name featuredAsset { source } } linePriceWithTax }
  shippingAddress { fullName streetLine1 city province countryCode postalCode phoneNumber }
  shippingLines { shippingMethod { id code name } }
  payments { method }
  customFields { deliveryType pickupClaimed }
`;

// 本店商品单：对接 shop-plugin 既有 myShopOrders（跨渠道按商品 shopId 归集），返回全量无分页
export interface ShopOrderRow {
  orderId: string;
  code: string;
  state: string;
  totalWithTax: number;
  currencyCode: string;
  customerName?: string | null;
  placedAt?: string | null;
  shippingAddress?: {
    fullName?: string | null;
    streetLine1?: string | null;
    city?: string | null;
    province?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
  } | null;
  shippingLines?: Array<{ id?: string; code?: string | null; name?: string | null }>;
  items: Array<{
    orderLineId: string;
    productId: string;
    productName: string;
    variantName: string;
    quantity: number;
    fulfilledQuantity: number;
    lineTotalWithTax: number;
  }>;
}

export async function fetchShopOrders(): Promise<ShopOrderRow[]> {
  const { myShopOrders } = await getAdminClient().request<{ myShopOrders: ShopOrderRow[] }>(
    `query ShopOrders {
      myShopOrders {
        orderId code state totalWithTax currencyCode customerName placedAt
        shippingAddress { fullName streetLine1 city province countryCode postalCode }
        shippingLines { id code name }
        items { orderLineId productId productName variantName quantity fulfilledQuantity lineTotalWithTax }
      }
    }`,
  );
  return myShopOrders ?? [];
}

// 商品单缩略图：myShopOrders items 只带 productId, 无图;
// 按 productId 批量取商品级 featuredAsset.preview, 建 id→相对路径 映射(拼域名交给 orderFormat)。
export async function fetchProductThumbs(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return {};
  const chunk = 80; // 分批, 避免单次 in 数组过长
  const map: Record<string, string> = {};
  for (let i = 0; i < uniq.length; i += chunk) {
    const batch = uniq.slice(i, i + chunk);
    const { products } = await getAdminClient().request<{
      products: { items: Array<{ id: string; featuredAsset?: { preview?: string } | null }> };
    }>(
      `query ProductThumbs($ids: [String!]!) {
        products(options: { filter: { id: { in: $ids } } }) {
          items { id featuredAsset { preview } }
        }
      }`,
      { ids: batch },
    );
    for (const p of products.items) {
      const src = p.featuredAsset?.preview;
      if (src) map[p.id] = src; // 仅相对路径, 由 shopToView 经 imageFullUrl 拼完整
    }
  }
  return map;
}

export interface FulfillmentResult {
  id: string;
  state: string;
  method?: string;
  trackingCode?: string;
}

// 订单列表查询入参：filter 由 utils/orderFilter.ts 的 buildOrderFilter 组装后原样传变量，
// 不在查询文本里做字符串内插（消除注入面，R5）；条件全部下推服务端（R1/R2/R11）。
export interface OrderQueryInput {
  take?: number;
  skip?: number;
  filter?: Record<string, any> | null;
}

export async function fetchOrders(input: OrderQueryInput = {}): Promise<{ totalItems: number; items: OrderRow[] }> {
  const { take = 20, skip = 0, filter } = input;
  const options: Record<string, any> = { take, skip };
  if (filter) options.filter = filter;
  const { orders } = await getAdminClient().request<{
    orders: { totalItems: number; items: OrderRow[] };
  }>(
    `query Orders($options: OrderListOptions) {
      orders(options: $options) {
        totalItems
        items {${ORDER_FIELDS}}
      }
    }`,
    { options },
  );
  return { totalItems: orders.totalItems, items: orders.items };
}

/**
 * 统计/分组计数：一次请求取回多组 totalItems（GraphQL 别名）。
 * 别名与变量名由代码生成（数量固定、非用户输入），filter 值全部走变量，不做字符串内插。
 * filters[i] 为 null 表示该组不带条件（全量计数）。
 */
export async function fetchOrderCounts(filters: Array<Record<string, any> | null>): Promise<number[]> {
  if (!filters.length) return [];
  const varDefs = filters.map((_, i) => `$f${i}: OrderFilterParameter`).join(', ');
  const fields = filters
    .map((_, i) => `c${i}: orders(options: { take: 1, filter: $f${i} }) { totalItems }`)
    .join('\n      ');
  const variables: Record<string, any> = {};
  filters.forEach((f, i) => { variables[`f${i}`] = f; });
  const data = await getAdminClient().request<Record<string, { totalItems: number }>>(
    `query OrderCounts(${varDefs}) {
      ${fields}
    }`,
    variables,
  );
  return filters.map((_, i) => data[`c${i}`]?.totalItems ?? 0);
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

// 多仓拆分发货：按仓库逐仓调用 addFulfillmentToOrder（每仓独立 fulfillment）
export async function shipByWarehouse(
  orderId: string,
  shipments: Array<{ stockLocationId: string; parts: ShipLinePart[]; method?: string; trackingCode?: string }>,
): Promise<{ ok: string[]; fails: string[] }> {
  const ok: string[] = [];
  const fails: string[] = [];
  for (const s of shipments) {
    if (!s.parts.length) continue;
    try {
      await partialShip(orderId, s.parts, s.method || 'standard', s.trackingCode || undefined);
      ok.push(s.stockLocationId);
    } catch (e: any) {
      fails.push(`${s.stockLocationId}:${e?.message || '发货失败'}`);
    }
  }
  return { ok, fails };
}

// 订单备注：Vendure 内置 addNoteToOrder（只写不展示，本版本无 orderHistory 查询）
export async function addOrderNote(orderId: string, note: string): Promise<void> {
  try {
    const res = await getAdminClient().request<{ addNoteToOrder?: { id?: string } | { errorCode?: string; message?: string } }>(
      `mutation AddNote($input: AddNoteToOrderInput!) {
        addNoteToOrder(input: $input) { ... on Order { id } ... on ErrorResult { errorCode message } }
      }`,
      { input: { id: orderId, note, isPublic: false } },
    );
    const r = res.addNoteToOrder as any;
    if (!r || !r.id) throw new Error((r && r.message) || '备注失败');
  } catch (e: any) {
    throw new Error(e?.message || graphQlErrorMsg(e, '备注失败'));
  }
}

// 后台改价：仅可修改状态（AddingItems / ArrangingPayment）下使用；负 priceDelta = 降价
export async function modifyOrderPrice(orderId: string, priceDelta: number, note?: string): Promise<void> {
  try {
    const res = await getAdminClient().request<{ modifyOrder?: { id?: string } | { errorCode?: string; message?: string } }>(
      `mutation ModifyOrder($input: ModifyOrderInput!) {
        modifyOrder(input: $input) { ... on Order { id } ... on ErrorResult { errorCode message } }
      }`,
      {
        input: {
          dryRun: false,
          orderId,
          surcharges: [{ description: '后台改价', priceDelta }],
          note: note || '后台改价',
        },
      },
    );
    const r = res.modifyOrder as any;
    if (!r || !r.id) throw new Error((r && r.message) || '改价失败');
  } catch (e: any) {
    throw new Error(e?.message || graphQlErrorMsg(e, '改价失败'));
  }
}
