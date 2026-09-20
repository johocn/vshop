<template>
  <view class="page">
    <!-- 收款方式横幅（固定聚合码收款） -->
    <view class="method-banner">
      <text class="method-name">{{ $t('pos.fixedGateTitle') }}</text>
      <text class="method-desc">{{ $t('pos.methodDesc') }}</text>
    </view>

    <!-- 查询输入 -->
    <view class="query-card">
      <input
        class="code-input"
        v-model="kw"
        :placeholder="state === 'result' ? $t('pos.placeholderResult') : $t('pos.placeholder')"
        confirm-type="search"
        @confirm="onLookup"
      />
      <button class="query-btn" :disabled="loading" @tap="onLookup">{{ loading ? $t('pos.querying') : $t('pos.query') }}</button>
    </view>

    <!-- 查询结果：订单 + 确认收款 -->
    <view v-if="result" class="result">
      <view class="card">
        <view class="head">
          <text class="code">#{{ result.code }}</text>
          <text class="st" :style="{ color: stateLabel(REDEMPTION_STATES, result.claimStatus).color }">{{ stateLabel(REDEMPTION_STATES, result.claimStatus).label }}</text>
        </view>
        <view class="kv" v-if="result.customer">
          <text class="l">{{ $t('pos.customer') }}</text>
          <text class="v">{{ result.customer }}</text>
        </view>

        <!-- 应付金额 -->
        <view class="amount-row">
          <text class="amount-label">{{ $t('pos.amountLabel') }}</text>
          <text class="amount">¥ {{ money(result.totalWithTax) }}</text>
        </view>

        <!-- 待交付商品 -->
        <view class="sec">{{ $t('pos.pendingTitle') }}</view>
        <view class="li" v-for="(l, i) in result.lines" :key="i">
          <view class="li-left">
            <text class="name">{{ l.name }}</text>
            <text class="sku">{{ l.sku }}</text>
          </view>
          <text class="qty">×{{ l.quantity }}　¥{{ money(l.amount) }}</text>
        </view>
        <view v-if="!result.lines || !result.lines.length" class="muted">{{ $t('pos.noItems') }}</view>

        <!-- 收款方式 -->
        <view class="pay-row">
          <text class="l">{{ $t('pos.payMethod') }}</text>
          <text class="v fixed">{{ $t('pos.fixedGateTitle') }}</text>
        </view>
      </view>

      <!-- 确认收款 -->
      <button class="collect-btn" :disabled="collecting" @tap="onConfirmCollect">{{ collecting ? $t('pos.processing') : $t('pos.collectBtn') }}</button>
      <text class="tip">{{ $t('pos.collectTip') }}</text>
    </view>

    <view v-if="state === 'empty'" class="empty">{{ $t('pos.empty') }}</view>

    <view style="height: 140rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import {
  fetchPendingRedemptions,
  lookupRedemption,
  claimRedemption,
  isCodPaymentType,
  PendingRedemption,
} from '../../apis/redemption';
import { REDEMPTION_STATES, stateLabel } from '../../constants/orderState';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();

interface PosLine { name: string; sku: string; quantity: number; amount: number }
interface PosResult {
  id: string;                // 订单 id
  code: string;              // 订单号
  totalWithTax: number;
  pickupCode: string;        // 核销码
  claimStatus: string;       // 核销状态（映射到 REDEMPTION_STATES）
  customer?: string;
  lines: PosLine[];
}

const kw = ref('');
const loading = ref(false);
const collecting = ref(false);
const state = ref<'idle' | 'result' | 'empty'>('idle');
const result = ref<PosResult | null>(null);

function money(n?: number | null): string {
  return ((n ?? 0) / 100).toFixed(2);
}

// redemption-* 渠道域状态 → 通用核销展示状态
function mapStatus(r: PendingRedemption): string {
  if (r.claimed) return 'redeemed';
  if (r.status === 'expired') return 'void';
  return 'generated';
}

/**
 * 查单：用核销码或订单号在「本租户渠道待核销自提单」中匹配到 redemption，
 * 再按核销码取订单（应付金额），商品明细取自待核销清单。
 * 走 redemption-* 渠道域接口（@Allow(UpdateOrder)），租户管理员/收银员均可访问。
 */
async function onLookup(): Promise<void> {
  const v = kw.value.trim();
  if (!v) {
    uni.showToast({ title: locale.t('pos.invalidInput'), icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    const { items } = await fetchPendingRedemptions(100);
    const first = items.find((r) => r.code === v || String(r.orderId) === v || String(r.orderCode) === v);
    if (!first) {
      result.value = null;
      state.value = 'empty';
      return;
    }
    let totalWithTax = 0;
    let customer: string | undefined;
    let orderCode = first.orderCode || first.orderId;
    try {
      const look = await lookupRedemption(first.code);
      totalWithTax = look?.order?.totalWithTax ?? 0;
      orderCode = look?.order?.code ?? orderCode;
    } catch (_e) {
      totalWithTax = 0; // lookup 失败不阻塞，金额退 0（正常不出现）
    }
    result.value = {
      id: first.orderId,
      code: orderCode,
      totalWithTax,
      pickupCode: first.code,
      claimStatus: mapStatus(first),
      customer,
      lines: (first.lines || []).map((l) => ({
        name: l.name,
        sku: '',
        quantity: l.quantity,
        amount: l.lineTotalWithTax,
      })),
    };
    state.value = 'result';
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('pos.queryFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/**
 * 确认收款：固定聚合码收款场景下，顾客已扫码付清，店员核销本轮成交。
 * 走 redemptionClaim（@Allow(UpdateOrder)，租户渠道域），collect=true 表示同步确认到店收款。
 */
function buildConfirmContent(r: PosResult): string {
  const summary =
    r.lines.length > 0
      ? r.lines.slice(0, 2).map((l) => `${l.name}×${l.quantity}`).join('、') +
        (r.lines.length > 2 ? locale.t('pos.etcSuffix').replace('{count}', r.lines.length) : '')
      : locale.t('pos.noItems');
  return locale.t('pos.confirmContent')
    .replace('{code}', r.code)
    .replace('{amount}', money(r.totalWithTax))
    .replace('{summary}', summary);
}

async function onConfirmCollect(): Promise<void> {
  const r = result.value;
  if (!r) return;
  if (r.claimStatus === 'redeemed') {
    uni.showToast({ title: locale.t('pos.alreadyClaimed'), icon: 'none' });
    return;
  }
  const proceed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('pos.collectBtn'),
      content: buildConfirmContent(r),
      confirmText: locale.t('pos.collectBtn'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!proceed) return;
  collecting.value = true;
  try {
    uni.showLoading({ title: locale.t('pos.processing') });
    const rr = await claimRedemption(r.pickupCode, true);
    uni.hideLoading();
    if (rr.ok && rr.result?.claimed) {
      uni.showToast({ title: locale.t('pos.collectSuccess'), icon: 'success' });
      reset();
    } else {
      uni.showToast({ title: rr.message || locale.t('pos.processFailed'), icon: 'none' });
    }
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: e?.message || locale.t('pos.processFailed'), icon: 'none' });
  } finally {
    collecting.value = false;
  }
}

function reset(): void {
  result.value = null;
  state.value = 'idle';
  kw.value = '';
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;

  .method-banner {
    background: linear-gradient(135deg, $wa-accent, $wa-accent-dark);
    border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx; color: #fff;
    .method-name { display: block; font-size: 34rpx; font-weight: 700; }
    .method-desc { display: block; font-size: 24rpx; opacity: 0.9; margin-top: 8rpx; }
  }

  .query-card {
    display: flex; align-items: center; gap: 16rpx;
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 24rpx;
    .code-input {
      flex: 1; height: 72rpx; padding: 0 24rpx; font-size: 30rpx;
      background: $wa-bg; border-radius: $wa-radius; color: $wa-ink;
    }
    .query-btn {
      margin: 0; min-width: 160rpx; height: 72rpx; line-height: 72rpx; padding: 0 24rpx;
      font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius;
      &[disabled] { opacity: 0.6; }
    }
  }

  .result {
    .card {
      background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
      .head {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
        .code { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
        .st { font-size: 24rpx; }
      }
      .kv {
        display: flex; justify-content: space-between; font-size: 26rpx; color: $wa-muted; padding: 6rpx 0;
        .v { color: $wa-ink; max-width: 60%; text-align: right; }
      }
      .amount-row {
        display: flex; align-items: baseline; justify-content: space-between;
        padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule; margin-bottom: 16rpx;
        .amount-label { font-size: 26rpx; color: $wa-muted; }
        .amount { font-size: 44rpx; font-weight: 700; color: $wa-danger; }
      }
      .sec { font-size: 26rpx; color: $wa-muted; margin-bottom: 8rpx; }
      .li {
        display: flex; align-items: center; justify-content: space-between; padding: 14rpx 0;
        .li-left { flex: 1; display: flex; flex-direction: column; }
        .name { font-size: 28rpx; color: $wa-ink; }
        .sku { font-size: 22rpx; color: $wa-muted; }
        .qty { font-size: 28rpx; color: $wa-ink; }
      }
      .muted { font-size: 26rpx; color: $wa-muted; padding: 12rpx 0; }
      .pay-row {
        display: flex; justify-content: space-between; font-size: 26rpx;
        color: $wa-muted; padding: 20rpx 0 0; margin-top: 12rpx; border-top: 1rpx solid $wa-rule;
        .v.fixed { color: $wa-accent; font-weight: 600; }
      }
    }
    .collect-btn {
      height: 88rpx; line-height: 88rpx; font-size: 32rpx; font-weight: 600;
      background: $wa-accent; color: #fff; border-radius: $wa-radius; margin: 8rpx 0 16rpx;
      &[disabled] { opacity: 0.6; }
    }
    .tip { display: block; text-align: center; font-size: 24rpx; color: $wa-muted; }
  }

  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>