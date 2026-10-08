<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key || 'all'" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('afterSale.list.' + s.label) }}
      </text>
    </view>

    <!-- 首屏只留搜索框 + 筛选开关；详细筛选默认折叠 -->
    <view class="filters">
      <view class="kwrow">
        <input
          class="kw"
          :value="kw"
          :placeholder="$t('afterSale.list.filterKeyword')"
          confirm-type="search"
          @input="(e:any) => (kw = e.detail.value)"
          @confirm="onApply"
        />
        <text class="toggle" @tap="filtersOpen = !filtersOpen">
          {{ filtersOpen ? $t('afterSale.list.filterHide') : $t('afterSale.list.filterApply') }}
        </text>
      </view>

      <template v-if="filtersOpen">
        <view class="chips">
          <text class="chip" :class="{ on: !typeFilter }" @tap="onType('')">{{ $t('afterSale.list.filterTypeAll') }}</text>
          <text
            class="chip"
            v-for="k in typeKeys"
            :key="k"
            :class="{ on: typeFilter === k }"
            @tap="onType(k)"
          >{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[k] || k) }}</text>
        </view>
        <view class="ranges">
          <picker mode="date" :value="from" @change="(e:any) => onDate('from', e.detail.value)">
            <text class="range">{{ $t('afterSale.list.filterDateFrom') }}：{{ from || '—' }}</text>
          </picker>
          <picker mode="date" :value="to" @change="(e:any) => onDate('to', e.detail.value)">
            <text class="range">{{ $t('afterSale.list.filterDateTo') }}：{{ to || '—' }}</text>
          </picker>
        </view>
        <view class="ranges">
          <input class="num" type="digit" :value="minRefund" :placeholder="$t('afterSale.list.filterRefundMin')"
            @input="(e:any) => (minRefund = e.detail.value)" @blur="onApply" />
          <input class="num" type="digit" :value="maxRefund" :placeholder="$t('afterSale.list.filterRefundMax')"
            @input="(e:any) => (maxRefund = e.detail.value)" @blur="onApply" />
        </view>
        <view class="chips">
          <text class="chip" :class="{ on: sortBy === 'createdAt' }" @tap="onSort('createdAt')">{{ $t('afterSale.list.sortCreated') }}</text>
          <text class="chip" :class="{ on: sortBy === 'refundAmount' }" @tap="onSort('refundAmount')">{{ $t('afterSale.list.sortRefund') }}</text>
          <text class="chip" @tap="onClear">{{ $t('afterSale.list.filterClear') }}</text>
        </view>
      </template>
    </view>

    <!-- 工具栏：退货地址 + 导出 -->
    <view class="tools">
      <button class="tool" @tap="onOpenAddress">{{ $t('afterSale.list.returnAddress') }}</button>
      <button class="tool" @tap="onExport">{{ $t('afterSale.list.export') }}</button>
    </view>

    <view class="card" v-for="a in page.items.value" :key="a.id" @tap="goDetail(a)">
      <view class="row">
        <view class="pickrow">
          <view class="pick" :class="{ on: selected.includes(a.id) }" @tap.stop="togglePick(a.id)">✓</view>
          <text class="code">{{ $t('afterSale.list.afterSalePrefix') }}{{ a.id }} · {{ $t('afterSale.list.orderPrefix') }}{{ a.order?.code || a.orderId }}</text>
        </view>
        <text class="st" :style="{ color: st(a).color }">{{ st(a).label }}</text>
      </view>
      <view class="prod">
        <image v-if="productThumb(a)" class="thumb" :src="productThumb(a)" mode="aspectFill" />
        <view class="pmeta">
          <text class="pname">{{ productName(a) }}</text>
          <text class="line">{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[a.type] || a.type) }}<template v-if="a.type !== 'exchange'"> · {{ $t('afterSale.list.refundAmountLabel').replace('{amount}', money(a.refundAmount)) }}</template></text>
          <text class="line" v-if="customerText(a)">{{ customerText(a) }}</text>
        </view>
      </view>
      <text class="line" :class="{ danger: waitingOver24h(a) }">
        {{ waitingText(a) }} · {{ $t('afterSale.list.createdAtLabel') }}{{ fmtTime(a.createdAt) }}
      </text>
      <text class="line" v-if="a.reason">{{ $t('afterSale.list.reasonLabel').replace('{reason}', a.reason) }}</text>
      <text class="line" v-if="a.rejectReason">{{ $t('afterSale.list.rejectLabel').replace('{reason}', a.rejectReason) }}</text>

      <view class="ops" v-if="afterSaleActions(a.state).approve || afterSaleActions(a.state).reject || afterSaleActions(a.state).receive || afterSaleActions(a.state).refund || afterSaleActions(a.state).retry">
        <button v-if="afterSaleActions(a.state).approve" class="op main" @tap="stop" @click="onCardApprove(a)">{{ $t('afterSale.detail.approve') }}</button>
        <button v-if="afterSaleActions(a.state).reject" class="op" @tap="stop" @click="onCardReject(a)">{{ $t('afterSale.detail.reject') }}</button>
        <button v-if="afterSaleActions(a.state).receive" class="op main" @tap="stop" @click="onCardReceive(a)">{{ $t('afterSale.detail.receive') }}</button>
        <button v-if="afterSaleActions(a.state).refund" class="op main" @tap="stop" @click="onCardRefund(a)">{{ $t('afterSale.detail.refund') }}</button>
        <button v-if="afterSaleActions(a.state).retry" class="op" @tap="stop" @click="onCardRetry(a)">{{ $t('afterSale.detail.retry') }}</button>
        <button class="op" @tap="stop" @click="goDetail(a)">{{ $t('afterSale.list.detailBtn') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('afterSale.list.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('afterSale.list.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">{{ cur === 'Pending' ? $t('afterSale.list.emptyPending') : $t('afterSale.list.empty') }}</view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('afterSale.list.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('afterSale.list.noMore') }}</view>
    <view class="progress" v-if="page.total.value">
      {{ $t('afterSale.list.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}
    </view>

    <!-- 批量操作条 -->
    <view class="batchbar" v-if="selected.length">
      <text class="bcount">{{ $t('afterSale.list.selectedCount').replace('{n}', String(selected.length)) }}</text>
      <button class="bop" @tap="onBatchApprove">{{ $t('afterSale.list.batchApprove') }}</button>
      <button class="bop" @tap="onBatchReject">{{ $t('afterSale.list.batchReject') }}</button>
      <button class="bop ghost" @tap="selected = []">{{ $t('afterSale.list.batchCancel') }}</button>
    </view>

    <view style="height: 160rpx" />
    <BottomBar current="order" />

    <!-- 退货地址弹窗 -->
    <view class="mask" v-if="addressOpen" @tap="addressOpen = false">
      <view class="modal" @tap.stop>
        <text class="mtitle">{{ $t('afterSale.list.returnAddress') }}</text>
        <textarea class="marea" v-model="addressText" :placeholder="$t('afterSale.list.returnAddressPlaceholder')" :maxlength="500" />
        <view class="mbtns">
          <button class="mbtn" @tap="addressOpen = false">{{ $t('afterSale.list.addressCancel') }}</button>
          <button class="mbtn main" :disabled="addressSaving" @tap="onSaveAddress">{{ $t('afterSale.list.addressSave') }}</button>
        </view>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  fetchAfterSalePage,
  buildAfterSaleFilter,
  approveAfterSale,
  rejectAfterSale,
  confirmAfterSaleReceived,
  processAfterSaleRefund,
  retryAfterSaleRefund,
  batchApproveAfterSales,
  batchRejectAfterSales,
  fetchReturnAddress,
  updateReturnAddress,
  AfterSaleRow,
  type AfterSaleSortBy,
} from '../../../apis/afterSale';
import { downloadCsv, fmtDateTime } from '../../../utils/csv';
import { useListPage } from '../../../composables/useListPage';
import { AFTER_SALE_TYPES } from '../../../constants/orderState';
import { fenToYuanFixed } from '../../../utils/money';
import {
  AFTER_SALE_TABS,
  afterSaleActions,
  afterSaleStateLabel,
  afterSaleWaiting,
} from '../../../constants/afterSaleActions';

const locale = useLocaleStore();
const typeKeys = Object.keys(AFTER_SALE_TYPES);

// 页签全量化为 8 个，默认落在「待处理」（真正的待办入口）
const tabs = AFTER_SALE_TABS;
const cur = ref('Pending');

// 筛选态（逻辑保留不动，仅默认收起）
const filtersOpen = ref(false);
const kw = ref('');
const typeFilter = ref('');
const from = ref('');
const to = ref('');
const minRefund = ref('');
const maxRefund = ref('');
const sortBy = ref<AfterSaleSortBy>('createdAt');

const page = useListPage<AfterSaleRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take, filter, sort }) => fetchAfterSalePage({ skip, take, filter, sort }),
});

function currentFilter(): Record<string, unknown> {
  return buildAfterSaleFilter({
    keyword: kw.value,
    type: typeFilter.value,
    from: from.value,
    to: to.value,
    minRefund: minRefund.value ? Math.round(Number(minRefund.value) * 100) : undefined,
    maxRefund: maxRefund.value ? Math.round(Number(maxRefund.value) * 100) : undefined,
  });
}

function combinedFilter(): Record<string, unknown> {
  const base = currentFilter();
  if (!cur.value) return base;
  const stateClause = { state: { eq: cur.value } };
  return base._and
    ? { _and: [...(base._and as unknown[]), stateClause] }
    : { _and: [stateClause] };
}

async function reload() {
  page.filter.value = combinedFilter();
  page.sort.value = { [sortBy.value]: 'DESC' };
  await page.refresh();
}

function onApply() { void reload(); }
function onType(k: string) {
  typeFilter.value = typeFilter.value === k ? '' : k;
  void reload();
}
function onDate(which: 'from' | 'to', v: string) {
  if (which === 'from') from.value = v; else to.value = v;
  void reload();
}
function onSort(k: AfterSaleSortBy) {
  if (sortBy.value === k) return;
  sortBy.value = k;
  void reload();
}
function onClear() {
  kw.value = ''; typeFilter.value = ''; from.value = ''; to.value = ''; minRefund.value = ''; maxRefund.value = '';
  void reload();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void reload();
}

const st = (a: AfterSaleRow) => afterSaleStateLabel(a.state);

function money(n?: number | null): string {
  return fenToYuanFixed(n);
}

function productName(a: AfterSaleRow): string {
  return a.orderLine?.productVariant?.name ?? '';
}

function productThumb(a: AfterSaleRow): string {
  return (
    a.orderLine?.featuredAsset?.preview ??
    a.orderLine?.productVariant?.featuredAsset?.preview ??
    ''
  );
}

function customerText(a: AfterSaleRow): string {
  const c = a.customer;
  if (!c) return '';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const phone = c.phoneNumber ? c.phoneNumber.replace(/^(\d{3})\d{4}(\d+)$/, '$1****$2') : '';
  return [name, phone].filter(Boolean).join(' · ');
}

function waitingText(a: AfterSaleRow): string {
  return afterSaleWaiting(a.createdAt, locale.t).text;
}
function waitingOver24h(a: AfterSaleRow): boolean {
  return afterSaleWaiting(a.createdAt, locale.t).over24h;
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

function stop(e: Event) {
  e.stopPropagation();
}

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await reload();
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.list.opFailed'));
  }
}

function onCardApprove(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.approveTitle'),
    content: locale.t('afterSale.detail.approveContent').replace('{amount}', money(a.refundAmount)),
    success: (res) => { if (res.confirm) void run(() => approveAfterSale(a.id), locale.t('afterSale.detail.approved')); },
  });
}

function onCardReject(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.rejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: (res) => {
      if (!res.confirm) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      void run(() => rejectAfterSale(a.id, reason), locale.t('afterSale.detail.rejected'));
    },
  });
}

function onCardReceive(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.receiveTitle'),
    content: locale.t('afterSale.detail.receiveContent'),
    success: (res) => { if (res.confirm) void run(() => confirmAfterSaleReceived(a.id), locale.t('afterSale.detail.received')); },
  });
}

function onCardRefund(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.refundTitle'),
    content: locale.t('afterSale.detail.refundContent').replace('{amount}', money(a.refundAmount)),
    success: (res) => { if (res.confirm) void run(() => processAfterSaleRefund(a.id), locale.t('afterSale.detail.refundInitiated')); },
  });
}

function onCardRetry(a: AfterSaleRow) {
  uni.showModal({
    title: locale.t('afterSale.detail.retryTitle'),
    content: locale.t('afterSale.detail.retryContent'),
    success: (res) => { if (res.confirm) void run(() => retryAfterSaleRefund(a.id), locale.t('afterSale.detail.retryInitiated')); },
  });
}

function goDetail(a: AfterSaleRow) {
  uni.navigateTo({ url: `/pages/after-sale/detail/index?id=${a.id}` });
}

// ---- 迭代二期：勾选批量 + 退货地址 + CSV 导出 ----
const selected = ref<string[]>([]);
const BATCH_LIMIT = 50;

function togglePick(id: string) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else if (selected.value.length >= BATCH_LIMIT) toast(locale.t('afterSale.list.batchLimit'));
  else selected.value.push(id);
}

// 退货地址弹窗
const addressOpen = ref(false);
const addressText = ref('');
const addressSaving = ref(false);
async function onOpenAddress() {
  addressText.value = await fetchReturnAddress();
  addressOpen.value = true;
}
async function onSaveAddress() {
  addressSaving.value = true;
  try {
    await updateReturnAddress(addressText.value.trim());
    uni.showToast({ title: locale.t('afterSale.list.addressSaved'), icon: 'success' });
    addressOpen.value = false;
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.list.opFailed')); // 弹窗不关闭、内容保留
  } finally {
    addressSaving.value = false;
  }
}

// 批量操作
function summarize(results: { success: boolean }[]): string {
  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  return fail
    ? locale.t('afterSale.list.batchPartial').replace('{ok}', String(ok)).replace('{fail}', String(fail))
    : locale.t('afterSale.list.batchDone').replace('{n}', String(ok));
}
function onBatchApprove() {
  const ids = selected.value;
  if (!ids.length) return;
  uni.showModal({
    title: locale.t('afterSale.list.batchApproveTitle'),
    content: locale.t('afterSale.list.batchApproveContent').replace('{n}', String(ids.length)),
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const results = await batchApproveAfterSales(ids);
        toast(summarize(results));
        selected.value = [];
        await reload();
      } catch (e: any) { toast(e?.message || locale.t('afterSale.list.opFailed')); }
    },
  });
}
function onBatchReject() {
  const ids = selected.value;
  if (!ids.length) return;
  uni.showModal({
    title: locale.t('afterSale.list.batchRejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.rejectReasonPlaceholder'),
    success: async (res) => {
      if (!res.confirm) return;
      const reason = (res.content || '').trim();
      if (!reason) { toast(locale.t('afterSale.detail.rejectReasonRequired')); return; }
      try {
        const results = await batchRejectAfterSales(ids, reason);
        toast(summarize(results));
        selected.value = [];
        await reload();
      } catch (e: any) { toast(e?.message || locale.t('afterSale.list.opFailed')); }
    },
  });
}

// CSV 导出（当前筛选，上限 500 条）
async function onExport() {
  try {
    const filter = combinedFilter();
    const sort = { [sortBy.value]: 'DESC' };
    const all: AfterSaleRow[] = [];
    for (let skip = 0; skip < 500; skip += 100) {
      const { items, total } = await fetchAfterSalePage({ skip, take: 100, filter, sort });
      all.push(...items);
      if (items.length === 0 || all.length >= total) break;
    }
    if (!all.length) { toast(locale.t('afterSale.list.exportEmpty')); return; }
    if (all.length >= 500) toast(locale.t('afterSale.list.exportTruncated'));
    const headers = ['售后单号', '订单号', '类型', '状态', '退款金额', '商品', '顾客', '手机', '申请时间'];
    const rows = all.slice(0, 500).map((a) => [
      a.id,
      a.order?.code || a.orderId,
      AFTER_SALE_TYPES[a.type] || a.type,
      st(a).label,
      money(a.refundAmount),
      productName(a),
      [a.customer?.firstName, a.customer?.lastName].filter(Boolean).join(' '),
      a.customer?.phoneNumber || '',
      fmtTime(a.createdAt),
    ]);
    downloadCsv(`after-sales-${fmtDateTime(new Date()).replace(/[: -]/g, '')}.csv`, headers, rows);
  } catch (e: any) {
    toast(e?.message || locale.t('afterSale.list.opFailed'));
  }
}

onLoad((query) => {
  page.syncFromQuery((query ?? {}) as Record<string, string>);
  void reload();
});
onMounted(() => { /* onLoad 已触发首屏 */ });
onShow(() => { if (page.items.value.length) void reload(); });
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .pickrow { display: flex; align-items: center; gap: 12rpx; flex: 1; min-width: 0;
        .pick { width: 40rpx; height: 40rpx; border-radius: 8rpx; border: 2rpx solid $wa-muted;
          display: flex; align-items: center; justify-content: center; font-size: 24rpx; color: transparent; flex-shrink: 0;
          &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } } }
      .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .st { font-size: 24rpx; }
    }
    .line { display: block; font-size: 26rpx; color: $wa-muted; line-height: 1.6; margin-top: 8rpx; }
    .prod { display: flex; gap: 16rpx; margin-top: 12rpx; align-items: center;
      .thumb { width: 96rpx; height: 96rpx; border-radius: $wa-radius; background: $wa-bg; flex-shrink: 0; }
      .pmeta { flex: 1; min-width: 0;
        .pname { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      }
    }
    .ops { display: flex; gap: 12rpx; flex-wrap: wrap; margin-top: 16rpx;
      .op { min-width: 128rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } }
    }
  }
  .line.danger { color: $wa-danger; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .filters { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 20rpx;
    .kw { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; }
    .kwrow { display: flex; align-items: center; gap: 16rpx;
      .kw { flex: 1; }
      .toggle { font-size: 24rpx; color: $wa-accent; flex-shrink: 0; } }
    .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
      .chip { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 10rpx 24rpx;
        &.on { background: $wa-accent; color: #fff; } } }
    .ranges { display: flex; gap: 16rpx; margin-top: 16rpx;
      .range, .num { flex: 1; font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; } } }
  .progress { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
  .tools { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .tool { margin: 0; padding: 0 24rpx; height: 60rpx; line-height: 60rpx; font-size: 26rpx;
      border-radius: $wa-radius; background: $wa-card; color: $wa-ink; } }
  .batchbar { position: fixed; left: 24rpx; right: 24rpx; bottom: 140rpx; z-index: 20;
    display: flex; align-items: center; gap: 16rpx; padding: 20rpx 24rpx;
    background: $wa-card; border-radius: $wa-radius; box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.12);
    .bcount { font-size: 26rpx; color: $wa-ink; flex: 1; }
    .bop { margin: 0; padding: 0 20rpx; height: 60rpx; line-height: 60rpx; font-size: 24rpx;
      border-radius: $wa-radius; background: $wa-accent; color: #fff;
      &.ghost { background: $wa-bg; color: $wa-ink; } } }
  .mask { position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center; padding: 48rpx;
    .modal { width: 100%; background: $wa-card; border-radius: $wa-radius; padding: 32rpx;
      .mtitle { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 20rpx; }
      .marea { width: 100%; height: 200rpx; background: $wa-bg; border-radius: $wa-radius; padding: 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
      .mbtns { display: flex; gap: 16rpx; margin-top: 24rpx;
        .mbtn { flex: 1; margin: 0; height: 72rpx; line-height: 72rpx; font-size: 28rpx;
          border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
          &.main { background: $wa-accent; color: #fff; } } } } }
}
</style>
