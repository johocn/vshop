/** 几何辅助：椭圆排布与点位计算（平台无关） */

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export interface Point {
  x: number
  y: number
}

/** 椭圆上一点（angle 为弧度，0 在右侧） */
export function ellipsePoint(cx: number, cy: number, rx: number, ry: number, angle: number): Point {
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
  }
}

/**
 * 深度：以椭圆中心为基准，正值表示在观察者前方（应后绘 / 更靠前）。
 * 取值范围约 [-1, 1]，用画家算法排序时越大约靠前。
 */
export function depthFromEllipse(cx: number, cy: number, ry: number, y: number): number {
  if (ry === 0) return 0
  return clamp((y - cy) / ry, -1, 1)
}

/** 短长轴比：由 viewTilt(0..1) 决定，0=正圆顶视，1=最扁侧视 */
export function tiltToRatio(viewTilt: number): number {
  // 0.55 ~ 0.78 的透视压扁区间
  return clamp(0.78 - viewTilt * (0.78 - 0.55), 0.5, 0.85)
}

/** 把珠子的中心角按旋转量平移（用于整体旋转手串） */
export function rotateAngle(angle: number, rotation: number): number {
  return angle + rotation
}

/** 两点距离 */
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
