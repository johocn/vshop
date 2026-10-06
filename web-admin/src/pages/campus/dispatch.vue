<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusDispatch.loading') }}</view>
    <template v-else>
      <view v-if="board.paused" class="banner paused">{{ $t('campusDispatch.pausedBanner') }}</view>
      <view v-if="board.alerts.length" class="alerts">
        <view v-for="(a, i) in board.alerts" :key="i" class="alert" @tap="jumpOrder(a)">
          <text class="alert-type">{{ typeLabel(a.type) }}</text>
          <text class="alert-detail">{{ a.orderCode }} · {{ a.detail }}</text>
        </view>
      </view>

      <view class="cols">
        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.hall') }}</text>
            <text class="col-count">{{ board.hallOrders.length }}</text>
          </view>
          <view v-if="!board.hallOrders.length" class="hint sm">{{ $t('campusDispatch.emptyCol') }}</view>
          <view v-for="o in board.hallOrders" :key="o.id" class="card">
            <view class="row">
              <text class="code">{{ o.code }}</text>
              <text class="time">{{ hhmm(o.createdAt) }}</text>
            </view>
            <view class="meta">{{ o.customFields.campusZone || '-' }} · #{{ o.customFields.buildingId || '-' }}</view>
            <view class="meta" v-if="waitMin(o.customFields.hallEnteredAt)">
              {{ $t('campusDispatch.waitMin').replace('{n}', waitMin(o.customFields.hallEnteredAt)!) }}
            </view>
            <view v-if="o.customFields.campusCause" class="cause">{{ causeLabel(o.customFields.campusCause) }}</view>
            <view class="acts">
              <button class="act" @tap="assign(o)">{{ $t('campusDispatch.assign') }}</button>
            </view>
          </view>
        </view>

        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.active') }}</text>
            <text class="col-count">{{ board.activeOrders.length }}</text>
          </view>
          <view v-if="!board.activeOrders.length" class="hint sm">{{ $t('campusDispatch.emptyCol') }}</view>
          <view v-for="o in board.activeOrders" :key="o.id" class="card">
            <view class="row">
              <text class="code">{{ o.code }}</text>
              <text class="chip" :class="o.customFields.deliveryStatus">{{ statusLabel(o.customFields) }}</text>
            </view>
            <view class="meta">{{ o.customFields.campusZone || '-' }} · #{{ o.customFields.buildingId || '-' }}</view>
            <view class="row acts">
              <button
                v-if="o.customFields.hallStatus === 'grabbed'"
                class="act ghost" @tap="backToHall(o)"
              >{{ $t('campusDispatch.backHall') }}</button>
              <button
                v-if="o.customFields.hallStatus === 'open'"
                class="act" @tap="assign(o)"
              >{{ $t('campusDispatch.assign') }}</button>
            </view>
          </view>
        </view>

        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.riders') }}</text>
            <text class="col-count">{{ board.ridersOnline.length }}</text>
          </view>
          <view v-if="!board.ridersOnline.length" class="hint sm">{{ $t('campusDispatch.noRiders') }}</view>
          <view v-for="r in board.ridersOnline" :key="r.customerId" class="rider-card">
            <text class="rider-name">{{ r.realName || ('#' + r.customerId) }}</text>
            <text class="rider-credit">{{ $t('campusDispatch.credit').replace('{n}', String(r.credit)) }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import {
  campusDispatchAssign,
  campusDispatchBackToHall,
  campusDispatchBoard,
  type CampusDispatchBoardData,
  type DispatchOrder,
} from '../../apis/campus';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();
const loading = ref(true);
const board = ref<CampusDispatchBoardData>({
  paused: false,
  alerts: [],
  hallOrders: [],
  activeOrders: [],
  ridersOnline: [],
});
let timer: ReturnType<typeof setInterval> | null = null;

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function waitMin(hallEnteredAt: string | null): string | null {
  if (!hallEnteredAt) return null;
  const m = Math.floor((Date.now() - new Date(hallEnteredAt).getTime()) / 60_000);
  return m > 0 ? String(m) : null;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    stale_open: locale.t('campusDispatch.alertStaleOpen'),
    sla_breach: locale.t('campusDispatch.alertSla'),
    slot_full: locale.t('campusDispatch.alertSlotFull'),
    exception: locale.t('campusDispatch.alertException'),
  };
  return map[type] ?? type;
}

function causeLabel(cause: string): string {
  const map: Record<string, string> = {
    slot_full: locale.t('campusDispatch.causeSlotFull'),
    no_rider: locale.t('campusDispatch.causeNoRider'),
    merchant_timeout: locale.t('campusDispatch.causeMerchantTimeout'),
  };
  return map[cause] ?? cause;
}

function statusLabel(cf: DispatchOrder['customFields']): string {
  const map: Record<string, string> = {
    assigned: locale.t('campusDispatch.stAssigned'),
    in_progress: locale.t('campusDispatch.stInProgress'),
    exception: locale.t('campusDispatch.stException'),
    delivered: locale.t('campusDispatch.stDelivered'),
  };
  return map[cf.deliveryStatus ?? ''] ?? cf.hallStatus ?? '';
}

function jumpOrder(a: { orderId: string }) {
  uni.navigateTo({ url: `/pages/order/detail/index?id=${a.orderId}` });
}

async function refresh(initial = false) {
  try {
    board.value = await campusDispatchBoard();
  } catch (err: any) {
    if (initial) uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.loadFailed')), icon: 'none' });
  } finally {
    if (initial) loading.value = false;
  }
}

async function assign(o: DispatchOrder) {
  if (!board.value.ridersOnline.length) {
    uni.showToast({ title: locale.t('campusDispatch.noRiders'), icon: 'none' });
    return;
  }
  const names = board.value.ridersOnline.map(r => r.realName || `#${r.customerId}`);
  uni.showActionSheet({
    itemList: names,
    success: async ({ tapIndex }) => {
      const rider = board.value.ridersOnline[tapIndex];
      try {
        await campusDispatchAssign(o.id, rider.customerId);
        await refresh();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.opFailed')), icon: 'none' });
      }
    },
  });
}

async function backToHall(o: DispatchOrder) {
  try {
    await campusDispatchBackToHall(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.opFailed')), icon: 'none' });
  }
}

onMounted(() => {
  refresh(true);
  timer = setInterval(() => refresh(), 10_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0;
    &.sm { padding: 24rpx 0; font-size: 24rpx; }
  }
  .banner { border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx; font-size: 26rpx;
    &.paused { color: #fff; background: #ff4d4f; }
  }
  .alerts { margin-bottom: 24rpx;
    .alert { display: flex; align-items: center; gap: 16rpx; background: #fff7e6;
      border: 1.5px solid #ffe1a8; border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 12rpx;
      .alert-type { color: #c47b00; font-size: 24rpx; font-weight: 700; flex-shrink: 0; }
      .alert-detail { color: $wa-ink; font-size: 24rpx; }
    }
  }
  .cols { display: flex; gap: 20rpx; align-items: flex-start;
    .col { flex: 1; min-width: 0;
      .col-head { display: flex; align-items: center; gap: 12rpx; padding: 8rpx 4rpx 16rpx;
        .col-title { font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .col-count { font-size: 24rpx; color: $wa-accent; font-weight: 700; }
      }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 16rpx;
    .row { display: flex; align-items: center; gap: 12rpx; }
    .code { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 700; }
    .time { font-size: 22rpx; color: $wa-muted; }
    .chip { font-size: 20rpx; padding: 2rpx 14rpx; border-radius: 999rpx; color: #fff; background: $wa-muted;
      &.assigned { background: #1e80ff; }
      &.in_progress { background: #10b981; }
      &.exception { background: #ff4d4f; }
    }
    .meta { font-size: 24rpx; color: $wa-muted; padding-top: 8rpx; }
    .cause { font-size: 22rpx; color: #c47b00; padding-top: 8rpx; }
    .acts { padding-top: 16rpx;
      .act { background: $wa-accent; color: #fff; font-size: 24rpx; border-radius: $wa-radius;
        padding: 0 24rpx; line-height: 56rpx; margin: 0;
        &.ghost { background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent; }
      }
    }
  }
  .rider-card { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius;
    padding: 18rpx 24rpx; margin-bottom: 12rpx;
    .rider-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .rider-credit { font-size: 22rpx; color: $wa-muted; }
  }
}
</style>
