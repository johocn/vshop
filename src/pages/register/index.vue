<template>
    <view class="register-page">
        <view class="tabs">
            <view
            :class="['tab', mode === 'phone' ? 'active' : '']"
            @click="switchMode('phone')"
            >{{ t('register.phoneTab') }}</view
        >
        <view
            :class="['tab', mode === 'email' ? 'active' : '']"
            @click="switchMode('email')"
            >{{ t('register.emailTab') }}</view
        >
        </view>

        <!-- 手机号注册 -->
        <template v-if="mode === 'phone'">
            <view class="form-group">
                <input
                    v-model="form.phoneNumber"
                    type="number"
                    :placeholder="t('auth.phonePlaceholder')"
                    maxlength="11"
                />
            </view>
            <view class="form-group code-group">
                <input v-model="form.code" type="number" :placeholder="t('auth.codePlaceholder')" maxlength="6" />
                <button :disabled="countdown > 0" @click="sendCode" class="code-btn">
                    {{ countdown > 0 ? `${countdown}s` : t('auth.sendCode') }}
                </button>
            </view>
        </template>

        <!-- 邮箱注册 -->
        <template v-else>
            <view class="form-group">
                <input v-model="form.emailAddress" type="text" :placeholder="t('register.emailPlaceholder')" />
            </view>
        </template>

        <view class="form-group">
            <input v-model="form.password" type="password" :placeholder="t('register.passwordPlaceholder')" />
        </view>
        <button :disabled="loading" @click="handleRegister" class="register-btn">
            {{ loading ? t('register.registering') : t('register.submit') }}
        </button>
        <view class="login-link" @click="goLogin">{{ t('register.hasAccount') }}</view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { sendPhoneVerificationCode, registerCustomer } from '@/api/mutations/auth';

type RegisterMode = 'phone' | 'email';

const { t } = useI18n();
const mode = ref<RegisterMode>('phone');
const form = reactive({
    phoneNumber: '',
    code: '',
    emailAddress: '',
    password: '',
});
const countdown = ref(0);
const loading = ref(false);

function switchMode(m: RegisterMode) {
    mode.value = m;
}

async function sendCode() {
    if (!/^1\d{10}$/.test(form.phoneNumber)) {
        uni.showToast({ title: t('register.phoneInvalid'), icon: 'none' });
        return;
    }
    try {
        await sendPhoneVerificationCode(form.phoneNumber);
        uni.showToast({ title: t('auth.codeSent'), icon: 'success' });
        countdown.value = 60;
        const timer = setInterval(() => {
            countdown.value--;
            if (countdown.value <= 0) clearInterval(timer);
        }, 1000);
    } catch (e) {
        uni.showToast({ title: t('register.sendFailed'), icon: 'none' });
    }
}

/** 后端错误 → register 命名空间文案 key（code / message 双路兜底） */
const ERROR_CODE_KEY: Record<string, string> = {
    MISSING_PASSWORD_ERROR: 'errMissingPassword',
    PASSWORD_VALIDATION_ERROR: 'errPasswordInvalid',
    NATIVE_AUTH_STRATEGY_ERROR: 'errAuthStrategy',
};

const ERROR_MSG_KEY: Record<string, string> = {
    'EMAIL_ADDRESS_CONFLICT_ERROR': 'errEmailConflict',
    'MISSING_PASSWORD_ERROR': 'errMissingPassword',
    'PASSWORD_VALIDATION_ERROR': 'errPasswordInvalid',
    'NATIVE_AUTH_STRATEGY_ERROR': 'errAuthStrategy',
};

async function handleRegister() {
    if (mode.value === 'phone') {
        if (!form.phoneNumber || !form.code || !form.password) {
            uni.showToast({ title: t('register.fillAll'), icon: 'none' });
            return;
        }
    } else {
        if (!form.emailAddress || !form.password) {
            uni.showToast({ title: t('register.fillAll'), icon: 'none' });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress)) {
            uni.showToast({ title: t('register.emailInvalid'), icon: 'none' });
            return;
        }
    }
    if (form.password.length < 6 || form.password.length > 20) {
        uni.showToast({ title: t('register.passwordLength'), icon: 'none' });
        return;
    }
    loading.value = true;
    try {
        const payload =
            mode.value === 'phone'
                ? {
                      phoneNumber: form.phoneNumber,
                      code: form.code,
                      password: form.password,
                  }
                : {
                      emailAddress: form.emailAddress,
                      password: form.password,
                  };
        const result = await registerCustomer(payload);
        const res = result?.registerCustomerAccount;
        if (res?.success) {
            uni.showToast({ title: t('register.success'), icon: 'success' });
            setTimeout(() => goLogin(), 1500);
        } else {
            const errKey = ERROR_CODE_KEY[res?.errorCode] || ERROR_MSG_KEY[res?.message];
            const msg = errKey ? t('register.' + errKey) : res?.message || t('register.failed');
            uni.showToast({ title: msg, icon: 'none' });
        }
    } catch (e: any) {
        const errKey = ERROR_MSG_KEY[e?.message];
        const msg = errKey ? t('register.' + errKey) : e?.message || t('register.failed');
        uni.showToast({ title: msg, icon: 'none' });
    } finally {
        loading.value = false;
    }
}

function goLogin() {
    uni.redirectTo({ url: '/pages/login/index' });
}
</script>

<style scoped>
.register-page { padding: 40rpx; }
.tabs { display: flex; margin-bottom: 40rpx; border-bottom: 1px solid #ddd; }
.tab { flex: 1; text-align: center; padding: 20rpx 0; color: #666; font-size: 30rpx; }
.tab.active { color: #007aff; border-bottom: 2px solid #007aff; }
.form-group { margin-bottom: 30rpx; }
.form-group input { border: 1px solid #ddd; border-radius: 8rpx; padding: 20rpx; width: 100%; }
.code-group { display: flex; align-items: center; }
.code-group input { flex: 1; }
.code-btn { margin-left: 20rpx; white-space: nowrap; font-size: 24rpx; padding: 0 20rpx; height: 80rpx; line-height: 80rpx; }
.register-btn { background: #007aff; color: #fff; border-radius: 8rpx; margin-top: 40rpx; }
.login-link { text-align: center; margin-top: 30rpx; color: #007aff; font-size: 28rpx; }
</style>
