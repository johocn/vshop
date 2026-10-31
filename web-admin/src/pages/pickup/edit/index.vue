<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">{{ $t('pickupEdit.nameLabel') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('pickupEdit.namePh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.typeLabel') }}</text>
        <picker :range="typeLabels" @change="form.type = typeKeys[$event.detail.value]">
          <view class="ipt vpicker">
            <text>{{ mapTypeLabel(form.type) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.storeLabel') }}</text>
        <picker :range="storeLabels" @change="onStoreChange">
          <view class="ipt vpicker">
            <text>{{ storeLabel }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
        <text class="tip">{{ $t('pickupEdit.storeTip') }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.contactLabel') }}</text>
        <input class="ipt" v-model="form.contactPerson" :placeholder="$t('pickupEdit.contactPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.phoneLabel') }}</text>
        <input class="ipt" v-model="form.phoneNumber" :placeholder="$t('pickupEdit.phonePh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.hoursLabel') }}</text>
        <input class="ipt" v-model="form.businessHours" :placeholder="$t('pickupEdit.hoursPh')" />
      </view>

      <!-- 省市区三级联动（高德行政区划） -->
      <view class="field">
        <text class="label">{{ $t('pickupEdit.regionLabel') }}</text>
        <view class="region">
          <picker class="region-item" :range="provinceNames" @change="onProvinceChange">
            <view class="ipt vpicker"><text>{{ form.province || $t('pickupEdit.provincePh') }}</text><text class="caret">▾</text></view>
          </picker>
          <picker class="region-item" :range="cityNames" @change="onCityChange">
            <view class="ipt vpicker"><text>{{ form.city || $t('pickupEdit.cityPh') }}</text><text class="caret">▾</text></view>
          </picker>
          <picker class="region-item" :range="districtNames" @change="onDistrictChange">
            <view class="ipt vpicker"><text>{{ form.district || $t('pickupEdit.districtPh') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.streetLabel') }}</text>
        <input class="ipt" v-model="form.street" :placeholder="$t('pickupEdit.streetPh')" @tap="mapCandidatesVisible = false" />
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.addressLabel') }}</text>
        <input class="ipt" v-model="form.address" :placeholder="$t('pickupEdit.addressPh')" />
      </view>

      <!-- 经纬度：可手填，也可高德地图选点 -->
      <view class="field">
        <text class="label">{{ $t('pickupEdit.coordLabel') }}</text>
        <view class="coord">
          <input class="ipt half" v-model="form.lat" type="digit" :placeholder="$t('pickupEdit.latPh')" />
          <input class="ipt half" v-model="form.lng" type="digit" :placeholder="$t('pickupEdit.lngPh')" />
        </view>
        <view class="mapbtn" @tap="openMapPicker">
          <text class="mb-ico">🗺</text>
          <text>{{ mapBusy ? $t('pickupEdit.locating') : $t('pickupEdit.mapPick') }}</text>
        </view>
        <text v-if="mapErr" class="maperr">{{ mapErr }}</text>
      </view>

      <view class="field">
        <text class="label">{{ $t('pickupEdit.remarkLabel') }}</text>
        <textarea class="area" v-model="form.remark" :placeholder="$t('pickupEdit.remarkPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.sortLabel') }}</text>
        <input class="ipt" v-model="form.sortOrder" type="number" :placeholder="$t('pickupEdit.sortPh')" />
        <text class="tip">{{ $t('pickupEdit.sortTip') }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('pickupEdit.enabledLabel') }}</text>
        <switch :checked="form.enabled" @change="form.enabled = $event.detail.value" color="#2563eb" />
      </view>

      <!-- 全局可用：仅超级管理员可把自提点设为全局（后端 SetGlobalPickupLocation 二次鉴权） -->
      <view v-if="auth.isSuperAdmin" class="field">
        <text class="label">{{ $t('pickupEdit.globalLabel') }}</text>
        <switch :checked="form.isPublic" @change="form.isPublic = $event.detail.value" color="#0a9c6e" />
        <text class="tip">{{ $t('pickupEdit.globalTip') }}</text>
      </view>

      <!-- 自提点照片：复用图片库（图库选择/上传） -->
      <view class="field">
        <text class="label">{{ $t('pickupEdit.photoLabel') }}</text>
        <view class="media">
          <view v-for="(u, i) in photos" :key="i" class="mcell">
            <image class="mimg" :src="u" mode="aspectFill" @tap="preview(i)" />
            <text class="mrm" @tap="removePhoto(i)">×</text>
          </view>
          <view class="madd" @tap="showPicker = true">＋</view>
        </view>
        <view v-if="!photos.length" class="empty">{{ $t('pickupEdit.photoEmpty') }}</view>
      </view>
    </view>

    <!-- 图片库选择弹层 -->
    <view v-if="showPicker" class="sheet-mask" @tap="closePicker">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <text class="st">{{ $t('pickupEdit.pickerTitle') }}</text>
          <text class="done" @tap="closePicker">{{ $t('pickupEdit.done') }}</text>
        </view>
        <ImagePicker ref="pickerRef" :max="9" :value="[]" @change="onPickerAdd" />
      </view>
    </view>

    <!-- 高德地图选点弹层 -->
    <view v-if="mapVisible" class="sheet-mask" @tap="closeMap">
      <view class="sheet map-sheet" @tap.stop>
        <view class="sheet-head">
          <text class="st">{{ $t('pickupEdit.mapTitle') }}</text>
          <text class="done" @tap="closeMap">{{ $t('pickupEdit.close') }}</text>
        </view>
        <view id="amapContainer" class="amap" />
        <text v-if="mapPicked" class="map-pos">{{ $t('pickupEdit.picked') }}{{ mapPicked.lat.toFixed(6) }}, {{ mapPicked.lng.toFixed(6) }}</text>
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">{{ $t('pickupEdit.back') }}</button>
      <button class="btn main" @tap="onSave">{{ $t('pickupEdit.save') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchPickupLocation, createPickupLocation, updatePickupLocation,
  PickupLocationType,
} from '../../../apis/pickup-location';
import { fetchMerchantStores, type MerchantStoreItem } from '../../../apis/merchant-admin';
import { fetchDistricts, reverseGeocode, fetchMapSdkConfig, DistrictNode } from '../../../apis/map';
import ImagePicker from '../../../components/ImagePicker.vue';
import { useAuthStore } from '../../../stores/authStore';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';

const auth = useAuthStore();
const locale = useLocaleStore();

const id = ref<string | null>(null);
const typeKeys: PickupLocationType[] = ['store', 'point', 'employee'];
const typeLabelKeys: Record<string, string> = {
  store: 'pickupPage.typeStore', point: 'pickupPage.typePoint', employee: 'pickupPage.typeEmployee',
};
const typeLabels = computed(() => typeKeys.map((k) => locale.t(typeLabelKeys[k])));
const mapTypeLabel = (t: string) => (typeLabelKeys[t] ? locale.t(typeLabelKeys[t]) : t);

const form = ref({
  name: '', type: 'point' as PickupLocationType, contactPerson: '', phoneNumber: '',
  businessHours: '早8:30至16:30', province: '', city: '', district: '', street: '', address: '',
  lat: '', lng: '', remark: '', sortOrder: '0', enabled: true, isPublic: false,
  merchantStoreId: '',
});
const photos = ref<string[]>([]);

// ---- 关联门店 ----
const stores = ref<MerchantStoreItem[]>([]);
const storeLabels = computed(() => [locale.t('pickupEdit.storeUnlink'), ...stores.value.map((s) => `${s.name}（${s.code}）`)]);
const storeLabel = computed(() => {
  if (!form.value.merchantStoreId) return locale.t('pickupEdit.storeUnlink');
  const s = stores.value.find((x) => String(x.id) === String(form.value.merchantStoreId));
  return s ? `${s.name}（${s.code}）` : `#${form.value.merchantStoreId}`;
});
function onStoreChange(e: any) {
  const idx = Number(e.detail.value);
  form.value.merchantStoreId = idx === 0 ? '' : String(stores.value[idx - 1]?.id ?? '');
}

// ---- 省市区联动 ----
const provinces = ref<DistrictNode[]>([]);
const cities = ref<DistrictNode[]>([]);
const districts = ref<DistrictNode[]>([]);
const provinceNames = computed(() => provinces.value.map((p) => p.name));
const cityNames = computed(() => cities.value.map((c) => c.name));
const districtNames = computed(() => districts.value.map((d) => d.name));
// 当前选中的省/市/区节点（用于地图默认定位到选区中心）
const selProvince = ref<DistrictNode | null>(null);
const selCity = ref<DistrictNode | null>(null);
const selDistrict = ref<DistrictNode | null>(null);

async function onProvinceChange(e: any) {
  const p = provinces.value[e.detail.value];
  if (!p) return;
  selProvince.value = p;
  selCity.value = null;
  selDistrict.value = null;
  form.value.province = p.name;
  form.value.city = '';
  form.value.district = '';
  cities.value = await fetchDistricts(p.adcode).catch(() => []);
  districts.value = [];
}
async function onCityChange(e: any) {
  const c = cities.value[e.detail.value];
  if (!c) return;
  selCity.value = c;
  selDistrict.value = null;
  form.value.city = c.name;
  form.value.district = '';
  districts.value = await fetchDistricts(c.adcode).catch(() => []);
}
async function onDistrictChange(e: any) {
  const d = districts.value[e.detail.value];
  if (!d) return;
  selDistrict.value = d;
  form.value.district = d.name;
}

// ---- 高德地图选点 ----
const mapVisible = ref(false);
const mapBusy = ref(false);
const mapErr = ref('');
const mapPicked = ref<{ lat: number; lng: number } | null>(null);
let amapMap: any = null;
let amapWidget: any = null;

function loadAmap(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w: any = typeof window !== 'undefined' ? window : undefined;
    if (w?.AMap) return resolve(w.AMap);
    fetchMapSdkConfig().then((cfg) => {
      if (!cfg.hasConfigured || !cfg.sdkUrl) {
        mapErr.value = locale.t('pickupEdit.mapNotConfigured');
        mapBusy.value = false;
        return reject(new Error('MAP_NOT_CONFIGURED'));
      }
      const s = document.createElement('script');
      s.src = cfg.sdkUrl;
      s.onload = () => resolve(w.AMap);
      s.onerror = () => reject(new Error(locale.t('pickupEdit.mapSdkFailed')));
      document.head.appendChild(s);
    }).catch((e) => reject(e));
  });
}

async function openMapPicker() {
  mapBusy.value = true;
  mapErr.value = '';
  try {
    const AMap = await loadAmap();
    mapVisible.value = true;
    // 已有坐标则定位到该点，否则中心为已选省/市/区中心
    await new Promise((r) => setTimeout(r, 80));
    const { center, zoom } = mapCenter();
    amapMap = new AMap.Map('amapContainer', {
      zoom,
      center: [center.lng, center.lat],
    });
    mapPicked.value = null;
    amapMap.on('click', (e: any) => {
      const lng = e.lnglat.getLng();
      const lat = e.lnglat.getLat();
      const ll = { lat, lng };
      mapPicked.value = ll;
      form.value.lat = lat.toFixed(6);
      form.value.lng = lng.toFixed(6);
      fillAddressFromMap(lat, lng);
    });
  } catch (e: any) {
    if (!mapErr.value) mapErr.value = e?.message || locale.t('pickupEdit.mapPickFailed');
  } finally {
    mapBusy.value = false;
  }
}

// 返回地图初始中心与缩放：优先已有坐标；否则按选区深度取省/市/区中心
function mapCenter(): { center: { lat: number; lng: number }; zoom: number } {
  const hasCoord = form.value.lat && form.value.lng;
  if (hasCoord) return { center: { lat: Number(form.value.lat), lng: Number(form.value.lng) }, zoom: 14 };
  const node = selDistrict.value || selCity.value || selProvince.value;
  if (node?.center) {
    const zoom = selDistrict.value ? 13 : selCity.value ? 11 : 9;
    return { center: node.center, zoom };
  }
  return { center: { lat: 34.5, lng: 109.7 }, zoom: 4 }; // 默认全国
}

function closeMap() {
  mapVisible.value = false;
  if (amapMap) { amapMap.destroy(); amapMap = null; }
}

async function fillAddressFromMap(lat: number, lng: number) {
  try {
    const r = await reverseGeocode(lat, lng);
    if (!r) return;
    if (r.province) form.value.province = r.province;
    if (r.city) form.value.city = r.city;
    if (r.district) form.value.district = r.district;
    if (r.street && !form.value.street) form.value.street = r.street;
    if (r.formattedAddress) form.value.address = r.formattedAddress;
  } catch (e: any) {
    // 逆编码失败不阻断，经纬度已填
  }
}

// ---- 照片：图片库 ----
const showPicker = ref(false);
const pickerRef = ref<any>(null);
const mapCandidatesVisible = ref(false);

async function onPickerAdd(ids: string[]) {
  void ids;
  const assets = pickerRef.value?.getSelectedAssets?.() as Array<{ preview: string }> | undefined;
  if (!assets) return;
  for (const a of assets) {
    const url = a.preview;
    if (url && !photos.value.includes(url)) photos.value.push(url);
  }
}
function closePicker() { showPicker.value = false; }
function preview(i: number) {
  uni.previewImage({ urls: photos.value, current: photos.value[i] });
}
function removePhoto(i: number) {
  uni.showModal({
    title: locale.t('pickupEdit.removePhotoTitle'), content: locale.t('pickupEdit.removePhotoContent'),
    success: (r) => { if (r.confirm) photos.value.splice(i, 1); },
  });
}

// ---- 编辑回填 ----
async function resolvePhotoPreviews(urls: string[]): Promise<string[]> {
  // 原样保留 URL（self-pickup 照片存的是 resource preview URL）；图片库变更时按此去重合并
  return urls;
}

onLoad((query: any) => {
  if (query?.id) id.value = query?.id as string;
  // 从配送档案「新增自提点」跳入时预选匹配的自提点类型
  if (query?.type && ['store', 'point', 'employee'].includes(query.type)) {
    form.value.type = query.type as PickupLocationType;
  }
  // 从门店详情「新增自提点」跳入时预选关联门店
  if (query?.merchantStoreId) form.value.merchantStoreId = String(query.merchantStoreId);
});

onMounted(async () => {
  provinces.value = await fetchDistricts(null).catch(() => []);
  stores.value = (await fetchMerchantStores({ take: 200 }).catch(() => ({ items: [] }))).items;
  if (id.value) {
    const s = await fetchPickupLocation(id.value);
    if (s) {
      form.value = {
        name: s.name || '', type: s.type, contactPerson: s.contactPerson || '',
        phoneNumber: s.phoneNumber || '', businessHours: s.businessHours || '',
        province: s.province || '', city: s.city || '', district: s.district || '',
        street: s.street || '', address: s.address || '',
        lat: s.coordinates?.lat != null ? String(s.coordinates.lat) : '',
        lng: s.coordinates?.lng != null ? String(s.coordinates.lng) : '',
        remark: s.remark || '', sortOrder: String(s.sortOrder ?? 0),
        enabled: s.enabled !== false, isPublic: s.isPublic || false,
        merchantStoreId: s.merchantStoreId ? String(s.merchantStoreId) : '',
      };
      photos.value = s.photos || [];
      // 联动预载：已填省份时拉取对应市/区
      await hydrateRegionList();
    }
  }
});

async function hydrateRegionList() {
  if (!form.value.province) return;
  const p = provinces.value.find((x) => x.name === form.value.province);
  if (p) {
    selProvince.value = p;
    cities.value = await fetchDistricts(p.adcode).catch(() => []);
  }
  if (form.value.city) {
    const c = cities.value.find((x) => x.name === form.value.city);
    if (c) {
      selCity.value = c;
      districts.value = await fetchDistricts(c.adcode).catch(() => []);
    }
  }
  if (form.value.district) {
    const d = districts.value.find((x) => x.name === form.value.district);
    if (d) selDistrict.value = d;
  }
}

function goBack() { backToHome(); }

async function onSave() {
  if (!form.value.name.trim()) { uni.showToast({ title: locale.t('pickupEdit.requireName'), icon: 'none' }); return; }
  const coordinates = form.value.lat && form.value.lng &&
    !isNaN(Number(form.value.lat)) && !isNaN(Number(form.value.lng))
    ? { lat: Number(form.value.lat), lng: Number(form.value.lng) }
    : undefined;
  const payload = {
    name: form.value.name.trim(),
    type: form.value.type,
    contactPerson: form.value.contactPerson.trim() || undefined,
    phoneNumber: form.value.phoneNumber.trim() || undefined,
    businessHours: form.value.businessHours.trim() || undefined,
    province: form.value.province.trim() || undefined,
    city: form.value.city.trim() || undefined,
    district: form.value.district.trim() || undefined,
    street: form.value.street.trim() || undefined,
    address: form.value.address.trim() || form.value.province + form.value.city + form.value.district + form.value.street,
    remark: form.value.remark.trim() || undefined,
    sortOrder: Number(form.value.sortOrder) || 0,
    enabled: form.value.enabled,
    isPublic: form.value.isPublic,
    // 显式传 null 才能解除已有门店关联
    merchantStoreId: form.value.merchantStoreId || null,
    photos: photos.value.length ? photos.value : undefined,
    ...(coordinates ? { coordinates } : {}),
  };
  try {
    if (id.value) {
      await updatePickupLocation({ id: id.value, ...payload });
    } else {
      const savedId = await createPickupLocation(payload as any);
      uni.$emit('pickup-created', savedId);
    }
    uni.showToast({ title: locale.t('pickupEdit.saveOk') });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('pickupEdit.saveFailed'), icon: 'none' });
  }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .field { margin-bottom: 20rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%;
        &.half { width: 100%; }
      }
      .vpicker { display: flex; align-items: center; justify-content: space-between; }
      .caret { color: $wa-muted; font-size: 24rpx; }
      .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 140rpx; box-sizing: border-box; }
      .region { display: flex; gap: 12rpx;
        .region-item { flex: 1; min-width: 0; }
      }
      .coord { display: flex; gap: 12rpx; }
      .mapbtn { display: flex; align-items: center; justify-content: center; gap: 8rpx; margin-top: 14rpx; padding: 18rpx 0; border: 1px dashed $wa-accent; border-radius: $wa-radius; color: $wa-accent; font-size: 26rpx; background: #f5f9ff; }
      .maperr { display: block; margin-top: 8rpx; font-size: 22rpx; color: #e64340; }
      .media { display: flex; flex-wrap: wrap;
        .mcell { position: relative; width: 140rpx; height: 140rpx; margin: 0 12rpx 12rpx 0;
          .mimg { width: 140rpx; height: 140rpx; border-radius: $wa-radius; background: $wa-bg; }
          .mrm { position: absolute; top: -10rpx; right: -10rpx; width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; color: #fff; background: rgba(0,0,0,.55); border-radius: 50%; font-size: 28rpx; }
        }
        .madd { width: 140rpx; height: 140rpx; border-radius: $wa-radius; border: 2rpx dashed $wa-rule; display: flex; align-items: center; justify-content: center; font-size: 56rpx; color: $wa-muted; }
      }
      .empty { font-size: 24rpx; color: $wa-muted; }
    }
  }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; }
  }
}
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 90; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 24rpx calc(env(safe-area-inset-bottom) + 28rpx);
  .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
    .st { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .done { font-size: 28rpx; color: $wa-accent; font-weight: 600; }
  }
  &.map-sheet { padding-bottom: 28rpx; }
  .amap { width: 100%; height: 60vh; border-radius: $wa-radius; }
  .map-pos { display: block; margin-top: 12rpx; text-align: center; font-size: 24rpx; color: $wa-accent; }
}
</style>