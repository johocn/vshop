<template>
  <view class="kds">
    <!-- 顶部状态条：待接单 / 备餐中 / 超时，10s 自动刷新 -->
    <view class="topbar">
      <view class="hd">
        <text class="title">{{ $t('campusKitchen.title') }}</text>
        <text class="sub">{{ $t('campusKitchen.sub').replace('{s}', String(REFRESH_SEC)) }}</text>
      </view>
      <view class="stats">
        <view class="stat">
          <text class="n">{{ queue.pendingCount }}</text>
          <text class="l">{{ $t('campusKitchen.pendingCount') }}</text>
        </view>
        <view class="stat">
          <text class="n">{{ queue.cookingCount }}</text>
          <text class="l">{{ $t('campusKitchen.cookingCount') }}</text>
        </view>
        <view class="stat" :class="{ bad: queue.lateCount > 0 }">
          <text class="n">{{ queue.lateCount }}</text>
          <text class="l">{{ $t('campusKitchen.lateCount') }}</text>
        </view>
        <!-- 顾客催单（§78）：后厨大屏同步显示催单数，优先处理 -->
        <view class="stat" :class="{ urge: queue.urgedCount > 0 }">
          <text class="n">{{ queue.urgedCount }}</text>
          <text class="l">{{ $t('campusKitchen.urgedCount') }}</text>
        </view>
      </view>
      <view class="ops">
        <text class="upd">{{ updatedAt ? $t('campusKitchen.updatedAt').replace('{t}', updatedAt) : '' }}</text>
        <button class="btn" :disabled="loading" @tap="refresh()">
          {{ loading ? $t('campusKitchen.refreshing') : $t('campusKitchen.refresh') }}
        </button>
      </view>
    </view>

    <text class="threshold">
      {{ $t('campusKitchen.threshold').replace('{w}', String(queue.warnMinutes)).replace('{l}', String(queue.lateMinutes)) }}
    </text>

    <view class="cols">
      <view class="col">
        <view class="col-hd">
          <text class="col-t">{{ $t('campusKitchen.colPending') }}</text>
          <text class="col-n">{{ queue.pendingCount }}</text>
        </view>
        <view v-if="!pendingTickets.length" class="empty">{{ $t('campusKitchen.emptyPending') }}</view>
        <view v-for="tk in pendingTickets" :key="tk.id" class="ticket" :class="tk.urgency">
          <view class="tk-hd">
            <text class="tk-code">{{ tk.code }}</text>
            <text v-if="tk.urged" class="tk-urged">{{ $t('campusKitchen.urged') }}</text>
            <text class="tk-wait">{{ waitText(tk) }}</text>
          </view>
          <view class="tk-meta">
            <text class="tk-dest">{{ destText(tk) }}</text>
            <text class="tk-time">{{ hhmm(tk.createdAt) }}</text>
            <text v-if="!tk.printedAt" class="tk-unprinted">{{ $t('campusKitchen.unprinted') }}</text>
          </view>
          <view class="tk-lines">
            <view v-for="(l, i) in tk.lines" :key="i" class="tk-line">
              <view class="l-row">
                <text class="l-name">{{ l.name }}</text>
                <text class="l-qty">×{{ l.quantity }}</text>
              </view>
              <text v-if="l.addons && l.addons.length" class="l-addons">+ {{ l.addons.join(' / ') }}</text>
            </view>
          </view>
          <view v-if="tk.note" class="tk-note">{{ $t('campusKitchen.note') }}：{{ tk.note }}</view>
          <button class="tk-act" :disabled="actingId === tk.id" @tap="advance(tk)">
            {{ actingId === tk.id ? $t('campusKitchen.acting') : $t('campusKitchen.startCooking') }}
          </button>
        </view>
      </view>

      <view class="col">
        <view class="col-hd">
          <text class="col-t">{{ $t('campusKitchen.colCooking') }}</text>
          <text class="col-n">{{ queue.cookingCount }}</text>
        </view>
        <view v-if="!cookingTickets.length" class="empty">{{ $t('campusKitchen.emptyCooking') }}</view>
        <view v-for="tk in cookingTickets" :key="tk.id" class="ticket" :class="tk.urgency">
          <view class="tk-hd">
            <text class="tk-code">{{ tk.code }}</text>
            <text v-if="tk.urged" class="tk-urged">{{ $t('campusKitchen.urged') }}</text>
            <text class="tk-wait">{{ waitText(tk) }}</text>
          </view>
          <view class="tk-meta">
            <text class="tk-dest">{{ destText(tk) }}</text>
            <text class="tk-time">{{ hhmm(tk.createdAt) }}</text>
            <text v-if="!tk.printedAt" class="tk-unprinted">{{ $t('campusKitchen.unprinted') }}</text>
          </view>
          <view class="tk-lines">
            <view v-for="(l, i) in tk.lines" :key="i" class="tk-line">
              <view class="l-row">
                <text class="l-name">{{ l.name }}</text>
                <text class="l-qty">×{{ l.quantity }}</text>
              </view>
              <text v-if="l.addons && l.addons.length" class="l-addons">+ {{ l.addons.join(' / ') }}</text>
            </view>
          </view>
          <view v-if="tk.note" class="tk-note">{{ $t('campusKitchen.note') }}：{{ tk.note }}</view>
          <button class="tk-act done" :disabled="actingId === tk.id" @tap="advance(tk)">
            {{ actingId === tk.id ? $t('campusKitchen.acting') : $t('campusKitchen.cookingDone') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import {
  campusMerchantAcceptOrder,
  campusMerchantCookingDone,
  campusMerchantKitchenQueue,
  type CampusKitchenQueue,
  type CampusKitchenTicket,
} from '../../apis/campus';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const REFRESH_SEC = 10;

const locale = useLocaleStore();
const queue = ref<CampusKitchenQueue>({
  tickets: [],
  pendingCount: 0,
  cookingCount: 0,
  lateCount: 0,
  urgedCount: 0,
  warnMinutes: 15,
  lateMinutes: 25,
});
const loading = ref(false);
const actingId = ref('');
const updatedAt = ref('');

const pendingTickets = computed(() => queue.value.tickets.filter(t => t.stage === 'pending'));
const cookingTickets = computed(() => queue.value.tickets.filter(t => t.stage === 'cooking'));

let timer: ReturnType<typeof setInterval> | null = null;
let shown = false;

async function refresh(silent = false): Promise<void> {
  if (!silent) loading.value = true;
  try {
    queue.value = await campusMerchantKitchenQueue();
    updatedAt.value = new Date().toTimeString().slice(0, 5);
  } catch (err: any) {
    // 自动刷新失败不打扰后厨，仅手动刷新/首次进入提示
    if (!silent) uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusKitchen.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 待接单 → 开始制作；备餐中 → 出餐完成（与工作台同一状态机） */
async function advance(tk: CampusKitchenTicket): Promise<void> {
  actingId.value = tk.id;
  try {
    if (tk.stage === 'pending') await campusMerchantAcceptOrder(tk.id);
    else await campusMerchantCookingDone(tk.id);
    await refresh(true);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusKitchen.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

function destText(tk: CampusKitchenTicket): string {
  return [tk.zone, tk.building, tk.slotText].filter(Boolean).join(' · ');
}

function waitText(tk: CampusKitchenTicket): string {
  return locale.t('campusKitchen.waitMinutes').replace('{n}', String(tk.waitingMinutes));
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function startTimer(): void {
  stopTimer();
  timer = setInterval(() => { void refresh(true); }, REFRESH_SEC * 1000);
}
function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

onMounted(async () => {
  await refresh();
  startTimer();
});
onUnmounted(stopTimer);
// 切到后台/其他页时暂停轮询，回到本页立刻对齐（后厨长时间挂着也不浪费请求）
onHide(stopTimer);
onShow(() => {
  if (!shown) { shown = true; return; }
  void refresh(true);
  startTimer();
});
</script>

<style lang="scss" scoped>
.kds { min-height: 100vh; background: $wa-bg; padding: 32rpx; box-sizing: border-box;
  .topbar { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
    display: flex; align-items: center; gap: 24rpx; flex-wrap: wrap;
  }
  .hd { flex: 1; min-width: 240rpx;
    .title { display: block; font-size: 34rpx; color: $wa-ink; font-weight: 700; }
    .sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
  }
  .stats { display: flex; gap: 12rpx;
    .stat { min-width: 108rpx; text-align: center; background: $wa-bg; border-radius: $wa-radius;
      padding: 10rpx 16rpx;
      .n { display: block; font-size: 36rpx; color: $wa-ink; font-weight: 700; }
      .l { display: block; font-size: 20rpx; color: $wa-muted; }
      &.bad { background: #fdecec;
        .n { color: #d4380d; }
        .l { color: #d4380d; }
      }
      // 催单高亮（§78）：蓝色，与超时红区分
      &.urge { background: #e6f4ff;
        .n { color: #0958d9; }
        .l { color: #0958d9; }
      }
    }
  }
  .ops { display: flex; align-items: center; gap: 16rpx;
    .upd { font-size: 20rpx; color: $wa-muted; }
    .btn { margin: 0; background: $wa-accent; color: #fff; font-size: 24rpx; line-height: 60rpx;
      padding: 0 28rpx; border-radius: $wa-radius;
      &[disabled] { opacity: .6; }
    }
  }
  .threshold { display: block; font-size: 20rpx; color: $wa-muted; margin: 16rpx 8rpx 0; }
  .cols { display: flex; gap: 24rpx; margin-top: 20rpx; align-items: flex-start;
    @media (max-width: 760px) { flex-direction: column; }
  }
  .col { flex: 1; min-width: 0;
    .col-hd { display: flex; align-items: center; gap: 12rpx; padding: 0 8rpx 12rpx;
      .col-t { font-size: 26rpx; color: $wa-ink; font-weight: 700; }
      .col-n { font-size: 22rpx; color: $wa-muted; background: $wa-card; border-radius: 999rpx;
        padding: 2rpx 14rpx; }
    }
    .empty { background: $wa-card; border-radius: $wa-radius; text-align: center;
      color: $wa-muted; font-size: 24rpx; padding: 60rpx 0; }
  }
  .ticket { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
    margin-bottom: 20rpx; border-left: 8rpx solid #d9d9d9;
    &.warn { border-left-color: #fa8c16; }
    &.late { border-left-color: #d4380d; background: #fff7f5; }
    .tk-hd { display: flex; align-items: center; gap: 16rpx;
      .tk-code { flex: 1; font-size: 32rpx; color: $wa-ink; font-weight: 700; letter-spacing: 1rpx; }
      // 顾客催单标签（§78）：与单号同排醒目提示后厨优先处理
      .tk-urged { font-size: 20rpx; color: #fff; background: #1677ff; border-radius: 6rpx;
        padding: 2rpx 10rpx; font-weight: 600; flex: none; }
      .tk-wait { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx;
        padding: 4rpx 18rpx; }
    }
    &.warn .tk-wait { color: #fa8c16; background: #fff5e6; }
    &.late .tk-wait { color: #d4380d; background: #fdecec; font-weight: 700; }
    .tk-meta { display: flex; align-items: center; gap: 12rpx; margin-top: 10rpx;
      .tk-dest { flex: 1; font-size: 22rpx; color: $wa-muted; }
      .tk-time { font-size: 22rpx; color: $wa-muted; }
      .tk-unprinted { font-size: 20rpx; color: #d4380d; border: 1.5px solid #d4380d;
        border-radius: 6rpx; padding: 0 8rpx; }
    }
    .tk-lines { margin-top: 16rpx;
      .tk-line { padding: 6rpx 0;
        .l-row { display: flex; align-items: baseline; gap: 12rpx;
          .l-name { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 600; }
          .l-qty { font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        }
        .l-addons { display: block; font-size: 24rpx; color: $wa-accent; margin: 2rpx 0 0 24rpx; }
      }
    }
    .tk-note { margin-top: 12rpx; font-size: 24rpx; color: #d4380d; background: #fdecec;
      border-radius: $wa-radius; padding: 10rpx 16rpx; line-height: 1.5; }
    .tk-act { margin-top: 20rpx; background: $wa-accent; color: #fff; font-size: 28rpx;
      line-height: 76rpx; border-radius: $wa-radius;
      &.done { background: #1a7f37; }
      &[disabled] { opacity: .6; }
    }
  }
}
</style>
