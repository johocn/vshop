# 租户/人员/角色·管理体验补齐 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把新建租户/新建用户从单输入弹窗升级为完整表单与可复制口令弹层，补齐"人员→角色"分配入口，并让所有创建/保存失败的错误信息可见。

**Architecture:** 后端 `cjk-plugin` 补三块：租户编号/店铺名写入、`TenantMember.phone` 幂等补列、`updateTenantMemberRoles` 改角色 mutation（含归属+白名单校验）；前端 `web-admin` 改用表单弹层 + 口令复制弹层 + 行内改角色，并统一从后端 `errors[0].message` 提取错误提示。

**Tech Stack:** Vendure (NestJS + TypeORM + GraphQL)、graphql-request v7、uni-app (HBuilder X)、TypeScript、SCSS。

**两个区分仓库**：
- 后端 `d:\zhao\vendure`（提交前缀 `feat(cjk-plugin)`）
- 前端 `d:\zhao\vshop`（提交前缀 `feat(web-admin)`，HBuilder X 中重编译，本计划不做前端构建）

**验证约定**（项目无 resolver 单元测试框架，用"构建 + 产物 grep + 运行时验证"作为验证）：
- 后端：在 `d:\zhao\vendure` 执行 `node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json`；用 `Select-String` 在 `packages/cjk-plugin/lib/` 产物里 grep 关键串确认已打包。
- 前端：改完在 HBuilder X 重编译，`script` 内 `onLoad` 用 `uni.showToast` 反馈。

---

## 文件结构

**后端 `d:\zhao\vendure\packages\cjk-plugin\src\tenant\`**
- `tenant-member.service.ts`：租户创建自动编号、`updateChannel` 写 `shopName`、`phone` 落库、新增 `updateTenantMemberRoles`。
- `tenant-member.entity.ts`：新增 `phone` 列。
- `tenant-member.resolver.ts`（人员端）：新增 `myUpdateTenantMemberRoles` mutation + `@ResolveField roleIds`。
- `tenant-admin.resolver.ts`（超管端）：新增 `updateTenantMemberRoles` mutation。
- `tenant-admin.resolver.ts::createTenant` 入参签名调整（去 code/tenantNo 必填）。

**后端 `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-tenant-member-column.ts`**：补 `phone` 列（复用既有 `TenantMemberColumnMigration` 的幂等模式，扩展其列补逻辑）。

**后端 `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`**：admin schema SDL —— `CreateTenantInput` 去 code/tenantNo；`type TenantMember` 加 `phone`、`roleIds`；两种输入加 `phone`；`extend type Mutation` 加 `updateTenantMemberRoles`、`myUpdateTenantMemberRoles`。

**前端 `d:\zhao\vshop\web-admin\src\`**
- `apis/client.ts`：新增错误提取 helper `graphQlErrorMsg`。
- `apis/tenant-admin.ts`：新增 `updateTenantMemberRolesToMember`；`fetchMyTenantMembers`/`fetchTenantAdministrators` 查询补 `phone roleIds`；`TenantMemberItem` 加 `phone`、`roleIds`；`createTenantMember`/`fetchMyTenantRoles` 等签名补字段。
- `components/PasswordPopup.vue`：新增密码复制弹层。
- `pages/platform/tenants/index.vue`：新建租户改表单弹层。
- `pages/platform/members/index.vue`：新建用户改表单弹层 + 口令弹层 + 行内改角色。

---

## Task 1: 后端 —— 租户创建自动编号 + `updateChannel` 写 shopName

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`（`createChannel`、`updateChannel`）

- [ ] **Step 1: 修改 `createChannel` 为自动编号**

找到 `tenant-member.service.ts` 的 `createChannel` 方法（当前约 191-210 行），整体替换为：

```typescript
    /** 新建租户：自动分配 tenantNo（当前最大+1），code 由 tenantNo 派生 `t{tenantNo}`，避免手输冲突 */
    async createChannel(
        ctx: RequestContext,
        input: { name: string; token?: string; isOfficial?: boolean },
    ): Promise<any> {
        const tenantNo = await this.nextTenantNo(ctx);
        const code = `t${tenantNo}`;
        const channel = await this.channelService.create(ctx, {
            code,
            token: input.token,
            defaultLanguageCode: 'zh_Hans' as any,
            currencyCode: 'CNY' as any,
            pricesIncludeTax: true,
            customFields: {
                tenantNo,
                isOfficial: input.isOfficial ?? false,
                enabled: true,
                shopName: input.name,
            },
        } as any);
        Logger.info(`已创建租户 ${code}（tenantNo=${tenantNo}）`, loggerCtx);
        return channel;
    }

    /** 取当前最大 tenantNo，自增 1；无数据时从 0 开始（第 1 个租户得到 1） */
    private async nextTenantNo(ctx: RequestContext): Promise<number> {
        const result = await this.channelService.findAll(ctx, { skip: 0, take: 10000 });
        const nos = (result.items as any[])
            .map((c: any) => Number(c?.customFields?.tenantNo))
            .filter((n: number) => Number.isFinite(n));
        return (nos.length ? Math.max(...nos) : 0) + 1;
    }
```

- [ ] **Step 2: 修改 `updateChannel` 写入 shopName**

将 `updateChannel` 方法（当前约 221-233 行）整体替换为：

```typescript
    /** 更新租户基础信息（仅超管）：name → shopName 一并写入 */
    async updateChannel(
        ctx: RequestContext,
        channelId: ID,
        input: { name?: string; tenantNo?: number; isOfficial?: boolean },
    ): Promise<void> {
        await this.channelService.update(ctx, {
            id: channelId,
            customFields: {
                tenantNo: input.tenantNo,
                isOfficial: input.isOfficial,
                shopName: input.name,
            },
        } as any);
    }
```

- [ ] **Step 3: 同步修改超管 resolver 入参签名**

在 `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts` 把 `createTenant` 的入参类型从
`{ code: string; token?: string; name: string; tenantNo?: number; isOfficial?: boolean }`
改为 `{ name: string; token?: string; isOfficial?: boolean }`：

```typescript
    @Mutation()
    @Allow(Permission.SuperAdmin)
    async createTenant(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { name: string; token?: string; isOfficial?: boolean } },
    ): Promise<any> {
        return this.tenantMemberService.createChannel(ctx, args.input);
    }
```

- [ ] **Step 4: 构建并验证产物**

```bash
cd d:\zhao\vendure
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
Select-String packages/cjk-plugin/lib -Pattern "nextTenantNo, shopName: input" -SimpleMatch
```
预期：`tsc` 无编译错误；grep 命中 `nextTenantNo` 相关代码（`shopName: input` 命中任意符合项即可）。

---

## Task 2: 后端 —— `TenantMember.phone` 幂等补列

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.entity.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-tenant-member-column.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`

- [ ] **Step 1: 实体加 `phone` 列**

在 `tenant-member.entity.ts` 的 `remark` 字段之后新增：

```typescript
    /** 手机号（选填） */
    @Column({ type: 'varchar', length: 32, nullable: true })
    phone!: string | null;
```

- [ ] **Step 2: 迁移补列**

将 `migrate-tenant-member-column.ts` 的 `onApplicationBootstrap` 改为对**两列**统一幂等补列（`must_change_password` 与 `phone`）：

```typescript
    async onApplicationBootstrap() {
        try {
            const metadata = this.connection.getMetadata('TenantMember');
            const tableName = metadata.tableName;
            const queryRunner = this.connection.createQueryRunner();
            try {
                const ensure = async (name: string, type: string, nullable: boolean, defaultVal?: unknown) => {
                    if (!(await queryRunner.hasColumn(tableName, name))) {
                        await queryRunner.addColumn(
                            tableName,
                            new TableColumn({
                                name,
                                type,
                                isNullable: nullable,
                                default: defaultVal,
                            }),
                        );
                    }
                };
                await ensure('must_change_password', 'boolean', false, false);
                await ensure('phone', 'varchar(32)', true, undefined);
            } finally {
                await queryRunner.release();
            }
        } catch (e: any) {
            // 补列失败不阻塞启动，等待下次启动重试
            // eslint-disable-next-line no-console
            console.error('[TenantMemberColumnMigration] failed to ensure columns:', e?.message);
        }
    }
```

- [ ] **Step 3: `CreateTenantAdminInput` 加 `phone`，创建时落库**

在 `tenant-member.service.ts` 的 `CreateTenantAdminInput` 接口（约 113-124 行）加 `phone?: string;`：

```typescript
export interface CreateTenantAdminInput {
    firstName?: string;
    lastName?: string;
    emailAddress: string;
    password?: string;
    roleIds: ID[];
    displayName?: string;
    remark?: string;
    phone?: string;
    enabled?: boolean;
    /** 强制首登改密（默认：未显式传 password 时为 true；显式传 password 时为 false） */
    forcePasswordChange?: boolean;
}
```

在 `createTenantAdministrator` 方法内（`member.remark = ...` 附近）补：

```typescript
        member.phone = input.phone ?? null;
```

- [ ] **Step 4: 构建并验证**

```bash
cd d:\zhao\vendure
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
Select-String packages/cjk-plugin/lib -Pattern "member.phone" | Select-Object -First 3
Select-String packages/cjk-plugin/lib/src/migrations -Pattern "hasColumn(tableName, 'phone')"
```
预期：`tsc` 无错；两条 grep 均命中。

---

## Task 3: 后端 —— `updateTenantMemberRoles` 服务 + ResolveField roleIds

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`

- [ ] **Step 1: 服务层新增 `updateTenantMemberRoles`**

在 `tenant-member.service.ts`（`deleteTenantRole` 之后）新增：

```typescript
    /** 更换某人员在该租户内的角色：归属 + 白名单 + 横向越权三重校验 */
    async updateTenantMemberRoles(
        ctx: RequestContext,
        channelId: ID,
        memberId: ID,
        roleIds: ID[],
    ): Promise<void> {
        await this.assertChannelMember(ctx);
        if (roleIds && roleIds.length > 0) {
            await this.assertRolesInChannel(ctx, roleIds, channelId);
        }
        const repo = this.connection.getRepository(ctx, TenantMember);
        const member = await repo.findOne({ where: { id: String(memberId) } });
        if (!member) throw new Error('MEMBER_NOT_FOUND');
        const memberChannelId = String(member.channelId);
        const targetChannelId = String(channelId);
        if (memberChannelId !== targetChannelId) throw new Error('MEMBER_NOT_IN_CHANNEL');
        await this.administratorService.update(ctx, {
            id: member.administratorId as any,
            roleIds: roleIds || [],
        } as any);
    }

    /** 返回人员在当前租户内的角色 id（用于改角色弹层回显勾选） */
    async memberRoleIdsInChannel(ctx: RequestContext, member: TenantMember): Promise<ID[]> {
        if (!member?.administratorId) return [];
        const repo = this.connection.getRepository(ctx, Administrator);
        const admin = await repo.findOne({
            where: { id: member.administratorId },
            relations: ['user', 'user.roles'],
        });
        if (!admin?.user?.roles) return [];
        const channelId = String(member.channelId);
        return (admin.user.roles as any[])
            .filter((r: any) => (r.channels || []).some((c: any) => String(c.id) === channelId))
            .map((r: any) => String(r.id));
    }
```

- [ ] **Step 2: 人员端 resolver 加 mutation + ResolveField**

修改 `tenant-member.resolver.ts`：顶部导入补 `ResolveField`、`Parent` 及 `Administrator`：

```typescript
import { Args, Mutation, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, RoleService, TransactionalConnection, Administrator } from '@vendure/core';
```

在类内新增：

```typescript
    /** 更换当前租户某人员的角色 */
    @Mutation()
    @Allow(tenantMemberManagePermission.Permission)
    async myUpdateTenantMemberRoles(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; roleIds: string[] },
    ): Promise<boolean> {
        await this.tenantMemberService.updateTenantMemberRoles(ctx, ctx.channelId, args.id, args.roleIds);
        return true;
    }

    @ResolveField('roleIds')
    async roleIds(@Parent() member: TenantMember, @Ctx() ctx: RequestContext): Promise<ID[]> {
        return this.tenantMemberService.memberRoleIdsInChannel(ctx, member);
    }
```

- [ ] **Step 3: 超管端 resolver 加 mutation**

在 `tenant-admin.resolver.ts` 类内新增：

```typescript
    @Mutation()
    @Allow(Permission.SuperAdmin)
    async updateTenantMemberRoles(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; channelId: string; roleIds: string[] },
    ): Promise<boolean> {
        await this.tenantMemberService.updateTenantMemberRoles(ctx, args.channelId, args.id, args.roleIds);
        return true;
    }
```

> 说明：超管改他店人员时 `assertChannelMember(ctx)` 会以超管自身 ctx 校验——超管有 `SuperAdmin` 权限，`assertChannelMember` 应放行超管（需确认：见 Step 4 注意项）。

- [ ] **Step 4: 核对 `assertChannelMember` 对超管的放行**

打开 `tenant-member.service.ts` 的 `assertChannelMember`：**已确认**第 167 行 `if (ctx.userHasPermissions([Permission.SuperAdmin])) return;` 对超管提前放行，超管改他店人员可行，**无需改动**。记录即可。

- [ ] **Step 5: 构建并验证**

```bash
cd d:\zhao\vendure
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
Select-String packages/cjk-plugin/lib -Pattern "updateTenantMemberRoles, memberRoleIdsInChannel" | Select-Object -First 4
```
预期：`tsc` 无错；grep 命中。

---

## Task 4: 后端 —— admin schema 更新

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 改 `CreateTenantInput`（去 code/tenantNo 必填）**

将（约 642-648 行）替换为：

```graphql
                input CreateTenantInput {
                    name: String!
                    token: String
                    isOfficial: Boolean
                }
```

- [ ] **Step 2: `type TenantMember` 加 `phone`、`roleIds`**

将（约 630-640 行）的 `type TenantMember` 改写为：

```graphql
                type TenantMember implements Node {
                    id: ID!
                    administratorId: ID!
                    channelId: ID!
                    enabled: Boolean!
                    mustChangePassword: Boolean!
                    displayName: String
                    remark: String
                    phone: String
                    roleIds: [ID!]!
                    createdAt: DateTime!
                    initialPassword: String
                }
```

- [ ] **Step 3: 两个输入加 `phone`**

在 `CreateTenantAdministratorInput`（约 662-672 行）与 `CreateTenantMemberInput`（约 686-696 行）的各 `remark: String` 行后各补一行 `phone: String`。

- [ ] **Step 4: `extend type Mutation` 加两个改角色 mutation**

在（约 754 行 `myUpdateTenantRole` 附近）新增：

```graphql
                    updateTenantMemberRoles(id: ID!, channelId: ID!, roleIds: [ID!]!): Boolean!
                    myUpdateTenantMemberRoles(id: ID!, roleIds: [ID!]!): Boolean!
```

- [ ] **Step 5: 构建并验证**

```bash
cd d:\zhao\vendure
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
Select-String packages/cjk-plugin/lib -Pattern "updateTenantMemberRoles(id: ID" | Select-Object -First 2
Select-String packages/cjk-plugin/lib -Pattern "phone: String" | Select-Object -First 2
```
预期：`tsc` 无错；两条 grep 命中。

- [ ] **Step 6: 后端整体提交**

```bash
cd d:\zhao\vendure
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 租户自动编号+shopName写入+人员phone幂等补列+成员改角色mutation"
```

---

## Task 5: 前端 —— API 层与错误 helper

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\client.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

- [ ] **Step 1: `client.ts` 加错误提取 helper**

在 `client.ts` 末尾追加：

```typescript
/** 从 graphql-request 抛出的错误里提取对用户友好的 message（后端 errors[0].message 优先） */
export function graphQlErrorMsg(err: any, fallback = '操作失败'): string {
  return err?.response?.errors?.[0]?.message || err?.message || fallback;
}
```

- [ ] **Step 2: `tenant-admin.ts` 扩充类型与查询**

把 `TenantMemberItem` 接口加两个可选字段：

```typescript
export interface TenantMemberItem {
  id: string;
  administratorId: string;
  channelId: string;
  enabled: boolean;
  displayName?: string | null;
  remark?: string | null;
  phone?: string | null;
  roleIds?: string[];
  createdAt: string;
}
```

将 `fetchMyTenantMembers`、`fetchTenantAdministrators` 的 GraphQL 字段串里的 `displayName remark createdAt` 改为 `displayName remark phone roleIds createdAt`：

```typescript
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark phone roleIds createdAt } }`,
```

（`fetchTenantAdministrators` 同理。）

- [ ] **Step 3: 改 `createTenant` 去 code（自动编号）**

将 `createTenant` 入参从 `{ code; name; tenantNo?; isOfficial? }` 改为 `{ name; isOfficial? }`（后端自动生成编号）：

```typescript
export async function createTenant(input: { name: string; isOfficial?: boolean }): Promise<TenantItem> {
  const res = await getAdminClient().request<{ createTenant: any }>(
    `mutation CreateTenant($input: CreateTenantInput!) { createTenant(input: $input) { ${TENANT_FIELDS} } }`,
    { input },
  );
  return mapTenant(res.createTenant);
}
```

> 说明：`CreateTenantInput` 后端已去 `code/tenantNo`（Task 4）并补 `name/token/isOfficial`；`TENANT_FIELDS` 已含 `customFields { shopName }`，返回即可映射。

- [ ] **Step 4: `createTenantMember` 传 `phone`**

给 `createTenantMember` 的 input 类型补 `phone?: string;` 并透传：

```typescript
export async function createTenantMember(input: { emailAddress: string; password?: string; roleIds: string[]; displayName?: string; phone?: string }): Promise<string | null> {
  const res = await getAdminClient().request<{ createTenantMember: { initialPassword?: string | null } }>(
    `mutation CreateTenantMember($input: CreateTenantMemberInput!) { createTenantMember(input: $input) { id initialPassword } }`,
    { input },
  );
  return res.createTenantMember?.initialPassword ?? null;
}
```

- [ ] **Step 5: 新增 `updateTenantMemberRolesToMember`**

在 `fetchMyTenantRoles` 附近追加：

```typescript
export async function updateTenantMemberRolesToMember(id: string, roleIds: string[]): Promise<void> {
  await getAdminClient().request(
    `mutation MyUpdateTenantMemberRoles($id: ID!, $roleIds: [ID!]!) { myUpdateTenantMemberRoles(id: $id, roleIds: $roleIds) }`,
    { id, roleIds },
  );
}
```

- [ ] **Step 6: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/apis/client.ts web-admin/src/apis/tenant-admin.ts
git commit -m "feat(web-admin): 错误信息提取helper+成员角色/手机号API"
```

---

## Task 6: 前端 —— 口令复制弹层组件

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\PasswordPopup.vue`

- [ ] **Step 1: 新建组件**

```vue
<template>
  <view class="mask" @tap="$emit('close')">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ title }}</text>
      <view class="pwd-box">
        <text class="pwd-label">账号</text>
        <text class="pwd-val">{{ account }}</text>
      </view>
      <view class="pwd-box">
        <text class="pwd-label">初始口令</text>
        <text class="pwd-val mono">{{ password }}</text>
      </view>
      <text class="tip">仅显示一次，请复制并转发给本人；首次登录后强制修改密码。</text>
      <button class="btn" @tap="copyPwd">一键复制密码</button>
      <view class="done" @tap="$emit('close')">我已经复制完成</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
const props = defineProps<{ title: string; account: string; password: string }>();
function copyPwd() {
  uni.setClipboardData({
    data: props.password,
    success: () => uni.showToast({ title: '密码已复制', icon: 'none' }),
  });
}
</script>
<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 560rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { font-size: 32rpx; font-weight: 700; display: block; text-align: center; margin-bottom: 24rpx; }
.pwd-box { display: flex; justify-content: space-between; padding: 20rpx 0; border-bottom: 1px solid #f0f0f0; align-items: center; }
.pwd-label { color: #999; font-size: 26rpx; }
.pwd-val { font-size: 28rpx; font-weight: 600; }
.mono { font-family: monospace; letter-spacing: 1rpx; }
.tip { display: block; color: #e64340; font-size: 22rpx; margin: 20rpx 0; }
.btn { background: #4f8cff; color: #fff; border-radius: 40rpx; font-size: 28rpx; line-height: 2.4; }
.done { text-align: center; color: #999; font-size: 26rpx; margin-top: 24rpx; }
</style>
```

- [ ] **Step 2: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/components/PasswordPopup.vue
git commit -m "feat(web-admin): 初始口令一键复制弹层组件"
```

---

## Task 7: 前端 —— 新建租户表单弹层

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\tenants\index.vue`

- [ ] **Step 1: 重写 `onCreate` 为表单弹层**

将 `onCreate` 函数整体替换为受 `showCreate` 控制的表单；`createTenant` 调用改为只传 `name`（后端自动编号）：

```typescript
import { ref, onMounted } from 'vue';
import { fetchTenants, setTenantEnabled, createTenant, type TenantItem } from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';

const tenants = ref<TenantItem[]>([]);
const showCreate = ref(false);
const form = ref({ name: '', isOfficial: false });

function onCreate() { form.value = { name: '', isOfficial: false }; showCreate.value = true; }
async function submitCreate() {
  const name = form.value.name.trim();
  if (!name) { uni.showToast({ title: '请填写店铺名', icon: 'none' }); return; }
  try {
    await createTenant({ name, isOfficial: form.value.isOfficial });
    uni.showToast({ title: '已创建（编号自动生成）', icon: 'none' });
    showCreate.value = false;
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '创建失败'), icon: 'none' });
  }
}
```

- [ ] **Step 2: 模板加表单弹层（`card` 之后、`script` 之前）**

在 `<view class="card">...</view>` 之后新增：

```vue
  <view class="mask" v-if="showCreate" @tap="showCreate = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">新建租户</text>
      <view class="field">
        <text class="label">店铺名 <text class="req">*</text></text>
        <input class="input" v-model="form.name" placeholder="必填，将作为租户显示名" />
      </view>
      <view class="field row">
        <text class="label">租户编号</text>
        <text class="auto-val">自动生成（t+顺序号）</text>
      </view>
      <view class="field row">
        <text class="label">官方自营</text>
        <switch :checked="form.isOfficial" color="#4f8cff" @change="form.isOfficial = $event.detail.value" />
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showCreate = false">取消</button>
        <button class="btn" @tap="submitCreate">创建</button>
      </view>
    </view>
  </view>
```

- [ ] **Step 3: 追加弹层样式**

在 `</style>` 前追加：

```scss
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.auto-val { color: #999; font-size: 26rpx; }
.row { display: flex; justify-content: space-between; align-items: center; }
.actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.ghost { background: #f2f2f2; color: #666; }
```

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/platform/tenants/index.vue
git commit -m "feat(web-admin): 新建租户改表单弹层（自动编号+店铺名+自营标识）"
```

---

## Task 8: 前端 —— 新建用户表单弹层 + 行内改角色

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\members\index.vue`

- [ ] **Step 1: 重写 script 交互**

将 `onAdd`（及新增逻辑）替换为表单弹层 + 口令弹层 + 行内改角色；`onLoad` 拉取本租户角色：

```typescript
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchMyTenantMembers, createTenantMember, setTenantMemberEnabled, deleteTenantMember,
  fetchMyTenantRoles, updateTenantMemberRolesToMember,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import PasswordPopup from '../../../components/PasswordPopup.vue';

const members = ref<TenantMemberItem[]>([]);
const roles = ref<RoleItem[]>([]);

const showAdd = ref(false);
const addForm = ref({ email: '', displayName: '', phone: '', roleIds: [] as string[] });
const pwdPop = ref(false);
const pwdInfo = ref({ account: '', password: '' });

const showRoles = ref(false);
const roleTarget = ref<TenantMemberItem | null>(null);
const roleTargetIds = ref([] as string[]);

onShow(load);
async function load() {
  members.value = await fetchMyTenantMembers();
  roles.value = await fetchMyTenantRoles();
}

function onAdd() {
  addForm.value = { email: '', displayName: '', phone: '', roleIds: [] };
  showAdd.value = true;
}
function toggleRole(id: string) {
  const i = addForm.value.roleIds.indexOf(id);
  if (i >= 0) addForm.value.roleIds.splice(i, 1);
  else addForm.value.roleIds.push(id);
}
async function submitAdd() {
  const email = addForm.value.email.trim();
  if (!email) { uni.showToast({ title: '邮箱必填', icon: 'none' }); return; }
  try {
    const initialPassword = await createTenantMember({
      emailAddress: email,
      displayName: addForm.value.displayName.trim() || email,
      phone: addForm.value.phone.trim() || undefined,
      roleIds: addForm.value.roleIds,
    });
    showAdd.value = false;
    if (initialPassword) {
      pwdInfo.value = { account: email, password: initialPassword };
      pwdPop.value = true;
    } else {
      uni.showToast({ title: '已添加', icon: 'none' });
    }
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '添加失败'), icon: 'none' });
  }
}

function openRoles(m: TenantMemberItem) {
  roleTarget.value = m;
  roleTargetIds.value = (m.roleIds || []).slice();
  showRoles.value = true;
}
function toggleTargetRole(id: string) {
  const i = roleTargetIds.value.indexOf(id);
  if (i >= 0) roleTargetIds.value.splice(i, 1);
  else roleTargetIds.value.push(id);
}
async function submitRoles() {
  if (!roleTarget.value) return;
  try {
    await updateTenantMemberRolesToMember(roleTarget.value.id, roleTargetIds.value);
    showRoles.value = false;
    uni.showToast({ title: '角色已更新', icon: 'none' });
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '更新失败'), icon: 'none' });
  }
}
```

- [ ] **Step 2: 模板：改表单 + 列表加"角色"入口 + 两个弹层**

在列表 item 的 `info` 内补一个"角色"文本入口（`displayName` 下方）：

```vue
        <view class="info">
          <text class="name">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}<text v-if="m.phone"> · {{ m.phone }}</text> · <text class="link" @tap="openRoles(m)">角色</text></text>
        </view>
```

在 `card` 之后追加两个弹层与口令组件：

```vue
  <view class="mask" v-if="showAdd" @tap="showAdd = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">添加人员</text>
      <view class="field"><text class="label">邮箱 <text class="req">*</text></text><input class="input" v-model="addForm.email" placeholder="必填（全局唯一）" /></view>
      <view class="field"><text class="label">显示姓名</text><input class="input" v-model="addForm.displayName" placeholder="选填" /></view>
      <view class="field"><text class="label">手机号</text><input class="input" v-model="addForm.phone" placeholder="选填" /></view>
      <view class="field">
        <text class="label">角色</text>
        <view class="perm-tags">
          <text v-for="r in roles" :key="r.id" class="perm" :class="{ on: addForm.roleIds.includes(r.id) }" @tap="toggleRole(r.id)">{{ r.description || r.code }}</text>
        </view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showAdd = false">取消</button>
        <button class="btn" @tap="submitAdd">添加</button>
      </view>
    </view>
  </view>

  <view class="mask" v-if="showRoles" @tap="showRoles = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">分配角色</text>
      <view class="perm-tags">
        <text v-for="r in roles" :key="r.id" class="perm" :class="{ on: roleTargetIds.includes(r.id) }" @tap="toggleTargetRole(r.id)">{{ r.description || r.code }}</text>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showRoles = false">取消</button>
        <button class="btn" @tap="submitRoles">保存</button>
      </view>
    </view>
  </view>

  <PasswordPopup v-if="pwdPop" :title="'初始口令（仅显示一次）'" :account="pwdInfo.account" :password="pwdInfo.password" @close="pwdPop = false" />
```

- [ ] **Step 3: 追加弹层与角色标签样式**

```scss
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.perm-tags { display: flex; flex-wrap: wrap; gap: 16rpx; }
.perm { padding: 12rpx 24rpx; border-radius: 40rpx; border: 1px solid #eee; color: #666; font-size: 24rpx; }
.perm.on { background: #4f8cff; color: #fff; border-color: #4f8cff; }
.actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.ghost { background: #f2f2f2; color: #666; }
```

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vshop
git add web-admin/src/pages/platform/members/index.vue
git commit -m "feat(web-admin): 新建用户表单+口令复制弹层+列表行内改角色"
```

---

## Self-Review

- **Spec 覆盖**：① 新建租户多字段✓（Task 7）② 建租户不成功无反馈→自动编号+错误可见✓（Task 1/7）③ 新建用户多字段✓（Task 8）④ 口令可复制✓（Task 6/8）⑤ 人员↔角色分配可见✓（Task 3/8）⑥ 绑定/改角色可见（roleIds 回显）✓（Task 3/8）。修 `updateTenant` 名不生效✓（Task 1）。`phone` 幂等补列✓（Task 2）。
- **占位符扫描**：无 TBD/TODO；关键代码均给出。
- **类型一致**：`updateTenantMemberRoles`（超管，带 channelId）与 `myUpdateTenantMemberRoles`（店长，默认 ctx.channelId）命名在 service/resolver/schema/frontend 一致；`roleIds` 字段在 schema(TenantMember) 与前端查询一致；`phone` 在 entity/migration/service/schema/输入/api 一致。

---

## Execution Handoff

两条执行路径：
1. **Subagent-Driven（推荐）**：每任务派新 subagent，任务间我审查，快速迭代。
2. **Inline**：本会话内用 executing-plans 分批执行、设检查点。

选哪种？