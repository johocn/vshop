<template>
  <view class="page">
    <!-- 状态 tabs（空 key = 不过滤） -->
    <view class="seg">
      <view v-for="t in TABS" :key="t.key" class="seg-item" :class="{ on: status === t.key }" @tap="onTab(t.key)">
        {{ $t('inventoryReservation.tab.' + t.key) }}
      </view>
    </view>

    <view class="sec">
      <text class="sh">{{ $t('inventoryReservation.title') }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ $t('inventoryReservation.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}</text>
    </view>

    <view v-for="r in page.items.value" :key="r.id" class="card">
      <view class="r1">
        <text class="oid">#{{ r.orderId }}</text>
        <text class="st" :class="stateClass(r.status)">{{ $t('inventoryReservation.state.' + r.status) }}</text>
      </view>
      <view class="kv"><text class="k">{{ $t('inventoryReservation.variant') }}</text><text class="v">{{ r.variantId }}</text></view>
      <view class="kv"><text class="k">{{ $t('inventoryReservation.qty') }}</text><text class="v">{{ r.totalQty }}</text></view>
      <view class="kv"><text class="k">{{ $t('inventoryReservation.createdAt') }}</text><text class="v">{{ fmt(r.createdAt) }}</text></view>
      <view v-if="r.status === 'PENDING_ALLOC'" class="kv">
        <text class="k">{{ $t('inventoryReservation.remaining') }}</text>
        <text class="v" :class="{ warn: remainingMs(r) <= 0 }">{{ remainingLabel(r) }}</text>
      </view>
      <text
        v-if="r.status === 'PENDING_ALLOC' || r.status === 'ALLOCATED'"
        class="rel"
        :class="{ dis: busy === r.id }"
        @tap="onRelease(r)"
      >{{ $t('inventoryReservation.release') }}</text>
    </view>

    <view v-if="page.loading.value" class="more">{{ $t('inventoryReservation.loading') }}</view>
    <view v-else-if="!page.items.value.length" class="empty">{{ $t('inventoryReservation.empty') }}</view>

    <view class="more" v-if="page.loadingMore.value">{{ $t('inventoryReservation.loading') }}</view>
    <view class="more" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('inventoryReservation.noMore') }}</view>

    <view style="height: 140rpx" />
  </view>
</template>

<script lang="ts" setup>
import { ref, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useListPage } from '../../../composables/useListPage';
import { fetchReservations, releaseReservationAdmin, type Reservation } from '../../../apis/reservation';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

// 与后端 reservation status 枚举一一对应（PENDING_ALLOC/ALLOCATED/DONE/RELEASED）
const TABS: Array<{ key: string }> = [
  { key: '' }, { key: 'PENDING_ALLOC' }, { key: 'ALLOCATED' }, { key: 'DONE' }, { key: 'RELEASED' },
];
const status = ref('');
const busy = ref('');

// 首屏由 onLoad 触发一次刷新（避免 setup 立即加载 + onLoad 各发一次请求）
const page = useListPage<Reservation>({
  take: 20,
  immediate: false,
  fetcher: async ({ skip, take, filter }) => {
    const res = await fetchReservations({
      status: (filter?.status as string) || undefined,
      page: Math.floor(skip / take) + 1,
      pageSize: take,
    });
    return { items: res.items, total: res.totalItems };
  },
});

/** 条件一次性写入后只刷一次（不要 applyFilter + 其它再刷一次） */
async function applyAll(): Promise<void> {
  page.filter.value = status.value ? { status: status.value } : {};
  await page.refresh();
}

function onTab(key: string): void {
  if (status.value === key) return;
  status.value = key;
  void applyAll();
}

// ---- 倒计时：每秒 tick 一次驱动重算；离开页面必须清掉，否则定时器泄漏 ----
const now = ref(Date.now());
const timer = setInterval(() => { now.value = Date.now(); }, 1000);
onUnmounted(() => clearInterval(timer));

function remainingMs(r: Reservation): number {
  if (!r.expiresAt) return Number.POSITIVE_INFINITY;
  return new Date(r.expiresAt).getTime() - now.value;
}
function remainingLabel(r: Reservation): string {
  const ms = remainingMs(r);
  if (!Number.isFinite(ms)) return locale.t('inventoryReservation.never');
  if (ms <= 0) return locale.t('inventoryReservation.expired');
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmt(v: string): string {
  return v ? new Date(v).toLocaleString() : '—';
}
function stateClass(s: string): string {
  return s === 'PENDING_ALLOC' ? 'warn' : s === 'RELEASED' ? 'muted' : s === 'DONE' ? 'ok' : '';
}

function onRelease(r: Reservation): void {
  if (busy.value) return;
  uni.showModal({
    title: locale.t('inventoryReservation.release'),
    content: locale.t('inventoryReservation.releaseConfirm').replace('{id}', r.orderId),
    success: async (res) => {
      if (!res.confirm || busy.value) return;
      busy.value = r.id;
      try {
        await releaseReservationAdmin(r.id);
        uni.showToast({ title: locale.t('inventoryReservation.releaseDone'), icon: 'success' });
        await page.refresh();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('inventoryReservation.releaseFailed'), icon: 'none' });
      } finally {
        busy.value = '';
      }
    },
  });
}

onLoad(async () => {
  await applyAll();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .seg { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .seg-item { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius; background: $wa-card; font-size: 26rpx; color: $wa-muted;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; } }
  }

  .sec { display: flex; align-items: center; margin-bottom: 16rpx;
    .sh { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .r1 { display: flex; align-items: center; margin-bottom: 8rpx;
      .oid { flex: 1; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .st { font-size: 22rpx; color: #fff; background: $wa-muted; border-radius: 6rpx; padding: 2rpx 12rpx;
        &.warn { background: $wa-danger; }
        &.ok { background: $wa-success; }
        &.muted { background: $wa-muted; }
      }
    }
    .kv { display: flex; align-items: center; margin-top: 10rpx;
      .k { width: 160rpx; font-size: 24rpx; color: $wa-muted; }
      .v { flex: 1; font-size: 24rpx; color: $wa-ink;
        &.warn { color: $wa-danger; font-weight: 600; }
      }
    }
    .rel { display: inline-block; margin-top: 20rpx; font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: 999rpx; padding: 12rpx 32rpx;
      &.dis { opacity: 0.5; }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>