# POS 上线 · Plan 1：POS 后端并入线上 Vendure - 设计

**目标仓库**：`d:\zhao\vendure`（youshop/web-admin 共享的 Vendure monorepo fork）
**背景**：vcash 是独立的本地 POS（`d:\zhao\vcash`），后端插件 `@vcash/pos-plugin`、`@vcash/offline-plugin` 现挂在 vcash 自建的 `server/vendure-config.ts` + 独立 DB。本次把 POS 后端并入 web-admin 所依赖的线上 Vendure 实例，实现「同库、同认证、同渠道、同商品」。

**需求**
1. 将 `@vcash/pos-plugin`、`@vcash/offline-plugin` 两个包源码拷入 `d:\zhao\vendure\packages\` 成为 workspace 包（根 workspaces 已是 `packages/*`，自动纳入）。
2. package.json 对齐 monorepo 规范：name 改为 `@vendure/vcash-pos-plugin` / `@vendure/vcash-offline-plugin`（或保留 `@vcash/*` 并按 `packages/*` 解析），`peerDependencies` 声明 `@vendure/core`、`@vendure/common`、`typeorm`；补齐 build/dev 脚本。
3. 确认插件类导出：现 `vcash-pos-plugin#index.ts` 仅导出 `pos-order.service`、`pos-session.service`，作为 `@vcash/pos-plugin` 被 `server/vendure-config.ts` 以 `VcashPosPlugin` 导入说明其插件类在 barrel/子路径有另一导出。并入时须厘清并统一：主入口必须导出 `VcashPosPlugin`、`VcashOfflinePlugin` 插件类（或按子路径导入），供 dev-config 注册。
4. 在 `packages/dev-server/dev-config.ts` 的 `plugins` 数组（现有 `MemberLevelPlugin`、`InventoryPlugin` 等已注册处）追加注册 `VcashPosPlugin`（`VcashOfflinePlugin` 视其功能决定是否注册，见错误处理）。
5. DB 复用共享 postgres：不新增独立连接，沿用 `getDbConfig()`（生产 postgres）；新插件实体表（`pos_terminal`/`pos_session`/`member_price_rule`/`promotion_rule` 等）随 `synchronize:true` 开机自动建表，无需手写 migration。
6. `member-level-plugin` 已在线上 dev-config 注册，POS 会员价依赖满足；`cjk-plugin` 亦已在，无需重复引入。

**架构**：插件以 workspace 包形式并入线上 monorepo → dev-server 启动时随整个后端一起 bootstrap，POS 的 admin GraphQL（PosTerminal/PosSession/MemberPriceRule/PromotionRule/Report 等）+ entities + services 与 web-admin 后台共享同一 admin-api / 同一 DB / 同一渠道语义。

**数据流/作用域**：POS 报表、关班等 service 若按 activeChannel 取数，则天然随 web-admin 当前渠道（vendure-token 头语义）工作；如需按店（terminal/channel）区分，沿用 vcash 既有 terminal→channel 归集逻辑，不新建表。

**错误处理**：
- 拷贝后若不满足 monorepo 构建（tsconfig/rootDir/路径别名），以 member-level-plugin 为模板对齐 tsconfig 与 package.json。
- `VcashOfflinePlugin` 若强依赖本地文件/自建 DB 快照与「商品缓存」无关，但按用户约束「功能不变」，保留其注册；若其依赖独立本地存储冲突，则先降级为不注册并在验收清单标注。

**测试**：`pnpm build`（或 dev-server 单包构建）通过；admin GraphQL playground 可见 POS mutations/resolvers；登录在线 admin-api 后能查到 POS 相关报错无 schema 冲突；确认 postgres 已自动建出新插件表。

**约束**：不新增第二个 Vendure 进程；不切换 DB；生产用 git pull + pm2 restart，不在服务器构建。