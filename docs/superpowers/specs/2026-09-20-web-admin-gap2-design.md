# web-admin 查遗补漏（功能补齐）设计文档（2026-09-20）

## 1. 目标与范围

对 `web-admin`（uni-app H5 管理后台，仓库根 `d:\zhao\vshop`）做本轮「查遗补漏 · 完善功能」。范围 = 1 个**后端 bug 修复**（P0 核销价）+ 4 项前端功能补齐（F2~F5）。所有设计均已通过内联 mockup 预览并获用户批准。

### 1.1 用户选择与补充
用户在多选题中全选四项（商品审批补强 / 图片库选图复用 / 优惠券交互打磨 / 收银核销对账闭环），并**补充明确 bug**：「核销页面，商品详情，没有显示价格，当前为 0」。据此将「PO 核销价=0」列为本批最高优先级（P0），其余四项按对应用户选项命名。

### 1.2 交付铁律（用户硬规范）
每项 = 实现 + API/e2e 回归 + **390×844（dpr=2）手机截图**（Playwright，登录 `guoxinnanshan@163.com / you123123`，t2 租户，存 `web-admin/src/static/manual/shots/`）+ 手册章节（若涉及）+ 部署。
部署：web-admin 本地构建 + `node scripts/deploy.mjs`；vendure（P0 需改 `cjk-plugin`）走 git push + ssh pull + pm2 restart。

## 2. 现状审计（已核实）

### A. P0 bug：核销价恒 0（根因已确认）
- 前端核销页 `pages/pickup/redeem` 用 `ln.lineTotalWithTax` 显示行金额（index.vue L38 `¥{{ fenToYuan(ln.lineTotalWithTax) }}`）。
- 数据源 `myPendingRedemptions`（`apis/redemption.ts` PENDING_FIELDS 查询 `lines { name quantity lineTotalWithTax }`）。
- 后端 `cjk-plugin/src/redemption/redemption-code.service.ts` L455：
  `lineTotalWithTax: Math.round(Number(l.lineTotalWithTax ?? 0))`
  Vendure `OrderLine` 实体**并无 `lineTotalWithTax` 字段**（正确字段为 `linePriceWithTax`，shop-plugin `types.ts` / `shop.service.ts:813` 即用 `line.linePriceWithTax`）。故 `?? 0` 恒得 0 → 页面显示 ¥0.00。

### B. 优惠券启停无确认
- `pages/coupon/index.vue`：删除走 `uni.showModal` 二次确认，但启用/停用 `onToggle` 直接切换，无确认步骤。

### C. 商品审批「待归类也能通过」
- `pages/platform/product-approval/index.vue`：待审 Tab（`marketplacePendingProducts`）无分类展示/设置，`approveProduct(id)` 直接通过，不校验 `platformCategoryId`。
- 已过审 Tab 已有 `setProductPlatformCategory`（`apis/marketplace.ts`）。后端已支持 `setProductPlatformCategory(productId, collectionId)`（`marketplace-plugin`）。
- marketplace-plugin 后端 `approveMarketplaceProduct` **未强制**分类（本次不改后端强制，前端阻断即可）。

### D. 独立图片库页「死胡同」
- `pages/media/library/index.vue`：仅 `ImagePicker max=999` 浏览/上传，`onSelect` 为空（注释「预留接口便于后续扩展」）。
- 全站选图实际已由 `MediaPicker`（内置 `MediaLibraryModal`，支持上传/搜索/多选/确认回填）覆盖（店铺信息、自提点、商品等）。

### E. POS 确认收款缺二次校验
- `pages/pos/index.vue` `onConfirmCollect()`：仅文案提示「请确认顾客已付清…」，点击即 `claimPickup` 完成，无二次确认弹层；POS 行明细未显示价格（仅名称/SKU/数量）。

## 3. 各功能设计

### 3.1 P0 核销价修复
**后端（vendure cjk-plugin）**
- `redemption-code.service.ts` L455：`l.lineTotalWithTax` → `l.linePriceWithTax`。
- 部署：git push + ssh pull + pm2 restart。

**前端（web-admin）**
- `apis/redemption.ts`：契约保持 `lineTotalWithTax` 字段名（后端 schema 未变），无需改。
- `pages/pickup/redeem/index.vue`：行金额正常显示；自提单卡片**补「订单应付合计」**（源后端 PendingRedemption 新增 `orderTotalWithTax`，或前端不引——**实现时确认**；优先后端在 PENDING_FIELDS 加 `totalWithTax` 返回，页面卡片 foot 区展示合计，便于核销核对）。

**决策**：为最小改动，P0 前端主要修正金额显示；「订单应付合计」若后端待核销清单未透出 `totalWithTax` 则**不强行加**（YAGNI，避免后端 schema 扩张），作为可选增强，实现时按后端是否有数据决定。

### 3.2 优惠券启停二次确认（前端）
- `pages/coupon/index.vue` `onToggle`：目标状态为启用/停用 => `uni.showModal`（标题/内容区分为「启用该券/停用该券」，确认回调再执行原逻辑）；busy 期间禁用重复操作。

### 3.3 商品审批「通过前必须归类」（前端）
- `apis/marketplace.ts`：`fetchPendingProducts` 查询补 `platformCategoryId`（customFields）。
- `pages/platform/product-approval/index.vue` 待审 Tab：
  - 每张待审卡片显示「平台分类：{名称 | 待归类}」（复用 `collTree` + `catName`，待审加载时同取平台分类树）。
  - 待审卡片操作区新增「设置分类」→ 复用 `onPickCategory` 弹分类选择（与已过审一致）。
  - 点「通过」时，若无 `platformCategoryId` → `uni.showToast`/modal 阻断，提示「请先设置平台分类」；有则走 `approveProduct`。
  - `fetchPendingProducts` 的返回类型补 `platformCategoryId`。

### 3.4 独立图片库页落地（前端）
- `pages/media/library/index.vue`：多选图片后提供「复制图片 URL」（把选中项 source 拼行复制到剪贴板 `uni.setClipboardData`），并显示已选数量与「复制」「清空」。定位为**素材管理 + 拿图 URL** 的兜底入口，不与 MediaPicker 弹层冲突。
- 交互：点击缩略图切换选中，底部浮现操作条（已选 N 张 · 复制URL · 清空）；无选中时操作条隐藏。

### 3.5 POS 确认收款二次校验（前端）
- `pages/pos/index.vue`：
  - 行明细补小计（`lineTotalWithTax`，来源 `fetchOrderDetail` 的 lines，需核对该字段在 detail 查询是否返回；缺失时由 `总价/行数` 分摊或仅显示应付合计——**实现时核对 detail lines 字段**）。
  - `onConfirmCollect()` 改为先 `uni.showModal` 二次确认：标题「确认收款」，内容列 单号 / 应付金额 / 商品清单摘要（前 2 条 + 「等 N 项」）；用户确认后才 `claimPickup`。`collecting` busy 保护。

## 4. 涉及文件

| 改/新增 | 文件 | 说明 |
|---|---|---|
| 改 | `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-code.service.ts` | P0：`lineTotalWithTax`→`linePriceWithTax` |
| 改 | `web-admin/src/pages/pickup/redeem/index.vue` | P0：金额正常显示（+可选合计） |
| 改 | `web-admin/src/pages/coupon/index.vue` | F2：启停二次确认 |
| 改 | `web-admin/src/apis/marketplace.ts` | F3：pending 补 platformCategoryId |
| 改 | `web-admin/src/pages/platform/product-approval/index.vue` | F3：待审显示分类 + 设置分类 + 通过拦截 |
| 改 | `web-admin/src/pages/media/library/index.vue` | F4：多选 + 复制 URL 落地 |
| 改 | `web-admin/src/pages/pos/index.vue` | F5：行小计 + 收款二次确认 |

## 5. 验收标准

| 项 | 验收 |
|---|---|
| P0 | 核销清单 / 核销详情金额 != 0 且与订单一致；自提单卡片合计（若加）正确 |
| F2 | 启停弹确认；取消不执行；确认后状态切换生效 |
| F3 | 待审卡片可设分类；未归类点通过被拦截；归类后能通过 |
| F4 | 多选后可复制 URL；空选隐藏操作条 |
| F5 | 收款二次确认内容正确；取消不核销；确认后正常完成 |
| 回归 | coupon/审批/POS/核销既有操作不回归 |
| 截图 | 每功能 ≥1 张 390×844（dpr=2）手机截图入 `manual/shots/` |
| 部署 | P0 vendure push+pm2；web-admin 本地构建 + deploy.mjs |

## 6. 风险与边界（YAGNI）

- **P0 合计可选项**：若后端后续透出 `totalWithTax` 才显示合计，不扩 schema。
- **F5 行小计**：以 detail lines 实际字段为准，缺失则降级只显示应付合计。
- **F3 用前端强校验**：不改后端 `approveMarketplaceProduct` 强制逻辑（避免影响既有已过审数据 / 迁移）。
- **不在本次范围**：不新增 switch 权限、不改多版式体系、不动 mp 手册；图片库仅前端落地不建后端接口。