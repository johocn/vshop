import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import zhCN from './i18n/locales/zh-CN.json';

const i18n = createI18n({
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN },
});

export function createApp() {
    const app = createSSRApp(App);
    const pinia = createPinia();
    app.use(pinia);
    app.use(i18n);
    return { app };
}
