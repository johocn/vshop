<script>
import { config } from './config'
import { isLoggedIn } from './utils/storage'
import { guardSsoRedirect } from './utils/sso-guard'

function needAuthPage() {
  const hash = window.location.hash || ''
  if (hash.includes('pages/auth-callback') || hash.includes('pages/mock-login')) return false
  return true
}

function ensureLogin() {
  if (!needAuthPage() || isLoggedIn()) return
  if (config.authMode === 'sso' && config.ssoLoginUrl) {
    if (!guardSsoRedirect()) {
      uni.showModal({ title: '登录异常', content: 'SSO 跳转次数过多，请清除缓存重试', showCancel: false })
      return
    }
    const cb = window.location.origin + window.location.pathname + '#/pages/auth-callback/auth-callback'
    const params = new URLSearchParams({ app_code: config.ssoAppCode, return_url: cb, c_end_url: cb })
    const sep = config.ssoLoginUrl.includes('?') ? '&' : '?'
    window.location.href = `${config.ssoLoginUrl}${sep}${params.toString()}`
  } else {
    uni.reLaunch({ url: '/pages/mock-login/mock-login' })
  }
}

export default {
  onLaunch: function () {
    // #ifdef H5
    uni.addInterceptor('navigateTo', { invoke: ensureLogin })
    uni.addInterceptor('switchTab', { invoke: ensureLogin })
    ensureLogin()
    // #endif
  },
}
</script>

<style>
/* 全局公共样式：经 SFC @import 内联（static/ 目录在 H5 dev 下按静态资源直出，不能作为 JS module import） */
@import './static/common.css';
page { background-color: #f6f7f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; color: #303133; }
</style>
