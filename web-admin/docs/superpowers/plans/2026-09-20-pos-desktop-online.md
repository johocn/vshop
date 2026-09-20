# POS 上线 · Plan 2：桌面 POS 迁上线 + 复用 web-admin 登录/渠道/商品 - 实施计划

> 依据设计：`specs/2026-09-20-pos-desktop-online-design.md`

- [ ] Task 1：`d:\zhao\vcash\web` 增加生产构建配置：admin-api 指向共享后端 `/admin-api`（与 web-admin 同域同 origin）；`pnpm build` 出静态产物。
- [ ] Task 2：登录复用：POS 启动 `onLaunch` 读共享 localStorage `wa_auth_token`/`wa_channel_token`（KEY：`wa_auth_token`/`wa_channel_token`，见 web-admin `apis/session.ts`）；有 token 免登录，无则引导回 web-admin 登录页；移除/弱化 POS 自带 Login/Setup 独立登录流程。
- [ ] Task 3：请求层对齐：POS graphql client 统一带 `Authorization: Bearer <wa_auth_token>` + `vendure-token: <wa_channel_token>` 头。
- [ ] Task 4：商品数据源：POS 商品检索/详情改为直连共享 catalog（graphql），不建离线商品快照。
- [ ] Task 5：渠道联动：验证切店（vendure-token 变化）后 POS 商品/会员价/报表随 activeChannel 切换。
- [ ] Task 6：将 POS 静态产物随 web-admin 一并部署（同域路径），本地构建后 scp 产物，服务器只解压/拷入，`pm2 restart`，不在服务器构建。
- [ ] Task 7：桌面视口（电脑版）截图各主界面（Cashier/Checkout/Shift/Refund/Promotion/Report）补操作手册；git add + commit（POS web 仓库）。