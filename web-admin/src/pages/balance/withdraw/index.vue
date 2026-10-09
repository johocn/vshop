<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('balanceWithdraw.' + s.label) }}
      </text>
    </view>

    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="amount">¥{{ fmtFen(r.amount) }}</text>
        <text class="st" :class="'st-' + r.status">{{ $t('balanceWithdraw.status_' + r.status) }}</text>
      </view>
      <text class="meta">{{ $t('balanceWithdraw.customerLabel') }}#{{ r.customerId }} · {{ $t('balanceWithdraw.method_' + r.method) }}</text>
      <text class="meta">{{ $t('balanceWithdraw.accountLabel') }}{{ r.accountInfo }}</text>
      <text class="meta">{{ $t('balanceWithdraw.createdAtLabel') }}{{ fmtTime(r.createdAt) }}</text>
      <text class="meta" v-if="r.reviewedAt">{{ $t('balanceWithdraw.reviewedAtLabel') }}{{ fmtTime(r.reviewedAt) }}</text>
      <text class="meta" v-if="r.paidAt">{{ $t('balanceWithdraw.paidAtLabel') }}{{ fmtTime(r.paidAt) }}</text>
      <view class="remark" v-if="r.remark">{{ $t('balanceWithdraw.remarkLabel') }}：{{ r.remark }}</view>

      <view class="ops" v-if="r.status === 'pending'">
        <button class="op main" @tap="onApprove(r)">{{ $t('balanceWithdraw.approveBtn') }}</button>
        <button class="op" @tap="onReject(r)">{{ $t('balanceWithdraw.rejectBtn') }}</button>
      </view>
      <view class="ops" v-else-if="r.status === 'approved'">
        <button class="op main" @tap="onMarkPaid(r)">{{ $t('balanceWithdraw.markPaidBtn') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('balanceWithdraw.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('balanceWithdraw.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">
      {{ cur === 'pending' ? $t('balanceWithdraw.emptyPending') : $t('balanceWithdraw.empty') }}
    </view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('balanceWithdraw.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('balanceWithdraw.noMore') }}</view>

    <view style="height: 160rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fetchBalanceWithdrawPage, approveBalanceWithdrawal, rejectBalanceWithdrawal, markBalanceWithdrawalPaid, type BalanceWithdrawRow } from '../../../apis/balanceWithdraw';
import { fenToYuanFixed } from '../../../utils/money';

const locale = useLocaleStore();

// pending 默认（待办入口）
const tabs = [
  { key: 'pending', label: 'tabPending' },
  { key: 'approved', label: 'tabApproved' },
  { key: 'paid', label: 'tabPaid' },
  { key: 'rejected', label: 'tabRejected' },
  { key: 'ALL', label: 'tabAll' },
];
const cur = ref('pending');

const page = useListPage<BalanceWithdrawRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take }) => fetchBalanceWithdrawPage({ skip, take, status: cur.value === 'ALL' ? undefined : cur.value }),
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void page.refresh();
}

function fmtFen(fen: number): string {
  return fenToYuanFixed(fen);
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

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await page.refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('balanceWithdraw.opFailed'));
  }
}

function onApprove(r: BalanceWithdrawRow) {
  uni.showModal({
    title: locale.t('balanceWithdraw.approveTitle'),
    content: locale.t('balanceWithdraw.approveContent').replace('{amount}', fmtFen(r.amount)),
    success: (res) => { if (res.confirm) void run(() => approveBalanceWithdrawal(r.id), locale.t('balanceWithdraw.approveOk')); },
  });
}

function onReject(r: BalanceWithdrawRow) {
  uni.showModal({
    title: locale.t('balanceWithdraw.rejectTitle'),
    content: locale.t('balanceWithdraw.rejectContent').replace('{amount}', fmtFen(r.amount)),
    editable: true,
    placeholderText: locale.t('balanceWithdraw.rejectPlaceholder'),
    success: (res) => {
      if (!res.confirm) return;
      const remark = (res.content || '').trim();
      if (!remark) { toast(locale.t('balanceWithdraw.rejectEmpty')); return; }
      void run(() => rejectBalanceWithdrawal(r.id, remark), locale.t('balanceWithdraw.rejectOk'));
    },
  });
}

function onMarkPaid(r: BalanceWithdrawRow) {
  uni.showModal({
    title: locale.t('balanceWithdraw.markPaidTitle'),
    content: locale.t('balanceWithdraw.markPaidContent').replace('{amount}', fmtFen(r.amount)),
    success: (res) => { if (res.confirm) void run(() => markBalanceWithdrawalPaid(r.id), locale.t('balanceWithdraw.markPaidOk')); },
  });
}

onLoad(() => {
  void page.refresh();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx; display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .amount { font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      &.st-pending { color: #b45309; background: #fdf3e0; }
      &.st-approved { color: #2563eb; background: #e7eefc; }
      &.st-paid { color: #16a34a; background: #e6f5ec; }
      &.st-rejected { color: #8a919c; background: #f5f6f8; } }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .remark { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
    .ops { display: flex; gap: 12rpx; margin-top: 8rpx;
      .op { min-width: 160rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
