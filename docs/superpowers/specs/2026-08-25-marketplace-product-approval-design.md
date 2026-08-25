# 商品上架审批 + 商家入驻增强设计

日期：2026-08-25
涉及仓库：`d:\zhao\vendure`（cjk-plugin）、`d:\zhao\vshop`（web-admin）

## 背景

vshop 平台（Vendure 多租户商城）当前商品管理只有租户侧的上架/下架开关（`Product.enabled`），尚无「商品是否进入平台统一 marketplace 目录」及其审核机制。平台总纲设计（`2026-08-16-vendure-marketplace-design.md`）定义了商品级 `listedInMarketplace` / `marketplaceStatus` / `merchantRef` 等字段与审批流，但尚未落地。

本次在 web-admin 内打通「提审 → 审核（通过/驳回）」的完整闭环，并轻量增强商家（租户）管理语义。

## 目标

平台管理员在 web-admin 完成商品上架审批闭环，并能在租户管理层面标识商户状态，为后续 marketplace 聚合展示打地基。

## 非目标（范围约束）

- **不做商家/租户侧的「提交上架」动作**——提审由平台管理员在 web-admin 手动提交，商家侧入口后续再接。
- **不做 marketplace 聚合展示**（跨商户统一目录、按商户分组）。
- **不做独立「入驻申请流程」**——商家入驻维持现状（管理员手动 `createTenant` 创建租户即可），仅增强商户状态标识。
- **不做审批历史的审计日志持久化**（后续接）。

---

## 一、商品上架审批

### 1.1 Product 自定义字段（后端）

在 cjk-plugin 为 `Product` 新增自定义字段（跨库安全，遵循 migrate 幂等补列模式）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `listedInMarketplace` | boolean | false | 是否在 marketplace 展示 |
| `marketplaceStatus` | enum `pending`/`approved`/`rejected` | — | 审批状态（null 表示从未提审） |
| `merchantRef` | 关联 Channel | — | 商品归属商家（自营=default，第三方=对应租户 Channel） |
| `rejectReason` | string | — | 驳回原因 |

> 字段命名以「产品级统一条形码/内部编码」等总纲字段（`barcode`/`internalCode`）不在本次范围，后续按需补。

### 1.2 GraphQL 接口

- `submitProductToMarketplace(id: ID!): Product`：提审，`marketplaceStatus → pending`。幂等：已 approved 的商品不可重复提审（返回明确错误或忽略）。
- `reviewMarketplaceProduct(id: ID!, approve: Boolean!, rejectReason: String): Product`：
  - `approve=true` → `marketplaceStatus=approved`，`listedInMarketplace=true`，清空 `rejectReason`
  - `approve=false` → `marketplaceStatus=rejected`，`listedInMarketplace=false`，写入 `rejectReason`
- `marketplaceProducts(status: MarketplaceStatus): [Product!]`：跨租户按状态查询（`status` 为空则返回全部含审批信息的商品）。

### 1.3 权限

审批仅限**平台超管 + 平台运营**角色（复用 default Channel 下的平台级角色权限白名单机制，遵循 `PERMISSION_CATALOG` 单一来源理念）。提审同样由平台侧执行。

### 1.4 前端（web-admin）

- 平台 Tab 下新增「商品审批」入口（与现有租户/角色/人员平台页同级）。
- 列表：跨商户展示审批相关商品（缩略图、名称、商户、售价、审批状态）。
- 操作：提审 / 通过 / 驳回（驳回弹窗填原因）。
- 状态筛选：全部 / 待审 / 已通过 / 已驳回。

---

## 二、商家入驻增强（轻量）

不新增独立入驻申请流程，仅在 tenant 管理语义上补充「商户状态」标识：

- 沿用既有 `Channel.customFields.isOfficial`（官方自营）区分自营/第三方。
- 新增 `Channel.customFields.merchantStatus`（`pending`/`active`/`disabled`），标识第三方商户的入驻态：
  - 第三方租户默认 `active`（已有正常租户直接视为已入驻商家）。
  - 预留 `pending`/`disabled` 供后续申请/封停语义，本次前端在租户列表展示该状态，不强制走审核流。

> 说明：按用户确认，「管理员手动增加租户足够」，本次不建入驻申请交互，仅落地可展示的状态字段。

---

## 变更清单

### 后端 `d:\zhao\vendure\packages\cjk-plugin`

| 文件 | 变更 |
|------|------|
| `src/plugin.ts` | Product 自定义字段注册 + marketplace 相关 extend schema（Query/Mutation） |
| `src/product/`（或复用既有目录） | 新增 marketplace 审批逻辑（自定义字段、提审/审核/查询服务） |
| 迁移文件 | Product/Channel 新增字段幂等补列（`hasColumn` 判断 + `addColumn`，参照 Channel `migrate-channel-custom-column` 模式） |

### 前端 `d:\zhao\vshop\web-admin`

| 文件 | 变更 |
|------|------|
| `src/pages/platform/product-approval/index.vue`（新增） | 商品审批页 |
| `src/pages.json` | 注册商品审批路由（平台 Tab 下） |
| `src/apis/product.ts`（或新增 api） | 提审/审核/跨租户查询接口 |
| `src/pages/platform/tenants/index.vue` | 展示商户状态标识（`merchantStatus` + `isOfficial`） |

---

## 错误处理与测试

- 不支持重复提审：应返回语义化错误而非静默失败。
- 驳回原因：`approve=false` 时鼓励必填 `rejectReason`（前端校验必填）。
- 跨库兼容：新字段统一用 migrate 幂等补列，`Date` 等类型遵循既有「可选数据类型注解」规范避免 `DataTypeNotSupportedError`。
- 后端验证：插件内 `tsc` 编译到 `lib/`，`Select-String lib/src/... -Pattern` 确认产物含改动。
- 前端由 HBuilder X 用户手动编译（web-admin 需本地构建推 dist）。

## 部署

- 后端：提交 git → 服务器 `git pull` → `pm2 restart vendure` → 健康检查 200。
- 前端：本地构建 `d:\zhao\vshop\web-admin` → 提交 dist → 服务器 git pull + pm2 restart（遵循部署铁律）。
- **绝不在服务器执行任何构建/安装命令。**