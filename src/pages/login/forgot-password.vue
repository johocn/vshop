<template>
  <view class="forgot-page">
    <view class="forgot-page__steps">
      <view class="step" :class="{ 'step--active': step === 1 }">
        <text class="step__num">1</text>
        <text class="step__label">{{ t('forgot.step1') }}</text>
      </view>
      <view class="step__line" :class="{ 'step__line--active': step === 2 }"></view>
      <view class="step" :class="{ 'step--active': step === 2 }">
        <text class="step__num">2</text>
        <text class="step__label">{{ t('forgot.step2') }}</text>
      </view>
    </view>

    <!-- 步骤一：验证身份 -->
    <view class="forgot-page__form" v-if="step === 1">
      <input class="forgot-page__input" v-model="phone" type="number" maxlength="11" :placeholder="t('forgot.phone')" />
      <view class="forgot-page__code-row">
        <input class="forgot-page__input" v-model="code" type="number" maxlength="6" :placeholder="t('forgot.codePlaceholder')" />
        <button class="forgot-page__code-btn" :disabled="countdown > 0" @click="sendCode">
          {{ countdown > 0 ? t('forgot.resend', { s: countdown }) : t('forgot.getCode') }}
        </button>
      </view>
      <button class="forgot-page__submit" :disabled="!phone || !code" @click="goStep2">{{ t('forgot.next') }}</button>
    </view>

    <!-- 步骤二：设置新密码 -->
    <view class="forgot-page__form" v-if="step === 2">
      <input class="forgot-page__input" v-model="newPassword" type="password" :placeholder="t('forgot.newPasswordPlaceholder')" />
      <button class="forgot-page__submit" :disabled="!newPassword || submitting" @click="submit">{{ t('forgot.submit') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '../../stores/ui';
import { sendPhoneVerificationCode, resetPasswordWithPhoneCode } from '../../api/mutations/auth';

const { t } = useI18n();
const ui = useUIStore();

const step = ref<1 | 2>(1);
const phone = ref('');
const code = ref('');
const newPassword = ref('');
const countdown = ref(0);
const submitting = ref(false);

const PHONE_RE = /^1[3-9]\d{9}$/;
let timer: ReturnType<typeof setInterval> | null = null;

function startCountdown() {
    countdown.value = 60;
    timer = setInterval(() => {
        countdown.value--;
        if (countdown.value <= 0 && timer) {
            clearInterval(timer);
            timer = null;
        }
    }, 1000);
}

async function sendCode() {
    if (!PHONE_RE.test(phone.value)) {
        ui.showToast(t('forgot.invalidPhone'));
        return;
    }
    try {
        // 后端限频时返回 false（60s 冷却/当日上限）
        const ok = await sendPhoneVerificationCode(phone.value);
        if (!ok) {
            ui.showToast(t('forgot.sendFail'));
            return;
        }
        startCountdown();
    } catch (e: any) {
        ui.showToast(e.message || t('forgot.sendFail'));
    }
}

function goStep2() {
    if (!PHONE_RE.test(phone.value)) {
        ui.showToast(t('forgot.invalidPhone'));
        return;
    }
    if (!code.value) return;
    step.value = 2;
}

async function submit() {
    if (!newPassword.value || submitting.value) return;
    submitting.value = true;
    try {
        const ok = await resetPasswordWithPhoneCode(phone.value, code.value, newPassword.value);
        if (ok) {
            ui.showToast(t('forgot.success'), 'success');
            setTimeout(() => {
                uni.redirectTo({ url: '/pages/login/index' });
            }, 1200);
        } else {
            ui.showToast(t('forgot.sendFail'));
        }
    } catch (e: any) {
        // authRequest 会把后端 GraphQL error message 解包为 e.message
        ui.showToast(e.message);
    } finally {
        submitting.value = false;
    }
}

onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>

<style lang="scss" scoped>
.forgot-page {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 100rpx 60rpx;
    &__steps { display: flex; align-items: center; margin-bottom: 80rpx; }
    &__form { width: 100%; }
    &__input { width: 100%; height: 96rpx; border-bottom: 1rpx solid $border-color; font-size: 30rpx; margin-bottom: 24rpx; }
    &__code-row { display: flex; gap: 20rpx; align-items: center; }
    &__code-btn { font-size: 24rpx; color: $brand-color; border: none; background: none; white-space: nowrap; min-width: 180rpx; &[disabled] { color: #999; } }
    &__submit { width: 100%; height: 96rpx; background: $brand-color; color: #fff; font-size: 32rpx; border-radius: $radius-md; margin-top: 40rpx; border: none; &[disabled] { opacity: 0.5; } }
}
.step { display: flex; align-items: center; gap: 12rpx; opacity: 0.4;
    &--active { opacity: 1; }
    &__num { width: 48rpx; height: 48rpx; border-radius: 50%; background: $brand-color; color: #fff; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
    &__label { font-size: 28rpx; color: $text-color; }
    &__line { width: 80rpx; height: 2rpx; background: $border-color; margin: 0 16rpx;
        &--active { background: $brand-color; }
    }
}
</style>
