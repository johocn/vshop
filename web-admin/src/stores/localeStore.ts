import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getLocale, setLocale } from '@dcloudio/uni-app';

const STORAGE_KEY = 'wa_locale';
const SUPPORTED = ['zh-Hans', 'en'];

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
    try {
      if (SUPPORTED.includes(target)) setLocale(target);
      // setLocale 触发 vue3 自动重渲染；Storage 持久化
      uni.setStorageSync(STORAGE_KEY, target);
      locale.value = target;
    } catch (_e) {
      // 非法 locale 回退中文
      uni.setStorageSync(STORAGE_KEY, 'zh-Hans');
      locale.value = 'zh-Hans';
    }
  }

  // 校验当前 runtime locale，缺失时回退
  function ensure(): void {
    const cur = (() => { try { return getLocale(); } catch (_e) { return ''; } })();
    if (!SUPPORTED.includes(cur)) apply();
  }

  return { locale, apply, ensure };
});