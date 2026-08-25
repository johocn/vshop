# 租户 × 人员 × 角色：关联模型与交互实现计划（方案 A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让平台可把「已有账号关联进租户」（不再重建），并让角色绑定按「合并」语义写回，跨店任职互不影响；修复前端新建角色后详情页不刷新的确定性 Bug。

**Architecture:** 不改 Vendure 原生 `Administrator`/`Role`。新增 `syncMemberRolesInChannel`（只替换本 channel 角色、保留其它 channel 角色）根治整体替换；新增 `searchAdmins` + `linkMember` 实现「关联已有账号」+「写入 TenantMember 复用账号」。前端新增搜索/关联入口并把 `onLoad` 改为 `onShow` 修复刷新。

**Tech Stack:** Vendure(cjk-plugin,NestJS+TypeORM) / GraphQL / uni-app(Vue3 setup) / TypeScript

**关联 spec:** `docs/superpowers/specs/2026-08-24-tenant-member-role-associate-design.md`

**部署铁律：** 所有构建在本地执行，绝不建议在服务器构建。

---

## 前端 API 约定（后端方法与 GraphQL 参数一一对应）

- `tenantSearchAdmins(channelId: ID!, keyword: String!): [{ id, emailAddress, displayName, linkedCount, linkedChannelIds }]`（超管）
- `mySearchAdmins(keyword: String!): [...相同]`（租户自助，channel 从 session）
- `tenantLinkMember(channelId: ID!, administratorId: ID!, roleIds: [ID!]!, displayName: String, phone: String, remark: String): TenantMember`（超管，**纯标量入参，不用 InputType**，避免 NestJS 输入类型命名风险；返回用 `id` 即可）
- `myLinkMember(administratorId: ID!, roleIds: [ID!]!, displayName: String, phone: String, remark: String): TenantMember`（租户自助）

---

## Task 1: 后端服务 —— 新增 `syncMemberRolesInChannel`（合并语义）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`（在 `updateTenantMemberRoles` 方法之后新增）

- [ ] **Step 1: 新增合并绑定私有方法**

在 `updateTenantMemberRoles(ctx, channelId, memberId, roleIds)` 方法体之后加入：

```ts
/**
 * 合并绑定某人员在指定 channel 的角色：
 * 保留该账号属于「其它 channel」的角色，仅替换「本 channel」的角色。
 * 修复 administratorService.update({ roleIds }) 整体替换会清掉别店任职的问题。
 */
async syncMemberRolesInChannel(
    ctx: RequestContext,
    administratorId: ID,
    channelId: ID,
    roleIds: ID[],
): Promise<void> {
    if (roleIds && roleIds.length > 0) {
        await this.assertRolesInChannel(ctx, roleIds, channelId);
    }
    const repo = this.connection.getRepository(ctx, Administrator);
    const admin = await repo.findOne({
        where: { id: String(administratorId) },
        relations: ['user', 'user.roles'],
    });
    if (!admin) throw new Error('ADMIN_NOT_FOUND');
    const targetChannelId = String(channelId);
    const own = (admin.user?.roles ?? []) as any[];
    const keep = own
        .filter((r: any) => !(r.channels || []).some((c: any) => String(c.id) === targetChannelId))
        .map((r: any) => String(r.id));
    const merged = Array.from(new Set([...keep, ...(roleIds || []).map(String)]));
    await this.administratorService.update(ctx, {
        id: String(administratorId) as any,
        roleIds: merged,
    } as any);
}
```

- [ ] **Step 2: 让 `updateTenantMemberRoles` 走合并语义（替换整体替换）**

将 `updateTenantMemberRoles` 的末尾 `administratorService.update(ctx, {... roleIds: roleIds || []})` 那段整体替换为，改为委托合并方法：

```ts
        // 原有归属校验、member 查找逻辑不变……保留 assertRolesInChannel → findOne → MEMBER_NOT_FOUND → MEMBER_NOT_IN_CHANNEL 校验后：

        await this.syncMemberRolesInChannel(ctx, member.administratorId as any, channelId, roleIds || []);
```

> 注意：`updateTenantMemberRoles` 开头已有的 `assertRolesInChannel` 在 `roleIds?.length` 为空时不会执行，而 `syncMemberRolesInChannel` 内部对非空 `roleIds` 也会再校验一次，二者不冲突（幂等）。

- [ ] **Step 3: 编译验证（本地，勿在服务器）**

Run: 在 `d:\zhao\vendure` 下
```
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
```
Expected: 无编译错误。再验证产物含新方法：
```
Select-String packages/cjk-plugin/lib/src/tenant/tenant-member.service.js -Pattern "syncMemberRolesInChannel"
```
Expected: 命中 ≥1 处。

- [ ] **Step 4: 提交**

```bash
git add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/lib
git commit -m "fix(cjk-plugin): 角色绑定改合并语义 syncMemberRolesInChannel（跨店任职互不影响）"
```

---

## Task 2: 后端服务 —— 新增 `searchAdmins` + `linkMember`

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`

- [ ] **Step 1: 新增 `searchAdmins`**

在 `createTenantAdministrator` 方法之后加入（用 DB 无关的内存过滤，规避 SQLite/PostgreSQL 方言差异）：

```ts
/** 按邮箱/姓名模糊检索平台已有管理员（关联已有账号用），返回任职租户摘要 */
async searchAdmins(
    ctx: RequestContext,
    channelId: ID | null,
    keyword: string,
    take = 10,
): Promise<any[]> {
    const adminRepo = this.connection.getRepository(ctx, Administrator);
    const memberRepo = this.connection.getRepository(ctx, TenantMember);
    const kw = (keyword || '').trim().toLowerCase();
    const admins = await adminRepo.find({ take: 500 });
    const matched = kw
        ? admins.filter((a: any) =>
              String(a.emailAddress || '').toLowerCase().includes(kw) ||
              String(a.lastName || '').toLowerCase().includes(kw),
          )
        : admins;
    const members = await memberRepo.find();
    const byAdmin = new Map<string, any[]>();
    for (const m of members) {
        const k = String(m.administratorId);
        if (!byAdmin.has(k)) byAdmin.set(k, []);
        byAdmin.get(k)!.push(m);
    }
    // 本租户（channelId 非空时）已在里面的账号标注 alreadyLinked，前端据此提示
    const targetChannelId = channelId != null ? String(channelId) : null;
    return matched.slice(0, take).map((a) => {
        const list = byAdmin.get(String(a.id)) ?? [];
        return {
            id: String(a.id),
            emailAddress: a.emailAddress,
            displayName: (a as any).lastName || a.emailAddress,
            linkedCount: list.length,
            linkedChannelIds: list.map((m) => String(m.channelId)),
            alreadyLinked: targetChannelId
                ? list.some((m) => String(m.channelId) === targetChannelId)
                : false,
        };
    });
}
```

- [ ] **Step 2: 新增 `linkMember`**

在 `searchAdmins` 之后加入：

```ts
/**
 * 将平台已有账号关联进本租户（复用账号，不重建）。
 * 已在当前租户 → 抛 ALREADY_IN_CHANNEL；角色走合并语义绑定。
 */
async linkMember(
    ctx: RequestContext,
    channelId: ID,
    input: {
        administratorId: ID;
        roleIds?: ID[];
        enabled?: boolean;
        displayName?: string;
        phone?: string;
        remark?: string;
    },
): Promise<any> {
    const adminRepo = this.connection.getRepository(ctx, Administrator);
    const admin = await adminRepo.findOne({ where: { id: String(input.administratorId) } });
    if (!admin) throw new Error('ADMIN_NOT_FOUND');
    const adminId = String(admin.id);
    const repo = this.connection.getRepository(ctx, TenantMember);
    const existing = await repo.findOne({
        where: { administratorId: adminId, channelId: String(channelId) },
    });
    if (existing) throw new Error('ALREADY_IN_CHANNEL');
    const member = new TenantMember();
    member.administratorId = adminId;
    member.channelId = String(channelId);
    member.enabled = input.enabled ?? true;
    member.mustChangePassword = false; // 复用账号，无需强改密
    member.displayName = input.displayName ?? ((admin as any).lastName || (admin as any).emailAddress);
    member.phone = input.phone ?? null;
    member.remark = input.remark ?? null;
    await repo.save(member);
    await this.syncMemberRolesInChannel(ctx, adminId as any, channelId, input.roleIds ?? []);
    return this.memberToView(ctx, member);
}
```

> 备注：`updateTenantMemberRoles` 内的 `assertChannelMember` 是租户自助用的。超管路径走 `tenant-admin.resolver`（已有 `@Allow(SuperAdmin)` 守卫），不调用 `assertChannelMember`，因此 `searchAdmins/linkMember` 内不再重复调用，归属校验由各自 resolver 层完成。

- [ ] **Step 3: 编译验证（本地）**

Run（同 Task 1 Step 3）：`tsc -p packages/cjk-plugin/tsconfig.build.json`，再
```
Select-String packages/cjk-plugin/lib/src/tenant/tenant-member.service.js -Pattern "searchAdmins|linkMember"
```
Expected: 两处均命中。

- [ ] **Step 4: 提交**

```bash
git add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 新增 searchAdmins/linkMember 支持关联已有账号进租户"
```

---

## Task 3: 后端 resolver —— 暴露超管 + 租户自助入口

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`

- [ ] **Step 1: 超管 resolver 新增 `tenantSearchAdmins` / `tenantLinkMember`**

在 `tenant-admin.resolver.ts` 的 `updateTenantMemberRoles` mutation 之前插入：

```ts
@Query()
@Allow(Permission.SuperAdmin)
async tenantSearchAdmins(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: string; keyword: string },
): Promise<any[]> {
    return this.tenantMemberService.searchAdmins(ctx, args.channelId, args.keyword, 10);
}

@Mutation()
@Allow(Permission.SuperAdmin)
async tenantLinkMember(
    @Ctx() ctx: RequestContext,
    @Args() args: {
        channelId: string;
        administratorId: string;
        roleIds: string[];
        displayName?: string;
        phone?: string;
        remark?: string;
    },
): Promise<any> {
    return this.tenantMemberService.linkMember(ctx, args.channelId, {
        administratorId: args.administratorId,
        roleIds: args.roleIds,
        displayName: args.displayName,
        phone: args.phone,
        remark: args.remark,
    });
}
```

- [ ] **Step 2: 租户自助 resolver 新增 `mySearchAdmins` / `myLinkMember`**

在 `tenant-member.resolver.ts` 的 `myUpdateTenantMemberRoles` 之后插入：

```ts
@Query()
@Allow(Permission.Authenticated)
async mySearchAdmins(
    @Ctx() ctx: RequestContext,
    @Args('keyword') keyword: string,
): Promise<any[]> {
    this.tenantMemberService.assertChannelMember(ctx);
    return this.tenantMemberService.searchAdmins(ctx, ctx.channelId, keyword, 10);
}

@Mutation()
@Allow(tenantMemberManagePermission.Permission)
async myLinkMember(
    @Ctx() ctx: RequestContext,
    @Args() args: {
        administratorId: string;
        roleIds: string[];
        displayName?: string;
        phone?: string;
        remark?: string;
    },
): Promise<any> {
    this.tenantMemberService.assertChannelMember(ctx);
    return this.tenantMemberService.linkMember(ctx, ctx.channelId, {
        administratorId: args.administratorId,
        roleIds: args.roleIds,
        displayName: args.displayName,
        phone: args.phone,
        remark: args.remark,
    });
}
```

> 入参用纯标量（`administratorId|roleIds|displayName|phone|remark`），不用 InputType，避免 NestJS 自动生成输入类型命名的不确定性；返回端按字段名查询、不依赖返回类型名，因此命名风险仅存在于 mutation 方法名（`tenantLinkMember`/`myLinkMember`），与现有 `createTenantMember` 同类。

> **⚠️ 执行期修正（schema-first 缺口）**：`cjk-plugin` 的 AdminApi 采用**手工 SDL**（`plugin.ts` 的 `AdminApiExtensions.schema` 花括号 gql 块），仅加 resolver 会导致启动报 `Query.tenantSearchAdmins defined in resolvers, but not in schema` 而 502。必须在该 SDL 中补充：
> - 新增 `type TenantAdminCandidate`（`id/emailAddress/displayName/linkedCount/linkedChannelIds/alreadyLinked`）
> - Query 加 `tenantSearchAdmins(channelId: ID!, keyword: String!): [TenantAdminCandidate!]!` 与 `mySearchAdmins(keyword: String!): [TenantAdminCandidate!]!`
> - Mutation 加 `tenantLinkMember(channelId: ID!, administratorId: ID!, roleIds: [ID!]!, displayName: String, phone: String, remark: String): TenantMember!` 与 `myLinkMember(...): TenantMember!`
>
> 提交 `27b364265`（`3 files changed`，含 `lib/`）。部署后需以 HTTP 200（非 502）冒烟确认 schema 生成成功。

- [ ] **Step 3: 编译验证（本地）**

Run: `tsc -p packages/cjk-plugin/tsconfig.build.json`，再
```
Select-String packages/cjk-plugin/lib/src/tenant/tenant-admin.resolver.js -Pattern "tenantLinkMember"; Select-String packages/cjk-plugin/lib/src/tenant/tenant-member.resolver.js -Pattern "myLinkMember"
```
Expected: 两文件各命中。

- [ ] **Step 4: 提交**

```bash
git add packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts packages/cjk-plugin/src/tenant/tenant-member.resolver.ts packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 暴露 searchAdmins/linkMember 超管与租户自助 GraphQL 入口"
```

---

## Task 4: 后端部署（本地构建产物提交 → 服务器 pull + reload）

**Files:**
- N/A（Git + pm2）

- [ ] **Step 1: 本地全部编译 + 确认 lib 产物随提交**（前几步若已各自提交，此处仅确认无遗漏）

Run: `node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json`

- [ ] **Step 2: 推送到远端**

Run: `git push origin`（确认当前分支已追踪）。

- [ ] **Step 3: 服务器 pull + reload（不在服务器构建）**

Run（本地终端直连服务器）:
```
ssh qing "cd /www/apps/vendure && git pull && pm2 reload vendure && sleep 4 && pm2 logs --nostream -n 20"
```
Expected: `git pull` 拉到含 lib 新方法的 commit；`pm2 reload` 后进程 online、无崩溃重启；日志无 `Error: ADMIN_NOT_FOUND` 等异常。

- [ ] **Step 4: 冒烟验证（可选）**

在 `e.joho.cn/guanli` 的管理员角色 Tab，确认列表仍正常；或用 curl 打 `/admin-api` 确认返回 200。

---

## Task 5: 前端 API 层 —— 新增 `searchTenantAdmins` / `linkTenantMember` / 自助三件套

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

- [ ] **Step 1: 新增类型与超管「搜索/关联」函数**

在文件末尾（`myDeleteTenantRole` 之后）追加：

```ts
// ===== 方案 A：关联已有账号 =====
export interface AdminSearchCandidate {
  id: string;
  emailAddress: string;
  displayName: string;
  linkedCount: number;
  linkedChannelIds: string[];
  alreadyLinked: boolean;
}

export async function searchTenantAdmins(channelId: string, keyword: string): Promise<AdminSearchCandidate[]> {
  const res = await getAdminClient().request<{ tenantSearchAdmins: AdminSearchCandidate[] }>(
    `query TenantSearchAdmins($channelId: ID!, $keyword: String!) {
      tenantSearchAdmins(channelId: $channelId, keyword: $keyword) {
        id emailAddress displayName linkedCount linkedChannelIds alreadyLinked
      }
    }`,
    { channelId, keyword },
  );
  return res.tenantSearchAdmins ?? [];
}

export async function linkTenantMember(
  channelId: string,
  input: { administratorId: string; roleIds: string[]; displayName?: string; phone?: string; remark?: string },
): Promise<string> {
  const res = await getAdminClient().request<{ tenantLinkMember: { id: string } }>(
    `mutation TenantLinkMember($channelId: ID!, $administratorId: ID!, $roleIds: [ID!]!, $displayName: String, $phone: String, $remark: String) {
      tenantLinkMember(channelId: $channelId, administratorId: $administratorId, roleIds: $roleIds, displayName: $displayName, phone: $phone, remark: $remark) { id }
    }`,
    { channelId, ...input },
  );
  return res.tenantLinkMember.id;
}

export async function searchMyAdmins(keyword: string): Promise<AdminSearchCandidate[]> {
  const res = await getAdminClient().request<{ mySearchAdmins: AdminSearchCandidate[] }>(
    `query MySearchAdmins($keyword: String!) {
      mySearchAdmins(keyword: $keyword) { id emailAddress displayName linkedCount linkedChannelIds alreadyLinked }
    }`,
    { keyword },
  );
  return res.mySearchAdmins ?? [];
}

export async function linkTenantMemberToSelf(input: { administratorId: string; roleIds: string[]; displayName?: string; phone?: string; remark?: string }): Promise<string> {
  const res = await getAdminClient().request<{ myLinkMember: { id: string } }>(
    `mutation MyLinkMember($administratorId: ID!, $roleIds: [ID!]!, $displayName: String, $phone: String, $remark: String) {
      myLinkMember(administratorId: $administratorId, roleIds: $roleIds, displayName: $displayName, phone: $phone, remark: $remark) { id }
    }`,
    input,
  );
  return res.myLinkMember.id;
}
```

- [ ] **Step 2: 提交**

```bash
git add web-admin/src/apis/tenant-admin.ts
git commit -m "feat(web-admin): 新增关联已有账号的搜索/关联 API"
```

---

## Task 6: 前端详情页 —— 刷新修复 + 添加人员「新建/关联」双模式

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\tenants\detail.vue`

- [ ] **Step 1: `onLoad` → `onShow`（返回自动刷新）**

将 detail.vue 中“加载管理员/角色”的入口从 `onLoad` 改为 `onShow`（`onLoad` 保留用于读取 `channelId` 等一次性参数）。若当前在 `onLoad` 里同时读 `options.id` 与 `load()`，则改为：`onLoad(options)` 只存 `channelId`；`onShow()` 调栅 `loadAdminAndRoles()`。 `roles` / `admins` 每次显示重新拉取。

- [ ] **Step 2: 添加管理员弹层增加「新建 / 关联」模式开关**

在“添加管理员表单弹层”(`showAdd`) 顶部新增两个互斥 Tab：

```html
<view class="add-mode">
  <text class="mode" :class="{ on: addMode === 'create' }" @tap="addMode = 'create'">新建账号</text>
  <text class="mode" :class="{ on: addMode === 'link' }" @tap="addMode = 'link'">关联已有</text>
</view>
```

- [ ] **Step 3: 「关联已有」模式 UI：邮箱搜索 → 候选列表 → 选角色**

在新建输入区之上（`addMode === 'link'` 时显示）：

```html
<view v-if="addMode === 'link'" class="field">
  <text class="label">按邮箱/姓名搜索平台账号</text>
  <view class="search-row">
    <input class="input" v-model="linkKeyword" placeholder="输入邮箱或姓名" @confirm="searchCandidates" />
    <text class="btn sm" @tap="searchCandidates">搜索</text>
  </view>
  <view class="cand-list" v-if="candidates.length">
    <view
      v-for="c in candidates"
      :key="c.id"
      class="cand"
      :class="{ on: selectedAdminId === c.id }"
      @tap="pickCandidate(c)"
    >
      <text class="cand-name">{{ c.displayName }} · {{ c.emailAddress }}</text>
      <text class="cand-sub">{{ c.linkedCount }} 家店任职 <text v-if="c.alreadyLinked" class="warn">已在本租户</text></text>
    </view>
  </view>
  <view v-if="afterSearch && !candidates.length" class="empty">未找到匹配账号，可切回「新建账号」</view>
</view>
```

其中角色多选（`showRolePick` 弹层）在两种模式下复用同一份 `roles`（已由 `onShow` 刷新），选人后共用 `toggleRole(r.id)`，`addForm.roleIds` 作为选中集合。

- [ ] **Step 4: 提交逻辑：新建 → `createTenantAdministrator`；关联 → `linkTenantMember`**

在 `submitAdd` 中按 `addMode` 分支：

```ts
async function searchCandidates() {
  if (!channelId.value) return;
  afterSearch.value = true;
  candidates.value = await searchTenantAdmins(channelId.value, linkKeyword.value.trim());
  selectedAdminId.value = '';
  addForm.value.roleIds = [];
}
function pickCandidate(c: AdminSearchCandidate) {
  selectedAdminId.value = c.id;
  addForm.value.displayName = c.displayName;
  if (c.alreadyLinked) {
    uni.showToast({ title: '该账号已在本租户，可直接为其调整角色', icon: 'none' });
  }
}
async function submitAdd() {
  if (!addForm.value.roleIds.length) { uni.showToast({ title: '请选择角色', icon: 'none' }); return; }
  if (addMode.value === 'link') {
    if (!selectedAdminId.value) { uni.showToast({ title: '请从搜索结果中选中一个账号', icon: 'none' }); return; }
    await linkTenantMember(channelId.value, {
      administratorId: selectedAdminId.value,
      roleIds: addForm.value.roleIds,
      displayName: addForm.value.displayName,
      phone: addForm.value.phone,
    });
  } else {
    await createTenantAdministrator(channelId.value, {
      emailAddress: addForm.value.emailAddress,
      roleIds: addForm.value.roleIds,
      displayName: addForm.value.displayName,
      phone: addForm.value.phone,
    });
  }
  uni.showToast({ title: '已添加', icon: 'none' });
  showAdd.value = false;
  loadAdminAndRoles();
}
```

并在 `<script>` 侧新增响应式状态与导入：`import { searchTenantAdmins, linkTenantMember, AdminSearchCandidate } from '@/apis/tenant-admin'`；`addMode/ref('create')`、`linkKeyword/ref('')`、`candidates/ref([])`、`selectedAdminId/ref('')`、`afterSearch/ref(false)`。捕获 `ALREADY_IN_CHANNEL` 时 `uni.showToast({ title: '该账号已在本租户', icon: 'none' })`。

- [ ] **Step 5: 提交**

```bash
git add web-admin/src/pages/platform/tenants/detail.vue web-admin/src/apis/tenant-admin.ts
git commit -m "feat(web-admin): 租户详情页添加人员支持「关联已有账号」+ onShow 刷新修复"
```

---

## Task 7: 前端构建 + 部署（本地构建，产物 scp 到服务器）

**Files:**
- N/A（构建 + deploy）

- [ ] **Step 1: 本地构建（勿在服务器）**

Run（`d:\zhao\vshop\web-admin`）：
```
npm run build:h5
```
Expected: 构建成功，产物位于 `web-admin/dist/build/h5`（或项目既有 h5 输出目录）。

- [ ] **Step 2: 部署（沿用既有 deploy.mjs 打包-传输流程）**

Run:
```
node deploy.mjs --target e.joho.cn/guanli
```
若无该参数形态，沿用上一轮 `_wa_admin.tar` tar+scp+解压 到 `e.joho.cn/guanli` 并 `openresty reload` 的方式。完成后在 `e.joho.cn/guanli`（roles/index 新建角色 → 返回详情）验证：
- 新建角色后返回详情页，角色列表/选择器立即可见（onShow 生效）
- 添加人员弹层有「新建账号/关联已有」两 Tab；关联模式能搜到并绑定已有账号
- 同一账号在其它租户的角色不被清空（合并语义）

- [ ] **Step 3: 提交构建产物约定说明**（不把 git 追踪的打包 tar 纳入本次源码提交，仍遵循项目既有 .gitignore 规则）

---

## Self-Review

1. **Spec 覆盖核对**：4.1 关联已有（Task2+Task3+Task5+Task6）；4.2 合并语义（Task1）；4.3 新建走合并（Task1 的 `updateTenantMemberRoles` 委托合并，`createTenantAdministrator` 为全新账号无需改造）；5.1 onLoad→onShow（Task6 Step1）；5.2 双模式（Task6）；5.3 API（Task5）；6 安全（`assertRolesInChannel`/`assertChannelMember` 保留于既有逻辑与新入口）；8 部署（Task4/Task7）。
2. **无占位符**：每步含完整代码/命令与预期输出。
3. **类型一致**：`searchAdmins`/`linkMember` 签名、`tenantSearchAdmins`/`tenantLinkMember` 常量、前端 `AdminSearchCandidate` 字段（`id/emailAddress/displayName/linkedCount/linkedChannelIds/alreadyLinked`）在 Task2/3/5/6 保持一致。
4. **计划保存路径**：`docs/superpowers/plans/2026-08-24-tenant-member-role-associate.md`（vshop 仓库，与 spec 同仓库可提交）。