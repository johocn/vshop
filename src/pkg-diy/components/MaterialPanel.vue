<template>
    <view class="mat-panel">
        <view class="mat-panel__head">
            <view class="mat-panel__tabs">
                <text class="mat-panel__tab" :class="{ 'mat-panel__tab--on': tab === 'beads' }" @tap="tab = 'beads'">{{ t('diy.tabBeads') }}</text>
                <text class="mat-panel__tab" :class="{ 'mat-panel__tab--on': tab === 'decors' }" @tap="tab = 'decors'">{{ t('diy.tabDecors') }}</text>
            </view>
            <text class="mat-panel__count">{{ t('diy.materialCount', { n: filtered.length }) }}</text>
            <text class="mat-panel__hint">{{ isFree ? t('diy.appendHint') : t('diy.assignHint') }}</text>
        </view>
        <input class="mat-panel__search" :placeholder="t('diy.searchPlaceholder')" v-model="keyword" confirm-type="search" />
        <view class="mat-panel__body">
            <scroll-view scroll-y class="mat-panel__cats">
                <view class="mat-panel__cat" :class="{ 'mat-panel__cat--on': activeCat === '' }" @tap="activeCat = ''">{{ t('diy.catAll') }}</view>
                <view
                    v-for="c in categories"
                    :key="c.id"
                    class="mat-panel__cat"
                    :class="{ 'mat-panel__cat--on': activeCat === c.id }"
                    @tap="activeCat = c.id"
                >{{ catName(c) }}</view>
            </scroll-view>
            <scroll-view scroll-y class="mat-panel__list">
                <view class="mat-panel__grid">
                    <view
                        v-for="m in filtered"
                        :key="m.id"
                        class="mat-panel__item"
                        @tap="onPick(m.id)"
                        @longpress="detailRow = m"
                    >
                        <view class="mat-panel__thumb">
                            <image v-if="m.renderUrl" class="mat-panel__img" :src="m.renderUrl" mode="aspectFill" />
                            <view
                                v-else
                                class="mat-panel__dot"
                                :style="{ background: materialColor(m), width: dotRpx(m) + 'rpx', height: dotRpx(m) + 'rpx' }"
                            />
                            <view v-if="(counts?.[m.id] ?? 0) > 0" class="mat-panel__qx">×{{ counts?.[m.id] }}</view>
                        </view>
                        <text class="mat-panel__name">{{ materialName(m, locale) }}</text>
                        <text class="mat-panel__meta">{{ m.diameter ?? m.axialLength ?? 0 }}mm · ¥{{ yuan(m.price) }}</text>
                    </view>
                </view>
                <view v-if="!filtered.length" class="mat-panel__empty">{{ t('diy.emptyMaterials') }}</view>
            </scroll-view>
        </view>
        <MaterialDetailPopup v-model:material="detailRow" @pick="onPick" />
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { materialColor, materialName, yuan, type DiyMaterialRow } from '../composables/useDesigner';
import MaterialDetailPopup from './MaterialDetailPopup.vue';

const props = defineProps<{
    materials: DiyMaterialRow[];
    /** free 模式点击=追加到序列尾部；其余=指派到当前编辑槽位 */
    mode: string;
    /** 分类侧栏（diyCategories 行，name 为 LocalizedText） */
    categories?: any[];
    /** 各素材已选颗数角标 */
    counts?: Record<string, number>;
}>();

const emit = defineEmits<{
    (e: 'pick', materialId: string): void;
}>();

const { t, locale } = useI18n();
const isFree = computed(() => props.mode === 'free');

const tab = ref<'beads' | 'decors'>('beads');
const activeCat = ref('');
const keyword = ref('');
const detailRow = ref<DiyMaterialRow | null>(null);

const filtered = computed(() => props.materials.filter(m => {
    const isDecor = !!(m.attrs && (m.attrs as any).decor);
    if ((tab.value === 'decors') !== isDecor) return false;
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

function onPick(id: string) {
    emit('pick', id);
}

/** 预览小圆直径：直径 mm 线性映射到 48~92rpx */
function dotRpx(m: DiyMaterialRow): number {
    const d = m.diameter ?? m.axialLength ?? 8;
    return Math.round(Math.min(92, Math.max(48, d * 9)));
}
</script>

<style lang="scss" scoped>
.mat-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;

    &__head {
        display: flex;
        align-items: center;
        gap: 16rpx;
        flex-shrink: 0;
    }

    &__tabs {
        display: flex;
        gap: 8rpx;
    }

    &__tab {
        padding: 8rpx 24rpx;
        border-radius: 28rpx;
        font-size: 26rpx;
        color: $text-color-secondary;
        background: $bg-color;
        border: 2rpx solid $border-color;

        &--on {
            color: #fff;
            background: $brand-color;
            border-color: $brand-color;
            font-weight: 600;
        }
    }

    &__count {
        font-size: 22rpx;
        color: $text-color-placeholder;
        flex-shrink: 0;
    }

    &__hint {
        margin-left: auto;
        font-size: 20rpx;
        color: $text-color-placeholder;
        max-width: 220rpx;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__search {
        height: 64rpx;
        background: $bg-color;
        border-radius: $radius-sm;
        margin-top: 12rpx;
        padding: 0 20rpx;
        font-size: 26rpx;
        flex-shrink: 0;
    }

    &__body {
        display: flex;
        gap: 16rpx;
        margin-top: 16rpx;
        flex: 1;
        min-height: 0;
    }

    &__cats {
        width: 152rpx;
        flex-shrink: 0;
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

    &__list {
        flex: 1;
        min-width: 0;
    }

    &__grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16rpx;
        padding-bottom: 16rpx;
    }

    &__item {
        width: calc((100% - 32rpx) / 3);
        position: relative;
        box-sizing: border-box;
        background: $bg-color;
        border-radius: $radius-md;
        padding: 12rpx;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    &__thumb {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100rpx;
    }

    &__img {
        width: 100%;
        height: 140rpx;
        border-radius: $radius-sm;
        background: #fff;
    }

    &__dot {
        border-radius: 50%;
        box-shadow: inset -4rpx -6rpx 10rpx rgba(0, 0, 0, 0.18), inset 4rpx 6rpx 10rpx rgba(255, 255, 255, 0.5);
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

    &__name {
        margin-top: 10rpx;
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
