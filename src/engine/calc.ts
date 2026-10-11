/**
 * 算量适配层：C 端领域模型（BeadMaterial/BraceletSpec，价格元）→ @diy/calc CalculatorInput（价格分）
 * → 结果回译。@diy/calc 为 vendor 源码拷贝，与后端 runDiyCalc 完全同构。
 */
import type { BeadMaterial, BraceletSpec, JointMode, SequenceItem, EaseLevel } from '../types'
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
  /** 中文反馈文案（@diy/calc feedback 回译 / 序列反算反馈共用） */
  feedback: string
  /** 序列反算的中文反馈（与 feedback 同源） */
  message?: string
  clearance: number
  cordLengthMm: number
  cordDiameter: number
  /** @diy/calc 原始输出（旧管线 BOM 换算用；序列管线为 undefined） */
  raw?: CalculatorOutput
  /** 主珠数（序列管线） */
  mainCount?: number
  /** 焦点/配饰数（序列管线） */
  focalCount?: number
  /** 相邻珠夹角（rad，序列管线） */
  pitchAngle?: number
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

// —— 由实际装配序列反算“动态长度”（生成系统核心） ——

/** 松量档位 → mm */
export function easeToMm(ease: EaseLevel): number {
  return ease === 'snug' ? 5 : ease === 'loose' ? 18 : 10
}

/** 各衔接方式额外占用的轴向长度 mm（计入动态总长） */
export const JOINT_ALLOWANCE_MM: Record<JointMode, number> = {
  direct: 0,
  spacer: 1.2,
  ring: 2.0,
  knot: 3.0,
  crimp: 1.5,
}

/** 动态长度：环形手串总长 = Σ(珠长) + N×(间隙) + Σ(衔接 allowance)。N 为序列件数（环形有 N 个连接处） */
export function computeSequenceLength(sequence: SequenceItem[], spec: BraceletSpec): number {
  const gap = spec.gap
  let len = 0
  for (const it of sequence) {
    len += it.beadLength + gap + JOINT_ALLOWANCE_MM[it.joint]
  }
  return Math.max(0, len)
}

/** 由内周长判断贴合度 */
export function sequenceFit(innerMm: number, wristMm: number, ease: EaseLevel): BraceletCalc['fitStatus'] {
  const outer = wristMm + easeToMm(ease)
  if (innerMm < wristMm - 1) return 'tight'
  if (innerMm > outer + 4) return 'loose'
  return 'ok'
}

/** 由装配序列生成完整算量结果（供设计器/清单/导出复用） */
export function calcFromSequence(sequence: SequenceItem[], spec: BraceletSpec): BraceletCalc {
  const inner = computeSequenceLength(sequence, spec)
  const outer = spec.wristSize + easeToMm(spec.ease)
  const fit = sequenceFit(inner, spec.wristSize, spec.ease)
  const mainCount = sequence.filter((s) => s.kind === 'bead').length
  const focalCount = sequence.filter((s) => s.kind === 'focal').length
  const cordLengthMm = Math.round(inner + 24)
  const message =
    fit === 'tight'
      ? '偏紧：整体略小于手围，建议增大直径或减小松量'
      : fit === 'loose'
        ? '偏松：整体略大于手围，可减小直径或加大松量'
        : '贴合度良好'
  return {
    count: sequence.length,
    innerCircumferenceMm: Math.round(inner),
    outerCircumferenceMm: Math.round(outer),
    fitStatus: fit,
    feedback: message,
    message,
    clearance: 0,
    cordLengthMm,
    cordDiameter: 0.8,
    raw: undefined,
    mainCount,
    focalCount,
    pitchAngle: (2 * Math.PI) / Math.max(1, sequence.length),
  }
}
