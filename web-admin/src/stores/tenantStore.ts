import { defineStore } from 'pinia';
import { getChannelToken, getChannelCode, setChannelInfo } from '../apis/session';
import { resetBinMode } from '../composables/useBinMode';

export const useTenantStore = defineStore('tenant', {
  state: () => ({
    code: getChannelCode(),
    token: getChannelToken(),
    name: '',
  }),
  actions: {
    selectCh(ch: { code: string; token: string }, name?: string) {
      this.code = ch.code;
      this.token = ch.token;
      this.name = name ?? ch.code;
      setChannelInfo(ch.code, ch.token);
      // 切店后库位档位随渠道变化，强制失效缓存，避免沿用上一租户档位
      resetBinMode();
    },
    clear() {
      this.code = '';
      this.token = '';
      this.name = '';
    },
  },
});
