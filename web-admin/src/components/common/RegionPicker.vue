<template>
  <!-- 省/市/区三级联动：离线行政区划数据（element-china-area-data），不依赖后端空接口 -->
  <view class="region-wrap">
    <view class="region">
      <picker class="region-item" :range="provinceNames" :value="provinceIndex" :disabled="disabled" @change="onProvince">
        <view class="rp" :class="{ empty: !province }"><text>{{ province || $t('regionPicker.province') }}</text><text class="caret">▾</text></view>
      </picker>
      <picker
        v-if="level !== 'province'"
        class="region-item"
        :range="cityNames"
        :value="cityIndex"
        :disabled="disabled || !province"
        @change="onCity"
      >
        <view class="rp" :class="{ empty: !city }"><text>{{ city || $t('regionPicker.city') }}</text><text class="caret">▾</text></view>
      </picker>
      <picker
        v-if="level === 'district'"
        class="region-item"
        :range="districtNames"
        :value="districtIndex"
        :disabled="disabled || !city"
        @change="onDistrict"
      >
        <view class="rp" :class="{ empty: !district }"><text>{{ district || $t('regionPicker.district') }}</text><text class="caret">▾</text></view>
      </picker>
    </view>
    <view v-if="showHint" class="region-foot">
      <text class="hint">{{ $t('regionPicker.unmatched') }}</text>
      <text v-if="clearable && hasValue" class="clear" @click="clear">{{ $t('regionPicker.clear') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { findCity, findProvince, getCities, getDistricts, getProvinces, resolveCodes, type RegionLevel } from '../../utils/region';

const props = withDefaults(
  defineProps<{
    province?: string;
    city?: string;
    district?: string;
    level?: RegionLevel;
    disabled?: boolean;
    clearable?: boolean;
    /** 历史自由文本无法匹配行政区划时显示提示（由调用方决定是否显示） */
    showHint?: boolean;
  }>(),
  {
    province: '',
    city: '',
    district: '',
    level: 'district',
    disabled: false,
    clearable: false,
    showHint: false,
  },
);

const emit = defineEmits<{
  (e: 'update:province', v: string): void;
  (e: 'update:city', v: string): void;
  (e: 'update:district', v: string): void;
  (e: 'change', v: { province: string; city: string; district: string; provinceCode: string; cityCode: string; districtCode: string }): void;
}>();

const provinces = getProvinces();
const provinceNames = provinces.map((p) => p.name);
const cities = computed(() => (props.province ? getCities(props.province) : []));
const cityNames = computed(() => cities.value.map((c) => c.name));
const districts = computed(() => (props.city ? getDistricts(props.city, props.province) : []));
const districtNames = computed(() => districts.value.map((d) => d.name));

const provinceIndex = computed(() => {
    const i = provinceNames.indexOf(props.province);
    return i < 0 ? 0 : i;
});
const cityIndex = computed(() => {
    const c = findCity(props.city, props.province);
    const i = c ? cityNames.value.indexOf(c.name) : -1;
    return i < 0 ? 0 : i;
});
const districtIndex = computed(() => {
    const i = districtNames.value.indexOf(props.district);
    return i < 0 ? 0 : i;
});

const hasValue = computed(() => Boolean(props.province || props.city || props.district));
const showHint = computed(() => {
    if (!props.showHint) return false;
    return Boolean(props.province && !findProvince(props.province));
});

function emitChange(): void {
    emit('change', {
        province: props.province,
        city: props.city,
        district: props.district,
        ...resolveCodes(props.province, props.city, props.district),
    });
}

function onProvince(e: any): void {
    const p = provinces[Number(e?.detail?.value)];
    if (!p) return;
    // 重复确认同一省份时保留下级已选值，避免误清空
    if (p.name === props.province) {
        emitChange();
        return;
    }
    emit('update:province', p.name);
    emit('update:city', '');
    emit('update:district', '');
    emit('change', { province: p.name, city: '', district: '', provinceCode: p.code, cityCode: '', districtCode: '' });
}

function onCity(e: any): void {
    const c = cities.value[Number(e?.detail?.value)];
    if (!c) return;
    if (c.name === props.city) {
        // 同一城市只重新同步编码（如门店 cityCode），不清空已选区县
        emitChange();
        return;
    }
    emit('update:city', c.name);
    emit('update:district', '');
    emit('change', { province: props.province, city: c.name, district: '', provinceCode: resolveCodes(props.province, '', '').provinceCode, cityCode: c.code, districtCode: '' });
}

function onDistrict(e: any): void {
    const d = districts.value[Number(e?.detail?.value)];
    if (!d) return;
    emit('update:district', d.name);
    emitChange();
}

function clear(): void {
    emit('update:province', '');
    emit('update:city', '');
    emit('update:district', '');
    emit('change', { province: '', city: '', district: '', provinceCode: '', cityCode: '', districtCode: '' });
}
</script>

<style lang="scss" scoped>
.region-wrap {
  width: 100%;
}
.region {
  display: flex;
  gap: 12rpx;

  .region-item { flex: 1; min-width: 0; }

  .rp {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: $wa-bg;
    border-radius: $wa-radius;
    padding: 16rpx 20rpx;
    font-size: 26rpx;
    color: $wa-ink;

    &.empty { color: $wa-muted; }
    text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .caret { color: $wa-muted; font-size: 22rpx; flex: none; margin-left: 8rpx; }
}
.region-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;

  .hint { font-size: 22rpx; color: #d97706; }
  .clear { font-size: 22rpx; color: $wa-muted; margin-left: auto; }
}
</style>
