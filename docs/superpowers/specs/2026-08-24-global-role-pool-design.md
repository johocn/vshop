# 全局角色池 + 引用到本店：设计文档

> **日期：** 2026-08-24（v1）

## 背景

租户详情页角色管理存在两个卡点：
1. **超管在租户页建的角色，该租户自家看不到**（根因：`roleService.findAll` 的 `activeUserCanReadRole` 按「超管角色所绑 channel」计算权限并集，超管只绑了 channel 1，故在其它 channel 读不到该租户任何角色）。读取链路已改用 `rolesForChannel` 直查修复。
2. **角色只有「租户单店」一种形态**，超管无法创建可被多家租户复用的通用角色；若要给 N 家租户配同一套角色，只能每家重复建。

## 目标与模型

引入**全局角色池**，对齐平台既有的「配送/支付方式方案池 · 引用到本店」模式：

1. **全局角色池**：超管创建的「全局角色」，`channels=[]`（在池中，未绑定任何店）。任何租户可在自家后台选「引用到本店」→ 该店被加进该角色的 channels，成为该租户可见、可用的角色。
2. **租户本地角色**：租户管理员在自家后台创建，`channels=[该店]`（现有行为，不变）。
3. **默认三角色**（tenant-admin / sales / stock）：仍按**每租户独立预置**（现有补种子逻辑，新建租户自动生成，不跨店共享）。

## 核心判定（关键技术约束）

**Vendure 原生 `Role` 实体无法支持 customField 区分**（已核实：`role.entity.ts` 无 `customFields` 属性，且不在内置 customFields 白名单内，配置会被忽略）。

因此改为**用 `Role.channels` 是否为空 判定全局/本地**：
- `channels=[]` → 全局角色（池中）
- `channels=[单一店]` → 租户本地角色
- 引用到本店 = 把店加入该角色 channels；取消引用 = 移除

该判定与 Vendure 授权模型天然一致（按 `role.channels` 是否含当前 ctx.channelId 授权），零新增字段、无 migration。

## 后端 API 变更（cjk-plugin）

### Service（tenant-member.service.ts）

新增方法：
- `createGlobalRoleDirect(ctx, input): Role` — 超管建全局角色，`channels=[]`。复用 `assertBusinessPermissions` 白名单校验；幂等（同一 code 全局唯一，不按店判定）。
- `createGlobalRoleWithChannels(ctx, channelIds[], input): Role[]` — 超管建全局角色并批量分发到多店：建 `channels=[]` 的角色 + 为每店建「该店引用」（或在该角色 channels 里直接放入多店）。**决策：批量分发 = 建一个全局角色并直接设置 `channels=[勾选的多店]`**，语义清晰（该角色已初引到这些店）。
- `referGlobalRoleToChannel(ctx, roleId, channelId)` — 租户/超管把全局角色引用到某店（把店加进 channels，幂等：已含则 no-op）。
- `unreferGlobalRoleFromChannel(ctx, roleId, channelId)` — 取消引用（移除该店）。
- `globalRoles(ctx): Role[]` — 查全部 `channels=[]` 值全局角色。

现有方法调整：
- `rolesForChannel(ctx, channelId)` 保持（返回该店所有角色，含「引用到本店的全局角色」+「本地角色」）。

### Resolver

- `tenant-admin.resolver.ts`：
  - `createGlobalRole(channelIds: [ID!]!, input)` @SuperAdmin → 批量分发建全局角色
  - `globalRoles` @SuperAdmin → 全局角色池列表
  - `referGlobalRoleToChannel(roleId, channelId)` @SuperAdmin
  - `unreferGlobalRoleFromChannel(roleId, channelId)` @SuperAdmin
- `tenant-member.resolver.ts`：
  - `myGlobalRolesAvailable` @Authenticated → 全局角色池（供租户自助「可引用」列表）
  - `myReferGlobalRole(roleId)` @TenantRoleManage → 引用到当前 ctx.channelId
  - `myUnreferGlobalRole(roleId)` @TenantRoleManage → 从当前店取消

### GraphQL SDL（plugin.ts）

```graphql
extend type Query {
  globalRoles: [Role!]!
  myGlobalRolesAvailable: [Role!]!
}
extend type Mutation {
  createGlobalRole(channelIds: [ID!]!, input: CreateTenantRoleInput!): [Role!]!
  referGlobalRoleToChannel(roleId: ID!, channelId: ID!): Boolean!
  unreferGlobalRoleFromChannel(roleId: ID!, channelId: ID!): Boolean!
  myReferGlobalRole(roleId: ID!): Boolean!
  myUnreferGlobalRole(roleId: ID!): Boolean!
}
```

## 前端变更（vshop web-admin）

### roles/index.vue（超管路径，`channelId` 有值）

- 顶部新增 Tab：「本店角色」/「全局角色池」。
  - 本店角色：现有列表（`fetchTenantRoles` → `rolesForChannel`），含本地 + 已引用全局。
  - 全局角色池：`fetchGlobalRoles`；每项显示 role + 已引用店数；操作「分发到店」（勾选租户批量引用，调 `createGlobalRole` 或 `referGlobalRoleToChannel`）「取消引用」。
- 新建按钮拆「新建本店角色」/「新建全局角色」；全局新建带「分发到哪些租户」多选。

### 前端 API（tenant-admin.ts）

```ts
export async function fetchGlobalRoles(): Promise<RoleItem[]>
export async function createGlobalRole(channelIds: string[], input): Promise<RoleItem[]>
export async function referGlobalRoleToChannel(roleId, channelId): Promise<void>
export async function unreferGlobalRoleFromChannel(roleId, channelId): Promise<void>
export async function fetchMyGlobalRolesAvailable(): Promise<RoleItem[]>
export async function myReferGlobalRole(roleId): Promise<void>
export async function myUnreferGlobalRole(roleId): Promise<void>
```

### 租户自助角色页（无 channelId 的 myTenantRoles 场景）

- 新增「可引用角色」区块：列表来自 `myGlobalRolesAvailable`，每项「引用到本店」/「取消引用」按钮。

## 权限与安全

- 全局角色创建/分发：@SuperAdmin。
- 租户引用/取消：@TenantRoleManage + `assertChannelMember`，且只操作本店与全局池（不触碰他店本地角色）。
- 全局角色不带超管私权；权限仍走 `assertBusinessPermissions` 白名单（业务权限目录）。

## 验证要点

1. 超管建全局角色（不分发）→ 出现在 `globalRoles`，任何店看不到。
2. 租户 A「引用到本店」→ 租户 A 的角色列表出现该角色、能分配给人员；租户 B 不显示。
3. 超管建全局角色并分发到 A、B 两家 → A、B 都可见。
4. 取消引用 → 从该店角色列表消失；已绑定该角色的人员不因引用角色删除而受影响（取消引用是解除 channels 关联，非删角色）。
5. 幂等：重复引用/分发不产生重复关联。

## 涉及文件

- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`
- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`
- `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`
- `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`
- `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`
- （租户自助角色页，若与 roles/index.vue 复用则一并改）