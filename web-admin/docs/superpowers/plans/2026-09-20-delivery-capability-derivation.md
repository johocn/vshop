# 配送能力派生与筛选收口（G9）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **提交约束（用户要求）**：本计划中的 commit 步骤**仅在用户明确要求时执行**。
>
> **本批与「主题风格体系联通（G1+G2）」互不依赖**，可独立执行；但两者都改 web-admin，若并行请避免同文件冲突（本批只碰商品表单与配送档案页，不碰主题页/模板库/全局配置）。

**Goal:** 商品「是否支持邮寄 / 自提」改为**由配送档案派生**（不再手工勾选），店铺只有单一能力时 C 端不渲染配送方式选择框，配送方式筛选改为**服务端执行**（分页与总数正确）。

**Architecture:** 派生层是唯一真源——从 `shipping_profile_method.mode` 读出档案能力（`mail` → MAIL；`pickup`/`store`/`employee` → SELF_PICKUP），按「变体绑定档案 → 未绑/停用回退租户默认档案」解析（与 `OrderBoxService.computeOrderBoxes` 同一回退语义）。筛选走 **Vendure 原生 facet**（一个 facet `delivery-mode` + 两个 facet value），由 cjk-plugin 在档案/绑定变更时同步维护到 **ProductVariant**（原生 `search.facetValueIds` 的过滤粒度就是 variant），从而直接复用 `totalItems` 与分页。C 端筛选条的渲染条件 = 五级配置开关 **AND** 渠道派生出的双能力。

**Tech Stack:** Vendure 3.6.4 / TypeORM / NestJS（cjk-plugin，含 vitest）、Nuxt 4 + Vue 3（nshop）、uni-app（vshop web-admin）。

---

## 执行进度（2026-09-21）

| Task | 状态 | 说明 |
|---|---|---|
| Task 0 facet 粒度决策门 | ✅ 已跑（生产只读探针） | 服务端过滤生效 → 走 4A；粒度按数据模型定为 variant 级 |
| Task 1 派生纯函数 | ✅ 已实现 | `delivery-capability.ts` + 6 单测 |
| Task 2 能力解析服务 | ✅ 已实现 | `ShippingProfileService` 新增 4 方法 |
| Task 3 暴露能力查询 | ✅ 已实现（**已补 admin-api 双注册**） | 新代码用 `facetValueFilters`；`plugin.ts` admin SDL + resolvers 均已注册 `DeliveryCapabilityResolver` |
| Task 4A facet 同步 | ✅ 已实现 + **本地运行时全链验证** | 新增 `delivery-facet.service.ts`；档案创建/更新/删除/设默认挂 `rebuildChannel`，绑定变体挂 `syncVariants`（均包 `syncFacetSilently`，同步失败不影响档案写入）。实测：`rebuildChannel` 更新 19/19 变体；reindex（**需另起 `dev:worker`**）后索引 `[""] → ["1","2"]`；`facetValueFilters:[{or:[id]}]` 过滤 MAIL=17 / SELF_PICKUP=17 / baseline=17 |
| Task 4B | ⏭️ 跳过 | Task 0 判定走 4A |
| Task 5 C 端判定改读派生 | ✅ 已实现 | `productVisibility.ts` 优先 `deliveryModes`；`delivery-modes.ts` 纯函数 |
| Task 6 首页筛选条 | ✅ 已完成（Step 3 已落地 + 本地运行时验证） | 渲染条件 + 单方式锁定 + **服务端 `facetValueFilters` 取数并在切换时重查**。落地文件：`app/pages/index.vue`（兜底楼层）与 `layers/base/app/components/home/blocks/GoodsFloor.vue`（积木楼层）——**本渠道实测 `hasBlocks=false`（无装修 sections），首页真实走 index.vue 兜底路径，两条路径必须都改** |
| Task 6 Step 3 关键坑（新增） | ✅ 已修正 | `useAsyncData` handler 内**先 await 其它请求（如渠道能力）后再调 `useAsyncGql`** 会丢 Nuxt 实例上下文 → 抛 `[nuxt] instance unavailable`，表现为**首页商品块静默清空（0 条）且不报错**。修法：handler 内一律用 setup 顶层绑定的 `rawGql = useGql()`（普通函数）取数；改后实测 默认「邮寄」2 卡 → 切「自提」4 卡（服务端 PICKUP=9 经城市维度过滤），筛选条正常渲染 |
| Task 7 结算页单方式锁定 | ✅ 已实现 | `BoxDeliveryBlock.vue`：单方式不渲染单选组、直接锁定并参与提交校验 |
| Task 8 web-admin | ✅ 已实现 + **已部署 e.joho.cn** | 商品表单只读 + 档案页能力摘要 + 重建索引 + 双语 i18n；`npm run build:h5` 通过；线上复测：档案页显示「本店配送能力 仅自提」与「重建配送筛选索引」，点击出「索引已重建」toast；商品编辑页显示「配送方式（由配送档案推导）仅自提 / 去配送档案修改 ›」 |
| Task 9 后端部署 | ✅ 已完成 | 两次提交 `a3cf305f3` + `4e7c7e605` → 生产 `git pull --ff-only` + `pm2 restart vendure`；生产 shop-api 新查询可用 |
| ★ 存量数据补齐（计划外，必须做） | ✅ 已实现 + 已部署 | 生产默认渠道曾返回 `modes:["SELF_PICKUP"] bothSupported:false` → 按新规则**筛选条会全站消失**。根因：`method_configs` 行只在 web-admin 保存档案时写入，存量档案恒为空（`migrateLegacyPickupLocations` 从未被调用）。改为**读时补齐**（按绑定方式计算器推断 mode，口径同 `resolveBoxFulfilment`），提交 `d5a910ea3`；生产默认渠道复测 `["MAIL","SELF_PICKUP"] bothSupported:true` |
| ★ 生产索引补建（计划外，必须做） | ✅ 已完成 | `rebuildChannel` 只在档案写操作时触发，存量渠道变体 facet 为空 → C 端服务端筛选恒 0 条。已逐渠道跑 `rebuildChannel` + `reindex`，26 渠道复测通过（双能力：`default`/`official-01`；其余确为单能力属实） |
| Task 10 Step 2 C 端部署 | ✅ 已完成 | `node scripts/deploy.mjs`（本地构建 → scp `.output/` → 服务器解压 → `pm2 restart nshop`） |
| Task 10 C 端验收 | ✅ 已完成 | 线上 www.youshop.cn 手机 390×844 dpr=2 实测：默认「邮寄」= 2 件（= 服务端 MAIL 命中数）、切「自提」= 2 件（服务端 SELF_PICKUP=9，经城市维度过滤后）、筛选条渲染且高亮跟随切换、商品集合真实变化。API 回归：baseline=10 / MAIL(8)=2 / SELF_PICKUP(9)=9 |
| Task 9 Step 3 操作手册 | ✅ 已完成 | 新建 `docs/delivery-admin-manual/delivery-admin-manual.html`（+ `assets/` 5 张手机截图）：派生规则表、回退与并集、索引自动/手动重建、筛选条渲染条件、FAQ（含「筛选条消失」「商品变少」「城市名精确匹配」） |

**存量数据实测（2026-09-21 生产）**：`method_configs` 行只在 web-admin 保存档案时写入，故存量档案（尤其中转快递的租户默认档案）恒为空。逐渠道结果——
- `default`：#5 `default-shipping`（启用、绑 `courier-delivery`、无 cfg）→ 推断 MAIL → **双能力**（已修复）
- `official-1`：#36 `c92-delivery`（同上形态）→ **双能力**（已修复）
- `official-20`：仅全局档案（均为自提）→ 单能力**属实**
- `t1`/`t2`：档案全绑 `store-pickup` → 单能力**属实**
- `t3`：快递档案存在但 `enabled=false` → 被正确排除

⇒ 剩余单能力渠道都是「确实没有启用中的快递档案」，非派生漏算。**注意**：这些渠道若商户确实要发货，需自行补建快递档案，否则筛选条（按硬规则）不渲染。

**已核实并纠正的计划性错误**：① `facetValueIds` 已废弃 → 用 `facetValueFilters`；② plugin 的 admin/shop 是两套 SDL+resolvers，必须各自注册；③ `SearchResult` 无 `customFields`；④ 渲染条件不能依赖 facet 映射（否则筛选条会永久消失）；⑤ 派生必须容忍存量档案缺 `method_configs` 行（否则快递档案不参与能力并集）。

---

## 关键约束与已核实事实（★ 与设计稿有出入处已标注）

| # | 事实 | 出处 |
|---|---|---|
| 1 | 档案能力的真实字段是 `ShippingProfileMethod.mode`，取值 `'mail' \| 'pickup' \| 'store' \| 'employee'`，默认 `'pickup'` | [shipping-profile-method.entity.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile-method.entity.ts#L16-L23) |
| 2 | ★ **设计稿写的 `mode==='delivery'` 是错的**：本仓 `mail` 才是邮寄；`store`/`employee` 属自提类（判定函数 `isPickupMode`） | [shipping-profile.service.ts L350-L352](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts#L350-L352) |
| 3 | 档案实体无 `mode` 列；能力存在 `ShippingProfileMethod`，join 键为**字符串** `profileId` / `shippingMethodId` | [shipping-profile.entity.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.entity.ts#L24-L80) |
| 4 | 变体绑定写在 `product_variant.customFieldsShippingprofileid`（raw SQL），绑定后**不会**自动触发搜索索引更新 | [shipping-profile.service.ts L170-L184](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts#L170-L184) |
| 5 | 回退语义：变体档案停用或未绑 → 回退租户默认档案；默认档案查询条件 `isGlobal:false, ownerChannelId:ctx.channelId, isTenantDefault:true, enabled:true` | [order-box.service.ts L271-L290](file:///d:/zhao/vendure/packages/cjk-plugin/src/order/order-box.service.ts#L271-L290)、[shipping-profile.service.ts L498-L506](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts#L498-L506) |
| 6 | 批量取某档案的方法行已有可复用范式 `attachMethodConfigs`（`In(ids)` 一次查全部） | [shipping-profile.service.ts L552-L570](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts#L552-L570) |
| 7 | 首页筛选条**无条件按配置渲染**，且过滤是对**已加载数组的本地 filter** | [GoodsSingleList.vue L26-L32](file:///d:/zhao/nshop/layers/base/app/components/home/blocks/GoodsSingleList.vue#L26-L32)、[L63-L68](file:///d:/zhao/nshop/layers/base/app/components/home/blocks/GoodsSingleList.vue#L63-L68) |
| 8 | 判定依据是商品手工字段，**空值 = 两者都支持** | [productVisibility.ts L18-L32](file:///d:/zhao/nshop/layers/base/app/utils/productVisibility.ts#L18-L32) |
| 9 | 商品列表走**原生 search**：`SearchProducts` = `search(input: {term, groupByProduct, skip, take, collectionSlug})` | [product.gql L32-L49](file:///d:/zhao/nshop/layers/base/gql/queries/product.gql#L32-L49) |
| 10 | ★ **纠正：本仓 `SearchInput` 里 `facetValueIds` 已 `@deprecated`，新代码一律用 `facetValueFilters: [{ or: [ids] }]`**（既有先例 `collection.gql` 用的就是 `facetValueFilters`） | [common-types.graphql L175-L188](file:///d:/zhao/vendure/packages/core/src/api/schema/common/common-types.graphql#L175-L188)、[collection.gql L15-L23](file:///d:/zhao/nshop/layers/base/gql/queries/collection.gql#L15-L23) |
| 10b | ★ **`SearchResult` 没有 `customFields` 字段** → 搜索 fragment 拿不到 `belongCity`/`serviceCities`，城市相关数据须另走 `GetProductsByIds` 补拉（首页现状即如此） | [product.gql](file:///d:/zhao/nshop/layers/base/gql/fragments/product.gql) |
| 10c | ★ **plugin 的 admin-api 与 shop-api 是两套独立 SDL + resolvers，必须各自注册**（`channelDeliveryCapability` / `variantDeliveryModes` 已在两处都注册；web-admin 走 `/admin-api`） | [plugin.ts L1246-L1264](file:///d:/zhao/vendure/packages/cjk-plugin/src/plugin.ts#L1246-L1264) |
| 11 | 物流箱单选已在 `BoxDeliveryBlock.vue`，单选组渲染条件 = `(box.availableShippingMethodIds ?? []).length`；选择即 `orderStore.setOrderBoxShippingMethod(boxKey, methodId, null)` | [BoxDeliveryBlock.vue L164-L176](file:///d:/zhao/nshop/layers/base/app/components/checkout/BoxDeliveryBlock.vue#L164-L176) |

**硬约束（不得破）**

- 不改分箱规则（按租户 → 按配送档案）与结算链路既有语义。
- 不改五级风格体系层级；「店铺双能力」只作为筛选条的**数据前置条件**（`home.filter` 配置层级与语义保持不变）。
- 仓库侧 `StockLocation.customFields.deliveryMethods` 的消费链路**不动**（本批非目标）。
- `Product.customFields.deliveryMethods` / `StockLocation` 的列**不删除**，前者降级为只读展示。
- vendure 后端**禁止服务器构建**：本地 `pnpm build` 提交 `lib/`，服务器只 `git pull` + `pm2 restart`。
- 所有验收以**手机视口 390×844、dpr=2 截图**为准，并补入操作手册。

## 文件结构

| 文件 | 职责 |
|---|---|
| `vendure/packages/cjk-plugin/src/shipping/delivery-capability.ts`（新建） | 纯函数：`modesFromMethodConfigs` / `resolveVariantDeliveryModes` / `bothSupported` |
| `…/src/shipping/delivery-facet.service.ts`（新建） | facet 保证存在 + 渠道/变体级同步 + 分批重建 |
| `…/src/shipping/delivery-capability.resolver.ts`（新建） | shop-api：`channelDeliveryCapability` |
| `…/src/shipping/shipping-profile.service.ts` | 增 `getChannelDeliveryCapability` / `getMethodConfigsByProfiles`（批量） |
| `…/src/shipping/shipping-profile-admin.resolver.ts` | `assignToVariants` 等变更后触发 facet 同步 |
| `…/src/plugin.ts` | 注册新 provider/resolver + 启动时 ensureFacet |
| `nshop/layers/base/gql/queries/product.gql` | `SearchProducts` 增 `$facetValueIds` |
| `nshop/layers/base/app/utils/productVisibility.ts` | 判定改读派生 `deliveryModes`；降级为展示用 |
| `nshop/layers/base/app/components/home/blocks/GoodsSingleList.vue` / `GoodsMasonryGrid.vue` | 删本地过滤；筛选值 → query 参数；渲染条件加双能力 |
| `nshop/layers/base/app/composables/useModuleDelivery.ts` | 增渠道双能力查询与 facetValueId 映射 |
| `nshop/layers/base/app/components/checkout/BoxDeliveryBlock.vue` | 单方式 → 隐藏单选并锁定 |
| `vshop/web-admin/src/components/ProductForm.vue` | 配送方式改只读展示 + 档案跳转 |
| `vshop/web-admin/src/pages/shipping/profile/index.vue` | 渠道能力摘要 + 未配置告警 + 重建索引入口 |

---

## Task 0（决策门）: 核验 facet 过滤粒度

这是**必须先跑完**的门，决定 Task 4 走 4A 还是 4B。不要跳过。

> **★ 已执行（2026-09-21，用生产 shop-api 只读探针代替本地起服，因本地 vendure 依赖双实例起不来）**
>
> 探针 A（**入参改用 `facetValueFilters`，`facetValueIds` 已 @deprecated**）：
> ```
> query { search(input: { term: "", groupByProduct: true, take: 5, skip: 0 }) { totalItems } }            → 10
> query { search(input: { term: "", groupByProduct: true, take: 5, skip: 0,
>                         facetValueFilters: [{ or: ["1"] }] }) { totalItems } }                          → 0
> ```
> **结论：服务端 facet 过滤生效**（filter 被真正应用，不是被忽略——否则 totalItems 仍会返回 10）。→ **走 Task 4A**。
>
> 探针 B（粒度）：生产数据里 `product(57).variants[].facetValues` 全为空、`search.items[].facetValueIds` 只返回 `[""]`，**没有可用样本**做实测；
> 但 Vendure 的 facet 值本就存在 `ProductVariant` 上（`Product.facetValues` 是聚合），`groupByProduct` 只是把命中的变体归到商品，
> 因此**粒度 = variant 级**，与派生源（变体绑定档案）一致，Task 4A 的目标定为「同步到变体」。
>
> ```
> 探针 A：N=10，过滤后 totalItems=0 → 结论=通过（服务端过滤生效）
> 探针 B：粒度=variant（按数据模型推定，生产无样本可实测）
> 决定执行：Task 4A
> ```
>
> **遗留**：`channelDeliveryCapability.facetValueIds` 端到端的 totalItems 正确性仍需在部署后补验（Task 9）。

- [ ] **Step 1: 造对的本地数据**（部署后补验时可跳过，直接看真实档案/商品）

本地 vendure 起服后（admin-api），确认存在：
1. 一个 facet（如品牌品牌 facet）与至少两个 facet value；
2. 至少 2 个商品各绑定不同 facet value。

用 admin-api 查询拿 id：
```graphql
query { facets { items { id code name values { id code name } } } }
```
记录 `values[].id`。

- [ ] **Step 2: 探针 A —— facetValueIds 在 `groupByProduct: true` 下是否真的过滤**

用**shop-api**（非 admin）执行：
```graphql
query Probe($ids: [ID!]) {
  search(input: { term: "", groupByProduct: true, take: 20, skip: 0, facetValueIds: $ids }) {
    totalItems
    items { productId productName }
  }
}
```
先传 `$ids` 为空数组记录 `totalItems = N`；再传单个 facet value id（只让一个商品命中的那个）。

**判定**：若第二个查询的 `totalItems` **严格小于 N**，且返回项的 `productId` 都是绑定该 facet value 的商品 → **通过，走 Task 4A**。
若 `totalItems` 不变或报错 → **不通过，走 Task 4B**。

- [ ] **Step 3: 探针 B —— 过滤粒度是 variant 还是 product**

给**同一个商品的两个变体**分别绑 facet value X 与 Y（用 admin `updateProductVariants` 传 `facetValueIds`），然后用 X 过滤。

**判定**：若该商品仍出现（因为它的某变体命中 X）→ 粒度 = **variant 级**，与我们的派生源（变体绑定档案）一致，**Task 4A 可直接落地**。
若只按商品级 facet 命中 → 需要改为同步到 `Product.facetValues`，在 Task 4A 里把目标从变体换成商品（Step 3 会写明两种写法，按探针结果二选一）。

- [ ] **Step 4: 记录结论**

把两个探针的实际输出（`totalItems` 数字与命中项）写进本节下方，作为后续实现的依据：

```
探针 A：N=<填>，过滤后 totalItems=<填> → 结论=<通过/不通过>
探针 B：粒度=<variant/product>
决定执行：Task 4A / Task 4B
```

若走 4B，则 Task 4A 整节跳过，并接受其代价（隐藏总数、分页不精确）。

---

## Task 1: 派生纯函数（唯一真源）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\delivery-capability.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\delivery-capability.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/shipping/delivery-capability.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { modesFromMethodConfigs, bothSupported } from './delivery-capability';

describe('modesFromMethodConfigs 档案能力派生', () => {
    it('mail 模式 → MAIL', () => {
        expect(modesFromMethodConfigs([{ mode: 'mail' }])).toEqual(['MAIL']);
    });
    it('pickup 类三种模式都 → SELF_PICKUP', () => {
        expect(modesFromMethodConfigs([{ mode: 'pickup' }]).sort()).toEqual(['SELF_PICKUP']);
        expect(modesFromMethodConfigs([{ mode: 'store' }]).sort()).toEqual(['SELF_PICKUP']);
        expect(modesFromMethodConfigs([{ mode: 'employee' }]).sort()).toEqual(['SELF_PICKUP']);
    });
    it('两种模式 → 去重后双能力（MAIL 在前）', () => {
        expect(modesFromMethodConfigs([{ mode: 'pickup' }, { mode: 'mail' }, { mode: 'mail' }])).toEqual(['MAIL', 'SELF_PICKUP']);
    });
    it('无方法行 → 空数组（由调用方决定兜底）', () => {
        expect(modesFromMethodConfigs([])).toEqual([]);
        expect(modesFromMethodConfigs(null)).toEqual([]);
    });
    it('未知 mode 按非自提处理（mail 类），不抛错', () => {
        expect(modesFromMethodConfigs([{ mode: 'weird' }])).toEqual(['MAIL']);
    });
});

describe('bothSupported', () => {
    it('双能力才为 true', () => {
        expect(bothSupported(['MAIL', 'SELF_PICKUP'])).toBe(true);
        expect(bothSupported(['MAIL'])).toBe(false);
        expect(bothSupported([])).toBe(false);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `d:\zhao\vendure\packages\cjk-plugin` 下）：
```bash
pnpm test
```
Expected: FAIL —— `Failed to resolve import "./delivery-capability"`。

- [ ] **Step 3: 实现**

创建 `src/shipping/delivery-capability.ts`：

```ts
/**
 * 配送能力派生（唯一真源）。
 *
 * 能力真源 = ShippingProfileMethod.mode（不是商品/仓库的手工字段）：
 *   - 'mail'                         → MAIL（快递邮寄）
 *   - 'pickup' | 'store' | 'employee' → SELF_PICKUP（到店/自提点/职工单位自提）
 * 其它未知值按 Mail 类处理（与 ShippingProfileService.isPickupMode 的语义互补：
 * 那边「非自提即邮寄」，这边保持同一口径）。
 */
export type DeliveryMode = 'MAIL' | 'SELF_PICKUP';

export interface DeliveryCapability {
    modes: DeliveryMode[];
    bothSupported: boolean;
    source: 'profile' | 'fallback';
}

const PICKUP_MODES = new Set(['pickup', 'store', 'employee']);

/** 档案的方法行 → 去重后的能力集合（MAIL 恒排在 SELF_PICKUP 之前，便于稳定比较） */
export function modesFromMethodConfigs(
    configs: Array<{ mode?: string | null }> | null | undefined,
): DeliveryMode[] {
    let mail = false;
    let pickup = false;
    for (const c of configs ?? []) {
        if (PICKUP_MODES.has(String(c?.mode ?? ''))) pickup = true;
        else mail = true;
    }
    const out: DeliveryMode[] = [];
    if (mail) out.push('MAIL');
    if (pickup) out.push('SELF_PICKUP');
    return out;
}

export function bothSupported(modes: DeliveryMode[]): boolean {
    return modes.includes('MAIL') && modes.includes('SELF_PICKUP');
}

/**
 * 由档案方法行解析能力。档案不存在 / 无任何方法行 → 回退「两者都支持」，
 * 保持旧行为不误伤（与既有「空 deliveryMethods = 两者都支持」的兜底一致）。
 */
export function capabilityFromMethodConfigs(
    configs: Array<{ mode?: string | null }> | null | undefined,
): DeliveryCapability {
    const modes = modesFromMethodConfigs(configs);
    if (modes.length === 0) {
        return { modes: ['MAIL', 'SELF_PICKUP'], bothSupported: true, source: 'fallback' };
    }
    return { modes, bothSupported: bothSupported(modes), source: 'profile' };
}

/** 多个档案的能力并集（渠道级能力 = 渠道内全部生效档案的并集） */
export function unionCapability(
    list: Array<Array<{ mode?: string | null }> | null | undefined>,
): DeliveryCapability {
    const flat: Array<{ mode?: string | null }> = [];
    for (const configs of list) flat.push(...(configs ?? []));
    return capabilityFromMethodConfigs(flat);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS（7 passed）。

---

## Task 2: 渠道级 / 变体级能力解析服务

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile.service.ts`

- [ ] **Step 1: 增批量取方法行的方法**

在 `ShippingProfileService` 中，`getMethodConfigsByProfile` 之后追加：

```ts
    /** 批量取多个档案的方法行（一次查询，避免逐档案查） */
    async getMethodConfigsByProfiles(
        ctx: RequestContext,
        profileIds: Array<ID | string>,
    ): Promise<Map<string, ShippingProfileMethod[]>> {
        const out = new Map<string, ShippingProfileMethod[]>();
        const ids = [...new Set(profileIds.map(id => String(id)))];
        if (ids.length === 0) return out;
        const rows = await this.connection
            .getRepository(ctx, ShippingProfileMethod)
            .find({ where: { profileId: In(ids) } as any });
        for (const r of rows) {
            if (!out.has(r.profileId)) out.set(r.profileId, []);
            out.get(r.profileId)!.push(r);
        }
        return out;
    }

    /** 本渠道内参与履约的全部生效档案（租户自有 + 全局），供渠道级能力并集使用 */
    async listEffectiveProfilesForChannel(ctx: RequestContext): Promise<ShippingProfile[]> {
        const qb = this.connection
            .getRepository(ctx, ShippingProfile)
            .createQueryBuilder('sp')
            .leftJoinAndSelect('sp.shippingMethods', 'sm')
            .where('sp.enabled = :on', { on: true })
            .andWhere(
                '(sp.isGlobal = :isGlobal OR sp.ownerChannelId = :channelId)',
                { isGlobal: true, channelId: ctx.channelId },
            );
        return qb.getMany();
    }

    /**
     * 渠道级配送能力（并集）。
     * 若渠道内存在未绑定档案的变体，则并入租户默认档案的能力（与 computeOrderBoxes 的回退一致）。
     * fallback：渠道内一个生效档案都没有 → 回退「两者都支持」，保持旧行为不误伤。
     */
    async getChannelDeliveryCapability(ctx: RequestContext): Promise<DeliveryCapability> {
        const profiles = await this.listEffectiveProfilesForChannel(ctx);
        if (profiles.length === 0) {
            return { modes: ['MAIL', 'SELF_PICKUP'], bothSupported: true, source: 'fallback' };
        }
        const map = await this.getMethodConfigsByProfiles(ctx, profiles.map(p => p.id));
        const perProfile = [...map.values()];
        const tenantDefault = await this.getTenantDefault(ctx);
        if (tenantDefault) {
            perProfile.push(map.get(String(tenantDefault.id)) ?? []);
        }
        return unionCapability(perProfile);
    }

    /**
     * 逐变体派生配送能力（含默认档案回退）。批量入参，档案方法行一次查出。
     * 回退语义与 OrderBoxService.computeOrderBoxes 完全一致：
     * 绑定档案停用 → 视为未绑定 → 回退租户默认档案；两者皆无 → fallback（两者都支持）。
     */
    async getVariantDeliveryCapabilities(
        ctx: RequestContext,
        variantIds: ID[],
    ): Promise<Map<string, DeliveryCapability>> {
        const out = new Map<string, DeliveryCapability>();
        if (variantIds.length === 0) return out;
        const variantRepo = this.connection.getRepository(ctx, 'ProductVariant');
        const variants = await variantRepo
            .createQueryBuilder('v')
            .select(['v.id AS id', 'v."customFieldsShippingprofileid" AS pid'])
            .where('v.id IN (:...ids)', { ids: variantIds.map(v => Number(v)) })
            .getRawMany<{ id: number; pid: string | null }>();

        const ids = new Set<string>();
        for (const v of variants) if (v.pid) ids.add(String(v.pid));
        const tenantDefault = await this.getTenantDefault(ctx);
        if (tenantDefault) ids.add(String(tenantDefault.id));
        const configMap = await this.getMethodConfigsByProfiles(ctx, [...ids]);

        // 停用档案集合（一次性查出，避免逐个 findOne）
        const rawIds = [...new Set(variants.map(v => String(v.pid ?? '')).filter(Boolean))];
        const enabledMap = new Map<string, boolean>();
        if (rawIds.length) {
            const rows = await this.connection
                .getRepository(ctx, ShippingProfile)
                .find({ where: { id: In(rawIds) } as any, loadEagerRelations: false });
            for (const p of rows) enabledMap.set(String(p.id), p.enabled !== false);
        }

        for (const v of variants) {
            const rawPid = v.pid ? String(v.pid) : '';
            let effective = rawPid && enabledMap.get(rawPid) === true ? rawPid : '';
            if (!effective && tenantDefault) effective = String(tenantDefault.id);
            const configs = effective ? configMap.get(effective) ?? [] : [];
            out.set(String(v.id), capabilityFromMethodConfigs(configs));
        }
        return out;
    }
```

并在文件顶部 import 区加入：

```ts
import { DeliveryCapability, capabilityFromMethodConfigs, unionCapability } from './delivery-capability';
```

（确认 `In` 已从 `typeorm` 导入；文件已在用 `In`。）

- [ ] **Step 2: 构建校验**

Run（在 `d:\zhao\vendure\packages\cjk-plugin` 下）：
```bash
pnpm build
```
Expected: 无 TS 报错。

---

## Task 3: shop-api 暴露能力与筛选 id

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\delivery-capability.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\delivery-facet.service.ts`（Task 4A 创建；本 Task 只声明依赖接口）

- [ ] **Step 1: 只读派生保底（不依赖 facet）**

创建 `src/shipping/delivery-capability.resolver.ts`：

```ts
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { ShippingProfileService } from './shipping-profile.service';

/**
 * 配送能力查询（shop-api）。
 * modes/bothSupported 由配送档案派生（唯一真源），与 facet 索引无关；
 * facetValueIds 为可选的「服务端筛选入口」，facet 尚未同步时为 null（C 端据此降级为不过滤）。
 */
@Resolver()
export class DeliveryCapabilityResolver {
    constructor(private shippingProfileService: ShippingProfileService) {}

    @Query()
    @Allow(Permission.Public)
    async channelDeliveryCapability(@Ctx() ctx: RequestContext): Promise<{
        modes: string[];
        bothSupported: boolean;
        source: string;
        facetValueIds: Record<string, string> | null;
    }> {
        const cap = await this.shippingProfileService.getChannelDeliveryCapability(ctx);
        return {
            modes: cap.modes,
            bothSupported: cap.bothSupported,
            source: cap.source,
            facetValueIds: null, // Task 4A 落地后由 DeliveryFacetService 填充
        };
    }

    /** 单品/多品派生能力（后台商品表单「只读展示」用） */
    @Query()
    @Allow(Permission.Public)
    async variantDeliveryModes(
        @Ctx() ctx: RequestContext,
        @Args('variantIds', { type: () => [ID] }) variantIds: ID[],
    ): Promise<Array<{ variantId: string; modes: string[] }>> {
        const map = await this.shippingProfileService.getVariantDeliveryCapabilities(ctx, variantIds);
        return [...map.entries()].map(([variantId, cap]) => ({ variantId, modes: cap.modes }));
    }
}
```

- [ ] **Step 2: SDL 注册**

在 `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts` 的 shopApiExtensions 里，`extend type Query` 增加：

```
        channelDeliveryCapability: ChannelDeliveryCapability!
        variantDeliveryModes(variantIds: [ID!]!): [VariantDeliveryModes!]!
```

并在同一 SDL 里补两个 type（放在其它 type 定义旁）：

```
    type ChannelDeliveryCapability {
        modes: [String!]!
        bothSupported: Boolean!
        source: String!
        facetValueIds: JSON
    }
    type VariantDeliveryModes {
        variantId: ID!
        modes: [String!]!
    }
```

并把 `DeliveryCapabilityResolver` 加入该扩展的 `resolvers: [...]` 数组（与既有 shop resolvers 并列）。

- [ ] **Step 3: 启动并核验**

Run（在 `d:\zhao\vendure` 下启动本地开发实例），shop-api 执行：

```graphql
query { channelDeliveryCapability { modes bothSupported source facetValueIds } }
```
Expected: 返回对象；档案未配置的渠道 `bothSupported: true, source: "fallback"`；配置了「仅邮寄」的渠道 `modes: ["MAIL"], bothSupported: false`。

```graphql
query { variantDeliveryModes(variantIds: ["1"]) { variantId modes } }
```
Expected: 返回该变体派生的 modes（与档案配置一致）。

---

## Task 4A: facet 同步（Task 0 判定「通过」时执行）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\delivery-facet.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`、`…\shipping\shipping-profile-admin.resolver.ts`、`…\shipping\delivery-capability.resolver.ts`

- [ ] **Step 1: 实现 facet 保证 + 同步**

创建 `src/shipping/delivery-facet.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    Facet,
    FacetValue,
    ID,
    Logger,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
} from '@vendure/core';
import { ShippingProfileService } from './shipping-profile.service';
import { loggerCtx } from '../constants';

export const DELIVERY_FACET_CODE = 'delivery-mode';
const VALUE_CODES = { MAIL: 'mail', SELF_PICKUP: 'self-pickup' } as const;

/**
 * 配送方式 facet 同步器。
 *
 * 为什么用 facet：原生 search 的 facetValueIds 是「服务端过滤 + 正确 totalItems/分页」的
 * 现成通道（本仓 GetCollectionProducts 已在用）。过滤粒度 = ProductVariant，与派生源
 * （变体绑定档案）一致，因此同步目标定为**变体的 facetValues**。
 *
 * 索引新鲜度：必须走 ProductVariantService.update（会触发搜索索引更新）。
 * 直接 raw SQL 写 customFields（如 assignToVariants）不会更新索引，故变更后需调用本服务。
 */
@Injectable()
export class DeliveryFacetService {
    constructor(
        private connection: TransactionalConnection,
        private shippingProfileService: ShippingProfileService,
        private productVariantService: ProductVariantService,
        private channelService: ChannelService,
        private translator: TranslatorService,
    ) {}

    /** 幂等保证 facet 与两个 facet value 存在；返回 { MAIL: id, SELF_PICKUP: id } */
    async ensureFacet(ctx: RequestContext): Promise<Record<string, string>> {
        const facetRepo = this.connection.getRepository(ctx, Facet);
        let facet = await facetRepo.findOne({ where: { code: DELIVERY_FACET_CODE } as any });
        if (!facet) {
            facet = await facetRepo.save(new Facet({
                code: DELIVERY_FACET_CODE,
                isPrivate: false,
                translations: [{ languageCode: ctx.languageCode, name: '配送方式' }],
            } as any));
            Logger.info(`[DeliveryFacet] created facet ${DELIVERY_FACET_CODE}`, loggerCtx);
        }
        const valueRepo = this.connection.getRepository(ctx, FacetValue);
        const existing = await valueRepo.find({ where: { facet: { id: facet.id } } as any });
        const out: Record<string, string> = {};
        for (const [mode, code] of Object.entries(VALUE_CODES)) {
            let v = existing.find(x => x.code === code);
            if (!v) {
                v = await valueRepo.save(new FacetValue({
                    code,
                    facet,
                    translations: [{ languageCode: ctx.languageCode, name: mode === 'MAIL' ? '快递邮寄' : '到店自提' }],
                } as any));
            }
            out[mode] = String(v.id);
        }
        return out;
    }

    /** 全渠道重建：把渠道内所有变体的 facet 值按档案派生结果对齐（分批，避免一次性加载） */
    async rebuildChannel(ctx: RequestContext, batchSize = 200): Promise<{ scanned: number; updated: number }> {
        const ids = await this.connection
            .getRepository(ctx, 'ProductVariant')
            .createQueryBuilder('v')
            .innerJoin('v.channels', 'c', 'c.id = :cid', { cid: ctx.channelId })
            .select('v.id', 'id')
            .getRawMany<{ id: number }>();
        const facetIds = await this.ensureFacet(ctx);
        let updated = 0;
        for (let i = 0; i < ids.length; i += batchSize) {
            const slice = ids.slice(i, i + batchSize).map(r => String(r.id));
            updated += await this.syncVariants(ctx, slice, facetIds);
        }
        Logger.info(`[DeliveryFacet] rebuilt channel ${ctx.channelId}: scanned=${ids.length} updated=${updated}`, loggerCtx);
        return { scanned: ids.length, updated };
    }

    /** 同步指定变体：按派生能力设置 facetValues（走服务 → 索引自动更新） */
    async syncVariants(
        ctx: RequestContext,
        variantIds: ID[],
        facetIds?: Record<string, string>,
    ): Promise<number> {
        if (variantIds.length === 0) return 0;
        const ids = facetIds ?? (await this.ensureFacet(ctx));
        const caps = await this.shippingProfileService.getVariantDeliveryCapabilities(ctx, variantIds);
        const current = await this.connection
            .getRepository(ctx, 'ProductVariant')
            .createQueryBuilder('v')
            .leftJoinAndSelect('v.facetValues', 'fv')
            .where('v.id IN (:...ids)', { ids: variantIds.map(v => Number(v)) })
            .getMany();

        const wanted = new Set(Object.values(ids));
        let updated = 0;
        for (const v of current) {
            const cap = caps.get(String(v.id));
            if (!cap) continue;
            const keep = (v.facetValues ?? []).filter(fv => !wanted.has(String(fv.id)));
            const add = cap.modes.map(m => ids[m]).filter(Boolean);
            const next = [...new Set([...keep.map(fv => String(fv.id)), ...add])].sort();
            const before = [...new Set((v.facetValues ?? []).map(fv => String(fv.id)))].sort();
            if (next.join(',') === before.join(',')) continue;
            await this.productVariantService.update(ctx, [{ id: v.id as ID, facetValueIds: next as ID[] }]);
            updated += 1;
        }
        return updated;
    }
}
```

- [ ] **Step 2: 把 facetValueIds 接到能力查询**

`src/shipping/delivery-capability.resolver.ts` 改为注入 `DeliveryFacetService` 并填充：

```ts
    constructor(
        private shippingProfileService: ShippingProfileService,
        private deliveryFacetService: DeliveryFacetService,
    ) {}
```

```ts
        const cap = await this.shippingProfileService.getChannelDeliveryCapability(ctx);
        const facetValueIds = await this.deliveryFacetService.ensureFacet(ctx).catch(() => null);
        return { modes: cap.modes, bothSupported: cap.bothSupported, source: cap.source, facetValueIds };
```

- [ ] **Step 3: 变更钩子（档案/绑定变更后自动同步）**

`src/shipping/shipping-profile-admin.resolver.ts`：

1. 注入 `DeliveryFacetService`；
2. 在 `assignToVariants` mutation 里，`await this.service.assignToVariants(ctx, variantIds, profileId);` **之后**追加：

```ts
        await this.deliveryFacetService.syncVariants(ctx, variantIds);
```

3. 找到「修改档案方法配置 / 启停档案 / 设租户默认」的 mutation（分别调用 `replaceMethodConfigs` 的公开入口、`update`、`setTenantDefault`），在每次成功后追加：

```ts
        await this.deliveryFacetService.rebuildChannel(ctx);
```

> `rebuildChannel` 是分批全量重建，成本可控但不要在请求路径里对超大渠道频繁触发；同时提供后台手动入口（Task 8 Step 3）。

- [ ] **Step 4: 注册 provider / 启动 ensureFacet**

`src/plugin.ts`：把 `DeliveryFacetService`、`DeliveryCapabilityResolver` 加入 `providers` / `resolvers`；在 `onApplicationBootstrap` 末尾（`this.seed()` 之后）追加一次幂等初始化：

```ts
        try {
            const ctx = RequestContext.fromBootstrap(this, /* 默认 channel token 由 Vendure 提供 */);
            await this.deliveryFacetService.ensureFacet(ctx);
        } catch (e: any) {
            Logger.warn(`[DeliveryFacet] bootstrap ensureFacet skipped: ${e.message}`, loggerCtx);
        }
```

> 若 `RequestContext.fromBootstrap` 在当前 Vendure 版本不可用（TS 报错），改为：先 `channelService.getDefaultChannel()` 构造 `new RequestContext({ apiType: 'admin', channel, languageCode, isAuthorized: true, authorizedAsOwnerOnly: false })`。**两种写法择一，编译通过即可**。

- [ ] **Step 5: 端到端核验**

1. 本地起服，admin-api 执行一次档案方法配置保存（触发 `rebuildChannel`）；
2. shop-api 执行探针（同 Task 0 Step 2），把 `$ids` 传 `channelDeliveryCapability.facetValueIds.MAIL`：
```graphql
query Q($ids: [ID!]) {
  channelDeliveryCapability { facetValueIds bothSupported }
  search(input: { term: "", groupByProduct: true, take: 20, skip: 0, facetValueIds: $ids }) { totalItems items { productId } }
}
```
Expected: `totalItems` 小于不过滤时的值；翻到第 2 页无重复、无丢失。

---

## Task 4B: 自定义筛选入参 + 后置过滤（Task 0 判定「不通过」时执行）

> **代价已知并接受**：`totalItems` 不再准确 → C 端必须**隐藏总数**，且分页为「过滤后本地分页」。仅在 4A 不可行时使用。

- [ ] **Step 1: 后端加 `deliveryMode` 入参**

在 cjk-plugin 增一个 shop-api 查询（不复用原生 `search`，避免污染其计数语义）：

```
    extend type Query {
        searchByDelivery(input: DeliverySearchInput!): DeliverySearchResult!
    }
    input DeliverySearchInput {
        term: String
        take: Int
        skip: Int
        deliveryMode: String
    }
    type DeliverySearchResult {
        items: [JSON!]!
        scanned: Int!
        totalExact: Boolean!
    }
```

实现：内部调用 `search`（原生）取 `take * 3` 的候选，再用 `ShippingProfileService.getVariantDeliveryCapabilities` 逐条过滤，返回 `totalExact: false`。

- [ ] **Step 2: C 端隐藏总数**

在本路径下，筛选条渲染时同时传 `:hide-total="!totalExact"`，列表页不展示 `totalItems`。

（其余 Task 5~10 与 4A 路径完全一致，只是数据来源从 `facetValueIds` 换成 `deliveryMode`。）

---

## Task 5: C 端判定改读派生字段，`isProductVisible` 降级

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\productVisibility.ts`
- Modify: `d:\zhao\nshop\layers\base\gql\queries\product.gql`

- [ ] **Step 1: 判定改读 `deliveryModes`**

`productVisibility.ts` 的 `ProductLike` 与判定改为：

```ts
export type DeliveryMethod = 'MAIL' | 'SELF_PICKUP';

export interface VisibilityCtx {
  /** 当前城市；null=未授权 */
  city: string | null;
  /** 模块级配送选择 */
  delivery: DeliveryMethod;
}

export interface ProductLike {
  /** 服务端派生的配送能力（档案真源，facet 同步结果）；缺省视为两者都支持（兜底） */
  deliveryModes?: DeliveryMethod[] | null;
  customFields?: {
    belongCity?: string | null;
    serviceCities?: Array<string | null> | null;
    /** @deprecated 手工字段，仅历史兼容；筛选一律以 deliveryModes 为准 */
    deliveryMethods?: DeliveryMethod[] | null;
  } | null;
}

/**
 * 城市超区提示用（纯展示），**不再承担筛选职责**。
 * 筛选已改为服务端执行（facet / deliveryMode 入参），见 GoodsSingleList。
 */
export function isProductVisible(p: ProductLike | null | undefined, ctx: VisibilityCtx): boolean {
  const cf = p?.customFields ?? {};
  const serviceCities: string[] = (cf.serviceCities ?? []).map((s) => s?.trim() ?? '').filter(Boolean);
  const belongCity: string = cf.belongCity?.trim() ?? '';
  const methods: DeliveryMethod[] = p?.deliveryModes?.length
    ? p.deliveryModes
    : cf.deliveryMethods?.length
      ? cf.deliveryMethods
      : ['MAIL', 'SELF_PICKUP'];
  const isMail = methods.includes('MAIL');
  const isPickup = methods.includes('SELF_PICKUP');
  const map = (s: string[]) => s.some((x) => x === ctx.city);
  const canMail = isMail && (!ctx.city || !serviceCities.length || map(serviceCities));
  const canPickup = isPickup && !!belongCity && ctx.city === belongCity;
  return ctx.delivery === 'SELF_PICKUP' ? canPickup : canMail;
}
```

- [ ] **Step 2: 列表查询带出 `deliveryModes`**

`layers/base/gql/queries/product.gql` 的 `SearchProducts` 增参（Step 1 of Task 6 同时改调用点）：

```graphql
query SearchProducts(
  $term: String!
  $skip: Int
  $take: Int
  $collectionSlug: String
  $facetValueIds: [ID!]
) {
  search(
    input: {
      term: $term
      groupByProduct: true
      skip: $skip
      take: $take
      collectionSlug: $collectionSlug
      facetValueIds: $facetValueIds
    }
  ) {
    totalItems
    items {
      ...ProductSearchFragment
    }
  }
}
```

- [ ] **Step 3: `ProductSearchFragment` 增派生字段**

确认 fragment（同目录 `product.gql`）内增补 `facetValueIds`（原生 Product 字段，存在且无需后端改造）：

```graphql
fragment ProductSearchFragment on SearchResult {
  productId
  productName
  slug
  productAsset { id preview }
  currencyCode
  priceWithTax { ... }
  facetValueIds
  customFields { belongCity serviceCities }
}
```
（`priceWithTax` 等既有字段保持不动，只**新增** `facetValueIds` 与 `customFields` 选择集。）

在 C 端把 `facetValueIds` 折算成 `deliveryModes`（facet value id 与 `channelDeliveryCapability.facetValueIds` 比对）：

```ts
// layers/base/app/utils/delivery-modes.ts（新建）
import type { DeliveryMethod } from './productVisibility';

/** 由结果的 facetValueIds + 渠道能力映射，折算派生能力；无匹配 → 兜底两者都支持 */
export function modesFromFacetIds(
  facetValueIds: Array<string | number> | null | undefined,
  map: Record<string, string> | null | undefined,
): DeliveryMethod[] {
  if (!map) return ['MAIL', 'SELF_PICKUP'];
  const set = new Set((facetValueIds ?? []).map(String));
  const out: DeliveryMethod[] = [];
  if (map.MAIL && set.has(String(map.MAIL))) out.push('MAIL');
  if (map.SELF_PICKUP && set.has(String(map.SELF_PICKUP))) out.push('SELF_PICKUP');
  return out.length ? out : ['MAIL', 'SELF_PICKUP'];
}
```

- [ ] **Step 4: 类型生成**

Run（在 `d:\zhao\nshop` 下）：
```bash
pnpm codegen
```
Expected: `types/default.ts` 更新，`SearchProductsQueryVariables` 含 `facetValueIds`，`ProductSearchFragment` 含 `facetValueIds`。若仓库无 `codegen` 脚本，按既有方式（Grep 既有计划中生成的命令）执行。

---

## Task 6: 首页筛选条 —— 渲染条件 + 服务端筛选

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\composables\useModuleDelivery.ts`
- Modify: `d:\zhao\nshop\layers\base\app\components\home\blocks\GoodsSingleList.vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\home\blocks\GoodsMasonryGrid.vue`
- Modify: 首页取数处 `d:\zhao\nshop\app\pages\index.vue`（及首页构建器渲染器）

- [ ] **Step 1: `useModuleDelivery` 增渠道双能力查询**（★ 已实现，**改为不依赖 facet 映射**）

已落地：`nshop/layers/base/app/composables/useModuleDelivery.ts` 追加 `useChannelDeliveryCapability()`，新建
`nshop/layers/base/gql/queries/channel-delivery.gql`（`query ChannelDeliveryCapability { channelDeliveryCapability { modes bothSupported source } }`）。

```ts
showDeliveryPicker = capability?.bothSupported ?? true   // 能力未知时保守显示，不倒退既有行为
lockedMode = (!cap || cap.bothSupported) ? null : cap.modes?.[0] ?? null
```

> **与设计稿的差异**：原稿把渲染条件写成「双能力 **且** facet 映射可用」，会导致 facet 尚未同步时**筛选条永久消失**（比现状更差）。
> 现改为**只按渠道派生能力**判定（符合记忆中的硬规则：「筛选条仅当渠道同时支持邮寄与自提时才渲染」），facet 只影响是否走服务端过滤。

- [ ] **Step 2: `GoodsSingleList`/`GoodsMasonryGrid`/`JdProductGrid` 加渲染条件与单方式锁定**（★ 已实现）

三个区块均：
```ts
const { showDeliveryPicker, lockedMode } = useChannelDeliveryCapability();
watch(lockedMode, (m) => { if (m) setDelivery(m); }, { immediate: true });
```
模板渲染条件改为 `v-if="filterEnabled && config.bar.visible && showDeliveryPicker"`。

**保留既有本地 `isProductVisible` 过滤作为兜底**（Step 3 未落地，见下）。

- [ ] **Step 3（★ 暂缓，待运行时验证后再做）: 首页取数改传 `facetValueFilters` 并在切换时重查**

原稿写 `facetValueIds`（已废弃，须改 `facetValueFilters: [{ or: activeFacetIds }]`）。暂缓原因：
1. 取数在 `GoodsFloor.vue` / `app/pages/index.vue` 的 SSR `useAsyncData` 内、按固定 key 缓存，改成「随选择变化重查」会把 SSR key 依赖到 localStorage 的选择值，无法在本地起服验证（**改错了会让首页商品块直接空白**）；
2. 首页商品块 `take=10/20` **无分页**，本地过滤不会产生「总数/分页错」的问题——服务端过滤的收益主要在多页列表，不在首页块。

**部署后按此顺序补做**：后端部署 → 刷新/打补丁 schema → 前端改为 `facetValueFilters` + `refresh()` → 手机视口验收切「自提」后 `totalItems` 与命中项正确。

- [ ] **Step 5: 回归**

Run（在 `d:\zhao\nshop` 下）：
```bash
pnpm test
```
Expected: 既有单测全绿（`merge-config` 等不受影响）。

Run: `pnpm typecheck`
Expected: 无新增错误。

---

## Task 7: 结算页单方式锁定

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\BoxDeliveryBlock.vue`

- [ ] **Step 1: 单方式隐藏单选、直接锁定**

把模板中 `<template v-if="(box.availableShippingMethodIds ?? []).length">` 整段替换为：

```vue
        <template v-if="(box.availableShippingMethodIds ?? []).length">
          <!-- 单方式：不渲染选择框，直接锁定该方式（并说明原因） -->
          <view v-if="boxMethodIds(box).length === 1">
            <p class="mb-1 text-xs text-neutral-500">{{ t("messages.checkout.boxLogisticsOption") }}</p>
            <p class="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
              {{ methodName(boxMethodIds(box)[0]) }}
            </p>
          </view>
          <template v-else>
            <p class="mb-1 text-xs text-neutral-500">{{ t("messages.checkout.boxLogisticsOption") }}</p>
            <URadioGroup
              :model-value="methodSel[box.boxKey] ?? ''"
              @update:model-value="(v: string) => chooseLogistics(box, v)"
              indicator="hidden"
              variant="table"
              orientation="horizontal"
              :items="boxMethodIds(box).map((id) => ({ label: methodName(String(id)), value: String(id) }))"
              :ui="{ item: 'w-full' }"
              :disabled="orderStore.loading"
            />
          </template>
        </template>
```

> 若该文件用的是原生 HTML 标签（当前是 `<div>/<p>`），把上面的 `<view>` 换成 `<div>`、`<p>` 换成 `<p>` 保持一致风格——**按文件既有标签体系改写，不要引入 `<view>`**。

- [ ] **Step 2: 脚本补 `boxMethodIds` 并让锁定方式参与提交校验**

在 `<script setup>` 内追加：

```ts
/** 该箱可用方式 id 列表（同时兼容 availableShippingMethodIds 与 availableShippingMethods 两种返回形态） */
function boxMethodIds(box: OrderBoxInfo): string[] {
  const byIds = (box.availableShippingMethodIds ?? []).map(String);
  if (byIds.length) return byIds;
  return (box.availableShippingMethods ?? []).map((m) => String(m.id));
}
```

并把 `onMounted` 的兜底与 `submitFns.submitDelivery` 中的默认取值改为优先单方式：

```ts
onMounted(() => {
  for (const box of allDeliveryBoxes.value) {
    if (methodSel[box.boxKey]) continue;
    const ids = boxMethodIds(box);
    const m = ids.length === 1 ? ids[0] : defaultMethodId(box);
    if (m) {
      methodSel[box.boxKey] = m;
      void applyBox(box, m, true);
    }
  }
});
```

```ts
flow.submitFns.submitDelivery = async () => {
  for (const box of allDeliveryBoxes.value) {
    const ids = boxMethodIds(box);
    const m = methodSel[box.boxKey] ?? (ids.length === 1 ? ids[0] : defaultMethodId(box));
    if (!m) { /* 原错误分支保持不变 */ }
    await applyBox(box, m, true);
    /* 原错误处理保持不变 */
  }
  return true;
};
```

（保留既有 toast/error 分支原文，只改 `m` 的取值表达式。）

- [ ] **Step 3: 验收**

手机视口进入结算页：物流箱只有一种可用方式时**看不到单选组**、且该方式是已生效状态；两种可用方式时仍显示单选组。

---

## Task 8: web-admin 改造

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\components\ProductForm.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\shipping\profile\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` / `en.json`

- [ ] **Step 1: 商品表单配送方式改只读**

`ProductForm.vue` 中 `deliveryMethods` 的手工勾选 UI 替换为只读展示（配送档案选择器**保留**，它是能力的输入端）：

```vue
      <view class="wa-cell">
        <text class="wa-lbl">{{ $t('productForm.deliveryDerived') }}</text>
        <text class="wa-readonly">{{ derivedText }}</text>
      </view>
      <view class="wa-cell link" @tap="goShippingProfile">
        <text class="wa-lbl">{{ $t('productForm.deliveryGotoProfile') }}</text>
        <text class="wa-arrow">›</text>
      </view>
```

脚本：

```ts
const derivedModes = ref<DeliveryMethod[] | null>(null);

const derivedText = computed(() => {
  const m = derivedModes.value;
  if (!m) return locale.t('productForm.deliveryUnknown');
  if (m.length === 2) return locale.t('productForm.deliveryBoth');
  return m[0] === 'MAIL' ? locale.t('productForm.deliveryMailOnly') : locale.t('productForm.deliveryPickupOnly');
});

async function loadDerivedModes() {
  const ids = (variantIds.value ?? []).map(String);
  if (!ids.length) { derivedModes.value = null; return; }
  try {
    const r = await getAdminClient().request<{ variantDeliveryModes: Array<{ variantId: string; modes: string[] }> }>(
      `query ($ids: [ID!]!) { variantDeliveryModes(variantIds: $ids) { variantId modes } }`,
      { ids },
    );
    const set = new Set<string>();
    for (const row of r.variantDeliveryModes ?? []) for (const m of row.modes ?? []) set.add(m);
    derivedModes.value = set.size ? ([...set] as DeliveryMethod[]) : null;
  } catch {
    derivedModes.value = null; // 查不到就显示「暂不可判定」，不阻塞保存
  }
}

function goShippingProfile() {
  uni.navigateTo({ url: '/pages/shipping/profile/index' });
}
```

> `variantDeliveryModes` 在 admin-api 里也可用：把 Task 3 的 resolver 同时注册到 **adminApiExtensions**（`variantDeliveryModes` 只读，权限沿用既有商品读权限）。若不便双注册，则改为在 admin 侧直接用 `shippingProfileId` + `channelDeliveryCapability` 粗判，并在 UI 注明「按当前档案近似」。

保存 payload 中**不再写入** `deliveryMethods`（历史值保留在库中不动）。

- [ ] **Step 2: 配送档案页能力摘要 + 未配置告警**

`pages/shipping/profile/index.vue` 顶部插入：

```vue
    <view class="cap-card" :class="{ warn: !hasProfiles }">
      <text class="cap-title">{{ $t('shippingProfile.capTitle') }}</text>
      <text class="cap-value">{{ capText }}</text>
      <text v-if="!hasProfiles" class="cap-warn">{{ $t('shippingProfile.capNoProfile') }}</text>
    </view>
    <view v-if="hasProfiles" class="cap-actions">
      <text class="cap-btn" @tap="onRebuildIndex">{{ rebuilding ? $t('shippingProfile.rebuilding') : $t('shippingProfile.rebuildIndex') }}</text>
    </view>
```

脚本：

```ts
const hasProfiles = ref(true);
const capModes = ref<string[]>([]);
const rebuilding = ref(false);

const capText = computed(() => {
  const m = capModes.value;
  if (m.length === 2) return locale.t('shippingProfile.capBoth');
  if (m.length === 1) return m[0] === 'MAIL' ? locale.t('shippingProfile.capMailOnly') : locale.t('shippingProfile.capPickupOnly');
  return locale.t('shippingProfile.capBoth');
});

async function loadCapability() {
  try {
    const r = await getAdminClient().request<{ channelDeliveryCapability: { modes: string[]; source: string } }>(
      `query { channelDeliveryCapability { modes source } }`,
    );
    capModes.value = r.channelDeliveryCapability?.modes ?? [];
    hasProfiles.value = r.channelDeliveryCapability?.source !== 'fallback';
  } catch {
    hasProfiles.value = true;
  }
}

async function onRebuildIndex() {
  rebuilding.value = true;
  try {
    await getAdminClient().request(`mutation { rebuildDeliveryFacetIndex }`);
    uni.showToast({ title: locale.t('shippingProfile.rebuilt'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('shippingProfile.rebuildFailed')), icon: 'none' });
  } finally {
    rebuilding.value = false;
  }
}
```

- [ ] **Step 3: 后端补 `rebuildDeliveryFacetIndex` mutation（admin）**

在 `delivery-facet.service.ts` 的 resolver（可并入 `shipping-profile-admin.resolver.ts`）加：

```ts
    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    async rebuildDeliveryFacetIndex(@Ctx() ctx: RequestContext): Promise<boolean> {
        await this.deliveryFacetService.rebuildChannel(ctx);
        return true;
    }
```

并在 adminApiExtensions SDL 的 `extend type Mutation` 里加 `rebuildDeliveryFacetIndex: Boolean!`。

> **走 Task 4B 时**：本 Step 与 Step 2 的「重建索引」按钮都不需要，改为在档案页显示「筛选索引未启用（后置过滤模式，总数不可用）」提示。Step 1 的 `derivedText` 改为读 `variantDeliveryModes`（4B 路径同样提供该查询，不依赖 facet）。

- [ ] **Step 4: i18n 双语**

`zh-Hans.json` 新增（`productForm` 与 `shippingProfile` 两个段）：

```json
  "productForm": {
    "deliveryDerived": "配送方式（由配送档案推导）",
    "deliveryGotoProfile": "去配送档案修改",
    "deliveryUnknown": "暂不可判定（未绑定档案或变体未保存）",
    "deliveryBoth": "邮寄 + 自提",
    "deliveryMailOnly": "仅邮寄",
    "deliveryPickupOnly": "仅自提"
  },
  "shippingProfile": {
    "capTitle": "本店配送能力",
    "capBoth": "同时支持邮寄与自提",
    "capMailOnly": "仅邮寄",
    "capPickupOnly": "仅自提",
    "capNoProfile": "配送档案未配置，商品配送能力暂按「两者都支持」处理；请先配置档案。",
    "rebuildIndex": "重建配送筛选索引",
    "rebuilding": "重建中…",
    "rebuilt": "索引已重建",
    "rebuildFailed": "重建失败"
  },
```

`en.json` 同步同名键：

```json
  "productForm": {
    "deliveryDerived": "Delivery (derived from shipping profile)",
    "deliveryGotoProfile": "Edit shipping profile",
    "deliveryUnknown": "Not determinable (no bound profile or variants unsaved)",
    "deliveryBoth": "Mail + pickup",
    "deliveryMailOnly": "Mail only",
    "deliveryPickupOnly": "Pickup only"
  },
  "shippingProfile": {
    "capTitle": "Store delivery capability",
    "capBoth": "Supports both mail and pickup",
    "capMailOnly": "Mail only",
    "capPickupOnly": "Pickup only",
    "capNoProfile": "No shipping profile configured; delivery capability falls back to \"both supported\". Configure a profile first.",
    "rebuildIndex": "Rebuild delivery filter index",
    "rebuilding": "Rebuilding…",
    "rebuilt": "Index rebuilt",
    "rebuildFailed": "Rebuild failed"
  },
```

- [ ] **Step 5: 校验与构建**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
node -e "const z=require('./src/locale/zh-Hans.json'),e=require('./src/locale/en.json');for(const s of ['productForm','shippingProfile']){const m=Object.keys(z[s]).filter(k=>!(k in e[s]));if(m.length)throw new Error(s+' missing: '+m);}console.log('i18n OK')"
```
Expected: `i18n OK`。

Run: `pnpm build:h5`
Expected: 构建成功。

---

## Task 9: 端到端验收（手机视口 390×844、dpr=2）

- [ ] **Step 1: 逐条跑 §9 验收标准**

1. 在配送档案里移除自提方式 → 首页筛选条**消失**、列表按邮寄查询；结算页不显示配送方式选择框且锁定邮寄。
2. 档案同时含邮寄与自提 → 首页筛选条出现；选「自提」后结果数与分页在服务端一致（翻页无重复、无丢失），`totalItems` 与实际条数吻合。
3. 未维护手工字段的商品，不再在两种方式下都出现（以档案为准）。
4. 商品表单中配送方式为只读，显示结果与档案一致。
5. 未配置档案的渠道：能力回退为「两者都支持」，C 端行为与现状一致，后台出现告警。
6. 全部截图存入 `d:\zhao\vshop\web-admin\src\static\manual\shots\`，命名 `delivery-01-<描述>.png` … `delivery-06-<描述>.png`。

- [ ] **Step 2: API 回归**

按 Task 3 Step 3、Task 4A Step 5 的探针再跑一遍，确认：
- `channelDeliveryCapability` 三态（fallback / single / both）正确；
- `search(facetValueIds)` 的 `totalItems` 随筛选变化，翻页正确。

- [ ] **Step 3: 手册章节**

在 `d:\zhao\vshop\web-admin\docs\theme-admin-manual\theme-admin-manual.html`（或新建 `docs\delivery-admin-manual\`）追加一节，含：能力派生规则表（mode → 能力）、筛选条渲染条件（五级配置 AND 双能力）、档案配置如何影响 C 端、索引重建入口、上述截图。

---

## Task 10: 部署

- [ ] **Step 1: 后端**

本地（在 `d:\zhao\vendure` 下）：
```bash
pnpm --filter @vendure/cjk-plugin build
git add vendure/packages/cjk-plugin
git commit -m "feat(delivery): 配送能力由档案派生 + facet 服务端筛选 + 单能力收口"
git push
```
服务器：`cd <vendure 目录> && git pull && pm2 restart <vendure 进程名>`。
Expected: 启动日志出现 facet 初始化（或 bootstrap skip 告警），无 schema 报错。

- [ ] **Step 2: C 端**

nshop 本地构建后按既有方式发布；vshop 同步发布。**禁止服务器构建。**

- [ ] **Step 3: web-admin**

```bash
pnpm build:h5
node scripts/deploy.mjs
```

- [ ] **Step 4: 上线后补一次索引重建**

线上 admin-api 执行 `mutation { rebuildDeliveryFacetIndex }`，确保存量变体的 facet 与档案一致（首次上线必须执行一次）。

---

## 自审记录

**1. Spec 覆盖**

| Spec 章节 | 对应 Task |
|---|---|
| §3 派生层（`delivery-capability.ts` + 解析顺序 + 渠道级并集 + fallback） | Task 1、Task 2 |
| §4 暴露层（`Product/ProductVariant.deliveryModes`、`SearchResult` 带出、`channelDeliveryCapability`、旧字段废弃） | Task 3、Task 5 Step 3（用 `facetValueIds` 折算，避免重写搜索管线） |
| §5 服务端筛选（`deliveryMode` 入参 / 优先 facet） | Task 0（决策门）、Task 4A / 4B、Task 6 |
| §6.1 首页筛选条渲染条件 = 五级配置 AND 双能力 | Task 6 Step 2 |
| §6.2 结算页单方式隐藏选择 | Task 7 |
| §6.3 城市维度保留 | Task 5 Step 1（`belongCity` 条件原文保留） |
| §7.1 商品表单只读展示 + 跳转 | Task 8 Step 1 |
| §7.2 档案页能力摘要 + 未配置告警 | Task 8 Step 2 |
| §8 存量兼容（不删列、以派生为准、请求级缓存） | Task 2（批量查询即缓存策略）、Task 8 Step 1（不再写 `deliveryMethods`） |
| §9 验收 6 条 | Task 9 |
| §11 交付与部署 | Task 10 |

**与设计稿的事实性修正（重要，实现时以此为准）**

1. §3 写的 `delivery → MAIL` **在本仓不存在**：真实 mode 为 `mail`/`pickup`/`store`/`employee`（默认 `pickup`）。本计划按真实取值实现（Task 1）。
2. §3 写的「按渠道预取 + 请求级缓存」：实际落地为 `getMethodConfigsByProfiles` 的**一次批量查询**（Task 2）。
3. §5 的 facet 优先路径，本仓已有 `facetValueIds` 的**在用先例**（`GetCollectionProducts`），故 Task 0 的探针只需验证**粒度**（variant vs product）与 `groupByProduct` 下的计数正确性，而非从零可行性；Task 0 Step 3 已写明两种粒度的落地差异。
4. §4 的「`Product.deliveryModes` 走 resolver 字段解析」改成了 **`facetValueIds` + 渠道映射在 C 端折算**：避免新增 `Product`/`SearchResult` 的 schema 扩展与 N+1 解析，且 `facetValueIds` 本就是原生 `SearchResult` 字段。

**2. 占位扫描**：无 TBD / TODO / 「类似 Task N」。两处需要「按现场择一」的地方都给了**两套完整代码与判定标准**：Task 4A Step 4 的 `RequestContext` 构造、Task 7 Step 1 的标签体系（`view` vs `div`）。Task 0 是显式决策门，两条分支（4A/4B）均已完整写明，不是占位。

**3. 命名一致性**：`DeliveryMode`（`'MAIL' \| 'SELF_PICKUP'`）、`DeliveryCapability{modes,bothSupported,source}`、`modesFromMethodConfigs`、`capabilityFromMethodConfigs`、`unionCapability`、`getChannelDeliveryCapability`、`getVariantDeliveryCapabilities`、`getMethodConfigsByProfiles`、`DeliveryFacetService.{ensureFacet,syncVariants,rebuildChannel}`、`channelDeliveryCapability`（GraphQL）、`variantDeliveryModes`（GraphQL）、`rebuildDeliveryFacetIndex`（mutation）、`useChannelDeliveryCapability` / `showDeliveryPicker` / `facetValueIds` / `lockedMode`、`modesFromFacetIds` —— 在定义处与使用处拼写一致。facet `code` 常量 `delivery-mode` 与两个 value code `mail` / `self-pickup` 在 Task 4A 与 Task 5 Step 3 中一致。