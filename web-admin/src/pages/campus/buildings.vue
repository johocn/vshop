<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('buildingCoord.loading') }}</view>
    <block v-else>
      <view class="summary" :class="{ warn: unmarkedCount > 0 }">
        <text>{{ unmarkedCount > 0 ? $t('buildingCoord.unmarkedCount').replace('{n}', String(unmarkedCount)) : $t('buildingCoord.allMarked') }}</text>
      </view>

      <scroll-view class="zones" scroll-x>
        <view class="zone" :class="{ on: activeZone === '' }" @tap="activeZone = ''">{{ $t('buildingCoord.all') }}</view>
        <view
          v-for="z in zones" :key="z.id"
          class="zone" :class="{ on: activeZone === z.id }"
          @tap="activeZone = z.id"
        >{{ z.name }}</view>
      </scroll-view>

      <view class="zone-manage">
        <text class="zm-toggle" @tap="toggleZoneManage">{{ zoneEditOpen ? $t('buildingCoord.zoneClose') : $t('buildingCoord.zoneManage') }}</text>
        <text class="zm-hint">{{ $t('buildingCoord.zoneHint') }}</text>
      </view>
      <view v-if="zoneEditOpen" class="zone-panel">
        <view v-for="z in zones" :key="z.id" class="zp-row">
          <input v-model="zoneForms[z.id].name" class="zp-name" :placeholder="$t('buildingCoord.zoneNamePh')" />
          <view class="zp-fee">
            <text class="zp-fee-lbl">¥</text>
            <input v-model="zoneForms[z.id].fee" class="zp-fee-input" type="digit" :placeholder="$t('buildingCoord.zoneFeePh')" />
          </view>
          <text class="zp-save" :class="{ busy: zoneBusy === z.id }" @tap="saveZone(z)">{{ $t('buildingCoord.zoneSave') }}</text>
        </view>
        <!-- 新增分区（新校区/新配送圈）：此前只能手工调 GraphQL -->
        <view class="zp-row zp-new">
          <input v-model="newZoneName" class="zp-name" :placeholder="$t('buildingCoord.zoneNewNamePh')" />
          <view class="zp-fee">
            <text class="zp-fee-lbl">¥</text>
            <input v-model="newZoneFee" class="zp-fee-input" type="digit" :placeholder="$t('buildingCoord.zoneFeePh')" />
          </view>
          <text class="zp-save" :class="{ busy: zoneCreating }" @tap="createZone">{{ $t('buildingCoord.zoneAdd') }}</text>
        </view>
      </view>

      <view v-if="!visible.length" class="hint">{{ $t('buildingCoord.empty') }}</view>
      <view v-else class="list">
        <view v-for="b in visible" :key="b.id" class="row" @tap="startEdit(b)">
          <view class="row-main">
            <view class="row-l">
              <text class="name">{{ b.name }}</text>
              <text class="zone-tag">{{ zoneName(b.zoneId) }}</text>
            </view>
            <text class="detail">{{ b.detail || $t('buildingCoord.noDetail') }}</text>
            <text class="coord" :class="{ none: !hasCoord(b) }">{{ coordText(b) }}</text>
          </view>
          <view class="row-r">
            <text class="pill" :class="hasCoord(b) ? 'ok' : 'todo'">
              {{ hasCoord(b) ? $t('buildingCoord.marked') : $t('buildingCoord.unmarked') }}
            </text>
            <text class="chev">›</text>
          </view>
        </view>
      </view>

      <button class="add" @tap="startCreate">{{ $t('buildingCoord.add') }}</button>

      <view v-if="editing" class="editor">
        <view class="ed-head">
          <text class="ed-title">{{ editing.id ? $t('buildingCoord.editTitle') : $t('buildingCoord.createTitle') }}</text>
          <text class="ed-close" @tap="cancel">×</text>
        </view>

        <view class="cell">
          <text class="lbl">{{ $t('buildingCoord.name') }}</text>
          <input v-model="editing.name" :placeholder="$t('buildingCoord.namePh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('buildingCoord.detail') }}</text>
          <input v-model="editing.detail" :placeholder="$t('buildingCoord.detailPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('buildingCoord.zone') }}</text>
          <picker
            class="picker" :range="zoneLabels" :value="zoneIndex"
            @change="onZoneChange"
          ><text>{{ zoneName(editing.zoneId) }}</text></picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('buildingCoord.lat') }}</text>
          <input v-model="editing.lat" type="digit" :placeholder="$t('buildingCoord.latPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('buildingCoord.lng') }}</text>
          <input v-model="editing.lng" type="digit" :placeholder="$t('buildingCoord.lngPh')" />
        </view>

        <view v-if="mapReady" class="pick">
          <map
            id="pickMap"
            class="pick-map"
            :latitude="pickCenter.lat"
            :longitude="pickCenter.lng"
            :scale="17"
            :markers="pickMarkers"
          />
          <view class="pick-tip">{{ $t('buildingCoord.pickHint') }}</view>
        </view>
        <view v-else class="pick pick-missing">{{ $t('buildingCoord.mapMissing') }}</view>

        <view class="ed-actions">
          <button v-if="mapReady" class="ghost" @tap="takeCenter">{{ $t('buildingCoord.pickCenter') }}</button>
          <button class="save" :disabled="saving" @tap="save">{{ saving ? $t('buildingCoord.saving') : $t('buildingCoord.save') }}</button>
        </view>
        <button v-if="editing.id" class="del" :disabled="deleting" @tap="removeBuilding">
          {{ deleting ? $t('buildingCoord.deleting') : $t('buildingCoord.del') }}
        </button>
        <view class="note">{{ $t('buildingCoord.coordNote') }}</view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  campusBuildings, campusCreateBuilding, campusUpdateBuilding, campusZones,
  campusUpdateZone, campusCreateZone, campusDeleteBuilding,
  type CampusBuilding, type CampusZone,
} from '../../apis/campus';
import { graphQlErrorMsg } from '../../apis/client';
import { fenToYuan, yuanToFen } from '../../utils/money';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusConfig');

/** 地图初始中心（无任何已标注楼栋时的兜底，与骑手上报坐标系 GCJ-02 一致） */
const DEFAULT_CENTER = { lat: 30.52, lng: 114.36 };

interface EditingForm {
  id: string | null;
  name: string;
  detail: string;
  zoneId: string;
  lat: string;
  lng: string;
}

const locale = useLocaleStore();
const loading = ref(true);
const saving = ref(false);
const zones = ref<CampusZone[]>([]);
const buildings = ref<CampusBuilding[]>([]);
const activeZone = ref('');
const editing = ref<EditingForm | null>(null);
const pickCenter = ref({ ...DEFAULT_CENTER });
const picked = ref<{ lat: number; lng: number } | null>(null);
/** 分区改名/改运费：面板开关、逐行保存中标记、编辑中的名称/运费（元） */
const zoneEditOpen = ref(false);
const zoneBusy = ref('');
const zoneForms = ref<Record<string, { name: string; fee: string }>>({});
/** 新增分区表单（分区管理面板底部） */
const newZoneName = ref('');
const newZoneFee = ref('');
const zoneCreating = ref(false);
const deleting = ref(false);

/** H5 底图依赖腾讯 Key；未配置时不渲染 <map>（SDK 无 key 会报错） */
const mapReady = computed(() => {
  if (typeof window === 'undefined') return false;
  return !!(window as any).__uniConfig?.qqMapKey;
});

const zoneLabels = computed(() => zones.value.map((z) => z.name));
const zoneIndex = computed(() => {
  const i = zones.value.findIndex((z) => z.id === editing.value?.zoneId);
  return i >= 0 ? i : 0;
});

const visible = computed(() =>
  activeZone.value ? buildings.value.filter((b) => b.zoneId === activeZone.value) : buildings.value,
);
const unmarkedCount = computed(() => buildings.value.filter((b) => !hasCoord(b)).length);
const pickMarkers = computed(() => (picked.value
  ? [{ id: 1, latitude: picked.value.lat, longitude: picked.value.lng, iconPath: '/static/map/pin.png', width: 24, height: 24 }]
  : []));

function hasCoord(b: CampusBuilding): boolean {
  return b.lat != null && b.lng != null;
}

function coordText(b: CampusBuilding): string {
  return hasCoord(b) ? `${Number(b.lat).toFixed(6)}, ${Number(b.lng).toFixed(6)}` : '—';
}

function zoneName(zoneId: string): string {
  return zones.value.find((z) => z.id === zoneId)?.name ?? '-';
}

function startEdit(b: CampusBuilding) {
  editing.value = {
    id: b.id,
    name: b.name,
    detail: b.detail ?? '',
    zoneId: b.zoneId,
    lat: b.lat != null ? Number(b.lat).toFixed(6) : '',
    lng: b.lng != null ? Number(b.lng).toFixed(6) : '',
  };
  syncPickCenter();
}

function startCreate() {
  if (!zones.value.length) {
    uni.showToast({ title: locale.t('buildingCoord.noZones'), icon: 'none' });
    return;
  }
  editing.value = {
    id: null,
    name: '',
    detail: '',
    zoneId: activeZone.value || zones.value[0].id,
    lat: '',
    lng: '',
  };
  syncPickCenter();
}

/** 地图中心：优先当前编辑坐标 → 任一已标注楼栋 → 兜底中心 */
function syncPickCenter() {
  const f = editing.value;
  const lat = f ? Number(f.lat) : NaN;
  const lng = f ? Number(f.lng) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    pickCenter.value = { lat, lng };
    picked.value = { lat, lng };
    return;
  }
  const hit = buildings.value.find((b) => hasCoord(b));
  pickCenter.value = hit ? { lat: Number(hit.lat), lng: Number(hit.lng) } : { ...DEFAULT_CENTER };
  picked.value = null;
}

function onZoneChange(e: any) {
  const i = Number(e?.detail?.value ?? 0);
  if (editing.value && zones.value[i]) editing.value.zoneId = zones.value[i].id;
}

/** 取地图当前中心作为楼栋坐标（拖地图对准楼栋后点击） */
function takeCenter() {
  const ctx = uni.createMapContext('pickMap') as any;
  ctx.getCenterLocation({
    success: (res: any) => {
      if (!editing.value) return;
      const lat = Number(res.latitude);
      const lng = Number(res.longitude);
      editing.value.lat = lat.toFixed(6);
      editing.value.lng = lng.toFixed(6);
      picked.value = { lat, lng };
      uni.showToast({ title: locale.t('buildingCoord.picked'), icon: 'none' });
    },
    fail: () => uni.showToast({ title: locale.t('buildingCoord.pickFail'), icon: 'none' }),
  });
}

function parseCoord(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function save() {
  const f = editing.value;
  if (!f || saving.value) return;
  if (!f.name.trim()) {
    uni.showToast({ title: locale.t('buildingCoord.needName'), icon: 'none' });
    return;
  }
  const lat = parseCoord(f.lat);
  const lng = parseCoord(f.lng);
  if ((lat == null) !== (lng == null)) {
    uni.showToast({ title: locale.t('buildingCoord.needBoth'), icon: 'none' });
    return;
  }
  if (lat != null && (lat < -90 || lat > 90)) {
    uni.showToast({ title: locale.t('buildingCoord.badLat'), icon: 'none' });
    return;
  }
  if (lng != null && (lng < -180 || lng > 180)) {
    uni.showToast({ title: locale.t('buildingCoord.badLng'), icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    if (f.id) {
      await campusUpdateBuilding(f.id, {
        name: f.name.trim(),
        detail: f.detail.trim() || null,
        lat,
        lng,
      });
    } else {
      await campusCreateBuilding(f.name.trim(), f.zoneId, f.detail.trim() || null, lat, lng);
    }
    uni.showToast({ title: locale.t('buildingCoord.saved'), icon: 'success' });
    editing.value = null;
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('buildingCoord.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function cancel() {
  editing.value = null;
}

/** 分区编辑面板：展开时用当前分区数据回填名称与运费（元） */
function toggleZoneManage() {
  zoneEditOpen.value = !zoneEditOpen.value;
  if (zoneEditOpen.value) syncZoneForms();
}

function syncZoneForms() {
  const next: Record<string, { name: string; fee: string }> = {};
  zones.value.forEach((z) => {
    next[z.id] = { name: z.name, fee: fenToYuan(z.fee) };
  });
  zoneForms.value = next;
}

async function saveZone(z: CampusZone) {
  if (zoneBusy.value) return;
  const form = zoneForms.value[z.id];
  if (!form) return;
  const name = form.name.trim();
  if (!name) {
    uni.showToast({ title: locale.t('buildingCoord.zoneNeedName'), icon: 'none' });
    return;
  }
  const fee = yuanToFen(form.fee);
  if (fee == null) {
    uni.showToast({ title: locale.t('buildingCoord.zoneBadFee'), icon: 'none' });
    return;
  }
  zoneBusy.value = z.id;
  try {
    const updated = await campusUpdateZone(z.id, { name, fee });
    const i = zones.value.findIndex((x) => x.id === z.id);
    if (i >= 0) zones.value[i] = updated;
    form.name = updated.name;
    form.fee = fenToYuan(updated.fee);
    uni.showToast({ title: locale.t('buildingCoord.zoneSaved'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('buildingCoord.saveFailed')), icon: 'none' });
  } finally {
    zoneBusy.value = '';
  }
}

/** 新增分区：名称 + 运费（元）→ campusCreateZone；成功后并入分区列表与编辑表单 */
async function createZone() {
  if (zoneCreating.value) return;
  const name = newZoneName.value.trim();
  if (!name) {
    uni.showToast({ title: locale.t('buildingCoord.zoneNeedName'), icon: 'none' });
    return;
  }
  const fee = yuanToFen(newZoneFee.value);
  if (fee == null) {
    uni.showToast({ title: locale.t('buildingCoord.zoneBadFee'), icon: 'none' });
    return;
  }
  zoneCreating.value = true;
  try {
    const created = await campusCreateZone(name, fee);
    zones.value.push(created);
    newZoneName.value = '';
    newZoneFee.value = '';
    syncZoneForms();
    uni.showToast({ title: locale.t('buildingCoord.zoneCreated'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('buildingCoord.saveFailed')), icon: 'none' });
  } finally {
    zoneCreating.value = false;
  }
}

/** 删除楼栋：有历史订单引用时后端拒绝（提示中带引用笔数） */
async function removeBuilding() {
  const f = editing.value;
  if (!f?.id || deleting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('buildingCoord.delTitle'),
      content: locale.t('buildingCoord.delConfirm').replace('{name}', f.name),
      confirmText: locale.t('buildingCoord.del'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  deleting.value = true;
  try {
    await campusDeleteBuilding(f.id);
    uni.showToast({ title: locale.t('buildingCoord.delDone'), icon: 'success' });
    editing.value = null;
    await load();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('buildingCoord.delFailed')), icon: 'none' });
  } finally {
    deleting.value = false;
  }
}

async function load() {
  try {
    const [zs, bs] = await Promise.all([campusZones(), campusBuildings()]);
    zones.value = zs;
    buildings.value = bs;
    if (zoneEditOpen.value) syncZoneForms();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('buildingCoord.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx; padding-bottom: 80rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .summary { display: flex; align-items: center; padding: 20rpx 24rpx; border-radius: $wa-radius;
    background: $wa-card; font-size: 24rpx; color: $wa-muted; margin-bottom: 20rpx;
    &.warn { color: $wa-accent; } }
  .zones { white-space: nowrap; margin-bottom: 20rpx;
    .zone { display: inline-block; padding: 10rpx 26rpx; margin-right: 16rpx; border-radius: 999rpx;
      background: $wa-card; border: 1.5px solid $wa-rule; font-size: 24rpx; color: $wa-muted;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; } }
  }
  .zone-manage { display: flex; align-items: center; gap: 16rpx; margin-bottom: 16rpx;
    .zm-toggle { font-size: 24rpx; color: $wa-accent; flex-shrink: 0; }
    .zm-hint { font-size: 20rpx; color: $wa-muted; } }
  .zone-panel { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 24rpx; margin-bottom: 20rpx;
    border: 1.5px solid $wa-rule;
    .zp-row { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0;
      border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .zp-name { flex: 1; font-size: 26rpx; color: $wa-ink; min-width: 0; }
      .zp-fee { display: flex; align-items: center; gap: 4rpx; flex-shrink: 0;
        .zp-fee-lbl { font-size: 24rpx; color: $wa-muted; }
        .zp-fee-input { width: 120rpx; font-size: 26rpx; color: $wa-ink; text-align: right; } }
      .zp-save { font-size: 24rpx; color: $wa-accent; flex-shrink: 0; padding: 0 8rpx;
        &.busy { color: $wa-muted; } } } }
  .list { background: $wa-card; border-radius: $wa-radius; padding: 0 24rpx;
    .row { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx;
        .row-l { display: flex; align-items: center; gap: 12rpx;
          .name { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
          .zone-tag { font-size: 20rpx; color: $wa-muted; border: 1rpx solid $wa-rule;
            border-radius: 6rpx; padding: 0 8rpx; } }
        .detail { font-size: 24rpx; color: $wa-muted; }
        .coord { font-size: 24rpx; color: $wa-ink; font-family: monospace;
          &.none { color: $wa-muted; } } }
      .row-r { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0;
        .pill { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx; border: 1rpx solid $wa-rule;
          &.ok { color: $wa-success; border-color: $wa-success; }
          &.todo { color: $wa-accent; border-color: $wa-accent; } }
        .chev { color: $wa-muted; font-size: 30rpx; } } }
  }
  .add { margin: 28rpx 0 0; background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent;
    font-size: 28rpx; border-radius: $wa-radius; }
  .editor { margin-top: 28rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx 28rpx 28rpx;
    border: 1.5px solid $wa-accent;
    .ed-head { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0 8rpx;
      .ed-title { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .ed-close { font-size: 40rpx; color: $wa-muted; padding: 0 8rpx; } }
    .cell { display: flex; align-items: center; padding: 22rpx 0; border-bottom: 1rpx solid $wa-rule;
      .lbl { width: 200rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
      input { flex: 1; font-size: 28rpx; }
      .picker { flex: 1; font-size: 28rpx; color: $wa-ink; } }
    .pick { margin: 24rpx 0 8rpx;
      .pick-map { width: 100%; height: 380rpx; border-radius: $wa-radius; }
      .pick-tip { font-size: 22rpx; color: $wa-muted; padding: 10rpx 0 0; } }
    .pick-missing { background: $wa-bg; border-radius: $wa-radius; padding: 28rpx 24rpx;
      font-size: 24rpx; color: $wa-muted; }
    .ed-actions { display: flex; gap: 20rpx; margin-top: 20rpx;
      .ghost { flex: 1; background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent;
        font-size: 28rpx; border-radius: $wa-radius; }
      .save { flex: 1; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; } }
    .del { margin-top: 20rpx; background: transparent; border: 1.5px solid $wa-danger; color: $wa-danger;
      font-size: 26rpx; border-radius: $wa-radius; }
    .note { font-size: 22rpx; color: $wa-muted; padding-top: 16rpx; }
  }
}
</style>
