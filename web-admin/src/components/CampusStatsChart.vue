<template>
  <view class="csc">
    <view class="csc-legend">
      <view class="lg"><view class="dot bar" /><text>{{ $t('campusStats.trend.legendOrders') }}</text></view>
      <view class="lg"><view class="dot line" /><text>{{ $t('campusStats.trend.legendOnTime') }}</text></view>
    </view>
    <canvas :id="canvasId" class="csc-canvas" :style="{ height: heightRpx + 'rpx' }" />
  </view>
</template>

<script lang="ts" setup>
// 轻量柱线组合：柱=单量（左轴）、线=准点率%（右轴）。H5 专用（DOM canvas），不引第三方库。
// canvas 手法与 TrendChart 一致：CSS px 作图、uni hidpi 包装勿再乘 dpr（D25 教训）。
import { onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{
  canvasId: string;
  points: Array<{ date: string; orders: number; onTimeRate: number }>;
}>();
const heightRpx = 340;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

const BAR = '#ff6600';
const LINE = '#2563eb';

function draw() {
  if (!canvas || !ctx) return;
  const pts = props.points || [];
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  if (!W || !H) return;
  const wantW = Math.round(W * dpr), wantH = Math.round(H * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }
  ctx.clearRect(0, 0, W, H);

  const padL = 34, padR = 34, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  if (!pts.length) {
    ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
    ctx.fillText('—', W / 2 - 6, H / 2);
    return;
  }

  const maxOrders = Math.max(...pts.map((p) => p.orders), 1);
  const slot = plotW / pts.length;
  const barW = Math.max(3, Math.min(18, slot * 0.44));
  const bx = (i: number) => padL + slot * i + slot / 2;
  const yOrders = (v: number) => padT + plotH - (plotH * v) / maxOrders;
  const yRate = (v: number) => padT + plotH - (plotH * v) / 100;

  // 柱（单量）
  pts.forEach((p, i) => {
    const h = padT + plotH - yOrders(p.orders);
    if (h > 0.5) {
      ctx!.fillStyle = BAR;
      ctx!.fillRect(bx(i) - barW / 2, yOrders(p.orders), barW, h);
    }
  });

  // 线（准点率，0 值不画点：无计分单 ≠ 0%）
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath();
  let started = false;
  const linePts: Array<[number, number]> = [];
  pts.forEach((p, i) => {
    if (p.onTimeRate <= 0) return;
    linePts.push([bx(i), yRate(p.onTimeRate)]);
  });
  linePts.forEach(([px, py], idx) => {
    if (!started) { ctx!.moveTo(px, py); started = true; } else ctx!.lineTo(px, py);
  });
  if (started) ctx.stroke();
  ctx.fillStyle = LINE;
  linePts.forEach(([px, py]) => { ctx!.beginPath(); ctx!.arc(px, py, 2.5, 0, Math.PI * 2); ctx!.fill(); });

  ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
  ctx.fillText(String(maxOrders), 2, padT + 10);
  ctx.fillText('0', 2, H - padB + 4);
  ctx.fillText('100%', W - padR + 2, padT + 10);
  pts.forEach((p, i) => {
    if (pts.length > 8 && i % 2 === 1) return;
    ctx!.fillText(p.date, bx(i) - 13, H - 6);
  });
}

function resize() { draw(); }

onMounted(() => {
  const root = document.getElementById(props.canvasId) as HTMLCanvasElement | null;
  canvas = (root?.querySelector('canvas') || root) as HTMLCanvasElement | null;
  ctx = canvas?.getContext('2d') || null;
  draw();
  window.addEventListener('resize', resize);
});
onUnmounted(() => { window.removeEventListener('resize', resize); });
watch(() => props.points, draw, { deep: true });
</script>

<style lang="scss" scoped>
.csc { width: 100%;
  .csc-legend { display: flex; gap: 28rpx; margin-bottom: 8rpx;
    .lg { display: flex; align-items: center; gap: 8rpx; font-size: 22rpx; color: #666;
      .dot { width: 18rpx; height: 12rpx; border-radius: 4rpx;
        &.bar { background: #ff6600; }
        &.line { background: #2563eb; height: 4rpx; border-radius: 2rpx; } } } }
  .csc-canvas { width: 100%; display: block; }
}
</style>
