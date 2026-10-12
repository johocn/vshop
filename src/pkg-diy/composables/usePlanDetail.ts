/**
 * 方案详情逻辑核心：
 * - 数据：已登录先 myDiyPlan（owner 视角，bom/status/isPublic 为服务端权威快照），
 *   失败/为空回退 diyPublicPlan（非 owner 公开视角，无 bom——本地 vendor calc 同构复算展示）
 * - 序列重建：spec.sequence（free/pattern）直接用；byWrist/byCount 用 generateSequence(slotList 非 decor, arrange, 本地复算颗数)
 * - 下单：createOrderFromPlan 服务端建含载体行的活跃订单（orderLine customFields 挂 diyPlanId/diyUnitPrice），
 *   前端跳 /pkg-order/pages/checkout 走现有支付链路（checkout onMounted 拉 getActiveOrder）
 */
import { computed, ref, type Ref } from 'vue';
import { braceletCalculator } from '../vendor/diy-calc/bracelet-calculator';
import { generateSequence, sequenceGeometry } from '../vendor/diy-calc/sequence';
import type { CalculatorOutput, CalcBom, CalcMaterial, SlotSelection } from '../vendor/diy-calc/types';
import { getMyDiyPlan, getDiyPublicPlan, getDiyMaterials } from '../../api/queries/diy';
import { quoteDiyPlan, createOrderFromPlan, publishDiyPlan, copyDiyPlan } from '../../api/mutations/diy';
import { useAuthStore } from '../../stores/auth';
import {
    materialName, materialColor, yuan, easeOf,
    type DiyMaterialRow, type DiyDesignerSpec,
} from './useDesigner';

/** v1 存量 spec.slots 的 key → role（bracelet-classic 模板 config 键与角色同名） */
const V1_KEY_ROLE: Record<string, string> = { main: 'main', focal: 'focal', spacer: 'spacer' };

interface SlotListItem {
    role: string;
    materialId?: string;
    qtyOverride?: number;
    every?: number;
    arrange?: 'alternate' | 'random' | 'zoned';
}

export type PlanStatus = 'draft' | 'quoted' | 'ordered';

export function usePlanDetail(materials: Ref<DiyMaterialRow[]>, locale: Ref<string>, t: (k: string) => string) {
    const authStore = useAuthStore();
    const planId = ref('');
    const plan = ref<any>(null);
    /** true = 经 myDiyPlan 载入（本人方案）；false = 公开方案 */
    const isOwner = ref(false);
    const loading = ref(false);

    const materialsMap = computed(() => new Map(materials.value.map(m => [m.id, m])));
    const spec = computed<DiyDesignerSpec | null>(() => plan.value?.spec ?? null);
    const status = computed<PlanStatus | null>(() => plan.value?.status ?? null);

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

    /**
     * 本地同构复算（与 calc-bridge v2 双路径一致）：
     * - sequence 非空 → sequenceGeometry（decor 只计价）
     * - slotList 非空 → braceletCalculator v2 多槽位
     * - 仅 v1 对象 slots → braceletCalculator（key→role 同名映射）
     */
    const localResult = computed<CalculatorOutput | null>(() => {
        const s = spec.value;
        if (!s || !materials.value.length) return null;
        const params: Record<string, number | string> = s.params || {};
        const W = Number(params.wristSize ?? 155);
        const gap = Number(params.gap ?? 0.5);
        const fit = String(params.fit ?? 'comfortable');
        const slotList: SlotListItem[] = Array.isArray(s.slotList) ? s.slotList : [];
        const sequence = (s.sequence ?? []).map(String);
        if (sequence.length > 0) {
            const decor = slotList.filter(x => x.role === 'decor' && x.materialId);
            return sequenceGeometry(sequence, calcMaterials.value, gap, W, easeOf(fit), decor as SlotSelection[]);
        }
        if (slotList.length > 0) {
            return braceletCalculator({ params, slots: slotList.filter(x => x.materialId) as SlotSelection[], materials: calcMaterials.value });
        }
        const v1Slots = Object.entries(s.slots || {})
            .filter(([, sel]) => !!(sel as any)?.materialId)
            .map(([key, sel]) => ({
                key,
                role: V1_KEY_ROLE[key] ?? 'main',
                materialId: String((sel as any).materialId),
                qtyOverride: (sel as any).qtyOverride,
                every: (sel as any).every,
            }));
        if (!v1Slots.length) return null;
        return braceletCalculator({ params, slots: v1Slots as SlotSelection[], materials: calcMaterials.value });
    });

    /** BOM 展示：owner 用服务端快照（权威），公开方案本地复算 */
    const bomView = computed<CalcBom>(() => {
        const serverBom = plan.value?.bom;
        if (serverBom && Array.isArray(serverBom.items)) {
            return {
                items: serverBom.items,
                totalCount: serverBom.totalCount ?? 0,
                totalAmount: serverBom.totalAmount ?? 0,
                cord: serverBom.cord ?? null,
                geometry: serverBom.geometry ?? null,
            };
        }
        return localResult.value?.bom ?? { items: [], totalCount: 0, totalAmount: 0, cord: null, geometry: null };
    });

    /** 展示序列：sequence 优先；byWrist/byCount 按 arrange 生成本地序列（颗数 = 本地复算环上颗数） */
    const displaySequence = computed<string[]>(() => {
        const s = spec.value;
        if (!s) return [];
        const sequence = (s.sequence ?? []).map(String);
        if (sequence.length > 0) {
            return sequence.filter(id => materialsMap.value.has(id));
        }
        const slotList: SlotListItem[] = Array.isArray(s.slotList)
            ? s.slotList.filter(x => x.role !== 'decor' && x.materialId)
            : [];
        const ring: SlotListItem[] = slotList.length
            ? slotList
            : Object.entries(s.slots || {})
                .filter(([key, sel]) => V1_KEY_ROLE[key] && !!(sel as any)?.materialId)
                .map(([key, sel]) => ({
                    role: V1_KEY_ROLE[key],
                    materialId: String((sel as any).materialId),
                    qtyOverride: (sel as any).qtyOverride,
                    every: (sel as any).every,
                }));
        if (!ring.length) return [];
        const count = localResult.value?.calc?.count ?? Number(plan.value?.totalCount ?? 0);
        if (!count) return [];
        const arrange = ring[0]?.arrange ?? 'alternate';
        return generateSequence(ring as SlotSelection[], arrange, count).filter(id => materialsMap.value.has(id));
    });

    /** BeadRing.beads（materialId/color/diameterMm/preset/renderUrl 对齐组件 props） */
    const previewBeads = computed(() =>
        displaySequence.value
            .map(id => materialsMap.value.get(id))
            .filter((m): m is DiyMaterialRow => !!m)
            .map(m => ({
                materialId: m.id,
                color: materialColor(m),
                diameterMm: m.diameter ?? m.axialLength ?? 8,
                preset: m.renderPreset ?? null,
                renderUrl: m.renderUrl ?? null,
            })),
    );

    /** 标题：公开方案用服务端 title；owner 方案按 derivePlanTitle 口径派生（BOM 名 ×2 + 手围 cm） */
    const title = computed<string>(() => {
        if (plan.value?.title) return String(plan.value.title);
        const names: string[] = [];
        for (const item of bomView.value.items ?? []) {
            if (item.name && !names.includes(item.name)) names.push(item.name);
            if (names.length >= 2) break;
        }
        const wrist = Number(spec.value?.params?.wristSize ?? 0);
        if (!names.length) return t('diy.planDetail.shareTitle');
        return names.join('') + (wrist > 0 ? ` · ${Math.round(wrist / 10)}cm` : '');
    });

    /** 操作可见性（对齐后端：quote=owner+draft/quoted；order=登录+非 ordered+(owner 或 isPublic)；publish=owner；copy=非 owner） */
    const canQuote = computed(() => isOwner.value && (status.value === 'draft' || status.value === 'quoted'));
    const canOrder = computed(() => status.value !== 'ordered' && (isOwner.value || plan.value != null));
    const canPublish = computed(() => isOwner.value && status.value !== 'ordered');
    const canCopy = computed(() => !isOwner.value && plan.value != null);
    const isOrdered = computed(() => status.value === 'ordered');
    const isPublicShown = computed(() => isOwner.value && !!plan.value?.isPublic);

    /** 载入：owner 优先，失败/为空回退公开方案 */
    async function load(id: string) {
        planId.value = id;
        loading.value = true;
        plan.value = null;
        try {
            if (authStore.isLoggedIn) {
                try {
                    const res: any = await getMyDiyPlan(id);
                    if (res?.myDiyPlan?.id) {
                        plan.value = res.myDiyPlan;
                        isOwner.value = true;
                    }
                } catch {
                    /* PLAN_NOT_FOUND_OR_NOT_OWNER 等 → 回退公开方案 */
                }
            }
            if (!plan.value) {
                const res: any = await getDiyPublicPlan(id);
                if (res?.diyPublicPlan?.id) {
                    plan.value = res.diyPublicPlan;
                    isOwner.value = false;
                }
            }
        } finally {
            loading.value = false;
        }
        return !!plan.value;
    }

    /** 素材行（Public diyMaterials 全量） */
    async function loadMaterials() {
        try {
            const res: any = await getDiyMaterials();
            materials.value = (res?.diyMaterials?.items || []).map((m: any) => ({ ...m, id: String(m.id) }));
        } catch {
            materials.value = [];
        }
    }

    /** 报价（owner + draft/quoted）：服务端复算为准，金额与本地展示不一致时提示 */
    async function onQuote(): Promise<void> {
        const res: any = await quoteDiyPlan(planId.value);
        const next = res?.quoteDiyPlan;
        if (next) plan.value = next;
        const serverAmount = Number(next?.bom?.totalAmount ?? 0);
        const localAmount = bomView.value.totalAmount;
        if (serverAmount !== localAmount) {
            uni.showToast({ title: t('diy.quoteMismatch') + ' ¥' + yuan(serverAmount), icon: 'none' });
        } else {
            uni.showToast({ title: t('diy.quoteDone') + ' ¥' + yuan(serverAmount), icon: 'success' });
        }
    }

    /**
     * 下单：登录门控 → createOrderFromPlan（服务端建含载体行的活跃订单并扣库存，返回带 orderLineId 的 plan）
     * → toast → 跳 checkout（onMounted 拉 getActiveOrder 即该订单）走现有支付链路。
     */
    async function onOrder(): Promise<void> {
        if (!authStore.requireLogin('/pkg-diy/pages/plan-detail?id=' + planId.value)) return;
        const res: any = await createOrderFromPlan(planId.value);
        if (res?.createOrderFromPlan?.id) plan.value = res.createOrderFromPlan;
        uni.showToast({ title: t('diy.orderSuccess'), icon: 'success' });
        setTimeout(() => uni.navigateTo({ url: '/pkg-order/pages/checkout' }), 600);
    }

    /** 公开/取消公开（owner） */
    async function onPublish(): Promise<string | null> {
        const next = !plan.value?.isPublic;
        const res: any = await publishDiyPlan(planId.value, next);
        if (res?.publishDiyPlan?.id) plan.value = res.publishDiyPlan;
        return next ? t('diy.publish') : t('diy.unpublish');
    }

    /** 复制他人公开方案 → 跳新方案详情 */
    async function onCopy(): Promise<string | null> {
        const res: any = await copyDiyPlan(planId.value);
        const newId = res?.copyDiyPlan?.id != null ? String(res.copyDiyPlan.id) : '';
        if (newId) {
            uni.redirectTo({ url: '/pkg-diy/pages/plan-detail?id=' + newId });
            return t('diy.copySuccess');
        }
        return null;
    }

    return {
        planId, plan, isOwner, status, loading,
        spec, bomView, localResult, displaySequence, previewBeads, title,
        canQuote, canOrder, canPublish, canCopy, isOrdered, isPublicShown,
        load, loadMaterials, onQuote, onOrder, onPublish, onCopy,
    };
}
