import { describe, it, expect } from 'vitest'
import { computeBracelet, DIAMETER_PRESETS } from '../src/engine/calc'
import { buildSlots } from '../src/engine/layout'
import type { BeadMaterial, BraceletSpec } from '../src/types'

const mat = (over: Partial<BeadMaterial>): BeadMaterial => ({
  id: 'agate-red', code: 'AG-RED-08-N', name: '南红玛瑙', category: 'agate', shape: 'round',
  beadDiameter: 8, beadLength: 8, holeSize: 1, availableDiameters: [6, 8, 10, 12, 14],
  priceUnit: 6.5, currency: 'CNY', stock: 600, ...over,
})
const baseSpec: BraceletSpec = {
  wristSize: 160, ease: 'comfort', layoutMode: 'solid', mainMaterialId: 'agate-red',
  diameter: 8, gap: 0.6, seed: 1, viewTilt: 0.5, rotation: 0,
}

describe('算量（@diy/calc 同构适配）', () => {
  it('160 手围 + 8mm + comfort：含 π·d 修正应为 22 颗左右（旧行为 19 颗已修正）', () => {
    const r = computeBracelet(baseSpec, [mat({})])
    expect(r.count).toBeGreaterThanOrEqual(20)
    expect(r.count).toBeLessThanOrEqual(24)
    expect(r.fitStatus).toBe('ok')
    expect(r.cordLengthMm).toBeGreaterThan(300)
  })
  it('直径档位变体参与算量与计价（分→元回译）', () => {
    const m = mat({
      priceUnit: 6.5,
      variants: { '10': { id: '201', code: 'AG-RED-10-N', beadLength: 10, holeSize: 1, priceUnit: 8.0 } },
    })
    const r = computeBracelet({ ...baseSpec, diameter: 10 }, [m])
    expect(r.count).toBeLessThan(20) // 10mm 比 8mm 颗数少
    expect(r.raw.bom.items[0].code).toBe('AG-RED-10-N')
    expect(r.raw.bom.items[0].unitPrice).toBe(800) // 分
  })
  it('focal 布局：focal 固定 1 颗计入 BOM', () => {
    const focal = mat({ id: 'amber-yellow', code: 'AM-YEL-10-N', beadDiameter: 10, beadLength: 10, priceUnit: 12 })
    const r = computeBracelet(
      { ...baseSpec, layoutMode: 'focal', focalId: 'amber-yellow', focalCount: 2 },
      [mat({}), focal],
    )
    const focalItem = r.raw.bom.items.find((i) => i.code === 'AM-YEL-10-N')
    expect(focalItem?.qty).toBe(1)
  })
  it('spacer：every=3 → 约 total/4 颗入 BOM', () => {
    const spacer = mat({ id: 'spacer-silicon', code: 'SP-SIL-02-N', shape: 'disc', beadDiameter: 8, beadLength: 1.5, priceUnit: 0.2 })
    const r = computeBracelet(
      { ...baseSpec, spacerEnabled: true, spacerId: 'spacer-silicon', spacerEvery: 3 },
      [mat({}), spacer],
    )
    const spacerItem = r.raw.bom.items.find((i) => i.code === 'SP-SIL-02-N')
    expect(spacerItem).toBeTruthy()
    expect(spacerItem!.qty).toBeGreaterThan(0)
  })
  it('相同输入确定性', () => {
    const a = computeBracelet(baseSpec, [mat({})])
    const b = computeBracelet(baseSpec, [mat({})])
    expect(a.count).toBe(b.count)
    expect(a.raw.bom.totalAmount).toBe(b.raw.bom.totalAmount)
  })
  it('DIAMETER_PRESETS 保留导出', () => {
    expect(DIAMETER_PRESETS).toContain(8)
  })
})

describe('排布 layout（不变）', () => {
  it('AB 模式严格交替', () => {
    const slots = buildSlots({ mainMaterialId: 'agate-red', secondaryMaterialId: 'metal-gold', layoutMode: 'ab', count: 20, seed: 1 })
    expect(slots[0].materialId).toBe('agate-red')
    expect(slots[1].materialId).toBe('metal-gold')
  })
})
