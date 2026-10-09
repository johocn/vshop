// 运行配置：全部走环境变量，禁止硬编码域名
export const config = {
  // 'sso' = 线上 zhao-sso 统一认证；'mock' = 本地联调（手机号 → mock token）
  authMode: (import.meta.env.VITE_AUTH_MODE as 'sso' | 'mock') || 'mock',
  ssoLoginUrl: (import.meta.env.VITE_SSO_LOGIN_URL as string) || '',
  ssoAppCode: (import.meta.env.VITE_SSO_APP_CODE as string) || 'tcm-workbench',
  adminApiBase: (import.meta.env.VITE_ADMIN_API_BASE as string) || '/admin-api',
}
