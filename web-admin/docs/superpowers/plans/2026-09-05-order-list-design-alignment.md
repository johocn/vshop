# 订单列表·对齐设计方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/pages/order/list/index` 补齐与已批准设计方案(`order-redesign.html`)的差距：操作区状态化快捷按钮（发货/去核销/详情）、手机卡片商品缩略图、收货人行配送位置、桌面 headbar 单行统一。

**Architecture:** 数据层(`apis/order.ts`)补 `featuredAsset` 取图字段；视图工具(`utils/orderFormat.ts`)新增 `isShippable`/`imageFullUrl`/`OrderGood.image`；页面(`pages/order/list/index.vue`)改模板+CSS。全程前端、零后端改动（`manifest.ts`/`index.vue` 等无关文件不碰）。

**Tech Stack:** uni-app(Vue3 `<script setup>` + SCSS)、Vendure admin GraphQL、Playwright(python)、`scripts/deploy.mjs` 部署。

---

### Task 1: 视图工具——缩略图字段与状态判断纯函数

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\utils\orderFormat.ts`

- [ ] **Step 1: 扩展 `OrderGood` 增加 `image`**

  在 `orderFormat.ts` 的 `interface OrderGood`(`name/qty/price`)中新增可选字段，改为：

```ts
export interface OrderGood {
  name: string;
  qty: number;
  price: number;
  image?: string; // 商品缩略图完整 URL；本店商品单无图 → undefined
}
```

- [ ] **Step 2: 新增 `imageFullUrl` 与 `isShippable` 纯函数**

  在 `export function maskPhone(` **前** 插入两个导出函数（位置随意，保持模块级）：

```ts
// 缩略图完整 URL：Vendure source 是相对路径，动态拼当前访问域名（禁硬编码）
export function imageFullUrl(src?: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${src}`;
}

// 可发货状态集合（订单已支付/待履约，可进入发货页）
export const SHIPPABLE_STATES = ['PaymentAuthorized', 'PaymentSettled', 'WaitingForShipping', 'PartiallyPaymentSettled'];
export function isShippable(state: string): boolean {
  return SHIPPABLE_STATES.includes(state);
}
```

- [ ] **Step 3: `channelToView` 补缩略图**

  将 `channelToView` 的 `goods` 映射体替换为带 `image` 的版本（其余字段不动）：

```ts
    goods: (o.lines || []).map((l) => ({
      name: l.productVariant?.name || (l as any).productName || '',
      qty: Number(l.quantity || 0),
      price: Number(l.linePriceWithTax || 0),
      image: imageFullUrl(l.productVariant?.featuredAsset?.source),
    })),
```

  `shopToView` 的 `goods` **保持原样**（`myShopOrders` 无图字段）。两处 `goods` 映射都要保留。

- [ ] **Step 4: 构建设置检查（类型编译）**

  运行：
  ```
  cd d:\zhao\vshop\web-admin && npx vue-tsc --noEmit
  ```
  期望：不报 `orderFormat.ts` 相关类型错误（`featuredAsset` 尚不在 `OrderRow` 类型里会报错——这是**预期**，Task 2 补类型）。

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/utils/orderFormat.ts
git commit -m "feat(orderFormat): 缩略图字段+imageFullUrl+发货态 isShippable"
```

---

### Task 2: 数据层——`featuredAsset` 字段

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\order.ts`

- [ ] **Step 1: 扩展 `OrderRow.lines` 类型补 `featuredAsset`**

  将 `order.ts:29` 的 `lines` 行替换为：

```ts
  lines?: Array<{ quantity: number; productVariant?: { name: string; featuredAsset?: { source?: string | null } | null } | null; linePriceWithTax?: number }>;
```

- [ ] **Step 2: `ORDER_FIELDS` 补 `featuredAsset { source }`**

  将 `order.ts:38` 的 lines 段替换为：

```ts
  lines { quantity productVariant { name featuredAsset { source } } linePriceWithTax }
```

  注意：不修改 `fetchShopOrders` 的 `myShopOrders` 查询体（商品单接口没有该字段）。

- [ ] **Step 3: 类型编译通过**

  运行：`cd d:\zhao\vshop\web-admin && npx vue-tsc --noEmit`
  期望：通过（`featuredAsset` 已补类型）。

- [ ] **Step 4: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/apis/order.ts
git commit -m "feat(order): lines 查询补 featuredAsset 缩略图字段"
```

---

### Task 3: 页面——头栏 `.headbar` 统一（订单→统计→核销码）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue`

- [ ] **Step 1: 模板——将 `topbar` 与 `stats` 合并进 `.headbar`**

  把 `index.vue` 第 3–21 行（整个 `.topbar` 与 `.stats` 两个块）整体替换为：

```html
    <view class="headbar">
      <text class="title">订单</text>
      <view class="stats">
        <view class="stat">
          <text class="num">{{ stats.today }}</text>
          <text class="lbl">今日订单</text>
        </view>
        <view class="stat">
          <text class="num">{{ stats.toShip }}</text>
          <text class="lbl">待发货</text>
        </view>
        <view class="stat">
          <text class="num">{{ stats.refund }}</text>
          <text class="lbl">待退款</text>
        </view>
      </view>
      <view class="redeem-btn" @tap="goRedeemPage">核销码</view>
    </view>
```

- [ ] **Step 2: 样式——删除旧 `.topbar`，新增 `.headbar`**

  将 `<style>` 中 `.topbar { ... }`（第 259–272 行）整段替换为：

```scss
  .headbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 20rpx;
    .title { font-size: 34rpx; color: $wa-ink; font-weight: 700; margin-right: auto; }
    .redeem-btn {
      background: $wa-accent;
      color: #fff;
      font-size: 26rpx;
      padding: 10rpx 28rpx;
      border-radius: 999rpx;
    }
  }
```

- [ ] **Step 3: 样式——`stats` 改为可换行的全宽块（手机第 2 行）**

  将现有 `.stats { ... }`（第 274–289 行）属性**补充**两行（其余不变），改为：

```scss
  .stats {
    display: flex;
    flex: 1 0 100%;
    order: 3;
    gap: 16rpx;
    margin-top: 16rpx;
    margin-bottom: 0;
    .stat { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 0; text-align: center; display: flex; flex-direction: column;
      .num { font-size: 36rpx; color: $wa-ink; font-weight: 700; }
      .lbl { margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; }
    }
  }
```

- [ ] **Step 4: 样式——桌面(≥768) headbar 单行内联**

  在文件末尾 `@media (min-width: 768px) { ... }` 块内追加 4 条规则（保留已有 `.page`/`.card-list`/`.dt` 三行）：

```scss
  .page .headbar { flex-wrap: nowrap; }
  .page .headbar .stats { flex: 1; order: 1; margin: 0 24px; }
  .page .headbar .title { order: 0; }
  .page .headbar .redeem-btn { order: 2; }
```

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): headbar 统一订单→统计→核销码，桌面单行内联"
```

---

### Task 4: 页面——手机卡片：商品缩略图 + 收货人行配送位置

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue`

- [ ] **Step 1: 模板——卡片商品行加缩略图**

  将第 42–45 行的卡片 `goods` 循环块替换为（新增 `image` 分支 + 占位块）：

```html
        <view class="goods" v-for="(g, gi) in o.goods" :key="gi">
          <image v-if="g.image" class="g-thumb" :src="g.image" mode="aspectFill" />
          <view v-else class="g-thumb"></view>
          <text class="g-name">{{ g.name }}</text>
          <text class="g-price">×{{ g.qty }} ¥{{ fmtMoney(g.price) }}</text>
        </view>
```

- [ ] **Step 2: 模板——收货人行(第 41 行) 追加配送方式**

  将第 41 行替换为：

```html
        <view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ o.delivery ? ' · ' + o.delivery : '' }}</view>
```

- [ ] **Step 3: 模板——foot 行去掉重复配送**

  将第 47 行替换为：

```html
          <text class="time">{{ o.payment ? o.payment + ' · ' : '' }}{{ fmtTime(o.time) }}</text>
```

- [ ] **Step 4: 样式——新增 `.g-thumb`**

  在 `.goods` 样式块内、`.g-name` 规则之前追加：

```scss
        .g-thumb { width: 56rpx; height: 56rpx; border-radius: 8rpx; background: #f0f2f7; flex-shrink: 0; margin-right: 16rpx; }
```

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 卡片商品缩略图+收货人行配送位置"
```

---

### Task 5: 页面——操作区状态化快捷按钮（发货/去核销/详情）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue`

- [ ] **Step 1: 模板——手机卡片操作区加「发货」**

  将第 50–53 行卡片 `actions` 替换为（按钮顺序：发货→去核销→详情）：

```html
        <view class="actions">
          <text v-if="isShippable(o.state)" class="act ship" @tap="goShip(o)">发货</text>
          <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
          <text class="act ghost" @tap="goDetail(o)">详情</text>
        </view>
```

- [ ] **Step 2: 模板——桌面表格操作区加「发货」**

  将第 80–82 行的 `c-ops` 内操作替换为同款：

```html
          <text v-if="isShippable(o.state)" class="act ship" @tap="goShip(o)">发货</text>
          <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
          <text class="act ghost" @tap="goDetail(o)">详情</text>
```

- [ ] **Step 3: 脚本——导入 `isShippable` 并新增 `goShip`**

  在 `orderFormat` import 列表（第 100 行附近）追加 `isShippable`：

```ts
import {
  channelToView,
  shopToView,
  isGhostView,
  isShippable,
  fmtMoney,
  computeStats,
  OrderView,
} from '../../../utils/orderFormat';
```

  在 `goDetail` 函数（第 231 行）上方新增：

```ts
function goShip(o: OrderView) {
  uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` });
}
```

- [ ] **Step 4: 样式——新增 `.ship` 按钮色**

  手机卡片 `.actions` 内（`.redeem` 规则旁，约第 376 行）追加：

```scss
        .ship { color: #fff; background: $wa-accent; }
```

  并将 `.redeem` 从实心改为描边强调（与主发货区分）：

```scss
        .redeem { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
```

  桌面 `c-ops` 内（`.redeem` 规则旁，约第 412 行）同样追加 `.ship` 并让 `.redeem` 描边：

```scss
        .ship { color: #fff; background: $wa-accent; }
        .redeem { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
```

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 操作区状态化快捷按钮 发货/去核销/详情"
```

---

### Task 6: 构建 + 本地 E2E 冒烟

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\verify_order_actions.py`

- [ ] **Step 1: 本地构建**

  运行：`cd d:\zhao\vshop\web-admin && npm run build:h5`
  期望：构建成功（出门重新生成 `dist/build/h5`，`assets/` 非空）。若 `vue-tsc` 夹在构建里且报 `errors`，回到对应 Task 修类型。

- [ ] **Step 2: 写 E2E 脚本**（断言发货/去核销/详情按钮 + 缩略图）

  创建 `_e2e/verify_order_actions.py`：

```python
# -*- coding: utf-8 -*-
# 回归：操作区状态化快捷按钮 + 卡片缩略图。superadmin 选店 t1。
from playwright.sync_api import sync_playwright
import time
BASE='https://e.joho.cn/guanli/'
SHOT='d:/zhao/vshop/web-admin/_e2e/'
def run(vp,tag):
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True)
        pg=b.new_page(viewport=vp); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
        pg.goto(BASE,wait_until='networkidle',timeout=45000)
        pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle',timeout=45000)
        pg.locator('input').nth(0).fill('superadmin'); pg.locator('input').nth(1).fill('z123123')
        pg.locator('button, .btn').first.click(); time.sleep(4)
        pg.locator('.item',has_text='t1').first.click(); time.sleep(4)
        pg.goto(BASE+'#/pages/order/list/index',wait_until='networkidle',timeout=45000); time.sleep(3)
        body=pg.inner_text('body')
        has_ship  = '发货' in body
        has_redeem= '去核销' in body
        has_detail= '详情' in body
        has_thumb = pg.locator('image.g-thumb').count()>0
        pg.screenshot(path=SHOT+'order_actions_'+('desk_1440.png' if tag=='desk' else 'mobile_390.png'),full_page=True)
        print('=== TAG',tag,'===  ALL_OK', has_ship and has_redeem and has_detail)
        print('HAS_SHIP=',has_ship,'HAS_REDEEM=',has_redeem,'HAS_DETAIL=',has_detail,'HAS_THUMB_IMG=',has_thumb)
        print('PAGEERRORS=',errs if errs else '(none)','| BODY_HEAD=',body[:80].replace('\n','|'))
        b.close()
run({'width':390,'height':844},'mobile')
run({'width':1440,'height':900},'desk')
```

- [ ] **Step 3: 本地起 dev server 冒烟（可选，若已部署可跳过）**

  如需先看效果：`cd d:\zhao\vshop\web-admin && npm run dev:h5`，用浏览器打开本地地址验证。验收后停掉。若直接部署，跳到 Task 7。

---

### Task 7: 部署 + 线上 E2E + 截图归档

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`

- [ ] **Step 1: 部署到线上**

  运行：`cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
  期望日志末行 `deploy done`（本地构建→scp→服务器解压+备份轮转+reload nginx，遵循「本地构建、服务器只解压」铁律）。

- [ ] **Step 2: 跑线上 E2E**

  运行：`python _e2e/verify_order_actions.py`
  期望两视口 `ALL_OK True`、`HAS_SHIP/HAS_REDEEM/HAS_DETAIL` 均 True、`HAS_THUMB_IMG True`（渠道单有图）、`PAGEERRORS (none)`。

- [ ] **Step 3: 归档截图**

  把生成的 `order_actions_mobile_390.png`、`order_actions_desk_1440.png` 复制到：
  - `docs/webadmin-bugfix-manual/assets/order_actions_mobile_390.png`
  - `docs/webadmin-bugfix-manual/assets/order_actions_desk_1440.png`

- [ ] **Step 4: 更新操作手册**——第 8 章「对齐设计方案」小节

  在手册 `webadmin-bugfix-manual.html` 的订单本地化章节内追加一段（含两张新截图），内容：

```html
<h3>8.4 对齐设计方案（操作区快捷 + 缩略图 + 头栏）</h3>
<p>对订单列表补齐与已批准设计方案的差距：操作区按订单状态给快捷按钮（<strong>待发货→发货</strong>、<strong>自提待核销→去核销</strong>、其余→详情）；手机卡片商品行渠道单显示缩略图（商品单无图→占位块）；收货人行显示「顾客·电话·配送」；桌面 headbar 单行内联「订单→统计→核销码」。</p>
<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;">
  <figure style="margin:0;"><img src="assets/order_actions_mobile_390.png" style="width:280px;border:1px solid var(--line);border-radius:10px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">手机 390×844·快捷按钮+缩略图</figcaption></figure>
  <figure style="margin:0;flex:1;min-width:360px;"><img src="assets/order_actions_desk_1440.png" style="width:100%;border:1px solid var(--line);border-radius:10px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">桌面 1440×900·headbar+表格操作</figcaption></figure>
</div>
<div class="callout warn">
  <h4>已知限制</h4>
  <p>「发货/详情」跳转在<strong>本店渠道单</strong>可用（订单在当前渠道）；<strong>本店商品单</strong>是跨渠道归集视图，其「发货/详情」受 Vendure 渠道隔离限制、可能无法打开目标单，运营请以渠道单操作为主。本店商品单无商品缩略图（接口不返回图），展示占位块。</p>
</div>
```

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/_e2e/verify_order_actions.py web-admin/docs/webadmin-bugfix-manual/
git commit -m "test+docs(order-list): 快捷按钮E2E+手册对齐设计方案章节"
```

---

## Self-Review

已对照 spec 逐项核对：

1. **规格覆盖**：Gap1(操作区快捷)→Task5；Gap2(催付)按一致意见**不做**（计划无催付）；Gap3(缩略图)→Task1/2/4；Gap4(收货人·配送)→Task4；Gap5(桌面 headbar)→Task3。验收(截图+手册)→Task7。✓
2. **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。✓
3. **类型一致性**：`imageFullUrl`/`isShippable`/`OrderGood.image`/`featuredAsset` 在各 Task 前后签名一致；`goShip(o: OrderView)` 与模板 `goShip(o)` 一致；`isShippable(o.state)` 与 `isShippable(state:string)` 一致。✓
4. **注意**：`git add` 路径需带 `web-admin/` 前缀（仓库根在 `d:\zhao\vshop`）；Task 7 Step 1 会触发线上部署。