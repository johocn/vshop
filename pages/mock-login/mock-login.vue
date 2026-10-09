<template>
  <view class="mock-login">
    <view class="brand">中医馆 · 医生工作台</view>
    <view class="tip">{{ t('auth.mockTip') }}</view>
    <input class="input phone" type="number" :placeholder="t('auth.phonePlaceholder')" v-model="phone" />
    <view class="btn-primary enter" @tap="doLogin">{{ t('auth.enter') }}</view>
    <text v-if="errorText" class="error">{{ errorText }}</text>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { loginWithSsoToken } from '../../services/auth'
import { t } from '../../utils/i18n'

const phone = ref('')
const errorText = ref('')

async function doLogin() {
  if (!phone.value || phone.value.length < 11) return
  errorText.value = ''
  try {
    await loginWithSsoToken(`mock-${phone.value}`)
    uni.reLaunch({ url: '/pages/home/index' })
  } catch (e) {
    errorText.value = e.authCode === 'NOT_LINKED' ? t('auth.notLinked')
      : e.authCode === 'NOT_STAFF' ? t('auth.notStaff')
      : e.authCode === 'NETWORK' ? t('common.networkError')
      : t('auth.loginFailed')
  }
}
</script>

<style scoped>
.mock-login { min-height: 100vh; background: linear-gradient(160deg, #2f7d5f 0%, #245f49 100%); display: flex; flex-direction: column; align-items: center; padding-top: 220rpx; }
.brand { color: #fff; font-size: 40rpx; font-weight: 600; letter-spacing: 4rpx; }
.tip { color: rgba(255,255,255,0.75); font-size: 24rpx; margin: 24rpx 0 80rpx; }
.phone { width: 560rpx; background: #fff; }
.enter { width: 560rpx; margin-top: 36rpx; }
.error { color: #ffd7d7; font-size: 26rpx; margin-top: 24rpx; }
</style>
