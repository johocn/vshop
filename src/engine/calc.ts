/**
 * 算量适配层：C 端领域模型（BeadMaterial/BraceletSpec，价格元）→ @diy/calc CalculatorInput（价格分）
 * → 结果回译。@diy/calc 为 vendor 源码拷贝，与后端 runDiyCalc 完全同构。
 */
import type { BeadMaterial, BraceletSpec } from '../types'
import { braceletCalculator, CalcMaterial, CalculatorOutput, SlotSelection } from '../vendor/diy-calc'

/** 可选直径档位（mm）——保留既有导出，UI 直径选择器用 */
export const DIAMETER_PRESETS = [4, 6, 8, 10, 12, 14, 16]

/** （组）材质 + 当前直径档位 → 实际 SKU 视图（variants 命中用变体，否则回退组本体） */
export function resolveCalcMaterial(m: BeadMaterial, diameter?: number): CalcMaterial {
  const v = diameter != null ? m.variants?.[String(diameter)] : undefined
  return {
    id: v?.id ?? m.id,
    code: v?.code ?? m.code,
    name: m.name,
    shape: m.shape,
    diameter: diameter ?? m.beadDiameter,
    axialLength: v?.beadLength ?? m.beadLength,
    holeSize: v?.holeSize ?? m.holeSize,
    price: Math.round((v?.priceUnit ?? m.priceUnit) * 100),
  }
}

export interface BraceletCalc {
  count: number
  innerCircumferenceMm: number
  outerCircumferenceMm: number
  fitStatus: 'tight' | 'ok' | 'loose'
  /** 中文反馈文案（@diy/calc feedback 回译） */
  feedback: string
  clearance: number
  cordLengthMm: number
  cordDiameter: number
  /** @diy/calc 原始输出（BOM 换算用） */
  raw: CalculatorOutput
}

const FEEDBACK_TEXT: Record<string, string> = {
  'too-tight': '过紧：戴不上，建议加大直径或放松量',
  snug: '偏紧：可加大松量',
  ok: '贴合度良好',
  loose: '偏松：可减小松量',
  'too-loose': '过松：建议减小直径或减松量',
}

export function fitStatusOf(feedback: string | undefined): 'tight' | 'ok' | 'loose' {
  if (feedback === 'too-tight' || feedback === 'snug') return 'tight'
  if (feedback === 'ok') return 'ok'
  return 'loose'
}

/** 手串算量：与后端 bracelet-classic 模板同一套纯函数（main/focal/spacer 三角色） */
export function computeBracelet(spec: BraceletSpec, materials: BeadMaterial[]): BraceletCalc {
  const lookup = (id?: string) => (id ? materials.find((m) => m.id === id) : undefined)
  const main = lookup(spec.mainMaterialId)
  const focal = spec.layoutMode === 'focal' ? lookup(spec.focalId) : undefined
  const spacer = spec.spacerEnabled ? lookup(spec.spacerId) : undefined

  // 注意：resolveCalcMaterial 命中直径档位变体时 id/code 会切到变体 SKU，
  // vendor 的 braceletCalculator 按 CalcMaterial.id 关联 slots 与 materials，
  // 故槽位引用与素材表都必须使用解析后的 id（与骨架假设的差异点，已适配）。
  const used = new Map<string, CalcMaterial>()
  const use = (m: BeadMaterial, diameter: number | undefined): string => {
    const resolved = resolveCalcMaterial(m, diameter)
    if (!used.has(resolved.id)) used.set(resolved.id, resolved)
    return resolved.id
  }

  const slots: SlotSelection[] = [
    { key: 'main', role: 'main', materialId: main ? use(main, spec.diameter) : spec.mainMaterialId },
  ]
  if (focal) slots.push({ key: 'focal', role: 'focal', materialId: use(focal, focal.beadDiameter) })
  if (spacer)
    slots.push({
      key: 'spacer',
      role: 'spacer',
      materialId: use(spacer, spacer.beadDiameter),
      every: Math.max(1, spec.spacerEvery ?? 2),
    })

  const out = braceletCalculator({
    params: { wristSize: spec.wristSize, fit: spec.ease, gap: spec.gap },
    slots,
    materials: [...used.values()],
  })
  const calc = out.calc
  return {
    count: calc?.count ?? 0,
    innerCircumferenceMm: Math.round(calc?.innerCircumference ?? 0),
    outerCircumferenceMm: Math.round(calc?.centerCircumference ?? 0),
    fitStatus: fitStatusOf(calc?.feedback),
    feedback: FEEDBACK_TEXT[calc?.feedback ?? 'ok'] ?? '',
    clearance: Math.round((calc?.clearance ?? 0) * 10) / 10,
    cordLengthMm: Math.round(calc?.cordLength ?? 0),
    cordDiameter: calc?.cordDiameter ?? 0.8,
    raw: out,
  }
}
