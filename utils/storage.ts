const KEY_TOKEN = 'tcm_vendure_token'
const KEY_SSO = 'tcm_sso_token'
const KEY_STAFF = 'tcm_staff'
const KEY_LOCALE = 'tcm_locale'

export function getVendureToken(): string { return uni.getStorageSync(KEY_TOKEN) || '' }
export function setVendureToken(v: string) { uni.setStorageSync(KEY_TOKEN, v) }
export function getSsoToken(): string { return uni.getStorageSync(KEY_SSO) || '' }
export function setSsoToken(v: string) { uni.setStorageSync(KEY_SSO, v) }
export function getStaff(): any { try { return JSON.parse(uni.getStorageSync(KEY_STAFF) || 'null') } catch { return null } }
export function setStaff(v: any) { uni.setStorageSync(KEY_STAFF, JSON.stringify(v)) }
export function getLocale(): string { return uni.getStorageSync(KEY_LOCALE) || 'zh-CN' }
export function setLocale(l: string) { uni.setStorageSync(KEY_LOCALE, l) }
export function isLoggedIn(): boolean { return !!getVendureToken() }
export function clearSession() {
  uni.removeStorageSync(KEY_TOKEN)
  uni.removeStorageSync(KEY_SSO)
  uni.removeStorageSync(KEY_STAFF)
}
