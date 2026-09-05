# 订单列表·搜索/筛选/分页 完善 设计方案

> 在前两批已上线改造（第一批：headbar 统计+核销码、状态快捷按钮、商品缩略图、响应式；第二批：桌面商品列缩略图、统计 4 卡+点击切 tab、商品单受限提示、发货确认+复制单号）基础上，本轮补齐 3 个运营向缺失点：
> 1. **搜索增强**：新增「按商品名」过滤（含顾客/手机号补全）；
> 2. **进阶筛选行**：配送方式 + 时间范围；
> 3. **分页条 + 每页条数**（桌面渠道单，替代纯无限滚动的弱交互）。

**目标**：让运营能按「买到哪个商品」「配送方式」「下单时间窗」快速定位订单，并对长列表（渠道单分页）提供清晰的页码/每页控制，提升可查性。

**架构**：纯前端。新增一个**本地过滤层** `filterOrders`（作用于原始行而非视图，才能取到原始手机号/商品名/下单时间），统一驱动搜索、配送、时间三类条件；页面改走「原始行 rawRows」模型支撑分页。只动 `orderFormat.ts` 与 `index.vue`；`apis/order.ts` 本轮不改（`fetchOrders` 的 keyword 改为不由页面传入，改本地过滤）。

**边界（确权）**：Vendure 渠道单接口仅有 `take/skip/state` 服务端过滤；故渠道单的搜索/筛选在**已加载页内**生效，商品单（`myShopOrders` 全量）为**全量权威、完全可靠**。与现状搜索行为一致，不扩展后端。

**Tech Stack**：Vue3 + TypeScript + uni-app（H5）、Vendure admin GraphQL、uView 令牌 `$wa-*`、Playwright E2E（`_e2e/`）。

---

## 当前基线（已上线）

- 搜索框 placeholder「订单号 / 顾客 / 手机号」，`fetchOrders({take,skip,state,keyword})` 内 `keyword` 仅**客户端在当前页**按 code 过滤（本就是页内行为）。
- 分页：渠道单 `take:20` + `onReachBottom` 加载更多追加；商品单全量一次返回。
- `.tabs`（状态）、`.scope`（渠道单/商品单）、`.headbar`（4 统计卡+核销码）。

## 决策记录

| 问题 | 决策 | 理由 |
|---|---|---|
| 筛选实现 | 本地过滤层（原始行 `OrderRow`/`ShopOrderRow`）| 可取原始手机号/商品名/下单时间；不扩展后端；与现状搜索行为一致 |
| 渠道单 vs 商品单 | 渠道单「已加载页内生效」、商品单「全量可靠」| Vendure 无这些服务端过滤；商品单是权威全集 |
| keyword 去向 | 页面不再传 `fetchOrders.keyword`，改本地 `filterOrders` | 统一搜索、配送、时间三重条件于一个纯函数 |
| 分页模型 | 引入 `rawRows` 原始行集 + `page`/`perPage` | 支撑桌面页码、手机无限滚、每页切换，过滤在 raw 上做避免计数错位 |
| 手机/桌面 | 手机保留上拉加载更多；桌面 channel 底部分页条；商品单仅显示总数 | 触屏上拉更顺手；桌面表格长列表需页码控制 |

---

## 设计

### 1. 视图工具 `orderFormat.ts` —— 本地过滤层

新增以下纯函数（`OrderRow`/`ShopOrderRow` 已 import）：

```ts
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

// 渠道单原始行过滤（页内生效）
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

// 商品单原始行过滤（全量可靠）
export function filterShopRows(rows: ShopOrderRow[], f: OrderFilter = {}, now = new Date()): ShopOrderRow[] {
  const k = (f.kw || '').trim().toLowerCase();
  const dc = f.delivery || '';
  return rows.filter((o) => {
    if (dc === 'pickup') return false; // 商品单恒快递；选“自提”→全排除，选“快递”→放行继续下探
    if (f.dateRange && !withinDate(o.placedAt || '', f.dateRange, now)) return false;
    if (!k) return true;
    const prodNames = (o.items || []).map((it) => `${it.productName || ''} ${it.variantName || ''}`).join(' ');
    return [o.code, o.customerName, prodNames].some((v) => (v || '').toLowerCase().includes(k));
  });
}
```

### 2. 页面 `index.vue` —— 过滤状态 + 筛选行 + 分页模型

**新增状态**：
```ts
const kw = ref('');            // 已有，继续用
const delivery = ref<'' | 'pickup' | 'express'>('');
const dateRange = ref<'' | 'today' | '7d' | '30d'>('');
const perPage = ref(20);
const page = ref(1);
const channelRaw = ref<OrderRow[]>([]);   // 渠道单原始行集；手机累积、桌面按页替换
```

**`load()` 渠道单分支**改为（不再传 keyword，本地过滤 + raw 分页）：
```ts
const { items, totalItems } = await fetchOrders({
  take: perPage.value,
  skip: (page.value - 1) * perPage.value,
  state: cur.value || undefined,
});
channelRaw.value = items;
totalItems.value = totalItems;
const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
views.value = filterChannelRows(items, ok).map(channelToView).filter((v) => !isGhostView(v));
```

**`load()` 商品单分支**改为（全量 + 本地过滤；总数为过滤后）：
```ts
const list = await fetchShopOrders();
const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
const filtered = filterShopRows(list, ok);
totalItems.value = filtered.length;
let thumbMap: Record<string, string> = {};
try {
  const ids = filtered.flatMap((o) => (o.items || []).map((it) => it.productId));
  thumbMap = await fetchProductThumbs(ids);
} catch { thumbMap = {}; }
views.value = filtered.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
```
> 移除原 shop 分支里基于 `cur`/`kw` 的两段手工 `rows.filter`，统一交给 `filterShopRows`（它已含状态 tab 前端过滤？否——状态 tab 用 `cur` 由服务端/或本地？注意：**shop 分支仍需按 `cur` 状态过滤**，`filterShopRows` 只负责 kw/delivery/dateRange；状态 `cur` 过滤仍需保留）。

**状态 tab 过滤整合（重要）**：
- 渠道单：`fetchOrders` 的 `state: cur` 已服务端过滤，OK。
- 商品单：保留 `st = tabs.find(t=>t.key===cur.value)` 的 `rows.filter(o=>st.keys.includes(o.state))`——把 `filterShopRows` 与状态过滤串接：
  ```ts
  let rows = filterShopRows(list, ok);
  const st = tabs.find((t) => t.key === cur.value);
  if (cur.value && st?.keys?.length) rows = rows.filter((o) => st.keys.includes(o.state));
  totalItems.value = rows.length;
  // ...thumbMap 用 rows 的 productId；views = rows.map(shopView)
  ```

**筛选/分页 handler**：
```ts
function resetPage() { page.value = 1; }
function onDelivery(v: '' | 'pickup' | 'express') { delivery.value = delivery.value === v ? '' : v; resetPage(); load(); }
function onDateRange(v: '' | 'today' | '7d' | '30d') { dateRange.value = dateRange.value === v ? '' : v; resetPage(); load(); }
function onPage(delta: number) {
  const pages = Math.max(1, Math.ceil(totalItems.value / perPage.value));
  const next = Math.min(pages, Math.max(1, page.value + delta));
  if (next === page.value) return;
  page.value = next; load();
}
function onPerPage(n: number) { perPage.value = n; resetPage(); load(); }
```
- `onScope`/`onTab`/`onSearch` 内开头加 `resetPage()`。

**`loadMore()` 渠道单**改为（手机累积 raw，按页追加）：
```ts
if (scope.value === 'shop') { return; }
if (channelRaw.value.length >= totalItems.value && totalItems.value > 0) return;
const isMobile = typeof window === 'undefined' ? false : window.innerWidth < 768;
if (!isMobile) return; // 桌面用分页条，不做无限滚动
page.value += 1;
const { items } = await fetchOrders({ take: perPage.value, skip: (page.value - 1) * perPage.value, state: cur.value || undefined });
channelRaw.value = channelRaw.value.concat(items);
const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
views.value = filterChannelRows(channelRaw.value, ok).map(channelToView).filter((v) => !isGhostView(v));
```

**模板：筛选行**（放在 `.search` 之下；uni-app 用 `<picker>`）：
```html
<view class="filters">
  <picker :range="deliveryOpts" :value="_deliveryIdx" @change="_onDelivery">
    <text class="f-chip" :class="{ on: delivery }">{{ deliveryLabel }}{{ delivery ? ' ▾' : '配送 ▾' }}</text>
  </picker>
  <picker :range="dateOpts" :value="_dateIdx" @change="_onDate">
    <text class="f-chip" :class="{ on: dateRange }">{{ dateLabel }}{{ dateRange ? ' ▾' : '时间 ▾' }}</text>
  </picker>
  <text v-if="delivery || dateRange" class="f-clear" @tap="_onClear">清除</text>
</view>
```
外加 option 常量与标签/索引映射：`deliveryOpts=['自提','快递']`、`dateOpts=['今日','近7天','近30天']`，以及 computed `deliveryLabel/dateLabel/_deliveryIdx/_dateIdx` 与 `_onDelivery(e)/_onDate(e)`（从 picker `e.detail.value` 索引映射回枚举；Toggle 语义：选中的再点=清除）。

**模板：分页条**（桌面 channel，`v-if="scope==='channel'"`）：
```html
<view class="pgbar" v-if="scope === 'channel'">
  <text class="pg-btn" :class="{ dis: page <= 1 }" @tap="onPage(-1)">上一页</text>
  <text class="pg-info">第 {{ page }} / {{ Math.max(1, Math.ceil(totalItems / perPage)) }} 页 · 共 {{ totalItems }} 单</text>
  <text class="pg-btn" :class="{ dis: page >= Math.max(1, Math.ceil(totalItems / perPage)) }" @tap="onPage(1)">下一页</text>
  <text class="pg-size" v-for="n in [20, 50, 100]" :key="n" :class="{ on: perPage === n }" @tap="onPerPage(n)">{{ n }}</text>
</view>
```

**样式**：新增 `.filters`（flex、间距、`.f-chip` 胶囊、`.on` 高亮、`.f-clear`）、`.pgbar`（桌面 flex、`.pg-btn`/`.pg-info`/`.pg-size`）；`.pgbar` 仅 `@media (min-width:768px)` 显示。

**搜索框 placeholder** 改为：「订单号 / 顾客 / 手机号 / 商品名」。

## 错误处理
- `filterChannelRows`/`filterShopRows` 纯函数、坏输入返回空过滤（空 kw/空条件即全过）；`loadMore` 越界守卫、`window` 访问做 SSR 安全判断。
- 分页 `pages` 用 `Math.max(1,…)` 防除零；`page` 用 `Math.min/Math.max` 收敛边界。
- `filterShopRows` 状态过滤保持原 `cur` 逻辑，避免回归丢状态过滤。

## 测试
- **类型检查**：每 Task 后 `npx tsc --noEmit`，以「改动文件无新增错误」为准（仓库存量 tsc 错误与本变更无关）。
- **构建**：`npm run build:h5` 验证 `.vue` 编译。
- **E2E（`_e2e/verify_order_actions.py` 追加）**：
  - 商品单 scope 输入商品名（如「音箱」）→ 列表按商品名过滤出单；清空恢复。
  - 筛选「今日」/「自提」→ 列表相应变化（自提在商品单恒 0 属预期）。
  - 桌面 channel scope：分页条 `.pgbar` 出现、第 1/2 页切换后 `.c-code` 内容变化。
  - 回归既有断言（统计4卡/桌面缩略图/复制/缩略图）仍通过。
- **手机 390×844 + 桌面 1440×900 验收截图**补入手册。

## 部署
- 纯前端：本地构建走 `scripts/deploy.mjs`（scp 产物→服务器解压），服务器不构建。

## 影响面与回滚
- 只改 `orderFormat.ts`、`index.vue`、E2E、手册。本地过滤器 + raw 分页模型改动集中在页面数据流；前端产物回退即可回滚，无数据迁移。

## 验收标准
1. 搜索框按订单号/顾客/手机号/商品名均能命中；商品单按商品名搜索可靠命中（全量），渠道单在当前页内命中。
2. 筛选行「配送方式」「时间范围」生效并与 scope/tab/搜索联动；「清除」一键复位。
3. 桌面 channel 底部分页条：上一页/下一页、共 N 单、每页 20/50/100 可切换；手机保持上拉加载。
4. E2E 通过，手机+桌面截图记入操作手册。