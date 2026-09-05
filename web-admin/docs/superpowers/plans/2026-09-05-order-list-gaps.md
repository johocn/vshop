# 订单列表·补齐缺失 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已上线订单列表基础上补齐 4 个缺失点：桌面商品列补缩略图、统计 4 卡（待付款+跨渠道概览口径+点击切 tab）、商品单受限操作提示、发货确认+复制订单号。

**Architecture:** 纯前端，只改 `web-admin/src/utils/orderFormat.ts`（统计视图）与 `web-admin/src/pages/order/list/index.vue`（页面）。数据源不变，`goods[].image` 已就绪，直接复用。构建部署沿用 `scripts/deploy.mjs`（本地构建→scp→服务器解压），服务器不构建。

**Tech Stack:** Vue3 + TypeScript + uni-app（H5）、Vendure admin GraphQL、uView 设计令牌 `$wa-*`、Playwright E2E（`_e2e/`）。

---

## 环境与门禁（必须先读）

- 仓库根：`d:\zhao\vshop`。前端：`d:\zhao\vshop\web-admin`。
- **存量 tsc 错误**：`coupon.ts`、`product.ts`、`scanner.ts` 存在与本变更无关的类型错误。**类型门禁 = 改动文件自身无新增错误**（`npx tsc --noEmit` 只看 `orderFormat.ts` / `index.vue` 是否新增报错，其它文件存量错误一律不修不删）。
- 每步 git 提交在仓库根执行，**只 `git add` 指定文件，绝不 `git add -A`**（仓库有大量无关未跟踪/未提交文件）。勿触碰 dist 构建产物。
- `.vue` 文件不受 `tsc` 校验（未装 vue-tsc），用 `npm run build:h5`（Task 6）验证真正编译。
- 参考素材：已批准 spec `web-admin/docs/superpowers/specs/2026-09-05-order-list-gaps-design.md`。

---

### Task 1: 视图工具 `orderFormat.ts` —— 统计补「待付款」字段

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\utils\orderFormat.ts:80,82-92`

- [ ] **Step 1: 替换 `StatsValue` 接口**

把（当前第 80 行）：
```ts
export interface StatsValue { today: string; toShip: string; refund: string }
```
替换为：
```ts
export interface StatsValue { today: string; unpaid: string; toShip: string; refund: string }
```

- [ ] **Step 2: 替换 `computeStats`**

把（当前第 82-92 行）：
```ts
export function computeStats(rows: { state: string; placedAt?: string | null }[], now = new Date()): StatsValue {
  let today = 0;
  let toShip = 0;
  let refund = 0;
  for (const o of rows) {
    if (isToday(o.placedAt, now)) today += 1;
    if (isToBeShipped(o.state)) toShip += 1;
    if (isRefundApprox(o.state)) refund += 1;
  }
  return { today: String(today), toShip: String(toShip), refund: String(refund) };
}
```
替换为：
```ts
export function computeStats(rows: { state: string; placedAt?: string | null }[], now = new Date()): StatsValue {
  let today = 0;
  let unpaid = 0;
  let toShip = 0;
  let refund = 0;
  for (const o of rows) {
    if (isToday(o.placedAt, now)) today += 1;
    if (isUnpaid(o.state)) unpaid += 1;
    if (isToBeShipped(o.state)) toShip += 1;
    if (isRefundApprox(o.state)) refund += 1;
  }
  return { today: String(today), unpaid: String(unpaid), toShip: String(toShip), refund: String(refund) };
}
```
> `isUnpaid/isToBeShipped/isRefundApprox/isToday` 均已在同文件定义，无需新增 import。除这两处外（接口+函数体）不改其它任何内容。

- [ ] **Step 3: 类型检查**

在 `d:\zhao\vshop\web-admin` 运行 `npx tsc --noEmit`。
预期：`orderFormat.ts` **不新增任何报错**（其它文件存量错误在预期内，忽略）。

- [ ] **Step 4: 提交**

在 `d:\zhao\vshop`：
```bash
git add web-admin/src/utils/orderFormat.ts
git commit -m "feat(orderFormat): 统计补 unpaid 待付款字段"
```

---

### Task 2: 页面头顶统计 4 卡 + 点击切 tab

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue:5-18,140,236-240`

- [ ] **Step 1: 改 `stats` ref 初始化为 4 字段**

把（第 140 行）：
```ts
  const stats = ref<{ today: string; toShip: string; refund: string }>({ today: '—', toShip: '—', refund: '—' });
```
替换为：
```ts
  const stats = ref<{ today: string; unpaid: string; toShip: string; refund: string }>({ today: '—', unpaid: '—', toShip: '—', refund: '—' });
```

- [ ] **Step 2: 头顶统计模板改为 4 卡（今日/待付款/待发货/待退款）并加 `@tap`**

把（第 5-18 行）：
```html
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
```
替换为：
```html
      <view class="stats">
        <view class="stat" @tap="onStatTap('')">
          <text class="num">{{ stats.today }}</text>
          <text class="lbl">今日订单</text>
        </view>
        <view class="stat" @tap="onStatTap('ArrangingPayment')">
          <text class="num">{{ stats.unpaid }}</text>
          <text class="lbl">待付款</text>
        </view>
        <view class="stat" @tap="onStatTap('PaymentAuthorized')">
          <text class="num">{{ stats.toShip }}</text>
          <text class="lbl">待发货</text>
        </view>
        <view class="stat" @tap="onStatTap('Cancelled')">
          <text class="num">{{ stats.refund }}</text>
          <text class="lbl">待退款</text>
        </view>
      </view>
```

- [ ] **Step 3: 新增 `onStatTap` handler**

在 `onTab` 函数（第 236-240 行）之后插入：
```ts
function onStatTap(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  load();
}
```

- [ ] **Step 4: `.stat` 加可点光标**

在 `.stats .stat` 规则（第 305 行，`flex: 1; ... flex-direction: column;` 内）末尾追加 `cursor: pointer;`，改为：
```scss
    .stat { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 0; text-align: center; display: flex; flex-direction: column; cursor: pointer;
```

- [ ] **Step 5: 类型检查**

在 `d:\zhao\vshop\web-admin` 运行 `npx tsc --noEmit`。`index.vue` 不在 tsc 校验范围，确认无因本改动破坏的报错；若其它文件存量错误不变即可。

- [ ] **Step 6: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 头顶统计改 4 卡(今日/待付款/待发货/待退款) 并点击切 tab"
```

---

### Task 3: 桌面商品列补缩略图

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue:74-76,423-425`

- [ ] **Step 1: 桌面 `.c-goods` 模板加缩略图**

把（第 74-76 行）：
```html
        <view class="c-goods">
          <view v-for="(g, gi) in o.goods" :key="gi">{{ g.name }}×{{ g.qty }}</view>
        </view>
```
替换为：
```html
        <view class="c-goods">
          <view class="dg" v-for="(g, gi) in o.goods" :key="gi">
            <image v-if="g.image" class="dg-thumb" :src="g.image" mode="aspectFill" />
            <view v-else class="dg-thumb"></view>
            <text class="dg-name">{{ g.name }}</text>
            <text class="dg-qty">×{{ g.qty }}</text>
          </view>
        </view>
```

- [ ] **Step 2: 桌面 `.c-goods` 样式加缩略图行**

把（第 423-425 行）：
```scss
      .c-goods { font-size: 13px; color: $wa-ink;
        view { line-height: 1.5; }
      }
```
替换为：
```scss
      .c-goods { font-size: 13px; color: $wa-ink;
        .dg { display: flex; align-items: center; gap: 8px; padding: 2px 0; line-height: 1.5;
          .dg-thumb { width: 20px; height: 20px; border-radius: 4px; background: #f0f2f7; flex-shrink: 0; }
          .dg-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .dg-qty { color: $wa-muted; }
        }
      }
```
> 桌面表格用 px（`font-size:14px` 等），故这里用 px；`g.image` 已由 `channelToView`/`shopToView` 填充，channel 与 shop 均生效，有图显示、无图占位。

- [ ] **Step 3: 类型检查**

在 `d:\zhao\vshop\web-admin` 运行 `npx tsc --noEmit`，确认无新增破坏。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 桌面商品列补商品缩略图(与手机一致)"
```

---

### Task 4: 商品单受限提示 + 发货二次确认

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue:244-249`

- [ ] **Step 1: 改 `goShip` / `goDetail`**

把（第 244-249 行）：
```ts
function goShip(o: OrderView) {
  uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` });
}
function goDetail(o: OrderView) {
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}
```
替换为：
```ts
function goShip(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: '商品单为跨渠道归集视图，请到「本店渠道单」发货', icon: 'none' });
    return;
  }
  uni.showModal({
    title: '确认发货',
    content: `订单 ${o.code} 将进入发货流程`,
    confirmText: '进入发货',
    success: (r) => { if (r.confirm) uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` }); },
  });
}
function goDetail(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: '商品单为跨渠道归集视图，详情请到「本店渠道单」查看', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}
```
> `goRemind`（催付）是复制文案、不依赖跳转，商品单下仍可用，不改。`goRedeem` 沿用现状不改。

- [ ] **Step 2: 类型检查**

在 `d:\zhao\vshop\web-admin` 运行 `npx tsc --noEmit`，确认无新增破坏。

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 商品单受限操作提示 + 发货二次确认"
```

---

### Task 5: 复制订单号

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\list\index.vue:37,73,263,373,422`

- [ ] **Step 1: 卡片头与桌面订单号加 `@tap`**

卡片头（第 37 行）：
```html
          <text class="code">{{ o.code }}</text>
```
改为：
```html
          <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
```
桌面（第 73 行）：
```html
        <text class="c-code">{{ o.code }}</text>
```
改为：
```html
        <text class="c-code" @tap="copyCode(o.code)">{{ o.code }}</text>
```

- [ ] **Step 2: 新增 `copyCode` handler**

在 `goRemind` 函数（第 256-263 行）之后插入：
```ts
function copyCode(code: string) {
  if (!code) return;
  uni.setClipboardData({ data: code, success: () => uni.showToast({ title: '订单号已复制', icon: 'none' }) });
}
```

- [ ] **Step 3: 加可点光标**

卡片 `.head .code`（第 373 行）末尾加 `cursor: pointer;`：
```scss
        .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; cursor: pointer; }
```
桌面 `.c-code`（第 422 行）末尾加 `cursor: pointer;`：
```scss
      .c-code { font-size: 14px; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
```

- [ ] **Step 4: 类型检查**

在 `d:\zhao\vshop\web-admin` 运行 `npx tsc --noEmit`，确认无新增破坏。

- [ ] **Step 5: 提交**

```bash
git add web-admin/src/pages/order/list/index.vue
git commit -m "feat(order-list): 点击订单号复制到剪贴板"
```

---

### Task 6: 本地构建 + 扩展 E2E 断言

**Files:**
- Modify: `d:\zhao\vshop\web-admin\_e2e\verify_order_actions.py`

- [ ] **Step 1: 本地构建验证**

在 `d:\zhao\vshop\web-admin` 运行 `npm run build:h5`。
预期：末尾 `DONE  Build complete.`，无编译错误（Dart Sass `legacy-js-api` DEPRECATION 警告无害，忽略）。若本次改造引入编译错误则修复后重跑；若是既有/环境问题则停止并如实报告。

- [ ] **Step 2: 扩展 E2E 断言**

编辑 `_e2e/verify_order_actions.py`。「本店商品单」scope 断言区，在 `ok_thumb_img = thumb_img>0` 后新增：

```python
        stat_cards   = pg.locator('.stat').count()          # 统计卡 = 4(今日/待付款/待发货/待退款)
        dg_rows      = pg.locator('.dt .c-goods .dg').count() if tag=='desk' else 0  # 桌面商品缩略图行
        ok_stat4     = stat_cards==4
        ok_dg        = (not (tag=='desk')) or dg_rows>0
```

在打印行追加 `STAT_4=`, `DG_ROWS=`，并把 `ALL_OK` 从 `ok_ship and ok_detail and ok_thumb and ok_thumb_img` 改为 `ok_ship and ok_detail and ok_thumb and ok_thumb_img and ok_stat4 and ok_dg`：

```python
        print('THUMB_TOTAL=',thumb_total,'THUMB_IMG=',thumb_img,'REMIND_BTNS=',remind_btns,'REMIND_ON_UNPAID=',remind_on_unpaid,'STAT_4=',stat_cards,'DG_ROWS=',dg_rows,'| PAGEERRORS=',errs if errs else '(none)')
```

补一个「复制订单号」断言（对当前列表第一张卡/第一行点订单号并读剪贴板不可靠，改用 toast 文案断言）：在 `ok_dg = ...` 之后加：

```python
        copied = False
        # 桌面用「非表头行的 c-code」（表头也有 .c-code 但无 @tap）；手机卡片 .code 无表头
        sel = '.dt .dt-row:not(.head) .c-code' if tag=='desk' else '.card .code'
        code_el = pg.locator(sel).first
        if code_el.count()>0:
            code_el.click(); time.sleep(1)
            copied = '订单号已复制' in pg.inner_text('body')
```

并把 `copied` 纳入 `ALL_OK`（追加 `and copied`）。打印行再加 `'COPY_OK=',copied`。

> 注意：`code_el.first` 在 Playwright 对已存在元素返回带状态动作的 locator，需确认 `count()>0` 后再 click，避免空 locator 报错。

- [ ] **Step 3: 语法检查**

在 `d:\zhao\vshop\web-admin` 运行 `python -m py_compile _e2e/verify_order_actions.py`，期望 exit 0。

- [ ] **Step 4: 提交**

```bash
git add web-admin/_e2e/verify_order_actions.py
git commit -m "test(order-list): E2E 补统计4卡/桌面缩略图/复制单号断言"
```

---

### Task 7: 部署 + 线上 E2E + 手册

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`
- Run: `scripts/deploy.mjs`、`python _e2e/verify_order_actions.py`

- [ ] **Step 1: 部署**

在 `d:\zhao\vshop\web-admin` 运行 `node scripts/deploy.mjs`。期望末尾 `[deploy] 产物校验通过: ...` 与 `deploy done`。若失败如实报告，属服务器权限/凭据则停止。

- [ ] **Step 2: 线上 E2E**

运行 `python _e2e/verify_order_actions.py`。记录 mobile/desk 的 `ALL_OK` 与全部计数（SHIP/DETAIL/REDEEM/THUMB_TOTAL/THUMB_IMG/REMIND/STAT_4/DG_ROWS/COPY_OK/PAGEERRORS）。
- `STAT_4` 应为 4；`DG_ROWS` 桌面 >0；`COPY_OK` 桌面 True。
- `THUMB_IMG`：商品单有封面图商品应 >0（无图回退占位正常）。
- `REMIND` 数据依赖：t1 若无待付款单可为 0，非失败，如实说明。

- [ ] **Step 3: 手册补充**

打开 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 的「8.4.1 催付 + 商品单缩略图」节之后追加「8.4.2 补齐缺失：桌面缩略图/统计4卡/受限提示/交互补强」，说明：桌面商品列缩略图、顶栏统计 4 卡（今日/待付款/待发货/待退款，跨渠道概览口径+点击切 tab）、商品单受限操作 toast、发货二次确认、点订单号复制。把本部署后新生成的 `_e2e/order_actions_mobile_390.png`、`_e2e/order_actions_desk_1440.png` 复制到 `docs/webadmin-bugfix-manual/assets/` 并引用为验收图（沿用既有 figure 结构）。保持手册既有风格不变。

- [ ] **Step 4: 提交**

```bash
git add web-admin/docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git add web-admin/docs/webadmin-bugfix-manual/assets/order_actions_mobile_390.png web-admin/docs/webadmin-bugfix-manual/assets/order_actions_desk_1440.png
git commit -m "docs(webadmin): 手册补 8.4.2 缺失补齐章节及验收截图"
```
（不 add dist、不 add -A。）

---

## 自检清单

- **Task 1→2 类型一致**：`StatsValue` 增 `unpaid` 字段；Task 2 的 `stats` ref 字面量类型与初始化含全部 4 字段，headbar 用 `stats.unpaid` 与模板 `@tap` 一一对应，无错位。
- **复用的判断/money 函数**：`isUnpaid/isToBeShipped/isRefundApprox/isToday/fmtMoney/imageFullUrl` 均在 `orderFormat.ts` 已定义，未新增依赖。
- **onStatTap 映射**：待付款→`ArrangingPayment`、待发货→`PaymentAuthorized`、待退款→`Cancelled`、今日→`''`(全部)，与 `tabs[]` 的 key 一致；`load()` 按 `cur` 过滤。
- **桌面缩略图**：复用 `g.image`（channel 与 shop 均已填充），仅模板+样式，零数据改动。
- **goShip 逻辑顺序**：先 shop 拦截 toast，再 showModal 确认，确认后 navigate；取消不发跳。