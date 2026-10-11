import type { BraceletCalc } from './calc'
import type { BeadSlot, SequenceItem, RenderSpec, JointMode, SequenceKind } from '../types'
import { ellipsePoint, tiltToRatio } from '../utils/geo'
import { paintBackground, paintScaleBar } from './background'
import { SpriteCache, CanvasFactory } from './sprite-cache'
import { paintBead, paintJoint, paintClasp } from './bead-painters'
import { xmur3 } from '../utils/prng'

interface RenderItem {
  index: number
  refId: string
  beadDiameter: number
  kind?: SequenceKind
  joint?: JointMode
}

export interface RenderInput {
  /** 新：完整装配序列（优先） */
  sequence?: SequenceItem[]
  /** 旧：仅珠子序列（兼容） */
  slots?: BeadSlot[]
  lookup: (id: string) => { beadDiameter: number; renderSpec: RenderSpec } | undefined
  spec: {
    viewTilt: number
    rotation: number
    gap: number
    spacerEnabled?: boolean
    spacerId?: string
    spacerEvery?: number
  }
  calc: BraceletCalc
  background?: boolean
  showScale?: boolean
  factory?: CanvasFactory
  /** 跨重绘持久化的精灵缓存（优先于 factory，避免每帧重建） */
  spriteCache?: SpriteCache
}

export interface RenderBeadGeom {
  index: number
  x: number
  y: number
  radiusPx: number
  refId: string
  kind?: SequenceKind
  joint?: JointMode
}

export interface RenderGeometry {
  beads: RenderBeadGeom[]
  cx: number
  cy: number
  rx: number
  ry: number
  pxPerMm: number
}

const TAU = Math.PI * 2

/** 计算每颗珠子的画布几何（未排序；按 index 顺序，便于连线与命中检测） */
export function computeRenderGeometry(
  width: number,
  height: number,
  items: RenderItem[],
  lookup: (id: string) => { beadDiameter: number; renderSpec: RenderSpec } | undefined,
  spec: RenderInput['spec'],
  calc: BraceletCalc,
): RenderGeometry {
  const N = Math.max(1, items.length)
  const L = calc.outerCircumferenceMm
  const R = L / (2 * Math.PI)
  const shortSide = Math.min(width, height)
  const rx = shortSide * 0.4
  const pxPerMm = rx / R
  const ry = rx * tiltToRatio(spec.viewTilt)
  const cx = width / 2
  const cy = height * 0.5

  const beads: RenderBeadGeom[] = items.map((s, i) => {
    const angle = (i / N) * TAU + spec.rotation
    const p = ellipsePoint(cx, cy, rx, ry, angle)
    const dMm = s.beadDiameter > 0 ? s.beadDiameter : lookup(s.refId)?.beadDiameter ?? 8
    return {
      index: i,
      x: p.x,
      y: p.y,
      radiusPx: (dMm * pxPerMm) / 2 * 0.9,
      refId: s.refId,
      kind: s.kind,
      joint: s.joint,
    }
  })

  return { beads, cx, cy, rx, ry, pxPerMm }
}

function toRenderItems(input: RenderInput): RenderItem[] {
  const arr = (input.sequence ?? input.slots ?? []) as Array<Partial<RenderItem> & { materialId?: string }>
  return arr.map((s, i) => ({
    index: s.index ?? i,
    refId: s.refId ?? s.materialId ?? '',
    beadDiameter: s.beadDiameter ?? 0,
    kind: s.kind,
    joint: s.joint,
  }))
}

export function renderBracelet(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: RenderInput,
): RenderGeometry {
  const items = toRenderItems(input)
  const geom = computeRenderGeometry(width, height, items, input.lookup, input.spec, input.calc)
  const { beads, cx, cy, rx, ry, pxPerMm } = geom

  if (input.background !== false) {
    paintBackground(ctx, width, height)
  }

  // —— 线绳：相邻珠子之间的可见绳段（在珠体之下绘制）——
  const ropeW = Math.max(1, input.spec.gap * pxPerMm * 0.7)
  ctx.save()
  ctx.strokeStyle = 'rgba(110, 82, 54, 0.85)'
  ctx.lineWidth = ropeW
  ctx.lineCap = 'round'
  for (let i = 0; i < beads.length; i += 1) {
    const a = beads[i]
    const b = beads[(i + 1) % beads.length]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()

  // —— 连接处衔接 motif（仅序列模式；旧 slots 模式保留隔片逻辑）——
  if (input.sequence) {
    const gapPx = input.spec.gap * pxPerMm
    for (let i = 0; i < beads.length; i += 1) {
      const next = beads[(i + 1) % beads.length]
      const joint = (next.joint ?? 'direct') as JointMode
      if (joint === 'direct') continue
      const a = beads[i]
      const b = next
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      paintJoint(ctx, mx, my, gapPx, joint, xmur3(`${joint}:${i}`))
    }
  } else if (input.spec.spacerEnabled && input.spec.spacerId) {
    const sp = input.lookup(input.spec.spacerId)
    const every = input.spec.spacerEvery ?? 3
    if (sp) {
      const spD = (sp.beadDiameter * pxPerMm) / 2
      for (let i = 0; i < beads.length; i += 1) {
        if (i % every !== every - 1) continue
        const a = beads[i]
        const b = beads[(i + 1) % beads.length]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        paintBead(ctx, mx, my, spD * 0.7, sp.renderSpec, xmur3(`${input.spec.spacerId}:${i}`))
      }
    }
  }

  // —— 珠子 / 扣：按 y 排序（远→近）做画家算法遮挡 ——
  const drawOrder = [...beads].sort((p, q) => p.y - q.y)
  const cache = input.spriteCache ?? (input.factory ? new SpriteCache(input.factory) : null)

  for (const b of drawOrder) {
    const m = input.lookup(b.refId)
    if (!m) continue
    const seed = xmur3(`${b.refId}:${b.index}`)
    const seedBucket = seed % 12
    if (b.kind === 'clasp') {
      paintClasp(ctx, b.x, b.y, b.radiusPx, m.renderSpec)
      continue
    }
    if (cache) {
      const key = `${b.refId}:${Math.round(b.radiusPx)}:${seedBucket}`
      const sprite = cache.get(key, b.radiusPx, m.renderSpec, seed)
      ctx.drawImage(sprite as unknown as CanvasImageSource, b.x - sprite.width / 2, b.y - sprite.height / 2)
    } else {
      paintBead(ctx, b.x, b.y, b.radiusPx, m.renderSpec, seed)
    }
  }

  if (input.showScale) {
    paintScaleBar(ctx, pxPerMm, width * 0.08, height * 0.92)
  }

  return geom
}
