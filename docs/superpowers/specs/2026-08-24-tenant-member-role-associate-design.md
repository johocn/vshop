# 租户 × 人员 × 角色：关联模型与交互重设计（方案 A）

- 日期：2026-08-24
- 状态：已评审通过，待实现
- 关联文档：`2026-08-24-tenant-role-member-fixes-design.md`（上一轮修复，已上线）

## 1. 背景与目标

平台超管在租户详情页 `e.joho.cn/guanli/#/pages/platform/tenants/detail?id=7&name=新生` 管理入驻商户，暴露四类问题：

1. **新建角色在角色列表不显示**（确定性 Bug）
2. **添加人员要"重建"**：`Administrator` 邮箱全局唯一、只能新建不能关联已有账号
3. **角色绑定整体替换**，跨店任职会清掉其它租户的角色，被迫逐店重建
4. 租户详情页信息量过低，仅有"管理员/角色"两组

本设计聚焦**人员 × 租户 × 角色的关联模型与交互**（实现优先级最高），档案字段的扩展单列后续阶段。

## 2. 当前模型与根因

- `Administrator`（Vendure 原生，全局唯一，邮箱唯一）
- `TenantMember`：`administratorId × channelId × enabled × mustChangePassword × displayName × remark × phone` —— 会员归属
- `Role`（Vendure 原生）：`code / description / permissions[] / channels[]` —— 角色归属某租户
- 人员在某租户的有效角色 = `Administrator.user.roles ∩ Role.channels = 该租户`

### 根因

- **没有"关联已有账号"路径**：`createTenantAdministrator` 只 `administratorService.create`（新建），邮箱冲突则失败 → 换店被迫"重建"
- **角色绑定是整体替换**：`updateTenantMemberRoles` 调 `administratorService.update({ roleIds })`，会清掉该账号在其它租户的角色 → 跨店任职要重建
- **前端刷新时机错误**：`tenants/detail.vue` 用 `onLoad` 而非 `onShow`，返回不刷新；角色 Tab 与角色管理页是两套数据源

## 3. 目标模型（方案 A）

不改 Vendure 原生 `Administrator`/`Role`，在既有架构内收敛：

- **角色本体**：`Role`（原生），`channelIds` 表达归属，**唯一来源**
- **会员归属**：`TenantMember`（现有表，不改结构）
- **多店任职**：靠 `Administrator.user.roles` 多对多 + `Role.channels` 原生支持，一个账号可同时属于多租户

**不新增"成员-角色"直连表** —— Vendure 原生 `user.roles` 本就是成员×角色联结，且多租户可由 `Role.channels` 表达。

## 4. 后端改动

### 4.1 新增「关联已有账号」

**查询**：`tenantSearchAdmins(channelId, keyword)` / `mySearchAdmins(keyword)`
- 超管路径显式传 `channelId`；租户自助从 session 取 `ctx.channelId`
- 按邮箱（可扩展手机/姓名）模糊检索平台已有 `Administrator`
- 返回：`id / emailAddress / displayName / 已任职租户列表`（挂到 tenantAdmin.resolver 与 tenantMember.resolver 双入口）

**绑定**：`tenantLinkMember(channelId, input)` / `myLinkMember(input)`
- `input: { administratorId | emailAddress, roleIds, enabled?, displayName?, phone?, remark? }`
- 校验：账号存在；`roleIds` 全部属本租户（`assertRolesInChannel`）；**未重复绑定**（`TenantMember` 已存在该 `administratorId×channelId` → 抛 `ALREADY_IN_CHANNEL`，提示去改角色）
- 创建 `TenantMember`（`mustChangePassword=false`，复用原账号）
- 绑定角色用新的合并语义（见 4.2）

### 4.2 角色绑定改为「合并」语义

新增 `syncMemberRolesInChannel(ctx, adminId, channelId, roleIds)`：
- 读取该 `Administrator.user.roles`
- 保留**属于其它 channel** 的角色不变
- 仅替换**本 channel** 的角色为 `roleIds`
- 最终角色集合写回 `administratorService.update({ id, roleIds })`

替换原 `updateTenantMemberRoles` 的整体替换逻辑，`memberRoleIdsInChannel` 各自保留。

### 4.3 更新既有创建逻辑

`createTenantAdministrator`（新建模式）：绑定角色也走 `syncMemberRolesInChannel` 合并语义，避免新建时误清其它店角色。

## 5. 前端改动

### 5.1 详情页刷新修复

- `tenants/detail.vue`：`onLoad` → `onShow`，从 roles/index 返回自动刷新管理员/角色
- "角色 Tab"与 `/pages/platform/roles/index` 收敛为同一数据源；角色多选读取刷新后的 `roles`

### 5.2 添加人员两种模式

- 「添加人员」弹层新增**模式切换**：`新建账号` / `关联已有`
- 关联模式：搜索邮箱 → 列出候选 → 选角色 → `tenantLinkMember`
  - 无结果提示切回新建
  - 已在本租户 → 提示去改角色
- 两模式共用同一份"角色多选"（来自刷新后的本租户角色）

### 5.3 API 层

- `apis/tenant-admin.ts` / `apis/my.ts`：新增 `searchAdmins`、`linkMember`；成员/角色列表接口保持

## 6. 安全与治理

- 角色绑定一律经 `assertRolesInChannel` 校验（防跨租户绑定提权）
- 关联操作同样校验 `assertChannelMember`（超管路径 + 租户自助路径）
- 人员启停守卫（`TenantEnabledGuard`）保持不变

## 7. 测试要点

- 超管：新建租户 → 默认 3 角色可见可绑
- 超管：关联已有账号到新租户（同账号多店任职）→ 各店角色互不影响
- 超管：关联已在本租户的账号 → 提示已存在
- 租户自助：`mySearchAdmins` / `myLinkMember` 工作正常、越权绑定被拒
- 前端：roles/index 新建角色后返回详情页，管理员 Tab 角色选择器立即可见

## 8. 部署

- 后端：本地构建 `npm run build`（cjk-plugin tsc → `lib/`）→ 提交 → 服务器 `git pull` + `pm2 reload vendure`（**不在服务器构建**）
- 前端：`web-admin` 本地 `npm run build:h5` → `deploy.mjs` tar+scp 到 `e.joho.cn/guanli/` → openresty reload

## 9. 后续阶段（本设计不实现）

- 租户详情页档案字段扩展：店铺名/logo/简介/客服电话、经营与结算（营业执照/联系人/结算账户/费率）、业务配置（运费模板/支付方式/门店自提点/首页装修）、统计指标、平台状态配置（官营/第三方、入驻审核、启停）
- 字段归属权：平台维护 / 商户自助可补充（按登录身份控制读写）