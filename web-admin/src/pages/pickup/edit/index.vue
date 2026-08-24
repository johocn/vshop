<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">名称 *</text>
        <input class="ipt" v-model="form.name" placeholder="如 北京朝阳自提点" />
      </view>
      <view class="field">
        <text class="label">类型 *</text>
        <picker :range="typeLabels" @change="form.type = typeKeys[$event.detail.value]">
          <view class="ipt vpicker">
            <text>{{ mapTypeLabel(form.type) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
      </view>
      <view class="field">
        <text class="label">联系人</text>
        <input class="ipt" v-model="form.contactPerson" placeholder="如 王店长" />
      </view>
      <view class="field">
        <text class="label">联系电话</text>
        <input class="ipt" v-model="form.phoneNumber" placeholder="如 010-88886666" />
      </view>
      <view class="field">
        <text class="label">营业时间</text>
        <input class="ipt" v-model="form.businessHours" placeholder="如 09:00-21:00" />
      </view>

      <!-- 省市区三级联动（高德行政区划） -->
      <view class="field">
        <text class="label">所在地区</text>
        <view class="region">
          <picker class="region-item" :range="provinceNames" @change="onProvinceChange">
            <view class="ipt vpicker"><text>{{ form.province || '省份' }}</text><text class="caret">▾</text></view>
          </picker>
          <picker class="region-item" :range="cityNames" @change="onCityChange">
            <view class="ipt vpicker"><text>{{ form.city || '城市' }}</text><text class="caret">▾</text></view>
          </picker>
          <picker class="region-item" :range="districtNames" @change="onDistrictChange">
            <view class="ipt vpicker"><text>{{ form.district || '区县' }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
      </view>
      <view class="field">
        <text class="label">街道/详细地址（可修改）</text>
        <input class="ipt" v-model="form.street" placeholder="如 望京街道XX路1号" @tap="mapCandidatesVisible = false" />
      </view>
      <view class="field">
        <text class="label">完整地址</text>
        <input class="ipt" v-model="form.address" placeholder="省市区 + 详细地址" />
      </view>

      <!-- 经纬度：可手填，也可高德地图选点 -->
      <view class="field">
        <text class="label">经纬度</text>
        <view class="coord">
          <input class="ipt half" v-model="form.lat" type="digit" placeholder="纬度 lat" />
          <input class="ipt half" v-model="form.lng" type="digit" placeholder="经度 lng" />
        </view>
        <view class="mapbtn" @tap="openMapPicker">
          <text class="mb-ico">🗺</text>
          <text>{{ mapBusy ? '定位中…' : '高德地图选点' }}</text>
        </view>
        <text v-if="mapErr" class="maperr">{{ mapErr }}</text>
      </view>

      <view class="field">
        <text class="label">备注</text>
        <textarea class="area" v-model="form.remark" placeholder="如 临街商铺，进门报手机号取件"></textarea>
      </view>
      <view class="field">
        <text class="label">排序号</text>
        <input class="ipt" v-model="form.sortOrder" type="number" placeholder="数字越小越靠前" />
        <text class="tip">同号自提点按新建时间倒序展示</text>
      </view>
      <view class="field">
        <text class="label">启用</text>
        <switch :checked="form.enabled" @change="form.enabled = $event.detail.value" color="#2563eb" />
      </view>

      <!-- 自提点照片：复用图片库（图库选择/上传） -->
      <view class="field">
        <text class="label">自提点照片（从图片库选择）</text>
        <view class="media">
          <view v-for="(u, i) in photos" :key="i" class="mcell">
            <image class="mimg" :src="u" mode="aspectFill" @tap="preview(i)" />
            <text class="mrm" @tap="removePhoto(i)">×</text>
          </view>
          <view class="madd" @tap="showPicker = true">＋</view>
        </view>
        <view v-if="!photos.length" class="empty">暂无照片，点击 ＋ 从图片库选择或上传</view>
      </view>
    </view>

    <!-- 图片库选择弹层 -->
    <view v-if="showPicker" class="sheet-mask" @tap="closePicker">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <text class="st">选择/上传照片</text>
          <text class="done" @tap="closePicker">完成</text>
        </view>
        <ImagePicker ref="pickerRef" :max="9" :value="[]" @change="onPickerAdd" />
      </view>
    </view>

    <!-- 高德地图选点弹层 -->
    <view v-if="mapVisible" class="sheet-mask" @tap="closeMap">
      <view class="sheet map-sheet" @tap.stop>
        <view class="sheet-head">
          <text class="st">地图选点（点击地图取点）</text>
          <text class="done" @tap="closeMap">关闭</text>
        </view>
        <view id="amapContainer" class="amap" />
        <text v-if="mapPicked" class="map-pos">已选：{{ mapPicked.lat.toFixed(6) }}, {{ mapPicked.lng.toFixed(6) }}</text>
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">返回</button>
      <button class="btn main" @tap="onSave">保存</button>
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
import { fetchDistricts, reverseGeocode, fetchMapSdkConfig, DistrictNode } from '../../../apis/map';
import ImagePicker from '../../../components/ImagePicker.vue';

const id = ref<string | null>(null);
const typeKeys: PickupLocationType[] = ['store', 'point', 'employee'];
const typeLabels = ['门店', '自提点', '职工单位'];
const mapTypeLabel = (t: string) => ({ store: '门店', point: '自提点', employee: '职工单位' }[t] || t);

const form = ref({
  name: '', type: 'point' as PickupLocationType, contactPerson: '', phoneNumber: '',
  businessHours: '早8:30至16:30', province: '', city: '', district: '', street: '', address: '',
  lat: '', lng: '', remark: '', sortOrder: '0', enabled: true,
});
const photos = ref<string[]>([]);

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
        mapErr.value = '未配置地图服务，请联系管理员在后台配置高德 key，或手动填写经纬度';
        mapBusy.value = false;
        return reject(new Error('MAP_NOT_CONFIGURED'));
      }
      const s = document.createElement('script');
      s.src = cfg.sdkUrl;
      s.onload = () => resolve(w.AMap);
      s.onerror = () => reject(new Error('加载地图 SDK 失败'));
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
    if (!mapErr.value) mapErr.value = e?.message || '地图选点失败';
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
    title: '移除照片', content: '确认移除这张照片？',
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
});

onMounted(async () => {
  provinces.value = await fetchDistricts(null).catch(() => []);
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
        enabled: s.enabled !== false,
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

function goBack() { uni.navigateBack(); }

async function onSave() {
  if (!form.value.name.trim()) { uni.showToast({ title: '请填写名称', icon: 'none' }); return; }
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
    uni.showToast({ title: '保存成功' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
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