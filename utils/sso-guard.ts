const KEY = 'tcm_sso_redirect_attempts'

/** 30 秒窗口内最多跳 3 次，防 SSO 循环重定向 */
export function guardSsoRedirect(): boolean {
  const now = Date.now()
  const arr: number[] = uni.getStorageSync(KEY) || []
  const recent = arr.filter((ts: number) => now - ts < 30000)
  recent.push(now)
  uni.setStorageSync(KEY, recent)
  return recent.length <= 3
}

export function clearSsoRedirectAttempts() { uni.removeStorageSync(KEY) }
