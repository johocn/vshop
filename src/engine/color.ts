/** 颜色工具：hex 与透明度、混合、明度调整（不依赖任何平台） */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(h, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)))
}

/** 两个 hex 颜色按 t(0..1) 线性插值 */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const r = clamp255(ar + (br - ar) * t)
  const g = clamp255(ag + (bg - ag) * t)
  const bl = clamp255(ab + (bb - ab) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

/** 提亮（amt>0 变亮，amt<0 变暗），amt 范围约 -1..1 */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const target = amt >= 0 ? 255 : 0
  const t = Math.abs(amt)
  return mix(hex, `#${target.toString(16).padStart(6, '0')}`, t)
}

export function lighten(hex: string, amt: number): string {
  return shade(hex, amt)
}

export function darken(hex: string, amt: number): string {
  return shade(hex, -amt)
}
