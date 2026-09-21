# 订单列表·搜索过滤 / 状态维度 / 版式 修复设计方案（Plan 1）

> 面向后台订单列表页 `https://e.joho.cn/guanli/#/pages/order/list/index`（源码 `src/pages/order/list/index.vue`）。
> 运营反馈三个问题：**① 搜索过滤不稳定，特定环境无结果；② 订单状态不全（今日订单等）；③ 列表版式变化不明显**。
> 本轮同时纠正上一版规格（`specs/2026-09-05-order-list-filter-search-paging-design.md`）中被证伪的前提。

**目标**：把订单列表的搜索/筛选从「客户端页内过滤」升级为「服务端过滤」，补全状态维度（全枚举 + 分组折叠）与时间维度（今日/近7天/本月/自定义），并把三种版式改造成结构性差异明显的形态。

**Tech Stack**：Vue3 + TypeScript + uni-app（H5）、Vendure admin GraphQL、uView 令牌 `$wa-*`。

---

## 一、关键前提更正（本轮最重要的事实）

上一版规格把「Vendure 渠道单接口仅有 `take/skip/state` 服务端过滤」写成了**边界（确权）**，据此把搜索/筛选做成客户端页内过滤。**该前提不成立。**

对生产 `https://e.joho.cn/admin-api` 的 introspection 实测（本地只读探针，未改任何数据）：

| 结论 | 证据 |
|---|---|
| `OrderFilterParameter` 共 **97** 个可过滤字段 | `__type(name:"OrderFilterParameter")` 返回 `COUNT=97` |
| `code` / `contactName` / `contactPhone` / `remark` / `state` / `deliveryType` / `exceptionType` / `afterSalesStatus` / `deliveryStatus` 均为 `StringOperators` | 字段类型清单实测 |
| `StringOperators` 含 `contains` / `in` / `eq` / `notIn` / `isNull` | 字段类型为 `StringOperators`（Vendure 标准算子集） |
| `createdAt` / `orderPlacedAt` 为 `DateOperators`（含 `between` / `after` / `before`） | 字段类型清单实测 |
| 支持 `_and` / `_or`（`LIST`）与顶层 `filterOperator` | 字段清单含 `_and` / `_or` |

**因此：关键词、时间、配送方式、状态多值、异常、售后全部可以下推到服务端，无需任何后端改造。**

## 二、根因清单

### ① 搜索过滤不稳定 / 特定环境无结果

| # | 根因 | 位置 |
|---|---|---|
| R1 | **客户端过滤只作用于当前页**：先 `fetchOrders(take:20, skip)` 取一页，再对**这 20 条**做 `filterChannelRows`。订单排在第 5 页就永远搜不到——订单越多越搜不到，正是「特定环境」的表现 | `pages/order/list/index.vue` L173-L180、`utils/orderFormat.ts` L212-L225 |
| R2 | `keyword` 从未下推：API 签名里有 `keyword`，但只按 `code` 匹配，且页面根本没传该参数；顾客名 / 手机号 / 商品名都不参与服务端匹配 | `apis/order.ts` L137-L157 |
| R3 | **静默失败**：`load()` 只有 `try/finally`、**没有 `catch`**，请求异常既不提示也不清空，用户看到的是「无结果」而不是「加载失败」 | `pages/order/list/index.vue` L156-L185 |
| R4 | 无请求竞态防护：快速切换 tab / scope / 搜索时，旧响应可以覆盖新响应 | `pages/order/list/index.vue` L156-L230 |
| R5 | `state` 被字符串内插进 GraphQL 文本，既无法表达多值，也是注入面 | `apis/order.ts` L139 |

### ② 订单状态不全 / 今日订单

| # | 根因 | 位置 |
|---|---|---|
| R6 | **多状态 tab 被降级为单状态**：tabs 声明 `keys: ['PaymentAuthorized','PaymentSettled']`，但渠道 scope 只发送 `state: cur`（单值 `eq`）→ 待发货 tab 漏掉 `PaymentSettled`、已发货 tab 漏掉 `PartiallyShipped` | `pages/order/list/index.vue` L173-L180 |
| R7 | **「今日」统计卡点了等于「全部」**：`stat-tap` 传 `''` → `cur = ''` | `components/order-list/OrderListHeadBar.vue` L5 |
| R8 | 「待退款」统计卡 tap 传 `'Cancelled'`，筛选的是「已取消」而非售后待退款 | `components/order-list/OrderListHeadBar.vue` L17 |
| R9 | 统计取数与列表 scope 不一致：`loadStats()` 固定调 `fetchShopOrders()`（商品单），默认 scope 却是渠道单 | `pages/order/list/index.vue` `loadStats` |
| R10 | tab 未覆盖全枚举：缺 `Created` / `AddingItems` / `PaymentSettled` / `PartiallyShipped` / `PartiallyDelivered` / `Delivered` / `Completed` 等 | `pages/order/list/index.vue` L89-L125 |
| R11 | 时间过滤同样是客户端过滤，与 R1 同源 | `utils/orderFormat.ts` L201-L209 |

### ③ 版式变化不明显

| # | 根因 | 位置 |
|---|---|---|
| R12 | **差异字段被三重覆盖**：三种版式的 `showAddress` / `showDeliveryName` / `stateColors` **全部为 `true`**，实际只剩 `groupByState`、`stateColumnFirst` 两个有效差异 | `constants/orderListLayouts.ts` L18-L31 |
| R13 | 手机端 `classic` 与 `status-first` 仅差「状态列前置」；桌面端仅差表格列序 | `components/order-list/*` |
| R14 | 这不是回归：旧 A 方案在 mockup 中的定性本就是「最小改动」 | `docs/superpowers/mockups/order-list/index.html` L31-L35 |

## 三、设计

### 3.1 数据层：`apis/order.ts` 的 `fetchOrders` 重写为真·服务端过滤

**入参**（全部可选）：

```ts
export interface OrderQueryInput {
  take?: number;
  skip?: number;
  states?: string[];        // 状态多值，走 state.in
  keyword?: string;         // 关键词，走 _or 组合
  placedFrom?: string;      // ISO 时间下界
  placedTo?: string;        // ISO 时间上界
  deliveryType?: string;    // 'pickup' | 'delivery'
  exceptionOnly?: boolean;  // 异常组：exceptionType 非空
  afterSales?: string[];    // 售后状态集合
}
```

**查询体改为 GraphQL 变量 + 组装 filter**（不再字符串内插，修 R5）：

```graphql
query Orders($options: OrderListOptions) {
  orders(options: $options) {
    totalItems
    items { ...ORDER_FIELDS }
  }
}
```

`filter` 映射表：

| UI 控件 | filter 片段 |
|---|---|
| 状态 tab（多值） | `state: { in: states }` |
| 关键词 | `_or: [ { code: { contains: kw } }, { contactName: { contains: kw } }, { contactPhone: { contains: kw } }, { remark: { contains: kw } } ]` |
| 时间：今日 / 近7天 / 本月 / 自定义 | `orderPlacedAt: { between: { start, end } }` |
| 配送：自提 / 快递 | `deliveryType: { eq: 'pickup' \| 'delivery' }` |
| 异常组 | `exceptionType: { isNull: false }`；异常类型子筛 `exceptionType: { eq }` |
| 售后 / 待退款 | `afterSalesStatus: { in: afterSales }` |
| 顶层组合 | `filterOperator: 'AND'` |

**时间字段选型（明确决策）**：以 `orderPlacedAt` 为准。理由：`orderPlacedAt` 在订单真正提交时写入，「购物车」态（`Created` / `AddingItems`）为 `null`——它们本就不该出现在「今日订单」里。不采用客户端原有的 `orderPlacedAt || createdAt` 兜底（GraphQL 无法表达 coalesce），该差异仅影响未提交的购物车记录。

**过滤后置为服务端权威**：渠道 scope **删除** `filterChannelRows` 二次过滤，`totalItems` 直接用服务端返回值。商品单 scope 的 `filterShopRows` **保留**（`myShopOrders` 是全量返回，本地过滤即全量可靠）。

### 3.2 页面：状态模型、时间维度、错误处理

**状态 tab 改为分组折叠 + 全枚举**（修 R10）。分组基于 `constants/orderState.ts` 的 `ORDER_STATES`：

| 分组 | 含状态 |
|---|---|
| 待处理 | `Created` `AddingItems` `ArrangingPayment` |
| 进行中 | `PaymentAuthorized` `WaitingForShipping` `PartiallyPaymentSettled` `PaymentSettled` `PartiallyShipped` `Shipped` `PartiallyDelivered` `Delivered` |
| 已完成 | `Completed` |
| 已取消 | `Cancelled` `Modified` `Modifying` `ArrangingAdditionalPayment` |
| 异常 | 见下（按 `exceptionType` 非空，不是状态） |

「全部」保持常显；每个 tab 的 `keys` 数组原样下推为 `state.in`，修 R6。

**异常组**（按 `exceptionType` 过滤，已确认）：`exceptionType: { isNull: false }`。取值域来自 `delivery-plugin/src/constants.ts` 的 `ExceptionType`：`rejected`（拒收）/ `wrong_address`（地址错误）/ `no_recipient`（无人接收）/ `damaged`（破损）/ `other`（其他），可作二级筛选 chip。

**时间快捷筛选条**（修 R7、R11）：今日 / 近7天 / 本月 / 自定义区间，单选胶囊，与状态 tab **可组合**（如「今日 + 待发货」）。映射规则：今日 = `[今日 00:00, 明日 00:00)`；近7天 = `[今日-6天 00:00, 明日 00:00)`；本月 = `[本月 1 日 00:00, 下月 1 日 00:00)`；自定义 = 起止日期各自取当日 00:00 / 次日 00:00。

**统计卡修正**（修 R8、R9）：
- 今日卡 → 点击时设置**时间维度**为「今日」，而不是把 `cur` 置空。
- 待退款卡 → 改用 `afterSalesStatus: { in: ['Pending','Approved','Returning','Received','RefundFailed'] }`（即「售后未了结」集合，排除 `Refunded` / `Rejected` / `Closed`）。
- 计数口径与当前 scope 对齐：不再固定调 `fetchShopOrders()`，改为在**当前 scope** 下按各卡自身条件发一次轻量计数查询（`take: 1`，只取 `totalItems`）：今日卡 = 当日时间条件（不带状态/关键词），待付款卡 = `state.in` 待付款集合，待发货卡 = `state.in` 待发货集合，待退款卡 = 售后未了结集合。列表自身的筛选不影响这 4 个计数。
- 实现前用一次线上查询复核 `afterSalesStatus` 的实际存储字符串与 `AFTER_SALE_STATES` 的键一致（该字段为 nullable string，无枚举约束）。

**错误处理与竞态**（修 R3、R4）：
- `load()` 补 `catch`：显式 `uni.showToast`「加载失败：<后端 message>」，并**保留上一次结果**而不是清空。
- 引入自增请求序号 `reqSeq`：每次请求递增并捕获本地序号，响应回来**仅当序号为最新**时才写入 `views` / `totalItems`。
- `loadMore()` 加同一把锁，避免并发拼接错乱；越界守卫保留。

### 3.3 版式：三版式结构性重做（方案 A 为主线）

三版式**保留既有 key 字符串**（避免既有店铺配置失效），但把差异升级为结构级。已产出的对照 mockup 位于 `docs/superpowers/mockups/order-list-v2/`（`scheme-a/b/c.html` + hub `index.html`），本地服务 `http://localhost:52207/order-list-v2/index.html`。

| key | 形态（用户已选 A 为执行主线） | 结构差异点 |
|---|---|---|
| `classic` | **方案 A 卡片信息流** | 手机单列大卡片（缩略图 + 商品摘要 + 顾客 + 金额 + 时间 + 状态色标签 + 多按钮操作组），不分组、按时间倒序；桌面 8 列宽表 |
| `status-group` | **方案 B 状态看板** | 手机按状态泳道分区（分区头 = 状态名 + 单数 + 金额小计），区内极简卡片无缩略图；桌面左状态导航（含计数）+ 右明细表 |
| `status-first` | **方案 C 高密度清单** | 手机无圆角两行清单；桌面紧凑表格（36px 行高 / 12px 字号 / 粘性表头 / 斑马纹） |

`status-first` 的原语义是「状态列前置」，重做后不再成立：**保留 key，语义改为「高密度清单」**，并同步更新后台版式选择处的描述文案。

同时清理 R12：把 `showAddress` / `showDeliveryName` / `stateColors` 三个曾在三版式中全为 `true` 的字段，改为**按版式真正区分**的配置（A 全显示、B 隐藏地址与配送名、C 仅显示状态色小标签）。

### 3.4 组件边界

| 单元 | 职责 | 依赖 |
|---|---|---|
| `apis/order.ts` | 把 UI 条件翻译为 GraphQL filter，返回 `{ items, totalItems }` | `client.ts` |
| `utils/orderFilter.ts`（新增，纯函数） | 时间区间计算（今日/近7天/本月/自定义 → `{start,end}`）、状态分组常量、异常类型常量 | 无（可单测） |
| `pages/order/list/index.vue` | 筛选状态机 + 请求编排（`reqSeq` 竞态防护、错误处理）+ 分页 | 上面两者 |
| `constants/orderListLayouts.ts` | 三版式的结构差异配置 | 无 |
| `components/order-list/*` | 按版式渲染 | 布局配置 |

时间区间计算与状态分组抽为**纯函数**并加单测，是本次唯一新增的独立单元。

## 四、错误处理

- 后端返回的 `errors[0].message` 原样透传（沿用 `graphQLClient` 的 `graphQlErrorMsg` 约定），运营能看到「为什么查不到」。
- 时间区间计算对非法输入返回 `null`（不拼 filter），不抛异常。
- 无效筛选条件时不发送空 `filter`，避免 `filterOperator: 'AND'` 搭配空条件产生语义歧义。

## 五、测试与验收

- **单元测试**（vitest）：时间区间纯函数（今日/近7天/本月/自定义、跨月/跨年边界、非法输入）；状态分组常量完整性（`ORDER_STATES` 每个键都被分到某一组，无遗漏）。
- **类型检查**：`npx tsc --noEmit`，以「改动文件无新增错误」为准。
- **构建**：`npm run build:h5`。
- **接口回归**：用只读探针对生产 admin-api 验证组装出的 filter 真实生效（`state.in` 多值、`_or` 关键词、`orderPlacedAt.between`、`exceptionType.isNull:false` —— 各自的 `totalItems` 应有区分度，而非恒定 0）。
- **手机视口截图（硬规范）**：390×844、dpr=2（780×1688），覆盖：默认列表、搜索命中、今日+状态组合筛选、异常组、三版式各一张，补入操作手册。
- **验收标准**：
  1. 搜索订单号/顾客/手机号/备注，**跨页订单也能命中**（服务端过滤）。
  2. 待发货 tab 能同时出现 `PaymentAuthorized` 与 `PaymentSettled` 订单（修 R6）。
  3. 点「今日」统计卡进入的是「今日」时间筛选，不是「全部」（修 R7）。
  4. 待退款卡筛选的是售后未了结订单，不是 Cancelled（修 R8）。
  5. 请求失败时出现明确错误提示，且列表保留上次结果（修 R3）；快速切换不出现旧结果覆盖（修 R4）。
  6. 三种版式切换后**结构肉眼可辨**（修 R12/R13）。

## 六、部署

纯前端：本地 `npm run build:h5` → `node scripts/deploy.mjs`（scp 产物 → 服务器解压），服务器不构建。

## 七、影响面与回滚

- 改动文件：`apis/order.ts`、`pages/order/list/index.vue`、`components/order-list/*`、`constants/orderListLayouts.ts`、新增 `utils/orderFilter.ts` 与其单测、双语言包、手册。
- **不改后端**，无数据迁移。
- 回滚：前端产物回退即可。风险点唯在「时间字段从 `orderPlacedAt || createdAt` 改为严格 `orderPlacedAt`」，影响面仅为未提交的购物车记录不入「今日」——属预期行为。

## 八、与既有规格的关系

本规格**取代** `specs/2026-09-05-order-list-filter-search-paging-design.md` 中的两处：
1. 「边界（确权）」——「Vendure 渠道单接口仅有 `take/skip/state` 服务端过滤」**被证伪**（见第一节）；
2. 「决策记录」前两行——客户端过滤层（渠道单页内生效）改为服务端过滤。

该规格的其余部分（raw 分页模型、桌面分页条、每页条数、配送/时间筛选行的 UI 形态）**继续有效**，本轮在其基础上把过滤真正下推服务端。