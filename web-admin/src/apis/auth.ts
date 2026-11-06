// 认证相关 admin-api 调用（Task 3，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - login(username/password) 返回 CurrentUser / InvalidCredentialsError union —— 可用
//   - me { channels { id code token } } —— 可用（token 为店铺上下文 header 值）
import { getAdminClient } from './client';
import { clearSession } from './session';

export interface AdminChannel {
  id: string;
  code: string;
  token: string;
}

/** 退出登录：通知后端销毁会话（Cookie 会话为 HttpOnly 后，前端无法自行清除） */
export async function adminLogout(): Promise<void> {
  try {
    await getAdminClient().request(`mutation { logout { success } }`);
  } catch {
    // 会话已失效或网络异常时仍需清理本地状态，这里不阻断
  }
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ id: string; identifier: string } | null> {
  const res = await getAdminClient().request<{
    login: { id?: string; identifier?: string; errorCode?: string; message?: string } | null;
  }>(
    `mutation Login($u: String!, $p: String!) {
      login(username: $u, password: $p) {
        ... on CurrentUser { id identifier }
        ... on InvalidCredentialsError { errorCode message }
      }
    }`,
    { u: username, p: password },
  );
  if (!res.login?.identifier) {
    // 登录失败不能沿用旧会话，否则前端会拿上一个账号的 token 继续请求，表现为“登录成功但无数据”
    clearSession();
    throw new Error(res.login?.errorCode || 'INVALID_CREDENTIALS_ERROR');
  }
  return { id: String(res.login.id ?? ''), identifier: res.login.identifier };
}

export async function fetchMyChannels(): Promise<AdminChannel[]> {
  const res = await getAdminClient().request<{ me: { channels: AdminChannel[] } }>(
    `query { me { channels { id code token } } }`,
  );
  return res.me.channels;
}

export interface MyTenantChannel {
  id: string;
  code: string;
  token: string;
  name: string;
  enabled: boolean;
  tenantNo?: number | null;
  isOfficial: boolean;
  memberEnabled: boolean;
  mustChangePassword: boolean;
}

export interface MyTenantAccess {
  isSuperAdmin: boolean;
  channels: MyTenantChannel[];
  permissions: string[];
  mustChangePassword: boolean;
}

export async function fetchMyTenantAccess(channelId?: string): Promise<MyTenantAccess> {
  const res = await getAdminClient().request<{ myTenantAccess: MyTenantAccess }>(
    `query MyTenantAccess($channelId: ID) {
      myTenantAccess(channelId: $channelId) {
        isSuperAdmin
        channels { id code token name enabled tenantNo isOfficial memberEnabled mustChangePassword }
        permissions
        mustChangePassword
      }
    }`,
    { channelId: channelId ?? null },
  );
  return res.myTenantAccess;
}

/** 修改当前登录者自身密码（主动改密传 oldPassword；首登强改密不传，后端跳过旧密码校验） */
export async function changeMyPassword(newPassword: string, oldPassword?: string): Promise<void> {
  await getAdminClient().request(
    `mutation ChangeMyPassword($oldPassword: String, $newPassword: String!) { tenantChangeMyPassword(oldPassword: $oldPassword, newPassword: $newPassword) }`,
    { oldPassword: oldPassword ?? null, newPassword },
  );
}
