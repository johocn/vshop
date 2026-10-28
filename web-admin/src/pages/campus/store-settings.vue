<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusStoreSettings.loading') }}</view>
    <template v-else>
      <!-- 营业状态：临时休息 + 营业时间（自动开闭店，C 端同口径） -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusStoreSettings.statusTitle') }}</text>
          <view class="pill" :class="statusClass">
            <text>{{ statusText }}</text>
          </view>
        </view>
        <view class="row">
          <text class="row-lbl">{{ $t('campusStoreSettings.pauseLabel') }}</text>
          <switch class="sw" :checked="paused" :disabled="pauseBusy" color="#ff6600" @change="onPause" />
        </view>
        <text class="tip">{{ $t('campusStoreSettings.pauseHint') }}</text>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.hoursLabel') }}</text>
          <input v-model="form.businessHours" class="ipt" :placeholder="$t('campusStoreSettings.hoursPh')" />
          <view class="presets">
            <text class="preset" @tap="form.businessHours = ''">{{ $t('campusStoreSettings.presetAll') }}</text>
            <text class="preset" @tap="form.businessHours = '10:00-14:00,17:00-21:00'">10:00-14:00,17:00-21:00</text>
            <text class="preset" @tap="form.businessHours = '18:00-02:00'">{{ $t('campusStoreSettings.presetNight') }}</text>
          </view>
          <text class="tip">{{ $t('campusStoreSettings.hoursHint') }}</text>
          <text v-if="nextText" class="next">{{ nextText }}</text>
        </view>
        <view class="row">
          <text class="row-lbl">{{ $t('campusStoreSettings.warnLabel') }}</text>
          <switch class="sw" :checked="warnOn" color="#ff6600" @change="onWarn" />
        </view>
        <text class="tip">{{ $t('campusStoreSettings.warnHint') }}</text>
      </view>

      <!-- 门店信息：公告 / 电话（C 端店铺页直接展示） -->
      <view class="card">
        <text class="title">{{ $t('campusStoreSettings.infoTitle') }}</text>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.noticeLabel') }}</text>
          <textarea
            v-model="form.storeNotice" class="ta" maxlength="500"
            :placeholder="$t('campusStoreSettings.noticePh')"
          />
          <text class="count">{{ form.storeNotice.length }}/500</text>
          <text class="tip">{{ $t('campusStoreSettings.noticeHint') }}</text>
        </view>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.phoneLabel') }}</text>
          <input v-model="form.storePhone" class="ipt" type="text" :placeholder="$t('campusStoreSettings.phonePh')" />
        </view>
      </view>

      <button class="save" :disabled="saving" @tap="save">
        {{ saving ? $t('campusStoreSettings.saving') : $t('campusStoreSettings.save') }}
      </button>

      <!-- 经营数据：今日 / 近 7 日 + 逐日营业额 -->
      <view v-if="revenue" class="card">
        <text class="title">{{ $t('campusStoreSettings.revenueTitle') }}</text>
        <view class="seg">
          <text class="seg-i" :class="{ on: range === 'today' }" @tap="range = 'today'">{{ $t('campusStoreSettings.revenueToday') }}</text>
          <text class="seg-i" :class="{ on: range === 'last7' }" @tap="range = 'last7'">{{ $t('campusStoreSettings.revenue7d') }}</text>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num">{{ bucket.orders }}</text>
            <text class="kpi-lbl">{{ $t('campusStoreSettings.kpiOrders') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num">¥{{ fenToYuan(bucket.gross) }}</text>
            <text class="kpi-lbl">{{ $t('campusStoreSettings.kpiGross') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num">¥{{ fenToYuan(bucket.avgTicket) }}</text>
            <text class="kpi-lbl">{{ $t('campusStoreSettings.kpiAvg') }}</text>
          </view>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num">{{ bucket.cancelled }}</text>
            <text class="kpi-lbl">{{ $t('campusStoreSettings.kpiCancelled') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num bad">¥{{ fenToYuan(bucket.cancelledAmount) }}</text>
            <text class="kpi-lbl">{{ $t('campusStoreSettings.kpiCancelledAmount') }}</text>
          </view>
        </view>
        <view class="trend">
          <text class="trend-t">{{ $t('campusStoreSettings.trendTitle') }}</text>
          <view class="bars">
            <view v-for="d in revenue.days" :key="d.date" class="bar-col">
              <text class="bar-v">{{ d.gross ? fenToYuan(d.gross) : '' }}</text>
              <view class="bar" :style="{ height: barHeight(d.gross) }"></view>
              <text class="bar-d">{{ d.date.slice(3) }}</text>
            </view>
          </view>
        </view>
        <view class="export">
          <button class="export-btn" @tap="exportCsv">{{ $t('campusStoreSettings.exportCsv') }}</button>
          <text class="tip">{{ $t('campusStoreSettings.exportHint') }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  campusMerchantRevenue,
  campusMerchantSetPaused,
  campusMerchantStoreProfile,
  campusMerchantUpdateStore,
  type MerchantRevenue,
  type MerchantStoreProfile,
} from '../../apis/campus';
import { fenToYuan, fenToYuanFixed } from '../../utils/money';
import { downloadCsv } from '../../utils/csv';
import {
  closingWarnEnabled,
  maybeClosingReminder,
  setClosingWarnEnabled,
  transitionText,
} from '../../utils/closing-reminder';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const loading = ref(true);
const saving = ref(false);
const pauseBusy = ref(false);
const profile = ref<MerchantStoreProfile | null>(null);
const paused = ref(false);
const revenue = ref<MerchantRevenue | null>(null);
const range = ref<'today' | 'last7'>('today');
const form = ref({ businessHours: '', storeNotice: '', storePhone: '' });
const warnOn = ref(closingWarnEnabled());
let clockTimer: ReturnType<typeof setInterval> | null = null;

const bucket = computed(() => (range.value === 'today'
  ? revenue.value?.today
  : revenue.value?.last7) ?? { orders: 0, gross: 0, avgTicket: 0, cancelled: 0, cancelledAmount: 0 });

const statusText = computed(() => {
  if (paused.value) return locale.t('campusStoreSettings.statusPaused');
  return profile.value?.openNow
    ? locale.t('campusStoreSettings.statusOpen')
    : locale.t('campusStoreSettings.statusOffHours');
});
const statusClass = computed(() => ({ open: !paused.value && !!profile.value?.openNow, off: paused.value }));
/** 下一次自动开门/打烊倒计时文案（自动开关门） */
const nextText = computed(() => transitionText(profile.value?.nextTransition));

function applyProfile(p: MerchantStoreProfile, syncForm = true): void {
  profile.value = p;
  paused.value = p.paused;
  if (syncForm) {
    form.value.businessHours = p.businessHours ?? '';
    form.value.storeNotice = p.storeNotice ?? '';
    form.value.storePhone = p.storePhone ?? '';
  }
  maybeClosingReminder(p.nextTransition);
}

async function load(): Promise<void> {
  try {
    const [p, r] = await Promise.all([campusMerchantStoreProfile(), campusMerchantRevenue()]);
    applyProfile(p);
    revenue.value = r;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 临时休息：立刻对 C 端生效，恢复后按营业时间自动开闭店 */
async function onPause(e: any): Promise<void> {
  const next = !!e.detail.value;
  pauseBusy.value = true;
  try {
    await campusMerchantSetPaused(next);
    // 以服务端回读为准：openNow 由「营业时段内 + 未休息」共同决定
    applyProfile(await campusMerchantStoreProfile());
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.opFailed')), icon: 'none' });
    await load();
  } finally {
    pauseBusy.value = false;
  }
}

/** 打烊前提醒开关（本机记忆；工作台/本页轮询到进入 15 分钟窗口时横幅 + 语音） */
function onWarn(e: any): void {
  const on = !!e.detail.value;
  warnOn.value = on;
  setClosingWarnEnabled(on);
}

/** 每分钟只回读营业状态（不同步表单，避免覆盖正在编辑的内容）：倒计时与打烊提醒随轮询更新 */
async function tickClock(): Promise<void> {
  try {
    applyProfile(await campusMerchantStoreProfile(), false);
  } catch { /* 静默重试下一轮 */ }
}

async function save(): Promise<void> {
  const hours = form.value.businessHours.trim();
  if (hours && !/^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(hours)) {
    uni.showToast({ title: locale.t('campusStoreSettings.hoursBad'), icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    applyProfile(await campusMerchantUpdateStore({
      businessHours: hours,
      storeNotice: form.value.storeNotice.trim(),
      storePhone: form.value.storePhone.trim(),
    }));
    uni.showToast({ title: locale.t('campusStoreSettings.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.opFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

const maxGross = computed(() => Math.max(1, ...(revenue.value?.days ?? []).map(d => d.gross)));
function barHeight(gross: number): string {
  if (!gross) return '4rpx';
  return `${Math.max(4, Math.round((gross / maxGross.value) * 160))}rpx`;
}

/** P3-2 经营数据导出：近 30 日逐日明细（口径与页面一致，金额固定两位小数） */
function exportCsv(): void {
  const days = revenue.value?.days30 ?? [];
  if (!days.length) {
    uni.showToast({ title: locale.t('campusStoreSettings.exportEmpty'), icon: 'none' });
    return;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  downloadCsv(
    `${locale.t('campusStoreSettings.exportFileName')}-${stamp}.csv`,
    [
      locale.t('campusStoreSettings.csvDate'),
      locale.t('campusStoreSettings.csvOrders'),
      locale.t('campusStoreSettings.csvGross'),
      locale.t('campusStoreSettings.csvCancelled'),
      locale.t('campusStoreSettings.csvCancelledAmount'),
    ],
    days.map((x) => [
      x.date,
      String(x.orders),
      fenToYuanFixed(x.gross),
      String(x.cancelled),
      fenToYuanFixed(x.cancelledAmount),
    ]),
  );
}

onMounted(() => {
  void load();
  clockTimer = setInterval(() => { if (!loading.value) void tickClock(); }, 60_000);
});
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
});
// 从工作台/沽清页返回时刷新营业状态与数据（首次展示由 onMounted 承担，避免重复请求）
let shown = false;
onShow(() => {
  if (!shown) { shown = true; return; }
  if (!loading.value) void load();
});
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx; }
  .head { display: flex; align-items: center; gap: 16rpx;
    .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
  }
  .title { font-size: 30rpx; color: $wa-ink; font-weight: 700; }
  .pill { padding: 8rpx 24rpx; border-radius: 999rpx; background: $wa-rule;
    text { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
    &.open { background: #e8f7ec; text { color: #1a7f37; } }
    &.off { background: #fdecec; text { color: #d4380d; } }
  }
  .row { display: flex; align-items: center; gap: 16rpx; margin-top: 24rpx;
    .row-lbl { flex: 1; font-size: 26rpx; color: $wa-ink; }
  }
  .sw { transform: scale(.9); }
  .field { margin-top: 24rpx;
    .row-lbl { display: block; font-size: 26rpx; color: $wa-ink; margin-bottom: 12rpx; }
    .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 26rpx; color: $wa-ink; }
    .ta { width: 100%; height: 140rpx; background: $wa-bg; border-radius: $wa-radius;
      padding: 16rpx 24rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
    .count { display: block; text-align: right; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }
  .tip { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 12rpx; line-height: 1.5; }
  .next { display: block; font-size: 22rpx; color: #fa8c16; font-weight: 600; margin-top: 10rpx; }
  .presets { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
    .preset { font-size: 22rpx; color: $wa-accent; border: 1.5px solid $wa-accent;
      border-radius: 999rpx; padding: 8rpx 20rpx; }
  }
  .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius;
    line-height: 88rpx; margin-bottom: 24rpx;
    &[disabled] { opacity: .6; }
  }
  .seg { display: flex; gap: 12rpx; margin: 20rpx 0 8rpx;
    .seg-i { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
      background: $wa-bg; border-radius: $wa-radius; padding: 12rpx 0; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
    }
  }
  .kpis { display: flex; gap: 16rpx; margin-top: 16rpx;
    .kpi { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 16rpx;
      display: flex; flex-direction: column; gap: 6rpx;
      .kpi-num { font-size: 32rpx; color: $wa-ink; font-weight: 700;
        &.bad { color: #d4380d; } }
      .kpi-lbl { font-size: 20rpx; color: $wa-muted; }
    }
  }
  .trend { margin-top: 24rpx;
    .trend-t { font-size: 24rpx; color: $wa-muted; }
  }
  .export { margin-top: 28rpx; padding-top: 24rpx; border-top: 1.5px solid $wa-rule;
    .export-btn { background: $wa-bg; color: $wa-accent; font-size: 26rpx; font-weight: 600;
      border: 1.5px solid $wa-accent; border-radius: $wa-radius; line-height: 76rpx; }
  }
  .bars { display: flex; align-items: flex-end; gap: 9rpx; height: 240rpx; margin-top: 16rpx;
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      .bar-v { font-size: 18rpx; color: $wa-muted; margin-bottom: 6rpx; }
      .bar { width: 100%; background: $wa-accent; border-radius: 6rpx 6rpx 0 0; opacity: .85; }
      .bar-d { font-size: 18rpx; color: $wa-muted; margin-top: 8rpx; }
    }
  }
}
</style>
