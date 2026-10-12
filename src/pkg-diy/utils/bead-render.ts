// 渲染三级回退：sprite 贴图 → preset 多层合成 → 纯色
export interface RenderPreset {
  base: string;            // 底色（无贴图时兜底）
  sheen: number;           // 透光/润透层 alpha（0=无）
  highlight: number;       // 高光强度 0~1
  bubbles: boolean;        // 气泡纹理（琉璃）
  inclusions: boolean;     // 棉点/飘花（玉、蜜蜡流淌纹）
  doubleHighlight?: boolean; // 金属双高光
}
export const PRESETS: Record<string, RenderPreset> = {
  glass:         { base: '#2E6BC4', sheen: 0.14, highlight: 0.9,  bubbles: true,  inclusions: false },
  jade:          { base: '#8FAE92', sheen: 0.10, highlight: 0.55, bubbles: false, inclusions: true },
  'jade-flower': { base: '#3E8E62', sheen: 0.13, highlight: 0.65, bubbles: false, inclusions: true },
  amber:         { base: '#DBA85B', sheen: 0,    highlight: 0.5,  bubbles: false, inclusions: true },
  pearl:         { base: '#EDE4E0', sheen: 0.14, highlight: 0.9,  bubbles: false, inclusions: false },
  metal:         { base: '#C8A23A', sheen: 0,    highlight: 1.0,  bubbles: false, inclusions: false, doubleHighlight: true },
  wood:          { base: '#6B4A32', sheen: 0,    highlight: 0.3,  bubbles: false, inclusions: false },
  matte:         { base: '#B5451F', sheen: 0,    highlight: 0.75, bubbles: false, inclusions: false },
};

export interface RenderBead {
  x: number; y: number; r: number;  // 圆心与半径 px
  color: string;                    // 素材主色（无 preset 无贴图时兜底）
  preset?: string | null;
  sprite?: HTMLImageElement | null;
  seed?: number;                    // 纹理随机种子（稳定渲染不跳动）
}

/** 确定性伪随机（棉点/气泡位置稳定） */
function rnd(seed: number) { let s = seed || 1; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function drawBead(ctx: CanvasRenderingContext2D, b: RenderBead) {
  const { x, y, r } = b;
  if (b.sprite) { ctx.drawImage(b.sprite, x - r, y - r, r * 2, r * 2); return; }
  const p = PRESETS[b.preset ?? ''] ?? null;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = p ? p.base : b.color;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (p) {
    if (p.sheen > 0) { ctx.fillStyle = `rgba(255,255,255,${p.sheen})`; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.75, 0, Math.PI * 2); ctx.fill(); }
    if (p.inclusions || p.bubbles) {
      const rng = rnd(b.seed ?? 7);
      const n = p.bubbles ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, d = rng() * r * 0.6;
        ctx.fillStyle = `rgba(255,255,255,${p.bubbles ? 0.5 : 0.35})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.04 + rng() * 0.05), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = `rgba(255,255,255,${p.highlight * 0.85})`;
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.3, r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill();
    if (p.doubleHighlight) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.35, r * 0.14, 0, Math.PI * 2); ctx.fill(); }
    // 底部径向阴影增强立体
    const grad = ctx.createRadialGradient(x, y + r * 0.4, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grad; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

export function drawRing(ctx: CanvasRenderingContext2D, beads: RenderBead[], cx: number, cy: number, rx: number, ry: number, rotation = -Math.PI / 2) {
  const n = beads.length;
  beads.forEach((b, i) => {
    const a = rotation + (Math.PI * 2 * i) / n;
    b.x = cx + rx * Math.cos(a); b.y = cy + ry * Math.sin(a);
    drawBead(ctx, b);
  });
}

/** sprite 预加载；loader 由调用方注入（H5 用 Image，小程序首期直接 reject 走 preset 层） */
export function loadSprites(urls: (string | null)[], loader: (src: string) => Promise<HTMLImageElement>): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  return Promise.all(urls.filter((u): u is string => !!u).map(async u => {
    try { map.set(u, await loader(u)); } catch { /* 贴图失败静默降级 preset 层 */ }
  })).then(() => map);
}
