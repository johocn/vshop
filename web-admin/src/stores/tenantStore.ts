import { defineStore } from 'pinia';
import { getChannelToken, getChannelCode, setChannelInfo } from '../apis/session';

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
    },
    clear() {
      this.code = '';
      this.token = '';
      this.name = '';
    },
  },
});
