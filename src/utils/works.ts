import Taro from '@tarojs/taro'
import type { WorkRecord, BraceletSpec, BeadMaterial } from '../types'
import { createDiyPlan } from '../api/plans'

const KEY = 'bead-works'

export function loadWorks(): WorkRecord[] {
  try {
    return Taro.getStorageSync(KEY) || []
  } catch {
    return []
  }
}

/** 保存作品：同时匿名创建云端方案（失败不阻断本地存档），planId 附到记录上 */
export async function saveWork(spec: BraceletSpec, totalAmount: number, materials: BeadMaterial[]): Promise<WorkRecord> {
  let planId: string | undefined
  try {
    planId = (await createDiyPlan(spec, materials)).id
  } catch {
    /* 云端不可用（未启动/网络失败）→ 仅本地存档 */
  }
  const list = loadWorks()
  const record: WorkRecord = {
    id: String(Date.now()),
    name: `手串 ${list.length + 1}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    spec: { ...spec },
    totalAmount,
    planId,
  }
  list.unshift(record)
  try {
    Taro.setStorageSync(KEY, list)
  } catch {
    /* 忽略存储异常 */
  }
  return record
}

export function deleteWork(id: string): void {
  const list = loadWorks().filter((w) => w.id !== id)
  try {
    Taro.setStorageSync(KEY, list)
  } catch {
    /* 忽略 */
  }
}
