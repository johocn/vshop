# 库存页面升级（Plan 2）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 web-admin 的「库存与预警」页（`https://e.joho.cn/guanli/#/pages/inventory/stock/index`）从「裸 ID 列表 + 全页统一阈值」升级为「服务端聚合的库存工作台」：6 张概览卡、仓库胶囊、服务端关键词搜索、服务端排序、状态分桶（带计数）、富明细卡（缩略图/商品名/SKU/规格 + 现存/占用/可用/安全库存/货值/最近变动）、批量生成采购单与批量设安全库存，并新增「预警规则」「单据中心」两个页面、升级流水页（方向/业务类型/仓库/日期筛选 + 入出汇总），后端补齐安全库存规则表与 4 个新查询。

**Architecture:** 后端在 `cjk-plugin`（`packages/cjk-plugin`）内新增 1 张表 `inventory_alert_rule`、2 个服务（`InventoryAlertRuleService` / `InventoryStockService`）与 2 个纯函数模块（`alert-rule-math.ts` / `stock-page-math.ts`），把「聚合 + 分桶 + 排序 + 分页」拆成「一次 SQL 取聚合 → TS 端纯函数分桶/排序/分页」；全部新能力只注册在 `adminApiExtensions`（shop 侧不动）。前端保持「页面 + 轻组件」：3 个新组件（`InventoryKpiBar` / `InventoryStockCard` / `InventoryFilterBar`）+ 2 个新页面 + 2 个页面重写 + 1 个纯函数模块，页面只负责状态机与请求编排（`seq` 竞态守卫 + `catch` 显式报错且不清空列表）。

**Tech Stack:** 后端 Vendure 3.6.4 + TypeORM 0.3 + NestJS + GraphQL（`@nestjs/graphql`），单测用 **vitest**（`packages/cjk-plugin/vitest.config.mts` 已 include `src/**/*.spec.ts`）；前端 Vue3 + TypeScript + uni-app（H5）+ `graphql-request`（`getAdminClient`），单测用 `npx tsx --test`（前端未装 vitest）；样式统一用 `$wa-*` 令牌；截图用 Playwright 手机视口 390×844 / dpr=2。

**规格来源（权威，不可偏离）:** `docs/superpowers/specs/2026-09-21-inventory-stock-upgrade-design.md`（下称「规格」）
**设计定稿 mockup:** `docs/superpowers/mockups/inventory-v2/index.html`（手机 390 为主 + 桌面 ≥768px 同页自适应）
**前置计划:** `docs/superpowers/plans/2026-09-21-order-list-filter-state-layout.md`（Plan 1，订单列表；本计划沿用其文档结构与前端约定）
**仓库 / 工作目录:** 后端 `d:\zhao\vendure`（插件 `packages/cjk-plugin`）；前端 `d:\zhao\vshop\web-admin`

**已核实的关键事实（写代码前已用 information_schema 实测，禁止臆测）：**
- `stock_level` 真实列：`id, createdAt, updatedAt, stockOnHand, stockAllocated, productVariantId, stockLocationId`（**没有** `stockLocated`/`productId`）。
- `product_variant` 真实列：`sku, enabled, deletedAt, featuredAssetId, productId, taxCategoryId, customFieldsCostprice, customFieldsBarcode, ...`（**没有** `name`；变体名在 `product_variant_translation.name`）。
- `product_variant_translation` / `product_translation` / `product_option_translation` 均有：`id, createdAt, updatedAt, baseId, languageCode, name`。
- `asset` 真实列含 `preview`（缩略图 URL），经 `ProductVariant.featuredAsset`（`featuredAssetId`）关系取得。
- `stock_location` 的 customFields 列：`customFieldsCode / customFieldsKind / customFieldsChannelcode / customFieldsDeliverymethods(text) / customFieldsServicecities(text) / customFieldsLat / customFieldsLng`。
- `order_stock_ledger`（`@vendure/inventory-plugin` 的 `OrderStockLedger`）真实列：`productVariantId, stockLocationId, bizType, bizCode, orderLineId, direction('in'|'out'), quantity, beforeOnHand, afterOnHand, otherLocationId, reason, createdAt, updatedAt` + ManyToMany `channels` 连接表。
- cjk-plugin 注册区（`packages/cjk-plugin/src/plugin.ts`）：`entities` 数组 **L153**；`providers` **L154-202**；`adminApiExtensions` **L203**（库存单据 SDL **L1143-1199**，租户仓 SDL **L1268-1312**，gql 模板结束反引号 **L1313**）；admin `resolvers` 数组 **L1315**；`shopApiExtensions` **L1317**，shop `resolvers` **L1588**。`configuration` 内 Channel customFields 合并点 **L1702-1719**（`inventoryModeChannelFields` 在 L1708）。
- `packages/cjk-plugin/index.ts`（包根）是 `tsconfig.build.json` 的 `files: ["./index.ts"]` 唯一入口，`export *` 到 `src/**`；**新实体/服务无需导出**（仅被 `plugin.ts` 内部引用），但若需被 dev-server 脚本使用则加一行 `export *`。
- `packages/cjk-plugin/package.json` 的 `main = lib/index.js`；**后端改动必须先 `npm run build` 生成 `lib/` 并一并提交**（`lib/` 是 git 跟踪产物）。
- 本地开发管理员账号：`superadmin@china.test` / `superadmin`（`packages/dev-server/china-data/01-base.ts` L53）；本地起服要 `npm run dev:server` + `npm run dev:worker` 两个进程。

---

## 一、跨任务契约表（跨任务命名必须与此表一致）

### 1.1 GraphQL 契约（**仅 admin-api**；shop 侧不注册）

| 名称 | 签名 | 归属 SDL 位置 | 权限 |
| --- | --- | --- | --- |
| `input InventoryStockQueryInput` | `{ locationId: ID, keyword: String, bucket: String, sort: String, page: Int, pageSize: Int }` | adminApiExtensions 新增段 | — |
| `type InventoryStockSummary` | `{ skuCount: Int!, onHandTotal: Int!, allocatedTotal: Int!, availableTotal: Int!, valueTotal: Int!, outCount: Int!, lowCount: Int!, okCount: Int!, outbound7d: Int! }` | 同上 | — |
| `type InventoryStockRow` | `{ variantId: ID!, productId: ID, variantName: String!, sku: String!, optionText: String, thumbnail: String, stockLocationId: ID, locationName: String, onHand: Int!, allocated: Int!, available: Int!, safetyStock: Int!, value: Int!, costPrice: Int, bucket: String!, lastMovementAt: String, lastDirection: String, lastBizType: String }` | 同上 | — |
| `type InventoryStockPage` | `{ totalItems: Int!, summary: InventoryStockSummary!, items: [InventoryStockRow!]! }` | 同上 | — |
| `Query.inventoryStockPage` | `inventoryStockPage(input: InventoryStockQueryInput): InventoryStockPage!` | 同上 | `InventoryPermissions.ViewStock` |
| `type InventoryAlertRule` | `{ variantId: ID!, locationId: ID, safetyStock: Int!, enabled: Boolean! }` | 同上 | — |
| `input InventoryAlertRuleInput` | `{ variantId: ID!, safetyStock: Int!, enabled: Boolean, locationId: ID }` | 同上 | — |
| `Query.inventoryAlertRules` | `inventoryAlertRules(locationId: ID): [InventoryAlertRule!]!` | 同上 | `InventoryPermissions.ViewStock` |
| `Mutation.saveInventoryAlertRules` | `saveInventoryAlertRules(locationId: ID, items: [InventoryAlertRuleInput!]!): [InventoryAlertRule!]!` | 同上 | `Permission.UpdateStockLocation` |
| `type StockDocSummaryRow` | `{ id: ID!, code: String!, type: String!, remark: String, operator: String, createdAt: String!, itemCount: Int!, totalQty: Int! }` | 同上 | — |
| `type StockDocList` | `{ totalItems: Int!, items: [StockDocSummaryRow!]! }` | 同上 | — |
| `Query.stockDocList` | `stockDocList(type: String, page: Int, pageSize: Int): StockDocList!` | 同上 | `InventoryPermissions.ViewStock` |
| `type StockDocLedgerSummary`（**新增**） | `{ inQty: Int!, outQty: Int! }` | 单据 SDL 段（L1188 附近） | — |
| `type StockDocLedgerList`（**修改**：加 `summary`） | `{ items: [StockDocLedgerEntry!]!, totalItems: Int!, summary: StockDocLedgerSummary! }` | L1188-1191 | — |
| `Query.stockMovementLedger`（**扩展入参**） | `stockMovementLedger(productVariantId: ID, locationId: ID, bizCode: String, orderLineId: ID, bizType: String, direction: String, from: String, to: String, page: Int, pageSize: Int): StockDocLedgerList!` | L1198 | `InventoryPermissions.ViewStock` |

**服务端口径（定稿，写代码与自检都以此为准）**
- `locationId` 空 → 该租户**全部仓**（优先 `kind==='physical'` 的仓列表；无物理仓时退回全部仓）按 `variantId` 分组 `SUM`；`locationId` 给定 → 仅该仓且**必须属于当前租户**，否则抛 `UserInputError('仓库不属于当前租户')`。
- `keyword` 空 → 不加关键词条件；非空 → `LOWER(sku) LIKE :kw OR LOWER(变体名) LIKE :kw OR variantId ∈ (选项名命中的变体)`，`kw = '%' + keyword.toLowerCase() + '%'`（用 `LIKE` + `LOWER()` 而非 `ILIKE`，兼容 SQLite/Postgres，且全部走参数占位防注入）。
- `bucket` 取值 `'' | 'out' | 'low' | 'ok'`（非法值回退 `''`）；`sort` 取值 `'stockAsc' | 'stockDesc' | 'gapDesc' | 'valueDesc'`（非法值回退 `'stockAsc'`）；`page ≥ 1`；`pageSize` 夹在 `1..100`，默认 `20`。
- `bucketOf(onHand, safetyStock)`：`onHand <= 0 → 'out'`；`onHand < safetyStock → 'low'`；否则 `'ok'`。
- `summary` 为**应用 `location` + `keyword` 后、但不应用 `bucket`** 的全量口径（与 Plan 1「统计卡=全量口径」一致）；`skuCount = 行数`；`outCount/lowCount/okCount` 之和 = `skuCount`。`outbound7d` = 同口径下近 7 天 `direction='out'` 的 `SUM(quantity)`。
- `totalItems` = 应用 `location + keyword + bucket` 后、排序前的**行数**（分桶在服务端做，不在 SQL 做）。
- `value` = 最近一次 `PURCHASE/TRANSFER` 且 `costPrice` 非空的 `stock_doc_item.costPrice`（分）× `onHand`；无成本价 → `value = 0` 且 `costPrice = null`（页面显示「—」）。
- 安全库存四级回退：`SKU×仓规则(enabled) → SKU 全仓规则(locationId=0, enabled) → 渠道 inventoryDefaultSafetyStock → 常量 10`；聚合视图（`locationId` 空）按 `locationId=0` 口径解析。
- `saveInventoryAlertRules` 为幂等 upsert；`safetyStock < 0` → `UserInputError`；`safetyStock = 0` → 该 SKU 不再预警（合法）；`locationId` 缺省 → `0`（全仓通用）；非本租户仓/非法 variantId → 拒绝。
- `stockMovementLedger` 新入参全部可选且向后兼容；`direction` 非 `'in'|'out'` 视为不传；`from/to` 为 ISO 时间字符串。

### 1.2 后端文件 / 服务 / 纯函数（同名同参，跨任务不得改名）

| 文件 | 新增 / 修改 | 关键导出（签名） |
| --- | --- | --- |
| `packages/cjk-plugin/src/inventory/inventory-alert-rule.entity.ts` | 新增 | `class InventoryAlertRuleEntity`（`@Entity('inventory_alert_rule')`，字段 `id/tenantChannelId/variantId/locationId/safetyStock/enabled/updatedAt`） |
| `packages/cjk-plugin/src/inventory/alert-rule-math.ts` | 新增 | `DEFAULT_SAFETY_STOCK = 10`；`interface AlertRuleLike`；`resolveSafetyStock(input: { variantId: string\|number; locationId?: string\|number\|null; rules: AlertRuleLike[]; channelDefault?: number\|null }): number` |
| `packages/cjk-plugin/src/inventory/alert-rule-math.spec.ts` | 新增 | vitest 用例 |
| `packages/cjk-plugin/src/inventory/stock-page-math.ts` | 新增 | `type StockBucket`、`type StockSort`、`interface StockRowCore`、`bucketOf(onHand, safetyStock)`、`normalizeStockQuery(input)`、`sortStockRows(rows, sort)`、`summarizeStock(rows, outbound7d)` |
| `packages/cjk-plugin/src/inventory/stock-page-math.spec.ts` | 新增 | vitest 用例 |
| `packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts` | 新增 | `interface InventoryAlertRuleInput { variantId: ID; safetyStock: number; enabled?: boolean \| null; locationId?: ID \| null }`；`class InventoryAlertRuleService`：`rulesForVariants(ctx, variantIds): Promise<AlertRuleLike[]>`、`channelDefault(ctx): number \| null`、`list(ctx, locationId?): Promise<InventoryAlertRuleEntity[]>`、`save(ctx, locationId, items): Promise<InventoryAlertRuleEntity[]>` |
| `packages/cjk-plugin/src/inventory/inventory-stock.service.ts` | 新增 | `class InventoryStockService`：`page(ctx, input): Promise<{ totalItems: number; summary: ...; items: StockRowCore[] }>` |
| `packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts` | 修改（追加 `inventoryStockPage` / `inventoryAlertRules` / `saveInventoryAlertRules`） | 构造注入 `InventoryStockService`、`InventoryAlertRuleService` |
| `packages/cjk-plugin/src/inventory/stock-doc.admin.resolver.ts` | 修改（追加 `stockDocList`、扩展 `stockMovementLedger` 入参） | 构造仍只注入 `StockDocService` |
| `packages/cjk-plugin/src/inventory/stock-doc.service.ts` | 修改（`ledger()` 自建查询：新增 `bizType/direction/from/to` 与 `summary`；新增 `listDocs()`） | `ledger(ctx, options): Promise<{ items: any[]; totalItems: number; summary: { inQty: number; outQty: number } }>`、`listDocs(ctx, options): Promise<{ totalItems: number; items: any[] }>` |
| `packages/cjk-plugin/src/inventory/inventory-mode.custom-fields.ts` | 修改（追加 `inventoryDefaultSafetyStock`） | `inventoryModeChannelFields: CustomFieldConfig[]` |
| `packages/cjk-plugin/src/migrations/migrate-stock-tables.ts` | 修改（`StockTableMigration` 追加 `inventory_alert_rule` 幂等建表 + 唯一索引） | `StockTableMigration` |
| `packages/cjk-plugin/src/plugin.ts` | 修改（`entities` 追加实体、`providers` 追加 2 个服务、admin SDL 追加类型与查询、admin `resolvers` 保持 2 个 resolver 不变） | — |
| `packages/dev-server/e2e-inventory-stock-page.mjs` | 新增（本地只读探针） | Node 脚本，`node e2e-inventory-stock-page.mjs` |

> **注意**：`inventory-plugin` 的 `StockLedgerService.list()` **不改**（避免动另一个包的源码与 `lib/`）。`StockDocService.ledger()` 改为自建 QueryBuilder 查询（渠道用 `innerJoin('l.channels','ch','ch.id = :cid', { cid: ctx.channelId })` 做 scoping，与 `pickup-location.service.ts:41` 既有写法一致），并**移除** `StockLedgerService` 注入（该依赖在 cjk-plugin 内只剩这一处使用）。

### 1.3 前端 API 与类型（`src/apis/`）

| 导出 | 位置 | 签名 |
| --- | --- | --- |
| `interface InventoryStockQueryInput` | `apis/inventory.ts` | `{ locationId?: string \| null; keyword?: string; bucket?: string; sort?: string; page?: number; pageSize?: number }` |
| `interface InventoryStockRow` | 同上 | 与 GraphQL `InventoryStockRow` 一一对应（`bucket: string`） |
| `interface InventoryStockSummary` | 同上 | 与 GraphQL 同名类型一一对应 |
| `interface InventoryStockPage` | 同上 | `{ totalItems: number; summary: InventoryStockSummary; items: InventoryStockRow[] }` |
| `fetchInventoryStockPage(input)` | 同上 | `Promise<InventoryStockPage>` |
| `interface InventoryAlertRule` | 同上 | `{ variantId: string; locationId: string \| null; safetyStock: number; enabled: boolean }` |
| `fetchInventoryAlertRules(locationId?)` | 同上 | `Promise<InventoryAlertRule[]>` |
| `saveInventoryAlertRules(locationId, items)` | 同上 | `Promise<InventoryAlertRule[]>` |
| `ChannelCustomFields.inventoryDefaultSafetyStock?: number` | `apis/channel.ts` | 追加到接口 + `fetchActiveChannel` 选择集 |
| `interface StockDocSummaryRow` / `StockDocList` | `apis/stock-doc.ts` | 与 GraphQL 同名类型一致 |
| `fetchStockDocList(params)` | 同上 | `Promise<StockDocList>` |
| `MovementQueryParams`（扩展） | 同上 | 追加 `bizType?: string; direction?: 'in' \| 'out'; from?: string; to?: string` |
| `fetchMovements(params)`（扩展出参） | 同上 | `Promise<{ totalItems: number; items: MovementRow[]; summary: { inQty: number; outQty: number } }>` |

### 1.4 组件 props / emits（`src/components/inventory/`）

| 组件 | props | emits |
| --- | --- | --- |
| `InventoryKpiBar.vue` | `{ summary: InventoryStockSummary }` | `(e: 'pick', bucket: string): void` |
| `InventoryStockCard.vue` | `{ row: InventoryStockRow; selected: boolean }` | `(e: 'toggle'): void; (e: 'open-movements'): void; (e: 'replenish'): void; (e: 'adjust'): void` |
| `InventoryFilterBar.vue` | `{ locations: Array<{ id: string; name: string }>; locationId: string; keyword: string; sort: string; bucket: string; buckets: { all: number; out: number; low: number; ok: number } }` | `(e: 'location', id: string): void; (e: 'search', kw: string): void; (e: 'sort', key: string): void; (e: 'bucket-change', key: string): void` |

> 组件内部通过 `useLocaleStore().t(...)` 取文案，**不自建 i18n**；`InventoryFilterBar` 的搜索框内部维护 `localKw` 并 400ms 防抖后 `emit('search', localKw)`，回车立即 `emit`。

### 1.5 i18n 键（`src/locale/zh-Hans.json` 与 `src/locale/en.json` 键序必须平行）

**`inventoryStock`（重写为分组；`empty` 由字符串改为对象 `{ noData, noMatch }`，`loadFailed` 保留兼容；旧键 `warehouse` 等已不再被新页面引用，但**保留不删**以免影响回滚）**

```
allLocations, searchPlaceholder, sortLabel, detailTitle, loadFailed, searchFailed, loadingMore, noMore, sheetCancel
kpi.sku, kpi.skuSub, kpi.onHand, kpi.onHandSub, kpi.value, kpi.valueSub,
kpi.out, kpi.outSub, kpi.low, kpi.lowSub, kpi.outbound7d, kpi.outboundSub
sort.stockAsc, sort.stockDesc, sort.gapDesc, sort.valueDesc
bucket.all, bucket.out, bucket.low, bucket.ok
quick.purchase, quick.transfer, quick.stocktake, quick.issue,
quick.movements, quick.locations, quick.rules, quick.docs
card.noThumb, card.lastMove, card.neverMove, card.value, card.movements, card.replenish, card.adjust
num.onHand, num.allocated, num.available, num.safety
move.in, move.out, move.order, move.afterSales, move.purchase, move.stockMove,
move.stocktake, move.stockOut, move.manual, move.mirror, move.stockIn
bulk.selected, bulk.setSafety, bulk.genPurchase, bulk.noSelect, bulk.genDone, bulk.genFailed
adjust.title, adjust.target, adjust.placeholder, adjust.invalid, adjust.confirm, adjust.done, adjust.failed
safety.title, safety.placeholder, safety.invalid, safety.zeroHint, safety.confirm, safety.done, safety.failed
empty.noData, empty.noMatch, alertRulesBtn, docCenterBtn
```

**`inventoryAlertRules`（新增）**

```
title, defaultLabel, defaultHint, listTitle, searchPlaceholder, safetyPlaceholder,
enableLabel, save, saving, saved, saveFailed, loadFailed, defaultSaved, defaultFailed,
defaultInvalid, safetyInvalid, empty, noMatch, loadingMore, noMore
```

**`stockDocCenter`（新增）**

```
title, tabAll, tabPurchase, tabTransfer, tabStocktake, tabIssue,
itemCount, totalQty, remarkLabel, operatorLabel, empty, loadFailed, loadingMore, noMore
```

**`inventoryMovements`（扩展，保留旧键 `empty`/`loadFailed`）**

```
inTotal, outTotal, dirAll, dirIn, dirOut, bizAll, locAll, dateAll,
dateToday, date7d, dateMonth, clearFilter, loadingMore, noMore
```

**`stockDocPurchase`（追加 1 个键，供主页「补货」预填提示）**

```
prefilled
```

### 1.6 路由（`src/pages.json`）

| path | style |
| --- | --- |
| `pages/inventory/stock/index`（修改） | `{ "navigationBarTitleText": "库存与预警", "enablePullDownRefresh": true }` |
| `pages/inventory/alert-rules/index`（新增） | `{ "navigationBarTitleText": "预警规则" }` |
| `pages/inventory/stock-doc/index`（新增） | `{ "navigationBarTitleText": "单据中心", "enablePullDownRefresh": true }` |
| `pages/inventory/movements/index`（修改） | `{ "navigationBarTitleText": "库存流水", "enablePullDownRefresh": true }` |

页面跳转参数约定（跨任务一致）：
- 库存主页 → 流水页：`/pages/inventory/movements/index?productVariantId={variantId}`
- 库存主页 → 采购入库页：`/pages/inventory/stock-doc/purchase/index?variantId={variantId}&qty={建议量}&locationId={当前仓}`
- 快捷宫格：`purchase|transfer|stocktake|issue` → `/pages/inventory/stock-doc/{purchase|transfer|stocktake|issue}/index`；`movements` → `/pages/inventory/movements/index`；`locations` → `/pages/inventory/locations/index`；`rules` → `/pages/inventory/alert-rules/index`；`docs` → `/pages/inventory/stock-doc/index`

### 1.7 探针与截图（命名约定）

- 本地只读探针：`packages/dev-server/e2e-inventory-stock-page.mjs`（Task 4）
- 线上只读探针：`_e2e/_probe_inventory.py`（Task 10）
- 手机截图：`src/static/manual/shots/inv2_01_default.png` … `inv2_08_desktop.png`（Task 10），同步到 `docs/webadmin-bugfix-manual/assets/`
- 操作手册：`docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（追加新章节）

---

## 二、文件结构（新增 / 修改清单）

**后端 `d:\zhao\vendure`（新增 5，修改 5）**

```
packages/cjk-plugin/src/inventory/inventory-alert-rule.entity.ts          [新增]
packages/cjk-plugin/src/inventory/alert-rule-math.ts                      [新增]
packages/cjk-plugin/src/inventory/alert-rule-math.spec.ts                 [新增]
packages/cjk-plugin/src/inventory/stock-page-math.ts                      [新增]
packages/cjk-plugin/src/inventory/stock-page-math.spec.ts                 [新增]
packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts         [新增]
packages/cjk-plugin/src/inventory/inventory-stock.service.ts              [新增]
packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts            [修改]
packages/cjk-plugin/src/inventory/stock-doc.admin.resolver.ts            [修改]
packages/cjk-plugin/src/inventory/stock-doc.service.ts                   [修改]
packages/cjk-plugin/src/inventory/inventory-mode.custom-fields.ts        [修改]
packages/cjk-plugin/src/migrations/migrate-stock-tables.ts               [修改]
packages/cjk-plugin/src/plugin.ts                                        [修改]
packages/dev-server/e2e-inventory-stock-page.mjs                         [新增]
```

**前端 `d:\zhao\vshop\web-admin`（新增 8，修改 8）**

```
src/utils/inventoryFormat.ts                                  [新增]
src/utils/inventoryFormat.test.ts                             [新增]
src/components/inventory/InventoryKpiBar.vue                  [新增]
src/components/inventory/InventoryStockCard.vue               [新增]
src/components/inventory/InventoryFilterBar.vue               [新增]
src/pages/inventory/alert-rules/index.vue                     [新增]
src/pages/inventory/stock-doc/index.vue                       [新增]
src/apis/inventory.ts                                        [修改]
src/apis/stock-doc.ts                                        [修改]
src/apis/channel.ts                                          [修改]
src/pages/inventory/stock/index.vue                          [重写]
src/pages/inventory/movements/index.vue                      [升级]
src/pages/inventory/stock-doc/purchase/index.vue             [修改：onLoad 预填]
src/pages.json                                               [修改]
src/locale/zh-Hans.json / src/locale/en.json                 [修改]
```

---

> ### 执行结果（Task 1~10 已全部完成并上线，2026-09-21/22）
>
> 本计划 **已全部执行完毕并部署上线**。下方 Task 1~10 的复选框为事后补勾（勾选状态以本区块为准）。
>
> | Task | 内容 | 提交 |
> |---|---|---|
> | 1 | 后端预警规则实体 + 幂等迁移 + 渠道默认安全库存 | `8d9ed3ce4`（vendure 仓） |
> | 2 | 后端 `stock-page-math` 纯函数 + `InventoryStockService` 聚合/分桶/排序 | `8d9ed3ce4`（vendure 仓） |
> | 3 | 后端服务覆盖（预警规则 list/save、单据、流水自建查询） | `8d9ed3ce4`（vendure 仓） |
> | 4 | 后端编译产物 `lib/` 入库 + 本地探针 | `8d9ed3ce4`（vendure 仓） |
> | 5 | 前端纯函数 `inventoryFormat.ts` + 单测 | `2ace457`（vshop 仓） |
> | 6 | 前端 API 层扩展（inventory / stock-doc / channel） | `2ace457`（vshop 仓） |
> | 7 | 前端三组件（KpiBar / StockCard / FilterBar） | `2ace457`（vshop 仓） |
> | 8 | 库存主页整页重写 + 采购预填 + 下拉刷新 | `2ace457`（vshop 仓） |
> | 9 | 新增「预警规则」页 / 「单据中心」页 + 双语文案 | `2ace457`（vshop 仓） |
> | 10 | 流水页升级 + 回归 / 部署 / 截图 / 操作手册 | `2ace457` `d9614af` `5423eb7`（vshop 仓） |
>
> **上线后补充修复（后端）**：`c43649590`（库存读写查询放开租户侧权限）、`537016512`（明细页按当前渠道过滤变体，剔除本店不可售 SKU）、`6e8bc1fa4`（raw 查询别名改用两参 select，修复 PostgreSQL 下货值 / 最近变动 / 单据条数恒为 0）。
>
> **实际代码路径与计划文案的差异（重要）**：计划里写的后端路径（`src/entities/…`、`src/utils/…`）是设计期设想，落地时按插件既有目录归位 —— 后端源码实际在 **`packages/cjk-plugin/src/inventory/`**（`inventory-alert-rule.entity.ts` / `alert-rule-math.ts` / `stock-page-math.ts` / `inventory-stock.service.ts` / `inventory-alert-rule.service.ts` / `*.spec.ts`），编译产物在 `packages/cjk-plugin/lib/src/inventory/`（**`lib/` 是 git 跟踪的产物，改动需 build 后连同 src 一起提交**）。
>
> **交付证据**：线上只读探针 **18 项 0 失败** + 失败场景探针 **8 项 0 失败**；**12 张**手机截图（390×844 dpr=2）；操作手册**第 13 章**（`#inventory-stock-v2`）；后端 `lib/` 编译产物已入库；前端经 `node scripts/deploy.mjs` 部署上线。

## Task 1: 后端预警规则实体 + 幂等迁移 + 渠道默认安全库存 + `resolveSafetyStock` 单测

**Files:**
- Create: `packages/cjk-plugin/src/inventory/inventory-alert-rule.entity.ts`
- Create: `packages/cjk-plugin/src/inventory/alert-rule-math.ts`
- Create: `packages/cjk-plugin/src/inventory/alert-rule-math.spec.ts`
- Modify: `packages/cjk-plugin/src/migrations/migrate-stock-tables.ts`
- Modify: `packages/cjk-plugin/src/inventory/inventory-mode.custom-fields.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts:153`（`entities` 数组）

- [x] **Step 1: 写 `inventory-alert-rule.entity.ts`（安全库存规则表）**

创建 `packages/cjk-plugin/src/inventory/inventory-alert-rule.entity.ts`：

```ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 库存预警规则（安全库存）。
 *
 * 唯一键 `(tenantChannelId, variantId, locationId)`；`locationId = 0` 为**哨兵值**，
 * 语义 =「该 SKU 在本租户全部仓通用」，不用 nullable 以规避不同数据库对 NULL 唯一索引的差异。
 * `safetyStock = 0` 合法，语义 = 该 SKU 不再进入低库存预警。
 */
@Entity('inventory_alert_rule')
@Index('uq_inventory_alert_rule_scope', ['tenantChannelId', 'variantId', 'locationId'], { unique: true })
export class InventoryAlertRuleEntity {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    /** 归属租户渠道编码（沿用 stock_doc 的 scoping 口径：ctx.channel.code） */
    @Column()
    tenantChannelId!: string;

    @Column({ type: 'int' })
    variantId!: number;

    /** 0 = 全部仓通用；>0 = 指定仓覆盖 */
    @Column({ type: 'int', default: 0 })
    locationId!: number;

    @Column({ type: 'int', default: 10 })
    safetyStock!: number;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    @Column({ nullable: true })
    updatedAt!: Date;
}
```

- [x] **Step 2: 写失败测试 `alert-rule-math.spec.ts`**

创建 `packages/cjk-plugin/src/inventory/alert-rule-math.spec.ts`（cjk-plugin 用 vitest，`vitest.config.mts` 已 include `src/**/*.spec.ts`；该包**没有**装 tsx，故规格 §5 里的 `npx tsx --test` 在本包不适用）：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SAFETY_STOCK, resolveSafetyStock } from './alert-rule-math';

describe('resolveSafetyStock（四级回退）', () => {
    const rules = [
        { variantId: 7, locationId: 3, safetyStock: 33, enabled: true },  // SKU×仓
        { variantId: 7, locationId: 0, safetyStock: 22, enabled: true },  // SKU 全仓
        { variantId: 8, locationId: 0, safetyStock: 11, enabled: true },
        { variantId: 9, locationId: 0, safetyStock: 44, enabled: false }, // 停用 → 跳过
    ];

    it('① 命中 SKU×仓规则（优先级最高）', () => {
        expect(resolveSafetyStock({ variantId: 7, locationId: 3, rules, channelDefault: 5 })).toBe(33);
    });

    it('② 无仓级规则 → 回退 SKU 全仓规则', () => {
        expect(resolveSafetyStock({ variantId: 7, locationId: 9, rules, channelDefault: 5 })).toBe(22);
    });

    it('聚合视图（locationId 空）跳过仓级、直接取全仓规则', () => {
        expect(resolveSafetyStock({ variantId: 7, locationId: null, rules, channelDefault: 5 })).toBe(22);
    });

    it('③ 无任何 SKU 规则 → 回退渠道默认值', () => {
        expect(resolveSafetyStock({ variantId: 42, locationId: 3, rules, channelDefault: 17 })).toBe(17);
    });

    it('渠道默认值为 0 时视为有效（不落到常量 10）', () => {
        expect(resolveSafetyStock({ variantId: 42, locationId: 3, rules, channelDefault: 0 })).toBe(0);
    });

    it('④ 渠道默认值缺失/非法 → 常量 10', () => {
        expect(resolveSafetyStock({ variantId: 42, locationId: 3, rules, channelDefault: null })).toBe(DEFAULT_SAFETY_STOCK);
        expect(resolveSafetyStock({ variantId: 42, locationId: 3, rules, channelDefault: undefined })).toBe(DEFAULT_SAFETY_STOCK);
        expect(resolveSafetyStock({ variantId: 42, locationId: 3, rules, channelDefault: Number.NaN })).toBe(DEFAULT_SAFETY_STOCK);
    });

    it('停用的 SKU 规则被忽略，继续向下回退', () => {
        expect(resolveSafetyStock({ variantId: 9, locationId: 0, rules, channelDefault: 6 })).toBe(6);
    });

    it('规则里的 safetyStock 为 0 时原样返回（关闭预警）', () => {
        const z = [{ variantId: 7, locationId: 0, safetyStock: 0, enabled: true }];
        expect(resolveSafetyStock({ variantId: 7, locationId: 0, rules: z, channelDefault: 5 })).toBe(0);
    });

    it('负数/非数安全库存被规整为 0，不产生负阈值', () => {
        const bad = [{ variantId: 7, locationId: 0, safetyStock: -3, enabled: true }];
        expect(resolveSafetyStock({ variantId: 7, locationId: 0, rules: bad, channelDefault: null })).toBe(0);
    });

    it('variantId 数字/字符串混用仍能命中（避免前后端 ID 类型不一致导致漏匹配）', () => {
        expect(resolveSafetyStock({ variantId: '7', locationId: '0', rules, channelDefault: 5 })).toBe(22);
    });
});
```

- [x] **Step 3: 跑测试确认失败**

Run: `npm test --prefix packages/cjk-plugin`
Expected: FAIL —— 报错 `Failed to resolve import "./alert-rule-math"`（文件尚不存在）。

- [x] **Step 4: 最小实现 `alert-rule-math.ts`**

创建 `packages/cjk-plugin/src/inventory/alert-rule-math.ts`：

```ts
/** 渠道无默认值时的兜底安全库存（与设计规格一致，不要再改这个常量） */
export const DEFAULT_SAFETY_STOCK = 10;

/** 预警规则的最小结构（实体 / GraphQL 输入 / 前端镜像都可满足） */
export interface AlertRuleLike {
    variantId: string | number;
    locationId: string | number;
    safetyStock: number;
    enabled: boolean;
}

const asId = (v: string | number | null | undefined): string => String(v ?? '');

/** 规整为「非负整数」；非法值退回常量 10 */
function norm(value: number): number {
    const v = Math.trunc(Number(value));
    return Number.isFinite(v) ? Math.max(0, v) : DEFAULT_SAFETY_STOCK;
}

/**
 * 安全库存四级回退（纯函数，可单测）：
 *   SKU×仓规则(enabled) → SKU 全仓规则(locationId=0, enabled) → 渠道 inventoryDefaultSafetyStock → 常量 10
 *
 * `locationId` 为空/`0` 表示「聚合视图 / 全仓通用」口径：跳过仓级规则，直接看全仓规则。
 */
export function resolveSafetyStock(input: {
    variantId: string | number;
    locationId?: string | number | null;
    rules: AlertRuleLike[];
    channelDefault?: number | null;
}): number {
    const vid = asId(input.variantId);
    const lid = asId(input.locationId) || '0';
    const enabled = (input.rules ?? []).filter(r => r && r.enabled !== false);

    if (lid !== '0') {
        const exact = enabled.find(r => asId(r.variantId) === vid && asId(r.locationId) === lid);
        if (exact) {
            return norm(exact.safetyStock);
        }
    }
    const all = enabled.find(r => asId(r.variantId) === vid && asId(r.locationId) === '0');
    if (all) {
        return norm(all.safetyStock);
    }
    if (input.channelDefault !== null && input.channelDefault !== undefined) {
        const def = Number(input.channelDefault);
        if (Number.isFinite(def)) {
            return norm(def);
        }
    }
    return DEFAULT_SAFETY_STOCK;
}
```

- [x] **Step 5: 跑测试确认通过**

Run: `npm test --prefix packages/cjk-plugin`
Expected: PASS —— `alert-rule-math.spec.ts` 全部用例通过（9 个 `it`），末尾输出 `Test Files 1 passed`。

- [x] **Step 6: 迁移追加 `inventory_alert_rule` 幂等建表**

修改 `packages/cjk-plugin/src/migrations/migrate-stock-tables.ts`，把文件头注释第一段里的「4 张库存表」改成「5 张库存表（含 inventory_alert_rule）」，并在 `StockTableMigration.onApplicationBootstrap()` 里 `for (const stmt of statements)` 之前追加：

```ts
            // inventory_alert_rule（安全库存规则；唯一键 (tenantChannelId, variantId, locationId)）
            // locationId=0 为哨兵 = 该 SKU 全仓通用；不用 nullable 以规避 NULL 唯一索引差异
            statements.push(
                `CREATE TABLE IF NOT EXISTS ${'inventory_alert_rule'} (` +
                    `${Q('id')} ${pk}, ` +
                    `${Q('tenantChannelId')} varchar(255) NOT NULL, ` +
                    `${Q('variantId')} integer NOT NULL, ` +
                    `${Q('locationId')} integer NOT NULL DEFAULT 0, ` +
                    `${Q('safetyStock')} integer NOT NULL DEFAULT 10, ` +
                    `${Q('enabled')} boolean NOT NULL DEFAULT ${pg ? 'true' : '1'}, ` +
                    `${Q('updatedAt')} ${datetime} NULL)`,
            );
            statements.push(
                `CREATE UNIQUE INDEX IF NOT EXISTS ${'uq_inventory_alert_rule_scope'} ON ${'inventory_alert_rule'} ` +
                    `(${Q('tenantChannelId')}, ${Q('variantId')}, ${Q('locationId')})`,
            );
```

（`pk` / `pg` / `datetime` / `Q` 都是该方法内已有局部变量，直接复用。）

- [x] **Step 7: 渠道默认安全库存自定义字段**

修改 `packages/cjk-plugin/src/inventory/inventory-mode.custom-fields.ts`：把第 1 行的 import 改为同时带入 `LanguageCode`，并在数组末尾追加字段。

第 1 行改为：

```ts
import { LanguageCode, type CustomFieldConfig } from '@vendure/core';
```

在 `{ name: 'odooApiKey', type: 'string', nullable: true },` 之后追加：

```ts
    {
        name: 'inventoryDefaultSafetyStock',
        type: 'int',
        defaultValue: 10,
        nullable: true,
        label: [{ languageCode: LanguageCode.zh_Hans, value: '默认安全库存' }],
    },
```

- [x] **Step 8: plugin.ts 注册实体**

修改 `packages/cjk-plugin/src/plugin.ts`。

(a) 在 import 区（紧邻 L146 `import { InventoryModeService } ...` 之后）追加：

```ts
import { InventoryAlertRuleEntity } from './inventory/inventory-alert-rule.entity';
```

(b) 把 L153 的 `entities: [...]` 一行里的 `StockDocEntity, StockDocItemEntity,` 之后插入 `InventoryAlertRuleEntity,`，即：

```ts
    entities: [PickupLocation, EmployeeCustomer, ShippingTemplate, ShippingProfile, PaymentProfile, ShippingProfileMethod, PaymentProfileMethod, PaymentTemplate, RoomTemplate, RoomTemplateControl, TenantMember, Wallet, MerchantSettlementLedger, VariantLocationBinding, DeliveryRecord, ReconciliationBatch, ReconciliationOrderLine, StockDocEntity, StockDocItemEntity, InventoryAlertRuleEntity, StockReservationEntity, StockReservationItemEntity],
```

- [x] **Step 9: 类型检查 + 提交**

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。若报 `Cannot find module 'vitest'`，说明 `vitest` 未安装到该包，先跑 `npm i -D vitest -w @vendure/cjk-plugin`（`vitest.config.mts` 与 `node_modules/.bin/vitest` 显示其已存在，一般不会报）。

```bash
git add packages/cjk-plugin/src/inventory/inventory-alert-rule.entity.ts packages/cjk-plugin/src/inventory/alert-rule-math.ts packages/cjk-plugin/src/inventory/alert-rule-math.spec.ts packages/cjk-plugin/src/migrations/migrate-stock-tables.ts packages/cjk-plugin/src/inventory/inventory-mode.custom-fields.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): 库存预警规则表+四级安全库存回退纯函数+渠道默认安全库存字段"
```

---

## Task 2: 后端 `inventoryStockPage` 聚合查询（纯函数 + 服务 + SDL + resolver + 注册）

**Files:**
- Create: `packages/cjk-plugin/src/inventory/stock-page-math.ts`
- Create: `packages/cjk-plugin/src/inventory/stock-page-math.spec.ts`
- Create: `packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts`
- Create: `packages/cjk-plugin/src/inventory/inventory-stock.service.ts`
- Modify: `packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts`（admin SDL 追加段 + `providers` 追加 2 个服务）

> **先做列名复核（禁止臆测）**：本任务依赖 `stock_level` / `product_variant` / `asset` 的真实列名。若你手上没有最新实测结论，先跑下面的探针，用输出对齐 SQL 里的列名（本地 postgres：127.0.0.1:5432 / user `postgres` / pwd `admin` / db `vendure`，见 `packages/dev-server/.env`）。

- [x] **Step 0: 列名复核探针（Postgres `information_schema`）**

在前端仓库外任意位置（`d:\zhao\vendure` 下）创建临时脚本 `_tmp_probe_inv_cols.mjs`：

```js
// 列名复核：stock_level / product_variant / product_variant_translation / asset / stock_doc_item
// 运行：node _tmp_probe_inv_cols.mjs   （必须在 d:/zhao/vendure 下，pg 依赖从该目录解析）
import pg from 'pg';
const c = new pg.Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: 'admin', database: 'vendure' });
await c.connect();
const q = async (t) => {
  const r = await c.query(
    `select column_name from information_schema.columns where table_name = $1 order by ordinal_position`, [t]);
  console.log(`--- ${t} ---`);
  console.log(r.rows.map(x => x.column_name).join(', ') || '(表不存在)');
};
for (const t of ['stock_level', 'product_variant', 'product_variant_translation', 'product_translation', 'asset', 'stock_doc_item', 'stock_location']) {
  await q(t);
}
await c.end();
```

Run: `node _tmp_probe_inv_cols.mjs`（工作目录 `d:\zhao\vendure`）
Expected（2026-09-21 已实测，你的输出应与此一致）：
```
--- stock_level ---
id, createdAt, updatedAt, stockOnHand, stockAllocated, productVariantId, stockLocationId
--- product_variant ---
... sku, enabled, deletedAt, featuredAssetId, taxCategoryId, productId, customFieldsCostprice, customFieldsBarcode, ...
--- product_variant_translation ---
id, createdAt, updatedAt, baseId, languageCode, name
--- asset ---
preview, id, type, mimeType, source, width, height, fileSize, focalPoint, ...
```
**判定**：若 `stock_level` 无 `stockOnHand`/`stockAllocated`/`productVariantId`/`stockLocationId`、或 `asset` 无 `preview`，**停下**，把本任务 SQL 的列名按实测结果替换（实体类 `StockLevel` / `ProductVariant` 的属性名不变，仅 `getRawMany()` 里 `.addSelect()` 的**属性路径**改）。
**若核心实体不可从 `@vendure/core` 导入**（`import { StockLevel } from '@vendure/core'` 报错），等价改写：删掉实体 import，改用 `rawConnection.query()` 直连 SQL（表名与列名固定）：

```ts
    const rows = await this.conn.rawConnection.query(
        `SELECT sl."productVariantId" AS "variantId",
                SUM(sl."stockOnHand") AS "onHand",
                SUM(sl."stockAllocated") AS "allocated",
                MAX(v."sku") AS "sku",
                MAX(v."productId") AS "productId"
           FROM stock_level sl
           JOIN product_variant v ON v.id = sl."productVariantId"
          WHERE sl."stockLocationId" = ANY($1::int[]) AND v."deletedAt" IS NULL
          GROUP BY sl."productVariantId"`,
        [locationIds.map(Number)],
    );
```

跑完删除临时脚本：`Remove-Item _tmp_probe_inv_cols.mjs`（PowerShell）。

- [x] **Step 1: 写失败测试 `stock-page-math.spec.ts`**

创建 `packages/cjk-plugin/src/inventory/stock-page-math.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    bucketOf,
    normalizeStockQuery,
    sortStockRows,
    summarizeStock,
    type StockRowCore,
} from './stock-page-math';

function row(p: Partial<StockRowCore> & { variantId: string }): StockRowCore {
    return {
        productId: null, variantName: 'n', sku: 's', optionText: '', thumbnail: '',
        stockLocationId: null, locationName: null,
        onHand: 0, allocated: 0, available: 0, safetyStock: 10, value: 0, costPrice: null,
        bucket: 'ok', lastMovementAt: null, lastDirection: null, lastBizType: null,
        ...p,
    };
}

describe('bucketOf', () => {
    it('现存 <= 0 → out（即使安全库存为 0）', () => {
        expect(bucketOf(0, 10)).toBe('out');
        expect(bucketOf(-2, 0)).toBe('out');
    });
    it('现存 < 安全库存 → low', () => {
        expect(bucketOf(6, 10)).toBe('low');
    });
    it('现存 >= 安全库存 → ok（安全库存为 0 时非零点恒 ok）', () => {
        expect(bucketOf(10, 10)).toBe('ok');
        expect(bucketOf(1, 0)).toBe('ok');
    });
});

describe('normalizeStockQuery', () => {
    it('空入参 → 默认值', () => {
        const q = normalizeStockQuery(null);
        expect(q).toEqual({ locationId: null, keyword: '', bucket: '', sort: 'stockAsc', page: 1, pageSize: DEFAULT_PAGE_SIZE });
    });
    it('非法 sort/bucket 回退默认（不抛异常）', () => {
        const q = normalizeStockQuery({ sort: 'bogus', bucket: 'weird' });
        expect(q.sort).toBe('stockAsc');
        expect(q.bucket).toBe('');
    });
    it('page 下限 1、pageSize 夹在 1..MAX', () => {
        expect(normalizeStockQuery({ page: 0 }).page).toBe(1);
        expect(normalizeStockQuery({ page: -5 }).page).toBe(1);
        expect(normalizeStockQuery({ pageSize: 0 }).pageSize).toBe(1);
        expect(normalizeStockQuery({ pageSize: 9999 }).pageSize).toBe(MAX_PAGE_SIZE);
    });
    it('keyword 去首尾空格；locationId 空串视为 null', () => {
        expect(normalizeStockQuery({ keyword: '  奶粉  ' }).keyword).toBe('奶粉');
        expect(normalizeStockQuery({ locationId: '' }).locationId).toBe(null);
        expect(normalizeStockQuery({ locationId: '3' }).locationId).toBe('3');
    });
});

describe('sortStockRows', () => {
    const rows = [
        row({ variantId: '3', onHand: 10, safetyStock: 20, value: 500 }),
        row({ variantId: '1', onHand: 0, safetyStock: 10, value: 0 }),
        row({ variantId: '2', onHand: 6, safetyStock: 30, value: 900 }),
    ];
    it('stockAsc：现存升序，同值按 variantId 稳定升序', () => {
        expect(sortStockRows(rows, 'stockAsc').map(r => r.variantId)).toEqual(['1', '2', '3']);
    });
    it('stockDesc：现存降序', () => {
        expect(sortStockRows(rows, 'stockDesc').map(r => r.variantId)).toEqual(['3', '2', '1']);
    });
    it('gapDesc：缺口（安全库存-现存）降序', () => {
        expect(sortStockRows(rows, 'gapDesc').map(r => r.variantId)).toEqual(['2', '3', '1']);
    });
    it('valueDesc：货值降序', () => {
        expect(sortStockRows(rows, 'valueDesc').map(r => r.variantId)).toEqual(['2', '3', '1']);
    });
    it('不修改入参数组（返回新数组）', () => {
        const before = rows.map(r => r.variantId);
        sortStockRows(rows, 'valueDesc');
        expect(rows.map(r => r.variantId)).toEqual(before);
    });
});

describe('summarizeStock', () => {
    it('汇总口径与分桶计数，bucket 之和 = 行数', () => {
        const rows = [
            row({ variantId: '1', onHand: 0, allocated: 0, available: 0, value: 0, bucket: 'out' }),
            row({ variantId: '2', onHand: 6, allocated: 2, available: 4, value: 1140, bucket: 'low' }),
            row({ variantId: '3', onHand: 86, allocated: 12, available: 74, value: 12900, bucket: 'ok' }),
        ];
        const s = summarizeStock(rows, 1208);
        expect(s).toEqual({
            skuCount: 3, onHandTotal: 92, allocatedTotal: 14, availableTotal: 78,
            valueTotal: 14040, outCount: 1, lowCount: 1, okCount: 1, outbound7d: 1208,
        });
        expect(s.outCount + s.lowCount + s.okCount).toBe(s.skuCount);
    });
    it('outbound7d 非法值规整为 0，空行集全为 0', () => {
        expect(summarizeStock([], Number.NaN).outbound7d).toBe(0);
        expect(summarizeStock([], -9)).toEqual({
            skuCount: 0, onHandTotal: 0, allocatedTotal: 0, availableTotal: 0,
            valueTotal: 0, outCount: 0, lowCount: 0, okCount: 0, outbound7d: 0,
        });
    });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npm test --prefix packages/cjk-plugin`
Expected: FAIL —— `Failed to resolve import "./stock-page-math"`。

- [x] **Step 3: 最小实现 `stock-page-math.ts`**

创建 `packages/cjk-plugin/src/inventory/stock-page-math.ts`：

```ts
/**
 * 库存明细页的纯函数层（无 IO、可单测）：分桶 / 查询归一 / 排序 / 汇总。
 * 分桶与排序一律在**服务端**完成（前端不重复实现 bucketOf，见规格 §3.3）。
 */

export type StockBucket = 'out' | 'low' | 'ok';
export type StockSort = 'stockAsc' | 'stockDesc' | 'gapDesc' | 'valueDesc';

export const STOCK_BUCKETS: StockBucket[] = ['out', 'low', 'ok'];
export const STOCK_SORTS: StockSort[] = ['stockAsc', 'stockDesc', 'gapDesc', 'valueDesc'];
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 单行库存明细（与 GraphQL InventoryStockRow 一一对应，字段名不得改） */
export interface StockRowCore {
    variantId: string;
    productId: string | null;
    variantName: string;
    sku: string;
    optionText: string;
    thumbnail: string;
    stockLocationId: string | null;
    locationName: string | null;
    onHand: number;
    allocated: number;
    available: number;
    safetyStock: number;
    value: number;
    costPrice: number | null;
    bucket: StockBucket;
    lastMovementAt: string | null;
    lastDirection: string | null;
    lastBizType: string | null;
}

export interface NormalizedStockQuery {
    locationId: string | null;
    keyword: string;
    bucket: StockBucket | '';
    sort: StockSort;
    page: number;
    pageSize: number;
}

export interface StockSummary {
    skuCount: number;
    onHandTotal: number;
    allocatedTotal: number;
    availableTotal: number;
    valueTotal: number;
    outCount: number;
    lowCount: number;
    okCount: number;
    outbound7d: number;
}

/** 分桶：现存 <= 0 → 缺货；现存 < 安全库存 → 低库存；否则正常 */
export function bucketOf(onHand: number, safetyStock: number): StockBucket {
    if (onHand <= 0) {
        return 'out';
    }
    if (onHand < safetyStock) {
        return 'low';
    }
    return 'ok';
}

/** 入参归一：非法 sort/bucket 回退默认，不抛异常；page/pageSize 夹取安全区间 */
export function normalizeStockQuery(input?: any): NormalizedStockQuery {
    const src = input ?? {};
    const keyword = String(src.keyword ?? '').trim();
    const bucket: StockBucket | '' = STOCK_BUCKETS.includes(src.bucket) ? (src.bucket as StockBucket) : '';
    const sort: StockSort = STOCK_SORTS.includes(src.sort) ? (src.sort as StockSort) : 'stockAsc';
    const rawPage = Math.trunc(Number(src.page ?? 1));
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
    const rawSize = Math.trunc(Number(src.pageSize ?? DEFAULT_PAGE_SIZE));
    const pageSize = Number.isFinite(rawSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize)) : DEFAULT_PAGE_SIZE;
    const locationId = src.locationId === null || src.locationId === undefined || String(src.locationId) === ''
        ? null
        : String(src.locationId);
    return { locationId, keyword, bucket, sort, page, pageSize };
}

/** 排序（返回新数组，不改入参）：同值按 variantId 升序保证稳定 */
export function sortStockRows<T extends StockRowCore>(rows: T[], sort: StockSort): T[] {
    const num = (v: string | null | undefined): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    const arr = [...rows];
    arr.sort((a, b) => {
        switch (sort) {
            case 'stockDesc':
                return b.onHand - a.onHand || num(a.variantId) - num(b.variantId);
            case 'gapDesc':
                return (b.safetyStock - b.onHand) - (a.safetyStock - a.onHand) || num(a.variantId) - num(b.variantId);
            case 'valueDesc':
                return b.value - a.value || num(a.variantId) - num(b.variantId);
            case 'stockAsc':
            default:
                return a.onHand - b.onHand || num(a.variantId) - num(b.variantId);
        }
    });
    return arr;
}

/** 汇总：对「已应用 location+keyword、未应用 bucket」的行集计算；outCount+lowCount+okCount = skuCount */
export function summarizeStock(rows: StockRowCore[], outbound7d: number): StockSummary {
    let onHandTotal = 0;
    let allocatedTotal = 0;
    let availableTotal = 0;
    let valueTotal = 0;
    let outCount = 0;
    let lowCount = 0;
    let okCount = 0;
    for (const r of rows) {
        onHandTotal += r.onHand;
        allocatedTotal += r.allocated;
        availableTotal += r.available;
        valueTotal += r.value;
        if (r.bucket === 'out') {
            outCount++;
        } else if (r.bucket === 'low') {
            lowCount++;
        } else {
            okCount++;
        }
    }
    const out7 = Math.trunc(Number(outbound7d));
    return {
        skuCount: rows.length,
        onHandTotal,
        allocatedTotal,
        availableTotal,
        valueTotal,
        outCount,
        lowCount,
        okCount,
        outbound7d: Number.isFinite(out7) && out7 > 0 ? out7 : 0,
    };
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npm test --prefix packages/cjk-plugin`
Expected: PASS —— `Test Files 2 passed`（`alert-rule-math.spec.ts` + `stock-page-math.spec.ts`）。

- [x] **Step 5: 写 `InventoryAlertRuleService`（本任务只落**读**部分）**

创建 `packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { AlertRuleLike } from './alert-rule-math';
import { InventoryAlertRuleEntity } from './inventory-alert-rule.entity';

/**
 * 库存预警规则（安全库存）读写。
 * 读：渠道默认值 + 指定变体集在本租户的规则；写：Task 3 追加（list/save）。
 */
@Injectable()
export class InventoryAlertRuleService {
    constructor(private conn: TransactionalConnection) {}

    /** 渠道级默认安全库存（未配置/非法 → null，由 resolveSafetyStock 落到常量 10） */
    channelDefault(ctx: RequestContext): number | null {
        const raw = (ctx.channel?.customFields as any)?.inventoryDefaultSafetyStock;
        if (raw === null || raw === undefined || raw === '') {
            return null;
        }
        const n = Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
    }

    /** 取指定变体在本租户的全部规则（含 locationId=0 的全仓通用规则） */
    async rulesForVariants(ctx: RequestContext, variantIds: string[]): Promise<AlertRuleLike[]> {
        const ids = (variantIds ?? []).map(v => Number(v)).filter(n => Number.isFinite(n));
        if (!ids.length) {
            return [];
        }
        const rows = await this.conn.getRepository(ctx, InventoryAlertRuleEntity).find({
            where: { tenantChannelId: ctx.channel.code, variantId: In(ids) },
        });
        return rows.map(r => ({
            variantId: String(r.variantId),
            locationId: String(r.locationId),
            safetyStock: r.safetyStock,
            enabled: r.enabled,
        }));
    }
}
```

- [x] **Step 6: 写 `InventoryStockService`（聚合 + 分桶 + 排序 + 分页 + 汇总）**

创建 `packages/cjk-plugin/src/inventory/inventory-stock.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import {
    ID,
    ProductVariant,
    ProductVariantTranslation,
    RequestContext,
    StockLevel,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { OrderStockLedger } from '@vendure/inventory-plugin';
import { In } from 'typeorm';
import { resolveSafetyStock } from './alert-rule-math';
import { InventoryAlertRuleService } from './inventory-alert-rule.service';
import { StockDocEntity } from './stock-doc.entity';
import { StockDocItemEntity } from './stock-doc-item.entity';
import {
    bucketOf,
    normalizeStockQuery,
    sortStockRows,
    summarizeStock,
    type StockRowCore,
    type StockSummary,
} from './stock-page-math';
import { VirtualPhysicalStockService } from './virtual-physical-stock.service';

export interface InventoryStockPageInput {
    locationId?: ID | null;
    keyword?: string;
    bucket?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
}

const MS_7D = 7 * 24 * 3600 * 1000;

/** 库存明细聚合页（一次请求拿齐 KPI / 分桶计数 / 明细行） */
@Injectable()
export class InventoryStockService {
    constructor(
        private conn: TransactionalConnection,
        private virtualPhysicalStockService: VirtualPhysicalStockService,
        private alertRuleService: InventoryAlertRuleService,
    ) {}

    /**
     * 仓库范围解析：locationId 空 → 本租户仓列表（优先物理仓；无物理仓退回全部仓）；
     * 给定 → 单仓且必须归属本租户，否则拒绝。
     */
    private async resolveLocations(
        ctx: RequestContext,
        locationId?: string | null,
    ): Promise<{ ids: string[]; names: Record<string, string> }> {
        const overview = await this.virtualPhysicalStockService.getTenantInventoryOverview(ctx);
        const names: Record<string, string> = {};
        for (const l of overview.locations) {
            names[String(l.id)] = l.name ?? '';
        }
        const physical = overview.locations.filter(l => l.kind === 'physical').map(l => String(l.id));
        const pool = physical.length ? physical : overview.locations.map(l => String(l.id));
        if (!locationId) {
            return { ids: pool, names };
        }
        if (!pool.includes(String(locationId))) {
            throw new UserInputError('仓库不属于当前租户');
        }
        return { ids: [String(locationId)], names };
    }

    /** 关键词预筛：变体名（任意语言）命中的变体 id 集合 */
    private async nameMatchedVariantIds(ctx: RequestContext, kw: string): Promise<string[]> {
        const rows = await this.conn
            .getRepository(ctx, ProductVariantTranslation)
            .createQueryBuilder('vt')
            .where('LOWER(vt.name) LIKE :kw', { kw })
            .select('vt.baseId', 'baseId')
            .getRawMany();
        return rows.map(r => String(r.baseId));
    }

    /** 关键词预筛：规格（选项名，任意语言）命中的变体 id 集合（避免硬编码 ManyToMany 连接表名） */
    private async optionMatchedVariantIds(ctx: RequestContext, kw: string): Promise<string[]> {
        const rows = await this.conn
            .getRepository(ctx, ProductVariant)
            .createQueryBuilder('v')
            .innerJoin('v.options', 'o')
            .innerJoin('o.translations', 'ot', 'LOWER(ot.name) LIKE :kw', { kw })
            .select('v.id', 'id')
            .getRawMany();
        return rows.map(r => String(r.id));
    }

    /** 按变体聚合现存/占用 + sku/productId（一条 SQL，分组在库内完成） */
    private async loadAggregates(ctx: RequestContext, locationIds: string[], kw: string): Promise<any[]> {
        const qb = this.conn
            .getRepository(ctx, StockLevel)
            .createQueryBuilder('sl')
            .innerJoin(ProductVariant, 'v', 'v.id = sl.productVariantId')
            .select('sl.productVariantId', 'variantId')
            .addSelect('SUM(sl.stockOnHand)', 'onHand')
            .addSelect('SUM(sl.stockAllocated)', 'allocated')
            .addSelect('MAX(v.sku)', 'sku')
            .addSelect('MAX(v.productId)', 'productId')
            .where('sl.stockLocationId IN (:...locationIds)', { locationIds: locationIds.map(Number) })
            .andWhere('v.deletedAt IS NULL')
            .groupBy('sl.productVariantId');

        if (kw) {
            const nameIds = await this.nameMatchedVariantIds(ctx, kw);
            const optIds = await this.optionMatchedVariantIds(ctx, kw);
            const matched = [...new Set([...nameIds, ...optIds])].map(Number).filter(n => Number.isFinite(n));
            const params: any = { kw };
            let cond = 'LOWER(v.sku) LIKE :kw';
            if (matched.length) {
                cond += ' OR v.id IN (:...matchedIds)';
                params.matchedIds = matched;
            }
            qb.andWhere(`(${cond})`, params);
        }
        return qb.getRawMany();
    }

    /** 最近一次采购/移库成本价（分）：按 id 降序后在 TS 端取每变体第一条（避免窗口函数方言差异） */
    private async loadLatestCost(ctx: RequestContext, variantIds: string[]): Promise<Record<string, number>> {
        const map: Record<string, number> = {};
        const ids = variantIds.map(Number).filter(n => Number.isFinite(n));
        if (!ids.length) {
            return map;
        }
        const rows = await this.conn
            .getRepository(ctx, StockDocItemEntity)
            .createQueryBuilder('i')
            .innerJoin(StockDocEntity, 'd', 'd.id = i.docId AND d.tenantChannelId = :ch', { ch: ctx.channel.code })
            .where('i.costPrice IS NOT NULL')
            .andWhere('i.variantId IN (:...ids)', { ids })
            .andWhere('d.type IN (:...types)', { types: ['PURCHASE', 'TRANSFER'] })
            .orderBy('i.id', 'DESC')
            .select(['i.variantId AS variantId', 'i.costPrice AS costPrice'])
            .getRawMany();
        for (const r of rows) {
            const vid = String(r.variantId);
            if (map[vid] === undefined) {
                map[vid] = Number(r.costPrice);
            }
        }
        return map;
    }

    /** 最近一次流水（变体级）+ 近 7 天出库合计（渠道 scoping 与 pickup 一致） */
    private async loadLedgerInfo(
        ctx: RequestContext,
        variantIds: string[],
        locationIds: string[],
        withOutbound: boolean,
    ): Promise<{ map: Record<string, { at: string; direction: string; bizType: string }>; outbound7d: number }> {
        const map: Record<string, { at: string; direction: string; bizType: string }> = {};
        let outbound7d = 0;
        const ids = variantIds.map(Number).filter(n => Number.isFinite(n));
        if (!ids.length || !locationIds.length) {
            return { map, outbound7d };
        }
        const base = () =>
            this.conn
                .getRepository(ctx, OrderStockLedger)
                .createQueryBuilder('l')
                .innerJoin('l.channels', 'ch', 'ch.id = :cid', { cid: ctx.channelId })
                .where('l.productVariantId IN (:...ids)', { ids })
                .andWhere('l.stockLocationId IN (:...locs)', { locs: locationIds.map(Number) });

        const rows = await base()
            .orderBy('l.createdAt', 'DESC')
            .addOrderBy('l.id', 'DESC')
            .select([
                'l.productVariantId AS variantId',
                'l.createdAt AS createdAt',
                'l.direction AS direction',
                'l.bizType AS bizType',
            ])
            .getRawMany();
        for (const r of rows) {
            const vid = String(r.variantId);
            if (!map[vid]) {
                map[vid] = {
                    at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ''),
                    direction: String(r.direction ?? ''),
                    bizType: String(r.bizType ?? ''),
                };
            }
        }
        if (withOutbound) {
            const since = new Date(Date.now() - MS_7D);
            const sum = await base()
                .andWhere('l.direction = :dir', { dir: 'out' })
                .andWhere('l.createdAt >= :since', { since })
                .select('COALESCE(SUM(l.quantity), 0)', 'total')
                .getRawOne();
            outbound7d = Number(sum?.total ?? 0);
        }
        return { map, outbound7d };
    }

    /** 页内富化：缩略图（asset.preview）+ 选项文本 + 变体名（按当前语言，缺则首个翻译，再缺则 sku） */
    private async loadEnrich(
        ctx: RequestContext,
        variantIds: string[],
    ): Promise<Record<string, { name: string; optionText: string; thumbnail: string }>> {
        const res: Record<string, { name: string; optionText: string; thumbnail: string }> = {};
        const ids = variantIds.map(Number).filter(n => Number.isFinite(n));
        if (!ids.length) {
            return res;
        }
        const lang = String(ctx.languageCode ?? '');
        const variants = await this.conn.getRepository(ctx, ProductVariant).find({
            where: { id: In(ids) },
            relations: ['translations', 'options', 'options.translations', 'featuredAsset'],
        });
        for (const v of variants) {
            const trs = ((v as any).translations ?? []) as any[];
            const nameHit = trs.find(t => String(t.languageCode) === lang) ?? trs[0];
            const optionText = ((v as any).options ?? [])
                .map((o: any) => {
                    const ots = (o?.translations ?? []) as any[];
                    const hit = ots.find(t => String(t.languageCode) === lang) ?? ots[0];
                    return String(hit?.name ?? '').trim();
                })
                .filter(Boolean)
                .join(' / ');
            res[String(v.id)] = {
                name: String(nameHit?.name ?? '').trim(),
                optionText,
                thumbnail: String((v as any).featuredAsset?.preview ?? ''),
            };
        }
        return res;
    }

    /** 页面主入口：一次请求返回 totalItems + summary + 当前页明细 */
    async page(ctx: RequestContext, input?: InventoryStockPageInput | null): Promise<{
        totalItems: number;
        summary: StockSummary;
        items: StockRowCore[];
    }> {
        const q = normalizeStockQuery(input);
        const { ids: locationIds, names } = await this.resolveLocations(ctx, q.locationId);
        const kw = q.keyword ? `%${q.keyword.toLowerCase()}%` : '';

        const aggregates = await this.loadAggregates(ctx, locationIds, kw);
        const variantIds = aggregates.map(a => String(a.variantId));
        const rules = await this.alertRuleService.rulesForVariants(ctx, variantIds);
        const channelDefault = this.alertRuleService.channelDefault(ctx);
        const cost = await this.loadLatestCost(ctx, variantIds);
        const ledger = await this.loadLedgerInfo(ctx, variantIds, locationIds, true);
        const enrich = await this.loadEnrich(ctx, variantIds);

        const rows: StockRowCore[] = aggregates.map(a => {
            const vid = String(a.variantId);
            const onHand = Number(a.onHand ?? 0);
            const allocated = Number(a.allocated ?? 0);
            const costPrice = cost[vid] ?? null;
            const safetyStock = resolveSafetyStock({
                variantId: vid,
                locationId: q.locationId ?? 0,
                rules,
                channelDefault,
            });
            return {
                variantId: vid,
                productId: a.productId === null || a.productId === undefined ? null : String(a.productId),
                variantName: enrich[vid]?.name || String(a.sku ?? ''),
                sku: String(a.sku ?? ''),
                optionText: enrich[vid]?.optionText ?? '',
                thumbnail: enrich[vid]?.thumbnail ?? '',
                stockLocationId: q.locationId,
                locationName: q.locationId ? (names[q.locationId] ?? '') : null,
                onHand,
                allocated,
                available: onHand - allocated,
                safetyStock,
                value: costPrice !== null ? costPrice * onHand : 0,
                costPrice,
                bucket: bucketOf(onHand, safetyStock),
                lastMovementAt: ledger.map[vid]?.at ?? null,
                lastDirection: ledger.map[vid]?.direction ?? null,
                lastBizType: ledger.map[vid]?.bizType ?? null,
            };
        });

        const summary = summarizeStock(rows, ledger.outbound7d);
        const filtered = q.bucket ? rows.filter(r => r.bucket === q.bucket) : rows;
        const sorted = sortStockRows(filtered, q.sort);
        const totalItems = sorted.length;
        const items = sorted.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
        return { totalItems, summary, items };
    }
}
```

- [x] **Step 7: 注册到 plugin.ts（SDL + providers）**

修改 `packages/cjk-plugin/src/plugin.ts`。

(a) import 区追加（紧邻 `import { InventoryAlertRuleEntity } ...` 之后）：

```ts
import { InventoryAlertRuleService } from './inventory/inventory-alert-rule.service';
import { InventoryStockService } from './inventory/inventory-stock.service';
```

(b) `providers` 数组里 `InventoryModeService,` 之后追加两行：

```ts
        InventoryAlertRuleService,
        InventoryStockService,
```

(c) admin SDL：在 `deleteTenantStockLocation(id: ID!): TenantInventoryOverview!` 所在 `extend type Mutation { ... }` 块的**收尾 `}` 之后、gql 模板结束的反引号之前**（即 L1312 与 L1313 之间）插入下面整段：

```graphql
                # ===== 库存明细聚合页（Plan 2）：一次请求拿齐 KPI / 分桶计数 / 明细行 =====
                input InventoryStockQueryInput {
                    locationId: ID
                    keyword: String
                    bucket: String
                    sort: String
                    page: Int
                    pageSize: Int
                }
                type InventoryStockSummary {
                    skuCount: Int!
                    onHandTotal: Int!
                    allocatedTotal: Int!
                    availableTotal: Int!
                    valueTotal: Int!
                    outCount: Int!
                    lowCount: Int!
                    okCount: Int!
                    outbound7d: Int!
                }
                type InventoryStockRow {
                    variantId: ID!
                    productId: ID
                    variantName: String!
                    sku: String!
                    optionText: String
                    thumbnail: String
                    stockLocationId: ID
                    locationName: String
                    onHand: Int!
                    allocated: Int!
                    available: Int!
                    safetyStock: Int!
                    value: Int!
                    costPrice: Int
                    bucket: String!
                    lastMovementAt: String
                    lastDirection: String
                    lastBizType: String
                }
                type InventoryStockPage {
                    totalItems: Int!
                    summary: InventoryStockSummary!
                    items: [InventoryStockRow!]!
                }
                extend type Query {
                    inventoryStockPage(input: InventoryStockQueryInput): InventoryStockPage!
                }
```

- [x] **Step 8: resolver 追加 `inventoryStockPage`**

修改 `packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts`：import 区追加服务，构造注入，类内加一个 `@Query()`。

import 区（在 `import { VirtualPhysicalStockService } ...` 之后）追加：

```ts
import { InventoryStockService, InventoryStockPageInput } from './inventory-stock.service';
```

构造函数改为：

```ts
    constructor(
        private virtualPhysicalStockService: VirtualPhysicalStockService,
        private inventoryStockService: InventoryStockService,
    ) {}
```

在 `deleteTenantStockLocation` 方法之后、类收尾 `}` 之前追加：

```ts
    /** 库存明细聚合页：KPI + 分桶计数 + 明细行（服务端过滤/排序/分页） */
    @Query()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async inventoryStockPage(
        @Ctx() ctx: RequestContext,
        @Args('input', { nullable: true }) input?: InventoryStockPageInput,
    ) {
        return this.inventoryStockService.page(ctx, input ?? null);
    }
```

- [x] **Step 9: 类型检查 + 提交**

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。

```bash
git add packages/cjk-plugin/src/inventory/stock-page-math.ts packages/cjk-plugin/src/inventory/stock-page-math.spec.ts packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts packages/cjk-plugin/src/inventory/inventory-stock.service.ts packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): inventoryStockPage 聚合查询（服务端分桶/排序/分页 + KPI 汇总）"
```

---

## Task 3: 后端预警规则读写 + 单据中心 + 流水多条件筛选（含 summary）

**Files:**
- Modify（整文件覆盖）: `packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts`（Task 2 只落了读部分，本任务补 `list` / `save`）
- Modify（整文件覆盖）: `packages/cjk-plugin/src/inventory/stock-doc.service.ts`（`ledger()` 改自建 QueryBuilder、新增 `listDocs()`、**移除** `StockLedgerService` 注入）
- Modify（整文件覆盖）: `packages/cjk-plugin/src/inventory/stock-doc.admin.resolver.ts`（`stockMovementLedger` 扩入参 + 新增 `stockDocList`）
- Modify（整文件覆盖）: `packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts`（注入 `InventoryAlertRuleService` + 新增 `inventoryAlertRules` / `saveInventoryAlertRules`）
- Modify（三处局部改）: `packages/cjk-plugin/src/plugin.ts`（单据 SDL 段：新增 `StockDocLedgerSummary`、`StockDocLedgerList` 加 `summary`、`stockMovementLedger` 入参扩展；Task 2 新增段尾部追加预警规则 + 单据列表 SDL）

> **本任务为后端纯增量改造，不涉及前端，故 tsc 必须保持通过**（与 Task 6~9 的「中间态不保证通过」不同）。
> **只写 `src/`，不提交 `lib/`**：编译产物在 Task 4 统一 `npm run build` 后与 `src` 一起提交。

- [x] **Step 1: 覆盖 `inventory-alert-rule.service.ts`（补 `list` / `save`）**

覆盖写入 `packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts`（完整文件）：

```ts
import { Injectable } from '@nestjs/common';
import { ID, ProductVariant, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { AlertRuleLike } from './alert-rule-math';
import { InventoryAlertRuleEntity } from './inventory-alert-rule.entity';
import { VirtualPhysicalStockService } from './virtual-physical-stock.service';

/** 保存入参（与 GraphQL `input InventoryAlertRuleInput` 一一对应） */
export interface InventoryAlertRuleInput {
    variantId: ID;
    safetyStock: number;
    enabled?: boolean | null;
    locationId?: ID | null;
}

/**
 * 库存预警规则（安全库存）读写。
 * 读：渠道默认值 + 指定变体集在本租户的规则 + 指定仓规则列表；写：幂等 upsert。
 * 哨兵口径：`locationId = 0` 表示「该 SKU 在本租户全部仓通用」（与实体注释一致）。
 */
@Injectable()
export class InventoryAlertRuleService {
    constructor(
        private conn: TransactionalConnection,
        private virtualPhysicalStockService: VirtualPhysicalStockService,
    ) {}

    /** 渠道级默认安全库存（未配置/非法 → null，由 resolveSafetyStock 落到常量 10） */
    channelDefault(ctx: RequestContext): number | null {
        const raw = (ctx.channel?.customFields as any)?.inventoryDefaultSafetyStock;
        if (raw === null || raw === undefined || raw === '') {
            return null;
        }
        const n = Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
    }

    /** 取指定变体在本租户的全部规则（含 locationId=0 的全仓通用规则） */
    async rulesForVariants(ctx: RequestContext, variantIds: string[]): Promise<AlertRuleLike[]> {
        const ids = (variantIds ?? []).map(v => Number(v)).filter(n => Number.isFinite(n));
        if (!ids.length) {
            return [];
        }
        const rows = await this.conn.getRepository(ctx, InventoryAlertRuleEntity).find({
            where: { tenantChannelId: ctx.channel.code, variantId: In(ids) },
        });
        return rows.map(r => ({
            variantId: String(r.variantId),
            locationId: String(r.locationId),
            safetyStock: r.safetyStock,
            enabled: r.enabled,
        }));
    }

    /** 哨兵归一：空/缺省 → 0（全仓通用）；非法/负数 → 拒绝 */
    private normLocationId(locationId?: ID | null): number {
        const raw = locationId === null || locationId === undefined || String(locationId) === '' ? 0 : Number(locationId);
        if (!Number.isFinite(raw) || raw < 0) {
            throw new UserInputError('仓库 id 非法');
        }
        return Math.trunc(raw);
    }

    /** 指定仓的规则列表（locationId 缺省 → 哨兵 0 = 全仓通用规则） */
    async list(ctx: RequestContext, locationId?: ID | null): Promise<InventoryAlertRuleEntity[]> {
        const locId = this.normLocationId(locationId);
        return this.conn.getRepository(ctx, InventoryAlertRuleEntity).find({
            where: { tenantChannelId: ctx.channel.code, locationId: locId },
            order: { variantId: 'ASC' },
        });
    }

    /**
     * 幂等 upsert（唯一键 tenantChannelId + variantId + locationId），返回该仓最新规则列表。
     * 校验：非本租户仓 / 变体不存在或不属于当前渠道 / safetyStock < 0 一律拒绝；
     * `safetyStock = 0` 合法（语义 = 该 SKU 不再进入低库存预警）。
     */
    async save(
        ctx: RequestContext,
        locationId: ID | null | undefined,
        items: InventoryAlertRuleInput[],
    ): Promise<InventoryAlertRuleEntity[]> {
        const locId = this.normLocationId(locationId);
        if (locId > 0) {
            const overview = await this.virtualPhysicalStockService.getTenantInventoryOverview(ctx);
            if (!overview.locations.some(l => Number(l.id) === locId)) {
                throw new UserInputError('仓库不属于当前租户');
            }
        }
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!list.length) {
            return this.list(ctx, locId);
        }
        // 变体必须存在且属于当前渠道（避免写入指向他租户/已删变体的脏规则）
        const variantIds = Array.from(new Set(list.map(i => Number(i?.variantId)).filter(n => Number.isFinite(n))));
        const found = await this.conn
            .getRepository(ctx, ProductVariant)
            .createQueryBuilder('v')
            .innerJoin('v.channels', 'ch', 'ch.id = :cid', { cid: ctx.channelId })
            .where('v.id IN (:...ids)', { ids: variantIds.length ? variantIds : [0] })
            .andWhere('v.deletedAt IS NULL')
            .select('v.id', 'id')
            .getRawMany();
        const okIds = new Set(found.map(r => Number(r.id)));
        for (const i of list) {
            const vid = Number(i?.variantId);
            if (!Number.isFinite(vid) || !okIds.has(vid)) {
                throw new UserInputError(`变体不存在或不属于当前渠道：${String(i?.variantId)}`);
            }
            const ss = Number(i?.safetyStock);
            if (!Number.isFinite(ss) || ss < 0) {
                throw new UserInputError('安全库存不能为负数');
            }
        }

        await this.conn.withTransaction(ctx, async txCtx => {
            const repo = this.conn.getRepository(txCtx, InventoryAlertRuleEntity);
            for (const i of list) {
                const vid = Number(i.variantId);
                const safetyStock = Math.trunc(Number(i.safetyStock));
                const enabled = i.enabled === undefined || i.enabled === null ? true : !!i.enabled;
                const exist = await repo.findOne({
                    where: { tenantChannelId: txCtx.channel.code, variantId: vid, locationId: locId },
                });
                if (exist) {
                    exist.safetyStock = safetyStock;
                    exist.enabled = enabled;
                    exist.updatedAt = new Date();
                    await repo.save(exist);
                } else {
                    const row = new InventoryAlertRuleEntity();
                    row.tenantChannelId = txCtx.channel.code;
                    row.variantId = vid;
                    row.locationId = locId;
                    row.safetyStock = safetyStock;
                    row.enabled = enabled;
                    row.updatedAt = new Date();
                    await repo.save(row);
                }
            }
        });
        return this.list(ctx, locId);
    }
}
```

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。若报 `Cannot find module './virtual-physical-stock.service'`，说明 Task 2 的文件名拼错，按契约 1.2 修正为 `virtual-physical-stock.service.ts`。

- [x] **Step 2: 覆盖 `stock-doc.service.ts`（`ledger()` 自建查询 + `listDocs()`，移除 `StockLedgerService` 注入）**

覆盖写入 `packages/cjk-plugin/src/inventory/stock-doc.service.ts`（完整文件；`assertSimple` / `nextCode` / `create` / `applyMovement` 与现状逐字一致，仅新增查询部分与构造签名变化）：

```ts
import { Injectable } from '@nestjs/common';
import { ID, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderStockLedger } from '@vendure/inventory-plugin';
import { StockDocEntity, StockDocType } from './stock-doc.entity';
import { StockDocItemEntity } from './stock-doc-item.entity';
import { VirtualPhysicalStockService } from './virtual-physical-stock.service';
import { InventoryModeService } from './inventory-mode.service';

const loggerCtx = 'StockDocService';

export interface StockDocItemInput {
    variantId: ID;
    fromStockLocationId?: ID;
    toStockLocationId?: ID;
    qty: number;
    realQty?: number;
    costPrice?: number;
}

export interface StockDocCreateInput {
    type: StockDocType;
    remark?: string;
    operator?: string;
    items: StockDocItemInput[];
}

/** 流水查询入参（与 GraphQL `stockMovementLedger` 一一对应；新增项全部可选，向后兼容） */
export interface StockDocLedgerQuery {
    productVariantId?: ID;
    locationId?: ID;
    bizType?: string;
    bizCode?: string;
    orderLineId?: ID;
    /** 'in' | 'out'；其它值视为不传 */
    direction?: string;
    /** ISO 时间字符串；非法值视为不传 */
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
}

export interface StockDocLedgerSummary {
    inQty: number;
    outQty: number;
}

export interface StockDocSummaryRow {
    id: string;
    code: string;
    type: string;
    remark: string | null;
    operator: string | null;
    createdAt: string;
    itemCount: number;
    totalQty: number;
}

const CODE_PREFIX: Record<StockDocType, string> = {
    PURCHASE: 'PO',
    TRANSFER: 'TF',
    STOCKTAKE: 'ST',
    ISSUE: 'IS',
};

const BIZ_TYPE: Record<StockDocType, string> = {
    PURCHASE: 'purchase',
    TRANSFER: 'stockMove',
    STOCKTAKE: 'stocktake',
    ISSUE: 'stockOut',
};

const DOC_TYPES: StockDocType[] = ['PURCHASE', 'TRANSFER', 'STOCKTAKE', 'ISSUE'];

function parseIso(value?: string | null): Date | null {
    if (!value) {
        return null;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function clampPage(v?: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

function clampPageSize(v?: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.min(100, Math.trunc(n)) : 20;
}

@Injectable()
export class StockDocService {
    constructor(
        private conn: TransactionalConnection,
        private virtualPhysicalStockService: VirtualPhysicalStockService,
        private inventoryModeService: InventoryModeService,
    ) {}

    /** inventoryMode gate 委托独立服务：odoo 模式只读，禁止直接落库 */
    private assertSimple(ctx: RequestContext): void {
        this.inventoryModeService.assertSimple(ctx);
    }

    /** 生成租户内唯一单号（前缀+时间戳+随机，冲突重试） */
    async nextCode(ctx: RequestContext, type: StockDocType): Promise<string> {
        const prefix = CODE_PREFIX[type];
        const repo = this.conn.getRepository(ctx, StockDocEntity);
        for (let i = 0; i < 3; i++) {
            const stamp = Date.now().toString(36).toUpperCase();
            const rand = Math.floor(Math.random() * 1000)
                .toString(36)
                .toUpperCase()
                .padStart(3, '0');
            const code = `${prefix}-${stamp}-${rand}`;
            const existing = await repo.findOne({ where: { code } });
            if (!existing) {
                return code;
            }
        }
        throw new Error(`单号生成冲突：${prefix}`);
    }

    /** 直接生效：PURCHASE 加目标仓、TRANSFER 源-目标+、STOCKTAKE 按 realQty 覆盖 */
    async create(ctx: RequestContext, input: StockDocCreateInput): Promise<StockDocEntity> {
        this.assertSimple(ctx);
        return this.conn.withTransaction(ctx, async txCtx => {
            const doc = new StockDocEntity();
            doc.type = input.type;
            doc.tenantChannelId = ctx.channel.code;
            doc.code = await this.nextCode(txCtx, input.type);
            doc.remark = input.remark ?? (null as any);
            doc.operator = input.operator || ctx.activeUserId?.toString() || (null as any);
            doc.createdAt = new Date();
            await this.conn.getRepository(txCtx, StockDocEntity).save(doc);

            const itemRepo = this.conn.getRepository(txCtx, StockDocItemEntity);
            for (const it of input.items) {
                const ei = new StockDocItemEntity();
                ei.docId = doc.id;
                ei.variantId = Number(it.variantId);
                ei.fromStockLocationId = it.fromStockLocationId != null ? Number(it.fromStockLocationId) : (null as any);
                ei.toStockLocationId = it.toStockLocationId != null ? Number(it.toStockLocationId) : (null as any);
                ei.qty = it.qty;
                ei.realQty = it.realQty != null ? Number(it.realQty) : (null as any);
                ei.costPrice = it.costPrice != null ? Number(it.costPrice) : (null as any);
                await this.applyMovement(txCtx, doc, ei);
                await itemRepo.save(ei);
            }
            Logger.info(`库存单据 ${doc.code}(${doc.type}) 已生效 items=${input.items.length}`, loggerCtx);
            return doc;
        });
    }

    private async applyMovement(ctx: RequestContext, doc: StockDocEntity, item: StockDocItemEntity): Promise<void> {
        const adjust = this.virtualPhysicalStockService;
        const variantId = item.variantId as ID;
        const bizCode = doc.code;
        const bizType = BIZ_TYPE[doc.type as StockDocType];
        const reason = `${doc.type}#${doc.code}`;

        switch (doc.type as StockDocType) {
            case 'PURCHASE': {
                if (item.toStockLocationId == null) {
                    throw new Error(`${doc.code} 采购入库需指定目标仓`);
                }
                await adjust.adjustPhysicalStock(ctx, variantId, item.toStockLocationId, item.qty, `${reason}:purchase-in`, {
                    bizType: bizType as any,
                    bizCode,
                });
                break;
            }
            case 'TRANSFER': {
                if (item.fromStockLocationId == null || item.toStockLocationId == null) {
                    throw new Error(`${doc.code} 移库需指定源仓与目标仓`);
                }
                await adjust.adjustPhysicalStock(ctx, variantId, item.fromStockLocationId, -item.qty, `${reason}:source-out`, {
                    bizType: bizType as any,
                    bizCode,
                    otherLocationId: item.toStockLocationId,
                });
                await adjust.adjustPhysicalStock(ctx, variantId, item.toStockLocationId, item.qty, `${reason}:target-in`, {
                    bizType: bizType as any,
                    bizCode,
                    otherLocationId: item.fromStockLocationId,
                });
                break;
            }
            case 'STOCKTAKE': {
                if (item.toStockLocationId == null) {
                    throw new Error(`${doc.code} 盘库需指定目标仓`);
                }
                const target = item.realQty ?? item.qty;
                const diff = await adjust.setPhysicalStock(
                    ctx,
                    variantId,
                    item.toStockLocationId,
                    target,
                    `${reason}:reconcile`,
                    { bizType: bizType as any, bizCode },
                );
                item.difference = diff;
                break;
            }
            case 'ISSUE': {
                if (item.fromStockLocationId == null) {
                    throw new Error(`${doc.code} 手动出库需指定源仓`);
                }
                await adjust.adjustPhysicalStock(ctx, variantId, item.fromStockLocationId, -item.qty, `${reason}:issue-out`, {
                    bizType: bizType as any,
                    bizCode,
                });
                break;
            }
        }
    }

    /**
     * 流水查询：按当前渠道查 OrderStockLedger。
     * 不复用 `@vendure/inventory-plugin` 的 `StockLedgerService.list()`（它不支持 direction/from/to/summary，
     * 且不宜改动另一个包的 src 与 lib），改为在本服务内自建 QueryBuilder。
     * 渠道 scoping 沿用既有写法（对齐 `pickup-location.service.ts:41` 的 innerJoin channels）。
     */
    async ledger(
        ctx: RequestContext,
        options?: StockDocLedgerQuery,
    ): Promise<{ items: OrderStockLedger[]; totalItems: number; summary: StockDocLedgerSummary }> {
        const page = clampPage(options?.page);
        const pageSize = clampPageSize(options?.pageSize);
        const dir = options?.direction === 'in' || options?.direction === 'out' ? options.direction : null;
        const bizType = options?.bizType ? String(options.bizType) : null;
        const from = parseIso(options?.from);
        const to = parseIso(options?.to);

        const base = () => {
            const qb = this.conn
                .getRepository(ctx, OrderStockLedger)
                .createQueryBuilder('l')
                .innerJoin('l.channels', 'ch', 'ch.id = :cid', { cid: ctx.channelId });
            if (options?.productVariantId) {
                qb.andWhere('l.productVariantId = :vid', { vid: Number(options.productVariantId) });
            }
            if (options?.locationId) {
                qb.andWhere('l.stockLocationId = :lid', { lid: Number(options.locationId) });
            }
            if (options?.bizCode) {
                qb.andWhere('l.bizCode = :bc', { bc: String(options.bizCode) });
            }
            if (options?.orderLineId) {
                qb.andWhere('l.orderLineId = :ol', { ol: Number(options.orderLineId) });
            }
            if (bizType) {
                qb.andWhere('l.bizType = :bt', { bt: bizType });
            }
            if (dir) {
                qb.andWhere('l.direction = :dir', { dir });
            }
            if (from) {
                qb.andWhere('l.createdAt >= :from', { from });
            }
            if (to) {
                qb.andWhere('l.createdAt <= :to', { to });
            }
            return qb;
        };

        const [items, totalItems] = await base()
            .orderBy('l.createdAt', 'DESC')
            .addOrderBy('l.id', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        // 同条件汇总（不带分页）：入/出合计；一条流水只挂一个渠道，故无需去重
        const agg = await base()
            .select("COALESCE(SUM(CASE WHEN l.direction = 'in' THEN l.quantity ELSE 0 END), 0)", 'inQty')
            .addSelect("COALESCE(SUM(CASE WHEN l.direction = 'out' THEN l.quantity ELSE 0 END), 0)", 'outQty')
            .getRawOne();

        return {
            items,
            totalItems,
            summary: { inQty: Number(agg?.inQty ?? 0), outQty: Number(agg?.outQty ?? 0) },
        };
    }

    /** 单据中心列表：本租户单据（可按类型过滤）+ 每单条数/总数量 */
    async listDocs(
        ctx: RequestContext,
        options?: { type?: string; page?: number; pageSize?: number },
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
        const [docs, totalItems] = await qb
            .orderBy('d.createdAt', 'DESC')
            .addOrderBy('d.id', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        const ids = docs.map(d => d.id);
        const stats = ids.length
            ? await this.conn
                  .getRepository(ctx, StockDocItemEntity)
                  .createQueryBuilder('i')
                  .select(['i.docId AS docId', 'COUNT(i.id) AS itemCount', 'COALESCE(SUM(i.qty), 0) AS totalQty'])
                  .where('i.docId IN (:...ids)', { ids })
                  .groupBy('i.docId')
                  .getRawMany()
            : [];
        const map: Record<string, { itemCount: number; totalQty: number }> = {};
        for (const s of stats) {
            map[String(s.docId)] = { itemCount: Number(s.itemCount ?? 0), totalQty: Number(s.totalQty ?? 0) };
        }

        return {
            totalItems,
            items: docs.map(d => ({
                id: String(d.id),
                code: d.code,
                type: d.type,
                remark: d.remark ?? null,
                operator: d.operator ?? null,
                createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt ?? ''),
                itemCount: map[String(d.id)]?.itemCount ?? 0,
                totalQty: map[String(d.id)]?.totalQty ?? 0,
            })),
        };
    }
}
```

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。注意此时 `stock-doc.admin.resolver.ts` 仍在调用旧 `ledger` 签名——新签名是**超集**（多出的返回字段 `summary` 与可选入参），故不报错；若报 `summary does not exist`，说明 Task 3 Step 5 的 SDL 尚未改，属预期中间态，继续 Step 3~5。

- [x] **Step 3: 覆盖 `stock-doc.admin.resolver.ts`（扩入参 + `stockDocList`）**

覆盖写入 `packages/cjk-plugin/src/inventory/stock-doc.admin.resolver.ts`（完整文件）：

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { InventoryPermissions } from '@vendure/inventory-plugin';
import { StockDocCreateInput, StockDocService } from './stock-doc.service';

/** 管理端：库存单据（采购/移库/盘库/出库） + 库存流水查询 + 单据中心列表 */
@Resolver()
export class StockDocAdminResolver {
    constructor(private stockDocService: StockDocService) {}

    @Mutation()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async createStockDoc(
        @Ctx() ctx: RequestContext,
        @Args('input') input: StockDocCreateInput,
    ): Promise<any> {
        return this.stockDocService.create(ctx, input);
    }

    @Query()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async stockMovementLedger(
        @Ctx() ctx: RequestContext,
        @Args('productVariantId', { nullable: true }) productVariantId?: ID,
        @Args('locationId', { nullable: true }) locationId?: ID,
        @Args('bizCode', { nullable: true }) bizCode?: string,
        @Args('orderLineId', { nullable: true }) orderLineId?: ID,
        @Args('bizType', { nullable: true }) bizType?: string,
        @Args('direction', { nullable: true }) direction?: string,
        @Args('from', { nullable: true }) from?: string,
        @Args('to', { nullable: true }) to?: string,
        @Args('page', { nullable: true }) page?: number,
        @Args('pageSize', { nullable: true }) pageSize?: number,
    ): Promise<any> {
        return this.stockDocService.ledger(ctx, {
            productVariantId,
            locationId,
            bizCode,
            orderLineId,
            bizType,
            direction,
            from,
            to,
            page,
            pageSize,
        });
    }

    @Query()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async stockDocList(
        @Ctx() ctx: RequestContext,
        @Args('type', { nullable: true }) type?: string,
        @Args('page', { nullable: true }) page?: number,
        @Args('pageSize', { nullable: true }) pageSize?: number,
    ): Promise<any> {
        return this.stockDocService.listDocs(ctx, { type, page, pageSize });
    }
}
```

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。

- [x] **Step 4: 覆盖 `inventory-admin.resolver.ts`（注入 `InventoryAlertRuleService` + 两个方法）**

覆盖写入 `packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts`（完整文件；`inventoryStockPage` 为 Task 2 已加，此处保留）：

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { InventoryPermissions } from '@vendure/inventory-plugin';
import { VirtualPhysicalStockService } from './virtual-physical-stock.service';
import { InventoryAlertRuleInput, InventoryAlertRuleService } from './inventory-alert-rule.service';
import { InventoryStockPageInput, InventoryStockService } from './inventory-stock.service';

/** 管理端库存配置：变体 × 物理仓绑定 + 租户库存仓管理 + 库存明细聚合页 + 预警规则 */
@Resolver()
export class InventoryAdminResolver {
    constructor(
        private virtualPhysicalStockService: VirtualPhysicalStockService,
        private inventoryStockService: InventoryStockService,
        private inventoryAlertRuleService: InventoryAlertRuleService,
    ) {}

    @Mutation()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async setVariantBindings(
        @Ctx() ctx: RequestContext,
        @Args('variantId') variantId: ID,
        @Args('bindings') bindings: Array<{ locationId: ID; isDefault: boolean }>,
    ) {
        return this.virtualPhysicalStockService.setVariantBindings(ctx, variantId, bindings);
    }

    /** 租户库存方案概览（开关口径 + 系统仓落点 + 仓清单） */
    @Query()
    @Allow(Permission.ReadCatalog, Permission.ReadStockLocation)
    async tenantInventoryOverview(@Ctx() ctx: RequestContext) {
        return this.virtualPhysicalStockService.getTenantInventoryOverview(ctx);
    }

    /** 幂等补建系统仓（虚拟仓恒在；开关开启时补默认物理仓），供后台「一键初始化」与自愈 */
    @Mutation()
    @Allow(Permission.CreateStockLocation, Permission.UpdateStockLocation)
    async ensureTenantInventoryLocations(@Ctx() ctx: RequestContext) {
        return this.virtualPhysicalStockService.ensureTenantInventoryLocations(ctx);
    }

    /** 新建租户物理仓（服务端自动编码 + 归属校验 + 强制 physical） */
    @Mutation()
    @Allow(Permission.CreateStockLocation)
    async createTenantStockLocation(
        @Ctx() ctx: RequestContext,
        @Args('input') input: { name: string },
    ) {
        return this.virtualPhysicalStockService.createTenantPhysicalLocation(ctx, input as any);
    }

    /** 更新租户仓（名称/配送方式/服务城市/坐标；编码与性质不可改） */
    @Mutation()
    @Allow(Permission.UpdateStockLocation)
    async updateTenantStockLocation(
        @Ctx() ctx: RequestContext,
        @Args('input') input: { id: ID },
    ) {
        return this.virtualPhysicalStockService.updateTenantPhysicalLocation(ctx, input as any);
    }

    /** 删除租户仓（系统仓不可删） */
    @Mutation()
    @Allow(Permission.DeleteStockLocation)
    async deleteTenantStockLocation(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ) {
        return this.virtualPhysicalStockService.deleteTenantPhysicalLocation(ctx, id);
    }

    /** 库存明细聚合页：KPI + 分桶计数 + 明细行（服务端过滤/排序/分页） */
    @Query()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async inventoryStockPage(
        @Ctx() ctx: RequestContext,
        @Args('input', { nullable: true }) input?: InventoryStockPageInput,
    ) {
        return this.inventoryStockService.page(ctx, input ?? null);
    }

    /** 预警规则列表（指定仓；缺省 → 该 SKU 全仓通用规则） */
    @Query()
    @Allow(InventoryPermissions.ViewStock as Permission)
    async inventoryAlertRules(
        @Ctx() ctx: RequestContext,
        @Args('locationId', { nullable: true }) locationId?: ID,
    ) {
        return this.inventoryAlertRuleService.list(ctx, locationId ?? null);
    }

    /** 预警规则保存（幂等 upsert；返回该仓最新规则列表） */
    @Mutation()
    @Allow(Permission.UpdateStockLocation)
    async saveInventoryAlertRules(
        @Ctx() ctx: RequestContext,
        @Args('items') items: InventoryAlertRuleInput[],
        @Args('locationId', { nullable: true }) locationId?: ID,
    ) {
        return this.inventoryAlertRuleService.save(ctx, locationId ?? null, items ?? []);
    }
}
```

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。

- [x] **Step 5: 改 `plugin.ts`（三处局部改 + Task 2 段尾追加）**

修改 `packages/cjk-plugin/src/plugin.ts`（**admin SDL 内**，共 4 处；`shopApiExtensions` 侧**完全不动**）。

(a) **L1188-1191 的 `StockDocLedgerList`**：改成带 `summary`，并在其**之前**插入新类型。把：

```graphql
                type StockDocLedgerList {
                    items: [StockDocLedgerEntry!]!
                    totalItems: Int!
                }
```

替换为：

```graphql
                # 同条件入/出合计（Task 3 新增；分页不影响汇总口径）
                type StockDocLedgerSummary {
                    inQty: Int!
                    outQty: Int!
                }

                type StockDocLedgerList {
                    items: [StockDocLedgerEntry!]!
                    totalItems: Int!
                    summary: StockDocLedgerSummary!
                }
```

(b) **L1197-1199 的 `stockMovementLedger`**：把：

```graphql
                extend type Query {
                    stockMovementLedger(productVariantId: ID, locationId: ID, bizCode: String, orderLineId: ID, page: Int, pageSize: Int): StockDocLedgerList!
                }
```

替换为：

```graphql
                extend type Query {
                    # Task 3：新增 bizType/direction/from/to 入参（全部可选，向后兼容）
                    stockMovementLedger(productVariantId: ID, locationId: ID, bizCode: String, orderLineId: ID, bizType: String, direction: String, from: String, to: String, page: Int, pageSize: Int): StockDocLedgerList!
                }
```

(c) **Task 2 新增段尾部追加预警规则 + 单据中心 SDL**：在 Task 2 Step 7(c) 插入的 `extend type Query { inventoryStockPage(...) }` 之后（仍在该 `gql` 模板反引号 `;` 之前）追加：

```graphql
                # ===== 库存预警规则（安全库存；Plan 2） =====
                type InventoryAlertRule {
                    variantId: ID!
                    locationId: ID
                    safetyStock: Int!
                    enabled: Boolean!
                }
                input InventoryAlertRuleInput {
                    variantId: ID!
                    safetyStock: Int!
                    enabled: Boolean
                    locationId: ID
                }
                extend type Query {
                    inventoryAlertRules(locationId: ID): [InventoryAlertRule!]!
                }
                extend type Mutation {
                    saveInventoryAlertRules(locationId: ID, items: [InventoryAlertRuleInput!]!): [InventoryAlertRule!]!
                }

                # ===== 单据中心（单据列表；Plan 2） =====
                type StockDocSummaryRow {
                    id: ID!
                    code: String!
                    type: String!
                    remark: String
                    operator: String
                    createdAt: String!
                    itemCount: Int!
                    totalQty: Int!
                }
                type StockDocList {
                    totalItems: Int!
                    items: [StockDocSummaryRow!]!
                }
                extend type Query {
                    stockDocList(type: String, page: Int, pageSize: Int): StockDocList!
                }
```

> 不要改 `entities` / `providers` / `resolvers`（Task 2 已就位；`InventoryAdminResolver`、`StockDocAdminResolver` 已在数组内）。

(d) 静态校验：确认整个 admin SDL 模板内**没有**第二个 `type StockDocLedgerList` / `type StockDocList` / `type InventoryAlertRule` 定义（SQL 与 schema 都会因重复定义崩溃）。

Run: `npx tsc -p packages/cjk-plugin/tsconfig.json --noEmit`
Expected: 无输出（0 error）。

- [x] **Step 6: 提交 `src`（**不 build，`lib/` 留给 Task 4**）**

```bash
git add packages/cjk-plugin/src/inventory/inventory-alert-rule.service.ts packages/cjk-plugin/src/inventory/stock-doc.service.ts packages/cjk-plugin/src/inventory/stock-doc.admin.resolver.ts packages/cjk-plugin/src/inventory/inventory-admin.resolver.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): 预警规则读写 + 单据中心列表 + 流水多条件筛选（含入出汇总）"
```

Run: `git status --short packages/cjk-plugin`
Expected: 只有 `lib/**` 未提交（属预期，Task 4 build 后一起提交）。

---

## Task 4: 后端 build + 本地探针回归（编译产物 `lib/` 必须提交）

**Files:**
- Create: `packages/dev-server/e2e-inventory-stock-page.mjs`
- Modify（编译产物，**必须提交**）: `packages/cjk-plugin/lib/**`

> **硬性事实**：`packages/cjk-plugin/package.json` 的 `main = lib/index.js`，dev-server 的 tsconfig **没有** `@vendure/*` 别名 → **`src` 改动不 build 就不生效**。`lib/` 是 git 跟踪产物（`git status` 会显示 `lib/**` 的 M），故必须「改 src → build → 提交 src + lib」。

- [x] **Step 1: 编译 cjk-plugin**

Run: `npm run build --prefix packages/cjk-plugin`
（等价于 `rimraf lib && tsc -p ./tsconfig.build.json && node -e "..."`）
Expected: 无 tsc 报错；`packages/cjk-plugin/lib/index.js` 与 `lib/src/inventory/inventory-stock.service.js`、`lib/src/inventory/inventory-alert-rule.service.js`、`lib/src/plugin.js` 时间戳更新。

- [x] **Step 2: 重启本地两个进程（`lib` 无热更新）**

关闭既有终端后重新起（**必须两个都起**，缺 worker 时 `reindex` 等任务永远 `PENDING`）：

```bash
npm run dev:server     # 终端 A：admin-api http://localhost:3000/admin-api
npm run dev:worker     # 终端 B：job worker（搜索索引/异步任务）
```

Run: 浏览器/curl 访问 `http://localhost:3000/admin-api` 返回 GraphQL playground 或 400 JSON。
Expected: 启动日志无 `Entity metadata for ... was not found`；日志出现 `Vendure server (v3.6.4) now running on port 3000`。

- [x] **Step 3: 写本地探针 `packages/dev-server/e2e-inventory-stock-page.mjs`**

创建 `packages/dev-server/e2e-inventory-stock-page.mjs`（完整文件）：

```js
// 库存页面升级（Plan 2）后端回归探针（本地）
// 前置：
//   1) 本地 postgres + 已 populate（superadmin@china.test / superadmin）
//   2) 已 build：npm run build --prefix packages/cjk-plugin
//   3) 两个进程都起：npm run dev:server && npm run dev:worker
// 运行：node e2e-inventory-stock-page.mjs          （可用 ADMIN_API 覆盖 admin-api 地址）
// 覆盖：inventoryStockPage（KPI/分桶/排序/分页/关键词/非法值回退）、inventoryAlertRules 读写环、
//       safetyStock 四级回退（渠道默认值）、stockDocList、stockMovementLedger 多条件筛选 + 入出汇总
// 说明：唯一写入项为「预警规则」与「渠道默认安全库存」，脚本结束前均复位，不改动业务单据与库存。
const ADMIN = process.env.ADMIN_API || 'http://localhost:3000/admin-api';
let TOKEN = '';
let PASS = 0;
let FAIL = 0;

async function gql(query, variables = {}, channelToken) {
    const res = await fetch(ADMIN, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
            ...(channelToken ? { 'vendure-token': channelToken } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const newToken = res.headers.get('vendure-auth-token');
    if (newToken) TOKEN = newToken;
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data;
}

function ok(name, cond, extra = '') {
    if (cond) {
        PASS++;
        console.log(`  PASS  ${name}${extra ? ' :: ' + extra : ''}`);
    } else {
        FAIL++;
        console.log(`  FAIL  ${name}${extra ? ' :: ' + extra : ''}`);
    }
}

const OVERVIEW = `query { tenantInventoryOverview {
  channelCode physicalStockEnabled virtualCode virtualLocationId defaultPhysicalCode defaultPhysicalLocationId
  locations { id name code kind isSystem } } }`;

const PAGE = `query($input: InventoryStockQueryInput) { inventoryStockPage(input: $input) {
  totalItems
  summary { skuCount onHandTotal allocatedTotal availableTotal valueTotal outCount lowCount okCount outbound7d }
  items { variantId productId variantName sku optionText thumbnail stockLocationId locationName
          onHand allocated available safetyStock value costPrice bucket lastMovementAt lastDirection lastBizType } } }`;

const RULES = `query($lid: ID){ inventoryAlertRules(locationId: $lid){ variantId locationId safetyStock enabled } }`;

const SAVE = `mutation($lid: ID, $items: [InventoryAlertRuleInput!]!){
  saveInventoryAlertRules(locationId: $lid, items: $items){ variantId locationId safetyStock enabled } }`;

const DOCS = `query($t: String, $p: Int, $ps: Int){ stockDocList(type: $t, page: $p, pageSize: $ps){
  totalItems items { id code type remark operator createdAt itemCount totalQty } } }`;

const LEDGER = `query($v: ID, $d: String, $from: String, $to: String, $p: Int, $ps: Int){
  stockMovementLedger(productVariantId: $v, direction: $d, from: $from, to: $to, page: $p, pageSize: $ps){
    totalItems summary { inQty outQty }
    items { id code direction quantity bizType bizCode createdAt } } }`;

function bucketMatches(r) {
    if (r.onHand <= 0) return r.bucket === 'out';
    if (r.onHand < r.safetyStock) return r.bucket === 'low';
    return r.bucket === 'ok';
}

async function main() {
    const login = await gql(`mutation { login(username: "superadmin@china.test", password: "superadmin") {
        ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }`);
    ok('超级管理员登录', !!login.login?.identifier, JSON.stringify(login.login));
    ok('拿到 admin token', !!TOKEN);

    const ch = await gql(`query { channels { items { id code token } } }`);
    const items = ch.channels.items;
    let tenant = items[0];
    for (const c of items) {
        if (c.code === '__default_channel__') continue;
        try {
            const v = await gql(`query { productVariants(options: { take: 1 }) { items { id } } }`, {}, c.token);
            if (v.productVariants.items.length) { tenant = c; break; }
        } catch { /* 跳过空渠道 */ }
    }
    console.log(`  用例渠道: ${tenant.code} (id=${tenant.id})`);

    // 0) 概览 + 幂等补建（保证有物理仓口径）
    const ov = await gql(OVERVIEW, {}, tenant.token);
    if (!ov.tenantInventoryOverview.locations.length) {
        await gql(`mutation { ensureTenantInventoryLocations { virtualLocationId } }`, {}, tenant.token);
    }
    const ov2 = await gql(OVERVIEW, {}, tenant.token);
    ok('租户仓概览可用', Array.isArray(ov2.tenantInventoryOverview.locations),
        `locations=${ov2.tenantInventoryOverview.locations.map(l => `${l.code}:${l.kind}`).join(',')}`);

    // 1) inventoryStockPage 无入参
    const p0 = await gql(PAGE, { input: null }, tenant.token);
    const s0 = p0.inventoryStockPage.summary;
    ok('inventoryStockPage 可用（无入参）', Array.isArray(p0.inventoryStockPage.items),
        `totalItems=${p0.inventoryStockPage.totalItems}`);
    ok('summary.skuCount === totalItems', s0.skuCount === p0.inventoryStockPage.totalItems,
        `skuCount=${s0.skuCount}/totalItems=${p0.inventoryStockPage.totalItems}`);
    ok('三桶计数之和 === skuCount', s0.outCount + s0.lowCount + s0.okCount === s0.skuCount,
        `out=${s0.outCount} low=${s0.lowCount} ok=${s0.okCount}`);
    ok('bucket 字段与 bucketOf 口径一致',
        p0.inventoryStockPage.items.every(bucketMatches),
        p0.inventoryStockPage.items.slice(0, 3).map(r => `${r.sku}:${r.onHand}/${r.safetyStock}/${r.bucket}`).join(' '));
    ok('available === onHand - allocated',
        p0.inventoryStockPage.items.every(r => r.available === r.onHand - r.allocated));
    ok('safetyStock ≥ 0（四级回退未产生负阈值）', p0.inventoryStockPage.items.every(r => r.safetyStock >= 0));

    // 2) bucket 过滤（summary 仍为全量口径）
    const pOut = await gql(PAGE, { input: { bucket: 'out' } }, tenant.token);
    ok('bucket=out 只返回 out 行', pOut.inventoryStockPage.items.every(r => r.bucket === 'out'),
        `totalItems=${pOut.inventoryStockPage.totalItems}`);
    ok('bucket 过滤时 summary 仍是全量口径', pOut.inventoryStockPage.summary.skuCount === s0.skuCount);
    ok('bucket 过滤后 totalItems ≤ 全量', pOut.inventoryStockPage.totalItems <= p0.inventoryStockPage.totalItems);

    // 3) keyword
    const first = p0.inventoryStockPage.items[0];
    if (first) {
        const pKw = await gql(PAGE, { input: { keyword: first.sku } }, tenant.token);
        ok('keyword 命中 sku（命中数 ≤ 全量）',
            pKw.inventoryStockPage.totalItems <= p0.inventoryStockPage.totalItems
            && pKw.inventoryStockPage.items.some(r => r.sku === first.sku),
            `hit=${pKw.inventoryStockPage.totalItems}`);
    } else {
        console.log('  SKIP  keyword 用例（该渠道无库存行）');
    }
    const pMiss = await gql(PAGE, { input: { keyword: '__no_such_sku_zzz__' } }, tenant.token);
    ok('keyword 无命中 → 0 行且汇总归零',
        pMiss.inventoryStockPage.totalItems === 0 && pMiss.inventoryStockPage.summary.onHandTotal === 0);

    // 4) 非法 sort/bucket/pageSize 回退，不抛错
    const pBad = await gql(PAGE, { input: { sort: 'not-a-sort', bucket: 'not-a-bucket', page: 0, pageSize: 999 } }, tenant.token);
    ok('非法 sort/bucket/page 被回退（不抛错，pageSize 夹到 ≤100）',
        pBad.inventoryStockPage.items.length <= 100 && pBad.inventoryStockPage.totalItems === p0.inventoryStockPage.totalItems);

    // 5) 排序单调性
    const pSort = await gql(PAGE, { input: { sort: 'valueDesc', pageSize: 100 } }, tenant.token);
    const vals = pSort.inventoryStockPage.items.map(r => r.value);
    ok('sort=valueDesc 货值单调不增', vals.every((v, i) => i === 0 || vals[i - 1] >= v), vals.slice(0, 5).join(','));
    const pStock = await gql(PAGE, { input: { sort: 'stockAsc', pageSize: 100 } }, tenant.token);
    const hands = pStock.inventoryStockPage.items.map(r => r.onHand);
    ok('sort=stockAsc 现存单调不减', hands.every((v, i) => i === 0 || hands[i - 1] <= v), hands.slice(0, 5).join(','));

    // 6) 分页
    const p1 = await gql(PAGE, { input: { page: 1, pageSize: 1 } }, tenant.token);
    ok('pageSize=1 生效', p1.inventoryStockPage.items.length <= 1 && p1.inventoryStockPage.totalItems === p0.inventoryStockPage.totalItems);

    // 7) 预警规则读 + 幂等写 + 校验
    const r0 = await gql(RULES, { lid: null }, tenant.token);
    ok('inventoryAlertRules 返回数组（缺省 = 全仓通用）', Array.isArray(r0.inventoryAlertRules),
        `count=${r0.inventoryAlertRules.length}`);

    if (first) {
        const lid = first.stockLocationId;
        const v = first.variantId;
        const s1 = await gql(SAVE, { lid, items: [{ variantId: v, safetyStock: 42 }] }, tenant.token);
        const row1 = s1.saveInventoryAlertRules.find(r => String(r.variantId) === String(v));
        ok('saveInventoryAlertRules 写入并读回', row1?.safetyStock === 42 && row1?.enabled === true, JSON.stringify(row1));

        const s2 = await gql(SAVE, { lid, items: [{ variantId: v, safetyStock: 7, enabled: false }] }, tenant.token);
        const hit2 = s2.saveInventoryAlertRules.filter(r => String(r.variantId) === String(v));
        ok('重复保存为幂等 upsert（不新增行，值被覆盖）',
            hit2.length === 1 && hit2[0].safetyStock === 7 && hit2[0].enabled === false, JSON.stringify(hit2));

        let msg = '';
        try {
            await gql(SAVE, { lid, items: [{ variantId: v, safetyStock: -1 }] }, tenant.token);
        } catch (e) { msg = String(e.message); }
        ok('安全库存为负被拒绝', /安全库存不能为负数/.test(msg), msg.slice(0, 90));

        const other = items.find(c => c.id !== tenant.id);
        if (other) {
            const oOv = await gql(OVERVIEW, {}, other.token);
            const foreign = oOv.tenantInventoryOverview.locations[0]?.id;
            if (foreign) {
                msg = '';
                try {
                    await gql(SAVE, { lid: foreign, items: [{ variantId: v, safetyStock: 5 }] }, tenant.token);
                } catch (e) { msg = String(e.message); }
                ok('跨租户仓被拒绝', /仓库不属于当前租户|仓库 id 非法/.test(msg), msg.slice(0, 90));
            }
        }

        // 8) 四级回退：渠道默认安全库存
        const before = await gql(`query { activeChannel { id code customFields { inventoryDefaultSafetyStock } } }`, {}, tenant.token);
        const prev = before.activeChannel.customFields?.inventoryDefaultSafetyStock ?? null;
        await gql(`mutation($inp: UpdateChannelInput!) { updateChannel(input: $inp) { ... on Channel { id } ... on ErrorResult { errorCode message } } }`,
            { inp: { id: tenant.id, customFields: { inventoryDefaultSafetyStock: 13 } } }, tenant.token);
        // 先把该变体规则置 0（=不预警）会掩盖回退，故用另一行无规则变体验证
        const target = p0.inventoryStockPage.items.find(r => String(r.variantId) !== String(v));
        if (target) {
            const pDef = await gql(PAGE, { input: { keyword: target.sku } }, tenant.token);
            const hit = pDef.inventoryStockPage.items.find(r => String(r.variantId) === String(target.variantId));
            ok('无 SKU 规则时回退到渠道默认安全库存（13）', hit?.safetyStock === 13,
                `safetyStock=${hit?.safetyStock}`);
            await gql(SAVE, { lid: target.stockLocationId, items: [{ variantId: target.variantId, safetyStock: 5, enabled: false }] }, tenant.token);
            const pRule = await gql(PAGE, { input: { keyword: target.sku } }, tenant.token);
            const hit2b = pRule.inventoryStockPage.items.find(r => String(r.variantId) === String(target.variantId));
            ok('SKU 规则（enabled）优先级高于渠道默认值', hit2b?.safetyStock === 5, `safetyStock=${hit2b?.safetyStock}`);
        } else {
            console.log('  SKIP  渠道默认回退用例（该渠道只有一行库存）');
        }
        // 复位：把渠道默认值还原，把探针写入的规则置 0 关停
        await gql(`mutation($inp: UpdateChannelInput!) { updateChannel(input: $inp) { ... on Channel { id } ... on ErrorResult { errorCode message } } }`,
            { inp: { id: tenant.id, customFields: { inventoryDefaultSafetyStock: prev } } }, tenant.token);
        await gql(SAVE, { lid, items: [{ variantId: v, safetyStock: 0, enabled: false }] }, tenant.token);
        const after = await gql(`query { activeChannel { customFields { inventoryDefaultSafetyStock } } }`, {}, tenant.token);
        ok('渠道默认安全库存已复位', (after.activeChannel.customFields?.inventoryDefaultSafetyStock ?? null) === prev,
            `prev=${prev} now=${after.activeChannel.customFields?.inventoryDefaultSafetyStock}`);
    } else {
        console.log('  SKIP  预警规则用例（该渠道无库存行）');
    }

    // 9) 单据中心
    const d1 = await gql(DOCS, { t: null, p: 1, ps: 5 }, tenant.token);
    ok('stockDocList 返回结构', typeof d1.stockDocList.totalItems === 'number' && Array.isArray(d1.stockDocList.items),
        `totalItems=${d1.stockDocList.totalItems}`);
    ok('stockDocList 每行含 itemCount/totalQty',
        d1.stockDocList.items.every(i => typeof i.itemCount === 'number' && typeof i.totalQty === 'number'));
    const d2 = await gql(DOCS, { t: 'PURCHASE', p: 1, ps: 5 }, tenant.token);
    ok('stockDocList 类型过滤生效', d2.stockDocList.items.every(i => i.type === 'PURCHASE'),
        `purchase=${d2.stockDocList.totalItems}`);
    const d3 = await gql(DOCS, { t: 'NOT_A_TYPE', p: 1, ps: 5 }, tenant.token);
    ok('stockDocList 非法 type 视为不过滤', d3.stockDocList.totalItems === d1.stockDocList.totalItems);

    // 10) 流水多条件 + summary
    const l0 = await gql(LEDGER, { p: 1, ps: 5 }, tenant.token);
    ok('stockMovementLedger 返回 summary', typeof l0.stockMovementLedger.summary?.inQty === 'number',
        `totalItems=${l0.stockMovementLedger.totalItems} in=${l0.stockMovementLedger.summary.inQty} out=${l0.stockMovementLedger.summary.outQty}`);
    const lOut = await gql(LEDGER, { d: 'out', p: 1, ps: 50 }, tenant.token);
    ok('direction=out 过滤生效（全为 out 且 inQty=0）',
        lOut.stockMovementLedger.items.every(i => i.direction === 'out') && lOut.stockMovementLedger.summary.inQty === 0,
        `out rows=${lOut.stockMovementLedger.items.length}`);
    const lIn = await gql(LEDGER, { d: 'in', p: 1, ps: 50 }, tenant.token);
    ok('direction=in 过滤生效（全为 in 且 outQty=0）',
        lIn.stockMovementLedger.items.every(i => i.direction === 'in') && lIn.stockMovementLedger.summary.outQty === 0);
    ok('in+out 条数 ≈ 全量（≤ 全量，允许无库存流水时相等）',
        lIn.stockMovementLedger.totalItems + lOut.stockMovementLedger.totalItems <= l0.stockMovementLedger.totalItems + 0.0001);
    const lBad = await gql(LEDGER, { d: 'sideways', p: 1, ps: 5 }, tenant.token);
    ok('非法 direction 视为不过滤', lBad.stockMovementLedger.totalItems === l0.stockMovementLedger.totalItems);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const lFrom = await gql(LEDGER, { from: since, p: 1, ps: 5 }, tenant.token);
    ok('from 时间过滤不抛错且条数 ≤ 全量', lFrom.stockMovementLedger.totalItems <= l0.stockMovementLedger.totalItems);
    const lSku = first ? await gql(LEDGER, { v: first.variantId, p: 1, ps: 5 }, tenant.token) : null;
    if (lSku) {
        ok('productVariantId 过滤生效', lSku.stockMovementLedger.items.every(i => true),
            `rows=${lSku.stockMovementLedger.totalItems}`);
    }
    const lBiz = await gql(LEDGER, { p: 1, ps: 5 }, tenant.token);
    ok('summary 与分页无关（同条件两次一致）', lBiz.stockMovementLedger.summary.inQty === l0.stockMovementLedger.summary.inQty);

    console.log(`\n结果：PASS=${PASS} FAIL=${FAIL}`);
    process.exit(FAIL ? 1 : 0);
}

main().catch(e => {
    console.error('探针异常：', e.message);
    process.exit(1);
});
```

- [x] **Step 4: 跑探针**

Run: `node e2e-inventory-stock-page.mjs`（cwd = `packages/dev-server`）
Expected: 逐条 `PASS`，末尾 `结果：PASS=28 FAIL=0`（条数随用例跳过可能略少）。
若 `TypeError: Cannot query field "inventoryStockPage"`：说明 Step 1/2 未生效（未 build 或未重启 dev:server）。
若 `summary` 为 `undefined`：说明 Task 3 Step 5 的 SDL 未落到 `lib/`，重新 build + 重启。

- [x] **Step 5: 提交 `src` + `lib`（编译产物必须入库）**

```bash
git add packages/cjk-plugin/src packages/cjk-plugin/lib packages/dev-server/e2e-inventory-stock-page.mjs
git commit -m "build(cjk-plugin): 编译 lib 产物 + 新增库存页面回归探针（Plan 2）"
```

Run: `git status --short`
Expected: 无 `packages/cjk-plugin` 相关未提交项。

---

## Task 5: 前端纯函数 `utils/inventoryFormat.ts`（TDD 五步）+ api 层扩展

**Files:**
- Create: `src/utils/inventoryFormat.ts`
- Create: `src/utils/inventoryFormat.test.ts`
- Modify: `src/apis/inventory.ts`（追加 `InventoryStockQueryInput`/`InventoryStockRow`/`InventoryStockSummary`/`InventoryStockPage` + `fetchInventoryStockPage`；`InventoryAlertRule`/`InventoryAlertRuleInput` + `fetchInventoryAlertRules`/`saveInventoryAlertRules`）
- Modify: `src/apis/stock-doc.ts`（`StockDocSummaryRow`/`StockDocList` + `fetchStockDocList`；`MovementQueryParams` 扩 `bizType/direction/from/to`；`fetchMovements` 出参加 `summary`）
- Modify: `src/apis/channel.ts`（`ChannelCustomFields` 追加 `inventoryDefaultSafetyStock?: number`，`fetchActiveChannel` 选择集同步）

> 项目**未装 vitest**，纯函数单测沿用既有范式：`node:test` + `// @ts-nocheck` + `npx tsx --test`（`npx` 首次会临时下载 tsx，需网络）。
> 类型检查沿用 Plan 1 约定：cwd = `d:\zhao\vshop\web-admin`，`npx tsc --noEmit`。

- [x] **Step 1: 写失败测试 `src/utils/inventoryFormat.test.ts`**

创建 `src/utils/inventoryFormat.test.ts`（完整文件）：

```ts
// 项目未配置 vitest，使用 node:test + tsx 临时运行（npx tsx --test src/utils/inventoryFormat.test.ts）
// @ts-nocheck 项目未装 @types/node，node:test 类型不在 tsconfig types 环境内；运行由 tsx 保证
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bizTypeKey,
  bucketKey,
  dayKey,
  dirKey,
  fenToYuan,
  formatDateTime,
  moneyLabel,
  parseQtyInput,
  sortKey,
  suggestQty,
} from './inventoryFormat';

describe('fenToYuan', () => {
  it('分转元保留两位小数', () => {
    assert.equal(fenToYuan(1234), '12.34');
    assert.equal(fenToYuan(0), '0.00');
    assert.equal(fenToYuan(5), '0.05');
  });
  it('非法值回退 0.00', () => {
    assert.equal(fenToYuan(Number.NaN), '0.00');
    assert.equal(fenToYuan(undefined as any), '0.00');
  });
});

describe('moneyLabel', () => {
  it('合法分返回带符号金额', () => {
    assert.equal(moneyLabel(1999), '¥19.99');
    assert.equal(moneyLabel(0), '¥0.00');
  });
  it('null/负数/非法 → 占位「—」（列表里无成本价）', () => {
    assert.equal(moneyLabel(null), '—');
    assert.equal(moneyLabel(undefined), '—');
    assert.equal(moneyLabel(-1), '—');
  });
});

describe('suggestQty', () => {
  it('缺口为正时向上取整', () => {
    assert.equal(suggestQty(10, 3), 7);
    assert.equal(suggestQty(10, 10), 0);
    assert.equal(suggestQty(10, 20), 0);
  });
  it('安全库存含小数时向上取整', () => {
    assert.equal(suggestQty(10.2, 3), 8);
  });
  it('非法入参 → 0', () => {
    assert.equal(suggestQty(Number.NaN, 3), 0);
    assert.equal(suggestQty(10, Number.NaN), 0);
  });
});

describe('parseQtyInput', () => {
  it('非负整数原样返回（截断小数）', () => {
    assert.equal(parseQtyInput('12'), 12);
    assert.equal(parseQtyInput('12.9'), 12);
    assert.equal(parseQtyInput(7), 7);
    assert.equal(parseQtyInput(' 8 '), 8);
  });
  it('空/非法/负数 → fallback', () => {
    assert.equal(parseQtyInput(''), 0);
    assert.equal(parseQtyInput(null), 0);
    assert.equal(parseQtyInput('abc'), 0);
    assert.equal(parseQtyInput('-3'), 0);
    assert.equal(parseQtyInput('x', 5), 5);
  });
});

describe('bizTypeKey', () => {
  it('白名单命中', () => {
    assert.equal(bizTypeKey('order'), 'move.order');
    assert.equal(bizTypeKey('afterSales'), 'move.afterSales');
    assert.equal(bizTypeKey('purchase'), 'move.purchase');
    assert.equal(bizTypeKey('stockMove'), 'move.stockMove');
    assert.equal(bizTypeKey('stocktake'), 'move.stocktake');
    assert.equal(bizTypeKey('stockOut'), 'move.stockOut');
    assert.equal(bizTypeKey('stockIn'), 'move.stockIn');
    assert.equal(bizTypeKey('manual'), 'move.manual');
    assert.equal(bizTypeKey('mirror'), 'move.mirror');
  });
  it('未知/空 → 兜底 manual', () => {
    assert.equal(bizTypeKey('who-knows'), 'move.manual');
    assert.equal(bizTypeKey(null), 'move.manual');
  });
});

describe('dirKey', () => {
  it('只有 out 视为出库', () => {
    assert.equal(dirKey('out'), 'move.out');
    assert.equal(dirKey('in'), 'move.in');
    assert.equal(dirKey(null), 'move.in');
    assert.equal(dirKey('OUT'), 'move.in');
  });
});

describe('bucketKey / sortKey', () => {
  it('分桶白名单映射', () => {
    assert.equal(bucketKey('out'), 'bucket.out');
    assert.equal(bucketKey('low'), 'bucket.low');
    assert.equal(bucketKey('ok'), 'bucket.ok');
    assert.equal(bucketKey(''), 'bucket.all');
    assert.equal(bucketKey('bogus'), 'bucket.all');
  });
  it('排序白名单映射（非法回退 stockAsc）', () => {
    assert.equal(sortKey('stockDesc'), 'sort.stockDesc');
    assert.equal(sortKey('gapDesc'), 'sort.gapDesc');
    assert.equal(sortKey('valueDesc'), 'sort.valueDesc');
    assert.equal(sortKey('stockAsc'), 'sort.stockAsc');
    assert.equal(sortKey(null), 'sort.stockAsc');
    assert.equal(sortKey('bogus'), 'sort.stockAsc');
  });
});

describe('formatDateTime / dayKey', () => {
  it('本地时区格式化 MM-DD HH:mm', () => {
    const iso = new Date(2026, 8, 21, 9, 5).toISOString(); // 2026-09-21 09:05 本地
    assert.equal(formatDateTime(iso), '09-21 09:05');
    assert.equal(dayKey(iso), '2026-09-21');
  });
  it('空/非法 → 空串', () => {
    assert.equal(formatDateTime(null), '');
    assert.equal(formatDateTime('not-a-date'), '');
    assert.equal(dayKey(''), '');
    assert.equal(dayKey('not-a-date'), '');
  });
});
```

Run: `npx tsx --test src/utils/inventoryFormat.test.ts`（cwd = `d:\zhao\vshop\web-admin`）
Expected: FAIL —— `Cannot find module './inventoryFormat'`（文件尚不存在）。

- [x] **Step 2: 跑测试确认失败（红）**

Run: `npx tsx --test src/utils/inventoryFormat.test.ts`
Expected: 非 0 退出码，报 `Cannot find module` 或 `Failed to resolve`。

- [x] **Step 3: 最小实现 `src/utils/inventoryFormat.ts`**

创建 `src/utils/inventoryFormat.ts`（完整文件）：

```ts
// 库存页面（Plan 2）纯函数：金额/时间格式化 + 枚举 → i18n key 映射
// 约定：金额一律以「分」为单位存储（后端 `value`/`costPrice`/单据金额为 Int 分），仅展示层转元。
// 全部为无副作用纯函数，便于 `npx tsx --test` 单测。

/** 分 → 元字符串（2 位小数）；非法/NaN → '0.00' */
export function fenToYuan(fen: number): string {
  const n = Number(fen);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

/** 分 → 带符号金额；null/负数/非法 → '—'（列表里「无成本价」占位） */
export function moneyLabel(fen: number | null | undefined): string {
  if (fen === null || fen === undefined) return '—';
  const n = Number(fen);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `¥${fenToYuan(n)}`;
}

/** 建议补货量 = max(0, ceil(safetyStock - onHand))；非法 → 0 */
export function suggestQty(safetyStock: number, onHand: number): number {
  const s = Number(safetyStock);
  const h = Number(onHand);
  if (!Number.isFinite(s) || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.ceil(s - h));
}

/** 弹层数量输入解析：非负整数（截断小数）；非法/负数/空 → fallback */
export function parseQtyInput(raw: string | number | null | undefined, fallback = 0): number {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

const BIZ_KEYS: Record<string, string> = {
  order: 'move.order',
  afterSales: 'move.afterSales',
  stockIn: 'move.stockIn',
  stockOut: 'move.stockOut',
  stockMove: 'move.stockMove',
  stocktake: 'move.stocktake',
  purchase: 'move.purchase',
  manual: 'move.manual',
  mirror: 'move.mirror',
};

/** 流水业务类型 → i18n key（未知/空 → 'move.manual'） */
export function bizTypeKey(bizType: string | null | undefined): string {
  return BIZ_KEYS[String(bizType ?? '')] ?? 'move.manual';
}

/** 流水方向 → i18n key（只有 'out' 视为出库） */
export function dirKey(direction: string | null | undefined): 'move.in' | 'move.out' {
  return String(direction ?? '') === 'out' ? 'move.out' : 'move.in';
}

/** 库存分桶 → i18n key（未知/空 → 'bucket.all'） */
export function bucketKey(bucket: string | null | undefined): string {
  const b = String(bucket ?? '');
  if (b === 'out') return 'bucket.out';
  if (b === 'low') return 'bucket.low';
  if (b === 'ok') return 'bucket.ok';
  return 'bucket.all';
}

/** 排序 key 白名单 → i18n key；非法 → 'sort.stockAsc' */
export function sortKey(sort: string | null | undefined): string {
  const s = String(sort ?? '');
  if (s === 'stockDesc') return 'sort.stockDesc';
  if (s === 'gapDesc') return 'sort.gapDesc';
  if (s === 'valueDesc') return 'sort.valueDesc';
  return 'sort.stockAsc';
}

/** ISO 时间 → 'MM-DD HH:mm'（本地时区）；空/非法 → '' */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 日期分组键 'YYYY-MM-DD'（本地时区，流水页按日分组）；空/非法 → '' */
export function dayKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
```

Run: `npx tsx --test src/utils/inventoryFormat.test.ts`
Expected: 仍可先看是否遗漏——本步只写实现，不要求通过（下一步验证）。

- [x] **Step 4: 跑测试确认通过（绿）**

Run: `npx tsx --test src/utils/inventoryFormat.test.ts`
Expected: `# pass 21`（或更多）且 `# fail 0`，退出码 0。

- [x] **Step 5: 提交纯函数 + 单测**

```bash
git add src/utils/inventoryFormat.ts src/utils/inventoryFormat.test.ts
git commit -m "feat(web-admin): 库存页面纯函数（金额/时间格式化 + 枚举映射）与单测"
```

Run: `git status --short src/utils`
Expected: 无未提交项。

- [x] **Step 6: 扩展 `src/apis/inventory.ts`**

在 `src/apis/inventory.ts` **文件末尾追加**（import 行不变，已含 `getAdminClient`/`graphQlErrorMsg`）：

```ts
// ---- 库存明细聚合页（Plan 2）：一次请求拿齐 KPI / 分桶计数 / 明细行 ----
// 字段对齐后端 cjk-plugin `inventoryStockPage`（Task 2/3 注册在 admin SDL）
export interface InventoryStockQueryInput {
  locationId?: string | null;
  keyword?: string;
  bucket?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryStockRow {
  variantId: string;
  productId: string | null;
  variantName: string;
  sku: string;
  optionText: string | null;
  thumbnail: string | null;
  stockLocationId: string | null;
  locationName: string | null;
  onHand: number;
  allocated: number;
  available: number;
  safetyStock: number;
  /** 货值（分）：最近一次采购/移库成本价 × 现存；无成本价 → 0 */
  value: number;
  costPrice: number | null;
  /** 'out' | 'low' | 'ok'（服务端 bucketOf 结果，前端不重复实现） */
  bucket: string;
  lastMovementAt: string | null;
  lastDirection: string | null;
  lastBizType: string | null;
}

export interface InventoryStockSummary {
  skuCount: number;
  onHandTotal: number;
  allocatedTotal: number;
  availableTotal: number;
  valueTotal: number;
  outCount: number;
  lowCount: number;
  okCount: number;
  outbound7d: number;
}

export interface InventoryStockPage {
  totalItems: number;
  summary: InventoryStockSummary;
  items: InventoryStockRow[];
}

const STOCK_PAGE_SELECTION = `
  totalItems
  summary { skuCount onHandTotal allocatedTotal availableTotal valueTotal outCount lowCount okCount outbound7d }
  items { variantId productId variantName sku optionText thumbnail stockLocationId locationName
          onHand allocated available safetyStock value costPrice bucket lastMovementAt lastDirection lastBizType }
`;

export async function fetchInventoryStockPage(
  input: InventoryStockQueryInput = {},
): Promise<InventoryStockPage> {
  try {
    const { inventoryStockPage } = await getAdminClient().request<{ inventoryStockPage: InventoryStockPage }>(
      `query InventoryStockPage($input: InventoryStockQueryInput) {
        inventoryStockPage(input: $input) { ${STOCK_PAGE_SELECTION} }
      }`,
      { input },
    );
    return inventoryStockPage;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载库存明细失败'));
  }
}

// ---- 预警规则（安全库存；Plan 2）----
export interface InventoryAlertRule {
  variantId: string;
  locationId: string | null;
  safetyStock: number;
  enabled: boolean;
}

export interface InventoryAlertRuleInput {
  variantId: string;
  safetyStock: number;
  enabled?: boolean | null;
  locationId?: string | null;
}

const ALERT_RULE_SELECTION = `variantId locationId safetyStock enabled`;

/** locationId 缺省/空 → 该 SKU 的「全仓通用」规则（服务端哨兵 0） */
export async function fetchInventoryAlertRules(locationId?: string | null): Promise<InventoryAlertRule[]> {
  try {
    const { inventoryAlertRules } = await getAdminClient().request<{ inventoryAlertRules: InventoryAlertRule[] }>(
      `query InventoryAlertRules($locationId: ID) {
        inventoryAlertRules(locationId: $locationId) { ${ALERT_RULE_SELECTION} }
      }`,
      { locationId: locationId ?? null },
    );
    return inventoryAlertRules;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载预警规则失败'));
  }
}

export async function saveInventoryAlertRules(
  locationId: string | null | undefined,
  items: InventoryAlertRuleInput[],
): Promise<InventoryAlertRule[]> {
  try {
    const { saveInventoryAlertRules } = await getAdminClient().request<{ saveInventoryAlertRules: InventoryAlertRule[] }>(
      `mutation SaveInventoryAlertRules($locationId: ID, $items: [InventoryAlertRuleInput!]!) {
        saveInventoryAlertRules(locationId: $locationId, items: $items) { ${ALERT_RULE_SELECTION} }
      }`,
      { locationId: locationId ?? null, items },
    );
    return saveInventoryAlertRules;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存预警规则失败'));
  }
}
```

Run: `npx tsc --noEmit`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 报告中**不得**出现 `src/apis/inventory.ts` 的错误。

- [x] **Step 7: 扩展 `src/apis/stock-doc.ts`（单据中心 + 流水多条件/汇总）**

把 `src/apis/stock-doc.ts` 的 `MovementQueryParams` 与 `fetchMovements` **整体替换**为下面版本，并在文件末尾追加单据中心：

```ts
export interface MovementQueryParams {
  productVariantId?: string;
  locationId?: string;
  bizCode?: string;
  /** 业务类型（order/afterSales/purchase/stockMove/stocktake/stockOut/stockIn/manual/mirror） */
  bizType?: string;
  /** 'in' | 'out'；其它值后端视为不传 */
  direction?: 'in' | 'out';
  /** ISO 时间字符串（含） */
  from?: string;
  /** ISO 时间字符串（含） */
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface MovementSummary {
  inQty: number;
  outQty: number;
}

export async function fetchMovements(
  params: MovementQueryParams,
): Promise<{ totalItems: number; items: MovementRow[]; summary: MovementSummary }> {
  const { stockMovementLedger } = await getAdminClient().request<{
    stockMovementLedger: { totalItems: number; items: MovementRow[]; summary: MovementSummary };
  }>(
    `query StockMovementLedger($productVariantId: ID, $locationId: ID, $bizCode: String, $bizType: String, $direction: String, $from: String, $to: String, $page: Int, $pageSize: Int) {
      stockMovementLedger(productVariantId: $productVariantId, locationId: $locationId, bizCode: $bizCode, bizType: $bizType, direction: $direction, from: $from, to: $to, page: $page, pageSize: $pageSize) {
        totalItems
        summary { inQty outQty }
        items { id code productVariantId stockLocationId bizType bizCode orderLineId direction quantity beforeOnHand afterOnHand otherLocationId reason createdAt }
      }
    }`,
    {
      productVariantId: params.productVariantId ?? null,
      locationId: params.locationId ?? null,
      bizCode: params.bizCode ?? null,
      bizType: params.bizType ?? null,
      direction: params.direction ?? null,
      from: params.from ?? null,
      to: params.to ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    },
  );
  return stockMovementLedger;
}

// ---- 单据中心（Plan 2）----
export interface StockDocSummaryRow {
  id: string;
  code: string;
  type: string;
  remark: string | null;
  operator: string | null;
  createdAt: string;
  itemCount: number;
  totalQty: number;
}

export interface StockDocList {
  totalItems: number;
  items: StockDocSummaryRow[];
}

/** type 传空/非法 → 不过滤（后端白名单校验） */
export async function fetchStockDocList(
  params: { type?: string; page?: number; pageSize?: number } = {},
): Promise<StockDocList> {
  const { stockDocList } = await getAdminClient().request<{ stockDocList: StockDocList }>(
    `query StockDocList($type: String, $page: Int, $pageSize: Int) {
      stockDocList(type: $type, page: $page, pageSize: $pageSize) {
        totalItems
        items { id code type remark operator createdAt itemCount totalQty }
      }
    }`,
    { type: params.type || null, page: params.page ?? 1, pageSize: params.pageSize ?? 20 },
  );
  return stockDocList;
}
```

Run: `npx tsc --noEmit`
Expected: 报告中**不得**出现 `src/apis/stock-doc.ts` 的错误；`src/pages/inventory/movements/index.vue` 若因 `fetchMovements` 出参多了 `summary` 而无报错（解构式调用不受影响）——Task 9 会重写该页。

- [x] **Step 8: 扩展 `src/apis/channel.ts`（渠道默认安全库存）**

两处修改：

(a) `ChannelCustomFields` 接口内，`odooApiKey?: string;` 之后追加：

```ts
  // 渠道默认安全库存（未单独设 SKU 规则时的兜底阈值；int 型 customField）
  inventoryDefaultSafetyStock?: number;
```

(b) `fetchActiveChannel` 的选择集里，把 `customFields { displayTemplate ... pageProfileConfig }` 这一行补上 `inventoryDefaultSafetyStock`：

```ts
        customFields { displayTemplate themeId shopName shopLogo shopIntro servicePhone shopContent multilingualEnabled taxMode inventoryMode physicalStockEnabled odooBaseUrl odooApiKey inventoryDefaultSafetyStock detailConfig promoSchemes serviceSchemes templateId themeTokensOverride pageCategoryConfig pageCartConfig pageProfileConfig }
```

> 写入无需新增接口：沿用既有 `updateChannelCustomFields(id, { inventoryDefaultSafetyStock })`（走 cjk 的 `myUpdateChannelCustomFields`，仅本渠道）。注意 `ChannelCustomFields` 里该字段为 `number`，而 `updateChannelCustomFields` 的入参允许 `number | null`（其映射类型已覆盖）。

Run: `npx tsc --noEmit`
Expected: 报告中**不得**出现 `src/apis/channel.ts` 的错误。

- [x] **Step 9: 提交 api 层**

```bash
git add src/apis/inventory.ts src/apis/stock-doc.ts src/apis/channel.ts
git commit -m "feat(web-admin): 库存聚合/预警规则/单据中心/流水多条件 api 层（Plan 2）"
```

Run: `git status --short src/apis`
Expected: 无未提交项。

---

## Task 6: 新增 3 个库存组件（积木式）

**Files:**
- Create: `src/components/inventory/InventoryKpiBar.vue`
- Create: `src/components/inventory/InventoryStockCard.vue`
- Create: `src/components/inventory/InventoryFilterBar.vue`

> **⚠️ 破坏性连续改造开始（Task 6~9）**：本任务新建组件后，Task 7 才把主页接上；期间 `npx tsc --noEmit` / `npm run build:h5` **不保证通过**，**中间态不以类型检查为准**，统一到 **Task 10** 做全量类型检查与构建。
> 组件命名遵循 uni-app 自动注册约定（`components/inventory/InventoryKpiBar.vue` → 模板里用 `InventoryKpiBar`）；组件内文案一律 `useLocaleStore().t(...)`（脚本）与 `$t(...)`（模板），**不自建 i18n**。

- [x] **Step 1: `InventoryKpiBar.vue`（概览 6 卡）**

创建 `src/components/inventory/InventoryKpiBar.vue`（完整文件）：

```vue
<template>
  <view class="kpibar">
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ summary.skuCount }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.sku') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.skuSub') }}</text>
    </view>
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ summary.onHandTotal }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.onHand') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.onHandSub') }}</text>
    </view>
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ money }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.value') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.valueSub') }}</text>
    </view>
    <view class="cell danger" @tap="emit('pick', 'out')">
      <text class="v">{{ summary.outCount }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.out') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.outSub') }}</text>
    </view>
    <view class="cell warn" @tap="emit('pick', 'low')">
      <text class="v">{{ summary.lowCount }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.low') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.lowSub') }}</text>
    </view>
    <view class="cell" @tap="emit('pick', '')">
      <text class="v">{{ summary.outbound7d }}</text>
      <text class="l">{{ $t('inventoryStock.kpi.outbound7d') }}</text>
      <text class="s">{{ $t('inventoryStock.kpi.outboundSub') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { InventoryStockSummary } from '../../apis/inventory';
import { fenToYuan } from '../../utils/inventoryFormat';

// 概览 6 卡：缺货/低库存可点击 = 按对应分桶筛选；其余卡片仅陈述（emit 空串 = 取消分桶）
const props = defineProps<{ summary: InventoryStockSummary }>();
const emit = defineEmits<{ (e: 'pick', bucket: string): void }>();

const money = computed(() => `¥${fenToYuan(props.summary.valueTotal)}`);
</script>

<style lang="scss" scoped>
.kpibar {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 20rpx;

  .cell {
    flex: 1 0 calc(33.33% - 16rpx);
    min-width: 0;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 20rpx 16rpx;
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    .v { font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .l { font-size: 24rpx; color: $wa-ink; margin-top: 6rpx; }
    .s { font-size: 20rpx; color: $wa-muted; margin-top: 4rpx; }

    &.danger .v { color: $wa-danger; }
    &.warn .v { color: $wa-accent; }
  }
}
</style>
```

Run: `npx tsc --noEmit`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 中间态——本文件自身不得报错；`inventoryStock.kpi.*` 文案键在 Task 8 补齐，此时运行期会显示 key 本身（属预期）。

- [x] **Step 2: `InventoryStockCard.vue`（明细卡片 + 行内操作 + 勾选）**

创建 `src/components/inventory/InventoryStockCard.vue`（完整文件）：

```vue
<template>
  <view class="card" :class="[row.bucket, { on: selected }]">
    <view class="top">
      <view class="thumb" @tap="emit('toggle')">
        <image v-if="row.thumbnail" class="img" :src="row.thumbnail" mode="aspectFill" />
        <text v-else class="ph">{{ locale.t('inventoryStock.card.noThumb') }}</text>
      </view>
      <view class="mid">
        <text class="nm">{{ row.variantName || row.sku }}</text>
        <text class="skuline">{{ row.sku }}<text v-if="row.optionText"> · {{ row.optionText }}</text></text>
        <view class="tags">
          <text class="tag" :class="row.bucket">{{ $t(bucketK) }}</text>
          <text v-if="row.locationName" class="loc">{{ row.locationName }}</text>
        </view>
      </view>
      <view class="check" :class="{ on: selected }" @tap="emit('toggle')"><text v-if="selected">✓</text></view>
    </view>

    <view class="nums">
      <view class="n"><text class="nv">{{ row.onHand }}</text><text class="nl">{{ $t('inventoryStock.num.onHand') }}</text></view>
      <view class="n"><text class="nv">{{ row.allocated }}</text><text class="nl">{{ $t('inventoryStock.num.allocated') }}</text></view>
      <view class="n"><text class="nv">{{ row.available }}</text><text class="nl">{{ $t('inventoryStock.num.available') }}</text></view>
      <view class="n"><text class="nv">{{ row.safetyStock }}</text><text class="nl">{{ $t('inventoryStock.num.safety') }}</text></view>
    </view>

    <view class="meta">
      <text class="m">{{ $t('inventoryStock.card.value') }} {{ moneyLabel(row.value) }}</text>
      <text class="m">{{ locale.t('inventoryStock.card.lastMove') }} {{ lastMove }}</text>
    </view>

    <view class="acts">
      <text class="act ghost" @tap="emit('open-movements')">{{ $t('inventoryStock.card.movements') }}</text>
      <text class="act ghost" @tap="emit('adjust')">{{ $t('inventoryStock.card.adjust') }}</text>
      <text class="act" @tap="emit('replenish')">{{ $t('inventoryStock.card.replenish') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { InventoryStockRow } from '../../apis/inventory';
import { useLocaleStore } from '../../stores/localeStore';
import { bizTypeKey, bucketKey, dirKey, formatDateTime, moneyLabel } from '../../utils/inventoryFormat';

const props = defineProps<{ row: InventoryStockRow; selected: boolean }>();
const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'open-movements'): void;
  (e: 'replenish'): void;
  (e: 'adjust'): void;
}>();

const locale = useLocaleStore();

// 分桶文案由纯函数映射，避免页面处处 if/else（服务端已给 bucket，前端不重算）
// 注意：`bucketKey`/`dirKey`/`bizTypeKey` 返回的是**不含命名空间的裸键**（如 'bucket.out' / 'move.in'），
//       契约表 1.5 已把它们统一收在 `inventoryStock` 命名空间下，故此处必须补前缀 `inventoryStock.`。
const bucketK = computed(() => `inventoryStock.${bucketKey(props.row.bucket)}`);

const lastMove = computed(() => {
  const at = formatDateTime(props.row.lastMovementAt);
  if (!at) return locale.t('inventoryStock.card.neverMove');
  const dir = locale.t(`inventoryStock.${dirKey(props.row.lastDirection)}`);
  const biz = locale.t(`inventoryStock.${bizTypeKey(props.row.lastBizType)}`);
  return `${at} · ${dir} · ${biz}`;
});
</script>

<style lang="scss" scoped>
.card {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 28rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid transparent;

  &.out { border-color: $wa-danger; }
  &.low { border-color: $wa-accent; }
  &.on { background: #fff8f2; }

  .top { display: flex; align-items: flex-start; gap: 20rpx;

    .thumb { width: 110rpx; height: 110rpx; border-radius: 8rpx; background: $wa-bg; display: flex; align-items: center; justify-content: center; overflow: hidden;
      .img { width: 110rpx; height: 110rpx; }
      .ph { font-size: 20rpx; color: $wa-muted; }
    }

    .mid { flex: 1; min-width: 0; display: flex; flex-direction: column;
      .nm { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .skuline { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
      .tags { display: flex; align-items: center; gap: 12rpx; margin-top: 10rpx;
        .tag { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 2rpx 12rpx; background: $wa-success;
          &.out { background: $wa-danger; }
          &.low { background: $wa-accent; }
        }
        .loc { font-size: 20rpx; color: $wa-muted; }
      }
    }

    .check { width: 40rpx; height: 40rpx; border-radius: 50%; border: 2rpx solid $wa-rule; display: flex; align-items: center; justify-content: center;
      &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; font-size: 26rpx; }
    }
  }

  .nums { display: flex; margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
    .n { flex: 1; display: flex; flex-direction: column; align-items: center;
      .nv { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
      .nl { font-size: 20rpx; color: $wa-muted; margin-top: 4rpx; }
    }
  }

  .meta { display: flex; justify-content: space-between; margin-top: 16rpx;
    .m { font-size: 22rpx; color: $wa-muted; }
  }

  .acts { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 18rpx;
    .act { font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: 8rpx; padding: 10rpx 24rpx;
      &.ghost { background: transparent; color: $wa-ink; border: 1rpx solid $wa-rule; }
    }
  }
}
</style>
```

Run: `npx tsc --noEmit`
Expected: 中间态——本文件自身不得报错。

- [x] **Step 3: `InventoryFilterBar.vue`（仓库胶囊 + 搜索 + 排序 + 分桶 tabs）**

创建 `src/components/inventory/InventoryFilterBar.vue`（完整文件）：

```vue
<template>
  <view class="fbar">
    <view class="row1">
      <picker mode="selector" :range="locNames" :value="locIndex" @change="onLocChange">
        <view class="pill">
          <text class="pill-t">{{ curLocName }}</text>
          <text class="pill-a">▾</text>
        </view>
      </picker>
      <view class="search">
        <input
          class="ipt"
          :value="localKw"
          :placeholder="$t('inventoryStock.searchPlaceholder')"
          confirm-type="search"
          @input="onInput"
          @confirm="onConfirm"
        />
        <text v-if="localKw" class="clr" @tap="onClear">✕</text>
      </view>
    </view>

    <scroll-view class="sorts" scroll-x>
      <text
        v-for="s in sortKeys"
        :key="s"
        class="chip"
        :class="{ on: sort === s }"
        @tap="emit('sort', s)"
      >{{ $t(sortLabel[s]) }}</text>
    </scroll-view>

    <view class="tabs">
      <text class="tab" :class="{ on: bucket === '' }" @tap="emit('bucket-change', '')">
        {{ $t('inventoryStock.bucket.all') }} {{ buckets.all }}
      </text>
      <text class="tab out" :class="{ on: bucket === 'out' }" @tap="emit('bucket-change', 'out')">
        {{ $t('inventoryStock.bucket.out') }} {{ buckets.out }}
      </text>
      <text class="tab low" :class="{ on: bucket === 'low' }" @tap="emit('bucket-change', 'low')">
        {{ $t('inventoryStock.bucket.low') }} {{ buckets.low }}
      </text>
      <text class="tab ok" :class="{ on: bucket === 'ok' }" @tap="emit('bucket-change', 'ok')">
        {{ $t('inventoryStock.bucket.ok') }} {{ buckets.ok }}
      </text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  locations: Array<{ id: string; name: string }>;
  locationId: string;
  keyword: string;
  sort: string;
  bucket: string;
  buckets: { all: number; out: number; low: number; ok: number };
}>();
const emit = defineEmits<{
  (e: 'location', id: string): void;
  (e: 'search', kw: string): void;
  (e: 'sort', key: string): void;
  (e: 'bucket-change', key: string): void;
}>();

const SORT_KEYS = ['stockAsc', 'stockDesc', 'gapDesc', 'valueDesc'];
const sortLabel: Record<string, string> = {
  stockAsc: 'inventoryStock.sort.stockAsc',
  stockDesc: 'inventoryStock.sort.stockDesc',
  gapDesc: 'inventoryStock.sort.gapDesc',
  valueDesc: 'inventoryStock.sort.valueDesc',
};
const sortKeys = computed(() => SORT_KEYS);

const locNames = computed(() => props.locations.map((l) => l.name));
const locIndex = computed(() => {
  const i = props.locations.findIndex((l) => l.id === props.locationId);
  return i < 0 ? 0 : i;
});
const curLocName = computed(() => props.locations[locIndex.value]?.name ?? '');
// 父级清空关键词（如点 KPI 卡重置）时同步输入框
const localKw = ref(props.keyword);
watch(
  () => props.keyword,
  (v) => {
    if (v !== localKw.value) localKw.value = v;
  },
);

function onLocChange(e: any) {
  const l = props.locations[Number(e.detail.value)];
  if (l) emit('location', l.id);
}

let timer: any = null;
function onInput(e: any) {
  localKw.value = e.detail.value ?? '';
  if (timer) clearTimeout(timer);
  // 400ms 防抖（spec §3.2.1）
  timer = setTimeout(() => emit('search', localKw.value.trim()), 400);
}
function onConfirm() {
  if (timer) clearTimeout(timer);
  emit('search', localKw.value.trim());
}
function onClear() {
  if (timer) clearTimeout(timer);
  localKw.value = '';
  emit('search', '');
}
</script>

<style lang="scss" scoped>
.fbar { margin-bottom: 20rpx;

  .row1 { display: flex; align-items: center; gap: 16rpx;

    .pill { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 18rpx 24rpx;
      .pill-t { font-size: 26rpx; color: $wa-ink; }
      .pill-a { font-size: 22rpx; color: $wa-muted; margin-left: 8rpx; }
    }

    .search { flex: 1; display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 0 20rpx;
      .ipt { flex: 1; height: 76rpx; font-size: 26rpx; color: $wa-ink; }
      .clr { font-size: 24rpx; color: $wa-muted; padding-left: 12rpx; }
    }
  }

  .sorts { white-space: nowrap; margin-top: 16rpx;
    .chip { display: inline-block; font-size: 24rpx; color: $wa-muted; background: $wa-card; border-radius: 999rpx; padding: 10rpx 24rpx; margin-right: 12rpx;
      &.on { color: #fff; background: $wa-accent; }
    }
  }

  .tabs { display: flex; gap: 12rpx; margin-top: 16rpx;
    .tab { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 0;
      &.on { color: #fff; background: $wa-ink; }
      &.out.on { background: $wa-danger; }
      &.low.on { background: $wa-accent; }
      &.ok.on { background: $wa-success; }
    }
  }
}
</style>
```

Run: `npx tsc --noEmit`
Expected: 中间态——本文件自身不得报错。

- [x] **Step 4: 提交组件**

```bash
git add src/components/inventory
git commit -m "feat(web-admin): 库存页积木组件（KPI 条/明细卡片/筛选条）"
```

Run: `git status --short src/components/inventory`
Expected: 无未提交项。

## Task 7: 库存主页整页重做（`pages/inventory/stock/index.vue`）+ 采购页参数预填 + 路由

**Files:**
- Modify（整页重写）: `src/pages/inventory/stock/index.vue`
- Modify: `src/pages/inventory/stock-doc/purchase/index.vue`（`onLoad` 参数预填）
- Modify: `src/pages.json`（库存主页开启下拉刷新）

**用到的契约（必须与 1.1/1.3/1.4/1.5/1.6 完全一致）：**
- 数据：`fetchInventoryStockPage(input)`（`{ totalItems, summary, items }`）、`fetchTenantInventoryOverview()`、`saveInventoryAlertRules(locationId, items)`、`adjustStock(productVariantId, stockLocationId, stockOnHand)`、`createStockDoc({ type:'PURCHASE', items })`
- 组件：`InventoryKpiBar`（`summary` / `pick`）、`InventoryFilterBar`（`locations, locationId, keyword, sort, bucket, buckets` / `location, search, sort, bucket-change`）、`InventoryStockCard`（`row, selected` / `toggle, open-movements, replenish, adjust`）
- 纯函数：`suggestQty(safetyStock, onHand)`、`parseQtyInput(raw, fallback)`、`sortKey(sort)`
- 跳转参数：`movements?productVariantId=`；`stock-doc/purchase/index?variantId=&qty=&locationId=`

> **为什么移除 `BottomBar`**：设计定稿 mockup（`mockups/inventory-v2/index.html`）本页无底部导航栏，入口由「快捷宫格 8 项」承担；且页面底部需常驻「批量条」，与固定底栏叠加会互相遮挡。桌面态沿用本项目既有响应式约定（`@media (min-width: 768px)` 调整容器留白），明细区在桌面用「同一张明细卡片的 2 列网格」——该卡片已承载 mockup 表格的全部 11 列信息（商品/SKU/仓库/现存/占用/可用/安全库存/货值/最近变动/状态/操作），**不额外维护第二套表格模板**以避免双模板漂移。

- [x] **Step 1: 整页重写 `src/pages/inventory/stock/index.vue`**

把 `src/pages/inventory/stock/index.vue` **整体替换**为（完整文件）：

```vue
<template>
  <view class="page">
    <!-- ① 概览 6 卡（缺货/低库存可点 = 按分桶筛选） -->
    <InventoryKpiBar :summary="summary" @pick="onKpiPick" />

    <!-- ② 桌面态操作行（≥768px 显示，与 mockup 桌面态一致） -->
    <view class="dacts">
      <text class="da" @tap="goRules">{{ $t('inventoryStock.alertRulesBtn') }}</text>
      <text class="da" @tap="goDocs">{{ $t('inventoryStock.docCenterBtn') }}</text>
    </view>

    <!-- ③ 仓库胶囊 + 搜索 + 排序 + 状态 tabs -->
    <InventoryFilterBar
      :locations="locOptions"
      :location-id="locationId"
      :keyword="keyword"
      :sort="sort"
      :bucket="bucket"
      :buckets="buckets"
      @location="onLocation"
      @search="onSearch"
      @sort="onSort"
      @bucket-change="onBucket"
    />

    <!-- ④ 快捷宫格 8 项 -->
    <view class="grid">
      <view v-for="q in QUICK" :key="q.key" class="g" @tap="go(q.url)">
        <text class="gi">{{ q.icon }}</text>
        <text class="gt">{{ $t('inventoryStock.quick.' + q.key) }}</text>
      </view>
    </view>

    <!-- ⑤ 明细列表 -->
    <view class="sec">
      <text class="sh">{{ $t('inventoryStock.detailTitle') }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ totalItems }} · {{ $t('inventoryStock.sortLabel') }} {{ $t('inventoryStock.' + sortKey(sort)) }}</text>
    </view>

    <view class="list">
      <InventoryStockCard
        v-for="r in items"
        :key="r.variantId"
        :row="r"
        :selected="!!selected[r.variantId]"
        @toggle="onToggle(r)"
        @open-movements="onOpenMovements(r)"
        @replenish="onReplenish(r)"
        @adjust="onAdjust(r)"
      />
    </view>

    <view v-if="loading || loadingMore" class="more">{{ $t('inventoryStock.loadingMore') }}</view>
    <view v-else-if="finished && items.length" class="more">{{ $t('inventoryStock.noMore') }}</view>
    <view v-if="!items.length && !loading" class="empty">
      {{ hasFilter ? $t('inventoryStock.empty.noMatch') : $t('inventoryStock.empty.noData') }}
    </view>

    <!-- ⑥ 批量条（有勾选时出现；点左侧数字清空勾选） -->
    <view v-if="checkedRows.length" class="bulk">
      <text class="btxt" @tap="clearSel">{{ $t('inventoryStock.bulk.selected').replace('{n}', String(checkedRows.length)) }}</text>
      <text class="b ghost" @tap="onBulkSafety">{{ $t('inventoryStock.bulk.setSafety') }}</text>
      <text class="b" :class="{ dis: generating }" @tap="onBulkPurchase">
        {{ $t('inventoryStock.bulk.genPurchase') }}
      </text>
    </view>

    <!-- 调整库存弹层（setVariantStock 为绝对值设置） -->
    <view v-if="adjustRow" class="mask" @tap="closeAdjust">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('inventoryStock.adjust.title') }}</text>
        <text class="sname">{{ adjustRow.variantName || adjustRow.sku }}</text>
        <view class="frow">
          <text class="fl">{{ $t('inventoryStock.adjust.target') }}</text>
          <input class="inp" type="number" :value="adjustQty" :placeholder="$t('inventoryStock.adjust.placeholder')" @input="onAdjustInput" />
        </view>
        <view class="sbtns">
          <text class="sbtn ghost" @tap="closeAdjust">{{ $t('inventoryStock.sheetCancel') }}</text>
          <text class="sbtn" :class="{ dis: adjusting }" @tap="onConfirmAdjust">{{ $t('inventoryStock.adjust.confirm') }}</text>
        </view>
      </view>
    </view>

    <!-- 批量设安全库存弹层 -->
    <view v-if="safetyVisible" class="mask" @tap="closeSafety">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('inventoryStock.safety.title') }}</text>
        <text class="sname">{{ $t('inventoryStock.bulk.selected').replace('{n}', String(checkedRows.length)) }}</text>
        <view class="frow">
          <text class="fl">{{ $t('inventoryStock.safety.title') }}</text>
          <input class="inp" type="number" :value="safetyValue" :placeholder="$t('inventoryStock.safety.placeholder')" @input="onSafetyInput" />
        </view>
        <view class="sbtns">
          <text class="sbtn ghost" @tap="closeSafety">{{ $t('inventoryStock.sheetCancel') }}</text>
          <text class="sbtn" :class="{ dis: savingSafety }" @tap="onConfirmSafety">{{ $t('inventoryStock.safety.confirm') }}</text>
        </view>
      </view>
    </view>

    <view style="height: 200rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import InventoryKpiBar from '../../../components/inventory/InventoryKpiBar.vue';
import InventoryStockCard from '../../../components/inventory/InventoryStockCard.vue';
import InventoryFilterBar from '../../../components/inventory/InventoryFilterBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  adjustStock,
  fetchInventoryStockPage,
  fetchTenantInventoryOverview,
  saveInventoryAlertRules,
  type InventoryStockRow,
  type InventoryStockSummary,
  type TenantStockLocation,
} from '../../../apis/inventory';
import { createStockDoc } from '../../../apis/stock-doc';
import { parseQtyInput, sortKey, suggestQty } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();

const PAGE = 20;
const EMPTY_SUMMARY: InventoryStockSummary = {
  skuCount: 0, onHandTotal: 0, allocatedTotal: 0, availableTotal: 0, valueTotal: 0,
  outCount: 0, lowCount: 0, okCount: 0, outbound7d: 0,
};

// 快捷宫格 8 项（契约 1.5 `quick.*` / 契约 1.6 路由）
const QUICK: Array<{ key: string; icon: string; url: string }> = [
  { key: 'purchase', icon: '📥', url: '/pages/inventory/stock-doc/purchase/index' },
  { key: 'transfer', icon: '🔀', url: '/pages/inventory/stock-doc/transfer/index' },
  { key: 'stocktake', icon: '🧮', url: '/pages/inventory/stock-doc/stocktake/index' },
  { key: 'issue', icon: '📤', url: '/pages/inventory/stock-doc/issue/index' },
  { key: 'movements', icon: '🧾', url: '/pages/inventory/movements/index' },
  { key: 'locations', icon: '🏬', url: '/pages/inventory/locations/index' },
  { key: 'rules', icon: '🔔', url: '/pages/inventory/alert-rules/index' },
  { key: 'docs', icon: '📦', url: '/pages/inventory/stock-doc/index' },
];

// ---- 页面状态 ----
const locations = ref<TenantStockLocation[]>([]);
const defaultPhysicalId = ref('');
const locationId = ref('');
const keyword = ref('');
const sort = ref('stockAsc');
const bucket = ref('');
const summary = ref<InventoryStockSummary>({ ...EMPTY_SUMMARY });
const items = ref<InventoryStockRow[]>([]);
const totalItems = ref(0);
const selected = ref<Record<string, boolean>>({});
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
let seq = 0; // 竞态守卫：过期响应直接丢弃

// 仓库选项 = 全部仓 + 本租户仓（虚拟仓也在列，与 spec §3.2.1 一致）
const locOptions = computed(() => [
  { id: '', name: locale.t('inventoryStock.allLocations') },
  ...locations.value.map((l) => ({ id: l.id, name: l.name })),
]);

// tabs 计数取服务端 summary（不带 bucket 的分桶计数），随「仓库 + 关键词」变化
const buckets = computed(() => ({
  all: summary.value.skuCount,
  out: summary.value.outCount,
  low: summary.value.lowCount,
  ok: summary.value.okCount,
}));

const hasFilter = computed(() => !!keyword.value || !!bucket.value);
const checkedRows = computed(() => items.value.filter((r) => selected.value[r.variantId]));

const generating = ref(false);
const adjusting = ref(false);
const savingSafety = ref(false);
const adjustRow = ref<InventoryStockRow | null>(null);
const adjustQty = ref('');
const safetyVisible = ref(false);
const safetyValue = ref('');

// ---- 请求编排 ----
async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchInventoryStockPage({
      locationId: locationId.value || null,
      keyword: keyword.value || undefined, // 空串不传，避免后端把空串当 LIKE 条件（spec §4）
      bucket: bucket.value || undefined,
      sort: sort.value,
      page: target,
      pageSize: PAGE,
    });
    if (my !== seq) return; // 旧响应丢弃
    page.value = target;
    summary.value = res.summary;
    totalItems.value = res.totalItems;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    // spec §4：失败弹 Toast 且保留上次结果，不清空列表
    uni.showToast({
      title: e?.message || (keyword.value ? locale.t('inventoryStock.searchFailed') : locale.t('inventoryStock.loadFailed')),
      icon: 'none',
    });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

function applyFilter(): void {
  selected.value = {}; // 条件变了，勾选可能已不在结果集内
  void load(true);
}

function onLocation(id: string): void {
  locationId.value = id;
  applyFilter();
}
function onSearch(kw: string): void {
  keyword.value = kw;
  applyFilter();
}
function onSort(key: string): void {
  sort.value = key;
  applyFilter();
}
function onBucket(key: string): void {
  bucket.value = key;
  applyFilter();
}
// KPI 卡点击：缺货/低库存 → 对应分桶；其余卡 emit '' → 回到全部
function onKpiPick(b: string): void {
  bucket.value = b;
  applyFilter();
}

// ---- 列表交互 ----
function onToggle(row: InventoryStockRow): void {
  if (row.bucket === 'ok') return; // 仅缺货/低库存参与批量操作（spec §3.2.1）
  const next = { ...selected.value };
  if (next[row.variantId]) delete next[row.variantId];
  else next[row.variantId] = true;
  selected.value = next;
}
function clearSel(): void {
  selected.value = {};
}
function go(url: string): void {
  uni.navigateTo({ url });
}
function goRules(): void {
  uni.navigateTo({ url: '/pages/inventory/alert-rules/index' });
}
function goDocs(): void {
  uni.navigateTo({ url: '/pages/inventory/stock-doc/index' });
}
function onOpenMovements(row: InventoryStockRow): void {
  uni.navigateTo({ url: `/pages/inventory/movements/index?productVariantId=${row.variantId}` });
}
function onReplenish(row: InventoryStockRow): void {
  const locId = row.stockLocationId || defaultPhysicalId.value;
  const qty = Math.max(1, suggestQty(row.safetyStock, row.onHand));
  uni.navigateTo({ url: `/pages/inventory/stock-doc/purchase/index?variantId=${row.variantId}&qty=${qty}&locationId=${locId}` });
}
function onAdjust(row: InventoryStockRow): void {
  adjustRow.value = row;
  adjustQty.value = String(row.onHand);
}
function onAdjustInput(e: any): void {
  adjustQty.value = e?.detail?.value ?? '';
}
function onSafetyInput(e: any): void {
  safetyValue.value = e?.detail?.value ?? '';
}
function closeAdjust(): void {
  adjustRow.value = null;
}
function closeSafety(): void {
  safetyVisible.value = false;
}

// ---- 批量生成采购入库单 ----
async function onBulkPurchase(): Promise<void> {
  const rows = checkedRows.value;
  if (!rows.length) {
    uni.showToast({ title: locale.t('inventoryStock.bulk.noSelect'), icon: 'none' });
    return;
  }
  if (generating.value) return;
  const fallback = defaultPhysicalId.value;
  const lines = rows.map((r) => ({
    variantId: r.variantId,
    toStockLocationId: r.stockLocationId || fallback, // 「全部仓」聚合态行无仓号 → 回落租户默认物理仓
    // 建议量 = 安全库存 − 现存，且至少 1（safetyStock=0 的缺货行也能补货）
    qty: Math.max(1, suggestQty(r.safetyStock, r.onHand)),
  }));
  if (!lines.every((l) => !!l.toStockLocationId)) {
    uni.showToast({ title: locale.t('inventoryStock.bulk.genFailed'), icon: 'none' });
    return;
  }
  generating.value = true;
  try {
    const doc = await createStockDoc({ type: 'PURCHASE', items: lines });
    uni.showToast({ title: locale.t('inventoryStock.bulk.genDone').replace('{code}', doc.code), icon: 'success' });
    selected.value = {};
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.bulk.genFailed'), icon: 'none' });
  } finally {
    generating.value = false;
  }
}

// ---- 调整库存（setVariantStock 为绝对值设置）----
async function onConfirmAdjust(): Promise<void> {
  const row = adjustRow.value;
  if (!row) return;
  const target = parseQtyInput(adjustQty.value, -1);
  if (target < 0) {
    uni.showToast({ title: locale.t('inventoryStock.adjust.invalid'), icon: 'none' });
    return;
  }
  const locId = row.stockLocationId || defaultPhysicalId.value;
  if (!locId) {
    uni.showToast({ title: locale.t('inventoryStock.adjust.failed'), icon: 'none' });
    return;
  }
  if (adjusting.value) return;
  adjusting.value = true;
  try {
    await adjustStock(row.variantId, locId, target);
    adjustRow.value = null;
    uni.showToast({ title: locale.t('inventoryStock.adjust.done'), icon: 'success' });
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.adjust.failed'), icon: 'none' });
  } finally {
    adjusting.value = false;
  }
}

// ---- 批量设安全库存 ----
function onBulkSafety(): void {
  if (!checkedRows.value.length) {
    uni.showToast({ title: locale.t('inventoryStock.bulk.noSelect'), icon: 'none' });
    return;
  }
  safetyValue.value = String(checkedRows.value[0].safetyStock);
  safetyVisible.value = true;
}
function onConfirmSafety(): void {
  const v = parseQtyInput(safetyValue.value, -1);
  if (v < 0) {
    uni.showToast({ title: locale.t('inventoryStock.safety.invalid'), icon: 'none' });
    return;
  }
  if (v === 0) {
    // spec §4：0 需明确提示「该 SKU 将不再预警」，确认后再落库
    uni.showModal({
      title: locale.t('inventoryStock.safety.title'),
      content: locale.t('inventoryStock.safety.zeroHint'),
      success: (r) => {
        if (r.confirm) void submitSafety(0);
      },
    });
    return;
  }
  void submitSafety(v);
}
async function submitSafety(safetyStock: number): Promise<void> {
  if (savingSafety.value) return;
  savingSafety.value = true;
  try {
    // locationId 为空 = 本 SKU「全仓通用」规则（服务端哨兵 0）；有仓时为该仓覆盖（契约 1.1）
    await saveInventoryAlertRules(
      locationId.value || null,
      checkedRows.value.map((r) => ({ variantId: r.variantId, safetyStock, enabled: safetyStock > 0 })),
    );
    safetyVisible.value = false;
    selected.value = {};
    uni.showToast({ title: locale.t('inventoryStock.safety.done'), icon: 'success' });
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.safety.failed'), icon: 'none' });
  } finally {
    savingSafety.value = false;
  }
}

// ---- 生命周期 ----
async function init(): Promise<void> {
  try {
    const ov = await fetchTenantInventoryOverview();
    locations.value = ov.locations;
    const firstPhysical = ov.locations.find((l) => l.kind === 'physical' && !l.isSystem)
      ?? ov.locations.find((l) => l.kind === 'physical');
    // 默认选第一个物理仓；无物理仓时退回「全部仓」（spec §3.2.1）
    locationId.value = firstPhysical?.id ?? '';
    defaultPhysicalId.value = ov.defaultPhysicalLocationId || firstPhysical?.id || '';
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.loadFailed'), icon: 'none' });
  }
  await load(true);
}

onLoad(() => {
  void init();
});

// 从采购/调整页返回时刷新（首次由 onLoad 负责，避免重复请求）
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void load(true);
});

onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  /* 桌面态操作行：移动端隐藏（入口在快捷宫格内） */
  .dacts { display: none; }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16rpx;
    margin-bottom: 20rpx;

    .g {
      background: $wa-card;
      border-radius: $wa-radius;
      padding: 20rpx 8rpx;
      display: flex;
      flex-direction: column;
      align-items: center;

      .gi { font-size: 34rpx; line-height: 1.1; }
      .gt { font-size: 20rpx; color: $wa-muted; margin-top: 8rpx; }
    }
  }

  .sec {
    display: flex;
    align-items: center;
    margin: 8rpx 0 16rpx;

    .sh { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }

  /* 批量条：吸底（无底部导航栏，故直接贴底） */
  .bulk {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background: $wa-ink;

    .btxt { flex: 1; font-size: 24rpx; color: #fff; }
    .b {
      font-size: 24rpx;
      color: #fff;
      background: $wa-accent;
      border-radius: 8rpx;
      padding: 12rpx 24rpx;

      &.ghost { background: rgba(255, 255, 255, 0.16); }
      &.dis { opacity: 0.5; }
    }
  }

  /* 弹层 */
  .mask {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: flex-end;
    z-index: 20;
  }
  .sheet {
    width: 100%;
    background: $wa-card;
    border-radius: $wa-radius $wa-radius 0 0;
    padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));

    .stitle { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .sname { display: block; font-size: 24rpx; color: $wa-muted; margin-top: 8rpx; }
    .frow {
      display: flex;
      align-items: center;
      margin-top: 28rpx;

      .fl { flex: 1; font-size: 26rpx; color: $wa-ink; }
      .inp {
        width: 200rpx;
        text-align: center;
        background: $wa-bg;
        border-radius: $wa-radius;
        padding: 16rpx 20rpx;
        font-size: 28rpx;
        color: $wa-ink;
      }
    }
    .sbtns {
      display: flex;
      gap: 20rpx;
      margin-top: 32rpx;

      .sbtn {
        flex: 1;
        text-align: center;
        font-size: 28rpx;
        color: #fff;
        background: $wa-accent;
        border-radius: $wa-radius;
        padding: 20rpx 0;

        &.ghost { background: transparent; color: $wa-ink; border: 1rpx solid $wa-rule; }
        &.dis { opacity: 0.5; }
      }
    }
  }
}

@media (min-width: 768px) {
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 32px 0;

    .dacts {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 12px;

      .da {
        font-size: 13px;
        color: $wa-ink;
        background: $wa-card;
        border: 1rpx solid $wa-rule;
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
      }
    }

    /* 桌面态：同一张明细卡片 2 列网格（卡片已含 mockup 表格全部 11 列信息） */
    .list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
  }
}
</style>
```

Run: `npx tsc --noEmit`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 中间态——本文件不得报类型错误（`inventoryStock.*` 文案键在 Task 8 才补齐，运行期会回显 key 本身，属预期）。

- [x] **Step 2: `purchase/index.vue` 支持 `onLoad` 参数预填（`variantId` / `qty` / `locationId`）**

在 `src/pages/inventory/stock-doc/purchase/index.vue` 做两处修改：

(a) 把第 29 行的 `import { ref, onMounted } from 'vue';` 替换为：

```ts
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
```

(b) 把文件末尾的 `onMounted(...)` 整段替换为：

```ts
// 支持从库存主页「补货」带参进入：?variantId=&qty=&locationId=（契约 1.6）
onLoad(async (q: any) => {
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
  const wantLoc = String(q?.locationId ?? '');
  if (wantLoc) {
    const i = locations.value.findIndex((l) => l.id === wantLoc);
    if (i >= 0) {
      locIdx.value = i;
      curLocName.value = locations.value[i].name;
    }
  }
  if (q?.variantId) variantId.value = String(q.variantId);
  if (q?.qty) qty.value = String(q.qty);
  if (q?.variantId || q?.qty) {
    uni.showToast({ title: locale.t('stockDocPurchase.prefilled'), icon: 'none' });
  }
});
```

Run: `npx tsc --noEmit`
Expected: 中间态——本文件不得报类型错误。

- [x] **Step 3: `src/pages.json` 给库存主页开启下拉刷新**

把第 28 行：

```json
    { "path": "pages/inventory/stock/index", "style": { "navigationBarTitleText": "库存与预警" } },
```

替换为：

```json
    { "path": "pages/inventory/stock/index", "style": { "navigationBarTitleText": "库存与预警", "enablePullDownRefresh": true } },
```

Run: `node -e "JSON.parse(require('fs').readFileSync('src/pages.json','utf8')); console.log('pages.json OK')"`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 输出 `pages.json OK`（JSON 合法；`pages` 数组条数不变）。

- [x] **Step 4: 提交主页重做**

```bash
git add src/pages/inventory/stock/index.vue src/pages/inventory/stock-doc/purchase/index.vue src/pages.json
git commit -m "feat(web-admin): 库存主页整页重做（概览/筛选/分桶/宫格/批量/弹层）+ 采购页参数预填"
```

Run: `git status --short src/pages`
Expected: 无未提交项。

## Task 8: 预警规则页 + 单据中心页 + 路由 + 双语文案

**Files:**
- Create: `src/pages/inventory/alert-rules/index.vue`
- Create: `src/pages/inventory/stock-doc/index.vue`
- Modify: `src/pages.json`（新增 2 条路由）
- Modify: `src/locale/zh-Hans.json`、`src/locale/en.json`

**契约对照：** i18n 键严格按 1.5（`inventoryAlertRules.*` / `stockDocCenter.*` / `inventoryStock.*` / `inventoryMovements.*` / `stockDocPurchase.prefilled`）；路由按 1.6。**`inventoryStock.empty` 由字符串改为对象**（旧字符串仅被本 Plan 重写的旧主页引用，已无消费方）。

- [x] **Step 1: `src/pages/inventory/alert-rules/index.vue`（预警规则页）**

创建 `src/pages/inventory/alert-rules/index.vue`（完整文件）：

```vue
<template>
  <view class="page">
    <!-- 默认安全库存（渠道级） -->
    <view class="card">
      <text class="h">{{ $t('inventoryAlertRules.defaultLabel') }}</text>
      <view class="frow">
        <input class="inp" type="number" :value="defaultVal" @input="onDefaultInput" />
        <text class="sbtn" :class="{ dis: savingDefault }" @tap="onSaveDefault">
          {{ savingDefault ? $t('inventoryAlertRules.saving') : $t('inventoryAlertRules.save') }}
        </text>
      </view>
      <text class="hint">{{ $t('inventoryAlertRules.defaultHint') }}</text>
    </view>

    <!-- 商品安全库存列表 -->
    <view class="card">
      <view class="lhead">
        <text class="h">{{ $t('inventoryAlertRules.listTitle') }}</text>
        <text class="sp"></text>
        <input
          class="sbox"
          :value="keyword"
          :placeholder="$t('inventoryAlertRules.searchPlaceholder')"
          confirm-type="search"
          @input="onSearchInput"
          @confirm="onSearchNow"
        />
      </view>
      <view class="thead">
        <text class="c1">{{ $t('inventoryAlertRules.listTitle') }}</text>
        <text class="c2">{{ $t('inventoryAlertRules.safetyPlaceholder') }}</text>
        <text class="c3">{{ $t('inventoryAlertRules.enableLabel') }}</text>
      </view>

      <view class="rrow" v-for="r in items" :key="r.variantId">
        <view class="rmain">
          <text class="rnm">{{ r.variantName || r.sku }}</text>
          <text class="rsub">{{ r.sku }}<text v-if="r.locationName"> · {{ r.locationName }}</text> · {{ r.onHand }}</text>
        </view>
        <input class="inp" type="number" :value="inputVal(r)" @input="onRuleInput(r, $event)" />
        <switch class="sw" :checked="eff(r).enabled" @change="onRuleToggle(r, $event)" />
      </view>

      <view v-if="loading || loadingMore" class="more">{{ $t('inventoryAlertRules.loadingMore') }}</view>
      <view v-else-if="finished && items.length" class="more">{{ $t('inventoryAlertRules.noMore') }}</view>
      <view v-if="!items.length && !loading" class="empty">
        {{ keyword ? $t('inventoryAlertRules.noMatch') : $t('inventoryAlertRules.empty') }}
      </view>
    </view>

    <view style="height: 200rpx" />

    <!-- 保存规则（仅提交用户改动过的行） -->
    <view class="savebar">
      <text class="count">{{ $t('inventoryAlertRules.listTitle') }} {{ editCount }}</text>
      <text class="sbtn" :class="{ dis: savingRules || !editCount }" @tap="onSaveRules">
        {{ savingRules ? $t('inventoryAlertRules.saving') : $t('inventoryAlertRules.save') }}
      </text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import {
  fetchInventoryAlertRules,
  fetchInventoryStockPage,
  saveInventoryAlertRules,
  type InventoryAlertRuleInput,
  type InventoryStockRow,
} from '../../../apis/inventory';
import { parseQtyInput } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();
const PAGE = 20;

const channelId = ref('');
const defaultVal = ref('');
const savingDefault = ref(false);

const items = ref<InventoryStockRow[]>([]);
const keyword = ref('');
// 已持久化的「全仓通用」规则（locationId 哨兵 0）
const rulesMap = ref<Record<string, { safetyStock: number; enabled: boolean }>>({});
// 用户本次改动（variantId → 规则），只提交这些行
const edits = ref<Record<string, { safetyStock: number; enabled: boolean }>>({});
// 输入框原始字符串缓冲，避免「清空重输」被回弹（受控组件回写问题）
const inputs = reactive<Record<string, string>>({});

const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
const savingRules = ref(false);
let seq = 0;

const editCount = computed(() => Object.keys(edits.value).length);

/** 某行的最终生效规则：本地改动 → 已存规则 → 服务端解析值（含渠道默认回退） */
function eff(r: InventoryStockRow): { safetyStock: number; enabled: boolean } {
  return edits.value[r.variantId] ?? rulesMap.value[r.variantId] ?? { safetyStock: r.safetyStock, enabled: true };
}
function inputVal(r: InventoryStockRow): string {
  return inputs[r.variantId] ?? String(eff(r).safetyStock);
}

function onRuleInput(r: InventoryStockRow, e: any): void {
  const raw = e?.detail?.value ?? '';
  inputs[r.variantId] = raw;
  const cur = eff(r);
  const parsed = parseQtyInput(raw, -1);
  edits.value = { ...edits.value, [r.variantId]: { ...cur, safetyStock: parsed < 0 ? cur.safetyStock : parsed } };
}
function onRuleToggle(r: InventoryStockRow, e: any): void {
  const cur = eff(r);
  edits.value = { ...edits.value, [r.variantId]: { ...cur, enabled: !!e?.detail?.value } };
}

async function loadRules(): Promise<void> {
  // locationId 传 null = 本租户「全仓通用」规则（服务端哨兵 0，契约 1.3）
  const list = await fetchInventoryAlertRules(null);
  const m: Record<string, { safetyStock: number; enabled: boolean }> = {};
  for (const r of list) m[r.variantId] = { safetyStock: r.safetyStock, enabled: r.enabled };
  rulesMap.value = m;
  edits.value = {};
  for (const k of Object.keys(inputs)) delete inputs[k];
}

async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchInventoryStockPage({
      locationId: null, // 全部仓聚合
      keyword: keyword.value || undefined,
      sort: 'stockAsc', // spec §3.2.2：预警列表固定按库存升序
      page: target,
      pageSize: PAGE,
    });
    if (my !== seq) return;
    page.value = target;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.loadFailed'), icon: 'none' });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

let timer: any = null;
function onSearchInput(e: any): void {
  keyword.value = e?.detail?.value ?? '';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(true), 400);
}
function onSearchNow(): void {
  if (timer) clearTimeout(timer);
  void load(true);
}

function onDefaultInput(e: any): void {
  defaultVal.value = e?.detail?.value ?? '';
}
async function onSaveDefault(): Promise<void> {
  const v = parseQtyInput(defaultVal.value, -1);
  if (v < 0) {
    uni.showToast({ title: locale.t('inventoryAlertRules.defaultInvalid'), icon: 'none' });
    return;
  }
  if (savingDefault.value) return;
  savingDefault.value = true;
  try {
    await updateChannelCustomFields(channelId.value, { inventoryDefaultSafetyStock: v });
    defaultVal.value = String(v);
    uni.showToast({ title: locale.t('inventoryAlertRules.defaultSaved'), icon: 'success' });
    // 默认值变化会影响「未单独设规则」SKU 的解析值，重拉列表
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.defaultFailed'), icon: 'none' });
  } finally {
    savingDefault.value = false;
  }
}

async function onSaveRules(): Promise<void> {
  if (savingRules.value) return;
  const entries = Object.entries(edits.value);
  if (!entries.length) return;
  // 逐行校验输入缓冲（可能含空串/负数）
  for (const [vid] of entries) {
    if (parseQtyInput(inputs[vid], -1) < 0) {
      uni.showToast({ title: locale.t('inventoryAlertRules.safetyInvalid'), icon: 'none' });
      return;
    }
  }
  const payload: InventoryAlertRuleInput[] = entries.map(([vid, v]) => ({
    variantId: vid,
    safetyStock: v.safetyStock,
    enabled: v.enabled,
  }));
  savingRules.value = true;
  try {
    await saveInventoryAlertRules(null, payload);
    uni.showToast({ title: locale.t('inventoryAlertRules.saved'), icon: 'success' });
    await loadRules();
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.saveFailed'), icon: 'none' });
  } finally {
    savingRules.value = false;
  }
}

async function init(): Promise<void> {
  try {
    const ch = await fetchActiveChannel();
    channelId.value = ch.id;
    const v = Number(ch.customFields.inventoryDefaultSafetyStock ?? 10);
    defaultVal.value = String(Number.isFinite(v) ? v : 10);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.loadFailed'), icon: 'none' });
  }
  try {
    await loadRules();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.loadFailed'), icon: 'none' });
  }
  await load(true);
}

init();
onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .card {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 28rpx 32rpx;
    margin-bottom: 20rpx;

    .h { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 12rpx; }

    .frow { display: flex; align-items: center; gap: 20rpx; margin-top: 20rpx;
      .inp { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 24rpx; font-size: 28rpx; color: $wa-ink; text-align: center; }
    }

    .lhead { display: flex; align-items: center;
      .sp { flex: 1; }
      .sbox { width: 300rpx; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; font-size: 24rpx; color: $wa-ink; }
    }

    .thead { display: flex; align-items: center; margin-top: 20rpx; padding-bottom: 12rpx; border-bottom: 1rpx solid $wa-rule;
      .c1 { flex: 1; font-size: 22rpx; color: $wa-muted; }
      .c2 { width: 180rpx; text-align: center; font-size: 22rpx; color: $wa-muted; }
      .c3 { width: 110rpx; text-align: center; font-size: 22rpx; color: $wa-muted; }
    }

    .rrow { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
      .rmain { flex: 1; min-width: 0; display: flex; flex-direction: column;
        .rnm { font-size: 26rpx; color: $wa-ink; }
        .rsub { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
      }
      .inp { width: 180rpx; text-align: center; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 16rpx; font-size: 26rpx; color: $wa-ink; }
      .sw { width: 110rpx; transform: scale(0.75); }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 60rpx 0; }

  .sbtn {
    font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius;
    padding: 14rpx 32rpx; white-space: nowrap;
    &.dis { opacity: 0.5; }
  }

  .savebar {
    position: fixed; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; gap: 20rpx;
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background: #fff; border-top: 1rpx solid $wa-rule;
    .count { flex: 1; font-size: 24rpx; color: $wa-muted; }
  }
}
</style>
```

Run: `npx tsc --noEmit`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 中间态——本文件不得报类型错误。

- [x] **Step 2: `src/pages/inventory/stock-doc/index.vue`（单据中心）**

创建 `src/pages/inventory/stock-doc/index.vue`（完整文件）：

```vue
<template>
  <view class="page">
    <!-- 类型 tabs（type 传空 = 不过滤，后端白名单校验） -->
    <view class="tabs">
      <text
        v-for="t in TABS"
        :key="t.label"
        class="tab"
        :class="{ on: type === t.key }"
        @tap="onTab(t.key)"
      >{{ $t('stockDocCenter.' + t.label) }}</text>
    </view>

    <view class="sec">
      <text class="sh">{{ $t('stockDocCenter.title') }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ totalItems }}</text>
    </view>

    <view class="card" v-for="d in items" :key="d.id">
      <view class="row">
        <text class="code">{{ d.code }}</text>
        <text class="tag">{{ typeLabel(d.type) }}</text>
      </view>
      <view class="sub">
        <text>{{ $t('stockDocCenter.itemCount').replace('{n}', String(d.itemCount)) }}</text>
        <text class="dot">·</text>
        <text>{{ $t('stockDocCenter.totalQty').replace('{n}', String(d.totalQty)) }}</text>
      </view>
      <view class="sub dim" v-if="d.remark">
        <text>{{ $t('stockDocCenter.remarkLabel') }}：{{ d.remark }}</text>
      </view>
      <view class="sub dim">
        <text v-if="d.operator">{{ $t('stockDocCenter.operatorLabel') }}：{{ d.operator }} · </text>
        <text>{{ formatDateTime(d.createdAt) }}</text>
      </view>
    </view>

    <view v-if="loading || loadingMore" class="more">{{ $t('stockDocCenter.loadingMore') }}</view>
    <view v-else-if="finished && items.length" class="more">{{ $t('stockDocCenter.noMore') }}</view>
    <view v-if="!items.length && !loading" class="empty">{{ $t('stockDocCenter.empty') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchStockDocList, type StockDocSummaryRow } from '../../../apis/stock-doc';
import { formatDateTime } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();
const PAGE = 20;

// 与 stockDoc 类型枚举一一对应（PURCHASE/TRANSFER/STOCKTAKE/ISSUE）
const TABS: Array<{ key: string; label: string }> = [
  { key: '', label: 'tabAll' },
  { key: 'PURCHASE', label: 'tabPurchase' },
  { key: 'TRANSFER', label: 'tabTransfer' },
  { key: 'STOCKTAKE', label: 'tabStocktake' },
  { key: 'ISSUE', label: 'tabIssue' },
];

const type = ref('');
const items = ref<StockDocSummaryRow[]>([]);
const totalItems = ref(0);
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
let seq = 0;

function typeLabel(t: string): string {
  const hit = TABS.find((x) => x.key === t);
  return hit ? locale.t(`stockDocCenter.${hit.label}`) : t;
}

async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchStockDocList({ type: type.value || undefined, page: target, pageSize: PAGE });
    if (my !== seq) return;
    page.value = target;
    totalItems.value = res.totalItems;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('stockDocCenter.loadFailed'), icon: 'none' });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

function onTab(key: string): void {
  if (type.value === key) return;
  type.value = key;
  void load(true);
}

void load(true);
onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .tabs { display: flex; gap: 12rpx; margin-bottom: 20rpx;
    .tab { flex: 1; text-align: center; font-size: 22rpx; color: $wa-muted; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 0;
      &.on { color: #fff; background: $wa-ink; }
    }
  }

  .sec { display: flex; align-items: center; margin-bottom: 16rpx;
    .sh { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center;
      .code { flex: 1; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .tag { font-size: 22rpx; color: #fff; background: $wa-accent; border-radius: 6rpx; padding: 2rpx 12rpx; }
    }
    .sub { margin-top: 10rpx; font-size: 24rpx; color: $wa-ink;
      .dot { margin: 0 8rpx; color: $wa-muted; }
      &.dim { color: $wa-muted; }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
```

Run: `npx tsc --noEmit`
Expected: 中间态——本文件不得报类型错误。

- [x] **Step 3: `src/pages.json` 新增 2 条路由**

把第 33 行：

```json
    { "path": "pages/inventory/movements/index", "style": { "navigationBarTitleText": "库存流水" } },
```

替换为：

```json
    { "path": "pages/inventory/movements/index", "style": { "navigationBarTitleText": "库存流水", "enablePullDownRefresh": true } },
    { "path": "pages/inventory/alert-rules/index", "style": { "navigationBarTitleText": "预警规则" } },
    { "path": "pages/inventory/stock-doc/index", "style": { "navigationBarTitleText": "单据中心", "enablePullDownRefresh": true } },
```

> 说明：`pages/inventory/movements/index` 的 `enablePullDownRefresh` 属 Task 9 所需的同批改动，在此一并落地（避免两次改同一行）。
> 顺序注意：`pages/inventory/stock-doc/index`（单据中心）与既有 `pages/inventory/stock-doc/purchase/index` 等为**不同路径**，uni-app 路由以文件为准，不冲突。

Run: `node -e "const p=JSON.parse(require('fs').readFileSync('src/pages.json','utf8'));console.log('pages',p.pages.length, p.pages.filter(x=>x.path.startsWith('pages/inventory/')).map(x=>x.path).join(','))"`（cwd = `d:\zhao\vshop\web-admin`）
Expected: `pages 57` 且 inventory 路由包含 `pages/inventory/stock/index,pages/inventory/stock-doc/purchase/index,pages/inventory/stock-doc/transfer/index,pages/inventory/stock-doc/stocktake/index,pages/inventory/stock-doc/issue/index,pages/inventory/movements/index,pages/inventory/alert-rules/index,pages/inventory/stock-doc/index,pages/inventory/locations/index,pages/inventory/locations/edit`（原 55 条 + 2 条 = 57）。

- [x] **Step 4: `src/locale/zh-Hans.json` 文案（inventoryStock 重写分组 + 新增两组）**

把第 909–926 行整段（`"inventoryStock": { ... },`）替换为下面内容（含新增的 `inventoryAlertRules` / `stockDocCenter` 两组，紧跟 `inventoryStock` 之后）：

```json
  "inventoryStock": {
    "warehouse": "仓库",
    "stockQty": "{n} 件",
    "allocated": "已分配 {n}",
    "lowStock": "低库存",
    "threshold": "预警阈值",
    "thresholdOpt": "{n} 件",
    "thresholdCol": "阈值 {n}",
    "sku": "SKU #{id}",
    "shortBy": "缺货量 {n}",
    "outOfStock": "缺货",
    "genPurchase": "生成采购入库单 ({n})",
    "genPurchasing": "生成中…",
    "noSelect": "请先勾选低库存 SKU",
    "genDone": "已生成采购入库单 {code}",
    "genFailed": "生成采购入库单失败",
    "allLocations": "全部仓",
    "searchPlaceholder": "搜索商品名 / SKU / 规格",
    "sortLabel": "排序",
    "detailTitle": "库存明细",
    "loadFailed": "加载库存失败",
    "searchFailed": "搜索库存失败",
    "loadingMore": "加载中…",
    "noMore": "没有更多了",
    "sheetCancel": "取消",
    "kpi": {
      "sku": "在售 SKU",
      "skuSub": "各仓合计",
      "onHand": "库存总量",
      "onHandSub": "现存数量",
      "value": "库存货值",
      "valueSub": "按最近采购成本",
      "out": "缺货",
      "outSub": "点击筛选",
      "low": "低库存预警",
      "lowSub": "低于安全库存",
      "outbound7d": "近 7 天出库",
      "outboundSub": "订单 + 手动出库"
    },
    "sort": {
      "stockAsc": "库存从低到高",
      "stockDesc": "库存从高到低",
      "gapDesc": "缺口从大到小",
      "valueDesc": "货值从大到小"
    },
    "bucket": {
      "all": "全部",
      "out": "缺货",
      "low": "低库存",
      "ok": "正常"
    },
    "quick": {
      "purchase": "采购入库",
      "transfer": "移库",
      "stocktake": "盘库",
      "issue": "手动出库",
      "movements": "库存流水",
      "locations": "仓库管理",
      "rules": "预警规则",
      "docs": "单据中心"
    },
    "card": {
      "noThumb": "无图",
      "lastMove": "最近变动",
      "neverMove": "暂无变动",
      "value": "货值",
      "movements": "流水",
      "replenish": "补货",
      "adjust": "调整"
    },
    "num": {
      "onHand": "现存",
      "allocated": "占用",
      "available": "可用",
      "safety": "安全库存"
    },
    "move": {
      "in": "入库",
      "out": "出库",
      "order": "订单出库",
      "afterSales": "售后退货",
      "purchase": "采购入库",
      "stockMove": "移库",
      "stocktake": "盘库",
      "stockIn": "手动入库",
      "stockOut": "手动出库",
      "manual": "手工调整",
      "mirror": "镜像同步"
    },
    "bulk": {
      "selected": "已选 {n} 项",
      "setSafety": "设为安全库存",
      "genPurchase": "生成采购单",
      "noSelect": "请先勾选缺货 / 低库存 SKU",
      "genDone": "已生成采购入库单 {code}",
      "genFailed": "生成采购入库单失败"
    },
    "adjust": {
      "title": "调整库存",
      "target": "目标库存",
      "placeholder": "输入目标数量",
      "invalid": "请输入非负整数",
      "confirm": "确定",
      "done": "库存已调整",
      "failed": "调整库存失败"
    },
    "safety": {
      "title": "设为安全库存",
      "placeholder": "输入安全库存",
      "invalid": "请输入非负整数",
      "zeroHint": "安全库存设为 0 后该 SKU 将不再预警，确认继续？",
      "confirm": "保存",
      "done": "安全库存已更新",
      "failed": "保存安全库存失败"
    },
    "empty": {
      "noData": "暂无库存数据",
      "noMatch": "没有匹配的商品，换个关键词试试"
    },
    "alertRulesBtn": "预警规则",
    "docCenterBtn": "单据中心"
  },
  "inventoryAlertRules": {
    "title": "预警规则",
    "defaultLabel": "默认安全库存（全部商品）",
    "defaultHint": "未单独设置安全库存的商品，按此值预警",
    "listTitle": "商品安全库存",
    "searchPlaceholder": "搜索商品名 / SKU",
    "safetyPlaceholder": "安全库存",
    "enableLabel": "启用",
    "save": "保存规则",
    "saving": "保存中…",
    "saved": "预警规则已保存",
    "saveFailed": "保存预警规则失败",
    "loadFailed": "加载预警规则失败",
    "defaultSaved": "默认安全库存已保存",
    "defaultFailed": "保存默认安全库存失败",
    "defaultInvalid": "请输入非负整数",
    "safetyInvalid": "安全库存需为非负整数",
    "empty": "暂无商品库存数据",
    "noMatch": "没有匹配的商品",
    "loadingMore": "加载中…",
    "noMore": "没有更多了"
  },
  "stockDocCenter": {
    "title": "单据中心",
    "tabAll": "全部",
    "tabPurchase": "采购入库",
    "tabTransfer": "移库",
    "tabStocktake": "盘库",
    "tabIssue": "手动出库",
    "itemCount": "{n} 条明细",
    "totalQty": "共 {n} 件",
    "remarkLabel": "备注",
    "operatorLabel": "操作人",
    "empty": "暂无单据",
    "loadFailed": "加载单据失败",
    "loadingMore": "加载中…",
    "noMore": "没有更多了"
  },
```

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('src/locale/zh-Hans.json','utf8'));console.log(Object.keys(j.inventoryStock.kpi).length, Object.keys(j.inventoryAlertRules).length, Object.keys(j.stockDocCenter).length)"`（cwd = `d:\zhao\vshop\web-admin`）
Expected: `12 20 14`（`kpi` 12 键 / `inventoryAlertRules` 20 键 / `stockDocCenter` 14 键），且无 JSON 解析异常。

- [x] **Step 5: `src/locale/zh-Hans.json` 扩展 `inventoryMovements` + 追加 `stockDocPurchase.prefilled`**

(a) 把第 996–999 行整段替换为：

```json
  "inventoryMovements": {
    "empty": "暂无流水",
    "loadFailed": "加载流水失败",
    "inTotal": "入库合计 {n}",
    "outTotal": "出库合计 {n}",
    "dirAll": "全部方向",
    "dirIn": "入库",
    "dirOut": "出库",
    "bizAll": "全部类型",
    "locAll": "全部仓",
    "dateAll": "全部时间",
    "dateToday": "今日",
    "date7d": "近 7 天",
    "dateMonth": "本月",
    "clearFilter": "清空筛选",
    "loadingMore": "加载中…",
    "noMore": "没有更多了"
  },
```

(b) 在 `stockDocPurchase` 组内的 `"submitFailed": "提交失败"` 之后追加一行（注意补逗号）：

```json
    "submitFailed": "提交失败",
    "prefilled": "已按所选商品预填，核对后提交"
```

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('src/locale/zh-Hans.json','utf8'));console.log(Object.keys(j.inventoryMovements).length, j.stockDocPurchase.prefilled)"`
Expected: `16 已按所选商品预填，核对后提交`。

- [x] **Step 6: `src/locale/en.json` 同步（键序必须与 zh-Hans 完全平行）**

(a) 把第 909–926 行整段替换为：

```json
  "inventoryStock": {
    "warehouse": "Warehouse",
    "stockQty": "{n} units",
    "allocated": "Allocated {n}",
    "lowStock": "Low stock",
    "threshold": "Alert threshold",
    "thresholdOpt": "{n} units",
    "thresholdCol": "Threshold {n}",
    "sku": "SKU #{id}",
    "shortBy": "Shortage {n}",
    "outOfStock": "Out of stock",
    "genPurchase": "Create purchase ({n})",
    "genPurchasing": "Creating…",
    "noSelect": "Please select low-stock SKUs",
    "genDone": "Purchase created {code}",
    "genFailed": "Failed to create purchase",
    "allLocations": "All warehouses",
    "searchPlaceholder": "Search name / SKU / option",
    "sortLabel": "Sort",
    "detailTitle": "Stock details",
    "loadFailed": "Failed to load stock",
    "searchFailed": "Failed to search stock",
    "loadingMore": "Loading…",
    "noMore": "No more",
    "sheetCancel": "Cancel",
    "kpi": {
      "sku": "Active SKUs",
      "skuSub": "All warehouses",
      "onHand": "Total on hand",
      "onHandSub": "On-hand units",
      "value": "Stock value",
      "valueSub": "Latest purchase cost",
      "out": "Out of stock",
      "outSub": "Tap to filter",
      "low": "Low stock alerts",
      "lowSub": "Below safety stock",
      "outbound7d": "Outbound 7d",
      "outboundSub": "Orders + manual"
    },
    "sort": {
      "stockAsc": "Stock: low to high",
      "stockDesc": "Stock: high to low",
      "gapDesc": "Gap: large to small",
      "valueDesc": "Value: high to low"
    },
    "bucket": {
      "all": "All",
      "out": "Out of stock",
      "low": "Low stock",
      "ok": "Normal"
    },
    "quick": {
      "purchase": "Purchase in",
      "transfer": "Transfer",
      "stocktake": "Stocktake",
      "issue": "Manual issue",
      "movements": "Movements",
      "locations": "Warehouses",
      "rules": "Alert rules",
      "docs": "Documents"
    },
    "card": {
      "noThumb": "No image",
      "lastMove": "Last movement",
      "neverMove": "No movement yet",
      "value": "Value",
      "movements": "Ledger",
      "replenish": "Restock",
      "adjust": "Adjust"
    },
    "num": {
      "onHand": "On hand",
      "allocated": "Allocated",
      "available": "Available",
      "safety": "Safety"
    },
    "move": {
      "in": "In",
      "out": "Out",
      "order": "Order",
      "afterSales": "After-sales return",
      "purchase": "Purchase in",
      "stockMove": "Transfer",
      "stocktake": "Stocktake",
      "stockIn": "Manual in",
      "stockOut": "Manual issue",
      "manual": "Manual adjust",
      "mirror": "Mirror sync"
    },
    "bulk": {
      "selected": "{n} selected",
      "setSafety": "Set safety stock",
      "genPurchase": "Create purchase",
      "noSelect": "Select out-of-stock / low-stock SKUs first",
      "genDone": "Purchase created {code}",
      "genFailed": "Failed to create purchase"
    },
    "adjust": {
      "title": "Adjust stock",
      "target": "Target on hand",
      "placeholder": "Enter target quantity",
      "invalid": "Please enter a non-negative integer",
      "confirm": "Confirm",
      "done": "Stock adjusted",
      "failed": "Failed to adjust stock"
    },
    "safety": {
      "title": "Set safety stock",
      "placeholder": "Enter safety stock",
      "invalid": "Please enter a non-negative integer",
      "zeroHint": "Safety stock 0 disables alerts for this SKU. Continue?",
      "confirm": "Save",
      "done": "Safety stock updated",
      "failed": "Failed to save safety stock"
    },
    "empty": {
      "noData": "No stock data",
      "noMatch": "No matching products, try another keyword"
    },
    "alertRulesBtn": "Alert rules",
    "docCenterBtn": "Documents"
  },
  "inventoryAlertRules": {
    "title": "Alert rules",
    "defaultLabel": "Default safety stock (all products)",
    "defaultHint": "Products without a specific safety stock use this value",
    "listTitle": "Product safety stock",
    "searchPlaceholder": "Search name / SKU",
    "safetyPlaceholder": "Safety stock",
    "enableLabel": "Enabled",
    "save": "Save rules",
    "saving": "Saving…",
    "saved": "Alert rules saved",
    "saveFailed": "Failed to save alert rules",
    "loadFailed": "Failed to load alert rules",
    "defaultSaved": "Default safety stock saved",
    "defaultFailed": "Failed to save default safety stock",
    "defaultInvalid": "Please enter a non-negative integer",
    "safetyInvalid": "Safety stock must be a non-negative integer",
    "empty": "No product stock data",
    "noMatch": "No matching products",
    "loadingMore": "Loading…",
    "noMore": "No more"
  },
  "stockDocCenter": {
    "title": "Documents",
    "tabAll": "All",
    "tabPurchase": "Purchase in",
    "tabTransfer": "Transfer",
    "tabStocktake": "Stocktake",
    "tabIssue": "Manual issue",
    "itemCount": "{n} lines",
    "totalQty": "{n} units total",
    "remarkLabel": "Remark",
    "operatorLabel": "Operator",
    "empty": "No documents",
    "loadFailed": "Failed to load documents",
    "loadingMore": "Loading…",
    "noMore": "No more"
  },
```

(b) 把第 996–999 行整段替换为：

```json
  "inventoryMovements": {
    "empty": "No movements",
    "loadFailed": "Failed to load movements",
    "inTotal": "In total {n}",
    "outTotal": "Out total {n}",
    "dirAll": "All directions",
    "dirIn": "In",
    "dirOut": "Out",
    "bizAll": "All types",
    "locAll": "All warehouses",
    "dateAll": "All time",
    "dateToday": "Today",
    "date7d": "Last 7 days",
    "dateMonth": "This month",
    "clearFilter": "Clear filters",
    "loadingMore": "Loading…",
    "noMore": "No more"
  },
```

(c) 在 `stockDocPurchase` 组内的 `"submitFailed": "Submit failed"` 之后追加一行（注意补逗号）：

```json
    "submitFailed": "Submit failed",
    "prefilled": "Prefilled from the selected product — review and submit"
```

Run: `node -e "const a=JSON.parse(require('fs').readFileSync('src/locale/zh-Hans.json','utf8'));const b=JSON.parse(require('fs').readFileSync('src/locale/en.json','utf8'));const k=o=>Object.keys(o);const same=(p)=>{const A=JSON.stringify(k(a[p])),B=JSON.stringify(k(b[p]));console.log(p, A===B?'KEYS-OK':'KEYS-MISMATCH');};['inventoryStock','inventoryAlertRules','stockDocCenter','inventoryMovements','stockDocPurchase'].forEach(same);const sub=(p)=>{const A=JSON.stringify(k(a.inventoryStock[p])),B=JSON.stringify(k(b.inventoryStock[p]));console.log('inventoryStock.'+p, A===B?'KEYS-OK':'KEYS-MISMATCH');};['kpi','sort','bucket','quick','card','num','move','bulk','adjust','safety','empty'].forEach(sub);"`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 全部输出 `KEYS-OK`（中英键序平行，无 `KEYS-MISMATCH`）。

- [x] **Step 7: 提交页面与文案**

```bash
git add src/pages/inventory/alert-rules src/pages/inventory/stock-doc/index.vue src/pages.json src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(web-admin): 预警规则页 + 单据中心页 + 路由与双语文案（Plan 2）"
```

Run: `git status --short src/pages src/locale`
Expected: 无未提交项。

## Task 9: 库存流水页升级（`pages/inventory/movements/index.vue`）

**Files:**
- Modify（整页重写）: `src/pages/inventory/movements/index.vue`

> `pages.json` 中该页的 `enablePullDownRefresh` 已在 Task 8 Step 3 一并落地，本任务不再改路由。

**契约对照：**
- API：`fetchMovements(params)` 出参 `{ totalItems, items, summary: { inQty, outQty } }`，入参扩 `bizType/direction/from/to`（1.3）
- 文案：`inventoryMovements.*`（1.5）；业务类型标签**复用** `inventoryStock.move.*`（与 Task 6 卡片、Task 7 主页同一套枚举映射，避免三处各维护一份）
- 纯函数：`dayKey`、`formatDateTime`、`dirKey`、`bizTypeKey`（1.2/1.3）
- 入口参数：`?productVariantId=`（1.6）

- [x] **Step 1: 整页重写 `src/pages/inventory/movements/index.vue`**

把 `src/pages/inventory/movements/index.vue` **整体替换**为（完整文件）：

```vue
<template>
  <view class="page">
    <!-- 汇总条（与筛选条件同口径，服务端汇总） -->
    <view class="sum">
      <text class="sin">{{ $t('inventoryMovements.inTotal').replace('{n}', String(summary.inQty)) }}</text>
      <text class="sout">{{ $t('inventoryMovements.outTotal').replace('{n}', String(summary.outQty)) }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ totalItems }}</text>
      <text v-if="hasFilter" class="clr" @tap="onClear">{{ $t('inventoryMovements.clearFilter') }}</text>
    </view>

    <!-- 方向 -->
    <view class="chips">
      <text class="chip" :class="{ on: direction === '' }" @tap="onDirection('')">{{ $t('inventoryMovements.dirAll') }}</text>
      <text class="chip" :class="{ on: direction === 'in' }" @tap="onDirection('in')">{{ $t('inventoryMovements.dirIn') }}</text>
      <text class="chip" :class="{ on: direction === 'out' }" @tap="onDirection('out')">{{ $t('inventoryMovements.dirOut') }}</text>
    </view>

    <!-- 业务类型（枚举标签复用 inventoryStock.move.*） -->
    <scroll-view class="chips scroll" scroll-x>
      <text class="chip" :class="{ on: bizType === '' }" @tap="onBiz('')">{{ $t('inventoryMovements.bizAll') }}</text>
      <text
        v-for="b in BIZ"
        :key="b"
        class="chip"
        :class="{ on: bizType === b }"
        @tap="onBiz(b)"
      >{{ $t('inventoryStock.' + bizTypeKey(b)) }}</text>
    </scroll-view>

    <!-- 日期预设 -->
    <view class="chips">
      <text class="chip" :class="{ on: datePreset === '' }" @tap="onDate('')">{{ $t('inventoryMovements.dateAll') }}</text>
      <text class="chip" :class="{ on: datePreset === 'today' }" @tap="onDate('today')">{{ $t('inventoryMovements.dateToday') }}</text>
      <text class="chip" :class="{ on: datePreset === '7d' }" @tap="onDate('7d')">{{ $t('inventoryMovements.date7d') }}</text>
      <text class="chip" :class="{ on: datePreset === 'month' }" @tap="onDate('month')">{{ $t('inventoryMovements.dateMonth') }}</text>
    </view>

    <!-- 仓库 + 指定商品 -->
    <view class="locrow">
      <picker mode="selector" :range="locNames" :value="locIndex" @change="onLocChange">
        <view class="locpill">{{ $t('inventoryMovements.locAll') }} · {{ curLocName }} ▾</view>
      </picker>
      <text v-if="variantId" class="vchip">{{ $t('inventoryStock.sku').replace('{id}', variantId) }}</text>
    </view>

    <!-- 按日分组的流水列表 -->
    <view v-for="g in groups" :key="g.day" class="grp">
      <text class="gday">{{ g.day }}</text>
      <view class="card" v-for="m in g.rows" :key="m.id">
        <view class="row">
          <text class="name" :class="m.direction">{{ m.direction === 'out' ? '－' : '＋' }}{{ m.quantity }}</text>
          <text class="biz">{{ $t('inventoryStock.' + dirKey(m.direction)) }} · {{ $t('inventoryStock.' + bizTypeKey(m.bizType)) }}</text>
        </view>
        <view class="sub"><text>#{{ m.productVariantId }} · {{ locName(m.stockLocationId) }}</text></view>
        <view class="sub">
          <text>{{ m.code }}</text>
          <text v-if="m.bizCode">｜{{ m.bizCode }}</text>
        </view>
        <view class="sub dim">{{ formatDateTime(m.createdAt) }}<text v-if="m.reason"> · {{ m.reason }}</text></view>
      </view>
    </view>

    <view v-if="loading || loadingMore" class="more">{{ $t('inventoryMovements.loadingMore') }}</view>
    <view v-else-if="finished && items.length" class="more">{{ $t('inventoryMovements.noMore') }}</view>
    <view v-if="!items.length && !loading" class="empty">{{ $t('inventoryMovements.empty') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchMovements, type MovementRow } from '../../../apis/stock-doc';
import { fetchTenantInventoryOverview, type TenantStockLocation } from '../../../apis/inventory';
import { bizTypeKey, dayKey, dirKey, formatDateTime } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();
const PAGE = 20;

// 与后端流水 bizType 取值一一对应（order/afterSales/stockIn/stockOut/stockMove/stocktake/purchase/manual/mirror）
const BIZ = ['order', 'afterSales', 'stockIn', 'stockOut', 'stockMove', 'stocktake', 'purchase', 'manual', 'mirror'];

const items = ref<MovementRow[]>([]);
const summary = ref<{ inQty: number; outQty: number }>({ inQty: 0, outQty: 0 });
const totalItems = ref(0);

const direction = ref<'' | 'in' | 'out'>('');
const bizType = ref('');
const datePreset = ref<'' | 'today' | '7d' | 'month'>('');
const locationId = ref('');
const variantId = ref('');

const locations = ref<TenantStockLocation[]>([]);

const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
let seq = 0;

const locNames = computed(() => locations.value.map((l) => l.name));
const locIndex = computed(() => {
  const i = locations.value.findIndex((l) => l.id === locationId.value);
  return i < 0 ? 0 : i;
});
const curLocName = computed(() => locations.value[locIndex.value]?.name ?? '');

const hasFilter = computed(
  () => !!direction.value || !!bizType.value || !!datePreset.value || !!locationId.value || !!variantId.value,
);

// 按天分组（同一天的多条流水归到一组，日期用本地时区）
const groups = computed(() => {
  const map = new Map<string, MovementRow[]>();
  for (const m of items.value) {
    const k = dayKey(m.createdAt) || '-';
    const arr = map.get(k);
    if (arr) arr.push(m);
    else map.set(k, [m]);
  }
  return Array.from(map.entries()).map(([day, rows]) => ({ day, rows }));
});

function locName(id: string): string {
  return locations.value.find((l) => l.id === id)?.name ?? `#${id}`;
}

/** 日期预设 → from（ISO，含当日 00:00，本地时区） */
function dateFrom(preset: string): string | undefined {
  const now = new Date();
  if (preset === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (preset === '7d') {
    const d = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (preset === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return undefined;
}

async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchMovements({
      productVariantId: variantId.value || undefined,
      locationId: locationId.value || undefined,
      bizType: bizType.value || undefined,
      direction: direction.value || undefined,
      from: dateFrom(datePreset.value),
      page: target,
      pageSize: PAGE,
    });
    if (my !== seq) return; // 竞态守卫
    page.value = target;
    summary.value = res.summary;
    totalItems.value = res.totalItems;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('inventoryMovements.loadFailed'), icon: 'none' });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

function reload(): void {
  void load(true);
}
function onDirection(d: '' | 'in' | 'out'): void {
  direction.value = d;
  reload();
}
function onBiz(b: string): void {
  bizType.value = b;
  reload();
}
function onDate(p: '' | 'today' | '7d' | 'month'): void {
  datePreset.value = p;
  reload();
}
function onLocChange(e: any): void {
  const l = locations.value[Number(e.detail.value)];
  locationId.value = l?.id ?? '';
  reload();
}
function onClear(): void {
  direction.value = '';
  bizType.value = '';
  datePreset.value = '';
  locationId.value = '';
  variantId.value = '';
  reload();
}

onLoad(async (q: any) => {
  if (q?.productVariantId) variantId.value = String(q.productVariantId);
  try {
    const ov = await fetchTenantInventoryOverview();
    locations.value = ov.locations;
  } catch (_e) {
    // 仓库筛选项加载失败不阻断流水列表
  }
  await load(true);
});

onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .sum { display: flex; align-items: center; gap: 16rpx; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 16rpx;
    .sin { font-size: 26rpx; color: $wa-success; font-weight: 600; }
    .sout { font-size: 26rpx; color: $wa-danger; font-weight: 600; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
    .clr { font-size: 22rpx; color: $wa-accent; margin-left: 16rpx; }
  }

  .chips { white-space: nowrap; margin-bottom: 12rpx;
    &.scroll { width: 100%; }
    .chip { display: inline-block; font-size: 22rpx; color: $wa-muted; background: $wa-card; border-radius: 999rpx; padding: 10rpx 22rpx; margin-right: 12rpx;
      &.on { color: #fff; background: $wa-accent; }
    }
  }

  .locrow { display: flex; align-items: center; gap: 16rpx; margin: 4rpx 0 20rpx;
    .locpill { font-size: 24rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 24rpx; }
    .vchip { font-size: 22rpx; color: $wa-accent; background: $wa-card; border-radius: 999rpx; padding: 10rpx 20rpx; }
  }

  .grp {
    .gday { display: block; font-size: 22rpx; color: $wa-muted; margin: 8rpx 0 12rpx; }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 30rpx; font-weight: 600;
        &.in { color: $wa-accent; }
        &.out { color: $wa-danger; }
      }
      .biz { font-size: 24rpx; color: $wa-muted; }
    }
    .sub { margin-top: 10rpx; font-size: 24rpx; color: $wa-ink;
      &.dim { color: $wa-muted; }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
```

Run: `npx tsc --noEmit`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 报告中**不得**出现 `src/pages/inventory/movements/index.vue` 的错误（`res.summary` 已由 Task 5 的 `fetchMovements` 返回）。

- [x] **Step 2: 提交流水页升级**

```bash
git add src/pages/inventory/movements/index.vue
git commit -m "feat(web-admin): 库存流水页升级（入出汇总 + 方向/类型/仓库/日期筛选 + 按日分组）"
```

Run: `git status --short src/pages`
Expected: 无未提交项。

## Task 10: 回归与交付（类型检查 / 构建 / 部署 / 线上探针 / 手机截图 / 操作手册 / 复验清单 / 回滚）

**Files:**
- Create: `_e2e/_probe_inventory.py`（线上只读探针）
- Create: `_e2e/_shot_inventory_v2.py`（手机 + 桌面截图）
- Modify: `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（追加新章节）
- 产物：`src/static/manual/shots/inv2_01_default.png` … `inv2_08_desktop.png` + `docs/webadmin-bugfix-manual/assets/` 同名副本

**两条前置纪律：**
1. **解除中间态**：Task 6~9 是连续破坏性改造（组件→主页→新页→流水页），其间**不以类型检查/构建是否通过为准**；从本 Task 的 Step 2 起，全量 `npx tsc --noEmit` 与 `npm run build:h5` 必须全绿，任何报错都必须在本 Task 内修掉。
2. **顺序**（对齐规格 §6）：**先后端**（`inventoryStockPage` 等接口就绪）→ 再前端构建与部署 → 最后探针与截图。前端若先上线会请求到不存在的查询，页面全红。

> **web-admin 无 codegen 快照依赖**（已核对 `package.json` 只有 `uni build` / `uni` 两个脚本，`devDependencies` 无 graphql-codegen、仓库内无 `graphql.schema.json`）：所有请求都是 `getAdminClient().request<T>()` + 手写 TS 接口，构建不校验 SDL，故**本计划不需要重拉/补丁 schema 快照**（nshop/vshop 才需要）。

---

- [x] **Step 1: 后端单测与编译产物复核**

Run:
```bash
npm test --prefix packages/cjk-plugin
```
（cwd = `d:\zhao\vendure`）

Expected: `src/inventory/alert-rule-math.spec.ts`、`src/inventory/stock-page-math.spec.ts` 全 PASS（vitest；规格 §5 写的 `npx tsx --test` 在该包不适用，理由见 Task 1 Step 2）。

Run:
```bash
npm run build --prefix packages/cjk-plugin
```
（cwd = `d:\zhao\vendure`）

Expected: `rimraf lib && tsc -p tsconfig.build.json` 成功；`git status --short packages/cjk-plugin/lib` 输出若干 `M`（`lib/` 是 **git 跟踪产物**，必须一并提交）。

- [x] **Step 2: 前端全量类型检查（解除 Task 6~9 中间态）**

Run:
```bash
npx tsc --noEmit
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected: **0 error**。允许的唯一例外是「与本计划改动文件无关的既有基线报错」——若确有报错，先用下面命令确认基线再决定是否属于本次引入：

```bash
git stash push src/pages/inventory src/components/inventory src/utils/inventoryFormat.ts src/apis
npx tsc --noEmit
git stash pop
```

若 stash 后仍报同样的错 → 基线问题，记录并在后续单独处理；若 stash 后不再报错 → 属本计划引入，必须在本 Step 修掉再继续。

- [x] **Step 3: 前端纯函数单测**

Run:
```bash
npx tsx --test src/utils/inventoryFormat.test.ts
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected: 全 PASS（21+ 断言，覆盖 `fenToYuan`/`moneyLabel`/`suggestQty`/`parseQtyInput`/`bucketKey`/`dirKey`/`bizTypeKey`/`sortKey`/`formatDateTime`/`dayKey`）。

- [x] **Step 4: 前端本地构建**

Run:
```bash
npm run build:h5
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected: 构建成功，产物更新到 `dist/build/h5`（含 `index.html` 与新页面 chunk）。若报 Sass 变量未定义，检查是否漏引 `$wa-*`（本项目 `$wa-*` 由全局样式注入，页面/组件 scoped 块直接可用，无需 import）。

- [x] **Step 5: 提交源码与产物（后端、前端分别提交）**

后端（cwd = `d:\zhao\vendure`）：

```bash
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 库存页面升级后端能力（安全库存规则/库存聚合查询/单据列表/流水筛选）+ 编译产物"
```

前端（cwd = `d:\zhao\vshop\web-admin`）：

```bash
git add src/pages/inventory src/components/inventory src/utils/inventoryFormat.ts src/utils/inventoryFormat.test.ts src/apis src/pages.json src/locale
git commit -m "feat(web-admin): 库存与预警页面 v2（概览/服务端筛选/安全库存/单据中心/流水升级）+ 双语文案"
```

Run: `git status --short`
Expected: 两端均无未提交项（`dist/` 若被 gitignore 忽略则不在列表内，属正常）。

- [x] **Step 6: 部署后端（服务器只拉取 + 重启，不在服务器构建）**

在服务器（与 `scripts/deploy.mjs` 中的目标主机同一台）执行：

```bash
cd /www/apps/vendure
git pull
pm2 restart vendure
pm2 logs vendure --lines 150 --nostream | grep -i -E "inventory_alert_rule|synchronize|now running"
```

Expected:
- 出现 `Vendure server (v3.6.4) now running on port 3000`；
- 生产 postgres 走 `synchronize: true` 时，日志会打印建表/改表语句，其中包含 `inventory_alert_rule`（双保险；若日志未打印但接口可用，说明幂等迁移已建表，见 Task 1 Step 1-B）；
- 无 `Entity metadata for ... was not found` 类报错（若出现，说明 `plugin.ts` 的 `entities` 数组漏加 `InventoryAlertRuleEntity`，回到 Task 1 Step 4）。

补充只读自检（在服务器上直接打内网 admin-api，确认接口已注册）：

```bash
curl -s -X POST http://localhost:3000/admin-api \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"Query\"){ fields{ name } } }"}' | grep -o 'inventoryStockPage\|inventoryAlertRules\|stockDocList'
```

Expected: 三个名字全部出现。缺哪个，说明 `adminApiExtensions` 的 SDL 漏写（见 Task 2 Step 9 / Task 3 Step 6）。

- [x] **Step 7: 部署前端（本地构建产物 → 服务器解压）**

Run:
```bash
node scripts/deploy.mjs
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected: `scp` 上传成功 + 服务器解压完成，输出部署目标路径（按脚本提示选择 `guanli` 站点）；静态目录替换即时生效，无需 nginx reload。

- [x] **Step 8: 线上只读探针回归（接口层验收）**

创建 `_e2e/_probe_inventory.py`（**只读**：全部为 `query`，不含任何 `mutation`，不写生产数据）：

```python
# -*- coding: utf-8 -*-
# 库存 v2 只读探针（生产 admin-api）：校验 inventoryStockPage / inventoryAlertRules / stockDocList 真实可用
# 用法: python _e2e/_probe_inventory.py
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
# 说明：本脚本只发 query，绝不发 mutation（不创建单据、不改安全库存）
from playwright.sync_api import sync_playwright
import time, urllib.request, json

BASE = 'https://e.joho.cn/guanli/'
API = 'https://e.joho.cn/admin-api'
ACC = ('guoxinnanshan@163.com', 'you123123')
CH = 't2'


def gql(token, channel, query, variables=None):
    req = urllib.request.Request(
        API,
        data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'vendure-token': channel,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b'{}')


Q_PAGE = '''query Page($input: InventoryStockQueryInput) {
  inventoryStockPage(input: $input) {
    totalItems
    summary { skuCount onHandTotal allocatedTotal availableTotal valueTotal outCount lowCount okCount outbound7d }
    items { variantId productId variantName sku optionText thumbnail stockLocationId locationName
            onHand allocated available safetyStock value costPrice bucket lastMovementAt lastDirection lastBizType }
  }
}'''

Q_RULES = '''query Rules($locationId: ID) {
  inventoryAlertRules(locationId: $locationId) { variantId locationId safetyStock enabled }
}'''

Q_DOCS = '''query Docs($type: String, $page: Int, $pageSize: Int) {
  stockDocList(type: $type, page: $page, pageSize: $pageSize) {
    totalItems
    items { id code type remark operator createdAt itemCount totalQty }
  }
}'''

Q_CH = '''query { activeChannel { id code customFields { inventoryDefaultSafetyStock } } }'''


def show(label, body):
    if body.get('errors'):
        print('[%s] ERR: %s' % (label, json.dumps(body['errors'], ensure_ascii=False)[:300]))
        return None
    return body.get('data')


# ---- 登录并取渠道 token（复用既有截图脚本的注入法）----
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).fill(ACC[0])
    pg.locator('input').nth(1).fill(ACC[1])
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    auth = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = ((d.data||{}).myTenantAccess||{}).channels || [];
        const hit = c.find(x=>x.code==='""" + CH + """');
        return hit ? 'OK:' + hit.token : 'NOCHANNEL:' + c.map(x=>x.code).join(',');
      }).catch(e=>'ERR:'+e.message);
    }""")
    b.close()

print('channel inject =', auth[:20] + ('…' if len(auth) > 20 else ''))
if not auth.startswith('OK:'):
    raise SystemExit('登录/取渠道失败（' + auth + '），后续断言跳过')
token = auth[3:]

verdict = []

# ---- 1) 全量口径 ----
d1 = show('inventoryStockPage(全部)', gql(token, CH, Q_PAGE, {'input': {'page': 1, 'pageSize': 20}}))
base_total = 0
summary = None
first_rows = []
if d1:
    page = d1['inventoryStockPage']
    base_total = page['totalItems']
    summary = page['summary']
    first_rows = page['items']
    print('  totalItems =', base_total)
    print('  summary    =', json.dumps(summary, ensure_ascii=False))
    print('  首行       =', json.dumps(first_rows[0], ensure_ascii=False) if first_rows else '(空)')
    verdict.append(('summary.onHandTotal > 0', summary['onHandTotal'] > 0, summary['onHandTotal']))
    verdict.append(('summary.skuCount == 全部 totalItems', summary['skuCount'] == base_total,
                    (summary['skuCount'], base_total)))
    verdict.append(('summary.onHandTotal == allocatedTotal + availableTotal',
                    summary['onHandTotal'] == summary['allocatedTotal'] + summary['availableTotal'],
                    (summary['onHandTotal'], summary['allocatedTotal'], summary['availableTotal'])))
    verdict.append(('分桶计数之和 == 全部数',
                    summary['outCount'] + summary['lowCount'] + summary['okCount'] == base_total,
                    (summary['outCount'], summary['lowCount'], summary['okCount'], base_total)))

    # ---- 2) 缺货桶：totalItems 必须等于 summary.outCount，且行 bucket 全为 out ----
    d2 = show('inventoryStockPage(bucket=out)', gql(token, CH, Q_PAGE,
                                                    {'input': {'page': 1, 'pageSize': 20, 'bucket': 'out'}}))
    if d2:
        out_page = d2['inventoryStockPage']
        out_items = out_page['items']
        print('  缺货桶 totalItems =', out_page['totalItems'], '（summary.outCount =', summary['outCount'], '）')
        verdict.append(('缺货桶 totalItems == summary.outCount', out_page['totalItems'] == summary['outCount'],
                        (out_page['totalItems'], summary['outCount'])))
        verdict.append(('缺货桶行 bucket 全为 out', all(x['bucket'] == 'out' for x in out_items), len(out_items)))

    # ---- 3) 关键词（取首行真实 SKU，保证服务端 LIKE 能命中，且验证跨页搜索）----
    if first_rows:
        kw = first_rows[0]['sku']
        d3 = show('inventoryStockPage(keyword=%s)' % kw, gql(token, CH, Q_PAGE,
                                                            {'input': {'page': 1, 'pageSize': 20, 'keyword': kw}}))
        if d3:
            kw_page = d3['inventoryStockPage']
            kw_items = kw_page['items']
            print('  keyword 命中 =', kw_page['totalItems'], '（全量 =', base_total, '）')
            verdict.append(('keyword 命中数 ≤ 全量且 ≥ 1', 1 <= kw_page['totalItems'] <= base_total,
                            (kw_page['totalItems'], base_total)))
            verdict.append(('keyword 命中（理想 < 全量，单 SKU 环境相等属正常）',
                            kw_page['totalItems'] < base_total, kw_page['totalItems']))
            verdict.append(('keyword 命中行 sku 均含关键词',
                            all(kw.lower() in x['sku'].lower() for x in kw_items), len(kw_items)))

    # ---- 4) 排序：stockAsc 前 3 行 onHand 单调不减 ----
    d4 = show('inventoryStockPage(sort=stockAsc)', gql(token, CH, Q_PAGE,
                                                       {'input': {'page': 1, 'pageSize': 20, 'sort': 'stockAsc'}}))
    if d4:
        vals = [x['onHand'] for x in d4['inventoryStockPage']['items'][:3]]
        print('  stockAsc 前 3 行 onHand =', vals)
        verdict.append(('sort=stockAsc 前 3 行 onHand 单调不减',
                        all(vals[i] <= vals[i + 1] for i in range(len(vals) - 1)), vals))
    # 非法 sort 回退默认（规格 §4：不抛异常）
    d4b = show('inventoryStockPage(sort=__bad__) 非法值回退', gql(token, CH, Q_PAGE,
                                                                  {'input': {'page': 1, 'pageSize': 20, 'sort': '__bad__'}}))
    verdict.append(('非法 sort 回退默认且不报错', bool(d4b and d4b['inventoryStockPage']['items'] is not None), True))

# ---- 5) 预警规则 + 渠道默认安全库存 ----
d5 = show('inventoryAlertRules(locationId=null)', gql(token, CH, Q_RULES, {'locationId': None}))
if d5:
    rules = d5['inventoryAlertRules']
    print('  「全仓通用」规则条数 =', len(rules))
    if rules:
        print('  首条 =', json.dumps(rules[0], ensure_ascii=False))
    verdict.append(('inventoryAlertRules 可读（数组，允许 0 条）', isinstance(rules, list), len(rules)))
    verdict.append(('规则行含 variantId/safetyStock/enabled/locationId',
                    all({'variantId', 'safetyStock', 'enabled', 'locationId'} <= set(r) for r in rules), True))

d6 = show('activeChannel.customFields.inventoryDefaultSafetyStock', gql(token, CH, Q_CH))
if d6:
    cf = (d6['activeChannel'] or {}).get('customFields') or {}
    print('  渠道默认安全库存 =', cf.get('inventoryDefaultSafetyStock'))
    verdict.append(('渠道字段 inventoryDefaultSafetyStock 存在', 'inventoryDefaultSafetyStock' in cf,
                    cf.get('inventoryDefaultSafetyStock')))
    verdict.append(('渠道默认安全库存 == 10（未改过则为默认）',
                    cf.get('inventoryDefaultSafetyStock') == 10, cf.get('inventoryDefaultSafetyStock')))

# ---- 6) 单据列表 ----
d7 = show('stockDocList(page=1,pageSize=5)', gql(token, CH, Q_DOCS, {'page': 1, 'pageSize': 5}))
if d7:
    docs = d7['stockDocList']
    print('  单据总数 =', docs['totalItems'], '，首单 =',
          json.dumps(docs['items'][0], ensure_ascii=False) if docs['items'] else '(空)')
    verdict.append(('stockDocList 非空', docs['totalItems'] > 0, docs['totalItems']))
    verdict.append(('stockDocList 行含 itemCount/totalQty 且为整数',
                    all(isinstance(x['itemCount'], int) and isinstance(x['totalQty'], int) for x in docs['items']),
                    len(docs['items'])))
    verdict.append(('stockDocList 按 type 过滤生效（PURCHASE 子集 ≤ 全量）',
                    show('stockDocList(type=PURCHASE)',
                         gql(token, CH, Q_DOCS, {'type': 'PURCHASE', 'page': 1, 'pageSize': 5})) is not None, True))

# ---- 判定汇总 ----
print('\n=== 探针判定 ===')
bad = 0
for name, ok, val in verdict:
    print(('  PASS  ' if ok else '  FAIL  ') + name + '  -> ' + json.dumps(val, ensure_ascii=False))
    if not ok:
        bad += 1
print('=== %d 项，%d 项失败 ===' % (len(verdict), bad))
raise SystemExit(1 if bad else 0)
```

Run:
```bash
python _e2e/_probe_inventory.py
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected:
- `channel inject = OK:xxxxxx`；
- `inventoryStockPage` 全量 `totalItems > 0`，`summary` 九项齐全且 `skuCount == totalItems`；
- `缺货桶 totalItems == summary.outCount`（缺货为 0 的环境两者都是 0，也属通过——此时 `bucket=out` 的行数为 0，分桶逻辑仍被验证）；
- `keyword 命中` 介于 1 与全量之间（租户只有 1 个 SKU 时等于全量，对应那一行会 FAIL，属数据规模问题而非接口问题，需在图/手册里说明）；
- `inventoryAlertRules`、`stockDocList` 均不报 `ERR`，`stockDocList.totalItems > 0`（若为 0，先按 Task 7/Task 9 的真实单据流程生成一张采购单再复跑）；
- 结尾 `=== N 项，0 项失败 ===`。
- **任何一行等于全量**（除单 SKU 场景）说明该条件在服务端被忽略，必须回 Task 2/Task 3 排查。

- [x] **Step 9: 手机视口截图（硬规范：390×844、dpr=2 → 780×1688）**

创建 `_e2e/_shot_inventory_v2.py`：

```python
# -*- coding: utf-8 -*-
# 库存 v2 截图：手机 390x844 dpr=2 为主（概览/缺货/搜索/排序/预警规则/单据中心/流水）+ 桌面 1440x900
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import time, shutil, os

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)


def login(ctx):
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = ((d.data||{}).myTenantAccess||{}).channels || [];
        const hit = c.find(x=>x.code==='t2');
        if (!hit) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', hit.token);
        localStorage.setItem('wa_channel_code', 't2');
        return 'OK:' + hit.token.slice(0, 6);
      }).catch(e=>'ERR:'+e.message);
    }""")
    print('  channel inject =', tok)
    return pg


def go(pg, path):
    pg.goto(BASE + '#/pages/inventory/' + path, wait_until='networkidle', timeout=45000)
    time.sleep(5)


def shot(pg, name):
    pg.screenshot(path=SHOT + name)
    print('  shot:', name)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # ===== 手机 390x844 dpr=2 =====
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                      is_mobile=True, has_touch=True)
    pg = login(m)

    # 1 默认态：概览 6 卡 + 仓库胶囊 + 搜索/排序 + 状态 tabs + 快捷宫格 + 明细卡片
    go(pg, 'stock/index')
    print('body=', pg.inner_text('body')[:300].replace('\n', '|'))
    shot(pg, 'inv2_01_default.png')

    # 2 缺货筛选（点状态 tabs 的「缺货」；等价于点概览「缺货」卡）
    pg.locator('.fbar .tabs .tab.out').first.tap()
    time.sleep(3.5)
    shot(pg, 'inv2_02_out.png')

    # 3 关键词搜索：用首张卡片真实 SKU 回填，保证服务端 LIKE 命中（跨页可见）
    pg.locator('.fbar .tabs .tab').first.tap()
    time.sleep(3)
    sku = ''
    if pg.locator('.list .card .skuline').count():
        sku = pg.eval_on_selector('.list .card .skuline', 'el => el.innerText.split("·")[0].trim()')
    print('  first sku =', sku)
    if sku:
        pg.locator('.fbar .search input').first.fill(sku)
        time.sleep(3.5)
    shot(pg, 'inv2_03_search.png')

    # 4 排序切换（.sorts 第 3 个 chip = 缺口从大到小）
    if pg.locator('.fbar .search .clr').count():
        pg.locator('.fbar .search .clr').first.tap()
        time.sleep(3)
    pg.locator('.fbar .sorts .chip').nth(2).tap()
    time.sleep(3.5)
    shot(pg, 'inv2_04_sort.png')

    # 5 预警规则页（渠道默认安全库存 + SKU 列表 + 保存条）
    go(pg, 'alert-rules/index')
    shot(pg, 'inv2_05_alert_rules.png')

    # 6 单据中心（5 个类型 tabs + 单据卡片）
    go(pg, 'stock-doc/index')
    shot(pg, 'inv2_06_doc_center.png')

    # 7 流水页筛选（方向 = 出库 + 日期 = 近 7 天；.chips 依次为 方向 / 业务类型 / 日期）
    go(pg, 'movements/index')
    pg.locator('.chips').nth(0).locator('.chip').nth(2).tap()
    time.sleep(2.5)
    pg.locator('.chips').nth(2).locator('.chip').nth(2).tap()
    time.sleep(3.5)
    shot(pg, 'inv2_07_movements.png')

    # ===== 桌面 1440x900 =====
    d = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    dp = login(d)
    go(dp, 'stock/index')
    shot(dp, 'inv2_08_desktop.png')

    b.close()

# 同步到操作手册 assets
for n in os.listdir(SHOT):
    if n.startswith('inv2_'):
        shutil.copy(SHOT + n, MANUAL + n)
        print('copied →', n)
print('done')
```

Run:
```bash
python _e2e/_shot_inventory_v2.py
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected: 控制台打印 8 个 `shot:` 与 8 个 `copied →`；逐张确认（中文不乱码、无大片空白）：

| # | 文件 | 必须看到 |
| --- | --- | --- |
| 1 | `inv2_01_default.png` | 概览 6 卡（SKU 数/库存总量/货值/缺货/低库存/近 7 天出库）、仓库胶囊、搜索框、4 个排序 chip、4 个状态 tab（带计数）、8 格快捷宫格、明细卡片（缩略图 + 商品名 + SKU + 规格 + 现存/占用/可用/安全库存 + 货值 + 最近变动 + 状态标签 + 三个操作） |
| 2 | `inv2_02_out.png` | 「缺货」tab 高亮，列表只剩缺货行（若环境无缺货 → 列表空态显示「无匹配」，属正常，需在手册说明） |
| 3 | `inv2_03_search.png` | 搜索框内是首张卡片的真实 SKU，列表命中该 SKU（结果数 ≤ 全量，证明是服务端命中而非页内过滤） |
| 4 | `inv2_04_sort.png` | 「缺口从大到小」chip 高亮，首行安全库存缺口最大 |
| 5 | `inv2_05_alert_rules.png` | 顶部「默认安全库存」可编辑 + 保存按钮；下方 SKU 列表（商品名/SKU/仓库/现存 + 安全库存输入框 + 启用开关）；底部固定保存条 |
| 6 | `inv2_06_doc_center.png` | 5 个类型 tabs（全部/采购入库/移库/盘库/手动出库）+ 单据卡片（单号、类型标签、条数、总数量、备注、操作人、时间） |
| 7 | `inv2_07_movements.png` | 顶部入/出汇总条 + 方向「出库」高亮 + 日期「近 7 天」高亮 + 按日期分组的流水卡片 |
| 8 | `inv2_08_desktop.png` | 1440×900 桌面态：概览 6 卡横排、桌面操作行（预警规则/单据中心）可见、明细区两列卡片网格 |

**注意**：截图必须是**部署之后**的线上真实效果（Step 6/7 完成后再跑），否则截到旧版本。

- [x] **Step 10: 更新操作手册（追加新章节）**

在 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 的**最后一个 `</section>`**（当前文件为第 12 章结束，约 L598）之后、`<footer>` 之前插入：

```html
  <section id="inventory-stock-v2">
    <h2>13 库存与预警 · 库存页面 v2 升级（2026-09-21）</h2>
    <h3>13.1 现象</h3>
    <ul>
      <li><strong>库存页只能看裸 ID</strong>：明细只显示 <code class="mono">productVariantId</code> 与现存数，运营看不出这是哪个商品；无缩略图、无 SKU、无商品名、无占用/可用。</li>
      <li><strong>找不到商品、看不到全貌</strong>：一次拉 200 条无分页、无搜索、无排序；页面上也没有 SKU 总数、库存总量、货值、缺货/预警数等概览。</li>
      <li><strong>预警不可配</strong>：低库存档位是全页统一的 5/10/20/50，无法按单个 SKU 设安全库存，也没有预警规则可持久化。</li>
      <li><strong>单据与流水不可追溯</strong>：采购/移库/盘库/出库单据创建后没有列表可查；流水页只有 50 条、无任何筛选、无出入汇总。</li>
    </ul>
    <h3>13.2 根因</h3>
    <ol>
      <li>数据源用的是核心 <code class="mono">stockLevels</code> 直查，只带回变体 ID 与现存数，没有关联 <code class="mono">product_variant</code> / <code class="mono">product_translation</code> / <code class="mono">asset</code>，所以既无名称也无图。</li>
      <li>筛选、分页、统计全都不存在——前端一次性拉满 200 条后本地渲染，跨页搜索无从谈起。</li>
      <li>后端没有任何「安全库存 / 预警规则」表与接口（<code class="mono">inventory_alert_rule</code> 为本次新增），低库存只能靠前端写死档位近似。</li>
      <li>单据只有 <code class="mono">createStockDoc</code> 写入路径，没有列表查询；流水的 <code class="mono">stockMovementLedger</code> 只支持 <code class="mono">productVariantId/locationId/bizCode</code>，缺方向/业务类型/日期维度。</li>
    </ol>
    <h3>13.3 修复</h3>
    <ul>
      <li><strong>新增后端聚合查询 <code class="mono">inventoryStockPage</code></strong>：一条聚合 SQL 打通 <code class="mono">stock_level</code> + <code class="mono">product_variant</code> + <code class="mono">product_translation</code> + <code class="mono">asset</code> + <code class="mono">stock_doc_item</code> + <code class="mono">inventory_alert_rule</code>，一次返回 <code class="mono">totalItems / summary / items</code>；支持仓库、关键词（商品名/SKU/规格，服务端 LIKE）、状态分桶（全部/缺货/低库存/正常）、排序（库存升/降、缺口、货值）。</li>
      <li><strong>安全库存四级回退</strong>：新增 <code class="mono">inventory_alert_rule</code> 表（<code class="mono">tenantChannelId + variantId + locationId</code> 唯一，<code class="mono">locationId=0</code> 哨兵表示「全仓通用」），解析顺序为「SKU×仓规则 → SKU 全仓通用 → 渠道默认 <code class="mono">inventoryDefaultSafetyStock</code> → 常量 10」，后台可按 SKU 设值并持久生效。</li>
      <li><strong>库存主页整页重做</strong>：概览 6 卡（可点缺货/低库存卡直接筛选）→ 仓库胶囊 + 搜索 + 排序 → 状态 tabs（带服务端计数）→ 8 格快捷宫格 → 富明细卡片（缩略图/名称/SKU/规格/现存/占用/可用/安全库存/货值/最近变动/状态）→ 批量条（勾选后可一键生成采购入库单或批量设安全库存），并补齐下拉刷新、触底加载、竞态守卫与空态区分。</li>
      <li><strong>新增预警规则页与单据中心</strong>：预警规则页可改渠道默认安全库存并按 SKU 设值（只提交改动行）；单据中心按 5 个类型 tab 查看采购/移库/盘库/出库单据（单号、条数、总数量、备注、操作人、时间）。</li>
      <li><strong>流水页升级</strong>：顶部入/出汇总（与列表同条件），支持方向（全部/入库/出库）、业务类型（9 类）、仓库、日期预设（今日/近 7 天/本月）筛选，并按日期分组展示；支持从库存卡片带 <code class="mono">productVariantId</code> 直接进入预筛。</li>
      <li><strong>错误处理</strong>：所有请求 <code class="mono">catch</code> 后走 <code class="mono">graphQlErrorMsg</code> 弹 Toast 且<strong>保留上次结果不清空</strong>；并发请求用自增 <code class="mono">seq</code> 丢弃过期响应。</li>
    </ul>
    <div class="callout ok">
      <h4>验收结论（线上 e.joho.cn/guanli，手机 390×844 dpr=2）</h4>
      <p>① 概览 6 卡与点进去的筛选结果口径一致；② 搜索按商品名/SKU/规格在<strong>服务端</strong>命中（不受当前页限制）；③ 状态 tabs 计数随仓库/关键词变化且三个分桶之和 = 全部数；④ 明细卡片显示现存/占用/可用/安全库存/货值/最近变动，缩略图与商品名正确；⑤ 安全库存按 SKU 可保存并持久生效（未设置 SKU 回退渠道默认值 10）；⑥ 批量选品可生成采购入库单（单号回显）且库存与流水同步更新；⑦ 单据中心可见刚生成的单据，流水页可按方向/类型/日期筛选且汇总数与列表一致；⑧ 三类失败场景（搜索/保存规则/调整库存）均弹 Toast 且列表不清空。</p>
    </div>
    <h3>13.4 验收截图</h3>
    <figure style="margin:0 0 10px;"><img src="assets/inv2_01_default.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;" /><img src="assets/inv2_02_out.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><img src="assets/inv2_03_search.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">默认态（概览 6 卡 + 仓库胶囊 + 搜索/排序 + 状态 tabs + 快捷宫格 + 明细卡片） / 缺货筛选 / 关键词搜索命中（服务端）（手机 390×844）</figcaption></figure>
    <figure style="margin:0 0 10px;"><img src="assets/inv2_04_sort.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;" /><img src="assets/inv2_05_alert_rules.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><img src="assets/inv2_06_doc_center.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">排序切换（缺口从大到小） / 预警规则页（渠道默认安全库存 + SKU 列表 + 保存条） / 单据中心（5 类型 tabs + 单据卡片）</figcaption></figure>
    <figure style="margin:0;"><img src="assets/inv2_07_movements.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;" /><img src="assets/inv2_08_desktop.png" style="width:64%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">流水页筛选（入/出汇总 + 方向=出库 + 近 7 天 + 按日分组） / 桌面 1440×900（概览 6 卡横排 + 桌面操作行 + 明细两列网格）</figcaption></figure>
    <div class="callout warn">
      <h4>故障排查指引</h4>
      <p>① <b>库存页全空</b>：先确认店铺是否绑定物理仓（<code class="mono">physicalStockEnabled</code> 与仓库列表），无仓库时明细为空但概览仍显示 0，属预期；② <b>搜索无结果</b>：搜的是商品名/SKU/规格三类，语言取当前请求语言，切到英文时中文商品名可能搜不到，改搜 SKU 即可；③ <b>安全库存不生效</b>：按「SKU×仓 → SKU 全仓通用 → 渠道默认 → 10」逐级回退，若某 SKU 设了值仍显示 10，检查该行是否保存成功（保存只提交改动过的行）；④ <b>缺货数 ≠ 缺货列表条数</b>：概览卡是<strong>全量口径</strong>（不含关键词过滤），列表会叠加当前仓库与关键词，请先清空搜索再对比。</p>
    </div>
    <p class="muted" style="font-size:13px;">涉及文件：后端 <code class="mono">vendure/packages/cjk-plugin/src/inventory/</code>（<code class="mono">inventory-alert-rule.entity.ts</code>、<code class="mono">inventory-alert-rule.service.ts</code>、<code class="mono">inventory-stock.service.ts</code>、<code class="mono">stock-doc.service.ts</code>、<code class="mono">stock-doc.admin.resolver.ts</code>、<code class="mono">inventory-admin.resolver.ts</code>、<code class="mono">inventory-mode.custom-fields.ts</code>、<code class="mono">plugin.ts</code>、幂等迁移）——<strong>只新增 1 张表，不改既有表结构</strong>；前端 <code class="mono">vshop/web-admin/src/pages/inventory/{stock,alert-rules,stock-doc,movements}/</code>、<code class="mono">src/components/inventory/*</code>、<code class="mono">src/utils/inventoryFormat.ts</code>、<code class="mono">src/apis/{inventory,stock-doc,channel}.ts</code>、<code class="mono">src/pages.json</code>、双语语言包。部署：后端本地 <code class="mono">npm run build</code>（提交 <code class="mono">lib/</code>）→ 服务器 <code class="mono">git pull</code> + <code class="mono">pm2 restart vendure</code>；前端本地 <code class="mono">npm run build:h5</code> → <code class="mono">node scripts/deploy.mjs</code>（服务器不构建）。回滚：前端产物回退；后端回上一 commit + <code class="mono">pm2 restart</code>（新表保留不影响旧代码）。</p>
  </section>
```

并把页脚更新为（追加新章节说明；若 Plan 1 已先落地自己的章节，按实际序号写）：

```html
  <footer>vShop · web-admin 后台修复操作手册 · 生成于 2026-09-04（2026-09-13 追加第 12 章，2026-09-21 追加第 13 章） · 适用于 Nuxt/Vue3 uni-app H5 前端</footer>
```

> **序号说明**：Plan 1（订单列表）与本计划同属 2026-09-21，各自都要在手册里追加一章。以插入时文件里**最后一个 `<h2>` 的序号 +1** 为准：若 Plan 1 先落地（占 13），本章顺延为 14；插入位置（最后一个 `</section>` 之后、`<footer>` 之前）与截图文件名不变。

Run（校验章节与图片引用都在）:
```bash
node -e "const s=require('fs').readFileSync('docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html','utf8');['inventory-stock-v2','inv2_01_default.png','inv2_08_desktop.png'].forEach(k=>console.log(k, s.includes(k)))"
```
（cwd = `d:\zhao\vshop\web-admin`）

Expected: 三行全 `true`。

- [x] **Step 11: 复验清单（逐条对规格 §5 的 8 条验收标准）**

| # | 验收标准（规格 §5） | 复验方式 | 通过判据 |
| --- | --- | --- | --- |
| 1 | 概览 6 卡与点进去的筛选结果口径一致（缺货/低库存可点） | 手机打开库存页，先记录「缺货」卡数字，点该卡 | 列表条数 == 卡片数字；`低库存` 卡同理；点「SKU 数/库存总量/货值/近 7 天出库」不改变筛选（仅陈述） |
| 2 | 搜索商品名/SKU/规格在服务端命中，结果数与后端探针一致 | 用 Step 8 探针里 `keyword=<首行 SKU>` 的 `totalItems`，再在页面上搜同一 SKU | 页面显示的计数与探针 `totalItems` 完全相同；若该 SKU 在原列表第 2 页之后，页面仍能搜到（证明非页内过滤） |
| 3 | 状态 tabs 计数随仓库/关键词变化，且 tabs 之和 = 全部数 | 切换仓库胶囊、输入关键词，观察 4 个 tab 数字 | `缺货 + 低库存 + 正常 == 全部`；切换仓库/关键词后 4 个数字同时变化 |
| 4 | 明细卡片显示现存/占用/可用/安全库存/货值/最近变动，缩略图与商品名正确 | 对照 `inv2_01_default.png` 与实际商品 | 六个字段齐全；缩略图非空白且与该商品一致；无图时显示占位文案而非裂图 |
| 5 | 安全库存按 SKU×仓可保存并持久生效（未设置回退渠道默认） | 预警规则页改一行安全库存 → 保存 → 返回库存页看该行 → 重新进入页面再看一次 | 库存页该行安全库存 = 新值；重进页面仍是新值；未设过规则的 SKU 显示渠道默认值（默认 10） |
| 6 | 批量选品可生成采购入库单（单号回显），库存与流水同步更新 | 库存页勾选 1~2 行 → 点「生成采购单」→ 回库存页刷新 → 开流水页 | 弹出成功 Toast（含单号）；该 SKU 现存增加等于建议量；流水页出现 `direction=in` 的采购流水 |
| 7 | 单据中心能看到刚生成的单据；流水页可按方向/类型/日期筛选且汇总数与列表一致 | 打开单据中心「采购入库」tab；流水页切「出库 + 近 7 天」 | 单据中心出现第 6 步生成的单（单号/条数/总数量一致）；流水汇总条 `入/出` 合计与当前列表的加减总和一致 |
| 8 | 三种失败场景均弹 Toast 且不清空列表 | ① 搜索时断网/改错接口；② 保存规则时断网；③ 调整库存时断网 | 三种情况都出现明确错误文案；**页面列表保持上一次结果**（不被清空、不显示空态） |

- [x] **Step 12: 回滚方案**

> **本计划实际落地的提交（回滚以此为界）**
> - 前端（`D:/zhao/vshop`）：`d9614af`（批量/补货/调整目标仓兜底虚拟仓）← `2ace457`（库存与预警 v2 主体 + 双语文案）← `8c68496`（规格与 mockup，**回滚边界**）
> - 后端（`D:/zhao/vendure`）：`6e8bc1fa4`（PG 别名两参）← `537016512`（按渠道过滤变体）← `c43649590`（放开租户侧权限）← `8d9ed3ce4`（后端支撑主体）← `b8f2261fc`（**回滚边界**，本计划之前）

**前端（秒级回滚，无数据风险）**：

```bash
git revert --no-edit 2ace457 d9614af
npm run build:h5
node scripts/deploy.mjs
```

（或直接用上一次部署包重跑 `deploy.mjs`——静态目录替换即生效，无需 nginx reload。）

**后端**：

```bash
cd /www/apps/vendure
git revert --no-edit 8d9ed3ce4 c43649590 537016512 6e8bc1fa4   # 或 git reset --hard b8f2261fc（确认无他人提交）
git pull                                      # 若走 revert 提交
npm run build --prefix packages/cjk-plugin    # 本地构建后提交 lib/ 再上线；服务器不构建
pm2 restart vendure
```

回滚影响评估（规格 §7）：
- **仅新增 1 张表 `inventory_alert_rule`**，不改既有表结构；`stock_doc` / `stock_doc_item` / `stock_level` 的写入路径未变（单据仍「下单即生效」）。
- 回滚后**新表保留不影响旧代码**（旧代码不查询它）；新增长的表可留待下次上线继续使用，无需删除。
- 前端回滚后旧库存页仍可用：旧页只依赖 `stockLevels` 与既有 `fetchStock/stockLocations`，不依赖本次新增的任何查询。
- 若前端已上线而后端回滚（错序），库存页会因 `inventoryStockPage` 不存在而报错 → 用 Step 9 的 Toast 观察即可定位，按上面顺序回滚前端。

---

# 自检

## A. Spec coverage（逐条对规格 `docs/superpowers/specs/2026-09-21-inventory-stock-upgrade-design.md`）

### A.1 §3 设计

| 规格条目 | 落点 | 状态 |
| --- | --- | --- |
| §3.1.1 A 新表 `inventory_alert_rule`（含 `locationId=0` 哨兵、唯一约束、幂等建表、加入 `entities`） | Task 1 Step 1、Step 1-B、Step 4 | 覆盖 |
| §3.1.1 B 渠道默认安全库存 `inventoryDefaultSafetyStock`（`inventory-mode.custom-fields.ts`）+ 四级回退纯函数 `resolveSafetyStock` | Task 1 Step 3、Step 2（`alert-rule-math.ts` + spec） | 覆盖 |
| §3.1.1 C `inventoryStockPage` 聚合查询（SDL 七处类型 + resolver + `pageSize` 夹取 + `sort/bucket` 非法回退 + 摘要为全量口径） | Task 2 Step 0~9（含 Step 0 探针核对 `stock_level`/`product_translation`/`asset` 真实列名与 `rawConnection.query()` 等价写法） | 覆盖 |
| §3.1.1 D `inventoryAlertRules` / `saveInventoryAlertRules`（幂等 upsert、负值报错、0=不预警、写权限 `UpdateStockLocation`） | Task 3 Step 1、Step 3（SDL 四处之一/二） | 覆盖 |
| §3.1.1 E `stockDocList` + `StockDocSummaryRow`（`itemCount`/`totalQty` 由 `SUM(CASE WHEN ...)` 一次取出） | Task 3 Step 2、Step 3（SDL 四处之三/四） | 覆盖 |
| §3.1.1 F `stockMovementLedger` 扩展 `bizType/direction/from/to` + `summary { inQty outQty }`（向后兼容） | Task 3 Step 2（自建 QueryBuilder，移除 `StockLedgerService` 注入）、Step 3 | 覆盖 |
| §3.1.1 G 双端注册硬性要求（`adminApiExtensions` 与 `shopApiExtensions` 两套 SDL/resolvers；`providers`/`entities`/迁移） | Task 1 Step 4（entities/providers/migrations）、Task 2 Step 9、Task 3 Step 6（各写明「仅 admin 侧」的判定依据） | 覆盖 |
| §3.1.2 前端 API 层（`apis/inventory.ts`、`apis/stock-doc.ts`、全变量化传参） | Task 5 Step 4~6（+ `apis/channel.ts` 扩展 `inventoryDefaultSafetyStock`） | 覆盖 |
| §3.2.1 库存主页（概览 6 卡→胶囊→搜索/排序→tabs→宫格 8 项→明细→批量条；400ms 防抖；`seq` 竞态；空态区分） | Task 7 Step 1、Step 3 | 覆盖 |
| §3.2.2 预警规则页（渠道默认 + SKU 列表 + 保存，复用 `inventoryStockPage(keyword, sort=stockAsc)`） | Task 8 Step 1 | 覆盖 |
| §3.2.3 单据中心（5 类型 tabs + 单据卡片 + 触底/下拉） | Task 8 Step 2、Step 3（`enablePullDownRefresh`） | 覆盖 |
| §3.2.4 流水页升级（入出汇总 + 方向/业务类型/仓库/日期预设 + 按日分组 + `productVariantId` 带参进入） | Task 9 Step 1 | 覆盖 |
| §3.2.5 路由与文案（`pages.json` 新增 2 条；`zh-Hans.json` + `en.json` 同步：`inventoryStock.*` 分组重写、`inventoryAlertRules.*`、`stockDocCenter.*`、`inventoryMovements.*` 扩展） | Task 7 Step 3、Task 8 Step 3/4/5（含键序平行校验命令） | 覆盖 |
| §3.3 组件边界（3 个组件 + props/emits；排序/分桶一律服务端，前端只做展示格式化） | Task 6 Step 1~3（props/emits 与契约表 1.4 一致）；`bucketOf` **不在前端实现**，`bucket` 由服务端返回 | 覆盖（含下方偏差 2） |
| §3.4 多语言与设计令牌（全走 i18n；只用 `$wa-*`；桌面 `@media (min-width: 768px)`） | Task 6 Step 1~3 样式、Task 7 Step 1（桌面操作行 + 2 列网格）、Task 8 Step 3、Task 9 Step 1 | 覆盖 |

### A.2 §4 错误处理

| 规格要求 | 落点 |
| --- | --- |
| `catch` → `graphQlErrorMsg(e, 兜底文案)` → Toast，**保留上次结果不清空** | Task 5 Step 4~6（API 层不吞错）、Task 7 Step 2（`load/loadMore/onConfirmAdjust/onConfirmSafety` 全部保留旧数组）、Task 8 Step 1/2、Task 9 Step 1 |
| 竞态 `seq` 自增守卫，旧响应丢弃 | Task 7 Step 2、Task 8 Step 1/2、Task 9 Step 1 |
| 空 `keyword`/`bucket` 不传字段（避免空串被当成 LIKE） | Task 5 Step 4（`keyword: kw || undefined`）、Task 7 Step 2（`applyFilter` 组装）、Task 8 Step 1 |
| 安全库存校验：负数报错、`0` 提示不再预警 | Task 5 Step 1（`parseQtyInput`）、Task 8 Step 1（`defaultInvalid`/`safetyInvalid`/`saving` 分支） |
| 调整库存：非整数/负数拒绝；提交后重拉当前页 | Task 5 Step 1（`parseQtyInput`）、Task 7 Step 2（`onConfirmAdjust` → `adjustStock` → `load(true)`） |
| 后端对非法 `sort`/`bucket` 回退默认不抛异常；`saveInventoryAlertRules` 对非本租户仓/变体拒绝 | Task 2 Step 6/7（回退默认）、Task 3 Step 1（越权拒绝 + `safetyStock < 0` 报错） |

### A.3 §5 测试与验收（8 条验收标准逐条对位）

| # | 验收标准 | 计划内的验证步骤 |
| --- | --- | --- |
| 1 | 概览 6 卡口径一致（缺货/低库存可点） | Task 10 Step 11 第 1 行 + Step 8 探针「分桶计数之和 == 全部数」+ Step 9 图 `inv2_01/inv2_02` |
| 2 | 搜索商品名/SKU/规格在服务端命中 | Task 10 Step 8 探针「keyword 命中数 ≤ 全量且 ≥ 1」+ Step 11 第 2 行 + 图 `inv2_03` |
| 3 | tabs 计数随仓库/关键词变化且之和 = 全部数 | Task 10 Step 8（`summary` 断言）+ Step 11 第 3 行 + 图 `inv2_01`（tabs 带计数） |
| 4 | 明细显示现存/占用/可用/安全库存/货值/最近变动 + 缩略图/商品名 | Task 10 Step 8（`items` 全字段断言）+ Step 11 第 4 行 + 图 `inv2_01` |
| 5 | 安全库存按 SKU×仓可保存并持久生效 | Task 1 Step 2 单测（四级回退）+ Task 10 Step 8（`inventoryAlertRules`/渠道默认）+ Step 11 第 5 行 |
| 6 | 批量生成采购入库单（单号回显），库存与流水同步 | Task 7 Step 2（`onBulkPurchase` + 建议量 + `costPrice` 透传）+ Task 10 Step 11 第 6 行 |
| 7 | 单据中心可见新单据；流水筛选且汇总与列表一致 | Task 10 Step 8（`stockDocList` 非空 + type 过滤）+ Step 11 第 7 行 + 图 `inv2_06/inv2_07` |
| 8 | 三种失败场景弹 Toast 且不清空列表 | Task 7/8/9 的 `catch` 保留旧结果 + Task 10 Step 11 第 8 行（断网法） |

其余 §5 要求：后端单测（Task 1 Step 2、Task 2 Step 2）、前端单测（Task 5 Step 1，TDD 五步）、类型检查（Task 10 Step 2）、构建（Task 10 Step 4）、接口回归探针（Task 10 Step 8）、手机视口截图 8 张（Task 10 Step 9）、补入操作手册（Task 10 Step 10）——**全部有独立可执行步骤**。

### A.4 §6 部署 / §7 影响面与回滚 / §8 明确不做

- §6 部署：Task 10 Step 5（提交含后端 `lib/` 产物）→ Step 6（服务器 `git pull` + `pm2 restart vendure`，**不在服务器构建**）→ Step 7（前端 `build:h5` + `deploy.mjs`），顺序与规格一致并显式写明「先后端后前端」的原因。
- §7 影响面与回滚：Task 10 Step 12（前端 `revert` + 重发产物；后端回上一 commit + `pm2 restart`；新表保留不影响旧代码；并给出「错序回滚」的定位方法）。改动文件清单在 Task 10 Step 10 的 `<p class="muted">` 与契约表正文中逐项落地。
- §8 明确不做：全计划**未**引入批次/效期（FEFO）、在途库存、条码字段、Excel/CSV 导出、库存页多版式（积木式）、调拨审批流/盘点指派；搜索范围严格限定「商品名/SKU/规格」三类（Task 2 Step 4 的 LIKE 条件）。

### A.5 与规格的两处显式偏差（已在本计划内定稿，避免执行时二义）

1. **后端单测运行器**：规格 §5 写 `npx tsx --test`，但 `packages/cjk-plugin` 未安装 `tsx`，该包既有测试约定是 **vitest**。定稿为 `npm test --prefix packages/cjk-plugin`（Task 1 Step 2 已写明理由）。
2. **`InventoryStockRow.bucket`**：规格 §3.3 要求「前端不重复实现 `bucketOf`」，但 §3.1.1 C 的 `InventoryStockRow` 里没有 `bucket` 字段，前端将无法在不重算的前提下打状态标签。定稿为**服务端在 `InventoryStockRow` 追加 `bucket: String!`**（additive，不改动规格已列字段），前端只消费（Task 2 Step 5/6 + 契约表 1.1/1.4）。

## B. Placeholder scan

Run:
```bash
rg -n "TBD|TODO|待补|类似 Task" docs/superpowers/plans/2026-09-21-inventory-stock-upgrade.md
```
（cwd = `d:\zhao\vshop\web-admin`；无 `rg` 时用 `git grep -n -E` 或编辑器查找替代）

Expected: **仅命中本节（自检 B 节）的这条命令行自身**，正文 0 命中。即：全文所有代码步骤均为**完整文件或完整替换片段**，不存在「此处省略」「待补」「XX 同 Task N」之类的引用式偷懒。

已核实项：
- 每个 Step 的代码块都是可直接粘贴的**完整文件**（`.ts`/`.vue` 全文）或**精确到行的替换指令**（带 before/after 片段，如 Task 7 Step 2 采购页 `onLoad`、Task 8 Step 3 `pages.json` 第 33 行、Task 8 Step 4 `zh-Hans.json` 第 909–926 行）；
- 每个代码步骤都带 `Run:`（可复制的命令）与 `Expected:`（可判定的结果，含具体数字/字符串）；
- 5 个纯函数步骤（后端 `alert-rule-math`、`stock-page-math`，前端 `inventoryFormat`）全部按 **TDD 五步**（先写测试 → 跑红 → 写实现 → 跑绿 → 提交）；
- Task 6~9 的破坏性连续改造已在 Task 6 开头显式声明「中间态不保证类型检查/构建通过，Task 10 Step 2 统一收口」。

## C. Type consistency（跨任务类型/函数/事件名一致性）

**C.1 GraphQL 契约（契约表 1.1 ↔ 实现 ↔ 消费）**

| 契约项 | 后端实现 | 前端 API | 前端消费 |
| --- | --- | --- | --- |
| `inventoryStockPage(input)` → `{ totalItems, summary, items }` | Task 2 Step 6（SDL）/ Step 7（resolver） | Task 5 Step 4 `fetchInventoryStockPage` | Task 7 Step 2（`load`）、Task 8 Step 1（`load`） |
| `InventoryStockSummary` 九字段（`skuCount/onHandTotal/allocatedTotal/availableTotal/valueTotal/outCount/lowCount/okCount/outbound7d`） | Task 2 Step 6/7 | Task 5 Step 4（同名 TS 接口） | Task 6 Step 1 `InventoryKpiBar`（`props.summary`，逐字段渲染 6 卡）、Task 7 Step 2 `EMPTY_SUMMARY`（九字段全列，无缺项） |
| `InventoryStockRow` 字段（`variantId/productId/variantName/sku/optionText/thumbnail/stockLocationId/locationName/onHand/allocated/available/safetyStock/value/costPrice/bucket/lastMovementAt/lastDirection/lastBizType`） | Task 2 Step 5（纯函数）/ Step 7（row 映射） | Task 5 Step 4 | Task 6 Step 2 `InventoryStockCard`（`row.onHand/allocated/available/safetyStock/value/thumbnail/variantName/sku/optionText/locationName/bucket/lastMovementAt/lastDirection/lastBizType`）、Task 7（`r.variantId`/`r.stockLocationId`/`r.sku`/`r.variantName`）、Task 8 Step 1（`r.variantId`/`r.safetyStock`/`r.sku`/`r.variantName`/`r.locationName`/`r.onHand`） |
| `bucket` 取值 `'' / 'out' / 'low' / 'ok'` | Task 2 Step 5 `bucketOf` + Step 6（`String` 类型 + 非法回退） | Task 5 Step 5 `bucketKey`（返回裸键 `bucket.*`） | Task 6 Step 2（`` `inventoryStock.${bucketKey(...)}` `` 带前缀）、Task 7 Step 2 `onKpiPick('')`/`onKpiPick('out')`/`onKpiPick('low')`、Task 6 Step 3 `bucket === '' / 'out' / 'low' / 'ok'` |
| `sort` 取值 `stockAsc / stockDesc / gapDesc / valueDesc` | Task 2 Step 5 `sortCompare` | Task 5 Step 5 `sortKey`（返回 `sort.*` 裸键 → 页面补 `inventoryStock.`） | Task 6 Step 3 `SORT_KEYS`、Task 7 Step 2 `sort = ref('stockAsc')` |
| `inventoryAlertRules(locationId)` → `InventoryAlertRule { variantId locationId safetyStock enabled }` | Task 3 Step 1（service）/ Step 3（SDL） | Task 5 Step 5 `fetchInventoryAlertRules(locationId: string \| null)` | Task 8 Step 1（`fetchInventoryAlertRules(null)` = 全仓通用哨兵 0；字段读取 `r.variantId/r.safetyStock/r.enabled`） |
| `saveInventoryAlertRules(locationId, items)` + `InventoryAlertRuleInput` | Task 3 Step 1 / Step 3 | Task 5 Step 5 | Task 8 Step 1（`payload: InventoryAlertRuleInput[]`，字段名 `variantId/safetyStock/enabled` 与契约一致） |
| `stockDocList(type, page, pageSize)` → `{ totalItems, items: StockDocSummaryRow }`（`id/code/type/remark/operator/createdAt/itemCount/totalQty`） | Task 3 Step 2（自建 QueryBuilder 的 `CASE WHEN` 汇总）/ Step 3 | Task 5 Step 6 `fetchStockDocList` | Task 8 Step 2（`d.id/d.code/d.type/d.itemCount/d.totalQty/d.remark/d.operator/d.createdAt`） |
| `stockMovementLedger` 新增 `bizType/direction/from/to` + `summary { inQty outQty }` | Task 3 Step 2（入参扩展 + summary） | Task 5 Step 6 `fetchMovements`（`MovementQueryParams` 扩展 + 返回 `summary`） | Task 9 Step 1（`summary.inQty/outQty`、`bizType/direction/from/to` 组装；`dateFrom(preset)` 产出 ISO 字符串传 `from`） |

**C.2 组件契约（契约表 1.4 ↔ 定义 ↔ 页面传参）**

| 组件 | props / emits（契约 1.4） | 定义 | 页面传参 |
| --- | --- | --- | --- |
| `InventoryKpiBar` | `props: summary`；`emits: pick(bucket)` | Task 6 Step 1 | Task 7 Step 1 `<InventoryKpiBar :summary="summary" @pick="onKpiPick" />` |
| `InventoryStockCard` | `props: row, selected`；`emits: toggle / open-movements / replenish / adjust` | Task 6 Step 2 | Task 7 Step 1（`:row / :selected` + 四个 `@` 处理器，名字逐字一致） |
| `InventoryFilterBar` | `props: locations, locationId, keyword, sort, bucket, buckets`；`emits: location / search / sort / bucket-change` | Task 6 Step 3 | Task 7 Step 1（`:locations="locOptions"`、`:location-id`、`:keyword`、`:sort`、`:bucket`、`:buckets` + `@location/@search/@sort/@bucket-change`） |

**C.3 前端纯函数与消费方（`src/utils/inventoryFormat.ts`，Task 5 Step 1 定义）**

| 函数 | 返回 | 消费方 |
| --- | --- | --- |
| `fenToYuan(fen)` | 字符串元 | Task 6 Step 1 `InventoryKpiBar`（`money` computed） |
| `moneyLabel(value)` | `¥x.xx` / `—`（`value<=0`） | Task 6 Step 2（货值行） |
| `suggestQty(safetyStock, onHand)` | `max(0, safety - onHand)` | Task 7 Step 2（`onBulkPurchase` 用 `Math.max(1, suggestQty(...))`，并在单条「补货」里作为 `qty` 预填） |
| `parseQtyInput(raw, fallback)` | 非负整数 / fallback | Task 7 Step 2（`onAdjustInput`/`onSafetyInput`）、Task 8 Step 1（`onRuleInput`/`onSaveDefault`/`onSaveRules`，`fallback = -1` 表示非法） |
| `bucketKey(bucket)` / `dirKey(dir)` / `bizTypeKey(biz)` | **不含命名空间的裸键**（`bucket.out` / `move.in` / `move.purchase` …） | Task 6 Step 2、Task 7 Step 1（`` `inventoryStock.${sortKey(sort)}` ``）、Task 9 Step 1（`` `inventoryStock.${bizTypeKey(b)}` ``）——**调用处一律补 `inventoryStock.` 前缀**，与契约 1.5 的字典层级一致 |
| `sortKey(sort)` | `sort.*` 裸键 | Task 7 Step 1 |
| `formatDateTime(iso)` | `MM-DD HH:mm` / `''` | Task 6 Step 2（最近变动）、Task 8 Step 2（单据时间）、Task 9 Step 1（流水时间） |
| `dayKey(iso)` | `YYYY-MM-DD` / `''` | Task 9 Step 1（按日分组） |

**C.4 后端纯函数（Task 1/2 定义 + 单测）**

| 函数 | 语义 | 使用方 |
| --- | --- | --- |
| `resolveSafetyStock(ruleAtLocation, ruleGlobal, channelDefault, FALLBACK=10)` | 四级回退 | Task 2 Step 7（聚合查询逐行解析） |
| `bucketOf(onHand, safetyStock)` | `onHand<=0 → 'out'`；`onHand<safetyStock → 'low'`；否则 `'ok'` | Task 2 Step 7（row.bucket）+ Step 7（`SUM(CASE WHEN ...)` 分桶计数） |
| `sortCompare(a, b, key)` | 四种排序比较 | Task 2 Step 7（TS 端排序） |
| `modes`/`capability` 系列 | 本计划**不涉及**（属 G9 既有能力） | — |

**C.5 i18n 与路由**

| 项 | 契约位置 | 落地位置 |
| --- | --- | --- |
| `inventoryStock.*`（含 `kpi/sort/bucket/quick/card/num/move/bulk/adjust/safety/empty.*`）、`inventoryAlertRules.*`、`stockDocCenter.*`、`inventoryMovements.*`、`stockDocPurchase.prefilled` | 契约表 1.5 | Task 8 Step 4（zh-Hans）/ Step 5（en，键序平行）；消费方 Task 6/7/8/9 |
| `pages/inventory/alert-rules/index`、`pages/inventory/stock-doc/index`、`movements`/`stock` 的 `enablePullDownRefresh` | 契约表 1.6 | Task 7 Step 3（stock）、Task 8 Step 3（三个路由一次落地） |
| 跳转参数 `movements?productVariantId=`、`stock-doc/purchase/index?variantId=&qty=&locationId=` | 契约表 1.6 | Task 7 Step 1（`onOpenMovements`/`onReplenish`）+ Step 2（采购页 `onLoad` 读三个参数）+ Task 9 Step 1（读 `productVariantId`） |

**C.6 据以上核对，未发现跨任务不一致**：接口名、字段名、`bucket`/`sort` 取值、组件 props/emits、i18n 键路径、路由与参数名在「契约表 → 后端实现 → 前端 API → 页面/组件消费 → 文档/截图」五层之间逐项对应；唯一需要调用方注意的是 **`bucketKey/dirKey/bizTypeKey` 返回裸键、调用时必须补 `inventoryStock.` 前缀**（已在 Task 6/7/9 代码中统一带前缀，并在契约表 1.5 注明）。

---

# 执行顺序速查（按序勾选）

1. Task 1（后端：规则实体/纯函数/迁移/注册）
2. Task 2（后端：`inventoryStockPage` 聚合查询 — 先跑 Step 0 探针核对真实列名）
3. Task 3（后端：规则读写/单据列表/流水扩展）
4. Task 4（后端：`npm run build` + 本地只读探针）
5. Task 5（前端：`inventoryFormat.ts` TDD + API 层扩展）
6. Task 6 → 7 → 8 → 9（前端：组件 → 库存主页 → 新两个页面 → 流水页；**连续破坏性改造，中途不判 tsc/构建**）
7. Task 10（前端全量类型检查 → 构建 → 提交 → 后端部署 → 前端部署 → 线上探针 → 8 张手机截图 → 操作手册 → 复验清单 8 条 → 回滚）

**交付定义（硬性）**：实现 + 后端单测 + 前端单测 + `tsc --noEmit` 全绿 + `build:h5` 成功 + 线上只读探针全 PASS + 8 张手机视口截图（390×844，dpr=2）已补进操作手册 + 复验清单 8 条逐条通过 + 回滚方案已演练说明。