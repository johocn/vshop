# 优惠券运营看板 - 实施计划

> 依据设计：`specs/2026-09-20-coupon-ops-design.md`

- [ ] Task 1：确认 `coupon/index.vue` 券列表数据结构与统计接口（issued/used/available 或由模板 total/claimed 推导）。
- [ ] Task 2：列表卡片加运营三读（已发放/已核销/可用）；顶部 KPI（发放总数/核销总数/可用）。
- [ ] Task 3：卡片「去发行」按钮 → `navigateTo('/pages/coupon/issue/index?templateId=..')`，发行页读取参数预填。
- [ ] Task 4：i18n（`couponList` 追加 已发放/已使用/剩余/去发行/发放总数 等键），zh-Hans/en.json 同步。
- [ ] Task 5：`pnpm build:h5` 通过 + 手机视口截图（券列表带三读+发行钮）补手册优惠券小节。
- [ ] Task 6：git commit。