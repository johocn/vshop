# 全局角色池迭代实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复渠道7本地角色池误显超管角色、默认三角色纳入全局池（模板+独立副本）、超管新建角色范围三选、全局角色 g- 前缀标识、池内租户状态标注，并统一分发/引用幂等防数据重复，最后部署并线上验证。

**Architecture:** 用 `g-` code 前缀替换原"channels 是否为空"判定全局角色；`globalRoles` 改为查前缀并含 channels 关系返回，池内据此标"已入本地/可引用"。默认三角色以模板（不落库）形态入池，租户导入时复制独立副本（复用现有 `importDefaultRoles`）。超管建角色新增范围三选（本店/全局可用/全局默认），全部收敛到 `createGlobalRoleWithChannels`。

**Tech Stack:** NestJS / Vendure v3 / GraphQL、uni-app (vite + vue3 + TS)、PostgreSQL 生产库、agent-browser（线上验证）。该仓库是**monorepo 本地构建 + git 提交 dist，服务器 git pull + pm2 restart，绝不在服务器构建**。

**构建约定（关键）：**
- **cjk-plugin**（`d:\zhao\vendure\packages\cjk-plugin`）：用根目录 `node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json` 编译，产物在 `lib/`。改完用 `Select-String lib/src/tenant/tenant-member.service.js -Pattern "新内容关键词"` 验证 dist 已更新。**勿在插件目录跑 `pnpm run build`（@vendure/distribution-plugin 为本地 workspace 包，registry 404）**。
- **web-admin**（`d:\zhao\vshop\web-admin`）：本地 `npm run build:h5` 产物在 `dist/build/h5`，部署用 `node scripts/deploy.mjs`（产物校验+scp+服务器解压+nginx reload+备份轮转）。**此为 `d:\zhao\vshop` 例外目录，允许 agent 构建部署**；不触碰 strapi-* 三个 HBuilder X 目录。

---
**引用设计文档：** `docs/superpowers/specs/2026-08-25-global-role-pool-refine-design.md`

## 文件映射

**后端（cjk-plugin，改动 4 个文件）**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts` — g-前缀、globalRoles 改查、refer 幂等修复、globalRoleTemplates、myImportDefaultRoles
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts` — globalRoleTemplates query
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts` — myImportDefaultRoles mutation、myReferGlobalRole 安全校验
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts` — SDL 加 RoleTemplate 类型、globalRoleTemplates、myImportDefaultRoles

**前端（web-admin，改动 2 个文件）**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts` — fetchGlobalRoleTemplates、myImportDefaultRoles、RoleItem 加 channels
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue` — 修复 channelId 参数、池两区渲染、范围三选

---

## Task 1: 后端 Service — g-前缀标识与全局池查询改造

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`

- [ ] **Step 1: 新增「全局角色 code 前缀」常量与编码/解码工具，置于文件顶部（`PERMISSION_CATALOG` 之后）**

```ts
/** 全局角色 code 前缀：超管建的全局角色统一加此前缀，用于池查询与全局/本地判定（Vendure Role 无 customFields，用前缀区分） */
export const GLOBAL_ROLE_PREFIX = 'g-';
/** 全局角色 code 规范化：输入 code 自动统一为 `g-{code}`，避免手动误输入前缀产生重复 */
export function normalizeGlobalRoleCode(code: string): string {
    const c = code.trim();
    return c.startsWith(GLOBAL_ROLE_PREFIX) ? c : GLOBAL_ROLE_PREFIX + c;
}
```

- [ ] **Step 2: 改造 `globalRoles` 方法 — 由"channels 为空"改为"code 以 g- 开头"**

将现有方法：
```ts
async globalRoles(ctx: RequestContext): Promise<any[]> {
    const repo = this.connection.getRepository(ctx, Role);
    const all = await repo.find({ relations: ['channels'] });
    return (all as any[]).filter((r) => !(r.channels || []).length);
}
```
替换为：
```ts
async globalRoles(ctx: RequestContext): Promise<any[]> {
    const repo = this.connection.getRepository(ctx, Role);
    const all = await repo.find({ relations: ['channels'] });
    return (all as any[]).filter((r) => String(r.code).startsWith(GLOBAL_ROLE_PREFIX));
}
```

- [ ] **Step 3: 改造 `createGlobalRoleWithChannels` — code 自动加 g- 前缀；空 channelIds=[] 全局可用，非空即全局默认；统一幂等**

将现有方法整体替换为：
```ts
async createGlobalRoleWithChannels(
    ctx: RequestContext,
    channelIds: ID[],
    input: { code: string; description: string; permissions: string[] },
): Promise<any[]> {
    this.assertBusinessPermissions(input.permissions);
    const code = normalizeGlobalRoleCode(input.code);
    const targetChannels: Channel[] = [];
    for (const id of channelIds || []) {
        const ch = await this.connection
            .getRepository(ctx, Channel)
            .findOne({ where: { id: String(id) } } as any);
        if (ch) targetChannels.push(ch);
    }
    const roleRepo = this.connection.getRepository(ctx, Role);
    const existing = await roleRepo.findOne({ where: { code } } as any);
    if (existing) {
        // 已存在：仅追加缺失店（幂等，绝不重复关联同一店）
        const curIds = (existing.channels || []).map((c: any) => String(c.id));
        let changed = false;
        for (const ch of targetChannels) {
            if (!curIds.includes(String(ch.id))) {
                (existing.channels || []).push(ch);
                changed = true;
            }
        }
        if (changed) await roleRepo.save(existing);
        return [existing];
    }
    const role = new Role({
        code,
        description: input.description,
        permissions: [`Authenticated`, ...input.permissions] as any,
    });
    role.channels = targetChannels;
    await roleRepo.save(role);
    return [role];
}
```

- [ ] **Step 4: 将 `createGlobalRoleDirect` 收敛到 `createGlobalRoleWithChannels`（空数组=全局可用）**

将现有方法体整体替换为：
```ts
async createGlobalRoleDirect(
    ctx: RequestContext,
    input: { code: string; description: string; permissions: string[] },
): Promise<any> {
    const [role] = await this.createGlobalRoleWithChannels(ctx, [], input);
    return role;
}
```

- [ ] **Step 5: 修复 `referGlobalRoleToChannel` 幂等 — 去掉 `length === 0` 限制，超管可向已绑店角色继续分发**

将现有方法体整体替换为：
```ts
async referGlobalRoleToChannel(ctx: RequestContext, roleId: ID, channelId: ID): Promise<void> {
    const roleRepo = this.connection.getRepository(ctx, Role);
    const role = await roleRepo.findOne({
        where: { id: String(roleId) },
        relations: ['channels'],
    } as any);
    if (!role) throw new Error('ROLE_NOT_FOUND');
    // 安全：仅全局角色（g-前缀）允许被引用；租户本地角色不可引
    if (!String(role.code).startsWith(GLOBAL_ROLE_PREFIX)) throw new Error('NOT_GLOBAL_ROLE');
    const chId = String(channelId);
    const curIds = (role.channels || []).map((c: any) => String(c.id));
    if (!curIds.includes(chId)) {
        const ch = await this.connection
            .getRepository(ctx, Channel)
            .findOne({ where: { id: chId } } as any);
        if (!ch) throw new Error('CHANNEL_NOT_FOUND');
        role.channels = [...(role.channels || []), ch];
        await roleRepo.save(role);
    }
}
```

- [ ] **Step 6: 新增 `globalRoleTemplates` 方法 — 返回默认三角色模板元数据（不落库）**

在 `globalRoles` 方法之后新增：
```ts
/** 默认三角色模板（不落库为 Role）：租户"导入到本店"时复制独立副本，各租户权限互不影响 */
async globalRoleTemplates(ctx: RequestContext): Promise<any[]> {
    return OFFICIAL_ROLE_TEMPLATES.map((tpl) => ({
        key: tpl.key,
        busiPrefix: tpl.busiPrefix,
        description: tpl.description,
        permissions: tpl.permissions,
    }));
}
```

- [ ] **Step 7: 新增 `myImportDefaultRoles` — 租户自助从模板复制独立副本（幂等）**

在 `importDefaultRoles` 方法之后新增：
```ts
/** 租户自助：从全局默认模板复制独立副本到当前 ctx.channelId（幂等，复用 importDefaultRoles） */
async myImportDefaultRoles(ctx: RequestContext): Promise<any[]> {
    return this.importDefaultRoles(ctx, ctx.channelId);
}
```

- [ ] **Step 8: 校验编译**

Run（powershell，cwd = `d:\zhao\vendure`）:
```powershell
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
```
Expected: 退出码 0，无类型错误。若报 `ID`/`Permission` 类型错误，检查 import 来源（NestJS GraphQL ID 别名）。

- [ ] **Step 9: 验证编译产物已包含改动**

Run: `Select-String "d:\zhao\vendure\packages\cjk-plugin\lib\src\tenant\tenant-member.service.js" -Pattern "globalRoleTemplates|normalizeGlobalRoleCode|startswith\('g-'" | Select-Object -First 5`
Expected: 命中 3 处关键词。若无命中，说明编译产物未更新，回到 Step 8。

- [ ] **Step 10: Commit（后端 service 部分）**

```bash
git -C d:/zhao/vendure add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/lib/src/tenant/tenant-member.service.js
git -C d:/zhao/vendure commit -m "feat(cjk): 全局角色 g-前缀标识 + globalRoles 按前缀查询 + refer 幂等修复 + 模板/自助导入"
```

---

## Task 2: 后端 Resolver 与 SDL — 暴露新增查询/变更

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: tenant-admin.resolver 新增 `globalRoleTemplates` query（超管）**

在 `globalRoles` query 方法（`tenant-admin.resolver.ts` 约 195-199 行）之后新增：
```ts
@Query()
@Allow(Permission.SuperAdmin)
async globalRoleTemplates(@Ctx() ctx: RequestContext): Promise<any[]> {
    return this.tenantMemberService.globalRoleTemplates(ctx);
}
```

- [ ] **Step 2: tenant-member.resolver 新增 `myImportDefaultRoles` mutation（租户自助）**

在 `myUnreferGlobalRole` 方法（约 91 行）之后新增：
```ts
@Mutation()
@Allow(tenantRoleManagePermission.Permission)
async myImportDefaultRoles(@Ctx() ctx: RequestContext): Promise<any[]> {
    this.tenantMemberService.assertChannelMember(ctx);
    return this.tenantMemberService.myImportDefaultRoles(ctx);
}
```

- [ ] **Step 3: plugin.ts SDL 新增 `RoleTemplate` 类型 + 两个字段**

在 GraphQL SDL 中 `type PermissionCatalogGroup`（约 728 行）之前新增：
```graphql
type RoleTemplate {
    key: String!
    busiPrefix: String!
    description: String!
    permissions: [String!]!
}
```
在 `extend type Query`（约 740 行）的 `globalRoles: [Role!]!` 之前新增 `globalRoleTemplates: [RoleTemplate!]!`；在 `extend type Mutation`（约 755 行）的 `myUnreferGlobalRole(roleId: ID!): Boolean!` 之后新增 `myImportDefaultRoles: [Role!]!`。

- [ ] **Step 4: 校验编译 + 验证产物**

Run（cwd = `d:\zhao\vendure`）:
```powershell
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
```
随后：
```powershell
Select-String "d:\zhao\vendure\packages\cjk-plugin\lib\src\tenant\tenant-admin.resolver.js" -Pattern "globalRoleTemplates" | Select-Object -First 3
Select-String "d:\zhao\vendure\packages\cjk-plugin\lib\src\tenant\tenant-member.resolver.js" -Pattern "myImportDefaultRoles" | Select-Object -First 3
```
Expected: 各命中 ≥1 处。

- [ ] **Step 5: Commit**

```bash
git -C d:/zhao/vendure add packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts packages/cjk-plugin/src/tenant/tenant-member.resolver.ts packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/lib/src/tenant/tenant-admin.resolver.js packages/cjk-plugin/lib/src/tenant/tenant-member.resolver.js packages/cjk-plugin/lib/src/plugin.js
git -C d:/zhao/vendure commit -m "feat(cjk): 暴露 globalRoleTemplates / myImportDefaultRoles 到 GraphQL API"
```

---

## Task 3: 前端 API 层 — 新增模板/自助导入，RoleItem 携带 channels

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

- [ ] **Step 1: RoleItem 增加 channels 字段**

将 `RoleItem` 接口（约 26 行）改为：
```ts
export interface RoleItem {
  id: string;
  code: string;
  description: string;
  permissions: string[];
  channels?: { id: string }[];
}
```

- [ ] **Step 2: `fetchGlobalRoles` 请求 channels 关系**

将现有（约 180 行）改为：
```ts
export async function fetchGlobalRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ globalRoles: RoleItem[] }>(
    `query GlobalRoles { globalRoles { id code description permissions channels { id } } }`,
  );
  return res.globalRoles;
}
```

- [ ] **Step 3: 新增 `fetchGlobalRoleTemplates`（超管/租户共用）**

在 `fetchGlobalRoles` 之后新增：
```ts
export interface RoleTemplateItem {
  key: string;
  busiPrefix: string;
  description: string;
  permissions: string[];
}

export async function fetchGlobalRoleTemplates(): Promise<RoleTemplateItem[]> {
  const res = await getAdminClient().request<{ globalRoleTemplates: RoleTemplateItem[] }>(
    `query GlobalRoleTemplates { globalRoleTemplates { key busiPrefix description permissions } }`,
  );
  return res.globalRoleTemplates;
}
```

- [ ] **Step 4: 新增 `myImportDefaultRoles`（租户自助）**

在 `myUnreferGlobalRole`（约 225 行）之后新增：
```ts
export async function myImportDefaultRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ myImportDefaultRoles: RoleItem[] }>(
    `mutation MyImportDefaultRoles { myImportDefaultRoles { id code description permissions } }`,
  );
  return res.myImportDefaultRoles ?? [];
}
```

- [ ] **Step 5: 校验 TS 编译**

Run（cwd = `d:\zhao\vshop\web-admin`）: `npx vue-tsc --noEmit` （若项目未配 vue-tsc，则跳过，靠后续 `npm run build:h5` 兜底类型检查）
Expected: 无类型错误（或项目无该脚本则忽略）。

- [ ] **Step 6: Commit**

```bash
git -C d:/zhao/vshop add web-admin/src/apis/tenant-admin.ts
git -C d:/zhao/vshop commit -m "feat(web-admin): 角色 API 层支持全局模板/自助导入/RoleItem 携带 channels"
```

---

## Task 4: 前端角色页 — 修复渠道7 bug + 池两区 + 范围三选 + 池状态标注

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`

- [ ] **Step 1: 修复 `onLoad` 参数读取（关键 bug）**

将（约 178-183 行）：
```ts
onLoad(async (q: any) => {
  channelId.value = q?.id || '';
```
改为：
```ts
onLoad(async (q: any) => {
  channelId.value = q?.channelId || '';
```

- [ ] **Step 2: 导入新增 API 与状态**

在 script import 区块（约 156-163 行）补充导入 `fetchGlobalRoleTemplates, myImportDefaultRoles`；新增 ref 状态（`roleTemplates` 数组）。

- [ ] **Step 3: 全局池 Tab 两区渲染（默认模板区 + 全局可用区）**

将全局池模板区块（`<template v-else>`，约 60-80 行）整体改为：
```html
<template v-else>
  <!-- 默认角色模板区 -->
  <text class="pool-sec-label">默认角色模板（导入后复制为本店独立角色）</text>
  <view class="card" v-for="tpl in roleTemplates" :key="tpl.key">
    <view class="row head">
      <view class="lt">
        <text class="title">{{ tpl.description }}</text>
        <text class="sub">{{ tpl.busiPrefix }}</text>
      </view>
      <text class="btn" v-if="channelId" @tap="doImportTemplate(tpl)">导入到本店</text>
    </view>
    <view class="group"><text class="g-label">模板权限</text>
      <view class="perms"><text v-for="p in tpl.permissions" :key="p" class="perm">{{ p }}</text></view>
    </view>
  </view>
  <view v-if="!roleTemplates.length" class="empty">暂无默认角色模板</view>

  <!-- 全局可用角色区（超管 g- 角色，含 channels 状态） -->
  <text class="pool-sec-label pool-sec-gap">全局可用角色（引用/分发到租户）</text>
  <view class="card" v-for="g in globalRoles" :key="g.id">
    <view class="row head">
      <view class="lt"><text class="title">{{ g.description || g.code }}</text><text class="sub">{{ g.code }}</text></view>
      <text class="btn" @tap="openTenantManage(g)">管理租户</text>
    </view>
    <view class="group"><text class="g-label">已绑定权限</text>
      <view class="perms"><text v-for="p in g.permissions" :key="p" class="perm">{{ p }}</text></view>
    </view>
    <view class="group"><text class="g-label">已入本地（{{ (g.channels || []).length }} 店）</text>
      <view class="perms"><text v-for="c in g.channels || []" :key="c.id" class="perm">{{ tenantNameById(c.id) }}</text></view>
    </view>
  </view>
  <view v-if="!globalRoles.length" class="empty">暂无全局可用角色</view>
  <view class="fab" @tap="openGlobalCreate">＋</view>
</template>
```

- [ ] **Step 4: 新增「管理租户」弹层（每个租户标注 已入本地/可引用，可分发/取消）**

在分发弹层之后新增弹层与逻辑：
```html
<view class="mask" v-if="showTenantManage" @tap="showTenantManage = false">
  <view class="pop" @tap.stop>
    <text class="pop-title">管理「{{ manageRole?.description || manageRole?.code }}」引用的租户</text>
    <view class="group">
      <view class="perm tenant" v-for="t in tenants" :key="t.id"
            :class="roleHasChannel(manageRole, t.id) ? 'on' : ''"
            @tap="toggleManageTenant(t.id)">
        <text>{{ t.name }}</text>
        <text class="state-tag" :class="roleHasChannel(manageRole, t.id) ? 'on' : ''">
          {{ roleHasChannel(manageRole, t.id) ? '已入本地' : '可引用' }}
        </text>
      </view>
    </view>
    <view class="actions">
      <text class="btn ghost" @tap="showTenantManage = false">关闭</text>
      <text class="btn" @tap="applyTenantManage">保存变更</text>
    </view>
  </view>
</view>
```

- [ ] **Step 5: script 新增范围三选逻辑（本店/全局可用/全局默认）与状态字段**

在 script 段新增：
```ts
const showScopePick = ref(false);
const createScope = ref<'shop' | 'globalAvail' | 'globalDefault'>('shop');
const manageRole = ref<RoleItem | null>(null);
const showTenantManage = ref(false);
const manageChannelIds = ref<string[]>([]);

function roleHasChannel(r: RoleItem | null, cid: string): boolean {
  return !!(r?.channels || []).some((c) => c.id === cid);
}
function tenantNameById(id: string): string {
  return tenants.value.find((t) => t.id === id)?.name || id;
}
function openGlobalCreate() {
  globalForm.value = { code: '', description: '', permissions: ['ReadProduct'], channelIds: [] as string[] };
  createScope.value = 'globalAvail';
  showGlobalCreate.value = true;
}
function toggleManageTenant(id: string) {
  const i = manageChannelIds.value.indexOf(id);
  if (i >= 0) manageChannelIds.value.splice(i, 1);
  else manageChannelIds.value.push(id);
}
function applyTenantManage() {
  if (!manageRole.value) return;
  // 全量对齐：先对当前引用槽位 diff，缺失调用 refer 补齐
  const current = (manageRole.value.channels || []).map((c) => c.id);
  // 确定需要处理的均为全局角色（超管路径），直接全量 refer（幂等）
  (async () => {
    for (const cid of manageChannelIds.value) {
      if (!current.includes(cid)) await referGlobalRoleToChannel(manageRole.value!.id, cid);
    }
    for (const cid of current) {
      if (!manageChannelIds.value.includes(cid)) await unreferGlobalRoleFromChannel(manageRole.value!.id, cid);
    }
    uni.showToast({ title: '已更新', icon: 'none' });
    showTenantManage.value = false;
    loadGlobal();
  })().catch((err: any) => uni.showToast({ title: err?.message || '更新失败', icon: 'none' }));
}
```

- [ ] **Step 6: 改造新建全局角色弹层 — 加范围三选 + 全局默认必选租户**

新建全局弹层「选择权限」之前加范围选择；`submitGlobalCreate` 改为按范围分发、code 交给后端自动加前缀：
```ts
async function submitGlobalCreate() {
  const code = globalForm.value.code.trim();
  const description = globalForm.value.description.trim();
  if (!code) { uni.showToast({ title: '角色编码必填', icon: 'none' }); return; }
  if (!description) { uni.showToast({ title: '显示名称必填', icon: 'none' }); return; }
  if (createScope.value === 'globalDefault' && !globalForm.value.channelIds.length) {
    uni.showToast({ title: '全局默认需选择至少一家租户', icon: 'none' }); return;
  }
  const channelIds = createScope.value === 'globalDefault' ? globalForm.value.channelIds : [];
  try {
    await createGlobalRole(channelIds, { code, description, permissions: globalForm.value.permissions });
    uni.showToast({ title: '已创建', icon: 'none' });
    showGlobalCreate.value = false;
    loadGlobal();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
  }
}
```

- [ ] **Step 7: 加载逻辑 — loadGlobal 额外拉取模板；load 刷新重拉**

将 `loadGlobal` 改为同时拉模板（仅首次或每次均可，简单起见每次拉）：
```ts
async function loadGlobal() {
  if (isSuperAdmin.value) {
    globalRoles.value = await fetchGlobalRoles();
    roleTemplates.value = await fetchGlobalRoleTemplates();
  } else {
    availableGlobal.value = await fetchMyGlobalRolesAvailable();
  }
}
```

- [ ] **Step 8: 构建 web-admin 校验**

Run（cwd = `d:\zhao\vshop\web-admin`）: `npm run build:h5`
Expected: 构建成功，产物在 `dist/build/h5`。

- [ ] **Step 9: 本地部署（不走服务器构建，本地构建推送）**

Run（cwd = `d:\zhao\vshop\web-admin`）: `node scripts/deploy.mjs`
Expected: 产物校验通过，scp 上传成功，服务器解压 + nginx reload，输出部署成功信息。注意脚本可能因 `WA_REMOTE`/`WA_SITE` 未配置而中止——此时仅需完成构建，部署步骤交由后续整体部署任务执行。

- [ ] **Step 10: Commit**

```bash
git -C d:/zhao/vshop add web-admin/src/pages/platform/roles/index.vue web-admin/dist/build/h5
git -C d:/zhao/vshop commit -m "feat(web-admin): 角色页修复渠道7 bug + 全局池两区 + 范围三选 + 池状态标注"
```

---

## Task 5: 部署 + 线上验证（agent-browser）

**Files:**
- 无代码改动，仅部署与验证

- [ ] **Step 1: 确认后端 dist 已提交并推送（vendure 仓库）**

Run: `git -C d:/zhao/vendure status --short`
Expected: cjk-plugin 的 lib/ 改动已在 Task 1、2 提交。若未推送，`git -C d:/zhao/vendure push`。
（服务器侧执行 `git pull` 由运维流程完成，本步骤只保证本地提交/推送就绪。）

- [ ] **Step 2: 后端服务器拉取并重启**

Run（SSH/运维命令，若服务器可访问）: 服务器上 `cd <vendure-src> && git pull && pm2 restart <app>`（**不在服务器构建**）
若当前设备无法直接 SSH，跳过此步，交由运维。

- [ ] **Step 3: 前端部署（若 Step Task4-Step9 未成功）**

Run（cwd = `d:\zhao\vshop\web-admin`）: `node scripts/deploy.mjs`

- [ ] **Step 4: agent-browser 登录超管并进角色管理页，验证渠道7本地池不显超管**

```bash
agent-browser open https://<admin域>/pages/platform/roles/index?channelId=<渠道7id> ; agent-browser wait --load networkidle ; agent-browser snapshot -i
```
Expected（超管以 session 复用登录后）：本店角色 Tab 列表只含渠道7 的角色（t7-*），**不含 SuperAdmin/Customer 等超管系统角色**。

- [ ] **Step 5: 验证全局池两区**

```bash
agent-browser open https://<admin域>/pages/platform/roles/index?channelId=<渠道7id> ; agent-browser wait --load networkidle ; agent-browser snapshot -i
```
切换「全局角色池」Tab。Expected：「默认角色模板」区显示租户管理员/销售/库存 3 模板；「全局可用角色」区显示已创建的 g- 角色（含 channels 状态）。

- [ ] **Step 6: 验证超管建全局可用角色**

新建弹层选「全局可用」（默认，不勾选租户）→ 创建 → 出现 `g-<code>` 角色于池中，channels 空。
Expected: 任何租户看不到（需切租户验证可选）。

- [ ] **Step 7: 验证超管建「全局默认」角色（勾选 A、B）**

新建弹层选「全局默认」→ 勾选渠道 A、B → 创建。Expected: A、B 本店角色列表出现该角色；池中该角色标注 A、B「已入本地」，其它租户「可引用」。

- [ ] **Step 8: 验证「管理租户」继续分发与取消（防重复）**

对刚建的全局角色点「管理租户」→ 勾选渠道 C → 保存。Expected: C 本店出现该角色，channels 含 C。再次勾选 C 保存 → 不重复关联。取消 A → A 本店列表移除。

- [ ] **Step 9: 验证租户自助「导入默认模板」+「引用全局角色」**

以租户管理员（非超管）登录 https://<admin域>/pages/platform/roles/index （无 channelId）。Expected:「导入默认模板」→ 本店角色列表出现 t{n}-tenant-admin/sales/stock 副本（幂等不重复）；「可引用角色」→ 引用 g- 全局可用角色到本店。

- [ ] **Step 10: 截图留证 + 清理临时文件**

Run: `agent-browser screenshot _role_pool_verify.png`
清理：验证产生的 `_*.png`、`_shots/`、`_diag*.js` 等临时文件，确保不污染 git 工作区。

---

## 涉及文件清单（汇总）

- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`（+编译产物 lib/…js）
- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`（+lib）
- `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`（+lib）
- `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（+lib）
- `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`
- `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`
- `d:\zhao\vshop\web-admin\dist\build\h5`（构建产物）