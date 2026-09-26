# 遗留缺口核查与修复方案（vendure + web-admin）

- 日期：2026-09-27
- 状态：**仅核查与评估落档，本轮未改任何代码**（用户明确选择「只出方案文档，暂不改码」）
- 适用仓库：`d:\zhao\vendure`（后端 `packages/cjk-plugin`）、`d:\zhao\vshop\web-admin`（前端）
- 承接批次：D41 ~ D46（均已修复并部署，证据见修复手册 20.10 ~ 20.15）

## 1. 核查范围与方法

| 维度 | 方法 | 命令/手段 |
| --- | --- | --- |
| 键错位同型 | 全仓检索 `activeUserId` / `session.user.id` / `administratorId` 的配对用法 | Grep 后逐点读调用链确认「谁是谁的 id」 |
| 分页硬顶同型 | 全仓检索 `Math.min(100` / `clampPageSize` | Grep + 读 service 方法，核对前端调用方语义 |
| 租户 403 同型 | 检索 `@Allow(InventoryPermissions.ViewStock` 单权限标注 | 与 `cjk-plugin/src/tenant/tenant-member.service.ts` 的租户权限白名单比对 |
| 未完成功能 | 检索 `TODO` / `FIXME` / `HACK` | 两个仓库源码（排除 `lib/` 构建产物） |
| i18n 一致性 | 脚本比对两份语言包的扁平化键集合与空值 | 见 §4 |
| e2e 覆盖 | 列出 `_e2e/_verify_*.py` 与 `src/pages/**` 对应关系 | Glob + 读脚本头部注释 |

## 2. 结论一览

| # | 缺口 | 位置 | 级别 | 性质 |
| --- | --- | --- | --- | --- |
| G1 | 同型键错位 → 首登强改密 / 停用灰态失效 | `cjk-plugin/src/tenant/my-access.resolver.ts:52` | 高 | 可用性缺陷（潜在锁死） |
| G2 | 同型键错位 → 拣货批次「创建人」恒为空 | `cjk-plugin/src/picking/pick-batch.admin.resolver.ts:133-146` | 中 | 数据留痕缺失 |
| G3 | 同类 pageSize 硬顶 100 → KPI 静默低估（3 处） | `dashboard/index.vue:201,226` + `pick-batch.service.ts:74,500` + `stocktake.service.ts:144` | 中 | 容量天花板型静默缺陷 |
| G4 | `setVariantBindings` 仅 `ViewStock` → 租户 403 同类 | `cjk-plugin/src/inventory/inventory-admin.resolver.ts:18` | 低 | 潜在同型（前端暂未调用） |
| G5 | 邀请码只落库不生效（奖励发放 / 有效性校验未实现） | `cjk-plugin/src/auth/invite-code.service.ts:17,33` | 低 | 未完成功能（需求待定） |

## 3. 逐项详情

### G1 · 同型键错位：首登强改密与停用灰态双双失效（高）

**证据**

- `my-access.resolver.ts:52`：
  ```ts
  const memberRows = await memberRepo.find({ where: { administratorId: String(user?.id ?? '') } });
  ```
  此处 `user` 取自 `ctx.session.user`，其 `id` 是 **`User.id`**；而 `TenantMember.administratorId` 存的是 **`Administrator.id`**（生产实证：`administrator.id = 53` / `administrator.userId = 15`，`tenant_member.administratorId = '53'`）。
- 该查询恒不匹配 → `memberRows` 恒空 → `memberByChannel` 为空 Map → `my-access.resolver.ts:67-68` 的兜底分支生效：
  ```ts
  memberEnabled: isSuperAdmin ? true : (member ? member.enabled : true),
  mustChangePassword: isSuperAdmin ? false : (member ? member.mustChangePassword === true : false),
  ```
  即 **`memberEnabled` 恒 `true`、`mustChangePassword` 恒 `false`**（`my-access.resolver.ts:93` 的聚合值随之恒 `false`）。

**影响链（为什么级别为高）**

1. 前端消费点：[authStore.ts:29](file:///d:/zhao/vshop/web-admin/src/stores/authStore.ts#L29) 的 `mustChangePassword` getter、[login/index.vue:46](file:///d:/zhao/vshop/web-admin/src/pages/login/index.vue#L46) 的「登录后跳改密页」判断、[authStore.ts:51-54](file:///d:/zhao/vshop/web-admin/src/stores/authStore.ts#L51-L54) 的「停用人员不展示」过滤，全部依赖这两个字段。
2. D45 已修复 `tenant-enabled.guard.ts:46-54`（改为经 `Administrator.userId` 换键），**守卫侧已能正确识别** `mustChangePassword === true` 并拒绝除 `tenantChangeMyPassword` / `myTenantAccess` / `me` / `logout` / `activeChannel` 之外的**全部** admin 请求（`tenant-enabled.guard.ts:60-72`）。
3. 两者叠加的结果：成员被守卫 403 掉几乎所有接口，但前端读到的 `mustChangePassword` 是 `false` → **不会跳转改密页**，用户看到的是一个「到处报错、无从下手」的界面。
4. 触发条件不罕见：`tenant-member.service.ts:813` `const mustChangePassword = input.forcePasswordChange === true || generated;` —— **新建租户成员时密码自动生成（`generated`）即置 `true`**。
5. 现状核对：生产 t2 的 member 48 当前 `mustChangePassword = f`，**故当下无账号被实际锁死**；属**潜伏缺陷**，下一次「新建成员 → 用初始密码登录」即会命中。

**修复方案（建议，未实施）**

- 抽一个共享 helper（建议位置：`cjk-plugin/src/tenant/tenant-member.service.ts` 导出，或新增 `tenant/resolve-tenant-member.ts`）：
  ```ts
  /** User.id → Administrator → TenantMember（键错位的唯一正确换法，D45 同源） */
  async function resolveMemberOf(ctx, userId, channelId): Promise<TenantMember | null>
  ```
  内部实现对齐 `tenant-member.service.ts:841-848` 的 canonical 写法（`administratorService.findOneByUserId(ctx, activeUserId)` → 以 `admin.id` 查 `TenantMember`，并**按渠道收口** `channelId = tenantOf(ctx)`）。
- 三处调用点统一改走该 helper：`my-access.resolver.ts:52`、`pick-batch.admin.resolver.ts:136`、以及 D45 已改的 `tenant-enabled.guard.ts:46-54`（收敛为同一实现，避免今后再次分叉）。
- 顺带消除 `my-access.resolver.ts:52` 另一个隐患：当前查询**未按渠道收口**，同一管理员在多个租户都有 member 记录时，`memberByChannel` 会同时收进多行（该 Map 按 channelId 分组，行为尚可，但语义应显式按渠道查）。

**验收口径**

- 新增 `_e2e/_verify_d47_tenant_member_key.py`：造一个 `mustChangePassword=true` 的成员（或直接改库置位），断言
  A. `myTenantAccess.mustChangePassword === true`（修复前必为 `false`）；
  B. 登录后前端**跳转到改密页**；
  C. 未改密前调用其它 admin 查询返回 `FORBIDDEN`（守卫既有行为不回归）；
  D. 改密后 `mustChangePassword` 变 `false` 且接口恢复；
  E. 停用成员（`enabled=false`）不再出现在前端租户列表（`memberEnabled=false`）；
  F. 手机视口截图（390×844 @dpr2）。
- 修复前/后各跑一次，作为两态取证。

### G2 · 同型键错位：拣货批次「创建人」恒为空（中）

**证据**

- `pick-batch.admin.resolver.ts:50`：`const createdBy = await this.currentOperator(ctx);`，仅在 `createPickBatch` 一处调用。
- `pick-batch.admin.resolver.ts:133-146`：
  ```ts
  const userId = ctx.activeUserId;                       // User.id
  const member = await ...findOne({ where: { administratorId: String(userId) } });  // 恒空
  if (member?.displayName) return member.displayName;
  const admin = await ...findOne({ where: { id: userId } });                         // 也是恒空
  ```
  回退分支用 `User.id` 去匹配 `Administrator.id`，同样恒不匹配 → 函数**恒返回 `null`**。
- 落库与展示链：`pick-batch.service.ts:158,177` 接收 `createdBy` 并写入；`pick-batch.service.ts:463` 在 detail 中回传；前端 [batch.vue:11](file:///d:/zhao/vshop/web-admin/src/pages/order/picking/batch.vue#L11) 显示 `batch.createdBy || '—'`、[PickBatchCard.vue:14](file:///d:/zhao/vshop/web-admin/src/components/picking/PickBatchCard.vue#L14) 仅在非空时渲染。
- 结论：**租户账号创建的拣货批次，「创建人」永远为空**（显示「—」或整行不显示）。

**修复方案（建议，未实施）**

- 复用 G1 的共享 helper，改 `currentOperator()` 两步为一步：helper 取 member → 无 member 时再用 helper 内部的 `Administrator` 实例取姓名（`firstName + lastName`）。
- 查询按渠道收口（与 `pick-batch` 的其它方法同口径）。

**验收口径**

- 扩展 `_e2e/_verify_picking_console.py`（或新增 D47 脚本第二段）：租户账号调 `createPickBatch` 后，断言 `detail.createdBy` 非空且等于该账号在前端「我的」资料里的显示名；UI 上批次卡片/详情「创建人」有值；手机视口截图。

### G3 · 同类 pageSize 硬顶 100：KPI 静默低估（中）

**证据（服务端硬顶共 3 处）**

| 位置 | 方法 | 硬顶 |
| --- | --- | --- |
| `stock-doc.service.ts:100`（`clampPageSize`） | `listDocs` | `Math.min(100, n)` —— **D46 已解决**（新增 `stockDocOperatorStats` 聚合） |
| `pick-batch.service.ts:74` | `listBatches` | `Math.min(100, Math.max(1, pageSize ?? 20))` |
| `pick-batch.service.ts:500` | `candidates` | 同上 |
| `stocktake.service.ts:144` | `listTasks` | `Math.min(pageSize, 100)` |

**证据（前端调用方：取最近 100 条 + 客户端窗口过滤）**

- [dashboard/index.vue:201-202](file:///d:/zhao/vshop/web-admin/src/pages/data/dashboard/index.vue#L201-L202)：`fetchPickBatches({ pageSize: 100 })` → `countBatches(batches.items, w)`，「拣货单数」KPI 在窗口内批次数 > 100 时**系统性低估**。
- [dashboard/index.vue:226-236](file:///d:/zhao/vshop/web-admin/src/pages/data/dashboard/index.vue#L226-L236)：`fetchStocktakeTasks({ pageSize: 100 })` → 「盘库次数」KPI、差异率、差异趋势条**三项同源**，任务数 > 100 时同时低估/失真。
- 对照：同页 ②「发货件数」已按 `take/skip` 正确分页累加（上限 10 页 = 1000 单，属显式上限）；⑤「作业员明细」已于 D46 改走服务端聚合。

**性质**：与 D46 完全同型——**容量天花板型静默缺陷**（不报错，只是少算），按 `createdAt DESC`/`id DESC` 截掉的都是**较老**记录。

**修复方案（建议，未实施；对应 D46 评估中的「方案 C」）**

按数据源分两条路径，取改动最小者：

1. **拣货单数**：`listBatches` 增加 `from` / `to` 参数（服务端按 `createdAt` 过滤）+ 新增聚合查询（或让前端按 `take/skip` 累加，但由于无稳定时间区间仍会漂移，**推荐服务端聚合**）。
2. **盘库次数 / 差异率 / 差异趋势**：`listTasks` 增加 `from` / `to`（服务端过滤）；差异率与趋势仍逐任务取 `stocktakeDiff`，**但「哪些任务在窗口内」这一步必须由服务端判定**，否则窗口内任务 > 100 时仍会漏掉较老任务。
3. 前端把 `w.start/w.end` 下推（注意 `stock_doc.createdAt` 为无时区 timestamp 且按北京时间落库，日期区间必须绑定 `Date` 实例——19 章同款口径）。

**验收口径**

- 扩展 `_e2e/_verify_d46_ops_counter_window.py` 为「作业分析三 KPI」通用脚本：向 t2 造 > 100 条可逆 fixture（批次 / 盘点任务），断言修复前 KPI 被截断、修复后等于全量；含手机视口截图与 fixture 清理。

### G4 · 租户 403 同类：`setVariantBindings` 仅 `ViewStock`（低）

- `inventory-admin.resolver.ts:17-18`：`@Allow(InventoryPermissions.ViewStock as Permission)`。
- 与 D41（`stockLevels`）/ D42（`setVariantStock`）同类：`ViewStock` 是 inventory-plugin 的**超管语义全局库存权限**，不在 `tenant-member.service.ts` 的租户白名单内 → 租户账号调用必 403。
- 现状：前端 `src/apis/` 内**未见直接调用**（仅线上手册 `src/static/manual/index.html:616` 提及该 mutation），故当前无用户可见故障。
- 建议：**暂不处理**；若后续要开放「变体 × 物理仓绑定」给租户，须同 D42 一样改走租户级 mutation，而非放宽 `@Allow`。

### G5 · 邀请码只落库不生效（低，需求待定）

- `invite-code.service.ts:17`：`/** 本次仅框架:存 inviteCode 到 Customer.customFields,记日志。奖励发放 TODO */`
- `invite-code.service.ts:33`：`// TODO: 后续对接 Strapi 校验邀请码有效性`
- 即：邀请码**不校验有效性**（任意码可通过）、**不发奖励**。属未完成功能，需产品需求确认后再做，本次仅留档。

## 4. 已核实无缺口（正向结论）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| i18n 键一致性 | `zh-Hans.json` 与 `en.json` 各 **2422** 键，**无单侧缺失、无空值** | 扁平化键集合比对脚本，`zh-only 0 / en-only 0 / zh empty 0 / en empty 0` |
| TODO 残留 | 两仓库源码仅邀请码 2 处 TODO（即 G5）；`inventory-plugin` 无 | Grep `TODO\|FIXME\|HACK\|XXX`（排除 `lib/`） |
| D41~D46 回归守护 | 每项均有对应 `_e2e/_verify_d*.py` 两态/三态脚本 | `_e2e/` 目录 Glob |
| 单据中心分页 | 走 `page/skip` 正常分页，非「取最近 N 条」语义 | `src/apis/stock-doc.ts` + `pages/inventory/stock-doc/index.vue` |

## 5. 建议修复顺序与批次划分

| 批次 | 内容 | 理由 | 链路 |
| --- | --- | --- | --- |
| **D47**（推荐先做） | G1 + G2：抽共享 helper 收敛全部「User.id → Administrator.id → TenantMember」换键（含 D45 已改的守卫） | 可用性风险最高（潜在锁死 + 数据留痕缺失），且三处是**同一个** helper，一次收敛杜绝再分叉 | 后端 build → push → 服务器 `git pull --ff-only` + `pm2 restart vendure`；前端仅加 e2e |
| **D48** | G3：作业分析三 KPI 的时间区间下推 + 服务端聚合 | 数据准确性问题，口径与 D46 同源，可复用 D46 的验收脚本骨架 | 后端 build/push/restart + 前端 `build:h5` → `scripts/deploy.mjs` |
| 暂不做 | G4（前端未调用）、G5（需求待定） | 无用户可见影响 | — |

**共同硬规范**：本地构建（服务器只 pull + restart，绝不在服务器构建）；每项必须有手机视口（390×844 @dpr2）截图与 e2e 回归；落档到修复手册（按 D41~D46 体例新增章节并列两态证据）。

## 6. 未纳入范围

- 老页面 e2e 覆盖：`src/pages/` 下多数页面无断言型 e2e（仅有 `_shot_*` / `_probe_*` 取证脚本）。属长期债，不属本轮缺口。
- `pick-batch.service.ts:497-500` 的 `candidates` 硬顶：用于「可加入批次的订单候选」，属交互式列表（用户可见分页），**不是** KPI 取数，暂不按截断缺陷处理。
