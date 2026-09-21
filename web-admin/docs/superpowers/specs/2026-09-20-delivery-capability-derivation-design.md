# 配送能力派生与筛选收口（G9）设计 · 2026-09-20

> 来源：2026-09-20 用户反馈「首页商品的邮寄/自提筛选做得不好」，要求**按配送档案自动推导**商品是否支持邮寄/自提，并在店铺只有单一能力时**不显示配送方式选择框**。
> 本项与「主题风格体系联通（G1+G2）」分属两个批次，互不依赖。
> 用户已拍板（2026-09-20）：**双能力以配送档案自动推导为准** · **筛选改服务端执行**。

---

## 1. 现状证据

| # | 事实 | 证据 |
|---|---|---|
| 1 | 首页筛选是**客户端本地过滤**已加载列表（不是服务端查询） | [GoodsSingleList.vue L26-L32](file:///d:/zhao/nshop/layers/base/app/components/home/blocks/GoodsSingleList.vue#L26-L32) |
| 2 | 筛选条**无条件显示**，只受五级配置 `home.filter` 的开关控制，不看店铺真实能力 | [GoodsSingleList.vue L63-L68](file:///d:/zhao/nshop/layers/base/app/components/home/blocks/GoodsSingleList.vue#L63-L68) |
| 3 | 判定依据是**商品手工字段**，且「空值 = 两者都支持」 | [productVisibility.ts L23](file:///d:/zhao/nshop/layers/base/app/utils/productVisibility.ts#L23) |
| 4 | 自提判定绑死 `belongCity === 当前城市`，与自提点/档案无关 | [productVisibility.ts L30](file:///d:/zhao/nshop/layers/base/app/utils/productVisibility.ts#L30) |
| 5 | 手工字段有两份副本：商品、仓库/门店 | [catalog-custom-fields.ts L27-L41](file:///d:/zhao/vendure/packages/logistics-plugin/src/catalog-custom-fields.ts#L27-L41)、[stock-location-custom-fields.ts L32-L45](file:///d:/zhao/vendure/packages/cjk-plugin/src/inventory/stock-location-custom-fields.ts#L32-L45) |
| 6 | **真正的履约真源是配送档案**：`shipping_profile_method.mode` 区分邮寄/自提 | [shipping-profile.entity.ts L23-L80](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.entity.ts#L23-L80) |
| 7 | 变体通过 `assignToVariants` 绑档案；未绑则回退租户默认档案 | [shipping-profile.service.ts L170-L183](file:///d:/zhao/vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts#L170-L183)、[order-box.service.ts L271-L289](file:///d:/zhao/vendure/packages/cjk-plugin/src/order/order-box.service.ts#L271-L289) |
| 8 | 结算阶段已有箱级能力（`type` / `pickupLocations` / `availableShippingMethods`），商品发现阶段却没用上 | [useOrderStore.ts L364-L370](file:///d:/zhao/nshop/layers/base/stores/useOrderStore.ts#L364-L370) |

成因归纳：**同一件事三套来源**（商品手工字段、仓库手工字段、配送档案），C 端筛选读的是手工字段且做了「空 = 都支持」的兜底，再叠加客户端本地过滤 —— 于是改档案不影响筛选、未维护商品两边都出现、单能力店铺也摆两个 tab。

---

## 2. 目标与非目标

**目标**

1. 商品「是否支持邮寄 / 自提」改为**由配送档案派生**，后台不再手工勾选。
2. 店铺只有单一能力时，C 端**不渲染配送方式选择框**（首页筛选条、结算页配送方式块），并锁定该方式。
3. 配送方式筛选改为**服务端执行**，分页与总数正确。

**非目标**

- 不改分箱规则（仍按租户 → 按配送档案分箱）与结算链路既有语义。
- 不改城市过滤语义：`belongCity` 仍作为自提的城市维度条件（见 §6.3）。
- 不改仓库侧 `StockLocation.customFields.deliveryMethods` 的消费（[physical-aware-stock-location-strategy.ts L85](file:///d:/zhao/vendure/packages/cjk-plugin/src/inventory/physical-aware-stock-location-strategy.ts#L85) 继续沿用），列为后续项。
- 不改五级风格体系层级；仅把「店铺双能力」作为筛选条渲染的**数据前置条件**（见 §6.1）。

---

## 3. 派生层（唯一真源）

新增 `vendure/packages/cjk-plugin/src/shipping/delivery-capability.ts`：

```ts
type DeliveryMode = 'MAIL' | 'SELF_PICKUP';

interface DeliveryCapability {
  modes: DeliveryMode[];      // 去重后的能力集合
  bothSupported: boolean;     // modes.length === 2
  source: 'profile' | 'fallback';
}
```

解析顺序（纯函数，便于单测）：

1. 取 `variant.customFields.shippingProfileId`；为空则回退该渠道的租户默认档案（`isTenantDefault = true`），与 [order-box.service.ts L271-L289](file:///d:/zhao/vendure/packages/cjk-plugin/src/order/order-box.service.ts#L271-L289) 的回退保持一致。
2. 读该档案的 `shipping_profile_method` 行，取 `mode` 并集：`delivery` → `MAIL`，`pickup` → `SELF_PICKUP`。
3. 档案不存在或未配置任何配送方式 → 返回 `{ modes: ['MAIL','SELF_PICKUP'], bothSupported: true, source: 'fallback' }`，即**保持旧行为不误伤**，同时在后台给出「未配置配送档案」告警（见 §7.2）。

渠道级能力：`resolveChannelDeliveryCapability(channelId)` 返回该渠道的能力并集，实现上**以档案为索引**（渠道内档案集合 → modes 并集），不遍历全部变体；若渠道内存在未绑档案的变体，则并入默认档案的 modes。

---

## 4. 暴露层（shop-api）

1. `Product` 与 `ProductVariant` 上新增字段 `deliveryModes: [String!]!`（走 schema 扩展 + resolver 字段解析，**不新增自定义字段**）。
2. `SearchResult` 条目带出 `deliveryModes`，供列表直接消费。
3. 新增渠道级查询 `channelDeliveryCapability { modes, bothSupported, source }`，供模板决定是否渲染选择框。
4. `Product.customFields.deliveryMethods` 保留但标记废弃（deprecated），C 端改读 `deliveryModes`。

> 待核验项（实现前确认）：`SearchResult` 是否可在不改动搜索核心的前提下透出附加字段（优先用已有的 `customFields` 通道或 `productVariant` 反查，避免重写搜索管线）。

---

## 5. 筛选（服务端）

- 搜索入参新增 `deliveryMode: MAIL | SELF_PICKUP`（可空；空 = 不过滤）。
- **实现优先级**：优先把「配送方式」做成 Vendure 系统 facet（一个 facet、两个 facet value），由插件在档案/绑定变更时同步维护，从而直接复用原生 `facetValueIds` 过滤与分页计数；仅当该路径核验不可行时，才退回「自定义 input 字段 + 后置过滤」，并明确接受其计数不准确的问题（届时在界面隐藏总数）。
- 前端 `GoodsSingleList` / `GoodsMasonryGrid`：删除 `visibleItems` 本地过滤，改为筛选值变更时携带 `deliveryMode` 重新查询；`useModuleDelivery` 状态保留「当前选中方式」语义，仅扩为「含城市维度」的查询参数。
- `isProductVisible` 降级为**纯展示用**（城市超区提示），不再承担筛选职责；其 `deliveryMethods` 判定改读 `deliveryModes`。

---

## 6. C 端渲染条件

### 6.1 首页筛选条

渲染条件 = **五级配置开关 AND 数据推导的双能力**：

- 五级配置：`home.filter` 节点（`enabled` / `modules.goods.enabled` / `bar.visible`），语义与层级不变 —— 本批**不新增层级**，五级体系不受影响。
- 数据条件：`channelDeliveryCapability.bothSupported === true`。
- 单能力时：不渲染筛选条，列表按该唯一方式查询，无需用户选择。

### 6.2 结算页配送方式块

- 依据 `orderBoxes` 的箱级 `type` 与 `availableShippingMethods`（[BoxDeliveryBlock.vue](file:///d:/zhao/nshop/layers/base/app/components/checkout/BoxDeliveryBlock.vue)）：
  - 箱内可用方式仅一种 → **隐藏配送方式选择**，直接锁定该方式；自提箱仍需选自提点/收货人。
  - 两种可用 → 维持现有选择交互。
- 该行为与既有「结算页模块归属规则」一致：物流箱走配送方式 + 地址块，自提箱走自提点 + 收货人块。

### 6.3 城市维度

- 自提的城市条件**保留** `belongCity === 当前城市`（与自提点所在城市一致），但「是否支持自提」的开关来源由手工字段换成派生 `modes`。
- 邮寄的城市条件保留既有 `serviceCities` 语义（空 = 全城可寄）。

---

## 7. 后台改造（web-admin）

### 7.1 商品表单

- [ProductForm.vue L67-L70](file:///d:/zhao/vshop/web-admin/src/components/ProductForm.vue#L67-L70) 的配送档案选择器保留（这是能力的**输入端**）。
- `deliveryMethods` 手工勾选改为**只读展示**：显示「由配送档案推导：仅邮寄 / 仅自提 / 邮寄+自提」，并给出「去配送档案修改」跳转。
- GraphQL 字段与数据库列**保留**（兼容历史数据与旧客户端写入），但 web-admin **不再提供编辑控件**，新数据一律由档案派生。

### 7.2 配送档案页

- [pages/shipping/profile](file:///d:/zhao/vshop/web-admin/src/pages/shipping/profile/index.vue) 顶部显示本店能力摘要：`同时支持邮寄与自提` / `仅邮寄` / `仅自提`（取渠道级并集）。
- 未绑定任何档案的租户，在商品列表页与配送档案页显示「配送档案未配置，商品配送能力暂按两者都支持处理」的告警。

---

## 8. 存量数据与兼容

- `Product.customFields.deliveryMethods` / `StockLocation.customFields.deliveryMethods` **不删除**（前者降级为废弃只读，后者继续被就近算法消费）。
- 已有档案配置无需迁移即可生效（派生读的就是现有档案）。
- 存量手工字段与新派生结果不一致时，**以派生为准**，并在商品表单处提示差异（不做自动写回，避免覆盖人工判断）。
- 派生结果做请求级缓存（按渠道 + 档案集合），避免列表页逐条查档案。

---

## 9. 验收标准

1. 在配送档案里移除自提方式 → 首页筛选条消失、列表按邮寄查询；结算页不显示配送方式选择框且锁定邮寄。
2. 档案同时含邮寄与自提 → 首页筛选条出现；选「自提」后结果数与分页在服务端一致（翻页无重复、无丢失）。
3. 未维护手工字段的商品，不再在两种方式下都出现（以档案为准）。
4. 商品表单中配送方式为只读，显示结果与档案一致。
5. 未配置档案的渠道：能力回退为「两者都支持」，C 端行为与现状一致，后台出现告警。
6. 全部以**手机视口 390×844、dpr=2 截图**为准，并补入操作手册。

---

## 10. 风险与边界

| 风险 | 处理 |
|---|---|
| facet 方案若不可行，后置过滤会破坏总数与分页 | 实现前先核验；不可行时隐藏总数并明确标注为已知限制，不伪造计数 |
| 派生判定改变了既有可见性结果（原「空 = 都支持」的商品可能变少） | 这是本项要修的正确性问题；先在前述「未配置档案 → 两者都支持」兜底，再逐端截图比对 |
| 逐条派生导致列表性能下降 | 档案集合按渠道预取 + 请求级缓存 |
| 仓库侧手工字段未收敛，两套语义并存 | 明确列为本批非目标，文档标注后续项 |

**非目标**：不改分箱与结算既有规则；不做商品列表的「配送能力」列与筛选（用户未要求）；不动仓库侧手工字段消费链路；不新增风格体系层级。

---

## 11. 交付与部署

- 后端（vendure + cjk-plugin）：git push + 服务器 pull + `pm2 restart`，**禁止服务器构建**。
- C 端（nshop / vshop）：本地构建后上传静态产物。
- 每项功能 = 实现 + API/e2e 回归 + 390×844 dpr=2 手机截图（`web-admin/src/static/manual/shots/`）+ 手册章节补充。
- 多语言：新增文案同时补 `zh-Hans.json` / `en.json`。