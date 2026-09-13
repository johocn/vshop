# 租户成员角色与密码管理优化 设计文档

> 日期：2026-09-13
> 仓库：vendure（cjk-plugin 后端）/ vshop（web-admin 前端）
> 关联页面：`https://e.joho.cn/guanli/#/pages/platform/members/index`

## 背景与问题

运营端「本租户人员」页面（`web-admin/src/pages/platform/members/index.vue`）存在四个问题：

1. **角色重复**：新增/分配人员时角色下拉出现重复项。根因：`myTenantRoles` 返回本 channel 关联的全部角色（本店本地角色 + 被引用的全局角色 `g-`），同名不同 id 时视觉重复，且未区分「可授/不可授」。
2. **缺少权限边界**：租户管理员可给其他人员赋予任意角色，包括比自己权限更高的角色（如把别人设为租户管理员），存在提权漏洞。
3. **缺少租户自助重置密码**：重置密码仅超管在租户详情页可用（`resetTenantAdministratorPassword`，默认口令 `you123123`），租户管理员不能重置本租户低权限成员的密码。
4. **修改密码不完整**：后端已有本人改密 `tenantChangeMyPassword`（`changeMyPassword`），但无旧密码校验、无主动改密入口（仅首登强改密时使用）。

## 目标

- 后端权威实现「严格小于」权限门禁，杜绝提权；
- 角色下拉去重，且只展示操作者可授的角色；
- 租户管理员可重置**低于其权限**的成员密码（默认口令 `you123123`）；
- 本人主动修改密码（校验旧密码），并保留首登强改密流程。

## 方案选型

选定 **方案 A：后端权威权限门禁 + 前端最小化**。

- 后端是权限边界的唯一权威：校验目标角色权限为操作者权限的「子集且不含管理权限」；前端只是视图，无法通过伪造请求绕过。
- 备选 B（仅前端过滤）可被绕过，属安全漏洞，不采纳；备选 C（按 code 前缀 hardcode 层级）无法覆盖自定义角色，不采纳。

## 权限模型

### 权限门禁「严格小于」（后端核心）

新增服务方法：

- `channelOperatorPerms(ctx): Set<string>`：计算当前登录者在本租户（`ctx.channelId`）全部角色的业务权限**并集**。剔除 `Authenticated` 与超管专属权限（`Permission.SuperAdmin` 走豁免分支，不参与集合）。
- `assertCanGrant(ctx, roleIds | role)`：目标角色的业务权限必须满足：
  1. `targetPerms ⊆ operatorPerms`（子集）；
  2. `targetPerms ∩ { TenantMemberManage, TenantRoleManage } = ∅`（不含人员/角色管理权限，防链式提权）。
  任一不满足即抛错 `PERMISSION_EXCEEDS_OPERATOR`。

接入点（均在调用处先过 `assertChannelMember`）：

| 操作 | 现有方法 | 新增校验 |
|---|---|---|
| 创建人员 | `createTenantAdministrator` | 创建前对 `input.roleIds` 执行 `assertCanGrant` |
| 改角色 | `updateTenantMemberRoles` → `syncMemberRolesInChannel` | 对目标 `roleIds` 执行 `assertCanGrant` |
| 重置密码（新增） | `resetMyMemberPassword` | 对目标成员的现有角色执行 `assertCanGrant` |

超管（`ctx.userHasPermissions([Permission.SuperAdmin])`）豁免全部门禁，行为不变。

### 角色去重（后端 `rolesForChannel`）

`rolesForChannel` 返回前按 `description || code` 去重：同一展示名只保留一条（本地角色优先于 `g-` 全局角色）。前端下拉再兜底一次按 `id` 去重。

### 租户自助重置密码（新增）

- Resolver：`myResetMemberPassword(memberId: ID): Boolean`，`@Allow(tenantMemberManagePermission.Permission)`，`assertChannelMember`。
- 服务：查 `TenantMember`（必须属于 `ctx.channelId`）；取其在本租户的角色权限，执行 `assertCanGrant`；调用 `administratorService.update` 重置为 `DEFAULT_ADMIN_PASSWORD`（`you123123`）；清除 `mustChangePassword` 标志。
- 前端：成员行显示「重置密码」入口（后端同时返回 `canResetPassword` 标记，前端据此显隐 + 二次确认弹窗）。

### 主动修改密码（本人）

- 后端 `changeMyPassword(ctx, oldPassword, newPassword)`：新增 `oldPassword` 参数，用 `AuthService.verifyUserPassword(ctx, userId, oldPassword)` 校验，失败抛 `WRONG_OLD_PASSWORD`；通过后更新密码并清除本租户关联的 `mustChangePassword` 标志。
  - **首登强改密兼容**：若该登录者在任一租户 `mustChangePassword === true` 或 `oldPassword` 为空，则跳过旧密码校验（保留现有 `tenantChangeMyPassword(newPassword)` 首登流程可用）。为支持双模式，Resolver 改为 `tenantChangeMyPassword(oldPassword: String = null, newPassword: String)`；service 内部按上述规则判定。
- 前端 `change-password` 页支持双模式：
  - **首登强改密**（现有流程）：仅新密码 + 确认，无旧密码框；
  - **主动改密**（新入口，成员列表头部/账号区进入）：旧密码 + 新密码 + 确认。
  - API `changeMyPassword` 增加 `oldPassword` 参数（首登模式传空）。

## 数据流

```
[成员列表 load]
  fetchMyTenantMembers → 含 canResetPassword（后端按权限计算）
  fetchMyTenantRoles   → 已去重

[创建/改角色]
  前端下拉 = 已去重角色，其中「可授」= 后端返回的 grantable 标记
  提交 roleIds → 后端 assertCanGrant（权威）→ 落库

[重置密码]
  点「重置密码」→ 确认弹窗 → myResetMemberPassword(memberId)
    → 后端校验同租户 + 低于自己 → 重置为 you123123 → 返回成功提示「已重置为默认口令 you123123」

[主动改密]
  账号区「修改密码」→ 旧密码+新密码+确认 → tenantChangeMyPassword(old,new)
    → 后端 verifyUserPassword 校验旧密码 → 更新 → 提示成功
```

## 错误处理

| 错误码 | 场景 | 前端提示 |
|---|---|---|
| `PERMISSION_EXCEEDS_OPERATOR` | 目标角色含操作者不具备或管理类权限 | 「所选角色超出你的授权范围」 |
| `WRONG_OLD_PASSWORD` | 主动改密旧密码错误 | 「原密码不正确」 |
| `MEMBER_NOT_FOUND` / `MEMBER_NOT_IN_CHANNEL` | 成员不存在或不在本租户 | 「成员不存在」 |

## 测试

- 后端单测（cjk-plugin）：`assertCanGrant` 子集/管理权限/超管豁免三个用例；`rolesForChannel` 去重；`resetMyMemberPassword` 同租户 + 权限门禁。
- 前端：构建通过 + Playwright 手机视口（390×844）截图：成员列表重置入口显隐、角色下拉去重与置灰、主动改密页。
- 回归：超管创建人员/改角色行为不变；首登强改密流程不变。

## 范围外

- 不新增「管理员代改他人生效密码」（已确认仅本人改自己密码）；
- 不改变默认口令（沿用 `you123123`）；
- 不改动角色管理页（`roles/index`）的创建/编辑权限逻辑（角色创建仍受 `BUSINESS_PERMISSIONS` 白名单约束，本设计只约束「授于人」）。
