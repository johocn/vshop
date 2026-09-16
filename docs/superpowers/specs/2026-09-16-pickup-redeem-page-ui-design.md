# 核销页（pickup/redeem）UI 优化 设计文档

> 方案标识：任务3 — 「交付清单卡」版式改版 + 商品信息后端增强。
> 存续：本设计经用户三版式 mockup 比选后定稿，写入存档待实现。

## 1. 目标与范围

对管理端 H5「核销页」`https://e.joho.cn/guanli/#/pages/pickup/redeem/index`
（源码 `vshop/web-admin/src/pages/pickup/redeem/index.vue`）做**视觉重构 + 信息增强**，
使其更贴近中国门店核销/交付一体化的实际使用场景。

**本次交付（含改动）**
- 视觉基调改为**清爽浅色现代化**（沿用后台主题 `$wa-*` 语义令牌，弱化深色、强化留白与状态色）。
- 采用**方案 A「交付清单卡」版式**：每待核销单展示商品清单（名称 ×数量 + 金额）、核销码胶囊、待收款 tag、状态、有效期人性化。
- 右上角**「待核销 N」计数徽标**（取后端 `totalItems`）。
- **有效期人性化显示**（`剩 X 小时` / `今天 HH:mm 到期` / `MM-DD HH:mm` / 已过期）。
- **扫码/填入后核销码高亮动效**（输入区短暂高亮反馈）。
- **商品信息后端增强**：`PendingRedemption` 增加订单商品行（名称/数量/金额），列表得以展示交付清单。

**明确延后（非目标）**
- 物理库存「按核销人指定默认仓库 + 库存<5 预警」：依赖的物理库存模型部分仍标「暂缓实施」，
  风险高、需大量后端接线，**本次不做**，另立任务。

## 2. 现状

- 页面共两块：顶部核销输入卡（输入框 + 扫一扫 + 核销）+「待核销自提单（N）」列表。
- 列表数据来自 `fetchPendingRedemptions`（admin-api `myPendingRedemptions`），
  字段仅 `orderId/orderCode/code/status/expiresAt/version/claimed/paymentType/collected`，**无商品明细**。
- 后端 `myPendingRedemptions` → `RedemptionCodeService.listPending`
  （`vendure/packages/cjk-plugin/src/redemption/redemption-code.service.ts:376`）用 queryBuilder
  对 Order 做 `getMany()`，**未加载 lines**，故无法直接返回商品明细。
- 设计令牌：`web-admin/src/uni.scss` 定义 `$wa-accent(#ff6600)`、`$wa-bg(#f5f5f5)`、`$wa-card(#fff)`、
  `$wa-ink`、`$wa-muted`、`$wa-danger`、`$wa-success` 等。核销页已在用 `$wa-*`。

## 3. 已确认决策

1. **版式**：方案 A「交付清单卡」。保留现有输入+扫码+核销逻辑与 COD 待收款判断，不改交互语义。
2. **基调**：清爽浅色现代化。复用 `$wa-*` 语义令牌（保证与后台整体一致），
   配色/圆角/间距统一走令牌，不新造随机颜色。
3. **后端增强**：`PendingRedemption` 增加商品行，本次做商品信息；库存预警延后。
4. **行为**：计数徽标用 `totalItems`；有效期人性化显示；扫码/填入后核销码输入区高亮动效。

## 4. 前端改造（`vshop/web-admin/src/pages/pickup/redeem/index.vue`）

### 4.1 结构（模板）
- 页头：「待核销自提单」标题 + 右侧橙色计数徽标（`totalItems`）。
- 核销输入卡：输入框 + 「扫一扫」（深色）+「核销」（主题橙）。填入/扫码时给元素加高亮 class 触发动效。
- 列表每卡（方案 A）：
  - 首行：订单号 `#orderCode` + 待收款 tag（COD 未收款时）+ 右侧状态文本（带色）。
  - 商品清单区：逐行「商品名 …… ×数量 金额」，来自 `r.lines`。
  - 底部分隔：核销码胶囊 + 有效期人性化文本（过期态置灰删除感）。
- 空态：无待核销单时显示友好空态。

### 4.2 状态与有效期人性化
- 状态沿用 `st(status)`（active/expiring_soon/expired/claimed → label+color）。
- 新增 `formatExpiry(t: string|null, status): string`：
  - 无值 → `—`；
  - `expired` → `已过期`（配合过期态样式）；
  - 距 expiry ≤ 某阈值（≤ 24h）→ `剩 X 小时 HH:mm 到期`，`X` 取 `Math.ceil(ms/3600_000)`，`HH:mm` 为当日时刻；
  - 今天到期 → `今天 HH:mm 到期`；
  - 其余 → `MM-DD HH:mm 到期`。
  （前端独立实现，不依赖后端计算，纯展示逻辑。）

### 4.3 计数徽标
- `fetchPendingRedemptions` 返回 `{ items, totalItems }`；页面用 `totalItems` 渲染右上角徽标（缺省回退 `items.length`）。

### 4.4 核销码高亮动效
- `rawCode` 在扫码/预填/手输命中后清空时机不变（核销成功后清空）。
- 在 `onScan`/`fillCode`/`onLoad` 填入后，给 claim 输入卡短暂追加高亮 class（如 0.5s 主题橙描边/上浮），
  便于店员确认已录入码。纯 CSS 动画，无接口变更。

## 5. 后端改造（`vendure/packages/cjk-plugin`）

### 5.1 类型扩展
- `redemption.schema.ts`：`PendingRedemption` 增加
  ```graphql
  lines: [RedemptionLine!]!
  ```
  ```graphql
  type RedemptionLine {
    name: String!
    quantity: Int!
    lineTotalWithTax: Int!
  }
  ```

### 5.2 服务 `listPending`
- `PendingRedemptionItem` 增 `lines: RedemptionLine[]`。
- 在 `listPending` 中为待核销单**批量加载订单行**并映射为商品名/数量/金额：
  - 商品名：优先 `line.lineName`? 具体以 Vendure OrderLine 可用字段为准，取产品/变体显示名；
  - `quantity = line.quantity`；
  - `lineTotalWithTax = line.lineTotalWithTax`（已含数量乘算，勿再乘）。
- 实现方式：将 queryBuilder 增加 `leftJoinAndSelect` 行关系（或对过滤后的单用 `EntityHydrator` 批量灌注 lines）。
  待核销单量小（take≤100），无性能顾虑。
- 注意 `listPending` 现按 `deliveryType=pickup`、`!claimed`、有有效码过滤后再分页；
  商品行只对最终 item 映射，不改变过滤/分页语义。

### 5.3 前端 `apis/redemption.ts`
- `PendingRedemption` 接口增 `lines: { name: string; quantity: number; lineTotalWithTax: number }[]`。
- `PENDING_FIELDS` 增加 `lines { name quantity lineTotalWithTax }`，并在 `fetchPendingRedemptions` 返回 `totalItems`。

## 6. 约束与一致性

- 复用 `$wa-*` 语义令牌，不造随机色；沿用现有圆角/间距规约。
- 不改核销交互（含 COD 待收款确认弹窗、扫码失败分支、重发等）语义。
- 不改后端过滤/分页逻辑；商品行仅作附带展示字段。
- i18n：本页为后台管理页，固定中文文案，无多语言需求（不新增 i18n 词条）。

## 7. 非目标（YAGNI，延后另立任务）

- 物理库存/默认仓库/低库存预警（依赖未落实的物理库存模型）。
- 商品缩略图、筛选/搜索、收藏排序、分页加载更多等额外能力。
- 核销后历史列表（claimed 不列出，现状不变）。

## 8. 测试与交付

- 后端：`listPending` 返回含 `lines`；`myPendingRedemptions` GraphQL 冒烟取到商品行。
- 前端：本地构建（web-admin），Playwright 移动视口（390×844，dpr=2=780×1688）截图核销页，
  覆盖：有待核销单（含 COD 待收款）、空态、状态/有效期人性化、扫码填入后高亮动效。
- 交付物 = 实现 + e2e 回归 + 手机截图 + 补充操作手册/测试用例记录。
- 部署：本地构建产物 scp 到服务器解压/拷入（`scripts/deploy.mjs`），服务端 `pm2 restart`，不在服务器构建。

## 9. 风险

- `listPending` 现一次性 `getMany()` 全量后内存过滤；增行关系后仍按序映射，量级不变，无显著风险。
- `line.lineName`/`lineTotalWithTax` 字段名以实际 Vendure 版本为准，实现时先在服务内验证再落字段。