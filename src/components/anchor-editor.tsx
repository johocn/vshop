import { useState } from 'react'
import { View, Text, Slider } from '@tarojs/components'
import type { BeadAnchor } from '../types'
import { beadThumbStyle, ThumbItem } from './generator-controls'

export function AnchorEditor({
  anchors,
  pool,
  onAdd,
  onRemove,
}: {
  anchors: BeadAnchor[]
  pool: ThumbItem[]
  onAdd: (a: BeadAnchor) => void
  onRemove: (index: number) => void
}) {
  const [refId, setRefId] = useState(pool[0]?.id ?? '')
  const [position, setPosition] = useState(0.5)
  const [role, setRole] = useState<'main' | 'focal' | 'decoration'>('main')

  const selected = pool.find((p) => p.id === refId)

  return (
    <View>
      <Text className='mb-2 block text-[13px] font-medium text-inkText-1'>手动锚定（在指定位置固定珠子/配饰）</Text>

      {/* 已有锚定 */}
      <View className='mb-3 flex flex-col gap-2'>
        {anchors.length === 0 && (
          <Text className='text-[12px] text-inkText-2'>暂无锚定，可在下方添加，或在模板基础上微调。</Text>
        )}
        {anchors.map((a, i) => {
          const item = pool.find((p) => p.id === a.refId)
          return (
            <View key={i} className='flex items-center gap-2 rounded-card border border-white/10 bg-white/5 px-3 py-2'>
              <View className='h-8 w-8 rounded-full' style={item ? beadThumbStyle(item.renderSpec) : {}} />
              <View className='flex-1'>
                <Text className='block text-[12px] text-inkText-1'>{item?.name ?? a.refId}</Text>
                <Text className='block text-[10px] text-inkText-2'>
                  位置 {Math.round((a.position ?? 0) * 100)}% · {a.role ?? 'main'}
                </Text>
              </View>
              <View onClick={() => onRemove(i)} className='rounded-btn border border-white/15 px-3 py-1 text-[12px] text-inkText-2'>
                删
              </View>
            </View>
          )
        })}
      </View>

      {/* 新增锚定 */}
      <View className='rounded-card border border-white/10 bg-white/5 p-3'>
        <Text className='mb-2 block text-[12px] text-inkText-2'>新增锚定</Text>
        <View className='mb-2 flex flex-wrap gap-2'>
          {pool.slice(0, 12).map((p) => (
            <View
              key={p.id}
              onClick={() => setRefId(p.id)}
              className={`flex items-center gap-1 rounded-btn border px-2 py-1 text-[11px] ${
                p.id === refId ? 'border-gold-2 bg-gold-1/15 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
              }`}
            >
              <View className='h-4 w-4 rounded-full' style={beadThumbStyle(p.renderSpec)} />
              <Text>{p.name}</Text>
            </View>
          ))}
        </View>
        <View className='mb-2 flex gap-2'>
          {(['main', 'focal', 'decoration'] as const).map((r) => (
            <View
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-btn border px-3 py-1 text-[12px] ${
                r === role ? 'border-gold-2 bg-gold-1/15 text-gold-2' : 'border-white/10 bg-white/5 text-inkText-2'
              }`}
            >
              {r === 'main' ? '珠子' : r === 'focal' ? '焦点' : '装饰'}
            </View>
          ))}
        </View>
        <View className='mb-2'>
          <View className='mb-1 flex justify-between'>
            <Text className='text-[12px] text-inkText-2'>位置</Text>
            <Text className='text-[12px] text-gold-2'>{Math.round(position * 100)}%</Text>
          </View>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={position}
            activeColor='#C99A30'
            backgroundColor='#3A2A1B'
            onChange={(e: any) => setPosition(e.detail.value)}
          />
        </View>
        <View
          onClick={() => refId && onAdd({ position, refId, role })}
          className='rounded-btn bg-gold-1/80 py-2 text-center text-[13px] font-medium text-ink-deep'
        >
          添加锚定
        </View>
      </View>
    </View>
  )
}
