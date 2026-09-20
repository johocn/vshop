# POS 上线 · Plan 1：后端并入线上 Vendure - 实施计划

> 依据设计：`specs/2026-09-20-pos-online-backend-design.md`

- [ ] Task 1：把 `d:\zhao\vcash\packages\vcash-pos-plugin`、`d:\zhao\vcash\packages\vcash-offline-plugin` 拷贝到 `d:\zhao\vendure\packages\`（改为 `vcash-pos-plugin`、`vcash-offline-plugin` 目录）。
- [ ] Task 2：对齐 monorepo 包规范：以 `packages/member-level-plugin` 为模板改 `package.json`（name、workspaces 自动纳入、`peerDependencies` 声明 `@vendure/core`/`@vendure/common`/`typeorm`、补 build/dev 脚本）；按根 tsconfig 对齐 `tsconfig.json`。
- [ ] Task 3：厘清插件类导出：确认 `@vcash/pos-plugin` 的 barrel 是否导出 `VcashPosPlugin`/`VcashOfflinePlugin`；若仅导服务，则在主入口或子路径补导出插件类，供 dev-config 导入。
- [ ] Task 4：在 `packages/dev-server/dev-config.ts` 的 `plugins` 数组（现已有 `MemberLevelPlugin` 等）追加注册 `VcashPosPlugin`（`VcashOfflinePlugin` 视其功能保留/降级，见设计错误处理）。
- [ ] Task 5：`pnpm build`（或 monorepo 相关包构建）通过；本地不再依赖 vcash 独立 server 的 vendure-config。
- [ ] Task 6：启动 dev-server 连共享 postgres，`synchronize:true` 建表；确认 admin GraphQL playground 出现 POS mutations/resolvers，且无 schema 冲突、postgres 自动建出 `pos_terminal`/`pos_session`/`member_price_rule`/`promotion_rule` 等表。
- [ ] Task 7：git add + commit 到 `d:\zhao\vendure` 仓库。