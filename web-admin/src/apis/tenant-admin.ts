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
  phone?: string | null;
  roleIds?: string[];
  createdAt: string;
}

export interface RoleItem {
  id: string;
  code: string;
  description: string;
  permissions: string[];
}

export interface PermissionCatalogItem {
  code: string;
  label: string;
}
export interface PermissionCatalogGroup {
  key: string;
  label: string;
  items: PermissionCatalogItem[];
}

/** 动态获取业务权限目录（单一来源：后端 PERMISSION_CATALOG），供角色管理页渲染 */
export async function fetchPermissionCatalog(): Promise<PermissionCatalogGroup[]> {
  const res = await getAdminClient().request<{ permissionCatalog: PermissionCatalogGroup[] }>(
    `query PermissionCatalog { permissionCatalog { key label items { code label } } }`,
  );
  return res.permissionCatalog ?? [];
}

function mapTenant(t: any): TenantItem {
  return {
    id: t.id,
    code: t.code,
    token: t.token ?? '',
    name: t.customFields?.shopName || t.code,
    enabled: t.customFields?.enabled !== false,
    tenantNo: t.customFields?.tenantNo ?? null,
    isOfficial: t.customFields?.isOfficial === true,
  };
}

const TENANT_FIELDS = `id code token customFields { shopName enabled tenantNo isOfficial }`;

export async function fetchTenants(skip = 0, take = 50): Promise<{ items: TenantItem[]; totalItems: number }> {
  const res = await getAdminClient().request<{ tenants: { items: any[]; totalItems: number } }>(
    `query Tenants($skip: Int, $take: Int) {
      tenants(options: { skip: $skip, take: $take }) {
        items { ${TENANT_FIELDS} }
        totalItems
      }
    }`,
    { skip, take },
  );
  return { items: res.tenants.items.map(mapTenant), totalItems: res.tenants.totalItems };
}

export async function createTenant(input: { name: string; isOfficial?: boolean }): Promise<TenantItem> {
  const res = await getAdminClient().request<{ createTenant: any }>(
    `mutation CreateTenant($input: CreateTenantInput!) { createTenant(input: $input) { ${TENANT_FIELDS} } }`,
    { input },
  );
  return mapTenant(res.createTenant);
}

export async function updateTenant(id: string, input: { name?: string; tenantNo?: number; isOfficial?: boolean }): Promise<TenantItem> {
  const res = await getAdminClient().request<{ updateTenant: any }>(
    `mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!) { updateTenant(id: $id, input: $input) { ${TENANT_FIELDS} } }`,
    { id, input },
  );
  return mapTenant(res.updateTenant);
}

export async function setTenantEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetTenantEnabled($id: ID!, $enabled: Boolean!) { setTenantEnabled(id: $id, enabled: $enabled) { id } }`,
    { id, enabled },
  );
}

export async function deleteTenant(id: string): Promise<void> {
  await getAdminClient().request(`mutation DeleteTenant($id: ID!) { deleteTenant(id: $id) }`, { id });
}

export async function fetchTenantAdministrators(channelId: string): Promise<TenantMemberItem[]> {
  const res = await getAdminClient().request<{ tenantAdministrators: TenantMemberItem[] }>(
    `query TenantAdministrators($channelId: ID!) {
      tenantAdministrators(channelId: $channelId) { id administratorId channelId enabled displayName remark phone roleIds createdAt }
    }`,
    { channelId },
  );
  return res.tenantAdministrators;
}

export async function createTenantAdministrator(
  channelId: string,
  input: { emailAddress: string; password?: string; roleIds: string[]; displayName?: string; phone?: string },
): Promise<string | null> {
  const res = await getAdminClient().request<{ createTenantAdministrator: { initialPassword?: string | null } }>(
    `mutation CreateTenantAdministrator($channelId: ID!, $input: CreateTenantAdministratorInput!) {
      createTenantAdministrator(channelId: $channelId, input: $input) { id initialPassword }
    }`,
    { channelId, input },
  );
  return res.createTenantAdministrator?.initialPassword ?? null;
}

export async function setTenantAdministratorEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetTenantAdministratorEnabled($id: ID!, $enabled: Boolean!) { setTenantAdministratorEnabled(id: $id, enabled: $enabled) { id } }`,
    { id, enabled },
  );
}

export async function deleteTenantAdministrator(id: string): Promise<void> {
  await getAdminClient().request(`mutation DeleteTenantAdministrator($id: ID!) { deleteTenantAdministrator(id: $id) }`, { id });
}

export async function fetchTenantRoles(channelId: string): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ tenantRoles: RoleItem[] }>(
    `query TenantRoles($channelId: ID!) { tenantRoles(channelId: $channelId) { id code description permissions } }`,
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
    `mutation UpdateTenantRole($roleId: ID!, $input: UpdateTenantRoleInput!) { updateTenantRole(roleId: $roleId, input: $input) { id } }`,
    { roleId, input },
  );
}

export async function deleteTenantRole(roleId: string): Promise<void> {
  await getAdminClient().request(`mutation DeleteTenantRole($roleId: ID!) { deleteTenantRole(roleId: $roleId) }`, { roleId });
}

// ===== 租户管理员视角（限定本 channel） =====
export async function fetchMyTenantMembers(): Promise<TenantMemberItem[]> {
  const res = await getAdminClient().request<{ tenantMembers: TenantMemberItem[] }>(
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark phone roleIds createdAt } }`,
  );
  return res.tenantMembers;
}

export async function createTenantMember(input: { emailAddress: string; password?: string; roleIds: string[]; displayName?: string; phone?: string }): Promise<string | null> {
  const res = await getAdminClient().request<{ createTenantMember: { initialPassword?: string | null } }>(
    `mutation CreateTenantMember($input: CreateTenantMemberInput!) { createTenantMember(input: $input) { id initialPassword } }`,
    { input },
  );
  return res.createTenantMember?.initialPassword ?? null;
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

export async function updateTenantMemberRolesToMember(id: string, roleIds: string[]): Promise<void> {
  await getAdminClient().request(
    `mutation MyUpdateTenantMemberRoles($id: ID!, $roleIds: [ID!]!) { myUpdateTenantMemberRoles(id: $id, roleIds: $roleIds) }`,
    { id, roleIds },
  );
}

export async function myCreateTenantRole(input: { code: string; description: string; permissions: string[] }): Promise<void> {
  await getAdminClient().request(
    `mutation MyCreateTenantRole($input: CreateTenantRoleInput!) { myCreateTenantRole(input: $input) { id } }`,
    { input },
  );
}

export async function myUpdateTenantRole(roleId: string, input: { description?: string; permissions?: string[] }): Promise<void> {
  await getAdminClient().request(
    `mutation MyUpdateTenantRole($roleId: ID!, $input: UpdateTenantRoleInput!) { myUpdateTenantRole(roleId: $roleId, input: $input) { id } }`,
    { roleId, input },
  );
}

export async function myDeleteTenantRole(roleId: string): Promise<void> {
  await getAdminClient().request(`mutation MyDeleteTenantRole($roleId: ID!) { myDeleteTenantRole(roleId: $roleId) }`, { roleId });
}