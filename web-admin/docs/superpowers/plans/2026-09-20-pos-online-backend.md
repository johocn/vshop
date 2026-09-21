# POS 上线 · Plan 1：后端并入线上 Vendure - 实施计划

> 依据设计：`specs/2026-09-20-pos-online-backend-design.md`

**状态**：Task 1-5 已完成并提交 `d:\zhao\vendure` commit `e15361524`（插件入仓 @vendure/vcash-pos-plugin / vcash-offline-plugin、对齐 monorepo、dev-config 注册、tsc 编译 lib）。**待办收尾**：

- [x] Task 1：`vcash-pos-plugin`、`vcash-offline-plugin` 拷贝入 `d:\zhao\vendure\packages\`（改名 @vendure/vcash-*）。
- [x] Task 2：对齐 monorepo 包规范（package.json / tsconfig / peerDeps / build 脚本）。
- [x] Task 3：确认 barrel 导出 `VcashPosPlugin`/`VcashOfflinePlugin`；offline-plugin 内 import 已改 `@vendure/vcash-pos-plugin`。
- [x] Task 4：`dev-config.ts` 的 `plugins` 注册 `VcashPosPlugin`+`VcashOfflinePlugin`（MemberLevelPlugin.init() 后）。
- [x] Task 5：根 `node_modules/.bin/tsc` 本地编译通过并产出 lib（已入库）。
- [ ] Task 6（进行中）：**重建生产 dist** `packages/dev-server/dist`——当前已入库 dist/dev-config.js 不包含 vcash（需重建使 VcashPosPlugin 注册编译进产物）；本地起 dev-server 连共享 postgres（synchronize）建表，admin GraphQL 出现 POS 类型。
- [x] Task 7：git add + commit 已完成（e15361524）。

> 注意：vendure 根 workspaces 在 package.json（pnpm v11 不认该字段），`device node_modules/@vendure/vcash-pos-plugin` 为手动 Junction 指向 packages/（未入库）；重建前若 node_modules 被清需重建 junction。
> 生产 dist = dashboard vite config-loader + tsc 产物（`node dist/index.js` 启动），部署 = git pull + pm2 restart，不服务器构建。