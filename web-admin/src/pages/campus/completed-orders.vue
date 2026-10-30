<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusCompleted.loading') }}</view>
    <template v-else>
      <!-- 汇总（§75 对账）：区间内单量/总额/退款/实收/客单价，统计不受分页影响 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusCompleted.summaryTitle') }}</text>
          <view class="pill"><text>{{ rangeText }}</text></view>
        </view>
        <view class="seg">
          <text class="seg-i" :class="{ on: range === 'today' }" @tap="setRange('today')">
            {{ $t('campusCompleted.rangeToday') }}
          </text>
          <text class="seg-i" :class="{ on: range === 'last7' }" @tap="setRange('last7')">
            {{ $t('campusCompleted.range7d') }}
          </text>
          <text class="seg-i" :class="{ on: range === 'custom' }" @tap="setRange('custom')">
            {{ $t('campusCompleted.rangeCustom') }}
          </text>
        </view>
        <view v-if="range === 'custom'" class="range-row">
          <picker mode="date" :value="fromDate || todayKey" :end="toDate || todayKey" @change="onPickFrom">
            <view class="ipt picker" :class="{ picked: !!fromDate }">
              {{ fromDate || $t('campusCompleted.fromPh') }}
            </view>
          </picker>
          <text class="range-sep">~</text>
          <picker mode="date" :value="toDate || fromDate || todayKey" :start="fromDate" :end="todayKey" @change="onPickTo">
            <view class="ipt picker" :class="{ picked: !!toDate }">
              {{ toDate || $t('campusCompleted.toPh') }}
            </view>
          </picker>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num">{{ summary.total }}</text>
            <text class="kpi-lbl">{{ $t('campusCompleted.kpiOrders') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num">¥{{ fenToYuanFixed(summary.totalAmount) }}</text>
            <text class="kpi-lbl">{{ $t('campusCompleted.kpiGross') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num bad">¥{{ fenToYuanFixed(summary.refundAmount) }}</text>
            <text class="kpi-lbl">{{ $t('campusCompleted.kpiRefund') }}</text>
          </view>
        </view>
        <view class="kpis">
          <view class="kpi">
            <text class="kpi-num good">¥{{ fenToYuanFixed(summary.netAmount) }}</text>
            <text class="kpi-lbl">{{ $t('campusCompleted.kpiNet') }}</text>
          </view>
          <view class="kpi">
            <text class="kpi-num">¥{{ fenToYuanFixed(summary.avgTicket) }}</text>
            <text class="kpi-lbl">{{ $t('campusCompleted.kpiAvg') }}</text>
          </view>
        </view>
      </view>

      <!-- 检索（复用 §74 口径）：单号（可后 4 位）/楼栋/区域/手机可见数字/商品/备注/骑手 -->
      <view class="searchbar">
        <input v-model="kw" class="s-input" :placeholder="$t('campusCompleted.searchPh')" />
        <text v-if="kw" class="s-clear" @tap="kw = ''">✕</text>
      </view>
      <view class="countbar">
        <text class="count">{{ countText }}</text>
        <button class="copy-btn" :disabled="!filtered.length" @tap="copyList">
          {{ $t('campusCompleted.copyBtn') }}
        </button>
      </view>

      <view v-if="!filtered.length" class="hint empty">
        {{ kw ? $t('campusCompleted.searchEmpty') : $t('campusCompleted.empty') }}
      </view>
      <view v-else class="list">
        <view v-for="o in filtered" :key="o.id" class="order">
          <view class="o-head">
            <text class="o-code">{{ o.code }}</text>
            <text class="o-time">{{ timeText(o) }}</text>
            <text class="o-net">¥{{ fenToYuanFixed(o.netAmount) }}</text>
          </view>
          <view class="o-sub">
            <text class="o-place">{{ placeText(o) }}</text>
            <text v-if="o.refundAmount > 0" class="o-refund">
              {{ $t('campusCompleted.refundTag') }} ¥{{ fenToYuanFixed(o.refundAmount) }}
            </text>
          </view>
          <text class="o-lines">{{ o.lineText || $t('campusCompleted.lineEmpty') }}</text>
          <view class="o-foot">
            <text class="o-phone" @tap="copyPhone(o)">{{ o.customerPhone || $t('campusCompleted.noPhone') }}</text>
            <text class="o-total">{{ $t('campusCompleted.orderTotal') }} ¥{{ fenToYuanFixed(o.total) }}</text>
          </view>
          <text v-if="o.note" class="o-note">{{ $t('campusCompleted.noteLabel') }}：{{ o.note }}</text>
          <!-- 退款（§76）：仅有可退余额的已送达订单展示；整单/部分退款原路退回 -->
          <view v-if="o.refundable > 0" class="o-ops">
            <button class="refund-btn" @tap.stop="openRefund(o)">
              {{ $t('campusCompleted.refundBtn') }} · {{ $t('campusCompleted.refundable') }} ¥{{ fenToYuanFixed(o.refundable) }}
            </button>
          </view>
        </view>
      </view>
      <button v-if="hasMore" class="more" :disabled="loadingMore" @tap="loadMore">
        {{ loadingMore ? $t('campusCompleted.loadingMore') : $t('campusCompleted.loadMore') }}
      </button>

      <!-- 退款面板：金额（元）+ 原因，二次确认后提交；金额单位分 -->
      <view v-if="refundOpen" class="mask" @tap.self="refundOpen = false">
        <view class="sheet">
          <view class="sheet__hd">
            <text class="sheet__t">{{ $t('campusCompleted.refundTitle') }}</text>
            <text class="sheet__x" @tap="refundOpen = false">✕</text>
          </view>
          <text class="sheet__sub">{{ refundTarget?.code }} · {{ refundTarget ? placeText(refundTarget) : '' }}</text>
          <view class="sheet__kpis">
            <text>{{ $t('campusCompleted.refundTotal') }} ¥{{ fenToYuanFixed(refundTarget?.total ?? 0) }}</text>
            <text>{{ $t('campusCompleted.refundDone') }} ¥{{ fenToYuanFixed(refundTarget?.refundAmount ?? 0) }}</text>
            <text class="max">{{ $t('campusCompleted.refundable') }} ¥{{ fenToYuanFixed(refundTarget?.refundable ?? 0) }}</text>
          </view>
          <text class="sheet__hint">{{ $t('campusCompleted.refundHint') }}</text>
          <text class="sheet__label">{{ $t('campusCompleted.refundAmountLabel') }}</text>
          <view class="amount-row">
            <input v-model="refundYuan" class="sheet__input" type="digit" :placeholder="$t('campusCompleted.refundAmountPh')" />
            <text class="all-btn" @tap="fillFullRefund">{{ $t('campusCompleted.refundAll') }}</text>
          </view>
          <text class="sheet__label">{{ $t('campusCompleted.refundReasonLabel') }}</text>
          <textarea
            v-model="refundReason"
            class="sheet__area"
            :maxlength="200"
            :placeholder="$t('campusCompleted.refundReasonPh')"
          />
          <view class="sheet__ops">
            <button class="sheet__save" :disabled="refundBusy" @tap="submitRefund">
              {{ $t('campusCompleted.refundSubmit') }}
            </button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import {
  campusMerchantCompletedOrders,
  campusMerchantRefundOrder,
  type MerchantCompletedOrder,
  type MerchantCompletedOrders,
} from '../../apis/campus';
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
const data = ref<MerchantCompletedOrders | null>(null);
/** 退款面板（§76）：目标订单 / 金额（元输入）/ 原因 / 提交中 */
const refundOpen = ref(false);
const refundTarget = ref<MerchantCompletedOrder | null>(null);
const refundYuan = ref('');
const refundReason = ref('');
const refundBusy = ref(false);

/** 校园日（UTC+8）日期键：offsetDays=0 为今天 */
function campusDateKey(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** 日期键 00:00（UTC+8）→ ISO 瞬时；offsetDays=1 用于「结束日期当日 24:00」 */
function dayStartIso(date: string, offsetDays = 0): string {
  const t = Date.parse(`${date}T00:00:00+08:00`) + offsetDays * 86_400_000;
  return new Date(t).toISOString();
}

/** 区间入参：from/to 为空=今日 0 点至当前（服务端兜底） */
function rangeParams(): { from?: string; to?: string } {
  if (range.value === 'today') return { from: dayStartIso(todayKey) };
  if (range.value === 'last7') return { from: dayStartIso(campusDateKey(-6)) };
  return {
    from: dayStartIso(fromDate.value),
    to: dayStartIso(toDate.value, 1),
  };
}

const items = computed(() => data.value?.items ?? []);
const summary = computed(() =>
  data.value ?? { items: [], total: 0, totalAmount: 0, refundAmount: 0, netAmount: 0, avgTicket: 0, start: '', end: '' },
);
const hasMore = computed(() => (data.value?.total ?? 0) > items.value.length);

const rangeText = computed(() => {
  if (range.value === 'today') return locale.t('campusCompleted.rangeToday');
  if (range.value === 'last7') return locale.t('campusCompleted.range7d');
  return `${fromDate.value} ~ ${toDate.value}`;
});

/** 检索口径与 §74 一致：单号（含后 4 位数字）、楼栋/区域/商品/备注/骑手、手机可见数字 */
function matchKeyword(o: MerchantCompletedOrder, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const code = o.code.toLowerCase();
  if (code.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits) {
    const phone = (o.customerPhone ?? '').replace(/\D/g, '');
    if (phone && phone.includes(digits)) return true;
    if (code.replace(/\D/g, '').includes(digits)) return true;
  }
  return [o.building, o.zone, o.lineText, o.note ?? '', o.riderName ?? '']
    .some(s => String(s).toLowerCase().includes(q));
}

const filtered = computed(() => items.value.filter(o => matchKeyword(o, kw.value)));

const countText = computed(() =>
  locale.t('campusCompleted.searchCount')
    .replace('{n}', String(filtered.value.length))
    .replace('{m}', String(items.value.length)),
);

function placeText(o: MerchantCompletedOrder): string {
  const zone = o.zone ? `${o.zone} ` : '';
  return `${zone}${o.building || locale.t('campusCompleted.noBuilding')}`;
}

function timeText(o: MerchantCompletedOrder): string {
  if (!o.deliveredAt) return locale.t('campusCompleted.noTime');
  const s = formatDateTime(o.deliveredAt);
  return s ? s.slice(6) : '';
}

async function load(reset = true): Promise<void> {
  const skip = reset ? 0 : items.value.length;
  const res = await campusMerchantCompletedOrders({ ...rangeParams(), take: 100, skip });
  if (reset || !data.value) {
    data.value = res;
  } else {
    // 追加分页：汇总仍用服务端全区间统计
    data.value = { ...res, items: [...items.value, ...res.items] };
  }
}

async function reload(): Promise<void> {
  if (range.value === 'custom' && (!fromDate.value || !toDate.value)) return;
  // 仅首次加载显示整页 loading；切区间沿用旧列表，避免闪屏
  const initial = !data.value;
  if (initial) loading.value = true;
  try {
    await load(true);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusCompleted.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function setRange(next: 'today' | 'last7' | 'custom'): void {
  range.value = next;
  if (next === 'custom') {
    // 首次进入自定义：默认今天（同日区间）
    if (!fromDate.value) fromDate.value = todayKey;
    if (!toDate.value) toDate.value = todayKey;
  }
  void reload();
}

function onPickFrom(e: any): void {
  fromDate.value = String(e?.detail?.value ?? '');
  // 开始日期后移时清空早于它的结束日期，避免提交才报错
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
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusCompleted.loadFailed')), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

/** 按当前检索结果生成对账清单文本：汇总用可见单合计，避免与筛选结果对不上 */
function buildCopyText(): string {
  const list = filtered.value;
  const sumTotal = list.reduce((s, o) => s + o.total, 0);
  const sumRefund = list.reduce((s, o) => s + o.refundAmount, 0);
  const sumNet = sumTotal - sumRefund;
  const lines: string[] = [
    locale.t('campusCompleted.copyTitle'),
    `${formatDateTime(summary.value.start)} ~ ${formatDateTime(summary.value.end)}`,
    `${locale.t('campusCompleted.kpiOrders')} ${list.length} | ${locale.t('campusCompleted.kpiGross')} ¥${fenToYuanFixed(sumTotal)} | ${locale.t('campusCompleted.kpiRefund')} ¥${fenToYuanFixed(sumRefund)} | ${locale.t('campusCompleted.kpiNet')} ¥${fenToYuanFixed(sumNet)}`,
    '',
  ];
  list.forEach(o => {
    lines.push(
      [
        o.code,
        timeText(o),
        `${locale.t('campusCompleted.kpiNet')} ¥${fenToYuanFixed(o.netAmount)}`,
        placeText(o),
        o.customerPhone || locale.t('campusCompleted.noPhone'),
        o.lineText || locale.t('campusCompleted.lineEmpty'),
      ].join(' | '),
    );
  });
  return lines.join('\n');
}

function copyList(): void {
  if (!filtered.value.length) {
    uni.showToast({ title: locale.t('campusCompleted.copyEmpty'), icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: buildCopyText(),
    success: () => uni.showToast({ title: locale.t('campusCompleted.copyDone'), icon: 'none' }),
  });
}

function copyPhone(o: MerchantCompletedOrder): void {
  if (!o.customerPhone) return;
  uni.setClipboardData({
    data: o.customerPhone,
    success: () => uni.showToast({ title: locale.t('campusCompleted.copyDone'), icon: 'none' }),
  });
}

/** 打开退款面板：清空上次输入，避免误用旧金额/原因 */
function openRefund(o: MerchantCompletedOrder): void {
  refundTarget.value = o;
  refundYuan.value = '';
  refundReason.value = '';
  refundOpen.value = true;
}

/** 全额退款：直接填入剩余可退金额（元） */
function fillFullRefund(): void {
  refundYuan.value = fenToYuanFixed(refundTarget.value?.refundable ?? 0);
}

/** 提交退款：本地校验 → 二次确认 → 请求（金额转分，与后端口径一致） */
function submitRefund(): void {
  const max = refundTarget.value?.refundable ?? 0;
  const fen = Math.round(Number(refundYuan.value || 0) * 100);
  if (!Number.isFinite(fen) || fen <= 0) {
    uni.showToast({ title: locale.t('campusCompleted.refundAmountBad'), icon: 'none' });
    return;
  }
  if (fen > max) {
    uni.showToast({ title: locale.t('campusCompleted.refundAmountOver'), icon: 'none' });
    return;
  }
  const reason = refundReason.value.trim();
  if (!reason) {
    uni.showToast({ title: locale.t('campusCompleted.refundReasonEmpty'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: locale.t('campusCompleted.refundConfirmTitle'),
    content: locale.t('campusCompleted.refundConfirmBody').replace('{amount}', fenToYuanFixed(fen)),
    success: res => {
      if (res.confirm) void doRefund(fen, reason);
    },
  });
}

/** 真正退款：成功后关闭面板并刷新列表（可退余额/已退金额随之更新） */
async function doRefund(fen: number, reason: string): Promise<void> {
  const target = refundTarget.value;
  if (!target || refundBusy.value) return;
  refundBusy.value = true;
  try {
    const r = await campusMerchantRefundOrder(target.id, fen, reason);
    refundOpen.value = false;
    uni.showToast({
      title: locale.t('campusCompleted.refundOk').replace('{amount}', fenToYuanFixed(r.amount)),
      icon: 'none',
    });
    await reload();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusCompleted.refundFail')), icon: 'none' });
  } finally {
    refundBusy.value = false;
  }
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
          &.good { color: #1a7f37; }
        }
        .kpi-lbl { font-size: 20rpx; color: $wa-muted; }
      }
    }
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
    .order { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 12rpx;
      .o-head { display: flex; align-items: center; gap: 12rpx;
        .o-code { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .o-time { font-size: 24rpx; color: $wa-muted; }
        .o-net { font-size: 28rpx; color: $wa-ink; font-weight: 700; }
      }
      .o-sub { display: flex; align-items: center; gap: 12rpx;
        .o-place { flex: 1; font-size: 24rpx; color: $wa-muted; }
        .o-refund { font-size: 22rpx; color: #d4380d; background: #fdecec;
          border-radius: 999rpx; padding: 4rpx 16rpx;
        }
      }
      .o-lines { font-size: 24rpx; color: $wa-ink; line-height: 1.5; }
      .o-foot { display: flex; align-items: center; gap: 12rpx;
        .o-phone { flex: 1; font-size: 24rpx; color: $wa-muted; letter-spacing: 2rpx; }
        .o-total { font-size: 22rpx; color: $wa-muted; }
      }
      .o-note { font-size: 22rpx; color: #fa8c16; }
      .o-ops { display: flex; justify-content: flex-end; margin-top: 4rpx;
        .refund-btn { margin: 0; height: 60rpx; line-height: 60rpx; padding: 0 28rpx;
          background: #fff1f0; color: #d4380d; font-size: 24rpx; border-radius: 999rpx; border: none;
        }
      }
    }
  }
  .more { background: $wa-card; color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius;
    line-height: 76rpx; margin-top: 24rpx; &[disabled] { opacity: .6; }
  }
  .mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
    display: flex; align-items: flex-end;
  }
  .sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx;
    box-sizing: border-box;
    &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
    &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
    &__sub { display: block; font-size: 26rpx; color: $wa-ink; margin-bottom: 12rpx; }
    &__kpis { display: flex; align-items: center; gap: 24rpx; font-size: 22rpx; color: $wa-muted;
      background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; margin-bottom: 16rpx;
      .max { color: #1a7f37; font-weight: 600; }
    }
    &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
    &__label { display: block; font-size: 24rpx; color: $wa-ink; margin-bottom: 10rpx; }
    &__input { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx;
      font-size: 28rpx; box-sizing: border-box; }
    &__area { width: 100%; height: 140rpx; background: $wa-bg; border-radius: $wa-radius;
      padding: 16rpx 20rpx; font-size: 26rpx; box-sizing: border-box; }
    &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 24rpx; }
    &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
      color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
      &[disabled] { opacity: .6; }
    }
  }
  .amount-row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 20rpx;
    .sheet__input { flex: 1; }
    .all-btn { flex: none; font-size: 24rpx; color: $wa-accent; background: $wa-bg;
      border-radius: 999rpx; padding: 12rpx 24rpx;
    }
  }
}
</style>
