# 已知边界批次 A Implementation Plan（#5 FAQ 分组动态化 / #6 反馈类型 key 治理 / #2 发帖订单收藏快捷选商品）

**Goal:** 消化 usemall 对齐遗留的 3 条已知边界：FAQ tab 从硬编码改动态、反馈 type 加枚举白名单+后台兜底、发布页关联商品增加「我的订单 / 我的收藏」快捷入口。单批交付 e2e + 手机截图 + 手册 + 两仓部署。

**Architecture:** #5 纯前端（faq.vue 从全量返回数据提取 distinct types 动态渲染 tab，语言包加 typeOrder 数组 + type_* 词条，tm() 取数组）；#6 后端 service 白名单校验（UserInputError）+ web-admin 徽标 fallback 原样显示 + 存量数据检查清洗；#2 纯前端（publish.vue 关联商品区加三入口 tab，复用 orders/myFavorites 查询与已选卡片态，仍透传 productId）。

**Tech Stack:** Vendure 3.x（vitest e2e + SqljsInitializer）、uni-app Vue3（vshop C端 + web-admin）。

**注意：**
- vendure 工作区有无关 WIP，提交只 add 本任务相关文件。
- PowerShell：不支持 `&&`（用 `;`）；多行 commit message 用 `[IO.File]::WriteAllText($path,$msg,[Text.UTF8Encoding]::new($false))`。
- 五语言（zh-CN/zh-TW/en/ja/ko）词条必须同步补齐，禁止单语言硬编码；数组型词条用 tm()。

---

### Task 1: #5 FAQ 分组动态化（纯前端）

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-user\pages\faq.vue`
- Modify: 五语言 `d:\zhao\vshop\src\i18n\locales\{zh-CN,zh-TW,en,ja,ko}.json`（faq 命名空间）

- [ ] Step 1: 语言包 faq 命名空间：新增 `typeOrder` 数组（`["register","order","pay","afterSale","account","general"]`）与 `type_register/type_order/type_pay/type_afterSale/type_account/type_general` 词条；删除旧 `tabRegister/tabOrder/tabPay/tabAfterSale/tabAccount`（保留 tabAll）。
- [ ] Step 2: faq.vue：onMounted 全量拉取（不传 type）后提取 distinct types → tabs = 「全部」+ 已知 type 按 typeOrder 固定序 + 未知 type 排后（显示名 `t('faq.type_'+key)`，词条缺失显示 key 原文）；typeOrder 用 `tm('faq.typeOrder')` 取数组；切 tab 逻辑不变（仍按 type 调后端）。

### Task 2: #6 反馈类型 key 治理（后端校验 + 后台兜底）

**Files:**
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\feedback.service.ts`（createFeedback）
- Modify: `d:\zhao\vendure\packages\feedback-plugin\e2e\feedback.e2e-spec.ts`（补非法 type 用例）
- Modify: `d:\zhao\vshop\web-admin\src\pages\feedback\list\index.vue`（徽标兜底）

- [ ] Step 1: service createFeedback：type 白名单 `['bug','experience','other']`，非法/超界抛 `UserInputError`。
- [ ] Step 2: web-admin list/index.vue：type 徽标改为 `typeName(type)` 函数渲染——`t('feedbackManage.type_'+type)` 结果等于 key 时回退显示 type 原文（未知 key 不报错不显示 t 路径）。
- [ ] Step 3: e2e 补用例：非法 type 提交报错；合法三值通过。
- [ ] Step 4: 存量检查：生产库 `SELECT type, COUNT(*) FROM feedback GROUP BY type`，如有中文/非法值 SQL 清洗回 key（收尾阶段执行）。

### Task 3: #2 发布页三入口快捷选商品（纯前端）

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-circle\pages\publish.vue`
- Modify: 五语言 `d:\zhao\vshop\src\i18n\locales\{zh-CN,zh-TW,en,ja,ko}.json`（circlePublish 命名空间）

- [ ] Step 1: publish.vue 关联商品区（未选中态）加来源 tab「搜索 / 我的订单 / 我的收藏」；搜索沿用现逻辑。
- [ ] Step 2: 订单入口：`getOrders({take:10})` → 遍历 lines 按 productId 去重，映射 ProductCandidate（preview=featuredAsset.preview、price=unitPriceWithTax）。
- [ ] Step 3: 收藏入口：`getMyFavorites({skip:0,take:10})` → 映射 ProductCandidate（preview=image、price=priceWithTax）。
- [ ] Step 4: 三入口选中后统一进现有已选卡片态（pickProduct），仍透传 productId；加各入口空态与加载失败 toast 词条（五语言）。

### Task 4: 收尾一气呵成

- [ ] Step 1: vendure `npx tsc --noEmit -p packages/feedback-plugin` + feedback e2e；vshop/web-admin 构建通过。
- [ ] Step 2: 手机截图（Playwright 390×844 dpr=2）：FAQ 动态 tab、发布页三入口、反馈提交（覆盖白名单）。
- [ ] Step 3: 手册 `web-admin/docs/superpowers/manual/usemall-parity-batch3/index.md` 补「六、已知边界批次 A」章节 + 截图。
- [ ] Step 4: 存量 type 检查清洗（生产库）。
- [ ] Step 5: 两仓提交推送 + 部署（vendure git pull + pm2 restart；vshop C 端 tar→scp 替换站点目录；web-admin deploy.mjs）+ curl 200 验证。
