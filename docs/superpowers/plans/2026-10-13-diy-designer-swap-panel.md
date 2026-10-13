# DIY 设计器 P7.2 实施计划：swap 拖拽换位 + 常驻面板布局

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画布珠子拖拽改为「压珠=互换 / 落隙=插入 / 出环=删除」三态语义并实时预览；页面改 100vh flex 常驻选料面板（方案 B），画布加轨道圆与品牌水印，操作行图标化。

**Architecture:** 纯前端改动（`src/pkg-diy/` + i18n），后端零改动。BeadRing 松手按优先级出环→压珠→落隙判定并 emit 三种事件；useDesigner 新增 swapBead；MaterialSheet 改造为常驻 MaterialPanel；designer.vue 重排为 flex column 不滚动布局。

**Tech Stack:** uni-app (Vue3) / canvas 2d / vue-i18n / Playwright(Python, CDP touch) 验证。

**Spec:** `docs/superpowers/specs/2026-10-13-diy-designer-swap-panel-design.md`

**验证口径（本项目无 TS 单测设施）：** 每个 Task 后 `npx vue-tsc --noEmit`（若项目未配则以 Task 8 `pnpm build:h5` 0 error 为准）；行为验收 = Task 9 Playwright 七判据。

---

### Task 1: useDesigner.ts 新增 swapBead

**Files:**
- Modify: `src/pkg-diy/composables/useDesigner.ts:238-245`（moveBead 后）、`src/pkg-diy/composables/useDesigner.ts:400`（导出）

- [ ] **Step 1: 在 moveBead 函数之后插入 swapBead**

```ts
    /** 直觉流：拖拽互换（from ↔ to，swap 语义，其余珠子位置不动；越界/from=to 早退） */
    function swapBead(from: number, to: number) {
        if (from === to || from < 0 || to < 0 || from >= sequence.value.length || to >= sequence.value.length) return;
        const next = [...sequence.value];
        [next[from], next[to]] = [next[to], next[from]];
        sequence.value = next;
    }
```

- [ ] **Step 2: 导出**

return 对象中 `moveBead,` 后追加 `swapBead,`（改后：`moveBead, swapBead, addDecor, ...`）。

---

### Task 2: BeadRing.vue 三态判定（emits / DragState / onTouch）

**Files:**
- Modify: `src/pkg-diy/components/BeadRing.vue`

- [ ] **Step 1: emits 新增 bead-swap**（defineEmits 内 `(e: 'bead-move', ...)` 行后）

```ts
    (e: 'bead-swap', from: number, to: number): void;
```

- [ ] **Step 2: DragState.phase 扩展**

```ts
interface DragState { index: number; x: number; y: number; phase: 'swap' | 'insert' | 'delete'; overRing: boolean }
```

onTouchStart 中初始 `phase: 'insert'`（未拖动不渲染，值无副作用）。

- [ ] **Step 3: onTouchMove 相位更新**（替换原 `drag.phase = drag.overRing ? 'move' : 'delete';`）

```ts
    drag.overRing = Math.hypot(p.x - geo.cx, p.y - geo.cy) <= geo.ringR * 1.6;
    if (!drag.overRing) {
        drag.phase = 'delete';
    } else {
        const hit = hitBead(p.x, p.y);
        drag.phase = hit >= 0 && hit !== drag.index ? 'swap' : 'insert';
    }
```

- [ ] **Step 4: onTouchEnd 松手判定（优先级：出环→压珠→落隙）**（替换原 if (drag && moved) 块）

```ts
    if (drag && moved) {
        if (drag.phase === 'delete') {
            emit('bead-remove', drag.index);
        } else {
            const hit = hitBead(drag.x, drag.y);
            if (hit >= 0 && hit !== drag.index) emit('bead-swap', drag.index, hit);
            else emit('bead-move', drag.index, insertIndexAt(drag.x, drag.y));
        }
    } else if (drag) {
        emit('bead-tap', drag.index);
    }
```

压珠命中自身 → 走落隙分支（`moveBead` 对 from=to 早退，无副作用）。

---

### Task 3: BeadRing.vue 拖拽实时预览（render drag 分支）

**Files:**
- Modify: `src/pkg-diy/components/BeadRing.vue:162-178`（if (drag && moved) 块整体替换）

- [ ] **Step 1: 三态预览**

```ts
    if (drag && moved) {
        const i = drag.index;
        // 原位半透明
        ctx.globalAlpha = 0.35;
        drawBead(ctx, rs[i]);
        ctx.globalAlpha = 1;
        // ghost 珠（跟手）
        drawBead(ctx, { ...rs[i], x: drag.x, y: drag.y });
        if (drag.phase === 'delete') {
            ctx.strokeStyle = '#E8463A';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(drag.x, drag.y, (geo.radii[i] ?? 6) * scale + 4, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#E8463A';
            ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('✕', drag.x, drag.y + 4);
        } else if (drag.phase === 'swap') {
            // 压珠预览：目标珠 brand 色虚线圈（半径 +4）
            const hit = hitBead(drag.x, drag.y);
            if (hit >= 0 && hit !== i) {
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = '#ff6600';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(rs[hit].x, rs[hit].y, rs[hit].r + 4, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
            }
        } else if (to !== i) {
            // 落隙预览：目标间隙小虚线圈。splice 语义落点 = 原布局 from<to ? 间隙(to+0.5) : 间隙(to-0.5)
            const to = insertIndexAt(drag.x, drag.y);
            const rel = (drag.index < to ? to + 0.5 : to - 0.5 + geo.n) % geo.n;
            const a = -Math.PI / 2 + (Math.PI * 2 * rel) / geo.n;
            const gx = geo.cx + geo.ringR * Math.cos(a);
            const gy = geo.cy + geo.ringR * Math.sin(a);
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = 'rgba(255,102,0,0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
        }
    }
```

注意：`else if (to !== i)` 分支中 `to` 在分支首行声明（TS let 声明提升不适用 const——写法上把 `const to = insertIndexAt(...)` 放分支第一行即可）。

---

### Task 4: BeadRing.vue 轨道圆 + 环心水印

**Files:**
- Modify: `src/pkg-diy/components/BeadRing.vue`（props + render）

- [ ] **Step 1: props 新增**

```ts
    /** 环心品牌水印主文案（tenant shopName；空串不绘制） */
    brandWatermark?: string;
    /** 环心水印副文案（品牌标语） */
    brandSlogan?: string;
```

- [ ] **Step 2: render() 中 `geo = {...}` 之后、`const rs` 之前插入**

```ts
    // 细轨道圆（珠心轨迹，先于珠子绘制；H5 单位矩阵铁律：禁 scale(dpr)）
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, ringR, 0, Math.PI * 2); ctx.stroke();
    // 环心水印：品牌名 + 标语（透明度 0.10~0.12）
    const wm = props.brandWatermark || '';
    const slogan = props.brandSlogan || '';
    if (wm || slogan) {
        ctx.textAlign = 'center';
        const fs1 = Math.max(14, ringR * 0.34);
        const fs2 = Math.max(9, ringR * 0.17);
        if (wm) {
            ctx.fillStyle = 'rgba(0,0,0,0.11)';
            ctx.font = `600 ${fs1}px sans-serif`;
            ctx.fillText(wm, w / 2, h / 2 - (slogan ? fs1 * 0.15 : fs1 * 0.35));
        }
        if (slogan) {
            ctx.fillStyle = 'rgba(0,0,0,0.10)';
            ctx.font = `${fs2}px sans-serif`;
            ctx.fillText(slogan, w / 2, h / 2 + fs1 * 0.75);
        }
    }
```

---

### Task 5: i18n 五语言新词条

**Files:**
- Modify: `src/i18n/locales/{zh-CN,zh-TW,en,ja,ko}.json`（各文件 `"longPressHint"` 行后插入）

- [ ] **Step 1: 插入词条（每文件 6 条，键序一致）**

zh-CN：
```json
        "longPressHint": "长按查看素材详情",
        "tabBeads": "珠子",
        "tabDecors": "配饰",
        "materialCount": "共 {n} 款",
        "paramSummary": "参数与槽位",
        "brandWatermark": "匠心手作",
        "brandSlogan": "手作串珠",
```
zh-TW：`"tabBeads": "珠子", "tabDecors": "配飾", "materialCount": "共 {n} 款", "paramSummary": "參數與槽位", "brandWatermark": "匠心手作", "brandSlogan": "手作串珠",`
en：`"tabBeads": "Beads", "tabDecors": "Charms", "materialCount": "{n} items", "paramSummary": "Parameters & Slots", "brandWatermark": "Artisan Craft", "brandSlogan": "Handmade Bracelets",`
ja：`"tabBeads": "ビーズ", "tabDecors": "パーツ", "materialCount": "全{n}点", "paramSummary": "パラメータとスロット", "brandWatermark": "匠の技", "brandSlogan": "ハンドメイドブレスレット",`
ko：`"tabBeads": "비즈", "tabDecors": "장식", "materialCount": "{n}종", "paramSummary": "파라미터·슬롯", "brandWatermark": "장인정신", "brandSlogan": "핸드메이드 브레이슬릿",`

复用已有键：`searchPlaceholder`、`catAll`（spec 中 searchMaterial/catAll 为重复命名，不新增）。

---

### Task 6: MaterialPanel.vue（常驻面板）+ 删除 MaterialSheet.vue

**Files:**
- Create: `src/pkg-diy/components/MaterialPanel.vue`
- Delete: `src/pkg-diy/components/MaterialSheet.vue`（仅 designer.vue 引用，Task 7 同步改）

- [ ] **Step 1: 新建 MaterialPanel.vue**

```vue
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
```

- [ ] **Step 2: 删除 MaterialSheet.vue**

---

### Task 7: designer.vue 布局 B 改造

**Files:**
- Modify: `src/pkg-diy/pages/designer.vue`（模板 + 脚本 + 样式整体改）

- [ ] **Step 1: 模板重构**（结构：top[预览→操作行→ModeChips→序列/摘要] + panel[MaterialPanel] + params 浮层 + CalcDetailSheet）

```html
<template>
    <view class="designer">
        <view class="designer__top">
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
                <view class="designer__knot-row">
                    <text class="designer__knot-toggle" @tap="d.knotVisible.value = !d.knotVisible.value">
                        {{ d.knotVisible.value ? t('diy.knot.hide') : t('diy.knot.show') }}
                    </text>
                </view>
                <view class="designer__capsules">
                    <text class="designer__caps designer__caps--state" @tap="showCalc = true">
                        {{ d.mode.value === 'free' ? t('diy.innerCirc') + ' ' + cm(d.result.value?.bom?.geometry?.innerCircumference) : t('diy.wristSize') + ' ' + (d.wristSize.value / 10).toFixed(1) + 'cm' }}
                        · {{ t(feedbackI18nKey(d.result.value?.bom?.geometry?.feedback)) }}
                    </text>
                    <text class="designer__caps">¥{{ yuan(d.result.value?.bom?.totalAmount) }}</text>
                    <text class="designer__caps designer__caps--link" @tap="goGuide">{{ t('diy.helpShort') }} ?</text>
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
```

- [ ] **Step 2: 脚本改动**

```ts
import MaterialPanel from '../components/MaterialPanel.vue';
import { useTenantStore } from '../../stores/tenant';
// 删除：import MaterialSheet ...

const tenantStore = useTenantStore();
const paramsOpen = ref(false);
// 删除：const showSheet = ref(false);

/** 环心水印文案：rawGlobalConfig.defaults 品牌字段 → 渠道 shopName → i18n 兜底 */
const brandWatermark = computed(() => {
    const cf: any = tenantStore.rawGlobalConfig?.defaults ?? {};
    return String(cf.brandName || tenantStore.shopName || t('diy.brandWatermark'));
});
const brandSlogan = computed(() => {
    const cf: any = tenantStore.rawGlobalConfig?.defaults ?? {};
    return String(cf.brandSlogan || t('diy.brandSlogan'));
});

function onBeadSwap(from: number, to: number) { d.swapBead(from, to); }
/** 非 free：点槽位选中指派目标并收起浮层（高亮保留在浮层内，点面板卡即指派） */
function selectSlot(i: number) {
    editingSlotIdx.value = i;
    paramsOpen.value = false;
}
function onAppendTap() { uni.showToast({ title: t('diy.appendHint'), icon: 'none' }); }
```

`openMaterial(slotIdx)` 删除；`onPickMaterial` 保持原逻辑（free → appendBead；非 free → `editingSlotIdx >= 0` 时 assignSlot）。

- [ ] **Step 3: 样式重构**

`.designer` 根：`min-height:100vh; padding-bottom:180rpx` →

```scss
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

    &__preview { position: relative; background: #fff; padding: 24rpx 20rpx 8rpx; }
    // __empty/__capsules/__caps*/__knot-* 保持原样
```

操作行（替换原 `__actions/__act`）：

```scss
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

        &--disabled { opacity: 0.5; }
    }
```

面板：

```scss
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
```

摘要条：

```scss
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
```

浮层（复用原 fixed CTA 思路）：

```scss
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
```

`__params/__param-*/__slider/__chips/__chip*/__slots/__slot*/` 保留原定义（`__params` 去掉外层 margin：改 `margin: 0; padding: 8rpx 0 20rpx;`）；`__slot--on` 新增高亮：

```scss
    &__slot--on {
        background: $brand-color-light;
        border-radius: $radius-sm;

        .designer__slot-role { color: $brand-color; font-weight: 600; }
    }
```

删除：`__cta-wrap`、原 `__cta`（已被新版替代）、`__preview-meta`（无引用）、旧 `__act` 单行定义。

---

### Task 8: 构建验证

- [ ] **Step 1: 构建**

Run: `pnpm build:h5`（cwd: d:\zhao\vshop）
Expected: 0 error；`dist/build/h5/assets/` 重新产出（旧静态预览服务器 job-7deb01... 无需停止，其服务目录若为 dist/build/h5 则自动生效）。

- [ ] **Step 2: 类型抽查**

Run: `npx vue-tsc --noEmit`（若依赖缺失/配置不支持则跳过，以 build 为准）。

---

### Task 9: Playwright 七判据回归 + 手机截图

**Files:**
- Create: `scripts/_verify_diy_p72.py`（Python + playwright sync API + CDP touch）

- [ ] **Step 1: 启动 dev（API 走 e.joho.cn 代理）**

PowerShell（后台）:
```powershell
$env:VITE_API_PROXY='https://e.joho.cn'; $env:VITE_API_URL='http://localhost:5180'; pnpm dev:h5
```
URL: `http://localhost:5180/#/pkg-diy/pages/designer?tenant=default`

- [ ] **Step 2: 脚本要点**（视口 390×844 dpr=2、has_touch、chromium 路径 `C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe`）

几何自算（新尺寸 690×660rpx）：`w=round(690/750*390)=359, h=round(660/750*390)=343`；canvas 页面 bbox 偏移 + `cx=w/2, cy=h/2`；`centerR=max(maxR+4, n*(2maxR+1)/2π)`；`scale=min(6, max(0.3, min((w/2-6)/(centerR+maxR), (h/2-6)/(centerR+maxR+18))))`（knot 可见 decorExt=18）；`ringR=centerR*scale`。maxR 取所点素材卡 meta 文案中的 mm。

拖拽用 CDP：`client.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x,y}]})` → touchMove 若干插值 → touchEnd。

断言：
1. **swap**：点卡 A/B/A/B（两不同色素材，读 `.mat-panel__item` dot/图区分）→ 4 珠 [A,B,A,B]；拖珠0(顶部 cx,cy−ringR)→珠3(n=4 时左侧 cx−ringR,cy) → `.seq-strip__dot` 顺序 == [B,B,A,A]。
2. **落隙**：拖珠0 → 珠1/珠2 间隙 45° 处 (cx+0.707ringR, cy+0.707ringR) → 顺序 [B,A,A,B]（插入语义顺移）。
3. **出环删除**：拖顶部珠至 (cx, cy−1.9ringR) → 条长 −1。
4. **实时预览**：swap 拖拽中（hold 不松手）截图，PIL 统计 canvas 区域 #ff6600 系像素 ≥ 20；delete 拖拽中统计 #E8463A 系像素 ≥ 20。
5. **常驻面板**：`.mat-panel` bbox 可见；点卡 A → 条长 +1 且 `.mat-panel__qx` 出现 ×n；点分类后网格数变化；搜索输入过滤。
6. **轨道圆 + 水印**：截图 PIL 检查 (cx, cy−ringR) 附近 ≈ rgb(235) 灰轨像素；环心区域暗像素 > 50（水印）。
7. **bbox 居中**：canvas bbox 水平中心距 195 ≤ 2px。

附加：切「定手围」chip → `.designer__summary` 可见 → 点开 `.designer__sheet-panel` 含 slider → 点槽位后浮层收起。

- [ ] **Step 3: 截图 ≥5 张** 存 `docs/pkg-diy-p7-screens/`：面板+串珠全景、swap 拖拽预览态、delete 红圈态、非 free 摘要+浮层、水印特写（390×844 dpr=2）。

---

### Task 10: 手册 + commit + push + 部署

- [ ] **Step 1: 手册更新** `docs/pkg-diy-操作手册.md`：新增「拖拽三态（压珠互换/落隙插入/出环删除）」「常驻选料面板（tab/搜索/分类/×n 角标）」「环心品牌水印」小节 + 嵌入 Task 9 截图；测试用例清单补七判据。

- [ ] **Step 2: Commit（多行 msg 用 `[IO.File]::WriteAllText` + UTF8Encoding($false)，勿 Set-Content）**

```powershell
git add src/pkg-diy src/i18n/locales docs/pkg-diy-操作手册.md docs/pkg-diy-p7-screens docs/superpowers/plans/2026-10-13-diy-designer-swap-panel.md scripts/_verify_diy_p72.py
git commit -F <msg文件>
git push origin master
```
msg: `feat(pkg-diy): P7.2 拖拽三态换位 + 常驻选料面板 + 画布水印`

- [ ] **Step 3: 部署（本地构建铁律，服务器不解压构建）**

```powershell
pnpm build:h5
tar -czf $env:TEMP\vshop-p72.tar.gz -C dist/build/h5 .
scp $env:TEMP\vshop-p72.tar.gz joho:/tmp/vshop-p72.tar.gz
ssh joho "tar -czf /tmp/esite-backup-p72.tar.gz -C /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index . 2>/dev/null; tar -xzf /tmp/vshop-p72.tar.gz -C /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index --no-same-owner --no-overwrite-dir"
```

- [ ] **Step 4: 线上抽查**：`https://e.joho.cn/#/pkg-diy/pages/designer` 可开、面板常驻、拖拽互换生效、新资产 hash 生效。

---

## Self-Review 结论

1. **Spec 覆盖**：三态判定+优先级（T2）、实时预览三态（T3）、swapBead+接线（T1/T7）、轨道圆+水印+tenant 兜底（T4/T7）、布局 B 100vh flex+面板常驻+图标化操作行+CTA 移入+摘要条浮层（T6/T7）、五语言（T5）、七判据回归+截图（T9）、手册+部署（T10）。序列条保持实时顺移未动（范围外 ✓）。无缺口。
2. **占位符扫描**：无 TBD；所有代码步骤含完整代码；T7 模板为完整替换块。
3. **类型一致性**：`swapBead(from,to)`、`bead-swap` emit 签名、`brandWatermark/brandSlogan` props、`MaterialPanel` props（无 show/freeMode）在 T1/T2/T4/T6/T7 一致；T3 分支变量 `to` 声明位置已在注记说明。
