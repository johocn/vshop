import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const LOGIN_EVENT = 'auth:login';
const LOGOUT_EVENT = 'auth:logout';

export const useAuthStore = defineStore('auth', () => {
    const token = ref('');
    const userId = ref('');
    const userInfo = ref<any>(null);
    const inviteCode = ref('');

    const isLoggedIn = computed(() => !!token.value);

    function setAuth(newToken: string, newUserId: string) {
        token.value = newToken;
        userId.value = newUserId;
        uni.setStorageSync('auth_token', newToken);
        uni.setStorageSync('auth_userId', newUserId);
        uni.$emit(LOGIN_EVENT);
    }

    function setInviteCode(code: string) {
        if (!code) return;
        inviteCode.value = code;
        uni.setStorageSync('auth_inviteCode', code);
    }

    function restoreSession() {
        token.value = uni.getStorageSync('auth_token') || '';
        userId.value = uni.getStorageSync('auth_userId') || '';
        inviteCode.value = uni.getStorageSync('auth_inviteCode') || '';
    }

    function logout() {
        token.value = '';
        userId.value = '';
        userInfo.value = null;
        uni.removeStorageSync('auth_token');
        uni.removeStorageSync('auth_userId');
        uni.$emit(LOGOUT_EVENT);
    }

    function setUserInfo(info: any) {
        userInfo.value = info;
    }

    function onLogin(callback: () => void) {
        uni.$on(LOGIN_EVENT, callback);
        return () => uni.$off(LOGIN_EVENT, callback);
    }

    function onLogout(callback: () => void) {
        uni.$on(LOGOUT_EVENT, callback);
        return () => uni.$off(LOGOUT_EVENT, callback);
    }

    function requireLogin(redirect?: string): boolean {
        if (token.value) return true;
        const url = redirect
            ? '/pages/login/index?redirect=' + encodeURIComponent(redirect)
            : '/pages/login/index';
        uni.navigateTo({ url });
        return false;
    }

    return { token, userId, userInfo, inviteCode, isLoggedIn, setAuth, setInviteCode, restoreSession, logout, setUserInfo, onLogin, onLogout, requireLogin };
});
