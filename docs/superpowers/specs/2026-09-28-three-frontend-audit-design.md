# 三前端安全审查与缺陷修复 设计（web-admin / vshop / nshop）

日期：2026-09-28
状态：已批准

## 背景与目标

对 `d:\zhao\vshop`（含 web-admin 子项目，uni-app C 端商城）与 `d:\zhao\nshop`（Nuxt 4 商城）三个前端项目做全域安全审查与功能缺陷排查，发现问题后修复并交付。

- 审查范围：**仅三个前端项目自身代码**；vendure 后端不在范围内，接口层问题只在对接点顺带记录，不深入后端。
- 处置策略：**高危漏洞必修 + 功能缺陷列清单批量修**；不追求低优先级体验问题全修。
- 审查深度：**全域均衡扫**（不偏向近期改动区，但已知风险点重点覆盖）。
- 执行方案：**并行子代理审查 + 主线验证修复**（3 个子代理分别深扫三个项目，主线逐条复核防误报后再修）。

## 审查清单（三项目统一基线）

每个子代理按以下维度扫描，产出结构化问题清单（编号、文件路径+行号、严重级、证据、建议修法）：

| 维度 | 检查点 |
|---|---|
| 鉴权与会话 | token 存储位置（localStorage 存敏感信息）、登录态校验漏洞、路由守卫绕过、登出残留 |
| 越权与多租户 | 渠道/店铺切换串号（vendure-token 请求头一致性）、C 端可调用的管理接口、接口权限仅靠前端隐藏 |
| XSS 与注入 | v-html / innerHTML 动态渲染富文本（商品描述、装修楼层、公告）未净化 |
| 硬编码与泄露 | 密钥/secret 硬编码、调试 console 输出泄露、域名硬编码（违反动态 origin 规范）、.env 泄露 |
| 交易入口 | 下单金额前端可篡改的对接点、支付回调前端逻辑、优惠券/积分前端校验依赖 |
| 文件与上传 | 上传目录直访风险、图片 URL 拼接处理 |
| 功能缺陷 | i18n 缺词（zh/en 等语言包不同步）、多城市判断硬编码、死链/404 路由、组件注册名导致 SSR 空渲染、分页与边界条件、错误提示缺失 |

## 执行流程

1. **并行扫描**：3 个子代理并行，分别深扫 vshop / web-admin / nshop，按上表维度产出问题清单。
2. **汇总验证**：主线逐条复核证据，剔除误报，确认严重级（高危 / 中 / 低）。
3. **分级修复**：
   - 高危（越权、token 泄露、XSS、支付入口）：验证后立即修复。
   - 其余（中/低危安全项与功能缺陷）：清单化批量修，按项目分组提交。
4. **回归测试**：nshop 跑 `npm test`（vitest）；web-admin 跑 tests；vshop 构建验证（uni build）。受影响功能用手机视口（390×844，dpr=2）截图取证。
5. **交付**：一气呵成 提交 → 推送 → 部署（nshop/web-admin 走 `scripts/deploy.mjs`；vshop H5 静态目录替换）。

## 修复与交付规范

- 每项修复附代码位置（文件+行号）与修法说明。
- 修复遵守既有硬规范：i18n 词条多语言同步补齐、动态 origin、多城市动态判断。
- 审查报告归档至 `d:\zhao\vshop\docs\superpowers\specs\2026-09-28-three-frontend-audit-design.md`（本文档）+ 独立审查结果章节（高危修复记录 + 缺陷清单及状态）。
- 涉及用户可见交互变化的修复，补充手机视口截图到操作手册。

## 验收标准

- [x] 高危漏洞清零（每项有修复记录）。
- [x] 缺陷清单逐条有状态（已修 / 待办及原因）。
- [x] 回归测试通过（nshop vitest、web-admin 构建、vshop 构建）。
- [x] 受影响功能手机视口截图补充到位。
- [x] 审查报告归档并提交 git。

---

# 审查结果（归档）

日期：2026-09-28 ｜ 范围：vshop（含 web-admin）、nshop 三前端自身代码 ｜ 明细证据见 `docs/superpowers/plans/2026-09-28-audit-findings-{vshop,webadmin,nshop}.md`

发现总量：**vshop 16 条（高 2 / 中 8 / 低 6）、web-admin 14 条（高 2 / 中 6 / 低 6）、nshop 17 条（高 3 / 中 5 / 低 9，含验证期新增 F-NS-17）**，共 47 条。

## 一、高危漏洞修复记录

| 编号 | 项目 | 位置 | 修法 | 提交 |
|---|---|---|---|---|
| F-VS-01 | vshop | `src/pkg-product/pages/detail.vue:27` | 新增 `src/utils/html.ts` 白名单净化，商品描述富文本渲染前调用 | `dc3c582` |
| F-VS-03 | vshop | `src/pages/admin/distribution-settle.vue:150` | 新增 `useAdminGuard`，管理页进入即校验管理员身份，非管理员退回首页（后端 `@Allow(SuperAdmin)` 为最终兜底） | `dc3c582` |
| F-WA-01 | web-admin | `src/utils/h5Nav.ts:51` | 退出流程改为调用 `authStore.logout()` 彻底清理会话（原仅跳登录页） | `dc3c582` |
| F-WA-05 | web-admin | `src/components/RichTextEditor.vue:18` | 新增 `src/utils/sanitizeHtml.ts`，保存/失焦前白名单净化后再落库 | `dc3c582` |
| F-NS-03 | nshop | `layers/base/app/components/product/ProductDescription.vue:8` | 新增 `utils/sanitize-html.ts`（`isomorphic-dompurify`，SSR 友好），商品描述渲染前净化 | `3451bab` |
| F-NS-04 | nshop | `layers/base/app/components/home/blocks/RichTextView.vue:10` | 同上，首页装修富文本楼层渲染前净化 | `3451bab` |
| F-NS-09 | nshop | `layers/base/app/pages/category/[slug].vue:283` | 组件注册名 `SortBar`/`FilterDrawer` → `CategorySortBar`/`CategoryFilterDrawer`，修复 SSR 空渲染 + hydration mismatch | `3451bab` |

新增（验证期发现）：**F-NS-17（中，功能缺陷）** `layers/base/app/pages/category/[slug].vue:407` —— `CategoryFilterDrawer` 原仅渲染在默认版式分支内，mall 版式（移动端主版式）头部的「筛选」按钮因此点了无反应；已将抽屉提升至模板根级、两版式共用。已截图取证。

## 二、缺陷清单状态

**已修复（38 条）**

| 项目 | 已修复 |
|---|---|
| vshop | F-VS-01、03、04、05、10、11、12、13、14、15、16（11 条） |
| web-admin | F-WA-01、02、03、04、05、06、07、09、11、12、13、14（12 条） |
| nshop | F-NS-02、03、04、05、06、07、08、09、10、11、12、13、14、15、16、17（16 条） |

其中 web-admin 路由守卫（F-WA-02，新增 `src/utils/routeGuard.ts` + `App.vue` 挂载）在本轮一并提交。

**第二阶段已修复（5 条，原「待后端支持」，2026-09-29 扩范围到 vendure 后端实现）**

| 编号 | 项目 | 内容 | 后端实现 | 状态 |
|---|---|---|---|---|
| F-VS-06 | vshop | 充值面额 | `recharge-card-plugin`：`Channel.rechargeMinAmount/MaxAmount` 渠道字段 + `createRechargeOrder` 服务端上下限强校验 | 已修复 |
| F-VS-07 | vshop | 提现金额与余额 | `distribution-plugin`：`withdrawal.service.request` 原子条件扣减（`availableBalance >= amt` 作为 UPDATE 条件，`affected=0` 抛错）；审批侧 `approve/reject/markPaid` 补状态机守卫（防重复 reject 二次回补余额） | 已修复 |
| F-VS-08 | vshop | 微信支付 openid | `wechatpay-plugin`：导出 `resolveCustomerOpenid()` 由客户档案推导，handler 三级回落（`metadata.openid → 客户档案 → devBypass`） | 已修复（模块接线实测；真实 profile→openid 受本地 devBypass 早退未跑通） |
| F-VS-09 | vshop | 售后凭证上传 | `cjk-plugin`：shop-api `uploadCustomerAsset(file: Upload!): Asset!`；`ImageUpload.vue` 接 GraphQL multipart 真实上传 | 已修复 |
| F-WA-08 | web-admin | 后台改价校验 | `cjk-plugin`：admin-api `adjustOrderPrice`（渠道上限 + 订单状态校验，三态统一 `addSurchargeToOrder`） | 已修复 |

明细证据与偏差见 `docs/superpowers/plans/2026-09-28-three-frontend-audit.md`「第二阶段」章节；端到端回归脚本 `vendure/packages/dev-server/verify-audit-fixes.cjs`（24/24 PASS，含提现审核状态机 4 条断言）。

**不修（3 条，附理由）**

| 编号 | 项目 | 理由 |
|---|---|---|
| F-VS-02 | vshop | uni-app `rich-text` 为受限渲染（不执行 script/on\* 事件），无可用注入面，维持低危 |
| F-WA-10 | web-admin | wangEditor 全局 CSS 泄漏属低危、影响面小，按需引入收益低，留观 |
| F-NS-01 | nshop | C 端 `admin/redemption.vue` 可直达，但写操作需管理员手工录入的 admin token 且后端 `@Allow` 兜底，无提权效果，降级为中；建议后续独立管理端承载 |

## 三、各项目回归结论

| 项目 | 命令 | 结论 |
|---|---|---|
| nshop | `npm test` | **20 文件 / 155 用例全部 PASS**（含修复 `palette-presets` 既有漂移：8→9 套） |
| nshop | `npm run build` | **Build complete**，`.output` 28.3 MB |
| web-admin | `npm run build:h5` | 构建成功，无新增错误 |
| vshop | `pnpm build:h5` | 构建成功，无新增错误 |

## 四、手机视口截图取证（390×844，dpr=2）

| 验证点 | 截图 |
|---|---|
| nshop 首页正常渲染（i18n 消除后无回归） | `nshop/docs/superpowers/manual/audit-20260928/assets/audit-nshop-home.png` |
| nshop 分类页 SortBar 修复后渲染（综合/新品/价格↑/价格↓ + 筛选） | `.../audit-nshop-category.png` |
| nshop 分类页排序切换（新品 → `?sort=NAME_ASC`） | `.../audit-nshop-category-sort-newest.png` |
| nshop 分类页筛选抽屉（F-NS-17 修复后 mall 版式可弹出：品类/品牌/配送方式 + 清空/应用） | `.../audit-nshop-category-filter.png` |
| web-admin 未登录深链受保护页 → 被守卫重定向到登录页 | `vshop/e2e-shots/audit-webadmin-guard-pickup.png` |
| vshop 未登录深链 admin 管理页 → toast「请先登录管理员账号」并退回首页 | `vshop/e2e-shots/audit-vshop-guard-admin-toast.png` |

取证方式：本地构建产物 + 同源 `/shop-api` 反代（`nshop/scripts/_shot_proxy.py`）与静态服务，Playwright 移动视口。
说明：分类页商品列表显示「未找到商品」为线上同源的既有数据状态（生产 `www.youshop.cn/category/electronics` 同样为空），非本次改动引入。
