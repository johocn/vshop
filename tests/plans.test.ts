import { describe, it, expect } from 'vitest'
import { toPlanSpec } from '../src/api/plans'
import type { BeadMaterial, BraceletSpec } from '../src/types'

const mat = (over: Partial<BeadMaterial>): BeadMaterial => ({
  id: 'agate-red', code: 'AG-RED-08-N', name: '南红', category: 'agate', shape: 'round',
  beadDiameter: 8, beadLength: 8, holeSize: 1, availableDiameters: [6, 8, 10],
  priceUnit: 6.5, currency: 'CNY', stock: 600,
  variants: {
    '8': { id: '101', code: 'AG-RED-08-N', beadLength: 8, holeSize: 1, priceUnit: 6.5 },
    '10': { id: '102', code: 'AG-RED-10-N', beadLength: 10, holeSize: 1, priceUnit: 8 },
  },
  ...over,
})
const spec: BraceletSpec = {
  wristSize: 160, ease: 'comfort', layoutMode: 'focal', mainMaterialId: 'agate-red',
  diameter: 10, gap: 0.6, seed: 7, spacerEnabled: true, spacerId: 'spacer-silicon',
  spacerEvery: 3, focalId: 'amber-yellow', focalCount: 2, viewTilt: 0.5, rotation: 0,
}

describe('toPlanSpec', () => {
  it('槽位 materialId 用当前直径对应变体 SKU id；params 直接透传', () => {
    const focal = mat({ id: 'amber-yellow', code: 'AM-YEL-10-N', beadDiameter: 10, beadLength: 10, variants: { '10': { id: '201', code: 'AM-YEL-10-N', beadLength: 10, holeSize: 1.5, priceUnit: 12 } } })
    const spacer = mat({ id: 'spacer-silicon', code: 'SP-SIL-02-N', shape: 'disc', beadDiameter: 8, beadLength: 1.5, variants: { '8': { id: '301', code: 'SP-SIL-02-N', beadLength: 1.5, holeSize: 1, priceUnit: 0.2 } } })
    const out = toPlanSpec(spec, [mat({}), focal, spacer])
    expect(out.slots.main).toEqual({ materialId: '102' })
    expect(out.slots.focal).toEqual({ materialId: '201' })
    expect(out.slots.spacer).toEqual({ materialId: '301', every: 3 })
    expect(out.params).toEqual({ wristSize: 160, fit: 'comfort', gap: 0.6 })
    expect(out.seed).toBe(7)
  })
  it('无 variants（mock 数据）回退组 id，不抛错', () => {
    const out = toPlanSpec({ ...spec, spacerEnabled: false }, [mat({ variants: undefined })])
    expect(out.slots.main.materialId).toBe('agate-red')
    expect(out.slots.focal).toBeUndefined()
  })
})
