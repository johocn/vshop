<template>
    <view class="seq-strip">
        <view class="seq-strip__hint">{{ t('diy.dragHint') }}</view>
        <scroll-view scroll-x class="seq-strip__scroll" :show-scrollbar="false">
            <view class="seq-strip__lane">
                <view
                    v-for="(id, i) in list"
                    :key="i"
                    class="seq-strip__cell"
                    :class="{ 'seq-strip__cell--drag': dragging && i === dragIndex }"
                    :style="dragging && i === dragIndex ? { transform: 'translateX(' + dragDx + 'px) scale(1.12)' } : ''"
                    @touchstart="onTouchStart(i, $event)"
                    @touchmove.stop.prevent="onTouchMove"
                    @touchend="onTouchEnd"
                    @touchcancel="onTouchEnd"
                    @tap="onTap(i)"
                >
                    <view
                        class="seq-strip__dot"
                        :style="dotStyle(id)"
                    />
                </view>
                <view class="seq-strip__add" @tap="$emit('append')">＋</view>
            </view>
        </scroll-view>
    </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { materialColor, type DiyMaterialRow } from '../composables/useDesigner';

const props = defineProps<{
    /** materialId 有序序列 */
    sequence: string[];
    materials: DiyMaterialRow[];
}>();

const emit = defineEmits<{
    /** 拖拽过程中与结束时整体回传新序列 */
    (e: 'update:sequence', v: string[]): void;
    (e: 'remove', index: number): void;
    (e: 'append'): void;
}>();

const { t } = useI18n();

/** 本地副本：外部追加时同步进来；拖拽只改本地并整体 emit，避免直接改 props */
const list = ref<string[]>([...props.sequence]);
watch(() => props.sequence, v => { list.value = [...v]; });

const dragging = ref(false);
const dragIndex = ref(-1);
const dragDx = ref(0);

let startX = 0;
let startIdx = -1;
let moved = false;

/** 格宽（px）：与样式 .seq-strip__cell 尺寸保持一致（96rpx + 8rpx 间距） */
function cellPx(): number {
    return uni.upx2px(96) + uni.upx2px(8);
}

function onTouchStart(i: number, e: TouchEvent) {
    const touch = e.touches?.[0];
    if (!touch) return;
    startIdx = i;
    startX = touch.clientX;
    moved = false;
    dragDx.value = 0;
}

function onTouchMove(e: TouchEvent) {
    const touch = e.touches?.[0];
    if (startIdx < 0 || !touch) return;
    const dx = touch.clientX - startX;
    if (!moved && Math.abs(dx) < 6) return;
    moved = true;
    if (!dragging.value) {
        dragging.value = true;
        dragIndex.value = startIdx;
    }
    dragDx.value = dx;
    // 步进换位：拖过一格就实时重排一次，视觉上即「随手指让位」
    const step = Math.round(dx / cellPx());
    const target = Math.min(list.value.length - 1, Math.max(0, startIdx + step));
    if (target !== dragIndex.value) {
        const next = [...list.value];
        const [item] = next.splice(dragIndex.value, 1);
        next.splice(target, 0, item);
        list.value = next;
        dragIndex.value = target;
        startIdx = target;
        startX = touch.clientX;
        dragDx.value = 0;
        emit('update:sequence', [...list.value]);
    }
}

function onTouchEnd() {
    if (dragging.value) {
        dragging.value = false;
        dragDx.value = 0;
        emit('update:sequence', [...list.value]);
        // 拖完松手紧随的 tap 事件不视为删除
        suppressTap = true;
        setTimeout(() => { suppressTap = false; }, 350);
    }
    startIdx = -1;
    moved = false;
}

let suppressTap = false;

/** 点按一颗 → 确认移除 */
function onTap(i: number) {
    if (suppressTap || moved) return;
    uni.showModal({
        title: t('diy.removeBeadQ'),
        success: (res: UniApp.ShowModalRes) => {
            if (res.confirm) emit('remove', i);
        },
    });
}

function colorOf(id: string): string {
    return materialColor(props.materials.find(m => m.id === id));
}

/** 珠径 mm → rpx（8~20mm → 40~72rpx） */
function dotStyle(id: string) {
    const m = props.materials.find(x => x.id === id);
    const d = m?.diameter ?? m?.axialLength ?? 8;
    const size = Math.round(Math.min(72, Math.max(40, d * 4.5)));
    return { background: colorOf(id), width: size + 'rpx', height: size + 'rpx' };
}
</script>

<style lang="scss" scoped>
.seq-strip {
    background: #fff;
    border-radius: $radius-md;
    margin: 0 20rpx 16rpx;
    padding: 16rpx 0;

    &__hint {
        font-size: 20rpx;
        color: $text-color-placeholder;
        padding: 0 24rpx 8rpx;
    }

    &__scroll {
        width: 100%;
        white-space: nowrap;
    }

    &__lane {
        display: inline-flex;
        align-items: center;
        gap: 8rpx;
        padding: 8rpx 24rpx;
    }

    &__cell {
        width: 96rpx;
        height: 96rpx;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: $bg-color;
        transition: transform 0.12s ease;

        &--drag {
            z-index: 2;
            box-shadow: $shadow;
            transition: none;
        }
    }

    &__dot {
        border-radius: 50%;
        box-shadow: inset -3rpx -5rpx 8rpx rgba(0, 0, 0, 0.18), inset 3rpx 5rpx 8rpx rgba(255, 255, 255, 0.5);
    }

    &__add {
        width: 96rpx;
        height: 96rpx;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 44rpx;
        color: $brand-color;
        background: $brand-color-light;
        flex-shrink: 0;
    }
}
</style>
