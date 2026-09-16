# 核销页「交付清单卡」UI 优化 + 商品信息增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `vshop/web-admin/src/pages/pickup/redeem/index.vue` 核销页改成方案 A「交付清单卡」清爽浅色版式，并在后端 `PendingRedemption` 增加订单商品行供列表展示交付清单。

**Architecture:** 后端 `cjk-plugin` 的 `RedemptionCodeService.listPending` 用 `EntityHydrator` 批量灌注待核销单的商品行并映射为 `{name,quantity,lineTotalWithTax}`，`redemption.schema.ts` 扩展 `redemption.schema.ts` 的 `PendingRedemption`；前端 `apis/redemption.ts` 扩展类型与字段并返回 `totalItems`，`index.vue` 重构模板/脚本/样式（计数徽标、有效期人性化、核销码高亮动效、商品清单卡）。

**Tech Stack:** Vendure (NestJS/GraphQL/cjk-plugin)、uniapp H5 (Vue3/Pinia/sass)、graphql-request。

**前置注意：** 本页为固定中文后台文案，无 i18n；改交互语义只换视觉与数据字段，COD 待收款确认弹窗/扫码分支/重发逻辑不改。

---

## File Structure

- Modify: `vendure/packages/cjk-plugin/src/redemption/redemption.schema.ts` — `PendingRedemption` 增 `lines`，新增 `RedemptionLine` 类型。
- Modify: `vendure/packages/cjk-plugin/src/redemption/redemption-code.service.ts:376-419` — `listPending` 注入 `EntityHydrator`、扩展 `PendingRedemptionItem`、返回商品行。
- Modify: `vshop/web-admin/src/apis/redemption.ts` — 扩展类型、`PENDING_FIELDS`、`fetchPendingRedemptions` 返回 `{items,totalItems}`。
- Modify: `vshop/web-admin/src/pages/pickup/redeem/index.vue` — 模板/脚本/样式重构。

---

### Task 1: 后端 Schema 扩展商品行

**Files:**
- Modify: `vendure/packages/cjk-plugin/src/redemption/redemption.schema.ts`

- [ ] **Step 1: 在 admin schema 增加 `RedemptionLine` 与 `lines` 字段**

在 `type PendingRedemption { ... }` 内 `collected: Boolean!` 之后新增一行，并在文件末尾 `PendingRedemptionList` 定义前新增类型：

```graphql
    type RedemptionLine {
        name: String!
        quantity: Int!
        lineTotalWithTax: Int!
    }
```

把 `type PendingRedemption` 末尾改为：

```graphql
    type PendingRedemption {
        orderId: ID!
        orderCode: String!
        code: String!
        status: String!        # active | expiring_soon | expired
        expiresAt: DateTime
        version: Int
        claimed: Boolean!
        "支付方式 code；命中到店/货到付款集合时为 COD"
        paymentType: String
        "是否已确认收款（到店付款单据此高亮待收款）"
        collected: Boolean!
        "本单交付商品清单（名称 ×数量 + 行金额）"
        lines: [RedemptionLine!]!
    }
```

- [ ] **Step 2: 检查 schema 语法**

校验 `redemption.schema.ts` 无重复类型、括号闭合（`RedemptionLine` 定义放在 `redemptionAdminSchema` 的 gql 字符串内任意顶层即可）。无需单独运行命令，语法问题由后续 Task 6 后端编译统一暴露。

- [ ] **Step 3: Commit**

```bash
cd D:/zhao/vendure
git add packages/cjk-plugin/src/redemption/redemption.schema.ts
git commit -m "feat(redemption): PendingRedemption 增加商品行 lines"
```

---

### Task 2: 后端 listPending 返回商品行

**Files:**
- Modify: `vendure/packages/cjk-plugin/src/redemption/redemption-code.service.ts`（constructor 注入 + `PendingRedemptionItem`）

- [ ] **Step 1: 引入 EntityHydrator 并扩展接口**

顶部 import 增加 `EntityHydrator`：

```ts
import { Administrator, EntityHydrator } from '@vendure/core';
```

`PendingRedemptionItem` 接口末尾增加：

```ts
export interface PendingRedemptionLine {
    name: string;
    quantity: number;
    lineTotalWithTax: number;
}
```

在 `PendingRedemptionItem` 接口内 `collected` 之后增加 `lines: PendingRedemptionLine[];`。

constructor 增加 `entityHydrator` 形参：

```ts
    constructor(
        private orderService: OrderService,
        private connection: TransactionalConnection,
        private fulfillmentService: FulfillmentService,
        private entityHydrator: EntityHydrator,
    ) {
```

- [ ] **Step 2: 重写 `listPending` 方法（整体替换 376-419 行）**

```ts
    async listPending(
        ctx: RequestContext,
        options: { skip?: number; take?: number } = {},
    ): Promise<{ items: PendingRedemptionItem[]; totalItems: number }> {
        const qb = this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.payments', 'payment')
            .innerJoin('order.channels', 'ch', 'ch.id = :cid', { cid: ctx.channelId })
            .where('order.customFields.deliveryType = :deliveryType', { deliveryType: 'pickup' })
            .orderBy('order.orderPlacedAt', 'DESC')
            .addOrderBy('order.id', 'DESC');
        const all = await qb.getMany();
        const now = new Date();
        const pending: { item: PendingRedemptionItem; orderId: string }[] = [];
        for (const o of all) {
            const cf = (o.customFields ?? {}) as Record<string, any>;
            let code = '';
            if (cf.redeemCodeCipher && cf.redeemCodeIv) {
                try {
                    code = decryptRedemptionCode(cf.redeemCodeCipher, cf.redeemCodeIv, this.keyHex);
                } catch {
                    /* 坏密文 → 无有效码，跳过 */
                }
            }
            const claimed = !!cf.redeemClaimed;
            if (!code || claimed) continue;
            const expiresAt: string | null = cf.redeemExpiresAt ?? null;
            pending.push({
                item: {
                    orderId: String(o.id),
                    orderCode: o.code,
                    code,
                    status: computeRedemptionStatus(claimed, expiresAt, now, this.expireRemindHours),
                    expiresAt,
                    version: Number(cf.redeemVersion) || 1,
                    claimed,
                    paymentType: (o.payments ?? [])[0]?.method ?? null,
                    collected: !!cf.collected || !!cf.redeemCollected,
                    lines: [],
                },
                orderId: String(o.id),
            });
        }
        const skip = options.skip ?? 0;
        const take = options.take ?? 20;
        const page = pending.slice(skip, skip + take);
        // 批量灌注本页订单的商品行（批量 hydrate，一次请求）
        const pageOrders = all.filter((o) => page.some((p) => String(o.id) === p.orderId));
        if (pageOrders.length) {
            await this.entityHydrator.hydrate(ctx, pageOrders, {
                relations: [
                    'lines',
                    'lines.productVariant',
                    'lines.productVariant.product',
                    'lines.productVariant.options',
                ],
            } as any);
            const lineMap = new Map<string, PendingRedemptionLine[]>();
            for (const o of pageOrders) {
                const rows = (o.lines ?? []).map((l: any): PendingRedemptionLine => {
                    const base = l.productVariant?.product?.name ?? l.productVariant?.name ?? `Item ${l.id}`;
                    const options = Array.isArray(l.productVariant?.options) ? l.productVariant.options : [];
                    const spec = options.length
                        ? options.map((op: any) => op.name).join(' · ')
                        : l.productVariant?.name && l.productVariant.name !== base
                            ? l.productVariant.name
                            : null;
                    return {
                        name: spec ? `${base} ${spec}` : base,
                        quantity: Number(l.quantity ?? 0),
                        lineTotalWithTax: Math.round(Number(l.lineTotalWithTax ?? 0)),
                    };
                });
                lineMap.set(String(o.id), rows);
            }
            for (const p of page) {
                p.item.lines = lineMap.get(p.orderId) ?? [];
            }
        }
        return { items: page.map((p) => p.item), totalItems: pending.length };
    }
```

- [ ] **Step 3: 说明**（无独立测试用例，由 Task 6 后端编译 + GraphQL 冒烟验证）。

- [ ] **Step 4: Commit**

```bash
cd D:/zhao/vendure
git add packages/cjk-plugin/src/redemption/redemption-code.service.ts
git commit -m "feat(redemption): listPending 返回订单商品行"
```

---

### Task 3: 前端 API 类型与字段

**Files:**
- Modify: `vshop/web-admin/src/apis/redemption.ts`

- [ ] **Step 1: 扩展接口与查询字段**

在 `PendingRedemption` 后新增：

```ts
export interface PendingRedemptionLine {
  name: string;
  quantity: number;
  lineTotalWithTax: number;
}
```

`PendingRedemption` 接口内 `collected` 之后新增 `lines: PendingRedemptionLine[];`。

`PENDING_FIELDS` 改为：

```ts
const PENDING_FIELDS = 'orderId orderCode code status expiresAt version claimed paymentType collected lines { name quantity lineTotalWithTax }';
```

- [ ] **Step 2: `fetchPendingRedemptions` 返回 totalItems**

整体替换该函数体（返回结构改为对象）：

```ts
export async function fetchPendingRedemptions(
  take = 100,
): Promise<{ items: PendingRedemption[]; totalItems: number }> {
  const res = await getAdminClient().request<{
    myPendingRedemptions: { items: PendingRedemption[]; totalItems: number };
  }>(
    `query MyPendingRedemptions($options: RedemptionListOptions) {
      myPendingRedemptions(options: $options) {
        items { ${PENDING_FIELDS} }
        totalItems
      }
    }`,
    { options: { take, skip: 0 } },
  );
  return {
    items: res.myPendingRedemptions?.items ?? [],
    totalItems: res.myPendingRedemptions?.totalItems ?? 0,
  };
}
```

- [ ] **Step 3: 更新全部调用点**

`pages/pickup/redeem/index.vue` 中 `fetchPendingRedemptions` 现被调 2 次：
- `orders.value = await fetchPendingRedemptions(100);` → 改为 `const r = await fetchPendingRedemptions(100); orders.value = r.items; total.value = r.totalItems;`
- `const list = await fetchPendingRedemptions(200); const hit = list.find(...)` → 改为 `const { items } = await fetchPendingRedemptions(200); const hit = items.find(...)`
（上述形如 Task 4 / 正文，详略以第 4 步核对为准。）

- [ ] **Step 4: Commit**

```bash
cd D:/zhao/vshop
git add web-admin/src/apis/redemption.ts
git commit -m "feat(admin): redemption API 返回商品行与 totalItems"
```

---

### Task 4: 核销页模板 + 脚本重构

**Files:**
- Modify: `vshop/web-admin/src/pages/pickup/redeem/index.vue`

- [ ] **Step 1: 替换 `<script lang="ts" setup>` 中相关逻辑**

把 `const orders = ref<PendingRedemption[]>([]);` 下面新增：

```ts
const total = ref(0);
const pulsing = ref(false);
let pulseTimer: number | undefined;
```

在 `formatTime` 之后新增有效期人性化函数（状态判断优先）：

```ts
function formatExpiry(t?: string | null, status?: string): string {
  if (!t) return '—';
  if (status === 'expired') return '已过期';
  const d = new Date(t);
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return '已到期';
  if (sameDay) return `今天 ${hm} 到期`;
  if (ms < 24 * 3600_000) return `剩 ${Math.max(1, Math.ceil(ms / 3600_000))} 小时 ${hm} 到期`;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm} 到期`;
}
```

`loadList` 改为：

```ts
async function loadList(): Promise<void> {
  try {
    const r = await fetchPendingRedemptions(100);
    orders.value = r.items;
    total.value = r.totalItems || r.items.length;
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  }
}
```

`fillCode` 与 `onScan` 命中处增加高亮（在 `fillCode` 中）：

```ts
function fillCode(code: string): void {
  rawCode.value = code;
  pulseHighlight();
}
```

新增动效触发函数：

```ts
function pulseHighlight(): void {
  pulsing.value = true;
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => (pulsing.value = false), 600) as unknown as number;
}
```

`onScan` 成功分支中，填入后调用 `pulseHighlight()` 再加 `await onClaim();`：

```ts
    rawCode.value = code;
    pulseHighlight();
    await onClaim();
```

`onLoad` 中 orderId 匹配改：

```ts
    } else if (orderId) {
      try {
        const { items } = await fetchPendingRedemptions(200);
        const hit = items.find((r) => String(r.orderId) === String(orderId));
        if (hit) rawCode.value = hit.code;
      } catch (_e) {
        /* 匹配失败不阻塞，用户可手输 */
      }
    }
```

- [ ] **Step 2: 替换 `<template>` 整体**

```html
<template>
  <view class="page">
    <view class="head">
      <text class="head-title">待核销自提单</text>
      <text class="badge">{{ total }}</text>
    </view>

    <!-- 核销输入 -->
    <view class="claim-card" :class="{ pulse: pulsing }">
      <input
        ref="codeInput"
        class="code-input"
        v-model="rawCode"
        placeholder="输入核销码或扫一扫"
        :maxlength="320"
        confirm-type="done"
        @confirm="onClaim"
      />
      <button class="scan-btn" @tap="onScan">扫一扫</button>
      <button class="claim-btn" :disabled="claiming" @tap="onClaim">{{ claiming ? '核销中…' : '核销' }}</button>
    </view>

    <!-- 待核销自提单列表 -->
    <text class="sec-title">待核销清单</text>
    <view class="card" v-for="r in orders" :key="r.orderId" @tap="fillCode(r.code)">
      <view class="rhead">
        <view class="left">
          <text class="code">#{{ r.orderCode || r.orderId }}</text>
          <text v-if="isCodPaymentType(r.paymentType) && !r.collected" class="tag-cod">待收款</text>
        </view>
        <text class="st" :style="{ color: st(r.status).color }">{{ st(r.status).label }}</text>
      </view>

      <view class="goods" v-if="r.lines && r.lines.length">
        <view class="grow" v-for="(ln, i) in r.lines" :key="i">
          <text class="gname">{{ ln.name }}</text>
          <text class="gqty">×{{ ln.quantity }}</text>
          <text class="gamt">¥{{ fenToYuan(ln.lineTotalWithTax) }}</text>
        </view>
      </view>
      <view class="goods" v-else>
        <view class="grow"><text class="gname">商品信息</text><text class="gqty"></text><text class="gamt">—</text></view>
      </view>

      <view class="foot">
        <text class="pill">{{ r.code }}</text>
        <text class="exp" :class="{ hot: r.status === 'expiring_soon' }">{{ formatExpiry(r.expiresAt, r.status) }}</text>
      </view>
    </view>
    <view v-if="!orders.length" class="empty">暂无待核销自提单</view>

    <view style="height: 140rpx" />
  </view>
</template>
```

- [ ] **Step 3: 替换 `<style lang="scss" scoped>` 整体（清爽浅色）**

```scss
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 60rpx;
  .head {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
    .head-title { font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .badge {
      min-width: 48rpx; text-align: center; font-size: 26rpx; font-weight: 700; color: #fff;
      background: $wa-accent; border-radius: 999rpx; padding: 6rpx 18rpx;
      box-shadow: 0 6rpx 18rpx rgba(255, 102, 0, 0.28);
    }
  }
  .claim-card {
    display: flex; align-items: center; gap: 16rpx;
    background: $wa-card; border-radius: 20rpx; padding: 20rpx; margin-bottom: 28rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.06); border: 2rpx solid transparent;
    transition: border-color 0.2s, transform 0.2s;
    &.pulse { border-color: $wa-accent; transform: translateY(-2rpx); }
    .code-input {
      flex: 1; height: 76rpx; padding: 0 24rpx; font-size: 34rpx; font-weight: 700;
      letter-spacing: 4rpx; font-family: ui-monospace, Menlo, Consolas, monospace;
      background: $wa-bg; border-radius: 16rpx; color: $wa-ink;
    }
    .claim-btn {
      margin: 0; min-width: 176rpx; height: 76rpx; line-height: 76rpx; padding: 0 28rpx;
      font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: 16rpx; font-weight: 600;
      &[disabled] { opacity: 0.6; }
    }
    .scan-btn {
      margin: 0; min-width: 132rpx; height: 76rpx; line-height: 76rpx; padding: 0 20rpx;
      font-size: 28rpx; background: $wa-ink; color: #fff; border-radius: 16rpx;
    }
  }
  .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
  .card {
    background: $wa-card; border-radius: 20rpx; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.05);
    .rhead {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
      .left { display: flex; align-items: center; gap: 12rpx; }
      .code { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
      .st { font-size: 24rpx; }
      .tag-cod {
        display: inline-flex; align-items: center; padding: 2rpx 14rpx; border-radius: 8rpx;
        font-size: 22rpx; color: #b45309; background: #fef3c7; border: 1rpx solid #fcd34d;
      }
    }
    .goods { margin-bottom: 12rpx; }
    .grow {
      display: flex; align-items: center; gap: 12rpx; padding: 6rpx 0; font-size: 26rpx;
      .gname { flex: 1; color: $wa-ink; }
      .gqty { color: $wa-muted; }
      .gamt { font-weight: 700; color: $wa-ink; }
    }
    .foot {
      display: flex; align-items: center; justify-content: space-between;
      border-top: 1rpx dashed $wa-rule; padding-top: 18rpx;
      .pill {
        font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 800; letter-spacing: 3rpx;
        font-size: 28rpx; color: #d04b00; background: #fff4ec; border: 1rpx solid #ffd9bc;
        border-radius: 12rpx; padding: 4rpx 18rpx;
      }
      .exp { font-size: 24rpx; color: $wa-muted; &.hot { color: $pm-warning; font-weight: 600; } }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 100rpx 0; }
}
</style>
```

> `$pm-warning` 已在 `web-admin/src/uni.scss` 定义（#f59e0b），可直接引用。

- [ ] **Step 4: Commit**

```bash
cd D:/zhao/vshop
git add web-admin/src/pages/pickup/redeem/index.vue
git commit -m "feat(admin): 核销页交付清单卡清爽浅色改版 + 计数/有效期/高亮"
```

---

### Task 5: 本地构建 + 手机视口截图回归

**Files:**
- Verify: `vshop/web-admin/pages/pickup/redeem/index.vue` 构建产物

- [ ] **Step 1: 构建 web-admin H5**

```bash
cd D:/zhao/vshop/web-admin
pnpm build:h5
```

Expected: 构建成功退出码 0。若 SCSS 报变量未定义，回查 `uni.scss` 令牌引用。

- [ ] **Step 2: 后端类型检查/编译（cjk-plugin）**

按仓库既有方式编译 `cjk-plugin`（`cd D:/zhao/vendure` 后执行其 build 或 `tsc --noEmit`，以仓库现存命令为准）。Expected: 无 `EntityHydrator`/字段类型错误。

- [ ] **Step 3: GraphQL 冒烟 `myPendingRedemptions`**

用管理端 token 对 admin-api 发送：

```graphql
query {
  myPendingRedemptions(options: { take: 3 }) {
    totalItems
    items {
      orderId orderCode code status expiresAt claimed paymentType collected
      lines { name quantity lineTotalWithTax }
    }
  }
}
```

Expected: 命中 pickup 单返回非空 `lines`；商品名/数量/金额正确；`totalItems` 与表现一致。

- [ ] **Step 4: Playwright 手机视口截图**

用既有截图脚本（标准视口 390×844，dpr=2=780×1688）打开 `e.joho.cn/guanli/#/pages/pickup/redeem/index`，截图核销页。覆盖：有待核销单（含 COD 待收款）、空态、扫码填入后 `pulse` 高亮态。把截图补充进操作手册/测试记录。

- [ ] **Step 5: Commit**

```bash
cd D:/zhao/vshop
git add -A web-admin/e2e-shots docs/superpowers/plans/2026-09-16-pickup-redeem-page-ui.md
git commit -m "test(admin): 核销页手机视口截图回归"
```

---

### Task 6: 部署（本地构建产物 → 服务器）

**Files:**
- Deploy: 前端产物 scp → 服务器解压/拷入；后端 `pm2 restart`

- [ ] **Step 1: 前端产物部署**

按 vshop 部署机制（`web-admin/scripts/deploy.mjs`：scp 产物 → 服务器解压/拷入），把 Task 5 构建产物部署到 `e.joho.cn/guanli` 目录。Expected: 服务器端无需 build，直接覆盖静态目录后即时生效。

- [ ] **Step 2: 后端部署**

`cjk-plugin` 改动随 vendure 后端 `pm2 restart` 生效。Expected: 重启后 admin-api 正常，`myPendingRedemptions` 返回 `lines`。

- [ ] **Step 3: 线上复核**

浏览器打开线上核销页，确认商品清单/计数徽标/有效期/高亮正常；手机视口截图留存。

---

## Self-Review

**Spec coverage：**
- 清爽浅色方案A → Task 4 模板/样式；商品信息 → Task1/2/3；计数徽标(totalItems) → Task3/4；有效期人性化 → Task4 `formatExpiry`；核销码高亮动效 → Task4 `pulseHighlight`；空态美化 → Task4；延后库存预警 → 明确不实现。

**Placeholder scan：** 无 TBD/TODO；所有代码步骤给出完整代码。

**Type consistency：** `PendingRedemptionLine`（service/接口/schema 同一命名）；`fetchPendingRedemptions` 返回 `{items,totalItems}` 三处调用点（loadList、onLoad、Task3）一致；`formatExpiry(t,status)`、`pulseHighlight()`、`total`、`pulsing` 命名贯通 Task4。