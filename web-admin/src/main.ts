import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useLocaleStore } from './stores/localeStore';

export function createApp() {
    const app = createSSRApp(App);
    const pinia = createPinia();
    app.use(pinia);
    const localeStore = useLocaleStore(pinia);
    // 自研全局 $t：模板 `{{ $t(key) }}` 编译为实例方法 a.$t，经 globalProperties 注入
    // (uni 内置 i18n 组件级 $t 在本 H5 构建未注入，改用统一翻译入口保证可用)
    app.config.globalProperties.$t = (key: string) => localeStore.t(key);
    return { app };
}