<template>
    <view v-if="show" class="calc-sheet" @touchmove.stop.prevent>
        <view class="calc-sheet__mask" @tap="close" />
        <view class="calc-sheet__panel">
            <view class="calc-sheet__head">
                <text class="calc-sheet__title">{{ t('diy.calcDetail') }}</text>
                <text class="calc-sheet__close" @tap="close">×</text>
            </view>
            <scroll-view scroll-y class="calc-sheet__body">
                <template v-if="hasData">
                    <view class="calc-sheet__section">
                        <view class="calc-sheet__row">
                            <text class="calc-sheet__label">{{ t('diy.totalCount') }}</text>
                            <text class="calc-sheet__value">{{ bom.totalCount }}</text>
                        </view>
                        <view v-if="geometry" class="calc-sheet__row">
                            <text class="calc-sheet__label">{{ t('diy.innerCirc') }}</text>
                            <text class="calc-sheet__value">{{ cm(geometry.innerCircumference) }}</text>
                        </view>
                        <view v-if="geometry" class="calc-sheet__row">
                            <text class="calc-sheet__label">{{ t('diy.feedback.fit') }}</text>
                            <text class="calc-sheet__value">{{ t(feedbackI18nKey(geometry.feedback)) }}</text>
                        </view>
                        <view v-if="geometry" class="calc-sheet__row">
                            <text class="calc-sheet__label">{{ t('diy.clearance') }}</text>
                            <text class="calc-sheet__value">{{ fmtMm(geometry.clearance) }}</text>
                        </view>
                        <view v-for="(h, i) in adjustHints" :key="i" class="calc-sheet__row calc-sheet__row--sub">
                            <text class="calc-sheet__label">{{ h.delta > 0 ? '+1' : '-1' }}</text>
                            <text class="calc-sheet__value">{{ t(feedbackI18nKey(h.feedback)) }}</text>
                        </view>
                    </view>

                    <view v-if="cord" class="calc-sheet__section">
                        <view class="calc-sheet__row">
                            <text class="calc-sheet__label">{{ t('diy.cord') }}</text>
                            <text class="calc-sheet__value">{{ fmtMm(cord.length) }} · ⌀{{ cord.diameter }}mm</text>
                        </view>
                        <view class="calc-sheet__row calc-sheet__row--sub">
                            <text class="calc-sheet__label" />
                            <text class="calc-sheet__value calc-sheet__value--muted">{{ t('diy.knotTail') }}</text>
                        </view>
                    </view>

                    <view class="calc-sheet__section">
                        <text class="calc-sheet__sec-title">{{ t('diy.bom') }}</text>
                        <view v-for="(item, i) in bom.items" :key="i" class="calc-sheet__bom-row">
                            <text class="calc-sheet__bom-name">{{ item.name }}</text>
                            <text class="calc-sheet__bom-qty">× {{ item.qty }}</text>
                            <text class="calc-sheet__bom-sub">¥{{ yuan(item.subtotal) }}</text>
                        </view>
                        <view class="calc-sheet__bom-row calc-sheet__bom-row--total">
                            <text class="calc-sheet__bom-name">{{ t('diy.total') }}</text>
                            <text class="calc-sheet__bom-qty">{{ bom.totalCount }}</text>
                            <text class="calc-sheet__bom-sub">¥{{ yuan(bom.totalAmount) }}</text>
                        </view>
                    </view>
                </template>
                <view v-else class="calc-sheet__empty">{{ t('diy.needMain') }}</view>
            </scroll-view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CalculatorOutput } from '../vendor/diy-calc/types';
import { feedbackI18nKey, yuan } from '../composables/useDesigner';

const props = defineProps<{
    show: boolean;
    result: CalculatorOutput | null;
}>();

const emit = defineEmits<{
    (e: 'update:show', v: boolean): void;
}>();

const { t } = useI18n();

function close() {
    emit('update:show', false);
}

const bom = computed(() => props.result?.bom ?? { items: [], totalCount: 0, totalAmount: 0, cord: null, geometry: null });
const geometry = computed(() => props.result?.bom?.geometry ?? null);
const cord = computed(() => props.result?.bom?.cord ?? null);
const hasData = computed(() => bom.value.items.length > 0);

const adjustHints = computed(() => props.result?.calc?.adjustHint ?? []);

/** mm → cm 一位小数 */
function cm(v: number | undefined): string {
    return ((v ?? 0) / 10).toFixed(1) + 'cm';
}
/** mm 整数展示 */
function fmtMm(v: number | undefined): string {
    return Math.round(v ?? 0) + 'mm';
}
</script>

<style lang="scss" scoped>
.calc-sheet {
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

    &__body {
        margin-top: 16rpx;
        max-height: 60vh;
    }

    &__section {
        padding: 16rpx 0;
        border-bottom: 2rpx solid $border-color;
    }

    &__sec-title {
        display: block;
        font-size: 26rpx;
        color: $text-color-secondary;
        margin-bottom: 12rpx;
    }

    &__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8rpx 0;

        &--sub {
            opacity: 0.75;
        }
    }

    &__label {
        font-size: 26rpx;
        color: $text-color-secondary;
    }

    &__value {
        font-size: 26rpx;
        color: $text-color;

        &--muted {
            color: $text-color-placeholder;
            font-size: 22rpx;
        }
    }

    &__bom-row {
        display: flex;
        align-items: center;
        padding: 10rpx 0;

        &--total {
            border-top: 2rpx solid $border-color;
            margin-top: 8rpx;
            padding-top: 16rpx;

            .calc-sheet__bom-name {
                color: $text-color;
                font-weight: 600;
            }

            .calc-sheet__bom-sub {
                color: $price-color;
                font-weight: 600;
            }
        }
    }

    &__bom-name {
        flex: 1;
        font-size: 26rpx;
        color: $text-color;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__bom-qty {
        font-size: 24rpx;
        color: $text-color-secondary;
        margin: 0 24rpx;
    }

    &__bom-sub {
        font-size: 26rpx;
        color: $text-color;
    }

    &__empty {
        padding: 80rpx 0;
        text-align: center;
        font-size: 26rpx;
        color: $text-color-placeholder;
    }
}
</style>
