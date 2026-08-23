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

## 6. 生效范围

- 后端 vendure/packages/cjk-plugin：新增 payment-template.entity/service/resolver；ShippingMethod customFields；shipping-template.admin.resolver（如需补 create 权限/模板管理查删）；档案 entity/schema/resolver/service；shipping-calculator 过滤；收藏 @Column({default:true})。
- 前端 vshop/web-admin：delivery/payment 方式页双 Tab + copy + 启停；档案页 enabled + 自提点范围；快递运费/区域配置页。

## 7. 不实现（YAGNI）

- 不做支付方式的复杂费率引擎（沿用 checker/calculator 结构）。
- 不引入独立的「同城范围表」（用 rangeMode + 实城聚合）。
- 不做模板的多级继承（仅全局池→租户单层 copy）。
- 不动 Vendure 核心实体源码（配送方式启停全部走 customFields）。

## 8. 风险与注意事项（沿用铁律）

- cjk-plugin 改动后必须本地 `pnpm run build` 且产物在 **`lib/`**（非 dist/），用 `Select-String packages/cjk-plugin/lib/... -Pattern "关键词"` 验证后 commit，服务器 git pull + pm2 restart；**绝不在服务器构建**。
- adminSchema 新增类型/字段需同步补齐，否则启动即报 Unknown type；改插件后重启 dev server 才能暴露 schema 错误。
- 生产 Postgres 建表/加列由 TypeORM schema sync 自动完成；验证用 `docker exec ... psql -U youshaop ...`（非 postgres 角色）。
- 前端 web-admin 是 H5 静态站（非 git 部署 web-admin 走 dist 构建 + e.joho.cn/guanli）；部署沿用本地 build:h5 → tar → scp → 备份 + rm -rf assets + tar -xf。