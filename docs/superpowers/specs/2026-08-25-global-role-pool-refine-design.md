# 全局角色池迭代：范围三选 + g- 前缀 + 池状态标注

> **日期：** 2026-08-25（v2，迭代自 2026-08-24-global-role-pool-design.md）
> **关联文档：** [2026-08-24-global-role-pool-design.md](./2026-08-24-global-role-pool-design.md)

## 背景

角色管理页（`vshop/web-admin/src/pages/platform/roles/index.vue`）上线后，用户反馈四个问题：

1. **渠道 7 本地角色池显示超管角色**：从租户详情进入角色页时，`onLoad` 误读 `q?.id`（应为 `q?.channelId`），导致 `channelId` 为空，走 `fetchMyTenantRoles()` 返回超管在激活渠道（ch1）的角色。
2. **全局角色池无数据**：默认三角色（租户管理员/销售/库存）按每租户独立副本（`t{n}-tenant-admin` 等）预置，`channels` 均非空；而 `globalRoles` 只返回 `channels=[]` 的角色，故池为空。
3. **超管新建角色无范围选择**：新建靠 Tab 位置区分（全局 Tab=全局，本店 Tab=本店），语义模糊。
4. **引用到本店未测试**；"立即分发到租户"已验证可用，但后续多店分发存在隐藏 bug（见「数据重复处理」）。

## 决策汇总（已与用户确认）

| # | 决策 | 内容 |
|---|------|------|
| 1 | 默认三角色纳入全局池 | **模板 + 独立副本**：池里展示 3 个模板（不落库为 Role），租户"导入到本店"时复制出本店独立副本（`t{n}-xxx`），各租户权限互不影响 |
| 2 | 超管新建范围三选 | **本店 / 全局可用 / 全局默认**（默认跟随当前 Tab 的对应语义） |
| 3 | 全局角色持久标识 | **`g-` code 前缀**（Vendure Role 无 customFields，用前缀区分全局/本地） |
| 4 | 池状态标注 | 全局池对每个角色标注各租户「已入本地 / 可引用」，支持继续分发与取消引用 |

## 角色模型（g- 前缀标识）

| 角色 | 存储 code | channels | 出现在 |
|------|----------|----------|--------|
| 全局可用角色 | `g-{输入code}`（自动加前缀） | `[]` | 全局池，任何租户可自助引用 |
| 全局默认角色 | `g-{输入code}`（自动加前缀） | `[勾选租户]` | 全局池（标注已入本地）+ 各目标租户本店角色列表 |
| 租户本地角色 | 任意（`t1-kefu` 等） | `[单店]` | 仅该店 |
| 默认三角色副本 | `t{n}-tenant-admin / sales / stock` | `[单店]` | 各租户本店角色列表（模板导入产物） |

**判定规则（替代原"channels 是否为空"）：**
- `code` 以 `g-` 开头 → 超管全局角色，无论 channels 是否为空都属全局池，可继续分发/取消引用
- `code` 非 `g-` 开头 → 租户本地角色（含默认三角色副本），不进池

**旧数据不迁移**：线上已存在的无前缀测试全局角色保留原样（在目标租户列表仍可用），从新规则起用新建入口创建。

## 后端变更（cjk-plugin）

### tenant-member.service.ts

1. **`createGlobalRoleWithChannels`**（改造）：code 自动加 `g-` 前缀（输入 `kefu` → 存 `g-kefu`）；`channelIds` 为空 → `channels=[]`（全局可用），非空 → `channels=[勾选店]`（全局默认）。幂等：同 `g-` code 已存在则仅追加缺失店。**范围三选由前端传 `channelIds` 表达，后端统一收敛到本方法。**
2. **`createGlobalRoleDirect`**：并入上述改造，或保留供无分发场景；建议统一走 `createGlobalRoleWithChannels`（空数组即全局可用）。
3. **`globalRoles(ctx)`**（改造）：改为查 `code LIKE 'g-%'` 且**含 channels 关系返回**（不再过滤 channels 是否为空），返回结构含 `channels: [{ id }]` 供前端标状态。
4. **`referGlobalRoleToChannel`**（修复幂等 bug）：去掉 `(role.channels || []).length === 0` 限制，仅保留 `!curIds.includes(chId)` 去重 → 超管可向已绑店角色继续追加分发（多店分发不再失败）。
5. **`unreferGlobalRoleFromChannel`**：保持（移除该店；channels 变空则角色回到池的可引用状态）。
6. **`myReferGlobalRole`**（租户自助）：新增安全校验——仅允许引用 `channels=[]` 的 `g-` 角色（防止租户引用已被他店绑定的角色）。
7. **`globalRoleTemplates`**（新增 query 方法）：返回 `OFFICIAL_ROLE_TEMPLATES` 元数据（key/busiPrefix/description/permissions），不落库。
8. **`myImportDefaultRoles`**（新增）：租户自助导入模板副本，内部调用 `importDefaultRoles(ctx, ctx.channelId)`（幂等，复用）。

### tenant-admin.resolver.ts（超管）

- `globalRoles`：改用新查询（返回 g- 角色含 channels）
- `createGlobalRole(channelIds, input)`：保持签名，内部走改造后的 `createGlobalRoleWithChannels`
- `referGlobalRoleToChannel` / `unreferGlobalRoleFromChannel`：保持，引用不再受空 channels 限制
- 新增 `globalRoleTemplates` query @SuperAdmin

### tenant-member.resolver.ts（租户自助）

- 新增 `myImportDefaultRoles` mutation @TenantRoleManage
- `myGlobalRolesAvailable`：返回 `channels=[]` 的 g- 角色（可引用列表）
- `myReferGlobalRole`：增加"仅引用空 channels 的 g- 角色"校验

### plugin.ts（GraphQL SDL）

```graphql
type RoleTemplate {
  key: String!
  busiPrefix: String!
  description: String!
  permissions: [String!]!
}
extend type Query {
  globalRoles: [Role!]!          # 现返回 g- 前缀角色，含 channels 关系
  globalRoleTemplates: [RoleTemplate!]!
  myGlobalRolesAvailable: [Role!]!
}
extend type Mutation {
  myImportDefaultRoles: [Role!]!
}
```

（`RoleTemplate` 结构对齐 `OFFICIAL_ROLE_TEMPLATES` 的 `RoleTemplate` 接口：`key/busiPrefix/description/permissions`。）

## 前端变更（vshop web-admin）

### apis/tenant-admin.ts

- `RoleItem` 增加 `channels?: { id: string }[]`；`globalRoles` query 请求 `channels { id }`
- 新增 `fetchGlobalRoleTemplates()` → `globalRoleTemplates`
- 新增 `myImportDefaultRoles()`
- `createGlobalRole(channelIds, input)` 保持签名（channelIds 空=全局可用，非空=全局默认）

### pages/platform/roles/index.vue

1. **修复渠道7 bug**：`onLoad` 中 `channelId.value = q?.channelId || ''`（原 `q?.id`）
2. **全局角色池 Tab（超管）**：
   - **默认角色模板区**：渲染 `globalRoleTemplates` 3 张模板卡，超管点"导入到本店"→ 弹租户多选 → 逐个调 `importTenantDefaultRoles(channelId)`（复用现有）
   - **全局可用角色区**：渲染 `globalRoles`（g- 角色），卡片显示已引用租户数；点"管理租户"→ 弹层列出所有租户，每个标注状态：
     - **已入本地**（绿）：该角色 channels 含此租户 → 可点取消引用（`unreferGlobalRoleFromChannel`）
     - **可引用**（灰）：未引用 → 可点分发（`referGlobalRoleToChannel`）
   - 状态实时反映 channels，分发/取消在同一弹层完成
3. **新建角色弹层（超管）**：加**范围三选**（本店 / 全局可用 / 全局默认），**默认值跟随当前 Tab**：
   - 本店 Tab 打开 → 默认选「本店」
   - 全局 Tab 打开 → 默认选「全局可用」（不勾选租户）
   - 选「本店」→ `createTenantRole(channelId, input)`（无前缀 code）
   - 选「全局可用」→ `createGlobalRole([], input)`（`g-` 前缀，channels=[]）
   - 选「全局默认」→ `createGlobalRole(channelIds, input)`（`g-` 前缀，channels=[勾选店]），**必选至少一家租户**，否则提示
4. **本店角色 Tab**：本地角色列表（`fetchTenantRoles` → `rolesForChannel`）保持；「从全局角色池引用到本店」区块对超管显示 g- 角色的可引用项
5. **租户自助角色页**（无 channelId）：
   - 「可引用角色」区块（`myGlobalRolesAvailable`）→ 引用到本店
   - 「导入默认角色」按钮 → `myImportDefaultRoles`（模板副本）
   - 模板副本创建后出现在本店角色列表

## 数据重复处理（统一幂等规则）

所有往角色 `channels` 加店的路径（创建时勾选、后续分发、租户引用）**统一收敛到 `referGlobalRoleToChannel` 的幂等核心**：`curIds.includes(chId)` 则 no-op，绝不重复关联同一店。消除场景：

- 同一租户经「全局默认创建」与「后续分发到租户」重复添加 → no-op
- 超管从池分发到多店 → 逐个 refer，各店只入一次（修复原 length===0 失败）
- 重复分发/引用 → 不产生重复 channels 关联

## 权限与安全

- 全局角色创建/分发/取消引用/查询：@SuperAdmin
- 模板导入（超管）：@SuperAdmin；租户自助导入：@TenantRoleManage + `assertChannelMember`
- 租户自助引用：@TenantRoleManage + 仅可引用 `channels=[]` 的 g- 角色
- 全局角色权限仍走 `assertBusinessPermissions` 白名单（业务权限目录），不含超管专属权限

## 验证要点（agent-browser 线上验证）

1. 渠道 7 本地角色池：只显示该店角色（本地 + 已引用），不含超管系统角色
2. 全局池默认模板区：显示租户管理员/销售/库存 3 模板；超管导入到某店 → 该店出现 `t{n}-*` 副本；重复导入幂等
3. 超管建全局可用角色（不勾选）→ 池出现 `g-` 角色，任何租户不可见
4. 超管建全局默认角色（勾选 A、B）→ A、B 本店列表出现该角色；池标注 A、B 已入本地，其余可引用
5. 超管从池分发已绑角色到 C → C 本店列表出现；再分发 C → 不重复
6. 租户管理员自助登录：从池引用可引用角色 + 导入默认模板 → 本店列表出现、人员可绑定
7. 租户自助取消引用 → 该角色从本店列表消失，回池可引用状态

## 涉及文件

- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`
- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`
- `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`
- `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`
- `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`
