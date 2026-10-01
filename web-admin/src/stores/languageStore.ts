// 租户语言配置 store：单次加载 + 会话内缓存
// 「是否多语言」唯一判定 = availableLanguageCodes.length > 1（multilingualEnabled 已废弃）
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  fetchActiveChannelId,
  fetchTenantMultiLanguage,
  updateTenantMultiLanguage,
  type MultiLanguageConfig,
} from '../apis/tenant-settings';
import {
  DEFAULT_LANGUAGE_CODES,
  FALLBACK_LANGUAGE_CODE,
  normalizeLanguageCodes,
} from '../constants/languages';

export const useLanguageStore = defineStore('language', () => {
  const availableLanguageCodes = ref<string[]>([...DEFAULT_LANGUAGE_CODES]);
  const defaultLanguageCode = ref<string>(FALLBACK_LANGUAGE_CODE);
  const loaded = ref(false);
  const loading = ref(false);

  const isMulti = computed(() => availableLanguageCodes.value.length > 1);

  /** 把后端配置（或 null）落到本地状态，保证 zh_Hans 必选、默认语言必在集合内 */
  function apply(cfg: MultiLanguageConfig | null | undefined): void {
    const raw = cfg?.availableLanguageCodes?.length
      ? cfg.availableLanguageCodes
      : [...DEFAULT_LANGUAGE_CODES];
    const withFallback = raw.includes(FALLBACK_LANGUAGE_CODE)
      ? raw
      : [FALLBACK_LANGUAGE_CODE, ...raw];
    const codes = normalizeLanguageCodes(withFallback);
    availableLanguageCodes.value = codes;
    const def = cfg?.defaultLanguageCode;
    defaultLanguageCode.value = def && codes.includes(def) ? def : codes[0];
  }

  /** 会话内单次加载（force=true 强制重读）；读失败保持内置默认（中英），不阻断页面 */
  async function ensureLoaded(force = false): Promise<void> {
    if (loaded.value && !force) return;
    if (loading.value) return;
    loading.value = true;
    try {
      const channelId = await fetchActiveChannelId();
      if (channelId) apply(await fetchTenantMultiLanguage(channelId));
    } catch {
      apply(null);
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  /** 保存语言配置并按后端返回值回填本地状态；失败向上抛（由页面提示） */
  async function save(
    channelId: string,
    next: { availableLanguageCodes: string[]; defaultLanguageCode: string },
  ): Promise<void> {
    const merged = await updateTenantMultiLanguage(channelId, next);
    apply(merged ?? next);
  }

  return {
    availableLanguageCodes,
    defaultLanguageCode,
    loaded,
    loading,
    isMulti,
    ensureLoaded,
    save,
    apply,
  };
});
