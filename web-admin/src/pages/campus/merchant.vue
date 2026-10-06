<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusMerchant.loading') }}</view>
    <template v-else>
      <view class="topbar">
        <view class="stat">
          <text class="stat-num">{{ board.completedToday }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedToday') }}</text>
        </view>
        <view class="stat">
          <text class="stat-num">¥{{ fenToYuan(board.completedTodayAmount) }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedAmount') }}</text>
        </view>
        <view class="switch" :class="{ on: !board.paused }" @tap="toggleOpen">
          <text class="switch-lbl">{{ board.paused ? $t('campusMerchant.closed') : $t('campusMerchant.open') }}</text>
        </view>
      </view>
      <view v-if="!board.merchantConfirmEnabled" class="notice">{{ $t('campusMerchant.notConfirmMode') }}</view>

      <view class="tabs">
        <view
          v-for="t in TABS" :key="t.key"
          class="tab" :class="{ on: tab === t.key }" @tap="tab = t.key"
        >
          <text>{{ $t(t.label) }}</text>
          <text v-if="listOf(t.key).length" class="badge">{{ listOf(t.key).length }}</text>
        </view>
      </view>

      <view v-if="!listOf(tab).length" class="hint">{{ $t('campusMerchant.emptyTab') }}</view>
      <view v-for="o in listOf(tab)" :key="o.id" class="card">
        <view class="row head">
          <text class="code">{{ o.code }}</text>
          <text class="time">{{ hhmm(o.createdAt) }}</text>
          <text v-if="o.route" class="route">{{ o.route }}</text>
        </view>
        <view class="row dest">
          <text class="dest-txt">{{ o.zone }} {{ o.building }}</text>
          <text v-if="o.slotText" class="slot">{{ o.slotText }}</text>
        </view>
        <view class="lines">
          <view v-for="(l, i) in o.lines" :key="i" class="line">
            <text class="l-name">{{ l.name }}</text>
            <text class="l-qty">×{{ l.quantity }}</text>
          </view>
        </view>
        <view class="row foot">
          <text v-if="o.riderName" class="rider">{{ $t('campusMerchant.rider') }}{{ o.riderName }}</text>
          <text class="total">¥{{ fenToYuan(o.total) }}</text>
          <button
            v-if="tab === 'pending'"
            class="act" :disabled="actingId === o.id"
            @tap="accept(o)"
          >{{ $t('campusMerchant.accept') }}</button>
          <button
            v-else-if="tab === 'cooking'"
            class="act" :disabled="actingId === o.id"
            @tap="cookingDone(o)"
          >{{ $t('campusMerchant.cookingDone') }}</button>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import {
  campusMerchantAcceptOrder,
  campusMerchantBoard,
  campusMerchantCookingDone,
  campusMerchantSetPaused,
  type CampusMerchantBoard,
  type MerchantBoardOrder,
} from '../../apis/campus';
import { fenToYuan } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

const TABS = [
  { key: 'pending', label: 'campusMerchant.tabPending' },
  { key: 'cooking', label: 'campusMerchant.tabCooking' },
  { key: 'awaitingRider', label: 'campusMerchant.tabAwaiting' },
  { key: 'delivering', label: 'campusMerchant.tabDelivering' },
  { key: 'scheduled', label: 'campusMerchant.tabScheduled' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const locale = useLocaleStore();
const loading = ref(true);
const board = ref<CampusMerchantBoard>({
  paused: false,
  merchantConfirmEnabled: false,
  pending: [],
  cooking: [],
  awaitingRider: [],
  delivering: [],
  scheduled: [],
  completedToday: 0,
  completedTodayAmount: 0,
});
const tab = ref<TabKey>('pending');
const actingId = ref('');
const lastPendingCount = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const listOf = (key: TabKey): MerchantBoardOrder[] =>
  (board.value[key] as MerchantBoardOrder[]) ?? [];

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 新单提示音（H5 Web Audio，三短音） */
function beep() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.25);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.15);
    }
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // 无 AudioContext 环境静默跳过
  }
}

async function refresh(initial = false) {
  try {
    const b = await campusMerchantBoard();
    const pendingCount = b.pending.length;
    if (!initial && pendingCount > lastPendingCount.value) beep();
    lastPendingCount.value = pendingCount;
    board.value = b;
  } catch (err: any) {
    if (initial) {
      uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.loadFailed')), icon: 'none' });
    }
  } finally {
    if (initial) loading.value = false;
  }
}

async function toggleOpen() {
  const next = !board.value.paused;
  try {
    await campusMerchantSetPaused(next);
    board.value.paused = next;
    uni.showToast({ title: next ? locale.t('campusMerchant.paused') : locale.t('campusMerchant.resumed'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  }
}

async function accept(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantAcceptOrder(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function cookingDone(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantCookingDone(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
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
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .topbar { display: flex; align-items: center; gap: 24rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .stat { flex: 1; display: flex; flex-direction: column; gap: 6rpx;
      .stat-num { font-size: 40rpx; color: $wa-ink; font-weight: 700; }
      .stat-lbl { font-size: 22rpx; color: $wa-muted; }
    }
    .switch { padding: 16rpx 36rpx; border-radius: 999rpx; background: $wa-rule;
      .switch-lbl { font-size: 26rpx; color: $wa-muted; font-weight: 600; }
      &.on { background: $wa-accent; .switch-lbl { color: #fff; } }
    }
  }
  .notice { font-size: 24rpx; color: #c47b00; background: #fff7e6; border: 1.5px solid #ffe1a8;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx; }
  .tabs { display: flex; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8rpx;
      background: $wa-card; border-radius: $wa-radius; padding: 18rpx 0; font-size: 26rpx;
      color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      .badge { min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: #ff4d4f;
        color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
        padding: 0 8rpx; box-sizing: border-box; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .code { font-size: 28rpx; color: $wa-ink; font-weight: 700; flex: 1; }
      .time { font-size: 24rpx; color: $wa-muted; }
      .route { font-size: 20rpx; color: $wa-accent; border: 1px solid $wa-accent;
        border-radius: 8rpx; padding: 2rpx 10rpx; }
    }
    .dest { padding-top: 12rpx; .dest-txt { font-size: 26rpx; color: $wa-ink; flex: 1; }
      .slot { font-size: 22rpx; color: $wa-muted; }
    }
    .lines { border-top: 1rpx solid $wa-rule; margin-top: 16rpx; padding-top: 8rpx;
      .line { display: flex; padding: 8rpx 0;
        .l-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
        .l-qty { font-size: 26rpx; color: $wa-muted; }
      }
    }
    .foot { padding-top: 16rpx;
      .rider { flex: 1; font-size: 24rpx; color: $wa-muted; }
      .total { font-size: 30rpx; color: $wa-ink; font-weight: 700; margin-right: 8rpx; }
      .act { background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius;
        padding: 0 32rpx; line-height: 64rpx; }
    }
  }
}
</style>
