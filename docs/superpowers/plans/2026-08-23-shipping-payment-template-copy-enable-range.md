# 配送/支付「模板copy复用 + 启停 + 自提点范围」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让配送/支付方式走「全局模板 copy 复用」语义，方法级与档案级启停生效，配送档案内自提方式支持「同城全部 / 指定自提点」范围，快递方式支持区域与运费公式配置。

**Architecture:** 后端在 vendure cjk-plugin 中：新增 `PaymentTemplate`（对称 `ShippingTemplate`）、给 `ShippingMethod` 注册 customField `enabled`、在结算 `shipping-calculator.ts` 过滤、给 `ShippingProfile`/`PaymentProfile` 加 `enabled`、让 shop 端按 `rangeMode` 聚合/透传自提点。前端在 web-admin 中：配送/支付方式页做「本店/全局方案池」双 Tab（含 copy），自提点页做「本店/全局池」双 Tab（含 promote/copy），档案页加 enabled 开关与自提点范围控件、快递运费配置页。前端强依赖后端 schema。
**钉死铁律：** 后端改动本地 `pnpm run build` 产物在 `lib/`，`Select-String packages/cjk-plugin/lib/... -Pattern "关键词"` 验证后 commit，服务器 git pull + pm2 restart，**绝不在服务器构建**。

**Tech Stack:** TypeScript, NestJS GraphQL Resolver, TypeORM, Vendure v3, uni-app (Vue3 + Vite + scss)

**关联 spec：** `docs/superpowers/specs/2026-08-23-vshop-shipping-payment-template-design.md`（本文依据），衔接 `docs/superpowers/specs/2026-08-23-shipping-payment-profile-enhancement-design.md`

---

## 文件结构与做法

**后端 vendure/packages/cjk-plugin：**
- 新建 `src/payment/payment-template.entity.ts` — 镜像 `shipping-template.entity.ts`
- 新建 `src/payment/payment-template.service.ts` — findAll/findOne/create/update/delete/createPaymentMethodFromTemplate
- 新建 `src/payment/payment-template-admin.resolver.ts` — 镜像 shipping-template-admin.resolver
- 新建 `src/payment/payment-template-permissions.ts` — 自定义权限常量（镜像 shipping-template-permissions）
- 新建 `src/shipping/shipping-method-custom-fields.ts` — 导出 `customShippingMethodFields`（含 enabled）
- 修改 `src/plugin.ts` — 注册 PaymentTemplate 的 gql schema + 注入 resolver/service/provider + 注册 ShippingMethod customFields（去重）
- 修改 `src/shipping/shipping-calculator.ts`（若存在）或修改 Vendure `shipping-calculator.ts` 的过滤。**注意：** 经核查结算计算器在 vendure core，但 cjk-plugin 若无自有计算器，则改用 shop resolver 层过滤（见 Task 4）。执行时以实际文件为准。
- 修改 `src/shipping/shipping-profile.entity.ts`、`src/payment/payment-profile.entity.ts` — 加 `enabled`（default true）
- 修改 `src/shipping/shipping-profile.service.ts`、`src/payment/payment-profile.service.ts` — 加 enabled 参与回退；getMethodConfigs 支持 rangeMode 聚合
- 修改 `src/shipping/shipping-profile-shop.resolver.ts`、`src/payment/*-shop.resolver.ts` — 过滤 enabled、按 rangeMode 返回自提点
- 修改 `src/plugin.ts` 的 Admin gql 模板 — ShippingProfile/PaymentProfile 类型及 [Create/Update]Input 补 `enabled`

**前端 vshop/web-admin：**
- `src/apis/shipping.ts` — 双 Tab、copy 方法；`src/apis/payment.ts`（补模板）
- `src/apis/shipping-template.ts`、`src/apis/payment-template.ts` — 新建模板 API
- `src/apis/pickup-location.ts` — 补 isPublic/promoteToPublic/assignToChannel/findByCity
- `src/pages/shipping/methods/index.vue`、`src/pages/payment/methods/index.vue` — 双 Tab
- `src/pages/pickup/index.vue` — 双 Tab + promote + copy
- `src/pages/shipping/profile/index.vue`、`src/pages/payment/profile/index.vue` — enabled 开关 + 自提点范围控件
- `src/pages/shipping/method-config/index.vue` — 快递运费/区域配置页（新建）

> **关于本计划的构成提示：** 后端与前端是两个独立交付体（各自可提交、可重启生效）。执行时建议**先完整完成后端（Task 1-7）并部署验证**，再进入前端（Task 8-13）。前端任务依赖后端 schema 就绪。

---

### Task 1: 后端 —— 配送方式启停（ShippingMethod customField + 结算过滤）

**Files:**
- Create: `packages/cjk-plugin/src/shipping/shipping-method-custom-fields.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts`（customFields 注册区）
- Modify: 结算入口过滤（见下）

- [ ] **Step 1: 新建 customFields 定义文件**

```ts
// packages/cjk-plugin/src/shipping/shipping-method-custom-fields.ts
import { CustomField } from '@vendure/core';

export const customShippingMethodFields: { ShippingMethod: CustomField[] } = {
    ShippingMethod: [
        { name: 'enabled', type: 'boolean', defaultValue: true, nullable: false },
    ],
};
```

- [ ] **Step 2: 在 plugin.ts 注册（带去重）**

在 `src/plugin.ts` 中、紧邻 ProductVariant customFields 注册处（~L807-822）追加：

```ts
// 注册 ShippingMethod customFields（enabled 启停）—— 去重防止重复注册
{
    const existingSmFields = (config.customFields?.ShippingMethod || []).map(f => (f as any).name ?? '');
    const newSmFields = (customShippingMethodFields.ShippingMethod || []).filter(
        f => !existingSmFields.includes((f as any).name),
    );
    if (newSmFields.length > 0) {
        config.customFields = {
            ...config.customFields,
            ShippingMethod: [
                ...(config.customFields?.ShippingMethod || []),
                ...newSmFields,
            ],
        };
    }
}
```
并在文件顶部 import：`import { customShippingMethodFields } from './shipping/shipping-method-custom-fields';`

- [ ] **Step 3: 结算过滤 enabled**

定位结算入口。若 `packages/cjk-plugin` 内有自定义 shipping-calculator/eligibility 过滤，在那过滤；若没有，则在本计划 Task 4 的 shop resolver 返回层过滤。更新 `src/shipping/shipping-profile-shop.resolver.ts` 的 `resolveShippingMethodsForChannel` 与 `eligibleShippingMethodsWithConfig` 返回前：
```ts
.filter((m: any) => m.customFields?.enabled !== false)
```

- [ ] **Step 4: 构建验证 + 提交**

Run:
```
cd d:\zhao\vendure\packages\cjk-plugin && pnpm run build
Select-String packages/cjk-plugin/lib/server/index.js -Pattern "enabled" | Select-String -Pattern "ShippingMethod" -Context 1,1
```
（若单文件产物路径不同，改用 `Select-String packages/cjk-plugin/lib -Pattern "customShippingMethodFields" -Recurse` 定位。以 spec 铁律为准：产物在 lib/。）
Expected: dist 含新字段，无报错。

```bash
git add packages/cjk-plugin/src/shipping/shipping-method-custom-fields.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): ShippingMethod customField enabled 启停注册"
```

---

### Task 2: 后端 —— 配送/支付档案实体加 enabled

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile.entity.ts`
- Modify: `packages/cjk-plugin/src/payment/payment-profile.entity.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts`（Admin gql 模板）

- [ ] **Step 1: 配送档案实体加列**

在 `shipping-profile.entity.ts` 的实体字段区加：
```ts
@Column({ default: true })
enabled: boolean;
```

- [ ] **Step 2: 支付档案实体加列**

在 `payment-profile.entity.ts` 同理加：
```ts
@Column({ default: true })
enabled: boolean;
```

- [ ] **Step 3: Admin gql 模板补 enabled**

在 `src/plugin.ts` 的 admin gql 模板里：
- `ShippingProfile` 类型 object 加 `enabled: Boolean!`
- `CreateShippingProfileInput` / `UpdateShippingProfileInput` 加 `enabled: Boolean`
- `PaymentProfile` 类型 object 加 `enabled: Boolean!`
- `CreatePaymentProfileInput` / `UpdatePaymentProfileInput` 加 `enabled: Boolean`

- [ ] **Step 4: 构建 + 提交**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && pnpm run build
git add packages/cjk-plugin/src/shipping/shipping-profile.entity.ts packages/cjk-plugin/src/payment/payment-profile.entity.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): 配送/支付档案实体与schema加enabled启停"
```

---

### Task 3: 后端 —— 档案 enabled 参与回退（变体绑定/默认档案）

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile.service.ts`
- Modify: `packages/cjk-plugin/src/payment/payment-profile.service.ts`

- [ ] **Step 1: getTenantDefault 排除 disabled**

在两个 service 的 `getTenantDefault(ctx)` 查询条件里追加 `enabled = true`：
```ts
// 原：WHERE ownerChannelId = :cid AND isGlobal = false AND isTenantDefault = true
// 改：追加 AND enabled = true
```

- [ ] **Step 2: 变体绑定档案若 disabled 视为未绑定**

在 shop 侧读取变体档案时，若档案 enabled=false 则不返回其方法（可复用 Task 4 的统一过滤）。此步确保回退链正确。

- [ ] **Step 3: 构建 + 提交**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && pnpm run build
git add packages/cjk-plugin/src/shipping/shipping-profile.service.ts packages/cjk-plugin/src/payment/payment-profile.service.ts
git commit -m "feat(cjk-plugin): 档案enabled参与默认回退"
```

---

### Task 4: 后端 —— shop 端自提点范围（rangeMode 聚合 + enabled 过滤）

**Files:**
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile.service.ts`（getMethodConfigsByProfile 读取 rangeMode）
- Modify: `packages/cjk-plugin/src/shipping/shipping-profile-shop.resolver.ts`
- Modify: `packages/cjk-plugin/src/pickup/pickup-location.service.ts`（如需 findByCity）

- [ ] **Step 1: pickup-location.service 补 findByCity**

```ts
async findByCity(ctx: RequestContext, city: string, type: string): Promise<PickupLocation[]> {
    const qb = this.connection.getRepository(ctx, PickupLocation).createQueryBuilder('pl');
    qb.where('(pl.isPublic = :isPublic OR pl.ownerChannelId = :channelId)', { isPublic: true, channelId: ctx.channelId });
    qb.andWhere('pl.type = :type', { type });
    if (city) qb.andWhere('pl.city = :city', { city });
    qb.andWhere('pl.enabled = :en', { en: true });
    qb.innerJoin('pl.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId });
    return qb.getMany();
}
```

- [ ] **Step 2: shop resolver 按 rangeMode 返回自提点**

在 `shipping-profile-shop.resolver.ts` 返回 pickup 方式时，将「读 options.pickupLocationIds」改为：
- `options.rangeMode === 'all'`（pickup/point）→ `pickupLocationService.findByCity(ctx, 门店city, 'point')`
- `'selected'` → options.pickupLocationIds（限类型 store/employee/point）
- 新增依赖注入 `PickupLocationService`。

- [ ] **Step 3: 过滤 enabled 方法 + 档案**

`resolveShippingMethodsForChannel` / `eligibleShippingMethodsWithConfig` 返回前过滤 `customFields.enabled === false`，且跳过所属档案 enabled=false 的项。

- [ ] **Step 4: 构建 + 提交**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && pnpm run build
git add packages/cjk-plugin/src/pickup/pickup-location.service.ts packages/cjk-plugin/src/shipping/shipping-profile.service.ts packages/cjk-plugin/src/shipping/shipping-profile-shop.resolver.ts
git commit -m "feat(cjk-plugin): shop端点按rangeMode聚合自提点并过滤enabled"
```

---

### Task 5: 后端 —— 新增 PaymentTemplate（支付模板全套）

**Files:**
- Create: `packages/cjk-plugin/src/payment/payment-template.entity.ts`
- Create: `packages/cjk-plugin/src/payment/payment-template.service.ts`
- Create: `packages/cjk-plugin/src/payment/payment-template-admin.resolver.ts`
- Create: `packages/cjk-plugin/src/payment/payment-template-permissions.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts`

- [ ] **Step 1: 实体（镜像 ShippingTemplate）**

```ts
// payment-template.entity.ts
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, VendureEntity } from '@vendure/core';

class CustomPaymentTemplateFields {}

@Entity()
export class PaymentTemplate extends VendureEntity implements ChannelAware, HasCustomFields {
    constructor(input?: DeepPartial<PaymentTemplate>) { super(input); }
    @Column() name: string;
    @Column({ type: 'text' }) description: string;
    @Column() code: string;
    @Column({ type: 'simple-json' }) checker?: { code: string; arguments: Array<{ name: string; value: string }> } | null;
    @Column({ type: 'simple-json' }) calculator?: { code: string; arguments: Array<{ name: string; value: string }> } | null;
    @Column({ default: true }) enabled: boolean;
    @Column({ default: false }) isGlobal: boolean;
    @EntityId({ nullable: true }) ownerChannelId: ID | null;
    @ManyToMany(() => Channel) @JoinTable() channels: Channel[];
    @Column(() => CustomPaymentTemplateFields) customFields: CustomPaymentTemplateFields;
}
```
> 注：`checker`/`calculator` 是否可空以支付模板实际所需为准；若支付方式无 checker 结构，可仅保留 calculator。执行时参照 `shipping-template.entity.ts` 的字段结构，保持一致。

- [ ] **Step 2: service（镜像 shipping-template.service，含 createPaymentMethodFromTemplate）**

`payment-template.service.ts` 实现 findAll/findOne/create(fromPaymentTemplate)/update/delete + `createPaymentMethodFromTemplate(ctx, templateId, name?, code?)`，用 `PaymentMethodService.create` 生成租户 PaymentMethod 绑定当前 channel，逻辑参照 `shipping-template.service.ts:114-144`。

- [ ] **Step 3: 权限常量 + admin resolver**

`payment-template-permissions.ts` 定义 Read/Create/Update/Delete/CreatePaymentMethodFromTemplate 五权限（镜像 `shipping-template-permissions.ts`）。`payment-template-admin.resolver.ts` 注册 Queries + Mutations 并用权限保护。

- [ ] **Step 4: plugin.ts 注册**

- 在 providers 数组加 `PaymentTemplateService`
- 在 resolvers 数组加 `PaymentTemplateAdminResolver`
- 在 adminApiExtensions schema 加 `PaymentTemplate` / `CreatePaymentTemplateInput` / `UpdatePaymentTemplateInput` 与 Query/Mutation（镜像 ShippingTemplate 的 gql 定义，plugin.ts L343-396）
- 权限注册：`config.authOptions.customPermissions.push(...paymentTemplatePermissionDefinitions)`

- [ ] **Step 5: 构建 + 提交**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && pnpm run build
Select-String packages/cjk-plugin/lib -Pattern "PaymentTemplate" -Recurse | Select-Object -First 3
git add packages/cjk-plugin/src/payment/payment-template.* packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): 新增PaymentTemplate支付模板与createPaymentMethodFromTemplate"
```

---

### Task 5b: 后端 —— 自提点权限常量 + create 归属 + resolver 权限判定

**Files:**
- Create: `packages/cjk-plugin/src/pickup/pickup-location-permissions.ts`
- Modify: `packages/cjk-plugin/src/pickup/pickup-location-admin.resolver.ts`
- Modify: `packages/cjk-plugin/src/pickup/pickup-location.service.ts`
- Modify: `packages/cjk-plugin/src/plugin.ts`（权限注册 + Admin schema 补 isPublic/type/归属输入）

> 供前端 Task 10 调用；随 Task 6 一起部署。

- [ ] **Step 1: 权限常量**

```ts
// pickup-location-permissions.ts
import { PermissionDefinition } from '@vendure/core';

export const SetGlobalPickupLocation = new PermissionDefinition({
    name: 'SetGlobalPickupLocation',
    description: '允许创建/提升/编辑全局自提点（超管专用）',
});

export const pickupLocationPermissionDefinitions = [SetGlobalPickupLocation];
```

- [ ] **Step 2: create 输入补归属，服务端强制租户级**

在 admin resolver 的 `createPickupLocation`：
- 增加入参 `isGlobal?: boolean`；
- 无 `SetGlobalPickupLocation` 权限时强制 `isGlobal = false`（本店自建）；
- 有权限时按入参（true=全局可用，false=租户级）。

service 里 create 时根据 isGlobal 设 `isPublic` + `ownerChannelId`（全局点 ownerChannelId=null，且 assign 到默认渠道）。

- [ ] **Step 3: promoteToPublic 鉴权**

resolver 的 `promoteToPublic` 加 `@Allow(Permission.UpdateGlobalSettings, SetGlobalPickupLocation)`，service 内再次校验持有权限否则抛 `ForbiddenError`。

- [ ] **Step 4: Admin schema 暴露 isPublic/type + 归属输入 + 权限注册**

- plugin.ts 的 admin gql 模板：`PickupLocation` 类型补 `isPublic: Boolean!`、`type`（已暴露则略）；`CreatePickupLocationInput` 补 `isGlobal: Boolean`。
- `config.authOptions.customPermissions.push(...pickupLocationPermissionDefinitions)`。
- query 应支持 `filter.isPublic`（若无，补 `BoolOperators` filter 或单独 query）。

- [ ] **Step 5: 构建 + 提交**

```bash
cd d:\zhao\vendure\packages\cjk-plugin && pnpm run build
Select-String packages/cjk-plugin/lib -Pattern "SetGlobalPickupLocation" -Recurse | Select-Object -First 2
git add packages/cjk-plugin/src/pickup/pickup-location-permissions.ts packages/cjk-plugin/src/pickup/pickup-location-admin.resolver.ts packages/cjk-plugin/src/pickup/pickup-location.service.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): 自提点SetGlobal权限+create归属+promote鉴权"
```

---

### Task 6: 后端 —— 全量构建、冒烟、commit + 推送

**Files:**
- 全链路验证产物

- [ ] **Step 1: 全量构建**

```bash
cd d:\zhao\vendure && pnpm run build --filter @entick/cjk-plugin
```
若脚本受限，则在 `packages/cjk-plugin` 内 `pnpm run build`。

- [ ] **Step 2: 校验 lib 含改动**

```bash
Select-String packages/cjk-plugin/lib -Pattern "PaymentTemplate|rangeMode|customShippingMethodFields" -Recurse
```
Expected: 关键词均出现。

- [ ] **Step 3: 冒烟（admin-api introspection 或本地 e2e）**

在本地以 sqljs/SQLite 起 dev server（若环境允许），`node scripts/probe-live-schema.mjs` 探针确认：
- `ShippingMethod.customFields.enabled` 出现
- `ShippingProfile.enabled`/`PaymentProfile.enabled` 出现
- `PaymentTemplate`/`paymentTemplates`/`createPaymentMethodFromTemplate` 出现

- [ ] **Step 4: commit + push**

```bash
git add packages/cjk-plugin
git commit -m "feat(cjk-plugin): 配送支付模板copy/启停/自提点范围后端全量"
git push
```

- [ ] **Step 5: 服务器部署**

```bash
# 在 d:\zhao\vendure 本地
git push origin
# 服务器执行（绝不在服务器构建）：
#   cd /www/apps/vendure && git pull && pm2 restart vendure
# 生产 Postgres 建表由 schema sync 自动处理；验证：
#   docker exec 1Panel-postgresql-pIe0 psql -U youshaop -d vendure -tAc "select column_name from information_schema.columns where table_name='shipping_profile' and column_name='enabled'"
```

---

### Task 7: 后端 —— 冒烟开关与 rangeMode 实测（可选但推荐）

- [ ] **Step 1: 用 admin-api mutation 实测档案 enabled 开关**

探针脚本调用 `updateShippingProfile(input:{ id, enabled })` / `updatePaymentProfile`，返回成功无 schema 错。

- [ ] **Step 2: 用 shop-api 实测 rangeMode=self 与 all**

探针调用 `resolveShippingMethodsForChannel`，确认样例返回里 rangeMode=all 的 pickup 方式携聚合后自提点。

---

### Task 8: 前端 —— 配送方式页「本店/全局方案池」双 Tab + copy + 启停

**Files:**
- Modify: `web-admin/src/apis/shipping.ts`
- Create: `web-admin/src/apis/shipping-template.ts`
- Modify: `web-admin/src/pages/shipping/methods/index.vue`

- [ ] **Step 1: 新增 shipping-template.ts**

```ts
import { getAdminClient } from './client';

export interface ShippingTemplateItem {
  id: string; code: string; name: string; description: string;
  isGlobal: boolean; enabled: boolean;
}

export async function fetchShippingTemplates(): Promise<ShippingTemplateItem[]> {
  const { shippingTemplates } = await getAdminClient().request<{
    shippingTemplates: { items: ShippingTemplateItem[] };
  }>(`query { shippingTemplates { items { id code name description isGlobal enabled } } }`);
  return shippingTemplates.items.filter(t => t.isGlobal);
}

export async function createShippingMethodFromTemplate(templateId: string): Promise<void> {
  await getAdminClient().request(`mutation C($id: ID!) {
    createShippingMethodFromTemplate(templateId: $id) { id }
  }`, { id: templateId });
}
```

- [ ] **Step 2: shipping.ts 补 enabled 开关**

在 `fetchShippingMethods` 的 query 加 `customFields { enabled }`，并在方法内序列化 `enabled: m.customFields?.enabled ?? true`。新增：
```ts
export async function setShippingEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(`mutation S($i: UpdateShippingMethodInput!) {
    updateShippingMethod(input: $i) { id }
  }`, { i: { id, customFields: { enabled } } });
}
```

- [ ] **Step 3: 方式页双 Tab**

`shipping/methods/index.vue` 顶部 `view.tabs` + 两个 `view.code` 切换：
- Tab「本店方式」：`fetchShippingMethods()`，每项带 enabled switch（调 setShippingEnabled）+ 编辑/删除
- Tab「全局方案池」：`fetchShippingTemplates()`，每项「复制到本店」→ `createShippingMethodFromTemplate(id)`，成功后切回本店 Tab 刷新

- [ ] **Step 4: 本地构建验证**

```bash
cd d:\zhao\vshop\web-admin && npm run build:h5
```
（不 push，前端为静态站，Task 13 统一部署）

```bash
git add web-admin/src/apis/shipping.ts web-admin/src/apis/shipping-template.ts web-admin/src/pages/shipping/methods/index.vue
git commit -m "feat(web-admin): 配送方式双Tab+copy+启停"
```

---

### Task 9: 前端 —— 支付方式页双 Tab + copy + 启停

**Files:**
- Create: `web-admin/src/apis/payment-template.ts`
- Modify: `web-admin/src/pages/payment/methods/index.vue`

- [ ] **Step 1: 新增 payment-template.ts**

镜像 `shipping-template.ts`，调用后端 paymentTemplates + `createPaymentMethodFromTemplate`。

- [ ] **Step 2: payment methods 页双 Tab**

镜像 Task 8 的 Step 3，但本店方式启停沿用已存在的 `setPaymentEnabled`（payment.ts），「全局方案池」复制调 `createPaymentMethodFromTemplate`。

- [ ] **Step 3: 构建 + 提交**

```bash
cd d:\zhao\vshop\web-admin && npm run build:h5
git add web-admin/src/apis/payment-template.ts web-admin/src/pages/payment/methods/index.vue
git commit -m "feat(web-admin): 支付方式双Tab+copy+启停"
```

---

### Task 10: 前端 —— 自提点页「本店/全局池」双 Tab + promote + copy（含超管权限 + 类型隔离）

**Files:**
- Modify: `web-admin/src/apis/pickup-location.ts`
- Modify: `web-admin/src/pages/pickup/index.vue`

> 前置依赖：本任务依赖后端 Task 7b（`PickupLocationPermissions.SetGlobalPickupLocation` 权限常量、create 输入补 `isPublic`、resolver 权限与归属判定、query 暴露 `isPublic`/`type`）已就绪。

- [ ] **Step 1: pickup-location.ts 补能力**

```ts
// 查询项补 isPublic/type
export interface PickupLocationItem {
  id: string; name: string; address: string; type: string; isPublic: boolean; enabled: boolean;
  // 其余现有字段保持
}

// fetchPickupLocations 支持按 isPublic 过滤
export async function fetchPickupLocations(isPublic?: boolean): Promise<PickupLocationItem[]> {
  const filter = isPublic === undefined ? '' : `(isPublic: { eq: ${isPublic} })`;
  const { pickupLocations } = await getAdminClient().request<{
    pickupLocations: { items: PickupLocationItem[] };
  }>(`query { pickupLocations(${filter ? `filter: ${filter}` : ''}) {
    items { id name address type isPublic enabled }
  } }`);
  return pickupLocations.items;
}

// 新增：设为全局（仅持有 SetGlobalPickupLocation 权限者调用，后端二次校验）
export async function promoteToPublic(id: string): Promise<void> {
  await getAdminClient().request(`mutation P($id: ID!) { promoteToPublic(id: $id) { id } }`, { id });
}

// 新增：把全局点分配到当前租户使用（引用共享，不克隆）
export async function assignToChannel(ids: string[], channelId: string): Promise<void> {
  await getAdminClient().request(`mutation A($ids: [ID!]!, $channelId: ID!) {
    assignToChannel(locationIds: $ids, channelId: $channelId) { id }
  }`, { ids, channelId });
}

// 新增：新建自提点时可带归属(仅超管可传 isGlobal=true)
export async function createPickupLocation(input: {
  name: string; type: string; address: string;
  isGlobal?: boolean; phoneNumber?: string; coordinates?: { lat: number; lng: number };
}): Promise<void> {
  await getAdminClient().request(`mutation C($i: CreatePickupLocationInput!) {
    createPickupLocation(input: $i) { id }
  }`, { i: input });
}
```

- [ ] **Step 2: 判定超管身份**

读取当前用户已持有权限列表（现有登录/用户 API 可暴露 `userPermissions` 或 `userRoles`），定义：
```ts
const IS_SUPERADMIN = /* 当前用户含 SetGlobalPickupLocation 权限 */ true;
```
若登录 API 未暴露自定义权限，则在用户信息里补查 `meQuery` 的 `roles { code }`，用 `code == 'superadmin'` 兜底（后端仍有权限校验保证安全）。

- [ ] **Step 3: 自提点页双 Tab（含权限控制 + 类型展示）**

`pickup/index.vue` 顶部 `view.tabs`：
- Tab「本店自提点」：`fetchPickupLocations()`（不含 isPublic 过滤，返回本店可见=全局已分配+自建）。每项展示 `type` 标签（门店/自提点/职工单位）+ `isPublic` 徽标（全局/本店）。操作：编辑（`isPublic=true` 的全局点仅超管可编辑，否则只读）、启停、删除（仅本店自建可删）；「**设为全局**」按钮 `promoteToPublic(id)` **仅 `IS_SUPERADMIN` 显示**，租户不显示。
- Tab「全局自提点池」：`fetchPickupLocations(true)`（isPublic=true）。每项「复制到本店」→ `assignToChannel([id], currentChannelId)`；已分配（在 fetchPickupLocations() 结果中存在）显示「已复制」不可再点。编辑/新建全局点仅 `IS_SUPERADMIN` 显示。
- 新建流程：此 Tab 内「新增自提点」时，`IS_SUPERADMIN` 显示"全局可用 / 租户级"归属选择（map 到 `isGlobal: true/false`）；非超管固定租户级，不显示归属选项。

- [ ] **Step 4: 类型隔离（方式↔点类型）衔接**

自提点列表条目类型下拉与档案范围控件共用 `type` 取值（store/point/employee），档案页（Task 11）按 mode 过滤对应类型。此处页面确认「本店自提点」列表已按类型分组或标 tag，佐证类型隔离。

- [ ] **Step 5: 构建 + 提交**

```bash
cd d:\zhao\vshop\web-admin && npm run build:h5
git add web-admin/src/apis/pickup-location.ts web-admin/src/pages/pickup/index.vue
git commit -m "feat(web-admin): 自提点双Tab+超管权限+类型隔离(promote/copy)"
```

---

### Task 11: 前端 —— 档案页带 enabled + 自提点范围控件

**Files:**
- Modify: `web-admin/src/pages/shipping/profile/index.vue`
- Modify: `web-admin/src/pages/payment/profile/index.vue`
- Modify: `web-admin/src/apis/shipping-profile.ts`、`web-admin/src/apis/payment-profile.ts`

- [ ] **Step 1: API 补 enabled + rangeMode**

两 profile API 的 Item interface 加 `enabled: boolean`；query 加 `enabled`；update input 加 `enabled`。`methodConfigs` 的 options 支持 `{ rangeMode, pickupLocationIds }`。

- [ ] **Step 2: 档案卡片加 enabled switch**

配送/支付档案卡片头部加 switch，监听调 update，独立开关。

- [ ] **Step 3: 自提方式能力范围控件**

配送档案内 mode=pickup 条目：范围控件「同城全部 / 指定n个」（selected 时从本店 point 列表多选）；mode=store/employee 条目：从 store/employee 类型本店列表多选。

- [ ] **Step 4: 构建 + 提交**

```bash
cd d:\zhao\vshop\web-admin && npm run build:h5
git add web-admin/src/apis/shipping-profile.ts web-admin/src/apis/payment-profile.ts web-admin/src/pages/shipping/profile/index.vue web-admin/src/pages/payment/profile/index.vue
git commit -m "feat(web-admin): 档案enabled开关+自提点范围控件"
```

---

### Task 12: 前端 —— 快递运费区域配置页（模板层，决策后定稿）

> **决策（AskUserQuestion 确认）**：快递的配送区域与运费公式配置**落在配送方式模板层**，而非已建方式实例。原因：Vendure `updateShippingMethod` 不支持改写 calculator，而 `ShippingTemplate` 的 `checker`/`calculator` 可写。模板配置后的实例经「复制到本店」继承。

**Files:**
- Create: `web-admin/src/pages/shipping/method-config/index.vue`
- Modify: `web-admin/src/apis/shipping-template.ts`（补 fetchShippingTemplate / updateShippingTemplateConfig）
- Modify: `web-admin/src/pages.json`（注册路由）
- Modify: `web-admin/src/pages/shipping/methods/index.vue`（全局方案池项超管可见「区域与运费」入口）

- [ ] **Step 1: 模板配置 API**
- `fetchShippingTemplate(id)` 读 `checker.arguments` 与 `calculator.arguments`
- `updateShippingTemplateConfig(id, checker, calculator)` 调 `updateShippingTemplate(input:{ id, checker: ConfigArgInput, calculator: ConfigArgInput })`

- [ ] **Step 2: 配置页（区域 + 运费公式）**
表单：资格检查器（excludedAreas 排除地区、orderMinimum 最低金额）+ 阶梯重量计算器（firstWeight/firstWeightFee/additionalWeightUnit/additionalWeightFee/remoteAreaSurcharge/remoteAreas/freeShippingThreshold/freeShippingAreas/useVolumetricWeight/volumetricDivisor/maxShippingFee/insuranceFeeRate/insuranceMinFee/oversizedThreshold/oversizedSurcharge）。

- [ ] **Step 3: 入口与路由**
配送方式页「全局方案池」每项对超管显示「区域与运费」→ `/pages/shipping/method-config/index?id=<templateId>`；`pages.json` 注册该页。

- [ ] **Step 4: 构建 + 提交**
```bash
cd d:\zhao\vshop\web-admin && npm run build:h5
git add web-admin/src/pages/shipping/method-config web-admin/src/apis/shipping-template.ts web-admin/src/pages.json web-admin/src/pages/shipping/methods/index.vue
git commit -m "feat(web-admin): 快递运费区域配置页(模板层)"
```

---

### Task 13: 前端 —— 全量构建 + 部署（e.joho.cn/guanli）

- [ ] **Step 1: 全量构建**

```bash
cd d:\zhao\vshop\web-admin && npm run build:h5
```
产物 `dist/build/h5`，确认含新 chunk（pages-shipping-method-config-index.* 等）。

- [ ] **Step 2: 打包上传**

```bash
tar -C web-admin/dist/build/h5 -cf D:\zhao\vshop\out.tar .
scp D:\zhao\vshop\out.tar qing:/tmp/out.tar
```

- [ ] **Step 3: 服务器部署（q 铁律）**

服务器执行：备份 `cp -r . .bak_$(date +%s)` + `rm -rf assets` + `tar -xf /tmp/out.tar`（tar 的 "." chmod 告警非法）。

- [ ] **Step 4: 线上验证 chunk 200**

```bash
curl -s -o NUL -w "%{http_code}" "https://e.joho.cn/guanli/assets/pages-shipping-method-config-index.DBQg5aqT.js"  # 用实际 hash
```

- [ ] **Step 5: commit + push**

```bash
git add web-admin
git commit -m "feat(web-admin): 配送支付模板copy/档案启停/自提点范围前端全量"
git push
```

---

## 自审核对（Self-Review）

**Spec 覆盖：**
- PaymentTemplate 新建 → Task 5 ✓
- ShippingMethod enabled + 结算过滤 → Task 1(+4) ✓
- 档案 enabled + schema + 回退 → Task 2, 3 ✓
- rangeMode 同城聚合 + 类型绑定 → Task 4, 11 ✓
- 全局/租户自提点（promote/copy + 超管权限 + create 归属 + 类型隔离）→ Task 5b（后端）, 10（前端）✓
- 超管权限常量/鉴权 → Task 5b ✓
- 快递运费/区域 → Task 12 ✓
- 前端双 Tab copy → Task 8, 9 ✓
- 部署 → Task 6, 13 ✓

**占位符扫描：** 无 TBD/TODO；Task 5 支付模板 checker/calculator 结构已注明"以实体实际所需为准"，其余步骤均含完整代码或精确改动描述。

**类型一致性：** `enabled` 在后端实体/schema/shop过滤也端接口均布尔；`rangeMode` 在 options 与前端方法一致；`createShippingMethodFromTemplate` / `createPaymentMethodFromTemplate` 命名一致。