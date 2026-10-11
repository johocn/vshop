import { useMemo, useRef, useState } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import Taro, { useLoad, navigateBack, showToast, canvasToTempFilePath, saveImageToPhotosAlbum, getEnv } from '@tarojs/taro'
import { useDesignerStore } from '../../store/designer-store'
import { deriveBracelet, renderBracelet, SpriteCache } from '../../engine'
import { buildCanvasFactory } from '../../utils/canvas'

const SIZE = 1080
type Edition = 'photo' | 'diagram' | 'scale'

const EDITIONS: { key: Edition; label: string; desc: string }[] = [
  { key: 'photo', label: '成品图', desc: '真实感成品效果' },
  { key: 'diagram', label: '串珠图纸', desc: '标注穿珠顺序' },
  { key: 'scale', label: '带标尺', desc: '对照 1cm 比例尺' },
]

export default function ExportPage() {
  const { spec, loaded, load } = useDesignerStore()
  const [mode, setMode] = useState<Edition>('photo')
  const [ready, setReady] = useState(false)
  const cacheRef = useRef<SpriteCache | null>(null)
  const nodeRef = useRef<any>(null)

  useLoad(() => {
    load()
  })

  const derived = useMemo(() => deriveBracelet(spec), [spec])

  if (!loaded) {
    return (
      <View className='flex min-h-screen items-center justify-center bg-ink-deep'>
        <Text className='text-inkText-2'>加载中…</Text>
      </View>
    )
  }

  const { sequence, lookup, calc } = derived

  const draw = () => {
    Taro.createSelectorQuery()
      .select('#exportCanvas')
      .fields({ node: true })
      .exec((res: any[]) => {
        const node = res && res[0] && res[0].node
        if (!node) return
        nodeRef.current = node
        const ctx = node.getContext('2d') as CanvasRenderingContext2D
        node.width = SIZE
        node.height = SIZE
        if (!cacheRef.current) cacheRef.current = new SpriteCache(buildCanvasFactory())
        const geom = renderBracelet(ctx, SIZE, SIZE, {
          sequence,
          lookup,
          spec,
          calc,
          background: true,
          showScale: mode !== 'photo',
          spriteCache: cacheRef.current,
        })
        if (mode === 'diagram') {
          ctx.save()
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          geom.beads.forEach((b) => {
            ctx.beginPath()
            ctx.arc(b.x, b.y - b.radiusPx - 16, 13, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(28,22,19,0.85)'
            ctx.fill()
            ctx.fillStyle = '#E0B95F'
            ctx.font = '16px sans-serif'
            ctx.fillText(String(b.index + 1), b.x, b.y - b.radiusPx - 16)
          })
          ctx.restore()
        }
        // 水印
        ctx.save()
        ctx.fillStyle = 'rgba(224,185,95,0.8)'
        ctx.font = '26px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(`DIY 手串 · 手围 ${(spec.wristSize / 10).toFixed(1)}cm`, SIZE - 36, SIZE - 36)
        ctx.restore()
        setReady(true)
      })
  }

  const onSave = () => {
    if (getEnv() === 'WEB') {
      const node: any = nodeRef.current
      if (node && node.toDataURL) {
        const a = document.createElement('a')
        a.href = node.toDataURL('image/png')
        a.download = `bracelet-${Date.now()}.png`
        a.click()
        showToast({ title: '已开始下载', icon: 'none' })
      }
      return
    }
    Taro.createSelectorQuery()
      .select('#exportCanvas')
      .fields({ node: true })
      .exec((res: any[]) => {
        const node = res && res[0] && res[0].node
        if (!node) return
        canvasToTempFilePath({
          canvas: node,
          destWidth: SIZE,
          destHeight: SIZE,
          success: (r: any) => {
            saveImageToPhotosAlbum({
              filePath: r.tempFilePath,
              success: () => showToast({ title: '已保存到相册', icon: 'success' }),
              fail: () => showToast({ title: '保存失败，请授权相册', icon: 'none' }),
            })
          },
          fail: () => showToast({ title: '导出失败', icon: 'none' }),
        })
      })
  }

  return (
    <View className='flex min-h-screen flex-col bg-ink-deep pb-24'>
      <View className='flex items-center justify-between px-5 pt-12'>
        <Text className='text-[20px] font-semibold text-inkText-1'>导出与分享</Text>
        <View onClick={() => navigateBack()} className='text-[14px] text-inkText-2'>
          返回
        </View>
      </View>

      {/* 预览画布（显示缩放） */}
      <View className='mt-4 flex justify-center'>
        <Canvas
          type='2d'
          id='exportCanvas'
          style={{ width: '320px', height: '320px' }}
          onReady={draw}
        />
      </View>

      {/* 版式选择 */}
      <View className='m-4 grid grid-cols-3 gap-3'>
        {EDITIONS.map((e) => {
          const active = e.key === mode
          return (
            <View
              key={e.key}
              onClick={() => {
                setMode(e.key)
                setTimeout(draw, 30)
              }}
              className={`rounded-card border p-3 text-center ${
                active ? 'border-gold-2 bg-gold-1/15' : 'border-white/10 bg-white/5'
              }`}
            >
              <Text className='block text-[14px] text-inkText-1'>{e.label}</Text>
              <Text className='mt-1 block text-[10px] text-inkText-2'>{e.desc}</Text>
            </View>
          )
        })}
      </View>

      <View className='fixed bottom-0 left-0 right-0 bg-ink-panel/95 px-5 py-3 backdrop-blur'>
        <View
          onClick={onSave}
          className='w-full rounded-btn bg-gold-1 py-3 text-center text-[15px] font-medium text-ink-deep'
        >
          保存到相册 / 下载
        </View>
      </View>
    </View>
  )
}
