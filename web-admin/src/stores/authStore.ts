import { defineStore } from 'pinia';
import { adminLogin, fetchMyChannels } from '../apis/auth';
import { getAuthToken, setAuthToken, clearSession } from '../apis/session';

export const useAuthStore = defineStore('auth', {
  state: () => ({ token: getAuthToken(), channels: [] as Array<{ id: string; code: string; token: string }> }),
  getters: { isAuthed: (s) => !!s.token },
  actions: {
    async login(username: string, password: string) {
      await adminLogin(username, password);
      this.token = getAuthToken();
      this.channels = await fetchMyChannels();
    },
    async loadChannels() {
      this.channels = await fetchMyChannels();
    },
    logout() {
      clearSession();
      this.token = '';
      this.channels = [];
    },
  },
});
