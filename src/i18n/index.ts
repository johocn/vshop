import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';

export const i18n = createI18n({
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN },
});
