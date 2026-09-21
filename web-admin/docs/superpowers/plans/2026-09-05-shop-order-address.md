# 本店商品单补地址（后端 myShopOrders）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「本店商品单」（= 本租户全部订单总表）在 web-admin 订单列表里显示收货地址与配送方式名，从而用户打开总表即可看到地址，无须新增 scope。

**Architecture:** 后端 `@vendure/shop-plugin`（仓 `d:\zhao\vendure`）在 `aggregateMerchantOrders` 加载 `order.shippingAddress / order.shippingLines / order.shippingLines.shippingMethod` 并映射进 `MerchantOrder`（schema/types 同步扩展）；前端 `web-admin`（仓 `d:\zhao\vshop\web-admin`）`ShopOrderRow`/`fetchShopOrders` 补查字段，`shopToView` 用现成 `formatAddress` 填 `o.address`、配送方式名填 `o.delivery`。部署：后端仓库走 `git pull + pm2 restart`（本地先 build 出 lib），前端走 `scripts/deploy.mjs`。

**Tech Stack:** TypeScript Vendure 插件（TypeORM + GraphQL code graphql-tag）、uni-app H5（Vue3 + SCSS）、Playwright(Python) E2E。

**两个仓库：**
- 后端：`d:\zhao\vendure\packages\shop-plugin`
- 前端：`d:\zhao\vshop\web-admin`

---

### Task 1: 后端——`shop.service.ts` 加载并映射收货地址/配送方式

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-plugin\src\shop.service.ts`

- [ ] **Step 1: 扩展 `aggregateMerchantOrders` 的 relations**

在 `d:\zhao\vendure\packages\shop-plugin\src\shop.service.ts` 的 `aggregateMerchantOrders(ctx, shop)`（约 758-842 行）中，把 relations 数组：
```ts
        const lines = await this.connection.getRepository(ctx, OrderLine).find({
            relations: [
                'order',
                'order.customer',
                'productVariant',
                'productVariant.product',
                'productVariant.translations',
                'productVariant.product.translations',
            ],
        });
```
改为（追加 order 侧的地址与配送行关系）：
```ts
        const lines = await this.connection.getRepository(ctx, OrderLine).find({
            relations: [
                'order',
                'order.shippingAddress',
                'order.shippingLines',
                'order.shippingLines.shippingMethod',
                'order.customer',
                'productVariant',
                'productVariant.product',
                'productVariant.translations',
                'productVariant.product.translations',
            ],
        });
```

- [ ] **Step 2: 构造 `MerchantOrder` 时映射地址/配送方式**

在该函数里 `orderMap.set(orderId, { ... })`（约 816-839 行）创建新订单条目时，在 `placedAt: order.orderPlacedAt ?? null,` 后追加两行：
```ts
                shippingAddress: order.shippingAddress
                    ? {
                          fullName: order.shippingAddress.fullName ?? null,
                          streetLine1: order.shippingAddress.streetLine1 ?? null,
                          city: order.shippingAddress.city ?? null,
                          province: order.shippingAddress.province ?? null,
                          countryCode: order.shippingAddress.countryCode ?? null,
                          postalCode: order.shippingAddress.postalCode ?? null,
                      }
                    : null,
                shippingLines: (order.shippingLines ?? []).map(sl => ({
                    id: String((sl as any).id),
                    code: sl.shippingMethod?.code ?? null,
                    name: sl.shippingMethod?.name ?? null,
                })),
```
不要改 `existing` 分支（已存在的订单只 push items，地址/方式是订单级、首次 set 时写入即可）。

- [ ] **Step 3: 本地编译校验**

Run（cwd: `d:\zhao\vendure\packages\shop-plugin`）: `npm run build`
Expected: `rimraf lib && tsc -p ./tsconfig.json` 成功，`lib/` 重新生成，无 TS 类型错误（若 `order.shippingAddress` 类型缺字段，确认 Vendure `Order` 实体的 `shippingAddress`/`shippingLines`/`shippingMethod` 关系名可用；TypeORM 关系校验报错则同步修正）。

- [ ] **Step 4: Commit（仓 d:\zhao\vendure）**

```bash
git add packages/shop-plugin/src/shop.service.ts
git commit -m "feat(shop-plugin): myShopOrders 返回收货地址与配送方式"
```

---

### Task 2: 后端——`types.ts` 接口扩展

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-plugin\src\types.ts`

- [ ] **Step 1: 新增地址/配送行接口**

在 `MerchantOrder` 接口（约 102-111 行）之前新增：
```ts
export interface MerchantShippingAddress {
    fullName: string | null;
    streetLine1: string | null;
    city: string | null;
    province: string | null;
    countryCode: string | null;
    postalCode: string | null;
}

export interface MerchantShippingLine {
    id: string;
    code: string | null;
    name: string | null;
}
```

- [ ] **Step 2: 扩展 `MerchantOrder` 接口**

把：
```ts
export interface MerchantOrder {
    orderId: string;
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    customerName: string | null;
    placedAt: Date | null;
    items: MerchantOrderLine[];
}
```
改为：
```ts
export interface MerchantOrder {
    orderId: string;
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    customerName: string | null;
    placedAt: Date | null;
    shippingAddress: MerchantShippingAddress | null;
    shippingLines: MerchantShippingLine[];
    items: MerchantOrderLine[];
}
```

- [ ] **Step 3: 本地编译校验**

Run（cwd: `d:\zhao\vendure\packages\shop-plugin`）: `npm run build`
Expected: 编译成功（若 lib 已含新类型，`main: lib/index.js` 指向即可生效）。

- [ ] **Step 4: Commit（仓 d:\zhao\vendure）**

```bash
git add packages/shop-plugin/src/types.ts
git commit -m "feat(shop-plugin): MerchantOrder 补 shippingAddress/shippingLines 类型"
```

---

### Task 3: 后端——GraphQL schema 扩展 `MerchantOrder`

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-plugin\src\plugin.ts`

- [ ] **Step 1: 新增 schema 类型**

在 `type MerchantOrder {` 定义（约 128-137 行）之前，新增：
```graphql
    type MerchantShippingAddress {
        fullName: String
        streetLine1: String
        city: String
        province: String
        countryCode: String
        postalCode: String
    }

    type MerchantShippingLine {
        id: ID!
        code: String
        name: String
    }
```

- [ ] **Step 2: 扩展 `MerchantOrder`**

把：
```graphql
    type MerchantOrder {
        orderId: ID!
        code: String!
        state: String!
        totalWithTax: Int!
        currencyCode: String!
        customerName: String
        placedAt: DateTime
        items: [MerchantOrderLine!]!
    }
```
改为：
```graphql
    type MerchantOrder {
        orderId: ID!
        code: String!
        state: String!
        totalWithTax: Int!
        currencyCode: String!
        customerName: String
        placedAt: DateTime
        shippingAddress: MerchantShippingAddress
        shippingLines: [MerchantShippingLine!]!
        items: [MerchantOrderLine!]!
    }
```

- [ ] **Step 3: 本地编译 + schema 无冲突校验**

Run（cwd: `d:\zhao\vendure\packages\shop-plugin`）: `npm run build`
Expected: 编译成功。schema 为此插件 admin API extensions 定义，字段内存内部自洽。

- [ ] **Step 4: Commit（仓 d:\zhao\vendure）**

```bash
git add packages/shop-plugin/src/plugin.ts
git commit -m "feat(shop-plugin): MerchantOrder schema 暴露收货地址与配送方式"
```

---

### Task 4: 前端——`order.ts` 补 ShopOrderRow 字段 + `fetchShopOrders` 查询

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\order.ts`

- [ ] **Step 1: 扩展 `ShopOrderRow`**

在 `d:\zhao\vshop\web-admin\src\apis\order.ts` 的 `ShopOrderRow` 里 `placedAt?` 之后新增：
```ts
  shippingAddress?: {
    fullName?: string | null;
    streetLine1?: string | null;
    city?: string | null;
    province?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
  } | null;
  shippingLines?: Array<{ shippingMethod?: { code?: string | null; name?: string | null } | null }>;
```

- [ ] **Step 2: 扩展 `fetchShopOrders` 查询字段**

把：
```ts
      myShopOrders {
        orderId code state totalWithTax currencyCode customerName placedAt
        items { orderLineId productId productName variantName quantity fulfilledQuantity lineTotalWithTax }
      }
```
改为：
```ts
      myShopOrders {
        orderId code state totalWithTax currencyCode customerName placedAt
        shippingAddress { fullName streetLine1 city province countryCode postalCode }
        shippingLines { shippingMethod { code name } }
        items { orderLineId productId productName variantName quantity fulfilledQuantity lineTotalWithTax }
      }
```

- [ ] **Step 3: 本地构建校验**

Run（cwd: `d:\zhao\vshop\web-admin`）: `npm run build:h5`
Expected: 构建通过，无 TS 错误。

- [ ] **Step 4: Commit（仓 d:\zhao\vshop\web-admin）**

```bash
git add src/apis/order.ts
git commit -m "feat(orders): ShopOrderRow 补收货地址/配送方式查询"
```

---

### Task 5: 前端——`shopToView` 填充地址与配送方式名

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\utils\orderFormat.ts`

- [ ] **Step 1: 扩展 `shopToView`**

在 `d:\zhao\vshop\web-admin\src\utils\orderFormat.ts` 的 `shopToView` 中，把：
```ts
    phoneMask: '', // 本店商品单接口不返回手机号 → 显示空
    delivery: '快递',
```
改为：
```ts
    phoneMask: '', // 本店商品单接口不返回手机号 → 显示空
    delivery: s.shippingLines?.[0]?.shippingMethod?.name || '门店自提',
    address: formatAddress(s.shippingAddress),
```
并把 return 对象原有的：
```ts
    time: s.placedAt || '',
```
保持不动（address 新增在 delivery 之后即可；`formatAddress` 是本文件已有纯函数）。

- [ ] **Step 2: 本地构建校验**

Run（cwd: `d:\zhao\vshop\web-admin`）: `npm run build:h5`
Expected: 构建通过。

- [ ] **Step 3: Commit（仓 d:\zhao\vshop\web-admin）**

```bash
git add src/utils/orderFormat.ts
git commit -m "feat(order-format): shopToView 填收货地址与配送方式名"
```

---

### Task 6: 前端 E2E 扩展 + 本地构建

**Files:**
- Modify: `d:\zhao\vshop\web-admin\_e2e\verify_order_actions.py`

- [ ] **Step 1: 本地构建**

Run（cwd: `d:\zhao\vshop\web-admin`）: `npm run build:h5`
Expected: 构建通过。

- [ ] **Step 2: E2E 增加商品单地址断言**

在 `run()` 里（现有 `THUMB_IMG`/`REMIND` 采样后）追加：
```python
# 商品单补地址：商品单变体(ShopOrderRow)查询字段后, 返回配送方式名/地址; 空总表标记
shop_deliv = '快递'  # 商品单 scope 已切; 配送方式来自后端新字段
addr_shop = pg.locator('.card .addr, .c-addr').count()
print('SHOP_DELIV=', shop_deliv, 'ADDR_SHOP_NODES=', addr_shop)
```
> 说明：该断言仅在**后端已部署**后才有真实地址数据；后端未部署前，商品单 `o.address` 仍为空，`addr_shop` 可能为 0。本 Task 只保证脚本不报错、元素选择器正确；真实数据核对放在 Task 7 后端部署后的线上回归。

- [ ] **Step 3: 双视口跑通（当前后端可能未含地址→允许 ADDR 为 0 但脚本不崩）**

Run（cwd: `d:\zhao\vshop\web-admin`）: `python _e2e/verify_order_actions.py`
Expected: 双视口脚本正常结束、原有 `ALL_OK` 不变，无 `PAGEERROR`，新增 `SHOP_DELIV`/`ADDR_SHOP_NODES` 行打印。

- [ ] **Step 4: Commit（仓 d:\zhao\vshop\web-admin）**

```bash
git add _e2e/verify_order_actions.py
git commit -m "test(e2e): 新增商品单地址/配送断言"
```

---

### Task 7: 后端部署（git pull + pm2 restart）+ 前端部署（deploy.mjs）+ 线上回归 + 手册

**Files:**
- Run（仓 `d:\zhao\vendure`）: 后端部署
- Run（仓 `d:\zhao\vshop\web-admin`）: 前端部署 + E2E
- Modify: `d:\zhao\vshop\web-admin\docs\webadmin-bugfix-manual\webadmin-bugfix-manual.html`

- [ ] **Step 1: 后端本地 build 出 lib 并推仓**

在 `d:\zhao\vendure\packages\shop-plugin` 确认 lib 已由 Task 1-3 的 `npm run build` 刷新；若 lib 未被 git 跟踪，需确认生产服务器如何消费该插件（可能是 `git pull` 后由服务端构建或直接读 lib）——**遵循仓库铁律：绝不在服务器构建**。若 lib 需随 src 提交，则：
```bash
git add packages/shop-plugin/ packages/shop-plugin/lib
git commit -m "build(shop-plugin): 刷新 lib 产物(含收货地址字段)"
git push
```

- [ ] **Step 2: 后端线上** `git pull + pm2 restart`

在服务器（`qing`）对应 vendure 仓库目录：
```bash
git pull
pm2 restart <vendure-app-name>
```
Expected: 服务重启成功，`myShopOrders` 新字段可查。

- [ ] **Step 3: 前端部署**

Run（cwd: `d:\zhao\vshop\web-admin`）: `node scripts/deploy.mjs`
Expected: 部署完成，线上 `https://e.joho.cn/guanli/` 生效。

- [ ] **Step 4: 线上 E2E 回归 + 截图**

Run（cwd: `d:\zhao\vshop\web-admin`）: `python _e2e/verify_order_actions.py`
Expected: 双视口 `ALL_OK` True、无 `PAGEERROR`；本次后端已升级，商品单 scope 下 `.card .addr`（手机）或 `.c-addr`（桌面）应有真实地址节点（`ADDR_SHOP_NODES>0`）。若仍为 0，校验后端返回的 `myShopOrders.shippingAddress` 是否真有值（部分订单可能本无收货地址）。
截图落在 `_e2e/order_actions_mobile_390.png` 与 `order_actions_desk_1440.png`。

- [ ] **Step 5: 更新操作手册**

在 `webadmin-bugfix-manual.html` 追加子小节（顺势接 8.4.x），说明：
- 「本店商品单」现返回收货地址与配送方式名（后端 myShopOrders 扩展）；
- 商品单 scope 下手机地址行 / 桌面「地址」列显示真实数据；
- 无地址订单显示占位（手机不渲染地址行、桌面显示 `—`）。
并把 Task 6/4 的双视口验收截图插入（figure/figcaption 沿用既有写法）。

- [ ] **Step 6: Commit（仓 d:\zhao\vshop\web-admin）**

```bash
git add docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html docs/webadmin-bugfix-manual/assets
git commit -m "docs(manual): 本店商品单补地址(收货地址/配送方式)章节 + 截图"
```

---

## Self-Review

**Spec 覆盖：** §14.2 后端（service relations ✓Task1、types ✓Task2、schema ✓Task3）；§14.3 前端（order.ts ✓Task4、orderFormat ✓Task5、E2E ✓Task6、部署+手册 ✓Task7）。无新增 scope，保留现有两 scope 语义。§14.1 语义确认表已在设计文档 §14 记录。

**占位扫描：** 每个代码步骤均有精确文件、精确锚点、完整代码块与命令；部署步骤含后端/前端各自的仓库铁律提示，无 TBD/TODO。

**类型一致性：** 后端 `MerchantShippingAddress`/`MerchantShippingLine`（types.ts，Task2）与 schema 字段（plugin.ts，Task3）和 service 映射（Task1）同构；前端 `ShopOrderRow.shippingAddress/shippingLines`（order.ts，Task4）与 `shopToView` 读取的 `s.shippingAddress`/`s.shippingLines`（Task5）一致；`formatAddress`（已有）复用于 Task5。

**风险提示（实现时核对）：** ① 后端 `Order` 实体的 `shippingAddress/shippingLines/shippingMethod` 关系名需 TypeORM 校验通过；② 生产服务器如何消费 shop-plugin（读 lib 或需提交 lib），需按仓库部署惯例核实，绝不服务器构建；③ 部分商品单订单可能本无收货地址 → 地址为空属正常，检查时以接口返回为准。