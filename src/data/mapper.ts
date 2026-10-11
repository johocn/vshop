import type { BeadMaterial, BeadCategory, BeadShape, BeadVariant, RenderSpec, TextureType, Luster } from '../types'

/** shop-api DiyMaterial 行（GraphQL 返回原样；price 分） */
export interface DiyMaterialDTO {
  id: string | number
  code: string
  name: Record<string, string> | string
  categoryId: number
  shape: string
  diameter: number | null
  axialLength: number | null
  holeSize: number | null
  attrs: { group?: string; defaultDiameter?: number; weightPerBead?: number } | null
  render: Record<string, any> | null
  price: number
  currency: string
  stock: number
}

export interface DiyCategoryDTO {
  id: string | number
  code: string | null
  name: Record<string, string> | string
}

const BEAD_CATEGORIES: BeadCategory[] = ['crystal', 'agate', 'wood', 'amber', 'pearl', 'metal', 'spacer']
/** 后端分类码 → bead-diy 枚举回退（gemstone 归 crystal） */
const CATEGORY_FALLBACK: Record<string, BeadCategory> = { gemstone: 'crystal' }

/** LocalizedText 取值：zh-CN → en-US → 首个值 → 兜底 */
export function localizeText(t: Record<string, string> | string | null | undefined, fallback = ''): string {
  if (!t) return fallback
  if (typeof t === 'string') return t
  return t['zh-CN'] ?? t['en-US'] ?? Object.values(t)[0] ?? fallback
}

/** render jsonb（bead-diy RenderSpec 同构）→ RenderSpec，缺字段补内建默认 */
export function toRenderSpec(r: Record<string, any> | null): RenderSpec {
  if (!r) {
    return {
      baseColor: '#C9CDD4', shadowColor: '#8A9099', highlightColor: '#FFFFFF',
      gloss: 0.6, translucency: 0.1, textureType: 'solid', textureStrength: 0.2,
      rimColor: '#AAB2BB', envLightColor: '#B8C4CC',
    }
  }
  return {
    baseColor: r.baseColor ?? '#C9CDD4',
    shadowColor: r.shadowColor ?? '#8A9099',
    highlightColor: r.highlightColor ?? '#FFFFFF',
    gloss: r.gloss ?? 0.6,
    translucency: r.translucency ?? 0,
    textureType: (r.textureType ?? 'solid') as TextureType,
    textureStrength: r.textureStrength ?? 0.2,
    rimColor: r.rimColor ?? '#AAB2BB',
    envLightColor: r.envLightColor ?? '#B8C4CC',
    accentColor: r.accentColor,
    luster: r.luster as Luster | undefined,
  }
}

/** 单行 DTO → 直径变体 SKU */
export function toVariant(dto: DiyMaterialDTO): BeadVariant {
  return {
    id: String(dto.id),
    code: dto.code,
    beadLength: dto.axialLength ?? dto.diameter ?? 8,
    holeSize: dto.holeSize ?? 1,
    priceUnit: dto.price / 100,
  }
}

/**
 * 后端多 SKU 行 → C 端组材质列表：
 * 按 attrs.group 聚合（无 group 的行自成一组），组 id = group（= mock id，DEFAULT_* 常量依赖它）。
 */
export function groupMaterials(rows: DiyMaterialDTO[], catCodeById: Map<number, string>): BeadMaterial[] {
  const groups = new Map<string, DiyMaterialDTO[]>()
  for (const r of rows) {
    const g = r.attrs?.group ?? String(r.id)
    const list = groups.get(g) ?? []
    list.push(r)
    groups.set(g, list)
  }
  const out: BeadMaterial[] = []
  for (const [gid, list] of groups) {
    list.sort((a, b) => (a.diameter ?? 0) - (b.diameter ?? 0))
    const canonical = list.find((r) => r.diameter === r.attrs?.defaultDiameter) ?? list[0]
    const variants: Record<string, BeadVariant> = {}
    for (const r of list) variants[String(r.diameter)] = toVariant(r)
    const catCode = catCodeById.get(canonical.categoryId) ?? ''
    const category: BeadCategory = BEAD_CATEGORIES.includes(catCode as BeadCategory)
      ? (catCode as BeadCategory)
      : CATEGORY_FALLBACK[catCode] ?? 'crystal'
    out.push({
      id: gid,
      code: canonical.code,
      name: localizeText(canonical.name),
      category,
      shape: canonical.shape as BeadShape,
      beadDiameter: canonical.diameter ?? 8,
      beadLength: canonical.axialLength ?? canonical.diameter ?? 8,
      holeSize: canonical.holeSize ?? 1,
      availableDiameters: list.map((r) => r.diameter ?? 0).filter((d) => d > 0),
      priceUnit: canonical.price / 100,
      currency: 'CNY',
      stock: canonical.stock,
      renderSpec: toRenderSpec(canonical.render),
      weightPerBead: canonical.attrs?.weightPerBead,
      variants,
    })
  }
  return out
}
