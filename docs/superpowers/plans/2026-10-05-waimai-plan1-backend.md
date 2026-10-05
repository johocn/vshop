# Waimai Plan 1/3 — 后端缺口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 campus-delivery-plugin 内补齐外卖模板所需的后端缺口：店铺列表聚合查询、订单骑手卡查询、骑手转单（含已取货拍照交接），及 Channel 元数据 customFields。

**Architecture:** 全部改动限于 `e:\zhao\vendure\packages\campus-delivery-plugin`（src + lib 入库，服务器零构建）。复用既有 HallService.backToHall / RiderService.assertApprovedRider / Order delivery customFields 体系。customFields 物理列由 vendure bootstrap 自动补齐，无手写迁移。

**Tech Stack:** Vendure 插件（NestJS resolver + TypeORM），vitest 单测（手写 mock，参照 `r2-mark.service.spec.ts` 风格）。

**Spec 实测修正（相对 spec §7）：** 骑手任务流（campusHall/campusGrabOrder/campusMyTasks/campusStartTask/campusDeliverTask/campusReportException/applyRider/campusRiderOnline/campusCapacityCheck/myRiderEarnings）后端**已全部就绪**（hall-shop.resolver / rider-task-shop.resolver / rider-shop.resolver）。真实缺口如下 4 项。

**关键事实（写代码前必读）：**
- customFields 是 TypeORM **embedded** 结构：实体访问 `order.customFields.hallStatus`；QueryBuilder 字符串路径必须写 `order.customFields.hallStatus`（裸列在 PG 不存在）
- 渠道过滤：Order 无标量 channelId，join `order.channels` 过滤 `channel.id = ctx.channelId`
- 插件 resolver 无 @Allow 即 shop-api 放行（本计划全部是 shop-api 公开/登录语义，不需要 @Allow）
- 改动 deployment 四件套：① lib 入库 ② build-prod.ps1 已含 campus 包（无需再改）③ 本地重编 dev-server 生产 dist ④ 服务器 symlink 已建（campus 已上线，无需再做）→ 本次只需 ①③ + git pull + pm2 restart

---

### Task 1: Channel 元数据 customFields + Order 转单存证字段

**Files:**
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\custom-fields.ts`
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\custom-fields.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
// src/custom-fields.spec.ts
import { describe, expect, it } from 'vitest';
import { campusCustomFields } from './custom-fields';

describe('campusCustomFields', () => {
    it('Channel 含 waimai 四字段（tags/monthlySales/logo/promoText）', () => {
        const names = (campusCustomFields.Channel ?? []).map(f => f.name);
        expect(names).toContain('waimaiTags');
        expect(names).toContain('waimaiMonthlySales');
        expect(names).toContain('waimaiLogo');
        expect(names).toContain('waimaiPromoText');
    });
    it('Order 含转单存证字段', () => {
        const names = campusCustomFields.Order.map(f => f.name);
        expect(names).toContain('transferPhotos');
        expect(names).toContain('transferNote');
        expect(names).toContain('transferAt');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest run src/custom-fields.spec.ts`
Expected: FAIL（Channel 为 undefined）

- [ ] **Step 3: 实现**

在 `campusCustomFields` 对象中追加（保持既有字段不动）：

```ts
    Channel: [
        { name: 'waimaiTags', type: 'string', nullable: true }, // '米饭快餐,夜宵' 逗号分隔
        { name: 'waimaiMonthlySales', type: 'int', nullable: true },
        { name: 'waimaiLogo', type: 'string', nullable: true },
        { name: 'waimaiPromoText', type: 'string', nullable: true }, // 满减 tag 文案，如 '满20减4'（spec §12.2 增补）
    ],
```

并在 `Order` 数组末尾追加：

```ts
        { name: 'transferPhotos', type: 'string', list: true, nullable: true }, // 已取货转单拍照交接存证
        { name: 'transferNote', type: 'string', nullable: true },
        { name: 'transferAt', type: 'datetime', nullable: true },
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/custom-fields.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/custom-fields.ts src/custom-fields.spec.ts
git commit -m "feat(campus): Channel waimai 元数据字段 + Order 转单存证 customFields"
```

---

### Task 2: 店铺列表聚合 waimaiStoreList

**Files:**
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts`
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-shop.resolver.ts`
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`（resolvers/providers 注册）
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
// src/waimai-store.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { WaimaiStoreService } from './waimai-store.service';

function makeEnv(opts: { channels?: any[]; configs?: any[] } = {}) {
    const repoByEntity: Record<string, any> = {
        CampusFulfillmentConfig: { find: vi.fn().mockResolvedValue(opts.configs ?? []) },
        Channel: { find: vi.fn().mockResolvedValue(opts.channels ?? []) },
    };
    const conn = { getRepository: vi.fn((_ctx: any, ent: any) => repoByEntity[ent.name ?? String(ent)]) } as any;
    return { svc: new WaimaiStoreService(conn), repoByEntity };
}

describe('WaimaiStoreService.listStores', () => {
    it('仅返回有履约配置的渠道并解析 tags', async () => {
        const env = makeEnv({
            configs: [{ channelId: 2, paused: false, routesEnabled: ['R1', 'R3'] }],
            channels: [
                { id: 1, token: 'default', code: 'default-channel', customFields: {} },
                { id: 2, token: 'canteen', code: '一食堂麻辣香锅',
                  customFields: { waimaiTags: '米饭快餐, 夜宵', waimaiMonthlySales: 320, waimaiLogo: '/static/a.webp', waimaiPromoText: '满20减4' } },
            ],
        });
        const list = await env.svc.listStores({} as any);
        expect(list).toHaveLength(1);
        expect(list[0]).toEqual({
            channelId: 2, channelToken: 'canteen', name: '一食堂麻辣香锅',
            logo: '/static/a.webp', tags: ['米饭快餐', '夜宵'], monthlySales: 320,
            promoText: '满20减4',
            paused: false, routesEnabled: ['R1', 'R3'],
        });
    });
    it('空 tags/缺月售容错，paused 透传', async () => {
        const env = makeEnv({
            configs: [{ channelId: 9, paused: true, routesEnabled: [] }],
            channels: [{ id: 9, token: 'x', code: 'x店', customFields: {} }],
        });
        const list = await env.svc.listStores({} as any);
        expect(list[0].tags).toEqual([]);
        expect(list[0].monthlySales).toBe(0);
        expect(list[0].promoText).toBeNull();
        expect(list[0].paused).toBe(true);
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/waimai-store.service.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 service**

```ts
// src/waimai-store.service.ts
import { Injectable } from '@nestjs/common';
import { Channel, RequestContext, TransactionalConnection } from '@vendure/core';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';

export interface WaimaiStore {
    channelId: number;
    channelToken: string;
    name: string;
    logo: string | null;
    tags: string[];
    monthlySales: number;
    promoText: string | null;
    paused: boolean;
    routesEnabled: string[];
}

@Injectable()
export class WaimaiStoreService {
    constructor(private connection: TransactionalConnection) {}

    /** 店铺列表：有履约配置的渠道即外卖店铺（跨渠道公开元数据聚合，供 C 端首页）。
     * C 端进入店铺后用 channelToken 作 vendure-token 切换渠道拉菜单/下单。 */
    async listStores(ctx: RequestContext): Promise<WaimaiStore[]> {
        const configs = await this.connection.getRepository(ctx, CampusFulfillmentConfig).find();
        const byChannel = new Map(configs.map(c => [Number(c.channelId), c]));
        const channels = await this.connection.getRepository(ctx, Channel).find();
        const stores: WaimaiStore[] = [];
        for (const ch of channels) {
            const cfg = byChannel.get(Number(ch.id));
            if (!cfg) continue;
            const cf = (ch.customFields ?? {}) as any;
            stores.push({
                channelId: Number(ch.id),
                channelToken: ch.token,
                name: ch.code,
                logo: cf.waimaiLogo ?? null,
                tags: typeof cf.waimaiTags === 'string' && cf.waimaiTags.length
                    ? cf.waimaiTags.split(',').map((t: string) => t.trim()).filter(Boolean)
                    : [],
                monthlySales: cf.waimaiMonthlySales ?? 0,
                promoText: cf.waimaiPromoText ?? null,
                paused: cfg.paused,
                routesEnabled: cfg.routesEnabled ?? [],
            });
        }
        return stores;
    }
}
```

- [ ] **Step 4: 实现 resolver 并注册**

```ts
// src/waimai-shop.resolver.ts
import { Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { WaimaiStoreService } from './waimai-store.service';

@Resolver()
export class WaimaiShopResolver {
    constructor(private stores: WaimaiStoreService) {}

    /** 公开只读：C 端首页店铺列表（跨渠道元数据聚合） */
    @Query()
    async waimaiStoreList(@Ctx() ctx: RequestContext) {
        return this.stores.listStores(ctx);
    }
}
```

在 `campus-delivery.plugin.ts`：`import { WaimaiShopResolver } from './waimai-shop.resolver';` 与 `import { WaimaiStoreService } from './waimai-store.service';`，分别在 `resolvers` 数组追加 `WaimaiShopResolver`、`providers` 数组追加 `WaimaiStoreService`（照 HallShopResolver/HallService 同款条目位置）。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/waimai-store.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/waimai-store.service.ts src/waimai-shop.resolver.ts src/waimai-store.service.spec.ts src/campus-delivery.plugin.ts
git commit -m "feat(campus): waimaiStoreList 店铺列表聚合查询（channels x 履约配置）"
```

---

### Task 3: 订单骑手卡查询 campusOrderRider

**Files:**
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.ts`（加 `orderRider` 方法 + import Customer）
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-shop.resolver.ts`（加 query）
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-extra.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
// src/rider-task-extra.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { RiderTaskService } from './rider-task.service';

function makeEnv(opts: { order?: any; rider?: any } = {}) {
    const repoByEntity: Record<string, any> = {
        Order: { findOne: vi.fn().mockResolvedValue(opts.order ?? null), update: vi.fn().mockResolvedValue({}) },
        Customer: { findOne: vi.fn().mockResolvedValue(opts.rider ?? null) },
    };
    const conn = { getRepository: vi.fn((_ctx: any, ent: any) => repoByEntity[ent.name ?? String(ent)]) } as any;
    const svc = new RiderTaskService(
        conn,
        { assertApprovedRider: vi.fn().mockResolvedValue({ id: 7 }) } as any,
        { adjust: vi.fn() } as any,
        { backToHall: vi.fn().mockResolvedValue(undefined) } as any,
    );
    return { svc, repoByEntity };
}

describe('RiderTaskService.orderRider', () => {
    it('已指派订单返回骑手姓名与信用分', async () => {
        const env = makeEnv({
            order: { id: 5, customFields: { deliveryStaffId: '7' } },
            rider: { id: 7, customFields: { riderRealName: '王同学', riderCredit: 98 } },
        });
        expect(await env.svc.orderRider({} as any, 5)).toEqual({ realName: '王同学', credit: 98 });
    });
    it('未指派/骑手不存在返回 null', async () => {
        const env = makeEnv({ order: { id: 5, customFields: {} } });
        expect(await env.svc.orderRider({} as any, 5)).toBeNull();
        const env2 = makeEnv({ order: { id: 5, customFields: { deliveryStaffId: '99' } } });
        expect(await env2.svc.orderRider({} as any, 5)).toBeNull();
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/rider-task-extra.spec.ts`
Expected: FAIL（orderRider 不存在）

- [ ] **Step 3: 实现 service 方法**

`rider-task.service.ts` 顶部 import 增加 `Customer`（来自 `@vendure/core`），类中追加：

```ts
    /** 订单骑手卡信息：C 端订单跟踪轮询用。未指派返回 null。 */
    async orderRider(ctx: RequestContext, orderId: ID) {
        const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId as any } });
        const riderId = Number((order?.customFields as any)?.deliveryStaffId ?? NaN);
        if (!riderId) return null;
        const rider = await this.connection.getRepository(ctx, Customer).findOne({ where: { id: riderId } });
        if (!rider) return null;
        const cf = (rider.customFields ?? {}) as any;
        return { realName: cf.riderRealName ?? '骑手', credit: cf.riderCredit ?? 100 };
    }
```

resolver `rider-task-shop.resolver.ts` 追加：

```ts
    /** 公开只读：C 端订单跟踪骑手卡（姓名+信用分，不含联系方式） */
    @Query()
    async campusOrderRider(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) {
        return this.riderTaskService.orderRider(ctx, orderId);
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/rider-task-extra.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rider-task.service.ts src/rider-task-shop.resolver.ts src/rider-task-extra.spec.ts
git commit -m "feat(campus): campusOrderRider 订单骑手卡查询"
```

---

### Task 4: 骑手转单 campusTransferTask（含已取货拍照交接）

**Files:**
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.ts`（构造器注入 HallService + transfer 方法）
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-shop.resolver.ts`
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.spec.ts`（既有用例构造器补 hall mock，保持全绿）
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-extra.spec.ts`（追加 describe）

- [ ] **Step 1: 写失败测试（追加到 rider-task-extra.spec.ts）**

```ts
describe('RiderTaskService.transfer', () => {
    function makeTransferEnv(opts: { order?: any } = {}) {
        const orderRepo = {
            findOne: vi.fn().mockResolvedValue(opts.order ?? null),
            update: vi.fn().mockResolvedValue({}),
        };
        const conn = { getRepository: vi.fn(() => orderRepo) } as any;
        const hall = { backToHall: vi.fn().mockResolvedValue(undefined) };
        const svc = new RiderTaskService(
            conn,
            { assertApprovedRider: vi.fn().mockResolvedValue({ id: 7 }) } as any,
            { adjust: vi.fn() } as any,
            hall as any,
        );
        return { svc, orderRepo, hall };
    }

    it('assigned 未取货转单：直接回大厅，不写交接存证', async () => {
        const env = makeTransferEnv({ order: { id: 5, customFields: { deliveryStatus: 'assigned' } } });
        await env.svc.transfer({} as any, 5, []);
        expect(env.hall.backToHall).toHaveBeenCalledWith(expect.anything(), 5);
        expect(env.orderRepo.update).not.toHaveBeenCalled();
    });

    it('in_progress 已取货转单：photos 必填并写存证', async () => {
        const env = makeTransferEnv({ order: { id: 5, customFields: { deliveryStatus: 'in_progress' } } });
        await expect(env.svc.transfer({} as any, 5, [])).rejects.toThrow('已取货转单需拍照交接');
        await env.svc.transfer({} as any, 5, ['/static/p1.jpg'], '货物完好');
        expect(env.hall.backToHall).toHaveBeenCalled();
        expect(env.orderRepo.update).toHaveBeenCalledWith(5, expect.objectContaining({
            customFields: expect.objectContaining({
                transferPhotos: ['/static/p1.jpg'],
                transferNote: '货物完好',
                transferAt: expect.any(Date),
            }),
        }));
    });

    it('delivered 状态拒绝转单', async () => {
        const env = makeTransferEnv({ order: { id: 5, customFields: { deliveryStatus: 'delivered' } } });
        await expect(env.svc.transfer({} as any, 5, [])).rejects.toThrow('当前状态不允许转单');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/rider-task-extra.spec.ts`
Expected: FAIL（transfer 不存在）

- [ ] **Step 3: 实现**

`rider-task.service.ts`：import 增加 `HallService`（`./hall.service`）；构造器追加第四参 `private hall: HallService`；类中追加：

```ts
    /** 转单回大厅：assigned 未取货直接回；in_progress 已取货必须拍照交接存证。
     * 回大厅复用 backToHall（清骑手指派、hallStatus 复位 open），存证写 transferPhotos。
     * 一期转单不扣信用分（规则后续租户可配）。 */
    async transfer(ctx: RequestContext, orderId: ID, photos: string[], note?: string) {
        const order = await this.assertOwner(ctx, orderId);
        const status = (order.customFields as any).deliveryStatus;
        if (status === 'in_progress' && !photos?.length) {
            throw new UserInputError('已取货转单需拍照交接');
        }
        if (status !== 'assigned' && status !== 'in_progress') {
            throw new UserInputError('当前状态不允许转单');
        }
        await this.hall.backToHall(ctx, order.id as any);
        if (photos?.length) {
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: {
                    transferPhotos: photos,
                    transferNote: note ?? null,
                    transferAt: new Date(),
                },
            } as any);
        }
        return order;
    }
```

`rider-task-shop.resolver.ts` 追加：

```ts
    /** 转单回大厅；已取货必须拍照交接。错误语义：未登录/非本人 ForbiddenError，状态/缺照片 UserInputError。 */
    @Mutation()
    async campusTransferTask(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('photos') photos: string[],
        @Args('note', { nullable: true }) note?: string,
    ) {
        return this.riderTaskService.transfer(ctx, orderId, photos, note);
    }
```

同时修复既有 `rider-task.service.spec.ts`：所有 `new RiderTaskService(conn, ...)` 构造处追加第 4 参 `{ backToHall: vi.fn() } as any`。

- [ ] **Step 4: 全量测试确认通过**

Run: `npx vitest run`
Expected: 全部 PASS（含既有 spec）

- [ ] **Step 5: Commit**

```bash
git add src/rider-task.service.ts src/rider-task-shop.resolver.ts src/rider-task-extra.spec.ts src/rider-task.service.spec.ts
git commit -m "feat(campus): campusTransferTask 转单回大厅（已取货强制拍照交接）"
```

---

### Task 5: 构建、部署与冒烟

**Files:**
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\lib\**`（构建产物，入库）
- Modify: `e:\zhao\vendure\packages\dev-server\dist\**`（生产 dist 重编，入库）
- Create: `e:\zhao\vshop\.secrets\campus-smoke3.cjs`（冒烟脚本，gitignore 区不入库）

- [ ] **Step 1: 插件本地构建（lib 入库，服务器零构建）**

Run（以插件 package.json scripts 为准，若无 build 脚本用 `npx tsc`）:
`cd e:\zhao\vendure\packages\campus-delivery-plugin && npm run build`
Expected: lib/ 更新无报错

- [ ] **Step 2: dev-server 生产 dist 重编**

Run: `cd e:\zhao\vendure\packages\dev-server && npx tsc -p tsconfig.prod.json`
Expected: dist/ 更新无报错（生产跑 dist/index 非源码，漏这步插件不生效）

- [ ] **Step 3: 提交构建产物**

```bash
git add packages/campus-delivery-plugin/lib packages/dev-server/dist
git commit -m "chore(campus): waimai 后端缺口构建产物（lib + dev-server dist）"
```

- [ ] **Step 4: 部署（先检查并发操作）**

```bash
ssh joho "pm2 ls"   # 确认无并发操作（uptime/restarts 异常先问用户）
ssh joho "cd /www/apps/vendure && git pull && pm2 restart vendure"
```
Expected: pm2 online；`curl -s -H 'Host: www.yourbao.cn' http://127.0.0.1/shop-api/` 返回非 502

- [ ] **Step 5: 冒烟脚本并执行**

写入 `e:\zhao\vshop\.secrets\campus-smoke3.cjs`：

```js
// 用法: node campus-smoke3.cjs https://www.yourbao.cn/shop-api
const api = process.argv[2] || 'https://www.yourbao.cn/shop-api';
const DEFAULT_CHANNEL_TOKEN = process.env.WAIMAI_CHANNEL_TOKEN || 'default-channel'; // 以实测渠道 token 为准
async function gql(query, variables = {}, token = DEFAULT_CHANNEL_TOKEN) {
    const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'vendure-token': token },
        body: JSON.stringify({ query, variables }),
    });
    return res.json();
}
(async () => {
    // 1. 店铺列表
    const stores = await gql(`{ waimaiStoreList { channelId channelToken name tags monthlySales paused routesEnabled } }`);
    console.log('waimaiStoreList:', JSON.stringify(stores.data?.waimaiStoreList));
    if (!Array.isArray(stores.data?.waimaiStoreList)) throw new Error('store list 失败');
    // 2. 骑手卡（未指派单 → null）
    const rider = await gql(`query($id: ID!){ campusOrderRider(orderId: $id){ realName credit } }`, { id: '1' });
    console.log('campusOrderRider:', JSON.stringify(rider.data?.campusOrderRider ?? rider.errors?.[0]?.message));
    // 3. 转单未登录应被拒
    const tr = await gql(`mutation($id: ID!){ campusTransferTask(orderId: $id, photos: []) }`, { id: '1' });
    console.log('transfer(anonymous):', tr.errors ? 'DENIED(预期)' : JSON.stringify(tr.data));
    if (!tr.errors) throw new Error('匿名转单未被拦截');
    console.log('SMOKE PASS');
})();
```

Run: `node e:\zhao\vshop\.secrets\campus-smoke3.cjs https://www.yourbao.cn/shop-api`
Expected: 输出 `SMOKE PASS`；店铺列表含已配置履约的渠道

- [ ] **Step 6: 更新验收手册 + 提交**

在 `e:\zhao\vshop\docs\verify\` 新增 `2026-10-waimai-plan1-backend.md`（冒烟步骤+截图+证据），vshop 仓库提交推送。vendure 仓库 push（如已配置 remote）。

---

### Task 6: campusSetDeliveryTarget 扩展 route/slotId（spec §12 执行时新增）

> 侦察发现（2026-10-05）：`deliverySlotId/fulfillmentRoute(R1/R3)` 只有支付后锁位读取与入厅判定，**无 C 端写入路径**——现有 `setDeliveryTarget(zoneId, buildingId)` 只写 buildingId/campusZone。不补此缺口，学生选的时段与配送路线进不了订单，支付后锁位永远读空、R1/R3 单永不入厅。

**Files:**
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-config.service.ts`（setDeliveryTarget 加可选参数）
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\hall-shop.resolver.ts`（mutation 加两个可选 Args）
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-config.service.spec.ts`（追加 describe）

- [ ] **Step 1: 写失败测试**（追加到 `campus-config.service.spec.ts` 末尾，复用该文件既有 mock 手法；核心断言如下）

```ts
describe('setDeliveryTarget route/slot 扩展', () => {
    it('传 route+slotId 时写全 fulfillmentRoute/deliverySlotId/deliverySlotText', async () => {
        // mock：zone/building 存在；DeliverySlot repo findOne 返回
        // { id: 5, channelId: 1, active: true, capacity: 20, lockedCount: 3, slotDate: '2026-10-06', startTime: '11:00', endTime: '11:30' }
        // orderService.updateCustomFields spy 断言收到：
        // { buildingId: '7', campusZone: '东区', fulfillmentRoute: 'R3',
        //   deliverySlotId: '5', deliverySlotText: '2026-10-06 11:00-11:30' }
    });
    it('slot 余量为 0 抛 UserInputError("该时段已满")', async () => {
        // lockedCount === capacity 的 slot → expect throw
    });
    it('slot 跨渠道/不存在/未激活 抛 UserInputError("时段不可用")', async () => {
        // findOne 返回 null 或 channelId 不匹配或 active=false → expect throw
    });
    it('非法 route 抛 UserInputError（仅允许 R1/R3）', async () => {
        // route='R2' → expect throw（R2 有专属 r2-mark 流程，不走此口）
    });
    it('不传 route/slot 时行为与旧版完全一致（只写 buildingId/campusZone）', async () => {
        // 向后兼容：旧调用形态不破坏
    });
});
```

> 执行时照该 spec 文件既有 mock 结构落地以上 5 例（repo 挂 findOne/find、orderService 挂 updateCustomFields spy）。

- [ ] **Step 2: 运行确认失败**

Run: `cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run src/campus-config.service.spec.ts`
Expected: FAIL（新参数被忽略/断言不满足）

- [ ] **Step 3: 实现 service**（`campus-config.service.ts` 的 `setDeliveryTarget` 替换为）

```ts
    /** C 端选楼/选区/选路线/选时段写入 activeOrder。
     * route/slot 可选（向后兼容 plan2 旧调用形态）；route 仅 R1/R3，R2 走 r2-mark 专属流程。 */
    async setDeliveryTarget(
        ctx: RequestContext,
        zoneId: number,
        buildingId: number,
        route?: 'R1' | 'R3',
        slotId?: number,
    ) {
        const zone = await this.dataSource.getRepository(CampusZone).findOne({ where: { id: zoneId as any } });
        if (!zone) throw new UserInputError('分区不存在');
        const building = await this.dataSource
            .getRepository(CampusBuilding)
            .findOne({ where: { id: buildingId as any } });
        if (!building) throw new UserInputError('宿舍楼不存在');
        if (route && route !== 'R1' && route !== 'R3') throw new UserInputError('配送路线不合法');
        const fields: Record<string, string> = {
            buildingId: String(buildingId),
            campusZone: zone.name,
        };
        if (route) fields.fulfillmentRoute = route;
        if (slotId != null) {
            const slot = await this.dataSource.getRepository(DeliverySlot).findOne({ where: { id: slotId as any } });
            if (!slot || !slot.active || Number(slot.channelId) !== Number(ctx.channelId)) {
                throw new UserInputError('时段不可用');
            }
            if (slot.lockedCount >= slot.capacity) throw new UserInputError('该时段已满');
            fields.deliverySlotId = String(slotId);
            fields.deliverySlotText = `${slot.slotDate} ${slot.startTime}-${slot.endTime}`;
        }
        const orderId = ctx.session?.activeOrderId;
        if (!orderId) throw new UserInputError('购物车为空');
        return this.orderService.updateCustomFields(ctx, orderId, fields);
    }
```

import 区补 `DeliverySlot`（同实体目录相对导入）。

- [ ] **Step 4: resolver 透传**（`hall-shop.resolver.ts` 的 `campusSetDeliveryTarget` 替换为）

```ts
    @Mutation()
    async campusSetDeliveryTarget(
        @Ctx() ctx: RequestContext,
        @Args('zoneId') zoneId: ID,
        @Args('buildingId') buildingId: ID,
        @Args({ name: 'route', type: () => String, nullable: true }) route?: 'R1' | 'R3',
        @Args({ name: 'slotId', type: () => Int, nullable: true }) slotId?: number,
    ) {
        return this.config.setDeliveryTarget(ctx, Number(zoneId), Number(buildingId), route, slotId);
    }
```

import 区补 `Int`（合并进既有 `@nestjs/graphql` import）。

- [ ] **Step 5: 运行确认通过 + 全量插件测试**

Run: `npx vitest --config vitest.config.mts --run`
Expected: 全绿（确认未破坏既有用例）

- [ ] **Step 6: Commit**

```bash
git add src/campus-config.service.ts src/hall-shop.resolver.ts src/campus-config.service.spec.ts
git commit -m "feat(campus): setDeliveryTarget 扩展 route/slotId（补 C 端时段+路线写入路径）"
```

> 注意：本 Task 与 Task 5 的先后不强制；若 Task 5 已部署，本 Task 完成后**重跑 Task 5 的 Step 1-4**（build lib → dist 重编 → 提交 → 部署），冒烟脚本补一条 setDeliveryTarget 带 route/slot 的调用验证。

---

## Self-Review 结论

- Spec §7 五项缺口的对应：#1→Task 2，#2→实测已存在（header 修正），#3→C 端轮询 order + Task 3 组合覆盖，#4→Task 4，#5→纯前端只读（Plan 2）
- Spec §12.2 增补 `waimaiPromoText` → Task 1（customFields）+ Task 2（WaimaiStore.promoText）
- spec §4 「送达时段写订单」缺口 → Task 6（route/slotId 写入路径，侦察实证后新增）
- 类型一致性：`transfer(ctx, orderId, photos, note)` 与 resolver 一致；`WaimaiStore` 字段（含 promoText）与冒烟脚本 GraphQL 字段一致；Task 6 签名 `setDeliveryTarget(ctx, zoneId, buildingId, route?, slotId?)` 与 resolver 透传一致
- 无占位符；所有命令含预期结果
