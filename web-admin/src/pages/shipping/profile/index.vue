<template>
  <view class="page">
    <view class="toolbar"><button class="add" @tap="onCreate">＋ {{ $t('shippingProfile.createNew') }}</button></view>

    <!-- 内联编辑面板 -->
    <view v-if="creating || editing" class="panel">
      <view class="panel-title">{{ editing ? $t('shippingProfile.editTitle') : $t('shippingProfile.newTitle') }}</view>

      <view class="field">
        <text class="label">{{ $t('shippingProfile.labelName') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('shippingProfile.phName')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('shippingProfile.labelCode') }}</text>
        <input class="ipt" v-model="form.code" :placeholder="$t('shippingProfile.phCode')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('shippingProfile.labelDesc') }}</text>
        <textarea class="area" v-model="form.description" :placeholder="$t('shippingProfile.phDesc')"></textarea>
      </view>

      <view class="field">
        <text class="label">{{ $t('shippingProfile.labelMethods') }}</text>
        <button class="mini" @tap="onAddMethod">＋ {{ $t('shippingProfile.addMethod') }}</button>
      </view>

      <view class="methods" v-for="(e, i) in methodEntries" :key="e.shippingMethodId">
        <view class="method-row">
          <view class="method-head">
          <view class="method-title">
            <text class="method-code">{{ e.name || e.code }}</text>
            <text v-if="e.name && e.code" class="method-key">{{ e.code }}</text>
          </view>
          <view class="method-actions">
            <text class="method-mode">{{ isPickupMode(e.mode) ? $t('shippingProfile.modePickup') : $t('shippingProfile.modeMail') }}</text>
            <text class="method-del" @tap="onRemoveMethod(i)">{{ $t('shippingProfile.remove') }}</text>
          </view>
        </view>
        </view>

        <view v-if="isPickupEntry(e)">
          <view class="range-row">
            <text class="range-label">{{ $t('shippingProfile.rangeLabel') }}</text>
            <view class="seg">
              <text :class="{ on: e.rangeMode === 'selected' }" @tap="e.rangeMode = 'selected'">{{ $t('shippingProfile.rangeSelected') }}</text>
              <text :class="{ on: e.rangeMode === 'all' }" @tap="e.rangeMode = 'all'">{{ $t('shippingProfile.rangeAll') }}</text>
            </view>
          </view>
          <view v-if="e.rangeMode === 'selected'" class="pickup-blocks">
            <view v-for="grp in groupedPickups(e)" :key="grp.label" class="pickup-block">
              <text class="pickup-group">{{ grp.label }}</text>
              <view class="pickup-item" v-for="p in grp.list" :key="p.id">
                <checkbox :value="p.id" :checked="isPickupChecked(e, p.id)" @tap.stop="togglePickup(e, p.id)" style="transform: scale(0.7);" />
                <view class="pickup-info">
                  <view class="pickup-name-row">
                    <text class="pickup-name">{{ p.name }}</text>
                    <text v-if="!isChannelVisible(p.id)" class="pickup-cross">{{ $t('shippingProfile.crossTenant') }}</text>
                  </view>
                  <text v-if="p.address" class="pickup-addr">{{ p.address }}</text>
                  <text v-if="p.phoneNumber" class="pickup-meta">☎ {{ p.phoneNumber }}</text>
                  <text v-if="p.coordinates" class="pickup-meta">📍 {{ p.coordinates.lat }}, {{ p.coordinates.lng }}</text>
                </view>
                <view class="pickup-ops">
                  <text class="pk-edit" @tap.stop="editPickup(p)">{{ $t('shippingProfile.edit') }}</text>
                  <text v-if="!p.isPublic" class="pk-del" @tap.stop="delPickup(p)">{{ $t('shippingProfile.del') }}</text>
                </view>
              </view>
            </view>
            <view v-if="!pickupPool(e).length" class="pickup-empty">{{ $t('shippingProfile.pickupEmpty') }}</view>
            <view v-else-if="!groupedPickups(e).length" class="pickup-empty">{{ $t('shippingProfile.pickupEmptyType') }}</view>
          </view>
          <button class="mini" @tap="onAddPickup(e)">＋ {{ $t('shippingProfile.addPickup') }}</button>
        </view>
        <view v-else class="mail-tip">{{ $t('shippingProfile.mailTip') }}</view>
      </view>

      <view class="field row">
        <view class="flag-label">
          <text class="label">{{ $t('shippingProfile.needsContactLabel') }}</text>
          <text class="hint">{{ $t('shippingProfile.needsContactHint') }}</text>
        </view>
        <switch :checked="form.requiresContact" @change="form.requiresContact = $event.detail.value" color="#2563eb" style="transform: scale(0.8);" />
      </view>

      <view class="field row">
        <view class="flag-label">
          <text class="label">{{ $t('shippingProfile.needsAddressLabel') }}</text>
          <text class="hint">{{ $t('shippingProfile.needsAddressHint') }}</text>
        </view>
        <switch :checked="form.requiresAddress" @change="form.requiresAddress = $event.detail.value" color="#2563eb" style="transform: scale(0.8);" />
      </view>

      <!-- 超管：可切换（新建=开；编辑全局=开→关 归属当前渠道） -->
      <view v-if="isSuperAdmin" class="field row">
        <view class="flag-label">
          <text class="label">{{ $t('shippingProfile.setGlobalLabel') }}</text>
          <text class="hint">{{ editingProfile?.isGlobal ? $t('shippingProfile.globalHintMaintain') : $t('shippingProfile.globalHintOn') }}</text>
        </view>
        <switch :checked="isGlobal" color="#2563eb" style="transform: scale(0.8);" @change="onIsGlobalChange($event)" />
      </view>
      <!-- 非超管（防御）：全局档案编辑只读锁定 -->
      <view v-else-if="editingProfile?.isGlobal" class="field row">
        <view class="flag-label">
          <text class="label">{{ $t('shippingProfile.setGlobalLabel') }}</text>
          <text class="hint">{{ $t('shippingProfile.globalLocked') }}</text>
        </view>
        <switch :checked="true" disabled color="#2563eb" style="transform: scale(0.8);" />
      </view>
      <view class="field row">
        <view class="flag-label">
          <text class="label">{{ $t('shippingProfile.setTenantDefaultLabel') }}</text>
          <text v-if="isGlobal" class="hint">{{ $t('shippingProfile.tenantDefaultGlobalDisallow') }}</text>
        </view>
        <switch :checked="setDefault" :disabled="isGlobal" @change="setDefault = $event.detail.value" color="#2563eb" style="transform: scale(0.8);" />
      </view>

      <view class="panel-ops">
        <button class="btn ghost" @tap="onClose">{{ $t('shippingProfile.cancel') }}</button>
        <button class="btn main" @tap="onSave">{{ $t('shippingProfile.save') }}</button>
      </view>
    </view>

    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <view class="row-left">
          <text class="name">{{ s.name }}</text>
          <text v-if="s.isTenantDefault" class="default-badge">{{ $t('shippingProfile.default') }}</text>
          <text v-if="s.isGlobal" class="global-badge">{{ $t('shippingProfile.global') }}</text>
          <text v-if="!s.enabled" class="off-badge">{{ $t('shippingProfile.disabled') }}</text>
          <text class="code">{{ s.code }}</text>
        </view>
        <switch v-if="!s.isGlobal || isSuperAdmin" :checked="s.enabled" color="#2563eb" style="transform: scale(.7);" @change="onToggle(s, $event)" />
      </view>
      <text class="desc">{{ s.description || '—' }}</text>
      <view class="ops" v-if="!s.isGlobal || isSuperAdmin">
        <text @tap="onEdit(s)">{{ $t('shippingProfile.edit') }}</text>
        <text v-if="!s.isTenantDefault" class="setdefault" @tap="onSetDefault(s)">{{ $t('shippingProfile.setDefault') }}</text>
        <text class="del" @tap="onDel(s)">{{ $t('shippingProfile.del') }}</text>
      </view>
      <view class="ops readonly" v-else>
        <text class="readonly-tip">{{ $t('shippingProfile.readonlyTip') }}</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">{{ $t('shippingProfile.empty') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../../stores/authStore';
import {
  fetchShippingProfiles, createShippingProfile,
  updateShippingProfile, deleteShippingProfile, setTenantDefaultShippingProfile,
  ShippingProfileItem,
} from '../../../apis/shipping-profile';
import { fetchShippingMethods as fetchAllShippingMethods } from '../../../apis/shipping';
import { fetchPickupLocations, deletePickupLocation, PickupLocationItem } from '../../../apis/pickup-location';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const auth = useAuthStore();
const isSuperAdmin = computed(() => auth.isSuperAdmin);

interface MethodEntry {
  shippingMethodId: string;
  code: string;
  name: string;
  calcCode: string;
  mode: string; // 'pickup' | 'mail'
  rangeMode: 'all' | 'selected';
  pickupLocationIds: string[];
}

const items = ref<any[]>([]);
const methods = ref<{ id: string; code: string; name: string; calcCode: string; enabled: boolean }[]>([]);
const pickupLocations = ref<PickupLocationItem[]>([]);

const creating = ref(false);
const editing = ref(false);
const editingId = ref<string | null>(null);
const editingProfile = ref<ShippingProfileItem | null>(null);
const setDefault = ref(false);
const isGlobal = ref(false);

const form = ref({ name: '', code: '', description: '', requiresAddress: true, requiresContact: false });
const methodEntries = ref<MethodEntry[]>([]);

const PICKUP_LABEL: Record<string, string> = { point: 'shippingProfile.pickupTypePoint', store: 'shippingProfile.pickupTypeStore', employee: 'shippingProfile.pickupTypeEmployee' };
// 自提类型按真实「计费计算器」判定（与方式命名后缀无关，修复模板导入后 `-template` 后缀导致匹配失败）
const PICKUP_CALCULATORS = ['store-pickup-calculator', 'pickup-point-calculator', 'employee-pickup-calculator'];
const CALC_TO_PICKUP_TYPES: Record<string, string[]> = {
  'store-pickup-calculator': ['store'],
  'pickup-point-calculator': ['point'],
  'employee-pickup-calculator': ['employee'],
};
// 兼容旧数据：无 calcCode 时回退到 code 命名（无后缀）
const CODE_TO_PICKUP_TYPES: Record<string, string[]> = {
  'store-pickup': ['store'],
  'pickup-point': ['point'],
  'employee-pickup': ['employee'],
};
const isPickupEntry = (e: { code: string; calcCode: string }) =>
  PICKUP_CALCULATORS.includes(e.calcCode) || !!CODE_TO_PICKUP_TYPES[e.code];
const pickupTypeForEntry = (e: { code: string; calcCode: string }): string[] | null =>
  (e.calcCode && CALC_TO_PICKUP_TYPES[e.calcCode]) || CODE_TO_PICKUP_TYPES[e.code] || null;
// 自提方式 mode：按真实计算器派生（store/point/employee），与后端 pickupTypeByMode 对齐
const isPickupMode = (mode: string) => ['pickup', 'store', 'employee'].includes(mode);
const PICKUP_MODE_BY_CALC: Record<string, string> = {
  'store-pickup-calculator': 'store',
  'pickup-point-calculator': 'pickup',
  'employee-pickup-calculator': 'employee',
};
const LEGACY_CODE_MODE: Record<string, string> = {
  'store-pickup': 'store',
  'pickup-point': 'pickup',
  'employee-pickup': 'employee',
};
const pickupModeFor = (calcCode: string, code: string): string =>
  (calcCode && PICKUP_MODE_BY_CALC[calcCode]) || LEGACY_CODE_MODE[code] || 'mail';
const groupedPickups = (e: MethodEntry) => {
  const types = pickupTypeForEntry(e);
  if (!types) return [];
  return types
    .map((t) => ({ label: locale.t(PICKUP_LABEL[t]), list: pickupPool(e).filter((p) => p.type === t) }))
    .filter((g) => g.list.length > 0);
};

/**
 * 自提点候选池 = 档案真实绑定（boundPickupLocations，不受租户可见性过滤）
 * ∪ 当前渠道可见列表，按 id 去重。
 * 保证全局档案绑定某租户私有点时，其他租户上下文编辑仍能看到该点并可取消勾选。
 */
const pickupPool = (e: MethodEntry): PickupLocationItem[] => {
  const map = new Map<string, PickupLocationItem>();
  for (const p of editingProfile.value?.boundPickupLocations ?? []) {
    map.set(String(p.id), p);
  }
  for (const p of pickupLocations.value) {
    if (!map.has(String(p.id))) map.set(String(p.id), p);
  }
  return [...map.values()];
};

/** 该点是否当前渠道可见（不可见则为跨租户绑定，仅展示可取消） */
const isChannelVisible = (pid: string) =>
  pickupLocations.value.some((p) => String(p.id) === String(pid));

async function reload() {
  items.value = await fetchShippingProfiles();
}
function loadPickups() {
  return fetchPickupLocations().then((l) => { pickupLocations.value = l; });
}
function loadMethods() {
  return fetchAllShippingMethods().then((m) => { methods.value = m; });
}
onMounted(async () => {
  await Promise.all([reload(), loadMethods()]);
});
onShow(() => {
  loadPickups();
});

function isPickupChecked(e: MethodEntry, pid: string) {
  return e.pickupLocationIds.includes(pid);
}
function togglePickup(e: MethodEntry, pid: string) {
  const i = e.pickupLocationIds.indexOf(pid);
  if (i >= 0) e.pickupLocationIds.splice(i, 1);
  else e.pickupLocationIds.push(pid);
}

function onCreate() {
  creating.value = true;
  editing.value = false;
  editingId.value = null;
  editingProfile.value = null;
  form.value = { name: '', code: '', description: '', requiresAddress: true, requiresContact: false };
  methodEntries.value = [];
  setDefault.value = false;
  isGlobal.value = false;
}

function onEdit(s: ShippingProfileItem) {
  creating.value = false;
  editing.value = true;
  editingId.value = s.id;
  editingProfile.value = s;
  form.value = {
    name: s.name,
    code: s.code,
    description: s.description || '',
    requiresAddress: s.requiresAddress ?? true,
    requiresContact: s.requiresContact ?? false,
  };
  setDefault.value = false;
  isGlobal.value = s.isGlobal ?? false;
  const ids = (s.shippingMethods || []).map((m: any) => m.id);
  const cfgs = (s.methodConfigs || []).reduce<Record<string, any>>((acc, c) => {
    acc[c.shippingMethodId] = c;
    return acc;
  }, {});
  methodEntries.value = ids.map((id: string) => {
    const m = (s.shippingMethods || []).find((x: any) => x.id === id);
    const code = m?.code || '';
    const name = m?.name || '';
    const calcCode = methods.value.find((meth) => meth.id === id)?.calcCode || '';
    const cfg = cfgs[id];
    const entry = { shippingMethodId: id, code, name, calcCode };
    const mode = cfg?.mode || pickupModeFor(entry.calcCode, entry.code);
    const rangeMode: 'all' | 'selected' = cfg?.options?.rangeMode === 'all' ? 'all' : 'selected';
    const pickupLocationIds: string[] = cfg?.options?.pickupLocationIds
      ? [...(cfg.options.pickupLocationIds as string[])]
      : [];
    return { ...entry, mode, rangeMode, pickupLocationIds };
  });
}

function onClose() {
  creating.value = false;
  editing.value = false;
  editingId.value = null;
  editingProfile.value = null;
}

async function onAddMethod() {
  const enabled = methods.value.filter((m) => m.enabled !== false);
  if (!enabled.length) {
    uni.showToast({ title: locale.t('shippingProfile.needEnable'), icon: 'none' });
    return;
  }
  const selected = new Set(methodEntries.value.map((e) => e.shippingMethodId));
  const avail = enabled.filter((m) => !selected.has(m.id));
  if (!avail.length) {
    uni.showToast({ title: locale.t('shippingProfile.allAdded'), icon: 'none' });
    return;
  }
  uni.showActionSheet({
    itemList: avail.map((m) => (m.name || m.code)),
    success: (res) => {
      const m = avail[res.tapIndex];
      if (!m) return;
      const entry = { shippingMethodId: m.id, code: m.code, name: m.name, calcCode: m.calcCode || '' };
      methodEntries.value.push({ ...entry, mode: pickupModeFor(entry.calcCode, entry.code), rangeMode: 'selected', pickupLocationIds: [] });
    },
    fail: () => {},
  });
}

function onRemoveMethod(i: number) {
  methodEntries.value.splice(i, 1);
}

function onAddPickup(e: MethodEntry) {
  // 预选与当前配送方式严格匹配的自提点类型，跳转独立自提点管理页；返回后刷新列表再勾选
  const types = pickupTypeForEntry(e) || [];
  const qs = types[0] ? `?type=${types[0]}` : '';
  uni.navigateTo({
    url: `/pages/pickup/edit/index${qs}`,
    success: () => {
      uni.$once('pickup-created', (newId: string) => {
        if (newId && !e.pickupLocationIds.includes(String(newId))) {
          e.pickupLocationIds.push(String(newId));
        }
      });
    },
  });
}

function editPickup(p: PickupLocationItem) {
  uni.navigateTo({ url: `/pages/pickup/edit/index?id=${p.id}` });
}

function delPickup(p: PickupLocationItem) {
  uni.showModal({
    title: locale.t('shippingProfile.delPickupTitle'),
    content: locale.t('shippingProfile.delPickupContent').replace('{name}', p.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deletePickupLocation(p.id);
        methodEntries.value.forEach((e) => {
          const i = e.pickupLocationIds.indexOf(String(p.id));
          if (i >= 0) e.pickupLocationIds.splice(i, 1);
        });
        await loadPickups();
      } catch (err: any) {
        uni.showToast({ title: err?.message || locale.t('shippingProfile.delFailed'), icon: 'none' });
      }
    },
  });
}

async function onSave() {
  if (!form.value.name.trim()) { uni.showToast({ title: locale.t('shippingProfile.requireName'), icon: 'none' }); return; }
  if (!form.value.code.trim()) { uni.showToast({ title: locale.t('shippingProfile.requireCode'), icon: 'none' }); return; }
  if (!methodEntries.value.length) { uni.showToast({ title: locale.t('shippingProfile.requireMethod'), icon: 'none' }); return; }

  const shippingMethodIds = methodEntries.value.map((e) => e.shippingMethodId);
  const methodConfigs = methodEntries.value.map((e) => ({
    shippingMethodId: e.shippingMethodId,
    mode: e.mode,
    options: isPickupMode(e.mode) ? { rangeMode: e.rangeMode, pickupLocationIds: e.rangeMode === 'all' ? [] : e.pickupLocationIds } : null,
  }));

  try {
    let id = editingId.value;
    if (creating.value || id == null) {
      id = await createShippingProfile({
        name: form.value.name.trim(),
        code: form.value.code.trim(),
        description: form.value.description,
        shippingMethodIds,
        methodConfigs,
        requiresAddress: form.value.requiresAddress,
        requiresContact: form.value.requiresContact,
        ...(isSuperAdmin.value ? { isGlobal: isGlobal.value } : {}),
      });
    } else {
      await updateShippingProfile(id, {
        name: form.value.name.trim(),
        code: form.value.code.trim(),
        description: form.value.description,
        shippingMethodIds,
        methodConfigs,
        requiresAddress: form.value.requiresAddress,
        requiresContact: form.value.requiresContact,
        ...(isSuperAdmin.value ? { isGlobal: isGlobal.value } : {}),
      });
    }
    if (setDefault.value && id) {
      await setTenantDefaultShippingProfile(id);
    }
    creating.value = false;
    editing.value = false;
    editingId.value = null;
    editingProfile.value = null;
    await reload();
    uni.showToast({ title: locale.t('shippingProfile.saveSuccess') });
  } catch (err: any) {
    uni.showToast({ title: err?.message || locale.t('shippingProfile.saveFailed'), icon: 'none' });
  }
}

async function onSetDefault(s: ShippingProfileItem) {
  try {
    await setTenantDefaultShippingProfile(s.id);
    await reload();
    uni.showToast({ title: locale.t('shippingProfile.setDefaultSuccess') });
  } catch (err: any) {
    uni.showToast({ title: err?.message || locale.t('shippingProfile.setDefaultFailed'), icon: 'none' });
  }
}

function onIsGlobalChange(e: any) {
  const v = Boolean(e.detail.value);
  if (!v) { // 关闭——仅超管在编辑态可关；关闭后归属当前渠道，允许设租户默认
    isGlobal.value = v;
    return;
  }
  uni.showModal({
    title: locale.t('shippingProfile.setGlobalTitle'),
    content: editingProfile.value?.isTenantDefault
      ? locale.t('shippingProfile.setGlobalContentDefault')
      : locale.t('shippingProfile.setGlobalContent'),
    success: (r) => {
      if (r.confirm) {
        isGlobal.value = true;
        setDefault.value = false; // 互斥：全局档案不能是租户默认
      }
    },
  });
}

async function onToggle(s: ShippingProfileItem, e: any) {
  const enabled = Boolean(e.detail.value);
  try {
    await updateShippingProfile(s.id, { enabled });
    s.enabled = enabled;
  } catch (err: any) {
    uni.showToast({ title: err?.message || locale.t('shippingProfile.opFailed'), icon: 'none' });
  }
}

function onDel(s: ShippingProfileItem) {
  uni.showModal({
    title: locale.t('shippingProfile.delTitle'),
    content: locale.t('shippingProfile.delContent').replace('{name}', s.name),
    success: async (r) => {
      if (!r.confirm) return;
      try { await deleteShippingProfile(s.id); await reload(); } catch (e: any) { uni.showToast({ title: e?.message || locale.t('shippingProfile.delFailed'), icon: 'none' }); }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .toolbar .add { width: 260rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }

  .panel { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .panel-title { font-size: 30rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .field { margin-bottom: 18rpx;
      &.row { display: flex; align-items: center; justify-content: space-between;
        .flag-label { display: flex; flex-direction: column;
          .hint { font-size: 20rpx; color: $wa-muted; margin-top: 2rpx; }
        }
      }
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 120rpx; box-sizing: border-box; }
    }
    .mini { display: inline-block; width: auto; margin: 8rpx 0 0; padding: 0 28rpx; line-height: 56rpx; font-size: 26rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; }

    .methods { border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 20rpx; margin-bottom: 16rpx;
      .method-row { 
        .method-head { display: flex; align-items: center; justify-content: space-between; }
        .method-title { display: flex; align-items: baseline; min-width: 0; }
        .method-code { font-size: 28rpx; color: $wa-ink; font-weight: 500; }
        .method-key { font-size: 20rpx; color: $wa-muted; margin-left: 12rpx; }
        .method-actions { display: flex; align-items: center; gap: 20rpx; flex-shrink: 0; }
        .method-mode { font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: 20rpx; padding: 2rpx 16rpx; }
        .method-del { font-size: 24rpx; color: #e64340; }
      }
      .range-row { display: flex; align-items: center; justify-content: space-between; margin-top: 14rpx;
        .range-label { font-size: 24rpx; color: $wa-muted; }
        .seg { display: flex; background: $wa-bg; border-radius: $wa-radius; padding: 4rpx;
          text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 20rpx; border-radius: 12rpx;
            &.on { background: $wa-accent; color: #fff; }
          }
        }
      }
      .pickup-blocks { margin-top: 16rpx;
        .pickup-block { margin-bottom: 12rpx;
          .pickup-group { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 6rpx; }
          .pickup-item { display: flex; align-items: center; min-height: 52rpx;
            .pickup-info { display: flex; flex-direction: column; line-height: 1.5; flex: 1; min-width: 0;
              .pickup-name-row { display: flex; align-items: center; gap: 12rpx; }
              .pickup-name { font-size: 26rpx; color: $wa-ink; }
              .pickup-cross { font-size: 20rpx; color: #b45309; background: #fef3c7; border-radius: 8rpx; padding: 2rpx 10rpx; }
              .pickup-addr { font-size: 22rpx; color: $wa-muted; }
              .pickup-meta { font-size: 22rpx; color: $wa-muted; opacity: .85; }
            }
            .pickup-ops { display: flex; gap: 8rpx; flex-shrink: 0; margin-left: 12rpx;
              text { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 10rpx; }
              .pk-edit { color: $wa-accent; background: $wa-bg; }
              .pk-del { color: #e64340; background: #fff1f0; }
            }
          }
        }
        .pickup-empty { font-size: 24rpx; color: $wa-muted; }
      }
      .mail-tip { margin-top: 12rpx; font-size: 24rpx; color: $wa-muted; }
    }

    .panel-ops { display: flex; justify-content: flex-end; margin-top: 12rpx;
      .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 72rpx; }
      .main { background: $wa-accent; color: #fff; }
      .ghost { background: $wa-bg; color: $wa-muted; }
    }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .row-left { display: flex; align-items: center; flex: 1; min-width: 0; flex-wrap: wrap;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 500; }
        .code { font-size: 24rpx; color: $wa-muted; margin-left: 16rpx; }
      }
      .default-badge { font-size: 22rpx; color: #fff; background: $wa-accent; border-radius: 20rpx; padding: 2rpx 16rpx; margin-left: 16rpx; }
      .global-badge { font-size: 22rpx; color: #fff; background: #7c5cfc; border-radius: 20rpx; padding: 2rpx 16rpx; margin-left: 16rpx; }
      .off-badge { font-size: 22rpx; color: #fff; background: #bbb; border-radius: 20rpx; padding: 2rpx 16rpx; margin-left: 16rpx; }
    }
    .desc { display: block; margin-top: 8rpx; font-size: 26rpx; color: $wa-muted; }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.setdefault { color: $wa-accent; }
        &.del { color: #e64340; }
      }
      &.readonly { .readonly-tip { font-size: 24rpx; color: $wa-muted; } }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>