/**
 * 认证模式开关：cookie（默认）| bearer（回退）
 * - 默认走 cookie 会话（服务端下发 HttpOnly vadmin_sid），请求层不再附带 Authorization
 * - 回退：访问 /guanli/?auth=bearer 或控制台执行 localStorage.setItem('wa_auth_mode','bearer') 后刷新
 * - 恢复：访问 /guanli/?auth=cookie 或控制台执行 localStorage.setItem('wa_auth_mode','cookie') 后刷新
 */
export type AuthMode = 'cookie' | 'bearer';

const MODE_KEY = 'wa_auth_mode';
const DEFAULT_MODE: AuthMode = (import.meta.env?.VITE_WA_AUTH_MODE as string) === 'bearer' ? 'bearer' : 'cookie';

export function getAuthMode(): AuthMode {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('auth');
    if (q === 'cookie' || q === 'bearer') {
      localStorage.setItem(MODE_KEY, q);
      return q;
    }
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'cookie' || saved === 'bearer') return saved;
  } catch {
    /* 非浏览器环境直接使用默认值 */
  }
  return DEFAULT_MODE;
}

export function isBearerMode(): boolean {
  return getAuthMode() === 'bearer';
}

/** 仅 bearer 模式注入 Authorization；cookie 模式完全交给浏览器携带 HttpOnly 会话 */
export function authHeaders(token: string): Record<string, string> {
  return isBearerMode() && token ? { Authorization: 'Bearer ' + token } : {};
}
