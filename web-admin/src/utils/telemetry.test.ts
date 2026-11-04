import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 用假的 uni 运行环境断言是否真的发起请求 */
function installUni() {
  const request = vi.fn();
  (globalThis as any).uni = {
    request,
    getStorageSync: vi.fn(() => ''),
    setStorageSync: vi.fn(),
    addInterceptor: vi.fn(),
  };
  return request;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  delete (globalThis as any).uni;
  vi.useRealTimers();
});

describe('telemetry 开关', () => {
  it('默认关闭：track/pageView/reportError/flush/install 均不发起请求', async () => {
    const request = installUni();
    const mod = await import('./telemetry');
    expect(mod.telemetryEnabled).toBe(false);

    mod.track('page_view');
    mod.pageView();
    mod.reportError(new Error('boom'));
    mod.flush();
    mod.installTelemetry();

    expect(request).not.toHaveBeenCalled();
  });

  it('关闭时仍保留入参校验（空事件名直接忽略，不抛错）', async () => {
    const request = installUni();
    const mod = await import('./telemetry');
    expect(() => mod.track('')).not.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('打开开关后恢复上报：flush 发出 campusTrackEvents', async () => {
    const request = installUni();
    vi.useFakeTimers();
    vi.stubEnv('VITE_CAMPUS_TELEMETRY_ENABLED', 'true');

    const mod = await import('./telemetry');
    expect(mod.telemetryEnabled).toBe(true);

    mod.track('page_view', { from: 'test' });
    mod.flush();

    expect(request).toHaveBeenCalledTimes(1);
    const arg = request.mock.calls[0][0];
    expect(String(arg.url)).toContain('/shop-api');
    expect(JSON.stringify(arg.data)).toContain('campusTrackEvents');
    expect(JSON.stringify(arg.data)).toContain('page_view');
  });
});
