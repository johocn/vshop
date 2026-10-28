import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n } from './i18n';
import { reportError } from './utils/telemetry';

export function createApp() {
    const app = createSSRApp(App);
    const pinia = createPinia();
    app.use(pinia);
    app.use(i18n);
    // P4-4 组件内未捕获异常也统一上报（与 window 级监听互补）
    app.config.errorHandler = (err) => reportError(err);
    return { app };
}
