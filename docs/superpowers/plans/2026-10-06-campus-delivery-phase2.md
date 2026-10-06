# 校园配送二期（R2/R4/R5 下单闭环 + 起送价硬校验）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已上线的 R1/R3 商品单+T0-T4 调度之上，补齐 R2 快递到校确认/接力发单、R4 到店自取、R5 校内拾光达发单页的学生端闭环，并把起送价从软提示升级为后端硬校验。

**Architecture:** 三仓顺序改造。① vendure `campus-delivery-plugin`：errandBaseFee 配置列+透出+R5 计价、OrderProcess 起送价硬校验、markArrived 幂等补强、R2 接力反查 shop query、R4 自提点幂等 upsert（复用 cjk PickupLocation）、R2 下单链路放行+campusErrandVariant。② web-admin：拾光达配置页加「跑腿起步价」。③ waimai：checkout 路线组动态化（R1/R2/R3）、pkg-campus 发单页/我的跑腿单、首页入口卡、订单详情 R2 卡+R4 核销码。R2 联动语义（T4 只退接力单/原单动态反查）依赖「R2 原单不入厅（hall.service 只收 errand/R1/R3）+ R5 接力单即普通跑腿单」，后端调度零改动。

**Tech Stack:** Vendure 3.6.4（NestJS/TypeORM/gql + vitest）；web-admin uni-app Vue3 + graphql-request v7；waimai uni-app Vue3 + vitest。

**Spec（唯一事实源）:** `d:\zhao\vshop\docs\superpowers\specs\2026-10-06-campus-delivery-phase2-design.md`

**硬规则（全程适用）:**
- PowerShell：不支持 `&&`（用 `;` 或两条命令）；commit 用单行 ASCII `-m`。
- 金额一律**分**存储/传输；web-admin 页面层分↔元（复用 `utils/money.ts`）；waimai 展示层 `/100`。
- 品牌文案只用「拾光达 / 拾光传信者（短称：传信者）」；代码注释/字段名/接口名保留「骑手/errand/campus」不动。
- plugin 改 src 后必须本地 build 且 **src+lib 一起提交**（lib 是 git 跟踪产物）：`cd d:\zhao\vendure\packages\campus-delivery-plugin; npx tsc -p tsconfig.build.json` 或 `npm run build`（等价 rimraf lib + tsc）。
- 测试命令：
  - plugin：`cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
  - waimai：`cd d:\zhao\waimai; pnpm exec vitest run`
- 工作区前置检查：三仓 2026-10-06 已 stash 污染快照（stash message「pre-phase2 polluted snapshot」），执行前 `git status --short` 应干净（vendure 无改动、vshop 仅剩 untracked scripts、waimai 无改动）；如有 M/D 先停下汇报。
- 手机截图规范：Playwright 390×844 dpr=2；交付前逐张目检。

**关键现状（探索已核实，执行者可直接信赖）:**
- shop-api 已有 mutation `campusMarkArrived(orderId)`（[campus-delivery.plugin.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts) shop schema 内），service 在 `r2-mark.service.ts`，**缺幂等/leg1Status 校验**（Task 6 补）。
- 一期 store-config 6 字段已在 HEAD（entity/migration/waimai-store.service/admin schema/web-admin 页面全齐），本计划只在其上叠加 errandBaseFee。
- `CampusErrandInput`（shop schema）：`kind/fromText/toText/tip/buildingId/campusZone`；`ErrandService.setErrandInfo` 写 orderKind=errand + fulfillmentRoute=R5 + tip surcharge（幂等清理）。
- 0 元载体：`ErrandService.ensureErrandProduct`（SKU=CAMPUS-ERRAND-BASE 幂等）已有，但 **shop-api 无获取 variantId 的入口**（admin `campusEnsureErrandProducts` 仅后台用）→ Task 9 加 `campusErrandVariant`。
- `campusErrandCalculator`：R5/R1/R3 按分区 zone.fee 出价；R2 返回 undefined → R2 原单回落普通快递运费（=spec「快递段运费内含」语义，零改动）。
- R2 原单**不入大厅**（hall.service 只收 errand/R1/R3）→ T4 只会退接力单，spec §4.3.1 零改动达成。
- R4 自提点体系在 **cjk-plugin** 的 `PickupLocation` 实体（type 'store'|'point'|'employee'，channels M2M，ownerChannelId，remark 列可当标记）。shop query `pickupLocations(type)` 可见性规则（`applyVisibility`）：`(isPublic=true OR ownerChannelId=当前渠道) AND channels 含当前渠道 AND enabled=true`——Task 8 的 `isPublic:false + ownerChannelId=本渠道` 组合对本渠道**可见**。waimai checkout 自提 tab 已能选点（getPickupLocations）；核销 `myPickupCode`/`claimMyPickup`（pickup-plugin shop schema）已有，waimai 未接。
- waimai 锚点：checkout.vue campus tab（state 267-289、saveCampusTarget 310-320、`prepareOrderAddressAndShipping` 597-611 选 `code?.startsWith('campus-errand')`、支付链 `payCurrentOrder` 653-674：`addPaymentToOrder(method, metadata)` → PaymentSettled/Authorized 直接成，否则 `handlePayment(method, {...lastPayment, orderCode, orderState})`；支付方式加载 574-585：getEligiblePaymentMethods → filter isEligible → 按 code 去重 → 默认选首个）；路线切换 UI 模板 :49-50（`routeText` + `canSwitchRoute` 才显示「切换」）；首页金刚区 home/index.vue:14-27；order-detail.vue（确认收货按钮 :83、fetchOrderRider :97/:154、「平台调度中」dispatching :120-130）；ORDER_FRAGMENT customFields 仅含 `couponCode couponId hallStatus fulfillmentRoute deliveryStatus hallEnteredAt deliverySlotText campusZone`（fragments.ts:53）；pages.json subpackages：pkg-order、pkg-rider。
- waimai 现状修正：`api/queries/pickup.ts` **已存在**（getPickupLocations/getEmployeePickupLocations）→ Task 12 是追加不是新建；测试目录在**根级 `tests/`**（tests/timeline.spec.ts 等，vitest.config.ts 在根）；`api/mutations/campus.ts` 用 gql 文档 + `.then` 解包风格；`api/queries/waimai.ts` 导出 `fetchStoreList()`（含 channelToken 字段）；当前渠道 token 在 `useTenantStore().token`（stores/tenant.ts，menu 页 switchTenant 写入）。
- `utils/timeline.ts` buildTimeline 对 R2 走「未知路线回退单段四节点」（传信者取餐/配送中——R2 快递段语义错误）→ Task 18 加 R2 分支（第 4 参 leg1Status，R5 回退行为被既有测试钉死不受影响）。
- `errand.service.setErrandInfo` 现把 `errandFrom` 写为 `input.fromText`（A 点文字）；errandFrom 在 waimai 前端**零消费**（rider-home/rider-delivering 只显示 campusZone/buildingId/fulfillmentRoute）→ 接力单用 `errandFrom=原单号` 覆盖安全（Task 9 加覆盖入参）。
- `myOrders` 无 customField 过滤 → 跑腿单列表前端过滤 `orderKind==='errand'`；且**必须跨渠道聚合**（`getOrdersForChannel` 逐渠道查，同 pages/orders/index.vue 模式——单渠道 `getOrders` 会漏掉落在其他店铺渠道的跑腿单）。
- R2 原单**无完成路径**：`canReceive` 仅认 state∈[Delivered,PartiallyDelivered,Shipped]，而 R2 原单不入厅、无骑手、停 PaymentSettled → Task 18 扩展 canReceive（R2+arrived_gate+PaymentSettled 放行确认收货），否则「我去自取…点击确认收货完成订单」无按钮可点。

**File Structure:**

vendure（root `d:\zhao\vendure`，包 `packages/campus-delivery-plugin/src/`）
- Modify：`campus-fulfillment-config.entity.ts`（+errandBaseFee）、`migrations/create-campus-tables.ts`（+ALTER）、`custom-fields.ts`（+errandNote）
- Modify：`waimai-store.service.ts` + `waimai-store.service.spec.ts`（errandBaseFee 透出/负数拒绝 + R4 自提点 upsert）
- Create：`min-order.process.ts` + `min-order.process.spec.ts`（起送价硬校验 OrderProcess）
- Modify：`campus-delivery.plugin.ts`（注册 process + schema 增补）
- Modify：`r2-mark.service.ts` + `r2-mark.service.spec.ts`（幂等/状态校验 + relayStatus）
- Create：`r2-shop.resolver.ts`（campusR2Relay query）
- Modify：`campus-config.service.ts`（setDeliveryTarget 放行 R2）+ `campus-config.service.spec.ts`
- Modify：`shipping-calculator.ts` + `shipping-calculator.spec.ts`（R5 改 errandBaseFee 计价）
- Modify：`errand.service.ts` + `errand.service.spec.ts`（note 写入 + getErrandBaseFee）、`errand-shop.resolver.ts`（campusErrandVariant）

web-admin（root `d:\zhao\vshop`，`web-admin/src/`）
- Modify：`apis/campus.ts`（类型/FIELDS +errandBaseFee）、`pages/campus/config.vue`（跑腿起步价表单项）、`locale/zh-Hans.json` + `locale/en.json`

waimai（root `d:\zhao\waimai`，`src/`；测试在根级 `tests/`）
- Modify：`api/fragments.ts`（customFields 增补）、`api/queries/waimai.ts`（errandBaseFee）、`api/mutations/campus.ts`（setErrandInfo/markArrived/fetchR2Relay/fetchErrandVariant/capacityCheck）、`api/queries/pickup.ts`（追加核销码两个函数）、`tests/timeline.spec.ts`（R2 分支用例）
- Create：`utils/errand.ts`、`tests/errand.spec.ts`
- Modify：`pkg-order/pages/checkout.vue`（路线组动态化 R1/R2/R3）、`pages/home/index.vue`（入口卡）、`pkg-order/pages/order-detail.vue`（R2 卡/接力子卡/核销码）、`utils/timeline.ts`（R2 分支）、`pages.json`（pkg-campus）
- Create：`pkg-campus/errand/create.vue`、`pkg-campus/errand/list.vue`

**任务顺序**：Task 1-10（vendure）→ Task 11（web-admin）→ Task 12-18（waimai）→ Task 19（回归+构建）→ Task 20（部署+截图+手册收口）。

---

## Task 1-10：vendure campus-delivery-plugin

### Task 1: errandBaseFee 实体列 + 幂等迁移

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-fulfillment-config.entity.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\migrations\create-campus-tables.ts`

- [ ] **Step 1: 实体加列**

`campus-fulfillment-config.entity.ts` 在 `storeNotice` 行后追加：

```ts
    @Column({ type: 'int', nullable: true }) errandBaseFee: number | null; // R5 跑腿起步价（分；null=默认 200）
```

- [ ] **Step 2: 迁移补 ALTER**

`migrations/create-campus-tables.ts` 模板字符串末尾（`storeNotice` 那条 ALTER 之后）追加：

```sql
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "errandBaseFee" int;
```

（若模板里没有 storeNotice 等 6 列 ALTER，说明文件不是 HEAD 版本——停下核对 git 状态。）

- [ ] **Step 3: 既有单测无回归**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/campus-fulfillment-config.entity.ts packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts
git commit -m "feat(campus): add errandBaseFee column to CampusFulfillmentConfig"
```

### Task 2: errandBaseFee 服务层透出 + 负数拒绝（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `waimai-store.service.spec.ts` 中：
① 找到 listStores 的正向用例（期望对象含 6 字段那组），期望对象与输入配置均加 `errandBaseFee`：
- 输入 config 加 `errandBaseFee: 300`
- `toEqual` 期望对象加 `errandBaseFee: 300`
② 空字段容错用例加 `expect(list[0].errandBaseFee).toBeNull();`
③ 文件末尾追加：

```ts
describe('WaimaiStoreService.updateStoreConfig errandBaseFee', () => {
    it('errandBaseFee 负数拒绝', async () => {
        const env = makeEnv({ channels: [{ id: 2, token: 'canteen', code: '一食堂', customFields: {} }] });
        await expect(env.svc.updateStoreConfig({} as any, 2, {
            routesEnabled: ['R1'], errandBaseFee: -1,
        } as any)).rejects.toThrow('不能为负数');
    });
    it('errandBaseFee 持久化并回读', async () => {
        const env = makeEnv({ channels: [{ id: 2, token: 'canteen', code: '一食堂', customFields: {} }] });
        const out = await env.svc.updateStoreConfig({} as any, 2, {
            routesEnabled: ['R5'], errandBaseFee: 300,
        } as any);
        expect(out.errandBaseFee).toBe(300);
    });
});
```

（`makeEnv` 为该 spec 现成的测试环境工厂；若名字不同以文件实际为准。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: FAIL（errandBaseFee 为 undefined/类型不存在）

- [ ] **Step 3: 实现**

`waimai-store.service.ts` 四处同步加 `errandBaseFee`：
① `WaimaiStore` 接口与 `CampusStoreConfigWithChannel` 接口各加 `errandBaseFee: number | null;`
② `listStores` 的 `stores.push({...})` 加 `errandBaseFee: cfg.errandBaseFee ?? null,`
③ `updateStoreConfig` 的 input 类型加 `errandBaseFee?: number | null;`；负数检查数组改为 `(['deliveryMinutes', 'minOrderAmount', 'deliveryFee', 'errandBaseFee'] as const)`；赋值区加 `cfg.errandBaseFee = input.errandBaseFee ?? null;`
④ `toConfigView` 返回对象加 `errandBaseFee: cfg?.errandBaseFee ?? null,`

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/waimai-store.service.ts packages/campus-delivery-plugin/src/waimai-store.service.spec.ts
git commit -m "feat(campus): expose errandBaseFee via store config service"
```

### Task 3: errandBaseFee GraphQL schema 增补

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`

- [ ] **Step 1: admin schema**

`campus-delivery.plugin.ts` adminApiExtensions schema 内：
- `type CampusStoreConfigWithChannel` 的 `storeNotice: String` 后加 `errandBaseFee: Int`
- `input CampusStoreConfigInput` 的 `storeNotice: String` 后加 `errandBaseFee: Int`

- [ ] **Step 2: shop schema**

shopApiExtensions schema 内 `type WaimaiStore` 的 `routesEnabled: [String!]!` 后（含一期 6 字段的完整列表末尾）加：

```graphql
    errandBaseFee: Int
```

- [ ] **Step 3: 全量单测 + Commit**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/campus-delivery.plugin.ts
git commit -m "feat(campus): errandBaseFee in admin/shop GraphQL schema"
```

### Task 4: R5 跑腿计价改 errandBaseFee（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\shipping-calculator.ts`
- Test: Create `d:\zhao\vendure\packages\campus-delivery-plugin\src\shipping-calculator.spec.ts`

- [ ] **Step 1: 写失败测试**

Create `shipping-calculator.spec.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindCampusErrandCalculatorConnection, campusErrandCalculator } from './shipping-calculator';

function makeCtx(channelId: number) { return { channelId } as any; }

describe('campusErrandCalculator', () => {
    const zoneRepo = { find: vi.fn() };
    const cfgRepo = { findOne: vi.fn() };
    beforeEach(() => {
        vi.clearAllMocks();
        bindCampusErrandCalculatorConnection({
            rawConnection: {
                getRepository: vi.fn((ent: any) => {
                    const n = ent.name ?? String(ent);
                    return n === 'CampusZone' ? zoneRepo : cfgRepo;
                }),
            },
        } as any);
    });
    afterEach(() => { bindCampusErrandCalculatorConnection(null as any); });

    it('R5 跑腿单：运费 = errandBaseFee（300 分）', async () => {
        cfgRepo.findOne.mockResolvedValue({ errandBaseFee: 300 });
        const res = await campusErrandCalculator.calculate(
            makeCtx(2),
            { customFields: { orderKind: 'errand' } } as any,
            {} as any, {} as any,
        );
        expect(res!.price).toBe(300);
    });

    it('R5 跑腿单：无配置回默认 200 分', async () => {
        cfgRepo.findOne.mockResolvedValue(null);
        const res = await campusErrandCalculator.calculate(
            makeCtx(2),
            { customFields: { orderKind: 'errand' } } as any,
            {} as any, {} as any,
        );
        expect(res!.price).toBe(200);
    });

    it('R1 单仍按分区 zone.fee', async () => {
        zoneRepo.find.mockResolvedValue([{ name: '东区', fee: 150 }]);
        const res = await campusErrandCalculator.calculate(
            makeCtx(2),
            { customFields: { orderKind: 'normal', fulfillmentRoute: 'R1', campusZone: '东区' } } as any,
            {} as any, {} as any,
        );
        expect(res!.price).toBe(150);
    });

    it('普通单/R2 返回 undefined（回落店铺普通运费）', async () => {
        for (const cf of [{}, { fulfillmentRoute: 'R2' }]) {
            const res = await campusErrandCalculator.calculate(
                makeCtx(2), { customFields: cf } as any, {} as any, {} as any,
            );
            expect(res).toBeUndefined();
        }
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: shipping-calculator.spec FAIL（R5 现在走 zone 分支）

- [ ] **Step 3: 实现**

`shipping-calculator.ts`：
① 顶部 import 加 `import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';`
② `calculate` 改为（保留原注释，更新说明）：

```ts
    calculate: async (ctx, order: Order) => {
        const cf = (order.customFields ?? {}) as any;
        const route = cf.fulfillmentRoute;
        const isErrand = cf.orderKind === 'errand';
        // R2 返回 undefined：快递段运费走店铺普通快递运费（接力费用由 R5 接力单单独承担）
        if (!isErrand && route !== 'R1' && route !== 'R3') return undefined;
        const conn = connectionRef;
        if (!conn) return undefined;
        if (isErrand) {
            // R5 跑腿费 = 固定起步价 errandBaseFee（后台可配；null=默认 200 分），不按分区
            const cfg = await conn.rawConnection.getRepository(CampusFulfillmentConfig).findOne({
                where: { channelId: ctx.channelId as any },
            });
            return {
                price: cfg?.errandBaseFee ?? 200,
                priceIncludesTax: true,
                taxRate: 0,
                metadata: { calculator: 'campus-errand', pricing: 'errand-base-fee' },
            };
        }
        const zones = (await conn.rawConnection.getRepository(CampusZone).find({
            where: { channelId: ctx.channelId as any },
            order: { id: 'ASC' as any },
        })) as Array<CampusZone & { id: ID }>;
        if (!zones.length) return undefined;
        const zone = zones.find(z => z.name === cf.campusZone) ?? zones[0];
        return {
            price: zone.fee,
            priceIncludesTax: true,
            taxRate: 0,
            metadata: { zoneName: zone.name, calculator: 'campus-errand' },
        };
    },
```

③ 文件头注释里「R5 跑腿单分区运费」描述同步改为「R5 跑腿单固定起步价 + R1/R3 分区运费」。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/shipping-calculator.ts packages/campus-delivery-plugin/src/shipping-calculator.spec.ts
git commit -m "feat(campus): R5 errand fee uses configurable errandBaseFee"
```

### Task 5: 起送价硬校验 OrderProcess（TDD）

**Files:**
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\min-order.process.ts`
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\min-order.process.spec.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`

- [ ] **Step 1: 写失败测试**

Create `min-order.process.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindMinOrderConnection, campusMinOrderProcess } from './min-order.process';

function makeData(opts: { cfg?: any; cf?: any; subTotal?: number }) {
    return {
        ctx: { channelId: 2 } as any,
        order: { subTotal: opts.subTotal ?? 1000, customFields: opts.cf ?? {} } as any,
    } as any;
}

describe('campusMinOrderProcess', () => {
    const cfgRepo = { findOne: vi.fn() };
    beforeEach(() => {
        vi.clearAllMocks();
        bindMinOrderConnection({
            getRepository: vi.fn(() => cfgRepo),
        } as any);
    });

    it('非 ArrangingPayment 过渡放行', async () => {
        cfgRepo.findOne.mockResolvedValue({ minOrderAmount: 1500 });
        await expect(
            campusMinOrderProcess.onTransitionStart!('AddingItems', 'PaymentAuthorized', makeData({})),
        ).resolves.toBeUndefined();
    });

    it('未配置 minOrderAmount 放行', async () => {
        cfgRepo.findOne.mockResolvedValue({ minOrderAmount: null });
        await expect(
            campusMinOrderProcess.onTransitionStart!('AddingItems', 'ArrangingPayment', makeData({ subTotal: 0 })),
        ).resolves.toBeUndefined();
    });

    it('商品单未满起送价抛 UserInputError（文案含元）', async () => {
        cfgRepo.findOne.mockResolvedValue({ minOrderAmount: 1500 });
        await expect(
            campusMinOrderProcess.onTransitionStart!('AddingItems', 'ArrangingPayment', makeData({ subTotal: 1000 })),
        ).rejects.toThrow('未满起送价 ¥15');
    });

    it('商品单满足起送价放行', async () => {
        cfgRepo.findOne.mockResolvedValue({ minOrderAmount: 1500 });
        await expect(
            campusMinOrderProcess.onTransitionStart!('AddingItems', 'ArrangingPayment', makeData({ subTotal: 2000 })),
        ).resolves.toBeUndefined();
    });

    it('跑腿单（orderKind=errand）豁免商品起送价', async () => {
        cfgRepo.findOne.mockResolvedValue({ minOrderAmount: 1500 });
        await expect(
            campusMinOrderProcess.onTransitionStart!(
                'AddingItems', 'ArrangingPayment',
                makeData({ subTotal: 0, cf: { orderKind: 'errand' } }),
            ),
        ).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

Create `min-order.process.ts`：

```ts
import { OrderProcess, RequestContext, TransactionalConnection, UserInputError, Order } from '@vendure/core';
import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';

/**
 * 起送价硬校验：拦截 → ArrangingPayment 过渡。
 * - 仅当渠道 campus 配置 minOrderAmount 非空时生效；
 * - orderKind='errand'（R5 跑腿单/接力单）豁免——跑腿费与小费不属于商品起送价；
 * - 不满足抛 UserInputError「未满起送价 ¥X」（X=元）。
 * connection 用模块级引用（与 shipping-calculator 同模式，onApplicationBootstrap 注入）。
 */
let connRef: TransactionalConnection | null = null;

export function bindMinOrderConnection(conn: TransactionalConnection) {
    connRef = conn;
}

export const campusMinOrderProcess: OrderProcess<any> = {
    async onTransitionStart(fromState, toState, { ctx, order }: { ctx: RequestContext; order: Order }) {
        if (toState !== 'ArrangingPayment') return;
        const cf = (order.customFields ?? {}) as any;
        if (cf.orderKind === 'errand') return;
        const conn = connRef;
        if (!conn) return;
        const cfg = await conn.getRepository(ctx, CampusFulfillmentConfig).findOne({
            where: { channelId: ctx.channelId as any },
        });
        if (!cfg?.minOrderAmount) return;
        if ((order.subTotal ?? 0) < cfg.minOrderAmount) {
            throw new UserInputError(`未满起送价 ¥${Number((cfg.minOrderAmount / 100).toFixed(2))}`);
        }
    },
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

- [ ] **Step 5: 插件注册**

`campus-delivery.plugin.ts`：
① import 区加：
```ts
import { bindMinOrderConnection, campusMinOrderProcess } from './min-order.process';
```
② `configuration` 回调内，`config.shippingOptions.shippingCalculators = [...]` 之后加：

```ts
        // 起送价硬校验（二期 §3.2）：ArrangingPayment 过渡拦截，跑腿单豁免
        config.orderOptions = {
            ...(config.orderOptions ?? {}),
            process: [...(config.orderOptions?.process ?? []), campusMinOrderProcess],
        } as any;
```

③ `onApplicationBootstrap()` 首行（`bindCampusErrandCalculatorConnection(...)` 之后）加：

```ts
        bindMinOrderConnection(this.injector.get(TransactionalConnection));
```

- [ ] **Step 6: 全量单测 + Commit**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/min-order.process.ts packages/campus-delivery-plugin/src/min-order.process.spec.ts packages/campus-delivery-plugin/src/campus-delivery.plugin.ts
git commit -m "feat(campus): hard min-order gate on ArrangingPayment via OrderProcess"
```

### Task 6: campusMarkArrived 幂等 + 状态校验补强（TDD）

> 已核实：shop-api 已暴露 `campusMarkArrived`（rider-task-shop.resolver.ts:61-63，注册于 campus-delivery.plugin.ts:354 shop resolvers）。本任务**只补强 R2MarkService**（幂等 + 状态守卫），不新增 schema/resolver；waimai 端 Task 12 的 `CAMPUS_MARK_ARRIVED` 调用同名。

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\r2-mark.service.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\r2-mark.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`r2-mark.service.spec.ts` 的 `describe('R2MarkService.markArrived')` 内追加两个用例：

```ts
    it('已 arrived_gate 幂等返回，不重复写 handoverAt', async () => {
        const env = makeEnv({
            order: { id: 6, customFields: { fulfillmentRoute: 'R2', leg1Status: 'arrived_gate' }, customer: { user: { id: 9 } } },
        });
        const res = await env.svc.markArrived({ activeUserId: 9 } as any, 6);
        expect(res).toEqual({ leg1Status: 'arrived_gate' });
        expect(env.orderRepo.update).not.toHaveBeenCalled();
    });

    it('leg1Status 非 preparing/arrived_gate 拒绝', async () => {
        const env = makeEnv({
            order: { id: 6, customFields: { fulfillmentRoute: 'R2', leg1Status: 'picked' }, customer: { user: { id: 9 } } },
        });
        await expect(env.svc.markArrived({ activeUserId: 9 } as any, 6)).rejects.toThrow('当前状态不支持到校确认');
        expect(env.orderRepo.update).not.toHaveBeenCalled();
    });
```

并把原第一个用例的 order 改为 `customFields: { fulfillmentRoute: 'R2', leg1Status: 'preparing' }`（显式 preparing）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: 幂等用例 FAIL（现在会调 update）

- [ ] **Step 3: 实现**

`r2-mark.service.ts` 的 `markArrived` 在「非 R2 拒绝」之后、`update` 之前插入：

```ts
        const leg1 = (order.customFields as any)?.leg1Status as string | null;
        if (leg1 === 'arrived_gate') return { leg1Status: 'arrived_gate' }; // 幂等：不重复写 handoverAt
        if (leg1 != null && leg1 !== 'preparing') throw new UserInputError('当前状态不支持到校确认');
```

- [ ] **Step 4: 跑测试确认通过 + Commit**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/r2-mark.service.ts packages/campus-delivery-plugin/src/r2-mark.service.spec.ts
git commit -m "fix(campus): campusMarkArrived idempotent + state guard"
```

### Task 7: R2 接力单反查 campusR2Relay（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\r2-mark.service.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\r2-mark.service.spec.ts`
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\r2-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`

- [ ] **Step 1: 写失败测试**

`r2-mark.service.spec.ts` 的 `makeEnv` 整体替换为（relay 查询与 Order 走同一 orderRepo，需给它加 createQueryBuilder）：

```ts
function makeEnv(opts: { order?: any; relay?: any } = {}) {
    const orderRepo: any = { update: vi.fn().mockResolvedValue({}) };
    orderRepo.createQueryBuilder = vi.fn(() => ({
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(opts.relay ?? null),
    }));
    const conn = { getRepository: vi.fn(() => orderRepo) } as any;
    const orderSvc = { findOne: vi.fn().mockResolvedValue(opts.order ?? null) };
    const svc = new R2MarkService(conn, orderSvc as any);
    return { svc, orderRepo, orderSvc };
}
```

原 markArrived 三个用例不需要改（makeEnv 对它们透明）。追加用例：

```ts
describe('R2MarkService.relayStatus', () => {
    it('按本单 code 反查 R5 接力单并返回精简状态', async () => {
        const env = makeEnv({
            order: { id: 6, code: 'A100', customFields: { fulfillmentRoute: 'R2' }, customer: { user: { id: 9 } } },
            relay: { id: 8, code: 'A105', state: 'PaymentSettled', totalWithTax: 500,
                     customFields: { hallStatus: 'grabbed', deliveryStatus: 'delivered', errandTo: '9 栋', tip: 100 } },
        });
        const res = await env.svc.relayStatus({ activeUserId: 9, channelId: 2 } as any, 6);
        expect(res).toEqual({
            orderId: 8, orderCode: 'A105', state: 'PaymentSettled',
            hallStatus: 'grabbed', deliveryStatus: 'delivered', errandTo: '9 栋', tip: 100, totalWithTax: 500,
        });
    });

    it('无接力单返回 null', async () => {
        const env = makeEnv({
            order: { id: 6, code: 'A100', customFields: { fulfillmentRoute: 'R2' }, customer: { user: { id: 9 } } },
        });
        expect(await env.svc.relayStatus({ activeUserId: 9, channelId: 2 } as any, 6)).toBeNull();
    });

    it('非本人 R2 单拒绝', async () => {
        const env = makeEnv({
            order: { id: 6, code: 'A100', customFields: { fulfillmentRoute: 'R2' }, customer: { user: { id: 8 } } },
        });
        await expect(env.svc.relayStatus({ activeUserId: 9, channelId: 2 } as any, 6)).rejects.toThrow();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: FAIL（relayStatus 不存在）

- [ ] **Step 3: 实现**

`r2-mark.service.ts` 类内追加（注意 relay 查询用 `getRepository(ctx, Order)`，与 makeEnv 的单一 orderRepo 匹配）：

```ts
    /** R2 原单动态反查接力单：errandFrom=本单 code 的 R5 单，实时读状态、不写回标记（二期 §3.5/§4.3） */
    async relayStatus(ctx: RequestContext, orderId: ID) {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const order = await this.orderService.findOne(ctx, orderId as any, ['customer', 'customer.user'] as any);
        if (!order) throw new UserInputError('订单不存在');
        if ((order as any).customer?.user?.id !== ctx.activeUserId) throw new ForbiddenError();
        const relay = await this.connection.getRepository(ctx, Order).createQueryBuilder('o')
            .leftJoin('o.channels', 'ch')
            .where('ch.id = :chId', { chId: ctx.channelId as any })
            .andWhere('o.customFields.errandFrom = :code', { code: order.code })
            .andWhere('o.customFields.orderKind = :kind', { kind: 'errand' })
            .orderBy('o.id', 'DESC')
            .getOne();
        if (!relay) return null;
        const rcf = (relay.customFields ?? {}) as any;
        return {
            orderId: relay.id,
            orderCode: relay.code,
            state: relay.state,
            hallStatus: rcf.hallStatus ?? null,
            deliveryStatus: rcf.deliveryStatus ?? null,
            errandTo: rcf.errandTo ?? null,
            tip: rcf.tip ?? 0,
            totalWithTax: relay.totalWithTax,
        };
    }
```

（`customFields.errandFrom` 的 QB 写法与 `dispatch-job.service.ts` 扫描里 `order.customFields.hallStatus` 同模式——fork 实测可用。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

- [ ] **Step 5: shop resolver + schema**

Create `r2-shop.resolver.ts`：

```ts
import { Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, RequestContext } from '@vendure/core';
import { R2MarkService } from './r2-mark.service';

@Resolver()
export class R2ShopResolver {
    constructor(private r2: R2MarkService) {}

    /** R2 原单卡「接力单状态」子卡数据源（动态反查，无写回） */
    @Query()
    async campusR2Relay(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) {
        return this.r2.relayStatus(ctx, orderId);
    }
}
```

`campus-delivery.plugin.ts`：
① import：`import { R2ShopResolver } from './r2-shop.resolver';`
② shop schema `extend type Query` 内加：`campusR2Relay(orderId: ID!): CampusR2Relay`
③ shop schema 加类型：

```graphql
                type CampusR2Relay {
                    orderId: ID!
                    orderCode: String!
                    state: String!
                    hallStatus: String
                    deliveryStatus: String
                    errandTo: String
                    tip: Int!
                    totalWithTax: Int!
                }
```

④ shopApiExtensions `resolvers` 数组加 `R2ShopResolver`。

- [ ] **Step 6: 全量单测 + Commit**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/r2-mark.service.ts packages/campus-delivery-plugin/src/r2-mark.service.spec.ts packages/campus-delivery-plugin/src/r2-shop.resolver.ts packages/campus-delivery-plugin/src/campus-delivery.plugin.ts
git commit -m "feat(campus): campusR2Relay shop query for R2 order relay status"
```

### Task 8: R4 自提点幂等 upsert（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`waimai-store.service.spec.ts` 追加：

```ts
describe('WaimaiStoreService R4 store pickup location upsert', () => {
    function makeLocEnv(locRepo: any) {
        const env = makeEnv({ channels: [{ id: 2, token: 'canteen', code: '一食堂麻辣香锅', customFields: {} }] });
        (env.svc as any).connection.rawConnection = {
            getRepository: vi.fn(() => locRepo),
        };
        return env;
    }

    it('storeAddress 非空：新建自提点（type=store, remark=campus-r4, 绑渠道）', async () => {
        const locRepo = {
            findOne: vi.fn().mockResolvedValue(null),
            save: vi.fn(async (x: any) => ({ id: 55, ...x })),
        };
        const env = makeLocEnv(locRepo);
        await env.svc.updateStoreConfig({} as any, 2, {
            routesEnabled: ['R4'], storeAddress: '东门 1 号楼', storePhone: '13800000000',
        } as any);
        expect(locRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            name: '一食堂麻辣香锅', address: '东门 1 号楼', phoneNumber: '13800000000',
            type: 'store', ownerChannelId: 2, remark: 'campus-r4', channels: [{ id: 2 }],
        }));
    });

    it('已存在：更新地址不新建', async () => {
        const locRepo = {
            findOne: vi.fn().mockResolvedValue({ id: 55, name: '旧名', address: '旧址', phoneNumber: null, remark: 'campus-r4' }),
            save: vi.fn(async (x: any) => x),
        };
        const env = makeLocEnv(locRepo);
        await env.svc.updateStoreConfig({} as any, 2, {
            routesEnabled: ['R4'], storeAddress: '新址', storePhone: null,
        } as any);
        expect(locRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 55, address: '新址' }));
    });

    it('storeAddress 清空：跳过 upsert（不删除既有记录）', async () => {
        const locRepo = {
            findOne: vi.fn(), save: vi.fn(),
        };
        const env = makeLocEnv(locRepo);
        await env.svc.updateStoreConfig({} as any, 2, { routesEnabled: ['R4'], storeAddress: null } as any);
        expect(locRepo.findOne).not.toHaveBeenCalled();
        expect(locRepo.save).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: FAIL（未调用 locRepo）

- [ ] **Step 3: 实现**

`waimai-store.service.ts`：
① 常量区（ROUTE_WHITELIST 旁）加：

```ts
/** R4 自提点标记：campus 配置管理的本渠道门店自提点（幂等 upsert 键，复用 cjk PickupLocation 体系） */
const CAMPUS_R4_REMARK = 'campus-r4';
```

② `updateStoreConfig` 在 `await repo.save(cfg);` 之后、`return this.toConfigView(...)` 之前加：

```ts
        const address = (input.storeAddress ?? '').trim();
        if (address) {
            // R4：同步幂等 upsert 本渠道门店自提点（名称=店铺名，地址=storeAddress），核销走 pickup_redemption 零新表
            await this.upsertStorePickupLocation(Number(channelId), ch.code, address, (input.storePhone ?? '').trim() || null);
        }
```

③ 类内追加私有方法：

```ts
    /** 经 rawConnection 按实体名取 repo（避免对 cjk-plugin 的构建期依赖；PickupLocation 由 cjk-plugin 注册于同一进程）。
     * 可见性：isPublic=false + ownerChannelId=本渠道 + channels 含本渠道 → shop 端 applyVisibility 对本渠道可见（cjk pickup-location.service.ts:35）。 */
    private async upsertStorePickupLocation(channelId: number, name: string, address: string, phone: string | null) {
        const repo = this.connection.rawConnection.getRepository('PickupLocation');
        const existing = await repo.findOne({ where: { ownerChannelId: channelId, remark: CAMPUS_R4_REMARK } });
        if (existing) {
            existing.name = name;
            existing.address = address;
            existing.phoneNumber = phone;
            existing.enabled = true;
            await repo.save(existing);
            return existing;
        }
        return repo.save({
            name,
            address,
            phoneNumber: phone,
            type: 'store',
            stockType: 'own',
            enabled: true,
            isPublic: false,
            ownerChannelId: channelId,
            channels: [{ id: channelId }],
            remark: CAMPUS_R4_REMARK,
        });
    }
```

- [ ] **Step 4: 跑测试确认通过 + Commit**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/waimai-store.service.ts packages/campus-delivery-plugin/src/waimai-store.service.spec.ts
git commit -m "feat(campus): idempotent upsert of R4 store pickup location"
```

### Task 9: R2 下单链路补强（setDeliveryTarget 放行 R2 + errandFrom 覆盖 + errandNote + campusErrandVariant）（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-config.service.ts` + `campus-config.service.spec.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\custom-fields.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\errand.service.ts` + `errand.service.spec.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\errand-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`

- [ ] **Step 1: setDeliveryTarget 放行 R2**

`campus-config.service.ts` 的 `setDeliveryTarget`：
① 签名 `route?: 'R1' | 'R3'` 改为 `route?: 'R1' | 'R2' | 'R3'`
② `if (route && route !== 'R1' && route !== 'R3') throw ...` 改为：

```ts
        // R2 与 R1/R3 同走 zone/building 写入（R2 原单收宿舍楼信息供接力预填）；R4 不经骑手不落此链路
        if (route && !['R1', 'R2', 'R3'].includes(route)) throw new UserInputError('配送路线不合法');
```

③ 方法注释「route 仅 R1/R3，R2 走 r2-mark 专属流程」更新为「R1/R2/R3；R2 的到校确认走 r2-mark 链路」。

若 `campus-config.service.spec.ts` 有 R2 拒绝的用例，改为期望放行（route='R2' 正常写入 fulfillmentRoute）。

- [ ] **Step 2: errandNote customField**

`custom-fields.ts` Order 数组在 `{ name: 'errandTo', ... }` 后加：

```ts
        { name: 'errandNote', type: 'string', nullable: true }, // 跑腿物品描述/要求
```

- [ ] **Step 3: errand.service 写 errandFrom 覆盖 + note + getErrandBaseFee（TDD）**

`errand.service.spec.ts` 文件末尾（`describe('ErrandService.setErrandInfo')` 之后）追加（env 工厂/ctx 形状与文件内现有一致：`makeEnv` 返回 `{ svc, orderSvc, ... }`，`orderRepo.findOne` 可重 mock）：

```ts
describe('ErrandService.setErrandInfo 二期字段', () => {
    const baseInput = { kind: 'pickup_express', fromText: '东门取件', toText: '12号楼501', tip: 0 };
    const ctx = { channelId: 1, activeUserId: 9, session: { activeOrderId: 5 } } as any;

    it('note 透传 errandNote；errandFrom 覆盖优先于 fromText（R2 接力单存原单号）', async () => {
        const env = makeEnv();
        await env.svc.setErrandInfo(ctx, { ...baseInput, note: '两个包裹', errandFrom: 'A100' });
        expect(env.orderSvc.updateCustomFields).toHaveBeenCalledWith(
            ctx, 5,
            expect.objectContaining({ errandNote: '两个包裹', errandFrom: 'A100' }),
        );
    });

    it('errandFrom 缺省落 fromText（普通 R5 保持 A 点文字）', async () => {
        const env = makeEnv();
        await env.svc.setErrandInfo(ctx, baseInput);
        expect(env.orderSvc.updateCustomFields).toHaveBeenCalledWith(
            ctx, 5, expect.objectContaining({ errandFrom: '东门取件' }),
        );
    });
});

describe('ErrandService.getErrandBaseFee', () => {
    it('配置存在返回 errandBaseFee，缺失回默认 200 分', async () => {
        const env = makeEnv();
        env.orderRepo.findOne.mockResolvedValue({ errandBaseFee: 300 });
        expect(await env.svc.getErrandBaseFee({ channelId: 2 } as any)).toBe(300);
        env.orderRepo.findOne.mockResolvedValue(null);
        expect(await env.svc.getErrandBaseFee({ channelId: 2 } as any)).toBe(200);
    });
});
```

`errand.service.ts`：
① `setErrandInfo` 的 input 类型加 `errandFrom?: string; note?: string`（完整签名）：

```ts
    async setErrandInfo(
        ctx: RequestContext,
        input: { kind: string; fromText: string; toText: string; tip: number;
                 errandFrom?: string; note?: string; buildingId?: string; campusZone?: string },
    ) {
```

② `updateCustomFields` fields 对象改两行（`errandFrom` 行替换原 `errandFrom: input.fromText,`）：

```ts
            // R2 接力单：errandFrom 存原单号（campusR2Relay 反查键）；普通 R5 缺省落 A 点文字
            errandFrom: input.errandFrom ?? input.fromText,
            errandTo: input.toText,
            errandNote: input.note ?? null,
```

③ 类内追加：

```ts
    /** R5 发单页读起步价：当前渠道 errandBaseFee（null → 默认 200 分） */
    async getErrandBaseFee(ctx: RequestContext): Promise<number> {
        const cfg = await this.connection.getRepository(ctx, CampusFulfillmentConfig).findOne({
            where: { channelId: ctx.channelId as any },
        });
        return cfg?.errandBaseFee ?? 200;
    }
```

（import 区加 `import { CampusFulfillmentConfig } from './campus-fulfillment-config.entity';`）

- [ ] **Step 4: campusErrandVariant shop query**

`errand-shop.resolver.ts` 改为：

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, RequestContext } from '@vendure/core';
import { ErrandService } from './errand.service';

@Resolver()
export class ErrandShopResolver {
    constructor(private errand: ErrandService) {}

    /** R5 发单第一步数据源：0 元载体 variantId（幂等建）+ 本渠道跑腿起步价（分，null→200） */
    @Query()
    async campusErrandVariant(@Ctx() ctx: RequestContext) {
        const { variantId, sku } = await this.errand.ensureErrandProduct(ctx);
        return { variantId, sku, errandBaseFee: await this.errand.getErrandBaseFee(ctx) };
    }

    /** 跑腿单第二步：需先 addItemToOrder(0元载体) 建购物车，再调本 mutation 写标记 + 小费。
     * 未登录/空购物车/小费非法由 service 抛 ForbiddenError/UserInputError。 */
    @Mutation()
    async campusSetErrandInfo(@Ctx() ctx: RequestContext, @Args('input') input: any) {
        const order = await this.errand.setErrandInfo(ctx, input);
        return { orderId: (order as any).id as ID };
    }
}
```

- [ ] **Step 5: schema 增补**

`campus-delivery.plugin.ts` shop schema：
① `input CampusErrandInput` 的 `campusZone: String` 后加：

```graphql
    errandFrom: String
    note: String
```

② 加类型与 query：

```graphql
                type CampusErrandVariantResult {
                    variantId: ID!
                    sku: String!
                    errandBaseFee: Int!
                }
```

`extend type Query` 内加：`campusErrandVariant: CampusErrandVariantResult!`

- [ ] **Step 6: 全量单测 + Commit**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/campus-config.service.ts packages/campus-delivery-plugin/src/campus-config.service.spec.ts packages/campus-delivery-plugin/src/custom-fields.ts packages/campus-delivery-plugin/src/errand.service.ts packages/campus-delivery-plugin/src/errand.service.spec.ts packages/campus-delivery-plugin/src/errand-shop.resolver.ts packages/campus-delivery-plugin/src/campus-delivery.plugin.ts
git commit -m "feat(campus): R2 checkout target + errandNote + campusErrandVariant query"
```

### Task 10: plugin 本地构建 + lib 入库

- [ ] **Step 1: 构建**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npm run build`
Expected: 无 TS 错误，`lib/` 更新（含 min-order.process.js、r2-shop.resolver.js 等新产物）

- [ ] **Step 2: Commit（src+lib 一起）**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib
git commit -m "build(campus): rebuild plugin lib with phase2 (errandBaseFee/min-order/R2 relay/R4 pickup)"
```

- [ ] **Step 3: 全量单测最终确认**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS

---

## Task 11：web-admin 跑腿起步价配置

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\campus.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\campus\config.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `locale\en.json`

- [ ] **Step 1: api 层类型**

`apis/campus.ts`：
① `CampusStoreConfig` 接口 `storeNotice: string | null;` 后加 `errandBaseFee: number | null;`；`CampusStoreConfigInput` 接口 `storeNotice?: string | null;` 后加 `errandBaseFee?: number | null;`
② `FIELDS` 字符串改为：

```ts
const FIELDS =
  'channelId channelName channelToken routesEnabled deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee';
```

- [ ] **Step 2: 配置页表单**

`pages/campus/config.vue`（i18n 走 `campusConfig.*` 段，模板用 `$t`；分↔元复用 `utils/money.ts` 的 `fenToYuan/yuanToFen`——已 import）：
① 模板：配送费 cell（`campusConfig.deliveryFee` 那个 `<view class="cell">`）之后、storeAddress cell 之前插入：

```html
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.errandBaseFee') }}</text>
          <input v-model="card.form.errandBaseFeeYuan" type="digit" :placeholder="$t('campusConfig.errandBaseFeePh')" />
        </view>
```

② `CardForm` 接口 `deliveryFeeYuan: string;` 后加 `errandBaseFeeYuan: string; // 跑腿起步价（元输入态）；提交转分`
③ `toForm` 的 `deliveryFeeYuan: ...` 行后加：

```ts
    errandBaseFeeYuan: c.errandBaseFee != null ? fenToYuan(c.errandBaseFee) : '',
```

④ `save` 中 `const fee = ...` 行后加：

```ts
  const errandFee = f.errandBaseFeeYuan.trim() === '' ? null : yuanToFen(f.errandBaseFeeYuan);
  if (f.errandBaseFeeYuan.trim() !== '' && errandFee == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
```

⑤ `campusUpdateStoreConfig(card.channelId, {...})` 的 input 里 `deliveryFee: fee,` 行后加 `errandBaseFee: errandFee,`
⑥ i18n（`locale/zh-Hans.json` 与 `locale/en.json` 的既有 `campusConfig` 段内，`deliveryFee` 键旁追加）：

```json
      "errandBaseFee": "跑腿起步价（元）",
      "errandBaseFeePh": "留空默认 2 元",
```

en.json 对应：

```json
      "errandBaseFee": "Errand base fee (yuan)",
      "errandBaseFeePh": "Empty = default ¥2",
```

- [ ] **Step 3: 构建验证**

Run: `cd d:\zhao\vshop\web-admin; pnpm build:h5`
Expected: 构建成功无 TS/模板错误

- [ ] **Step 4: Commit**

```powershell
cd d:\zhao\vshop
git add web-admin/src/apis/campus.ts web-admin/src/pages/campus/config.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): errand base fee in campus store config page"
```

---

## Task 12-18：waimai 学生端

### Task 12: GraphQL 层扩展

**Files:**
- Modify: `d:\zhao\waimai\src\api\fragments.ts`
- Modify: `d:\zhao\waimai\src\api\queries\waimai.ts`
- Modify: `d:\zhao\waimai\src\api\mutations\campus.ts`
- Modify: `d:\zhao\waimai\src\api\queries\pickup.ts`（文件已存在，追加函数）

- [ ] **Step 1: ORDER_FRAGMENT customFields 增补**

`fragments.ts:53` 的 customFields 选择集改为：

```ts
        customFields { couponCode couponId hallStatus fulfillmentRoute deliveryStatus hallEnteredAt deliverySlotText campusZone orderKind errandKind errandFrom errandTo errandNote tip buildingId leg1Status handoverAt }
```

- [ ] **Step 2: WAIMAI_STORE_LIST 加 errandBaseFee**

`api/queries/waimai.ts` 的 `WAIMAI_STORE_LIST` 字段第二行改为（`storeNotice` 后加 ` errandBaseFee`）：

```ts
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee
```

- [ ] **Step 3: campus mutations 封装**

`api/mutations/campus.ts` 末尾追加（沿用文件既有 gql 文档 + `.then` 解包风格；**返回值均为解包后对象**，调用方直接用）：

```ts
/** R2: 确认快递已到校（幂等；后端校验归属/R2/状态） */
export const CAMPUS_MARK_ARRIVED = gql`
    mutation campusMarkArrived($orderId: ID!) { campusMarkArrived(orderId: $orderId) { leg1Status } }
`;

/** R2 原单动态反查接力单状态（null=暂无接力单） */
export const CAMPUS_R2_RELAY = gql`
    query campusR2Relay($orderId: ID!) {
        campusR2Relay(orderId: $orderId) { orderId orderCode state hallStatus deliveryStatus errandTo tip totalWithTax }
    }
`;

/** R5 发单第一步：0 元载体 variantId + 跑腿起步价（分） */
export const CAMPUS_ERRAND_VARIANT = gql`
    query campusErrandVariant { campusErrandVariant { variantId sku errandBaseFee } }
`;

/** T0 运力预检：在线传信者数量（不阻断发单，仅提示） */
export const CAMPUS_CAPACITY_CHECK = gql`
    query campusCapacityCheck { campusCapacityCheck { paused ridersOnline } }
`;

/** R5/R2 接力第二步：写 errand 标记（须先 addItemToOrder 建购物车） */
export const CAMPUS_SET_ERRAND_INFO = gql`
    mutation campusSetErrandInfo($input: CampusErrandInput!) { campusSetErrandInfo(input: $input) { orderId } }
`;

export function markArrived(orderId: string) { return getGraphQLClient().request(CAMPUS_MARK_ARRIVED, { orderId }).then((r: any) => r?.campusMarkArrived); }
export function fetchR2Relay(orderId: string) { return getGraphQLClient().request(CAMPUS_R2_RELAY, { orderId }).then((r: any) => r?.campusR2Relay ?? null); }
export function fetchErrandVariant() { return getGraphQLClient().request(CAMPUS_ERRAND_VARIANT).then((r: any) => r?.campusErrandVariant); }
export function capacityCheck() { return getGraphQLClient().request(CAMPUS_CAPACITY_CHECK).then((r: any) => r?.campusCapacityCheck); }
export function setErrandInfo(input: any) { return getGraphQLClient().request(CAMPUS_SET_ERRAND_INFO, { input }).then((r: any) => r?.campusSetErrandInfo); }
```

- [ ] **Step 4: pickup api 追加核销码函数**

`api/queries/pickup.ts`（文件已有 getPickupLocations/getEmployeePickupLocations）**末尾追加**：

```ts
/** R4 自提核销码（幂等，一生对一单；非 pickup/未过支付闸门抛错） */
export async function fetchMyPickupCode(orderId: string) {
    const client = getGraphQLClient();
    return client.request(
        `query ($orderId: ID!) { myPickupCode(orderId: $orderId) { id code status claimedAt collected } }`,
        { orderId },
    );
}

/** 顾客自助核销（仅线上已收款单；到店收款单由店员核销） */
export async function claimPickup(orderId: string, code: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation ($orderId: ID!, $code: String!) { claimMyPickup(orderId: $orderId, code: $code) { id code status } }`,
        { orderId, code },
    );
}
```

（fetchMyPickupCode 返回 `r.myPickupCode` 由调用方解包——与 Task 18 的 `r?.myPickupCode ?? null` 用法一致。）

- [ ] **Step 5: 测试 + Commit**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS（api 层无既有用例依赖被破坏）

```powershell
cd d:\zhao\waimai
git add src/api/fragments.ts src/api/queries/waimai.ts src/api/mutations/campus.ts src/api/queries/pickup.ts
git commit -m "feat(waimai): graphql layer for phase2 (markArrived/R2 relay/errand variant/pickup code)"
```

### Task 13: utils/errand.ts 纯函数（TDD）

**Files:**
- Create: `d:\zhao\waimai\src\utils\errand.ts`
- Test: Create `d:\zhao\waimai\tests\errand.spec.ts`（waimai 测试在根级 tests/，import 用 `../src/...`）

- [ ] **Step 1: 写失败测试**

Create `tests/errand.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildErrandPayload, filterCampusRoutes, parseRelayPrefill, relayStatusLabel, TIP_STEPS } from '../src/utils/errand';

describe('relayStatusLabel（R2 接力子卡文案）', () => {
    it('无接力单 → 空串', () => {
        expect(relayStatusLabel(null)).toBe('');
    });
    it('T4 退款终态 / Cancelled → 引导重选取件方式', () => {
        expect(relayStatusLabel({ hallStatus: 'no_rider_final' } as any)).toContain('退款');
        expect(relayStatusLabel({ state: 'Cancelled' } as any)).toContain('退款');
    });
    it('已送达 / 配送中 / 已接单 / 平台调度中', () => {
        expect(relayStatusLabel({ deliveryStatus: 'delivered' } as any)).toContain('已送达');
        expect(relayStatusLabel({ deliveryStatus: 'delivering', hallStatus: 'grabbed' } as any)).toContain('配送中');
        expect(relayStatusLabel({ hallStatus: 'grabbed' } as any)).toContain('已接单');
        expect(relayStatusLabel({ hallStatus: 'open' } as any)).toContain('平台调度中');
    });
});

describe('buildErrandPayload（发单表单校验）', () => {
    it('必填缺失返回 null', () => {
        expect(buildErrandPayload({ kind: 'pickup_express', fromText: '', toText: '9栋', tip: 0 })).toBeNull();
        expect(buildErrandPayload({ kind: 'pickup_express', fromText: '菜鸟', toText: '', tip: 0 })).toBeNull();
    });
    it('小费负数/非法返回 null', () => {
        expect(buildErrandPayload({ kind: 'other', fromText: 'A', toText: 'B', tip: -1 })).toBeNull();
    });
    it('合法输入返回后端 CampusErrandInput', () => {
        expect(buildErrandPayload({
            kind: 'pickup_express', fromText: '菜鸟驿站', toText: '9栋501',
            tip: 100, note: '两个包裹', errandFrom: 'A100', buildingId: '3',
        })).toEqual({
            kind: 'pickup_express', fromText: '菜鸟驿站', toText: '9栋501',
            tip: 100, note: '两个包裹', errandFrom: 'A100', buildingId: '3',
        });
    });
    it('可选项缺省不带键', () => {
        const p = buildErrandPayload({ kind: 'bring_food', fromText: '档口', toText: '9栋', tip: 0 });
        expect(p).toEqual({ kind: 'bring_food', fromText: '档口', toText: '9栋', tip: 0 });
    });
    it('小费档位递增且含 0', () => {
        expect(TIP_STEPS[0]).toBe(0);
        expect([...TIP_STEPS].sort((a, b) => a - b)).toEqual(TIP_STEPS);
    });
});

describe('filterCampusRoutes（checkout 路线组动态化）', () => {
    it('仅保留 R1/R2/R3 且保序', () => {
        expect(filterCampusRoutes(['R3', 'R1', 'R2'])).toEqual(['R3', 'R1', 'R2']);
    });
    it('过滤 R4/R5 与未知码', () => {
        expect(filterCampusRoutes(['R4', 'R5', 'R2', 'R6'])).toEqual(['R2']);
    });
    it('空/空值兜底', () => {
        expect(filterCampusRoutes([])).toEqual([]);
        expect(filterCampusRoutes(null)).toEqual([]);
    });
});

describe('parseRelayPrefill（R2→R5 发单页预填）', () => {
    it('R2 接力：code/a/b/buildingId 解码预填，A 点缺省「校内代收点」', () => {
        expect(parseRelayPrefill({
            from: 'R2', code: 'A100',
            a: encodeURIComponent('校内代收点'), b: encodeURIComponent('9 栋'),
            buildingId: '3',
        })).toEqual({ relayFrom: 'A100', fromText: '校内代收点', toText: '9 栋', buildingId: '3' });
    });
    it('R2 但无 a 参数：A 点兜底「校内代收点」', () => {
        const r = parseRelayPrefill({ from: 'R2', code: 'A100' });
        expect(r.fromText).toBe('校内代收点');
        expect(r.relayFrom).toBe('A100');
    });
    it('非 R2（普通发单）：全部空', () => {
        expect(parseRelayPrefill({})).toEqual({ relayFrom: '', fromText: '', toText: '', buildingId: '' });
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: FAIL（utils/errand 不存在）

- [ ] **Step 3: 实现**

Create `utils/errand.ts`：

```ts
/**
 * 校园配送二期纯函数：R2 接力子卡状态文案 + R5 发单 payload 构建校验。
 * 金额一律分。
 */

export interface R2RelayLike {
    state?: string | null;
    hallStatus?: string | null;
    deliveryStatus?: string | null;
}

/** R2 原单「接力单状态」子卡文案（动态反查结果 → 展示态） */
export function relayStatusLabel(relay: R2RelayLike | null | undefined): string {
    if (!relay) return '';
    if (relay.state === 'Cancelled' || relay.hallStatus === 'no_rider_final') {
        return '接力单已退款，快递仍在代收点，可选择自取或再次发单';
    }
    if (relay.deliveryStatus === 'delivered') return '传信者已送达';
    if (relay.deliveryStatus) return '传信者配送中';
    if (relay.hallStatus === 'grabbed') return '传信者已接单';
    if (relay.hallStatus === 'open') return '平台调度中，正在加急派单';
    return '接力单准备中';
}

/** 后端 CampusErrandInput 形状（errandFrom/buildingId/note 可选） */
export interface ErrandPayload {
    kind: string;
    fromText: string;
    toText: string;
    tip: number;
    errandFrom?: string;
    buildingId?: string;
    note?: string;
}

export function buildErrandPayload(input: {
    kind: string; fromText: string; toText: string; tip: number;
    errandFrom?: string; buildingId?: string; note?: string;
}): ErrandPayload | null {
    const kind = (input.kind || '').trim();
    const fromText = (input.fromText || '').trim();
    const toText = (input.toText || '').trim();
    if (!kind || !fromText || !toText) return null;
    const tip = Number(input.tip);
    if (!Number.isFinite(tip) || tip < 0) return null;
    const payload: ErrandPayload = { kind, fromText, toText, tip: Math.floor(tip) };
    const errandFrom = (input.errandFrom || '').trim();
    if (errandFrom) payload.errandFrom = errandFrom;
    const buildingId = (input.buildingId || '').trim();
    if (buildingId) payload.buildingId = buildingId;
    const note = (input.note || '').trim();
    if (note) payload.note = note;
    return payload;
}

/** 小费滑杆档位（分）：0/100/200/300/500/800 */
export const TIP_STEPS = [0, 100, 200, 300, 500, 800];

/** R5 服务类型选项（值与后端 errandKind 约定一致） */
export const ERRAND_KINDS = [
    { value: 'pickup_express', label: '代取快递' },
    { value: 'bring_food', label: '带饭' },
    { value: 'buy', label: '帮买' },
    { value: 'other', label: '其他' },
];

/** checkout 路线组动态化：routesEnabled 过滤出 checkout 可选路线（R1/R2/R3，保序） */
export function filterCampusRoutes(routes: string[] | null | undefined): string[] {
    return (routes ?? []).filter(r => r === 'R1' || r === 'R2' || r === 'R3');
}

/** R2→R5 发单页预填解析（URL：?from=R2&code=原单号&a=A点&b=B点&buildingId=楼栋） */
export function parseRelayPrefill(q: Record<string, string | undefined> = {}): {
    relayFrom: string; fromText: string; toText: string; buildingId: string;
} {
    const decode = (v?: string) => { if (!v) return ''; try { return decodeURIComponent(v); } catch { return v; } };
    // uni-app 各端对 onLoad options 的解码时机不一：已解码串再 decode 会抛 URIError（如含 % 的文案），须兜底原样返回
    if (q.from !== 'R2') return { relayFrom: '', fromText: '', toText: '', buildingId: '' };
    return {
        relayFrom: q.code ?? '',
        fromText: decode(q.a) || '校内代收点',
        toText: decode(q.b),
        buildingId: q.buildingId ?? '',
    };
}
```

- [ ] **Step 4: 跑测试确认通过 + Commit**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS

```powershell
cd d:\zhao\waimai
git add src/utils/errand.ts src/tests/errand.spec.ts
git commit -m "feat(waimai): errand utils (relay status label + payload builder)"
```

### Task 14: checkout 校园路线组动态化（R1/R2/R3）

**Files:**
- Modify: `d:\zhao\waimai\src\pkg-order\pages\checkout.vue`

- [ ] **Step 1: 路线数据源动态化 + 三路轮换**

① import 区（`import { setDeliveryTarget, ... } from '../../api/mutations/campus';` 附近）加：

```ts
import { useTenantStore } from '../../stores/tenant';
import { fetchStoreList } from '../../api/queries/waimai';
import { filterCampusRoutes } from '../../utils/errand';
```

state 区（`const cart = useCartStore();` 旁）加 `const tenantStore = useTenantStore();`；`campusRoutes`/`routeChoice` 声明（约 268-269 行）改为：

```ts
const campusRoutes = ref<string[]>([]);            // 店铺 routesEnabled（URL 透传兜底，onLoad 后动态刷新）
const routeChoice = ref<'R3' | 'R1' | 'R2'>('R3');
```

② 路线切换块（约 280-289 行 `canSwitchRoute`/`routeText`/`toggleRoute` 三段）整体替换：

```ts
// checkout 可选路线（R1/R2/R3 保序）；R2 二期加入轮换
const campusRouteOptions = computed(() => filterCampusRoutes(campusRoutes.value));
const canSwitchRoute = computed(() => campusRouteOptions.value.length > 1);
const routeText = computed(() => {
    if (!campusRoutes.value.length) return '配送路线以商家实际安排为准';
    if (routeChoice.value === 'R1') return '商家送至校门口，拾光传信者接力送到手（R1）';
    if (routeChoice.value === 'R2') return '快递到校，拾光传信者接力送到手（R2）';
    return '档口现做，拾光传信者送至楼层（R3）';
});

function toggleRoute() {
    const opts = campusRouteOptions.value;
    if (opts.length < 2) return;
    const i = opts.indexOf(routeChoice.value);
    routeChoice.value = opts[(i + 1) % opts.length] as 'R3' | 'R1' | 'R2';
}
```

③ 模板 :49-50 route-row 所在 view 之后加 R2 运费说明行：

```html
        <text v-if="routeChoice === 'R2'" class="route-fee-hint">快递运费按商家快递标准收取；校内接力段 ¥0，接力费用在「发接力单」时单独支付</text>
```

style 块顶层（`.checkout-page` 内）加：

```scss
  .route-fee-hint { display: block; font-size: 22rpx; color: $text-color-secondary; margin-top: 8rpx; }
```

④ 动态刷新：`onLoad` 回调末尾（`deliveryFeeFen.value = ...` 之后）加 `loadStoreRoutes();`，并在 state 区追加：

```ts
// 二期 §5.1：路线组按店铺 routesEnabled 动态刷新（URL 透传作兜底）
async function loadStoreRoutes() {
    try {
        const stores = await fetchStoreList();
        const store = stores.find((s: any) => s.channelToken === tenantStore.token);
        const routes = filterCampusRoutes(store?.routesEnabled);
        if (routes.length) {
            campusRoutes.value = routes;
            if (!routes.includes(routeChoice.value)) routeChoice.value = routes[0] as 'R3' | 'R1' | 'R2';
        }
    } catch (e) { /* 拉取失败保留 URL 兜底 */ }
}
```

- [ ] **Step 2: R2 提交链路确认（复用现状）**

`prepareOrderAddressAndShipping` 的 campus 分支（597-611）对 R2 **无需改动**：`saveCampusTarget` 写 fulfillmentRoute=R2（Task 9 后端已放行）；`campus-errand` calculator 对 R2 返回 undefined → eligible 列表自动回落 `categorizeShipping(m)==='shipping'` 普通快递运费。人工核对：R2 时选中的 method 是普通快递方法即可（可在提交前 `console.log(campusMethod.code)` 临时验证后删除）。

- [ ] **Step 3: 起送价硬校验错误透出**

`submitOrder` 的 catch（约 694 行 `catch (e: any) { ui.showToast(e.message); }`）改为优先透出后端 GraphQL message（graphql-request 的 ClientError.message 可能带前缀噪音）：

```ts
    } catch (e: any) { ui.showToast(e?.response?.errors?.[0]?.message || e.message); }
```

软校验（minOrderFen，仅 toast 不阻断）保持现状不动；硬校验实际拦截效果在 Task 20 冒烟验证。

- [ ] **Step 4: 测试 + Commit**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS

```powershell
cd d:\zhao\waimai
git add src/pkg-order/pages/checkout.vue
git commit -m "feat(waimai): dynamic campus route group R1/R2/R3 in checkout"
```

### Task 15: R5 发单页 pkg-campus/errand/create

**Files:**
- Create: `d:\zhao\waimai\src\pkg-campus\errand\create.vue`
- Modify: `d:\zhao\waimai\src\pages.json`

- [ ] **Step 1: pages.json 注册子包**

`subpackages` 数组（pkg-order/pkg-rider 旁）加：

```json
        {
            "root": "pkg-campus",
            "pages": [
                { "path": "errand/create", "style": { "navigationBarTitleText": "校内拾光达" } },
                { "path": "errand/list", "style": { "navigationBarTitleText": "我的跑腿单" } }
            ]
        },
```

- [ ] **Step 2: 发单页实现**

Create `pkg-campus/errand/create.vue`（完整实现；金额分；流程=T0 预检→查载体→加购→写单→选运费→支付，支付段逐字复用 checkout.vue `payCurrentOrder`/`submitOrder` 同款调用：`addPaymentToOrder(method, metadata)` → PaymentSettled/Authorized 直跳，否则 `handlePayment` 兜底）：

```vue
<template>
    <view class="page" :class="{ dark: theme === 'dark' }">
        <view class="nav-row">
            <text class="nav-link" @tap="goList">我的跑腿单 ›</text>
        </view>
        <view class="section">
            <text class="section__title">服务类型</text>
            <view class="kind-row">
                <view v-for="k in ERRAND_KINDS" :key="k.value" class="kind-chip"
                    :class="{ on: form.kind === k.value }" @tap="form.kind = k.value">
                    <text>{{ k.label }}</text>
                </view>
            </view>
        </view>
        <view class="section">
            <text class="section__title">取货点（A）</text>
            <input class="ipt" v-model="form.fromText" placeholder="如：菜鸟驿站 / 校内代收点" />
            <text class="section__title">送达点（B）</text>
            <input class="ipt" v-model="form.toText" placeholder="如：9 栋 501" />
            <text class="section__title">物品描述（可选）</text>
            <input class="ipt" v-model="form.note" placeholder="如：两杯冰奶茶 / 两个小包裹" />
        </view>
        <view class="section" v-if="prefill.relayFrom">
            <text class="relay-badge">接力单：关联快递单 {{ prefill.relayFrom }}</text>
        </view>
        <view class="section">
            <view class="fee-row">
                <text>跑腿费（起步价）</text><text class="fee">¥{{ (baseFee / 100).toFixed(2) }}</text>
            </view>
            <view class="fee-row">
                <text>小费</text><text class="fee">¥{{ (form.tip / 100).toFixed(2) }}</text>
            </view>
            <slider :min="0" :max="TIP_STEPS.length - 1" :step="1" :value="tipIdx"
                @change="(e: any) => (tipIdx = Number(e.detail.value))" show-value />
            <text class="tip-hint">运力紧张时小费优先派单</text>
        </view>
        <button class="submit-btn" :disabled="submitting || !payloadOk" @tap="submit">
            {{ submitting ? '发单中…' : `¥${((baseFee + form.tip) / 100).toFixed(2)} 立即发单` }}
        </button>
    </view>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { addItemToOrder } from '../../api/mutations/cart';
import { capacityCheck, fetchErrandVariant, setErrandInfo } from '../../api/mutations/campus';
import { getEligibleShippingMethods } from '../../api/queries/order';
import { getEligiblePaymentMethods } from '../../api/queries/user';
import { addPaymentToOrder, setOrderShippingMethod, transitionOrderToState } from '../../api/mutations/checkout';
import { handlePayment } from '../../composables/usePayment';
import { buildErrandPayload, ERRAND_KINDS, parseRelayPrefill, TIP_STEPS } from '../../utils/errand';

const theme = ref('');
const form = ref({ kind: 'pickup_express', fromText: '', toText: '', note: '', tip: 0 });
const tipIdx = ref(0);
const baseFee = ref(200);
const prefill = ref({ relayFrom: '', fromText: '', toText: '', buildingId: '' }); // R2 接力预填
const variantId = ref('');
const submitting = ref(false);

function goList() { uni.navigateTo({ url: '/pkg-campus/errand/list' }); }

onMounted(async () => {
    // R2 接力预填：order-detail 跳入 /pkg-campus/errand/create?from=R2&code=原单号&a=…&b=…&buildingId=…
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    prefill.value = parseRelayPrefill(page?.options ?? {});
    if (prefill.value.fromText) form.value.fromText = prefill.value.fromText;
    if (prefill.value.toText) form.value.toText = prefill.value.toText;
    try {
        const res: any = await fetchErrandVariant();
        variantId.value = String(res.variantId);
        baseFee.value = res.errandBaseFee ?? 200;
    } catch (e) { uni.showToast({ title: '服务初始化失败', icon: 'none' }); }
});

// 小费档位联动（滑杆索引 → 分）
watch(tipIdx, (i) => { form.value.tip = TIP_STEPS[i] ?? 0; });

const payloadOk = computed(() =>
    !!buildErrandPayload({ ...form.value, errandFrom: prefill.value.relayFrom, buildingId: prefill.value.buildingId }));

async function submit() {
    if (submitting.value) return;
    const payload = buildErrandPayload({ ...form.value, errandFrom: prefill.value.relayFrom, buildingId: prefill.value.buildingId });
    if (!payload) { uni.showToast({ title: '请补全取货/送达点', icon: 'none' }); return; }
    submitting.value = true;
    try {
        // T0 预检：紧张提示但不阻断
        try {
            const c: any = await capacityCheck();
            if (c?.ridersOnline === 0) uni.showToast({ title: '当前运力紧张，接单可能延迟', icon: 'none' });
        } catch (e) { /* 预检失败不阻断 */ }
        if (!variantId.value) throw new Error('载体未就绪');
        await addItemToOrder(variantId.value, 1);
        await setErrandInfo(payload);
        // 选运费：setErrandInfo 写 fulfillmentRoute=R5 后，campus-errand calculator 按 errandBaseFee 出价
        const eligibleRes: any = await getEligibleShippingMethods();
        const all: any[] = eligibleRes?.eligibleShippingMethods || [];
        const campusMethod = all.find((m: any) => m.code?.startsWith('campus-errand'));
        if (campusMethod) await setOrderShippingMethod([campusMethod.id]);
        await transitionOrderToState('ArrangingPayment');
        // 支付：与 checkout.vue submitOrder/payCurrentOrder 同款
        const pmRes: any = await getEligiblePaymentMethods();
        const pms: any[] = (pmRes?.eligiblePaymentMethods ?? []).filter((p: any) => p.isEligible);
        const method = pms[0]?.code;
        if (!method) throw new Error('无可用支付方式');
        const metadata: Record<string, any> = {};
        if (method === 'wechatpay') {
            const openid = uni.getStorageSync('auth_openid');
            if (openid) metadata.openid = openid;
        }
        const payRes: any = await addPaymentToOrder(method, metadata);
        const po = payRes?.addPaymentToOrder;
        if (po?.state === 'PaymentSettled' || po?.state === 'PaymentAuthorized') {
            uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(po.code)}&status=success` });
            return;
        }
        const lastPayment = po?.payments?.[po.payments.length - 1];
        const result = await handlePayment(method, { ...lastPayment, orderCode: po?.code, orderState: po?.state });
        if (!result.success) { uni.showToast({ title: '支付未完成，请重试或更换支付方式', icon: 'none' }); return; }
        uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(po.code)}&status=success` });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '发单失败', icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>
```

（样式按页面既有风格自定：`.nav-row/.nav-link/.section/.section__title/.ipt/.kind-row/.kind-chip.on/.fee-row/.fee/.tip-hint/.relay-badge/.submit-btn`，暗色态沿用 `.dark` 变量。）

- [ ] **Step 3: 测试 + Commit**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS

```powershell
cd d:\zhao\waimai
git add src/pkg-campus src/pages.json
git commit -m "feat(waimai): R5 errand create page (pkg-campus)"
```

### Task 16: 我的跑腿单 pkg-campus/errand/list

**Files:**
- Create: `d:\zhao\waimai\src\pkg-campus\errand\list.vue`

- [ ] **Step 1: 实现（跨渠道聚合 + orderKind 前端过滤）**

Create `pkg-campus/errand/list.vue`（完整实现）。数据源**复用 pages/orders/index.vue 的跨渠道聚合模式**：`getOrdersForChannel` 逐渠道查询（vendure `myOrders` 按 activeChannel 过滤，跑腿单可能落在任意店铺渠道，单渠道 `getOrders` 会漏单）；卡片样式对齐该页 `.order-card`：

```vue
<template>
  <view class="errand-page">
    <view v-for="o in items" :key="o.id" class="order-card" @click="goDetail(o.code)">
      <view class="order-card__header">
        <view class="order-card__store-col">
          <text class="order-card__store">{{ kindLabel(o) }}</text>
          <text class="order-card__code">{{ o.code }}</text>
        </view>
        <text class="order-card__state">{{ statusLabel(o) }}</text>
      </view>
      <view class="order-card__route">
        <text>{{ o.customFields?.errandFrom || '—' }} → {{ o.customFields?.errandTo || '—' }}</text>
        <text v-if="o.customFields?.errandNote" class="order-card__note">{{ o.customFields.errandNote }}</text>
      </view>
      <view class="order-card__footer">
        <text>跑腿费+小费</text>
        <PriceTag :price="o.totalWithTax" />
      </view>
    </view>
    <view v-if="!loading && !items.length" class="empty-wrap">
      <EmptyState text="还没有跑腿单，去发一单" />
      <button class="go-create" @click="goCreate">去发一单</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getOrdersForChannel } from '../../api/queries/order';
import { fetchStoreList } from '../../api/queries/waimai';
import { ERRAND_KINDS } from '../../utils/errand';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';

// 订单落在各渠道（myOrders 按 activeChannel 过滤），聚合 = 平台渠道 + 全部店铺渠道（同 pages/orders/index.vue）
const PLATFORM_TOKEN = (import.meta.env.VITE_CHANNEL_TOKEN as string) || '__default_channel__';
function normChannel(t: string): string {
    return !t || t === '__default_channel__' ? '__default_channel__' : t;
}

const items = ref<any[]>([]);
const loading = ref(false);

async function loadData() {
    loading.value = true;
    try {
        const tokens = new Set<string>([normChannel(PLATFORM_TOKEN)]);
        try {
            const stores = await fetchStoreList();
            for (const s of stores) tokens.add(normChannel(s.channelToken || ''));
        } catch (e) { /* 店铺列表拉取失败仍有平台渠道 */ }
        const results = await Promise.all(Array.from(tokens).map((token) =>
            getOrdersForChannel(token, { take: 50, sort: { createdAt: 'DESC' } })
                .then((res: any) => res?.myOrders?.items || [])
                .catch(() => [] as any[]),
        ));
        items.value = results.flat()
            .filter((o: any) => o.customFields?.orderKind === 'errand')
            .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } finally {
        loading.value = false;
    }
}
onShow(() => { loadData(); });

function kindLabel(o: any): string {
    return ERRAND_KINDS.find((k) => k.value === o.customFields?.errandKind)?.label || '跑腿单';
}
function statusLabel(o: any) {
    if (o.state === 'Cancelled') return '已退款/取消';
    const cf = o.customFields ?? {};
    if (cf.deliveryStatus === 'delivered') return '已送达';
    if (cf.deliveryStatus === 'in_progress') return '配送中';
    if (cf.deliveryStatus || cf.hallStatus === 'grabbed') return '传信者已接单';
    if (cf.hallStatus === 'open') return '平台调度中';
    if (cf.hallStatus === 'no_rider_final') return '无骑手，人工介入中';
    return ['Created', 'AddingItems', 'ArrangingPayment'].includes(o.state) ? '待支付' : '待接单';
}
function goDetail(code: string) { uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + code }); }
function goCreate() { uni.navigateTo({ url: '/pkg-campus/errand/create' }); }
</script>
<style lang="scss" scoped>
.errand-page { min-height: 100vh; padding: 20rpx; }
.order-card { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; } &__store-col { display: flex; flex-direction: column; gap: 4rpx; } &__store { font-size: 28rpx; font-weight: 600; color: $text-color; } &__code { font-size: 22rpx; color: $text-color-secondary; } &__state { color: $brand-color; font-size: 26rpx; } &__route { display: flex; flex-direction: column; gap: 6rpx; font-size: 26rpx; color: $text-color; padding: 8rpx 0 16rpx; border-bottom: 1rpx solid $border-color; } &__note { font-size: 24rpx; color: $text-color-secondary; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; font-size: 24rpx; color: $text-color-secondary; } }
.empty-wrap { padding-top: 120rpx; display: flex; flex-direction: column; align-items: center; gap: 32rpx; }
.go-create { margin-top: 16rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 60rpx; }
</style>
```

（A/B 点展示直接用 `errandFrom → errandTo`：普通 R5 单 errandFrom=A 点文字、接力单 errandFrom=R2 原单号，语义均正确；customFields 字段来自 Task 12 Step 1 的 ORDER_FRAGMENT 增补。）

- [ ] **Step 2: Commit**

```powershell
cd d:\zhao\waimai
git add src/pkg-campus/errand/list.vue
git commit -m "feat(waimai): my errand orders list page"
```

### Task 17: 首页「校内拾光达」入口卡

**Files:**
- Modify: `d:\zhao\waimai\src\pages\home\index.vue`

- [ ] **Step 1: 金刚区加入口**

home/index.vue 金刚区（14-27 行 `.quick` 内，「传信者加入」之后）：

```html
                <view class="qk" @tap="goErrand">
                    <view class="qico">🏃</view>
                    <text class="qtxt">校内拾光达</text>
                </view>
```

script 区（goRider 旁）加：

```ts
function goErrand() { uni.navigateTo({ url: '/pkg-campus/errand/create' }); }
```

- [ ] **Step 2: Commit**

```powershell
cd d:\zhao\waimai
git add src/pages/home/index.vue
git commit -m "feat(waimai): home quick entry for campus errand"
```

### Task 18: 订单详情 R2 卡 + 接力子卡 + R4 核销码 + 时间线 R2 分支

**Files:**
- Modify: `d:\zhao\waimai\src\utils\timeline.ts`
- Test: Modify: `d:\zhao\waimai\tests\timeline.spec.ts`
- Modify: `d:\zhao\waimai\src\pkg-order\pages\order-detail.vue`

（所需 API 均已在 Task 12 落位：`markArrived`/`fetchR2Relay` ← api/mutations/campus、`fetchMyPickupCode`/`claimPickup` ← api/queries/pickup；`relayStatusLabel` ← Task 13 utils/errand。本任务不再改 api 层。）

- [ ] **Step 1: 时间线 R2 分支（TDD）**

`tests/timeline.spec.ts` 的 `describe('buildTimeline')` 内追加两用例：

```ts
    it('R2 preparing → 三节点，快递配送中为当前活跃节点', () => {
        const tl = buildTimeline('R2', null, null);
        expect(tl).toHaveLength(3);
        expect(tl.map(n => n.done)).toEqual([true, false, false]);
        expect(tl[2].label).toBe('快递已到校内代收点');
    });
    it('R2 arrived_gate → 全部完成（接力进度由接力子卡动态反查展示）', () => {
        const tl = buildTimeline('R2', null, null, 'arrived_gate');
        expect(tl.map(n => n.done)).toEqual([true, true, true]);
    });
```

先跑测试确认 FAIL，然后在 `utils/timeline.ts` 的 `buildTimeline`：签名加第 4 可选参 `leg1Status?: string | null`，R1 分支之后、默认回退之前插入：

```ts
    if (route === 'R2') {
        const arrived = (leg1Status ?? '') === 'arrived_gate';
        return [
            { key: 'merchant_accept', label: '商家接单', done: true },
            { key: 'express_shipping', label: '快递配送中', done: arrived },
            { key: 'arrived_gate', label: '快递已到校内代收点', done: arrived },
        ];
    }
```

（3 参调用不受影响：R1/R3/R5 与既有用例不变；R2 原单不经大厅，hallStatus/deliveryStatus 恒空。）

- [ ] **Step 2: R2 卡（时间线区之后、骑手卡之前插入）**

```html
    <!-- R2 快递到校卡（二期 spec §5.2）：preparing=确认到校；arrived_gate=选取件方式 -->
    <view class="section r2-card" v-if="campusRoute === 'R2'">
      <text class="section__title">快递到校</text>
      <template v-if="(order.customFields?.leg1Status ?? 'preparing') === 'preparing'">
        <text class="r2-hint">快递配送中，到达校内代收点后请点击确认</text>
        <button class="action-btn action-btn--primary r2-btn" @click="confirmArrived">快递已到校</button>
      </template>
      <template v-else>
        <text class="r2-hint">快递已到校 · 请选择取件方式</text>
        <text class="r2-hint" v-if="relayLabel">{{ relayLabel }}</text>
        <view class="r2-actions">
          <button class="action-btn r2-btn" @click="selfPickup">我去自取</button>
          <button class="action-btn action-btn--primary r2-btn" @click="goRelay" :disabled="relayActive">发 R5 接力</button>
        </view>
      </template>
    </view>
```

> spec 偏差记录：§5.2 preparing 态原文「显示快递轨迹（myOrderTracks）」——前后端均无快递轨迹 API（快递段由外部快递公司承运，未对接），二期以提示文案替代。

- [ ] **Step 3: order-detail script 改造**

① import 区改造（`fetchR2Relay` 已解包返回接力单对象或 null；`fetchMyPickupCode` 返回 `{ myPickupCode }` 由调用方解包）：

```ts
import { getOrderByCode } from '../../api/queries/order';
import { getGraphQLClient } from '../../api/client';
import { fetchOrderRider, fetchR2Relay, markArrived } from '../../api/mutations/campus';
import { fetchMyPickupCode, claimPickup } from '../../api/queries/pickup';
import { relayStatusLabel } from '../../utils/errand';
import { buildTimeline, isNoRiderFinal } from '../../utils/timeline';
```

② computed 区两处小改：

timeline 加第 4 参（R2 原单走专属三节点时间线，其余路线不受影响）：

```ts
const timeline = computed(() => buildTimeline(campusRoute.value, order.value?.customFields?.hallStatus ?? null, order.value?.customFields?.deliveryStatus ?? null, order.value?.customFields?.leg1Status ?? null));
```

canReceive 扩展（R2 已到校未收货允许「确认收货」——自取/接力送达后的完成路径；spec §5.2「走既有确认收货完成订单」依赖此入口，否则 R2 原单停在 PaymentSettled 无完成按钮）：

```ts
const canReceive = computed(() =>
    ['Delivered','PartiallyDelivered','Shipped'].includes(order.value?.state)
    || (campusRoute.value === 'R2' && order.value?.state === 'PaymentSettled'
        && (order.value?.customFields?.leg1Status ?? '') === 'arrived_gate'));
```

③ 骑手卡与时间线模板排除不经骑手的路线（R2 无校内骑手（接力进度由 R2 卡文案承载）、R4 到店自取（spec §4.1「不经骑手」，进度由核销码卡承载）；否则 R2/R4 会错误显示「传信者取餐/等待传信者接单」）：

```html
    <view class="section" v-if="campusRoute && campusRoute !== 'R4'">
```

```html
    <view class="section rider" v-if="campusRoute && !['R2','R4'].includes(campusRoute) && (rider || !timelineFinished)">
```

④ 轮询段整体替换（R2 走接力状态轮询、其余校园单走骑手轮询，共用同一 timer）：

```ts
// 轮询：R2 原单轮询接力状态（10s，动态反查不写回标记）；其余校园单轮询骑手卡（送达/无骑手终态即停）
let riderTimer: ReturnType<typeof setInterval> | null = null;
function startRiderPolling() {
    stopRiderPolling();
    if (!order.value?.id || !campusRoute.value || campusRoute.value === 'R4') return;
    if (campusRoute.value === 'R2') {
        if ((order.value?.customFields?.leg1Status ?? 'preparing') === 'arrived_gate') {
            loadRelay();
            riderTimer = setInterval(loadRelay, 10000);
        }
        return;
    }
    pollRiderOnce();
    riderTimer = setInterval(pollRiderOnce, 10000);
}
async function pollRiderOnce() {
    const cf = order.value?.customFields;
    if (!order.value?.id) return;
    if (cf?.deliveryStatus === 'delivered' || isNoRiderFinal(cf?.hallStatus ?? null)) return stopRiderPolling();
    try { rider.value = await fetchOrderRider(String(order.value.id)); } catch (e) {}
}
// R2 接力状态动态反查（spec §3.5/§4.3）；接力送达即停轮询（退款终态继续轮询，学生可重发）
async function loadRelay() {
    if (campusRoute.value !== 'R2' || !order.value?.id) return;
    try { relay.value = await fetchR2Relay(String(order.value.id)); } catch (e) {}
    if (relay.value?.deliveryStatus === 'delivered') stopRiderPolling();
}
function stopRiderPolling() { if (riderTimer) { clearInterval(riderTimer); riderTimer = null; } }
onUnmounted(stopRiderPolling);
```

⑤ R2 卡状态与动作（script 区追加；`confirmArrived` 用本文件既有 showModal 回调式写法，同 `confirmReceive`/`cancelOrder`，不用 promise 解构）：

```ts
// —— R2 快递到校（二期 spec §5.2）——
const relay = ref<any>(null);
const relayLabel = computed(() => relayStatusLabel(relay.value));
// 进行中接力单禁止重复发单（已送达/退款终态放开：已送达应去确认收货，退款可重发）
const relayActive = computed(() => {
    if (!relay.value) return false;
    return !(relay.value.state === 'Cancelled' || relay.value.hallStatus === 'no_rider_final' || relay.value.deliveryStatus === 'delivered');
});

function confirmArrived() {
    uni.showModal({
        title: '确认快递已到达校内代收点？',
        content: '确认后不可撤销，可直接自取或发接力单',
        success: async (r: any) => {
            if (!r.confirm) return;
            try {
                await markArrived(String(order.value.id));
                await reloadOrder();
                startRiderPolling(); // leg1Status 已变 arrived_gate，重启轮询进入接力状态轮询
            } catch (e: any) {
                uni.showToast({ title: e?.response?.errors?.[0]?.message || '确认失败', icon: 'none' });
            }
        },
    });
}
async function reloadOrder() {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const code = page?.options?.code; if (!code) return;
    try { const res: any = await getOrderByCode(code); order.value = res.orderByCode; } catch (e) {}
}
function selfPickup() {
    uni.showModal({
        title: '去自取',
        content: '请凭取件通知前往校内代收点自取；取到后点击「确认收货」完成订单',
        showCancel: false,
    });
}
// 发 R5 接力：预填 A 点=校内代收点、B 点=原单 campusZone（默认宿舍楼）、buildingId=原单楼栋（spec §5.2）
function goRelay() {
    const o = order.value; if (!o?.code) return;
    const cf = o.customFields ?? {};
    const a = encodeURIComponent('校内代收点');
    const b = encodeURIComponent(cf.campusZone || '');
    const buildingId = cf.buildingId || '';
    uni.navigateTo({ url: `/pkg-campus/errand/create?from=R2&code=${o.code}&a=${a}&b=${b}&buildingId=${buildingId}` });
}
```

⑥ 样式块追加（`.order-detail` 层级内）：

```scss
.r2-hint { font-size: 26rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; }
.r2-actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
.code-text { font-size: 48rpx; font-weight: bold; letter-spacing: 8rpx; text-align: center; display: block; padding: 16rpx 0; color: $text-color; }
```

- [ ] **Step 4: R4 自提核销码块（模板插到 R2 卡之后）**

```html
    <!-- R4 到店自取核销码（二期 spec §5.4） -->
    <view class="section pickup-code" v-if="isR4 && pickupCode">
        <text class="section__title">到店自取核销码</text>
        <text class="code-text">{{ pickupCode.code }}</text>
        <text class="r2-hint" v-if="pickupCode.status === 'redeemed'">已核销</text>
        <button class="action-btn r2-btn" v-else-if="canSelfRedeem" @click="selfRedeem">自助核销</button>
        <text class="r2-hint" v-else>到店出示给店员核销</text>
    </view>
```

script 区追加（import 已并入 Step 3 ①）：

```ts
// —— R4 到店自取核销码（fetchMyPickupCode 返回 { myPickupCode } 由调用方解包，Task 12 Step 4）——
const isR4 = computed(() => campusRoute.value === 'R4');
const pickupCode = ref<any>(null);
// 前端简化：到店收款（cod）单由店员核销；判断偏差由后端 claimMyPickup 拒绝并 toast
const canSelfRedeem = computed(() =>
    pickupCode.value?.status === 'generated' && order.value?.payments?.[0]?.method !== 'cash-on-delivery');

async function loadPickupCode() {
    if (campusRoute.value !== 'R4' || !order.value?.id) return;
    try { const r: any = await fetchMyPickupCode(String(order.value.id)); pickupCode.value = r?.myPickupCode ?? null; } catch (e) {}
}
async function selfRedeem() {
    try {
        await claimPickup(String(order.value.id), pickupCode.value.code);
        await loadPickupCode();
        uni.showToast({ title: '核销成功', icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '核销失败', icon: 'none' });
    }
}
```

`onMounted` 里订单加载成功之后、`startRiderPolling()` 之前追加 `loadPickupCode();`（`startRiderPolling` 已内置 R2 接力轮询分支，onMounted 无需再单独调 `loadRelay`）。

- [ ] **Step 5: 「平台调度中」R5 透出确认**

R5 单（含接力单）状态展示复用现有 `dispatching`/`riderHint`（120-130 行）——零改动，人工目检 R5 单详情页显示「平台调度中，正在为您加急派单」。

- [ ] **Step 6: 测试 + Commit**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS（含 timeline R2 两新用例）

```powershell
cd d:\zhao\waimai
git add src/pkg-order/pages/order-detail.vue src/utils/timeline.ts tests/timeline.spec.ts
git commit -m "feat(waimai): R2 arrived/relay card + R4 pickup code + R2 timeline"
```

---

## Task 19：全量回归 + 三端本地构建

- [ ] **Step 1: plugin 回归**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: 全 PASS（含 Task 10 已 build 的 lib）

- [ ] **Step 2: waimai 回归 + 构建**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Run: `cd d:\zhao\waimai; pnpm build:h5`
Expected: PASS；`dist/build/h5` 产物更新

- [ ] **Step 3: waimai dist 入库提交**

```powershell
cd d:\zhao\waimai
git add dist/build/h5
git commit -m "chore(waimai): rebuild h5 dist with phase2 features"
```

（若 dist 路径不同，以仓库实际跟踪的构建产物目录为准。）

- [ ] **Step 4: web-admin 构建**

Run: `cd d:\zhao\vshop\web-admin; pnpm build:h5`
Expected: 构建成功（web-admin 部署走 deploy.mjs，产物不入库则跳过提交）

---

## Task 20：部署 + 手机截图 + 操作手册收口

- [ ] **Step 1: 推送三仓**

```powershell
cd d:\zhao\vendure; git push
cd d:\zhao\waimai; git push
cd d:\zhao\vshop; git push
```

- [ ] **Step 2: vendure 服务器部署（仅 pull + restart，严禁服务器构建）**

```powershell
$cmd = @'
cd /www/vendure && git pull && pm2 restart vendure && sleep 3 && pm2 logs vendure --lines 20 --nostream
'@; $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cmd)); ssh joho "echo $encoded | base64 -d | bash"
```

（服务器仓库路径以既有部署脚本/历史为准——先 `ssh joho "pm2 info vendure"` 确认 cwd；启动日志确认 CreateCampusTablesMigration 无报错。）

- [ ] **Step 3: waimai / web-admin 部署**

```powershell
cd d:\zhao\waimai; node .secrets/deploy-waimai.mjs
cd d:\zhao\vshop; node scripts/deploy.mjs
```

- [ ] **Step 4: 线上冒烟（curl/Playwright）**

- shop-api：`waimaiStoreList` 含 `errandBaseFee`；`campusErrandVariant` 返回 variantId。
- 起送价硬校验：未满起送价订单 transitionOrderToState 返回「未满起送价 ¥X」。
- web-admin 拾光达配置页保存 storeAddress → shop-api `pickupLocations(type:"store")` 出现该自提点。

- [ ] **Step 5: 手机截图（390×844 dpr=2，Playwright 移动视口）+ 目检**

清单：① 首页「校内拾光达」入口卡 ② 发单页（类型/起止点/起步价+小费滑杆/「我的跑腿单」入口） ③ 我的跑腿单列表卡 ④ checkout 校园 tab R2 选项与运费说明 ⑤ R2 订单卡（已到校按钮/二次确认弹层/到校后取件方式） ⑥ 接力单状态子卡 ⑦ R4 核销码块 ⑧ web-admin 跑腿起步价表单。

- [ ] **Step 6: 操作手册二期章节**

`d:\zhao\vshop\docs\waimai-操作手册.md` 追加「校园配送二期（R2/R4/R5 + 起送价硬校验）」章节：功能说明、后台配置项（errandBaseFee/storeAddress 绑定自提点）、R2 学生操作流（到校确认→自取/接力）、R5 发单流程、截图逐张插入、常见问题（接力退款语义：只退接力单，原单不退）。

- [ ] **Step 7: 手册提交 + 最终推送**

```powershell
cd d:\zhao\vshop
git add docs/waimai-操作手册.md
git commit -m "docs: phase2 chapter in waimai manual"
git push
```
