import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zhTW from './locales/zh-TW.json';

export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'];

// 语言持久化：uni storage（H5 落 localStorage，key 为 vshop-locale）
function initialLocale(): string {
    try {
        const saved = uni.getStorageSync('vshop-locale');
        const locale = typeof saved === 'string' ? saved : '';
        if (SUPPORTED_LOCALES.includes(locale)) return locale;
    } catch (e) {}
    return 'zh-CN';
}

export const i18n = createI18n({
    locale: initialLocale(),
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja, ko },
});
