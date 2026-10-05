# 校园配送 实施计划 3/3：时段容量 + T0-T4 降级阶梯 + 自动派单 + R5/R2 完整落地

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 spec §5 DeliverySlot 时段容量、§11 T0-T4 无人接单降级阶梯（含自动强派 job 与调度看板）、R5 跑腿单完整下单链路与 R2 联动标记，补齐 campus-delivery-plugin 后端全部剩余能力。

**Architecture:** 全部工作在既有 `campus-delivery-plugin` 内增量完成：新实体 DeliverySlot/RiderCreditLog 走既有幂等迁移机制（`create-campus-tables.ts` 扩展）；自动派/超时退款用插件内 `setInterval` 扫描 job（pm2 单实例，DB 乐观锁防重，不引入 JobQueueStrategy 新依赖）；T4 退款用 vendure 原生 `RefundService`（after-sales `createRequest` 有用户归属校验与状态窗限制，系统代发起走不通，已实测确认）；跑腿小费用系统上下文 `surchargeService.addSurcharge` 计入支付金额，跑腿运费用新 `campusErrandCalculator`（非 errand 单返回 undefined 交回后续 calculator，不影响 plan2 已接的区域运费）。

**Tech Stack:** Vendure 3.6.4、TypeORM、GraphQL code-first schema（手写 gql 字符串）、Vitest。金额一律「分」；时间一律「分钟」。

**与 Plan 2 的解耦约定:** Plan 2（C 端 pkg-campus + 骑手端 pkg-rider 页面）正在另一会话执行。本计划纯后端；文末「前端接口契约」章节列出全部新增 GraphQL 操作，供 Plan 2/前端联动对接。**Task 0 必须先做现状对齐检查**：若 Plan 2 会话已自建了 errand 下单等接口契约，以先落地的契约为准，本计划对应 Task 改为对齐验收而非新写。

**仓库工作流**（见 `e:\zhao\vendure\AGENTS.md`）：lib 编译产物入库、服务器零构建、禁止服务器 npm build；commit 直接进 master。

**执行前必读——已实证的仓库事实：**
- customFields 是 TypeORM **embedded** 结构：实体访问 `order.customFields.hallStatus`，PG 物理列 `customFieldsHallstatus`（驼峰保留、无下划线）。**QueryBuilder 字符串路径必须写 `order.customFields.hallStatus`，裸列 `order.hallStatus` 在 PG 不存在**。凡本计划出现物理列名的地方，执行时先 `\d "order"` 核实（生产 PG 容器 `1Panel-postgresql-pIe0`）。
- vendure 插件 resolver 若无 `@Allow` 装饰器，AuthGuard 完全放行——**新增 admin resolver 每个方法必须显式 `@Allow`**。
- 实体 ID 关联列必须显式 `@Column('int')`，裸 `@Column()` 推断为 Object 会 crash-loop（本地 sqlite 测不出）。
- plan1 已有代码：`HallService`（入厅）、`HallGrabService`（事务+悲观锁抢单）、`RiderTaskService`（start/deliver/reportException + calcEarning）、`RiderService`（assertApprovedRider 门槛 CREDIT_LIMIT=60）、`CampusConfigService`。delivery-plugin 提供的 Order customFields：`deliveryStaffId/deliveryStatus/assignedAt/deliveredAt/deliveryPhotos/deliveryNote/exceptionType/exceptionNote/exceptionPhotos`（骑手段状态全复用这套，不新增）。
- 复用接口签名（已核实）：
  - `coupon.service.ts: grantCoupon(ctx: RequestContext, templateId: ID, customerIds: ID[]): Promise<string[]>`（T4 补偿券）
  - `subscribe-message.service.ts: sendCustomMessage(...)`（T0 入厅提醒，失败必须 try-catch 不阻塞入厅）
  - after-sales: `processRefund(ctx, id)` / `retryRefund(ctx, id)`（T4 降级人工路径）
  - vendure 原生：`RefundService.createRefund(ctx, input, lines, options)` + `settleRefund(ctx, refundId)`、`OrderService.transitionToState(ctx, orderId, state)`、`SurchargeService.addSurcharge(ctx, orderId, input)`、`RequestContextService.generate({ apiType: 'admin' })`

---

### Task 0: 现状对齐检查（防与 Plan 2 冲突）

**Files:** 无代码改动，只侦察。

- [ ] **Step 1: 查 Plan 2 是否已有文档/提交**

```bash
ls e:\zhao\vshop\docs\superpowers\plans\ | findstr plan2
cd e:\zhao\vendure && git log --oneline -15
cd e:\zhao\vshop && git log --oneline -15
```

Expected: 若存在 plan2 文档或 plan2 相关 commit（关键词 pkg-rider / pkg-campus / errand），通读其接口契约部分。

- [ ] **Step 2: grep Plan 2 前端已调用的 campus API**

```bash
cd e:\zhao\vshop && grep -rn "campusErrandOrder\|errandOrder\|campusSlots\|deliverySlot\|campusRiderOnline\|campusRejectAssignment" src/ --include="*.vue" --include="*.js" --include="*.ts" -l
```

Expected: 列出 Plan 2 前端已依赖的接口名。若出现本计划未定义的名字（如 `campusCreateErrandOrder` 拼写不同），记录差异清单，后续 Task 中 **接口名以 Plan 2 前端实际调用为准**（改本计划的 mutation 名或在前端侧适配，二选一，在对应 Task 的对齐步骤中处理）。

- [ ] **Step 3: 输出对齐结论**（写入最终 commit message 或 PR 描述）：Plan 2 已定契约 X 个、冲突 Y 个、本计划按 Z 调整。

---

### Task 1: 配置扩展 + customFields 补齐 + 迁移扩展

**Files:**
- Modify: `packages/campus-delivery-plugin/src/campus-fulfillment-config.entity.ts`
- Modify: `packages/campus-delivery-plugin/src/custom-fields.ts`
- Modify: `packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts`
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（admin schema 的 CampusFulfillmentConfig type）
- Create: `packages/campus-delivery-plugin/src/delivery-slot.entity.ts`
- Create: `packages/campus-delivery-plugin/src/rider-credit-log.entity.ts`

- [ ] **Step 1: 新实体**

```ts
// delivery-slot.entity.ts
import { Column, Entity } from 'typeorm';
import { ChannelAware, DeepPartial, ID, VendureEntity } from '@vendure/core';

@Entity()
export class DeliverySlot extends VendureEntity implements ChannelAware {
    [key: string]: any;
    @Column({ type: 'date' }) slotDate: string;          // '2026-10-06'
    @Column() startTime: string;                          // '11:00'
    @Column() endTime: string;                            // '11:30'
    @Column({ nullable: true }) zoneId: ID;               // null=全分区通用
    @Column({ type: 'int', default: 20 }) capacity: number;
    @Column({ type: 'int', default: 0 }) lockedCount: number; // 已锁位数量
    @Column({ default: true }) active: boolean;
    @Column() channelId: ID;
    constructor(input?: DeepPartial<DeliverySlot>) { super(input); }
}
```

```ts
// rider-credit-log.entity.ts
import { Column, Entity } from 'typeorm';
import { ChannelAware, DeepPartial, ID, VendureEntity } from '@vendure/core';

@Entity()
export class RiderCreditLog extends VendureEntity implements ChannelAware {
    [key: string]: any;
    @Column('int') customerId: number;
    @Column({ type: 'int' }) delta: number;   // 正=加分 负=扣分
    @Column() reason: string;                  // reject_assign / timeout_not_picked / complete
    @Column({ nullable: true }) orderId: ID;
    @Column() channelId: ID;
    constructor(input?: DeepPartial<RiderCreditLog>) { super(input); }
}
```

- [ ] **Step 2: CampusFulfillmentConfig 加 3 列**

在既有类中追加：

```ts
    @Column({ type: 'int', default: 30 }) autoRefundMinutes: number;   // T4 终态
    @Column({ type: 'int', default: 45 }) inProgressSlaMinutes: number; // T3 SLA 告警
    @Column({ type: 'varchar', nullable: true }) compensationCouponTemplateId: string; // T4 补偿券模板
```

- [ ] **Step 3: customFields 补齐（spec §5 剩余字段）**

`custom-fields.ts` Order 数组追加：

```ts
        { name: 'deliverySlotId', type: 'string', nullable: true },  // ID 存 string，与 customFields 类型系统一致
        { name: 'deliverySlotText', type: 'string', nullable: true }, // '2026-10-06 11:00-11:30'
        { name: 'errandKind', type: 'string', nullable: true },       // pickup_express / bring_food / buy / other
        { name: 'errandFrom', type: 'string', nullable: true },
        { name: 'errandTo', type: 'string', nullable: true },
        { name: 'leg1Status', type: 'string', nullable: true },       // R2: preparing / arrived_gate
        { name: 'handoverAt', type: 'datetime', nullable: true },     // R2 到校时间
        { name: 'campusCause', type: 'string', nullable: true },      // 对账标记: slot_full / no_rider
```

Customer 数组追加：

```ts
        { name: 'riderOnlineAt', type: 'datetime', nullable: true }, // 心跳时间戳，「在线」= approved && 5min 内有心跳
```

- [ ] **Step 4: 迁移扩展（幂等）**

`create-campus-tables.ts` 的 SQL 模板字符串**末尾**追加（与既有 4 表同一常量、同一执行机制，IF NOT EXISTS 幂等）：

```sql
CREATE TABLE IF NOT EXISTS delivery_slot (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  "slotDate" date NOT NULL, "startTime" varchar(255) NOT NULL, "endTime" varchar(255) NOT NULL,
  "zoneId" int, capacity int NOT NULL DEFAULT 20, "lockedCount" int NOT NULL DEFAULT 0,
  active boolean DEFAULT true, "channelId" int NOT NULL);
CREATE TABLE IF NOT EXISTS rider_credit_log (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  "customerId" int NOT NULL, delta int NOT NULL, reason varchar(255) NOT NULL,
  "orderId" int, "channelId" int NOT NULL);
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "autoRefundMinutes" int DEFAULT 30;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "inProgressSlaMinutes" int DEFAULT 45;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "compensationCouponTemplateId" varchar(255);
```

- [ ] **Step 5: plugin 注册 + admin schema**

`campus-delivery.plugin.ts`：`entities` 数组追加 `DeliverySlot, RiderCreditLog`。

admin schema 的 `type CampusFulfillmentConfig` 追加三行（保持手写 gql 与实体一致）：

```graphql
    autoRefundMinutes: Int!
    inProgressSlaMinutes: Int!
    compensationCouponTemplateId: String
```

`input CampusFulfillmentConfigInput` 追加：

```graphql
    autoRefundMinutes: Int
    inProgressSlaMinutes: Int
    compensationCouponTemplateId: String
```

（`CampusConfigService.updateConfig` 用 Object.assign 补丁式更新，无需改 service。）

- [ ] **Step 6: 构建 + 测试 + Commit**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): DeliverySlot/RiderCreditLog 实体 + customFields 补齐 + 迁移扩展"
```

Expected: build 无错、既有测试全绿。

---

### Task 2: DeliverySlot admin CRUD + shop 余量查询

**Files:**
- Modify: `packages/campus-delivery-plugin/src/campus-config.service.ts`
- Modify: `packages/campus-delivery-plugin/src/campus-config-admin.resolver.ts`
- Modify: `packages/campus-delivery-plugin/src/hall-shop.resolver.ts`（shop 只读查询挂这里）
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（两处 schema）

- [ ] **Step 1: 先写失败测试**

Create `packages/campus-delivery-plugin/src/campus-config.service.spec.ts` 中**追加** describe（沿用该文件既有 mock 风格）：

```ts
describe('CampusConfigService slots', () => {
    const mkRepo = (slots: any[]) => ({
        find: vi.fn().mockResolvedValue(slots),
        findOne: vi.fn(),
        save: vi.fn().mockImplementation(v => Promise.resolve({ id: 1, ...v })),
        createQueryBuilder: vi.fn(),
    });
    it('slotsForShop 只返回 active 且余量>0', async () => {
        const repo = mkRepo([
            { id: 1, active: true, capacity: 20, lockedCount: 20 },
            { id: 2, active: true, capacity: 20, lockedCount: 5 },
            { id: 3, active: false, capacity: 20, lockedCount: 0 },
        ]);
        const svc = new CampusConfigService({ getRepository: () => repo } as any);
        const out = await svc.slotsForShop({ channelId: 1 } as any);
        expect(out.map((s: any) => s.id)).toEqual([2]);
        expect(out[0].remaining).toBe(15);
    });
    it('createSlot 落 channelId', async () => {
        const repo = mkRepo([]);
        const svc = new CampusConfigService({ getRepository: () => repo } as any);
        await svc.createSlot({ channelId: 7 } as any, { slotDate: '2026-10-06', startTime: '11:00', endTime: '11:30', capacity: 30 });
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ channelId: 7, capacity: 30 }));
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run src/campus-config.service.spec.ts
```

Expected: FAIL `slotsForShop is not a function`。

- [ ] **Step 3: 实现 service**

`campus-config.service.ts` 追加方法：

```ts
    async createSlot(ctx: RequestContext, input: { slotDate: string; startTime: string; endTime: string; zoneId?: number; capacity?: number }) {
        return this.dataSource.getRepository(DeliverySlot).save({
            slotDate: input.slotDate,
            startTime: input.startTime,
            endTime: input.endTime,
            zoneId: input.zoneId ?? null,
            capacity: input.capacity ?? 20,
            active: true,
            channelId: ctx.channelId,
        } as any);
    }

    async updateSlot(ctx: RequestContext, id: number, patch: { capacity?: number; active?: boolean; startTime?: string; endTime?: string }) {
        const repo = this.dataSource.getRepository(DeliverySlot);
        const slot = await repo.findOne({ where: { id: id as any } });
        if (!slot) throw new UserInputError('时段不存在');
        Object.assign(slot, patch);
        return repo.save(slot);
    }

    async listSlots(ctx: RequestContext) {
        return this.dataSource.getRepository(DeliverySlot).find({
            where: { channelId: ctx.channelId as any },
            order: { slotDate: 'ASC', startTime: 'ASC' },
        });
    }

    /** C 端可订时段：active 且未过期，带余量 */
    async slotsForShop(ctx: RequestContext) {
        const slots = await this.dataSource.getRepository(DeliverySlot).find({
            where: { channelId: ctx.channelId as any, active: true },
            order: { slotDate: 'ASC', startTime: 'ASC' },
        });
        const today = new Date().toISOString().slice(0, 10);
        return slots
            .filter(s => s.slotDate >= today)
            .map(s => ({ ...s, remaining: Math.max(0, s.capacity - s.lockedCount) }))
            .filter(s => s.remaining > 0);
    }
```

（文件头部补 import：`import { UserInputError } from '@vendure/core';`、`import { DeliverySlot } from './delivery-slot.entity';`。）

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest --config vitest.config.mts --run src/campus-config.service.spec.ts
```

Expected: PASS（新 2 条 + 既有全绿）。

- [ ] **Step 5: resolver 与 schema**

`campus-config-admin.resolver.ts` 追加（**每个方法显式 @Allow**）：

```ts
    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusCreateSlot(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.config.createSlot(ctx, input);
    }

    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusUpdateSlot(@Ctx() ctx: RequestContext, @Args('id') id: number, @Args('input') input: any) {
        return this.config.updateSlot(ctx, id, input);
    }

    @Query()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusSlots(@Ctx() ctx: RequestContext) {
        return this.config.listSlots(ctx);
    }
```

`hall-shop.resolver.ts` 追加 shop Query（公开只读，选时段前预检）：

```ts
    @Query()
    async campusShopSlots(@Ctx() ctx: RequestContext) {
        return this.config.slotsForShop(ctx);
    }
```

（HallShopResolver 构造器注入 `private config: CampusConfigService`，文件头补 import。）

`campus-delivery.plugin.ts` 两处 schema：

admin schema 追加：

```graphql
    type DeliverySlot {
        id: ID!
        slotDate: String!
        startTime: String!
        endTime: String!
        zoneId: ID
        capacity: Int!
        lockedCount: Int!
        active: Boolean!
        channelId: ID!
    }

    input DeliverySlotInput {
        slotDate: String!
        startTime: String!
        endTime: String!
        zoneId: ID
        capacity: Int
    }

    input DeliverySlotUpdateInput {
        startTime: String
        endTime: String
        capacity: Int
        active: Boolean
    }
```

admin `extend type Mutation` 追加：

```graphql
    campusCreateSlot(input: DeliverySlotInput!): DeliverySlot!
    campusUpdateSlot(id: ID!, input: DeliverySlotUpdateInput!): DeliverySlot!
```

admin `extend type Query` 追加：

```graphql
    campusSlots: [DeliverySlot!]!
```

shop schema 追加（shop 是独立 schema，type 需重复定义）：

```graphql
    type DeliverySlot {
        id: ID!
        slotDate: String!
        startTime: String!
        endTime: String!
        zoneId: ID
        capacity: Int!
        lockedCount: Int!
        active: Boolean!
        channelId: ID!
    }
```

shop `extend type Query` 追加：

```graphql
    campusShopSlots: [DeliverySlot!]!
```

resolver 注册检查：CampusConfigAdminResolver 已在 admin resolvers 数组；HallShopResolver 已在 shop resolvers 数组（无需改 plugin resolvers 行）。

- [ ] **Step 7: Task 0 对齐结论落地——补 plan2 依赖的 2 个后端缺口**

Task 0 实际侦察结论（2026-10-05）：plan2 前端契约与 plan3 零冲突（plan2 未涉及 errand/slot）；但 plan2 前端已调用 2 个 plan1 未实现的后端接口，本步补齐：

1. `campusSetDeliveryTarget(zoneId: ID!, buildingId: ID!): Order!`（shop mutation，plan2 checkout 选楼用）
2. `myRiderEarnings(skip: Int, take: Int): [RiderEarning!]!`（shop query，plan2 骑手收入页用）

实现：

`campus-config.service.ts` 追加：

```ts
    /** C 端选楼/选区写入 activeOrder（plan2 campusSetDeliveryTarget 依赖） */
    async setDeliveryTarget(ctx: RequestContext, zoneId: number, buildingId: number) {
        const zone = await this.dataSource.getRepository(CampusZone).findOne({ where: { id: zoneId as any } });
        if (!zone) throw new UserInputError('分区不存在');
        const building = await this.dataSource.getRepository(CampusBuilding).findOne({ where: { id: buildingId as any } });
        if (!building) throw new UserInputError('宿舍楼不存在');
        const orderId = (ctx as any).activeOrderId;
        if (!orderId) throw new UserInputError('购物车为空');
        return this.dataSource.query(
            `UPDATE "order" SET "customFieldsBuildingid" = $2, "customFieldsCampuszone" = $3, "updatedAt" = now() WHERE id = $1`,
            [orderId, String(buildingId), zone.name],
        ).then(() => this.dataSource.query(`SELECT * FROM "order" WHERE id = $1`, [orderId]).then((r: any) => r[0]));
    }
```

> **注意**：上面裸 SQL 物理列名 `customFieldsBuildingid`/`customFieldsCampuszone` 是按 embedded 命名规则推测——**执行时先在生产 PG `\d "order"` 核实**，或改用 vendure `OrderService.setOrderCustomFields(ctx, orderId, { buildingId: String(buildingId), campusZone: zone.name })`（优先这条路线，注入 OrderService；计划中的裸 SQL 仅是 fallback）。

`hall-shop.resolver.ts` 追加：

```ts
    @Mutation()
    async campusSetDeliveryTarget(@Ctx() ctx: RequestContext, @Args('zoneId') zoneId: ID, @Args('buildingId') buildingId: ID) {
        return this.config.setDeliveryTarget(ctx, zoneId as any, buildingId as any);
    }

    @Query()
    async myRiderEarnings(@Ctx() ctx: RequestContext, @Args('skip', { nullable: true }) skip?: number, @Args('take', { nullable: true }) take?: number) {
        const rider = await this.riderService.assertApprovedRider(ctx);
        const qb = this.connection.getRepository(ctx, RiderEarning).createQueryBuilder('earning')
            .where('earning.riderCustomerId = :id', { id: rider.id })
            .orderBy('earning.createdAt', 'DESC')
            .skip(skip ?? 0)
            .take(take ?? 20);
        return qb.getMany();
    }
```

（HallShopResolver 构造器注入补 `riderService` 与 `connection: TransactionalConnection`；import `RiderEarning`。）

shop schema 追加：

```graphql
    type RiderEarning {
        id: ID!
        orderId: ID!
        riderCustomerId: ID!
        amount: Int!
        tip: Int!
        status: String!
        createdAt: DateTime
        channelId: ID!
    }
```

shop `extend type Mutation` 追加：

```graphql
    campusSetDeliveryTarget(zoneId: ID!, buildingId: ID!): Order!
```

shop `extend type Query` 追加：

```graphql
    myRiderEarnings(skip: Int, take: Int): [RiderEarning!]!
```

（DateTime scalar vendure 内置。）

- [ ] **Step 8: 构建 + 全量测试 + Commit（合并 Step 6）**

```bash
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): DeliverySlot admin CRUD + shop 可订时段查询 + plan2 缺口（setDeliveryTarget/myRiderEarnings）"
```

---

### Task 3: 支付后锁位（乐观锁防超卖）+ slot_full 告警标记

**Files:**
- Modify: `packages/campus-delivery-plugin/src/hall.service.ts`
- Create: `packages/campus-delivery-plugin/src/slot-lock.service.ts`
- Create: `packages/campus-delivery-plugin/src/slot-lock.service.spec.ts`
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（providers）

**设计决策（与 spec §6「下单即锁位」的差异，已定稿）：** 未支付订单占容会被恶意锁死，锁位时机定为 **支付成功（OrderPlacedEvent）**；C 端选时段只写 `deliverySlotText` + `campusShopSlots` 余量实时预检。支付后锁位失败属极端情况：订单不阻断，标 `campusCause='slot_full'` 进调度告警（T3 页面），人工协调相邻时段或退款。

- [ ] **Step 1: 先写失败测试**

```ts
// slot-lock.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { SlotLockService } from './slot-lock.service';

describe('SlotLockService.lock', () => {
    const make = (affected: number, slot: any) => {
        const qb = {
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue({ affected }),
        };
        const slotRepo = { findOne: vi.fn().mockResolvedValue(slot), createQueryBuilder: () => qb };
        const conn = { getRepository: vi.fn((_ctx: any, ent: any) =>
            (ent as any).name === 'DeliverySlot' ? slotRepo : {}) } as any;
        return { svc: new SlotLockService(conn), qb };
    };

    it('余量充足时 affected=1 锁位成功', async () => {
        const { svc, qb } = make(1, { id: 5, capacity: 20, lockedCount: 3 });
        const ok = await svc.lock({ channelId: 1 } as any, { id: '5' } as any);
        expect(ok).toBe(true);
        expect(qb.set).toHaveBeenCalledWith({ lockedCount: expect.anything() });
    });

    it('容量满时 affected=0 返回 false（不抛错）', async () => {
        const { svc } = make(0, { id: 5, capacity: 20, lockedCount: 20 });
        const ok = await svc.lock({ channelId: 1 } as any, { id: '5' } as any);
        expect(ok).toBe(false);
    });

    it('订单未选时段返回 true（跳过）', async () => {
        const { svc } = make(1, null);
        const ok = await svc.lock({ channelId: 1 } as any, null);
        expect(ok).toBe(true);
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/slot-lock.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 SlotLockService**

```ts
// slot-lock.service.ts
import { Injectable, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { Order } from '@vendure/core';
import { DeliverySlot } from './delivery-slot.entity';

@Injectable()
export class SlotLockService {
    constructor(private connection: TransactionalConnection) {}

    /**
     * 支付成功后锁位：UPDATE ... WHERE lockedCount < capacity 乐观锁，affected=0 即满。
     * 返回 false 时调用方标 campusCause='slot_full' 进调度告警，不阻断订单。
     */
    async lock(ctx: RequestContext, order: Order | null): Promise<boolean> {
        const slotId = (order?.customFields as any)?.deliverySlotId;
        if (!slotId) return true; // 未选时段（立即单）跳过
        const slot = await this.connection.getRepository(ctx, DeliverySlot).findOne({ where: { id: slotId as any } });
        if (!slot) {
            Logger.warn(`Order ${order?.code} slot ${slotId} not found, skip lock`, 'CampusSlot');
            return true; // 时段被管理员删除：不阻断，靠 T3 告警人工跟进
        }
        const res = await this.connection.getRepository(ctx, DeliverySlot)
            .createQueryBuilder()
            .update(DeliverySlot)
            .set({ lockedCount: () => '"lockedCount" + 1' })
            .where('id = :id AND "lockedCount" < :cap', { id: slot.id, cap: slot.capacity })
            .execute();
        return (res.affected ?? 0) > 0;
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest --config vitest.config.mts --run src/slot-lock.service.spec.ts
```

Expected: PASS 3 条。

- [ ] **Step 5: 集成进 hall.service（入厅时锁位 + 失败标记）**

`hall.service.ts` 改为：

```ts
import { Injectable } from '@nestjs/common';
import { Logger, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { SlotLockService } from './slot-lock.service';

/**
 * 入厅服务：跑腿单（orderKind='errand'）或路线 R1/R3 的订单在支付后自动进入抢单大厅。
 * 含预约时段锁位（T0 前置）：锁位失败标 campusCause='slot_full'，靠调度告警人工跟进。
 */
@Injectable()
export class HallService {
    constructor(
        private connection: TransactionalConnection,
        private slotLock: SlotLockService,
    ) {}

    async onOrderPlaced(ctx: RequestContext, order: Order) {
        const cf = order.customFields as any;
        if (cf.orderKind === 'errand' || cf.fulfillmentRoute === 'R1' || cf.fulfillmentRoute === 'R3') {
            const locked = await this.slotLock.lock(ctx, order);
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: {
                    hallStatus: 'open',
                    hallEnteredAt: new Date(),
                    ...(locked ? {} : { campusCause: 'slot_full' }),
                },
            } as any);
            Logger.info(
                `Order ${order.code} entered hall (${cf.fulfillmentRoute}, slot=${cf.deliverySlotText ?? 'immediate'}, slotLocked=${locked})`,
                'CampusHall',
            );
        }
    }
}
```

`campus-delivery.plugin.ts`：providers 数组追加 `SlotLockService`（放在 HallService 之前，NestJS 按类型注入无需顺序，但保持可读）。

注意：HallService 构造器签名变了——检查是否有测试直接 `new HallService(...)`，有则同步更新参数。

- [ ] **Step 6: 构建 + 全量测试 + Commit**

```bash
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): 支付后时段锁位（乐观锁防超卖）+ slot_full 告警标记"
```

---

### Task 4: 骑手在线心跳 + T0 运力预检 + 入厅订阅提醒

**Files:**
- Modify: `packages/campus-delivery-plugin/src/rider.service.ts`
- Modify: `packages/campus-delivery-plugin/src/rider-shop.resolver.ts`
- Create: `packages/campus-delivery-plugin/src/capacity.service.ts`
- Create: `packages/campus-delivery-plugin/src/capacity.service.spec.ts`
- Modify: `packages/campus-delivery-plugin/src/hall.service.ts`（入厅提醒）
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（providers + shop schema）

**YAGNI 简化（已定稿）：** 骑手不绑定分区，运力池 = 全渠道在线骑手（spec「按分区匹配」降级为全池匹配 + 分区字段留扩展）。`campusZone` 字段后续接分区过滤时只需在 `listOnlineRiders` 加 where。

- [ ] **Step 1: 先写失败测试**

```ts
// capacity.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { CapacityService } from './capacity.service';

const fiveMin = 5 * 60 * 1000;

describe('CapacityService', () => {
    const mk = (customers: any[], cfg: any = { paused: false }) => {
        const customerRepo = { createQueryBuilder: () => ({
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getMany: vi.fn().mockResolvedValue(customers),
        }) };
        const configRepo = { findOne: vi.fn().mockResolvedValue(cfg) };
        const conn = { getRepository: vi.fn((_ctx: any, ent: any) =>
            (ent as any).name === 'CampusFulfillmentConfig' ? configRepo : customerRepo) } as any;
        return { svc: new CapacityService(conn), customerRepo, configRepo };
    };

    it('在线 = approved 且心跳在 5min 内', async () => {
        const { svc } = mk([
            { id: 1, customFields: { riderStatus: 'approved', riderOnlineAt: new Date(Date.now() - 60_000) } },
            { id: 2, customFields: { riderStatus: 'approved', riderOnlineAt: new Date(Date.now() - fiveMin - 1000) } },
            { id: 3, customFields: { riderStatus: 'suspended', riderOnlineAt: new Date() } },
        ]);
        const riders = await svc.listOnlineRiders({ channelId: 1 } as any);
        expect(riders.map((r: any) => r.id)).toEqual([1]);
    });

    it('capacityCheck：0 骑手时 ridersOnline=0 且 paused 透出', async () => {
        const { svc } = mk([], { paused: true });
        const out = await svc.capacityCheck({ channelId: 1 } as any);
        expect(out).toEqual({ paused: true, ridersOnline: 0 });
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/capacity.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 CapacityService**

```ts
// capacity.service.ts
import { Injectable, RequestContext, TransactionalConnection } from '@vendure/core';
import { Customer } from '@vendure/core';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class CapacityService {
    constructor(private connection: TransactionalConnection) {}

    /** 在线骑手：approved 且 5min 内有心跳。运力池当前不分分区（MVP），后续在此加 where。 */
    async listOnlineRiders(ctx: RequestContext): Promise<Customer[]> {
        const customers = await this.connection.getRepository(ctx, Customer)
            .createQueryBuilder('customer')
            .where("customer.customFields.riderStatus = 'approved'")
            .andWhere('customer.customFields.riderOnlineAt IS NOT NULL')
            .getMany();
        const now = Date.now();
        return customers.filter(c => {
            const at = (c.customFields as any)?.riderOnlineAt;
            return at && now - new Date(at).getTime() <= ONLINE_WINDOW_MS;
        });
    }

    /** T0 预检：C 端下单前提示「运力紧张」 */
    async capacityCheck(ctx: RequestContext): Promise<{ paused: boolean; ridersOnline: number }> {
        const cfg = await this.connection.getRepository(ctx, CampusFulfillmentConfig)
            .findOne({ where: { channelId: ctx.channelId as any } });
        const riders = await this.listOnlineRiders(ctx);
        return { paused: cfg?.paused ?? false, ridersOnline: riders.length };
    }
}
```

> 注意：`customer.customFields.riderStatus` QueryBuilder 字符串路径写法与 plan1 `listApplications` 的 `customer.customFields ->> 'riderStatus'` 不同——**执行时以 plan1 部署实测可用写法为准**：先看 `rider.service.ts` 中 `listApplications` 现在用的哪种（DB 实测已验证过），照抄同款；若为 `->>` 写法则上面 where 改为 `"customer".customFields ->> 'riderStatus' = 'approved'`。

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest --config vitest.config.mts --run src/capacity.service.spec.ts
```

Expected: PASS 2 条。

- [ ] **Step 5: 心跳 mutation + T0 提醒**

`rider.service.ts` 追加：

```ts
    /** 骑手上下线开关 + 心跳：大厅轮询页每 15s 调 online=true 即续命 */
    async setOnline(ctx: RequestContext, online: boolean) {
        const customer = await this.customerService.findCurrentUser(ctx);
        if (!customer) throw new ForbiddenError();
        await this.connection.getRepository(ctx, Customer).update(customer.id, {
            customFields: { riderOnlineAt: online ? new Date() : null },
        } as any);
        return { online };
    }
```

`capacity.service.ts` 追加（依赖 RiderService 的 assertApprovedRider 门槛，构造器注入）：

```ts
    constructor(
        private connection: TransactionalConnection,
        private riderService: RiderService,
    ) {}

    /** 心跳（带骑手资格校验的封装）：骑手端 30s 定时调 */
    async heartbeat(ctx: RequestContext) {
        const rider = await this.riderService.assertApprovedRider(ctx);
        await this.connection.getRepository(ctx, Customer).update(rider.id, {
            customFields: { riderOnlineAt: new Date() },
        } as any);
        return { online: true };
    }
```

（capacity.service.spec 的 mk() 需补 riderService mock：`new CapacityService(conn, { assertApprovedRider: vi.fn().mockResolvedValue({ id: 9 }) } as any)`，同步更新。）

`rider-shop.resolver.ts` 追加：

```ts
    @Mutation()
    async campusRiderOnline(@Ctx() ctx: RequestContext, @Args('online') online: boolean) {
        return this.riderService.setOnline(ctx, online);
    }

    @Mutation()
    async campusRiderHeartbeat(@Ctx() ctx: RequestContext) {
        return this.capacity.heartbeat(ctx);
    }

    @Query()
    async campusCapacityCheck(@Ctx() ctx: RequestContext) {
        return this.capacity.capacityCheck(ctx);
    }
```

（RiderShopResolver 构造器注入 `private capacity: CapacityService`。）

`hall.service.ts` 入厅末尾追加 T0 提醒（失败不阻塞）：

```ts
            // T0: 新单入厅即提醒在线骑手（订阅消息），失败只记日志
            try {
                const msg = this.injector.get(SubscribeMessageService);
                const riders = await this.capacity.listOnlineRiders(ctx);
                for (const r of riders) {
                    await msg.sendCustomMessage(ctx, r.id as any, {
                        templateKey: 'campus_new_order',
                        data: { orderCode: order.code, zone: (order.customFields as any).campusZone ?? '' },
                    } as any);
                }
            } catch (e: any) {
                Logger.warn(`rider notify failed: ${e?.message}`, 'CampusHall');
            }
```

HallService 需拿 injector：改为构造器注入 `private injector: Injector`（`import { Injector } from '@nestjs/common'`），plugin providers 追加 `CapacityService`；`SubscribeMessageService` 从 wechat-subscribe-message-plugin 导入（执行时先 `grep -n "export class SubscribeMessageService" e:\zhao\vendure\packages\wechat-subscribe-message-plugin\src\subscribe-message.service.ts` + 查 plugin.ts 是否 `export`，确认 `sendCustomMessage` 精确参数签名后**按真实签名调用**，上面 `{ templateKey, data }` 形状以真实签名为准——这是本 Task 唯一需要现场对齐的点）。

shop schema `extend type Mutation` 追加：

```graphql
    campusRiderOnline(online: Boolean!): CampusRiderOnlineResult!
    campusRiderHeartbeat: CampusRiderOnlineResult!
```

`extend type Query` 追加：

```graphql
    campusCapacityCheck: CampusCapacityCheck!
```

并定义：

```graphql
    type CampusRiderOnlineResult { online: Boolean! }
    type CampusCapacityCheck { paused: Boolean! ridersOnline: Int! }
```

- [ ] **Step 6: 构建 + 全量测试 + Commit**

```bash
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): 骑手在线心跳 + T0 运力预检 + 入厅订阅提醒"
```

---

### Task 5: 骑手信用分体系

**Files:**
- Create: `packages/campus-delivery-plugin/src/rider-credit.service.ts`
- Create: `packages/campus-delivery-plugin/src/rider-credit.service.spec.ts`
- Modify: `packages/campus-delivery-plugin/src/rider-task.service.ts`（完单加分）
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（providers）

**扣分规则（定稿常量）：** 拒绝强派 -5（`reject_assign`）、接单 15min 未取货被自动改派 -10（`timeout_not_picked`）、正常完单 +2（`complete`）。低于 60 派单时跳过（Task 6 用）。

- [ ] **Step 1: 先写失败测试**

```ts
// rider-credit.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { RiderCreditService } from './rider-credit.service';

describe('RiderCreditService.adjust', () => {
    const mk = (credit: number) => {
        const saved: any[] = [];
        const customerRepo = {
            update: vi.fn().mockResolvedValue({}),
        };
        const logRepo = { save: vi.fn().mockImplementation(v => { saved.push(v); return Promise.resolve(v); }) };
        const conn = { getRepository: vi.fn((_ctx: any, ent: any) =>
            (ent as any).name === 'RiderCreditLog' ? logRepo : customerRepo) } as any;
        // findOne 返回带 customFields 的 customer（模拟连接池直读）
        (conn as any).rawConnection = { transaction: (fn: any) => fn({
            getRepository: () => ({ findOne: vi.fn().mockResolvedValue({ id: 9, customFields: { riderCredit: credit } }) }),
        }) };
        return { svc: new RiderCreditService(conn), customerRepo, logRepo, saved };
    };

    it('正常完单 +2', async () => {
        const { svc, customerRepo, saved } = mk(100);
        await svc.adjust({ channelId: 1 } as any, 9, 2, 'complete', 10 as any);
        expect(customerRepo.update).toHaveBeenCalledWith(9, expect.objectContaining({
            customFields: { riderCredit: 102 },
        }));
        expect(saved[0]).toEqual(expect.objectContaining({ delta: 2, reason: 'complete', orderId: 10 }));
    });

    it('拒单 -5', async () => {
        const { svc, customerRepo } = mk(100);
        await svc.adjust({ channelId: 1 } as any, 9, -5, 'reject_assign');
        expect(customerRepo.update).toHaveBeenCalledWith(9, expect.objectContaining({
            customFields: { riderCredit: 95 },
        }));
    });

    it('扣到 0 为下限', async () => {
        const { svc, customerRepo } = mk(3);
        await svc.adjust({ channelId: 1 } as any, 9, -10, 'timeout_not_picked');
        expect(customerRepo.update).toHaveBeenCalledWith(9, expect.objectContaining({
            customFields: { riderCredit: 0 },
        }));
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/rider-credit.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// rider-credit.service.ts
import { Injectable, RequestContext, TransactionalConnection } from '@vendure/core';
import { Customer } from '@vendure/core';
import { RiderCreditLog } from './rider-credit-log.entity';

export const CREDIT_COMPLETE = 2;
export const CREDIT_REJECT = -5;
export const CREDIT_TIMEOUT = -10;
export const CREDIT_LIMIT = 60;

@Injectable()
export class RiderCreditService {
    constructor(private connection: TransactionalConnection) {}

    /** 加减分 + 流水。下限 0。 */
    async adjust(ctx: RequestContext, customerId: number, delta: number, reason: string, orderId?: number) {
        const customer = await this.connection.getRepository(ctx, Customer).findOne({ where: { id: customerId as any } });
        const current = (customer?.customFields as any)?.riderCredit ?? 100;
        const next = Math.max(0, current + delta);
        await this.connection.getRepository(ctx, Customer).update(customerId, {
            customFields: { riderCredit: next },
        } as any);
        await this.connection.getRepository(ctx, RiderCreditLog).save({
            customerId, delta, reason, orderId: orderId ?? null, channelId: ctx.channelId,
        } as any);
        return next;
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest --config vitest.config.mts --run src/rider-credit.service.spec.ts
```

Expected: PASS 3 条。

- [ ] **Step 5: 完单加分 hook**

`rider-task.service.ts` 的 `deliver` 方法中，`port.addBalance` 之后追加：

```ts
        await this.credit.adjust(ctx, rider.id as any, CREDIT_COMPLETE, 'complete', order.id as any);
```

构造器追加 `private credit: RiderCreditService`，文件头补 import。注意：`rider-task.service.spec.ts` 中所有 `new RiderTaskService(conn, riderSvc)` 需补第三参 `{ adjust: vi.fn().mockResolvedValue(102) } as any`。

plugin providers 追加 `RiderCreditService`。

- [ ] **Step 6: 构建 + 全量测试 + Commit**

```bash
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): 骑手信用分体系（adjust + 流水 + 完单加分）"
```

---

### Task 6: T1 加急置顶 + T2 自动强派 job + 拒单回大厅

**Files:**
- Modify: `packages/campus-delivery-plugin/src/hall-grab.service.ts`（hall 排序）
- Create: `packages/campus-delivery-plugin/src/dispatch-job.service.ts`
- Create: `packages/campus-delivery-plugin/src/dispatch-job.service.spec.ts`
- Modify: `packages/campus-delivery-plugin/src/hall-shop.resolver.ts`（拒单 mutation）
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（providers + shop schema + 生命周期）

**设计决策（定稿）：** job 用插件内 `setInterval`（60s）而非 JobQueueStrategy——pm2 单实例 vendure、扫描动作幂等（事务+悲观锁与 plan1 grab 同款，双跑只会有一个成功），不引入新基础设施。`OnApplicationShutdown` 清理 timer。

- [ ] **Step 1: 先写失败测试**

```ts
// dispatch-job.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { DispatchJobService } from './dispatch-job.service';

function makeEnv(opts: {
    openOrders?: any[];
    assignedOrders?: any[];
    onlineRiders?: any[];
    cfg?: any;
}) {
    const grabResults: any[] = [];
    const grabSvc = {
        grabByRider: vi.fn().mockImplementation((_ctx: any, orderId: any, rider: any) => {
            grabResults.push({ orderId, riderId: rider.id });
            return Promise.resolve({ id: orderId });
        }),
    };
    const creditSvc = { adjust: vi.fn().mockResolvedValue(95) };
    const hallSvc = {
        backToHall: vi.fn().mockResolvedValue({}),
        updateOrder: vi.fn().mockResolvedValue({}),
    };
    const capacitySvc = { listOnlineRiders: vi.fn().mockResolvedValue(opts.onlineRiders ?? []) };
    const orderRepo = {
        findOne: vi.fn(),
        createQueryBuilder: () => ({
            where: vi.fn().mockReturnThis(),
            getMany: vi.fn().mockResolvedValue([...(opts.openOrders ?? []), ...(opts.assignedOrders ?? [])]),
        }),
    };
    const configRepo = { findOne: vi.fn().mockResolvedValue(opts.cfg ?? { autoAssignMinutes: 10, autoRefundMinutes: 30, inProgressSlaMinutes: 45 }) };
    const conn = {
        getRepository: vi.fn((_ctx: any, ent: any) => {
            const name = (ent as any).name;
            if (name === 'CampusFulfillmentConfig') return configRepo;
            return orderRepo;
        }),
    } as any;
    const svc = new DispatchJobService(conn, grabSvc, hallSvc, capacitySvc, creditSvc);
    return { svc, grabSvc, creditSvc, hallSvc, capacitySvc, orderRepo, configRepo, grabResults };
}

const now = Date.now();
const minAgo = (m: number) => new Date(now - m * 60_000);

describe('DispatchJobService.scan', () => {
    it('open 超 autoAssignMinutes → 强派最佳在线骑手', async () => {
        const { svc, grabSvc, grabResults } = makeEnv({
            openOrders: [{ id: 1, customFields: { hallStatus: 'open', hallEnteredAt: minAgo(11) } }],
            onlineRiders: [
                { id: 7, customFields: { riderOnlineAt: minAgo(1), riderCredit: 100 } },
                { id: 8, customFields: { riderOnlineAt: minAgo(1), riderCredit: 90 } },
            ],
        });
        await svc.scan({ channelId: 1 } as any);
        expect(grabResults[0]).toEqual({ orderId: 1, riderId: 7 }); // 信用分高者优先
        expect(grabSvc.grabByRider).toHaveBeenCalledOnce();
    });

    it('低信用分(<60)骑手不参与强派', async () => {
        const { svc, grabResults } = makeEnv({
            openOrders: [{ id: 1, customFields: { hallStatus: 'open', hallEnteredAt: minAgo(11) } }],
            onlineRiders: [{ id: 7, customFields: { riderOnlineAt: minAgo(1), riderCredit: 59 } }],
        });
        await svc.scan({ channelId: 1 } as any);
        expect(grabResults).toHaveLength(0);
    });

    it('assigned 超 15min 未取货 → 回大厅 + 扣 10 分', async () => {
        const { svc, hallSvc, creditSvc } = makeEnv({
            assignedOrders: [{ id: 2, customFields: { hallStatus: 'grabbed', deliveryStatus: 'assigned', deliveryStaffId: '9', assignedAt: minAgo(16), hallEnteredAt: minAgo(20) } }],
        });
        await svc.scan({ channelId: 1 } as any);
        expect(hallSvc.backToHall).toHaveBeenCalledWith(expect.anything(), 2);
        expect(creditSvc.adjust).toHaveBeenCalledWith(expect.anything(), 9, -10, 'timeout_not_picked', 2);
    });

    it('assigned 未超 15min 不动', async () => {
        const { svc, hallSvc } = makeEnv({
            assignedOrders: [{ id: 2, customFields: { hallStatus: 'grabbed', deliveryStatus: 'assigned', deliveryStaffId: '9', assignedAt: minAgo(5), hallEnteredAt: minAgo(6) } }],
        });
        await svc.scan({ channelId: 1 } as any);
        expect(hallSvc.backToHall).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/dispatch-job.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 DispatchJobService**

```ts
// dispatch-job.service.ts
import { Injectable, Logger, OnApplicationShutdown, RequestContext, TransactionalConnection } from '@vendure/core';
import { Order } from '@vendure/core';
import { HallGrabService } from './hall-grab.service';
import { CapacityService } from './capacity.service';
import { RiderCreditService, CREDIT_TIMEOUT } from './rider-credit.service';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';

const NOT_PICKED_TIMEOUT_MIN = 15;

@Injectable()
export class DispatchJobService implements OnApplicationShutdown {
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        private connection: TransactionalConnection,
        private grab: HallGrabService,
        private hall: HallService,
        private capacity: CapacityService,
        private credit: RiderCreditService,
    ) {}

    start(intervalMs = 60_000) {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.tick().catch(e => Logger.error(`dispatch tick: ${e?.message}`, 'CampusDispatch'));
        }, intervalMs);
    }

    onApplicationShutdown() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    private async tick() {
        if (this.running) return; // 上一轮未结束跳过
        this.running = true;
        try {
            const ctx = { channelId: undefined } as any; // 扫描跨渠道：repository 不带 ctx 过滤，按渠道分组处理
            await this.scan(ctx);
        } finally {
            this.running = false;
        }
    }

    /**
     * 扫描：
     * 1) assigned 超 15min 未取货 → 回大厅 + 骑手扣分
     * 2) open 超 autoAssignMinutes → 强派最佳在线骑手（T2）
     * （T4 退款扫描在 Task 8 追加到此方法）
     */
    async scan(ctx: RequestContext) {
        const repo = this.connection.getRepository(ctx, Order);
        const orders = await repo.createQueryBuilder('order')
            .where("order.customFields.hallStatus IN ('open', 'grabbed')")
            .getMany();
        const now = Date.now();

        // 1) assigned 超 15min 未取货 → 回大厅 + 扣分
        for (const o of orders) {
            const cf = o.customFields as any;
            if (cf.hallStatus === 'grabbed' && cf.deliveryStatus === 'assigned' && cf.assignedAt) {
                if (now - new Date(cf.assignedAt).getTime() > NOT_PICKED_TIMEOUT_MIN * 60_000) {
                    await this.hall.backToHall(ctx, o.id as any);
                    await this.credit.adjust(ctx, Number(cf.deliveryStaffId), CREDIT_TIMEOUT, 'timeout_not_picked', o.id as any);
                    Logger.warn(`Order ${o.code} reassigned (rider ${cf.deliveryStaffId} not picked in ${NOT_PICKED_TIMEOUT_MIN}min)`, 'CampusDispatch');
                }
            }
        }

        // 2) T2 强派
        const cfgs = await this.connection.getRepository(ctx, CampusFulfillmentConfig).find();
        for (const cfg of cfgs) {
            const channelCtx = { ...ctx, channelId: cfg.channelId } as any;
            const riders = await this.capacity.listOnlineRiders(channelCtx);
            const eligible = riders
                .filter(r => ((r.customFields as any).riderCredit ?? 100) >= 60)
                .sort((a, b) => {
                    const ca = (a.customFields as any).riderCredit ?? 100;
                    const cb = (b.customFields as any).riderCredit ?? 100;
                    if (cb !== ca) return cb - ca; // 信用分高者优先
                    const ta = new Date((a.customFields as any).riderOnlineAt).getTime();
                    const tb = new Date((b.customFields as any).riderOnlineAt).getTime();
                    return tb - ta; // 最近活跃优先
                });
            if (!eligible.length) continue;
            const stale = orders.filter(o => {
                const cf = o.customFields as any;
                return cf.hallStatus === 'open' && o.channelId === cfg.channelId && cf.hallEnteredAt
                    && now - new Date(cf.hallEnteredAt).getTime() > (cfg.autoAssignMinutes ?? 10) * 60_000;
            }).sort((a, b) => new Date((a.customFields as any).hallEnteredAt).getTime()
                     - new Date((b.customFields as any).hallEnteredAt).getTime());
            for (const o of stale) {
                const ok = await this.grab.grabByRider(channelCtx, o.id as any, eligible[0]);
                if (ok) Logger.warn(`Order ${o.code} auto-assigned to rider ${eligible[0].id} (T2)`, 'CampusDispatch');
                // grabByRider 内部乐观锁失败（已被抢/已退款）返回 false，跳过即可
            }
        }
    }
}
```

> `ctx` 为扫描上下文（非 HTTP 请求），`getRepository(ctx, Order)` 在 ctx 无 session 时也能工作（TransactionalConnection 仅用 ctx.channelId 做隔离时才敏感；执行时若报 ctx 相关错误，改为 `this.connection.rawConnection.getRepository(Order)` 直连仓库并自行带 channelId 条件——spec 已在 plan1 grab 用过 `rawConnection.transaction`，同源可用）。

- [ ] **Step 4: hall-grab.service 追加 grabByRider（服务端强派原语）+ hall.service 追加 backToHall**

`hall-grab.service.ts` 追加（复用既有 grab 的事务+悲观锁模式，骑手身份由调用方给定而非当前登录人）：

```ts
    /** T2/T3 强派原语：hallStatus='open' → 'grabbed'（事务+悲观锁，与 grab 同款防双抢）。
     * 目标骑手须 approved；低信用分在调用方（DispatchJobService）过滤。 */
    async grabByRider(ctx: RequestContext, orderId: ID, rider: { id: number }): Promise<boolean> {
        return this.connection.rawConnection.transaction(async em => {
            const order = await em.getRepository(Order).findOne({
                where: { id: orderId as any },
                lock: { mode: 'pessimistic_write' },
            });
            const cf = order?.customFields as any;
            if (!order || cf?.hallStatus !== 'open') return false;
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: {
                    hallStatus: 'grabbed',
                    deliveryStaffId: String(rider.id),
                    deliveryStatus: 'assigned',
                    assignedAt: new Date(),
                },
            } as any);
            return true;
        });
    }
```

`hall.service.ts` 追加：

```ts
    /** 回大厅：清骑手指派字段，hallStatus 复位 open（拒单/超时改派共用） */
    async backToHall(ctx: RequestContext, orderId: number) {
        await this.connection.getRepository(ctx, Order).update(orderId, {
            customFields: { hallStatus: 'open', deliveryStaffId: null, deliveryStatus: null, assignedAt: null },
        } as any);
    }
```

- [ ] **Step 5: T1 加急置顶（hall 排序）**

`hall-grab.service.ts` 的 `hall()` 方法改为取回后 JS 排序（大厅单量 <100，避免 customFields 物理列名 SQL 风险）：

```ts
    /** 大厅列表：当前渠道 open 状态订单（含跑腿单）。
     * T1: 滞留 > 5min 加急置顶，其次小费降序，再按入厅时间升序。 */
    async hall(ctx: RequestContext) {
        const orders = await this.connection.getRepository(ctx, Order).createQueryBuilder('order')
            .where("order.customFields.hallStatus = :s", { s: 'open' })
            .getMany();
        const now = Date.now();
        const urgentBefore = now - 5 * 60_000;
        const urgent = (o: Order) => {
            const at = (o.customFields as any).hallEnteredAt;
            return at ? new Date(at).getTime() < urgentBefore : false;
        };
        return orders.sort((a, b) =>
            (urgent(b) ? 1 : 0) - (urgent(a) ? 1 : 0)
            || ((b.customFields as any).tip ?? 0) - ((a.customFields as any).tip ?? 0)
            || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
```

（保留原 `where("order.customFields ->> 'hallStatus' = :s")` 写法与 `order.customFields.hallStatus` 中**以 plan1 部署实测可用者为准**——同 Task 4 Step 3 的对齐规则。）

- [ ] **Step 6: 拒单 mutation**

`hall-shop.resolver.ts` 追加：

```ts
    @Mutation()
    async campusRejectAssignment(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) {
        return this.rejectAssignment(ctx, orderId);
    }

    private async rejectAssignment(ctx: RequestContext, orderId: ID) {
        const rider = await this.riderService.assertApprovedRider(ctx);
        const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId as any } });
        const cf = order?.customFields as any;
        if (!order || cf.deliveryStaffId !== String(rider.id) || cf.deliveryStatus !== 'assigned') {
            throw new UserInputError('该订单未指派给您或已取货，不能拒单');
        }
        await this.hall.backToHall(ctx, order.id as any);
        await this.credit.adjust(ctx, rider.id as any, CREDIT_REJECT, 'reject_assign', order.id as any);
        return { backToHall: true };
    }
```

（HallShopResolver 构造器注入补 `riderService/hall/credit`；文件头 import `UserInputError` 与 `CREDIT_REJECT`。）

shop schema `extend type Mutation` 追加：

```graphql
    campusRejectAssignment(orderId: ID!): CampusRejectResult!
```

并定义 `type CampusRejectResult { backToHall: Boolean! }`。

plugin：providers 追加 `DispatchJobService`；`CampusDeliveryPlugin` 类实现 `OnApplicationBootstrap` 时追加 `this.injectorRef.get(DispatchJobService).start();`（constructor 需补注入 `Injector`——参照既有 `HallService` 拿法，若 plan1 未存 injectorRef 则给 plugin 类加 `private injector: Injector` 并在 onApplicationBootstrap 里 `this.injector.get(DispatchJobService).start()`）。

- [ ] **Step 7: 跑测试确认通过 + 构建 + Commit**

```bash
npx vitest --config vitest.config.mts --run src/dispatch-job.service.spec.ts
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): T1 加急置顶 + T2 自动强派 job + 拒单回大厅扣分"
```

---

### Task 7: T3 调度看板 + 手动派单/改派（admin）

**Files:**
- Create: `packages/campus-delivery-plugin/src/dispatch-admin.service.ts`
- Create: `packages/campus-delivery-plugin/src/dispatch-admin.service.spec.ts`
- Create: `packages/campus-delivery-plugin/src/dispatch-admin.resolver.ts`
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（admin schema + resolvers + providers）

**权限：** 全部 `@Allow(CampusPermissions.CampusViewDispatch)`（plan1 已注册该权限定义但尚未使用，此处启用）。web-admin 调度页（前端属 Plan 2 或独立页面，本计划只供 API）。

- [ ] **Step 1: 先写失败测试**

```ts
// dispatch-admin.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { DispatchAdminService } from './dispatch-admin.service';

const now = Date.now();
const minAgo = (m: number) => new Date(now - m * 60_000);

function makeEnv(opts: { orders?: any[]; riders?: any[]; cfg?: any }) {
    const orderRepo = { createQueryBuilder: () => ({
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(opts.orders ?? []),
    }) };
    const configRepo = { findOne: vi.fn().mockResolvedValue(opts.cfg ?? { autoAssignMinutes: 10, inProgressSlaMinutes: 45 }) };
    const capacitySvc = { listOnlineRiders: vi.fn().mockResolvedValue(opts.riders ?? []) };
    const conn = { getRepository: vi.fn((_ctx: any, ent: any) =>
        (ent as any).name === 'CampusFulfillmentConfig' ? configRepo : orderRepo) } as any;
    return { svc: new DispatchAdminService(conn, capacitySvc), capacitySvc };
}

describe('DispatchAdminService.board', () => {
    it('滞留超 autoAssignMinutes 的 open 单 → alert stale_open', async () => {
        const { svc } = makeEnv({
            orders: [{ id: 1, code: 'A1', customFields: { hallStatus: 'open', hallEnteredAt: minAgo(12), campusZone: 'A区' } }],
        });
        const board = await svc.board({ channelId: 1 } as any);
        expect(board.alerts[0]).toEqual(expect.objectContaining({ orderId: '1', type: 'stale_open' }));
    });

    it('open 未超时 → 不告警，进 hallOrders', async () => {
        const { svc } = makeEnv({
            orders: [{ id: 1, code: 'A1', customFields: { hallStatus: 'open', hallEnteredAt: minAgo(3) } }],
        });
        const board = await svc.board({ channelId: 1 } as any);
        expect(board.alerts).toHaveLength(0);
        expect(board.hallOrders).toHaveLength(1);
    });

    it('in_progress 超 SLA → alert sla_breach', async () => {
        const { svc } = makeEnv({
            orders: [{ id: 2, code: 'A2', customFields: { hallStatus: 'grabbed', deliveryStatus: 'in_progress', assignedAt: minAgo(50) } }],
        });
        const board = await svc.board({ channelId: 1 } as any);
        expect(board.alerts[0].type).toBe('sla_breach');
    });

    it('campusCause=slot_full → alert slot_full', async () => {
        const { svc } = makeEnv({
            orders: [{ id: 3, code: 'A3', customFields: { hallStatus: 'open', hallEnteredAt: minAgo(1), campusCause: 'slot_full' } }],
        });
        const board = await svc.board({ channelId: 1 } as any);
        expect(board.alerts[0].type).toBe('slot_full');
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/dispatch-admin.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// dispatch-admin.service.ts
import { ForbiddenError, ID, Injectable, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { Order } from '@vendure/core';
import { CapacityService } from './capacity.service';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';
import { HallService } from './hall.service';
import { HallGrabService } from './hall-grab.service';
import { RiderService } from './rider.service';

export interface DispatchAlert {
    orderId: string;
    orderCode: string;
    type: 'stale_open' | 'sla_breach' | 'slot_full' | 'exception';
    detail: string;
}

@Injectable()
export class DispatchAdminService {
    constructor(
        private connection: TransactionalConnection,
        private capacity: CapacityService,
    ) {}

    /** T3 调度看板：大厅单 / 进行中单 / 告警 / 在线骑手 */
    async board(ctx: RequestContext) {
        const cfg = await this.connection.getRepository(ctx, CampusFulfillmentConfig)
            .findOne({ where: { channelId: ctx.channelId as any } });
        const orders = await this.connection.getRepository(ctx, Order)
            .createQueryBuilder('order')
            .where("order.customFields.hallStatus IS NOT NULL")
            .getMany();
        const now = Date.now();
        const alerts: DispatchAlert[] = [];
        const hallOrders: Order[] = [];
        const activeOrders: Order[] = [];
        for (const o of orders) {
            const cf = o.customFields as any;
            if (cf.hallStatus === 'open') {
                hallOrders.push(o);
                if (cf.campusCause === 'slot_full') {
                    alerts.push({ orderId: String(o.id), orderCode: o.code, type: 'slot_full', detail: '时段锁位失败，需协调相邻时段或退款' });
                }
                if (cf.hallEnteredAt && now - new Date(cf.hallEnteredAt).getTime() > (cfg?.autoAssignMinutes ?? 10) * 60_000) {
                    alerts.push({ orderId: String(o.id), orderCode: o.code, type: 'stale_open', detail: `入厅超 ${(cfg?.autoAssignMinutes ?? 10)}min 无人接` });
                }
            } else if (cf.deliveryStatus === 'in_progress') {
                activeOrders.push(o);
                const since = cf.assignedAt ?? cf.hallEnteredAt;
                if (since && now - new Date(since).getTime() > (cfg?.inProgressSlaMinutes ?? 45) * 60_000) {
                    alerts.push({ orderId: String(o.id), orderCode: o.code, type: 'sla_breach', detail: `配送超 SLA ${(cfg?.inProgressSlaMinutes ?? 45)}min` });
                }
            } else if (cf.deliveryStatus === 'exception') {
                alerts.push({ orderId: String(o.id), orderCode: o.code, type: 'exception', detail: cf.exceptionType ?? '骑手上报异常' });
            } else {
                activeOrders.push(o);
            }
        }
        const riders = await this.capacity.listOnlineRiders(ctx);
        return {
            paused: cfg?.paused ?? false,
            alerts,
            hallOrders,
            activeOrders,
            ridersOnline: riders.map(r => ({
                customerId: r.id,
                realName: (r.customFields as any).riderRealName ?? '',
                credit: (r.customFields as any).riderCredit ?? 100,
            })),
        };
    }

    /** T3 手动派单/改派：指定骑手强派 */
    async assign(ctx: RequestContext, orderId: ID, riderCustomerId: number) {
        const ok = await this.grab.grabByRider(ctx, orderId, { id: riderCustomerId });
        if (!ok) throw new UserInputError('派单失败：订单已不在大厅（已被抢/已退款）');
        return { assigned: true };
    }

    /** T3 改派-回大厅：清骑手，重新进入抢单池 */
    async backToHall(ctx: RequestContext, orderId: ID) {
        const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId as any } });
        if (!order) throw new UserInputError('订单不存在');
        await this.hall.backToHall(ctx, order.id as any);
        return { backToHall: true };
    }
}
```

（构造器注入 `grab/hall/rider` —— 实际实现里 assign 用 HallGrabService、backToHall 用 HallService，补齐构造器参数与 import。`assertApprovedRider` 若用于目标骑手校验可在 assign 前置调用 RiderService；MVP 直接信任 admin 输入的 customerId，省一步。）

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest --config vitest.config.mts --run src/dispatch-admin.service.spec.ts
```

Expected: PASS 4 条。

- [ ] **Step 5: resolver + schema**

```ts
// dispatch-admin.resolver.ts
import { Allow, Ctx, ID, Mutation, Query, RequestContext, Resolver } from '@vendure/core';
import { CampusPermissions } from './permissions';
import { DispatchAdminService } from './dispatch-admin.service';

@Resolver()
export class DispatchAdminResolver {
    constructor(private dispatch: DispatchAdminService) {}

    @Query()
    @Allow(CampusPermissions.CampusViewDispatch as any)
    async campusDispatchBoard(@Ctx() ctx: RequestContext) {
        return this.dispatch.board(ctx);
    }

    @Mutation()
    @Allow(CampusPermissions.CampusViewDispatch as any)
    async campusAssignOrder(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID, @Args('riderCustomerId') riderCustomerId: ID) {
        return this.dispatch.assign(ctx, orderId, riderCustomerId as any);
    }

    @Mutation()
    @Allow(CampusPermissions.CampusViewDispatch as any)
    async campusBackToHall(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) {
        return this.dispatch.backToHall(ctx, orderId);
    }
}
```

admin schema 追加：

```graphql
    type DispatchAlert {
        orderId: ID!
        orderCode: String!
        type: String!
        detail: String!
    }

    type DispatchRider {
        customerId: ID!
        realName: String!
        credit: Int!
    }

    type CampusDispatchBoard {
        paused: Boolean!
        alerts: [DispatchAlert!]!
        hallOrders: [Order!]!
        activeOrders: [Order!]!
        ridersOnline: [DispatchRider!]!
    }

    type CampusDispatchResult { assigned: Boolean backToHall: Boolean }
```

admin `extend type Query` 追加 `campusDispatchBoard: CampusDispatchBoard!`；`extend type Mutation` 追加：

```graphql
    campusAssignOrder(orderId: ID!, riderCustomerId: ID!): CampusDispatchResult!
    campusBackToHall(orderId: ID!): CampusDispatchResult!
```

plugin：`adminApiExtensions.resolvers` 追加 `DispatchAdminResolver`；providers 追加 `DispatchAdminService`。

- [ ] **Step 6: 构建 + 全量测试 + Commit**

```bash
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): T3 调度看板 + 手动派单/改派（CampusViewDispatch）"
```

---

### Task 8: T4 自动退款 + 补偿券 + 对账标记

**Files:**
- Modify: `packages/campus-delivery-plugin/src/dispatch-job.service.ts`（scan 追加 T4 分支）
- Modify: `packages/campus-delivery-plugin/src/dispatch-job.service.spec.ts`
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（无 schema 改动，providers 已含）

**设计决策（定稿）：** T4 用 vendure 原生 `RefundService`（after-sales `createRequest` 有用户归属校验 + 订单状态窗限制，系统上下文走不通）。退款失败降级：订单标 `campusCause='no_rider'` + `hallStatus='no_rider_final'` 留在调度告警，人工走 after-sales `processRefund`。补偿券仅在配置了 `compensationCouponTemplateId` 时发放。

- [ ] **Step 1: 先写失败测试**

`dispatch-job.service.spec.ts` 追加 describe（makeEnv 需扩展：`refundSvc` mock 与 `orderSvc` mock，`makeEnv` 的 conn.getRepository 对 `Payment` 实体返回 paymentRepo）：

```ts
describe('DispatchJobService.scan T4', () => {
    it('open 超 autoRefundMinutes → 退款 + Cancelled + cause=no_rider + 补偿券', async () => {
        const env = makeEnv({
            openOrders: [{ id: 4, code: 'T4', channelId: 1, customFields: { hallStatus: 'open', hallEnteredAt: minAgo(31) } }],
            onlineRiders: [],
            cfg: { channelId: 1, autoAssignMinutes: 10, autoRefundMinutes: 30, compensationCouponTemplateId: '9' },
        });
        env.svc['refundSvc'] = { createRefund: vi.fn().mockResolvedValue({ id: 77 }), settleRefund: vi.fn().mockResolvedValue({}) } as any;
        env.svc['orderSvc'] = { transitionToState: vi.fn().mockResolvedValue({}) } as any;
        env.svc['couponSvc'] = { grantCoupon: vi.fn().mockResolvedValue([]) } as any;
        env.svc['paymentRepo'] = { findOne: vi.fn().mockResolvedValue({ id: 55 }) } as any;
        env.hallSvc.updateOrder = vi.fn().mockResolvedValue({});
        await env.svc.scan({ channelId: 1 } as any);
        expect(env.svc['refundSvc'].settleRefund).toHaveBeenCalled();
        expect(env.svc['orderSvc'].transitionToState).toHaveBeenCalledWith(expect.anything(), 4, 'Cancelled');
        expect(env.svc['couponSvc'].grantCoupon).toHaveBeenCalledWith(expect.anything(), '9', [expect.anything()]);
        expect(env.hallSvc.updateOrder).toHaveBeenCalledWith(expect.anything(), 4, expect.objectContaining({
            customFields: expect.objectContaining({ campusCause: 'no_rider', hallStatus: 'no_rider_final' }),
        }));
    });

    it('未配置补偿券模板 → 不发券不报错', async () => {
        const env = makeEnv({
            openOrders: [{ id: 4, code: 'T4', channelId: 1, customFields: { hallStatus: 'open', hallEnteredAt: minAgo(31) } }],
            onlineRiders: [],
            cfg: { channelId: 1, autoAssignMinutes: 10, autoRefundMinutes: 30 },
        });
        env.svc['refundSvc'] = { createRefund: vi.fn().mockResolvedValue({ id: 77 }), settleRefund: vi.fn().mockResolvedValue({}) } as any;
        env.svc['orderSvc'] = { transitionToState: vi.fn().mockResolvedValue({}) } as any;
        env.svc['couponSvc'] = { grantCoupon: vi.fn() } as any;
        env.svc['paymentRepo'] = { findOne: vi.fn().mockResolvedValue({ id: 55 }) } as any;
        env.hallSvc.updateOrder = vi.fn().mockResolvedValue({});
        await env.svc.scan({ channelId: 1 } as any);
        expect(env.svc['couponSvc'].grantCoupon).not.toHaveBeenCalled();
    });
});
```

（makeEnv 中 `hallSvc` 已有 `updateOrder` mock 定义可复用；若 Step 3 实现里用了别的 helper 名，测试同步。）

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/dispatch-job.service.spec.ts
```

Expected: 新 describe 的用例 FAIL（T4 分支不存在，hallSvc.updateOrder 未被调用）。

- [ ] **Step 3: 实现 T4 分支**

`dispatch-job.service.ts`：

构造器追加 `private injector: Injector`（`import { Injector } from '@nestjs/common'`），加私有惰性服务获取：

```ts
    private refundSvc?: RefundService;
    private orderSvc?: OrderService;
    private couponSvc?: { grantCoupon: (ctx: RequestContext, templateId: ID, customerIds: ID[]) => Promise<string[]> };
    private paymentRepo?: any;

    private services(ctx: RequestContext) {
        if (!this.refundSvc) {
            this.refundSvc = this.injector.get(RefundService);
            this.orderSvc = this.injector.get(OrderService);
            const coupon = this.injector.get('CouponService', { strict: false }) ?? (globalThis as any).__campusCouponSvc;
            this.couponSvc = coupon;
            this.paymentRepo = this.connection.rawConnection.getRepository(Payment);
        }
        return { refund: this.refundSvc, order: this.orderSvc, coupon: this.couponSvc };
    }
```

> CouponService 获取：执行时先 `grep -n "export class CouponService\|providers" e:\zhao\vendure\packages\coupon-plugin\src\coupon-plugin.ts | head -20` 确认 CouponService 是否在 providers 且本仓库 coupon-plugin 是否注册为全局 providers（coupon-plugin 通常随主插件挂载，`injector.get(CouponService)` 应可用；`import { CouponService } from '@vendure/coupon-plugin'`）。上面 `globalThis` 兜底是测试注入用——**执行时以真实 import 为准**：`import { CouponService } from '@vendure/coupon-plugin'` + `this.couponSvc = this.injector.get(CouponService)`；spec 中 `env.svc['couponSvc'] = mock` 的注入方式不变。若 coupon-plugin 未导出 CouponService，改用 `grantCoupon` 所在 resolver 的 service 路径重查（10 分钟内解决不了就在 Task 8 commit message 记录 debt，改为 admin 手工发券）。

scan() 追加分支（在 T2 强派循环之后）：

```ts
        // 3) T4: open 超 autoRefundMinutes → 自动退款终态
        for (const cfg of cfgs) {
            const channelCtx = { ...ctx, channelId: cfg.channelId } as any;
            const staleFinal = orders.filter(o => {
                const cf = o.customFields as any;
                return cf.hallStatus === 'open' && o.channelId === cfg.channelId && cf.hallEnteredAt
                    && now - new Date(cf.hallEnteredAt).getTime() > (cfg.autoRefundMinutes ?? 30) * 60_000;
            });
            for (const o of staleFinal) {
                await this.refundNoRider(channelCtx, o, cfg);
            }
        }
```

```ts
    /** T4: 全额退款原路退回 + Cancelled + 对账标记 + 定向补偿券；失败降级留人工 */
    async refundNoRider(ctx: RequestContext, order: Order, cfg: CampusFulfillmentConfig) {
        const { refund, order: orderSvc, coupon } = this.services(ctx);
        try {
            const payment = await this.paymentRepo.findOne({ where: { order: { id: order.id } }, order: { id: 'DESC' as any } });
            if (payment) {
                const refundEntity = await refund.createRefund(ctx, {
                    paymentId: payment.id,
                    amount: payment.amount,
                    reason: `no_rider auto refund (${order.code})`,
                } as any, order.lines ?? [], { cancel: false });
                await refund.settleRefund(ctx, refundEntity.id);
            }
            await orderSvc?.transitionToState(ctx, order.id as any, 'Cancelled');
            await this.hall.updateOrder(ctx, order.id as any, {
                customFields: { campusCause: 'no_rider', hallStatus: 'no_rider_final' },
            });
            if (cfg.compensationCouponTemplateId && order.customerId && coupon) {
                await coupon.grantCoupon(ctx, cfg.compensationCouponTemplateId as any, [order.customerId as any]);
            }
            Logger.warn(`Order ${order.code} T4: refunded + cancelled + coupon (cause=no_rider)`, 'CampusDispatch');
        } catch (e: any) {
            // 降级：留 no_rider_final + campusCause 供调度页人工退款（after-sales processRefund）
            Logger.error(`Order ${order.code} T4 refund FAILED: ${e?.message}`, 'CampusDispatch');
            await this.hall.updateOrder(ctx, order.id as any, {
                customFields: { campusCause: 'no_rider', hallStatus: 'no_rider_final' },
            });
        }
    }
```

`hall.service.ts` 追加通用更新（或复用既有私有方法，若 Task 6 Step 4 的 backToHall 里没有通用 updateOrder，此处加）：

```ts
    updateOrder(ctx: RequestContext, orderId: number, patch: any) {
        return this.connection.getRepository(ctx, Order).update(orderId, patch as any);
    }
```

（paymentRepo 的 Payment 查询：`import { Payment } from '@vendure/core'`。`findOne` where 关系写法 `order: { id }` 为 TypeORM 标准关系条件；若执行报错改为先 `order.payments`（Order relations 里 payments）取最后一条。）

> **系统上下文**：`channelCtx` 是扫描构造的裸 ctx。`RefundService.createRefund` 需要 admin 权限校验的完整 RequestContext——执行时若报 ctx/session 错误，改用：
> ```ts
> const ctxSvc = this.injector.get(RequestContextService);
> const adminCtx = await ctxSvc.generate({ apiType: 'admin', channelOrToken: cfg.channelId });
> ```
> （`import { RequestContextService } from '@vendure/core'`）并用 adminCtx 替换 channelCtx 调 refund/order/coupon。两套写法都试，以能跑通为准，测试 mock 不受影响。

- [ ] **Step 4: 跑测试确认通过 + 构建 + Commit**

```bash
npx vitest --config vitest.config.mts --run src/dispatch-job.service.spec.ts
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): T4 自动退款 + 补偿券 + no_rider 对账标记（失败降级人工）"
```

---

### Task 9: R5 跑腿单完整链路（商品种子 + 下单 mutation + 小费 surcharge + 跑腿运费 calculator）

**Files:**
- Create: `packages/campus-delivery-plugin/src/errand.service.ts`
- Create: `packages/campus-delivery-plugin/src/errand.service.spec.ts`
- Create: `packages/campus-delivery-plugin/src/shipping-calculator.ts`
- Modify: `packages/campus-delivery-plugin/src/errand-shop.resolver.ts`（新建）
- Modify: `packages/campus-delivery-plugin/src/campus-config-admin.resolver.ts`（商品种子 mutation）
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（providers + schema + shippingOptions）

**计价定稿：** 支付金额 = 商品（0 元 ERRAND-BASE）+ shipping（`campusErrandCalculator` 返回 zone.fee）+ surcharge（小费 tip）。分成仍按 plan1 `calcEarning = shipping + tip`（surcharge 不计入 order.shipping，无双算）。`fulfillmentRoute='R5'`、`orderKind='errand'`，入厅逻辑（hall.service）已天然兼容。

- [ ] **Step 1: 先写失败测试**

```ts
// errand.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { ErrandService } from './errand.service';

function makeEnv(opts: { product?: any; zone?: any }) {
    const productRepo = {
        findOne: vi.fn().mockResolvedValue(opts.product ?? null),
        save: vi.fn().mockImplementation(v => Promise.resolve({ id: 88, ...v })),
        create: vi.fn().mockImplementation(v => ({ ...v })),
    };
    const taxRepo = { findOne: vi.fn().mockResolvedValue({ id: 1, name: '标准', enabled: true }) };
    const zoneRepo = { findOne: vi.fn().mockResolvedValue(opts.zone ?? null) };
    const conn = {
        getRepository: vi.fn((_ctx: any, ent: any) => {
            const name = (ent as any).name;
            if (name === 'ProductVariant') return productRepo;
            if (name === 'TaxCategory') return taxRepo;
            if (name === 'CampusZone') return zoneRepo;
            return {};
        }),
        rawConnection: { transaction: (fn: any) => fn({ getRepository: () => productRepo }) },
    } as any;
    const orderSvc = {
        addItemToOrder: vi.fn().mockResolvedValue({ id: 5, lines: [] }),
        setOrderCustomFields: vi.fn().mockResolvedValue({ id: 5 }),
    };
    const surchargeSvc = { addSurcharge: vi.fn().mockResolvedValue({}) };
    const svc = new ErrandService(conn, orderSvc as any, surchargeSvc as any);
    return { svc, productRepo, zoneRepo, orderSvc, surchargeSvc };
}

describe('ErrandService', () => {
    it('ensureErrandProduct：SKU 不存在则创建 0 元变体', async () => {
        const { svc, productRepo } = makeEnv({});
        await svc.ensureErrandProduct({ channelId: 1 } as any, 'ERRAND-BASE', '校园跑腿');
        expect(productRepo.save).toHaveBeenCalled();
    });

    it('ensureErrandProduct：已存在则幂等返回', async () => {
        const { svc, productRepo } = makeEnv({ product: { id: 88, sku: 'ERRAND-BASE' } });
        const p = await svc.ensureErrandProduct({ channelId: 1 } as any, 'ERRAND-BASE', '校园跑腿');
        expect(p.id).toBe(88);
        expect(productRepo.save).not.toHaveBeenCalled();
    });

    it('createErrandOrder：写 errand customFields + 小费 surcharge', async () => {
        const { svc, orderSvc, surchargeSvc } = makeEnv({
            product: { id: 88 },
            zone: { id: 2, name: 'A区', fee: 300 },
        });
        await svc.createErrandOrder({ channelId: 1, activeUserId: 9 } as any, {
            kind: 'pickup_express',
            fromText: '菜鸟驿站',
            toText: '桂3栋',
            tip: 100,
            buildingId: '3',
            campusZone: 'A区',
        });
        expect(orderSvc.setOrderCustomFields).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
                orderKind: 'errand',
                fulfillmentRoute: 'R5',
                errandKind: 'pickup_express',
                tip: 100,
                campusZone: 'A区',
            }),
        );
        expect(surchargeSvc.addSurcharge).toHaveBeenCalledWith(
            expect.anything(), expect.anything(),
            expect.objectContaining({ price: 100 }),
        );
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest --config vitest.config.mts --run src/errand.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 ErrandService**

```ts
// errand.service.ts
import { ForbiddenError, ID, Injectable, Injector, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { OrderService, ProductVariant, SurchargeService, TaxCategory } from '@vendure/core';
import { CampusZone } from './campus-zone.entity';

export const ERRAND_SKU = 'ERRAND-BASE';

@Injectable()
export class ErrandService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private surchargeService: SurchargeService,
    ) {}

    /** 幂等创建 0 元跑腿载体商品（每个 channel 一个） */
    async ensureErrandProduct(ctx: RequestContext, sku: string, name: string) {
        const repo = this.connection.getRepository(ctx, ProductVariant);
        const existing = await repo.findOne({ where: { sku } as any });
        if (existing) return existing;
        // 简化：直接造 Product/ProductVariant（执行时若缺 Product 主档校验报错，
        // 改用 ProductService.create + ProductVariantService.create 组合，同一幂等语义）
        const taxCat = await this.connection.getRepository(ctx, TaxCategory).findOne({ where: {} });
        const product = await repo.save({
            sku,
            name,
            price: 0,
            taxCategory: taxCat ? { id: taxCat.id } : undefined,
        } as any);
        return product;
    }

    /** C 端跑腿下单：0 元商品 + errand customFields + 小费 surcharge（系统上下文） */
    async createErrandOrder(ctx: RequestContext, input: {
        kind: string; fromText: string; toText: string; tip: number;
        buildingId?: string; campusZone?: string;
    }) {
        if (!ctx.activeUserId) throw new ForbiddenError();
        if (!Number.isFinite(input.tip) || input.tip < 0) throw new UserInputError('小费金额不合法');
        const variant = await this.connection.getRepository(ctx, ProductVariant)
            .findOne({ where: { sku: ERRAND_SKU } as any });
        if (!variant) throw new UserInputError('跑腿服务未开通（缺少 ERRAND-BASE 商品，请管理员先初始化）');

        // 1) 加 0 元载体商品
        await this.orderService.addItemToOrder(ctx, undefined as any, variant.productId, variant.id, 1);
        // 2) 写 errand customFields
        const order = await this.orderService.setOrderCustomFields(ctx, undefined as any, {
            orderKind: 'errand',
            fulfillmentRoute: 'R5',
            errandKind: input.kind,
            errandFrom: input.fromText,
            errandTo: input.toText,
            tip: Math.floor(input.tip),
            buildingId: input.buildingId ?? null,
            campusZone: input.campusZone ?? null,
        } as any);
        // 3) 小费 surcharge：需要 admin 系统上下文（shop ctx 无 surcharge 权限）
        if (input.tip > 0) {
            const adminCtx = await this.getAdminCtx(ctx);
            await this.surchargeService.addSurcharge(adminCtx, order.id, {
                description: `小费（${input.kind === 'pickup_express' ? '代取快递' : '跑腿'}）`,
                price: Math.floor(input.tip),
            } as any);
        }
        return order;
    }

    private adminCtxCache = new Map<number, any>();
    private async getAdminCtx(ctx: RequestContext) {
        if (!this.adminCtxCache.has(ctx.channelId as any)) {
            // 延迟获取避免构造器注入循环：执行时若 RequestContextService 不可从 ctx 拿，
            // 改为构造器注入 RequestContextService 并 generate({ apiType: 'admin', channelOrToken: ctx.channelId })
            const ctxSvc = (this.connection as any).__requestContextService;
            if (ctxSvc) {
                this.adminCtxCache.set(ctx.channelId as any, await ctxSvc.generate({ apiType: 'admin', channelOrToken: ctx.channelId }));
            } else {
                // 兜底：复用 shop ctx（若 surchargeService 校验失败则 Task 9 现场解决 admin ctx 构造）
                this.adminCtxCache.set(ctx.channelId as any, ctx);
            }
        }
        return this.adminCtxCache.get(ctx.channelId as any)!;
    }
}
```

> **执行时注意（两处现场对齐点，10 分钟搞不定就降级）：**
> ① `addItemToOrder/setOrderCustomFields` 的第一参 ctx 第二参 orderId：vendure 3.x OrderService 这两个方法签名是 `(ctx, orderId, ...)`，orderId 传 `undefined` 会取 activeOrder——不对，vendure 不支持。**正确做法**：shop-api 的 activeOrder 场景应使用 vendure 内置 `activeOrder` 机制——mutation 里先 `this.orderService.findOne(ctx, ctx.activeOrderId)` 或直接复用 shop-api 内置 `addItemToOrder` mutation 无法从自定义 resolver 调 activeOrder。**落地方式**：让 C 端先走 vendure 内置 `addItemToOrder(variantId)` 内置 mutation（购物车加商品），再调 `campusSetErrandInfo(kind, fromText, toText, tip, buildingId, campusZone)` mutation（只写 customFields + surcharge + 校验 activeOrder.orderKind）。若坚持单 mutation 封装，用 `ctx.activeOrderId`（vendure RequestContext 上有）作为 orderId 传入。**首选 `ctx.activeOrderId` 方案**，实现时验证。② `getAdminCtx` 兜底逻辑现场简化——vendure 3.6.4 `RequestContextService.generate({ apiType: 'admin' })` 是标准 API，直接构造器注入 RequestContextService 实现。

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest --config vitest.config.mts --run src/errand.service.spec.ts
```

Expected: PASS 3 条（测试中 orderSvc mock 已按 ctx.activeOrderId 语义适配，`addItemToOrder` mock 断言参数可放宽为 expect.anything()）。

- [ ] **Step 5: 跑腿运费 calculator**

```ts
// shipping-calculator.ts
import { ShippingCalculator } from '@vendure/core';
import { CampusZone } from './campus-zone.entity';

/**
 * 跑腿单运费：zone.fee（分）。
 * 非 errand 单返回 undefined → vendure 尝试下一个 calculator，不影响现有区域运费。
 */
export const campusErrandCalculator = new ShippingCalculator({
    code: 'campus-errand-calculator',
    description: '校园跑腿费（按分区）',
    args: {},
    calculate: async (order, { injector }) => {
        const cf = order.customFields as any;
        if (cf?.orderKind !== 'errand') return undefined;
        const conn = injector.get(TransactionalConnection);
        let zone: CampusZone | null = null;
        if (cf.campusZone) {
            zone = await conn.rawConnection.getRepository(CampusZone).findOne({
                where: { name: cf.campusZone, channelId: order.channelId as any },
            });
        }
        if (!zone) {
            zone = await conn.rawConnection.getRepository(CampusZone).findOne({
                where: { channelId: order.channelId as any },
                order: { id: 'ASC' as any },
            }); // 兜底：渠道第一个分区
        }
        const fee = zone?.fee ?? 0;
        return {
            price: fee,
            priceWithTax: fee,
            metadata: { zoneName: zone?.name ?? '', calculator: 'campus-errand' },
        };
    },
});
```

（import 补 `import { TransactionalConnection } from '@vendure/core';`。）

`campus-delivery.plugin.ts` 的 `configuration` 回调追加：

```ts
        config.shippingOptions.customShippingLineCalculators = [
            ...(config.shippingOptions.customShippingLineCalculators ?? []),
            campusErrandCalculator,
        ];
```

（文件头 import `campusErrandCalculator`。）

- [ ] **Step 6: resolver + schema**

```ts
// errand-shop.resolver.ts
import { Ctx, ID, Mutation, Query, RequestContext, Resolver } from '@vendure/core';
import { ErrandService, ERRAND_SKU } from './errand.service';

@Resolver()
export class ErrandShopResolver {
    constructor(private errand: ErrandService) {}

    @Mutation()
    async campusSetErrandInfo(
        @Ctx() ctx: RequestContext,
        @Args('input') input: any,
    ) {
        return this.errand.setErrandInfo(ctx, input);
    }
}
```

> 对齐 Task 0 契约检查结果：若 Plan 2 前端已调用 `campusCreateErrandOrder`（单 mutation 全封装），则这里按其入参实现（内部走 activeOrder + setErrandInfo 组合）；若前端采用「内置 addItemToOrder + campusSetErrandInfo」两步式，则本 resolver 即终态。**mutation 名以 Plan 2 为准。**

`ErrandService` 最终形态（两步式，与内置 mutation 协作）：

```ts
    /** C 端两步式第二步：给 activeOrder 写 errand 标记 + 小费 surcharge */
    async setErrandInfo(ctx: RequestContext, input: {
        kind: string; fromText: string; toText: string; tip: number;
        buildingId?: string; campusZone?: string;
    }) {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const orderId = (ctx as any).activeOrderId;
        if (!orderId) throw new UserInputError('购物车为空');
        if (!Number.isFinite(input.tip) || input.tip < 0) throw new UserInputError('小费金额不合法');
        const order = await this.orderService.setOrderCustomFields(ctx, orderId, {
            orderKind: 'errand',
            fulfillmentRoute: 'R5',
            errandKind: input.kind,
            errandFrom: input.fromText,
            errandTo: input.toText,
            tip: Math.floor(input.tip),
            buildingId: input.buildingId ?? null,
            campusZone: input.campusZone ?? null,
        } as any);
        if (input.tip > 0) {
            const adminCtx = await this.getAdminCtx(ctx);
            await this.surchargeService.addSurcharge(adminCtx, orderId, {
                description: '跑腿小费',
                price: Math.floor(input.tip),
            } as any);
        }
        return order;
    }
```

（spec 文件中 `createErrandOrder` 方法保留与否视 Task 0 契约检查结果——若 Plan 2 用两步式则删除 `createErrandOrder` 及其测试，只留 `setErrandInfo` + `ensureErrandProduct`，测试同步改写。）

admin resolver（campus-config-admin.resolver.ts）追加商品种子：

```ts
    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusEnsureErrandProducts(@Ctx() ctx: RequestContext) {
        const p = await this.errand.ensureErrandProduct(ctx, ERRAND_SKU, '校园跑腿服务');
        return { variantId: p.id, sku: ERRAND_SKU };
    }
```

（CampusConfigAdminResolver 构造器注入 `private errand: ErrandService`。）

admin schema `extend type Mutation` 追加：

```graphql
    campusEnsureErrandProducts: CampusErrandProductResult!
```

```graphql
    type CampusErrandProductResult { variantId: ID! sku: String! }
```

shop schema 追加：

```graphql
    input CampusErrandInput {
        kind: String!
        fromText: String!
        toText: String!
        tip: Int!
        buildingId: ID
        campusZone: String
    }
    type CampusErrandInfoResult { orderId: ID! }
```

shop `extend type Mutation` 追加：

```graphql
    campusSetErrandInfo(input: CampusErrandInput!): CampusErrandInfoResult!
```

plugin：providers 追加 `ErrandService`；shop resolvers 追加 `ErrandShopResolver`。

- [ ] **Step 7: 构建 + 全量测试 + Commit**

```bash
npm run build && npm test
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): R5 跑腿单（0元载体 + errand 标记 + 小费 surcharge + 分区运费 calculator）"
```

---

### Task 10: R2 联动标记 + 收口（index/schema 完整性 + 全量回归）

**Files:**
- Modify: `packages/campus-delivery-plugin/src/rider-task-shop.resolver.ts`（或新建 r2-shop.resolver.ts）
- Modify: `packages/campus-delivery-plugin/src/index.ts`
- Modify: `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts`（shop schema）
- Create: `packages/campus-delivery-plugin/src/r2-mark.service.spec.ts`（轻量测试）

**R2 联动定稿（轻量）：** 学生收到快递到校后，在 order-detail 点「已到校」→ `campusMarkArrived`（校验本人 + fulfillmentRoute='R2'）写 `leg1Status='arrived_gate'` + `handoverAt`；「发跑腿代取」→ C 端两步式 errand 下单（kind='pickup_express'，fromText=快递点名，toText=宿舍楼），天然复用 Task 9 链路。R2 快递发货轨迹本身走现有 order/ship + logistics-plugin，本计划不动。

- [ ] **Step 1: 先写失败测试**

```ts
// r2-mark.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { R2MarkService } from './r2-mark.service';

describe('R2MarkService.markArrived', () => {
    const make = (order: any, activeUserId: any) => {
        const orderRepo = { findOne: vi.fn().mockResolvedValue(order), update: vi.fn().mockResolvedValue({}) };
        const conn = { getRepository: () => orderRepo } as any;
        const orderSvc = { findOne: vi.fn().mockResolvedValue({ customer: { user: { id: activeUserId } } }) } as any;
        return { svc: new R2MarkService(conn, orderSvc), orderRepo };
    };

    it('本人 R2 单可标记到校', async () => {
        const { svc, orderRepo } = make(
            { id: 6, customFields: { fulfillmentRoute: 'R2' }, customer: { user: { id: 9 } } }, 9);
        await svc.markArrived({ activeUserId: 9 } as any, 6 as any);
        expect(orderRepo.update).toHaveBeenCalledWith(6, expect.objectContaining({
            customFields: expect.objectContaining({ leg1Status: 'arrived_gate' }),
        }));
    });

    it('非本人拒绝', async () => {
        const { svc } = make(
            { id: 6, customFields: { fulfillmentRoute: 'R2' }, customer: { user: { id: 8 } } }, 9);
        await expect(svc.markArrived({ activeUserId: 9 } as any, 6 as any)).rejects.toThrow();
    });

    it('非 R2 单拒绝', async () => {
        const { svc } = make(
            { id: 6, customFields: { fulfillmentRoute: 'R3' }, customer: { user: { id: 9 } } }, 9);
        await expect(svc.markArrived({ activeUserId: 9 } as any, 6 as any)).rejects.toThrow();
    });
});
```

- [ ] **Step 2: 跑测试确认失败 → 实现 → 确认通过**

```ts
// r2-mark.service.ts（新建）
import { ForbiddenError, ID, Injectable, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { OrderService } from '@vendure/core';

@Injectable()
export class R2MarkService {
    constructor(private connection: TransactionalConnection, private orderService: OrderService) {}

    /** R2: 学生确认快递已到校（第一程完成） */
    async markArrived(ctx: RequestContext, orderId: ID) {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const order = await this.orderService.findOne(ctx, orderId as any, ['customer', 'customer.user'] as any);
        const cf = (order as any)?.customFields ?? {};
        if (!order) throw new UserInputError('订单不存在');
        if ((order as any).customer?.user?.id !== ctx.activeUserId) throw new ForbiddenError();
        if (cf.fulfillmentRoute !== 'R2') throw new UserInputError('仅 R2 快递单支持到校确认');
        await this.connection.getRepository(ctx, Order).update(order.id, {
            customFields: { leg1Status: 'arrived_gate', handoverAt: new Date() },
        } as any);
        return { leg1Status: 'arrived_gate' };
    }
}
```

测试文件里 import 对应调整。跑：

```bash
npx vitest --config vitest.config.mts --run src/r2-mark.service.spec.ts
```

Expected: PASS 3 条。

- [ ] **Step 3: resolver + schema + index**

`rider-task-shop.resolver.ts` 追加（或新建文件，构造器注入 R2MarkService）：

```ts
    @Mutation()
    async campusMarkArrived(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) {
        const r = await this.r2.markArrived(ctx, orderId);
        return { leg1Status: r.leg1Status };
    }
```

shop schema 追加：

```graphql
    campusMarkArrived(orderId: ID!): CampusArrivedResult!
```

```graphql
    type CampusArrivedResult { leg1Status: String! }
```

plugin providers 追加 `R2MarkService`。

`index.ts` 追加导出：

```ts
export * from './delivery-slot.entity';
export * from './rider-credit-log.entity';
export * from './rider-credit.service';
export * from './slot-lock.service';
export * from './capacity.service';
export * from './dispatch-job.service';
export * from './dispatch-admin.service';
export * from './errand.service';
export * from './shipping-calculator';
export * from './r2-mark.service';
```

- [ ] **Step 4: schema 完整性检查 + 全量回归**

```bash
npm run build && npm test
grep -c "campus" lib/campus-delivery.plugin.js
```

Expected: 既有全绿 + 新增 spec 全 PASS；lib 产物含全部新增 mutation 名（campusShopSlots/campusRiderOnline/campusRiderHeartbeat/campusCapacityCheck/campusRejectAssignment/campusSetErrandInfo/campusMarkArrived/campusCreateSlot/campusUpdateSlot/campusSlots/campusDispatchBoard/campusAssignOrder/campusBackToHall/campusEnsureErrandProducts）。

- [ ] **Step 5: Commit**

```bash
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): R2 到校确认标记 + index 导出与 schema 完整性"
```

---

### Task 11: 部署 + 服务器冒烟 + 验收手册

- [ ] **Step 1: 本地构建 lib 入库**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npm run build
cd e:\zhao\vendure && git add packages/campus-delivery-plugin/lib && git commit -m "build(campus): lib 产物（plan3）"
git push origin master
```

- [ ] **Step 2: 确认部署前置（四件套中 ①② 已在 plan1 完成，无新包）**

```bash
grep -n "campus" e:\zhao\vendure\scripts\build-prod.ps1
```

Expected: bizPkgs 已含 campus-delivery-plugin（plan1 已做）。dev-server 生产 dist 无需重编（插件已有 symlink，仅 lib 内容更新）。

- [ ] **Step 3: 服务器上线（先与用户确认无并发 SSH/pm2 操作；先 pm2 ls 看 vendure uptime/restarts）**

```bash
ssh joho "pm2 ls"
ssh joho "cd /www/apps/vendure && git pull && cd packages/dev-server && pm2 restart vendure"
```

Expected: git pull 拉到新 lib；pm2 restart 后 ~60s 内 online（CPU 高时耐心等）。

- [ ] **Step 4: PG 冒烟**

```bash
ssh joho "docker exec 1Panel-postgresql-pIe0 psql -U <dbuser> -d <dbname> -c '\\d delivery_slot' -c '\\d rider_credit_log' -c \"SELECT column_name FROM information_schema.columns WHERE table_name='campus_fulfillment_config' AND column_name IN ('autoRefundMinutes','inProgressSlaMinutes','compensationCouponTemplateId')\""
```

Expected: 两表存在；config 3 新列存在。customFields 新列由 vendure bootstrap 自动补齐（`\d "order"` 看 `deliverySlotId` 等驼峰物理列；`\d customer` 看 `riderOnlineAt`）。

- [ ] **Step 5: admin-api 冒烟清单（token 见 e:\zhao\vshop\.secrets\admin_token.txt，Bearer + vendure-token 渠道头；admin token 失效先重新登录）**

1. `campusCreateSlot(input:{slotDate:"<明天>",startTime:"11:00",endTime:"11:30",capacity:2})` → 返回实体
2. `campusEnsureErrandProducts` → `{ variantId, sku: "ERRAND-BASE" }`（幂等，复跑第二次返回同一 variantId）
3. shop-api etao 登录（native，凭据见 .secrets/verify-paymode.cjs）→ 内置 `addItemToOrder(variantId)` → `campusSetErrandInfo(input:{kind:"pickup_express",fromText:"驿站",toText:"桂3栋",tip:100,campusZone:"A区"})` → 返回 orderId
4. 校验支付金额：`myOrder` 的 shipping=zone.fee + surcharge 含 100 分小费
5. DB 验证该单 `hallStatus='open'`（支付桩后）——errand 单支付后入厅
6. 骑手 `campusRiderOnline(online:true)` → 30s 内 `campusCapacityCheck` 返回 ridersOnline≥1
7. 等 10min（或临时把 config `autoAssignMinutes` 改 1 加速）→ 骑手 `campusMyTasks(status:"assigned")` 出现强派单（T2 ✓）
8. 骑手 `campusRejectAssignment` → 单回大厅（campusHall 可见）+ DB riderCredit -5（T2 拒单 ✓）
9. 临时把 `autoRefundMinutes` 改 1 + `compensationCouponTemplateId` 指向测试券模板 → 等 2min → 该单 state=Cancelled、`campusCause='no_rider'`、etao 收到测试券（T4 ✓；若微信支付 provider 不支持自动退款则走降级路径：单留 no_rider_final + 调度告警，人工 after-sales 退款——记录实际走的是哪条）
10. `campusDispatchBoard` → alerts/hallOrders/ridersOnline 结构正确（T3 ✓）
11. 复原 config（autoAssignMinutes=10、autoRefundMinutes=30、清 compensationCouponTemplateId）

- [ ] **Step 6: 验收手册 + 截图 + 最终 Commit**

写 `e:\zhao\vshop\docs\verify\2026-10-campus-plan3-slots-dispatch.md`：冒烟 11 步逐条证据（SQL 输出/GraphQL 响应）、T0-T4 每级触发条件与验证方式、降级路径记录、前端契约清单（本文档末尾章节）。手机视口截图（390×844, dpr=2）补调度页/时段选择证据（若 Plan 2 前端已就绪则用真实页面截图，否则用 GraphQL 响应证据替代并注明）。

```bash
cd e:\zhao\vendure && git add -A && git commit -m "test(campus): plan3 部署冒烟取证 + 验收手册"
git push origin master
```

---

## 前端接口契约（供 Plan 2 / web-admin 对接，本计划只定义不实现）

### shop-api（C 端 + 骑手端）

| 操作 | 用途 | 端 |
|---|---|---|
| `campusShopSlots: [DeliverySlot!]!` | checkout 预约时段 chips（含 remaining 余量） | C 端 |
| `campusCapacityCheck: { paused, ridersOnline }` | 0 骑手提示「运力紧张」+ 预约引导 | C 端 |
| `campusSetErrandInfo(input)` | 跑腿下单第二步（先走内置 addItemToOrder 加 ERRAND-BASE） | C 端 |
| `campusMarkArrived(orderId)` | R2 快递到校确认 | C 端 |
| `campusRiderOnline(online)` | 骑手上下线开关（pkg-rider 大厅页） | 骑手端 |
| `campusRiderHeartbeat` | 在线心跳（骑手在线时 30s 一次） | 骑手端 |
| `campusRejectAssignment(orderId)` | 被强派单拒单（扣 5 分回大厅） | 骑手端 |
| 既有 `campusHall` | 大厅列表（T1 滞留 >5min 已服务端置顶；urgency 前端可用 hallEnteredAt 自算标红） | 骑手端 |

### admin-api（web-admin）

| 操作 | 用途 |
|---|---|
| `campusSlots` / `campusCreateSlot` / `campusUpdateSlot` | 履约配置页-时段容量 |
| `campusDispatchBoard` | 调度页（alerts: stale_open/sla_breach/slot_full/exception + 大厅单 + 在线骑手） |
| `campusAssignOrder(orderId, riderCustomerId)` | 调度页手动派单 |
| `campusBackToHall(orderId)` | 调度页改派-回大厅 |
| `campusUpdateConfig`（新增 3 字段） | autoRefundMinutes / inProgressSlaMinutes / compensationCouponTemplateId |

### T0-T4 触发时序（运维速查）

```
支付成功 → 入厅 + 锁位（失败标 slot_full 告警）+ 订阅消息提醒在线骑手 [T0]
  ├─ 0-5min：正常抢单（>5min 大厅自动置顶加急 [T1]）
  ├─ 10min（autoAssignMinutes）：强派信用分最高在线骑手；拒单 -5 回大厅 [T2]
  ├─ 10-30min：调度页 stale_open 红色告警 → 人工派单/回大厅 [T3]
  │             接单 15min 未取货：自动改派回大厅 + 骑手 -10
  │             in_progress 超 45min：sla_breach 告警
  └─ 30min（autoRefundMinutes）：自动全额退款 + Cancelled + 补偿券 + cause=no_rider [T4]
                退款失败：留 no_rider_final 告警 → 人工 after-sales processRefund
```

## 与 spec 对照（本计划覆盖范围）

- spec §5：DeliverySlot ✓（Task 1-3）；Order/Customer customFields 全量补齐 ✓（Task 1）；RiderEarning plan1 已落 ✓
- spec §6：抢单防双抢（plan1 ✓）；超时自动派 job ✓（Task 6）；时段容量乐观锁 ✓（Task 3）；分成（plan1 ✓）
- spec §11：T0 ✓（Task 4）、T1 ✓（Task 6）、T2 ✓（Task 6）、T3 ✓（Task 7）、T4 ✓（Task 8）；骑手信用分 ✓（Task 5）；其他极端情况矩阵中「15min 未取货自动改派」✓（Task 6）、「in_progress 超 SLA 告警」✓（Task 7）、「时段容量满」✓（Task 3）、「支付成功但入厅失败」由 OrderPlacedEvent 重试语义覆盖（事件丢失属 vendure 事件总线风险，本期不做兜底重扫，记非目标）
- spec §3 R5 完整落地 ✓（Task 9）；R2 联动标记 ✓（Task 10）；R4 复用 pickup 核销（plan1 已保证路线标记，无新增）
- spec §7/§8/§9 前端页面 → Plan 2 / web-admin（本计划仅契约）
- 非目标（spec §13）：实时轨迹、WebSocket、达达/顺丰、骑手评价——不做
