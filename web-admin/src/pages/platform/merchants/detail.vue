<template>
  <view class="page">
    <view class="card">
      <text class="section">{{ $t('merchantAdmin.basic') }}</text>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.code') }} <text class="req">*</text></text>
        <input class="ipt" v-model="form.code" :disabled="!!id" :placeholder="$t('merchantAdmin.codePh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.name') }} <text class="req">*</text></text>
        <input class="ipt" v-model="form.name" :placeholder="$t('merchantAdmin.namePh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.shortName') }}</text>
        <input class="ipt" v-model="form.shortName" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.brand') }}</text>
        <input class="ipt" v-model="form.brand" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.industry') }}</text>
        <input class="ipt" v-model="form.industry" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.category') }}</text>
        <input class="ipt" v-model="form.category" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.merchantType') }}</text>
        <picker :range="typeLabels" @change="form.merchantType = typeKeys[$event.detail.value]">
          <view class="ipt pick">{{ form.merchantType }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.status') }}</text>
        <picker :range="statusLabels" @change="form.status = statusKeys[$event.detail.value]">
          <view class="ipt pick">{{ form.status }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.tags') }}</text>
        <input class="ipt" v-model="form.tags" :placeholder="$t('merchantAdmin.tagsPh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.logo') }}</text>
        <MediaUrlField :model-value="logo" :max="1" @update:model-value="logo = $event" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.intro') }}</text>
        <textarea class="area" v-model="form.intro" />
      </view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.license') }}</text>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.legalName') }}</text>
        <input class="ipt" v-model="form.legalName" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.licenseNo') }}</text>
        <input class="ipt" v-model="form.licenseNo" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.licenseExpiry') }}</text>
        <picker mode="date" :value="form.licenseExpiry" @change="form.licenseExpiry = $event.detail.value">
          <view class="ipt pick">{{ form.licenseExpiry || $t('merchantAdmin.pickDate') }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.licenseImage') }}</text>
        <MediaUrlField :model-value="licenseImage" :max="1" @update:model-value="licenseImage = $event" />
      </view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.contact') }}</text>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.contactName') }}</text>
        <input class="ipt" v-model="form.contactName" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.contactPhone') }}</text>
        <input class="ipt" v-model="form.contactPhone" type="number" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.servicePhone') }}</text>
        <input class="ipt" v-model="form.servicePhone" type="number" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.complaintPhone') }}</text>
        <input class="ipt" v-model="form.complaintPhone" type="number" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.email') }}</text>
        <input class="ipt" v-model="form.email" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.wechat') }}</text>
        <input class="ipt" v-model="form.wechat" />
      </view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.address') }}</text>
      <view class="field"><text class="label">{{ $t('merchantAdmin.province') }}</text><input class="ipt" v-model="form.province" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.city') }}</text><input class="ipt" v-model="form.city" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.district') }}</text><input class="ipt" v-model="form.district" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.street') }}</text><input class="ipt" v-model="form.street" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.addressLine') }}</text><input class="ipt" v-model="form.address" /></view>
    </view>

    <view class="card">
      <text class="section">{{ $t('merchantAdmin.cooperation') }}</text>
      <view class="field" v-if="id">
        <text class="label">{{ $t('merchantAdmin.claimStatus') }}</text>
        <text class="ro">{{ form.claimStatus || '—' }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.contractNo') }}</text>
        <input class="ipt" v-model="form.contractNo" />
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.cooperationStart') }}</text>
        <picker mode="date" :value="form.cooperationStart" @change="form.cooperationStart = $event.detail.value">
          <view class="ipt pick">{{ form.cooperationStart || $t('merchantAdmin.pickDate') }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.cooperationEnd') }}</text>
        <picker mode="date" :value="form.cooperationEnd" @change="form.cooperationEnd = $event.detail.value">
          <view class="ipt pick">{{ form.cooperationEnd || $t('merchantAdmin.pickDate') }}<text class="caret">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.commissionRate') }}</text>
        <input class="ipt" v-model="form.commissionRate" type="digit" :placeholder="$t('merchantAdmin.commissionPh')" />
        <text class="tip">{{ $t('merchantAdmin.commissionTip') }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('merchantAdmin.settlementType') }}</text>
        <input class="ipt" v-model="form.settlementType" :placeholder="$t('merchantAdmin.settlementPh')" />
      </view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.bankName') }}</text><input class="ipt" v-model="form.bankName" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.bankAccountName') }}</text><input class="ipt" v-model="form.bankAccountName" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.bankAccountNo') }}</text><input class="ipt" v-model="form.bankAccountNo" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.taxNo') }}</text><input class="ipt" v-model="form.taxNo" /></view>
      <view class="field"><text class="label">{{ $t('merchantAdmin.invoiceTitle') }}</text><input class="ipt" v-model="form.invoiceTitle" /></view>
    </view>

    <view v-if="id" class="card">
      <view class="store-head">
        <text class="section">{{ $t('merchantAdmin.merchantStores') }}<text class="count"> · {{ $t('merchantAdmin.storeTotal').replace('{count}', String(stores.length)) }}</text></text>
        <text class="link" @tap="onAddStore">{{ $t('merchantAdmin.addStore') }}</text>
      </view>
      <view v-for="s in stores" :key="s.id" class="store" @tap="onOpenStore(s)">
        <view class="store-info">
          <text class="store-name">{{ s.name }}</text>
          <text class="store-sub">{{ s.code }}<text v-if="s.addressLine"> · {{ s.addressLine }}</text></text>
        </view>
        <text class="badge" :class="s.status.toLowerCase()">{{ storeStatusText(s.status) }}</text>
      </view>
      <view v-if="!stores.length" class="tip">{{ $t('merchantAdmin.noStores') }}</view>
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
import { createMerchant, fetchMerchant, fetchMerchantStores, updateMerchant, type MerchantStoreItem } from '../../../apis/merchant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';
import MediaUrlField from '../../../components/MediaUrlField.vue';

const locale = useLocaleStore();
const id = ref<string | null>(null);
const saving = ref(false);
const logo = ref<string[]>([]);
const licenseImage = ref<string[]>([]);
const stores = ref<MerchantStoreItem[]>([]);

const typeKeys = ['ENTERPRISE', 'INDIVIDUAL'];
const typeLabels = computed(() => [locale.t('merchantAdmin.typeEnterprise'), locale.t('merchantAdmin.typeIndividual')]);
const statusKeys = ['ACTIVE', 'SUSPENDED', 'CLOSED'];
const statusLabels = computed(() => [
  locale.t('merchantAdmin.statusActive'),
  locale.t('merchantAdmin.statusSuspended'),
  locale.t('merchantAdmin.statusClosed'),
]);

const form = ref({
  code: '', name: '', shortName: '', brand: '', industry: '', category: '',
  merchantType: 'ENTERPRISE', status: 'ACTIVE', tags: '', intro: '',
  legalName: '', licenseNo: '', licenseExpiry: '',
  contactName: '', contactPhone: '', servicePhone: '', complaintPhone: '', email: '', wechat: '',
  province: '', city: '', district: '', street: '', address: '',
  claimStatus: '', contractNo: '', cooperationStart: '', cooperationEnd: '',
  commissionRate: '', settlementType: '', bankName: '', bankAccountName: '', bankAccountNo: '',
  taxNo: '', invoiceTitle: '',
});

onLoad(async (query: any) => {
  if (!query?.id) return;
  id.value = query.id;
  const m = await fetchMerchant(query.id);
  if (!m) return;
  form.value = {
    code: m.code, name: m.name, shortName: m.shortName || '',
    brand: m.brand || '', industry: m.industry || '', category: m.category || '',
    merchantType: m.merchantType,
    status: m.status, tags: (m.tags || []).join(','), intro: m.intro || '',
    legalName: m.legalName || '', licenseNo: m.licenseNo || '', licenseExpiry: toDateText(m.licenseExpiry),
    contactName: m.contactName || '', contactPhone: m.contactPhone || '', servicePhone: m.servicePhone || '',
    complaintPhone: m.complaintPhone || '', email: m.email || '', wechat: m.wechat || '',
    province: m.province || '', city: m.city || '', district: m.district || '', street: m.street || '',
    address: m.address || '', claimStatus: m.claimStatus,
    contractNo: m.contractNo || '', cooperationStart: toDateText(m.cooperationStart),
    cooperationEnd: toDateText(m.cooperationEnd),
    commissionRate: m.commissionRate != null ? String(m.commissionRate / 100) : '',
    settlementType: m.settlementType || '', bankName: m.bankName || '',
    bankAccountName: m.bankAccountName || '', bankAccountNo: m.bankAccountNo || '',
    taxNo: m.taxNo || '', invoiceTitle: m.invoiceTitle || '',
  };
  logo.value = m.logo ? [m.logo] : [];
  licenseImage.value = m.licenseImage ? [m.licenseImage] : [];
  loadMerchantStores();
});

function storeStatusText(s: string) {
  return locale.t(`merchantAdmin.storeStatus${s.charAt(0)}${s.slice(1).toLowerCase()}`) || s;
}
async function loadMerchantStores() {
  if (!id.value) return;
  try {
    stores.value = (await fetchMerchantStores({ merchantId: id.value, take: 100 })).items;
  } catch {
    stores.value = [];
  }
}
function onAddStore() {
  if (!id.value) return;
  uni.navigateTo({ url: `/pages/platform/stores/detail?merchantId=${id.value}` });
}
function onOpenStore(s: MerchantStoreItem) {
  uni.navigateTo({ url: `/pages/platform/stores/detail?id=${s.id}` });
}

function toDateText(v?: string | null): string {
  return v ? String(v).slice(0, 10) : '';
}
function toIso(v: string): string | undefined {
  return v ? new Date(`${v}T00:00:00+08:00`).toISOString() : undefined;
}

function buildInput() {
  const f = form.value;
  const rate = f.commissionRate.trim();
  return {
    code: f.code.trim(),
    name: f.name.trim(),
    shortName: f.shortName.trim() || undefined,
    brand: f.brand.trim() || undefined,
    industry: f.industry.trim() || undefined,
    category: f.category.trim() || undefined,
    merchantType: f.merchantType,
    status: f.status,
    tags: f.tags.trim() ? f.tags.split(/[,，\s]+/).filter(Boolean) : undefined,
    intro: f.intro.trim() || undefined,
    logo: logo.value[0] || undefined,
    legalName: f.legalName.trim() || undefined,
    licenseNo: f.licenseNo.trim() || undefined,
    licenseImage: licenseImage.value[0] || undefined,
    licenseExpiry: toIso(f.licenseExpiry),
    contactName: f.contactName.trim() || undefined,
    contactPhone: f.contactPhone.trim() || undefined,
    servicePhone: f.servicePhone.trim() || undefined,
    complaintPhone: f.complaintPhone.trim() || undefined,
    email: f.email.trim() || undefined,
    wechat: f.wechat.trim() || undefined,
    province: f.province.trim() || undefined,
    city: f.city.trim() || undefined,
    district: f.district.trim() || undefined,
    street: f.street.trim() || undefined,
    address: f.address.trim() || undefined,
    contractNo: f.contractNo.trim() || undefined,
    cooperationStart: toIso(f.cooperationStart),
    cooperationEnd: toIso(f.cooperationEnd),
    commissionRate: rate ? Math.round(Number(rate) * 100) : undefined,
    settlementType: f.settlementType.trim() || undefined,
    bankName: f.bankName.trim() || undefined,
    bankAccountName: f.bankAccountName.trim() || undefined,
    bankAccountNo: f.bankAccountNo.trim() || undefined,
    taxNo: f.taxNo.trim() || undefined,
    invoiceTitle: f.invoiceTitle.trim() || undefined,
  };
}

async function onSave() {
  if (!form.value.code.trim()) { uni.showToast({ title: locale.t('merchantAdmin.requireCode'), icon: 'none' }); return; }
  if (!form.value.name.trim()) { uni.showToast({ title: locale.t('merchantAdmin.requireName'), icon: 'none' }); return; }
  saving.value = true;
  try {
    const input = buildInput();
    if (id.value) await updateMerchant({ ...input, id: id.value });
    else await createMerchant(input);
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
  .label { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 10rpx; }
  .req { color: #e64340; }
  .ipt { height: 66rpx; background: $wa-bg; border-radius: 12rpx; padding: 0 18rpx; font-size: 26rpx; color: $wa-ink; }
  .pick { display: flex; align-items: center; justify-content: space-between; line-height: 66rpx; }
  .caret { color: $wa-muted; }
  .area { width: 100%; min-height: 140rpx; background: $wa-bg; border-radius: 12rpx; padding: 14rpx 18rpx; font-size: 26rpx; box-sizing: border-box; }
  .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
  .ro { font-size: 26rpx; color: $wa-ink; }
}
.store-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
  .section { margin-bottom: 0; }
  .count { font-weight: 400; color: $wa-muted; }
  .link { font-size: 26rpx; color: $wa-accent; }
}
.store { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0; border-bottom: 1rpx solid $wa-rule;
  &:last-child { border-bottom: none; }
  .store-info { flex: 1; min-width: 0; }
  .store-name { display: block; font-size: 27rpx; color: $wa-ink; }
  .store-sub { display: block; margin-top: 4rpx; font-size: 22rpx; color: $wa-muted; }
  .badge { font-size: 20rpx; color: #fff; border-radius: 14rpx; padding: 2rpx 12rpx; margin-left: 12rpx;
    &.open { background: #0a9c6e; }
    &.closed { background: #999; }
    &.suspended { background: #f0821f; }
  }
}
.ops { position: fixed; left: 0; right: 0; bottom: 0; display: flex; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: $wa-card; border-top: 1rpx solid $wa-rule;
  .btn { flex: 1; height: 76rpx; line-height: 76rpx; font-size: 28rpx; border-radius: $wa-radius; margin: 0;
    &.ghost { background: $wa-bg; color: $wa-ink; margin-right: 16rpx; }
    &.main { background: $wa-accent; color: #fff; }
  }
}
</style>
