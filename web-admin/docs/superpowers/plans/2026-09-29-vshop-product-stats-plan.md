# 商品销量 / 积分数据源 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Product 补齐「展示销量」「可得积分」两个可用、可核对、可人工干预的数据源，并让 vshop 详情页元信息行从占位降级变为真实展示。

**Architecture:** 后端不新增插件包，在既有 `operations-plugin` 内新增 `ProductStatsService`（订单聚合 + 最低变体价派生、写前比对防自激）、每日 `ScheduledTask`（`5 3 * * *` 收敛新订单带来的销量变化）、`ProductEvent`/`ProductVariantEvent` 订阅（后台改动即时生效）、admin mutation `recomputeProductStats`（部署后一次性回填 + 运营纠偏）；字段定义落在 `marketplace-plugin` 的 Product 自定义字段唯一来源。前端只改 1 行 fragment + 2 处文案走 i18n，展示逻辑与降级保持不变。

**Tech Stack:** Vendure 3.6 / TypeORM（`TransactionalConnection`）/ `@vendure/core` ScheduledTask + EventBus / vitest + sqljs e2e（`@vendure/testing`）/ uni-app (Vue 3) + vue-i18n 5 语言包

**设计来源：** `vshop/web-admin/docs/superpowers/specs/2026-09-29-vshop-product-stats-design.md`（已推送 `72c7c50`）

---

## 执行结构

| 阶段 | 内容 | 依赖 |
|---|---|---|
| T1 | 后端：Product 5 个自定义字段（`marketplace-plugin`） | — |
| T2 | 后端：e2e 用例先写（跑红） | T1 |
| T3 | 后端：`ProductStatsService`（跑绿 用例 1–3、5 部分） | T2 |
| T4 | 后端：admin mutation `recomputeProductStats` + 插件注册（跑绿） | T3 |
| T5 | 后端：每日任务 + 事件订阅（补即时生效用例，跑绿） | T4 |
| T6 | 后端：插件接口文档（新建 + 索引） | T4 |
| T7 | 后端：构建 dist + 提交推送 | T5, T6 |
| T8 | 后端：部署 + 一次性回填 + 生产探针 | T7 |
| T9 | 前端：fragment + i18n 接线（**前置：并行会话已停止**） | — |
| T10 | 前端：构建 → 部署 → 手机视口截图 | T8, T9 |
| T11 | 文档收尾（手册 §5.3 / BACKLOG / spec 澄清）+ 提交推送 | T10 |

T1–T8 与 T9 之间无代码依赖；但 **T8 必须先于 T10**：详情页 fragment 补了 `salesCount pointsReward`，若后端字段未上线，GraphQL 校验会直接拒绝整个商品详情查询。

---

## 前置条件（硬约束）

1. **并行会话已停止**：T9 起要改的 `vshop/src/pkg-product/pages/detail.vue`、`vshop/src/api/fragments.ts`、`vshop/src/components/SkuSheet.vue` 当前被另一会话（评价体系前端）占用；`vendure/packages/review-plugin` 与 e2e 端口亦被其占用。**T9 起动手前先确认该会话已停止**。
2. **不在服务器构建**：所有构建一律本地，服务器只 `git pull` + `pm2 restart` / 解压静态产物。
3. **e2e 独占端口**：`e2e-common/test-config.ts` 按「非 core 包 = 3250 + 测试文件在该目录内的序号」分配端口。跑 `operations-plugin` e2e 时不要同时跑其它包的 e2e。
4. **git add 只加本任务文件**：禁止 `git add -A` / `git add .`。

**已确认的决策（不再追问）**：销量 = 真实订单聚合 + 后台展示基数；积分 = 比例派生 + 单品可覆盖；方案 A（后端 materialize 展示值 + 每日全量重算）；i18n 只做元信息行两处（`已售` 复用既有 key `product.sold`；`可得 {n} 积分` 新增 `product.pointsReward`）。

---

## 实现口径澄清（落地时补进 spec §4.2）

| # | 设计稿表述 | 实施口径 | 理由 |
|---|---|---|---|
| 1 | `basePriceCents = MIN(productVariant.price)` | 取 `product_variant_price` 表中**全渠道最低价**（不加 `channelId` 过滤） | 重算有三条触发路径（定时任务 / 事件订阅 / 后台手动），各自 `ctx.channelId` 可能不同；若按 ctx 渠道取价，同一商品会被反复写成不同值（抖动）。取全渠道最低价让结果与执行上下文无关，保证幂等 |
| 2 | `ProductVariant.price` 是「计算属性」 | 实际读 `ProductVariantPrice.price`（每渠道一行） | `ProductVariant.price` 是 `@Calculated` getter，DB 里没有该列；价格真身在 `product_variant_price` 表 |

---

## Task 1: Product 5 个自定义字段

**Files:**
- Modify: `d:\zhao\vendure\packages\marketplace-plugin\src\custom-fields.ts`（`Product` 数组末尾，`services` 之后追加 5 项）

- [ ] **Step 1: 在 `Product` 数组末尾追加 5 个字段**

把 `d:\zhao\vendure\packages\marketplace-plugin\src\custom-fields.ts` 中 `services` 字段这一项（当前 L93-100）的结尾 `},` 之后、`Product` 数组闭合 `],` 之前，插入：

```ts
        {
            name: 'salesCount',
            type: 'int',
            defaultValue: 0,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '展示销量' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '由 ProductStatsService 重算写回：realSalesCount + bonusSales；C 端只读此字段' }],
        },
        {
            name: 'realSalesCount',
            type: 'int',
            defaultValue: 0,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '真实销量（订单聚合）' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: 'Σ orderLine.quantity，仅计已支付及之后状态的订单；全渠道合计；每日 03:05 重算' }],
        },
        {
            name: 'bonusSales',
            type: 'int',
            defaultValue: 0,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '展示基数（运营手填）' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '叠加在真实销量之上的展示基数；改动后展示值即时重算' }],
        },
        {
            name: 'pointsReward',
            type: 'int',
            nullable: true,
            public: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '可得积分（展示）' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '由 ProductStatsService 重算写回：pointsRewardOverride ?? 最低变体不含税价' }],
        },
        {
            name: 'pointsRewardOverride',
            type: 'int',
            nullable: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '可得积分覆盖值' }],
            description: [{ languageCode: LanguageCode.zh_Hans, value: '填了则直接作为展示积分，不再按价格派生' }],
        },
```

- [ ] **Step 2: 编译产物**

Run:
```powershell
cd d:\zhao\vendure\packages\marketplace-plugin; npm run build
```
Expected: 无 TS 报错，退出码 0；`packages\marketplace-plugin\dist\custom-fields.js` 的修改时间被刷新。

- [ ] **Step 3: 确认字段已进产物**

Run:
```powershell
Select-String -Path d:\zhao\vendure\packages\marketplace-plugin\dist\custom-fields.js -Pattern "salesCount|realSalesCount|bonusSales|pointsReward|pointsRewardOverride" | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `5`

- [ ] **Step 4: 提交**

```powershell
cd d:\zhao\vendure; git add packages/marketplace-plugin/src/custom-fields.ts packages/marketplace-plugin/dist; git commit -m "feat(marketplace-plugin): 新增商品展示销量/积分 5 个自定义字段"
```

---

## Task 2: e2e 用例（先写，跑红）

**Files:**
- Create: `d:\zhao\vendure\packages\operations-plugin\e2e\product-stats.e2e-spec.ts`
- Modify: `d:\zhao\vendure\packages\operations-plugin\package.json`（补 `e2e` 脚本）

- [ ] **Step 1: 给 `operations-plugin` 补 e2e 脚本**

`d:\zhao\vendure\packages\operations-plugin\package.json` 的 `scripts` 当前是：

```json
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w"
  },
```

改为：

```json
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "e2e": "cross-env PACKAGE=operations-plugin vitest --config vitest.config.mts --run"
  },
```

> `cross-env` 已存在于仓库根 `node_modules/.bin`（其它插件包同样只写脚本、不在 devDependencies 里重复声明），无需 `npm install`。

- [ ] **Step 2: 创建 e2e 用例文件**

创建 `d:\zhao\vendure\packages\operations-plugin\e2e\product-stats.e2e-spec.ts`：

```ts
import { mergeConfig, Order, TransactionalConnection } from '@vendure/core';
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import gql from 'graphql-tag';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { singleStageRefundablePaymentMethod } from '../../core/e2e/fixtures/test-payment-methods';
import { addPaymentToOrder, proceedToArrangingPayment } from '../../core/e2e/utils/test-order-utils';
import { marketplaceCustomFields } from '../../marketplace-plugin/src/custom-fields';
import { OperationsPlugin } from '../src/operations.plugin';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

/** 测试 EntityIdStrategy 会给 ID 加 `T_` 前缀；直连仓库查询需还原纯数字 id。 */
function numericId(encoded: string | number): number {
    return Number(String(encoded).replace(/^T_/, ''));
}

/** 让事件订阅触发的后台重算跑完，避免与本用例的显式重算互相干扰「返回更新数」的断言口径。 */
function settle(ms = 200): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('OperationsPlugin · 商品销量/积分重算', () => {
    const config = mergeConfig(testConfig(), {
        plugins: [OperationsPlugin.init()],
        paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod] },
    });
    // mergeConfig 对数组走「对象深合并」，Product 自定义字段会变成 `{"0":{...}}` 这种非数组结构；
    // 这里直接赋真实数组。字段定义仍复用 marketplace-plugin 的唯一来源，防字段名漂移。
    (config.customFields as any) = { Product: marketplaceCustomFields.Product };

    const { server, adminClient, shopClient } = createTestEnvironment(config);

    const customerEmail = 'stats.buyer@test.com';
    let productId: string;
    let variantId: string;
    let taxCategoryId: string;

    async function recompute(productIds?: string[]): Promise<number> {
        const res = (await adminClient.query(
            gql`
                mutation ($ids: [ID!]) {
                    recomputeProductStats(productIds: $ids)
                }
            `,
            { ids: productIds ?? null },
        )) as any;
        return res.recomputeProductStats as number;
    }

    async function readStats(pid: string = productId): Promise<any> {
        const res = (await adminClient.query(
            gql`
                query ($id: ID!) {
                    product(id: $id) {
                        customFields {
                            salesCount
                            realSalesCount
                            bonusSales
                            pointsReward
                            pointsRewardOverride
                        }
                    }
                }
            `,
            { id: pid },
        )) as any;
        return res.product.customFields;
    }

    async function createProduct(slug: string, sku: string, price: number): Promise<{ productId: string; variantId: string }> {
        const p = (await adminClient.query(gql`
            mutation {
                createProduct(input: {
                    translations: [{ languageCode: en, name: "${slug}", slug: "${slug}", description: "${slug}" }]
                }) { ... on Product { id } }
            }
        `)) as any;
        const pid = p.createProduct.id as string;
        const v = (await adminClient.query(gql`
            mutation {
                createProductVariants(input: [{
                    productId: "${pid}"
                    sku: "${sku}"
                    price: ${price}
                    taxCategoryId: "${taxCategoryId}"
                    trackInventory: FALSE
                    translations: [{ languageCode: en, name: "${sku}" }]
                }]) { ... on ProductVariant { id } }
            }
        `)) as any;
        return { productId: pid, variantId: v.createProductVariants[0].id as string };
    }

    async function addItem(quantity: number): Promise<void> {
        const res = (await shopClient.query(
            gql`
                mutation ($variantId: ID!, $qty: Int!) {
                    addItemToOrder(productVariantId: $variantId, quantity: $qty) {
                        ... on Order { id }
                        ... on ErrorResult { errorCode message }
                    }
                }
            `,
            { variantId, qty: quantity },
        )) as any;
        expect(res.addItemToOrder.errorCode).toBeUndefined();
    }

    async function currentActiveOrderId(): Promise<string> {
        const res = (await shopClient.query(gql`query { activeOrder { id } }`)) as any;
        return res.activeOrder.id as string;
    }

    beforeAll(async () => {
        await server.init({
            initialData: {
                ...initialData,
                paymentMethods: [
                    {
                        name: singleStageRefundablePaymentMethod.code,
                        handler: { code: singleStageRefundablePaymentMethod.code, arguments: [] },
                    },
                ],
            },
        });
        await adminClient.asSuperAdmin();

        const taxCats = (await adminClient.query(gql`query { taxCategories { items { id } } }`)) as any;
        taxCategoryId = taxCats.taxCategories.items[0].id;

        const created = await createProduct('stats-test-product', 'stats-v1', 9900);
        productId = created.productId;
        variantId = created.variantId;

        await adminClient.query(gql`
            mutation {
                createCustomer(input: { firstName: "Stats", lastName: "Buyer", emailAddress: "${customerEmail}" }, password: "test") { ... on Customer { id } }
            }
        `);
        await shopClient.asUserWithCredentials(customerEmail, 'test');
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    it('用例1 销量只计已支付及之后状态的订单（全渠道合计）', async () => {
        // 一笔真实已支付单：数量 2
        await addItem(2);
        await proceedToArrangingPayment(shopClient);
        const paid = await addPaymentToOrder(shopClient, singleStageRefundablePaymentMethod);
        expect(String(paid.id)).toBeTruthy();

        // 另一笔活动单：数量 5 → 直接改库置为 Cancelled。
        // 本用例聚焦「聚合口径（state 白名单）」，不依赖订单状态机与退款流程。
        await addItem(5);
        const activeOrderId = await currentActiveOrderId();
        const connection = server.app.get(TransactionalConnection);
        await connection.rawConnection.getRepository(Order).update(numericId(activeOrderId), { state: 'Cancelled' as any });

        expect(await recompute([productId])).toBe(1);

        const stats = await readStats();
        expect(stats.realSalesCount).toBe(2);
        expect(stats.salesCount).toBe(2);
        // 9900 分 = ¥99；1 分 = 1 积分（Channel.pointsPerYuan 默认 100），故派生值即 9900
        expect(stats.pointsReward).toBe(9900);
    });

    it('用例2 展示销量 = 真实销量 + 后台基数；用例4 重算幂等', async () => {
        await adminClient.query(gql`
            mutation {
                updateProduct(input: { id: "${productId}", customFields: { bonusSales: 100 } }) { id }
            }
        `);
        await settle();

        let stats = await readStats();
        expect(stats.realSalesCount).toBe(2);
        expect(stats.salesCount).toBe(102);

        // 幂等：值已收敛后，连续重算都不再写库
        await recompute([productId]);
        expect(await recompute([productId])).toBe(0);
        stats = await readStats();
        expect(stats.salesCount).toBe(102);
    });

    it('用例3 可得积分：无覆盖按最低变体价派生，有覆盖取覆盖值', async () => {
        let stats = await readStats();
        expect(stats.pointsReward).toBe(9900);

        await adminClient.query(gql`
            mutation {
                updateProduct(input: { id: "${productId}", customFields: { pointsRewardOverride: 500 } }) { id }
            }
        `);
        await settle();

        stats = await readStats();
        expect(stats.pointsReward).toBe(500);
    });

    it('用例5 全量重算覆盖多商品并收敛', async () => {
        const second = await createProduct('stats-test-product-2', 'stats-v2', 1000);
        await settle();

        await recompute(); // 不带 productIds = 全量重算

        const first = await readStats();
        const secondStats = await readStats(second.productId);
        expect(first.salesCount).toBe(102);
        expect(first.pointsReward).toBe(500);
        expect(secondStats.salesCount).toBe(0);
        expect(secondStats.pointsReward).toBe(1000);

        // 已收敛 → 全量重算不再写任何商品
        expect(await recompute()).toBe(0);
    });
});
```

- [ ] **Step 3: 跑用例确认失败**

Run:
```powershell
cd d:\zhao\vendure\packages\operations-plugin; npm run e2e -- product-stats
```
Expected: FAIL。报错包含 `Cannot query field "recomputeProductStats" on type "Mutation"`（mutation 尚未实现）。

---

## Task 3: `ProductStatsService`

**Files:**
- Create: `d:\zhao\vendure\packages\operations-plugin\src\product-stats.service.ts`

- [ ] **Step 1: 创建 service**

创建 `d:\zhao\vendure\packages\operations-plugin\src\product-stats.service.ts`：

```ts
// d:\zhao\vendure\packages\operations-plugin\src\product-stats.service.ts
import { Injectable } from '@nestjs/common';
import {
    ID,
    OrderLine,
    Product,
    ProductService,
    ProductVariantPrice,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

/**
 * 计入销量的订单状态白名单 = 「已支付及之后」。
 * AddingItems / ArrangingPayment / PaymentAuthorized / Modifying / ArrangingAdditionalPayment /
 * Draft / Cancelled 天然排除（草稿单处于 Draft 状态，无需额外过滤）。
 */
export const COUNTED_ORDER_STATES = [
    'PaymentSettled',
    'PartiallyShipped',
    'Shipped',
    'PartiallyDelivered',
    'Delivered',
];

/** 全量重算的分页大小 */
const PRODUCT_PAGE_SIZE = 200;

/**
 * @description
 * 商品展示值（销量 / 可得积分）重算服务。
 *
 * 写回规则：
 * - salesCount     = realSalesCount + bonusSales
 * - pointsReward   = pointsRewardOverride ?? floor(最低变体不含税价)
 *
 * 幂等：结果只由「订单聚合 + 变体价格 + 后台基数/覆盖」决定，与执行上下文（渠道、时间）无关；
 * 写前比对，值未变化则不调用 ProductService.update —— 这同时切断了 ProductEvent 的自激循环。
 */
@Injectable()
export class ProductStatsService {
    constructor(
        private connection: TransactionalConnection,
        private productService: ProductService,
    ) {}

    /** 全量重算（分页遍历所有商品）。返回本次实际被更新的商品数。 */
    async recomputeAll(ctx: RequestContext): Promise<number> {
        let skip = 0;
        let updated = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const page: Product[] = await this.connection.getRepository(ctx, Product).find({
                order: { id: 'ASC' },
                skip,
                take: PRODUCT_PAGE_SIZE,
            });
            if (page.length === 0) {
                break;
            }
            updated += await this.recomputeForProducts(
                ctx,
                page.map(p => p.id),
            );
            if (page.length < PRODUCT_PAGE_SIZE) {
                break;
            }
            skip += PRODUCT_PAGE_SIZE;
        }
        return updated;
    }

    /**
     * 按商品重算并写回展示值。返回本次实际被更新的商品数。
     * 与库中现值完全一致的商品会被跳过（不写库、不发事件）。
     */
    async recomputeForProducts(ctx: RequestContext, productIds: ID[]): Promise<number> {
        const ids = [...new Set(productIds.map(id => Number(id)))].filter(id => Number.isFinite(id));
        if (ids.length === 0) {
            return 0;
        }

        const [salesMap, priceMap, products] = await Promise.all([
            this.aggregateSales(ctx, ids),
            this.aggregateMinPrices(ctx, ids),
            this.connection.getRepository(ctx, Product).find({ where: ids.map(id => ({ id })) as any }),
        ]);

        let updated = 0;
        for (const product of products) {
            const cf: any = (product as any).customFields ?? {};
            const realSalesCount = salesMap.get(Number(product.id)) ?? 0;
            const bonusSales = Number(cf.bonusSales ?? 0);
            const salesCount = realSalesCount + bonusSales;
            const override = cf.pointsRewardOverride;
            const pointsReward = override != null ? Number(override) : (priceMap.get(Number(product.id)) ?? 0);

            const unchanged =
                Number(cf.realSalesCount ?? 0) === realSalesCount &&
                Number(cf.salesCount ?? 0) === salesCount &&
                Number(cf.pointsReward ?? 0) === pointsReward;
            if (unchanged) {
                continue;
            }

            await this.productService.update(ctx, {
                id: product.id,
                customFields: { realSalesCount, salesCount, pointsReward } as any,
            });
            updated++;
        }
        return updated;
    }

    /**
     * 真实销量：Σ orderLine.quantity，仅计已支付及之后状态的订单；**全渠道合计**
     * （Product 是全局实体，销量不按渠道拆分，见 spec §9 取舍 1）。
     */
    private async aggregateSales(ctx: RequestContext, productIds: number[]): Promise<Map<number, number>> {
        const rows = await this.connection
            .getRepository(ctx, OrderLine)
            .createQueryBuilder('line')
            .innerJoin('line.order', 'o')
            .innerJoin('line.productVariant', 'v')
            .select('v.productId', 'productId')
            .addSelect('SUM(line.quantity)', 'qty')
            .where('o.state IN (:...states)', { states: COUNTED_ORDER_STATES })
            .andWhere('v.productId IN (:...productIds)', { productIds })
            .groupBy('v.productId')
            .getRawMany<{ productId: number; qty: string }>();

        const map = new Map<number, number>();
        for (const row of rows) {
            map.set(Number(row.productId), Number(row.qty));
        }
        return map;
    }

    /**
     * 最低变体价（不含税、单位分）：`product_variant_price` 表的**全渠道最低价**。
     * 取全渠道而非 ctx.channelId，是为了让重算结果与执行上下文无关（三条触发路径的 ctx 渠道可能不同）。
     */
    private async aggregateMinPrices(ctx: RequestContext, productIds: number[]): Promise<Map<number, number>> {
        const rows = await this.connection
            .getRepository(ctx, ProductVariantPrice)
            .createQueryBuilder('pvp')
            .innerJoin('pvp.variant', 'v')
            .select('v.productId', 'productId')
            .addSelect('MIN(pvp.price)', 'minPrice')
            .where('v.productId IN (:...productIds)', { productIds })
            .groupBy('v.productId')
            .getRawMany<{ productId: number; minPrice: string }>();

        const map = new Map<number, number>();
        for (const row of rows) {
            map.set(Number(row.productId), Math.floor(Number(row.minPrice)));
        }
        return map;
    }
}
```

- [ ] **Step 2: 编译通过**

Run:
```powershell
cd d:\zhao\vendure\packages\operations-plugin; npx tsc --noEmit
```
Expected: 无输出、退出码 0。

---

## Task 4: admin mutation `recomputeProductStats` + 插件注册

**Files:**
- Modify: `d:\zhao\vendure\packages\operations-plugin\src\operations-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\operations-plugin\src\operations.plugin.ts`
- Modify: `d:\zhao\vendure\packages\operations-plugin\src\index.ts`

- [ ] **Step 1: resolver 注入 service**

`d:\zhao\vendure\packages\operations-plugin\src\operations-admin.resolver.ts` 的 import 段（L6-7）当前是：

```ts
import { OperationsPermissions } from './constants';
import { ContentService } from './content.service';
import { OperationsDashboardService, DashboardRange } from './operations-dashboard.service';
```

改为：

```ts
import { OperationsPermissions } from './constants';
import { ContentService } from './content.service';
import { OperationsDashboardService, DashboardRange } from './operations-dashboard.service';
import { ProductStatsService } from './product-stats.service';
```

- [ ] **Step 2: resolver 构造函数补依赖**

同文件当前构造函数（L20-23）是：

```ts
    constructor(
        private dashboardService: OperationsDashboardService,
        private contentService: ContentService,
    ) {}
```

改为：

```ts
    constructor(
        private dashboardService: OperationsDashboardService,
        private contentService: ContentService,
        private productStatsService: ProductStatsService,
    ) {}
```

- [ ] **Step 3: 加 mutation 方法**

同文件在 `triggerContentLifecycle`（L132-138）之后、`// ===== Dynamic permission check =====` 之前插入：

```ts
    // ===== Product stats manual recompute (admin backfill / correction) =====

    @Mutation()
    @Allow(Permission.UpdateProduct)
    async recomputeProductStats(
        @Ctx() ctx: RequestContext,
        @Args({ name: 'productIds', type: () => [ID], nullable: true }) productIds?: ID[],
    ) {
        if (!productIds || productIds.length === 0) {
            return this.productStatsService.recomputeAll(ctx);
        }
        return this.productStatsService.recomputeForProducts(ctx, productIds);
    }
```

> `ID` 已在该文件 L3 的 `@vendure/core` 导入列表中，无需新增 import。

- [ ] **Step 4: 补 admin schema**

`d:\zhao\vendure\packages\operations-plugin\src\operations.plugin.ts` 的 adminApiExtensions schema 中，CMS 段的 mutation（当前 L170-175）：

```graphql
            extend type Mutation {
                createContentItem(input: CreateContentItemInput!): ContentItem!
                updateContentItem(id: ID!, input: UpdateContentItemInput!): ContentItem!
                deleteContentItem(id: ID!): Boolean!
                triggerContentLifecycle: ContentLifecycleResult!
            }
```

改为：

```graphql
            extend type Mutation {
                createContentItem(input: CreateContentItemInput!): ContentItem!
                updateContentItem(id: ID!, input: UpdateContentItemInput!): ContentItem!
                deleteContentItem(id: ID!): Boolean!
                triggerContentLifecycle: ContentLifecycleResult!

                # 商品展示值（销量/可得积分）重算；省略 productIds = 全量重算。返回实际被更新的商品数。
                recomputeProductStats(productIds: [ID!]): Int!
            }
```

- [ ] **Step 5: 注册 service 到 providers**

同文件 `providers` 数组（当前 L28-35）末尾追加 `ProductStatsService`：

```ts
    providers: [
        OperationsDashboardService,
        ContentService,
        FlashSaleMarketingService,
        GroupBuyMarketingService,
        CouponMarketingService,
        MarketingOverviewService,
        ProductStatsService,
    ],
```

并在文件顶部 import 区（`import { OperationsAdminResolver } from './operations-admin.resolver';` 之前）加：

```ts
import { ProductStatsService } from './product-stats.service';
```

- [ ] **Step 6: 导出 service**

`d:\zhao\vendure\packages\operations-plugin\src\index.ts` 追加一行：

```ts
export * from './product-stats.service';
```

- [ ] **Step 7: 跑 e2e 确认用例 1–3、5 通过**

Run:
```powershell
cd d:\zhao\vendure\packages\operations-plugin; npm run e2e -- product-stats
```
Expected: PASS（**实测修正**：本步为 4 passed；Task 5 补用例 6 后 5 passed；Task 7 补用例 7 后 6 passed）。用例 1 的 `recompute` 返回 `1`、用例 2/5 的第二次调用返回 `0` 均为确定性断言（订单创建不触发 ProductEvent，且改动后已 `settle()`）。**附加修正**：用例 2/3 的断言依赖「写回公式」本身，为使其在 Task 4（事件订阅尚未上线）就能真绿，两处 `await settle();` 之后各插一行不具名返回值的 `await recompute([productId]);` —— Task 4 阶段真执行重算，Task 5 订阅上线后退化为 no-op（返回 0，不断言其返回值）；「订阅即时生效」由用例 6 单独守护。

- [ ] **Step 8: 提交**

```powershell
cd d:\zhao\vendure; git add packages/operations-plugin/src/product-stats.service.ts packages/operations-plugin/src/operations-admin.resolver.ts packages/operations-plugin/src/operations.plugin.ts packages/operations-plugin/src/index.ts packages/operations-plugin/e2e/product-stats.e2e-spec.ts packages/operations-plugin/package.json; git commit -m "feat(operations-plugin): ProductStatsService + recomputeProductStats 管理端重算接口（含 e2e）"
```

---

## Task 5: 每日定时任务 + 事件订阅（后台改动即时生效）

**Files:**
- Create: `d:\zhao\vendure\packages\operations-plugin\src\product-stats.task.ts`
- Create: `d:\zhao\vendure\packages\operations-plugin\src\product-stats.subscriber.ts`
- Modify: `d:\zhao\vendure\packages\operations-plugin\src\operations.plugin.ts`
- Modify: `d:\zhao\vendure\packages\operations-plugin\e2e\product-stats.e2e-spec.ts`

- [ ] **Step 1: 先加「即时生效」失败用例**

在 `d:\zhao\vendure\packages\operations-plugin\e2e\product-stats.e2e-spec.ts` 的 `用例5 全量重算覆盖多商品并收敛` 之后（`describe` 闭合 `});` 之前）追加：

```ts
    it('用例6 后台改基数后无需手动重算即生效（事件订阅）', async () => {
        await adminClient.query(gql`
            mutation {
                updateProduct(input: { id: "${productId}", customFields: { bonusSales: 7 } }) { id }
            }
        `);
        await settle();

        const stats = await readStats();
        expect(stats.salesCount).toBe(9); // realSalesCount 2 + bonusSales 7
    });
```

- [ ] **Step 2: 跑用例确认失败**

Run:
```powershell
cd d:\zhao\vendure\packages\operations-plugin; npm run e2e -- product-stats
```
Expected: FAIL — `用例6` 收到 `salesCount: 102`，断言 `expected 102 to be 9`（尚无事件订阅）。

- [ ] **Step 3: 创建每日任务**

创建 `d:\zhao\vendure\packages\operations-plugin\src\product-stats.task.ts`：

```ts
// d:\zhao\vendure\packages\operations-plugin\src\product-stats.task.ts
import { Logger, ScheduledTask } from '@vendure/core';

import { loggerCtx } from './constants';
import { ProductStatsService } from './product-stats.service';

/**
 * @description
 * 每日 03:05 全量重算商品展示销量 / 可得积分。
 * 负责订单驱动的销量收敛（新订单带来的销量变化最多 T+1 生效）。
 *
 * 由 DefaultSchedulerPlugin 在 worker 进程执行（生产必须常驻 `vendure-worker`）。
 * 后台手改与变体价改动的即时生效由 ProductStatsSubscriber 承担。
 */
export const productStatsTask = new ScheduledTask({
    id: 'operations-product-stats',
    description: 'Recompute Product.salesCount / pointsReward custom fields',
    schedule: '5 3 * * *',
    timeout: 600_000,
    preventOverlap: true,
    async execute({ injector, scheduledContext }) {
        const productStatsService = injector.get(ProductStatsService);
        const updated = await productStatsService.recomputeAll(scheduledContext);
        Logger.info(`Product stats recompute: updated=${updated}`, loggerCtx);
        return { updated };
    },
});
```

- [ ] **Step 4: 创建事件订阅**

创建 `d:\zhao\vendure\packages\operations-plugin\src\product-stats.subscriber.ts`：

```ts
// d:\zhao\vendure\packages\operations-plugin\src\product-stats.subscriber.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    ID,
    Logger,
    ProductEvent,
    ProductVariantEvent,
    RequestContextService,
} from '@vendure/core';

import { loggerCtx } from './constants';
import { ProductStatsService } from './product-stats.service';

/**
 * @description
 * 后台改动即时生效：运营改完 bonusSales / pointsRewardOverride，或改完变体价格后，
 * 立刻重算该商品的展示值，不必等次日定时任务。
 *
 * 自激防护：ProductStatsService 写前比对，值无变化则不写库、不发事件，循环最多一轮即终止。
 */
@Injectable()
export class ProductStatsSubscriber implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private productStatsService: ProductStatsService,
        private requestContextService: RequestContextService,
    ) {}

    onApplicationBootstrap(): void {
        this.eventBus.ofType(ProductEvent).subscribe(event => {
            if (event.type !== 'created' && event.type !== 'updated') {
                return;
            }
            void this.recomputeForProduct(event.entity.id);
        });

        this.eventBus.ofType(ProductVariantEvent).subscribe(event => {
            if (event.type !== 'created' && event.type !== 'updated' && event.type !== 'deleted') {
                return;
            }
            const productId = (event.entity as any).productId;
            void this.recomputeForProduct(productId);
        });
    }

    private async recomputeForProduct(productId: ID | undefined): Promise<void> {
        if (productId == null) {
            return;
        }
        try {
            // 用新建的非事务 ctx：事件可能在事务中发出，复用事件 ctx 会把重算卷进该事务。
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            await this.productStatsService.recomputeForProducts(ctx, [productId]);
        } catch (err: any) {
            Logger.error(`Product stats recompute failed: ${err?.message ?? err}`, loggerCtx);
        }
    }
}
```

- [ ] **Step 5: 插件里注册任务与订阅者**

`d:\zhao\vendure\packages\operations-plugin\src\operations.plugin.ts` 三处改动：

(a) import 区加两行（放在 `import { OperationsAdminResolver } from './operations-admin.resolver';` 之后）：

```ts
import { ProductStatsService } from './product-stats.service';
import { ProductStatsSubscriber } from './product-stats.subscriber';
import { productStatsTask } from './product-stats.task';
```

(b) `providers` 数组末尾追加 `ProductStatsSubscriber`：

```ts
    providers: [
        OperationsDashboardService,
        ContentService,
        FlashSaleMarketingService,
        GroupBuyMarketingService,
        CouponMarketingService,
        MarketingOverviewService,
        ProductStatsService,
        ProductStatsSubscriber,
    ],
```

(c) `configuration` 钩子里，把 `contentLifecycleTask` 注册段（当前 L405-416）整段替换为：

```ts
    configuration: (config) => {
        // 注册 ScheduledTask：内容自动上下线 + 商品展示值每日重算
        if (!config.schedulerOptions) {
            config.schedulerOptions = { tasks: [] } as any;
        }
        if (!config.schedulerOptions.tasks) {
            config.schedulerOptions.tasks = [];
        }
        for (const task of [contentLifecycleTask, productStatsTask]) {
            if (!config.schedulerOptions.tasks.some(t => t.id === task.id)) {
                config.schedulerOptions.tasks.push(task);
            }
        }
```

- [ ] **Step 6: 跑 e2e 确认全绿**

Run:
```powershell
cd d:\zhao\vendure\packages\operations-plugin; npm run e2e -- product-stats
```
Expected: PASS（5 passed）。

- [ ] **Step 7: 提交**

```powershell
cd d:\zhao\vendure; git add packages/operations-plugin/src/product-stats.task.ts packages/operations-plugin/src/product-stats.subscriber.ts packages/operations-plugin/src/operations.plugin.ts packages/operations-plugin/e2e/product-stats.e2e-spec.ts; git commit -m "feat(operations-plugin): 商品展示值每日重算任务 + 后台改动即时生效订阅"
```

---

## Task 6: 插件接口文档

**Files:**
- Create: `d:\zhao\vendure\docs\plugins\operations-plugin.md`
- Modify: `d:\zhao\vendure\docs\plugins\README.md`

- [ ] **Step 1: 新建 `operations-plugin.md`**

创建 `d:\zhao\vendure\docs\plugins\operations-plugin.md`：

````markdown
# OperationsPlugin 运营中台插件

## 概述

`OperationsPlugin` 为 Vendure 提供运营侧统一能力：经营看板聚合、CMS 内容管理（Banner / 推荐位 / 公告 / 楼层 / 图标宫格 / 分类导航，单表多态 + 软删除 + 定时上下线）、营销活动统一管理（秒杀 / 拼团 / 优惠券），以及商品展示值（销量 / 可得积分）重算。

**核心特性：**
- 经营看板：销售 / 配送 / 客户 / 库存 / 售后 / 营销六类指标，含销售趋势与分类 Top
- CMS：`ContentItem` 单表多态，`startAt` / `endAt` 到点自动上下线（每日任务 + 每分钟任务）
- 营销：秒杀 / 拼团 / 优惠券的活动 CRUD 与总览（统一走细分权限）
- 商品展示值：`Product.salesCount`（销量）与 `Product.pointsReward`（可得积分）由订单与价格派生并落库，C 端直读

**包名：** `@vendure/operations-plugin`

**类名：** `OperationsPlugin`

---

## 安装

```bash
npm install @vendure/operations-plugin
```

---

## 配置说明

在 `vendure-config.ts` 中注册插件：

```ts
import { OperationsPlugin } from '@vendure/operations-plugin';

export const config = {
  // ...
  plugins: [
    OperationsPlugin.init(),
  ],
};
```

插件注册时会：

- 注册 `ScheduledTask`：`operations-content-lifecycle`（每分钟）、`operations-product-stats`（每日 03:05）
- 合并自定义字段：`Product.displayTemplate`、`Channel.themeId`
- 订阅 `ProductEvent` / `ProductVariantEvent`（商品展示值即时重算）

> 任务只在 worker 进程执行（`schedulerOptions.runTasksInWorkerOnly`）。生产必须常驻一个 worker 进程，否则不会有任何 ScheduledTask 运行。

---

## 数据模型：商品展示值相关自定义字段

字段定义在 `@vendure/marketplace-plugin` 的 `Product`（`custom-fields.ts`，Product 字段唯一来源）。

| 字段 | 类型 | public | 可空 | 默认 | 说明 |
|------|------|--------|------|------|------|
| `salesCount` | `Int` | 是 | 否 | `0` | **展示销量** = `realSalesCount + bonusSales`，由重算写回；C 端直读 |
| `realSalesCount` | `Int` | 否 | 否 | `0` | 真实聚合销量，后台可核对 |
| `bonusSales` | `Int` | 否 | 否 | `0` | 后台展示基数（运营手填） |
| `pointsReward` | `Int` | 是 | 是 | — | **展示积分** = `pointsRewardOverride ?? 派生值`，由重算写回；C 端直读 |
| `pointsRewardOverride` | `Int` | 否 | 是 | — | 后台单品覆盖值 |

> `public: true` 只给两个**展示值**，内部字段不进 Shop API；Admin API 始终可见全部 5 个字段，Vendure 会自动在商品编辑页渲染表单控件，无需自研 dashboard 组件。

---

## 计算口径

### 销量

```
realSalesCount(product) = Σ orderLine.quantity
    WHERE orderLine.productVariant.productId = product.id
      AND order.state IN ('PaymentSettled','PartiallyShipped','Shipped','PartiallyDelivered','Delivered')
```

- 状态白名单即「已支付及之后」；`AddingItems` / `ArrangingPayment` / `PaymentAuthorized` / `Modifying` / `Draft` / `Cancelled` 天然排除。
- **全渠道合计**：`Product` 是全局实体，销量不按渠道拆分。
- 退款**不回退**销量（历史成交口径）。

### 可得积分

```
最低变体价 = MIN(product_variant_price.price)   // 全渠道最低，不含税，单位分
pointsReward = pointsRewardOverride ?? floor(最低变体价 × 1)
```

- 与会员实发规则（`member-level-plugin`）口径对齐的维度：基数取不含税价、取整用 `Math.floor`。
- 倍率差异：会员实发按档位 `tier.pointsMultiplier` 计（未登录不可知），详情页统一按 **×1** 展示，是下界而不会误导为「可得更多」。
- 积分折算：`Channel.pointsPerYuan` 默认 100（100 积分抵 1 元），1 分 = 1 积分 ⇒ ¥99 商品「可得 9900 积分」。
- 取**全渠道**最低价而非当前渠道，是为了让重算结果与执行上下文（渠道）无关，保证幂等。

### 写回

```
salesCount   = realSalesCount + bonusSales
pointsReward = pointsRewardOverride ?? floor(最低变体价 × 1)
```

**写前比对**：与库中现值逐字段比较，完全一致则不调用 `ProductService.update` —— 既避免无谓写入，也切断 `ProductEvent` 自激循环。

---

## 重算触发路径

| 路径 | 时机 | 负责范围 |
|------|------|----------|
| 每日定时任务 `operations-product-stats` | 每日 03:05（worker 进程） | 订单驱动：新订单带来的销量变化最多 T+1 收敛 |
| 事件订阅 | `ProductEvent`(created/updated)、`ProductVariantEvent`(created/updated/deleted) | 后台改基数/覆盖值、改变体价后**即时**刷新 |
| 手动 mutation `recomputeProductStats` | 运营/部署后按需 | 一次性回填、纠偏 |

---

## GraphQL API 参考

### Admin API

#### Mutation

| 接口 | 权限 | 说明 |
|------|------|------|
| `recomputeProductStats(productIds: [ID!]): Int!` | `UpdateProduct` | 重算商品展示值，返回**实际被更新**的商品数；`productIds` 省略或传空数组 = 全量重算 |

**全量回填（部署后一次性执行）**

```graphql
mutation {
  recomputeProductStats
}
```

**指定商品纠偏**

```graphql
mutation RecomputeOne($ids: [ID!]) {
  recomputeProductStats(productIds: $ids)
}
```

### 其它 Admin API

| 接口 | 权限 | 说明 |
|------|------|------|
| `dashboardOverview(range: String!): DashboardMetrics!` | `ViewDashboard` | 看板六类指标，`range ∈ today/yesterday/week/month` |
| `salesTrend(days: Int!): [SalesTrendPoint!]!` | `ViewDashboard` | 销售趋势，`days ∈ 7/30` |
| `categoryTop(days: Int!): [CategoryTopItem!]!` | `ViewDashboard` | 分类 Top，`days ∈ 7/30` |
| `contentItems(type, position, enabled, page, pageSize): ContentItemList!` | 按 `type` 动态判定 | CMS 列表 |
| `contentItem(id: ID!): ContentItem` | 按 `type` 动态判定 | CMS 详情 |
| `createContentItem / updateContentItem / deleteContentItem` | 按 `type` 动态判定 | CMS 写操作 |
| `triggerContentLifecycle: ContentLifecycleResult!` | `ManageContent` | 手动触发一次内容上下线检查 |
| `marketingOverview` / `marketingFlashSale*` / `marketingGroupBuy*` / `marketingCoupon*` | 见 `MarketingAdminResolver` | 营销活动统一管理 |

CMS 的 `type → 权限` 映射：`Banner → ManageBanner`、`Recommendation → ManageRecommendation`、`Notice → ManageNotice`、`Floor → ManageFloor`、`IconGrid` / `CategoryNav → ManageContent`。

### Shop API

| 接口 | 说明 |
|------|------|
| `publishedContent(type: String, position: String): [ContentItemPublic!]!` | 按类型/位置取已启用内容（过滤 `startAt`/`endAt`/`enabled`/未软删） |

商品展示值不在 Shop API 新增接口：直接读 `Product.customFields.salesCount` / `pointsReward`。

---

## 与其他插件集成

| 插件 | 关系 | 说明 |
|------|------|------|
| `@vendure/marketplace-plugin` | **字段来源** | 5 个展示值字段定义在 marketplace-plugin 的 Product 自定义字段清单 |
| `@vendure/flash-sale-plugin` / `@vendure/group-buy-plugin` / `@vendure/coupon-plugin` | 必需 | 插件 `imports` 中注册，营销总览与活动管理依赖 |
| `@vendure/delivery-plugin` | 权限体系 | 权限定义（`ViewDashboard` / `Manage*`）随 delivery-plugin 注册 |
| `@vendure/member-level-plugin` | 口径对齐 | 可得积分派生的基数与取整口径对齐会员实发规则 |

---

## 注意事项

- **worker 必须常驻**：任务只在 worker 执行，停掉 worker 后销量不再每日收敛。
- **最多 T+1**：订单带来的销量变化由每日任务收敛，不等同实时。
- **不按渠道拆分销量**：详情页展示本身不区分店铺来源，按渠道存需要额外结构，收益不抵成本。
- **退款不回退销量**：与主流电商「已售」口径一致（历史成交）。
- **事件订阅在两个进程都会触发**：server 与 worker 各自订阅，重复重算幂等、无副作用。
````

- [ ] **Step 2: 更新插件索引**

`d:\zhao\vendure\docs\plugins\README.md` 两处：

(a) L3：

```
基于 Vendure v3.6.x 的中国电商本地化插件集，包含 16 个独立插件包，覆盖支付、物流、认证、营销等核心场景。
```

改为：

```
基于 Vendure v3.6.x 的中国电商本地化插件集，包含 17 个独立插件包，覆盖支付、物流、认证、营销等核心场景。
```

(b) 「业务功能」表格（L32-38）末尾追加一行：

```markdown
| [运营中台](./operations-plugin.md) | `@vendure/operations-plugin` | 经营看板、CMS 内容管理、营销活动统一管理、商品销量/积分重算 |
```

- [ ] **Step 3: 校验索引指向的文件存在**

Run:
```powershell
Test-Path d:\zhao\vendure\docs\plugins\operations-plugin.md; Select-String -Path d:\zhao\vendure\docs\plugins\README.md -Pattern "operations-plugin.md" | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `True` 然后 `1`

- [ ] **Step 4: 提交**

```powershell
cd d:\zhao\vendure; git add docs/plugins/operations-plugin.md docs/plugins/README.md; git commit -m "docs(operations-plugin): 补插件接口手册与索引"
```

---

## Task 7: 构建 dist 并推送

**Files:**
- Modify: `d:\zhao\vendure\packages\operations-plugin\dist\**`（`npm run build` 产物）
- Modify: `d:\zhao\vendure\packages\marketplace-plugin\dist\**`（Task 1 已构建）

- [ ] **Step 1: 构建 operations-plugin**

Run:
```powershell
cd d:\zhao\vendure\packages\operations-plugin; npm run build
```
Expected: `dist\product-stats.service.js`、`dist\product-stats.task.js`、`dist\product-stats.subscriber.js` 出现。**实测修正：退出码不是 0，而是 2** —— `operations-plugin` 有**既有** tsc 报错（`src/marketing/coupon.service.ts` 11 条 `error TS2339: Property 'getCoupons' does not exist on type 'CouponService'`，该 wrapper 写于 2026-07-29、调用的是 coupon-plugin 2026-09-19 重构前的旧 API），**非本轮引入、不修**；因 root `tsconfig.json` 无 `noEmitOnError`，tsc 仍正常 emit JS ⇒ 构建目标达成（实测 dist 三文件齐全，提交文件数 = 11，无大面积重写）。

- [ ] **Step 2: 确认新文件在 dist**

Run:
```powershell
Test-Path d:\zhao\vendure\packages\operations-plugin\dist\product-stats.service.js, d:\zhao\vendure\packages\operations-plugin\dist\product-stats.task.js, d:\zhao\vendure\packages\operations-plugin\dist\product-stats.subscriber.js
```
Expected: `True True True`

> **不需要重建 `dev-server/dist`**：`dev-config.ts` 未改动（`OperationsPlugin` 早已注册），`dev-server/dist` 是纯 `tsc` 产物，运行时按 `require('@vendure/operations-plugin')` 解析到本包的 `dist`。

- [ ] **Step 3: 提交 dist 并推送**

```powershell
cd d:\zhao\vendure; git add packages/operations-plugin/dist; git commit -m "build(operations-plugin): 重建 dist 以收录商品展示值重算"; git push
```

---

## Task 8: 后端部署 + 一次性回填 + 生产探针

- [ ] **Step 1: 服务器拉取并重启**

Run:
```powershell
ssh joho 'cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure vendure-worker'
```

> PowerShell 注意：给 `ssh` 的远程脚本用**外层单引号**，否则 `$` 会被本机插值。

- [ ] **Step 2: 等待 worker 起来**

Run:
```powershell
Start-Sleep -Seconds 45; ssh joho 'pm2 list'
```
Expected: `vendure` 与 `vendure-worker` 均为 `online`，`restarts` 数不持续增长（冷启动 30–60s 期间 `/shop-api` 会 502，属正常）。

- [ ] **Step 3: 一次性全量回填**

Run:
```powershell
$login = Invoke-RestMethod -Uri 'https://e.joho.cn/admin-api' -Method Post -ContentType 'application/json' -Body '{"query":"mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }","variables":{"u":"superadmin","p":"superadmin"}}' -SessionVariable sess
$login | ConvertTo-Json -Depth 6
$re = Invoke-RestMethod -Uri 'https://e.joho.cn/admin-api' -Method Post -ContentType 'application/json' -WebSession $sess -Body '{"query":"mutation { recomputeProductStats }"}'
$re | ConvertTo-Json -Depth 6
```
Expected: 登录返回 `data.login.id` 非空；回填返回 `{"data":{"recomputeProductStats":<非零整数>}}`。

> 若生产管理员账号不是 `superadmin` / `superadmin`，改用运营实际账号。回填返回的是**实际被更新**的商品数；若此前已有人跑过一次，第二次会返回 `0`（幂等），属正常。

- [ ] **Step 4: Shop API 探针**

Run:
```powershell
$q = '{"query":"query { products(options: { take: 3 }) { totalItems items { name slug customFields { salesCount pointsReward } } } }"}'
Invoke-RestMethod -Uri 'https://e.joho.cn/shop-api' -Method Post -ContentType 'application/json' -Body $q | ConvertTo-Json -Depth 8
```
Expected: `items` 每项 `customFields` 含 `salesCount` 与 `pointsReward`（无变体的商品 `pointsReward` 为 `null`）。字段能返回即证明 5 个自定义字段的列已在生产 `product` 表建好（`synchronize=true` 重启自动建列）。

- [ ] **Step 5: 记录实际提交号与回填结果**

把 Step 1 的 `git pull` 输出（或 `ssh joho 'cd /www/apps/vendure && git rev-parse --short HEAD'`）与 Step 3 的更新数记下来，Task 11 要写进文档。

---

## Task 9: 前端接线（fragment + i18n）

**前置条件：确认并行会话（评价体系前端）已停止。** 未停止则本 Task 全部阻塞，不得动手。

**Files:**
- Modify: `d:\zhao\vshop\src\api\fragments.ts`
- Modify: `d:\zhao\vshop\src\pkg-product\pages\detail.vue`
- Modify: `d:\zhao\vshop\src\i18n\locales\zh-CN.json`
- Modify: `d:\zhao\vshop\src\i18n\locales\en.json`
- Modify: `d:\zhao\vshop\src\i18n\locales\zh-TW.json`
- Modify: `d:\zhao\vshop\src\i18n\locales\ja.json`
- Modify: `d:\zhao\vshop\src\i18n\locales\ko.json`

- [ ] **Step 1: 补 fragment 字段**

`d:\zhao\vshop\src\api\fragments.ts` 的 `PRODUCT_DETAIL_FRAGMENT`（L22）：

```
        customFields { videoAssetId sellingPoint }
```

改为：

```
        customFields { videoAssetId sellingPoint salesCount pointsReward }
```

- [ ] **Step 2: 元信息行「已售」走 i18n**

`d:\zhao\vshop\src\pkg-product\pages\detail.vue` L30-32：

```html
        <view class="meta-row__item" v-if="salesCountText">
          <text class="meta-row__text">已售 {{ salesCountText }}</text>
        </view>
```

改为：

```html
        <view class="meta-row__item" v-if="salesCountText">
          <text class="meta-row__text">{{ t('product.sold') }} {{ salesCountText }}</text>
        </view>
```

> `product.sold` 是**既有 key**（5 个语言包均已定义、此前代码中从未被引用），零新增。

- [ ] **Step 3: 「可得 X 积分」走 i18n**

同文件 `pointsText` computed（L172-175）：

```ts
const pointsText = computed(() => {
    const n = (product.value as any)?.customFields?.pointsReward;
    return Number.isFinite(Number(n)) && Number(n) > 0 ? `可得 ${n} 积分` : '';
});
```

改为：

```ts
const pointsText = computed(() => {
    const n = (product.value as any)?.customFields?.pointsReward;
    return Number.isFinite(Number(n)) && Number(n) > 0 ? t('product.pointsReward', { n }) : '';
});
```

> 同文件 L121 已有 `const { t } = useI18n();`，无需新增引入；`v-if="pointsText"` 的降级逻辑不动。

- [ ] **Step 4: 5 个语言包补 `pointsReward`**

在最前面那个（`t('product.sold')` 要用的）`sold` 与 `stock` 之间不动，改为在 `stock` 之后追加 `pointsReward`。5 个文件结构相同（`product` 段位于 L48-56），逐个按下表把

```
        "stock": "<原值>"
```

改为

```
        "stock": "<原值>",
        "pointsReward": "<下表值>"
```

| 文件 | `<原值>` | 新增值 |
|---|---|---|
| `zh-CN.json` | `库存` | `"pointsReward": "可得 {n} 积分"` |
| `en.json` | `Stock` | `"pointsReward": "Earn {n} points"` |
| `zh-TW.json` | `庫存` | `"pointsReward": "可得 {n} 積分"` |
| `ja.json` | `在庫` | `"pointsReward": "獲得 {n} ポイント"` |
| `ko.json` | `재고` | `"pointsReward": "{n} 포인트 적립"` |

- [ ] **Step 5: 校验 5 个语言包都补齐且 JSON 合法**

Run:
```powershell
Get-ChildItem d:\zhao\vshop\src\i18n\locales\*.json | ForEach-Object { $o = Get-Content $_.FullName -Raw | ConvertFrom-Json; "$($_.Name): pointsReward=$($o.product.pointsReward) | sold=$($o.product.sold)" }
```
Expected: 5 行，每行都非空，例如
```
en.json: pointsReward=Earn {n} points | sold=Sold
ja.json: pointsReward=獲得 {n} ポイント | sold=販売済み
ko.json: pointsReward={n} 포인트 적립 | sold=판매됨
zh-CN.json: pointsReward=可得 {n} 积分 | sold=已售
zh-TW.json: pointsReward=可得 {n} 積分 | sold=已售
```

- [ ] **Step 6: 构建通过**

Run:
```powershell
cd d:\zhao\vshop; npm run build:h5
```
Expected: 构建成功、退出码 0。

- [ ] **Step 7: 提交**

```powershell
cd d:\zhao\vshop; git add src/api/fragments.ts src/pkg-product/pages/detail.vue src/i18n/locales/zh-CN.json src/i18n/locales/en.json src/i18n/locales/zh-TW.json src/i18n/locales/ja.json src/i18n/locales/ko.json; git commit -m "feat(product): 详情页接入销量/积分展示并走 i18n"
```

---

## Task 10: 前端部署 + 手机视口截图

- [ ] **Step 1: 本地构建并上传 H5 产物**

Run:
```powershell
cd d:\zhao\vshop; npm run build:h5; tar -czf dist-h5.tar.gz -C dist/build/h5 .; scp dist-h5.tar.gz joho:/tmp/
```
Expected: 打包无报错，`scp` 传输完成。

- [ ] **Step 2: 服务器解压到站点目录**

Run:
```powershell
ssh joho "cd /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index && sudo tar -xzf /tmp/dist-h5.tar.gz && rm -f /tmp/dist-h5.tar.gz"
```
Expected: 解压无报错。**不在服务器执行任何构建命令**（服务器内存不足）。

- [ ] **Step 3: 造「有数据」的演示商品**

后台给一个真实商品（用于截图）配好展示值，然后手动重算。用与 Task 8 相同的登录方式：

```powershell
$login = Invoke-RestMethod -Uri 'https://e.joho.cn/admin-api' -Method Post -ContentType 'application/json' -Body '{"query":"mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }","variables":{"u":"superadmin","p":"superadmin"}}' -SessionVariable sess
$pid = ($login; (Invoke-RestMethod -Uri 'https://e.joho.cn/admin-api' -Method Post -ContentType 'application/json' -WebSession $sess -Body '{"query":"query { products(options: { take: 1 }) { items { id name slug } } }"}')).data.products.items[0].id
$pid
Invoke-RestMethod -Uri 'https://e.joho.cn/admin-api' -Method Post -ContentType 'application/json' -WebSession $sess -Body ('{"query":"mutation($id: ID!){ updateProduct(input: { id: $id, customFields: { bonusSales: 120 } }) { id } }","variables":{"id":"' + $pid + '"}}') | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'https://e.joho.cn/admin-api' -Method Post -ContentType 'application/json' -WebSession $sess -Body '{"query":"mutation { recomputeProductStats }"}' | ConvertTo-Json -Depth 6
```
Expected: 返回的 `$pid` 非空；`updateProduct.id` 非空；`recomputeProductStats` 为非零整数。

> 记下这个商品的 `slug`，Step 4 要按它打开详情页。

- [ ] **Step 4: 生产数据核对（有数据商品）**

Run:
```powershell
$q = '{"query":"query { products(options: { take: 3 }) { items { name slug customFields { salesCount pointsReward } } } }"}'
Invoke-RestMethod -Uri 'https://e.joho.cn/shop-api' -Method Post -ContentType 'application/json' -Body $q | ConvertTo-Json -Depth 8
```
Expected: 目标商品 `salesCount >= 120` 且 `pointsReward > 0`。

- [ ] **Step 5: 手机视口截图（390×844 / dpr=2）**

在 `d:\zhao\vshop\web-admin\scripts\_vshop_usemall_shots.mjs` 里已有的截图流程基础上执行（脚本固定 `MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 }`，落盘到 `docs/superpowers/manual/vshop-usemall-alignment/assets/`）：

```powershell
cd d:\zhao\vshop; node web-admin/scripts/_vshop_usemall_shots.mjs
```
Expected: 产出商品详情页截图。至少需要覆盖 3 张：

| 文件名（示例） | 场景 |
|---|---|
| `product-detail-stats.png` | 有数据：元信息行显示「已售 N」「可得 X 积分」 |
| `product-detail-nostats.png` | 无数据：两个 `v-if` 都不渲染，整行不占位（取一个 `salesCount = 0` 且 `pointsReward` 为 `null` 的商品） |
| `product-detail-stats-en.png` | 切语言后：同商品显示 `Sold N` / `Earn X points`，验证两个 key 即时生效 |

> 若脚本无「切语言」能力，用同脚本的 Playwright 上下文手动切语言后截图，或临时加一个 `--lang` 分支；截图必须落进上述 assets 目录，Task 11 要把它写进操作手册。

- [ ] **Step 6: 核对截图**

Run:
```powershell
Get-ChildItem d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\assets\product-detail-*.png | Select-Object Name, Length
```
Expected: 3 个文件，`Length > 0`，且逐个打开确认「有数据 / 无数据 / 切语言」三种形态正确（无数据那张元信息行只剩「分享 / 海报」）。

---

## Task 11: 文档收尾与收口提交

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md`
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\BACKLOG.md`
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-09-29-vshop-product-stats-design.md`

- [ ] **Step 1: 手册 §5.3 改为已交付**

`d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md` L194：

```markdown
| 销量/积分元信息 | 无数据源，采用「有则显示」降级，本轮不新增后端字段（spec R6/R7） |
```

改为（`<vendure提交号>` 用 Task 8 Step 5 记录的前端提交号、`<vshop提交号>` 用 Task 9 Step 7 的提交号）：

```markdown
| 销量/积分元信息 | ~~无数据源，采用「有则显示」降级，本轮不新增后端字段~~ → **已交付**：后端补 `Product.salesCount` / `pointsReward` 等 5 个自定义字段 + 每日重算任务 + 事件即时生效 + `recomputeProductStats` 回填接口（vendure `<vendure提交号>`），前端补 fragment 字段并让两处文案走 i18n（vshop `<vshop提交号>`）。口径：销量 = 已支付及之后订单聚合（全渠道）+ 后台基数；积分 = 最低变体不含税价派生（×1 下界），可单品覆盖 |
```

- [ ] **Step 2: 手册补截图行**

`d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md` 的 §5.3 表格之后追加：

```markdown
### 5.11 商品详情页销量 / 积分展示（含截图）

| 截图 | 场景 |
|---|---|
| ![有数据](assets/product-detail-stats.png) | 有数据：「已售 N」「可得 X 积分」正常展示 |
| ![无数据](assets/product-detail-nostats.png) | 无数据：两个 `v-if` 均不渲染，元信息行只剩「分享 / 海报」，不占位 |
| ![切语言](assets/product-detail-stats-en.png) | 切换语言为 en 后：`Sold N` / `Earn X points`，验证 `product.sold` 与 `product.pointsReward` 即时生效 |

- 视口 390×844、dpr=2（780×1688）。
- 数据来源：`GET /shop-api` 的 `Product.customFields.{salesCount,pointsReward}`（`public: true`，C 端只读展示值）。
- 后台维护：商品编辑页可直接改「展示基数」（`bonusSales`）与「可得积分覆盖值」（`pointsRewardOverride`），改完即时重算；「真实销量」（`realSalesCount`）只读，供核对。
```

- [ ] **Step 3: 更新 BACKLOG**

`d:\zhao\vshop\web-admin\docs\superpowers\BACKLOG.md` L57：

```markdown
| 销量 / 积分补数据源 | 延后 | 需后端补商品自定义字段并回填；有数据才渲染，无数据不占位 |
```

改为：

```markdown
| 销量 / 积分补数据源 | **已交付**（2026-09-29） | 后端 `Product.salesCount`/`pointsReward` + 每日重算 + 事件即时生效 + `recomputeProductStats` 回填；前端 fragment 接线 + i18n 两处。遗留项见 §4 |
```

同文件 §4（L137）：

```markdown
| 销量 / 积分数据源 | 需确认后端是否补商品自定义字段并回填历史数据（涉及数据决策） |
```

改为：

```markdown
| 销量 / 积分数据源 | **已消解**（2026-09-29）：数据源已交付并回填。明确不做：按渠道拆分销量 / 列表页与首页楼层展示 / 商品列表销量排序 / 积分随会员档位变化（见 spec §10 遗留项） |
```

- [ ] **Step 4: 补 spec 口径澄清**

`d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-09-29-vshop-product-stats-design.md` §4.2 里

```markdown
```
basePriceCents(product) = MIN(productVariant.price)          // 不含税，单位「分」
```

改为：

```markdown
```
basePriceCents(product) = MIN(ProductVariantPrice.price)     // 不含税，单位「分」；**全渠道最低价**
```

> 实施澄清（2026-09-29）：`ProductVariant.price` 是 `@Calculated` getter（DB 无该列），价格真身在 `product_variant_price`（每渠道一行）；取**全渠道**最低价而非当前 ctx 渠道，使重算结果与执行上下文无关（定时任务 / 事件订阅 / 手动重算三条路径的 ctx 渠道可能不同），保证幂等。
```

- [ ] **Step 5: 收口提交与推送**

```powershell
cd d:\zhao\vshop; git add web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets web-admin/docs/superpowers/BACKLOG.md web-admin/docs/superpowers/specs/2026-09-29-vshop-product-stats-design.md web-admin/docs/superpowers/plans/2026-09-29-vshop-product-stats-plan.md; git commit -m "docs(product-stats): 手册/ backlog / spec 收口，补手机视口截图"; git push
```

> `assets` 目录按文件名显式添加（不要 `git add -A`）；`dist/build/h5` 若仓库跟踪则一并 `git add dist/build/h5`。

- [ ] **Step 6: 最终核对**

Run:
```powershell
cd d:\zhao\vshop; git status --short; cd d:\zhao\vendure; git status --short
```
Expected: 两个仓库工作区干净（无未提交的本任务文件）。

---

## 自审记录

**1. spec 覆盖**

| spec 章节 | 落地位置 |
|---|---|
| §3 数据模型（5 字段） | Task 1 |
| §4.1 销量聚合口径 | Task 3 `aggregateSales` + Task 2 用例 1 |
| §4.2 积分派生口径 | Task 3 `aggregateMinPrices` + 用例 3（口径澄清见「实现口径澄清」表） |
| §4.3 写回规则 | Task 3 `recomputeForProducts` |
| §5.1 服务 + 写前比对 | Task 3 |
| §5.2 每日任务 | Task 5 Step 3 + Step 5(c) |
| §5.3 事件即时生效（含自激防护） | Task 5 Step 4 + 用例 6 |
| §5.4 手动重算接口 + 权限 | Task 4 |
| §6 前端接线（fragment + 2 处 i18n + 5 语言包） | Task 9 |
| §7.1 e2e 5 用例 | Task 2/3/4/5（用例 1–5 + 追加用例 6） |
| §7.2 生产验证 | Task 8 Step 3/4 |
| §7.3 手机视口截图 3 张 | Task 10 Step 5/6 |
| §7.4 文档（新建插件文档 + README 索引 + 手册 + BACKLOG） | Task 6 + Task 11 |
| §8 部署（本地构建 / git pull + pm2 / 回填 / 前端） | Task 7 / 8 / 10 |

**2. 占位符扫描**：无 `TBD` / `TODO` / 「类似 Task N」/「补充错误处理」；每个代码步都给了可直接粘贴的完整代码；只有 `<vendure提交号>` / `<vshop提交号>` 两处是「执行后才产生的值」，已在同一步说明其来源（Task 8 Step 5 / Task 9 Step 7）。

**3. 类型与命名一致性**：`ProductStatsService.recomputeForProducts(ctx, productIds)` / `recomputeAll(ctx)` / `COUNTED_ORDER_STATES` / `productStatsTask` / `ProductStatsSubscriber` / `recomputeProductStats(productIds: [ID!]): Int!` 在 service、task、subscriber、resolver、schema、e2e、文档中命名一致。

**4. 与 spec §7.1 的两处有意偏差（已在计划内注明理由）**

- 「返回更新数」的断言只放在**不受事件订阅干扰**的场景（用例 1 首次重算 = 1；用例 2/3/5 收敛后 = 0）。原因是后台 `updateProduct` 会触发订阅者异步重算，非零返回值存在竞态，硬断言会 flaky。
- 用例 5（全量重算）以「多商品收敛 + 收敛后返回 0」覆盖，不再硬断言首次调用的非零更新数（同上原因）。

---

## 执行结论（2026-09-29）

**轮次**：单轮 T1–T11 全量执行（subagent 驱动模式），中途发现并修复 1 个生产缺陷后复部署。

**提交号**

| 仓库 | 提交 | 内容 |
|---|---|---|
| vendure | `19589cd98` | `Product` 5 个自定义字段（src + dist） |
| vendure | `0b2e33f3c` | 插件接口文档 + README 索引 |
| vendure | `6a6a11182` | 重建 dist 以收录商品展示值重算 |
| vendure | `004194882` | **修生产缺陷**：全量重算跳过软删除商品 |
| vshop | `4095dda` | 详情页接入销量/积分展示并走 i18n |

**验证手段**

| 手段 | 结果 |
|---|---|
| e2e（vitest + sqljs，端口 3251） | `6 passed (6)` —— 用例 1–5 + 用例 6（订阅即时生效）+ 用例 7（软删除） |
| 编译门禁 | marketplace-plugin `npm run build` 退出码 0；operations-plugin 当期退出码 2（既有 tsc 报错，**已于 2026-09-30 修为 0**，见下「收尾补丁」）但 dist 正常 emit |
| 生产回填 | 第 1 次更新 14 个商品、第 2 次返回 0（幂等） |
| 生产探针 | shop-api 取到真实聚合值（`id=59 sales=7 pts=16800` 等）；设 `bonusSales=120` 后 `salesCount=127` |
| 手机视口截图 | 3 张（390×844 / dpr=2）：有数据 / 无数据降级 / 切 en，逐张目视核对通过 |

**执行中发现的缺陷（已修）**

1. **软删除商品导致全量重算抛错**（生产实测触发）：`Product.deletedAt` 是普通 `@Column`（非 `@DeleteDateColumn`），TypeORM `find()` 不过滤软删除行，而 `ProductService.update` 内部过滤 ⇒ 把软删除商品交给它即抛 `EntityNotFoundError`（`No Product with the id "1" could be found`）。修法：新增 `findAliveProducts()` 用显式 `where('product.deletedAt IS NULL')` 的 QueryBuilder，替换 `recomputeAll` 分页与 `recomputeForProducts` 按 id 两处 `find()`（提交 `004194882`）。红验证：`git stash` 掉修法后用例 7 复现同源报错。
2. **计划 TDD 顺序缺陷**：用例 2/3 断言依赖 Task 5 才上线的事件订阅，导致 Task 4 无法真绿。修法见 Task 4 Step 7「附加修正」。

**遗留项**

| 项 | 状态 |
|---|---|
| `operations-plugin` 既有 tsc 报错（`src/marketing/coupon.service.ts` 11 条 `getCoupons` 不存在） | **已修**（2026-09-30，vendure `f9e53a996`，见下「收尾补丁」）。修复前 root tsconfig 无 `noEmitOnError`，不影响 dist 产出 |
| Task 10 Step 3 的偏差 | 计划原写「`products(options:{take:1})`」直接改首个商品，但首个商品 `slug` 为空会取不到详情页；实际改用真实商品 `id=59 温泉门票`（`slug` 有效）设 `bonusSales=120` |
| Task 10 Step 5 的实现 | 计划给的 `--lang` 分支未采用；实际在 `_vshop_usemall_shots.mjs` 新增 `--only stats` 分支，切语言通过 `#app.__vue_app__` → `provides` 中 vue-i18n 实例改 `global.locale` |
| `dist/build/h5` 未入库 | 计划 Step 5 原写「仓库跟踪则一并 add」，但实测该目录虽被跟踪，**最近一次提交是 v1.5 期的 `c98715e`，v1.7 提交也未含 dist** —— 沿用既有约定**不提交构建产物**（线上以本地构建 + scp 部署为准，仓库 dist 保持 v1.5 快照）。另：本轮收口时工作区存在**并行会话**对 `src/pages/category/index.vue`、`src/templates/shared/sections/GoodsSection.vue` 的改动与其截图，按「只加本任务文件」规则未纳入本次提交 |
| 按渠道拆分销量 / 列表页与首页楼层展示 / 列表销量排序 / 积分随会员档位变化 | 明确不做（见 spec §10、手册 §5.11.5） |

---

### 收尾补丁（2026-09-30）：operations-plugin 券营销死集成清理

本计划收尾时遗留的 `operations-plugin` 11 条 tsc 报错，已单独收口修复（vendure `f9e53a996`）。**与 product-stats 功能无耦合**，仅同属该插件的编译门禁问题。

- **根因**：coupon-plugin 2026-09-19 重构为 `CouponTemplate` + `CustomerCoupon` + `ProductCouponBinding` 后，`src/marketing/coupon.service.ts`（2026-07-29 写的 wrapper）仍调用旧 API `getCoupons`/`getCoupon`/`createCoupon`/`updateCoupon`/`deleteCoupon`/`enableCouponForChannel`/`disableCouponForChannel`（均已不存在）。
- **取证**：全仓库 grep 无任何消费者调用 `marketingCoupons*`；web-admin 的 `src/apis/coupon.ts` 直接用 coupon-plugin 自带的 `couponTemplates/couponTemplate/createCouponTemplate/...` ⇒ **死代码**，整体删除而非改写。
- **顺带修同源静默缺陷**：`marketing-overview.service.ts` 的 `countCouponByStatus` 旧实现 `getRepository(ctx, 'Coupon' as any)` 因实体不存在抛错、被外层 `try/catch` 吞掉 ⇒ `marketingOverview.coupon` 恒为 `0/0/0`；改用 `CouponTemplate`（`enabled`/`startsAt`/`endsAt`，含 `IS NULL` 分支）。生产库实算 `42 模板 / active 28 / upcoming 0 / ended 5`，佐证修复后不再恒 0。
- **附带修正**：`operations-admin.resolver.ts` 的 `recomputeProductStats` 的 `@Args` 由 `() => [ID]` 改为 `() => [String]`（`ID` 在 Vendure 是 `type ID = string | number` 类型别名，非运行时值，不能用于装饰器）。
- **门禁**（全绿）：`npx tsc --noEmit` 退出码 **0**；`npm run build` 退出码 **0**；`npm run e2e` **`8 passed`**（含本计划 6 个 product-stats 用例）。
- **部署**：服务器 `git pull --ff-only` + `pm2 restart vendure vendure-worker` → 两进程 `online`、无启动报错；产物核对 `dist/marketing/` 已无 `coupon.service.*`、`operations.plugin.js` 中 `marketingCoupons` 出现 0 次；生产 `shop-api` 的 `customFields.salesCount/pointsReward` 未受影响。
- **详情**见手册 [§5.13](file:///d:/zhao/vshop/web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md)；遗留项已登记 [BACKLOG §1.6](file:///d:/zhao/vshop/web-admin/docs/superpowers/BACKLOG.md)。
