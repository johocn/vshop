<template>
  <!-- 地址编辑抽屉：省/市/区 + 详细地址 + 电话 + 原地址只读对照 -->
  <view v-if="visible" class="mask" @tap="emit('close')">
    <view class="sheet" @tap.stop>
      <text class="stitle">{{ $t('orderAdmin.picking.address.title') }}</text>
      <text class="ssub" v-if="order">{{ order.code }}</text>

      <!-- 原地址只读对照：便于改前核对（不参与提交） -->
      <view class="orig" v-if="order">
        <text class="ol">{{ $t('orderAdmin.picking.address.original') }}</text>
        <text class="ov">{{ order.customerName || '—' }}<text v-if="order.phoneNumber"> · {{ order.phoneNumber }}</text></text>
        <text class="ov">{{ order.address }}</text>
      </view>

      <view class="frow">
        <text class="fl">{{ $t('orderAdmin.picking.address.name') }}</text>
        <input class="inp" v-model="form.fullName" :placeholder="$t('orderAdmin.picking.address.namePh')" />
      </view>
      <view class="frow">
        <text class="fl">{{ $t('orderAdmin.picking.address.phone') }}</text>
        <input class="inp" v-model="form.phoneNumber" :placeholder="$t('orderAdmin.picking.address.phonePh')" />
      </view>

      <view class="frow col">
        <text class="fl">{{ $t('orderAdmin.picking.address.region') }}</text>
        <RegionPicker
          v-model:province="form.province"
          v-model:city="form.city"
          v-model:district="form.district"
        />
      </view>

      <view class="frow">
        <text class="fl">{{ $t('orderAdmin.picking.address.street') }}</text>
        <input class="inp" v-model="form.detail" :placeholder="$t('orderAdmin.picking.address.streetPh')" />
      </view>
      <view class="frow">
        <text class="fl">{{ $t('orderAdmin.picking.address.street2') }}</text>
        <input class="inp" v-model="form.streetLine2" :placeholder="$t('orderAdmin.picking.address.optional')" />
      </view>
      <view class="frow">
        <text class="fl">{{ $t('orderAdmin.picking.address.postal') }}</text>
        <input class="inp" v-model="form.postalCode" :placeholder="$t('orderAdmin.picking.address.optional')" />
      </view>

      <text class="tip">{{ $t('orderAdmin.picking.address.noFreightHint') }}</text>

      <view class="btns">
        <text class="btn ghost" @tap="emit('close')">{{ $t('orderAdmin.picking.cancel') }}</text>
        <text class="btn" :class="{ dis: submitting }" @tap="onSave">{{ $t('orderAdmin.picking.address.save') }}</text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import RegionPicker from '../common/RegionPicker.vue';
import { updateOrderShippingAddress, type PickOrderSnapshot } from '../../apis/picking';
import { useLocaleStore } from '../../stores/localeStore';

const props = defineProps<{
  visible: boolean;
  order: PickOrderSnapshot | null;
  submitting?: boolean;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const locale = useLocaleStore();

// detail = streetLine1 去掉区县后的部分；区县单独一栏，保存时再拼回 streetLine1（订单地址无 district 字段）
const form = ref({
  fullName: '',
  phoneNumber: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  streetLine2: '',
  postalCode: '',
});
const saving = ref(false);

// 每次打开都从候选/成员快照重置（表单是临时态，不跨订单残留）
watch(
  () => [props.visible, props.order?.id] as const,
  ([v]) => {
    if (!v || !props.order) return;
    const o = props.order;
    form.value = {
      fullName: o.customerName || '',
      phoneNumber: o.phoneNumber || '',
      province: o.province || '',
      city: o.city || '',
      district: '',
      detail: o.streetLine1 || '',
      streetLine2: o.streetLine2 || '',
      postalCode: o.postalCode || '',
    };
  },
  { immediate: true },
);

async function onSave(): Promise<void> {
  const o = props.order;
  if (!o) return;
  const fullName = form.value.fullName.trim();
  const phoneNumber = form.value.phoneNumber.trim();
  const detail = form.value.detail.trim();
  if (!fullName) {
    uni.showToast({ title: locale.t('orderAdmin.picking.address.requireName'), icon: 'none' });
    return;
  }
  if (!phoneNumber) {
    uni.showToast({ title: locale.t('orderAdmin.picking.address.requirePhone'), icon: 'none' });
    return;
  }
  if (!detail) {
    uni.showToast({ title: locale.t('orderAdmin.picking.address.requireStreet'), icon: 'none' });
    return;
  }
  // 区县若已包含在详细地址开头则不重复拼接（避免「朝阳区朝阳区XX路」）
  const d = form.value.district.trim();
  const rest = d && detail.startsWith(d) ? detail.slice(d.length).trim() : detail;
  const streetLine1 = `${d}${rest}`.trim();

  if (saving.value || props.submitting) return;
  saving.value = true;
  try {
    await updateOrderShippingAddress(o.id, {
      fullName,
      phoneNumber,
      province: form.value.province.trim(),
      city: form.value.city.trim(),
      streetLine1,
      streetLine2: form.value.streetLine2.trim(),
      postalCode: form.value.postalCode.trim(),
      countryCode: 'CN',
    });
    uni.showToast({ title: locale.t('orderAdmin.picking.address.saved'), icon: 'success' });
    emit('saved');
  } catch (e: any) {
    // 失败保留表单输入，只弹后端原因原文（设计 §9：不静默）
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.address.saveFailed'), icon: 'none', duration: 3000 });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 20;
}
.sheet {
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  background: $wa-card;
  border-radius: $wa-radius $wa-radius 0 0;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));

  .stitle { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  .ssub { display: block; font-size: 24rpx; color: $wa-muted; margin-top: 6rpx; }

  .orig {
    margin-top: 20rpx;
    padding: 18rpx 20rpx;
    background: $wa-bg;
    border-radius: $wa-radius;

    .ol { display: block; font-size: 22rpx; color: $wa-muted; }
    .ov { display: block; font-size: 24rpx; color: $wa-ink; margin-top: 6rpx; line-height: 1.5; }
  }

  .frow {
    display: flex;
    align-items: center;
    gap: 16rpx;
    margin-top: 22rpx;

    &.col { flex-direction: column; align-items: stretch; }

    .fl { font-size: 26rpx; color: $wa-ink; flex: none; width: 140rpx; }
    &.col .fl { width: auto; margin-bottom: 10rpx; }
    .inp {
      flex: 1;
      background: $wa-bg;
      border-radius: $wa-radius;
      padding: 16rpx 20rpx;
      font-size: 26rpx;
      color: $wa-ink;
      box-sizing: border-box;
    }
  }

  .tip { display: block; margin-top: 20rpx; font-size: 22rpx; color: $wa-muted; }

  .btns {
    display: flex;
    gap: 20rpx;
    margin-top: 32rpx;

    .btn {
      flex: 1;
      text-align: center;
      font-size: 28rpx;
      color: #fff;
      background: $wa-accent;
      border-radius: $wa-radius;
      padding: 20rpx 0;

      &.ghost { background: transparent; color: $wa-ink; border: 1rpx solid $wa-rule; }
      &.dis { opacity: 0.5; }
    }
  }
}
</style>