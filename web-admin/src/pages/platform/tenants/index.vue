<template>
  <view class="page">
    <view class="card slots-card">
      <view class="slots-head">
        <text class="title">{{ $t('platformTenants.slotsTitle') }}</text>
        <text class="slots-meta">{{ $t('platformTenants.slotsUsed').replace('{used}', used).replace('{capacity}', capacity) }}</text>
      </view>
      <view class="slots-grid">
        <view
          v-for="s in slots"
          :key="s.no"
          class="slot"
          :class="{ on: s.occupied, off: !s.occupied }"
          @tap="s.occupied && s.tenantId && goDetailById(s.tenantId, s.name)"
        >
          <text class="slot-no">#{{ s.no }}</text>
          <text class="slot-name">{{ s.occupied ? (s.name || '—') : $t('platformTenants.reserved') }}</text>
        </view>
      </view>
      <view class="slots-tip">{{ $t('platformTenants.slotsTip').replace('{capacity}', capacity) }}</view>
    </view>

    <view class="card">
      <view class="row head">
        <text class="title">{{ $t('platformTenants.listTitle') }}</text>
        <text class="head-btn" @tap="onCreate">{{ $t('platformTenants.createBtn') }}</text>
      </view>
      <view class="item" v-for="t in tenants" :key="t.id">
        <view class="info">
          <text class="name">{{ t.name }}</text>
          <text class="sub">
            #{{ t.tenantNo ?? '—' }} · {{ t.code }} ·
            <text v-if="t.isOfficial" class="tag official">{{ $t('platformTenants.official') }}</text>
            <template v-else>
              <text class="tag third" :class="t.merchantStatus || 'active'">
                {{ merchantLabel(t.merchantStatus) }}
              </text>
            </template>
          </text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" />
        <text class="link" @tap="goDetail(t)">{{ $t('platformTenants.manage') }}</text>
      </view>
      <view v-if="!tenants.length" class="empty">{{ $t('platformTenants.empty') }}</view>
    </view>
  </view>

  <view class="mask" v-if="showCreate" @tap="showCreate = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ $t('platformTenants.createTitle') }}</text>
      <view class="field">
        <text class="label">{{ $t('platformTenants.shopName') }} <text class="req">*</text></text>
        <input class="input" v-model="form.name" :placeholder="$t('platformTenants.shopNamePh')" />
      </view>
      <view class="field row">
        <text class="label">{{ $t('platformTenants.tenantNo') }}</text>
        <text class="auto-val">{{ $t('platformTenants.autoGenerate') }}</text>
      </view>
      <view class="field row">
        <text class="label">{{ $t('platformTenants.official') }}</text>
        <switch :checked="form.isOfficial" color="#4f8cff" @change="form.isOfficial = $event.detail.value" />
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showCreate = false">{{ $t('platformTenants.cancel') }}</button>
        <button class="btn" @tap="submitCreate">{{ $t('platformTenants.create') }}</button>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchTenants, setTenantEnabled, createTenant, fetchTenantSlots, type TenantItem, type TenantSlotItem } from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const tenants = ref<TenantItem[]>([]);
const showCreate = ref(false);
const form = ref({ name: '', isOfficial: false });
const slots = ref<TenantSlotItem[]>([]);
const used = ref(0);
const capacity = ref(20);

async function load() {
  const res = await fetchTenants();
  tenants.value = res.items;
  try {
    const s = await fetchTenantSlots();
    slots.value = s.slots;
    used.value = s.used;
    capacity.value = s.capacity;
  } catch {
    slots.value = [];
  }
}
function goDetailById(id: string, name?: string | null) {
  uni.navigateTo({ url: `/pages/platform/tenants/detail?id=${id}&name=${encodeURIComponent(name || '')}` });
}
function onToggle(t: TenantItem, e: any) {
  const enabled = e.detail.value as boolean;
  uni.showModal({
    title: enabled ? locale.t('platformTenants.enableTitle') : locale.t('platformTenants.disableTitle'),
    content: locale.t('platformTenants.toggleContent')
      .replace('{action}', locale.t(enabled ? 'platformTenants.enableAction' : 'platformTenants.disableAction'))
      .replace('{name}', t.name),
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantEnabled(t.id, enabled);
        t.enabled = enabled;
        uni.showToast({ title: locale.t('platformTenants.updated'), icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || locale.t('platformTenants.opFailed'), icon: 'none' });
        load();
      }
    },
  });
}
function onCreate() { form.value = { name: '', isOfficial: false }; showCreate.value = true; }
async function submitCreate() {
  const name = form.value.name.trim();
  if (!name) { uni.showToast({ title: locale.t('platformTenants.requireName'), icon: 'none' }); return; }
  try {
    await createTenant({ name, isOfficial: form.value.isOfficial });
    uni.showToast({ title: locale.t('platformTenants.created'), icon: 'none' });
    showCreate.value = false;
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('platformTenants.createFailed')), icon: 'none' });
  }
}
function goDetail(t: TenantItem) {
  uni.navigateTo({ url: `/pages/platform/tenants/detail?id=${t.id}&name=${encodeURIComponent(t.name)}` });
}
function merchantLabel(s?: string | null): string {
  if (!s || s === 'active') return locale.t('platformTenants.merchantActive');
  return s === 'pending' ? locale.t('platformTenants.merchantPending') : s === 'disabled' ? locale.t('platformTenants.merchantDisabled') : locale.t('platformTenants.merchantOther').replace('{status}', s);
}
onMounted(load);
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.slots-card { margin-bottom: 20rpx; }
.slots-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.slots-meta { font-size: 26rpx; color: $pm-info; font-weight: 600; }
.slots-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14rpx; }
.slot { border-radius: 12rpx; padding: 14rpx 8rpx; text-align: center; }
.slot.on { background: #f0f5ff; border: 1px solid $pm-info; }
.slot.off { background: #fafafa; border: 1px dashed #d8d8d8; }
.slot-no { display: block; font-size: 24rpx; color: #999; font-weight: 600; }
.slot.on .slot-no { color: $pm-info; }
.slot-name { display: block; font-size: 20rpx; color: #666; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slot.on .slot-name { color: #333; }
.slot.off .slot-name { color: #bbb; }
.slots-tip { margin-top: 14rpx; font-size: 20rpx; color: #999; line-height: 1.6; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.tag { display: inline-flex; align-items: center; margin-left: 4rpx; padding: 0 12rpx; border-radius: 999rpx; font-size: 20rpx; }
.tag.official { background: #f0f5ff; color: $pm-info; }
.tag.third { background: #f6ffed; color: #52c41a; }
.tag.third.pending { background: #fff7e6; color: #f59e0b; }
.tag.third.disabled { background: #f2f2f2; color: #999; }
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.auto-val { color: #999; font-size: 26rpx; }
.row { display: flex; justify-content: space-between; align-items: center; }
.actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.ghost { background: #f2f2f2; color: #666; }
</style>