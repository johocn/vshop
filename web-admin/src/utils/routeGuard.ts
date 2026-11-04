// 全局路由守卫：未登录时禁止进入受保护页（除登录页外全部业务页均需登录）。
// 拦截 uni 的导航 API；登录页自身放行，避免重定向递归。
import { useAuthStore } from '../stores/authStore';

const LOGIN_URL = '/pages/login/index';
const CHANGE_PASSWORD_URL = '/pages/change-password/index';
// 公开页（无需登录）：仅登录页
const PUBLIC_PAGES = ['/pages/login/index'];

function pathOf(url: string): string {
  return (url || '').split('?')[0].split('#')[0];
}

function isPublic(path: string): boolean {
  return PUBLIC_PAGES.some((p) => path === p);
}

/** 已登录但被标记首登强改密：公开页与改密页放行，其余一律拦回改密页 */
export function isForcedPasswordChange(authed: boolean, mustChange: boolean, url: string): boolean {
  if (!authed || !mustChange) return false;
  const path = pathOf(url);
  return !isPublic(path) && path !== CHANGE_PASSWORD_URL;
}

/** 目标受保护且未登录 → 重定向登录页并取消本次导航；返回 false 表示拦截 */
function guardTarget(url: string): boolean {
  const path = pathOf(url);
  if (!path || isPublic(path)) return true;
  const auth = useAuthStore();
  if (!auth.isAuthed) {
    uni.reLaunch({ url: LOGIN_URL });
    return false;
  }
  // 首登强改密未完成前不允许进入任何业务页（含选店/首页）
  if (isForcedPasswordChange(auth.isAuthed, auth.mustChangePassword, path)) {
    uni.reLaunch({ url: CHANGE_PASSWORD_URL });
    return false;
  }
  return true;
}

export function installRouteGuard(): void {
  const apis = ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch'];
  for (const api of apis) {
    (uni as any).addInterceptor(api, {
      invoke(args: { url?: string }) {
        return guardTarget(args?.url || '');
      },
    });
  }
  // #ifdef H5
  // 浏览器直接深链进入时不会触发上述导航拦截器，启动时按当前 hash 补一次判定
  if (typeof window !== 'undefined') {
    const m = /#(\/pages\/[^?#]*)/.exec(window.location.hash || '');
    const path = m?.[1] || '';
    if (path && !isPublic(path) && !useAuthStore().isAuthed) {
      uni.reLaunch({ url: LOGIN_URL });
    }
  }
  // #endif
}

/**
 * 会话恢复后补判一次首登强改密：启动时守卫先于 loadAccess 执行，
 * 刷新/深链已直接落在业务页，权限上下文加载完成后必须再拦一次。
 */
export function enforceSessionPolicy(): void {
  // #ifdef H5
  if (typeof window === 'undefined') return;
  const m = /#(\/pages\/[^?#]*)/.exec(window.location.hash || '');
  const path = m?.[1] || '';
  const auth = useAuthStore();
  if (isForcedPasswordChange(auth.isAuthed, auth.mustChangePassword, path)) {
    uni.reLaunch({ url: CHANGE_PASSWORD_URL });
  }
  // #endif
}
