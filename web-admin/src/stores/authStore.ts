import { defineStore } from 'pinia';
import { adminLogin, fetchMyTenantAccess, type MyTenantAccess } from '../apis/auth';
import { getAuthToken, clearSession } from '../apis/session';
import { useTenantStore } from './tenantStore';

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
    // 首登强改密：为 true 时必须先完成改密才能进入后台
    mustChangePassword: (s) => !!s.access?.mustChangePassword,
  },
  actions: {
    async login(username: string, password: string) {
      const identifier = await adminLogin(username, password);
      this.username = identifier ?? username;
      this.token = getAuthToken();
      await this.loadAccess();
    },
    async loadAccess(channelId?: string) {
      const tenant = useTenantStore();
      let access = await fetchMyTenantAccess(channelId ?? undefined);
      // 未显式指定店铺、但会话已还原某店铺时，自动按该店铺限定权限（登录还原场景）
      if (!channelId && !access.isSuperAdmin && tenant.code) {
        const hit = access.channels.find((c) => c.code === tenant.code);
        if (hit) access = await fetchMyTenantAccess(hit.id);
      }
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