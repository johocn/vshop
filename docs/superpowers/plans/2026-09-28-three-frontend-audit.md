# 三前端安全审查与缺陷修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 vshop（含 web-admin）与 nshop 三个前端项目全域安全审查，高危漏洞必修、功能缺陷清单批量修，回归后一气呵成提交·推送·部署。

**Architecture:** 3 个并行子代理分别深扫三个项目产出结构化发现文件 → 主线逐条验证防误报 → 分级修复（高危即修 / 其余批量修）→ 回归测试 + 手机视口截图 → 报告归档与交付。

**Tech Stack:** uni-app(Vue3) ×2（vshop / web-admin）、Nuxt 4（nshop）、Vendure shop-api/admin-api 对接层、vitest、Python e2e 脚本、Playwright（截图取证）。

**Spec:** `docs/superpowers/specs/2026-09-28-three-frontend-audit-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `docs/superpowers/plans/2026-09-28-audit-findings-vshop.md` | vshop 发现清单（子代理产出 + 主线验证状态列） |
| `docs/superpowers/plans/2026-09-28-audit-findings-webadmin.md` | web-admin 发现清单（同上） |
| `docs/superpowers/plans/2026-09-28-audit-findings-nshop.md` | nshop 发现清单（同上） |
| `docs/superpowers/specs/2026-09-28-three-frontend-audit-design.md` | 追加「审查结果」章节：高危修复记录 + 缺陷清单状态 |
| 三项目源码 | 按发现逐项修复 |

发现编号规则：`F-VS-xx`（vshop）/ `F-WA-xx`（web-admin）/ `F-NS-xx`（nshop）。

发现文件统一格式：

```md
# 审查发现 — <项目名>

| 编号 | 位置(文件:行号) | 级别(高/中/低) | 维度 | 证据(代码摘录) | 建议修法 | 验证状态(待验证/确认/误报/已修复) |
|---|---|---|---|---|---|---|
```

---

### Task 1: 三子代理并行扫描

**Files:**
- Create: `docs/superpowers/plans/2026-09-28-audit-findings-vshop.md`
- Create: `docs/superpowers/plans/2026-09-28-audit-findings-webadmin.md`
- Create: `docs/superpowers/plans/2026-09-28-audit-findings-nshop.md`

- [x] **Step 1.1: 在同一条消息中并行派发 3 个 general-purpose 子代理（只读扫描，禁止改代码）**

三个子代理共用下方「统一扫描清单」，各自的项目路径与侧重点如下：

- 子代理 A（vshop）：目录 `d:\zhao\vshop`，扫 `src/**/*.{vue,ts,js,json}` 与 `pages.json`、`manifest.json`、locale 文件。背景：uni-app C 端商城（H5+微信小程序），经 graphql-request 调 Vendure shop-api。
- 子代理 B（web-admin）：目录 `d:\zhao\vshop\web-admin`，扫 `src/**`、`scripts/*.mjs`、`_e2e/*.py`。背景：uni-app H5 多租户管理后台，含 wangEditor 富文本、扫码、盘库等管理能力。
- 子代理 C（nshop）：目录 `d:\zhao\nshop`，扫 `app/**`、`server/**`、`layers/**`、`types/**`、`messages/**`(i18n)。背景：Nuxt 4 SSR 商城（nuxtless 分支），对接 shop-api。

统一扫描清单（子代理 prompt 中逐条包含，产出发现按此归维度）：

1. **鉴权与会话**：grep `localStorage\.setItem|uni\.setStorageSync|sessionStorage\.setItem`，核对存入的 key 是否含 token/敏感信息；grep `beforeEach|requiresAuth|definePageMeta.*middleware|middleware` 核对路由守卫是否存在绕过路径（未登录可达的受保护页）。
2. **越权与多租户**：grep `vendure-token|vendure-channel-token|Authorization`，核对三个项目请求头命名是否一致（后端默认读 `vendure-token`，头名不一致即渠道串号）；C 端项目（vshop/nshop）grep `admin-api|/admin/`，发现 C 端调用管理接口即为发现；web-admin 核对切换租户后所有请求是否重写租户头/token。
3. **XSS 与注入**：grep `v-html|innerHTML|dangerouslySetInnerHTML`，逐处确认渲染来源：若是商品描述/装修楼层/公告等用户或后台可编辑富文本且未经净化即高危；纯本地常量可判低。
4. **硬编码与泄露**：grep `(?i)(secret|password|passwd|apikey|api_key|appsecret|accesskey)\s*[:=]\s*['"][^'"]{6,}`；grep `https?://[a-z0-9.-]+`（排除 localhost、环境配置文件、类型声明），域名硬编码违反动态 origin 规范；统计 `console\.(log|debug)` 残留（中/低）。
5. **交易入口**：定位下单/支付/优惠券/积分相关 mutation 调用点，检查是否存在**金额、折扣、单价由前端计算后随 mutation 提交**的写法（正确做法是后端按 variantId+quantity 计价）；支付回调/跳转页只核对前端逻辑（后端不在范围）。
6. **文件与上传**：grep `upload|uni\.uploadFile|FormData`，检查上传目标目录是否为 uploads 直访目录、文件名是否可预测。
7. **功能缺陷**：
   - i18n：对比各语言包 key 集合（vshop `locale/`、web-admin `locale/`、nshop `messages/` 或 `i18n/`），列出只存在于单一语言的 key；grep 模板中写死中文/英文文案（`>中文<` 或 `text: '中文'` 且未走 `$t`/`t()`）。
   - 多城市：grep 硬编码城市/地址/仓储判断（`city|城市|warehouse` 字面量比较）。
   - 死链：核对 `pages.json` / nuxt 页面路由与代码内 `navigateTo|uni\.navigateTo|<NuxtLink>` 目标是否都存在。
   - 组件注册名：nshop 检查 `components/` 目录前缀命名 vs 模板使用名（自动注册名不符 → SSR 空渲染）。
   - 分页/边界：抽查列表页 `skip/take` 传递、空态与第二页渲染。

每个子代理的产出要求（prompt 中明确）：只读扫描；将发现写入对应 findings 文件（用上方统一格式表）；每条必须含真实文件路径+行号+代码摘录证据；最终回复 ≤300 字摘要（高危条数、中低条数、最值得注意的 3 项）。

- [x] **Step 1.2: 确认三个 findings 文件已生成且格式合规**

Run: `Get-ChildItem docs/superpowers/plans/2026-09-28-audit-findings-*.md`
Expected: 3 个文件存在。

抽查每个文件：表头 7 列齐全、每条有文件:行号与代码证据。不合格的维度让对应子代理补扫（resume 该子代理）。

### Task 2: 主线逐条验证

**Files:**
- Modify: 三个 findings 文件（回填「验证状态」列）

- [x] **Step 2.1: 逐条打开证据位置复核**

对每个发现：Read 其 `文件:行号` 上下文（前后 20 行），确认证据真实、级别恰当。误报的改为 `误报` 并在建议修法列注明原因；确认的改为 `确认`。重点防两类误报：① v-html 渲染的是本地常量/已净化内容；② 硬编码 URL 属于类型声明或注释。

- [x] **Step 2.2: 高危项二次确认影响面**

对每个「高」级发现，补查：该入口是否真实可达（路由存在、页面在 `pages.json`/nuxt routes 注册）、影响数据范围。把结论并入该行建议修法列。完成后三个 findings 文件各 commit 一次：

```bash
git add docs/superpowers/plans/2026-09-28-audit-findings-vshop.md docs/superpowers/plans/2026-09-28-audit-findings-webadmin.md docs/superpowers/plans/2026-09-28-audit-findings-nshop.md
git commit -m "docs(audit): 三前端扫描发现清单 + 主线验证状态回填"
```

### Task 3: 高危漏洞修复（逐项循环）

对每条状态为「确认」的高危发现执行 Step 3.1–3.4（一项一轮，修完即提交）。按下表套用修复模式：

| 问题类别 | 修复模式 |
|---|---|
| vshop/web-admin 富文本 XSS | 改用 `mp-html` 组件渲染富文本（vshop 已有依赖）替代 v-html；web-admin 若必须 v-html，仅渲染 wangEditor 产出的受信内容并在展示组件加白名单过滤 |
| nshop 富文本 XSS | 安装 `isomorphic-dompurify`（SSR 兼容），渲染前净化 |

```ts
// nshop 净化模式（utils/sanitize.ts）
import DOMPurify from 'isomorphic-dompurify'
export const sanitizeRichText = (html: string): string =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS: ['p','br','img','a','ul','ol','li','strong','em','h1','h2','h3','h4','table','tr','td','th','tbody','span','div'], ALLOWED_ATTR: ['src','href','alt','style','class'] })
```

| 问题类别 | 修复模式 |
|---|---|
| 渠道头不一致 | C 端请求头统一为 `vendure-token`（客户端存 token 的 key 同步改名或做读取兼容），改动点为各项目 graphql client 封装文件（vshop `src/apis/`、nshop layers 内 client 封装、web-admin `src/apis/`） |
| token 敏感泄露 | localStorage/storage 仅存会话 token，不存密码/明文个人信息；登出时 `removeStorageSync|clear` 对应 key |
| C 端调管理接口 | 前端改为走对应 shop-api 公开接口；若后端无对应能力，登记到缺陷清单「待后端支持」而不是在前端绕权限 |
| 前端计价提交 | 改为只提交 variantId + quantity，删除前端算价字段 |
| 硬编码密钥 | 移入 `.env*`（不入库的真实值）+ `import.meta.env`/`process.env` 读取；已泄露的密钥提示用户作废轮换 |

- [x] **Step 3.1: 读上下文，实施最小修复**（只改该发现涉及的代码，不顺手重构）
- [x] **Step 3.2: 类型/构建自检**

Run（按项目）：`nshop: npm run typecheck` 或 `npm run build`；`vshop/web-admin: npm run build:h5`
Expected: 无新增错误。

- [x] **Step 3.3: 回填 findings 文件该行为「已修复」+ 修复说明**
- [x] **Step 3.4: 提交**

```bash
git add <修复文件> docs/superpowers/plans/2026-09-28-audit-findings-<项目>.md
git commit -m "fix(security): F-XX-NN 一句话修复说明"
```

- [x] **Step 3.5: 全部高危修完后，把修复记录汇总写入 spec 文档「审查结果」章节（高危表：编号/位置/修法/提交哈希）**

### Task 4: 功能缺陷批量修（按项目分组）

- [x] **Step 4.1: i18n 缺词修复** — 对比结果中每个缺失 key，在**所有**语言包同步补齐（zh-CN 为基准，en-US 等逐个翻译），禁止只补单一语言。nshop 数组型文案用 `tm()` 取。
- [x] **Step 4.2: 其余中/低项批量修** — 硬编码域名改动态 origin、多城市判断改 `useCityService`/`useLocationStore`、死链修正、console 调试残留删除（保留 console.error 的错误上报可留）。每类修完跑一次该项目的构建自检（同 Step 3.2 命令）。
- [x] **Step 4.3: 按项目分组提交 + 回填状态**

```bash
git add <修复文件> <findings 文件>
git commit -m "fix(audit): <项目> 中低危缺陷批量修复（F-XX-xx, F-XX-yy）"
```

「待后端支持」项保留 `确认` 状态并在建议修法注明，汇总进 spec「审查结果」章节缺陷清单。

### Task 5: 回归测试与截图取证

- [x] **Step 5.1: nshop 回归**

Run: `cd d:\zhao\nshop; npm test`
Expected: vitest 全部 PASS。失败则修复至通过。

- [x] **Step 5.2: web-admin 回归**

Run: `cd d:\zhao\vshop\web-admin; npm run build:h5; npm run verify:manual`
Expected: 构建成功；若本次改动了手册相关页面则 verify:manual 通过（未改手册可跳过并注明）。

- [x] **Step 5.3: vshop 构建**

Run: `cd d:\zhao\vshop; pnpm build:h5`
Expected: H5 构建成功无报错。

- [x] **Step 5.4: 受影响功能手机视口截图取证**

对每个用户可见的修复点：Playwright 移动视口 **390×844，deviceScaleFactor=2**，打开本地/预览页面截图存 `e2e-shots/`（nshop）或项目既有截图目录；涉及操作手册描述的功能，把截图补进对应手册文档（web-admin `docs/` 手册、nshop `docs/`）。

### Task 6: 报告归档 + 一气呵成交付

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-three-frontend-audit-design.md`（追加「审查结果」章节）

- [x] **Step 6.1: spec 文档追加「审查结果」章节**：① 高危修复记录表（编号/位置/修法/提交哈希）；② 缺陷清单表（编号/位置/级别/状态：已修复|待后端支持|不修-原因）；③ 各项目回归结论。
- [x] **Step 6.2: 回填本计划复选框与执行结论**（vshop 仓库惯例）。
- [x] **Step 6.3: 提交并推送**（vshop 仓库内 docs + 代码；nshop 仓库单独提交推送，身份用 johocn / johocn@163.com）。

```bash
# vshop 仓库（cwd: d:\zhao\vshop）
git add docs src
git commit -m "docs(audit): 三前端审查报告归档 + 计划收口"
git push
# nshop 仓库（cwd: d:\zhao\nshop；若报 Author identity unknown 先设 user.name=johocn / user.email=johocn@163.com）
git add -A
git commit -m "fix(audit): nshop 安全与缺陷修复"
git push
```

- [x] **Step 6.4: 部署**（按各仓库既有机制，本地构建产物上服务器，**绝不在服务器构建**）：
  - nshop：`npm run deploy`（`scripts/deploy.mjs`，scp 产物 → 服务器解压/拷入）。
  - web-admin：`node scripts/deploy.mjs`。
  - vshop H5：`pnpm build:h5` 产物（`dist/build/h5`）按 `doc/使用手册.md` 上传至服务器站点静态目录；静态目录替换后即时生效、无需 nginx reload。
- [x] **Step 6.5: 验收核对**（对照 spec 验收标准逐项打勾）：高危清零 / 缺陷清单逐条有状态 / 回归通过 / 截图到位 / 报告归档提交。有未决项先提醒用户，处理完再收口。

---

## Self-Review 记录

- Spec 覆盖：审查清单 7 维度 → Task 1 统一清单 1–7 条对应；主线验证 → Task 2；高危必修 → Task 3；缺陷批量修 → Task 4；回归+截图 → Task 5；报告归档+一气呵成 → Task 6。无遗漏。
- 占位符：修复代码因依赖扫描结果，以「修复模式表 + 可复用代码块」给出，执行者按发现套用，不属于 TBD。
- 一致性：编号规则（F-VS/WA/NS）、findings 文件路径、构建命令与三项目 package.json 实测一致。

---

## 执行结论

**产出**：3 份 findings 清单（vshop 16 / web-admin 14 / nshop 17 条，共 47 条，全部回填验证状态）+ 审查报告（见 spec「审查结果」章节）。

**修复与状态**：已修复 38 条；待后端支持 5 条（F-VS-06/07/08/09、F-WA-08）；不修 3 条（F-VS-02 受限渲染、F-WA-10 低危留观、F-NS-01 无提权效果）。高危 7 条（F-VS-01/03、F-WA-01/05、F-NS-03/04/09）全部修复。

**与初版计划的偏差**：
- F-WA-14 实为「已修复」——随 F-WA-05 实现净化回写（原判定「原代码已符合」有误）。
- F-WA-12 覆盖范围由 `calibrate-prices` 扩大到 7 个脚本（全部删除线上域名兜底，凭据/地址一律必填环境变量）。
- 新增 F-NS-17（验证期发现）：mall 版式「筛选」按钮无对应抽屉，已修复并截图。
- nshop `palette-presets` 既有漂移（测试断言 8 套 / 实现 9 套）在 Task 5.1 一并修正，测试全绿。
- vshop `dist/build/h5` 产物由并行工作流构建，本任务**不提交 dist**（交由并行工作流），也不纳入本次代码提交范围。

**回归**：nshop `npm test` 20 文件/155 用例 PASS、`npm run build` Build complete（28.3 MB）；web-admin `npm run build:h5` 成功 + `npm run verify:manual` 文档门禁 **PASS（失败 0）**；vshop `pnpm build:h5` 成功。

**截图取证**：nshop 4 张（首页/分类页/排序切换/筛选抽屉）存 `nshop/docs/superpowers/manual/audit-20260928/assets/`；web-admin 1 张（守卫重定向登录）、vshop 1 张（管理页 toast）存 `vshop/e2e-shots/`。均为 390×844、dpr=2。

**部署**（本地构建产物，服务器仅解压/重启）：
- nshop：`SKIP_BUILD=1 npm run deploy`（复用本次已验证的 `.output`，scp → 服务器解压 → `pm2 restart nshop`）
- web-admin：`node scripts/deploy.mjs`（本地 `build:h5` → tar → scp → 解压到 `e.joho.cn/guanli` + openresty reload）
- vshop H5：`dist/build/h5` → tar → scp `joho:/tmp` → 解压到 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（备份 + `rm -rf assets` + reload）

**待用户关注**：「待后端支持」5 条（前端不绕权限，需后端配合），须后端排期。

---

# 第二阶段：5 项「待后端支持」缺陷修复（用户批准扩范围到 vendure 后端）

**范围**：`d:\zhao\vendure`（后端，源码 `src/` + 编译产物 `lib/` 均已入库）+ `d:\zhao\vshop`（C 端）+ `d:\zhao\vshop\web-admin`（管理端）。
**部署铁律**：一律本地构建，服务器只解压/`pm2 restart`。

## 调研结论（现状事实，均带行号）

| 编号 | 调研事实（修正/补充审查结论） |
|---|---|
| F-VS-06 | 单位**一致**：前端 `recharge.vue:75` 元×100→分，后端 `recharge-card.service.ts:157-175` 以分落库，余额展示 `recharge.vue:5` `/100`。真实缺口：`createRechargeOrder` 只校验 `amt > 0`，**无上下限/面额约束**，金额完全由客户端决定。 |
| F-VS-07 | 审查结论需修正：前端**确已**换算（`src/api/queries/distribution.ts:106` `Math.round(amountYuan*100)`），后端 `withdrawal.service.ts:60` 也按分比较。真实缺口：`request()` 先读 `availableBalance` 再 `save()`，**读改写非原子**——并发两笔提现可各自通过校验并生成两条提现单，余额只扣一次（商户双倍出款）。 |
| F-VS-08 | 后端**已存** openid：`wechat-auth-plugin/src/customer-custom-fields.ts:6-16`（`Customer.customFields.wechatOpenid` / `wechatMiniOpenid`），由 `wechat-auth-strategy.ts:96-123` 登录时写入。而 `wechatpay-handler.ts:84` 只读 `metadata.openid`（前端永远为空）→ 真实缺口：**创建支付时未回落客户档案推导 openid**。 |
| F-VS-09 | 后端**只有 admin 上传**：`core/src/api/resolvers/admin/asset.resolver.ts:48-63` 的 `createAssets` 要求 `Permission.CreateCatalog/CreateAsset`，shop-api 无任何 `Upload` 端点（全库仅 core 用到 `Upload` 标量）。可用能力：`assetService.create(ctx, {file})`（内部做 MIME 白名单、落 `AssetServerPlugin` 存储）。 |
| F-WA-08 | 风险比审查更重：web-admin `apis/order.ts:322` 传 `surcharges:[{description, priceDelta}]`，而 `SurchargeInput`（`core/.../order.api.graphql:218-225`）**没有 `priceDelta` 字段**（那是 `modifications[].priceChange` 输出）→ 改价请求本身即 GraphQL 校验失败；且 `order-modifier.ts:390-392` 要求订单处于 `Modifying` 态。后端**无任何可挂载的改价校验钩子**（本版本无 `OrderModificationProcessor`，`orderInterceptors` 仅覆盖加/改/删行）。可用能力：`orderService.addSurchargeToOrder()`（`order.service.ts:1008`，无状态限制，适合草稿单）。 |

## 修复方案（逐项）

### F-VS-06 充值面额服务端校验
- 新增 `vendure/packages/recharge-card-plugin/src/channel-custom-fields.ts`：`Channel.rechargeMinAmount`（分，默认 100）、`Channel.rechargeMaxAmount`（分，默认 5000000）；`plugin.ts` configuration 去重注册（沿用 cjk-plugin 的 `existingChannelNames` 去重写法）。
- `recharge-card.service.ts#createRechargeOrder`：`Number.isInteger(amount)` + `min <= amount <= max` 校验，越界抛 `UserInputError`。
- 前端不改（已按分提交）。

### F-VS-07 提现原子扣减 + 强校验
- `distribution-plugin/src/withdrawal.service.ts#request`：
  - 校验 `Number.isInteger(amount) && amount >= minAmount`，错误改抛 `UserInputError`（客户端可见友好文案）。
  - 余额扣减改**条件更新**：`startTransaction` → `UPDATE distributor SET availableBalance = availableBalance - :amt, frozenBalance = frozenBalance + :amt WHERE id = :id AND availableBalance >= :amt`，`affected === 0` 即余额不足抛错；提现单创建与扣减同事务，失败回滚。
- 前端不改。

### F-VS-08 后端从客户档案推导 openid
- `wechatpay-plugin/src/wechatpay.service.ts`：新增 `resolveCustomerOpenid(ctx, customerId, { preferMini })`（`TransactionalConnection` 读 `Customer.customFields`；仅存一个则用之，两个都有时 `preferMini` 决定优先 `wechatMiniOpenid`）。
- `wechatpay-plugin/src/plugin.ts`：`onApplicationBootstrap` 中（devBypass 早退**之前**）注册服务引用，导出模块级 `resolveCustomerOpenid(ctx, customerId, opts)` 供支付 handler 与充值插件复用（沿用本项目既有 `setWechatpayGateway`/`getPaymentOverride` 注册模式）。
- `wechatpay-plugin/src/wechatpay-handler.ts#createPayment`：`metadata.openid → resolveCustomerOpenid(ctx, order.customerId, { preferMini: tradeType === 'JSAPI' }) → devBypassOpenid` 三级回落。
- `recharge-card-plugin/src/recharge-card.service.ts#createWechatRechargePayment`：`openid || await resolveCustomerOpenid(ctx, order.customerId, { preferMini: tradeType === 'JSAPI' })`。
- 前端不改（`auth_openid` 取不到即为空，后端接管）。

### F-VS-09 C 端上传端点 + 前端接入
- 后端新增 `cjk-plugin/src/asset/customer-asset.resolver.ts` + shop-api SDL：
  `extend type Mutation { uploadCustomerAsset(file: Upload!): CustomerUploadResult! }`，`CustomerUploadResult { id: ID!, preview: String!, source: String! }`；
  `@Transaction() @Allow(Permission.Authenticated)`，内部 `assetService.create(ctx, { file, tags: ['customer-upload'] })`，`MimeTypeError` 直接抛错。
- 前端 `vshop/src/components/ImageUpload.vue`：`uni.uploadFile` 走 GraphQL multipart（`name: '0'` + `operations`/`map`），携带 Bearer + `vendure-token`，成功后 push 后端返回的 `preview`（CDN/存储地址），失败 toast 并保留本地图。
- 兜底：H5 下若 uni 的 FormData 字段顺序不符合 multipart 规范，则 H5 分支手写 `FormData`（`operations` → `map` → `0`）。

### F-WA-08 改价服务端校验 + 修正非法入参
- 后端新增 cjk-plugin **admin-api** mutation：
  `input AdjustOrderPriceInput { orderId: ID!, targetTotalWithTax: Int!, note: String }`
  `extend type Mutation { adjustOrderPrice(input: AdjustOrderPriceInput!): Order! }`，
  `@Transaction() @Allow(Permission.UpdateOrder)`，逻辑：
  1. 载单；`target >= 0` 且 `delta = target - order.totalWithTax !== 0`，否则 `UserInputError`；
  2. 渠道上限：新增 `Channel.orderAdjustMaxRateBp`（万分比，默认 3000）+ `Channel.orderAdjustMaxAmount`（分，默认 100000），实际上限取 `min(总额×比例, 绝对额)`，越界抛 `UserInputError`；
  3. 落价路由：`Modifying` → `orderService.modifyOrder`（合法 `SurchargeInput`：`price: delta, priceIncludesTax: true`）；`AddingItems`/`ArrangingPayment` → `orderService.addSurchargeToOrder`；其他状态 → `UserInputError('当前订单状态不支持改价')`。
- 前端 web-admin：`src/apis/order.ts` 改调 `adjustOrderPrice`（去掉非法 `priceDelta`）；`pages/order/detail/index.vue` 提交目标金额（分），服务端错误原样 toast。

## 验收
- 后端：改动插件 `npm run build`（`lib/` 同步提交）；`packages/cjk-plugin` / `recharge-card-plugin` / `distribution-plugin` 相关单测（若有）通过。
- 端到端：本地起 dev-server（`npm run dev:server` + `npm run dev:worker`）后用脚本实测 5 条：
  1. 充值 `amount=1`（低于下限）被拒；
  2. 并发两笔提现 → 仅 1 笔成功、余额不出现负数；
  3. 客户档案写 `wechatMiniOpenid` 后 `createWechatRechargePayment` 不再要求前端传 openid（devBypass 下可断言入参）；
  4. `uploadCustomerAsset` 上传 PNG 返回可直接访问的 `preview`；非图片 MIME 被拒；
  5. 草稿单/`Modifying` 单改价成功，超上限被拒，非法状态被拒。
- 前端：web-admin `npm run build:h5`、vshop `pnpm build:h5` 通过；**手机视口截图（390×844, dpr=2）** 补入操作手册。
- 收尾：`src` + `lib` + 前端改动提交推送；后端按仓库既有方式部署（本地构建产物），前端按 `deploy.mjs` / tar 静态目录部署；线上核验。

## 执行结论（2026-09-29）

**后端改动（`d:\zhao\vendure`，4 个包 `npm run build` 通过，`lib/` 已同步提交）**

| 包 | 文件 | 内容 |
|---|---|---|
| recharge-card-plugin | `src/channel-custom-fields.ts`(新)、`src/plugin.ts`、`src/recharge-card.service.ts` | `Channel.rechargeMinAmount`(默认100)/`rechargeMaxAmount`(默认5000000)，渠道字段去重注册；`createRechargeOrder` 强校验 + openid 回落 |
| distribution-plugin | `src/withdrawal.service.ts` | `request()` 原子条件扣减（列名必须双引号，TypeORM 建的是 camelCase 列）；`approve/reject/markPaid` 状态机守卫（见下方「附带修复」） |
| wechatpay-plugin | `src/wechatpay.service.ts`、`src/plugin.ts`、`src/wechatpay-handler.ts` | 模块级 `setWechatpayServiceRef` + 导出 `resolveCustomerOpenid(ctx, customerId, {preferMini})`；`onApplicationBootstrap` 内 devBypass 早退**之前**注册；handler 三级回落 |
| cjk-plugin | `src/asset/customer-asset-shop.resolver.ts`(新)、`src/order/order-price-admin.resolver.ts`(新)、`src/order/order-price-custom-fields.ts`(新)、`src/plugin.ts` | shop-api `uploadCustomerAsset`；admin-api `adjustOrderPrice`；渠道改价上限字段 |

**与初版方案的偏差（重要）**

1. **F-VS-09 返回类型**：未用自定义 `CustomerUploadResult`，改返回核心 `Asset`——`AssetInterceptorPlugin.isAssetType` 白名单只认 `Asset`，自定义类型不会被转绝对 URL（前端拿到相对路径会 404）。
2. **F-WA-08 入参**：用 `amount`（分差额）而非 `targetTotalWithTax`；三态（`Modifying`/`AddingItems`/`ArrangingPayment`）**统一走 `addSurchargeToOrder`**——`modifyOrder` 在草稿单降价会抛 `RefundPaymentIdMissingError`，且 `priceDelta` 不是 `SurchargeInput` 字段。上限默认 **2000 bp / 500000 分**。
3. **F-VS-08 验证深度**：本地 dev-server 未启用 WechatpayPlugin（无 `WECHATPAY_NOTIFY_URL`/`DEV_BYPASS_WECHATPAY`），且 handler 的 devBypass 分支在回落逻辑**之前**提前 return，故只实测到「模块接线三层断言 + 客户档案 openid 字段存在」，真实 `profile → openid` 取值链路未跑通。
4. **前端补充修复**：`modifyOrderPrice` 的 catch 原为 `e.message`，会把整段响应 JSON 抛到 toast，改为 `graphQlErrorMsg(e)` 取 `errors[0].message`；`upload.ts` 把后端返回的 `source` 反斜杠归一为正斜杠（Windows 开发环境下 `path.join` 产物在 CSS `url()` 中被当转义符，缩略图取不到图）。
5. `ImageUpload` 推入的是 `asset.source`（绝对 URL）。

**端到端回归**：`vendure/packages/dev-server/verify-audit-fixes.cjs`（本地 dev-server + postgres）**24/24 PASS**。关键证据：4 组新渠道 customFields 列已建；上传 PNG 返回绝对 URL、`text/plain` 被拒（MIME_TYPE_ERROR）；充值 50/99999999 被拒、10000 成功；提现 amount 0/5000 被拒；**并发 5 笔 10000 分、余额 20000 → 成功 2 笔、余额 0、冻结 20000**；**提现审核首次 reject 回补一次（余额 0→10000、冻结 20000→10000），再连续 reject 3 次 + 第 4 次仍报错且余额纹丝不动，已驳回单据无法再 approve/markPaid**；改价 0 被拒、超限被拒、+100 分生效（18967→19067）、-100 分回退；openid 接线三段断言通过。

**前端构建与截图取证（390×844，dpr=2）**

- vshop：`pnpm build:h5` 通过。`e2e-shots/_shot_audit_stage2_vshop.py` 驱动真实链路（H5 dev 8091 → `uni.uploadFile` → 本地 shop-api 3000），售后申请页凭证图上传播截图 `e2e-shots/audit-vshop-after-sale-upload-{before,after}.png`，缩略图 src 为 `http://localhost:3000/assets/source/...`（后端返回的绝对 URL）。
- web-admin：`npm run build:h5` 通过。`docs/verify/_shot_audit_stage2_admin.py`（H5 dev 5280，base `/guanli/`）截图 4 张：`audit-webadmin-order-detail-adjust.png`（详情页含「改价」）、`...-adjust-sheet.png`、`...-adjust-overlimit.png`（服务端拒绝 toast：「改价幅度超出上限（最多 37.93 元）」）、`...-adjust-success.png`（「改价成功」）。

**附带修复（修复期发现，经用户确认一并处理）**

- `distribution-plugin/src/withdrawal.service.ts#approve/reject/markPaid` 原**无审核状态守卫**：对同一提现单重复 `reject` 会按 `frozenBalance -= amount / availableBalance += amount` **二次回补余额**（可用余额虚增、冻结余额可变负），已驳回/已打款单据还可被再次流转。
  修法：抽 `private transition(ctx, id, from, patch)`，用「带原状态条件的原子更新」完成流转（`pending → approved → paid`，`pending/approved → rejected`），`affected === 0` 抛 `UserInputError`；余额变更只在该流转成功的那一次执行。resolver 侧已有 `@Transaction()`，状态与余额同事务。
  回归：`verify-audit-fixes.cjs` 新增 4 条断言（提交 `548873112`）。

**部署与线上核验（2026-09-29）**

| 目标 | 方式 | 核验结果 |
|---|---|---|
| vendure 后端 | 服务器 `/www/apps/vendure` → `git pull`（fast-forward 至 `548873112`）→ `pm2 restart vendure --update-env` + `pm2 restart vendure-worker --update-env`。服务器只拉产物不构建（`packages/dev-server/dist`、各插件 `lib/` 均已入库） | 只读冒烟 **6/6**：`/health` 200；`channel` 表新增 4 个 customFields 列已建（生产 `DB=postgres` 走 `getDbConfig()` 的 `synchronize: true`，自动建列）；shop-api `uploadCustomerAsset` 已注册；admin-api `adjustOrderPrice` + `AdjustOrderPriceInput{orderId, amount, note}` 已注册 |
| vshop C 端 H5 | 本地 `dist/build/h5`（已确认含 `uploadCustomerAsset` 与反斜杠归一）→ tar → scp `joho:/tmp` → 解压至 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（备份轮转 + 替换 `assets`，静态目录即时生效、无需 reload） | `https://e.joho.cn/` 200；新 chunk `.../assets/pkg-after-sale-pages-apply.a0lavy4B.js` 200 |
| web-admin | `node scripts/deploy.mjs`（本地 `npm run build:h5` 产物 50.8 MB → 校验 → tar → scp → 解压至 `.../e.joho.cn/guanli` → 备份轮转 + openresty reload） | `https://e.joho.cn/guanli/` 200；新 chunk `.../assets/order.DoG4RdAc.js` 200 |

> 生产环境只读冒烟脚本为一次性工具（`tmp-smoke-prod.cjs`，仅查列/查 schema/查健康，不做任何写操作），用后即从服务器删除、未入库。

**已知未纳入本次修复（需后续处理）**

- F-VS-08 真实 openid 取值链路未实测（见偏差 3）。
