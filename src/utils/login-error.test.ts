import { describe, expect, it } from 'vitest';
import { loginErrorText, rateLimitMinutes } from './login-error';

/** 模拟 vue-i18n 的 t：返回插值后的词条，便于断言最终展示文案 */
const t = (key: string, params?: Record<string, unknown>) => {
  const dict: Record<string, string> = {
    'auth.loginRateLimited': '登录尝试过于频繁，请 {minutes} 分钟后再试',
    'auth.invalidCredentials': '账号或密码错误',
    'auth.tooManyRequests': '访问过于频繁，请稍后再试',
    'auth.loginFailed': '登录失败',
  };
  const tpl = dict[key] ?? key;
  return params ? tpl.replace(/\{(\w+)\}/g, (_m, k) => String(params[k] ?? '')) : tpl;
};

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

describe('loginErrorText', () => {
  it('LOGIN_RATE_LIMITED 显示限流文案，而非「登录失败」', () => {
    expect(loginErrorText({ code: 'LOGIN_RATE_LIMITED', retryAfterSeconds: 900, message: '后端原始中文提示' }, t))
      .toBe('登录尝试过于频繁，请 15 分钟后再试');
  });

  it('LOGIN_RATE_LIMITED 缺 retryAfterSeconds 时用默认 15 分钟', () => {
    expect(loginErrorText({ code: 'LOGIN_RATE_LIMITED' }, t)).toBe('登录尝试过于频繁，请 15 分钟后再试');
  });

  it('HTTP 429 映射为友好提示', () => {
    expect(loginErrorText({ code: 'TOO_MANY_REQUESTS', message: 'TOO_MANY_REQUESTS' }, t)).toBe('访问过于频繁，请稍后再试');
  });

  it('INVALID_CREDENTIALS_ERROR 走本地化文案，而不是后端英文 message', () => {
    expect(loginErrorText({ code: 'INVALID_CREDENTIALS_ERROR', message: 'The provided credentials are invalid' }, t))
      .toBe('账号或密码错误');
  });

  it('其他错误保留后端 message', () => {
    expect(loginErrorText({ message: '账号或密码不正确' }, t)).toBe('账号或密码不正确');
  });

  it('无 message 时回退通用失败文案', () => {
    expect(loginErrorText({}, t)).toBe('登录失败');
  });
});
