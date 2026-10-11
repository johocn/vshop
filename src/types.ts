/**
 * 共享领域类型：珠子、方案、清单、作品、渲染中间态与枚举。
 * 纯 TS，不依赖任何框架，被 engine / data / store / pages 共用。
 */

/** 珠子材质大类 */
export type BeadCategory =
  | 'crystal' // 水晶
  | 'agate' // 玛瑙玉髓
  | 'wood' // 木质
  | 'amber' // 蜜蜡 / 琉璃
  | 'pearl' // 珍珠 / 贝珠
  | 'metal' // 金属隔珠
  | 'spacer' // 隔片 / 配饰

/** 珠型 */
export type BeadShape =
  | 'round' // 正圆
  | 'barrel' // 桶珠（轴向长）
  | 'drum' // 鼓珠
  | 'faceted' // 切角 / 棱面
  | 'disc' // 扁片（隔片）
  | 'rondelle' // 算盘珠（中间鼓）

/** 材质纹理类型（对应渲染器分层绘制器） */
export type TextureType =
  | 'solid'
  | 'agate' // 玛瑙絮状 / 缠丝
  | 'crystalClear' // 水晶通透
  | 'woodGrain' // 木纹年轮
  | 'metalBrushed' // 金属拉丝 / 镜面
  | 'pearlNacre' // 珍珠虹彩
  | 'tigerEye' // 虎睛 / 猫眼条带
  | 'amberSwirl' // 蜜蜡流纹 / 气泡
  | 'star' // 星月 / 碎石点缀

/** 排布图案模式 */
export type LayoutMode = 'solid' | 'ab' | 'gradient' | 'random' | 'focal'

/** 松量档位 */
export type EaseLevel = 'snug' | 'comfort' | 'loose'

export type Currency = 'CNY'

/** 光泽等级 */
export type Luster = 'matte' | 'satin' | 'glossy' | 'metallic'

/**
 * 材质渲染参数：渲染引擎据此决定分层绘制与光影，平台无关。
 * 颜色用 16 进制字符串（#rrggbb）；所有 0..1 取值。
 */
export interface RenderSpec {
  /** 底色（光源照射面主色） */
  baseColor: string
  /** 暗部 / 描边色 */
  shadowColor: string
  /** 高光色 */
  highlightColor: string
  /** 光泽度 0(哑光) .. 1(镜面) */
  gloss: number
  /** 通透度 0(不透明) .. 1(完全透光) */
  translucency: number
  /** 纹理类型 */
  textureType: TextureType
  /** 纹理强度 0..1 */
  textureStrength: number
  /** 边缘反射 / 暗角色 */
  rimColor: string
  /** 环境补光色（右下方向） */
  envLightColor: string
  /** 花纹 / 猫眼 / 流纹点缀色（可选） */
  accentColor?: string
  /** 光泽观感 */
  luster?: Luster
}

/** 直径档位变体：对应后端同材质多直径 SKU（mock/本地数据无此字段，走组本体字段） */
export interface BeadVariant {
  id: string
  code: string
  beadLength: number
  holeSize: number
  priceUnit: number
}

/** 珠子商品（领域模型） */
export interface BeadMaterial {
  /** 内部稳定 id */
  id: string
  /** 货号：大类码-材质码-直径mm-工艺码，如 AG-RED-08-N */
  code: string
  /** 展示名 */
  name: string
  category: BeadCategory
  shape: BeadShape
  /** 径向直径 mm（决定视觉半径） */
  beadDiameter: number
  /** 轴向长度 mm（沿绳子方向，决定算量；正圆 = 直径） */
  beadLength: number
  /** 孔径 mm */
  holeSize: number
  /** 可选直径档位 mm */
  availableDiameters: number[]
  /** 单价：每颗（元） */
  priceUnit: number
  currency: Currency
  /** 库存（颗）；-1 表示不限 */
  stock: number
  renderSpec: RenderSpec
  /** 估算单颗克重（g） */
  weightPerBead?: number
  /** 直径档位 → 变体 SKU（远程数据源填充） */
  variants?: Record<string, BeadVariant>
}

/** 配饰（扣 / 隔片 / 主珠 / 流苏 / 吊坠 / 装饰 / 连接环 / 佛头） */
export interface AccessorySpec {
  id: string
  code: string
  name: string
  type: 'clasp' | 'spacer' | 'focal' | 'tassel' | 'charm' | 'decoration' | 'ring' | 'guru'
  /** BOM 分组用的品类标签（如 'clasp' / 'charm' / 'decoration' / 'ring'） */
  category: string
  beadDiameter: number
  /** 轴向长度 mm（沿绳方向占用） */
  beadLength: number
  /** 单价：每件（元） */
  priceUnit: number
  /** 估算单件克重（g） */
  weightPerBead: number
  renderSpec: RenderSpec
}

/** 连接处衔接方式（各自占用不同轴向长度，计入动态总长） */
export type JointMode = 'direct' | 'spacer' | 'ring' | 'knot' | 'crimp'

/** 扣具 / 闭合方式 */
export type ClaspType = 'none' | 'magnet' | 'spring' | 'knot'

/** 序列单元类型：珠子 / 装饰 / 焦点配饰 / 扣 / 佛头 / 流苏 */
export type SequenceKind = 'bead' | 'decoration' | 'focal' | 'clasp' | 'guru' | 'tassel'

/**
 * 渲染与算量共用的统一物料视图（珠子或配件皆可）。
 * 由 BeadMaterial / AccessorySpec 映射而来，业务层只依赖此视图。
 */
export interface ResolvedItem {
  id: string
  code: string
  name: string
  category: string
  shape: BeadShape
  beadDiameter: number
  beadLength: number
  holeSize: number
  availableDiameters: number[]
  priceUnit: number
  renderSpec: RenderSpec
  weightPerBead: number
  isAccessory: boolean
  accessoryType?: AccessorySpec['type']
}

/** 装配序列中的最小单元（珠子 / 装饰 / 焦点配饰 / 扣…） */
export interface SequenceItem {
  index: number
  /** 0..1 沿圈比例位置（用于锚定与中心配饰分布） */
  position: number
  kind: SequenceKind
  /** 统一物料引用 id（珠子或配件 id） */
  refId: string
  beadLength: number
  beadDiameter: number
  unitPrice: number
  role: BeadSlot['role'] | 'decoration' | 'clasp'
  /** 与上一单元的衔接方式 */
  joint: JointMode
  /** 纹理确定性随机种子 */
  textureSeed: number
}

/** 用户手动锚定的个别珠子位置 */
export interface BeadAnchor {
  /** 0..1 沿圈比例位置 */
  position: number
  /** 锚定物料 id（珠子或配件） */
  refId: string
  beadDiameter?: number
  role?: 'main' | 'focal' | 'decoration'
}

/** 内置模板（数据式，便于套用与扩展） */
export interface PresetTemplate {
  id: string
  name: string
  description: string
  /** 套用后写入方案的参数（用户 UI 覆盖项优先） */
  params: Partial<BraceletSpec>
  /** 模板自带的锚定 */
  anchors?: BeadAnchor[]
  /** 目标珠数（如 108 佛珠）；不填则按手围估算 */
  wrapCount?: number
}

/** 用户方案（设计器状态的核心载体） */
export interface BraceletSpec {
  id?: string
  /** 手围 mm */
  wristSize: number
  /** 松量档位 */
  ease: EaseLevel
  layoutMode: LayoutMode
  /** 主珠材质 id */
  mainMaterialId: string
  /** 当前所选直径 mm */
  diameter: number
  /** 相邻珠子间隙 mm */
  gap: number
  /** 随机种子（保证可复现） */
  seed: number
  /** 次珠材质 id（AB / 渐变用） */
  secondaryMaterialId?: string
  /** 是否启用隔片 */
  spacerEnabled?: boolean
  /** 隔片材质 id */
  spacerId?: string
  /** 每隔几颗放一个隔片 */
  spacerEvery?: number
  /** 焦点主珠材质 id */
  focalId?: string
  /** 焦点主珠数量（默认 1） */
  focalCount?: number
  /** 焦点主珠位置（0..1，沿圈比例；默认 0.5 顶部居中） */
  focalPosition?: number
  /** 视角倾斜 0..1（决定椭圆 b/a） */
  viewTilt: number
  /** 整体旋转弧度 */
  rotation: number

  // —— 生成系统参数（全部可选，向后兼容旧式方案）——
  /** 多材质混搭池（缺省回退 mainMaterialId + secondaryMaterialId） */
  paletteIds?: string[]
  /** 0..1 珠子尺寸随机抖动幅度 */
  sizeVariation?: number
  /** 中心小配饰混搭池（焦点 / 吊坠 / 佛头） */
  centerAccessoryIds?: string[]
  /** 珠间插入的装饰物池 */
  decorationIds?: string[]
  /** 每隔几颗插一个装饰（0 表示关闭，改用概率插） */
  insertEvery?: number
  /** 相邻珠间插入装饰的概率 0..1 */
  insertChance?: number
  /** 默认连接处衔接方式 */
  jointMode?: JointMode
  /** 扣具 / 闭合方式 */
  claspType?: ClaspType
  /** 内置模板 id（一键套用） */
  presetTemplateId?: string
  /** 手动锚定的个别珠子位置 */
  anchors?: BeadAnchor[]
}

/** 单颗珠子在成品中的位置（算量 + 排布产出） */
export interface BeadSlot {
  index: number
  materialId: string
  beadLength: number
  beadDiameter: number
  unitPrice: number
  role: 'main' | 'secondary' | 'spacer' | 'focal'
}

/** 清单明细行 */
export interface BOMItem {
  code: string
  name: string
  spec: string
  count: number
  unitPrice: number
  subtotal: number
  category: BeadCategory
}

/** 整串清单与计价结果 */
export interface BraceletBOM {
  totalCount: number
  totalAmount: number
  items: BOMItem[]
  /** 推荐弹力线长度 mm（含留尾） */
  cordLengthMm: number
  /** 线径提示文案 */
  cordSpec: string
  /** 估算克重 g */
  weightG: number
  /** 贴合度 */
  fitStatus: 'tight' | 'ok' | 'loose'
  /** 连接处数量（衔接方式统计） */
  jointCount?: number
  /** 连接处额外占用长度 mm */
  jointLengthMm?: number
}

/** 渲染中间态：单颗珠子在画布上的几何与外观 */
export interface RenderBead {
  x: number
  y: number
  r: number
  /** 深度（画家算法排序用，越大越靠前） */
  depth: number
  materialId: string
  /** 纹理确定性随机种子 */
  textureSeed: number
  shadowOffset: { dx: number; dy: number }
  role: BeadSlot['role']
}

/** 我的作品存档 */
export interface WorkRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  spec: BraceletSpec
  /** 成品缩略图（base64 / 临时路径，可选） */
  thumbnail?: string
  totalAmount: number
  /** 云端 DiyPlan id（匿名 draft；P6 报价/下单用） */
  planId?: string
}
