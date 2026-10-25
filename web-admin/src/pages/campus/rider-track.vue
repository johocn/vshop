<template>
  <view class="page">
    <view class="tabs">
      <text :class="{ on: tab === 'order' }" @tap="switchTab('order')">{{ $t('riderTrack.tabOrder') }}</text>
      <text :class="{ on: tab === 'rider' }" @tap="switchTab('rider')">{{ $t('riderTrack.tabRider') }}</text>
    </view>

    <view class="filters" v-if="tab === 'order'">
      <view class="frow">
        <input
          v-model="orderInput" class="finput"
          :placeholder="$t('riderTrack.orderPh')" confirm-type="search"
          @confirm="loadOrderTrack"
        />
      </view>
      <view class="frow acts">
        <button class="btn" @tap="loadOrderTrack">{{ $t('riderTrack.query') }}</button>
      </view>
    </view>

    <view class="filters" v-else>
      <view class="frow">
        <picker class="fw" mode="selector" :range="riderLabels" :value="riderIndex" @change="onRiderChange">
          <view class="fcell">
            <text class="flbl">{{ $t('riderTrack.rider') }}</text>
            <text class="fval" :class="{ ph: !riderIndex }">{{ riderLabels[riderIndex] }}</text>
          </view>
        </picker>
      </view>
      <view class="frow">
        <picker class="fh" mode="date" :value="fromDate" @change="onFromChange">
          <view class="fcell">
            <text class="flbl">{{ $t('riderTrack.from') }}</text>
            <text class="fval">{{ fromDate }}</text>
          </view>
        </picker>
        <picker class="fh" mode="date" :value="toDate" @change="onToChange">
          <view class="fcell">
            <text class="flbl">{{ $t('riderTrack.to') }}</text>
            <text class="fval">{{ toDate }}</text>
          </view>
        </picker>
      </view>
      <view class="frow acts">
        <button class="btn" @tap="loadRiderTrack">{{ $t('riderTrack.query') }}</button>
      </view>
    </view>

    <view v-if="loading" class="hint">{{ $t('riderTrack.loading') }}</view>
    <view v-else-if="error" class="hint">
      <text>{{ error }}</text>
      <text class="retry" @tap="reload">{{ $t('riderTrack.retry') }}</text>
    </view>
    <view v-else-if="!loaded" class="hint">{{ $t('riderTrack.idle') }}</view>
    <block v-else-if="track && track.points.length">
      <view class="summary">
        <view class="sitem">
          <text class="sval">{{ track.points.length }}</text>
          <text class="slbl">{{ $t('riderTrack.pointCount') }}</text>
        </view>
        <view class="sitem">
          <text class="sval">{{ distanceKm }}</text>
          <text class="slbl">{{ $t('riderTrack.distance') }}</text>
        </view>
        <view class="sitem">
          <text class="sval">{{ durationMin }}</text>
          <text class="slbl">{{ $t('riderTrack.duration') }}</text>
        </view>
      </view>

      <view class="card info">
        <view class="row">
          <text class="lbl">{{ $t('riderTrack.subject') }}</text>
          <text class="val">{{ subjectText }}</text>
        </view>
        <view class="row">
          <text class="lbl">{{ $t('riderTrack.span') }}</text>
          <text class="val">{{ spanText }}</text>
        </view>
        <view class="row" v-if="track.truncated">
          <text class="lbl">{{ $t('riderTrack.truncated') }}</text>
        </view>
      </view>

      <view class="card map">
        <view class="legend">
          <text class="dot start" />{{ $t('riderTrack.start') }}
          <text class="dot end" />{{ $t('riderTrack.end') }}
        </view>
        <view class="canvas">
          <view
            v-for="(s, i) in segments" :key="i" class="seg"
            :style="s"
          />
          <view v-if="startStyle" class="mark start" :style="startStyle" />
          <view v-if="endStyle" class="mark end" :style="endStyle" />
        </view>
        <text class="mapNote">{{ $t('riderTrack.mapNote') }}</text>
      </view>

      <view class="card points">
        <view class="row head">
          <text class="lbl">{{ $t('riderTrack.points') }}</text>
          <text class="lbl">{{ $t('riderTrack.latestFirst') }}</text>
        </view>
        <view class="prow" v-for="p in listedPoints" :key="p.id">
          <text class="pt">{{ fmtTime(p.reportedAt) }}</text>
          <text class="pc">#{{ p.orderCode || p.orderId }} · {{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}</text>
        </view>
        <text class="mapNote" v-if="track.points.length > listedPoints.length">
          {{ $t('riderTrack.listCap') }}
        </text>
      </view>
    </block>
    <view v-else class="hint">{{ emptyText }}</view>

    <view class="note">{{ $t('riderTrack.retention') }}</view>
    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';
import { graphQlErrorMsg } from '../../apis/client';
import { fetchRiderApplications } from '../../apis/rider-audit';
import { fetchOrderRiderTrack, fetchRiderTrack, type RiderTrack, type RiderTrackPoint } from '../../apis/rider-ledger';

usePermGuard('CampusViewDispatch');

const locale = useLocaleStore();

const CANVAS_W = 630;
const CANVAS_H = 380;
const CANVAS_PAD = 28;
const LIST_CAP = 50;

const tab = ref<'order' | 'rider'>('order');
const orderInput = ref('');
const track = ref<RiderTrack | null>(null);
const loading = ref(false);
const error = ref('');
const loaded = ref(false);

// ===== 骑手名单 =====
const riders = ref<{ id: string; name: string }[]>([]);
const riderIndex = ref(0);
const riderLabels = computed(() => [
  locale.t('riderTrack.chooseRider'),
  ...riders.value.map((r) => r.name),
]);

function dayStr(offset = 0): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fromDate = ref(dayStr(-6));
const toDate = ref(dayStr(0));

async function loadRiders(): Promise<void> {
  try {
    const res = await fetchRiderApplications('approved', 0, 200);
    riders.value = res.items.map((r) => ({
      id: r.id,
      name: r.customFields?.riderRealName
        || [r.firstName, r.lastName].filter(Boolean).join(' ')
        || r.emailAddress,
    }));
  } catch {
    // 名单失败不阻塞查询
  }
}

function onRiderChange(e: any): void {
  riderIndex.value = Number(e?.detail?.value ?? 0) || 0;
}
function onFromChange(e: any): void {
  const v = String(e?.detail?.value || '');
  if (v) fromDate.value = v;
}
function onToChange(e: any): void {
  const v = String(e?.detail?.value || '');
  if (v) toDate.value = v;
}

function toast(msg: string): void {
  uni.showToast({ title: msg, icon: 'none' });
}

function switchTab(key: 'order' | 'rider'): void {
  if (tab.value === key) return;
  tab.value = key;
  track.value = null;
  error.value = '';
  loaded.value = false;
}

/** 订单轨迹：支持订单号（#A1024）或订单 ID；纯数字两种口径都试一次，命中有点位者为准 */
async function loadOrderTrack(): Promise<void> {
  const raw = orderInput.value.trim().replace(/^#/, '');
  if (!raw) { toast(locale.t('riderTrack.needOrder')); return; }
  loading.value = true;
  error.value = '';
  try {
    let res = await fetchOrderRiderTrack({ orderCode: raw });
    if (!res.points.length && /^\d+$/.test(raw)) {
      try {
        const byId = await fetchOrderRiderTrack({ orderId: raw });
        if (byId.points.length) res = byId;
      } catch {
        // 按 ID 也查不到时保留订单号口径的结果（空轨迹）
      }
    }
    track.value = res;
    loaded.value = true;
  } catch (e: any) {
    track.value = null;
    loaded.value = true;
    error.value = graphQlErrorMsg(e, locale.t('riderTrack.loadFailed'));
  } finally {
    loading.value = false;
  }
}

/** 骑手时段轨迹：东八区自然日区间（含结束日），服务端限制 ≤31 天 */
async function loadRiderTrack(): Promise<void> {
  const rider = riders.value[riderIndex.value - 1];
  if (!rider) { toast(locale.t('riderTrack.needRider')); return; }
  if (!fromDate.value || !toDate.value) { toast(locale.t('riderTrack.needRange')); return; }
  if (fromDate.value > toDate.value) { toast(locale.t('riderTrack.rangeInvalid')); return; }
  loading.value = true;
  error.value = '';
  try {
    track.value = await fetchRiderTrack(rider.id, fromDate.value, toDate.value);
    loaded.value = true;
  } catch (e: any) {
    track.value = null;
    loaded.value = true;
    error.value = graphQlErrorMsg(e, locale.t('riderTrack.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  if (tab.value === 'order') void loadOrderTrack();
  else void loadRiderTrack();
}

// ===== 折线渲染（630×380rpx 画布，按经纬度归一化；不接地图 SDK） =====
interface XY { x: number; y: number }

const bounds = computed(() => {
  const pts = track.value?.points ?? [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
});

function project(p: { lat: number; lng: number }): XY {
  const b = bounds.value;
  const innerW = CANVAS_W - CANVAS_PAD * 2;
  const innerH = CANVAS_H - CANVAS_PAD * 2;
  const spanLng = b.maxLng - b.minLng;
  const spanLat = b.maxLat - b.minLat;
  return {
    x: CANVAS_PAD + (spanLng ? (p.lng - b.minLng) / spanLng : 0.5) * innerW,
    y: CANVAS_PAD + (spanLat ? (b.maxLat - p.lat) / spanLat : 0.5) * innerH,
  };
}

/** 多点抽稀到 ≤300 段，避免上千 div 拖慢渲染 */
function sampled(): RiderTrackPoint[] {
  const pts = track.value?.points ?? [];
  if (pts.length <= 2) return pts;
  const step = Math.max(1, Math.ceil(pts.length / 300));
  const out: RiderTrackPoint[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  if (out[out.length - 1]?.id !== last.id) out.push(last);
  return out;
}

const segments = computed<string[]>(() => {
  const pts = sampled();
  const styles: string[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = project(pts[i - 1]);
    const b = project(pts[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    styles.push(
      `left:${a.x.toFixed(1)}rpx; top:${(a.y - 2).toFixed(1)}rpx; `
      + `width:${len.toFixed(1)}rpx; transform:rotate(${angle.toFixed(1)}deg);`,
    );
  }
  return styles;
});

const startStyle = computed(() => {
  const first = track.value?.points[0];
  if (!first) return '';
  const { x, y } = project(first);
  return `left:${x.toFixed(1)}rpx; top:${y.toFixed(1)}rpx;`;
});

const endStyle = computed(() => {
  const pts = track.value?.points ?? [];
  const last = pts[pts.length - 1];
  if (!last) return '';
  const { x, y } = project(last);
  return `left:${x.toFixed(1)}rpx; top:${y.toFixed(1)}rpx;`;
});

// ===== 展示辅助 =====
const listedPoints = computed(() => [...(track.value?.points ?? [])].reverse().slice(0, LIST_CAP));

const distanceKm = computed(() => `${((track.value?.distanceMeters ?? 0) / 1000).toFixed(2)}km`);

const durationMin = computed(() => {
  const pts = track.value?.points ?? [];
  if (pts.length < 2) return '0';
  const a = new Date(pts[0].reportedAt).getTime();
  const b = new Date(pts[pts.length - 1].reportedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return '0';
  return `${Math.round((b - a) / 60000)}min`;
});

function riderNameOf(id?: string | null): string {
  if (!id) return '—';
  return riders.value.find((r) => r.id === String(id))?.name ?? `#${id}`;
}

const subjectText = computed(() => {
  if (!track.value) return '—';
  if (tab.value === 'order') {
    const code = track.value.orderCode || track.value.orderId;
    return `${code ? '#' + code : '—'} · ${riderNameOf(track.value.riderCustomerId)}`;
  }
  return track.value.riderName || riderNameOf(track.value.riderCustomerId);
});

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const spanText = computed(() => {
  const pts = track.value?.points ?? [];
  if (!pts.length) return '—';
  return `${fmtTime(pts[0].reportedAt)} → ${fmtTime(pts[pts.length - 1].reportedAt)}`;
});

const emptyText = computed(() => (
  tab.value === 'order' ? locale.t('riderTrack.emptyOrder') : locale.t('riderTrack.emptyRider')
));

onLoad((options: any) => {
  void loadRiders();
  const t = String(options?.tab || 'order');
  tab.value = t === 'rider' ? 'rider' : 'order';
  const code = String(options?.code || '').trim();
  const orderId = String(options?.orderId || '').trim();
  if (tab.value === 'order' && (code || orderId)) {
    orderInput.value = code || orderId;
    void loadOrderTrack();
  }
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;

  .tabs {
    display: flex; margin-bottom: 20rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; } }
  }

  .filters {
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 20rpx;
    .frow { display: flex; gap: 16rpx; margin-bottom: 16rpx; &:last-child { margin-bottom: 0; } }
    .fh, .fw { flex: 1; }
    .fcell { background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; display: flex; flex-direction: column; gap: 6rpx;
      .flbl { font-size: 22rpx; color: $wa-muted; }
      .fval { font-size: 26rpx; color: $wa-ink; &.ph { color: $wa-muted; } } }
    .finput { flex: 1; background: $wa-bg; border-radius: $wa-radius; height: 72rpx; line-height: 72rpx;
      padding: 0 20rpx; font-size: 26rpx; color: $wa-ink; }
    .acts { .btn { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; font-size: 26rpx; border-radius: $wa-radius;
      background: $wa-accent; color: #fff; } }
  }

  .summary {
    display: flex; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 0; margin-bottom: 16rpx;
    .sitem { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
      & + .sitem { border-left: 1rpx solid $wa-bg; }
      .sval { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
      .slbl { font-size: 22rpx; color: $wa-muted; } }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx; }

  .info {
    display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .lbl { font-size: 24rpx; color: $wa-muted; }
      .val { font-size: 26rpx; color: $wa-ink; font-weight: 600; } }
  }

  .map {
    padding-bottom: 20rpx;
    .legend { display: flex; align-items: center; gap: 10rpx; font-size: 22rpx; color: $wa-muted; margin-bottom: 12rpx;
      .dot { width: 16rpx; height: 16rpx; border-radius: 50%; display: inline-block;
        &.start { background: #16a34a; }
        &.end { background: $wa-accent; margin-left: 16rpx; } } }
    .canvas { position: relative; width: 630rpx; height: 380rpx; margin: 0 auto; background: $wa-bg; border-radius: $wa-radius; overflow: hidden; }
    .seg { position: absolute; height: 4rpx; background: $wa-accent; border-radius: 2rpx; transform-origin: 0 50%; opacity: 0.85; }
    .mark { position: absolute; width: 16rpx; height: 16rpx; border-radius: 50%; transform: translate(-50%, -50%);
      border: 3rpx solid #fff; box-shadow: 0 0 0 2rpx rgba(0, 0, 0, 0.08);
      &.start { background: #16a34a; }
      &.end { background: $wa-accent; } }
    .mapNote { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; text-align: center; }
  }

  .points {
    .head { display: flex; justify-content: space-between; margin-bottom: 12rpx;
      .lbl { font-size: 24rpx; color: $wa-muted; } }
    .prow { display: flex; flex-direction: column; gap: 4rpx; padding: 12rpx 0;
      & + .prow { border-top: 1rpx solid $wa-bg; }
      .pt { font-size: 24rpx; color: $wa-ink; font-weight: 600; }
      .pc { font-size: 22rpx; color: $wa-muted; } }
    .mapNote { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; }
  }

  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
  .note { margin-top: 16rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.6; }
}
</style>
