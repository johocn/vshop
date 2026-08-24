# vshop 租户 / 角色 / 权限体系设计

> 日期：2026-08-23
> 项目：vshop（Vendure）多租户电商 —— 后端 `vendure/packages/cjk-plugin` + 前端 `vshop/web-admin`（`https://e.joho.cn/guanli`）
> 状态：设计稿（待实现）
> 前置约定：`d:\zhao\docs\superpowers\specs\2026-08-16-vendure-marketplace-design.md`

---

## 一、背景与目标

### 1.1 平台定位（历史约定，本次固化）

vshop 是基于 Vendure 开发的、适用于手机用户的 C 端客户端 + 应用管理端（web-admin）。多租户基于 Vendure **Channel**，通过 `vendure-token` 区分租户。

- **default 租户目标**：打造类似淘宝/京东商城一样的站点（marketplace），聚合展示自营 + 第三方商家商品。
- **前 20 个租户**：预留官方自营。
- **从第 21 个租户开始**：给第三方商户使用。
- **商品审批**：第三方租户发布的产品需经平台批准通过后，才能在 default 租户（商城）销售；独立店销售不受审批约束。
- **配送方式、支付方式**：均按租户后台设置流程（各租户自配，复用全局方案池「引用到本店」）。

> 说明：上述「前 20 官方自营 / 21+ 第三方」与「商品审批」为历史文档约定（见 2026-08-16 marketplace 设计）。**商品审批流本轮不实现**，仅在本设计中为它预留权限点与数据字段（见 §5 范围外）。

### 1.2 本轮目标

只做**租户 / 角色 / 权限体系**，为未来 marketplace 审批与多租户运营打下管理基础：

1. 超管 CRUD 开启 / 关闭租户（Channel 级启停）。
2. 超管给租户授权管理员。
3. 为租户建立角色：租户管理员、销售、库存（内置模板，可自定义）。
4. 租户管理员 CRUD 开启 / 关闭租户内部人员权限、分配角色权限。
5. 角色权限分配（业务权限点 ↔ Vendure 原生 Permission 映射）。
6. 前 20 个官方自营租户填充默认数据（预建完整频道）。

### 1.3 用户管理边界（关键约定）

- **前后端用户管理分离**：后台用户（web-admin 登录）走 Vendure **Administrator + Role**（限定 Channel）；C 端用户（买家/会员）走 Vendure **Customer** 体系（zhao-auth / SSO）。
- 本设计只处理**后台 Administrator 体系**，C 端会员不在本轮范围。
- 后台人员能核销 C 端订单商品码（操作者是后台管理员、对象是 C 端订单），本轮预留核销权限点，功能实现后续挂接。

---

## 二、现状盘点（代码实证）

| 项 | 现状 | 依据 |
|----|------|------|
| Channel 自定义字段 | 优惠券叠加/职工自提/默认位置/登录/支付/地图配置；**无 enabled / tenantNo / isOfficial** | `cjk-plugin/src/tenant/tenant-channel-custom-fields.ts` |
| 管理员 / 角色 | 全部走 Vendure 原生 AdministratorService / RoleService，无自定义扩展 | `cjk-plugin/src` |
| 自定义权限注册 | 已有 Pickup / 全局自提点 / tenantConfig / Shipping/Payment Template·Profile 权限 | `cjk-plugin/src/plugin.ts` |
| 全局默认数据 | 幂等 seed 全局配送/支付模板与门店自提点、收银档案 | `cjk-plugin/src/seed/default-data.service.ts` |
| web-admin 页面 | 登录/店铺选择/工作台/商品/订单/配送/支付/自提点/装修/分销/数据/图片库；**无租户/角色/人员管理页** | `web-admin/src/pages.json` |
| 超管判定 | 仅按 `username === 'superadmin'` 判断 | `web-admin/src/stores/authStore.ts` |
| marketplace 审批 | 仅设计文档（2026-08-16），未实现 | `docs/superpowers/specs/2026-08-16-*` |

---

## 三、数据模型

### 3.1 Channel（租户）自定义字段扩展

在 `tenant-channel-custom-fields.ts` 追加：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | true | 租户启停开关。**停用后该租户所有后台人员无法登录**（C 端不受影响） |
| `tenantNo` | int | null | 租户序号。`1-20`=官方自营，`21+`=第三方商户 |
| `isOfficial` | boolean | false | 是否官方自营（seed 时按 tenantNo≤20 置 true，用于展示/过滤） |

### 3.2 人员实体 `TenantMember`（新增 cjk 实体表）

后台人员 = Vendure 原生 **Administrator** + 自定义关联表 **TenantMember**（承载「所属租户 + 启停 + 备注」，避免给原生 Administrator 加字段）：

| 字段 | 说明 |
|------|------|
| `administratorId` | 关联原生 Administrator（一个账号可属多租户） |
| `channelId` | 所属租户（Channel） |
| `enabled` | 人员启停（停用则该账号对该租户登录被拒） |
| `displayName` / `remark` / `createdAt` | 展示与备注 |

### 3.3 角色（Role）

- 使用 Vendure 原生 **Role**，创建时 `channels=[该租户]`，权限 = 原生 Permission 码集合。
- 租户级角色只授予业务权限；超管专属权限（`SuperAdmin` 级）不对租户级角色开放。
- 内置模板角色在每租户 seed 时各建一份，限定该租户 Channel。

---

## 四、权限点清单（功能模块 ↔ Vendure Permission）

web-admin 菜单/按钮按功能模块显隐，后端接口由 Vendure 原生权限强制校验。

| 功能模块 | 读权限 | 写权限 |
|----------|--------|--------|
| 分类管理 | ReadCollection | Create/Update/DeleteCollection |
| 商品管理 | ReadProduct | Create/Update/DeleteProduct |
| 库存与预警 | ReadProductVariant + ReadStockMovement | UpdateProductVariant |
| 图片库 | ReadAsset | Create/DeleteAsset |
| 订单 | ReadOrder | UpdateOrder |
| 发货 | ReadOrder + ReadFulfillment | Create/UpdateFulfillment |
| 售后 | ReadOrder | UpdateOrder（售后流） |
| 配送方式/模板/档案 | ReadShippingMethod + cjk Shipping 权限 | Create/Update/DeleteShippingMethod + cjk Shipping 权限 |
| 支付方式/模板/档案 | ReadPaymentMethod + cjk Payment 权限 | Create/Update/DeletePaymentMethod + cjk Payment 权限 |
| 自提点 | cjk Pickup 权限(Read) | cjk Pickup 权限(Write) |
| 装修/店铺信息 | ReadChannel | UpdateChannel + tenantConfigPermission |
| 分销/佣金 | cjk 分销权限 | cjk 分销权限 |
| 数据看板 | cjk 统计权限 | — |
| 人员管理（本租户） | ReadAdministrator | Create/UpdateAdministrator + TenantMember |
| 角色管理（本租户） | ReadRole | Create/Update/DeleteRole |
| 租户管理（超管） | ReadChannel | Create/UpdateChannel + 超管专属 |
| 核销（预留） | ReadOrder | 预留 `VerifyOrder` 权限点（本轮只定义不实现） |

### 内置角色模板（seed 时每租户各建一份）

| 角色 | 权限范围 |
|------|----------|
| **租户管理员** | 全部业务权限（商品/订单/库存/配送/支付/自提点/装修/分销/图片库/人员/角色）+ 本租户配置；**不含**超管专属权限 |
| **销售** | 商品（增/改/读，不含删除）、订单（读+发货+售后）、图片库、自提点读、数据看板；**不含**库存、人员/角色、履约配置 |
| **库存** | 商品读、库存读+调整、订单读、库存看板；**不含**商品新增/价格/订单修改/配置 |

**越权防护原则**：
- 内置模板只用业务权限（`Any` 级），超管专属权限（如 CreateAdministrator 全局、UpdateGlobalSettings、DeleteChannel 等 `SuperAdmin` 级）一律不进租户角色。
- 自定义角色创建时，前端只展示「业务权限点」勾选框；超管专属权限不对租户级角色开放。
- 后端 `CjkPermissionsGuard` 校验请求 channel 是否在角色限定范围内 + 权限点是否满足。

---

## 五、后端 API（cjk-plugin 新增 `tenant-admin` 模块）

### 5.1 超管 API（`TenantAdminResolver`，仅超管角色）

| 分组 | Mutation/Query | 说明 |
|------|----------------|------|
| 租户 CRUD | `tenants(options)` 分页+搜索+状态筛选 | 租户列表 |
| | `createTenant(input)` | 创建 Channel + 自动 seed（管理员/角色/履约/分类） |
| | `updateTenant(input)` | 改名称/配置/tenantNo/isOfficial |
| | `setTenantEnabled(id, enabled)` | 开启/关闭租户 |
| | `deleteTenant(id)` | 软删（标记停用，不做物理删除） |
| 管理员授权 | `tenantAdministrators(channelId)` | 某租户的后台人员列表 |
| | `createTenantAdministrator(input)` | 超管为租户建管理员账号+绑定角色 |
| | `updateTenantAdministrator` / `setTenantAdministratorEnabled` / `deleteTenantAdministrator` | 编辑/启停/移除 |
| 角色管理 | `tenantRoles(channelId)` | 某租户的角色列表（含权限） |
| | `createTenantRole(input)` / `updateTenantRole` / `deleteTenantRole` | 角色 CRUD，`permissions: [Permission]` |

### 5.2 租户管理员 API（`TenantMemberResolver`，限定自己 Channel）

| Mutation/Query | 说明 |
|----------------|------|
| `tenantMembers` | 本租户人员列表（只查自己 channelId） |
| `createTenantMember` / `updateTenantMember` / `setTenantMemberEnabled` / `deleteTenantMember` | 本租户人员 CRUD + 启停 + 分配角色 |
| `tenantRoles` | 本租户角色（只读，仅本租户 channel 的角色） |
| `createTenantRole` / `updateTenantRole` / `deleteTenantRole` | 本租户自定义角色（权限点受限：仅业务权限） |

> 内部实现：`TenantMemberService` 封装 Vendure 原生 AdministratorService / RoleService 创建 Administrator + Role（限定 channel），保证与 Vendure 鉴权体系一致。

### 5.3 登录与启停拦截

- **停用租户**：`me` query / 登录后 channel 列表过滤 `enabled=false` 的租户 → 停用租户的后台人员登录后看不到该租户、无法进入。
- **停用人员**：登录校验对应 `TenantMember.enabled=false` → 拒绝登录（admin-api 登录入口自定义 guard）。
- **越权**：租户级角色权限白名单 + `CjkPermissionsGuard`。
- 所有租户/人员/角色变更写审计日志（复用现有审计机制）。

---

## 六、前端（web-admin）

### 6.1 新增页面（按角色显隐）

| 页面 | 角色 | 功能 |
|------|------|------|
| `platform/tenants/index` | 超管 | 租户列表（CRUD + 启停开关 + tenantNo/isOfficial 标记） |
| `platform/tenants/detail` | 超管 | 租户详情：基本信息 + 管理员授权 Tab + 角色 Tab + 人员 Tab |
| `platform/roles/index` | 超管 + 租户管理员 | 角色管理（列表/新建/编辑/权限勾选/删除；租户管理员仅限本租户） |
| `platform/members/index` | 租户管理员 | 本租户人员管理（CRUD + 启停 + 分配角色） |

### 6.2 导航与权限渲染

- Drawer 新增「平台管理」域（归入 D6 数据系统域，T2/T3 档位）：超管可见租户管理/角色管理；租户管理员仅见人员管理/角色管理。
- 菜单与按钮按 §4 权限点显隐。
- 超管判定：登录后从 `me` 返回的权限/角色判断（不再只按 `username==='superadmin'`），存 authStore 供菜单渲染。
- 复用现有视觉规范（`2026-08-23-vshop-tenant-admin-design.md`）。

---

## 七、种子数据（预建 20 个官方自营频道，幂等）

在现有 `DefaultDataService` 基础上扩展 `seedOfficialTenants()`，启动时幂等执行：

1. 创建 20 个 Channel：`code=official-01…official-20`，`tenantNo=1…20`，`isOfficial=true`，`enabled=true`，名称「官方自营01…20」。
2. 每租户 seed 默认管理员 `admin`（统一初始密码，如 `Admin@123456`，绑定「租户管理员」角色）+ 3 个内置角色（租户管理员/销售/库存，限定该 channel）。
3. 每租户 seed 默认履约：从全局方案池「引用到本店」生成门店自提配送方式 + 门店收银支付方式 + 配送/支付档案实例（复用已有全局模板 + 自提点「自由大路店」绑定）。
4. 每租户 seed 默认分类：基础分类结构（「全部商品 / 新品 / 热卖」等预留分类）。
5. 第 21+ 租户不自动 seed，走超管创建流程。

> 密码策略：统一初始密码 + 提示首次登录修改（强制改密可后续追加）。

---

## 八、部署（遵循部署铁律）

- **后端**：本地构建 cjk-plugin（`npm run build`）→ 提交 `lib/` → 服务器 `git pull` + `pm2 restart` → 数据库自动加列（enabled/tenantNo/isOfficial + tenant_member 表）。
- **前端**：web-admin 本地 `npm run build:h5` → 部署 `e.joho.cn/guanli`。
- **验证**：probe-live 探针校准 admin-api schema；浏览器端到端验证超管租户管理、租户管理员人员管理、登录拦截、越权防护。

---

## 九、范围外（本轮不实现）

- marketplace 商品审批上架流（`listedInMarketplace` / `marketplaceStatus` / 审核 UI）—— 仅预留数据字段与权限点，下一轮按 2026-08-16 设计实现。
- marketplace 聚合展示、跨商家购物车、分单结算、`saleSource`、`marketplace_inventory_ledger` 供销存中间表。
- C 端用户（Customer/会员）管理。
- 首次登录强制改密。

---

## 十、风险与对策

| 风险 | 对策 |
|------|------|
| 停用/启停语义影响面 | 停用仅影响后台登录，C 端不受影响；文档明示 |
| 越权（租户角色误配超管权限） | 权限白名单 + 前端不展示超管专属权限 + 后端 guard 双保险 |
| 20 个频道 seed 数据量大/重复 | 幂等 seed（存在即跳过），按 channel code 判重 |
| 原生 Administrator 自定义字段不可用 | 用独立 TenantMember 表承载启停/归属，不改原生实体 |
| 登录拦截改动影响现有登录 | 拦截仅新增停用校验，不影响正常登录路径 |
| 前端菜单权限渲染复杂 | 权限点映射收敛到单一前端工具函数，按 §4 清单渲染 |

---

## 十一、结语

本文固化「前 20 官方自营、21+ 第三方、商品审批、配送/支付按租户后台设置」平台约定，并定义租户/角色/权限体系的完整设计（数据模型、权限点清单、后端 API、鉴权拦截、前端页面、种子数据、部署）。确认后转 writing-plans 生成实施计划。
