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

    <!-- 待核销券（默认列表）：点卡片带入券码 -->
    <view v-if="showPending" class="pending">
      <view class="sec">
        <text class="sec-t">{{ $t('inStoreRedeem.pendingTitle') }}</text>
        <text class="sec-n">{{ pendingTotal }}</text>
        <text class="sec-hint">{{ $t('inStoreRedeem.pendingHint') }}</text>
      </view>
      <view v-for="c in pendingItems" :key="c.id" class="cpn" :class="{ pulse: pulseId === c.id }" @tap="onPick(c)">
        <view v-if="isExpiring(c)" class="hot-badge">{{ $t('inStoreRedeem.expiresSoon').replace('{n}', String(expiringDays(c))) }}</view>
        <view class="r1">
          <text class="nm">{{ c.couponName || $t('inStoreRedeem.voucher') }}</text>
          <text class="tag">{{ discountLabel(c.discountType, c.discountValue) }}</text>
        </view>
        <view class="r2">
          <text>{{ $t('inStoreRedeem.customer') }}：{{ c.customerName || '—' }}<text v-if="c.customerPhone"> · {{ c.customerPhone }}</text></text>
        </view>
        <view class="r3">
          <text class="code">{{ c.couponCode }}</text>
          <text class="exp" :class="{ hot: isExpiring(c) }">{{ expLabel(c) }}</text>
        </view>
      </view>
      <view v-if="!pendingItems.length" class="empty">{{ restricted ? $t('inStoreRedeem.pendingRestricted') : $t('inStoreRedeem.pendingEmpty') }}</view>
      <view v-if="pendingHasMore" class="more" @tap="loadMorePending">{{ pendingLoading ? $t('inStoreRedeem.loading') : $t('inStoreRedeem.loadMore') }}</view>
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
          <text class="v">¥{{ fenToYuan(quote.finalAmount) }}</text>
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
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  quoteInStoreBill, redeemInStoreBill, fetchPendingInStoreCoupons, fenToYuan, discountLabel,
  InStoreBillQuote, InStoreBillRow, PendingInStoreCoupon,
} from '../../../apis/in-store-bill';
import { scanCode } from '../../../utils/scanner';
import { useLocaleStore } from '../../../stores/localeStore';
import { useAuthStore } from '../../../stores/authStore';
import { fenToYuanFixed } from '../../../utils/money';

const locale = useLocaleStore();
const auth = useAuthStore();
/** 受限核销员（持有 VerifyOrder 且非超管）：仅在授权配送档案范围内可见/可核销 */
const restricted = computed(() => !auth.isSuperAdmin && auth.permissions.includes('VerifyOrder'));

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

/* ── 待核销券（默认列表）：渠道内未使用/未过期的到店券，点卡片带入券码 ── */
const PENDING_PAGE = 20;
const pendingItems = ref<PendingInStoreCoupon[]>([]);
const pendingTotal = ref(0);
const pendingSkip = ref(0);
const pendingLoading = ref(false);
const pendingLoaded = ref(false);
const pulseId = ref<string | null>(null);
const pendingHasMore = computed(() => pendingItems.value.length < pendingTotal.value);
/** 普通角色无待核销券时整节隐藏；受限核销员始终展示（空态提示未授权/无券） */
const showPending = computed(() => pendingLoaded.value && (pendingItems.value.length > 0 || restricted.value));

async function loadPending(append = false) {
  pendingLoading.value = true;
  try {
    const r = await fetchPendingInStoreCoupons({ skip: append ? pendingSkip.value : 0, take: PENDING_PAGE });
    pendingItems.value = append ? [...pendingItems.value, ...r.items] : r.items;
    pendingTotal.value = r.totalItems;
    pendingSkip.value = pendingItems.value.length;
  } catch {
    /* 列表加载失败不阻塞核销主流程 */
  } finally {
    pendingLoaded.value = true;
    pendingLoading.value = false;
  }
}

function loadMorePending() {
  if (!pendingHasMore.value || pendingLoading.value) return;
  loadPending(true);
}

/** 距过期剩余天数（向上取整）；无过期时间为 null */
function expiringDays(c: PendingInStoreCoupon): number | null {
  if (!c.expiredAt) return null;
  return Math.max(0, Math.ceil((new Date(c.expiredAt).getTime() - Date.now()) / 86400000));
}
/** 临期（≤3 天）高亮 */
function isExpiring(c: PendingInStoreCoupon): boolean {
  const d = expiringDays(c);
  return d != null && d <= 3;
}
function expLabel(c: PendingInStoreCoupon): string {
  const d = expiringDays(c);
  if (d == null) return '—';
  if (isExpiring(c)) return locale.t('inStoreRedeem.expiresSoon').replace('{n}', String(d));
  const dt = new Date(c.expiredAt!);
  const p = (n: number) => String(n).padStart(2, '0');
  return locale.t('inStoreRedeem.expiresOn').replace('{date}', `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`);
}

/** 点卡片 → 券码带入输入框并试算（同扫码路径） */
async function onPick(c: PendingInStoreCoupon) {
  rawCode.value = c.couponCode;
  pulseId.value = c.id;
  setTimeout(() => (pulseId.value = null), 600);
  uni.pageScrollTo({ scrollTop: 0, duration: 200 });
  await load(c.couponCode, originalYuan.value);
}

/** 分 → 元（两位小数）。本地未引入的数值（券卡展示用）用价格格式化兜底。 */
function fen(v: number | null | undefined): string {
  return v == null ? '—' : fenToYuanFixed(v);
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
    SCOPE_MISMATCH: locale.t('inStoreRedeem.errScope'),
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
        loadPending(false); // 已核销券即刻移出待核销列表
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

// 每次进入/返回本页刷新待核销列表（他端核销后回到本页也能看到最新状态）
onShow(() => { loadPending(false); });
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
  .pending {
    .sec { display: flex; align-items: center; gap: 12rpx; margin: 4rpx 2rpx 16rpx;
      .sec-t { font-size: 28rpx; font-weight: 700; color: $wa-ink; }
      .sec-n { min-width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; padding: 0 14rpx;
        font-size: 22rpx; font-weight: 700; color: #fff; background: $wa-accent; border-radius: 999rpx; box-sizing: border-box; }
      .sec-hint { margin-left: auto; font-size: 22rpx; color: $wa-muted; }
    }
    .cpn { position: relative; background: $wa-card; border-radius: 20rpx; padding: 22rpx 24rpx; margin-bottom: 18rpx;
      box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.06); border: 3rpx solid transparent; transition: border-color .15s;
      &.pulse { border-color: $wa-accent; }
      .hot-badge { position: absolute; top: -12rpx; left: -6rpx; font-size: 20rpx; line-height: 32rpx;
        background: #e64340; color: #fff; border-radius: 999rpx; padding: 0 16rpx; font-weight: 700; }
      .r1 { display: flex; align-items: center; gap: 12rpx;
        .nm { flex: 1; min-width: 0; font-size: 28rpx; font-weight: 700; color: $wa-ink;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tag { flex: 0 0 auto; font-size: 24rpx; font-weight: 700; color: #d04b00; background: #fff4ec;
          border: 1rpx solid #ffd9bc; border-radius: 10rpx; padding: 4rpx 14rpx; }
      }
      .r2 { margin-top: 10rpx; font-size: 24rpx; color: $wa-muted; }
      .r3 { display: flex; justify-content: space-between; align-items: center; margin-top: 10rpx;
        .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 27rpx; font-weight: 700;
          color: $wa-ink; letter-spacing: 1rpx; }
        .exp { font-size: 23rpx; color: $wa-muted; &.hot { color: #e64340; font-weight: 700; } }
      }
    }
    .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 48rpx 0; }
    .more { text-align: center; color: $wa-accent; font-size: 26rpx; padding: 20rpx 0; }
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
