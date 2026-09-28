// 全局路由守卫：未登录时禁止进入受保护页（除登录页外全部业务页均需登录）。
// 拦截 uni 的导航 API；登录页自身放行，避免重定向递归。
import { useAuthStore } from '../stores/authStore';

const LOGIN_URL = '/pages/login/index';
// 公开页（无需登录）：仅登录页
const PUBLIC_PAGES = ['/pages/login/index'];

function pathOf(url: string): string {
  return (url || '').split('?')[0].split('#')[0];
}

function isPublic(path: string): boolean {
  return PUBLIC_PAGES.some((p) => path === p);
}

/** 目标受保护且未登录 → 重定向登录页并取消本次导航；返回 false 表示拦截 */
function guardTarget(url: string): boolean {
  const path = pathOf(url);
  if (!path || isPublic(path)) return true;
  if (useAuthStore().isAuthed) return true;
  uni.reLaunch({ url: LOGIN_URL });
  return false;
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
