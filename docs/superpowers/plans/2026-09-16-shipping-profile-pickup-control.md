# 配送档案自提点受控（C端仅显已勾选） 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 C 端结账「选自提点」列表严格等于该订单配送档案勾选的自提点；凡档案未勾选的自提点不出现。管理后台「指定自提点」面板保持显示全部候选、供运营勾选，维持现状不改。

**Architecture:** 前后端受控机制已存在（后端 `resolveBoxFulfilment` 已按 `methodConfigs.rangeMode='selected' → options.pickupLocationIds` 收敛，前端 cn 逐箱流 `BoxPickupBlock` 100% 渲染 `box.pickupLocations`）。因此本计划以**实证复现钉死根因**为第一任务：若问题档案的 `box.pickupLocations` 实际返回了多于勾选的点，必然落在三处之一——方式 config 仍为 `rangeMode='all'`、档案级 legacy `pickupLocations` 残留多余点被合并、或该方式 `methodConfig` 缺失退化成 legacy。对症修复后走回归构建、手机截图与部署。

**Tech Stack:** Nuxt(nshop) C端 · Vendure(cjk-plugin) 后端 · web-admin(uni-app) 管理端 · pnpm · Playwright 手机视口截图

**参考文档:** spec `docs/superpowers/specs/2026-09-16-shipping-profile-pickup-control-design.md`

---

## 任务文件结构

- C 端渲染链（只读，确认无泄漏）：`nshop/layers/base/app/components/checkout/BoxPickupBlock.vue` → `CheckoutPerBoxList.vue` → `CheckoutBoxPickupBlock.vue`
- 后端收敛：`vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts`（`resolveBoxFulfilment` L391-433 / `getEffectivePickupIdsForConfig` L441-453）
- 分箱装配：`vendure/packages/cjk-plugin/src/order/order-box.service.ts`（`computeOrderBoxes` L340 → `pickupLocations: fulfilment.pickupLocations` L458）
- 管理端（保持现状）：`vshop/web-admin/src/pages/shipping/profile/index.vue`
- 数据库：`shipping_profile` 实体的 `methodConfigs`（JSON 列）+ `pickupLocations` 关联表

---

### Task 1: 实证复现 — 钉死 `box.pickupLocations` 泄漏根因

**目的：** 在真实档案上用 `selected` 只勾一个点，抓取 C 端 `orderBoxes`，确认返回的 `pickupLocations` 是否多于勾选点。这一步决定 Task 2 修哪里，必须先做、不可跳过。

**Files:**
- 复现实例：`nshop` 开发环境（`pnpm dev`，端口默认 3000）+ 本地/测试 `vendure` shop-api
- 后端关读：`order-box.service.ts:267-473`、`shipping-profile.service.ts:391-453`

- [ ] **Step 1: 建立受控测试档案（只有 1 个自提点被勾选）**

在管理后台 `https://e.joho.cn/guanli/#/pages/shipping/profile/index`（或本地对应环境）新建配送档案 P：
1. 添加一个自提配送方式（如门店自提 store-pickup）。
2. 自提点范围选择「**指定自提点**」。
3. 候选框里只勾选自提点 **A**（其余 B/C/D 不勾）。
4. 保存。记录档案 id 与方式 shippingMethodId。

预期：后端落库 `methodConfigs` 为该方式 `{ mode, options: { rangeMode: 'selected', pickupLocationIds: ['<A.id>'] } }`。

- [ ] **Step 2: 核查落库数据是否真的为 selected**

对数据库查该档案的配置（表名以实际为准，字段为 JSON `methodConfigs` / 关联 `pickup_locations`）：

```sql
-- 1) 方式级 config 是否为 selected 且仅含 A
SELECT sp.code, sp.methodConfigs
FROM shipping_profile sp WHERE sp.code = 'P';

-- 2) 档案级 legacy pickupLocations 是否残留多余点（重点：可能混入 B/C/D）
--    该关联若仍有 B/C/D，即为根因(b)
--    shipping_profile__pickup_locations 为多对多关联表
SELECT * FROM shipping_profile__pickup_locations sppl
JOIN shipping_profile sp ON sp.id = sppl."shippingProfileId"
WHERE sp.code = 'P';
```

记录 `methodConfigs` 完整 JSON 与 legacy 关联行数。

- [ ] **Step 3: 顾客侧复现，抓取 `orderBoxes[].pickupLocations`**

向 shop-api 发起含档案 P 的订单，调用（对应 N 端起售接口）：

```
query GetOrderBoxes { orderBoxes { boxKey profileId profileName type pickupLocations { id name type } } }
```

记录该箱 `pickupLocations` 实际返回的点 id 列表。

- [ ] **Step 4: 对照判定根因（写进复现文档）**

| 判定 | box.pickupLocations 返回 | 根因 | 对应修复 |
|------|--------------------------|------|---------|
| A | = 仅 [A] | **无泄漏，控制已生效** | 不需改；问题在历史档案数据，转 Step 5 修正真实档案 |
| B | > [A] 且含 B/C/D | 该方式 `rangeMode` 实为 `'all'` 或 legacy 残留点被 union | 见 Task 2-B |
| C | = []（空） | 该方式 methodConfig 缺失，退化为 legacy（空） | 见 Task 2-C |
| D | = 该类型全量 | `getEffectivePickupIdsForConfig` 走了 `'all'` 分支（rangeMode='all'） | 见 Task 2-B |

- [ ] **Step 5: 若判定 = A（控制已生效），核对真实线上档案再决定**

线上的问题档案逐个核查 Step 2 的 `methodConfigs` 与 legacy 关联：把它们从「同城全部」或「残留 legacy」修正为「指定自提点 + 仅目标点」，走管理后台 UI 重新勾选并保存（无需改代码）。随后直接跳 Task 3 验证。

- [ ] **Step 6: Commit 复现结论（无代码改动时记录文档即可，不改业务代码）**

```bash
git add -A
git commit -m "docs: shipping profile pickup control root-cause findings (repo=task-relevant)"
# 若根因落入 Task 2 分支，则不在此 commit，直接走 Task 2
```

---

### Task 2: 依根因对症修复（仅命中 Task1-B/C 分支时执行）

> 若 Task 1 判定为 A（无代码泄漏），本任务整体跳过，直接 Task 3。

#### 分支 B：方式 config 或 legacy 残留导致多余点被并入 `box.pickupLocations`

**Files:**
- 修改：`vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts`
  - `resolveBoxFulfilment`（L391-433）：仅在必要处收紧
  - `getEffectivePickupIdsForConfig`（L441-453）：确认 selected 分支
- 管理端无需改（勾选/回填已正确）。选择通过备份数据修复线上档案即可；确需硬编码兜底才动代码。

根因 B 通常**不是代码 bug**，而是数据：要么线上档案 `rangeMode='all'`，要么 legacy `pickupLocations` 残留。首选修复路径（无代码改动）：

- [ ] **Step 1: 数据层修复线上档案到 selected + 仅目标点**

在管理后台把问题档案的自提方式「自提点范围」由「同城全部」切为「**指定自提点**」，仅勾选目标点，保存；若 legacy 残留，通过该页重新指定后保存即可清空（保存时 `options.pickupLocationIds` 会落 selected 语义，legacy 关联如需清空则用 SQL 清理多余关联行，需先备份）。

```sql
-- 若确认 legacy 误残留需清空（先备份表）：
-- DELETE FROM shipping_profile__pickup_locations
--  WHERE "shippingProfileId" = <问题档案id>
--    AND "pickupLocationId" NOT IN ( <仅保留的A.id> );
```

- [ ] **Step 2: 仅当确认是 `getEffectivePickupIdsForConfig` 在 selected 下仍返回全量时才改代码**

复现报文若证实 `rangeMode==='selected'` 但返回全量，则定位为 `options.pickupLocationIds` 未被读取（如字段名/类型不一致）。此时按以下最小修正注入（不改变 `'all'` 语义）：

```ts
// shipping-profile.service.ts getEffectivePickupIdsForConfig 内 selected 分支
const ids: ID[] =
  (options.pickupLocationIds as (string | number)[] | undefined ?? []).map((v) => String(v));
if (ids.length === 0) return [];
const locs = await this.pickupLocationService.findByIds(ctx, ids);
return locs.filter((l) => l.type === type).map((l) => l.id);
```

> 该步只有在 Step 1 无法通过数据修复、且报文证实 selected 被忽略时才执行。改后重启 vendure（`pm2 restart`，仓库走 git pull）。

- [ ] **Step 3: 后端回归**——重新执行 Task 1 Step 3，确认该箱 `pickupLocations` 仅含 [A]。

- [ ] **Step 4: Commit**

```bash
git add packages/cjk-plugin/src/shipping/shipping-profile.service.ts
git commit -m "fix: honor selected rangeMode for pickup fulfilment (only if Step 2 applied)"
```

#### 分支 C：该方式 `methodConfig` 缺失，箱退化为 legacy（空或全量）

- [ ] **Step 1: 为缺失 config 的方式补 selected 语义（管理端重存）**

管理后台编辑该档案，重选「指定自提点」并保存，使 `methodConfigs` 落库。此即数据修复，通常无需改代码。

- [ ] **Step 2: 若重存不生效**，检查 `shipping-profile.service.ts` L410-417 的判定：`this.isPickupMode(cfg.mode)`/`isPickupCalculator(m.calculator.code)`。确认该方式的 `calcCode`/`code` 落在 `store-pickup / pickup-point / employee-pickup` 且 config 有 `mode`。缺则按下方兜底（仅在确认前后端判定不一致时）：

```ts
// 确保 isPickupMode 识别：mode ∈ ['pickup','store','point','employee'] 且 calculator 命中
private isPickupMode(mode?: string): boolean {
  return !!mode && ['pickup', 'store', 'point', 'employee'].includes(mode);
}
```

- [ ] **Step 3: 回归 + Commit**（复用本任务分支 B Step 3/4 流程，提交信息注明分支 C）

---

### Task 3: C 端前端回归构建 — 确认 cn 逐箱流无泄漏、无回归

**Files:**
- 只读确认：`nshop/layers/base/app/components/checkout/BoxPickupBlock.vue`（`filteredPickups`/`currentPickup`/`nearbyForBox` 均读 `box.pickupLocations`）
- 无需修改前端源码（除非 Task1 判定前端路径漏点——cn 流代码上已无泄漏）

- [ ] **Step 1: 断言渲染源正确**

在 `BoxPickupBlock.vue` 确认自提点渲染枚举只用 `filteredPickups(box)`（其内 `nearbyPickups(box.pickupLocations, ...)`），没有任何分支再查 `GqlGetPickupLocations` 全量。记录为「cn 流无前端泄漏」。

- [ ] **Step 2: 本地构建**

```bash
# nshop 目录
pnpm build
```

预期：构建成功，无类型/SSR 错误。

- [ ] **Step 3: 本地冒烟**——用 Playwright 手机视口打开结账页（控制台账单号含档案 P），确认自提箱候选仅 A。

---

### Task 4: 手机截图回归 — 实测「未勾选点不显示」

**硬性交付**：手机视口 390×844，dpr=2（=780×1688）。

- [ ] **Step 1: 准备对照组**
  - 档案 P 只用 **selected + [A]**。
  - 实测①：勾选 [A]→C 端仅见 A。
  - 实测②：把 A 取消勾选（→ selected + []）→ A 在 C 端消失（空候选提示）。
  - 实测③：勾选 [A,C]→C 端仅见 A、C（B/D 不出现）。

- [ ] **Step 2: 逐项截图**

用 Playwright 以视口 390×844, deviceScaleFactor=2 截图，留存以下路径：
`docs/verification/2026-09-16-pickup-control/01_only-A.png`、`02-uncheck-A-empty.png`、`03-only-AC.png`

- [ ] **Step 3: 管理端回归截图**

后台「指定自提点」编辑面板仍显示全部候选、且已勾选点正确回选——截图留存 `04-admin-selected-repick.png`。

- [ ] **Step 4: 把截图补充到操作手册**（项目既有操作手册文件，附到配送档案相关小节）。

- [ ] **Step 5: Commit**

```bash
git add docs/verification/2026-09-16-pickup-control/ 操作手册文件
git commit -m "docs: verify pickup control on C-end (selected-only list, uncheck hides point)"
```

---

### Task 5: 部署

**铁律**：本地构建，服务器只解压 / `pm2 restart`，绝不在服务器构建。

- [ ] **Step 1: 若改动了 vendure 后端（Task2 分支）**：改仓库 `git push` 后服务器 `git pull` + `pm2 restart`（按该仓库既有机制）。

- [ ] **Step 2: 若改动了 nshop 前端**：本地上一步已 `pnpm build`，用既有部署脚本推送产物：

```bash
# nshop 目录（沿用项目部署机制，勿手工 scp 可先查 scripts/deploy.mjs）
node scripts/deploy.mjs
```

- [ ] **Step 3: 线上冒烟**：C 端 + 管理端按 Task 4 Step 1 三项复测，确认线上同样受控。

---

## Self-Review

**Spec 覆盖：**
- 非目标（不改后端语义 `'all'`、不引入分权模型）— 保留，Task 2 仅当实证 confirmed 才动 selected 分支。
- 管理端保持现状、编辑回选 — 明确不改，Task 4 截图回归。
- 实测「取消勾选→点消失」 — Task 4 Step 1② 覆盖。
- 部署本地构建 — Task 5 覆盖。

**Placeholder 扫描：**
- Task 2 各分支均含具体命令/代码/SQL 或明确「首选数据修复、无代码改动」，无 "TBD/add error handling" 式占位。复现根因分支 B/C 均给出确定修复方式。

**类型一致性：**
- `rangeMode` / `pickupLocationIds` / `box.pickupLocations` / `filteredPickups` 命名与现存代码一致；后端字段 `methodConfigs`/`options` 与 `shipping-profile.service.ts` 对齐。