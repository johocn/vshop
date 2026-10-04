# 校园配送 实施计划 1/3：campus-delivery-plugin 后端地基

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 vendure 新建 campus-delivery-plugin，落地分区/宿舍楼/履约配置/骑手入驻/入厅/抢单/送达/分成入余额的后端能力，跑通 R1/R3 校园闭环 API。

**Architecture:** 薄插件复用 delivery-plugin 状态机字段（deliveryStatus/deliveryStaffId 等）、coupon-plugin 余额 port、pickup/logistics 均不动。骑手身份挂在 Customer customFields（shop-api 登录态）；调度/配置走 admin-api。抢单用事务 + 悲观锁（等价于 spec 的防双抢保证，且不依赖 customFields 扁平列名）。

**Tech Stack:** Vendure 3.6.4（Lerna monorepo）、TypeORM、GraphQL（code-first）、Vitest。**注意：本仓库 node_modules 未安装**（设计如此），验证以「本地依赖安装成功跑单测」为目标，失败则回退到服务器冒烟（见 Task 9）。

**规范**：金额一律用「分」（int）；实体表名遵循 SnakeNamingStrategy（campus_zone 等）；仓库工作流见 `e:\zhao\vendure\AGENTS.md`；服务器部署红线：**禁止在服务器构建**，lib 编译产物入库。

---

### Task 0: 环境准备与插件脚手架

**Files:**
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\package.json`
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\tsconfig.build.json`
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\vitest.config.mts`
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`（先放空壳）

- [ ] **Step 1: 安装依赖（一次性，约 5-10 分钟）**

```bash
cd e:\zhao\vendure
npm install --no-audit --no-fund
```

若内部包 ^0.0.1 报 registry 404：在 `e:\zhao\vendure\.npmrc` 追加 `link-workspace-packages=true` 后重装。

- [ ] **Step 2: 验证单测可跑（以 coupon-plugin 为基准）**

```bash
cd e:\zhao\vendure\packages\coupon-plugin
npx vitest --config vitest.config.mts --run src/coupon-settlement.spec.ts
```

Expected: PASS。若失败，记录错误，后续验证改为服务器冒烟路线（Task 9 已含）。

- [ ] **Step 3: 创建插件脚手架**

`package.json`（复制 coupon-plugin 的结构，改名）:

```json
{
  "name": "@vendure/campus-delivery-plugin",
  "version": "0.0.1",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "scripts": {
    "watch": "tsc -p ./tsconfig.build.json --watch",
    "build": "rimraf lib && tsc -p ./tsconfig.build.json",
    "test": "vitest --config vitest.config.mts --run"
  },
  "dependencies": { "graphql-tag": "^2.12.6" },
  "peerDependencies": { "@vendure/core": "3.6.4" },
  "devDependencies": { "typescript": "^5", "vitest": "^2", "rimraf": "^5" }
}
```

`tsconfig.build.json`、`vitest.config.mts` 从 `packages/coupon-plugin/` 同名文件复制，仅改 include 路径不变（相对路径通用）。

`src/campus-delivery.plugin.ts` 空壳:

```ts
import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

@VendurePlugin({
  imports: [PluginCommonModule],
  compatibility: '^3.6.4',
})
export class CampusDeliveryPlugin {}
```

- [ ] **Step 4: Commit**

```bash
cd e:\zhao\vendure
git add packages/campus-delivery-plugin .npmrc
git commit -m "feat(campus): campus-delivery-plugin 脚手架"
```

---

### Task 1: 实体与 customFields

**Files:**
- Create: `packages/campus-delivery-plugin/src/campus-zone.entity.ts`
- Create: `packages/campus-delivery-plugin/src/campus-building.entity.ts`
- Create: `packages/campus-delivery-plugin/src/rider-earning.entity.ts`
- Create: `packages/campus-delivery-plugin/src/campus-fulfillment-config.entity.ts`
- Create: `packages/campus-delivery-plugin/src/custom-fields.ts`
- Create: `packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts`
- Modify: `src/campus-delivery.plugin.ts`

- [ ] **Step 1: 实体代码**

```ts
// campus-zone.entity.ts
import { Column, Entity } from 'typeorm';
import { ChannelAware, DeepPartial, ID, VendureEntity } from '@vendure/core';

@Entity()
export class CampusZone extends VendureEntity implements ChannelAware {
    [key: string]: any;
    @Column() name: string;              // 如「A 区」
    @Column({ type: 'int' }) fee: number; // 该区配送费（分）
    @Column() channelId: ID;
    constructor(input?: DeepPartial<CampusZone>) { super(input); }
}

// campus-building.entity.ts
import { Column, Entity } from 'typeorm';
import { ChannelAware, DeepPartial, ID, VendureEntity } from '@vendure/core';

@Entity()
export class CampusBuilding extends VendureEntity implements ChannelAware {
    [key: string]: any;
    @Column() name: string;                    // 如「桂3栋」
    @Column({ nullable: true }) detail: string; // 单元/楼层提示
    @Column() zoneId: ID;
    @Column() channelId: ID;
    constructor(input?: DeepPartial<CampusBuilding>) { super(input); }
}

// rider-earning.entity.ts
import { Column, Entity } from 'typeorm';
import { ChannelAware, DeepPartial, ID, VendureEntity } from '@vendure/core';

@Entity()
export class RiderEarning extends VendureEntity implements ChannelAware {
    [key: string]: any;
    @Column() orderId: ID;
    @Column() riderCustomerId: ID;
    @Column({ type: 'int' }) amount: number; // 分成（分）
    @Column({ type: 'int', default: 0 }) tip: number;
    @Column({ default: 'credited' }) status: string;
    @Column() channelId: ID;
    constructor(input?: DeepPartial<RiderEarning>) { super(input); }
}

// campus-fulfillment-config.entity.ts
import { Column, Entity } from 'typeorm';
import { ChannelAware, DeepPartial, ID, VendureEntity } from '@vendure/core';

@Entity()
export class CampusFulfillmentConfig extends VendureEntity implements ChannelAware {
    [key: string]: any;
    @Column({ unique: true }) channelId: ID;
    @Column({ type: 'simple-json', default: '["R1","R3","R4","R5"]' })
    routesEnabled: string[];
    @Column({ type: 'int', default: 100 }) riderCommissionRate: number; // 百分比
    @Column({ type: 'int', default: 10 }) autoAssignMinutes: number;
    @Column({ default: false }) paused: boolean; // 运力暂停开关
    constructor(input?: DeepPartial<CampusFulfillmentConfig>) { super(input); }
}
```

- [ ] **Step 2: customFields**

```ts
// custom-fields.ts
import { CustomFields } from '@vendure/core';

export const campusCustomFields: CustomFields = {
    Order: [
        { name: 'fulfillmentRoute', type: 'string', nullable: true }, // R1..R5
        { name: 'orderKind', type: 'string', nullable: true, defaultValue: 'normal' },
        { name: 'buildingId', type: 'string', nullable: true },
        { name: 'campusZone', type: 'string', nullable: true },
        { name: 'hallStatus', type: 'string', nullable: true }, // open/grabbed
        { name: 'hallEnteredAt', type: 'datetime', nullable: true },
        { name: 'riderEarning', type: 'int', nullable: true },
        { name: 'tip', type: 'int', nullable: true },
    ],
    Customer: [
        { name: 'riderStatus', type: 'string', nullable: true }, // none/pending/approved/suspended
        { name: 'riderRealName', type: 'string', nullable: true },
        { name: 'riderStudentNo', type: 'string', nullable: true },
        { name: 'riderCampus', type: 'string', nullable: true },
        { name: 'riderIdImg', type: 'string', nullable: true },
        { name: 'riderCredit', type: 'int', nullable: true, defaultValue: 100 },
    ],
};
```

- [ ] **Step 3: 迁移 SQL**（先读 `packages/coupon-plugin/src/migrations/add-coupon-fields.ts` 确认本仓库迁移注册方式，新迁移照同一机制挂载）

```ts
// migrations/create-campus-tables.ts —— PG 专用，IF NOT EXISTS 幂等
export const createCampusTables = `
CREATE TABLE IF NOT EXISTS campus_zone (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  name varchar(255) NOT NULL, fee int NOT NULL DEFAULT 0, "channelId" int NOT NULL);
CREATE TABLE IF NOT EXISTS campus_building (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  name varchar(255) NOT NULL, detail varchar(255), "zoneId" int NOT NULL, "channelId" int NOT NULL);
CREATE TABLE IF NOT EXISTS rider_earning (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  "orderId" int NOT NULL, "riderCustomerId" int NOT NULL,
  amount int NOT NULL, tip int NOT NULL DEFAULT 0, status varchar(255) DEFAULT 'credited', "channelId" int NOT NULL);
CREATE TABLE IF NOT EXISTS campus_fulfillment_config (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  "channelId" int NOT NULL UNIQUE, "routesEnabled" jsonb, "riderCommissionRate" int DEFAULT 100,
  "autoAssignMinutes" int DEFAULT 10, paused boolean DEFAULT false);
`;
```

customFields 列（order/customer 表新增列）由 Vendure bootstrap 自动补齐（与 coupon 插件同机制）；部署后用 `\d "order"` 复核 `hallStatus` 等列存在（Task 9）。

- [ ] **Step 4: 注册进 plugin**

```ts
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [CampusZone, CampusBuilding, RiderEarning, CampusFulfillmentConfig],
    configuration: {
        customFields: campusCustomFields,
    },
    compatibility: '^3.6.4',
})
export class CampusDeliveryPlugin {}
```

- [ ] **Step 5: 构建 + Commit**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npm run build
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): 实体与 customFields"
```

---

### Task 2: 分区/宿舍楼/履约配置 admin API

**Files:**
- Create: `src/campus-config.service.ts`
- Create: `src/campus-config-admin.resolver.ts`
- Create: `src/permissions.ts`
- Modify: `src/campus-delivery.plugin.ts`

- [ ] **Step 1: 权限常量**（复用 delivery-plugin 命名风格，新权限注册进 customPermissions）

```ts
// permissions.ts
import { PermissionDefinition } from '@vendure/core';

export const CampusPermissions = {
    CampusConfig: 'CampusConfig',     // 分区/宿舍楼/履约配置
    CampusAuditRider: 'CampusAuditRider', // 骑手审核
    CampusViewDispatch: 'CampusViewDispatch', // 调度看板
} as const;

export const campusPermissionDefinitions: PermissionDefinition[] = [
    { name: 'CampusConfig', description: '校园履约配置' },
    { name: 'CampusAuditRider', description: '骑手招募审核' },
    { name: 'CampusViewDispatch', description: '配送调度看板' },
].map(p => new PermissionDefinition(p)) as PermissionDefinition[];
```

- [ ] **Step 2: Service（含单测）**

```ts
// campus-config.service.ts
import { Injectable, RequestContext } from '@vendure/core';
import { DataSource } from 'typeorm';
import { CampusZone } from './campus-zone.entity';
import { CampusBuilding } from './campus-building.entity';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';

@Injectable()
export class CampusConfigService {
    constructor(private dataSource: DataSource) {}

    listZones(ctx: RequestContext) { return this.dataSource.getRepository(CampusZone).find({ where: { channelId: ctx.channelId as any } }); }
    async createZone(ctx: RequestContext, name: string, fee: number) {
        return this.dataSource.getRepository(CampusZone).save({ name, fee, channelId: ctx.channelId } as any);
    }
    listBuildings(zoneId?: number) {
        return this.dataSource.getRepository(CampusBuilding).find(zoneId ? { where: { zoneId } } : {});
    }
    async createBuilding(ctx: RequestContext, name: string, zoneId: number, detail?: string) {
        return this.dataSource.getRepository(CampusBuilding).save({ name, zoneId, detail, channelId: ctx.channelId } as any);
    }
    async getConfig(ctx: RequestContext): Promise<CampusFulfillmentConfig> {
        const repo = this.dataSource.getRepository(CampusFulfillmentConfig);
        let cfg = await repo.findOne({ where: { channelId: ctx.channelId as any } });
        if (!cfg) cfg = await repo.save({ channelId: ctx.channelId } as any);
        return cfg;
    }
    async updateConfig(ctx: RequestContext, patch: Partial<CampusFulfillmentConfig>) {
        const cfg = await this.getConfig(ctx);
        Object.assign(cfg, patch);
        return this.dataSource.getRepository(CampusFulfillmentConfig).save(cfg);
    }
}
```

```ts
// campus-config.service.spec.ts（纯逻辑单测：默认配置兜底）
import { describe, expect, it, vi } from 'vitest';
describe('CampusConfigService.getConfig', () => {
    it('无配置时创建默认配置', async () => {
        const findOne = vi.fn().mockResolvedValue(null);
        const save = vi.fn().mockImplementation(v => Promise.resolve(v));
        const svc = new CampusConfigService({ getRepository: () => ({ findOne, save }) } as any);
        const ctx = { channelId: 1 } as any;
        const cfg = await svc.getConfig(ctx);
        expect(save).toHaveBeenCalledOnce();
        expect(cfg.riderCommissionRate).toBe(100);
        expect(cfg.autoAssignMinutes).toBe(10);
        expect(cfg.paused).toBe(false);
    });
});
```

- [ ] **Step 3: Admin resolver**

```ts
// campus-config-admin.resolver.ts
import { Allow, Ctx, Mutation, RequestContext, Resolver } from '@vendure/core';
import { CampusConfigService } from './campus-config.service';
import { CampusPermissions } from './permissions';

@Resolver()
export class CampusConfigAdminResolver {
    constructor(private config: CampusConfigService) {}

    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusCreateZone(@Ctx() ctx: RequestContext, @Args('name') name: string, @Args('fee') fee: number) {
        return this.config.createZone(ctx, name, fee);
    }
    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusCreateBuilding(@Ctx() ctx: RequestContext, @Args('name') name: string, @Args('zoneId') zoneId: number, @Args('detail', { nullable: true }) detail?: string) {
        return this.config.createBuilding(ctx, name, zoneId, detail);
    }
    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusUpdateConfig(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        return this.config.updateConfig(ctx, input);
    }
    // campusZones / campusBuildings / campusConfig 三个 Query 同理，@Allow 同上
}
```

Query 部分补齐：`campusZones`、`campusBuildings(zoneId)`、`campusConfig`。

- [ ] **Step 4: 注册 + 构建测试 + Commit**

plugin `providers: [CampusConfigService]`, `adminApiExtensions` 挂 resolver；customPermissions 加 `campusPermissionDefinitions`。

```bash
npm run build && npm test
git add -A packages/campus-delivery-plugin && git commit -m "feat(campus): 分区/宿舍楼/履约配置 admin API"
```

---

### Task 3: 骑手入驻与审核

**Files:**
- Create: `src/rider.service.ts`
- Create: `src/rider-shop.resolver.ts`
- Create: `src/rider-admin.resolver.ts`
- Create: `src/rider.service.spec.ts`
- Modify: `src/campus-delivery.plugin.ts`

- [ ] **Step 1: Service + 单测**

```ts
// rider.service.ts
import { CustomerService, ForbiddenError, Injectable, RequestContext, TransactionalConnection } from '@vendure/core';

const CREDIT_LIMIT = 60;

@Injectable()
export class RiderService {
    constructor(private connection: TransactionalConnection, private customerService: CustomerService) {}

    async applyRider(ctx: RequestContext, input: { realName: string; studentNo: string; campus: string; idImg?: string }) {
        const customer = await this.customerService.findCurrentUser(ctx);
        if (!customer) throw new ForbiddenError();
        await this.connection.getRepository(ctx, Customer).update(customer.id, {
            customFields: { riderStatus: 'pending', riderRealName: input.realName, riderStudentNo: input.studentNo, riderCampus: input.campus, riderIdImg: input.idImg ?? null },
        } as any);
        return { status: 'pending' };
    }

    async setRiderStatus(ctx: RequestContext, customerId: number, status: 'approved' | 'suspended' | 'none') {
        await this.connection.getRepository(ctx, Customer).update(customerId, { customFields: { riderStatus: status } } as any);
        return { status };
    }

    async assertApprovedRider(ctx: RequestContext) {
        const customer = await this.customerService.findCurrentUser(ctx);
        if (!customer) throw new ForbiddenError();
        const cf = customer.customFields as any;
        if (cf.riderStatus !== 'approved') throw new ForbiddenError();
        if ((cf.riderCredit ?? 100) < CREDIT_LIMIT) throw new ForbiddenError();
        return customer;
    }

    async listApplications(ctx: RequestContext, status: string) {
        return this.connection.getRepository(ctx, Customer).createQueryBuilder('customer')
            .where("customer.customFields ->> 'riderStatus' = :status", { status })
            .getMany();
    }
}
```

> 注意：若本仓库 DB 为 PG 且 customFields 为扁平列（部署后 `\d customer` 可见），`listApplications` 的 where 改为 `"customer"."riderStatus" = :status`。两种写法都写在注释里，部署冒烟时择一。

```ts
// rider.service.spec.ts
import { describe, expect, it, vi } from 'vitest';
// 覆盖三个断言分支：非骑手拒、待审拒、低信用分拒
describe('RiderService.assertApprovedRider', () => {
    const make = (cf: any) => {
        const svc = new RiderService({} as any, { findCurrentUser: vi.fn().mockResolvedValue({ id: 1, customFields: cf }) } as any);
        return svc.assertApprovedRider({ channelId: 1 } as any);
    };
    it('approved 且信用分达标通过', async () => expect(make({ riderStatus: 'approved', riderCredit: 100 })).resolves.toBeTruthy());
    it('pending 拒绝', async () => expect(make({ riderStatus: 'pending', riderCredit: 100 })).rejects.toThrow());
    it('信用分低于 60 拒绝', async () => expect(make({ riderStatus: 'approved', riderCredit: 59 })).rejects.toThrow());
});
```

- [ ] **Step 2: Resolvers**

shop-api：`applyRider(realName, studentNo, campus, idImg)`、`myRiderProfile`（返回当前用户 rider customFields）、`campusZones`/`campusBuildings`（公开只读，C 端选楼用）。
admin-api：`riderApplications(status)`、`campusSetRiderStatus(customerId, status)`（@Allow CampusAuditRider）。

- [ ] **Step 3: 构建 + 测试 + Commit**

```bash
npm run build && npm test && git add -A ../../packages/campus-delivery-plugin && git commit -m "feat(campus): 骑手入驻与审核"
```

---

### Task 4: 入厅（OrderPlacedEvent 监听）

**Files:**
- Create: `src/hall.service.ts`
- Modify: `src/campus-delivery.plugin.ts`（onApplicationBootstrap 订阅事件）

- [ ] **Step 1: 入厅逻辑**

```ts
// hall.service.ts
import { EventLogEntry, Injectable, Injector, Logger, Order, OrderPlacedEvent, RequestContext, TransactionalConnection } from '@vendure/core';

@Injectable()
export class HallService {
    private connection!: TransactionalConnection;
    init(injector: Injector) { this.connection = injector.get(TransactionalConnection); }

    async onOrderPlaced(ctx: RequestContext, order: Order) {
        const cf = order.customFields as any;
        if (cf.orderKind === 'errand' || cf.fulfillmentRoute === 'R1' || cf.fulfillmentRoute === 'R3') {
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: { hallStatus: 'open', hallEnteredAt: new Date() },
            } as any);
            Logger.info(`Order ${order.code} entered hall (${cf.fulfillmentRoute})`, 'CampusHall');
        }
    }
}
```

plugin 中（HallService 加入 providers，构造器注入由 Vendure 提供）：

```ts
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [/* Task 1 实体 */],
    providers: [CampusConfigService, RiderService, HallService, HallGrabService, RiderTaskService],
    configuration: { customFields: campusCustomFields, customPermissions: campusPermissionDefinitions },
    adminApiExtensions: { schema: adminSchema, resolvers: [/* admin resolvers */] },
    shopApiExtensions: { schema: shopSchema, resolvers: [/* shop resolvers */] },
    compatibility: '^3.6.4',
})
export class CampusDeliveryPlugin implements OnApplicationBootstrap {
    constructor(private injectorRef: Injector, private eventBus: EventBus) {}
    async onApplicationBootstrap() {
        const hall = this.injectorRef.get(HallService);
        hall.init(this.injectorRef);
        this.eventBus.ofType(OrderPlacedEvent).subscribe(({ ctx, order }) =>
            hall.onOrderPlaced(ctx, order).catch(e => Logger.error(String(e), 'CampusHall')));
    }
}
```

（R5 跑腿单支付即入厅；R2/R4 不入厅，与 spec §3 一致。）

- [ ] **Step 2: 构建 + Commit**

```bash
npm run build && git add -A . && git commit -m "feat(campus): 支付后按路线自动入厅"
```

---

### Task 5: 抢单 grabOrder（防双抢）

**Files:**
- Create: `src/hall-grab.service.ts`
- Create: `src/hall-shop.resolver.ts`
- Create: `src/hall-grab.service.spec.ts`

- [ ] **Step 1: 核心：事务 + 悲观锁**

```ts
// hall-grab.service.ts
import { ForbiddenError, ID, Injectable, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { Order } from '@vendure/core';

@Injectable()
export class HallGrabService {
    constructor(private connection: TransactionalConnection, private riderService: RiderService) {}

    /** 抢单：事务 + pessimistic_write，hallStatus 非 open 即抛「手慢了」。
     * 同时写 delivery-plugin 的 customFields（deliveryStaffId/deliveryStatus=assigned），复用其任务体系。 */
    async grab(ctx: RequestContext, orderId: ID): Promise<Order> {
        const rider = await this.riderService.assertApprovedRider(ctx);
        return this.connection.rawConnection.transaction(async em => {
            const order = await em.getRepository(Order).findOne({
                where: { id: orderId as any },
                relations: ['customer'],
                lock: { mode: 'pessimistic_write' },
            });
            const cf = order?.customFields as any;
            if (!order || cf?.hallStatus !== 'open') throw new UserInputError('手慢了，该订单已被抢');
            if (order.customer?.id === rider.id) throw new UserInputError('不能抢自己的订单');
            await this.connection.getRepository(ctx, Order).update(order.id, {
                customFields: {
                    hallStatus: 'grabbed',
                    deliveryStaffId: String(rider.id),
                    deliveryStatus: 'assigned',
                    assignedAt: new Date(),
                },
            } as any);
            return this.connection.getRepository(ctx, Order).findOneByOrFail({ id: orderId as any });
        });
    }

    /** 大厅列表：当前渠道 open 状态订单（含跑腿单），按小费/入厅时间排序 */
    async hall(ctx: RequestContext) {
        return this.connection.getRepository(ctx, Order).createQueryBuilder('order')
            .where("order.customFields ->> 'hallStatus' = :s", { s: 'open' })
            .orderBy("order.customFields ->> 'tip'", 'DESC')
            .addOrderBy('order.createdAt', 'ASC')
            .getMany();
    }
}
```

> 部署后若 DB 为扁平列，hall 查询 where 换成 `"order"."hallStatus" = :s`（同 Task 3 注释策略）。PG 索引：迁移补 `CREATE INDEX IF NOT EXISTS idx_order_hall_status ON "order" ((customFields->>'hallStatus'))`——若扁平列则 `ON "order" ("hallStatus")`。

- [ ] **Step 2: 单测（锁语义 mock）**

```ts
// hall-grab.service.spec.ts
import { describe, expect, it, vi } from 'vitest';

const openOrder = { id: 10, code: 'A1', customer: { id: 7 }, customFields: { hallStatus: 'open' } };

function makeSvc(order: any, riderCf: any) {
    const riderSvc = { assertApprovedRider: vi.fn().mockResolvedValue({ id: 9, customFields: riderCf }) } as any;
    const updated: any[] = [];
    const em = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(order) }) };
    const conn = {
        rawConnection: { transaction: (fn: any) => fn(em) },
        getRepository: () => ({ update: vi.fn((_id: any, patch: any) => { updated.push(patch); return Promise.resolve(); }), findOneByOrFail: vi.fn().mockResolvedValue(order) }),
    } as any;
    return { svc: new HallGrabService(conn, riderSvc), updated };
}

describe('HallGrabService.grab', () => {
    it('open 订单可抢并写入 delivery customFields', async () => {
        const { svc, updated } = makeSvc(openOrder, { riderStatus: 'approved', riderCredit: 100 });
        await svc.grab({ channelId: 1 } as any, 10 as any);
        expect(updated[0].customFields.hallStatus).toBe('grabbed');
        expect(updated[0].customFields.deliveryStatus).toBe('assigned');
        expect(updated[0].customFields.deliveryStaffId).toBe('9');
    });
    it('已被抢订单抛「手慢了」', async () => {
        const grabbed = { ...openOrder, customFields: { hallStatus: 'grabbed' } };
        const { svc } = makeSvc(grabbed, { riderStatus: 'approved', riderCredit: 100 });
        await expect(svc.grab({ channelId: 1 } as any, 10 as any)).rejects.toThrow('手慢了');
    });
    it('不能抢自己的订单', async () => {
        const mine = { ...openOrder, customer: { id: 9 } };
        const { svc } = makeSvc(mine, { riderStatus: 'approved', riderCredit: 100 });
        await expect(svc.grab({ channelId: 1 } as any, 10 as any)).rejects.toThrow('不能抢自己的订单');
    });
});
```

- [ ] **Step 3: Shop resolver**

```ts
// hall-shop.resolver.ts
@Resolver()
export class HallShopResolver {
    @Mutation() async campusGrabOrder(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) { return this.grab.grab(ctx, orderId); }
    @Query()   async campusHall(@Ctx() ctx: RequestContext) { return this.grab.hall(ctx); }
}
```

- [ ] **Step 4: 构建 + 测试 + Commit**

```bash
npm run build && npm test && git add -A . && git commit -m "feat(campus): 抢单大厅（事务防双抢）"
```

---

### Task 6: 骑手任务与送达分成

**Files:**
- Create: `src/rider-task.service.ts`
- Create: `src/rider-task-shop.resolver.ts`
- Create: `src/rider-task.service.spec.ts`
- Create: `src/balance-port.ts`

- [ ] **Step 1: 余额端口**（与 coupon-plugin 相同模式；优先直接复用其导出）

```ts
// balance-port.ts
import { RequestContext } from '@vendure/core';

export interface CampusBalancePort {
    addBalance(ctx: RequestContext, customerId: number, amount: number): Promise<number>;
}

let port: CampusBalancePort | null = null;
export function setCampusBalancePort(p: CampusBalancePort | null) { port = p; }
export function getCampusBalancePort(): CampusBalancePort | null { return port; }
```

执行时先 `grep -n "getCouponBalancePort" e:\zhao\vendure\packages\coupon-plugin\src\index.*`——若主入口已导出，则本文件删除，直接 `import { getCouponBalancePort } from '@vendure/coupon-plugin'` 复用（recharge-card-plugin 已注册），两套端口不并存。

- [ ] **Step 2: 任务服务**

```ts
// rider-task.service.ts
import { ForbiddenError, ID, Injectable, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { Order } from '@vendure/core';
import { RiderService } from './rider.service';
import { RiderEarning } from './rider-earning.entity';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';
import { getCampusBalancePort } from './balance-port';

@Injectable()
export class RiderTaskService {
    constructor(private connection: TransactionalConnection, private riderService: RiderService) {}

    async myTasks(ctx: RequestContext, status?: string) {
        const rider = await this.riderService.assertApprovedRider(ctx);
        const qb = this.connection.getRepository(ctx, Order).createQueryBuilder('order')
            .where('order.customFields ->> \'deliveryStaffId\' = :id', { id: String(rider.id) })
            .andWhere("order.customFields ->> 'deliveryStatus' IS NOT NULL");
        if (status) qb.andWhere("order.customFields ->> 'deliveryStatus' = :s", { s: status });
        return qb.orderBy('order.createdAt', 'DESC').getMany();
    }

    async start(ctx: RequestContext, orderId: ID) {
        const order = await this.assertOwner(ctx, orderId, 'assigned');
        await this.connection.getRepository(ctx, Order).update(order.id, { customFields: { deliveryStatus: 'in_progress' } } as any);
        return order;
    }

    /** 送达：拍照必传 → delivered → 分成入余额 */
    async deliver(ctx: RequestContext, orderId: ID, photos: string[], note?: string) {
        if (!photos?.length) throw new UserInputError('送达需至少一张照片');
        const order = await this.assertOwner(ctx, orderId, 'in_progress');
        const rider = await this.riderService.assertApprovedRider(ctx);
        const cf = order.customFields as any;
        const earning = this.calcEarning(order, await this.getConfig(ctx));
        await this.connection.getRepository(ctx, Order).update(order.id, {
            customFields: { deliveryStatus: 'delivered', deliveredAt: new Date(), deliveryPhotos: photos, deliveryNote: note ?? null, riderEarning: earning } as any,
        });
        await this.connection.getRepository(ctx, RiderEarning).save({
            orderId: order.id, riderCustomerId: rider.id, amount: earning, tip: cf.tip ?? 0, status: 'credited', channelId: ctx.channelId,
        } as any);
        const port = getCampusBalancePort();
        if (port) await port.addBalance(ctx, rider.id, earning);
        return order;
    }

    async reportException(ctx: RequestContext, orderId: ID, type: string, photos: string[], note?: string) {
        const order = await this.assertOwner(ctx, orderId, undefined);
        await this.connection.getRepository(ctx, Order).update(order.id, {
            customFields: { deliveryStatus: 'exception', exceptionType: type, exceptionPhotos: photos, exceptionNote: note ?? null } as any,
        });
        return order;
    }

    private calcEarning(order: Order, cfg: CampusFulfillmentConfig): number {
        // 跑腿单：跑腿费在 orderLines 单价中（虚拟商品 0 元时全在 shipping）；统一取 shipping + 小费
        const shipping = order.shipping || 0;
        const tip = (order.customFields as any).tip ?? 0;
        return Math.floor((shipping + tip) * cfg.riderCommissionRate / 100);
    }

    private async getConfig(ctx: RequestContext) {
        const cfg = await this.connection.getRepository(ctx, CampusFulfillmentConfig).findOne({ where: { channelId: ctx.channelId as any } });
        if (!cfg) throw new UserInputError('校园履约未配置');
        return cfg;
    }

    private async assertOwner(ctx: RequestContext, orderId: ID, expect?: string) {
        const rider = await this.riderService.assertApprovedRider(ctx);
        const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId as any }, relations: ['customer'] });
        const cf = order?.customFields as any;
        if (!order || cf?.deliveryStaffId !== String(rider.id)) throw new ForbiddenError();
        if (expect && cf?.deliveryStatus !== expect) throw new UserInputError(`当前状态不允许该操作（期望 ${expect}）`);
        return order;
    }
}
```

> 跑腿单计价口径（spec §4）：跑腿费=分区配送费（shipping）+小费（tip），商品 0 元载体。执行时核对 checkout 中 errand 单的 shipping 赋值（Plan 2 落地时对齐）。

- [ ] **Step 3: 单测（分成计算与状态机）**

```ts
// rider-task.service.spec.ts —— 覆盖：状态不符拒、非本骑手拒、分成计算（100% 与 80%）
import { describe, expect, it, vi } from 'vitest';

function make(order: any, cfg: any = { riderCommissionRate: 100 }) {
    const riderSvc = { assertApprovedRider: vi.fn().mockResolvedValue({ id: 9 }) } as any;
    const saved: any[] = [];
    // findOne 调用次序：deliver = assertOwner(查单) → getConfig(查配置)；start = assertOwner(查单)
    const repo = {
        findOne: vi.fn().mockImplementation((opts: any) =>
            opts?.where?.channelId !== undefined ? Promise.resolve(cfg) : Promise.resolve(order)),
        update: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockImplementation(v => { saved.push(v); return Promise.resolve(v); }),
    };
    const conn = { getRepository: () => repo } as any;
    return { svc: new RiderTaskService(conn, riderSvc), repo, saved };
}

const assigned = { id: 10, code: 'A1', shipping: 300, customFields: { deliveryStaffId: '9', deliveryStatus: 'assigned', tip: 100 } };

describe('RiderTaskService', () => {
    it('assigned 可开始配送', async () => {
        const { svc, repo } = make(assigned);
        await svc.start({ channelId: 1 } as any, 10 as any);
        expect(repo.update).toHaveBeenCalledWith(10, expect.objectContaining({ customFields: { deliveryStatus: 'in_progress' } }));
    });
    it('delivered 需照片且分成=配送费+小费', async () => {
        const inProg = { ...assigned, customFields: { ...assigned.customFields, deliveryStatus: 'in_progress' } };
        const { svc, repo, saved } = make(inProg, { riderCommissionRate: 100 });
        await svc.deliver({ channelId: 1 } as any, 10 as any, ['p1']);
        expect(repo.update).toHaveBeenCalled();
        expect(saved[0].amount).toBe(400); // 300 shipping + 100 tip
    });
    it('分成比例 80%', async () => {
        const inProg = { ...assigned, customFields: { ...assigned.customFields, deliveryStatus: 'in_progress' } };
        const { svc, saved } = make(inProg, { riderCommissionRate: 80 });
        await svc.deliver({ channelId: 1 } as any, 10 as any, ['p1']);
        expect(saved[0].amount).toBe(320);
    });
    it('无照片拒单', async () => {
        const inProg = { ...assigned, customFields: { ...assigned.customFields, deliveryStatus: 'in_progress' } };
        const { svc } = make(inProg);
        await expect(svc.deliver({ channelId: 1 } as any, 10 as any, [])).rejects.toThrow('送达需至少一张照片');
    });
    it('非本骑手拒', async () => {
        const other = { ...assigned, customFields: { deliveryStaffId: '8', deliveryStatus: 'assigned' } };
        const { svc } = make(other);
        await expect(svc.start({ channelId: 1 } as any, 10 as any)).rejects.toThrow();
    });
});
```

- [ ] **Step 4: 构建 + 测试 + Commit**

```bash
npm run build && npm test && git add -A . && git commit -m "feat(campus): 骑手任务/送达/分成入余额"
```

---

### Task 7: index 导出与 shop-api schema 挂载检查

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 导出**

```ts
export * from './campus-delivery.plugin';
export * from './campus-zone.entity';
export * from './campus-building.entity';
export * from './rider-earning.entity';
export * from './campus-fulfillment-config.entity';
export * from './balance-port';
```

- [ ] **Step 2: 验证 shop-api extensions 已挂**

确认 plugin 中 `shopApiExtensions: { schema: gql\`...\` }\`` 包含 campusGrabOrder/campusHall/applyRider/myRiderProfile/campusZones/campusBuildings/riderTasks/campusStartTask/campusDeliverTask/campusReportException；adminApiExtensions 包含配置与审核 resolver 的 schema。构建产物 `lib/` 中 grep 确认。

```bash
npm run build && npm test && git add -A . && git commit -m "feat(campus): index 导出与 schema 完整性"
```

---

### Task 8: dev-server 挂载（本地联调，可选）

**Files:**
- Modify: `packages/dev-server/dev-config.ts`

- [ ] **Step 1: 在 plugins 数组加入 `CampusDeliveryPlugin`（照 delivery-plugin 的挂法），如本地能跑 dev-server 则 `DB=sqlite npm run populate` 起一遍，人工跑一遍 admin-api：建分区→建宿舍楼→改配置→customer 手工置 approved→建测试单入厅→grab→deliver，验证全链路。**

- [ ] **Step 2: Commit**

```bash
git add packages/dev-server/dev-config.ts && git commit -m "chore(campus): dev-server 挂载"
```

---

### Task 9: 部署与服务器冒烟

- [ ] **Step 1: 本地构建，lib 入库**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npm run build
cd e:\zhao\vendure && git add packages/campus-delivery-plugin/lib && git commit -m "build(campus): lib 产物"
git push origin master
```

- [ ] **Step 2: 服务器零构建上线（先与用户确认无并发 SSH/pm2 操作）**

```bash
ssh joho "cd /www/apps/vendure && git pull && cd packages/dev-server && pm2 restart vendure"
```

- [ ] **Step 3: PG 冒烟（psql 容器 1Panel-postgresql-pIe0）**

```sql
\d "order"        -- 确认 hallStatus/hallEnteredAt/fulfillmentRoute 等列已自动生成；缺列则手工执行 createCampusTables + 补列
\d customer       -- 确认 riderStatus/riderCredit 列
SELECT * FROM campus_zone LIMIT 1;  -- 表存在
```

若 customFields 列未自动生成：从 coupon-plugin 迁移注册方式找到迁移执行机制执行 `createCampusTables` 中补列部分，或在低峰 `synchronize` 一次（需与用户确认）。

- [ ] **Step 4: admin-api 冒烟清单（token 见 e:\zhao\vshop\.secrets\admin_token.txt，Bearer + vendure-token 渠道头）**

1. `campusCreateZone(name:"A区", fee:200)` → 返回实体
2. `campusCreateBuilding(name:"桂3栋", zoneId:1)` → 返回实体
3. `campusUpdateConfig(input:{routesEnabled:["R1","R3","R4","R5"]})` → 生效
4. 用 etao/测试客户 shop-api `applyRider` → DB 中 riderStatus=pending
5. admin `campusSetRiderStatus(customerId, approved)` → approved
6. shop-api 下测试单（setOrderCustomFields fulfillmentRoute=R3 + shipping）支付桩后 → DB hallStatus=open
7. 骑手 `campusGrabOrder` → hallStatus=grabbed + deliveryStatus=assigned
8. `campusStartTask` → in_progress；`campusDeliverTask(photos:[...])` → delivered + rider_earning 有记录 + 余额增加
9. 并发抢单冒烟：两个骑手 token 同时 grab 同一单，一个成功一个报「手慢了」

- [ ] **Step 5: 冒烟证据入库（截图/SQL 输出）+ 最终 Commit**

```bash
git add -A && git commit -m "test(campus): 部署冒烟取证"
```

---

## 与 spec 对照（本计划覆盖范围）

- spec §5 数据模型全部落库（DeliverySlot 留 Plan 3）
- spec §3 R1/R3/R4 后端可用（R4 直接用现有 pickup 核销，本计划仅保证路线标记）；R2/R5 完整落地在 Plan 3
- spec §6 抢单防双抢 ✓、分成 ✓；T0-T4 降级阶梯、时段容量、自动派 → Plan 3
- 骑手端/C 端页面 → Plan 2
