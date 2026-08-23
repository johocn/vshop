import { defineStore } from 'pinia';
import { adminLogin, fetchMyChannels } from '../apis/auth';
import { getAuthToken, setAuthToken, clearSession } from '../apis/session';

export const useAuthStore = defineStore('auth', {
  state: () => ({ token: getAuthToken(), username: '' as string, channels: [] as Array<{ id: string; code: string; token: string }> }),
  getters: { isAuthed: (s) => !!s.token, isSuperAdmin: (s) => s.username === 'superadmin' },
  actions: {
    async login(username: string, password: string) {
      const identifier = await adminLogin(username, password);
      this.username = identifier ?? username;
      this.token = getAuthToken();
      this.channels = await fetchMyChannels();
    },
    async loadChannels() {
      this.channels = await fetchMyChannels();
    },
    logout() {
      clearSession();
      this.token = '';
      this.username = '';
      this.channels = [];
    },
  },
});
