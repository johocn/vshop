# 租户成员角色权限门禁与密码管理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「本租户人员」页面实现：角色下拉去重且只展示可授角色（后端权威「严格小于」门禁）、租户管理员自助重置低权限成员密码（默认 `you123123`）、本人主动修改密码（校验旧密码）。

**Architecture:** 后端（vendure cjk-plugin）为权限边界唯一权威——`rolesForChannel` 去重并按操作者权限标注 `grantable`、`memberToView` 计算 `canResetPassword`、创建人员/改角色/重置密码三入口统一走 `assertCanGrant`（目标权限 ⊆ 操作者权限且不含 `TenantMemberManage`/`TenantRoleManage`，超管豁免）；`changeMyPassword` 增加旧密码校验（首登强改密跳过）。前端（vshop web-admin）members 页按后端标记显隐「重置密码」与过滤角色下拉、改密页支持主动改密模式。

**Tech Stack:** Vendure（cjk-plugin，TypeScript/NestJS/GraphQL）、Vitest、Vite+uni-app（web-admin）、Playwright（手机视口回归）。

**关联设计文档：** `docs/superpowers/specs/2026-09-13-tenant-member-roles-password-design.md`

---

## 任务概览与文件地图

| 任务 | 仓库 | 文件 |
|---|---|---|
| T1 后端纯函数 + 单测 | vendure | `packages/cjk-plugin/src/tenant/tenant-member.service.ts`（新增导出纯函数）、`packages/cjk-plugin/src/tenant/tenant-member.service.spec.ts`（新建） |
| T2 后端权限门禁 + 自助重置 | vendure | `packages/cjk-plugin/src/tenant/tenant-member.service.ts`、`packages/cjk-plugin/src/tenant/tenant-member.resolver.ts` |
| T3 后端改密旧密码校验 | vendure | `packages/cjk-plugin/src/tenant/tenant-member.service.ts`、`packages/cjk-plugin/src/tenant/tenant-member.resolver.ts` |
| T4 前端 API 层 | vshop | `web-admin/src/apis/auth.ts`、`web-admin/src/apis/tenant-admin.ts` |
| T5 前端 members 页 | vshop | `web-admin/src/pages/platform/members/index.vue` |
| T6 前端改密页双模式 | vshop | `web-admin/src/pages/change-password/index.vue` |
| T7 本地构建验证 | 两仓 | `npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`、`npm run test -w @vendure/cjk-plugin`、web-admin `npm run build:h5` |
| T8 部署 + 手机视口回归 | 两仓 | vendure `git pull` + pm2 restart；web-admin `scripts/deploy.mjs`；Playwright 截图 |

---

### Task 1: 后端权限判定纯函数 + 单测

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.spec.ts`

背景：把「可授判定」「角色去重」抽成无 DB 依赖的纯函数，便于单测，同时被 T2 的服务方法复用。

- [ ] **Step 1: 写失败测试**

Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import { canGrantRole, dedupeRolesByLabel } from './tenant-member.service';

describe('canGrantRole', () => {
    const operator = new Set(['ReadProduct', 'UpdateProduct', 'ReadOrder']);

    it('子集可授', () => {
        expect(canGrantRole(operator, ['ReadProduct'])).toBe(true);
        expect(canGrantRole(operator, ['ReadProduct', 'UpdateProduct'])).toBe(true);
    });

    it('超出操作者权限不可授', () => {
        expect(canGrantRole(operator, ['ReadProduct', 'DeleteProduct'])).toBe(false);
        expect(canGrantRole(operator, ['CreateOrder'])).toBe(false);
    });

    it('含管理权限不可授（防链式提权）', () => {
        expect(canGrantRole(operator, ['ReadProduct', 'TenantMemberManage'])).toBe(false);
        expect(canGrantRole(operator, ['TenantRoleManage'])).toBe(false);
    });

    it('忽略 Authenticated 基础权限', () => {
        expect(canGrantRole(operator, ['Authenticated', 'ReadProduct'])).toBe(true);
    });

    it('空角色可授', () => {
        expect(canGrantRole(operator, [])).toBe(true);
    });
});

describe('dedupeRolesByLabel', () => {
    const local = (id: string, code: string, description: string) => ({ id, code, description });
    const global = (id: string, code: string, description: string) => ({ id, code: `g-${code}`, description });

    it('同名本地优先于全局', () => {
        const roles = [global('1', 'sales', '销售'), local('2', 't1-sales', '销售')];
        const out = dedupeRolesByLabel(roles);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('2');
    });

    it('不同名不合并', () => {
        const roles = [local('1', 't1-sales', '销售'), local('2', 't1-stock', '库存')];
        expect(dedupeRolesByLabel(roles)).toHaveLength(2);
    });

    it('description 为空时退回 code', () => {
        const roles = [local('1', 't1-sales', ''), global('2', 'sales', '')];
        const out = dedupeRolesByLabel(roles);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('1');
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd d:\zhao\vendure && npm run test -w @vendure/cjk-plugin`
Expected: FAIL（`canGrantRole`/`dedupeRolesByLabel` 未定义）

- [ ] **Step 3: 实现纯函数**

在 `tenant-member.service.ts` 的 `DEFAULT_ADMIN_PASSWORD`（L161）之后、`@Injectable()` 之前新增：

```ts
/** 可授判定：目标角色权限 ⊆ 操作者权限，且不含租户管理类权限（防链式提权）。
 *  Authenticated 为所有角色基础权限，不计入比较。 */
export function canGrantRole(operatorPerms: Set<string>, rolePermissions: string[]): boolean {
    const perms = rolePermissions.filter((p) => p !== 'Authenticated');
    return (
        perms.every((p) => operatorPerms.has(p)) &&
        !perms.some((p) => p === TenantMemberManagePermission || p === TenantRoleManagePermission)
    );
}

/** 角色去重：按展示名（description || code）合并，同名时本地角色（code 非 g- 前缀）优先于全局角色 */
export function dedupeRolesByLabel(roles: any[]): any[] {
    const seen = new Map<string, any>();
    for (const r of roles) {
        const key = String(r.description || r.code);
        const cur = seen.get(key);
        if (!cur) {
            seen.set(key, r);
            continue;
        }
        const curGlobal = String(cur.code).startsWith(GLOBAL_ROLE_PREFIX);
        const rGlobal = String(r.code).startsWith(GLOBAL_ROLE_PREFIX);
        if (curGlobal && !rGlobal) seen.set(key, r);
    }
    return [...seen.values()];
}
```

文件顶部 import 增加（L4-14 区域）：`import { TenantMemberManagePermission, TenantRoleManagePermission } from './tenant-permissions';`

- [ ] **Step 4: 运行确认通过**

Run: `cd d:\zhao\vendure && npm run test -w @vendure/cjk-plugin`
Expected: PASS（canGrantRole 5 用例 + dedupeRolesByLabel 3 用例）

- [ ] **Step 5: Commit**

```bash
git -C d:\zhao\vendure add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/src/tenant/tenant-member.service.spec.ts
git -C d:\zhao\vendure commit -m "feat(tenant): 权限门禁与角色去重纯函数 + 单测"
```

---

### Task 2: 后端权限门禁接入 + 租户自助重置密码

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`

- [ ] **Step 1: 新增 channelOperatorPerms 与 assertCanGrant**

在 `TenantMemberService` 类的 `assertRolesInChannel`（L200-204）之后新增两个方法：

```ts
/** 当前登录者在本租户（ctx.channelId）的业务权限并集。
 *  Vendure 缓存 session 用户用短键 n：CachedSessionUser.channels = { id, token, code, permissions }[]。 */
private channelOperatorPerms(ctx: RequestContext): Set<string> {
    const channels: any[] = (ctx as any).session?.user?.n || [];
    const cur = channels.find((c: any) => String(c.id) === String(ctx.channelId));
    const perms: string[] = cur?.permissions || [];
    return new Set(perms.filter((p) => p !== 'Authenticated' && p !== Permission.SuperAdmin));
}

/** 权限门禁（权威）：非超管授予的角色必须 canGrantRole 通过，否则抛错。调用点须已过 assertRolesInChannel。 */
async assertCanGrant(ctx: RequestContext, roleIds: ID[]): Promise<void> {
    if (ctx.userHasPermissions([Permission.SuperAdmin])) return;
    if (!roleIds || roleIds.length === 0) return;
    const operatorPerms = this.channelOperatorPerms(ctx);
    const roleRepo = this.connection.getRepository(ctx, Role);
    for (const roleId of roleIds) {
        const role = await roleRepo.findOne({ where: { id: String(roleId) } } as any);
        if (!role) throw new Error('ROLE_NOT_FOUND');
        if (!canGrantRole(operatorPerms, (role.permissions || []) as string[])) {
            throw new Error('PERMISSION_EXCEEDS_OPERATOR');
        }
    }
}
```

- [ ] **Step 2: 接入创建人员与改角色**

在 `createTenantAdministrator`（L655-657 的 `assertRolesInChannel` 之后）追加：

```ts
        await this.assertCanGrant(ctx, input.roleIds);
```

在 `syncMemberRolesInChannel`（L609-611 的 `assertRolesInChannel` 之后）追加：

```ts
        await this.assertCanGrant(ctx, roleIds);
```

> `syncMemberRolesInChannel` 同时被 `updateTenantMemberRoles` 与 `linkMember` 调用，两入口一并受门禁约束。

- [ ] **Step 3: rolesForChannel 去重 + grantable 标注**

将 `rolesForChannel`（L310-315）整体替换为：

```ts
    /** 按 channelId 直查该租户全部角色：同名去重（本地优先全局），并按操作者权限标注 grantable（超管全 true）。 */
    async rolesForChannel(ctx: RequestContext, channelId: ID): Promise<any[]> {
        const repo = this.connection.getRepository(ctx, Role);
        const all = await repo.find({ relations: ['channels'] });
        const chId = String(channelId);
        const roles = (all as any[]).filter((r) => (r.channels || []).some((c: any) => String(c.id) === chId));
        const deduped = dedupeRolesByLabel(roles);
        if (ctx.userHasPermissions([Permission.SuperAdmin])) {
            return deduped.map((r) => ({ ...r, grantable: true }));
        }
        const operatorPerms = this.channelOperatorPerms(ctx);
        return deduped.map((r) => ({
            ...r,
            grantable: canGrantRole(operatorPerms, (r.permissions || []) as string[]),
        }));
    }
```

- [ ] **Step 4: memberToView 增加 canResetPassword**

将 `memberToView`（L646-651）整体替换为：

```ts
    /** 将 TenantMember 组装为含 roleIds / canResetPassword 的视图对象 */
    async memberToView(ctx: RequestContext, member: TenantMember): Promise<any> {
        const roleIds = await this.memberRoleIdsInChannel(ctx, member);
        const view: any = { ...member, roleIds };
        if (String((ctx as any).session?.user?.id) === String(member.administratorId)) {
            view.canResetPassword = false; // 不允许重置自己的密码
        } else if (ctx.userHasPermissions([Permission.SuperAdmin])) {
            view.canResetPassword = true;
        } else {
            const roleRepo = this.connection.getRepository(ctx, Role);
            const roles = roleIds.length
                ? await roleRepo.findByIds(roleIds.map(String) as any)
                : [];
            const perms = (roles as any[]).flatMap((r) => (r.permissions || []) as string[]);
            view.canResetPassword = canGrantRole(this.channelOperatorPerms(ctx), perms);
        }
        return view;
    }
```

- [ ] **Step 5: 新增租户自助重置密码服务方法**

在 `resetAdminPassword`（L721-734）之后新增：

```ts
    /** 租户自助：重置本租户成员密码为默认口令 you123123（目标权限必须低于操作者） */
    async resetMyMemberPassword(ctx: RequestContext, memberId: ID): Promise<TenantMember> {
        const repo = this.connection.getRepository(ctx, TenantMember);
        const member = await repo.findOne({ where: { id: String(memberId) } });
        if (!member) throw new Error('MEMBER_NOT_FOUND');
        if (String(member.channelId) !== String(ctx.channelId)) throw new Error('MEMBER_NOT_IN_CHANNEL');
        const view = await this.memberToView(ctx, member);
        if (!view.canResetPassword) throw new Error('PERMISSION_EXCEEDS_OPERATOR');
        await this.administratorService.update(ctx, {
            id: String(member.administratorId) as any,
            password: DEFAULT_ADMIN_PASSWORD,
        } as any);
        if (member.mustChangePassword) {
            member.mustChangePassword = false;
            await repo.save(member);
        }
        return member;
    }
```

- [ ] **Step 6: Resolver 新增 mutation**

在 `tenant-member.resolver.ts` 的 `tenantChangeMyPassword`（L183-189）之前新增：

```ts
    /** 租户自助重置本租户成员密码为默认口令（权限门禁见 service） */
    @Mutation()
    @Allow(tenantMemberManagePermission.Permission)
    async myResetTenantMemberPassword(@Ctx() ctx: RequestContext, @Args('id') id: string): Promise<boolean> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.resetMyMemberPassword(ctx, id);
        return true;
    }
```

- [ ] **Step 7: 类型编译验证**

Run: `cd d:\zhao\vendure && npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`
Expected: 无报错

- [ ] **Step 8: Commit**

```bash
git -C d:\zhao\vendure add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/src/tenant/tenant-member.resolver.ts
git -C d:\zhao\vendure commit -m "feat(tenant): 角色授权门禁（严格小于）+ 租户自助重置密码"
```

---

### Task 3: 后端本人改密增加旧密码校验

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`

- [ ] **Step 1: 服务方法改签名并校验旧密码**

将 `changeMyPassword`（L687-701）整体替换为：

```ts
    /** 当前登录者修改自身密码：主动改密校验旧密码；首登强改密（未传旧密码或存在 mustChangePassword）跳过校验。更新后清除本租户首登强改密标志 */
    async changeMyPassword(ctx: RequestContext, oldPassword: string | null, newPassword: string): Promise<void> {
        if (!newPassword || newPassword.length < 8) throw new Error('WEAK_PASSWORD');
        const adminId = String((ctx as any).session?.user?.id);
        if (!adminId) throw new Error('NOT_AUTHENTICATED');
        const adminRepo = this.connection.getRepository(ctx, Administrator);
        const admin = await adminRepo.findOne({ where: { id: adminId }, relations: ['user'] });
        if (!admin) throw new Error('ADMIN_NOT_FOUND');
        const memberRepo = this.connection.getRepository(ctx, TenantMember);
        const members = await memberRepo.find({ where: { administratorId: adminId } });
        const mustChange = members.some((m) => m.mustChangePassword);
        if (oldPassword && !mustChange) {
            const ok = await this.authService.verifyUserPassword(ctx, (admin as any).user?.id, oldPassword);
            if (ok !== true) throw new Error('WRONG_OLD_PASSWORD');
        }
        await this.administratorService.update(ctx, { id: adminId as any, password: newPassword } as any);
        for (const m of members) {
            if (m.mustChangePassword) {
                m.mustChangePassword = false;
                await memberRepo.save(m);
            }
        }
    }
```

构造函数注入 `AuthService`：将构造器参数（L166-170）改为：

```ts
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private roleService: RoleService,
        private channelService: ChannelService,
        private authService: AuthService,
        @Optional() @Inject(CJK_PLUGIN_OPTIONS) private pluginOptions?: CjkPluginOptions,
    ) {}
```

import 增加：`AuthService`（加入 L2-14 的 `@vendure/core` import 列表）。

- [ ] **Step 2: Resolver 改签名**

将 `tenantChangeMyPassword`（L180-189）替换为：

```ts
    /** 当前登录者修改自身密码（主动改密传旧密码校验；首登强改密 oldPassword 传 null 跳过校验） */
    @Mutation()
    @Allow(Permission.Authenticated)
    async tenantChangeMyPassword(
        @Ctx() ctx: RequestContext,
        @Args('oldPassword') oldPassword: string | null,
        @Args('newPassword') newPassword: string,
    ): Promise<boolean> {
        await this.tenantMemberService.changeMyPassword(ctx, oldPassword, newPassword);
        return true;
    }
```

- [ ] **Step 3: 类型编译验证**

Run: `cd d:\zhao\vendure && npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`
Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vendure add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/src/tenant/tenant-member.resolver.ts
git -C d:\zhao\vendure commit -m "feat(tenant): 本人改密增加旧密码校验（首登强改密跳过）"
```

---

### Task 4: 前端 API 层

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\auth.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

- [ ] **Step 1: auth.ts changeMyPassword 增加 oldPassword**

将 `changeMyPassword`（auth.ts L74-79）替换为：

```ts
/** 修改当前登录者自身密码（主动改密传 oldPassword；首登强改密不传，后端跳过旧密码校验） */
export async function changeMyPassword(newPassword: string, oldPassword?: string): Promise<void> {
  await getAdminClient().request(
    `mutation ChangeMyPassword($oldPassword: String, $newPassword: String!) { tenantChangeMyPassword(oldPassword: $oldPassword, newPassword: $newPassword) }`,
    { oldPassword: oldPassword ?? null, newPassword },
  );
}
```

- [ ] **Step 2: tenant-admin.ts 类型与查询增加新字段**

`TenantMemberItem`（L16-26）增加字段：

```ts
  canResetPassword?: boolean;
```

`RoleItem`（L28-34）增加字段：

```ts
  grantable?: boolean;
```

`fetchMyTenantMembers`（L292-297）的 GraphQL 字段追加 `canResetPassword`：

```ts
export async function fetchMyTenantMembers(): Promise<TenantMemberItem[]> {
  const res = await getAdminClient().request<{ tenantMembers: TenantMemberItem[] }>(
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark phone roleIds createdAt canResetPassword } }`,
  );
  return res.tenantMembers;
}
```

`fetchMyTenantRoles`（L318-323）的 GraphQL 字段追加 `grantable`：

```ts
export async function fetchMyTenantRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ myTenantRoles: RoleItem[] }>(
    `query MyTenantRoles { myTenantRoles { id code description permissions grantable } }`,
  );
  return res.myTenantRoles;
}
```

在 `updateTenantMemberRolesToMember`（L325-330）之后新增：

```ts
/** 租户自助重置本租户成员密码为默认口令 you123123 */
export async function resetTenantMemberPasswordToDefault(memberId: string): Promise<void> {
  await getAdminClient().request(
    `mutation MyResetTenantMemberPassword($id: ID!) { myResetTenantMemberPassword(id: $id) }`,
    { id: memberId },
  );
}
```

- [ ] **Step 3: 前端类型检查**

Run: `cd d:\zhao\vshop\web-admin && npx vue-tsc --noEmit -p tsconfig.json`
Expected: 无报错（若项目无 vue-tsc 脚本则以 `npm run build:h5` 的编译阶段代替，见 T7）

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/apis/auth.ts web-admin/src/apis/tenant-admin.ts
git -C d:\zhao\vshop commit -m "feat(web-admin): 改密 API 支持旧密码；成员/角色 API 增加权限标记与自助重置"
```

---

### Task 5: 前端 members 页（重置入口 + 角色过滤去重 + 修改密码入口）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\members\index.vue`

- [ ] **Step 1: script 部分改造**

import 增加（L83-89 区域）：

```ts
import { changeMyPassword } from '../../../apis/auth';
```

改为（在现有 `updateTenantMemberRolesToMember` 后追加）：

```ts
import {
  fetchMyTenantMembers, createTenantMember, setTenantMemberEnabled, deleteTenantMember,
  fetchMyTenantRoles, updateTenantMemberRolesToMember, resetTenantMemberPasswordToDefault,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';
```

`load()`（L109-112）改为（按 id 去重兜底 + 过滤不可授角色）：

```ts
async function load() {
  members.value = await fetchMyTenantMembers();
  const roles = await fetchMyTenantRoles();
  roles.value = Array.from(new Map(roles.map((r) => [r.id, r])).values());
}
```

新增「可授角色」计算属性（`selectedRoleNames` 之后）：

```ts
const grantableRoles = computed(() => roles.value.filter((r) => r.grantable !== false));
```

新增重置密码与修改密码方法（`onRemove` 之后）：

```ts
function onResetPassword(m: TenantMemberItem) {
  uni.showModal({
    title: '重置密码',
    content: `确定将「${m.displayName || m.administratorId}」的密码重置为默认口令 you123123？`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await resetTenantMemberPasswordToDefault(m.id);
        uni.showToast({ title: '已重置为默认口令 you123123', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '重置失败', icon: 'none' });
      }
    },
  });
}

function onChangeMyPassword() {
  uni.navigateTo({ url: '/pages/change-password/index?manual=1' });
}
```

`togglePickRole` / `toggleTargetRole`（L119-123 / L157-161）增加不可授保护（置灰项不可点）：

```ts
function togglePickRole(id: string) {
  const r = roles.value.find((x) => x.id === id);
  if (r && r.grantable === false) return;
  const i = addForm.value.roleIds.indexOf(id);
  if (i >= 0) addForm.value.roleIds.splice(i, 1);
  else addForm.value.roleIds.push(id);
}
```

```ts
function toggleTargetRole(id: string) {
  const r = roles.value.find((x) => x.id === id);
  if (r && r.grantable === false) return;
  const i = roleTargetIds.value.indexOf(id);
  if (i >= 0) roleTargetIds.value.splice(i, 1);
  else roleTargetIds.value.push(id);
}
```

- [ ] **Step 2: template 部分改造**

头部（L5-7）增加「修改密码」入口：

```html
      <view class="row head">
        <text class="title">本租户人员</text>
        <view class="head-ops">
          <text class="head-link" @tap="onChangeMyPassword">修改密码</text>
          <text class="head-btn" @tap="onAdd">＋添加人员</text>
        </view>
      </view>
```

成员项（L8-15）的 info 区增加「重置密码」链接（仅 `m.canResetPassword` 且非自己时显示；后端已对「自己」返回 false）：

```html
      <view class="item" v-for="m in members" :key="m.id">
        <view class="info">
          <text class="name">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}<text v-if="m.phone"> · {{ m.phone }}</text> · <text class="link" @tap="openRoles(m)">角色</text></text>
          <text v-if="m.canResetPassword" class="reset" @tap="onResetPassword(m)">重置密码</text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggle(m, $event)" />
        <text class="link" @tap="onRemove(m)">移除</text>
      </view>
```

两个角色弹层（L44-59 与 L61-76）的 `v-for` 改为 `grantableRoles`，且不可授项置灰：

```html
        <view v-for="r in grantableRoles" :key="r.id" class="pick-item" @tap="togglePickRole(r.id)">
          <text class="pick-item-name" :class="{ on: addForm.roleIds.includes(r.id), dis: r.grantable === false }">{{ r.description || r.code }}</text>
          <text v-if="r.grantable === false" class="dis-tag">不可授</text>
          <text v-else class="check" :class="{ on: addForm.roleIds.includes(r.id) }">{{ addForm.roleIds.includes(r.id) ? '✓' : '' }}</text>
        </view>
```

（`showRoles` 弹层同样：`v-for="r in grantableRoles"`、`toggleTargetRole`、`dis`/`dis-tag`。）

> 说明：`grantableRoles` 已过滤 `grantable === false` 的项，置灰样式为防御性兜底（理论上不再出现）。若希望展示不可授项并置灰，改为 `v-for="r in roles"` 并保留 `dis` 样式，两种皆可——推荐直接过滤（更简洁，与 mockup 一致）。

- [ ] **Step 3: style 增加新样式**

在 `</style>` 前追加：

```scss
.head-ops { display: flex; align-items: center; gap: 16rpx; }
.head-link { font-size: 26rpx; color: #666; }
.reset { display: block; font-size: 22rpx; color: #e64340; margin-top: 4rpx; }
.pick-item-name.dis { color: #bbb; }
.dis-tag { font-size: 22rpx; color: #bbb; }
```

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/platform/members/index.vue
git -C d:\zhao\vshop commit -m "feat(web-admin): 成员页角色过滤去重 + 自助重置密码 + 修改密码入口"
```

---

### Task 6: 前端改密页双模式

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\change-password\index.vue`

- [ ] **Step 1: 页面支持 manual 模式（主动改密显示旧密码框）**

将 template 的 `.brand` 与 `.card` 区域替换为：

```html
    <view class="brand">
      <view class="dot" />
      <text class="t1">{{ isManual ? '修改密码' : '设置新密码' }}</text>
      <text class="t2">{{ isManual ? '修改后下次登录使用新密码' : '首次登录需修改初始密码后方可使用' }}</text>
    </view>
    <view class="card">
      <input v-if="isManual" v-model="oldPw" class="field" :password="!showPwd" placeholder="原密码" />
      <input v-model="pw1" class="field" :password="!showPwd" placeholder="新密码（≥8位，含大小写/数字）" />
      <input v-model="pw2" class="field" :password="!showPwd" placeholder="再次输入新密码" @confirm="submit" />
      <view class="opt"><text @tap="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</text></view>
      <button class="btn" :disabled="loading" @tap="submit">{{ loading ? '提交中…' : (isManual ? '确认修改' : '绑定新密码') }}</button>
      <view v-if="err" class="err">{{ err }}</view>
    </view>
```

script 部分改造：

```ts
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { changeMyPassword } from '../../apis/auth';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

const auth = useAuthStore();
const tenant = useTenantStore();
const isManual = ref(false);
const oldPw = ref('');
const pw1 = ref('');
const pw2 = ref('');
const showPwd = ref(false);
const loading = ref(false);
const err = ref('');

onLoad((q) => {
  isManual.value = q?.manual === '1';
});
```

`submit` 改造：

```ts
async function submit() {
  err.value = '';
  if (isManual.value && !oldPw.value) {
    err.value = '请输入原密码';
    return;
  }
  if (!pw1.value || pw1.value.length < 8) {
    err.value = '密码至少 8 位';
    return;
  }
  if (pw1.value !== pw2.value) {
    err.value = '两次输入的新密码不一致';
    return;
  }
  loading.value = true;
  try {
    await changeMyPassword(pw1.value, isManual.value ? oldPw.value : undefined);
    await auth.loadAccess(); // 刷新 mustChangePassword 标志
    if (isManual.value) {
      uni.navigateBack();
      uni.showToast({ title: '密码已修改', icon: 'none' });
    } else if (tenant.token) {
      uni.redirectTo({ url: '/pages/dashboard/index' });
    } else {
      uni.redirectTo({ url: '/pages/channel-select/index' });
    }
  } catch (e: any) {
    err.value = e?.response?.errors?.[0]?.message || '修改失败，请重试';
  } finally {
    loading.value = false;
  }
}
```

> 注意：pages.json 中该页 `navigationStyle: "custom"`，manual 模式下无返回按钮。为可返回，需将 `navigationStyle` 改为默认或在 manual 模式手动渲染返回按钮。推荐改为默认导航栏（删除 `"navigationStyle": "custom"`），首登与手动模式均可用系统返回；首登模式提交成功后仍 `redirectTo` 覆盖历史。

- [ ] **Step 2: pages.json 导航栏调整**

Modify: `d:\zhao\vshop\web-admin\src\pages.json` L4：

```json
    { "path": "pages/change-password/index", "style": { "navigationBarTitleText": "设置新密码" } },
```

- [ ] **Step 3: 构建验证**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/change-password/index.vue web-admin/src/pages.json
git -C d:\zhao\vshop commit -m "feat(web-admin): 改密页支持主动修改密码模式（旧密码校验）"
```

---

### Task 7: 本地构建验证（两端）

**Files:**
- 无（纯验证）

- [ ] **Step 1: vendure 编译 + 单测**

Run: `cd d:\zhao\vendure && npx tsc --noEmit -p packages/cjk-plugin/tsconfig.json`
Expected: 无报错

Run: `cd d:\zhao\vendure && npm run test -w @vendure/cjk-plugin`
Expected: 全部 PASS（含 T1 新增 8 用例）

- [ ] **Step 2: web-admin 构建**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功，无 TS/编译错误

- [ ] **Step 3: Commit（如有未提交改动）**

```bash
git -C d:\zhao\vendure status
git -C d:\zhao\vshop status
```

---

### Task 8: 部署 + 手机视口回归

**Files:**
- 无（部署与验证）

- [ ] **Step 1: 部署 vendure 后端**

```bash
ssh qing "cd /www/apps/vendure && git pull && pm2 restart vendure"
```

> 服务器上如有构建步骤按服务器既有流程执行（部署铁律：本地构建，服务器只 pull + restart；若该仓库是源码部署则在服务器构建，按实际 `_deploy.ps1` 流程执行）。

- [ ] **Step 2: 部署 web-admin**

Run: `cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
Expected: scp 产物 → 服务器解压/拷入 → 完成

- [ ] **Step 3: 手机视口回归截图（Playwright，390×844）**

对 `https://e.joho.cn/guanli` 登录后依次截图：
1. 成员列表：普通租户管理员视角（应显示「修改密码」入口、低权限成员行有「重置密码」、自己无）
2. 添加人员弹层：角色下拉无重复项、无「租户管理员」等不可授项
3. 分配角色弹层：同上
4. 修改密码页（manual=1）：含「原密码」输入框

Expected: 截图与设计 mockup 一致

- [ ] **Step 4: 操作手册补充**

在运营端操作手册（`d:\zhao\vshop\docs` 或既有手册位置）补充：租户管理员可重置低权限成员密码（默认 you123123）、可为自己修改密码、可授角色范围说明。将截图补入手册。

- [ ] **Step 5: Commit**

```bash
git -C d:\zhao\vshop add docs
git -C d:\zhao\vshop commit -m "docs: 成员密码管理与角色授权操作手册 + 手机截图"
```
