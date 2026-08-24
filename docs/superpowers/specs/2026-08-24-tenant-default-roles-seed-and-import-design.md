# 租户默认角色补种子 + 模板一键导入 设计

> **背景链接**：`2026-08-24-tenant-role-permission-system-design.md`（角色权限单一来源）、
> `2026-08-24-tenant-member-role-associate-design.md`（关联已有账号 + 角色合并语义）

**Goal:** 让每个租户（含存量租户）开箱即有一组可用的默认角色，角色管理不再"重建"；并提供从内置模板一键导入角色，修复新建角色后详情页不可见的问题。

**Architecture:** 沿用当前「按 channel 授权、租户级独立 Role」架构。新增后端幂等补种子逻辑（应用启动扫描 + 单租户导入），前端角色页增加模板导入入口与刷新修复。角色数据仍是每租户独立的 Role（`channelIds=[该channel]`），仅「定义」收敛在 `OFFICIAL_ROLE_TEMPLATES`。

**Tech Stack:** Vendure（TypeORM/RoleService）、Schema-First GraphQL、uni-app（Vue3）H5 后台。

---

## 一、背景与根因

- **问题 1：存量租户角色列表空白**
  `createChannel` 的“自动建默认 3 角色”只在**功能上线后新建**的租户上执行（提交 `84427766a` 引入）。历史租户（如 channel 7「新生」）创建时无该逻辑，因此 `t{tenantNo}-tenant-admin/sales/stock` 从未存在 → 角色 Tab 空白、添加管理员的角色选择器也空白，被迫手动“重建”。

- **问题 2：新建角色的归属与可见性**
  详情页 → `roles/index?channelId=7`，走 `createTenantRole`（租户级，`channelIds=[7]`），理论应可见。不可见疑似 `roles` 页 `onLoad` 只执行一次、返回详情页未用 `onShow` 重拉，或 channelId 传参/绑定偏差。需在实现时实测定位修复。

- **核心矛盾（决策点）**：模板统一下，每租户“重建”角色很笨重。
  **已定方向**：租户级独立角色 + 补种子 + 模板导入（否决“全局共享角色”），理由：权限面不可控、第三方商户审批隔离弱、GLOBALS 授权模型下 A 店角色会影响 B 店。

## 二、目标

1. 存量租户启动时自动补建默认三角色（幂等，仅补缺失）。
2. 角色页提供“从内置模板一键导入”按钮，免手配权限。
3. 修复新建角色后详情页/角色选择器不可见的问题。
4. 保持角色数据租户级隔离，模板改动一处全局生效。

## 三、方案

### 3.1 后端：启动幂等补种子 `ensureDefaultRolesForAllChannels`

`tenant-member.service.ts` 新增：

```ts
/**
 * 启动后异步幂等补建默认角色：扫描所有 Channel，
 * 对缺 t{tenantNo}-{busiPrefix} 角色的租户按 OFFICIAL_ROLE_TEMPLATES 补建（租户级）。
 * 仅补缺失；异常仅打日志，不阻塞启动。
 */
async ensureDefaultRolesForAllChannels(ctx: RequestContext): Promise<void>
```

实现要点：
- 遍历所有 Channel 实体（用 TypeORM `channelRepo.find()`，**不要**用 `channelService.findAll`，规避 Vendure 1000 条查询上限）。
- 每个 channel 取 `customFields.tenantNo`；缺失则跳过。
- **幂等判定**：查询该 channel 是否已存在 code=`t{tenantNo}-tenant-admin` 的关联 Role（TypeORM 直接查 Role 表，按 `channelIds` 关联 `channelId` + code），存在则跳过。
- 缺则逐条复用 `createTenantRole(ctx, channelId, ...)`（权限白名单 + `channelIds=[channelId]`）。
- 整个流程包 try/catch，失败 `Logger.warn` 不阻碍应用启动。

**触发方式**：`OnApplicationBootstrap`（cjk-plugin 已用，见记忆“新增实体列迁移”）异步执行一次，非阻塞。

### 3.2 后端：单租户导入 `importDefaultRoles(channelId)`

提供超管 mutation，供前端“一键导入”按钮调用（避免前端循环建 3 次）：

```graphql
extend type Mutation {
    importDefaultRoles(channelId: ID!): [Role!]!
}
```

- resolver（超管）：`tenantImportDefaultRoles` → `tenantMemberService.importDefaultRoles(ctx, channelId)`。
- service：调用单租户补建逻辑（`ensureDefaultRolesForChannel(ctx, channelId)`，返回新建的 Role 列表）。租户自助路径可另行暴露 `myImportDefaultRoles`（绑当前 channel），本期可选。
- 幂等：已存在默认角色时返回空数组，不重复建。

### 3.3 前端：角色页模板导入入口

- `web-admin/src/apis/tenant-admin.ts` 新增 `importDefaultRoles(channelId)`。
- `roles/index.vue`：
  - 空态显示“暂无角色，可『一键导入默认角色』”按钮；
  - 卡片列表右上角新增“导入默认角色”入口；
  - 点击确认后调 `importDefaultRoles(channelId)`，成功 `load()` 刷新。
- 样式沿用现有 `.fab`/`.btn` 风格。

### 3.4 前端：修复新建后不可见

- `roles/index.vue`：`onLoad` 改 `onLoad + onShow` 组合，确保每次进入/返回重新 `load()`；打印/核对 `channelId` 传参来自详情页 `?channelId={id}`。
- `detail.vue`：已是 `onShow` 拉取（`loadAdminAndRoles`），确认回跳 `roles → detail` 时触发刷新即可。
- 若实测发现 `createTenantRole` 绑定偏差（如超管 ctx 无激活 channel），在 service 内显式以 `channelId` 为准修正。

## 四、边界与错误处理

- **幂等**：补建/导入仅在缺默认角色时创建，重复调用不产生重复 Role（code 判定）。
- **并发/启动时序**：`ensureDefaultRolesForAllChannels` 异步后台执行，不阻塞应用就绪；失败仅日志。
- **权限隔离**：角色始终 `channelIds=[channelId]` 租户级，不跨店生效。
- **超管 ctx**：补建/导入不依赖 ctx 激活 channel，显式传 channelId。
- **第三方商户**：所有租户（含 21+）一视同仁补三角色，商户可在独立店后台按需调整。

## 五、验证

- 重启后端 → 日志/`grep` 确认 channel 7 等存量租户补建了 `t7-tenant-admin/sales/stock`。
- `tenantRoles(channelId=7)` 返回默认三角色；`importDefaultRoles(7)` 再调返回空（幂等）。
- 前端：空态一键导入 → 列表出现三角色；新建自定义角色 → 详情页角色 Tab 与添加管理员选择器可见。
- 服务器 `git pull` + `pm2 restart`；前端 `node scripts/deploy.mjs`。

## 六、非目标（YAGNI）

- 不做全局共享角色。
- 不引入 `TenantRoleTemplate` 独立实体（当前 3 模板用 `OFFICIAL_ROLE_TEMPLATES` 常量收敛已够；未来模板种类变多再升级）。
- 不做每模板多语言（沿用 code=英文 + description=中文）。