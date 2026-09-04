# 订单列表中国本地化改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `web-admin` 运营端订单列表页 `/pages/order/list/index.vue` 改造成「手机卡片 + 桌面表格」响应式、带统计条与核销入口的中文电商订单页。

**Architecture:** 引入一个展示层视图模型 `OrderView`，把「本店渠道单」(fetchOrders) 与「本店商品单」(myShopOrders) 两种异构数据统一成同一渲染结构；页面同一次加载即渲染卡片列表和桌面表格两份 DOM，用 CSS 媒体查询按断点显隐（手机显示卡片，桌面显示表格）。统计与核销集合在 `onMounted` 并行拉取，与列表互相独立、失败互不阻塞。

**Tech Stack:** uni-app H5（Vue3 `<script setup>` + SCSS）、`@dcloudio/uni-app`、Playwright(python) 用于 e2e 验证，`d:\zhao\vshop\web-admin`。开发服务 `npm run dev:h5` 托管于 `http://localhost:5280/guanli/`（hash 路由）。

---

## 前置约束（务必先读）

- 数据层 schema 已校准（见 `src/apis/order.ts` 头注释）；以下字段均已在 admin-api 确认可用：`customer.phoneNumber`、`payments { method }`、`shippingLines { shippingAddress { phoneNumber } }`、`lines { quantity productVariant { name } linePriceWithTax }`、`customFields { deliveryType pickupClaimed }`。
- 核销态判定：`fetchPickupOrders(true)`（= `myPickupOrders`）后端只返回 `generated`（待核销）记录；其 `orderId` 集合就是"待核销"订单集合。无需改后端。
- 样式 SCSS 变量：`$wa-bg/$wa-card/$wa-radius/$wa-muted/$wa-ink/$wa-accent/$wa-danger`；单位用 `rpx`。媒体查询桌面断点取 `min-width:768px`。
- 每次 Task 结束用下方统一构建命令验证编译，并 git 提交（仓库根在 `d:/zhao/vshop`，通过 `web-admin/` 前缀路径提交）。

统一命令：
- 构建：`cd d:\zhao\vshop\web-admin; npm run build:h5`
- 提交：`cd d:\zhao\vshop; git add web-admin/<path>; git commit -m "<msg>"`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/utils/orderFormat.ts` | **新建**。纯函数 + 视图模型：`maskPhone/fmtMoney/isToday/isToBeShipped/isRefundApprox/computeStats`、`OrderView` 类型、`channelToView`/`shopToView` 构建器、`goodsTotalQty`/`isGhostView` |
| `src/apis/order.ts` | `OrderRow` 接口补字段；`fetchOrders` 查询体与 `ORDER_FIELDS` 常量补可选字段（lines/payments/shippingAddress/customer.phoneNumber） |
| `src/pages/order/list/index.vue` | 主体改造：统计条 + topbar 核销入口 + scope + tabs + search + 手机卡片 + 桌面表格 + 核销逻辑 + 响应式样式 |
| `_e2e/order_list_localization.py` | **新建**。Playwright 验证脚本（登录→断然切换到订单列表→手机/桌面双视口截图+结构断言） |

---

## Task 1: 数据层：`OrderRow` 补字段并扩展 `fetchOrders` 查询

**Files:**
- Modify: `src/apis/order.ts`

- [ ] **Step 1: 扩展 `OrderRow` 接口**（第 14-27 行 `interface OrderRow` 原位替换）

```ts
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
  shippingLines?: Array<{
    shippingMethod: { id: string; code: string; name: string } | null;
    shippingAddress?: { phoneNumber?: string | null } | null;
  }>;
  lines?: Array<{ quantity: number; productVariant?: { name: string } | null; linePriceWithTax?: number }>;
  payments?: Array<{ method?: string }>;
  customFields?: { deliveryType?: string | null; pickupClaimed?: boolean | null };
}
```

- [ ] **Step 2: 用一个共享常量承载列表可选字段，并让 `fetchOrders` 引用它**

  将第 29-34 行的 `const ORDER_FIELDS`（原为 `customFields { deliveryType }` 的简版，实际未在 `fetchOrders` 中使用）替换为：

```ts
// 订单列表查询字段（含中国本地化所需的 手机号/支付方式/商品行/自提态）
const ORDER_FIELDS = `
  id code state active totalWithTax totalQuantity createdAt currencyCode orderPlacedAt
  customer { id firstName lastName emailAddress phoneNumber }
  lines { quantity productVariant { name } linePriceWithTax }
  shippingLines { shippingMethod { id code name } shippingAddress { phoneNumber } }
  payments { method }
  customFields { deliveryType pickupClaimed }
`;
```

- [ ] **Step 3: `fetchOrders` 的 GraphQL 内联字段改用该常量**（第 91-96 行的 `items { ... }` 块）

```ts
    `query Orders($take: Int, $skip: Int) {
      orders(options: { take: $take, skip: $skip${extra} }) {
        totalItems
        items {${ORDER_FIELDS}}
      }
    }`,
```

- [ ] **Step 4: 构建验证**
  Run: `cd d:\zhao\vshop\web-admin; npm run build:h5`
  Expected: 构建成功退出码 0，无 TS 类型报错。

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vshop; git add web-admin/src/apis/order.ts; git commit -m "feat(web-admin): extend order list query fields for phone/payment/lines"
```

---

## Task 2: 新建纯函数工具与视图模型 `src/utils/orderFormat.ts`

**Files:**
- Create: `src/utils/orderFormat.ts`

- [ ] **Step 1: 新建文件，粘贴完整实现**

```ts
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
```

- [ ] **Step 2: 构建验证**
  Run: `cd d:\zhao\vshop\web-admin; npm run build:h5`
  Expected: 构建成功退出码 0（本 Task 仅新增文件，不引包进页面也不会报错）。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vshop; git add web-admin/src/utils/orderFormat.ts; git commit -m "feat(web-admin): add order list view model and format utils"
```

---

## Task 3: 重构订单列表页 `index.vue`（统计 + 顶部核销入口 + scope/tabs/search + 手机卡片 + 桌面表格 + 响应式）

**Files:**
- Modify: `src/pages/order/list/index.vue`（整文件替换）

- [ ] **Step 1: 用下面的完整文件覆盖 `src/pages/order/list/index.vue`**

```vue
<template>
  <view class="page">
    <view class="topbar">
      <text class="title">订单</text>
      <view class="redeem-btn" @tap="goRedeemPage">核销码</view>
    </view>

    <view class="stats">
      <view class="stat">
        <text class="num">{{ stats.today }}</text>
        <text class="lbl">今日订单</text>
      </view>
      <view class="stat">
        <text class="num">{{ stats.toShip }}</text>
        <text class="lbl">待发货</text>
      </view>
      <view class="stat">
        <text class="num">{{ stats.refund }}</text>
        <text class="lbl">待退款</text>
      </view>
    </view>

    <view class="scope">
      <text v-for="s in scopes" :key="s.key" :class="{ on: s.key === scope }" @tap="onScope(s.key)">{{ s.label }}</text>
    </view>
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">{{ s.label }}</text>
    </view>
    <view class="search">
      <input v-model="kw" class="kw" placeholder="订单号 / 顾客 / 手机号" confirm-type="search" @confirm="onSearch" />
      <text class="btn" @tap="onSearch">搜索</text>
    </view>

    <!-- 手机：卡片列表（<768 显示） -->
    <view class="card-list">
      <view class="card" v-for="o in views" :key="o.id">
        <view class="row head">
          <text class="code">{{ o.code }}</text>
          <text class="st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
        </view>
        <view class="sub">{{ o.customerName }}{{ o.phoneMask }}</view>
        <view class="goods" v-for="(g, gi) in o.goods" :key="gi">
          <text class="g-name">{{ g.name }}</text>
          <text class="g-price">×{{ g.qty }} ¥{{ fmtMoney(g.price) }}</text>
        </view>
        <view class="row foot">
          <text class="time">{{ o.delivery }}{{ o.payment ? ' · ' + o.payment : '' }} · {{ fmtTime(o.time) }}</text>
          <text class="total">¥{{ fmtMoney(o.total) }}</text>
        </view>
        <view class="actions">
          <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
          <text class="act ghost" @tap="goDetail(o)">详情</text>
        </view>
      </view>
    </view>

    <!-- 桌面：表格（≥768 显示） -->
    <view class="dt">
      <view class="dt-row head">
        <text class="c-code">订单号</text>
        <text class="c-goods">商品</text>
        <text class="c-cust">收货人 / 电话</text>
        <text class="c-deliv">配送</text>
        <text class="c-pay">实付</text>
        <text class="c-time">下单时间</text>
        <text class="c-st">状态</text>
        <text class="c-ops">操作</text>
      </view>
      <view class="dt-row" v-for="o in views" :key="o.id">
        <text class="c-code">{{ o.code }}</text>
        <view class="c-goods">
          <view v-for="(g, gi) in o.goods" :key="gi">{{ g.name }}×{{ g.qty }}</view>
        </view>
        <text class="c-cust">{{ o.customerName }}{{ o.phoneMask }}</text>
        <text class="c-deliv">{{ o.delivery }}</text>
        <text class="c-pay">¥{{ fmtMoney(o.total) }}</text>
        <text class="c-time">{{ fmtTime(o.time) }}</text>
        <text class="c-st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
        <view class="c-ops">
          <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
          <text class="act ghost" @tap="goDetail(o)">详情</text>
        </view>
      </view>
    </view>

    <view v-if="!views.length && !loading" class="empty">暂无订单</view>
    <view v-if="loading" class="empty">加载中…</view>
    <view v-if="loadingMore" class="empty">加载更多…</view>
    <BottomBar current="order" />
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchOrders, fetchShopOrders, ShopOrderRow, OrderRow } from '../../../apis/order';
import { fetchPickupOrders } from '../../../apis/pickup';
import {
  channelToView,
  shopToView,
  isGhostView,
  fmtMoney,
  computeStats,
  OrderView,
} from '../../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../../constants/orderState';

// 状态码对齐 Vendure 真实状态机（线上 myShopOrders state 实测）：
//   待付款=ArrangingPayment；待发货=PaymentAuthorized/PaymentSettled；
//   已发货=Shipped/PartiallyShipped；Completed=已完成；Cancelled=已取消。
const tabs = [
  { key: '', label: '全部', keys: [] },
  { key: 'ArrangingPayment', label: '待付款', keys: ['ArrangingPayment'] },
  { key: 'PaymentAuthorized', label: '待发货', keys: ['PaymentAuthorized', 'PaymentSettled'] },
  { key: 'Shipped', label: '已发货', keys: ['Shipped', 'PartiallyShipped'] },
  { key: 'Completed', label: '已完成', keys: ['Completed'] },
  { key: 'Cancelled', label: '已取消', keys: ['Cancelled'] },
];
const scopes = [
  { key: 'channel', label: '本店渠道单' },
  { key: 'shop', label: '本店商品单' },
];

const scope = ref('channel');
const cur = ref('');
const kw = ref('');
const views = ref<OrderView[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const stats = ref<{ today: string; toShip: string; refund: string }>({ today: '—', toShip: '—', refund: '—' });
const redeemableIds = ref<Set<string>>(new Set());

function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isRedeemable(o: OrderView): boolean {
  return redeemableIds.value.has(o.id);
}

async function loadStats() {
  try {
    const list = await fetchShopOrders();
    stats.value = computeStats(list);
  } catch (e) {
    // 统计失败不阻塞列表，保留 '—' 占位
  }
}

async function loadRedeem() {
  try {
    const recs = await fetchPickupOrders(true);
    redeemableIds.value = new Set(recs.map((r) => r.orderId).filter(Boolean));
  } catch (e) {
    redeemableIds.value = new Set();
  }
}

async function load() {
  loading.value = true;
  try {
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      totalItems.value = list.length;
      let rows = list as (ShopOrderRow)[];
      const st = tabs.find((t) => t.key === cur.value);
      if (cur.value && st?.keys?.length) rows = rows.filter((o) => st.keys.includes(o.state));
      if (kw.value) {
        const k = kw.value.trim().toLowerCase();
        rows = rows.filter((o) =>
          (o.code || '').toLowerCase().includes(k) || (o.customerName || '').toLowerCase().includes(k),
        );
      }
      views.value = rows.map(shopToView).filter((v) => !isGhostView(v));
    } else {
      const { items: list, totalItems: total } = await fetchOrders({
        take: 20,
        skip: 0,
        state: cur.value || undefined,
        keyword: kw.value,
      });
      views.value = list.map(channelToView).filter((v) => !isGhostView(v));
      totalItems.value = total;
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (views.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    if (scope.value === 'shop') {
      // myShopOrders 全量一次返回，首屏 load() 已全部过滤取回，无需二次加载
      return;
    } else {
      const { items: more, totalItems: total } = await fetchOrders({
        take: 20,
        skip: views.value.length,
        state: cur.value || undefined,
        keyword: kw.value,
      });
      totalItems.value = total;
      views.value = views.value.concat(more.map(channelToView).filter((v) => !isGhostView(v)));
    }
  } finally {
    loadingMore.value = false;
  }
}

function onScope(key: string) {
  if (scope.value === key) return;
  scope.value = key;
  load();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  load();
}
function onSearch() {
  load();
}
function goDetail(o: OrderView) {
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}
function goRedeem(o: OrderView) {
  uni.navigateTo({ url: `/pages/pickup/redeem/index?orderId=${o.id}` });
}
function goRedeemPage() {
  uni.navigateTo({ url: '/pages/pickup/redeem/index' });
}

onMounted(() => {
  load();
  loadStats();
  loadRedeem();
});
onPullDownRefresh(async () => {
  await Promise.all([load(), loadStats(), loadRedeem()]);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 160rpx;

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;
    .title { font-size: 34rpx; color: $wa-ink; font-weight: 700; }
    .redeem-btn {
      background: $wa-accent;
      color: #fff;
      font-size: 26rpx;
      padding: 10rpx 28rpx;
      border-radius: 999rpx;
    }
  }

  .stats {
    display: flex;
    gap: 16rpx;
    margin-bottom: 20rpx;
    .stat {
      flex: 1;
      background: $wa-card;
      border-radius: $wa-radius;
      padding: 20rpx 0;
      text-align: center;
      display: flex;
      flex-direction: column;
      .num { font-size: 36rpx; color: $wa-ink; font-weight: 700; }
      .lbl { margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; }
    }
  }

  .scope {
    display: flex;
    margin-bottom: 16rpx;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx;
    text {
      flex: 1;
      text-align: center;
      padding: 16rpx 0;
      font-size: 26rpx;
      color: $wa-muted;
      border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-ink; font-weight: 600; }
    }
  }
  .tabs {
    display: flex;
    margin-bottom: 24rpx;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx;
    text {
      flex: 1;
      text-align: center;
      padding: 16rpx 0;
      font-size: 26rpx;
      color: $wa-muted;
      border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .search {
    display: flex;
    align-items: center;
    margin-bottom: 24rpx;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx 16rpx 8rpx 24rpx;
    .kw { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .btn {
      flex-shrink: 0;
      padding: 12rpx 32rpx;
      font-size: 26rpx;
      color: #fff;
      background: $wa-accent;
      border-radius: $wa-radius;
    }
  }

  .card-list {
    .card {
      background: $wa-card;
      border-radius: $wa-radius;
      padding: 24rpx 32rpx;
      margin-bottom: 20rpx;
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .head { margin-bottom: 14rpx;
        .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
        .st { font-size: 24rpx; }
      }
      .sub { font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .goods {
        display: flex;
        justify-content: space-between;
        padding-top: 8rpx;
        border-top: 1rpx dashed #e8edf5;
        .g-name { font-size: 26rpx; color: $wa-ink; flex: 1; margin-right: 16rpx; }
        .g-price { font-size: 26rpx; color: $wa-ink; }
      }
      .foot { margin-top: 14rpx;
        .time { font-size: 24rpx; color: $wa-muted; }
        .total { font-size: 30rpx; color: $wa-danger; font-weight: 600; }
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 16rpx;
        margin-top: 20rpx;
        .act { font-size: 26rpx; padding: 10rpx 30rpx; border-radius: 8rpx; }
        .redeem { color: #fff; background: $wa-accent; }
        .ghost { color: $wa-ink; background: #eef1f6; }
      }
    }
  }

  // 桌面表格：默认隐藏，≥768 显示（顺带修复桌面宽屏稀松）
  .dt {
    display: none;
    .dt-row {
      display: grid;
      grid-template-columns: 2fr 3fr 1.8fr 1fr 1fr 1.6fr 1fr 1.4fr;
      gap: 16rpx;
      align-items: center;
      padding: 18rpx 24rpx;
      background: $wa-card;
      border-bottom: 1rpx solid #eef1f6;
      &.head {
        background: $wa-ink;
        color: #fff;
        border-radius: 8rpx 8rpx 0 0;
        position: sticky;
        top: 0;
      }
      .c-code { font-size: 14px; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .c-goods { font-size: 13px; color: $wa-ink;
        view { line-height: 1.5; }
      }
      .c-cust { font-size: 13px; color: $wa-ink; }
      .c-deliv { font-size: 13px; color: $wa-muted; }
      .c-pay { font-size: 14px; color: $wa-danger; font-weight: 600; }
      .c-time { font-size: 13px; color: $wa-muted; }
      .c-st { font-size: 13px; font-weight: 600; }
      .c-ops {
        display: flex;
        gap: 10rpx;
        .act { font-size: 12px; padding: 4px 12px; border-radius: 6px; cursor: pointer; }
        .redeem { color: #fff; background: $wa-accent; }
        .ghost { color: $wa-ink; background: #eef1f6; }
      }
    }
  }

  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}

@media (min-width: 768px) {
  .page { padding: 24px 32px 120px; }
  .page .card-list { display: none; }
  .page .dt { display: block; }
}
</style>
```

- [ ] **Step 2: 构建验证**
  Run: `cd d:\zhao\vshop\web-admin; npm run build:h5`
  Expected: 构建成功退出码 0、无 TS 报错。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vshop; git add web-admin/src/pages/order/list/index.vue; git commit -m "feat(web-admin): rebuild order list with stats, pickup redeem entry, responsive card/table"
```

---

## Task 4: e2e 验证（登录 → 订单列表；手机卡片 + 桌面表格；统计；核销判定出现），双视口截图

**Files:**
- Create: `_e2e/order_list_localization.py`

- [ ] **Step 1: 新建脚本**（沿用 `_e2e/verify_fix.py` 的登录 + console/error 捕获模式）

```python
# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import time

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/'

def run(viewport, tag):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport=viewport)
        errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)[:400]))
        page.goto(BASE, wait_until='networkidle', timeout=45000)
        time.sleep(1)
        # 登录
        page.locator('input').nth(0).fill('superadmin')
        page.locator('input').nth(1).fill('z123123')
        page.locator('button, .btn').first.click()
        time.sleep(4)
        page.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000)
        time.sleep(2)

        body = ''
        try:
            body = page.inner_text('body')
        except Exception:
            body = ''
        has_card = '.card' in body and '去核销' in body
        has_stats = ('今日订单' in body) and ('待发货' in body) and ('待退款' in body)
        shot = SHOT + ('order_local_desk_1440.png' if tag == 'desk' else 'order_local_mobile_390.png')
        page.screenshot(path=shot, full_page=True)

        print('=== TAG', tag, '===')
        print('HAS_STATS=', has_stats)
        print('HAS_CARD_AND_ACTIONS=', has_card)
        print('BODY_HEAD=', body[:120].replace('\n', '|'))
        print('PAGEERRORS=', errs if errs else '(none)')
        browser.close()

run({'width': 390, 'height': 844}, 'mobile')
run({'width': 1440, 'height': 900}, 'desk')
```

- [ ] **Step 2: 确认 dev server 已启动**（`npm run dev:h5` 托管于 5280），否则先后台启动
  Run: `cd d:\zhao\vshop\web-admin; npm run dev:h5`

- [ ] **Step 3: 运行脚本**
  Run: `python d:/zhao/vshop/web-admin/_e2e/order_list_localization.py`
  Expected 输出含：`HAS_STATS=True`、`HAS_CARD_AND_ACTIONS=True`（其内 `'去核销'` 提供于数组内 3 个 action 文本中，专业判定在后）；`PAGEERRORS=(none)`。
  > 若线上/本地当前确实无"待核销"自提单，`去核销` 按钮自然不出现属正常（属数据空，非缺陷）；此时用已有的一张自提单订单手工核对，或接受"有则显示、无则隐藏"的判定。校验目标是：**手机视口出现卡片、桌面视口表格结构与统计条、手机卡片与桌面表格同一份 `views` 渲染、无 pageerror**。

- [ ] **Step 4: 用 Read 查看两张截图** `order_local_mobile_390.png`、`order_local_desk_1440.png`，肉眼确认：手机卡片含状态/顾客+脱敏手机号/商品/时间/实付；桌面表格八列齐全、表头吸顶、无横向破版。截图合格后将它们补充进 `docs/webadmin-bugfix-manual/`（或新开的订单页操作手册节）。

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vshop; git add web-admin/_e2e/order_list_localization.py; git commit -m "test(web-admin): e2e verify china-localized order list (mobile card + desktop table)"
```

---

## Task 5: 操作手册补充 + 最终构建

**Files:**
- Modify: `web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（追加订单页章节）

- [ ] **Step 1: 在手册 HTML 中新增「订单列表（中国本地化）」章节**：插入统计条、顶部核销入口、「本店渠道单/本店商品单」切换、手机卡片/桌面表格双形态说明；嵌入 Task 4 的两张截图（移动+桌面）与一句话验收标准（统计数与列表一致、自提未核销单出「去核销」→ 跳核销页）。

- [ ] **Step 2: 最终构建**
  Run: `cd d:\zhao\vshop\web-admin; npm run build:h5`
  Expected: 退出码 0。产物在 `dist/build/h5`，留待按既有 `scripts/deploy.mjs` 上线流程部署（本次不含部署）。

- [ ] **Step 3: 提交**

```bash
cd d:\zhao\vshop; git add web-admin/docs web-admin/_e2e; git commit -m "docs(web-admin): add china-localized order list section + screenshots"
```

---

## Self-Review 记录（作者已核对）

1. **Spec 覆盖**：统计条(Task2 的 computeStats+Task3)、顶部核销入口(Task3 goRedeemPage)、scope 切换(沿用)、手机卡片/桌面表格(样式 media query + 双份模板)、核销卡片快捷(Task3 isRedeemable/goRedeem，数据源 Task3 loadRedeem ← fetchPickupOrders(true))、手机号脱敏(Task2 maskPhone)、状态文案复用 orderState.ts。待退款近似口径在 Task2 注释标注。全部有对应 Task。
2. **占位符扫描**：无 TBD/TODO/待实现；Task 4 的后寝室「当无待核销单时按钮自然不显示」是明确的、与真实测试工具条件一致的处理说明，而非占位。每步都含具体代码或命令。
3. **类型一致性**：`OrderView`（Task2 定义）在 Task3 模板（`o.customerName/o.phoneMask/o.goods/o.total/o.time/o.delivery/o.payment/o.state/o.id`）与函数（`isRedeemable/goRedeem/goDetail`）全程一致；`channelToView(OrderRow)` / `shopToView(ShopOrderRow)` 签名与调用处一致；`computeStats` 返回 `{today,toShip,refund}` 与 `stats` ref 类型一致；`fetchPickupOrders(true)` 返回项含 `orderId` 与 `loadRedeem` 用法一致。
4. **接口/引用完整**：`maskPhone/fmtMoney/OrderView/channelToView/shopToView/isGhostView/computeStats` 均在 Task2 定义；`fetchOrders/fetchShopOrders/ShopOrderRow/OrderRow` 已在 `apis/order.ts`；`fetchPickupOrders` 已在 `apis/pickup.ts`；`ORDER_STATES/stateLabel` 已在 `constants/orderState.ts`。

方向正确的落地边界：本计划只改前端（页面+一个工具文件+数据层查询字段），零后端改动；部署沿用 deploy.mjs，不在本计划范围。