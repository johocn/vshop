<template>
  <view class="coupon-code-page">
    <!-- 顶部操作栏 -->
    <view class="code-header">
      <text class="code-header__title">出示券码</text>
      <text class="code-header__tip">到店向商户出示此券码核销</text>
    </view>

    <!-- 主卡：券信息 + QR -->
    <view class="code-main" :class="{ 'code-main--expiring': isExpiring }">
      <!-- 左侧：折扣摘要 -->
      <view class="code-amount">
        <text class="code-amount__symbol" v-if="isFixedOrFull">¥</text>
        <text class="code-amount__num">{{ amountText }}</text>
        <text class="code-amount__unit">{{ unitText }}</text>
        <text class="code-amount__type">{{ typeTip }}</text>
      </view>

      <!-- 右侧：QR + 券名 -->
      <view class="code-qr-area">
        <view class="code-qr-wrap" :class="{ 'code-qr-wrap--borderless': qrReady }">
          <!-- H5: qrcode 库生成 dataURL；小程序 canvas 兜底 -->
          <!-- #ifdef H5 -->
          <image v-if="qrDataUrl" class="code-qr" :src="qrDataUrl" mode="aspectFit" />
          <view v-else class="code-qr code-qr--loading">
            <text>生成中…</text>
          </view>
          <!-- #endif -->

          <!-- #ifndef H5 -->
          <canvas
            canvas-id="couponCodeCanvas"
            id="couponCodeCanvas"
            class="code-qr-canvas"
          />
          <!-- #endif -->
        </view>
        <text class="code-name">{{ couponName }}</text>
      </view>

      <!-- 已过期遮罩 -->
      <view v-if="isExpired" class="code-mask">
        <text class="code-mask__text">该券已过期</text>
      </view>
    </view>

    <!-- 券码大字区 -->
    <view class="code-strip" @click="copyCode">
      <text class="code-strip__label">券码</text>
      <text class="code-strip__value">{{ couponCode }}</text>
      <view class="code-strip__copy">
        <text class="code-strip__copy-text">复制</text>
      </view>
    </view>

    <!-- 到期信息 -->
    <view class="code-meta">
      <view class="code-meta__row">
        <text class="code-meta__label">有效期至</text>
        <text class="code-meta__value" :class="{ 'code-meta__value--warn': isExpiring }">{{ expiresText }}</text>
      </view>
      <view v-if="minSpendText" class="code-meta__row">
        <text class="code-meta__label">使用门槛</text>
        <text class="code-meta__value">{{ minSpendText }}</text>
      </view>
    </view>

    <!-- 使用说明 -->
    <view class="code-guide">
      <text class="code-guide__title">使用说明</text>
      <view class="code-guide__list">
        <view class="code-guide__item">
          <text class="code-guide__dot">1</text>
          <text class="code-guide__text">到店消费，结算时向商户出示本券</text>
        </view>
        <view class="code-guide__item">
          <text class="code-guide__dot">2</text>
          <text class="code-guide__text">商户扫码或输入券码核销成功后，即可按折扣结算</text>
        </view>
        <view class="code-guide__item">
          <text class="code-guide__dot">3</text>
          <text class="code-guide__text">平台不参与收款，券核销后由您与商户线下结算</text>
        </view>
      </view>
    </view>

    <!-- 轮询状态条 -->
    <view v-if="!verified && !isExpired" class="code-poll">
      <template v-if="polling">
        <view class="code-poll__dot code-poll__dot--spin" />
        <text class="code-poll__text">等待商户核销…</text>
        <text class="code-poll__hint">（每 3 秒刷新，最多 3 分钟）</text>
      </template>
      <template v-else-if="pollTimedOut">
        <text class="code-poll__text code-poll__text--warn">检测超时</text>
        <text class="code-poll__hint">如已核销，点下方按钮确认</text>
        <text class="code-poll__retry" @click="restartPolling">重新检测</text>
      </template>
      <template v-else>
        <view class="code-poll__dot" />
        <text class="code-poll__text">即将自动检测核销状态</text>
      </template>
    </view>

    <!-- 核销成功确认层 -->
    <view v-if="verified" class="code-verified">
      <view class="code-verified__card">
        <view class="code-verified__icon">
          <!-- ✓ SVG 勾 -->
          <view class="code-verified__check" />
        </view>
        <text class="code-verified__title">核销成功</text>
        <text class="code-verified__sub">
          券 {{ couponCode }} 已被商户核销
        </text>
        <text class="code-verified__tip">请按折扣金额与商户线下结算</text>
        <button class="code-verified__btn" @click="backToWallet">返回我的券包</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { getMyCouponByCode } from '../../api/queries/coupon';
import { couponErrorMessage } from '../../api/mutations/coupon';

interface QueryParams {
  code?: string;
  name?: string;
  type?: string;          // FIXED | PERCENT | FREE_SHIPPING | FULL
  discountValue?: string; // 分
  minSpend?: string;      // 分
  expiresAt?: string;     // ISO 时间串
}

const qrDataUrl = ref('');
const qrReady = ref(false);

// 从路由 query 读取参数
const query = (() => {
  // uni-app 在 <script setup> 中从 onLoad options 获取
  return {} as QueryParams;
})();

// 响应式存储（由 onLoad 初始化）
const code = ref('');
const name = ref('');
const type = ref<'FIXED' | 'PERCENT' | 'FREE_SHIPPING' | 'FULL'>('FIXED');
const discountValue = ref(0);
const minSpend = ref(0);
const expiresAt = ref('');

onMounted(() => {
  // #ifdef APP-PLUS || H5
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as any;
  const opts = page?.$page?.options || page?.options || {};
  readQuery(opts);
  // #endif
  // #ifdef MP-WEIXIN
  // 小程序会触发 onLoad，但 <script setup> 中需要通过 onLaunch 或 page 的 onLoad 钩子
  // 这里用 page.__uniConfig 的方式兜底
  const pagesMp = getCurrentPages();
  const pageMp = pagesMp[pagesMp.length - 1] as any;
  const optsMp = pageMp?.options || {};
  if (optsMp && Object.keys(optsMp).length) readQuery(optsMp);
  // #endif
});

function readQuery(q: Record<string, string>) {
  code.value = q.code || '';
  name.value = q.name || '优惠券';
  type.value = (q.type || 'FIXED') as any;
  discountValue.value = parseInt(q.discountValue || '0', 10);
  minSpend.value = parseInt(q.minSpend || '0', 10);
  expiresAt.value = q.expiresAt || '';
  if (code.value) {
    generateQr(code.value);
    // 有了 code 立即启动核销状态轮询
    startPolling();
  }
}

// ===== 核销状态轮询 =====
const polling = ref(false);
const verified = ref(false);
const pollTimedOut = ref(false);
const pollCount = ref(0);

const POLL_INTERVAL_MS = 3000;   // 3 秒/次
const MAX_POLL_COUNT = 60;       // 最多 60 次 = 3 分钟
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (polling.value || verified.value || isExpired.value) return;
  polling.value = true;
  pollTimedOut.value = false;
  pollCount.value = 0;
  checkCouponStatus();
  pollTimer = setInterval(checkCouponStatus, POLL_INTERVAL_MS);
}

function stopPolling(timedOut = false) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  polling.value = false;
  pollTimedOut.value = pollTimedOut.value || timedOut;
}

function restartPolling() {
  startPolling();
}

async function checkCouponStatus() {
  // 超过最大轮询次数 → 超时停止
  pollCount.value += 1;
  if (pollCount.value > MAX_POLL_COUNT) {
    stopPolling(true);
    return;
  }
  try {
    const res: any = await getMyCouponByCode(code.value);
    const target = res?.customerCouponByCode;
    if (!target) return;
    const status = (target.status || '').toUpperCase();
    if (status === 'USED') {
      verified.value = true;
      stopPolling();
      return;
    }
    if (status === 'EXPIRED' || status === 'INVALID') {
      stopPolling();
      return;
    }
    // UNUSED / RETURNED → 继续轮询
  } catch (e: any) {
    // 网络错误静默跳过下一轮
    console.warn('[coupon-code] 轮询失败', couponErrorMessage(e));
  }
}

function backToWallet() {
  // 关掉核销成功层 + 停止轮询 + 返回上一页
  verified.value = false;
  stopPolling();
  uni.navigateBack({ delta: 1 });
}

// ===== uni-app 生命周期钩子 =====
onShow(() => {
  // 回到页面前台时，如未核销且未过期，恢复轮询
  if (code.value && !verified.value && !isExpired.value && !polling.value) {
    startPolling();
  }
});

onHide(() => {
  stopPolling();
});

onUnload(() => {
  stopPolling();
});

/** H5: 用 qrcode 库生成 base64 dataURL；小程序用 qrcode-generator + canvas 点阵绘制 */
async function generateQr(text: string) {
  try {
    // #ifdef H5
    const { default: QRCode } = await import('qrcode');
    const url = await QRCode.toDataURL(text, { width: 360, margin: 1 });
    qrDataUrl.value = url;
    qrReady.value = true;
    // #endif

    // #ifndef H5
    // 小程序：qrcode-generator 生成点阵矩阵，canvas 逐格绘制（typeNumber=0 自动版本，M 级容错）
    const mod: any = await import('qrcode-generator');
    const qrcode = mod.default || mod;
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const sizePx = uni.upx2px(256); // 与 .code-qr-canvas 尺寸一致
    const cell = sizePx / count;
    const q = uni.createCanvasContext('couponCodeCanvas');
    q.setFillStyle('#ffffff');
    q.fillRect(0, 0, sizePx, sizePx);
    q.setFillStyle('#333333');
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          q.fillRect(Math.floor(col * cell), Math.floor(row * cell), Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
    q.draw();
    qrReady.value = true;
    // #endif
  } catch (e) {
    console.error('[coupon-code] QR 生成失败', e);
  }
}

function copyCode() {
  if (!code.value) return;
  uni.setClipboardData({
    data: code.value,
    success: () => uni.showToast({ title: '券码已复制', icon: 'success' }),
  });
}

// ===== 计算属性 =====

const isFixedOrFull = computed(() => type.value === 'FIXED' || type.value === 'FULL');
const isPercent = computed(() => type.value === 'PERCENT');
const isFreeShipping = computed(() => type.value === 'FREE_SHIPPING');

const amountText = computed(() => {
  if (isFreeShipping.value) return '免配送费';
  if (isPercent.value) {
    const zhe = discountValue.value / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
  }
  return (discountValue.value / 100).toString();
});

const unitText = computed(() => {
  if (isFreeShipping.value) return '';
  if (isPercent.value) return '折';
  return '元';
});

const typeTip = computed(() => {
  if (isFreeShipping.value) return '免配送费';
  if (type.value === 'FULL') return '无门槛直减';
  if (isPercent.value) return '折扣券';
  return '立减券';
});

const couponName = computed(() => name.value);
const couponCode = computed(() => code.value);

const minSpendText = computed(() => {
  const m = minSpend.value;
  if (!m) return '';
  return `满 ${(m / 100).toFixed(m % 100 === 0 ? 0 : 2)} 元可用`;
});

const expiresText = computed(() => {
  if (!expiresAt.value) return '长期有效';
  const d = new Date(expiresAt.value);
  if (Number.isNaN(d.getTime())) return expiresAt.value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} 前有效`;
});

const remainingMs = computed(() => {
  if (!expiresAt.value) return Infinity;
  const d = new Date(expiresAt.value);
  if (Number.isNaN(d.getTime())) return Infinity;
  return d.getTime() - Date.now();
});

const isExpired = computed(() => remainingMs.value <= 0);
const isExpiring = computed(() => !isExpired.value && remainingMs.value > 0 && remainingMs.value <= 7 * 86_400_000);
</script>

<style lang="scss" scoped>
/* uni.scss 变量由构建管线全局注入，此处不可重复 @use（会重复定义 $brand-color） */

.coupon-code-page {
  padding: 24rpx 32rpx 80rpx;
  min-height: 100vh;
  background: $bg-color;
}

// ===== 顶部 header =====
.code-header {
  padding: 24rpx 0 32rpx;
  &__title {
    display: block;
    font-size: 40rpx;
    font-weight: bold;
    color: #333;
  }
  &__tip {
    display: block;
    margin-top: 8rpx;
    font-size: 26rpx;
    color: #999;
  }
}

// ===== 主卡 =====
.code-main {
  position: relative;
  display: flex;
  align-items: stretch;
  background: #fff;
  border-radius: $radius-lg;
  overflow: hidden;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);

  &--expiring {
    border: 2rpx solid $brand-color;
  }
}

// 左侧折扣摘要
.code-amount {
  width: 220rpx;
  background: linear-gradient(135deg, $brand-color, #ff9a3d);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32rpx 0;
  color: #fff;

  &__symbol { font-size: 32rpx; font-weight: bold; }
  &__num { font-size: 72rpx; font-weight: bold; line-height: 1; }
  &__unit { font-size: 26rpx; margin-left: 4rpx; align-self: flex-end; margin-top: 6rpx; }
  &__type {
    margin-top: 14rpx;
    font-size: 22rpx;
    padding: 4rpx 16rpx;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 20rpx;
  }
}

// 右侧 QR 区
.code-qr-area {
  flex: 1;
  padding: 32rpx 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}

.code-qr-wrap {
  width: 280rpx;
  height: 280rpx;
  background: #fff;
  border: 2rpx dashed #e0d8ff;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx;

  &--borderless { border: none; padding: 0; }
}

.code-qr {
  width: 100%;
  height: 100%;
  display: block;

  &--loading {
    width: auto; height: auto;
    font-size: 24rpx; color: #bbb;
  }
}

.code-qr-canvas {
  width: 256rpx;
  height: 256rpx;
}

.code-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  max-width: 480rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 已过期遮罩
.code-mask {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4rpx);

  &__text {
    font-size: 48rpx;
    font-weight: bold;
    color: #ff4d4f;
    padding: 16rpx 48rpx;
    border: 6rpx solid #ff4d4f;
    border-radius: 12rpx;
    transform: rotate(-12deg);
    opacity: 0.85;
  }
}

// ===== 券码大字条 =====
.code-strip {
  margin-top: 28rpx;
  background: #fff;
  border-radius: $radius-md;
  padding: 30rpx 32rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  &__label {
    font-size: 26rpx;
    color: #999;
    flex-shrink: 0;
  }
  &__value {
    flex: 1;
    font-size: 40rpx;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-weight: bold;
    letter-spacing: 4rpx;
    color: $brand-color;
  }
  &__copy {
    flex-shrink: 0;
    padding: 10rpx 24rpx;
    background: #fff4ed;
    border-radius: 30rpx;
  }
  &__copy-text {
    font-size: 24rpx;
    color: $brand-color;
  }
}

// ===== 到期信息 =====
.code-meta {
  margin-top: 20rpx;
  background: #fff;
  border-radius: $radius-md;
  padding: 24rpx 32rpx;

  &__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12rpx 0;

    & + & { border-top: 1rpx solid #f4f4f4; }
  }
  &__label { font-size: 26rpx; color: #999; }
  &__value {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;

    &--warn { color: $brand-color; font-weight: bold; }
  }
}

// ===== 使用说明 =====
.code-guide {
  margin-top: 28rpx;
  background: #fff;
  border-radius: $radius-md;
  padding: 28rpx 32rpx;

  &__title {
    display: block;
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 20rpx;
  }
  &__list { display: flex; flex-direction: column; gap: 16rpx; }
  &__item {
    display: flex;
    align-items: flex-start;
    gap: 16rpx;
  }
  &__dot {
    width: 40rpx;
    height: 40rpx;
    flex-shrink: 0;
    border-radius: 50%;
    background: #fff4ed;
    color: $brand-color;
    font-size: 24rpx;
    font-weight: bold;
    text-align: center;
    line-height: 40rpx;
  }
  &__text {
    flex: 1;
    font-size: 26rpx;
    color: #666;
    line-height: 1.6;
  }
}

// ===== 轮询状态条 =====
.code-poll {
  margin-top: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  padding: 20rpx 24rpx;
  background: #fff8f0;
  border-radius: $radius-md;
  border: 1rpx dashed #ffc89e;

  &__dot {
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    background: $brand-color;
    opacity: 0.4;

    &--spin {
      opacity: 1;
      animation: code-pulse 1.2s ease-in-out infinite;
    }
  }
  &__text { font-size: 26rpx; color: $brand-color; font-weight: 500; }
  &__text--warn { color: #ff7a45; }
  &__hint { font-size: 22rpx; color: #bb8866; }
  &__retry {
    font-size: 24rpx;
    color: $brand-color;
    font-weight: 600;
    padding: 6rpx 20rpx;
    background: #fff;
    border-radius: 24rpx;
    border: 1rpx solid $brand-color;
  }
}

@keyframes code-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.4); opacity: 0.5; }
}

// ===== 核销成功确认层 =====
.code-verified {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 60rpx;

  &__card {
    width: 100%;
    max-width: 600rpx;
    background: #fff;
    border-radius: 24rpx;
    padding: 60rpx 48rpx 48rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: code-pop 0.3s ease-out;
  }

  &__icon {
    width: 140rpx;
    height: 140rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, #52c41a, #73d13d);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 32rpx;
    box-shadow: 0 8rpx 28rpx rgba(82, 196, 26, 0.4);
  }

  &__check {
    width: 56rpx;
    height: 88rpx;
    border-right: 10rpx solid #fff;
    border-bottom: 10rpx solid #fff;
    transform: rotate(45deg) translate(-6rpx, -10rpx);
  }

  &__title {
    font-size: 40rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 12rpx;
  }
  &__sub {
    font-size: 26rpx;
    color: #666;
    margin-bottom: 8rpx;
  }
  &__tip {
    font-size: 24rpx;
    color: #999;
    margin-bottom: 48rpx;
  }

  &__btn {
    width: 100%;
    background: $brand-color;
    color: #fff;
    border: none;
    border-radius: 48rpx;
    font-size: 30rpx;
    font-weight: 500;
    padding: 20rpx 0;

    &::after { border: none; }
  }
}

@keyframes code-pop {
  0%   { transform: scale(0.6); opacity: 0; }
  60%  { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); }
}
</style>
