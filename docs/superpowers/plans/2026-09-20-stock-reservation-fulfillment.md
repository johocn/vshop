# 多仓拆分发货 · 预留单闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已上线的预留单引擎补齐 admin API（查询/分配/核销/释放/对账）并让 web-admin 发货页支持按仓库拆分多 fulfillment 发货。

**Architecture:** 后端在 cjk-plugin 增加 `StockReservationAdminResolver`（复用 `stock-doc.admin.resolver.ts` 的 decorator 模式 + SDL 独立命名规则），暴露预留单查询与操作 GraphQL。前端 `order/ship` 页增强为「按仓库分组分配 → 逐仓循环调用现有 `partialShip`（addFulfillmentToOrder）」。预留单自动核销沿用现有 `StockMovementEvent` 托盘，无需改事件链路。

**Tech Stack:** Vendure@3.6.4 / NestJS / TypeGraphQL / uni-app (web-admin H5)

**Spec:** `vshop/docs/superpowers/specs/2026-09-20-stock-reservation-fulfillment-design.md`

---

### Task 1: 后端 SDL —— 预留单输出类型与接口定义

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（adminApiExtensions.schema 内追加）
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-reservation.admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-reservation.service.ts`（补分页 list / findOne）

- [ ] **Step 1: 在 plugin.ts 的 adminApiExtensions.schema 中追加 SDL（严格独立命名 + `#` 注释，避免跨插件重名崩溃）**

在 `adminApiExtensions.schema` 的 gql 模板内（与 `StockDocLedgerEntry` 同级）追加：

```graphql
# 预留单 admin 输出类型（独立命名，定义在本插件 SDL 内）
type ReservationItem {
    id: ID!
    reservationId: ID!
    stockLocationId: ID!
    qty: Int!
    fulfillType: String!
    status: String!
}
type Reservation {
    id: ID!
    orderId: ID!
    orderLineId: ID!
    variantId: ID!
    totalQty: Int!
    status: String!
    tenantChannelId: String
    createdAt: DateTime!
    items: [ReservationItem!]!
}
type ReservationList {
    items: [Reservation!]!
    totalItems: Int!
}
type ReservationReconcileRow {
    variantId: ID!
    physicalSum: Int!
    virtualSum: Int!
    pendingQty: Int!
    diff: Int!
}
input ReservationSplitInput {
    locationId: ID!
    fulfillType: String!
    qty: Int!
}
extend type Query {
    reservations(status: String, variantId: ID, orderId: ID, page: Int, pageSize: Int): ReservationList!
    reservation(id: ID!): Reservation!
    reservationReconcile: [ReservationReconcileRow!]!
}
extend type Mutation {
    allocateReservation(id: ID!, splits: [ReservationSplitInput!]!): Reservation!
    fulfillReservationItem(id: ID!, quantity: Int): ReservationItem!
    releaseReservation(id: ID!): Reservation!
}
```

- [ ] **Step 2: 注册 resolver 到 adminApiExtensions.resolvers 数组**

在 plugin.ts 的 `adminApiExtensions.resolvers` 数组中加入 `StockReservationAdminResolver`，并 import：

```ts
import { StockReservationAdminResolver } from './inventory/stock-reservation.admin.resolver';
```

- [ ] **Step 3: 新增 resolver 文件**

创建 `d:\zhao\vendure\packages\cjk-plugin\src\inventory\stock-reservation.admin.resolver.ts`：

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { StockReservationService } from './stock-reservation.service';
import { StockReservationEntity } from './stock-reservation.entity';

@Resolver()
export class StockReservationAdminResolver {
    constructor(private service: StockReservationService) {}

    @Query()
    @Allow(Permission.ReadCatalog as Permission)
    async reservations(
        @Ctx() ctx: RequestContext,
        @Args({ name: 'status', type: () => String, nullable: true }) status?: string,
        @Args({ name: 'variantId', type: () => ID, nullable: true }) variantId?: ID,
        @Args({ name: 'orderId', type: () => ID, nullable: true }) orderId?: ID,
        @Args({ name: 'page', type: () => Number, nullable: true, defaultValue: 1 }) page?: number,
        @Args({ name: 'pageSize', type: () => Number, nullable: true, defaultValue: 20 }) pageSize?: number,
    ) {
        return this.service.list(ctx, { status, variantId, orderId, page, pageSize });
    }

    @Query()
    @Allow(Permission.ReadCatalog as Permission)
    async reservation(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        const res = await this.service.get(ctx, Number(id));
        const items = await this.service.items(ctx, Number(id));
        return { ...res, items };
    }

    @Query()
    @Allow(Permission.ReadCatalog as Permission)
    async reservationReconcile(@Ctx() ctx: RequestContext) {
        return this.service.reconcileScan(ctx);
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog as Permission)
    async allocateReservation(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args({ name: 'splits', type: () => [Object] }) splits: Array<{ locationId: ID; fulfillType: string; qty: number }>,
    ) {
        const res = await this.service.allocate(ctx, Number(id), splits);
        const items = await this.service.items(ctx, Number(id));
        return { ...res, items };
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog as Permission)
    async fulfillReservationItem(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args({ name: 'quantity', type: () => Number, nullable: true }) quantity?: number,
    ) {
        return this.service.fulfill(ctx, Number(id), Number(id), quantity);
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog as Permission)
    async releaseReservation(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.service.release(ctx, Number(id), { returnPhysical: false });
    }
}
```

> 注意：`fulfillReservationItem` 当前参数语义为 `(reservationId, itemId, qty)`，resolver 中以 itemId 为 id 入参（Step 5 修正服务层签名以匹配）。

- [ ] **Step 4: 在 stock-reservation.service.ts 增加 list() 方法**

```ts
async list(
    ctx: RequestContext,
    filters: { status?: string; variantId?: ID; orderId?: ID; page?: number; pageSize?: number } = {},
): Promise<{ items: StockReservationEntity[]; totalItems: number }> {
    const qb = this.repo(ctx).createQueryBuilder('r')
        .where('r.tenantChannelId = :tenant OR r.tenantChannelId IS NULL', { tenant: ctx.channel.code });
    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.variantId) qb.andWhere('r.variantId = :variantId', { variantId: Number(filters.variantId) });
    if (filters.orderId) qb.andWhere('r.orderId = :orderId', { orderId: Number(filters.orderId) });
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const [items, totalItems] = await qb
        .orderBy('r.createdAt', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();
    return { items, totalItems };
}
```

- [ ] **Step 5: 修正 fulfill 服务层签名以支持按 itemId 核销**

将 `stock-reservation.service.ts` 的 `fulfill(ctx, reservationId, itemId, quantity?)` 改为 `fulfillItem(ctx, itemId, quantity?)`（内部逻辑不变，去掉 reservationId 前置参数），并同步更新 `onSale` 内调用点为 `this.fulfillItem(ctx, item.id, qty)`。

- [ ] **Step 6: 编译 + 单测**

Run: `cd d:\zhao\vendure && npx lerna run build --scope @vendure/cjk-plugin`
Expected: build 成功，无 TS 错误。

Run: `cd d:\zhao\vendure && npx vitest run packages/cjk-plugin/src/inventory/stock-reservation.service.spec.ts`
Expected: 全部 PASS（现有 7 个用例不回归）。

- [ ] **Step 7: 提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/inventory/stock-reservation.admin.resolver.ts packages/cjk-plugin/src/inventory/stock-reservation.service.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk): reservation admin API (list/get/allocate/fulfill/release/reconcile)"
```

---

### Task 2: 后端编译产物 lib 提交（部署铁律）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\lib/**`（编译产物，必须提交否则服务器跑旧代码）

- [ ] **Step 1: 构建 cjk-plugin 生成 lib**

Run: `cd d:\zhao\vendure && npx lerna run build --scope @vendure/cjk-plugin`
Expected: `packages/cjk-plugin/lib/` 更新（新增 stock-reservation.admin.resolver.js）。

- [ ] **Step 2: 提交 lib**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/lib
git commit -m "build(cjk): compile lib with reservation admin resolver"
```

---

### Task 3: 后端 E2E 冒烟（admin-api 回归）

**Files:**
- Create: `d:\zhao\scripts\2026-09-20-reservation-api-smoke.mjs`

- [ ] **Step 1: 写冒烟脚本（admin-api 登录 + 查询 reservations + allocate + reconcile）**

```js
// 2026-09-20-reservation-api-smoke.mjs
// 目标：验证预留单 admin API 在生产的可用性（schema 命中 + 查询/操作返回结构正确）
const BASE = 'https://e.joho.cn/admin-api';
async function gql(query, vars = {}, token) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ query, variables: vars }),
  });
  return r.json();
}
// 登录获取 token（superadmin/z123123）
const login = await gql(`mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }`);
console.log('login:', JSON.stringify(login).slice(0, 120));
// introspection 命中检查
const schema = await gql(`{ __schema { queryType { fields { name } } mutationType { fields { name } } } }`);
const qnames = schema.data.__schema.queryType.fields.map(f => f.name);
const mnames = schema.data.__schema.mutationType.fields.map(f => f.name);
const expect = ['reservations', 'reservation', 'reservationReconcile'];
const expectM = ['allocateReservation', 'fulfillReservationItem', 'releaseReservation'];
console.log('query 命中:', expect.every(n => qnames.includes(n)));
console.log('mutation 命中:', expectM.every(n => mnames.includes(n)));
```

- [ ] **Step 2: 部署后端到生产（git push + 服务器 pull + pm2 restart）**

```bash
cd d:\zhao\vendure
git push origin master
ssh joho "cd /www/apps/vendure && git pull && pm2 restart vendure --update-env"
```

- [ ] **Step 3: 运行冒烟**

Run: `node d:\zhao\scripts\2026-09-20-reservation-api-smoke.mjs`
Expected: query/mutation 全部命中 true。

- [ ] **Step 4: 提交脚本（可选，脚本留作回归资产）**

---

### Task 4: web-admin —— 发货页多仓拆分

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\order\ship\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\apis\order.ts`
- Create: `d:\zhao\vshop\web-admin\src\apis\reservation.ts`

- [ ] **Step 1: 新增 reservation API 客户端**

创建 `d:\zhao\vshop\web-admin\src\apis\reservation.ts`：

```ts
// 预留单 admin-api 客户端（对齐 stock-reservation.admin.resolver 的 SDL）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface ReservationItem {
  id: string; reservationId: string; stockLocationId: string;
  qty: number; fulfillType: string; status: string;
}
export interface Reservation {
  id: string; orderId: string; orderLineId: string; variantId: string;
  totalQty: number; status: string; tenantChannelId: string | null;
  createdAt: string; items: ReservationItem[];
}

export async function fetchReservationByOrder(orderId: string): Promise<Reservation[]> {
  const c = getAdminClient();
  try {
    const r = await c.request<{ reservations: { items: Reservation[]; totalItems: number } }>(
      `query ($orderId: ID) { reservations(orderId: $orderId, pageSize: 100) { totalItems items {
        id orderId orderLineId variantId totalQty status tenantChannelId createdAt
        items { id reservationId stockLocationId qty fulfillType status }
      } } }`,
      { orderId },
    );
    return r.reservations.items ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '预留单查询失败'));
  }
}
```

- [ ] **Step 2: 在 order.ts 增加按仓库发货助手**

在 `d:\zhao\vshop\web-admin\src\apis\order.ts` 追加：

```ts
// 多仓拆分发货：按仓库逐仓调用 addFulfillmentToOrder（每仓独立 fulfillment）
export async function shipByWarehouse(
  orderId: string,
  shipments: Array<{ stockLocationId: string; parts: ShipLinePart[]; method?: string; trackingCode?: string }>,
): Promise<{ ok: string[]; fails: string[] }> {
  const ok: string[] = [];
  const fails: string[] = [];
  for (const s of shipments) {
    if (!s.parts.length) continue;
    try {
      await partialShip(orderId, s.parts, s.method || 'standard', s.trackingCode || undefined);
      ok.push(s.stockLocationId);
    } catch (e: any) {
      fails.push(`${s.stockLocationId}:${e?.message || '发货失败'}`);
    }
  }
  return { ok, fails };
}
```

- [ ] **Step 3: 发货页增强（按仓库分组 UI）**

修改 `order/ship/index.vue`：
- 页面顶部加载时并行调 `fetchReservationByOrder(orderId)`，把行按 `reservation.items[].stockLocationId` 分组。
- 每行展示「可发数量」+ 一个仓库选择器（picker：默认按预留分配回填各仓）。
- 提交时按仓库聚合 parts，调 `shipByWarehouse(orderId, shipments)`；`fails` 非空则 toast 提示失败明细。
- 无预留单的订单（单仓/未开物理仓）保持原 `partialShip` 单仓路径。

- [ ] **Step 4: 本地构建验证**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vshop\web-admin
git add src/apis/reservation.ts src/apis/order.ts src/pages/order/ship/index.vue
git commit -m "feat(admin): 订单发货多仓拆分（预留单分组 + 逐仓 fulfillment）"
```

---

### Task 5: 端到端回归 + 手机截图 + 手册

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_shot_reservation.py`
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`（新增章节）

- [ ] **Step 1: 手机截图脚本（390×844，dpr=2）**

创建 `_e2e/_shot_reservation.py`，参照 `_e2e/_shot_t8.py` 模式：
- 登录 guoxinnanshan@163.com/you123123（t2 租户管理员）
- 进入订单列表 → 打开一个可发货订单 → 发货页截图（展示多仓分组）
- 进入预留单列表（若实现了独立页）截图
- 输出 `src/static/manual/shots/` 下 `r15_reservation_ship.png` 等

- [ ] **Step 2: 手册新增「多仓拆分发货」章节**

在 `web-admin/src/static/manual/index.html` 的 CHAPTERS 数组追加 op-26：

```js
{book:'op', id:'op-26', title:'多仓拆分发货（预留单）', html:`
<p class="lead">物理仓多仓租户下单后自动生成<mark class="mark">预留单</mark>；发货时订单行可按仓库拆分，各仓分别生成独立发货单（各自快递/运单号）。本节覆盖预留单的查看与拆分发货操作。</p>
<h3>1. 查看预留单</h3>
<p>入口：后台 → 订单 → 发货（或多仓订单详情）。系统按订单行展示各仓库应发数量与状态（待分配/已分配/已完成）。</p>
<h3>2. 按仓库拆分发货</h3>
<p>发货页中每个订单行可分配到多个仓库，提交后逐仓生成独立发货单；各仓 SALE 后预留明细自动核销。</p>
<img class="img" src="shots/r15_reservation_ship.png" alt="多仓拆分发货">
<div class="imgcap">图 R15 · 发货页按仓库拆分</div>
<h3>3. 对账</h3>
<p>预留单对账校验 Σ物理 − 虚拟 == Σ待发，偏差行会在预留单对账视图列出。</p>`}
```

- [ ] **Step 3: 构建 + 部署 web-admin**

Run: `cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
Expected: 部署成功，nginx reload。

- [ ] **Step 4: 验证生产**

Run: `curl -s https://e.joho.cn/guanli/static/manual/index.html | grep -c "op-26"`
Expected: ≥1

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vshop\web-admin
git add src/static/manual/index.html src/static/manual/shots _e2e/_shot_reservation.py
git commit -m "docs(admin): 多仓拆分发货手册 op-26 + 手机截图"
```
