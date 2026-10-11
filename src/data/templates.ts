import type { PresetTemplate } from '../types'

/**
 * 内置模板：一键套用为生成系统提供基线参数与锚定。
 * 用户 UI 选择的覆盖项优先于模板默认值。
 */
export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'center-focal',
    name: '主石居中',
    description: '单颗足金佛像/主石居中，金银点缀，干净高级',
    params: {
      paletteIds: ['agate-red', 'metal-gold', 'agate-red'],
      sizeVariation: 0.2,
      centerAccessoryIds: ['charm-buddha'],
      decorationIds: ['deco-goldbead'],
      insertEvery: 0,
      insertChance: 0.12,
      jointMode: 'ring',
      claspType: 'magnet',
      layoutMode: 'focal',
    },
    anchors: [{ position: 0.5, refId: 'charm-buddha', role: 'focal' }],
  },
  {
    id: 'rainbow',
    name: '彩虹渐变',
    description: '粉紫蓝绿红金多色随机混搭，活泼明快',
    params: {
      paletteIds: ['crystal-pink', 'crystal-purple', 'aquamarine', 'jade', 'garnet', 'metal-gold'],
      sizeVariation: 0.25,
      centerAccessoryIds: ['charm-star'],
      decorationIds: ['deco-silverbead'],
      insertEvery: 0,
      insertChance: 0.1,
      jointMode: 'direct',
      claspType: 'spring',
    },
  },
  {
    id: 'symmetric-mix',
    name: '对称混搭',
    description: '红木金珠珍珠对称铺排，多吊坠居中混搭',
    params: {
      paletteIds: ['agate-red', 'wood-zitan', 'metal-gold', 'pearl-fresh'],
      sizeVariation: 0.35,
      centerAccessoryIds: ['charm-star', 'charm-letter', 'charm-zodiac'],
      decorationIds: ['ring-gold', 'deco-goldbead'],
      insertEvery: 4,
      insertChance: 0,
      jointMode: 'ring',
      claspType: 'magnet',
    },
  },
  {
    id: 'mala-108',
    name: '108佛珠',
    description: '星月菩提长串，佛头三通 + 丝线流苏',
    params: {
      paletteIds: ['bodhi-star'],
      sizeVariation: 0.12,
      centerAccessoryIds: ['guru-bead'],
      decorationIds: ['ring-gold'],
      insertEvery: 0,
      insertChance: 0.05,
      jointMode: 'knot',
      claspType: 'none',
    },
    wrapCount: 108,
    anchors: [
      { position: 0, refId: 'guru-bead', role: 'focal' },
      { position: 0.999, refId: 'tassel-silk', role: 'decoration' },
    ],
  },
  {
    id: 'five-elements',
    name: '五行色彩',
    description: '朱砂/翡翠/海蓝/黄金/白玛瑙五行配色',
    params: {
      paletteIds: ['cinnabar', 'jade', 'aquamarine', 'metal-gold', 'agate-white'],
      sizeVariation: 0.2,
      centerAccessoryIds: ['charm-letter'],
      decorationIds: ['deco-goldbead'],
      insertEvery: 5,
      insertChance: 0,
      jointMode: 'spacer',
      claspType: 'magnet',
    },
  },
  {
    id: 'minimal-gold',
    name: '极简金银',
    description: '金银珠 + 珍珠，小字母吊坠，克制高级',
    params: {
      paletteIds: ['metal-gold', 'metal-silver', 'pearl-fresh'],
      sizeVariation: 0.1,
      centerAccessoryIds: ['charm-letter'],
      decorationIds: ['deco-goldbead'],
      insertEvery: 0,
      insertChance: 0.08,
      jointMode: 'direct',
      claspType: 'magnet',
    },
  },
]

export function getTemplate(id: string): PresetTemplate | undefined {
  return PRESET_TEMPLATES.find((t) => t.id === id)
}
