import { defineStore } from 'pinia';
import { adminLogin, fetchMyTenantAccess, type MyTenantAccess } from '../apis/auth';
import { getAuthToken, getUserId, setUserId, clearSession } from '../apis/session';
import { useTenantStore } from './tenantStore';

export interface ChannelInfo {
  id: string;
  code: string;
  token: string;
  name?: string;
  tenantNo?: number | null;
  isOfficial?: boolean;
  enabled?: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getAuthToken(),
    userId: getUserId() as string,
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
      const info = await adminLogin(username, password);
      this.username = info?.identifier ?? username;
      if (info?.id) {
        this.userId = String(info.id);
        setUserId(this.userId);
      }
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
      // 保留所有租户：停用租户（enabled=false）以灰态展示在前端，仅人员被停用（memberEnabled=false）的租户不展示
      // 按 tenantNo 升序排（官方自营 1-20 在前，演示店随后，无编号者最后），保证选店页顺序稳定
      this.channels = access.channels
        .filter((c) => c.memberEnabled !== false)
        .map((c) => ({ id: c.id, code: c.code, token: c.token, name: c.name, tenantNo: c.tenantNo ?? null, isOfficial: c.isOfficial === true, enabled: c.enabled }))
        .sort((a, b) => (a.tenantNo ?? Infinity) - (b.tenantNo ?? Infinity) || a.code.localeCompare(b.code));
    },
    hasPermission(p: string): boolean {
      return this.isSuperAdmin || this.permissions.includes(p);
    },
    logout() {
      clearSession();
      this.token = '';
      this.userId = '';
      this.username = '';
      this.channels = [];
      this.access = null;
    },
  },
});