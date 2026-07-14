<template>
    <view class="register-page">
        <view class="tabs">
            <view
                :class="['tab', mode === 'phone' ? 'active' : '']"
                @click="switchMode('phone')"
                >手机注册</view
            >
            <view
                :class="['tab', mode === 'email' ? 'active' : '']"
                @click="switchMode('email')"
                >邮箱注册</view
            >
        </view>

        <!-- 手机号注册 -->
        <template v-if="mode === 'phone'">
            <view class="form-group">
                <input
                    v-model="form.phoneNumber"
                    type="number"
                    placeholder="请输入手机号"
                    maxlength="11"
                />
            </view>
            <view class="form-group code-group">
                <input v-model="form.code" type="number" placeholder="验证码" maxlength="6" />
                <button :disabled="countdown > 0" @click="sendCode" class="code-btn">
                    {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
                </button>
            </view>
        </template>

        <!-- 邮箱注册 -->
        <template v-else>
            <view class="form-group">
                <input v-model="form.emailAddress" type="text" placeholder="请输入邮箱地址" />
            </view>
        </template>

        <view class="form-group">
            <input v-model="form.password" type="password" placeholder="设置密码（6-20位）" />
        </view>
        <button :disabled="loading" @click="handleRegister" class="register-btn">
            {{ loading ? '注册中...' : '注册' }}
        </button>
        <view class="login-link" @click="goLogin">已有账号？去登录</view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { sendPhoneVerificationCode, registerCustomer } from '@/api/mutations/auth';

type RegisterMode = 'phone' | 'email';

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
        uni.showToast({ title: '手机号格式错误', icon: 'none' });
        return;
    }
    try {
        await sendPhoneVerificationCode(form.phoneNumber);
        uni.showToast({ title: '验证码已发送', icon: 'success' });
        countdown.value = 60;
        const timer = setInterval(() => {
            countdown.value--;
            if (countdown.value <= 0) clearInterval(timer);
        }, 1000);
    } catch (e) {
        uni.showToast({ title: '发送失败', icon: 'none' });
    }
}

async function handleRegister() {
    if (mode.value === 'phone') {
        if (!form.phoneNumber || !form.code || !form.password) {
            uni.showToast({ title: '请填写完整信息', icon: 'none' });
            return;
        }
    } else {
        if (!form.emailAddress || !form.password) {
            uni.showToast({ title: '请填写完整信息', icon: 'none' });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress)) {
            uni.showToast({ title: '邮箱格式错误', icon: 'none' });
            return;
        }
    }
    if (form.password.length < 6 || form.password.length > 20) {
        uni.showToast({ title: '密码长度6-20位', icon: 'none' });
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
        if (result?.registerCustomer?.success) {
            uni.showToast({ title: '注册成功', icon: 'success' });
            setTimeout(() => goLogin(), 1500);
        } else {
            uni.showToast({ title: result?.registerCustomer?.message || '注册失败', icon: 'none' });
        }
    } catch (e) {
        uni.showToast({ title: '注册失败', icon: 'none' });
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
