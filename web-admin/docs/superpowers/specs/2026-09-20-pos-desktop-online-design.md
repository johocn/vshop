# POS 上线 · Plan 2：桌面 POS 迁上线 + 复用 web-admin 登录/渠道/商品 - 设计

**目标仓库**：`d:\zhao\vcash\web`（POS 桌面 Web SPA，Vue3+ElementPlus，8 views：Login/Setup/Cashier/Checkout/Shift/Refund/Promotion/Report）→ 迁为线上独立静态站点
**背景**：按用户约束「技术路径不变，还是电脑版」「不用考虑缓存商品问题」「登录等都用 web-admin 的」。

**需求**
1. **桌面技术不变**：POS 仍为 Vue3+ElementPlus 电脑版桌面布局，不改成 uni-app/rpx。
2. **登录复用 web-admin**：POS 部署到 web-admin 同域同 origin（同一套 youshop 域名下），启动时不再走自己的登录页，改读取共享 localStorage 的 `wa_auth_token`/`wa_channel_token`（`d:\zhao\vshop\web-admin\src\apis\session.ts` 的 KEY）。有 token 即视为已登录，无则提示回 web-admin 登录。
3. **渠道对齐**：POS 请求携带 web-admin 的 `vendure-token` channel 头与 `Authorization: Bearer` 头，服务端 `activeChannel` 即当前所选店铺；POS 的后台侧按当前渠道取商品/会员/报表。
   - 若 POS 经 web-admin 入口跳转仍拿不到 channel（用户未选店），入口处引导选店或回 channel-select。
4. **商品不缓存**：POS 商品检索/详情直接走共享 vendure catalog（graphql），不做离线商品快照层（用户明确不做缓存商品）。
5. **Admin API 地址**：POS 配置的 admin-api 指向与 web-admin 同一后端（`/admin-api`）。

**架构**：桌面 SPA 独立部署（静态站点），仅共享后端与登录态（同 origin localStorage）。

**数据流**：POS 启动 `onLaunch` → 读共享 token/channel → 直连共享 admin-api → 拉商品/建单/结账/交班/报表，数据落在共享 DB。

**错误处理**：
- 令牌共享依赖同 origin；若未来跨域部署则退回入口传参（不展开于本期）。
- localStorage 为空/过期 → 引导回 web-admin 登录页，POS 不做独立登录。
- channel 缺失 → 复用 web-admin 选店态；无则提示。

**测试**：桌面视口（电脑版）截图各主界面；验证用 web-admin 登录态直达 POS（免二次登录）、切店铺后 POS 商品/报表随之切换。