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

      <!-- 营业日历（§70）：指定日期休业（节假日/临时休业），当天 C 端「今日休业」并禁止下单 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusStoreSettings.closureTitle') }}</text>
          <view class="pill" :class="{ off: !!profile?.closedToday }">
            <text>{{ closurePillText }}</text>
          </view>
        </view>
        <text v-if="profile?.closedToday" class="next">
          {{ $t('campusStoreSettings.closureTodayHint').replace('{note}', profile.closureNote ? `（${profile.closureNote}）` : '') }}
        </text>
        <text v-else class="tip">{{ $t('campusStoreSettings.closureHint') }}</text>
        <!-- 休业日未出餐提醒（§71）：休业当天仍有待接单/备餐中订单 -->
        <text v-if="profile?.closedToday && (profile?.unfinishedOrders ?? 0) > 0" class="unfinished">
          {{ $t('campusStoreSettings.closureUnfinished').replace('{n}', String(profile?.unfinishedOrders ?? 0)) }}
        </text>
        <view v-if="closure.length" class="closure-list">
          <view v-for="c in closure" :key="c.date" class="closure-item">
            <view class="closure-main">
              <text class="closure-date">{{ c.date }}</text>
              <text class="closure-note">{{ c.note || $t('campusStoreSettings.closureNoNote') }}</text>
            </view>
            <text class="closure-del" @tap="removeClosure(c.date)">{{ $t('campusStoreSettings.closureDelete') }}</text>
          </view>
        </view>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.closureAddLabel') }}</text>
          <view class="range-row">
            <picker mode="date" :value="newDate" :start="minDate" :end="maxDate" @change="onPickDate">
              <view class="ipt picker range-ipt" :class="{ picked: !!newDate }">{{ newDate || $t('campusStoreSettings.closureDatePh') }}</view>
            </picker>
            <text class="range-sep">~</text>
            <picker mode="date" :value="newEndDate || newDate || minDate" :start="newDate || minDate" :end="maxDate" @change="onPickEndDate">
              <view class="ipt picker range-ipt" :class="{ picked: !!newEndDate }">{{ newEndDate || $t('campusStoreSettings.closureRangeEndPh') }}</view>
            </picker>
          </view>
          <input
            v-model="newNote" class="ipt note-ipt" maxlength="40"
            :placeholder="$t('campusStoreSettings.closureNotePh')"
          />
          <button class="add-btn" @tap="addClosure">{{ $t('campusStoreSettings.closureAdd') }}</button>
          <text class="tip">{{ $t('campusStoreSettings.closureRangeHint') }}</text>
          <text class="tip">{{ $t('campusStoreSettings.closureRuleHint') }}</text>
        </view>
        <button class="save small" :disabled="closureBusy" @tap="saveClosure">
          {{ closureBusy ? $t('campusStoreSettings.saving') : $t('campusStoreSettings.closureSave') }}
        </button>
      </view>

      <!-- 自动接单（§69）：营业中 + 未临时休息时，新单延迟若干秒自动确认进入备餐 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusStoreSettings.autoTitle') }}</text>
          <view class="pill" :class="{ open: autoOn, off: !autoOn }">
            <text>{{ autoOn ? $t('campusStoreSettings.autoOn') : $t('campusStoreSettings.autoOff') }}</text>
          </view>
        </view>
        <view class="row">
          <text class="row-lbl">{{ $t('campusStoreSettings.autoToggle') }}</text>
          <switch class="sw" :checked="autoOn" :disabled="autoBusy" color="#ff6600" @change="onAutoToggle" />
        </view>
        <text class="tip">{{ $t('campusStoreSettings.autoHint') }}</text>
        <text v-if="auto && !auto.merchantConfirmEnabled" class="next">{{ $t('campusStoreSettings.autoNeedConfirm') }}</text>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.autoDelayLabel') }}</text>
          <input v-model="autoForm.delaySeconds" class="ipt" type="number" :placeholder="$t('campusStoreSettings.autoDelayPh')" />
          <text class="tip">{{ $t('campusStoreSettings.autoDelayHint') }}</text>
        </view>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.autoLimitLabel') }}</text>
          <input v-model="autoForm.dailyLimit" class="ipt" type="number" :placeholder="$t('campusStoreSettings.autoLimitPh')" />
          <text class="tip">{{ $t('campusStoreSettings.autoLimitHint').replace('{n}', String(auto ? auto.acceptedToday : 0)) }}</text>
        </view>
        <view class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.autoScopeLabel') }}</text>
          <view class="presets">
            <text
              v-for="r in AUTO_ROUTE_OPTIONS" :key="r.code" class="preset"
              :class="{ on: autoForm.routes.includes(r.code) }" @tap="toggleAutoRoute(r.code)"
            >{{ $t(r.key) }}</text>
          </view>
          <text class="tip">{{ $t('campusStoreSettings.autoScopeHint') }}</text>
        </view>
        <button class="save small" :disabled="autoBusy" @tap="saveAutoAccept">
          {{ autoBusy ? $t('campusStoreSettings.saving') : $t('campusStoreSettings.autoSave') }}
        </button>
      </view>

      <!-- 每日日报推送（§86）：营业结束后把昨日日报推到商家群，商家不开后台也知道卖了多少 -->
      <view class="card">
        <text class="title">{{ $t('campusStoreSettings.dailyPushTitle') }}</text>
        <view class="row">
          <text class="row-lbl">{{ $t('campusStoreSettings.dailyPushToggle') }}</text>
          <switch class="sw" :checked="dailyForm.enabled" :disabled="dailyBusy" color="#ff6600" @change="onDailyPushToggle" />
        </view>
        <view v-if="dailyForm.enabled" class="field">
          <text class="row-lbl">{{ $t('campusStoreSettings.dailyPushTimeLabel') }}</text>
          <input v-model="dailyForm.time" class="ipt" type="text" placeholder="21:30" />
          <text class="tip">{{ $t('campusStoreSettings.dailyPushTimeHint') }}</text>
        </view>
        <text class="tip">{{ $t('campusStoreSettings.dailyPushDesc') }}</text>
        <button class="save small" :disabled="dailyBusy" @tap="saveDailyPush">
          {{ dailyBusy ? $t('campusStoreSettings.saving') : $t('campusStoreSettings.dailyPushSave') }}
        </button>
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
  campusMerchantAutoAccept,
  campusMerchantRevenue,
  campusMerchantSetClosureDates,
  campusMerchantSetPaused,
  campusMerchantStoreProfile,
  campusMerchantUpdateAutoAccept,
  campusMerchantUpdateDailyPush,
  campusMerchantUpdateStore,
  type CampusMerchantAutoAccept,
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
/** 每日日报推送（§86）：开关 + HH:MM 时间，保存走 campusMerchantUpdateDailyPush */
const dailyBusy = ref(false);
const dailyForm = ref({ enabled: false, time: '21:30' });
const warnOn = ref(closingWarnEnabled());
let clockTimer: ReturnType<typeof setInterval> | null = null;

/** 营业日历（§70）：休业日期本地列表（保存前可增删），date=YYYY-MM-DD */
const closure = ref<Array<{ date: string; note: string }>>([]);
const newDate = ref('');
/** 区间批量添加（§72）的结束日期，留空 = 只添加开始日期当天 */
const newEndDate = ref('');
const newNote = ref('');
const closureBusy = ref(false);

/** 校园日（UTC+8）日期键：offsetDays=0 为今天，与后端 campusDayKey 口径一致 */
function campusDateKey(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
const minDate = campusDateKey(0);
const maxDate = campusDateKey(90);

function applyClosure(p: MerchantStoreProfile): void {
  closure.value = (p.closureDates ?? []).map(d => ({ date: d.date, note: d.note ?? '' }));
}

function onPickDate(e: any): void {
  newDate.value = String(e?.detail?.value ?? '');
  // 开始日期后移时，已选的结束日期早于开始日期则清空，避免提交时才报错
  if (newEndDate.value && newEndDate.value < newDate.value) newEndDate.value = '';
}

function onPickEndDate(e: any): void {
  newEndDate.value = String(e?.detail?.value ?? '');
}

/** 起止日期展开为逐日日期串（含首尾，UTC 计算避免夏令时/时区漂移） */
function expandDateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  for (let t = from; t <= to; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** 本地添加（真校验在服务端）：今天起 90 天内、最多 30 条、备注 40 字；支持起止区间批量添加 */
function addClosure(): void {
  const start = newDate.value.trim();
  const end = newEndDate.value.trim() || start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start < minDate || start > maxDate) {
    uni.showToast({ title: locale.t('campusStoreSettings.closureBadDate'), icon: 'none' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < minDate || end > maxDate) {
    uni.showToast({ title: locale.t('campusStoreSettings.closureBadDate'), icon: 'none' });
    return;
  }
  if (end < start) {
    uni.showToast({ title: locale.t('campusStoreSettings.closureRangeBad'), icon: 'none' });
    return;
  }
  const note = newNote.value.trim();
  if (note.length > 40) {
    uni.showToast({ title: locale.t('campusStoreSettings.closureNoteMax'), icon: 'none' });
    return;
  }
  const dates = expandDateRange(start, end);
  if (dates.length > 30) {
    uni.showToast({ title: locale.t('campusStoreSettings.closureRangeMax'), icon: 'none' });
    return;
  }
  // 已存在的日期只更新备注，不重复占位
  const fresh = dates.filter(d => !closure.value.some(c => c.date === d)).length;
  if (closure.value.length + fresh > 30) {
    uni.showToast({ title: locale.t('campusStoreSettings.closureMax'), icon: 'none' });
    return;
  }
  dates.forEach(date => {
    const exist = closure.value.find(c => c.date === date);
    if (exist) exist.note = note;
    else closure.value.push({ date, note });
  });
  closure.value.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  uni.showToast({
    title: fresh > 0
      ? locale.t('campusStoreSettings.closureRangeAdded').replace('{n}', String(fresh))
      : locale.t('campusStoreSettings.closureDuplicate'),
    icon: 'none',
  });
  newDate.value = '';
  newEndDate.value = '';
  newNote.value = '';
}

function removeClosure(date: string): void {
  closure.value = closure.value.filter(c => c.date !== date);
}

/** 整表覆盖保存：服务端严格校验后会回读（今日休业状态随之刷新） */
async function saveClosure(): Promise<void> {
  closureBusy.value = true;
  try {
    const p = await campusMerchantSetClosureDates(
      closure.value.map(c => ({ date: c.date, note: c.note || null })),
    );
    applyProfile(p, false);
    applyClosure(p);
    uni.showToast({ title: locale.t('campusStoreSettings.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.opFailed')), icon: 'none' });
  } finally {
    closureBusy.value = false;
  }
}

/** 自动接单（§69）：路由选项与标签；R1 商户自送 / R2 第三方快递 / R3 校园传信者 */
const AUTO_ROUTE_OPTIONS = [
  { code: 'R1', key: 'campusStoreSettings.autoRouteR1' },
  { code: 'R2', key: 'campusStoreSettings.autoRouteR2' },
  { code: 'R3', key: 'campusStoreSettings.autoRouteR3' },
];
const auto = ref<CampusMerchantAutoAccept | null>(null);
const autoOn = computed(() => !!auto.value?.enabled);
const autoBusy = ref(false);
const autoForm = ref({ delaySeconds: '30', dailyLimit: '0', routes: ['R1', 'R2', 'R3'] as string[] });

function applyAuto(a: CampusMerchantAutoAccept): void {
  auto.value = a;
  autoForm.value = {
    delaySeconds: String(a.delaySeconds ?? 30),
    dailyLimit: String(a.dailyLimit ?? 0),
    routes: a.routes?.length ? [...a.routes] : ['R1', 'R2', 'R3'],
  };
}

const bucket = computed(() => (range.value === 'today'
  ? revenue.value?.today
  : revenue.value?.last7) ?? { orders: 0, gross: 0, avgTicket: 0, cancelled: 0, cancelledAmount: 0 });

const statusText = computed(() => {
  if (profile.value?.closedToday) return locale.t('campusStoreSettings.statusClosedToday');
  if (paused.value) return locale.t('campusStoreSettings.statusPaused');
  return profile.value?.openNow
    ? locale.t('campusStoreSettings.statusOpen')
    : locale.t('campusStoreSettings.statusOffHours');
});
const statusClass = computed(() => ({
  open: !profile.value?.closedToday && !paused.value && !!profile.value?.openNow,
  off: !!profile.value?.closedToday || paused.value,
}));
/** 下一次自动开门/打烊倒计时文案（自动开关门） */
const nextText = computed(() => transitionText(profile.value?.nextTransition));
/** 营业日历 pill：今日休业 > 已设 N 天 > 未设置 */
const closurePillText = computed(() => {
  if (profile.value?.closedToday) return locale.t('campusStoreSettings.closureToday');
  if (closure.value.length) return locale.t('campusStoreSettings.closureCount').replace('{n}', String(closure.value.length));
  return locale.t('campusStoreSettings.closureNone');
});

function applyProfile(p: MerchantStoreProfile, syncForm = true): void {
  profile.value = p;
  paused.value = p.paused;
  // 日报推送（§86）：与门店资料同源回填，避免开关状态和后台不一致
  dailyForm.value.enabled = !!p.dailyPushEnabled;
  dailyForm.value.time = p.dailyPushTime || '21:30';
  if (syncForm) {
    form.value.businessHours = p.businessHours ?? '';
    form.value.storeNotice = p.storeNotice ?? '';
    form.value.storePhone = p.storePhone ?? '';
    applyClosure(p);
  }
  maybeClosingReminder(p.nextTransition);
}

async function load(): Promise<void> {
  try {
    const [p, r, a] = await Promise.all([
      campusMerchantStoreProfile(),
      campusMerchantRevenue(),
      campusMerchantAutoAccept(),
    ]);
    applyProfile(p);
    revenue.value = r;
    applyAuto(a);
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

/** 自动接单开关：只切换 enabled（延迟/上限/范围沿用已保存配置），失败回读服务端状态 */
async function onAutoToggle(e: any): Promise<void> {
  const enabled = !!e.detail.value;
  autoBusy.value = true;
  try {
    applyAuto(await campusMerchantUpdateAutoAccept({ enabled }));
    uni.showToast({ title: locale.t('campusStoreSettings.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.opFailed')), icon: 'none' });
    try { applyAuto(await campusMerchantAutoAccept()); } catch { /* 保留旧值 */ }
  } finally {
    autoBusy.value = false;
  }
}

/** 适用范围至少保留一条路线（服务端会回落全部，这里先在本地拦住误操作） */
function toggleAutoRoute(code: string): void {
  const picked = autoForm.value.routes.includes(code)
    ? autoForm.value.routes.filter(r => r !== code)
    : [...autoForm.value.routes, code];
  if (!picked.length) {
    uni.showToast({ title: locale.t('campusStoreSettings.autoScopeMin'), icon: 'none' });
    return;
  }
  autoForm.value.routes = picked;
}

/** 日报推送开关（§86）：只切本地态，点「保存推送设置」才落库 */
function onDailyPushToggle(e: any): void {
  dailyForm.value.enabled = !!(e?.detail?.value ?? e?.detail?.checked);
}

/** 保存日报推送设置：时间格式 HH:MM，非法直接提示（与服务端校验口径一致） */
async function saveDailyPush(): Promise<void> {
  const time = dailyForm.value.time.trim();
  if (dailyForm.value.enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    uni.showToast({ title: locale.t('campusStoreSettings.dailyPushBadTime'), icon: 'none' });
    return;
  }
  dailyBusy.value = true;
  try {
    const p = await campusMerchantUpdateDailyPush({ enabled: dailyForm.value.enabled, time: time || null });
    applyProfile(p, false);
    uni.showToast({ title: locale.t('campusStoreSettings.dailyPushSaved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.saveFail')), icon: 'none' });
  } finally {
    dailyBusy.value = false;
  }
}

/** 保存延迟/上限/范围：越界直接提示，不在本地静默截断（与服务端校验口径一致） */
async function saveAutoAccept(): Promise<void> {
  const delay = Number(autoForm.value.delaySeconds);
  if (!Number.isInteger(delay) || delay < 0 || delay > 600) {
    uni.showToast({ title: locale.t('campusStoreSettings.autoDelayBad'), icon: 'none' });
    return;
  }
  const limit = Number(autoForm.value.dailyLimit);
  if (!Number.isInteger(limit) || limit < 0 || limit > 999) {
    uni.showToast({ title: locale.t('campusStoreSettings.autoLimitBad'), icon: 'none' });
    return;
  }
  if (!autoForm.value.routes.length) {
    uni.showToast({ title: locale.t('campusStoreSettings.autoScopeMin'), icon: 'none' });
    return;
  }
  autoBusy.value = true;
  try {
    applyAuto(await campusMerchantUpdateAutoAccept({
      enabled: autoOn.value,
      delaySeconds: delay,
      dailyLimit: limit,
      routes: [...autoForm.value.routes],
    }));
    uni.showToast({ title: locale.t('campusStoreSettings.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusStoreSettings.opFailed')), icon: 'none' });
  } finally {
    autoBusy.value = false;
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
  .unfinished { display: block; font-size: 23rpx; color: #cf1322; font-weight: 700; margin-top: 10rpx;
    background: #fff1f0; border: 1.5px solid #ff4d4f; border-radius: $wa-radius; padding: 12rpx 18rpx; line-height: 1.5; }
  .presets { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
    .preset { font-size: 22rpx; color: $wa-accent; border: 1.5px solid $wa-accent;
      border-radius: 999rpx; padding: 8rpx 20rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius;
    line-height: 88rpx; margin-bottom: 24rpx;
    &[disabled] { opacity: .6; }
    &.small { font-size: 26rpx; line-height: 76rpx; margin-top: 24rpx; margin-bottom: 0; }
  }
  .closure-list { margin-top: 16rpx; border-top: 1.5px solid $wa-rule;
    .closure-item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0;
      border-bottom: 1.5px solid $wa-rule;
      .closure-main { flex: 1; display: flex; flex-direction: column; gap: 6rpx;
        .closure-date { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
        .closure-note { font-size: 22rpx; color: $wa-muted; }
      }
      .closure-del { font-size: 24rpx; color: #d4380d; padding: 6rpx 16rpx;
        border: 1.5px solid #d4380d; border-radius: 999rpx; }
    }
  }
  .add-btn { margin-top: 16rpx; background: $wa-bg; color: $wa-accent; font-size: 26rpx;
    font-weight: 600; border: 1.5px solid $wa-accent; border-radius: $wa-radius; line-height: 72rpx;
    &::after { border: none; }
  }
  .picker { display: flex; align-items: center; min-height: 76rpx; color: $wa-muted;
    &.picked { color: $wa-ink; }
  }
  .note-ipt { margin-top: 16rpx; }
  .range-row { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx;
    .range-ipt { flex: 1; }
    .range-sep { font-size: 26rpx; color: $wa-muted; }
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
