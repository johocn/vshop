# 配送/支付档案「档案内按方式配置」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将配送/支付档案的自提点/分期配置从「档案级」下沉为「档案×方式」级，并新增「租户默认档案」回退能力。

**Architecture:** 在 cjk-plugin 新增 `ShippingProfileMethod` / `PaymentProfileMethod` 两个 join 载荷实体（存每个方式在该档案下的 `options`），`ShippingProfile.pickupLocations` 与 `PaymentProfile.installmentOptions` 不再作为结算判定来源；档案新增 `isTenantDefault` 标记，Shop API 按「变体绑档案→默认档案→全局∪租户全部」回退解析。web-admin 档案编辑页改为逐方式条目编辑。

**Tech Stack:** vendure cjk-plugin（TypeORM/NestJS/TypeGraphQL）、vshop web-admin（uni-app Vue3 + graphql-request）。

**铁律注意：**
- cjk-plugin 构建产物是 `lib/`（不是 `dist/`），本地 `pnpm run build` 后必须 `Select-String packages/cjk-plugin/lib/src/... -Pattern "关键词"` 验证，再 commit `lib/`，服务器才生效。**绝不在服务器构建。**
- adminSchema/shopSchema 的自定义类型改动必须重启 dev server 才暴露 `Unknown type` 错误。
- 本计划同时改 vendure 与 vshop 两个仓库，提交时按仓库分别 `git add` + `git commit`。

---

## 文件结构总览

### 后端（vendure 仓库 `d:\zhao\vendure`）
- **Create** `packages/cjk-plugin/src/shipping/shipping-profile-method.entity.ts` — 档案×配送方式 join 载荷实体
- **Create** `packages/cjk-plugin/src/payment/payment-profile-method.entity.ts` — 档案×支付方式 join 载荷实体
- **Modify** `packages/cjk-plugin/src/shipping/shipping-profile.entity.ts` — 加 `isTenantDefault`
- **Modify** `packages/cjk-plugin/src/payment/payment-profile.entity.ts` — 加 `isTenantDefault`
- **Modify** `packages/cjk-plugin/src/shipping/shipping-profile.service.ts` — join 读写、默认档案唯一、默认回退查询
- **Modify** `packages/cjk-plugin/src/payment/payment-profile.service.ts` — 同上
- **Modify** `packages/cjk-plugin/src/shipping/shipping-profile-admin.resolver.ts` — 暴露 per-method config + setTenantDefault
- **Modify** `packages/cjk-plugin/src/payment/payment-profile-admin.resolver.ts` — 同上
- **Modify** `packages/cjk-plugin/src/shipping/shipping-profile-shop.resolver.ts` — 按档案×方式返回 + 默认回退
- **Modify** `packages/cjk-plugin/src/payment/payment-profile-shop.resolver.ts` — 同上
- **Modify** `packages/cjk-plugin/src/plugin.ts` — 注册实体、暴露 schema

### 前端（vshop 仓库 `d:\zhao\vshop`）
- **Create** `web-admin/src/apis/pickup-location.ts` — 封装 fetch/create 自提点
- **Modify** `web-admin/src/apis/shipping-profile.ts` — API 加 `modeConfig` / `isTenantDefault`
- **Modify** `web-admin/src/apis/payment-profile.ts` — 同上
- **Modify** `web-admin/src/pages/shipping/profile/index.vue` — 逐方式条目编辑 + 自提点选择（内联新增）+ 设为默认
- **Modify** `web-admin/src/pages/payment/profile/index.vue` — 逐方式条目编辑 + 设为默认

---

# 后端任务（vendure 仓库）

## Task 1: 新增 `ShippingProfileMethod` 实体

**Files:**
- Create: `packages/cjk-plugin/src/shipping/shipping-profile-method.entity.ts`

- [ ] **Step 1: 创建实体文件**

```ts
// packages/cjk-plugin/src/shipping/shipping-profile-method.entity.ts
import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/**
 * 配送档案 × 配送方式 的 join 载荷实体。
 * 存放某一配送方式在某档案下的工作模式（options）。
 * - mode='pickup' → options.pickupLocationIds = 该方式在该档案下允许的自提点集合
 * - mode='mail'   → 范围/运费公式仍留在 Vendure ShippingMethod 实例，options 可选
 */
@Entity()
export class ShippingProfileMethod extends VendureEntity {
    constructor(input?: DeepPartial<ShippingProfileMethod>) {
        super(input);
    }

    @Column() profileId: string;

    @Column() shippingMethodId: string;

    @Column({ default: 'pickup' }) mode: string;

    @Column({ type: 'simple-json', nullable: true })
    options: Record<string, any> | null;
}
```

- [ ] **Step 2: 校验可编译**

Run: `cd D:\zhao\vendure && pnpm --filter @cjk/plugin run build`
Expected: 构建通过（若报错说明实体语法问题）。

- [ ] **Step 3: Commit（vendure）**

```bash
git add packages/cjk-plugin/src/shipping/shipping-profile-method.entity.ts packages/cjk-plugin/lib
git commit -m "feat(cjk): 新增 ShippingProfileMethod join 载荷实体"
```

---

## Task 2: 新增 `PaymentProfileMethod` 实体

**Files:**
- Create: `packages/cjk-plugin/src/payment/payment-profile-method.entity.ts`

- [ ] **Step 1: 创建实体文件**

```ts
// packages/cjk-plugin/src/payment/payment-profile-method.entity.ts
import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/**
 * 支付档案 × 支付方式 的 join 载荷实体。
 * 存放某一支付方式在某档案下的工作模式（options），如分期：
 * options = { alipay: { huabei: { periods: [...] } } }
 */
@Entity()
export class PaymentProfileMethod extends VendureEntity {
    constructor(input?: DeepPartial<PaymentProfileMethod>) {
        super(input);
    }

    @Column() profileId: string;

    @Column() paymentMethodId: string;

    @Column({ default: 'installment' }) mode: string;

    @Column({ type: 'simple-json', nullable: true })
    options: Record<string, any> | null;
}
```

- [ ] **Step 2: 校验可编译 + Commit（vendure）**

Run: `cd D:\zhao\vendure && pnpm --filter @cjk/plugin run build`
Commit: `feat(cjk): 新增 PaymentProfileMethod join 载荷实体`

---

## Task 3: 档案实体加 `isTenantDefault` 字段

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile.entity.ts`
- Modify: `packages/cjk-plugin/src/payment/payment-profile.entity.ts`

- [ ] **Step 1: ShippingProfile 加字段**

`shipping-profile.entity.ts` 在 `freeShippingThreshold` 字段后追加：

```ts
@Column({ default: false })
isTenantDefault: boolean;
```

- [ ] **Step 2: PaymentProfile 加字段**

`payment-profile.entity.ts` 在 `installmentOptions` 字段后追加：

```ts
@Column({ default: false })
isTenantDefault: boolean;
```

- [ ] **Step 3: 构建 + Commit（vendure）**

Run: `cd D:\zhao\vendure && pnpm --filter @cjk/plugin run build`
Commit: `feat(cjk): 档案实体新增 isTenantDefault 默认标记`

---

## Task 4: 在 plugin.ts 注册实体与 schema

**Files:**
- Modify: `packages/cjk-plugin/src/plugin.ts`

- [ ] **Step 1: 导入并注册实体**

顶部 import 追加：

```ts
import { ShippingProfileMethod } from './shipping/shipping-profile-method.entity';
import { PaymentProfileMethod } from './payment/payment-profile-method.entity';
```

`entitys` 数组改为：

```ts
entities: [PickupLocation, EmployeeCustomer, ShippingTemplate, ShippingProfile, PaymentProfile, ShippingProfileMethod, PaymentProfileMethod],
```

- [ ] **Step 2: admin schema 暴露 per-method config 与默认标记**

在 admin schema 的 `type ShippingProfile implements Node` 段落（约 L382-391）内追加字段：

```graphql
isTenantDefault: Boolean!
methodConfigs: [ShippingProfileMethodConfig!]!
```

并新增两个类型定义（放在 ShippingProfile 类型之后）：

```graphql
type ShippingProfileMethodConfig {
    shippingMethodId: ID!
    mode: String!
    options: JSON
}

input ShippingProfileMethodConfigInput {
    shippingMethodId: ID!
    mode: String!
    options: JSON
}
```

在 `type ShippingProfile` 下新增 `type PaymentProfileMethodConfig` 同构：

```graphql
type PaymentProfileMethodConfig {
    paymentMethodId: ID!
    mode: String!
    options: JSON
}

input PaymentProfileMethodConfigInput {
    paymentMethodId: ID!
    mode: String!
    options: JSON
}
```

`CreateShippingProfileInput`（L398）与 `UpdateShippingProfileInput`（L408）各追加：

```graphql
methodConfigs: [ShippingProfileMethodConfigInput!]
```

`CreatePaymentProfileInput`（L454）与 `UpdatePaymentProfileInput`（L463）各追加：

```graphql
methodConfigs: [PaymentProfileMethodConfigInput!]
```

新增 mutation（追加到对应 extend type Mutation 内）：

```graphql
setTenantDefaultShippingProfile(id: ID!): Boolean!
setTenantDefaultPaymentProfile(id: ID!): Boolean!
```

- [ ] **Step 3: shop schema 增加默认回退查询**

`shopApiExtensions.schema` 的 Query 段（L608-616）追加：

```graphql
resolveShippingMethodsForChannel: [ShippingMethod!]!
resolvePaymentMethodsForChannel: [PaymentMethod!]!
```

及类型：

```graphql
type EligibleShippingMethod {
    id: ID!
    code: String!
    mode: String
    pickupLocationIds: [ID!]
    name: String
}
```

- [ ] **Step 4: build + 重启 dev server 验证 schema**

Run: `cd D:\zhao\vendure && pnpm --filter @cjk/plugin run build`
Expected: 构建通过。
Start dev server：`cd D:\zhao\vendure && bun run dev`（或按仓库既有方式）。Expected: 启动无 `Unknown type "..."` 报错。

- [ ] **Step 5: Commit（vendure）**

Commit 含 `plugin.ts`、lib 产物：`feat(cjk): 注册档案-方式裁剪表实体与 schema（default 回退查询）`

---

## Task 5: 迁移并改造 `ShippingProfileService` 的 join 读写

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile.service.ts`
- Create: `packages/cjk-plugin/src/shipping/shipping-profile-migration.service.ts`

- [ ] **Step 1: 新建迁移服务（Legacy → join）**

```ts
// packages/cjk-plugin/src/shipping/shipping-profile-migration.service.ts
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ShippingProfile } from './shipping-profile.entity';
import { ShippingProfileMethod } from './shipping-profile-method.entity';

@Injectable()
export class ShippingProfileMigrationService {
    constructor(private connection: TransactionalConnection) {}

    /** 将档案级 pickupLocations 迁移到对应自提方式的 options.pickupLocationIds */
    async migrateLegacyPickupLocations(ctx: RequestContext): Promise<void> {
        const repo = this.connection.getRepository(ctx, ShippingProfile);
        const jmRepo = this.connection.getRepository(ctx, ShippingProfileMethod);
        const profiles = await repo.find({ relations: ['shippingMethods', 'pickupLocations'] });
        for (const p of profiles) {
            if (!p.pickupLocations?.length) continue;
            const pickupMethod = p.shippingMethods?.find(
                m => /pickup|store/i.test((m as any)?.code ?? ''),
            );
            if (!pickupMethod) continue;
            const existing = await jmRepo.findOne({
                where: { profileId: String(p.id), shippingMethodId: String(pickupMethod.id) },
            });
            const options = { pickupLocationIds: p.pickupLocations.map(l => String(l.id)) };
            if (existing) {
                existing.options = options;
                await jmRepo.save(existing);
            } else {
                await jmRepo.save(
                    new ShippingProfileMethod({
                        profileId: String(p.id),
                        shippingMethodId: String(pickupMethod.id),
                        mode: 'pickup',
                        options,
                    } as any),
                );
            }
        }
    }
}
```

> 说明：仅当 profile 仍含历史 `pickupLocations` 且其配送方法 code 含 pickup/store 时才写入 join。已写入的用 `options` 覆盖，不重复。

- [ ] **Step 2: 在 `ShippingProfileService.create` 中写 join**

`create`（L56-78）在保存 profile 后追加（在 `return` 前）：

```ts
if (input.methodConfigs?.length) {
    await this.replaceMethodConfigs(ctx, profile.id, input.methodConfigs);
}
```

新增私有方法（追加到类内）：

```ts
private async replaceMethodConfigs(
    ctx: RequestContext,
    profileId: ID,
    configs: Array<{ shippingMethodId: ID; mode?: string; options?: any }>,
): Promise<void> {
    const jmRepo = this.connection.getRepository(ctx, ShippingProfileMethod);
    await jmRepo.delete({ profileId: String(profileId) as any });
    for (const cfg of configs) {
        await jmRepo.save(new ShippingProfileMethod({
            profileId: String(profileId),
            shippingMethodId: String(cfg.shippingMethodId),
            mode: cfg.mode ?? 'mail',
            options: cfg.options ?? null,
        } as any));
    }
}
```

- [ ] **Step 3: `update` 时同步 join**

`update`（L80-106）在 `profile.shippingMethods` 更新后追加：

```ts
if (input.methodConfigs !== undefined) {
    await this.replaceMethodConfigs(ctx, profile.id, input.methodConfigs);
}
```

- [ ] **Step 4: findOne/findByCode 附加 methodConfigs**

`findOne`（L42-47）与 `findByCode`（L49-54）改为加载 join：

```ts
const result = await this.connection
    .getRepository(ctx, ShippingProfile)
    .findOne({ where: { id: id as any }, relations: ['shippingMethods', 'pickupLocations'] });
if (result) {
    const methodConfigs = await this.connection
        .getRepository(ctx, ShippingProfileMethod)
        .find({ where: { profileId: String(result.id) as any } });
    (result as any).methodConfigs = methodConfigs;
}
return result ?? undefined;
```

- [ ] **Step 5: delete 时清理 join**

`delete`（L108-121）在 `repo.remove(profile)` 前追加：

```ts
const jmRepo = this.connection.getRepository(ctx, ShippingProfileMethod);
await jmRepo.delete({ profileId: String(id) as any });
```

- [ ] **Step 6: 新增「默认档案」相关方法**

追加方法：

```ts
async setTenantDefault(ctx: RequestContext, id: ID): Promise<void> {
    const repo = this.connection.getRepository(ctx, ShippingProfile);
    const profile = await repo.findOne({ where: { id: id as any } });
    if (!profile) throw new UserInputError('档案不存在');
    if (profile.isGlobal) throw new UserInputError('全局档案不能设为租户默认');
    // 清空同租户默认
    await this.connection
        .getRepository(ctx, ShippingProfile)
        .createQueryBuilder()
        .update()
        .set({ isTenantDefault: false })
        .where('"ownerChannelId" = :channelId AND "isGlobal" = false', { channelId: ctx.channelId })
        .execute();
    profile.isTenantDefault = true;
    await repo.save(profile);
}

async getTenantDefault(ctx: RequestContext): Promise<ShippingProfile | undefined> {
    const profile = await this.connection
        .getRepository(ctx, ShippingProfile)
        .findOne({ where: { isGlobal: false, ownerChannelId: ctx.channelId, isTenantDefault: true } });
    return profile ?? undefined;
}
```

- [ ] **Step 7: 新增「按 profile 取方式 config」查询方法与默认回退**

追加：

```ts
async getMethodConfigsByProfile(
    ctx: RequestContext,
    profileId: ID,
): Promise<ShippingProfileMethod[]> {
    return this.connection
        .getRepository(ctx, ShippingProfileMethod)
        .find({ where: { profileId: String(profileId) as any } });
}
```

- [ ] **Step 8: build + 验证 + Commit（vendure）**

Run: `cd D:\zhao\vendure && pnpm --filter @cjk/plugin run build`
Verify: `Select-String packages/cjk-plugin/lib/src/shipping/shipping-profile.service.js -Pattern "setTenantDefault|replaceMethodConfigs"`
Expected: 两处均命中。
Commit: `feat(cjk): ShippingProfile 支持档案-方式 config 与默认档案`

---

## Task 6: 迁移并改造 `PaymentProfileService` 的 join 读写

**Files:**
- Modify: `packages/cjk-plugin/src/payment/payment-profile.service.ts`
- Create: `packages/cjk-plugin/src/payment/payment-profile-migration.service.ts`

- [ ] **Step 1: 新建迁移服务**

```ts
// packages/cjk-plugin/src/payment/payment-profile-migration.service.ts
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PaymentProfile } from './payment-profile.entity';
import { PaymentProfileMethod } from './payment-profile-method.entity';

@Injectable()
export class PaymentProfileMigrationService {
    constructor(private connection: TransactionalConnection) {}

    /** 将档案级 installmentOptions 迁移到对应支付方式的 options */
    async migrateLegacyInstallmentOptions(ctx: RequestContext): Promise<void> {
        const repo = this.connection.getRepository(ctx, PaymentProfile);
        const jmRepo = this.connection.getRepository(ctx, PaymentProfileMethod);
        const profiles = await repo.find({ relations: ['paymentMethods'] });
        for (const p of profiles) {
            if (!p.installmentOptions) continue;
            for (const pm of p.paymentMethods ?? []) {
                const existing = await jmRepo.findOne({
                    where: { profileId: String(p.id), paymentMethodId: String(pm.id) },
                });
                const opts = { ...p.installmentOptions };
                if (existing) {
                    existing.options = opts;
                    await jmRepo.save(existing);
                } else {
                    await jmRepo.save(new PaymentProfileMethod({
                        profileId: String(p.id),
                        paymentMethodId: String(pm.id),
                        mode: 'installment',
                        options: opts,
                    } as any));
                }
            }
        }
    }
}
```

- [ ] **Step 2: create/update 写 join**

`PaymentProfileService.create`（L54-67）保存后追加写 join 逻辑（私有方法 `replaceMethodConfigs`，结构同 Task 5 Step 2，基于 `PaymentProfileMethod`）。`update`（L69-88）在 `paymentMethodIds` 更新后，当 `input.methodConfigs !== undefined` 时调用。

- [ ] **Step 3: findOne/findByCode 附加 methodConfigs、delete 清理 join**

参照 Task 5 Step 4/5，改用 `PaymentProfileMethod` 与 `paymentMethodId`。

- [ ] **Step 4: 新增 setTenantDefault / getTenantDefault / getMethodConfigsByProfile**

参照 Task 5 Step 6/7，查询表改为 `PaymentProfile`，字段 `paymentMethodId`。

- [ ] **Step 5: build + 验证 + Commit（vendure）**

Verify: `Select-String packages/cjk-plugin/lib/src/payment/payment-profile.service.js -Pattern "setTenantDefault|migrateLegacyInstallmentOptions"`
Commit: `feat(cjk): PaymentProfile 支持档案-方式 config 与默认档案`

---

## Task 7: 改造 Shop API resolvers（结算判定）

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile-shop.resolver.ts`
- Modify: `packages/cjk-plugin/src/payment/payment-profile-shop.resolver.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts`（onApplicationBootstrap 执行迁移）

- [ ] **Step 1: plugin bootstrap 执行迁移**

`plugin.ts` 的 `onApplicationBootstrap` 中，`profiles.enabled !== false` 分支开头追加：

```ts
await new Injector(this.moduleRef).get(ShippingProfileMigrationServiceKey).migrateLegacyPickupLocations(
    new (require('@vendure/core')).RequestContext(/* 由 setup 创建或取现有 ctx */),
);
```

> 若获取 context 有难度，改为：迁移服务接收 `channelService`/从 `injector` 构造一个系统级 `RequestContext`。实现时以仓库内 seed/默认数据服务的既有 ctx 构造方式为准（参见 `seed/default-data.service.ts` 如何取 ctx）。**此步目标是幂等迁移既有数据，不阻塞主流程；失败仅告警不断言。**

实际上先注入 provider（Task 4 的 providers 数组需加 `ShippingProfileMigrationService`、`PaymentProfileMigrationService`），再在 bootstrap 内用 `injector.get` 获取并执行。

- [ ] **Step 2: eligibleShippingMethodsByProfile 返回带 mode/pickup**

`shipping-profile-shop.resolver.ts` 的该方法（L11-18）改为返回复合结构。新增 shop resolver 方法：

```ts
@Query()
async eligibleShippingMethodsWithConfig(
    @Ctx() ctx: RequestContext,
    @Args('profileIds') profileIds: ID[],
) {
    const intersected = await this.service.getIntersectedShippingMethods(ctx, profileIds);
    if (intersected.length === 0) return [];
    const configs = new Map<ID, any>();
    for (const pid of profileIds) {
        const rows = await this.service.getMethodConfigsByProfile(ctx, pid);
        for (const r of rows) configs.set(r.shippingMethodId as any, r);
    }
    const full = await this.service.findShippingMethodsByIds(ctx, intersected.map(m => m.id));
    return full.map((m: any) => {
        const cfg = configs.get(m.id);
        const pickupIds = cfg && cfg.mode === 'pickup' ? cfg.options?.pickupLocationIds ?? [] : null;
        return { id: m.id, code: m.code, mode: cfg?.mode ?? null, pickupLocationIds: pickupIds, name: m.translations?.[0]?.name ?? m.code };
    });
}

@Query()
async resolveShippingMethodsForChannel(@Ctx() ctx: RequestContext) {
    // 无档案 → 默认档案的方式；无默认 → 全局∪租户全部
    const def = await this.service.getTenantDefault(ctx);
    if (def) {
        const ids = (def.shippingMethods ?? []).map(m => m.id);
        const full = await this.service.findShippingMethodsByIds(ctx, ids);
        const configs = await this.service.getMethodConfigsByProfile(ctx, def.id as any);
        const cm = new Map(configs.map(c => [String(c.shippingMethodId), c]));
        return full.map((m: any) => ({
            id: m.id, code: m.code,
            mode: cm.get(String(m.id))?.mode ?? null,
            pickupLocationIds: cm.get(String(m.id))?.options?.pickupLocationIds ?? null,
            name: m.translations?.[0]?.name ?? m.code,
        }));
    }
    const all = await this.service.findShippingMethodsByIds(ctx, ctx.channel.methods ?? []);
    return all.map((m: any) => ({ id: m.id, code: m.code, mode: null, pickupLocationIds: null, name: m.translations?.[0]?.name ?? m.code }));
}
```

> `ctx.channel.methods` 若不存配送方式，改走既有「全局∪租户」查询逻辑（参照 service 的 findAll 过滤方式），实现时以仓库能查到的租户可见方式为准。

- [ ] **Step 3: eligiblePickupLocationsByProfile 改读 per-method options**

该方法（L40-47）改为：取传入 profile 的每个方法 config 的 `pickupLocationIds` 交集并返回 `findPickupLocationsByIds` 结果。若 config 无 pickup 约束则沿用旧逻辑（profile.pickupLocations），保证向下兼容。

- [ ] **Step 4: Payment 对称改造**

`payment-profile-shop.resolver.ts` 参照 Step 2/3 对称实现 `eligiblePaymentMethodsWithConfig`、`resolvePaymentMethodsForChannel`；`eligibleInstallmentOptions` 改为读 join options 而非 `profile.installmentOptions`。

- [ ] **Step 5: build + 重启 dev server + Commit（vendure）**

Verify: `Select-String packages/cjk-plugin/lib/src/shipping/shipping-profile-shop.resolver.js -Pattern "resolveShippingMethodsForChannel"`
Commit: `feat(cjk): Shop 端按档案-方式 config 解析配送/支付并支持默认回退`

---

## Task 8: Admin resolver 增加 setTenantDefault 与 methodConfigs 透传

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile-admin.resolver.ts`
- Modify: `packages/cjk-plugin/src/payment/payment-profile-admin.resolver.ts`

- [ ] **Step 1: ShippingProfileAdminResolver 加 mutation**

在 `assignShippingProfile` 后追加：

```ts
@Mutation()
@Transaction()
@Allow(shippingProfilePermission.Permission)
async setTenantDefaultShippingProfile(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
    await this.service.setTenantDefault(ctx, id);
    return true;
}
```

- [ ] **Step 2: PaymentProfileAdminResolver 加 mutation**

同理加 `setTenantDefaultPaymentProfile`。

- [ ] **Step 3: build + dev server 校验 schema + Commit（vendure）**

Verify: `Select-String packages/cjk-plugin/lib/src/shipping/shipping-profile-admin.resolver.js -Pattern "setTenantDefault"`
Commit: `feat(cjk): admin 暴露 setTenantDefault 档案 mutation`

---

# 前端任务（vshop 仓库）

## Task 9: 前端 api 层支持 methodConfigs / isTenantDefault

**Files:**
- Modify: `web-admin/src/apis/shipping-profile.ts`
- Modify: `web-admin/src/apis/payment-profile.ts`

- [ ] **Step 1: shipping-profile.ts 扩展类型与 mutation**

在 `ShippingProfileItem` 增加：

```ts
  isTenantDefault: boolean;
  methodConfigs?: { shippingMethodId: string; mode: string; options?: Record<string, unknown> | null }[];
```

在 `ShippingProfileInput` 增加：

```ts
  isTenantDefault?: boolean;
  methodConfigs?: { shippingMethodId: string; mode: string; options?: Record<string, unknown> | null }[];
```

`fetchShippingProfiles` 的 query 的 `items` 内追加：

```graphql
isTenantDefault methodConfigs { shippingMethodId mode options }
```

追加导出：

```ts
export async function setTenantDefaultShippingProfile(id: string): Promise<void> {
  await getAdminClient().request<{ setTenantDefaultShippingProfile: boolean }>(
    `mutation SetTenantDefault($id: ID!) { setTenantDefaultShippingProfile(id: $id) }`, { id },
  );
}
```

`createShippingProfile`/`updateShippingProfile` 需把 `methodConfigs` 一并传（当前 `updateShippingProfile` 已拆分 `shippingMethodIds`，应把 `methodConfigs` 保留进 `rest`）。

- [ ] **Step 2: payment-profile.ts 对称改造**

按 Step 1 同构实现，含 `setTenantDefaultPaymentProfile`、字段 `isTenantDefault`、`methodConfigs`。

- [ ] **Step 3: 新建 pickup-location.ts 封装自提点增查**

创建 `web-admin/src/apis/pickup-location.ts`：

```ts
// 自提点 admin-api 调用（cjk-plugin pickup-location-admin.resolver）
import { getAdminClient } from './client';

export type PickupLocationType = 'store' | 'point' | 'employee';

export interface PickupLocationItem {
  id: string;
  name: string;
  type: PickupLocationType;
  address: string | null;
  phoneNumber?: string | null;
  businessHours?: string | null;
}

export async function fetchPickupLocations(): Promise<PickupLocationItem[]> {
  const { pickupLocations } = await getAdminClient().request<{
    pickupLocations: { items: PickupLocationItem[]; totalItems: number };
  }>(`query PickupLocations {
    pickupLocations {
      items { id name type address phoneNumber businessHours }
      totalItems
    }
  }`);
  return pickupLocations.items ?? [];
}

export async function createPickupLocation(input: {
  name: string;
  type: PickupLocationType;
  address?: string;
}): Promise<string> {
  const { createPickupLocation } = await getAdminClient().request<{
    createPickupLocation: { id: string };
  }>(`mutation CreatePickupLocation($input: CreatePickupLocationInput!) {
    createPickupLocation(input: $input) { id }
  }`, { input });
  return createPickupLocation.id;
}
```

> 注意：`createPickupLocation` 的 schema 要求 `type`、`name`、`address` 为非空（见 plugin.ts admin schema `CreatePickupLocationInput`），且 `type` 为 `PickupLocationType` 枚举。租户级自提点传 `type:'point'`（或 `store`），职工单位自提点传 `type:'employee'`。

- [ ] **Step 4: HBuilder X 重新编译（不执行构建命令）**

按铁律，此仓库由用户在 HBuilder X 手动编译。**不要**执行 `npm run build` / `pnpm install`。修改源码后提醒用户在 HBuilder X 重新编译即可。（前端无需 git 提交 dist 产物，若仓库有 dist 跟踪统一由 user 处理。）

---

## Task 10: 配送档案编辑页逐方式条目编辑 + 设为默认

**Files:**
- Modify: `web-admin/src/pages/shipping/profile/index.vue`

- [ ] **Step 1: 拆表单布局为「方式条目」**

将原「整档案选自提点」（`pickupLocationIds`）改为逐方式条目：每行展示一个已选配送方式，自提方式（code 含 pickup/store）下方渲染自提点多选；邮寄方式展示「范围/公式由原方式实例配置」提示。表单状态新增 `methodConfigs` 数组（`{ shippingMethodId, mode, pickupLocationIds }`）。

- [ ] **Step 1b: 自提点选择支持「内联新增」**

自提点多选面板（`fetchPickupLocations()` 列出已有自提点，按 `type` 分组展示）下方加「＋ 新增自提点」入口，用 `uni.showActionSheet` 让用户选类型（`point` 租户门店自提点 / `store` 租户门店 / `employee` 职工单位自提点），然后 `uni.showModal` 依次收集 `name`、`address`（均必填），调用 `createPickupLocation({ name, type, address })` 拿到新 id 后：刷新列表并自动勾选该新点。说明文案注明「新增的自提点归属当前租户（store/point），或职工单位自提（employee）」。

- [ ] **Step 2: 保存时映射为 methodConfigs**

保存提交时，将每条自提方式的 `pickupLocationIds` 转成 `methodConfigs:[{ shippingMethodId, mode:'pickup', options:{ pickupLocationIds } }]`，邮寄方式 mode='mail'、options=null。删除旧的顶层 `pickupLocationIds` 提交（后端不再以它判定）。

- [ ] **Step 3: 增加「设为租户默认」开关**

列表/详情动作区加「设为默认」，调用 `setTenantDefaultShippingProfile(id)`，成功后刷新列表高亮该档案 `isTenantDefault`。

- [ ] **Step 4: HBuilder X 重新编译 + 提醒用户验证**

Mock 校验：创建档案 A（自提方式允许点{甲,乙}）、档案 B（同自提方式仅点{丙}），确认保存后端 exact options 落库（后端 Task 5 已挡）。

---

## Task 11: 支付档案编辑页逐方式条目编辑 + 设为默认

**Files:**
- Modify: `web-admin/src/pages/payment/profile/index.vue`

- [ ] **Step 1: 逐支付方式条目编辑分期**

将 `installmentOptions` 从档案级改为逐方式条目（如 `alipay` 方式条目下配 `huabei.periods`），状态与提交映射到 `methodConfigs`。

- [ ] **Step 2: 增加「设为租户默认」开关**

调用 `setTenantDefaultPaymentProfile(id)`，刷新高亮。

- [ ] **Step 3: HBuilder X 重新编译 + 提醒用户验证**

---

# 联调与收尾

## Task 12: 端到端验证 + 收尾 commit

**Files:**（无源码改动，验证 + 最终 commit）

- [ ] **Step 1: 后端全量 build + 重启**

Run: `cd D:\zhao\vendure && pnpm --filter @cjk/plugin run build`（含 lib 产物）。重启 Strapi/Vendure 及 `pm2 restart` 部署前，先在本地 dev server 验证 schema 与 SQL 建表（新增两张 join 表 + 两个布尔列）。

- [ ] **Step 2: 用只读 introspection 校准线上 schema**

复用 `web-admin/scripts/probe-live-schema.mjs` 模式（默认 `https://e.joho.cn/admin-api`），确认 `setTenantDefaultShippingProfile`/`setTenantDefaultPaymentProfile` 与 `methodConfigs` 字段存在、`EligibleShippingMethod` 类型可取。

- [ ] **Step 3: 手工冒烟（手机浏览器）**

按愿望清单：建档A(自提1点)、建档B(自提2点)、商品未绑档案(走默认档案)、支付分期逐方式配置、档案内内联新增租户级/职工单位自提点。

- [ ] **Step 4: 最终 git 提交（按仓库分别）**

vendure：追加所有 `lib/` 与已改源码（若上一步骤未含）。vshop：前端源码（dist 由 user 处理）。Commit message：
- vendure: `feat(cjk): 配送/支付档案按方式配置上线`
- vshop: `feat(web-admin): 档案逐方式配置编辑`

---

# Self-Review

- **Spec 覆盖**：自提点下沉 join（Task 1/5/7/10）、支付分期下沉 join（Task 2/6/8/11）、isTenantDefault 默认档案（Task 3/5/6/8/9/10/11）、无档案默认回退（Task 7）、迁移（Task 5/6 的 migrate + Task 7 Step 1 触发）。
- **类型一致性**：`ShippingProfileMethodConfigInput.mode' 统一用字符串枚举 'pickup'|'mail'|'installment'；后端 `getMethodConfigsByProfile` 返回该 join 实体，前端 `methodConfigs` 字段名一致（`shippingMethodId`/`paymentMethodId`、`options`、`mode`）。
- **占位符检查**：无 TBD/TODO；Task 7 的 `ctx.channel.methods` 允许实现时按仓库既有租户可见方式查询兜底，已注明。