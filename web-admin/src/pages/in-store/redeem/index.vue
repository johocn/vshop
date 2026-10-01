<template>
  <view class="page">
    <view class="head">
      <text class="head-title">{{ $t('inStoreRedeem.headTitle') }}</text>
      <text class="sub">{{ $t('inStoreRedeem.headSub') }}</text>
    </view>

    <!-- 输码 / 扫码 -->
    <view class="card" :class="{ pulse: pulsing }">
      <input
        class="code-input"
        v-model="rawCode"
        :placeholder="$t('inStoreRedeem.inputPlaceholder')"
        :maxlength="64"
        confirm-type="done"
        @confirm="onLookup"
      />
      <view class="row">
        <button class="btn scan" @tap="onScan">{{ $t('inStoreRedeem.scan') }}</button>
        <button class="btn main" :disabled="looking" @tap="onLookup">{{ $t('inStoreRedeem.lookup') }}</button>
      </view>
    </view>

    <!-- 券信息卡 -->
    <view v-if="quoteError" class="alert">{{ quoteError }}</view>
    <view v-if="quote && quote.couponCode" class="card coupon-card">
      <view class="cc-top">
        <text class="cc-name">{{ quote.couponName || $t('inStoreRedeem.voucher') }}</text>
        <text class="cc-tag">{{ discountText }}</text>
      </view>
      <view class="cc-line">
        <text class="k">{{ $t('inStoreRedeem.code') }}</text>
        <text class="v mono">{{ quote.couponCode }}</text>
      </view>
      <view class="cc-line">
        <text class="k">{{ $t('inStoreRedeem.customer') }}</text>
        <text class="v">{{ quote.customerName || '—' }}<text v-if="quote.customerPhone"> · {{ quote.customerPhone }}</text></text>
      </view>
      <view class="cc-line" v-if="quote.minSpend">
        <text class="k">{{ $t('inStoreRedeem.minSpend') }}</text>
        <text class="v">¥{{ fenToYuan(quote.minSpend) }}</text>
      </view>
      <view class="cc-line" v-if="quote.expiresAt">
        <text class="k">{{ $t('inStoreRedeem.expires') }}</text>
        <text class="v">{{ fmtDate(quote.expiresAt) }}</text>
      </view>
    </view>

    <!-- 原价 + 试算 -->
    <view v-if="quote && quote.couponCode" class="card">
      <view class="field">
        <text class="label">{{ $t('inStoreRedeem.originalLabel') }}</text>
        <input class="ipt" v-model="originalYuan" type="digit" :placeholder="$t('inStoreRedeem.phOriginal')" />
      </view>
      <view class="calc">
        <view class="calc-row">
          <text class="k">{{ $t('inStoreRedeem.original') }}</text>
          <text class="v">¥{{ fenToYuan(quote.originalAmount) }}</text>
        </view>
        <view class="calc-row">
          <text class="k">{{ $t('inStoreRedeem.discount') }}</text>
          <text class="v minus">-¥{{ fenToYuan(quote.discountAmount) }}</text>
        </view>
        <view class="calc-row total">
          <text class="k">{{ $t('inStoreRedeem.final') }}</text>
          <text class="v">{{ fenToYuan(quote.finalAmount) }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">{{ $t('inStoreRedeem.remarkLabel') }} <text class="opt">{{ $t('inStoreRedeem.optional') }}</text></text>
        <input class="ipt" v-model="remark" :placeholder="$t('inStoreRedeem.phRemark')" />
      </view>
      <button class="confirm" :disabled="!canRedeem || redeeming" @tap="onRedeem">
        {{ redeeming ? $t('inStoreRedeem.redeeming') : $t('inStoreRedeem.confirm') }}
      </button>
      <text class="hint">{{ $t('inStoreRedeem.collectHint') }}</text>
    </view>

    <!-- 成功态 -->
    <view v-if="done" class="card done">
      <text class="done-title">{{ $t('inStoreRedeem.doneTitle') }}</text>
      <text class="done-amount">¥{{ fenToYuan(done.finalAmount) }}</text>
      <text class="done-tip">{{ $t('inStoreRedeem.doneTip').replace('{no}', String(done.id)) }}</text>
      <button class="btn main again" @tap="reset">{{ $t('inStoreRedeem.again') }}</button>
    </view>

    <view style="height: 80rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  quoteInStoreBill, redeemInStoreBill, fenToYuan, discountLabel,
  InStoreBillQuote, InStoreBillRow,
} from '../../../apis/in-store-bill';
import { scanCode } from '../../../utils/scanner';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const rawCode = ref('');
const quote = ref<InStoreBillQuote | null>(null);
const quoteError = ref('');
const originalYuan = ref('');
const remark = ref('');
const looking = ref(false);
const redeeming = ref(false);
const pulsing = ref(false);
const done = ref<InStoreBillRow | null>(null);

const discountText = computed(() => discountLabel(quote.value?.discountType, quote.value?.discountValue));
const canRedeem = computed(() => !!quote.value?.ok && quote.value?.finalAmount != null);

/** 分 → 元（两位小数）。本地未引入的数值（券卡展示用）用价格格式化兜底。 */
function fen(v: number | null | undefined): string {
  return v == null ? '—' : (v / 100).toFixed(2);
}
function fmtDate(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 拉取券信息（不传原价）；原价已在填时顺带试算 */
async function load(code: string, amountYuan?: string) {
  const c = code.trim();
  if (!c) return;
  looking.value = true;
  quoteError.value = '';
  try {
    const amount = amountYuan && Number(amountYuan) > 0 ? Math.round(Number(amountYuan) * 100) : null;
    const q = await quoteInStoreBill(c, amount);
    quote.value = q;
    if (!q.ok && q.reason) quoteError.value = reasonText(q.reason);
  } catch (e: any) {
    quote.value = null;
    quoteError.value = e?.message || locale.t('inStoreRedeem.lookupFailed');
  } finally {
    looking.value = false;
  }
}

/** 后端原因码 → 本地化文案（兜底用后端中文消息） */
function reasonText(reason: string): string {
  const map: Record<string, string> = {
    COUPON_NOT_FOUND: locale.t('inStoreRedeem.errNotFound'),
    TEMPLATE_DISABLED: locale.t('inStoreRedeem.errDisabled'),
    COUPON_NOT_UNUSED: locale.t('inStoreRedeem.errUsed'),
    COUPON_EXPIRED: locale.t('inStoreRedeem.errExpired'),
    SCENE_MISMATCH: locale.t('inStoreRedeem.errScene'),
    TENANT_MISMATCH: locale.t('inStoreRedeem.errTenant'),
    TYPE_NOT_SUPPORTED: locale.t('inStoreRedeem.errType'),
    MIN_SPEND_NOT_MET: locale.t('inStoreRedeem.errMinSpend'),
    INVALID_AMOUNT: locale.t('inStoreRedeem.errAmount'),
  };
  return map[reason] || reason;
}

async function onLookup() {
  await load(rawCode.value, originalYuan.value);
}

function onScan() {
  scanCode()
    .then((text: string) => {
      const c = (text || '').trim();
      if (!c) {
        uni.showToast({ title: locale.t('inStoreRedeem.scanFailed'), icon: 'none' });
        return;
      }
      rawCode.value = c;
      pulsing.value = true;
      setTimeout(() => (pulsing.value = false), 600);
      return load(c, originalYuan.value);
    })
    .catch((e: any) => {
      if (e?.code === 'MANUAL' || e?.code === 'FAILED') {
        uni.showToast({ title: e?.message || locale.t('inStoreRedeem.scanFailed'), icon: 'none' });
      }
      // CANCEL 静默
    });
}

/** 原价输入 400ms 防抖试算 */
let timer: any;
function onAmountInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => load(rawCode.value, originalYuan.value), 400);
}

function onRedeem() {
  const amount = Math.round(Number(originalYuan.value) * 100);
  if (!quote.value?.couponCode || !amount) return;
  uni.showModal({
    title: locale.t('inStoreRedeem.confirmTitle'),
    content: locale.t('inStoreRedeem.confirmContent').replace('{code}', quote.value.couponCode!).replace('{final}', fen(quote.value.finalAmount)),
    confirmText: locale.t('inStoreRedeem.confirmBtn'),
    cancelText: locale.t('inStoreRedeem.cancel'),
    success: async (r) => {
      if (!r.confirm) return;
      redeeming.value = true;
      try {
        done.value = await redeemInStoreBill(quote.value!.couponCode!, amount, remark.value);
        uni.showToast({ title: locale.t('inStoreRedeem.redeemed'), icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('inStoreRedeem.redeemFailed'), icon: 'none' });
      } finally {
        redeeming.value = false;
      }
    },
  });
}

function reset() {
  rawCode.value = '';
  quote.value = null;
  quoteError.value = '';
  originalYuan.value = '';
  remark.value = '';
  done.value = null;
}

// 原价输入变化触发防抖试算（用 watch 保持模板简洁）
import { watch } from 'vue';
watch(originalYuan, () => {
  if (quote.value?.couponCode) onAmountInput();
});

onLoad((q: any) => {
  const c = (q?.code as string) || '';
  if (c) {
    rawCode.value = c;
    load(c);
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 60rpx;
  .head { margin-bottom: 20rpx;
    .head-title { display: block; font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .sub { display: block; margin-top: 6rpx; font-size: 24rpx; color: $wa-muted; }
  }
  .card { background: $wa-card; border-radius: 20rpx; padding: 24rpx; margin-bottom: 24rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.06); border: 2rpx solid transparent;
    transition: border-color .2s;
    &.pulse { border-color: $wa-accent; }
    .code-input { height: 84rpx; padding: 0 24rpx; font-size: 34rpx; font-weight: 700; letter-spacing: 4rpx;
      font-family: ui-monospace, Menlo, Consolas, monospace; background: $wa-bg; border-radius: 16rpx; color: $wa-ink; }
    .row { display: flex; gap: 16rpx; margin-top: 16rpx;
      .btn { flex: 1; margin: 0; height: 80rpx; line-height: 80rpx; font-size: 28rpx; border-radius: 16rpx; }
      .scan { background: $wa-ink; color: #fff; }
      .main { background: $wa-accent; color: #fff; }
    }
  }
  .alert { background: #fef3c7; border: 1rpx solid #fcd34d; color: #b45309; border-radius: 16rpx;
    padding: 18rpx 24rpx; margin-bottom: 20rpx; font-size: 26rpx; }
  .coupon-card {
    .cc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
      .cc-name { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
      .cc-tag { font-size: 26rpx; font-weight: 700; color: #d04b00; background: #fff4ec;
        border: 1rpx solid #ffd9bc; border-radius: 10rpx; padding: 4rpx 16rpx; }
    }
    .cc-line { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx;
      .k { color: $wa-muted; } .v { color: $wa-ink; } .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
    }
  }
  .calc { border-top: 1rpx dashed $wa-rule; padding-top: 16rpx; margin-bottom: 16rpx;
    .calc-row { display: flex; justify-content: space-between; padding: 6rpx 0; font-size: 26rpx;
      .k { color: $wa-muted; } .v { color: $wa-ink; } .minus { color: #059669; }
      &.total { margin-top: 8rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule;
        .k { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
        .v { font-size: 40rpx; font-weight: 800; color: $wa-accent; }
      }
    }
  }
  .field { margin-bottom: 20rpx;
    .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; .opt { font-size: 22rpx; color: #aaa; } }
    .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%; }
  }
  .confirm { margin: 0; height: 88rpx; line-height: 88rpx; font-size: 30rpx; font-weight: 600;
    background: $wa-accent; color: #fff; border-radius: 16rpx; &[disabled] { opacity: .55; } }
  .hint { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; }
  .done { text-align: center;
    .done-title { display: block; font-size: 28rpx; color: $wa-muted; }
    .done-amount { display: block; margin: 12rpx 0; font-size: 56rpx; font-weight: 800; color: $wa-accent; }
    .done-tip { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 24rpx; }
    .again { margin: 0; height: 80rpx; line-height: 80rpx; font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: 16rpx; }
  }
}
</style>
