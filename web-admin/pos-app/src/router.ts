import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  {
    path: '/setup',
    name: 'setup',
    component: () => import('@/views/SetupView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cashier',
    name: 'cashier',
    component: () => import('@/views/CashierView.vue'),
    meta: { requiresAuth: true, requiresSession: true },
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: () => import('@/views/CheckoutView.vue'),
    meta: { requiresAuth: true, requiresSession: true },
  },
  {
    path: '/shift',
    name: 'shift',
    component: () => import('@/views/ShiftView.vue'),
    meta: { requiresAuth: true, requiresSession: true },
  },
  {
    path: '/refund',
    name: 'refund',
    component: () => import('@/views/RefundView.vue'),
    meta: { requiresAuth: true, requiresSession: true },
  },
  {
    path: '/promotions',
    name: 'promotions',
    component: () => import('@/views/PromotionView.vue'),
    meta: { requiresAuth: true, requiresSession: true },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@/views/ReportView.vue'),
    meta: { requiresAuth: true, requiresSession: true },
  },
  // 无 /login 路由：未登录由守卫跳 web-admin 登录页
  { path: '/', redirect: '/setup' },
  { path: '/:pathMatch(.*)*', redirect: '/setup' },
];

const router = createRouter({
  // 生产部署到同域 /guanli/pos/，故 base 与 vite base 保持一致
  history: createWebHistory('/guanli/pos/'),
  routes,
});

function jumpToAdminLogin() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  window.location.href = `${origin}/guanli/`;
}

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const session = useSessionStore();

  // 无 web-admin 会话 → 跳 web-admin 登录页
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    jumpToAdminLogin();
    return false;
  }

  // 已登录但未加载过班次状态 → 加载一次（守卫需要据此分流）
  if (!session.loaded) {
    try {
      await session.loadMySession();
    } catch {
      // 网络错误按"未开班"处理
    }
  }

  // 需要已开班但未开班 → /setup
  if (to.meta.requiresSession && !session.isOpen) {
    return '/setup';
  }

  // 已开班访问 /setup → /cashier
  if (to.path === '/setup' && session.isOpen) {
    return '/cashier';
  }

  return true;
});

export default router;