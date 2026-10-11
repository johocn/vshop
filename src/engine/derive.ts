import type { BraceletSpec, ResolvedItem, SequenceItem, BraceletBOM } from '../types'
import type { BraceletCalc } from './calc'
import { generateSequence } from './generator'
import { calcFromSequence } from './calc'
import { buildBOM } from './bom'
import { beadRepository } from '../data/repository'

export interface DerivedBracelet {
  calc: BraceletCalc
  sequence: SequenceItem[]
  bom: BraceletBOM
  lookup: (id: string) => ResolvedItem | undefined
  mainMaterial?: ResolvedItem
}

/**
 * 由方案派生出完整装配序列、动态算量与清单（生成系统主线）。
 * 内部统一使用本地「珠子 + 配件」视图（ResolvedItem），与后端来源解耦。
 */
export function deriveBracelet(spec: BraceletSpec): DerivedBracelet {
  const items = beadRepository.resolveItemsSync()
  const lookup = (id: string): ResolvedItem | undefined => items.find((i) => i.id === id)
  const sequence = generateSequence(spec, items)
  const calc = calcFromSequence(sequence, spec)
  const bom = buildBOM(sequence, lookup, calc)
  const mainMaterial = lookup(spec.mainMaterialId)
  return { calc, sequence, bom, lookup, mainMaterial }
}
