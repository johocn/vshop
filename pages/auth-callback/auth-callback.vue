<template>
  <view class="auth-callback">
    <view class="loading-container">
      <view class="loading-spinner"></view>
      <text class="loading-text">{{ statusText }}</text>
      <text v-if="errorText" class="error-text">{{ errorText }}</text>
      <view v-if="errorText" class="btn-primary retry-btn" @tap="retry">{{ t('common.confirm') }}</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { loginWithSsoToken } from '../../services/auth'
import { clearSession } from '../../utils/storage'
import { t } from '../../utils/i18n'

const statusText = ref(t('auth.loggingIn'))
const errorText = ref('')

onMounted(() => {
  // #ifdef H5
  handleSsoCallback()
  // #endif
})

async function handleSsoCallback() {
  const urlParams = new URLSearchParams(window.location.search)
  const hashQuery = window.location.hash.split('?')[1] || ''
  const hashParams = new URLSearchParams(hashQuery)
  const error = urlParams.get('error') || hashParams.get('error')
  const token = urlParams.get('token') || hashParams.get('token')
  if (error) {
    errorText.value = `${t('auth.loginFailed')}: ${decodeURIComponent(error)}`
    return
  }
  if (!token) {
    errorText.value = t('auth.tokenInvalid')
    return
  }
  try {
    await loginWithSsoToken(token)
    uni.reLaunch({ url: '/pages/home/index' })
  } catch (e) {
    clearSession()
    errorText.value = mapAuthError(e)
  }
}

function mapAuthError(e) {
  if (e.authCode === 'NOT_LINKED') return t('auth.notLinked')
  if (e.authCode === 'NOT_STAFF') return t('auth.notStaff')
  if (e.authCode === 'TOKEN_INVALID') return t('auth.tokenInvalid')
  if (e.authCode === 'NETWORK') return t('common.networkError')
  return t('auth.loginFailed')
}

function retry() {
  clearSession()
  uni.reLaunch({ url: '/pages/home/index' })
}
</script>

<style scoped>
.auth-callback { display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f6f7f6; }
.loading-container { display: flex; flex-direction: column; align-items: center; gap: 20rpx; padding: 0 60rpx; }
.loading-spinner { width: 60rpx; height: 60rpx; border: 4rpx solid #e0e0e0; border-top-color: #2f7d5f; border-radius: 50%; animation: spin 0.8s linear infinite; }
.loading-text { font-size: 30rpx; color: #666; }
.error-text { font-size: 28rpx; color: #c0504d; text-align: center; }
.retry-btn { width: 320rpx; margin-top: 20rpx; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
