<template>
    <view v-if="show" class="mat-sheet" @touchmove.stop.prevent>
        <view class="mat-sheet__mask" @tap="close" />
        <view class="mat-sheet__panel">
            <view class="mat-sheet__head">
                <text class="mat-sheet__title">{{ t('diy.pickMaterial') }}</text>
                <text class="mat-sheet__close" @tap="close">×</text>
            </view>
            <view class="mat-sheet__hint">{{ isFree ? t('diy.appendHint') : t('diy.assignHint') }} · {{ t('diy.longPressHint') }}</view>
            <input class="mat-sheet__search" :placeholder="t('diy.searchPlaceholder')" v-model="keyword" confirm-type="search" />
            <view class="mat-sheet__body">
                <scroll-view scroll-y class="mat-sheet__cats">
                    <view class="mat-sheet__cat" :class="{ 'mat-sheet__cat--on': activeCat === '' }" @tap="activeCat = ''">{{ t('diy.catAll') }}</view>
                    <view
                        v-for="c in categories"
                        :key="c.id"
                        class="mat-sheet__cat"
                        :class="{ 'mat-sheet__cat--on': activeCat === c.id }"
                        @tap="activeCat = c.id"
                    >{{ catName(c) }}</view>
                </scroll-view>
                <scroll-view scroll-y class="mat-sheet__list">
                    <view class="mat-sheet__grid">
                        <view
                            v-for="m in filtered"
                            :key="m.id"
                            class="mat-sheet__item"
                            @tap="onPick(m.id)"
                            @longpress="detailRow = m"
                        >
                            <view
                                class="mat-sheet__dot"
                                :style="{ background: materialColor(m), width: dotRpx(m) + 'rpx', height: dotRpx(m) + 'rpx' }"
                            />
                            <text class="mat-sheet__name">{{ materialName(m, locale) }}</text>
                            <text class="mat-sheet__meta">{{ m.diameter ?? m.axialLength ?? 0 }}mm</text>
                            <text class="mat-sheet__price">¥{{ yuan(m.price) }}{{ t('diy.perBead') }}</text>
                            <view v-if="(counts?.[m.id] ?? 0) > 0" class="mat-sheet__qx">×{{ counts?.[m.id] }}</view>
                        </view>
                    </view>
                    <view v-if="!filtered.length" class="mat-sheet__empty">{{ t('diy.emptyMaterials') }}</view>
                    <MaterialDetailPopup v-model:material="detailRow" @pick="onPick" />
                </scroll-view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { materialColor, materialName, yuan, type DiyMaterialRow } from '../composables/useDesigner';
import MaterialDetailPopup from './MaterialDetailPopup.vue';

const props = defineProps<{
    show: boolean;
    materials: DiyMaterialRow[];
    /** free 模式点击=追加到序列尾部；其余=指派到当前编辑槽位 */
    mode: string;
    /** 分类侧栏（diyCategories 行，name 为 LocalizedText） */
    categories?: any[];
    /** 各素材已选颗数角标 */
    counts?: Record<string, number>;
    /** free 模式连选不关面板 */
    freeMode?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:show', v: boolean): void;
    (e: 'pick', materialId: string): void;
}>();

const { t, locale } = useI18n();
const isFree = computed(() => props.mode === 'free');

const activeCat = ref('');
const keyword = ref('');
const detailRow = ref<DiyMaterialRow | null>(null);

const filtered = computed(() => props.materials.filter(m => {
    if (activeCat.value && m.categoryId !== activeCat.value) return false;
    if (!keyword.value) return true;
    const k = keyword.value.toLowerCase();
    return materialName(m, locale.value).toLowerCase().includes(k) || m.code.toLowerCase().includes(k);
}));

function catName(c: any): string {
    const n = c?.name;
    if (typeof n === 'string' && n) return n;
    if (n && typeof n === 'object') return n[locale.value] || n['zh-CN'] || c.code;
    return c?.code ?? '';
}

function close() {
    emit('update:show', false);
}

function onPick(id: string) {
    emit('pick', id);
    if (!props.freeMode) emit('update:show', false);
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

    &__search {
        height: 64rpx;
        background: $bg-color;
        border-radius: $radius-sm;
        margin-top: 16rpx;
        padding: 0 20rpx;
        font-size: 26rpx;
    }

    &__body {
        display: flex;
        gap: 16rpx;
        margin-top: 16rpx;
    }

    &__cats {
        width: 152rpx;
        flex-shrink: 0;
        max-height: 56vh;
    }

    &__cat {
        padding: 16rpx 8rpx;
        font-size: 24rpx;
        color: $text-color-secondary;
        border-left: 4rpx solid transparent;

        &--on {
            color: $brand-color;
            border-left-color: $brand-color;
            background: $bg-color;
            font-weight: 600;
        }
    }

    &__qx {
        position: absolute;
        top: -10rpx;
        right: -10rpx;
        background: $brand-color;
        color: #fff;
        border-radius: 24rpx;
        font-size: 20rpx;
        padding: 2rpx 12rpx;
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
        width: calc((100% - 32rpx) / 3);
        position: relative;
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
