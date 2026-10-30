<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusDailyReport.loading') }}</view>
    <template v-else>
      <!-- 日报头：日期切换（前一天 / 当天 / 后一天，最多回看 30 天） -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusDailyReport.title') }}</text>
          <view class="pill"><text>{{ report?.date || dateKey }}</text></view>
        </view>
        <view class="datebar">
          <text class="arrow" :class="{ off: !canPrev }" @tap="shiftDay(-1)">‹</text>
          <picker mode="date" :value="dateKey" :end="todayKey" @change="onPick">
            <view class="date-ipt">{{ dateKey }}</view>
          </picker>
          <text class="arrow" :class="{ off: !canNext }" @tap="shiftDay(1)">›</text>
        </view>
        <view class="seg">
          <text class="seg-i" :class="{ on: dateKey === todayKey }" @tap="setQuick('today')">
            {{ $t('campusDailyReport.quickToday') }}
          </text>
          <text class="seg-i" :class="{ on: dateKey === yesterdayKey }" @tap="setQuick('yesterday')">
            {{ $t('campusDailyReport.quickYesterday') }}
          </text>
        </view>
      </view>

      <!-- 单日 KPI -->
      <view class="card">
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num">{{ report?.orders ?? 0 }}</text>
            <text class="kpi-lbl">{{ $t('campusDailyReport.kpiOrders') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num">¥{{ fenToYuanFixed(report?.gross ?? 0) }}</text>
            <text class="kpi-lbl">{{ $t('campusDailyReport.kpiGross') }}</text>
          </view>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num">¥{{ fenToYuanFixed(report?.avgTicket ?? 0) }}</text>
            <text class="kpi-lbl">{{ $t('campusDailyReport.kpiAvg') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num" :class="{ bad: (report?.cancelledAmount ?? 0) > 0 }">
              ¥{{ fenToYuanFixed(report?.cancelledAmount ?? 0) }}
            </text>
            <text class="kpi-lbl">{{ refundLabel }}</text>
          </view>
        </view>
      </view>

      <!-- 对比：昨日 / 近 7 日均值 -->
      <view class="card">
        <view class="head"><text class="title">{{ $t('campusDailyReport.cmpTitle') }}</text></view>
        <view class="cmp">
          <text class="cmp-who">{{ $t('campusDailyReport.cmpPrev') }}</text>
          <text class="cmp-item">{{ $t('campusDailyReport.cmpOrders') }} {{ diffText(report?.prev.orders, report?.orders) }}</text>
          <text class="cmp-item">{{ $t('campusDailyReport.cmpGross') }} {{ diffText(report?.prev.gross, report?.gross) }}</text>
        </view>
        <view class="cmp">
          <text class="cmp-who">{{ $t('campusDailyReport.cmpLast7') }}</text>
          <text class="cmp-item">{{ $t('campusDailyReport.cmpOrders') }} {{ diffText(report?.last7Avg.orders, report?.orders) }}</text>
          <text class="cmp-item">{{ $t('campusDailyReport.cmpGross') }} {{ diffText(report?.last7Avg.gross, report?.gross) }}</text>
        </view>
      </view>

      <!-- 时段分布 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusDailyReport.hourlyTitle') }}</text>
          <text v-if="peak" class="peak">
            {{ $t('campusDailyReport.hourlyPeak').replace('{h}', String(peak.hour)).replace('{n}', String(peak.orders)) }}
          </text>
        </view>
        <view class="bars">
          <view v-for="h in hourly" :key="h.hour" class="bar-col">
            <view class="bar" :class="{ hot: peak && h.hour === peak.hour }" :style="{ height: barH(h.gross) + 'rpx' }" />
            <text class="bar-x">{{ h.hour % 3 === 0 ? h.hour : '' }}</text>
          </view>
        </view>
      </view>

      <!-- 商品 Top5 -->
      <view class="card">
        <view class="head"><text class="title">{{ $t('campusDailyReport.productsTitle') }}</text></view>
        <view v-if="!products.length" class="hint empty">{{ $t('campusDailyReport.productsEmpty') }}</view>
        <view v-else class="plist">
          <view v-for="(p, i) in products" :key="p.name" class="prow">
            <text class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</text>
            <text class="pname">{{ p.name }}</text>
            <text class="pqty">×{{ p.qty }}</text>
            <text class="pamt">¥{{ fenToYuanFixed(p.amount) }}</text>
          </view>
        </view>
      </view>

      <button class="copy" :disabled="!report" @tap="copyReport">{{ $t('campusDailyReport.copyBtn') }}</button>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { campusMerchantDailyReport, type CampusDailyReport } from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const loading = ref(true);
const report = ref<CampusDailyReport | null>(null);
/** 校园日（UTC+8）日期键：offsetDays=0 为今天 */
function campusDateKey(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
const todayKey = campusDateKey(0);
const yesterdayKey = campusDateKey(-1);
const earliestKey = campusDateKey(-29);
const dateKey = ref(todayKey);

const hourly = computed(() => report.value?.hourly ?? []);
const products = computed(() => report.value?.topProducts ?? []);
const canPrev = computed(() => dateKey.value > earliestKey);
const canNext = computed(() => dateKey.value < todayKey);

const refundLabel = computed(() =>
  locale.t('campusDailyReport.kpiRefund').replace('{n}', String(report.value?.cancelled ?? 0)),
);

/** 时段峰值：单量最多的整点（全天空则不出） */
const peak = computed(() => {
  const list = hourly.value;
  if (!list.length) return null;
  let best = list[0];
  for (const h of list) if (h.orders > best.orders) best = h;
  return best.orders > 0 ? best : null;
});

const maxGross = computed(() => Math.max(1, ...hourly.value.map(h => h.gross)));

/** 柱高：按当日最大小时营业额等比缩放，最低 6rpx 保留空档可读性 */
function barH(gross: number): number {
  return Math.max(6, Math.round((gross / maxGross.value) * 120));
}

/** 对比文案：+8.4% / -2.1%；基数为 0 时不做百分比（避免除零误导） */
function diffText(base: number | undefined, cur: number | undefined): string {
  const b = base ?? 0;
  const c = cur ?? 0;
  if (!b) return '—';
  const d = ((c - b) / b) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

async function load(): Promise<void> {
  try {
    report.value = await campusMerchantDailyReport(dateKey.value === todayKey ? null : dateKey.value);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDailyReport.loadFailed')), icon: 'none' });
  }
}

async function reload(): Promise<void> {
  loading.value = true;
  await load();
  loading.value = false;
}

function shiftDay(delta: number): void {
  if (delta < 0 && !canPrev.value) return;
  if (delta > 0 && !canNext.value) return;
  const t = Date.parse(`${dateKey.value}T00:00:00+08:00`) + delta * 86_400_000;
  dateKey.value = new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
  void load();
}

function setQuick(next: 'today' | 'yesterday'): void {
  const key = next === 'today' ? todayKey : yesterdayKey;
  if (key === dateKey.value) return;
  dateKey.value = key;
  void load();
}

function onPick(e: any): void {
  const v = String(e?.detail?.value ?? '');
  if (!v || v === dateKey.value) return;
  dateKey.value = v;
  void load();
}

/** 复制日报：纯文本，可直接发群里（KPI + 对比 + 峰值 + Top 商品） */
function copyReport(): void {
  const r = report.value;
  if (!r) return;
  const L = (k: string) => locale.t(`campusDailyReport.${k}`);
  const lines: string[] = [
    `${L('copyTitle')} ${r.date}`,
    `${L('kpiOrders')} ${r.orders} · ${L('kpiGross')} ¥${fenToYuanFixed(r.gross)} · ${L('kpiAvg')} ¥${fenToYuanFixed(r.avgTicket)} · ${L('kpiRefund').replace('{n}', String(r.cancelled))} ¥${fenToYuanFixed(r.cancelledAmount)}`,
    `${L('cmpPrev')}：${L('cmpOrders')} ${diffText(r.prev.orders, r.orders)} · ${L('cmpGross')} ${diffText(r.prev.gross, r.gross)}`,
    `${L('cmpLast7')}：${L('cmpOrders')} ${diffText(r.last7Avg.orders, r.orders)} · ${L('cmpGross')} ${diffText(r.last7Avg.gross, r.gross)}`,
  ];
  if (peak.value) {
    lines.push(L('hourlyPeak').replace('{h}', String(peak.value.hour)).replace('{n}', String(peak.value.orders)));
  }
  if (products.value.length) {
    lines.push(`${L('productsTitle')}：` + products.value.map(p => `${p.name} ×${p.qty}`).join(' / '));
  }
  uni.setClipboardData({
    data: lines.join('\n'),
    success: () => uni.showToast({ title: L('copied'), icon: 'none' }),
  });
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
  .hint.empty { padding: 40rpx 32rpx; line-height: 1.6; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
      .peak { font-size: 22rpx; color: $wa-muted; }
    }
    .pill { padding: 8rpx 24rpx; border-radius: 999rpx; background: $wa-rule;
      text { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
    }
    .datebar { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx;
      .arrow { width: 64rpx; text-align: center; font-size: 34rpx; color: $wa-accent;
        line-height: 64rpx; &.off { color: $wa-rule; }
      }
      .date-ipt { flex: 1; text-align: center; background: $wa-bg; border-radius: $wa-radius;
        padding: 18rpx 0; font-size: 28rpx; color: $wa-ink; font-weight: 600;
      }
    }
    .seg { display: flex; gap: 12rpx; margin-top: 16rpx;
      .seg-i { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
        padding: 12rpx 0; border-radius: $wa-radius; background: $wa-bg;
        &.on { background: $wa-accent; color: #fff; font-weight: 600; }
      }
    }
    .kpis { display: flex; gap: 16rpx;
      & + .kpis { margin-top: 16rpx; }
      .kpi { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 20rpx;
        display: flex; flex-direction: column; gap: 6rpx;
        .kpi-num { font-size: 32rpx; color: $wa-ink; font-weight: 700; &.bad { color: #d4380d; } }
        .kpi-lbl { font-size: 20rpx; color: $wa-muted; }
      }
    }
    .cmp { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx;
      padding: 14rpx 20rpx; background: $wa-bg; border-radius: $wa-radius;
      .cmp-who { flex: 0 0 210rpx; font-size: 23rpx; color: $wa-ink; font-weight: 600; }
      .cmp-item { flex: 1; font-size: 22rpx; color: $wa-muted; }
    }
    .bars { display: flex; align-items: flex-end; gap: 2rpx; margin-top: 20rpx; height: 160rpx;
      .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
        .bar { width: 100%; background: $wa-rule; border-radius: 6rpx 6rpx 0 0; &.hot { background: $wa-accent; } }
        .bar-x { font-size: 18rpx; color: $wa-muted; line-height: 28rpx; height: 28rpx; }
      }
    }
    .plist { display: flex; flex-direction: column; gap: 12rpx; margin-top: 16rpx;
      .prow { display: flex; align-items: center; gap: 16rpx;
        .rank { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 50%;
          font-size: 22rpx; color: $wa-muted; background: $wa-bg; &.top { background: $wa-accent; color: #fff; font-weight: 700; }
        }
        .pname { flex: 1; font-size: 26rpx; color: $wa-ink; }
        .pqty { font-size: 26rpx; color: $wa-ink; font-weight: 700; }
        .pamt { width: 150rpx; text-align: right; font-size: 24rpx; color: $wa-muted; }
      }
    }
  }
  .copy { background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius;
    line-height: 84rpx; margin-top: 8rpx; &[disabled] { opacity: .5; }
  }
}
</style>
