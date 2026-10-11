import beadsRaw from './beads.mock.json'
import accessoriesRaw from './accessories.mock.json'
import { PRESET_TEMPLATES, getTemplate } from './templates'
import { gql } from '../api/client'
import { DIY_CATEGORIES_QUERY, DIY_MATERIALS_QUERY } from '../api/documents'
import type { BeadMaterial, AccessorySpec, ResolvedItem, PresetTemplate, ClaspType } from '../types'
import { DiyCategoryDTO, DiyMaterialDTO, groupMaterials } from './mapper'

/**
 * 本地 mock 转领域模型。
 * 注意：JSON 字段需与 BeadMaterial / AccessorySpec 完全一致；此处用类型断言完成转换。
 */
const BEADS = beadsRaw as unknown as BeadMaterial[]
const ACCESSORIES = accessoriesRaw as unknown as AccessorySpec[]

/** 珠子数据访问接口：业务层只依赖该抽象，不关心数据来源 */
export interface BeadRepository {
  listMaterials(): Promise<BeadMaterial[]>
  getMaterial(id: string): Promise<BeadMaterial | undefined>
  getByCode(code: string): Promise<BeadMaterial | undefined>
  priceOf(id: string): Promise<number>
  /** 配件（扣 / 吊坠 / 隔圈 / 连接环 / 佛头 / 流苏） */
  listAccessories(): Promise<AccessorySpec[]>
  /** 内置模板 */
  listTemplates(): Promise<PresetTemplate[]>
  getTemplate(id: string): PresetTemplate | undefined
  /** 珠子 + 配件的统一视图，便于生成器/BOM/渲染共用 */
  resolveItems(): Promise<ResolvedItem[]>
  /** 同步版本（本地库已就绪，供 derive 在 useMemo 中直接调用） */
  resolveItemsSync(): ResolvedItem[]
  getResolved(id: string): Promise<ResolvedItem | undefined>
  /** 扣具类型 → 扣具配件 id */
  claspAccessoryId(claspType: ClaspType): string | undefined
}

function toResolvedBead(b: BeadMaterial): ResolvedItem {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    category: b.category,
    shape: b.shape,
    beadDiameter: b.beadDiameter,
    beadLength: b.beadLength,
    holeSize: b.holeSize,
    availableDiameters: b.availableDiameters,
    priceUnit: b.priceUnit,
    renderSpec: b.renderSpec,
    weightPerBead: b.weightPerBead ?? 0,
    isAccessory: false,
  }
}

function toResolvedAccessory(a: AccessorySpec): ResolvedItem {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    shape: 'round',
    beadDiameter: a.beadDiameter,
    beadLength: a.beadLength,
    holeSize: 1.0,
    availableDiameters: [a.beadDiameter],
    priceUnit: a.priceUnit,
    renderSpec: a.renderSpec,
    weightPerBead: a.weightPerBead,
    isAccessory: true,
    accessoryType: a.type,
  }
}

/**
 * 本地实现：直接返回内置 mock（单元测试 / 离线回退用）。
 */
export class LocalBeadRepository implements BeadRepository {
  private _items: ResolvedItem[] = [...BEADS.map(toResolvedBead), ...ACCESSORIES.map(toResolvedAccessory)]
  private _byId = new Map(this._items.map((i) => [i.id, i]))

  async listMaterials(): Promise<BeadMaterial[]> {
    return BEADS.map((b) => ({ ...b }))
  }

  async getMaterial(id: string): Promise<BeadMaterial | undefined> {
    return BEADS.find((b) => b.id === id)
  }

  async getByCode(code: string): Promise<BeadMaterial | undefined> {
    return BEADS.find((b) => b.code === code)
  }

  async priceOf(id: string): Promise<number> {
    const m = await this.getMaterial(id)
    return m?.priceUnit ?? 0
  }

  async listAccessories(): Promise<AccessorySpec[]> {
    return ACCESSORIES.map((a) => ({ ...a }))
  }

  async listTemplates(): Promise<PresetTemplate[]> {
    return PRESET_TEMPLATES.map((t) => ({ ...t }))
  }

  getTemplate(id: string): PresetTemplate | undefined {
    return getTemplate(id)
  }

  async resolveItems(): Promise<ResolvedItem[]> {
    return this._items.map((i) => ({ ...i }))
  }

  resolveItemsSync(): ResolvedItem[] {
    return this._items
  }

  async getResolved(id: string): Promise<ResolvedItem | undefined> {
    const found = this._byId.get(id)
    return found ? { ...found } : undefined
  }

  claspAccessoryId(claspType: ClaspType): string | undefined {
    switch (claspType) {
      case 'magnet':
        return 'clasp-magnet'
      case 'spring':
        return 'clasp-spring'
      case 'knot':
        return 'clasp-knot'
      default:
        return undefined
    }
  }
}

/** 远程实现：Vendure shop-api（diyCategories + diyMaterials），按 attrs.group 聚合后内存缓存 */
class RemoteBeadRepository implements BeadRepository {
  private cache: BeadMaterial[] | null = null

  private async all(): Promise<BeadMaterial[]> {
    if (this.cache) return this.cache
    const [mats, cats] = await Promise.all([
      gql<{ diyMaterials: { items: DiyMaterialDTO[] } }>(DIY_MATERIALS_QUERY, { take: 500 }),
      gql<{ diyCategories: DiyCategoryDTO[] }>(DIY_CATEGORIES_QUERY),
    ])
    const catCodeById = new Map<number, string>()
    for (const c of cats.diyCategories) {
      if (c.code) catCodeById.set(Number(c.id), c.code)
    }
    this.cache = groupMaterials(mats.diyMaterials.items, catCodeById)
    return this.cache
  }

  async listMaterials(): Promise<BeadMaterial[]> {
    return (await this.all()).map((m) => ({ ...m, renderSpec: { ...m.renderSpec } }))
  }

  async getMaterial(id: string): Promise<BeadMaterial | undefined> {
    const m = (await this.all()).find((b) => b.id === id)
    return m ? { ...m, renderSpec: { ...m.renderSpec } } : undefined
  }

  async getByCode(code: string): Promise<BeadMaterial | undefined> {
    const m = (await this.all()).find((b) => b.code === code)
    return m ? { ...m, renderSpec: { ...m.renderSpec } } : undefined
  }

  async priceOf(id: string): Promise<number> {
    return (await this.getMaterial(id))?.priceUnit ?? 0
  }

  // —— 配件 / 模板 / 统一视图：后端 diy-plugin 本期只覆盖珠子分类与材质，配件仍走内置 mock ——

  async listAccessories(): Promise<AccessorySpec[]> {
    return ACCESSORIES.map((a) => ({ ...a }))
  }

  async listTemplates(): Promise<PresetTemplate[]> {
    return PRESET_TEMPLATES.map((t) => ({ ...t }))
  }

  getTemplate(id: string): PresetTemplate | undefined {
    return getTemplate(id)
  }

  async resolveItems(): Promise<ResolvedItem[]> {
    const beads = await this.listMaterials()
    return [...beads.map(toResolvedBead), ...ACCESSORIES.map(toResolvedAccessory)]
  }

  /** 同步视图：远程珠子缓存未就绪时仅含配件；珠子统一经 listMaterials 异步加载 */
  resolveItemsSync(): ResolvedItem[] {
    const beads = this.cache ?? []
    return [...beads.map(toResolvedBead), ...ACCESSORIES.map(toResolvedAccessory)]
  }

  async getResolved(id: string): Promise<ResolvedItem | undefined> {
    const items = await this.resolveItems()
    return items.find((i) => i.id === id)
  }

  claspAccessoryId(claspType: ClaspType): string | undefined {
    switch (claspType) {
      case 'magnet':
        return 'clasp-magnet'
      case 'spring':
        return 'clasp-spring'
      case 'knot':
        return 'clasp-knot'
      default:
        return undefined
    }
  }
}

// 默认走本地 mock 仓库：离线/演示即可完整渲染（含 44 珠 + 18 配件）；
// 接入真实后端时改为 new RemoteBeadRepository() 即可。
export const beadRepository: BeadRepository = new LocalBeadRepository()

/** 设计器默认主珠 / 次珠 / 焦点珠（= 素材 attrs.group，沿用 mock id 作为分组键） */
export const DEFAULT_MAIN_BEAD_ID = 'agate-red'
export const DEFAULT_SECONDARY_BEAD_ID = 'metal-gold'
export const DEFAULT_FOCAL_BEAD_ID = 'amber-yellow'

/** 生成器默认混搭池（覆盖主要品类，保证"丰富多样"开箱即用） */
export const DEFAULT_PALETTE_IDS = [
  'agate-red',
  'crystal-white',
  'metal-gold',
  'wood-zitan',
  'pearl-fresh',
  'jade',
  'lapis',
  'tourmaline-red',
]

/** 生成器默认中心配饰池与装饰池 */
export const DEFAULT_CENTER_IDS = ['charm-buddha', 'charm-star', 'charm-letter']
export const DEFAULT_DECORATION_IDS = ['deco-goldbead', 'ring-gold', 'deco-shell']
