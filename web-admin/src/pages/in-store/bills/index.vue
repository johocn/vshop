<template>
  <view class="page">
    <!-- 汇总条 -->
    <view class="summary">
      <view class="sm-item">
        <text class="sm-v">{{ summary.count }}</text>
        <text class="sm-k">{{ $t('inStoreBills.sumCount') }}</text>
      </view>
      <view class="sm-item">
        <text class="sm-v">¥{{ fenToYuan(summary.finalTotal) }}</text>
        <text class="sm-k">{{ $t('inStoreBills.sumFinal') }}</text>
      </view>
      <view class="sm-item">
        <text class="sm-v minus">-¥{{ fenToYuan(summary.discountTotal) }}</text>
        <text class="sm-k">{{ $t('inStoreBills.sumDiscount') }}</text>
      </view>
    </view>

    <!-- 筛选 -->
    <view class="filter">
      <input class="f-ipt" v-model="couponCode" :placeholder="$t('inStoreBills.phCode')" @confirm="reload" />
      <picker mode="date" :value="from" @change="onFrom">
        <view class="f-date"><text>{{ from || $t('inStoreBills.startDate') }}</text><text class="caret">▾</text></view>
      </picker>
      <picker mode="date" :value="to" @change="onTo">
        <view class="f-date"><text>{{ to || $t('inStoreBills.endDate') }}</text><text class="caret">▾</text></view>
      </picker>
      <button class="f-btn" @tap="reload">{{ $t('inStoreBills.search') }}</button>
    </view>

    <!-- 明细 -->
    <view class="card" v-for="b in items" :key="b.id">
      <view class="bhead">
        <text class="code mono">{{ b.couponCode }}</text>
        <text class="amt">¥{{ fenToYuan(b.finalAmount) }}</text>
      </view>
      <view class="brow">
        <text class="k">{{ $t('inStoreBills.coupon') }}</text>
        <text class="v">{{ b.couponName || '—' }} · {{ discountLabel(b.discountType, b.discountValue) }}</text>
      </view>
      <view class="brow">
        <text class="k">{{ $t('inStoreBills.customer') }}</text>
        <text class="v">{{ b.customerName || '—' }}<text v-if="b.customerPhone"> · {{ b.customerPhone }}</text></text>
      </view>
      <view class="brow">
        <text class="k">{{ $t('inStoreBills.amount') }}</text>
        <text class="v">¥{{ fenToYuan(b.originalAmount) }} <text class="minus">-¥{{ fenToYuan(b.discountAmount) }}</text> = ¥{{ fenToYuan(b.finalAmount) }}</text>
      </view>
      <view class="brow" v-if="b.remark">
        <text class="k">{{ $t('inStoreBills.remark') }}</text>
        <text class="v">{{ b.remark }}</text>
      </view>
      <view class="bfoot">
        <text>{{ fmtTime(b.billedAt) }}</text>
        <text>{{ $t('inStoreBills.operator') }}：{{ b.operatorName || b.operatorId }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('inStoreBills.empty') }}</view>
    <view v-if="hasMore" class="more" @tap="loadMore">{{ loading ? $t('inStoreBills.loading') : $t('inStoreBills.loadMore') }}</view>

    <view style="height: 60rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchInStoreBills, fetchInStoreBillSummary, fenToYuan, discountLabel,
  InStoreBillRow, InStoreBillSummary,
} from '../../../apis/in-store-bill';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const PAGE_SIZE = 20;

const items = ref<InStoreBillRow[]>([]);
const total = ref(0);
const skip = ref(0);
const loading = ref(false);
const summary = ref<InStoreBillSummary>({ count: 0, originalTotal: 0, discountTotal: 0, finalTotal: 0 });
const couponCode = ref('');
const from = ref('');
const to = ref('');

const hasMore = computed(() => items.value.length < total.value);

/** 本地日期 → 当天起始/结束 ISO（与后端 billedAt 比较） */
function dayStart(v: string): string { return `${v}T00:00:00.000Z`; }
function dayEnd(v: string): string { return `${v}T23:59:59.999Z`; }

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadPage(append: boolean) {
  loading.value = true;
  try {
    const r = await fetchInStoreBills({
      skip: append ? skip.value : 0,
      take: PAGE_SIZE,
      couponCode: couponCode.value.trim(),
      from: from.value ? dayStart(from.value) : null,
      to: to.value ? dayEnd(to.value) : null,
    });
    items.value = append ? [...items.value, ...r.items] : r.items;
    total.value = r.totalItems;
    skip.value = items.value.length;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inStoreBills.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadSummary() {
  try {
    summary.value = await fetchInStoreBillSummary({
      from: from.value ? dayStart(from.value) : null,
      to: to.value ? dayEnd(to.value) : null,
    });
  } catch {
    /* 汇总失败不阻塞明细 */
  }
}

async function reload() {
  skip.value = 0;
  await Promise.all([loadPage(false), loadSummary()]);
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  loadPage(true);
}

function onFrom(e: any) { from.value = e.detail.value; reload(); }
function onTo(e: any) { to.value = e.detail.value; reload(); }

// 每次进入/返回本页刷新（核销后可立即看到新流水）
onShow(() => { reload(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .summary { display: flex; background: $wa-card; border-radius: 20rpx; padding: 28rpx 24rpx; margin-bottom: 24rpx;
    .sm-item { flex: 1; display: flex; flex-direction: column; align-items: center;
      & + .sm-item { border-left: 1rpx solid $wa-rule; }
      .sm-v { font-size: 34rpx; font-weight: 800; color: $wa-ink; &.minus { color: #059669; } }
      .sm-k { margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
    }
  }
  .filter { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx;
    .f-ipt { flex: 1 1 320rpx; min-width: 320rpx; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; }
    .f-date { display: flex; align-items: center; gap: 8rpx; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-muted;
      .caret { color: #bbb; font-size: 22rpx; }
    }
    .f-btn { margin: 0; height: 72rpx; line-height: 72rpx; padding: 0 32rpx; font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; }
  }
  .card { background: $wa-card; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx;
    .bhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16rpx;
      .code { font-size: 28rpx; font-weight: 700; color: $wa-ink; }
      .code.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
      .amt { font-size: 34rpx; font-weight: 800; color: $wa-accent; }
    }
    .brow { display: flex; justify-content: space-between; gap: 24rpx; padding: 8rpx 0; font-size: 26rpx;
      .k { flex: 0 0 auto; color: $wa-muted; }
      .v { flex: 1; text-align: right; color: $wa-ink; word-break: break-all;
        .minus { color: #059669; }
      }
    }
    .bfoot { display: flex; justify-content: space-between; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed $wa-rule; font-size: 22rpx; color: $wa-muted; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 80rpx 0; }
  .more { text-align: center; color: $wa-accent; font-size: 26rpx; padding: 24rpx 0; }
}
</style>
