import { describe, it, expect } from 'vitest';
import { isForcedPasswordChange } from './routeGuard';

// 首登强改密：mustChangePassword=true 时必须停留在改密页，任何业务页（含刷新/深链）都要拦。
describe('isForcedPasswordChange', () => {
  it('未登录不触发强制改密', () => {
    expect(isForcedPasswordChange(false, true, '/pages/dashboard/index')).toBe(false);
  });

  it('标记为 false（已改密）不拦截', () => {
    expect(isForcedPasswordChange(true, false, '/pages/dashboard/index')).toBe(false);
  });

  it('标记为 true 时拦截业务页', () => {
    expect(isForcedPasswordChange(true, true, '/pages/dashboard/index')).toBe(true);
    expect(isForcedPasswordChange(true, true, '/pages/channel-select/index')).toBe(true);
    // 深链根入口（无 hash path）同样拦截
    expect(isForcedPasswordChange(true, true, '')).toBe(true);
  });

  it('放行改密页（含查询参数）与公开登录页', () => {
    expect(isForcedPasswordChange(true, true, '/pages/change-password/index')).toBe(false);
    expect(isForcedPasswordChange(true, true, '/pages/change-password/index?manual=1')).toBe(false);
    expect(isForcedPasswordChange(true, true, '/pages/login/index')).toBe(false);
  });
});
