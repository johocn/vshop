<template>
  <view class="page">
    <view class="toolbar"><button class="add" @tap="onCreate">＋ 新建配送档案</button></view>

    <!-- 内联编辑面板 -->
    <view v-if="creating || editing" class="panel">
      <view class="panel-title">{{ editing ? '编辑配送档案' : '新建配送档案' }}</view>

      <view class="field">
        <text class="label">名称</text>
        <input class="ipt" v-model="form.name" placeholder="如 全国标准配送" />
      </view>
      <view class="field">
        <text class="label">Code</text>
        <input class="ipt" v-model="form.code" placeholder="如 express" />
      </view>
      <view class="field">
        <text class="label">描述</text>
        <textarea class="area" v-model="form.description" placeholder="选填"></textarea>
      </view>

      <view class="field">
        <text class="label">配送方式</text>
        <button class="mini" @tap="onAddMethod">＋ 添加配送方式</button>
      </view>

      <view class="methods" v-for="(e, i) in methodEntries" :key="e.shippingMethodId">
        <view class="method-row">
          <text class="method-code">{{ e.code }}</text>
          <text class="method-mode">{{ e.mode === 'pickup' ? '自提' : '邮寄' }}</text>
          <text class="method-del" @tap="onRemoveMethod(i)">移除</text>
        </view>

        <view v-if="isPickup(e.code)">
          <view class="pickup-blocks">
            <view v-for="grp in groupedPickups()" :key="grp.label" class="pickup-block">
              <text class="pickup-group">{{ grp.label }}</text>
              <checkbox-group>
                <label class="pickup-item" v-for="p in grp.list" :key="p.id">
                  <checkbox :value="p.id" :checked="isPickupChecked(e, p.id)" @tap.stop="togglePickup(e, p.id)" style="transform: scale(0.7);" />
                  <view class="pickup-info">
                    <text class="pickup-name">{{ p.name }}</text>
                    <text v-if="p.address" class="pickup-addr">{{ p.address }}</text>
                    <text v-if="p.phoneNumber" class="pickup-meta">☎ {{ p.phoneNumber }}</text>
                    <text v-if="p.coordinates" class="pickup-meta">📍 {{ p.coordinates.lat }}, {{ p.coordinates.lng }}</text>
                  </view>
                </label>
              </checkbox-group>
            </view>
            <view v-if="!pickupLocations.length" class="pickup-empty">暂无自提点</view>
          </view>
          <button class="mini" @tap="onAddPickup(e)">＋ 新增自提点</button>
        </view>
        <view v-else class="mail-tip">范围/运费公式请在「配送方式」原实例中配置</view>
      </view>

      <view class="field row">
        <text class="label">设为租户默认</text>
        <switch :checked="setDefault" @change="setDefault = $event.detail.value" color="#2563eb" style="transform: scale(0.8);" />
      </view>

      <view class="panel-ops">
        <button class="btn ghost" @tap="onClose">取消</button>
        <button class="btn main" @tap="onSave">保存</button>
      </view>
    </view>

    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <text class="name">{{ s.name }}</text>
        <text v-if="s.isTenantDefault" class="default-badge">默认</text>
        <text class="code">{{ s.code }}</text>
      </view>
      <text class="desc">{{ s.description || '—' }}</text>
      <view class="ops">
        <text @tap="onEdit(s)">编辑</text>
        <text v-if="!s.isTenantDefault" class="setdefault" @tap="onSetDefault(s)">设为默认</text>
        <text class="del" @tap="onDel(s)">删除</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无配送档案</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  fetchShippingProfiles, fetchShippingMethods, createShippingProfile,
  updateShippingProfile, deleteShippingProfile, setTenantDefaultShippingProfile,
  ShippingProfileItem,
} from '../../../apis/shipping-profile';
import { fetchPickupLocations, createPickupLocation, PickupLocationItem } from '../../../apis/pickup-location';

interface MethodEntry {
  shippingMethodId: string;
  code: string;
  mode: string; // 'pickup' | 'mail'
  pickupLocationIds: string[];
}

const items = ref<any[]>([]);
const methods = ref<{ id: string; code: string }[]>([]);
const pickupLocations = ref<PickupLocationItem[]>([]);

const creating = ref(false);
const editing = ref(false);
const editingId = ref<string | null>(null);
const setDefault = ref(false);

const form = ref({ name: '', code: '', description: '' });
const methodEntries = ref<MethodEntry[]>([]);

const isPickup = (code: string) => /pickup|store/i.test(code);

const PICKUP_LABEL: Record<string, string> = { point: '租户自提点', store: '租户门店', employee: '职工单位' };
const groupedPickups = () => ['point', 'store', 'employee']
  .map((t) => ({ label: PICKUP_LABEL[t], list: pickupLocations.value.filter((p) => p.type === t) }));

async function reload() {
  items.value = await fetchShippingProfiles();
}
function loadPickups() {
  return fetchPickupLocations().then((l) => { pickupLocations.value = l; });
}
function loadMethods() {
  return fetchShippingMethods().then((m) => { methods.value = m; });
}
onMounted(async () => {
  await Promise.all([reload(), loadPickups(), loadMethods()]);
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
  form.value = { name: '', code: '', description: '' };
  methodEntries.value = [];
  setDefault.value = false;
}

function onEdit(s: ShippingProfileItem) {
  creating.value = false;
  editing.value = true;
  editingId.value = s.id;
  form.value = { name: s.name, code: s.code, description: s.description || '' };
  setDefault.value = false;
  const ids = (s.shippingMethods || []).map((m: any) => m.id);
  const cfgs = (s.methodConfigs || []).reduce<Record<string, any>>((acc, c) => {
    acc[c.shippingMethodId] = c;
    return acc;
  }, {});
  methodEntries.value = ids.map((id: string) => {
    const code = (s.shippingMethods || []).find((m: any) => m.id === id)?.code || '';
    const cfg = cfgs[id];
    const mode = cfg?.mode || (isPickup(code) ? 'pickup' : 'mail');
    const pickupLocationIds: string[] = cfg?.options?.pickupLocationIds
      ? [...(cfg.options.pickupLocationIds as string[])]
      : [];
    return { shippingMethodId: id, code, mode, pickupLocationIds };
  });
}

function onClose() {
  creating.value = false;
  editing.value = false;
  editingId.value = null;
}

async function onAddMethod() {
  if (!methods.value.length) {
    uni.showToast({ title: '请先在「配送方式」页面配置配送方式', icon: 'none' });
    return;
  }
  const selected = new Set(methodEntries.value.map((e) => e.shippingMethodId));
  const avail = methods.value.filter((m) => !selected.has(m.id));
  if (!avail.length) {
    uni.showToast({ title: '已全部添加', icon: 'none' });
    return;
  }
  uni.showActionSheet({
    itemList: avail.map((m) => m.code),
    success: (res) => {
      const m = avail[res.tapIndex];
      if (!m) return;
      methodEntries.value.push({ shippingMethodId: m.id, code: m.code, mode: isPickup(m.code) ? 'pickup' : 'mail', pickupLocationIds: [] });
    },
    fail: () => {},
  });
}

function onRemoveMethod(i: number) {
  methodEntries.value.splice(i, 1);
}

function onAddPickup(e: MethodEntry) {
  uni.showActionSheet({
    itemList: ['租户自提点（point）', '租户门店（store）', '职工单位自提点（employee）'],
    success: (r) => {
      const type = ['point', 'store', 'employee'][r.tapIndex];
      let name = '';
      let address = '';
      let phone = '';
      let lat = '';
      let lng = '';
      awaitModal({ title: '自提点名称', placeholderText: '如 北京朝阳自提点' }).then((n) => {
        if (!n) { uni.showToast({ title: '已取消', icon: 'none' }); return; }
        name = n;
        awaitModal({ title: '自提点地址', placeholderText: '如 北京市朝阳区XX路1号' }).then((a) => {
          address = a || '';
          awaitModal({ title: '联系电话', placeholderText: '选填，如 010-88886666' }).then((ph) => {
            phone = (ph || '').trim();
            awaitModal({ title: '纬度 lat', placeholderText: '选填，如 39.9042' }).then((lt) => {
              lat = (lt || '').trim();
              awaitModal({ title: '经度 lng', placeholderText: '选填，如 116.4074' }).then((lg) => {
                lng = (lg || '').trim();
                doCreatePickup(e, type, name, address, phone, lat, lng);
              });
            });
          });
        });
      });
    },
  });
}
async function awaitModal(opts: { title: string; placeholderText?: string }): Promise<string> {
  return new Promise((resolve) => {
    uni.showModal({ ...opts, editable: true, success: (r) => resolve(r.confirm ? (r.content || '').trim() : '') });
  });
}
async function doCreatePickup(e: MethodEntry, type: string, name: string, address: string, phone?: string, lat?: string, lng?: string) {
  if (!name.trim()) { uni.showToast({ title: '名称不能为空', icon: 'none' }); return; }
  try {
    const coordinates = lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : undefined;
    const id = await createPickupLocation({
      name,
      type: type as any,
      address: address.trim(),
      phoneNumber: phone || undefined,
      ...(coordinates ? { coordinates } : {}),
    });
    const list = await fetchPickupLocations();
    pickupLocations.value = list;
    if (!e.pickupLocationIds.includes(id)) e.pickupLocationIds.push(id);
    uni.showToast({ title: '已新增自提点' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '新增自提点失败', icon: 'none' });
  }
}

async function onSave() {
  if (!form.value.name.trim()) { uni.showToast({ title: '请填写名称', icon: 'none' }); return; }
  if (!form.value.code.trim()) { uni.showToast({ title: '请填写 Code', icon: 'none' }); return; }
  if (!methodEntries.value.length) { uni.showToast({ title: '请至少选择一个配送方式', icon: 'none' }); return; }

  const shippingMethodIds = methodEntries.value.map((e) => e.shippingMethodId);
  const methodConfigs = methodEntries.value.map((e) => ({
    shippingMethodId: e.shippingMethodId,
    mode: e.mode,
    options: e.mode === 'pickup' ? { pickupLocationIds: e.pickupLocationIds } : null,
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
      });
    } else {
      await updateShippingProfile(id, {
        name: form.value.name.trim(),
        code: form.value.code.trim(),
        description: form.value.description,
        shippingMethodIds,
        methodConfigs,
      });
    }
    if (setDefault.value && id) {
      await setTenantDefaultShippingProfile(id);
    }
    creating.value = false;
    editing.value = false;
    editingId.value = null;
    await reload();
    uni.showToast({ title: '保存成功' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '保存失败', icon: 'none' });
  }
}

async function onSetDefault(s: ShippingProfileItem) {
  try {
    await setTenantDefaultShippingProfile(s.id);
    await reload();
    uni.showToast({ title: '已设为默认' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '设置失败', icon: 'none' });
  }
}

function onDel(s: ShippingProfileItem) {
  uni.showModal({
    title: '删除',
    content: `删除「${s.name}」？`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await deleteShippingProfile(s.id); await reload(); } catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
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
      &.row { display: flex; align-items: center; justify-content: space-between; }
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 120rpx; box-sizing: border-box; }
    }
    .mini { display: inline-block; width: auto; margin: 8rpx 0 0; padding: 0 28rpx; line-height: 56rpx; font-size: 26rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; }

    .methods { border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 20rpx; margin-bottom: 16rpx;
      .method-row { display: flex; align-items: center; justify-content: space-between;
        .method-code { font-size: 28rpx; color: $wa-ink; font-weight: 500; }
        .method-mode { font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: 20rpx; padding: 2rpx 16rpx; }
        .method-del { font-size: 24rpx; color: #e64340; }
      }
      .pickup-blocks { margin-top: 16rpx;
        .pickup-block { margin-bottom: 12rpx;
          .pickup-group { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 6rpx; }
          .pickup-item { display: flex; align-items: flex-start; min-height: 52rpx;
            .pickup-info { display: flex; flex-direction: column; line-height: 1.5;
              .pickup-name { font-size: 26rpx; color: $wa-ink; }
              .pickup-addr { font-size: 22rpx; color: $wa-muted; }
              .pickup-meta { font-size: 22rpx; color: $wa-muted; opacity: .85; }
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
      .name { font-size: 28rpx; color: $wa-ink; flex: 1; font-weight: 500; }
      .code { font-size: 24rpx; color: $wa-muted; }
    }
    .default-badge { font-size: 22rpx; color: #fff; background: $wa-accent; border-radius: 20rpx; padding: 2rpx 16rpx; margin-right: 16rpx; }
    .desc { display: block; margin-top: 8rpx; font-size: 26rpx; color: $wa-muted; }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.setdefault { color: $wa-accent; }
        &.del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>