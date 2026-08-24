import { defineStore } from 'pinia';
import { adminLogin, fetchMyTenantAccess, type MyTenantAccess } from '../apis/auth';
import { getAuthToken, clearSession } from '../apis/session';

export interface ChannelInfo {
  id: string;
  code: string;
  token: string;
  name?: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getAuthToken(),
    username: '' as string,
    channels: [] as ChannelInfo[],
    access: null as MyTenantAccess | null,
  }),
  getters: {
    isAuthed: (s) => !!s.token,
    isSuperAdmin: (s) => !!s.access?.isSuperAdmin || s.username === 'superadmin',
    permissions: (s) => s.access?.permissions ?? ([] as string[]),
  },
  actions: {
    async login(username: string, password: string) {
      const identifier = await adminLogin(username, password);
      this.username = identifier ?? username;
      this.token = getAuthToken();
      await this.loadAccess();
    },
    async loadAccess() {
      const access = await fetchMyTenantAccess();
      this.access = access;
      // 仅保留启用中的租户（停用租户/停用人员不可进入）
      this.channels = access.channels
        .filter((c) => c.enabled && c.memberEnabled)
        .map((c) => ({ id: c.id, code: c.code, token: c.token, name: c.name }));
    },
    hasPermission(p: string): boolean {
      return this.isSuperAdmin || this.permissions.includes(p);
    },
    logout() {
      clearSession();
      this.token = '';
      this.username = '';
      this.channels = [];
      this.access = null;
    },
  },
});