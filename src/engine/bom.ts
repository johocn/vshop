import type { BeadMaterial, BraceletBOM, BOMItem } from '../types'
import type { CalcBom } from '../vendor/diy-calc'
import { fitStatusOf } from './calc'

/** @diy/calc BOM（分）→ BraceletBOM（元）+ 分类/克重回填（纯函数） */
export function toBraceletBOM(bom: CalcBom, materials: BeadMaterial[]): BraceletBOM {
  const byCode = new Map<string, { category: BeadMaterial['category']; weight: number }>()
  for (const m of materials) {
    if (m.variants) {
      for (const v of Object.values(m.variants)) {
        byCode.set(v.code, { category: m.category, weight: m.weightPerBead ?? 0 })
      }
    }
    byCode.set(m.code, { category: m.category, weight: m.weightPerBead ?? 0 })
  }
  const items: BOMItem[] = bom.items.map((i) => ({
    code: i.code,
    name: i.name,
    spec: i.spec,
    count: i.qty,
    unitPrice: Math.round(i.unitPrice) / 100,
    subtotal: Math.round(i.subtotal) / 100,
    category: byCode.get(i.code)?.category ?? 'crystal',
  }))
  const weightG = bom.items.reduce((s, i) => s + (byCode.get(i.code)?.weight ?? 0) * i.qty, 0)
  return {
    totalCount: bom.totalCount,
    totalAmount: Math.round(bom.totalAmount) / 100,
    items,
    cordLengthMm: bom.cord?.length ?? 0,
    cordSpec: bom.cord ? `弹力线 ${bom.cord.diameter}mm · 建议长 ${(bom.cord.length / 10).toFixed(1)}cm` : '',
    weightG: Math.round(weightG * 10) / 10,
    fitStatus: fitStatusOf(bom.geometry?.feedback),
  }
}
