# 订单列表·催付 + 商品单缩略图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「本店商品单」商品行从灰占位块升级为真实商品缩略图（前端按 `productId` 批量查图），并给待付款订单加「催付」按钮，一键把含订单号+金额+顾客名的文案复制到剪贴板。

**Architecture:** 纯前端改造，只动 `web-admin`（数据层 + 视图工具 + 订单列表页），沿用 `scripts/deploy.mjs` 本地构建部署。缩略图复用 Vendure admin `products` 查询的 `filter:{id:{in}}` 批量取商品级 `featuredAsset.preview`，`order.ts` 只返相对路径、`orderFormat.shopToView` 拼完整 URL（避免循环依赖）；查图失败优雅降级回占位块。催付为纯函数拼文案 + `uni.setClipboardData` 复制，零后端。

**Tech Stack:** Vue 3 + TypeScript + uni-app（H5/小程序），Vendure admin GraphQL（`getAdminClient`），uView 设计令牌 `$wa-*`，Playwright E2E（Python，`_e2e/`）。

**_测试门禁说明：** 本仓库无单测框架，既定验收方式为 ① `tsc --noEmit` 类型检查（每 Task 代码改完即跑）② Playwright E2E（`_e2e/verify_order_actions.py`，扩展本计划覆盖新断言）③ 手机 390×844 + 桌面 1440×900 截图计入操作手册。

---

## 文件结构

| 文件 | 职责 | 变更 |
|---|---|---|
| `src/apis/order.ts` | 数据层；新增 `fetchProductThumbs` | Modify（末尾追加） |
| `src/utils/orderFormat.ts` | 视图工具；新增 `isUnpaid`/`buildReminderText`，`shopToView` 增 `thumbMap` | Modify |
| `src/pages/order/list/index.vue` | 页面；催付按钮 + `goRemind` + 商品单查图接线 | Modify |
| `scripts/verify_order_actions.py`（现 `_e2e/verify_order_actions.py`） | E2E；断言新增催付/缩略图 | Modify |
| `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` | 操作手册；补催付+缩略图章节/截图 | Modify |

依赖关系：Task1 数据层 → Task2 视图工具（`shopToView` 消费 `thumbMap`）→ Task3 页面接线（消费两者）→ Task4 构建+E2E → Task5 部署+手册。逐步提交、每 Task 结束后代码可编译。

---

### Task 1: 数据层 `fetchProductThumbs`

**Files:**
- Modify: `src/apis/order.ts`（在 `fetchShopOrders`（约 75 行）之后追加）

- [ ] **Step 1.1: 追加 `fetchProductThumbs` 函数**

在 `src/apis/order.ts` 的 `fetchShopOrders` 函数结束后（`return myShopOrders ?? []; }` 之后）追加：

```ts
// 商品单缩略图：myShopOrders items 只带 productId, 无图;
// 按 productId 批量取商品级 featuredAsset.preview, 建 id→相对路径 映射(拼域名交给 orderFormat)。
export async function fetchProductThumbs(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return {};
  const chunk = 80; // 分批, 避免单次 in 数组过长
  const map: Record<string, string> = {};
  for (let i = 0; i < uniq.length; i += chunk) {
    const batch = uniq.slice(i, i + chunk);
    const { products } = await getAdminClient().request<{
      products: { items: Array<{ id: string; featuredAsset?: { preview?: string } | null }> };
    }>(
      `query ProductThumbs($ids: [ID!]!) {
        products(options: { filter: { id: { in: $ids } } }) {
          items { id featuredAsset { preview } }
        }
      }`,
      { ids: batch },
    );
    for (const p of products.items) {
      const src = p.featuredAsset?.preview;
      if (src) map[p.id] = src; // 仅相对路径, 由 shopToView 经 imageFullUrl 拼完整
    }
  }
  return map;
}
```

- [ ] **Step 1.2: 类型检查**

Run: `cd d:\zhao\vshop\web-admin && npx tsc --noEmit`
Expected: exit 0，无新增错误（不应有 `getAdminClient`/`Record` 未定义类报错）。

- [ ] **Step 1.3: Commit**

```bash
git add src/apis/order.ts
git commit -m "feat(order): 数据层 fetchProductThumbs 按 productId 批量取商品缩略图"
```

---

### Task 2: 视图工具 `isUnpaid` + `buildReminderText` + `shopToView` 增 `thumbMap`

**Files:**
- Modify: `src/utils/orderFormat.ts`

- [ ] **Step 2.1: 新增催付判断与文案纯函数**

在 `src/utils/orderFormat.ts` 的 `isShippable` 函数之后追加：

```ts
// 待付款(可催付)：order 状态机实测, 待付款 = ArrangingPayment
export function isUnpaid(state: string): boolean {
  return state === 'ArrangingPayment';
}

// 生成催付文案(纯函数)。顾客名为默认占位'顾客'时省略称谓; shopName 缺省则该行省略。
export function buildReminderText(o: OrderView, opts?: { shopName?: string }): string {
  const shop = opts?.shopName ? `${opts.shopName} ` : '';
  const name = o.customerName && o.customerName !== '顾客' ? `，${o.customerName}` : '';
  return [
    `${shop}有一笔订单待支付${name}，请尽快完成付款：`,
    `订单号：${o.code}`,
    `金额：¥${fmtMoney(o.total)}`,
    '点击链接或登录确认支付，谢谢支持！',
  ].join('\n');
}
```

- [ ] **Step 2.2: `shopToView` 增 `thumbMap` 参数并填图**

将 `src/utils/orderFormat.ts` 的 `shopToView` 函数整体替换为：

```ts
export function shopToView(s: ShopOrderRow, thumbMap: Record<string, string> = {}): OrderView {
  return {
    id: s.orderId,
    code: s.code,
    state: s.state,
    customerName: s.customerName || '顾客',
    phoneMask: '', // 本店商品单接口不返回手机号 → 显示空
    delivery: '快递',
    payment: '',
    time: s.placedAt || '',
    goods: (s.items || []).map((it) => ({
      name: it.productName || it.variantName || '',
      qty: Number(it.quantity || 0),
      price: Number(it.lineTotalWithTax || 0),
      image: thumbMap[it.productId] ? imageFullUrl(thumbMap[it.productId]) : '',
    })),
    total: Number(s.totalWithTax || 0),
  };
}
```

- [ ] **Step 2.3: 类型检查**

Run: `cd d:\zhao\vshop\web-admin && npx tsc --noEmit`
Expected: exit 0。若 `imageFullUrl`/`fmtMoney` 在 `shopToView` 处未在作用域（不存在的可能性低，二者均为同文件顶层函数），确认 import/定义存在；当前文件已定义二者，应通过。

- [ ] **Step 2.4: Commit**

```bash
git add src/utils/orderFormat.ts
git commit -m "feat(orderFormat): 催付 isUnpaid+buildReminderText, shopToView 按 thumbMap 填缩略图"
```

---

### Task 3: 页面接线（催付按钮 + 商品单查图）

**Files:**
- Modify: `src/pages/order/list/index.vue`

- [ ] **Step 3.1: 车导入新增工具**

把 `src/pages/order/list/index.vue` 的 import 语句（`import { ... } from '../../../utils/orderFormat';`）扩展，加入 `isUnpaid` 与 `buildReminderText`：

```ts
import { channelToView, shopToView, isGhostView, isShippable, buildReminderText, isUnpaid, fmtMoney, computeStats, OrderView } from '../../../utils/orderFormat';
```

把 `import { fetchOrders, fetchShopOrders, ShopOrderRow, OrderRow } from '../../../apis/order';` 扩展为加 `fetchProductThumbs`：

```ts
import { fetchOrders, fetchShopOrders, fetchProductThumbs, ShopOrderRow, OrderRow } from '../../../apis/order';
```

- [ ] **Step 3.2: 卡片与表格操作区加催付按钮**

在卡片操作区（当前模板约 51-55 行）发货/核销之后、详情之前插入催付：

```html
<view class="actions">
  <text v-if="isShippable(o.state)" class="act ship" @tap="goShip(o)">发货</text>
  <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
  <text v-if="isUnpaid(o.state)" class="act remind" @tap="goRemind(o)">催付</text>
  <text class="act ghost" @tap="goDetail(o)">详情</text>
</view>
```

在桌面表格操作区（约 81-85 行）同样插入：

```html
<view class="c-ops">
  <text v-if="isShippable(o.state)" class="act ship" @tap="goShip(o)">发货</text>
  <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
  <text v-if="isUnpaid(o.state)" class="act remind" @tap="goRemind(o)">催付</text>
  <text class="act ghost" @tap="goDetail(o)">详情</text>
</view>
```

- [ ] **Step 3.3: 新增 `goRemind` handler**

在 `src/pages/order/list/index.vue` 的 `goRedeemPage` 函数之后、`onMounted` 之前插入：

```ts
function goRemind(o: OrderView) {
  const text = buildReminderText(o);
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '催付文案已复制，请粘贴发给顾客', icon: 'none' }),
    fail: () => uni.showToast({ title: '复制失败，请重试', icon: 'none' }),
  });
}
```

- [ ] **Step 3.4: `load()` 商品单分支接入查图**

把 `load()` 函数内 `scope.value === 'shop'` 分支的 `shopToView` 调用改为先查图映射：

原代码（约 171-183 行）：
```ts
const list = await fetchShopOrders();
totalItems.value = list.length;
let rows = list as (ShopOrderRow)[];
```

改为在其后插入查图（保持后续过滤逻辑不动，把最后的 map 补上 thumbMap）：

```ts
const list = await fetchShopOrders();
totalItems.value = list.length;
let rows = list as (ShopOrderRow)[];
const ids = list.flatMap((o) => (o.items || []).map((it) => it.productId));
const thumbMap = await fetchProductThumbs(ids); // 失败向上抛, 被 finally 兜住, views 保持占位
```

并把该分支末尾（约 183 行）：
```ts
views.value = rows.map(shopToView).filter((v) => !isGhostView(v));
```
改为：
```ts
views.value = rows.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
```

> 注意：`fetchProductThumbs` 抛错会中断 `load()` 内 try，但 `finally { loading.value = false }` 仍执行，`views` 保持旧的（或空 + `暂无订单`）→ 属优雅降级；若想遇到厂商查询失败仍显示占位列表，可选用 `try { thumbMap = await fetchProductThumbs(ids) } catch { thumbMap = {} }`。**计划采用 try/catch 兜底**，确保查图失败列表仍正常渲染占位块：

```ts
let thumbMap: Record<string, string> = {};
try { thumbMap = await fetchProductThumbs(ids); } catch { thumbMap = {}; }
```

- [ ] **Step 3.5: 新增 `.remind` 样式**

在 `src/pages/order/list/index.vue` 样式 `@import` 区对应 `.actions .ghost` 的相邻位置，为卡片与表格 `.c-ops` 都加 `.remind`（卡片与桌面各一份，或用共用类）。在卡片 `.actions` 规则块内（`.ghost` 之后）追加：

```scss
.remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
```

并在桌面 `.c-ops` 规则块内（`.ghost` 之后，约 419 行）同样追加 `.remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }`。

- [ ] **Step 3.6: 类型检查**

Run: `cd d:\zhao\vshop\web-admin && npx tsc --noEmit`
Expected: exit 0。若提示 `Record` 未引入/`thumbMap` 未定义，按报错补类型标注（本处 `thumbMap` 由 `fetchProductThumbs` 返回推断，无需额外 import；`Record` 为 TS 内置，无需 import）。

- [ ] **Step 3.7: Commit**

```bash
git add src/pages/order/list/index.vue
git commit -m "feat(order-list): 待付款催付按钮+复制文案, 商品单按 productId 查图填缩略图"
```

---

### Task 4: 构建 + E2E 脚本扩展

**Files:**
- Modify: `_e2e/verify_order_actions.py`
- Verify: `npm run build:h5` 产物

- [ ] **Step 4.1: 本地构建**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 成功生成 `dist/`，无编译错误。若 `@dcloudio` 报兼容问题，记录输出后再定。

- [ ] **Step 4.2: 扩展 E2E 断言催付与缩略图**

打开 `_e2e/verify_order_actions.py`，在既有「切到本店商品单」后的断言区追加（保留原有 ship/detail/redeem/thumb 断言，新增）：

```python
remind_btns = pg.locator('.act.remind').count()      # 催付按钮(待付款单)
thumb_img_prod = pg.locator('.g-thumb image, .g-thumb uni-image, .g-thumb img').count()  # 商品单真实缩略图
ok_remind = remind_btns > 0
ok_thumb_img = thumb_img_prod > 0
print('REMIND_BTNS=', remind_btns, 'PROD_THUMB_IMG=', thumb_img_prod)
```

并把 `ALL_OK` 组合改为包含两个新断言：
```python
print('=== TAG', tag, '===  ALL_OK', ok_ship and ok_detail and ok_thumb and ok_remind and ok_thumb_img)
```

> 注：若线上「本店商品单」的待付款单为空，`remind_btns` 可能为 0——此时把阈值调整为「切到待付款 tab 断言」（`.tabs` 点“待付款”后数 `.act.remind`）。实现时以真实线上数据为准，断言脚本保持能真实通过。

- [ ] **Step 4.3: Commit**

```bash
git add _e2e/verify_order_actions.py
git commit -m "test(order-list): 新增催付按钮与商品单缩略图 E2E 断言"
```

---

### Task 5: 部署 + 线上 E2E + 手册截图

**Files:**
- Modify: `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`
- 执行: `scripts/deploy.mjs`（本地构建 → scp → 服务器解压/拷入，**绝不在服务器构建**）

- [ ] **Step 5.1: 本地构建**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 成功生成 `dist/`。

- [ ] **Step 5.2: 部署（本地构建产物 → 服务器）**

Run: `cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
按仓库部署铁律：本地构建，服务器仅解压/`pm2 restart`，`deploy.mjs` 走 scp 产物→服务器解压/拷入路径。确认输出无报错。

- [ ] **Step 5.3: 线上 E2E 回归**

Run: `cd d:\zhao\vshop\web-admin && python _e2e/verify_order_actions.py`
Expected: 两个 viewport（手机 390×844 / 桌面 1440×900）`ALL_OK True`，`REMIND_BTNS`/`PROD_THUMB_IMG` 均 > 0（或按 Step 4.2 的真实数据阈值通过）。
该脚本同时输出 `order_actions_mobile_390.png`、`order_actions_desk_1440.png` 两张截图。

- [ ] **Step 5.4: 用手机视口截图补抓催付+缩略图场景**

若默认截图未突出催付/缩略图，手动用同脚本或一次 Playwright 登录到「本店商品单」+点「待付款」tab 后截图，命名 `order_remind_thumb_mobile_390.png`。拷贝到 `docs/webadmin-bugfix-manual/assets/`。

- [ ] **Step 5.5: 手册补充**

在 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 的 8.4 章节追加子小节「催付 + 商品单缩略图」，含：
- 催促按钮：待付款(ArrangingPayment)订单操作区显示「催付」，点击复制含订单号+金额+顾客名文案并 toast 提示。
- 商品单缩略图：前端按 `productId` 调 `products(filter:{id:{in}})` 批量取图；查图失败/无图→占位块。
- 插入第 5.4 步截图，图注手机/桌面。

- [ ] **Step 5.6: Commit**

```bash
git add docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html docs/webadmin-bugfix-manual/assets/*
git commit -m "docs(webadmin): 手册补催付+商品单缩略图章节及截图"
```

---

## 自检要点

- **Scope（spec 覆盖）**：`isUnpaid`→Task2/Task3；`buildReminderText`→Task2/Task3；`fetchProductThumbs`→Task1/Task3；`shopToView` thumbMap→Task2；E2E→Task4；部署+手册→Task5。无遗漏。
- **类型一致性**：`fetchProductThumbs` 返回 `Record<string,string>`（相对路径），`shopToView` 第二参 `thumbMap: Record<string,string>` 且内部 `imageFullUrl(thumbMap[...])` 拼完整——两端一致；`buildReminderText` 接受 `OrderView`，页面 `o` 即 `OrderView`，一致。
- **循环依赖**：`order.ts` 不 import `orderFormat`；`orderFormat` 仅 import `order.ts` 的类型 —— 无环。
- **占位符扫描**：无 TBD/TODO；除 Step 4.2 的「以线上数据为准」说明外，均为可直接执行代码。