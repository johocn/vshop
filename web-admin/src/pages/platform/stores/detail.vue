<template>
  <view class="page">
    <view class="card">
      <text class="section">{{ $t('merchantAdmin.storeBasic') }}</text>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.belongMerchant') }} <text class="req">*</text></text>
        <picker :range="merchantLabels" @change="onMerchantChange">
          <view class="ipt pick">{{ merchantLabel }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.storeCode') }} <text class="req">*</text></text>
        <input class="ipt" v-model="form.code" :disabled="!!id" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.storeName') }} <text class="req">*</text></text>
        <input class="ipt" v-model="form.name" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.storeType') }}</text>
        <picker :range="typeLabels" @change="form.storeType = typeKeys[$event.detail.value]">
          <view class="ipt pick">{{ form.storeType }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.storeStatus') }}</text>
        <picker :range="statusLabels" @change="form.status = statusKeys[$event.detail.value]">
          <view class="ipt pick">{{ form.status }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.sortWeight') }}</text>
        <view class="two">
          <input class="ipt half" v-model="form.sortOrder" type="number" :placeholder="$t('merchantAdmin.sortOrder')" />
          <input class="ipt half" v-model="form.weight" type="number" :placeholder="$t('merchantAdmin.weight')" />
        </view>
      </view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.storeContact') }}</text>
      <view class="field"><text class="label">{{ $t('merchantAdmin.phoneNumber') }}</text><input class="ipt" v-model="form.phoneNumber" type="number" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.backupPhone') }}</text><input class="ipt" v-model="form.backupPhone" type="number" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.servicePhone') }}</text><input class="ipt" v-model="form.servicePhone" type="number" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.managerName') }}</text><input class="ipt" v-model="form.managerName" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.managerPhone') }}</text><input class="ipt" v-model="form.managerPhone" type="number" /></view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.storeAddress') }}</text>
      <view class="field"><text class="label">{{ $t('merchantAdmin.province') }}</text><input class="ipt" v-model="form.province" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.city') }}</text><input class="ipt" v-model="form.city" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.cityCode') }}</text><input class="ipt" v-model="form.cityCode" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.district') }}</text><input class="ipt" v-model="form.district" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.street') }}</text><input class="ipt" v-model="form.street" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.addressLine') }}</text><input class="ipt" v-model="form.addressLine" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.detail') }}</text><input class="ipt" v-model="form.detail" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.postalCode') }}</text><input class="ipt" v-model="form.postalCode" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.navigationAddress') }}</text><input class="ipt" v-model="form.navigationAddress" /></view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.coords') }}</text>
        <view class="two">
          <input class="ipt half" v-model="form.lat" type="digit" :placeholder="$t('merchantAdmin.lat')" />
          <input class="ipt half" v-model="form.lng" type="digit" :placeholder="$t('merchantAdmin.lng')" />
        </view>
        <view class="mapbtn" @tap="openMapPicker">
          <text>🗺</text>
          <text>{{ mapBusy ? $t('merchantAdmin.locating') : $t('merchantAdmin.mapPick') }}</text>
        </view>
        <text v-if="mapErr" class="tip err">{{ mapErr }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.business') }}</text>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.businessHoursText') }}</text>
        <input class="ipt" v-model="form.businessHoursText" :placeholder="$t('merchantAdmin.hoursPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.businessHoursJson') }}</text>
        <textarea class="area code" v-model="form.businessHours" :placeholder="$t('merchantAdmin.businessHoursPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.tags') }}</text>
        <input class="ipt" v-model="form.tags" :placeholder="$t('merchantAdmin.tagsPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.facilities') }}</text>
        <input class="ipt" v-model="form.facilities" :placeholder="$t('merchantAdmin.tagsPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.externalIds') }}</text>
        <textarea class="area code" v-model="form.externalIds" :placeholder="'{}'" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.notice') }}</text>
        <textarea class="area" v-model="form.notice" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.coverImage') }}</text>
        <MediaUrlField :model-value="cover" :max="1" @update:model-value="cover = $event" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.photos') }}</text>
        <MediaUrlField :model-value="photos" :max="9" @update:model-value="photos = $event" />
      </view>
      <view class="field row"><text class="label">{{ $t('merchantAdmin.acceptingOrders') }}</text><switch :checked="form.acceptingOrders" color="#2563eb" @change="form.acceptingOrders = $event.detail.value" /></view>
      <view class="field row"><text class="label">{{ $t('merchantAdmin.enabled') }}</text><switch :checked="form.enabled" color="#2563eb" @change="form.enabled = $event.detail.value" /></view>
      <view class="field row"><text class="label">{{ $t('merchantAdmin.isPublic') }}</text><switch :checked="form.isPublic" color="#0a9c6e" @change="form.isPublic = $event.detail.value" /></view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.redemption') }}</text>
      <view class="field row"><text class="label">{{ $t('merchantAdmin.supportsRedemption') }}</text><switch :checked="form.supportsRedemption" color="#2563eb" @change="form.supportsRedemption = $event.detail.value" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.redemptionHours') }}</text><input class="ipt" v-model="form.redemptionHours" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.dailyRedeemLimit') }}</text><input class="ipt" v-model="form.dailyRedeemLimit" type="number" /></view>
      <view class="field row"><text class="label">{{ $t('merchantAdmin.requiresReservation') }}</text><switch :checked="form.requiresReservation" color="#2563eb" @change="form.requiresReservation = $event.detail.value" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.reservationPhone') }}</text><input class="ipt" v-model="form.reservationPhone" type="number" /></view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.delivery') }}</text>
      <view class="field row"><text class="label">{{ $t('merchantAdmin.supportsDelivery') }}</text><switch :checked="form.supportsDelivery" color="#2563eb" @change="form.supportsDelivery = $event.detail.value" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.deliveryRadiusKm') }}</text><input class="ipt" v-model="form.deliveryRadiusKm" type="number" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.deliveryFee') }}</text><input class="ipt" v-model="form.deliveryFee" type="digit" :placeholder="$t('merchantAdmin.yuanPh')" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.minOrderAmount') }}</text><input class="ipt" v-model="form.minOrderAmount" type="digit" :placeholder="$t('merchantAdmin.yuanPh')" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.deliveryMinutes') }}</text><input class="ipt" v-model="form.deliveryMinutes" type="number" /></view>
    </view>

    <view v-if="id" class="card">
      <view class="claim-head">
        <text class="section">{{ $t('merchantAdmin.linkedPickups') }}</text>
        <text class="link" @tap="onAddPickup">{{ $t('merchantAdmin.addPickup') }}</text>
      </view>
      <view v-for="p in pickups" :key="p.id" class="claim" @tap="onOpenPickup(p)">
        <view class="claim-info">
          <text class="claim-name">{{ p.name }}</text>
          <text class="claim-sub">{{ p.address }}<text v-if="p.enabled === false"> · {{ $t('merchantAdmin.disable') }}</text></text>
        </view>
        <text class="edit" @tap.stop="onOpenPickup(p)">{{ $t('merchantAdmin.edit') }}</text>
      </view>
      <view v-if="!pickups.length" class="tip">{{ $t('merchantAdmin.noPickups') }}</view>
    </view>

    <view v-if="id" class="card">
      <view class="claim-head">
        <text class="section">{{ $t('merchantAdmin.staff') }}</text>
        <text class="link" @tap="onAddStaff">{{ $t('merchantAdmin.addStaff') }}</text>
      </view>
      <view v-for="st in staff" :key="st.id" class="claim" @tap="onEditStaff(st)">
        <view class="claim-info">
          <text class="claim-name">{{ st.name || staffUserName(st.userId) }}</text>
          <text class="claim-sub">{{ roleText(st.role) }} · {{ staffStatusText(st.status) }}</text>
        </view>
        <text class="edit" @tap.stop="onEditStaff(st)">{{ $t('merchantAdmin.edit') }}</text>
      </view>
      <view v-if="!staff.length" class="tip">{{ $t('merchantAdmin.noStaff') }}</view>
    </view>

    <view v-if="auth.isSuperAdmin && id" class="card">
      <view class="claim-head">
        <text class="section">{{ $t('merchantAdmin.claims') }}</text>
        <text class="link" @tap="onAddClaim">{{ $t('merchantAdmin.addClaim') }}</text>
      </view>
      <view v-for="c in claims" :key="c.id" class="claim">
        <view class="claim-info">
          <text class="claim-name">{{ channelName(c.channelId) }}</text>
          <text class="claim-sub">{{ c.role }} · {{ c.status }}</text>
        </view>
        <text v-if="c.status === 'ACTIVE'" class="revoke" @tap="onRevoke(c)">{{ $t('merchantAdmin.revoke') }}</text>
      </view>
      <view v-if="!claims.length" class="tip">{{ $t('merchantAdmin.noClaims') }}</view>
    </view>

    <!-- 地图选点 -->
    <view v-if="mapVisible" class="sheet-mask" @tap="closeMap">
      <view class="sheet map-sheet" @tap.stop>
        <view class="sheet-head">
          <text class="st">{{ $t('merchantAdmin.mapTitle') }}</text>
          <text class="done" @tap="closeMap">{{ $t('merchantAdmin.close') }}</text>
        </view>
        <view id="amapContainer" class="amap" />
        <text v-if="mapPicked" class="map-pos">{{ mapPicked.lat.toFixed(6) }}, {{ mapPicked.lng.toFixed(6) }}</text>
      </view>
    </view>

    <!-- 认领渠道 -->
    <view v-if="showClaim" class="mask" @tap="showClaim = false">
      <view class="pop" @tap.stop>
        <text class="pop-title">{{ $t('merchantAdmin.addClaim') }}</text>
        <view class="field">
          <text class="label">{{ $t('merchantAdmin.channel') }}</text>
          <picker :range="channelLabels" @change="claimChannelIdx = Number($event.detail.value)">
            <view class="ipt pick">{{ channelLabel }}<text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">{{ $t('merchantAdmin.claimRole') }}</text>
          <picker :range="['OWNER', 'PARTNER']" @change="claimRole = $event.detail.value === '1' ? 'PARTNER' : 'OWNER'">
            <view class="ipt pick">{{ claimRole }}<text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="actions">
          <button class="btn ghost" @tap="showClaim = false">{{ $t('merchantAdmin.cancel') }}</button>
          <button class="btn main" @tap="submitClaim">{{ $t('merchantAdmin.confirm') }}</button>
        </view>
      </view>
    </view>

    <!-- 门店员工 -->
    <view v-if="showStaff" class="mask" @tap="showStaff = false">
      <view class="pop" @tap.stop>
        <text class="pop-title">{{ staffEditing ? $t('merchantAdmin.editStaff') : $t('merchantAdmin.addStaff') }}</text>
        <view v-if="!staffEditing" class="field">
          <text class="label">{{ $t('merchantAdmin.staffUser') }}</text>
          <picker :range="staffCandidateLabels" @change="onStaffCandidateChange">
            <view class="ipt pick">{{ staffCandidateLabel }}<text class="caret">▾</text></view>
          </picker>
          <text v-if="!staffCandidates.length" class="tip">{{ $t('merchantAdmin.noStaffCandidates') }}</text>
        </view>
        <view class="field">
          <text class="label">{{ $t('merchantAdmin.staffName') }}</text>
          <input class="ipt" v-model="staffForm.name" />
        </view>
        <view class="field">
          <text class="label">{{ $t('merchantAdmin.staffPhone') }}</text>
          <input class="ipt" v-model="staffForm.phone" type="number" />
        </view>
        <view class="field">
          <text class="label">{{ $t('merchantAdmin.staffRole') }}</text>
          <picker :range="staffRoleLabels" @change="staffForm.role = staffRoleKeys[$event.detail.value]">
            <view class="ipt pick">{{ roleText(staffForm.role) }}<text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">{{ $t('merchantAdmin.staffStatus') }}</text>
          <picker :range="staffStatusLabels" @change="staffForm.status = staffStatusKeys[$event.detail.value]">
            <view class="ipt pick">{{ staffStatusText(staffForm.status) }}<text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="actions">
          <button class="btn ghost" @tap="showStaff = false">{{ $t('merchantAdmin.cancel') }}</button>
          <button class="btn main" @tap="submitStaff">{{ $t('merchantAdmin.confirm') }}</button>
        </view>
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">{{ $t('merchantAdmin.cancel') }}</button>
      <button class="btn main" :disabled="saving" @tap="onSave">{{ saving ? $t('merchantAdmin.saving') : $t('merchantAdmin.save') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  claimStore, createMerchantStore, fetchMerchantStore, fetchMerchants, fetchStoreClaims,
  fetchStoreStaff, revokeStoreClaim, updateMerchantStore, upsertStoreStaff,
  type MerchantItem, type MerchantStoreClaimItem, type MerchantStoreStaffItem,
} from '../../../apis/merchant-admin';
import {
  fetchMyTenantMembers, fetchTenants, fetchTenantAdministrators,
  type TenantItem, type TenantMemberItem,
} from '../../../apis/tenant-admin';
import { fetchMapSdkConfig, reverseGeocode } from '../../../apis/map';
import { fetchPickupLocationsByStore, type PickupLocationItem } from '../../../apis/pickup-location';
import { graphQlErrorMsg } from '../../../apis/client';
import { useAuthStore } from '../../../stores/authStore';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';
import MediaUrlField from '../../../components/MediaUrlField.vue';

const locale = useLocaleStore();
const auth = useAuthStore();
const id = ref<string | null>(null);
const saving = ref(false);
const merchantId = ref('');
const merchants = ref<MerchantItem[]>([]);
const cover = ref<string[]>([]);
const photos = ref<string[]>([]);
const claims = ref<MerchantStoreClaimItem[]>([]);
const channels = ref<TenantItem[]>([]);
const pickups = ref<PickupLocationItem[]>([]);

const typeKeys = ['DIRECT', 'FRANCHISE', 'OUTLET'];
const typeLabels = [locale.t('merchantAdmin.storeTypeDirect'), locale.t('merchantAdmin.storeTypeFranchise'), locale.t('merchantAdmin.storeTypeOutlet')];
const statusKeys = ['OPEN', 'CLOSED', 'SUSPENDED'];
const statusLabels = computed(() => statusKeys.map((s) => locale.t(`merchantAdmin.storeStatus${s.charAt(0)}${s.slice(1).toLowerCase()}`)));
const merchantLabels = computed(() => merchants.value.map((m) => m.name));
const merchantLabel = computed(() => merchants.value.find((m) => m.id === merchantId.value)?.name || locale.t('merchantAdmin.selectMerchant'));

const form = ref({
  code: '', name: '', storeType: 'DIRECT', status: 'OPEN', sortOrder: '0', weight: '0',
  phoneNumber: '', backupPhone: '', servicePhone: '', managerName: '', managerPhone: '',
  province: '', city: '', cityCode: '', district: '', street: '', addressLine: '', detail: '',
  postalCode: '', navigationAddress: '',
  lat: '', lng: '', businessHours: '', businessHoursText: '', tags: '', facilities: '', externalIds: '',
  notice: '',
  acceptingOrders: true, enabled: true, isPublic: false,
  supportsRedemption: true, redemptionHours: '', dailyRedeemLimit: '',
  requiresReservation: false, reservationPhone: '',
  supportsDelivery: false, deliveryRadiusKm: '', deliveryFee: '', minOrderAmount: '', deliveryMinutes: '',
});

// ---- 员工 ----
const staff = ref<MerchantStoreStaffItem[]>([]);
const staffCandidates = ref<TenantMemberItem[]>([]);
const showStaff = ref(false);
const staffEditing = ref(false);
const staffCandidateIdx = ref(0);
const staffForm = ref({ userId: '', name: '', phone: '', role: 'CLERK', status: 'ACTIVE' });
const staffRoleKeys = ['OWNER', 'MANAGER', 'CLERK'];
const staffStatusKeys = ['ACTIVE', 'DISABLED'];
const staffRoleLabels = computed(() => staffRoleKeys.map((r) => roleText(r)));
const staffStatusLabels = computed(() => staffStatusKeys.map((s) => staffStatusText(s)));
const staffCandidateLabels = computed(() =>
  staffCandidates.value.map((c) => `${c.displayName || c.phone || c.emailAddress || c.administratorId}${c.phone ? ` · ${c.phone}` : ''}`),
);
const staffCandidateLabel = computed(() => staffCandidateLabels.value[staffCandidateIdx.value] || locale.t('merchantAdmin.selectStaffUser'));

function roleText(role: string) {
  const key = `merchantAdmin.role${role.charAt(0)}${role.slice(1).toLowerCase()}`;
  return role === 'OWNER' ? locale.t('merchantAdmin.roleOwner')
    : role === 'MANAGER' ? locale.t('merchantAdmin.roleManager')
    : role === 'CLERK' ? locale.t('merchantAdmin.roleClerk') : (locale.t(key) || role);
}
function staffStatusText(status: string) {
  return status === 'DISABLED' ? locale.t('merchantAdmin.staffDisabled') : locale.t('merchantAdmin.staffActive');
}
function staffUserName(userId: string) {
  const c = staffCandidates.value.find((x) => String(x.administratorId) === String(userId));
  return c?.displayName || c?.phone || `#${userId}`;
}

// ---- 认领 ----
const showClaim = ref(false);
const claimChannelIdx = ref(0);
const claimRole = ref('OWNER');
const channelLabels = computed(() => channels.value.map((c) => `${c.name} #${c.tenantNo ?? c.code ?? ''}`));
const channelLabel = computed(() => channelLabels.value[claimChannelIdx.value] || locale.t('merchantAdmin.selectChannel'));
function channelName(cid: string) {
  return channels.value.find((c) => String(c.id) === String(cid))?.name || `#${cid}`;
}

function toNumber(v: string): number | undefined {
  const n = Number(v);
  return v !== '' && Number.isFinite(n) ? n : undefined;
}
function yuanToCents(v: string): number | undefined {
  const n = toNumber(v);
  return n == null ? undefined : Math.round(n * 100);
}
function centsToYuan(v?: number | null): string {
  return v != null ? String(v / 100) : '';
}

async function loadMerchants() {
  try {
    merchants.value = (await fetchMerchants({ take: 200 })).items;
  } catch { /* 降级 */ }
}
function onMerchantChange(e: any) {
  const m = merchants.value[Number(e.detail.value)];
  if (m) merchantId.value = m.id;
}

onLoad(async (query: any) => {
  if (query?.id) id.value = query.id;
  await loadMerchants();
  if (query?.merchantId) merchantId.value = query.merchantId;
  if (id.value) {
    const s = await fetchMerchantStore(id.value);
    if (s) {
      merchantId.value = s.merchantId;
      form.value = {
        code: s.code, name: s.name, storeType: s.storeType, status: s.status,
        sortOrder: String(s.sortOrder ?? 0), weight: String(s.weight ?? 0),
        phoneNumber: s.phoneNumber || '', backupPhone: s.backupPhone || '', servicePhone: s.servicePhone || '',
        managerName: s.managerName || '', managerPhone: s.managerPhone || '',
        province: s.province || '', city: s.city || '', cityCode: s.cityCode || '', district: s.district || '',
        street: s.street || '', addressLine: s.addressLine || '', detail: s.detail || '',
        postalCode: s.postalCode || '', navigationAddress: s.navigationAddress || '',
        lat: s.lat != null ? String(s.lat) : '', lng: s.lng != null ? String(s.lng) : '',
        businessHours: s.businessHours || '', businessHoursText: s.businessHoursText || '',
        tags: (s.tags || []).join(','), facilities: (s.facilities || []).join(','),
        externalIds: s.externalIds || '', notice: s.notice || '',
        acceptingOrders: s.acceptingOrders !== false, enabled: s.enabled !== false, isPublic: s.isPublic || false,
        supportsRedemption: s.supportsRedemption !== false, redemptionHours: s.redemptionHours || '',
        dailyRedeemLimit: s.dailyRedeemLimit != null ? String(s.dailyRedeemLimit) : '',
        requiresReservation: s.requiresReservation || false, reservationPhone: s.reservationPhone || '',
        supportsDelivery: s.supportsDelivery || false,
        deliveryRadiusKm: s.deliveryRadiusKm != null ? String(s.deliveryRadiusKm) : '',
        deliveryFee: centsToYuan(s.deliveryFee), minOrderAmount: centsToYuan(s.minOrderAmount),
        deliveryMinutes: s.deliveryMinutes != null ? String(s.deliveryMinutes) : '',
      };
      cover.value = s.coverImage ? [s.coverImage] : [];
      photos.value = Array.isArray(s.photos) ? s.photos : [];
      loadStaff();
      loadPickups();
    }
  }
  if (auth.isSuperAdmin) await loadClaims();
  else await loadStaffCandidates();
});

async function loadClaims() {
  try {
    channels.value = (await fetchTenants()).items;
  } catch { /* 非超管时 tenants 不可读，认领区块也不展示 */ }
  if (id.value) {
    try { claims.value = await fetchStoreClaims(id.value); } catch { claims.value = []; }
  }
  await loadStaffCandidates();
}

async function loadStaff() {
  if (!id.value) return;
  try { staff.value = await fetchStoreStaff(id.value); } catch { staff.value = []; }
}
/** 关联自提点：服务端按 merchantStoreId 过滤，避免受列表条数限制 */
async function loadPickups() {
  if (!id.value) return;
  try {
    pickups.value = await fetchPickupLocationsByStore(id.value);
  } catch { pickups.value = []; }
}
function onAddPickup() {
  uni.navigateTo({ url: `/pages/pickup/edit/index?merchantStoreId=${id.value}` });
}
function onOpenPickup(p: PickupLocationItem) {
  uni.navigateTo({ url: `/pages/pickup/edit/index?id=${p.id}` });
}
async function loadStaffCandidates() {
  try {
    if (auth.isSuperAdmin) {
      const cid = claims.value[0]?.channelId;
      staffCandidates.value = cid ? await fetchTenantAdministrators(String(cid)) : [];
    } else {
      staffCandidates.value = await fetchMyTenantMembers();
    }
  } catch { staffCandidates.value = []; }
}
function onAddStaff() {
  staffEditing.value = false;
  staffCandidateIdx.value = 0;
  const first = staffCandidates.value[0];
  staffForm.value = {
    userId: first ? String(first.administratorId) : '',
    name: first?.displayName || '',
    phone: first?.phone || '',
    role: 'CLERK',
    status: 'ACTIVE',
  };
  showStaff.value = true;
}
function onStaffCandidateChange(e: any) {
  const idx = Number(e.detail.value);
  const c = staffCandidates.value[idx];
  if (!c) return;
  staffCandidateIdx.value = idx;
  staffForm.value.userId = String(c.administratorId);
  staffForm.value.name = c.displayName || '';
  staffForm.value.phone = c.phone || '';
}
function onEditStaff(st: MerchantStoreStaffItem) {
  staffEditing.value = true;
  staffForm.value = {
    userId: String(st.userId),
    name: st.name || '',
    phone: st.phone || '',
    role: st.role,
    status: st.status,
  };
  showStaff.value = true;
}
async function submitStaff() {
  if (!id.value) return;
  if (!staffForm.value.userId) {
    uni.showToast({ title: locale.t('merchantAdmin.selectStaffUser'), icon: 'none' });
    return;
  }
  try {
    const f = staffForm.value;
    await upsertStoreStaff({
      storeId: id.value,
      userId: f.userId,
      name: f.name.trim() || undefined,
      phone: f.phone.trim() || undefined,
      role: f.role,
      status: f.status,
    });
    showStaff.value = false;
    await loadStaff();
    uni.showToast({ title: locale.t('merchantAdmin.saved'), icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.staffSaveFailed')), icon: 'none' });
  }
}
function onAddClaim() {
  claimChannelIdx.value = 0;
  claimRole.value = 'OWNER';
  showClaim.value = true;
}
async function submitClaim() {
  const ch = channels.value[claimChannelIdx.value];
  if (!ch || !id.value) return;
  try {
    await claimStore({ storeId: id.value, channelId: String(ch.id), role: claimRole.value });
    showClaim.value = false;
    await loadClaims();
    uni.showToast({ title: locale.t('merchantAdmin.claimed'), icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.claimFailed')), icon: 'none' });
  }
}
function onRevoke(c: MerchantStoreClaimItem) {
  uni.showModal({
    title: locale.t('merchantAdmin.revoke'),
    content: locale.t('merchantAdmin.revokeConfirm').replace('{name}', channelName(c.channelId)),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await revokeStoreClaim(c.storeId, c.channelId);
        await loadClaims();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.claimFailed')), icon: 'none' });
      }
    },
  });
}

// ---- 地图选点 ----
const mapVisible = ref(false);
const mapBusy = ref(false);
const mapErr = ref('');
const mapPicked = ref<{ lat: number; lng: number } | null>(null);
let amapMap: any = null;

function loadAmap(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w: any = typeof window !== 'undefined' ? window : undefined;
    if (w?.AMap) return resolve(w.AMap);
    fetchMapSdkConfig().then((cfg) => {
      if (!cfg.hasConfigured || !cfg.sdkUrl) {
        mapErr.value = locale.t('merchantAdmin.mapNotConfigured');
        reject(new Error('MAP_NOT_CONFIGURED'));
        return;
      }
      const s = document.createElement('script');
      s.src = cfg.sdkUrl;
      s.onload = () => resolve(w.AMap);
      s.onerror = () => reject(new Error('MAP_SDK_FAILED'));
      document.head.appendChild(s);
    }).catch(reject);
  });
}
async function openMapPicker() {
  mapBusy.value = true;
  mapErr.value = '';
  try {
    const AMap = await loadAmap();
    mapVisible.value = true;
    await new Promise((r) => setTimeout(r, 80));
    const center = form.value.lat && form.value.lng
      ? { lat: Number(form.value.lat), lng: Number(form.value.lng) }
      : { lat: 34.5, lng: 109.7 };
    amapMap = new AMap.Map('amapContainer', { zoom: form.value.lat ? 14 : 4, center: [center.lng, center.lat] });
    mapPicked.value = null;
    amapMap.on('click', (e: any) => {
      const lng = e.lnglat.getLng();
      const lat = e.lnglat.getLat();
      mapPicked.value = { lat, lng };
      form.value.lat = lat.toFixed(6);
      form.value.lng = lng.toFixed(6);
      fillAddress(lat, lng);
    });
  } catch (e: any) {
    if (!mapErr.value) mapErr.value = e?.message || locale.t('merchantAdmin.mapPickFailed');
  } finally {
    mapBusy.value = false;
  }
}
async function fillAddress(lat: number, lng: number) {
  try {
    const r = await reverseGeocode(lat, lng);
    if (!r) return;
    if (r.province) form.value.province = r.province;
    if (r.city) form.value.city = r.city;
    if (r.district) form.value.district = r.district;
    if (r.formattedAddress) form.value.addressLine = r.formattedAddress;
  } catch { /* 逆编码失败不阻断 */ }
}
function closeMap() {
  mapVisible.value = false;
  if (amapMap) { amapMap.destroy(); amapMap = null; }
}

function buildInput() {
  const f = form.value;
  return {
    merchantId: merchantId.value,
    code: f.code.trim(),
    name: f.name.trim(),
    storeType: f.storeType,
    status: f.status,
    sortOrder: Number(f.sortOrder) || 0,
    weight: Number(f.weight) || 0,
    phoneNumber: f.phoneNumber.trim() || undefined,
    backupPhone: f.backupPhone.trim() || undefined,
    servicePhone: f.servicePhone.trim() || undefined,
    managerName: f.managerName.trim() || undefined,
    managerPhone: f.managerPhone.trim() || undefined,
    province: f.province.trim() || undefined,
    city: f.city.trim() || undefined,
    cityCode: f.cityCode.trim() || undefined,
    district: f.district.trim() || undefined,
    street: f.street.trim() || undefined,
    addressLine: f.addressLine.trim() || undefined,
    detail: f.detail.trim() || undefined,
    postalCode: f.postalCode.trim() || undefined,
    navigationAddress: f.navigationAddress.trim() || undefined,
    lat: toNumber(f.lat),
    lng: toNumber(f.lng),
    businessHours: f.businessHours.trim() || undefined,
    businessHoursText: f.businessHoursText.trim() || undefined,
    tags: f.tags.trim() ? f.tags.split(/[,，\s]+/).filter(Boolean) : undefined,
    facilities: f.facilities.trim() ? f.facilities.split(/[,，\s]+/).filter(Boolean) : undefined,
    externalIds: f.externalIds.trim() || undefined,
    notice: f.notice.trim() || undefined,
    coverImage: cover.value[0] || undefined,
    photos: photos.value.length ? photos.value : undefined,
    acceptingOrders: f.acceptingOrders,
    enabled: f.enabled,
    isPublic: f.isPublic,
    supportsRedemption: f.supportsRedemption,
    redemptionHours: f.redemptionHours.trim() || undefined,
    dailyRedeemLimit: toNumber(f.dailyRedeemLimit),
    requiresReservation: f.requiresReservation,
    reservationPhone: f.reservationPhone.trim() || undefined,
    supportsDelivery: f.supportsDelivery,
    deliveryRadiusKm: toNumber(f.deliveryRadiusKm),
    deliveryFee: yuanToCents(f.deliveryFee),
    minOrderAmount: yuanToCents(f.minOrderAmount),
    deliveryMinutes: toNumber(f.deliveryMinutes),
  };
}

function isJsonValid(v: string): boolean {
  if (!v.trim()) return true;
  try { JSON.parse(v); return true; } catch { return false; }
}

async function onSave() {
  if (!merchantId.value) { uni.showToast({ title: locale.t('merchantAdmin.requireMerchant'), icon: 'none' }); return; }
  if (!form.value.code.trim()) { uni.showToast({ title: locale.t('merchantAdmin.requireStoreCode'), icon: 'none' }); return; }
  if (!form.value.name.trim()) { uni.showToast({ title: locale.t('merchantAdmin.requireStoreName'), icon: 'none' }); return; }
  if (!isJsonValid(form.value.businessHours) || !isJsonValid(form.value.externalIds)) {
    uni.showToast({ title: locale.t('merchantAdmin.jsonInvalid'), icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const input = buildInput();
    if (id.value) await updateMerchantStore({ ...input, id: id.value });
    else await createMerchantStore(input);
    uni.showToast({ title: locale.t('merchantAdmin.saved'), icon: 'none' });
    setTimeout(goBack, 400);
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
function goBack() { backToHome(); }
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 180rpx; }
.card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 18rpx; }
.section { display: block; font-size: 26rpx; font-weight: 600; color: $wa-ink; margin-bottom: 12rpx; }
.field { padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
  &:last-child { border-bottom: none; }
  &.row { display: flex; align-items: center; justify-content: space-between; }
  .label { font-size: 24rpx; color: $wa-muted; margin-bottom: 10rpx; }
  &.row .label { margin-bottom: 0; }
  .req { color: #e64340; }
  .ipt { height: 66rpx; background: $wa-bg; border-radius: 12rpx; padding: 0 18rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
  .pick { display: flex; align-items: center; justify-content: space-between; line-height: 66rpx; }
  .two { display: flex; .half { flex: 1; &:first-child { margin-right: 12rpx; } } }
  .area { width: 100%; min-height: 140rpx; background: $wa-bg; border-radius: 12rpx; padding: 14rpx 18rpx; font-size: 26rpx; box-sizing: border-box;
    &.code { font-family: monospace; font-size: 24rpx; }
  }
  .mapbtn { margin-top: 12rpx; display: inline-flex; align-items: center; background: #eef4ff; color: #2563eb; font-size: 24rpx; border-radius: 12rpx; padding: 12rpx 20rpx;
    text { margin-right: 8rpx; }
  }
  .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; &.err { color: #e64340; } }
}
.claim-head { display: flex; align-items: center; justify-content: space-between; }
.link { color: $wa-accent; font-size: 26rpx; }
.claim { display: flex; align-items: center; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid $wa-rule;
  .claim-name { font-size: 26rpx; color: $wa-ink; }
  .claim-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
  .revoke { color: #e64340; font-size: 24rpx; }
  .edit { color: $wa-accent; font-size: 24rpx; }
}
.ops { position: fixed; left: 0; right: 0; bottom: 0; display: flex; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: $wa-card; border-top: 1rpx solid $wa-rule;
  .btn { flex: 1; height: 76rpx; line-height: 76rpx; font-size: 28rpx; border-radius: $wa-radius; margin: 0;
    &.ghost { background: $wa-bg; color: $wa-ink; margin-right: 16rpx; }
    &.main { background: $wa-accent; color: #fff; }
  }
}
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.pop { width: 620rpx; background: $wa-card; border-radius: 20rpx; padding: 28rpx;
  .pop-title { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 12rpx; }
  .actions { display: flex; margin-top: 20rpx; }
  .btn { flex: 1; height: 72rpx; line-height: 72rpx; font-size: 26rpx; border-radius: $wa-radius; margin: 0;
    &.ghost { background: $wa-bg; color: $wa-ink; margin-right: 16rpx; }
    &.main { background: $wa-accent; color: #fff; }
  }
}
.sheet-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 100; display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 82vh; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); box-sizing: border-box; display: flex; flex-direction: column; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
  .st { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
  .done { font-size: 26rpx; color: $wa-accent; }
}
.map-sheet .amap { flex: 1; min-height: 60vh; border-radius: 16rpx; overflow: hidden; }
.map-pos { display: block; margin-top: 10rpx; font-size: 24rpx; color: $wa-muted; text-align: center; }
</style>
