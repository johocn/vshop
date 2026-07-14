<template>
  <view class="login-page">
    <view class="login-page__logo">
      <text class="login-logo-icon">🛒</text>
      <text class="login-logo-text">VShop</text>
    </view>
    <view class="login-page__form" v-if="mode === 'phone'">
      <input class="login-page__input" v-model="phone" type="number" placeholder="请输入手机号" />
      <view class="login-page__code-row">
        <input class="login-page__input" v-model="code" type="number" placeholder="验证码" />
        <button class="login-page__code-btn" :disabled="countdown > 0" @click="sendCode">
          {{ countdown > 0 ? countdown + 's' : '发送验证码' }}
        </button>
      </view>
      <button class="login-page__submit" :disabled="!phone || !code" @click="loginWithPhone">登录</button>
    </view>
    <view class="login-page__form" v-if="mode === 'local'">
      <input class="login-page__input" v-model="username" type="text" placeholder="请输入用户名" />
      <input class="login-page__input" v-model="password" type="password" placeholder="请输入密码" />
      <button class="login-page__submit" :disabled="!username || !password" @click="loginWithLocal">登录</button>
    </view>
    <view class="login-page__actions" v-if="mode === 'select'">
      <!-- #ifdef MP-WEIXIN -->
      <button class="login-btn login-btn--wechat" @click="loginWithWechat">微信一键登录</button>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <button class="login-btn login-btn--wechat" v-if="isWechatBrowser && wechatAppId" @click="loginWithWechatH5('snsapi_userinfo')">微信登录</button>
      <!-- #endif -->
      <!-- #ifdef H5 || MP-ALIPAY -->
      <button class="login-btn login-btn--alipay" @click="loginWithAlipayH5">支付宝登录</button>
      <!-- #endif -->
      <!-- #ifdef H5 || MP-TOUTIAO -->
      <button class="login-btn login-btn--douyin" @click="loginWithDouyinH5">抖音登录</button>
      <!-- #endif -->
      <button class="login-btn login-btn--phone" @click="mode = 'phone'">手机号登录</button>
      <button class="login-btn login-btn--local" @click="mode = 'local'">账号密码登录</button>
      <view class="register-link" @click="goRegister">没有账号？去注册</view>
    </view>
    <view class="login-page__agreement">
      <text class="agreement-text">登录即表示同意</text>
      <text class="agreement-link">《用户协议》</text>
      <text class="agreement-text">和</text>
      <text class="agreement-link">《隐私政策》</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { sendPhoneVerificationCode, authenticateWithPhone, authenticateWithWechat, authenticateWithAlipay, authenticateWithDouyin, login } from '../../api/mutations/auth';
import { detectPlatform } from '../../utils/detect-env';

const authStore = useAuthStore();
const ui = useUIStore();
const mode = ref<'select' | 'phone' | 'local'>('select');
const phone = ref('');
const code = ref('');
const username = ref('');
const password = ref('');
const countdown = ref(0);
const redirectUrl = ref('');

const wechatAppId = import.meta.env.VITE_WECHAT_APP_ID || '';
const alipayAppId = import.meta.env.VITE_ALIPAY_APP_ID || '';
const douyinAppId = import.meta.env.VITE_DOUYIN_APP_ID || '';

const isWechatBrowser = computed(() => {
    // #ifdef H5
    try { return /MicroMessenger/i.test(navigator.userAgent); } catch (e) { return false; }
    // #endif
    return false;
});

onLoad((query: any) => {
    if (query?.redirect) redirectUrl.value = decodeURIComponent(query.redirect);
});

onMounted(() => {
    // #ifdef H5
    const url = new URL(window.location.href);
    const oauthCode = url.searchParams.get('code');
    const oauthState = url.searchParams.get('state');

    if (oauthCode && oauthState) {
        if (oauthState === 'wechat_base' || oauthState === 'wechat_userinfo') {
            handleWechatH5Callback(oauthCode);
            // Clean up URL params
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }
    }

    // 处理支付宝回调
    const alipayAuthCode = url.searchParams.get('alipay_auth_code');
    if (alipayAuthCode) {
        window.history.replaceState({}, '', window.location.pathname);
        handleAlipayH5Callback(alipayAuthCode);
        return;
    }

    // 处理抖音回调
    const douyinCode = url.searchParams.get('douyin_code');
    if (douyinCode) {
        window.history.replaceState({}, '', window.location.pathname);
        handleDouyinH5Callback(douyinCode);
        return;
    }

    // 环境侦测：自动触发对应三方登录
    if (!authStore.token) {
        const platform = detectPlatform();
        if (platform === 'wechat' && wechatAppId) {
            loginWithWechatH5('snsapi_base');
        } else if (platform === 'alipay') {
            loginWithAlipayH5();
        } else if (platform === 'douyin') {
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
        ui.showToast('验证码已发送', 'success');
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
            ui.showToast('登录成功', 'success');
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
            ui.showToast('登录成功', 'success');
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
        fail: (err: any) => { ui.showToast('微信登录失败: ' + err.errMsg); }
    });
    // #endif
}

function loginWithWechatH5(scope: 'snsapi_base' | 'snsapi_userinfo' = 'snsapi_base') {
    // #ifdef H5
    if (!wechatAppId) {
        ui.showToast('微信登录未配置');
        return;
    }
    const redirectUri = encodeURIComponent(window.location.href.split('?')[0]);
    const state = scope === 'snsapi_base' ? 'wechat_base' : 'wechat_userinfo';
    const oauthUrl = 'https://open.weixin.qq.com/connect/oauth2/authorize'
        + '?appid=' + wechatAppId
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
            ui.showToast('登录成功', 'success');
            navigateAfterLogin();
        }
    } catch (e: any) { ui.showToast('微信登录失败: ' + e.message); }
    // #endif
}

function loginWithAlipayH5() {
    // #ifdef H5
    if (!alipayAppId) {
        ui.showToast('支付宝登录未配置');
        return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + '/#/pages/login/index');
    window.location.href = `https://openauth.alipay.com/oauth2/publicAppAuthorize.htm?app_id=${alipayAppId}&scope=auth_user&redirect_uri=${redirectUri}`;
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
        fail: () => { ui.showToast('支付宝登录失败'); }
    });
    // #endif
}

function loginWithDouyinH5() {
    // #ifdef H5
    if (!douyinAppId) {
        ui.showToast('抖音登录未配置');
        return;
    }
    const redirectUri = encodeURIComponent(window.location.origin + '/#/pages/login/index');
    window.location.href = `https://developer.toutiao.com/openapi/oauth2/auth/v2/?app_id=${douyinAppId}&response_type=code&scope=user_info&redirect_uri=${redirectUri}`;
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
        fail: (err: any) => { ui.showToast('抖音登录失败: ' + err.errMsg); }
    });
    // #endif
}

async function handleAlipayH5Callback(authCode: string) {
    // #ifdef H5
    try {
        const result = await authenticateWithAlipay(authCode, 'h5');
        if (result.userId) {
            authStore.setAuth(result.token, result.userId);
            ui.showToast('登录成功', 'success');
            navigateAfterLogin();
        } else {
            ui.showToast('登录失败');
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
            ui.showToast('登录成功', 'success');
            navigateAfterLogin();
        } else {
            ui.showToast('登录失败');
            mode.value = 'select';
        }
    } catch (e: any) { ui.showToast(e.message); mode.value = 'select'; }
    // #endif
}

function goRegister() {
    uni.navigateTo({ url: '/pages/register/index' });
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
}
.register-link { font-size: 26rpx; color: $brand-color; text-align: center; margin-top: 20rpx; }
.agreement-text { font-size: 22rpx; color: #999; }
.agreement-link { font-size: 22rpx; color: $brand-color; }
</style>
