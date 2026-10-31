<template>
  <view class="page">
    <view class="toolbar">
      <input class="search" v-model="keyword" :placeholder="$t('merchantAdmin.storeSearchPh')" confirm-type="search" @confirm="load()" />
      <button class="add" @tap="onCreate">＋ {{ $t('merchantAdmin.createStore') }}</button>
    </view>
    <view class="filters">
      <picker :range="merchantLabels" @change="onMerchantChange">
        <view class="pick">{{ merchantLabel }}</view>
      </picker>
      <picker :range="cityLabels" @change="onCityChange">
        <view class="pick">{{ cityLabel }}</view>
      </picker>
      <picker :range="statusLabels" @change="onStatusChange">
        <view class="pick">{{ statusLabel }}</view>
      </picker>
    </view>

    <view class="card" v-for="s in items" :key="s.id" @tap="onEdit(s)">
      <view class="head">
        <text class="name">{{ s.name }}</text>
        <text class="badge" :class="s.status.toLowerCase()">{{ statusText(s.status) }}</text>
        <text v-if="!s.enabled" class="badge off">{{ $t('merchantAdmin.storeDisabled') }}</text>
        <text v-if="s.isPublic" class="badge pub">{{ $t('merchantAdmin.storePublic') }}</text>
      </view>
      <text class="code">{{ s.code }} · {{ merchantName(s.merchantId) }}</text>
      <text v-if="s.addressLine" class="line">{{ s.addressLine }}</text>
      <text v-if="s.tags && s.tags.length" class="line">{{ s.tags.join(' · ') }}</text>
      <view class="meta">
        <text v-if="s.phoneNumber" class="pm">☎ {{ s.phoneNumber }}</text>
        <text v-if="s.businessHoursText" class="pm">🕘 {{ s.businessHoursText }}</text>
        <text v-if="s.lat != null && s.lng != null" class="pm">📍 {{ s.lat }}, {{ s.lng }}</text>
        <text v-else class="pm warn">{{ $t('merchantAdmin.missingCoords') }}</text>
      </view>
      <view class="ops" @tap.stop>
        <text @tap="onEdit(s)">{{ $t('merchantAdmin.edit') }}</text>
        <text @tap="onToggle(s)">{{ s.enabled ? $t('merchantAdmin.disable') : $t('merchantAdmin.enable') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('merchantAdmin.storeEmpty') }}</view>
    <text v-if="total > items.length" class="more" @tap="load(true)">{{ $t('merchantAdmin.loadMore') }}</text>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  fetchMerchantStores, fetchMerchants, updateMerchantStore, type MerchantItem, type MerchantStoreItem,
} from '../../../apis/merchant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const items = ref<MerchantStoreItem[]>([]);
const merchants = ref<MerchantItem[]>([]);
const total = ref(0);
const keyword = ref('');
const merchantId = ref('');
const cityFilter = ref('');
const cities = ref<string[]>([]);
const statusFilter = ref('');
const loading = ref(false);

const STATUS_KEYS = ['', 'OPEN', 'CLOSED', 'SUSPENDED'];
const statusLabels = computed(() => STATUS_KEYS.map((s) => (s ? statusText(s) : locale.t('merchantAdmin.allStatus'))));
const statusLabel = computed(() => (statusFilter.value ? statusText(statusFilter.value) : locale.t('merchantAdmin.allStatus')));
const merchantLabels = computed(() => [locale.t('merchantAdmin.allMerchants'), ...merchants.value.map((m) => m.name)]);
const merchantLabel = computed(() => {
  const m = merchants.value.find((x) => x.id === merchantId.value);
  return m ? m.name : locale.t('merchantAdmin.allMerchants');
});
const cityLabels = computed(() => [locale.t('merchantAdmin.allCities'), ...cities.value]);
const cityLabel = computed(() => cityFilter.value || locale.t('merchantAdmin.allCities'));

function statusText(s: string) {
  return locale.t(`merchantAdmin.storeStatus${s.charAt(0)}${s.slice(1).toLowerCase()}`) || s;
}
function merchantName(id: string) {
  return merchants.value.find((m) => m.id === id)?.name || id;
}
function onMerchantChange(e: any) {
  merchantId.value = e.detail.value === 0 ? '' : merchants.value[e.detail.value - 1]?.id || '';
  load();
}
function onStatusChange(e: any) {
  statusFilter.value = STATUS_KEYS[e.detail.value] || '';
  load();
}
function onCityChange(e: any) {
  cityFilter.value = e.detail.value === 0 ? '' : cities.value[e.detail.value - 1] || '';
  load();
}

async function ensureMerchants() {
  if (merchants.value.length) return;
  try {
    merchants.value = (await fetchMerchants({ take: 200 })).items;
  } catch { /* 选择器降级为空列表，不影响列表 */ }
}

async function ensureCities() {
  if (cities.value.length) return;
  try {
    const res = await fetchMerchantStores({ take: 500 });
    cities.value = [...new Set(res.items.map((s) => s.city).filter((c): c is string => !!c))].sort();
  } catch { /* 城市选择器降级为空 */ }
}

async function load(append = false) {
  loading.value = true;
  try {
    const skip = append ? items.value.length : 0;
    const res = await fetchMerchantStores({
      skip, take: 50, keyword: keyword.value.trim() || undefined,
      merchantId: merchantId.value || undefined, city: cityFilter.value || undefined,
      status: statusFilter.value || undefined,
    });
    items.value = append ? [...items.value, ...res.items] : res.items;
    total.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onLoad((query: any) => {
  if (query?.merchantId) merchantId.value = query.merchantId;
  Promise.all([ensureMerchants(), ensureCities()]).then(() => load());
});
let firstShow = true;
onShow(() => {
  if (firstShow) { firstShow = false; return; }
  load();
});

function onCreate() {
  const q = merchantId.value ? `?merchantId=${merchantId.value}` : '';
  uni.navigateTo({ url: `/pages/platform/stores/detail${q}` });
}
function onEdit(s: MerchantStoreItem) { uni.navigateTo({ url: `/pages/platform/stores/detail?id=${s.id}` }); }

function onToggle(s: MerchantStoreItem) {
  const action = s.enabled ? locale.t('merchantAdmin.disable') : locale.t('merchantAdmin.enable');
  uni.showModal({
    title: locale.t('merchantAdmin.confirm'),
    content: locale.t('merchantAdmin.storeToggleConfirm').replace('{action}', action).replace('{name}', s.name),
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await updateMerchantStore({ id: s.id, enabled: !s.enabled });
        s.enabled = !s.enabled;
        uni.showToast({ title: locale.t('merchantAdmin.saved'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.saveFailed')), icon: 'none' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 120rpx; }
.toolbar { display: flex; align-items: center; margin-bottom: 16rpx;
  .search { flex: 1; height: 68rpx; background: $wa-card; border-radius: $wa-radius; padding: 0 20rpx; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
  .add { width: 220rpx; height: 68rpx; line-height: 68rpx; background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius; margin: 0; }
}
.filters { display: flex; margin-bottom: 20rpx;
  picker { flex: 1; &:first-child { margin-right: 12rpx; } }
  .pick { height: 64rpx; line-height: 64rpx; background: $wa-card; border-radius: $wa-radius; padding: 0 18rpx; font-size: 24rpx; color: $wa-muted; }
}
.card { background: $wa-card; border-radius: $wa-radius; padding: 26rpx 28rpx; margin-bottom: 18rpx;
  .head { display: flex; align-items: center; flex-wrap: wrap;
    .name { font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-right: 12rpx; }
    .badge { font-size: 20rpx; color: #fff; border-radius: 14rpx; padding: 2rpx 12rpx; margin-right: 8rpx;
      &.open { background: #0a9c6e; }
      &.closed { background: #999; }
      &.suspended { background: #f0821f; }
      &.off { background: #bbb; }
      &.pub { background: #2563eb; }
    }
  }
  .code { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
  .line { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
  .meta { margin-top: 8rpx; display: flex; flex-wrap: wrap;
    .pm { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx;
      &.warn { color: #e64340; }
    }
  }
  .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
    text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx; }
  }
}
.empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }
.more { display: block; text-align: center; color: $wa-accent; font-size: 26rpx; padding: 20rpx 0; }
</style>
