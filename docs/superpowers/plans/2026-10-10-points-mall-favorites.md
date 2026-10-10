# 积分商品商城 + 商品收藏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 usemall 矩阵外缺口 #1/#4 —— 商品收藏体系 + 积分商品独立下单流（纯积分/积分+现金混合，微信支付）。

**Architecture:** 新建 Vendure 插件 `points-mall-plugin`（4 实体：ProductFavorite/PointsProduct/PointsOrder/PointsOrderPayment），积分扣减复用 member-level-plugin `spendPoints/earnPoints`，现金支付走 wechatpay-plugin 网关（`PO-` 前缀结算注册，参照 recharge-card 模式）。C 端 uni-app 新增 5 页（版式 B 独立入口），web-admin 营销组新增 2 页。

**Tech Stack:** Vendure 3 / TypeORM / NestJS graphql resolvers；uni-app Vue3 `<script setup>`；web-admin Vue3。

**仓库:** 后端 `d:\zhao\vendure`（插件 lib 产物需 build 后入库）；C端与管理端 `d:\zhao\vshop`。

---

## File Structure

```
vendure/packages/points-mall-plugin/
├── package.json                          # name @vendure/points-mall-plugin（抄 shopping-circle-plugin 改名）
├── tsconfig.json / tsconfig.build.json   # 抄 shopping-circle-plugin
├── src/
│   ├── plugin.ts                         # @VendurePlugin + 结算注册
│   ├── types.ts                          # input/view 类型
│   ├── product-favorite.entity.ts        # @Unique(['productId','customerId'])
│   ├── points-product.entity.ts
│   ├── points-order.entity.ts
│   ├── points-order-payment.entity.ts
│   ├── points-mall.service.ts            # 全部业务（收藏/商品/订单/结算）
│   ├── points-mall-shop.resolver.ts
│   └── points-mall-admin.resolver.ts
└── e2e/points-mall.e2e-spec.ts

vshop/src/
├── api/queries/points-mall.ts            # C端 graphql 封装
├── pkg-user/pages/points-goods-list.vue / points-goods-detail.vue / points-goods-confirm.vue / points-orders.vue / favorites.vue
├── pkg-product/pages/detail.vue          # onFavorite 激活（L315-317）
├── pages.json                            # pkg-user 注册 5 页
├── pkg-user/pages/member-center.vue      # quickMenus +1（L135-141）
└── i18n/locales/*.json                   # 5 语言

vshop/web-admin/src/
├── apis/points-mall.ts
├── pages/points/goods/index.vue / orders/index.vue
├── router/index.ts                       # 2 路由
├── constants/menus.ts                    # marketing 组 +2（L99-111）
└── locale/*.json                         # 菜单+页面词条
```

**参照实现（执行前先读）：**
- 插件骨架 `vendure/packages/shopping-circle-plugin/src/plugin.ts`（schema/gql 结构）
- toggle `circle.service.ts:184-238`；resolver 装饰器 `circle.resolvers.ts:36-58`
- 扣分 `member-level-plugin/src/member-level.service.ts:201-213`（`spendPoints(ctx, customerId, amount, orderId?, remark?)`；退款用 `earnPoints(ctx, customerId, amount, orderId, remark)` → EARN 流水）
- 微信支付 `recharge-card-plugin/src/recharge-card.service.ts:286-326`（`createBarePayment({outTradeNo, amount, tradeType, openid, description}, ctx)`；`WechatpayService, resolveCustomerOpenid` 均从 `@vendure/wechatpay-plugin` import）；结算注册 `plugin.ts:323-349`（`WechatpaySettlementRegistry.register({prefix, settle})`）；幂等原子更新 `recharge-card.service.ts:340-351`
- dev-config 注册 `packages/dev-server/dev-config.ts:61,492`
- e2e 骨架 `shopping-circle-plugin/e2e/shopping-circle.e2e-spec.ts:1-31`

---

### Task 1: 插件脚手架 + 4 实体

**Files:**
- Create: `vendure/packages/points-mall-plugin/package.json`、`tsconfig.json`、`tsconfig.build.json`（抄 shopping-circle-plugin 同名文件，仅改 name 为 `@vendure/points-mall-plugin`）
- Create: `src/product-favorite.entity.ts`、`src/points-product.entity.ts`、`src/points-order.entity.ts`、`src/points-order-payment.entity.ts`、`src/types.ts`

- [ ] **Step 1: 建 package/tsconfig**（复制 shopping-circle-plugin 根下三文件，改包名）

- [ ] **Step 2: 写 4 实体**

```ts
// src/product-favorite.entity.ts
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, CreateDateColumn, Entity, Index, Unique } from 'typeorm';

/** 商品收藏行（同 productId+customerId 唯一） */
@Entity()
@Unique(['productId', 'customerId'])
@Index(['customerId', 'channelId'])
export class ProductFavorite extends VendureEntity {
    constructor(input?: DeepPartial<ProductFavorite>) { super(input); }

    @Column() productId: number;
    @Column() customerId: number;
    @Column() channelId: number;
    @CreateDateColumn() favoritedAt: Date;
}
```

```ts
// src/points-product.entity.ts
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/** 积分商品：引用 core 商品/变体 + 兑换配置（积分价按变体生效，同秒杀价口径） */
@Entity()
@Index(['channelId', 'status'])
export class PointsProduct extends VendureEntity {
    constructor(input?: DeepPartial<PointsProduct>) { super(input); }

    @Column() productId: number;
    @Column() variantId: number;
    @Column({ type: 'int' }) pointsPrice: number;      // 每件消耗积分
    @Column({ type: 'int', default: 0 }) cashPrice: number; // 每件现金价（分）；0=纯积分
    /** physical=实物(需地址/发货) virtual=虚拟(直兑到账) */
    @Column({ default: 'physical' }) deliveryType: string;
    @Column({ type: 'int', default: 0 }) stock: number;
    @Column({ type: 'int', default: 0 }) perUserLimit: number;  // 0=不限
    @Column({ type: 'int', default: 0 }) redeemedCount: number;
    @Column({ type: 'datetime', nullable: true }) validFrom: Date | null;
    @Column({ type: 'datetime', nullable: true }) validTo: Date | null; // 虚拟商品兼作核销有效期
    @Column({ default: 'enabled' }) status: string;    // enabled/disabled
    @Column({ type: 'int', default: 0 }) sortOrder: number;
    @Column() channelId: number;
}
```

```ts
// src/points-order.entity.ts
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * 积分订单。状态机：
 *  纯积分+virtual: completed（扣分即完成）
 *  纯积分+physical: pending_ship → shipped → completed
 *  混合价: pending_payment(已扣分+已建支付单) → paid 回调后 → pending_ship/completed
 *  cancelled: 未支付取消（退积分+回补库存）
 */
@Entity()
@Index(['customerId', 'channelId'])
@Index(['channelId', 'status'])
export class PointsOrder extends VendureEntity {
    constructor(input?: DeepPartial<PointsOrder>) { super(input); }

    @Column({ unique: true }) code: string;            // PO-<id>，保存后回写
    @Column() customerId: number;
    @Column() pointsProductId: number;
    /** 商品快照：{ productId, variantId, name, image, spec } */
    @Column({ type: 'simple-json' }) productSnapshot: Record<string, any>;
    @Column({ type: 'int' }) quantity: number;
    @Column({ type: 'int' }) pointsTotal: number;      // pointsPrice * quantity
    @Column({ type: 'int', default: 0 }) cashTotal: number; // cashPrice * quantity（分）
    @Column() deliveryType: string;
    /** 实物必填：{ name, phone, province, city, district, detail } */
    @Column({ type: 'simple-json', nullable: true }) addressSnapshot: Record<string, any> | null;
    @Column() status: string;
    @Column({ type: 'varchar', nullable: true }) trackingNo: string | null;
    @Column({ type: 'datetime', nullable: true }) paidAt: Date | null;
    @Column({ type: 'datetime', nullable: true }) shippedAt: Date | null;
    @Column({ type: 'datetime', nullable: true }) completedAt: Date | null;
    @Column() channelId: number;
}
```

```ts
// src/points-order-payment.entity.ts
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/** 混合价现金支付单（微信），参照 RechargeOrder 的幂等模式 */
@Entity()
@Index(['orderId'])
export class PointsOrderPayment extends VendureEntity {
    constructor(input?: DeepPartial<PointsOrderPayment>) { super(input); }

    @Column() orderId: number;
    @Column() customerId: number;
    @Column({ type: 'int' }) amount: number;           // 分
    @Column({ default: 'pending' }) status: string;    // pending/paid
    @Column({ type: 'varchar', nullable: true }) externalRef: string | null; // outTradeNo
    @Column({ type: 'varchar', nullable: true }) transactionId: string | null;
    @Column({ type: 'datetime', nullable: true }) paidAt: Date | null;
    @Column() channelId: number;
}
```

- [ ] **Step 3: 写 types.ts**（gql input/output 类型别名）

```ts
// src/types.ts
export interface ToggleFavoriteResult { favorited: boolean; favoriteCount: number; }
export interface PointsProductListOptions { skip?: number; take?: number; }
export interface PointsOrderListOptions { skip?: number; take?: number; status?: string; }
export interface CreatePointsProductInput {
    productId: string; variantId: string; pointsPrice: number; cashPrice?: number;
    deliveryType: string; stock: number; perUserLimit?: number;
    validFrom?: Date | null; validTo?: Date | null; status?: string; sortOrder?: number;
}
export interface UpdatePointsProductInput extends Partial<CreatePointsProductInput> { id: string; }
export interface CreatePointsOrderInput { pointsProductId: string; quantity: number; addressId?: string; }
export interface PointsPayParams { pointsOrderId: string; outTradeNo: string; pay: any; }
export interface FavoriteProductView {
    productId: string; name: string; slug: string; image: string | null;
    priceWithTax: number; isOnSale: boolean; pointsPrice: number | null; favoritedAt: Date;
}
export interface PointsProductView { /* PointsProduct 字段 + name/slug/image/priceWithTax/inStock */ [k: string]: any; }
```

- [ ] **Step 4: Commit** `git add packages/points-mall-plugin && git commit -m "feat(points-mall): 插件脚手架与四实体"`

### Task 2: PointsMallService——收藏

**Files:**
- Create: `src/points-mall.service.ts`
- Test: `e2e/points-mall.e2e-spec.ts`（Task 7 补全，先落骨架让收藏用例可跑）

- [ ] **Step 1: 先写 e2e 收藏用例**（骨架 = Task 7 Step 1 的 setup + 本用例），Run `npx vitest run packages/points-mall-plugin/e2e --dir packages/points-mall-plugin` → FAIL（服务不存在）

- [ ] **Step 2: 实现**

```ts
// src/points-mall.service.ts 核心结构
import { Injectable } from '@nestjs/common';
import { ID, Logger, PaginatedList, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { ProductFavorite } from './product-favorite.entity';
import { PointsOrder } from './points-order.entity';
import { PointsOrderPayment } from './points-order-payment.entity';
import { PointsProduct } from './points-product.entity';

const loggerCtx = 'PointsMallService';

@Injectable()
export class PointsMallService {
    constructor(private connection: TransactionalConnection) {}

    private async requireCustomer(ctx: RequestContext) {
        if (!ctx.activeUserId) throw new UserInputError('Login required');
        const customer = await this.connection.getRepository(ctx, require('@vendure/core').Customer)
            .findOne({ where: { userId: ctx.activeUserId } });
        if (!customer) throw new UserInputError('Customer not found');
        return customer;
    }

    /** 商品在当前渠道是否存在/上架（用于收藏与积分商品校验） */
    private async getVariantOrThrow(ctx: RequestContext, variantId: number) {
        const { ProductVariant } = require('@vendure/core');
        const v = await this.connection.getRepository(ctx, ProductVariant).findOne({
            where: { id: variantId, deletedAt: undefined as any },
            relations: ['product'],
        });
        if (!v || v.product?.deletedAt) throw new UserInputError('Product not found');
        return v;
    }

    /** 收藏切换（resolver 端 @Transaction() 包裹），favoriteCount 实时 COUNT */
    async toggleProductFavorite(ctx: RequestContext, productId: ID): Promise<{ favorited: boolean; favoriteCount: number }> {
        const customer = await this.requireCustomer(ctx);
        const favRepo = this.connection.getRepository(ctx, ProductFavorite);
        const existing = await favRepo.findOne({ where: { productId: productId as any, customerId: customer.id } as any });
        let favorited: boolean;
        if (existing) {
            await favRepo.remove(existing);
            favorited = false;
        } else {
            await favRepo.save({
                productId: productId as number,
                customerId: customer.id as number,
                channelId: ctx.channelId,
            } as any);
            favorited = true;
        }
        const favoriteCount = await favRepo.count({ where: { productId: productId as any } as any });
        Logger.info(`ProductFavorite ${productId} toggled by ${customer.id} -> ${favorited}`, loggerCtx);
        return { favorited, favoriteCount };
    }

    /** 我的收藏：join 变体取名称/图/价；积分池标记；下架(未启用 saleable)置灰标记 */
    async myFavorites(ctx: RequestContext, options?: { skip?: number; take?: number }): Promise<PaginatedList<any>> {
        const customer = await this.requireCustomer(ctx);
        const qb = this.connection.getRepository(ctx, ProductFavorite)
            .createQueryBuilder('fav')
            .where('fav.customerId = :cid AND fav.channelId = :ch', { cid: customer.id, ch: ctx.channelId })
            .orderBy('fav.id', 'DESC')
            .skip(options?.skip).take(options?.take ?? 20);
        const [favs, totalItems] = await qb.getManyAndCount();
        if (!favs.length) return { items: [], totalItems };
        const { ProductVariant } = require('@vendure/core');
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: { id: In(favs.map(f => f.productId)) },
            relations: ['product', 'product.featuredAsset', 'product.translations'],
        });
        const poolPoints = await this.activePointsPool(ctx, favs.map(f => f.productId));
        const items = favs.map(f => {
            const v = variants.find(x => x.id === f.productId);
            if (!v) return { productId: f.productId as any, name: '已删除商品', slug: '', image: null, priceWithTax: 0, isOnSale: false, pointsPrice: null, favoritedAt: f.favoritedAt };
            const t = v.product.translations.find(tr => tr.languageCode === ctx.languageCode) || v.product.translations[0];
            return {
                productId: v.productId as any, name: t?.name || v.name, slug: v.product.slug,
                image: v.product.featuredAsset?.preview || null,
                priceWithTax: v.priceWithTax, isOnSale: v.product.enabled === true,
                pointsPrice: poolPoints.get(f.productId) ?? null, favoritedAt: f.favoritedAt,
            };
        });
        return { items, totalItems };
    }

    /** 当前渠道启用中积分商品池：productId -> pointsPrice */
    private async activePointsPool(ctx: RequestContext, productIds: number[]): Promise<Map<number, number>> {
        const rows = await this.connection.getRepository(ctx, PointsProduct).find({
            where: { productId: In(productIds), status: 'enabled', channelId: ctx.channelId as any } as any,
        });
        return new Map(rows.map(r => [r.productId, r.pointsPrice]));
    }

    /** 详情页扩展：收藏计数 + 我是否已收藏 */
    async favoriteMeta(ctx: RequestContext, productId: ID): Promise<{ favoriteCount: number; myFavorited: boolean }> {
        const favRepo = this.connection.getRepository(ctx, ProductFavorite);
        const favoriteCount = await favRepo.count({ where: { productId: productId as any } as any });
        let myFavorited = false;
        if (ctx.activeUserId) {
            const customer = await this.requireCustomer(ctx);
            myFavorited = !!(await favRepo.findOne({ where: { productId: productId as any, customerId: customer.id } as any }));
        }
        return { favoriteCount, myFavorited };
    }
}
```

- [ ] **Step 3: Run e2e 收藏用例 → PASS；Commit** `feat(points-mall): 商品收藏服务`

### Task 3: 积分商品 admin CRUD + shop 查询

在 `points-mall.service.ts` 追加。

- [ ] **Step 1: e2e 先行**：admin `createPointsProduct`（用 e2e-products-minimal.csv 的商品 "1"）→ shop `pointsProducts` 列表返回 name/image/priceWithTax/inStock → PASS 再实现。

- [ ] **Step 2: 实现**

```ts
    // ===== PointsProduct =====
    private async assertProduct(ctx: RequestContext, productId: number, variantId: number) {
        const { ProductVariant } = require('@vendure/core');
        const v = await this.connection.getRepository(ctx, ProductVariant).findOne({
            where: { id: variantId }, relations: ['product'],
        });
        if (!v || v.productId !== productId) throw new UserInputError('Variant does not belong to product');
        return v;
    }

    async createPointsProduct(ctx: RequestContext, input: CreatePointsProductInput): Promise<PointsProduct> {
        const v = await this.assertProduct(ctx, Number(input.productId), Number(input.variantId));
        const repo = this.connection.getRepository(ctx, PointsProduct);
        const pp = new PointsProduct({
            productId: v.productId, variantId: v.id,
            pointsPrice: Math.floor(input.pointsPrice),
            cashPrice: Math.floor(input.cashPrice ?? 0),
            deliveryType: input.deliveryType === 'virtual' ? 'virtual' : 'physical',
            stock: Math.floor(input.stock), perUserLimit: Math.floor(input.perUserLimit ?? 0),
            validFrom: input.validFrom ?? null, validTo: input.validTo ?? null,
            status: input.status === 'disabled' ? 'disabled' : 'enabled',
            sortOrder: Math.floor(input.sortOrder ?? 0),
        });
        pp.channelId = ctx.channelId as number;
        return repo.save(pp);
    }

    async updatePointsProduct(ctx: RequestContext, input: UpdatePointsProductInput): Promise<PointsProduct> {
        const repo = this.connection.getRepository(ctx, PointsProduct);
        const pp = await repo.findOne({ where: { id: input.id as any, channelId: ctx.channelId as any } as any });
        if (!pp) throw new UserInputError('PointsProduct not found');
        const patch: Partial<PointsProduct> = {};
        if (input.pointsPrice != null) patch.pointsPrice = Math.floor(input.pointsPrice);
        if (input.cashPrice != null) patch.cashPrice = Math.floor(input.cashPrice);
        if (input.deliveryType != null) patch.deliveryType = input.deliveryType === 'virtual' ? 'virtual' : 'physical';
        if (input.stock != null) patch.stock = Math.floor(input.stock);
        if (input.perUserLimit != null) patch.perUserLimit = Math.floor(input.perUserLimit);
        if (input.validFrom !== undefined) patch.validFrom = input.validFrom;
        if (input.validTo !== undefined) patch.validTo = input.validTo;
        if (input.status != null) patch.status = input.status === 'disabled' ? 'disabled' : 'enabled';
        if (input.sortOrder != null) patch.sortOrder = Math.floor(input.sortOrder);
        Object.assign(pp, patch);
        return repo.save(pp);
    }

    async deletePointsProduct(ctx: RequestContext, id: ID): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, PointsProduct);
        const pp = await repo.findOne({ where: { id: id as any, channelId: ctx.channelId as any } as any });
        if (!pp) throw new UserInputError('PointsProduct not found');
        await repo.remove(pp);
        return true;
    }

    async adminPointsProducts(ctx: RequestContext, options?: PointsProductListOptions): Promise<PaginatedList<PointsProduct>> {
        const [items, totalItems] = await this.connection.getRepository(ctx, PointsProduct)
            .createQueryBuilder('pp')
            .where('pp.channelId = :ch', { ch: ctx.channelId })
            .orderBy('pp.sortOrder', 'ASC').addOrderBy('pp.id', 'DESC')
            .skip(options?.skip).take(options?.take ?? 50)
            .getManyAndCount();
        return { items, totalItems };
    }

    /** shop：启用中列表（有效期内），join 变体做视图 */
    async shopPointsProducts(ctx: RequestContext, options?: PointsProductListOptions): Promise<PaginatedList<PointsProductView>> {
        const now = new Date();
        const [rows, totalItems] = await this.connection.getRepository(ctx, PointsProduct)
            .createQueryBuilder('pp')
            .where('pp.channelId = :ch AND pp.status = :s', { ch: ctx.channelId, s: 'enabled' })
            .andWhere('(pp.validFrom IS NULL OR pp.validFrom <= :now) AND (pp.validTo IS NULL OR pp.validTo >= :now)', { now })
            .orderBy('pp.sortOrder', 'ASC').addOrderBy('pp.id', 'DESC')
            .skip(options?.skip).take(options?.take ?? 20)
            .getManyAndCount();
        const { ProductVariant } = require('@vendure/core');
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: { id: In(rows.map(r => r.variantId)) },
            relations: ['product', 'product.featuredAsset', 'product.translations'],
        });
        const items = rows.map(r => this.toView(r, variants));
        return { items, totalItems };
    }

    async shopPointsProduct(ctx: RequestContext, id: ID): Promise<PointsProductView | undefined> {
        const row = await this.connection.getRepository(ctx, PointsProduct).findOne({
            where: { id: id as any, channelId: ctx.channelId as any, status: 'enabled' } as any,
        });
        if (!row) return undefined;
        const { ProductVariant } = require('@vendure/core');
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: { id: In([row.variantId]) },
            relations: ['product', 'product.featuredAsset', 'product.translations'],
        });
        return this.toView(row, variants);
    }

    private toView(r: PointsProduct, variants: any[]): PointsProductView {
        const v = variants.find(x => x.id === r.variantId);
        const t = v?.product?.translations?.find((tr: any) => tr.languageCode === (arguments[0] as any)?.languageCode) || v?.product?.translations?.[0];
        return {
            id: r.id as any, productId: r.productId as any, variantId: r.variantId as any,
            name: t?.name || v?.name || '', slug: v?.product?.slug || '',
            image: v?.product?.featuredAsset?.preview || null,
            pointsPrice: r.pointsPrice, cashPrice: r.cashPrice, deliveryType: r.deliveryType,
            stock: r.stock, perUserLimit: r.perUserLimit, redeemedCount: r.redeemedCount,
            validFrom: r.validFrom, validTo: r.validTo, sortOrder: r.sortOrder,
            priceWithTax: v?.priceWithTax ?? 0, inStock: r.stock > 0,
        };
    }
```

注意 `toView` 的 `ctx.languageCode`：将 `toView(r, variants)` 改签名 `toView(ctx, r, variants)`，取 `ctx.languageCode`。**不要用 arguments**。

- [ ] **Step 3: Run e2e → PASS；Commit** `feat(points-mall): 积分商品 CRUD 与 shop 查询`

### Task 4: 下单事务链 + 支付 + 取消 + 结算

- [ ] **Step 1: e2e 先行**（用例见 Task 7）：纯积分虚拟直完成 / 纯积分实物 pending_ship / 混合价 pending_payment→simulate settle→shipped / 积分不足拒绝 / 库存不足拒绝 / 超限兑拒绝 / 取消退分回补。先写全，Run → FAIL。

- [ ] **Step 2: 实现**（追加到 service）

```ts
    // ===== PointsOrder =====
    private memberLevel: any = null; // onApplicationBootstrap 由 plugin 注入

    setMemberLevelService(svc: any) { this.memberLevel = svc; }

    private async assertBuyable(ctx: RequestContext, pp: PointsProduct, quantity: number, customerId: number) {
        const now = new Date();
        if (pp.status !== 'enabled') throw new UserInputError('NOT_IN_VALIDITY');
        if (pp.validFrom && pp.validFrom > now) throw new UserInputError('NOT_IN_VALIDITY');
        if (pp.validTo && pp.validTo < now) throw new UserInputError('NOT_IN_VALIDITY');
        if (pp.stock < quantity) throw new UserInputError('OUT_OF_STOCK');
        if (pp.perUserLimit > 0) {
            const bought = await this.connection.getRepository(ctx, PointsOrder).count({
                where: { customerId, pointsProductId: pp.id, status: require('typeorm').Not('cancelled') } as any,
            });
            if (bought + quantity > pp.perUserLimit) throw new UserInputError('PER_USER_LIMIT_EXCEEDED');
        }
    }

    private async loadPointsProductForOrder(ctx: RequestContext, id: ID): Promise<PointsProduct> {
        const pp = await this.connection.getRepository(ctx, PointsProduct).findOne({
            where: { id: id as any, channelId: ctx.channelId as any, status: 'enabled' } as any,
        });
        if (!pp) throw new UserInputError('PointsProduct not found');
        return pp;
    }

    /** 下单第一步：扣积分 + 扣库存 + 建单 + 混合价建支付单（resolver @Transaction 包裹） */
    async createPointsOrderExchange(ctx: RequestContext, input: CreatePointsOrderInput): Promise<PointsOrder> {
        const customer = await this.requireCustomer(ctx);
        const pp = await this.loadPointsProductForOrder(ctx, input.pointsProductId);
        const quantity = Math.floor(input.quantity);
        if (quantity <= 0) throw new UserInputError('Invalid quantity');
        await this.assertBuyable(ctx, pp, quantity, customer.id);

        let addressSnapshot: Record<string, any> | null = null;
        if (pp.deliveryType === 'physical') {
            if (!input.addressId) throw new UserInputError('ADDRESS_REQUIRED');
            const { Address } = require('@vendure/core');
            const addr = await this.connection.getRepository(ctx, Address).findOne({
                where: { id: input.addressId as any, customer: { id: customer.id } } as any,
            });
            if (!addr) throw new UserInputError('Address not found');
            addressSnapshot = {
                name: (addr as any).fullName || '', phone: (addr as any).phoneNumber || '',
                province: (addr as any).province || '', city: (addr as any).city || '',
                district: (addr as any).district || '', detail: (addr as any).streetLine1 || '',
            };
        }
        const pointsTotal = pp.pointsPrice * quantity;
        const cashTotal = pp.cashPrice * quantity;

        // 1) 原子扣积分（余额不足内部抛错，事务回滚）
        await this.memberLevel.spendPoints(ctx, customer.id, pointsTotal, null, `Points order exchange`);
        // 2) 原子扣库存
        const claim = await this.connection.getRepository(ctx, PointsProduct).createQueryBuilder()
            .update(PointsProduct)
            .set({ stock: () => `stock - ${quantity}`, redeemedCount: () => `redeemedCount + ${quantity}` })
            .where('id = :id AND stock >= :qty', { id: pp.id, qty: quantity })
            .execute();
        if (claim.affected === 0) throw new UserInputError('OUT_OF_STOCK');

        const v = await this.getVariantOrThrow(ctx, pp.variantId);
        const t = (v as any).product?.translations?.find((tr: any) => tr.languageCode === ctx.languageCode) || (v as any).product?.translations?.[0];
        const status = cashTotal > 0 ? 'pending_payment' : (pp.deliveryType === 'virtual' ? 'completed' : 'pending_ship');
        const repo = this.connection.getRepository(ctx, PointsOrder);
        const order = new PointsOrder({
            code: 'PO-TEMP', customerId: customer.id, pointsProductId: pp.id,
            productSnapshot: { productId: pp.productId, variantId: pp.variantId, name: t?.name || v.name, image: (v as any).product?.featuredAsset?.preview || null, spec: v.name },
            quantity, pointsTotal, cashTotal, deliveryType: pp.deliveryType,
            addressSnapshot, status,
            paidAt: status === 'completed' ? new Date() : null,
            completedAt: status === 'completed' ? new Date() : null,
        });
        order.channelId = ctx.channelId as number;
        const saved = await repo.save(order);
        saved.code = `PO-${saved.id}`;
        const final = await repo.save(saved);
        if (cashTotal > 0) {
            const payRepo = this.connection.getRepository(ctx, PointsOrderPayment);
            await payRepo.save({
                orderId: final.id, customerId: customer.id, amount: cashTotal,
                status: 'pending', externalRef: final.code,
                channelId: ctx.channelId,
            } as any);
        }
        Logger.info(`PointsOrder ${final.code} created (${status}) by ${customer.id}`, loggerCtx);
        return final;
    }

    /** 下单第二步：拉微信支付（无 @Transaction，参照 createWechatRechargePayment） */
    async createPointsOrderPayment(ctx: RequestContext, pointsOrderId: ID, tradeType?: string, openid?: string): Promise<PointsPayParams> {
        const customer = await this.requireCustomer(ctx);
        const order = await this.connection.getRepository(ctx, PointsOrder).findOne({
            where: { id: pointsOrderId as any, customerId: customer.id, channelId: ctx.channelId as any } as any,
        });
        if (!order) throw new UserInputError('Points order not found');
        if (order.status !== 'pending_payment') throw new UserInputError(`Points order is ${order.status}`);
        if (!this.gateway) throw new UserInputError('Payment gateway not configured');
        const effectiveTradeType = (tradeType as any) || 'JSAPI';
        const effectiveOpenid = openid || (await resolveCustomerOpenid(ctx, customer.id, { preferMini: effectiveTradeType === 'JSAPI' } as any));
        const pay = await this.gateway.createBarePayment(
            { outTradeNo: order.code, amount: order.cashTotal, tradeType: effectiveTradeType, openid: effectiveOpenid, description: `Points ${order.code}` },
            ctx,
        );
        return { pointsOrderId: order.id as any, outTradeNo: order.code, pay };
    }

    /** 网关回调结算：PO-<id> 前缀注册表入口（幂等原子更新，参照 settleRechargeOrderByOutTradeNo） */
    async settlePointsOrderByOutTradeNo(ctx: RequestContext, outTradeNo: string): Promise<void> {
        const m = String(outTradeNo).match(/^PO-(\d+)$/);
        if (!m) throw new UserInputError('Invalid points out_trade_no');
        const orderRepo = this.connection.getRepository(ctx, PointsOrder);
        const order = await orderRepo.findOne({ where: { id: m[1] as any, channelId: ctx.channelId as any } as any });
        if (!order) throw new UserInputError('Points order not found');
        if (order.status !== 'pending_payment') return; // 幂等
        const payRepo = this.connection.getRepository(ctx, PointsOrderPayment);
        await this.connection.startTransaction(ctx);
        try {
            const payClaim = await payRepo.createQueryBuilder()
                .update(PointsOrderPayment)
                .set({ status: 'paid', paidAt: new Date(), transactionId: (ctx as any).transactionId ?? null })
                .where('orderId = :oid AND status = :s', { oid: order.id, s: 'pending' })
                .execute();
            if (payClaim.affected === 0) { await this.connection.commitOpenTransaction(ctx); return; }
            const next = order.deliveryType === 'virtual' ? 'completed' : 'pending_ship';
            const orderClaim = await orderRepo.createQueryBuilder()
                .update(PointsOrder)
                .set({ status: next, paidAt: new Date(), completedAt: next === 'completed' ? new Date() : null })
                .where('id = :id AND status = :s', { id: order.id, s: 'pending_payment' })
                .execute();
            if (orderClaim.affected === 0) { await this.connection.commitOpenTransaction(ctx); return; }
            await this.connection.commitOpenTransaction(ctx);
        } catch (e) {
            await this.connection.rollBackTransaction(ctx);
            throw e;
        }
        Logger.info(`PointsOrder ${order.code} settled -> ${order.deliveryType === 'virtual' ? 'completed' : 'pending_ship'}`, loggerCtx);
    }

    /** 取消（仅本人 pending_payment）：退分 EARN + 回补库存 */
    async cancelPointsOrder(ctx: RequestContext, id: ID): Promise<PointsOrder> {
        const customer = await this.requireCustomer(ctx);
        const orderRepo = this.connection.getRepository(ctx, PointsOrder);
        const order = await orderRepo.findOne({ where: { id: id as any, customerId: customer.id, channelId: ctx.channelId as any } as any });
        if (!order) throw new UserInputError('Points order not found');
        if (order.status !== 'pending_payment') throw new UserInputError('ORDER_NOT_CANCELLABLE');
        await this.connection.startTransaction(ctx);
        try {
            const claim = await orderRepo.createQueryBuilder()
                .update(PointsOrder).set({ status: 'cancelled' })
                .where('id = :id AND status = :s', { id: order.id, s: 'pending_payment' }).execute();
            if (claim.affected === 0) throw new UserInputError('ORDER_NOT_CANCELLABLE');
            await this.memberLevel.earnPoints(ctx, customer.id, order.pointsTotal, order.id, `Points order ${order.code} cancel refund`);
            await this.connection.getRepository(ctx, PointsProduct).createQueryBuilder()
                .update(PointsProduct)
                .set({ stock: () => `stock + ${order.quantity}`, redeemedCount: () => `redeemedCount - ${order.quantity}` })
                .where('id = :id', { id: order.pointsProductId })
                .execute();
            await this.connection.getRepository(ctx, PointsOrderPayment).createQueryBuilder()
                .update(PointsOrderPayment).set({ status: 'cancelled' })
                .where('orderId = :oid AND status = :s', { oid: order.id, s: 'pending' }).execute();
            await this.connection.commitOpenTransaction(ctx);
        } catch (e) {
            await this.connection.rollBackTransaction(ctx);
            throw e;
        }
        order.status = 'cancelled';
        return order;
    }

    async myPointsOrders(ctx: RequestContext, options?: PointsOrderListOptions): Promise<PaginatedList<PointsOrder>> {
        const customer = await this.requireCustomer(ctx);
        const qb = this.connection.getRepository(ctx, PointsOrder).createQueryBuilder('o')
            .where('o.customerId = :cid AND o.channelId = :ch', { cid: customer.id, ch: ctx.channelId });
        if (options?.status) qb.andWhere('o.status = :s', { s: options.status });
        const [items, totalItems] = await qb.orderBy('o.id', 'DESC').skip(options?.skip).take(options?.take ?? 20).getManyAndCount();
        return { items, totalItems };
    }

    async myPointsOrder(ctx: RequestContext, id: ID): Promise<PointsOrder> {
        const customer = await this.requireCustomer(ctx);
        const o = await this.connection.getRepository(ctx, PointsOrder).findOne({
            where: { id: id as any, customerId: customer.id, channelId: ctx.channelId as any } as any,
        });
        if (!o) throw new UserInputError('Points order not found');
        return o;
    }

    // ===== Admin 订单履约 =====
    async adminPointsOrders(ctx: RequestContext, options?: PointsOrderListOptions): Promise<PaginatedList<PointsOrder>> {
        const qb = this.connection.getRepository(ctx, PointsOrder).createQueryBuilder('o')
            .where('o.channelId = :ch', { ch: ctx.channelId });
        if (options?.status) qb.andWhere('o.status = :s', { s: options.status });
        const [items, totalItems] = await qb.orderBy('o.id', 'DESC').skip(options?.skip).take(options?.take ?? 20).getManyAndCount();
        return { items, totalItems };
    }

    /** 线下收款兜底：pending_payment → 推进（同 settle 原子语义） */
    async markPointsOrderPaid(ctx: RequestContext, id: ID): Promise<PointsOrder> {
        return this.applyTransition(ctx, id, 'pending_payment', (o) => ({
            status: o.deliveryType === 'virtual' ? 'completed' : 'pending_ship',
            paidAt: new Date(),
            completedAt: o.deliveryType === 'virtual' ? new Date() : null,
        }));
    }

    async markPointsOrderShipped(ctx: RequestContext, id: ID, trackingNo?: string): Promise<PointsOrder> {
        return this.applyTransition(ctx, id, 'pending_ship', () => ({ status: 'shipped', shippedAt: new Date(), trackingNo: trackingNo || null }));
    }

    async markPointsOrderCompleted(ctx: RequestContext, id: ID): Promise<PointsOrder> {
        return this.applyTransition(ctx, id, 'shipped', () => ({ status: 'completed', completedAt: new Date() }));
    }

    private async applyTransition(ctx: RequestContext, id: ID, from: string, patch: (o: PointsOrder) => Partial<PointsOrder>): Promise<PointsOrder> {
        const repo = this.connection.getRepository(ctx, PointsOrder);
        const o = await repo.findOne({ where: { id: id as any, channelId: ctx.channelId as any } as any });
        if (!o) throw new UserInputError('Points order not found');
        if (o.status !== from) throw new UserInputError(`Points order is ${o.status}`);
        Object.assign(o, patch(o));
        return repo.save(o);
    }
```

同时在 service 加字段 `gateway: any = null; setWechatpayGateway(g) { this.gateway = g; }`，import `CreatePointsOrderInput, PointsPayParams, PointsProductListOptions, PointsOrderListOptions, UpdatePointsProductInput` 与 `resolveCustomerOpenid`（from `@vendure/wechatpay-plugin`）。

- [ ] **Step 3: Run e2e 全量 → PASS；Commit** `feat(points-mall): 积分下单事务链与微信结算`

### Task 5: Schema + Resolvers + Plugin

**Files:**
- Create: `src/points-mall-shop.resolver.ts`、`src/points-mall-admin.resolver.ts`、`src/plugin.ts`

- [ ] **Step 1: plugin.ts**（schema 抄 shopping-circle-plugin 的 gql 组织方式）

```ts
// src/plugin.ts
import { Injector, Type } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { MemberLevelService } from '@vendure/member-level-plugin';
import { WechatpayService, WechatpaySettlementRegistry } from '@vendure/wechatpay-plugin';
import { PointsMallAdminResolver } from './points-mall-admin.resolver';
import { PointsMallService } from './points-mall.service';
import { PointsMallShopResolver } from './points-mall-shop.resolver';
import { ProductFavorite } from './product-favorite.entity';
import { PointsOrder } from './points-order.entity';
import { PointsOrderPayment } from './points-order-payment.entity';
import { PointsProduct } from './points-product.entity';

const { gql } = require('graphql-tag');

const shopSchema = () => gql`
    type PointsProduct {
        id: ID! productId: ID! variantId: ID! name: String! slug: String! image: String
        pointsPrice: Int! cashPrice: Int! deliveryType: String! stock: Int! perUserLimit: Int!
        redeemedCount: Int! validFrom: DateTime validTo: DateTime sortOrder: Int!
        priceWithTax: Int! inStock: Boolean!
    }
    type PointsProductList implements PaginatedList { items: [PointsProduct!]! totalItems: Int! }
    input PointsProductListOptions { skip: Int take: Int }
    type FavoriteProductView {
        productId: ID! name: String! slug: String! image: String
        priceWithTax: Int! isOnSale: Boolean! pointsPrice: Int favoritedAt: DateTime!
    }
    type FavoriteProductList implements PaginatedList { items: [FavoriteProductView!]! totalItems: Int! }
    type ToggleFavoriteResult { favorited: Boolean! favoriteCount: Int! }
    type FavoriteMeta { favoriteCount: Int! myFavorited: Boolean! }
    type ProductSnapshot { productId: ID variantId: ID name: String image: String spec: String }
    type AddressSnapshot { name: String phone: String province: String city: String district: String detail: String }
    type PointsOrder {
        id: ID! code: String! customerId: ID! quantity: Int!
        pointsTotal: Int! cashTotal: Int! deliveryType: String! status: String!
        productSnapshot: ProductSnapshot addressSnapshot: AddressSnapshot
        trackingNo: String paidAt: DateTime shippedAt: DateTime completedAt: DateTime createdAt: DateTime!
    }
    type PointsOrderList implements PaginatedList { items: [PointsOrder!]! totalItems: Int! }
    input PointsOrderListOptions { skip: Int take: Int status: String }
    type PointsPayParams { pointsOrderId: ID! outTradeNo: String! pay: JSON! }
    extend type Query {
        pointsProducts(options: PointsProductListOptions): PointsProductList!
        pointsProduct(id: ID!): PointsProduct
        myFavorites(options: PointsProductListOptions): FavoriteProductList!
        productFavoriteMeta(productId: ID!): FavoriteMeta!
        myPointsOrders(options: PointsOrderListOptions): PointsOrderList!
        myPointsOrder(id: ID!): PointsOrder
    }
    extend type Mutation {
        toggleProductFavorite(productId: ID!): ToggleFavoriteResult!
        createPointsOrderExchange(input: CreatePointsOrderInput!): PointsOrder!
        createPointsOrderPayment(pointsOrderId: ID!, tradeType: String, openid: String): PointsPayParams!
        cancelPointsOrder(id: ID!): PointsOrder!
    }
    input CreatePointsOrderInput { pointsProductId: ID! quantity: Int! addressId: ID }
`;

const adminSchema = () => gql`
    type PointsProductAdmin {
        id: ID! productId: ID! variantId: ID! pointsPrice: Int! cashPrice: Int!
        deliveryType: String! stock: Int! perUserLimit: Int! redeemedCount: Int!
        validFrom: DateTime validTo: DateTime status: String! sortOrder: Int!
    }
    type PointsProductAdminList implements PaginatedList { items: [PointsProductAdmin!]! totalItems: Int! }
    input PointsProductAdminListOptions { skip: Int take: Int }
    input CreatePointsProductInput {
        productId: ID! variantId: ID! pointsPrice: Int! cashPrice: Int deliveryType: String!
        stock: Int! perUserLimit: Int validFrom: DateTime validTo: DateTime status: String sortOrder: Int
    }
    input UpdatePointsProductInput {
        id: ID! pointsPrice: Int cashPrice: Int deliveryType: String stock: Int perUserLimit: Int
        validFrom: DateTime validTo: DateTime status: String sortOrder: Int
    }
    type PointsOrderAdmin {
        id: ID! code: String! customerId: ID! quantity: Int! pointsTotal: Int! cashTotal: Int!
        deliveryType: String! status: String! productSnapshot: JSON addressSnapshot: JSON
        trackingNo: String paidAt: DateTime shippedAt: DateTime completedAt: DateTime createdAt: DateTime!
    }
    type PointsOrderAdminList implements PaginatedList { items: [PointsOrderAdmin!]! totalItems: Int! }
    input PointsOrderAdminListOptions { skip: Int take: Int status: String }
    extend type Query {
        pointsProductsAdmin(options: PointsProductAdminListOptions): PointsProductAdminList!
        pointsOrdersAdmin(options: PointsOrderAdminListOptions): PointsOrderAdminList!
    }
    extend type Mutation {
        createPointsProduct(input: CreatePointsProductInput!): PointsProductAdmin!
        updatePointsProduct(input: UpdatePointsProductInput!): PointsProductAdmin!
        deletePointsProduct(id: ID!): Boolean!
        markPointsOrderPaid(id: ID!): PointsOrderAdmin!
        markPointsOrderShipped(id: ID!, trackingNo: String): PointsOrderAdmin!
        markPointsOrderCompleted(id: ID!): PointsOrderAdmin!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductFavorite, PointsProduct, PointsOrder, PointsOrderPayment],
    providers: [PointsMallService],
    shopApiExtensions: { schema: shopSchema, resolvers: [PointsMallShopResolver] },
    adminApiExtensions: { schema: adminSchema, resolvers: [PointsMallAdminResolver] },
    compatibility: '^3.0.0',
})
export class PointsMallPlugin {
    static init(): Type<PointsMallPlugin> { return PointsMallPlugin; }

    async onApplicationBootstrap(): Promise<void> {
        const injector = new Injector(this.moduleRef);
        let svc: PointsMallService;
        try {
            svc = injector.get(PointsMallService);
        } catch { return; }
        // 强依赖积分服务（spendPoints/earnPoints）
        const memberLevel = injector.get(MemberLevelService);
        svc.setMemberLevelService(memberLevel);
        // 可选接入微信网关：注册 PO- 结算 + createBarePayment
        try {
            const gateway = injector.get(WechatpayService);
            svc.setWechatpayGateway(gateway);
            const registry = injector.get(WechatpaySettlementRegistry);
            registry.register({ prefix: 'PO-', settle: (ctx: any, outTradeNo: string) => svc.settlePointsOrderByOutTradeNo(ctx, outTradeNo) });
        } catch {
            // 未注册网关 → 纯积分模式可用
        }
    }
}
```

- [ ] **Step 2: 两个 resolver**（装饰器模式照抄 `circle.resolvers.ts`）

```ts
// src/points-mall-shop.resolver.ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, PaginatedList, Permission, RequestContext, Transaction } from '@vendure/core';
import { PointsMallService } from './points-mall.service';
import { PointsOrder } from './points-order.entity';
import { CreatePointsOrderInput, PointsOrderListOptions, PointsProductListOptions, PointsPayParams } from './types';

@Resolver()
export class PointsMallShopResolver {
    constructor(private svc: PointsMallService) {}

    @Query() async pointsProducts(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: PointsProductListOptions) {
        return this.svc.shopPointsProducts(ctx, options);
    }
    @Query() async pointsProduct(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.svc.shopPointsProduct(ctx, id);
    }
    @Query() @Allow(Permission.Authenticated)
    async myFavorites(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: PointsProductListOptions): Promise<PaginatedList<any>> {
        return this.svc.myFavorites(ctx, options);
    }
    @Query() async productFavoriteMeta(@Ctx() ctx: RequestContext, @Args('productId') productId: ID) {
        return this.svc.favoriteMeta(ctx, productId);
    }
    @Query() @Allow(Permission.Authenticated)
    async myPointsOrders(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: PointsOrderListOptions): Promise<PaginatedList<PointsOrder>> {
        return this.svc.myPointsOrders(ctx, options);
    }
    @Query() @Allow(Permission.Authenticated)
    async myPointsOrder(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<PointsOrder> {
        return this.svc.myPointsOrder(ctx, id);
    }
    @Mutation() @Transaction() @Allow(Permission.Authenticated)
    async toggleProductFavorite(@Ctx() ctx: RequestContext, @Args('productId') productId: ID) {
        return this.svc.toggleProductFavorite(ctx, productId);
    }
    @Mutation() @Transaction() @Allow(Permission.Authenticated)
    async createPointsOrderExchange(@Ctx() ctx: RequestContext, @Args('input') input: CreatePointsOrderInput): Promise<PointsOrder> {
        return this.svc.createPointsOrderExchange(ctx, input);
    }
    @Mutation() @Allow(Permission.Authenticated)
    async createPointsOrderPayment(@Ctx() ctx: RequestContext, @Args('pointsOrderId') pointsOrderId: ID, @Args('tradeType', { nullable: true }) tradeType?: string, @Args('openid', { nullable: true }) openid?: string): Promise<PointsPayParams> {
        return this.svc.createPointsOrderPayment(ctx, pointsOrderId, tradeType, openid);
    }
    @Mutation() @Transaction() @Allow(Permission.Authenticated)
    async cancelPointsOrder(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<PointsOrder> {
        return this.svc.cancelPointsOrder(ctx, id);
    }
}
```

```ts
// src/points-mall-admin.resolver.ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, PaginatedList, Permission, RequestContext, Transaction } from '@vendure/core';
import { PointsMallService } from './points-mall.service';
import { PointsOrder } from './points-order.entity';
import { PointsProduct } from './points-product.entity';
import { CreatePointsProductInput, PointsOrderListOptions, PointsProductListOptions, UpdatePointsProductInput } from './types';

@Resolver()
export class PointsMallAdminResolver {
    constructor(private svc: PointsMallService) {}

    @Query() @Allow(Permission.ReadSettings)
    async pointsProductsAdmin(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: PointsProductListOptions): Promise<PaginatedList<PointsProduct>> {
        return this.svc.adminPointsProducts(ctx, options);
    }
    @Query() @Allow(Permission.ReadSettings)
    async pointsOrdersAdmin(@Ctx() ctx: RequestContext, @Args('options', { nullable: true }) options?: PointsOrderListOptions): Promise<PaginatedList<PointsOrder>> {
        return this.svc.adminPointsOrders(ctx, options);
    }
    @Mutation() @Transaction() @Allow(Permission.UpdateSettings)
    async createPointsProduct(@Ctx() ctx: RequestContext, @Args('input') input: CreatePointsProductInput): Promise<PointsProduct> {
        return this.svc.createPointsProduct(ctx, input);
    }
    @Mutation() @Transaction() @Allow(Permission.UpdateSettings)
    async updatePointsProduct(@Ctx() ctx: RequestContext, @Args('input') input: UpdatePointsProductInput): Promise<PointsProduct> {
        return this.svc.updatePointsProduct(ctx, input);
    }
    @Mutation() @Transaction() @Allow(Permission.UpdateSettings)
    async deletePointsProduct(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<boolean> {
        return this.svc.deletePointsProduct(ctx, id);
    }
    @Mutation() @Transaction() @Allow(Permission.UpdateSettings)
    async markPointsOrderPaid(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<PointsOrder> {
        return this.svc.markPointsOrderPaid(ctx, id);
    }
    @Mutation() @Transaction() @Allow(Permission.UpdateSettings)
    async markPointsOrderShipped(@Ctx() ctx: RequestContext, @Args('id') id: ID, @Args('trackingNo', { nullable: true }) trackingNo?: string): Promise<PointsOrder> {
        return this.svc.markPointsOrderShipped(ctx, id, trackingNo);
    }
    @Mutation() @Transaction() @Allow(Permission.UpdateSettings)
    async markPointsOrderCompleted(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<PointsOrder> {
        return this.svc.markPointsOrderCompleted(ctx, id);
    }
}
```

- [ ] **Step 3: dev-config 注册**：`packages/dev-server/dev-config.ts` L61 区加 `import { PointsMallPlugin } from '@vendure/points-mall-plugin';`，plugins 数组 `ShoppingCirclePlugin.init(),`（L492）后加 `PointsMallPlugin.init(),`；确认根 `package.json` workspaces/依赖声明方式与 shopping-circle-plugin 一致（`@vendure/points-mall-plugin: "workspace:*"` 或 file: 协议，抄现有条目）。

- [ ] **Step 4: 生成迁移**（按 vendure-config 同款流程）：`yarn build` 后用 `npx vendure migration generate points-mall-initial`（在 dev-server 启动配置语境下执行；若仓库用 `ts-node` 脚本生成迁移，参照 `packages/` 内最近一次插件迁移的生成命令历史 `git log --oneline -- **/migrations/**` 找到同款命令）。迁移文件落 points-mall-plugin/src/migrations/，plugin.ts `configuration:` 注册 migration。Run `npx vendure migration run` 验证。

- [ ] **Step 5: e2e 全量 → PASS；Commit** `feat(points-mall): schema/resolver/插件注册与迁移`

### Task 6: 插件 build + 产物入库

- [ ] **Step 1**: `cd d:\zhao\vendure; yarn build`（或仓库既有 `yarn build:packages`——查根 package.json scripts 确认命令）→ `packages/points-mall-plugin/lib/` 产物生成。
- [ ] **Step 2**: `git add packages/points-mall-plugin packages/dev-server/dev-config.ts && git commit -m "build(points-mall): 插件 lib 产物与 dev-config 注册"`（lib 产物入库是本仓库惯例，参照 recharge-card-plugin/lib）。

### Task 7: e2e 完整用例

**Files:** Create: `vendure/packages/points-mall-plugin/e2e/points-mall.e2e-spec.ts`

- [ ] **Step 1: 完整 spec**（Task 2-4 期间已分段写入；此任务收尾补齐缺失用例）。骨架：

```ts
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { mergeConfig } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { MemberLevelPlugin } from '@vendure/member-level-plugin';
import { PointsMallPlugin } from '../src/plugin';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

describe('PointsMallPlugin · 商品收藏 + 积分商品下单', () => {
    const config = mergeConfig(testConfig(), {
        plugins: [MemberLevelPlugin.init(), PointsMallPlugin.init()],
    });
    const { server, adminClient, shopClient } = createTestEnvironment(config);

    beforeAll(async () => {
        await server.init({
            initialData,
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
        // 给测试客户充积分（member-level admin API；如 adjustPoints 不存在则用 shop 签到/earn 途径，参照 member-level e2e 现有用法）
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => { await server.destroy(); });

    it('toggle 收藏：×1 favorited=true count=1；×2 false count=0；myFavorites 列表一致', async () => { /* 写实调用，参照 shopping-circle e2e toggle 用例 */ });
    it('admin createPointsProduct（商品1变体1 纯积分 virtual 1000分 stock10 limit2）→ pointsProducts 可见', async () => { /* */ });
    it('纯积分虚拟下单：积分扣减、订单 completed、库存 9、redeemedCount 1', async () => { /* */ });
    it('纯积分实物下单：需 addressId；无地址报 ADDRESS_REQUIRED；带地址 → pending_ship', async () => { /* */ });
    it('积分不足：调低客户积分后下单 rejects.toThrow(/INSUFFICIENT|positive|余额/)，按 member-level 实际错误文本断言', async () => { /* */ });
    it('库存不足：createPointsProduct stock=1 后 quantity=2 → OUT_OF_STOCK', async () => { /* */ });
    it('超限兑：perUserLimit=2 连兑 3 件第 3 次 → PER_USER_LIMIT_EXCEEDED', async () => { /* */ });
    it('混合价：cashPrice=990 → pending_payment + spendPoints 已扣；cancelPointsOrder → cancelled + earnPoints 退回 + 库存回补', async () => { /* 断言 pointsHistory type=EARN remark 含 cancel refund */ });
    it('混合价结算：settlePointsOrderByOutTradeNo（经 service 直调模拟网关回调）→ physical 单 pending_ship + paidAt；重复调用幂等', async () => { /* */ });
    it('admin 履约：markPointsOrderPaid / markPointsOrderShipped(trackingNo) / markPointsOrderCompleted 状态推进', async () => { /* */ });
});
```

（执行时把注释占位写实——每个 it 的调用与断言按前文 service 语义展开，禁止留注释体。）

- [ ] **Step 2**: `npx vitest run packages/points-mall-plugin` → 全绿；`git commit -m "test(points-mall): e2e 全量用例"`

### Task 8: C 端 api 封装

**Files:** Create: `vshop/src/api/queries/points-mall.ts`

- [ ] **Step 1**（风格照抄 `src/api/queries/member.ts:52-69`）：

```ts
import { getGraphQLClient } from '../client';

const PP_FIELDS = `id productId variantId name slug image pointsPrice cashPrice deliveryType
    stock perUserLimit redeemedCount validFrom validTo sortOrder priceWithTax inStock`;
const PO_FIELDS = `id code customerId quantity pointsTotal cashTotal deliveryType status
    productSnapshot { productId variantId name image spec } addressSnapshot { name phone province city district detail }
    trackingNo paidAt shippedAt completedAt createdAt`;

export async function getPointsProducts(options: { take: number; skip: number }) {
    return getGraphQLClient().request(
        `query($skip:Int!,$take:Int!){ pointsProducts(options:{skip:$skip,take:$take}){ items{ ${PP_FIELDS} } totalItems } }`,
        options,
    );
}
export async function getPointsProduct(id: string) {
    return getGraphQLClient().request(`query($id:ID!){ pointsProduct(id:$id){ ${PP_FIELDS} } }`, { id });
}
export async function getMyFavorites(options: { take: number; skip: number }) {
    return getGraphQLClient().request(
        `query($skip:Int!,$take:Int!){ myFavorites(options:{skip:$skip,take:$take}){ items{ productId name slug image priceWithTax isOnSale pointsPrice favoritedAt } totalItems } }`,
        options,
    );
}
export async function toggleProductFavorite(productId: string) {
    return getGraphQLClient().request(
        `mutation($productId:ID!){ toggleProductFavorite(productId:$productId){ favorited favoriteCount } }`, { productId });
}
export async function productFavoriteMeta(productId: string) {
    return getGraphQLClient().request(
        `query($productId:ID!){ productFavoriteMeta(productId:$productId){ favoriteCount myFavorited } }`, { productId });
}
export async function createPointsOrderExchange(input: { pointsProductId: string; quantity: number; addressId?: string }) {
    return getGraphQLClient().request(
        `mutation($input:CreatePointsOrderInput!){ createPointsOrderExchange(input:$input){ ${PO_FIELDS} } }`, { input });
}
export async function createPointsOrderPayment(pointsOrderId: string, tradeType?: string, openid?: string) {
    return getGraphQLClient().request(
        `mutation($id:ID!,$t:String,$o:String){ createPointsOrderPayment(pointsOrderId:$id,tradeType:$t,openid:$o){ pointsOrderId outTradeNo pay } }`,
        { id: pointsOrderId, t: tradeType, o: openid },
    );
}
export async function cancelPointsOrder(id: string) {
    return getGraphQLClient().request(`mutation($id:ID!){ cancelPointsOrder(id:$id){ id status } }`, { id });
}
export async function getMyPointsOrders(options: { take: number; skip: number; status?: string }) {
    return getGraphQLClient().request(
        `query($skip:Int!,$take:Int!,$status:String){ myPointsOrders(options:{skip:$skip,take:$take,status:$status}){ items{ ${PO_FIELDS} } totalItems } }`,
        options,
    );
}
export async function retryPointsOrderPayment(id: string) { return createPointsOrderPayment(id); }
```

- [ ] **Step 2**: Commit `feat(c端): 积分商城 api 封装`

### Task 9: C 端 5 页面 + 入口 + pages.json

**Files:**
- Create: `src/pkg-user/pages/points-goods-list.vue`、`points-goods-detail.vue`、`points-goods-confirm.vue`、`points-orders.vue`、`favorites.vue`
- Modify: `src/pages.json`（pkg-user.pages 追加 5 项，格式照抄 L228-233，标题取 i18n key 对应中文）；`src/pkg-user/pages/member-center.vue`（quickMenus 数组插入 `{ label: t('menu.pointsGoods'), url: '/pkg-user/pages/points-goods-list' }` 与 `{ label: t('menu.myFavorites'), url: '/pkg-user/pages/favorites' }`，参照 L135-141 现有字面量风格——文案统一走 i18n t()）

**页面实现要点（mockup 已定稿）：**

- [ ] **Step 1: points-goods-list.vue**（版式 B 独立入口）：`usePagination({ fetchFn: getPointsProducts })`；顶部余额卡（`getMyMemberInfo()` 取 points）；商品卡网格（image/name/`5000积分+¥9.90` 组合价/inStock 置灰）；右上「去兑券」`uni.navigateTo('/pkg-user/pages/points-mall')`；onReachBottom → loadMore。文案全 `useI18n()`（C端既有 i18n 用法：`src/i18n/locales/*.json` + `useI18n` 或 localeStore，参照 points-mall.vue 现页）。
- [ ] **Step 2: points-goods-detail.vue**：onLoad 取 id → `getPointsProduct`；轮播（单图 image 即详情头图 + swiper 留接口）；价格区三态（cashPrice>0 显示 `+¥x`；可选划线价用 priceWithTax 对比——一期只显示 priceWithTax 划线当 pointsPrice 现金组合更贵时，不做复杂逻辑：**显示 priceWithTax 为「市场参考价」划线仅当其>组合折算，否则不显示**）；兑换说明卡（stock/perUserLimit/validTo）；底部栏 = 收藏（`toggleProductFavorite(productId)` 实心/空心切换 + 计数）+「立即兑换」→ `uni.navigateTo('/pkg-user/pages/points-goods-confirm?id=' + id)`。
- [ ] **Step 3: points-goods-confirm.vue**：数量步进（≤ min(stock, perUserLimit 剩余)）；physical → 地址卡（复用现有地址簿页面：参照结账页选地址交互——**从 `src/api/queries` 与结账页确认地址簿 api 与选择页路径后复用**，执行时先 grep `addressList|myAddresses` 定位，默认取默认地址可换）；virtual → 「虚拟权益·兑换后即时到账」提示行；明细（消耗积分 pointsPrice*qty、余额变化、现金 cashTotal>0 时显示微信支付行）；提交：`createPointsOrderExchange` → cashTotal>0 ? `createPointsOrderPayment` → 现有微信拉起封装（先 grep `requestPayment` 于 `src/api/`，复用充值页 `pkg-user/pages/recharge.vue` 的 pay 调用代码）→ 成功跳积分订单详情；纯积分直接 toast 成功跳订单列表。
- [ ] **Step 4: points-orders.vue**：状态 tabs（全部/待支付/待发货/已发货/已完成/已取消）+ `usePagination(getMyPointsOrders)`；待支付卡操作 = 继续支付（retryPointsOrderPayment → requestPayment）/ 取消（uni.showModal 确认 → cancelPointsOrder → refresh）。
- [ ] **Step 5: favorites.vue**：`usePagination(getMyFavorites)`；卡片：image/name/priceWithTax/`N积分可兑`（pointsPrice!=null 时）+ isOnSale=false 置灰；操作 = 取消收藏（toggleProductFavorite）+ 去购买（`uni.navigateTo('/pkg-product/pages/detail?slug=' + slug)`）。
- [ ] **Step 6: pages.json 注册 5 页**（标题中文先写死，词条随后 Task 10 补 i18n 时如框架支持 navigationBarTitleText i18n 则同步替换）+ member-center quickMenus +1/+1。
- [ ] **Step 7: 手机浏览验证（硬规范）**：本地起 dev，Playwright 390×844 dpr=2 截 5 页 + 详情页收藏激活态 → `docs/screenshots/points-mall/`；Commit `feat(c端): 积分商品/收藏五页与入口`

### Task 10: C 端 i18n 五语言

**Files:** Modify: `src/i18n/locales/zh-CN.json`、`en-US.json`、`zh-TW.json`、`ja.json`、`ko.json`（以 Glob 实际语言文件清单为准）

- [ ] **Step 1**: 新增命名空间 `pointsGoods`（list/detail/confirm/orders/favorites 全部文案 key 清单从 Task 9 五页的 t() 调用汇总生成）与 `menu.pointsGoods`、`menu.myFavorites`；**五个语言文件同步补齐**，缺译用英文兜底并标记。
- [ ] **Step 2**: 切语言冒烟（手机视口截图 1 张中文/1 张英文）；Commit `feat(c端): 积分商城 i18n 五语言`

### Task 11: web-admin 两页 + 菜单 + 词条

**Files:**
- Create: `web-admin/src/apis/points-mall.ts`（fetchPointsProductsAdmin/create/update/delete + fetchPointsOrdersAdmin/markPaid/markShipped/markCompleted，gql 风格照抄 `apis/lottery.ts`）
- Create: `web-admin/src/pages/points/goods/index.vue`、`web-admin/src/pages/points/orders/index.vue`（结构照抄 `pages/lottery/prizes/index.vue`：行内编辑卡 + `useListPage` + `useLocaleStore`）
- Modify: `web-admin/src/router/index.ts`（2 路由）、`web-admin/src/constants/menus.ts` L110 后加 `{ label: 'menu.pointsGoodsManage', url: '/pages/points/goods/index', tier: 2 }, { label: 'menu.pointsOrdersManage', url: '/pages/points/orders/index', tier: 2 }`、`web-admin/src/locale/zh-Hans.json`（+其余语言文件同步）

- [ ] **Step 1: apis/points-mall.ts**
- [ ] **Step 2: points/goods/index.vue** 行内编辑卡：字段=商品变体选择（简化：input productId/variantId 数字 + 提示；二期上选择器）、pointsPrice、cashPrice(0=纯积分)、deliveryType(开关 physical/virtual)、stock、perUserLimit、validFrom/validTo（date 输入）、sortOrder、enabled switch；保存调 create/update，删除按钮调 delete。
- [ ] **Step 3: points/orders/index.vue** tabs（pending_payment/pending_ship/shipped/completed/cancelled/全部）+ 卡片（code/快照 name×qty/pointsTotal/cashTotal/status/createdAt/客户）+ 操作（待支付→标记已收款 confirm；待发货→标记发货（uni showModal 可输入单号：用 `uni.showModal({ editable: true })`）；已发货→标记完成）。
- [ ] **Step 4: 路由/菜单/locale 五语言同步**；Commit `feat(web-admin): 积分商品与积分订单管理页`

### Task 12: 全端构建 + 手机截图手册 + 收尾

- [ ] **Step 1**: vendure `yarn build`（产物入库 commit）；vshop C端 `npm run build:h5`（产物入库，参照批次3 产物提交惯例）；web-admin 按 `scripts/deploy.mjs` 流程构建。
- [ ] **Step 2: 操作手册**：Create `docs/superpowers/manual/usemall-parity-points-mall/index.md`——功能说明 + Task 9 截图（390×844 dpr=2）嵌入 + 管理端操作说明 + 边界（无自动超时关单/手动取消退分/线下收款兜底）。
- [ ] **Step 3**: 全量提交推送（vendure 后端 git pull + pm2 restart 部署由收尾阶段执行）。

---

## Self-Review 结论

1. **Spec 覆盖**：收藏（T2/T5/T8/T9-S5/T10）✓；积分商品 CRUD（T3/T11）✓；下单事务链+支付+取消+结算（T4/T9-S3）✓；admin 履约（T4/T11-S3）✓；C端入口版式B（T9-S6）✓；详情页收藏激活（T9 内 detail 页 + 商品详情页 detail.vue 的 onFavorite 替换——**在 Task 9 加一步**：`src/pkg-product/pages/detail.vue:315-317` 的 `onFavorite()` 改为调 `productFavoriteMeta`+`toggleProductFavorite`，图上 ☆/♥ 随 `myFavorited` 切换）；i18n（T10/T11-S4）✓；e2e（T7）✓；手机截图手册（T9-S7/T12-S2）✓。
2. **占位扫描**：Task 7 的 it 内注释体为「执行时展开」标记，已在文中显式禁止留注释体；Task 9-S3 地址簿复用、微信拉起复用两处需要执行时先 grep 定位（已写明定位方法与默认选择）。
3. **类型一致性**：`toggleProductFavorite` 返回 `{ favorited, favoriteCount }`（与 circle 的 ToggleCircleResult 四字段不同，shop schema 已一致定义）；`PO-<id>` code 与 outTradeNo 同值；`deliveryType` 字符串字面量 'physical'|'virtual' 贯穿实体/schema/C端/admin。
