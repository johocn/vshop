/**
 * 设计器状态与逻辑核心（4 模式：byWrist/byCount/pattern/free）。
 * - 本地预览：free → sequenceGeometry（逐颗求和）；其余 → braceletCalculator（v2 多槽位）
 * - spec 产出对齐服务端 calc-bridge v2 契约（diy-plugin/src/calc-bridge.ts）：
 *   spec.slots 为 Record<slotKey, { materialId, qtyOverride?, every? }>（v1 形式，满足模板 required 校验）；
 *   slotList（数组槽位，多 main/decor）+ sequence（free/pattern）由服务端 v2 路径消费复算；
 *   pattern/random 的 sequence 一律由前端生成（seeded rng，可复现），服务端不引入 Math.random。
 */
import { computed, ref, type Ref } from 'vue';
import { braceletCalculator } from '../vendor/diy-calc/bracelet-calculator';
import { easeOf } from '../vendor/diy-calc/bracelet';
import { generateSequence, sequenceGeometry } from '../vendor/diy-calc/sequence';
import { mulberry32 } from '../vendor/diy-calc/prng';
import { PRESETS, GROUP_COLORS } from '../utils/bead-render';
import type { CalculatorOutput, CalcMaterial, FitFeedback, SlotSelection } from '../vendor/diy-calc/types';
import type { DiySpecSlot } from '../../api/mutations/diy';

export type DesignerMode = 'byWrist' | 'byCount' | 'pattern' | 'free';
export type DesignerFit = 'snug' | 'comfortable' | 'loose';
export type ArrangeMode = 'alternate' | 'random' | 'zoned';

/** 配饰挂位（纯前端展示状态；保存时按 materialId 聚合回 slotList decor 槽位） */
export interface DecorPlacement {
    /** 实例 id：`${materialId}#${n}`（同素材多件可区分） */
    decorId: string;
    materialId: string;
    /** 间隙索引（第 k 与 k+1 颗珠之间，k 从 0 起）；-1 = 结位（流苏） */
    slot: number;
}

/**
 * 设计器产出的 spec（对齐服务端 calc-bridge v2 契约）：
 * slots 为 Record<slotKey, { materialId, qtyOverride?, every? }>（v1 形式，满足模板 required 校验）；
 * sequence/slotList/seed 为 v2 扩展字段，由服务端 calc-bridge v2 路径消费复算。
 * 注意：T6 定义的 DiyPlanSpecV2.slots 为数组，保存时以 slotList 承载数组槽位。
 */
export interface DiyDesignerSpec {
    templateCode: string;
    mode: DesignerMode;
    params: Record<string, number | string>;
    slots: Record<string, { materialId: string; qtyOverride?: number; every?: number }>;
    sequence?: string[];
    slotList?: DiySpecSlot[];
    seed?: number;
}

export const DIY_TEMPLATE_CODE = 'bracelet-classic';
export const WRIST_MIN = 120;
export const WRIST_MAX = 220;

/** getDiyMaterials 返回的素材行（name 为 LocalizedText 或 string） */
export interface DiyMaterialRow {
    id: string;
    code: string;
    name: string | Record<string, string> | null;
    categoryId: string | null;
    shape: string;
    diameter: number | null;
    axialLength: number | null;
    holeSize: number | null;
    attrs: Record<string, any> | null;
    renderUrl: string | null;
    renderPreset: string | null;
    price: number;
}

/** fit → 体感松量 ease（mm）。单一来源 = vendor @diy/calc easeOf（贴手 4 / 舒适 10 / 宽松 20，与服务端同构） */
export { easeOf } from '../vendor/diy-calc/bracelet';

/** 分 → 元（一位小数） */
export function yuan(fen: number | null | undefined): string {
    return ((fen ?? 0) / 100).toFixed(1);
}

/** mm → cm（一位小数，带单位） */
export function cm(mm: number | null | undefined): string {
    return ((mm ?? 0) / 10).toFixed(1) + 'cm';
}

/** LocalizedText 取值（回退链对齐服务端 localizeText） */
export function materialName(row: DiyMaterialRow | undefined, locale = 'zh-CN'): string {
    if (!row) return '';
    const n = row.name;
    if (typeof n === 'string') return n || row.code;
    if (n && typeof n === 'object') {
        const keys = [locale, locale.startsWith('zh') ? 'zh-CN' : 'en-US', 'zh-CN'];
        for (const k of keys) {
            const v = n[k];
            if (typeof v === 'string' && v !== '') return v;
        }
        const first = Object.values(n).find(v => typeof v === 'string' && v !== '');
        if (first) return first as string;
    }
    return row.code;
}

/** 素材主色：attrs.color → attrs.hex → attrs.group 色板 → preset 底色 → matte 兜底 */
export function materialColor(row: DiyMaterialRow | undefined): string {
    if (!row) return PRESETS.matte.base;
    const attrs = row.attrs || {};
    if (typeof attrs.color === 'string' && attrs.color) return attrs.color;
    if (typeof attrs.hex === 'string' && attrs.hex) return attrs.hex;
    if (typeof attrs.group === 'string' && GROUP_COLORS[attrs.group]) return GROUP_COLORS[attrs.group];
    return (row.renderPreset && PRESETS[row.renderPreset]?.base) || PRESETS.matte.base;
}

/** FitFeedback → i18n 键尾（diy.feedback.* / diy.fit.*） */
export function feedbackI18nKey(f: FitFeedback | undefined): string {
    switch (f) {
        case 'too-tight': return 'diy.feedback.tight';
        case 'snug': return 'diy.fit.snug';
        case 'ok': return 'diy.feedback.fit';
        case 'loose': return 'diy.feedback.loose';
        case 'too-loose': return 'diy.feedback.tooLoose';
        default: return 'diy.feedback.fit';
    }
}

/** ISO 时间 → 相对日期文案（刚刚 / n 天前 / n 周前 / n 个月前 / 超过一年按月数），翻译键带 {n} 插值 */
export function relativeDate(iso: string | number | Date | null | undefined, t: (k: string, v?: any) => string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 1) return t('diy.time.justNow');
    if (days < 7) return t('diy.time.daysAgo', { n: days });
    if (days < 30) return t('diy.time.weeksAgo', { n: Math.floor(days / 7) });
    return t('diy.time.monthsAgo', { n: Math.floor(days / 30) });
}

export function useDesigner(materials: Ref<DiyMaterialRow[]>, locale: Ref<string>) {
    const mode = ref<DesignerMode>('free');
    const wristSize = ref(155);
    const fit = ref<DesignerFit>('comfortable');
    const gap = ref(1);
    const slots = ref<DiySpecSlot[]>([{ role: 'main' }]);
    const sequence = ref<string[]>([]);
    const decors = ref<DecorPlacement[]>([]);
    const knotVisible = ref(true);
    let decorSeq = 0;
    const arrange = ref<ArrangeMode>('alternate');
    /** pattern 展示/保存共用的混编种子（改 arrange 或点重新混编时换） */
    const patternSeed = ref(Date.now() % 2147483647);

    const materialsById = computed(() => new Map(materials.value.map(m => [m.id, m])));

    const calcMaterials = computed<CalcMaterial[]>(() =>
        materials.value.map(m => ({
            id: m.id,
            code: m.code,
            name: materialName(m, locale.value),
            shape: m.shape,
            diameter: m.diameter,
            axialLength: m.axialLength,
            holeSize: m.holeSize,
            price: m.price,
        })),
    );

    /** 已选素材的槽位（空槽位不参与计算） */
    const filledSlots = computed<DiySpecSlot[]>(() => slots.value.filter(s => !!s.materialId));
    const mainSlots = computed(() => filledSlots.value.filter(s => s.role === 'main'));
    const hasMain = computed(() => mainSlots.value.length > 0);
    /** byCount：所有 main 槽位必须带精确颗数（≥1） */
    const byCountOk = computed(() => mainSlots.value.length > 0 && mainSlots.value.every(s => (s.qtyOverride ?? 0) >= 1));

    /** 客户端预览计算（free 用序列几何，其余用统一计算器） */
    const result = computed<CalculatorOutput>(() => {
        if (mode.value === 'free') {
            const decorSlots = slots.value.filter(s => s.role === 'decor' && s.materialId);
            return sequenceGeometry(sequence.value, calcMaterials.value, gap.value, wristSize.value, easeOf(fit.value), decorSlots as SlotSelection[]);
        }
        return braceletCalculator({
            params: { wristSize: wristSize.value, fit: fit.value, gap: gap.value },
            slots: filledSlots.value as SlotSelection[],
            materials: calcMaterials.value,
        });
    });

    const calcCount = computed(() => result.value.calc?.count ?? 0);

    /** pattern 模式展示/保存序列：前端 seeded 生成，可复现 */
    const patternSequence = computed<string[]>(() => {
        if (mode.value !== 'pattern') return [];
        const ring = filledSlots.value.filter(s => s.role !== 'decor');
        if (!ring.length || !calcCount.value) return [];
        return generateSequence(ring as SlotSelection[], arrange.value, calcCount.value, mulberry32(patternSeed.value));
    });

    /** 非自由模式的展示序列（byWrist/byCount 固定 alternate 预览排布） */
    const previewSequence = computed<string[]>(() => {
        if (mode.value === 'free') return sequence.value;
        if (mode.value === 'pattern') return patternSequence.value;
        const ring = filledSlots.value.filter(s => s.role !== 'decor');
        if (!ring.length || !calcCount.value) return [];
        return generateSequence(ring as SlotSelection[], 'alternate', calcCount.value);
    });

    /** BeadRing.beads：序列 + 素材渲染属性（materialId/color/diameterMm/preset/renderUrl 对齐组件 props 契约） */
    const previewBeads = computed(() =>
        previewSequence.value
            .map(id => materialsById.value.get(id))
            .filter((m): m is DiyMaterialRow => !!m)
            .map(m => ({
                materialId: m.id,
                color: materialColor(m),
                diameterMm: m.diameter ?? m.axialLength ?? 8,
                preset: m.renderPreset ?? null,
                renderUrl: m.renderUrl ?? null,
            })),
    );

    /** free：从当前槽位结果一键转入（alternate 序列打底，decor 不进几何环） */
    function enterFree() {
        const ring = filledSlots.value.filter(s => s.role !== 'decor');
        sequence.value = generateSequence(ring as SlotSelection[], 'alternate', calcCount.value);
        mode.value = 'free';
    }

    /** free 追加一颗到序列尾部 */
    function appendBead(id: string) {
        sequence.value = [...sequence.value, id];
    }

    /** free 移除第 i 颗 */
    function removeBeadAt(i: number) {
        if (i < 0 || i >= sequence.value.length) return;
        const next = [...sequence.value];
        next.splice(i, 1);
        sequence.value = next;
    }

    /** free 拖拽重排整体替换 */
    function reorderSequence(next: string[]) {
        sequence.value = next;
    }

    /** 直觉流：拖拽换位（from → to，splice 语义） */
    function moveBead(from: number, to: number) {
        if (from === to || from < 0 || to < 0 || from >= sequence.value.length || to >= sequence.value.length) return;
        const next = [...sequence.value];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        sequence.value = next;
    }

    /** 加配饰：吊坠默认挂序列中点间隙；流苏（attrs.decor === 'tassel'）默认挂结位（-1）。空序列记 0 待吸附 */
    function addDecor(materialId: string) {
        const row = materialsById.value.get(materialId);
        const kind = (row?.attrs as any)?.decor === 'tassel' ? -1
            : (sequence.value.length >= 2 ? Math.floor(sequence.value.length / 2) - 1 : 0);
        decorSeq += 1;
        decors.value = [...decors.value, { decorId: `${materialId}#${decorSeq}`, materialId, slot: kind }];
    }
    function moveDecor(decorId: string, slot: number) {
        decors.value = decors.value.map(d0 => (d0.decorId === decorId ? { ...d0, slot } : d0));
    }
    function removeDecor(decorId: string) {
        decors.value = decors.value.filter(d0 => d0.decorId !== decorId);
    }

    /** 清空全部（确认由 UI 层做） */
    function clearAll() {
        sequence.value = [];
        decors.value = [];
        slots.value = [{ role: 'main' }];
        patternSeed.value = Date.now() % 2147483647;
        mode.value = 'free';
    }

    /** 一键推荐：seeded 序列填充（直觉流） */
    function applyRecommend(seq: string[]) {
        sequence.value = [...seq];
        mode.value = 'free';
    }

    /** 保存校验：返回 null 表示可保存，否则为提示 i18n 键 */
    const validationKey = computed<string | null>(() => {
        if (mode.value === 'free') {
            return sequence.value.length >= 2 ? null : 'diy.needMain';
        }
        if (!hasMain.value) return 'diy.needMain';
        if (mode.value === 'byCount' && !byCountOk.value) return 'diy.countRequired';
        return null;
    });

    const canSave = computed(() => validationKey.value === null);

    /**
     * spec 产出：
     * - slots：服务端 calc-bridge 契约 Record<slotKey, selection>（main/focal/spacer，多 main 投影首个）；
     *   free 以序列为准，slots 最小集 = { main: 序列首个非 decor 素材 }（满足服务端 required 校验）
     * - slotList：v2 完整槽位（多 main/decor/arrange），服务端落库复现
     * - sequence：free/pattern 必带（前端统一生成）；byWrist/byCount 不带
     * - seed：pattern/random 的 rng 种子，服务端/他人端可复现同一序列
     */
    function buildSpec(): DiyDesignerSpec {
        const params: Record<string, number | string> = {
            wristSize: wristSize.value,
            fit: fit.value,
            gap: gap.value,
        };
        const filled = [...filledSlots.value];
        const decorIds = new Set(filled.filter(s => s.role === 'decor').map(s => s.materialId));

        const slotsRecord: Record<string, { materialId: string; qtyOverride?: number; every?: number }> = {};
        if (mode.value === 'free') {
            const firstRingId = sequence.value.find(id => !decorIds.has(id));
            if (firstRingId) slotsRecord.main = { materialId: firstRingId };
        } else {
            const mains = filled.filter(s => s.role === 'main');
            const focal = filled.find(s => s.role === 'focal');
            const spacer = filled.find(s => s.role === 'spacer');
            if (mains[0]) {
                slotsRecord.main = { materialId: mains[0].materialId };
                if (mode.value === 'byCount' || mains[0].qtyOverride != null) {
                    slotsRecord.main.qtyOverride = mains[0].qtyOverride;
                }
            }
            if (focal) slotsRecord.focal = { materialId: focal.materialId };
            if (spacer) {
                slotsRecord.spacer = { materialId: spacer.materialId };
                if (spacer.every != null) slotsRecord.spacer.every = spacer.every;
            }
        }

        const spec: DiyDesignerSpec = {
            templateCode: DIY_TEMPLATE_CODE,
            mode: mode.value,
            params,
            slots: slotsRecord,
        };
        // 配饰挂位 → slotList decor 槽位（按 materialId 聚合 qty；slot 为前端展示状态不落库）
        const decorAgg = new Map<string, number>();
        for (const d0 of decors.value) decorAgg.set(d0.materialId, (decorAgg.get(d0.materialId) ?? 0) + 1);
        for (const [materialId, qty] of decorAgg) {
            if (!filled.some(s => s.role === 'decor' && s.materialId === materialId)) {
                filled.push({ role: 'decor', materialId, qtyOverride: qty } as DiySpecSlot);
            }
        }
        if (filled.length) {
            spec.slotList = filled.map(s =>
                mode.value === 'pattern' ? { ...s, arrange: arrange.value } : { ...s },
            );
        }
        if (mode.value === 'free') {
            spec.sequence = [...sequence.value];
        } else if (mode.value === 'pattern') {
            spec.sequence = [...patternSequence.value];
            spec.seed = patternSeed.value;
        }
        return spec;
    }

    /** 槽位操作 */
    function addSlot(role: string) {
        slots.value = [...slots.value, { role } as DiySpecSlot];
    }
    function removeSlotAt(i: number) {
        slots.value = slots.value.filter((_, idx) => idx !== i);
    }
    function assignSlot(i: number, materialId: string) {
        const next = [...slots.value];
        next[i] = { ...next[i], materialId };
        slots.value = next;
    }
    function patchSlot(i: number, patch: Partial<DiySpecSlot>) {
        const next = [...slots.value];
        next[i] = { ...next[i], ...patch };
        slots.value = next;
    }
    /** 序列 → 槽位（按 materialId 聚合，qtyOverride=颗数；decor 不在序列中无涉及） */
    function slotsFromSequence(seq: string[]): DiySpecSlot[] {
        const counts = new Map<string, number>();
        for (const id of seq) counts.set(id, (counts.get(id) ?? 0) + 1);
        return [...counts.entries()].map(([materialId, n]) =>
            ({ role: 'main', materialId, qtyOverride: n }) as DiySpecSlot,
        );
    }

    /** 切模式：直觉流 → 专业模式时由当前序列反推槽位（颗数带入，byWrist 作收敛权重、byCount 直接命中校验） */
    function setMode(m: DesignerMode) {
        if (mode.value === 'free' && m !== 'free' && sequence.value.length >= 2) {
            slots.value = slotsFromSequence(sequence.value);
        }
        if (m === 'pattern' && arrange.value === 'random') {
            patternSeed.value = Date.now() % 2147483647;
        }
        mode.value = m;
    }
    function reshuffle() {
        patternSeed.value = Date.now() % 2147483647;
    }

    return {
        mode, wristSize, fit, gap, slots, sequence, arrange, patternSeed,
        filledSlots, mainSlots, hasMain, byCountOk, calcCount,
        result, previewSequence, previewBeads, calcMaterials, materialsById,
        validationKey, canSave,
        decors, knotVisible, moveBead, addDecor, moveDecor, removeDecor, clearAll, applyRecommend,
        enterFree, appendBead, removeBeadAt, reorderSequence, buildSpec,
        addSlot, removeSlotAt, assignSlot, patchSlot, setMode, reshuffle,
    };
}

const DRAFT_KEY = 'diy_designer_draft';

/** 暂存直觉流草稿（sequence/decors/参数） */
export function useDesignerDraft(d: {
    sequence: Ref<string[]>; decors: Ref<DecorPlacement[]>;
    wristSize: Ref<number>; fit: Ref<DesignerFit>; gap: Ref<number>;
}) {
    function saveDraft(): void {
        uni.setStorageSync(DRAFT_KEY, JSON.stringify({
            sequence: d.sequence.value, decors: d.decors.value,
            wristSize: d.wristSize.value, fit: d.fit.value, gap: d.gap.value,
        }));
    }
    /** 恢复草稿：有内容返回 true */
    function loadDraft(): boolean {
        try {
            const raw = uni.getStorageSync(DRAFT_KEY);
            if (!raw) return false;
            const dft = JSON.parse(raw) as {
                sequence?: string[]; decors?: DecorPlacement[];
                wristSize?: number; fit?: DesignerFit; gap?: number;
            };
            if (!dft.sequence?.length) return false;
            d.sequence.value = dft.sequence;
            d.decors.value = (dft.decors ?? []).filter(x => x && x.decorId && x.materialId);
            if (dft.wristSize) d.wristSize.value = dft.wristSize;
            if (dft.fit) d.fit.value = dft.fit;
            if (dft.gap != null) d.gap.value = dft.gap;
            return true;
        } catch {
            return false;
        }
    }
    return { saveDraft, loadDraft };
}
