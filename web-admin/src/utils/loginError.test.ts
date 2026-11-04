import { describe, expect, it } from 'vitest';
import { loginFailureMessage, rateLimitMinutes } from './loginError';

/** 用 key 本身做替身，便于断言命中了哪条词条 */
const t = (key: string) => key;

function gqlError(code: string, extensions: Record<string, unknown> = {}) {
  return { response: { status: 200, errors: [{ message: `backend:${code}`, extensions: { code, ...extensions } }] } };
}

describe('rateLimitMinutes', () => {
  it('900 秒 → 15 分钟', () => {
    expect(rateLimitMinutes(900)).toBe(15);
  });
  it('不足 1 分钟按 1 分钟', () => {
    expect(rateLimitMinutes(45)).toBe(1);
  });
  it('缺失/非法值回退默认窗口', () => {
    expect(rateLimitMinutes(undefined)).toBe(15);
    expect(rateLimitMinutes(0)).toBe(15);
    expect(rateLimitMinutes('abc')).toBe(15);
  });
});

describe('loginFailureMessage', () => {
  it('LOGIN_RATE_LIMITED 命中限流文案并带入分钟数', () => {
    expect(loginFailureMessage(gqlError('LOGIN_RATE_LIMITED', { retryAfterSeconds: 900 }), t))
      .toBe('login.rateLimited'.replace('{minutes}', '15'));
  });

  it('LOGIN_RATE_LIMITED 缺 retryAfterSeconds 时用 15 分钟默认值', () => {
    expect(loginFailureMessage(gqlError('LOGIN_RATE_LIMITED'), t))
      .toBe('login.rateLimited'.replace('{minutes}', '15'));
  });

  it('HTTP 429（无 GraphQL errors）走友好提示', () => {
    expect(loginFailureMessage({ response: { status: 429 } }, t)).toBe('login.tooManyRequests');
  });

  it('HTTP 429 带 errorPolicy 解析结果时仍走 429 分支', () => {
    expect(loginFailureMessage({ message: 'GraphQL Error (Code: 429)', response: { status: 429, errors: undefined } }, t))
      .toBe('login.tooManyRequests');
  });

  it('凭证错误仍走原有文案', () => {
    expect(loginFailureMessage(new Error('INVALID_CREDENTIALS_ERROR'), t)).toBe('login.invalidCredentials');
  });

  it('其他后端错误展示后端 message', () => {
    expect(loginFailureMessage(gqlError('UNKNOWN_ERROR'), t)).toBe('backend:UNKNOWN_ERROR');
  });

  it('无法识别的异常回退通用失败文案', () => {
    expect(loginFailureMessage({}, t)).toBe('login.failed');
  });
});
