<template>
    <canvas
        type="2d"
        :id="canvasId"
        :canvas-id="canvasId"
        :style="{ width: cssW + 'px', height: cssH + 'px' }"
    />
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref, watch } from 'vue';
import { drawRing, loadSprites } from '../utils/bead-render';
import type { RenderBead } from '../utils/bead-render';

export interface BeadRingBead {
    materialId: string;
    color: string;
    diameterMm: number;
    preset?: string | null;
    renderUrl?: string | null;
}

const props = withDefaults(defineProps<{
    canvasId: string;
    /** 画布宽（rpx） */
    width: number;
    /** 画布高（rpx） */
    height: number;
    beads: BeadRingBead[];
    /** mm → 逻辑 px 比例，默认 1.4（即 8mm 珠直径约 11px） */
    mmPerPx?: number;
}>(), {
    mmPerPx: 1.4,
});

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

function render() {
    if (!ctx) return;
    const w = cssW.value;
    const h = cssH.value;
    ctx.clearRect(0, 0, w, h);
    const beads = props.beads || [];
    if (beads.length === 0) return;
    const rs: RenderBead[] = beads.map(b => ({
        x: 0,
        y: 0,
        r: Math.max(1, b.diameterMm / props.mmPerPx / 2),
        color: b.color,
        preset: b.preset ?? null,
        sprite: (b.renderUrl && spriteMap.value.get(b.renderUrl)) || null,
        seed: hashSeed(b.materialId || b.color),
    }));
    const maxR = Math.max(...rs.map(rb => rb.r));
    drawRing(ctx, rs, w / 2, h / 2, Math.max(4, w / 2 - maxR - 2), Math.max(4, h / 2 - maxR - 2));
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
