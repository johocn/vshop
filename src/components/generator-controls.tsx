import { View, Text, ScrollView, Slider } from '@tarojs/components'
import type { RenderSpec } from '../types'
import { lighten, darken, rgba } from '../engine/color'

export interface ThumbItem {
  id: string
  name: string
  renderSpec: RenderSpec
  sub?: string
}

/** 用 CSS 径向渐变模拟珠子/配件缩略图（快速、无需逐卡 canvas） */
export function beadThumbStyle(spec: RenderSpec): Record<string, string> {
  const top = lighten(spec.baseColor, 0.35)
  const bottom = darken(spec.baseColor, 0.25)
  return {
    background: `radial-gradient(circle at 35% 30%, ${top} 0%, ${spec.baseColor} 45%, ${bottom} 100%)`,
    boxShadow: `inset -2px -3px 6px ${rgba(spec.shadowColor, 0.6)}, inset 2px 2px 5px ${rgba('#ffffff', 0.18)}`,
  }
}

export function TemplateChips({
  templates,
  activeId,
  onPick,
}: {
  templates: { id: string; name: string; description: string }[]
  activeId?: string
  onPick: (id: string) => void
}) {
  return (
    <ScrollView scrollX className='whitespace-nowrap'>
      <View className='flex gap-2 pb-1'>
        {templates.map((t) => {
          const active = t.id === activeId
          return (
            <View
              key={t.id}
              onClick={() => onPick(t.id)}
              className={`inline-block w-[120px] shrink-0 rounded-card border px-3 py-2 ${
                active ? 'border-gold-2 bg-gold-1/15' : 'border-white/10 bg-white/5'
              }`}
            >
              <Text className={`block text-[13px] font-medium ${active ? 'text-gold-2' : 'text-inkText-1'}`}>{t.name}</Text>
              <Text className='mt-1 block text-[10px] leading-tight text-inkText-2'>{t.description}</Text>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View className='flex flex-wrap gap-2'>
      {options.map((o) => {
        const active = o.value === value
        return (
          <View
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-btn border px-3 py-1.5 text-[12px] ${
              active ? 'border-gold-2 bg-gold-1/15 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
            }`}
          >
            {o.label}
          </View>
        )
      })}
    </View>
  )
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <View className='mb-1'>
      <View className='mb-1 flex items-center justify-between'>
        <Text className='text-[13px] text-inkText-2'>{label}</Text>
        <Text className='text-[13px] text-gold-2'>{format ? format(value) : value}</Text>
      </View>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        activeColor='#C99A30'
        backgroundColor='#3A2A1B'
        onChange={(e: any) => onChange(e.detail.value)}
      />
    </View>
  )
}

export function MaterialGrid({
  items,
  selectedIds,
  onToggle,
}: {
  items: ThumbItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <View className='flex flex-wrap gap-2'>
      {items.map((m) => {
        const active = selectedIds.includes(m.id)
        return (
          <View
            key={m.id}
            onClick={() => onToggle(m.id)}
            className={`w-[23%] rounded-card border p-2 ${active ? 'border-gold-2 bg-gold-1/15' : 'border-white/10 bg-white/5'}`}
          >
            <View className='mx-auto mb-1 h-10 w-10 rounded-full' style={beadThumbStyle(m.renderSpec)} />
            <Text className='block text-center text-[10px] leading-tight text-inkText-1'>{m.name}</Text>
            {m.sub && <Text className='block text-center text-[9px] text-inkText-2'>{m.sub}</Text>}
          </View>
        )
      })}
    </View>
  )
}

export function PoolSection({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string
  items: ThumbItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <View className='mt-3'>
      <Text className='mb-2 block text-[13px] font-medium text-inkText-1'>{title}</Text>
      <MaterialGrid items={items} selectedIds={selectedIds} onToggle={onToggle} />
    </View>
  )
}
