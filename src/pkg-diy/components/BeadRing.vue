<template>
    <canvas
        type="2d"
        :id="canvasId"
        :canvas-id="canvasId"
        :style="{ width: cssW + 'px', height: cssH + 'px' }"
        @touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd"
    />
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref, watch } from 'vue';
import { drawRing, drawBead, loadSprites } from '../utils/bead-render';
import type { RenderBead } from '../utils/bead-render';

export interface BeadRingBead {
    materialId: string;
    color: string;
    diameterMm: number;
    preset?: string | null;
    renderUrl?: string | null;
}

const props = defineProps<{
    canvasId: string;
    /** 画布宽（rpx） */
    width: number;
    /** 画布高（rpx） */
    height: number;
    beads: BeadRingBead[];
}>();

const sys = uni.getSystemInfoSync();
const cssW = computed(() => Math.max(1, Math.round((props.width / 750) * sys.windowWidth)));
const cssH = computed(() => Math.max(1, Math.round((props.height / 750) * sys.windowWidth)));

let ctx: CanvasRenderingContext2D | null = null;
const spriteMap = ref(new Map<string, HTMLImageElement>());

/** materialId → 稳定纹理种子（棉点/气泡位置不随重绘跳动） */
function hashSeed(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return (h % 233280) || 1;
}

/**
 * 贴图加载器：H5 用 Image（透明底 PNG，crossOrigin 以便画布可导出分享图）；
 * 小程序首期 reject 走 preset 层，后续可接 canvas.createImage。
 */
function imageLoader(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        // #ifdef H5
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('sprite load fail: ' + src));
        img.src = src;
        return;
        // #endif
        // #ifndef H5
        void src;
        reject(new Error('sprite loader not implemented on this platform'));
        // #endif
    });
}

/** 取 canvas node + css 尺寸；H5 node 缺失时查 DOM 兜底（uni-canvas 内部 canvas） */
function obtainCanvas(cb: (canvas: any, cssWidth: number, cssHeight: number) => void) {
    const inst = getCurrentInstance();
    const query = uni.createSelectorQuery().in(inst?.proxy as any);
    query
        .select('#' + props.canvasId)
        .fields({ node: true, size: true } as any, (res: any) => {
            if (res && res.node) {
                cb(res.node, res.width, res.height);
                return;
            }
            // #ifdef H5
            const host = document.getElementById(props.canvasId);
            const canvas = (host && (host as HTMLCanvasElement).tagName === 'CANVAS'
                ? host
                : host?.querySelector('canvas')) as HTMLCanvasElement | null;
            if (canvas) cb(canvas, canvas.clientWidth, canvas.clientHeight);
            // #endif
        })
        .exec();
}

/** 全貌自适应缩放：中心线半径由逐颗周长收敛，scale 保证整环+装饰外伸完整可见 */
function render() {
    if (!ctx) return;
    const w = cssW.value;
    const h = cssH.value;
    ctx.clearRect(0, 0, w, h);
    const beads = props.beads || [];
    if (beads.length === 0) return;
    const gapMm = 1;
    const radiiMm = beads.map(b => Math.max(0.5, b.diameterMm) / 2);
    const maxR = Math.max(...radiiMm);
    // 珠心轨迹半径（mm）：Σ(珠径+间隙) / 2π，下限防 1-2 颗时退化
    const centerR = Math.max(maxR + 4, (beads.length * (maxR * 2 + gapMm)) / (Math.PI * 2));
    const pad = 6;
    const scale = Math.min(6, Math.max(0.3, Math.min((w / 2 - pad) / (centerR + maxR), (h / 2 - pad) / (centerR + maxR))));
    const ringR = centerR * scale;
    geo = { cx: w / 2, cy: h / 2, ringR, scale, radii: radiiMm, n: beads.length };
    const rs: RenderBead[] = beads.map((b, i) => ({
        x: 0, y: 0,
        r: Math.max(1, radiiMm[i] * scale),
        color: b.color,
        preset: b.preset ?? null,
        sprite: (b.renderUrl && spriteMap.value.get(b.renderUrl)) || null,
        seed: hashSeed(b.materialId || b.color),
    }));
    drawRing(ctx, rs, w / 2, h / 2, ringR, ringR);
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
        }
    }
}

const emit = defineEmits<{
    (e: 'bead-tap', index: number): void;
    (e: 'bead-move', from: number, to: number): void;
    (e: 'bead-remove', index: number): void;
}>();

/** 拖拽运行时：ghost 跟手；phase=delete 时画红圈吸附态 */
interface DragState { index: number; x: number; y: number; phase: 'move' | 'delete'; overRing: boolean }
let drag: DragState | null = null;
let startX = 0, startY = 0, moved = false;
/** 命中结果缓存（几何参数 render 与 touch 共享） */
let geo = { cx: 0, cy: 0, ringR: 0, scale: 1, radii: [] as number[], n: 0 };

function hitBead(x: number, y: number): number {
    // 极坐标最近珠：角距+径距综合评分，且落点距珠心 ≤ 珠半径*1.6
    const dx = x - geo.cx, dy = y - geo.cy;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const ang = Math.atan2(dy, dx);
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < geo.n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / geo.n;
        const d = Math.PI - Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const radial = Math.abs(dist - geo.ringR);
        const score = d * geo.ringR + radial;
        if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return -1;
    const r = geo.radii[best] ?? 6;
    return Math.hypot(dx - geo.ringR * Math.cos(ang), dy - geo.ringR * Math.sin(ang)) <= r * 1.6 ? best : -1;
}

/** 落点插入间隙：角度 → 目标 index（splice 语义） */
function insertIndexAt(x: number, y: number): number {
    const ang = Math.atan2(y - geo.cy, x - geo.cx);
    const rel = ((ang + Math.PI / 2) / (Math.PI * 2) * geo.n + geo.n) % geo.n;
    return Math.round(rel) % geo.n;
}

function toLocal(e: any): { x: number; y: number } | null {
    const t = e.touches?.[0] ?? e.changedTouches?.[0];
    if (!t) return null;
    // #ifdef H5
    const el = document.getElementById(props.canvasId);
    const rect = el?.getBoundingClientRect();
    if (rect) return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    // #endif
    return { x: (t.x ?? 0) as number, y: (t.y ?? 0) as number };
}

function onTouchStart(e: any) {
    const p = toLocal(e);
    if (!p || !props.beads.length) return;
    startX = p.x; startY = p.y; moved = false;
    const i = hitBead(p.x, p.y);
    if (i >= 0) drag = { index: i, x: p.x, y: p.y, phase: 'move', overRing: true };
}
function onTouchMove(e: any) {
    if (!drag) return;
    const p = toLocal(e);
    if (!p) return;
    if (!moved && Math.hypot(p.x - startX, p.y - startY) < 6) return;
    moved = true;
    drag.x = p.x; drag.y = p.y;
    drag.overRing = Math.hypot(p.x - geo.cx, p.y - geo.cy) <= geo.ringR * 1.6;
    drag.phase = drag.overRing ? 'move' : 'delete';
    render();
}
function onTouchEnd() {
    if (drag && moved) {
        if (drag.phase === 'delete') emit('bead-remove', drag.index);
        else emit('bead-move', drag.index, insertIndexAt(drag.x, drag.y));
    } else if (drag) {
        emit('bead-tap', drag.index);
    }
    drag = null; moved = false;
    render();
}

onMounted(async () => {
    obtainCanvas((canvas, w, h) => {
        const dpr = sys.pixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.scale(dpr, dpr);
        render();
        // 贴图预加载一次；beads 变化只重绘
        const urls = (props.beads || []).map(b => b.renderUrl || null);
        loadSprites(urls, imageLoader).then(map => {
            spriteMap.value = map;
            render();
        });
    });
});

watch(() => props.beads, () => render(), { deep: true });
</script>
