import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';

/**
 * 页面级权限守卫：菜单已按权限过滤，这里兜底「直接输入 URL 进入」的场景。
 * 缺少权限时提示并离开当前页（接口层仍有后端 @Allow 兜底）。
 *
 * perm 支持传数组，表示「满足其一即可」（如页面同时挂在两个权限下）。
 *
 * 刷新/直连时 access（含 isSuperAdmin / permissions）是异步拉取的，
 * 若在 access 就绪前判定会误伤超级管理员或正常账号 → 先等 access 就绪（≤6s）再判。
 */
export function usePermGuard(perm: string | string[]): void {
  const auth = useAuthStore();
  const locale = useLocaleStore();
  const perms = Array.isArray(perm) ? perm : [perm];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let tries = 0;
  const MAX_TRIES = 20; // 20 × 300ms = 6s

  function leave() {
    // 直链进入时没有历史栈，navigateBack 会失败并把用户留在原页（白屏），
    // 此时退回安全页（工作台），由菜单权限决定后续可去哪里。
    const pages = getCurrentPages();
    if (pages.length > 1) uni.navigateBack();
    else uni.reLaunch({ url: '/pages/dashboard/index' });
  }

  function check() {
    if (perms.some((p) => auth.hasPermission(p))) return;
    if (!auth.access && auth.token && tries < MAX_TRIES) {
      tries += 1;
      timer = setTimeout(check, 300);
      return;
    }
    uni.showToast({ title: locale.t('common.noPermission'), icon: 'none' });
    setTimeout(leave, 800);
  }

  onMounted(check);
  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });
}
