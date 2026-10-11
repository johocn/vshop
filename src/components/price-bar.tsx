import { View, Text } from '@tarojs/components'

interface PriceBarProps {
  totalAmount: number
  totalCount: number
  onViewBom: () => void
}

export function PriceBar({ totalAmount, totalCount, onViewBom }: PriceBarProps) {
  return (
    <View className='fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-white/10 bg-ink-panel/95 px-5 py-3 backdrop-blur'>
      <View className='flex flex-col'>
        <Text className='text-[12px] text-inkText-2'>共 {totalCount} 颗 · 预估</Text>
        <Text className='text-[22px] font-semibold text-gold-2'>¥ {totalAmount.toFixed(1)}</Text>
      </View>
      <View
        onClick={onViewBom}
        className='rounded-btn bg-gold-1 px-8 py-3 text-[15px] font-medium text-ink-deep'
      >
        查看清单
      </View>
    </View>
  )
}
