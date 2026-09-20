import { defineStore } from 'pinia';
import { AUTH_TOKEN_KEY, CHANNEL_TOKEN_KEY, CHANNEL_CODE_KEY, USER_ID_KEY } from '@/api/client';

export interface ChannelInfo {
  id: string;
  token: string;
  code: string;
}

/**
 * 轻量认证封装：直接复用 web-admin 写入的 wa_* 会话（pos-app 不再自己登录）。
 * 仅提供只读的鉴权状态与渠道信息，供 UI 顶栏展示；登出走 web-admin。
 */
function readChannelCode(): string {
  return localStorage.getItem(CHANNEL_CODE_KEY) ?? '';
}

function readChannelToken(): string {
  return localStorage.getItem(CHANNEL_TOKEN_KEY) ?? '';
}

function readUserId(): string {
  return localStorage.getItem(USER_ID_KEY) ?? '';
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    channelCode: readChannelCode(),
    channelToken: readChannelToken(),
    userId: readUserId(),
  }),
  getters: {
    isAuthenticated: () => !!localStorage.getItem(AUTH_TOKEN_KEY),
    activeChannel(): ChannelInfo | null {
      const token = this.channelToken;
      const code = this.channelCode;
      if (!token && !code) return null;
      return { id: '', token, code };
    },
  },
  actions: {
    /** 登出：跳回 web-admin 移动后台登录页（不清理 wa_* key，那些属于 web-admin 会话） */
    logoutToAdmin() {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      window.location.href = `${origin}/guanli/`;
    },
    refreshSessionInfo() {
      this.channelCode = readChannelCode();
      this.channelToken = readChannelToken();
      this.userId = readUserId();
    },
  },
});