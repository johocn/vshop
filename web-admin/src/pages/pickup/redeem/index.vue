<template>
  <view class="page">
    <view class="head">
      <text class="head-title">{{ $t('pickupRedeem.headTitle') }}</text>
      <text class="badge">{{ total }}</text>
    </view>

    <!-- 核销输入 -->
    <view class="claim-card" :class="{ pulse: pulsing }">
      <input
        ref="codeInput"
        class="code-input"
        v-model="rawCode"
        :placeholder="$t('pickupRedeem.inputPlaceholder')"
        :maxlength="320"
        confirm-type="done"
        @confirm="onClaim"
      />
      <button class="scan-btn" @tap="onScan">{{ $t('pickupRedeem.scan') }}</button>
      <button class="claim-btn" :disabled="claiming" @tap="onClaim">{{ claiming ? $t('pickupRedeem.claiming') : $t('pickupRedeem.claim') }}</button>
    </view>

    <!-- 待核销自提单列表 -->
    <text class="sec-title">{{ $t('pickupRedeem.secTitle') }}</text>
    <view class="card" v-for="r in orders" :key="r.orderId" @tap="fillCode(r.code)">
      <view class="rhead">
        <view class="left">
          <text class="code">#{{ r.orderCode || r.orderId }}</text>
          <text v-if="isCodPaymentType(r.paymentType) && !r.collected" class="tag-cod">{{ $t('pickupRedeem.tagCod') }}</text>
        </view>
        <text class="st" :style="{ color: st(r.status).color }">{{ st(r.status).label }}</text>
      </view>

      <view class="goods" v-if="r.lines && r.lines.length">
        <view class="grow" v-for="(ln, i) in r.lines" :key="i">
          <text class="gname">{{ ln.name }}</text>
          <text class="gqty">×{{ ln.quantity }}</text>
          <text class="gamt">¥{{ fenToYuan(ln.lineTotalWithTax) }}</text>
        </view>
      </view>
      <view class="goods" v-else>
        <view class="grow"><text class="gname">{{ $t('pickupRedeem.goodsInfo') }}</text><text class="gqty"></text><text class="gamt">—</text></view>
      </view>

      <view class="foot">
        <text class="pill">{{ r.code }}</text>
        <text class="exp" :class="{ hot: r.status === 'expiring_soon' }">{{ formatExpiry(r.expiresAt, r.status) }}</text>
      </view>
    </view>
    <view v-if="!orders.length" class="empty">{{ $t('pickupRedeem.empty') }}</view>

    <view style="height: 140rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  fetchPendingRedemptions,
  claimRedemption,
  lookupRedemption,
  decodeRedemptionInput,
  isCodPaymentType,
  PendingRedemption,
} from '../../../apis/redemption';
import { scanCode } from '../../../utils/scanner';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const rawCode = ref('');
const orders = ref<PendingRedemption[]>([]);
const total = ref(0);
const pulsing = ref(false);
let pulseTimer: number | undefined;
const claiming = ref(false);
const codeInput = ref<unknown | null>(null);

const REDEEM_LABELS: Record<string, { key: string; color: string }> = {
  active: { key: 'statusActive', color: '#2563eb' },
  expiring_soon: { key: 'statusExpiring', color: '#f59e0b' },
  expired: { key: 'statusExpired', color: '#e64340' },
  claimed: { key: 'statusClaimed', color: '#059669' },
};
function st(status?: string): { label: string; color: string } {
  const hit = (status && REDEEM_LABELS[status]) || { key: '', color: '#72767b' };
  return { label: hit.key ? locale.t('pickupRedeem.' + hit.key) : status || '—', color: hit.color };
}

function formatTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 有效期人性化展示（状态判断优先） */
function formatExpiry(t?: string | null, status?: string): string {
  if (!t) return '—';
  if (status === 'expired') return locale.t('pickupRedeem.statusExpired');
  const d = new Date(t);
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return locale.t('pickupRedeem.expired');
  if (sameDay) return locale.t('pickupRedeem.todayExpire').replace('{hm}', hm);
  if (ms < 24 * 3600_000) return locale.t('pickupRedeem.leftHours').replace('{hours}', String(Math.max(1, Math.ceil(ms / 3600_000)))).replace('{hm}', hm);
  return locale.t('pickupRedeem.dateExpire').replace('{m}', p(d.getMonth() + 1)).replace('{d}', p(d.getDate())).replace('{hm}', hm);
}

/** 分（Vendure Money）→ 元 */
function fenToYuan(v?: number): string {
  return v == null ? '—' : (v / 100).toFixed(2);
}

async function loadList(): Promise<void> {
  try {
    const r = await fetchPendingRedemptions(100);
    orders.value = r.items;
    total.value = r.totalItems || r.items.length;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('pickupRedeem.loadFailed'), icon: 'none' });
  }
}

function fillCode(code: string): void {
  rawCode.value = code;
  pulseHighlight();
}

/** 核销码填入高亮动效：600ms 后自动复位 */
function pulseHighlight(): void {
  pulsing.value = true;
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => (pulsing.value = false), 600) as unknown as number;
}

onLoad(async (q) => {
  const c = (q && (q.code as string)) || '';
  const orderId = (q && (q.orderId as string)) || '';
  if (c) {
    rawCode.value = decodeRedemptionInput(c) || c;
  } else if (orderId) {
    // 订单详情「去核销」跳转带 orderId → 从待核销列表匹配出该单核销码预填
    try {
      const { items } = await fetchPendingRedemptions(200);
      const hit = items.find((r) => String(r.orderId) === String(orderId));
      if (hit) rawCode.value = hit.code;
    } catch (_e) {
      /* 匹配失败不阻塞，用户可手输 */
    }
  }
  loadList();
});

// onShow 在每次进入/返回本页时刷新列表（含核销成功后）
onShow(() => { loadList(); });

function focusInput(): void {
  try {
    (codeInput.value as any)?.focus?.();
  } catch { /* 忽略 */ }
}

async function onScan(): Promise<void> {
  try {
    const text = await scanCode();
    const code = decodeRedemptionInput(text || '');
    if (!code) {
      uni.showToast({ title: locale.t('pickupRedeem.scanUnrecognized'), icon: 'none' });
      focusInput();
      return;
    }
    rawCode.value = code;
    pulseHighlight();
    await onClaim();
  } catch (e: any) {
    if (e?.code === 'MANUAL') {
      uni.showToast({ title: e?.message || locale.t('pickupRedeem.scanManual'), icon: 'none' });
      focusInput();
    } else if (e?.code === 'FAILED') {
      uni.showToast({ title: e?.message || locale.t('pickupRedeem.scanFailed'), icon: 'none' });
      focusInput();
    }
    // CANCEL 静默
  }
}

async function onClaim(): Promise<void> {
  const code = decodeRedemptionInput(rawCode.value);
  if (!code) {
    uni.showToast({ title: locale.t('pickupRedeem.invalidCode'), icon: 'none' });
    return;
  }
  claiming.value = true;
  try {
    // 先查单：判断是否为「到店/货到付款」且尚未收款（命中需走收款确认分支）
    let codUnpaid = false;
    let amount: number | undefined;
    try {
      const look = await lookupRedemption(code);
      codUnpaid = !!look && !look.claimed && isCodPaymentType(look.paymentType) && !look.collected;
      amount = look?.order?.totalWithTax;
    } catch {
      codUnpaid = false; // lookUp 失败不阻塞，回退按普通单直接核销
    }

    if (codUnpaid) {
      // 先试「不确认收款」：force 模式会被后端拒绝并返回 collectRequired
      const r0 = await claimRedemption(code);
      if (r0.result?.collectRequired) {
        // 强制收款：必须确认收款后方可核销
        const ok = await confirmCollect(
          locale.t('pickupRedeem.confirmTitle'),
          locale.t('pickupRedeem.forceContent').replace('{amount}', fenToYuan(amount)),
          locale.t('pickupRedeem.forceBtn'),
        );
        if (!ok) {
          uni.showToast({ title: locale.t('pickupRedeem.cancelled'), icon: 'none' });
          return;
        }
        const r2 = await claimRedemption(code, true);
        const done = r2.ok && r2.result?.claimed;
        uni.showToast({ title: done ? locale.t('pickupRedeem.redeemedConfirmed') : r2.message || locale.t('pickupRedeem.claimFailed'), icon: done ? 'success' : 'none' });
      } else if (r0.ok && r0.result?.claimed) {
        // 可选模式：已核销但待收款 → 询问是否同步确认收款（高亮提示）
        const yes = await confirmCollect(
          locale.t('pickupRedeem.redeemPendingTitle'),
          locale.t('pickupRedeem.pendingContent').replace('{amount}', fenToYuan(amount)),
          locale.t('pickupRedeem.pendingBtn'),
        );
        if (yes) await claimRedemption(code, true);
        uni.showToast({ title: locale.t('pickupRedeem.redeemed'), icon: 'success' });
      } else {
        uni.showToast({ title: r0.message || locale.t('pickupRedeem.claimFailed'), icon: 'none' });
      }
    } else {
      const r = await claimRedemption(code);
      const done = r.ok && r.result?.claimed;
      uni.showToast({ title: done ? locale.t('pickupRedeem.redeemed') : r.message || locale.t('pickupRedeem.claimFailed'), icon: done ? 'success' : 'none' });
    }

    rawCode.value = '';
    await loadList();
  } finally {
    claiming.value = false;
  }
}

/** 统一收款确认弹窗；返回 true=确认收款 */
function confirmCollect(title: string, content: string, confirmText: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText,
      cancelText: locale.t('pickupRedeem.cancel'),
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 60rpx;
  .head {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
    .head-title { font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .badge {
      min-width: 48rpx; text-align: center; font-size: 26rpx; font-weight: 700; color: #fff;
      background: $wa-accent; border-radius: 999rpx; padding: 6rpx 18rpx;
      box-shadow: 0 6rpx 18rpx rgba(255, 102, 0, 0.28);
    }
  }
  .claim-card {
    display: flex; align-items: center; gap: 16rpx;
    background: $wa-card; border-radius: 20rpx; padding: 20rpx; margin-bottom: 28rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.06); border: 2rpx solid transparent;
    transition: border-color 0.2s, transform 0.2s;
    &.pulse { border-color: $wa-accent; transform: translateY(-2rpx); }
    .code-input {
      flex: 1; height: 76rpx; padding: 0 24rpx; font-size: 34rpx; font-weight: 700;
      letter-spacing: 4rpx; font-family: ui-monospace, Menlo, Consolas, monospace;
      background: $wa-bg; border-radius: 16rpx; color: $wa-ink;
    }
    .claim-btn {
      margin: 0; min-width: 176rpx; height: 76rpx; line-height: 76rpx; padding: 0 28rpx;
      font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: 16rpx; font-weight: 600;
      &[disabled] { opacity: 0.6; }
    }
    .scan-btn {
      margin: 0; min-width: 132rpx; height: 76rpx; line-height: 76rpx; padding: 0 20rpx;
      font-size: 28rpx; background: $wa-ink; color: #fff; border-radius: 16rpx;
    }
  }
  .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
  .card {
    background: $wa-card; border-radius: 20rpx; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.05);
    .rhead {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
      .left { display: flex; align-items: center; gap: 12rpx; }
      .code { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
      .st { font-size: 24rpx; }
      .tag-cod {
        display: inline-flex; align-items: center; padding: 2rpx 14rpx; border-radius: 8rpx;
        font-size: 22rpx; color: #b45309; background: #fef3c7; border: 1rpx solid #fcd34d;
      }
    }
    .goods { margin-bottom: 12rpx; }
    .grow {
      display: flex; align-items: center; gap: 12rpx; padding: 6rpx 0; font-size: 26rpx;
      .gname { flex: 1; color: $wa-ink; }
      .gqty { color: $wa-muted; }
      .gamt { font-weight: 700; color: $wa-ink; }
    }
    .foot {
      display: flex; align-items: center; justify-content: space-between;
      border-top: 1rpx dashed $wa-rule; padding-top: 18rpx;
      .pill {
        font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 800; letter-spacing: 3rpx;
        font-size: 28rpx; color: #d04b00; background: #fff4ec; border: 1rpx solid #ffd9bc;
        border-radius: 12rpx; padding: 4rpx 18rpx;
      }
      .exp { font-size: 24rpx; color: $wa-muted; &.hot { color: $pm-warning; font-weight: 600; } }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 100rpx 0; }
}
</style>
