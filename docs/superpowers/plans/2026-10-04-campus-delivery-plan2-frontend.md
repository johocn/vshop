# 校园配送 实施计划 2/3：C 端校园配送 + 骑手端 pkg-rider

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通 R1/R3 学生↔骑手闭环的前端全链路：checkout 加「校园配送」Tab（分区+宿舍楼+分区运费）、订单详情履约卡、pkg-rider 骑手分包（招募/大厅/任务/收入）、web-admin 骑手审核页，并把 Plan 1 缺的两个后端小件补上（骑手分成查询、配送目标回写+分区运费计算器）。

**Architecture:** Plan 1 的 campus-delivery-plugin 已上线（分区/宿舍楼/入厅/抢单/送达/分成均已实现），但有三处缺口由本计划补齐：① shop API 无骑手分成流水查询（`myRiderEarnings`）；② 无 shop mutation 把学生选的宿舍楼写进订单 customFields（`campusSetDeliveryTarget`，同时置 `fulfillmentRoute='R3'` 触发入厅）；③ 无分区运费计算器（`campus-zone-fee-calculator`，读取 `order.customFields.campusZone` 查 `CampusZone.fee`），需在后台一次性创建 code=`campus-delivery` 的 ShippingMethod。前端遵循现有惯例：C 端新页面写死中文（checkout.vue/live-room.vue 同例），web-admin 页面走 `$t()` + `src/locale/*.json`；金额一律「分」。

**Tech Stack:** vendure 3.6.4 插件小改（lib 入库、服务器零构建）+ uni-app/Vue3/TS（vshop C 端与 web-admin）+ Playwright（390×844 dpr=2 手机视口截图）。

**规范：**
- vendure 仓库工作流见 `e:\zhao\vendure\AGENTS.md`；服务器红线：**禁止在服务器构建**，部署 = 本地 build lib 入库 → git push → 服务器 `git pull` → pm2 restart。
- vendure customFields 是 embedded 结构：QueryBuilder 字符串路径必须写 `order.customFields.hallStatus`（裸列在 PG 不存在）；实体 ID 关联列显式 `@Column('int')`。
- 生产 admin 凭据 superadmin/z123123（登录响应头 `vendure-auth-token` 取 token，用 `Authorization: Bearer`）；SSH 别名 `joho`。
- 前置条件：Plan 1 已上线（campus-delivery-plugin 四表 + customFields + 抢单/送达/分成 API 可用）。

---

### Task 0: vendure——骑手分成流水查询 myRiderEarnings

**Files:**
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.ts`
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-shop.resolver.ts`
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`（shop schema）
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.spec.ts`

- [ ] **Step 1: 写失败测试**（在 `rider-task.service.spec.ts` 的 `describe('RiderTaskService')` 内追加）

```ts
    it('myEarnings 只查本人流水且按 id 倒序', async () => {
        const rows = [{ id: 2, riderCustomerId: 9, amount: 400, tip: 100, status: 'credited' }];
        const { svc, repo } = make(assigned);
        (repo as any).find = vi.fn().mockResolvedValue(rows);
        const res = await svc.myEarnings({ channelId: 1 } as any);
        expect(repo.find).toHaveBeenCalledWith(
            expect.objectContaining({ where: { riderCustomerId: 9 } }),
        );
        expect(res).toEqual(rows);
    });
```

注意：`make()` 里的 repo 没定义 `find`，本用例用 `(repo as any).find` 补挂；`riderCustomerId: 9` 来自 mock 的 `assertApprovedRider` 返回 `{ id: 9 }`。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run src/rider-task.service.spec.ts
```

Expected: FAIL（`myEarnings is not a function`）。

- [ ] **Step 3: 实现 service 方法**（`rider-task.service.ts`，在 `reportException` 方法后追加）

```ts
    /** 我的分成流水：按 id 倒序，skip/take 简单分页。RiderEarning 有标量 channelId 列，直接 find 即可。 */
    async myEarnings(ctx: RequestContext, skip = 0, take = 50): Promise<RiderEarning[]> {
        const rider = await this.riderService.assertApprovedRider(ctx);
        return this.connection.getRepository(ctx, RiderEarning).find({
            where: { riderCustomerId: rider.id as any },
            order: { id: 'DESC' },
            skip,
            take,
        });
    }
```

- [ ] **Step 4: resolver 暴露查询**（`rider-task-shop.resolver.ts`）

import 区补 `Int`，类内追加：

```ts
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
```

```ts
    @Query()
    async myRiderEarnings(
        @Ctx() ctx: RequestContext,
        @Args({ name: 'skip', type: () => Int, nullable: true }) skip = 0,
        @Args({ name: 'take', type: () => Int, nullable: true }) take = 50,
    ) {
        return this.riderTaskService.myEarnings(ctx, skip, take);
    }
```

（resolver 原有 import 若不含 `Int`，按上行合并；构造函数已注入 `riderTaskService` 则直接用。）

- [ ] **Step 5: shop schema 注册**（`campus-delivery.plugin.ts` shopApiExtensions.schema 的 gql 内）

`type RiderProfile` 定义前追加类型：

```graphql
                type RiderEarning {
                    id: ID!
                    orderId: ID!
                    amount: Int!
                    tip: Int!
                    status: String!
                    createdAt: String!
                }
```

`extend type Query` 内追加一行：

```graphql
                    myRiderEarnings(skip: Int, take: Int): [RiderEarning!]!
```

- [ ] **Step 6: 跑测试确认通过 + 构建**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run src/rider-task.service.spec.ts && npm run build
```

Expected: 测试 PASS，`lib/` 重新编译。

- [ ] **Step 7: Commit**

```bash
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): shop 查询 myRiderEarnings 骑手分成流水"
```

---

### Task 1: vendure——配送目标回写 campusSetDeliveryTarget + 分区运费计算器

**Files:**
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-order.service.ts`
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-order-shop.resolver.ts`
- Create: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-zone-fee.calculator.ts`
- Modify: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`
- Test: `e:\zhao\vendure\packages\campus-delivery-plugin\src\campus-order.service.spec.ts`

- [ ] **Step 1: 写失败测试**（新建 `campus-order.service.spec.ts`）

```ts
// 纯逻辑单测：回写目标（R3）/ 楼不属于该分区拒 / 无进行中订单拒 / 未登录拒
import { describe, expect, it, vi } from 'vitest';
import { CampusOrderService } from './campus-order.service';

function make(opts: { zone?: any; building?: any; activeOrder?: any }) {
    const repo = {
        findOne: vi.fn().mockImplementation((o: any) => {
            // 分区查询 where={id, channelId}；宿舍楼查询 where={id, zoneId, channelId}
            if (o.where.zoneId !== undefined) return Promise.resolve(opts.building ?? null);
            return Promise.resolve(opts.zone ?? null);
        }),
        update: vi.fn().mockResolvedValue({}),
    };
    const conn = { getRepository: () => repo } as any;
    const customerService = { findOneByUserId: vi.fn().mockResolvedValue({ id: 7 }) } as any;
    const orderService = {
        getActiveOrderForUser: vi.fn().mockResolvedValue(opts.activeOrder ?? null),
        findOne: vi.fn().mockResolvedValue(opts.activeOrder ?? null),
    } as any;
    const svc = new CampusOrderService(conn, customerService, orderService);
    return { svc, repo, orderService };
}

const zone = { id: 1, name: 'A 区', fee: 200, channelId: 1 };
const building = { id: 11, zoneId: 1, name: '桂3栋', channelId: 1 };
const active = { id: 10, code: 'A1', state: 'AddingItems' };

describe('CampusOrderService.setDeliveryTarget', () => {
    it('回写 buildingId/campusZone/fulfillmentRoute=R3', async () => {
        const { svc, repo } = make({ zone, building, activeOrder: active });
        await svc.setDeliveryTarget({ channelId: 1, activeUserId: 3 } as any, '1' as any, '11' as any);
        expect(repo.update).toHaveBeenCalledWith(10, expect.objectContaining({
            customFields: { buildingId: '11', campusZone: 'A 区', fulfillmentRoute: 'R3' },
        }));
    });
    it('楼不属于该分区拒', async () => {
        const { svc } = make({ zone, building: { ...building, zoneId: 2 }, activeOrder: active });
        await expect(svc.setDeliveryTarget({ channelId: 1, activeUserId: 3 } as any, '1' as any, '11' as any))
            .rejects.toThrow('宿舍楼不存在或不属于该分区');
    });
    it('无进行中订单拒', async () => {
        const { svc } = make({ zone, building });
        await expect(svc.setDeliveryTarget({ channelId: 1, activeUserId: 3 } as any, '1' as any, '11' as any))
            .rejects.toThrow('当前没有进行中的订单');
    });
    it('未登录拒', async () => {
        const { svc } = make({ zone, building, activeOrder: active });
        await expect(svc.setDeliveryTarget({ channelId: 1 } as any, '1' as any, '11' as any)).rejects.toThrow();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run src/campus-order.service.spec.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 service**（新建 `campus-order.service.ts`）

```ts
import { Injectable, UserInputError } from '@nestjs/common';
import {
    CustomerService,
    ForbiddenError,
    ID,
    Order,
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { CampusBuilding } from './campus-building.entity';
import { CampusZone } from './campus-zone.entity';

@Injectable()
export class CampusOrderService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private orderService: OrderService,
    ) {}

    /** 学生 checkout 选中宿舍楼后回写：buildingId/campusZone（分区名，运费计算器据此计费）/fulfillmentRoute=R3（支付后入厅）。 */
    async setDeliveryTarget(ctx: RequestContext, zoneId: ID, buildingId: ID): Promise<Order> {
        if (!ctx.activeUserId) {
            throw new ForbiddenError();
        }
        const zone = await this.connection.getRepository(ctx, CampusZone).findOne({
            where: { id: Number(zoneId), channelId: ctx.channelId as any },
        });
        if (!zone) throw new UserInputError('分区不存在');
        const building = await this.connection.getRepository(ctx, CampusBuilding).findOne({
            where: { id: Number(buildingId), zoneId: zone.id, channelId: ctx.channelId as any },
        });
        if (!building) throw new UserInputError('宿舍楼不存在或不属于该分区');
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        if (!customer) throw new ForbiddenError();
        const order = await this.orderService.getActiveOrderForUser(ctx, ctx.activeUserId);
        if (!order) throw new UserInputError('当前没有进行中的订单');
        await this.connection.getRepository(ctx, Order).update(order.id, {
            customFields: {
                buildingId: String(building.id),
                campusZone: zone.name,
                fulfillmentRoute: 'R3',
            },
        } as any);
        return (await this.orderService.findOne(ctx, order.id))!;
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run src/campus-order.service.spec.ts
```

Expected: PASS（4 用例）。

- [ ] **Step 5: 分区运费计算器**（新建 `campus-zone-fee.calculator.ts`）

ShippingCalculator 无 DI 上下文，用 port 注入模式（同 coupon-balance-port 先例）：

```ts
import { LanguageCode, RequestContext, ShippingCalculator } from '@vendure/core';

type CampusZoneFeeLookup = (ctx: RequestContext, zoneName: string) => Promise<number>;
let feeLookup: CampusZoneFeeLookup | null = null;

/** 由插件 bootstrap 注入真实查询；ShippingCalculator 是静态对象拿不到依赖 */
export function setCampusZoneFeeLookup(fn: CampusZoneFeeLookup | null): void {
    feeLookup = fn;
}

/**
 * 校园配送分区运费：从订单 customFields.campusZone（分区名）查 CampusZone.fee。
 * args 为空 —— 分区与费用全部来自数据，无需为每个分区手工建运费模板。
 */
export const campusZoneFeeCalculator = new ShippingCalculator({
    code: 'campus-zone-fee-calculator',
    description: [{ languageCode: LanguageCode.zh_CN, value: '校园配送：按订单所选分区计费' }],
    args: {},
    calculate: async (ctx: RequestContext, order: any) => {
        const zoneName = (order?.customFields ?? {}).campusZone as string | undefined;
        if (!zoneName || !feeLookup) {
            return { price: 0, priceWithTax: 0 };
        }
        const fee = await feeLookup(ctx, zoneName);
        return { price: fee, priceWithTax: fee };
    },
});
```

- [ ] **Step 6: shop resolver**（新建 `campus-order-shop.resolver.ts`）

```ts
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Ctx, ID, RequestContext } from '@vendure/core';
import { CampusOrderService } from './campus-order.service';

@Resolver()
export class CampusOrderShopResolver {
    constructor(private campusOrderService: CampusOrderService) {}

    @Mutation()
    async campusSetDeliveryTarget(
        @Ctx() ctx: RequestContext,
        @Args('zoneId') zoneId: ID,
        @Args('buildingId') buildingId: ID,
    ) {
        return this.campusOrderService.setDeliveryTarget(ctx, zoneId, buildingId);
    }
}
```

- [ ] **Step 7: 注册进 plugin**（`campus-delivery.plugin.ts`）

import 区追加：

```ts
import { CampusOrderService } from './campus-order.service';
import { CampusOrderShopResolver } from './campus-order-shop.resolver';
import { campusZoneFeeCalculator, setCampusZoneFeeLookup } from './campus-zone-fee.calculator';
import { TransactionalConnection } from '@vendure/core';
```

`providers` 数组加 `CampusOrderService`；shopApiExtensions.resolvers 数组加 `CampusOrderShopResolver`；shop schema 的 `extend type Mutation` 内追加一行：

```graphql
                    campusSetDeliveryTarget(zoneId: ID!, buildingId: ID!): Order!
```

插件类改为（注入 connection + 注册 calculator + bootstrap 挂 feeLookup）：

```ts
export class CampusDeliveryPlugin implements OnApplicationBootstrap {
    constructor(private eventBus: EventBus, private hallService: HallService, private connection: TransactionalConnection) {}

    onApplicationBootstrap(): void {
        this.eventBus.ofType(OrderPlacedEvent).subscribe(({ ctx, order }) =>
            this.hallService.onOrderPlaced(ctx, order).catch(e => Logger.error(String(e), 'CampusHall')),
        );
        setCampusZoneFeeLookup(async (ctx, zoneName) => {
            const zone = await this.connection.getRepository(ctx, CampusZone).findOne({
                where: { name: zoneName, channelId: ctx.channelId as any },
            });
            return zone?.fee ?? 0;
        });
    }
}
```

`configuration` 回调内在 `config.customFields = ...` 之前追加 calculator 注册：

```ts
        config.shippingOptions = config.shippingOptions ?? {};
        config.shippingOptions.customCalculators = [
            ...(config.shippingOptions.customCalculators ?? []),
            campusZoneFeeCalculator,
        ];
```

import 区确认已有 `CampusZone`（第 7 行已有）。

- [ ] **Step 8: 全量测试 + 构建**

```bash
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run && npm run build
```

Expected: 全部 spec PASS，lib 重编译。

- [ ] **Step 9: Commit**

```bash
cd e:\zhao\vendure && git add packages/campus-delivery-plugin && git commit -m "feat(campus): campusSetDeliveryTarget 回写配送目标 + 分区运费计算器"
```

---

### Task 2: vshop API 层——campus queries / mutations

**Files:**
- Create: `e:\zhao\vshop\src\api\queries\campus.ts`
- Create: `e:\zhao\vshop\src\api\mutations\campus.ts`

- [ ] **Step 1: 查询层**（新建 `src/api/queries/campus.ts`，写法对齐 pickup.ts）

```ts
import { getGraphQLClient } from '../client';

/** 校园履约视图的订单片段：含 campus/delivery customFields（deliveredAt 等由 delivery-plugin 注册） */
export const CAMPUS_ORDER_FRAGMENT = `
    fragment CampusOrder on Order {
        id code state totalQuantity totalWithTax shippingWithTax currencyCode createdAt
        lines {
            id quantity linePriceWithTax unitPriceWithTax
            productVariant { id name }
            featuredAsset { preview }
        }
        shippingAddress { fullName phoneNumber }
        customFields {
            fulfillmentRoute orderKind buildingId campusZone
            hallStatus hallEnteredAt tip riderEarning
            deliveryStatus deliveryPhotos deliveryNote exceptionType exceptionNote
        }
    }
`;

export async function getCampusZones() {
    const client = getGraphQLClient();
    return client.request(`query { campusZones { id name fee } }`);
}

export async function getCampusBuildings(zoneId?: string) {
    const client = getGraphQLClient();
    return client.request(
        `query($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name detail zoneId } }`,
        zoneId ? { zoneId } : {},
    );
}

export async function getMyRiderProfile() {
    const client = getGraphQLClient();
    return client.request(
        `query { myRiderProfile { customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit } }`,
    );
}

export async function getCampusHall() {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        query CampusHall { campusHall { ...CampusOrder } }`);
}

export async function getCampusMyTasks(status?: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        query CampusMyTasks($status: String) { campusMyTasks(status: $status) { ...CampusOrder } }`,
        status ? { status } : {});
}

export async function getMyRiderEarnings(skip = 0, take = 50) {
    const client = getGraphQLClient();
    return client.request(
        `query($skip: Int, $take: Int) { myRiderEarnings(skip: $skip, take: $take) { id orderId amount tip status createdAt } }`,
        { skip, take },
    );
}

/** 订单详情页校园履约卡用：shop API order(code) 单查 */
export async function getCampusOrder(code: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        query CampusOrder($code: String!) { order(code: $code) { ...CampusOrder } }`, { code });
}
```

- [ ] **Step 2: 变更层**（新建 `src/api/mutations/campus.ts`）

```ts
import { getGraphQLClient } from '../client';
import { CAMPUS_ORDER_FRAGMENT } from '../queries/campus';

export async function campusSetDeliveryTarget(zoneId: string, buildingId: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        mutation CampusTarget($zoneId: ID!, $buildingId: ID!) {
            campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId) { ...CampusOrder }
        }`, { zoneId, buildingId });
}

export async function applyRider(realName: string, studentNo: string, campus: string, idImg?: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation ApplyRider($realName: String!, $studentNo: String!, $campus: String!, $idImg: String) {
            applyRider(realName: $realName, studentNo: $studentNo, campus: $campus, idImg: $idImg) { status }
        }`,
        { realName, studentNo, campus, idImg: idImg || null },
    );
}

export async function campusGrabOrder(orderId: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        mutation CampusGrab($orderId: ID!) { campusGrabOrder(orderId: $orderId) { ...CampusOrder } }`, { orderId });
}

export async function campusStartTask(orderId: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        mutation CampusStart($orderId: ID!) { campusStartTask(orderId: $orderId) { ...CampusOrder } }`, { orderId });
}

export async function campusDeliverTask(orderId: string, photos: string[], note?: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        mutation CampusDeliver($orderId: ID!, $photos: [String!]!, $note: String) {
            campusDeliverTask(orderId: $orderId, photos: $photos, note: $note) { ...CampusOrder }
        }`, { orderId, photos, note: note || null });
}

export async function campusReportException(orderId: string, type: string, photos: string[], note?: string) {
    const client = getGraphQLClient();
    return client.request(`${CAMPUS_ORDER_FRAGMENT}
        mutation CampusReport($orderId: ID!, $type: String!, $photos: [String!]!, $note: String) {
            campusReportException(orderId: $orderId, type: $type, photos: $photos, note: $note) { ...CampusOrder }
        }`, { orderId, type, photos, note: note || null });
}
```

- [ ] **Step 3: 类型检查**

```bash
cd e:\zhao\vshop && npx vue-tsc --noEmit 2>&1 | head -20
```

Expected: campus 两个文件无报错（既有文件历史报错可忽略，只关注新增文件路径）。

- [ ] **Step 4: Commit**

```bash
cd e:\zhao\vshop && git add src/api/queries/campus.ts src/api/mutations/campus.ts && git commit -m "feat(campus): C 端 campus API 层"
```

---

### Task 3: BuildingPickerSheet 宿舍楼选择弹层

**Files:**
- Create: `e:\zhao\vshop\src\components\BuildingPickerSheet.vue`

- [ ] **Step 1: 组件实现**（结构/样式泛化自 PickupLocationSheet.vue，分区 chips + 楼栋列表）

```vue
<template>
  <view v-if="visible" class="sheet-mask" @click.self="close">
    <view class="sheet">
      <view class="sheet__head">
        <text class="sheet__title">选择宿舍楼</text>
        <view class="sheet__head-actions">
          <text class="sheet__close" @click="close">✕</text>
          <text class="sheet__top-confirm" :class="{ disabled: !tempBuildingId }" @click="confirm">确定</text>
        </view>
      </view>

      <view class="sheet__zones">
        <view
          v-for="z in zones"
          :key="z.id"
          class="sheet__zone"
          :class="{ active: z.id === tempZoneId }"
          @click="pickZone(z)"
        >
          <text>{{ z.name }}</text>
        </view>
      </view>

      <scroll-view class="sheet__list" scroll-y>
        <view
          v-for="b in buildings"
          :key="b.id"
          class="sheet__item"
          :class="{ active: b.id === tempBuildingId }"
          @click="selectItem(b)"
        >
          <view class="sheet__item-main">
            <text class="sheet__item-name">{{ b.name }}</text>
            <text v-if="b.detail" class="sheet__item-addr">{{ b.detail }}</text>
          </view>
          <text v-if="b.id === tempBuildingId" class="sheet__item-check">✓</text>
        </view>
        <view v-if="buildings.length === 0" class="sheet__empty">
          <text>该分区暂无宿舍楼</text>
        </view>
      </scroll-view>

      <button class="sheet__confirm" :disabled="!tempBuildingId" @click="confirm">确认</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export interface CampusZoneLite { id: string; name: string; fee: number }
export interface CampusBuildingLite { id: string; name: string; detail?: string; zoneId: string }

const props = withDefaults(defineProps<{
  visible: boolean;
  zones: CampusZoneLite[];
  buildings: CampusBuildingLite[];
  zoneId?: string;
  buildingId?: string;
}>(), {
  zoneId: '',
  buildingId: '',
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'zone-change', zoneId: string): void;
  (e: 'select', payload: { zone: CampusZoneLite; building: CampusBuildingLite }): void;
}>();

const tempZoneId = ref(props.zoneId);
const tempBuildingId = ref(props.buildingId);

watch(() => props.visible, (v) => {
  if (v) {
    tempZoneId.value = props.zoneId || (props.zones[0]?.id ?? '');
    tempBuildingId.value = props.buildingId;
  }
});

function pickZone(z: CampusZoneLite) {
  if (tempZoneId.value === z.id) return;
  tempZoneId.value = z.id;
  tempBuildingId.value = '';
  emit('zone-change', z.id);
}

function selectItem(b: CampusBuildingLite) {
  tempBuildingId.value = b.id;
}

function close() {
  emit('update:visible', false);
}

function confirm() {
  const zone = props.zones.find(z => z.id === tempZoneId.value);
  const building = props.buildings.find(b => b.id === tempBuildingId.value);
  if (zone && building) {
    emit('select', { zone, building });
  }
  emit('update:visible', false);
}
</script>

<style lang="scss" scoped>
.sheet-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); z-index: 999;
  display: flex; align-items: flex-end;
}
.sheet {
  background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0;
  padding: 30rpx; max-height: 70vh; display: flex; flex-direction: column;
  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
  &__head-actions { display: flex; align-items: center; gap: 24rpx; }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__close { font-size: 36rpx; color: #999; padding: 0 10rpx; }
  &__top-confirm {
    font-size: 30rpx; color: #fff; background: #6b4fff;
    padding: 8rpx 28rpx; border-radius: 32rpx; font-weight: 500;
    &.disabled { opacity: 0.4; }
  }
  &__zones { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 20rpx; }
  &__zone {
    padding: 10rpx 28rpx; border-radius: 32rpx; font-size: 26rpx;
    background: #f4f4f6; color: #666;
    &.active { background: #f0ecff; color: #6b4fff; font-weight: bold; }
  }
  &__list { flex: 1; max-height: 44vh; }
  &__item {
    padding: 24rpx 0; border-bottom: 1rpx solid #e8e8ea;
    display: flex; align-items: center; gap: 20rpx;
    &.active { background: #f0ecff; }
    &-main { flex: 1; min-width: 0; }
    &-name { font-size: 28rpx; font-weight: bold; display: block; }
    &-addr { font-size: 24rpx; color: #999; display: block; margin-top: 6rpx; }
    &-check { color: #6b4fff; font-weight: bold; }
  }
  &__empty {
    padding: 60rpx 0; text-align: center;
    text { font-size: 28rpx; color: #999; }
  }
  &__confirm {
    margin-top: 20rpx; height: 90rpx; background: #6b4fff;
    color: #fff; font-size: 32rpx; border-radius: 8rpx; border: none;
    &[disabled] { opacity: 0.5; }
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
cd e:\zhao\vshop && git add src/components/BuildingPickerSheet.vue && git commit -m "feat(campus): 宿舍楼选择弹层 BuildingPickerSheet"
```

---

### Task 4: checkout.vue 接入「校园配送」Tab

**Files:**
- Modify: `e:\zhao\vshop\src\pkg-order\pages\checkout.vue`

改动锚点（行号以当前文件为准，先 Read 再 Edit）：类型 L329、categorizeShipping L576、tabLabel L583、状态区 L359-366、switchTab L624、prepareOrderAddressAndShipping L1084、模板配送 Tab 段 L3-17、收货地址 section L20。

- [ ] **Step 1: import 与类型**

script import 区（`usePayment` import 行附近）追加：

```ts
import BuildingPickerSheet from '../../components/BuildingPickerSheet.vue';
import { getCampusZones, getCampusBuildings } from '../../api/queries/campus';
import { campusSetDeliveryTarget } from '../../api/mutations/campus';
import type { CampusZoneLite, CampusBuildingLite } from '../../components/BuildingPickerSheet.vue';
```

L329 类型改为：

```ts
type ShippingCategory = 'shipping' | 'store-pickup' | 'point-pickup' | 'employee-pickup' | 'campus';
```

- [ ] **Step 2: 状态**（L366 `showPickupSheet` 声明后追加）

```ts
// 校园配送相关 state
const campusZones = ref<CampusZoneLite[]>([]);
const campusBuildings = ref<CampusBuildingLite[]>([]);
const campusZoneId = ref('');
const selectedZone = ref<CampusZoneLite | null>(null);
const selectedBuilding = ref<CampusBuildingLite | null>(null);
const showBuildingSheet = ref(false);
```

- [ ] **Step 3: 分类与文案**（categorizeShipping / tabLabel 各加一行）

```ts
function categorizeShipping(sm: any): ShippingCategory {
    if (sm.code === 'campus-delivery') return 'campus';
    if (sm.code === 'store-pickup') return 'store-pickup';
    if (sm.code === 'pickup-point') return 'point-pickup';
    if (sm.code === 'employee-pickup') return 'employee-pickup';
    return 'shipping';
}
```

```ts
function tabLabel(cat: ShippingCategory): string {
    const labels: Record<ShippingCategory, string> = {
        shipping: '快递配送',
        'store-pickup': '门店自提',
        'point-pickup': '菜鸟驿站',
        'employee-pickup': '职工自提',
        'campus': '校园配送',
    };
    return labels[cat] || '配送方式';
}
```

- [ ] **Step 4: 加载与选择函数**（switchTab 前插入）

```ts
async function loadCampusBuildings(zoneId: string) {
    try {
        const res: any = await getCampusBuildings(zoneId);
        campusBuildings.value = res.campusBuildings || [];
    } catch (e) { console.warn('[checkout] load campusBuildings failed', e); campusBuildings.value = []; }
}

function onCampusZoneTap(z: CampusZoneLite) {
    campusZoneId.value = z.id;
    selectedZone.value = z;
    selectedBuilding.value = null;
    loadCampusBuildings(z.id);
}

async function onBuildingSelected(payload: { zone: CampusZoneLite; building: CampusBuildingLite }) {
    selectedZone.value = payload.zone;
    selectedBuilding.value = payload.building;
    campusZoneId.value = payload.zone.id;
    // 回写配送目标（customFields + R3），并同步运费
    try {
        const res: any = await campusSetDeliveryTarget(payload.zone.id, payload.building.id);
        if (res?.campusSetDeliveryTarget?.id) cart.setOrder(res.campusSetDeliveryTarget);
    } catch (e: any) { ui.showToast(e?.response?.errors?.[0]?.message || '选择宿舍楼失败'); }
}
```

- [ ] **Step 5: switchTab 加 campus 分支**（在 `if (category === 'shipping') { ... return; }` 之后、`pickupLoading.value = true;` 之前插入）

```ts
    if (category === 'campus') {
        if (campusZones.value.length === 0) {
            try {
                const res: any = await getCampusZones();
                campusZones.value = res.campusZones || [];
                if (campusZones.value.length > 0 && !campusZoneId.value) {
                    campusZoneId.value = campusZones.value[0].id;
                    selectedZone.value = campusZones.value[0];
                    await loadCampusBuildings(campusZoneId.value);
                }
            } catch (e) { console.warn('[checkout] load campusZones failed', e); }
        }
        // 同步 shipping method 到后端（分区费用在选中宿舍楼后由 calculator 落到订单）
        try {
            const res: any = await setOrderShippingMethod([tab.method.id]);
            if (res?.setOrderShippingMethod?.id) cart.setOrder(res.setOrderShippingMethod);
        } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
        return;
    }
```

- [ ] **Step 6: prepareOrderAddressAndShipping 加 campus 分支**（L1084 函数内，`if (shippingCategory.value === 'shipping') {...}` 与 `else {...自提...}` 之间改写为三段）

```ts
async function prepareOrderAddressAndShipping(): Promise<boolean> {
    if (shippingCategory.value === 'shipping') {
        // 邮寄方式：设置收货地址（原逻辑不动）
        if (!selectedAddress.value) {
            if (!address.value.fullName || !address.value.phoneNumber || !address.value.streetLine1) {
                ui.showToast('请填写收货地址');
                return false;
            }
            await setOrderShippingAddress({ ...address.value, streetLine1: buildStreetLine1(address.value) });
        } else {
            await setOrderShippingAddress({
                id: selectedAddress.value.id,
                fullName: selectedAddress.value.fullName,
                phoneNumber: selectedAddress.value.phoneNumber,
                streetLine1: selectedAddress.value.streetLine1,
                streetLine2: selectedAddress.value.streetLine2 || '',
                city: selectedAddress.value.city,
                province: selectedAddress.value.province,
                postalCode: selectedAddress.value.postalCode || '',
                countryCode: selectedAddress.value.country?.code || 'CN',
            });
        }
    } else if (shippingCategory.value === 'campus') {
        // 校园配送：必须已选宿舍楼（运费目标已在 onBuildingSelected 回写）
        if (!selectedBuilding.value || !selectedZone.value) {
            ui.showToast('请选择宿舍楼');
            return false;
        }
        await setOrderShippingMethod([selectedShipping.value]);
    } else {
        // 自提方式：设置自提点（原逻辑不动）
        if (!selectedPickupLocation.value) {
            ui.showToast('请选择自提点');
            return false;
        }
        await setOrderPickupLocation(selectedPickupLocation.value.id, shippingCategory.value);
    }
    // Set shipping method
    if (selectedShipping.value && shippingCategory.value !== 'campus') await setOrderShippingMethod([selectedShipping.value]);
    return true;
}
```

注意最后一行的守卫：campus 分支已在前面 set 过，避免重复调用。

- [ ] **Step 7: 模板**——校园配送区块（插在「收货地址」section（`v-if="shippingCategory === 'shipping'"` 那个 view）之前）

```html
    <!-- 校园配送（选分区 + 宿舍楼） -->
    <view class="section" v-if="shippingCategory === 'campus'">
      <text class="section__title">送至宿舍</text>
      <view class="campus-zones" v-if="campusZones.length > 1">
        <view
          v-for="z in campusZones"
          :key="z.id"
          class="campus-zones__chip"
          :class="{ active: campusZoneId === z.id }"
          @click="onCampusZoneTap(z)"
        >
          <text>{{ z.name }}</text>
        </view>
      </view>
      <view class="campus-target" @click="showBuildingSheet = true">
        <view class="campus-target__main">
          <text class="campus-target__label">{{ selectedBuilding ? selectedBuilding.name : '选择宿舍楼' }}</text>
          <text v-if="selectedBuilding?.detail" class="campus-target__detail">{{ selectedBuilding.detail }}</text>
        </view>
        <text class="campus-target__arrow">▸</text>
      </view>
      <view v-if="selectedZone" class="campus-fee">
        <text>配送费</text>
        <text>¥{{ (selectedZone.fee / 100).toFixed(2) }}</text>
      </view>
    </view>
```

弹层组件（插在模板尾部、现有 `<PickupLocationSheet ...>` 同级）：

```html
    <BuildingPickerSheet
      :visible="showBuildingSheet"
      :zones="campusZones"
      :buildings="campusBuildings"
      :zone-id="campusZoneId"
      :building-id="selectedBuilding?.id || ''"
      @update:visible="showBuildingSheet = $event"
      @zone-change="onCampusZoneChangeFromSheet"
      @select="onBuildingSelected"
    />
```

script 追加（弹层内切分区时只刷新楼列表、不改已选区外状态）：

```ts
function onCampusZoneChangeFromSheet(zoneId: string) {
    campusZoneId.value = zoneId;
    selectedZone.value = campusZones.value.find(z => z.id === zoneId) || null;
    loadCampusBuildings(zoneId);
}
```

- [ ] **Step 8: 样式**（style 末尾追加）

```scss
.campus-zones {
  display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 16rpx;
  &__chip {
    padding: 10rpx 28rpx; border-radius: 32rpx; font-size: 26rpx;
    background: #f4f4f6; color: #666;
    &.active { background: #f0ecff; color: $brand-color; font-weight: bold; }
  }
}
.campus-target {
  display: flex; justify-content: space-between; align-items: center;
  padding: 24rpx; border: 1rpx solid #e8e8ea; border-radius: 12rpx;
  &__main { flex: 1; min-width: 0; }
  &__label { font-size: 28rpx; font-weight: bold; display: block; }
  &__detail { font-size: 24rpx; color: #999; display: block; margin-top: 6rpx; }
  &__arrow { color: #ccc; }
}
.campus-fee {
  display: flex; justify-content: space-between;
  margin-top: 16rpx; font-size: 26rpx; color: #666;
}
```

（`$brand-color` 为 vshop 全局 SCSS 变量，profile 页已用 `$brand-color`，直接可用；若编译报变量不存在则替换 `#6b4fff`。）

- [ ] **Step 9: 构建验证**

```bash
cd e:\zhao\vshop && npm run build:h5 2>&1 | tail -5
```

Expected: 构建成功无新增报错。

- [ ] **Step 10: Commit**

```bash
cd e:\zhao\vshop && git add src/pkg-order/pages/checkout.vue && git commit -m "feat(campus): checkout 校园配送 Tab（分区+宿舍楼+分区运费）"
```

---

### Task 5: order-detail.vue 校园履约卡

**Files:**
- Modify: `e:\zhao\vshop\src\pkg-order\pages\order-detail.vue`

- [ ] **Step 1: script 追加状态与加载**（import 区追加）

```ts
import { getCampusOrder, getCampusBuildings } from '../../api/queries/campus';
```

（`useI18n` 已有；在 `const trackingNo = ref('');` 附近追加状态。）

```ts
// 校园履约卡
const campusCf = ref<any>(null);
const campusBuildingName = ref('');

const CAMPUS_STEP_MAP: Record<string, string> = {
    open: '待骑手接单',
    grabbed: '骑手已接单',
    assigned: '骑手已接单',
    in_progress: '配送中',
    delivered: '已送达',
    exception: '配送异常',
};
const campusStepText = computed(() => campusCf.value ? (CAMPUS_STEP_MAP[campusCf.value.deliveryStatus || campusCf.value.hallStatus] || '处理中') : '');

async function loadCampusInfo(code: string) {
    try {
        const res: any = await getCampusOrder(code);
        const cf = res?.order?.customFields;
        if (!cf?.fulfillmentRoute) return;
        campusCf.value = cf;
        if (cf.buildingId) {
            const bRes: any = await getCampusBuildings();
            const b = (bRes?.campusBuildings || []).find((x: any) => String(x.id) === String(cf.buildingId));
            campusBuildingName.value = b?.name || '';
        }
    } catch (e) { console.warn('[order-detail] campus info failed', e); }
}

function previewCampusPhoto(i: number) {
    uni.previewImage({ urls: campusCf.value.deliveryPhotos || [], current: i });
}

function maskPhone(p?: string): string {
    if (!p) return '';
    return p.length >= 8 ? p.slice(0, 3) + '****' + p.slice(-4) : p;
}
```

onMounted 内加载订单成功后追加一行调用（在现有取数逻辑完成后）：

```ts
    if (order.value?.code) loadCampusInfo(order.value.code);
```

- [ ] **Step 2: 模板插卡**（插在「收货地址」section 与「物流信息」section 之间）

```html
    <view class="section" v-if="campusCf">
      <text class="section__title">校园配送</text>
      <view class="campus-card">
        <view class="campus-card__step"><text class="campus-card__step-text">{{ campusStepText }}</text></view>
        <view class="campus-card__row">
          <text class="campus-card__label">送达楼栋</text>
          <text>{{ campusCf.campusZone }}{{ campusBuildingName ? ' · ' + campusBuildingName : '' }}</text>
        </view>
        <view class="campus-card__row" v-if="order.shippingAddress?.phoneNumber">
          <text class="campus-card__label">联系电话</text>
          <text>{{ maskPhone(order.shippingAddress.phoneNumber) }}</text>
        </view>
        <view class="campus-card__row" v-if="campusCf.deliveryStatus === 'delivered'">
          <text class="campus-card__label">送达时间</text>
          <text>{{ formatTime(order.updatedAt) }}</text>
        </view>
        <view v-if="campusCf.deliveryPhotos?.length" class="campus-card__photos">
          <image
            v-for="(p, i) in campusCf.deliveryPhotos"
            :key="i"
            :src="p"
            mode="aspectFill"
            class="campus-card__photo"
            @click="previewCampusPhoto(i)"
          />
        </view>
        <view v-if="campusCf.exceptionType" class="campus-card__warn">
          <text>异常：{{ campusCf.exceptionType }}{{ campusCf.exceptionNote ? ' · ' + campusCf.exceptionNote : '' }}</text>
        </view>
      </view>
    </view>
```

- [ ] **Step 3: 样式**（style 末尾追加）

```scss
.campus-card {
  &__step { margin-bottom: 12rpx; }
  &__step-text { font-size: 30rpx; font-weight: bold; color: $brand-color; }
  &__row { display: flex; gap: 16rpx; font-size: 26rpx; padding: 6rpx 0;
    & text:last-child { flex: 1; } }
  &__label { color: #999; flex-shrink: 0; }
  &__photos { display: flex; gap: 12rpx; margin-top: 12rpx; }
  &__photo { width: 140rpx; height: 140rpx; border-radius: 8rpx; background: #f2f2f2; }
  &__warn { margin-top: 12rpx; font-size: 24rpx; color: #e64340; }
}
```

- [ ] **Step 4: 构建 + Commit**

```bash
cd e:\zhao\vshop && npm run build:h5 2>&1 | tail -3 && git add src/pkg-order/pages/order-detail.vue && git commit -m "feat(campus): 订单详情校园履约卡（进度/楼栋/送达照片）"
```

---

### Task 6: profile 骑手入口

**Files:**
- Modify: `e:\zhao\vshop\src\pages\profile\index.vue`

- [ ] **Step 1: 菜单项**（`menu-item` 列表「分销中心」之前插入）

```html
      <view class="menu-item" @click="navTo('/pkg-rider/pages/rider/apply')">
        <text>校园骑手</text><text class="menu-arrow">></text>
      </view>
```

- [ ] **Step 2: Commit**

```bash
cd e:\zhao\vshop && git add src/pages/profile/index.vue && git commit -m "feat(campus): profile 校园骑手入口"
```

---

### Task 7: pkg-rider 分包注册 + 骑手招募页

**Files:**
- Modify: `e:\zhao\vshop\src\pages.json`
- Create: `e:\zhao\vshop\src\pkg-rider\pages\rider\apply.vue`

- [ ] **Step 1: 分包注册**（pages.json 的 `subPackages` 数组末尾追加，注意前一个分包对象的 `}` 后补 `,`）

```json
        {
            "root": "pkg-rider",
            "pages": [
                {
                    "path": "pages/rider/apply",
                    "style": {
                        "navigationBarTitleText": "校园骑手"
                    }
                },
                {
                    "path": "pages/rider/hall",
                    "style": {
                        "navigationBarTitleText": "抢单大厅"
                    }
                },
                {
                    "path": "pages/rider/task",
                    "style": {
                        "navigationBarTitleText": "配送任务"
                    }
                },
                {
                    "path": "pages/rider/income",
                    "style": {
                        "navigationBarTitleText": "我的收入"
                    }
                }
            ]
        }
```

- [ ] **Step 2: apply 页实现**（新建 `src/pkg-rider/pages/rider/apply.vue`）

```vue
<template>
  <view class="apply-page">
    <!-- 状态态：pending / approved / suspended -->
    <view v-if="status === 'pending'" class="apply-page__state">
      <text class="apply-page__state-title">审核中</text>
      <text class="apply-page__state-desc">申请已提交，请等待管理员审核</text>
    </view>
    <view v-else-if="status === 'suspended'" class="apply-page__state">
      <text class="apply-page__state-title">已被停用</text>
      <text class="apply-page__state-desc">账号骑手身份已停用，如有疑问请联系管理员</text>
    </view>
    <view v-else-if="status === 'approved'" class="apply-page__state">
      <text class="apply-page__state-title">我是校园骑手</text>
      <text class="apply-page__state-desc">信用分 {{ profile?.riderCredit ?? 100 }}</text>
      <button class="apply-page__btn" @click="goHall">去抢单大厅</button>
      <button class="apply-page__btn apply-page__btn--ghost" @click="goTask">我的任务</button>
      <button class="apply-page__btn apply-page__btn--ghost" @click="goIncome">我的收入</button>
    </view>

    <!-- 申请表单 -->
    <view v-else class="apply-page__form">
      <view class="apply-page__banner">
        <text class="apply-page__banner-title">成为校园骑手</text>
        <text class="apply-page__banner-desc">勤工俭学 · 按单分成入余额 · 时间自由</text>
      </view>
      <view class="field">
        <text class="field__label">真实姓名</text>
        <input v-model="form.realName" placeholder="与 学生证/身份证 一致" class="field__input" />
      </view>
      <view class="field">
        <text class="field__label">学号</text>
        <input v-model="form.studentNo" placeholder="请输入学号" class="field__input" />
      </view>
      <view class="field">
        <text class="field__label">校区/宿舍区</text>
        <input v-model="form.campus" placeholder="如：本部 A 区" class="field__input" />
      </view>
      <view class="field">
        <text class="field__label">学生证照片（选填）</text>
        <view class="field__upload">
          <image v-if="idImgPreview" :src="idImgPreview" mode="aspectFill" class="field__img" @click="chooseIdImg" />
          <view v-else class="field__add" @click="chooseIdImg"><text>＋ 上传</text></view>
        </view>
      </view>
      <button class="apply-page__btn" :disabled="submitting" @click="submit">提交申请</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getMyRiderProfile } from '../../../api/queries/campus';
import { applyRider } from '../../../api/mutations/campus';
import { uploadCustomerAsset } from '../../../api/mutations/upload';

const status = ref<string>('loading');
const profile = ref<any>(null);
const form = ref({ realName: '', studentNo: '', campus: '' });
const idImgPreview = ref('');
const idImgSource = ref('');
const submitting = ref(false);

onMounted(async () => {
    try {
        const res: any = await getMyRiderProfile();
        profile.value = res.myRiderProfile;
        status.value = profile.value?.riderStatus || 'none';
    } catch (e) {
        // 未登录 → 跳登录页
        uni.reLaunch({ url: '/pages/login/index' });
    }
});

function chooseIdImg() {
    uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        success: async (res: any) => {
            try {
                uni.showLoading({ title: '上传中' });
                const asset = await uploadCustomerAsset(res.tempFilePaths[0]);
                idImgSource.value = asset.source;
                idImgPreview.value = asset.preview || asset.source;
            } catch (e: any) {
                uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
            } finally {
                uni.hideLoading();
            }
        },
    });
}

async function submit() {
    if (!form.value.realName || !form.value.studentNo || !form.value.campus) {
        uni.showToast({ title: '请完整填写姓名/学号/校区', icon: 'none' });
        return;
    }
    submitting.value = true;
    try {
        await applyRider(form.value.realName, form.value.studentNo, form.value.campus, idImgSource.value || undefined);
        status.value = 'pending';
        uni.showToast({ title: '申请已提交', icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '提交失败', icon: 'none' });
    } finally {
        submitting.value = false;
    }
}

function goHall() { uni.navigateTo({ url: '/pkg-rider/pages/rider/hall' }); }
function goTask() { uni.navigateTo({ url: '/pkg-rider/pages/rider/task' }); }
function goIncome() { uni.navigateTo({ url: '/pkg-rider/pages/rider/income' }); }
</script>

<style lang="scss" scoped>
.apply-page {
  min-height: 100vh; background: #f7f7f9; padding: 30rpx;
  &__state {
    background: #fff; border-radius: 16rpx; padding: 80rpx 40rpx; text-align: center;
  }
  &__state-title { font-size: 36rpx; font-weight: bold; display: block; }
  &__state-desc { font-size: 26rpx; color: #999; display: block; margin-top: 16rpx; }
  &__banner {
    background: #6b4fff; color: #fff; border-radius: 16rpx; padding: 50rpx 40rpx; margin-bottom: 30rpx;
  }
  &__banner-title { font-size: 38rpx; font-weight: bold; display: block; }
  &__banner-desc { font-size: 26rpx; opacity: 0.85; display: block; margin-top: 12rpx; }
  &__btn {
    margin-top: 40rpx; height: 90rpx; line-height: 90rpx; background: #6b4fff;
    color: #fff; font-size: 32rpx; border-radius: 12rpx; border: none;
    &--ghost { background: #fff; color: #6b4fff; border: 1rpx solid #6b4fff; }
    &[disabled] { opacity: 0.5; }
  }
}
.field {
  background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx;
  &__label { font-size: 26rpx; color: #666; display: block; margin-bottom: 14rpx; }
  &__input { height: 72rpx; border: 1rpx solid #e8e8ea; border-radius: 8rpx; padding: 0 20rpx; font-size: 28rpx; }
  &__upload { margin-top: 8rpx; }
  &__img { width: 200rpx; height: 200rpx; border-radius: 12rpx; }
  &__add {
    width: 200rpx; height: 200rpx; border: 1rpx dashed #ccc; border-radius: 12rpx;
    display: flex; align-items: center; justify-content: center;
    text { color: #999; font-size: 26rpx; }
  }
}
</style>
```

- [ ] **Step 3: 构建 + Commit**

```bash
cd e:\zhao\vshop && npm run build:h5 2>&1 | tail -3 && git add src/pages.json src/pkg-rider && git commit -m "feat(campus): pkg-rider 分包 + 骑手招募申请页"
```

---

### Task 8: rider/hall 抢单大厅

**Files:**
- Create: `e:\zhao\vshop\src\pkg-rider\pages\rider\hall.vue`

- [ ] **Step 1: 页面实现**（新建；15s 轮询 + 在线开关 + 倒计时/加急标 + 一键抢单）

```vue
<template>
  <view class="hall-page">
    <view class="hall-page__top">
      <view class="duty" :class="{ on: onDuty }" @click="toggleDuty">
        <text class="duty__dot"></text>
        <text>{{ onDuty ? '接单中' : '已暂停' }}</text>
      </view>
      <text class="hall-page__credit">信用分 {{ profile?.riderCredit ?? 100 }}</text>
    </view>

    <view v-if="!onDuty" class="hall-page__hint"><text>开启接单后每 15 秒自动刷新大厅</text></view>

    <scroll-view class="hall-page__list" scroll-y>
      <view v-for="o in hall" :key="o.id" class="order-card">
        <view class="order-card__head">
          <text class="order-card__code">#{{ o.code }}</text>
          <text v-if="urgent(o)" class="order-card__urgent">加急</text>
          <text v-if="(o.customFields?.tip ?? 0) > 0" class="order-card__tip">含小费 ¥{{ fmt(o.customFields.tip) }}</text>
        </view>
        <view class="order-card__row"><text class="order-card__label">送达</text>
          <text>{{ o.customFields?.campusZone || '-' }} · {{ buildingName(o.customFields?.buildingId) }}</text></view>
        <view class="order-card__row"><text class="order-card__label">商品</text>
          <text>{{ itemsSummary(o) }}</text></view>
        <view class="order-card__row"><text class="order-card__label">已等</text>
          <text>{{ waitMinutes(o) }} 分钟</text></view>
        <view class="order-card__foot">
          <text class="order-card__fee">配送费 ¥{{ fmt(o.shippingWithTax) }}</text>
          <button class="order-card__grab" @click="grab(o)">立即抢单</button>
        </view>
      </view>
      <view v-if="onDuty && hall.length === 0" class="hall-page__empty">
        <text>暂无可抢订单\n去忙别的，有单会自动刷出来</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onShow, onHide, onUnmounted } from 'vue';
import { getCampusHall, getCampusBuildings, getMyRiderProfile } from '../../../api/queries/campus';
import { campusGrabOrder } from '../../../api/mutations/campus';

const DUTY_KEY = 'rider_duty';
const onDuty = ref(uni.getStorageSync(DUTY_KEY) === '1');
const profile = ref<any>(null);
const hall = ref<any[]>([]);
const buildings = ref<any[]>([]);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
    // 骑手门禁：未 approved 一律回招募页
    try {
        const res: any = await getMyRiderProfile();
        profile.value = res.myRiderProfile;
        if (profile.value?.riderStatus !== 'approved') {
            uni.redirectTo({ url: '/pkg-rider/pages/rider/apply' });
            return;
        }
    } catch (e) {
        uni.reLaunch({ url: '/pages/login/index' });
        return;
    }
    try {
        const bRes: any = await getCampusBuildings();
        buildings.value = bRes.campusBuildings || [];
    } catch (e) { /* 楼名映射失败不阻塞大厅 */ }
    await refresh();
    startPolling();
});

onShow(() => { if (profile.value) startPolling(); });
onHide(stopPolling);
onUnmounted(stopPolling);

function startPolling() {
    stopPolling();
    if (!onDuty.value) return;
    timer = setInterval(refresh, 15000);
}
function stopPolling() {
    if (timer) { clearInterval(timer); timer = null; }
}

function toggleDuty() {
    onDuty.value = !onDuty.value;
    uni.setStorageSync(DUTY_KEY, onDuty.value ? '1' : '0');
    if (onDuty.value) { refresh(); startPolling(); } else { stopPolling(); }
}

async function refresh() {
    if (!onDuty.value) return;
    try {
        const res: any = await getCampusHall();
        hall.value = res.campusHall || [];
    } catch (e) { console.warn('[hall] refresh failed', e); }
}

async function grab(o: any) {
    try {
        uni.showLoading({ title: '抢单中' });
        await campusGrabOrder(o.id);
        uni.hideLoading();
        uni.showToast({ title: '抢单成功', icon: 'success' });
        await refresh();
        uni.navigateTo({ url: '/pkg-rider/pages/rider/task' });
    } catch (e: any) {
        uni.hideLoading();
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '手慢了', icon: 'none' });
        await refresh();
    }
}

function buildingName(id?: string): string {
    if (!id) return '待分配';
    const b = buildings.value.find(x => String(x.id) === String(id));
    return b?.name || '宿舍';
}
function itemsSummary(o: any): string {
    return (o.lines || []).map((l: any) => `${l.productVariant?.name || ''}x${l.quantity}`).join('、') || '-';
}
function waitMinutes(o: any): number {
    const t = o.customFields?.hallEnteredAt;
    if (!t) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 60000));
}
function urgent(o: any): boolean {
    return waitMinutes(o) >= 5; // T1：滞留 5 分钟加急
}
function fmt(fen: number): string {
    return ((fen || 0) / 100).toFixed(2);
}
</script>

<style lang="scss" scoped>
.hall-page {
  min-height: 100vh; background: #f7f7f9; padding: 24rpx;
  &__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
  &__credit { font-size: 26rpx; color: #666; }
  &__hint { text-align: center; padding: 40rpx 0; text { font-size: 26rpx; color: #999; } }
  &__list { height: calc(100vh - 140rpx); }
  &__empty { text-align: center; padding: 120rpx 0;
    text { font-size: 28rpx; color: #999; white-space: pre-line; } }
}
.duty {
  display: flex; align-items: center; gap: 12rpx;
  background: #fff; border-radius: 40rpx; padding: 12rpx 28rpx; font-size: 26rpx; color: #999;
  &__dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: #ccc; }
  &.on { color: #16a34a; .duty__dot { background: #16a34a; } }
}
.order-card {
  background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx;
  &__head { display: flex; align-items: center; gap: 16rpx; margin-bottom: 14rpx; }
  &__code { font-size: 30rpx; font-weight: bold; }
  &__urgent { font-size: 22rpx; color: #fff; background: #e64340; border-radius: 8rpx; padding: 4rpx 12rpx; }
  &__tip { font-size: 22rpx; color: #ff8a3d; background: #fff4ec; border-radius: 8rpx; padding: 4rpx 12rpx; }
  &__row { display: flex; gap: 16rpx; font-size: 26rpx; padding: 6rpx 0;
    text:last-child { flex: 1; } }
  &__label { color: #999; flex-shrink: 0; }
  &__foot { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; }
  &__fee { font-size: 30rpx; font-weight: bold; color: #6b4fff; }
  &__grab {
    height: 68rpx; line-height: 68rpx; padding: 0 40rpx; margin: 0;
    background: #6b4fff; color: #fff; font-size: 28rpx; border-radius: 34rpx; border: none;
  }
}
</style>
```

- [ ] **Step 2: 构建 + Commit**

```bash
cd e:\zhao\vshop && npm run build:h5 2>&1 | tail -3 && git add src/pkg-rider/pages/rider/hall.vue && git commit -m "feat(campus): 骑手抢单大厅（15s 轮询+在线开关+加急标）"
```

---

### Task 9: rider/task 配送任务页

**Files:**
- Create: `e:\zhao\vshop\src\pkg-rider\pages\rider\task.vue`

- [ ] **Step 1: 页面实现**（新建；一次拉全部任务前端分 tab；开始配送/送达拍照/异常上报）

```vue
<template>
  <view class="task-page">
    <view class="task-page__tabs">
      <text class="tab" :class="{ on: tab === 'doing' }" @click="tab = 'doing'">进行中 ({{ doing.length }})</text>
      <text class="tab" :class="{ on: tab === 'done' }" @click="tab = 'done'">已完成 ({{ done.length }})</text>
      <text class="tab" :class="{ on: tab === 'exception' }" @click="tab = 'exception'">异常 ({{ exception.length }})</text>
    </view>

    <scroll-view class="task-page__list" scroll-y>
      <view v-for="o in currentList" :key="o.id" class="task-card">
        <view class="task-card__head" @click="expandId = expandId === o.id ? '' : o.id">
          <text class="task-card__code">#{{ o.code }}</text>
          <text class="task-card__state" :class="'s--' + (o.customFields?.deliveryStatus || '')">
            {{ stateText(o) }}</text>
        </view>
        <view class="task-card__row"><text class="task-card__label">送达</text>
          <text>{{ o.customFields?.campusZone || '-' }} · {{ buildingName(o.customFields?.buildingId) }}</text></view>
        <view class="task-card__row"><text class="task-card__label">学生</text>
          <text>{{ o.shippingAddress?.fullName || '-' }} {{ maskPhone(o.shippingAddress?.phoneNumber) }}</text></view>
        <view class="task-card__row"><text class="task-card__label">商品</text>
          <text>{{ itemsSummary(o) }}</text></view>

        <template v-if="expandId === o.id">
          <view class="task-card__steps">
            <text class="step" :class="{ on: stepAtLeast(o, 'assigned') }">已接单</text>
            <text class="step-arrow">›</text>
            <text class="step" :class="{ on: stepAtLeast(o, 'in_progress') }">已取货</text>
            <text class="step-arrow">›</text>
            <text class="step" :class="{ on: stepAtLeast(o, 'delivered') }">已送达</text>
          </view>

          <button v-if="o.customFields?.deliveryStatus === 'assigned'" class="task-card__btn" @click="start(o)">
            开始配送（已取到货）
          </button>

          <template v-if="o.customFields?.deliveryStatus === 'in_progress'">
            <view class="task-card__photos">
              <image v-for="(p, i) in deliverPhotos" :key="i" :src="p" mode="aspectFill" class="task-card__photo" />
              <view class="task-card__photo-add" @click="choosePhoto"><text>＋ 送达拍照</text></view>
            </view>
            <input v-model="deliverNote" placeholder="交接备注（选填，如：放门卫处）" class="task-card__note" />
            <button class="task-card__btn" :disabled="uploading" @click="deliver(o)">确认送达（需照片）</button>
          </template>

          <template v-if="['assigned', 'in_progress'].includes(o.customFields?.deliveryStatus)">
            <view class="task-card__exc">
              <picker :range="EXC_TYPES" range-key="label" @change="onExcType">
                <button class="task-card__btn task-card__btn--ghost" @click="noop">
                  异常上报{{ excType ? '：' + excTypeLabel : '' }}
                </button>
              </picker>
              <input v-if="excType" v-model="excNote" placeholder="异常说明" class="task-card__note" />
              <button v-if="excType" class="task-card__btn task-card__btn--warn" @click="report(o)">提交异常</button>
            </view>
          </template>

          <view v-if="o.customFields?.deliveryStatus === 'exception'" class="task-card__warn">
            <text>异常：{{ o.customFields?.exceptionType }}{{ o.customFields?.exceptionNote ? ' · ' + o.customFields?.exceptionNote : '' }}（已提交调度跟进）</text>
          </view>
        </template>
      </view>
      <view v-if="currentList.length === 0" class="task-page__empty"><text>暂无任务</text></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onShow } from 'vue';
import { getCampusMyTasks, getCampusBuildings } from '../../../api/queries/campus';
import { campusStartTask, campusDeliverTask, campusReportException } from '../../../api/mutations/campus';
import { uploadCustomerAsset } from '../../../api/mutations/upload';

const EXC_TYPES = [
    { value: 'no_recipient', label: '联系不上学生' },
    { value: 'goods_damaged', label: '商品破损' },
    { value: 'cannot_deliver', label: '无法配送' },
];
const tab = ref<'doing' | 'done' | 'exception'>('doing');
const tasks = ref<any[]>([]);
const buildings = ref<any[]>([]);
const expandId = ref('');
const deliverPhotos = ref<string[]>([]);
const deliverNote = ref('');
const excType = ref('');
const excNote = ref('');
const uploading = ref(false);

const doing = computed(() => tasks.value.filter(o => ['assigned', 'in_progress'].includes(o.customFields?.deliveryStatus)));
const done = computed(() => tasks.value.filter(o => o.customFields?.deliveryStatus === 'delivered'));
const exception = computed(() => tasks.value.filter(o => o.customFields?.deliveryStatus === 'exception'));
const currentList = computed(() => tab.value === 'doing' ? doing.value : tab.value === 'done' ? done.value : exception.value);

onMounted(async () => {
    try {
        const bRes: any = await getCampusBuildings();
        buildings.value = bRes.campusBuildings || [];
    } catch (e) { /* 忽略 */ }
});
onShow(refresh);

async function refresh() {
    try {
        const res: any = await getCampusMyTasks();
        tasks.value = res.campusMyTasks || [];
    } catch (e) { console.warn('[task] refresh failed', e); }
}

async function start(o: any) {
    try {
        await campusStartTask(o.id);
        uni.showToast({ title: '已开始配送', icon: 'success' });
        await refresh();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '操作失败', icon: 'none' });
    }
}

function choosePhoto() {
    uni.chooseImage({
        count: 3,
        sizeType: ['compressed'],
        success: async (res: any) => {
            uploading.value = true;
            try {
                uni.showLoading({ title: '上传中' });
                for (const p of res.tempFilePaths) {
                    const asset = await uploadCustomerAsset(p);
                    deliverPhotos.value.push(asset.source);
                }
            } catch (e: any) {
                uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
            } finally {
                uni.hideLoading();
                uploading.value = false;
            }
        },
    });
}

async function deliver(o: any) {
    if (deliverPhotos.value.length === 0) {
        uni.showToast({ title: '送达需至少一张照片', icon: 'none' });
        return;
    }
    try {
        await campusDeliverTask(o.id, deliverPhotos.value, deliverNote.value || undefined);
        uni.showToast({ title: '已送达，分成将入余额', icon: 'success' });
        deliverPhotos.value = [];
        deliverNote.value = '';
        expandId.value = '';
        await refresh();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '操作失败', icon: 'none' });
    }
}

function onExcType(e: any) {
    excType.value = EXC_TYPES[e.detail.value]?.value || '';
}
async function report(o: any) {
    try {
        await campusReportException(o.id, excType.value, deliverPhotos.value, excNote.value || undefined);
        uni.showToast({ title: '异常已上报', icon: 'success' });
        excType.value = '';
        excNote.value = '';
        await refresh();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '操作失败', icon: 'none' });
    }
}

function noop() { /* picker 内 button 仅承载样式 */ }

function buildingName(id?: string): string {
    if (!id) return '待分配';
    const b = buildings.value.find(x => String(x.id) === String(id));
    return b?.name || '宿舍';
}
function itemsSummary(o: any): string {
    return (o.lines || []).map((l: any) => `${l.productVariant?.name || ''}x${l.quantity}`).join('、') || '-';
}
function stateText(o: any): string {
    const s = o.customFields?.deliveryStatus;
    return ({ assigned: '待取货', in_progress: '配送中', delivered: '已送达', exception: '异常' } as any)[s] || '-';
}
function stepAtLeast(o: any, target: string): boolean {
    const order = ['assigned', 'in_progress', 'delivered'];
    const cur = o.customFields?.deliveryStatus;
    if (!cur) return false;
    return order.indexOf(cur) >= order.indexOf(target);
}
function maskPhone(p?: string): string {
    if (!p) return '';
    return p.length >= 8 ? p.slice(0, 3) + '****' + p.slice(-4) : p;
}
</script>

<style lang="scss" scoped>
.task-page {
  min-height: 100vh; background: #f7f7f9; padding: 24rpx;
  &__tabs { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .tab { padding: 12rpx 28rpx; border-radius: 32rpx; background: #fff; font-size: 26rpx; color: #666;
      &.on { background: #6b4fff; color: #fff; font-weight: bold; } } }
  &__list { height: calc(100vh - 130rpx); }
  &__empty { text-align: center; padding: 120rpx 0; text { font-size: 28rpx; color: #999; } }
}
.task-card {
  background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx;
  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14rpx; }
  &__code { font-size: 30rpx; font-weight: bold; }
  &__state { font-size: 24rpx; padding: 4rpx 16rpx; border-radius: 8rpx; background: #f4f4f6; color: #666;
    &.s--in_progress { background: #fff4ec; color: #ff8a3d; }
    &.s--delivered { background: #ecf9f0; color: #16a34a; }
    &.s--exception { background: #fdecec; color: #e64340; } }
  &__row { display: flex; gap: 16rpx; font-size: 26rpx; padding: 6rpx 0;
    text:last-child { flex: 1; } }
  &__label { color: #999; flex-shrink: 0; }
  &__steps { display: flex; align-items: center; gap: 16rpx; margin: 16rpx 0;
    .step { font-size: 24rpx; color: #999;
      &.on { color: #6b4fff; font-weight: bold; } }
    .step-arrow { color: #ccc; } }
  &__btn {
    margin-top: 16rpx; height: 80rpx; line-height: 80rpx; background: #6b4fff;
    color: #fff; font-size: 28rpx; border-radius: 12rpx; border: none;
    &--ghost { background: #fff; color: #666; border: 1rpx solid #e8e8ea; }
    &--warn { background: #e64340; }
    &[disabled] { opacity: 0.5; } }
  &__note {
    margin-top: 16rpx; height: 72rpx; border: 1rpx solid #e8e8ea; border-radius: 8rpx;
    padding: 0 20rpx; font-size: 26rpx; }
  &__photos { display: flex; gap: 12rpx; margin-top: 16rpx; flex-wrap: wrap; }
  &__photo { width: 140rpx; height: 140rpx; border-radius: 8rpx; background: #f2f2f2; }
  &__photo-add {
    width: 140rpx; height: 140rpx; border: 1rpx dashed #ccc; border-radius: 8rpx;
    display: flex; align-items: center; justify-content: center;
    text { font-size: 22rpx; color: #999; } }
  &__warn { margin-top: 16rpx; text { font-size: 24rpx; color: #e64340; } }
}
</style>
```

- [ ] **Step 2: 构建 + Commit**

```bash
cd e:\zhao\vshop && npm run build:h5 2>&1 | tail -3 && git add src/pkg-rider/pages/rider/task.vue && git commit -m "feat(campus): 骑手任务页（进度/送达拍照/异常上报）"
```

---

### Task 10: rider/income 收入页

**Files:**
- Create: `e:\zhao\vshop\src\pkg-rider\pages\rider\income.vue`

- [ ] **Step 1: 页面实现**（新建；分成流水 + 当前余额；提现闭环在 Plan 3 落地）

```vue
<template>
  <view class="income-page">
    <view class="income-page__balance">
      <text class="income-page__balance-label">当前余额（元）</text>
      <text class="income-page__balance-num">{{ balanceYuan }}</text>
      <text class="income-page__balance-link" @click="goBalanceHistory">余额明细 ›</text>
    </view>

    <view class="income-page__tip">
      <text>骑手分成按单自动入余额；提现通道规划中，可先用余额下单/充值卡抵扣</text>
    </view>

    <view class="income-page__list">
      <view v-for="e in earnings" :key="e.id" class="earning-row">
        <view class="earning-row__main">
          <text class="earning-row__title">配送分成 #{{ e.orderId }}</text>
          <text class="earning-row__time">{{ formatTime(e.createdAt) }}</text>
        </view>
        <text class="earning-row__amount">+¥{{ fmt(e.amount) }}{{ e.tip > 0 ? ' (含小费 ¥' + fmt(e.tip) + ')' : '' }}</text>
      </view>
      <view v-if="earnings.length === 0" class="income-page__empty"><text>暂无分成记录</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onShow } from 'vue';
import { getMyRiderEarnings } from '../../../api/queries/campus';
import { getMyBalance } from '../../../api/mutations/recharge';

const earnings = ref<any[]>([]);
const balance = ref(0);
const balanceYuan = computed(() => (balance.value / 100).toFixed(2));

onMounted(load);
onShow(load);

async function load() {
    try {
        const [eRes, bRes]: any[] = await Promise.all([
            getMyRiderEarnings(),
            getMyBalance(),
        ]);
        earnings.value = eRes.myRiderEarnings || [];
        balance.value = bRes.myRechargeBalance || 0;
    } catch (e) { console.warn('[income] load failed', e); }
}

function fmt(fen: number): string {
    return ((fen || 0) / 100).toFixed(2);
}
function formatTime(t: string): string {
    if (!t) return '';
    const d = new Date(t);
    return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function goBalanceHistory() {
    uni.navigateTo({ url: '/pkg-user/pages/balance-history' });
}
</script>

<style lang="scss" scoped>
.income-page {
  min-height: 100vh; background: #f7f7f9; padding: 24rpx;
  &__balance {
    background: #6b4fff; color: #fff; border-radius: 16rpx; padding: 50rpx 40rpx; margin-bottom: 20rpx;
  }
  &__balance-label { font-size: 26rpx; opacity: 0.85; display: block; }
  &__balance-num { font-size: 64rpx; font-weight: bold; display: block; margin-top: 12rpx; }
  &__balance-link { font-size: 24rpx; opacity: 0.85; display: block; margin-top: 12rpx; }
  &__tip {
    background: #fff4ec; color: #ff8a3d; border-radius: 12rpx; padding: 20rpx 24rpx;
    font-size: 24rpx; margin-bottom: 20rpx;
  }
  &__list { background: #fff; border-radius: 16rpx; padding: 8rpx 24rpx; }
  &__empty { text-align: center; padding: 80rpx 0; text { font-size: 28rpx; color: #999; } }
}
.earning-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 24rpx 0; border-bottom: 1rpx solid #f0f0f2;
  &:last-child { border-bottom: none; }
  &__main { display: flex; flex-direction: column; gap: 8rpx; }
  &__title { font-size: 28rpx; font-weight: bold; }
  &__time { font-size: 22rpx; color: #999; }
  &__amount { font-size: 30rpx; font-weight: bold; color: #16a34a; }
}
</style>
```

- [ ] **Step 2: 构建 + Commit**

```bash
cd e:\zhao\vshop && npm run build:h5 2>&1 | tail -3 && git add src/pkg-rider/pages/rider/income.vue && git commit -m "feat(campus): 骑手收入页（分成流水+余额）"
```

---

### Task 11: web-admin 骑手审核页

**Files:**
- Create: `e:\zhao\vshop\web-admin\src\apis\rider.ts`
- Create: `e:\zhao\vshop\web-admin\src\pages\rider\audit\index.vue`
- Modify: `e:\zhao\vshop\web-admin\src\pages.json`
- Modify: `e:\zhao\vshop\web-admin\src\constants\menus.ts`
- Modify: `e:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `e:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: API 层**（新建 `web-admin/src/apis/rider.ts`）

```ts
import { getAdminClient } from './client';

export interface RiderApplicationItem {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string;
  customFields: {
    riderStatus: string;
    riderRealName: string;
    riderStudentNo: string;
    riderCampus: string;
    riderIdImg: string;
    riderCredit: number;
  };
}

const RIDER_FIELDS = `
  id code firstName lastName emailAddress phoneNumber
  customFields {
    riderStatus riderRealName riderStudentNo riderCampus riderIdImg riderCredit
  }
`;

export async function fetchRiderApplications(status: string): Promise<RiderApplicationItem[]> {
  const client = getAdminClient();
  const r: any = await client.request(
    `query($status: String!) { riderApplications(status: $status) { ${RIDER_FIELDS} } }`,
    { status },
  );
  return r.riderApplications || [];
}

export async function setRiderStatus(customerId: string, status: 'approved' | 'suspended' | 'none'): Promise<void> {
  const client = getAdminClient();
  await client.request(
    `mutation($customerId: ID!, $status: String!) { campusSetRiderStatus(customerId: $customerId, status: $status) { status } }`,
    { customerId, status },
  );
}
```

- [ ] **Step 2: 审核页**（新建 `web-admin/src/pages/rider/audit/index.vue`，骨架对齐 pickup/index.vue：tab + card + locale.t）

```vue
<template>
  <view class="page">
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'pending' }" @tap="switchTab('pending')">{{ locale.t('riderAudit.tabPending') }}</text>
      <text class="tab" :class="{ on: tab === 'approved' }" @tap="switchTab('approved')">{{ locale.t('riderAudit.tabApproved') }}</text>
      <text class="tab" :class="{ on: tab === 'suspended' }" @tap="switchTab('suspended')">{{ locale.t('riderAudit.tabSuspended') }}</text>
    </view>

    <view class="card" v-for="a in items" :key="a.id">
      <view class="row">
        <view class="info">
          <view class="head">
            <text class="name">{{ a.customFields.riderRealName || (a.firstName + ' ' + a.lastName) }}</text>
            <text class="credit">{{ locale.t('riderAudit.credit') }} {{ a.customFields.riderCredit ?? 100 }}</text>
          </view>
          <text class="meta">{{ locale.t('riderAudit.studentNo') }}: {{ a.customFields.riderStudentNo || '-' }} · {{ a.customFields.riderCampus || '-' }}</text>
          <text class="meta">{{ a.emailAddress }}{{ a.phoneNumber ? ' · ' + a.phoneNumber : '' }}</text>
          <image
            v-if="a.customFields.riderIdImg"
            :src="a.customFields.riderIdImg"
            mode="aspectFill"
            class="idimg"
            @tap="preview(a.customFields.riderIdImg)"
          />
        </view>
      </view>
      <view class="ops">
        <template v-if="tab === 'pending'">
          <text class="ok" @tap="approve(a)">{{ locale.t('riderAudit.approve') }}</text>
          <text class="del" @tap="reject(a)">{{ locale.t('riderAudit.reject') }}</text>
        </template>
        <template v-else-if="tab === 'approved'">
          <text class="del" @tap="suspend(a)">{{ locale.t('riderAudit.suspend') }}</text>
        </template>
        <template v-else>
          <text class="ok" @tap="restore(a)">{{ locale.t('riderAudit.restore') }}</text>
        </template>
      </view>
    </view>
    <view v-if="!items.length" class="empty">{{ locale.t('riderAudit.empty') }}</view>
    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useLocaleStore } from '../../stores/localeStore';
import { fetchRiderApplications, setRiderStatus, RiderApplicationItem } from '../../apis/rider';

const locale = useLocaleStore();
const tab = ref<'pending' | 'approved' | 'suspended'>('pending');
const items = ref<RiderApplicationItem[]>([]);

async function reload() { items.value = await fetchRiderApplications(tab.value); }
async function switchTab(t: 'pending' | 'approved' | 'suspended') { tab.value = t; await reload(); }
onMounted(reload);

function preview(url: string) { uni.previewImage({ urls: [url] }); }

function confirmThen(title: string, content: string, fn: () => Promise<void>, done: string) {
  uni.showModal({
    title, content,
    success: async (r) => {
      if (!r.confirm) return;
      try { await fn(); uni.showToast({ title: done, icon: 'none' }); await reload(); }
      catch (e: any) { uni.showToast({ title: e?.message || locale.t('riderAudit.opFailed'), icon: 'none' }); }
    },
  });
}

function approve(a: RiderApplicationItem) {
  confirmThen(locale.t('riderAudit.approve'), `${a.customFields.riderRealName || a.emailAddress}`, () => setRiderStatus(a.id, 'approved'), locale.t('riderAudit.done'));
}
function reject(a: RiderApplicationItem) {
  confirmThen(locale.t('riderAudit.reject'), `${a.customFields.riderRealName || a.emailAddress}`, () => setRiderStatus(a.id, 'none'), locale.t('riderAudit.done'));
}
function suspend(a: RiderApplicationItem) {
  confirmThen(locale.t('riderAudit.suspend'), `${a.customFields.riderRealName || a.emailAddress}`, () => setRiderStatus(a.id, 'suspended'), locale.t('riderAudit.done'));
}
function restore(a: RiderApplicationItem) {
  confirmThen(locale.t('riderAudit.restore'), `${a.customFields.riderRealName || a.emailAddress}`, () => setRiderStatus(a.id, 'approved'), locale.t('riderAudit.done'));
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; min-height: 100vh; background: #f5f6fa; }
.tabs { display: flex; gap: 16rpx; margin-bottom: 24rpx;
  .tab { padding: 12rpx 28rpx; border-radius: 32rpx; background: #fff; font-size: 26rpx; color: #666;
    &.on { background: #2f54eb; color: #fff; font-weight: bold; } } }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx;
  .head { display: flex; justify-content: space-between; align-items: center; }
  .name { font-size: 30rpx; font-weight: bold; }
  .credit { font-size: 24rpx; color: #2f54eb; }
  .meta { font-size: 24rpx; color: #888; display: block; margin-top: 8rpx; }
  .idimg { width: 160rpx; height: 160rpx; border-radius: 12rpx; margin-top: 16rpx; background: #f2f2f2; } }
.ops { display: flex; gap: 32rpx; margin-top: 20rpx; justify-content: flex-end;
  .ok { color: #16a34a; font-size: 26rpx; }
  .del { color: #e64340; font-size: 26rpx; } }
.empty { text-align: center; padding: 100rpx 0; color: #999; font-size: 26rpx; }
</style>
```

- [ ] **Step 3: pages.json 注册**（pages 数组 `pages/pickup/redeem/index` 注册项之后追加）

```json
    { "path": "pages/rider/audit/index", "style": { "navigationBarTitleText": "骑手审核" } },
```

- [ ] **Step 4: 菜单**（`menus.ts` 的 `menu.domain.fulfillment` 组 items 内、`menu.pickupRedeem` 之后追加）

```ts
      { label: 'menu.riderAudit', url: '/pages/rider/audit/index', tier: 2 },
```

- [ ] **Step 5: i18n**（`zh-Hans.json` 顶层加键——先 Grep `"menu.pickupRedeem"` 定位就近插入；en.json 同步）

zh-Hans.json：

```json
  "menu.riderAudit": "骑手审核",
  "riderAudit.tabPending": "待审核",
  "riderAudit.tabApproved": "已通过",
  "riderAudit.tabSuspended": "已停用",
  "riderAudit.credit": "信用分",
  "riderAudit.studentNo": "学号",
  "riderAudit.approve": "通过",
  "riderAudit.reject": "拒绝",
  "riderAudit.suspend": "停用",
  "riderAudit.restore": "恢复",
  "riderAudit.empty": "暂无申请",
  "riderAudit.opFailed": "操作失败",
  "riderAudit.done": "已更新",
```

en.json：

```json
  "menu.riderAudit": "Rider Audit",
  "riderAudit.tabPending": "Pending",
  "riderAudit.tabApproved": "Approved",
  "riderAudit.tabSuspended": "Suspended",
  "riderAudit.credit": "Credit",
  "riderAudit.studentNo": "Student No.",
  "riderAudit.approve": "Approve",
  "riderAudit.reject": "Reject",
  "riderAudit.suspend": "Suspend",
  "riderAudit.restore": "Restore",
  "riderAudit.empty": "No applications",
  "riderAudit.opFailed": "Operation failed",
  "riderAudit.done": "Updated",
```

（JSON 键若为嵌套结构则按现有组织方式归位；`menu.riderAudit` 与 `riderAudit.*` 语义不变即可。）

- [ ] **Step 6: 构建验证**

```bash
cd e:\zhao\vshop\web-admin && npm run build 2>&1 | tail -3
```

Expected: 构建成功。

- [ ] **Step 7: Commit**

```bash
cd e:\zhao\vshop && git add web-admin/src/apis/rider.ts web-admin/src/pages/rider web-admin/src/pages.json web-admin/src/constants/menus.ts web-admin/src/locale && git commit -m "feat(campus): web-admin 骑手审核页"
```

---

### Task 12: 部署 + 一次性运费模板 + 冒烟截图 + 验收手册

**Files:**
- Create: `e:\zhao\vshop\docs\verify\_shot_campus_rider.py`
- Create: `e:\zhao\vshop\docs\verify\2026-10-campus-plan2-frontend.md`

- [ ] **Step 1: vendure 发布**

```bash
cd e:\zhao\vendure
git add packages/campus-delivery-plugin
git commit -m "chore(campus): lib 编译产物入库" --quiet
git push
ssh joho "cd /www/apps/vendure && git pull && pm2 restart vendure --update-env"
```

Expected: git pull 干净拉取；pm2 restart 成功（~24s 后 `curl -s https://e.joho.cn/shop-api` 返回 200）。插件 symlink（node_modules/@vendure/campus-delivery-plugin）Plan 1 已建好，无需重建。

- [ ] **Step 2: 一次性创建校园配送运费模板**（本地 PowerShell 执行；token 会随服务器重启失效，需现登现用）

```powershell
$login = curl.exe -s -D - -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -d '{\"query\":\"mutation Login($u: String!, $p: String!) { login(username: $u, password: $p) { ... on CurrentUser { id } ... on ErrorResult { errorCode message } } }\",\"variables\":{\"u\":\"superadmin\",\"p\":\"z123123\"}}'
$token = ($login | Select-String -Pattern 'vendure-auth-token: (\S+)').Matches[0].Groups[1].Value
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d '{\"query\":\"mutation { createShippingMethod(input: { code: \\\"campus-delivery\\\", fulfillmentHandler: \\\"manual-fulfillment\\\", checker: { code: \\\"default-shipping-eligibility-checker\\\", arguments: [{ name: \\\"orderMinimum\\\", value: \\\"0\\\" }] }, calculator: { code: \\\"campus-zone-fee-calculator\\\", arguments: [] }, translations: [{ languageCode: zh_CN, name: \\\"校园配送\\\", description: \\\"按校园分区计费\\\" }] }) { id code name } }\"}'
```

Expected: 返回 `{"data":{"createShippingMethod":{"id":"...","code":"campus-delivery",...}}}`。若报「calculator 不存在」，说明 Step 1 的 pm2 restart 未生效（`pm2 logs vendure --lines 20` 查启动日志）。

- [ ] **Step 3: 确认 shop-api 可见校园配送方式**

```bash
curl -s "https://e.joho.cn/shop-api" -H "Content-Type: application/json" -d '{"query":"{ eligibleShippingMethods { id name code price } }"}'
```

Expected: 列表含 `"code":"campus-delivery"`（无订单上下文时 price 为 0 属正常）。

- [ ] **Step 4: vshop 构建与部署**（本地构建 → tar → scp → 解压；遵循 index.bak_<时间戳> 惯例）

```powershell
cd e:\zhao\vshop
npm run build:h5
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
tar -czf "$env:TEMP\vshop-h5-$ts.tgz" -C dist/build/h5 .
scp "$env:TEMP\vshop-h5-$ts.tgz" joho:/tmp/
```

远程操作写脚本规避 PowerShell 展开问题（本地生成 deploy.sh → scp → ssh 执行）：

```powershell
@"
set -e
TS=$ts
ssh joho "sudo cp -r /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index.bak_$TS"
ssh joho "sudo rm -rf /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/* && sudo tar -xzf /tmp/vshop-h5-$TS.tgz -C /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/ && rm /tmp/vshop-h5-$TS.tgz"
"@ | Out-File -Encoding ascii "$env:TEMP\campus-deploy-$ts.sh"
scp "$env:TEMP\campus-deploy-$ts.sh" joho:/tmp/
ssh joho "sh /tmp/campus-deploy-$ts.sh"
```

Expected: `https://e.joho.cn` 打开为新版本（index.html 内容变化）。

- [ ] **Step 5: 冒烟截图脚本**（新建 `docs/verify/_shot_campus_rider.py`，390×844 dpr=2）

脚本约定：骑手账号需先在 web-admin 审核通过（superadmin 登录 admin-api 调 `campusSetRiderStatus(customerId, "approved")`，customerId 从 `riderApplications(status:"pending")` 取）；凭据走环境变量，不落库。

```python
# -*- coding: utf-8 -*-
"""2026-10-xx 校园配送 Plan2 手机视口取证：骑手招募/大厅/任务/收入 + web-admin 审核页。
用法：先导出 RIDER_TOKEN（骑手已审核账号的 shop-api token）与 ADMIN_TOKEN（superadmin）。
"""
import os
import sys

from playwright.sync_api import sync_playwright

OUT = r"e:\zhao\vshop\docs\verify\shots-campus-plan2"
RIDER_TOKEN = os.environ.get("RIDER_TOKEN", "")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

os.makedirs(OUT, exist_ok=True)
fails = []


def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        fails.append(label)


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


def mk_mobile_ctx(b):
    return b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                         locale="zh-CN", is_mobile=True, has_touch=True)


def inject_shop_token(pg, token):
    pg.goto("https://e.joho.cn/#/pages/profile/index", timeout=60000, wait_until="load")
    pg.evaluate("t => localStorage.setItem('vendure_session_token', t)", token)
    pg.reload(wait_until="load")
    pg.wait_for_timeout(5000)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)

        # --- 骑手端 ---
        ctx = mk_mobile_ctx(b)
        pg = ctx.new_page()
        inject_shop_token(pg, RIDER_TOKEN)

        pg.goto("https://e.joho.cn/#/pkg-rider/pages/rider/apply", wait_until="load")
        pg.wait_for_timeout(4000)
        shot(pg, "rider-00-apply.png")
        check("校园骑手" in pg.content(), "招募页可达")

        pg.goto("https://e.joho.cn/#/pkg-rider/pages/rider/hall", wait_until="load")
        pg.wait_for_timeout(5000)
        shot(pg, "rider-01-hall.png")
        check(("接单中" in pg.content()) or ("已暂停" in pg.content()), "大厅在线开关渲染")

        pg.goto("https://e.joho.cn/#/pkg-rider/pages/rider/task", wait_until="load")
        pg.wait_for_timeout(4000)
        shot(pg, "rider-02-task.png")

        pg.goto("https://e.joho.cn/#/pkg-rider/pages/rider/income", wait_until="load")
        pg.wait_for_timeout(4000)
        shot(pg, "rider-03-income.png")
        check("当前余额" in pg.content(), "收入页余额渲染")

        # --- web-admin 骑手审核 ---
        if ADMIN_TOKEN:
            ctx2 = mk_mobile_ctx(b)
            pg2 = ctx2.new_page()
            pg2.goto("https://e.joho.cn/admin/#/pages/rider/audit/index", wait_until="load")
            pg2.evaluate("t => { localStorage.setItem('wa_auth_token', t); }", ADMIN_TOKEN)
            pg2.reload(wait_until="load")
            pg2.wait_for_timeout(5000)
            shot(pg2, "admin-04-rider-audit.png")
        ctx.close()
        b.close()

    print("\n==== SUMMARY ====")
    if fails:
        print("FAILED:", fails)
        sys.exit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: 全链路手工冒烟**（学生端用浏览器子代理 + 手机视口；骑手端复用上面脚本已截图）

1. admin-api 给测试分区建数据：`campusCreateZone(name:"A 区", fee:200)`、`campusCreateBuilding(name:"桂3栋", zoneId:<id>, detail:"1-6 层")`（幂等可跳过，Plan 1 已建）。
2. 学生账号加购任一商品 → checkout → 应出现「校园配送」Tab → 切 Tab 看分区/宿舍楼 → 选中楼后金额区配送费=分区 fee → 提交支付。
3. 骑手账号开 hall → 15s 内刷出新单 → 抢单 → task 页开始配送 → 拍照送达。
4. 学生 order-detail 应见「校园配送」履约卡（已送达 + 照片）；骑手 income 页出现分成记录；学生下单若用配送费 2.00 元则分成=2.00×rate%（默认 100%）。
5. web-admin 审核页：新申请出现 → 通过 → 骑手端 myRiderProfile 变 approved。

- [ ] **Step 7: 验收手册**（新建 `docs/verify/2026-10-campus-plan2-frontend.md`）

内容框架（全部用实测结果填写，不留占位）：

```markdown
# 校园配送 Plan 2（C 端 + 骑手端）验收手册

日期：<YYYY-MM-DD> ｜ 执行人：<name> ｜ 代码：<commit range>

## 交付范围
- checkout 校园配送 Tab（分区/宿舍楼/分区运费）
- order-detail 校园履约卡
- pkg-rider：apply / hall / task / income
- web-admin rider/audit
- vendure：myRiderEarnings、campusSetDeliveryTarget、campus-zone-fee-calculator、campus-delivery 运费模板

## 回归证据
- vendure 插件 vitest：<N>/<N> PASS
- 截图：docs/verify/shots-campus-plan2/*.png（390×844 dpr=2，逐张列出断言结果）
- 全链路冒烟：下单→入厅→抢单→送达→分成入账（附订单号/分成金额）

## 遗留
- （如：运力暂停开关、预约时段 → Plan 3）
```

- [ ] **Step 8: 推送 vshop**

```bash
cd e:\zhao\vshop && git push
```

（若 vshop 无 remote，则仅本地提交，与仓库现状一致。）

---

## Self-Review 记录

1. **Spec 覆盖**（§7 C 端 / §8 骑手端 / §9 管理端部分）：checkout 动态 Tab（Task 4，数据源为 eligibleShippingMethods=campus-delivery 模板）、宿舍楼选择（Task 3/4）、分区运费实时计算（Task 1 calculator + Task 4 展示）；order-detail 履约卡（Task 5，R2 快递轨迹沿用现有物流信息区块）；profile 入口（Task 6）；apply/hall/task/income（Task 7-10）；骑手审核（Task 11）。**不属于本计划**：跑腿单 R5 页面、预约时段 chips、送达时段、调度页、履约配置页、提现闭环、订阅消息提醒 → Plan 3。R1 第一程交接（confirmPickupHandover 商家侧）→ Plan 3 调度页一并处理。
2. **占位符扫描**：无 TBD/TODO；「提现通道规划中」为面向用户的真实文案而非计划占位。
3. **类型一致性**：`myEarnings(ctx, skip, take)` ↔ resolver `myRiderEarnings(skip, take)`；`campusSetDeliveryTarget(zoneId, buildingId)` 前后端一致；`setCampusZoneFeeLookup` port 与 bootstrap 注入签名一致（ctx, zoneName）；CAMPUS_ORDER_FRAGMENT 字段与 Plan 1 customFields 清单一致（deliveryStatus/deliveryPhotos/deliveryNote/exceptionType/exceptionNote/assignedAt/deliveredAt 由 delivery-plugin 注册，schema 已含）。
