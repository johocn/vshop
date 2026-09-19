# web-admin 内容功能补齐 设计文档（2026-09-20）

## 1. 目标与范围

对 `web-admin`（uni-app H5 管理后台，仓库根 `d:\zhao\vshop`）做一次「内容功能查遗漏 + 全量补齐」，范围 = 手册重构 + 4 项功能增强（批1）+ 数据看板完整版（批2）。所有设计均已通过 mockup 预览并获用户逐项确认。

### 1.1 已确认决策（用户逐项批准）
1. **范围**：全量补齐。
2. **D 类增强**：全选（台账导出 / 券使用明细 / 订单详情操作 / 四域手册章节）。
3. **数据看板**：完整版接 dashboard 插件（不用简单版）。
4. **手册 op-13/14/15（nshop C 端内容）**：拆出独立分册 `book:cx`。
5. **交付节奏**：两批 —— 批1 = 手册重构 + 4 功能；批2 = 数据看板完整版。
6. **实现路径**：方案 A「手册先行」—— 手册拆册重编号补骨架作验收清单 → 逐功能补全 → 截图挂章节 → 回归部署。
7. **批2 看板版式**：版式 A 纵排（KPI 横排 → 7 日趋势全宽 → 销量 Top 榜）。

### 1.2 交付铁律（用户硬规范）
每项功能 = 实现 + API/e2e 回归 + **390×844（dpr=2）手机截图**（Playwright，登录 `guoxinnanshan@163.com / you123123`，t2 租户，存 `web-admin/src/static/manual/shots/`）+ 手册章节 + 部署。
部署：web-admin 本地构建 + `node scripts/deploy.mjs`；vendure（coupon-plugin 小改）走 git push + ssh pull + pm2 restart。

## 2. 现状审计（已核实）

### A. 手册 bug（`src/static/manual/index.html`，CHAPTERS 数组）
- `id:'op-12'` **重复**：L343「收款台账」与 L577「优惠券」同名 id。
- **乱序**：L360「商户订单可见性（op-11）」排在 L343「收款台账（op-12）」之后，id 与顺序不符。
- **op-18 缺失**：L682 op-17 → L750 op-19，编号断档。
- **错位内容**：L614/629/640 的 op-13/14/15（nshop 结账页本地化 / 逐箱结算 / 订单确认售后）是 **nshop C 端** 内容，混入 op（租户运营）手册。
- 正文交叉引用：L911「网点管理（op-23）」在重编号后需同步改（→ op-22）。
- 手册渲染按 `chaptersOf(book)` 分组，id 仅内部驱动（state.cur），**重编号安全**；外部仅 `Drawer.vue` L42 / `pages/dashboard/index.vue` L106 链接手册根路径（无章节锚点）。

### B. 无手册章节的四个域
分销（`pages/distribution/relations`、`settle`）、数据看板（`pages/data/dashboard`）、图片库（`pages/media/library`）、POS（`pages/pos`）。这些功能本身已可用，只缺手册章节。

### C. 半成品
- `pages/decorate/shop-info/index.vue` L18：店铺 Logo 为「先填 URL」占位输入框（同页默认分享图已用 MediaPicker）。
- `pages/data/dashboard/index.vue`：仅 3 个 KPI 卡，自注「趋势图 / 商品排行接入 dashboard 插件后补」。
- `apis/stats.ts`：今日销售额口径 `orders createdAt 过滤 + 汇总 totalWithTax`，**含未完成/取消订单**（注释已声明待 dashboard 插件 `dashboardOverview(range:"today") → sales{orderCount gmv}` / `inventory{lowStockCount}` 替换）。

### D. 增强缺口
- `settle/ledger` 台账无导出。
- coupon 列表无使用明细。
- `order/detail` 仅有发货/核销/取消，缺备注、改价。

## 3. 手册重构设计（批1 首步）

### 3.1 结构目标
- **op 重编号**：按现有数组顺序连续重编号为 `op-1..op-30`（消除重复 id、乱序、op-18 断档），**mp 不动**。
- **新建 `book:cx`**（nshop 商城 C 端手册）：承接 op-13/14/15 → `cx-1..3`，BOOKS 注册 `cx: { id:'cx', title:'nshop 商城 C 端手册', short:'C端手册', icon:'📱', desc:'…' }`。
- **补 4 个新章节骨架**（标题+引言+操作步骤占位+截图占位）：分销 / 图片库 / 数据看板（批2 填充）/ POS。

### 3.2 重编号映射表（按现有数组顺序，仅修正结构性 bug）
| 新 id | 标题 | 旧 id |
|---|---|---|
| op-1 | 这是一本什么手册 | op-1 |
| op-2 | 认识多租户商城 | op-2 |
| op-3 | 开通并绑定你的店铺 | op-3 |
| op-4 | 登录管理后台 | op-4 |
| op-5 | 店铺装修与主题 | op-5 |
| op-6 | 商品管理 | op-6 |
| op-7 | 价格与库存 | op-7 |
| op-8 | 商品价格 · 库存 · 图片（含税率开关） | op-7b |
| op-9 | 订单与售后 | op-8 |
| op-10 | 常见问题（FAQ）· 运营 | op-9 |
| op-11 | 到店自提核销与收款 | op-10 |
| op-12 | 收款台账（核销人即收款人） | op-12（L343，去重） |
| op-13 | 商户订单可见性（本店商品单） | op-11（归位到连续序号） |
| op-14 | 优惠券（多租户发行与使用） | op-12（L577，去重） |
| op-15 | 商品专属优惠券（绑定商品 + 凭码兑换） | op-24 |
| op-16 | 成员密码管理与角色授权 | op-16 |
| op-17 | 房型模板库与酒店版式 | op-17 |
| op-18 | 四流对账：批次 / 差异 / 重跑闭环 | op-19（补齐断档） |
| op-19 | 详情页库存展示（虚拟库存 + 附近库存） | op-20 |
| op-20 | 微信分享兜底：标题 / 描述 / 主图 | op-21 |
| op-21 | 首页「城市 · 配送」过滤与风格配置 | op-22 |
| op-22 | 详情页配送口径切换 + 租户网点管理 | op-23 |
| op-23 | 库存单据操作手册 | op-25 |
| op-24 | 多仓拆分发货（预留单） | op-26 |
| op-25 | 订单列表多版式 | op-27 |
| op-26 | 风格模板库管理 | op-28 |
| op-27 | 分销：关系与结算 | **新增** |
| op-28 | 图片库（媒体资源） | **新增** |
| op-29 | 数据看板（今日概览 / 7 日趋势 / 销量榜） | **新增（骨架，批2 填充）** |
| op-30 | POS 门店收银 | **新增** |

`book:cx`：cx-1 nshop 结账页中国本地化（cn 版式）；cx-2 结算页逐箱结算；cx-3 订单确认页与售后。

### 3.3 实施要点
- 重编号后 **sweep 正文中的 `op-\d+` 交叉引用**（已知 L911 `op-23→op-22`；执行时全文核对）。
- 新章节骨架沿用现有 `.lead/.card/.note/.warn` 手册样式与中文行文风格。
- mp 手册内容一字不动。

## 4. 批1：四项功能设计

### F1 店铺 Logo 接 MediaPicker（`pages/decorate/shop-info/index.vue`）
- 将 L18 `input`（占位「图片上传见 Task 7，先填 URL」）替换为 `MediaPicker :max="1"`，与默认分享图同模式。
- 保存值仍写回 `f.shopLogo`（字符串）；**实现时先核验后端对 `shopLogo` 的消费格式**（assetId 或 URL）：若是 assetId，选图直接存 `ids[0]`，回显用 `fetchAssets` 取 preview；若是 URL，沿用分享图 `fetchAssets(1,0,undefined,ids)` 映射逻辑。
- 若当前 `shopLogo` 已是历史 URL 值，加载时兼容显示（非空且非 assetId 时原样展示）。

### F2 收款台账导出 CSV（`pages/settle/ledger/index.vue` + 新增 `utils/csv.ts`）
- 工具栏：**状态筛选**（全部 / 已收 PAID / 待收 PENDING_SIGN）+ **「导出 CSV」**。
- 数据源：`fetchSettlementLedgers()`（无分页，全量返回，客户端过滤），导出范围 = 当前筛选结果。
- CSV 列：时间（`rowTime`，YYYY-MM-DD HH:mm）、订单号（`orderCode`）、收款人（`collectorName`）、收款渠道（`collectorChannelId` 非空显示「门店收款(id)」，空显示「在线分账」）、收款方式（`settleMethodLabel`）、金额（元）、状态（已收/待收）。
- 导出：H5 用 Blob + `\uFEFF` BOM（Excel 中文）+ `<a download>` 触发，文件名 `收款台账_YYYYMMDD_HHmm.csv`；空结果 toast 提示不导出。

### F3 优惠券使用明细弹层（`pages/coupon/index.vue` + `apis/coupon.ts` + vendure coupon-plugin 小改）
- 每张券卡片操作区新增「明细」入口 → 弹层两个页签，**分页**（skip/take 20）：
  - **领取明细**：客户（姓名/手机号）、券码、状态（UNUSED/USED/RETURNED/EXPIRED/INVALID）、领取时间（issuedAt）、来源（领取 CENTRE / 定向发放 ADMIN / 兑换 EXCHANGE）。
  - **核销明细**：客户、券码、核销时间（usedAt）、核销订单号（usedOrderId）。
- 数据源（已核实契约）：`customerCoupons(options: { filter: { templateId: { eq } }, sort: { issuedAt: DESC }, skip, take }) { items { customerId code status issuedBy issuedAt usedAt usedOrderId } totalItems }`（`CustomerCouponListOptions` 走标准 ListQuery，可按 templateId 过滤；`@Allow(UpdateOrder)`）。
- **后端小改（vendure coupon-plugin）**：`packages/coupon-plugin/src/coupon-customer-coupon.resolver.ts` 增加 `customer` resolve field（按 `customerId` 取 `Customer { id firstName lastName emailAddress phoneNumber }`，未命中返回 null）。前端明细行展示客户名/手机号，缺失显示 `customerId` 兜底。
- 权限前置验证：当前角色需具备 `UpdateOrder` 权限（coupon 管理既用同一权限，正常已具备；回归时验证）。

### F4 订单详情备注 / 改价（`pages/order/detail/index.vue` + `apis/order.ts`）
- 操作条（现有：去发货 / 取消订单 / 去核销）新增：
  - **「备注」**（任何状态可用）：modal 输入 → `addNoteToOrder(input: { id, note, isPublic: false })`（Vendure 内置 admin mutation，已核实契约）→ toast 成功。web-admin 不展示备注列表（本版本无 `orderHistory`/`Order.history` 暴露，备注可在 Vendure 官方后台查看；展示留待后续）。
  - **「改价」**：仅订单状态 ∈ {AddingItems, ArrangingPayment}（可修改状态）时显示；modal 输入新实付金额 → `modifyOrder(input: { orderId, surcharges: [{ description: '后台改价', priceDelta: 新金额-当前实付 }], note })`（`dryRun:false`，负向 surcharge 即降价，SurchargeInput 已核实含 priceDelta）→ 成功后刷新详情。已支付/已发货订单**不提供改价**（账务安全，YAGNI，不扩订单状态机）。

## 5. 批2：数据看板完整版设计

### 5.1 数据层（`apis/stats.ts` 重构 + 新增 `apis/operations.ts`）
已核实 dashboard 插件（operations-plugin，vendure 仓库）admin-api 契约：
- `dashboardOverview(range: "today")` → `{ sales { orderCount gmv previousOrderCount previousGmv pendingCount } delivery { pending ... } customer { newCount totalCount ... } inventory { lowStockCount ... } afterSales { ... } marketing { ... } }`（range 仅 today/yesterday/week/month）
- `salesTrend(days: Int! { 7 | 30 })` → `[{ date, orderCount, gmv }]`
- `categoryTop(days: Int! { 7 | 30 })` → `[{ categoryId, categoryName, gmv, orderCount }]`
- 权限：`ViewDashboard`（`@Allow(OperationsPermissions.ViewDashboard)`）
- 替换方案：`fetchTodayOverview()` 改接 `dashboardOverview`（gmv / orderCount / lowStockCount），**删除**旧的 `orders createdAt 过滤` 与库存扫描口径（修复「含取消/未完成订单」问题）；`fetchHomeKpis` 若非消费同一口径则不动（回归时确认）。
- **前置验证**：当前登录角色（t2 租户 guoxinnanshan）是否具备 `ViewDashboard` 权限；若无 → 在 `platform/roles` 为该角色勾选（roles 已支持勾权限），仍不可则降级（看板显示「权限不足」提示，不硬编码 0）。

### 5.2 页面（`pages/data/dashboard/index.vue`，版式 A 纵排）
1. **KPI 横排 3 卡**：今日订单 / 今日销售额（¥，gmv/100）/ 库存预警（lowStockCount）。
2. **7 日趋势全宽**：`salesTrend(7)` 双线折线（gmv 元 + orderCount 单，双 Y 轴；自绘 canvas 轻量实现，不引第三方图表库）。
3. **销量 Top 榜**：`categoryTop(7)` 品类 Top10（排名、品类名、GMV、单数）。
4. 容错沿用现状：加载失败显示「—」，不硬编码 0。

### 5.3 手册章节
- 填充 `op-29 数据看板` 章节正文 + 截图。

## 6. 验收标准（每项功能）

| 项 | 验收 |
|---|---|
| 手册重构 | op-1..30 连续唯一、cx 分册 3 章、正文无旧 id 引用、mp 未动；截图挂新章节 |
| F1 | Logo 可选图/回显/保存生效（后台配置回读一致） |
| F2 | 筛选 + 导出 CSV 与页面数据一致，Excel 中文不乱码 |
| F3 | 明细弹层两页签分页正确、客户名显示、与后台数据一致 |
| F4 | 备注写入成功；改价仅在可修改状态出现且金额生效 |
| 批2 看板 | 三区块数据与 dashboard 插件一致；趋势/榜单位与金额正确 |
| 回归 | 既有功能 API/e2e 回归（订单列表、优惠券、台账、店铺信息、工作台）不回归 |
| 截图 | 每功能 ≥1 张 390×844（dpr=2）手机截图入 `manual/shots/` 并挂章节 |
| 部署 | 批1、批2 各一次：web-admin 本地构建 + `scripts/deploy.mjs`；vendure git push + ssh pull + pm2 restart |

## 7. 交付节奏

1. **批1**：手册重构（拆册重编号补骨架，作验收清单）→ F1..F4 逐项实现 + 截图挂章节 → 回归 → 部署。
2. **批2**：验证 dashboard 契约与 ViewDashboard 权限 → stats.ts 接 dashboardOverview → 看板页版式 A → 填 op-29 章节 + 截图 → 回归 → 部署。

## 8. 风险与边界（YAGNI）

- **改价仅限可修改状态订单**：不扩订单状态机、不改已支付单。
- **备注只写不展示**：web-admin 无 orderHistory 查询可用，备注列表展示留待后续。
- **coupon 客户名**：依赖 coupon-plugin `customer` resolve 小改；若后端不可改，降级仅显示 customerId。
- **shopLogo 格式**：实现时先核验 assetId vs URL，两端兼容。
- **ViewDashboard 权限**：验证 + roles 勾选；不可用则降级提示。
- **CSV 纯前端生成**：不新增后端接口。
- **Roadmap 预留不动**：Odoo 库存（预留开关）、品牌名暂不落库、商品关联活动暂不配置，均不在本次范围。
- **不在本次范围**：分销/图片库/POS/首页工作台 KPI 的功能本身不改（仅补手册章节）；mp 手册不动。
