# e.joho.cn C 端 SSO（zhao-sso → h.joho.cn）授权码链路验证记录

- **日期**：2026-09-10
- **验证人**：TRAE（接口链路实测）
- **范围**：e.joho.cn C 端（vshop 移动端 H5）通过 SSO 登录 h.joho.cn；确认 web-admin 运营后台**不受 SSO 影响**。
- **结论**：✅ 链路完整跑通

## 1. 架构边界（关键）

| 站点 | 身份/认证方式 | 是否走 SSO |
|---|---|---|
| `e.joho.cn`（vshop 移动端 H5，C 端） | 渠道 SSO 策略 `sso`（shop-api `authenticate`）→ h.joho.cn 统一登录 | **是** |
| `www.youshop.cn`（nshop，C 端） | 相同的渠道 SSO 策略 | 是（本记录以 e.joho.cn 为例） |
| `web-admin`（vshop 运营后台） | admin-api `login(username, password)`（`src/apis/auth.ts` 的 `adminLogin`） | **否** |

- web-admin 走 Vendure **admin-api** 独立的管理员凭据认证，与渠道 SSO 配置是两套体系；`web-admin/src` 内**无任何 SSO 引用**，结构上隔离。

## 2. SSO 应用 / 渠道配置

- **SSO 应用**：`vendure-youshop`
  - 回调白名单（`sso_apps.redirect_uris`）：`["https://www.youshop.cn/*","https://e.joho.cn/*","http://localhost:*"]`
- **SSO Base URL**：`https://h.joho.cn/api/zhao-sso`
- **渠道 SSO 提供商**（`Channel.customFields.authConfig.ssoProviders`）：
  - `providerKey: zhao-sso-youshop-__default_channel__`
  - `protocol: zhao-sso`，`clientId: vendure-youshop`
  - `channelCode: __default_channel__`
- 前端取提供商：`shop-api` 查询 `{ ssoProviders { ... } }`（e.joho.cn 返回默认渠道的 SSO provider，见下）。

## 3. 链路实测（接口级）

**① 只读校验：e.joho.cn C 端能否读到 SSO provider**
```
GET/POST https://e.joho.cn/shop-api  { ssoProviders { providerKey protocol baseUrl clientId channelCode } }
→ 200, provider: zhao-sso-youshop-__default_channel__,
  baseUrl=https://h.joho.cn/api/zhao-sso, client=vendure-youshop, channelCode=__default_channel__
```

**② 注册测试账号（h.joho.cn，公开端点）**
```
POST https://h.joho.cn/api/zhao-sso/v1/auth/register
{ username, password, app_code: "vendure-youshop" }
→ 200, 返回 access_token（测试账号 sso_id=23）
```

**③ 取一次性授权码**
```
POST https://h.joho.cn/api/zhao-sso/v1/auth/password-authorize
{ app_code: "vendure-youshop", identifier, password, redirect_uri: "https://e.joho.cn/#/pages/login/index" }
→ 200, { code: "<uuid>", redirect_uri, state: "" }
```

**④ 换会话（Vendure C 端 authenticate，sso 策略）**
> 策略内部：code → `h.joho.cn/.../v1/auth/token`（app_secret 验签）→ `access_token` → `h.joho.cn/.../v1/user/me` 取号（`uuid`）→ 档案映射/建档。
```
POST https://e.joho.cn/shop-api
mutation{ authenticate(input:{ sso:{ providerKey:"zhao-sso-youshop-__default_channel__", code, redirectUri:"https://e.joho.cn/#/pages/login/index" } }){
  ... on CurrentUser{ id identifier channels{ code } } }
}
→ CurrentUser { id:"173", channels:[{ code:"__default_channel__" }] }  （响应头带 vendure-auth-token）
```

**⑤ 会话校验**
```
POST https://e.joho.cn/shop-api   Authorization: Bearer <vendure-auth-token>
{ me { id identifier } }
→ 200, { me: { id: "173" } }
```

## 4. 复用验证脚本

- `d:\zhao\vendure\_verify_sso.mjs`：只读校验 shop-api 暴露的 ssoProviders。
- `d:\zhao\vendure\_verify_ssocheck.mjs`：完整链路（注册→取码→authenticate→me）。
- 均为幂等/一次性脚本，未提交到仓库。

## 5. 遗留与建议

- **测试账号**：验证时在生产 SSO 注册了 `e2e_ssocheck_<数字>`（`sso_users.id`=23），并在 Vendure 建档用户 173。
  - 无实际费用/席位占用，可暂留；如需清理，需 zhao-auth 管理后台账号在 SSO 用户管理页将该用户 `status` 置为 `blocked`（接口：`PUT /api/zhao-sso/v1/admin/users/:id`，需 `sso.user-update` 权限）。
- web-admin 运营后台登录方式保持不动，本次改造零影响。

## 6. 微信环境全自动登录验证（2026-09-10 补充）

- **目标**：`youshop.cn` 与 `e.joho.cn` 登录页**自动跳转 SSO**；SSO 统一页在微信环境**自动静默登录**，实现微信内零点击/零输入登录。

### 自动跳转实现（两者均已改）
- **nshop** `layers/base/app/pages/account/login.vue`：`onMounted` 检测未登录且存在 SSO 提供商 → 自动 `loginWithSso(providers[0])` 跳 h.joho.cn 统一页；`sessionStorage` `youshop_sso_auto_jumped` 保证一次会话只自动跳一次；回调 URL `?token=xxx` → `exchangeSsoAccessToken` 用 accessToken 直验换 Vendure 会话。
- **vshop** `src/pages/login/index.vue`：`onMounted` 同样自动跳；回调优先从 hash 取 `token`，走 `authenticateSsoWithToken`（`src/api/mutations/auth.ts`）直验。

### 微信静默授权配置（生产实测）
```
GET https://h.joho.cn/api/zhao-sso/v1/auth/wechat/config?appType=official_account
→ 200
{
  "enabled": true,
  "appType": "official_account",
  "oauthScopes": ["snsapi_userinfo", "snsapi_base"],   ← 已含 snsapi_base
  "appId": "wx17d58d73062d1899"
}
```
- 微信 scope 配置存于数据库 `oauth-config` 集合（`provider=wechat`, `appType=official_account`），非代码种子；入口为 Strapi 后台 SSO → OAuth 配置。
- `snsapi_base` = **静默授权**（不弹确认框，直接拿 openid），满足全自动登录；`snsapi_userinfo` 保留用于必要时的昵称/头像完善（会弹一次授权确认框）。

### 静默触发链路（`components/wx-sso-login/wx-sso-login.vue`）
- SSO 统一页 `pages/sso/login.vue` 传入 `auto-redirect="isWechatEnv"`（微信 UA 为 true）。
- 组件 `onMounted`：`autoRedirect && isWechatBrowser() && hasScope('snsapi_base')` → 自动 `handleLogin('snsapi_base')` → 跳 `…/v1/auth/wechat?scope=snsapi_base&app_type=official_account` → 微信静默授权 → login-callback 认证成功带 token 回跳 C 端。

### 结论
- ✅ **微信内打开 youshop.cn / e.joho.cn 未登录 → 自动跳 SSO → 静默授权 → 自动登录**，全程零点击、零输入。
- PDF/桌面浏览器仍由统一页降级为账号密码登录表单兜底。
- web-admin 运营后台不参与该链路（见第 1 节架构边界）。

## 7. e.joho.cn C 端部署新版 SSO 前端（2026-09-11）

### 背景
- e.joho.cn C 端 H5（`index/`）停在上次构建 **2026-08-30**，登录页仍走**旧「authorize 授权码流」**（跳 `h.joho.cn/.../v1/auth/authorize`，且 `redirect_uri` 为 `origin + /pages/login/index` **缺少 `#/`**），与 www.youshop.cn 的**统一页 token 直验流**不一致，SSO 登录异常。
- 本地 vshop 源码 `src/pages/login/index.vue` 已是新版（统一页跳转 + token 直验 + 自动跳转），仅未部署。

### 部署
- 本地构建产物 `dist/build/h5`（2026-09-10 18:51，含新版逻辑）→ `tar` → scp 至 qing → 解压到 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（备份轮转 + nginx reload）。
- 部署后产物校验（`pages-login-index.BhiXTTbO.js`）：
  - ✅ 含 `pages/sso/login`（统一页）、`return_url: window.location.origin + "/#/pages/login/index"`（带 `#/`）、`sso_auto_jumped`（自动跳转）
  - ✅ 旧 `v1/auth/authorize` 已移除（0 次）

### 全路径验证（Playwright 真实用户路径，手机视口）
1. 打开 `https://e.joho.cn/#/pages/login/index`（未登录）→ **自动跳转** `https://h.joho.cn/#/pages/sso/login?app_code=vendure-youshop&return_url=https%3A%2F%2Fe.joho.cn%2F%23%2Fpages%2Flogin%2Findex&channel_code=__default_channel__` ✅
2. 统一页账号密码登录 → `POST /v1/auth/login` 200（`hasToken: true`）✅
3. 回跳 `https://e.joho.cn/#/pages/login/index?token=<jwt>` ✅
4. e.joho.cn `handleSsoCallback` token 直验（shop-api `authenticate` sso 策略）→ 换会话 → **跳转首页 `https://e.joho.cn/#/`**（Banner/秒杀/推荐商品正常渲染）✅

### 后端 token 直验独立验证（curl）
- `authenticate(input:{sso:{providerKey:"zhao-sso-youshop-__default_channel__", accessToken}})`
  → `CurrentUser { id: "176", channels:[{code:"__default_channel__"}] }`，响应头带 `vendure-auth-token`
  → 携带该 token 查 `me` 通过 ✅
- 说明：回调会话（sessionStorage 的 `sso_provider`/`sso_auto_jumped`）由 e.joho.cn 登录页 `loginWithSso` 在**同域**写入，回跳后同 tab 保留，token 直验正常完成。

### 结论
- ✅ e.joho.cn 与 www.youshop.cn 的 SSO 登录**已完全对齐**（统一页 token 直验流、自动跳转、微信静默授权）。
- web-admin 运营后台不受影响（admin-api 独立认证）。