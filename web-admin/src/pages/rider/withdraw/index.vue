<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('rider.withdraw.' + s.label) }}
      </text>
    </view>

    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="amount">¥{{ fmtFen(r.amount) }}</text>
        <text class="st" :class="'st-' + r.status">{{ $t('rider.withdraw.status_' + r.status) }}</text>
      </view>
      <text class="meta">{{ $t('rider.withdraw.toChannel') }}{{ r.channel }} · {{ r.account }}</text>
      <text class="meta">{{ $t('rider.withdraw.createdAtLabel') }}{{ fmtTime(r.createdAt) }}</text>
      <text class="meta" v-if="r.reviewedAt">{{ $t('rider.withdraw.reviewedAtLabel') }}{{ fmtTime(r.reviewedAt) }}</text>
      <view class="remark" v-if="r.remark">{{ $t('rider.withdraw.remarkLabel') }}：{{ r.remark }}</view>

      <view class="ops" v-if="r.status === 'PENDING'">
        <button class="op main" @tap="onApprove(r)">{{ $t('rider.withdraw.approveBtn') }}</button>
        <button class="op" @tap="onReject(r)">{{ $t('rider.withdraw.rejectBtn') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('rider.withdraw.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('rider.withdraw.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">
      {{ cur === 'PENDING' ? $t('rider.withdraw.emptyPending') : $t('rider.withdraw.empty') }}
    </view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('rider.withdraw.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('rider.withdraw.noMore') }}</view>

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
import { fetchWithdrawPage, approveRiderWithdraw, rejectRiderWithdraw, type RiderWithdrawRow } from '../../../apis/rider-withdraw';

const locale = useLocaleStore();

// PENDING 默认（待办入口）
const tabs = [
  { key: 'PENDING', label: 'tabPending' },
  { key: 'PAID', label: 'tabPaid' },
  { key: 'REJECTED', label: 'tabRejected' },
  { key: 'ALL', label: 'tabAll' },
];
const cur = ref('PENDING');

const page = useListPage<RiderWithdrawRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take }) => fetchWithdrawPage({ skip, take, status: cur.value === 'ALL' ? undefined : cur.value }),
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void page.refresh();
}

function fmtFen(fen: number): string {
  return ((fen ?? 0) / 100).toFixed(2);
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
    toast(e?.message || locale.t('rider.withdraw.opFailed'));
  }
}

function onApprove(r: RiderWithdrawRow) {
  uni.showModal({
    title: locale.t('rider.withdraw.approveTitle'),
    content: locale.t('rider.withdraw.approveContent').replace('{amount}', fmtFen(r.amount)),
    success: (res) => { if (res.confirm) void run(() => approveRiderWithdraw(r.id), locale.t('rider.withdraw.approveOk')); },
  });
}

function onReject(r: RiderWithdrawRow) {
  uni.showModal({
    title: locale.t('rider.withdraw.rejectTitle'),
    content: locale.t('rider.withdraw.rejectContent').replace('{amount}', fmtFen(r.amount)),
    editable: true,
    placeholderText: locale.t('rider.withdraw.rejectPlaceholder'),
    success: (res) => {
      if (!res.confirm) return;
      const remark = (res.content || '').trim();
      if (!remark) { toast(locale.t('rider.withdraw.rejectEmpty')); return; }
      void run(() => rejectRiderWithdraw(r.id, remark), locale.t('rider.withdraw.rejectOk'));
    },
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
      &.st-PENDING { color: #b45309; background: #fdf3e0; }
      &.st-PAID { color: #16a34a; background: #e6f5ec; }
      &.st-REJECTED { color: #8a919c; background: #f5f6f8; } }
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
