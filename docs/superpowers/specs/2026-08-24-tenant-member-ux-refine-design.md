# 租户 / 人员 / 角色·管理体验补齐设计

> 日期：2026-08-24
> 项目：vshop（Vendure）多租户电商 —— 后端 `vendure/packages/cjk-plugin` + 前端 `vshop/web-admin`（`https://e.joho.cn/guanli`）
> 状态：设计稿（待实现）
> 前置约定：`d:\zhao\vshop\docs\superpowers\specs\2026-08-23-tenant-role-permission-system-design.md`

---

## 一、背景与痛点

后台租户/人员/角色管理当前存在以下六类体验与功能缺口：

1. **新建租户字段单一**：`tenants/index.vue` 用 `uni.showModal` 单输入框只收 `code`（编号），`name` 直接复用 code，无店铺名/自营标识等。
2. **创建租户"不成功"但无反馈**：后端因 `code` 重复抛"编号已存在"，前端复用 spring 交互失败时不见具体错误。
3. **新建用户字段单一**：`members/index.vue` 用 `uni.showModal` 单输入框只收邮箱，姓名=邮箱，`roleIds=[]` 空，无法在创建时分配角色。
4. **初始口令弹窗无法复制**：用 `uni.showModal` 展示随机强口令，内容不可选中/复制（`uni.showModal` 无此能力）。
5. **人员 ↔ 角色分配"看不见"**：角色页只管理"角色→权限"，没有"人员→角色"分配 UI；创建人员时 `roleIds` 恒为空。
6. **租户 ↔ 用户绑定关系不直观**：绑定通过 `TenantMember.channelId/administratorId` 隐式建立，界面未清晰表达"同一全局用户可绑定多租户、各自分配角色"。

## 二、目标

- 将"新建租户 / 新建人员 / 初始口令 / 行内改角色"等交互从单输入弹窗升级为完整表单或可复制弹层。
- 补齐"人员→角色"分配路径（创建时勾选 + 列表行内改）。
- 让所有创建/保存失败的错误信息可见（统一 toast 展示后端 message）。
- 遵循 **A 全局账号模型**：邮箱全局唯一，可绑定多个租户，各租户分别分配角色（后端 `TenantMember` 桥接模型不变）。

## 三、现状核对（后端已具备 / 缺失）

**已具备**（无需新增）：
- `createTenantAdministrator(input: CreateTenantAdminInput)` 已支持 `emailAddress / roleIds / displayName / remark / enabled / forcePasswordChange`，未显式传 `password` 时用 `randomStrongPassword()` 生成并回传 `initialPassword`（一次性，仅运行时展示）。
- 随机强口令生成函数 `randomStrongPassword()` 已存在。
- 首登强改密闭环（`TenantMember.mustChangePassword` + 守卫限制，`tenantChangeMyPassword`）已上线。
- 权限白名单校验：`assertBusinessPermissions(input.permissions)`；归属校验：`assertRolesInChannel(ctx, roleIds, channelId)`、`assertRoleInChannel(ctx, roleId, channelId)` 已存在（防横向越权）。

**缺失 / 需修补**：
- `createTenant(input)` 要求手输唯一 `code`，重复即失败；需自动生成。
- `updateTenant` 的 `name` 未写入 `customFields.shopName`（改名不生效的 bug）。
- 无"给已存在人员改角色"的 mutation。
- `TenantMember` 无手机号字段，`CreateTenantAdminInput` 无 `phone`。

## 四、设计

### 4.1 后端补充（cjk-plugin）

| 项 | 当前行为 | 目标行为 | 位置 |
|---|---|---|---|
| 租户编号 | `createTenant` 手输 `code`，重复报"编号已存在" | 自动生成：后端取当前最大 `tenantNo` 自增，`code = 't' + tenantNo`；入参改为 `shopName + isOfficial(选填) + token(选填)` | `tenant-member.service.ts::createChannel`、`tenant-admin.resolver.ts` |
| 改租户店铺名 | `updateTenant({name})` 未写 `shopName`，改名不生效 | `updateChannel` 补写 `customFields.shopName` | `tenant-member.service.ts::updateChannel` |
| 人员改角色 | 无改角色接口 | 新增 `updateTenantMemberRoles(channelId, administratorId, roleIds)`；复用 `assertRolesInChannel` 校验归属，防跨租户越权；`AdministratorService.update({roleIds})` | `tenant-member.service.ts` + resolver + schema |
| 人员手机号 | 无 `phone` | `TenantMember` 幂等补 `phone` 列（沿用 `TenantMemberColumnMigration` 模式）；`CreateTenantAdminInput` 增加 `phone?` | `tenant-member.entity.ts` + migration + `tenant-member.service.ts` |

> 错误信息：后端沿用 GraphQL 抛带 message 的错；前端统一取 `errors[0].message` 展示，后端无需额外改动。

### 4.2 前端 web-admin

| 场景 | 当前 | 目标 | 位置 |
|---|---|---|---|
| 新建租户 | `uni.showModal` 单输 `code` | 表单弹层：**店铺名必填**、**编号自动**（只读展示 `t{tenantNo}`）、**自营开关选填**、`token` 可留空 | `pages/platform/tenants/index.vue` |
| 新建用户 | 单输邮箱 | 表单：**邮箱必填**、**姓名选填**、**手机号选填**、**角色多选**（动态拉取该租户角色） | `pages/platform/members/index.vue` |
| 初始口令 | `uni.showModal` 不可复制 | 自定义弹层：排布口令 + “**一键复制**”按钮（`uni.setClipboardData`），只复制密码 | 共用组件 + `members/index.vue` |
| 行内改角色 | 无 | 人员列表行内“**改角色**”入口 → 调新 `updateTenantMemberRoles` mutation | `pages/platform/members/index.vue` |
| 错误提示 | 失败无反馈 | 统一 toast 后端 `message`（如"编号已存在"） | `apis/client.ts` 拦截或各调用处 |

### 4.3 结构 / 数据流 / 错误处理 / 交付

- **数据流**：超管/店长新建租户 → 自动编号 → 建店铺；新建用户 → 邮箱（全局唯一）→ 绑定当前租户生成 `TenantMember` → 勾选角色 → 未显式密码则随机口令 + 首登强改密 → 弹口令可复制 → 之后列表行内可改角色。
- **错误处理**：后端 GraphQL 抛带 message 的错；前端统一拦截 `errors[0].message` → toast。
- **安全**：`updateTenantMemberRoles` 必须做 `assertRolesInChannel` 归属校验 + `assertBusinessPermissions` 白名单校验，沿用横向越权加固铁律。
- **部署**：后端本地 `tsc` 构建 `lib/` → 推送 → 服务器 `git pull` + `pm2 restart`；前端改完在 HBuilder X 重编译（禁止服务器构建、禁止代跑依赖安装）。新列走幂等 migration，兼容生产 `synchronize=false`。

## 五、范围外（本轮不做）

- 删除人员/删除租户的二次确认增强、C 端会员（Customer）管理、商品审批流、核销功能主体。

## 六、验收要点

1. 新建租户不再手输编号，自动生成 `t{N}`；重复冲突不再出现。
2. 新建用户可填邮箱(必)/姓名/手机(选)/角色(多选)，创建成功回显可复制的初始口令。
3. 初始口令弹窗"一键复制"成功并有 toast；只复制密码。
4. 人员列表行内"改角色"生效，且跨租户改他人角色被拒绝。
5. 所有失败的创建/保存操作都有可见的错误 toast。
6. 新 `phone` 列在 SQLite 与 PostgreSQL 均通过幂等迁移补上，服务启动无阻塞。