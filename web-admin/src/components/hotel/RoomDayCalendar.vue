<template>
  <view class="rdc">
    <!-- 月份切换 -->
    <view class="rdc-head">
      <text class="rdc-nav" @tap="shiftMonth(-1)">‹</text>
      <text class="rdc-month">{{ year }}-{{ String(month).padStart(2, '0') }}</text>
      <text class="rdc-nav" @tap="shiftMonth(1)">›</text>
    </view>

    <view v-if="loading" class="rdc-tip">{{ $t('hotelRoomCalendar.loading') }}</view>
    <template v-else>
      <!-- 星期表头（周一起始） -->
      <view class="rdc-grid rdc-week">
        <text class="rdc-wh" v-for="w in WEEK_HEADS" :key="w">{{ w }}</text>
      </view>
      <!-- 日历网格 -->
      <view class="rdc-grid">
        <view class="rdc-cell" v-for="cell in cells" :key="cell.key" :class="{ blank: !cell.date }">
          <view
            v-if="cell.date"
            class="rdc-day"
            :class="{ closed: cell.closed, soldout: !cell.closed && isSoldOut(cell) }"
            @tap="openDayEditor(cell)"
          >
            <text class="rdc-d">{{ cell.day }}</text>
            <text class="rdc-price" v-if="cell.priceCent != null">¥{{ (cell.priceCent / 100).toFixed(0) }}</text>
            <text class="rdc-state closed-t" v-if="cell.closed">{{ $t('hotelRoomCalendar.closedTag') }}</text>
            <text class="rdc-state soldout-t" v-else-if="isSoldOut(cell)">{{ $t('hotelRoomCalendar.fullTag') }}</text>
            <text class="rdc-state" v-else-if="cell.remaining != null">剩{{ cell.remaining }}</text>
            <text class="rdc-state" v-else>{{ $t('hotelRoomCalendar.unlimitedTag') }}</text>
          </view>
        </view>
      </view>

      <!-- 批量设置 -->
      <view class="rdc-batch">
        <view class="rdc-batch-title">{{ $t('hotelRoomCalendar.batchTitle') }}</view>
        <view class="rdc-row">
          <picker mode="date" :value="batch.from" :end="batch.to || ''" @change="batch.from = $event.detail.value">
            <view class="rdc-date">{{ batch.from || $t('hotelRoomCalendar.fromDate') }}</view>
          </picker>
          <text class="rdc-sep">~</text>
          <picker mode="date" :value="batch.to" :start="batch.from || ''" @change="batch.to = $event.detail.value">
            <view class="rdc-date">{{ batch.to || $t('hotelRoomCalendar.toDate') }}</view>
          </picker>
        </view>
        <view class="rdc-row">
          <input class="rdc-inp" type="number" v-model="batch.totalRooms" :placeholder="$t('hotelRoomCalendar.totalRoomsPh')" />
          <view class="rdc-switch">
            <text class="rdc-lbl">{{ $t('hotelRoomCalendar.closedSwitch') }}</text>
            <switch :checked="batch.closed" color="#4f8cff" style="transform: scale(0.8)" @change="batch.closed = $event.detail.value" />
          </view>
        </view>
        <view class="rdc-row">
          <text
            v-for="w in WEEKDAYS"
            :key="w.value"
            class="rdc-chip"
            :class="{ on: batch.weekdays.includes(w.value) }"
            @tap="toggleWeekday(w.value)"
          >{{ w.label }}</text>
        </view>
        <view class="rdc-row">
          <text class="rdc-chip clear" @tap="batch.weekdays = []">{{ $t('hotelRoomCalendar.allDays') }}</text>
        </view>
        <button class="rdc-btn" :disabled="batchSaving || !batch.from || !batch.to" @tap="applyBatch">
          {{ batchSaving ? $t('hotelRoomCalendar.saving') : $t('hotelRoomCalendar.applyBatch') }}
        </button>
      </view>
    </template>

    <!-- 单日编辑弹层 -->
    <view class="rdc-mask" v-if="editingDay" @tap="editingDay = null">
      <view class="rdc-pop" @tap.stop>
        <view class="rdc-pop-head">
          <text class="rdc-pop-title">{{ editingDay.date }}</text>
          <text class="rdc-pop-close" @tap="editingDay = null">×</text>
        </view>
        <view class="rdc-field">
          <text class="rdc-lbl">{{ $t('hotelRoomCalendar.totalRoomsLabel') }}</text>
          <input class="rdc-inp full" type="number" v-model="dayForm.totalRooms" :placeholder="$t('hotelRoomCalendar.totalRoomsPh')" />
        </view>
        <view class="rdc-field">
          <text class="rdc-lbl">{{ $t('hotelRoomCalendar.closedSwitch') }}</text>
          <switch :checked="dayForm.closed" color="#4f8cff" @change="dayForm.closed = $event.detail.value" />
        </view>
        <button class="rdc-btn" :disabled="daySaving" @tap="saveDay">
          {{ daySaving ? $t('hotelRoomCalendar.saving') : $t('hotelRoomCalendar.saveDay') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 房量日历（P1 Task 4）：月视图（日/价/剩N/满房/关房）+ 单日编辑 + 批量设置
// 数据：hotelAvailability（占用已扣，未建行走 hotelRoomConfig.totalRooms 兜底）+ hotelRoomDays（显式行）
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useLocaleStore } from '../../stores/localeStore';
import {
  fetchHotelRoomDays,
  fetchHotelAvailability,
  setHotelRoomDay,
  batchSetHotelRoomDays,
  type HotelAvailabilityDay,
  type HotelRoomDay,
} from '../../apis/hotel-inventory';
import { fetchVariantHotelConfig } from '../../apis/room-template';
import { graphQlErrorMsg } from '../../apis/client';

const props = defineProps<{ variantId: string }>();
const locale = useLocaleStore();

const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
];

const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1); // 1-based
const loading = ref(false);

const availByDate = ref<Map<string, HotelAvailabilityDay>>(new Map());
const roomDayByDate = ref<Map<string, HotelRoomDay>>(new Map());
const configTotal = ref<number | null>(null);

interface Cell {
  key: string;
  date: string | null;
  day: number;
  priceCent: number | null;
  remaining: number | null;
  closed: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

const monthFirst = computed(() => fmt(year.value, month.value, 1));
const monthLast = computed(() => fmt(year.value, month.value, new Date(year.value, month.value, 0).getDate()));

const cells = computed<Cell[]>(() => {
  const firstDow = new Date(year.value, month.value - 1, 1).getDay(); // 0=周日
  const lead = (firstDow + 6) % 7; // 周一起始的补位数
  const days = new Date(year.value, month.value, 0).getDate();
  const out: Cell[] = [];
  for (let i = 0; i < lead; i++) out.push({ key: `b${i}`, date: null, day: 0, priceCent: null, remaining: null, closed: false });
  for (let d = 1; d <= days; d++) {
    const date = fmt(year.value, month.value, d);
    const av = availByDate.value.get(date);
    const rd = roomDayByDate.value.get(date);
    out.push({
      key: date,
      date,
      day: d,
      priceCent: av?.priceCent ?? null,
      remaining: av ? av.remaining : null,
      closed: av?.closed ?? rd?.closed ?? false,
    });
  }
  return out;
});

function isSoldOut(c: Cell): boolean {
  return !c.closed && c.remaining != null && c.remaining <= 0;
}

async function load() {
  if (!props.variantId) return;
  loading.value = true;
  try {
    const [avail, roomDays, cfg] = await Promise.all([
      fetchHotelAvailability(props.variantId, monthFirst.value, monthLast.value).catch(() => []),
      fetchHotelRoomDays(props.variantId, `${year.value}-${pad(month.value)}`).catch(() => []),
      fetchVariantHotelConfig(props.variantId).catch(() => null),
    ]);
    availByDate.value = new Map(avail.map(a => [a.date, a]));
    roomDayByDate.value = new Map(roomDays.map(r => [r.date, r]));
    const n = cfg?.totalRooms;
    configTotal.value = typeof n === 'number' && n >= 0 ? n : null;
  } finally {
    loading.value = false;
  }
}

function shiftMonth(delta: number) {
  let m = month.value + delta;
  let y = year.value;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  year.value = y;
  month.value = m;
}

watch([year, month], load);
watch(() => props.variantId, load);
onMounted(load);

// ---- 单日编辑 ----
const editingDay = ref<Cell | null>(null);
const dayForm = reactive({ totalRooms: '', closed: false });
const daySaving = ref(false);

function openDayEditor(c: Cell) {
  if (!c.date) return;
  const rd = roomDayByDate.value.get(c.date);
  editingDay.value = c;
  dayForm.totalRooms = String(rd?.totalRooms ?? configTotal.value ?? '');
  dayForm.closed = c.closed;
}

async function saveDay() {
  if (!editingDay.value?.date || daySaving.value) return;
  daySaving.value = true;
  try {
    const total = dayForm.totalRooms === '' ? null : Math.max(0, Math.round(Number(dayForm.totalRooms)));
    await setHotelRoomDay(props.variantId, editingDay.value.date, { totalRooms: total ?? undefined, closed: dayForm.closed });
    uni.showToast({ title: locale.t('hotelRoomCalendar.saved'), icon: 'success' });
    editingDay.value = null;
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRoomCalendar.saveFailed')), icon: 'none' });
  } finally {
    daySaving.value = false;
  }
}

// ---- 批量设置 ----
const batch = reactive({ from: '', to: '', totalRooms: '', closed: false, weekdays: [] as number[] });
const batchSaving = ref(false);

function toggleWeekday(v: number) {
  const i = batch.weekdays.indexOf(v);
  if (i >= 0) batch.weekdays.splice(i, 1);
  else batch.weekdays.push(v);
}

async function applyBatch() {
  if (!batch.from || !batch.to || batchSaving.value) return;
  batchSaving.value = true;
  try {
    const total = batch.totalRooms === '' ? null : Math.max(0, Math.round(Number(batch.totalRooms)));
    const n = await batchSetHotelRoomDays(props.variantId, batch.from, batch.to, {
      totalRooms: total ?? undefined,
      closed: batch.closed,
      weekdays: batch.weekdays.length ? batch.weekdays : undefined,
    });
    uni.showToast({ title: locale.t('hotelRoomCalendar.batchDone').replace('{n}', String(n)), icon: 'success' });
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRoomCalendar.batchFailed')), icon: 'none' });
  } finally {
    batchSaving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.rdc { width: 100%; }
.rdc-head { display: flex; align-items: center; justify-content: center; gap: 24rpx; padding: 8rpx 0 16rpx; }
.rdc-month { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.rdc-nav { font-size: 40rpx; color: #4f8cff; padding: 0 20rpx; }
.rdc-tip { text-align: center; color: #999; font-size: 24rpx; padding: 24rpx 0; }
.rdc-grid { display: flex; flex-wrap: wrap; }
.rdc-wh { width: 14.28%; text-align: center; font-size: 22rpx; color: #999; padding: 8rpx 0; }
.rdc-cell { width: 14.28%; padding: 4rpx; box-sizing: border-box; }
.rdc-cell.blank { min-height: 100rpx; }
.rdc-day {
  display: flex; flex-direction: column; align-items: center;
  border: 1rpx solid #eee; border-radius: 8rpx; padding: 6rpx 0; min-height: 100rpx; box-sizing: border-box;
  background: #fff;
}
.rdc-day.closed { background: #fdecea; border-color: #f5c6c2; }
.rdc-day.soldout { background: #f5f5f5; }
.rdc-d { font-size: 26rpx; font-weight: 600; color: #333; }
.rdc-price { font-size: 20rpx; color: #e6533c; margin-top: 2rpx; }
.rdc-state { font-size: 20rpx; color: #4f8cff; margin-top: 2rpx; }
.rdc-state.closed-t { color: #d93025; font-weight: 600; }
.rdc-state.soldout-t { color: #999; }
.rdc-batch { margin-top: 20rpx; border-top: 1rpx dashed #eee; padding-top: 16rpx; }
.rdc-batch-title { font-size: 26rpx; font-weight: 600; color: #333; margin-bottom: 12rpx; }
.rdc-row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 12rpx; flex-wrap: wrap; }
.rdc-date { min-width: 200rpx; padding: 10rpx 16rpx; border: 1rpx solid #ddd; border-radius: 8rpx; font-size: 24rpx; color: #333; }
.rdc-sep { color: #999; }
.rdc-inp { width: 200rpx; padding: 10rpx 16rpx; border: 1rpx solid #ddd; border-radius: 8rpx; font-size: 24rpx; }
.rdc-inp.full { flex: 1; }
.rdc-switch { display: flex; align-items: center; gap: 8rpx; }
.rdc-lbl { font-size: 24rpx; color: #666; }
.rdc-chip { padding: 8rpx 22rpx; border-radius: 999rpx; background: #f2f4f8; color: #666; font-size: 24rpx; }
.rdc-chip.on { background: #4f8cff; color: #fff; }
.rdc-chip.clear { background: #fff; border: 1rpx solid #ddd; }
.rdc-btn { margin-top: 8rpx; background: #4f8cff; color: #fff; font-size: 28rpx; border-radius: 12rpx; }
.rdc-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 999; display: flex; align-items: center; justify-content: center; }
.rdc-pop { width: 600rpx; background: #fff; border-radius: 16rpx; padding: 28rpx; }
.rdc-pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.rdc-pop-title { font-size: 30rpx; font-weight: 600; color: #1a1a1a; }
.rdc-pop-close { font-size: 44rpx; color: #999; line-height: 1; }
.rdc-field { display: flex; align-items: center; gap: 16rpx; margin-bottom: 20rpx; }
</style>
