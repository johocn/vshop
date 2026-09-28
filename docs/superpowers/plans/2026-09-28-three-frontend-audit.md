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

**回归**：nshop `npm test` 20 文件/155 用例 PASS、`npm run build` Build complete（28.3 MB）；web-admin `npm run build:h5` 成功；vshop `pnpm build:h5` 成功。

**截图取证**：nshop 4 张（首页/分类页/排序切换/筛选抽屉）存 `nshop/docs/superpowers/manual/audit-20260928/assets/`；web-admin 1 张（守卫重定向登录）、vshop 1 张（管理页 toast）存 `vshop/e2e-shots/`。均为 390×844、dpr=2。

**部署**（本地构建产物，服务器仅解压/重启）：
- nshop：`SKIP_BUILD=1 npm run deploy`（复用本次已验证的 `.output`，scp → 服务器解压 → `pm2 restart nshop`）
- web-admin：`node scripts/deploy.mjs`（本地 `build:h5` → tar → scp → 解压到 `e.joho.cn/guanli` + openresty reload）
- vshop H5：`dist/build/h5` → tar → scp `joho:/tmp` → 解压到 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（备份 + `rm -rf assets` + reload）

**待用户关注**：「待后端支持」5 条（前端不绕权限，需后端配合），须后端排期。
