# 成员信息弹窗（点击用户名称查看用户信息）设计文档

**日期：** 2026-09-14
**状态：** 已批准（用户确认"按这个方案来"）
**范围：** 租户成员管理页 `https://e.joho.cn/guanli/#/pages/platform/members/index`

## 目标

在「本租户人员」列表中，点击成员行内的「显示姓名」弹出用户信息弹窗，完整展示成员资料，其中**登录用户名（邮箱）**是本次新增的关键信息——此前列表不展示该字段。

## 背景与现状

- 登录标识：系统以邮箱登录，登录用户名即 `Administrator.emailAddress`（添加人员时「邮箱必填（全局唯一）」）。
- `TenantMember` 实体**不存邮箱**，邮箱存在于 Vendure `Administrator` 实体；当前 `memberToView` 返回的视图字段不含 `emailAddress`。
- 列表行现有字段：`id / administratorId / channelId / enabled / displayName / remark / phone / roleIds / createdAt / canResetPassword`。
- 前端已有完整角色列表（`fetchMyTenantRoles`），可通过 `roleIds` 映射出角色名称，无需后端额外返回。
- 上次教训：改 GraphQL 返回字段必须同步更新 `src/plugin.ts` 中的 SDL（`TenantMember` 类型），否则启动时 schema 校验失败、服务崩溃。

## 设计决策

- **弹窗版式**：A 居中弹窗（与现有「添加人员/分配角色」弹层 `.mask`/`.pop` 视觉一致），用户已确认。
- **取数方式**：方案 1——列表查询直接补字段。`tenantMembers` 查询增加 `emailAddress`，前端点击姓名时零额外请求，直接使用列表已有数据。
- **弹窗内容**（完整信息卡）：显示姓名 + 状态徽标（启用/停用）、登录用户名（邮箱）、手机号、角色名称、备注、人员 ID、加入时间。
- **纯信息展示**：弹窗不含操作按钮；行内原有操作（角色/重置密码/移除/启停开关）保持不变。

## 后端改动（vendure cjk-plugin）

### 1. `memberToView` 增加 `emailAddress`

文件：`packages/cjk-plugin/src/tenant/tenant-member.service.ts`

- 视图对象增加 `emailAddress`，取 `Administrator.emailAddress`。
- 取数方式：按 `administratorId` 查一次 `Administrator`（租户成员规模小，N+1 可接受，不做批量优化）。
- 管理员不存在时 `emailAddress` 置 `null`。

### 2. SDL 同步（关键）

文件：`packages/cjk-plugin/src/plugin.ts`（`TenantMember` 类型块，约 676–688 行）

- `TenantMember` GraphQL 类型增加字段：`emailAddress: String`
- 该插件无独立 GraphQL 类型类文件，`memberToView` 返回普通对象，SDL 仅此一处需改。
- 构建后提交 lib 产物。

## 前端改动（vshop web-admin）

### 3. API 层

文件：`web-admin/src/apis/tenant-admin.ts`

- `TenantMemberItem` 类型增加 `emailAddress?: string | null`。
- `fetchMyTenantMembers` GraphQL 查询字段追加 `emailAddress`。

### 4. members 页

文件：`web-admin/src/pages/platform/members/index.vue`

- 姓名元素加 `@tap="showInfo(m)"`。
- 新增状态：`showInfo`（是否显示弹窗）、`infoTarget`（当前查看的成员）。
- 新增居中弹窗模板（复用 `.mask`/`.pop` 样式）：
  - 标题「用户信息」，右上 × 关闭，点遮罩关闭。
  - 内容：
    - 显示姓名 + 状态徽标（`enabled`：启用=绿色、停用=灰色，用页面既有色板）。
    - 登录用户名：`emailAddress`，缺失显示 —。
    - 手机号：`phone`，缺失显示 —。
    - 角色：`roleIds` → `roles` 列表映射 `description`，多个用「、」连接；映射不到回退显示角色 id。
    - 备注：`remark`，空显示 —。
    - 人员 ID：`administratorId`。
    - 加入时间：`createdAt` 格式化为 `YYYY-MM-DD HH:mm`（复用页面既有格式化方式）。

## 数据流

```
load() → fetchMyTenantMembers(含 emailAddress) + fetchMyTenantRoles
   → 点击姓名 → showInfo(m) → 弹窗渲染本地数据（零额外请求）
   → × / 遮罩 → 关闭
```

## 错误处理与边界

- `emailAddress` / `phone` / `remark` 缺失：显示 —。
- 角色映射不到：回退显示 roleId。
- 弹窗打开期间再次点击其他姓名：直接切换 `infoTarget` 内容。

## 测试与交付

1. 两端本地构建（vendure cjk-plugin、web-admin h5）。
2. 部署：
   - vendure：提交 src + lib → push → 服务器 `git pull + pm2 restart`（服务器不构建）。
   - web-admin：`node scripts/deploy.mjs`。
3. 手机视口回归（390×844，dpr=2）：点击「田经理」姓名 → 弹窗显示完整信息卡，登录用户名（邮箱）正确显示；点 × / 遮罩关闭。
4. 操作手册：`web-admin/src/static/manual/index.html` op-16 章节补一句「点击成员姓名可查看登录用户名（邮箱）等成员信息」，并附手机截图。
5. 提交规范：后端 src+lib 分开提交；前端源码、dist、手册截图分别提交；只暂存相关文件。

## 非目标（YAGNI）

- 不做独立详情接口（`myTenantMemberInfo(id)`）。
- 弹窗内不加操作按钮（分配角色/重置密码/移除仍走行内入口）。
- 不做头像、不做编辑功能。
