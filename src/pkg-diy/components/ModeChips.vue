<template>
    <view class="mode-chips">
        <view
            v-for="m in modes"
            :key="m"
            class="mode-chips__chip"
            :class="{ 'mode-chips__chip--on': modelValue === m }"
            @tap="onPick(m)"
        >
            {{ t('diy.mode.' + m) }}
        </view>
        <view v-if="count > 0" class="mode-chips__count">{{ t('diy.beadCount') }} {{ count }}</view>
    </view>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DesignerMode } from '../composables/useDesigner';

const props = defineProps<{
    modelValue: DesignerMode;
    /** 当前计算颗数（0/空不展示） */
    count?: number;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: DesignerMode): void;
}>();

const { t } = useI18n();
const modes: DesignerMode[] = ['free', 'byWrist', 'byCount', 'pattern'];

function onPick(m: DesignerMode) {
    if (m !== props.modelValue) emit('update:modelValue', m);
}
</script>

<style lang="scss" scoped>
.mode-chips {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 16rpx 20rpx;

    &__chip {
        padding: 12rpx 24rpx;
        border-radius: 32rpx;
        font-size: 26rpx;
        color: $text-color-secondary;
        background: $bg-color;
        border: 2rpx solid $border-color;

        &--on {
            color: #fff;
            background: $brand-color;
            border-color: $brand-color;
        }
    }

    &__count {
        margin-left: auto;
        font-size: 24rpx;
        color: $text-color-secondary;
    }
}
</style>
