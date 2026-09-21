<template>
  <view class="page">
    <view class="card">
      <view class="field readonly">
        <text class="label">{{ $t('inventoryLocationsEdit.labelKind') }}</text>
        <text class="ro">{{ form.kind === 'physical' ? $t('inventoryLocationsEdit.kindPhysical') : $t('inventoryLocationsEdit.kindVirtual') }}</text>
        <text v-if="!editingId" class="tip">{{ $t('inventoryLocationsEdit.kindAutoTip') }}</text>
      </view>
      <view class="field readonly">
        <text class="label">{{ $t('inventoryLocationsEdit.labelCode') }}</text>
        <text class="ro">{{ codeText }}</text>
        <text class="tip">{{ codeTip }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('inventoryLocationsEdit.labelName') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('inventoryLocationsEdit.placeholderName')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('inventoryLocationsEdit.labelDelivery') }}</text>
        <checkbox-group @change="onDeliveryChange">
          <label class="ck"><checkbox value="MAIL" :checked="hasMail" />{{ $t('inventoryLocationsEdit.deliveryMail') }}</label>
          <label class="ck"><checkbox value="SELF_PICKUP" :checked="hasPickup" />{{ $t('inventoryLocationsEdit.deliveryPickup') }}</label>
        </checkbox-group>
      </view>
      <view class="field">
        <text class="label">{{ $t('inventoryLocationsEdit.labelCities') }}</text>
        <input class="ipt" v-model="form.serviceCitiesText" :placeholder="$t('inventoryLocationsEdit.placeholderCities')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('inventoryLocationsEdit.labelCoord') }}</text>
        <view class="coord">
          <input class="ipt half" v-model="form.lat" type="digit" :placeholder="$t('inventoryLocationsEdit.placeholderLat')" />
          <input class="ipt half" v-model="form.lng" type="digit" :placeholder="$t('inventoryLocationsEdit.placeholderLng')" />
        </view>
      </view>
    </view>

    <view v-if="isVirtualSystem" class="locked">{{ $t('inventoryLocationsEdit.virtualLocked') }}</view>
    <view v-else class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? $t('inventoryLocationsEdit.saving') : $t('inventoryLocationsEdit.save') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  fetchTenantInventoryOverview,
  createTenantStockLocation,
  updateTenantStockLocation,
} from '../../../apis/inventory';

const locale = useLocaleStore();
const saving = ref(false);
const editingId = ref<string | null>(null);
const isVirtualSystem = ref(false);

// 编码/性质为服务端生成，页面只读展示（前端不再提供输入，避免落库成「无编码 non-physical 仓」）
const form = reactive<{
  name: string;
  code: string;
  kind: string;
  deliveryMethods: string[];
  serviceCitiesText: string;
  lat: string;
  lng: string;
}>({
  name: '',
  code: '',
  kind: 'physical',
  deliveryMethods: [],
  serviceCitiesText: '',
  lat: '',
  lng: '',
});

const hasMail = () => form.deliveryMethods.includes('MAIL');
const hasPickup = () => form.deliveryMethods.includes('SELF_PICKUP');

// 新建时编码尚未生成：显示「保存后自动生成 + 规则说明」，避免误以为需要手填或看到「历史未编码」而困惑
const codeText = computed(() =>
  form.code || (editingId.value ? locale.t('inventoryLocationsEdit.codeLegacy') : locale.t('inventoryLocationsEdit.codePending')),
);
const codeTip = computed(() =>
  form.code
    ? locale.t('inventoryLocationsEdit.codeReadonlyTip')
    : editingId.value
      ? locale.t('inventoryLocationsEdit.codeLegacyTip')
      : locale.t('inventoryLocationsEdit.codeAutoTip'),
);

function onDeliveryChange(e: any) {
  form.deliveryMethods = (e.detail.value as string[]) || [];
}

function parseCoord(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function toInput() {
  return {
    name: form.name.trim(),
    deliveryMethods: form.deliveryMethods,
    serviceCities: form.serviceCitiesText
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    lat: parseCoord(form.lat),
    lng: parseCoord(form.lng),
  };
}

onLoad(async (query: any) => {
  const id = query?.id;
  if (!id) return;
  editingId.value = id;
  const ov = await fetchTenantInventoryOverview();
  const row = ov.locations.find((l) => l.id === id);
  if (!row) return;
  form.name = row.name || '';
  form.code = row.code || '';
  form.kind = row.kind || 'physical';
  form.deliveryMethods = (row.deliveryMethods ?? []) as string[];
  form.serviceCitiesText = ((row.serviceCities ?? []) as string[]).join(', ');
  if (row.lat != null) form.lat = String(row.lat);
  if (row.lng != null) form.lng = String(row.lng);
  isVirtualSystem.value = row.isSystem && row.kind === 'virtual';
});

async function onSave() {
  if (!form.name.trim()) {
    uni.showToast({ title: locale.t('inventoryLocationsEdit.requireName'), icon: 'none' });
    return;
  }
  const input = toInput();
  if (Number.isNaN(input.lat as number) || Number.isNaN(input.lng as number)) {
    uni.showToast({ title: locale.t('inventoryLocationsEdit.invalidCoord'), icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateTenantStockLocation({ id: editingId.value, ...input });
    } else {
      await createTenantStockLocation(input);
    }
    uni.showToast({ title: locale.t('inventoryLocationsEdit.saved'), icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryLocationsEdit.saveFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx;
    .field { margin-bottom: 32rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 12rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink; }
      .coord { display: flex; gap: 20rpx;
        .half { flex: 1; }
      }
      .ck { display: inline-flex; align-items: center; font-size: 28rpx; color: $wa-ink; margin-right: 40rpx; }
      .tip { display: block; margin-top: 10rpx; font-size: 22rpx; color: $wa-muted; }
      .ro { font-size: 28rpx; color: $wa-ink; }
    }
  }
  .locked { margin-top: 24rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.6; text-align: center; }
  .savebar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
    .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  }
}
</style>