# 商品管理增强（品牌 / 营销 / 规格变体）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 e.joho.cn/guanli（web-admin）把商品添加/修改增强为「分页签（基本信息/品牌营销/规格变体）」，新增品牌库选择、中国本地化营销（划线价/促销期/标签/卖点/关联促销）、多规格 SKU 矩阵；后端在 Vendure packages 内复用原生与既有插件能力、仅补零散字段，避免重复实现。

**Architecture:** 复用 Vendure 原生 Facet（品牌）、ProductOptionGroup + createProductVariants（规格矩阵）、flash-sale/coupon（营销结算）；本期后端只新增 ProductVariant 与 Product 的少量 customFields + brand Facet 幂等初始化。前端把 `ProductForm.vue` 重构为三 tab 子组件，扩展 `apis/product.ts` 契约，新增矩阵生成 composable。只维护中文(zh_Hans)，其余语言走 Vendure translations / LocalizedString 预留。

**Tech Stack:** Nuxt/uni-app(HBuilder X, web-admin)、Vue3、Vendure（TypeORM/GraphQL）、cjk-plugin / marketplace-plugin（Vendure packages）、Linux 服务器部署（cm 铁律：本地构建提交 dist，服务器仅 pull+restart）

**依据 Spec:** `d:\zhao\vshop\docs\superpowers\specs\2026-08-29-product-manage-enhancement-design.md`

**构建/部署约束（must read）：**
- web-admin 是 HBuilder X uni-app 环境，**禁止 agent 执行 `pnpm/npm install` 或 build**；改动后由用户用 HBuilder X 手动编译。agent 只改源码、期间用 devProxy 冒烟只读验证。
- vendure packages（cjk-plugin/marketplace-plugin）为 tsc 构建，可在本地 `d:\zhao\vendure\packages\{plugin}` 目录 `npm run build`（cjk-plugin 产物在 `lib/`，用根 `node_modules/.bin/tsc.cmd -p <plugin>/tsconfig.build.json` 更稳）。
- 部署铁律：产物 dist/lib 提交 git，服务器 git pull + pm2 restart，**绝不在服务器构建**。

---

# Part A · Vendure 后端（d:\zhao\vendure\packages）

## Task 1: ProductVariant 促销字段（划线价/促销期）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\product-variant-custom-fields.ts`

- [ ] **Step 1: 在 `ProductVariant` 数组中追加三个字段**（在现有 `paymentProfileId` 项之后）

```ts
        {
            name: 'listPrice',
            type: 'int',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '划线价/原价（分）' },
                { languageCode: LanguageCode.en, value: 'List price (cents)' },
            ],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: '前台划线展示，为 null 不显示；仅展示层，实付仍取 price' },
            ],
        },
        {
            name: 'saleStart',
            type: 'datetime',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '限时促销开始' },
                { languageCode: LanguageCode.en, value: 'Sale start' },
            ],
        },
        {
            name: 'saleEnd',
            type: 'datetime',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '限时促销结束' },
                { languageCode: LanguageCode.en, value: 'Sale end' },
            ],
        },
```

注意：`type: 'datetime'` 在 PostgreSQL 会映射为 timestamp，SQLite 映射 datetime；保持 `nullable: true`，不设 `defaultValue`。

- [ ] **Step 2: 本地编译验证**

```bash
cd d:\zhao\vendure
.npm/node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
# 或在插件目录 npm run build
Select-String "lib/src/shipping/product-variant-custom-fields.js" -Pattern "listPrice"
```
Expected: 输出命中 `listPrice`，无 TS 报错。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/shipping/product-variant-custom-fields.ts
git commit -m "feat(cjk): 商品变体增加划线价与限时促销期字段"
```

---

## Task 2: Product 营销字段（标签/卖点）

**Files:**
- Modify: `d:\zhao\vendure\packages\marketplace-plugin\src\custom-fields.ts`

- [ ] **Step 1: 在 `Product` 数组追加两个字段**（在现有 `internalCode` 之后）

```ts
        {
            name: 'marketingTags',
            type: 'text',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '营销标签（JSON 数组）' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '存 JSON 字符串数组，如 ["new","hot"]；仅码，前端按语言映射 label' }],
        },
        {
            name: 'sellingPoint',
            type: 'localeString',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '卖点/促销语' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '多语言卖点，本期仅维护 zh_Hans，其余语言槽位预留' }],
        },
```

> `type: 'localeString'` 令 vendure 以 `LocaleString` 类型驱动，天然生成多语言翻译接口（LocalizedString），满足「其他语言预留」。
> `marketingTags` 用 `text` + JSON 字符串（与既有 `description` 用 `localeString` 区分开；不引入 `json` 类型依赖以减少兼容风险）。

- [ ] **Step 2: 确认已通过 `mergeFields` 自动合并**（无需改 plugin.ts，因配置文件里已 `mergeFields(config.customFields.Product, marketplaceCustomFields.Product!)`，按 name 去重）

- [ ] **Step 3: 本地编译验证**

```bash
cd d:\zhao\vendure
.npm/node_modules/.bin/tsc.cmd -p packages/marketplace-plugin/tsconfig.build.json
Select-String "lib/src/custom-fields.js" -Pattern "marketingTags"
```
Expected: 命中 `marketingTags`，无 TS 报错。

- [ ] **Step 4: Commit**

```bash
cd d:\zhao\vendure
git add packages/marketplace-plugin/src/custom-fields.ts
git commit -m "feat(marketplace): 商品增加营销标签与卖点字段"
```

---

## Task 3: 品牌库（brand Facet）幂等初始化

**Files:**
- Modify: `d:\zhao\vendure\packages\marketplace-plugin\src\plugin.ts`
- Create(optional): `d:\zhao\vendure\packages\marketplace-plugin\src\brand.service.ts`

- [ ] **Step 1: 构造注入 `FacetService`**（在 `plugin.ts` 的 `imports` 顶部加 `FacetService`，并在类构造参数追加）

```ts
// imports 增加
import { FacetService } from '@vendure/core';
// 构造新增（放在 requestContextService 后）
private requestContextService: RequestContextService,
private facetService: FacetService,
) {}
```

- [ ] **Step 2: 新增幂等 seed 方法并在 `onApplicationBootstrap()` 内调用**

在 `onApplicationBootstrap()` 首行（`ensurePlatformOpsRole` 之前）加入 `await this.ensureBrandFacet();`，并新增方法：

```ts
private async ensureBrandFacet(): Promise<void> {
    try {
        const ctx = await this.requestContextService.create({
            apiType: 'admin',
            // 取默认 channel（superadmin 上下文），保证品牌库全局可见
        });
        const existing = await this.facetService.findByCode(ctx, 'brand').catch(() => null);
        if (existing) return; // 幂等：已存在则跳过
        const facet = await this.facetService.create(ctx, {
            code: 'brand',
            name: '品牌',
            isPrivate: false,
            values: [],
        });
        await this.facetService.update(ctx, {
            id: facet.id,
            translations: [{ languageCode: LanguageCode.zh_Hans, name: '品牌' }],
        });
    } catch (e) {
        // 初始化失败仅告警不阻塞启动
    }
}
```

> 若 `FacetService.findByCode` 签名在当前 Vendure 版本不可用，改用 `this.connection.getRepository(Facet).findOne({ where: { code: 'brand' } })`（`TransactionalConnection` 已注入）。此步以编译通过为准。

- [ ] **Step 3: 编译 + 提交**

```bash
cd d:\zhao\vendure
.npm/node_modules/.bin/tsc.cmd -p packages/marketplace-plugin/tsconfig.build.json
Select-String "lib/src/plugin.js" -Pattern "ensureBrandFacet"
git add packages/marketplace-plugin/src/plugin.ts
git commit -m "feat(marketplace): 品牌库 Facet(brand) 幂等初始化"
```
Expected: 命中 `ensureBrandFacet`，无 TS 报错。

---

## Task 4: 后端整体验证（冒烟）

**Files:** —（仅运行验证）

- [ ] **Step 1: 本地启动（或连线下测试环境）后用 GraphQL 冒烟**

本地未起时 `DEV_PROXY` 连线上 admin-api 验证 schema 含新字段：

```bash
cd d:\zhao\nshop   # 若走 devProxy；或直接在本地起 vendure dev-server
```
用 admin token 查：`product(id){ customFields { marketingTags sellingPoint } variants { customFields { listPrice saleStart saleEnd } } }` 与 `facets(options:{filter:{code:{eq:"brand"}}}){ items { id code } }`。
Expected: 两个 customFields 块可查询（值可为 null），`facets` 返回 code=brand 一项（若已成功 seed）。

- [ ] **Step 2: 提交后端整体（若 Step1 无改动则跳过）**

```bash
cd d:\zhao\vendure
git log --oneline -3
```
Expected: 最近 3 条为 Task1-3 的提交。

---

# Part B · web-admin 前端（d:\zhao\vshop\web-admin）

> 构建由用户 HBuilder X 手动执行；本 Agent 只改源码并用 devProxy 只读冒烟。每个 Task 末 commit 到 `d:\zhao\vshop`。

## Task 5: 扩展商品 API 契约

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\product.ts`

- [ ] **Step 1: 扩展类型与读取（恢复品牌/营销/矩阵编辑态）**

在 `ProductFull` 增加字段；在 `fetchProductFull` 的 query 与映射补品牌 facetValue、product customFields、所有 variant（含 optionValues/促销字段）：

```ts
// ProductFull 增加
  facets?: Array<{ id: string; code: string; name: string; facetValues: Array<{ id: string; code: string; name: string }> }> | null;
  customFields?: {
    shippingProfileId?: string | null;
    paymentProfileId?: string | null;
    marketingTags?: string | null;      // JSON 字符串数组
    sellingPoint?: string | null;
  } | null;
  variants?: Array<VariantFull> | null;
```
在 `fetchProductFull` GUID 后追加需要的返回字段（保持现有返回字段名不破坏下游调用）：
- Product 上：`facetValues { id code name facetValue { ... } }`、`customFields { marketingTags sellingPoint }`
- Variant 上：`customFields { shippingProfileId paymentProfileId listPrice saleStart saleEnd } optionValues { id code name }`

> 冒烟校准项：品牌关联读取用 Product 的 `facetValues`（`filter: facetValue`）而非零散 facets 字段，具体以线上 schema 为准，若 `facetValues` 不可用则回退查询 `facetValues` 的 Translations。

- [ ] **Step 2: 品牌库查询函数**

```ts
export interface BrandOption { id: string; name: string; }
export async function fetchBrands(term?: string): Promise<BrandOption[]> {
  const { facets } = await getAdminClient().request<{ facets: { items: Array<{ facetValues: Array<{ id: string; code: string; name: string }> }> } }>(
    `query Brands($term: String) { facets(options: { filter: { code: { eq: "brand" } }, take: 100 }) {
        items { facetValues { id code name } }
      } }`,
  );
  const values = (facets?.items?.[0]?.facetValues ?? []).filter(f => !term || f.name.includes(term));
  return values.map(f => ({ id: f.id, name: f.name }));
}
```

- [ ] **Step 3: 保存编排支持品牌/营销/矩阵**（新增 `ProductSaveInput` 可选字段，并在 `updateProductFull`/`createProductFull` 补品牌 facets 与营销 customFields）

```ts
// ProductSaveInput 增加（均可选，缺省不传保持现有行为）
  brandConfig?: { brandFacetValueId?: string | null };
  customFields?: { marketingTags?: string[]; sellingPoint?: string };
```
- 在「商品图片与翻译」mutation 中额外传入 `facets` 与 `customFields`：新增一个独立 `updateProduct` 调用（避免污染既有 mutation），仅当新字段有值时调用：
  - `input: { id, facets: brandConfig?.brandFacetValueId ? [brandFacetValueId] : [], customFields: { marketingTags: JSON.stringify(customFields?.marketingTags ?? []), sellingPoint: customFields?.sellingPoint ?? '' } }`
- 矩阵由 Task 8 的 composable 负责生成 `updateProductVariants` 批量输入（本任务只预留 `variantsMatrix?: Array<{ optionValueIds: string[]; sku: string; price: number; stock: number; listPrice?: number }>` 于 save 内部使用）。

- [ ] **Step 4: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/apis/product.ts
git commit -m "feat(web-admin): 商品 API 支持品牌/营销/促销字段"
```

---

## Task 6: ProductForm 重构为分页签

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\components\ProductForm.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductBrandMarketingTab.vue`
- Create: `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductVariantMatrixTab.vue`

- [ ] **Step 1: 表单体改为 tab 容器**（保留原基本字段为「基本信息」tab；用 `uni-app` 原生切换或轻量 tab 状态变量，不引入组件库）

```vue
<template>
  <view>
    <view class="tabs">
      <view v-for="t in ['基本信息','品牌营销','规格变体']" :key="t"
            :class="['tab', activeTab === t ? 'on' : '']" @tap="activeTab = t">{{ t }}</view>
    </view>
    <view v-if="activeTab === '基本信息'"><!-- 现有基本字段原样保留 --></view>
    <ProductBrandMarketingTab v-else-if="activeTab === '品牌营销'"
        :value="brandMarketing" @update:value="onBrandMarketing" />
    <ProductVariantMatrixTab v-else
        :product-id="product?.id" :value="variantMatrix" @update:value="onVariantMatrix" />
    <view class="footer">
      <button @tap="save">保存</button>
    </view>
  </view>
</template>
```
`brandMarketing` / `variantMatrix` 为内部 `ref`（初始从 `props.product` 解析），`save()` 汇总三 tab 数据后调用 Task5 的 save。tab 样式沿用现有商品表单按钮/配色风格。

- [ ] **Step 2: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/components/ProductForm.vue web-admin/src/components/product-tabs
git commit -m "feat(web-admin): 商品表单重构为 基本信息/品牌营销/规格变体 三页签"
```

---

## Task 7: 品牌营销 Tab 子组件

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductBrandMarketingTab.vue`

- [ ] **Step 1: 实现品牌单选 + 划线价/促销期 + 标签多选 + 卖点 + 关联活动占位**

```vue
<template>
  <view>
    <view class="field"><text class="label">品牌</text>
      <picker :range="brandNames" @change="onBrand" ><text>{{ selBrand || '选择品牌' }}</text></picker>
    </view>
    <view v-if="!selBrand && showCreateBrand" class="field"><text class="label">新建品牌</text>
      <input v-model="newBrand" placeholder="品牌名" /><button @tap="createBrand">创建</button>
    </view>
    <view class="field"><text class="label">划线价(元)</text><input type="digit" v-model="listPriceYuan" /></view>
    <view class="field"><text class="label">促销期</text>
      <picker mode="date" @change="onStart"><text>{{ saleStart || '开始日期' }}</text></picker>
      <picker mode="date" @change="onEnd"><text>{{ saleEnd || '结束日期' }}</text></picker>
    </view>
    <view class="field"><text class="label">营销标签</text>
      <checkbox-group @change="onTags">
        <label v-for="t in TAG_OPTIONS" :key="t.code">
          <checkbox :value="t.code" :checked="tags.includes(t.code)" />{{ t.label }}
        </label>
      </checkbox-group>
    </view>
    <view class="field"><text class="label">卖点</text><input v-model="sellingPoint" /></view>
    <view class="field"><text class="label">关联促销活动</text>
      <view v-if="promotions.length===0" class="muted">暂无满减/优惠券活动，可先用优惠券满减（复用既有插件）</view>
      <checkbox-group v-else @change="onPromos"><label v-for="p in promotions" :key="p.id"><checkbox :value="p.id"/>{{p.name}}</label></checkbox-group>
    </view>
  </view>
</template>
```
- 常量：`TAG_OPTIONS = [{code:'new',label:'新品'},{code:'hot',label:'热卖'},{code:'special',label:'特价'},{code:'sale',label:'限时折扣'},{code:'freeShip',label:'包邮'},{code:'cut',label:'满减'},{code:'clearance',label:'清仓'},{code:'instock',label:'有货'}]`
- `Picker` 的自定义实现（uni-app 原生 `picker` 对动态选项支持有限时可改为 `view` 列表选择）。端口与样式对齐现有表单。
- `promotions` 从既有活动插件读取（占位：调用既有的活动列表查询，缺省置空并提示复用优惠券满减）。
- 组件以 `props.value` + `emits('update:value', {...})` 受控，字段全部映射进 `brandMarketing` 对象。

- [ ] **Step 2: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/components/product-tabs/ProductBrandMarketingTab.vue
git commit -m "feat(web-admin): 品牌营销 Tab（品牌/划线价/促销期/标签/卖点）"
```

---

## Task 8: 规格变体矩阵 Tab + 生成逻辑

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductVariantMatrixTab.vue`
- Create: `d:\zhao\vshop\web-admin\src\composables\useVariantMatrix.ts`

- [ ] **Step 1: 矩阵生成 composable（笛卡尔积 + 建组/建值/建变体）**

`d:\zhao\vshop\web-admin\src\composables\useVariantMatrix.ts`：

```ts
export interface SpecGroup { name: string; values: string[]; }
export interface MatrixSku { key: string; labels: string[]; optionValueIds: string[]; sku: string; priceCents: number; stock: number; listPriceCents?: number; }

const cartesian = <T>(arrs: T[][]): T[][] =>
  arrs.reduce<T[][]>((a, b) => a.flatMap(d => b.map(e => [...d, e])), [[]]);

export function buildMatrix(groups: SpecGroup[]): MatrixSku[] {
  // 无规格：单 SKU
  if (groups.length === 0) return [{ key: 'default', labels: [], optionValueIds: [], sku: '', priceCents: 0, stock: 0 }];
  const valueGroups = groups.map(g => g.values.filter(Boolean));
  const raw = cartesian(valueGroups);
  return raw.map((comb, i) => ({
    key: `sku-${i}`, labels: comb, optionValueIds: [],
    sku: comb.join('-'), priceCents: 0, stock: 0,
  }));
}
```
- `generateVariantMutation(productId, groups, skus)`：对每个规格组 `createProductOptionGroup(input:{code:slug(name),translations:[{languageCode,name}],values:[{code,translations}]})`（建组并带 values），收集全部 option ids 后 `createProductVariants`（或 `updateProductVariants` 于编辑态），每变体 `optionValueIds` 为其组合的 ids、`price: priceCents`、`stockOnHand: stock`、`customFields:{ listPrice: listPriceCents }`、translations name=labels.join('·')。无规格时走既有 `createVariantsForProduct` 单变体逻辑。
- 规格组上限 3、每组值上限建议 15，超限在 UI 提示。

- [ ] **Step 2: Tab 壳（复用已确认线框）**

```vue
<template>
  <view>
    <view class="seg">
      <view :class="['seg-i', noSpec?'on':'']" @tap="noSpec=true">无规格（单品）</view>
      <view :class="['seg-i', !noSpec?'on':'']" @tap="noSpec=false">多规格（组合）</view>
    </view>
    <template v-if="!noSpec">
      <view v-for="(g,gi) in groups" :key="gi" class="grp">
        <input v-model="g.name" placeholder="规格名，如 颜色" />
        <view class="vals"><input v-for="(v,vi) in g.values" :key="vi" v-model="g.values[vi]" placeholder="值" /></view>
        <button @tap="removeGroup(gi)">删组</button>
      </view>
      <button @tap="addGroup">+ 添加规格组（上限3）</button>
    </template>
    <view>SKU 列表（{{ skus.length }} 项）</view>
    <view v-for="(s,si) in skus" :key="s.key" class="sku-row">
      <text>{{ s.labels.join('·') }}</text>
      <input type="number" v-model.number="s.priceCents" placeholder="价格(分)" />
      <input type="number" v-model.number="s.stock" placeholder="库存" />
      <input type="number" v-if="showListPrice" v-model.number="s.listPriceCents" placeholder="划线价(分)" />
    </view>
    <view v-if="skus.length>1"><button @tap="batchFillPrice">批量设价</button><button @tap="batchFillStock">批量填库存</button></view>
  </view>
</template>
```
- Watch `groups` 变化实时 `buildMatrix` 刷新 `skus`；`sku` 自动填 `groups names+values` join；批量设价/库存为简单填满。
- 提交时调用 `generateVariantMutation`，并把 `skus` 折回 `updateProductVariants`（编辑态，optionIds 已存在）。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/components/product-tabs/ProductVariantMatrixTab.vue web-admin/src/composables/useVariantMatrix.ts
git commit -m "feat(web-admin): 规格变体矩阵 Tab（3组规格、SKU生成、批量设价/库存）"
```

---

## Task 9: 商品创建/编辑页接入新 Tab 与品牌库

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\create.vue`（路径若不同以实际为准）
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\edit.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\product\index.vue`（列表回显品牌/划线价可选）

- [ ] **Step 1: 页面透传**（创建/编辑页把 `product` 对象与 `brandMarketing/variantMatrix` 初值传给 `ProductForm`；编辑页调用 `fetchProductFull` 已含新字段，初始化 `brandMarketing`（品牌 facetValue id、listPrice/促销期、tags、sellingPoint）与 `variantMatrix`（现有 variants → 若 optionValues 存在则反解成 groups/skus，否则置单规格））

> 反解逻辑在 `useVariantMatrix.ts` 新增 `hydrateEditState(product)`：从 `product.facets` 取品牌，从 `product.customFields` 取 tags/sellingPoint，从 `product.variants[].optionValues` 重建规格组与矩阵（缺 optionValues 的存量商品视为单规格，`listPrice` 从 variant.customFields 回填）。

- [ ] **Step 2: Commit**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/product
git commit -m "feat(web-admin): 商品创建/编辑页接入品牌营销与规格变体"
```

---

## Task 10: 本地 devProxy 冒烟（只读）+ 交付 HBuilder 编译清单

**Files:** —（验证与说明）

- [ ] **Step 1: 冒烟（只读）**
确认 vendure 后端已按 Task1-2 部署（或本地起），用 admin token 对 `product(id){customFields{marketingTags sellingPoint} variants{customFields{listPrice saleStart saleEnd}}}` 与 `facets(brand)` 返回无 schema error。web-admin 改完由用户 HBuilder X 编译后在 guanli 后台手工验证：新增商品走 3 tab、品牌可选用、划线价/促销期回显、多规格生成 SKU、保存后列表可见。

- [ ] **Step 2: 交付说明（写入计划末尾即可，不额外建文档）**
在最终回复中向用户给出 HBuilder X 手动编译 + 后台冒烟步骤，强调「品牌营销」「规格变体」tab 在新建/编辑链路均已接入。

---

# Self-Review（执行前走查）

- **Spec 覆盖**：品牌(Facet 库)→Task3/7/9；营销(划线价/促销期/标签/卖点/关联活动)→Task1/2/7；规格矩阵(≤3组)→Task8；多语言预留→localeString/translations 字段；复用清单→Part A 仅补字段+seed、前端复用原生 mutation。
- **占位**：均给出真实字段名/文件路径/代码；`promotions` 关联活动明确「缺省置空+提示复用优惠券满减」，非占位。
- **类型一致性**：`listPrice` 全程分(cent)口径（customFields int / 前端 priceCents）；`marketingTags` 存 JSON 字符串（后端 text / 前端序列化/反序列化）。

**执行交接**：计划完成后，按工作协议选择执行方式（subagent-driven 或 inline executing-plans）。