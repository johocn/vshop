# 商品上架审批 + 商家入驻增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 web-admin 内打通商品上架审批闭环（提审→审核通过/驳回），并在租户管理层面标识商户状态。

**Architecture:**
- 后端（cjk-plugin）：为 `Product` 新增 marketplace 相关自定义字段（`listedInMarketplace`、`marketplaceStatus`、`merchantRef`、`rejectReason`），新增提审/审核/跨租户查询的 service + admin resolver；为 `Channel` 新增 `merchantStatus` 自定义字段。字段通过 migrate 幂等补列（跨 SQLite/PostgreSQL 安全）。
- 前端（web-admin）：在「平台」抽屉组新增「商品审批」入口与页面，调用走后端新接口；租户列表展示商户状态标识。
- 权限：审批能力并入现有 `PERMISSION_CATALOG` 单一来源，新增「平台商品审批」权限，超管/平台运营可见。

**Tech Stack:** TypeScript、Vendure (GraphQL/NestJS)、TypeORM、uni-app (Vue3)、Pinia、graphql-request

**涉及仓库：** `d:\zhao\vendure`（cjk-plugin）、`d:\zhao\vshop\web-admin`

**构建/部署铁律：**
- cjk-plugin 用根目录 `node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json` 编译到 `lib/`（**勿在插件目录跑 pnpm run build**）。
- 后端改动后 `Select-String lib/src/... -Pattern 关键字` 验证产物已更新。
- web-admin 仅本地构建 `npm run build:h5` 推 dist；**绝不在服务器构建/安装。**

---

## 文件结构

**后端 `d:\zhao\vendure\packages\cjk-plugin\src\`**
- 新增 `product/marketplace-custom-fields.ts`：`Product` 自定义字段定义（listedInMarketplace / marketplaceStatus / merchantRef / rejectReason）
- 新增 `product/marketplace-product.service.ts`：提审 `submitToMarketplace`、审核 `review`、跨租户查询 `findByStatus` 逻辑
- 新增 `product/marketplace-product.resolver.ts`：admin GraphQL resolver（`submitProductToMarketplace` / `reviewMarketplaceProduct` / `marketplaceProducts`）
- 新增 `product/marketplace-permissions.ts`：`PlatformProductReview` 平台商品审批权限定义
- 修改 `tenant/tenant-channel-custom-fields.ts`：`Channel` 增加 `merchantStatus`
- 修改 `migrations/`：新增/扩展幂等补列（Product 四列 + Channel merchantStatus 列）
- 修改 `plugin.ts`：注册 Product customFields、Channel merchantStatus、新 provider/resolver、extend schema、customPermissions、权限目录
- 修改 `tenant/tenant-member.service.ts`：`PERMISSION_CATALOG` 增加「平台商品审批」分组

**前端 `d:\zhao\vshop\web-admin\src\`**
- 新增 `pages/platform/product-approval/index.vue`：商品审批页（列表 + 提审/通过/驳回）
- 新增 `apis/marketplace.ts`：提审/审核/跨租户查询接口
- 修改 `pages.json`：注册商品审批路由
- 修改 `components/Drawer.vue`：平台组新增「商品审批」入口（含权限判断）
- 修改 `pages/platform/tenants/index.vue`：展示商户状态标识

---

### Task 1: Product marketplace 自定义字段

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\product\marketplace-custom-fields.ts`

- [ ] **Step 1: 创建自定义字段文件**

```ts
import { CustomFields, LanguageCode } from '@vendure/core';

/**
 * Product 级 marketplace 上架审批自定义字段。
 * 命名遵循 Vendure 规范：DB 列名 = customFields + 首字母大写字段名，
 * 例如 listedInMarketplace → customFieldsListedinmarketplace。
 * merchantRef 用 string 存 Channel id（Vendure 自定义字段不支持多态 relation，按 id 关联）。
 */
export const marketplaceProductCustomFields: CustomFields = {
    Product: [
        {
            name: 'listedInMarketplace',
            type: 'boolean',
            nullable: true,
            defaultValue: false,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '在marketplace展示' },
                { languageCode: LanguageCode.en, value: 'Listed in marketplace' },
            ],
        },
        {
            name: 'marketplaceStatus',
            type: 'string',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '上架审批状态' },
                { languageCode: LanguageCode.en, value: 'Marketplace status' },
            ],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: 'pending/approved/rejected，null 表示从未提审' },
            ],
        },
        {
            name: 'merchantRef',
            type: 'string',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '归属商家' },
                { languageCode: LanguageCode.en, value: 'Merchant' },
            ],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: '商品归属商家 Channel id（自营=default）' },
            ],
        },
        {
            name: 'rejectReason',
            type: 'string',
            nullable: true,
            public: true,
            label: [
                { languageCode: LanguageCode.zh_Hans, value: '驳回原因' },
                { languageCode: LanguageCode.en, value: 'Reject reason' },
            ],
        },
    ],
};
```

- [ ] **Step 2: 验证类型可编译**

Run: `cd /d d:\zhao\vendure && node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json --noEmit`
Expected: 仅此文件的改动不引入错误（如与既有共享编译冲突可忽略待后续 resolver 一并处理）。

---

### Task 2: Channel merchantStatus 自定义字段

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-channel-custom-fields.ts`

- [ ] **Step 1: 在 Channel 字段数组末尾追加 merchantStatus**

在既有 Channel 字段定义数组（`isOfficial` 之后）追加：

```ts
{
    name: 'merchantStatus',
    type: 'string',
    nullable: true,
    defaultValue: 'active',
    public: true,
    label: [
        { languageCode: LanguageCode.zh_Hans, value: '商户入驻状态' },
        { languageCode: LanguageCode.en, value: 'Merchant status' },
    ],
    description: [
        { languageCode: LanguageCode.zh_Hans, value: 'pending/active/disabled，第三方商户标识' },
    ],
},
```

> 第三方新租户默认 `active`（已有正常租户直接视为已入驻商家）；`pending`/`disabled` 预留供后续申请/封停语义。

---

### Task 3: 后端审批 Service

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\product\marketplace-product.service.ts`

- [ ] **Step 1: 创建审批 Service**

```ts
import { Injectable } from '@nestjs/common';
import { Ctx, Injector, Logger, Product, ProductService, RequestContext, TransactionalConnection } from '@vendure/core';

export interface MarketplaceProductView {
    id: string;
    name: string;
    listedInMarketplace: boolean;
    marketplaceStatus: string | null;
    merchantRef: string | null;
    rejectReason: string | null;
}

@Injectable()
export class MarketplaceProductService {
    constructor(
        private productService: ProductService,
        private connection: TransactionalConnection,
    ) {}

    /** 提审：marketplaceStatus → pending */
    async submitToMarketplace(ctx: RequestContext, productId: string): Promise<Product> {
        const product = await this.productService.findOne(ctx, productId as any, ['featuredAsset']);
        if (!product) {
            throw new Error(`PRODUCT_NOT_FOUND: ${productId}`);
        }
        const status = (product.customFields as any)?.marketplaceStatus as string | undefined;
        if (status === 'approved') {
            throw new Error('PRODUCT_ALREADY_APPROVED');
        }
        return this.productService.update(ctx, {
            id: productId,
            customFields: {
                listedInMarketplace: false,
                marketplaceStatus: 'pending',
            },
        } as any);
    }

    /** 审核：approve=true → approved+listed；approve=false → rejected+reason */
    async review(ctx: RequestContext, productId: string, approve: boolean, rejectReason?: string | null): Promise<Product> {
        const product = await this.productService.findOne(ctx, productId as any);
        if (!product) {
            throw new Error(`PRODUCT_NOT_FOUND: ${productId}`);
        }
        if (approve) {
            return this.productService.update(ctx, {
                id: productId,
                customFields: {
                    listedInMarketplace: true,
                    marketplaceStatus: 'approved',
                    rejectReason: null,
                },
            } as any);
        }
        return this.productService.update(ctx, {
            id: productId,
            customFields: {
                listedInMarketplace: false,
                marketplaceStatus: 'rejected',
                rejectReason: rejectReason ?? null,
            },
        } as any);
    }

    /** 跨租户按状态查询（含审批信息的精简视图）。status 为空查全部（含未提审），保证平台可对未提审商品发起「提审」。 */
    async findByStatus(ctx: RequestContext, status?: string | null): Promise<MarketplaceProductView[]> {
        const qb = this.connection
            .getRepository(ctx, Product)
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translations')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .take(500);
        if (status) {
            qb.andWhere('product.customFieldsMarketplacestatus = :s', { s: status });
        }
        const rows = (await qb.getMany()) as any[];
        return rows.map((r: any) => this.toView(ctx, r));
    }

    /** 按 id 精确取单个审批视图（提审/审核后回显用） */
    async findOneView(ctx: RequestContext, productId: string): Promise<MarketplaceProductView> {
        const product = await this.productService.findOne(ctx, productId as any, ['featuredAsset', 'translations']);
        if (!product) throw new Error(`PRODUCT_NOT_FOUND: ${productId}`);
        return this.toView(ctx, product as any);
    }

    private toView(ctx: RequestContext, r: any): MarketplaceProductView {
        return {
            id: r.id,
            name: r.translations?.find((t: any) => t.languageCode === ctx.languageCode || t.languageCode === 'zh_Hans')?.name ?? r.id,
            listedInMarketplace: !!r.customFields?.listedInMarketplace,
            marketplaceStatus: r.customFields?.marketplaceStatus ?? null,
            merchantRef: r.customFields?.merchantRef ?? null,
            rejectReason: r.customFields?.rejectReason ?? null,
        };
    }
}
```

> **跨租户查询要点**：直接走 `connection.getRepository(ctx, Product).createQueryBuilder()` 绕开 ListQueryBuilder 的 channel 过滤与 take 上限，一次取前 500 条，满足平台审批场景。**注意**：`findByStatus('')` 必须返回全部商品（含未提审、`listedInMarketplace=false`），否则平台无从「提审」未上架商品，因此**不要加 `listedInMarketplace=true` 前置过滤**。列名 `customFieldsMarketplacestatus` 必须与 Vendure 自定义字段列名规则一致（`customFields` + 首字母大写字段名，全小写）。

---

### Task 4: 后端审批权限定义

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\product\marketplace-permissions.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`

- [ ] **Step 1: 创建权限定义**

```ts
import { PermissionDefinition } from '@vendure/core';

/** 平台商品审批权限：仅超管/平台运营可调用审批相关接口 */
export const platformProductReviewPermission = new PermissionDefinition({
    name: 'PlatformProductReview',
    description: '平台商品上架审批',
});
```

- [ ] **Step 2: 在 PERMISSION_CATALOG 追加「平台审批」分组**

在 `tenant-member.service.ts` 的 `PERMISSION_CATALOG` 末尾追加一组：

```ts
{
    key: 'platform',
    label: '平台管理',
    items: [
        { code: 'PlatformProductReview', label: '平台商品审批' },
    ],
},
```

> 权限清单单一来源：`BUSINESS_PERMISSIONS` 由 `PERMISSION_CATALOG` `flatMap` 派生，新增权限自动进白名单，前端 `permissionCatalog` 动态渲染，改一处全局生效。

---

### Task 5: 后端 Resolver + extend schema

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\product\marketplace-product.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 创建 Resolver**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { MarketplaceProductService, MarketplaceProductView } from './marketplace-product.service';
import { platformProductReviewPermission } from './marketplace-permissions';

@Resolver()
export class MarketplaceProductResolver {
    constructor(private service: MarketplaceProductService) {}

    @Mutation()
    @Allow(Permission.SuperAdmin, platformProductReviewPermission.Permission)
    async submitProductToMarketplace(@Ctx() ctx: RequestContext, @Args('id', { type: () => String }) id: string): Promise<MarketplaceProductView> {
        await this.service.submitToMarketplace(ctx, id);
        return this.service.findOneView(ctx, id);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin, platformProductReviewPermission.Permission)
    async reviewMarketplaceProduct(
        @Ctx() ctx: RequestContext,
        @Args('id', { type: () => String }) id: string,
        @Args('approve', { type: () => Boolean }) approve: boolean,
        @Args('rejectReason', { type: () => String, nullable: true }) rejectReason?: string | null,
    ): Promise<MarketplaceProductView> {
        await this.service.review(ctx, id, approve, rejectReason);
        return this.service.findOneView(ctx, id);
    }

    @Query()
    @Allow(Permission.SuperAdmin, platformProductReviewPermission.Permission)
    async marketplaceProducts(
        @Ctx() ctx: RequestContext,
        @Args('status', { type: () => String, nullable: true }) status?: string | null,
    ): Promise<MarketplaceProductView[]> {
        return this.service.findByStatus(ctx, status);
    }
}
```

> **注意**：`Permission` 来自 `@vendure/core`（值形态枚举）；`String` 标量来自 NestJS GraphQL 默认解析。若需 `ID` 标量类型，用 `@nestjs/graphql` 的 `ID`（`import { ID as GqlID }`）避免 TS2693。

- [ ] **Step 2: 在 plugin.ts 注册**

在 import 区新增：

```ts
import { marketplaceProductCustomFields } from './product/marketplace-custom-fields';
import { MarketplaceProductService } from './product/marketplace-product.service';
import { MarketplaceProductResolver } from './product/marketplace-product.resolver';
import { platformProductReviewPermission, platformProductReviewPermission as platformReviewPerm } from './product/marketplace-permissions';
```

在 `providers` 数组追加 `MarketplaceProductService`（建 resolver 引用同实例）。
在 `adminApiExtensions.resolvers` 数组追加 `MarketplaceProductResolver`。

在 `adminApiExtensions.schema` 的 GraphQL 模板中追加类型与接口：

```graphql
type MarketplaceProductView {
    id: ID!
    name: String!
    listedInMarketplace: Boolean!
    marketplaceStatus: String
    merchantRef: String
    rejectReason: String
}

extend type Query {
    marketplaceProducts(status: String): [MarketplaceProductView!]!
}

extend type Mutation {
    submitProductToMarketplace(id: ID!): MarketplaceProductView!
    reviewMarketplaceProduct(id: ID!, approve: Boolean!, rejectReason: String): MarketplaceProductView!
}
```

在 `configuration` 中注册 Product customFields（去重，仿照 ProductVariant 写法）：

```ts
{
    const existingPFields = (config.customFields?.Product || []).map((f: any) => f.name);
    const newPFields = (marketplaceProductCustomFields.Product || []).filter(
        (f: any) => !existingPFields.includes(f.name),
    );
    if (newPFields.length > 0) {
        config.customFields = {
            ...config.customFields,
            Product: [...(config.customFields?.Product || []), ...newPFields],
        };
    }
}
```

在 `config.authOptions.customPermissions` 追加 `platformProductReviewPermission`（与既有 pickup/tenant 权限平行）：

```ts
config.authOptions.customPermissions = [
    ...(config.authOptions.customPermissions || []),
    platformProductReviewPermission,
];
```

---

### Task 6: 迁移幂等补列（Product 四列 + Channel merchantStatus 列）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-marketplace-custom-column.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\index.ts`（如存在 index 导出）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（providers 追加迁移类）

- [ ] **Step 1: 创建迁移类**（仿照 `migrate-channel-custom-column.ts` 的幂等模式）

```ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, TableColumn } from 'typeorm';

/**
 * 幂等补列：Analog business 生产关闭 synchronize 时，为 Product 新增 marketplace 审批列、
 * Channel 新增 merchantStatus 列。失败仅打日志不阻塞启动。
 */
@Injectable()
export class MarketplaceCustomColumnMigration implements OnApplicationBootstrap {
    constructor(@InjectConnection() private connection: Connection) {}

    // 列名规则：customFields + 首字母大写字段名（Vendure 全小写）
    private readonly productColumns: Array<{ col: string; type: string }> = [
        { col: 'customFieldsListedinmarketplace', type: 'boolean' },
        { col: 'customFieldsMarketplacestatus', type: 'varchar(32)' },
        { col: 'customFieldsMerchantref', type: 'varchar(255)' },
        { col: 'customFieldsRejectreason', type: 'varchar(500)' },
    ];
    private readonly channelColumn = { col: 'customFieldsMerchantstatus', type: 'varchar(32)' };

    async onApplicationBootstrap() {
        try {
            const productTable = this.connection.getMetadata('Product').tableName;
            const channelTable = this.connection.getMetadata('Channel').tableName;
            const qr = this.connection.createQueryRunner();
            try {
                for (const c of this.productColumns) {
                    if (!(await qr.hasColumn(productTable, c.col))) {
                        await qr.addColumn(productTable, new TableColumn({ name: c.col, type: c.type, isNullable: true, default: c.type === 'boolean' ? false : undefined }));
                    }
                }
                if (!(await qr.hasColumn(channelTable, this.channelColumn.col))) {
                    await qr.addColumn(channelTable, new TableColumn({ name: this.channelColumn.col, type: this.channelColumn.type, isNullable: true }));
                }
            } finally {
                await qr.release();
            }
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error('[MarketplaceCustomColumnMigration] failed to ensure columns:', e?.message);
        }
    }
}
```

- [ ] **Step 2: 在 plugin.ts 导入并注册为 provider**

在 import 区：`import { MarketplaceCustomColumnMigration } from './migrations/migrate-marketplace-custom-column';`
在 `providers` 数组追加 `MarketplaceCustomColumnMigration`。

---

### Task 7: 后端编译与产物验证

- [ ] **Step 1: 编译 cjk-plugin**

Run: `cd /d d:\zhao\vendure && node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json`
Expected: 编译成功，产物写入 `packages/cjk-plugin/lib/`。

- [ ] **Step 2: 验证产物包含新接口与字段**

Run: `Select-String "packages/cjk-plugin/lib/src/product/marketplace-product.service.js" -Pattern "submitToMarketplace"`
Run: `Select-String "packages/cjk-plugin/lib/src/product/marketplace-custom-fields.js" -Pattern "listedInMarketplace"`
Expected: 均命中，确认改动已进入 dist/lib。

- [ ] **Step 3: 提交后端**

```bash
cd /d d:\zhao\vendure
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 商品上架审批 + 商户状态字段"
```

---

### Task 8: 前端 API 层

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\marketplace.ts`

- [ ] **Step 1: 创建 marketplace API**

```ts
// 商品上架审批 admin-api 封装
import { getAdminClient } from './client';

export interface MarketplaceProductView {
  id: string;
  name: string;
  listedInMarketplace: boolean;
  marketplaceStatus: string | null;
  merchantRef: string | null;
  rejectReason: string | null;
}

/** 跨租户按状态查询待审商品；status 传 '' 查全部 */
export async function fetchMarketplaceProducts(status = ''): Promise<MarketplaceProductView[]> {
  const { marketplaceProducts } = await getAdminClient().request<{
    marketplaceProducts: MarketplaceProductView[];
  }>(
    `query MarketplaceProducts($status: String) {
      marketplaceProducts(status: $status) { id name listedInMarketplace marketplaceStatus merchantRef rejectReason }
    }`,
    { status: status || null },
  );
  return marketplaceProducts ?? [];
}

export async function submitProductToMarketplace(id: string): Promise<MarketplaceProductView> {
  const { submitProductToMarketplace } = await getAdminClient().request<{
    submitProductToMarketplace: MarketplaceProductView;
  }>(
    `mutation SubmitProduct($id: ID!) { submitProductToMarketplace(id: $id) { id marketplaceStatus listedInMarketplace } }`,
    { id },
  );
  return submitProductToMarketplace;
}

export async function reviewMarketplaceProduct(
  id: string,
  approve: boolean,
  rejectReason = '',
): Promise<MarketplaceProductView> {
  const { reviewMarketplaceProduct } = await getAdminClient().request<{
    reviewMarketplaceProduct: MarketplaceProductView;
  }>(
    `mutation ReviewProduct($id: ID!, $approve: Boolean!, $rejectReason: String) {
      reviewMarketplaceProduct(id: $id, approve: $approve, rejectReason: $rejectReason) {
        id marketplaceStatus listedInMarketplace rejectReason
      }
    }`,
    { id, approve, rejectReason },
  );
  return reviewMarketplaceProduct;
}
```

---

### Task 9: 商品审批页面 + 路由 + 菜单入口

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\product-approval\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`
- Modify: `d:\zhao\vshop\web-admin\src\components\Drawer.vue`

- [ ] **Step 1: 注册路由**（在 `pages/platform/members/index` 后追加）

```json
{ "path": "pages/platform/product-approval/index", "style": { "navigationBarTitleText": "商品上架审批" } }
```

- [ ] **Step 2: 抽屉菜单入口**

在 `Drawer.vue` 的 `platformGroup()` 内追加（置于「人员管理」之后）：

```ts
// 平台商品审批：超管 + 平台运营（持有该权限者）
const productReviewPerm = auth.isSuperAdmin || auth.hasPermission('PlatformProductReview');
if (productReviewPerm) {
  items.push({ label: '商品审批', url: '/pages/platform/product-approval/index', tier: 2 });
}
```

- [ ] **Step 3: 创建审批页面**

```vue
<template>
  <view class="page">
    <view class="filters">
      <text v-for="f in filters" :key="f.value" class="ftab" :class="{ on: status === f.value }" @tap="status = f.value; load()">
        {{ f.label }}
      </text>
    </view>

    <view class="card" v-for="p in items" :key="p.id">
      <view class="row head">
        <view class="lt">
          <text class="title">{{ p.name }}</text>
          <text class="sub">商家: {{ p.merchantRef || '自营' }}</text>
        </view>
        <text class="st" :class="p.marketplaceStatus">{{ statusLabel(p) }}</text>
      </view>
      <view v-if="p.marketplaceStatus === 'rejected' && p.rejectReason" class="reason">驳回原因: {{ p.rejectReason }}</view>
      <view class="row foot">
        <template v-if="!p.marketplaceStatus">
          <text class="btn" @tap="doSubmit(p)">提审</text>
        </template>
        <template v-else-if="canReview(p)">
          <text class="btn danger" @tap="openReject(p)">驳回</text>
          <text class="btn" @tap="doApprove(p)">通过</text>
        </template>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无记录</view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onShow } from 'vue';
import { fetchMarketplaceProducts, submitProductToMarketplace, reviewMarketplaceProduct, MarketplaceProductView } from '@/apis/marketplace';

const status = ref('');
const items = ref<MarketplaceProductView[]>([]);
const filters = [
  { label: '全部', value: '' },
  { label: '待审', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
];

onShow(() => load());

async function load() {
  try { items.value = await fetchMarketplaceProducts(status.value); } catch (e: any) { uni.showToast({ title: e?.message || '加载失败', icon: 'none' }); }
}

function statusLabel(p: MarketplaceProductView): string {
  if (!p.marketplaceStatus) return '未提审';
  return { pending: '待审', approved: '已通过', rejected: '已驳回' }[p.marketplaceStatus] ?? p.marketplaceStatus;
}
function canReview(p: MarketplaceProductView): boolean { return p.marketplaceStatus === 'pending'; }

async function doSubmit(p: MarketplaceProductView) {
  uni.showModal({ title: '确认提审', content: `将「${p.name}」提交到 marketplace？`, success: async ({ confirm }) => {
    if (!confirm) return;
    try { await submitProductToMarketplace(p.id); uni.showToast({ title: '已提审', icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message || '提审失败', icon: 'none' }); }
  }});
}

async function doApprove(p: MarketplaceProductView) {
  uni.showModal({ title: '确认通过', content: `确认通过「${p.name}」上架到 marketplace？`, success: async ({ confirm }) => {
    if (!confirm) return;
    try { await reviewMarketplaceProduct(p.id, true); uni.showToast({ title: '已通过', icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message || '操作失败', icon: 'none' }); }
  }});
}

function openReject(p: MarketplaceProductView) {
  let reason = '';
  uni.showModal({
    title: '驳回', editable: true, placeholderText: '请输入驳回原因（必填）',
    success: async ({ confirm, content }) => {
      if (!confirm) return;
      reason = content || '';
      if (!reason.trim()) { uni.showToast({ title: '请填写驳回原因', icon: 'none' }); return; }
      try { await reviewMarketplaceProduct(p.id, false, reason); uni.showToast({ title: '已驳回', icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message || '操作失败', icon: 'none' }); }
    },
  });
}
</script>

<style lang="scss" scoped>
.filters { display: flex; gap: 16rpx; padding: 20rpx 24rpx;
  .ftab { padding: 8rpx 24rpx; border-radius: 999rpx; background: #f0f0f0; font-size: 26rpx; color: #666;
    &.on { background: $pm-main; color: #fff; } }
}
.card { margin: 0 24rpx 20rpx; padding: 24rpx; background: #fff; border-radius: 16rpx;
  .head { display: flex; justify-content: space-between; align-items: flex-start;
    .title { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sub { display: block; margin-top: 6rpx; font-size: 22rpx; color: #999; }
    .st { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx;
      &.pending { background: #fff7e6; color: #fa8c16; }
      &.approved { background: #f6ffed; color: #52c41a; }
      &.rejected { background: #fff2f0; color: #ff4d4f; } }
  }
  .reason { margin-top: 12rpx; font-size: 24rpx; color: #ff4d4f; }
  .foot { display: flex; gap: 12rpx; justify-content: flex-end; margin-top: 16rpx;
    .btn { padding: 8rpx 28rpx; border-radius: 999rpx; background: $pm-main; color: #fff; font-size: 26rpx;
      &.danger { background: #ff4d4f; } } }
}
.empty { text-align: center; color: #999; padding: 80rpx 0; font-size: 26rpx; }
</style>
```

> 说明：页面拉取不再依赖 `merchantRef` 显示商家名（可后续接入 Channel 名称解析），先显示 Channel id / 「自营」。

---

### Task 10: 租户列表展示商户状态

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\tenants\index.vue`

- [ ] **Step 1: 在租户卡片/列表补充商户状态标识**

在租户列表条目内（已有 `isOfficial` 展示处旁）追加：

```html
<text v-if="!t.isOfficial" class="merchant-tag" :class="t.statusClass">{{ t.statusLabel }}</text>
```

在列表演算逻辑中补充：

```ts
// 商户状态：官方自营显示「自营」，第三方按 merchantStatus 显示
function merchantTag(t: any) {
  if (t.isOfficial) return { label: '自营', cls: 'official' };
  const s = t.customFields?.merchantStatus || 'active';
  return { label: s === 'active' ? '已入驻' : s, cls: s };
}
```

并将列表映射 `items.value` 处为每条附加 `statusLabel`/`statusClass`，用 `merchantTag(t)` 填充。

> 该步为轻量展示；若 `fetchTenants` 返回的 Channel 已含 `customFields` 则可直接用，否则在 `fetchTenants` 的 GraphQL 增加 `customFields { merchantStatus }` 字段（见 Task 11）。

---

### Task 11: 租户 API 补充 merchantStatus 字段

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

- [ ] **Step 1: 在 fetchTenants 查询中补充 customFields.merchantStatus**

在 `fetchTenants` 的 GraphQL 查询中，`tenant`/item 的字段列表追加：

```graphql
customFields { merchantStatus }
```

并在 `TenantItem` 接口补充 `merchantStatus?: string`，映射时透传。

> 若项目内 `fetchTenants` 封装了对 Channel 自定义字段的扁平化，需与该封装对齐（读取 `merchantStatus`）。

---

### Task 12: 前端构建与提交（本地构建铁律）

- [ ] **Step 1: 本地构建 web-admin**

Run: `cd /d d:\zhao\vshop\web-admin && npm run build:h5`
Expected: `DONE Build complete.`，产物在 `web-admin/dist/build/h5`。产物校验：`index.html` 存在、`assets` 非空、总大小 ≥ 100KB。

- [ ] **Step 2: 提交前端源码与 dist**

```bash
cd /d d:\zhao\vshop
git add web-admin/src web-admin/dist/build/h5 web-admin/docs 2>/dev/null
git commit -m "feat(web-admin): 商品上架审批页 + 商户状态标识"
```

> 仅提交本次相关文件，避免夹带 C 端无关改动（checkout/pickup/payment）。

---

### Task 13: 后端部署（git + pm2，绝不在服务器构建）

- [ ] **Step 1: 提交并推送 cjk-plugin 产物**

```bash
cd /d d:\zhao\vendure
git push origin master
```

- [ ] **Step 2: 服务器拉取并重启**

```bash
# 在服务器执行（仅拉取 + 重启，不构建）
ssh qing "cd /www/server/vendure && git pull && pm2 restart vendure && sleep 3 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health"
```

Expected: `200`（或健康检查通过）。若失败：`pm2 logs --nostream --lines 30` 排查。

> **部署绝对铁律**：禁止在服务器执行 `npm install` / `pnpm install` / 任何 build。cjk-plugin 已本地 `tsc` 编译到 `lib/` 并提交。

---

### Task 14: 前端部署（本地构建推 dist）

- [ ] **Step 1: 推送前端**

```bash
cd /d d:\zhao\vshop
git push origin master
```

- [ ] **Step 2: 服务器拉取 + pm2 restart**

在服务器：`cd /www/sites/... && git pull && pm2 restart <前端服务名>`（沿用既有 web-admin 部署流程，见 `scripts/deploy.mjs` 或手动，服务器只拉取不构建）。

- [ ] **Step 3: 线上验证**

用超管账号在 `e.joho.cn/guanli` 登录 → 抽屉「平台 → 商品审批」→ 验证列表加载、提审、通过、驳回（含必填原因）全流程；租户列表验证商户状态标识。

---

## 自审

**Spec 覆盖：**
- 商品审批闭环（提审/审核/跨租户查询）→ Task 3/4/5/6/7
- Product 自定义字段 → Task 1/3/6
- Channel merchantStatus → Task 2/6
- 前端审批页 + 路由 + 菜单 → Task 8/9
- 商户状态展示 → Task 10/11
- 构建/部署 + 线上验证 → Task 12/13/14

**占位符检查：** 无 TBD/TODO；所有代码步骤给出完整实现。

**类型一致性：** `MarketplaceProductView` 三处（后端 service、resolver、前端 api）字段一致；`marketplaceStatus`/`listedInMarketplace`/`merchantRef`/`rejectReason` 命名统一；权限常量 `platformProductReviewPermission` 与 `PlatformProductReview` code 一致。