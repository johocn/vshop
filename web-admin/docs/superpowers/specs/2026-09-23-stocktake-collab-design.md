# 多人协同盘库（Stocktake）设计稿

- 日期：2026-09-23
- 状态：设计已定稿，待评审通过后进入实施计划
- 相关资产：`web-admin`（后台前端）、`vendure/packages/cjk-plugin`（后端插件）
- 承接：配货台 + 库位体系（`docs/superpowers/specs/2026-09-22-picking-console-design.md`），本次复用其库区/库位与三档开关

---

## 1. 目标与非目标

### 1.1 目标

在现有「单人一次性盘库」之上，新增**任务化、可分工、可分片、有进度**的协同盘库能力，落到具体需求：

| 需求原文 | 落法 |
|---|---|
| 多人协同盘库 | 任务拆「盘次」，盘次可指派/认领，**同一盘次独占**，看板统一看进度 |
| 不同仓库协同盘库 | 一个任务 = 一个仓库；多仓用「盘点活动（activityCode）」分组，看板合并显示，各仓独立过账 |
| 按库存区域 | 盘次按库区（`storage_zone`）拆分；`binMode=off` 时退化为整仓单盘次 |
| 按货品 | 圈范围支持按分类/品牌/指定变体清单；专项盘即「只用货品维度圈范围」 |
| 内部码 / 条形码 | 扫码识别：库位码 → 定位格子；内部码/条形码 → 命中断行；均复用现有 `scanCode()` |
| 已盘点 / 未盘点 | 应盘清单快照 + `countedQty IS NULL` 判定；进度实时可算，未盘项可单独筛出 |
| 分批次盘点 | 「分片推进」：一个任务多盘次并行，全部提交后一次性汇总过账（第二阶段再做周期轮盘） |
| 专门对某些产品盘点 | 专项盘任务：圈范围按指定变体/分类，盘次可为「整仓一个盘次」 |

### 1.2 非目标（本轮不做）

- **周期轮盘（Cycle Count）**：按排期长期滚动抽盘。本轮只在数据上预留字段，不做排期引擎。
- **多轮复盘**：差异项回炉再盘。数据模型不阻止未来扩展（行有 `countedAt`/`countedBy`），但本轮不做多轮留痕。
- **冻结仓库出入库**：过账不锁仓，改为「账面变动提示 + 过账时重算」。
- **审核流**：过账不做多级审批，改为权限点收口（能盘 ≠ 能过账）。
- **库位级账面数**：不引入库位维度的库存数量分摊（见 3.1）。

---

## 2. 现状核查与复用清单

核查结论（均已确认，非推测）：

| 能力 | 现状 | 本次处理 |
|---|---|---|
| 盘点单据 | `StockDoc` 已支持 `type=STOCKTAKE`（前缀 `ST`）；`stock-doc.service.ts` 中 STOCKTAKE 分支取 `realQty` 调用 `adjust.setPhysicalStock()` 覆盖物理库存并算 `difference` | **直接复用**，不新建过账机制 |
| 库位归位 | 单据项传 `zoneId`/`binId` 时经 `applyBinBinding()` 绑定 variant↔库位 | **直接复用**（盘点顺手纠正错位） |
| 前端单据 API | `src/apis/stock-doc.ts` 的 `createStockDoc(input)`，`StockDocItemInput` 已含 `zoneId`/`binId` | 直接复用 |
| 扫码 | `src/utils/scanner.ts` 的 `scanCode(): Promise<string>`：H5 自管理摄像头 + zxing（多格式一维/二维码），`ScannerError` 按 `MANUAL`/`CANCEL`/`FAILED` 分流；微信内直接走手动输入 | **直接复用**，不重写扫码 |
| 条码数据 | `ProductVariant.customFields.barcode`（条形码）与 `customFields.internalCode`（内部码）已存在（`cjk-plugin/src/shipping/product-variant-custom-fields.ts`） | 作为扫码匹配源 |
| 账面数 | `fetchStock(locationId, page, pageSize)` → `stockLevels` 返回 `productVariantId/stockLocationId/stockOnHand/stockAllocated` | 应盘清单「有账面」来源 |
| 库区/库位 | `storageZones` / `storageBins` / `variantBin` / `bindVariantToBin` / `unbindVariantFromBin` / `generateStandardBins` | 直接复用 |
| 三档开关 | `Channel.customFields.binMode`（`off`/`zone`/`bin`）+ 前端 `useBinMode` | 复用，作为盘库门控 |
| 权限 | 后端 `Role.permissions: string[]`（`tenantRoles`/`createTenantRole`/`updateTenantRole` + `tenant/role-templates.ts`）；前端 `authStore.hasPermission()` / `isSuperAdmin`；菜单按权限点门控 | 新增 2 个权限点 |
| 现有盘库页 | `src/pages/inventory/stock-doc/stocktake/index.vue`：选仓库 + 手工填 `variantId`/`realQty`，提交即过账，**无清单、无进度、无扫码、未用 zoneId/binId** | **保留为「快捷盘点」**，不推翻；新建任务体系 |

**缺口（必须新增）**：库位域只有「SKU → 库位」单向（`variantBin`）、格子本体（`storageBins`）与占用数量（服务方法 `binBindCounts`，**未暴露 SDL**），缺**「库位 → SKU 明细」**方向 —— 做「这一格应有哪些 SKU」必须补两个只读查询 `variantBinsByLocation` 与 `binOccupancy`（完整契约见 §7.1）。

---

## 3. 核心决策记录

### 3.1 账面口径：双轨（不引入库位级账面数）

**决策**：录入按「库区 → 库位 → 货品」导航，**盈亏按仓库级汇总过账**。

**理由**：现有库位只有「归位关系」（variant 绑在哪个 zone/bin），**没有库位维度的数量**。若强行把账面数分摊到库位，账面基准从一开始就是错的（分摊规则本身是猜的）。双轨同时拿到两样东西：库位级的作业动线与「哪个库位容易错」的统计，以及不会算错的盈亏。

**被否方案**：纯库位级账面（需要先做库存分摊，误差不可控）。

### 3.2 分批语义：分片推进（先做），周期轮盘（后置）

**决策**：一个任务圈定大范围，按库区拆成若干**盘次**，多人并行/接力，最后一次性汇总过账。周期轮盘列入第二阶段。

**理由**：分片推进与「多人 + 多仓协同」最贴合，且天然要求「先汇总、后过账」，与现代码（3.5）自洽。

### 3.3 仓库边界：一个任务 = 一个仓库，「盘点活动」做多仓分组

**决策**：任务绑定单一 `stockLocationId`；多仓协同通过 `activityCode` 分组，看板合并显示进度与差异，**各仓独立过账**。

**理由**：ST 单据与库存过账本身就是仓库级的；让一个任务跨仓会引入「部分仓盘完、部分仓未盘完」的中间态，状态机与权限复杂度陡增。用户要的「协同」实质是**统一发起、统一看板、统一进度**，不需要同一条任务记录。

### 3.4 应盘清单：双源合并

**决策**：`应盘 = 已归位 ∪ 有账面`；按归位关系落到库区/库位；账上有货但未归位的变体进**未归位桶**（单独一个盘次）。

**理由**：只按账面 → 库区清单里混进其实放在别处的货，走库动线要翻长列表；只按归位 → 账上有货却没绑位的变体凭空消失、差异算不出来。「双源合并 + 未归位桶」既顺动线又不漏账，且盘点过程顺手把错位/未归位纠正干净。

**数据事实（已核实）**：`variant_storage_bin` 的唯一约束是 `@Unique(['tenantChannelId','variantId','stockLocationId'])` —— **一个变体在一个仓库只有一条绑定**。因此不存在「同一 SKU 散在多格」（`一个 SKU 落多格` 属将来可能的放宽，§6.2 已按变体汇总做防御）；「一个库位有多个 SKU」则是常态。

**代价（已接受）**：`binMode=off` 时无库区概念，退化为「整仓一个盘次 + 单一清单」。

### 3.5 过账时点：汇总后一次性人工过账

**决策**：全部盘次提交 → 差异页复核 → 一键过账（生成 1 张 ST 单据）。**不冻结仓库**；若盘点期间账面有变动，差异页显式提示并**以过账时的当前账面重算**。

**被否方案**：每个盘次提交即过账 —— 分片时同一 SKU 跨库区会「后盘覆盖前盘」（A 区盘 24 先写 24，B 区盘 6 再写 6，账面最终 6）。

**代价（已接受）**：必须有「差异页」作为唯一决策点，否则一键过账等于盲过。

### 3.6 分工：指派 + 认领混合

**决策**：建盘次时可指定负责人，也可留空开放认领；认领/指派即**独占锁定**；负责人可释放退回待认领，管理员可强制释放。权限上**能盘的人与能过账的人分开**。

**理由**：实现成本极低（一个 `assigneeId` + 两个入口），同时覆盖「管理员派活」与「各人抢单」两种真实习惯。

### 3.7 手机录入页版式：B 为主 + C 作扫码快盘入口

**决策**：`binMode != off` 时主视图为**库区 → 格子宫格**（与「库位管理」页视觉一致，空格子一眼可见）；另设**单件专注/扫码驱动**的「扫码快盘」入口，两者共用同一份应盘清单与提交逻辑。

**被否方案**：只做两级列表（项多时滑很久）；只做单件专注（看不到全貌，漏盘风险）。

### 3.8 接口注册范围：仅 admin-api

**决策**：盘库为纯后台能力，新增 SDL 只注册进 `adminApiExtensions`，**不注册 `shopApiExtensions`**。

**说明**：`cjk-plugin` 的 admin/shop 是两套独立 SDL，此前已有「只注册一处导致另一侧静默不可用」的教训。此处是**有意的单侧注册**（C 端无盘点需求），非遗漏；若未来要开放给 C 端需同步补 shop 侧。

---

## 4. 数据模型

三张新表，由 cjk-plugin 提供实体；生产 postgres 走 `synchronize: true` 开机自动建表，**不手写 migration**（遵循项目数据库策略）。

### 4.1 `stocktake_task` 任务

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK increment | |
| `code` | varchar unique | 任务号，前缀 **`TK`**（避开单据前缀 `ST`，防混淆） |
| `channelId` | int | **渠道收口（硬性）**，所有查询必须按 `ctx.channelId` 过滤 |
| `stockLocationId` | int | 一个任务 = 一个仓库 |
| `activityCode` | varchar null | 盘点活动分组码（多仓归一组），可为空 |
| `name` | varchar | 任务名 |
| `scopeJson` | text | 圈范围条件快照：`{ zones: number[], categoryIds: number[], variantIds: number[], includeZeroBook: boolean }` |
| `binModeAtCreate` | varchar | 建任务时的档位（`off`/`zone`/`bin`），避免中途改档导致语义漂移 |
| `state` | varchar | `DRAFT`/`OPEN`/`COUNTING`/`COUNTED`/`POSTED`/`CANCELLED` |
| `createdById`/`createdByName` | varchar | 创建人（取 `TenantMember`） |
| `postedStockDocId` | int null | 过账生成的 ST 单据 id |
| `postedAt` | datetime null | |
| `note` | text null | |
| `createdAt`/`updatedAt` | datetime | |

### 4.2 `stocktake_wave` 盘次

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | |
| `taskId` | int | |
| `scopeType` | varchar | `zone`（按库区）/ `whole`（off 档整仓）/ `unassigned`（未归位桶） |
| `zoneId` | int null | `scopeType=zone` 时必填 |
| `zoneCode`/`zoneName` | varchar null | 冗余快照，避免库区改名后对不上 |
| `assigneeId` | varchar null | `TenantMember.id`；null = 待认领 |
| `assigneeName` | varchar null | |
| `state` | varchar | `OPEN`/`CLAIMED`/`COUNTING`/`SUBMITTED`/`RELEASED`/`CANCELLED` |
| `expectedCount` | int | 快照：应盘项数（进度分母） |
| `countedCount` | int | 已盘项数（冗余加速） |
| `claimedAt`/`submittedAt` | datetime null | |
| `createdAt`/`updatedAt` | datetime | |

### 4.3 `stocktake_line` 应盘行

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | PK | |
| `taskId`/`waveId` | int | |
| `variantId` | int | |
| `variantSku`/`variantName` | varchar | **快照**（商品改名后仍可对账） |
| `zoneId`/`binId` | int null | 归位关系快照；未归位桶为 null |
| `zoneCode`/`binCode` | varchar null | 快照 |
| `bookQty` | int | 该变体在**该仓**的账面数快照（**仅用于行内提示**，不参与逐行相减，见 6.2） |
| `countedQty` | int null | 实盘数；**null = 未盘** |
| `isExtra` | boolean | 盘盈行（清单外登记的） |
| `countedById`/`countedByName` | varchar null | |
| `countedAt` | datetime null | |
| `note` | text null | |
| `createdAt`/`updatedAt` | datetime | |

**索引**：`(taskId, waveId)`、`(waveId, countedQty)`（未盘筛选）、`(taskId, variantId)`（过账汇总）；唯一约束 `(taskId, waveId, variantId, binId)` 防重复行。

---

## 5. 状态机

**任务**：`DRAFT → OPEN`（拆好盘次、可认领）`→ COUNTING`（有盘次开始录入）`→ COUNTED`（全部盘次 SUBMITTED/CANCELLED）`→ POSTED`（终态）。任意非终态可 `→ CANCELLED`。

**盘次**：`OPEN → CLAIMED/ASSIGNED → COUNTING → SUBMITTED`（终态）；`SUBMITTED` 前可 `RELEASED` 退回 `OPEN`（清空负责人）。**同一盘次同一时刻只有一个负责人**；非负责人提交/录入一律拒绝并回传原因。

**应盘行**：`PENDING`（`countedQty IS NULL`）→ `COUNTED`。盘盈行创建即 `COUNTED`。

---

## 6. 核心算法

### 6.1 应盘清单生成（建任务时一次性固化）

```
输入：stockLocationId、scopeJson、binMode
1. bookRows  = stockLevels(stockLocationId) 过滤 stockOnHand > 0（includeZeroBook 时不过滤）
               按 variantId 归并（同变体多库存行求和）
2. bindRows  = variant_storage_bin(stockLocationId=loc)  → 按 variantId 分组（同变体可多格）
3. 合并：
   - 变体有绑定 → 每个 (zoneId,binId) 生成一行，bookQty = 该变体归并后的账面数
   - 变体无绑定 → 归入 scopeType='unassigned' 的盘次（zoneId/binId = null）
4. 应用 scopeJson 过滤：zones 限定盘次集合；categoryIds/variantIds 限定变体集合（专项盘）
5. 按盘次写入 expectedCount；整批在一个事务内完成
```

`binMode=off` 时不建库区盘次，只建一个 `scopeType='whole'` 的盘次（未归位桶概念不适用，全部行归入该盘次）。

### 6.2 差异计算（正确性关键）

**约束：以「变体」为最小比对单位，不逐行相减。**

**更正记录（2026-09-23）**：本稿初版以「同一 SKU 散在多格、逐行相减会重复扣减账面」为论据。核实 `variant_storage_bin` 后确认其唯一约束为 `(tenantChannelId, variantId, stockLocationId)`，**同一变体在同一仓库只有一条绑定**，故该论据不成立。结论（按变体汇总）保留，理由换成下面三条更硬的：

1. **盘盈行会与应盘行同变体并存**：清单内的变体若在别处被扫到，会新增 `isExtra` 行 —— 此时逐行相减会把同一变体算两次。
2. **与过账接口语义一致**：`createStockDoc` 的 `realQty` 是**覆盖式**，一个变体必须恰好一个数；逐行生成会变成同一变体多次覆盖，正确性依赖调用顺序。
3. **防御约束放宽**：若将来允许一个 SKU 放多格（业务上很可能），行级相减会静默算错，而汇总不会。

**配套规则**：扫到**已在应盘清单内**的变体 → 一律**更新原行**（并记录本次实际所在库位），不新建行；只有完全不在清单内的变体才建 `isExtra` 行。

正确算法：

```
实盘合计(variantId) = SUM(countedQty)  over 该变体在任务内的所有行（含 isExtra 行，其 bookQty 视为 0）
盈亏(variantId)     = 实盘合计 - 仓库当前账面
```

- **未盘行**：`countedQty IS NULL` 的行**不计入**实盘合计（等于「未盘项账面不变」），但差异页必须显式列出，并要求勾选「确认跳过 N 项未盘」才允许过账。
- **盘盈行**：`isExtra=true`，账面按 0 处理，`盈亏 = countedQty`。
- **账面变动**：过账时**重新读取**当前账面（不用建任务时的快照）；与快照不一致时返回 `recheck` 提示，前端确认后带 `confirm=true` 重发。

### 6.3 过账

```
postStocktake(taskId, confirm):
1. 校验：task.state == COUNTED；所有 wave ∈ {SUBMITTED, CANCELLED}
2. 校验：未盘行数 == 0，或 confirm 已确认跳过
3. 读当前账面 → 若与快照不一致且未 confirm → 返回 recheck + 变动明细
4. 按 variantId 汇总实盘（6.2）→ 得到 盈亏 ≠ 0 的变体集合
5. 生成 StockDocItemInput[]：
   - 有差异的 → { variantId, toStockLocationId, realQty: 实盘合计, (zoneId,binId 可选) }
   - 无差异但库位变更的（实盘所在格 ≠ 原绑定）→ 只传 realQty = 当前账面 + zoneId/binId（触发 applyBinBinding 归位）
6. createStockDoc({ type: 'STOCKTAKE', items, note: '盘点任务 ' + code })
7. task.state = POSTED、记录 postedStockDocId / postedAt
```

---

## 7. 接口契约（新增，仅 admin-api）

**查询**

| 名称 | 入参 | 出参要点 |
|---|---|---|
| `stocktakeTasks` | `options{ page, pageSize, state?, activityCode?, stockLocationId? }` | 任务列表 + 进度统计（含 activityCode 分组），按 `ctx.channelId` 收口 |
| `stocktakeTask` | `id` | 任务详情 + 盘次列表（含认领状态） |
| `stocktakeExpectedLines` | `taskId, waveId?, filter?{ onlyCounted, onlyUncounted, onlyDiff, onlyExtra }` | 应盘行分页（已盘/未盘/差异/盘盈筛选） |
| `stocktakeDiff` | `taskId` | 差异汇总（应盘/已盘/未盘/差异项/盘盈）+ 按变体汇总的差异明细 + 账面变动提示 |
| `variantBinsByLocation` | `stockLocationId, zoneId?, binId?, keyword?, includeDisabled?, page?, pageSize?` | **缺口补齐**：库位/库区 → SKU 明细分页（§7.1） |
| `binOccupancy` | `stockLocationId, zoneId?` | **缺口补齐**：全部启用库位的占用概览（含空格，喂格子宫格，§7.1） |
| `stocktakeResolveCode` | `taskId, code` | 扫码解析：返回命中类型（`bin`/`line`/`extra`）与目标行/库位 |

**变更**

| 名称 | 入参 | 说明 |
|---|---|---|
| `createStocktakeTask` | `input{ stockLocationId, name, activityCode?, scope, autoSplitByZone }` | 建任务 + 固化应盘清单 + 自动拆盘次 |
| `addStocktakeWave` | `taskId, input{ scopeType, zoneId? }` | 手工补盘次 |
| `assignStocktakeWave` | `waveId, assigneeId?` | 指派（传 null 即释放） |
| `claimStocktakeWave` | `waveId` | 认领（幂等；已被他人认领则拒绝） |
| `releaseStocktakeWave` | `waveId` | 负责人释放回待认领 |
| `saveStocktakeCounts` | `waveId, inputs[{ lineId?, variantId?, countedQty, zoneId?, binId?, note? }]` | 批量录入；不传 lineId 且非应盘 → 建盘盈行；同步 `countedCount` 与盘次状态 |
| `submitStocktakeWave` | `waveId` | 提交盘次（校验为负责人） |
| `postStocktake` | `taskId, confirm?` | 过账（见 6.3） |
| `cancelStocktakeTask` / `cancelStocktakeWave` | `taskId` / `waveId` | 取消（非终态） |

### 7.1 按库位反查 SKU（`variantBinsByLocation` + `binOccupancy`）

#### 为什么必须新增

现有库位域缺「库位 → SKU」方向：

| 现有能力 | 能回答 | 不能回答 |
|---|---|---|
| `variantBin(variantId, stockLocationId)` | 这个 SKU 在哪一格 | 这一格里有哪些 SKU |
| `storageBins(stockLocationId, zoneId?)` | 有哪些格子 | 格子里有没有货 |
| `binBindCounts()`（服务方法，未暴露 SDL） | 每格被几个 SKU 占用 | 是哪些 SKU |

盘点要的正是「**这一格应有哪些 SKU**」，所以补两个**只读**查询：一个给明细（分页），一个给概览（喂格子宫格）。

#### 底层表与约束（已核实）

`variant_storage_bin`（`src/storage/variant-storage-bin.entity.ts`）：`tenantChannelId`（= 渠道，收口键）、`variantId`、`stockLocationId`、`zoneId`（必填）、`binId`（可空，zone 档为 null）、`isDefault`。

**关键约束**：`@Unique(['tenantChannelId','variantId','stockLocationId'])` —— 同一渠道下，**一个变体在一个仓库只能有一条绑定**。由此：

- 「一个库位有多个 SKU」是常态（一对多）
- 「一个 SKU 绑到多个库位」**不可能发生**

#### 接口 1：`variantBinsByLocation`（明细，分页）

```graphql
variantBinsByLocation(
  stockLocationId: ID!
  zoneId: ID
  binId: ID
  keyword: String
  includeDisabled: Boolean
  page: Int
  pageSize: Int
): VariantBinPage!

type VariantBinPage { totalItems: Int!, items: [VariantBinItem!]! }

type VariantBinItem {
  bindingId: ID!
  variantId: ID!
  sku: String!
  variantName: String!
  barcode: String
  internalCode: String
  zoneId: ID!
  zoneCode: String!
  zoneName: String!
  binId: ID
  binCode: String
  rowNo: Int
  levelNo: Int
  isDefault: Boolean!
}
```

| 维度 | 设计 |
|---|---|
| 过滤 | `stockLocationId` 必填；`zoneId`/`binId` 可选，逐级收窄；两者都传且 bin 不属于该 zone → **拒绝并回传明确原因**（与既有 `bind()` 校验风格一致） |
| `keyword` | 匹配 `sku` / `barcode` / `internalCode`（前缀 ILIKE），**不做全文检索** |
| 排序 | `zone.sortOrder ASC, bin.rowNo ASC, bin.levelNo ASC, variant.sku ASC`（与项目既有库位排序键一致） |
| 渠道收口 | `tenantChannelId = tenantOf(ctx)`，与既有 `zones` / `bins` / `variantBin` 同源 |
| `enabled` | 默认过滤 `enabled=false` 的库区与库位（盘点不盘停用区）；`includeDisabled: true` 可查出（排查错位用） |
| 分页 | `pageSize` 默认 50、上限 200；`totalItems` 为过滤后总数 |
| 不返回 | 商品图、价格（后台列表用文字即可，减少 join） |

#### 接口 2：`binOccupancy`（概览，喂格子宫格）

```graphql
binOccupancy(stockLocationId: ID!, zoneId: ID): [BinOccupancy!]!

type BinOccupancy {
  zoneId: ID!
  zoneCode: String!
  zoneName: String!
  binId: ID!
  binCode: String!
  rowNo: Int
  levelNo: Int
  skuCount: Int!
}
```

| 维度 | 设计 |
|---|---|
| 返回范围 | 该范围内**全部启用库位**（含 `skuCount = 0` 的空格）→ 前端可直接渲染角标，无需再做差集 |
| 实现 | **复用已实现的 `binBindCounts(ctx, stockLocationId)`**（按 `binId` 聚合 `COUNT(1)`，已按渠道 + 仓库收口），本次只新增 resolver 与 SDL，**聚合逻辑零新增** |
| 性能 | 一次请求拿全仓格子概览，避免逐格调用 |

#### 与盘库的配合

1. **建任务**（§6.1 步骤 2）：`variantBinsByLocation(stockLocationId)` 分页拉全仓绑定 → 得到「已归位」集合及每个变体的库区/库位
2. **手机录入页（版式 B）**：`binOccupancy` 渲染格子宫格角标；点开某格 → `variantBinsByLocation(binId)` 拉该格 SKU
3. **扫码快盘（版式 C）**：`scanCode()` 得库位码 → 命中 `binCode` → 同一查询拉该格清单
4. **扫码命中变体**：用既有 `variantBin(variantId, stockLocationId)` 确认它**当前**在哪一格 → 与应盘行快照比对，不一致即提示「库位偏差」

#### 边界情况

| 场景 | 处理 |
|---|---|
| 变体被删 | join 变体表 → 该行不出现；孤儿绑定另列数据清理项（不阻塞） |
| 绑定指向 `enabled=false` 的库位/库区 | 默认不返回；`includeDisabled: true` 可查 |
| 绑定指向已删库位 | 查询不抛错（left join 库位，缺失时 `binCode` 返回 null）；同上走清理 |
| `zoneId` 与 `binId` 不匹配 | 拒绝并回传明确原因 |
| 同变体多格 | 唯一约束保证不可能（见上） |
| 大仓全量 | 概览走 `binOccupancy`（不拉明细），明细走分页 |
| 未归位变体 | 本查询天然不含（无绑定行）；未归位集合由「账面变体 − 绑定变体」得出（§6.1） |

#### 测试点

1. **渠道隔离**：t2 查不到其他渠道的绑定（必测，前车之鉴）
2. 排序键与库位管理页一致
3. 分页 `totalItems` 与实际行数一致
4. `keyword` 能命中 `sku` / `barcode` / `internalCode`
5. `includeDisabled` 开关行为正确
6. `zoneId` + `binId` 不匹配 → 报错
7. `binOccupancy` 返回空格（`skuCount = 0`）

---

## 8. 前端设计

### 8.1 页面

| 页面 | 路径（拟） | 说明 |
|---|---|---|
| 任务看板 | `pages/inventory/stocktake/index` | 任务列表 + 活动分组 + 盘次认领表 + 过账入口（权限门控） |
| 任务详情 | `pages/inventory/stocktake/task` | 盘次管理、进度、退回重盘 |
| 手机录入页（主） | `pages/inventory/stocktake/count` | **版式 B**：库区 → 格子宫格 → 格内 SKU 列表；顶部进度；底部提交 |
| 扫码快盘 | `pages/inventory/stocktake/scan` | **版式 C**：单件专注，扫码定位/命中，大号数字键盘，确认即下一个 |
| 差异页 | `pages/inventory/stocktake/diff` | 过账前唯一决策点；账面变动提示、未盘勾选、盘盈列表 |

**菜单**：挂在现有「库存」分组（`src/constants/menus.ts`），按新权限点门控。现有 `menu.stocktake`（快捷盘点）保留，改名与任务入口并列。

### 8.2 三档门控

`useBinMode` 的 `showZone`/`showBin` 决定：

- `off`：不显示库区/库位，录入页退化为「整仓一个盘次」的 SKU 列表
- `zone`：显示库区切换，不显示到格
- `bin`：库区 → 格子宫格完整展示

### 8.3 扫码识别规则

`scanCode()` 拿到字符串后按优先级解析：

1. **库位码**（匹配本仓 `/^[A-Z]-\d{2}-\d{2}$/` 或库位表 code）→ 切换当前格
2. **内部码**（`customFields.internalCode` 精确匹配）→ 命中断行
3. **条形码**（`customFields.barcode` 精确匹配）→ 命中断行
4. **SKU**（`ProductVariant.sku`）→ 命中断行
5. 未命中 → 提示「清单外，登记为盘盈？」，确认后建 `isExtra` 行（并允许顺手归位）

扫码失败按 `ScannerError.code` 分流：`MANUAL` → 弹手动输入；`CANCEL` → 静默；`FAILED` → 提示开权限。

### 8.4 i18n

所有固定文案走字典，`zh-Hans.json` 与 `en.json` **必须同步补充**（含新增页面、按钮、状态、错误原因）。

---

## 9. 权限模型

新增两个权限点（写入 `cjk-plugin/src/tenant/role-templates.ts` 的角色模板）：

| 权限点 | 含义 | 前端门控 |
|---|---|---|
| `StocktakeCount` | 建任务/拆盘次/认领/录入/提交 | 菜单可见 + 录入与提交按钮 |
| `StocktakePost` | 过账 | 差异页与过账按钮（仅此权限可见） |

默认模板：仓管主管两个都给；盘点员只给 `StocktakeCount`；其余角色都不给。**能盘 ≠ 能过账**是刻意的收口。超级管理员（`isSuperAdmin`）不受限。

---

## 10. 边界情况与失败模式

| 场景 | 处理 |
|---|---|
| 同一变体被重复扫到 / 在别格登记 | 命中**已在清单内**的变体 → 更新原行（记录实际库位），**不新增行**；完全清单外 → 建 `isExtra` 行；过账时一律按变体汇总（§6.2） |
| 一个 SKU 想放宽到多格 | 现约束不允许（§3.4/§7.1）；若将来放宽，§6.2 的按变体汇总已能防错 |
| 盘次已被他人认领 | 认领/录入/提交均拒绝，回传「已被 X 认领」（不静默失败） |
| 盘点中商品改名/删除 | 行内 `variantSku`/`variantName` 为快照，不影响对账；变体被删的行过账时跳过并回报 |
| 盘点中账面变动 | 差异页提示；过账需 `confirm`；以过账时账面重算 |
| 有未盘项就要过账 | 拒绝，除非显式 `confirm` 跳过；差异页必须列出被跳过的项 |
| 库区在建任务后被改名/停用 | 盘次存 `zoneCode`/`zoneName` 快照；`enabled=false` 的库区不参与拆分 |
| 盘盈行找不到库位 | 允许库位为空（只登记数量），过账时只覆盖数量、不动归位 |
| 重复过账 | `state=POSTED` 后再次 `postStocktake` 直接拒绝（幂等保护） |
| `binMode` 建任务后被改档 | 任务存档 `binModeAtCreate` 并按其执行，不改动进行中任务 |
| 大仓应盘项极多 | 应盘清单分页读取；`saveStocktakeCounts` 批量提交；`expectedCount`/`countedCount` 冗余避免每次 count |
| 渠道串单 | 所有新查询按 `ctx.channelId` 收口（吸取配货台跨渠道串入的教训），并在回归中显式断言 |

---

## 11. YAGNI 审查

**已从设计中移除**：库位级账面分摊（猜的基准）、过账审批流、仓库冻结锁、周期轮盘排期引擎、多轮复盘留痕、盘点报表引擎（先用导出差异表）。

**保留的最小能力**：三张表 + 10 个接口 + 5 个页面 + 2 个权限点。三张表是状态机（任务/盘次/行）的最小自然表达，不合并——合并会让「盘次独占」「认领」「进度」都变成 JSON 里手写的状态。

---

## 12. 生产就绪审查

- **渠道隔离**：所有查询按 `ctx.channelId` 收口，回归须显式断言（本项有前车之鉴，列为必测）。
- **权限**：过账必须校验 `StocktakePost`；录入/提交必须校验「是本人盘次」。
- **幂等**：认领、提交、过账均需幂等或终态保护。
- **事务**：建任务（清单固化）与过账（单据 + 状态）各自一个事务，避免半成品。
- **可回滚**：过账生成的是标准 ST 单据，回滚走既有单据作废/反向调整路径；任务取消不产生库存影响。
- **构建产物**：cjk-plugin 的 dev-server 消费 `lib/`，**改 `src` 必须 `npm run build`**，提交需带 `src` + `lib`（项目既有硬性约束）。
- **前端 schema 快照**：新增字段后需按既有套路刷新/打补丁 `graphql.schema.json`（部署序：先后端后前端）。

---

## 13. 分阶段交付

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0（本轮）** | 三张表 + 应盘清单生成 + 盘次认领/指派 + 手机录入页（B/C）+ 进度 + 差异页 + 过账 + 权限点 + i18n | 见第 14 节 |
| **P1** | 专项盘范围圈选器精修（分类/品牌/指定变体）、差异导出、库位偏差统计 | 抽样盘点场景可独立跑通 |
| **P2** | 周期轮盘（排期 + 上次盘点时间可见性 + 频次提醒） | 长期滚动抽盘可跑通 |

---

## 14. 验收标准（P0）

1. 建任务能正确固化应盘清单：已归位 ∪ 有账面，未归位项进未归位桶，专项盘按指定变体圈定。
2. 多仓同一 `activityCode` 在看板合并显示；各仓独立过账。
3. 盘次可指派、可认领，**认领后他人无法录入或提交**（后端拒绝 + 明确原因）。
4. 手机端（390×844）能按库区→库位盘完一个盘次并提交；扫码能定位库位、命中变体、清单外提示盘盈。
5. 已盘/未盘进度实时正确（分母 = `expectedCount`），未盘项可单独筛出。
6. 差异页正确显示同一变体跨多格的**汇总**盈亏（不是逐行相减），并列出盘盈与未盘。
7. 账面变动时过账需二次确认，且以过账时账面重算。
8. 过账生成 1 张 ST 单据且物理库存正确更新；重复过账被拒。
9. 无 `StocktakePost` 权限者看不到过账按钮且接口拒绝。
10. 跨渠道不可见：t2 渠道看不到其他渠道的盘点任务。
11. `binMode` 三档下页面表现正确（off 无库区、zone 到库区、bin 到格子）。
12. 手机视口截图（390×844 dpr=2）补齐到操作手册；API/e2e 回归通过。

---

## 15. 风险与未决项

| 项 | 风险 | 处置 |
|---|---|---|
| 应盘清单固化耗时 | 大仓变体多，建任务可能慢 | 建任务走后台任务或分批写入；先加 `expectedCount` 冗余观测 |
| 「账面快照 vs 过账时账面」差异 | 长周期盘点差异大，用户困惑 | 差异页明确对比两列，并提示建议复核 |
| 库位偏差统计（P1） | 本轮不做，用户可能预期有 | 在手册与差异页文案中说明 |
| 反向查询 `variantBinsByLocation` / `binOccupancy` | 需与既有库位表对齐；`binBindCounts` 口径必须一致 | 只读复用 `variant_storage_bin` 与既有服务方法（§7.1 已给完整契约、边界与测试点），风险低 |
| 权限点命名 | 与既有权限点风格需一致 | 实现时对照 `role-templates.ts` 现有命名再定 |