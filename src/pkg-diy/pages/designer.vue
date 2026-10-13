<template>
    <view class="designer">
        <view class="designer__top">
            <!-- 状态胶囊行（spec 布局 B：置顶于画布上方） -->
            <view class="designer__capsules">
                <text class="designer__caps designer__caps--state" @tap="showCalc = true">
                    {{ d.mode.value === 'free' ? t('diy.innerCirc') + ' ' + cm(d.result.value?.bom?.geometry?.innerCircumference) : t('diy.wristSize') + ' ' + (d.wristSize.value / 10).toFixed(1) + 'cm' }}
                    · {{ t(feedbackI18nKey(d.result.value?.bom?.geometry?.feedback)) }}
                </text>
                <text class="designer__caps">¥{{ yuan(d.result.value?.bom?.totalAmount) }}</text>
                <text class="designer__caps" @tap="d.knotVisible.value = !d.knotVisible.value">
                    {{ d.knotVisible.value ? t('diy.knot.hide') : t('diy.knot.show') }}
                </text>
                <text class="designer__caps designer__caps--link" @tap="goGuide">{{ t('diy.helpShort') }} ?</text>
            </view>

            <!-- 预览区 -->
            <view class="designer__preview">
                <BeadRing
                    canvas-id="designerRing"
                    :width="690"
                    :height="660"
                    :beads="d.previewBeads.value"
                    :decors="d.decors.value"
                    :knot-visible="d.knotVisible.value"
                    :decor-rows="materials"
                    :brand-watermark="brandWatermark"
                    :brand-slogan="brandSlogan"
                    @bead-tap="onBeadTap"
                    @bead-move="onBeadMove"
                    @bead-swap="onBeadSwap"
                    @bead-remove="onBeadRemove"
                    @decor-tap="onDecorTap"
                    @decor-move="onDecorMove"
                    @decor-remove="onDecorRemove"
                />
                <view v-if="!d.previewBeads.value.length" class="designer__empty">
                    <text>{{ t('diy.emptyHint') }}</text>
                </view>
            </view>

            <!-- 操作行：图标化 + 完成设计主按钮右置 -->
            <view class="designer__actions">
                <view class="designer__act" @tap="onClear">
                    <text class="designer__act-ico">🗑</text>
                    <text class="designer__act-txt">{{ t('diy.action.clear') }}</text>
                </view>
                <view class="designer__act" @tap="onDraft">
                    <text class="designer__act-ico">✓</text>
                    <text class="designer__act-txt">{{ t('diy.action.draft') }}</text>
                </view>
                <view class="designer__act" @tap="onRecommend">
                    <text class="designer__act-ico">↻</text>
                    <text class="designer__act-txt">{{ t('diy.action.recommend') }}</text>
                </view>
                <view
                    class="designer__cta"
                    :class="{ 'designer__cta--disabled': !d.canSave.value || saving }"
                    @tap="onSave"
                >{{ ctaLabel }}</view>
            </view>

            <!-- 模式切换 -->
            <ModeChips
                :model-value="d.mode.value"
                :count="d.calcCount.value"
                @update:model-value="onModeChange"
            />

            <!-- free 序列条 / 非 free 参数摘要条 -->
            <SequenceStrip
                v-if="d.mode.value === 'free'"
                v-model:sequence="d.sequence.value"
                :materials="materials"
                @remove="d.removeBeadAt"
                @append="onAppendTap"
            />
            <view v-else class="designer__summary" @tap="paramsOpen = true">
                <text class="designer__summary-label">{{ t('diy.paramSummary') }}</text>
                <text class="designer__summary-text">{{ (d.wristSize.value / 10).toFixed(1) }}cm · {{ t('diy.fit.' + d.fit.value) }} · {{ d.gap.value }}mm</text>
                <text class="designer__summary-arrow">▾</text>
            </view>
        </view>

        <!-- 常驻选料面板 -->
        <view class="designer__panel">
            <MaterialPanel
                :materials="materials"
                :mode="d.mode.value"
                :categories="categories"
                :counts="pickCounts"
                @pick="onPickMaterial"
            />
        </view>

        <!-- 非 free 参数/槽位浮层（覆盖面板上方） -->
        <view v-if="paramsOpen" class="designer__sheet" @touchmove.stop.prevent>
            <view class="designer__sheet-mask" @tap="paramsOpen = false" />
            <view class="designer__sheet-panel">
                <view class="designer__sheet-head">
                    <text class="designer__sheet-title">{{ t('diy.paramSummary') }}</text>
                    <text class="designer__sheet-close" @tap="paramsOpen = false">×</text>
                </view>
                <scroll-view scroll-y class="designer__sheet-body">
                    <view class="designer__params">
                        <view class="designer__param-row">
                            <text class="designer__param-label">{{ t('diy.wristSize') }}</text>
                            <text class="designer__param-value">{{ (d.wristSize.value / 10).toFixed(1) }}cm</text>
                        </view>
                        <slider
                            class="designer__slider"
                            :min="WRIST_MIN"
                            :max="WRIST_MAX"
                            :step="1"
                            :value="d.wristSize.value"
                            activeColor="#ff6600"
                            block-size="20"
                            @change="onWristChange"
                        />
                        <view class="designer__chips">
                            <text
                                v-for="f in fits"
                                :key="f"
                                class="designer__chip"
                                :class="{ 'designer__chip--on': d.fit.value === f }"
                                @tap="d.fit.value = f"
                            >{{ t('diy.fit.' + f) }}</text>
                        </view>
                        <view class="designer__param-row designer__param-row--gap">
                            <text class="designer__param-label">{{ t('diy.gap') }}</text>
                            <text class="designer__param-value">{{ d.gap.value }}mm</text>
                        </view>
                        <slider
                            class="designer__slider"
                            :min="0"
                            :max="2"
                            :step="0.1"
                            :value="d.gap.value"
                            activeColor="#ff6600"
                            block-size="20"
                            @change="onGapChange"
                        />
                        <view v-if="d.mode.value === 'pattern'" class="designer__chips">
                            <text
                                v-for="a in arranges"
                                :key="a"
                                class="designer__chip"
                                :class="{ 'designer__chip--on': d.arrange.value === a }"
                                @tap="d.arrange.value = a"
                            >{{ t('diy.arrange.' + a) }}</text>
                            <text v-if="d.arrange.value === 'random'" class="designer__chip designer__chip--action" @tap="d.reshuffle()">{{ t('diy.reshuffle') }}</text>
                        </view>
                    </view>
                    <view class="designer__slots">
                        <view
                            v-for="(s, i) in d.slots.value"
                            :key="i"
                            class="designer__slot"
                            :class="{ 'designer__slot--on': editingSlotIdx === i }"
                            @tap="selectSlot(i)"
                        >
                            <text class="designer__slot-role">{{ t('diy.slot.' + s.role) }}</text>
                            <view class="designer__slot-bead">
                                <view
                                    v-if="s.materialId"
                                    class="designer__slot-dot"
                                    :style="{ background: slotColor(s.materialId) }"
                                />
                                <text class="designer__slot-name">{{ s.materialId ? slotName(s.materialId) : t('diy.pickMaterial') }}</text>
                            </view>
                            <input
                                v-if="s.role === 'main'"
                                class="designer__slot-input"
                                type="number"
                                :value="s.qtyOverride != null ? String(s.qtyOverride) : ''"
                                :placeholder="d.mode.value === 'byCount' ? t('diy.qty') : t('diy.weight')"
                                @input="onQtyInput(i, $event)"
                            />
                            <input
                                v-else-if="s.role === 'spacer'"
                                class="designer__slot-input"
                                type="number"
                                :value="s.every != null ? String(s.every) : '2'"
                                :placeholder="t('diy.every')"
                                @input="onEveryInput(i, $event)"
                            />
                            <input
                                v-else-if="s.role === 'decor'"
                                class="designer__slot-input"
                                type="number"
                                :value="s.qtyOverride != null ? String(s.qtyOverride) : '1'"
                                :placeholder="t('diy.qty')"
                                @input="onQtyInput(i, $event)"
                            />
                            <text
                                v-if="s.role !== 'main' || d.mainSlots.value.length > 1 || !s.materialId"
                                class="designer__slot-remove"
                                @tap.stop="d.removeSlotAt(i)"
                            >×</text>
                        </view>
                        <view class="designer__slot-actions">
                            <text class="designer__slot-add" @tap="d.addSlot('main')">＋ {{ t('diy.slot.main') }}</text>
                            <text v-if="!hasFocal" class="designer__slot-add" @tap="d.addSlot('focal')">＋ {{ t('diy.slot.focal') }}</text>
                            <text v-if="!hasSpacer" class="designer__slot-add" @tap="d.addSlot('spacer')">＋ {{ t('diy.slot.spacer') }}</text>
                            <text class="designer__slot-add" @tap="d.addSlot('decor')">＋ {{ t('diy.slot.decor') }}</text>
                        </view>
                    </view>
                </scroll-view>
            </view>
        </view>

        <CalcDetailSheet v-model:show="showCalc" :result="d.result.value" />
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import BeadRing from '../components/BeadRing.vue';
import ModeChips from '../components/ModeChips.vue';
import MaterialPanel from '../components/MaterialPanel.vue';
import SequenceStrip from '../components/SequenceStrip.vue';
import CalcDetailSheet from '../components/CalcDetailSheet.vue';
import { getDiyMaterials, getDiyCategories } from '../../api/queries/diy';
import { createDiyPlan, quoteDiyPlan } from '../../api/mutations/diy';
import { useAuthStore } from '../../stores/auth';
import { useTenantStore } from '../../stores/tenant';
import {
    useDesigner, useDesignerDraft, yuan, cm, feedbackI18nKey, materialColor, materialName, easeOf,
    WRIST_MIN, WRIST_MAX,
    type DesignerMode, type DesignerFit, type ArrangeMode, type DiyMaterialRow,
} from '../composables/useDesigner';
import { recommendSequence } from '../utils/recommend';

const { t, locale } = useI18n();
const authStore = useAuthStore();
const tenantStore = useTenantStore();

const materials = ref<DiyMaterialRow[]>([]);
const categories = ref<any[]>([]);
const d = useDesigner(materials, locale);
const draft = useDesignerDraft(d);

/** 各素材已选颗数（序列 + 配饰聚合），供选料面板角标 */
const pickCounts = computed<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const id of d.sequence.value) c[id] = (c[id] ?? 0) + 1;
    for (const x of d.decors.value) c[x.materialId] = (c[x.materialId] ?? 0) + 1;
    return c;
});

const showCalc = ref(false);
const saving = ref(false);
/** 当前指派目标槽位下标；-1 表示 free 追加 */
const editingSlotIdx = ref(-1);
/** 非 free 参数/槽位浮层显隐 */
const paramsOpen = ref(false);

/** 环心水印文案：rawGlobalConfig.defaults 品牌字段 → 渠道 shopName → i18n 兜底 */
const brandWatermark = computed(() => {
    const cf: any = tenantStore.rawGlobalConfig?.defaults ?? {};
    return String(cf.brandName || tenantStore.shopName || t('diy.brandWatermark'));
});
const brandSlogan = computed(() => {
    const cf: any = tenantStore.rawGlobalConfig?.defaults ?? {};
    return String(cf.brandSlogan || t('diy.brandSlogan'));
});

const fits: DesignerFit[] = ['snug', 'comfortable', 'loose'];
const arranges: ArrangeMode[] = ['alternate', 'random', 'zoned'];

const hasFocal = computed(() => d.slots.value.some(s => s.role === 'focal'));
const hasSpacer = computed(() => d.slots.value.some(s => s.role === 'spacer'));

onLoad(async () => {
    uni.setNavigationBarTitle({ title: t('diy.designer') });
    try {
        const res: any = await getDiyMaterials();
        materials.value = (res?.diyMaterials?.items || []).map((m: any) => ({ ...m, id: String(m.id) }));
    } catch {
        materials.value = [];
    }
    try {
        const cres: any = await getDiyCategories();
        categories.value = (cres?.diyCategories ?? []).filter((c: any) => c.enabled !== false);
    } catch { categories.value = []; }
    if (draft.loadDraft()) uni.showToast({ title: t('diy.draftRestored'), icon: 'none' });
    // 首次进入自动跳引导页：H5 启动页 onLoad 阶段 uni.navigateTo 未就绪（抛 TypeError 会中断 onLoad），
    // 延迟到启动完成后再跳；数据加载已前置，即便跳转失败也不影响设计器功能
    if (!uni.getStorageSync('diy_guide_seen')) {
        uni.setStorageSync('diy_guide_seen', '1');
        setTimeout(() => {
            try { uni.navigateTo({ url: '/pkg-diy/pages/guide' }); } catch { /* 用户可从帮助?进入 */ }
        }, 300);
    }
});

function slotColor(id: string): string {
    return materialColor(materials.value.find(m => m.id === id));
}
function slotName(id: string): string {
    return materialName(materials.value.find(m => m.id === id), locale.value);
}

function onBeadMove(from: number, to: number) { d.moveBead(from, to); }
function onBeadSwap(from: number, to: number) { d.swapBead(from, to); }
function onBeadRemove(i: number) { d.removeBeadAt(i); }
function onBeadTap(i: number) {
    uni.showModal({
        title: t('diy.removeBeadQ'),
        success: (res: UniApp.ShowModalRes) => { if (res.confirm) d.removeBeadAt(i); },
    });
}

function onDecorMove(decorId: string, slot: number) { d.moveDecor(decorId, slot); }
function onDecorRemove(decorId: string) { d.removeDecor(decorId); }
function onDecorTap(decorId: string) {
    uni.showModal({
        title: t('diy.decorRemoveQ'),
        success: (res: UniApp.ShowModalRes) => { if (res.confirm) d.removeDecor(decorId); },
    });
}

function onModeChange(m: DesignerMode) {
    if (m === 'free') {
        if (!d.sequence.value.length) d.enterFree();
        else d.mode.value = 'free';
        return;
    }
    d.setMode(m);
}

function onWristChange(e: any) {
    d.wristSize.value = Math.min(WRIST_MAX, Math.max(WRIST_MIN, Number(e.detail?.value) || 155));
}
function onGapChange(e: any) {
    d.gap.value = Math.min(2, Math.max(0, Number(e.detail?.value) || 0));
}

/** 非 free：点槽位选中指派目标并收起浮层（随后点面板卡即指派） */
function selectSlot(i: number) {
    editingSlotIdx.value = i;
    paramsOpen.value = false;
}

/** 面板点卡：配饰 tab → addDecor（free）或指派 decor 槽（非 free 已选槽）；珠子 tab → free 追加 / 槽位指派 */
function onPickMaterial(id: string, tab: 'beads' | 'decors' = 'beads') {
    if (tab === 'decors') {
        if (d.mode.value !== 'free' && editingSlotIdx.value >= 0) {
            d.assignSlot(editingSlotIdx.value, id);
            return;
        }
        d.addDecor(id);
        return;
    }
    if (d.mode.value === 'free') {
        d.appendBead(id);
        return;
    }
    if (editingSlotIdx.value >= 0) d.assignSlot(editingSlotIdx.value, id);
}

function onAppendTap() { uni.showToast({ title: t('diy.appendHint'), icon: 'none' }); }

function onClear() {
    uni.showModal({
        title: t('diy.confirmClear'),
        success: r => {
            if (r.confirm) { d.clearAll(); uni.showToast({ title: t('diy.cleared'), icon: 'none' }); }
        },
    });
}
function onDraft() { draft.saveDraft(); uni.showToast({ title: t('diy.draftSaved'), icon: 'none' }); }
function onRecommend() {
    d.applyRecommend(recommendSequence(materials.value, d.wristSize.value, easeOf(d.fit.value), Date.now() % 2147483647));
    uni.showToast({ title: t('diy.recommendDone'), icon: 'none' });
}
function goGuide() { uni.navigateTo({ url: '/pkg-diy/pages/guide' }); }

function onQtyInput(i: number, e: any) {
    const v = Math.max(0, Math.floor(Number(e.detail?.value) || 0));
    d.patchSlot(i, { qtyOverride: v > 0 ? v : undefined });
}
function onEveryInput(i: number, e: any) {
    const v = Math.max(1, Math.floor(Number(e.detail?.value) || 2));
    d.patchSlot(i, { every: v });
}

const ctaLabel = computed(() => {
    if (d.mode.value === 'byCount' && !d.byCountOk.value) return t('diy.countRequired');
    if (d.mode.value !== 'free' && !d.hasMain.value) return t('diy.needMain');
    return t('diy.action.finish') + ' · ¥' + yuan(d.result.value?.bom?.totalAmount);
});

/** BeadRing 导出缩略图；失败降级空串 */
function makeThumb(): Promise<string> {
    return new Promise(resolve => {
        try {
            uni.canvasToTempFilePath({
                canvasId: 'designerRing',
                success: (res: any) => resolve(res?.tempFilePath || ''),
                fail: () => resolve(''),
            } as any);
        } catch {
            resolve('');
        }
    });
}

async function onSave() {
    if (saving.value) return;
    if (!d.canSave.value) {
        uni.showToast({ title: t(d.validationKey.value || 'diy.needMain'), icon: 'none' });
        return;
    }
    if (!authStore.requireLogin('/pkg-diy/pages/designer')) return;
    saving.value = true;
    let planId = '';
    const goDetail = () => uni.navigateTo({ url: '/pkg-diy/pages/plan-detail?id=' + planId });
    try {
        const thumb = await makeThumb();
        // spec 按服务端 calc-bridge 契约产出（slots 为 Record）；API 层类型签名沿用 T6 的 DiyPlanSpecV2，故此处显式收窄
        const spec = d.buildSpec();
        const created: any = await createDiyPlan('bracelet-classic', spec as any, thumb || undefined);
        planId = String(created?.createDiyPlan?.id ?? '');
        if (!planId) throw new Error(t('diy.saveFailed'));
        const quoted: any = await quoteDiyPlan(planId);
        const serverAmount = Number(quoted?.quoteDiyPlan?.bom?.totalAmount ?? 0);
        const localAmount = Number(d.result.value?.bom?.totalAmount ?? 0);
        if (serverAmount !== localAmount) {
            uni.showModal({
                title: t('diy.savedOk') + ' ¥' + yuan(serverAmount),
                content: t('diy.quoteMismatch'),
                showCancel: false,
                success: goDetail,
            });
        } else {
            uni.showToast({ title: t('diy.savedOk') + ' ¥' + yuan(serverAmount), icon: 'success' });
            setTimeout(goDetail, 600);
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || t('diy.saveFailed'), icon: 'none' });
    }
    saving.value = false;
}
</script>

<style lang="scss" scoped>
.designer {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: $bg-color;

    &__top {
        flex: 0 1 auto;
        min-height: 0;
        overflow-y: auto;
    }

    &__preview {
        position: relative;
        background: #fff;
        padding: 24rpx 20rpx 8rpx;
    }

    &__empty {
        position: absolute;
        left: 0;
        right: 0;
        top: 45%;
        text-align: center;
        font-size: 26rpx;
        color: $text-color-placeholder;
    }

    &__capsules {
        display: flex;
        align-items: center;
        gap: 12rpx;
        padding: 16rpx 20rpx 8rpx;
    }

    &__caps {
        padding: 8rpx 20rpx;
        border-radius: 28rpx;
        font-size: 22rpx;
        background: $bg-color;
        border: 2rpx solid $border-color;
        color: $text-color-secondary;

        &--state {
            color: $brand-color;
            background: $brand-color-light;
            border-color: $brand-color-light;
        }

        &--link {
            margin-left: auto;
            color: $brand-color;
        }
    }

    &__actions {
        display: flex;
        align-items: center;
        gap: 12rpx;
        margin: 0 20rpx 12rpx;
    }

    &__act {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rpx;
        padding: 8rpx 18rpx;
        border-radius: $radius-md;
        background: #fff;
        border: 2rpx solid $border-color;
        flex-shrink: 0;
    }

    &__act-ico {
        font-size: 30rpx;
        line-height: 1.1;
    }

    &__act-txt {
        font-size: 20rpx;
        color: $text-color-secondary;
    }

    &__cta {
        margin-left: auto;
        height: 72rpx;
        line-height: 72rpx;
        padding: 0 28rpx;
        border-radius: 36rpx;
        background: $brand-color;
        color: #fff;
        font-size: 26rpx;
        white-space: nowrap;
        flex-shrink: 0;

        &--disabled {
            opacity: 0.5;
        }
    }

    &__summary {
        display: flex;
        align-items: center;
        gap: 12rpx;
        background: #fff;
        border-radius: $radius-md;
        margin: 0 20rpx 16rpx;
        padding: 16rpx 24rpx;
    }

    &__summary-label {
        font-size: 24rpx;
        font-weight: 600;
        color: $text-color;
        flex-shrink: 0;
    }

    &__summary-text {
        font-size: 24rpx;
        color: $text-color-secondary;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__summary-arrow {
        margin-left: auto;
        font-size: 24rpx;
        color: $text-color-placeholder;
    }

    &__panel {
        flex: 1;
        min-height: 0;
        background: #fff;
        border-radius: $radius-lg $radius-lg 0 0;
        margin-top: 8rpx;
        padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* 非 free 参数/槽位浮层 */
    &__sheet {
        position: fixed;
        inset: 0;
        z-index: 999;
    }

    &__sheet-mask {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
    }

    &__sheet-panel {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        max-height: 72vh;
        background: #fff;
        border-radius: $radius-lg $radius-lg 0 0;
        padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
        display: flex;
        flex-direction: column;
    }

    &__sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }

    &__sheet-title {
        font-size: 30rpx;
        font-weight: 600;
        color: $text-color;
    }

    &__sheet-close {
        font-size: 44rpx;
        color: $text-color-placeholder;
        padding: 0 12rpx;
    }

    &__sheet-body {
        flex: 1;
        min-height: 0;
    }

    &__params {
        margin: 0;
        padding: 8rpx 0 20rpx;
    }

    &__param-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8rpx;

        &--gap {
            margin-top: 24rpx;
        }
    }

    &__param-label {
        font-size: 26rpx;
        color: $text-color-secondary;
    }

    &__param-value {
        font-size: 26rpx;
        color: $text-color;
    }

    &__slider {
        margin: 8rpx 0;
    }

    &__chips {
        display: flex;
        gap: 12rpx;
        margin-top: 12rpx;
        flex-wrap: wrap;
    }

    &__chip {
        padding: 10rpx 24rpx;
        border-radius: 28rpx;
        font-size: 24rpx;
        color: $text-color-secondary;
        background: $bg-color;
        border: 2rpx solid $border-color;

        &--on {
            color: #fff;
            background: $brand-color;
            border-color: $brand-color;
        }

        &--action {
            color: $brand-color;
            background: $brand-color-light;
            border-color: $brand-color-light;
        }
    }

    &__slots {
        background: $bg-color;
        border-radius: $radius-md;
        padding: 8rpx 24rpx;
    }

    &__slot {
        display: flex;
        align-items: center;
        gap: 16rpx;
        padding: 16rpx 12rpx;
        border-bottom: 2rpx solid $border-color;

        &--on {
            background: $brand-color-light;
            border-radius: $radius-sm;

            .designer__slot-role {
                color: $brand-color;
                font-weight: 600;
            }
        }
    }

    &__slot-role {
        width: 96rpx;
        font-size: 24rpx;
        color: $text-color-secondary;
        flex-shrink: 0;
    }

    &__slot-bead {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12rpx;
        min-width: 0;
    }

    &__slot-dot {
        width: 44rpx;
        height: 44rpx;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: inset -3rpx -4rpx 8rpx rgba(0, 0, 0, 0.18), inset 3rpx 4rpx 8rpx rgba(255, 255, 255, 0.5);
    }

    &__slot-name {
        font-size: 26rpx;
        color: $text-color;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__slot-input {
        width: 120rpx;
        height: 60rpx;
        background: #fff;
        border-radius: $radius-sm;
        text-align: center;
        font-size: 24rpx;
        flex-shrink: 0;
    }

    &__slot-remove {
        font-size: 40rpx;
        color: $text-color-placeholder;
        padding: 0 8rpx;
        flex-shrink: 0;
    }

    &__slot-actions {
        display: flex;
        gap: 20rpx;
        padding: 20rpx 0;
        flex-wrap: wrap;
    }

    &__slot-add {
        font-size: 24rpx;
        color: $brand-color;
        background: $brand-color-light;
        border-radius: 28rpx;
        padding: 10rpx 24rpx;
    }
}
</style>
