import { config } from '../config'
import { clearSession, getVendureToken, setVendureToken } from '../utils/storage'
import { t } from '../utils/i18n'

export class GqlError extends Error {
  constructor(public errorCode: string, message: string) { super(message) }
}

export async function gqlFetch<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getVendureToken()
  if (token) headers.authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(config.adminApiBase, { method: 'POST', headers, body: JSON.stringify({ query, variables }) })
  } catch (e) {
    throw new GqlError('NETWORK_ERROR', t('common.networkError'))
  }
  // 认证类请求会经 vendure-auth-token 响应头下发会话 token
  const newToken = res.headers.get('vendure-auth-token')
  if (newToken) setVendureToken(newToken)
  if (res.status === 401) {
    clearSession()
    throw new GqlError('UNAUTHORIZED', t('common.sessionExpired'))
  }
  const json = await res.json()
  if (json.errors?.length) throw new GqlError('GRAPHQL_ERROR', json.errors[0].message)
  return json.data as T
}
