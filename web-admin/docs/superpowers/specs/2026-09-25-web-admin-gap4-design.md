# web-admin 第 4 轮补齐 · 设计规格

> 日期：2026-09-25
> 范围：`d:\zhao\vshop\web-admin`（uni-app H5 管理后台）+ `d:\zhao\vendure\packages\cjk-plugin`（后端）
> 上游依据：[2026-09-20-web-admin-gap3-inventory.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-09-20-web-admin-gap3-inventory.md)（**已复核，其中 4 项判定过时**）
> 可视化对比：[docs/superpowers/mockups/gap4-plan/](file:///d:/zhao/vshop/web-admin/docs/superpowers/mockups/gap4-plan/index.html)（`node docs/superpowers/mockups/mockup-server.mjs` → http://localhost:52207/gap4-plan/index.html）

---

## 1. 范围与结构

用户裁决：**四项方向全做**（仓内作业闭环 / 库存域收尾 / 列表一致性 + 分类 / 风格体系收尾），**允许引入定时任务（JobQueue + worker）**。

结构：**一份总纲 spec（本文件）+ 4 批串行执行**，每批独立验收、可单独回滚。
统一计划由 writing-plans 产出，落在 `docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md`。

实现取向（已批准）：**方案 A「公共层抽取 + 就地对齐」** · 分类**原生优先** · 报表落点**甲**（并入数据看板新增视图分段）。

---

## 2. 已交付基线（本轮**不得重复做**）

2026-09-25 实测复核，以下 gap3 判定已过时：

| 项 | gap3 判定 | 实测现状 | 证据 |
|---|---|---|---|
| G1 主题风格体系 | 双轨并存 | **已交付** | `src/constants/theme-migration.ts`（`isLegacyThemeId` / `buildThemeIdMigration`）+ i18n `legacyBody` / `legacyModalBody` / `legacyNoMap` |
| G3 库存单据闭环 | 无查询接口 | **已交付** | 后端 `stock-doc.admin.resolver.ts:53 stockDocList` + `plugin.ts:1438`；前端 `pages/inventory/stock-doc/index`「单据中心」 |
| G4 库存流水 | 写死 pageSize | **已交付（分页）** | `inventory/movements/index.vue` 已有 `onReachBottom` / `PAGE` / `page` 游标 |
| G7.1 调整库存 | 真缺 UI | **已交付** | `inventory/stock/index.vue#L334-L351` 调整库存弹层调 `adjustStock` |
| 后端迁移 | 疑为裸 `synchronize` | **实为幂等迁移** | `cjk-plugin/src/migrations/*` 走 `OnApplicationBootstrap` 幂等模式（含 `migrate-stock-tables.ts`） |
| 预留单查询 | — | **已交付** | `plugin.ts:1277-1279` `reservations` / `reservation` / `reservationReconcile` |

**仍确认空缺**：G5（售后列表 `take: 50` 写死，无 skip/filter）· G6（分类无排序/层级/图标/批量）· G2 残项 · G7.4/G7.5 死代码 · 后端定时能力（`cjk-plugin` 内 grep 零命中 `JobQueue` / `Worker` / `cron`）· 预留单无超时释放（`stock-reservation.service.ts:362` 的 `release` 只在取消/退款时对称触发，无 `expire` / `timeout` / `ttl`）。

---

## 3. 批 0 · 前置核验（先做，结论决定批 1 / 批 4 形态）

| # | 核验项 | 通过则 | 不通过的降级 |
|---|---|---|---|
| 0.1 | Vendure `updateCollection` 是否接受 `position` | 分类可排序 | 排序不可用 → 只做层级展示 + 图标 + 批量 |
| 0.2 | 是否允许修改 `parentId`（有无 `moveCollection`） | 分类可移动层级 | 移动不可用 → 只做排序 + 层级展示 |
| 0.3 | 拣货批次实体与状态机现状（`SHIPPED` 之后有无状态位） | 交接/复核直接在既有状态机扩展 | 需先扩状态机 → 该子项顺延至批 4 末尾单独提交 |
| 0.4 | 后端是否有可复用的作业量聚合查询 | 报表直接消费 | 退化为「前端聚合已有接口」（`stockMovementLedger` / `stockDocList`） |
| 0.5 | G2 残余边界（结构化表单 / JSON 兜底已存在多少） | 只补缺口 | 若已基本完备 → 批 2 缩为「接入合并预览」单项 |

**硬约束**：核验不通过一律走降级链，**绝不硬造本地排序字段**（会与 C 端顺序不一致）。每项核验结论与降级决定**必须写入计划偏差说明区**。

---

## 4. 批 1 · 列表一致性 + 分类（纯前端）

### 4.1 新增 `useListPage` composable

落点：`web-admin/src/composables/useListPage.ts` —— 与既有 `useBinMode` / `useStocktakeScope` / `useVariantMatrix` / `useShipSubmit` **同目录同风格**。

契约：

```ts
useListPage<T>({
  fetcher: (p: { skip: number; take: number; filter: Record<string, unknown>; sort?: string })
    => Promise<{ items: T[]; total: number }>,
  take?: number,        // 默认 20
  immediate?: boolean,  // 默认 true
})
// → {
//   items, total, loading, finished, error,
//   loadMore(), refresh(),
//   applyFilter(f), resetFilter(),
//   shown,          // 已显示条数
//   hasMore,
// }
```

统一承担的横切行为：

- 上滑加载更多（`onReachBottom`）
- 下拉刷新（`onPullDownRefresh` + `uni.stopPullDownRefresh()`）
- 首次加载骨架态 / 空态 / 错误态（可重试）
- `已显示 N / M` 进度提示
- **筛选态与 `onLoad` query 双向同步**：进详情再返回不丢筛选条件

### 4.2 接入范围

| 页面 | 动作 |
|---|---|
| `pages/after-sale/list/index` | **本批唯一改动的页面**（G5 主目标），用于验证 composable 契约 |
| `pages/inventory/movements/index` | **不在本批** —— 迁移 + 筛选在**批 3** |
| `pages/inventory/stock-doc/index` | **不在本批** —— 迁移 + 筛选在**批 3** |
| `pages/order/list/index` | **不动** —— 已完整，作为参照基准，避免无谓回归 |

> composable 契约先用售后列表单页验证通过，批 3 才迁移库存两页（见 §10 风险缓解）。

### 4.3 售后列表补齐（G5）

后端 `afterSalesRequests(options)` 走 Vendure 标准 ListQuery，**已支持 `skip` / `take` / `sort` / `filter`**（[afterSale.ts](file:///d:/zhao/vshop/web-admin/src/apis/afterSale.ts#L50-L63)）。

补齐：关键词（订单号 / 客户 / 售后单号）· 下单日期区间 · 退款金额区间 · 售后类型 · 排序（申请时间 / 金额）· 分页加载。
`pages.json` 为 `pages/after-sale/list/index` 补 `"enablePullDownRefresh": true`。

### 4.4 分类管理（G6）

- 查询层 [collection.ts](file:///d:/zhao/vshop/web-admin/src/apis/collection.ts#L8-L13)：`fetchCollectionsOptimized` 由 `{ id, name }` 补为含 `parentId / position / customFields`。
- 层级树展示：**复用已存在的** `buildCollectionTree`（同文件 L33-L53），缩进 + 展开/收起 + 子项数。
- 排序：原生 `position`（依赖核验 0.1）；长按拖动，松手保存。
- 层级移动：改 `parentId`（依赖核验 0.2）。
- 图标：写入 `customFields` + 复用 MediaPicker。
- 批量：勾选后批删 / 批改图标 / 批移动（前端循环调用既有 mutation）。
  - **批删限制**：仅对**空分类**（无挂载商品、无子分类）放行；含商品或含子分类的分类不允许批量删除，行内给出原因说明。

### 4.5 死代码清理（G7.4 / G7.5）

- `apis/product.ts`：删除 `fetchProduct` / `fetchProducts` / `fetchProductDetail` / `createProduct` / `setProductEnabled` / `createVariantsForProduct` / `upsertProductTranslation` / `resolveStockLocationId` / `reuseOptionGroupForProduct` / `grossPriceFromNet` / `fetchTaxRatePercent`（实际走 `createProductFull` / `updateProductFull` / `fetchProductFull`）。
- `apis/collection.ts`：删除 `createCollection` / `updateCollection` / `mapProductToCollection`（租户隔离路径实际走 `createTenantCollection` / `renameCollection`；`mapProductToCollection` 由后端自动处理）。
- **删除前逐个 grep 确认零消费方**；任一有消费方则保留并加注释说明用途。

### 验收

1. 筛选组合结果与服务端一致；清空筛选恢复全量。
2. 翻页累计不重复、不丢项。
3. 进详情返回后**筛选条件保持**（滚动位置不作要求）。
4. 分类层级展示正确；排序保存后回读一致（若 0.1 通过）。
5. 死代码删除后 `npm run build` / 类型检查通过，无页面引用报错。

---

## 5. 批 2 · 风格体系收尾（纯前端）

1. **合并预览接入**：`platform/global-config/index.vue` 与店铺覆盖页接入**已封装好的** `templateMergedPreview`（[template.ts L123](file:///d:/zhao/vshop/web-admin/src/apis/template.ts#L123)，模板库「预览」页签已在用），实现**改前可见**合并结果。
2. **结构化表单**：把高频字段（配色令牌 / 页面版式 / 功能块显隐）从 JSON 文本框提到结构化输入；JSON 保留为**高级兜底**（沿用既有 `jsonOpen` 开关模式）。
3. **行内校验**：非法输入就地提示并标红，不再「报错 → 全部重填」。

### 验收

1. 不改 JSON 也能完成「建模板 → 选版式 → 保存 → 预览」。
2. 非法输入有行内校验。
3. 全局配置 / 店铺覆盖改动后能就地看到合并结果。

---

## 6. 批 3 · 库存域收尾（纯前端）

G3 / G4 / G7.1 已交付，本批只补残项：

- **库存流水**：补筛选（仓库 / 商品 / 方向 / 日期）+ 展示 `beforeOnHand → afterOnHand` 变化；后端 `stockMovementLedger` 参数已就绪。
- **单据中心**：补筛选（类型 / 仓库 / 日期 / 操作人）+ 分页。
- 两页迁移到 `useListPage`。

### 验收

1. 按仓库 / 商品筛选结果正确。
2. `in` / `out` 方向与数量显示正确。
3. 翻页累计不重复、不丢项。

---

## 7. 批 4 · 仓内作业闭环（前端 + 后端 + 运维）

### 7.1 定时底座 + 预留单超时释放

- 后端：`cjk-plugin` 内注册 Vendure `JobQueueService`，定义周期任务 `release-expired-reservations`。
- Worker：复用**既有** [packages/dev-server/index-worker.ts](file:///d:/zhao/vendure/packages/dev-server/package.json#L14)（`npm run dev:worker` 已在）。
- 配置：超时时长走 channel `customFields`，键名 `reservationTtlMinutes`，**默认 30 分钟**；多城市 / 多店铺可各自设值。
- 前端：预留单列表显示**剩余倒计时** + 手动释放入口。
- 留痕：释放动作**记入库存流水**。
- **运维面（必须写入手册）**：服务器需**常驻一个 worker 进程**（pm2 增一项），否则预留永不释放。本地 `npm run dev:server` **不含** worker，需另起 `dev:worker`。

### 7.2 批次交接 / 复核 / 异常件

- 前端：`pages/order/picking/batch` 补 `SHIPPED` 后的交接确认、复核、异常件登记。
- 后端：新增对应 mutation（如 `handoverBatch` / `registerBatchException`）；是否需扩状态机取决于核验 0.3。

### 7.3 长期报表

- 落点：`pages/data/dashboard/index.vue` **新增一层「视图」分段**（经营数据 / 作业分析），两视图**共用既有 7 / 30 天分段**，不新增路由、不新增侧边栏项。
  > 事实校正：该页现为**单页堆叠卡片**（概览 3 卡 → 销售趋势 → TOP 商品），顶部仅一个 `.seg`（7 天 / 30 天）—— **并非多页签**。
- 内容：KPI 4 卡（拣货单数 / 发货件数 / 盘库次数 / 盘点差异率）+ 盘点差异趋势图 + 作业员明细表 + CSV 导出。
  - **指标口径（明确定义，避免二义）**：
    - 拣货单数 = 统计期内**已完成的拣货批次**数（按批次创建时间归期）
    - 发货件数 = 统计期内**已发货订单的商品件数合计**
    - 盘库次数 = 统计期内**已提交的盘点任务**数
    - 盘点差异率 = 统计期内**差异件数合计 ÷ 盘点总件数合计**，保留两位小数百分比
    - 时间归期一律用各单据的**创建时间**，与看板既有 7 / 30 天口径一致
- 数据源：**优先前端聚合已有接口**（`stockMovementLedger` / `stockDocList` / 拣货批次）；不足再新增 resolver（依赖核验 0.4）。

### 验收

1. 预留单到期后**由 worker 自动释放**，库存流水有对应留痕；前端倒计时与状态一致。
2. 批次交接 / 复核 / 异常件闭环可走通，状态流转正确。
3. 报表数据与流水 / 单据明细**对账一致**；CSV 导出内容与页面一致。
4. worker 停掉时预留**不释放**（用于证明是真定时任务而非请求内触发）。

---

## 8. 横切约定（每批都必须满足）

- **i18n**：新增词条 **zh-Hans / en 双语同步**，前端固定文案一律走 i18n 字典，禁止单语言写死。
- **测试与截图**：每批 e2e + API 回归；**功能截图必须用手机浏览视图**（标准视口 390×844，dpr=2 = 780×1688，Playwright 移动视口），并补进操作手册。
- **文档**：`docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 新增章节；**会发布**的 `src/static/manual/index.html`「youshop 使用手册」同步更新。
- **计划文档**：`docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md` 文末设**偏差说明区**；偏差只追加、**不回头改正文**。
- **临时脚本**：用完即删；`git add` 必须带路径前缀，**严禁 `git add -A`**。
- **每批独立可验收、可单独回滚**。

### 不碰（本轮零改动）

- 打印模板与 `verify:print` 门禁（跑一次确认无回归即可）
- 五级回退合并算法
- C 端渲染器 / mp 手册
- `d:\zhao\vendure` 根 `package.json` 的构建脚本约定

---

## 9. 移入 backlog（本轮不实现）

| 项 | 原因 |
|---|---|
| 周期盘到期自动建任务 + 到期提醒 | 用户未选入批 4 |
| G8 分销域（分佣规则 / 推广员启停 / 提现审核 / 导出） | 用户未选 |
| G1 主题风格体系 | **已交付** |
| G7.2 租户 / 管理员删除类 API（`deleteTenant` / `deleteTenantAdministrator` / `searchMyAdmins` / `linkTenantMemberToSelf`） | 属「待判定」——需先确认产品上是否允许平台超管删除租户/管理员，本轮不做判定 |
| G7.3 `auth.fetchMyChannels` | 属「待判定」——选店已有独立页 `channel-select`，疑似早期残留；核验后删或接入留待后续 |
| 统一幂等与并发保护 · 全局审计留痕 | 未选入本批 |
| 分类排序 / 移动（若核验 0.1 / 0.2 不通过） | 降级后顺延，须在偏差区写明原因 |

---

## 10. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| `useListPage` 抽象与 uni-app 生命周期不契合 | 批 1 阻塞 | 先在售后列表单页验证，通过再迁移另两页；不契合则回退为「逐页对齐」（方案 B） |
| 分类原生 position / parentId 不可用 | G6 缩水 | 走降级链，不硬造本地字段；偏差区记录 |
| 批 4 引入常驻 worker | **新的运维面** | 部署手册明确 pm2 增项；worker 缺席时功能静默失效须有告警或前端提示 |
| 批次状态机扩展 | 影响配货台既有流程 | 核验 0.3 先行；必要时该子项独立提交、独立回滚 |
| 删死代码误删有消费方 | 构建失败 | 删前逐个 grep 确认；`npm run build` + 类型检查作为门禁 |
| 报表聚合性能 | 看板变慢 | 优先复用已有查询；必要时后端聚合，不在前端做全量大表扫描 |

**回滚单元 = 批次**。批 4 的 7.1 / 7.2 / 7.3 为三个独立提交，可分别回滚。

---

## 11. 交接口径

本轮交付 = **实现 + API/e2e 回归 + 390×844 dpr=2 手机视口截图 + 操作手册/测试用例文档**，四者齐备才算完成。
每批完成后更新计划偏差说明区；全部完成后在修复手册新增验收总结章节。