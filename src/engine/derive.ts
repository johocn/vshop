import type { BraceletSpec, BeadMaterial, BeadSlot, BraceletBOM } from '../types'
import { computeBracelet, BraceletCalc } from './calc'
import { buildSlots } from './layout'
import { toBraceletBOM } from './bom'

export interface DerivedBracelet {
  calc: BraceletCalc
  slots: BeadSlot[]
  bom: BraceletBOM
  lookup: (id: string) => BeadMaterial | undefined
  mainMaterial?: BeadMaterial
}

/** 由方案 + 材质库派生出算量、排布与清单（供设计器 / 清单 / 导出页复用） */
export function deriveBracelet(spec: BraceletSpec, materials: BeadMaterial[]): DerivedBracelet {
  const lookup = (id: string): BeadMaterial | undefined => materials.find((m) => m.id === id)
  const mainMaterial = lookup(spec.mainMaterialId)
  const calc = computeBracelet(spec, materials)
  const slots = buildSlots({
    mainMaterialId: spec.mainMaterialId,
    secondaryMaterialId: spec.secondaryMaterialId,
    layoutMode: spec.layoutMode,
    count: calc.count,
    seed: spec.seed,
    focalId: spec.focalId,
    focalPosition: spec.focalPosition ?? 0.5,
    focalCount: spec.focalId ? spec.focalCount ?? 1 : 0,
  })
  const bom = toBraceletBOM(calc.raw.bom, materials)
  return { calc, slots, bom, lookup, mainMaterial }
}
