<script lang="ts" setup>
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { getChannelToken } from './apis/session';
import { enableH5Nav } from './utils/h5Nav';
import { startOrderAlertHub } from './utils/orderAlertHub';
import { installRouteGuard } from './utils/routeGuard';
import { useLocaleStore } from './stores/localeStore';
import { useAuthStore } from './stores/authStore';
import { applyNavTitle, applyNavTitleForCurrentPage, setupNavTitleInterceptor, startNavTitleWatch } from './i18n/nav-titles';
import { installTelemetry } from './utils/telemetry';

onShow(() => {
  // 启动期路由观察：覆盖深链直载/前进后退等不走 uni 导航 API 的入口（仅前 5 秒）
  startNavTitleWatch();
});

onLaunch((options: any) => {
  // P4-4 埋点/错误上报（source=admin）
  installTelemetry();
  useLocaleStore().ensure();
  // 导航标题 i18n：四类导航成功后按目标页应用当前语言标题；启动页同样处理
  setupNavTitleInterceptor();
  applyNavTitle(String(options?.path || ''));
  applyNavTitleForCurrentPage();
  installRouteGuard();
  // 硬刷新/深链进入内页时 Pinia 会重建，权限上下文随之丢失（权限门控会被误判为「无权限」），
  // 故按已恢复的会话令牌补拉一次；失败静默（令牌失效由后续请求统一处理）
  const auth = useAuthStore();
  if (auth.isAuthed) auth.loadAccess().catch(() => {});
  // H5 端体验增强：悬浮「返回首页」按钮 + 面板页返回退出确认（仅在 H5 运行环境注入）
  if (typeof window !== 'undefined') {
    enableH5Nav({ hasStore: () => !!getChannelToken() });
    // 全局新订单提醒（H5）：登录态由 Hub 每 tick 自检，登录/登出动态生效
    startOrderAlertHub();
  }
});
</script>
<style lang="scss">
/* 全局基础样式占位 */
page { background: $wa-bg; color: $wa-ink; }

/* uni-app H5：修复 input 高度塌陷(1.4em)导致文字被裁剪为约1/10 */
uni-input {
  height: auto;
  min-height: 1.5em;
}
uni-input .uni-input-wrapper,
uni-input .uni-input-form {
  height: auto;
}
uni-input .uni-input-input {
  height: auto;
  min-height: 1.4em;
  line-height: 1.4em;
}

/* 打印：@page 版心 12mm 由页面自己声明，浏览器对 body 的默认 8px 外边距会把版心顶出纸面
   导致整页被缩放，故必须归零。uni-app H5 会给所有 SFC 的 <style> 强制补 scoped（App.vue 除外），
   页面内的 html/body 规则会被改写成 html[data-v-x]/body[data-v-x] 而永不命中，只能放在这里。 */
@media print {
  html, body { margin: 0; padding: 0; background: #fff; }
}
</style>