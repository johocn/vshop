import type { BraceletBOM, BOMItem, SequenceItem, ResolvedItem, JointMode, BeadCategory } from '../types'
import type { BraceletCalc } from './calc'

/** 各衔接方式额外占用的轴向长度 mm（与 calc.ts 保持一致） */
const JOINT_ALLOWANCE_MM: Record<JointMode, number> = {
  direct: 0,
  spacer: 1.2,
  ring: 2.0,
  knot: 3.0,
  crimp: 1.5,
}

/**
 * 由装配序列生成 BOM：按 refId 分组汇总珠子 / 装饰 / 焦点配饰 / 扣，
 * 并统计连接处衔接数量与占用长度。单价单位：元。
 */
export function buildBOM(
  sequence: SequenceItem[],
  lookup: (id: string) => ResolvedItem | undefined,
  calc: BraceletCalc,
): BraceletBOM {
  const groups = new Map<string, BOMItem>()
  let weightG = 0
  let jointCount = 0
  let jointLengthMm = 0

  for (const it of sequence) {
    const m = lookup(it.refId)
    if (!m) continue
    const item =
      groups.get(it.refId) ??
      ({
        code: m.code,
        name: m.name,
        spec: m.beadDiameter > 0 ? `${m.beadDiameter}mm` : m.category,
        count: 0,
        unitPrice: m.priceUnit,
        subtotal: 0,
        category: m.category as BeadCategory,
      } as BOMItem)
    item.count += 1
    item.subtotal = Math.round((item.subtotal + m.priceUnit) * 100) / 100
    groups.set(it.refId, item)
    weightG += m.weightPerBead
    if (it.joint && it.joint !== 'direct') {
      jointCount += 1
      jointLengthMm += JOINT_ALLOWANCE_MM[it.joint]
    }
  }

  const items = [...groups.values()].sort((a, b) => b.subtotal - a.subtotal)
  const totalCount = sequence.length
  const totalAmount = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 10) / 10

  return {
    totalCount,
    totalAmount,
    items,
    cordLengthMm: calc.cordLengthMm,
    cordSpec: `弹力线 ${calc.cordDiameter}mm · 建议长 ${(calc.cordLengthMm / 10).toFixed(1)}cm`,
    weightG: Math.round(weightG * 10) / 10,
    fitStatus: calc.fitStatus,
    jointCount,
    jointLengthMm: Math.round(jointLengthMm * 10) / 10,
  }
}
