<template>
    <view v-if="show" class="mat-sheet" @touchmove.stop.prevent>
        <view class="mat-sheet__mask" @tap="close" />
        <view class="mat-sheet__panel">
            <view class="mat-sheet__head">
                <text class="mat-sheet__title">{{ t('diy.pickMaterial') }}</text>
                <text class="mat-sheet__close" @tap="close">×</text>
            </view>
            <view class="mat-sheet__hint">{{ isFree ? t('diy.appendHint') : t('diy.assignHint') }}</view>
            <scroll-view scroll-y class="mat-sheet__list">
                <view class="mat-sheet__grid">
                    <view
                        v-for="m in materials"
                        :key="m.id"
                        class="mat-sheet__item"
                        @tap="onPick(m.id)"
                    >
                        <view
                            class="mat-sheet__dot"
                            :style="{ background: materialColor(m), width: dotRpx(m) + 'rpx', height: dotRpx(m) + 'rpx' }"
                        />
                        <text class="mat-sheet__name">{{ materialName(m, locale) }}</text>
                        <text class="mat-sheet__meta">{{ m.diameter ?? m.axialLength ?? 0 }}mm</text>
                        <text class="mat-sheet__price">¥{{ yuan(m.price) }}{{ t('diy.perBead') }}</text>
                    </view>
                </view>
                <view v-if="!materials.length" class="mat-sheet__empty">{{ t('diy.emptyMaterials') }}</view>
            </scroll-view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { materialColor, materialName, yuan, type DiyMaterialRow } from '../composables/useDesigner';

const props = defineProps<{
    show: boolean;
    materials: DiyMaterialRow[];
    /** free 模式点击=追加到序列尾部；其余=指派到当前编辑槽位 */
    mode: string;
}>();

const emit = defineEmits<{
    (e: 'update:show', v: boolean): void;
    (e: 'pick', materialId: string): void;
}>();

const { t, locale } = useI18n();
const isFree = computed(() => props.mode === 'free');

function close() {
    emit('update:show', false);
}

function onPick(id: string) {
    emit('pick', id);
    emit('update:show', false);
}

/** 预览小圆直径：直径 mm 线性映射到 48~92rpx */
function dotRpx(m: DiyMaterialRow): number {
    const d = m.diameter ?? m.axialLength ?? 8;
    return Math.round(Math.min(92, Math.max(48, d * 9)));
}
</script>

<style lang="scss" scoped>
.mat-sheet {
    position: fixed;
    inset: 0;
    z-index: 999;

    &__mask {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
    }

    &__panel {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        background: #fff;
        border-radius: $radius-lg $radius-lg 0 0;
        padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
    }

    &__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    &__title {
        font-size: 30rpx;
        font-weight: 600;
        color: $text-color;
    }

    &__close {
        font-size: 44rpx;
        color: $text-color-placeholder;
        padding: 0 12rpx;
    }

    &__hint {
        font-size: 22rpx;
        color: $text-color-placeholder;
        margin-top: 8rpx;
    }

    &__list {
        margin-top: 20rpx;
        max-height: 56vh;
    }

    &__grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16rpx;
    }

    &__item {
        width: 212rpx;
        box-sizing: border-box;
        background: $bg-color;
        border-radius: $radius-md;
        padding: 20rpx 16rpx;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    &__dot {
        border-radius: 50%;
        box-shadow: inset -4rpx -6rpx 10rpx rgba(0, 0, 0, 0.18), inset 4rpx 6rpx 10rpx rgba(255, 255, 255, 0.5);
    }

    &__name {
        margin-top: 12rpx;
        font-size: 24rpx;
        color: $text-color;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__meta {
        margin-top: 4rpx;
        font-size: 20rpx;
        color: $text-color-placeholder;
    }

    &__price {
        margin-top: 4rpx;
        font-size: 24rpx;
        color: $price-color;
    }

    &__empty {
        padding: 80rpx 0;
        text-align: center;
        font-size: 26rpx;
        color: $text-color-placeholder;
    }
}
</style>
