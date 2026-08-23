# 配送/支付档案「档案内按方式配置」增强设计

- 日期：2026-08-23
- 状态：已批准（用户确认）
- 关联代码：vendure/packages/cjk-plugin、vshop/web-admin

## 1. 背景与目标

现有配送档案（ShippingProfile）与支付档案（PaymentProfile）支持「全局 / 租户 / 档案」三级作用域，档案内可挂多种配送/支付方式（M2M）。但自提点（pickupLocations）当前**挂在档案级**，无法表达「档案内某一种自提方式允许哪些自提点」这一细粒度需求。

用户目标是：

- 特定商品档案自提，一类档案自提方式关联 1 个自提点、另一类档案自提方式关联 2 个（乃至多个）自提点；
- 同一自提**方式**可被不同档案复用，但各档案对其允许的自提点集合可以不同；
- 档案可同时支持多种配送方式 + 多种支付方式，每种方式在该档案下有独特工作模式（自提→点集合/位置；邮寄→范围/运费公式；支付→分期等）；
- 支付方式同理对称。

## 2. 关键决策

| 决策点 | 结论 |
|---|---|
| 自提点绑定粒度 | **挂档案内某一种自提方式**（档案 × 方式 join 带载荷），而非整个档案 |
| 档案与全局/租户方式关联 | **显式挑选子集**（不以继承自动全含） |
| 无档案回退 | 变体未绑档案 → 回退「租户默认档案」的方式；无默认档案 → 回退 全局∪租户全部 |
| 租户默认方案落点 | 用「默认档案」标记（`isTenantDefault`），每租户每类至多一个默认档案 |

## 3. 概念模型（三级作用域 + 回退链）

```
全局方式(L0，超管维护) ──┐
                        ├──► 租户可见池 = 全局 ∪ 租户自建
租户方式(L1，租户维护) ──┘
                        │
商品结算选配送/支付方式：
  ① 变体已绑档案(L2)  → 档案内「显式挑选的方式子集」，每种方式按【档案×方式】工作模式生效
  ② 变体未绑档案      → 回退「租户默认档案」内的方式
                        └ 无默认档案 → 再回退 全局∪租户全部
```

核心原则：**方式实例本身（范围/运费公式/支付能力）是共享的、全局唯一的；档案只决定「这个商品允许用哪几种方式 + 每种方式在这类商品上允许哪些自提点/分期」**。

## 4. 数据模型改动

### 4.1 新增 `ShippingProfileMethod`（档案 × 配送方式 join 表，带工作模式载荷）

```ts
entity ShippingProfileMethod {
  id: ID
  profileId:     ID        // 档案
  shippingMethodId: ID     // 档案内的某一种配送方式（可被多档案复用）
  mode: string            // 'pickup' | 'mail' | ...（该方式的模式）
  options: simple-json    // 该方式在该档案下的工作模式
                          // pickup → { pickupLocationIds: [...] }
                          // mail   → 范围/公式留原方法实例，options 可选
}
```

- 自提点集合从 `ShippingProfile.pickupLocations`（档案级）**下沉**到此表的 `options.pickupLocationIds`。
- 可表达：档案A 的自提方式允许点{甲,乙}，档案B 复用同一自提方式但仅允许点{丙}。

### 4.2 对称新增 `PaymentProfileMethod`（档案 × 支付方式 join 表）

```ts
entity PaymentProfileMethod {
  id: ID
  profileId:     ID
  paymentMethodId: ID
  mode: string            // 'installment' | 'cod' | ...
  options: simple-json    // e.g. { alipay: { huabei: { periods: [...] } } }
}
```

- 现有 `PaymentProfile.installmentOptions`（档案级 JSON）**下沉**到此表的 `options`。

### 4.3 均为档案加默认标记

- `ShippingProfile.isTenantDefault: boolean`（默认 false）
- `PaymentProfile.isTenantDefault: boolean`（默认 false）
- 约束：每租户每类 **至多 1 个**默认档案（在 service 层校验，设置时清掉同租户其余同类的默认标记）。

### 4.4 Shop API 查询分支

- `eligibleShippingMethodsByProfile` 返回每个方式的 `mode` + `pickupLocationIds`（改读 join 表而非档案级 pickupLocations）。
- `eligiblePickupLocationsByProfile` 改读「该方式在该档案下的 options.pickupLocationIds」，不再读档案级字段。
- 新增「变体未绑档案 → 返回租户默认档案的方式 + 其自提点」解析分支。

### 4.5 迁移

- 现有已建档案的 `pickupLocations` 迁入对应自提方式的 `options.pickupLocationIds`（若档案含自提方式）。
- 现有档案的 `installmentOptions` 迁入对应支付方式的 `options`。

## 5. 生效范围与边界

### 后端（vendure/packages/cjk-plugin）
- shipping：`shipping-profile.entity.ts`（加 `isTenantDefault`、调整 pickupLocations 关联级别）、新增 `shipping-profile-method.entity.ts`、调整 `shipping-profile.service.ts`（create/update/默认唯一性校验、join 读写）、`shipping-profile-admin.resolver.ts`（逐方式编辑输入）、`shipping-profile-shop.resolver.ts`（按档案×方式返回 + 默认回退分支）。
- payment：对称改动 `payment-profile.*`，新增 `payment-profile-method.entity.ts`。
- schema（plugin.ts 的 gql 模板 + adminSchema 自定义类型需同步补齐，避免启动即报 Unknown type）。

### 前端（vshop/web-admin）
- 档案编辑页从「选方式 + 整档案配自提点」改为「档案内逐方式条目编辑」：
  - 自提方式 → 挂自提点多选
  - 邮寄方式 → 指向原实例的范围/运费公式
  - 支付方式 → 可配分期
- 新增「设为租户默认」开关。

### e2e / 测试
- 新增用例：
  1. 默认档案回退（无档案商品用默认档案的方式）
  2. 同一自提方式在不同档案允许不同自提点
  3. 每租户每类仅一个默认档案的唯一性

## 6. 不实现（YAGNI）

- 不新增多 SKU/规格维度、不改动 Vendure 原生方式实例的运行时逻辑。
- 不引入独立的「租户默认配置」第二套数据结构（用默认档案标记替代）。
- 不做全局默认档案（全局档案是否可被标默认为后续可选，本期维持「租户级默认」）。

## 7. 风险与注意事项（沿用既有铁律）

- 改动 cjk-plugin 后**必须本地 `pnpm run build` 且产物为 `lib/`**（非 dist/），用 `Select-String packages/cjk-plugin/lib/... -Pattern "关键词"` 验证后 commit，服务器 git pull + pm2 restart 生效；**绝不在服务器构建**。
- adminSchema 自定义类型改动后必须重启 dev server 暴露 schema 错误（编译期发现不了）。
- e2e 依赖 `__data__` 缓存，改实体后需删除缓存；跨库（sqljs/SQLite vs PostgreSQL）文件时 Date 列遵循「可选 Date，勿 `Date | null`」约定。