# POS 电子小票 - 实施计划

> 依据设计：`specs/2026-09-20-pos-receipt-design.md`

- [ ] Task 1：在 `src/pages/pos/index.vue` 收款成功分支（`rr.ok && claimed`）构建 `buildReceipt()` 收据对象（门店/单号/金额/明细/时间）。
- [ ] Task 2：成功后在页面顶部呈现小票卡（modal/card），含「复制小票」「完成」两钮。
- [ ] Task 3：复制小票 = 纯文本拼装 → `uni.setClipboardData`，toast 成功/失败。
- [ ] Task 4：i18n（`pos` 域追加 小票/复制小票/完成/收款时间/实收 等键），zh-Hans/en.json 同步。
- [ ] Task 5：`pnpm build:h5` 通过 + 手机视口截图（mock 结果渲染小票卡）补手册 op-30。
- [ ] Task 6：git commit。