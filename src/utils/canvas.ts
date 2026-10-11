import Taro from '@tarojs/taro'
import type { CanvasFactory, SpriteCanvas } from '../engine/sprite-cache'

/** 当前设备像素比（H5 取 window，小程序取 systemInfo） */
export function getDpr(): number {
  try {
    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      return window.devicePixelRatio
    }
    const info = Taro.getSystemInfoSync() as unknown as { pixelRatio?: number }
    return info.pixelRatio || 2
  } catch {
    return 2
  }
}

/** 跨端离屏画布工厂：H5 用 DOM canvas，小程序用 wx.createOffscreenCanvas */
export function buildCanvasFactory(): CanvasFactory {
  const useDom = typeof document !== 'undefined' && typeof document.createElement === 'function'
  return {
    createSprite(sizePx: number): SpriteCanvas {
      let node: any
      if (useDom) {
        node = document.createElement('canvas')
        node.width = sizePx
        node.height = sizePx
      } else {
        node = Taro.createOffscreenCanvas({ type: '2d', width: sizePx, height: sizePx })
      }
      return node as unknown as SpriteCanvas
    },
  }
}

export interface ReadyCanvas {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
}

/**
 * 获取 2D canvas（小程序 type=2d 与 H5 通用）。
 * 注意：每次调用会按 dpr 重设宽高（清空），因此只在尺寸变化 / 首次时调用，
 * 重绘逻辑应复用返回的 ctx，不要再放大 scale。
 */
export function getCanvas2D(id: string, cb: (c: ReadyCanvas) => void): void {
  Taro.createSelectorQuery()
    .select('#' + id)
    .fields({ node: true, size: true })
    .exec((res) => {
      const item = res && res[0]
      if (!item) return
      const node = (item as any).node || item
      const ctx = node.getContext('2d') as CanvasRenderingContext2D
      const ratio = getDpr()
      const w = (item as any).width || node.width
      const h = (item as any).height || node.height
      node.width = w * ratio
      node.height = h * ratio
      ctx.scale(ratio, ratio)
      cb({ ctx, width: w, height: h, dpr: ratio })
    })
}
