/**
 * 登录失败提示映射。
 *
 * 后端登录限速（IP+账号）命中时返回 GraphQL errors[0].extensions.code = LOGIN_RATE_LIMITED，
 * 并带 retryAfterSeconds；nginx 的 IP 级限流超限时是 HTTP 429（响应体不一定是 JSON）。
 * 这两种情况都必须给出明确提示，不能退化成「账号或密码错误」或空白。
 */
export const LOGIN_RATE_LIMIT_FALLBACK_MINUTES = 15;

/** retryAfterSeconds → 分钟（向上取整，最小 1；缺失/非法时用后端窗口默认值） */
export function rateLimitMinutes(seconds: unknown, fallbackMinutes = LOGIN_RATE_LIMIT_FALLBACK_MINUTES): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return fallbackMinutes;
  return Math.max(1, Math.ceil(n / 60));
}

/**
 * @param err graphql-request 抛出的 ClientError（或 adminLogin 抛出的普通 Error）
 * @param t   localeStore.t（只接受 key，不含插值能力）
 */
export function loginFailureMessage(err: any, t: (key: string) => string, fallbackMinutes = LOGIN_RATE_LIMIT_FALLBACK_MINUTES): string {
  const gqlError = err?.response?.errors?.[0];
  const code = String(gqlError?.extensions?.code ?? '');
  const status = Number(err?.response?.status ?? 0);
  const retryAfterSeconds = gqlError?.extensions?.retryAfterSeconds ?? gqlError?.retryAfterSeconds;

  if (code === 'LOGIN_RATE_LIMITED') {
    return t('login.rateLimited').replace('{minutes}', String(rateLimitMinutes(retryAfterSeconds, fallbackMinutes)));
  }
  // HTTP 429：非 2xx 时 graphql-request 抛 ClientError，response.status 可取；此时 errors 可能为空
  if (status === 429) {
    return t('login.tooManyRequests');
  }
  if (String(err?.message ?? '') === 'INVALID_CREDENTIALS_ERROR') {
    return t('login.invalidCredentials');
  }
  return gqlError?.message || t('login.failed');
}
