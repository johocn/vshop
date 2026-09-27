# 盘点仓「库存模式」校验 + 物理仓写入补虚拟镜像（口径修正）设计稿

- 日期：2026-09-27
- 状态：已实施并部署（后端 `bad9ae35d` / 前端 `4d6951d`）
- 相关资产：`vendure/packages/cjk-plugin`（后端插件）、`web-admin`（后台前端）
- 承接：[多人协同盘库设计稿](2026-09-23-stocktake-collab-design.md) 的 §3.3（一任务一仓）与 §6.3（过账）
- 编号：D51

---

## 1. 背景与问题

协同盘库落地后，「盘点任务绑哪个仓」一直**不校验仓库性质**（`kind=physical|virtual`）。这留下两个面：

1. **盘点仓二义**：物理仓模式下同一 SKU 有两本账——物理仓账面（可售/可发货的真实量）与虚拟仓镜像账面（Σ 绑定物理仓）。若允许建任务指向虚拟仓，过账（`setPhysicalStock` 写虚拟仓）会**绕开物理仓**直接改镜像账面，下一次任何镜像触发就把它冲掉；同一 SKU 的「盘点账面」与「可售账面」互不可见地各说各话。
2. **镜像补不齐**：`syncVirtualMirror` 原**只由 `StockMovementEvent` 且 `type === 'SALE'` 触发**，而物理仓的全部写入原语（采购入库 / 移库 / 出库 / 手工调整 / 盘点过账 / 收货）走的是 `adjustPhysicalStock` / `setPhysicalStock`，**不发 SALE 事件** → 虚拟仓 `onHand` 长期停在旧值，直到下一笔销售才被拉齐。

### 1.1 原方案（开工前拟）与其致命前提

开工前拟定的修法是「后端硬拒 `kind !== 'physical'` 的盘点仓」。该方案**默认生产盘点都指向物理仓**——这一前提必须先用生产数据核实。

### 1.2 生产 SQL 核实（2026-09-27，开工前实测）

命令：`ssh joho` → `docker exec -i 1Panel-postgresql-pIe0 psql -U youshaop -d vendure -A -F'|'`

| 事实 | 实测值 |
|---|---|
| `stocktake_task` 总数 | **24** |
| 其中指向**物理仓**的任务 | **0** |
| 其中指向**虚拟仓**的任务 | **24**（**全部属渠道 37 = `t2`**：loc 3 `默认仓`，virtual → **21 个**；loc 6 `t2 虚拟仓`，code `t2-virtual` → **3 个**） |
| 任务终态分布 | 23 × `CANCELLED`、**1 × `POSTED`**（id=24，`TK20260927-001`，loc 6，渠道 37） |
| `stock_doc` 中 `STOCKTAKE` 单据的**目标仓** | 3 单 → `official-01-physB`（physical）；**12 单 → `t2-virtual`（virtual）** |
| `channel.customFieldsPhysicalstockenabled` | **仅 `__default_channel__` = `t`**；`official-01`（名下确有 2 个物理仓 `official-01-phys` / `official-01-physB`，但开关为 `f`）、`t1`、`t2`、`t3`、`t24`、`test-marketplace-shop` **全为 `f`** |
| `variant_location_binding` 总行数 | **2**（虚拟镜像几乎未被真正启用） |

**结论：原方案被数据推翻。** 生产上**全部**盘点用法都指向虚拟仓（含唯一一次成功过账），且除默认渠道外所有渠道的 `physicalStockEnabled` 都是关的。硬拒 `kind !== 'physical'` 会**直接废掉生产唯一在用的盘点用法**。

---

## 2. 定稿口径

**校验规则与渠道库存模式挂钩，而非与仓库性质硬绑：**

| 渠道 `physicalStockEnabled` | 允许的盘点仓 | 理由 |
|---|---|---|
| `true`（物理仓模式） | **必须**物理仓（`kind === 'physical'`） | 此时虚拟仓只是 Σ 绑定物理仓的镜像，不是独立账面；写它等于写一个会被覆盖的派生值，且与「可售账面」分离 → 必须消除二义 |
| `false`（纯虚拟库存店） | **不限**（虚拟仓即唯一账面） | 该店没有物理仓维度，虚拟仓就是它的账面；此时拒绝等于把功能废掉（生产 24/24 正属此形态） |

**镜像补齐守卫（必需，非防御性写法）**：`adjustPhysicalStock` / `setPhysicalStock` 在写入完成后追加一次「按变体补镜像」；**若被写入的仓本身是虚拟仓则直接早退**。

早退不是可选优化——`t2`（开关 `f`、放行虚拟仓盘点）若同时存在绑定行，则镜像目标是「Σ 绑定物理仓 = 0」，一旦在虚拟仓写入后再补镜像，会把盘点刚写进去的数**立刻清零**。故「虚拟仓早退」是该口径能成立的前提。

---

## 3. 文件级改动清单

### 3.1 后端（`vendure/packages/cjk-plugin`，commit `bad9ae35d`）

| 文件 | 改动 |
|---|---|
| `src/inventory/virtual-physical-stock.service.ts` | ① 拆出 `syncVirtualMirrorForVariants(ctx, variantIds)`（去重 → 按变体逐个 `ensureVirtualLocation` → 读绑定 → `boundTotal` → `calcMirrorDelta` → `adjustStockPublic({bizType:'mirror'})`），`syncVirtualMirror(sales)` 变薄壳（从 sales 取 `productVariantId` 后委托）；② 新增 `isVirtualLocation(ctx, locationId)` 与 `syncMirrorAfterWrite(ctx, variantId, locationId)`（虚拟仓早退）；③ `adjustPhysicalStock` 末尾、`setPhysicalStock` 的 `delta !== 0` 分支各追加 `syncMirrorAfterWrite` |
| `src/stocktake/stocktake.service.ts` | 新增 `assertStockLocationAllowed(ctx, stockLocationId)`：仓不存在 → `UserInputError`；渠道 `physicalStockEnabled` 为假 → **直接放行**；为真且仓 `kind !== 'physical'` → `UserInputError`（文案：`本店已启用物理仓库存（physicalStockEnabled），盘点仓库必须选物理仓；「{name}」不是物理仓`）。`createTask`（`if (!stockLocationId)` 之后）与 `updateTask`（`if (!loc)` 之后）各调用一次 |
| `src/delivery/delivery-admin.resolver.ts` | `deliveryTransferArrived` 原直连 `inventoryService.adjustStockPublic`（**漏镜像**）→ 改注入并调用 `virtualPhysicalStockService.adjustPhysicalStock`，与其余 5 条写入路径同源 |
| `src/inventory/stock-reservation-item.entity.ts` | 4 个裸 `@Column()` 补显式类型（`reservationId`/`stockLocationId` → `int`，`fulfillType`/`status` → `varchar`）——解除预存测试阻塞（vitest esbuild 不产出装饰器元数据，裸 `@Column()` 无法推断列类型） |
| `src/inventory/virtual-physical-stock.service.spec.ts` | 保留原 3 例，新增 4 例：① 写物理仓后追加镜像流水（调用 2 次，末次 `bizType:'mirror'`）② 写虚拟仓早退（`setPhysicalStock` 返回 4、仅 1 次调用）③ 无绑定变体不产生镜像流水 ④ `syncVirtualMirrorForVariants` 重复 id 去重（`bindingRepo.find` 恰 1 次） |
| `lib/**`（11 个产物文件） | `npm run build`（rimraf + tsc + cpSync i18n）后随 src 一并提交（后端靠 `git pull` 上线，lib 必须入 git） |

### 3.2 前端（`web-admin`，commit `4d6951d`）

| 文件 | 改动 |
|---|---|
| `src/apis/inventory.ts` | 新增 `fetchStocktakeLocationOptions()`：读 `tenantInventoryOverview`；`physicalStockEnabled` 为真 → 只回 `kind === 'physical'` 的仓，为假 → 回全部仓；**失败兜底**回落既有 `fetchStockLocations()` |
| `src/components/stocktake/TaskFormSheet.vue` | 仓候选改调 `fetchStocktakeLocationOptions()`；另修既有缺陷——新建态「存草稿」按钮 `@tap="onCreateDraft"` 改为 `onSaveDraft`（脚本内从无 `onCreateDraft`，点击必抛错） |
| `src/pages/inventory/stocktake/index.vue` | 看板仓库筛选同样改调 `fetchStocktakeLocationOptions()` |

**无 i18n 变更**：后端拒绝文案是服务端原文（生产口径），前端只透传 `e.message`；仓候选无新增用户可见固定文案。

---

## 4. 未纳入本轮（如实登记）

| 项 | 现状 | 判据 |
|---|---|---|
| 库存明细页「调整」/ 快捷盘点（`pages/inventory/stock-doc/stocktake/index.vue`） | ~~仍可指向虚拟仓，后端**无对应 gate**~~ → **已由 D52 收口（见 §4.1）** | 该页是 D42 复用 `stock_doc(type:'STOCKTAKE')` 的入口，与「协同盘库任务」不是同一条链路；同类二义面未收口，待裁决 |
| 盘点进度分母含已取消盘次的行 | ~~`countedTotal` 过滤 `isExtra` 但**不排已取消盘次**的行~~ → **已由 D53 收口（见 §4.2）** | 统计口径问题，与本次「仓库性质校验」无关；D53 按「任务级进度口径」单独立项修正 |
| 盈亏时点 | 是**过账时点**的量（`recheck` 已提示账面变动） | 规格 §6.2 已定稿（过账时重算），非缺陷 |
| TRANSFER 两段写入 | ~~会产生 1 次中间态镜像流水（同事务、最终值正确）~~ → **已由 D54 收口（见 §4.3）** | 可优化为事务内合并，原「本轮不做」，D54 按「事务内合并补镜像」独立立项 |

### 4.1 D52 补记（ⓐ 项已收口 · 2026-09-27）

**口径不变，只把守卫补到同一条链路的另一个入口。** D51 的 `assertStockLocationAllowed` 原为 `StocktakeService` 的**私有**方法；D52 把它上移为**唯一实现** `VirtualPhysicalStockService.assertStocktakeLocationAllowed`，协同盘库任务（`createTask` / `updateTask`）与库存单据 `STOCKTAKE` 分支（库存明细页「调整」/「快捷盘点」入口）**共用同一份**，杜绝两处口径漂移。

| 文件 | 改动 |
|---|---|
| `src/inventory/virtual-physical-stock.service.ts` | 新增 `assertStocktakeLocationAllowed(ctx, stockLocationId)`：仓不存在 → `UserInputError`；渠道 `physicalStockEnabled` 为假 → **放行**；为真且仓 `kind !== 'physical'` → `UserInputError`（文案含「必须选物理仓」）。规则跟**渠道库存模式**走，不跟仓的 `kind` 硬绑 |
| `src/inventory/stock-doc.service.ts` | `STOCKTAKE` 分支在 `setPhysicalStock` 前调用守卫；该方法运行在 `withTransaction` 事务内 → 抛出即**整单回滚**，不留残单 / 残流水 |
| `src/stocktake/stocktake.service.ts` | 原 15 行内联守卫删除，改为委托 `virtualPhysicalStockService.assertStocktakeLocationAllowed`；构造函数注入 `VirtualPhysicalStockService`（同模块 provider，无循环依赖） |
| `web-admin/src/pages/inventory/stock-doc/stocktake/index.vue` | 快捷盘点页仓候选由 `fetchStockLocations()`（全量仓）改为 `fetchStocktakeLocationOptions()`（与后端同口径：物理仓模式只给物理仓） |

**「库存明细页『调整』链路」经复核不需改**：`onConfirmAdjust` 的 `defaultTargetId` 取 `defaultPhysicalLocationId || 首个物理仓 || 虚拟仓`，且 `inventory-stock.service.ts#resolveLocations` 的仓池为「有物理仓时只取物理仓」→ 物理仓模式下前端本就到不了虚拟仓；真正可达的缺口是**快捷盘点页原用全量仓**与**直调 API**，前者改候选、后者由 gate 兜住。

**验证证据**：

| 项 | 结果 |
|---|---|
| 后端单测 | `npx vitest --config vitest.config.mts --run` → **37 files / 265 tests 全绿**（258 → **+7**：4 例 `assertStocktakeLocationAllowed` + 3 例 `StockDocService STOCKTAKE` 守卫） |
| 后端类型检查 | `tsc -p tsconfig.build.json --noEmit` → **exit 0** |
| 后端部署 | commit `889b99786` → push → 服务器 `git pull --ff-only` + `pm2 restart vendure`（status `online` / unstable restarts `0`） |
| API 双态回归 | `_e2e/_verify_d52_stock_doc_stocktake_location_gate.py` → **9 项通过 / 0 项失败** |
| 手机视口取证 | 2 张 **780×1688**：`docs/verify/d52_stock_doc_stocktake_locations_t2_virtual_allowed_390.png`、`..._default_physical_only_390.png`，全程 **0 pageerror** |

**零真实库存写入的关键设计**：拒绝态用**虚拟仓**（写入前即被 gate 抛出）；放行态探针用**不存在的 variantId**（过 gate 后在写入阶段因 `stock_level."productVariantId"` 外键失败、整单回滚）→ 实测 `insert or update on table "stock_level" violates foreign key constraint "FK_9950eae3180f39c71978748bd08"`，单据 / 流水 `totalItems` 前后不变（t2 单据 12 / 流水 12），残留 **0**。

**关联**：修复手册 20.19 节；计划偏差表 **D52** 行；本节新增的守卫与 D51 为**同一份实现**（非复制），故 D51 的 §2 口径表继续适用，无需改动。

### 4.2 D53 补记（ⓑ 项已收口 · 2026-09-27）

**口径修正，不动 D51/D52 的守卫。** 「取消盘次」的语义是**放弃这一批盘点**，前端与服务端早已两处按此办理：`resolveTaskStateAfterWaves` 让 `CANCELLED` 不阻塞任务进 `COUNTED`；`post()` 的 `pending` 用 `waves.filter(w => w.state !== 'SUBMITTED' && w.state !== 'CANCELLED')` 把它从「未提交盘次」里剔除。**但任务级进度没跟上**——`buildTaskView` 仍按**全量**行/盘次统计，于是：

| 症状 | 根因 |
|---|---|
| 任务已 `COUNTED`，看板卡片却永远停在「已盘 3/10」「盘次 1/2 已提交」 | `expectedTotal` / `waveCount` 的分母里含**永远盘不到**的已取消盘次行 |
| 前端 `pct(expected, counted)` 与卡片文本自相矛盾 | 同一个卡片上「进度条」与「已盘 X/Y」用了不同口径的来源 |

**改动**（后端 `vendure/packages/cjk-plugin`，commit `bce9d98a6`）：

| 文件 | 改动 |
|---|---|
| `src/stocktake/stocktake-math.ts` | 新增纯函数 `progressWaves(waves, taskState)`：任务自身 `CANCELLED` → **原样返回全部**；无取消盘次 → **原样返回**（早退，不改变既有任务的口径、也不多一次分配）；否则 `filter(w => w.state !== 'CANCELLED')` |
| `src/stocktake/stocktake.service.ts` | `buildTaskView` 只取一次全量 `waves`/`lines` 后，用 `progressWaves` 得 `liveWaves`，再以 `liveWaveIds` 过滤 `lines` → `expectedTotal` / `countedTotal` / `waveCount` / `submittedWaveCount` **四项全部**改按 `liveWaves` 口径 |
| `src/stocktake/stocktake-math.spec.ts` | 新增 5 例：进行中任务剔除已取消盘次且保序 / 无取消盘次走早退（`toBe` 同一引用）/ 全部取消 → 空数组 / 任务自身取消 → 保留全量 / `POSTED` 同样只算未取消 |

**为什么四项要一起改**：只改 `expectedTotal` 会造出新的自相矛盾——「进度 100% 但卡片写 0/1 盘次已提交」「任务已 `COUNTED` 却提示还有盘次未提交」。

**为什么任务自身 `CANCELLED` 时保留全量**：整个任务已作废，卡片上这个数是「当初盘到哪」的历史信息。若一并归零成 `0/0`，前端 `stocktake-grid.ts#pct()` 在 `expected === 0` 时返回 **100**，作废任务会被显示成「已盘满」——反而失真。
（生产实测印证：取消唯一盘次后 `TK20260927-002` 显示「已盘 0/0 + 0/0 盘次已提交」（状态 `待过账`）；再取消整个任务后回到「已盘 0/9」。）

**刻意不改的两处**：`statsOf`（作业量统计，按库位/盘点人看「干了多少活」，不是进度）与 `diffOf` / `post`（过账口径，已取消盘次的行按**未盘**处理、过账前须显式确认，与 `post()` 的 `pending` 自洽）。

**验证证据**：

| 项 | 结果 |
|---|---|
| 后端单测 | `npx vitest --config vitest.config.mts --run` → **37 files / 270 tests 全绿**（265 → **+5**） |
| 后端类型检查 / 构建 | `tsc -p tsconfig.build.json --noEmit` → **exit 0**；`npm run build` 成功，`lib/` 5 个产物随提交 |
| 后端部署 | commit `bce9d98a6` → push（`889b99786..bce9d98a6`）→ 服务器 `git pull --ff-only` + `pm2 restart vendure`（status `online` / unstable restarts `0`） |
| API + UI 双态回归 | `_e2e/_verify_d53_stocktake_progress_denominator.py` → **7 项通过 / 0 项失败**（详见下表） |
| 手机视口取证 | 3 张 **780×1688**（390×844 dpr2）：`docs/verify/d53_progress_denominator_{before_wave_cancel,after_wave_cancel,after_task_cancel}_390.png`，全程 **0 pageerror** |
| 生产残留 | 探针任务建后即 `cancelStocktakeTask`（终态 `CANCELLED`），**零库存写入、全程未调 `postStocktake`** |

**e2e 实测明细**（渠道 `t2`，纯虚拟库存店）：

| 步骤 | 断言 | 实测 |
|---|---|---|
| ① 前提 | `t2` `physicalStockEnabled=false`（读 overview） | `False`，locations=2 |
| ② 基线 | 建任务并记基线 | `TK20260927-002` `state=OPEN` `expectedTotal=9` `countedTotal=0` `waveCount=1` |
| ③ 取消盘次 | `expectedTotal` 恰减被取消盘次的 `expectedCount`；`waveCount` 恰 -1 | 取消盘次 #40（`whole`，`expectedCount=9`）→ `expectedTotal` **9 → 0**、`waveCount` **1 → 0**、任务转 `COUNTED` |
| ④ UI 同值 | 看板卡片含 `countedTotal/expectedTotal` | 卡片「**已盘 0/0**」+「0/0 盘次已提交」（截图 `after_wave_cancel`） |
| ⑤ 取消任务 | `state=CANCELLED` 且 `expectedTotal` **回到全量** | `CANCELLED` / `expectedTotal=9` / `waveCount=1`；卡片「**已盘 0/9**」（截图 `after_task_cancel`） |

**证据边界（如实登记）**：生产**全部 26 个渠道** `binMode = off`（已实测），`binMode=off` 时 `buildExpected` 只产出**单个 `whole` 盘次**，故生产探针只能取到「唯一盘次被取消」这一形态（分母 9 → 0 + 任务取消后回到 9）；**「多盘次、取消其一、任务仍在进行中」的混合态**由 `stocktake-math.spec.ts` 的 5 例单测覆盖（含保序与早退）。生产要取到多盘次形态，需先把某渠道 `customFields.binMode` 改为 `zone`/`bin`——属渠道配置变更，不在本项范围。

**关联**：修复手册 20.20 节；计划偏差表 **D53** 行；协同盘库实施计划偏差区「后续偏差去向」交叉表 **D53** 行。

### 4.3 D54 补记（④ 项收口 + 「镜像补齐端到端证明」缺口关闭 · 2026-09-27）

D51 遗留两项合并到 D54 一次收口：**(A)** §4 表第 4 行「TRANSFER 中间态镜像流水」；**(B)** §2 镜像补齐守卫此前**只有单测 + 代码审阅**，没有真实写入链路的端到端证据。

**(A) 事务内合并补镜像。** 移库的「源仓出 / 目标仓入」两段各自调 `adjustPhysicalStock`，D51 的写法是写一段补一次镜像：源仓出 → Σ 绑定仓 7→4 → 虚拟仓写 −3；目标仓入 → Σ 回到 7 → 虚拟仓再写 +3。两仓皆绑定时产出 **2 条净零镜像流水**（同事务、最终值正确，但账本有噪点）。

| 文件 | 改动 |
|---|---|
| `src/inventory/virtual-physical-stock.service.ts` | ① `adjustPhysicalStock` 增第 7 参 `opts?: { deferMirror?: boolean }`（默认 `false`，行为不变）；② 新增公开方法 `syncMirrorAfterWrites(ctx, variantId, locationIds)`：逐个探仓性质，**只要有一个非虚拟仓**就按 Σ 绑定仓补**一次**镜像；`syncMirrorAfterWrite` 变薄壳委托 `[locationId]`。语义等价（每次现算 Σ、幂等），只是把「写一次补一次」合并为「全部写完补一次」 |
| `src/inventory/stock-doc.service.ts` | `TRANSFER` 分支两段 `adjustPhysicalStock` 均传 `{ deferMirror: true }`，两段写完再 `syncMirrorAfterWrites(ctx, variantId, [from, to])` |

**为什么不能「两段都推迟后就完事」**：合并补镜像必须仍以「Σ 绑定物理仓」为唯一权威。若把两段写入合并成一句却跳过补镜像，虚拟仓会停在旧值；若对**全虚拟仓**的写入也补镜像，则退化成 D51 §2 警告过的反例（盘点写虚拟仓后被 Σ 清零）——故 `syncMirrorAfterWrites` 保留「全虚拟仓早退」。单测 4 例正是钉住这四种分支。

**(B) 端到端证明（本地全链路 + 生产只读）。** 生产**禁写真实库存**，且生产 `order_stock_ledger` 中 `bizType='mirror'` **实测 0 行**（近期单据全落在纯虚拟库存店 `t2`，无物理仓绑定 → 镜像补齐在生产从未被真实触发），故写入侧证据只能在本地 dev-server 真实跑，生产侧只做**只读一致性核对**。

| 步骤 | 断言 | 本地实测（渠道 `official-01`，变体 1，绑定 loc8 + loc13） |
|---|---|---|
| ① 前提 | 渠道为物理库存模式 + 绑定 2 物理仓 + 起点全 0 | `physicalStockEnabled=true`；绑定 `[loc8 default, loc13]`；虚拟/物理仓 onHand 均 0 |
| ② PURCHASE +7 → loc8 | 物理仓 = 7 **且虚拟仓立即 = 7**（B 核心） | `{loc7: 7, loc8: 7}`；镜像流水 +1（loc7 / `in` / 7 / `虚拟镜像同步(variant=1)` / `0 → 7`） |
| ③ TRANSFER 3 loc8 → loc13 | loc8=4、loc13=3、虚拟仓仍 7，且**镜像流水不增**（A 核心） | `{loc7: 7, loc8: 4, loc13: 3}`；镜像流水仍为 13 条（**未新增**） |
| ④ STOCKTAKE loc13 → 10 | loc13=10、loc8=4、虚拟仓 = 14 | `{loc7: 14, loc8: 4, loc13: 10}`；镜像流水 13 → 14（`7 → 14`） |
| ⑤ UI（手机视口） | 态①最新卡片 = 镜像同步；态②最新卡片 = 移库（**无中间态镜像**）；态③最新卡片 = 镜像同步 | 卡片原文：`＋7 / 入库 · 镜像同步 / 0 → 7 / #1 · official-01 虚拟仓 / 虚拟镜像同步(variant=1)`；态②为 `＋3 / 入库 · 移库 / …:target-in`；按「镜像同步」胶囊过滤后行数 = 服务端 `totalItems`（13 / 13 / 14） |
| ⑥ 收尾 | 盘库归零 → 虚拟仓回 0 | `{loc7: 0, loc8: 0, loc13: 0}` |

**生产只读核对（零写入，2026-09-27 实测）**：`__default_channel__` 是**唯一** `physicalStockEnabled=true` 渠道；变体 **57** 绑 loc5「主站默认物理仓」(50) + loc7「北京前置仓」(10) → **Σ = 60**，虚拟仓 loc4「`__default_channel__ 虚拟仓`」onHand **= 60** ⇒ 当下一致；同库 `bizType='mirror'` 流水 **0 行**。

**验证证据**：

| 项 | 结果 |
|---|---|
| 后端单测 | `npx vitest --config vitest.config.mts --run` → **37 files / 275 tests 全绿**（270 → **+5**：4 例「合并补镜像」语义 + 1 例 `StockDocService TRANSFER` 分支断言） |
| 后端类型检查 / 构建 | `tsc -p tsconfig.build.json --noEmit` → **exit 0**；`npm run build --workspace @vendure/cjk-plugin` 成功，`lib/` 5 个产物随提交 |
| 本地全链路 e2e | `_e2e/_verify_d54_transfer_mirror_merge.py`（`WA_D54_STATE=local`）→ **31 项通过 / 0 项失败** |
| 生产只读核对 | 同脚本 `prod-after` 态（需生产凭据）；无凭据时以等价 SQL 只读核对，结论见上（虚拟仓 60 == Σ 60） |
| 手机视口取证 | 4 张 **780×1688**（390×844 dpr2）：`docs/verify/d54-after-{purchase,transfer,stocktake}-390.png`、`docs/verify/d54-mirror-only-390.png`，全程 **0 pageerror** |
| 生产残留 | 本项**全程零生产写入**（本地写入全部在自建 `official-01` fixture 上，末尾自清理归零） |

**证据边界（如实登记）**：本地渠道 `official-01` 原本 `defaultTaxZoneId` 为空 → 核心 `productVariant.stockLevels` 报 `The active tax zone could not be determined`；读虚拟仓 onHand 的另一条路 `inventoryStockPage` 也不通——其仓池 `resolveLocations` 在「有物理仓时**只取物理仓**」，显式传虚拟仓会抛「仓库不属于当前租户」。故脚本先给该本地渠道补了默认税区（本地 fixture 调整，与本次缺陷无关）后走核心 `stockLevels`。

**为何「虚拟仓 onHand」只能这样读**：`tenantInventoryOverview` 只给仓清单不给数量；`inventoryStockPage` 物理仓模式下读不到虚拟仓；`stockMovementLedger` 只看流水。核心 `productVariant.stockLevels` 是唯一能同时读到物理仓与虚拟仓 onHand 的 admin-api 面。

**关联**：修复手册 20.21 节；计划偏差表 **D54** 行；验收脚本 `web-admin/_e2e/_verify_d54_transfer_mirror_merge.py`。

---

## 5. 验证证据（真实数字）

| 项 | 结果 |
|---|---|
| 后端单测 | `npx vitest --config vitest.config.mts --run` → **37 files / 258 tests 全绿**（含新增 4 例） |
| 后端类型检查 | `tsc -p tsconfig.build.json --noEmit` → **exit 0** |
| 后端构建 | `npm run build` 成功，`lib/` 11 个产物随提交 |
| 后端部署 | 服务器 `git pull --ff-only` → `bad9ae35d86a`；`pm2 restart vendure` → status **online** / unstable restarts **0** |
| 前端部署 | `node scripts/deploy.mjs` → `uni build` 成功 → 产物校验通过 **48744 KB** → scp / 解压 / 备份轮转 → `nginx: syntax is ok` → **deploy done** |
| API 双态回归 | `_e2e/_verify_d51_stocktake_location_gate.py` → **10 项通过 / 0 项失败**（详见下表） |
| 手机视口取证 | 2 张 **780×1688**：`docs/verify/d51_stocktake_locations_t2_virtual_allowed_390.png`、`docs/verify/d51_stocktake_locations_default_physical_only_390.png`，全程 **0 pageerror** |
| 生产残留 | 脚本自清理；复跑核对 `t2` / `__default_channel__` 的 **DRAFT 任务 = 0** |

### 5.1 e2e 实测明细

| 步骤 | 断言 | 实测 |
|---|---|---|
| ① 前提 | 两渠道开关（读 overview，不臆测） | `t2` `physicalStockEnabled=False` locations=2；`__default_channel__` `=True` locations=6 |
| ② 放行态 | `t2` 用**虚拟仓**建 DRAFT 任务 → 成功（存量用法未被废） | `TK20260927-003` `state=DRAFT` `loc=6` → `cancelStocktakeTask` → `CANCELLED` |
| ③ 拒绝态 | `__default_channel__` 用虚拟仓 → 报错且含「必须选物理仓」 | 原文：`本店已启用物理仓库存（physicalStockEnabled），盘点仓库必须选物理仓；「__default_channel__ 虚拟仓」不是物理仓` |
| ④ 正例 | `__default_channel__` 用物理仓 → 成功 | `TK20260927-002` `state=DRAFT` `loc=5`（`主站默认物理仓`）→ 取消 → `CANCELLED` |
| ⑤ UI `t2` | 新建表单仓候选 = **全部仓**（虚拟仓可选） | 候选 2 项 `['t2 虚拟仓','默认仓']` = overview 全部仓集合 |
| ⑤ UI `__default_channel__` | 候选 = **物理仓集合**（虚拟仓已过滤） | 候选 2 项 `['主站默认物理仓','北京前置仓']` = `kind='physical'` 集合 |

选择器坑（已记入脚本注释）：uni-app H5 会同时渲染一份 **`display:none` 的隐藏 picker 模板**，`.uni-picker-item` 裸选会命中隐藏那份导致 `wait_for` 超时；真实弹出的滚轮在 `.uni-picker-view-content .uni-picker-item` 内。

---

## 6. 回滚

- 后端：`git revert bad9ae35d` → `npm run build` → 提交 → 服务器 `git pull` + `pm2 restart vendure`。回滚后 `createTask`/`updateTask` 的仓性质校验消失、物理仓写入不再补镜像（虚拟仓 `onHand` 退回「只在下一笔 SALE 时拉齐」的旧行为）。
- 前端：`git revert 4d6951d` → `node scripts/deploy.mjs`。回滚后盘点仓候选退回「不过滤」，且新建表单「存草稿」按钮恢复为必抛错的旧状（既有缺陷一并回退）。
- 数据：本设计**不含 migration**，无表结构变更；两侧回滚均不动存量数据。

---

## 7. 关联文档

- [多人协同盘库设计稿（2026-09-23）](2026-09-23-stocktake-collab-design.md)：§3.3 一任务一仓 / §6.3 过账（本次为其补「仓库性质」前置校验）
- [多人协同盘库实施计划（2026-09-23）](../plans/2026-09-23-stocktake-collab-plan.md)：偏差说明区
- 修复手册：`docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 第 20.18 节（D51）/ 第 20.19 节（D52 收口 ⓐ 项）/ **第 20.20 节（D53 收口 ⓑ 项）** / **第 20.21 节（D54 收口 ④ 项 + 镜像补齐端到端证明）**
- 验收脚本：`web-admin/_e2e/_verify_d51_stocktake_location_gate.py`、`web-admin/_e2e/_verify_d52_stock_doc_stocktake_location_gate.py`、**`web-admin/_e2e/_verify_d53_stocktake_progress_denominator.py`**、**`web-admin/_e2e/_verify_d54_transfer_mirror_merge.py`**