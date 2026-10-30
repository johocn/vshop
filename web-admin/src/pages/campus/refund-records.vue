<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusRefundRecords.loading') }}</view>
    <template v-else>
      <!-- 汇总（§77）：区间退款笔数/金额/失败留痕，统计不受分页影响 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusRefundRecords.summaryTitle') }}</text>
          <view class="pill"><text>{{ rangeText }}</text></view>
        </view>
        <view class="seg">
          <text class="seg-i" :class="{ on: range === 'today' }" @tap="setRange('today')">
            {{ $t('campusRefundRecords.rangeToday') }}
          </text>
          <text class="seg-i" :class="{ on: range === 'last7' }" @tap="setRange('last7')">
            {{ $t('campusRefundRecords.range7d') }}
          </text>
          <text class="seg-i" :class="{ on: range === 'custom' }" @tap="setRange('custom')">
            {{ $t('campusRefundRecords.rangeCustom') }}
          </text>
        </view>
        <view v-if="range === 'custom'" class="range-row">
          <picker mode="date" :value="fromDate || todayKey" :end="toDate || todayKey" @change="onPickFrom">
            <view class="ipt picker" :class="{ picked: !!fromDate }">
              {{ fromDate || $t('campusRefundRecords.fromPh') }}
            </view>
          </picker>
          <text class="range-sep">~</text>
          <picker mode="date" :value="toDate || fromDate || todayKey" :start="fromDate" :end="todayKey" @change="onPickTo">
            <view class="ipt picker" :class="{ picked: !!toDate }">
              {{ toDate || $t('campusRefundRecords.toPh') }}
            </view>
          </picker>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num">{{ summary.count }}</text>
            <text class="kpi-lbl">{{ $t('campusRefundRecords.kpiCount') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num bad">¥{{ fenToYuanFixed(summary.amount) }}</text>
            <text class="kpi-lbl">{{ $t('campusRefundRecords.kpiAmount') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num" :class="{ warn: summary.failedCount > 0 }">{{ summary.failedCount }}</text>
            <text class="kpi-lbl">{{ $t('campusRefundRecords.kpiFailed') }}</text>
          </view>
        </view>
        <text v-if="summary.failedCount > 0" class="failed-tip">
          {{ $t('campusRefundRecords.failedTip').replace('{amount}', fenToYuanFixed(summary.failedAmount)) }}
        </text>
      </view>

      <!-- 检索：单号（可后 4 位）/楼栋/退款原因 -->
      <view class="searchbar">
        <input v-model="kw" class="s-input" :placeholder="$t('campusRefundRecords.searchPh')" />
        <text v-if="kw" class="s-clear" @tap="kw = ''">✕</text>
      </view>
      <view class="countbar">
        <text class="count">{{ countText }}</text>
        <button class="copy-btn" :disabled="!filtered.length" @tap="copyList">
          {{ $t('campusRefundRecords.copyBtn') }}
        </button>
      </view>

      <view v-if="!filtered.length" class="hint empty">
        {{ kw ? $t('campusRefundRecords.searchEmpty') : $t('campusRefundRecords.empty') }}
      </view>
      <view v-else class="list">
        <view v-for="r in filtered" :key="r.id" class="refund">
          <view class="r-head">
            <text class="r-code">{{ r.code }}</text>
            <text class="r-amount">-¥{{ fenToYuanFixed(r.amount) }}</text>
          </view>
          <view class="r-sub">
            <text class="r-place">{{ placeText(r) }}</text>
            <text class="r-src" :class="r.source === 'merchant' ? 'm' : 'p'">
              {{ r.source === 'merchant' ? $t('campusRefundRecords.sourceMerchant') : $t('campusRefundRecords.sourcePlatform') }}
            </text>
            <text v-if="r.state === 'Failed'" class="r-state bad">{{ $t('campusRefundRecords.stateFailed') }}</text>
            <text v-else-if="r.state === 'Pending'" class="r-state wait">{{ $t('campusRefundRecords.statePending') }}</text>
          </view>
          <text class="r-reason">{{ r.reason || $t('campusRefundRecords.noReason') }}</text>
          <view class="r-foot">
            <text class="r-time">{{ timeText(r) }}</text>
            <text class="r-order" @tap="goOrder">{{ $t('campusRefundRecords.viewOrder') }} ›</text>
          </view>
        </view>
      </view>
      <button v-if="hasMore" class="more" :disabled="loadingMore" @tap="loadMore">
        {{ loadingMore ? $t('campusRefundRecords.loadingMore') : $t('campusRefundRecords.loadMore') }}
      </button>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { campusMerchantRefunds, type MerchantRefundList, type MerchantRefundRow } from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const loading = ref(true);
const loadingMore = ref(false);
/** 区间：今日 / 近 7 日 / 自定义（校园日 UTC+8 口径，与后端一致） */
const range = ref<'today' | 'last7' | 'custom'>('today');
const todayKey = campusDateKey(0);
const fromDate = ref('');
const toDate = ref('');
const kw = ref('');
const data = ref<MerchantRefundList | null>(null);

/** 校园日（UTC+8）日期键：offsetDays=0 为今天 */
function campusDateKey(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** 日期键 00:00（UTC+8）→ ISO 瞬时；offsetDays=1 用于「结束日期当日 24:00」 */
function dayStartIso(date: string, offsetDays = 0): string {
  const t = Date.parse(`${date}T00:00:00+08:00`) + offsetDays * 86_400_000;
  return new Date(t).toISOString();
}

function rangeParams(): { from?: string; to?: string } {
  if (range.value === 'today') return { from: dayStartIso(todayKey) };
  if (range.value === 'last7') return { from: dayStartIso(campusDateKey(-6)) };
  return { from: dayStartIso(fromDate.value), to: dayStartIso(toDate.value, 1) };
}

const items = computed(() => data.value?.items ?? []);
const summary = computed(() =>
  data.value ?? { items: [], count: 0, amount: 0, failedCount: 0, failedAmount: 0, total: 0, start: '', end: '' },
);
const hasMore = computed(() => (data.value?.total ?? 0) > items.value.length);

const rangeText = computed(() => {
  if (range.value === 'today') return locale.t('campusRefundRecords.rangeToday');
  if (range.value === 'last7') return locale.t('campusRefundRecords.range7d');
  return `${fromDate.value} ~ ${toDate.value}`;
});

/** 检索口径：单号（含后 4 位数字）/楼栋/区域/退款原因 */
function matchKeyword(r: MerchantRefundRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const code = r.code.toLowerCase();
  if (code.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits && code.replace(/\D/g, '').includes(digits)) return true;
  return [r.building, r.zone, r.reason].some(s => String(s).toLowerCase().includes(q));
}

const filtered = computed(() => items.value.filter(r => matchKeyword(r, kw.value)));

const countText = computed(() =>
  locale.t('campusRefundRecords.searchCount')
    .replace('{n}', String(filtered.value.length))
    .replace('{m}', String(items.value.length)),
);

function placeText(r: MerchantRefundRow): string {
  const zone = r.zone ? `${r.zone} ` : '';
  return `${zone}${r.building || locale.t('campusRefundRecords.noBuilding')}`;
}

function timeText(r: MerchantRefundRow): string {
  const s = formatDateTime(r.createdAt);
  return s ? s.slice(6) : '';
}

async function load(reset = true): Promise<void> {
  const skip = reset ? 0 : items.value.length;
  const res = await campusMerchantRefunds({ ...rangeParams(), take: 100, skip });
  if (reset || !data.value) {
    data.value = res;
  } else {
    data.value = { ...res, items: [...items.value, ...res.items] };
  }
}

async function reload(): Promise<void> {
  if (range.value === 'custom' && (!fromDate.value || !toDate.value)) return;
  const initial = !data.value;
  if (initial) loading.value = true;
  try {
    await load(true);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusRefundRecords.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function setRange(next: 'today' | 'last7' | 'custom'): void {
  range.value = next;
  if (next === 'custom') {
    if (!fromDate.value) fromDate.value = todayKey;
    if (!toDate.value) toDate.value = todayKey;
  }
  void reload();
}

function onPickFrom(e: any): void {
  fromDate.value = String(e?.detail?.value ?? '');
  if (toDate.value && toDate.value < fromDate.value) toDate.value = '';
  if (toDate.value) void reload();
}

function onPickTo(e: any): void {
  toDate.value = String(e?.detail?.value ?? '');
  if (fromDate.value && toDate.value) void reload();
}

async function loadMore(): Promise<void> {
  loadingMore.value = true;
  try {
    await load(false);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusRefundRecords.loadFailed')), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

/** 复制台账：按当前检索结果导出，汇总用可见笔数合计（与筛选结果对得上） */
function copyList(): void {
  const list = filtered.value;
  if (!list.length) {
    uni.showToast({ title: locale.t('campusRefundRecords.copyEmpty'), icon: 'none' });
    return;
  }
  const sum = list.reduce((s, r) => s + (r.state === 'Failed' ? 0 : r.amount), 0);
  const lines: string[] = [
    locale.t('campusRefundRecords.copyTitle'),
    `${formatDateTime(summary.value.start)} ~ ${formatDateTime(summary.value.end)}`,
    `${locale.t('campusRefundRecords.kpiCount')} ${list.filter(r => r.state !== 'Failed').length} | ${locale.t('campusRefundRecords.kpiAmount')} ¥${fenToYuanFixed(sum)}`,
    '',
  ];
  list.forEach(r => {
    const src = r.source === 'merchant'
      ? locale.t('campusRefundRecords.sourceMerchant')
      : locale.t('campusRefundRecords.sourcePlatform');
    lines.push(
      [
        r.code,
        timeText(r),
        `¥${fenToYuanFixed(r.amount)}`,
        r.state === 'Failed' ? locale.t('campusRefundRecords.stateFailed') : '',
        src,
        placeText(r),
        r.reason || locale.t('campusRefundRecords.noReason'),
      ].filter(Boolean).join(' | '),
    );
  });
  uni.setClipboardData({
    data: lines.join('\n'),
    success: () => uni.showToast({ title: locale.t('campusRefundRecords.copyDone'), icon: 'none' }),
  });
}

/** 查看订单：跳到对账页（可按单号再核对退款余额） */
function goOrder(): void {
  uni.navigateTo({ url: '/pages/campus/completed-orders' });
}

onMounted(() => {
  void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .hint.empty { padding: 60rpx 32rpx; line-height: 1.6; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
    }
    .pill { padding: 8rpx 24rpx; border-radius: 999rpx; background: $wa-rule;
      text { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
    }
    .seg { display: flex; gap: 12rpx; margin: 20rpx 0 8rpx;
      .seg-i { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
        padding: 12rpx 0; border-radius: $wa-radius; background: $wa-bg;
        &.on { background: $wa-accent; color: #fff; font-weight: 600; }
      }
    }
    .range-row { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx;
      .picker { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 26rpx; color: $wa-muted; }
      .picker.picked { color: $wa-ink; }
      .range-sep { color: $wa-muted; font-size: 26rpx; }
    }
    .kpis { display: flex; gap: 16rpx; margin-top: 16rpx;
      .kpi { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 16rpx;
        display: flex; flex-direction: column; gap: 6rpx;
        .kpi-num { font-size: 32rpx; color: $wa-ink; font-weight: 700;
          &.bad { color: #d4380d; }
          &.warn { color: #fa8c16; }
        }
        .kpi-lbl { font-size: 20rpx; color: $wa-muted; }
      }
    }
    .failed-tip { display: block; margin-top: 14rpx; font-size: 22rpx; color: #fa8c16; line-height: 1.5; }
  }
  .searchbar { display: flex; align-items: center; gap: 12rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 8rpx 24rpx; margin-bottom: 16rpx;
    .s-input { flex: 1; font-size: 26rpx; color: $wa-ink; padding: 14rpx 0; }
    .s-clear { font-size: 26rpx; color: $wa-muted; padding: 8rpx; }
  }
  .countbar { display: flex; align-items: center; gap: 16rpx; margin-bottom: 16rpx;
    .count { flex: 1; font-size: 24rpx; color: $wa-muted; }
    .copy-btn { background: $wa-accent; color: #fff; font-size: 24rpx; border-radius: 999rpx;
      padding: 0 28rpx; line-height: 60rpx; &[disabled] { opacity: .5; }
    }
  }
  .list { display: flex; flex-direction: column; gap: 16rpx;
    .refund { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 12rpx;
      .r-head { display: flex; align-items: center; gap: 12rpx;
        .r-code { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .r-amount { font-size: 30rpx; color: #d4380d; font-weight: 700; }
      }
      .r-sub { display: flex; align-items: center; gap: 12rpx;
        .r-place { flex: 1; font-size: 24rpx; color: $wa-muted; }
        .r-src { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
          &.m { color: #1677ff; background: #eaf3ff; }
          &.p { color: #8c8c8c; background: $wa-rule; }
        }
        .r-state { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
          &.bad { color: #d4380d; background: #fdecec; }
          &.wait { color: #fa8c16; background: #fff7e6; }
        }
      }
      .r-reason { font-size: 24rpx; color: $wa-ink; line-height: 1.5; }
      .r-foot { display: flex; align-items: center; gap: 12rpx;
        .r-time { flex: 1; font-size: 22rpx; color: $wa-muted; }
        .r-order { font-size: 24rpx; color: $wa-accent; }
      }
    }
  }
  .more { background: $wa-card; color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius;
    line-height: 76rpx; margin-top: 24rpx; &[disabled] { opacity: .6; }
  }
}
</style>
