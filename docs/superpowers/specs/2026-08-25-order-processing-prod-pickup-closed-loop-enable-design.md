# 2026-08-25 订单处理·生产打通到店自提核销/门店收银闭环（设计）

> 类型：**【完善】** —— 基于既有代码装配打通 + 存量幂等补种，零新业务逻辑开发。

## 1. 背景与问题

订单处理前端（订单列表/详情/发货、售后退款、到店自提核销页、门店收银台、配送/支付档案）已全部落地并提交（web-admin 仓库）。后端 `PickupPlugin`（核销码实体 + `myPickupOrders`/`claimPickupByShop`）与 `ShopPlugin`（店铺/店主/`myShopOrders`）代码已存在，且脚本 `vendure/packages/pickup-plugin/verify-closed-loop.ts` 已在本地 sqljs 走通「造自提订单 → 生成核销码 → 店主登录 → 确认收款核销」闭环。

但生产后端装配（`vendure/packages/dev-server/dev-config.ts`）**未启用 `ShopPlugin` 与 `PickupPlugin`**，导致 `pickup_redemption` / `shop` 表与 `myPickupOrders`/`claimPickupByShop` API 在生产不可用，web-admin 的「到店自提核销」「门店收银」页线上调用必然报错。此为当前订单处理缺失的关键一环。

## 2. 目标与范围

**目标**：通过装配既有插件，让到店自提核销 + 门店收银闭环在生产（PostgreSQL）可用，完成后可走一遍真实线上收款确认闭环。

**范围内（均为完善/打通，不新写业务逻辑）**：
1. 在 `dev-config.ts` plugins 装配 `ShopPlugin.init({})` + `PickupPlugin.init({})`
2. 生产 PostgreSQL 重启自动建表（`synchronize:true`），不写 migration
3. 存量库幂等补种 `fixed-aggregate-collection` 全局支付方式模板（`isGlobal`，供租户支付档案引用）
4. 复用既有 `orderBelongsToShop` 跨店核销守卫
5. 本地构建 → 提交 dist → 服务器 git pull + pm2 restart → 走通线上闭环

**范围外（YAGNI，本次不做）**：
- 门店收银「未在线支付应收款」`confirmPosCollection` 收款节点（若后续确认需求再评估）
- 新前端页面、新核销/店铺业务逻辑
- 任何 mysql/mariadb 相关操作（**生产仅 PostgreSQL**）

## 3. 现状基线（已存在，本次只装配不重写）

| 资产 | 位置 | 状态 |
| --- | --- | --- |
| ShopPlugin（`.init({})`，含 Shop 实体/店主/跨店守卫） | `vendure/packages/shop-plugin` | 已有代码 |
| PickupPlugin（`.init({})`，`PickupRedemption` 实体 + Resolver） | `vendure/packages/pickup-plugin` | 已有代码，`lib/` 已重建 |
| 固定聚合码收款 handler | `vendure/packages/cjk-plugin/src/payment/fixed-aggregate-collection-handler.ts` | 已有代码 |
| 全局支付模板 seed | cjk-plugin `seed/default-data.service.ts` | 已有代码，新库即建；老库需幂等补种 |
| 到店自提履约（deliveryType=pickup + fulfillment） | cjk-plugin pickup 相关 | 已有代码 |
| Order 自定义字段 `deliveryType`/`pickupClaimed` | PickupPlugin `configuration` 按 name 幂等并入 | 已有代码 |
| 跨店核销守卫 | `PickupPlugin` `orderBelongsToShop` | 已有代码 |
| 前端核销页/门店收银 | web-admin `pages/pickup/redeem`、`pages/pos` | 已提交 |
| 本地闭环验证脚本 | `packages/pickup-plugin/verify-closed-loop.ts` | 本地 PASS |

## 4. 设计

### 4.1 装配（dev-config.ts）
在 `packages/dev-server/dev-config.ts` 导入并加入 `plugins`：
- `ShopPlugin.init({})`
- `PickupPlugin.init({})`
排序与既有 `CjkPlugin` 等保持一致；`Order` 自定义字段由 PickupPlugin `configuration` 合并逻辑**按 name 幂等**并入，与 CjkPlugin 共存不冲突。

### 4.2 建表（生产 PostgreSQL）
生产 `getDbConfig()` 走 postgres 分支 → `synchronize:true` → 插件实体 `pickup_redemption`（含 orderId/code 唯一索引、channels 关联表）、`shop` 等**服务重启时自动创建**，**不写 migration**。本地验证继续用 sqljs 内存库。

### 4.3 存量补种（fixed-aggregate-collection 全局支付模板）
利用 cjk-plugin 已有 payment-template 服务，在引导/迁移钩子里幂等检查：若 `code === fixed-aggregate-collection` 全局模板缺失则 `createPaymentTemplate({ isGlobal:true })` 写入，已存在则跳过；失败仅记日志不阻塞启动。使老库存量租户可在支付档案「引用到本店」该全局方案。

### 4.4 安全（复用既有守卫）
核销仍走 `orderBelongsToShop` 强校验：被核销订单主商品必须归本店，否则 `ForbiddenError`，杜绝跨店核销。

### 4.5 数据流（与本地验证一致）
```
顾客自提单(deliveryType=pickup) → 付款(Settled) → addFulfillmentToOrder(manual) → Shipped
→ PickupRedemption.status=generated（顾客 myPickupCode 取码）
→ 店主 myPickupOrders 列出本店待核销单
→ claimPickupByShop(code) → redeemed / claimChannel=shop / claimedAt 落库
→ 履约转 Delivered、Order.pickupClaimed=true；重复核销被拒（一次性）
```

### 4.6 错误处理
- 补种幂等，失败仅记日志不阻断
- 跨店/重复核销分别抛 `ForbiddenError` / `UserInputError`，语义不变
- 部署全程本地构建，服务器仅 git pull + pm2 restart

### 4.7 验证与部署
1. 本地 dev-server（sqljs）复跑 `verify-closed-loop.ts`，确认闭环保 GREEN
2. 本地构建 vendure，`Select-String dist -Pattern "fixed-aggregate-collection|pickup_redemption"` 校验产物已含装配与补种
3. 提交 dist 产物到 git（遵守部署铁律：dist 纳入跟踪，`.gitignore` 已排除局部临时产物）
4. 服务器 `git pull` + `pm2 restart`（postgres 自动建表）
5. agent-browser 走通线上核销/门店收银闭环并截图留证

## 5. 验收标准
- 生产启动后存在 `pickup_redemption` 表
- 老库出现 `fixed-aggregate-collection` 全局支付方式（可被租户支付档案引用）
- 线上能以店主身份 `myPickupOrders` 查到本店待核销自提单，`claimPickupByShop` 成功置 `redeemed`/`Delivered`/`pickupClaimed`，重复核销被拒

## 6. 风险评估
- 若生产实际 DB 非 postgres 分支（synchronize 关），需临时补 migration——**根据既定铁律生产必为 postgres，故预期不触发**
- 两插件新增实体表与既有数据无冲突（全新表，不改造存量列）