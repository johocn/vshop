<template>
  <view v-if="visible" class="region-mask" @click.self="close">
    <view class="region-sheet">
      <!-- 顶部：标题 + 确定按钮 -->
      <view class="region-sheet__head">
        <text class="region-sheet__title">选择省/市/区</text>
        <view class="region-sheet__actions">
          <text class="region-sheet__cancel" @click="close">取消</text>
          <text
            class="region-sheet__confirm"
            :class="{ disabled: !tempSelected.province }"
            @click="confirm"
          >确定</text>
        </view>
      </view>

      <!-- Tab 栏：显示已选省/市/区，可点击切换 -->
      <view class="region-sheet__tabs">
        <view
          class="region-tab"
          :class="{ active: activeColumn === 'province' }"
          @click="switchColumn('province')"
        >
          <text>{{ tempSelected.province?.name || '请选择' }}</text>
        </view>
        <text v-if="tempSelected.province" class="region-tab__sep">/</text>
        <view
          v-if="tempSelected.province"
          class="region-tab"
          :class="{ active: activeColumn === 'city' }"
          @click="switchColumn('city')"
        >
          <text>{{ tempSelected.city?.name || '请选择' }}</text>
        </view>
        <text v-if="tempSelected.city" class="region-tab__sep">/</text>
        <view
          v-if="tempSelected.city"
          class="region-tab"
          :class="{ active: activeColumn === 'district' }"
          @click="switchColumn('district')"
        >
          <text>{{ tempSelected.district?.name || '请选择' }}</text>
        </view>
      </view>

      <!-- 列表 -->
      <scroll-view class="region-sheet__list" scroll-y>
        <view v-if="loading" class="region-sheet__loading">
          <text>加载中...</text>
        </view>
        <view v-else>
          <view
            v-for="item in currentList"
            :key="item.adcode"
            class="region-item"
            :class="{ selected: isItemSelected(item) }"
            @click="selectItem(item)"
          >
            <text>{{ item.name }}</text>
            <text v-if="isItemSelected(item)" class="region-item__check">✓</text>
          </view>
          <view v-if="!loading && currentList.length === 0" class="region-sheet__empty">
            <text>暂无数据</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { getDistricts, type DistrictNode } from '../api/queries/region';
import { getStaticProvinces, getStaticCities, getStaticDistricts, type RegionItem } from '../api/queries/region-data';

interface SelectedRegion {
  province: DistrictNode | null;
  city: DistrictNode | null;
  district: DistrictNode | null;
}

const props = withDefaults(defineProps<{
  visible: boolean;
  /** 初始值：省市区名称（用于回显） */
  initProvince?: string;
  initCity?: string;
  initDistrict?: string;
}>(), {
  initProvince: '',
  initCity: '',
  initDistrict: '',
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', region: { province: string; city: string; district: string; adcode: string }): void;
}>();

const loading = ref(false);
const activeColumn = ref<'province' | 'city' | 'district'>('province');
const provinceList = ref<DistrictNode[]>([]);
const cityList = ref<DistrictNode[]>([]);
const districtList = ref<DistrictNode[]>([]);
const tempSelected = ref<SelectedRegion>({
  province: null,
  city: null,
  district: null,
});

// 当前列展示的数据
const currentList = computed(() => {
  if (activeColumn.value === 'province') return provinceList.value;
  if (activeColumn.value === 'city') return cityList.value;
  return districtList.value;
});

// 弹窗打开时加载省级数据
watch(() => props.visible, async (val) => {
  if (val) {
    // 如果有初始值，尝试回显
    if (props.initProvince && !tempSelected.value.province) {
      // 先加载省级列表用于回显
      await loadProvinces();
      const p = provinceList.value.find(p => p.name === props.initProvince);
      if (p) {
        tempSelected.value.province = p;
        await loadCities(p.adcode);
        const c = cityList.value.find(c => c.name === props.initCity);
        if (c) {
          tempSelected.value.city = c;
          await loadDistricts(c.adcode);
          const d = districtList.value.find(d => d.name === props.initDistrict);
          if (d) tempSelected.value.district = d;
        }
      }
      activeColumn.value = 'district';
    } else if (!tempSelected.value.province) {
      await loadProvinces();
      activeColumn.value = 'province';
    }
  }
});

async function loadProvinces() {
  loading.value = true;
  try {
    provinceList.value = await getDistricts();
  } catch (e) {
    console.warn('[RegionPicker] loadProvinces failed, using static data', e);
    provinceList.value = getStaticProvinces() as DistrictNode[];
  }
  loading.value = false;
}

async function loadCities(parentAdcode: string) {
  loading.value = true;
  try {
    cityList.value = await getDistricts(parentAdcode);
  } catch (e) {
    console.warn('[RegionPicker] loadCities failed, using static data', e);
    cityList.value = getStaticCities(parentAdcode) as DistrictNode[];
  }
  loading.value = false;
}

async function loadDistricts(parentAdcode: string) {
  loading.value = true;
  try {
    districtList.value = await getDistricts(parentAdcode);
  } catch (e) {
    console.warn('[RegionPicker] loadDistricts failed, using static data', e);
    districtList.value = getStaticDistricts(parentAdcode) as DistrictNode[];
  }
  loading.value = false;
}

function isItemSelected(item: DistrictNode): boolean {
  if (activeColumn.value === 'province') return tempSelected.value.province?.adcode === item.adcode;
  if (activeColumn.value === 'city') return tempSelected.value.city?.adcode === item.adcode;
  return tempSelected.value.district?.adcode === item.adcode;
}

async function selectItem(item: DistrictNode) {
  if (activeColumn.value === 'province') {
    tempSelected.value.province = item;
    tempSelected.value.city = null;
    tempSelected.value.district = null;
    cityList.value = [];
    districtList.value = [];
    await loadCities(item.adcode);
    activeColumn.value = 'city';
  } else if (activeColumn.value === 'city') {
    tempSelected.value.city = item;
    tempSelected.value.district = null;
    districtList.value = [];
    await loadDistricts(item.adcode);
    activeColumn.value = 'district';
  } else {
    tempSelected.value.district = item;
    // 选完区，直接确认
    confirm();
  }
}

function switchColumn(col: 'province' | 'city' | 'district') {
  // 只能切到已加载数据的列
  if (col === 'province') {
    activeColumn.value = 'province';
  } else if (col === 'city' && tempSelected.value.province) {
    activeColumn.value = 'city';
  } else if (col === 'district' && tempSelected.value.city) {
    activeColumn.value = 'district';
  }
}

function close() {
  emit('update:visible', false);
}

function confirm() {
  if (!tempSelected.value.province) return;
  const province = tempSelected.value.province?.name || '';
  const city = tempSelected.value.city?.name || '';
  const district = tempSelected.value.district?.name || '';
  const adcode = tempSelected.value.district?.adcode || tempSelected.value.city?.adcode || tempSelected.value.province?.adcode || '';
  emit('confirm', { province, city, district, adcode });
  emit('update:visible', false);
}
</script>

<style lang="scss" scoped>
.region-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); z-index: 1000;
  display: flex; align-items: flex-end;
}
.region-sheet {
  background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0;
  max-height: 75vh; display: flex; flex-direction: column;
  &__head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 24rpx 30rpx; border-bottom: 1rpx solid #f0f0f0;
  }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__actions { display: flex; align-items: center; gap: 24rpx; }
  &__cancel { font-size: 28rpx; color: #999; }
  &__confirm {
    font-size: 30rpx; color: #fff; background: #6b4fff;
    padding: 8rpx 28rpx; border-radius: 32rpx; font-weight: 500;
    &.disabled { opacity: 0.4; }
  }
  &__tabs {
    display: flex; align-items: center; padding: 20rpx 30rpx;
    border-bottom: 1rpx solid #f0f0f0; gap: 8rpx; flex-wrap: wrap;
  }
  &__list { flex: 1; max-height: 55vh; }
  &__loading {
    padding: 60rpx 0; text-align: center;
    text { font-size: 28rpx; color: #999; }
  }
  &__empty {
    padding: 60rpx 0; text-align: center;
    text { font-size: 28rpx; color: #999; }
  }
}
.region-tab {
  font-size: 26rpx; color: #999; padding: 4rpx 8rpx;
  &.active { color: #6b4fff; font-weight: 500; border-bottom: 2rpx solid #6b4fff; }
  &__sep { color: #ddd; font-size: 24rpx; }
}
.region-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 28rpx 30rpx; border-bottom: 1rpx solid #f5f5f5;
  font-size: 28rpx; color: #333;
  &.selected { color: #6b4fff; background: #f8f5ff; }
  &__check { color: #6b4fff; font-size: 32rpx; }
}
</style>
