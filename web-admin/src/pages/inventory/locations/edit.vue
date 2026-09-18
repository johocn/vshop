<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">网点名称 *</text>
        <input class="ipt" v-model="form.name" placeholder="如 长春净月自提点" />
      </view>
      <view class="field">
        <text class="label">归属租户编码</text>
        <input class="ipt" v-model="form.channelCode" placeholder="默认当前租户" />
        <text class="tip">网点按此编码归入租户；C 端可售查询仅统计本租户网点</text>
      </view>
      <view class="field">
        <text class="label">配送方式（都不勾 = 邮寄与自提都支持）</text>
        <checkbox-group @change="onDeliveryChange">
          <label class="ck"><checkbox value="MAIL" :checked="hasMail" />邮寄</label>
          <label class="ck"><checkbox value="SELF_PICKUP" :checked="hasPickup" />自提</label>
        </checkbox-group>
      </view>
      <view class="field">
        <text class="label">服务城市（逗号/空格分隔，留空 = 全国）</text>
        <input class="ipt" v-model="form.serviceCitiesText" placeholder="如 长春, 吉林" />
      </view>
      <view class="field">
        <text class="label">经纬度</text>
        <view class="coord">
          <input class="ipt half" v-model="form.lat" type="digit" placeholder="纬度 lat" />
          <input class="ipt half" v-model="form.lng" type="digit" placeholder="经度 lng" />
        </view>
      </view>
    </view>

    <view class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? '保存中…' : '保存' }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { reactive, ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useTenantStore } from '../../../stores/tenantStore';
import { fetchLocations, createLocation, updateLocation, type LocationRow } from '../../../apis/inventory';

const tenant = useTenantStore();
const saving = ref(false);
const editingId = ref<string | null>(null);

const form = reactive<{
  name: string;
  channelCode: string;
  deliveryMethods: string[];
  serviceCitiesText: string;
  lat: string;
  lng: string;
}>({
  name: '',
  channelCode: '',
  deliveryMethods: [],
  serviceCitiesText: '',
  lat: '',
  lng: '',
});

const hasMail = () => form.deliveryMethods.includes('MAIL');
const hasPickup = () => form.deliveryMethods.includes('SELF_PICKUP');

function onDeliveryChange(e: any) {
  form.deliveryMethods = (e.detail.value as string[]) || [];
}

function toInput() {
  return {
    name: form.name.trim(),
    customFields: {
      channelCode: form.channelCode.trim() || null,
      deliveryMethods: form.deliveryMethods,
      lat: form.lat.trim() ? Number(form.lat) : null,
      lng: form.lng.trim() ? Number(form.lng) : null,
      serviceCities: form.serviceCitiesText
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };
}

onMounted(() => {
  form.channelCode = tenant.code;
});

onLoad(async (query: any) => {
  const id = query?.id;
  if (!id) return;
  editingId.value = id;
  const all = await fetchLocations();
  const row: LocationRow | undefined = all.find((l) => l.id === id);
  if (!row) return;
  form.name = row.name || '';
  form.channelCode = row.customFields?.channelCode?.trim() || tenant.code;
  form.deliveryMethods = (row.customFields?.deliveryMethods ?? []) as string[];
  form.serviceCitiesText = ((row.customFields?.serviceCities ?? []) as string[]).join(', ');
  if (row.customFields?.lat != null) form.lat = String(row.customFields.lat);
  if (row.customFields?.lng != null) form.lng = String(row.customFields.lng);
});

async function onSave() {
  if (!form.name.trim()) {
    uni.showToast({ title: '请填写网点名称', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateLocation(editingId.value, toInput());
    } else {
      await createLocation(toInput());
    }
    uni.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
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
    }
  }
  .savebar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
    .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  }
}
</style>
