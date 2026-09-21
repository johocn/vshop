# web-admin 多版式订单列表 设计文档（2026-09-20）

## 1. 目标与范围

将 `web-admin/src/pages/order/list` 从「单一硬编码版式」改造为**多版式可切换**的订单列表，遵循既有「四级回退风格体系 + 积木式 UI」模板开发规范。

- **现状**：`order/list/index.vue` 内硬编码手机卡片视图 + 桌面表格视图，数据源与渲染耦合，无版式抽象、无切换能力。
- **Mockup 基线**：`web-admin/docs/superpowers/mockups/order-list/` 已有方案 A（现有效果+配送补齐）、B（状态优先）、C（按状态分组）三版式 + 桌面/手机双态。
- **本设计目标**：
  1. 抽出**订单列表渲染器**，按版式配置动态组装功能块（积木式 UI）。
  2. 提供 2~3 个可用版式（以 mockup 方案为基础），后台可切换。
  3. 遵守四级回退体系：版式 → 页面级配置 → 功能块定制 → 内建默认。

## 2. 已确认决策

1. **目标端**：web-admin 后台订单列表（用户确认）。
2. **交付方式**：本设计先定稿，与①③一并审阅后批量实现。
3. **版式来源**：复用 mockup 方案 A（现有效果+配送补齐）为默认版式，B/C 作为可切换备选；新增版式时以积木式渲染器扩展。

## 3. 架构与组件

### 3.1 版式模型（对齐详情页构建器模式）

参照 `d:\zhao\nshop\layers\base\app\components\product-detail\` 的 `ProductDetailRenderer` 模式：

```
OrderListRenderer
   │  layout: 'classic' | 'status-first' | 'status-group'
   ▼
按 layout 动态组装功能块（Nuxt 自动注册 → web-admin 手动注册）
   - OrderListHeadBar    顶栏统计 + 核销码
   - OrderListScope      scope 切换（渠道/商品）
   - OrderListTabs       状态 Tabs
   - OrderListFilters    搜索 + 配送/时间筛选
   - OrderListCardRow    手机卡片行（块内可定制：状态色/地址行/配送名显隐）
   - OrderListTableRow   桌面表格行
   - OrderListPager      分页
```

**版式差异点**（对齐 mockup）：
| 版式 | 手机卡片 | 桌面表格 |
|---|---|---|
| classic（A，默认） | 现状 + 配送方式名 + 地址行 + 物流色 | 现状 + 配送全名 + 收货地址子行 |
| status-first（B） | 状态列前置 + 大物流色块 | 状态列前置 + 配送(方式+地址)宽列 |
| status-group（C） | 按状态分组 + 组内小计 | 左状态分组计数导航 + 右明细 |

### 3.2 配置与回退链

- **页面级配置**：`layout`（选择版式）+ 功能块显隐（如 `showAddress`、`showDeliveryName`、`stateColors`）。
- **四级回退**：
  - L1 全局配置：web-admin 端全局默认版式。
  - L2 页面配置：`order-list` 页配置覆盖（当前实现为内置常量 + 可扩展后台 JSON）。
  - L3 功能块定制：单块字段（状态色、地址行显隐等）。
  - L4 内建默认：与现有效果一致。
- 解析为纯函数（坏 JSON 回退默认），与 `useDetailConfig.ts` / `detail-config.ts` 模式一致。

### 3.3 数据层保持不变

复用现有 `fetchOrders/fetchShopOrders/fetchProductThumbs` + `utils/orderFormat.ts` 的 `OrderView`/`stateLabel`/`shipColor`/`computeStats`。渲染器只消费 `OrderView[]`，不触碰数据源。

## 4. 组件拆分

- `components/order-list/OrderListRenderer.vue`：按 layout 分发。
- `components/order-list/OrderListHeadBar.vue`、`...Scope.vue`、`...Tabs.vue`、`...Filters.vue`：头部块。
- `components/order-list/OrderListCardRow.vue`、`...TableRow.vue`：行块（按 layout 切换排列与字段显隐）。
- `components/order-list/OrderListPager.vue`：分页块。
- `utils/orderListConfig.ts`：`parseOrderListConfig(json)` 纯函数解析 + 回退。
- `constants/orderListLayouts.ts`：版式注册表（layout key → 块组合）。

## 5. 行为与交互

- 版式切换入口：页面顶部「版式」入口（popup 选版式），选择持久化（localStorage）；切换即时生效。
- 每个版式保持全部既有能力：scope/tabs/搜索/筛选/分页/操作（发货/核销/催付/详情）/统计/核销码，**不因版式而丢功能**。
- 手机卡片与桌面表格双态在各版式内保持一致语义。

## 6. 测试与交付

- 纯函数单测：`parseOrderListConfig` 回退链（合法/缺字段/坏 JSON）、版式注册表完整性。
- 手机视口截图：三版式各 390×844 手机截图 + 桌面截图。
- 端到端：版式切换持久化、各版式下搜索/筛选/操作可用。
- 手册：新增「订单列表多版式」章节。

## 7. 风险与边界（YAGNI）

- **不新增功能**：本设计只做「版式化 + 配送信息补齐（方案 A 基线）」，不新增筛选/统计等业务能力。
- **版本**：版式切换用 localStorage（web-admin 无 C 端全局配置通道）；若后续要求按租户/角色配置版式，再升级为后台 JSON 配置。
- **C 端不涉及**：本次仅 web-admin 后台。