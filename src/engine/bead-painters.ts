import type { RenderSpec } from '../types'
import { rgba, lighten, darken, mix } from './color'
import { mulberry32 } from '../utils/prng'

/**
 * 单颗珠子的分层绘制（自底向上）：接触阴影 → 主体径向渐变 → 内部透射亮核 →
 * 环境补光 → 纹理层（按材质）→ 边缘暗化 → 主/次高光 → 亮边。
 *
 * 完全平台无关：只依赖 CanvasRenderingContext2D 标准 2D API。
 * 该函数在精灵缓存里只调用一次，因此允许适当的绘制复杂度。
 *
 * 坐标以 r 为单位，所有偏移乘以 r，便于后续按像素半径缩放复用。
 */
export function paintBead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  spec: RenderSpec,
  seed: number,
): void {
  if (r <= 0) return
  const { baseColor, shadowColor, highlightColor, gloss, translucency, textureType, textureStrength, rimColor, envLightColor } = spec
  const rng = mulberry32(seed >>> 0)
  const TAU = Math.PI * 2

  ctx.save()

  // —— 接触阴影（珠子落下的软投影，画在珠体之下）——
  const shadowY = cy + r * 0.62
  const sg = ctx.createRadialGradient(cx, shadowY, r * 0.2, cx, shadowY, r * 1.15)
  sg.addColorStop(0, rgba(shadowColor, 0.32))
  sg.addColorStop(1, rgba(shadowColor, 0))
  ctx.fillStyle = sg
  ctx.beginPath()
  ctx.ellipse(cx, shadowY, r * 1.1, r * 0.5, 0, 0, TAU)
  ctx.fill()

  // —— 裁剪成圆形，约束后续纹理 ——
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.clip()

  // —— 主体径向渐变（光源统一在左上）——
  // 通透材质整体提亮、暗部向底色收敛，模拟透光
  const lx = cx - r * 0.4
  const ly = cy - r * 0.45
  const lift = 0.28 + translucency * 0.22
  const shadowMix = mix(baseColor, shadowColor, 0.5 + (1 - translucency) * 0.5)
  const body = ctx.createRadialGradient(lx, ly, r * 0.05, cx, cy, r * 1.02)
  body.addColorStop(0, lighten(baseColor, lift))
  body.addColorStop(0.45, baseColor)
  body.addColorStop(1, shadowMix)
  ctx.fillStyle = body
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)

  // —— 通透材质：体内透出的内部亮核（光穿过球体）——
  if (translucency > 0.3) {
    const core = ctx.createRadialGradient(cx + r * 0.15, cy + r * 0.2, 0, cx, cy, r * 0.92)
    core.addColorStop(0, rgba(mix(baseColor, highlightColor, 0.5), 0.5 * translucency))
    core.addColorStop(0.55, rgba(highlightColor, 0.14 * translucency))
    core.addColorStop(1, rgba(highlightColor, 0))
    ctx.fillStyle = core
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  }

  // —— 环境补光（右下方）——
  const env = ctx.createRadialGradient(cx + r * 0.5, cy + r * 0.55, r * 0.1, cx, cy, r * 1.05)
  env.addColorStop(0, rgba(envLightColor, 0.32))
  env.addColorStop(0.7, rgba(envLightColor, 0))
  ctx.fillStyle = env
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)

  // —— 纹理层（限制在珠体内）——
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  paintTexture(ctx, cx, cy, r, spec, rng)
  ctx.restore()

  // —— 边缘暗化 / 暗描边 ——
  const rim = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r)
  rim.addColorStop(0, rgba(rimColor, 0))
  rim.addColorStop(1, rgba(shadowColor, 0.55 + (1 - gloss) * 0.2))
  ctx.fillStyle = rim
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)

  // —— 高光（主 + 次），位置在光源侧 ——
  const hx = lx
  const hy = ly
  const hAlpha = 0.45 + gloss * 0.45
  // 主高光：小而锐
  const h1 = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.5)
  h1.addColorStop(0, rgba(highlightColor, hAlpha))
  h1.addColorStop(1, rgba(highlightColor, 0))
  ctx.fillStyle = h1
  ctx.beginPath()
  ctx.ellipse(hx, hy, r * 0.42, r * 0.34, -0.6, 0, TAU)
  ctx.fill()
  // 次级高光：更小、更靠边缘（玻璃/金属尤其明显）
  if (gloss > 0.5) {
    const sx = cx - r * 0.55
    const sy = cy - r * 0.6
    const h2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.2)
    h2.addColorStop(0, rgba(highlightColor, 0.6 * gloss))
    h2.addColorStop(1, rgba(highlightColor, 0))
    ctx.fillStyle = h2
    ctx.beginPath()
    ctx.ellipse(sx, sy, r * 0.16, r * 0.14, 0, 0, TAU)
    ctx.fill()
  }

  // —— 亮边（顶部高光弧，金属/玻璃更明显）——
  if (gloss > 0.45) {
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.94, Math.PI * 1.15, Math.PI * 1.7)
    ctx.lineWidth = r * 0.08
    ctx.strokeStyle = rgba(highlightColor, 0.35 + gloss * 0.3)
    ctx.stroke()
  }

  ctx.restore()
}

function paintTexture(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  spec: RenderSpec,
  rng: () => number,
): void {
  const { textureType, textureStrength, baseColor, shadowColor, accentColor, highlightColor, translucency } = spec
  if (textureStrength <= 0.01) return
  const rot = rng() * Math.PI * 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.translate(-cx, -cy)

  switch (textureType) {
    case 'agate': {
      // 缠丝 / 絮状条带：有机摆动的同心带（非完美椭圆），更贴近真实玛瑙
      const bands = 5 + Math.floor(rng() * 4)
      const wobN = 2 + Math.floor(rng() * 2)
      for (let i = 1; i <= bands; i += 1) {
        const rad = r * (0.12 + (i / bands) * 0.86)
        const off = (rng() - 0.5) * r * 0.5
        const phase = rng() * Math.PI * 2
        const steps = 28
        ctx.beginPath()
        for (let s = 0; s <= steps; s += 1) {
          const a = (s / steps) * Math.PI * 2
          const wob = 1 + Math.sin(a * wobN + phase) * 0.07
          const px = cx + off + Math.cos(a) * rad * wob
          const py = cy + Math.sin(a) * rad * (0.78 + rng() * 0.04) * wob
          if (s === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.lineWidth = r * (0.03 + rng() * 0.05)
        ctx.strokeStyle = rgba(i % 2 === 0 ? shadowColor : accentColor ?? darken(baseColor, 0.18), 0.22 * textureStrength)
        ctx.stroke()
      }
      break
    }
    case 'crystalClear': {
      // 折射亮弧 + 底部聚光焦散 + 边缘折射亮环
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i += 1) {
        const rr = r * (0.35 + rng() * 0.55)
        ctx.beginPath()
        ctx.arc(cx, cy, rr, rng() * Math.PI, rng() * Math.PI + Math.PI)
        ctx.lineWidth = r * (0.03 + rng() * 0.03)
        ctx.strokeStyle = rgba(highlightColor, 0.35 * textureStrength)
        ctx.stroke()
      }
      const caustic = ctx.createRadialGradient(cx + r * 0.25, cy + r * 0.35, 0, cx + r * 0.25, cy + r * 0.35, r * 0.6)
      caustic.addColorStop(0, rgba(highlightColor, 0.4 * textureStrength))
      caustic.addColorStop(1, rgba(highlightColor, 0))
      ctx.fillStyle = caustic
      ctx.beginPath()
      ctx.arc(cx + r * 0.25, cy + r * 0.35, r * 0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-atop'
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2)
      ctx.lineWidth = r * 0.06
      ctx.strokeStyle = rgba(highlightColor, 0.18 * textureStrength)
      ctx.stroke()
      break
    }
    case 'woodGrain': {
      // 同心年轮 + 贯通木纹 + 鬼脸节疤
      const rings = 5 + Math.floor(rng() * 6)
      for (let i = 1; i <= rings; i += 1) {
        const rad = (i / rings) * r * 0.95
        ctx.beginPath()
        ctx.arc(cx, cy, rad, 0, Math.PI * 2)
        ctx.lineWidth = r * 0.018
        ctx.strokeStyle = rgba(shadowColor, 0.22 * textureStrength)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(cx - r, cy + (rng() - 0.5) * r * 0.4)
      ctx.quadraticCurveTo(cx, cy + (rng() - 0.5) * r, cx + r, cy + (rng() - 0.5) * r * 0.4)
      ctx.lineWidth = r * 0.03
      ctx.strokeStyle = rgba(shadowColor, 0.18 * textureStrength)
      ctx.stroke()
      const knots = Math.floor(rng() * 2)
      for (let k = 0; k < knots; k += 1) {
        const kx = cx + (rng() - 0.5) * r * 1.1
        const ky = cy + (rng() - 0.5) * r * 1.1
        const kr = r * (0.12 + rng() * 0.1)
        ctx.beginPath()
        ctx.ellipse(kx, ky, kr, kr * 0.7, rng() * Math.PI, 0, Math.PI * 2)
        ctx.fillStyle = rgba(darken(baseColor, 0.35), 0.4 * textureStrength)
        ctx.fill()
      }
      break
    }
    case 'metalBrushed': {
      // 镜面反射柱 + 拉丝 + 各向异性高光条
      const lin = ctx.createLinearGradient(cx - r, cy, cx + r, cy)
      lin.addColorStop(0, rgba(shadowColor, 0.85))
      lin.addColorStop(0.25, rgba(highlightColor, 0.9))
      lin.addColorStop(0.5, rgba(shadowColor, 0.7))
      lin.addColorStop(0.75, rgba(highlightColor, 0.95))
      lin.addColorStop(1, rgba(shadowColor, 0.85))
      ctx.fillStyle = lin
      ctx.globalAlpha = 0.5 * textureStrength + 0.2
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      ctx.globalAlpha = 1
      for (let i = 0; i < 16; i += 1) {
        const x = cx - r + rng() * r * 2
        ctx.beginPath()
        ctx.moveTo(x, cy - r)
        ctx.lineTo(x, cy + r)
        ctx.lineWidth = r * 0.012
        ctx.strokeStyle = rgba(highlightColor, 0.06 * textureStrength)
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'lighter'
      const streak = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
      streak.addColorStop(0, rgba(highlightColor, 0))
      streak.addColorStop(0.42, rgba(highlightColor, 0))
      streak.addColorStop(0.5, rgba(highlightColor, 0.55 * textureStrength + 0.2))
      streak.addColorStop(0.58, rgba(highlightColor, 0))
      streak.addColorStop(1, rgba(highlightColor, 0))
      ctx.fillStyle = streak
      ctx.fillRect(cx - r * 0.35, cy - r, r * 0.7, r * 2)
      break
    }
    case 'pearlNacre': {
      // 结构化虹彩：贴近边缘的定向 orient 晕（沿球体弧面），模拟珍珠晕彩
      ctx.globalCompositeOperation = 'screen'
      const tints = [accentColor ?? '#C9D8FF', '#FFE0E8', '#DFFFE0', '#FFF0C0', '#E6D8FF']
      const rings = 3 + Math.floor(rng() * 2)
      for (let i = 0; i < rings; i += 1) {
        const rad = r * (0.55 + i * 0.14)
        const g = ctx.createRadialGradient(cx, cy, rad - r * 0.12, cx, cy, rad)
        g.addColorStop(0, rgba(tints[i % tints.length], 0))
        g.addColorStop(0.7, rgba(tints[i % tints.length], 0.16 * textureStrength))
        g.addColorStop(1, rgba(tints[i % tints.length], 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, rad, 0, Math.PI * 2)
        ctx.fill()
      }
      const blob = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.1, 0, cx - r * 0.2, cy - r * 0.1, r * 0.7)
      blob.addColorStop(0, rgba(tints[1], 0.2 * textureStrength))
      blob.addColorStop(1, rgba(tints[1], 0))
      ctx.fillStyle = blob
      ctx.beginPath()
      ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.7, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'tigerEye': {
      // 猫眼亮带：贯穿直径，带方向
      const ang = rng() * Math.PI
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(ang)
      const band = ctx.createLinearGradient(-r, 0, r, 0)
      band.addColorStop(0, rgba(shadowColor, 0))
      band.addColorStop(0.45, rgba(accentColor ?? highlightColor, 0.5 * textureStrength))
      band.addColorStop(0.5, rgba(highlightColor, 0.75 * textureStrength))
      band.addColorStop(0.55, rgba(accentColor ?? highlightColor, 0.5 * textureStrength))
      band.addColorStop(1, rgba(shadowColor, 0))
      ctx.fillStyle = band
      ctx.fillRect(-r, -r * 0.5, r * 2, r)
      // 暗带
      ctx.fillStyle = rgba(shadowColor, 0.22 * textureStrength)
      ctx.fillRect(-r, -r, r * 2, r * 0.18)
      ctx.restore()
      break
    }
    case 'amberSwirl': {
      // 流纹 + 气泡 + 边缘暖光透射
      ctx.globalCompositeOperation = 'source-atop'
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath()
        ctx.moveTo(cx - r, cy + (rng() - 0.5) * r)
        ctx.bezierCurveTo(
          cx - r * 0.3, cy + (rng() - 0.5) * r,
          cx + r * 0.3, cy + (rng() - 0.5) * r,
          cx + r, cy + (rng() - 0.5) * r,
        )
        ctx.lineWidth = r * (0.06 + rng() * 0.08)
        ctx.strokeStyle = rgba(accentColor ?? highlightColor, 0.28 * textureStrength)
        ctx.stroke()
      }
      for (let i = 0; i < 4; i += 1) {
        const bx = cx + (rng() - 0.5) * r * 1.4
        const by = cy + (rng() - 0.5) * r * 1.4
        const br = r * (0.06 + rng() * 0.1)
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br)
        g.addColorStop(0, rgba(highlightColor, 0.6))
        g.addColorStop(1, rgba(highlightColor, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fill()
      }
      if (translucency > 0.3) {
        ctx.globalCompositeOperation = 'lighter'
        const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r)
        glow.addColorStop(0, rgba(accentColor ?? highlightColor, 0))
        glow.addColorStop(1, rgba(accentColor ?? highlightColor, 0.25 * translucency))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'star':
    case 'solid':
    default:
      // 纯色 / 碎石：轻微内部明暗噪点
      for (let i = 0; i < 6; i += 1) {
        const bx = cx + (rng() - 0.5) * r
        const by = cy + (rng() - 0.5) * r
        ctx.fillStyle = rgba(mix(baseColor, shadowColor, rng()), 0.12 * textureStrength)
        ctx.beginPath()
        ctx.arc(bx, by, r * (0.05 + rng() * 0.1), 0, Math.PI * 2)
        ctx.fill()
      }
      break
  }

  ctx.restore()
}

/**
 * 连接处衔接绘制：在相邻单元中点绘制不同衔接形态的微小 motif，使画面过渡自然。
 * 纯装饰，不影响算量。sizePx 为该处间隙的像素尺度参考。
 */
export function paintJoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sizePx: number,
  joint: 'direct' | 'spacer' | 'ring' | 'knot' | 'crimp',
  seed: number,
): void {
  const r = Math.max(1.5, sizePx * 0.5)
  const rng = mulberry32(seed >>> 0)
  ctx.save()
  switch (joint) {
    case 'spacer': {
      // 隔圈：薄扁垫圈
      ctx.fillStyle = 'rgba(40,32,26,0.85)'
      ctx.beginPath()
      ctx.ellipse(x, y, r * 1.1, r * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(120,96,72,0.5)'
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.6, r * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'ring': {
      // 连接环：金属小环
      ctx.lineWidth = Math.max(1, r * 0.4)
      ctx.strokeStyle = `rgba(224,185,95,${0.8 + rng() * 0.2})`
      ctx.beginPath()
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'knot': {
      // 绳结：两道交叉深色弧
      ctx.lineWidth = Math.max(1, r * 0.5)
      ctx.strokeStyle = 'rgba(110,74,48,0.9)'
      ctx.beginPath()
      ctx.arc(x - r * 0.4, y, r * 0.7, Math.PI * 0.2, Math.PI * 1.2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x + r * 0.4, y, r * 0.7, Math.PI * 1.2, Math.PI * 0.3)
      ctx.stroke()
      break
    }
    case 'crimp': {
      // 定位珠：小金属管
      ctx.fillStyle = 'rgba(200,204,208,0.9)'
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.7, r * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'direct':
    default:
      break
  }
  ctx.restore()
}

/**
 * 扣具绘制：在闭合处绘制更具辨识度的扣形（磁吸/弹簧/绳结），区别于普通珠子。
 * 传入该扣的渲染规格与像素半径。
 */
export function paintClasp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  spec: RenderSpec,
): void {
  if (r <= 0) return
  const { textureType } = spec
  // 复用珠子主体绘制作为底
  paintBead(ctx, cx, cy, r, spec, 7)
  // 叠绘扣具识别标记
  ctx.save()
  if (textureType === 'solid') {
    // 绳结扣：交叉编绳纹
    ctx.strokeStyle = 'rgba(110,74,48,0.85)'
    ctx.lineWidth = Math.max(1, r * 0.22)
    ctx.beginPath()
    ctx.arc(cx - r * 0.35, cy, r * 0.5, Math.PI * 0.2, Math.PI * 1.3)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx + r * 0.35, cy, r * 0.5, Math.PI * 1.2, Math.PI * 0.3)
    ctx.stroke()
  } else {
    // 金属扣：外圈高光描边
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = Math.max(1, r * 0.12)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}
