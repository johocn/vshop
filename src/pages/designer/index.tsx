import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import { useLoad, showToast, navigateTo } from '@tarojs/taro'
import { useDesignerStore } from '../../store/designer-store'
import { renderBracelet, SpriteCache, deriveBracelet } from '../../engine'
import { buildCanvasFactory, getCanvas2D } from '../../utils/canvas'
import { WristSlider, EaseSegmented, DiameterPicker, LayoutModes } from '../../components/controls'
import { MaterialDrawer } from '../../components/material-drawer'
import { PriceBar } from '../../components/price-bar'
import { Segmented, SliderRow } from '../../components/generator-controls'

export default function DesignerPage() {
  const { spec, materials, loaded, load } = useDesignerStore()
  const setWristMm = useDesignerStore((s) => s.setWristMm)
  const setEase = useDesignerStore((s) => s.setEase)
  const setDiameter = useDesignerStore((s) => s.setDiameter)
  const setLayoutMode = useDesignerStore((s) => s.setLayoutMode)
  const setMain = useDesignerStore((s) => s.setMain)
  const setSecondary = useDesignerStore((s) => s.setSecondary)
  const setFocal = useDesignerStore((s) => s.setFocal)
  const toggleSpacer = useDesignerStore((s) => s.toggleSpacer)
  const setSpacerId = useDesignerStore((s) => s.setSpacerId)
  const setRotation = useDesignerStore((s) => s.setRotation)
  const setViewTilt = useDesignerStore((s) => s.setViewTilt)
  const setSizeVariation = useDesignerStore((s) => s.setSizeVariation)
  const setJointMode = useDesignerStore((s) => s.setJointMode)
  const setClaspType = useDesignerStore((s) => s.setClaspType)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const canvasRef = useRef<{ ctx: CanvasRenderingContext2D; width: number; height: number } | null>(null)
  const cacheRef = useRef<SpriteCache | null>(null)
  const lastTouch = useRef({ x: 0, y: 0 })

  useLoad(() => {
    load()
  })

  const { calc, sequence, bom, lookup, mainMaterial: mainMat } = useMemo(
    () => deriveBracelet(spec),
    [spec],
  )
  const diameters = mainMat?.availableDiameters ?? [spec.diameter]

  useEffect(() => {
    getCanvas2D('bracelet', (c) => {
      canvasRef.current = c
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready || !canvasRef.current || !mainMat) return
    const { ctx, width, height } = canvasRef.current
    if (!cacheRef.current) cacheRef.current = new SpriteCache(buildCanvasFactory())
    renderBracelet(ctx, width, height, {
      sequence,
      lookup,
      spec,
      calc,
      background: true,
      showScale: true,
      spriteCache: cacheRef.current,
    })
  }, [ready, sequence, lookup, spec, calc, mainMat])

  const onTouchStart = (e: any) => {
    lastTouch.current = { x: e.touches[0].x, y: e.touches[0].y }
  }
  const onTouchMove = (e: any) => {
    const t = e.touches[0]
    const dx = t.x - lastTouch.current.x
    const dy = t.y - lastTouch.current.y
    lastTouch.current = { x: t.x, y: t.y }
    const s = useDesignerStore.getState()
    s.setRotation(s.spec.rotation + dx * 0.01)
    s.setViewTilt(s.spec.viewTilt - dy * 0.004)
  }

  if (!loaded) {
    return (
      <View className='flex min-h-screen items-center justify-center bg-ink-deep'>
        <Text className='text-inkText-2'>加载中…</Text>
      </View>
    )
  }

  return (
    <View className='flex min-h-screen flex-col bg-ink-deep pb-24'>
      <View className='flex items-center justify-between px-5 pt-12'>
        <Text className='text-[22px] font-semibold text-inkText-1'>我的手串</Text>
        <View className='flex gap-2'>
          <View
            onClick={() => navigateTo({ url: '/pages/works/index' })}
            className='rounded-btn border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] text-inkText-1'
          >
            作品
          </View>
          <View
            onClick={() => navigateTo({ url: '/pages/generator/index' })}
            className='rounded-btn border border-gold-1/40 bg-gold-1/10 px-4 py-1.5 text-[13px] text-gold-2'
          >
            智能生成
          </View>
          <View
            onClick={() => setDrawerOpen(true)}
            className='rounded-btn border border-gold-1/40 bg-gold-1/10 px-4 py-1.5 text-[13px] text-gold-2'
          >
            选材质
          </View>
        </View>
      </View>

      <View className='relative mt-3 w-full' style={{ height: '340px' }}>
        <Canvas
          type='2d'
          id='bracelet'
          className='h-full w-full'
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
        />
        <View
          className='absolute right-3 top-3 rounded-pill bg-gold-1/20 px-3 py-1 text-[12px] text-gold-2'
          onClick={() => showToast({ title: '立体预览即将上线', icon: 'none' })}
        >
          看立体效果 ›
        </View>
        <View
          className={`absolute left-3 top-3 rounded-pill px-3 py-1 text-[12px] ${
            calc.fitStatus === 'ok'
              ? 'bg-func-success/20 text-func-success'
              : 'bg-func-warn/20 text-func-warn'
          }`}
        >
          {calc.feedback}
        </View>
      </View>

      <View className='m-4 rounded-card border border-white/10 bg-ink-panel/80 p-4'>
        <WristSlider value={spec.wristSize} onChange={setWristMm} />
        <View className='my-4 h-px bg-white/10' />
        <Text className='mb-2 block text-[13px] text-inkText-2'>松量</Text>
        <EaseSegmented value={spec.ease} onChange={setEase} />
        <View className='my-4 h-px bg-white/10' />
        <Text className='mb-2 block text-[13px] text-inkText-2'>直径（mm）</Text>
        <DiameterPicker diameters={diameters} value={spec.diameter} onChange={setDiameter} />
        <View className='my-4 h-px bg-white/10' />
        <Text className='mb-2 block text-[13px] text-inkText-2'>图案</Text>
        <LayoutModes value={spec.layoutMode} onChange={setLayoutMode} />
        {spec.layoutMode === 'focal' && (
          <View className='mt-3'>
            <Text className='mb-2 block text-[12px] text-inkText-2'>焦点主珠（点“选材质”在金属/蜜蜡中选择）</Text>
          </View>
        )}
      </View>

      <View className='m-4 rounded-card border border-white/10 bg-ink-panel/80 p-4'>
        <Text className='mb-2 block text-[14px] font-medium text-inkText-1'>生成参数（来自生成器）</Text>
        <SliderRow
          label='珠子尺寸随机波动'
          value={Math.round((spec.sizeVariation ?? 0) * 100)}
          min={0}
          max={100}
          step={5}
          onChange={(v) => setSizeVariation(v / 100)}
          format={(v) => `${v}%`}
        />
        <View className='my-2 h-px bg-white/10' />
        <Text className='mb-2 block text-[13px] text-inkText-2'>连接处衔接</Text>
        <Segmented
          value={spec.jointMode ?? 'direct'}
          onChange={setJointMode}
          options={[
            { value: 'direct', label: '直接' },
            { value: 'spacer', label: '隔圈' },
            { value: 'ring', label: '连接环' },
            { value: 'knot', label: '绳结' },
            { value: 'crimp', label: '定位珠' },
          ]}
        />
        <View className='my-2 h-px bg-white/10' />
        <Text className='mb-2 block text-[13px] text-inkText-2'>扣具 / 闭合</Text>
        <Segmented
          value={spec.claspType ?? 'magnet'}
          onChange={setClaspType}
          options={[
            { value: 'magnet', label: '磁吸' },
            { value: 'spring', label: '弹簧' },
            { value: 'knot', label: '绳结' },
            { value: 'none', label: '无扣' },
          ]}
        />
        {spec.presetTemplateId && (
          <Text className='mt-3 block text-[12px] text-inkText-2'>已套用模板：{spec.presetTemplateId}</Text>
        )}
        {(spec.anchors?.length ?? 0) > 0 && (
          <Text className='mt-1 block text-[12px] text-inkText-2'>已锚定 {spec.anchors?.length} 处珠子（可在生成器编辑）</Text>
        )}
      </View>

      <PriceBar totalAmount={bom.totalAmount} totalCount={bom.totalCount} onViewBom={() => navigateTo({ url: '/pages/bom/index' })} />

      {drawerOpen && (
        <MaterialDrawer
          materials={materials}
          selectedMainId={spec.mainMaterialId}
          secondaryId={spec.secondaryMaterialId}
          spacerId={spec.spacerId}
          layoutMode={spec.layoutMode}
          spacerEnabled={!!spec.spacerEnabled}
          onSelectMain={setMain}
          onSelectSecondary={(id) => setSecondary(id || undefined)}
          onToggleSpacer={toggleSpacer}
          onSelectSpacer={(id) => setSpacerId(id)}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </View>
  )
}
