import type { RenderSpec } from '../types'
import { paintBead } from './bead-painters'

/** 离屏画布抽象（跨端：H5 用 DOM canvas，小程序用 wx.createOffscreenCanvas，Node 用 node-canvas） */
export interface SpriteCanvas {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
}

/** 由平台提供的离屏画布工厂 */
export interface CanvasFactory {
  createSprite(sizePx: number): SpriteCanvas
}

/**
 * 离屏精灵缓存：每个珠子按"材质 + 直径像素(量化) + 纹理种子(量化)"生成一个离屏精灵，
 * 主循环只做 N 次 drawImage，避免每帧重建渐变（小程序卡顿的关键）。
 */
export class SpriteCache {
  private map = new Map<string, SpriteCanvas>()

  constructor(private readonly factory: CanvasFactory) {}

  /** 取或创建精灵；size 为包含的像素直径（实际绘制半径会略收缩以留缝） */
  get(key: string, drawRadiusPx: number, spec: RenderSpec, seed: number): SpriteCanvas {
    let sprite = this.map.get(key)
    if (!sprite) {
      const size = Math.ceil(drawRadiusPx * 2 + 10)
      sprite = this.factory.createSprite(size)
      const c = sprite.getContext('2d')
      if (c) {
        paintBead(c, size / 2, size / 2, drawRadiusPx, spec, seed)
      }
      this.map.set(key, sprite)
    }
    return sprite
  }

  clear(): void {
    this.map.clear()
  }
}
