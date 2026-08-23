<template>
  <view class="page">
    <view v-if="!loading && !tpl" class="empty">模板不存在</view>
    <template v-if="tpl">
      <view class="hint">配置将写入全局配送模板「{{ tpl.name }}」，之后「复制到本店」生成的方式实例会继承此配置。</view>

      <view class="section">
        <text class="section-title">配送区域（资格检查器）</text>
        <view class="field">
          <text class="label">排除地区（不要送达的省份，逗号分隔）</text>
          <input class="ipt" v-model="region.excludedAreas" placeholder="如 港澳台,海外" />
        </view>
        <view class="field">
          <text class="label">最低订单金额（分，0=不限）</text>
          <input class="ipt" type="number" v-model="region.orderMinimum" placeholder="0" />
        </view>
      </view>

      <view class="section">
        <text class="section-title">运费公式（阶梯重量+区域计费）</text>
        <view class="field"><text class="label">首重 kg</text><input class="ipt" type="digit" v-model="fee.firstWeight" /></view>
        <view class="field"><text class="label">首重费用（分）</text><input class="ipt" type="number" v-model="fee.firstWeightFee" /></view>
        <view class="field"><text class="label">续重单位 kg</text><input class="ipt" type="digit" v-model="fee.additionalWeightUnit" /></view>
        <view class="field"><text class="label">续重费用（分）</text><input class="ipt" type="number" v-model="fee.additionalWeightFee" /></view>
        <view class="field"><text class="label">偏远地区附加费（分）</text><input class="ipt" type="number" v-model="fee.remoteAreaSurcharge" /></view>
        <view class="field"><text class="label">偏远地区（省份逗号分隔）</text><input class="ipt" v-model="fee.remoteAreas" /></view>
        <view class="field"><text class="label">满额包邮门槛（分，0=不启用）</text><input class="ipt" type="number" v-model="fee.freeShippingThreshold" /></view>
        <view class="field"><text class="label">指定省份免邮（逗号分隔）</text><input class="ipt" v-model="fee.freeShippingAreas" /></view>
        <view class="field row"><text class="label">启用体积重</text><switch :checked="fee.useVolumetricWeight === 'true'" @change="fee.useVolumetricWeight = $event.detail.value ? 'true' : 'false'" /></view>
        <view class="field"><text class="label">体积重除数（默认6000）</text><input class="ipt" type="number" v-model="fee.volumetricDivisor" /></view>
        <view class="field"><text class="label">运费封顶（分，0=不限制）</text><input class="ipt" type="number" v-model="fee.maxShippingFee" /></view>
        <view class="field"><text class="label">保价费率（千分比，0=不收取）</text><input class="ipt" type="number" v-model="fee.insuranceFeeRate" /></view>
        <view class="field"><text class="label">保价最低费用（分）</text><input class="ipt" type="number" v-model="fee.insuranceMinFee" /></view>
        <view class="field"><text class="label">超重阈值 kg（0=不检查）</text><input class="ipt" type="digit" v-model="fee.oversizedThreshold" /></view>
        <view class="field"><text class="label">超重附加费（分）</text><input class="ipt" type="number" v-model="fee.oversizedSurcharge" /></view>
      </view>

      <button class="save" @tap="onSave">{{ saving ? '保存中…' : '保存配置' }}</button>
    </template>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchShippingTemplate, updateShippingTemplateConfig, ConfigArg } from '../../../apis/shipping-template';

const tpl = ref<any>(null);
const loading = ref(true);
const saving = ref(false);
const templateId = ref('');

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
    uni.showToast({ title: '已保存' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
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
    .field { margin-bottom: 16rpx; &.row { display: flex; align-items: center; justify-content: space-between; }
      .label { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 8rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; }
    }
  }
  .save { background: $wa-accent; color: #fff; font-size: 30rpx; font-weight: 700; border-radius: 16rpx; line-height: 88rpx; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>