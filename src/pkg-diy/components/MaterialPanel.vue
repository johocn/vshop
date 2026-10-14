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
                <view class="mat-panel__grid" :key="tab + '-' + activeCat + '-' + page">
                    <view
                        v-for="m in paged"
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
                            <!-- free：步进器（− 减少 / ＋ 追加，一目了然）；非 free：只读 ×N 角标（数量来自槽位 BOM 收敛） -->
                            <view v-if="isFree && (counts?.[m.id] ?? 0) > 0" class="mat-panel__step" @tap.stop>
                                <text class="mat-panel__step-btn" @tap.stop="emit('dec', m.id)">−</text>
                                <text class="mat-panel__step-n">{{ counts?.[m.id] }}</text>
                                <text class="mat-panel__step-btn" @tap.stop="onPick(m.id)">＋</text>
                            </view>
                            <view v-else-if="(counts?.[m.id] ?? 0) > 0" class="mat-panel__qx">×{{ counts?.[m.id] }}</view>
                        </view>
                        <text class="mat-panel__name">{{ materialName(m, locale) }}</text>
                        <text class="mat-panel__meta">{{ m.diameter ?? m.axialLength ?? 0 }}mm · ¥{{ yuan(m.price) }}</text>
                    </view>
                </view>
                <view v-if="!filtered.length" class="mat-panel__empty">{{ t('diy.emptyMaterials') }}</view>
            </scroll-view>
        </view>
        <!-- 分页条（素材超出单页自动出现；与 tab/分类/搜索联动） -->
        <view v-if="pageTotal > 1" class="mat-panel__pager">
            <text class="mat-panel__pg" :class="{ 'mat-panel__pg--off': page === 1 }" @tap="goPage(page - 1)">‹</text>
            <template v-for="(p, i) in pageList(page, pageTotal)" :key="i">
                <text v-if="p === '…'" class="mat-panel__pg mat-panel__pg--ell">…</text>
                <text v-else class="mat-panel__pg" :class="{ 'mat-panel__pg--on': p === page }" @tap="goPage(p)">{{ p }}</text>
            </template>
            <text class="mat-panel__pg" :class="{ 'mat-panel__pg--off': page === pageTotal }" @tap="goPage(page + 1)">›</text>
        </view>
        <MaterialDetailPopup v-model:material="detailRow" @pick="onPick" />
    </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
    (e: 'pick', materialId: string, tab: 'beads' | 'decors'): void;
    (e: 'dec', materialId: string): void;
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
    // 统一字符串比较：素材 categoryId（后端数值）与分类 id（字符串）类型不一致会导致恒空过滤
    if (activeCat.value && String(m.categoryId ?? '') !== String(activeCat.value)) return false;
    if (!keyword.value) return true;
    const k = keyword.value.toLowerCase();
    return materialName(m, locale.value).toLowerCase().includes(k) || m.code.toLowerCase().includes(k);
}));

/** 分页：单页 9 款（3 列 × 3 行），素材超出单页自动出现页码条；翻页/过滤纯前端即时完成 */
const PAGE_SIZE = 9;
const page = ref(1);
const pageTotal = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
// 过滤联动：切 tab/分类/搜索条件时回到第 1 页；总页数收缩时收敛当前页
watch([activeCat, keyword, tab], () => { page.value = 1; });
watch(pageTotal, t => { if (page.value > t) page.value = t; });

/** 页码条：≤7 页全显，否则首尾 + 当前±1 + 省略号折叠 */
function pageList(cur: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const s = [...new Set([1, 2, cur - 1, cur, cur + 1, total - 1, total].filter(x => x >= 1 && x <= total))].sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    let prev = 0;
    for (const x of s) { if (x - prev > 1) out.push('…'); out.push(x); prev = x; }
    return out;
}
function goPage(p: number) { page.value = Math.max(1, Math.min(pageTotal.value, p)); }

function catName(c: any): string {
    const n = c?.name;
    if (typeof n === 'string' && n) return n;
    if (n && typeof n === 'object') return n[locale.value] || n['zh-CN'] || c.code;
    return c?.code ?? '';
}

function onPick(id: string) {
    emit('pick', id, tab.value);
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
        /* 翻页/切分类淡入过渡（key 变化重挂载自动播放） */
        animation: mat-fade 0.16s ease;
    }

    &__pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10rpx;
        padding: 14rpx 0 2rpx;
        flex-shrink: 0;
    }

    &__pg {
        min-width: 48rpx;
        height: 48rpx;
        padding: 0 10rpx;
        border-radius: 12rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2rpx solid $border-color;
        background: #fff;
        color: $text-color-secondary;
        font-size: 22rpx;
        transition: opacity 0.12s ease;

        &--on {
            background: $brand-color;
            border-color: $brand-color;
            color: #fff;
            font-weight: 600;
        }

        &--off {
            opacity: 0.35;
        }

        &--ell {
            border: none;
            background: transparent;
            color: $text-color-placeholder;
            padding: 0 2rpx;
        }
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

    /* free 模式步进器：− ×N ＋ 白底胶囊，右上角浮层 */
    &__step {
        position: absolute;
        top: -10rpx;
        right: -6rpx;
        display: flex;
        align-items: center;
        background: #fff;
        border-radius: 999rpx;
        box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.16);
        overflow: hidden;
    }

    &__step-btn {
        min-width: 42rpx;
        height: 42rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $brand-color;
        font-size: 28rpx;
        font-weight: 600;
        line-height: 1;
    }

    &__step-n {
        min-width: 34rpx;
        text-align: center;
        color: $brand-color;
        font-size: 22rpx;
        font-weight: 600;
        line-height: 42rpx;
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

@keyframes mat-fade {
    from { opacity: 0; transform: translateY(4rpx); }
    to { opacity: 1; transform: none; }
}

/* 自定义滚动条（H5）：5px 品牌橙细条，覆盖 uni scroll-view 默认隐藏 */
/* #ifdef H5 */
:deep(.uni-scroll-view) {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 102, 0, 0.35) transparent;
}
:deep(.uni-scroll-view::-webkit-scrollbar) {
    display: block !important;
    width: 5px;
}
:deep(.uni-scroll-view::-webkit-scrollbar-thumb) {
    background: rgba(255, 102, 0, 0.3);
    border-radius: 4px;
}
:deep(.uni-scroll-view::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 102, 0, 0.55);
}
:deep(.uni-scroll-view::-webkit-scrollbar-track) {
    background: transparent;
}
/* #endif */
</style>
