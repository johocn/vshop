import { onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';

/**
 * 页面级权限守卫：菜单已按权限过滤，这里兜底「直接输入 URL 进入」的场景。
 * 缺少权限时提示并返回上一页（接口层仍有后端 @Allow 兜底）。
 */
export function usePermGuard(perm: string): void {
  const auth = useAuthStore();
  const locale = useLocaleStore();
  onMounted(() => {
    if (auth.hasPermission(perm)) return;
    uni.showToast({ title: locale.t('common.noPermission'), icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
  });
}
