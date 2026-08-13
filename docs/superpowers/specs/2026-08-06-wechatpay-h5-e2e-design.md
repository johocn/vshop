# 微信支付 H5 端对端测试与全量修复设计

## 概述

vshop H5 环境与 Vendure wechatpay-plugin 对接，实现 Dev Bypass 模式下的端对端支付流程测试，同时全量修复微信支付链路中的所有已知问题。

## 现状问题

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| 1 | 通知回调未验签、未解密 | `wechatpay.controller.ts` 直接读 `ciphertext.out_trade_no`，V3 通知的 ciphertext 是 AES-GCM 密文 | 严重 |
| 2 | H5 支付插件未启用 | dev-config 要求 `WECHATPAY_NOTIFY_URL` 才加载，`.env` 未配置 | 阻断 |
| 3 | JSAPI openid 链路断裂 | 前端 `addPaymentToOrder` 未传 metadata.openid | 严重 |
| 4 | JSAPI 签名参数缺失 | 后端只返回 prepayId，未返回 timeStamp/nonceStr/paySign | 严重 |
| 5 | 退款未用多租户凭证 | createRefund 直接用全局 args 而非 channel override | 中等 |
| 6 | 前端取值路径错误 | `usePayment.ts` 从 order 根取 metadata，实际在 `order.payments[N].metadata` | 严重 |
| 7 | PaymentMethod 不存在 | 数据库无 code='wechatpay' 的 PaymentMethod 记录 | 阻断 |
| 8 | .env.example 缺失变量 | WECHATPAY_NOTIFY_URL 未声明 | 低 |

## 方案选择

采用方案 A：扩展 WechatpayPluginOptions，沿用 AlipayPlugin 的 devBypass 模式。

- 在 `WechatpayPluginOptions` 增加 `devBypass` 和 `devBypassOpenid` 字段
- `createPayment` 内部判断 devBypass 时跳过真实 WxPay 调用，返回 mock h5_url
- Controller 增加 dev-pay 模拟页面和 dev-notify 自动回调
- 生产环境代码路径不变，仅增加 devBypass early return

## 后端设计

### 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `wechatpay-plugin/src/types.ts` | 修改 | 增加 devBypass、devBypassOpenid 字段 |
| `wechatpay-plugin/src/wechatpay-handler.ts` | 修改 | devBypass 分支 + JSAPI 签名 + 退款多租户修复 |
| `wechatpay-plugin/src/wechatpay.controller.ts` | 修改 | V3 验签解密 + dev-pay 页面 + dev-notify 回调 + PaymentMethod 自动创建 |
| `dev-server/dev-config.ts` | 修改 | 增加 DEV_BYPASS_WECHATPAY 条件加载 |
| `dev-server/.env.example` | 修改 | 增加 WECHATPAY 环境变量 |

### types.ts 变更

```typescript
export interface WechatpayPluginOptions {
    notifyUrl: string;
    certPath?: string;
    certBuffer?: Buffer;
    devBypass?: boolean;
    devBypassOpenid?: string;
}
```

### wechatpay-handler.ts 变更

#### devBypass createPayment

createPayment 方法开头增加 devBypass 判断：

```typescript
async createPayment(ctx, order, amount, args, metadata, method) {
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
    // ... 原有真实支付逻辑
}
```

#### JSAPI 签名生成

JSAPI 分支拿到 prepay_id 后，用商户私钥生成完整签名参数：

```typescript
const result = await pay.transactions_jsapi({ ...baseParams, payer: { openid: openid || '' } });
const prepayId = (result as any).data?.prepay_id;
const appId = override?.appId || args.appId;
const timeStamp = String(Math.floor(Date.now() / 1000));
const nonceStr = Math.random().toString(36).substring(2, 34);
const packageStr = `prepay_id=${prepayId}`;

// RSA-SHA256 签名
const sign = crypto.sign('RSA-SHA256',
    Buffer.from(`${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`),
    privateKeyBuffer
);
const paySign = sign.toString('base64');

return {
    amount,
    state: 'Authorized' as const,
    transactionId: `WECHATPAY-${order.code}`,
    metadata: {
        prepayId, payType: 'jsapi', appId,
        timeStamp, nonceStr, package: packageStr,
        signType: 'RSA', paySign,
    },
};
```

#### 退款多租户修复

createRefund 方法增加 override 逻辑：

```typescript
async createRefund(ctx, input, amount, order, payment, args, method) {
    const override = getPaymentOverride(ctx, 'wechatpay') as WechatpayCredentials | null;
    const pay = new WxPay({
        appid: override?.appId || args.appId,
        mchid: override?.mchId || args.mchId,
        publicKey: Buffer.from(override?.publicKey || args.publicKey),
        privateKey: Buffer.from(override?.privateKey || args.privateKey),
        key: override?.apiKey || args.apiKey,
        serial_no: override?.serialNo || args.serialNo,
    });
    // ... 原有退款逻辑
}
```

### wechatpay.controller.ts 变更

Controller 需新增注入 `PaymentMethodService`，用于查询 PaymentMethod args 构造 WxPay 实例。

#### 共享辅助方法

```typescript
/** 结算订单支付（dev-notify 和 notify 都调用） */
private async settleOrderPayment(orderCode: string): Promise<void> {
    const channel = await this.channelService.getDefaultChannel();
    const ctx = new RequestContext({ apiType: 'admin', channel, isAuthorized: true });
    const order = await this.orderService.findOneByCode(ctx, orderCode);
    if (!order || !order.active) return;
    const payments = order.payments || [];
    for (const payment of payments) {
        if (payment.state === 'Authorized') {
            await this.orderService.settlePayment(ctx, payment.id);
        }
    }
}
```

注意：notify 端点存在先有鸡还是先有蛋问题——out_trade_no 在加密密文中，解密需要 apiKey，但 apiKey 属于哪个 channel 需要 orderCode。当前方案使用默认 channel 的 PaymentMethod 解密。多租户多商户号场景下需遍历各 channel 尝试解密，但当前设计暂不处理此边缘场景。

#### V3 通知验签 + AES-GCM 解密（生产环境）

使用 wechatpay-node-v3 SDK 的 `verifySign` 和 `decipher_gcm` 方法。
注意：验签前需确保 SDK 已加载平台证书（`fetchCertificates`），`verifySign` 内部会自动拉取。

```typescript
@Post('notify')
async notify(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    try {
        const { 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce,
                'wechatpay-signature': signature, 'wechatpay-serial': serial } = req.headers;

        // 1. 先解密 resource 获取 out_trade_no（需要 apiKey）
        const resource = body?.resource;
        // 临时用默认 channel 的 PaymentMethod args 构造 WxPay
        const channel = await this.channelService.getDefaultChannel();
        const ctx = new RequestContext({ apiType: 'admin', channel, isAuthorized: true });
        const override = getPaymentOverride(ctx, 'wechatpay');
        const pms = await this.paymentMethodService.findAll(ctx);
        const pm = pms.items.find(p => p.code === 'wechatpay');
        const args = pm?.handler?.args || [];
        const getArg = (name: string) => args.find(a => a.name === name)?.value || '';
        const apiKey = override?.apiKey || getArg('apiKey');

        const pay = new WxPay({
            appid: override?.appId || getArg('appId'),
            mchid: override?.mchId || getArg('mchId'),
            publicKey: Buffer.from(override?.publicKey || getArg('publicKey')),
            privateKey: Buffer.from(override?.privateKey || getArg('privateKey')),
            key: apiKey, serial_no: override?.serialNo || getArg('serialNo'),
        });

        // 2. 验签
        const bodyStr = JSON.stringify(body);
        const verified = pay.verifySign({ timestamp, nonce, body: bodyStr, serial, signature, apiSecret: apiKey });
        if (!verified) {
            return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
        }

        // 3. AES-GCM 解密
        const decrypted = pay.decipher_gcm(
            resource.ciphertext, resource.associated_data, resource.nonce
        );

        // 4. 处理支付结果
        if (body?.event_type === 'TRANSACTION.SUCCESS') {
            await this.settleOrderPayment(decrypted.out_trade_no);
        }

        res.status(200).json({ code: 'SUCCESS', message: 'OK' });
    } catch (e) {
        res.status(500).json({ code: 'FAIL', message: e.message });
    }
}
```

#### Dev Bypass 模拟支付页面

```typescript
@Get('dev-pay')
getDevPayPage(@Req() req: Request, @Res() res: Response) {
    const orderCode = req.query.orderCode as string;
    // 返回简单 HTML 页面
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <html>
        <head><meta charset="utf-8"><title>模拟微信支付</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2>模拟微信支付</h2>
            <p>订单号: ${orderCode}</p>
            <button onclick="pay()" style="padding:12px 40px;font-size:16px;
                background:#07c160;color:#fff;border:none;border-radius:4px;">
                模拟支付成功
            </button>
            <script>
                async function pay() {
                    const res = await fetch('/wechatpay/dev-notify?orderCode=${orderCode}', {
                        method: 'POST'
                    });
                    const data = await res.json();
                    if (data.code === 'SUCCESS') {
                        document.body.innerHTML =
                            '<h2 style="color:#07c160">支付成功</h2>' +
                            '<p>订单: ${orderCode}</p>' +
                            '<a href="/">返回商城</a>';
                    } else {
                        alert('支付失败: ' + data.message);
                    }
                }
            </script>
        </body>
        </html>
    `);
}
```

#### Dev Bypass 自动回调

```typescript
@Post('dev-notify')
async devNotify(@Req() req: Request, @Res() res: Response) {
    const orderCode = req.query.orderCode as string;
    try {
        await this.settleOrderPayment(orderCode);
        res.json({ code: 'SUCCESS', message: 'OK' });
    } catch (e) {
        res.status(500).json({ code: 'FAIL', message: e.message });
    }
}
```

#### PaymentMethod 自动创建

WechatpayPlugin 类需实现 `OnApplicationBootstrap` 接口，在启动时检查并创建：

```typescript
@VendurePlugin({
    imports: [PluginCommonModule],
    controllers: [WechatpayController],
    providers: [{ provide: WECHATPAY_PLUGIN_OPTIONS, useFactory: () => WechatpayPlugin.options }],
    configuration: config => { /* ... */ },
    compatibility: '^3.0.0',
})
export class WechatpayPlugin implements OnApplicationBootstrap {
    private static options: WechatpayPluginOptions;

    constructor(
        @Inject(WECHATPAY_PLUGIN_OPTIONS) private options: WechatpayPluginOptions,
        private paymentMethodService: PaymentMethodService,
        private channelService: ChannelService,
        private requestContextService: RequestContextService,
    ) {}

    async onApplicationBootstrap() {
        if (!this.options.devBypass) return;
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
    }
}
```

### dev-config.ts 变更

```typescript
// 当前:
...(process.env.WECHATPAY_NOTIFY_URL ? [WechatpayPlugin.init({
    notifyUrl: process.env.WECHATPAY_NOTIFY_URL,
})] : []),

// 修复后:
...((process.env.WECHATPAY_NOTIFY_URL || process.env.DEV_BYPASS_WECHATPAY === 'true')
    ? [WechatpayPlugin.init({
        notifyUrl: process.env.WECHATPAY_NOTIFY_URL || '',
        devBypass: process.env.DEV_BYPASS_WECHATPAY === 'true',
        devBypassOpenid: 'dev_test_openid',
    })] : []),
```

### .env.example 变更

```env
# === 微信支付 ===
WECHATPAY_NOTIFY_URL=
DEV_BYPASS_WECHATPAY=false
```

## 前端设计

### 文件变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `src/composables/usePayment.ts` | 修改 | H5 dev bypass URL 拼接 + JSAPI 签名参数传递 |
| `src/pkg-order/pages/checkout.vue` | 修改 | 传 openid metadata + 从 payments 数组取 metadata |
| `src/utils/platform.ts` | 修改 | wxRequestPayment 接收完整签名参数 |

### checkout.vue 变更

#### 传递 openid metadata

```typescript
const metadata: Record<string, any> = {};
if (selectedPayment.value === 'wechatpay') {
    const openid = uni.getStorageSync('auth_openid');
    if (openid) metadata.openid = openid;
}
const payRes: any = await addPaymentToOrder(selectedPayment.value, metadata);
```

#### 从 payments 数组取 metadata

```typescript
const order = payRes.addPaymentToOrder;
const lastPayment = order?.payments?.[order.payments.length - 1];
const result = await handlePayment(selectedPayment.value as PaymentMethod, {
    ...lastPayment,
    orderCode: order?.code,
    orderState: order?.state,
});
```

### usePayment.ts 变更

```typescript
case 'wechatpay':
    if (platform === 'h5') {
        const rawUrl = paymentData.h5Url
            || paymentData.metadata?.h5Url
            || paymentData.metadata?.payUrl;
        if (rawUrl) {
            const fullUrl = rawUrl.startsWith('/')
                ? `${import.meta.env.VITE_API_URL}${rawUrl}`
                : rawUrl;
            redirectPayment(fullUrl);
            return { success: true, message: '请在微信中完成支付' };
        }
        return { success: false, message: '未获取到支付链接' };
    }
    if (platform === 'mp-weixin') {
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
            return { success: false, message: e.errMsg || '支付取消' };
        }
    }
```

### platform.ts 变更

```typescript
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
            provider: 'wxpay',
            timeStamp: params.timeStamp,
            nonceStr: params.nonceStr,
            package: params.package,
            signType: params.signType as 'MD5' | 'RSA',
            paySign: params.paySign,
            success: () => resolve(),
            fail: (err: any) => reject(err),
        });
        // #endif
        // #ifndef MP-WEIXIN
        reject(new Error('WeChat payment only available in mini-program'));
        // #endif
    });
}
```

## 数据流

### H5 Dev Bypass 流程

```
vshop H5 checkout
  → addPaymentToOrder('wechatpay', {})
  → Vendure createPayment [devBypass=true]
    → 跳过 WxPay SDK
    → 返回 { state: 'Authorized', metadata: { payUrl: '/wechatpay/dev-pay?orderCode=xxx', payType: 'dev-h5' } }
  → 前端从 order.payments[last].metadata 取 payUrl
  → 拼接 http://localhost:3000/wechatpay/dev-pay?orderCode=xxx
  → redirectPayment(fullUrl)
  → 用户看到模拟支付页面，点击"模拟支付成功"
  → POST /wechatpay/dev-notify?orderCode=xxx
  → Controller 调用 settlePayment
  → 订单状态 → PaymentSettled
  → 页面显示"支付成功" + 返回链接
```

### H5 生产环境流程

```
vshop H5 checkout
  → addPaymentToOrder('wechatpay', {})
  → Vendure createPayment
    → WxPay.transactions_h5()
    → 返回 { state: 'Authorized', metadata: { payUrl: h5_url, payType: 'h5' } }
  → 前端 redirectPayment(h5_url)
  → 用户在微信内完成支付
  → 微信异步通知 POST /wechatpay/notify
    → V3 验签 (verifySign)
    → AES-GCM 解密 (decipher_gcm)
    → settlePayment
  → 订单状态 → PaymentSettled
```

## 端对端测试步骤

1. 修改 wechatpay-plugin 源码后执行 `npm run build`（在 `packages/wechatpay-plugin` 目录）
2. 在 dev-server `.env` 中设置 `DEV_BYPASS_WECHATPAY=true`
3. 重启 Vendure（`npm run dev:server`）
4. 验证日志输出 `[WechatpayPlugin] Created wechatpay PaymentMethod (devBypass)`
5. vshop H5 打开 → 加商品到购物车 → 结算
6. 选择"微信支付" → 提交订单
7. 验证跳转到模拟支付页面 `http://localhost:3000/wechatpay/dev-pay?orderCode=xxx`
8. 点击"模拟支付成功"按钮
9. 验证订单状态变为 PaymentSettled
10. 验证页面显示"支付成功"
11. 返回 vshop 验证订单状态

## 不变更项

- wechatpay-plugin 不新增 resolver（签名参数通过 createPayment metadata 返回）
- 不修改 cjk-plugin 的 payment-config（多租户凭证覆盖机制已正确）
- 不修改 ORDER_FRAGMENT（payments 已包含 metadata 字段）
- 不新增 npm 依赖（使用 wechatpay-node-v3 已有的 decipher_gcm / verifySign）
