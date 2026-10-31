<template>
  <view class="page">
    <view class="toolbar">
      <input class="search" v-model="keyword" :placeholder="$t('merchantAdmin.searchPh')" confirm-type="search" @confirm="load()" />
      <button class="add" @tap="onCreate">＋ {{ $t('merchantAdmin.create') }}</button>
    </view>
    <view class="filters">
      <picker :range="statusLabels" @change="onStatusChange">
        <view class="pick">{{ statusLabel }}</view>
      </picker>
      <picker :range="claimLabels" @change="onClaimChange">
        <view class="pick">{{ claimLabel }}</view>
      </picker>
    </view>

    <view class="card" v-for="m in items" :key="m.id" @tap="onEdit(m)">
      <view class="head">
        <text class="name">{{ m.name }}</text>
        <text class="badge" :class="m.status.toLowerCase()">{{ statusText(m.status) }}</text>
        <text class="badge claim" :class="m.claimStatus.toLowerCase()">{{ claimText(m.claimStatus) }}</text>
      </view>
      <text class="code">{{ m.code }}<text v-if="m.shortName"> · {{ m.shortName }}</text><text v-if="storeCounts[m.id] != null"> · {{ storeCounts[m.id] }} {{ $t('merchantAdmin.storeCountUnit') }}</text></text>
      <text v-if="m.industry || m.category" class="line">{{ [m.industry, m.category].filter(Boolean).join(' · ') }}</text>
      <text v-if="m.legalName" class="line">{{ $t('merchantAdmin.legalName') }}：{{ m.legalName }}</text>
      <text v-if="m.contactPhone" class="line">{{ $t('merchantAdmin.contactPhone') }}：{{ m.contactPhone }}</text>
      <text v-if="m.address" class="line">{{ m.address }}</text>
      <view class="ops" @tap.stop>
        <text @tap="onEdit(m)">{{ $t('merchantAdmin.edit') }}</text>
        <text @tap="onStores(m)">{{ $t('merchantAdmin.viewStores') }}</text>
        <text class="warn" v-if="m.status === 'ACTIVE'" @tap="onToggle(m)">{{ $t('merchantAdmin.suspend') }}</text>
        <text v-else @tap="onToggle(m)">{{ $t('merchantAdmin.activate') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('merchantAdmin.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('merchantAdmin.loading') }}</view>
    <text v-if="total > items.length" class="more" @tap="loadMore">{{ $t('merchantAdmin.loadMore') }}</text>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchMerchantStores, fetchMerchants, updateMerchant, type MerchantItem } from '../../../apis/merchant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const items = ref<MerchantItem[]>([]);
const total = ref(0);
const keyword = ref('');
const statusFilter = ref('');
const claimFilter = ref('');
const loading = ref(false);
const storeCounts = ref<Record<string, number>>({});

const STATUS_KEYS = ['', 'ACTIVE', 'SUSPENDED', 'CLOSED'];
const statusLabels = computed(() => STATUS_KEYS.map((s) => (s ? statusText(s) : locale.t('merchantAdmin.allStatus'))));
const statusLabel = computed(() => (statusFilter.value ? statusText(statusFilter.value) : locale.t('merchantAdmin.allStatus')));
const claimKeys = ['', 'CLAIMED', 'UNCLAIMED'];
const claimLabels = computed(() => claimKeys.map((s) => (s ? claimText(s) : locale.t('merchantAdmin.allClaimStatus'))));
const claimLabel = computed(() => (claimFilter.value ? claimText(claimFilter.value) : locale.t('merchantAdmin.allClaimStatus')));

function statusText(s: string) {
  const key = `merchantAdmin.status${s.charAt(0)}${s.slice(1).toLowerCase()}`;
  return locale.t(key) || s;
}
function claimText(s: string) {
  const key = `merchantAdmin.claim${s.charAt(0)}${s.slice(1).toLowerCase()}`;
  return locale.t(key) || s;
}
function onStatusChange(e: any) {
  statusFilter.value = STATUS_KEYS[e.detail.value] || '';
  load();
}
function onClaimChange(e: any) {
  claimFilter.value = claimKeys[e.detail.value] || '';
  load();
}

async function loadStoreCounts() {
  try {
    const res = await fetchMerchantStores({ take: 500 });
    const map: Record<string, number> = {};
    for (const s of res.items) map[s.merchantId] = (map[s.merchantId] || 0) + 1;
    storeCounts.value = map;
  } catch { /* 门店数量仅作展示，失败忽略 */ }
}

async function load(append = false) {
  loading.value = true;
  if (!append) loadStoreCounts();
  try {
    const skip = append ? items.value.length : 0;
    const res = await fetchMerchants({
      skip, take: 50,
      keyword: keyword.value.trim() || undefined,
      status: statusFilter.value || undefined,
      claimStatus: claimFilter.value || undefined,
    });
    items.value = append ? [...items.value, ...res.items] : res.items;
    total.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('merchantAdmin.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}
function loadMore() { load(true); }

onShow(() => { load(); });

function onCreate() { uni.navigateTo({ url: '/pages/platform/merchants/detail' }); }
function onEdit(m: MerchantItem) { uni.navigateTo({ url: `/pages/platform/merchants/detail?id=${m.id}` }); }
function onStores(m: MerchantItem) { uni.navigateTo({ url: `/pages/platform/stores/index?merchantId=${m.id}` }); }

function onToggle(m: MerchantItem) {
  const next = m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  uni.showModal({
    title: locale.t(next === 'ACTIVE' ? 'merchantAdmin.activate' : 'merchantAdmin.suspend'),
    content: locale.t('merchantAdmin.toggleConfirm').replace('{name}', m.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await updateMerchant({ id: m.id, status: next });
        m.status = next;
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
.toolbar { display: flex; align-items: center; margin-bottom: 20rpx;
  .search { flex: 1; height: 68rpx; background: $wa-card; border-radius: $wa-radius; padding: 0 20rpx; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
  .pick { height: 68rpx; line-height: 68rpx; background: $wa-card; border-radius: $wa-radius; padding: 0 18rpx; font-size: 24rpx; color: $wa-muted; margin-right: 12rpx; }
  .add { width: 180rpx; height: 68rpx; line-height: 68rpx; background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius; margin: 0; }
}
.filters { display: flex; margin-bottom: 20rpx;
  picker { flex: 1; &:first-child { margin-right: 12rpx; } }
  .pick { height: 64rpx; line-height: 64rpx; background: $wa-card; border-radius: $wa-radius; padding: 0 18rpx; font-size: 24rpx; color: $wa-muted; }
}
.card { background: $wa-card; border-radius: $wa-radius; padding: 26rpx 28rpx; margin-bottom: 18rpx;
  .head { display: flex; align-items: center; flex-wrap: wrap;
    .name { font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-right: 12rpx; }
    .badge { font-size: 20rpx; color: #fff; border-radius: 14rpx; padding: 2rpx 12rpx; margin-right: 8rpx;
      &.active { background: #0a9c6e; }
      &.suspended { background: #f0821f; }
      &.closed { background: #999; }
      &.claim { background: #7c3aed; }
      &.unclaimed { background: #bbb; }
      &.revoked { background: #e64340; }
    }
  }
  .code { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
  .line { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
  .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule; display: flex; flex-wrap: wrap;
    text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
      &.warn { color: #e64340; }
    }
  }
}
.empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }
.more { display: block; text-align: center; color: $wa-accent; font-size: 26rpx; padding: 20rpx 0; }
</style>
