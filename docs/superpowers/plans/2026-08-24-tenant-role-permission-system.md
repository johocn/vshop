# vshop 租户 / 角色 / 权限体系实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 vshop 多租户的租户/角色/权限管理：超管 CRUD 启停租户、给租户授权管理员、为租户建立角色（租户管理员/销售/库存）、租户管理员管理本租户内部人员并分配角色权限、前 20 个官方自营租户填充默认数据。

**Architecture:** 后端在 `cjk-plugin` 扩展 Channel 自定义字段（enabled/tenantNo/isOfficial）+ 新增 `TenantMember` 实体 + 自定义权限点；新增超管 `TenantAdminResolver`（SuperAdmin 级）与租户管理员 `TenantMemberResolver`（限定自己 Channel）；`TenantMemberService` 封装 Vendure 原生 AdministratorService/RoleService/ChannelService；登录后 `myTenantAccess` 查询返回租户启停与人员启停供前端过滤与菜单渲染。前端在 `web-admin` 新增平台/角色/人员管理页并接入 Drawer 导航。

**Tech Stack:** NestJS + TypeORM（Vendure v3 cjk-plugin）、GraphQL（admin-api）、uni-app Vue3 + Pinia（web-admin）、graphql-request。

**前置文档：**
- Spec：`docs/superpowers/specs/2026-08-23-tenant-role-permission-system-design.md`
- Marketplace 约定：`d:\zhao\docs\superpowers\specs\2026-08-16-vendure-marketplace-design.md`

**构建命令（部署铁律：本地构建，绝不服务器构建）：**
- 后端插件：`cd d:\zhao\vendure\packages\cjk-plugin && npm run build`（产出 `lib/`）
- 前端：`cd d:\zhao\vshop\web-admin && npm run build:h5`（产出 `dist/build/h5/`）
- 验证 dist 已包含改动：`Select-String lib/index.js -Pattern "关键词"`

---

# Phase 1：后端数据模型与权限

## Task 1: Channel 自定义字段扩展（enabled / tenantNo / isOfficial）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-channel-custom-fields.ts`

- [ ] **Step 1: 追加 3 个 Channel 自定义字段**

在 `tenantChannelCustomFields` 的 `Channel` 数组末尾（`mapConfig` 字段之后）追加：

```ts
        {
            name: 'enabled',
            type: 'boolean',
            defaultValue: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '租户启停' }],
        },
        {
            name: 'tenantNo',
            type: 'int',
            nullable: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '租户序号' }],
        },
        {
            name: 'isOfficial',
            type: 'boolean',
            defaultValue: false,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '官方自营' }],
        },
```

- [ ] **Step 2: 构建插件验证 schema**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Expected: 构建成功，`lib/index.js` 出现。

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts
git -C d:\zhao\vshop commit -m "feat(cjk): Channel自定义字段新增enabled/tenantNo/isOfficial"
```

---

## Task 2: TenantMember 实体

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.entity.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 创建 TenantMember 实体**

```ts
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Administrator, Channel, VendureEntity } from '@vendure/core';

/**
 * 租户内部人员关联表：承载「后台人员 × 所属租户」的归属、启停与备注。
 * 后台人员本体仍是 Vendure 原生 Administrator，本表不改原生实体。
 */
@Entity()
export class TenantMember extends VendureEntity {
    @ManyToOne(() => Administrator, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'administrator_id' })
    administrator?: Administrator;

    @Column({ type: 'varchar' })
    administratorId!: string;

    @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'channel_id' })
    channel?: Channel;

    @Column({ type: 'varchar' })
    channelId!: string;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    @Column({ type: 'varchar', nullable: true })
    displayName!: string | null;

    @Column({ type: 'text', nullable: true })
    remark!: string | null;
}
```

- [ ] **Step 2: 在 plugin.ts 注册实体**

修改 `plugin.ts` 的 `entities` 数组与 import：

```ts
import { TenantMember } from './tenant/tenant-member.entity';
// entities 数组中追加 TenantMember
entities: [PickupLocation, EmployeeCustomer, ShippingTemplate, ShippingProfile, PaymentProfile, ShippingProfileMethod, PaymentProfileMethod, PaymentTemplate, TenantMember],
```

- [ ] **Step 3: 构建 + 验证**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Expected: 构建成功。
Verify: `Select-String lib/index.js -Pattern "TenantMember"` 有命中。

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/tenant-member.entity.ts ../vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao\vshop commit -m "feat(cjk): 新增TenantMember实体承载租户人员归属/启停"
```

---

## Task 3: 租户管理自定义权限点

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-permissions.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 创建权限定义**

```ts
import { PermissionDefinition } from '@vendure/core';

/** 超管租户管理（仅 SuperAdmin 角色持有） */
export const TenantManagePermission = 'TenantManage';
/** 租户级角色管理（租户管理员角色持有） */
export const TenantRoleManagePermission = 'TenantRoleManage';
/** 租户级人员管理（租户管理员角色持有） */
export const TenantMemberManagePermission = 'TenantMemberManage';
/** 订单核销（预留，本轮仅定义不实现） */
export const VerifyOrderPermission = 'VerifyOrder';

export const tenantPermissionDefinitions: PermissionDefinition[] = [
    new PermissionDefinition({ name: TenantManagePermission, description: '管理租户（超管）' }),
    new PermissionDefinition({ name: TenantRoleManagePermission, description: '管理租户角色' }),
    new PermissionDefinition({ name: TenantMemberManagePermission, description: '管理租户内部人员' }),
    new PermissionDefinition({ name: VerifyOrderPermission, description: '核销订单（预留）' }),
];
```

- [ ] **Step 2: 在 plugin.ts 注册自定义权限**

在 `configuration` 回调中 `config.authOptions.customPermissions` 数组追加：

```ts
import { tenantPermissionDefinitions } from './tenant/tenant-permissions';
// 在 paymentTemplatePermissionDefinitions 注册之后追加
config.authOptions.customPermissions = [
    ...(config.authOptions.customPermissions || []),
    ...tenantPermissionDefinitions,
];
```

- [ ] **Step 3: 构建 + Commit**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/tenant-permissions.ts ../vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao\vshop commit -m "feat(cjk): 新增租户管理/角色/人员/核销自定义权限点"
```

---

# Phase 2：后端 API

## Task 4: TenantMemberService（封装原生 Administrator / Role / Channel）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`

- [ ] **Step 1: 创建服务**

```ts
import { Injectable } from '@nestjs/common';
import {
    Administrator,
    AdministratorService,
    ChannelService,
    ID,
    Logger,
    Permission,
    RequestContext,
    RoleService,
    TransactionalConnection,
} from '@vendure/core';
import { loggerCtx } from '../constants';
import { TenantMember } from './tenant-member.entity';

/** 租户级角色可用的业务权限白名单（不含超管专属权限） */
export const BUSINESS_PERMISSIONS: string[] = [
    Permission.ReadCatalog,
    Permission.ReadProduct,
    Permission.CreateProduct,
    Permission.UpdateProduct,
    Permission.DeleteProduct,
    Permission.ReadProductVariant,
    Permission.CreateProductVariant,
    Permission.UpdateProductVariant,
    Permission.DeleteProductVariant,
    Permission.ReadOrder,
    Permission.UpdateOrder,
    Permission.CreateFulfillment,
    Permission.UpdateFulfillment,
    Permission.ReadAsset,
    Permission.CreateAsset,
    Permission.UpdateAsset,
    Permission.DeleteAsset,
    Permission.ReadCollection,
    Permission.CreateCollection,
    Permission.UpdateCollection,
    Permission.DeleteCollection,
    Permission.ReadShippingMethod,
    Permission.CreateShippingMethod,
    Permission.UpdateShippingMethod,
    Permission.DeleteShippingMethod,
    Permission.ReadPaymentMethod,
    Permission.CreatePaymentMethod,
    Permission.UpdatePaymentMethod,
    Permission.DeletePaymentMethod,
    Permission.ReadChannel,
    Permission.UpdateChannel,
    Permission.ReadAdministrator,
    Permission.ReadRole,
    'TenantRoleManage',
    'TenantMemberManage',
    'VerifyOrder',
].map(String);

export interface CreateTenantAdminInput {
    firstName?: string;
    lastName?: string;
    emailAddress: string;
    password?: string;
    roleIds: ID[];
    displayName?: string;
    remark?: string;
    enabled?: boolean;
}

@Injectable()
export class TenantMemberService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private roleService: RoleService,
        private channelService: ChannelService,
    ) {}

    /** 校验角色权限全部在业务权限白名单内（超管专属权限不入租户角色） */
    assertBusinessPermissions(permissions: string[]): void {
        const invalid = permissions.filter((p) => !BUSINESS_PERMISSIONS.includes(p));
        if (invalid.length > 0) {
            throw new Error(`FORBIDDEN_PERMISSION: ${invalid.join(',')} 为超管专属权限`);
        }
    }

    /** 校验请求方是该 channel 的租户管理员（或超管） */
    assertChannelMember(ctx: RequestContext, channelId?: ID): void {
        if (ctx.userHasPermissions([Permission.SuperAdmin])) return;
        const target = channelId != null ? String(channelId) : String(ctx.channelId);
        const perms = (ctx as any).session?.user?.channelPermissions || [];
        const ok = perms.some((c: any) => String(c.id) === target);
        if (!ok) throw new Error('CHANNEL_FORBIDDEN');
    }

    /** 建租户（Channel）——仅超管调用 */
    async createChannel(
        ctx: RequestContext,
        input: { code: string; token?: string; name: string; tenantNo?: number; isOfficial?: boolean },
    ): Promise<any> {
        const channel = await this.channelService.create(ctx, {
            code: input.code,
            token: input.token,
            defaultLanguageCode: 'zh_Hans' as any,
            currencyCode: 'CNY' as any,
            pricesIncludeTax: true,
            customFields: {
                tenantNo: input.tenantNo ?? null,
                isOfficial: input.isOfficial ?? false,
                enabled: true,
            },
        } as any);
        Logger.info(`已创建租户 ${input.code}`, loggerCtx);
        return channel;
    }

    /** 租户启停（仅超管） */
    async setChannelEnabled(ctx: RequestContext, channelId: ID, enabled: boolean): Promise<void> {
        await this.channelService.update(ctx, {
            id: channelId,
            customFields: { enabled },
        } as any);
    }

    /** 更新租户基础信息（仅超管） */
    async updateChannel(
        ctx: RequestContext,
        channelId: ID,
        input: { name?: string; tenantNo?: number; isOfficial?: boolean },
    ): Promise<void> {
        await this.channelService.update(ctx, {
            id: channelId,
            code: input.name,
            customFields: {
                tenantNo: input.tenantNo,
                isOfficial: input.isOfficial,
            },
        } as any);
    }

    /** 租户级角色创建（限定 channelIds=[channelId]；权限白名单校验） */
    async createTenantRole(ctx: RequestContext, channelId: ID, input: { code: string; description: string; permissions: string[] }): Promise<any> {
        this.assertBusinessPermissions(input.permissions);
        return this.roleService.create(ctx, {
            code: input.code,
            description: input.description,
            permissions: input.permissions as Permission[],
            channelIds: [channelId],
        });
    }

    /** 租户级角色更新（权限白名单校验） */
    async updateTenantRole(ctx: RequestContext, roleId: ID, input: { code?: string; description?: string; permissions?: string[] }): Promise<any> {
        if (input.permissions) this.assertBusinessPermissions(input.permissions);
        return this.roleService.update(ctx, {
            id: roleId,
            code: input.code,
            description: input.description,
            permissions: input.permissions as Permission[],
        });
    }

    /** 租户级角色删除 */
    async deleteTenantRole(ctx: RequestContext, roleId: ID): Promise<void> {
        await this.roleService.delete(ctx, roleId);
    }

    /** 超管为租户建管理员账号并绑定角色，同时写入 TenantMember */
    async createTenantAdministrator(ctx: RequestContext, channelId: ID, input: CreateTenantAdminInput): Promise<Administrator> {
        const admin = await this.administratorService.create(ctx, {
            firstName: input.firstName ?? '',
            lastName: input.lastName ?? input.emailAddress,
            emailAddress: input.emailAddress,
            password: input.password,
            roleIds: input.roleIds,
        });
        const repo = this.connection.getRepository(ctx, TenantMember);
        const member = new TenantMember();
        member.administratorId = String(admin.id);
        member.channelId = String(channelId);
        member.enabled = input.enabled ?? true;
        member.displayName = input.displayName ?? input.emailAddress;
        member.remark = input.remark ?? null;
        await repo.save(member);
        return admin;
    }

    /** 租户人员启停 */
    async setMemberEnabled(ctx: RequestContext, channelId: ID, memberId: ID, enabled: boolean): Promise<void> {
        const repo = this.connection.getRepository(ctx, TenantMember);
        const member = await repo.findOne({ where: { id: memberId, channelId: String(channelId) } });
        if (!member) throw new Error('MEMBER_NOT_FOUND');
        member.enabled = enabled;
        await repo.save(member);
    }

    /** 租户人员移除（仅删 TenantMember 关联，Administrator 本体保留） */
    async removeMember(ctx: RequestContext, channelId: ID, memberId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, TenantMember);
        const member = await repo.findOne({ where: { id: memberId, channelId: String(channelId) } });
        if (!member) throw new Error('MEMBER_NOT_FOUND');
        await repo.remove(member);
    }
}
```

- [ ] **Step 2: 构建验证**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Verify: `Select-String lib/index.js -Pattern "TenantMemberService"` 有命中。

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/tenant-member.service.ts
git -C d:\zhao\vshop commit -m "feat(cjk): TenantMemberService封装管理员/角色/租户操作与白名单校验"
```

---

## Task 5: 超管 TenantAdminResolver（租户 CRUD + 管理员授权 + 角色管理）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 创建超管 resolver**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, ChannelService, AdministratorService, RoleService, TransactionalConnection } from '@vendure/core';
import { Inject } from '@nestjs/common';
import { TenantMemberService } from './tenant-member.service';
import { TenantMember } from './tenant-member.entity';

@Resolver()
export class TenantAdminResolver {
    constructor(
        @Inject(ChannelService) private channelService: ChannelService,
        @Inject(AdministratorService) private administratorService: AdministratorService,
        @Inject(RoleService) private roleService: RoleService,
        @Inject(TransactionalConnection) private connection: TransactionalConnection,
        @Inject(TenantMemberService) private tenantMemberService: TenantMemberService,
    ) {}

    @Query()
    @Allow(Permission.SuperAdmin)
    async tenants(
        @Ctx() ctx: RequestContext,
        @Args() args: { options: { skip?: number; take?: number; filter?: any } },
    ): Promise<{ items: any[]; totalItems: number }> {
        const result = await this.channelService.findAll(ctx, {
            skip: args.options?.skip ?? 0,
            take: args.options?.take ?? 50,
        });
        return result as any;
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async tenant(@Ctx() ctx: RequestContext, @Args('id') id: string): Promise<any> {
        return this.channelService.findOne(ctx, id as any);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async createTenant(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; token?: string; name: string; tenantNo?: number; isOfficial?: boolean } },
    ): Promise<any> {
        return this.tenantMemberService.createChannel(ctx, args.input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async updateTenant(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; input: { name?: string; tenantNo?: number; isOfficial?: boolean } },
    ): Promise<any> {
        await this.tenantMemberService.updateChannel(ctx, args.id, args.input);
        return this.channelService.findOne(ctx, args.id as any);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async setTenantEnabled(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; enabled: boolean },
    ): Promise<any> {
        await this.tenantMemberService.setChannelEnabled(ctx, args.id, args.enabled);
        return this.channelService.findOne(ctx, args.id as any);
    }

    /** 软删：标记停用，不做物理删除 */
    @Mutation()
    @Allow(Permission.SuperAdmin)
    async deleteTenant(@Ctx() ctx: RequestContext, @Args('id') id: string): Promise<boolean> {
        await this.tenantMemberService.setChannelEnabled(ctx, id, false);
        return true;
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async tenantAdministrators(
        @Ctx() ctx: RequestContext,
        @Args('channelId') channelId: string,
    ): Promise<TenantMember[]> {
        const repo = this.connection.getRepository(ctx, TenantMember);
        return repo.find({ where: { channelId }, order: { createdAt: 'ASC' } });
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async createTenantAdministrator(
        @Ctx() ctx: RequestContext,
        @Args() args: { channelId: string; input: any },
    ): Promise<TenantMember> {
        await this.tenantMemberService.createTenantAdministrator(ctx, args.channelId, args.input);
        const repo = this.connection.getRepository(ctx, TenantMember);
        return repo.findOne({ where: { administratorId: String((await this.administratorService.findAll(ctx, { filter: { emailAddress: { eq: args.input.emailAddress } } } as any)).items[0]?.id ?? ''), channelId: args.channelId } } as any) as any;
    }

    @Query()
    @Allow(Permission.SuperAdmin)
    async tenantRoles(@Ctx() ctx: RequestContext, @Args('channelId') channelId: string): Promise<any[]> {
        const result = await this.roleService.findAll(ctx);
        const chId = String(channelId);
        return (result as any).items.filter((r: any) => (r.channels || []).some((c: any) => String(c.id) === chId));
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async createTenantRole(
        @Ctx() ctx: RequestContext,
        @Args() args: { channelId: string; input: { code: string; description: string; permissions: string[] } },
    ): Promise<any> {
        return this.tenantMemberService.createTenantRole(ctx, args.channelId, args.input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async updateTenantRole(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleId: string; input: { code?: string; description?: string; permissions?: string[] } },
    ): Promise<any> {
        return this.tenantMemberService.updateTenantRole(ctx, args.roleId, args.input);
    }

    @Mutation()
    @Allow(Permission.SuperAdmin)
    async deleteTenantRole(@Ctx() ctx: RequestContext, @Args('roleId') roleId: string): Promise<boolean> {
        await this.tenantMemberService.deleteTenantRole(ctx, roleId);
        return true;
    }
}
```

- [ ] **Step 2: 在 plugin.ts 注册 resolver 与 schema**

在 `adminApiExtensions.schema` 的 gql 字符串末尾追加类型与扩展：

```graphql
                type TenantMember implements Node {
                    id: ID!
                    administratorId: ID!
                    channelId: ID!
                    enabled: Boolean!
                    displayName: String
                    remark: String
                    createdAt: DateTime!
                }

                input CreateTenantInput {
                    code: String!
                    token: String
                    name: String!
                    tenantNo: Int
                    isOfficial: Boolean
                }

                input UpdateTenantInput {
                    name: String
                    tenantNo: Int
                    isOfficial: Boolean
                }

                input TenantListOptions {
                    skip: Int
                    take: Int
                    filter: JSON
                }

                input CreateTenantAdministratorInput {
                    firstName: String
                    lastName: String
                    emailAddress: String!
                    password: String
                    roleIds: [ID!]!
                    displayName: String
                    remark: String
                    enabled: Boolean
                }

                input CreateTenantRoleInput {
                    code: String!
                    description: String!
                    permissions: [String!]!
                }

                input UpdateTenantRoleInput {
                    code: String
                    description: String
                    permissions: [String!]
                }

                extend type Query {
                    tenants(options: TenantListOptions): ChannelList!
                    tenant(id: ID!): Channel
                    tenantAdministrators(channelId: ID!): [TenantMember!]!
                    tenantRoles(channelId: ID!): [Role!]!
                }

                extend type Mutation {
                    createTenant(input: CreateTenantInput!): Channel!
                    updateTenant(id: ID!, input: UpdateTenantInput!): Channel!
                    setTenantEnabled(id: ID!, enabled: Boolean!): Channel!
                    deleteTenant(id: ID!): Boolean!
                    createTenantAdministrator(channelId: ID!, input: CreateTenantAdministratorInput!): TenantMember!
                    setTenantAdministratorEnabled(id: ID!, enabled: Boolean!): TenantMember!
                    deleteTenantAdministrator(id: ID!): Boolean!
                    createTenantRole(channelId: ID!, input: CreateTenantRoleInput!): Role!
                    updateTenantRole(roleId: ID!, input: UpdateTenantRoleInput!): Role!
                    deleteTenantRole(roleId: ID!): Boolean!
                }
```

在 `adminApiExtensions.resolvers` 数组追加 `TenantAdminResolver`：

```ts
import { TenantAdminResolver } from './tenant/tenant-admin.resolver';
// resolvers 数组追加 TenantAdminResolver
resolvers: [..., TenantAdminResolver],
```

- [ ] **Step 3: 构建 + Commit**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts ../vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao\vshop commit -m "feat(cjk): 超管租户/管理员授权/角色管理API"
```

---

## Task 6: 租户管理员 TenantMemberResolver（限定自己 Channel）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 创建租户管理员 resolver**

```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, RoleService, TransactionalConnection } from '@vendure/core';
import { Inject } from '@nestjs/common';
import { TenantMemberService } from './tenant-member.service';
import { TenantMember } from './tenant-member.entity';
import { TenantMemberManagePermission, TenantRoleManagePermission } from './tenant-permissions';

/**
 * 租户管理员 API：所有操作强制限定在 ctx.channelId（当前请求租户）。
 */
@Resolver()
export class TenantMemberResolver {
    constructor(
        @Inject(RoleService) private roleService: RoleService,
        @Inject(TransactionalConnection) private connection: TransactionalConnection,
        @Inject(TenantMemberService) private tenantMemberService: TenantMemberService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async tenantMembers(@Ctx() ctx: RequestContext): Promise<TenantMember[]> {
        this.tenantMemberService.assertChannelMember(ctx);
        const repo = this.connection.getRepository(ctx, TenantMember);
        return repo.find({ where: { channelId: String(ctx.channelId) }, order: { createdAt: 'ASC' } });
    }

    @Mutation()
    @Allow(TenantMemberManagePermission)
    async createTenantMember(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: any },
    ): Promise<TenantMember> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.createTenantAdministrator(ctx, ctx.channelId, args.input);
        const repo = this.connection.getRepository(ctx, TenantMember);
        return repo.findOne({ where: { channelId: String(ctx.channelId), displayName: args.input.displayName ?? args.input.emailAddress } } as any) as any;
    }

    @Mutation()
    @Allow(TenantMemberManagePermission)
    async setTenantMemberEnabled(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; enabled: boolean },
    ): Promise<TenantMember> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.setMemberEnabled(ctx, ctx.channelId, args.id, args.enabled);
        const repo = this.connection.getRepository(ctx, TenantMember);
        return repo.findOne({ where: { id: args.id } } as any) as any;
    }

    @Mutation()
    @Allow(TenantMemberManagePermission)
    async deleteTenantMember(@Ctx() ctx: RequestContext, @Args('id') id: string): Promise<boolean> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.removeMember(ctx, ctx.channelId, id);
        return true;
    }

    @Query()
    @Allow(Permission.Authenticated)
    async myTenantRoles(@Ctx() ctx: RequestContext): Promise<any[]> {
        this.tenantMemberService.assertChannelMember(ctx);
        const result = await this.roleService.findAll(ctx);
        const chId = String(ctx.channelId);
        return (result as any).items.filter((r: any) => (r.channels || []).some((c: any) => String(c.id) === chId));
    }

    @Mutation()
    @Allow(TenantRoleManagePermission)
    async createTenantRole(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { code: string; description: string; permissions: string[] } },
    ): Promise<any> {
        this.tenantMemberService.assertChannelMember(ctx);
        return this.tenantMemberService.createTenantRole(ctx, ctx.channelId, args.input);
    }

    @Mutation()
    @Allow(TenantRoleManagePermission)
    async updateTenantRole(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleId: string; input: any },
    ): Promise<any> {
        this.tenantMemberService.assertChannelMember(ctx);
        return this.tenantMemberService.updateTenantRole(ctx, args.roleId, args.input);
    }

    @Mutation()
    @Allow(TenantRoleManagePermission)
    async deleteTenantRole(@Ctx() ctx: RequestContext, @Args('roleId') roleId: string): Promise<boolean> {
        this.tenantMemberService.assertChannelMember(ctx);
        await this.tenantMemberService.deleteTenantRole(ctx, roleId);
        return true;
    }
}
```

- [ ] **Step 2: 在 plugin.ts 注册 resolver 与 schema**

在 schema 追加（与 Task 5 schema 同文件）：

```graphql
                input CreateTenantMemberInput {
                    firstName: String
                    lastName: String
                    emailAddress: String!
                    password: String
                    roleIds: [ID!]!
                    displayName: String
                    remark: String
                    enabled: Boolean
                }

                extend type Query {
                    tenantMembers: [TenantMember!]!
                    myTenantRoles: [Role!]!
                }

                extend type Mutation {
                    createTenantMember(input: CreateTenantMemberInput!): TenantMember!
                    setTenantMemberEnabled(id: ID!, enabled: Boolean!): TenantMember!
                    deleteTenantMember(id: ID!): Boolean!
                }
```

resolvers 追加 `TenantMemberResolver`。

- [ ] **Step 3: 构建 + Commit**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/tenant-member.resolver.ts ../vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao\vshop commit -m "feat(cjk): 租户管理员人员/角色管理API(限定本channel)"
```

---

## Task 7: myTenantAccess 查询（登录后的租户启停 + 人员启停 + 权限）

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\my-access.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 创建 myTenantAccess resolver**

```ts
import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, ChannelService, TransactionalConnection } from '@vendure/core';
import { Inject } from '@nestjs/common';
import { TenantMember } from './tenant-member.entity';

/**
 * 登录后返回当前后台用户的租户访问信息：
 * - channels：每个有权限的租户的启停状态（enabled）与该用户在该租户的人员启停（memberEnabled）
 * - permissions：当前用户在所有角色中累积的业务权限码（供前端菜单渲染）
 */
@Resolver()
export class MyAccessResolver {
    constructor(
        @Inject(ChannelService) private channelService: ChannelService,
        @Inject(TransactionalConnection) private connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async myTenantAccess(@Ctx() ctx: RequestContext): Promise<any> {
        const user = (ctx as any).session?.user;
        const isSuperAdmin = ctx.userHasPermissions([Permission.SuperAdmin]);

        // 当前用户可访问的 channel（Vendure 依据其角色）
        const me = await this.channelService.findAll(ctx, { take: 1000 });
        let channels: any[] = (me as any).items;

        if (!isSuperAdmin) {
            // 非超管：过滤到用户角色限定的 channel
            const userRoles = user?.roles || [];
            const roleChannelIds = new Set<string>();
            for (const r of userRoles) {
                for (const c of r.channels || []) roleChannelIds.add(String(c.id));
            }
            channels = channels.filter((c) => roleChannelIds.has(String(c.id)));
        }

        // 查询每个 channel 的启停 + 当前用户在其中的 TenantMember 启停
        const memberRepo = this.connection.getRepository(ctx, TenantMember);
        const memberRows = await memberRepo.find({ where: { administratorId: String(user?.id ?? '') } });
        const memberByChannel = new Map<string, TenantMember>();
        for (const m of memberRows) memberByChannel.set(String(m.channelId), m);

        const result = channels.map((c) => {
            const ccf = (c as any).customFields || {};
            const member = memberByChannel.get(String(c.id));
            return {
                id: String(c.id),
                code: c.code,
                token: c.token,
                name: cccName(c, ccf),
                enabled: ccf.enabled !== false,
                tenantNo: ccf.tenantNo ?? null,
                isOfficial: ccf.isOfficial === true,
                memberEnabled: isSuperAdmin ? true : (member ? member.enabled : true),
            };
        });

        // 权限码集合（前端菜单渲染用）
        const permissions = new Set<string>();
        if (isSuperAdmin) {
            permissions.add(Permission.SuperAdmin);
        }
        for (const r of user?.roles || []) {
            for (const p of r.permissions || []) permissions.add(p);
        }
        for (const p of ctx.activePermissions || []) permissions.add(p);

        return {
            isSuperAdmin,
            channels: result,
            permissions: [...permissions],
        };
    }
}

function cccName(c: any, ccf: any): string {
    return ccf.shopName || c.code;
}
```

- [ ] **Step 2: 在 plugin.ts 注册 resolver 与 schema**

在 schema 追加：

```graphql
                type MyTenantChannel {
                    id: ID!
                    code: String!
                    token: String!
                    name: String!
                    enabled: Boolean!
                    tenantNo: Int
                    isOfficial: Boolean!
                    memberEnabled: Boolean!
                }

                type MyTenantAccess {
                    isSuperAdmin: Boolean!
                    channels: [MyTenantChannel!]!
                    permissions: [String!]!
                }

                extend type Query {
                    myTenantAccess: MyTenantAccess!
                }
```

resolvers 追加 `MyAccessResolver`。

- [ ] **Step 3: 构建 + Commit**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/tenant/my-access.resolver.ts ../vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao\vshop commit -m "feat(cjk): myTenantAccess返回租户启停/人员启停/权限码"
```

---

# Phase 3：Seed 前 20 个官方自营租户

## Task 8: seedOfficialTenants 幂等种子

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\seed\default-data.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 在 DefaultDataService 增加 seedOfficialTenants 并接入 seed()**

在 `seed()` 方法末尾追加调用（在 `seedAggregatePaymentTemplate` 之后）：

```ts
            await this.seedOfficialTenants(ctx);
```

新增方法（放在 `seedAggregatePaymentTemplate` 之后）：

```ts
    /**
     * 幂等创建前 20 个官方自营租户（tenantNo 1-20，isOfficial=true）。
     * 每个租户：3 个内置角色（租户管理员/销售/库存）+ 默认管理员 admin + 门店自提配送方式 + 门店收银支付方式。
     */
    private async seedOfficialTenants(ctx: RequestContext): Promise<void> {
        const { Channel, Role, Administrator } = await this.ensureAdminEntities();
        const channelRepo = this.connection.getRepository(ctx, Channel);
        const roleRepo = this.connection.getRepository(ctx, Role);
        const adminRepo = this.connection.getRepository(ctx, Administrator);
        const memberRepo = this.connection.getRepository(ctx, TenantMember);

        for (let i = 1; i <= 20; i++) {
            const code = `official-${String(i).padStart(2, '0')}`;
            const exists = await channelRepo.findOne({ where: { code } });
            if (exists) {
                Logger.info(`官方自营租户 ${code} 已存在，跳过`, loggerCtx);
                continue;
            }

            const channel = new Channel({
                code,
                token: `official-${i}`,
                defaultLanguageCode: LanguageCode.zh_Hans,
                currencyCode: 'CNY',
                pricesIncludeTax: true,
                customFields: {
                    enabled: true,
                    tenantNo: i,
                    isOfficial: true,
                    shopName: `官方自营${String(i).padStart(2, '0')}`,
                },
            } as any);
            await channelRepo.save(channel);
            Logger.info(`已创建官方自营租户 ${code}`, loggerCtx);

            // 3 个内置角色（限定该 channel）
            const tenantAdminRole = await this.createTenantRoleRecord(ctx, roleRepo, channel, 'official-tenant-admin', '租户管理员', [
                Permission.ReadProduct, Permission.CreateProduct, Permission.UpdateProduct, Permission.DeleteProduct,
                Permission.ReadOrder, Permission.UpdateOrder, Permission.CreateFulfillment, Permission.UpdateFulfillment,
                Permission.ReadAsset, Permission.CreateAsset, Permission.DeleteAsset,
                Permission.ReadCollection, Permission.CreateCollection, Permission.UpdateCollection, Permission.DeleteCollection,
                Permission.ReadShippingMethod, Permission.CreateShippingMethod, Permission.UpdateShippingMethod, Permission.DeleteShippingMethod,
                Permission.ReadPaymentMethod, Permission.CreatePaymentMethod, Permission.UpdatePaymentMethod, Permission.DeletePaymentMethod,
                Permission.ReadChannel, Permission.UpdateChannel,
                'TenantRoleManage', 'TenantMemberManage',
            ]);
            const salesRole = await this.createTenantRoleRecord(ctx, roleRepo, channel, 'official-sales', '销售', [
                Permission.ReadProduct, Permission.CreateProduct, Permission.UpdateProduct,
                Permission.ReadOrder, Permission.UpdateOrder, Permission.CreateFulfillment, Permission.UpdateFulfillment,
                Permission.ReadAsset, Permission.CreateAsset,
                Permission.ReadCollection,
            ]);
            const stockRole = await this.createTenantRoleRecord(ctx, roleRepo, channel, 'official-stock', '库存', [
                Permission.ReadProduct, Permission.ReadProductVariant, Permission.UpdateProductVariant,
                Permission.ReadOrder, Permission.ReadStockMovement,
            ]);

            // 默认管理员 admin（绑定租户管理员角色）
            const admin = await adminRepo.save(new Administrator({
                firstName: '官方自营',
                lastName: `自营${String(i).padStart(2, '0')}`,
                emailAddress: `admin-official-${i}@local.dev`,
                passwordHash: await this.hashPassword('Admin@123456'),
                roles: [tenantAdminRole],
            } as any));
            await memberRepo.save(new TenantMember({
                administratorId: String(admin.id),
                channelId: String(channel.id),
                enabled: true,
                displayName: `官方自营${String(i).padStart(2, '0')}管理员`,
                remark: 'seed 默认管理员',
            } as any));

            // 门店自提配送方式 + 门店收银支付方式（复用全局 handler）
            try {
                await this.shippingMethodService.create(ctx, {
                    code: `store-pickup-${code}`,
                    fulfillmentHandler: 'store-pickup',
                    checker: { code: 'store-pickup-eligibility', arguments: [] },
                    calculator: { code: 'store-pickup-calculator', arguments: [] },
                    translations: [{ languageCode: LanguageCode.zh_Hans, name: '门店自提', description: '到指定门店自提商品' }],
                    channels: [channel],
                } as any);
                await this.paymentMethodService.create(ctx, {
                    code: `cashier-${code}`,
                    enabled: true,
                    handler: { code: 'cash-on-delivery', arguments: [] },
                    translations: [{ languageCode: LanguageCode.zh_Hans, name: '门店收银', description: '到店收银台支付' }],
                    channels: [channel],
                } as any);
            } catch (e: any) {
                Logger.warn(`官方租户 ${code} 履约初始化失败: ${e.message}`, loggerCtx);
            }
        }
    }

    private async ensureAdminEntities(): Promise<{ Channel: any; Role: any; Administrator: any }> {
        // 延迟 require Vendure 实体，避免 seed 阶段循环依赖
        const core = await import('@vendure/core');
        return { Channel: core.Channel, Role: core.Role, Administrator: core.Administrator };
    }

    private async createTenantRoleRecord(
        ctx: RequestContext,
        roleRepo: any,
        channel: any,
        code: string,
        description: string,
        permissions: string[],
    ): Promise<any> {
        const role = new (await (await import('@vendure/core')).Role)({
            code,
            description,
            permissions,
            channels: [channel],
        } as any);
        return roleRepo.save(role);
    }

    private async hashPassword(plain: string): Promise<string> {
        const { NativePasswordHashingStrategy } = await import('@vendure/core');
        const s = new NativePasswordHashingStrategy();
        return s.hash(plain);
    }
```

> 说明：`NativePasswordHashingStrategy` 是 Vendure 默认密码哈希，保证 seed 出的管理员可用 `Admin@123456` 直接登录。

- [ ] **Step 2: 补充 import 与常量**

在 `default-data.service.ts` 顶部 import 补充：

```ts
import { TenantMember } from '../tenant/tenant-member.entity';
```

> 注意：`TenantMember` 需在 plugin entities 注册（Task 2 已完成），此处直接引用实体类。

- [ ] **Step 3: 构建 + 校验 seed 逻辑**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Verify: `Select-String lib/index.js -Pattern "seedOfficialTenants"` 有命中。

> 冒烟验证：本地起 Strapi/Vendure dev server 后，检查 `Channel` 表新增 `official-01`…`official-20`，`tenant_member` 表新增 20 条，`role` 表新增 60 条。幂等：重启后数量不增。

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/src/seed/default-data.service.ts ../vendure/packages/cjk-plugin/src/plugin.ts
git -C d:\zhao\vshop commit -m "feat(cjk): seed前20官方自营租户(角色/管理员/履约)"
```

---

# Phase 4：前端 web-admin

## Task 9: 平台管理 API 封装

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\auth.ts`
- Modify: `d:\zhao\vshop\web-admin\src\stores\authStore.ts`

- [ ] **Step 1: 创建 tenant-admin.ts**

```ts
// 租户/角色/人员管理 admin-api 封装
import { getAdminClient } from './client';

export interface TenantItem {
  id: string;
  code: string;
  token: string;
  name: string;
  enabled: boolean;
  tenantNo?: number | null;
  isOfficial: boolean;
}

export interface TenantMemberItem {
  id: string;
  administratorId: string;
  channelId: string;
  enabled: boolean;
  displayName?: string | null;
  remark?: string | null;
  createdAt: string;
}

export interface RoleItem {
  id: string;
  code: string;
  description: string;
  permissions: string[];
}

export async function fetchTenants(skip = 0, take = 50): Promise<{ items: TenantItem[]; totalItems: number }> {
  const res = await getAdminClient().request<{ tenants: { items: TenantItem[]; totalItems: number } }>(
    `query Tenants($skip: Int, $take: Int) {
      tenants(options: { skip: $skip, take: $take }) {
        items {
          id code token
          customFields { shopName enabled tenantNo isOfficial }
        }
        totalItems
      }
    }`,
    { skip, take },
  );
  return {
    items: (res.tenants.items as any[]).map((t: any) => ({
      id: t.id,
      code: t.code,
      token: t.token,
      name: t.customFields?.shopName || t.code,
      enabled: t.customFields?.enabled !== false,
      tenantNo: t.customFields?.tenantNo ?? null,
      isOfficial: t.customFields?.isOfficial === true,
    })),
    totalItems: res.tenants.totalItems,
  };
}

export async function setTenantEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetTenantEnabled($id: ID!, $enabled: Boolean!) { setTenantEnabled(id: $id, enabled: $enabled) { id } }`,
    { id, enabled },
  );
}

export async function createTenant(input: { code: string; name: string; tenantNo?: number }): Promise<TenantItem> {
  const res = await getAdminClient().request<{ createTenant: any }>(
    `mutation CreateTenant($input: CreateTenantInput!) {
      createTenant(input: $input) { id code customFields { shopName enabled tenantNo isOfficial } }
    }`,
    { input },
  );
  const t = res.createTenant;
  return {
    id: t.id, code: t.code, token: t.token,
    name: t.customFields?.shopName || t.code,
    enabled: t.customFields?.enabled !== false,
    tenantNo: t.customFields?.tenantNo ?? null,
    isOfficial: t.customFields?.isOfficial === true,
  };
}

export async function fetchTenantAdministrators(channelId: string): Promise<TenantMemberItem[]> {
  const res = await getAdminClient().request<{ tenantAdministrators: TenantMemberItem[] }>(
    `query TenantAdministrators($channelId: ID!) {
      tenantAdministrators(channelId: $channelId) { id administratorId channelId enabled displayName remark createdAt }
    }`,
    { channelId },
  );
  return res.tenantAdministrators;
}

export async function createTenantAdministrator(
  channelId: string,
  input: { emailAddress: string; password?: string; roleIds: string[]; displayName?: string },
): Promise<void> {
  await getAdminClient().request(
    `mutation CreateTenantAdministrator($channelId: ID!, $input: CreateTenantAdministratorInput!) {
      createTenantAdministrator(channelId: $channelId, input: $input) { id }
    }`,
    { channelId, input },
  );
}

export async function fetchTenantRoles(channelId: string): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ tenantRoles: RoleItem[] }>(
    `query TenantRoles($channelId: ID!) {
      tenantRoles(channelId: $channelId) { id code description permissions }
    }`,
    { channelId },
  );
  return res.tenantRoles;
}

export async function createTenantRole(
  channelId: string,
  input: { code: string; description: string; permissions: string[] },
): Promise<void> {
  await getAdminClient().request(
    `mutation CreateTenantRole($channelId: ID!, $input: CreateTenantRoleInput!) {
      createTenantRole(channelId: $channelId, input: $input) { id }
    }`,
    { channelId, input },
  );
}

export async function updateTenantRole(roleId: string, input: { description?: string; permissions?: string[] }): Promise<void> {
  await getAdminClient().request(
    `mutation UpdateTenantRole($roleId: ID!, $input: UpdateTenantRoleInput!) {
      updateTenantRole(roleId: $roleId, input: $input) { id }
    }`,
    { roleId, input },
  );
}

export async function deleteTenantRole(roleId: string): Promise<void> {
  await getAdminClient().request(`mutation DeleteTenantRole($roleId: ID!) { deleteTenantRole(roleId: $roleId) }`, { roleId });
}

// ===== 租户管理员视角（限定本 channel） =====
export async function fetchMyTenantMembers(): Promise<TenantMemberItem[]> {
  const res = await getAdminClient().request<{ tenantMembers: TenantMemberItem[] }>(
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark createdAt } }`,
  );
  return res.tenantMembers;
}

export async function createTenantMember(input: { emailAddress: string; password?: string; roleIds: string[]; displayName?: string }): Promise<void> {
  await getAdminClient().request(
    `mutation CreateTenantMember($input: CreateTenantMemberInput!) { createTenantMember(input: $input) { id } }`,
    { input },
  );
}

export async function setTenantMemberEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetTenantMemberEnabled($id: ID!, $enabled: Boolean!) { setTenantMemberEnabled(id: $id, enabled: $enabled) { id } }`,
    { id, enabled },
  );
}

export async function deleteTenantMember(id: string): Promise<void> {
  await getAdminClient().request(`mutation DeleteTenantMember($id: ID!) { deleteTenantMember(id: $id) }`, { id });
}

export async function fetchMyTenantRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ myTenantRoles: RoleItem[] }>(
    `query MyTenantRoles { myTenantRoles { id code description permissions } }`,
  );
  return res.myTenantRoles;
}
```

- [ ] **Step 2: 修改 auth.ts 增加 myTenantAccess**

在 `auth.ts` 追加：

```ts
export interface MyTenantChannel {
  id: string;
  code: string;
  token: string;
  name: string;
  enabled: boolean;
  tenantNo?: number | null;
  isOfficial: boolean;
  memberEnabled: boolean;
}

export interface MyTenantAccess {
  isSuperAdmin: boolean;
  channels: MyTenantChannel[];
  permissions: string[];
}

export async function fetchMyTenantAccess(): Promise<MyTenantAccess> {
  const res = await getAdminClient().request<{ myTenantAccess: MyTenantAccess }>(
    `query MyTenantAccess {
      myTenantAccess {
        isSuperAdmin
        channels { id code token name enabled tenantNo isOfficial memberEnabled }
        permissions
      }
    }`,
  );
  return res.myTenantAccess;
}
```

- [ ] **Step 3: 修改 authStore 存储 access 信息**

```ts
import { defineStore } from 'pinia';
import { adminLogin, fetchMyTenantAccess, type MyTenantAccess } from '../apis/auth';
import { getAuthToken, setAuthToken, clearSession } from '../apis/session';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getAuthToken(),
    username: '' as string,
    channels: [] as Array<{ id: string; code: string; token: string; enabled: boolean; memberEnabled: boolean }>,
    access: null as MyTenantAccess | null,
  }),
  getters: {
    isAuthed: (s) => !!s.token,
    isSuperAdmin: (s) => !!s.access?.isSuperAdmin || s.username === 'superadmin',
  },
  actions: {
    async login(username: string, password: string) {
      const identifier = await adminLogin(username, password);
      this.username = identifier ?? username;
      this.token = getAuthToken();
      await this.loadAccess();
    },
    async loadAccess() {
      const access = await fetchMyTenantAccess();
      this.access = access;
      // 仅保留启用中的租户（停用租户/停用人员不可进入）
      this.channels = access.channels
        .filter((c) => c.enabled && c.memberEnabled)
        .map((c) => ({ id: c.id, code: c.code, token: c.token, enabled: c.enabled, memberEnabled: c.memberEnabled }));
    },
    async loadChannels() {
      await this.loadAccess();
    },
    logout() {
      clearSession();
      this.token = '';
      this.username = '';
      this.channels = [];
      this.access = null;
    },
  },
});
```

- [ ] **Step 4: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/apis/tenant-admin.ts web-admin/src/apis/auth.ts web-admin/src/stores/authStore.ts
git -C d:\zhao\vshop commit -m "feat(web-admin): 平台管理API封装+myTenantAccess接入authStore"
```

---

## Task 10: 租户管理页面（超管）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\tenants\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`

- [ ] **Step 1: 创建租户列表页**

```vue
<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">租户列表</text>
        <text class="btn" @tap="onCreate">＋新建租户</text>
      </view>
      <view class="item" v-for="t in tenants" :key="t.id">
        <view class="info">
          <text class="name">{{ t.name }}</text>
          <text class="sub">#{{ t.tenantNo ?? '—' }} · {{ t.code }} · {{ t.isOfficial ? '官方自营' : '第三方' }}</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" />
        <text class="link" @tap="goDetail(t)">管理 ›</text>
      </view>
      <view v-if="!tenants.length" class="empty">暂无租户</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchTenants, setTenantEnabled, createTenant, type TenantItem } from '../../../apis/tenant-admin';

const tenants = ref<TenantItem[]>([]);

async function load() {
  const res = await fetchTenants();
  tenants.value = res.items;
}
function onToggle(t: TenantItem, e: any) {
  const enabled = e.detail.value as boolean;
  uni.showModal({
    title: enabled ? '启用租户' : '停用租户',
    content: `确定${enabled ? '启用' : '停用'}「${t.name}」？停用后该租户所有后台人员无法登录（C端不受影响）。`,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantEnabled(t.id, enabled);
        t.enabled = enabled;
        uni.showToast({ title: '已更新', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        load();
      }
    },
  });
}
function onCreate() {
  uni.showModal({
    title: '新建租户',
    editable: true,
    placeholderText: '租户编码 code（如 shop01）',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        await createTenant({ code: r.content, name: r.content });
        uni.showToast({ title: '已创建', icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
      }
    },
  });
}
function goDetail(t: TenantItem) {
  uni.navigateTo({ url: `/pages/platform/tenants/detail?id=${t.id}&name=${encodeURIComponent(t.name)}` });
}
onMounted(load);
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.btn { color: $pm-info; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
</style>
```

- [ ] **Step 2: 注册页面路由**

在 `pages.json` 的 `pages` 数组追加：

```json
    { "path": "pages/platform/tenants/index", "style": { "navigationBarTitleText": "租户管理" } },
    { "path": "pages/platform/tenants/detail", "style": { "navigationBarTitleText": "租户详情" } },
```

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/platform/tenants/index.vue web-admin/src/pages.json
git -C d:\zhao\vshop commit -m "feat(web-admin): 超管租户列表页(启停/新建)"
```

---

## Task 11: 租户详情页（管理员授权 + 角色 Tab）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\tenants\detail.vue`

- [ ] **Step 1: 创建租户详情页（管理员 Tab + 角色 Tab）**

```vue
<template>
  <view class="page">
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'admin' }" @tap="tab = 'admin'">管理员</text>
      <text class="tab" :class="{ on: tab === 'role' }" @tap="tab = 'role'">角色</text>
    </view>

    <!-- 管理员 Tab -->
    <view v-if="tab === 'admin'" class="card">
      <view class="row head">
        <text class="title">管理员授权</text>
        <text class="btn" @tap="onAddAdmin">＋添加管理员</text>
      </view>
      <view class="item" v-for="m in admins" :key="m.id">
        <text class="name">{{ m.displayName || m.administratorId }}</text>
        <text class="sub">ID: {{ m.administratorId }}</text>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggleAdmin(m, $event)" />
      </view>
      <view v-if="!admins.length" class="empty">暂无管理员</view>
    </view>

    <!-- 角色 Tab -->
    <view v-else class="card">
      <view class="row head">
        <text class="title">角色</text>
        <text class="btn" @tap="onAddRole">＋新建角色</text>
      </view>
      <view class="item col" v-for="r in roles" :key="r.id">
        <view class="row between">
          <text class="name">{{ r.description || r.code }}</text>
          <text class="link" @tap="onEditRole(r)">权限 ›</text>
        </view>
        <text class="sub">{{ r.code }} · {{ (r.permissions || []).length }} 项权限</text>
      </view>
      <view v-if="!roles.length" class="empty">暂无角色</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchTenantAdministrators, createTenantAdministrator, setTenantAdministratorEnabled,
  fetchTenantRoles, createTenantRole, updateTenantRole, deleteTenantRole,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';

const channelId = ref('');
const tab = ref<'admin' | 'role'>('admin');
const admins = ref<TenantMemberItem[]>([]);
const roles = ref<RoleItem[]>([]);

onLoad((q: any) => { channelId.value = q.id; load(); });

async function load() {
  await Promise.all([loadAdmins(), loadRoles()]);
}
async function loadAdmins() {
  admins.value = await fetchTenantAdministrators(channelId.value);
}
async function loadRoles() {
  roles.value = await fetchTenantRoles(channelId.value);
}

function onAddAdmin() {
  uni.showModal({
    title: '添加管理员',
    editable: true,
    placeholderText: '登录邮箱',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      const adminRole = roles.value.find((x) => x.code.includes('tenant-admin') || x.code.includes('租户管理员'));
      try {
        await createTenantAdministrator(channelId.value, {
          emailAddress: r.content,
          password: 'Admin@123456',
          roleIds: adminRole ? [adminRole.id] : [],
          displayName: r.content,
        });
        uni.showToast({ title: '已添加', icon: 'none' });
        loadAdmins();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '添加失败', icon: 'none' });
      }
    },
  });
}
function onToggleAdmin(m: TenantMemberItem, e: any) {
  uni.showModal({
    title: e.detail.value ? '启用人员' : '停用人员',
    content: `确定${e.detail.value ? '启用' : '停用'}该管理员？`,
    success: async (r) => {
      if (!r.confirm) return loadAdmins();
      try {
        await setTenantAdministratorEnabled(m.id, e.detail.value as boolean);
        m.enabled = e.detail.value as boolean;
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        loadAdmins();
      }
    },
  });
}
function onAddRole() {
  uni.showModal({
    title: '新建角色',
    editable: true,
    placeholderText: '角色编码（如 kefu）',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        await createTenantRole(channelId.value, { code: r.content, description: r.content, permissions: ['ReadProduct'] });
        uni.showToast({ title: '已创建', icon: 'none' });
        loadRoles();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
      }
    },
  });
}
function onEditRole(r: RoleItem) {
  uni.showModal({
    title: `权限（${r.code}）`,
    content: `当前 ${(r.permissions || []).length} 项权限。详细权限勾选请在角色管理页操作。`,
    showCancel: true,
    confirmText: '删除',
    success: async (res) => {
      if (!res.confirm) return;
      uni.showModal({
        title: '删除角色',
        content: `确定删除角色「${r.description || r.code}」？`,
        success: async (d) => {
          if (!d.confirm) return;
          try { await deleteTenantRole(r.id); loadRoles(); } catch (err: any) {
            uni.showToast({ title: err?.message || '删除失败', icon: 'none' });
          }
        },
      });
    },
  });
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.tabs { display: flex; gap: 12rpx; margin-bottom: 20rpx; }
.tab { padding: 12rpx 30rpx; background: #fff; border-radius: 999rpx; font-size: 26rpx; color: #666; }
.tab.on { background: $pm-info; color: #fff; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.btn { color: $pm-info; font-size: 26rpx; }
.row { display: flex; align-items: center; }
.between { justify-content: space-between; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.item.col { flex-direction: column; align-items: stretch; gap: 8rpx; }
.name { flex: 1; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 4rpx; }
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
</style>
```

- [ ] **Step 2: 补全超管启停/删除管理员 mutation（tenant-admin.ts）**

在 `tenant-admin.ts` 追加（Task 9 遗漏的两个超管 mutation）：

```ts
export async function setTenantAdministratorEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetTenantAdministratorEnabled($id: ID!, $enabled: Boolean!) {
      setTenantAdministratorEnabled(id: $id, enabled: $enabled) { id }
    }`,
    { id, enabled },
  );
}

export async function deleteTenantAdministrator(id: string): Promise<void> {
  await getAdminClient().request(`mutation DeleteTenantAdministrator($id: ID!) { deleteTenantAdministrator(id: $id) }`, { id });
}
```

> 后端需在 `tenant-admin.resolver.ts` 补充 `setTenantAdministratorEnabled` / `deleteTenantAdministrator` 两个 mutation 实现（直接调用 `tenantMemberService.setMemberEnabled` / `removeMember`），并在 Task 5 schema 中已声明。

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/platform/tenants/detail.vue web-admin/src/apis/tenant-admin.ts
git -C d:\zhao\vshop commit -m "feat(web-admin): 租户详情页(管理员授权/角色Tab)"
```

---

## Task 12: 角色管理页（权限勾选）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`

- [ ] **Step 1: 创建角色管理页**

```vue
<template>
  <view class="page">
    <view class="card" v-for="r in roles" :key="r.id">
      <view class="row head">
        <text class="title">{{ r.description || r.code }}</text>
        <text class="sub">{{ r.code }}</text>
      </view>
      <view class="perms">
        <text v-for="p in allPerms" :key="p" class="perm" :class="{ on: has(r, p) }" @tap="toggle(r, p)">
          {{ permLabel(p) }}
        </text>
      </view>
      <view class="row foot">
        <text class="btn danger" @tap="onDelete(r)">删除角色</text>
        <text class="btn" @tap="onSave(r)">保存</text>
      </view>
    </view>
    <view v-if="!roles.length" class="empty">暂无角色</view>
    <view class="fab" @tap="onCreate">＋</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../../../stores/authStore';
import {
  fetchTenantRoles, updateTenantRole, deleteTenantRole, createTenantRole,
  fetchMyTenantRoles, type RoleItem,
} from '../../../apis/tenant-admin';

const auth = useAuthStore();
const isSuper = auth.isSuperAdmin;
const roles = ref<RoleItem[]>([]);

// 业务权限点清单（设计 §4），超管专属权限不入列
const allPerms = [
  'ReadProduct', 'CreateProduct', 'UpdateProduct', 'DeleteProduct',
  'ReadProductVariant', 'UpdateProductVariant', 'ReadStockMovement',
  'ReadOrder', 'UpdateOrder', 'CreateFulfillment', 'UpdateFulfillment',
  'ReadAsset', 'CreateAsset', 'DeleteAsset',
  'ReadCollection', 'CreateCollection', 'UpdateCollection', 'DeleteCollection',
  'ReadShippingMethod', 'CreateShippingMethod', 'UpdateShippingMethod', 'DeleteShippingMethod',
  'ReadPaymentMethod', 'CreatePaymentMethod', 'UpdatePaymentMethod', 'DeletePaymentMethod',
  'ReadChannel', 'UpdateChannel',
  'TenantRoleManage', 'TenantMemberManage', 'VerifyOrder',
];

const permLabels: Record<string, string> = {
  ReadProduct: '商品·读', CreateProduct: '商品·新增', UpdateProduct: '商品·改', DeleteProduct: '商品·删',
  ReadProductVariant: '规格·读', UpdateProductVariant: '库存·调整', ReadStockMovement: '库存·流水',
  ReadOrder: '订单·读', UpdateOrder: '订单·改', CreateFulfillment: '发货·创建', UpdateFulfillment: '发货·改',
  ReadAsset: '图片·读', CreateAsset: '图片·传', DeleteAsset: '图片·删',
  ReadCollection: '分类·读', CreateCollection: '分类·新增', UpdateCollection: '分类·改', DeleteCollection: '分类·删',
  ReadShippingMethod: '配送·读', CreateShippingMethod: '配送·增', UpdateShippingMethod: '配送·改', DeleteShippingMethod: '配送·删',
  ReadPaymentMethod: '支付·读', CreatePaymentMethod: '支付·增', UpdatePaymentMethod: '支付·改', DeletePaymentMethod: '支付·删',
  ReadChannel: '店铺·读', UpdateChannel: '店铺·改',
  TenantRoleManage: '角色·管理', TenantMemberManage: '人员·管理', VerifyOrder: '核销·预留',
};

function permLabel(p: string) { return permLabels[p] || p; }

async function load() {
  roles.value = isSuper ? await fetchTenantRoles((auth.channels[0] as any)?.id || '') : await fetchMyTenantRoles();
}
function has(r: RoleItem, p: string) { return (r.permissions || []).includes(p); }
function toggle(r: RoleItem, p: string) {
  const list = (r.permissions || []).slice();
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1); else list.push(p);
  r.permissions = list;
}
async function onSave(r: RoleItem) {
  try {
    await updateTenantRole(r.id, { description: r.description, permissions: r.permissions });
    uni.showToast({ title: '已保存', icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '保存失败', icon: 'none' });
  }
}
async function onDelete(r: RoleItem) {
  uni.showModal({
    title: '删除角色',
    content: `确定删除「${r.description || r.code}」？`,
    success: async (d) => {
      if (!d.confirm) return;
      try { await deleteTenantRole(r.id); load(); } catch (err: any) {
        uni.showToast({ title: err?.message || '删除失败', icon: 'none' });
      }
    },
  });
}
function onCreate() {
  uni.showModal({
    title: '新建角色',
    editable: true,
    placeholderText: '角色编码（如 kefu）',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        await createTenantRole('', { code: r.content, description: r.content, permissions: ['ReadProduct'] });
        uni.showToast({ title: '已创建', icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
      }
    },
  });
}
onMounted(load);
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 140rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.sub { font-size: 22rpx; color: #999; }
.perms { display: flex; flex-wrap: wrap; gap: 12rpx; }
.perm { padding: 10rpx 20rpx; border-radius: 999rpx; font-size: 22rpx; background: #f2f3f5; color: #666; }
.perm.on { background: $pm-info; color: #fff; }
.foot { justify-content: flex-end; gap: 16rpx; margin-top: 20rpx; }
.btn { color: $pm-info; font-size: 26rpx; }
.btn.danger { color: #e64340; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; }
.fab { position: fixed; right: 40rpx; bottom: 60rpx; width: 96rpx; height: 96rpx; border-radius: 50%; background: $pm-info; color: #fff; font-size: 56rpx; line-height: 96rpx; text-align: center; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15); }
</style>
```

> 说明：租户管理员从"角色管理"进入时限定本 channel（用 `fetchMyTenantRoles`）；超管可从租户详情或平台菜单进入（本页简化实现，超管入口传入当前 channelId）。跨页传参细化留待执行时按实际体验补充。

- [ ] **Step 2: 注册页面路由**

在 `pages.json` 追加：

```json
    { "path": "pages/platform/roles/index", "style": { "navigationBarTitleText": "角色管理" } },
    { "path": "pages/platform/members/index", "style": { "navigationBarTitleText": "人员管理" } },
```

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/platform/roles/index.vue web-admin/src/pages.json
git -C d:\zhao\vshop commit -m "feat(web-admin): 角色管理页(权限勾选/增删)"
```

---

## Task 13: 人员管理页（租户管理员）

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\pages\platform\members\index.vue`

- [ ] **Step 1: 创建人员管理页**

```vue
<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">本租户人员</text>
        <text class="btn" @tap="onAdd">＋添加人员</text>
      </view>
      <view class="item" v-for="m in members" :key="m.id">
        <view class="info">
          <text class="name">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}</text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggle(m, $event)" />
        <text class="link" @tap="onRemove(m)">移除</text>
      </view>
      <view v-if="!members.length" class="empty">暂无人员</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchMyTenantMembers, createTenantMember, setTenantMemberEnabled, deleteTenantMember, type TenantMemberItem } from '../../../apis/tenant-admin';

const members = ref<TenantMemberItem[]>([]);

async function load() { members.value = await fetchMyTenantMembers(); }

function onAdd() {
  uni.showModal({
    title: '添加人员',
    editable: true,
    placeholderText: '登录邮箱',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        await createTenantMember({ emailAddress: r.content, password: 'Admin@123456', displayName: r.content, roleIds: [] });
        uni.showToast({ title: '已添加', icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '添加失败', icon: 'none' });
      }
    },
  });
}
function onToggle(m: TenantMemberItem, e: any) {
  uni.showModal({
    title: e.detail.value ? '启用人员' : '停用人员',
    content: `确定${e.detail.value ? '启用' : '停用'}？`,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantMemberEnabled(m.id, e.detail.value as boolean);
        m.enabled = e.detail.value as boolean;
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        load();
      }
    },
  });
}
function onRemove(m: TenantMemberItem) {
  uni.showModal({
    title: '移除人员',
    content: `确定从本租户移除？`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await deleteTenantMember(m.id); load(); } catch (err: any) {
        uni.showToast({ title: err?.message || '移除失败', icon: 'none' });
      }
    },
  });
}
onMounted(load);
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.btn { color: $pm-info; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.link { color: #e64340; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/platform/members/index.vue
git -C d:\zhao\vshop commit -m "feat(web-admin): 人员管理页(租户管理员)"
```

---

## Task 14: Drawer 导航 + 权限渲染

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\components\Drawer.vue`

- [ ] **Step 1: Drawer 增加「平台管理」分组并按权限渲染**

将 `const groups = [...]` 改造为基于权限过滤的动态数组：

```ts
import { useTenantStore } from '../stores/tenantStore';
import { useAuthStore } from '../stores/authStore';
import { D, tierStyle } from '../theme';

const emit = defineEmits(['close']);
const tenant = useTenantStore();
const auth = useAuthStore();
defineProps<{ show: boolean }>();

const has = (p: string) => (auth.access?.permissions || []).includes(p);
const isSuper = auth.isSuperAdmin;

const groups = computed(() => {
  const list: any[] = [
    { domain: '商品', color: D.d1.main, grad: D.d1.grad, items: [
      { label: '分类', url: '/pages/product/categories/index', tier: 1 },
      { label: '＋新增商品', url: '/pages/product/create/index', tier: 1, perm: 'CreateProduct' },
      { label: '商品列表', url: '/pages/product/list/index', tier: 1 },
      { label: '库存预警', url: '/pages/inventory/stock/index', tier: 2, perm: 'ReadStockMovement' },
      { label: '图片库', url: '/pages/media/library/index', tier: 3 },
    ]},
    { domain: '交易', color: D.d2.main, grad: D.d2.grad, items: [
      { label: '订单', url: '/pages/order/list/index', tier: 1 },
      { label: '发货', url: '/pages/order/ship/index', tier: 2, perm: 'CreateFulfillment' },
      { label: '售后', url: '/pages/after-sale/list/index', tier: 2 },
    ]},
    { domain: '履约', color: D.d3.main, grad: D.d3.grad, items: [
      { label: '配送方式', url: '/pages/shipping/methods/index', tier: 2 },
      { label: '支付方式', url: '/pages/payment/methods/index', tier: 2 },
      { label: '自提点', url: '/pages/pickup/index', tier: 2 },
      { label: '配送档案', url: '/pages/shipping/profile/index', tier: 3 },
      { label: '支付档案', url: '/pages/payment/profile/index', tier: 3 },
    ]},
    { domain: '装修', color: D.d4.main, grad: D.d4.grad, items: [
      { label: '首页装修', url: '/pages/decorate/home/index', tier: 1 },
      { label: '主题风格', url: '/pages/decorate/theme/index', tier: 3 },
      { label: '店铺信息', url: '/pages/decorate/shop-info/index', tier: 3 },
    ]},
    { domain: '分销', color: D.d5.main, grad: D.d5.grad, items: [
      { label: '分销关系', url: '/pages/distribution/relations/index', tier: 2 },
      { label: '佣金结算', url: '/pages/distribution/settle/index', tier: 2 },
    ]},
  ];

  // 平台管理（超管或租户管理员）
  const platformItems: any[] = [];
  if (isSuper) {
    platformItems.push({ label: '租户管理', url: '/pages/platform/tenants/index', tier: 1 });
    platformItems.push({ label: '角色管理', url: '/pages/platform/roles/index', tier: 2 });
  } else if (has('TenantRoleManage') || has('TenantMemberManage')) {
    platformItems.push({ label: '角色管理', url: '/pages/platform/roles/index', tier: 2 });
    platformItems.push({ label: '人员管理', url: '/pages/platform/members/index', tier: 2 });
  }
  if (platformItems.length) {
    list.push({ domain: '平台', color: D.d6.main, grad: D.d6.grad, items: platformItems });
  }

  // 系统分组始终显示
  list.push({ domain: '系统', color: D.d6.main, grad: D.d6.grad, items: [
    { label: '数据看板', url: '/pages/data/dashboard/index', tier: 2 },
    { label: '切换店铺', tier: 3, action: 'switchStore' },
    { label: '退出登录', tier: 3, action: 'logout' },
  ]});

  // 按权限过滤（无 perm 字段的项始终显示）
  return list
    .map((g) => ({ ...g, items: g.items.filter((it: any) => !it.perm || has(it.perm)) }))
    .filter((g: any) => g.items.length > 0);
});
```

> 需在 `<script>` 顶部补充 `import { computed } from 'vue';`。

- [ ] **Step 2: 构建前端验证**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/components/Drawer.vue
git -C d:\zhao\vshop commit -m "feat(web-admin): Drawer平台管理分组+权限过滤渲染"
```

---

# Phase 5：构建部署与验证

## Task 15: 后端构建 + 探针验证 + 部署

**Files:**
- 脚本（复用）：`d:\zhao\vshop\scripts\probe-live-schema.mjs`、`_probe_admin.cjs`

- [ ] **Step 1: 本地构建插件**

Run: `cd d:\zhao\vendure\packages\cjk-plugin && npm run build`
Expected: 构建成功。
Verify: `Select-String lib/index.js -Pattern "myTenantAccess"` 与 `"seedOfficialTenants"` 有命中。

- [ ] **Step 2: 本地冒烟（探针校准 schema）**

Run: `node d:\zhao\vshop\scripts\probe-live-schema.mjs`
Expected: admin-api schema 含 `myTenantAccess`、`tenants`、`createTenant`、`TenantMember` 等新类型与 mutation。

- [ ] **Step 3: 提交 dist/产物并推送（部署铁律：本地构建产物入 git）**

```bash
git -C d:\zhao\vshop add ../vendure/packages/cjk-plugin/lib
git -C d:\zhao\vshop commit -m "build(cjk): 提交租户角色权限体系构建产物"
git -C d:\zhao\vshop push
```

> 服务器侧仅执行 `git pull` + `pm2 restart`，**绝不服务器构建**。重启后数据库自动加列（enabled/tenantNo/isOfficial + tenant_member 表 + 60 角色 + 20 租户）。

- [ ] **Step 4: 服务器验证**

Run（服务器）：`git pull && pm2 restart <app>`，等待后：
`Select-String lib/index.js -Pattern "seedOfficialTenants"` 确认产物；`pm2 logs --lines 50 --nostream` 观察 `已创建官方自营租户 official-01…20` 日志。

---

## Task 16: 前端构建 + 部署

**Files:**
- Modify: 无（web-admin 已构建）

- [ ] **Step 1: 构建 web-admin**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 产出 `dist/build/h5/`。

- [ ] **Step 2: 提交 dist 并推送**

```bash
git -C d:\zhao\vshop add web-admin/dist
git -C d:\zhao\vshop commit -m "build(web-admin): 租户/角色/人员管理页构建产物"
git -C d:\zhao\vshop push
```

> 服务器 `git pull` 后，Nginx 静态目录 `e.joho.cn/guanli` 即更新（注意微信缓存：确认 `location = /index.html` 的 `Cache-Control: no-cache` 配置在位）。

- [ ] **Step 3: 浏览器端到端验证（agent-browser）**

- 超管登录 → 选择「平台管理 → 租户管理」→ 列表含 official-01…20 → 停用/启用一个租户 → 用该租户 admin 登录应看不到该租户。
- 超管「角色管理」→ 勾选权限 → 保存 → 用租户管理员登录 → 菜单按权限渲染。
- 租户管理员「人员管理」→ 添加/停用/移除人员。
- 越权：用"销售"角色登录，不应看到平台/人员/角色菜单；直接调 admin-api 应被拒绝。

---

## 附：范围外（本计划不实现）

- marketplace 商品审批上架流（`listedInMarketplace` / `marketplaceStatus` / 审核 UI）——仅预留 `VerifyOrder` 与相关权限点，按 2026-08-16 设计下一轮实现。
- 首次登录强制改密。
- C 端（Customer/会员）管理。
