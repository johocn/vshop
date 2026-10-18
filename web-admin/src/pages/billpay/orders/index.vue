<template>
  <view class="page">
    <view class="chips">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="chip"
        :class="{ on: tab === t.key }"
        @tap="switchTab(t.key)"
      >{{ $t(t.labelKey) }}</text>
    </view>

    <view class="card" v-for="o in items" :key="o.id">
      <view class="top" @tap="toggle(o.id)">
        <view class="head">
          <text class="no">{{ o.code || ('#' + o.id) }}</text>
          <text class="badge" :class="o.status.toLowerCase()">{{ statusLabel(o.status) }}</text>
        </view>
        <text class="value">¥{{ money(mainAmount(o)) }}</text>
      </view>
      <view class="rows" @tap="toggle(o.id)">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('billpay.merchant') }}</text>
            <text class="v">{{ o.merchantName }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('billpay.amountBasis') }}</text>
            <text class="v">{{ mainAmountLabel(o) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('billpay.customer') }}</text>
            <text class="v">#{{ o.customerId }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('billpay.time') }}</text>
            <text class="v">{{ fmtDT(o.paidAt || o.createdAt) }}</text>
          </view>
        </view>
      </view>

      <!-- 展开详情 + 操作 -->
      <view class="detail" v-if="expanded === o.id">
        <view class="d-row"><text class="k">{{ $t('billpay.expectedBill') }}</text><text class="v">¥{{ money(o.expectedAmount) }}</text></view>
        <view class="d-row" v-if="o.quoteAmount != null"><text class="k">{{ $t('billpay.quotePayable') }}</text><text class="v">¥{{ money(o.quoteAmount) }}</text></view>
        <view class="d-row" v-if="o.actualAmount != null"><text class="k">{{ $t('billpay.actualPaid') }}</text><text class="v">¥{{ money(o.actualAmount) }}</text></view>
        <view class="d-col" v-if="discountList(o).length">
          <text class="k">{{ $t('billpay.discountList') }}</text>
          <text class="v discount" v-for="(d, i) in discountList(o)" :key="i">- ¥{{ money(d.amount) }}（{{ discountLabel(d) }}）</text>
        </view>
        <view class="d-row" v-if="o.remark"><text class="k">{{ $t('billpay.remark') }}</text><text class="v">{{ o.remark }}</text></view>
        <view class="d-row" v-if="o.quoteNote"><text class="k">{{ $t('billpay.quoteNote') }}</text><text class="v">{{ o.quoteNote }}</text></view>
        <view class="d-row" v-if="o.completeNote"><text class="k">{{ $t('billpay.completeNote') }}</text><text class="v">{{ o.completeNote }}</text></view>
        <view class="d-row" v-if="o.quoteExpireAt"><text class="k">{{ $t('billpay.quoteExpire') }}</text><text class="v">{{ fmtDT(o.quoteExpireAt) }}</text></view>
        <view class="d-row" v-if="o.paymentMethod"><text class="k">{{ $t('billpay.payMethod') }}</text><text class="v">{{ payMethodLabel(o.paymentMethod) }}</text></view>
        <view class="d-col" v-if="o.proofUrl">
          <text class="k">{{ $t('billpay.proof') }}</text>
          <image class="proof" :src="o.proofUrl" mode="widthFix" @tap="previewProof(o.proofUrl)" />
        </view>

        <!-- PENDING_QUOTE：报价（改价） -->
        <view class="ops" v-if="o.status === 'PENDING_QUOTE'">
          <view class="form">
            <view class="f-row">
              <text class="k">{{ $t('billpay.quoteAmountLabel') }}</text>
              <input class="f-input" type="digit" v-model="quoteForm.amount" :placeholder="money(o.expectedAmount)" />
            </view>
            <view class="f-row">
              <text class="k">{{ $t('billpay.quoteNoteLabel') }}</text>
              <input class="f-input" type="text" v-model="quoteForm.note" :placeholder="$t('billpay.quoteNotePh')" />
            </view>
            <button class="btn primary" :disabled="acting" @tap="onQuote(o)">{{ $t('billpay.confirmQuote') }}</button>
          </view>
        </view>

        <!-- PAID：接单 / 人工退款 -->
        <view class="ops" v-if="o.status === 'PAID'">
          <button class="btn primary" :disabled="acting" @tap="onAccept(o)">{{ $t('billpay.acceptBtn') }}</button>
          <text class="refund" @tap="onRefund(o)">{{ $t('billpay.manualRefund') }}</text>
        </view>

        <!-- IN_SERVICE：凭证回传 -->
        <view class="ops" v-if="o.status === 'IN_SERVICE'">
          <view class="form">
            <view class="f-row">
              <text class="k">{{ $t('billpay.actualAmountLabel') }}</text>
              <input class="f-input" type="digit" v-model="proofForm.amount" :placeholder="money(o.quoteAmount)" />
            </view>
            <view class="f-row">
              <text class="k">{{ $t('billpay.completeNoteLabel') }}</text>
              <input class="f-input" type="text" v-model="proofForm.note" :placeholder="$t('billpay.completeNotePh')" />
            </view>
            <view class="f-row">
              <text class="k">{{ $t('billpay.proofLabel') }}</text>
              <view class="proof-pick" @tap="pickProof">
                <image v-if="proofForm.proofUrl" :src="proofForm.proofUrl" class="proof" mode="widthFix" />
                <text v-else class="pick-hint">{{ $t('billpay.proofPick') }}</text>
              </view>
            </view>
            <button class="btn primary" :disabled="acting" @tap="onComplete(o)">{{ $t('billpay.completeBtn') }}</button>
          </view>
        </view>

        <!-- COMPLETED：结算 -->
        <view class="ops" v-if="o.status === 'COMPLETED'">
          <button class="btn primary" :disabled="acting" @tap="onSettle(o)">{{ $t('billpay.settleBtn') }}</button>
        </view>
      </view>
      <view class="toggle" v-else @tap="toggle(o.id)"><text>{{ $t('billpay.expand') }}</text></view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('billpay.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('billpay.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('billpay.loadingMore') }}</view>

    <MediaLibraryModal
      v-model:visible="proofModalVisible"
      :max="1"
      media-type="image"
      :value="[]"
      @confirm="onProofConfirm"
    />
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  fetchBillPayOrders, updateBillPayQuote, acceptBillPayOrder,
  completeBillPayOrder, settleBillPayOrder, refundBillPayOrder,
  BILLPAY_STATUS_LABELS, type BillPayOrderRow,
} from '../../../apis/billpay';
import { useLocaleStore } from '../../../stores/localeStore';
import { fenToYuanFixed, yuanToFen } from '../../../utils/money';
import MediaLibraryModal from '../../../components/MediaLibraryModal.vue';

const locale = useLocaleStore();
const t = (k: string) => locale.t(k);

const tabs = [
  { key: '', labelKey: 'billpay.tabAll' },
  { key: 'PENDING_QUOTE', labelKey: 'billpay.tabPendingQuote' },
  { key: 'QUOTED', labelKey: 'billpay.tabQuoted' },
  { key: 'PAID', labelKey: 'billpay.tabPaid' },
  { key: 'IN_SERVICE', labelKey: 'billpay.tabInService' },
  { key: 'COMPLETED', labelKey: 'billpay.tabCompleted' },
  { key: 'SETTLED', labelKey: 'billpay.tabSettled' },
  { key: 'REFUNDED', labelKey: 'billpay.tabRefunded' },
  { key: 'CANCELLED', labelKey: 'billpay.tabCancelled' },
];
const tab = ref('');
const items = ref<BillPayOrderRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const acting = ref(false);
const expanded = ref('');
const PAGE = 20;

const money = fenToYuanFixed;
const statusLabel = (s: string) => BILLPAY_STATUS_LABELS[s] || s;
const payMethodLabel = (m: string) => (m === 'balance' ? t('billpay.payBalance') : t('billpay.payWechat'));

/** 主展示金额：有有效报价显示报价，否则预计账单 */
function quoteExpired(o: BillPayOrderRow): boolean {
  return o.status === 'QUOTED' && !!o.quoteExpireAt && new Date(o.quoteExpireAt).getTime() < Date.now();
}
function mainAmount(o: BillPayOrderRow): number {
  if (o.quoteAmount != null && !quoteExpired(o)) return o.quoteAmount;
  return o.expectedAmount;
}
function mainAmountLabel(o: BillPayOrderRow): string {
  return o.quoteAmount != null && !quoteExpired(o) ? t('billpay.basisQuote') : t('billpay.basisExpected');
}
function discountList(o: BillPayOrderRow) {
  return Array.isArray(o.discountDetail) ? o.discountDetail : [];
}
function discountLabel(d: { rule: string; label?: unknown }): string {
  const l = d.label as { 'zh-CN'?: string; 'en-US'?: string } | string | null | undefined;
  if (typeof l === 'string') return l;
  return l?.['zh-CN'] || l?.['en-US'] || (d.rule === 'memberDiscount' ? t('billpay.tagMember') : t('billpay.tagThreshold'));
}

function fmtDT(t2?: string | null): string {
  if (!t2) return '—';
  const d = new Date(t2);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toggle(id: string) {
  expanded.value = expanded.value === id ? '' : id;
  if (expanded.value) {
    quoteForm.value = { amount: '', note: '' };
    proofForm.value = { amount: '', note: '', proofUrl: '' };
  }
}

// ── 报价 ──
const quoteForm = ref({ amount: '', note: '' });
async function onQuote(o: BillPayOrderRow) {
  const cents = yuanToFen(quoteForm.value.amount);
  if (!cents || cents <= 0) return uni.showToast({ title: t('billpay.toastValidAmount'), icon: 'none' });
  if (!quoteForm.value.note.trim()) return uni.showToast({ title: t('billpay.toastNoteRequired'), icon: 'none' });
  acting.value = true;
  try {
    const updated = await updateBillPayQuote(o.id, cents, quoteForm.value.note.trim());
    Object.assign(o, updated);
    uni.showToast({ title: t('billpay.toastQuoted'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || t('billpay.quoteFailed'), icon: 'none' });
  } finally {
    acting.value = false;
  }
}

// ── 接单 / 结算 ──
function onAccept(o: BillPayOrderRow) {
  uni.showModal({
    title: t('billpay.acceptTitle'),
    content: t('billpay.acceptContent').replace('{merchant}', o.merchantName),
    success: async (r) => {
      if (!r.confirm) return;
      acting.value = true;
      try {
        const updated = await acceptBillPayOrder(o.id);
        Object.assign(o, updated);
        uni.showToast({ title: t('billpay.toastAccepted'), icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || t('billpay.acceptFailed'), icon: 'none' });
      } finally {
        acting.value = false;
      }
    },
  });
}

async function onSettle(o: BillPayOrderRow) {
  uni.showModal({
    title: t('billpay.settleTitle'),
    content: t('billpay.settleContent'),
    success: async (r) => {
      if (!r.confirm) return;
      acting.value = true;
      try {
        const updated = await settleBillPayOrder(o.id);
        Object.assign(o, updated);
        uni.showToast({ title: t('billpay.toastSettled'), icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || t('billpay.settleFailed'), icon: 'none' });
      } finally {
        acting.value = false;
      }
    },
  });
}

// ── 凭证回传 ──
const proofForm = ref({ amount: '', note: '', proofUrl: '' });
const proofModalVisible = ref(false);
function pickProof() {
  proofModalVisible.value = true;
}
function onProofConfirm(assets: { source: string }[]) {
  const a = assets[0];
  if (a?.source) proofForm.value.proofUrl = a.source;
}
async function onComplete(o: BillPayOrderRow) {
  const cents = yuanToFen(proofForm.value.amount);
  if (!cents || cents <= 0) return uni.showToast({ title: t('billpay.toastValidPaid'), icon: 'none' });
  if (!proofForm.value.proofUrl) return uni.showToast({ title: t('billpay.toastProofRequired'), icon: 'none' });
  // 超报价 ±10% 须填写说明（后端亦有校验，前端提前拦截减少来回）
  if (o.quoteAmount != null) {
    const tol = o.quoteAmount * 0.1;
    const over = Math.abs(cents - o.quoteAmount) > tol;
    if (over && !proofForm.value.note.trim()) {
      return uni.showToast({ title: t('billpay.toastTolRequired'), icon: 'none' });
    }
  }
  acting.value = true;
  try {
    const updated = await completeBillPayOrder(o.id, cents, proofForm.value.proofUrl, proofForm.value.note.trim() || undefined);
    Object.assign(o, updated);
    uni.showToast({ title: t('billpay.toastCompleted'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || t('billpay.completeFailed'), icon: 'none' });
  } finally {
    acting.value = false;
  }
}

// ── 人工退款 ──
function onRefund(o: BillPayOrderRow) {
  uni.showModal({
    title: t('billpay.refundTitle'),
    content: t('billpay.refundContent')
      .replace('{code}', o.code || '#' + o.id)
      .replace('{amount}', money(o.quoteAmount ?? o.expectedAmount)),
    editable: true,
    placeholderText: t('billpay.refundPh'),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const updated = await refundBillPayOrder(o.id, r.content || undefined);
        Object.assign(o, updated);
        uni.showToast({ title: t('billpay.toastRefunded'), icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || t('billpay.refundFailed'), icon: 'none' });
      }
    },
  });
}

function previewProof(url: string) {
  if (url) uni.previewImage({ urls: [url], current: url });
}

async function load() {
  loading.value = true;
  try {
    const res = await fetchBillPayOrders({ skip: 0, take: PAGE, status: tab.value });
    items.value = res.items;
    totalItems.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || t('billpay.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    const res = await fetchBillPayOrders({ skip: items.value.length, take: PAGE, status: tab.value });
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } finally {
    loadingMore.value = false;
  }
}

function switchTab(key: string) {
  if (tab.value === key) return;
  tab.value = key;
  expanded.value = '';
  items.value = [];
  load();
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
    .chip { font-size: 24rpx; color: $wa-ink; background: $wa-card; border: 1rpx solid $wa-rule; border-radius: 999rpx; padding: 8rpx 24rpx;
      &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .head { display: flex; align-items: center; flex-wrap: wrap;
        .no { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
        .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; background: #8a9099;
          &.pending_quote { background: #f0821f; }
          &.quoted { background: #2f6fed; }
          &.paid { background: #0a9c6e; }
          &.in_service { background: #7c3aed; }
          &.completed { background: #0a9c6e; }
          &.settled { background: #475569; }
          &.refunded { background: #e64340; }
          &.cancelled { background: #bbb; } } }
      .value { font-size: 30rpx; color: $wa-danger; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; } }
    .rows { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center; min-width: 0;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } } }
    .toggle { margin-top: 8rpx; text-align: center;
      text { font-size: 22rpx; color: $wa-accent; } }
    .detail { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx dashed $wa-rule;
      .d-row { display: flex; justify-content: space-between; gap: 16rpx; margin-bottom: 8rpx;
        .k { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; }
        .v { font-size: 24rpx; color: $wa-ink; text-align: right; word-break: break-all; } }
      .d-col { margin-bottom: 8rpx;
        .k { display: block; font-size: 22rpx; color: $wa-muted; margin-bottom: 6rpx; }
        .v { display: block; font-size: 24rpx; color: $wa-ink; }
        .discount { color: #0a9c6e; } }
      .proof { margin-top: 6rpx; width: 320rpx; border-radius: 12rpx; border: 1rpx solid $wa-rule; }
      .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule; display: flex; flex-direction: column; gap: 14rpx;
        .form { display: flex; flex-direction: column; gap: 14rpx;
          .f-row { display: flex; flex-direction: column; gap: 6rpx;
            .k { font-size: 22rpx; color: $wa-muted; }
            .f-input { background: $wa-bg; border: 1rpx solid $wa-rule; border-radius: 12rpx; padding: 12rpx 20rpx; font-size: 26rpx; color: $wa-ink; } }
          .proof-pick { display: flex; align-items: center; justify-content: center; min-height: 120rpx; border: 2rpx dashed $wa-rule; border-radius: 12rpx;
            .pick-hint { font-size: 24rpx; color: $wa-muted; } } }
        .btn { border-radius: 12rpx; font-size: 28rpx;
          &.primary { background: $wa-accent; color: #fff; }
          &[disabled] { opacity: .5; } }
        .refund { text-align: center; font-size: 26rpx; color: #e64340; } } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
