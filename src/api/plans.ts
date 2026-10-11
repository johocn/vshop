import { gql } from './client'
import type { BeadMaterial, BraceletSpec } from '../types'

export const BRACELET_TEMPLATE_CODE = 'bracelet-classic'

export interface DiyPlanSlotSelection {
  materialId: string
  every?: number
}

export interface DiyPlanSpecPayload {
  slots: Record<string, DiyPlanSlotSelection>
  params: Record<string, number | string>
  seed?: number
}

/** 取材质的变体 SKU id：指定直径命中用之；无 variants（mock）回退组 id */
function skuId(m: BeadMaterial | undefined, diameter?: number): string | null {
  if (!m) return null
  const v = diameter != null ? m.variants?.[String(diameter)] : undefined
  return v?.id ?? (m.variants ? Object.values(m.variants)[0]?.id ?? null : m.id)
}

/** BraceletSpec + 材质库 → DiyPlanSpec（后端 createDiyPlan 入参；与 calc-bridge 槽位语义对齐） */
export function toPlanSpec(spec: BraceletSpec, materials: BeadMaterial[]): DiyPlanSpecPayload {
  const find = (id?: string) => (id ? materials.find((m) => m.id === id) : undefined)
  const slots: Record<string, DiyPlanSlotSelection> = {}
  const mainId = skuId(find(spec.mainMaterialId), spec.diameter)
  if (!mainId) throw new Error('主珠素材不可用，无法保存方案')
  slots.main = { materialId: mainId }
  if (spec.layoutMode === 'focal') {
    const focal = find(spec.focalId)
    const fid = skuId(focal, focal?.beadDiameter)
    if (fid) slots.focal = { materialId: fid }
  }
  if (spec.spacerEnabled) {
    const spacer = find(spec.spacerId)
    const sid = skuId(spacer, spacer?.beadDiameter)
    if (sid) slots.spacer = { materialId: sid, every: Math.max(1, spec.spacerEvery ?? 2) }
  }
  return {
    slots,
    params: { wristSize: spec.wristSize, fit: spec.ease, gap: spec.gap },
    seed: spec.seed,
  }
}

export interface SavedPlan {
  id: string
  status: string
}

const CREATE_DIY_PLAN_MUTATION = `
  mutation($templateCode: String!, $spec: JSON!, $thumb: String) {
    createDiyPlan(templateCode: $templateCode, spec: $spec, thumb: $thumb) { id status }
  }
`

/** 匿名保存方案（Public mutation）：后端复算 BOM 并落 draft，返回 plan id */
export async function createDiyPlan(spec: BraceletSpec, materials: BeadMaterial[]): Promise<SavedPlan> {
  const data = await gql<{ createDiyPlan: SavedPlan }>(CREATE_DIY_PLAN_MUTATION, {
    templateCode: BRACELET_TEMPLATE_CODE,
    spec: toPlanSpec(spec, materials),
    thumb: null,
  })
  return data.createDiyPlan
}
