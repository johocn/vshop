# 订单列表·搜索/筛选/分页完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为订单列表补齐「按商品名搜索」「配送方式+时间筛选」「桌面分页条+每页条数」三项运营向能力。

**Architecture:** 纯前端。在 `orderFormat.ts` 新增本地过滤层（`filterChannelRows`/`filterShopRows`，作用于原始行 `OrderRow`/`ShopOrderRow` 以取到原始手机号/商品名/下单时间）；`index.vue` 数据流改走「原始行 rawRows」模型支撑分页，模板加筛选行与底部分页条。渠道单筛选在已加载页内生效、商品单（myShopOrders 全量）完全可靠。`apis/order.ts` 不改造（`fetchOrders` 的 `keyword` 改为不再传入、改本地过滤）。

**Tech Stack:** Vue3 + TypeScript + uni-app（H5）、Vendure admin GraphQL、令牌 `$wa-*`、Playwright E2E。vite 按需，类型校验 `npx tsc --noEmit`（允许仓库存量 coupon/product/scanner.ts 错误）。

**前置铁律（每个子 agent）**：仓库有**存量 tsc 错误**（coupon.ts/product.ts/scanner.ts，与本变更无关）；类型门禁=「改动文件自身无新增错误」。改 `index.vue` 一律用**串行 Edit**（一次一个，确认成功再下一个，并行会互相覆盖）。git 在仓库根 `d:\zhao\vshop` 只 add 指定文件、绝不 `git add -A`。

---

## 文件结构

- `src/utils/orderFormat.ts`（改）：本地过滤层。新增 `OrderFilter`、`rowTime`、`deliveryOf`、`withinDate`、`filterChannelRows`、`filterShopRows`。职责：把 关键词/配送/时间 三类条件在原始行上过滤。
- `src/pages/order/list/index.vue`（改）：数据流（state + `load`/`loadMore`/handlers/resetPage）+ 模板（筛选行、分页条、placeholder）+ 样式。职责：页面编排，UI 与原始行模型接线。
- `_e2e/verify_order_actions.py`（改）：E2E 追加断言。
- `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（改）：手册 8.4.3 章节。

---

### Task 1: 视图工具加入本地过滤层

**Files:**
- Modify: `web-admin/src/utils/orderFormat.ts`

- [ ] **Step 1: 读取当前文件**

Read `d:\zhao\vshop\web-admin\src\utils\orderFormat.ts`，确认已 import `OrderRow`/`ShopOrderRow`（来自 `../apis/order`）。

- [ ] **Step 2: 追加过滤层代码**

在文件末尾追加（一个 Edit，追加在**最后一个导出函数之后**）：

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
```

> 若 `OrderRow`/`ShopOrderRow` 未 import，补回开头 `import { OrderRow, ShopOrderRow } from '../apis/order';`（若已存在则不重复）。

- [ ] **Step 3: 类型检查**

在 `d:\zhao\vshop\web-admin` 跑 `npx tsc --noEmit`。
预期：`orderFormat.ts` **无新增报错**；仅存量的 coupon.ts/product.ts/scanner.ts 报错（忽略）。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/utils/orderFormat.ts
git commit -m "feat(orderFormat): 新增本地过滤层 filterChannelRows/filterShopRows"
```

- [ ] **Step 5: 汇报** — 追加成功、仅动该文件、`orderFormat.ts` 无新增 tsc 错误、commit hash。

---

### Task 2: 页面数据流转 raw 模型 + 过滤/分页状态

**Files:**
- Modify: `web-admin/src/pages/order/list/index.vue`

**串行 Edit 要求**：一次一个 Edit，确认成功再下一个。下面 7 处改动按顺序逐个做。

- [ ] **Step 1: import 补 computed 与过滤函数**

把脚本 import 块（`from 'vue'` 那行）改为同时引入 `computed`：
```ts
import { ref, onMounted, computed } from 'vue';
```
再把 `orderFormat` 的 import 花括号里追加 `filterChannelRows` 与 `filterShopRows`（保持字母序）：
```ts
import {
  channelToView,
  shopToView,
  filterChannelRows,
  filterShopRows,
  isGhostView,
  ...
```
> 用两个串行 Edit 分别完成。

- [ ] **Step 2: 新增过滤/分页状态与选项常量**

在 `const totalItems = ref(0);` 之后插入：
```ts
const perPage = ref(20);
const page = ref(1);
const channelRaw = ref<OrderRow[]>([]);
const delivery = ref<'' | 'pickup' | 'express'>('');
const dateRange = ref<'' | 'today' | '7d' | '30d'>('');
const deliveryArr = ['', 'pickup', 'express'] as const;
const dateArr = ['', 'today', '7d', '30d'] as const;
const deliveryOpts = ['自提', '快递'];
const dateOpts = ['今日', '近7天', '近30天'];
const deliveryIdx = computed(() => Math.max(0, deliveryArr.indexOf(delivery.value)));
const dateIdx = computed(() => Math.max(0, dateArr.indexOf(dateRange.value)));
const deliveryLabel = computed(() => (delivery.value ? deliveryOpts[deliveryArr.indexOf(delivery.value) as never] : ''));
const dateLabel = computed(() => (dateRange.value ? dateOpts[dateArr.indexOf(dateRange.value) as never] : ''));
```

- [ ] **Step 3: 重写 `load()`（shop 与 channel 两个分支整体替换）**

把整个 `load()` 函数（当前第 181-215 行）替换为：
```ts
async function load() {
  loading.value = true;
  try {
    const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      let rows = filterShopRows(list, ok);
      const st = tabs.find((t) => t.key === cur.value);
      if (cur.value && st?.keys?.length) rows = rows.filter((o) => st.keys.includes(o.state));
      totalItems.value = rows.length;
      let thumbMap: Record<string, string> = {};
      try {
        const ids = rows.flatMap((o) => (o.items || []).map((it) => it.productId));
        thumbMap = await fetchProductThumbs(ids);
      } catch { thumbMap = {}; }
      views.value = rows.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
    } else {
      const { items: list, totalItems: total } = await fetchOrders({
        take: perPage.value,
        skip: (page.value - 1) * perPage.value,
        state: cur.value || undefined,
      });
      channelRaw.value = list;
      totalItems.value = total;
      views.value = filterChannelRows(list, ok).map(channelToView).filter((v) => !isGhostView(v));
    }
  } finally {
    loading.value = false;
  }
}
```
> 注意 channel 分支**不再传 `keyword`**（本地过滤代替）；shop 分支移除原 handler 里两段手工 `rows.filter`（code/customerName），统一交 `filterShopRows`。

- [ ] **Step 4: 重写 `loadMore()`**

把当前 `loadMore()`（第 217-238 行）替换为：
```ts
async function loadMore() {
  if (scope.value === 'shop') return;
  if (loading.value || loadingMore.value) return;
  if (channelRaw.value.length >= totalItems.value && totalItems.value > 0) return;
  const isMobile = typeof window === 'undefined' ? false : window.innerWidth < 768;
  if (!isMobile) return; // 桌面用分页条，不做无限滚动
  loadingMore.value = true;
  try {
    page.value += 1;
    const { items: more, totalItems: total } = await fetchOrders({
      take: perPage.value,
      skip: (page.value - 1) * perPage.value,
      state: cur.value || undefined,
    });
    totalItems.value = total;
    channelRaw.value = channelRaw.value.concat(more);
    const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
    views.value = filterChannelRows(channelRaw.value, ok).map(channelToView).filter((v) => !isGhostView(v));
  } finally {
    loadingMore.value = false;
  }
}
```

- [ ] **Step 5: 在 onScope/onTab/onStatTap/onSearch 开头加 resetPage()**

为这 4 个函数各加一行 `resetPage();` 作为函数体第一行（在已有的 `if (scope.value === key) return;` 等 early-return **之后**、`load()` **之前**）：
```ts
function onScope(key: string) {
  if (scope.value === key) return;
  scope.value = key;
  resetPage();
  load();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  resetPage();
  load();
}
function onStatTap(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  resetPage();
  load();
}
function onSearch() {
  resetPage();
  load();
}
```
> 用 4 个串行 Edit（或一次替换整块函数区，若它们相邻）。

- [ ] **Step 6: 新增 handler 函数**

在 `copyCode` 函数之后追加：
```ts
function resetPage() { page.value = 1; }
function onPage(delta: number) {
  const pages = Math.max(1, Math.ceil(totalItems.value / perPage.value));
  const next = Math.min(pages, Math.max(1, page.value + delta));
  if (next === page.value) return;
  page.value = next; load();
}
function onPerPage(n: number) { perPage.value = n; resetPage(); load(); }
function onDeliveryPick(e: any) { onDelivery(deliveryArr[e.detail.value] as never); }
function onDatePick(e: any) { onDateRange(dateArr[e.detail.value] as never); }
function onClearFilter() { delivery.value = ''; dateRange.value = ''; resetPage(); load(); }
function onDelivery(v: '' | 'pickup' | 'express') {
  if (delivery.value === v) v = '';
  delivery.value = v; resetPage(); load();
}
function onDateRange(v: '' | 'today' | '7d' | '30d') {
  if (dateRange.value === v) v = '';
  dateRange.value = v; resetPage(); load();
}
```

- [ ] **Step 7: 类型检查**

`npx tsc --noEmit`：`index.vue` 不在 tsc 范围（未装 vue-tsc），确认 Script 段新增变量/函数引用无破坏（tsc 只跑 .ts/.d.ts，故以 Step 1 import 警告为准：`filterChannelRows`/`filterShopRows`/`computed` 已导入则无碍）。

- [ ] **Step 8: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 数据流转 raw 模型 + 过滤/分页状态与 handlers"
```

- [ ] **Step 9: 汇报** — 各改动成功、串行未覆盖、commit hash。

---

### Task 3: 模板筛选行 + 分页条 + 样式

**Files:**
- Modify: `web-admin/src/pages/order/list/index.vue`

**串行 Edit**。

- [ ] **Step 1: 搜索框 placeholder 改写**

把第 33 行：
```html
      <input v-model="kw" class="kw" placeholder="订单号 / 顾客 / 手机号" confirm-type="search" @confirm="onSearch" />
```
替换为：
```html
      <input v-model="kw" class="kw" placeholder="订单号 / 顾客 / 手机号 / 商品名" confirm-type="search" @confirm="onSearch" />
```

- [ ] **Step 2: 搜索行下插入筛选行**

把（search `/view` 之后、`<!-- 手机：卡片列表` 注释之前）插入：
```html
    <view class="filters">
      <picker :range="deliveryOpts" :value="deliveryIdx" @change="onDeliveryPick">
        <text class="f-chip" :class="{ on: delivery }">{{ deliveryLabel || '配送' }} ▾</text>
      </picker>
      <picker :range="dateOpts" :value="dateIdx" @change="onDatePick">
        <text class="f-chip" :class="{ on: dateRange }">{{ dateLabel || '时间' }} ▾</text>
      </picker>
      <text v-if="delivery || dateRange" class="f-clear" @tap="onClearFilter">清除</text>
    </view>
```

- [ ] **Step 3: 桌面表格后插入分页条**

把（`.dt` 表格 /`view` 之后、`<view v-if="!views.length...` 空态之前）插入：
```html
    <view class="pgbar" v-if="scope === 'channel'">
      <text class="pg-btn" :class="{ dis: page <= 1 }" @tap="onPage(-1)">上一页</text>
      <text class="pg-info">第 {{ page }} / {{ Math.max(1, Math.ceil(totalItems / perPage)) }} 页 · 共 {{ totalItems }} 单</text>
      <text class="pg-btn" :class="{ dis: page >= Math.max(1, Math.ceil(totalItems / perPage)) }" @tap="onPage(1)">下一页</text>
      <text class="pg-size" v-for="n in [20, 50, 100]" :key="n" :class="{ on: perPage === n }" @tap="onPerPage(n)">{{ n }}</text>
    </view>
```

- [ ] **Step 4: 新增样式（filter + pgbar）**

在 `.search` 规则之后插入：
```scss
  .filters {
    display: flex;
    align-items: center;
    gap: 16rpx;
    margin-bottom: 24rpx;
    flex-wrap: wrap;
    .f-chip {
      font-size: 26rpx; color: $wa-muted; background: $wa-card;
      padding: 10rpx 24rpx; border-radius: 999rpx; border: 1rpx solid #e8edf5;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
    }
    .f-clear { font-size: 24rpx; color: $wa-muted; text-decoration: underline; cursor: pointer; }
  }
  .pgbar {
    display: none;
    align-items: center;
    gap: 12rpx;
    margin-top: 20rpx;
    font-size: 13px;
    color: $wa-muted;
    .pg-btn { padding: 6px 14px; border: 1rpx solid #d8dee9; border-radius: 6px; cursor: pointer; background: $wa-card;
      &.dis { opacity: 0.4; cursor: default; }
    }
    .pg-info { margin: 0 8px; }
    .pg-size { padding: 4px 10px; border: 1rpx solid #d8dee9; border-radius: 6px; cursor: pointer;
      &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; }
    }
  }
```

- [ ] **Step 5: 桌面媒体查询显示分页条**

在 `@media (min-width: 768px)` 块末尾追加一行：
```css
  .page .pgbar { display: flex; }
```

- [ ] **Step 6: 构建验证**

在 `d:\zhao\vshop\web-admin` 跑 `npm run build:h5`。预期末尾 `DONE  Build complete.`（Dart Sass `legacy-js-api` DEPRECATION 警告可忽略）。失败则修模板/样式后重跑。

- [ ] **Step 7: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 筛选行 + 桌面分页条 + 样式"
```

- [ ] **Step 8: 汇报** — 改动成功、build 结果、commit hash。

---

### Task 4: 构建 + E2E 扩展

**Files:**
- Modify: `web-admin/_e2e/verify_order_actions.py`

- [ ] **Step 1: 读取现有 E2E**

Read `d:\zhao\vshop\web-admin\_e2e\verify_order_actions.py`。它已有：登录→选店 t1→订单列表→切「本店商品单」，手机+桌面两视口，断言统计4卡/桌面缩略图/复制/发货等。

- [ ] **Step 2: 追加「按商品名搜索」断言（shop scope）**

在切到「本店商品单」scope 之后（在既有断言区之前插入）：
```python
        # 按商品名搜索（商品单全量本地过滤）：取首单首个商品名填写，应命中 >=1 单
        gname_el = pg.locator('.card .goods .g-name').first
        product_name_ok = False
        if gname_el.count() > 0:
            nm = gname_el.inner_text().strip()
            if nm:
                pg.locator('.kw').fill(nm)
                pg.locator('.search .btn').click(); time.sleep(3)
                product_name_ok = pg.locator('.card').count() >= 1
                pg.locator('.kw').fill('')
                pg.locator('.search .btn').click(); time.sleep(3)
```

- [ ] **Step 3: 追加筛选行 + 桌面分页条断言**

在既有桌面相关断言之后插入：
```python
        filter_chips  = pg.locator('.filters .f-chip').count()      # 筛选行：配送+时间
        pf_channel    = pg.locator('.pgbar').count()                 # 分页条仅桌面 channel
```
并把现有 `ALL_OK`（含所有既有子条件）扩展为且约束：
```python
        ALL_OK = (ok_ship and ok_detail and ok_thumb and ok_thumb_img
                  and ok_stat4 and ok_dg and copied
                  and product_name_ok and filter_chips >= 2)
```
> 若 `ALL_OK` 变量在脚本中已定义，直接替换该赋值行；`product_name_ok` 在切 scope 后定义，确保在本文件作用域内先定义后引用（若某视口无 `.card` 商品 → `product_name_ok` False，属数据依赖，可接受并在打印注明）。

- [ ] **Step 4: 打印补齐**

在打印行追加：`PRODUCT_NAME_OK=product_name_ok FILTER_CHIPS=filter_chips PGBAR=pf_channel`。

- [ ] **Step 5: 语法检查**

在 `d:\zhao\vshop\web-admin` 跑 `python -m py_compile _e2e/verify_order_actions.py`，期望 exit 0。

- [ ] **Step 6: 提交**

```bash
git add web-admin/_e2e/verify_order_actions.py
git commit -m "test(order-list): E2E 补按商品名搜索/筛选行/分页条断言"
```

- [ ] **Step 7: 汇报** — 修改落盘、`py_compile` 结果、commit hash。

---

### Task 5: 部署 + 线上 E2E + 手册

**Files:**
- Modify: `web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` + assets

- [ ] **Step 1: 部署**

在 `d:\zhao\vshop\web-admin` 跑 `node scripts/deploy.mjs`。预期 `[deploy] 产物校验通过: ... KB` 与 `deploy done`（本地构建→scp→服务器解压，服务器不构建）。失败区分构建/网络/ssh；涉服务器权限则停止并报告。

- [ ] **Step 2: 线上 E2E**

跑 `python _e2e/verify_order_actions.py`（web-admin 目录），输出截图 `order_actions_mobile_390.png`/`order_actions_desk_1440.png`。记录两视口 `ALL_OK` 与全部计数，解读：
- `STAT_4=4`、`DG_ROWS` 桌面>0、`COPY_OK=True`、`THUMB_IMG`（有封面商品>0）。
- 新增：`PRODUCT_NAME_OK`（商品单搜索命中）、`FILTER_CHIPS>=2`（筛选行）、`PGBAR`（桌面 channel=1）。
- `REMIND/REDEEM` 数据依赖（可为 0），如实说明非缺陷。`ALL_OK=False` 时先定位是哪个子条件、判断是否数据依赖。

- [ ] **Step 3: 手册补 8.4.3**

打开 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`，在「8.4.2」小节之后、`</section>` 之前追加「8.4.3 搜索/筛选/分页完善」，说明：搜索框支持按商品名（本店商品单全量可靠、渠道单当页生效）；新增配送方式+时间筛选（一键清除）；桌面渠道单加分页条（每页 20/50/100、共 N 单）。把本部署新成的两张截图复制到 `assets/` 并按既有 figure 结构引用。

- [ ] **Step 4: 提交**

```bash
git add web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git add web-admin/docs/webadmin-bugfix-manual/assets/order_actions_mobile_390.png web-admin/docs/webadmin-bugfix-manual/assets/order_actions_desk_1440.png
git commit -m "docs(webadmin): 手册补 8.4.3 搜索/筛选/分页章节及验收截图"
```

- [ ] **Step 5: 汇报** — 部署结果、线上 E2E 完整计数与解读、手册是否更新、commit hash。

---

## Self-Review

- **Spec 覆盖**：①按商品名（Task1 `filterChannelRows` 含 prodNames + Task2 shop 分支接 `filterShopRows` + Task4 E2E）✓ ②筛选行配送+时间（Task1 `withinDate`/`deliveryOf` + Task3 模板 + Task2 state/handlers）✓ ③分页条每页条数（Task2 perPage/page/channelRaw + Task3 `.pgbar`）✓。错误处理（越界守卫/window SSR/isGhostView 保留）已含。取舍（渠道当页/商品全量）记入手册。
- **占位符**：无 TBD/TODO；每步含可运行代码。
- **类型一致性**：`OrderFilter` 各字段、`filterChannelRows(rows, f, now)`/`filterShopRows(rows, f, now)`、`deliveryArr/dateArr` 索引与 `onDeliveryPick` 的 `as never` 用法一致；`channelRaw: Ref<OrderRow[]>`、`page/perPage/totalItems` 贯穿 load/loadMore/pgbar 一致。