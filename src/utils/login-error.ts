/**
 * 登录失败提示映射。
 *
 * 后端登录限速命中时 GraphQL errors[0].extensions.code = LOGIN_RATE_LIMITED 并带 retryAfterSeconds；
 * nginx 的 IP 级限流超限是 HTTP 429。两者都要给出明确提示，且文案统一走 i18n（不写死中文）。
 */
export const LOGIN_RATE_LIMIT_FALLBACK_MINUTES = 15;

// vue-i18n 的 t 带复杂重载，这里只约束用到的两种调用形态
type Translate = (key: string, params?: any) => string;

/** retryAfterSeconds → 分钟（向上取整，最小 1；缺失/非法时回退后端窗口默认值） */
export function rateLimitMinutes(seconds: unknown, fallbackMinutes = LOGIN_RATE_LIMIT_FALLBACK_MINUTES): number {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return fallbackMinutes;
    return Math.max(1, Math.ceil(n / 60));
}

/**
 * @param e   login()/authenticate() 抛出的错误（api/mutations/auth.ts 已带 code/retryAfterSeconds）
 * @param t   vue-i18n 的 t（支持 {minutes} 插值）
 */
export function loginErrorText(e: any, t: Translate, fallbackMinutes = LOGIN_RATE_LIMIT_FALLBACK_MINUTES): string {
    const code = String(e?.code || '');
    if (code === 'LOGIN_RATE_LIMITED') {
        return t('auth.loginRateLimited', { minutes: rateLimitMinutes(e?.retryAfterSeconds, fallbackMinutes) });
    }
    if (code === 'TOO_MANY_REQUESTS') {
        return t('auth.tooManyRequests');
    }
    if (code === 'INVALID_CREDENTIALS_ERROR') {
        return t('auth.invalidCredentials');
    }
    return e?.message || t('auth.loginFailed');
}
