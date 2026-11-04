<template>
  <view class="af">
    <RegionPicker
      :province="province"
      :city="city"
      :district="district"
      :level="level"
      :disabled="disabled"
      clearable
      @update:province="province = $event"
      @update:city="city = $event"
      @update:district="district = $event"
      @change="onRegion"
    />
    <textarea v-if="multiline" class="af__detail af__area" v-model="detail" @input="emitValue" :placeholder="$t('addressField.detailPlaceholder')" :disabled="disabled" />
    <input v-else class="af__detail" v-model="detail" @input="emitValue" :placeholder="$t('addressField.detailPlaceholder')" :disabled="disabled" />
    <text v-if="legacy" class="af__hint">{{ $t('addressField.legacyHint') }}</text>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import RegionPicker from './RegionPicker.vue';
import { composeRegionText, parseRegionText, type RegionLevel } from '../../utils/region';

const props = withDefaults(
  defineProps<{ modelValue?: string; level?: RegionLevel; disabled?: boolean; multiline?: boolean }>(),
  { modelValue: '', level: 'district', disabled: false, multiline: false },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const province = ref('');
const city = ref('');
const district = ref('');
const detail = ref('');
let lastEmitted = '';

function hydrate(text: string): void {
    const p = parseRegionText(text, props.level);
    province.value = p.province;
    city.value = p.city;
    district.value = p.district;
    detail.value = p.detail;
}
hydrate(props.modelValue);

/** 历史自由文本无法匹配任何省份：保留原文，提示但不丢数据 */
const legacy = computed(() => Boolean(props.modelValue) && !province.value);

watch(
  () => props.modelValue,
  (v) => {
    if ((v || '') === lastEmitted) return;
    hydrate(v || '');
  },
);

function emitValue(): void {
    const next = composeRegionText({ province: province.value, city: city.value, district: district.value }, detail.value);
    lastEmitted = next;
    emit('update:modelValue', next);
}

function onRegion(): void {
    emitValue();
}
</script>

<style lang="scss" scoped>
.af {
  width: 100%;

  &__detail {
    margin-top: 12rpx;
    width: 100%;
    box-sizing: border-box;
    background: $wa-bg;
    border-radius: $wa-radius;
    padding: 16rpx 20rpx;
    font-size: 26rpx;
    color: $wa-ink;
  }
  &__hint {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: #d97706;
  }
  &__area {
    min-height: 160rpx;
  }
}
</style>
