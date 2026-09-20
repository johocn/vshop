import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
} from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';

/** 会话 key：复用 web-admin 在 localStorage 写入的会话，pos-app 不再自己登录 */
export const AUTH_TOKEN_KEY = 'wa_auth_token';
export const CHANNEL_TOKEN_KEY = 'wa_channel_token';
export const CHANNEL_CODE_KEY = 'wa_channel_code';
export const USER_ID_KEY = 'wa_user_id';

/** 同源动态拼接 admin-api 地址，禁止硬编码域名（与 web-admin buildClientUrl 保持一致） */
export function buildClientUrl(): string {
  const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base || origin}/admin-api`;
}

/**
 * 自定义 fetch：从 response header 捕获 vendure-auth-token 并回写 wa_auth_token，
 * 让后端下发的刷新会话继续生效。仅作会话续期，不依赖其做登录。
 */
const customFetch = async (uri: string, options: RequestInit): Promise<Response> => {
  const response = await fetch(uri, options);
  const sessionToken = response.headers.get('vendure-auth-token');
  if (sessionToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, sessionToken);
  }
  return response;
};

/** 注入 Authorization: Bearer <auth-token> */
const authLink = setContext((_, { headers }) => {
  const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
  return {
    headers: {
      ...headers,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  };
});

/** 注入 vendure-token: <channel-token>（商店域路由） */
const channelLink = setContext((_, { headers }) => {
  const channelToken = localStorage.getItem(CHANNEL_TOKEN_KEY);
  return {
    headers: {
      ...headers,
      ...(channelToken ? { 'vendure-token': channelToken } : {}),
    },
  };
});

const httpLink = new HttpLink({
  uri: buildClientUrl(),
  fetch: customFetch as unknown as typeof fetch,
});

export const apolloClient = new ApolloClient({
  link: from([authLink, channelLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { errorPolicy: 'all' },
    mutate: { errorPolicy: 'all' },
  },
});