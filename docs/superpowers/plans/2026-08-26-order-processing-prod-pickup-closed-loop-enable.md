# 生产打通到店自提核销/门店收银闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `vendure/packages/dev-server/dev-config.ts` 装配既有 `ShopPlugin` 与 `PickupPlugin`，使到店自提核销 + 门店收银闭环在生产（PostgreSQL）可用，并走通线上收款确认闭环。

**Architecture:** 【完善】型，零新业务逻辑。唯一源码改动是 dev-config.ts 的 imports + plugins 装配。生产 `getDbConfig()` 走 postgres 分支（`synchronize:true`）→ `pickup_redemption`/`shop` 表重启自动建；`fixed-aggregate-collection` 全局支付模板由 cjk-plugin 幂等 seed（每次 bootstrap 运行，`lib` 已含 `seedFixedAggregatePaymentTemplate`）自动补种。装机顺序：装配 → 本地构建 dist → 提交 → 服务器 git pull + pm2 restart → 线上验证。

**Tech Stack:** TypeScript + Vendure 3.6.4（`@vendure/shop-plugin` / `@vendure/pickup-plugin` 本地 workspace 包）+ tsc 生产编译（`tsconfig.prod.json` → `dist/`）+ agent-browser（线上闭环验证）。

**关键事实（已核实）：**
- `ShopPlugin.init({})` 导出自 `@vendure/shop-plugin`，`lib/` 已构建并提交。
- `PickupPlugin.init({})` 导出自 `@vendure/pickup-plugin`，`lib/` 已构建并提交。
- cjk-plugin `lib/src/seed/default-data.service.js` 已含 `seedFixedAggregatePaymentTemplate`（幂等：按 `code` 判空后建 `isGlobal:true` 模板），随每次 bootstrap 自动补种，无需额外钩子。
- 生产 DB 仅 PostgreSQL（`DB=postgres` → `synchronize:true`）；**禁止任何 mysql/mariadb**。

---

### Task 1: 装配 ShopPlugin + PickupPlugin 到 dev-config.ts

**Files:**
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts`

- [ ] **Step 1: 新增两个插件 import**

在 `dev-config.ts` 第 64 行 `import { PreSalePlugin } from '@vendure/pre-sale-plugin';` 之后插入两行 import：

```typescript
import { ShopPlugin } from '@vendure/shop-plugin';
import { PickupPlugin } from '@vendure/pickup-plugin';
```

- [ ] **Step 2: 在 plugins 数组装配两插件**

在 `dev-config.ts` 第 330 行 `CjkPlugin.init({ ... })` 结束的 `}),` 之后插入两个元素（PickupPlugin 依赖 ShopPlugin，故二者相邻放置）：

```typescript
        CjkPlugin.init({
            i18n: { enabled: true },
            regions: { enabled: true },
            tenant: { enabled: true },
            cod: { enabled: true },
            storePickup: { enabled: true },
            pickupPoint: { enabled: true },
            employeePickup: { enabled: true },
            promotionPolicy: { enabled: true },
            authSecret: process.env.AUTH_SECRET || 'dev-auth-secret-key',
        }),
        ShopPlugin.init({}),
        PickupPlugin.init({}),
```

说明：`PickupPlugin` 的 `configuration` 回调会按 `deliveryType`/`pickupClaimed` 幂等并入 `Order` 自定义字段，与 CjkPlugin 共存不冲突；`ShopPlugin` 幂等并入 `Product.shopId` 与 `ManageOwnShop` 权限，重复装配自动去重。

- [ ] **Step 3: 本地类型检查确认无编译错误**

Run（在 vendure 根目录）:

```bash
npx tsc --noEmit -p packages/dev-server/tsconfig.prod.json
```

Expected: 退出码 0，无 `Can't resolve '@vendure/shop-plugin'` / `'@vendure/pickup-plugin'` 类错误（workspace 包通过 node_modules 符号链接可解析）。

---

### Task 2: 本地构建 dev-server dist 并校验装配产物

**Files:**
- Build output: `d:\zhao\vendure\packages\dev-server\dist\`（`.gitignore` 未排除，纳入 git 跟踪）

- [ ] **Step 1: 运行生产编译**

Run（在 vendure 根目录）:

```bash
npx tsc -p packages/dev-server/tsconfig.prod.json
```

Expected: `dist/dev-config.js` 重新生成，含两插件装配。

- [ ] **Step 2: 校验 dist 已含装配与 seed 引用**

Run（PowerShell）:

```powershell
Select-String dist/dev-config.js -Pattern "shop-plugin|pickup-plugin"
Select-String dist\index.js -Pattern "shop-plugin|pickup-plugin"
```

Expected: 命中 `require("@vendure/shop-plugin")` / `require("@vendure/pickup-plugin")`（或 `__importStar` 包裹）两处 import；plugins 数组含 `ShopPlugin.init({})` 与 `PickupPlugin.init({})` 调用。

- [ ] **Step 3: 复核插件 lib 为最新（含 seed 补种）**

Run（PowerShell）:

```powershell
Select-String packages\cjk-plugin\lib\src\seed\default-data.service.js -Pattern "seedFixedAggregatePaymentTemplate"
Select-String packages\pickup-plugin\lib\src\pickup.plugin.js -Pattern "claimPickupByShop"
```

Expected: 各命中 ≥1 处（cjk 已核实含；pickup lib 上轮已重建）。

---

### Task 3: 提交变更到 git（vendure 仓库）

**Files:**
- Modify (committed): `packages/dev-server/dev-config.ts`、`packages/dev-server/dist/dev-config.js`（及同批 rebuild 的 `dist/*`）

- [ ] **Step 1: 查看变更范围**

Run（在 `d:\zhao\vendure`）:

```bash
git status --short packages/dev-server/dev-config.ts packages/dev-server/dist
```

确认仅 dev-config 相关产物变动（无插件 lib 误动）。

- [ ] **Step 2: 提交**

```bash
git add packages/dev-server/dev-config.ts packages/dev-server/dist
git commit -m "feat(dev-server): 装配 ShopPlugin/PickupPlugin 打通到店自提核销与门店收银闭环"
```

遵部署铁律：本地构建产物入 git，服务器不构建。

---

### Task 4: 服务器部署（git pull + pm2 restart）并校验建表/补种

**Files:**
- 服务器目标：沿用既往部署流程的 vendure 仓库目录与 pm2 应用（`DB=postgres` 环境已配）。

- [ ] **Step 1: 服务器拉取并重启**

通过既有 SSH/pm2 通道在服务器 vendure 仓库目录执行：

```bash
git pull
pm2 restart <vendure-app>   # 替换为实际 pm2 应用名
```

Expected: 服务重启成功；PostgreSQL 下 `synchronize:true` 自动建 `pickup_redemption`、`shop` 及多对多关联表。

- [ ] **Step 2: 校验自提/店铺表已建且补种全局支付模板**

登录生产 PostgreSQL（`psql` 或既有查询通道）：

```sql
SELECT table_name FROM information_schema.tables WHERE table_name IN ('pickup_redemption','shop','shop_channel','pickup_redemption_channel');
SELECT code,name,is_global FROM payment_template WHERE code='fixed-aggregate-collection';
```

Expected:
- 自提图 4 张表均在列；
- `payment_template` 存在 `code='fixed-aggregate-collection'`（全局）记录 —— 由 cjk-plugin 幂等 seed 自动补种，无需手插。

- [ ] **Step 3: 确认 pm2 日志无装配报错**

遵 PM2 日志排查铁律（先 flush 再拉取）：

```bash
pm2 flush <vendure-app>
pm2 restart <vendure-app>
pm2 logs <vendure-app> --lines 50 --nostream
```

Expected: 日志出现 `已创建默认支付模板: fixed-aggregate-collection`（若老库首次补种）或 `默认数据初始化完成`（若已存在），且无 `EntityMetadataNotFound` / GraphQL schema 冲突报错。

---

### Task 5: 线上闭环验证（agent-browser）+ 截图留证

**Files:**
- 无源码改动；验证截图与核销数据落在生产。

- [ ] **Step 1: 以店主身份登录并查询本店待核销单**

用 agent-browser 打开线上 admin 并登录店主（`zhao@163.com` / `23123`），导航至「门店收银」/「到店自提核销」，或直接调用 admin API：

```graphql
mutation { claimPickupByShop(code: "<核销码>") { id orderId orderCode code status claimChannel claimedAt } }
```

Expected: `status=redeemed`、`claimChannel=shop`；重复调用同一 `code` 被拒（一次性）。

- [ ] **Step 2: 造一条真实自提单走通收款确认闭环**

在线上用既有自提下单链路生成快递码 → 付款 → 店主 `myPickupOrders` 命中 → `claimPickupByShop` 确收 → 订单转 `Delivered`、`pickupClaimed=true`。

Expected: 闭环各状态与本地 `verify-closed-loop.ts` 基线一致。

- [ ] **Step 3: 截图留证并清理**

对核销前后（待核销列表 / 确认收款后状态）各截图，存入交付目录；验证完毕用 agent-browser 清理临时验证数据/截图，避免污染 git 工作区。

Expected: 交付物含核销成功状态截图，`git status` 干净。

---

## 验收标准（对照 spec）

- [ ] 生产重启后 `pickup_redemption` / `shop` 等表存在
- [ ] 老库出现 `fixed-aggregate-collection` 全局支付方式（租户支付档案可「引用到本店」）
- [ ] 线上店主可 `myPickupOrders` 查到本店待核销自提单，`claimPickupByShop` 成功置 `redeemed`/`Delivered`/`pickupClaimed`，重复/跨店核销被拒

## 风险评估

- 若服务器 DB 分支非 postgres（`synchronize` 关）则需补 migration —— 依既定铁律生产必为 postgres，本轮预期不触发；如 `information_schema` 未查到表即为该信号，需停下核对 `DB` 环境变量再处理。
- 两插件新增实体表为全新表，与存量数据无冲突，不改存量列。