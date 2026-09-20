<template>
  <view class="chg">
    <view class="brand">
      <view class="dot" />
      <text class="t1">{{ isManual ? $t('changePassword.titleManual') : $t('changePassword.titleSet') }}</text>
      <text class="t2">{{ isManual ? $t('changePassword.subManual') : $t('changePassword.subSet') }}</text>
    </view>
    <view class="card">
      <input v-if="isManual" v-model="oldPw" class="field" :password="!showPwd" :placeholder="$t('changePassword.phOld')" />
      <input v-model="pw1" class="field" :password="!showPwd" :placeholder="$t('changePassword.phNew')" />
      <input v-model="pw2" class="field" :password="!showPwd" :placeholder="$t('changePassword.phConfirm')" @confirm="submit" />
      <view class="opt"><text @tap="showPwd = !showPwd">{{ showPwd ? $t('changePassword.hide') : $t('changePassword.show') }}</text></view>
      <button class="btn" :disabled="loading" @tap="submit">{{ loading ? $t('changePassword.submitting') : (isManual ? $t('changePassword.submitManual') : $t('changePassword.submitSet')) }}</button>
      <view v-if="err" class="err">{{ err }}</view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { changeMyPassword } from '../../apis/auth';
import { useLocaleStore } from '../../stores/localeStore';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

const auth = useAuthStore();
const tenant = useTenantStore();
const locale = useLocaleStore();
const isManual = ref(false);
const oldPw = ref('');
const pw1 = ref('');
const pw2 = ref('');
const showPwd = ref(false);
const loading = ref(false);
const err = ref('');

onLoad((q) => {
  isManual.value = q?.manual === '1';
});

async function submit() {
  err.value = '';
  if (isManual.value && !oldPw.value) {
    err.value = locale.t('changePassword.errOldRequired');
    return;
  }
  if (!pw1.value || pw1.value.length < 8) {
    err.value = locale.t('changePassword.errShort');
    return;
  }
  if (pw1.value !== pw2.value) {
    err.value = locale.t('changePassword.errMismatch');
    return;
  }
  loading.value = true;
  try {
    await changeMyPassword(pw1.value, isManual.value ? oldPw.value : undefined);
    await auth.loadAccess(); // 刷新 mustChangePassword 标志
    if (isManual.value) {
      uni.navigateBack();
      uni.showToast({ title: locale.t('changePassword.changedToast'), icon: 'none' });
    } else if (tenant.token) {
      uni.redirectTo({ url: '/pages/dashboard/index' });
    } else {
      uni.redirectTo({ url: '/pages/channel-select/index' });
    }
  } catch (e: any) {
    err.value = e?.response?.errors?.[0]?.message || locale.t('changePassword.errChangeFailed');
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.chg { min-height: 100vh; background: $wa-bg; padding: 120rpx 48rpx; box-sizing: border-box; }
.brand { display: flex; flex-direction: column; align-items: center; margin-bottom: 80rpx;
  .dot { width: 72rpx; height: 72rpx; border-radius: 18rpx; background: $wa-accent; margin-bottom: 24rpx; }
  .t1 { font-size: 44rpx; font-weight: 700; color: $wa-ink; }
  .t2 { font-size: 24rpx; color: $wa-muted; margin-top: 8rpx; text-align: center; }
}
.card { background: $wa-card; border-radius: 24rpx; padding: 40rpx 32rpx; box-shadow: 0 8rpx 30rpx rgba(0,0,0,.06);
  .field { height: 92rpx; border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 0 24rpx; margin-bottom: 24rpx; font-size: 30rpx; }
  .opt { text-align: right; font-size: 24rpx; color: $wa-muted; padding-bottom: 16rpx; }
  .btn { height: 92rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; font-size: 32rpx; font-weight: 600; margin-top: 8rpx; }
  .btn[disabled] { opacity: .6; }
  .err { color: $wa-danger; font-size: 26rpx; margin-top: 16rpx; text-align: center; }
}
</style>