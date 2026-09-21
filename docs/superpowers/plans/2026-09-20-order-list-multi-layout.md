# web-admin 多版式订单列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 web-admin 订单列表从单一硬编码版式改造为多版式可切换（classic/status-first/status-group），遵循四级回退风格体系 + 积木式 UI。

**Architecture:** 抽出 `OrderListRenderer` 按 layout 动态组装功能块（headbar/scope/tabs/filters/cardRow/tableRow/pager），版式配置由纯函数 `parseOrderListConfig` 解析并逐级回退（L4 内建默认 → L3 功能块定制 → L2 页面配置 → L1 全局默认）。数据层（fetchOrders/orderFormat）不变，渲染器只消费 `OrderView[]`。

**Tech Stack:** uni-app H5 (Vue3 `<script setup>`) / 手动组件 import / localStorage 版式持久化

**Spec:** `vshop/docs/superpowers/specs/2026-09-20-order-list-multi-layout-design.md`

**Mockup:** `web-admin/docs/superpowers/mockups/order-list/`（scheme-a/b/c + hub）

---

### Task 1: 版式配置纯函数 + 注册表 + 单测

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\constants\orderListLayouts.ts`
- Create: `d:\zhao\vshop\web-admin\src\utils\orderListConfig.ts`
- Create: `d:\zhao\vshop\web-admin\src\utils\orderListConfig.test.ts`（若项目有 vitest；否则并入构建冒烟）

- [ ] **Step 1: 定义版式注册表**

创建 `src/constants/orderListLayouts.ts`：

```ts
// 订单列表版式注册表：layout key → 块组合与默认配置（L4 内建默认）
export type OrderListLayoutKey = 'classic' | 'status-first' | 'status-group';

export interface OrderListLayoutDef {
  key: OrderListLayoutKey;
  label: string;
  desc: string;
  /** 功能块显隐与定制字段 */
  blocks: {
    showAddress: boolean;      // 收货地址行（手机卡片）
    showDeliveryName: boolean; // 配送方式全名
    stateColors: boolean;      // 物流色标签（待发货橙/已发货蓝/已完成绿/已取消灰）
    groupByState: boolean;     // 按状态分组 + 组内小计（手机卡片）
    stateColumnFirst: boolean; // 状态列前置（桌面表格）
  };
}

export const ORDER_LIST_LAYOUTS: Record<OrderListLayoutKey, OrderListLayoutDef> = {
  'classic': {
    key: 'classic', label: '经典（现有效果+配送补齐）', desc: '现状卡片/表格 + 配送方式全名 + 收货地址行 + 物流色',
    blocks: { showAddress: true, showDeliveryName: true, stateColors: true, groupByState: false, stateColumnFirst: false },
  },
  'status-first': {
    key: 'status-first', label: '状态优先（运维视角）', desc: '状态列前置 + 大物流色块，配送合并宽列',
    blocks: { showAddress: true, showDeliveryName: true, stateColors: true, groupByState: false, stateColumnFirst: true },
  },
  'status-group': {
    key: 'status-group', label: '按状态分组（分区导航）', desc: '手机按状态分组+小计，桌面左状态导航+右明细',
    blocks: { showAddress: true, showDeliveryName: true, stateColors: true, groupByState: true, stateColumnFirst: true },
  },
};

export const DEFAULT_LAYOUT: OrderListLayoutKey = 'classic';
export const LAYOUT_KEYS = Object.keys(ORDER_LIST_LAYOUTS) as OrderListLayoutKey[];
```

- [ ] **Step 2: 实现解析纯函数（四级回退）**

创建 `src/utils/orderListConfig.ts`：

```ts
// 订单列表版式配置解析：L1 全局默认 → L2 页面配置 → L3 块定制 → L4 内建默认
import { ORDER_LIST_LAYOUTS, OrderListLayoutKey, DEFAULT_LAYOUT, LAYOUT_KEYS } from '../constants/orderListLayouts';

export interface OrderListConfig {
  layout: OrderListLayoutKey;
  blocks: Record<string, any>; // 块级定制（合并自注册表默认 + 页面 JSON）
}

/** 纯函数：解析布局 key，非法回退默认（L4/L1） */
export function parseLayout(raw: unknown): OrderListLayoutKey {
  if (typeof raw === 'string' && (LAYOUT_KEYS as string[]).includes(raw)) {
    return raw as OrderListLayoutKey;
  }
  return DEFAULT_LAYOUT;
}

/** 纯函数：解析页面配置 JSON（坏 JSON/缺字段回退默认），返回合并后的最终配置 */
export function parseOrderListConfig(json: string | null | undefined): OrderListConfig {
  let page: any = null;
  if (json && typeof json === 'string') {
    try { page = JSON.parse(json); } catch { page = null; }
  }
  const layout = parseLayout(page?.layout);
  const base = ORDER_LIST_LAYOUTS[layout];
  const blocks = { ...base.blocks };
  // L3 块定制：页面 JSON 的 blocks 字段合并覆盖（标量直接覆盖）
  if (page?.blocks && typeof page.blocks === 'object') {
    Object.assign(blocks, page.blocks);
  }
  return { layout, blocks };
}
```

- [ ] **Step 3: 单测（TDD）**

创建 `src/utils/orderListConfig.test.ts`（vitest 风格；若项目无 vitest 则用 node:test + tsx 跑）：

```ts
import { describe, it, expect } from 'vitest';
import { parseLayout, parseOrderListConfig } from './orderListConfig';

describe('parseLayout', () => {
  it('合法 key 原样返回', () => {
    expect(parseLayout('status-first')).toBe('status-first');
  });
  it('非法值回退默认 classic', () => {
    expect(parseLayout('bogus')).toBe('classic');
    expect(parseLayout(null)).toBe('classic');
    expect(parseLayout(123)).toBe('classic');
  });
});

describe('parseOrderListConfig', () => {
  it('坏 JSON 回退默认', () => {
    const c = parseOrderListConfig('{oops');
    expect(c.layout).toBe('classic');
    expect(c.blocks.showAddress).toBe(true);
  });
  it('缺字段回退默认', () => {
    const c = parseOrderListConfig('{}');
    expect(c.layout).toBe('classic');
  });
  it('页面配置覆盖 layout 与 blocks', () => {
    const c = parseOrderListConfig('{"layout":"status-group","blocks":{"showAddress":false}}');
    expect(c.layout).toBe('status-group');
    expect(c.blocks.showAddress).toBe(false);
    expect(c.blocks.stateColors).toBe(true); // 未覆盖字段保持默认
  });
});
```

- [ ] **Step 4: 跑单测**

Run: `cd d:\zhao\vshop\web-admin && npx vitest run src/utils/orderListConfig.test.ts`
Expected: 4 组用例 PASS。

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vshop\web-admin
git add src/constants/orderListLayouts.ts src/utils/orderListConfig.ts src/utils/orderListConfig.test.ts
git commit -m "feat(admin): 订单列表版式配置纯函数 + 注册表 + 单测"
```

---

### Task 2: 功能块组件抽取

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListHeadBar.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListScope.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListTabs.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListFilters.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListCardRow.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListTableRow.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListPager.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\order-list\OrderListRenderer.vue`

- [ ] **Step 1: 抽取头部块（HeadBar/Scope/Tabs/Filters）**

从 `order/list/index.vue` 模板原样迁移到各块组件，props 接收状态与事件回调：
- `OrderListHeadBar.vue`：props `{ stats, redeemableCount }`，emit `stat-tap / redeem`。
- `OrderListScope.vue`：props `{ scopes, scope }`，emit `change`。
- `OrderListTabs.vue`：props `{ tabs, cur, layout }`，emit `change`；`stateColumnFirst` 时前置状态类。
- `OrderListFilters.vue`：props `{ kw, deliveryLabel, dateLabel, deliveryIdx, dateIdx, deliveryOpts, dateOpts }`，emit `search/delivery/date/clear`。

- [ ] **Step 2: 抽取行块（CardRow/TableRow）**

- `OrderListCardRow.vue`：props `{ o, blocks, isRedeemable, redeemableIds }`，emit `ship/redeem/remind/detail`。按 `blocks` 控制：`showAddress` 显示地址行、`showDeliveryName` 显示配送方式名、`stateColors` 用 `shipColor` 着色、`groupByState` 时外层分组（由 Renderer 控制分组容器，本组件仅行）。
- `OrderListTableRow.vue`：props `{ o, blocks }`，`stateColumnFirst` 时列顺序调整（状态列前移）。

- [ ] **Step 3: 分页块 + 渲染器**

- `OrderListPager.vue`：props `{ page, totalItems, perPage }`，emit `page/perpage`。
- `OrderListRenderer.vue`：props `{ views, stats, config, loading, ... }`，emit 全部操作。按 `config.layout` 与 `config.blocks` 组装：
  - `status-group`：手机卡片按 `o.state` 分组渲染（组头=状态标签+组内小计），桌面左侧状态导航计数 + 右侧明细。
  - `status-first`：卡片/表格状态列前置。
  - 默认 `classic`：现状布局。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vshop\web-admin
git add src/components/order-list
git commit -m "feat(admin): 订单列表积木式功能块（HeadBar/Scope/Tabs/Filters/Card/Table/Pager/Renderer）"
```

---

### Task 3: 订单列表页接入渲染器 + 版式切换

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue`

- [ ] **Step 1: 替换模板为 Renderer**

将 `order/list/index.vue` 的模板主体替换为 `<OrderListRenderer :views="views" :stats="stats" :config="config" ... @ship="goShip" @redeem="goRedeem" @remind="goRemind" @detail="goDetail" ... />`，import 各块组件（手动 import 模式）。

- [ ] **Step 2: 版式切换 + 持久化**

- `const layoutKey = ref<OrderListLayoutKey>(parseLayout(uni.getStorageSync('orderListLayout') || DEFAULT_LAYOUT))`
- 页面顶部加「版式」入口（popup 列 `ORDER_LIST_LAYOUTS` 三版式），选中后 `layoutKey.value = k` 并 `uni.setStorageSync('orderListLayout', k)`。
- `const config = computed(() => parseOrderListConfig(JSON.stringify({ layout: layoutKey.value })))` 传给 Renderer。

- [ ] **Step 3: 数据层不动，验证**

script 部分保留现有 `loadStats/loadRedeem/loadOrders/filter/sort/paging` 全部逻辑不变，仅把「渲染」交给 Renderer。确保 scope/tabs/搜索/筛选/分页/操作全部透传。

- [ ] **Step 4: 构建 + 手机截图**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功。

创建 `_e2e/_shot_order_layouts.py`（390×844 dpr=2，登录 guoxinnanshan@163.com/you123123）：依次切 classic/status-first/status-group 各截图 `order_classic.png / order_status_first.png / order_status_group.png`。

- [ ] **Step 5: 手册章节 + 部署 + 提交**

在 `web-admin/src/static/manual/index.html` 追加 op-27「订单列表多版式」章节（含三图），`node scripts/deploy.mjs` 部署，验证生产 grep op-27，提交：

```bash
cd d:\zhao\vshop\web-admin
git add src/pages/order/list/index.vue _e2e/_shot_order_layouts.py src/static/manual
git commit -m "feat(admin): 订单列表多版式切换 + 手册 op-27"
```
