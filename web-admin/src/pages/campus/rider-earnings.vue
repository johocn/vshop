<template>
  <view class="page">
    <view class="filters">
      <view class="frow">
        <picker class="fh" mode="date" :value="fromDate" @change="onFromChange">
          <view class="fcell">
            <text class="flbl">{{ $t('riderEarnings.from') }}</text>
            <text class="fval" :class="{ ph: !fromDate }">{{ fromDate || $t('riderEarnings.fromPh') }}</text>
          </view>
        </picker>
        <picker class="fh" mode="date" :value="toDate" @change="onToChange">
          <view class="fcell">
            <text class="flbl">{{ $t('riderEarnings.to') }}</text>
            <text class="fval" :class="{ ph: !toDate }">{{ toDate || $t('riderEarnings.toPh') }}</text>
          </view>
        </picker>
      </view>

      <view class="frow">
        <picker class="fw" mode="selector" :range="riderLabels" :value="riderIndex" @change="onRiderChange">
          <view class="fcell">
            <text class="flbl">{{ $t('riderEarnings.rider') }}</text>
            <text class="fval" :class="{ ph: !riderIndex }">{{ riderLabels[riderIndex] }}</text>
          </view>
        </picker>
      </view>

      <view class="chips">
        <view
          v-for="s in STATUSES" :key="s.key"
          class="chip" :class="{ on: statusKey === s.key }" @tap="onStatus(s.key)"
        >{{ $t(s.label) }}</view>
      </view>

      <view class="frow search">
        <input
          v-model="orderCodeInput" class="finput"
          :placeholder="$t('riderEarnings.orderCodePh')" confirm-type="search"
          @confirm="applyFilters"
        />
      </view>
      <view class="frow acts">
        <button class="btn" @tap="applyFilters">{{ $t('riderEarnings.query') }}</button>
        <button class="btn ghost" @tap="resetFilters">{{ $t('riderEarnings.reset') }}</button>
      </view>
    </view>

    <view class="summary">
      <view class="sitem">
        <text class="sval">¥{{ fmtFen(summary.sumAmount) }}</text>
        <text class="slbl">{{ $t('riderEarnings.sumAmount') }}</text>
      </view>
      <view class="sitem">
        <text class="sval">{{ summary.total }}</text>
        <text class="slbl">{{ $t('riderEarnings.sumCount') }}</text>
      </view>
      <view class="sitem">
        <text class="sval">¥{{ fmtFen(summary.sumTip) }}</text>
        <text class="slbl">{{ $t('riderEarnings.sumTip') }}</text>
      </view>
    </view>

    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="name">{{ r.riderName }}</text>
        <text class="amount">+¥{{ fmtFen(r.amount) }}</text>
      </view>
      <view class="row sub">
        <text class="meta">#{{ r.orderCode || r.orderId }}</text>
        <text class="st" :class="'st-' + r.status">{{ statusLabel(r.status) }}</text>
      </view>
      <view class="row sub">
        <text class="meta">{{ $t('riderEarnings.tipLabel') }}¥{{ fmtFen(r.tip) }}</text>
        <text class="meta">{{ fmtTime(r.createdAt) }}</text>
      </view>
      <view class="link" @tap="openTrack(r)">{{ $t('riderEarnings.viewTrack') }} ›</view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('riderEarnings.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('riderEarnings.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">{{ $t('riderEarnings.empty') }}</view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('riderEarnings.loading') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('riderEarnings.noMore') }}</view>

    <view class="note">{{ $t('riderEarnings.note') }}</view>
    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../stores/localeStore';
import { useListPage } from '../../composables/useListPage';
import { usePermGuard } from '../../composables/usePermGuard';
import { fetchRiderApplications } from '../../apis/rider-audit';
import { fetchRiderEarnings, type RiderEarningRow } from '../../apis/rider-ledger';
import { fenToYuanFixed } from '../../utils/money';

usePermGuard('CampusAuditRider');

const locale = useLocaleStore();

const STATUSES = [
  { key: '', label: 'riderEarnings.status_all' },
  { key: 'credited', label: 'riderEarnings.status_credited' },
  { key: 'pending', label: 'riderEarnings.status_pending' },
  { key: 'crediting', label: 'riderEarnings.status_crediting' },
] as const;

const fromDate = ref('');
const toDate = ref('');
const statusKey = ref('');
const orderCodeInput = ref('');

const summary = ref({ sumAmount: 0, sumTip: 0, total: 0 });

const page = useListPage<RiderEarningRow>({
  take: 20,
  immediate: false,
  fetcher: async ({ skip, take, filter }) => {
    const r = await fetchRiderEarnings({
      skip,
      take,
      from: (filter.from as string) || undefined,
      to: (filter.to as string) || undefined,
      riderCustomerId: (filter.riderCustomerId as string) || undefined,
      status: (filter.status as string) || undefined,
      orderCode: (filter.orderCode as string) || undefined,
    });
    summary.value = { sumAmount: r.sumAmount, sumTip: r.sumTip, total: r.total };
    return r;
  },
});

// ===== 骑手名单 =====
const riders = ref<{ id: string; name: string }[]>([]);
const riderIndex = ref(0);
const riderLabels = computed(() => [
  locale.t('riderEarnings.allRiders'),
  ...riders.value.map((r) => r.name),
]);

async function loadRiders(): Promise<void> {
  try {
    const res = await fetchRiderApplications('approved', 0, 200);
    riders.value = res.items.map((r) => ({
      id: r.id,
      name: r.customFields?.riderRealName
        || [r.firstName, r.lastName].filter(Boolean).join(' ')
        || r.emailAddress,
    }));
  } catch {
    // 名单加载失败不阻塞台账查询，选择器仅保留「全部骑手」
  }
}

function onRiderChange(e: any): void {
  riderIndex.value = Number(e?.detail?.value ?? 0) || 0;
}

function onFromChange(e: any): void {
  fromDate.value = String(e?.detail?.value || '');
}
function onToChange(e: any): void {
  toDate.value = String(e?.detail?.value || '');
}

function onStatus(key: string): void {
  if (statusKey.value === key) return;
  statusKey.value = key;
  void applyFilters();
}

/** 汇总当前筛选条件并重查（空值不带上，避免服务端误判） */
function currentFilter(): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (fromDate.value) f.from = fromDate.value;
  if (toDate.value) f.to = toDate.value;
  if (statusKey.value) f.status = statusKey.value;
  const code = orderCodeInput.value.trim().replace(/^#/, '');
  if (code) f.orderCode = code;
  const rider = riders.value[riderIndex.value - 1];
  if (rider) f.riderCustomerId = rider.id;
  return f;
}

function applyFilters(): void {
  void page.applyFilter(currentFilter());
}

function resetFilters(): void {
  fromDate.value = '';
  toDate.value = '';
  statusKey.value = '';
  orderCodeInput.value = '';
  riderIndex.value = 0;
  void page.applyFilter({});
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

function statusLabel(s: string): string {
  const key = `riderEarnings.status_${s}`;
  const txt = locale.t(key);
  return txt === key ? s : txt;
}

/** 跳到轨迹页：优先订单号（服务端按当前店校验渠道），无订单号时用订单 ID */
function openTrack(r: RiderEarningRow): void {
  const q = r.orderCode
    ? `tab=order&code=${encodeURIComponent(r.orderCode)}`
    : `tab=order&orderId=${encodeURIComponent(r.orderId)}`;
  uni.navigateTo({ url: `/pages/campus/rider-track?${q}` });
}

onLoad(() => {
  void loadRiders();
  void page.refresh();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;

  .filters {
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 20rpx;
    .frow { display: flex; gap: 16rpx; margin-bottom: 16rpx; &:last-child { margin-bottom: 0; } }
    .fh { flex: 1; }
    .fw { flex: 1; }
    .fcell { background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; display: flex; flex-direction: column; gap: 6rpx;
      .flbl { font-size: 22rpx; color: $wa-muted; }
      .fval { font-size: 26rpx; color: $wa-ink; &.ph { color: $wa-muted; } } }
    .chips { display: flex; gap: 12rpx; flex-wrap: wrap; margin-bottom: 16rpx;
      .chip { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 8rpx 24rpx;
        &.on { color: #fff; background: $wa-accent; font-weight: 600; } } }
    .search { .finput { flex: 1; background: $wa-bg; border-radius: $wa-radius; height: 72rpx; line-height: 72rpx;
      padding: 0 20rpx; font-size: 26rpx; color: $wa-ink; } }
    .acts { gap: 12rpx;
      .btn { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; font-size: 26rpx; border-radius: $wa-radius;
        background: $wa-accent; color: #fff;
        &.ghost { background: $wa-bg; color: $wa-ink; } } }
  }

  .summary {
    display: flex; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 0; margin-bottom: 20rpx;
    .sitem { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
      & + .sitem { border-left: 1rpx solid $wa-bg; }
      .sval { font-size: 34rpx; font-weight: 700; color: $wa-ink; }
      .slbl { font-size: 22rpx; color: $wa-muted; } }
  }

  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx;
    display: flex; flex-direction: column; gap: 10rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .name { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .amount { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .st { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 14rpx;
      &.st-credited { color: #16a34a; background: #e6f5ec; }
      &.st-pending { color: #b45309; background: #fdf3e0; }
      &.st-crediting { color: #1d4ed8; background: #e8effc; } }
    .link { font-size: 24rpx; color: $wa-accent; text-align: right; padding-top: 4rpx; }
  }

  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
  .note { margin-top: 16rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.6; }
}
</style>
