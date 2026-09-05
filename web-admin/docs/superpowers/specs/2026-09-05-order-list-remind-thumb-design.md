# 订单列表·催付 + 商品单缩略图 设计方案

> 在已完成的订单列表中国本地化改造（headbar + 状态化快捷按钮 + 卡片缩略图）基础上，补齐两个未解决点：
> 1. **催付**（无后端）—— 待付款订单一键复制催付文案。
> 2. **商品单缩略图**（接口无图）—— 用前端批量查图补齐 `myShopOrders` 商品行缩略图。

**目标**：让「本店商品单」空占位缩略图显示真实商品图；让运营对待付款订单能一键生成并复制催付文案，手动通过微信/短信发给顾客。

**架构**：均为纯前端改造（只动 web-admin，沿用既有 `scripts/deploy.mjs` 构建部署）。新增两个纯工具函数 + 一个数据层批量查图接口 + 页面两处接线。
- 催付：纯函数拼接文案 + `uni.setClipboardData` 复制，零后端。
- 缩略图：复用 Vendure admin `products` 查询的 `filter:{id:{in:[...]}}` 批量取 `featuredAsset.preview`，构建 `productId → imageUrl` 映射填充商品行；查图失败/无图时优雅降级到现有占位块。

**技术栈**：Vue 3 + TypeScript + uni-app（H5/小程序），Vendure admin GraphQL 客户端（`getAdminClient`），uView 设计令牌（`$wa-*`）。

---

## 术语与上下文

- **本店渠道单**（`scope=channel`）：`fetchOrders` → `OrderRow`，`lines[].productVariant.featuredAsset.source` 已带商品缩略图，走 `imageFullUrl` 动态拼域名。已有真实缩略图。
- **本店商品单**（`scope=shop`）：`fetchShopOrders` → `ShopOrderRow`，`items[]` 只返回 `productId/productName/variantName/quantity/...`，**无图、无手机号**。当前商品行渲染灰底占位块（`.g-thumb` 空 `view`）。
- 待付款状态码：`ArrangingPayment`（实测对齐线上）；可发货集合见 `SHIPPABLE_STATES`。

## 决策记录

| 疑问 | 决策 | 理由 |
|---|---|---|
| 催付做什么 | 复制到剪贴板，不真正发短信/推送 | 无后端约束，最实用零风险 |
| 催付入口 | 操作区状态化按钮，仅 `ArrangingPayment` 显示 | 与现有 发货/去核销/详情 状态驱动体系一致 |
| 商品单缩略图方案 | 前端批量查图兜底（`filter:{id:{in}}`）| 零后端、与本次改造同管线、有占位块兜底；详见下方权衡 |
| 查图粒度 | 商品级 `featuredAsset.preview` | `productId` 只到商品级，缩略图够用 |

### 商品单缩略图方案权衡
- **前端批量查图（选用）**：用 `products(options:{filter:{id:{in:...}}})` 一次取图，去重后单次请求；失败优雅降级到占位块。复用已有 `products` 查询与 `imageFullUrl`。唯一风险：目标 Vendure 是否支持 `ProductFilterParameter.id.in`，实现计划首个 Task 做冒烟验证，不支持则退避为 `fetchProductList({take: 大})` 全量建映射。
- 后端扩展 `myShopOrders` 返回 `featuredAsset`（备选）：单查询带图最干净，但需改 zhao shop-plugin 并走后端部署，交付链更长。

---

## 设计

### 1. 催付（复制文案）

**`src/utils/orderFormat.ts` 新增：**

```ts
// 待付款（可催付）：order 状态机实测, 待付款 = ArrangingPayment
export function isUnpaid(state: string): boolean {
  return state === 'ArrangingPayment';
}

// 生成催付文案（纯函数, 便于单测）；手机号/店铺名缺省时对应行省略
export function buildReminderText(o: OrderView, opts?: { shopName?: string }): string {
  const shop = opts?.shopName ? `${opts.shopName} ` : '';
  const name = o.customerName && o.customerName !== '顾客' ? `，${o.customerName}` : '';
  const money = fmtMoney(o.total);
  return [
    `${shop}有一笔订单待支付${name}，请尽快完成付款：`,
    `订单号：${o.code}`,
    `金额：¥${money}`,
    `点击链接或登录确认支付，谢谢支持！`,
  ].join('\n');
}
```

**`src/pages/order/list/index.vue`：**
- 数据层无关，直接用 `views` 里已有的 `OrderView`（含 `code/total/customerName`）。
- 卡片 `.actions` 与桌面 `.c-ops` 各加（置于 发货/去核销 之后、详情之前）：
  ```html
  <text v-if="isUnpaid(o.state)" class="act remind" @tap="goRemind(o)">催付</text>
  ```
- 新增 handler：
  ```ts
  function goRemind(o: OrderView) {
    const text = buildReminderText(o);
    uni.setClipboardData({ data: text, success: () => {
      uni.showToast({ title: '催付文案已复制，请粘贴发给顾客', icon: 'none' });
    }});
  }
  ```
- 样式：`.remind` 新色（暖橙描边，区别于实心 `ship` 与灰 `ghost`）：
  ```scss
  .remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
  ```

### 2. 商品单缩略图（前端批量查图）

**`src/apis/order.ts` 新增（放 order.ts：商品单数据层查询，内聚于订单域）：**

> 注意：`order.ts` 只返回 `featuredAsset.preview` 的相对路径，**不调 `imageFullUrl`**，避免 `order.ts ↔ orderFormat.ts` 循环依赖；统一由 `orderFormat.shopToView` 拼完整 URL。

```ts
// 商品单缩略图：商品单 items[] 只带 productId, 无图;
// 按 productId 批量取商品级 featuredAsset.preview, 建 id→相对路径 映射（拼域名交给 orderFormat）。
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
      if (src) map[p.id] = src; // 相对路径, 由 shopToView 经 imageFullUrl 拼完整
    }
  }
  return map;
}
```

**`src/utils/orderFormat.ts`：**
- `shopToView(s, thumbMap = {})` 增补商品行 `image`；`shopToView` 已 import `imageFullUrl`，就地拼完整 URL：
  ```ts
  goods: (s.items || []).map((it) => ({
    name: it.productName || it.variantName || '',
    qty: Number(it.quantity || 0),
    price: Number(it.lineTotalWithTax || 0),
    image: thumbMap[it.productId] ? imageFullUrl(thumbMap[it.productId]) : '',
  })),
  ```

**`src/pages/order/list/index.vue` 的 `load()` 商品单分支：**
```ts
if (scope.value === 'shop') {
  const list = await fetchShopOrders();
  totalItems.value = list.length;
  const ids = list.flatMap((o) => (o.items || []).map((it) => it.productId));
  const thumbMap = await fetchProductThumbs(ids); // 失败被外层 catch 吞掉→map 空→占位块
  // ...状态/关键字过滤...
  views.value = rows.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
}
```
- 查图失败：`fetchProductThumbs` 抛错会被 `load()` 的 try/finally+调用处外层捕获，`views` 不更新或保持占位块（走现有兜底），页面不崩。

## 错误处理

- **催付**：剪贴板 API `uni.setClipboardData` 的 fail 回调给 toast，不抛出。
- **缩略图查图失败**：静默降级，商品行继续显示占位块；不阻塞列表渲染。
- **查图超量**：按 80 一批分片；仍失败则放弃该批，已有 map 生效。

## 测试

- **单测（纯函数）**：`buildReminderText`（含/不含 shopName、顾客名为"顾客"时省略）、`isUnpaid`、`shopToView + thumbMap` 填充。
- **E2E（Playwright，沿用 `_e2e/verify_order_actions.py` 模式）**：
  - 切「本店商品单」scope：断言 `.act.remind` 在待付款单出现、`.g-thumb image` 数量 > 0（商品单真实图），无图行仍为占位 `view.g-thumb`。
  - 催付复制：点击后读剪贴板（Playwright 需 `--permissions` 或 `page.evaluate` 降级断言 toast 文案）。
  - 手机上手机视口 390×844、桌面 1440×900 截图补充到手册。

## 部署

- 纯前端：本地 `npm run build`，走 `scripts/deploy.mjs`（scp 产物 → 服务器解压/拷入），**绝不在服务器构建**。
- 不涉及后端 vendure 变更。

## 影响面与回滚

- 只改 `orderFormat.ts`、`order.ts`（或 `product.ts`）、`index.vue`、E2E、操作手册。变更小、隔离清晰。
- 回滚：前端产物回退上一版即可，无数据迁移。

## 验收标准

1. 待付款订单在操作区显示「催付」按钮，点击复制含 订单号+金额+顾客名 的文案，toast 提示。
2. 本店商品单商品行显示真实商品缩略图（`fetchProductThumbs` 命中时）；查图失败/无图时仍显示占位块，页面无报错。
3. E2E 通过、手机+桌面截图记入操作手册 8.4 补充章节。