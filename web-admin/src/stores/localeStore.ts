import { defineStore } from 'pinia';
import { ref } from 'vue';
import zhHans from '../locale/zh-Hans.json';
import en from '../locale/en.json';

const STORAGE_KEY = 'wa_locale';
const SUPPORTED = ['zh-Hans', 'en'];
const DICTS: Record<string, Record<string, string>> = { 'zh-Hans': zhHans as any, en: en as any };

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<string>(load());

  function load(): string {
    let v = '';
    try {
      v = uni.getStorageSync(STORAGE_KEY) as string;
    } catch (_e) { /* ignore */ }
    return SUPPORTED.includes(v) ? v : 'zh-Hans';
  }

  function apply(localeOrNull?: string | null): void {
    const target = localeOrNull ?? locale.value;
    const next = SUPPORTED.includes(target) ? target : 'zh-Hans';
    try {
      // 同步到 uni 内置 i18n（导航栏文案等）；此处失败不阻断自研 $t
      uni.setLocale(next);
    } catch (_e) { /* ignore */ }
    try {
      uni.setStorageSync(STORAGE_KEY, next);
    } catch (_e) { /* ignore */ }
    locale.value = next;
  }

  // 校验当前 runtime locale，缺失时回退
  function ensure(): void {
    let cur = '';
    try { cur = uni.getLocale() as string; } catch (_e) { /* ignore */ }
    if (!SUPPORTED.includes(cur)) apply();
  }

  // 自研 translate：解析嵌套点键，当前 locale → 中文兜底 → 原文 key
  function t(key: string): string {
    const resolve = (dict?: any): string | undefined => {
      if (!dict) return undefined;
      let cur = dict;
      for (const part of key.split('.')) {
        if (cur === null || typeof cur !== 'object') return undefined;
        cur = cur[part];
        if (cur === undefined || cur === null) return undefined;
      }
      return typeof cur === 'string' ? cur : undefined;
    };
    return resolve(DICTS[locale.value]) ?? resolve(DICTS['zh-Hans']) ?? key;
  }

  return { locale, apply, ensure, t };
});