# 微信小程序收款功能设计

日期：2026-10-06
状态：已批准（用户确认「批准，开始实施」）

## 背景与需求演进

用户最初提出「微信支付兜底方案」（未配置商户号时用收款码转账收款）。经澄清，需求收敛为：

- **不做兜底方案**。
- 小程序侧已有微信商户号，直接开发/完善**微信小程序真实收款**（JSAPI 支付）。
- 域名：`www.yourbao.cn`。
- 用户核心诉求：**在哪里配置、输入/上传什么、到哪里**（配置落地），并把支付闭环补完整。

## 现状盘点

已实现（无需改动）：

- 后端 `vendure/packages/wechatpay-plugin`：`wechatpay` PaymentMethodHandler 支持 JSAPI/NATIVE/APP/H5；`createPayment` JSAPI 分支返回完整签名参数（appId/timeStamp/nonceStr/package/signType/paySign）；`/wechatpay/notify` 回调验签解密并 `settlePayment`；多租户凭证走 cjk-plugin `getPaymentOverride`（渠道 `payConfig.wechatpay`，加密），无 override 时回退 PaymentMethod args；充值走 `wechatpayCreatePayment` bare payment + 结算注册表。
- 前端 `vshop`：`checkout.vue` `payCurrentOrder('wechatpay')` 携带 openid（`auth_openid` 存储 → metadata）→ `addPaymentToOrder` → `usePayment.ts handlePayment` → `wxRequestPayment`（uni.requestPayment）调起收银台；充值页、券商城同样接入。
- openid 推导：前端传入 → 客户档案 `wechatMiniOpenid`/`wechatOpenid` → devBypass 兜底（F-VS-08）。

缺口（本次补齐）：

1. `pay-result.vue` 的「支付成功」来自 URL `status=success` 写死参数，**不反映真实订单状态**：用户取消支付也显示成功；微信异步结算有延迟，页面无轮询确认。
2. 取消/未完成支付的订单缺少「继续支付」重试入口。

## 设计

### 1. 配置地图（不改代码，人工操作）

| # | 位置 | 输入/上传 | 产出/去向 |
|---|------|----------|----------|
| 1 | 微信商户平台 pay.weixin.qq.com | 注册商户号；产品中心→AppID 账号管理绑定小程序 AppID；账户中心→API 安全：设置 APIv3 密钥、申请 API 证书（下载商户私钥 apiclient_key.pem、记录证书序列号）、下载微信平台公钥 PEM | 5 项凭证：appId、mchId、apiKey、privateKey、publicKey、serialNo |
| 2 | Vendure Admin → Settings → Payment Methods | 创建/编辑 `wechatpay` 支付方式，填入上述凭证，`tradeType=JSAPI` | 后端下单取凭证 |
| 3 | Vendure Admin 渠道配置（多租户） | 渠道 customFields `payConfig.wechatpay` 填同套凭证 + `notifyUrl` | 优先级高于全局 PaymentMethod args |
| 4 | 回调地址 | `https://www.yourbao.cn/wechatpay/notify`（渠道 payConfig.notifyUrl 优先，env `WECHATPAY_NOTIFY_URL` 兜底） | 微信异步通知 → 自动结算 |
| 5 | 微信公众平台（小程序后台）→ 开发管理 → 开发设置 | request 合法域名加入 `https://www.yourbao.cn` | 小程序可请求后端 |
| 6 | 生产开关 | `WechatpayPlugin.init({ devBypass: false })`（生产必须关闭，否则仅模拟支付页） | 真实收款 |

### 2. pay-result 页真实状态轮询（新增）

`vshop/src/pkg-order/pages/pay-result.vue`：

- `onLoad` 保留现有 code/codes 解析与回填逻辑，初始状态改为 `pending`（不再信任 URL `status`）。
- 轮询：`setInterval` 3 秒，最多 20 次（60 秒窗口）。单订单用现有 `OrderByCode` 查询（`vshop/src/api/queries/order.ts` 的 `orderByCode(code)`）获取 `state`：
  - `PaymentSettled` / `Complete` / `Delivered` / `Shipped` → `status='success'`，停止轮询。
  - `ArrangingPayment` / `PaymentAuthorized` → 保持 `pending`（等待微信异步通知）。
  - `Cancelled` / 超时（20 次后仍未结算）→ 停止轮询，显示「支付确认中，如已扣款稍后自动到账」提示 + 「查看订单」入口；已取消订单显示失败态。
- 多订单（拆单）：轮询全部 codes，全部结算才算成功，任一仍待付显示 pending，页面列出逐单状态。
- 文案走现有页面内联中文（本页现状即内联文案，保持一致）。

### 3. 取消支付重试入口（复用现有能力）

- `pay-result.vue` 在轮询判定订单未结算（`pending` 态）时，把「查看订单」按钮文案强化为「继续支付」（或并列新增），点击跳转订单详情页。
- 订单详情页 `order-detail.vue` **已有**「去支付」按钮（`canPay` 含 `ArrangingPayment`，走 `goPay`），无需新增开发。

### 4. 后端改动

无。回调、验签、结算、多租户凭证均已具备。

## 错误处理

- 轮询查询失败（网络）：静默重试，不中断轮询；全部失败达上限走超时文案。
- 用户已扣款但回调未达（极端）：超时文案明确「如已扣款稍后自动到账」，订单详情可再查。
- 不引入新依赖。

## 测试与交付

1. 构建通过：`vshop` uni-app 编译（mp-weixin 目标）。
2. 真机验证：devBypass 关闭的生产配置下，0.01 元测试单完整走通 支付 → 回调 → Settled → 结果页轮询变绿；取消支付 → pending + 继续支付入口。
3. 手机视口截图（390×844, dpr=2，Playwright）：支付成功页、待确认页、继续支付入口。
4. 操作手册：新增「微信小程序收款配置」章节（商户平台步骤 → 后台录入 → 小程序域名 → 测试流程），补充截图。
5. 按工作流收尾：提交 → 推送（小程序代码需微信开发者工具上传发布，人工完成）。

## 不做的事

- 不做收款码兜底、不做第三方聚合支付接入。
- 不改后端插件代码。
- 不做自动对账/金额匹配。
