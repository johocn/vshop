# 全局角色池 + 引用到本店 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入「全局角色池（channels=[]）」+「引用到本店/批量分发」能力，让超管创建的通用角色可被多家租户复用，同时保持租户本地角色/默认三角色不受影响。

**Architecture:** 复用现有 `createTenantRoleDirect` 直建模式扩展出全局角色创建；用 `Role.channels` 是否为空判定全局/本地（Role 实体无 customFields，已核实不可加）。后端加全局角色 CRUD + 引用/取消引用 API，前端 roles 页分「本店/全局」Tab。

**Tech Stack:** Vendure(cjk-plugin, NestJS+TypeORM) / GraphQL / uni-app(Vue3 setup) / TypeScript

**关联 spec:** `docs/superpowers/specs/2026-08-24-global-role-pool-design.md`

**部署铁律：** 后端仅本地 tsc 编译（`node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json`，产物在 lib/），推送 git 后服务器 git pull + pm2 restart；前端 vshop 本地构建提交 dist，绝不在服务器构建。

---

## 前端 API（与后端 GraphQL 参数一一对应）

- `globalRoles: [Role!]!`（@SuperAdmin）
- `myGlobalRolesAvailable: [Role!]!`（@Authenticated）
- `createGlobalRole(channelIds: [ID!]!, input: CreateTenantRoleInput!): [Role!]!`（@SuperAdmin）
- `referGlobalRoleToChannel(roleId: ID!, channelId: ID!): Boolean!`（@SuperAdmin）
- `unreferGlobalRoleFromChannel(roleId: ID!, channelId: ID!): Boolean!`（@SuperAdmin）
- `myReferGlobalRole(roleId: ID!): Boolean!`（@TenantRoleManage）
- `myUnreferGlobalRole(roleId: ID!): Boolean!`（@TenantRoleManage）

---

### Task 1: 后端 Service 全局角色方法

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`（在 `createTenantRoleDirect`（L298-319）后新增）

#### Step 1: 新增全局角色直建 + 引用/取消 + 查询方法

在 `createTenantRoleDirect` 方法之后、`importDefaultRoles` 之前插入以下方法（复用 `assertBusinessPermissions`、`roleExistsInChannel`、`connection`）：

```ts
/** 全局唯一 code 幂等判定（全局角色不绑店，只看 code 是否已存在）。 */
    private async roleExistsGlobal(ctx: RequestContext, code: string): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Role);
        const count = await repo.count({ where: { code } } as any);
        return count > 0;
    }

    /** 直建全局角色（channels=[]）。幂等：code 已存在则返回 null。 */
    async createGlobalRoleDirect(
        ctx: RequestContext,
        input: { code: string; description: string; permissions: string[] },
    ): Promise<any> {
        this.assertBusinessPermissions(input.permissions);
        if (await this.roleExistsGlobal(ctx, input.code)) return null;
        const roleRepo = this.connection.getRepository(ctx, Role);
        const role = new Role({
            code: input.code,
            description: input.description,
            permissions: [`Authenticated`, ...input.permissions] as any,
        });
        role.channels = [];
        await roleRepo.save(role);
        return role;
    }

    /** 建全局角色并批量分发到多店：建 channels=[] 角色，再把勾选店加入 channels（幂等：code 已存在则 no-op）。 */
    async createGlobalRoleWithChannels(
        ctx: RequestContext,
        channelIds: ID[],
        input: { code: string; description: string; permissions: string[] },
    ): Promise<any[]> {
        this.assertBusinessPermissions(input.permissions);
        const targetChannels: Channel[] = [];
        for (const id of channelIds) {
            const ch = await this.connection
                .getRepository(ctx, Channel)
                .findOne({ where: { id: String(id) } } as any);
            if (ch) targetChannels.push(ch);
        }
        const roleRepo = this.connection.getRepository(ctx, Role);
        const existing = await roleRepo.findOne({ where: { code: input.code } } as any);
        if (existing) {
            // 已存在：仅追加缺少的分发店（幂等）
            const curIds = (existing.channels || []).map((ch: any) => String(ch.id));
            existing.channels = [...(existing.channels || [])];
            for (const ch of targetChannels) {
                if (!curIds.includes(String(ch.id))) existing.channels.push(ch);
            }
            await roleRepo.save(existing);
            return [existing];
        }
        const role = new Role({
            code: input.code,
            description: input.description,
            permissions: [`Authenticated`, ...input.permissions] as any,
        });
        role.channels = targetChannels;
        await roleRepo.save(role);
        return [role];
    }

    /** 把全局角色引用到某店（幂等：已含该店则 no-op）。 */
    async referGlobalRoleToChannel(ctx: RequestContext, roleId: ID, channelId: ID): Promise<void> {
        const roleRepo = this.connection.getRepository(ctx, Role);
        const role = await roleRepo.findOne({ where: { id: String(roleId) }, relations: ['channels'] } as any);
        if (!role) throw new Error('ROLE_NOT_FOUND');
        const chId = String(channelId);
        const curIds = (role.channels || []).map((c: any) => String(c.id));
        if (!curIds.includes(chId) && curIds.length === 0) {
            // 仅当是全局角色（channels 为空）才允许普通引用；已是本地角色不处理
            const ch = await this.connection
                .getRepository(ctx, Channel)
                .findOne({ where: { id: chId } } as any);
            if (!ch) throw new Error('CHANNEL_NOT_FOUND');
            role.channels = [...(role.channels || []), ch];
            await roleRepo.save(role);
        }
    }

    /** 取消某店对该全局角色的引用（移除该店；channels 变空则回到全局池）。 */
    async unreferGlobalRoleFromChannel(ctx: RequestContext, roleId: ID, channelId: ID): Promise<void> {
        const roleRepo = this.connection.getRepository(ctx, Role);
        const role = await roleRepo.findOne({ where: { id: String(roleId) }, relations: ['channels'] } as any);
        if (!role) throw new Error('ROLE_NOT_FOUND');
        const chId = String(channelId);
        role.channels = (role.channels || []).filter((c: any) => String(c.id) !== chId);
        await roleRepo.save(role);
    }

    /** 租户自助：引用全局角色到当前 ctx.channelId。 */
    async myReferGlobalRole(ctx: RequestContext, roleId: ID): Promise<void> {
        await this.referGlobalRoleToChannel(ctx, roleId, ctx.channelId);
    }

    /** 租户自助：从当前 ctx.channelId 取消引用。 */
    async myUnreferGlobalRole(ctx: RequestContext, roleId: ID): Promise<void> {
        await this.unreferGlobalRoleFromChannel(ctx, roleId, ctx.channelId);
    }

    /** 查全部全局角色（channels=[]）。 */
    async globalRoles(ctx: RequestContext): Promise<any[]> {
        const repo = this.connection.getRepository(ctx, Role);
        const all = await repo.find({ relations: ['channels'] });
        return (all as any[]).filter((r) => !(r.channels || []).length);
    }
```

#### Step 2: 编译验证

Run: `cd d:\zhao\vendure && node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json 2>&1 | Select-Object -First 30`
Expected: 无错误，退出码 0；`Select-String packages/cjk-plugin/lib/src/tenant/tenant-member.service.js -Pattern "createGlobalRoleDirect","referGlobalRoleToChannel","globalRoles"` 均命中。

#### Step 3: 提交

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 全局角色池 service（直建/批量分发/引用与取消/查询）"
```

---

### Task 2: 后端 Resolver + SDL

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

#### Step 1: tenant-admin.resolver.ts 新增查询/mutation

在 `importDefaultRoles`（L190-196）后新增：

```ts
    @Query()
    @Allow(Permission.SuperAdmin)
    async globalRoles(@Ctx() ctx: RequestContext): Promise<any[]> {
        return this.tenantMemberService.globalRoles(ctx);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async createGlobalRole(
        @Ctx() ctx: RequestContext,
        @Args() args: { channelIds: string[]; input: { code: string; description: string; permissions: string[] } },
    ): Promise<any[]> {
        return this.tenantMemberService.createGlobalRoleWithChannels(ctx, args.channelIds, args.input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async referGlobalRoleToChannel(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleId: string; channelId: string },
    ): Promise<boolean> {
        await this.tenantMemberService.referGlobalRoleToChannel(ctx, args.roleId, args.channelId);
        return true;
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async unreferGlobalRoleFromChannel(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleId: string; channelId: string },
    ): Promise<boolean> {
        await this.tenantMemberService.unreferGlobalRoleFromChannel(ctx, args.roleId, args.channelId);
        return true;
    }
```

#### Step 2: tenant-member.resolver.ts 新增自助查询/引用

在 `myTenantRoles`（L66-69）后新增：

```ts
    @Query()
    @Allow(Permission.Authenticated)
    async myGlobalRolesAvailable(@Ctx() ctx: RequestContext): Promise<any[]> {
        this.tenantMemberService.assertChannelMember(ctx);
        return this.tenantMemberService.globalRoles(ctx);
    }

    @Mutation()
    @Allow(tenantRoleManagePermission.Permission)
    async myReferGlobalRole(@Ctx() ctx: RequestContext, @Args('roleId') roleId: ID): Promise<boolean> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.myReferGlobalRole(ctx, roleId);
        return true;
    }

    @Mutation()
    @Allow(tenantRoleManagePermission.Permission)
    async myUnreferGlobalRole(@Ctx() ctx: RequestContext, @Args('roleId') roleId: ID): Promise<boolean> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.myUnreferGlobalRole(ctx, roleId);
        return true;
    }
```

#### Step 3: plugin.ts SDL 补充

在 admin SDL 的 `extend type Query`（含 `myTenantAccess` 等，L748-751）尾部追加：

```graphql
                    globalRoles: [Role!]!
```

在 `extend type Mutation`（L753-777）的 `tenantChangeMyPassword` 行后追加：

```graphql
                    createGlobalRole(channelIds: [ID!]!, input: CreateTenantRoleInput!): [Role!]!
                    referGlobalRoleToChannel(roleId: ID!, channelId: ID!): Boolean!
                    unreferGlobalRoleFromChannel(roleId: ID!, channelId: ID!): Boolean!
                    myGlobalRolesAvailable: [Role!]!
                    myReferGlobalRole(roleId: ID!): Boolean!
                    myUnreferGlobalRole(roleId: ID!): Boolean!
```

#### Step 4: 编译验证 + 提交

Run: `cd d:\zhao\vendure && node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json 2>&1 | Select-Object -First 30`
Expected: 无错误；`Select-String lib/src/plugin.js -Pattern "globalRoles"` 命中。

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 全局角色池 resolver + SDL"
```

---

### Task 3: 后端部署 + 线上验证

**Files:** 无（部署）

#### Step 1: 推送并部署

```bash
cd d:\zhao\vendure && git push origin master
ssh qing "cd /www/apps/vendure && git pull && pm2 restart vendure"
```
Expected: push 成功；vendure online。

#### Step 2: 验证 schema

用 curl 对 `https://e.joho.cn/admin-api` POST `{ "query": "{ __type(name: \"Mutation\") { fields { name } } }" }`，确认含 `createGlobalRole`/`referGlobalRoleToChannel`；再查 `Query` 类型确认含 `globalRoles`。

#### Step 3: 验证全局角色池

写临时 node 脚本（scp 到服务器连 pg），建 `channels=[]` 的测试全局角色并查 `globalRoles` 逻辑——或直接通过超管 token 调 API 建一个全局角色，确认出现在池中、且不带任何店。验证后删除测试角色。

---

### Task 4: 前端 API 层

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

#### Step 1: 新增函数（在 `importTenantDefaultRoles` 后）

```ts
export async function fetchGlobalRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ globalRoles: RoleItem[] }>(
    `query GlobalRoles { globalRoles { id code description permissions } }`,
  );
  return res.globalRoles;
}

export async function createGlobalRole(channelIds: string[], input: { code: string; description: string; permissions: string[] }): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ createGlobalRole: RoleItem[] }>(
    `mutation CreateGlobalRole($channelIds: [ID!]!, $input: CreateTenantRoleInput!) {
      createGlobalRole(channelIds: $channelIds, input: $input) { id code description permissions }
    }`,
    { channelIds, input },
  );
  return res.createGlobalRole;
}

export async function referGlobalRoleToChannel(roleId: string, channelId: string): Promise<void> {
  await getAdminClient().request(
    `mutation ReferGlobalRoleToChannel($roleId: ID!, $channelId: ID!) { referGlobalRoleToChannel(roleId: $roleId, channelId: $channelId) }`,
    { roleId, channelId },
  );
}

export async function unreferGlobalRoleFromChannel(roleId: string, channelId: string): Promise<void> {
  await getAdminClient().request(
    `mutation UnreferGlobalRoleFromChannel($roleId: ID!, $channelId: ID!) { unreferGlobalRoleFromChannel(roleId: $roleId, channelId: $channelId) }`,
    { roleId, channelId },
  );
}

export async function fetchMyGlobalRolesAvailable(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ myGlobalRolesAvailable: RoleItem[] }>(
    `query MyGlobalRolesAvailable { myGlobalRolesAvailable { id code description permissions } }`,
  );
  return res.myGlobalRolesAvailable;
}

export async function myReferGlobalRole(roleId: string): Promise<void> {
  await getAdminClient().request(
    `mutation MyReferGlobalRole($roleId: ID!) { myReferGlobalRole(roleId: $roleId) }`,
    { roleId },
  );
}

export async function myUnreferGlobalRole(roleId: string): Promise<void> {
  await getAdminClient().request(
    `mutation MyUnreferGlobalRole($roleId: ID!) { myUnreferGlobalRole(roleId: $roleId) }`,
    { roleId },
  );
}
```

#### Step 2: 提交

```bash
cd d:\zhao\vshop
git add web-admin/src/apis/tenant-admin.ts
git commit -m "feat(web-admin): 全局角色池 API 层"
```

---

### Task 5: 前端 roles 页（超管全局角色 Tab + 引用交互）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`

#### Step 1: 加 Tab 切换（本店角色 / 全局角色池）

在 template 顶部加 Tab，新增 `activeTab` ref：「shop」/「global」。本店逻辑不变（roles 用 fetchTenantRoles）。全局池用 `fetchGlobalRoles` 列表。

#### Step 2: 全局角色列表 + 分发到店 + 引用/取消交互

- 全局列表展示每角色 + 点击「分发到店」弹出租户多选（复用 `fetchTenants`/或现有租户列表 API），调 `createGlobalRole` 或 `referGlobalRoleToChannel` 逐店。
- 简化决策：新建全局角色走 `openGlobalCreate`（带租户多选），调 `createGlobalRole(channelIds, form)`；已有全局角色「分发」调 `referGlobalRoleToChannel` 逐店。

#### Step 3: 提交

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/platform/roles/index.vue
git commit -m "feat(web-admin): 角色页全局角色池 Tab 与引用交互"
```

---

### Task 6: 前端构建部署 + 验证

**Files:** 无（部署）

#### Step 1: 构建部署

Run: `cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
Expected: build:h5 成功、scp 完成、nginx reload 通过。

#### Step 2: 提交 dist

```bash
cd d:\zhao\vshop && git add dist && git commit -m "build(web-admin): 全局角色池 dist"
```

#### Step 3: 线上验证

浏览器验证：
1. 超管建全局角色（不分发）→ 出现在「全局角色池」Tab，任何店不可见。
2. 租户 A「引用到本店」→ 租户 A 角色列表出现、能分配人员；租户 B 不显示。
3. 超管建全局角色并分发到 A、B → A、B 都可见。
4. 取消引用 → 从该店消失；已绑人员不受影响（解除 channels 关联非删角色）。
5. 幂等：重复引用/分发不产生重复关联。