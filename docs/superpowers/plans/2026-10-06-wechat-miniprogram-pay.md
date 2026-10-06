# 微信小程序收款 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 vshop 小程序微信收款闭环：pay-result 页按真实订单状态轮询确认支付结果，未支付订单提供继续支付入口；配置地图写入使用手册。

**Architecture:** 后端 wechatpay-plugin 已具备 JSAPI 下单/回调/结算能力，本次零后端改动。仅改 `pay-result.vue`：不再信任 URL `status` 参数，改用 `getOrderByCode` 轮询（3s × 20 次）真实订单状态，按状态映射展示成功/等待/失败，pending 态主按钮变「继续支付」跳订单详情（详情页已有「去支付」）。

**Tech Stack:** uni-app (Vue 3 + TS), Vendure Shop API (GraphQL `orderByCode`), 微信商户平台配置（人工步骤）。

**Spec:** `docs/superpowers/specs/2026-10-06-wechat-miniprogram-pay-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/pkg-order/pages/pay-result.vue` | 修改 | 支付结果页：轮询真实状态 + 继续支付入口 |
| `doc/使用手册.md` | 修改 | 新增「9. 微信小程序收款配置」章节 |
| `docs/superpowers/plans/2026-10-06-*_shot_pay_result.py`（临时脚本） | 创建 | 手机视口截图（验证后可删或留 docs/） |

---

### Task 1: pay-result 轮询真实状态 + 继续支付入口

**Files:**
- Modify: `src/pkg-order/pages/pay-result.vue`（整文件重写 script 与 template 按钮/提示区，style 追加两个类）

- [ ] **Step 1: 重写 pay-result.vue**

完整替换后的文件内容：

```vue
<template>
  <view class="pay-result">
    <view class="pay-result__icon">
      <text v-if="status === 'success'" style="font-size: 120rpx;">✅</text>
      <text v-else-if="status === 'pending'" style="font-size: 120rpx;">⏳</text>
      <text v-else style="font-size: 120rpx;">❌</text>
    </view>
    <text class="pay-result__title">{{ statusText }}</text>
    <text v-if="status === 'pending'" class="pay-result__hint">支付确认中，如已扣款稍后自动到账</text>
    <text v-if="orderCodes.length === 1" class="pay-result__code">订单号: {{ orderCodes[0] }}</text>
    <view v-else class="pay-result__codes">
      <text class="pay-result__codes-title">本次共生成 {{ orderCodes.length }} 笔订单</text>
      <view v-for="code in orderCodes" :key="code" class="pay-result__code-item">
        <text>订单号: {{ code }}</text>
        <text class="pay-result__code-state">{{ stateLabel(code) }}</text>
        <text class="pay-result__code-link" @click="viewOrder(code)">查看</text>
      </view>
    </view>
    <view class="pay-result__actions">
      <button class="btn-primary" @click="viewOrder(orderCodes[0] || '')">{{ primaryLabel }}</button>
      <button class="btn-secondary" @click="goHome">继续购物</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { addItemToOrder } from '../../api/mutations/cart';
import { getOrderByCode } from '../../api/queries/order';

const cart = useCartStore();

const SETTLED_STATES = ['PaymentSettled', 'Complete', 'Delivered', 'Shipped'];
const POLL_INTERVAL = 3000;
const MAX_ATTEMPTS = 20;

const status = ref<'success' | 'pending' | 'fail'>('pending');
const timedOut = ref(false);
const orderCodes = ref<string[]>([]);
const orderStates = ref<Record<string, string>>({});
let timer: ReturnType<typeof setInterval> | null = null;
let attempts = 0;

const statusText = computed(() => {
    switch (status.value) {
        case 'success': return '支付成功';
        case 'pending': return timedOut.value ? '支付确认中' : '等待支付确认';
        default: return '支付失败';
    }
});

/** pending 态主按钮变「继续支付」：跳订单详情，详情页已有「去支付」按钮 */
const primaryLabel = computed(() => (status.value === 'pending' ? '继续支付' : '查看订单'));

function stateLabel(code: string): string {
    const st = orderStates.value[code];
    if (!st) return '查询中';
    if (SETTLED_STATES.includes(st)) return '已支付';
    if (st === 'Cancelled') return '已取消';
    return '待支付';
}

/** 全部结算 → success；任一取消 → fail；否则 false（继续轮询） */
function evaluate(): boolean {
    const states = orderCodes.value.map(c => orderStates.value[c]).filter(Boolean);
    if (states.length === 0) return false;
    if (states.every(s => SETTLED_STATES.includes(s))) {
        status.value = 'success';
        return true;
    }
    if (states.some(s => s === 'Cancelled')) {
        status.value = 'fail';
        return true;
    }
    return false;
}

async function pollOnce(): Promise<boolean> {
    for (const code of orderCodes.value) {
        const known = orderStates.value[code];
        if (known && SETTLED_STATES.includes(known)) continue; // 已结算不再查
        try {
            const res: any = await getOrderByCode(code);
            const st = res?.orderByCode?.state;
            if (st) orderStates.value = { ...orderStates.value, [code]: st };
        } catch (e) {
            console.warn('[pay-result] query order failed', code, e); // 网络失败静默重试
        }
    }
    return evaluate();
}

function startPolling() {
    stopPolling();
    attempts = 0;
    timer = setInterval(async () => {
        attempts++;
        const done = await pollOnce();
        if (done || attempts >= MAX_ATTEMPTS) {
            stopPolling();
            if (!done) timedOut.value = true; // 超时：提示确认中，不误判失败
        }
    }, POLL_INTERVAL);
}

function stopPolling() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

onShow(async () => {
    const pending = [...cart.pendingLines];
    if (pending.length === 0) return;
    // 进入本页代表本次结算已结束：未勾选行（未购买）必须回填，不能丢弃
    for (const p of pending) {
        try {
            await addItemToOrder(p.variantId, p.quantity);
        } catch (e) {
            console.warn('[pay-result] restore pending line failed', p, e);
        }
    }
    cart.clearPendingLines();
});

onLoad((query: any) => {
    // 不再信任 URL status：真实状态以订单查询轮询为准
    const single = query?.code;
    const multi = query?.codes;
    if (single) {
        orderCodes.value = [single];
    } else if (multi) {
        orderCodes.value = String(multi).split(',').filter(Boolean);
    }
    if (orderCodes.value.length > 0) {
        startPolling();
    } else {
        status.value = 'fail';
    }
});

onUnload(() => stopPolling());

function viewOrder(code: string) {
    if (!code) return;
    uni.redirectTo({ url: '/pkg-order/pages/order-detail?code=' + code });
}
function goHome() {
    uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style lang="scss" scoped>
.pay-result {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx;
    &__icon { margin-bottom: 30rpx; }
    &__title { font-size: 36rpx; font-weight: bold; margin-bottom: 16rpx; }
    &__hint { font-size: 24rpx; color: $text-color-secondary; margin-bottom: 16rpx; }
    &__code { font-size: 26rpx; color: $text-color-secondary; margin-bottom: 60rpx; }
    &__codes { width: 100%; margin-bottom: 60rpx; }
    &__codes-title { display: block; font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; text-align: center; }
    &__code-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background: #f7f7f7; border-radius: $radius-md; margin-bottom: 12rpx; font-size: 26rpx; color: $text-color-secondary; }
    &__code-state { color: $brand-color; }
    &__code-link { color: $brand-color; }
    &__actions { width: 100%; display: flex; flex-direction: column; gap: 20rpx; }
}
.btn-primary { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; border: none; }
.btn-secondary { background: #fff; color: $text-color; border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
</style>
```

- [ ] **Step 2: 编译验证**

Run: `npm run build:mp-weixin`（在 `d:\zhao\vshop`；若脚本名不同以 `package.json` scripts 为准，如 `uni build -p mp-weixin`）
Expected: 构建成功无 TS/模板错误，产物输出 `dist/build/mp-weixin/`。

- [ ] **Step 3: H5 真机视口验证（390×844, dpr=2）**

启动本地 H5（`npm run dev:h5`）+ 本地后端（devBypass 开发模式）。用 Playwright 脚本截三张图到 `docs/screenshots/`：
1. `pay-result-pending.png`：访问 `/pkg-order/pages/pay-result?code=<未结算单号>`，0-3 秒内截图（⏳ 等待支付确认 + 继续支付按钮）。
2. `pay-result-success.png`：访问 `?code=<已结算单号>`，等轮询判定后截图（✅ 支付成功）。
3. `pay-result-timeout.png`：访问 `?code=<不存在单号>`，等 65 秒超时后截图（支付确认中文案）。

- [ ] **Step 4: Commit**

```powershell
Set-Content -Path "$env:TEMP\commit_msg.txt" -Encoding utf8 -NoNewline -Value "feat(vshop): pay-result polls real order state and offers retry`n`npay-result 不再信任 URL status：3s x 20 次轮询 orderByCode 真实状态；pending 态主按钮变继续支付跳订单详情（详情页已有去支付）。微信小程序收款闭环补齐。"
git add src/pkg-order/pages/pay-result.vue
git commit -F "$env:TEMP\commit_msg.txt"
```

---

### Task 2: 使用手册新增「微信小程序收款配置」章节

**Files:**
- Modify: `doc/使用手册.md`（文末追加第 9 章）

- [ ] **Step 1: 追加章节**

在 `doc/使用手册.md` 末尾追加：

```markdown
## 9. 微信小程序收款配置

小程序微信支付（JSAPI）链路已内置：下单 → addPaymentToOrder 返回签名参数 → wx.requestPayment
拉起收银台 → 微信异步回调 /wechatpay/notify → 订单自动结算 → pay-result 页轮询确认。
收款前提是完成以下配置。

### 9.1 微信商户平台（pay.weixin.qq.com）

1. 注册商户号，完成资质审核，记录 **mchId**。
2. 「产品中心 → AppID 账号管理」：绑定小程序的 **AppID**。
3. 「账户中心 → API 安全」：
   - 设置 **APIv3 密钥**（apiKey，32 位）。
   - 申请 **API 证书**：下载商户私钥 `apiclient_key.pem`，记录**证书序列号**（serialNo）。
   - 下载**微信平台公钥**（PEM 文件内容，publicKey）。

### 9.2 后台录入凭证（Vendure Admin）

「Settings → Payment Methods」创建/编辑 `wechatpay` 支付方式，填写：

| 参数 | 值 |
|------|-----|
| appId | 小程序 AppID |
| mchId | 商户号 |
| apiKey | APIv3 密钥 |
| privateKey | apiclient_key.pem 内容（PEM 全文） |
| publicKey | 微信平台公钥内容（PEM 全文） |
| serialNo | 证书序列号 |
| tradeType | `JSAPI` |

多租户：在对应渠道的 `payConfig.wechatpay` 填同套凭证 + `notifyUrl`，优先级高于全局。

### 9.3 回调地址

`https://www.yourbao.cn/wechatpay/notify`（填入渠道 payConfig.notifyUrl；
未配置时回退环境变量 `WECHATPAY_NOTIFY_URL`）。必须公网 HTTPS 可访问。

### 9.4 小程序端域名

微信公众平台（小程序后台）→「开发管理 → 开发设置 → 服务器域名」：
request 合法域名加入 `https://www.yourbao.cn`。

### 9.5 生产开关

生产环境 `WechatpayPlugin.init({ devBypass: false })`（devBypass=true 时仅模拟支付页，
不会真实收款）。

### 9.6 测试流程

1. 后台下一笔 0.01 元测试单，小程序真实支付。
2. 预期：收银台拉起 → 支付成功 → pay-result 页数秒内变「✅ 支付成功」。
3. 取消支付：pay-result 保持「⏳ 等待支付确认」+「继续支付」按钮；订单详情可重新支付。
```

- [ ] **Step 2: Commit**

```powershell
Set-Content -Path "$env:TEMP\commit_msg.txt" -Encoding utf8 -NoNewline -Value "docs(vshop): wechat miniprogram pay config chapter in manual`n`n使用手册新增第9章：商户平台取证→Admin录入→回调地址→小程序域名→生产开关→测试流程。"
git add doc/使用手册.md
git commit -F "$env:TEMP\commit_msg.txt"
```

---

### Task 3: 截图归档 + 收尾推送

**Files:**
- Create: `docs/screenshots/pay-result-*.png`（Task 1 Step 3 产物，若截图脚本生成到别处则移动归档）

- [ ] **Step 1: 确认三张手机视口截图（390×844, dpr=2）已归档到 `docs/screenshots/`，并在本计划勾选**
- [ ] **Step 2: 推送**

```powershell
git push
```

Expected: push 成功。小程序代码需人工用微信开发者工具打开 `dist/build/mp-weixin/` 上传审核发布（无法自动部署）。
