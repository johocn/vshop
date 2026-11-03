import { GraphQLClient } from 'graphql-request';
import { getAuthToken, getChannelToken, setAuthToken, clearSession } from './session';

export const ADMIN_API_PATH = '/admin-api';

/** 管理端请求超时：常规 30s（库存/报表类查询较慢），会话探测单独 8s */
const ADMIN_REQUEST_TIMEOUT_MS = 30000;
const SESSION_PROBE_TIMEOUT_MS = 8000;

function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

// 从 API 响应头捕获会话 token（Vendure 用 vendure-auth-token 下发新 session）
const AUTH_HEADER = 'vendure-auth-token';
// 店铺上下文 header（key 必须是 vendure-token，见设计文档 §6.2 已实测）
const CHANNEL_HEADER = 'vendure-token';

export function buildClientUrl(): string {
  const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base || origin}${ADMIN_API_PATH}`;
}

let instance: GraphQLClient | null = null;

// 会话失效统一分流：清会话 → 重置客户端 → 回登录页。
// handlingUnauthenticated 作去重闸，避免并发请求同时失败时连环跳转。
let handlingUnauthenticated = false;

function handleUnauthenticated(): void {
  if (handlingUnauthenticated) return;
  handlingUnauthenticated = true;
  clearSession();
  resetAdminClient();
  // Pinia 里的 token 不会因清 storage 自动失效：必须通知 authStore 登出，
  // 否则路由守卫与订单提醒仍按「已登录」状态运行。
  try { uni.$emit('admin:session-expired'); } catch { /* 非 UI 环境忽略 */ }
  setTimeout(() => {
    handlingUnauthenticated = false;
    uni.reLaunch({ url: '/pages/login/index' });
  }, 100);
}

// FORBIDDEN 探测：本 fork 的 auth-guard 对「会话失效」与「权限不足」均抛 ForbiddenError，
// 无法从单次响应区分。用 me（仅需 Authenticated）探测——会话真失效时 me 同样报错；
// 有会话但权限不足的用户 me 会成功，不误杀。
let probingSession = false;

async function probeSessionThenLogout(): Promise<void> {
  if (probingSession) return;
  probingSession = true;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = getAuthToken();
    if (auth) headers['Authorization'] = 'Bearer ' + auth;
    const ch = getChannelToken();
    if (ch) headers['vendure-token'] = ch;
    const res = await fetch(buildClientUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'query { me { id } }' }),
      signal: timeoutSignal(SESSION_PROBE_TIMEOUT_MS),
    });
    const body = await res.json();
    const code = body?.errors?.[0]?.extensions?.code;
    // 无效 token 下 me 可能返回 data.me=null（无 error）或 FORBIDDEN 两种形态，都视为会话失效
    if (!body?.data?.me || code === 'FORBIDDEN' || code === 'UNAUTHORIZED') handleUnauthenticated();
  } catch { /* 网络异常不误杀会话 */ } finally {
    probingSession = false;
  }
}

export function getAdminClient(): GraphQLClient {
  if (!instance) {
    const customFetch: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: init?.signal ?? timeoutSignal(ADMIN_REQUEST_TIMEOUT_MS) }).then(async (res) => {
        const token = res.headers.get(AUTH_HEADER);
        if (token) {
          setAuthToken(token);
        }
        if (res.status === 401) {
          handleUnauthenticated();
          return res;
        }
        // Vendure 未认证时 HTTP 仍为 200，错误码在 GraphQL errors[].extensions.code
        // （本 fork：无会话与权限不足均为 FORBIDDEN，后者走 me 探测区分；UNAUTHORIZED 理论保留）
        try {
          const body = await res.clone().json();
          const codes = (body?.errors || []).map((e: any) => e?.extensions?.code);
          if (codes.includes('UNAUTHORIZED')) {
            handleUnauthenticated();
          } else if (codes.includes('FORBIDDEN')) {
            void probeSessionThenLogout();
          }
        } catch { /* 非 JSON 响应忽略 */ }
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

/** 从 graphql-request 抛出的错误里提取对用户友好的 message（后端 errors[0].message 优先） */
export function graphQlErrorMsg(err: any, fallback = '操作失败'): string {
  return err?.response?.errors?.[0]?.message || err?.message || fallback;
}