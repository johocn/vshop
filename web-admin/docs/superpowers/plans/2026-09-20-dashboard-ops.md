# 经营数据看板增强 - 实施计划

> 依据设计：`specs/2026-09-20-dashboard-ops-design.md`

- [ ] Task 1：`data/dashboard/index.vue` 顶部加时间 seg（近7/近30），拉取当日聚合数据。
- [ ] Task 2：按日渲染销售趋势（纯 CSS/SVG mini 图，不引图表库）；TOP 商品补销量列。
- [ ] Task 3：新增「库存健康」卡：低库存/缺货/总SKU（用库存预警接口或相当字段，缺则 0）。
- [ ] Task 4：i18n（`dataDashboard` 追加 近7/近30/低库存/缺货/总SKU/销量 等键），zh-Hans/en.json 同步。
- [ ] Task 5：`pnpm build:h5` 通过 + 手机视口截图（近7天趋势+健康卡，数据缺失处 mock 兜底）补手册数据看板小节。
- [ ] Task 6：git commit。