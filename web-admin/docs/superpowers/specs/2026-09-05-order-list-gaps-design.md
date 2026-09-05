# 订单列表·补齐缺失 设计方案

> 在已完成并上线的订单列表本地化改造（headbar 统计+核销码入口、状态化快捷按钮 发货/去核销/详情/催付、商品缩略图、手机卡片/桌面表格响应式）基础上，补齐本轮盘点出的 4 个缺失点：
> 1. **桌面商品列补缩略图**（与手机卡片一致）；
> 2. **修复统计口径 + 补「待付款」项**；
> 3. **商品单受限操作加提示**（避免白屏跳转）；
> 4. **交互补强：发货二次确认 / 复制订单号**。

**目标**：让桌面表格与手机卡片信息一致（缩略图），让顶栏统计成为「店铺订单概览」且可点击直达状态筛选，并在商品单跨渠道视图下对受限操作给引导、对误触给确认，提升运营效率与可用性。

**架构**：全部为纯前端改造，只动 `web-admin` 的订单列表页 `index.vue` 与视图工具 `orderFormat.ts`，沿用 `scripts/deploy.mjs` 本地构建部署。无后端改动、无数据迁移。

**边界（确权）**：顶栏统计采用「商品单跨渠道全量」作单一权威的**店铺订单概览**口径（渠道单接口分页、无法廉价求准枚举），并做成可点击入口跳转对应状态 tab，故不再追求"统计逐单匹配 channel 当下列表"。

**Tech Stack**：Vue3 + TypeScript + uni-app（H5），Vendure admin GraphQL，uView 设计令牌 `$wa-*`，Playwright E2E（`_e2e/`）。

---

## 当前基线（已上线）

- `index.vue`：`.headbar`（3 统计卡 + 核销码按钮）、`.scope`（本店渠道单/本店商品单）、`.tabs`（全部/待付款/待发货/已发货/已完成/已取消）、`.search`、手机 `.card-list`、桌面 `.dt`。
- 操作区按状态显示：`isShippable→发货`、`isRedeemable→去核销`、`isUnpaid→催付`、保底 `详情`。
- `orderFormat.ts`：`isUnpaid`(ArrangingPayment)、`isToBeShipped`(PaymentAuthorized/PaymentSettled)、`isRefundApprox`(Cancelled→待退款近似)、`isToday`(按下单时间)、`computeStats` 返回 `{today,toShip,refund}`。
- 桌面 `.c-goods` 商品列仅文字 `名×qty`，**无缩略图**（与手机不一致）。

## 决策记录

| 问题 | 决策 | 理由 |
|---|---|---|
| 统计口径 | 采用商品单跨渠道全量作店铺概览；卡片可点击跳 tab | 唯一可枚齐全单的权威源、免新增计数查询、口径单一 |
| 今日订单困惑 | 保留「今日订单」卡（口径为按下单时间）；统计数字与私人商品单跨渠道同源 | 截图里"今日=0"实为昨日订单，口径正确 |
| 桌面缩略图 | 复用已有 `goods[].image`，仅改模板/样式 | 零数据改动、与手机一致 |
| 商品单受限 | shop 场景下 `goShip`/`goDetail` 弹 toast 拦截；`催付`(复制)不受限 | 避免白屏跳转、不误伤可用功能 |
| 发货确认 | `goShip` 先 `showModal` 确认再跳转 | 降低误触 |
| 复制单号 | 点击订单号（卡片头/桌面 code）即复制 | 不占操作按钮空间 |

---

## 设计

### 1. 桌面商品列补缩略图

**`index.vue` 桌面 `.c-goods` 模板**（替换现有内层 `view`）：
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
**新增样式**（放在桌面样式段）：
```scss
.c-goods .dg { display: flex; align-items: center; gap: 8rpx; padding: 2rpx 0; }
.c-goods .dg-thumb { width: 36rpx; height: 36rpx; border-radius: 6rpx; background: #f0f2f7; flex-shrink: 0; }
.c-goods .dg-name { flex: 1; font-size: 13px; color: $wa-ink; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-goods .dg-qty { font-size: 12px; color: $wa-muted; }
```
> `g.image` 已由 `channelToView`/`shopToView` 填充（含 `imageFullUrl`），channel 与 shop 均天然生效；有图显示、无图占位块。

### 2. 修复统计口径 + 补「待付款」项

**`orderFormat.ts`**：
- `StatsValue` 扩展为 `{{ today: string; unpaid: string; toShip: string; refund: string }}`。
- `computeStats(rows, now)` 增加 `unpaid` 统计：
```ts
export interface StatsValue { today: string; unpaid: string; toShip: string; refund: string }
export function computeStats(rows: { state: string; placedAt?: string | null }[], now = new Date()): StatsValue {
  let today = 0, unpaid = 0, toShip = 0, refund = 0;
  for (const o of rows) {
    if (isToday(o.placedAt, now)) today += 1;
    if (isUnpaid(o.state)) unpaid += 1;
    if (isToBeShipped(o.state)) toShip += 1;
    if (isRefundApprox(o.state)) refund += 1;
  }
  return { today: String(today), unpaid: String(unpaid), toShip: String(toShip), refund: String(refund) };
}
```
（`isUnpaid/isToBeShipped/isRefundApprox/isToday` 均已在文件中定义。）

**`index.vue`**：
- `stats` ref 类型改为四字段、初始化 `{ today:'—', unpaid:'—', toShip:'—', refund:'—' }`。
- `loadStats()` 维持真西取 `fetchShopOrders()`（商品单全量）`computeStats(list)`（口径：店铺概览，跨渠道）。
- headbar 模板改为 4 张卡（新增「待付款」，放在「今日订单」后）：
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
- 新增 handler（点击统计卡→切状态 tab 并重新加载当前 scope 列表；tab 已在此态则空操作）：
```ts
function onStatTap(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  load();
}
```
- 4 卡下 `.stat` 保持 `flex:1`，手机/桌面均适配。

> 备注：统计为跨渠道**店铺概览**；点击跳转切到当下列表对应状态筛选（channel 与 shop 均有效）。属有意取舍，非逐单匹配。

### 3. 商品单受限操作加提示

**`index.vue` 的 `goShip` / `goDetail`**，在跳转前对 `scope==='shop'` 拦截提示：
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
> `goRemind`（复制文案）不依赖跳转，商品单下仍可用，不改。

### 4. 交互补强

- **发货二次确认**：已并入上述 `goShip`（`showModal` 确认后才跳发货页）。
- **复制订单号**：订单号可点击复制。卡片头 `.code` 与桌面 `.c-code` 加 `@tap`：
```html
<!-- 卡片头 -->
<text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
<!-- 桌面 -->
<text class="c-code" @tap="copyCode(o.code)">{{ o.code }}</text>
```
新增 handler：
```ts
function copyCode(code: string) {
  if (!code) return;
  uni.setClipboardData({ data: code, success: () => uni.showToast({ title: '订单号已复制', icon: 'none' }) });
}
```
给 `.code` 与 `.c-code` 加 `cursor: pointer`（桌面）/可点样式，保持视觉提示（可加 `text-decoration` 或仅 hover，桌面加 cursor 即可）。

## 错误处理

- 统计：`loadStats()` 失败保留 `'—'`，不阻塞列表（沿用现有）。
- shop 受限提示：toast 即时反馈，不改跳转目标。
- 复制：`setClipboardData` fail 由 toast 兜底（沿用催付同款）。

## 测试

- **类型检查**：每 Task 后 `npx tsc --noEmit`，以「改动文件无新增错误」为准（仓库存量 tsc 错误与本变更无关）。
- **构建**：`npm run build:h5` 验证 `.vue` 可编译。
- **E2E（`_e2e/verify_order_actions.py` 追加）**：
  - `.stat` 数 = 4（待付款卡存在）；
  - 桌面商品列 `.dg` 缩略图存在（`o.goods` 有图时）；
  - 点订单号后复制（Playwright 读剪贴板，或断言 toast 文案 `订单号已复制`）；
  - 商品单 scope 点发货 → 不跳转、出现受限 toast（断言未离开、出现 `商品单为跨渠道` 文案）。
- **手机 390×844 + 桌面 1440×900 验收截图**补入操作手册 8.4.x。

## 部署

- 纯前端：本地构建走 `scripts/deploy.mjs`（scp 产物→服务器解压），服务器不构建。

## 影响面与回滚

- 只改 `orderFormat.ts`、`index.vue`、E2E、手册。变更小、隔离清晰，前端产物回退即可回滚，无数据迁移。

## 验收标准

1. 桌面表格商品列出现缩略图（有图显示、无图占位），与手机卡片一致。
2. 顶栏 4 张统计卡（今日/待付款/待发货/待退款），数值来自商品单全量概览，点击切到对应状态 tab。
3. 商品单跨渠道视图下点「发货/详情」弹受限 toast 不白屏；「催付」仍可用；发货前有确认弹窗；点订单号复制成功。
4. E2E 通过，手机+桌面截图记入操作手册。