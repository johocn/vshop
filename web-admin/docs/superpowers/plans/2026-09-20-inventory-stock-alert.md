# 库存预警增强 - 实施计划

> 依据设计：`specs/2026-09-20-inventory-stock-alert-design.md`

- [ ] Task 1：定位"库存预警/库存"实际页面（Glob inventory 下 stock/index 或 stockWarning 路由），确认数据结构与 apis（onHand/阈值/purchase 创建接口）。
- [ ] Task 2：顶部筛选（仓库 seg + 阈值），列表行加 状态徽/缺货量/推荐补货量。
- [ ] Task 3：批量勾选 → 「生成采购入库单」→ 调 purchase 创建接口，成功后 toast 并跳转。
- [ ] Task 4：i18n 抽离（`inventoryStock.*` 或新 `inventoryAlert.*` 追加），zh-Hans/en.json 同步。
- [ ] Task 5：`pnpm build:h5` 通过 + 手机视口截图（空数据 mock 兜底预览）写入手册对应 op 小节。
- [ ] Task 6：git commit。