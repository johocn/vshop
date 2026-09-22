<template>
  <!-- 省/市/区三级联动（数据源复用 cjk-plugin 行政区划，不新造） -->
  <view class="region">
    <picker class="region-item" :range="provinceNames" :disabled="disabled" @change="onProvince">
      <view class="rp"><text>{{ province || placeholderProvince }}</text><text class="caret">▾</text></view>
    </picker>
    <picker class="region-item" :range="cityNames" :disabled="disabled || !province" @change="onCity">
      <view class="rp"><text>{{ city || placeholderCity }}</text><text class="caret">▾</text></view>
    </picker>
    <picker class="region-item" :range="districtNames" :disabled="disabled || !city" @change="onDistrict">
      <view class="rp"><text>{{ district || placeholderDistrict }}</text><text class="caret">▾</text></view>
    </picker>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { fetchDistricts, type DistrictNode } from '../../apis/map';

const props = withDefaults(
  defineProps<{
    province?: string;
    city?: string;
    district?: string;
    disabled?: boolean;
    placeholderProvince?: string;
    placeholderCity?: string;
    placeholderDistrict?: string;
  }>(),
  {
    province: '',
    city: '',
    district: '',
    disabled: false,
    placeholderProvince: '省份',
    placeholderCity: '城市',
    placeholderDistrict: '区县',
  },
);
const emit = defineEmits<{
  (e: 'update:province', v: string): void;
  (e: 'update:city', v: string): void;
  (e: 'update:district', v: string): void;
}>();

const provinces = ref<DistrictNode[]>([]);
const cities = ref<DistrictNode[]>([]);
const districts = ref<DistrictNode[]>([]);
const provinceNames = computed(() => provinces.value.map((p) => p.name));
const cityNames = computed(() => cities.value.map((c) => c.name));
const districtNames = computed(() => districts.value.map((d) => d.name));

// 列表加载全部由 props 变化驱动（单一来源），选值只 emit，不在这里写状态
watch(
  () => props.province,
  async (v) => {
    const p = provinces.value.find((x) => x.name === v);
    if (!p) {
      cities.value = [];
      return;
    }
    const list = await fetchDistricts(p.adcode).catch(() => [] as DistrictNode[]);
    if (props.province === v) cities.value = list;
  },
);
watch(
  () => props.city,
  async (v) => {
    const c = cities.value.find((x) => x.name === v);
    if (!c) {
      districts.value = [];
      return;
    }
    const list = await fetchDistricts(c.adcode).catch(() => [] as DistrictNode[]);
    if (props.city === v) districts.value = list;
  },
);

// 编辑回填：外部传入的省/市需要把下级列表补齐（watch 在列表为空时找不到节点）
async function hydrate(): Promise<void> {
  const p = provinces.value.find((x) => x.name === props.province);
  if (!p) return;
  cities.value = await fetchDistricts(p.adcode).catch(() => [] as DistrictNode[]);
  const c = cities.value.find((x) => x.name === props.city);
  if (!c) return;
  districts.value = await fetchDistricts(c.adcode).catch(() => [] as DistrictNode[]);
}

onMounted(async () => {
  provinces.value = await fetchDistricts(null).catch(() => [] as DistrictNode[]);
  await hydrate();
});

function onProvince(e: any): void {
  const p = provinces.value[Number(e?.detail?.value)];
  if (!p) return;
  emit('update:province', p.name);
  emit('update:city', '');
  emit('update:district', '');
}
function onCity(e: any): void {
  const c = cities.value[Number(e?.detail?.value)];
  if (!c) return;
  emit('update:city', c.name);
  emit('update:district', '');
}
function onDistrict(e: any): void {
  const d = districts.value[Number(e?.detail?.value)];
  if (!d) return;
  emit('update:district', d.name);
}
</script>

<style lang="scss" scoped>
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
  }
  .caret { color: $wa-muted; font-size: 22rpx; }
}
</style>