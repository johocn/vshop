# 订单列表 · 对齐已批准设计方案（gap 补齐）

> 目标页：`/pages/order/list/index`（web-admin）。本轮把该页当前实现与已批准设计（`.superpowers/brainstorm/session1/content/order-redesign.html`）逐项对齐，补齐差距。

## 背景与现状

订单列表已实现：手机卡片 + 桌面表格双形态响应式、统计条（今日订单/待发货/待退款，已通过后端渠道回退解析打通）、「核销码」入口、「本店渠道单/本店商品单」scope、全部/待付款/待发货/已发货/已完成/已取消 tabs、搜索。

设计文档中仍有差距未落地，清单见下。

## 差距清单与对齐项

| # | 设计要求 | 当前实现 | 本轮动作 |
|---|---|---|---|
| 1 | 操作区按状态给快捷：「发货」(待发货)、「去核销」(自提)、「详情」 | 只有「去核销」「详情」，一刀切 | **补「发货」快捷按钮（状态化）** |
| 2 | 「催付」(待付款) | 无 | **不做**（后端无催付接口，达成一致） |
| 3 | 手机卡片商品行带缩略图 | 只有文字名称 | **补缩略图（仅渠道单可取图）** |
| 4 | 收货人行「顾客 · 电话 · 配送」 | 配送并入时间行 | **配送移到收货人行** |
| 5 | 桌面 headbar 内联「订单→统计→核销码」 | topbar 与统计条分两行 | **桌面头栏统一为单行** |

## 需求细节

### 1. 操作区状态化快捷按钮

- 新增纯函数 `isShippable(state: string): boolean`，可发货状态集合：
  `['PaymentAuthorized', 'PaymentSettled', 'WaitingForShipping', 'PartiallyPaymentSettled']`。
- 组件模板操作区按以下优先级渲染按钮（手机卡片与桌面表格一致）：
  1. `isShippable(o.state)` → 「**发货**」→ `uni.navigateTo('/pages/order/ship/index?id=' + o.id)`
  2. `isRedeemable(o)` → 「**去核销**」→ 核销页（现有逻辑）
  3. 始终 → 「**详情**」
  - 按钮顺序：发货 / 去核销 / 详情。
  - **催付不渲染**（待付款单仅剩「详情」）。
- 复用详情页既有 `goShip` 跳址，前后端零改动。

### 2. 商品缩略图（手机卡片，渠道单）

- 数据层（`src/apis/order.ts`）：
  - `OrderRow.lines[].productVariant` 增 `featuredAsset?: { source?: string } | null`。
  - `ORDER_FIELDS` 中 `lines` 段补 `featuredAsset { source }`。
- 视图模型（`src/utils/orderFormat.ts`）：`OrderGood` 增 `image?: string`；
  `channelToView` 从 `l.productVariant?.featuredAsset?.source` 取图。
  `shopToView` **不取图**（`myShopOrders` 接口无此字段），`image` 为空。
- 模板商品行：`g.image` 存在则渲染缩略图 `<image>`；否则渲染中性占位块（浅灰底，不破版）。
- 桌面表格 `c-goods` 列保持纯文本，不加缩略图（设计表格无图）。

### 3. 收货人行配送位置

- 卡片 `sub` 行改为：`顾客名 ＋ 脱敏电话 ＋ ' · ' ＋ 配送方式`
  （如「张三 138****6732 · 快递」；自提为「自提」后追加「· 待核销」徽标逻辑保持现状）。
- 卡片 `foot` 行只保留 `支付方式 · 时间`，移除其中重复的配送方式。
- 桌面 `c-cust` / 配送各有独立列，不在此改动内。

### 4. 桌面头栏统一（Gap 5）

- 将 `topbar(订单+核销码)` 与 `stats` 包入块级容器 `.headbar`。
- 默认（手机）：换行布局，第 1 行=「订单」(左)+「核销码」(右)，第 2 行=统计卡（与现状一致）。
- 桌面（≥768px）：`.headbar` 单行 `display:flex; align-items:center`，顺序「订单」→ 统计卡（`flex:1` 居中）→「核销码」。
- 桌面 scope/tabs/search 保持现状，不并入一行。

### 不做（YAGNI / 无能力）

- 「催付」按钮（无后端接口）。
- 本店商品单商品缩略图（接口无图字段）。
- 后端 shop-plugin 改动。

## 验收标准

- 手机 390×844 与桌面 1440×900：
  - 待发货单操作区出现「发货」，点击进入发货页。
  - 自提待核销单出现「去核销」。
  - 其余订单仅「详情」。
  - 手机卡片商品行：渠道单显示缩略图，商品单显示占位块，布局不破。
  - 卡片收货人行含配送方式，foot 行仅支付+时间。
  - 桌面 headbar 单行内联 订单→统计→核销码。
- Playwright 移动视口（390×844，dpr=2）截图补充到操作手册。
- 无新增页面报错 / GraphQL 报错。

## 涉及文件

- `src/pages/order/list/index.vue`（模板 + 脚本：发货/去核销/详情按钮、缩略图渲染、收货人行、headbar、桌面样式）
- `src/utils/orderFormat.ts`（`isShippable`、`OrderGood.image`、`channelToView` 取图）
- `src/apis/order.ts`（`OrderRow` + `ORDER_FIELDS` 补 `featuredAsset`）
- `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（补验收截图）
- `_e2e/`（新增/扩展回归脚本）