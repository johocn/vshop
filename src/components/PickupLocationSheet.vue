<template>
  <view v-if="visible" class="sheet-mask" @click.self="close">
    <view class="sheet">
      <view class="sheet__head">
        <text class="sheet__title">{{ title }}</text>
        <view class="sheet__head-actions">
          <text class="sheet__close" @click="close">✕</text>
          <text class="sheet__top-confirm" :class="{ disabled: !tempSelectedId }" @click="confirm">确定</text>
        </view>
      </view>
      <input
        class="sheet__search"
        v-model="keyword"
        placeholder="搜索自提点 / 地址"
        @input="onKeywordChange"
      />
      <scroll-view
        class="sheet__list"
        scroll-y
        @scrolltolower="loadMore"
      >
        <view
          v-for="loc in pagedLocations"
          :key="loc.id"
          class="sheet__item"
          :class="{ active: loc.id === tempSelectedId }"
          @click="selectItem(loc)"
        >
          <text class="sheet__item-name">{{ loc.name }}</text>
          <text class="sheet__item-addr">{{ loc.address }}</text>
          <view class="sheet__item-meta">
            <text v-if="loc.businessHours" class="sheet__item-hours">营业: {{ loc.businessHours }}</text>
            <text v-if="getDistance(loc) !== null" class="sheet__item-dist">{{ getDistance(loc) }}</text>
          </view>
        </view>
        <view v-if="pagedLocations.length === 0" class="sheet__empty">
          <text>未找到匹配的自提点</text>
        </view>
        <view v-if="pagedLocations.length < filteredLocations.length" class="sheet__loading-more">
          <text>上拉加载更多</text>
        </view>
      </scroll-view>
      <button
        class="sheet__confirm"
        :disabled="!tempSelectedId"
        @click="confirm"
      >确认</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PickupLocation, UserLocation } from '../types/pickup';

const props = withDefaults(defineProps<{
  visible: boolean;
  locations: PickupLocation[];
  selectedId?: string;
  userLocation?: UserLocation | null;
  title?: string;
}>(), {
  selectedId: '',
  userLocation: null,
  title: '选择自提点',
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'select', location: PickupLocation): void;
}>();

const keyword = ref('');
const currentPage = ref(1);
const pageSize = 15;
const tempSelectedId = ref(props.selectedId);

// 搜索过滤
const filteredLocations = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return props.locations;
  return props.locations.filter(l =>
    l.name.includes(kw) || l.address.includes(kw)
  );
});

// 分页
const pagedLocations = computed(() =>
  filteredLocations.value.slice(0, currentPage.value * pageSize)
);

function loadMore() {
  if (pagedLocations.value.length < filteredLocations.value.length) {
    currentPage.value++;
  }
}

function onKeywordChange() {
  currentPage.value = 1;
}

function selectItem(loc: PickupLocation) {
  tempSelectedId.value = loc.id;
}

function getDistance(loc: PickupLocation): string | null {
  if (!props.userLocation || !loc.coordinates) return null;
  const dist = haversineDistance(
    props.userLocation.lat,
    props.userLocation.lng,
    loc.coordinates.lat,
    loc.coordinates.lng
  );
  return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function close() {
  emit('update:visible', false);
}

function confirm() {
  const selected = props.locations.find(l => l.id === tempSelectedId.value);
  if (selected) {
    emit('select', selected);
  }
  emit('update:visible', false);
}
</script>

<style lang="scss" scoped>
.sheet-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); z-index: 999;
  display: flex; align-items: flex-end;
}
.sheet {
  background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0;
  padding: 30rpx; max-height: 70vh; display: flex; flex-direction: column;
  &__head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20rpx;
  }
  &__head-actions { display: flex; align-items: center; gap: 24rpx; }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__close { font-size: 36rpx; color: #999; padding: 0 10rpx; }
  &__top-confirm {
    font-size: 30rpx; color: #fff; background: #6b4fff;
    padding: 8rpx 28rpx; border-radius: 32rpx; font-weight: 500;
    &.disabled { opacity: 0.4; }
  }
  &__search {
    height: 72rpx; border: 1rpx solid #e8e8ea; border-radius: 8rpx;
    padding: 0 20rpx; font-size: 28rpx; margin-bottom: 20rpx;
  }
  &__list { flex: 1; max-height: 50vh; }
  &__item {
    padding: 24rpx 0; border-bottom: 1rpx solid #e8e8ea;
    &.active { background: #f0ecff; }
    &-name { font-size: 28rpx; font-weight: bold; display: block; }
    &-addr { font-size: 24rpx; color: #999; display: block; margin-top: 6rpx; }
    &-meta { display: flex; gap: 20rpx; margin-top: 8rpx; }
    &-hours { font-size: 24rpx; color: #999; }
    &-dist { font-size: 24rpx; color: #ff8a3d; }
  }
  &__empty {
    padding: 60rpx 0; text-align: center;
    text { font-size: 28rpx; color: #999; }
  }
  &__loading-more {
    padding: 20rpx 0; text-align: center;
    text { font-size: 24rpx; color: #999; }
  }
  &__confirm {
    margin-top: 20rpx; height: 90rpx; background: #6b4fff;
    color: #fff; font-size: 32rpx; border-radius: 8rpx; border: none;
    &[disabled] { opacity: 0.5; }
  }
}
</style>
