<template>
    <view class="pwd-page">
        <view class="pwd-form">
            <view class="pwd-form__item">
                <text class="label">{{ t('changePassword.currentPassword') }}</text>
                <input v-model="current" class="input" type="password" :placeholder="t('changePassword.currentPlaceholder')" />
            </view>
            <view class="pwd-form__item">
                <text class="label">{{ t('changePassword.newPassword') }}</text>
                <input v-model="next" class="input" type="password" :placeholder="t('changePassword.newPlaceholder')" />
            </view>
            <view class="pwd-form__item">
                <text class="label">{{ t('changePassword.confirmPassword') }}</text>
                <input v-model="confirm" class="input" type="password" :placeholder="t('changePassword.confirmPlaceholder')" />
            </view>
            <button class="pwd-submit" :disabled="loading" @tap="submit">{{ loading ? t('changePassword.submitting') : t('changePassword.confirmChange') }}</button>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { updateCustomerPassword } from '../../api/mutations/auth';

const { t } = useI18n();
const current = ref('');
const next = ref('');
const confirm = ref('');
const loading = ref(false);

async function submit() {
    if (!current.value || !next.value) {
        uni.showToast({ title: t('changePassword.fillRequired'), icon: 'none' });
        return;
    }
    if (next.value.length < 4) {
        uni.showToast({ title: t('changePassword.tooShort'), icon: 'none' });
        return;
    }
    if (next.value !== confirm.value) {
        uni.showToast({ title: t('changePassword.mismatch'), icon: 'none' });
        return;
    }
    loading.value = true;
    try {
        const res = await updateCustomerPassword(current.value, next.value);
        if (res.__typename === 'Success') {
            uni.showToast({ title: t('changePassword.changeSuccess'), icon: 'success' });
            setTimeout(() => uni.navigateBack(), 800);
        } else {
            uni.showToast({ title: res.message || t('changePassword.changeFailed'), icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || t('changePassword.changeFailed'), icon: 'none' });
    } finally {
        loading.value = false;
    }
}
</script>

<style lang="scss" scoped>
.pwd-page { min-height: 100vh; background: $bg-color; padding: 24rpx; }
.pwd-form { background: #fff; border-radius: $radius-md; padding: 24rpx;
    &__item { margin-bottom: 28rpx;
        .label { display: block; font-size: 26rpx; color: #666; margin-bottom: 12rpx; }
        .input { height: 80rpx; background: $bg-color; border-radius: $radius-md; padding: 0 24rpx; font-size: 28rpx; }
    }
}
.pwd-submit { background: $brand-color; color: #fff; border-radius: $radius-md; font-size: 30rpx; }
</style>
