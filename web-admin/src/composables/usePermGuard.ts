import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';

/**
 * 页面级权限守卫：菜单已按权限过滤，这里兜底「直接输入 URL 进入」的场景。
 * 缺少权限时提示并返回上一页（接口层仍有后端 @Allow 兜底）。
 *
 * 刷新/直连时 access（含 isSuperAdmin / permissions）是异步拉取的，
 * 若在 access 就绪前判定会误伤超级管理员或正常账号 → 先等 access 就绪（≤6s）再判。
 */
export function usePermGuard(perm: string): void {
  const auth = useAuthStore();
  const locale = useLocaleStore();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let tries = 0;
  const MAX_TRIES = 20; // 20 × 300ms = 6s

  function check() {
    if (auth.hasPermission(perm)) return;
    if (!auth.access && auth.token && tries < MAX_TRIES) {
      tries += 1;
      timer = setTimeout(check, 300);
      return;
    }
    uni.showToast({ title: locale.t('common.noPermission'), icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
  }

  onMounted(check);
  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });
}
