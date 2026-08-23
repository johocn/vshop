// 认证相关 admin-api 调用（Task 3，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - login(username/password) 返回 CurrentUser / InvalidCredentialsError union —— 可用
//   - me { channels { id code token } } —— 可用（token 为店铺上下文 header 值）
import { getAdminClient } from './client';

export interface AdminChannel {
  id: string;
  code: string;
  token: string;
}

export async function adminLogin(username: string, password: string): Promise<string | null> {
  const res = await getAdminClient().request<{
    login: { identifier?: string };
  }>(
    `mutation Login($u: String!, $p: String!) {
      login(username: $u, password: $p) {
        ... on CurrentUser { id identifier }
        ... on InvalidCredentialsError { errorCode message }
      }
    }`,
    { u: username, p: password },
  );
  return res.login?.identifier ?? null;
}

export async function fetchMyChannels(): Promise<AdminChannel[]> {
  const res = await getAdminClient().request<{ me: { channels: AdminChannel[] } }>(
    `query { me { channels { id code token } } }`,
  );
  return res.me.channels;
}
