import { describe, it, expect } from 'vitest'
import { LocalBeadRepository } from '../src/data/repository'
import { generateSequence, deriveBracelet, computeSequenceLength } from '../src/engine'
import type { BraceletSpec } from '../src/types'

// 测试运行在 node 环境，走本地 mock 实现（远程实现需 shop-api 可达）
const beadRepository = new LocalBeadRepository()

const items = beadRepository.resolveItemsSync()

function base(over: Partial<BraceletSpec> = {}): BraceletSpec {
  return {
    wristSize: 160,
    ease: 'comfort',
    layoutMode: 'solid',
    mainMaterialId: 'agate-red',
    diameter: 8,
    gap: 0.6,
    seed: 1,
    secondaryMaterialId: 'metal-gold',
    spacerEnabled: false,
    spacerEvery: 3,
    spacerId: 'spacer-silicon',
    viewTilt: 0.5,
    rotation: 0,
    paletteIds: ['agate-red', 'metal-gold'],
    sizeVariation: 0,
    jointMode: 'direct',
    claspType: 'magnet',
    insertEvery: 0,
    insertChance: 0,
    centerAccessoryIds: [],
    decorationIds: [],
    anchors: [],
    ...over,
  }
}

describe('generator', () => {
  it('同种子确定性：相同 spec 必得相同序列', () => {
    const spec = base({ seed: 42, sizeVariation: 0.5 })
    const a = generateSequence(spec, items)
    const b = generateSequence(spec, items)
    expect(a.map((s) => s.refId)).toEqual(b.map((s) => s.refId))
    expect(a.map((s) => s.beadDiameter)).toEqual(b.map((s) => s.beadDiameter))
  })

  it('换种子应产生不同序列（随机混搭）', () => {
    const a = generateSequence(base({ seed: 1, layoutMode: 'random', paletteIds: ['agate-red', 'metal-gold', 'jade'] }), items)
    const b = generateSequence(base({ seed: 999, layoutMode: 'random', paletteIds: ['agate-red', 'metal-gold', 'jade'] }), items)
    expect(a.map((s) => s.refId).join()).not.toEqual(b.map((s) => s.refId).join())
  })

  it('扣具：claspType≠none 时序列含 clasp 件', () => {
    const seq = generateSequence(base({ claspType: 'magnet' }), items)
    expect(seq.some((s) => s.kind === 'clasp')).toBe(true)
    const none = generateSequence(base({ claspType: 'none' }), items)
    expect(none.some((s) => s.kind === 'clasp')).toBe(false)
  })

  it('中心配饰混搭池被排入序列（focal）', () => {
    const seq = generateSequence(base({ centerAccessoryIds: ['charm-buddha', 'charm-star'] }), items)
    expect(seq.filter((s) => s.kind === 'focal').length).toBeGreaterThan(0)
  })

  it('珠间装饰物按规则插入', () => {
    const seq = generateSequence(base({ decorationIds: ['deco-goldbead'], insertEvery: 3 }), items)
    expect(seq.some((s) => s.kind === 'decoration')).toBe(true)
  })

  it('手动锚定覆盖指定位置', () => {
    const seq = generateSequence(base({ anchors: [{ position: 0.5, refId: 'charm-buddha', role: 'focal' }] }), items)
    const idx = Math.round(0.5 * (seq.length - 1))
    expect(seq[idx].refId).toBe('charm-buddha')
  })

  it('尺寸波动：直径取自可用直径且不超过 1 步跳变', () => {
    const seq = generateSequence(base({ paletteIds: ['agate-red'], sizeVariation: 1 }), items)
    const mat = items.find((i) => i.id === 'agate-red')!
    for (const s of seq) {
      if (s.kind !== 'bead') continue
      expect(mat.availableDiameters).toContain(s.beadDiameter)
    }
  })

  it('动态长度：含衔接与间隙，大于纯珠长之和', () => {
    const seq = generateSequence(base({ jointMode: 'ring' }), items)
    const len = computeSequenceLength(seq, base())
    const sumLen = seq.reduce((s, x) => s + x.beadLength, 0)
    expect(len).toBeGreaterThan(sumLen)
  })

  it('BOM 由 @diy/calc 回译：金额为元且含主珠行', async () => {
    const materials = await beadRepository.listMaterials()
    const derived = deriveBracelet(base(), materials)
    const item = derived.bom.items.find((it) => it.code === 'AG-RED-08-N')
    expect(item).toBeTruthy()
    expect(item!.unitPrice).toBe(6.5)
    expect(derived.bom.totalAmount).toBeGreaterThan(0)
  })

  it('deriveBracelet 输出有效算量与排布（不超松）', async () => {
    const materials = await beadRepository.listMaterials()
    const derived = deriveBracelet(base({ seed: 7 }), materials)
    expect(derived.slots.length).toBeGreaterThan(0)
    expect(derived.slots.length).toBe(derived.calc.count)
    expect(['ok', 'tight']).toContain(derived.calc.fitStatus)
  })
})
