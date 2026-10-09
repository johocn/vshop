import { gqlFetch, GqlError } from './gql'
import { api } from './api'
import { clearSsoRedirectAttempts } from '../utils/sso-guard'
import { setSsoToken, setStaff } from '../utils/storage'

export type AuthFailureCode = 'NOT_LINKED' | 'NOT_STAFF' | 'TOKEN_INVALID' | 'NETWORK' | 'UNKNOWN'

const M_AUTH = `mutation($t: String!) {
  authenticate(input: { tcmSso: { accessToken: $t } }) {
    __typename
    ... on CurrentUser { id identifier }
    ... on ErrorResult { errorCode message }
  }
}`

/** 用 zhao-sso accessToken（或 mock token）换取 Admin API 会话；成功后预取员工身份 */
export async function loginWithSsoToken(accessToken: string): Promise<void> {
  setSsoToken(accessToken)
  let res: any
  try {
    res = await gqlFetch(M_AUTH, { t: accessToken })
  } catch (e: any) {
    if (e instanceof GqlError && e.errorCode === 'NETWORK_ERROR') { e.authCode = 'NETWORK'; throw e }
    throw e
  }
  const auth = res.authenticate
  if (auth.__typename !== 'CurrentUser') {
    const msg = String(auth.message || '')
    const err: any = new Error(msg || 'auth failed')
    if (msg.includes('SSO_ACCOUNT_NOT_LINKED')) err.authCode = 'NOT_LINKED'
    else if (msg.includes('SSO_ACCOUNT_NOT_STAFF')) err.authCode = 'NOT_STAFF'
    else if (msg.includes('SSO_')) err.authCode = 'TOKEN_INVALID'
    else err.authCode = 'UNKNOWN'
    throw err
  }
  clearSsoRedirectAttempts()
  // 预取员工身份（首页也要用；无身份不阻断）
  try {
    const staff = await api.myStaff()
    setStaff(staff)
  } catch (e) { /* 忽略 */ }
}
