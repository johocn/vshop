# 优惠券交易闭环与微信支付证书 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 端到端验证到店核销/券包/定向发放三条优惠券链路，并完成微信支付商户证书配置与小额真实支付验证，最终交付 8.3 联调记录与证书配置手册。

**Architecture:** 纯线上运维验证（方案A），零代码改动预期。所有配置经生产 admin-api（GraphQL）完成；C 端 UI 走本地 dev 代理（`pnpm dev:h5` + `.env.local` 代理到 `https://e.joho.cn`，8.1 成熟路线）；web-admin 核销走线上 `https://e.joho.cn/guanli/`。微信支付凭证有**双路径**：PaymentMethod handler args（明文存库）与渠道 payConfig（加密存库，`updateTenantConfig` payPatch，**优先级更高**，见 wechatpay-handler.ts L74-81 `override?.x || args.x`）——两条都写一致值。

**Tech Stack:** Vendure admin-api (GraphQL/curl.exe)、vshop C 端 (uni-app H5 dev)、web-admin (Vue H5)、wechatpay-node-v3。

**设计文档:** `docs/superpowers/specs/2026-10-03-coupon-closure-design.md`

**通用约定（所有任务适用）:**
- `ADMIN_API = https://e.joho.cn/admin-api`；认证 header：`vendure-auth-token: <TOKEN>`（Task 1 登录后设置 `$env:ADMIN_TOKEN`，过期则重新登录）。
- 金额单位一律为**分**。GraphQL 枚举（如 `usageScene: "ALL"`）**去引号**传字面量。
- UI 操作一律**真实点击**（浏览器代理，手机视口 390×844 dpr=2 截图）；GraphQL 直发仅用于准备数据/结果校验。已知限制：JS 赋值不触发 uni-app radio/v-model。
- 截图统一存 `e:\zhao\vshop\docs\demo\shots\2026-10-03-coupon-closure\`（不存在则创建）。

---

### Task 1: 阶段① 线上探测（admin-api 可用性 + web-admin 页面 + C 端路线）

**Files:**
- 无代码改动；探测结果记入最终 8.3 文档。

- [x] **Step 1: 登录 admin-api 并保存 token**

```powershell
curl.exe -s -D - -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -d '{"query":"mutation { login(username: \"superadmin\", password: \"z123123\") { user { id identifier } } }"}'
```
从响应头 `vendure-auth-token:` 取值，然后：
```powershell
$env:ADMIN_TOKEN = "<上一步取到的token>"
```
Expected: body 含 `"identifier":"superadmin"`。若登录失败（密码已改），停下向用户索要新凭据。

- [x] **Step 2: 验证登录态 + 盘点既有 TEST 数据**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { couponTemplates(options: { skip: 0, take: 20, filter: { enabled: { eq: true } } }) { totalItems items { id name type discountValue minSpend salePrice usageScene distributionChannels claimable pointsPrice enabled } } }"}'
```
Expected: JSON 返回，能看到 8.2 的券 73/74/75/76。记录各券 id 供后续复用（如券 74 用于 TC-WP-1）。

- [x] **Step 3: 探测 web-admin 线上部署状态**

用浏览器代理（手机/桌面视口均可）依次打开，确认渲染非空白、无 404：
- `https://e.joho.cn/guanli/`（登录页）
- 登录后依次访问 hash 路由：`#/coupon/index`、`#/coupon/bundle`、`#/coupon/issue`、`#/in-store/redeem`、`#/in-store/bills`
Expected: 5 个页面均渲染。任一页面路由不存在/白屏 → 本地构建部署：
```powershell
cd e:\zhao\vshop\web-admin; node scripts/deploy.mjs
```
（deploy.mjs = 本地 `npm run build:h5` → 产物校验 → tar → scp 主机 `joho` → 服务器解压 + nginx reload；**本地构建，服务器只解压**。需 `~/.ssh/config` 含 `joho` 主机。）
Expected: 控制台 `deploy done`，重新访问页面正常。

- [x] **Step 4: 确认 C 端联调路线**

C 端无需线上部署（8.1 路线）。确认 `e:\zhao\vshop\.env.local` 存在且含：
```
VITE_API_URL=http://localhost:5180
VITE_API_PROXY=https://e.joho.cn
```
缺失则创建。然后启动：
```powershell
cd e:\zhao\vshop; pnpm dev:h5
```
Expected: vite 启动于 `http://localhost:5180`（后台运行，后续任务复用，不重复启动）。

---

### Task 2: 阶段② 配置测试数据 D1~D5（TEST 前缀，admin-api）

**Files:**
- 事后记录进 `docs/demo/券商城与加价购-测试用例.md` §8.3。

- [x] **Step 1: 创建 D1 到店券**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"mutation CreateD1($input: CreateCouponTemplateInput!) { createCouponTemplate(input: $input) { id } }","variables":{"input":{"name":"TEST·到店满50减10","description":"2026-10-03 核销链路联调券，事后禁用","type":"FIXED","discountValue":1000,"minSpend":5000,"totalCount":100,"perUserLimit":5,"enabled":true,"claimable":true,"usageScene":"IN_STORE","distributionChannels":"CENTRE,GRANT"}}}'
```
Expected: 返回新 id（记为 `$env:D1`）。

- [x] **Step 2: 创建 D2/D3 包内容券（不出现在任何独立渠道）**

D2（无门槛减3）：
```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"mutation CreateD2($input: CreateCouponTemplateInput!) { createCouponTemplate(input: $input) { id } }","variables":{"input":{"name":"TEST·包内无门槛减3","description":"券包内容物，不单独分发","type":"FIXED","discountValue":300,"minSpend":0,"totalCount":100,"perUserLimit":5,"enabled":true,"usageScene":"ALL"}}}'
```
D3（满30减5）：同上，`name":"TEST·包内满30减5","discountValue":500,"minSpend":3000`。
Expected: 两个新 id（记为 `$env:D2`、`$env:D3`）。不传 `distributionChannels`/`salePrice`/`claimable` → 不出现在领券中心/购券目录/积分商城，仅作包内容物。

- [x] **Step 3: 创建 D4 券包**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"mutation CreateD4($input: CouponBundleInput!) { createCouponBundle(input: $input) { id } }","variables":{"input":{"name":"TEST·到店双券包","description":"2026-10-03 券包购买联调，事后禁用","salePrice":100,"enabled":true,"items":[{"templateId":"<D2 id>","quantity":1},{"templateId":"<D3 id>","quantity":1}]}}}'
```
Expected: 返回新 id（记为 `$env:D4`）。

- [x] **Step 4: 校验数据落库**

复用 Task 1 Step 2 查询，确认 D1~D3 已列出；再查券包：
```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { couponBundles(options: { skip: 0, take: 10 }) { items { id name salePrice enabled items { templateId quantity } } } }"}'
```
Expected: D4 在列且 items 含 D2/D3 各 1 张。

---

### Task 3: TC-GR-1 定向发放入卡包

**Files:**
- 截图 → `docs/demo/shots/2026-10-03-coupon-closure/`

- [x] **Step 1: admin 侧搜索测试客户并发放**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { couponChannelCustomers(query: \"etao\", take: 5, skip: 0) { items { id emailAddress firstName lastName } } }"}'
```
取客户 id（记为 `$env:ETA0_ID`），发放 D1 并开通知：
```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"mutation { grantCouponIssue(templateId: \"<D1 id>\", customerIds: [\"<ETA0_ID>\"], notify: true) { customerId ok code reason } }"}'
```
Expected: `ok:true` + 返回新券码。

- [x] **Step 2: C 端卡包验证（真实点击 + 截图）**

浏览器手机视口 390×844 dpr=2 打开 C 端 → 登录 etao（SSO 账密，8.1 已验证）→ 我的 → 优惠券 → 卡包「未使用」。
Expected: 「TEST·到店满50减10」出现，场景 tag「到店可用」，带「出示券码」按钮。**截图 shots/gr-1-wallet.png**。

---

### Task 4: TC-BP-1 券包余额购买

**Files:**
- 截图 → `docs/demo/shots/2026-10-03-coupon-closure/`

- [x] **Step 1: C 端购券 Tab 找到券包**

浏览器（etao 登录态）→ 券商城 → 购券 Tab（任一场景，D4 场景 ALL）。
Expected: 「TEST·到店双券包」卡片显示「2 类2张」。**截图 shots/bp-1-mall.png**。

- [x] **Step 2: 余额支付购买（真实点击）**

点「买 ¥1」→ 支付弹层 → **真实点击**选中「余额支付」（radio v-model 限制：不可 JS 赋值）→ 点「¥1 支付」。
Expected: toast「支付成功」→ 跳卡包，D2/D3 两张券均入「未使用」。**截图 shots/bp-1-wallet.png**。

- [x] **Step 3: admin 侧校验出售单 + 客户券**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { couponSaleOrders(options: { skip: 0, take: 5, filter: { status: { eq: \"PAID\" } } }) { items { id payMode bundleId amount status createdAt } } }"}'
```
Expected: 新 PAID 单 `payMode:"BALANCE"`，`bundleId` = D4，`amount:100`。
再用 `customerCoupons`（Task 1 Step 2 的查询加 `filter: { templateId: { eq: "<D2 id>" } }`）确认 D2/D3 各有一张 UNUSED。

---

### Task 5: TC-IS-1/2/3 到店核销链路（核心）

**Files:**
- 截图 → `docs/demo/shots/2026-10-03-coupon-closure/`

- [x] **Step 1: C 端出示券码（TC-IS-1 前半）**

etao 卡包 → 到店券（Task 3 领取的那张 D1；若用券包外另一张则再 claim 一张）→ 点「出示券码」。
Expected: 券码页显示二维码 + 券码字符串。**截图 shots/is-1-show-code.png**，抄下券码（记为 `$env:CODE`）。

- [x] **Step 2: web-admin 输码报价（TC-IS-1）**

线上 `https://e.joho.cn/guanli/#/in-store/redeem` → 切「输码」→ 输入券码 → 原价输入 `60`（¥60 ≥ 满50）→ 查询报价。
Expected: 报价卡显示券名「TEST·到店满50减10」、优惠 ¥10、实付 ¥50。**截图 shots/is-1-quote.png**。

- [x] **Step 3: 确认核销（TC-IS-1 focal）**

点「确认核销」。
Expected: toast 成功；跳转/刷新流水页可见该笔（原价 60 / 优惠 10 / 实付 50）。**截图 shots/is-1-redeemed.png**。

- [x] **Step 4: C 端状态同步（TC-IS-1 收尾）**

etao 卡包刷新（切到「已使用」筛选）。
Expected: 该券变「已使用」。**截图 shots/is-1-c-used.png**。

- [x] **Step 5: admin 侧校验流水与汇总（TC-IS-1）**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { inStoreBills(options: { skip: 0, take: 5 }) { totalItems items { id couponCode couponName originalAmount discountAmount finalAmount operatorName billedAt } } inStoreBillSummary(options: {}) { count originalTotal discountTotal finalTotal } }"}'
```
Expected: totalItems ≥1；summary.count 与列表吻合、discountTotal 含 1000。

- [x] **Step 6: TC-IS-2 已用券报价拒绝**

web-admin 核销页输入**同一券码**查询报价（原价 60）。
Expected: `ok:false` + 中文拒绝原因（已使用/已核销）。**截图 shots/is-2-quote-reject.png**。
（过期分支 P2 可选：需 validDays 到期券，超出本轮时间窗，8.3 标注即可。）

- [x] **Step 7: TC-IS-3 重复核销拒绝（资损点）**

绕过 UI 拦截直接发 redeem 验证服务端幂等：
```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"mutation { inStoreBillRedeem(code: \"<券码>\", originalAmount: 6000) { id } }"}'
```
Expected: **报错拒绝**（如「券已核销」）。再查 `inStoreBills` totalItems **不增加**。
若服务端未拦截（幂等缺失）→ 按设计文档 §5 风险预案：web-admin 隐藏核销入口，并在 8.3 记缺陷。

---

### Task 6: 阶段④ 微信支付证书探测与配置（双路径）（【后置】证书材料未到位，本轮跳过）

**Files:**
- Create: `e:\zhao\vshop\.secrets\wechatpay\`（6 个材料文件；确认 `.gitignore` 覆盖 `.secrets/`，未覆盖则先追加）

- [ ] **Step 1: 探测支付配置现状（两路径）**

PaymentMethod args：
```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { paymentMethods { items { id code enabled handler { code args { name value } } } } }"}'
```
Expected: 存在 `code:"wechatpay"` 的 method；args 中 `privateKey`/`publicKey`/`apiKey` 为空或占位（即 8.2 `PEM: no block` 根因）。记录 method id（`$env:PM_ID`）。
渠道 payConfig（取当前渠道 id）：
```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { activeChannel { id } }"}'
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { tenantConfig(channelId: \"<渠道id>\") { channelId pay } }"}'
```
Expected: `pay.wechatpay` 为 null 或 masked 值。若已存在旧配置（masked），**payPatch 合并写入只覆盖提供字段**（后端 mergePayConfig）。
同时确认 C 端下单的 channel：若 C 端走非默认渠道（`vendure-token` header 区分），`activeChannel` 是 superadmin 默认渠道——改用 `channels` 列表确认 C 端渠道 id（对齐 web-admin 登录后左上角渠道切换，与 C 端 shop-api 使用的 channel token 一致）。**payConfig 必须写在 C 端下单时的 ctx.channel 上，否则 override 不生效。**

- [ ] **Step 2: 用户交付材料（写文件，不进对话/git）**

请用户将 6 项材料放入 `e:\zhao\vshop\.secrets\wechatpay\`：
| 文件 | 内容 | 来源 |
|------|------|------|
| `appId.txt` | 公众号/小程序 AppID | 微信公众平台 |
| `mchId.txt` | 商户号 | 微信商户平台 |
| `apiclient_key.pem` | 商户 API 私钥 | 商户平台-账户中心-API安全-申请API证书 |
| `serialNo.txt` | 商户 API 证书序列号 | 同上（证书详情） |
| `apiv3key.txt` | APIv3 密钥（32 位） | 同上-设置APIv3密钥 |
| `platform_pub.pem` | 微信平台公钥 PEM | 同上-微信支付公钥（新公钥模式） |
另确认回调地址：渠道 payConfig 的 `notifyUrl`（建议 `https://e.joho.cn/wechatpay/notify`；若 tenantConfig 已有值则沿用）。**这些文件 gitignore 覆盖，不提交。**

- [ ] **Step 3: 写入 payConfig（优先路径，加密存储）**

先本地读文件组装 patch（Node 一次性脚本，密码学内容不出本机）：
```powershell
node -e "const fs=require('fs');const d='e:/zhao/vshop/.secrets/wechatpay/';const r=f=>fs.readFileSync(d+f,'utf8').trim();const cfg={appId:r('appId.txt'),mchId:r('mchId.txt'),publicKey:r('platform_pub.pem'),privateKey:r('apiclient_key.pem'),apiKey:r('apiv3key.txt'),serialNo:r('serialNo.txt'),notifyUrl:'https://e.joho.cn/wechatpay/notify'};fs.writeFileSync(d+'payPatch.json',JSON.stringify({channelId:process.argv[1],payPatch:{wechatpay:cfg}}),'utf8');console.log('payPatch.json written, fields:',Object.keys(cfg).join(','))" "<C端渠道id>"
```
再发送（`updateTenantConfig` 入参为 JSON 标量，若 schema 报类型错先内省 `__schema { mutationType { fields { name type { name ofType { name } } } } }` 校准）：
```powershell
node -e "const fs=require('fs');const body=JSON.stringify({query:'mutation U($input: JSON!) { updateTenantConfig(input: $input) { channelId pay } }',variables:{input:JSON.parse(fs.readFileSync('e:/zhao/vshop/.secrets/wechatpay/payPatch.json','utf8'))}});fs.writeFileSync('e:/zhao/vshop/.secrets/wechatpay/_req.json',body)"
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" --data-binary "@e:/zhao/vshop/.secrets/wechatpay/_req.json"
```
Expected: 返回 `pay.wechatpay` masked（私钥/密钥打码但 `mchId`/`serialNo` 可见且为新值）。

- [ ] **Step 4: 兜底写入 PaymentMethod args（同值）**

```powershell
node -e "const fs=require('fs');const d='e:/zhao/vshop/.secrets/wechatpay/';const r=f=>fs.readFileSync(d+f,'utf8').trim();const args=[['appId',r('appId.txt')],['mchId',r('mchId.txt')],['publicKey',r('platform_pub.pem')],['privateKey',r('apiclient_key.pem')],['apiKey',r('apiv3key.txt')],['serialNo',r('serialNo.txt')],['tradeType','JSAPI']].map(([name,value])=>({name,value}));const body=JSON.stringify({query:'mutation U($input: UpdatePaymentMethodInput!) { updatePaymentMethod(input: $input) { id code enabled } }',variables:{input:{id:process.argv[1],handler:{code:'wechatpay',arguments:args}}}});fs.writeFileSync(d+'_pm.json',body)"
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" --data-binary "@e:/zhao/vshop/.secrets/wechatpay/_pm.json"
```
Expected: `{ id code:"wechatpay" enabled:true }`，无 schema 错误。

- [ ] **Step 5: 清理本机明文残留**

删除组装用的请求文件（保留原始材料文件供复用）：
```powershell
Remove-Item e:\zhao\vshop\.secrets\wechatpay\_req.json, e:\zhao\vshop\.secrets\wechatpay\_pm.json, e:\zhao\vshop\.secrets\wechatpay\payPatch.json -ErrorAction SilentlyContinue
```

---

### Task 7: TC-WP-1 微信支付小额真实验证（需用户真机配合）（【后置】依赖 Task 6）

**Files:**
- 截图 → `docs/demo/shots/2026-10-03-coupon-closure/`

- [ ] **Step 1: 发起微信支付购券（券 74，¥1）**

etao C 端 → 券商城购券 Tab → 「TEST·无门槛减5元券」「买 ¥1」→ **真实点击**「微信支付」→ 确认。
Expected: 不再报 `PEM: no block`；H5 在微信内拉起收银台 / 微信外浏览器拿到 `payUrl` 跳转（handler tradeType JSAPI 需要 openid，H5 微信外走 H5 支付由前端分支处理；若拉起失败先看报错是否为 openid 类问题，必要时让用户在**微信内**打开页面重试）。

- [ ] **Step 2: 用户真机完成 ¥1 支付**

用户在手机微信完成支付。
Expected: 支付成功页。

- [ ] **Step 3: 校验 PAID + 发券**

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"query { couponSaleOrders(options: { skip: 0, take: 3, filter: { payMode: { eq: \"WECHAT\" } } }) { items { id amount status paidAt templateId } } }"}'
```
Expected: 新单 `status:"PAID"`（notify 回调生效）；etao 卡包出现券 74 对应新券。若单停留 PENDING → notifyUrl 未生效：检查 Step 3(Task 6) 写入的 notifyUrl 与服务器 nginx 路径，修复后用微信商户平台「退款/查单」工具核对单据，8.3 记录待回调项。
**截图 shots/wp-1-paid.png**（C 端卡包新券）。

---

### Task 8: 阶段⑤ 交付文档 + 收尾

**Files:**
- Modify: `docs/demo/券商城与加价购-测试用例.md`（追加 §8.3）
- Create: `docs/demo/微信支付证书配置手册.md`
- Modify: `.gitignore`（若 `.secrets/` 未覆盖）

- [x] **Step 1: 追加 8.3 联调记录**

按 8.2 格式：本轮测试数据表（D1~D5 id/字段/用途 + 既有 73/74 复用）、TC-GR-1/BP-1/IS-1/2/3/WP-1 结果表（含截图文件名）、遗留 TEST 数据清单更新（73/74/75/76 + D1~D5，标注「可禁用」+ 禁用命令）。

- [x] **Step 2: 写证书配置手册**

内容：材料 6 项来源指引（对齐 Task 6 Step 2 表格）→ 双路径说明（payConfig 优先 + PM args 兜底）→ admin-api 写入步骤（引用 Task 6 命令）→ 三类报错对照（`PEM: no block`=私钥缺失/格式错；`签名错误`=APIv3 key 或 serialNo 错；`证书链错误`=平台公钥错）→ 换证/新商户复用清单。**手册中不含任何真实凭证值。**

- [ ] **Step 3: 禁用本轮测试券（保留出售单流水）**（【跳过】保留观察期至 TC-WP 回归，8.3 已标注）

```powershell
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" -H "vendure-auth-token: $env:ADMIN_TOKEN" -d '{"query":"mutation { updateCouponTemplate(input: { id: \"<D1 id>\", enabled: false }) { id } }"}'
```
（D2/D3 同理；D4 用 `updateCouponBundle(id, input)` 置 `enabled:false`。若用户希望保留观察期则跳过，8.3 标注。）

- [x] **Step 4: 验收清单核对（设计文档 §4 逐项）**

全部勾选后方可提交；未过项在 8.3 标注原因。

- [ ] **Step 5: 提交并推送（一气呵成）**

```powershell
cd e:\zhao\vshop
git add docs/demo/券商城与加价购-测试用例.md docs/demo/微信支付证书配置手册.md docs/superpowers/specs/2026-10-03-coupon-closure-design.md docs/superpowers/plans/2026-10-03-coupon-closure.md
git commit -m "docs: 优惠券交易闭环联调记录(8.3)与微信支付证书配置手册"
git push
```
（`.gitignore` 若有改动一并加入；确认 `git status` 无 `.secrets/` 泄漏。）

---

## Self-Review 结论

1. **Spec 覆盖**：阶段①→Task 1；阶段②→Task 2（D1~D5 全）；阶段③→Task 3/4/5（TC-GR/BP/IS 全 + 异常分支）；阶段④→Task 6/7（双路径 + 材料 + 小额验证 + 失败兜底）；阶段⑤→Task 8（8.3 + 手册 + 清单 + commit/push）。验收标准 §4 全部映射到任务步骤。无缺口。
2. **占位符扫描**：所有 GraphQL/命令为完整可执行体；`<D1 id>` 等为运行时变量且每处均标注来源步骤（记录 `$env:D1`）。无 TBD/类似某任务。
3. **一致性**：券码/渠道 id/method id 命名统一（`$env:CODE`/`$env:PM_ID`/渠道 id）；redeem 金额 `6000` 分 = 报价 ¥60 一致；TC-IS-3 与设计文档资损点预案一致。
