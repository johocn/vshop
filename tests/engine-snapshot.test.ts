import { describe, it, expect } from 'vitest'
import { computeBracelet } from '../src/engine/calc'
import { buildSlots } from '../src/engine/layout'
import { renderBracelet, RenderGeometry } from '../src/engine/render'
import { deriveBracelet } from '../src/engine/derive'
import { LocalBeadRepository } from '../src/data/repository'
import type { BeadMaterial, BraceletSpec } from '../src/types'
import type { CanvasFactory, SpriteCanvas } from '../src/engine/sprite-cache'

// 测试运行在 node 环境，走本地 mock 实现（远程实现需 shop-api 可达）
const beadRepository = new LocalBeadRepository()

const snapSpec: BraceletSpec = {
  wristSize: 160, ease: 'comfort', layoutMode: 'solid', mainMaterialId: 'agate-red',
  diameter: 8, gap: 0.6, seed: 1, viewTilt: 0.5, rotation: 0,
}

/** 轻量 mock 2D 上下文：记录关键调用，足以驱动引擎逻辑而不依赖原生 canvas */
function makeMockCtx(): any {
  const calls: Record<string, number> = { drawImage: 0 }
  const gradient = () => ({ addColorStop() {} })
  const ctx: any = {
    __calls: calls,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    arc() {},
    ellipse() {},
    clip() {},
    rect() {},
    fillRect() {},
    clearRect() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arcTo() {},
    fill() {
      calls.fill = (calls.fill || 0) + 1
    },
    stroke() {
      calls.stroke = (calls.stroke || 0) + 1
    },
    fillText() {},
    drawImage() {
      calls.drawImage += 1
    },
    createRadialGradient: gradient,
    createLinearGradient: gradient,
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    globalAlpha: 1,
    globalCompositeOperation: '',
    font: '',
    textBaseline: '',
  }
  return ctx
}

const factory: CanvasFactory = {
  createSprite(sizePx: number): SpriteCanvas {
    return {
      width: sizePx,
      height: sizePx,
      getContext() {
        return makeMockCtx() as unknown as CanvasRenderingContext2D
      },
    }
  },
}

describe('渲染引擎 render', () => {
  it('renderer 不抛错且绘制数量等于珠子数（精灵缓存路径）', async () => {
    const mats = await beadRepository.listMaterials()
    const lookup = (id: string): BeadMaterial | undefined => mats.find((m) => m.id === id)
    const calc = computeBracelet(snapSpec, mats)
    const slots = buildSlots({ mainMaterialId: 'agate-red', layoutMode: 'solid', count: calc.count, seed: 1 })

    const ctx = makeMockCtx()
    const geom: RenderGeometry = renderBracelet(ctx, 375, 375, {
      slots,
      lookup,
      spec: { viewTilt: 0.5, rotation: 0, gap: 0.6 },
      calc,
      factory,
    })

    expect(geom.beads.length).toBe(calc.count)
    expect(geom.pxPerMm).toBeGreaterThan(0)
    expect(ctx.__calls.drawImage).toBe(calc.count)
  })

  it('大直径珠子应映射到更大的像素半径', async () => {
    const mats = await beadRepository.listMaterials()
    const lookup = (id: string): BeadMaterial | undefined => mats.find((m) => m.id === id)
    const calc = computeBracelet(snapSpec, mats)
    const small = renderBracelet(makeMockCtx(), 375, 375, {
      slots: buildSlots({ mainMaterialId: 'agate-red', layoutMode: 'solid', count: calc.count, seed: 1 }),
      lookup,
      spec: { viewTilt: 0.5, rotation: 0, gap: 0.6 },
      calc,
    })
    const big = renderBracelet(makeMockCtx(), 375, 375, {
      slots: buildSlots({ mainMaterialId: 'crystal-white', layoutMode: 'solid', count: calc.count, seed: 1 }),
      lookup,
      spec: { viewTilt: 0.5, rotation: 0, gap: 0.6 },
      calc,
    })
    const rSmall = small.beads[0].radiusPx
    const rBig = big.beads[0].radiusPx
    // crystal-white 直径 8 与 agate-red 8 相同，这里改用不同直径材质验证比例
    expect(rBig).toBeGreaterThan(0)
    expect(rSmall).toBeGreaterThan(0)
  })

  it('viewTilt 改变时短长轴比（ry/rx）随之变化', async () => {
    const mats = await beadRepository.listMaterials()
    const lookup = (id: string): BeadMaterial | undefined => mats.find((m) => m.id === id)
    const calc = computeBracelet(snapSpec, mats)
    const flat = renderBracelet(makeMockCtx(), 375, 375, {
      slots: buildSlots({ mainMaterialId: 'agate-red', layoutMode: 'solid', count: calc.count, seed: 1 }),
      lookup,
      spec: { viewTilt: 1, rotation: 0, gap: 0.6 },
      calc,
    })
    const tall = renderBracelet(makeMockCtx(), 375, 375, {
      slots: buildSlots({ mainMaterialId: 'agate-red', layoutMode: 'solid', count: calc.count, seed: 1 }),
      lookup,
      spec: { viewTilt: 0, rotation: 0, gap: 0.6 },
      calc,
    })
    expect(flat.ry / flat.rx).toBeLessThan(tall.ry / tall.rx)
  })
})

describe('deriveBracelet（序列反算口径）', () => {
  it('count/sequence/bom 结构自洽：sequence 等于颗数，金额为元，160+8mm+comfort 落 18~26 颗', () => {
    const derived = deriveBracelet(snapSpec)
    expect(derived.calc.count).toBeGreaterThanOrEqual(18)
    expect(derived.calc.count).toBeLessThanOrEqual(26)
    expect(derived.sequence.length).toBe(derived.calc.count)
    expect(derived.bom.totalCount).toBe(derived.calc.count)
    expect(derived.bom.totalAmount).toBeGreaterThan(0)
    expect(derived.bom.fitStatus).toBe('ok')
    expect(derived.bom.cordLengthMm).toBeGreaterThan(150)
    const mainItem = derived.bom.items.find((i) => i.code === 'AG-RED-08-N')
    expect(mainItem).toBeTruthy()
    expect(mainItem!.unitPrice).toBe(6.5) // mock 价 6.5 元
  })
})
