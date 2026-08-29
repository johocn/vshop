# 商品管理增强设计（品牌 · 营销 · 规格变体）

- 规格：e.joho.cn/guanli（web-admin）添加/修改商品功能增强
- 日期：2026-08-29
- 状态：已获用户批准（方案 A + 分页签 + 中国本地化促销能力）

## 背景与目标

web-admin 现有 `ProductForm.vue` 为**单变体**商品表单（字段：名称/副标题/描述/价格/库存/图片/配送/支付/分类/上架），经 `apis/product.ts` 对接 Vendure admin-api（e.joho.cn/admin-api）。当前缺少品牌、营销、多规格变体能力。

本期目标（只考虑中文商品，其他语言预留接口）：

1. **品牌**：商品关联品牌，前台可按品牌筛选/展示。
2. **营销**：承载中国本地化常用促销玩法。
3. **规格变体**：以「规格组→SKU 矩阵」方式添加多规格商品。
4. 只维护 `zh_Hans` 中文，其余语言通过 Vendure `translations` / `LocalizedText` 结构预留接口。

已确认决策：交互取向 =「先选规格、一键生成矩阵」；规格维度上限 = 最多 3 组；表单 = 分页签；实现方案 = A（现有 ProductForm 拆 tab + 后端 `cjk-plugin` 扩展）。

## 第 1 节 · 后端数据模型（Vendure 扩展）

字段落点沿用现有分区：**Variant 级**字段加入 `cjk-plugin/src/shipping/product-variant-custom-fields.ts`（与 shippingProfileId/paymentProfileId 并列）；**Product 级**字段加入 `marketplace-plugin/src/custom-fields.ts`（与 barcode/internalCode 并列）。不新建重复字段。

| 载体 | 新增结构 | 说明 |
|------|----------|------|
| Facet `code=brand` | 品牌库 | 每个品牌一个 FacetValue，名称走 `translations`（多语言预留），商品以 `updateProduct(..., facets:[brandId?])` 单选关联；Vendure 原生 Facet 即供前台按品牌筛选 |
| ProductVariant customField | `listPrice: Decimal`（可空） | 划线价/原价，为 null 不显示划线 |
| ProductVariant customField | `saleStart?: Date`（可空） | 限时促销开始时间 |
| ProductVariant customField | `saleEnd?: Date`（可空） | 限时促销结束时间，过期自动回落 |
| Product customField | `marketingTags: JSON/string[]` | 营销标签（产品级，多 SKU 共享） |
| Product customField | `sellingPoint: string`（预留 LocalizedText） | 卖点/促销语，仅维护 zh_Hans |
| 关联活动 | 复用既有 flash-sale / coupon 插件 | 商品表单仅选择该 SPU 已参与的营销活动，不新增数据表 |

**中国本地化营销预置标签**（多选，可后台维护集合）：`新品 / 热卖 / 特价 / 限时折扣 / 包邮 / 满减 / 清仓 / 有货`。

**红线价与实售价关系**：`listPrice` ≥ 实际销价 `price`；前台价格区展示划线价 + 现价及折扣。促销期内现价取 `listPrice` 折扣展示，**实付仍以 `Variant.price` 为准**（不新增促销计价逻辑，不打乱 Vendure 价格体系）。

## 第 2 节 · 前端表单结构（web-admin 分页签）

把 `ProductForm.vue` 重构为三个 tab，各拆独立子组件：

- **Tab1 基本信息**：现有字段（名称/副标题 slug/描述/图片/配送/支付/分类/上架）。
- **Tab2 品牌营销**：
  - 品牌：从 Facet 品牌库单选（支持搜索；无匹配可先选「待建」）。
  - 划线价 + 促销期（开始/结束时间，中国「限时促销」）。
  - 营销标签（预置集合多选）、卖点一句话。
  - 关联既有促销活动（列出可参加的 flash-sale / 优惠券活动供勾选）。
- **Tab3 规格变体**：规格矩阵，最多 3 组规格，一键生成 SKU，逐行/批量设价与库存，标记主图。

保存按「新增/编辑」分别走现有 create / update 流程，矩阵批量调用扩展的建变体接口。

**规格变体交互（已确认线框）**：

1. 顶部分段器「无规格（单品）/ 多规格（组合）」，切换商品形态。
2. 规格组卡片（颜色/尺码…），每组填多个规格值，可「+添加规格组」，最多 3 组。
3. 由 规格A×规格B×规格C 笛卡尔组合自动展开为 SKU 列表（对应后端 `ProductVariant`）。
4. SKU 行可独立设价格/库存/默认图；支持批量设价/批量填库存，可选部分变体补独立图。
5. 确认生成 → 批量创建多个 variant。

## 第 3 节 · API / 数据契约

沿用现有 `apis/product.ts` + Vendure admin-api，扩展粒度最小化。

**品牌 Facet**

- 初始化：seed 建立 `Facet{ code: brand }`（空库，商家在后台建品牌；FacetValue 名称走 translations 预留多语言）。
- 商品保存：`updateProduct(id, facets:[brandValueId?])` 单选关联；读端 `product.facetValues.find(code=brand)` 回显。
- 品牌库查询：`facets(filters:{code:"brand"})` + 分页/搜索。

**商品/变体 customFields**

| mutation | 字段 |
|----------|------|
| `updateProduct` | `customFields: { marketingTags[], sellingPoint }` |
| `updateProductVariant` | `customFields: { listPrice, saleStart?, saleEnd? }` |

**规格矩阵批量**

- `createProductOptionGroup` + `createProductOption`（规格组/值），把自动生成的 optionGroups 挂到 product。
- `createProductVariants` 一次性批量建 乘积 变体，每项挂 `optionValues` + 各自 `price / stockOnHand / customFields(listPrice…)`。
- 编辑态：保留现有 `updateProductVariants` 批量。

**校验（before save）**

- `listPrice ≥ price`；`saleStart < saleEnd`；促销期内展示划线折扣，实付仍以 `price` 计。
- 矩阵变体无 `sku` 时自动按 `slug-颜色-尺码` 格式生成。

## 第 4 节 · 中国本地化促销能力 + 多语言预留 + 测试

**中国本地常用促销 → 落地映射**

| 国内常见玩法 | 本期落地 | 载体 |
|--------------|----------|------|
| 限时直降（秒杀/特卖） | ✔ 划线价 + 限时生效、过期回落 | Variant customField |
| 满 X 减 Y / 满件折扣 | ✔ 满减类促销 | 复用既有 coupon/sales 插件，在「关联活动」选择 |
| 单品/店铺优惠券 | ✔ 商品页领券、结账核销 | 复用 coupon-plugin |
| 营销标签（新品/热卖/清仓…） | ✔ 预置集合多选 | Product customField |
| 会员价/会员等级折扣 | △ 二期 | 会员等级插件 |
| 拼团 / 秒杀预热 | ○ 不在本期 | — |

一期实现：`限时直降 + 满减 + 优惠券关联 + 营销标签 + 卖点`。满减/优惠券仅做「商品表单里关联既有活动」，不重做活动创建流程（复用现有 coupon-plugin；若后端满减能力缺失，用优惠券满减实现）。

**多语言预留接口**

- 品牌名（FacetValue）、变体规格名（OptionValue）用 Vendure 原生 `translations`——即使只填 zh_Hans，其它语言槽位天然存在。
- 卖点/标签用「code 存储 + 前端按语言映射 label」与 `LocalizedText` 两路预留；本次只维护中文，其余语言接口就位、留空。

**测试**

- 本地 dev（devProxy→线上）验证：品牌库选取/回显、划线价与促销期展示及回落、矩阵生成与批量编辑、满减/优惠券关联下单、登录加购链路。
- 不触碰线上写操作（用新测试商品/账号）。

## 第 5 节 · Vendure 复用清单（不重复已完成工作）

| 目标 | 复用/依托 | 不重复的实现 |
|------|-----------|---------------|
| 品牌筛选 | Vendure 原生 `Facet`/`FacetValue`（`createFacet`/`createFacetValue`/`updateProduct facets`） | 不自建品牌表，不写筛选逻辑 |
| 规格变体矩阵 | Vendure 原生 `createProductOptionGroup`/`createProductOption` + `createProductVariants` 批量、`updateProductVariants` 编辑 | 后端只补 customFields，不新写建变体 mutation |
| 限时直降结算 | 既有 `flash-sale-plugin` 闪购价（结算期 PromotionItemAction） | 我们不建第二条结算价逻辑；`listPrice+saleStart/saleEnd` 仅做商品展示层划线价 |
| 满减/优惠券 | 既有 `coupon-plugin`（含满减）/`voucher-plugin`/`sales-plugin` | 「关联活动」只做选择，不重做活动创建/结算 |
| 限时秒杀/拼团/预售 | 既有 `flash-sale`/`group-buy`/`pre-sale` 插件 | 本期不新增 |
| 多语言结构 | Vendure 原生 `translations`（Product/Variant/FacetValue/Option enabled） | 卖点用 `LocalizedText`/`LocalizedString` 类型，仅填 zh_Hans |

**结论**：不重复已有插件（flash-sale/coupon/voucher/sales/group-buy/pre-sale/member-level）职能；本期后端新增仅限产品级/变体级零散 customFields 与 `brand` Facet 初始化，其余全部复用 Vendure 原生与既有插件。

## 范围界定

- 本期仅做「商品管理」侧（web-admin 添加/修改 + 后端字段/品牌库/Matrix 批量）。C 端商品详情的划线价/品牌/标签展示属随之联动的下游改动，评审确定后再纳入实施计划。
- 「关联促销活动」的**活动创建**不重做，复用既有插件；若是建活动能力缺失，提示用优惠券满减实现。

## 后续

- spec 自审通过后由用户在 `2026-08-29-product-manage-enhancement-design.md` 复核。
- 批准后调用 writing-plans 生成实施计划。