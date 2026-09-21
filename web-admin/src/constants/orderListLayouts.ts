// 订单列表版式注册表：layout key → 结构变体 + 块级配置（L4 内建默认）
export type OrderListLayoutKey = 'classic' | 'status-first' | 'status-group';

/** 手机端行结构：card 大卡片信息流 / kanban 看板极简卡 / compact 高密度两行清单 */
export type OrderListVariant = 'card' | 'kanban' | 'compact';
/** 桌面端行结构：wide 9 列宽表 / compact 7 列紧凑表 */
export type OrderListDesktopVariant = 'wide' | 'compact';

export interface OrderListLayoutDef {
  key: OrderListLayoutKey;
  label: string;
  desc: string;
  /** 手机端结构分支（决定渲染器走哪个模板分支） */
  mobileVariant: OrderListVariant;
  /** 桌面端结构分支 */
  desktopVariant: OrderListDesktopVariant;
  /** 桌面是否渲染左侧分组导航（含服务端计数） */
  desktopGroupNav: boolean;
  /** 列内细节显隐（结构差异由 variant 决定，本处只管「同一结构内的字段取舍」） */
  blocks: {
    showThumb: boolean;        // 商品缩略图（A 有 / B、C 无）
    showAddress: boolean;      // 收货地址行
    showDeliveryName: boolean; // 配送方式全名
    stateColors: boolean;      // 物流色标签（待发货橙/已发货蓝/已完成绿/已取消灰）
  };
}

export const ORDER_LIST_LAYOUTS: Record<OrderListLayoutKey, OrderListLayoutDef> = {
  'classic': {
    key: 'classic',
    label: '卡片信息流',
    desc: '手机单列大卡片（缩略图 + 商品 + 顾客 + 地址 + 金额 + 操作组），桌面 9 列宽表',
    mobileVariant: 'card',
    desktopVariant: 'wide',
    desktopGroupNav: false,
    blocks: { showThumb: true, showAddress: true, showDeliveryName: true, stateColors: true },
  },
  'status-first': {
    key: 'status-first',
    label: '高密度清单（运维视角）',
    desc: '手机无圆角两行清单；桌面紧凑表格（36px 行高 / 斑马纹 / 粘性表头）',
    mobileVariant: 'compact',
    desktopVariant: 'compact',
    desktopGroupNav: false,
    blocks: { showThumb: false, showAddress: false, showDeliveryName: false, stateColors: true },
  },
  'status-group': {
    key: 'status-group',
    label: '状态看板（分区导航）',
    desc: '手机按状态泳道分区（状态名 + 单数 + 金额小计）+ 极简卡；桌面左侧分组导航 + 右侧紧凑表',
    mobileVariant: 'kanban',
    desktopVariant: 'compact',
    desktopGroupNav: true,
    blocks: { showThumb: false, showAddress: false, showDeliveryName: false, stateColors: true },
  },
};

export const DEFAULT_LAYOUT: OrderListLayoutKey = 'classic';
export const LAYOUT_KEYS = Object.keys(ORDER_LIST_LAYOUTS) as OrderListLayoutKey[];
