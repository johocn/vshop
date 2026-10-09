<template>
  <view class="login-page">
    <view class="login-page__logo">
      <text class="login-logo-icon">🛒</text>
      <text class="login-logo-text">Youshop</text>
    </view>
    <view class="login-page__form" v-if="mode === 'phone'">
      <input class="login-page__input" v-model="phone" type="number" :placeholder="t('auth.phonePlaceholder')" />
      <view class="login-page__code-row">
        <input class="login-page__input" v-model="code" type="number" :placeholder="t('auth.codePlaceholder')" />
        <button class="login-page__code-btn" :disabled="countdown > 0" @click="sendCode">
          {{ countdown > 0 ? countdown + 's' : t('auth.sendCode') }}
        </button>
      </view>
      <button class="login-page__submit" :disabled="!phone || !code" @click="loginWithPhone">{{ t('auth.login') }}</button>
    </view>
    <view class="login-page__form" v-if="mode === 'local'">
      <input class="login-page__input" v-model="username" type="text" :placeholder="t('auth.usernamePlaceholder')" />
      <input class="login-page__input" v-model="password" type="password" :placeholder="t('auth.passwordPlaceholder')" />
      <button class="login-page__submit" :disabled="!username || !password" @click="loginWithLocal">{{ t('auth.login') }}</button>
    </view>
    <view class="login-page__actions" v-if="mode === 'select'">
      <!-- #ifdef MP-WEIXIN -->
      <button class="login-btn login-btn--wechat" v-if="authMethods.includes('wechat')" @click="loginWithWechat">{{ t('auth.wechatQuickLogin') }}</button>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <button class="login-btn login-btn--wechat" v-if="authMethods.includes('wechat') && isWechatBrowser && wechatAppId" @click="loginWithWechatH5('snsapi_userinfo')">{{ t('auth.wechatLogin') }}</button>
      <!-- #endif -->
      <!-- #ifdef H5 || MP-ALIPAY -->
      <button class="login-btn login-btn--alipay" v-if="authMethods.includes('alipay')" @click="loginWithAlipayH5">{{ t('auth.alipayLogin') }}</button>
      <!-- #endif -->
      <!-- #ifdef H5 || MP-TOUTIAO -->
      <button class="login-btn login-btn--douyin" v-if="authMethods.includes('douyin')" @click="loginWithDouyinH5">{{ t('auth.douyinLogin') }}</button>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <button
        v-for="p in ssoProviders"
        :key="p.providerKey"
        class="login-btn login-btn--sso"
        @click="loginWithSso(p)"
      >{{ t('auth.ssoProviderLogin', { name: p.name }) }}</button>
      <!-- #endif -->
      <button class="login-btn login-btn--phone" v-if="authMethods.includes('phone')" @click="mode = 'phone'">{{ t('auth.phoneLogin') }}</button>
      <button class="login-btn login-btn--local" v-if="authMethods.includes('native')" @click="mode = 'local'">{{ t('auth.accountLogin') }}</button>
      <view class="register-link" @click="goRegister">{{ t('auth.register') }}</view>
    </view>
    <view class="login-page__agreement">
      <text class="agreement-text">{{ t('auth.agreementPrefix') }}</text>
      <text class="agreement-link" @click="goAgreement('user')">{{ t('auth.userAgreement') }}</text>
      <text class="agreement-text">{{ t('auth.agreementAnd') }}</text>
      <text class="agreement-link" @click="goAgreement('privacy')">{{ t('auth.privacyPolicy') }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onLoad } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useTenantStore } from '../../stores/tenant';
import { useUIStore } from '../../stores/ui';
import { sendPhoneVerificationCode, authenticateWithPhone, authenticateWithWechat, authenticateWithAlipay, authenticateWithDouyin, login, ssoLogin, authenticateSsoWithToken } from '../../api/mutations/auth';
import { getGraphQLClient } from '../../api/client';
import { detectPlatform } from '../../utils/detect-env';

const { t } = useI18n();
const authStore = useAuthStore();
const tenantStore = useTenantStore();
const ui = useUIStore();
const mode = ref<'select' | 'phone' | 'local'>('select');
const phone = ref('');
const code = ref('');
const username = ref('');
const password = ref('');
const countdown = ref(0);
const redirectUrl = ref('');
const lastWechatAuthFailed = ref(false);

const wechatAppId = computed(() => tenantStore.wechatAppId || import.meta.env.VITE_WECHAT_APP_ID || '');
const alipayAppId = import.meta.env.VITE_ALIPAY_APP_ID || '';
const douyinAppId = import.meta.env.VITE_DOUYIN_APP_ID || '';

const authMethods = computed<string[]>(() => tenantStore.authMethods);
const ssoProviders = computed(() => tenantStore.ssoProviders);

const isWechatBrowser = computed(() => {
    // #ifdef H5
    try { return /MicroMessenger/i.test(navigator.userAgent); } catch (e) { return false; }
    // #endif
    return false;
});

function isSafeRedirect(path: string): boolean {
    if (!path.startsWith('/')) return false;
    if (path.startsWith('//')) return false;
    if (path.includes('://')) return false;
    if (path.startsWith('/pages/admin/')) return false;
    return true;
}

// ── OAuth state（防登录 CSRF）─────────────────────────────────
// 跳转前生成随机 state 存入 sessionStorage，回调时校验并消费。
// 仅用 [a-z0-9]（微信要求 state 为 a-zA-Z0-9 且 ≤128 字节）。
const OAUTH_STATE_KEY = 'oauth_state';

function randomOAuthState(prefix: string): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let rnd = '';
    for (let i = 0; i < 24; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
    return prefix + rnd;
}

function saveOAuthState(state: string) {
    // #ifdef H5
    try { sessionStorage.setItem(OAUTH_STATE_KEY, state); } catch (e) { /* 忽略 */ }
    // #endif
}

function consumeOAuthState(): string {
    // #ifdef H5
    try {
        const s = sessionStorage.getItem(OAUTH_STATE_KEY) || '';
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        return s;
    } catch (e) { return ''; }
    // #endif
    return '';
}

/** 回到本页的 state 可能落在 search 或 hash query（H5 hash 路由） */
function readOAuthState(url: URL): string {
    // #ifdef H5
    return url.searchParams.get('state') || getHashQueryParams().state || '';
    // #endif
    return '';
}

onLoad((query: any) => {
    if (query?.redirect) {
        const redirect = decodeURIComponent(query.redirect);
        if (isSafeRedirect(redirect)) redirectUrl.value = redirect;
    }
});

onMounted(async () => {
    // #ifdef H5
    await tenantStore.loadAuthMethods();
    await tenantStore.loadSsoProviders();

    // 处理 SSO 回调（靠 sessionStorage 的 sso_provider 标识，与现有 OAuth 回调区分）
    const ssoHandled = await handleSsoCallback();
    if (ssoHandled) return;

    const url = new URL(window.location.href);
    const oauthCode = url.searchParams.get('code');
    const oauthState = url.searchParams.get('state');

    if (oauthCode && oauthState) {
        const expected = consumeOAuthState();
        window.history.replaceState({}, '', window.location.pathname);
        // 校验随机 state：不匹配视为登录 CSRF，拒绝
        if (oauthState.startsWith('wc') && oauthState === expected) {
            handleWechatH5Callback(oauthCode);
        } else {
            ui.showToast(t('auth.loginFailed'));
        }
        return;
    }

    // 处理支付宝回调
    const alipayAuthCode = url.searchParams.get('alipay_auth_code');
    if (alipayAuthCode) {
        const expected = consumeOAuthState();
        const gotState = readOAuthState(url);
        window.history.replaceState({}, '', window.location.pathname);
        if (gotState.startsWith('ali') && gotState === expected) {
            handleAlipayH5Callback(alipayAuthCode);
        } else {
            ui.showToast(t('auth.loginFailed'));
        }
        return;
    }

    // 处理抖音回调
    const douyinCode = url.searchParams.get('douyin_code');
    if (douyinCode) {
        const expected = consumeOAuthState();
        const gotState = readOAuthState(url);
        window.history.replaceState({}, '', window.location.pathname);
        if (gotState.startsWith('dy') && gotState === expected) {
            handleDouyinH5Callback(douyinCode);
        } else {
            ui.showToast(t('auth.loginFailed'));
        }
        return;
    }

    // SSO 自动跳转（所有环境）：未登录且存在 SSO 提供商时，自动跳 h.joho.cn 统一登录页
    if (!authStore.token && ssoProviders.value.length && !sessionStorage.getItem('sso_auto_jumped')) {
        sessionStorage.setItem('sso_auto_jumped', '1');
        loginWithSso(ssoProviders.value[0]);
        return;
    }

    // 环境侦测：自动触发对应三方登录（受 authMethods 控制；仅当未走 SSO 自动跳转时）
    if (!authStore.token && !lastWechatAuthFailed.value) {
        const platform = detectPlatform();
        if (platform === 'wechat' && wechatAppId.value && authMethods.value.includes('wechat')) {
            loginWithWechatH5('snsapi_base');
        } else if (platform === 'alipay' && authMethods.value.includes('alipay')) {
            loginWithAlipayH5();
        } else if (platform === 'douyin' && authMethods.value.includes('douyin')) {
            loginWithDouyinH5();
        }
    }
    // #endif
});

function navigateAfterLogin() {
    if (redirectUrl.value) {
        uni.redirectTo({ url: redirectUrl.value });
    } else {
        uni.switchTab({ url: '/pages/home/index' });
    }
}

async function sendCode() {
    if (!phone.value) return;
    try {
        await sendPhoneVerificationCode(phone.value);
        ui.showToast(t('auth.codeSent'), 'success');
        countdown.value = 60;
        const timer = setInterval(() => { countdown.value--; if (countdown.value <= 0) clearInterval(timer); }, 1000);
    } catch (e: any) { ui.showToast(e.message); }
}

async function loginWithPhone() {
    if (!phone.value || !code.value) return;
    try {
        const result = await authenticateWithPhone(phone.value, code.value);
        if (result.userId) {
            authStore.setAuth(result.token, result.userId);
            if (authStore.inviteCode) { tryUpdateReferredBy(authStore.inviteCode); }
            ui.showToast(t('auth.loginSuccess'), 'success');
            navigateAfterLogin();
        }
    } catch (e: any) { ui.showToast(e.message); }
}

async function loginWithLocal() {
    if (!username.value || !password.value) return;
    try {
        const result = await login(username.value, password.value);
        if (result.userId) {
            authStore.setAuth(result.token, result.userId);
            if (authStore.inviteCode) { tryUpdateReferredBy(authStore.inviteCode); }
            ui.showToast(t('auth.loginSuccess'), 'success');
            navigateAfterLogin();
        }
    } catch (e: any) { ui.showToast(e.message); }
}

async function loginWithWechat() {
    // #ifdef MP-WEIXIN
    uni.login({
        provider: 'weixin',
        success: async (loginRes: any) => {
            try {
                const result = await authenticateWithWechat(loginRes.code, 'mini');
                if (result.userId) {
                    authStore.setAuth(result.token, result.userId);
                    navigateAfterLogin();
                }
            } catch (e: any) { ui.showToast(e.message); }
        },
        fail: (err: any) => { ui.showToast(t('auth.wechatLoginFailed') + ': ' + err.errMsg); }
    });
    // #endif
}

function loginWithWechatH5(scope: 'snsapi_base' | 'snsapi_userinfo' = 'snsapi_base') {
    // #ifdef H5
    if (!wechatAppId.value) {
        ui.showToast(t('auth.wechatNotConfigured'));
        return;
    }
    const redirectUri = encodeURIComponent(window.location.href.split('?')[0]);
    const state = randomOAuthState('wc');
    saveOAuthState(state);
    const oauthUrl = 'https://open.weixin.qq.com/connect/oauth2/authorize'
        + '?appid=' + wechatAppId.value
        + '&redirect_uri=' + redirectUri
        + '&response_type=code'
        + '&scope=' + scope
        + '&state=' + state
        + '#wechat_redirect';
    window.location.href = oauthUrl;
    // #endif
}

async function handleWechatH5Callback(oauthCode: string) {
    // #ifdef H5
    try {
        const result = await authenticateWithWechat(oauthCode, 'mp');
        if (result.userId) {
            authStore.setAuth(result.token, result.userId);
            if (authStore.inviteCode) { tryUpdateReferredBy(authStore.inviteCode); }
            ui.showToast(t('auth.loginSuccess'), 'success');
            navigateAfterLogin();
        } else {
            lastWechatAuthFailed.value = true;
            ui.showToast(t('auth.wechatLoginFailedRetry'), 'none');
            mode.value = 'select';
        }
    } catch (e: any) {
        lastWechatAuthFailed.value = true;
        ui.showToast(t('auth.wechatLoginFailed') + ': ' + e.message);
        mode.value = 'select';
    }
    // #endif
}

function loginWithAlipayH5() {
    // #ifdef H5
    if (!alipayAppId) {
        ui.showToast(t('auth.alipayNotConfigured'));
        return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + '/#/pages/login/index');
    const state = randomOAuthState('ali');
    saveOAuthState(state);
    window.location.href = `https://openauth.alipay.com/oauth2/publicAppAuthorize.htm?app_id=${alipayAppId}&scope=auth_user&state=${state}&redirect_uri=${redirectUri}`;
    // #endif
    // #ifdef MP-ALIPAY
    my.getAuthCode({
        scopes: ['auth_user'],
        success: async (res: any) => {
            try {
                const result = await authenticateWithAlipay(res.authCode, 'mini');
                if (result.userId) {
                    authStore.setAuth(result.token, result.userId);
                    navigateAfterLogin();
                }
            } catch (e: any) { ui.showToast(e.message); }
        },
        fail: () => { ui.showToast(t('auth.alipayLoginFailed')); }
    });
    // #endif
}

function loginWithDouyinH5() {
    // #ifdef H5
    if (!douyinAppId) {
        ui.showToast(t('auth.douyinNotConfigured'));
        return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + '/#/pages/login/index');
    const state = randomOAuthState('dy');
    saveOAuthState(state);
    window.location.href = `https://developer.toutiao.com/openapi/oauth2/auth/v2/?app_id=${douyinAppId}&response_type=code&scope=user_info&state=${state}&redirect_uri=${redirectUri}`;
    // #endif
    // #ifdef MP-TOUTIAO
    uni.login({
        provider: 'toutiao',
        success: async (loginRes: any) => {
            try {
                const result = await authenticateWithDouyin(loginRes.code, 'mini');
                if (result.userId) {
                    authStore.setAuth(result.token, result.userId);
                    navigateAfterLogin();
                }
            } catch (e: any) { ui.showToast(e.message); }
        },
        fail: (err: any) => { ui.showToast(t('auth.douyinLoginFailed') + ': ' + err.errMsg); }
    });
    // #endif
}

async function handleAlipayH5Callback(authCode: string) {
    // #ifdef H5
    try {
        const result = await authenticateWithAlipay(authCode, 'h5');
        if (result.userId) {
            authStore.setAuth(result.token, result.userId);
            if (authStore.inviteCode) { tryUpdateReferredBy(authStore.inviteCode); }
            ui.showToast(t('auth.loginSuccess'), 'success');
            navigateAfterLogin();
        } else {
            ui.showToast(t('auth.loginFailed'));
            mode.value = 'select';
        }
    } catch (e: any) { ui.showToast(e.message); mode.value = 'select'; }
    // #endif
}

async function handleDouyinH5Callback(code: string) {
    // #ifdef H5
    try {
        const result = await authenticateWithDouyin(code, 'h5');
        if (result.userId) {
            authStore.setAuth(result.token, result.userId);
            if (authStore.inviteCode) { tryUpdateReferredBy(authStore.inviteCode); }
            ui.showToast(t('auth.loginSuccess'), 'success');
            navigateAfterLogin();
        } else {
            ui.showToast(t('auth.loginFailed'));
            mode.value = 'select';
        }
    } catch (e: any) { ui.showToast(e.message); mode.value = 'select'; }
    // #endif
}

// H5 hash 路由下，SSO 统一页回跳的 token/code 落在 hash query 而非 window.location.search
function getHashQueryParams(): Record<string, string> {
    // #ifdef H5
    try {
        const hs = window.location.hash.split('?')[1] || '';
        const params: Record<string, string> = {};
        for (const [k, v] of new URLSearchParams(hs).entries()) params[k] = v;
        return params;
    } catch { return {}; }
    // #endif
    return {};
}

function loginWithSso(provider: any) {
    // #ifdef H5
    let unifiedLoginUrl: string;
    let params: Record<string, string>;

    if (provider.protocol === 'zhao-sso') {
        // 统一页 token 直验流：跳 h.joho.cn 统一登录页，登录成功回跳携带 token
        const origin = new URL(provider.baseUrl).origin;
        unifiedLoginUrl = `${origin}/#/pages/sso/login`;
        params = {
            app_code: provider.clientId,
            return_url: window.location.origin + '/#/pages/login/index',
        };
        if (provider.channelCode) params.channel_code = provider.channelCode;
    } else {
        // 通用 OAuth2 authorize 流（保持原逻辑，给非 zhao-sso 协议兜底）
        unifiedLoginUrl = provider.authorizeUrl;
        params = {
            client_id: provider.clientId,
            redirect_uri: window.location.origin + '/#/pages/login/index',
            response_type: 'code',
            scope: (provider.scopes || []).join(' '),
        };
    }

    // 随机 state：防登录 CSRF（回调时校验）
    const state = randomOAuthState('sso');
    saveOAuthState(state);
    params.state = state;
    sessionStorage.setItem('sso_state', state);
    sessionStorage.setItem('sso_provider', provider.providerKey);
    const query = new URLSearchParams(params).toString();
    window.location.href = `${unifiedLoginUrl}?${query}`;
    // #endif
}

// 处理 SSO 回调：靠 sessionStorage 的 sso_provider 标识区分于现有 OAuth 回调
// 统一页 token 直验流回跳 ?token=xxx；旧 code 流保留兜底
async function handleSsoCallback(): Promise<boolean> {
    // #ifdef H5
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = getHashQueryParams();
    const token = urlParams.get('token') ?? hashParams.token ?? '';
    const code = urlParams.get('code') ?? hashParams.code ?? '';
    const providerKey = sessionStorage.getItem('sso_provider');
    const cleanUrl = () => {
        const hash = window.location.hash.split('?')[0] || '';
        return window.location.origin + window.location.pathname + hash;
    };
    if ((token || code) && providerKey) {
        // 校验 state（防登录 CSRF）：仅当回调携带 state 时强制匹配，
        // 避免破坏「统一页未回传 state」的既有流程
        const gotState = urlParams.get('state') ?? hashParams.state ?? '';
        const expectedState = sessionStorage.getItem('sso_state') || '';
        if (gotState && expectedState && gotState !== expectedState) {
            sessionStorage.removeItem('sso_provider');
            sessionStorage.removeItem('sso_state');
            window.history.replaceState({}, '', cleanUrl());
            ui.showToast(t('auth.ssoLoginFailed'));
            mode.value = 'select';
            return true;
        }
        try {
            const result = token
                ? await authenticateSsoWithToken(providerKey, token)
                : await ssoLogin(providerKey, code);
            if (result.userId) {
                sessionStorage.removeItem('sso_provider');
                sessionStorage.removeItem('sso_state');
                sessionStorage.removeItem('sso_auto_jumped');
                authStore.setAuth(result.token, result.userId);
                ui.showToast(t('auth.loginSuccess'), 'success');
                window.history.replaceState({}, '', cleanUrl());
                navigateAfterLogin();
                return true;
            }
        } catch (e: any) {
            sessionStorage.removeItem('sso_provider');
            sessionStorage.removeItem('sso_state');
            window.history.replaceState({}, '', cleanUrl());
            ui.showToast(t('auth.ssoLoginFailed') + ': ' + e.message);
            mode.value = 'select';
            return true;
        }
    }
    // #endif
    return false;
}

async function tryUpdateReferredBy(inviteCode: string) {
    try {
        const client = getGraphQLClient();
        const res: any = await client.request(`query {
            activeCustomer { id customFields { referredBy } }
        }`);
        if (res?.activeCustomer?.customFields?.referredBy) return;
        await client.request(`mutation UpdateCustomerReferredBy($referredBy: String!) {
            updateCustomer(input: { customFields: { referredBy: $referredBy } }) {
                ...on Customer { id }
                ...on ErrorResult { errorCode }
            }
        }`, { referredBy: inviteCode });
    } catch (e) {
        console.error('补写 referredBy 失败', e);
    }
}

function goRegister() {
    uni.navigateTo({ url: '/pages/register/index' });
}

function goAgreement(type: 'user' | 'privacy') {
    uni.navigateTo({ url: `/pkg-user/pages/agreement?type=${type}` });
}
</script>
<style lang="scss" scoped>
.login-page {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 120rpx 60rpx;
    &__logo { display: flex; flex-direction: column; align-items: center; margin-bottom: 100rpx; }
    &__form { width: 100%; }
    &__input { width: 100%; height: 96rpx; border-bottom: 1rpx solid $border-color; font-size: 30rpx; margin-bottom: 24rpx; }
    &__code-row { display: flex; gap: 20rpx; align-items: center; }
    &__code-btn { font-size: 24rpx; color: $brand-color; border: none; background: none; white-space: nowrap; min-width: 180rpx; }
    &__submit { width: 100%; height: 96rpx; background: $brand-color; color: #fff; font-size: 32rpx; border-radius: $radius-md; margin-top: 40rpx; border: none; &[disabled] { opacity: 0.5; } }
    &__actions { width: 100%; margin-top: 60rpx; display: flex; flex-direction: column; gap: 24rpx; }
    &__agreement { position: fixed; bottom: 40rpx; display: flex; flex-wrap: wrap; justify-content: center; }
}
.login-logo-icon { font-size: 100rpx; }
.login-logo-text { font-size: 40rpx; font-weight: bold; margin-top: 16rpx; color: $brand-color; }
.login-btn { height: 96rpx; font-size: 30rpx; border-radius: $radius-md; border: none; display: flex; align-items: center; justify-content: center;
    &--wechat { background: #07c160; color: #fff; }
    &--alipay { background: #1677ff; color: #fff; }
    &--douyin { background: #000; color: #fff; }
    &--phone { background: #fff; color: $text-color; border: 1rpx solid $border-color; }
    &--local { background: #fff; color: $text-color; border: 1rpx solid $border-color; }
    &--sso { background: #fff; color: $text-color; border: 1rpx solid $border-color; }
}
.register-link { font-size: 26rpx; color: $brand-color; text-align: center; margin-top: 20rpx; }
.agreement-text { font-size: 22rpx; color: #999; }
.agreement-link { font-size: 22rpx; color: $brand-color; }
</style>
