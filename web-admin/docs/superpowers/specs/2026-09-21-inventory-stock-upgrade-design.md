# 库存页面升级设计规格（Plan 2）

> 目标页面：`https://e.joho.cn/guanli/#/pages/inventory/stock/index`（「库存与预警」）
> mockup（推荐方案，已选定）：`docs/superpowers/mockups/inventory-v2/index.html`
> 关联仓库：前端 `d:\zhao\vshop\web-admin`，后端 `d:\zhao\vendure`（插件 `packages/cjk-plugin`）
> 前置计划：`plans/2026-09-21-order-list-filter-state-layout.md`（Plan 1，订单列表）

---

## 一、现状与问题

### 1.1 页面现状（`src/pages/inventory/stock/index.vue`，184 行）

| 项 | 现状 | 问题 |
| --- | --- | --- |
| 数据源 | `fetchStock(loc.id, 1, 200)`（core `stockLevels`） | 一次拉 200 条，无分页/刷新/触底加载 |
| 展示字段 | 仅 `productVariantId`（裸 ID）、`stockOnHand` | 运营看不出这是哪个商品；无缩略图/名称/SKU/规格 |
| 关键词搜索 | **无** | 找单个商品只能肉眼翻页 |
| 排序 | **无**（后端返回顺序） | 无法「先看库存最少的」 |
| 状态维度 | 侧算「低于全局阈值档位」 | 阈值是全页统一档位（5/10/20/50），不能按 SKU 设安全库存 |
| 汇总 | **无** | 看不到 SKU 总数、库存总量、货值、缺货/预警数 |
| 占用/可用 | 仅显示 `stockOnHand` | `stockAllocated`（已占用）与可用数看不到 |
| 快捷入口 | **无** | 采购/移库/盘库/出库/流水/仓库页只能靠别处进入 |
| 流水页 | 拉 50 条、无筛选、无汇总 | 排查「这个 SKU 为什么少了」做不到 |
| 单据 | 只能创建，**无列表** | 采购/移库/盘库单据创建后不可追溯 |
| 预警规则 | **不存在**（无表、无接口） | 无法设置安全库存 |

### 1.2 后端能力现状（`packages/cjk-plugin`）

- 已有：`createStockDoc`（PURCHASE/TRANSFER/STOCKTAKE/ISSUE，**下单即生效**，经 `VirtualPhysicalStockService.adjustPhysicalStock/setPhysicalStock` 落 `stock_level` 并写流水）、`stockMovementLedger(productVariantId/locationId/bizCode/orderLineId/page/pageSize)`、`tenantInventoryOverview` 系列（租户仓 CRUD + 四道删仓校验）。
- 表：`stock_doc`（type/tenantChannelId/code/remark/operator/createdAt）、`stock_doc_item`（docId/variantId/from-、toStockLocationId/qty/realQty/costPrice/difference）。
- 流水：`@vendure/inventory-plugin` 的 `StockLedgerService.list()`。
- **缺失**（本规格要补的）：安全库存/预警规则（无字段、无表）、库存汇总、库存货值、按关键词的库存查询、单据列表、流水多条件筛选。
- **不打算补**（见第八节）：批次/效期、在途库存、条码字段、Excel 导出。

---

## 二、设计目标与中国本地化对标

按国内中小商家手机端库存管理的通用形态对标，本轮补齐 6 件事：

1. **概览**：在售 SKU 数、库存总量、库存货值、缺货数、低库存预警数、近 7 天出库量。
2. **多维定位**：多仓切换（本店物理仓 + 虚拟仓）、状态分桶（全部/缺货/低库存/正常，带服务端计数）、关键词搜索（商品名/SKU/规格，**服务端**）、排序（库存升/降、缺口、货值）。
3. **明细富化**：缩略图 + 商品名 + SKU + 规格 + 现存/占用/可用 + 安全库存 + 货值 + 最近一次出入库 + 状态标签。
4. **预警可配**：安全库存按「SKU × 仓库」设置，可回退「SKU 全仓通用」再回退「渠道默认值」。
5. **闭环操作**：批量选品 → 一键生成采购入库单；批量设安全库存；行内快捷补货/调整/查流水。
6. **可追溯**：新增「单据中心」（采购/移库/盘库/出库单据列表）+ 流水页升级（方向/业务类型/仓库/日期筛选 + 入出汇总）。

---

## 三、设计

### 3.1 数据层

#### 3.1.1 后端新增（`packages/cjk-plugin/src/inventory/`）

**A. 新表 `inventory_alert_rule`（预警规则）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | increment | 主键 |
| tenantChannelId | string | 归属租户渠道编码（沿用 `stock_doc` 的 scoping 口径） |
| variantId | int | 商品变体 |
| locationId | int, default 0 | **0 = 该租户全部仓通用**；>0 = 指定仓覆盖 |
| safetyStock | int, default 10 | 安全库存；可含 0（等于关闭该 SKU 预警） |
| enabled | boolean, default true | 是否参与预警 |
| updatedAt | datetime | 最后修改时间 |

唯一约束 `(tenantChannelId, variantId, locationId)`。用 `locationId = 0` 哨兵表示「全仓通用」，**不用 nullable**（规避不同库对 NULL 唯一索引的差异）。

- 建表方式：沿用 `src/migrations/migrate-stock-tables.ts` 的**幂等建表**写法（`CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`），并加入 `plugin.ts` 的 `entities` 数组；生产 postgres `synchronize:true` 亦可自动建（双保险，与既有插件实体一致）。

**B. 渠道默认安全库存（复用既有 customFields 通道）**

在 `inventory-mode.custom-fields.ts` 的 `inventoryModeChannelFields` 追加：

```ts
{ name: 'inventoryDefaultSafetyStock', type: 'int', defaultValue: 10, nullable: true,
  label: [{ languageCode: LanguageCode.zh_Hans, value: '默认安全库存' }] },
```

解析优先级（纯函数 `resolveSafetyStock`，可单测）：

```
SKU×仓规则（enabled） → SKU 全仓通用规则（enabled） → 渠道 inventoryDefaultSafetyStock → 常量 10
```

**C. 新查询 `inventoryStockPage`（一次请求拿齐页面所需）**

```graphql
input InventoryStockQueryInput {
  locationId: ID          # 空 = 本租户全部仓按变体聚合（SUM）
  keyword: String         # 商品名 / SKU / 规格，服务端 LIKE
  bucket: String          # '' | 'out' | 'low' | 'ok'
  sort: String            # 'stockAsc' | 'stockDesc' | 'gapDesc' | 'valueDesc'
  page: Int
  pageSize: Int
}
type InventoryStockSummary {
  skuCount: Int!  onHandTotal: Int!  allocatedTotal: Int!  availableTotal: Int!
  valueTotal: Int!        # 分；按最近一次采购成本 × 现存
  outCount: Int!  lowCount: Int!  okCount: Int!  outbound7d: Int!
}
type InventoryStockRow {
  variantId: ID!  productId: ID  variantName: String!  sku: String!  optionText: String  thumbnail: String
  stockLocationId: ID  locationName: String
  onHand: Int!  allocated: Int!  available: Int!
  safetyStock: Int!  value: Int!  costPrice: Int
  lastMovementAt: String  lastDirection: String  lastBizType: String
}
type InventoryStockPage { totalItems: Int! summary: InventoryStockSummary! items: [InventoryStockRow!]! }
```

实现要点（`InventoryStockService`，TypeORM query builder，基表 `stock_level` / `product_variant` / `product_translation` / `asset` / `stock_doc_item` 子查询 / `inventory_alert_rule`）：

- 仓库范围：`locationId` 空 → 取该租户全部物理仓（`stock_location.customFields.code LIKE '{tenantCode}%'` 且 `kind='physical'`），按 `variantId` 分组 SUM；非空 → 只取该仓。
- 关键词：`v.sku LIKE :kw OR pt.name LIKE :kw OR (v.optionValues 文本) LIKE :kw`；`pt.languageCode` 取当前请求语言。
- 安全库存：`COALESCE(仓级规则, 全仓通用规则, 渠道默认, 10)`。
- 货值：左连「该 variant 最近一条 `stock_doc_item.costPrice`（PURCHASE/TRANSFER 且非空）」子查询；无成本价 → `value = 0`（页面显示「—」）。
- 最近变动：左连流水按 `variantId` 取 `MAX(createdAt)` 那条的 `direction/bizType`。
- 分桶与汇总：先按过滤条件分组计数（一次 SQL 用 `SUM(CASE WHEN ...)`），`summary` 为**不带 bucket 过滤**的全量口径（与 Plan 1 的「统计卡=全量口径」一致），`buckets` 计数用于 tabs。
- `outbound7d`：流水近 7 天 `direction='out'` 的 `SUM(quantity)`。
- 权限：`@Allow(InventoryPermissions.ViewStock)`。

**D. 预警规则读写**

```graphql
type InventoryAlertRule { variantId: ID!  locationId: ID  safetyStock: Int!  enabled: Boolean! }
input InventoryAlertRuleInput { variantId: ID!  safetyStock: Int!  enabled: Boolean  locationId: ID }
query inventoryAlertRules(locationId: ID): [InventoryAlertRule!]!
mutation saveInventoryAlertRules(locationId: ID, items: [InventoryAlertRuleInput!]!): [InventoryAlertRule!]!
```

- 保存为幂等 upsert；`safetyStock < 0` → 报错；`safetyStock = 0` 视为该 SKU 不预警。
- 权限：View 用 `ViewStock`，写用 `UpdateStockLocation`（沿用 cjk 既有库存配置写权限口径）。

**E. 单据列表**

```graphql
type StockDocSummaryRow { id: ID!  code: String!  type: String!  remark: String  operator: String
  createdAt: String!  itemCount: Int!  totalQty: Int! }
query stockDocList(type: String, page: Int, pageSize: Int): StockDocList!
type StockDocList { totalItems: Int! items: [StockDocSummaryRow!]! }
```

**F. 流水多条件筛选**（扩展既有 `stockMovementLedger`，保持向后兼容）

新增可选入参：`bizType: String`、`direction: String`、`from: String`、`to: String`；并在返回体加 `summary { inQty outQty }`（同条件汇总）。

**G. 双端注册硬性要求**

`plugin.ts` 的 `adminApiExtensions` 与 `shopApiExtensions` 是两套独立 SDL + resolvers 数组：本次新增全部为**管理端**能力，仅注册 admin 侧；但 `InventoryStockService`/`InventoryAlertRuleService` 需加入 `providers`，`InventoryAlertRuleEntity` 加入 `entities` 与迁移。

#### 3.1.2 前端 API 层

- `src/apis/inventory.ts` 扩展：`fetchInventoryStockPage(input)`、`fetchInventoryAlertRules(locationId)`、`saveInventoryAlertRules(locationId, items)`、保留 `fetchStockLocations/fetchTenantInventoryOverview`。
- `src/apis/stock-doc.ts` 扩展：`fetchStockDocList(params)`、`fetchMovements(params)` 增加 `bizType/direction/from/to` 入参与 `summary` 出参。
- 全部走 GraphQL 变量化传参（沿用项目既有约定，不做字符串内插）。

### 3.2 页面结构

#### 3.2.1 `pages/inventory/stock/index.vue`（整页重做）

自上而下：**概览 6 卡 → 仓库胶囊 → 搜索 + 排序 → 状态 tabs（带计数）→ 快捷宫格 8 项 → 明细列表（卡片/触底加载）→ 批量条**。

- 概览卡点击＝按对应口径筛选（缺货 → `bucket='out'`；低库存 → `bucket='low'`；其余卡不做筛选，仅陈述）。
- 仓库胶囊：`全部仓` + 本租户物理仓（虚拟仓也在列，但默认选第一个物理仓；无物理仓时退回第一个仓）。
- 搜索：输入 400ms 防抖后请求；回车/点击即请求。
- 排序：`库存从低到高 / 从高到低 / 缺口从大到小 / 货值从大到小`。
- 状态 tabs 计数来自 `summary.outCount/lowCount/okCount/skuCount`，随「仓库 + 关键词」条件变化（与 Plan 1 的「分组计数跟随过滤条件、统计卡为全量口径」口径一致；`bucket` 本身不参与 summary 计算）。
- 明细卡片：缩略图（`thumbnail`，无图占位）、商品名、SKU、规格、四数（现存/占用/可用/安全库存）、货值、最近变动、状态标签；行内操作「流水」（跳流水页并按 variantId 预筛）、「补货」（打开采购入库页并预填 variantId + 建议量）、「调整」（弹层输入目标库存 → `setVariantStock`）。
- 批量条：勾选低于安全库存的行 → 「生成采购单」（建议量 = `safetyStock - onHand`）或「设为安全库存」（弹层批量设值）。
- 交互细则：竞态用自增 `seq` 守卫；`loading/loadingMore/finished` 状态机；下拉刷新 `onPullDownRefresh`；触底 `onReachBottom`；空态区分「无数据」与「无匹配」。

#### 3.2.2 `pages/inventory/alert-rules/index.vue`（新增）

- 默认安全库存（渠道级，一行可改）+ 列表（当前租户有库存的 SKU，含商品名/SKU/当前仓/现存/安全库存输入框/启用开关）+ 保存。
- 列表支持关键词搜索（复用 `inventoryStockPage` 的 keyword + 排序 stockAsc），分页加载。

#### 3.2.3 `pages/inventory/stock-doc/index.vue`（新增，单据中心）

- 类型 tabs：全部/采购入库/移库/盘库/手动出库（带计数可省，`stockDocList` 按 type 过滤）+ 单据卡片（单号、类型、条数、总数量、备注、操作人、时间）+ 触底加载 + 下拉刷新。

#### 3.2.4 `pages/inventory/movements/index.vue`（升级）

- 顶部汇总条（入/出合计）+ 筛选（方向、业务类型、仓库、日期区间预设：今日/近 7 天/本月）+ 按日期分组的流水列表 + 触底加载 + 下拉刷新。
- 支持从库存页带参进入（`productVariantId`）。

#### 3.2.5 路由与文案

- `pages.json` 新增 2 条：`pages/inventory/alert-rules/index`（预警规则）、`pages/inventory/stock-doc/index`（单据中心）。
- `locale/zh-Hans.json` + `en.json` 同步补充：`inventoryStock.*`（重写为分组：`kpi.* / sort.* / bucket.* / card.* / bulk.* / quick.* / adjust.*`）、`inventoryAlertRules.*`、`stockDocCenter.*`、`inventoryMovements.*`（扩展筛选/汇总键）。禁止只写单语言。

### 3.3 组件边界

沿用项目「页面 + 轻组件」约定，新增 3 个可复用组件（`src/components/inventory/`）：

| 组件 | 职责 | props / emits |
| --- | --- | --- |
| `InventoryKpiBar.vue` | 概览 6 卡 | `props: summary`；`emits: pick(bucket)` |
| `InventoryStockCard.vue` | 单行富卡片 | `props: row, selected`；`emits: toggle, open-movements, replenish, adjust` |
| `InventoryFilterBar.vue` | 仓库胶囊 + 搜索 + 排序 + 状态 tabs | `props: locations, locationId, keyword, sort, bucket, buckets`；`emits: location, search, sort, bucket-change` |

页面只负责状态机与请求编排；纯函数（`safetyStockShortage`、`sortCompare`、`bucketOf`、`resolveSafetyStock` 的**前端镜像**不重复实现，排序/分桶一律服务端）放 `src/utils/inventoryFormat.ts`，仅做展示格式化与本地校验（如调整库存输入校验）。

### 3.4 多语言与设计令牌

- 全部新增文案走 i18n 字典，`zh-Hans` / `en` 同步。
- 样式一律用既有 `$wa-*` 令牌（`$wa-bg/$wa-card/$wa-ink/$wa-muted/$wa-rule/$wa-accent/$wa-danger/$wa-radius`），不引入新色板。
- 桌面态（`@media (min-width: 768px)`）沿用既有页面响应式约定（左侧仓库/状态导航 + 右侧表格）。

---

## 四、错误处理

- 所有接口 `catch` → `graphQlErrorMsg(e, '兜底文案')` → `uni.showToast`，**保留上次结果**不清空（修 Plan 1 同类问题）。
- 竞态：`seq` 自增守卫，旧响应直接丢弃。
- 空 `keyword`/`bucket` 不传字段，避免后端把空串当 LIKE 条件。
- 安全库存保存校验：负数报错；`0` 明确提示「该 SKU 将不再预警」。
- 调整库存：非整数/负数拒绝；提交后重拉当前页。
- 后端：`inventoryStockPage` 对非法 `sort`/`bucket` 回退默认值，不抛异常；`saveInventoryAlertRules` 对非本租户仓/变体拒绝。

---

## 五、测试与验收

- **后端单测**（`npx tsx --test`，沿用既有 `*.spec.ts` 风格）：`resolveSafetyStock` 四级回退；`bucketOf`；`sortCompare`；SQL 过滤条件拼装（keyword 注入安全：走参数占位）。
- **前端单测**：`inventoryFormat.ts` 的展示格式化与输入校验（`npx tsx --test src/utils/inventoryFormat.test.ts`）。
- **类型检查**：前端 `npx tsc --noEmit`；后端 `npm run build`（cjk-plugin，产物 `lib/` 必须一并提交）。
- **构建**：前端 `npm run build:h5`。
- **接口回归**：新增只读探针 `_e2e/_probe_inventory.py`（生产 admin-api，租户管理员账号，带 `vendure-token`）——校验：`inventoryStockPage` 无入参 vs 加 `bucket='out'` 的 `totalItems` 有区分度；`keyword` 命中数 < 全量；`summary.onHandTotal > 0`；`inventoryAlertRules` 返回当前渠道默认值；`stockDocList` 非空。
- **手机视口截图（硬规范）**：390×844、dpr=2（780×1688），覆盖 概览+列表默认态 / 缺货筛选 / 关键词搜索命中 / 排序切换 / 预警规则页 / 单据中心 / 流水筛选 / 桌面态（1440×900），补入操作手册。
- **验收标准**：
  1. 概览 6 卡数值与「点进去的筛选结果」口径一致（缺货/低库存卡可点）。
  2. 搜索商品名/SKU/规格能在**服务端**命中（不限于当前页），且结果数与后端探针一致。
  3. 状态 tabs 计数随仓库/关键词变化，且 tabs 之间计数之和 = 全部数。
  4. 明细卡片显示 现存/占用/可用/安全库存/货值/最近变动，缩略图与商品名正确。
  5. 安全库存按 SKU×仓可保存并**持久生效**（重进页面仍为设置值；未设置 SKU 回退渠道默认）。
  6. 批量选品可生成采购入库单（单号回显），生成后库存与流水同步更新。
  7. 单据中心能看到刚生成的单据；流水页可按方向/类型/日期筛选且汇总数与列表一致。
  8. 三种失败场景（搜索接口报错/保存规则报错/调整库存报错）均弹 Toast 且不清空列表。

---

## 六、部署

**后端（vendure）**：本地 `npm run build`（cjk-plugin，`lib/` 属跟踪产物必须提交）→ 提交源码 + `lib/` → 服务器 `/www/apps/vendure` `git pull` → `pm2 restart vendure` → 生产 postgres `synchronize` 自动建 `inventory_alert_rule`（或走幂等迁移）。

**前端（web-admin）**：本地 `npm run build:h5` → `node scripts/deploy.mjs`（scp 产物 → 服务器解压）→ 静态目录替换即时生效。

**顺序**：先后端（接口就绪）→ 再前端（避免前端请求到不存在的查询）→ 最后截图与手册。

---

## 七、影响面与回滚

- 后端改动文件：`plugin.ts`（SDL 双注册区 + entities/providers/migrations）、`inventory/inventory-stock.service.ts`（新）、`inventory/inventory-alert-rule.entity.ts`（新）、`inventory/inventory-alert-rule.service.ts`（新）、`inventory/stock-doc.service.ts`（ledger 入参扩展）、`inventory/stock-doc.admin.resolver.ts`（新查询）、`inventory/inventory-admin.resolver.ts`（规则读写）、`inventory-mode.custom-fields.ts`（渠道默认安全库存）、`migrations/migrate-stock-tables.ts`（幂等建表追加）。
- 前端改动文件：`pages/inventory/stock/index.vue`（重写）、`pages/inventory/alert-rules/index.vue`（新）、`pages/inventory/stock-doc/index.vue`（新）、`pages/inventory/movements/index.vue`（升级）、`apis/inventory.ts`、`apis/stock-doc.ts`、`components/inventory/*`（新 3 个）、`utils/inventoryFormat.ts`（新）、`pages.json`、双语文案、`docs/webadmin-bugfix-manual/*`。
- **数据风险**：仅新增 1 张表，**不改既有表结构**；`stock_doc`/`stock_doc_item`/`stock_level` 的写入路径不变（单据仍「下单即生效」）。
- **回滚**：前端产物回退即可；后端回退到上一个 commit 并 `pm2 restart`（新表保留不影响旧代码）。
- **风险点**：`inventoryStockPage` 是跨核心表的聚合查询（`stock_level`/`product_variant`/`product_translation`/`asset`），需在联调阶段用探针确认字段名与分页正确；若核心实体不可从 `@vendure/core` 导入，则改用 `rawConnection.query()` 直连 SQL（表名固定），实现层可在计划阶段二选一，接口契约不变。

---

## 八、明确不做（范围外）

1. **批次 / 生产日期 / 到期日期（FEFO）**：现有 `stock_level` 与流水模型无批次维度，属独立子系统（需新表 + 分配算法 + 流水扩展），留待后续 plan。
2. **在途库存**：无采购订单/收货状态概念，`createStockDoc` 为即生效执行。
3. **条码字段**：Vendure 核心 `ProductVariant` 无 `barcode`，本轮搜索限 商品名/SKU/规格。
4. **Excel/CSV 导出**：无后端导出接口，本轮不做。
5. **页面多版式（积木式）**：库存页单版式即可，不套用详情页构建器体系。
6. **库存调拨审批流、库存盘点任务指派**：超出手机端轻量管理范围。