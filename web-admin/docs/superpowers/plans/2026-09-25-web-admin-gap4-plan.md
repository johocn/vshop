# web-admin 第 4 轮补齐 · 统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次收口 web-admin 第 4 轮四项缺口（列表一致性 + 分类、风格体系收尾、库存域残项、仓内作业闭环），交付 = 实现 + API/e2e 回归 + 390×844 dpr=2 手机视口截图 + 操作手册，四者齐备。

**Architecture:** 一份总纲（本文件）+ 4 批串行执行，每批独立验收、可单独回滚。批 1 先抽 `useListPage` 公共层并在**售后列表单页**验证契约，批 3 才迁移库存两页。批 4 用 Vendure **内置 `ScheduledTask`**（v3.3+，由 `DefaultSchedulerPlugin` 在 worker 进程按 cron 周期执行）实现预留单超时释放，不引入 `setInterval`。

**Tech Stack:** uni-app 3 + Vue 3.5 + TypeScript（`d:\zhao\vshop\web-admin`，`npm run build:h5`）；Vendure 3.6.4 + TypeORM + `@vendure/cjk-plugin`（`d:\zhao\vendure`）；GraphQL admin-api；Playwright（Python，手机视口 390×844 dpr=2）。

**规格来源：** [2026-09-25-web-admin-gap4-design.md](file:///d:/zhao/web-admin/docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md)（commit `8a5a9d5`）

**仓库约定（每批都必须满足）**
- i18n：新增词条 **zh-Hans / en 同步**；语言包 = `src/locale/zh-Hans.json` + `src/locale/en.json`（[localeStore.ts](file:///d:/zhao/web-admin/src/stores/localeStore.ts#L2-L8)）。
- 每批：`npm run build:h5` 通过 + e2e/API 回归 + 手机视口截图（存 `docs/verify/`）+ 手册章节。
- **两个仓库，各自为 cwd 提交**：`d:\zhao\vshop`（前端 / 文档）与 `d:\zhao\vendure`（后端 / 插件）是**两个独立 git 仓库**，`d:\zhao` 本身不是仓库。所有 `git add` 命令的路径**以本任务所属仓库根为基准**：前端侧写 `web-admin/src/...`（cwd=`d:\zhao\vshop`），后端侧写 `packages/cjk-plugin/src/...`（cwd=`d:\zhao\vendure`）。跨仓库的改动**拆成两条命令**。严禁 `git add -A`；临时脚本用完即删。
- 偏差只追加到本文件文末「偏差说明区」，**不回头改正文**。

---

## 1. 批 0 · 前置核验结论（已完成，替代原「先做核验」）

2026-09-25 只读核验完成，结论直接决定下面的任务形态，**不再保留降级分支**：

| # | 核验项 | 结论 | 证据 | 对计划的影响 |
|---|---|---|---|---|
| 0.1 | `updateCollection` 是否接受 `position` | **不通过**（该字段不在输入类型中） | `UpdateCollectionInput` 无 `position`；[collection.api.graphql](file:///d:/zhao/vendure/packages/core/src/api/schema/admin-api/collection.api.graphql#L38-L84) | 排序**不改走 updateCollection**，改走 0.2 的 `moveCollection` |
| 0.2 | 是否可改 `parentId` / 有无 `moveCollection` | **通过**（有 `moveCollection(collectionId, parentId, index)`） | [collection.service.ts](file:///d:/zhao/vendure/packages/core/src/service/services/collection.service.ts#L620-L657)、[move-to-index.ts](file:///d:/zhao/vendure/packages/core/src/service/helpers/utils/move-to-index.ts#L5-L32) | 排序与层级移动**统一用 `moveCollection`**（`index` 驱动同父级排序） |
| 0.3 | 批次状态机 `SHIPPED` 之后有无状态位 | **不通过**（`SHIPPED`/`CANCELLED` 为终态，无后续位） | [pick-batch-math.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/picking/pick-batch-math.ts#L7-L17)、[pick-batch.entity.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/picking/pick-batch.entity.ts#L7-L32) | 7.2 交接/复核/异常件**须先扩状态机**，按规格顺延为批 4 末尾独立提交（Task 4.5/4.6） |
| 0.4 | 后端有无可复用作业量聚合查询 | **部分通过** | `stockMovementLedger(productVariantId, locationId, bizCode, orderLineId, bizType, direction, from, to, page, pageSize)`（[plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1235-L1238)）、`stockDocList(type, page, pageSize)`（[plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1437-L1439)）、`pickBatches(options)`（[plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1508-L1513)） | 报表**纯前端聚合**，不新增 resolver。§7.3 的「盘库次数 / 差异率」需盘点任务接口（批 3 已接入的库存域），若聚合口径不足按 Task 4.7 Step 6 退化为「仅展示可聚合的三项 KPI + 趋势」并在偏差区记录 |
| 0.5 | 风格体系结构化表单后端支撑度 | **JSON 存储**（`themeTokens` / `defaults` / `theme` / `pages` 均 `simple-json`） | [shop-global-config.entity.ts](file:///d:/zhao/vendure/packages/shop-template-plugin/src/shop-global-config.entity.ts#L15-L19)、[shop-template.entity.ts](file:///d:/zhao/vendure/packages/shop-template-plugin/src/shop-template.entity.ts#L22-L28) | 结构化表单是**纯前端**职责，后端保持 JSON 不变；批 2 三项全做 |
| 0.6 | 定时任务在哪运行（新增核验） | **需口径决策**：dev-config 现为 `runTasksInWorkerOnly: false`，即 server 与 worker **都会**跑任务 | [dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L309-L338) | 见 Task 4.3：若保持 `false`，则验收 4「停 worker 不释放」不成立，须改为「**停掉所有进程**后不释放」或改 `true`；决策写入偏差区 |

> 硬约束仍然有效：**绝不硬造本地排序字段**（会与 C 端顺序不一致）。

---

## 2. 批 1 · 列表一致性 + 分类（纯前端）

**批次目标：** 抽出 `useListPage` 并在售后列表单页跑通；补齐售后筛选/分页（G5）；分类层级/排序/移动/图标/批量（G6）；清理死代码（G7.4/G7.5）。

**批次门禁：** `npm run build:h5` 通过；售后列表筛选/翻页 e2e 通过；分类排序回读一致；死代码删除后无引用报错。

---

### Task 1.1: 新增 `useListPage` composable

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\composables\useListPage.ts`

**契约（与规格 §4.1 一致）：** `items / total / loading / finished / error / loadMore() / refresh() / applyFilter(f) / resetFilter() / shown / hasMore`，外加 `filter`（只读）、`setSort()`、`syncFromQuery()`、`toQuery()`。

- [ ] **Step 1: 创建文件（完整实现，直接落地）**

```ts
// 列表页公共层：分页 + 下拉刷新 + 上滑加载 + 筛选态 + 竞态防护。
// 契约见 docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §4.1。
// 用法：在页面 setup 中调用；composable 内部已注册 onReachBottom / onPullDownRefresh。
import { computed, ref, type Ref } from 'vue';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';

export interface ListQueryParams {
  skip: number;
  take: number;
  filter: Record<string, unknown>;
  sort?: Record<string, string>;
}

export interface ListPageOptions<T> {
  fetcher: (p: ListQueryParams) => Promise<{ items: T[]; total: number }>;
  /** 每页条数，默认 20 */
  take?: number;
  /** 是否立即加载首页，默认 true */
  immediate?: boolean;
  /** 是否仅在窄屏（< 768px）做上滑加载，桌面端交给页面自己的分页条，默认 true */
  mobileOnly?: boolean;
  /** 失败回调，默认 uni.showToast */
  onError?: (e: unknown) => void;
}

export function useListPage<T>(options: ListPageOptions<T>) {
  const take = options.take ?? 20;
  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const loadingMore = ref(false);
  const finished = ref(false);
  const error = ref('');
  const filter = ref<Record<string, unknown>>({});
  const sort = ref<Record<string, string> | undefined>(undefined);

  // 竞态防护：自增请求序号，只有最新一次结果允许写入
  let seq = 0;

  const shown = computed(() => items.value.length);
  const hasMore = computed(() => items.value.length < total.value);

  function isMobile(): boolean {
    if (!options.mobileOnly) return true;
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  }

  function fail(e: unknown) {
    const msg = (e as any)?.response?.errors?.[0]?.message ?? (e as any)?.message ?? String(e);
    error.value = msg;
    if (options.onError) options.onError(e);
    else uni.showToast({ title: msg, icon: 'none' });
  }

  async function loadFirst() {
    const my = ++seq;
    loading.value = true;
    loadingMore.value = false;
    error.value = '';
    try {
      const r = await options.fetcher({ skip: 0, take, filter: filter.value, sort: sort.value });
      if (my !== seq) return;
      items.value = r.items;
      total.value = r.total;
      finished.value = r.items.length >= r.total;
    } catch (e) {
      if (my === seq) fail(e); // 失败保留上一次结果，不清空
    } finally {
      if (my === seq) loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || finished.value) return;
    if (!isMobile()) return;
    const my = ++seq;
    loadingMore.value = true;
    try {
      const r = await options.fetcher({
        skip: items.value.length,
        take,
        filter: filter.value,
        sort: sort.value,
      });
      if (my !== seq) return;
      items.value = items.value.concat(r.items);
      total.value = r.total;
      finished.value = r.items.length === 0 || items.value.length >= r.total;
    } catch (e) {
      if (my === seq) fail(e);
    } finally {
      if (my === seq) loadingMore.value = false;
    }
  }

  async function refresh() {
    finished.value = false;
    await loadFirst();
  }

  async function applyFilter(f: Record<string, unknown>) {
    filter.value = f;
    await refresh();
  }

  async function resetFilter() {
    filter.value = {};
    await refresh();
  }

  function setSort(s?: Record<string, string>) {
    sort.value = s;
    return refresh();
  }

  // ---- onLoad query 双向同步（进详情返回不丢筛选；同时支持分享/深链） ----
  function syncFromQuery(query: Record<string, string | undefined>) {
    const next: Record<string, unknown> = { ...filter.value };
    for (const [k, v] of Object.entries(query)) {
      if (k.startsWith('f_') && v != null && v !== '') next[k.slice(2)] = v;
    }
    filter.value = next;
  }
  function toQuery(): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(filter.value)) {
      if (v == null || v === '') continue;
      parts.push(`f_${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join('&');
  }

  onReachBottom(loadMore);
  onPullDownRefresh(async () => {
    await refresh();
    uni.stopPullDownRefresh();
  });
  if (options.immediate !== false) void loadFirst();

  return {
    items, total, loading, loadingMore, finished, error, filter, sort,
    shown, hasMore,
    loadFirst, loadMore, refresh, applyFilter, resetFilter, setSort,
    syncFromQuery, toQuery,
  };
}
```

- [ ] **Step 2: 类型门禁**

Run: `npm run build:h5`（cwd `d:\zhao\vshop\web-admin`）
Expected: 构建成功，无 TS 报错（新文件未被引用时也应通过）。

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/composables/useListPage.ts
git commit -m "feat(web-admin): add useListPage list composable"
```

---

### Task 1.2: 售后列表 API 补齐分页 + 筛选

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\afterSale.ts`（在 `fetchAfterSales` 之后追加；保留既有单条查询与 mutation）

**后端依据：** `afterSalesRequests(options: AfterSalesRequestAdminListOptions)` 的 `skip/take/filter/sort` 由 Vendure `generateListOptions` 自动生成，filter 参数由 `AfterSalesRequestAdmin` 字段派生：`orderId`/`id`/`customerId`(ID)、`type`/`state`/`reason`(String)、`refundAmount`(Int→NumberOperators)、`createdAt`/`updatedAt`(DateTime→DateOperators)，并支持 `_and`/`_or`（[generate-list-options.ts](file:///d:/zhao/vendure/packages/core/src/api/config/generate-list-options.ts#L158-L222)）。

> 既有校准注释提醒 `filter.id` / `filter.orderId` 变量类型须为 `String`。本任务改为**整个 options 作为单个变量传递**，filter 内的值退回 GraphQL 字面量（ID 标量接受字符串字面量），从根上绕开变量类型不匹配问题。

- [ ] **Step 1: 追加分页查询与筛选构造**

```ts
// ---- 分页 + 筛选（第 4 轮补齐，G5） ----

export interface AfterSaleListFilter {
  /** 售后单号 / 订单号，精确匹配 */
  keyword?: string;
  /** 售后类型 = AFTER_SALE_TYPES 的 key */
  type?: string;
  /** 申请时间区间（含端点），格式 yyyy-MM-dd */
  from?: string;
  to?: string;
  /** 退款金额区间，单位分 */
  minRefund?: number;
  maxRefund?: number;
}

export type AfterSaleSortBy = 'createdAt' | 'refundAmount';

/** 把 UI 筛选态转成 Vendure 生成的 AfterSalesRequestAdminFilterParameter */
export function buildAfterSaleFilter(f: AfterSaleListFilter): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (f.type) and.push({ type: { eq: f.type } });
  if (f.from || f.to) {
    and.push({
      createdAt: {
        between: {
          start: `${f.from || '1970-01-01'}T00:00:00.000Z`,
          end: `${f.to || '2999-12-31'}T23:59:59.999Z`,
        },
      },
    });
  }
  if (f.minRefund != null || f.maxRefund != null) {
    and.push({ refundAmount: { between: { start: f.minRefund ?? 0, end: f.maxRefund ?? 2147483647 } } });
  }
  if (f.keyword) {
    const kw = f.keyword.trim();
    and.push({ _or: [{ id: { eq: kw } }, { orderId: { eq: kw } }] });
  }
  return and.length ? { _and: and } : {};
}

/** 售后分页列表：skip/take/filter/sort 全部透传给 Vendure 标准列表查询 */
export async function fetchAfterSalePage(p: {
  skip: number;
  take: number;
  filter?: Record<string, unknown>;
  sort?: Record<string, string>;
}): Promise<{ items: AfterSaleRow[]; total: number }> {
  const { afterSalesRequests } = await getAdminClient().request<{
    afterSalesRequests: { items: AfterSaleRow[]; totalItems: number };
  }>(
    `query AfterSalesPage($options: AfterSalesRequestAdminListOptions) {
      afterSalesRequests(options: $options) {
        totalItems
        items { ${AFTER_SALE_FIELDS} }
      }
    }`,
    {
      options: {
        skip: p.skip,
        take: p.take,
        ...(p.filter && Object.keys(p.filter).length ? { filter: p.filter } : {}),
        ...(p.sort ? { sort: p.sort } : {}),
      },
    },
  );
  return {
    items: afterSalesRequests?.items ?? [],
    total: afterSalesRequests?.totalItems ?? 0,
  };
}
```

- [ ] **Step 2: 写一个即用即删的探针，确认 filter/sort 语法被接受**

创建 `d:\zhao\vshop\web-admin\scripts\_probe_aftersale_page.mjs`（**用完删除**）：

```js
// 目的：确认 AfterSalesRequestAdminListOptions 接受 skip/take/filter/sort，且 totalItems 返回正确。
// 运行：node scripts/_probe_aftersale_page.mjs
const ENDPOINT = process.env.WA_API || 'http://localhost:3000/admin-api';

async function gql(query, variables, token) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const login = await gql(
  `mutation { login(username: "superadmin", password: "superadmin") { ... on CurrentUser { id } } }`,
  {},
);
const token = login?.data?.login ? undefined : undefined; // 若接口走 cookie，可直接带 Cookie 头
console.log('login:', JSON.stringify(login));

const q = `query P($options: AfterSalesRequestAdminListOptions) {
  afterSalesRequests(options: $options) { totalItems items { id orderId state type refundAmount createdAt } }
}`;
for (const options of [
  { take: 2, skip: 0 },
  { take: 2, skip: 0, sort: { createdAt: 'DESC' } },
  { take: 2, skip: 0, filter: { _and: [{ state: { eq: 'Pending' } }] } },
  { take: 2, skip: 0, filter: { _and: [{ createdAt: { between: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' } } }] } },
  { take: 2, skip: 0, filter: { _and: [{ refundAmount: { between: { start: 0, end: 2147483647 } } }] } },
  { take: 2, skip: 0, filter: { _and: [{ _or: [{ id: { eq: '1' } }, { orderId: { eq: '1' } }] }] } },
]) {
  const r = await gql(q, { options }, token);
  console.log(JSON.stringify(options), '=>', r.errors ? `ERROR ${r.errors[0].message}` : `total=${r.data.afterSalesRequests.totalItems}`);
}
```

Run: `node scripts/_probe_aftersale_page.mjs`（cwd `d:\zhao\vshop\web-admin`）
Expected: 6 组 options 全部无 `errors`，`total` 为数字。任一报错先修 `buildAfterSaleFilter` 的字段名/操作符，再继续。

- [ ] **Step 3: 删除探针**

```bash
git status --short
```
确认 `scripts/_probe_aftersale_page.mjs` 未提交，然后删除该文件。

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/apis/afterSale.ts
git commit -m "feat(web-admin): paged + filtered after-sale list query"
```

---

### Task 1.3: 售后列表页接入 `useListPage` + 筛选 UI（G5）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\list\index.vue`（现 86 行，整页重写 template script，样式沿用既有 `.tabs` / `.card` / `.empty`）
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（`pages/after-sale/list/index` 补 `enablePullDownRefresh`）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

- [ ] **Step 1: `pages.json` 开启下拉刷新**

把 [pages.json](file:///d:/zhao/web-admin/src/pages.json#L28) 第 28 行改为：

```json
{ "path": "pages/after-sale/list/index", "style": { "navigationBarTitleText": "售后处理", "enablePullDownRefresh": true } },
```

- [ ] **Step 2: 补 i18n 词条（两个语言包同步）**

`zh-Hans.json` 的 `afterSale.list` 下新增：

```json
"filterKeyword": "售后单号 / 订单号",
"filterType": "售后类型",
"filterTypeAll": "全部类型",
"filterDateFrom": "申请开始",
"filterDateTo": "申请结束",
"filterRefundMin": "退款下限(元)",
"filterRefundMax": "退款上限(元)",
"filterApply": "筛选",
"filterClear": "清空",
"sortCreated": "按申请时间",
"sortRefund": "按金额",
"shown": "已显示 {n} / {m}",
"loadMore": "上滑加载更多",
"noMore": "没有更多了",
"retry": "重试"
```

`en.json` 同结构对应英文：

```json
"filterKeyword": "After-sale / order no.",
"filterType": "After-sale type",
"filterTypeAll": "All types",
"filterDateFrom": "Applied from",
"filterDateTo": "Applied to",
"filterRefundMin": "Min refund (CNY)",
"filterRefundMax": "Max refund (CNY)",
"filterApply": "Filter",
"filterClear": "Clear",
"sortCreated": "By applied time",
"sortRefund": "By amount",
"shown": "{n} of {m} shown",
"loadMore": "Scroll up to load more",
"noMore": "No more items",
"retry": "Retry"
```

- [ ] **Step 3: 页面接入（template 关键段 + 完整 script）**

`<template>` 中在既有 `.tabs` 之后插入筛选区，列表尾部插入进度提示：

```html
<!-- 筛选区：关键词（失焦提交）+ 类型胶囊 + 日期区间 + 退款区间 + 排序 -->
<view class="filters">
  <input
    class="kw"
    :value="kw"
    :placeholder="$t('afterSale.list.filterKeyword')"
    confirm-type="search"
    @input="(e:any) => (kw = e.detail.value)"
    @confirm="onApply"
  />
  <view class="chips">
    <text
      class="chip"
      :class="{ on: !typeFilter }"
      @tap="onType('')"
    >{{ $t('afterSale.list.filterTypeAll') }}</text>
    <text
      class="chip"
      v-for="k in typeKeys"
      :key="k"
      :class="{ on: typeFilter === k }"
      @tap="onType(k)"
    >{{ $t('afterSale.list.typeLabel').replace('{type}', k) }}</text>
  </view>
  <view class="ranges">
    <picker mode="date" :value="from" @change="(e:any) => onDate('from', e.detail.value)">
      <text class="range">{{ $t('afterSale.list.filterDateFrom') }}：{{ from || '—' }}</text>
    </picker>
    <picker mode="date" :value="to" @change="(e:any) => onDate('to', e.detail.value)">
      <text class="range">{{ $t('afterSale.list.filterDateTo') }}：{{ to || '—' }}</text>
    </picker>
  </view>
  <view class="ranges">
    <input class="num" type="digit" :value="minRefund" :placeholder="$t('afterSale.list.filterRefundMin')"
      @input="(e:any) => (minRefund = e.detail.value)" @blur="onApply" />
    <input class="num" type="digit" :value="maxRefund" :placeholder="$t('afterSale.list.filterRefundMax')"
      @input="(e:any) => (maxRefund = e.detail.value)" @blur="onApply" />
  </view>
  <view class="chips">
    <text class="chip" :class="{ on: sortBy === 'createdAt' }" @tap="onSort('createdAt')">{{ $t('afterSale.list.sortCreated') }}</text>
    <text class="chip" :class="{ on: sortBy === 'refundAmount' }" @tap="onSort('refundAmount')">{{ $t('afterSale.list.sortRefund') }}</text>
    <text class="chip" @tap="onClear">{{ $t('afterSale.list.filterClear') }}</text>
  </view>
</view>
```

列表尾部（`<view style="height: 160rpx" />` 之前）插入：

```html
<view class="empty" v-if="page.loadingMore.value">{{ $t('afterSale.list.loading') }}</view>
<view class="empty" v-else-if="page.error.value">
  <text>{{ page.error.value }}</text>
  <text class="retry" @tap="page.refresh()">{{ $t('afterSale.list.retry') }}</text>
</view>
<view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('afterSale.list.noMore') }}</view>
<view class="progress" v-if="page.total.value">
  {{ $t('afterSale.list.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}
</view>
```

`<script lang="ts" setup>`：

```ts
import { ref, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchAfterSalePage, buildAfterSaleFilter, AfterSaleRow, type AfterSaleSortBy } from '../../../apis/afterSale';
import { useListPage } from '../../../composables/useListPage';
import { AFTER_SALE_STATES, AFTER_SALE_TYPES, stateLabel, StateLabel } from '../../../constants/orderState';

const locale = useLocaleStore();
const typeKeys = Object.keys(AFTER_SALE_TYPES);

// 顶部状态页签（沿用既有 tabAll/tabPending/tabRefunded/tabRejected 词条）
const tabs = [
  { key: '', label: 'tabAll' },
  { key: 'Pending', label: 'tabPending' },
  { key: 'Refunded', label: 'tabRefunded' },
  { key: 'Rejected', label: 'tabRejected' },
];
const cur = ref('');

// 筛选态
const kw = ref('');
const typeFilter = ref('');
const from = ref('');
const to = ref('');
const minRefund = ref('');
const maxRefund = ref('');
const sortBy = ref<AfterSaleSortBy>('createdAt');

const page = useListPage<AfterSaleRow>({
  take: 20,
  fetcher: ({ skip, take, filter, sort }) => fetchAfterSalePage({ skip, take, filter, sort }),
});

function currentFilter(): Record<string, unknown> {
  return buildAfterSaleFilter({
    keyword: kw.value,
    type: typeFilter.value,
    from: from.value,
    to: to.value,
    minRefund: minRefund.value ? Math.round(Number(minRefund.value) * 100) : undefined,
    maxRefund: maxRefund.value ? Math.round(Number(maxRefund.value) * 100) : undefined,
  });
}

/** 状态页签 + 筛选合并成一次请求条件 */
function combinedFilter(): Record<string, unknown> {
  const base = currentFilter();
  if (!cur.value) return base;
  const stateClause = { state: { eq: cur.value } };
  return base._and
    ? { _and: [...(base._and as unknown[]), stateClause] }
    : { _and: [stateClause] };
}

async function reload() {
  await page.applyFilter(combinedFilter());
  await page.setSort({ [sortBy.value]: 'DESC' });
}

function onApply() { void reload(); }
function onType(k: string) {
  typeFilter.value = typeFilter.value === k ? '' : k;
  void reload();
}
function onDate(which: 'from' | 'to', v: string) {
  if (which === 'from') from.value = v; else to.value = v;
  void reload();
}
function onSort(k: AfterSaleSortBy) {
  if (sortBy.value === k) return;
  sortBy.value = k;
  void reload();
}
function onClear() {
  kw.value = ''; typeFilter.value = ''; from.value = ''; to.value = ''; minRefund.value = ''; maxRefund.value = '';
  void reload();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void reload();
}
const st = (a: AfterSaleRow): StateLabel => stateLabel(AFTER_SALE_STATES, a.state);
function goDetail(a: AfterSaleRow) {
  uni.navigateTo({ url: `/pages/after-sale/detail/index?id=${a.id}` });
}

onLoad((query) => {
  page.syncFromQuery((query ?? {}) as Record<string, string>);
  void reload();
});
onMounted(() => { /* onLoad 已触发首屏；此处仅占位避免重复请求 */ });
onShow(() => { if (page.items.value.length) void reload(); });
```

新增样式（追加到既有 `<style>` 的 `.page` 内）：

```scss
.filters { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 20rpx;
  .kw { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; }
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
    .chip { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 10rpx 24rpx;
      &.on { background: $wa-accent; color: #fff; } } }
  .ranges { display: flex; gap: 16rpx; margin-top: 16rpx;
    .range, .num { flex: 1; font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; } } }
.progress { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
.retry { display: block; margin-top: 16rpx; color: $wa-accent; }
```

- [ ] **Step 4: 构建门禁 + 手机视口手测**

Run: `npm run build:h5`（cwd `d:\zhao\vshop\web-admin`）
Expected: 构建成功。

再用 Playwright（390×844，dpr=2）打开 `pages/after-sale/list/index`，人工核对 5 条：① 有关键词/类型/日期/金额/排序入口；② 改筛选后列表变化；③ 上滑出现「上滑加载更多」并累计；④ 下拉刷新复位；⑤ 底部显示「已显示 N / M」。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/pages/after-sale/list/index.vue web-admin/src/pages.json web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): after-sale list paging + filters via useListPage"
```

---

### Task 1.4: 分类查询层扩展 + 层级树（G6 第 1 步）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\collection.ts`

**现状：** [collection.ts](file:///d:/zhao/web-admin/src/apis/collection.ts#L3-L13) 的 `CollectionItem` 只有 `{id,name}`；[buildCollectionTree](file:///d:/zhao/web-admin/src/apis/collection.ts#L33-L53) 只做**扁平缩进**，没有展开/收起。本任务把查询补全，并新增「嵌套树 + 折叠过滤」纯函数（保留 `buildCollectionTree` 不动，避免影响既有下拉）。

- [ ] **Step 1: 扩展查询字段**

替换 `CollectionItem` 与 `fetchCollectionsOptimized`：

```ts
export interface CollectionItem {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  /** 分类图标等扩展字段，存 Collection.customFields */
  customFields?: { icon?: string | null } | null;
  productVariantCount?: number;
}

export async function fetchCollectionsOptimized(take = 200): Promise<CollectionItem[]> {
  const { collections } = await getAdminClient().request<{
    collections: { items: CollectionItem[] };
  }>(
    `query Collections($take: Int) {
      collections(options: { take: $take }) {
        items { id name parentId position customFields { icon } }
      }
    }`,
    { take },
  );
  return collections.items;
}
```

> 若 `customFields { icon }` 尚未在 Collection 上定义，GraphQL 会报未知字段——此时先执行 Task 1.6 Step 1 添加 `icon` 自定义字段，再回到本步。判据：探针报 `Cannot query field "icon" on type "Collection"`。

- [ ] **Step 2: 新增嵌套树 + 折叠过滤纯函数**

```ts
export interface CollectionTreeNode extends CollectionItem {
  depth: number;
  children: CollectionTreeNode[];
}

/** 由扁平列表构建嵌套树（同级按 position 升序；position 相同按 name） */
export function buildCollectionTreeNodes(list: CollectionItem[]): CollectionTreeNode[] {
  const byId = new Map<string, CollectionTreeNode>();
  for (const it of list) byId.set(String(it.id), { ...it, depth: 0, children: [] });
  const roots: CollectionTreeNode[] = [];
  for (const node of byId.values()) {
    const pid = node.parentId == null ? null : String(node.parentId);
    const parent = pid ? byId.get(pid) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: CollectionTreeNode[], depth: number) => {
    nodes.sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name));
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** 把嵌套树摊平成可渲染行，跳过已折叠节点的子树 */
export function flattenCollectionTree(
  nodes: CollectionTreeNode[],
  collapsed: Set<string>,
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];
  const walk = (list: CollectionTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (!collapsed.has(String(n.id))) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
```

- [ ] **Step 3: 类型门禁**

Run: `npm run build:h5`
Expected: 通过（`fetchPlatformCollections` / `buildCollectionTree` 未改动，既有引用不受影响）。

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/apis/collection.ts
git commit -m "feat(web-admin): collection query fields + nested tree helpers"
```

---

### Task 1.5: 分类层级展示 / 排序 / 层级移动（`moveCollection`）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\collection.ts`（新增 `moveCollection`）
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\categories\index.vue`（现为扁平列表 + 新增/映射/重命名/删除）

**后端依据：** `moveCollection(input: MoveCollectionInput!)`，`MoveCollectionInput = { collectionId, parentId, index }`，由 `moveToIndex(index, target, siblings)` 重排同父级 `position`（[collection.service.ts](file:///d:/zhao/vendure/packages/core/src/service/services/collection.service.ts#L620-L657)）。**排序与移动是同一个 mutation**：同父级换 `index` = 排序；换 `parentId` = 移动。

- [ ] **Step 1: 新增 API**

```ts
/** 排序 / 移动（Vendure 原生 moveCollection）。index 为同父级内的目标序号（0 起） */
export async function moveCollection(id: string, parentId: string | null, index: number): Promise<void> {
  await getAdminClient().request(
    `mutation MoveCollection($input: MoveCollectionInput!) { moveCollection(input: $input) { id } }`,
    { input: { collectionId: id, parentId, index } },
  );
}
```

- [ ] **Step 2: 页面改为树形渲染 + 上移/下移 + 改父级**

在 `categories/index.vue` 的 `<script setup>` 中改为消费嵌套树；template 用 `v-for` 渲染 `rows`（`flattenCollectionTree` 结果），按 `depth` 缩进：

```html
<view class="row" v-for="c in rows" :key="c.id" :style="{ paddingLeft: 24 + c.depth * 28 + 'rpx' }">
  <text class="caret" v-if="c.children.length" @tap="toggle(c.id)">{{ collapsed.has(c.id) ? '▸' : '▾' }}</text>
  <text class="caret" v-else>·</text>
  <text class="name">{{ c.name }}</text>
  <text class="muted" v-if="c.children.length">{{ c.children.length }}</text>
  <text class="act" @tap="onMoveUp(c)">↑</text>
  <text class="act" @tap="onMoveDown(c)">↓</text>
  <text class="act" @tap="onReparent(c)">↳</text>
  <text class="act" @tap="onIcon(c)">☺</text>
  <text class="act" @tap="onEdit(c)">改</text>
  <text class="act" @tap="onDel(c)">删</text>
</view>
```

```ts
import {
  fetchCollectionsOptimized, moveCollection, renameCollection, deleteCollectionById,
  saveCategoryMapping, buildCollectionTreeNodes, flattenCollectionTree,
  type CollectionItem, type CollectionTreeNode,
} from '../../../apis/collection';

const cats = ref<CollectionItem[]>([]);
const collapsed = ref<Set<string>>(new Set());
const tree = computed(() => buildCollectionTreeNodes(cats.value));
const rows = computed(() => flattenCollectionTree(tree.value, collapsed.value));

function toggle(id: string) {
  const s = new Set(collapsed.value);
  s.has(id) ? s.delete(id) : s.add(id);
  collapsed.value = s;
}

/** id → 节点 的扁平索引，覆盖任意深度（父节点不一定在根数组里） */
function indexNodes(nodes: CollectionTreeNode[], into = new Map<string, CollectionTreeNode>()) {
  for (const n of nodes) {
    into.set(String(n.id), n);
    indexNodes(n.children, into);
  }
  return into;
}
const nodeIndex = computed(() => indexNodes(tree.value));

/** 同父级内上/下移：把 index 与相邻兄弟交换后调 moveCollection */
async function swapSibling(node: CollectionTreeNode, dir: -1 | 1) {
  const pid = node.parentId == null ? null : String(node.parentId);
  const siblings = pid ? (nodeIndex.value.get(pid)?.children ?? []) : tree.value;
  const i = siblings.findIndex((s) => String(s.id) === String(node.id));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  await moveCollection(node.id, pid, j);
  await reload();
}
const onMoveUp = (n) => swapSibling(n, -1);
const onMoveDown = (n) => swapSibling(n, 1);

/** 改父级：下拉选目标父分类（含「顶层」） */
function onReparent(n) {
  const options = [{ id: '', name: locale.t('category.topLevel') },
    ...flattenCollectionTree(tree.value, new Set()).filter((x) => x.id !== n.id)
      .map((x) => ({ id: x.id, name: '　'.repeat(x.depth) + x.name }))];
  uni.showActionSheet({
    itemList: options.map((o) => o.name),
    success: async (r) => {
      const target = options[r.tapIndex];
      await moveCollection(n.id, target.id || null, 0);
      await reload();
    },
  });
}

async function reload() {
  cats.value = await fetchCollectionsOptimized();
}
```

- [ ] **Step 3: 补 i18n 词条（双语）**

`zh-Hans.json` 新增 `category` 命名空间：

```json
"category": { "topLevel": "顶层分类", "moveFail": "移动失败", "reparent": "移动到…", "collapse": "收起" }
```

`en.json`：

```json
"category": { "topLevel": "Top level", "moveFail": "Move failed", "reparent": "Move to…", "collapse": "Collapse" }
```

- [ ] **Step 4: 探针验证排序/移动真的落库**

即用即删脚本 `scripts/_probe_collection_move.mjs`：取同父级两个分类 `A,B`，调 `moveCollection(B,...)` 把 B 移到 index 0，再 `fetchCollectionsOptimized` 回读，断言 B.position < A.position；再对 A 调 `parentId: B` 断言回读 `A.parentId === B.id`。

Run: `node scripts/_probe_collection_move.mjs`
Expected: 两次断言均打印 `PASS`。**失败即视为 0.2 核验被推翻**——删除排序/移动 UI，只保留层级展示 + 图标 + 批量，并把原因写入偏差说明区。

- [ ] **Step 5: 删除探针 + Commit**

```bash
git add web-admin/src/apis/collection.ts web-admin/src/pages/product/categories/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): collection tree, position sort and reparent via moveCollection"
```

---

### Task 1.6: 分类图标（customFields）+ 批量操作

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（Collection 自定义字段加 `icon`）
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-collection-icon.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（注册迁移 provider）
- Modify: `d:\zhao\vshop\web-admin\src\apis\collection.ts`（`setCollectionIcon` / `batchDeleteEmptyCollections`）
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\categories\index.vue`（勾选 + 批删/批改图标/批移动）

**迁移写法参照：** [migrate-stock-tables.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/migrations/migrate-stock-tables.ts#L19-L47)（`CREATE TABLE IF NOT EXISTS` + `hasColumn`/`addColumn` 幂等），provider 注册见 [plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L171-L194)。

- [ ] **Step 1: 后端加 `icon` 自定义字段**

在 `cjk-plugin/src/plugin.ts` 的 `configuration` 中合并 Collection 自定义字段（沿用该文件既有的幂等 merge 风格）：

```ts
config.customFields.Collection = [
    ...(config.customFields.Collection ?? []),
    {
        name: 'icon',
        type: 'string',
        label: [{ languageCode: LanguageCode.zh_Hans, value: '分类图标' },
                { languageCode: LanguageCode.en, value: 'Category icon' }],
        nullable: true,
        public: true,
    } as any,
];
```

- [ ] **Step 2: 幂等迁移补列**

```ts
// migrate-collection-icon.ts
import { OnApplicationBootstrap } from '@nestjs/common';
import { Logger, TransactionalConnection } from '@vendure/core';

const loggerCtx = 'CollectionIconMigration';

/** 幂等补齐 collection.customFieldsIcon 列（Vendure customFields 命名规则：customFields + 首字母大写） */
export class CollectionIconMigration implements OnApplicationBootstrap {
    constructor(private connection: TransactionalConnection) {}

    async onApplicationBootstrap(): Promise<void> {
        const qr = this.connection.rawConnection.createQueryRunner();
        try {
            const has = await qr.hasColumn('collection', 'customFieldsIcon');
            if (!has) {
                await qr.addColumn('collection', new (require('typeorm').TableColumn)({
                    name: 'customFieldsIcon',
                    type: 'varchar',
                    isNullable: true,
                }));
                Logger.info('added collection.customFieldsIcon', loggerCtx);
            }
        } finally {
            await qr.release();
        }
    }
}
```

在 `plugin.ts` 的 `providers` 中加入 `CollectionIconMigration`（与 `StockTableMigration` 并列）。

- [ ] **Step 3: 前端 API**

```ts
/** 设置分类图标（写入 Collection.customFields.icon） */
export async function setCollectionIcon(id: string, icon: string | null): Promise<void> {
  await getAdminClient().request(
    `mutation SetCollectionIcon($input: UpdateCollectionInput!) { updateCollection(input: $input) { id } }`,
    { input: { id, customFields: { icon } } },
  );
}

/** 批量删除：仅空分类（无商品、无子分类）放行，返回不可删清单及原因 */
export function pickDeletableCollections(
  targets: CollectionItem[],
  all: CollectionItem[],
  productCountById: Map<string, number>,
): { ok: CollectionItem[]; blocked: Array<{ item: CollectionItem; reason: 'hasProducts' | 'hasChildren' }> } {
  const hasChild = new Set(all.filter((c) => c.parentId != null).map((c) => String(c.parentId)));
  const ok: CollectionItem[] = [];
  const blocked: Array<{ item: CollectionItem; reason: 'hasProducts' | 'hasChildren' }> = [];
  for (const c of targets) {
    if (hasChild.has(String(c.id))) blocked.push({ item: c, reason: 'hasChildren' });
    else if ((productCountById.get(String(c.id)) ?? 0) > 0) blocked.push({ item: c, reason: 'hasProducts' });
    else ok.push(c);
  }
  return { ok, blocked };
}
```

> 空分类判定口径：**子分类来自已加载的分类表**（可靠）；**商品数**需要 `productVariantCount`——若 `collections.items.productVariantCount` 不可用，则改为「逐条调 `deleteCollection` 并把 `NOT_DELETED` 当作因商品不可删」，不做客户端预判。二选一，落地时以探针结果为准并记录到偏差区。

- [ ] **Step 4: 页面加勾选与批量条**

在 `rows` 渲染行首加勾选框 `@tap="togglePick(c.id)"`，底部固定批量条：

```html
<view class="bulk" v-if="picked.size">
  <text class="muted">{{ picked.size }}</text>
  <text class="act" @tap="bulkIcon">{{ $t('category.bulkIcon') }}</text>
  <text class="act" @tap="bulkMove">{{ $t('category.bulkMove') }}</text>
  <text class="act" @tap="bulkDelete">{{ $t('category.bulkDelete') }}</text>
</view>
```

```ts
async function bulkDelete() {
  const targets = cats.value.filter((c) => picked.value.has(c.id));
  const { ok, blocked } = pickDeletableCollections(targets, cats.value, productCountById.value);
  for (const b of blocked) {
    uni.showToast({
      title: locale.t(b.reason === 'hasChildren' ? 'category.blockedChildren' : 'category.blockedProducts')
        .replace('{name}', b.item.name),
      icon: 'none',
    });
  }
  for (const c of ok) await deleteCollectionById(c.id);
  picked.value = new Set();
  await reload();
}
```

配套 i18n（双语）：`category.bulkIcon/bulkMove/bulkDelete/blockedChildren/blockedProducts`。

- [ ] **Step 5: 门禁**

Run: `npm run build:h5`（web-admin）+ 后端 `cd d:\zhao\vendure && npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 两侧均通过。

- [ ] **Step 6: Commit**

前端仓（cwd=`d:\zhao\vshop`）：

```bash
git add web-admin/src/pages/product/categories/index.vue web-admin/src/apis/collection.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): collection icon + batch ops (empty-only delete)"
```

后端仓（cwd=`d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/src/migrations/migrate-collection-icon.ts
git commit -m "feat(cjk-plugin): collection icon custom field"
```

---

### Task 1.7: 死代码清理（G7.4 / G7.5）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\collection.ts`

- [ ] **Step 1: 逐个 grep 确认零消费方**

对每个待删符号在 `d:\zhao\vshop\web-admin\src` 内 grep **符号名**（排除定义行本身）：

```
fetchProduct / fetchProducts / fetchProductDetail / createProduct / setProductEnabled
createVariantsForProduct / upsertProductTranslation / resolveStockLocationId
reuseOptionGroupForProduct / grossPriceFromNet / fetchTaxRatePercent
createCollection / updateCollection / mapProductToCollection
```

Run: 用 Grep 工具逐个执行（`output_mode: content`, `-n: true`, `path: d:\zhao\vshop\web-admin\src`）
Expected: 每个符号只命中定义处。**任一符号有其它命中 → 保留该符号并在其上方加注释** `// 仍被 <文件> 使用：<用途>`，不删除。

- [ ] **Step 2: 删除确认无消费方的符号**

`product.ts` 删除 Step 1 中零命中的符号（口径：实际走 `createProductFull` / `updateProductFull` / `fetchProductFull`）。
`collection.ts` 删除 `createCollection` / `updateCollection` / `mapProductToCollection`（租户隔离路径走 `createTenantCollection` / `renameCollection`；`mapProductToCollection` 由后端自动处理）。

> 注意 `collection.ts` 的 `moveCollection`（Task 1.5 新增）与 `setCollectionIcon`（Task 1.6 新增）**不在删除清单**。

- [ ] **Step 3: 门禁**

Run: `npm run build:h5`
Expected: 构建通过，无 "is not exported by" / 未定义引用报错。

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/apis/product.ts web-admin/src/apis/collection.ts
git commit -m "chore(web-admin): remove dead apis (G7.4/G7.5)"
```

---

### Task 1.8: 批 1 验收（e2e + 手机视口截图 + 手册）

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_gap4_batch1.py`
- Create: `d:\zhao\vshop\web-admin\docs\verify\gap4-batch1-*.png`
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`

- [ ] **Step 1: 写 e2e 脚本（Playwright，手机视口 390×844 dpr=2）**

脚本骨架（沿用 `_e2e/` 既有 Python 风格）：

```python
"""批 1 验收：售后列表筛选/分页 + 分类树/排序。截图落 docs/verify/。"""
import asyncio, pathlib
from playwright.async_api import async_playwright

BASE = "http://localhost:5173/#/pages/after-sale/list/index"
OUT = pathlib.Path("docs/verify"); OUT.mkdir(parents=True, exist_ok=True)
VIEWPORT = {"width": 390, "height": 844}

async def shot(page, name):
    await page.screenshot(path=str(OUT / f"gap4-batch1-{name}.png"))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport=VIEWPORT, device_scale_factor=2)
        page = await ctx.new_page()
        await page.goto(BASE); await page.wait_for_timeout(1500)
        await shot(page, "aftersale-default")
        # 类型筛选
        await page.get_by_text("退款", exact=False).first.click()
        await page.wait_for_timeout(1200)
        await shot(page, "aftersale-type-filter")
        # 上滑加载
        await page.mouse.wheel(0, 3000); await page.wait_for_timeout(1200)
        await shot(page, "aftersale-loadmore")
        # 分类页
        await page.goto("http://localhost:5173/#/pages/product/categories/index")
        await page.wait_for_timeout(1500)
        await shot(page, "categories-tree")
        await b.close()

asyncio.run(main())
```

- [ ] **Step 2: 起本地服务并跑脚本**

Run: `npm run dev:h5`（后台）→ `python _e2e/_verify_gap4_batch1.py`
Expected: `docs/verify/` 生成 4 张 780×1688 截图；人工核对：筛选生效、加载更多累计、分类树有缩进与展开箭头。

- [ ] **Step 3: 手册新增章节**

在 [webadmin-bugfix-manual.html](file:///d:/zhao/web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html) 末尾新增一批章节（编号接现有最大编号），含：① 售后列表筛选与分页操作步骤；② 分类树/排序/移动/图标/批量操作步骤与批删限制说明；③ 上述 4 张截图。

Run: `npm run verify:manual`
Expected: 通过（图片引用全部存在）。

- [ ] **Step 4: 批 1 收口提交 + 更新偏差区**

```bash
git add web-admin/_e2e/_verify_gap4_batch1.py web-admin/docs/verify web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html web-admin/docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md
git commit -m "test(docs): gap4 batch1 acceptance evidence + manual chapter"
```

同时在本文件文末「偏差说明区」追加批 1 执行结论（含 0.2 是否被探针推翻）。

---

## 3. 批 2 · 风格体系收尾（纯前端）

**批次目标：** 全局配置页与店铺覆盖页接入**已封装好的** `templateMergedPreview`，实现「改前可见」；把高频字段从 JSON 文本框提到结构化输入，JSON 保留为高级兜底；非法输入行内校验。

**批次门禁：** 不改 JSON 也能完成「建模板 → 选版式 → 保存 → 预览」；非法输入有行内校验；改动后能就地看到合并结果。

**后端依据：** `ShopGlobalConfig.themeTokens/defaults`、`ShopTemplate.theme/pages` 均为 `simple-json`（[shop-global-config.entity.ts](file:///d:/zhao/vendure/packages/shop-template-plugin/src/shop-global-config.entity.ts#L15-L19)），**后端不需要任何改动**；`templateMergedPreview` 已封装在 [template.ts](file:///d:/zhao/web-admin/src/apis/template.ts#L95-L134)，模板库预览页签已在用（[templates/index.vue](file:///d:/zhao/web-admin/src/pages/platform/templates/index.vue#L492-L518)）。

---

### Task 2.1: 全局配置页接入「合并预览」

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\global-config\index.vue`（现约 220 行；JSON 文本框 + `jsonOpen` 开关在 L65-L72，加载/保存在 L140-L217）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

- [ ] **Step 1: 新增共享的路径读写工具**

Create: `d:\zhao\vshop\web-admin\src\utils\config-path.ts`

```ts
/** 点路径读写（结构化表单 ↔ JSON 双向同步用）。坏路径返回 undefined，写入时按需建中间对象。 */
export function getByPath(obj: Record<string, any> | null | undefined, path: string): unknown {
  if (!obj) return undefined;
  return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

export function setByPath(obj: Record<string, any>, path: string, value: unknown): Record<string, any> {
  const keys = path.split('.');
  const root: Record<string, any> = { ...(obj ?? {}) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = typeof cur[k] === 'object' && cur[k] !== null ? { ...cur[k] } : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}
```

- [ ] **Step 2: 全局配置页新增预览卡片**

在 `<template>` 的保存按钮之后插入：

```html
<view class="card">
  <text class="sec">{{ $t('globalConfig.mergedPreview') }}</text>
  <text class="muted">{{ $t('globalConfig.mergedHint') }}</text>
  <view class="chips">
    <text class="chip" @tap="genPreview">{{ $t('globalConfig.previewNow') }}</text>
    <text class="chip" :class="{ on: previewOn }" @tap="previewOn = !previewOn">
      {{ previewOn ? $t('globalConfig.hideSources') : $t('globalConfig.showSources') }}
    </text>
  </view>
  <text v-if="previewErr" class="err">{{ previewErr }}</text>
  <pre v-if="previewText" class="json">{{ previewText }}</pre>
  <view v-if="previewOn && previewSources.length" class="srcs">
    <view class="src" v-for="s in previewSources" :key="s.key">
      <text class="k">{{ s.key }}</text>
      <text class="v" :class="'src-' + s.source">{{ s.source }}</text>
    </view>
  </view>
</view>
```

```ts
import * as templateApi from '../../../apis/template';
import { getByPath, setByPath } from '../../../utils/config-path';

const APP = 'vshop'; // web-admin 属 vshop 端；与模板库页签保持同一 app 口径

const previewText = ref('');
const previewErr = ref('');
const previewOn = ref(false);
const previewSources = ref<Array<{ key: string; source: string }>>([]);

/** 用「当前编辑态」而非已保存态做预览 —— 这就是「改前可见」 */
async function genPreview() {
  previewErr.value = '';
  previewText.value = '';
  previewSources.value = [];
  try {
    const overrides = { themeTokens: themeTokens.value, defaults: defaults.value };
    const r = await templateApi.mergedPreview(APP, undefined, overrides);
    previewText.value = JSON.stringify(r.merged, null, 2);
    previewSources.value = Object.entries(r.sourceByKey ?? {}).map(([key, source]) => ({
      key,
      source: String(source),
    }));
    previewOn.value = true;
  } catch (e: any) {
    previewErr.value = e?.response?.errors?.[0]?.message ?? String(e?.message ?? e);
  }
}
```

- [ ] **Step 3: 补 i18n（双语）**

`globalConfig` 命名空间新增：`mergedPreview / mergedHint / previewNow / showSources / hideSources`，值分别「合并预览 / 展示 L0→L3 逐级合并后的最终配置 / 立即预览 / 显示来源 / 隐藏来源」（en 对应英文）。

- [ ] **Step 4: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：进全局配置页 → 点「立即预览」→ 出现 merged JSON 与来源标签；改一个 token 再点预览，merged 随之变化。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/pages/platform/global-config/index.vue web-admin/src/utils/config-path.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): merged preview in global config page"
```

---

### Task 2.2: 店铺覆盖页接入「合并预览」

**Files:**
- Modify: 店铺覆盖页（先定位，见 Step 1）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`（复用 Task 2.1 的 `globalConfig.*` 词条，不新增）

- [ ] **Step 1: 定位店铺覆盖页**

Run: 用 Grep 工具搜 `updateChannelCustomFields`，`path: d:\zhao\vshop\web-admin\src\pages`，`output_mode: content`，`-n: true`
Expected: 命中调用该函数的页面文件（channel customFields 编辑页）。记下路径，代入下面步骤。

> 已确认的通道字段清单见 [channel.ts](file:///d:/zhao/web-admin/src/apis/channel.ts#L64)：`templateId / themeTokensOverride / pageCategoryConfig / pageCartConfig / pageProfileConfig / detailConfig`。

- [ ] **Step 2: 加同款预览卡片，overrides 用店铺覆盖字段**

复用 Task 2.1 的模板与 `genPreview`，仅把 overrides 换成店铺覆盖口径（`templateId` 传入，使合并链走到「L2 模板 → L3 覆盖」）：

```ts
const overrides = {
  theme: channel.themeTokensOverride ?? {},
  pages: {
    category: channel.pageCategoryConfig ?? {},
    cart: channel.pageCartConfig ?? {},
    profile: channel.pageProfileConfig ?? {},
  },
};
const r = await templateApi.mergedPreview(APP, channel.templateId || undefined, overrides);
```

- [ ] **Step 3: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：进店铺覆盖页 → 点「立即预览」→ merged 中 `theme` 反映 `themeTokensOverride`，来源标签显示含 L3 覆盖的键。

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/pages/platform
git commit -m "feat(web-admin): merged preview in shop override page"
```

---

### Task 2.3: 结构化表单（JSON 降为高级兜底）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\global-config\index.vue`
- Create: `d:\zhao\vshop\web-admin\src\constants\config-schema.ts`

- [ ] **Step 1: 定义字段 schema（高频字段结构化）**

Create: `d:\zhao\vshop\web-admin\src\constants\config-schema.ts`

```ts
/** 全局配置结构化字段表：高频字段提到表单，未列出的仍走 JSON 高级兜底。 */
export type FieldKind = 'color' | 'number' | 'select' | 'boolean';

export interface ConfigField {
  /** 相对 { themeTokens, defaults } 的点路径 */
  path: string;
  kind: FieldKind;
  /** i18n key 后缀，实际 key = `globalConfig.` + labelKey */
  labelKey: string;
  options?: string[];
  min?: number;
  max?: number;
}

export const GLOBAL_CONFIG_FIELDS: ConfigField[] = [
  { path: 'themeTokens.primaryColor', kind: 'color', labelKey: 'primaryColor' },
  { path: 'themeTokens.accentColor', kind: 'color', labelKey: 'accentColor' },
  { path: 'themeTokens.radius', kind: 'number', labelKey: 'radius', min: 0, max: 48 },
  { path: 'defaults.detail.layout', kind: 'select', labelKey: 'detailLayout', options: ['classic', 'floor', 'dualBuy'] },
  { path: 'defaults.detail.blocks.gallery', kind: 'boolean', labelKey: 'blockGallery' },
  { path: 'defaults.detail.blocks.price', kind: 'boolean', labelKey: 'blockPrice' },
  { path: 'defaults.detail.blocks.promo', kind: 'boolean', labelKey: 'blockPromo' },
  { path: 'defaults.detail.blocks.service', kind: 'boolean', labelKey: 'blockService' },
  { path: 'defaults.detail.blocks.reviews', kind: 'boolean', labelKey: 'blockReviews' },
];

/** 单字段校验：返回错误码，null = 通过 */
export function validateField(f: ConfigField, raw: unknown): string | null {
  switch (f.kind) {
    case 'color':
      return /^#[0-9a-fA-F]{6}$/.test(String(raw ?? '')) ? null : 'color';
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 'number';
      if (f.min != null && n < f.min) return 'min';
      if (f.max != null && n > f.max) return 'max';
      return null;
    }
    case 'select':
      return f.options?.includes(String(raw)) ? null : 'select';
    case 'boolean':
      return typeof raw === 'boolean' ? null : 'boolean';
    default:
      return null;
  }
}
```

- [ ] **Step 2: 页面渲染结构化表单，JSON 收进高级开关**

把原「默认值 JSON」文本框区块改为：结构化字段列表 + 既有 `jsonOpen` 开关（`v-if="jsonOpen"` 时才渲染原 textarea）。字段输入直接写回 `themeTokens` / `defaults`：

```html
<view class="card">
  <text class="sec">{{ $t('globalConfig.structured') }}</text>
  <view class="field" v-for="f in FIELDS" :key="f.path">
    <text class="lbl">{{ $t('globalConfig.' + f.labelKey) }}</text>
    <!-- color -->
    <input v-if="f.kind === 'color'" class="in" :value="String(readField(f))"
      @input="(e:any) => writeField(f, e.detail.value)" @blur="checkField(f)" />
    <!-- number -->
    <input v-else-if="f.kind === 'number'" class="in" type="number" :value="String(readField(f))"
      @input="(e:any) => writeField(f, Number(e.detail.value))" @blur="checkField(f)" />
    <!-- select -->
    <picker v-else-if="f.kind === 'select'" :range="f.options" @change="(e:any) => writeField(f, f.options![e.detail.value])">
      <text class="in">{{ String(readField(f)) }}</text>
    </picker>
    <!-- boolean -->
    <switch v-else :checked="!!readField(f)" @change="(e:any) => writeField(f, e.detail.value)" />
    <text v-if="fieldErrors[f.path]" class="err">{{ $t('globalConfig.err.' + fieldErrors[f.path]) }}</text>
  </view>
  <view class="chips">
    <text class="chip" :class="{ on: jsonOpen }" @tap="jsonOpen = !jsonOpen">{{ $t('globalConfig.advancedJson') }}</text>
  </view>
  <textarea v-if="jsonOpen" class="json-edit" v-model="defaultsJson" />
</view>
```

```ts
import { GLOBAL_CONFIG_FIELDS, validateField, type ConfigField } from '../../../constants/config-schema';
const FIELDS = GLOBAL_CONFIG_FIELDS;
const fieldErrors = ref<Record<string, string>>({});

/** 结构化字段的合并根：themeTokens + defaults 一条记录，路径前缀已含二者 */
const draft = computed<Record<string, any>>(() => ({ themeTokens: themeTokens.value, defaults: defaults.value }));
const readField = (f: ConfigField) => getByPath(draft.value, f.path);
function writeField(f: ConfigField, v: unknown) {
  if (f.path.startsWith('themeTokens.')) themeTokens.value = setByPath({ themeTokens: themeTokens.value }, f.path, v).themeTokens;
  else defaults.value = setByPath({ defaults: defaults.value }, f.path, v).defaults;
  void checkField(f);
}
function checkField(f: ConfigField) {
  const err = validateField(f, readField(f));
  fieldErrors.value = { ...fieldErrors.value, [f.path]: err ?? '' };
  return !err;
}
```

> 保留既有 `syncToJson` / `syncFromJson`：打开 JSON 高级模式时用当前 draft 刷新文本框；关闭时把文本框解析回 draft，实现双向同步（沿用原有函数，只改数据源）。

- [ ] **Step 3: 补 i18n（双语）**

`globalConfig` 新增：`structured / advancedJson / primaryColor / accentColor / radius / detailLayout / blockGallery / blockPrice / blockPromo / blockService / blockReviews`，以及 `globalConfig.err.{color,number,min,max,select,boolean}`（如「颜色需为 #RRGGBB / 需为数字 / 低于下限 / 超过上限 / 取值不合法 / 需为开关值」）。

- [ ] **Step 4: 构建 + 手测（不改 JSON 走完全流程）**

Run: `npm run build:h5`
Expected: 通过。手测：全程不打开 JSON → 改主色/圆角 → 选版式 `floor` → 关掉 `reviews` 块 → 保存 → 点「立即预览」，merged 反映以上三处改动。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/pages/platform/global-config/index.vue web-admin/src/constants/config-schema.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): structured global config form with JSON fallback"
```

---

### Task 2.4: 保存前行内校验（不再「报错 → 全部重填」）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\global-config\index.vue`（`save()` 在 L140-L217）

- [ ] **Step 1: `save()` 改为先跑字段校验，按字段标红**

```ts
async function save() {
  // 1) 结构化字段逐项校验：只标红出错项，不阻断其它字段的编辑态
  const failed = FIELDS.filter((f) => validateField(f, readField(f)) !== null);
  fieldErrors.value = failed.reduce<Record<string, string>>((acc, f) => {
    acc[f.path] = validateField(f, readField(f))!;
    return acc;
  }, {});
  if (failed.length) {
    uni.showToast({
      title: locale.t('globalConfig.err.fixFirst').replace('{n}', String(failed.length)),
      icon: 'none',
    });
    return; // 保留用户已填内容
  }
  // 2) JSON 高级模式下额外校验 JSON 文本本身
  if (jsonOpen.value) {
    try {
      const parsed = JSON.parse(defaultsJson.value || '{}');
      defaults.value = parsed;
    } catch (e: any) {
      fieldErrors.value = { ...fieldErrors.value, '__json': 'json' };
      uni.showToast({ title: locale.t('globalConfig.err.json'), icon: 'none' });
      return;
    }
  }
  // 3) 既有保存流程不变
  await templateApi.updateGlobalConfig({ app: APP, themeTokens: themeTokens.value, defaults: defaults.value });
  uni.showToast({ title: locale.t('globalConfig.saved'), icon: 'success' });
}
```

- [ ] **Step 2: 补 i18n（双语）**

`globalConfig.err` 增加 `fixFirst`（「有 {n} 处需要修正」）、`json`（「JSON 格式不合法」）。

- [ ] **Step 3: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：把主色改成 `abc` → 该字段标红且提示，其余字段保留；改回合法值 → 保存成功。

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/pages/platform/global-config/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): inline validation for global config"
```

---

### Task 2.5: 批 2 验收

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_gap4_batch2.py`
- Create: `d:\zhao\vshop\web-admin\docs\verify\gap4-batch2-*.png`
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`

- [ ] **Step 1: e2e 脚本（手机视口 390×844 dpr=2）**

沿用 Task 1.8 Step 1 骨架，覆盖 5 个动作：全局配置页结构化表单截图；非法主色标红截图；合法保存成功截图；「立即预览」merged JSON 截图；店铺覆盖页预览截图。

- [ ] **Step 2: 跑脚本 + 人工核对**

Run: `npm run dev:h5`（后台）→ `python _e2e/_verify_gap4_batch2.py`
Expected: `docs/verify/` 生成 5 张 780×1688 截图，人工核对 3 条验收标准全过。

- [ ] **Step 3: 手册章节 + 提交**

手册新增「风格体系：结构化配置与合并预览」章节（含 5 张截图），Run: `npm run verify:manual` 通过后：

```bash
git add web-admin/_e2e/_verify_gap4_batch2.py web-admin/docs/verify web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git commit -m "test(docs): gap4 batch2 acceptance evidence + manual chapter"
```

---

## 4. 批 3 · 库存域收尾（前端 + 单据中心最小后端扩展）

**批次目标：** 库存流水补筛选 + 展示 `beforeOnHand → afterOnHand`；单据中心补筛选 + 分页；两页统一迁移到 `useListPage`。

**批次门禁：** 按仓库/商品筛选结果正确；`in`/`out` 方向与数量显示正确；翻页累计不重复、不丢项；后端改动后 `stockMovementLedger` 无回归。

> **范围决策（已与用户确认）：** 单据中心后端只支持 `type`，故**允许最小后端扩展**：`stockDocList` 增加 `locationId / from / to / operator` 四个参数。仓库筛选**不改表结构**——`StockDocItemEntity` 已有 `fromStockLocationId` / `toStockLocationId`（[stock-doc-item.entity.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/inventory/stock-doc-item.entity.ts#L10-L11)），用子查询完成匹配。

---

### Task 3.1: 后端 `stockDocList` 补四个筛选参数

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（SDL L1437-L1439）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-doc.admin.resolver.ts`（L51-L60）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-doc.service.ts`（`listDocs` L326-L378）

- [ ] **Step 1: SDL 加参数**

把 [plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1437-L1439) 改为：

```graphql
extend type Query {
    stockDocList(type: String, locationId: ID, from: String, to: String, operator: String, page: Int, pageSize: Int): StockDocList!
}
```

- [ ] **Step 2: resolver 透传**

```ts
@Query()
@Allow(InventoryPermissions.ViewStock as Permission, Permission.ReadCatalog, Permission.ReadStockLocation)
async stockDocList(
    @Ctx() ctx: RequestContext,
    @Args('type', { nullable: true }) type?: string,
    @Args('locationId', { nullable: true }) locationId?: ID,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
    @Args('operator', { nullable: true }) operator?: string,
    @Args('page', { nullable: true }) page?: number,
    @Args('pageSize', { nullable: true }) pageSize?: number,
): Promise<any> {
    return this.stockDocService.listDocs(ctx, { type, locationId, from, to, operator, page, pageSize });
}
```

- [ ] **Step 3: service 加 where 条件**

`listDocs` 签名与查询改为：

```ts
async listDocs(
    ctx: RequestContext,
    options?: { type?: string; locationId?: ID; from?: string; to?: string; operator?: string; page?: number; pageSize?: number },
): Promise<{ totalItems: number; items: StockDocSummaryRow[] }> {
    const type = options?.type && DOC_TYPES.includes(options.type as StockDocType) ? String(options.type) : null;
    const page = clampPage(options?.page);
    const pageSize = clampPageSize(options?.pageSize);

    const qb = this.conn
        .getRepository(ctx, StockDocEntity)
        .createQueryBuilder('d')
        .where('d.tenantChannelId = :ch', { ch: ctx.channel.code });
    if (type) {
        qb.andWhere('d.type = :t', { t: type });
    }
    if (options?.locationId) {
        // 单据头无仓库字段：按明细的源/目标仓匹配（EXISTS，避免 join 造成行重复）
        qb.andWhere(
            `EXISTS (SELECT 1 FROM stock_doc_item i WHERE i.docId = d.id
                     AND (i.fromStockLocationId = :loc OR i.toStockLocationId = :loc))`,
            { loc: Number(options.locationId) },
        );
    }
    if (options?.from) {
        qb.andWhere('d.createdAt >= :from', { from: options.from });
    }
    if (options?.to) {
        qb.andWhere('d.createdAt <= :to', { to: options.to });
    }
    if (options?.operator) {
        qb.andWhere('d.operator = :op', { op: options.operator });
    }
    // 以下 orderBy / 分页 / 汇总逻辑保持不变
    const [docs, totalItems] = await qb
        .orderBy('d.createdAt', 'DESC')
        .addOrderBy('d.id', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();
    // ...（其余与现状一致，勿改）
```

- [ ] **Step 4: 探针验证四个筛选**

即用即删 `scripts/_probe_stockdoc_filters.mjs`：分别用 `{}`、`{type:'PURCHASE'}`、`{locationId:'1'}`、`{from:'2026-01-01T00:00:00.000Z', to:'2026-12-31T23:59:59.999Z'}`、`{operator:'superadmin'}` 调 `stockDocList`，打印 `totalItems`。

Run: `node scripts/_probe_stockdoc_filters.mjs`
Expected: 五组均无 `errors`；带筛选的 `totalItems` ≤ 全量 `totalItems`；日期/仓库筛选后数量和手工核对一致。

- [ ] **Step 5: 后端门禁 + 删除探针 + Commit**

Run: `cd d:\zhao\vendure && npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 通过。

后端仓（cwd=`d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/src/inventory/stock-doc.admin.resolver.ts packages/cjk-plugin/src/inventory/stock-doc.service.ts
git commit -m "feat(cjk-plugin): stockDocList filters (location/date/operator)"
```

---

### Task 3.2: 库存流水页 —— 迁移 `useListPage` + 筛选 + `before → after`

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\stock-doc.ts`（`fetchMovements` 在 L91-L117）
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\movements\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

**后端依据：** `stockMovementLedger` 已支持 `productVariantId / locationId / bizCode / bizType / direction / from / to / page / pageSize`，返回 `StockDocLedgerEntry` 含 `beforeOnHand / afterOnHand`（[plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1202-L1217)），并带 `summary: { inQty, outQty }`。**本页后端零改动。**

- [ ] **Step 1: API 返回 summary + 补齐参数类型**

```ts
export interface MovementQuery {
  productVariantId?: string;
  locationId?: string;
  bizCode?: string;
  bizType?: string;
  direction?: 'in' | 'out';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchMovements(q: MovementQuery): Promise<{
  items: MovementRow[];
  total: number;
  summary: { inQty: number; outQty: number };
}> {
  // 既有 GraphQL 查询不变，仅补 summary 字段与返回结构：
  //   stockMovementLedger(...) { totalItems summary { inQty outQty } items { ...beforeOnHand afterOnHand } }
}
```

> `MovementRow` 需确保已含 `beforeOnHand?: number | null` 与 `afterOnHand?: number | null`；缺则补上，并在 GraphQL 选择集中加上这两个字段。

- [ ] **Step 2: 页面改用 useListPage + 筛选区**

```ts
const page = useListPage<MovementRow>({
  take: 20,
  fetcher: ({ skip, take, filter }) => {
    const q = filter as MovementQuery;
    return fetchMovements({ ...q, page: Math.floor(skip / take) + 1, pageSize: take });
  },
});
const summary = ref({ inQty: 0, outQty: 0 });
```

筛选区字段：仓库（`picker` 取库位列表）、商品（关键词 → `productVariantId`）、方向（`in`/`out` 胶囊）、日期区间（两个 `picker mode="date"`）。任一项变更即 `page.applyFilter(...)`。

行内展示条件：仅当 `beforeOnHand != null && afterOnHand != null` 时渲染变化串：

```html
<text class="delta" v-if="m.beforeOnHand != null && m.afterOnHand != null">
  {{ m.beforeOnHand }} → {{ m.afterOnHand }}
</text>
<text class="delta muted" v-else>—</text>
```

顶部汇总条：`{{ $t('movements.inQty') }}: {{ summary.inQty }} ／ {{ $t('movements.outQty') }}: {{ summary.outQty }}`。

- [ ] **Step 3: 补 i18n（双语）**

`movements`：`filterLocation / filterVariant / filterDirection / directionIn / directionOut / filterDateFrom / filterDateTo / inQty / outQty / delta`。

- [ ] **Step 4: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：按仓库筛选后结果与单据明细一致；`in`/`out` 数量与顶部汇总一致；有 `beforeOnHand/afterOnHand` 的行显示 `A → B`，缺失显示 `—`；上滑翻页累计不重复。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/apis/stock-doc.ts web-admin/src/pages/inventory/movements/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): movements filters + before/after onHand via useListPage"
```

---

### Task 3.3: 单据中心 —— 迁移 `useListPage` + 四项筛选

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\stock-doc.ts`（`fetchStockDocList` 在 L136-L150）
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\stock-doc\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

- [ ] **Step 1: API 透传四个新参数**

```ts
export async function fetchStockDocList(p: {
  type?: string;
  locationId?: string;
  from?: string;
  to?: string;
  operator?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: StockDocRow[]; total: number }> {
  // GraphQL: stockDocList(type: $type, locationId: $locationId, from: $from, to: $to, operator: $operator, page: $page, pageSize: $pageSize)
  //   { totalItems items { id code type remark operator createdAt itemCount totalQty } }
}
```

- [ ] **Step 2: 页面迁移 + 筛选区**

```ts
const page = useListPage<StockDocRow>({
  take: 20,
  fetcher: ({ skip, take, filter }) => {
    const q = filter as Record<string, string | undefined>;
    return fetchStockDocList({ ...q, page: Math.floor(skip / take) + 1, pageSize: take });
  },
});
```

筛选区：类型（沿用既有类型胶囊，取值见 `DOC_TYPES`）、仓库（`picker`）、日期区间（两个 `picker mode="date"`）、操作人（文本输入，失焦提交）。列表行保持既有渲染，补「已显示 N / M」进度与空/错误态（由 `useListPage` 提供）。

- [ ] **Step 3: 补 i18n（双语）**

`stockDoc`：`filterType / filterLocation / filterDateFrom / filterDateTo / filterOperator`。

- [ ] **Step 4: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：四个筛选各自生效且可叠加；清空筛选恢复全量；上滑翻页累计不重复、不丢项。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/apis/stock-doc.ts web-admin/src/pages/inventory/stock-doc/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): stock doc center filters (type/location/date/operator)"
```

---

### Task 3.4: 批 3 验收

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_gap4_batch3.py`
- Create: `d:\zhao\vshop\web-admin\docs\verify\gap4-batch3-*.png`
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`

- [ ] **Step 1: e2e 脚本**

沿用 Task 1.8 Step 1 骨架，覆盖：库存流水默认态 / 按仓库筛选 / 按方向筛选 / `before → after` 行截图；单据中心默认态 / 按仓库+日期筛选 / 上滑加载更多。

- [ ] **Step 2: 跑脚本 + 对账核对**

Run: `npm run dev:h5`（后台）→ `python _e2e/_verify_gap4_batch3.py`
Expected: 生成 7 张 780×1688 截图；按「当前筛选条件」用探针接口取同一条件的 `totalItems`，与页面「已显示 N / M」的 M 完全一致（对账证据写入截图清单）。

- [ ] **Step 3: 手册章节 + 提交**

手册新增「库存流水与单据中心：筛选与分页」章节（含 7 张截图），Run: `npm run verify:manual` 通过后：

```bash
git add web-admin/_e2e/_verify_gap4_batch3.py web-admin/docs/verify web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git commit -m "test(docs): gap4 batch3 acceptance evidence + manual chapter"
```

---

## 5. 批 4 · 仓内作业闭环（前端 + 后端 + 运维）

**批次目标：** 7.1 定时底座 + 预留单超时释放；7.2 批次交接 / 复核 / 异常件；7.3 长期报表。

**批次门禁：** `cjk-plugin` 构建 + 单测通过；worker-only 证明成立（停 worker 不释放）；批次状态流转回读正确；报表与流水/明细对账一致。

**三项已定决策（写死，不再留分支）：**

| 决策点 | 结论 | 理由 |
|---|---|---|
| TTL 释放范围 | **仅 `PENDING_ALLOC`** | `onAllocation` 建头单后紧接着 `allocate`；停在 `PENDING_ALLOC` = 自动拆分未完成的滞留单，不持有占用，释放绝对安全。`ALLOCATED` 货已拆好等发货，释放会打断履约 |
| 释放留痕形式 | `OrderStockLedger` **事件行 + 释放量** | `bizType='manual'`、`direction='out'`、`quantity=totalQty`、`reason` 标注「不改实物库存」，页面可检索可对账；语义差异见 §6 |
| 定时任务运行口径 | `runTasksInWorkerOnly: true` | 验收 4「停 worker 不释放」才成立；派生的运维面（pm2 常驻 worker）写进 Task 4.9 |

**后端改动生效铁律（批 4 专属，务必遵守）：**
`d:\zhao\vendure\node_modules\@vendure\cjk-plugin` 是指向 `packages\cjk-plugin` 的 junction，而该包 `main = lib/index.js`。**每改完 `packages/cjk-plugin/src` 必须在该包跑一次 `npm run build`**，否则 dev-server / worker 仍执行旧 `lib/` 代码（表现为「改了没反应」）。

---

### Task 4.1: 预留单增加 `expiresAt`（实体 + 幂等迁移）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-reservation.entity.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-reservation-expires-at.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\index.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（import L70 + providers L191 一带）

- [ ] **Step 1: 实体加字段**

在 [stock-reservation.entity.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/inventory/stock-reservation.entity.ts) 的 `createdAt` 之后追加（import 行已含 `Index`，无需改）：

```ts
    /**
     * 预留单到期时间 = 创建时间 + channel customFields.reservationTtlMinutes（默认 30 分钟）。
     * 仅 PENDING_ALLOC 会用到：超时未完成备货拆分 → worker 的 release-expired-reservations 释放。
     * 历史数据为 NULL = 永不过期（不回溯释放旧单）。
     */
    @Index()
    @Column({ type: 'timestamp', nullable: true })
    expiresAt!: Date | null;
```

- [ ] **Step 2: 幂等迁移（列名从元数据推导，sqlite / postgres 通用）**

创建 `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-reservation-expires-at.ts`：

```ts
// 幂等补 stock_reservation.expiresAt 列（生产 Postgres 关闭 synchronize，必须显式补列）。
// 列名不硬编码：从 TypeORM 元数据取 databaseName，避免 dev(sqlite) / prod(postgres) 命名策略差异。
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, TableColumn } from 'typeorm';
import { StockReservationEntity } from '../inventory/stock-reservation.entity';

@Injectable()
export class ReservationExpiresAtMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const meta = this.connection.getMetadata(StockReservationEntity);
            const tableName = meta.tableName;
            const property = meta.columns.find(c => c.propertyName === 'expiresAt');
            const columnName = property?.databaseName ?? 'expiresAt';
            const runner = this.connection.createQueryRunner();
            try {
                if (!(await runner.hasColumn(tableName, columnName))) {
                    await runner.addColumn(
                        tableName,
                        new TableColumn({ name: columnName, type: 'timestamp', isNullable: true }),
                    );
                    // eslint-disable-next-line no-console
                    console.log(`[ReservationExpiresAtMigration] added ${tableName}.${columnName}`);
                }
            } finally {
                await runner.release();
            }
        } catch (e: any) {
            // 补列失败不阻塞启动，下次启动重试（与既有 migration 一致）
            // eslint-disable-next-line no-console
            console.error('[ReservationExpiresAtMigration] failed to ensure column:', e?.message);
        }
    }
}
```

- [ ] **Step 3: 注册迁移**

`src\migrations\index.ts` 追加一行（与既有导出行风格一致）：

```ts
export { ReservationExpiresAtMigration } from './migrate-reservation-expires-at';
```

`src\plugin.ts`：
1. L70 的 `import { ... } from './migrations'` 花括号内追加 `ReservationExpiresAtMigration`
2. providers 列表（`ChannelCustomColumnMigration,` 之后）追加 `ReservationExpiresAtMigration,`

- [ ] **Step 4: 构建**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）: `npm run build`
Expected: tsc 无错误；`lib/src/migrations/migrate-reservation-expires-at.js` 已生成。

- [ ] **Step 5: 启动验证列已补**

Run（cwd `d:\zhao\vendure\packages\dev-server`）: `npm run dev:server`
Expected: 启动日志出现（或至少不报）`[ReservationExpiresAtMigration]`；无 `failed to ensure column`。二次启动不再打印 `added`（幂等成立）。

- [ ] **Step 6: Commit**

后端仓（cwd=`d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src/inventory/stock-reservation.entity.ts packages/cjk-plugin/src/migrations/migrate-reservation-expires-at.ts packages/cjk-plugin/src/migrations/index.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): add expiresAt to stock reservation (idempotent migration)"
```

---

### Task 4.2: 服务层 —— TTL 计算 / 到期时间 / `releaseExpired` / 流水留痕 / SDL 补字段

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-reservation.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（`type Reservation` SDL，L1249-L1259）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-reservation.service.spec.ts`

- [ ] **Step 1: 先写失败测试**

在 `stock-reservation.service.spec.ts` 追加（沿用文件内既有 fake repo 构造方式；若既有 harness 只支持 `findOne/save`，则为 `createQueryBuilder` 补一个最小 fake，见下方注释要求）：

```ts
describe('StockReservationService.releaseExpired', () => {
    it('只释放 PENDING_ALLOC 且已过期的单，ALLOCATED 不动', async () => {
        const rows = [
            { id: 1, status: 'PENDING_ALLOC', expiresAt: new Date(Date.now() - 60_000), totalQty: 2, variantId: 9, tenantChannelId: 't1' },
            { id: 2, status: 'PENDING_ALLOC', expiresAt: new Date(Date.now() + 60_000), totalQty: 1, variantId: 9, tenantChannelId: 't1' },
        ];
        // fake: createQueryBuilder().where().andWhere()...getMany() → 返回 rows
        // fake: get() → 对应行；save() → 记录；items() → []；getTenantInventoryOverview() → { defaultPhysicalLocationId: '3' }
        const svc = new StockReservationService(conn as any, stockLevelService as any, vps as any, {} as any, ledger as any);
        const r = await svc.releaseExpired(ctx as any);
        expect(r.released).toBe(1);
        expect(ledger.record).toHaveBeenCalledTimes(1);
        expect(ledger.record.mock.calls[0][1]).toMatchObject({
            bizType: 'manual', direction: 'out', quantity: 2, bizCode: 'RES-1',
        });
    });

    it('expiresAt 为 NULL 的单不释放（历史数据不回溯）', async () => {
        // fake getMany() → []（NULL 被 andWhere('r.expiresAt IS NOT NULL') 挡掉）
        expect((await svc.releaseExpired(ctx as any)).released).toBe(0);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）: `npm test`
Expected: FAIL —— `svc.releaseExpired is not a function`。

- [ ] **Step 3: 实现（服务层）**

在 [stock-reservation.service.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/inventory/stock-reservation.service.ts) 顶部 import 追加：

```ts
import { StockLedgerService } from '@vendure/inventory-plugin';
```

文件级常量（`loggerCtx` 之后）：

```ts
export const DEFAULT_RESERVATION_TTL_MINUTES = 30;
```

构造函数注入追加 `private stockLedgerService: StockLedgerService,`（放在 `virtualPhysicalStockService` 之后；`eventBus` 保持最后）。

`reserveOnOrder` 在 `res.createdAt = new Date();` 之后补两行：

```ts
        res.createdAt = new Date();
        // 到期时间在「建头单」时一次算定，不随后续改配置回溯；TTL 非法/缺失 → 30 分钟
        res.expiresAt = new Date(res.createdAt.getTime() + (await this.ttlMinutes(ctx)) * 60_000);
```

（注意 `reserveOnOrder` 内已有 `existing` 分支：命中 `existing` 时同样重算 `expiresAt`，保持与 `totalQty` 覆写一致的语义。）

新增三个方法（放在 `release()` 之后、`// ---- 对账 ----` 之前）：

```ts
    /** 预留有效期（分钟）：channel customFields.reservationTtlMinutes，非法/缺失 → 30 */
    async ttlMinutes(ctx: RequestContext): Promise<number> {
        const raw = (ctx.channel?.customFields as any)?.reservationTtlMinutes;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_RESERVATION_TTL_MINUTES;
    }

    /**
     * 超时释放：只处理 PENDING_ALLOC（下单预占成功但自动拆分未完成的滞留单）。
     * ALLOCATED 不释放 —— 货已按仓拆好等发货，释放会打断履约。
     * expiresAt 为 NULL 的历史单不处理（不回溯）。
     */
    async releaseExpired(
        ctx: RequestContext,
        options: { now?: Date; limit?: number } = {},
    ): Promise<{ scanned: number; released: number }> {
        const now = options.now ?? new Date();
        const limit = options.limit ?? 200;
        const expired = await this.repo(ctx)
            .createQueryBuilder('r')
            .where('r.status = :status', { status: 'PENDING_ALLOC' })
            .andWhere('r.expiresAt IS NOT NULL')
            .andWhere('r.expiresAt < :now', { now })
            .andWhere('(r.tenantChannelId = :tenant OR r.tenantChannelId IS NULL)', { tenant: ctx.channel.code })
            .orderBy('r.expiresAt', 'ASC')
            .take(limit)
            .getMany();
        if (!expired.length) {
            return { scanned: 0, released: 0 };
        }
        for (const res of expired) {
            await this.release(ctx, res.id, { returnPhysical: false });
            await this.recordReleaseLedger(ctx, res);
        }
        Logger.info(`预留单超时释放 ${expired.length} 单`, loggerCtx);
        return { scanned: expired.length, released: expired.length };
    }

    /**
     * 释放留痕：写一条 OrderStockLedger 事件行。
     * 注意语义：PENDING_ALLOC 无 item、无物理占用，释放**不改变实物 onHand**，
     * 故 reason 显式标注「不改实物库存」；quantity 记的是被释放的占用量，便于对账检索。
     */
    private async recordReleaseLedger(ctx: RequestContext, res: StockReservationEntity): Promise<void> {
        const ov = await this.virtualPhysicalStockService.getTenantInventoryOverview(ctx);
        const locationId = ov.defaultPhysicalLocationId ?? ov.virtualLocationId;
        if (!locationId) {
            Logger.warn(`预留单 #${res.id} 释放时无可用仓，跳过流水留痕`, loggerCtx);
            return;
        }
        await this.stockLedgerService.record(ctx, {
            productVariantId: res.variantId as ID,
            stockLocationId: locationId as ID,
            bizType: 'manual',
            bizCode: `RES-${res.id}`,
            orderLineId: res.orderLineId as ID,
            direction: 'out',
            quantity: res.totalQty,
            reason: `预留单超时释放:#${res.id}（不改实物库存）`,
        });
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS（两个用例全绿）。

- [ ] **Step 5: SDL 补 `expiresAt`**

[plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1249-L1259) 的 `type Reservation` 内，`createdAt: DateTime!` 之后插入：

```graphql
                    expiresAt: DateTime
```

（前端倒计时依赖该字段；`reservation(id)` 详情同样返回它，一并生效。）

- [ ] **Step 6: 构建 + 探针验证**

Run: `npm run build` → 通过。

即用即删 `scripts/_probe_reservation_expire.mjs`：用 admin-api 发
`query { reservations(status: "PENDING_ALLOC", pageSize: 5) { totalItems items { id status totalQty expiresAt } } }`
Run: `node scripts/_probe_reservation_expire.mjs`
Expected: 无 `errors`；新产出的 `PENDING_ALLOC` 单 `expiresAt` 非空且 ≈ `createdAt + 30min`；历史单 `expiresAt` 为 `null`。

- [ ] **Step 7: Commit**

后端仓（cwd=`d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src/inventory/stock-reservation.service.ts packages/cjk-plugin/src/inventory/stock-reservation.service.spec.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): reservation TTL + releaseExpired with ledger trail"
```

---

### Task 4.3: 定时任务 `release-expired-reservations` + channel `reservationTtlMinutes` + worker-only 口径

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\reservation-expiry.task.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-reservation-ttl-column.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（`configuration` 钩子 + providers）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\index.ts`
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`（L309-L314）

- [ ] **Step 1: 定义 ScheduledTask**

创建 `d:\zhao\vendure\packages\cjk-plugin\src\inventory\reservation-expiry.task.ts`：

```ts
// 预留单超时释放：Vendure 内置 ScheduledTask（v3.3+），由 DefaultSchedulerPlugin 在 worker 进程按 cron 执行。
// 选 1 分钟周期：释放时效 ≤1min，代价是每轮一次极轻量的分组扫描（只扫 PENDING_ALLOC 且有 expiresAt 的行）。
// 复用既有 tenantChannelId（存的是 channel.code）反查渠道，再按渠道建 ctx —— 多店铺各自 TTL 才能生效。
import { Channel, Logger, RequestContextService, ScheduledTask, TransactionalConnection } from '@vendure/core';
import { StockReservationEntity } from './stock-reservation.entity';
import { StockReservationService } from './stock-reservation.service';

const loggerCtx = 'ReleaseExpiredReservationsTask';

export const RELEASE_EXPIRED_RESERVATIONS_TASK_ID = 'release-expired-reservations';

export const releaseExpiredReservationsTask = new ScheduledTask({
    id: RELEASE_EXPIRED_RESERVATIONS_TASK_ID,
    description: 'Release expired PENDING_ALLOC stock reservations (per-channel TTL)',
    schedule: cron => cron.every(1).minutes(),
    timeout: 60 * 1000,
    preventOverlap: true,
    async execute({ injector, scheduledContext }) {
        const connection = injector.get(TransactionalConnection);
        const requestContextService = injector.get(RequestContextService);
        const service = injector.get(StockReservationService);

        // 先跨渠道取「有到期单」的渠道集合，避免为每个渠道都建 ctx 做全表扫描
        const candidates = await connection.rawConnection
            .getRepository(StockReservationEntity)
            .createQueryBuilder('r')
            .select('r.tenantChannelId', 'tenant')
            .where('r.status = :status', { status: 'PENDING_ALLOC' })
            .andWhere('r.expiresAt IS NOT NULL')
            .andWhere('r.expiresAt < :now', { now: new Date() })
            .groupBy('r.tenantChannelId')
            .getRawMany<{ tenant: string | null }>();

        const channelRepo = connection.rawConnection.getRepository(Channel);
        let released = 0;
        for (const c of candidates) {
            const code = c.tenant;
            const channel = code ? await channelRepo.findOne({ where: { code } }) : null;
            // 渠道查不到 / tenantChannelId 为 NULL：退回默认渠道 ctx（与 core ScheduledTask 口径一致）
            const ctx = channel
                ? await requestContextService.create({ apiType: 'admin', channelOrToken: channel })
                : scheduledContext;
            const r = await service.releaseExpired(ctx);
            released += r.released;
        }
        if (released) {
            Logger.info(`释放到期预留单 ${released} 条（涉及 ${candidates.length} 个渠道）`, loggerCtx);
        }
        return { channels: candidates.length, released };
    },
});
```

- [ ] **Step 2: channel custom field 幂等补列**

创建 `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-reservation-ttl-column.ts`（结构与 `migrate-channel-custom-column.ts` 完全一致）：

```ts
// 幂等补 channel.reservationTtlMinutes 自定义字段列。
// Vendure 命名规则：customFields + 首字母大写字段名、其余小写 → customFieldsReservationttlminutes
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, TableColumn } from 'typeorm';

@Injectable()
export class ReservationTtlColumnMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const tableName = this.connection.getMetadata('Channel').tableName;
            const COL = 'customFieldsReservationttlminutes';
            const runner = this.connection.createQueryRunner();
            try {
                if (!(await runner.hasColumn(tableName, COL))) {
                    await runner.addColumn(
                        tableName,
                        new TableColumn({ name: COL, type: 'int', isNullable: true }),
                    );
                    // eslint-disable-next-line no-console
                    console.log(`[ReservationTtlColumnMigration] added ${tableName}.${COL}`);
                }
            } finally {
                await runner.release();
            }
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error('[ReservationTtlColumnMigration] failed to ensure column:', e?.message);
        }
    }
}
```

`src\migrations\index.ts` 追加 `export { ReservationTtlColumnMigration } from './migrate-reservation-ttl-column';`

- [ ] **Step 3: 注册字段与任务（`plugin.ts`）**

在 [plugin.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts) 顶层（`export class CjkPlugin` 之前）加一个与 order-timeout-plugin 同款的按名去重合并函数：

```ts
/** 幂等合并自定义字段（plugin configuration 可能被调用多次，按 name 去重） */
function mergeCustomFields<T extends { name: string }>(
    existingFields: T[] | undefined,
    additions: T[] | undefined,
): T[] {
    const names = new Set((existingFields ?? []).map(f => f.name));
    return [...(existingFields ?? []), ...(additions ?? []).filter(f => !names.has(f.name))];
}
```

`configuration: (config) => {` 体内、`return config;` 之前追加：

```ts
        config.customFields.Channel = mergeCustomFields(config.customFields.Channel, [
            {
                name: 'reservationTtlMinutes',
                type: 'number',
                label: [{ languageCode: LanguageCode.zh_Hans, value: '预留单有效期（分钟）' }],
                description: [
                    {
                        languageCode: LanguageCode.zh_Hans,
                        value: '预留单超时自动释放时长，默认 30；仅对未完成备货拆分的预留单生效',
                    },
                ],
            } as any,
        ]);
        if (!config.schedulerOptions.tasks.some(t => t.id === RELEASE_EXPIRED_RESERVATIONS_TASK_ID)) {
            config.schedulerOptions.tasks.push(releaseExpiredReservationsTask);
        }
```

（`LanguageCode` 若文件内未 import，从 `@vendure/core` 补入；已有则直接用。providers 列表追加 `ReservationTtlColumnMigration,`。）

- [ ] **Step 4: worker-only 口径**

[dev-config.ts](file:///d:/zhao/vendure/packages/dev-server/dev-config.ts#L309-L314) 改为：

```ts
    schedulerOptions: {
        // 任务只在 worker 进程执行：验收要求「停掉 worker 时预留单不被释放」以证明是真定时任务。
        // 代价：只用 `npm run dev:server` 时不会有任何 ScheduledTask（含 OrderTimeoutPlugin 补偿扫描、
        // 秒杀状态转换）在跑 —— 本地必须用 `npm run dev`（concurrently 同时起 server + worker），
        // 生产必须常驻一个 worker 进程（见 Task 4.9 手册章节）。
        runTasksInWorkerOnly: true,
        tasks: [cleanSessionsTask, cleanOrphanedSettingsStoreTask],
    },
```

- [ ] **Step 5: 构建 + 单测**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）: `npm run build && npm test`
Expected: 均通过。

- [ ] **Step 6: 证明任务只在 worker 执行（本批最关键的一步，不要跳过）**

1. 起后端（两条独立进程，**只起 server**）：cwd `d:\zhao\vendure\packages\dev-server` → `npm run dev:server`
2. 用探针造一条已过期的滞留单（即用即删 `scripts/_probe_seed_expired_reservation.mjs`，用 `rawConnection` 直插）：

```js
// 直插一条 status=PENDING_ALLOC 且已过期的预留单（仅本地验证用）
const repo = connection.rawConnection.getRepository('StockReservation');
await repo.save(repo.create({
  orderId: 999901, orderLineId: 999901, variantId: 1, totalQty: 1,
  status: 'PENDING_ALLOC', tenantChannelId: '<当前渠道 code>',
  createdAt: new Date(Date.now() - 3600_000),
  expiresAt: new Date(Date.now() - 60_000),
}));
```

3. 等待 **≥ 2 个调度周期（≥ 2 分钟）**，再查该单
Expected: `status` 仍为 `PENDING_ALLOC`（**未释放**）→ 证明 server 不跑任务。
4. 新开一条进程：cwd `d:\zhao\vendure\packages\dev-server` → `npm run dev:worker`
5. 等待 ≤ 2 分钟后再查
Expected: `status` = `RELEASED`；`stockMovementLedger(bizCode: "RES-999901")` 能查到 1 条 `bizType=manual` / `direction=out` / `quantity=1` 的流水。worker 日志出现 `释放到期预留单 1 条`。

- [ ] **Step 7: Commit**

后端仓（cwd=`d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src/inventory/reservation-expiry.task.ts packages/cjk-plugin/src/migrations/migrate-reservation-ttl-column.ts packages/cjk-plugin/src/migrations/index.ts packages/cjk-plugin/src/plugin.ts packages/dev-server/dev-config.ts
git commit -m "feat(cjk-plugin): scheduled release of expired reservations (worker-only)"
```

---

### Task 4.4: 前端 —— 预留单独立页（倒计时 + 手动释放 + 入口）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\reservation.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\inventory\reservation\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`
- Modify: `d:\zhao\vshop\web-admin\src\pages\inventory\stock\index.vue`（`QUICK` 宫格）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

- [ ] **Step 1: API 层**

[reservation.ts](file:///d:/zhao/vshop/web-admin/src/apis/reservation.ts) 追加（`Reservation` 接口补 `expiresAt: string | null`）：

```ts
export interface ReservationListParams {
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 预留单列表。注意：**不要**带 `items { ... }` 子选择集 ——
 * `reservations` resolver 返回的是实体列表，`Reservation.items` 在 SDL 里是非空列表但列表接口不装配它，
 * 带子选择集会被 GraphQL 以 non-null 违例报错（详情走 `reservation(id)`，它显式拼了 items）。
 */
export async function fetchReservations(
  params: ReservationListParams = {},
): Promise<{ totalItems: number; items: Reservation[] }> {
  const c = getAdminClient();
  try {
    const r = await c.request<{ reservations: { totalItems: number; items: Reservation[] } }>(
      `query ($status: String, $page: Int, $pageSize: Int) {
        reservations(status: $status, page: $page, pageSize: $pageSize) {
          totalItems
          items { id orderId orderLineId variantId totalQty status tenantChannelId createdAt expiresAt }
        }
      }`,
      { status: params.status ?? null, page: params.page ?? 1, pageSize: params.pageSize ?? 20 },
    );
    return r.reservations ?? { totalItems: 0, items: [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '预留单查询失败'));
  }
}

/** 手动释放（后端 releaseReleaservation(id) → service.release(returnPhysical:false)） */
export async function releaseReservationAdmin(id: string): Promise<Reservation> {
  const c = getAdminClient();
  try {
    const r = await c.request<{ releaseReservation: Reservation }>(
      `mutation ($id: ID!) {
        releaseReservation(id: $id) { id orderId orderLineId variantId totalQty status tenantChannelId createdAt expiresAt }
      }`,
      { id },
    );
    return r.releaseReservation;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '预留单释放失败'));
  }
}
```

- [ ] **Step 2: 页面**

创建 `d:\zhao\vshop\web-admin\src\pages\inventory\reservation\index.vue`（结构复刻 `pages/inventory/stock-doc/index.vue` 的列表骨架；列表逻辑用 Task 1.1 的 `useListPage`）：

```vue
<template>
  <view class="page">
    <view class="seg">
      <view v-for="t in TABS" :key="t.key" class="seg-item" :class="{ on: status === t.key }" @tap="onTab(t.key)">
        {{ $t('inventoryReservation.tab.' + t.key) }}
      </view>
    </view>

    <view class="sec">
      <text class="sh">{{ $t('inventoryReservation.title') }}</text>
      <text class="sp" />
      <text class="cnt">{{ $t('inventoryReservation.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}</text>
    </view>

    <view v-for="r in page.items.value" :key="r.id" class="card">
      <view class="r1">
        <text class="oid">#{{ r.orderId }}</text>
        <text class="st" :class="stateClass(r.status)">{{ $t('inventoryReservation.state.' + r.status) }}</text>
      </view>
      <view class="kv"><text class="k">{{ $t('inventoryReservation.variant') }}</text><text class="v">{{ r.variantId }}</text></view>
      <view class="kv"><text class="k">{{ $t('inventoryReservation.qty') }}</text><text class="v">{{ r.totalQty }}</text></view>
      <view class="kv"><text class="k">{{ $t('inventoryReservation.createdAt') }}</text><text class="v">{{ fmt(r.createdAt) }}</text></view>
      <view v-if="r.status === 'PENDING_ALLOC'" class="kv">
        <text class="k">{{ $t('inventoryReservation.remaining') }}</text>
        <text class="v" :class="{ warn: remainingMs(r) <= 0 }">{{ remainingLabel(r) }}</text>
      </view>
      <text
        v-if="r.status === 'PENDING_ALLOC' || r.status === 'ALLOCATED'"
        class="rel"
        :class="{ dis: busy === r.id }"
        @tap="onRelease(r)"
      >{{ $t('inventoryReservation.release') }}</text>
    </view>

    <view v-if="page.loading.value || page.loadingMore.value" class="more">{{ $t('inventoryReservation.loading') }}</view>
    <view v-else-if="!page.hasMore.value && page.items.value.length" class="more">{{ $t('inventoryReservation.noMore') }}</view>
    <view v-if="!page.items.value.length && !page.loading.value" class="empty">{{ $t('inventoryReservation.empty') }}</view>
    <view style="height: 140rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref } from 'vue';
import { useListPage } from '../../../composables/useListPage';
import { fetchReservations, releaseReservationAdmin, type Reservation } from '../../../apis/reservation';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const TABS = [
  { key: '' }, { key: 'PENDING_ALLOC' }, { key: 'ALLOCATED' }, { key: 'DONE' }, { key: 'RELEASED' },
];
const status = ref('');
const busy = ref('');

const page = useListPage<Reservation>({
  take: 20,
  fetcher: ({ skip, take, filter }) =>
    fetchReservations({
      status: (filter?.status as string) || undefined,
      page: Math.floor(skip / take) + 1,
      pageSize: take,
    }),
});

function onTab(key: string): void {
  status.value = key;
  page.applyFilter(key ? { status: key } : {});
}

// ---- 倒计时：每秒 tick 一次驱动重算；离开页面必须清掉，否则定时器泄漏 ----
const now = ref(Date.now());
const timer = setInterval(() => { now.value = Date.now(); }, 1000);
onUnmounted(() => clearInterval(timer));

function remainingMs(r: Reservation): number {
  if (!r.expiresAt) return Number.POSITIVE_INFINITY;
  return new Date(r.expiresAt).getTime() - now.value;
}
function remainingLabel(r: Reservation): string {
  const ms = remainingMs(r);
  if (!Number.isFinite(ms)) return locale.t('inventoryReservation.never');
  if (ms <= 0) return locale.t('inventoryReservation.expired');
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmt(v: string): string {
  return v ? new Date(v).toLocaleString() : '—';
}
function stateClass(s: string): string {
  return s === 'PENDING_ALLOC' ? 'warn' : s === 'RELEASED' ? 'muted' : s === 'DONE' ? 'ok' : '';
}

function onRelease(r: Reservation): void {
  uni.showModal({
    title: locale.t('inventoryReservation.release'),
    content: locale.t('inventoryReservation.releaseConfirm').replace('{id}', r.orderId),
    success: async (res) => {
      if (!res.confirm || busy.value) return;
      busy.value = r.id;
      try {
        await releaseReservationAdmin(r.id);
        uni.showToast({ title: locale.t('inventoryReservation.releaseDone'), icon: 'success' });
        await page.refresh();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('inventoryReservation.releaseFailed'), icon: 'none' });
      } finally {
        busy.value = '';
      }
    },
  });
}
</script>
```

样式沿用项目既有 `$wa-*` 变量（`.seg` 与数据看板 `.seg` 同款；卡片 `.card` 同款；`.rel` 释放按钮用 `$wa-accent`）。

- [ ] **Step 3: 注册页面 + 入口**

`src/pages.json` 的 `pages` 数组内，紧跟 `pages/inventory/stock-doc/index` 之后插入：

```json
    { "path": "pages/inventory/reservation/index", "style": { "navigationBarTitleText": "预留单", "enablePullDownRefresh": true } },
```

[pages/inventory/stock/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/inventory/stock/index.vue#L133-L142) 的 `QUICK` 数组追加第 9 项：

```ts
  { key: 'reservation', icon: '🔒', url: '/pages/inventory/reservation/index' },
```

- [ ] **Step 4: i18n 双语（两份都改，缺一不可）**

`zh-Hans.json` 新增 `inventoryReservation` 命名空间：

```json
"inventoryReservation": {
  "title": "预留单",
  "shown": "已显示 {n} / {m}",
  "variant": "SKU",
  "qty": "预占量",
  "createdAt": "创建时间",
  "remaining": "剩余有效期",
  "never": "不过期",
  "expired": "待释放",
  "release": "释放",
  "releaseConfirm": "确认释放订单 #{id} 的预留？释放后该单不再占用库存。",
  "releaseDone": "已释放",
  "releaseFailed": "释放失败",
  "loading": "加载中…",
  "noMore": "没有更多了",
  "empty": "暂无预留单",
  "tab": { "": "全部", "PENDING_ALLOC": "待备货", "ALLOCATED": "已备货", "DONE": "已完成", "RELEASED": "已释放" },
  "state": { "PENDING_ALLOC": "待备货", "ALLOCATED": "已备货", "DONE": "已完成", "RELEASED": "已释放" }
}
```

`en.json` 同构补全（`title: "Reservations"`、`tab/state` 对应 `All / Pending allocation / Allocated / Done / Released` 等），并在 `inventoryStock.quick` 内补 `"reservation": "预留单"` / `"Reservations"`。

- [ ] **Step 5: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：库存与预警页宫格出现第 9 项「预留单」→ 进入页面；tab 切换筛选生效；`PENDING_ALLOC` 行显示 `mm:ss` 倒计时且每秒递减；点释放 → 确认弹窗 → toast + 行状态变「已释放」；上滑翻页正常。

- [ ] **Step 6: Commit**

前端仓（cwd=`d:\zhao\vshop`）：

```bash
git add web-admin/src/apis/reservation.ts web-admin/src/pages/inventory/reservation/index.vue web-admin/src/pages.json web-admin/src/pages/inventory/stock/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): reservation page with countdown + manual release"
```

---

### Task 4.5: 批次状态机扩展（后端，独立提交、可独立回滚）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\picking\pick-batch.entity.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\picking\pick-batch-math.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\picking\pick-batch.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\picking\pick-batch.admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（`type PickBatch` + `extend type Mutation` SDL）
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-pick-batch-handover-columns.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\index.ts`

**新状态机（0.3 已确认 `SHIPPED` 现为终态，故必须扩）：**

| from | 允许的 to |
|---|---|
| PENDING | PICKED, CANCELLED |
| PICKED | PRINTED, CANCELLED |
| PRINTED | SHIPPED, CANCELLED |
| **SHIPPED** | **HANDOVER**, **EXCEPTION** |
| **HANDOVER** | **REVIEWED**, **EXCEPTION** |
| **EXCEPTION** | **HANDOVER**（登记异常后处理完回交接） |
| REVIEWED | （终态） |
| CANCELLED | （终态） |

- [ ] **Step 1: 状态与字段**

`pick-batch.entity.ts`：

```ts
/** 拣货批次状态。REVIEWED / CANCELLED 为终态。 */
export type PickBatchState =
    | 'PENDING' | 'PICKED' | 'PRINTED' | 'SHIPPED'
    | 'HANDOVER'   // 已交接（仓内发出、交接给承运/下一环节）
    | 'REVIEWED'   // 已复核（终态）
    | 'EXCEPTION'  // 异常件待处理
    | 'CANCELLED';
```

新增列：

```ts
    @Column({ type: 'timestamp', nullable: true })
    handoverAt!: Date | null;

    /** 交接对象（承运商 / 接收人） */
    @Column({ type: 'varchar', nullable: true })
    handoverTo!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    reviewedAt!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    exceptionAt!: Date | null;

    /** 异常件原因（登记时必填，处理完保留） */
    @Column({ type: 'varchar', length: 1000, nullable: true })
    exceptionNote!: string | null;
```

- [ ] **Step 2: 迁移**

复制 Task 4.1 的迁移结构，改表/列：

```ts
// 幂等补 pick_batch 交接/复核/异常件列
@Injectable()
export class PickBatchHandoverColumnMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    async onApplicationBootstrap() {
        try {
            const meta = this.connection.getMetadata(PickBatch);
            const tableName = meta.tableName; // pick_batch
            const wanted: Array<{ property: string; type: 'timestamp' | 'varchar'; length?: number }> = [
                { property: 'handoverAt', type: 'timestamp' },
                { property: 'handoverTo', type: 'varchar', length: 255 },
                { property: 'reviewedAt', type: 'timestamp' },
                { property: 'exceptionAt', type: 'timestamp' },
                { property: 'exceptionNote', type: 'varchar', length: 1000 },
            ];
            const runner = this.connection.createQueryRunner();
            try {
                for (const w of wanted) {
                    const col = meta.columns.find(c => c.propertyName === w.property);
                    const name = col?.databaseName ?? w.property;
                    if (await runner.hasColumn(tableName, name)) continue;
                    await runner.addColumn(
                        tableName,
                        new TableColumn({ name, type: w.type, length: w.length as any, isNullable: true }),
                    );
                    // eslint-disable-next-line no-console
                    console.log(`[PickBatchHandoverColumnMigration] added ${tableName}.${name}`);
                }
            } finally {
                await runner.release();
            }
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error('[PickBatchHandoverColumnMigration] failed:', e?.message);
        }
    }
}
```

注册：`migrations/index.ts` 导出 + `plugin.ts` providers 追加。

- [ ] **Step 3: 状态机**

`pick-batch-math.ts` 的 `TRANSITIONS` 整体替换为：

```ts
const TRANSITIONS: Record<PickBatchState, PickBatchState[]> = {
    PENDING: ['PICKED', 'CANCELLED'],
    PICKED: ['PRINTED', 'CANCELLED'],
    PRINTED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['HANDOVER', 'EXCEPTION'],
    // 异常件处理完回交接（不回到 SHIPPED，避免重复发货语义）
    EXCEPTION: ['HANDOVER'],
    HANDOVER: ['REVIEWED', 'EXCEPTION'],
    REVIEWED: [],
    CANCELLED: [],
};
```

- [ ] **Step 4: 服务与 resolver**

`pick-batch.service.ts`：

1. `advance()` 内时间戳补一句：

```ts
        if (to === 'SHIPPED') batch.shippedAt = now;
        if (to === 'HANDOVER') batch.handoverAt = now;
        if (to === 'REVIEWED') batch.reviewedAt = now;
        if (to === 'EXCEPTION') batch.exceptionAt = now;
```

2. 新增两个方法（放在 `cancel()` 之后）：

```ts
    /** 交接登记：写交接对象 + 推进到 HANDOVER（状态机仍由 advance 把关） */
    async handover(ctx: RequestContext, batchId: ID, handoverTo: string): Promise<PickBatch> {
        const batch = await this.requireBatch(ctx, batchId);
        if (!canTransition(batch.state, 'HANDOVER')) {
            throw new UserInputError(`批次 ${batch.code} 不能从 ${batch.state} 交接`);
        }
        batch.handoverTo = handoverTo;
        return this.advance(ctx, batchId, 'HANDOVER');
    }

    /** 异常件登记：写原因 + 推进到 EXCEPTION */
    async registerException(ctx: RequestContext, batchId: ID, reason: string): Promise<PickBatch> {
        const batch = await this.requireBatch(ctx, batchId);
        if (!canTransition(batch.state, 'EXCEPTION')) {
            throw new UserInputError(`批次 ${batch.code} 当前状态 ${batch.state} 不能登记异常`);
        }
        batch.exceptionNote = reason;
        await this.connection.getRepository(ctx, PickBatch).save(batch);
        return this.advance(ctx, batchId, 'EXCEPTION');
    }
```

`pick-batch.admin.resolver.ts` 新增两个 mutation（沿用既有 `@Allow(Permission.UpdateOrder)` 口径）：

```ts
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async handoverPickBatch(
        @Ctx() ctx: RequestContext,
        @Args('batchId') batchId: ID,
        @Args('handoverTo') handoverTo: string,
    ) {
        await this.pickBatchService.handover(ctx, batchId, handoverTo);
        return this.pickBatchService.detail(ctx, batchId);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    async registerPickBatchException(
        @Ctx() ctx: RequestContext,
        @Args('batchId') batchId: ID,
        @Args('reason') reason: string,
    ) {
        await this.pickBatchService.registerException(ctx, batchId, reason);
        return this.pickBatchService.detail(ctx, batchId);
    }
```

- [ ] **Step 5: SDL（`plugin.ts`）**

`type PickBatch` 内 `shippedAt: DateTime` 之后追加：

```graphql
                    handoverAt: DateTime
                    handoverTo: String
                    reviewedAt: DateTime
                    exceptionAt: DateTime
                    exceptionNote: String
```

`extend type Mutation` 内 `shipPickBatch(...)` 之后追加：

```graphql
                    handoverPickBatch(batchId: ID!, handoverTo: String!): PickBatch!
                    registerPickBatchException(batchId: ID!, reason: String!): PickBatch!
```

> 注意：`packages/cjk-plugin/src/plugin.ts` 里有两套 SDL（admin / shop）。`type PickBatch` 仅 admin 侧存在，本步只改 admin 那一段（勿复制到 shop 段，否则 shop 侧会出现无 resolver 的悬空字段）。

- [ ] **Step 6: 构建 + 状态机回归**

Run（cwd `d:\zhao\vendure\packages\cjk-plugin`）: `npm run build && npm test`
Expected: 通过。即用即删 `scripts/_probe_pick_batch_flow.mjs` 验证迁移链：
`PENDING→PICKED→PRINTED→SHIPPED→HANDOVER→REVIEWED` 全部成功，且 `SHIPPED→REVIEWED` 被拒（返回明确错误原因）。
Run: `node scripts/_probe_pick_batch_flow.mjs`
Expected: 前 5 步 `state` 依次推进且 `handoverAt/reviewedAt` 有值；非法跨步报 `不能从 SHIPPED 变为 REVIEWED`。

- [ ] **Step 7: Commit**

后端仓（cwd=`d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src/picking/pick-batch.entity.ts packages/cjk-plugin/src/picking/pick-batch-math.ts packages/cjk-plugin/src/picking/pick-batch.service.ts packages/cjk-plugin/src/picking/pick-batch.admin.resolver.ts packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/src/migrations/migrate-pick-batch-handover-columns.ts packages/cjk-plugin/src/migrations/index.ts
git commit -m "feat(cjk-plugin): pick batch handover/review/exception states"
```

---

### Task 4.6: 前端 —— 批次交接 / 复核 / 异常件

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\picking.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\picking\batch.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

- [ ] **Step 1: API**

`apis/picking.ts`：

1. `PickBatchState` 联合类型补 3 个新状态：

```ts
export type PickBatchState =
  | 'PENDING' | 'PICKED' | 'PRINTED' | 'SHIPPED'
  | 'HANDOVER' | 'REVIEWED' | 'EXCEPTION' | 'CANCELLED';
```

2. `PickBatch` 接口补 `handoverAt?: string | null; handoverTo?: string | null; reviewedAt?: string | null; exceptionAt?: string | null; exceptionNote?: string | null;`

3. `PICK_BATCH_FIELDS`（L68-L71）追加：

```ts
  handoverAt handoverTo reviewedAt exceptionAt exceptionNote
```

4. 追加两个调用：

```ts
/** 交接登记（SHIPPED → HANDOVER） */
export async function handoverPickBatch(batchId: string, handoverTo: string): Promise<PickBatch> {
  try {
    const { handoverPickBatch } = await getAdminClient().request<{ handoverPickBatch: PickBatch }>(
      `mutation HandoverPickBatch($batchId: ID!, $handoverTo: String!) {
        handoverPickBatch(batchId: $batchId, handoverTo: $handoverTo) {${PICK_BATCH_FIELDS}}
      }`,
      { batchId, handoverTo },
    );
    return handoverPickBatch;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '交接登记失败'));
  }
}

/** 异常件登记（可登记态：SHIPPED / HANDOVER） */
export async function registerPickBatchException(batchId: string, reason: string): Promise<PickBatch> {
  try {
    const { registerPickBatchException } = await getAdminClient().request<{ registerPickBatchException: PickBatch }>(
      `mutation RegisterPickBatchException($batchId: ID!, $reason: String!) {
        registerPickBatchException(batchId: $batchId, reason: $reason) {${PICK_BATCH_FIELDS}}
      }`,
      { batchId, reason },
    );
    return registerPickBatchException;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '异常件登记失败'));
  }
}
```

- [ ] **Step 2: 页面**

`pages/order/picking/batch.vue`：

1. 顶部批次信息卡（`head`）内，在 `createdAt` 行之后补三条只读展示（有值才显示）：

```vue
      <view v-if="batch.handoverAt" class="kv"><text class="k">{{ $t('orderAdmin.picking.handoverTo') }}</text><text class="v">{{ batch.handoverTo || '—' }}</text></view>
      <view v-if="batch.handoverAt" class="kv"><text class="k">{{ $t('orderAdmin.picking.handoverAt') }}</text><text class="v">{{ fmtAt(batch.handoverAt) }}</text></view>
      <view v-if="batch.reviewedAt" class="kv"><text class="k">{{ $t('orderAdmin.picking.reviewedAt') }}</text><text class="v">{{ fmtAt(batch.reviewedAt) }}</text></view>
      <text v-if="batch.exceptionNote" class="ex">{{ $t('orderAdmin.picking.exceptionNote') }}：{{ batch.exceptionNote }}</text>
```

2. 状态推进卡（⑥ `acts`）改为按状态出按钮：

```vue
    <view v-if="!readonly" class="card acts">
      <text v-if="batch && batch.state === 'PENDING'" class="ab" :class="{ dis: busy }" @tap="advance('PICKED')">{{ $t('orderAdmin.picking.markPicked') }}</text>
      <text v-if="batch && batch.state === 'PICKED'" class="ab" :class="{ dis: busy }" @tap="advance('PRINTED')">{{ $t('orderAdmin.picking.markPrinted') }}</text>
      <!-- SHIPPED 之后：交接 / 异常件 -->
      <text v-if="batch && batch.state === 'SHIPPED'" class="ab" :class="{ dis: busy }" @tap="openHandover">{{ $t('orderAdmin.picking.doHandover') }}</text>
      <text v-if="batch && (batch.state === 'SHIPPED' || batch.state === 'HANDOVER')" class="ab ghost" :class="{ dis: busy }" @tap="openException">{{ $t('orderAdmin.picking.registerException') }}</text>
      <!-- HANDOVER 之后：复核（异常件处理完也回到 HANDOVER 再复核） -->
      <text v-if="batch && batch.state === 'HANDOVER'" class="ab" :class="{ dis: busy }" @tap="advance('REVIEWED')">{{ $t('orderAdmin.picking.doReview') }}</text>
      <text v-if="canShip" class="ab ghost" :class="{ dis: busy }" @tap="onCancel">{{ $t('orderAdmin.picking.cancelBatch') }}</text>
    </view>
```

3. 两个输入弹层（复用页面既有 mask/sheet 样式；`handoverTo` / `exceptionReason` 为新增 ref）：

```vue
    <view v-if="handoverVisible" class="mask" @tap="handoverVisible = false">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('orderAdmin.picking.doHandover') }}</text>
        <input class="inp" v-model="handoverTo" :placeholder="$t('orderAdmin.picking.handoverPlaceholder')" />
        <view class="sbtns">
          <text class="sbtn ghost" @tap="handoverVisible = false">{{ $t('orderAdmin.picking.cancel') }}</text>
          <text class="sbtn" :class="{ dis: busy || !handoverTo.trim() }" @tap="submitHandover">{{ $t('orderAdmin.picking.confirm') }}</text>
        </view>
      </view>
    </view>

    <view v-if="exceptionVisible" class="mask" @tap="exceptionVisible = false">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('orderAdmin.picking.registerException') }}</text>
        <input class="inp" v-model="exceptionReason" :placeholder="$t('orderAdmin.picking.exceptionPlaceholder')" />
        <view class="sbtns">
          <text class="sbtn ghost" @tap="exceptionVisible = false">{{ $t('orderAdmin.picking.cancel') }}</text>
          <text class="sbtn" :class="{ dis: busy || !exceptionReason.trim() }" @tap="submitException">{{ $t('orderAdmin.picking.confirm') }}</text>
        </view>
      </view>
    </view>
```

4. 脚本补逻辑（沿用既有 `busy` / `seq` / `uni.showToast` 风格）：

```ts
const handoverVisible = ref(false);
const handoverTo = ref('');
const exceptionVisible = ref(false);
const exceptionReason = ref('');

function fmtAt(v?: string | null): string {
  return v ? new Date(v).toLocaleString() : '—';
}
function openHandover(): void {
  handoverTo.value = '';
  handoverVisible.value = true;
}
function openException(): void {
  exceptionReason.value = batch.value?.exceptionNote ?? '';
  exceptionVisible.value = true;
}
async function submitHandover(): Promise<void> {
  if (busy.value || !handoverTo.value.trim()) return;
  busy.value = true;
  try {
    await handoverPickBatch(batchId.value, handoverTo.value.trim());
    handoverVisible.value = false;
    uni.showToast({ title: locale.t('orderAdmin.picking.handoverDone'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.handoverFailed'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}
async function submitException(): Promise<void> {
  if (busy.value || !exceptionReason.value.trim()) return;
  busy.value = true;
  try {
    await registerPickBatchException(batchId.value, exceptionReason.value.trim());
    exceptionVisible.value = false;
    uni.showToast({ title: locale.t('orderAdmin.picking.exceptionDone'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.exceptionFailed'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}
```

（`load()` = 该页既有刷新函数，按文件内实际函数名引用；`import` 追加 `handoverPickBatch, registerPickBatchException`。）

- [ ] **Step 3: i18n 双语**

`orderAdmin.picking` 下新增：`handoverTo / handoverAt / reviewedAt / exceptionNote / doHandover / handoverPlaceholder / handoverDone / handoverFailed / registerException / exceptionPlaceholder / exceptionDone / exceptionFailed / doReview / cancel / confirm`，并在 `orderAdmin.picking.state` 下补 `HANDOVER / REVIEWED / EXCEPTION` 三个状态名（zh-Hans：已交接 / 已复核 / 异常件；en：Handed over / Reviewed / Exception）。**两份语言包同步补齐**。

- [ ] **Step 4: 构建 + 手测**

Run: `npm run build:h5`
Expected: 通过。手测：找一个 PRINTED 批次 → 标记发货 → `SHIPPED` → 出现「交接」与「登记异常」→ 交接填对象后变 `HANDOVER` 且显示交接对象/时间 → 「复核」→ `REVIEWED`；另起一个批次从 `HANDOVER` 登记异常 → `EXCEPTION` 且显示原因 → 再交接回 `HANDOVER`。

- [ ] **Step 5: Commit**

前端仓（cwd=`d:\zhao\vshop`）：

```bash
git add web-admin/src/apis/picking.ts web-admin/src/pages/order/picking/batch.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): pick batch handover/review/exception UI"
```

---

### Task 4.7: 长期报表（数据看板「视图」分段）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\utils\ops-report.ts`（纯函数：指标聚合 + CSV 行）
- Modify: `d:\zhao\vshop\web-admin\src\pages\data\dashboard\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `src\locale\en.json`

**指标口径（照抄规格 §7.3，不自行发挥）：**

| KPI | 口径 | 数据源 |
|---|---|---|
| 拣货单数 | 统计期内 state ∈ `SHIPPED / HANDOVER / REVIEWED` 的批次数（按 `createdAt` 归期） | `fetchPickBatches({pageSize: 100})` → 前端按 createdAt 过滤后计数 |
| 发货件数 | 统计期内已发货订单的 `totalQuantity` 合计（按订单 `createdAt` 归期） | `fetchOrders({take, skip, filter: buildOrderFilter({states, time})})` 分页累加 |
| 盘库次数 | 统计期内已提交（`SUBMITTED`/已过账）盘点任务数（按 `createdAt` 归期） | `fetchStocktakeTasks({pageSize: 100})` |
| 盘点差异率 | 统计期内 Σ(`diffCount`) ÷ Σ(`expectedTotal`)，两位小数百分比 | 上一步任务逐条 `fetchStocktakeDiff(taskId)` |

- [ ] **Step 1: 纯函数 + 单测**

创建 `src/utils/ops-report.ts`：

```ts
// 作业分析报表纯函数：时间窗口切分、KPI 聚合、差异趋势、CSV 行组装。
// 口径见 docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §7.3（务必与规格一致，勿自行发明口径）。
import type { PickBatch } from '../apis/picking';
import type { StocktakeTask, StocktakeDiff } from '../apis/stocktake';

export const SHIPPED_BATCH_STATES = ['SHIPPED', 'HANDOVER', 'REVIEWED'];

export interface OpsWindow {
  start: Date;
  /** 含 */
  end: Date;
  /** 7 | 30 */
  days: number;
}

/** 近 N 天窗口（含今日）：[今天-(N-1) 00:00, 明天 00:00) */
export function buildOpsWindow(days: number, now = new Date()): OpsWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { start, end, days };
}

export function inWindow(iso: string | null | undefined, w: OpsWindow): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= w.start.getTime() && t < w.end.getTime();
}

/** 'YYYY-MM-DD'（本地时区），用于订单列表 custom 时间窗口 */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function countBatches(batches: PickBatch[], w: OpsWindow): number {
  return batches.filter(b => SHIPPED_BATCH_STATES.includes(String(b.state)) && inWindow(b.createdAt, w)).length;
}

export function sumShippedItems(rows: Array<{ totalQuantity?: number | null }>): number {
  return rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0);
}

/** 已提交/已过账的盘点任务（DRAFT/OPEN/COUNTING/CANCELLED 不计） */
const DONE_TASK_STATES = ['SUBMITTED', 'POSTED'];

export function countStocktakeTasks(tasks: StocktakeTask[], w: OpsWindow): number {
  return tasks.filter(t => DONE_TASK_STATES.includes(String(t.state)) && inWindow(t.createdAt, w)).length;
}

export interface VarianceRate {
  expected: number;
  diff: number;
  /** 百分比，两位小数字符串；分母为 0 → '0.00' */
  rate: string;
}

export function varianceRate(diffs: StocktakeDiff[]): VarianceRate {
  let expected = 0;
  let diff = 0;
  for (const d of diffs) {
    expected += d?.expectedTotal ?? 0;
    diff += Math.abs(d?.diffCount ?? 0);
  }
  return { expected, diff, rate: expected > 0 ? ((diff / expected) * 100).toFixed(2) : '0.00' };
}

export interface TrendPointRow {
  day: string;
  expected: number;
  diff: number;
}

/** 按日聚合差异趋势（任务归期用 createdAt） */
export function varianceTrend(
  pairs: Array<{ createdAt: string; diff: StocktakeDiff }>,
  w: OpsWindow,
): TrendPointRow[] {
  const byDay = new Map<string, { expected: number; diff: number }>();
  for (let i = 0; i < w.days; i++) {
    const d = new Date(w.start);
    d.setDate(d.getDate() + i);
    byDay.set(ymd(d), { expected: 0, diff: 0 });
  }
  for (const p of pairs) {
    const key = ymd(new Date(p.createdAt));
    const cell = byDay.get(key);
    if (!cell) continue;
    cell.expected += p.diff?.expectedTotal ?? 0;
    cell.diff += Math.abs(p.diff?.diffCount ?? 0);
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, ...v }));
}
```

- [ ] **Step 2: 页面加「视图」分段**

`pages/data/dashboard/index.vue`：模板最上方（`.stat` 之前）插入视图分段，并把**现有全部卡片包进 `view === 'biz'` 分支**：

```vue
    <view class="seg views">
      <view class="seg-item" :class="{ on: view === 'biz' }" @tap="view = 'biz'">{{ $t('dataDashboard.view.biz') }}</view>
      <view class="seg-item" :class="{ on: view === 'ops' }" @tap="switchOps">{{ $t('dataDashboard.view.ops') }}</view>
    </view>

    <template v-if="view === 'biz'">
      <!-- 既有：概览 3 卡 / 7-30 分段 / 销售趋势 / TOP / 库存健康，原样保留 -->
    </template>

    <template v-else>
      <view class="stat">
        <view class="stat-card"><text class="num">{{ ops.pickCount }}</text><text class="lbl">{{ $t('dataDashboard.ops.pickCount') }}</text></view>
        <view class="stat-card"><text class="num">{{ ops.shippedItems }}</text><text class="lbl">{{ $t('dataDashboard.ops.shippedItems') }}</text></view>
      </view>
      <view class="stat">
        <view class="stat-card"><text class="num">{{ ops.stocktakeCount }}</text><text class="lbl">{{ $t('dataDashboard.ops.stocktakeCount') }}</text></view>
        <view class="stat-card"><text class="num">{{ ops.rate }}%</text><text class="lbl">{{ $t('dataDashboard.ops.varianceRate') }}</text></view>
      </view>

      <view class="card">
        <text class="sec">{{ $t('dataDashboard.ops.varianceTrend') }}</text>
        <TrendChart :points="trendPoints" />
      </view>

      <view class="card">
        <text class="sec">{{ $t('dataDashboard.ops.byCounter') }}</text>
        <view v-for="c in ops.byCounter" :key="c.operator" class="top-row">
          <text class="name">{{ c.operator || $t('dataDashboard.ops.unknownOperator') }}</text>
          <text class="cnt">{{ c.count }}</text>
          <text class="qty">{{ c.qty }}</text>
        </view>
        <text v-if="!ops.byCounter.length" class="muted">{{ $t('dataDashboard.empty') }}</text>
      </view>

      <view class="card">
        <text class="pb" @tap="exportCsv">{{ $t('dataDashboard.ops.exportCsv') }}</text>
      </view>
    </template>
```

关键点：**两视图共用既有 7 / 30 天分段**（分段块保持在两分支之外，即移到 `.views` 之后、`<template>` 之前），`switchOps()` 与 `loadDynamic()` 一样按 `days` 拉数据。

- [ ] **Step 3: 脚本装载**

```ts
import { buildOpsWindow, countBatches, countStocktakeTasks, sumShippedItems, varianceRate, varianceTrend, ymd, type TrendPointRow } from '../../../utils/ops-report';
import { fetchPickBatches } from '../../../apis/picking';
import { fetchStocktakeTasks, fetchStocktakeDiff } from '../../../apis/stocktake';
import { fetchOrders } from '../../../apis/order';
import { buildOrderFilter } from '../../../utils/orderFilter';
import { downloadCsv, fmtDateTime } from '../../../utils/csv';

const view = ref<'biz' | 'ops'>('biz');
const SHIPPED_ORDER_STATES = ['Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered'];

async function loadOps(): Promise<void> {
  const w = buildOpsWindow(days.value);
  // ① 拣货单数
  let pickCount = 0;
  try {
    const batches = await fetchPickBatches({ pageSize: 100 });
    pickCount = countBatches(batches.items, w);
  } catch (e) { console.error('ops batches failed', e); }
  // ② 发货件数：按订单创建时间归期、状态为已发货族，分页累加 totalQuantity
  let shippedItems = 0;
  try {
    const filter = buildOrderFilter({ states: SHIPPED_ORDER_STATES, time: { key: 'custom', from: ymd(w.start), to: ymd(new Date(w.end.getTime() - 1)) } });
    const acc: Array<{ totalQuantity?: number | null }> = [];
    for (let page = 1; page <= 10; page++) {
      const r = await fetchOrders({ take: 100, skip: (page - 1) * 100, filter });
      acc.push(...r.items);
      if (acc.length >= r.totalItems || !r.items.length) break;
    }
    shippedItems = sumShippedItems(acc);
  } catch (e) { console.error('ops orders failed', e); }
  // ③④ 盘库次数 + 差异率 + 差异趋势
  let stocktakeCount = 0; let rate = '0.00'; let trendPoints: TrendPointRow[] = [];
  try {
    const tasks = await fetchStocktakeTasks({ pageSize: 100 });
    stocktakeCount = countStocktakeTasks(tasks.items, w);
    const scoped = tasks.items.filter(t => ['SUBMITTED', 'POSTED'].includes(String(t.state)) && inWindowLoose(t.createdAt, w));
    const pairs: Array<{ createdAt: string; diff: any }> = [];
    for (const t of scoped) {
      try { pairs.push({ createdAt: t.createdAt, diff: await fetchStocktakeDiff(t.id) }); } catch { /* 单任务失败不阻塞整表 */ }
    }
    rate = varianceRate(pairs.map(p => p.diff)).rate;
    trendPoints = varianceTrend(pairs, w).map(r => ({ date: r.day, value: r.diff }));
  } catch (e) { console.error('ops stocktake failed', e); }
  // ⑤ 作业员明细：单据中心按操作人聚合（最近 100 条，口径=期间内创建的单据）
  ...
}
```

（`inWindowLoose` 与 `TrendChart` 的入参形状按仓库现有定义对齐：`TrendChart` 接收 `points` 且页面既有传入为 `{date, value}` —— 组装时按该形状映射，勿改组件契约。作业员明细用 `fetchStockDocList({pageSize: 100})` 取回后按 `operator` 分组聚合 `{count, qty: totalQty}`，期间用 `createdAt` 过滤。）

- [ ] **Step 4: CSV 导出**

```ts
function exportCsv(): void {
  downloadCsv(
    `ops-report-${days.value}d-${ymd(new Date())}.csv`,
    [locale.t('dataDashboard.ops.csvDay'), locale.t('dataDashboard.ops.csvExpected'), locale.t('dataDashboard.ops.csvDiff')],
    trend.map(r => [r.day, String(r.expected), String(r.diff)]),
  );
}
```

（`trend` = `varianceTrend` 的原始 `{day, expected, diff}`，导出内容与页面趋势图同源同值。）

- [ ] **Step 5: i18n 双语**

`dataDashboard` 下新增 `view.biz / view.ops` 与 `ops.pickCount / ops.shippedItems / ops.stocktakeCount / ops.varianceRate / ops.varianceTrend / ops.byCounter / ops.unknownOperator / ops.exportCsv / ops.csvDay / ops.csvExpected / ops.csvDiff`，zh-Hans / en 双份同步。

- [ ] **Step 6: 构建 + 对账 + 降级判定**

Run: `npm run build:h5`
Expected: 通过。

对账（**必须做**）：用手工筛选同区间的「单据中心」条数核对「拣货单数/盘库次数」，用「库存流水」的 `in/out` 合计核对「发货件数」的量级，差异率用 `盘点差异` 页同任务的两个数手算复核。
若某项数据源口径不足（如订单列表无法按发货时间归期、盘点任务接口拿不到 `SUBMITTED` 集合），**按降级处理**：该 KPI 位置显示 `—` 并在 §6 偏差区写明原因 —— **禁止用 0 假装有数据**（沿用数据看板既有约定：接口失败显示 `—`）。

- [ ] **Step 7: Commit**

前端仓（cwd=`d:\zhao\vshop`）：

```bash
git add web-admin/src/utils/ops-report.ts web-admin/src/pages/data/dashboard/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): ops analytics view on dashboard (KPI/trend/by-counter/CSV)"
```

---

### Task 4.8: 批 4 验收（e2e + 手机视口截图 + 对账）

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_gap4_batch4.py`
- Create: `d:\zhao\vshop\web-admin\docs\verify\gap4-batch4-*.png`

- [ ] **Step 1: e2e 脚本**

沿用 Task 1.8 Step 1 的 Playwright 骨架（390×844、dpr=2 → 780×1688、`docs/verify/` 落盘），覆盖 6 张：

1. 「库存与预警」宫格（含新增「预留单」第 9 项）
2. 预留单列表默认态（含倒计时 `mm:ss`）
3. 预留单 tab「已释放」
4. 数据看板「经营数据」视图（回归确认未被破坏）
5. 数据看板「作业分析」视图（KPI 4 卡 + 差异趋势）
6. 作业分析「作业员明细」+ 导出按钮

- [ ] **Step 2: worker-only 证明（回归，证明上一轮结论未漂移）**

Run: 只起 `npm run dev:server` → 造过期单 → 等 2 分钟 → 查状态
Expected: 仍 `PENDING_ALLOC`。
Run: 再起 `npm run dev:worker` → 等 ≤2 分钟
Expected: `RELEASED` + 流水 `RES-<id>` 行 + 前端列表状态与倒计时显示一致（倒计时归零显示「待释放」→ 刷新后变「已释放」）。

- [ ] **Step 3: 跑脚本**

Run: `npm run dev:h5`（后台）→ `python _e2e/_verify_gap4_batch4.py`
Expected: 生成 6 张 780×1688 截图；脚本内断言预留单页倒计时文本匹配 `^\d{2}:\d{2}$` 或「待释放」。

- [ ] **Step 4: 手册章节 + 提交**

手册新增「仓内作业闭环：预留单超时释放 / 批次交接复核 / 作业分析报表」章节（含 6 张截图），Run: `npm run verify:manual` 通过后：

前端仓（cwd=`d:\zhao\vshop`）：

```bash
git add web-admin/_e2e/_verify_gap4_batch4.py web-admin/docs/verify web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git commit -m "test(docs): gap4 batch4 acceptance evidence + manual chapter"
```

---

### Task 4.9: 运维手册 + 部署（批 4 的最后一步，**不可省**）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`（会发布的「youshop 使用手册」）

- [ ] **Step 1: 写「定时任务与常驻 worker」运维章节**

必须包含以下 5 条（缺一条视为未完成）：

1. **服务器必须常驻一个 worker 进程**（pm2 增一项），否则预留单**永不释放**；本项目已把 `runTasksInWorkerOnly` 置为 `true`，server 进程完全不跑 `ScheduledTask`。
2. pm2 条目示例（按服务器实际路径替换）：

```bash
pm2 start "npm run start:worker" --name youshop-worker --cwd /path/to/vendure/packages/dev-server
pm2 save
```

3. **副作用代码清单**：worker 缺席时下列功能一起失效 —— `release-expired-reservations`（预留单超时释放）、`order-timeout-compensation`（订单超时补偿扫描）、`flash-sale-status-transition`（秒杀状态转换）。
4. **自检命令**：`pm2 list` 应看到 worker 为 `online`；worker 日志出现 `ReleaseExpiredReservationsTask` 或 `释放到期预留单 N 条`。
5. **TTL 配置入口**：店铺渠道 `customFields.reservationTtlMinutes`，默认 30 分钟；多城市/多店铺可各自设值，改完需重启 worker（自定义字段值在 ctx 构建时读取，无需重启 server）。

- [ ] **Step 2: 部署**

按本仓库既有部署机制（web-admin 走 `scripts/deploy.mjs`；vendure 后端走 git pull + 构建 + pm2 restart），**本地构建产物上传，服务器只解压/重启，绝不在服务器构建**。

Run（本地）: `npm run build:h5`（cwd `d:\zhao\vshop\web-admin`）
Run: `node scripts/deploy.mjs`
Run（服务器）: `pm2 restart youshop-api youshop-worker`

Expected: 站点可访问；worker 为 `online`；端到端手测预留单超时释放成立。

- [ ] **Step 3: 最终提交**

前端仓（cwd=`d:\zhao\vshop`）：

```bash
git add web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html web-admin/src/static/manual/index.html web-admin/docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md
git commit -m "docs: gap4 ops runbook (resident worker) + plan deviation notes"
```

---

## 6. 偏差说明区

> 规则：本区只**追加**，不回头改正文。表头固定为 `# / 批次 / 偏差 / 原因 / 处置`。

| # | 批次 | 偏差 | 原因 | 处置 |
|---|---|---|---|---|
| D1 | 批 0（0.6） | 定时任务运行口径由 `runTasksInWorkerOnly: false` 改为 `true` | 原值下 server 也跑 `ScheduledTask`，验收 4「停 worker 不释放」**无法成立**（停 worker 仍会释放） | 已改 `true`（Task 4.3 Step 4）；派生副作用（order-timeout 补偿、秒杀转换也只在 worker 跑）写入 Task 4.9 手册；本地开发一律用 `npm run dev` |
| D2 | 批 3（0.4 延伸） | `stockDocList` 原只有 `type/page/pageSize`，`StockDocSummaryRow` 无 `stockLocationId`，与规格 §6「单据中心补筛选（类型/仓库/日期/操作人）」及「批 3 纯前端」冲突 | 规格假设的落点不存在 | 经确认**允许小改后端补齐三个参数**（`locationId/from/to/operator`）；仓库筛选走 `stock_doc_item` 子查询，**不改表结构、不新增迁移** |
| D3 | 批 3（0.4） | 报表无专用后端聚合查询 | 仅有 `stockMovementLedger` / `stockDocList` / `pickBatches` / `stocktake*` | 报表**纯前端聚合**，不新增 resolver（Task 4.7）；聚合口径不足时该 KPI 显示 `—` 并在本区追加说明（Task 4.7 Step 6） |
| D4 | 批 4（7.1） | TTL 释放**只作用 `PENDING_ALLOC`**，不释放 `ALLOCATED` | `ALLOCATED` 货已按仓拆好等发货，自动释放会归还占用量、导致后续发货因库存被他人占用而失败 | 经确认按此实现（Task 4.2）；规格 §7.1「预留单到期后由 worker 自动释放」的范围在此收窄并留档 |
| D5 | 批 4（7.1） | 释放留痕写的是 `OrderStockLedger` **事件行 + 释放量**，而释放本身**不改变实物 onHand** | 会计口径上 `OrderStockLedger` 记的是 onHand 变动，而 `PENDING_ALLOC` 无实物占用；系统内不存在「释放→写 onHand 流水」的既有链路 | 经确认写事件行：`bizType=manual` / `direction=out` / `quantity=释放占用量` / `reason` 显式标注「不改实物库存」（Task 4.2 `recordReleaseLedger`）。**读流水时勿把该行计入实物出入库合计** |
| D6 | 批 4（7.1） | 定时任务周期取 **1 分钟**（规格未规定） | 5 分钟周期会让验收 4 的等待时间过长；扫描成本极低（只扫 `PENDING_ALLOC` + `expiresAt` 非空并按渠道 group by） | 按 1 分钟实现（Task 4.3）；如生产发现压力可改回 5 分钟（仅一行 `schedule`） |
| D7 | 全批次 | 原计划中 `git add vshop/web-admin/...`、`git add vendure/packages/...` 形式的路径前缀**不成立** | `d:\zhao` 不是 git 仓库；`d:\zhao\vshop` 与 `d:\zhao\vendure` 是**两个独立仓库** | 已修正为「各自仓库为 cwd」：前端 `git add web-admin/...`、后端 `git add packages/...`；跨仓库改动拆成两条命令（见文首「仓库约定」与 Task 1.6 / 3.1） |
| D8 | 批 4（7.2） | 批次状态机新增 3 个状态（`HANDOVER` / `REVIEWED` / `EXCEPTION`），而非新增独立实体 | 核验 0.3 确认 `SHIPPED` / `CANCELLED` 原为终态、无后续位；交接/复核/异常件天然是批次的后继状态 | 扩状态机 + 5 个新列 + 2 个新 mutation，作为**独立提交**（Task 4.5）可单独回滚 |
| D9 | 批 4（7.1） | `reservations` 列表查询**不能带 `items` 子选择集** | **实测发现**：`Reservation.items` 在 SDL 中是非空列表，但 list resolver 返回实体、未装配 `items`，带子选择集会触发 non-null 违例 | Task 4.4 的 `fetchReservations` 明确只取头字段，详情走 `reservation(id)`；既有 `fetchReservationByOrder` 若被调用需一并核对（同因） |
| D10 | 批 4 | `packages/cjk-plugin/src/plugin.ts` 内含 admin / shop **两套 SDL** | 该文件历史结构（`ChannelDeliveryCapability` 处有明确注释） | Task 4.5 Step 5 明确只改 admin 段；新增 SDL 前先确认目标类型/字段属于哪一套 |
| D11 | 批 1（执行期发现） | Task 1.3 原实现每次筛选发 **2 次**请求（`applyFilter()` 后紧跟 `setSort()`，各自触发一次 `refresh()`），首屏发 **2 次**（`useListPage` 默认 `immediate: true` 与 `onLoad` 各一次） | 计划正文把「条件 + 排序」写成两次公开方法调用；`useListPage` 没有「一次性设置条件与排序」的合并方法 | 已改：`reload()` 直接写 `page.filter.value` + `page.sort.value` 后单次 `refresh()`；`useListPage` 传 `immediate: false`，首屏只由 `onLoad` 触发（commit `7aeda60`）。`useListPage` 契约未变（仍导出 `filter`/`sort` ref）。后续 Task 3.2 / 3.3 / 4.4 采纳同一写法 |
| D12 | 全批次（后端）**部署致命** | `packages/cjk-plugin` 的 `main = lib/index.js`，dev-server 以 ts-node 运行 `index.ts` 时经 node_modules junction **加载的是 `lib/` 编译产物**；且本仓库**历史上把 `lib/` 入库**（如 commit `2a3a64e9a` 同时提交 `src/` 与 `lib/`）。故后端改动**只提交 src 会导致服务器 `git pull` 后仍跑旧代码** | `d:\zhao\vendure` 的 push→pull 部署链路不会在服务器构建（内存不足，禁止服务器构建） | **规则修订：所有后端 Task 的 commit 必须在 src 之外一并提交 `packages/cjk-plugin/lib` 产物**（先 `npm run build`，再 `git add packages/cjk-plugin/src/... packages/cjk-plugin/lib`，仍禁 `git add -A`）。本规则覆盖 Task 1.6 / 3.1 / 4.1 / 4.2 / 4.3 / 4.5 的 commit 步骤。首次落地见 commit `2d4def348`（src）+ `7264d1080`（lib） |
| D13 | 批 4（Task 4.9） | Task 4.9 的 `pm2 start "npm run start:worker" ...` 不成立：`packages/dev-server/package.json` **没有任何 `start:*` 脚本**（只有 `dev:server` / `dev:worker` / `dev`） | 计划按「生产有 start 脚本」假设书写，未核验 | 执行 Task 4.9 时**必须先在服务器 `pm2 list` / `pm2 describe <name>` 读出既有 pm2 条目的真实 name 与 script/cwd/interpreter**，按现状照抄一份 worker 条目（若既有条目就是 `dev:worker` 形式，worker 条目也用同形式），**不得照抄计划里的命令**；真实口径回填本表 |
| D14 | 批 1（执行顺序调整） | **Task 1.6 的 Step 1+2（后端 `icon` 字段 + 幂等迁移）被提前**到 Task 1.5 之前执行 | Task 1.4 已让 `fetchCollectionsOptimized` 查询 `customFields { icon }`，后端字段缺失会让分类页**运行时报 `Cannot query field "icon"`**，Task 1.5 的联调无法进行 | 已完成并提交（后端仓 `2d4def348` src + `7264d1080` lib）。**Task 1.6 执行时只做 Step 3/4/5**（前端 API + 页面批量条 + 门禁），Step 1/2 跳过（已完成），Task 1.6 的 commit 命令相应去掉后端两条命令 |
| D15 | 批 1（Task 1.5 缺陷，验收期暴露） | 分类**根级** ↑↓ 换序**静默无效**（子级正常） | `swapSibling()` 用 `nodeIndex.get(parentId).children` 找兄弟，但根分类的 `parentId` 指向 Vendure **根集合**（该集合不在 `collections` 列表里，永远查不到）→ 兄弟数组为空 → `i<0` 静默 return | 已修（commit `e2c1b9f`）：兄弟改为**从扁平列表 `cats.value` 按 `parentId` 过滤 + position/name 排序**取，并把节点真实 `parentId` 传给 `moveCollection`；顺带删除因此变成死代码的 `indexNodes`/`nodeIndex`。**Task 1.5 的 `indexNodes` 写法作废，后续同类需求一律用扁平列表取同级** |
| D16 | 批 1（规格偏离修正） | 图标原落成「`uni.showModal({editable:true})` 手打字符串」，规格 §4.4 要求「写入 `customFields` + 复用 MediaPicker」，且页面上**不显示**图标（无法验收） | Task 1.6 只写了「批改图标」的文本弹窗 | 已按规格收口（commit `7dec6b5`）：改用 `MediaLibraryModal`（`:max="1"` / `media-type="image"`，即 MediaPicker 的底层共享组件）选图，取 `assets[0].id` 写入 `customFields.icon`；新增**行内图标区**（未设置显示「＋」，点击可单条设置），并用 `fetchAssets(n, 0, undefined, ids)` **一次批量预取** id→preview 建 `iconUrlById` 渲染。历史遗留的非 asset-id 文本值查不到即静默不显示 |
| D17 | 批 2（执行期发现） | Task 2.3/2.4 的 i18n 命名空间实际落成 `platformGlobalConfig`，而计划正文写作 `globalConfig` | 「全局配置」页沿用既有命名空间（`src/locale/zh-Hans.json` 早已存在 `platformGlobalConfig`），新建 `globalConfig` 会与之并存、语义重复 | 统一用 `platformGlobalConfig.*`（含 `err_color`/`err_number`/`err_min`/`err_max`/`err_select`/`err_boolean`/`errFixFirst` 等错误码 key，由 `validateField` 返回码拼 `err_` 前缀消费）。新增键 zh-Hans / en 成对补齐 |
| D18 | 批 2（Task 2.2 无代码变更 + overrides 形状纠正） | ① Task 2.2「店铺覆盖页接入合并预览」的目标**已由既有实现满足**（`src/pages/decorate/theme/index.vue` L73-82 预览卡 + L203-214 `genPreview`，`onMounted` 自动预览、保存前可见、传 `templateId` 走 L2→L3 扁平令牌覆盖）→ **无代码变更**；② 计划片段给出的 overrides 形状 `{theme, pages:{...}}` 与后端**扁平**合并口径不符 | `mergePreview` 实际口径：`L1 = {...themeTokens, ...defaults}`、`L2 = {...theme, ...pages}`、`L3 = overrides 全部键`（均**扁平**）。按计划写会产出 `theme.primaryColor` 等**不存在的键**并错标来源 | ① Task 2.2 标记为「已满足，跳过改码」，仅纳入 Task 2.5 验收（B1）；② 全局配置页 `genPreview` 的 overrides 按扁平根 `{themeTokens, defaults}` 传（commit `d2cc8d7`）。**页面级配置落点键以 `src/utils/merge-config.ts` 的 `PAGE_CF_FIELD` 为准**：`product→detailConfig` / `home→shopContent` / `category` / `cart` / `profile`；后续任何写 overrides 的地方禁用 `{theme, pages}` 形状 |
| D19 | 批 2（Task 2.3 路径与清单纠正） | ① 计划写的 `defaults.detail.*` 路径实际是 `defaults.product.*`（详情页默认配置的落点键是 `product`，非 `detail`）；② 计划只列 5 个功能块，会**丢掉** `params`（参数）与 `description`（详情） | 计划按「detail」命名与块清单书写，未与 `ProductDetailRenderer` / 详情装修页块清单核对 | 已更正为 `defaults.product.layout` + `defaults.product.blocks.<key>`，块清单**补全为 7 个**：`gallery/price/promo/service/params/reviews/description`（`src/constants/config-schema.ts`）。e2e 断言 `uni-switch == 7` 固化为回归门禁 |
| D20 | 批 2（Task 2.3 UI 形态） | 计划写版式用 `picker`，实际落成 **chips 胶囊单选**；且 `APP` 常量用 `app.value`（页面支持 nshop/vshop 切换），非计划写死的单端 | ① 现有后台「版式/枚举」类控件一律用 chips（与售后筛选、装修页一致），`picker` 会引入新交互范式；② 全局配置页顶部本就有 nshop/youshop 分段器，写死单端会导致切端后预览/保存串端 | 按 chips + `app.value` 实现（commit `4e40709`）；`APP_OPTS` 保留两端。e2e A1 断言 chips 含「经典/楼层/双通道」 |
| D21 | 批 2（提交粒度与 JSON 框语义） | ① Task 2.3 与 2.4 **合并为一个提交** `4e40709`（非计划的两条）；② 「JSON 高级编辑」框仍**只承载 `defaults`**，未按计划把 draft 的 `themeTokens` 也并入 | ① 2.3（schema + 页面改造）与 2.4（行内标红）改的是**同一文件同一批代码**，拆开会产生「不可编译的中间提交」；② 并入 themeTokens 会改变既有 load/save 语义（`load()` 分别回填 tokens 与 defs），属于本轮范围外的语义扩张 | 按现状收口并在本表留档；JSON 框语义保持「仅 `defaults`」，令牌三项一律走结构化表单（已成对校验，`save()` 里 `themeTokens` 显式归一 + `Number(radius) || 8` 兜底） |
| D22 | 批 3（Task 3.4 验收口径） | ① 验收渠道由默认渠道改为 **`shop-a`**；② 计划要求的「上滑加载更多（第二页）」UI 证据**无法产出**，改为 **API 分页契约对账 C1–C5**；③ 新增计划未要求的**负向对照** A4b | ① 本地开发库中**只有 `shop-a` 有库存单据/流水**（4 单据 / 20 流水），`__default_channel__` 及其它渠道均为 0，用默认渠道只会产出空态截图；② 该数据量恰等于单页 `take:20`，**无第二页可加载**；③ 只有正向断言（UI 条数 == API 条数）无法排除「入参被忽略、两边同时返回全量」的假通过 | ① `WA_B3_CHANNEL` 默认值设为 `shop-a`，并在脚本开头做「渠道数据自检」（流水或单据为 0 直接 ENV-FAIL 退出码 2），**杜绝空态当证据**；② 第 2 条验收改用**分页契约对账**（page1+page2 拼接 == 全量顺序、页间无交集、page3 为空、`totalItems` 跨页稳定、`summary` 不随分页变化），并在脚本中以 `skip()` **显式打印**（退出码仍为 0，非静默放过）；③ 补 A4b：填不存在的 SKU `99999999` → 页面必须收窄为 0 并出空态。设计规格 §6 第 3 条验收「翻页累计不重复、不丢项」由此**以契约方式证明**（生产/更大数据集上把渠道指到 >20 条流水即可自然走 UI 路径） |
| D23 | 批 3（执行期发现，Task 3.2 / 3.3 / 3.4） | ① i18n 命名空间**沿用既有** `inventoryMovements.*` / `stockDocCenter.*`，未按规格/计划新建 `movements.*` / `stockDoc.*`；② 两页仓库下拉**新增「全部仓」为第 0 项**（计划未要求）；③ 删除两页已无引用的 `loadFailed` 死键 | ① 两页原本就用 `inventoryMovements` / `stockDocCenter`，新建命名空间会让同一功能并存两套 key；② 批 3 前两页下拉**没有「不筛选」选项**（选过即无法回退），仓库筛选若要可用必须有该项；③ `loadFailed` 被「错误态 + 重试」取代后已无引用 | ① 复用既有命名空间成对补齐 `zh-Hans` / `en`（`filterVariant` / `filterDateFrom` / `filterDateTo` / `delta` / `filterLocation` / `filterOperator` / `filterClear` / `shown` / `retry`），与 D17 同口径；② 第 0 项固定「全部仓」，`@change` 中 **列表项索引 = 仓库数组索引 + 1**（映射写错会选中相邻仓库，已随 `1253d4d` 修正）；③ 删死键并在手册 19.5⑦⑧ 留档 |
| D24 | 批 3（Task 3.1 实现缺陷，验收期暴露并修复） | `stockDocList` 的 `from` / `to` **日期区间口径偏 8 小时**：本地当日 00:00–23:59 的窗口查不到当天单据（返回 0） | `stock_doc.createdAt` 是**无时区 `timestamp`**（`stock-doc.entity.ts:15` 的 `@Column() createdAt!: Date`）。`listDocs` 把前端传来的**带 `Z` 的 ISO 字符串**直接作为查询参数交给 Postgres，**文本→timestamp 转换会丢掉时区偏移**（`'2026-09-24T23:59:59.999Z'::timestamp` → `23:59:59.999`），与库中本地墙钟值（22:49）比较即错位；而把窗口放宽到 UTC 当日又恰好命中，**极具迷惑性**——Task 3.1 的原始探针窗口够宽，故未暴露。对照：`stockMovementLedger` 走 `parseIso()` 绑定 `Date`，口径正确（实测 14:00–15:00Z 命中 20、00:00–01:00Z 命中 0） | 已修（后端仓 commit `50c430c0e`，含 `lib` 产物，遵 D12）：`listDocs` 增加 `const from = parseIso(options?.from)` / `to` 同，where 改为绑定 `Date` 实例，并加注释说明原因。**规则沉淀：无时区 `timestamp` 列的日期区间一律绑定 `Date` 实例，禁止直接传 ISO 字符串**（e2e 中用 `to only (…15:59:59.999Z) → 4` 与 `to only (…00:00:00Z) → 0` 双向固化该口径） |
| D25 | 批 4（7.3 · Task 4.7） | Task 4.7 Step 3 原稿用共享组件 `TrendChart` 承载「盘点差异趋势」，并按 `points: {date, value}` 传参 | ① `TrendChart` 真实契约是 `{date, gmv, orderCount}`（**双线**：销售额/订单数），与本报表的「差异件数」语义无关，硬套会把差异值画成销售额曲线；② 该组件存在**既有**渲染缺陷（见批 4 执行结论「本批未做」），本轮不动共享组件 | 经确认改为**页面内轻量条状趋势**（`.trow/.tbar/.tfill` + `trendHint`，按 `trendMax` 归一，0 差异不画条），**不改 `TrendChart`**；CSV 导出与页面趋势图同源同值（`varianceTrend` 的 `{day, expected, diff}`） |
| D26 | 批 4（7.3 · Task 4.7） | 「发货件数」只能按**订单 `createdAt`** 归期，而非发货时间 | admin-api 无 fulfillment / 发货时间维度的聚合查询；`stockMovementLedger` 的 `in/out` 合计含盘库过账与手动出库，**不能**用于核对发货件数 | 按订单 `createdAt` 归期实现（`buildOrderFilter` 的 `createdAt.between` + 状态族 `Shipped/PartiallyShipped/Delivered/PartiallyDelivered`）。本地 `shop-a` 窗口内无 Shipped 族订单 → 该 KPI 的 **0 是真实 0（非降级、非伪造）**。对账（`shop-a`，7 天窗口 `[2026-09-20, 2026-09-27)`）：拣货单数 **0**、盘库次数 **4**（TK20260924-003/007/008/009 全 POSTED）、差异率 **3.95%**（Σ\|差异\| 3 ÷ Σ应盘 76）、作业员「1」**4 单据 4036 件**；独立路径交叉核对一致（`state=POSTED totalItems=4` 同为 4；7 天窗口订单仅 3 单 `AddingItems` 且均 `2026-08-29` 创建） |
| D27 | 批 4（7.3 · Task 4.7） | 作业员明细的「作业员」列显示 `stock_doc.operator` **原始值**（本地库为 `"1"`），不做 id→姓名映射 | 单据中心的 `operator` 是自由文本/ID，后端无人员映射接口，前端硬编码映射会写死脏数据 | 按原值展示，i18n 预留 `ops.unknownOperator` 兜底空值（D23 同口径：复用既有命名空间成对补键，不新建）；若后续需要姓名，应在后端补映射 |

**批 1 执行结论（Task 1.8 收口）**

- **批次门禁全部通过**：`build:h5` EXIT=0；售后列表类型筛选（12≠20，行内全为筛选类型）与上滑加载累计（20→25）e2e 通过；分类树缩进 14.56px + 折叠（5→3 行）+ 换序回读一致（根级/子级均验证）；死代码删除后构建无引用报错。
- **核验项 0.1 / 0.2 未被推翻**：`updateCollection` 接受 `position`、`moveCollection(collectionId,parentId,index)` 存在且可用（探针 PASS，另见 D15 的根级修正）。
- **证据**：`docs/verify/gap4-batch1-*.png` 共 10 张（390×844 / dpr=2 = 780×1688，逐张人工看图核对为真实页面，无白屏/登录页/报错页）；两页 console 0 error / 0 pageerror。手册第 17 章已补（`webadmin-bugfix-manual.html`），`npm run verify:manual` PASS。
- **测试数据副作用（仅本地库）**：验收期以 `WA_SHOT_ALLOW_WRITE=1` 造过 fixture（生产域名硬拦，未改 vendure 任何文件）；售后样本服务端无删除 mutation，遗留 23 条置 `Closed` 的记录与一次性分类，属本地库脏数据，不影响线上。
- `src/static/manual/index.html`（发布用使用手册）为数据驱动 `op-N` + `shots/` 结构，与修复手册不一致，**本轮只更新修复手册**；发布手册待批次 4 的 Task 4.9 一并处理。

**批 2 执行结论（Task 2.5 收口）**

- **交付物**：Task 2.1（`src/utils/config-path.ts` + 全局配置页合并预览，commit `d2cc8d7`）、Task 2.3+2.4（`src/constants/config-schema.ts` 11 字段 schema 驱动渲染 + `validateField` + 行内标红 + 保存前置拦截，commit `4e40709`）、Task 2.2（**无代码变更**，既有实现已满足，见 D18）、Task 2.5（验收脚本 + 手册第 18 章，commit `f8b7f86`）。
- **批次门禁全部通过**：`npm run build:h5` EXIT=0（Sass legacy-js-api 为既有 deprecation 警告，非错误）；`npm run verify:manual` PASS（失败 0，含「手册引用的截图全部存在」）；e2e `_e2e/_verify_gap4_batch2.py` **PASS（失败 0 / SKIP 0）**，退出码 0。
- **验收覆盖（A/B 两组）**：A1 结构化表单 11 字段（`.in=3` / `uni-switch=7` / 版式 chips 齐全）；A2 非法主色行内标红（`field0.err='颜色需为 #RRGGBB'`）+ 保存前置拦截（toast「有 1 处需要修正」）；A3 合法保存成功 → **落库回读一致**（`persisted='#123456'`）→ 还原并收尾 API 复核库值回 `#ff6600`；A4 「立即预览」输出 L0→L3 合并 JSON（`pre.len=195`，含 `themeTokens`/`defaults`）+ 来源徽标逐条标注（`['L1','L1','L1','L3',…]`）；B1 店铺覆盖页三行预览 + 来源徽标 + **进页自动预览**。
- **证据**：`docs/verify/gap4-batch2-*.png` 共 5 张（390×844 / dpr=2 = 780×1688，逐张人工看图核对为真实页面，无白屏/登录页/报错页；两张含「证据在首屏之外」的图已加 `scrollIntoView` 后重拍，令其自证）；两页 console 0 error / 0 pageerror。
- **新增可复用经验（供批 3/4 沿用）**：① H5 `uni-toast` 元素**常驻 DOM**，隐藏后 `inner_text` 仍返回上一条文案 → 连续 toast 断言必须显式排除上一条（脚本 `toast_text(not_equal=…)`；同文案连续 toast 则在 `reload` 后直接轮询）；② `<input class="in">` 在 H5 渲染为 `uni-input` 包裹真实 `input`，填充须用 `.in > input`；`<switch>` → `uni-switch`；③ 取证图若目标在首屏之外，须先 `scrollIntoView` 再截图。
- **测试数据副作用（仅本地库）**：A3 写 `updateShopGlobalConfig` 仅在 `WA_SHOT_ALLOW_WRITE=1` 下进行（生产域名 `e.joho.cn` 硬拦），改的是 `nshop` 端主色的**测试值**，脚本收尾已保存原值并用 API 复核落库回 `#ff6600`，**无残留脏数据**；未改 vendure 任何文件。
- **本批未做（属范围外，已在 D21 留档）**：「JSON 高级编辑」仍只承载 `defaults`；发布用 `src/static/manual/index.html` 未同步。

**批 3 执行结论（Task 3.4 收口）**

- **交付物**：Task 3.1（后端 `stockDocList` 补 `locationId/from/to/operator`，后端仓 commit `63e888147` 含 `lib` 产物；验收期缺陷修复 commit `50c430c0e`）、Task 3.2（库存流水页迁移 `useListPage` + 五组筛选 + 每行「结存变化 前 → 后」+ 服务端同条件汇总，commit `3b579fb`；仓库下拉「全部仓」修复 `1253d4d`）、Task 3.3（单据中心迁移 `useListPage` + 四项筛选 + 进度条 + 错误重试，commit `2a96272`）、Task 3.4（验收脚本 + 手册第 19 章，commit `1adee1f`）。
- **批次门禁全部通过**：`npm run build:h5` EXIT=0（仅有既有 Sass legacy-js-api deprecation 警告）；`npm run verify:manual` PASS（失败 0，含「手册引用的截图全部存在」）；e2e `_e2e/_verify_gap4_batch3.py` **PASS（失败 0 / SKIP 1）**，退出码 0。后端 `npm run build`（cjk-plugin）EXIT=0。
- **验收覆盖（A/B/C 三组）**：A1 流水默认态三口径对账（条数 20 == API、汇总 1035/1027 == API `summary`、首行 `结存变化 1012 → 1008` 逐字 == API `beforeOnHand/afterOnHand`）；A2 方向「出库」条数 11 == API、**汇总随条件重算**（入库合计归 0）、行内只出「－」不出「＋」；A3 仓库 + 日期区间（叠加方向）11 == API；A4 清空恢复全量 + SKU 筛选 + 结存变化取证；**A4b 负向对照**（不存在 SKU → 0 + 空态）；B1 单据中心默认态 + 进度「已显示 4 / 4」；B2 类型页签空态；B3 类型（盘库）+ 仓库 + 日期叠加 4 == API；B4 操作人筛选 + 到底态；**C1–C5 分页契约对账**（拼接不缺项 / 页间不重复 / page3 空 / `totalItems` 跨页稳定 / `summary` 不随分页变化）。
- **证据**：`docs/verify/gap4-batch3-*.png` 共 7 张（390×844 / dpr=2 = 780×1688，逐张人工看图核对为真实页面，无白屏/登录页/报错页；空态图已改用「有数据的类型盘库」重拍，令其自证）；两页 console 0 error / 0 pageerror。
- **缺陷修复/经验沉淀**：① **D24 的日期口径缺陷**是本批最有价值的产出——「无时区 `timestamp` 列 + 直接传 ISO 字符串」会静默偏 8 小时，规则已写入 D24，后续任何日期区间查询照此执行；② `EXISTS` 子查询里 camelCase 列**必须加双引号**，否则 Postgres 折叠为小写报「字段 i.docid 不存在」；③ uni-app H5 `picker` 的可驱动方式（selector 用 `.uni-picker-container.uni-selector-select` **class**、date 用 `.uni-picker-container.uni-date-select` 且月份无前导零、多容器并存必须 `:visible`）与 `<input class="kw">` 须用 `.kw input` 填充，均已封装进脚本并写入手册 19.5④⑤；④ 「清空筛选」按钮在流水页（`.clr`）与单据中心（`.chip`）**位置不同**，`click_clear()` 二者兼容。
- **测试数据副作用**：**零**。批 3 两页均为查询页，e2e 全流程只读、不写库不改配置；未触碰除 `stock-doc.service.ts` 外的任何后端文件（该文件改动仅为日期参数绑定，见 D24）。
- **本批未做（属范围外，已在 D22/D23 留档）**：「上滑加载更多」第二页 UI 证据（本地数据不足两页，改契约对账）；发布用 `src/static/manual/index.html` 未同步（留待 Task 4.9）。

---

## 7. 自检结果（writing-plans Self-Review）

**1. 规格覆盖扫描**

| 规格条目 | 落点任务 |
|---|---|
| §4 批 1 · 列表一致性（useListPage） | Task 1.1（契约+实现）、1.2/1.3（售后单页验证）、1.8（验收） |
| §4 批 1 · 分类层级/排序/移动/图标/批量 | Task 1.4（树+折叠）、1.5（moveCollection + 拖动/换序 + 改父）、1.6（图标 + 空分类批删） |
| §4 批 1 · 死代码清理 G7.4/G7.5 | Task 1.7 |
| §5 批 2 · 合并预览接入 | Task 2.1（`config-path.ts` + 全局配置页调 `mergedPreview`）、2.2 | 
| §5 批 2 · 结构化表单 | Task 2.3（`GLOBAL_CONFIG_FIELDS` **11 字段**：3 令牌 + 1 版式 select + **7** block，见 D19）、2.4 |
| §5 批 2 · 行内校验 | Task 2.3（`validateField`）、2.4（就地标红） |
| §6 批 3 · 库存流水筛选 + before→after | Task 3.2 |
| §6 批 3 · 单据中心筛选 + 分页（+ 后端扩 3 个参数） | Task 3.1（后端）、3.3（前端） |
| §6 批 3 · 两页迁移 useListPage | Task 3.2 / 3.3 |
| §7.1 · 定时底座 + 预留单超时释放（含留痕、倒计时、worker 运维） | Task 4.1（expiresAt）、4.2（TTL/释放/留痕）、4.3（ScheduledTask + customField + worker-only）、4.4（前端页）、4.9（运维手册） |
| §7.2 · 批次交接 / 复核 / 异常件（含状态机扩与后端 mutation） | Task 4.5（后端，含 0.3 结论落地）、4.6（前端） |
| §7.3 · 长期报表（视图分段 / KPI 4 卡 / 差异趋势 / 作业员明细 / CSV） | Task 4.7 |
| §7 验收 1–4 | Task 4.3 Step 6（验收 4）、4.8 Step 2（回归）、4.8（验收 1/3 的截图与对账） |
| §8 横切（i18n 双语 / 手机截图 / 手册 / 偏差区 / 每批可回滚 / 临时脚本即删） | 批次门禁 + 各 Task 的 i18n 步骤 + 1.8/2.5/3.4/4.8 的截图步骤 + Task 4.9 + §6 |
| §8「不碰」清单 | 计划中无任何任务改动打印模板 / `verify:print` / 五级合并算法 / C 端渲染器 / vendure 根 `package.json` |

**2. 占位词扫描**：全文无 `TBD` / `TODO` / 「待补」/「类似 Task N」；每个改码步骤均含可直接落地的代码块与可执行命令。

**3. 类型与命名一致性（跨任务核对）**

| 符号 | 定义处 | 消费处 | 一致 |
|---|---|---|---|
| `useListPage` 契约（`items/total/loading/loadingMore/finished/error/filter/shown/hasMore/loadFirst/loadMore/refresh/applyFilter/resetFilter/setSort/syncFromQuery/toQuery`） | Task 1.1 | Task 1.2 / 1.3 / 3.2 / 3.3 / 4.4（`page.items.value`、`page.applyFilter`、`page.refresh`、`page.shown`、`page.hasMore`） | ✅ |
| `buildCollectionTreeNodes` / `flattenCollectionTree` / `CollectionTreeNode` | Task 1.4 | Task 1.5（`indexNodes()` 递归建索引） | ✅ |
| `DEFAULT_RESERVATION_TTL_MINUTES`（30） | Task 4.2 | Task 4.2 `ttlMinutes()`、Task 4.3 任务描述、Task 4.9 手册 | ✅ |
| `RELEASE_EXPIRED_RESERVATIONS_TASK_ID = 'release-expired-reservations'` | Task 4.3 Step 1 | Task 4.3 Step 3（去重注册）、Task 4.9 手册 | ✅ |
| `expiresAt`（实体列 / SDL 字段 / 前端接口） | Task 4.1（列）、4.2（SDL） | Task 4.3（任务扫描）、4.4（倒计时） | ✅ |
| `PickBatchState` 联合类型（8 值） | Task 4.5 Step 1（后端） | Task 4.6 Step 1（前端同名单）、4.7 `SHIPPED_BATCH_STATES` | ✅ |
| `handoverPickBatch` / `registerPickBatchException` | Task 4.5 Step 4（resolver）、Step 5（SDL） | Task 4.6 Step 1（API 同签名：`batchId` + `handoverTo` / `reason`） | ✅ |
| `fetchReservations` / `releaseReservationAdmin` | Task 4.4 Step 1 | Task 4.4 Step 2（页面） | ✅ |
| `buildOpsWindow` / `countBatches` / `sumShippedItems` / `countStocktakeTasks` / `varianceRate` / `varianceTrend` / `ymd` | Task 4.7 Step 1 | Task 4.7 Step 3 / Step 4 | ✅ |
| `downloadCsv(filename, headers, rows)`（既有） | `src/utils/csv.ts` | Task 4.7 Step 4（签名一致） | ✅ |
| `buildOrderFilter({states, time})`（既有） | `src/utils/orderFilter.ts` | Task 4.7 Step 3（`states` + `time.key='custom'`） | ✅ |
| `stockDocList(type, locationId, from, to, operator, page, pageSize)` | Task 3.1（后端 + resolver） | Task 3.3（前端 API 透传）、Task 4.7（作业员明细） | ✅ |

**4. 已发现的计划内缺陷（已就地修复）**：见 D7（提交命令路径前缀）与 D9（`reservations` 子选择集）。

---

## 8. 执行方式选择（Execution Handoff）

计划完成，落地文件：`docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md`。两种执行方式：

1. **Subagent-Driven（推荐）** —— 每个 Task 派一个全新 subagent，Task 之间由主会话复核；批次门禁在批次末尾统一验。
2. **Inline Execution** —— 在本会话内按 `executing-plans` 批量执行，到批次边界设检查点。

**选哪种？**