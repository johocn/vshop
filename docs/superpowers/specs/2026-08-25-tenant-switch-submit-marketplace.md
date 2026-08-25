# 租户切换体验 + 商户提交商品上架默认站点 设计

日期：2026-08-25
状态：已批准

## 背景与目标

web-admin 后台当前存在四类体验/功能缺口，需一次性补齐：

1. **切租户页只显示 code**，不显示店铺名/店铺编号，体验差。
2. **无法切换到 t1 租户**（开关是开的），需定位真正根因并修复，否则无法在 t1 开展业务。
3. **无法在 t1 发商品**：多为「切不进 t1」的连带问题；切进去后发商品应可使用现有流程。
4. **无法提交商品到默认站点销售**：后端 `submitForMarketplace` 仅存在于 **shop API**，web-admin 走 **admin API** 没有此 mutation，商户后台无提审入口。
5. **默认站点分类**沿用全局 Collection 体系，不另建独立分类体系。

## 现状梳理

- `myTenantAccess`（`my-access.resolver.ts`）已为每个 channel 返回 `id/code/token/name/shopName/tenantNo/isOfficial/enabled/memberEnabled`。
- `authStore.loadAccess` 仅保留 `enabled && memberEnabled` 的租户进切租户列表；超管 `memberEnabled` 恒 true。
- 切租户页 `channel-select/index.vue` 只渲染 `code` 一行。
- marketplace-plugin：
  - **shop API**：`submitForMarketplace`（提审，`@Allow(UpdateCatalog, UpdateProduct)`）、`myMerchantProducts`、`marketplaceProducts`。
  - **admin API**：`approveMarketplaceProduct` / `rejectMarketplaceProduct` / `marketplacePendingProducts`（平台审核侧）。
  - 后端的 `MarketplaceService.submitForMarketplace` 已实现置 `pending` + 条形码唯一校验。
- 前端 `apis/marketplace.ts` 已有平台审核 `fetchPendingProducts/approveProduct/rejectProduct`，**无提审 API**。
- 商品创建 `product/create` 走 `createProductFull`，商品表单 `ProductForm.vue` 已支持选择 Collection（`collectionId`）。

## 需求与设计

### 1️⃣ 切租户页：显示店铺名 + 小字编号，并暴露停用租户
改造 `web-admin/src/pages/channel-select/index.vue`：
- 大字显示店铺名（`name`，后端 `shopName||code`）。
- 小字显示店铺编号（`code`，如 `t1`）+ 租户号 `#tenantNo` + 官方自营/第三方徽标。
- 已停用租户（`enabled=false`）不再从列表隐藏，改为灰态显示并标注「已停用」，点击无效。

### 2️⃣ t1 无法切换：定位并修复真正根因
`enabled` 开关已开，故过滤不是根因。需排查：
- `myTenantAccess` 对 t1 返回的 `enabled/memberEnabled/name/token` 是否正常；
- 超管登录时 t1 是否在 `channels`；切换 `pick(t1)` 后 `tenant.selectCh` + `auth.loadAccess(t1.id)` 是否成功；
- t1 channel 的 `customFields.enabled`、超管在 t1 的人员绑定是否完整。
修复方向：在线验证 t1 在各环节的实际数据，改动对准真实根因。

### 3️⃣ admin API 新增提审 mutation（复用 shop 已实现逻辑）
在 marketplace-plugin admin 侧暴露：
```
extend type Mutation { submitForMarketplaceAdmin(productId: ID!): Boolean! }
```
- 复现 `MarketplaceService.submitForMarketplace`。
- 越权防护：提交时校验商品属于当前激活渠道（`ctx.channelId`），避免商户提审他人商品。
- 权限：`@Allow(Permission.UpdateProduct)`（商户含此权限）；平台超管天然通过。

### 4️⃣ 前端提审入口
- `apis/marketplace.ts` 新增 `submitProductToMarketplace(id)`（admin client）。
- 商品管理/编辑页对「当前租户自身商品且未提审（`marketplaceStatus` 非 pending/approved）」显示「提交上架到默认站点」操作，点击调用提审 mutation。
- 提交后状态置 pending，平台在已实现的 `platform/product-approval` 页完成通过/驳回闭环。

### 5️⃣ 默认站点分类：沿用全局 Collection
- 不新增独立分类体系，沿用现有 Collection。
- 商户发商品时在 `ProductForm` 选择 Collection（已支持 `collectionId`）；平台审核通过在默认站点后按所选分类展示。
- 本项原则上无新增开发，仅在产品列表/编辑页确认分类与展示正确。

## 非目标
- 不做商家入驻申请流程、不做独立「默认站点货架分类」体系。
- 不新增 C 端商户发商品流程（维持 web-admin 后台发商品）。

## 验收
- 切租户页显示店铺名 + 小字店铺编号，停用租户灰态可见。
- 超管可切换到 t1（或定位出真实阻断并修复）。
- 切到 t1 后可创建商品。
- 商户在 t1 可对自身商品「提交上架到默认站点」，平台审核通过后在默认站点可见，并归入所选 Collection。