import type {
  BraceletSpec,
  ResolvedItem,
  SequenceItem,
  JointMode,
  ClaspType,
  SequenceKind,
  BeadAnchor,
  LayoutMode,
} from '../types'
import { rngFromSeed, randInt } from '../utils/prng'
import { clamp as clampN } from '../utils/geo'
import { computeBraceletGeometry, easeOf } from '../vendor/diy-calc'
import { beadRepository } from '../data/repository'

/** 各衔接方式额外占用的轴向长度 mm（计入动态总长；自旧 calc.ts 迁移） */
const JOINT_ALLOWANCE_MM: Record<JointMode, number> = {
  direct: 0,
  spacer: 1.2,
  ring: 2.0,
  knot: 3.0,
  crimp: 1.5,
}

/**
 * 动态长度：环形手串总长 = Σ(珠长) + N×(间隙) + Σ(衔接 allowance)。
 * N 为序列件数（环形有 N 个连接处）。
 */
export function computeSequenceLength(sequence: SequenceItem[], spec: BraceletSpec): number {
  const gap = spec.gap
  let len = 0
  for (const it of sequence) {
    len += it.beadLength + gap + JOINT_ALLOWANCE_MM[it.joint]
  }
  return Math.max(0, len)
}

/** 由方案 + 统一物料库生成完整装配序列（珠子/装饰/焦点配饰/扣混搭，含尺寸抖动、锚定、衔接、长度反算与微调）。纯函数 + 确定性。 */
export function generateSequence(spec: BraceletSpec, items: ResolvedItem[]): SequenceItem[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const beads = items.filter((i) => !i.isAccessory)
  const seedStr = [
    spec.seed,
    spec.presetTemplateId ?? '-',
    (spec.paletteIds ?? []).join(','),
    (spec.centerAccessoryIds ?? []).join(','),
    (spec.decorationIds ?? []).join(','),
    spec.sizeVariation ?? 0,
    spec.insertEvery ?? 0,
    spec.insertChance ?? 0,
    spec.jointMode ?? 'direct',
    spec.claspType ?? 'magnet',
    spec.layoutMode ?? '-',
    spec.focalId ?? '-',
    (spec.anchors ?? []).map((a) => `${a.position}:${a.refId}`).join('|'),
  ].join('|')
  const rng = rngFromSeed(seedStr)

  // —— 解析混搭池（缺省回退）——
  const paletteIds = (spec.paletteIds && spec.paletteIds.length ? spec.paletteIds : [spec.mainMaterialId, spec.secondaryMaterialId]).filter(
    Boolean,
  ) as string[]
  const palette = paletteIds.map((id) => byId.get(id)).filter((m): m is ResolvedItem => !!m && !m.isAccessory)
  const effectivePalette = palette.length ? palette : beads

  const centerIds = (spec.centerAccessoryIds ?? []).map((id) => byId.get(id)).filter((m): m is ResolvedItem => !!m)
  const decoIds = (spec.decorationIds ?? []).map((id) => byId.get(id)).filter((m): m is ResolvedItem => !!m)

  const jointMode: JointMode = spec.jointMode ?? 'direct'
  const claspType: ClaspType = spec.claspType ?? 'magnet'
  const sizeVariation = clampN((spec.sizeVariation ?? 0), 0, 1)
  const insertEvery = Math.max(0, spec.insertEvery ?? 0)
  const insertChance = clampN(spec.insertChance ?? 0, 0, 1)
  const layoutMode: LayoutMode = spec.layoutMode ?? 'solid'
  const gap = spec.gap

  // —— 目标珠数（模板 wrapCount 优先；否则按手围估算）——
  const avgD = effectivePalette.reduce((s, m) => s + m.beadDiameter, 0) / Math.max(1, effectivePalette.length)
  const est = computeBraceletGeometry({
    wristSize: spec.wristSize,
    diameter: avgD || spec.diameter,
    axialLength: avgD || spec.diameter,
    gap,
    ease: easeOf(spec.ease),
  })
  const beadCount = spec.presetTemplateId
    ? templateWrapCount(spec) ?? clampN(est.count, 6, 140)
    : clampN(est.count, 6, 140)

  // —— 1) 基础珠子序列（图案 / 混搭 + 尺寸抖动 + 协调）——
  const usePattern = effectivePalette.length <= 2 && layoutMode !== 'random'
  const base: SequenceItem[] = []
  let prevD = -1
  let prevPrevD = -1
  for (let i = 0; i < beadCount; i += 1) {
    const mat = materialAt(effectivePalette, i, beadCount, layoutMode, usePattern, rng)
    let d = pickDiameter(mat, rng, sizeVariation)
    // 自然协调：避免 3 颗连续同直径（大珠连排显呆板）
    if (d === prevD && prevD === prevPrevD && rng() < 0.7) {
      const alt = pickDiameter(mat, rng, sizeVariation)
      if (alt !== d) d = alt
    }
    prevPrevD = prevD
    prevD = d
    base.push({
      index: i,
      position: beadCount > 1 ? i / (beadCount - 1) : 0,
      kind: 'bead',
      refId: mat.id,
      beadLength: approxLength(mat, d),
      beadDiameter: d,
      unitPrice: mat.priceUnit,
      role: 'main',
      joint: jointMode,
      textureSeed: hashSeed(`${mat.id}:${i}:${d}`),
    })
  }

  // —— 2) 中心小配饰 / 焦点混搭（顶部居中区域均匀散布，不重复堆叠）——
  const centerList: ResolvedItem[] = [...centerIds]
  if (layoutMode === 'focal' && spec.focalId) {
    const f = byId.get(spec.focalId)
    if (f && !f.isAccessory) centerList.push(f)
  }
  if (centerList.length) {
    const top = Math.round(0.5 * (base.length - 1))
    const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4]
    let ci = 0
    const focalCount = layoutMode === 'focal' && spec.focalId ? Math.max(1, spec.focalCount ?? 1) : centerList.length
    for (const off of offsets) {
      if (ci >= focalCount) break
      const idx = top + off
      if (idx < 0 || idx >= base.length) continue
      const acc = centerList[ci % centerList.length]
      ci += 1
      base[idx] = {
        index: idx,
        position: base[idx].position,
        kind: 'focal',
        refId: acc.id,
        beadLength: acc.beadLength,
        beadDiameter: acc.beadDiameter,
        unitPrice: acc.priceUnit,
        role: 'focal',
        joint: 'ring',
        textureSeed: hashSeed(`focal:${acc.id}:${idx}`),
      }
    }
  }

  // —— 3) 珠间插入装饰物 ——
  let seq: SequenceItem[] = base
  if (decoIds.length && (insertEvery > 0 || insertChance > 0)) {
    const out: SequenceItem[] = []
    for (let i = 0; i < base.length; i += 1) {
      out.push(base[i])
      const shouldInsert = insertEvery > 0 ? (i + 1) % insertEvery === 0 : rng() < insertChance
      if (shouldInsert && i < base.length - 1) {
        const deco = decoIds[randInt(rng, 0, decoIds.length - 1)]
        out.push({
          index: out.length,
          position: 0,
          kind: 'decoration',
          refId: deco.id,
          beadLength: deco.beadLength,
          beadDiameter: deco.beadDiameter,
          unitPrice: deco.priceUnit,
          role: 'decoration',
          joint: jointMode === 'direct' ? 'ring' : jointMode,
          textureSeed: hashSeed(`deco:${deco.id}:${i}`),
        })
      }
    }
    seq = out
  }

  // —— 4) 扣具（闭合处，先于锚定以便索引一致）——
  const claspId = beadRepository.claspAccessoryId(claspType)
  if (claspId) {
    const clasp = byId.get(claspId)
    if (clasp) {
      seq.unshift({
        index: 0,
        position: 0,
        kind: 'clasp',
        refId: clasp.id,
        beadLength: clasp.beadLength,
        beadDiameter: clasp.beadDiameter,
        unitPrice: clasp.priceUnit,
        role: 'clasp',
        joint: 'direct',
        textureSeed: hashSeed(`clasp:${clasp.id}`),
      })
    }
  }

  // —— 4.5) 动态长度反算 + 微调（过长的填充珠优先从远离中心处删减，先于锚定以保持索引稳定）——
  seq = reconcileToWrist(seq, spec)

  // —— 5) 手动锚定覆盖（在长度微调后计算索引，保持一致）——
  const anchors: BeadAnchor[] = spec.anchors ?? []
  if (anchors.length) {
    for (const a of anchors) {
      const idx = clampN(Math.round(a.position * (seq.length - 1)), 0, seq.length - 1)
      const m = byId.get(a.refId)
      if (!m) continue
      const kind: SequenceKind =
        m.accessoryType === 'charm' || m.accessoryType === 'guru'
          ? 'focal'
          : m.accessoryType === 'decoration' || m.accessoryType === 'ring'
            ? 'decoration'
            : 'bead'
      seq[idx] = {
        index: idx,
        position: seq[idx].position,
        kind,
        refId: m.id,
        beadLength: approxLength(m, a.beadDiameter ?? m.beadDiameter),
        beadDiameter: a.beadDiameter ?? m.beadDiameter,
        unitPrice: m.priceUnit,
        role: a.role === 'focal' ? 'focal' : a.role === 'decoration' ? 'decoration' : 'main',
        joint: seq[idx].joint,
        textureSeed: hashSeed(`anchor:${m.id}:${idx}`),
      }
    }
  }

  // —— 6) 重排 index / position ——
  seq = reindex(seq)

  return seq
}

/** 图案 / 混搭选材：双材质时尊重 layoutMode；多材质或 random 时随机采样 */
function materialAt(
  palette: ResolvedItem[],
  i: number,
  n: number,
  layoutMode: LayoutMode,
  usePattern: boolean,
  rng: () => number,
): ResolvedItem {
  if (usePattern) {
    switch (layoutMode) {
      case 'ab':
        return palette[i % 2 === 0 ? 0 : 1] ?? palette[0]
      case 'gradient': {
        const t = n > 1 ? Math.abs(i / (n - 1) - 0.5) * 2 : 0
        return rng() < t ? palette[1] ?? palette[0] : palette[0]
      }
      case 'solid':
      case 'focal':
      default:
        return palette[0]
    }
  }
  return palette[randInt(rng, 0, palette.length - 1)]
}

/** 重排序列的 index 与 0..1 位置 */
function reindex(seq: SequenceItem[]): SequenceItem[] {
  return seq.map((s, i) => ({
    ...s,
    index: i,
    position: seq.length > 1 ? i / (seq.length - 1) : 0,
  }))
}

/** 在可用直径子集内做确定性尺寸抖动；variation 越大越易偏离基准直径 */
function pickDiameter(mat: ResolvedItem, rng: () => number, variation: number): number {
  const diams = mat.availableDiameters.slice().sort((a, b) => a - b)
  if (diams.length === 0) return mat.beadDiameter
  let baseIdx = 0
  let best = Infinity
  diams.forEach((d, i) => {
    const diff = Math.abs(d - mat.beadDiameter)
    if (diff < best) {
      best = diff
      baseIdx = i
    }
  })
  if (variation <= 0 || rng() >= variation) return diams[baseIdx]
  const step = rng() < 0.5 ? -1 : 1
  const idx = clampN(baseIdx + step, 0, diams.length - 1)
  return diams[idx]
}

/** 珠子轴向长度近似：圆珠≈直径，其余用物料自带 beadLength */
function approxLength(mat: ResolvedItem, diameter: number): number {
  if (mat.shape === 'round' || mat.shape === 'rondelle') return diameter
  return mat.beadLength || diameter
}

/** 模板 wrapCount（若模板带目标珠数） */
function templateWrapCount(spec: BraceletSpec): number | undefined {
  const t = beadRepository.getTemplate(spec.presetTemplateId ?? '')
  return t?.wrapCount
}

/** 长度微调：超出手围+松量则从远离中心处删减填充珠，直到贴合或无可删 */
function reconcileToWrist(seq: SequenceItem[], spec: BraceletSpec): SequenceItem[] {
  const outer = spec.wristSize + (spec.ease === 'snug' ? 5 : spec.ease === 'loose' ? 18 : 10)
  let cur = seq
  let guard = 0
  while (guard < 300) {
    guard += 1
    const len = computeSequenceLength(cur, spec)
    if (len <= outer + 4) break
    let removeIdx = -1
    let worst = -1
    for (let i = 0; i < cur.length; i += 1) {
      const it = cur[i]
      if (it.kind !== 'bead' || it.role === 'focal') continue
      const dist = Math.abs(it.position - 0.5)
      if (dist > worst) {
        worst = dist
        removeIdx = i
      }
    }
    if (removeIdx < 0) break
    cur = reindex(cur.filter((_, i) => i !== removeIdx))
  }
  return cur
}

/** 轻量字符串散列（复用 prng 的 xmur3） */
function hashSeed(str: string): number {
  const r = rngFromSeed(str)
  return Math.floor(r() * 1e9)
}
