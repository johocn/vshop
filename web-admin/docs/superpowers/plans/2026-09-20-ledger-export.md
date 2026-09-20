# 收款台账导出增强 - 实施计划

> 依据设计：`specs/2026-09-20-ledger-export-design.md`

- [ ] Task 1：`settle/ledger/index.vue` 顶部加日期 seg（今日/近7/近30/全部），过滤 `filteredRows`。
- [ ] Task 2：按日分组标题下加「当日小计 N 笔 ¥xx」行（`computed` 分组）。
- [ ] Task 3：`onExport` 增强：按当前筛选范围导出明细 + 追加「按日汇总」段（复用 `downloadCsv`）。
- [ ] Task 4：i18n（`settleLedger` 追加 今日/近7/近30/当日小计/按日汇总 等键），zh-Hans/en.json 同步。
- [ ] Task 5：`pnpm build:h5` 通过 + 手机视口截图（近7天+当日小计）补手册台账小节。
- [ ] Task 6：git commit。