# POS 上线 · Plan 2：桌面 POS 整机迁入 web-admin（pos-app 独立 SPA） - 实施计划

> 依据设计：`specs/2026-09-20-pos-desktop-online-design.md`
> 定稿方向（2026-09-20 用户确认）：**vcash 保持独立不动**；把 vcash/web 桌面 POS 功能**整体迁入 web-admin 目录**作为独立子应用 `pos-app/`，可复用 web-admin 登录/渠道/商品/admin-api，功能不变，**彻底关闭离线商品缓存**。

- [ ] Task 1：复制 `d:\zhao\vcash\web` → `web-admin/pos-app/`（vcash 原位保留，仅 copy，互不影响）；为独立 SPA 自备 `package.json`/`vite.config`/依赖锁，与 web-admin uni-app 分开构建。
- [ ] Task 2：`vite.config.ts` 生产构建 `base: '/guanli/pos/'`；`admin-api` 用同源 `/admin-api`（动态 origin，禁硬编码域名），可加 `/assets` 同源反代。
- [ ] Task 3：登录复用 web-admin：`api/client.ts` 改读 `wa_auth_token`/`wa_channel_token`（KEY 见 web-admin `apis/session.ts`），无 token 引导回 web-admin 登录页；移除 POS 自带 Login/Setup 登录流程。
- [ ] Task 4：彻底关闭离线：删除/停用 offline 链路（`src/db/dexie.ts`、`stores/offline.ts`、`composables/useOfflineSync.ts`、`useIncrementalSync.ts`），商品/会员价/报表**直连共享 catalog**。
- [ ] Task 5：商品检索/详情/会员价/报表全部走 Apollo admin-api（直连共享后端）；图片等静态资源 URL 用动态 origin。
- [ ] Task 6：渠道联动：验证切换 channel（`wa_channel_token` 变化）后商品/会员价/报表随 activeChannel 切换。
- [ ] Task 7：`pnpm build` 出 `pos-app` 静态产物；桌面（电脑版）视口截图各主界面（Cashier/Checkout/AggregatePay/Shift/Refund/Promotion/Report）补操作手册；git add + commit。