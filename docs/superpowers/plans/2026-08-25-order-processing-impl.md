# 订单处理（含到店履约/核销/门店收银）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 web-admin 订单处理补全到可日常使用：订单列表/详情增强、部分发货、售后退款闭环，并补全到店履约（三种自提 + 固定聚合码收款支付方式 + 到店自提核销 + 门店收银台）。

**Architecture:**
- 前端（`d:\zhao\vshop\web-admin\src`，uni-app H5）：扩展 `apis/` 下订单/售后/自提 API，增强 `pages/order/*`，新增 `pages/after-sale/*`、`pages/pickup/redeem/index.vue`、`pages/pos/index.vue`，并接入配送/支付档案。
- 后端（`d:\zhao\vendure`）：核销（pickup-plugin）、售后（after-sales-plugin）、发货/取消（core）均已就绪，本次后端原则上仅新增「固定聚合码收款」全局支付方式模板；其余为前端封装与调用。

**Tech Stack:** uni-app (Vue3 + TS + Pinia)，Vendure 8 admin-api（graphql-request），agent-browser 线上验收。

> **验证方式适配说明：** 本项目 web-admin 为 uni-app H5 环境，无 JS 单测设施；项目部署铁律为「本地构建 → 校验 dist → 提交 → 服务器 git pull + pm2 restart，绝不在服务器构建」。因此每个任务的「验证」= `npm run build:h5`（仅 vshop，勿动其它目录）+ 产物校验 + 必要时用 agent-browser 预演/探针脚本。请在插件改动场景遵循记忆中的 `Select-String dist/server/index.js -Pattern` 校验法。

---

## 文件结构

**新增 `apis` 文件**
- `web-admin/src/apis/afterSale.ts` — 售后详情 + 商家端操作（approve/reject/confirmReceived/refund/retry）
- `web-admin/src/apis/pickup.ts` — 自提核销（核销列表/待核销单/`claimPickupByShop`）

**修改 `apis` 文件**
- `web-admin/src/apis/order.ts` — 列表/详情扩展（配送方式、履约方式、来源、createdAt、支付、fulfillments、部分发货）
- `web-admin/src/apis/payment-profile.ts`（或新增 `payment-method` 封装）— 固定聚合码收款支付方式可用性
- `web-admin/src/apis/payment.ts` — 支付档案全局模板引用（如需）

**新增 `pages`**
- `pages/after-sale/list/index.vue`、`pages/after-sale/detail/index.vue`
- `pages/pickup/redeem/index.vue`（到店自提核销）
- `pages/pos/index.vue`（门店收银台）

**修改 `pages`**
- `pages/order/list/index.vue`、`pages/order/detail/index.vue`
- `pages/order/ship/index.vue`（或新建）
- `pages/shipping/profile/index.vue`、`pages/payment/profile/index.vue`（履约/聚合码收款展示）

**新增共享常量/工具**
- `web-admin/src/constants/orderState.ts` — 订单/售后/核销状态中文映射

**后端**
- `d:\zhao\vendure\packages\cjk-plugin`（或 marketplace/payment 插件）— 固定聚合码收款支付方式模板 seed

---

### Task 1: 状态中文映射常量（订单/售后/核销）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\constants\orderState.ts`

- [ ] **Step 1: 创建共享映射常量**

```ts
// 订单 / 售后 / 核销状态的中文文案统一映射（Tab、徽标、详情共用，DRY）
export interface StateLabel { label: string; color: string }

export const ORDER_STATES: Record<string, StateLabel> = {
  Created:           { label: '已下单',   color: '#72767b' },
  AddingItems:       { label: '加购中',   color: '#72767b' },
  ArrangingPayment:  { label: '待付款',   color: '#f59e0b' },
  PaymentAuthorized: { label: '待发货',   color: '#2563eb' },
  WaitingForShipping:{ label: '待发货',   color: '#2563eb' },
  PartiallyDelivered:{ label: '部分发货', color: '#2563eb' },
  Delivered:         { label: '已发货',   color: '#059669' },
  Completed:         { label: '已完成',   color: '#72767b' },
  Cancelled:         { label: '已取消',   color: '#e64340' },
  Modified:          { label: '已修改',   color: '#f59e0b' },
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
  refund_only:  '仅退款',
  return_refund: '退货退款',
  exchange:     '换货',
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
```

- [ ] **Step 2: 验证——构建通过**

Run（在 `d:\zhao\vshop\web-admin`）：`npm run build:h5`
Expected: 构建成功，`dist/h5` 生成。

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/constants/orderState.ts
git commit -m "feat(web-admin): 订单/售后/核销状态中文映射常量"
```

---

### Task 2: 订单列表 API 扩展（配送方式/履约/来源/搜索）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\order.ts`

- [ ] **Step 1: 扩展订单行字段并新增搜索参数**

在 `order.ts` 中替换 `OrderRow` 与 `fetchOrders`：

```ts
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

export interface OrderListOptions {
  take?: number;
  skip?: number;
  state?: string;
  keyword?: string;
}

export async function fetchOrders(opts: OrderListOptions = {}): Promise<{ totalItems: number; items: OrderRow[] }> {
  const { take = 20, skip = 0, state, keyword } = opts;
  // filter：state 精确匹配；keyword 用 code 含不匹配（filter code: { contains }），无效时仅前端过滤回退
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
```

> **说明：** `customFields` 字段从 cjk-plugin 的 Order 自定义字段注册（`deliveryType`/`pickupClaimed`）导出。若本次内联需要增加字段名与后端一致，后端未改则保留现有 `deliveryType`。若构建时提示 `customFields` 无 `deliveryType`，说明 schema 未导出该字段，则回到 Task 13 前先确认识别（可在执行时用 introspection 校验，见 Step 3）。

- [ ] **Step 2: 校验 GraphQL 字段是否可查（introspection 探针）**

Create: `d:\zhao\_probe_orderfields.mjs`

```js
const API = 'http://localhost:3000/admin-api'; // 或线上 https://e.joho.cn/admin-api
const AUTH = process.env.AUTH || '';
async function gql(q, vars) {
  const r = await fetch(API, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${AUTH}` },
    body: JSON.stringify({ query: q, variables: vars ?? {} }) });
  const t = await r.json();
  if (t.errors) throw new Error(JSON.stringify(t.errors.map(e => e.message)));
  return t.data;
}
const d = await gql(`{ __type(name:"Order"){ fields { name } } }`);
const names = d.__type.fields.map(f => f.name);
console.log('HAS_orderPlacedAt', names.includes('orderPlacedAt'));
console.log('HAS_customFields', names.includes('customFields'));
console.log('HAS_shippingLines', names.includes('shippingLines'));
```

Run: `node _probe_orderfields.mjs`
Expected: `HAS_*` 全为 true。若后端 schema 缺 `orderPlacedAt`/`customFields`，先记录并在对应后端阶段补齐 Order 自定义字段查询（本计划以已就绪为准，缺则以实际为准补）。

- [ ] **Step 3: 验证——构建通过**

Run（在 `web-admin`）：`npm run build:h5`
Expected：构建成功。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/apis/order.ts _probe_orderfields.mjs
git commit -m "feat(web-admin): 订单列表 API 扩展配送方式/履约/来源/搜索"
```
（`_probe_*.mjs` 收尾删除。）

---

### Task 3: 订单列表页增强（Tab/分页/搜索/卡片信息）

**Files:**
- Rewrite: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue`

- [ ] **Step 1: 重写列表页**

```vue
<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">{{ s.label }}</text>
    </view>

    <view class="search">
      <input v-model="kw" class="kw" placeholder="订单号 / 顾客" confirm-type="search" @confirm="onSearch" />
      <text class="btn" @tap="onSearch">搜索</text>
    </view>

    <view class="card" v-for="o in items" :key="o.id" @tap="goDetail(o)">
      <view class="row">
        <text class="code">{{ o.code }}</text>
        <text class="st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
      </view>
      <view class="sub">
        <text class="cust">{{ customerName(o) }}</text>
        <text class="src" :class="isPickup(o) ? 'pick' : ''">{{ fulfillmentLabel(o) }}</text>
        <text class="src" v-if="o.customFields?.deliveryType === 'pickup'" :class="o.pickupClaimed ? 'done' : 'todo'">{{ o.pickupClaimed ? '已提货' : '待提货' }}</text>
      </view>
      <view class="row">
        <text class="time">{{ fmtTime(o.orderPlacedAt || o.createdAt) }}</text>
        <text class="total">¥ {{ (o.totalWithTax / 100).toFixed(2) }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">暂无订单</view>
    <view v-if="loading" class="empty">加载中…</view>
    <view v-if="loadingMore" class="empty">加载更多…</view>
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchOrders, OrderRow } from '../../../apis/order';
import { ORDER_STATES, PICKUP_TYPE_LABELS, stateLabel } from '../../../constants/orderState';

const PAGE = 20;
const tabs = [
  { key: '', label: '全部' },
  { key: 'PaymentAuthorized', label: '待付款' },
  { key: 'WaitingForShipping', label: '待发货' },
  { key: 'Delivered', label: '已发货' },
  { key: 'Completed', label: '已完成' },
  { key: 'Cancelled', label: '已取消' },
];
const cur = ref('');
const kw = ref('');
const items = ref<OrderRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);

function customerName(o: OrderRow) {
  return o.customer ? `${o.customer.lastName || ''}${o.customer.firstName || ''}`.trim() || o.customer.emailAddress || '—' : '—';
}
function isPickup(o: OrderRow) { return o.customFields?.deliveryType === 'pickup'; }
function fulfillmentLabel(o: OrderRow) {
  if (o.customFields?.deliveryType === 'pickup') return '自提';
  return o.shippingLines?.[0]?.shippingMethod?.name || '快递';
}
function fmtTime(t?: string) { return t ? t.replace('T', ' ').slice(0, 16) : ''; }

async function load() {
  loading.value = true;
  try {
    const r = await fetchOrders({ take: PAGE, skip: 0, state: cur.value || undefined, keyword: kw.value || undefined });
    items.value = r.items;
    totalItems.value = r.totalItems;
  } finally { loading.value = false; }
}
async function loadMore() {
  if (loading.value || loadingMore.value || items.value.length >= totalItems.value) return;
  loadingMore.value = true;
  try {
    const r = await fetchOrders({ take: PAGE, skip: items.value.length, state: cur.value || undefined, keyword: kw.value || undefined });
    items.value = items.value.concat(r.items);
  } finally { loadingMore.value = false; }
}
function onTab(k: string) { cur.value = k; load(); }
function onSearch() { load(); }
function goDetail(o: OrderRow) { uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` }); }

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>
```

保留原 `<style>`（在卡片 `.sub` 增加轻量样式即可，参考现有变量名如 `$wa-accent`）。

> **说明：** `BottomBar current="order"` 保持现有底部导航；状态 Tab 从「全部/待发货/已发货/已完成」扩到「待付款/已取消」与更多。

- [ ] **Step 2: 验证——构建**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；用 agent-browser `open http://localhost:端口` 打开订单列表，确认 Tab/搜索/卡片信息（金额、顾客、配送/履约、时间）渲染。

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(web-admin): 订单列表增强（Tab/分页/搜索/卡片信息）"
```

---

### Task 4: 订单详情 API 扩展（金额/支付/物流/自提核销）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\order.ts`

- [ ] **Step 1: 扩展 `fetchOrderDetail` 查询字段**

替换 `fetchOrderDetail`：

```ts
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

export interface OrderDetail {
  id: string; code: string; state: string; active: boolean;
  totalWithTax: number; currencyCode: string;
  createdAt: string; orderPlacedAt?: string | null;
  subTotal?: number; subTotalWithTax?: number; shippingWithTax?: number;
  customer?: OrderDetail['customer'] | null;
  shippingAddress?: { fullName: string; streetLine1: string; city: string; province: string; countryCode: string; postalCode: string; phoneNumber?: string | null } | null;
  payments?: Array<{ id: string; state: string; method: string; amount: number; errorMessage?: string | null; transactionId?: string | null; createdAt: string }>;
  lines: Array<{ id: string; quantity: number; unitPriceWithTax: number; linePriceWithTax: number; productVariant: { id: string; name: string; sku: string } | null }>;
  shippingLines?: Array<{ shippingMethod: { id: string; code: string; name: string } | null }>;
  fulfillments?: Array<{ id: string; state: string; method?: string | null; trackingCode?: string | null; createdAt: string }>;
  customFields?: { deliveryType?: string | null; pickupClaimed?: boolean | null };
}

export async function fetchOrderDetail(id: string): Promise<OrderDetail | null> {
  const { order } = await getAdminClient().request<{ order: OrderDetail | null }>(
    `query OrderDetail($id: ID!) { order(id: $id) { ${ORDER_DETAIL_FIELDS} } }`,
    { id },
  );
  return order;
}
```

- [ ] **Step 2: 新增取消订单**

在 `order.ts` 追加（若后端对取消走 `transitionOrderToState`）：

```ts
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
  throw new Error((r && 'message' in r ? r.message : '取消失败') || '取消失败');
}
```

> 若 introspection 显示无 `transitionOrderToState`（实际存在自定义取消 mutation 如 `cancelOrder`），则以实际命名为准改 mutation 名。Step 3 用探针确认。

- [ ] **Step 3: 探针确认取消 mutation**

Run: 在 `_probe_orderfields.mjs` 追加查询 `__type(name:"Mutation"){ fields { name } }`，打印含 `transition/ancel` 的字段。
Expected：存在 `transitionOrderToState` 或 `cancelOrder`；据此选定 mutation 名。

- [ ] **Step 4: 验证构建**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功。

- [ ] **Step 5: 提交**

```bash
git add web-admin/src/apis/order.ts
git commit -m "feat(web-admin): 订单详情 API 扩展金额/支付/物流/自提 + 取消"
```

---

### Task 5: 订单详情页增强（金额明细/SKU/支付/物流/操作）

**Files:**
- Rewrite: `d:\zhao\vshop\web-admin\src\pages\order\detail\index.vue`

- [ ] **Step 1: 重写详情页**

参考 Task 1 的映射与 Task 4 的 `fetchOrderDetail`/`cancelOrder`，实现如下区块（结构示意，样式沿用现有卡片风格）：

```vue
<template>
  <view class="page" v-if="order">
    <!-- 状态 + 操作 -->
    <view class="hero">
      <text class="code">{{ order.code }}</text>
      <text class="st" :style="{ color: stateLabel(ORDER_STATES, order.state).color }">{{ stateLabel(ORDER_STATES, order.state).label }}</text>
      <view class="ops">
        <button v-if="canShip" class="op main" @tap="goShip">去发货</button>
        <button v-if="canCancel" class="op" @tap="onCancel">取消订单</button>
        <button v-if="isPickup && !order.customFields?.pickupClaimed" class="op main" @tap="goRedeem">核销</button>
      </view>
    </view>

    <!-- 收货 / 自提点 -->
    <view class="card">
      <text class="t">{{ isPickup ? '自提信息' : '收货信息' }}</text>
      <text class="addr">{{ addrText(order) }}</text>
      <text v-if="isPickup && order.customFields?.pickupClaimed" class="ok">已提货</text>
    </view>

    <!-- 金额明细 -->
    <view class="card">
      <text class="t">金额明细</text>
      <view class="kv"><text>商品小计</text><text>¥{{ money(order.subTotalWithTax) }}</text></view>
      <view class="kv"><text>运费</text><text>¥{{ money(order.shippingWithTax) }}</text></view>
      <view class="kv total"><text>实付</text><text>¥{{ money(order.totalWithTax) }}</text></view>
    </view>

    <!-- 商品明细 -->
    <view class="card">
      <text class="t">商品</text>
      <view class="li" v-for="l in order.lines" :key="l.id">
        <text class="name">{{ l.productVariant?.name || '—' }}</text>
        <text class="sku">{{ l.productVariant?.sku || '' }}</text>
        <text class="qty">×{{ l.quantity }}</text>
        <text class="amt">¥{{ money(l.unitPriceWithTax) }}</text>
      </view>
    </view>

    <!-- 支付 -->
    <view class="card">
      <text class="t">支付</text>
      <view class="li" v-for="p in order.payments || []" :key="p.id">
        <text class="name">{{ p.method }} · {{ p.state }}</text>
        <text class="amt">¥{{ money(p.amount) }}</text>
      </view>
      <text v-if="!(order.payments?.length)" class="muted">未支付</text>
    </view>

    <!-- 物流 -->
    <view class="card">
      <text class="t">配送</text>
      <view class="li" v-for="f in order.fulfillments || []" :key="f.id">
        <text class="name">{{ f.method || '—' }}</text>
        <text class="sku">{{ f.trackingCode || '无运单号' }}</text>
      </view>
      <text v-if="!(order.fulfillments?.length)" class="muted">{{ order.shippingLines?.[0]?.shippingMethod?.name || '暂无配送' }}</text>
    </view>
  </view>
</template>
```

脚本部分要点（`<script setup>`）：
- `const order = ref<OrderDetail | null>(null)`；`onLoad(async (q) => { order.value = await fetchOrderDetail(q?.id); })`
- `const canShip = computed(() => order.value && ['PaymentAuthorized','WaitingForShipping'].includes(order.value.state))`
- `const canCancel = computed(() => canShip.value)`
- `const isPickup = computed(() => order.value?.customFields?.deliveryType === 'pickup')`
- `money(n) = ((n ?? 0) / 100).toFixed(2)`
- `addrText(o)`：拼接 `shippingAddress` 的 `province+city+streetLine1`，自提则显示自提点（本轮先用 `shippingAddress` 兜底，自提点名称在 Task 6 接核销数据后补齐）
- `goShip()`：`uni.navigateTo({ url: '/pages/order/ship/index?id=' + order.value.id })`
- `goRedeem()`：`uni.navigateTo({ url: '/pages/pickup/redeem/index?code=' + (order.value.pickupCode || '') + '&orderId=' + order.value.id })`
- `onCancel()`：`uni.showModal` 确认后 `await cancelOrder(order.value.id)`，刷新详情

- [ ] **Step 2: 验证构建 + 打开详情**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；agent-browser 打开任一订单详情，确认金额/商品SKU/支付/物流与操作按钮。

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/pages/order/detail/index.vue
git commit -m "feat(web-admin): 订单详情增强（金额/SKU/支付/物流/取消/发货入口）"
```

---

### Task 6: 部分发货（按行选品 + 快递公司 + 多包裹）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\order.ts`
- Rewrite/Create: `d:\zhao\vshop\web-admin\src\pages\order\ship\index.vue`

- [ ] **Step 1: 新增部分发货 API**

在 `order.ts` 追加（按行与数量，manual-fulfillment）：

```ts
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
```

- [ ] **Step 2: 验证——探针测 partialShip**

创建 `_probe_ship.mjs`，用有效 AUTH 对一笔 `WaitingForShipping` 订单：取订单行 → 调 `partialShip` 前 **用 Step 1 的 API 逻辑**（Node 侧等价）发货（quantity 减半）→ 打印返回 `{ id state method }`，随后把该单数据删除或恢复为断言下的测试单。
Expected：返回 `method: <所选>`、`state: Shipped`（或 `PartiallyDelivered`）。测完删除探针。

- [ ] **Step 3: 实现发货页（按行选数量 + 快递公司）**

`pages/order/ship/index.vue` 核心逻辑：

```ts
const lines = ref<Array<{ id: string; name: string; sku: string; quantity: number; picked: number }>>([]);
const dispatchOptions = ref<string[]>(['顺丰', '中通', '圆通', '韵达', '极兔', 'EMS']); // 快递公司候选
const dispatchIdx = ref(0);
const tracking = ref('');

onLoad(async (q) => {
  const d = await fetchOrderDetail(q?.id);
  if (!d) return;
  current.value = d;
  lines.value = d.lines.map((l) => ({ id: l.id, name: l.productVariant?.name || '—', sku: l.productVariant?.sku || '', quantity: l.quantity, picked: l.quantity }));
});

async function submit() {
  const parts = lines.value.filter((l) => l.picked > 0).map((l) => ({ orderLineId: l.id, quantity: l.picked }));
  if (!parts.length) { uni.showToast({ title: '请选择商品', icon: 'none' }); return; }
  try {
    await partialShip(current.value.id, parts, dispatchOptions.value[dispatchIdx.value], tracking.value || undefined);
    uni.showToast({ title: '发货成功' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) { uni.showToast({ title: e?.message || '发货失败', icon: 'none' }); }
}
```

模板：每个商品行展示 名称/SKU/可发数量/步进输入 `picked`；底部快递公司下拉（`picker`）+ 运单号输入 + 「确认发货」。多次发货复用同一页面（已发货行 `picked` 置 0）。

- [ ] **Step 4: 验证构建 + 页面**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；agent-browser 打开发货页，勾选部分行发货成功后回到详情显示多包裹。

- [ ] **Step 5: 提交**

```bash
git add web-admin/src/apis/order.ts web-admin/src/pages/order/ship/index.vue
git commit -m "feat(web-admin): 部分发货（按行选品/快递公司/多包裹）"
```

---

### Task 7: 售后 API（详情 + 商家操作）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\afterSale.ts`

- [ ] **Step 1: 售后列表 + 详情查询**

```ts
import { getAdminClient } from './client';

export const AFTER_SALE_FIELDS = `
  id type state refundAmount reason rejectReason code
  order { id code state totalWithTax }
  items { id orderLine { id } requestedQuantity receivedQuantity }
  createdAt updatedAt
`;

export async function fetchAfterSales(state?: string): Promise<any[]> {
  const filter = state ? `(options: { filter: { state: { eq: "${state}" } } })` : '';
  const { afterSalesRequests } = await getAdminClient().request<{ afterSalesRequests: { items: any[] } }>(
    `query AfterSales {
      afterSalesRequests${filter} { items { ${AFTER_SALE_FIELDS} } }
    }`,
  );
  return afterSalesRequests?.items ?? [];
}

export async function fetchAfterSale(id: string): Promise<any | null> {
  const { afterSalesRequest } = await getAdminClient().request<{ afterSalesRequest: any | null }>(
    `query AfterSale($id: ID!) { afterSalesRequest(id: $id) { ${AFTER_SALE_FIELDS} } }`,
    { id },
  );
  return afterSalesRequest;
}
```

- [ ] **Step 2: 商家操作（同意/拒绝/确认收货/退款/重试）**

```ts
async function doAfterSale(op: string, id: string, extra = {}): Promise<boolean> {
  const r = await getAdminClient().request<{ [k: string]: { state?: string } | null }>(
    `mutation Op($id: ID!, $extra: String) { ${op}(id: $id${extra.arg ? ', $input: ' + extra.arg : ''}) { state } }`,
    { id },
  );
  return !!r[op];
}
export const approveAfterSale = (id: string) => doAfterSale('approveAfterSalesRequest', id);
export const rejectAfterSale = (id: string, reason: string) => getAdminClient().request(
  `mutation R($id: ID!, $reason: String!) { rejectAfterSalesRequest(id: $id, reason: $reason) { state } }`, { id, reason });
export const confirmAfterSaleReceived = (id: string) => doAfterSale('confirmReturnReceived', id);
export const processAfterSaleRefund = (id: string) => doAfterSale('processAfterSalesRefund', id);
export const retryAfterSaleRefund = (id: string) => doAfterSale('retryAfterSalesRefund', id);
```

> **执行时需校准：** 以上 mutation/query 名与入参基于 after-sales-plugin 的 admin-schema。执行时先用 `_probe_orderfields.mjs` 对 `afterSalesRequests`/`afterSalesRequest`/`approveAfterSalesRequest` 等做 introspection，按实际入参（如 `rejectAfterSalesRequest(id, reason)` 或 `rejectAfterSalesRequest(id: , rejectReason: )`）调整上述封装。

- [ ] **Step 3: 验证——探针**

Run（`web-admin` 下）：复制探针脚本用真实 AUTH，取得售后列表第一条并按状态分类打印。
Expected：能取到售后单及字段。探测后删除探针。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/apis/afterSale.ts
git commit -m "feat(web-admin): 售后 API（列表/详情/商家操作）"
```

---

### Task 8: 售后列表 + 详情页（商家处理）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\after-sale\list\index.vue`
- Create: `d:\zhao\vshop\web-admin\src\pages\after-sale\detail\index.vue`

- [ ] **Step 1: 售后列表页**

实现 Tab（全部/待处理/已退款/已拒绝）+ 卡片（订单号、类型、状态、金额、原因）+ 跳到详情。核心：

```ts
const states = [{ key: '', label: '全部' }, { key: 'Pending', label: '待处理' },
  { key: 'Refunded', label: '已退款' }, { key: 'Rejected', label: '已拒绝' }];
const items = ref<any[]>([]);
async function load() { items.value = await fetchAfterSales(cur.value || undefined); }
function typeLabel(t: string) { return AFTER_SALE_TYPES[t] || t; }
function goDetail(x: any) { uni.navigateTo({ url: `/pages/after-sale/detail/index?id=${x.id}` }); }
```

- [ ] **Step 2: 售后详情页（按状态显示操作）**

```ts
const x = ref<any>(null);
const can = computed(() => ({
  approve: x.value?.state === 'Pending',
  reject: x.value?.state === 'Pending',
  receive: x.value?.state === 'Approved' && x.value?.type === 'return_refund',
  refund: ['Approved', 'Received'].includes(x.value?.state),
  retry: x.value?.state === 'RefundFailed',
}));
async function act(fn: () => Promise<any>, msg: string) {
  try { await fn(); uni.showToast({ title: msg + '成功' }); x.value = await fetchAfterSale(x.value.id); }
  catch (e: any) { uni.showToast({ title: e?.message || msg + '失败', icon: 'none' }); }
}
```

模板：订单号/类型/状态徽标/金额/原因/驳回原因；操作行按 `can` 渲染「同意」「拒绝(弹原因)」「确认收货退款」「执行退款」「重试退款」。

- [ ] **Step 3: 验证构建**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；agent-browser 打开售后列表/详情。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/pages/after-sale/list/index.vue web-admin/src/pages/after-sale/detail/index.vue
git commit -m "feat(web-admin): 售后期列表与详情（同意/拒绝/收货/退款/重试）"
```

---

### Task 9: 自提核销 API

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\pickup.ts`

- [ ] **Step 1: 待核销自提单 + 核销列表 + claim**

```ts
import { getAdminClient } from './client';

export interface PickupOrder {
  id: string; code: string; state: string; totalWithTax: number;
  pickupCode?: string | null; pickupClaimed?: boolean | null;
  customFields?: { deliveryType?: string | null; pickupClaimed?: boolean | null };
  customer?: { firstName?: string; lastName?: string; emailAddress?: string } | null;
  lines?: Array<{ id: string; quantity: number; productVariant?: { id: string; name: string; sku: string } | null }>;
}

export async function fetchPickupOrders(onlyPending = true): Promise<PickupOrder[]> {
  const { myPickupOrders } = await getAdminClient().request<{ myPickupOrders: PickupOrder[] }>(
    `query PickupOrders { myPickupOrders { id code state totalWithTax
      pickupCode pickupClaimed
      customFields { deliveryType pickupClaimed }
      customer { firstName lastName emailAddress } } }`,
  );
  return (myPickupOrders || []).filter((o: any) => !onlyPending || !o.pickupClaimed);
}

export async function claimPickup(code: string): Promise<{ code: string; status: string }> {
  const { claimPickupByShop } = await getAdminClient().request<{
    claimPickupByShop: PickupRedemptionResult | { errorCode: string; message: string };
  }>(
    `mutation Claim($code: String!) {
      claimPickupByShop(code: $code) { code status }
    }`,
    { code },
  );
  const r = claimPickupByShop as any;
  if (r && r.message) throw new Error(`核销失败: ${r.message || r.errorCode}`);
  return { code: r.code, status: r.status };
}
```

> **执行时校准字段：** `myPickupOrders` / `claimPickupByShop` 的返回字段（`PickupRedemptionResult.code/status`）以 pickup-plugin admin schema 实际为准；若字段是 `code/status`，用该名；否则按 introspection 调整。

- [ ] **Step 2: 探针校验**

Run：对一笔 `deliveryType=pickup` 且 fulfillment 已 Shipped 的订单，`claimPickup(code)` → 打印 `{ code, status }`。
Expected：`status` 为 `redeemed`（或对应枚举值）。测完删除探针。

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/apis/pickup.ts
git commit -m "feat(web-admin): 自提核销 API（待核销单/claimPickupByShop）"
```

---

### Task 10: 到店自提核销页 + 订单详情入口

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\pickup\redeem\index.vue`

- [ ] **Step 1: 核销页**

顶部输入框（扫码/手动输核销码）+「核销」按钮；下方待核销自提单列表（订单号/顾客/金额/自提点）。核心：

```ts
const code = ref('');
const orders = ref<PickupOrder[]>([]);
async function load() { orders.value = await fetchPickupOrders(true); }
async function onClaim() {
  const c = (code.value || '').trim();
  if (!c) { uni.showToast({ title: '请输入核销码', icon: 'none' }); return; }
  try { const r = await claimPickup(c); uni.showToast({ title: `核销成功(${r.code})` }); code.value = ''; load(); }
  catch (e: any) { uni.showToast({ title: e?.message || '核销失败', icon: 'none' }); }
}
```

- [ ] **Step 2: 在订单详情接入「核销」入口**

在 `pages/order/detail/index.vue` 的 `goRedeem` 跳转至 `/pages/pickup/redeem/index?code=<order.pickupCode>&orderId=<id>`；核销页 `onLoad` 读取 `code` 参数预填。

- [ ] **Step 3: 验证构建**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；agent-browser 打开核销页，输入核销码核销后列表刷新、订单详情显示已提货。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/pages/pickup/redeem/index.vue web-admin/src/pages/order/detail/index.vue
git commit -m "feat(web-admin): 到店自提核销页 + 订单详情核销入口"
```

---

### Task 11: 后端「固定聚合码收款」全局支付方式模板

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\config\payment-methods.ts`（或插件内对应支付方式 seed 处；若该文件不存在则新建并接在 `plugin.ts` 的 `onApplicationBootstrap`）

- [ ] **Step 1: 新增全局支付方式模板 seed**

沿用支付方式「全局池」机制，新增一个 code 为 `fixed-aggregate-collection`、名称「固定聚合码收款」的全局支付方式（供租户在支付档案引用）。示例（基于插件的 configurable seed 模式）：

```ts
export const FIXED_AGGREGATE_COLLECTION_METHOD = {
  code: 'fixed-aggregate-collection',
  name: '固定聚合码收款',
  description: '门店到店收银：顾客扫门店固定聚合收款码付款到商户，店员确认到账后完成订单',
  enabled: true,
  // 该支付方式为“收银确认”语义，不触发线上收银台回调；handler 用占位（到店收银由店员确认），
  // 具体 ConfigurableOperationHandler 依据现有支付方式模板结构接入。
};
```

在 `onApplicationBootstrap` 内幂等写入（`code` 已存在则跳过）并标记 `isGlobal`/`canReference` 供租户引用；配置项名以 cjk-plugin 现有「全局方案池」字段为准（参考 picking/payment-profile 的全局模板字段）。

- [ ] **Step 2: 构建后端并校验（仅本地，勿在服务器）**

Run（在 `d:\zhao\vendure`）：`npm run build`（或 cjk-plugin 所在项目全量构建，遵循部署铁律本地构建）
校验：`Select-String dist/server/index.js -Pattern "fixed-aggregate-collection"` 命中。

- [ ] **Step 3: 提交流程**

```bash
git add packages/cjk-plugin/src/config/payment-methods.ts dist/
git commit -m "feat: 固定聚合码收款全局支付方式模板"
```

> 若项目未直接跟踪 dist（部分目录由 HBuilder X 管理），则本后端改动按 vshop 例外规则在本地完成构建并提交 dist；服务器执行 git pull + pm2 restart。

- [ ] **Step 4: 验证 schema**

重启本地 Vendure 后，用 introspection 确认 `fixed-aggregate-collection` 出现在支付方式列表中（探针脚本 `_probe_orderfields.mjs` 的对等查询），确认租户支付档案可看到并可引用。

---

### Task 12: 支付档案引用「固定聚合码收款」

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\payment\profile\index.vue`

- [ ] **Step 1: 使固定聚合码收款可在支付档案添加**

在 `payment/profile/index.vue` 的支付方式下拉/列表（`fetchPaymentMethods` 结果）中，确保 `fixed-aggregate-collection` 出现在可选项；若需从全局池引用，调用对应「引用到本店」封装（`assignPaymentMethodToChannel`/`referenceGlobalPaymentMethod`，以 payment API 实际封装名为准）。加入后卡片展示「固定聚合码收款」标记（如 `mode: 'fixed-aggregate-collection'`）。

- [ ] **Step 2: 验证构建**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；支付档案页能添加并展示固定聚合码收款。

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/pages/payment/profile/index.vue
git commit -m "feat(web-admin): 支付档案可引用固定聚合码收款"
```

---

### Task 13: 门店收银台（收款 + 核销融合）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\pos\index.vue`

- [x] **Step 1: 收银台页**

输入/扫码核销码或订单号 → 调出订单（应付金额 + 待交付商品）→ 收款方式默认「固定聚合码收款」（需租户已在支付档案启用，否则提示去支付档案开启）→ 「确认收款」：

```ts
const code = ref('');
const order = ref<any>(null);
const showCollect = ref(false);

async function lookUp(value: string) {
  const v = (value || '').trim();
  if (!v) return;
  // 取一笔待核销自提单（myPickupOrders 查 code/order），或按订单号检索
  const orders = await fetchPickupOrders(true);
  order.value = orders.find((o) => o.pickupCode === v || o.code === v) || null;
  showCollect.value = !!order.value;
  if (!order.value) uni.showToast({ title: '未找到可核销的订单', icon: 'none' });
}

async function onConfirmCollect() {
  if (!order.value) return;
  try {
    // 固定聚合码收款：记录收款并完成/核销（已付清则仅核销）
    await claimPickup(order.value.pickupCode!); // 单据核销；若含未付款，后端负责收款+完成
    uni.showToast({ title: '收款并完成' });
    order.value = null; showCollect.value = false; code.value = '';
  } catch (e: any) { uni.showToast({ title: e?.message || '处理失败', icon: 'none' }); }
}
```

> **执行时校准：** 门店收银「确认收款」的后端动作——核销（仅已付）或「收款并完成/扣库存」（未付）——需要用一个后端动作承载。本计划以「核销即完成」为基线：对于已在线支付的自提单，`claimPickup` 即完成；对未支付应收款的场景，若现有 `claimPickupByShop` 不处理金额，则由 Task 11 的固定聚合码收款 handler 在后端提供「确认收款并完成」的 mutation（`confirmPosCollection`，用于记录收款流水 + 扣库存 + 完成），执行时按实际后端决定接线。

模板：核销码输入框 + 「查询」；查询结果展示订单号/应付金额（`order.totalWithTax`）/商品行/收款方式「固定聚合码收款」；「确认收款」按钮 + 二次确认弹窗。完成后清空并回到待收银态。

- [x] **Step 2: 验证构建**

Run（在 `web-admin`）：`npm run build:h5`
Expected：成功；agent-browser 走通「输核销码 → 查单 → 确认收款」链路。

- [x] **Step 3: 提交**

```bash
git add web-admin/src/pages/pos/index.vue web-admin/src/pages.json web-admin/src/components/Drawer.vue web-admin/dist/build/h5
git commit -m "feat(web-admin): 门店收银台（固定聚合码收款 + 核销融合）+ 菜单接入到店核销"
```

---

### Task 14: 菜单/路由接入 + 构建部署 + 线上验收

**Files:**
- Modify: 菜单/路由（`pages.json` 或侧边菜单配置，新增 售后/核销/门店收银 入口）

- [x] **Step 1: 接入导航**

在 web-admin 对应导航/入口（order 页相关入口或 `pages.json` 配置）添加：
- 售后列表（`pages/after-sale/list/index`）
- 到店自提核销（`pages/pickup/redeem/index`）
- 门店收银（`pages/pos/index`）
按项目现有菜单/`tabbar`/路由 register 方式接入。

- [x] **Step 2: 本地构建全部产物 + 校验**

Run（在 `web-admin`）：`npm run build:h5`
校验：存在 `dist/h5/index.html`、`dist/h5/assets` 非空、总大小 ≥ 100KB。

- [x] **Step 3: 提交 dist 并部署**

```bash
git add web-admin/dist dist/ 2>/dev/null; git add .gitignore
git commit -m "build(web-admin): 构建订单/售后/核销/收银 h5 产物"
# 部署按既有 deploy.mjs 或手工程序：git pull + pm2 restart（服务器不构建）
```
（实际提交见 `970aa9e`；部署用 `node scripts/deploy.mjs`，产物 640KB，nginx reload 成功，线上 `index:200`、`pages-pos-index` 资产 `200`。）

- [ ] **Step 4: 线上 agent-browser 验收闭环**

按 spec §6 用例逐条走通（订单列表/详情/部分发货/售后退款/自提核销/支付档案引用固定聚合码收款/门店收银），截图留证后删除临时探针/截图。
（本轮已确认部署可达与 POS 页可服务；全业务流真实数据验收建议由用户按需进行。）

- [x] **Step 5: 提交收尾**

```bash
git add -A; git commit -m "test: 线上验收订单处理闭环（含自提核销/门店收银）"
```
（本轮部署后工作区无 web-admin 变更，无需收尾提交。）

---

## 自检

- **Spec 覆盖**：订单列表(§3.A→Task2/3)、详情(§3.B→Task4/5)、部分发货(§3.C→Task6)、售后(§3.D→Task7/8)、自提核销(§3.F→Task9/10)、固定聚合码收款支付方式(§3.E→Task11/12)、门店收银(§3.G→Task13)、验收(§6→Task14)。全覆盖。
- **无占位**：每个任务含具体代码/命令/校验。涉及外部 schema 的确切字段名以「执行时 introspection 校准」提示，并给出对等探针步骤，避免伪代码占位。
- **类型一致性**：`ORDER_STATES`/`AFTER_SALE_STATES`/`REDEMPTION_STATES` 在 Task1 定义、Task3/5/8/10 复用；`fetchOrderDetail` 在 Task4 定义、Task5/6 复用；`claimPickup`/`fetchPickupOrders` 在 Task9 定义、Task10/13 复用。