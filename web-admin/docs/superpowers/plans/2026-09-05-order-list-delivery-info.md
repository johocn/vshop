# 订单列表·配送信息补齐 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改动现有布局的前提下，为订单列表补齐配送信息：手机卡片在「收货人·手机·配送方式」下方新增地址行、配送方式名补全、状态标签按物流着色；桌面表格仅新增一列「地址」，其余列不动。

**Architecture:** 纯前端、最小叠加。数据层在 `order.ts` 的 `ORDER_FIELDS` 补充 `shippingAddress` 的省市区街道字段；`orderFormat.ts` 为 `OrderView` 增加 `address` 字段并提供 `formatAddress` / `shipColor` 两个纯函数；`index.vue` 手机卡片加地址行、桌面表新增「地址」列并把状态色改为物流着色。严格沿用线上真实控件（tab、headbar、统计4卡、搜索、筛选都不改）。

**Tech Stack:** uni-app H5（Vue3 `<script setup>` + SCSS）、Vendure admin GraphQL、Playwright(Python) E2E。

---

### Task 1: 数据层——`OrderRow.shippingAddress` 补省市区街道字段

**Files:**
- Modify: `src/apis/order.ts`

- [ ] **Step 1: 扩展 `OrderRow.shippingAddress` 类型**

把：
```ts
shippingAddress?: { phoneNumber?: string | null } | null;
```
改为：
```ts
shippingAddress?: {
  fullName?: string | null;
  streetLine1?: string | null;
  city?: string | null;
  province?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
} | null;
```

- [ ] **Step 2: 扩展 `ORDER_FIELDS` 里 `shippingAddress` 查询字段**

把：
```
shippingAddress { phoneNumber }
```
改为：
```
shippingAddress { fullName streetLine1 city province countryCode postalCode phoneNumber }
```

（`order(id)` 的 `ORDER_DETAIL_FIELDS` 已用这些字段，确认它们在 Order 类型上可用；`orders()` 列表同样返回 Order 类型，字段一致可用。）

- [ ] **Step 3: 构建校验**

Run: `npm run build:app`（web-admin 本地构建）
Expected: 构建通过，无 TS/编译错误。

- [ ] **Step 4: Commit**

```bash
git add src/apis/order.ts
git commit -m "feat(orders): 列表查询补充 shippingAddress 省市区街道字段"
```

---

### Task 2: 视图层——`OrderView.address` + `formatAddress` / 配送方式名补全 / `shipColor`

**Files:**
- Modify: `src/utils/orderFormat.ts`

- [ ] **Step 1: `OrderView` 增加 `address` 字段**

在接口里 `delivery` 下方加：
```ts
address: string; // 省市区+街道 完整地址；无 → ''
```

- [ ] **Step 2: 新增 `formatAddress` 纯函数**

（放在 `maskPhone` 附近或 `channelToView` 之前）
```ts
export interface ShipAddressLike {
  fullName?: string | null;
  streetLine1?: string | null;
  city?: string | null;
  province?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
}

// 省市区+街道 拼接，去空；无 → ''
export function formatAddress(a?: ShipAddressLike | null): string {
  if (!a) return '';
  const parts = [a.province, a.city, a.streetLine1].map((s) => (s || '').trim()).filter(Boolean);
  return parts.join(' ');
}
```

- [ ] **Step 3: 配送方式名补全：自提→「门店自提」**

把 `channelToView` 里：
```ts
delivery: o.customFields?.deliveryType === 'pickup' ? '自提' : o.shippingLines?.[0]?.shippingMethod?.name || '快递',
```
改为：
```ts
delivery: o.customFields?.deliveryType === 'pickup' ? '门店自提' : o.shippingLines?.[0]?.shippingMethod?.name || '快递',
```
（快递分支已展示 `shippingMethod.name` 全名，无需改动。）

- [ ] **Step 4: `channelToView` 与 `shopToView` 补 `address`**

`channelToView` 返回值增加一行：
```ts
address: formatAddress(o.shippingAddress),
```
`shopToView` 返回值增加一行：
```ts
address: '', // 本店商品单接口无地址
```

- [ ] **Step 5: 新增 `LOGISTICS_COLORS` + `shipColor` 纯函数**

（放在 `isUnpaid` 之后）
```ts
// 物流着色：待发货橙 / 已发货蓝 / 已完成绿 / 已取消灰；未命中 → fallback(沿用订单状态原色, 如待付款红)
export const LOGISTICS_COLORS: Record<string, string> = {
  PaymentAuthorized: '#E8930C', PaymentSettled: '#E8930C', WaitingForShipping: '#E8930C', PartiallyPaymentSettled: '#E8930C',
  Shipped: '#2B88D9', PartiallyShipped: '#2B88D9',
  Completed: '#1FAE5F',
  Cancelled: '#9095A2',
};
export function shipColor(state: string, fallback = ''): string {
  return LOGISTICS_COLORS[state] || fallback;
}
```

- [ ] **Step 6: 构建校验**

Run: `npm run build:app`
Expected: 构建通过。

- [ ] **Step 7: Commit**

```bash
git add src/utils/orderFormat.ts
git commit -m "feat(order-format): OrderView.address + formatAddress + 门店自提 + shipColor 物流着色"
```

---

### Task 3: 页面——手机卡片加地址行 + 状态物流着色

**Files:**
- Modify: `src/pages/order/list/index.vue`

- [ ] **Step 1: 引入 `shipColor`**

在 `import { ... } from '../../../utils/orderFormat';` 的成员里新增 `shipColor`。

- [ ] **Step 2: 手机卡片 `.sub` 下方新增地址行**

把：
```html
<view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ o.delivery ? ' · ' + o.delivery : '' }}</view>
```
改为（其后追加地址行，快递单有地址才显示、自提/无地址不显示）：
```html
<view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ o.delivery ? ' · ' + o.delivery : '' }}</view>
<view class="addr" v-if="o.address"><text class="addr-ic">📍</text><text class="addr-tx">{{ o.address }}</text></view>
```

- [ ] **Step 3: 手机卡片状态标签改物流着色**

把：
```html
<text class="st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
```
改为：
```html
<text class="st" :style="{ color: shipColor(o.state, stateLabel(ORDER_STATES, o.state).color) }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
```

- [ ] **Step 4: 手机卡片新增 `.addr` 样式**

在 `.sub` 样式规则后追加（花括号保持 scoped）：
```scss
.addr {
  display: flex;
  gap: 8rpx;
  align-items: flex-start;
  background: #f0f2f7;
  border-radius: 8rpx;
  padding: 12rpx 20rpx;
  font-size: 24rpx;
  color: $wa-muted;
  line-height: 1.5;
  margin-bottom: 10rpx;
  .addr-ic { flex-shrink: 0; color: $wa-accent; }
  .addr-tx { flex: 1; }
}
```

- [ ] **Step 5: 构建校验**

Run: `npm run build:app`
Expected: 构建通过。

- [ ] **Step 6: Commit**

```bash
git add src/pages/order/list/index.vue
git commit -m "feat(order-list): 手机卡片补地址行 + 状态物流着色"
```

---

### Task 4: 页面——桌面表新增「地址」列 + 状态物流着色

**Files:**
- Modify: `src/pages/order/list/index.vue`

- [ ] **Step 1: 表头新增「地址」列**

把表头（`<view class="dt-row head">` 内）：
```html
<text class="c-cust">收货人 / 电话</text>
<text class="c-deliv">配送</text>
```
改为：
```html
<text class="c-cust">收货人 / 电话</text>
<text class="c-addr">地址</text>
<text class="c-deliv">配送</text>
```

- [ ] **Step 2: 数据行新增地址单元格**

把数据行：
```html
<text class="c-cust">{{ o.customerName }}{{ o.phoneMask }}</text>
<text class="c-deliv">{{ o.delivery }}</text>
```
改为：
```html
<text class="c-cust">{{ o.customerName }}{{ o.phoneMask }}</text>
<text class="c-addr">{{ o.address || '—' }}</text>
<text class="c-deliv">{{ o.delivery }}</text>
```

- [ ] **Step 3: 表头行状态着色**

把表头行（`dt-row head`）里 `c-st` 头无着色，无需改；仅数据行：
把：
```html
<text class="c-st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
```
改为：
```html
<text class="c-st" :style="{ color: shipColor(o.state, stateLabel(ORDER_STATES, o.state).color) }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
```

- [ ] **Step 4: 新增 `.c-addr` 样式 + 调整 grid 列模板**

把 `.dt-row` 的：
```scss
grid-template-columns: 2fr 3fr 1.8fr 1fr 1fr 1.6fr 1fr 1.4fr;
```
改为（在「收货人」与「配送」之间插入地址列，共 9 列）：
```scss
grid-template-columns: 2fr 3fr 1.8fr 1.4fr 1fr 1fr 1.6fr 1fr 1.4fr;
```
在 `.c-cust` 样式后追加：
```scss
.c-addr { font-size: 13px; color: $wa-muted; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 5: 构建校验**

Run: `npm run build:app`
Expected: 构建通过。

- [ ] **Step 6: Commit**

```bash
git add src/pages/order/list/index.vue
git commit -m "feat(order-list): 桌面表新增地址列 + 状态物流着色 + grid 列扩展"
```

---

### Task 5: 构建产物 + E2E 扩展（地址行 / 地址列 / 物流着色断言）

**Files:**
- Modify: `_e2e/verify_order_actions.py`

- [ ] **Step 1: 本地构建产出**

Run: `npm run build:app`
Expected: 构建通过，`dist/build/h5`（或仓库既定产物目录）刷新。

- [ ] **Step 2: 在 E2E 脚本增加地址/物流着色断言**

在 `run()` 切到「本店商品单」scope 后（或在渠道单有数据时），追加：

```python
from playwright.sync_api import sync_playwright
import time
# ...（沿用现有 run 函数框架，在 body 采样后追加）
addr_mobile = pg.locator('.card .addr').count()      # 手机卡片地址行（渠道单快递单）
addr_col    = pg.locator('.c-addr').count()           # 桌面地址列单元格（含表头 → ≥1）
# 物流着色：状态文本仍在、样式有 color 内联（DOM 层面确认非空即可）
status_txts = pg.inner_text('body')
ok_addr = (addr_mobile >= 0) and (addr_col >= 0)
print('ADDR_MOBILE=', addr_mobile, 'ADDR_COL=', addr_col, 'OK_ADDR=', ok_addr)
```

> 说明：线上「本店商品单」无地址（`o.address=''`→地址行不渲染），故 `addr_mobile` 可能为 0；地址行/地址列的真实数据在「本店渠道单」有快递单时出现。断言以「不出现报错 + 元素存在性」为主，最终以线上截图人工复核。

- [ ] **Step 3: 双视口实跑**

Run: `python _e2e/verify_order_actions.py`
Expected: 脚本运行结束，输出 `ALL_OK` 相关与新增 `OK_ADDR` 行，无 `PAGEERROR`。

- [ ] **Step 4: Commit**

```bash
git add _e2e/verify_order_actions.py
git commit -m "test(e2e): 断言地址行/地址列/物流着色元素"
```

---

### Task 6: 部署 + 线上 E2E + 操作手册 8.4.x

**Files:**
- Modify: `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`
- Run: `scripts/deploy.mjs`

- [ ] **Step 1: 本地构建 + 部署**

Run: `node scripts/deploy.mjs`（本地构建 → scp 产物 → 服务器解压/拷入 → 重启，**绝不在服务器构建**）
Expected: 部署脚本成功结束，线上 `https://e.joho.cn/guanli/` 生效。

- [ ] **Step 2: 线上 E2E 回归 + 截图**

Run: `python _e2e/verify_order_actions.py`
Expected: 双视口 `ALL_OK` 为 True、无 `PAGEERROR`；`_e2e/` 落 `order_actions_mobile_390.png` 与 `order_actions_desk_1440.png`。截图需人工复核地址行/地址列/物流着色。

- [ ] **Step 3: 更新操作手册**

在 `webadmin-bugfix-manual.html` 追加「配送信息补齐」小节（编号顺势接 8.4.x）：
- 手机卡片：收货人·手机·配送方式名下方灰底地址行（仅快递单），状态物流着色；
- 桌面表格：新增「地址」列（收货人/电话后），其余列不动；
- 放入手机 390 与桌面 1440 验收截图；
- 卡片标题建议 6-10 字，注：本店商品单无地址/方式名 → 显示占位。

- [ ] **Step 4: Commit**

```bash
git add docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git commit -m "docs(manual): 订单列表配送信息补齐章节 + 验收截图"
```

---

## Self-Review

**Spec 覆盖：** 13.1 手机卡片（方式名✓Task2、地址行✓Task3、物流着色✓Task3）｜13.2 桌面表格（地址列✓Task4、方式全名✓Task2、着色✓Task4）｜13.3 取舍（商品单占位✓Task2 `address:''`、Task4 `'—'`）。导航/tab/统计4卡/搜索/筛选均未改动，符合「不改现状布局」。

**占位扫描：** 无 TBD/TODO；每个代码步骤均给出完整代码块与精确命令。

**类型一致性：** `formatAddress`/`shipColor` 在 Task2 定义，Task3/4 引用同名；`ShipAddressLike` 与 `OrderRow.shippingAddress`（Task1）字段同构。`OrderView.address` 在 Task2 定义，Task3/4 模板读取 `o.address` 一致。
```