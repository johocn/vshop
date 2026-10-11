import { View, Text, Slider } from '@tarojs/components'
import type { EaseLevel, LayoutMode } from '../types'

interface WristSliderProps {
  value: number // mm
  onChange: (mm: number) => void
}

export function WristSlider({ value, onChange }: WristSliderProps) {
  return (
    <View className='w-full'>
      <View className='mb-2 flex items-center justify-between'>
        <Text className='text-[13px] text-inkText-2'>手围</Text>
        <Text className='text-[16px] font-semibold text-gold-2'>{(value / 10).toFixed(1)} cm</Text>
      </View>
      <Slider
        min={120}
        max={220}
        step={1}
        value={value}
        blockColor='#C89B3C'
        activeColor='#C89B3C'
        backgroundColor='#3A2F27'
        onChange={(e) => onChange(e.detail.value)}
      />
      <View className='mt-1 flex justify-between'>
        <Text className='text-[11px] text-inkText-2'>12.0</Text>
        <Text className='text-[11px] text-inkText-2'>22.0</Text>
      </View>
    </View>
  )
}

const EASE_OPTIONS: { key: EaseLevel; label: string }[] = [
  { key: 'snug', label: '贴手' },
  { key: 'comfort', label: '舒适' },
  { key: 'loose', label: '宽松' },
]

interface EaseSegmentedProps {
  value: EaseLevel
  onChange: (e: EaseLevel) => void
}

export function EaseSegmented({ value, onChange }: EaseSegmentedProps) {
  return (
    <View className='flex gap-2'>
      {EASE_OPTIONS.map((o) => {
        const active = o.key === value
        return (
          <View
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 rounded-btn border py-2 text-center text-[13px] ${
              active
                ? 'border-gold-1 bg-gold-1/15 text-gold-2'
                : 'border-white/10 bg-white/5 text-inkText-2'
            }`}
          >
            {o.label}
          </View>
        )
      })}
    </View>
  )
}

interface DiameterPickerProps {
  diameters: number[]
  value: number
  onChange: (d: number) => void
}

export function DiameterPicker({ diameters, value, onChange }: DiameterPickerProps) {
  return (
    <View className='flex flex-wrap gap-2'>
      {diameters.map((d) => {
        const active = d === value
        return (
          <View
            key={d}
            onClick={() => onChange(d)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-[13px] ${
              active ? 'border-gold-2 bg-gold-1/20 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
            }`}
          >
            {d}
          </View>
        )
      })}
    </View>
  )
}

const LAYOUT_OPTIONS: { key: LayoutMode; label: string }[] = [
  { key: 'solid', label: '单色' },
  { key: 'ab', label: 'AB' },
  { key: 'gradient', label: '渐变' },
  { key: 'random', label: '随机' },
  { key: 'focal', label: '焦点' },
]

interface LayoutModesProps {
  value: LayoutMode
  onChange: (m: LayoutMode) => void
}

export function LayoutModes({ value, onChange }: LayoutModesProps) {
  return (
    <View className='flex gap-2'>
      {LAYOUT_OPTIONS.map((o) => {
        const active = o.key === value
        return (
          <View
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 rounded-btn border py-2 text-center text-[12px] ${
              active ? 'border-gold-1 bg-gold-1/15 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
            }`}
          >
            {o.label}
          </View>
        )
      })}
    </View>
  )
}
