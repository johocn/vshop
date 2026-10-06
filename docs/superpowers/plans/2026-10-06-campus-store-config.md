# 拾光达店铺配置底座（一期）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** campus-delivery-plugin 店铺配置 6 字段扩展 + web-admin「拾光达配置」管理页 + waimai 字段化消费与「拾光达/拾光传信者」品牌文案统一。

**Architecture:** 三仓顺序改造。① vendure `campus-delivery-plugin`：`CampusFulfillmentConfig` 实体（即 spec 中"店铺配置"载体，channelId 唯一列）加 6 个可空列 + 幂等 ALTER 迁移；`WaimaiStoreService` 扩展 shop 输出并新增 admin 侧 `listStoreConfigs`/`updateStoreConfig`（upsert + R1-R5 白名单）；admin/shop GraphQL schema 扩展。② web-admin（复用 uni-app H5 多租户后台）：`apis/campus.ts` + `pages/campus/config.vue`（跨租户店铺卡列表 + 路线 chips + 分↔元表单）。③ waimai 学生端：`waimaiStoreList` 查询扩展 6 字段，首页时长 tag / 商家 Tab 地址电话公告 / checkout 配送费+起送价软校验，全部 null 兜底零破坏；同 PR 落地 spec 〇节 12 处品牌文案。

**Tech Stack:** Vendure 3.6.4（NestJS/TypeORM/gql）+ vitest；web-admin uni-app Vue3 + graphql-request v7（i18n zh-Hans/en 双语言包）；waimai uni-app Vue3 + vitest。

**Spec（唯一事实源）:** `d:\zhao\vshop\docs\superpowers\specs\2026-10-06-campus-store-config-design.md`

**硬规则（全程适用）:**
- 品牌术语：仅改**用户可见文案**为「拾光达 / 拾光传信者（短称：传信者）」；代码注释、字段名（riderStatus 等）、接口名一律保留「骑手/校园」不动。
- PowerShell 环境：不支持 `&&`（用 `;` 或分两条命令）；commit 信息用单行 ASCII `-m` 即可，勿写中文长信息。
- 金额一律**分**存储/传输；web-admin 页面层做 分↔元 转换。
- 测试命令：
  - plugin：`cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
  - waimai：`cd d:\zhao\waimai; pnpm exec vitest run`
  - web-admin：`cd d:\zhao\vshop\web-admin; pnpm exec vitest run`
- 手机截图规范：Playwright 390×844 dpr=2，逐张目检。

---

## File Structure

**vendure plugin**（`d:\zhao\vendure\packages\campus-delivery-plugin\src\`，本仓 root 为 `d:\zhao\vendure`）
- Modify `campus-fulfillment-config.entity.ts` — 店铺配置实体（channelId 唯一），加 6 可空列
- Modify `migrations/create-campus-tables.ts` — 幂等 ALTER 补列（启动时执行，PG `IF NOT EXISTS`）
- Modify `waimai-store.service.ts` — shop `listStores` 输出 6 字段；新增 `listStoreConfigs` / `updateStoreConfig`
- Modify `waimai-store.service.spec.ts` — 上述逻辑的 vitest
- Modify `campus-config-admin.resolver.ts` — `campusStoreConfigs` 查询 + `campusUpdateStoreConfig` mutation（权限 `CampusPermissions.CampusConfig`）
- Modify `campus-delivery.plugin.ts` — admin schema 新类型/新字段；shop schema `WaimaiStore` 加 6 可空字段

**web-admin**（`d:\zhao\vshop\web-admin\src\`，本仓 root 为 `d:\zhao\vshop`）
- Create `utils/money.ts` + `utils/money.spec.ts` — 分↔元纯函数
- Create `apis/campus.ts` — admin-api 两个调用
- Create `pages/campus/config.vue` — 拾光达配置页
- Modify `pages.json` / `constants/menus.ts` / `locale/zh-Hans.json` / `locale/en.json`

**waimai**（`d:\zhao\waimai\`）
- Modify `src/api/queries/waimai.ts` — `WAIMAI_STORE_LIST` 加 6 字段
- Modify `src/utils/store-display.ts` + `tests/store-display.spec.ts` — R1/R2/R3 新文案 + `deliveryTag` 纯函数
- Modify `src/utils/timeline.ts` + `tests/timeline.spec.ts` — 「传信者取餐」
- Modify 品牌文案 12 处：`src/pages.json`、`src/manifest.json`、`src/pages/login/index.vue`、`src/pages/home/index.vue`、`src/pages/shop/menu.vue`、`src/pkg-order/pages/checkout.vue`、`src/pkg-order/pages/order-detail.vue`、`src/pkg-rider/pages/rider-join.vue`、`src/pages/profile/index.vue`
- 消费侧：`src/pages/home/index.vue`（时长 tag）、`src/pages/shop/menu.vue`（地址/电话/公告 + 传参）、`src/pkg-order/pages/checkout.vue`（费用展示 + 软校验）

**任务顺序**：Task 1-4（plugin）→ Task 5-7（web-admin）→ Task 8-11（waimai）→ Task 12（回归/部署）。

---

### Task 1: 实体扩展 + 幂等迁移 SQL（vendure plugin）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-fulfillment-config.entity.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\migrations\create-campus-tables.ts`

- [ ] **Step 1: 实体加 6 个可空列**

`campus-fulfillment-config.entity.ts` 在 `compensationCouponTemplateId` 行之后追加（保持既有列风格）：

```ts
    @Column({ type: 'int', nullable: true }) deliveryMinutes: number | null; // 配送时长（分钟）
    @Column({ type: 'int', nullable: true }) minOrderAmount: number | null; // 起送价（分）
    @Column({ type: 'int', nullable: true }) deliveryFee: number | null; // 配送费（分，本期仅展示）
    @Column({ type: 'varchar', nullable: true }) storeAddress: string | null; // 自提地址
    @Column({ type: 'varchar', nullable: true }) storePhone: string | null; // 联系电话
    @Column({ type: 'varchar', nullable: true }) storeNotice: string | null; // 店铺公告
```

- [ ] **Step 2: 迁移 SQL 补 6 条幂等 ALTER**

`migrations/create-campus-tables.ts` 在 `createCampusTables` 模板字符串末尾（`compensationCouponTemplateId` 那条 ALTER 之后）追加：

```sql
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "deliveryMinutes" int;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "minOrderAmount" int;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "deliveryFee" int;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "storeAddress" varchar(255);
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "storePhone" varchar(255);
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "storeNotice" varchar(255);
```

- [ ] **Step 3: 跑既有 plugin 单测确认无回归**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: 全部 PASS（实体加列不影响既有 mock 测试）。

- [ ] **Step 4: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/campus-fulfillment-config.entity.ts packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts
git commit -m "feat(campus): add store config nullable columns to CampusFulfillmentConfig"
```

---

### Task 2: shop listStores 输出 6 字段（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.spec.ts`

- [ ] **Step 1: 先改测试期望（写失败测试）**

`waimai-store.service.spec.ts` 两个用例的期望对象加 6 字段（无配置行 → 全 null）。把整个文件替换为：

```ts
import { describe, expect, it, vi } from 'vitest';
import { WaimaiStoreService } from './waimai-store.service';

function makeEnv(opts: { channels?: any[]; configs?: any[] } = {}) {
    const repoByEntity: Record<string, any> = {
        CampusFulfillmentConfig: {
            find: vi.fn().mockResolvedValue(opts.configs ?? []),
            findOne: vi.fn(),
            save: vi.fn(async (x: any) => x),
        },
        Channel: {
            find: vi.fn().mockResolvedValue(opts.channels ?? []),
            findOne: vi.fn(),
        },
    };
    const conn = { getRepository: vi.fn((_ctx: any, ent: any) => repoByEntity[ent.name ?? String(ent)]) } as any;
    return { svc: new WaimaiStoreService(conn), repoByEntity };
}

describe('WaimaiStoreService.listStores', () => {
    it('仅返回有履约配置的渠道并解析 tags，新 6 字段从配置透出', async () => {
        const env = makeEnv({
            configs: [
                { channelId: 1, paused: false, routesEnabled: ['R3'] },   // 默认渠道脏配置：应被跳过
                { channelId: 2, paused: false, routesEnabled: ['R1', 'R3'], deliveryMinutes: 35, minOrderAmount: 1500, deliveryFee: 200, storeAddress: '东门 1 号楼', storePhone: '13800000000', storeNotice: '周末出餐慢' },
            ],
            channels: [
                { id: 1, token: 'default', code: '__default_channel__', customFields: {} },
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
            deliveryMinutes: 35, minOrderAmount: 1500, deliveryFee: 200,
            storeAddress: '东门 1 号楼', storePhone: '13800000000', storeNotice: '周末出餐慢',
        });
    });
    it('空 tags/缺月售/缺新字段容错（全 null），paused 透传', async () => {
        const env = makeEnv({
            configs: [{ channelId: 9, paused: true, routesEnabled: [] }],
            channels: [{ id: 9, token: 'x', code: 'x店', customFields: {} }],
        });
        const list = await env.svc.listStores({} as any);
        expect(list[0].tags).toEqual([]);
        expect(list[0].monthlySales).toBe(0);
        expect(list[0].promoText).toBeNull();
        expect(list[0].paused).toBe(true);
        expect(list[0].deliveryMinutes).toBeNull();
        expect(list[0].minOrderAmount).toBeNull();
        expect(list[0].deliveryFee).toBeNull();
        expect(list[0].storeAddress).toBeNull();
        expect(list[0].storePhone).toBeNull();
        expect(list[0].storeNotice).toBeNull();
    });
});
```

（文件末尾保留位置给 Task 3 追加的 describe 块。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: FAIL（期望对象多出 6 个 undefined 字段，`toEqual` 不匹配）。

- [ ] **Step 3: 实现 listStores 透出**

`waimai-store.service.ts`：
① `WaimaiStore` 接口在 `routesEnabled: string[];` 后追加：

```ts
    deliveryMinutes: number | null;
    minOrderAmount: number | null;
    deliveryFee: number | null;
    storeAddress: string | null;
    storePhone: string | null;
    storeNotice: string | null;
```

② `listStores` 的 `stores.push({...})` 在 `routesEnabled: cfg.routesEnabled ?? [],` 后追加：

```ts
                deliveryMinutes: cfg.deliveryMinutes ?? null,
                minOrderAmount: cfg.minOrderAmount ?? null,
                deliveryFee: cfg.deliveryFee ?? null,
                storeAddress: cfg.storeAddress ?? null,
                storePhone: cfg.storePhone ?? null,
                storeNotice: cfg.storeNotice ?? null,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS（2 个用例）。

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/waimai-store.service.ts packages/campus-delivery-plugin/src/waimai-store.service.spec.ts
git commit -m "feat(campus): expose store config fields via waimaiStoreList"
```

---

### Task 3: admin 侧 listStoreConfigs / updateStoreConfig（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`waimai-store.service.spec.ts` 末尾追加（`makeEnv` 已在 Task 2 支持 findOne/save，直接复用）：

```ts
import { UserInputError } from '@vendure/core';

describe('WaimaiStoreService.listStoreConfigs', () => {
    it('全渠道输出（默认渠道跳过），无配置行店铺 routesEnabled=[] 且 6 字段全 null', async () => {
        const env = makeEnv({
            configs: [{ channelId: 2, paused: false, routesEnabled: ['R1', 'R3'], deliveryMinutes: 35, minOrderAmount: 1500, deliveryFee: 200, storeAddress: '东门 1 号楼', storePhone: '13800000000', storeNotice: '周末出餐慢' }],
            channels: [
                { id: 1, token: 'default', code: '__default_channel__' },
                { id: 2, token: 'canteen', code: '一食堂麻辣香锅' },
                { id: 3, token: 'milktea', code: '奶茶铺' },
            ],
        });
        const list = await env.svc.listStoreConfigs({} as any);
        expect(list).toHaveLength(2);
        expect(list[0]).toEqual({
            channelId: 2, channelName: '一食堂麻辣香锅', channelToken: 'canteen',
            routesEnabled: ['R1', 'R3'],
            deliveryMinutes: 35, minOrderAmount: 1500, deliveryFee: 200,
            storeAddress: '东门 1 号楼', storePhone: '13800000000', storeNotice: '周末出餐慢',
        });
        expect(list[1]).toEqual({
            channelId: 3, channelName: '奶茶铺', channelToken: 'milktea',
            routesEnabled: [],
            deliveryMinutes: null, minOrderAmount: null, deliveryFee: null,
            storeAddress: null, storePhone: null, storeNotice: null,
        });
    });
});

describe('WaimaiStoreService.updateStoreConfig', () => {
    it('无配置行则创建（upsert 幂等）：同 channelId 二次调用更新不新增行', async () => {
        const env = makeEnv({
            channels: [{ id: 2, token: 'canteen', code: '一食堂麻辣香锅' }],
        });
        const cfgRepo = env.repoByEntity.CampusFulfillmentConfig;
        cfgRepo.findOne.mockResolvedValueOnce(undefined);   // 第一次：无行
        cfgRepo.findOne.mockResolvedValueOnce({ channelId: 2, routesEnabled: ['R1'] });   // 第二次：已有行
        const input = { routesEnabled: ['R1', 'R3'], deliveryMinutes: 35, minOrderAmount: 1500, deliveryFee: 200, storeAddress: '东门 1 号楼', storePhone: '13800000000', storeNotice: '周末出餐慢' };
        await env.svc.updateStoreConfig({} as any, 2, input);
        await env.svc.updateStoreConfig({} as any, 2, { ...input, routesEnabled: ['R3'] });
        expect(cfgRepo.save).toHaveBeenCalledTimes(2);
        expect(cfgRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('白名单校验：routesEnabled 含 R9 抛 UserInputError，不落库', async () => {
        const env = makeEnv({ channels: [{ id: 2, token: 'canteen', code: '一食堂麻辣香锅' }] });
        const cfgRepo = env.repoByEntity.CampusFulfillmentConfig;
        cfgRepo.findOne.mockResolvedValue({ channelId: 2, routesEnabled: ['R1'] });
        await expect(env.svc.updateStoreConfig({} as any, 2, { routesEnabled: ['R1', 'R9'] }))
            .rejects.toThrow(UserInputError);
        expect(cfgRepo.save).not.toHaveBeenCalled();
    });

    it('金额/时长负数拒绝', async () => {
        const env = makeEnv({ channels: [{ id: 2, token: 'canteen', code: '一食堂麻辣香锅' }] });
        env.repoByEntity.CampusFulfillmentConfig.findOne.mockResolvedValue({ channelId: 2, routesEnabled: ['R1'] });
        await expect(env.svc.updateStoreConfig({} as any, 2, { routesEnabled: ['R1'], minOrderAmount: -1 }))
            .rejects.toThrow(UserInputError);
        await expect(env.svc.updateStoreConfig({} as any, 2, { routesEnabled: ['R1'], deliveryFee: -5 }))
            .rejects.toThrow(UserInputError);
        await expect(env.svc.updateStoreConfig({} as any, 2, { routesEnabled: ['R1'], deliveryMinutes: -10 }))
            .rejects.toThrow(UserInputError);
    });

    it('渠道不存在抛 UserInputError', async () => {
        const env = makeEnv({});
        env.repoByEntity.Channel.findOne.mockResolvedValue(undefined);
        await expect(env.svc.updateStoreConfig({} as any, 99, { routesEnabled: ['R1'] }))
            .rejects.toThrow(UserInputError);
    });

    it('成功保存后返回 WithChannel 视图', async () => {
        const env = makeEnv({ channels: [{ id: 2, token: 'canteen', code: '一食堂麻辣香锅' }] });
        env.repoByEntity.CampusFulfillmentConfig.findOne.mockResolvedValue({ channelId: 2, routesEnabled: ['R1'] });
        const out = await env.svc.updateStoreConfig({} as any, 2, { routesEnabled: ['R2'], storeNotice: '公告' });
        expect(out).toEqual({
            channelId: 2, channelName: '一食堂麻辣香锅', channelToken: 'canteen',
            routesEnabled: ['R2'],
            deliveryMinutes: null, minOrderAmount: null, deliveryFee: null,
            storeAddress: null, storePhone: null, storeNotice: '公告',
        });
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: FAIL（`listStoreConfigs` / `updateStoreConfig` 不存在，TypeError）。

- [ ] **Step 3: 实现两个方法**

`waimai-store.service.ts`：
① 文件顶部 import 补 `UserInputError` 与实体已有 import 不变：

```ts
import { Channel, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
```

② `WaimaiStore` 接口后新增：

```ts
export interface CampusStoreConfigWithChannel {
    channelId: number;
    channelName: string;
    channelToken: string;
    routesEnabled: string[];
    deliveryMinutes: number | null;
    minOrderAmount: number | null;
    deliveryFee: number | null;
    storeAddress: string | null;
    storePhone: string | null;
    storeNotice: string | null;
}

const ROUTE_WHITELIST = ['R1', 'R2', 'R3', 'R4', 'R5'];
```

③ `WaimaiStoreService` 类内追加两个方法（放在 `listStores` 之后）：

```ts
    /** admin：全店铺配置（跨渠道，join Channel 取店铺名/token；默认渠道是平台会话渠道，跳过） */
    async listStoreConfigs(ctx: RequestContext): Promise<CampusStoreConfigWithChannel[]> {
        const configs = await this.connection.getRepository(ctx, CampusFulfillmentConfig).find();
        const byChannel = new Map(configs.map(c => [Number(c.channelId), c]));
        const channels = await this.connection.getRepository(ctx, Channel).find();
        const out: CampusStoreConfigWithChannel[] = [];
        for (const ch of channels) {
            if (ch.code === '__default_channel__') continue;
            const cfg = byChannel.get(Number(ch.id));
            out.push(this.toConfigView(Number(ch.id), ch.code, ch.token, cfg));
        }
        return out;
    }

    /** admin：按 channelId upsert（幂等），routesEnabled 白名单 R1-R5，负数金额拒绝 */
    async updateStoreConfig(
        ctx: RequestContext,
        channelId: number,
        input: {
            routesEnabled: string[];
            deliveryMinutes?: number | null;
            minOrderAmount?: number | null;
            deliveryFee?: number | null;
            storeAddress?: string | null;
            storePhone?: string | null;
            storeNotice?: string | null;
        },
    ): Promise<CampusStoreConfigWithChannel> {
        const bad = (input.routesEnabled ?? []).filter(r => !ROUTE_WHITELIST.includes(r));
        if (bad.length) throw new UserInputError(`不支持的配送路线: ${bad.join(', ')}（仅接受 R1-R5）`);
        const negative = (['deliveryMinutes', 'minOrderAmount', 'deliveryFee'] as const)
            .filter(k => input[k] != null && (input[k] as number) < 0);
        if (negative.length) throw new UserInputError(`不能为负数: ${negative.join(', ')}`);
        const chRepo = this.connection.getRepository(ctx, Channel);
        const ch = await chRepo.findOne({ where: { id: channelId as any } });
        if (!ch) throw new UserInputError(`渠道不存在: ${channelId}`);
        const repo = this.connection.getRepository(ctx, CampusFulfillmentConfig);
        let cfg = await repo.findOne({ where: { channelId: channelId as any } });
        if (!cfg) cfg = new CampusFulfillmentConfig({ channelId });
        cfg.routesEnabled = input.routesEnabled;
        cfg.deliveryMinutes = input.deliveryMinutes ?? null;
        cfg.minOrderAmount = input.minOrderAmount ?? null;
        cfg.deliveryFee = input.deliveryFee ?? null;
        cfg.storeAddress = input.storeAddress ?? null;
        cfg.storePhone = input.storePhone ?? null;
        cfg.storeNotice = input.storeNotice ?? null;
        await repo.save(cfg);
        return this.toConfigView(channelId, ch.code, ch.token, cfg);
    }

    private toConfigView(
        channelId: number,
        channelName: string,
        channelToken: string,
        cfg: CampusFulfillmentConfig | undefined,
    ): CampusStoreConfigWithChannel {
        return {
            channelId,
            channelName,
            channelToken,
            routesEnabled: cfg?.routesEnabled ?? [],
            deliveryMinutes: cfg?.deliveryMinutes ?? null,
            minOrderAmount: cfg?.minOrderAmount ?? null,
            deliveryFee: cfg?.deliveryFee ?? null,
            storeAddress: cfg?.storeAddress ?? null,
            storePhone: cfg?.storePhone ?? null,
            storeNotice: cfg?.storeNotice ?? null,
        };
    }
```

注意：`new CampusFulfillmentConfig({ channelId })` 与 `campus-config.service.ts` 的 `getConfig` 建行方式一致；`channelId` 传 `number` 即可（构造器 `DeepPartial` 不校验 ID 类型）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS（waimai-store.service.spec.ts 全绿）。

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/waimai-store.service.ts packages/campus-delivery-plugin/src/waimai-store.service.spec.ts
git commit -m "feat(campus): add admin listStoreConfigs/updateStoreConfig with route whitelist"
```

---

### Task 4: GraphQL schema + admin resolver 扩展（vendure plugin）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-config-admin.resolver.ts`

- [ ] **Step 1: admin schema 加类型与入口**

`campus-delivery.plugin.ts` adminApiExtensions 的 gql 模板里，`type CampusErrandProductResult {...}` 块之后、`extend type Query` 之前插入：

```graphql
                type CampusStoreConfigWithChannel {
                    channelId: ID!
                    channelName: String!
                    channelToken: String!
                    routesEnabled: [String!]!
                    deliveryMinutes: Int
                    minOrderAmount: Int
                    deliveryFee: Int
                    storeAddress: String
                    storePhone: String
                    storeNotice: String
                }

                input CampusStoreConfigInput {
                    routesEnabled: [String!]!
                    deliveryMinutes: Int
                    minOrderAmount: Int
                    deliveryFee: Int
                    storeAddress: String
                    storePhone: String
                    storeNotice: String
                }
```

`extend type Query {` 块内追加一行：

```graphql
                    campusStoreConfigs: [CampusStoreConfigWithChannel!]!
```

`extend type Mutation {` 块内追加一行：

```graphql
                    campusUpdateStoreConfig(channelId: ID!, input: CampusStoreConfigInput!): CampusStoreConfigWithChannel!
```

- [ ] **Step 2: shop schema 的 WaimaiStore 加 6 可空字段**

同一文件 shopApiExtensions gql 模板里 `type WaimaiStore {...}` 在 `routesEnabled: [String!]!` 后追加：

```graphql
                    deliveryMinutes: Int
                    minOrderAmount: Int
                    deliveryFee: Int
                    storeAddress: String
                    storePhone: String
                    storeNotice: String
```

- [ ] **Step 3: admin resolver 加 query/mutation**

`campus-config-admin.resolver.ts`：
① import 与构造器注入 `WaimaiStoreService`：

```ts
import { WaimaiStoreService } from './waimai-store.service';
```

```ts
    constructor(private config: CampusConfigService, private errand: ErrandService, private stores: WaimaiStoreService) {}
```

② 类内追加（放在 `campusEnsureErrandProducts` 之后）：

```ts
    /** 拾光达店铺配置：全店铺列表（跨租户视角） */
    @Query()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusStoreConfigs(@Ctx() ctx: RequestContext) {
        return this.stores.listStoreConfigs(ctx);
    }

    @Mutation()
    @Allow(CampusPermissions.CampusConfig as any)
    async campusUpdateStoreConfig(
        @Ctx() ctx: RequestContext,
        @Args('channelId') channelId: ID,
        @Args('input') input: any,
    ) {
        return this.stores.updateStoreConfig(ctx, Number(channelId), input);
    }
```

- [ ] **Step 4: 全量回归 + TypeScript 编译验证**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: PASS。

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx tsc --noEmit -p tsconfig.json`（若无独立 tsconfig，则 `cd d:\zhao\vendure; npx tsc --noEmit -p packages/campus-delivery-plugin/tsconfig.json`；两者都不可用时以 `pnpm build` 该包为准）
Expected: 无类型错误（resolver 注入/schema 字符串均通过）。

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/campus-delivery.plugin.ts packages/campus-delivery-plugin/src/campus-config-admin.resolver.ts
git commit -m "feat(campus): admin GraphQL for campusStoreConfigs/campusUpdateStoreConfig"
```

---

### Task 5: web-admin 分↔元纯函数（TDD）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\utils\money.ts`
- Test: `d:\zhao\vshop\web-admin\src\utils\money.spec.ts`

- [ ] **Step 1: 写失败测试**

`src/utils/money.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { fenToYuan, yuanToFen } from './money';

describe('fenToYuan', () => {
    it('分转元并去尾零', () => {
        expect(fenToYuan(1250)).toBe('12.5');
        expect(fenToYuan(1200)).toBe('12');
        expect(fenToYuan(1005)).toBe('10.05');
        expect(fenToYuan(1)).toBe('0.01');
    });
    it('0 与 null', () => {
        expect(fenToYuan(0)).toBe('0');
        expect(fenToYuan(null)).toBe('');
        expect(fenToYuan(undefined)).toBe('');
    });
});

describe('yuanToFen', () => {
    it('元转分（最多两位小数）', () => {
        expect(yuanToFen('12.5')).toBe(1250);
        expect(yuanToFen('12')).toBe(1200);
        expect(yuanToFen('0.1')).toBe(10);
        expect(yuanToFen('0')).toBe(0);
    });
    it('非法输入返回 null（空/非数字/负数/超两位小数）', () => {
        expect(yuanToFen('')).toBeNull();
        expect(yuanToFen('abc')).toBeNull();
        expect(yuanToFen('-1')).toBeNull();
        expect(yuanToFen('12.555')).toBeNull();
        expect(yuanToFen('  ')).toBeNull();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vshop\web-admin; pnpm exec vitest run`
Expected: FAIL（`./money` 模块不存在）。

- [ ] **Step 3: 实现**

`src/utils/money.ts`：

```ts
/** 金额分↔元转换（拾光达配置页用）：分存储/传输，页面展示与录入用元 */

/** 分 → 元字符串（去尾零，最多两位小数；null/undefined → ''） */
export function fenToYuan(fen: number | null | undefined): string {
  if (fen == null) return '';
  const s = (fen / 100).toFixed(2);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** 元字符串 → 分；非法（空/非数字/负数/超两位小数）→ null，由调用方拦截提示 */
export function yuanToFen(input: string): number | null {
  const s = (input ?? '').trim();
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vshop\web-admin; pnpm exec vitest run`
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vshop
git add web-admin/src/utils/money.ts web-admin/src/utils/money.spec.ts
git commit -m "feat(web-admin): fen/yuan money helpers"
```

---

### Task 6: web-admin API 层 apis/campus.ts

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\campus.ts`

- [ ] **Step 1: 写 API 文件**

```ts
// 拾光达（校内配送）域 admin-api 调用：店铺配置列表 + upsert
// 后端：campus-delivery-plugin admin-api（campusStoreConfigs / campusUpdateStoreConfig，
// 权限 CampusConfig）。金额字段均为「分」，页面层用 utils/money 做分↔元转换。
import { getAdminClient } from './client';

export interface CampusStoreConfig {
  channelId: string;
  channelName: string;
  channelToken: string;
  routesEnabled: string[];
  deliveryMinutes: number | null;
  minOrderAmount: number | null;
  deliveryFee: number | null;
  storeAddress: string | null;
  storePhone: string | null;
  storeNotice: string | null;
}

export interface CampusStoreConfigInput {
  routesEnabled: string[];
  deliveryMinutes?: number | null;
  minOrderAmount?: number | null;
  deliveryFee?: number | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  storeNotice?: string | null;
}

const FIELDS =
  'channelId channelName channelToken routesEnabled deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice';

export async function campusStoreConfigs(): Promise<CampusStoreConfig[]> {
  const res = await getAdminClient().request<{ campusStoreConfigs: CampusStoreConfig[] }>(
    `query { campusStoreConfigs { ${FIELDS} } }`,
  );
  return res.campusStoreConfigs;
}

export async function campusUpdateStoreConfig(
  channelId: string,
  input: CampusStoreConfigInput,
): Promise<CampusStoreConfig> {
  const res = await getAdminClient().request<{ campusUpdateStoreConfig: CampusStoreConfig }>(
    `mutation ($channelId: ID!, $input: CampusStoreConfigInput!) {
      campusUpdateStoreConfig(channelId: $channelId, input: $input) { ${FIELDS} }
    }`,
    { channelId, input },
  );
  return res.campusUpdateStoreConfig;
}
```

- [ ] **Step 2: Commit**

```powershell
cd d:\zhao\vshop
git add web-admin/src/apis/campus.ts
git commit -m "feat(web-admin): campus store config api layer"
```

---

### Task 7: web-admin「拾光达配置」页 + 注册 + 菜单 + i18n

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\campus\config.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`
- Modify: `d:\zhao\vshop\web-admin\src\constants\menus.ts`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: locale 词条（两语言同步）**

`src/locale/zh-Hans.json`：在 `"menu"` 对象内任意稳定位置加 `"campusConfig": "拾光达配置"`；顶层对象内加 `"campusConfig"` 命名空间（与 `decorateShopInfo` 同级）：

```json
"campusConfig": {
  "loading": "加载中…",
  "empty": "暂无店铺渠道",
  "loadFailed": "加载失败",
  "routesCount": "已开通 {n} 条路线",
  "routesNone": "暂未开通配送",
  "routeSection": "配送路线",
  "infoSection": "配送信息",
  "r1": "商家自送", "r2": "快递代取", "r3": "档口直送", "r4": "到店自取", "r5": "跑腿代取",
  "deliveryMinutes": "配送时长（分钟）",
  "minOrder": "起送价（元）",
  "deliveryFee": "配送费（元）",
  "storeAddress": "自提地址",
  "storePhone": "联系电话",
  "storeNotice": "店铺公告",
  "phMinutes": "未配置",
  "phYuan": "未配置",
  "phText": "未配置",
  "save": "保存",
  "saving": "保存中…",
  "saved": "已保存",
  "saveFailed": "保存失败",
  "badAmount": "金额格式不正确（非负数字，最多两位小数）",
  "badMinutes": "配送时长需为非负整数"
}
```

`src/locale/en.json` 对应加：

```json
"menu" 内: "campusConfig": "Shiguangda Config",
"campusConfig": {
  "loading": "Loading…",
  "empty": "No store channels",
  "loadFailed": "Load failed",
  "routesCount": "{n} routes enabled",
  "routesNone": "Delivery not enabled",
  "routeSection": "Delivery Routes",
  "infoSection": "Delivery Info",
  "r1": "Merchant", "r2": "Parcel Relay", "r3": "Stall Direct", "r4": "Pickup", "r5": "Errand",
  "deliveryMinutes": "Delivery Time (min)",
  "minOrder": "Min Order (yuan)",
  "deliveryFee": "Delivery Fee (yuan)",
  "storeAddress": "Pickup Address",
  "storePhone": "Phone",
  "storeNotice": "Store Notice",
  "phMinutes": "Not set",
  "phYuan": "Not set",
  "phText": "Not set",
  "save": "Save",
  "saving": "Saving…",
  "saved": "Saved",
  "saveFailed": "Save failed",
  "badAmount": "Invalid amount (non-negative, up to 2 decimals)",
  "badMinutes": "Delivery time must be a non-negative integer"
}
```

注意：两个 JSON 均为单一大对象，插入时保持前一行逗号合法（插入位置选同层级相邻键之间，勿破坏 JSON 结构）。

- [ ] **Step 2: 页面文件**

`src/pages/campus/config.vue`（交互形态=已定稿 mockup：店铺卡列表 + 5 路线 chips + 分↔元表单；样式沿用 shop-info 页 $wa-* 令牌）：

```vue
<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusConfig.loading') }}</view>
    <view v-else-if="!cards.length" class="hint">{{ $t('campusConfig.empty') }}</view>
    <view v-for="card in cards" v-else :key="card.channelId" class="card">
      <view class="head" @tap="toggle(card.channelId)">
        <view class="head-l">
          <text class="name">{{ card.channelName }}</text>
          <text class="token">…{{ card.channelToken.slice(-4) }}</text>
        </view>
        <text class="count">{{ routeCountLabel(card.routesEnabled) }}</text>
        <text class="chev">{{ expandedId === card.channelId ? '▾' : '▸' }}</text>
      </view>
      <block v-if="expandedId === card.channelId">
        <view class="sec-t">{{ $t('campusConfig.routeSection') }}</view>
        <view class="chips">
          <view
            v-for="r in ROUTES" :key="r.code"
            class="chip" :class="{ on: card.form.routesEnabled.includes(r.code) }"
            @tap="toggleRoute(card, r.code)"
          >{{ $t(r.key) }}</view>
        </view>
        <view class="sec-t">{{ $t('campusConfig.infoSection') }}</view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.deliveryMinutes') }}</text>
          <input v-model="card.form.deliveryMinutes" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.minOrder') }}</text>
          <input v-model="card.form.minOrderYuan" type="digit" :placeholder="$t('campusConfig.phYuan')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.deliveryFee') }}</text>
          <input v-model="card.form.deliveryFeeYuan" type="digit" :placeholder="$t('campusConfig.phYuan')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.storeAddress') }}</text>
          <input v-model="card.form.storeAddress" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.storePhone') }}</text>
          <input v-model="card.form.storePhone" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="cell col">
          <text class="lbl">{{ $t('campusConfig.storeNotice') }}</text>
          <textarea v-model="card.form.storeNotice" :placeholder="$t('campusConfig.phText')" />
        </view>
        <button class="save" :disabled="savingId === card.channelId" @tap="save(card)">
          {{ savingId === card.channelId ? $t('campusConfig.saving') : $t('campusConfig.save') }}
        </button>
      </block>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { campusStoreConfigs, campusUpdateStoreConfig, type CampusStoreConfig } from '../../apis/campus';
import { fenToYuan, yuanToFen } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

const ROUTES = [
  { code: 'R1', key: 'campusConfig.r1' },
  { code: 'R2', key: 'campusConfig.r2' },
  { code: 'R3', key: 'campusConfig.r3' },
  { code: 'R4', key: 'campusConfig.r4' },
  { code: 'R5', key: 'campusConfig.r5' },
] as const;

interface CardForm {
  routesEnabled: string[];
  deliveryMinutes: string;   // 输入态用字符串，提交时转 int
  minOrderYuan: string;      // 元输入态；提交转分
  deliveryFeeYuan: string;
  storeAddress: string;
  storePhone: string;
  storeNotice: string;
}
interface Card extends CampusStoreConfig { form: CardForm }

const locale = useLocaleStore();
const loading = ref(true);
const cards = ref<Card[]>([]);
const expandedId = ref<string>('');
const savingId = ref<string>('');

function toForm(c: CampusStoreConfig): CardForm {
  return {
    routesEnabled: [...c.routesEnabled],
    deliveryMinutes: c.deliveryMinutes != null ? String(c.deliveryMinutes) : '',
    minOrderYuan: c.minOrderAmount != null ? fenToYuan(c.minOrderAmount) : '',
    deliveryFeeYuan: c.deliveryFee != null ? fenToYuan(c.deliveryFee) : '',
    storeAddress: c.storeAddress ?? '',
    storePhone: c.storePhone ?? '',
    storeNotice: c.storeNotice ?? '',
  };
}

function routeCountLabel(routes: string[]): string {
  if (!routes.length) return locale.t('campusConfig.routesNone');
  return locale.t('campusConfig.routesCount').replace('{n}', String(routes.length));
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? '' : id;
}

function toggleRoute(card: Card, code: string) {
  const i = card.form.routesEnabled.indexOf(code);
  if (i >= 0) card.form.routesEnabled.splice(i, 1);
  else card.form.routesEnabled.push(code);
}

async function save(card: Card) {
  const f = card.form;
  const minutes = f.deliveryMinutes.trim() === '' ? null : Number(f.deliveryMinutes);
  if (minutes != null && (!Number.isInteger(minutes) || minutes < 0)) {
    uni.showToast({ title: locale.t('campusConfig.badMinutes'), icon: 'none' });
    return;
  }
  const minOrder = f.minOrderYuan.trim() === '' ? null : yuanToFen(f.minOrderYuan);
  const fee = f.deliveryFeeYuan.trim() === '' ? null : yuanToFen(f.deliveryFeeYuan);
  if (f.minOrderYuan.trim() !== '' && minOrder == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  if (f.deliveryFeeYuan.trim() !== '' && fee == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  savingId.value = card.channelId;
  try {
    const saved = await campusUpdateStoreConfig(card.channelId, {
      routesEnabled: [...f.routesEnabled],
      deliveryMinutes: minutes,
      minOrderAmount: minOrder,
      deliveryFee: fee,
      storeAddress: f.storeAddress.trim() || null,
      storePhone: f.storePhone.trim() || null,
      storeNotice: f.storeNotice.trim() || null,
    });
    Object.assign(card, saved, { form: toForm(saved) });
    uni.showToast({ title: locale.t('campusConfig.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  } finally {
    savingId.value = '';
  }
}

onMounted(async () => {
  try {
    const list = await campusStoreConfigs();
    cards.value = list.map((c) => ({ ...c, form: toForm(c) }));
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; margin-bottom: 24rpx; }
  .head { display: flex; align-items: center; padding: 28rpx 0;
    .head-l { flex: 1; display: flex; align-items: center; gap: 12rpx; min-width: 0;
      .name { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .token { font-size: 22rpx; color: $wa-muted; }
    }
    .count { font-size: 24rpx; color: $wa-muted; margin-right: 12rpx; }
    .chev { color: $wa-muted; font-size: 26rpx; }
  }
  .sec-t { font-size: 26rpx; color: $wa-ink; padding: 20rpx 0 8rpx; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; padding: 8rpx 0 16rpx;
    .chip { padding: 10rpx 26rpx; border: 1px solid $wa-rule; border-radius: 999rpx; font-size: 24rpx; color: $wa-muted; background: $wa-card; }
    .chip.on { background: $wa-accent; border-color: $wa-accent; color: #fff; }
  }
  .cell { display: flex; align-items: center; padding: 22rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 240rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.col { flex-direction: column; align-items: flex-start;
      .lbl { width: auto; margin-bottom: 16rpx; }
      textarea { width: 100%; height: 140rpx; font-size: 28rpx; }
    }
    &:last-of-type { border-bottom: none; }
  }
  .save { margin: 32rpx 0 24rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
```

- [ ] **Step 3: 注册页面与菜单**

`src/pages.json` 的 pages 数组在 `"pages/pickup/index"` 行前插入：

```json
    { "path": "pages/campus/config", "style": { "navigationBarTitleText": "拾光达配置" } },
```

`src/constants/menus.ts`：在 `menuGroups` 的 `menu.domain.fulfillment` 组 `menu.pickupRedeem` 行后加：

```ts
      { label: 'menu.campusConfig', url: '/pages/campus/config', tier: 2, perm: 'CampusConfig' },
```

（`perm: 'CampusConfig'` 与后端权限点同名，超管自然放行；无该权限的角色看不到入口。）

- [ ] **Step 4: 构建验证**

Run: `cd d:\zhao\vshop\web-admin; pnpm build:h5`
Expected: 构建成功无报错。

Run: `cd d:\zhao\vshop\web-admin; pnpm exec vitest run`
Expected: PASS（money.spec 等）。

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\vshop
git add web-admin/src/pages/campus/config.vue web-admin/src/pages.json web-admin/src/constants/menus.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git commit -m "feat(web-admin): Shiguangda campus delivery config page"
```

---

### Task 8: waimai store-display 新文案 + deliveryTag + timeline（TDD）

**Files:**
- Modify: `d:\zhao\waimai\src\utils\store-display.ts`
- Test: `d:\zhao\waimai\tests\store-display.spec.ts`
- Modify: `d:\zhao\waimai\src\utils\timeline.ts`
- Test: `d:\zhao\waimai\tests\timeline.spec.ts`

- [ ] **Step 1: 先改测试（写失败测试）**

`tests/store-display.spec.ts`：全局把旧文案替换为新文案——
`'商家自送 + 校内骑手接力'` → `'商家自送 · 传信者接力'`；`'档口直送 · 校内骑手上楼'` → `'档口直送 · 传信者上楼'`；`'快递到校代取'` → `'快递到校 · 接力代取'`。
文件末尾追加 deliveryTag 用例：

```ts
import { routeText, routeDetail, deliveryTag } from '../src/utils/store-display';

describe('deliveryTag（首页配送 tag：时长前缀）', () => {
    it('deliveryMinutes 有值：前缀「N分钟 ·」', () => {
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: ['R1', 'R3'] }))
            .toBe('35分钟 · 商家自送 · 传信者接力 等2种方式');
    });
    it('deliveryMinutes 为 null/undefined/0：不加前缀', () => {
        expect(deliveryTag({ deliveryMinutes: null, routesEnabled: ['R1'] })).toBe('商家自送 · 传信者接力');
        expect(deliveryTag({ routesEnabled: ['R1'] })).toBe('商家自送 · 传信者接力');
        expect(deliveryTag({ deliveryMinutes: 0, routesEnabled: ['R1'] })).toBe('商家自送 · 传信者接力');
    });
    it('无可用路线返回 null（调用方回退 routeText 展示「暂未开通配送」）', () => {
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: [] })).toBeNull();
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: null })).toBeNull();
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: ['R9'] })).toBeNull();
    });
});
```

`tests/timeline.spec.ts` 第 40 行：`expect(tl[1].label).toBe('骑手取餐')` → `expect(tl[1].label).toBe('传信者取餐')`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: FAIL（store-display 文案不匹配 + `deliveryTag` 未导出；timeline 断言失败）。

- [ ] **Step 3: 实现**

`src/utils/store-display.ts`：
① 注释块第 14 行路线说明同步改为：`R1=商家自送至校门口+传信者接力；R2=快递到校·接力代取；R3=档口直送·传信者上楼；R4=到店自取；R5=跑腿代取。`（注释里是业务语义描述，随用户文案更新）
② ROUTE_LABELS 替换为：

```ts
const ROUTE_LABELS: Record<string, string> = {
    R1: '商家自送 · 传信者接力',
    R2: '快递到校 · 接力代取',
    R3: '档口直送 · 传信者上楼',
    R4: '到店自取',
    R5: '跑腿代取',
};
```

③ 文件末尾追加：

```ts
/** 店铺卡配送 tag：deliveryMinutes 有值时前缀「N分钟 ·」；无可用路线返回 null（调用方回退 routeText） */
export function deliveryTag(store: { deliveryMinutes?: number | null; routesEnabled: string[] | null | undefined }): string | null {
    const base = routeText(store.routesEnabled);
    if (base === '暂未开通配送') return null;
    const m = store.deliveryMinutes;
    return m && m > 0 ? `${m}分钟 · ${base}` : base;
}
```

`src/utils/timeline.ts` 第 34 行：`label: '骑手取餐'` → `label: '传信者取餐'`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS（store-display + timeline 全绿）。

- [ ] **Step 5: Commit**

```powershell
cd d:\zhao\waimai
git add src/utils/store-display.ts tests/store-display.spec.ts src/utils/timeline.ts tests/timeline.spec.ts
git commit -m "feat(waimai): brand copy for routes + deliveryTag helper"
```

---

### Task 9: waimai 品牌文案 12 处落地（spec 〇节对照表）

**Files:**
- Modify: `d:\zhao\waimai\src\pages.json`、`src\manifest.json`、`src\pages\login\index.vue`、`src\pages\home\index.vue`、`src\pages\shop\menu.vue`、`src\pkg-order\pages\checkout.vue`、`src\pkg-order\pages\order-detail.vue`、`src\pkg-rider\pages\rider-join.vue`、`src\pages\profile\index.vue`

逐处精确替换（旧 → 新）：

- [ ] **Step 1: pages.json**
  - 第 3 行 `"navigationBarTitleText": "校园外卖"` → `"navigationBarTitleText": "拾光达"`
  - 第 22 行 `"navigationBarTitleText": "骑手入驻"` → `"navigationBarTitleText": "传信者入驻"`
  - 第 42 行 `"navigationBarTitleText": "校园外卖"` → `"navigationBarTitleText": "拾光达"`

- [ ] **Step 2: manifest.json**
  - 第 4 行 `"description": "校园外卖学生端"` → `"description": "拾光达学生端"`
  - 第 54 行 `"title": "校园外卖"` → `"title": "拾光达"`

- [ ] **Step 3: login/index.vue** — 第 5 行 `<text class="login-logo-text">校园外卖</text>` → `<text class="login-logo-text">拾光达</text>`

- [ ] **Step 4: home/index.vue**
  - 第 21 行 `<text class="qtxt">骑手加入</text>` → `<text class="qtxt">传信者加入</text>`
  - 第 81 行 `const NOTICE_TEXT = '本平台为校内配送：范围覆盖校内宿舍楼与教学楼，营业时间 10:00–22:00，由商家与校内骑手接力送达。';` → `const NOTICE_TEXT = '本平台为拾光达校内配送：范围覆盖校内宿舍楼与教学楼，营业时间 10:00–22:00，由商家与拾光传信者接力送达。';`

- [ ] **Step 5: menu.vue**
  - 第 70 行 `<text class="tag">校内配送</text>` → `<text class="tag">拾光达配送</text>`
  - 第 71 行 `<text class="tag">校内骑手接力送达</text>` → `<text class="tag">拾光传信者接力送达</text>`
  - 第 114 行 `const routesText = ref('校内骑手配送');` → `const routesText = ref('拾光传信者配送');`

- [ ] **Step 6: checkout.vue**
  - 第 279 行 `if (routeChoice.value === 'R1') return '商家送至校门口，校内骑手接力送达（R1）';` → `... '商家送至校门口，拾光传信者接力送达（R1）';`
  - 第 280 行 `return '档口直送，校内骑手上楼（R3）';` → `return '档口直送，拾光传信者上楼（R3）';`
  - 第 327 行 `[{ key: 'campus', label: '校园配送' }]` → `[{ key: 'campus', label: '拾光达配送' }]`

- [ ] **Step 7: order-detail.vue**
  - 第 34 行 `· 接力骑手 · 第二程` → `· 接力传信者 · 第二程`
  - 第 127 行 `'暂无骑手接单，平台人工介入处理中'` → `'暂无传信者接单，平台人工介入处理中'`
  - 第 129 行 `'等待骑手接单…'` → `'等待传信者接单…'`

- [ ] **Step 8: rider-join.vue**
  - 第 5 行 `您已是认证骑手，可以开始接单啦` → `您已是认证传信者，可以开始接单啦`
  - 第 22 行 `审核通过后即可在「我的-骑手中心」接单赚跑腿费` → `审核通过后即可在「我的-传信者中心」接单赚跑腿费`

- [ ] **Step 9: profile/index.vue** — 第 12 行 `<text>成为骑手</text>` → `<text>成为传信者</text>`

- [ ] **Step 10: 验证无漏网**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS（Task 8 已改测试，此处确认无回归）。

- [ ] **Step 11: Commit**

```powershell
cd d:\zhao\waimai
git add src/pages.json src/manifest.json src/pages/login/index.vue src/pages/home/index.vue src/pages/shop/menu.vue src/pkg-order/pages/checkout.vue src/pkg-order/pages/order-detail.vue src/pkg-rider/pages/rider-join.vue src/pages/profile/index.vue
git commit -m "feat(waimai): unify brand copy to Shiguangda / messenger"
```

---

### Task 10: waimai 消费侧字段化（时长 tag / 商家 Tab / checkout 费用+软校验）

**Files:**
- Modify: `d:\zhao\waimai\src\api\queries\waimai.ts`
- Modify: `d:\zhao\waimai\src\pages\home\index.vue`
- Modify: `d:\zhao\waimai\src\pages\shop\menu.vue`
- Modify: `d:\zhao\waimai\src\pkg-order\pages\checkout.vue`

- [ ] **Step 1: 查询扩展 6 字段**

`src/api/queries/waimai.ts` 第 8 行改为：

```ts
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice
```

- [ ] **Step 2: 首页店铺卡时长 tag**

`src/pages/home/index.vue`：
① 第 74 行 import 改为 `import { storeDisplayName, routeText, deliveryTag } from '../../utils/store-display';`
② 第 57 行 `<text class="tag tag-route">{{ routeText(s.routesEnabled) }}</text>` 改为：

```html
                                <text class="tag tag-route">{{ deliveryTag(s) || routeText(s.routesEnabled) }}</text>
```

（null 兜底：无配置行/未配置时长时展示与现状完全一致。）

- [ ] **Step 3: 店铺页商家 Tab 地址/电话/公告 + checkout 传参**

`src/pages/shop/menu.vue`：
① script 区 import 补：`import { fetchStoreList } from '../../api/queries/waimai';`（fetchProductList 已从同文件 import，可合并进该行）。
② state 区（`promoText` ref 附近）加：

```ts
const storeInfo = ref<any>(null);
```

③ `onLoad` 内 `promoText.value = ...` 赋值之后、`uni.setNavigationBarTitle` 之前插入（失败静默，null 兜底）：

```ts
    // 店铺配置（地址/电话/公告/时长）：waimaiStoreList 按渠道 token 找本店；无配置行 → null 走页面兜底
    fetchStoreList().then((list: any[]) => {
        storeInfo.value = list.find((s: any) => s.channelToken === shopToken.value) ?? null;
    }).catch(() => { storeInfo.value = null; });
```

④ 商家 Tab 模板（`v-show="tab === 'merchant'"` 的 mcard 内）：
在「配送范围」mrow（第 62 行）之后加：

```html
                <view class="mrow" v-if="storeInfo?.storeAddress"><text class="mico">🏠</text><text class="mlab">店铺地址：</text><text class="mval">{{ storeInfo.storeAddress }}</text></view>
                <view class="mrow" v-if="storeInfo?.storePhone"><text class="mico">📞</text><text class="mlab" @tap="callStore">联系电话：</text><text class="mval" @tap="callStore">{{ storeInfo.storePhone }}</text></view>
```

公告卡（第 64-66 行 `v-if="promoText"` 的 mcard）改为：

```html
            <view class="mcard" v-if="promoText || storeInfo?.storeNotice">
                <view class="mrow" v-if="storeInfo?.storeNotice"><text class="mico">📣</text><text class="mlab">店铺公告：</text><text class="mval">{{ storeInfo.storeNotice }}</text></view>
                <view class="mrow" v-if="promoText"><text class="mico">📢</text><text class="mlab">店铺活动：</text><text class="mval">{{ promoText }}</text></view>
            </view>
```

⑤ script 末尾（goCheckout 之前）加：

```ts
function callStore() {
    const p = storeInfo.value?.storePhone;
    if (p) uni.makePhoneCall({ phoneNumber: p });
}
```

⑥ `goCheckout` 的 url 追加金额参数（分）：

```ts
function goCheckout() {
    if (!cartCount.value) return;
    const routes = encodeURIComponent(shopRoutes.value);
    const mo = storeInfo.value?.minOrderAmount ?? '';
    const fee = storeInfo.value?.deliveryFee ?? '';
    uni.navigateTo({ url: `/pkg-order/pages/checkout?routes=${routes}&minOrder=${mo}&dfee=${fee}` });
}
```

- [ ] **Step 4: checkout 费用展示 + 起送价软校验**

`src/pkg-order/pages/checkout.vue`：
① state 区（`zonesLoading` 附近）加：

```ts
const minOrderFen = ref<number | null>(null);   // 起送价（分，URL 透传；null=未配置）
const deliveryFeeFen = ref<number | null>(null); // 配送费（分，仅展示）
```

② `onLoad`（第 691 行起）追加解析：

```ts
    minOrderFen.value = q?.minOrder ? Number(q.minOrder) : null;
    deliveryFeeFen.value = q?.dfee ? Number(q.dfee) : null;
```

③ 费用区（第 205-209 summary 块）在「商品总额」行后、「运费」行前插入：

```html
      <view class="summary-row" v-if="activeTab === 'campus' && deliveryFeeFen != null"><text>配送费</text><text>¥{{ (deliveryFeeFen / 100).toFixed(2) }}</text></view>
      <view class="summary-row" v-if="activeTab === 'campus' && minOrderFen != null"><text>起送价</text><text>满 ¥{{ (minOrderFen / 100).toFixed(2) }} 起送</text></view>
```

④ `submitOrder`（第 672 行）函数体最前面（`if (submitting.value) return;` 之后、`submitting.value = true;` 之前）加软校验（提示不阻断，spec §3.2）：

```ts
    // 起送价软校验：未达标仅 toast 提示，不阻断（硬校验二期后端化）
    if (activeTab.value === 'campus' && minOrderFen.value != null
        && (cart.order?.subTotalWithTax || 0) < minOrderFen.value) {
        ui.showToast(`商品未满起送价 ¥${(minOrderFen.value / 100).toFixed(2)}，请确认后再下单`);
    }
```

- [ ] **Step 5: 回归 + 构建**

Run: `cd d:\zhao\waimai; pnpm exec vitest run`
Expected: PASS。

Run: `cd d:\zhao\waimai; pnpm build:h5`
Expected: 构建成功。

- [ ] **Step 6: Commit**

```powershell
cd d:\zhao\waimai
git add src/api/queries/waimai.ts src/pages/home/index.vue src/pages/shop/menu.vue src/pkg-order/pages/checkout.vue
git commit -m "feat(waimai): consume store config fields (minutes tag, info, fees, soft min-order)"
```

---

### Task 11: waimai 手机视口截图验收（本地）

**Files:** 无代码改动；产物为截图（目检用）。

- [ ] **Step 1: 起本地 H5 dev**

Run（后台）: `cd d:\zhao\waimai; pnpm dev:h5`
Expected: 输出本地访问地址（默认 http://localhost:5173 附近）。

- [ ] **Step 2: Playwright 截图（390×844 dpr=2）**

复用既有脚本（按其内部目标端口对齐 dev 地址）：

```powershell
cd d:\zhao\waimai
python scripts/_shot_home.py
python scripts/_shot_shop.py
```

Expected: 生成首页/店铺页截图。目检要点：
- 首页 nav/quick 文案 = 拾光达 / 传信者加入；店铺卡 tag 有无「35分钟 · …」前缀（需先在后台给该店配 deliveryMinutes）
- 店铺页服务 tag = 拾光达配送 / 拾光传信者接力送达；商家 Tab 地址/电话/公告行（配置后）
- 若后台尚未配置数据，页面应与现状一致（null 兜底零破坏）——两种状态都要看
- 明暗两态（首页 🌙 切换）各一张

- [ ] **Step 3: checkout 截图（可选，如脚本缺失则手写临时 Playwright 脚本）**

进店加购 → checkout，验证「配送费/起送价」两行与软校验 toast。截图尺寸同上。

---

### Task 12: 全量回归 + 三仓收口（提交 → 推送 → 部署）

- [ ] **Step 1: 三仓全量单测**

```powershell
cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run
cd d:\zhao\vshop\web-admin; pnpm exec vitest run
cd d:\zhao\waimai; pnpm exec vitest run
```
Expected: 三处全 PASS。

- [ ] **Step 2: 推送**

```powershell
cd d:\zhao\vendure; git push
cd d:\zhao\vshop; git push
cd d:\zhao\waimai; git push
```

- [ ] **Step 3: 部署 vendure 后端（campus-delivery-plugin）**

沿用 campus-delivery-plugin 上次上线同款通道（本地构建产物 → 服务器解压 → `pm2 restart`；**严禁服务器构建**）。部署后一锤定音校验：

- admin-api introspection：`campusStoreConfigs` / `campusUpdateStoreConfig` 存在
- shop-api：`waimaiStoreList { deliveryMinutes }` 字段可查
- 若通道细节不明（服务器路径/应用名），执行本任务时先向用户确认上次上线命令，勿自行猜测

- [ ] **Step 4: 部署 web-admin**

```powershell
cd d:\zhao\vshop\web-admin; pnpm build:h5; node scripts/deploy.mjs
```
Expected: 产物上传成功。线上验证：登录 e.joho.cn/guanli → 工作台「履约」域出现「拾光达配置」→ 列表出店铺卡 → 保存一店配置成功 toast。

- [ ] **Step 5: 部署 waimai**

```powershell
cd d:\zhao\waimai; pnpm build:h5; node .secrets/deploy-waimai.mjs
```
Expected: 静态目录替换生效（H5 静态站无需 nginx reload）。线上手机视口（390×844 dpr=2）截图验收：首页文案/店铺页/checkout，与 Task 11 同要点。

- [ ] **Step 6: 线上配置冒烟（后台↔C 端闭环）**

web-admin 给测试店铺配 deliveryMinutes=35、minOrderAmount=15 元、deliveryFee=2 元、storeAddress/Phone/Notice、勾选 R1/R3 → waimai 首页店铺卡出现「35分钟 · …」、商家 Tab 出地址/电话/公告、checkout 出「配送费 ¥2.00 / 满 ¥15.00 起送」。全 null 的其他店铺现状不变。

---

## Self-Review 记录

1. **Spec 覆盖**：§1.1 实体 6 字段 → Task 1；§1.2 admin API+白名单 → Task 3/4；§1.3 shop 透出 → Task 2/4；§1.4 四条测试要求 → Task 2/3（幂等/白名单/字段两态）+ 无权限拒绝由 `@Allow` 注解保证（与既有 resolver 一致，无独立用例，属既有模式）；§2 web-admin → Task 5-7；§3.1 → Task 8/10；§3.2 四处消费 → Task 10；§3.3 测试/截图 → Task 8/11；§〇 12 处文案 → Task 8/9 + web-admin 命名（Task 7「拾光达配置」）。
2. **占位符扫描**：无 TBD/TODO；Task 12 Step 3 的部署通道按既有经验引用并在不明确时显式问用户（有意为之，非占位）。
3. **类型一致性**：`CampusStoreConfigWithChannel`（service 接口 = admin GraphQL type = web-admin `CampusStoreConfig`）字段名逐一比对一致；`yuanToFen/fenToYuan` 签名与页面用法一致；`deliveryTag` 入参 `{deliveryMinutes, routesEnabled}` 与 waimaiStoreList 输出对齐；分↔元边界（web-admin 页面层转换 / waimai 直出分）与 spec 一致。
