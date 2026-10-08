<template>
  <view class="page">
    <!-- 头部：状态徽章 + 订单号（可跳订单详情） -->
    <view v-if="detail" class="head card">
      <view class="row">
        <text class="code">{{ $t('afterSale.detail.afterSalePrefix') }}{{ detail.id }}</text>
        <text class="st" :style="{ color: stColor }">{{ stLabel }}</text>
      </view>
      <text class="sub">{{ $t('afterSale.detail.orderPrefix') }}{{ detail.order?.code || detail.orderId }}</text>
      <text class="sub link" v-if="detail.order?.code" @tap="goOrder">{{ $t('afterSale.detail.viewOrder') }} ›</text>
    </view>

    <!-- 顾客卡 -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.customerTitle') }}</text>
      <view class="cust">
        <view class="cmeta">
          <text class="cname">{{ customerName || '—' }}</text>
          <text class="line muted" v-if="detail.customer?.phoneNumber">{{ detail.customer.phoneNumber }}</text>
          <text class="line muted" v-if="detail.customer?.emailAddress">{{ detail.customer.emailAddress }}</text>
        </view>
        <button v-if="detail.customer?.phoneNumber" class="op" @tap="callCustomer">{{ $t('afterSale.detail.callCustomer') }}</button>
      </view>
    </view>

    <!-- 商品卡：有关联订单行单行展示；仅退款整单回退展示整单商品清单 -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.productTitle') }}</text>
      <view class="prod" v-if="productName">
        <image v-if="productThumb" class="thumb" :src="productThumb" mode="aspectFill" />
        <view class="pmeta">
          <text class="pname">{{ productName }}</text>
          <text class="line muted" v-if="productSku">{{ $t('afterSale.detail.skuLabel') }}{{ productSku }}</text>
          <text class="line muted">{{ typeLine }}</text>
        </view>
      </view>
      <template v-else-if="orderLines.length">
        <view class="prod" v-for="(l, i) in orderLines" :key="l.id">
          <image v-if="lineThumb(l)" class="thumb" :src="lineThumb(l)" mode="aspectFill" />
          <view class="pmeta">
            <text class="pname">{{ lineName(l) }}</text>
            <text class="line muted">× {{ l.quantity }}</text>
            <text class="line muted" v-if="i === 0">{{ typeLine }}</text>
          </view>
        </view>
      </template>
      <view class="prod" v-else>
        <view class="pmeta">
          <text class="pname">—</text>
          <text class="line muted">{{ typeLine }}</text>
        </view>
      </view>
    </view>

    <!-- 售后信息 -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.infoTitle') }}</text>
      <view class="cell"><text>{{ $t('afterSale.detail.status') }}</text><text class="val">{{ stLabel }}</text></view>
      <view class="cell" v-if="!isExchange">
        <text>{{ $t('afterSale.detail.refundAmount') }}</text>
        <text class="val danger">¥ {{ money(detail.refundAmount) }}</text>
      </view>
      <view class="cell" v-if="detail.actualRefundAmount != null">
        <text>{{ $t('afterSale.detail.actualRefundAmount') }}</text>
        <text class="val">¥ {{ money(detail.actualRefundAmount) }}</text>
      </view>
      <view class="cell" v-if="detail.refundedAt"><text>{{ $t('afterSale.detail.refundedAt') }}</text><text class="val">{{ fmtTime(detail.refundedAt) }}</text></view>
      <view class="cell" v-if="detail.receivedQuantity != null"><text>{{ $t('afterSale.detail.receivedQuantity') }}</text><text class="val">{{ detail.receivedQuantity }}</text></view>
      <view class="cell" v-if="detail.reason"><text>{{ $t('afterSale.detail.reason') }}</text><text class="val break">{{ detail.reason }}</text></view>
      <view class="cell" v-if="detail.description"><text>{{ $t('afterSale.detail.description') }}</text><text class="val break">{{ detail.description }}</text></view>
      <view class="cell" v-if="detail.rejectReason"><text>{{ $t('afterSale.detail.rejectReason') }}</text><text class="val break">{{ detail.rejectReason }}</text></view>
      <view class="cell" v-if="detail.refundError"><text>{{ $t('afterSale.detail.refundError') }}</text><text class="val break refund-err">{{ detail.refundError }}</text></view>
      <view class="cell" v-if="detail.returnCarrier || detail.returnTrackingNo">
        <text>{{ $t('afterSale.detail.returnLogistics') }}</text>
        <text class="val break">{{ detail.returnCarrier || $t('afterSale.detail.express') }} {{ detail.returnTrackingNo }}</text>
      </view>
      <view class="cell"><text>{{ $t('afterSale.detail.createdAt') }}</text><text class="val">{{ fmtTime(detail.createdAt) }}</text></view>
      <view class="cell" v-if="detail.updatedAt"><text>{{ $t('afterSale.detail.updatedAt') }}</text><text class="val">{{ fmtTime(detail.updatedAt) }}</text></view>
    </view>

    <!-- 处理进度时间线（与 C 端同一套 5 节点划分） -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.progressTitle') }}</text>
      <view class="tl" v-for="(t, i) in timeline" :key="t.key + i" :class="{ on: t.reached, fail: t.failed, cur: t.current }">
        <view class="dot" />
        <view class="tmeta">
          <text class="tlabel">{{ t.label }}</text>
          <text class="line muted" v-if="t.time">{{ t.time }}</text>
          <text class="line fail-text" v-if="t.detail">{{ t.detail }}</text>
        </view>
      </view>
    </view>

    <!-- 顾客凭证 -->
    <view class="card" v-if="detail && detail.evidenceImages && detail.evidenceImages.length">
      <text class="sec-title">{{ $t('afterSale.detail.evidenceTitle') }}</text>
      <view class="grid">
        <image v-for="(u, i) in detail.evidenceImages" :key="i" class="shot" :src="u" mode="aspectFill" @tap="previewEvidence(u)" />
      </view>
    </view>

    <!-- 协商留言（三期） -->
    <view class="card" v-if="detail">
      <text class="sec-title">{{ $t('afterSale.detail.messages') }}</text>
      <view v-if="!msgs.length" class="muted">{{ $t('afterSale.detail.messagesEmpty') }}</view>
      <view class="msg" v-for="m in msgs" :key="m.id" :class="{ mine: m.senderType === 'admin' }">
        <text class="msg-meta">{{ m.senderName }} · {{ fmtTime(m.createdAt) }}</text>
        <view class="bubble">{{ m.content }}</view>
        <view class="msg-imgs" v-if="m.images && m.images.length">
          <image v-for="(u, i) in m.images" :key="i" class="shot" :src="u" mode="aspectFill" />
        </view>
      </view>
      <text class="loadmore" v-if="msgHasMore" @tap="loadMoreMessages">{{ $t('afterSale.detail.messagesLoadMore') }}</text>
      <template v-if="!msgReadonly">
        <textarea class="msg-input" v-model="msgContent" :placeholder="$t('afterSale.detail.messagesPlaceholder')" :maxlength="1000" />
        <button class="op main send" :disabled="msgSending || !msgContent.trim()" @tap="sendMessage">{{ $t('afterSale.detail.messagesSend') }}</button>
      </template>
      <text v-else class="muted small">{{ $t('afterSale.detail.messagesClosed') }}</text>
    </view>

    <!-- 库存回补明细（折叠） -->
    <view class="card" v-if="detail && restockRows.length">
      <view class="fold" @tap="restockOpen = !restockOpen">
        <text class="sec-title no-mb">{{ $t('afterSale.detail.restockTitle') }}</text>
        <text class="fold-x">{{ restockOpen ? '−' : '+' }}</text>
      </view>
      <template v-if="restockOpen">
        <view class="cell" v-for="(r, i) in restockRows" :key="i">
          <text>{{ $t('afterSale.detail.stockLocation') }}{{ r.stockLocationId }}</text>
          <text class="val">× {{ r.quantity }}</text>
        </view>
      </template>
    </view>

    <view v-if="loading" class="empty">{{ $t('afterSale.detail.loading') }}</view>
    <view v-else-if="!detail" class="empty">{{ $t('afterSale.detail.notFound') }}</view>

    <view style="height: 200rpx" />

    <!-- 换货发货弹层（运单号 + 承运商均必填） -->
    <view class="mask" v-if="shipOpen" @tap="shipOpen = false">
      <view class="dialog" @tap.stop>
        <text class="dlg-title">{{ $t('afterSale.detail.exchangeShipTitle') }}</text>
        <input class="dlg-input" v-model="shipTrackingNo" :placeholder="$t('afterSale.detail.exchangeTrackingNo')" />
        <input class="dlg-input" v-model="shipCarrier" :placeholder="$t('afterSale.detail.exchangeCarrier')" />
        <view class="dlg-btns">
          <button class="op" @tap="shipOpen = false">{{ $t('afterSale.list.addressCancel') }}</button>
          <button class="op main" :disabled="false" @tap="onExchangeShipConfirm">{{ $t('afterSale.detail.exchangeShipTitle') }}</button>
        </view>
      </view>
    </view>

    <!-- 吸底操作区：主操作 + （若同时可拒绝）次操作 -->
    <view class="footbar" v-if="detail && hasOps">
      <button v-if="secondaryAction()" class="op" @tap="secondaryAction()!()">{{ $t(secondaryKey) }}</button>
      <button class="op main" @tap="onPrimary">{{ primaryLabel }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchAfterSaleAdmin,
  approveAfterSale,
  rejectAfterSale,
  arbitrateAfterSale,
  confirmAfterSaleReceived,
  processAfterSaleRefund,
  retryAfterSaleRefund,
  exchangeShipAfterSale,
  fetchAfterSaleMessages,
  replyAfterSaleMessage,
  AfterSaleRow,
  AfterSaleOrderLineBrief,
  AfterSaleMessage,
} from '../../../apis/afterSale';
import { AFTER_SALE_TYPES } from '../../../constants/orderState';
import {
  afterSaleActions,
  afterSaleProgressIndex,
  afterSaleStateLabel,
  hasAfterSaleActions,
} from '../../../constants/afterSaleActions';
import { useLocaleStore } from '../../../stores/localeStore';
import { fenToYuanFixed } from '../../../utils/money';

const locale = useLocaleStore();

const detail = ref<AfterSaleRow | null>(null);
const loading = ref(false);

const money = fenToYuanFixed;

const stLabel = computed(() => afterSaleStateLabel(detail.value?.state).label);
const stColor = computed(() => afterSaleStateLabel(detail.value?.state).color);

// 动作可用性：唯一来源 constants/afterSaleActions.ts，严格对齐服务端状态机
const can = computed(() => afterSaleActions(detail.value?.state, detail.value?.type));
const hasOps = computed(() => hasAfterSaleActions(detail.value?.state, detail.value?.type));

// 吸底主按钮文案（主流程动作在任一状态下最多命中一个）
const primaryLabel = computed(() => {
  const c = can.value;
  if (c.arbitrate) return locale.t('afterSale.detail.arbitrateApprove');
  if (c.approve) return locale.t('afterSale.detail.approve');
  if (c.receive) return locale.t('afterSale.detail.receive');
  if (c.exchangeShip) return locale.t('afterSale.detail.exchangeShipTitle');
  if (c.refund) return locale.t('afterSale.detail.refund');
  if (c.retry) return locale.t('afterSale.detail.retry');
  return '';
});

// 库存回补明细折叠态
const restockOpen = ref(false);

const isExchange = computed(() => detail.value?.type === 'exchange');
const productName = computed(() => detail.value?.orderLine?.productVariant?.name ?? '');
const productSku = computed(() => detail.value?.orderLine?.productVariant?.sku ?? '');
const productThumb = computed(
  () =>
    detail.value?.orderLine?.featuredAsset?.preview ??
    detail.value?.orderLine?.productVariant?.featuredAsset?.preview ??
    '',
);
// 仅退款整单无 orderLine：回退展示整单商品清单（详情接口已带 order.lines）
const orderLines = computed<AfterSaleOrderLineBrief[]>(() => detail.value?.order?.lines ?? []);
const lineName = (l: AfterSaleOrderLineBrief): string => l.productVariant?.name || `#${l.id}`;
const lineThumb = (l: AfterSaleOrderLineBrief): string =>
  l.featuredAsset?.preview ?? l.productVariant?.featuredAsset?.preview ?? '';
const typeLine = computed(() =>
  locale
    .t('afterSale.detail.typeLabel')
    .replace('{type}', AFTER_SALE_TYPES[detail.value?.type ?? ''] || detail.value?.type || ''),
);
const customerName = computed(() => {
  const c = detail.value?.customer;
  if (!c) return '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
});

// 时间线（与 C 端同一套 5 节点划分）
const TIMELINE_KEYS = ['Pending', 'Approved', 'Returning', 'Received', 'Refunded'];
const timeline = computed(() => {
  const r = detail.value;
  if (!r) return [] as { key: string; label: string; time: string | null; reached: boolean; current: boolean; failed: boolean; detail?: string | null }[];
  const idx = afterSaleProgressIndex(r.state);
  const baseKeys = isExchange.value ? ['Pending', 'Approved', 'Returning', 'Received', 'ExchangeShipped'] : TIMELINE_KEYS;
  const list = baseKeys.map((k, i) => ({
    key: k,
    label: locale.t(`afterSale.timeline.step${k}`),
    time: (() => {
      const rows = (r.history ?? []).filter((h) => h.toState === k);
      if (rows.length) return fmtTime(rows[rows.length - 1].createdAt);
      return i === 0 ? fmtTime(r.createdAt) : i === idx ? fmtTime(r.updatedAt) : null;
    })(),
    reached: i <= idx,
    current: i === idx && r.state === k,
    failed: false,
    detail: k === 'ExchangeShipped' && (r.exchangeCarrier || r.exchangeTrackingNo)
      ? `${r.exchangeCarrier || ''} ${r.exchangeTrackingNo || ''}`.trim()
      : k === 'Returning' && (r.returnCarrier || r.returnTrackingNo)
      ? `${r.returnCarrier || ''} ${r.returnTrackingNo || ''}`.trim()
      : null,
  }));
  if (r.state === 'RefundFailed') {
    list.push({ key: 'RefundFailed', label: locale.t('afterSale.detail.statusFailed'), time: (() => { const rows = (r.history ?? []).filter((h) => h.toState === r.state); return rows.length ? fmtTime(rows[rows.length - 1].createdAt) : fmtTime(r.updatedAt); })(), reached: true, current: true, failed: true, detail: null });
  } else if (r.state === 'Rejected') {
    list.push({ key: 'Rejected', label: locale.t('afterSale.detail.statusRejected'), time: (() => { const rows = (r.history ?? []).filter((h) => h.toState === r.state); return rows.length ? fmtTime(rows[rows.length - 1].createdAt) : fmtTime(r.updatedAt); })(), reached: true, current: true, failed: true, detail: r.rejectReason ?? null });
  } else if (r.state === 'Appealed') {
    list.push({ key: 'Appealed', label: locale.t('afterSale.detail.statusAppealed'), time: (() => { const rows = (r.history ?? []).filter((h) => h.toState === 'Appealed'); return rows.length ? fmtTime(rows[rows.length - 1].createdAt) : fmtTime(r.updatedAt); })(), reached: true, current: true, failed: false, detail: null });
  } else if (r.state === 'Closed') {
    list.push({ key: 'Closed', label: locale.t('afterSale.detail.statusClosed'), time: (() => { const rows = (r.history ?? []).filter((h) => h.toState === r.state); return rows.length ? fmtTime(rows[rows.length - 1].createdAt) : fmtTime(r.updatedAt); })(), reached: true, current: true, failed: false, detail: null });
  }
  return list;
});

// 库存回补明细（restockJson: [{ stockLocationId, quantity }]）
const restockRows = computed(() => {
  const raw = detail.value?.restockJson;
  if (!raw) return [] as { stockLocationId: string; quantity: number }[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function refresh() {
  if (!detail.value?.id) return;
  loading.value = true;
  try {
    detail.value = await fetchAfterSaleAdmin(detail.value.id);
  } finally {
    loading.value = false;
  }
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

async function run(action: () => Promise<AfterSaleRow>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await refresh();
  } catch (e: any) {
    // 失败不改本地状态，刷新后以服务端为准
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  }
}

function onApprove() {
  uni.showModal({
    title: locale.t('afterSale.detail.approveTitle'),
    content: locale.t('afterSale.detail.approveContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) void run(() => approveAfterSale(detail.value!.id), locale.t('afterSale.detail.approved')); },
  });
}

function onReject() {
  uni.showModal({
    title: locale.t('afterSale.detail.rejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: (res) => {
      if (!res.confirm || !detail.value) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      void run(() => rejectAfterSale(detail.value!.id, reason), locale.t('afterSale.detail.rejected'));
    },
  });
}

function onReceive() {
  uni.showModal({
    title: locale.t('afterSale.detail.receiveTitle'),
    content: locale.t('afterSale.detail.receiveContent'),
    success: (res) => { if (res.confirm && detail.value) void run(() => confirmAfterSaleReceived(detail.value!.id), locale.t('afterSale.detail.received')); },
  });
}

function onRefund() {
  uni.showModal({
    title: locale.t('afterSale.detail.refundTitle'),
    content: locale.t('afterSale.detail.refundContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) void run(() => processAfterSaleRefund(detail.value!.id), locale.t('afterSale.detail.refundInitiated')); },
  });
}

function onRetry() {
  uni.showModal({
    title: locale.t('afterSale.detail.retryTitle'),
    content: locale.t('afterSale.detail.retryContent'),
    success: (res) => { if (res.confirm && detail.value) void run(() => retryAfterSaleRefund(detail.value!.id), locale.t('afterSale.detail.retryInitiated')); },
  });
}

// ---- 平台仲裁（四期）：同意退款 / 维持拒绝（说明必填） ----
function onArbitrateApprove() {
  uni.showModal({
    title: locale.t('afterSale.detail.arbitrateApproveTitle'),
    content: locale.t('afterSale.detail.arbitrateApproveContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) void run(() => arbitrateAfterSale(detail.value!.id, true), locale.t('afterSale.detail.arbitrateApproved')); },
  });
}

function onArbitrateReject() {
  uni.showModal({
    title: locale.t('afterSale.detail.arbitrateRejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.arbitrateNotePlaceholder'),
    success: (res) => {
      if (!res.confirm || !detail.value) return;
      const note = (res.content || '').trim();
      if (!note) { toast(locale.t('afterSale.detail.arbitrateNoteRequired')); return; }
      void run(() => arbitrateAfterSale(detail.value!.id, false, note), locale.t('afterSale.detail.arbitrateRejected'));
    },
  });
}

// ---- 换货发货（三期）：弹层填新品运单号 + 承运商，均必填 ----
const shipOpen = ref(false);
const shipTrackingNo = ref('');
const shipCarrier = ref('');

function onExchangeShip() {
  shipTrackingNo.value = detail.value?.exchangeTrackingNo || '';
  shipCarrier.value = detail.value?.exchangeCarrier || '';
  shipOpen.value = true;
}

async function onExchangeShipConfirm() {
  if (!detail.value) return;
  const no = shipTrackingNo.value.trim();
  const carrier = shipCarrier.value.trim();
  if (!no || !carrier) { toast(locale.t('afterSale.detail.exchangeShipRequired')); return; }
  try {
    await exchangeShipAfterSale(detail.value.id, no, carrier);
    shipOpen.value = false;
    uni.showToast({ title: locale.t('afterSale.detail.exchangeShipDone'), icon: 'success' });
    await refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  }
}

// ---- 协商留言（三期）：气泡列表 + 回复输入；Closed 只读 ----
const msgs = ref<AfterSaleMessage[]>([]);
const msgTotal = ref(0);
const msgContent = ref('');
const msgSending = ref(false);
const MSG_TAKE = 20;

async function loadMessages() {
  if (!detail.value?.id) return;
  try {
    const r = await fetchAfterSaleMessages(detail.value.id, 0, MSG_TAKE);
    msgs.value = r.items;
    msgTotal.value = r.total;
  } catch (e) { console.error('loadMessages failed', e); }
}

const msgHasMore = computed(() => msgs.value.length < msgTotal.value);
async function loadMoreMessages() {
  if (!detail.value?.id) return;
  const r = await fetchAfterSaleMessages(detail.value.id, msgs.value.length, MSG_TAKE);
  msgs.value = [...msgs.value, ...r.items];
  msgTotal.value = r.total;
}

const msgReadonly = computed(() => detail.value?.state === 'Closed');
async function sendMessage() {
  if (!detail.value || !msgContent.value.trim()) return;
  msgSending.value = true;
  try {
    await replyAfterSaleMessage(detail.value.id, msgContent.value.trim());
    msgContent.value = '';
    await loadMessages();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.detail.opFailed'));
  } finally {
    msgSending.value = false;
  }
}

function callCustomer() {
  const phone = detail.value?.customer?.phoneNumber;
  if (phone) uni.makePhoneCall({ phoneNumber: phone });
}

function previewEvidence(url: string) {
  uni.previewImage({ urls: detail.value?.evidenceImages ?? [], current: url });
}

function goOrder() {
  const code = detail.value?.order?.code;
  if (code) uni.navigateTo({ url: `/pages/order/detail/index?code=${code}` });
}

function onPrimary() {
  const c = can.value;
  if (c.arbitrate) onArbitrateApprove();
  else if (c.approve) onApprove();
  else if (c.receive) onReceive();
  else if (c.exchangeShip) onExchangeShip();
  else if (c.refund) onRefund();
  else if (c.retry) onRetry();
}

// 吸底次按钮：Appealed 态为「维持拒绝」，其余为「拒绝」
const secondaryKey = computed(() => (can.value.arbitrate ? 'afterSale.detail.arbitrateReject' : 'afterSale.detail.reject'));

function secondaryAction(): (() => void) | null {
  const c = can.value;
  if (c.arbitrate) return onArbitrateReject;
  if (c.reject) return onReject;
  if (c.approve && (c.receive || c.refund || c.retry)) return onReject;
  return null;
}

onLoad(async (q) => {
  const id: string = (q && (q.id as string)) || '';
  loading.value = true;
  try {
    detail.value = await fetchAfterSaleAdmin(id);
    void loadMessages();
  } finally {
    loading.value = false;
  }
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .cust { display: flex; align-items: center; gap: 16rpx;
    .cmeta { flex: 1; min-width: 0;
      .cname { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; } }
    .op { min-width: 144rpx; margin: 0; padding: 0 20rpx; height: 60rpx; line-height: 60rpx;
      font-size: 26rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink; }
  }
  .prod { display: flex; gap: 16rpx; align-items: center;
    .thumb { width: 112rpx; height: 112rpx; border-radius: $wa-radius; background: $wa-bg; flex-shrink: 0; }
    .pmeta { flex: 1; min-width: 0;
      .pname { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; } }
  }
  .tl { position: relative; padding-left: 36rpx; padding-bottom: 20rpx;
    &:last-child { padding-bottom: 0; }
    &::before { content: ''; position: absolute; left: 9rpx; top: 18rpx; bottom: -4rpx;
      width: 2rpx; background: $wa-bg; }
    &:last-child::before { display: none; }
    .dot { position: absolute; left: 0; top: 8rpx; width: 20rpx; height: 20rpx;
      border-radius: 50%; background: $wa-bg; }
    &.on .dot { background: $wa-accent; }
    &.fail .dot { background: $wa-danger; }
    .tmeta { display: flex; flex-direction: column; gap: 4rpx;
      .tlabel { font-size: 28rpx; color: $wa-muted; }
      .fail-text { color: $wa-danger; } }
    &.on .tmeta .tlabel { color: $wa-ink; font-weight: 600; }
  }
  .grid { display: flex; flex-wrap: wrap; gap: 16rpx;
    .shot { width: 180rpx; height: 180rpx; border-radius: $wa-radius; background: $wa-bg; } }
  .fold { display: flex; align-items: center; justify-content: space-between;
    .no-mb { margin-bottom: 0; }
    .fold-x { font-size: 34rpx; color: $wa-muted; } }
  .link { color: $wa-accent; }
  .footbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
    display: flex; gap: 20rpx; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background: $wa-card; box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.06);
    .op { flex: 1; margin: 0; height: 84rpx; line-height: 84rpx; font-size: 30rpx;
      border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
      &.main { background: $wa-accent; color: #fff; } }
  }
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
    .line { display: block; font-size: 28rpx; color: $wa-ink; line-height: 1.6; word-break: break-all;
      &.muted { color: $wa-muted; }
    }
    .cell {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 28rpx; color: $wa-ink; padding: 10rpx 0;
      .val { color: $wa-ink; text-align: right;
        &.break { flex: 1; margin-left: 24rpx; word-break: break-all; }
        &.danger { color: $wa-danger; font-weight: 600; }
        &.refund-err { color: $wa-danger; }
      }
    }
  }
  .head {
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 34rpx; font-weight: 600; color: $wa-ink; }
      .st { font-size: 24rpx; }
    }
    .sub { display: block; margin-top: 12rpx; font-size: 26rpx; color: $wa-muted; }
    .ops { margin-top: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap;
      .op {
        min-width: 168rpx; margin: 0; padding: 0 24rpx; height: 64rpx; line-height: 64rpx;
        font-size: 28rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; }
      }
    }
  }
  .mask { position: fixed; inset: 0; z-index: 99; background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center;
    .dialog { width: 600rpx; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 32rpx;
      .dlg-title { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 24rpx; }
      .dlg-input { height: 72rpx; border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 0 20rpx;
        font-size: 28rpx; color: $wa-ink; margin-bottom: 20rpx; }
      .dlg-btns { display: flex; gap: 20rpx; margin-top: 8rpx;
        .op { flex: 1; margin: 0; height: 72rpx; line-height: 72rpx; font-size: 28rpx;
          border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
          &.main { background: $wa-accent; color: #fff; } } } } }
  .msg { display: flex; flex-direction: column; align-items: flex-start; padding: 12rpx 0;
    &.mine { align-items: flex-end; }
    .msg-meta { font-size: 22rpx; color: $wa-muted; margin-bottom: 6rpx; }
    .bubble { max-width: 80%; background: $wa-bg; border-radius: 12rpx; padding: 14rpx 20rpx;
      font-size: 26rpx; color: $wa-ink; word-break: break-all; }
    &.mine .bubble { background: rgba(37, 99, 235, 0.1); }
    .msg-imgs { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 10rpx;
      .shot { width: 120rpx; height: 120rpx; border-radius: $wa-radius; background: $wa-bg; } } }
  .loadmore { display: block; text-align: center; font-size: 24rpx; color: $wa-accent; padding: 12rpx 0; }
  .msg-input { width: 100%; min-height: 120rpx; border: 1rpx solid $wa-rule; border-radius: $wa-radius;
    padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; margin-top: 16rpx; box-sizing: border-box; }
  .send { width: 100%; margin-top: 16rpx; }
  .small { font-size: 22rpx; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
