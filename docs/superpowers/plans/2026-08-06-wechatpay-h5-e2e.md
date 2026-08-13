# 微信支付 H5 端对端测试与全量修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 vshop H5 微信支付 Dev Bypass 端对端流程，同时全量修复 wechatpay-plugin 的通知验签、JSAPI 签名、退款多租户等问题。

**Architecture:** 扩展 WechatpayPluginOptions 增加 devBypass 字段，handler 内部判断跳过真实微信 API；controller 增加 dev-pay 模拟页面和 dev-notify 回调；前端修复 metadata 取值路径和签名参数传递。

**Tech Stack:** Vendure 3.6.4, TypeScript, wechatpay-node-v3@2.2.1, Vue 3 + UniApp H5

**Spec:** `e:\code\vshop\docs\superpowers\specs\2026-08-06-wechatpay-h5-e2e-design.md`

---

## File Structure

| 文件 | 路径 | 变更 |
|------|------|------|
| types.ts | `vendure/packages/wechatpay-plugin/src/types.ts` | 修改：增加 devBypass 字段 |
| wechatpay-handler.ts | `vendure/packages/wechatpay-plugin/src/wechatpay-handler.ts` | 修改：devBypass + JSAPI 签名 + 退款修复 |
| wechatpay.controller.ts | `vendure/packages/wechatpay-plugin/src/wechatpay.controller.ts` | 修改：V3 验签 + dev-pay + dev-notify |
| plugin.ts | `vendure/packages/wechatpay-plugin/src/plugin.ts` | 修改：OnApplicationBootstrap + PaymentMethod 创建 |
| dev-config.ts | `vendure/packages/dev-server/dev-config.ts` | 修改：DEV_BYPASS_WECHATPAY 条件 |
| .env.example | `vendure/packages/dev-server/.env.example` | 修改：增加微信支付变量 |
| .env | `vendure/packages/dev-server/.env` | 修改：设置 DEV_BYPASS_WECHATPAY=true |
| platform.ts | `vshop/src/utils/platform.ts` | 修改：wxRequestPayment 签名参数 |
| usePayment.ts | `vshop/src/composables/usePayment.ts` | 修改：H5 URL 拼接 + JSAPI 参数 |
| checkout.vue | `vshop/src/pkg-order/pages/checkout.vue` | 修改：openid metadata + payments 取值 |

---

### Task 1: 后端 — types.ts 增加 devBypass 字段

**Files:**
- Modify: `e:\code\vendure\packages\wechatpay-plugin\src\types.ts`

- [ ] **Step 1: 修改 types.ts**

```typescript
export interface WechatpayPluginOptions {
    notifyUrl: string;
    certPath?: string;
    certBuffer?: Buffer;
    devBypass?: boolean;
    devBypassOpenid?: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd e:\code\vendure && git add packages/wechatpay-plugin/src/types.ts && git commit -m "feat(wechatpay): add devBypass options to WechatpayPluginOptions"
```

---

### Task 2: 后端 — wechatpay-handler.ts 全量修复

**Files:**
- Modify: `e:\code\vendure\packages\wechatpay-plugin\src\wechatpay-handler.ts`

- [ ] **Step 1: 在文件头部增加 crypto import**

在 `import WxPay from 'wechatpay-node-v3';` 之后增加：

```typescript
import * as crypto from 'crypto';
```

- [ ] **Step 2: createPayment 方法开头增加 devBypass 分支**

在 `async createPayment(ctx, order, amount, args, metadata, method) {` 之后、`try {` 之前增加：

```typescript
        // Dev Bypass: 跳过真实微信 API 调用
        if (options.devBypass) {
            const devPayUrl = `/wechatpay/dev-pay?orderCode=${order.code}`;
            return {
                amount,
                state: 'Authorized' as const,
                transactionId: `DEV-WECHATPAY-${order.code}`,
                metadata: { payUrl: devPayUrl, payType: 'dev-h5' },
            };
        }
```

- [ ] **Step 3: 修改 JSAPI 分支，增加签名参数生成**

找到 JSAPI 分支（`const result = await pay.transactions_jsapi`），替换为：

```typescript
                // JSAPI (default)
                const result = await pay.transactions_jsapi({ ...baseParams, payer: { openid: openid || '' } });
                const prepayId = (result as any).data?.prepay_id;
                const jsapiAppId = override?.appId || args.appId;
                const jsapiTimeStamp = String(Math.floor(Date.now() / 1000));
                const jsapiNonceStr = Math.random().toString(36).substring(2, 34);
                const jsapiPackage = `prepay_id=${prepayId}`;
                const privateKeyBuf = Buffer.from(override?.privateKey || args.privateKey);
                const signContent = `${jsapiAppId}\n${jsapiTimeStamp}\n${jsapiNonceStr}\n${jsapiPackage}\n`;
                const paySign = crypto.sign('RSA-SHA256', Buffer.from(signContent), {
                    key: privateKeyBuf,
                }).toString('base64');
                return { amount, state: 'Authorized' as const, transactionId: `WECHATPAY-${order.code}`,
                    metadata: {
                        prepayId, payType: 'jsapi', appId: jsapiAppId,
                        timeStamp: jsapiTimeStamp, nonceStr: jsapiNonceStr,
                        package: jsapiPackage, signType: 'RSA', paySign,
                    } };
```

- [ ] **Step 4: 修改 createRefund 方法，增加多租户 override**

找到 `async createRefund` 方法，在 `const pay = new WxPay({` 之前增加 override 逻辑：

```typescript
        try {
                const override = getPaymentOverride(ctx, 'wechatpay') as WechatpayCredentials | null;
                const pay = new WxPay({
                    appid: override?.appId || args.appId,
                    mchid: override?.mchId || args.mchId,
                    publicKey: Buffer.from(override?.publicKey || args.publicKey),
                    privateKey: Buffer.from(override?.privateKey || args.privateKey),
                    key: override?.apiKey || args.apiKey,
                    serial_no: override?.serialNo || args.serialNo,
                });
```

（注意：原有的 `const pay = new WxPay({` 和后续退款逻辑保持不变，仅替换 WxPay 构造参数部分）

- [ ] **Step 5: Commit**

```bash
cd e:\code\vendure && git add packages/wechatpay-plugin/src/wechatpay-handler.ts && git commit -m "feat(wechatpay): add devBypass, JSAPI signature, refund multi-tenant fix"
```

---

### Task 3: 后端 — wechatpay.controller.ts V3 验签 + Dev Bypass 端点

**Files:**
- Modify: `e:\code\vendure\packages\wechatpay-plugin\src\wechatpay.controller.ts`

- [ ] **Step 1: 修改 imports，增加 Get、PaymentMethodService、getPaymentOverride、WxPay**

```typescript
import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger, OrderService, ChannelService, RequestContext, PaymentMethodService } from '@vendure/core';
import { getPaymentOverride } from '@vendure/cjk-plugin';
import WxPay from 'wechatpay-node-v3';

import { WECHATPAY_PLUGIN_OPTIONS, loggerCtx } from './constants';
import { WechatpayPluginOptions } from './types';
```

- [ ] **Step 2: 修改 constructor，注入 PaymentMethodService**

```typescript
    constructor(
        @Inject(WECHATPAY_PLUGIN_OPTIONS) private options: WechatpayPluginOptions,
        private orderService: OrderService,
        private channelService: ChannelService,
        private paymentMethodService: PaymentMethodService,
    ) {}
```

- [ ] **Step 3: 增加 settleOrderPayment 共享方法**

在 constructor 之后增加：

```typescript
    /** 结算订单支付（dev-notify 和 notify 共用） */
    private async settleOrderPayment(orderCode: string): Promise<void> {
        const channel = await this.channelService.getDefaultChannel();
        const ctx = new RequestContext({ apiType: 'admin', channel, isAuthorized: true });
        const order = await this.orderService.findOneByCode(ctx, orderCode);
        if (!order || !order.active) return;
        const payments = order.payments || [];
        for (const payment of payments) {
            if (payment.state === 'Authorized') {
                await this.orderService.settlePayment(ctx, payment.id);
                Logger.info(`Settled payment ${payment.id} for order ${orderCode}`, loggerCtx);
            }
        }
    }
```

- [ ] **Step 4: 替换 notify 方法为 V3 验签解密版本**

```typescript
    @Post('notify')
    async notify(@Req() req: Request, @Res() res: Response, @Body() body: any) {
        try {
            const timestamp = req.headers['wechatpay-timestamp'] as string;
            const nonce = req.headers['wechatpay-nonce'] as string;
            const signature = req.headers['wechatpay-signature'] as string;
            const serial = req.headers['wechatpay-serial'] as string;

            // 用默认 channel 的 PaymentMethod 构造 WxPay
            const channel = await this.channelService.getDefaultChannel();
            const ctx = new RequestContext({ apiType: 'admin', channel, isAuthorized: true });
            const override = getPaymentOverride(ctx, 'wechatpay');
            const pms = await this.paymentMethodService.findAll(ctx);
            const pm = pms.items.find(p => p.code === 'wechatpay');
            const pmArgs = pm?.handler?.args || [];
            const getArg = (name: string) => pmArgs.find(a => a.name === name)?.value || '';
            const apiKey = override?.apiKey || getArg('apiKey');

            const pay = new WxPay({
                appid: override?.appId || getArg('appId'),
                mchid: override?.mchId || getArg('mchId'),
                publicKey: Buffer.from(override?.publicKey || getArg('publicKey')),
                privateKey: Buffer.from(override?.privateKey || getArg('privateKey')),
                key: apiKey,
                serial_no: override?.serialNo || getArg('serialNo'),
            });

            // 验签
            const bodyStr = JSON.stringify(body);
            const verified = pay.verifySign({ timestamp, nonce, body: bodyStr, serial, signature, apiSecret: apiKey });
            if (!verified) {
                Logger.warn('WeChat Pay notify signature verification failed', loggerCtx);
                return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
            }

            // AES-GCM 解密
            const resource = body?.resource;
            const decrypted = pay.decipher_gcm(
                resource.ciphertext,
                resource.associated_data,
                resource.nonce,
            );

            if (body?.event_type === 'TRANSACTION.SUCCESS') {
                const outTradeNo = decrypted.out_trade_no;
                Logger.info(`WeChat Pay trade success: ${outTradeNo}`, loggerCtx);
                await this.settleOrderPayment(outTradeNo);
            }

            res.status(200).json({ code: 'SUCCESS', message: 'OK' });
        } catch (e: any) {
            Logger.error(`WeChat Pay notify error: ${e.message}`, loggerCtx);
            res.status(500).json({ code: 'FAIL', message: e.message });
        }
    }
```

- [ ] **Step 5: 增加 dev-pay 模拟支付页面端点**

```typescript
    @Get('dev-pay')
    getDevPayPage(@Req() req: Request, @Res() res: Response) {
        const orderCode = (req.query as any).orderCode as string;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>模拟微信支付</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;">
<h2>模拟微信支付</h2>
<p>订单号: ${orderCode}</p>
<button id="payBtn" onclick="pay()" style="padding:12px 40px;font-size:16px;background:#07c160;color:#fff;border:none;border-radius:4px;cursor:pointer;">模拟支付成功</button>
<p id="result"></p>
<script>
async function pay(){
  document.getElementById('payBtn').disabled=true;
  document.getElementById('payBtn').textContent='处理中...';
  try{
    const res=await fetch('/wechatpay/dev-notify?orderCode=${orderCode}',{method:'POST'});
    const data=await res.json();
    if(data.code==='SUCCESS'){
      document.body.innerHTML='<h2 style="color:#07c160">✓ 支付成功</h2><p>订单: ${orderCode}</p><a href="http://localhost:5180/#/pkg-order/pages/pay-result?code=${orderCode}&status=success" style="color:#07c160">返回商城查看订单</a>';
    }else{
      document.getElementById('result').textContent='支付失败: '+data.message;
      document.getElementById('payBtn').disabled=false;
      document.getElementById('payBtn').textContent='模拟支付成功';
    }
  }catch(e){
    document.getElementById('result').textContent='请求失败: '+e.message;
    document.getElementById('payBtn').disabled=false;
    document.getElementById('payBtn').textContent='模拟支付成功';
  }
}
</script>
</body></html>`);
    }
```

- [ ] **Step 6: 增加 dev-notify 自动回调端点**

```typescript
    @Post('dev-notify')
    async devNotify(@Req() req: Request, @Res() res: Response) {
        const orderCode = (req.query as any).orderCode as string;
        try {
            await this.settleOrderPayment(orderCode);
            res.json({ code: 'SUCCESS', message: 'OK' });
        } catch (e: any) {
            Logger.error(`Dev notify error for ${orderCode}: ${e.message}`, loggerCtx);
            res.status(500).json({ code: 'FAIL', message: e.message });
        }
    }
```

- [ ] **Step 7: Commit**

```bash
cd e:\code\vendure && git add packages/wechatpay-plugin/src/wechatpay.controller.ts && git commit -m "feat(wechatpay): V3 verify+decrypt, dev-pay page, dev-notify endpoint"
```

---

### Task 4: 后端 — plugin.ts 增加 OnApplicationBootstrap

**Files:**
- Modify: `e:\code\vendure\packages\wechatpay-plugin\src\plugin.ts`

- [ ] **Step 1: 修改 imports**

```typescript
import { Inject, Type, OnApplicationBootstrap } from '@nestjs/common';
import { Logger, PluginCommonModule, VendurePlugin, PaymentMethodService, ChannelService, RequestContext } from '@vendure/core';
```

- [ ] **Step 2: 修改 WechatpayPlugin 类，实现 OnApplicationBootstrap**

```typescript
export class WechatpayPlugin implements OnApplicationBootstrap {
    private static options: WechatpayPluginOptions;

    constructor(
        @Inject(WECHATPAY_PLUGIN_OPTIONS) private options: WechatpayPluginOptions,
        private paymentMethodService: PaymentMethodService,
        private channelService: ChannelService,
    ) {}

    static init(options: WechatpayPluginOptions): Type<WechatpayPlugin> {
        WechatpayPlugin.options = options;
        return WechatpayPlugin;
    }

    async onApplicationBootstrap() {
        if (!this.options.devBypass) return;
        try {
            const channel = await this.channelService.getDefaultChannel();
            const ctx = new RequestContext({ apiType: 'admin', channel, isAuthorized: true });
            const existing = await this.paymentMethodService.findAll(ctx);
            const hasWechatpay = existing.items.some(p => p.code === 'wechatpay');
            if (!hasWechatpay) {
                await this.paymentMethodService.create(ctx, {
                    code: 'wechatpay',
                    name: '微信支付',
                    enabled: true,
                    handler: { code: 'wechatpay', arguments: [] },
                });
                Logger.info('[WechatpayPlugin] Created wechatpay PaymentMethod (devBypass)', loggerCtx);
            }
        } catch (e: any) {
            Logger.error(`Failed to create wechatpay PaymentMethod: ${e.message}`, loggerCtx);
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
cd e:\code\vendure && git add packages/wechatpay-plugin/src/plugin.ts && git commit -m "feat(wechatpay): auto-create PaymentMethod on devBypass bootstrap"
```

---

### Task 5: 后端 — dev-config.ts + .env 配置

**Files:**
- Modify: `e:\code\vendure\packages\dev-server\dev-config.ts`
- Modify: `e:\code\vendure\packages\dev-server\.env.example`
- Modify: `e:\code\vendure\packages\dev-server\.env` (if exists)

- [ ] **Step 1: 修改 dev-config.ts 中的 WechatpayPlugin 初始化**

找到 `...(process.env.WECHATPAY_NOTIFY_URL ?` 部分，替换为：

```typescript
        ...((process.env.WECHATPAY_NOTIFY_URL || process.env.DEV_BYPASS_WECHATPAY === 'true') ? [WechatpayPlugin.init({
            notifyUrl: process.env.WECHATPAY_NOTIFY_URL || '',
            devBypass: process.env.DEV_BYPASS_WECHATPAY === 'true',
            devBypassOpenid: 'dev_test_openid',
        })] : []),
```

- [ ] **Step 2: 在 .env.example 末尾增加微信支付变量**

```env

# === 微信支付 ===
WECHATPAY_NOTIFY_URL=
DEV_BYPASS_WECHATPAY=false
```

- [ ] **Step 3: 在 .env 中设置 DEV_BYPASS_WECHATPAY=true**

检查 `e:\code\vendure\packages\dev-server\.env` 是否存在。如果存在，追加或修改：

```env
DEV_BYPASS_WECHATPAY=true
```

- [ ] **Step 4: Commit**

```bash
cd e:\code\vendure && git add packages/dev-server/dev-config.ts packages/dev-server/.env.example && git commit -m "feat(wechatpay): enable DEV_BYPASS_WECHATPAY in dev-config"
```

---

### Task 6: 构建插件并重启 Vendure

- [ ] **Step 1: 构建 wechatpay-plugin**

```bash
cd e:\code\vendure\packages\wechatpay-plugin && npm run build
```

Expected: 编译成功，无错误

- [ ] **Step 2: 停止当前 Vendure 进程**

使用 StopCommand 停止之前的 vendure dev:server 进程

- [ ] **Step 3: 重启 Vendure**

```bash
cd e:\code\vendure\packages\dev-server && npm run dev:server
```

- [ ] **Step 4: 验证日志输出**

Expected 日志包含：
- `[WechatpayPlugin] Created wechatpay PaymentMethod (devBypass)` (首次启动)
- `Vendure server (v3.6.4) now running on port 3000`

- [ ] **Step 5: 通过 Admin API 验证 PaymentMethod 存在**

```bash
curl -s -X POST http://localhost:3000/admin-api -H "Content-Type: application/json" -d "{\"query\":\"mutation{login(username:\\\"superadmin\\\",password:\\\"superadmin\\\"){...on CurrentUser{identifier}}}\"}"
```

提取 token 后：
```bash
curl -s -X POST http://localhost:3000/admin-api -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"query\":\"{paymentMethods{items{id code name enabled}}}\"}"
```

Expected: 列表中包含 `code: "wechatpay"`, `enabled: true`

---

### Task 7: 前端 — platform.ts 修改 wxRequestPayment

**Files:**
- Modify: `e:\code\vshop\src\utils\platform.ts`

- [ ] **Step 1: 替换 wxRequestPayment 函数**

找到现有的 `export function wxRequestPayment(prepayId: string): Promise<void>`，替换为：

```typescript
/** WeChat JSAPI payment (mini-program) - requires server-generated signature params */
export function wxRequestPayment(params: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
}): Promise<void> {
    return new Promise((resolve, reject) => {
        // #ifdef MP-WEIXIN
        uni.requestPayment({
            provider: "wxpay",
            timeStamp: params.timeStamp,
            nonceStr: params.nonceStr,
            package: params.package,
            signType: params.signType as "MD5" | "RSA",
            paySign: params.paySign,
            success: () => resolve(),
            fail: (err: any) => reject(err),
        });
        // #endif
        // #ifndef MP-WEIXIN
        reject(new Error("WeChat payment only available in mini-program"));
        // #endif
    });
}
```

- [ ] **Step 2: Commit**

```bash
cd e:\code\vshop && git add src/utils/platform.ts && git commit -m "fix(wechatpay): wxRequestPayment accepts server signature params"
```

---

### Task 8: 前端 — usePayment.ts 修复

**Files:**
- Modify: `e:\code\vshop\src\composables\usePayment.ts`

- [ ] **Step 1: 替换 wechatpay case 的 H5 分支**

找到 `case "wechatpay":` 中的 `if (platform === "h5")` 分支，替换为：

```typescript
            } else if (platform === "h5") {
                // WeChat H5 payment - redirect
                const rawUrl = paymentData.h5Url
                    || paymentData.metadata?.h5Url
                    || paymentData.metadata?.payUrl;
                if (rawUrl) {
                    const fullUrl = rawUrl.startsWith('/')
                        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${rawUrl}`
                        : rawUrl;
                    redirectPayment(fullUrl);
                    return { success: true, message: "请在微信中完成支付" };
                }
                return { success: false, message: "未获取到支付链接" };
```

- [ ] **Step 2: 替换 wechatpay case 的 mp-weixin 分支**

找到 `if (platform === "mp-weixin")` 分支，替换为：

```typescript
            if (platform === "mp-weixin") {
                // WeChat JSAPI payment in mini-program
                try {
                    const m = paymentData.metadata || paymentData;
                    await wxRequestPayment({
                        timeStamp: m.timeStamp,
                        nonceStr: m.nonceStr,
                        package: m.package,
                        signType: m.signType,
                        paySign: m.paySign,
                    });
                    return { success: true, orderCode: paymentData.orderCode };
                } catch (e: any) {
                    return { success: false, message: e.errMsg || "支付取消" };
                }
            }
```

- [ ] **Step 3: Commit**

```bash
cd e:\code\vshop && git add src/composables/usePayment.ts && git commit -m "fix(wechatpay): H5 URL concatenation + JSAPI signature params"
```

---

### Task 9: 前端 — checkout.vue 修复

**Files:**
- Modify: `e:\code\vshop\src\pkg-order\pages\checkout.vue`

- [ ] **Step 1: 修改 submitOrder 中的 addPaymentToOrder 调用，传递 metadata**

找到 `const payRes: any = await addPaymentToOrder(selectedPayment.value);`，替换为：

```typescript
        // Add payment
        const paymentMetadata: Record<string, any> = {};
        if (selectedPayment.value === 'wechatpay') {
            const openid = uni.getStorageSync('auth_openid');
            if (openid) paymentMetadata.openid = openid;
        }
        const payRes: any = await addPaymentToOrder(selectedPayment.value, paymentMetadata);
```

- [ ] **Step 2: 修改支付结果处理，从 payments 数组取 metadata**

找到 `const order = payRes.addPaymentToOrder;` 及后续的 handlePayment 调用，替换为：

```typescript
        const order = payRes.addPaymentToOrder;
        if (order?.state === 'PaymentSettled' || order?.state === 'PaymentAuthorized') {
            // 余额支付/货到付款等直接结算的情况
            uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + order.code + '&status=success' });
        } else {
            // 从 payments 数组取最新 payment 的 metadata
            const lastPayment = order?.payments?.[order.payments.length - 1];
            const result = await handlePayment(selectedPayment.value as PaymentMethod, {
                ...lastPayment,
                orderCode: order?.code,
                orderState: order?.state,
            });
            if (result.success) {
                uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + (order?.code || '') + '&status=success' });
            } else {
                uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + (order?.code || '') + '&status=pending' });
            }
        }
```

- [ ] **Step 3: Commit**

```bash
cd e:\code\vshop && git add src/pkg-order/pages/checkout.vue && git commit -m "fix(wechatpay): pass openid metadata + extract payment from array"
```

---

### Task 10: 端对端浏览器测试

- [ ] **Step 1: 确保 vshop dev server 运行中**

vshop 应已在 `http://localhost:5180` 运行

- [ ] **Step 2: 确保 Vendure 运行中**

Vendure 应已在 `http://localhost:3000` 运行，日志显示 wechatpay PaymentMethod 已创建

- [ ] **Step 3: 编写并运行 E2E 测试脚本**

创建临时测试脚本 `e:\code\test_wechatpay_e2e.py`:

```python
"""E2E test for wechatpay dev bypass flow."""
from playwright.sync_api import sync_playwright
import requests, json

# 1. 验证 wechatpay PaymentMethod 存在
print("=== 1. Verify wechatpay PaymentMethod ===")
r = requests.post("http://localhost:3000/admin-api", json={
    "query": 'mutation { login(username: "superadmin", password: "superadmin") { ...on CurrentUser { identifier } } }'
})
token = r.headers.get('vendure-auth-token')
r = requests.post("http://localhost:3000/admin-api",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    json={"query": "{ paymentMethods { items { id code name enabled } } }"})
pms = r.json()['data']['paymentMethods']['items']
wechatpay = [p for p in pms if p['code'] == 'wechatpay']
assert wechatpay, "wechatpay PaymentMethod not found!"
print(f"OK: wechatpay PaymentMethod exists: {wechatpay}")

# 2. 浏览器测试
print("\n=== 2. Browser E2E test ===")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, channel="chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 375, "height": 812})

    # 打开 vshop 首页
    page.goto("http://localhost:5180", wait_until="networkidle")
    page.wait_for_timeout(2000)
    print(f"Homepage loaded: {page.title()}")

    # 点击第一个商品
    page.screenshot(path="e:/code/test_01_home.png")

    # 加商品到购物车
    first_product = page.locator("text=+").first
    if first_product.is_visible():
        first_product.click()
        page.wait_for_timeout(1000)
        print("Added product to cart")

    # 去购物车
    page.goto("http://localhost:5180/#/pages/cart/index", wait_until="networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path="e:/code/test_02_cart.png")

    # 去结算
    checkout_btn = page.locator("text=结算").first
    if checkout_btn.is_visible():
        checkout_btn.click()
        page.wait_for_timeout(2000)
        print("Navigated to checkout")
    else:
        page.goto("http://localhost:5180/#/pkg-order/pages/checkout", wait_until="networkidle")
        page.wait_for_timeout(2000)

    page.screenshot(path="e:/code/test_03_checkout.png")
    print(f"Checkout page: {page.url}")

    # 检查支付方式列表
    body = page.inner_text("body")
    print(f"Payment methods visible: {'微信支付' in body or 'wechatpay' in body}")

    # 选择微信支付
    wechatpay_radio = page.locator("text=微信支付").first
    if wechatpay_radio.is_visible():
        wechatpay_radio.click()
        page.wait_for_timeout(500)
        print("Selected wechatpay")

    # 截图支付方式
    page.screenshot(path="e:/code/test_04_payment_methods.png")

    # 提交订单
    submit_btn = page.locator("text=提交订单").first
    if submit_btn.is_visible():
        submit_btn.click()
        page.wait_for_timeout(3000)
        print(f"After submit, URL: {page.url}")
        page.screenshot(path="e:/code/test_05_after_submit.png")

        # 检查是否跳转到 dev-pay 页面
        if "dev-pay" in page.url or "wechatpay" in page.url:
            print("OK: Redirected to dev-pay page")
            page.screenshot(path="e:/code/test_06_devpay.png")

            # 点击模拟支付成功按钮
            pay_btn = page.locator("text=模拟支付成功").first
            if pay_btn.is_visible():
                pay_btn.click()
                page.wait_for_timeout(3000)
                print("Clicked simulate pay button")
                page.screenshot(path="e:/code/test_07_pay_success.png")

                body = page.inner_text("body")
                if "支付成功" in body:
                    print("OK: Payment success!")
                else:
                    print(f"Payment result: {body[:200]}")
        else:
            print(f"Not redirected to dev-pay. Current URL: {page.url}")
            body = page.inner_text("body")
            print(f"Body: {body[:500]}")

    browser.close()

print("\n=== E2E test completed ===")
```

- [ ] **Step 4: 运行测试脚本**

```bash
cd e:\code && python test_wechatpay_e2e.py
```

- [ ] **Step 5: 检查测试截图**

查看 `test_01_home.png` 到 `test_07_pay_success.png`，验证每步流程

- [ ] **Step 6: 根据测试结果修复问题**

如果测试中发现错误，分析并修复，重新构建插件、重启服务、重新测试

- [ ] **Step 7: 清理测试文件**

```bash
del e:\code\test_wechatpay_e2e.py e:\code\test_0*.png
```

- [ ] **Step 8: Final commit**

```bash
cd e:\code\vendure && git add -A && git commit -m "fix(wechatpay): E2E test passed, all fixes verified"
cd e:\code\vshop && git add -A && git commit -m "fix(wechatpay): E2E test passed, all fixes verified"
```
