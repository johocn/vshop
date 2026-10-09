<template>
    <view class="pwd-page">
        <view class="pwd-form">
            <view class="pwd-form__item">
                <text class="label">当前密码</text>
                <input v-model="current" class="input" type="password" placeholder="请输入当前密码" />
            </view>
            <view class="pwd-form__item">
                <text class="label">新密码</text>
                <input v-model="next" class="input" type="password" placeholder="至少 4 位新密码" />
            </view>
            <view class="pwd-form__item">
                <text class="label">确认新密码</text>
                <input v-model="confirm" class="input" type="password" placeholder="再次输入新密码" />
            </view>
            <button class="pwd-submit" :disabled="loading" @tap="submit">{{ loading ? '提交中…' : '确认修改' }}</button>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { updateCustomerPassword } from '../../api/mutations/auth';

const current = ref('');
const next = ref('');
const confirm = ref('');
const loading = ref(false);

async function submit() {
    if (!current.value || !next.value) {
        uni.showToast({ title: '请填写完整', icon: 'none' });
        return;
    }
    if (next.value.length < 4) {
        uni.showToast({ title: '新密码至少 4 位', icon: 'none' });
        return;
    }
    if (next.value !== confirm.value) {
        uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
        return;
    }
    loading.value = true;
    try {
        const res = await updateCustomerPassword(current.value, next.value);
        if (res.__typename === 'Success') {
            uni.showToast({ title: '修改成功', icon: 'success' });
            setTimeout(() => uni.navigateBack(), 800);
        } else {
            uni.showToast({ title: res.message || '修改失败', icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || '修改失败', icon: 'none' });
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
