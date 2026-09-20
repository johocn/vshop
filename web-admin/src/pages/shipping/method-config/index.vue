<template>
  <view class="page">
    <view v-if="!loading && !tpl" class="empty">{{ $t('shippingMethodConfig.empty') }}</view>
    <template v-if="tpl">
      <view class="hint">{{ $t('shippingMethodConfig.hint').replace('{name}', tpl.name) }}</view>

      <view class="section">
        <text class="section-title">{{ $t('shippingMethodConfig.zoneTitle') }}</text>
        <view class="field">
          <text class="label">{{ $t('shippingMethodConfig.excludedLabel') }}</text>
          <input class="ipt" v-model="region.excludedAreas" :placeholder="$t('shippingMethodConfig.phExcluded')" />
        </view>
        <view class="field">
          <text class="label">{{ $t('shippingMethodConfig.minOrderLabel') }}</text>
          <input class="ipt" type="number" v-model="region.orderMinimum" placeholder="0" />
        </view>
      </view>

      <!-- 自提/同城：默认固定运费 -->
      <template v-if="kind === 'fixed-fee'">
        <view class="section">
          <text class="section-title">{{ $t('shippingMethodConfig.fixedFeeTitle') }}</text>
          <view class="field">
            <text class="label">{{ $t('shippingMethodConfig.fixedFeeLabel') }}</text>
            <input class="ipt" type="number" v-model="fee.shippingPrice" placeholder="0" />
          </view>
          <text class="sub">{{ $t('shippingMethodConfig.fixedFeeSub') }}</text>
        </view>
      </template>

      <!-- 门店自提：免运费 -->
      <template v-else-if="kind === 'store'">
        <view class="section">
          <text class="section-title">{{ $t('shippingMethodConfig.billingTitle') }}</text>
          <text class="sub">{{ $t('shippingMethodConfig.storeSub') }}</text>
        </view>
      </template>

      <!-- 快递：阶梯重量+区域计费 -->
      <template v-else>
      <view class="section">
        <text class="section-title">{{ $t('shippingMethodConfig.expressTitle') }}</text>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.firstWeightLabel') }}</text><input class="ipt" type="digit" v-model="fee.firstWeight" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.firstWeightFeeLabel') }}</text><input class="ipt" type="number" v-model="fee.firstWeightFee" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.additionalWeightUnitLabel') }}</text><input class="ipt" type="digit" v-model="fee.additionalWeightUnit" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.additionalWeightFeeLabel') }}</text><input class="ipt" type="number" v-model="fee.additionalWeightFee" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.remoteSurchargeLabel') }}</text><input class="ipt" type="number" v-model="fee.remoteAreaSurcharge" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.remoteAreasLabel') }}</text><input class="ipt" v-model="fee.remoteAreas" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.freeShippingThresholdLabel') }}</text><input class="ipt" type="number" v-model="fee.freeShippingThreshold" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.freeShippingAreasLabel') }}</text><input class="ipt" v-model="fee.freeShippingAreas" /></view>
        <view class="field row"><text class="label">{{ $t('shippingMethodConfig.useVolumetricLabel') }}</text><switch :checked="fee.useVolumetricWeight === 'true'" @change="fee.useVolumetricWeight = $event.detail.value ? 'true' : 'false'" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.volumetricDivisorLabel') }}</text><input class="ipt" type="number" v-model="fee.volumetricDivisor" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.maxShippingFeeLabel') }}</text><input class="ipt" type="number" v-model="fee.maxShippingFee" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.insuranceRateLabel') }}</text><input class="ipt" type="number" v-model="fee.insuranceFeeRate" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.insuranceMinFeeLabel') }}</text><input class="ipt" type="number" v-model="fee.insuranceMinFee" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.oversizedThresholdLabel') }}</text><input class="ipt" type="digit" v-model="fee.oversizedThreshold" /></view>
        <view class="field"><text class="label">{{ $t('shippingMethodConfig.oversizedSurchargeLabel') }}</text><input class="ipt" type="number" v-model="fee.oversizedSurcharge" /></view>
      </view>
      </template>

      <button class="save" @tap="onSave">{{ saving ? $t('shippingMethodConfig.saving') : $t('shippingMethodConfig.saveConfig') }}</button>
    </template>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchShippingTemplate, updateShippingTemplateConfig, ConfigArg } from '../../../apis/shipping-template';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const tpl = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const templateId = ref('');

// 计费类型：express=快递公式 / fixed-fee=自提/同城固定运费 / store=门店自提免费
const FIXED_FEE_CALCS = ['pickup-point-calculator', 'employee-pickup-calculator', 'local-delivery-calculator'];
const kind = ref<'express' | 'fixed-fee' | 'store'>('express');

const region = ref({ excludedAreas: '', orderMinimum: '0' });
const fee = ref<any>({});

const DEFAULTS: Record<string, string> = {
  firstWeight: '1', firstWeightFee: '1000', additionalWeightUnit: '1', additionalWeightFee: '500',
  remoteAreaSurcharge: '0', remoteAreas: '新疆,西藏,青海,内蒙古,宁夏,甘肃',
  freeShippingThreshold: '0', freeShippingAreas: '',
  useVolumetricWeight: 'false', volumetricDivisor: '6000',
  maxShippingFee: '0', insuranceFeeRate: '0', insuranceMinFee: '0',
  oversizedThreshold: '0', oversizedSurcharge: '0',
};

function argsToMap(args?: ConfigArg[] | null): Record<string, string> {
  return (args || []).reduce<Record<string, string>>((acc, a) => { acc[a.name] = a.value; return acc; }, {});
}

onLoad(async (query) => {
  templateId.value = String(query?.id || '');
  const data = await fetchShippingTemplate(templateId.value);
  if (data) {
    tpl.value = data;
    kind.value = FIXED_FEE_CALCS.includes(data.calculator?.code)
      ? 'fixed-fee'
      : data.calculator?.code === 'store-pickup-calculator' ? 'store' : 'express';
    const checker = argsToMap(data.checker?.arguments);
    region.value = { excludedAreas: checker.excludedAreas ?? '', orderMinimum: checker.orderMinimum ?? '0' };
    const calc = argsToMap(data.calculator?.arguments);
    fee.value = { ...DEFAULTS, ...calc };
  }
  loading.value = false;
});

async function onSave() {
  if (!templateId.value) return;
  saving.value = true;
  try {
    if (kind.value === 'store') {
      await updateShippingTemplateConfig(templateId.value, null, null);
      uni.showToast({ title: locale.t('shippingMethodConfig.saved') });
      return;
    }
    if (kind.value === 'fixed-fee') {
      const checker = tpl.value?.checker ? { code: tpl.value.checker.code, arguments: tpl.value.checker.arguments ?? [] } : null;
      const calculator = {
        code: tpl.value?.calculator?.code || 'local-delivery-calculator',
        arguments: [{ name: 'shippingPrice', value: String(Math.max(0, Number(fee.value.shippingPrice) || 0)) }],
      };
      await updateShippingTemplateConfig(templateId.value, checker, calculator);
      uni.showToast({ title: locale.t('shippingMethodConfig.saved') });
      return;
    }
    const checker = {
      code: 'tiered-shipping-eligibility-checker',
      arguments: [
        { name: 'orderMinimum', value: region.value.orderMinimum || '0' },
        { name: 'excludedAreas', value: region.value.excludedAreas },
      ],
    };
    const calculator = {
      code: 'tiered-weight-shipping-calculator',
      arguments: [
        { name: 'firstWeight', value: fee.value.firstWeight },
        { name: 'firstWeightFee', value: fee.value.firstWeightFee },
        { name: 'additionalWeightUnit', value: fee.value.additionalWeightUnit },
        { name: 'additionalWeightFee', value: fee.value.additionalWeightFee },
        { name: 'remoteAreaSurcharge', value: fee.value.remoteAreaSurcharge },
        { name: 'remoteAreas', value: fee.value.remoteAreas },
        { name: 'freeShippingThreshold', value: fee.value.freeShippingThreshold },
        { name: 'freeShippingAreas', value: fee.value.freeShippingAreas },
        { name: 'useVolumetricWeight', value: fee.value.useVolumetricWeight },
        { name: 'volumetricDivisor', value: fee.value.volumetricDivisor },
        { name: 'maxShippingFee', value: fee.value.maxShippingFee },
        { name: 'insuranceFeeRate', value: fee.value.insuranceFeeRate },
        { name: 'insuranceMinFee', value: fee.value.insuranceMinFee },
        { name: 'oversizedThreshold', value: fee.value.oversizedThreshold },
        { name: 'oversizedSurcharge', value: fee.value.oversizedSurcharge },
      ],
    };
    await updateShippingTemplateConfig(templateId.value, checker, calculator);
    uni.showToast({ title: locale.t('shippingMethodConfig.saved') });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('shippingMethodConfig.saveFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 140rpx;
  .hint { background: #fff7f0; border: 1px solid #ffe0c4; color: #b05000; font-size: 24rpx; border-radius: 16rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; }
  .section { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 30rpx; margin-bottom: 20rpx;
    .section-title { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 18rpx; }
    .sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; line-height: 1.5; }
    .field { margin-bottom: 16rpx; &.row { display: flex; align-items: center; justify-content: space-between; }
      .label { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 8rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; }
    }
  }
  .save { background: $wa-accent; color: #fff; font-size: 30rpx; font-weight: 700; border-radius: 16rpx; line-height: 88rpx; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>