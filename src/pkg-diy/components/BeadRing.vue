<template>
    <canvas
        type="2d"
        :id="canvasId"
        :canvas-id="canvasId"
        :style="{ width: cssW + 'px', height: cssH + 'px', display: 'block', margin: '0 auto' }"
        @touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd"
    />
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref, watch } from 'vue';
import { drawRing, drawBead, loadSprites } from '../utils/bead-render';
import type { RenderBead } from '../utils/bead-render';
import { materialColor } from '../composables/useDesigner';
import type { DecorPlacement } from '../composables/useDesigner';
import type { DiyMaterialRow } from '../composables/useDesigner';

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
    /** 配饰挂位（slot=-1 结位；空数组不渲染任何挂点——配饰可选可跳过） */
    decors?: DecorPlacement[];
    knotVisible?: boolean;
    /** 配饰素材行（渲染 decor 用：color/preset/renderUrl） */
    decorRows?: DiyMaterialRow[];
    /** 环心品牌水印主文案（tenant shopName；空串不绘制） */
    brandWatermark?: string;
    /** 环心水印副文案（品牌标语） */
    brandSlogan?: string;
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
    // 绳结顶置·环贴底（方案 A）：顶部固定预留绳结带，环在剩余空间垂直居中，
    // scale 不再被 decorExt 上下对称压缩；有配饰挂坠时按挂坠实际外伸上下追加预留（迭代收敛）
    const hasDecor = (props.decors?.length ?? 0) > 0;
    const knotSpace = props.knotVisible !== false ? 26 : 0;
    const decorMm = hasDecor
        ? Math.max(0, ...(props.decors ?? []).map(d => {
            const r0 = (props.decorRows ?? []).find(x => x.id === d.materialId);
            return (r0?.diameter ?? r0?.axialLength ?? 8) / 2;
        }))
        : 0;
    const scaleH = (w / 2 - pad) / (centerR + maxR);
    let decorPx = decorMm > 0 ? decorMm * scaleH + 6 : 0;   // 挂钩外伸 ≈ 坠半径 + 6px
    let scale = 1;
    for (let it = 0; it < 3; it++) {
        const avail = h - knotSpace - 2 * decorPx - 2 * pad;
        scale = Math.min(6, Math.max(0.3, Math.min(scaleH, avail / 2 / (centerR + maxR))));
        const next = decorMm > 0 ? decorMm * scale + 6 : 0;
        if (Math.abs(next - decorPx) < 0.5) { decorPx = next; break; }
        decorPx = next;
    }
    const cy = pad + knotSpace + decorPx + (h - knotSpace - 2 * decorPx - 2 * pad) / 2;
    const ringR = centerR * scale;
    geo = { cx: w / 2, cy, ringR, scale, radii: radiiMm, n: beads.length };
    // 细轨道圆（珠心轨迹，先于珠子绘制；H5 单位矩阵铁律：禁 scale(dpr)）
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w / 2, cy, ringR, 0, Math.PI * 2); ctx.stroke();
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
            ctx.fillText(wm, w / 2, cy - (slogan ? fs1 * 0.15 : fs1 * 0.35));
        }
        if (slogan) {
            ctx.fillStyle = 'rgba(0,0,0,0.10)';
            ctx.font = `${fs2}px sans-serif`;
            ctx.fillText(slogan, w / 2, cy + fs1 * 0.75);
        }
    }
    const rs: RenderBead[] = beads.map((b, i) => ({
        x: 0, y: 0,
        r: Math.max(1, radiiMm[i] * scale),
        color: b.color,
        preset: b.preset ?? null,
        sprite: (b.renderUrl && spriteMap.value.get(b.renderUrl)) || null,
        seed: hashSeed(b.materialId || b.color),
    }));
    drawRing(ctx, rs, w / 2, cy, ringR, ringR);
    // 结位（12 点位）：结点 + 双线尾；隐藏时仅留小刻度点
    decorPos = new Map();
    const knotY = cy - ringR - maxR * scale - 8;
    knotPos = { x: w / 2, y: knotY - 12 };
    if (props.knotVisible !== false) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(w / 2, knotY, 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2 - 5, knotY + 2); ctx.lineTo(w / 2 - 11, knotY + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2 + 5, knotY + 2); ctx.lineTo(w / 2 + 11, knotY + 12); ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(w / 2, knotY, 2, 0, Math.PI * 2); ctx.fill();
    }
    // 配饰挂点：间隙 k 中点角向外偏移；拖拽中的 decor 画 ghost 位
    for (const d0 of props.decors ?? []) {
        let ax: number, ay: number;
        if (dragDecor && dragDecor.decorId === d0.decorId && decorMoved) {
            ax = dragDecor.x; ay = dragDecor.y;
        } else if (d0.slot < 0) {
            ax = knotPos.x; ay = knotPos.y;
        } else {
            const a = -Math.PI / 2 + (Math.PI * 2 * (d0.slot + 0.5)) / geo.n;
            ax = w / 2 + (ringR + maxR * scale) * Math.cos(a);
            ay = cy + (ringR + maxR * scale) * Math.sin(a);
        }
        decorPos.set(d0.decorId, { x: ax, y: ay });
        drawDecorAt(ax, ay, d0);
        if (dragDecor && dragDecor.decorId === d0.decorId && decorMoved && dragDecorPhase === 'delete') {
            ctx.strokeStyle = '#E8463A'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(ax, ay, 14, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#E8463A'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('✕', ax, ay + 4);
        }
    }
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
        } else {
            // 落隙预览：目标间隙小虚线圈（splice 语义落点 = 原布局 from<to ? 间隙(to+0.5) : 间隙(to-0.5)）
            const to = insertIndexAt(drag.x, drag.y);
            if (to !== i) {
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
    }
}

const emit = defineEmits<{
    (e: 'bead-tap', index: number): void;
    (e: 'bead-move', from: number, to: number): void;
    (e: 'bead-swap', from: number, to: number): void;
    (e: 'bead-remove', index: number): void;
    (e: 'decor-tap', decorId: string): void;
    (e: 'decor-move', decorId: string, slot: number): void;
    (e: 'decor-remove', decorId: string): void;
}>();

/** 拖拽运行时：ghost 跟手；phase 三态（swap 压珠/insert 落隙/delete 出环）驱动实时预览 */
interface DragState { index: number; x: number; y: number; phase: 'swap' | 'insert' | 'delete'; overRing: boolean }
let drag: DragState | null = null;
let startX = 0, startY = 0, moved = false;
/** 命中结果缓存（几何参数 render 与 touch 共享） */
let geo = { cx: 0, cy: 0, ringR: 0, scale: 1, radii: [] as number[], n: 0 };

/** decor 拖拽运行时 */
let dragDecor: { decorId: string; x: number; y: number } | null = null;
let decorMoved = false;
let dragDecorPhase: 'move' | 'delete' = 'move';

/** 配饰绘制锚点缓存：decorId → 画布坐标（touch 命中用） */
let decorPos = new Map<string, { x: number; y: number }>();
let knotPos = { x: 0, y: 0 };

function drawDecorAt(x: number, y: number, d0: DecorPlacement) {
    if (!ctx) return;
    const row = (props.decorRows ?? []).find(r0 => r0.id === d0.materialId);
    // 按素材直径渲染（mm → px；下限 6*scale 保证小配饰可辨）
    const r = Math.max(6 * geo.scale, ((row?.diameter ?? row?.axialLength ?? 8) / 2) * geo.scale);
    const sprite = row?.renderUrl ? spriteMap.value.get(row.renderUrl) ?? null : null;
    if (sprite) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    else drawBead(ctx, { x, y, r, color: materialColor(row), preset: row?.renderPreset ?? null, seed: hashSeed(d0.decorId) });
    // 挂环
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - r - 3, 2.5, 0, Math.PI * 2); ctx.stroke();
}

function hitBead(x: number, y: number): number {
    // 极坐标最近珠：角距+径距综合评分，且落点距珠心 ≤ 珠半径*1.6
    const dx = x - geo.cx, dy = y - geo.cy;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const ang = Math.atan2(dy, dx);
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < geo.n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / geo.n;
        // 真实角距 0..π（ang=a 时为 0；勿再加 π- 前缀导致选中对侧珠）
        const d = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const radial = Math.abs(dist - geo.ringR);
        const score = d * geo.ringR + radial;
        if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return -1;
    const r = (geo.radii[best] ?? 6) * geo.scale;   // mm → px
    return Math.hypot(dx - geo.ringR * Math.cos(ang), dy - geo.ringR * Math.sin(ang)) <= r * 1.6 ? best : -1;
}

/** 落点插入间隙：角度 → 目标 index（splice 语义） */
function insertIndexAt(x: number, y: number): number {
    const ang = Math.atan2(y - geo.cy, x - geo.cx);
    const rel = ((ang + Math.PI / 2) / (Math.PI * 2) * geo.n + geo.n) % geo.n;
    return Math.round(rel) % geo.n;
}

function hitDecor(x: number, y: number): string | null {
    for (const [decorId, p] of decorPos) {
        if (Math.hypot(x - p.x, y - p.y) <= 16) return decorId;
    }
    return null;
}

/** 落点 → 挂位：靠结位吸附 -1，否则最近间隙 floor */
function hitDecorSlot(x: number, y: number): number {
    const ang = Math.atan2(y - geo.cy, x - geo.cx);
    const rel = ((ang + Math.PI / 2) / (Math.PI * 2) * geo.n + geo.n) % geo.n;
    const dist = Math.hypot(x - geo.cx, y - geo.cy);
    if ((dist > geo.ringR * 1.35 && (rel < 0.5 || rel > geo.n - 0.5))) return -1;
    return Math.max(0, Math.min(geo.n - 1, Math.floor(rel)));
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
    if (!p) return;
    startX = p.x; startY = p.y; moved = false; decorMoved = false;
    const did = hitDecor(p.x, p.y);
    if (did) { dragDecor = { decorId: did, x: p.x, y: p.y }; drag = null; return; }
    dragDecor = null;
    if (!props.beads.length) return;
    const i = hitBead(p.x, p.y);
    if (i >= 0) drag = { index: i, x: p.x, y: p.y, phase: 'insert', overRing: true };
}
function onTouchMove(e: any) {
    if (dragDecor) {
        const p = toLocal(e); if (!p) return;
        if (!moved && Math.hypot(p.x - startX, p.y - startY) < 6) return;
        moved = true; decorMoved = true;
        dragDecor.x = p.x; dragDecor.y = p.y;
        dragDecorPhase = Math.hypot(p.x - geo.cx, p.y - geo.cy) > geo.ringR * 1.6 ? 'delete' : 'move';
        render(); return;
    }
    if (!drag) return;
    const p = toLocal(e);
    if (!p) return;
    if (!moved && Math.hypot(p.x - startX, p.y - startY) < 6) return;
    moved = true;
    drag.x = p.x; drag.y = p.y;
    drag.overRing = Math.hypot(p.x - geo.cx, p.y - geo.cy) <= geo.ringR * 1.6;
    if (!drag.overRing) {
        drag.phase = 'delete';
    } else {
        const hit = hitBead(p.x, p.y);
        drag.phase = hit >= 0 && hit !== drag.index ? 'swap' : 'insert';
    }
    render();
}
function onTouchEnd() {
    if (dragDecor) {
        if (moved) {
            if (dragDecorPhase === 'delete') emit('decor-remove', dragDecor.decorId);
            else emit('decor-move', dragDecor.decorId, hitDecorSlot(dragDecor.x, dragDecor.y));
        } else emit('decor-tap', dragDecor.decorId);
        dragDecor = null; decorMoved = false; moved = false;
        render(); return;
    }
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
    drag = null; moved = false;
    render();
}

let canvasInited = false;
onMounted(async () => {
    obtainCanvas((canvas) => {
        // 幂等保护：重复回调不重复初始化（避免 ctx 缩放叠加）
        if (canvasInited || !canvas) return;
        canvasInited = true;
        // 尺寸以 cssW/cssH 为准（与 :style、render() 同源），不用 client 实测值
        const w = cssW.value;
        const h = cssH.value;
        const dpr = sys.pixelRatio || 1;
        // #ifdef H5
        // H5 兜底路径的 inner canvas 无 CSS 尺寸约束，buffer 会被当显示尺寸导致视觉错位 dpr 倍
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        // #endif
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        // #ifndef H5
        // 小程序 canvas 2d：手动 dpr 缩放。
        // 注意 H5 端必须保持单位矩阵：uni-h5 hidpi polyfill 会把 fillRect/arc/drawImage 等
        // 绘制坐标自动乘 pixelRatio（__hidpi__），再手动 scale 会叠加成 4x 导致内容溢出右下象限。
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // #endif
        render();
        // 贴图预加载一次；beads/decors 变化只重绘
        const urls = [...(props.beads || []).map(b => b.renderUrl || null), ...(props.decorRows ?? []).map(r0 => r0.renderUrl || null)];
        loadSprites(urls, imageLoader).then(map => {
            spriteMap.value = map;
            render();
        });
    });
});

watch(() => [props.beads, props.decors, props.decorRows, props.knotVisible], () => render(), { deep: true });
</script>
