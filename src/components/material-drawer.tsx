import { View, Text } from '@tarojs/components'
import type { BeadMaterial, BeadCategory, LayoutMode } from '../types'
import { lighten, darken, rgba } from '../engine/color'

const CATEGORIES: { key: BeadCategory; label: string }[] = [
  { key: 'crystal', label: '水晶' },
  { key: 'agate', label: '玛瑙' },
  { key: 'wood', label: '木质' },
  { key: 'amber', label: '蜜蜡' },
  { key: 'pearl', label: '珍珠' },
  { key: 'metal', label: '金属' },
  { key: 'spacer', label: '隔片' },
]

/** 用 CSS 径向渐变模拟珠子缩略图（快速、无需逐卡 canvas） */
function beadThumbStyle(m: BeadMaterial): Record<string, string> {
  const top = lighten(m.renderSpec.baseColor, 0.35)
  const bottom = darken(m.renderSpec.baseColor, 0.25)
  return {
    background: `radial-gradient(circle at 35% 30%, ${top} 0%, ${m.renderSpec.baseColor} 45%, ${bottom} 100%)`,
    boxShadow: `inset -2px -3px 6px ${rgba(m.renderSpec.shadowColor, 0.6)}, inset 2px 2px 5px ${rgba('#ffffff', 0.18)}`,
  }
}

interface MaterialDrawerProps {
  materials: BeadMaterial[]
  selectedMainId: string
  secondaryId?: string
  spacerId?: string
  layoutMode: LayoutMode
  spacerEnabled: boolean
  onSelectMain: (id: string) => void
  onSelectSecondary: (id: string) => void
  onToggleSpacer: () => void
  onSelectSpacer: (id: string) => void
  onClose: () => void
}

export function MaterialDrawer(props: MaterialDrawerProps) {
  const { materials, selectedMainId, secondaryId, spacerId, layoutMode, spacerEnabled } = props
  // 主珠候选：排除隔片（隔片单独设置）
  const mainPool = materials.filter((m) => m.category !== 'spacer')
  const spacers = materials.filter((m) => m.category === 'spacer')

  return (
    <View className='fixed inset-0 z-30'>
      <View className='absolute inset-0 bg-black/50' onClick={props.onClose} />
      <View className='absolute bottom-0 left-0 right-0 max-h-[78vh] overflow-y-auto rounded-t-[20px] border-t border-gold-1/30 bg-ink-panel px-4 pb-8 pt-4'>
        <View className='mx-auto mb-3 h-1 w-10 rounded-full bg-white/20' />

        <View className='mb-3'>
          <Text className='mb-2 block text-[14px] font-medium text-inkText-1'>主珠材质</Text>
          <View className='flex flex-wrap gap-3'>
            {mainPool.map((m) => {
              const active = m.id === selectedMainId
              return (
                <View
                  key={m.id}
                  onClick={() => props.onSelectMain(m.id)}
                  className={`w-[30%] rounded-card border p-2 ${
                    active ? 'border-gold-2 bg-gold-1/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <View className='mx-auto mb-2 h-12 w-12 rounded-full' style={beadThumbStyle(m)} />
                  <Text className='block text-center text-[12px] text-inkText-1'>{m.name}</Text>
                  <Text className='block text-center text-[10px] text-inkText-2'>
                    {m.code} · ¥{m.priceUnit.toFixed(1)}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        <View className='mb-3'>
          <Text className='mb-2 block text-[14px] font-medium text-inkText-1'>次珠材质（AB / 渐变 / 随机）</Text>
          <View className='flex flex-wrap gap-3'>
            <View
              onClick={() => props.onSelectSecondary('')}
              className={`rounded-card border px-3 py-2 text-[12px] ${
                !secondaryId ? 'border-gold-2 bg-gold-1/15 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
              }`}
            >
              无
            </View>
            {mainPool.map((m) => {
              const active = m.id === secondaryId
              return (
                <View
                  key={m.id}
                  onClick={() => props.onSelectSecondary(m.id)}
                  className={`flex items-center gap-2 rounded-card border px-2 py-1 ${
                    active ? 'border-gold-2 bg-gold-1/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <View className='h-6 w-6 rounded-full' style={beadThumbStyle(m)} />
                  <Text className='text-[11px] text-inkText-1'>{m.name}</Text>
                </View>
              )
            })}
          </View>
        </View>

        <View className='mb-3'>
          <Text className='mb-2 block text-[14px] font-medium text-inkText-1'>隔片</Text>
          <View
            onClick={props.onToggleSpacer}
            className={`mb-2 inline-block rounded-btn border px-3 py-1.5 text-[12px] ${
              spacerEnabled ? 'border-gold-2 bg-gold-1/15 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
            }`}
          >
            {spacerEnabled ? '已开启隔片' : '关闭隔片'}
          </View>
          {spacerEnabled && (
            <View className='flex flex-wrap gap-3'>
              {spacers.map((m) => {
                const active = m.id === spacerId
                return (
                  <View
                    key={m.id}
                    onClick={() => props.onSelectSpacer(m.id)}
                    className={`flex items-center gap-2 rounded-card border px-2 py-1 ${
                      active ? 'border-gold-2 bg-gold-1/15' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <View className='h-6 w-6 rounded-full' style={beadThumbStyle(m)} />
                    <Text className='text-[11px] text-inkText-1'>{m.name}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        <View className='flex justify-end'>
          <View onClick={props.onClose} className='rounded-btn bg-gold-1 px-6 py-2 text-[14px] text-ink-deep'>
            完成
          </View>
        </View>
      </View>
    </View>
  )
}
