# web-admin 缺口清单（第 3 轮盘点）· 2026-09-20

> 范围：`d:\zhao\vshop\web-admin`（uni-app H5 管理后台）。
> 性质：**盘点文档（backlog）**，不是设计方案。逐项确认优先级后再进入 brainstorm → writing-plans → executing-plans。
> 用户本轮选定方向：**① 主题风格体系联通 ② 库存单据闭环 ③ 列表一致性 + 小项打磨**（分销域列为后续）。

---

## 1. 已交付基线（本轮不重复）

截至 2026-09-20 已上线，**不得重复盘点**：

| 批次 | 内容 |
|---|---|
| 商户运营 5 项 | 库存预警增强（仓库/阈值筛选 + 批量生成采购入库单）、POS 电子小票、台账日期筛选/按日汇总/CSV 导出、优惠券运营看板、经营看板（趋势/TOP/库存健康） |
| POS | 桌面 POS 迁移入 web-admin（独立 SPA）+ 工作台桌面收银入口 + 收款二次确认 |
| i18n | 全量页面/组件中英双语迁移 + 登录页/侧边栏语言切换 |
| gap1 | 手册重构（op-1..30 + cx 分册）、店铺 Logo 接 MediaPicker、订单详情备注/改价、券使用明细弹层、数据看板完整版 |
| gap2 | P0 核销价归零修复、券启停二次确认、商品审批「通过前必须归类」、图片库页落地、POS 行小计 |

---

## 2. 方向一：主题风格体系联通

### G1 — 「主题风格」页脱离四/五级风格体系（结构性，最高优先）

**现状（已核实）**
- [pages/decorate/theme/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/decorate/theme/index.vue#L19-L36) 仅 **3 个硬编码色卡**（`taobao-orange` / `fresh` / `dark`），选中后写 `channel.customFields.themeId`。
- 同一件事已有两套体系并行：店铺侧 [shop-info](file:///d:/zhao/vshop/web-admin/src/pages/decorate/shop-info/index.vue#L319) 已能选 `ShopTemplate` 并写 `templateId`；平台侧 [templates](file:///d:/zhao/vshop/web-admin/src/pages/platform/templates/index.vue) 模板库 + [global-config](file:///d:/zhao/vshop/web-admin/src/pages/platform/global-config/index.vue) 全局配置均已可用。
- 结果：`themeId`（3 色卡）与 `templateId`（模板库）**双轨并存且互不感知**，商户在「主题风格」页做的选择与五级回退链（L0 全局默认 ← L1 全局配置 ← L2 风格模板 ← L3 店铺覆盖 ← L4 页面/模块默认）无关。

**目标**：「主题风格」页成为五级体系里 **L3 店铺覆盖** 的正式入口 —— 选模板 + 覆盖令牌 + 看合并结果；废弃硬编码 3 色卡与 `themeId` 双轨。

**属性**：前端为主；`themeId` 的存量兼容/迁移策略需在设计中定（存量渠道已写入 `themeId`，不可直接丢弃）。

**验收**：店铺侧改动实时反映到 C 端首帧（判定以手机视口截图为准）；未引用/引用无效模板时正确回退 L1 全局配置；存量 `themeId` 渠道不回归。

---

### G2 — 模板库 / 全局配置靠手写 JSON

**现状（已核实）**
- 模板库新建/编辑用两个文本框手写 `themeJson` / `pagesJson`（[platform/templates/index.vue L266-L272](file:///d:/zhao/vshop/web-admin/src/pages/platform/templates/index.vue#L266-L272)）。
- 全局配置的 `defaults` 也是 textarea 手写 JSON（[platform/global-config/index.vue L36-L40](file:///d:/zhao/vshop/web-admin/src/pages/platform/global-config/index.vue#L36-L40)），只有 `themeTokens` 三项（primaryColor / accentColor / radius）是结构化输入。
- 后端已具备 `templateMergedPreview(app, templateId, overrides)` 合并预览能力（前端 [template.ts L123](file:///d:/zhao/vshop/web-admin/src/apis/template.ts#L123)，模板库「预览」页签已在用），但**全局配置页与店铺覆盖页没有用它做「改前可见」**。

**目标**：把高频字段从 JSON 文本框升级为结构化表单（配色令牌、页面版式、功能块显隐），JSON 仅作高级兜底；改动后可就地看合并结果。

**属性**：纯前端。

**验收**：不改 JSON 也能完成「建模板 → 选版式 → 保存 → 预览」；非法输入有内联校验而非仅报错重填。

---

## 3. 方向二：库存单据闭环

### G3 — 四类库存单据只有「建单」，无「单据管理」

**现状（已核实）**
- purchase / transfer / stocktake / issue 四页均为**纯创建表单**（[purchase 92 行](file:///d:/zhao/vshop/web-admin/src/pages/inventory/stock-doc/purchase/index.vue)、[transfer 101 行](file:///d:/zhao/vshop/web-admin/src/pages/inventory/stock-doc/transfer/index.vue)、[stocktake 87 行](file:///d:/zhao/vshop/web-admin/src/pages/inventory/stock-doc/stocktake/index.vue)、[issue 92 行](file:///d:/zhao/vshop/web-admin/src/pages/inventory/stock-doc/issue/index.vue)），创建后无任何回看入口。
- [pages.json](file:///d:/zhao/vshop/web-admin/src/pages.json#L29-L32) 只注册了这四个创建路由，**无单据列表/详情路由**。
- **后端无单据查询接口**：`d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts` L1191 只暴露 `createStockDoc`，无 `stockDocs` 列表 / `stockDoc(id)` 单查（已 grep 全包，零命中）。实体已存在（`stock_doc` / `stock_doc_item` 表）。

**目标**：单据可查、可看、可撤 —— 列表（类型/仓库/日期/操作人筛选 + 分页）→ 详情（明细行 + 库存前后值）→ 撤销/反冲（限未下游消费的单据）。

**属性**：**前端 + 后端（cjk-plugin）**。这是本清单里唯一必须动后端的项，需评估工作量。

**验收**：建单后可在列表查到；详情与建单内容一致；撤销后库存回到建单前，并在库存流水留痕。

---

### G4 — 库存流水页过薄（低成本高收益）

**现状（已核实）**
- [inventory/movements/index.vue L32-L39](file:///d:/zhao/vshop/web-admin/src/pages/inventory/movements/index.vue#L32-L39) 写死 `{ page: 1, pageSize: 50 }`，无筛选、无分页、无详情跳转，超 50 条只能靠翻不到。
- **后端已支持全部所需参数**：`stockMovementLedger(productVariantId, locationId, bizCode, orderLineId, page, pageSize)`（[apis/stock-doc.ts L79-L84](file:///d:/zhao/vshop/web-admin/src/apis/stock-doc.ts#L79-L84)），前端只用了其中两个。

**目标**：补仓库 / 商品 / 方向 / 日期筛选 + 分页加载 + 前后库存变化（`beforeOnHand → afterOnHand`）展示。

**属性**：纯前端（后端参数已就绪）。

**验收**：按仓库/商品筛选结果正确；翻页累计不重复不丢项；`in/out` 方向与金额/数量显示正确。

---

## 4. 方向三：列表一致性 + 小项打磨

### G5 — 售后列表无检索、无分页

**现状（已核实）**
- [after-sale/list/index.vue L34-L53](file:///d:/zhao/vshop/web-admin/src/pages/after-sale/list/index.vue#L34-L53) 仅 4 个状态 tab，`fetchAfterSales` 写死 `take: 50`，无关键词/日期/金额筛选、无分页。
- 后端 `afterSalesRequests(options)` 走 Vendure 标准 ListQuery（[apis/afterSale.ts L50-L63](file:///d:/zhao/vshop/web-admin/src/apis/afterSale.ts#L50-L63)），支持 `skip/take/sort/filter`。
- 对比：订单列表已具备完整筛选 + 分页 + 多版式（[order/list](file:///d:/zhao/vshop/web-admin/src/pages/order/list/index.vue)），**两套标准不一致**。

**目标**：对齐订单列表标准 —— 关键词（订单号/客户）+ 日期区间 + 金额区间筛选，分页加载。

**属性**：纯前端。

**验收**：筛选组合结果与服务端一致；分页无重复；清空筛选恢复全量。

---

### G6 — 分类管理能力弱

**现状（已核实）**
- [product/categories/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/product/categories/index.vue) 只有 新建 / 重命名 / 删除 / 平台归位映射 四个动作；无排序、无层级移动、无图标/图片、无批量。
- 查询层仅取 `{ id, name }`（[apis/collection.ts L8-L13](file:///d:/zhao/vshop/web-admin/src/apis/collection.ts#L8-L13)），拿不到 `parentId` / 位置，无法渲染层级或拖拽排序。

**目标**：分类树形展示 + 排序/层级移动 + 图标设置。

**属性**：前端为主；Vendure 原生的 `position` / 层级移动能力**需在执行前核验**（`updateCollection` 是否接受 position、是否有 `moveCollection`），核验不通过则降级为「仅排序」或仅「层级展示」。

**验收**：层级展示正确；排序保存后回读一致且 C 端分类页顺序同步。

---

### G7 — 闲置 API 接 UI / 死代码清理

> 用户已选方向三包含此组。逐项区分「**真缺 UI**」与「**死代码**」，不要一视同仁。

| # | API | 判定 | 动作 |
|---|---|---|---|
| G7.1 | `adjustStock`（`setVariantStock` 绝对值设置，[inventory.ts L73-L85](file:///d:/zhao/vshop/web-admin/src/apis/inventory.ts#L73-L85)） | **真缺 UI** —— 库存页只能批量设库存，无单条精确调整入口 | 在库存/流水页补「调整库存」入口 |
| G7.2 | `deleteTenant` / `deleteTenantAdministrator` / `searchMyAdmins` / `linkTenantMemberToSelf`（[tenant-admin.ts](file:///d:/zhao/vshop/web-admin/src/apis/tenant-admin.ts#L132)） | **待判定** —— 需先确认产品上是否允许平台超管删除租户/管理员，再决定补 UI 或删 API | 先确认业务规则 |
| G7.3 | `auth.fetchMyChannels` | **待判定** —— 选店已有独立页（`channel-select`），可能为早期实现的残留 | 核验后删除或接入 |
| G7.4 | `product.ts` 大批判量（`fetchProduct` / `fetchProducts` / `fetchProductDetail` / `createProduct` / `setProductEnabled` / `createVariantsForProduct` / `upsertProductTranslation` / `resolveStockLocationId` / `reuseOptionGroupForProduct` / `grossPriceFromNet` / `fetchTaxRatePercent`） | **死代码** —— 商品创建/编辑实际走 `createProductFull` / `updateProductFull` / `fetchProductFull`（[create/index.vue L10](file:///d:/zhao/vshop/web-admin/src/pages/product/create/index.vue#L10)、[edit/index.vue L58](file:///d:/zhao/vshop/web-admin/src/pages/product/edit/index.vue#L58)），无任何页面消费 | 清理（降低误改风险） |
| G7.5 | `collection.createCollection` / `updateCollection` / `mapProductToCollection` | **死代码** —— 租户隔离路径实际走 `createTenantCollection` / `renameCollection`；`mapProductToCollection` 已由后端自动处理 | 清理或加注释说明用途 |

**属性**：纯前端。

---

## 5. 未选方向（列为后续，不在本轮）

### G8 — 分销域纯只读

[distribution/relations](file:///d:/zhao/vshop/web-admin/src/pages/distribution/relations/index.vue)（58 行）与 [distribution/settle](file:///d:/zhao/vshop/web-admin/src/pages/distribution/settle/index.vue)（57 行）均只有列表展示，无分佣规则配置、推广员启停/冻结、提现审核、导出。侧边栏已挂 2 个入口但能力等同只读看板。

**属性**：前端 + 后端待核验（`apis/distribution.ts` 的实际 mutation 覆盖度需先查）。

---

## 6. 优先级与批次建议

| 批次 | 内容 | 属性 | 依赖 |
|---|---|---|---|
| **P0** | G1 主题风格体系联通 | 前端（+存量兼容策略） | 无 |
| **P0** | G4 库存流水筛选分页 | 纯前端 | 无（后端参数已就绪） |
| **P1** | G3 库存单据闭环 | **前端 + cjk-plugin 后端** | 需先评估后端工作量 |
| **P1** | G5 售后列表检索分页 | 纯前端 | 无 |
| **P1** | G7.1 手动调整库存 | 纯前端 | 无 |
| **P2** | G2 模板/全局配置结构化 | 纯前端 | 建议与 G1 同批（同属风格体系） |
| **P2** | G6 分类排序/层级 | 前端（+核验） | 需核验 Vendure position/层级能力 |
| **P3** | G7.2~G7.5 判定与清理 | 纯前端 | 需业务确认（G7.2） |
| 后续 | G8 分销域 | — | 用户本轮未选 |

**建议执行顺序**：G1 + G2（风格体系，一并做）→ G4 + G5 + G7.1（纯前端小项，可合并一批）→ G3（后端联动，单独一批）→ G6 → G7 清理。

---

## 7. 交付铁律（沿用现有硬规范）

每项功能 = **实现 + API/e2e 回归 + 390×844（dpr=2）手机视口截图（Playwright）+ 手册章节补充**。

- 构建/部署：web-admin **本地构建** + `node scripts/deploy.mjs`；cjk-plugin（仅 G3 涉及）走 git push + ssh pull + pm2 restart。
- 截图入 `web-admin/src/static/manual/shots/`，并挂到对应手册章节。
- 多语言：新增文案必须同时补 `zh-Hans.json` / `en.json`，禁止只在单一语言写死（沿用全量 i18n 基线）。

---

## 8. 风险与边界（YAGNI）

- **G1 存量兼容**：已有渠道写入了 `themeId`，双轨收敛必须明确迁移/兼容策略，不允许静默丢弃存量配置。
- **G3 后端新增**：单据列表/详情/撤销是新增 admin-api 能力，需评估是否影响既有 `createStockDoc` 调用方；撤销只允许针对未下游消费的单据。
- **G6 依赖核验**：Vendure `position` / 层级移动能力若不可用则降级，不硬造前端排序假象。
- **G7 分类处理**：先确认业务规则再决定「补 UI」还是「删 API」，不做无依据的接口扩展。
- **不在本轮范围**：不改五级回退合并算法本身（只做入口与展示）、不动 mp 手册、不改订单多版式渲染器、分销域整体留待后续。