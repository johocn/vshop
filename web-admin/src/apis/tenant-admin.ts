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
  merchantStatus?: string | null;
  domain?: string | null;
}

export interface TenantMemberItem {
  id: string;
  administratorId: string;
  channelId: string;
  enabled: boolean;
  displayName?: string | null;
  remark?: string | null;
  phone?: string | null;
  emailAddress?: string | null;
  roleIds?: string[];
  canResetPassword?: boolean;
  createdAt: string;
}

export interface RoleItem {
  id: string;
  code: string;
  description: string;
  permissions: string[];
  grantable?: boolean;
  channels?: { id: string }[];
}

export interface RoleTemplateItem {
  key: string;
  busiPrefix: string;
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
    merchantStatus: t.customFields?.merchantStatus ?? null,
    domain: t.customFields?.domain ?? null,
  };
}

const TENANT_FIELDS = `id code token customFields { shopName enabled tenantNo isOfficial merchantStatus domain }`;

export async function fetchTenant(id: string): Promise<TenantItem> {
  const res = await getAdminClient().request<{ tenant: any }>(
    `query Tenant($id: ID!) { tenant(id: $id) { ${TENANT_FIELDS} } }`,
    { id },
  );
  return mapTenant(res.tenant);
}

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

export async function updateTenant(id: string, input: { name?: string; tenantNo?: number; isOfficial?: boolean; domain?: string }): Promise<TenantItem> {
  const res = await getAdminClient().request<{ updateTenant: any }>(
    `mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!) { updateTenant(id: $id, input: $input) { ${TENANT_FIELDS} } }`,
    { id, input },
  );
  return mapTenant(res.updateTenant);
}

/** 重置租户管理人密码为默认口令 you123123（仅超管） */
export async function resetTenantAdministratorPassword(memberId: string): Promise<void> {
  await getAdminClient().request(
    `mutation ResetTenantAdminPassword($memberId: ID!) { resetTenantAdministratorPassword(memberId: $memberId) }`,
    { memberId },
  );
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

// ===== 租户位（预留 20 个位置） =====
export interface TenantSlotItem { no: number; occupied: boolean; tenantId?: string | null; name?: string | null; }
export interface TenantSlotsResult { capacity: number; used: number; slots: TenantSlotItem[]; }

export async function fetchTenantSlots(): Promise<TenantSlotsResult> {
  const res = await getAdminClient().request<{ tenantSlots: TenantSlotsResult }>(
    `query TenantSlots { tenantSlots { capacity used slots { no occupied tenantId name } } }`,
  );
  return res.tenantSlots;
}

/** 清空指定租户名下全部商品（从零开始）。返回被删除/隐藏的商品数。 */
export async function clearTenantProducts(channelId: string): Promise<number> {
  const res = await getAdminClient().request<{ clearTenantProducts: number }>(
    `mutation ClearTenantProducts($channelId: ID!) { clearTenantProducts(channelId: $channelId) }`,
    { channelId },
  );
  return res.clearTenantProducts;
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

export async function importTenantDefaultRoles(channelId: string): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ importDefaultRoles: RoleItem[] }>(
    `mutation ImportDefaultRoles($channelId: ID!) { importDefaultRoles(channelId: $channelId) { id code description permissions } }`,
    { channelId },
  );
  return res.importDefaultRoles ?? [];
}

// ===== 全局角色池（超管） =====
export async function fetchGlobalRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ globalRoles: RoleItem[] }>(
    `query GlobalRoles { globalRoles { id code description permissions channels { id } } }`,
  );
  return res.globalRoles;
}

export async function fetchGlobalRoleTemplates(): Promise<RoleTemplateItem[]> {
  const res = await getAdminClient().request<{ globalRoleTemplates: RoleTemplateItem[] }>(
    `query GlobalRoleTemplates { globalRoleTemplates { key busiPrefix description permissions } }`,
  );
  return res.globalRoleTemplates ?? [];
}

export async function createGlobalRole(
  channelIds: string[],
  input: { code: string; description: string; permissions: string[] },
): Promise<RoleItem[]> {
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

// ===== 全局角色池（租户自助，限定本 channel） =====
export async function fetchMyGlobalRolesAvailable(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ myGlobalRolesAvailable: RoleItem[] }>(
    `query MyGlobalRolesAvailable { myGlobalRolesAvailable { id code description permissions } }`,
  );
  return res.myGlobalRolesAvailable;
}

export async function myReferGlobalRole(roleId: string): Promise<void> {
  await getAdminClient().request(`mutation MyReferGlobalRole($roleId: ID!) { myReferGlobalRole(roleId: $roleId) }`, { roleId });
}

export async function myUnreferGlobalRole(roleId: string): Promise<void> {
  await getAdminClient().request(`mutation MyUnreferGlobalRole($roleId: ID!) { myUnreferGlobalRole(roleId: $roleId) }`, { roleId });
}

export async function myImportDefaultRoles(): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ myImportDefaultRoles: RoleItem[] }>(
    `mutation MyImportDefaultRoles { myImportDefaultRoles { id code description permissions } }`,
  );
  return res.myImportDefaultRoles ?? [];
}

// ===== 租户管理员视角（限定本 channel） =====
export async function fetchMyTenantMembers(): Promise<TenantMemberItem[]> {
  const res = await getAdminClient().request<{ tenantMembers: TenantMemberItem[] }>(
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark phone emailAddress roleIds createdAt canResetPassword } }`,
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
    `query MyTenantRoles { myTenantRoles { id code description permissions grantable } }`,
  );
  return res.myTenantRoles;
}

export async function updateTenantMemberRolesToMember(id: string, roleIds: string[]): Promise<void> {
  await getAdminClient().request(
    `mutation MyUpdateTenantMemberRoles($id: ID!, $roleIds: [ID!]!) { myUpdateTenantMemberRoles(id: $id, roleIds: $roleIds) }`,
    { id, roleIds },
  );
}

/** 租户自助重置本租户成员密码为默认口令 you123123 */
export async function resetTenantMemberPasswordToDefault(memberId: string): Promise<void> {
  await getAdminClient().request(
    `mutation MyResetTenantMemberPassword($id: ID!) { myResetTenantMemberPassword(id: $id) }`,
    { id: memberId },
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

// ===== 关联已有账号（平台/租户视角） =====
export interface AdminSearchCandidate {
  id: string;
  emailAddress: string;
  displayName: string;
  linkedCount: number;
  linkedChannelIds: string[];
  alreadyLinked: boolean;
}

const SEARCH_CANDIDATE_FIELDS = `id emailAddress displayName linkedCount linkedChannelIds alreadyLinked`;

export async function searchTenantAdmins(channelId: string, keyword: string): Promise<AdminSearchCandidate[]> {
  const res = await getAdminClient().request<{ tenantSearchAdmins: AdminSearchCandidate[] }>(
    `query TenantSearchAdmins($channelId: ID!, $keyword: String!) {
      tenantSearchAdmins(channelId: $channelId, keyword: $keyword) { ${SEARCH_CANDIDATE_FIELDS} }
    }`,
    { channelId, keyword },
  );
  return res.tenantSearchAdmins;
}

export async function linkTenantMember(
  channelId: string,
  input: { administratorId: string; roleIds: string[]; displayName?: string; phone?: string; remark?: string },
): Promise<string> {
  const res = await getAdminClient().request<{ tenantLinkMember: { id: string } }>(
    `mutation TenantLinkMember($channelId: ID!,
      $administratorId: ID!, $roleIds: [ID!]!, $displayName: String, $phone: String, $remark: String) {
      tenantLinkMember(channelId: $channelId, administratorId: $administratorId, roleIds: $roleIds,
        displayName: $displayName, phone: $phone, remark: $remark) { id }
    }`,
    { channelId, ...input },
  );
  return res.tenantLinkMember.id;
}

export async function searchMyAdmins(keyword: string): Promise<AdminSearchCandidate[]> {
  const res = await getAdminClient().request<{ mySearchAdmins: AdminSearchCandidate[] }>(
    `query MySearchAdmins($keyword: String!) { mySearchAdmins(keyword: $keyword) { ${SEARCH_CANDIDATE_FIELDS} } }`,
    { keyword },
  );
  return res.mySearchAdmins;
}

export async function linkTenantMemberToSelf(
  input: { administratorId: string; roleIds: string[]; displayName?: string; phone?: string; remark?: string },
): Promise<string> {
  const res = await getAdminClient().request<{ myLinkMember: { id: string } }>(
    `mutation MyLinkMember($administratorId: ID!, $roleIds: [ID!]!, $displayName: String, $phone: String, $remark: String) {
      myLinkMember(administratorId: $administratorId, roleIds: $roleIds,
        displayName: $displayName, phone: $phone, remark: $remark) { id }
    }`,
    input,
  );
  return res.myLinkMember.id;
}