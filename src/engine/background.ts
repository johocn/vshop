import { rgba } from './color'

/**
 * 陈列背景：深色木质底 + 中央柔光台 + 暗角。
 * 视觉基调遵循 Jewelry Atelier（深色木质陈列台）。
 */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  // 木质渐变底
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#221915')
  bg.addColorStop(0.55, '#1C1613')
  bg.addColorStop(1, '#15100D')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // 中央柔光陈列台
  const cx = width / 2
  const cy = height / 2
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.62)
  glow.addColorStop(0, rgba('#3A2C20', 0.55))
  glow.addColorStop(0.6, rgba('#241A13', 0.25))
  glow.addColorStop(1, rgba('#15100D', 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // 暗角
  const vig = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.3, cx, cy, Math.max(width, height) * 0.75)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, width, height)
}

/**
 * 1cm 比例尺：直观体现珠子真实大小。
 * @param pxPerMm 当前画布每毫米像素
 * @param x,y 起点
 */
export function paintScaleBar(
  ctx: CanvasRenderingContext2D,
  pxPerMm: number,
  x: number,
  y: number,
): void {
  const len = pxPerMm * 10 // 1cm
  ctx.save()
  ctx.strokeStyle = rgba('#E0B95F', 0.9)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + len, y)
  // 两端短竖
  ctx.moveTo(x, y - 6)
  ctx.lineTo(x, y + 6)
  ctx.moveTo(x + len, y - 6)
  ctx.lineTo(x + len, y + 6)
  ctx.stroke()
  ctx.fillStyle = rgba('#E0B95F', 0.95)
  ctx.font = '12px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('1cm', x + len / 2 - 12, y - 14)
  ctx.restore()
}
