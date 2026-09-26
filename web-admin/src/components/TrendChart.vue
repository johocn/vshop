<template>
  <view class="tc">
    <canvas id="trendChart" class="tc-canvas" :style="{ height: heightRpx + 'rpx' }" />
  </view>
</template>

<script lang="ts" setup>
// 轻量双线折线：左轴销售额（¥）、右轴订单数（单）。H5 专用（DOM canvas），不引第三方库。
import { onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{ points: Array<{ date: string; gmv: number; orderCount: number }> }>();
const heightRpx = 360;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function fmtW(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
  return String(Math.round(v));
}

function draw() {
  if (!canvas || !ctx) return;
  const pts = props.points || [];
  const dpr = window.devicePixelRatio || 1;
  // 尺寸取 offsetWidth/offsetHeight（整数 CSS px），与 uni 包装缓冲的换算同源；
  // getBoundingClientRect() 返回的是亚像素值，会和 uni 取整后的缓冲尺寸差 1px 反复互踩。
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  if (!W || !H) return;
  const wantW = Math.round(W * dpr), wantH = Math.round(H * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH; // 改 width/height 会顺带把变换矩阵重置为单位阵
  }
  ctx.clearRect(0, 0, W, H);

  const padL = 46, padR = 46, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  // 网格
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  if (!pts.length) {
    ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
    ctx.fillText('暂无数据', W / 2 - 28, H / 2);
    return;
  }

  const maxGmv = Math.max(...pts.map((p) => p.gmv), 1);
  const maxCnt = Math.max(...pts.map((p) => p.orderCount), 1);
  const x = (i: number) => padL + (pts.length === 1 ? plotW / 2 : (plotW * i) / (pts.length - 1));
  const yG = (v: number) => padT + plotH - (plotH * v) / maxGmv;
  const yC = (v: number) => padT + plotH - (plotH * v) / maxCnt;

  const poly = (getY: (i: number, p: any) => number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((p, i) => {
      const px = x(i), py = getY(i, p);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(x(i), getY(i, p), 2.5, 0, Math.PI * 2); ctx.fill(); });
  };
  poly((i, p) => yG(p.gmv), '#ff6600');
  poly((i, p) => yC(p.orderCount), '#2563eb');

  ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
  // gmv 单位为分，轴标签转元显示（曲线比例不受影响）
  ctx.fillText('¥' + fmtW(maxGmv / 100), 2, padT + 10);
  ctx.fillText('0', 2, H - padB + 4);
  ctx.fillText(String(maxCnt), W - padR + 2, padT + 10);
  pts.forEach((p, i) => {
    if (pts.length > 7 && i % 2 === 1) return;
    ctx.fillText(p.date.slice(5), x(i) - 14, H - 6);
  });
  // 图例
  ctx.fillStyle = '#ff6600'; ctx.fillRect(padL, 2, 12, 8);
  ctx.fillStyle = '#2563eb'; ctx.fillRect(padL + 64, 2, 12, 8);
  ctx.fillStyle = '#666'; ctx.font = '10px sans-serif';
  ctx.fillText('销售额', padL + 15, 10);
  ctx.fillText('订单数', padL + 79, 10);
}

function resize() { draw(); }

onMounted(() => {
  // uni-app H5 将 <canvas> 编译为 <uni-canvas> 外层组件，真正的画布是内层 <canvas class="uni-canvas-canvas">。
  // 内层画布由 uni 的 hidpi 包装器接管：缓冲尺寸 = 元素尺寸 × dpr，并在 2d 上下文上打 __hidpi__ 标记，
  // 再由它打补丁过的原型方法把「CSS px 坐标」自动乘以 dpr 写进缓冲。
  // 因此这里只能按 CSS px 作图，绝不能再 ctx.setTransform(dpr, …) —— 坐标会被乘两次（dpr²），
  // 整幅图右下偏移、超出画布右/下边缘而被裁切（D25 缺陷根因）。
  const root = document.getElementById('trendChart') as HTMLCanvasElement | null;
  canvas = (root?.querySelector('canvas') || root) as HTMLCanvasElement | null;
  ctx = canvas?.getContext('2d') || null;
  draw();
  window.addEventListener('resize', resize);
});
onUnmounted(() => { window.removeEventListener('resize', resize); });
watch(() => props.points, draw, { deep: true });
</script>

<style lang="scss" scoped>
.tc { width: 100%;
  .tc-canvas { width: 100%; display: block; }
}
</style>
