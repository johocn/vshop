import { useMemo } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import { useLoad, navigateTo, navigateBack, showToast } from '@tarojs/taro'
import { useDesignerStore } from '../../store/designer-store'
import { deriveBracelet } from '../../engine'

export default function BomPage() {
  const { spec, materials, loaded, load } = useDesignerStore()
  useLoad(() => {
    load()
  })

  const derived = useMemo(() => deriveBracelet(spec, materials), [spec, materials])

  if (!loaded) {
    return (
      <View className='flex min-h-screen items-center justify-center bg-ink-deep'>
        <Text className='text-inkText-2'>加载中…</Text>
      </View>
    )
  }

  const { bom, calc } = derived

  return (
    <View className='flex min-h-screen flex-col bg-ink-deep pb-24'>
      <View className='px-5 pt-12'>
        <Text className='text-[20px] font-semibold text-inkText-1'>珠子清单</Text>
      </View>

      {/* 汇总卡 */}
      <View className='m-4 rounded-card border border-gold-1/30 bg-ink-panel p-5'>
        <View className='flex items-end justify-between'>
          <View className='flex flex-col'>
            <Text className='text-[12px] text-inkText-2'>合计 {bom.totalCount} 颗 · {bom.weightG}g</Text>
            <Text className='text-[30px] font-semibold text-gold-2'>¥ {bom.totalAmount.toFixed(1)}</Text>
          </View>
          <View
            className={`rounded-pill px-3 py-1 text-[12px] ${
              calc.fitStatus === 'ok'
                ? 'bg-func-success/20 text-func-success'
                : 'bg-func-warn/20 text-func-warn'
            }`}
          >
            {calc.feedback}
          </View>
        </View>
        <View className='mt-3 border-t border-white/10 pt-3'>
          <Text className='text-[12px] text-inkText-2'>{bom.cordSpec}</Text>
        </View>
      </View>

      {/* 工艺摘要：衔接 / 扣具 */}
      <View className='m-4 flex gap-3'>
        <View className='flex-1 rounded-card border border-white/10 bg-white/5 p-3'>
          <Text className='text-[12px] text-inkText-2'>连接处衔接</Text>
          <Text className='mt-1 block text-[15px] text-inkText-1'>
            {bom.jointCount ?? 0} 处 · 占用 {bom.jointLengthMm ?? 0}mm
          </Text>
        </View>
        <View className='flex-1 rounded-card border border-white/10 bg-white/5 p-3'>
          <Text className='text-[12px] text-inkText-2'>扣具 / 闭合</Text>
          <Text className='mt-1 block text-[15px] text-inkText-1'>
            {({ magnet: '磁吸扣', spring: '弹簧扣', knot: '绳结扣', none: '无扣' } as Record<string, string>)[spec.claspType ?? 'magnet']}
          </Text>
        </View>
      </View>

      {/* 明细 */}
      <ScrollView scrollY className='mx-4 flex-1 rounded-card border border-white/10 bg-ink-panel/70'>
        {bom.items.map((it) => (
          <View
            key={it.code}
            className='flex items-center justify-between border-b border-white/5 px-4 py-3 last:border-b-0'
          >
            <View className='flex flex-col'>
              <Text className='text-[14px] text-inkText-1'>{it.name}</Text>
              <Text className='text-[11px] text-inkText-2'>
                {it.code} · {it.spec}
              </Text>
            </View>
            <View className='flex items-center gap-3'>
              <Text className='text-[13px] text-inkText-2'>
                ¥{it.unitPrice.toFixed(1)} × {it.count}
              </Text>
              <Text className='w-16 text-right text-[14px] text-gold-2'>¥{it.subtotal.toFixed(1)}</Text>
            </View>
          </View>
        ))}
        {bom.items.length === 0 && (
          <View className='px-4 py-8 text-center text-[13px] text-inkText-2'>暂无珠子，请回到设计器选择</View>
        )}
      </ScrollView>

      <View className='fixed bottom-0 left-0 right-0 flex gap-3 bg-ink-panel/95 px-5 py-3 backdrop-blur'>
        <View
          onClick={() => navigateBack()}
          className='flex-1 rounded-btn border border-white/15 bg-white/5 py-3 text-center text-[15px] text-inkText-1'
        >
          返回编辑
        </View>
        <View
          onClick={() => navigateTo({ url: '/pages/export/index' })}
          className='flex-1 rounded-btn bg-gold-1 py-3 text-center text-[15px] font-medium text-ink-deep'
        >
          导出图纸
        </View>
      </View>
    </View>
  )
}
