import { GraphQLClient } from 'graphql-request';
import { getAuthToken, getChannelToken, setAuthToken } from './session';

export const ADMIN_API_PATH = '/admin-api';

// 从 API 响应头捕获会话 token（Vendure 用 vendure-auth-token 下发新 session）
const AUTH_HEADER = 'vendure-auth-token';
// 店铺上下文 header（key 必须是 vendure-token，见设计文档 §6.2 已实测）
const CHANNEL_HEADER = 'vendure-token';

function buildClientUrl(): string {
  const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base || origin}${ADMIN_API_PATH}`;
}

let instance: GraphQLClient | null = null;

export function getAdminClient(): GraphQLClient {
  if (!instance) {
    const customFetch: typeof fetch = (input, init) =>
      fetch(input, init).then((res) => {
        const token = res.headers.get(AUTH_HEADER);
        if (token) {
          setAuthToken(token);
        }
        return res;
      });
    instance = new GraphQLClient(buildClientUrl(), {
      fetch: customFetch as any,
      headers: () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const auth = getAuthToken();
        if (auth) headers['Authorization'] = 'Bearer ' + auth;
        const ch = getChannelToken();
        if (ch) headers[CHANNEL_HEADER] = ch;
        return headers;
      },
    });
  }
  return instance;
}

export function resetAdminClient(): void { instance = null; }