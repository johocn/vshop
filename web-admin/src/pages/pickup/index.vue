<template>
  <view class="page">
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'mine' }" @tap="switchTab('mine')">{{ $t('pickupPage.tabMine') }}</text>
      <text class="tab" :class="{ on: tab === 'pool' }" @tap="switchTab('pool')">{{ $t('pickupPage.tabPool') }}</text>
    </view>

    <template v-if="tab === 'mine'">
      <view class="filters">
        <input class="search" v-model="keyword" :placeholder="$t('pickupPage.searchPh')" />
        <picker :range="cityLabels" @change="onCityChange('mine', $event)">
          <view class="city">{{ cityText('mine') }}</view>
        </picker>
      </view>
      <view class="toolbar">
        <button class="add" @tap="onCreate">＋ {{ $t('pickupPage.add') }}</button>
      </view>
      <view class="card" v-for="s in filteredItems" :key="s.id">
        <view class="row">
          <view class="info">
            <view class="head">
              <text class="name">{{ s.name }}</text>
              <text class="badge" :class="s.type">{{ typeLabel(s.type) }}</text>
              <text v-if="s.isPublic" class="badge global">{{ $t('pickupPage.badgeGlobal') }}</text>
              <text v-if="!s.enabled" class="badge off">{{ $t('pickupPage.disabled') }}</text>
            </view>
            <text v-if="s.address" class="addr">{{ s.address }}</text>
            <view class="meta">
              <text v-if="s.merchantStoreId && storeNames[s.merchantStoreId]" class="pm">🏬 {{ storeNames[s.merchantStoreId] }}</text>
              <text v-if="s.phoneNumber" class="pm">☎ {{ s.phoneNumber }}</text>
              <text v-if="s.businessHours" class="pm">🕘 {{ s.businessHours }}</text>
            </view>
          </view>
        </view>
        <view class="ops">
          <text v-if="editable(s)" @tap="onEdit(s)">{{ $t('pickupPage.edit') }}</text>
          <text v-if="!s.isPublic" class="setdefault" @tap="onToggle(s)">{{ s.enabled ? $t('pickupPage.disabled') : $t('pickupPage.enable') }}</text>
          <text v-if="!s.isPublic && auth.isSuperAdmin" class="promote" @tap="onPromote(s)">{{ $t('pickupPage.setGlobal') }}</text>
          <text v-if="s.isPublic" class="del" @tap="onRemove(s)">{{ $t('pickupPage.removeFromStore') }}</text>
          <text v-if="!s.isPublic" class="del" @tap="onDel(s)">{{ $t('pickupPage.delete') }}</text>
        </view>
      </view>
      <view v-if="!filteredItems.length" class="empty">{{ items.length ? $t('pickupPage.emptyMatch') : $t('pickupPage.emptyMine') }}</view>
    </template>

    <template v-else>
      <view class="hint">{{ $t('pickupPage.poolHint') }}</view>
      <view class="filters">
        <input class="search" v-model="keyword" :placeholder="$t('pickupPage.searchPh')" />
        <picker :range="cityLabels" @change="onCityChange('pool', $event)">
          <view class="city">{{ cityText('pool') }}</view>
        </picker>
      </view>
      <view class="card" v-for="g in filteredPool" :key="g.id">
        <view class="row">
          <view class="info">
            <view class="head">
              <text class="name">{{ g.name }}</text>
              <text class="badge" :class="g.type">{{ typeLabel(g.type) }}</text>
              <text class="badge global">{{ $t('pickupPage.badgeGlobal') }}</text>
            </view>
            <text v-if="g.address" class="addr">{{ g.address }}</text>
            <view class="meta"><text v-if="g.phoneNumber" class="pm">☎ {{ g.phoneNumber }}</text></view>
          </view>
        </view>
        <view class="ops">
          <text v-if="auth.isSuperAdmin" @tap="onEdit(g)">{{ $t('pickupPage.edit') }}</text>
          <text v-if="!assigned(g.id)" class="copy" @tap="onAssign(g)">{{ $t('pickupPage.assign') }}</text>
          <text v-else class="assigned">{{ $t('pickupPage.assigned') }}</text>
        </view>
      </view>
      <view v-if="!filteredPool.length" class="empty">{{ pool.length ? $t('pickupPage.emptyMatch') : $t('pickupPage.emptyPool') }}</view>
    </template>

    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/authStore';
import { useLocaleStore } from '../../stores/localeStore';
import { fetchPickupLocations, updatePickupLocation, deletePickupLocation, assignToChannel, removeFromChannel, promoteToListPublic, PickupLocationItem } from '../../apis/pickup-location';
import { fetchMerchantStores } from '../../apis/merchant-admin';

const tab = ref<'mine' | 'pool'>('mine');
const items = ref<PickupLocationItem[]>([]);
const pool = ref<PickupLocationItem[]>([]);
const auth = useAuthStore();
const locale = useLocaleStore();
// 关联门店名称映射，用于列表展示（按需一次加载）
const storeNames = ref<Record<string, string>>({});
async function loadStoreNames() {
  if (Object.keys(storeNames.value).length) return;
  try {
    const res = await fetchMerchantStores({ take: 500 });
    storeNames.value = Object.fromEntries(res.items.map((s) => [String(s.id), s.name]));
  } catch { /* 门店列表不可用时仅隐藏门店名 */ }
}

const TYPE_LABEL: Record<string, string> = { store: 'pickupPage.typeStore', point: 'pickupPage.typePoint', employee: 'pickupPage.typeEmployee' };
const typeLabel = (t: string) => (TYPE_LABEL[t] ? locale.t(TYPE_LABEL[t]) : t);
const assigned = (id: string) => items.value.some((s) => s.id === id);
// 全局点租户只读：可编辑的仅自身租户级点，或超管编辑全局点
const editable = (s: PickupLocationItem) => !s.isPublic || auth.isSuperAdmin;

// ---- 列表筛选（对已加载数据做前端过滤）：关键字 + 城市 ----
const keyword = ref('');
// 存城市名而非索引：列表增删后索引会指向另一个城市，存值可避免筛选结果漂移
const cityFilter = ref({ mine: '', pool: '' });
const cityLabels = computed(() => {
  const set = new Set<string>();
  for (const s of [...items.value, ...pool.value]) {
    const c = (s.city || '').trim();
    if (c) set.add(c);
  }
  return [locale.t('pickupPage.allCities'), ...[...set].sort()];
});
function onCityChange(scope: 'mine' | 'pool', e: any) {
  const index = Number(e.detail.value) || 0;
  cityFilter.value[scope] = index > 0 ? cityLabels.value[index] ?? '' : '';
}
function cityText(scope: 'mine' | 'pool') {
  return cityFilter.value[scope] || locale.t('pickupPage.allCities');
}
function filterList(list: PickupLocationItem[], scope: 'mine' | 'pool'): PickupLocationItem[] {
  const kw = keyword.value.trim().toLowerCase();
  const city = cityFilter.value[scope];
  return list.filter((s) => {
    if (city && (s.city || '').trim() !== city) return false;
    if (!kw) return true;
    return [s.name, s.address, s.city, s.district, s.street, s.contactPerson, s.phoneNumber]
      .some((v) => String(v || '').toLowerCase().includes(kw));
  });
}
const filteredItems = computed(() => filterList(items.value, 'mine'));
const filteredPool = computed(() => filterList(pool.value, 'pool'));

async function reload() {
  items.value = await fetchPickupLocations();
  await loadStoreNames();
}
async function switchTab(t: 'mine' | 'pool') {
  tab.value = t;
  if (t === 'mine') await reload();
  if (t === 'pool') pool.value = await fetchPickupLocations(true);
}
// 新建/编辑自提点返回本页时自动刷新（本店列表 + 全局池）；uni-app 首次显示也触发 onShow，用标记跳过首载避免双请求
let pickupListShown = false;
onShow(() => {
  if (!pickupListShown) { pickupListShown = true; return; }
  reload();
  fetchPickupLocations(true).then((p) => { pool.value = p; });
});
onMounted(async () => { await reload(); pool.value = await fetchPickupLocations(true); });

function onCreate() { uni.navigateTo({ url: '/pages/pickup/edit/index' }); }
function onEdit(s: PickupLocationItem) { uni.navigateTo({ url: `/pages/pickup/edit/index?id=${s.id}` }); }

async function onToggle(s: PickupLocationItem) {
  try { await updatePickupLocation({ id: s.id, enabled: !s.enabled }); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || locale.t('pickupPage.opFailed'), icon: 'none' }); }
}

function onPromote(s: PickupLocationItem) {
  uni.showModal({
    title: locale.t('pickupPage.setGlobal'), content: locale.t('pickupPage.setGlobalConfirm').replace('{name}', s.name),
    success: async (r) => {
      if (!r.confirm) return;
      try { await promoteToListPublic(s.id); await reload(); uni.showToast({ title: locale.t('pickupPage.setGlobalDone'), icon: 'none' }); }
      catch (e: any) { uni.showToast({ title: e?.message || locale.t('pickupPage.opFailed'), icon: 'none' }); }
    },
  });
}

async function onAssign(g: PickupLocationItem) {
  try { await assignToChannel([g.id]); await reload(); await switchTab('pool'); uni.showToast({ title: locale.t('pickupPage.assignDone'), icon: 'none' }); }
  catch (e: any) { uni.showToast({ title: e?.message || locale.t('pickupPage.assignFailed'), icon: 'none' }); }
}

function onRemove(s: PickupLocationItem) {
  uni.showModal({
    title: locale.t('pickupPage.removeFromStore'), content: locale.t('pickupPage.removeConfirm').replace('{name}', s.name),
    success: async (r) => {
      if (!r.confirm) return;
      try { await removeFromChannel([s.id]); await reload(); uni.showToast({ title: locale.t('pickupPage.removed'), icon: 'none' }); }
      catch (e: any) { uni.showToast({ title: e?.message || locale.t('pickupPage.removeFailed'), icon: 'none' }); }
    },
  });
}

function onDel(s: PickupLocationItem) {
  uni.showModal({
    title: locale.t('pickupPage.delete'), content: locale.t('pickupPage.delConfirm').replace('{name}', s.name),
    success: async (r) => {
      if (!r.confirm) return;
      try { await deletePickupLocation(s.id); await reload(); }
      catch (e: any) { uni.showToast({ title: e?.message || locale.t('pickupPage.delFailed'), icon: 'none' }); }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 20rpx;
    .tab { flex: 1; text-align: center; font-size: 28rpx; color: $wa-muted; padding: 18rpx 0; border-radius: 14rpx;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; }
    }
  }
  .hint { background: #fff7f0; border: 1px solid #ffe0c4; color: #b05000; font-size: 24rpx; border-radius: 16rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; }
  .filters { display: flex; align-items: center; margin-bottom: 20rpx;
    .search { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 22rpx; font-size: 26rpx; color: $wa-ink; margin-right: 16rpx; }
    .city { background: $wa-card; border-radius: $wa-radius; padding: 16rpx 22rpx; font-size: 26rpx; color: $wa-ink; min-width: 170rpx; text-align: center; }
  }
  .toolbar .add { width: 260rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: flex-start;
      .info { flex: 1; min-width: 0;
        .head { display: flex; align-items: center; flex-wrap: wrap;
          .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
          .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; margin-right: 8rpx;
            &.store { background: #f0821f; }
            &.point { background: #2563eb; }
            &.employee { background: #7c3aed; }
            &.global { background: #0a9c6e; }
            &.off { background: #bbb; }
          }
        }
        .addr { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
        .meta { margin-top: 8rpx; display: flex; flex-wrap: wrap;
          .pm { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
        }
      }
    }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule; display: flex; flex-wrap: wrap; align-items: center;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.setdefault { color: $wa-accent; }
        &.copy { color: $wa-accent; font-weight: 600; }
        &.assigned { color: #bbb; }
        &.promote { color: #0a9c6e; font-weight: 600; }
        &.del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>