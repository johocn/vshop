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
| 库存明细页「调整」（`pages/inventory/stock-doc/stocktake/index.vue`） | 仍可指向虚拟仓，后端**无对应 gate** | 该页是 D42 复用 `stock_doc(type:'STOCKTAKE')` 的入口，与「协同盘库任务」不是同一条链路；同类二义面未收口，待裁决 |
| 盘点进度分母含已取消盘次的行 | `countedTotal` 过滤 `isExtra` 但**不排已取消盘次**的行 | 统计口径问题，与本次「仓库性质校验」无关 |
| 盈亏时点 | 是**过账时点**的量（`recheck` 已提示账面变动） | 规格 §6.2 已定稿（过账时重算），非缺陷 |
| TRANSFER 两段写入 | 会产生 1 次中间态镜像流水（同事务、最终值正确） | 可优化为事务内合并，本轮不做 |

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
- 修复手册：`docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 第 20.18 节
- 验收脚本：`web-admin/_e2e/_verify_d51_stocktake_location_gate.py`