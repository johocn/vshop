import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useLocaleStore } from './stores/localeStore';

// #ifdef H5
// 腾讯地图 Key：uni-app H5 的 <map> 从 window.__uniConfig.qqMapKey 读取底图 key。
// 未配置时地图不渲染，页面降级为手动输入经纬度（楼栋坐标维护页）。
const qqMapKey = (import.meta as any).env?.VITE_QQMAP_KEY as string | undefined;
if (qqMapKey) {
    const w = window as any;
    const cfg = w.__uniConfig ?? (w.__uniConfig = {});
    cfg.qqMapKey = qqMapKey;
    cfg.sdkConfigs = { ...(cfg.sdkConfigs || {}), maps: { ...((cfg.sdkConfigs || {}).maps || {}), qqmap: { key: qqMapKey } } };
}
// #endif

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