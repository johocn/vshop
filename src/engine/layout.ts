import type { BeadSlot, LayoutMode } from '../types'
import { rngFromSeed } from '../utils/prng'
import { clamp } from '../utils/geo'

export interface LayoutInput {
  mainMaterialId: string
  secondaryMaterialId?: string
  layoutMode: LayoutMode
  /** 主珠 + 焦点主珠总数（由算量得出） */
  count: number
  seed: number
  focalId?: string
  /** 焦点主珠沿圈位置 0..1（默认 0.5 顶部居中） */
  focalPosition?: number
  focalCount?: number
}

/**
 * 由排布模式生成主序列（含焦点主珠替换）。
 * 隔片（spacer）不进入本序列，由渲染层在相邻珠子间视觉插入。
 * 纯函数 + 确定性：同一输入永远得到同一序列。
 */
export function buildSlots(input: LayoutInput): BeadSlot[] {
  const count = Math.max(1, Math.floor(input.count))
  const secondary = input.secondaryMaterialId
  const seedStr = [
    input.layoutMode,
    input.seed,
    count,
    input.mainMaterialId,
    secondary ?? '-',
    input.focalId ?? '-',
  ].join(':')
  const rng = rngFromSeed(seedStr)

  const materialAt = (i: number): string => {
    switch (input.layoutMode) {
      case 'solid':
        return input.mainMaterialId
      case 'ab':
        return i % 2 === 0 ? input.mainMaterialId : secondary ?? input.mainMaterialId
      case 'random':
        return rng() < 0.5 ? input.mainMaterialId : secondary ?? input.mainMaterialId
      case 'gradient': {
        // 对称渐变：以中轴为界，越靠两端越倾向次珠（确定性概率混合）
        if (!secondary) return input.mainMaterialId
        const t = count > 1 ? Math.abs(i / (count - 1) - 0.5) * 2 : 0 // 0(中) .. 1(两端)
        return rng() < t ? secondary : input.mainMaterialId
      }
      case 'focal':
      default:
        return input.mainMaterialId
    }
  }

  const focalCount = clamp(input.focalCount ?? 0, 0, Math.floor(count / 2))
  const focalPosition = input.focalPosition ?? 0.5
  const focalIndex = Math.round(clamp(focalPosition, 0, 1) * (count - 1))

  const slots: BeadSlot[] = []
  let focalPlaced = 0
  for (let i = 0; i < count; i += 1) {
    let role: BeadSlot['role'] = 'main'
    let materialId = materialAt(i)
    if (input.focalId && focalPlaced < focalCount && i === focalIndex) {
      materialId = input.focalId
      role = 'focal'
      focalPlaced += 1
    }
    slots.push({
      index: i,
      materialId,
      beadLength: 0,
      beadDiameter: 0,
      unitPrice: 0,
      role,
    })
  }
  return slots
}
