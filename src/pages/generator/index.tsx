import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import { useLoad, navigateTo, showToast } from '@tarojs/taro'
import { useDesignerStore } from '../../store/designer-store'
import { deriveBracelet, renderBracelet, SpriteCache } from '../../engine'
import { buildCanvasFactory, getCanvas2D } from '../../utils/canvas'
import {
  TemplateChips,
  Segmented,
  SliderRow,
  PoolSection,
  ThumbItem,
} from '../../components/generator-controls'
import { AnchorEditor } from '../../components/anchor-editor'

export default function GeneratorPage() {
  const store = useDesignerStore()
  const { spec, materials, accessories, templates, loaded, load } = store
  const [ready, setReady] = useState(false)
  const canvasRef = useRef<{ ctx: CanvasRenderingContext2D; width: number; height: number } | null>(null)
  const cacheRef = useRef<SpriteCache | null>(null)

  useLoad(() => {
    load()
    const s = useDesignerStore.getState().spec
    // 进入生成器：若无模板且选中多材质却仍是纯色，默认改为随机混搭以展现丰富度
    if (!s.presetTemplateId && (s.paletteIds?.length ?? 0) > 1 && (s.layoutMode === 'solid' || !s.layoutMode)) {
      useDesignerStore.getState().setLayoutMode('random')
    }
  })

  const paletteItems: ThumbItem[] = useMemo(
    () =>
      materials
        .filter((m) => m.category !== 'spacer')
        .map((m) => ({ id: m.id, name: m.name, renderSpec: m.renderSpec, sub: `${m.beadDiameter}mm` })),
    [materials],
  )
  const centerItems: ThumbItem[] = useMemo(
    () =>
      accessories
        .filter((a) => a.type === 'charm' || a.type === 'guru')
        .map((a) => ({ id: a.id, name: a.name, renderSpec: a.renderSpec })),
    [accessories],
  )
  const decorationItems: ThumbItem[] = useMemo(
    () =>
      accessories
        .filter((a) => a.type === 'decoration' || a.type === 'ring')
        .map((a) => ({ id: a.id, name: a.name, renderSpec: a.renderSpec })),
    [accessories],
  )
  const anchorPool: ThumbItem[] = useMemo(
    () => [
      ...materials.filter((m) => m.category !== 'spacer').map((m) => ({ id: m.id, name: m.name, renderSpec: m.renderSpec })),
      ...accessories
        .filter((a) => a.type !== 'clasp')
        .map((a) => ({ id: a.id, name: a.name, renderSpec: a.renderSpec })),
    ],
    [materials, accessories],
  )

  const derived = useMemo(() => deriveBracelet(spec, materials), [spec, materials])

  useEffect(() => {
    getCanvas2D('gen-preview', (c) => {
      canvasRef.current = c
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready || !canvasRef.current) return
    const { ctx, width, height } = canvasRef.current
    if (!cacheRef.current) cacheRef.current = new SpriteCache(buildCanvasFactory())
    renderBracelet(ctx, width, height, {
      slots: derived.slots,
      lookup: derived.lookup,
      spec,
      calc: derived.calc,
      background: true,
      showScale: false,
      spriteCache: cacheRef.current,
    })
  }, [ready, derived, spec])

  if (!loaded) {
    return (
      <View className='flex min-h-screen items-center justify-center bg-ink-deep'>
        <Text className='text-inkText-2'>加载中…</Text>
      </View>
    )
  }

  const onGenerate = () => {
    if (!spec.paletteIds || spec.paletteIds.length === 0) {
      showToast({ title: '请至少选择一种珠子', icon: 'none' })
      return
    }
    store.applySpec(spec)
    navigateTo({ url: '/pages/designer/index' })
  }

  return (
    <View className='flex min-h-screen flex-col bg-ink-deep pb-28'>
      <View className='flex items-center justify-between px-5 pt-12'>
        <Text className='text-[22px] font-semibold text-inkText-1'>珠串生成器</Text>
        <View onClick={() => navigateTo({ url: '/pages/works/index' })} className='rounded-btn border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] text-inkText-1'>
          作品
        </View>
      </View>

      {/* 实时预览 */}
      <View className='relative mt-3 w-full' style={{ height: '300px' }}>
        <Canvas type='2d' id='gen-preview' className='h-full w-full' />
        <View className='absolute left-3 top-3 rounded-pill bg-gold-1/20 px-3 py-1 text-[12px] text-gold-2'>
          {derived.calc.feedback}
        </View>
      </View>

      <View className='m-4 rounded-card border border-white/10 bg-ink-panel/80 p-4'>
        <Text className='mb-2 block text-[14px] font-medium text-inkText-1'>内置模板</Text>
        <TemplateChips templates={templates} activeId={spec.presetTemplateId} onPick={store.applyTemplate} />

        <PoolSection title='混搭珠子池（可多选）' items={paletteItems} selectedIds={spec.paletteIds ?? []} onToggle={store.togglePaletteId} />

        <SliderRow label='珠子尺寸随机波动' value={Math.round((spec.sizeVariation ?? 0) * 100)} min={0} max={100} step={5} onChange={(v) => store.setSizeVariation(v / 100)} format={(v) => `${v}%`} />

        <View className='mt-3'>
          <Text className='mb-2 block text-[13px] font-medium text-inkText-1'>混搭方式</Text>
          <Segmented
            value={spec.layoutMode ?? 'solid'}
            onChange={store.setLayoutMode}
            options={[
              { value: 'solid', label: '纯色' },
              { value: 'ab', label: 'AB交替' },
              { value: 'gradient', label: '渐变' },
              { value: 'random', label: '随机混搭' },
            ]}
          />
        </View>

        <PoolSection title='中心小配饰混搭池' items={centerItems} selectedIds={spec.centerAccessoryIds ?? []} onToggle={store.toggleCenterId} />

        <PoolSection title='珠间装饰物池' items={decorationItems} selectedIds={spec.decorationIds ?? []} onToggle={store.toggleDecorationId} />

        <View className='mt-3'>
          <Text className='mb-2 block text-[13px] font-medium text-inkText-1'>连接处衔接方式</Text>
          <Segmented
            value={spec.jointMode ?? 'direct'}
            onChange={store.setJointMode}
            options={[
              { value: 'direct', label: '直接接触' },
              { value: 'spacer', label: '隔圈' },
              { value: 'ring', label: '连接环' },
              { value: 'knot', label: '绳结' },
              { value: 'crimp', label: '定位珠' },
            ]}
          />
        </View>

        <View className='mt-3'>
          <Text className='mb-2 block text-[13px] font-medium text-inkText-1'>扣具 / 闭合</Text>
          <Segmented
            value={spec.claspType ?? 'magnet'}
            onChange={store.setClaspType}
            options={[
              { value: 'magnet', label: '磁吸扣' },
              { value: 'spring', label: '弹簧扣' },
              { value: 'knot', label: '绳结扣' },
              { value: 'none', label: '无扣' },
            ]}
          />
        </View>

        <View className='mt-3 rounded-card border border-white/10 bg-white/5 p-3'>
          <AnchorEditor anchors={spec.anchors ?? []} pool={anchorPool} onAdd={store.addAnchor} onRemove={store.removeAnchor} />
        </View>
      </View>

      <View className='fixed bottom-0 left-0 right-0 flex gap-3 bg-ink-panel/95 px-5 py-3 backdrop-blur'>
        <View onClick={store.reseed} className='rounded-btn border border-white/15 bg-white/5 py-3 text-center text-[15px] text-inkText-1'>
          换一批
        </View>
        <View onClick={onGenerate} className='flex-1 rounded-btn bg-gold-1 py-3 text-center text-[15px] font-medium text-ink-deep'>
          一键生成 → 进设计器
        </View>
      </View>
    </View>
  )
}
