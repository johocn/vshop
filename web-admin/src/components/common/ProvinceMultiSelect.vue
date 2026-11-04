<template>
  <view class="pms">
    <view class="pms__chips">
      <text v-for="n in selected" :key="n" class="pms__chip">{{ n }}</text>
      <text v-if="!selected.length" class="pms__empty">{{ $t('provinceMulti.placeholder') }}</text>
      <text v-if="!disabled" class="pms__edit" @tap="openPanel">{{ $t('provinceMulti.pick') }}</text>
    </view>

    <view v-if="open" class="pms__mask" @tap="open = false">
      <view class="pms__panel" @tap.stop>
        <view class="pms__head">
          <text class="pms__title">{{ $t('provinceMulti.title') }}</text>
          <text class="pms__done" @tap="confirm">{{ $t('provinceMulti.done') }}</text>
        </view>
        <scroll-view scroll-y class="pms__list">
          <view v-for="p in provinces" :key="p.code" class="pms__row" @tap="toggle(p.name)">
            <text class="pms__name">{{ p.name }}</text>
            <text class="pms__mark" :class="{ on: draft.includes(p.name) }">{{ draft.includes(p.name) ? '✓' : '' }}</text>
          </view>
        </scroll-view>
        <view class="pms__foot">
          <text class="pms__clear" @tap="clearDraft">{{ $t('provinceMulti.clear') }}</text>
          <text class="pms__count">{{ $t('provinceMulti.selectedCount').replace('{count}', String(draft.length)) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { composeProvinceList, findProvince, getProvinces, parseProvinceList } from '../../utils/region';

const props = withDefaults(defineProps<{ modelValue?: string; disabled?: boolean }>(), { modelValue: '', disabled: false });
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const provinces = getProvinces();
const selected = computed(() => parseProvinceList(props.modelValue));
/** 历史文本里无法识别的片段（如「偏远地区」），编辑时原样保留，避免丢配置 */
const unknown = computed(() => selected.value.filter((n) => !findProvince(n)));
const open = ref(false);
const draft = ref<string[]>([]);

function openPanel(): void {
    if (props.disabled) return;
    draft.value = selected.value.filter((n) => Boolean(findProvince(n)));
    open.value = true;
}

function toggle(name: string): void {
    draft.value = draft.value.includes(name) ? draft.value.filter((n) => n !== name) : [...draft.value, name];
}

function clearDraft(): void {
    draft.value = [];
}

function confirm(): void {
    emit('update:modelValue', composeProvinceList([...unknown.value, ...draft.value]));
    open.value = false;
}
</script>

<style lang="scss" scoped>
.pms {
  &__chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10rpx;
  }
  &__chip {
    font-size: 22rpx;
    color: $wa-ink;
    background: $wa-bg;
    border-radius: 999rpx;
    padding: 6rpx 16rpx;
  }
  &__empty { font-size: 24rpx; color: $wa-muted; }
  &__edit { font-size: 24rpx; color: $wa-accent; margin-left: auto; }

  &__mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: flex-end;
  }
  &__panel {
    width: 100%;
    max-height: 78vh;
    background: $wa-bg;
    border-radius: 24rpx 24rpx 0 0;
    display: flex;
    flex-direction: column;
  }
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 28rpx;
    border-bottom: 1rpx solid $wa-rule;
  }
  &__title { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__done { font-size: 26rpx; color: $wa-accent; }
  &__list { flex: 1; min-height: 0; max-height: 60vh; }
  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22rpx 28rpx;
    border-bottom: 1rpx solid $wa-rule;
  }
  &__name { font-size: 26rpx; color: $wa-ink; }
  &__mark {
    width: 40rpx;
    height: 40rpx;
    line-height: 40rpx;
    text-align: center;
    border: 1rpx solid $wa-rule;
    border-radius: 8rpx;
    color: transparent;

    &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; }
  }
  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20rpx 28rpx;
    border-top: 1rpx solid $wa-rule;
  }
  &__clear { font-size: 24rpx; color: $wa-muted; }
  &__count { font-size: 24rpx; color: $wa-muted; }
}
</style>
