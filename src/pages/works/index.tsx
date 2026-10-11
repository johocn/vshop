import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useLoad, navigateTo, navigateBack, showToast } from '@tarojs/taro'
import { useDesignerStore } from '../../store/designer-store'
import { deriveBracelet } from '../../engine'
import { loadWorks, saveWork, deleteWork } from '../../utils/works'
import type { WorkRecord } from '../../types'

export default function WorksPage() {
  const { spec, materials, loaded, load, applySpec } = useDesignerStore()
  const [works, setWorks] = useState<WorkRecord[]>([])
  const [saving, setSaving] = useState(false)

  useLoad(() => {
    load()
    setWorks(loadWorks())
  })

  const currentDerived = useMemo(() => deriveBracelet(spec), [spec])

  const openWork = (w: WorkRecord) => {
    applySpec(w.spec)
    navigateBack()
  }

  const onSaveCurrent = async () => {
    if (saving) return
    setSaving(true)
    try {
      const record = await saveWork(spec, currentDerived.bom.totalAmount, materials)
      setWorks(loadWorks())
      showToast({ title: record.planId ? '已保存（含云端方案）' : '已本地保存', icon: 'success' })
    } finally {
      setSaving(false)
    }
  }

  const onDelete = (id: string) => {
    deleteWork(id)
    setWorks(loadWorks())
  }

  return (
    <View className='flex min-h-screen flex-col bg-ink-deep pb-24'>
      <View className='flex items-center justify-between px-5 pt-12'>
        <Text className='text-[20px] font-semibold text-inkText-1'>我的作品</Text>
        <View onClick={() => navigateTo({ url: '/pages/designer/index' })} className='text-[14px] text-gold-2'>
          + 新设计
        </View>
      </View>

      <View className='flex-1 px-4 pt-4'>
        {works.length === 0 && (
          <View className='mt-20 text-center text-[14px] text-inkText-2'>
            还没有保存的作品，去设计器完成第一串手串吧
          </View>
        )}
        <View className='flex flex-wrap gap-3'>
          {works.map((w) => (
            <View key={w.id} className='w-[47%] rounded-card border border-white/10 bg-ink-panel p-4'>
              <Text className='block text-[15px] text-inkText-1'>{w.name}</Text>
              <Text className='mt-1 block text-[12px] text-inkText-2'>
                手围 {(w.spec.wristSize / 10).toFixed(1)}cm · {w.spec.diameter}mm
              </Text>
              <Text className='mt-2 block text-[18px] font-semibold text-gold-2'>¥{w.totalAmount.toFixed(1)}</Text>
              <View className='mt-3 flex gap-2'>
                <View
                  onClick={() => openWork(w)}
                  className='flex-1 rounded-btn bg-gold-1/20 py-1.5 text-center text-[12px] text-gold-2'
                >
                  打开
                </View>
                <View
                  onClick={() => onDelete(w.id)}
                  className='rounded-btn border border-white/15 px-3 py-1.5 text-center text-[12px] text-inkText-2'
                >
                  删
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className='fixed bottom-0 left-0 right-0 bg-ink-panel/95 px-5 py-3 backdrop-blur'>
        <View
          onClick={onSaveCurrent}
          className='w-full rounded-btn bg-gold-1 py-3 text-center text-[15px] font-medium text-ink-deep'
        >
          保存当前设计
        </View>
      </View>
    </View>
  )
}
