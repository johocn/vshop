# 配送/支付「全局模板→copy复用 + 启停 + 自提点范围」设计

- 日期：2026-08-23
- 状态：新设计（待审）
- 关联代码：vendure/packages/cjk-plugin、vshop/web-admin
- **衔接**：本设计建立在已批准的 `2026-08-23-shipping-payment-profile-enhancement-design.md`（档案内按方式配置、`ShippingProfileMethod`/`PaymentProfileMethod`/`isTenantDefault`）之上，是对其的补充与落地扩展，不重复其内容。

## 1. 背景与目标

用户强调一个此前被忽略的**架构语义**：配送方式、支付方式是**租户级配置方案**——租户从**全局方案** copy 复用，而不是各自独立新建。"只有全局方案有这个功能，租户才能 copy 复用，意义不同。"

现状偏差已确认：
- 后端**配送**已有 `ShippingTemplate`（全局模板 isGlobal=true / 租户模板，`createShippingMethodFromTemplate` 生成 Vendure 配送方式并解耦）；**支付没有对应模板实体**。
- **前端配送/支付方式管理页完全未接模板层**，直接展示 Vendure 原生方式，削弱了「全局→copy」语义。
- 配送方式（Vendure 核心 `ShippingMethod`）**无原生 enabled**；支付方式有。
- 配送/支付**档案**无 enabled。
- 自提点类型已有 `store/point/employee`，已有 `city/province/district` 字段。

本设计的目标：
1. 补齐**支付模板层**（PaymentTemplate），对齐配送。
2. 配送/支付方式页做「全局方案池 + copy 到本店」双 Tab。
3. 配送/支付**方式 + 档案**的启停开关与结算过滤。
4. 档案内自提方式自提点范围：**同城全部自提点** vs **指定一个或多个自提点**。
5. 档案内快递等邮寄方式的**配送区域 + 运费公式**独立配置页。

## 2. 关键决策

| 决策点 | 结论 |
|---|---|
| 配送方式启停 | 后端注册 `customFields.customShippingMethodFields` 加 `enabled`（默认 true），前端开关，结算过滤 |
| 支付方式启停 | 复用 Vendure 原生 `PaymentMethod.enabled`，统一走 PaymentTemplate 层 |
| 支付模板 | **新增 `PaymentTemplate` 实体**，镜像 `ShippingTemplate` |
| 模板copy语义 | 前端双 Tab「本店方式 / 全局方案池」，「复制到本店」＝ 租户从池 copy 生成自有方式实例并解耦 |
| 档案启停 | `ShippingProfile`/`PaymentProfile` 各加 `enabled`（默认 true）独立开关，变体绑定档案停用→回退租户默认档案 |
| 自提点范围 | 挂在 `ShippingProfileMethod.options`：`{ rangeMode: 'all' \| 'selected', pickupLocationIds }` |
| 同城定义 | 按 `city` 聚合：默认同城全部自主点= enabled + type=point + 同 city |
| 类型绑定 | 严格：pickup→point、store→store、employee→employee，指定点只能在对应类型内选；同城全部仅 pickup(point) 生效 |
| 快递配置 | 档案内邮寄方式独立页：配送区域 + 运费公式，写回原生方法 calculator |

## 3. 概念模型

```
全局方案池(超管) ──copy──► 租户方法实例（解耦，不再新建，从池复用）
  ├─ ShippingTemplate ──createShippingMethodFromTemplate──► ShippingMethod(租户)
  └─ PaymentTemplate(新增) ──► PaymentMethod(租户)

租户方法实例：enabled 启停（独立开关）
租户档案(ShippingProfile/PaymentProfile)：enabled 启停 + 档案内逐方式配置

档案内自提方式的点范围（ShippingProfileMethod.options）：
  rangeMode=all     → C端 动态按 同city+enabled+type=point 实时聚合
  rangeMode=selected → 取 options.pickupLocationIds（限定对应类型内）
```

## 4. 数据模型改动（增量）

### 4.1 新增 `PaymentTemplate`（镜像 ShippingTemplate）
```ts
entity PaymentTemplate implements ChannelAware, HasCustomFields {
  id, name, code, description,
  enabled: boolean        // 模板是否可用（可被 copy）
  isGlobal: boolean       // true=超管全局池；false=租户自建模板
  ownerChannelId: ID|null
  channels: Channel[]     // ManyToMany
  // 支付能力配置（checker/calculator 结构待定，沿用配送模板风格）
}
```
- `createPaymentMethodFromTemplate(ctx, templateId, name?, code?)` → 生成 Vendure PaymentMethod 绑定当前 channel。

### 4.2 `ShippingMethod` 注册 customField `enabled`
- cjk-plugin `plugin.ts` 追加 `config.customFields.ShippingMethod`（或等价）`[{ name:'enabled', type:'boolean', defaultValue:true }]`。
- 结算过滤：`shipping-calculator.ts` 的 eligible 列表 `.filter(m => m.customFields?.enabled !== false)`。

### 4.3 档案实体 `enabled`
- `ShippingProfile`/`PaymentProfile` 各加 `enabled: boolean`（默认 true），Admin schema 的 [Create/Update]Input 补 `enabled`，resolver/service 透传。
- 变体绑定回退：archive 中绑定的档案若 `enabled=false` → 视为未绑定，走租户默认档案回退链。

### 4.4 `ShippingProfileMethod.options` 扩展（自提点范围）
```json
{ "rangeMode": "all" | "selected", "pickupLocationIds": ["..."] }
```
- `mode=pickup`：默认 `rangeMode='all'`；可切 `'selected'` 手动勾选（限 point）。
- `mode=store` / `mode=employee`：仅 `selected`，限对应 store/employee 类型。

### 4.5 自提点的「全局 / 租户」两级（利用既有机制，非新建）
后端 `PickupLocation` **已具备**全局/租户区分，本期在前端补露出，不重复建表：
- **全局自提点**：`isPublic=true`、`ownerChannelId=null`（超管维护，所有租户可见可选用）
- **租户级自提点**：`isPublic=false`、`ownerChannelId=ctx.channelId`（租户自建，仅本租户可见）
- 可见查询规则（findAll/findByType/findByIds 已实现）：`(isPublic = true OR ownerChannelId = ctx.channelId)` **AND** `channels` 关联到当前租户
- 已有能力：`promoteToPublic`（租户点提升为全局点）、`assignToChannel`/`removeFromChannel`（把点分配/移出到某租户）
- **权限常量（新增）**：`PickupLocationPermissions.SetGlobalPickupLocation`，仅超管角色持有；`promoteToPublic` 与 create 时 `isPublic=true` 均受此权限保护，无权限租户强制租户级
- **创建归属（新增）**：超管创建自提点时可指定 `isPublic`（全局可用 / 租户级）；租户创建固定 `isPublic=false`
- **copy 复用**：租户从全局池把某点 `assignToChannel` 到自己租户 → 该点进入本店可用池；全局点进入租户后仍是同一实例（不复制副本）
- 自提方式范围的可选集 = **本店可见自提点**（全局池点 + 租户自建点，均须 channels 已关联），且按严格类型过滤

## 5. 前端改动

### 5.1 配送方式页（双 Tab）
- Tab1「本店配送方式」：当前 channel 的 ShippingMethod 列表，带 `enabled` 开关、编辑、删除、copy标记（来源模板）。
- Tab2「全局方案池」：isGlobal=true 模板列表，每项「复制到本店」→ `createShippingMethodFromTemplate`。
- 新增「新建模板」入口（超管维护全局模板）。

### 5.2 支付方式页（双 Tab，对称）
- 本店支付方式列表带 `enabled` 开关、编辑、删除（patch 原生 updatePaymentMethod）。
- 全局方案池展示 PaymentTemplate 模板 + 「复制到本店」。

### 5.3 档案页
- 配送/支付档案卡片加 `enabled` 开关（独立）。
- 档案内方法条目：pickup 方式 → 自提点范围控件（同城全部 / 指定n个）；store/employee 方式 → 指定自提点（限类型）。
- 配送档案内邮寄方式（快递/顺丰）→「配置区域与运费」入口，跳独立页。

### 5.4 快递运费/区域配置页
- 配送区域：全国 / 指定省市区。
- 运费公式：复用 tiered-weight 计算器参数（首重/续重/包邮门槛/偏远附加/体积重/保价/封顶）在线编辑。
- 保存写回该 ShippingMethod 的 calculator.args；checker 区域匹配写回。

### 5.5 自提点页（全局/租户两级展示）—— 最终版（已与用户确认）

**目的（本模块要解决的核心问题）：**
- 自提点分两级归属：**全局点**（`isPublic=true`，超管维护，所有租户可选用）与**租户点**（`isPublic=false`，归属某租户，仅该租户用）。
- 让"公共点 / 我的点"分开展示，一眼分清归属，避免每租户重复录入菜鸟驿站类公共点，也避免租户误用他人私有点。
- 提供两个转换操作：租户自建点→设为全局（分享）；全局点→复制到本店（选用）。对齐运动/支付「全局方案→租户复用」语义。

**复制 = 引用共享（非克隆）：**
- 「复制到本店」`assignToChannel` 只是把全局点**关联**到当前租户渠道，**不生成副本**。
- 全局点实例唯一、超管编辑后所有引用它的租户同步生效。与配送方式/支付方式「copy 独立实例」语义**不同**，自提点是实体共享。

**权限模型：**
- 新增自定义权限常量 `PickupLocationPermissions.SetGlobalPickupLocation`，分配给 Vendure 默认超管角色 `superadmin`。
- 「设为全局」/ 全局点编辑 / 创建时指定全局归属 → 均**仅超管**可操作。
- 无该权限的租户运营：看不到「设为全局」开关；创建自提点强制租户级；对全局点**只读**。

**租户使用规则（选 A，无启停）：**
- 租户对复制进本店的全局点**不能编辑、不能停用、只读**。
- 租户不想要某全局点 → 不复制该点；若已复制则不作处理，靠配送方式自提点范围 `rangeMode=selected` 圈选排除（不圈即默认不用），**不通过停用实现**。

**严格类型隔离（方式↔点类型互相绑定）：**
- 门店自提方式（mode=store）→ 可选点范围**仅 store 类型**
- 纯自提点方式（mode=pickup）→ 仅 point 类型
- 职工单位自提方式（mode=employee）→ 仅 employee 类型
- 范围控件的可选集合于此类型隔离，互不混入。

**页面结构（双 Tab）：**
- Tab1「本店自提点」：本店可用点（全局已分配 + 本店自建），带 编辑/启停/删除；`isPublic=true` 的全局点仅超管可编辑，租户只读；本店自建点提供「**设为全局**」（仅超管可见）。
- Tab2「全局自提点池」：`isPublic=true` 点列表，带「**复制到本店**」`assignToChannel`；已分配的显示「已复制」；仅超管可新建/编辑全局点（创建时可指定"全局可用 / 租户级"归属）。
- 自提方式范围控件（档案内）的可选集来自「本店自提点」且按类型隔离。

## 6. 生效范围

- 后端 vendure/packages/cjk-plugin：新增 payment-template.entity/service/resolver；ShippingMethod customFields；shipping-template.admin.resolver（如需补 create 权限/模板管理查删）；档案 entity/schema/resolver/service；shipping-calculator 过滤；收藏 @Column({default:true})。
- 前端 vshop/web-admin：delivery/payment 方式页双 Tab + copy + 启停；档案页 enabled + 自提点范围；快递运费/区域配置页。

## 7. 卡点与遗漏检查（已逐一确认）

实施前已对后端现状做精确核查，以下是**必须在本计划中处理，否则会失败的卡点/遗漏**：

| # | 卡点 | 现状核实 | 对策 |
|---|---|---|---|
| C1 | PaymentTemplate 完全不存在 | 后端无 payment-template.*、无 createPaymentMethodFromTemplate | 全套新建：entity/service/resolver/schema/权限，支付方式 copy 能力来自此 |
| C2 | ShippingMethod 无 enabled | `customFields.ShippingMethod` **未注册**（确认无重复风险，可安全新增） | 在 plugin.ts customFields 区注册 `{name:'enabled',type:'boolean',defaultValue:true}`，并加"已存在字段名去重"判断（仿 ProductVariant 已注册区 807-822） |
| C3 | ShippingMethod 启停未接入结算过滤 | `shipping-calculator.ts:31` `getEligibleShippingMethods` 只按 skipIds 过滤，无 enabled | add `.filter(m => m.customFields?.enabled !== false)` |
| C4 | shop 端方法列表无 enabled 过滤 | `shipping-profile-shop.resolver.ts` `resolveShippingMethodsForChannel`/`eligibleShippingMethodsWithConfig` 已返回 pickupLocationIds 但不过滤 enabled | shop 端在打包返回时过滤 `method.customFields.enabled === false` 的方法 |
| C5 | rangeMode 未实现同城聚合 | shop resolver 仅透传 `options.pickupLocationIds`，无 `rangeMode=all` 时按 city 实时聚合 point 的逻辑 | 后端在返回 pickup 方式时：rangeMode=all → 用 findByType(point)+city 匹配+enabled 动态聚合；selected → 取 pickupLocationIds |
| C6 | 档案 enabled 不参与回退 | `getTenantDefault` 不判断 enabled | 变体绑定判断与默认档案回退时排除 enabled=false 档案 |
| C7 | ShippingTemplate 前端无 UI、未全面接入 | 模板层仅后端存在，前端配送方式页直接用原生 shippingMethods | 前端配送/支付方式页做「本店/全局方案池」双 Tab + 复制 |
| C8 | 自提点全局/租户前端未区分 | 前端单列表，无 promote/copy UI（后端 promoteToPublic/assignToChannel 已具备），前端也无法读 isPublic/超管权限 | 前端自提点页双 Tab + 设为全局(仅超管) + 复制到本店；按 SetGlobalPickupLocation 权限决定是否显示超管操作 |
| C9 | 支付方式页/档案现状未核 | 本次以配送侧已核实现为参照，支付档案/方式页需在计划中按同一结构核对（setPaymentEnabled 已存在） | 计划中先核对 payment.ts / payment-profile.ts 现状再改 |
| C10 | 支付方式 copy 后结算过滤仍是原生 enabled | PaymentMethod 原生 enabled | 沿用；本店支付方式启停走 updatePaymentMethod({enabled}) |
| C11 | 超管/租户权限区分待新增 | 尚无 `PickupLocationPermissions.SetGlobalPickupLocation` 权限常量；create 无 isPublic 归属参数 | 新增权限常量并分配给 superadmin；create 输入补 `isPublic`（仅持权限者可设 true，否则强制 false）；resolver 按权限判定 promote/编辑归属 |
| C12 | 自提方式可选范围未按类型隔离 | shop/档案读取 pickupLocationIds 未校验点类型 | 范围查询与前端可选集均按 mode 对应类型过滤（store/point/employee 互不混入） |

**关键依赖顺序**：先 C2(C3) 配送启停 → 再 C5 自提点范围 → 再 C1/C9 支付模板与档案 → 最后 C7/C8 前端。前端强依赖后端 schema 就绪。

## 8. 不实现（YAGNI）

- 不做支付方式的复杂费率引擎（沿用 checker/calculator 结构）。
- 不引入独立的「同城范围表」（用 rangeMode + 实城聚合）。
- 不做模板的多级继承（仅全局池→租户单层 copy）。
- 不动 Vendure 核心实体源码（配送方式启停全部走 customFields）。

## 9. 风险与注意事项（沿用铁律）

- cjk-plugin 改动后必须本地 `pnpm run build` 且产物在 **`lib/`**（非 dist/），用 `Select-String packages/cjk-plugin/lib/... -Pattern "关键词"` 验证后 commit，服务器 git pull + pm2 restart；**绝不在服务器构建**。
- adminSchema 新增类型/字段需同步补齐，否则启动即报 Unknown type；改插件后重启 dev server 才能暴露 schema 错误。
- 生产 Postgres 建表/加列由 TypeORM schema sync 自动完成；验证用 `docker exec ... psql -U youshaop ...`（非 postgres 角色）。
- 前端 web-admin 是 H5 静态站（非 git 部署 web-admin 走 dist 构建 + e.joho.cn/guanli）；部署沿用本地 build:h5 → tar → scp → 备份 + rm -rf assets + tar -xf。