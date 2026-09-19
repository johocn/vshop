// 订单列表版式注册表：layout key → 块组合与默认配置（L4 内建默认）
export type OrderListLayoutKey = 'classic' | 'status-first' | 'status-group';

export interface OrderListLayoutDef {
  key: OrderListLayoutKey;
  label: string;
  desc: string;
  /** 功能块显隐与定制字段 */
  blocks: {
    showAddress: boolean;      // 收货地址行（手机卡片）
    showDeliveryName: boolean; // 配送方式全名
    stateColors: boolean;      // 物流色标签（待发货橙/已发货蓝/已完成绿/已取消灰）
    groupByState: boolean;     // 按状态分组 + 组内小计（手机卡片）
    stateColumnFirst: boolean; // 状态列前置（桌面表格）
  };
}

export const ORDER_LIST_LAYOUTS: Record<OrderListLayoutKey, OrderListLayoutDef> = {
  'classic': {
    key: 'classic', label: '经典（现有效果+配送补齐）', desc: '现状卡片/表格 + 配送方式全名 + 收货地址行 + 物流色',
    blocks: { showAddress: true, showDeliveryName: true, stateColors: true, groupByState: false, stateColumnFirst: false },
  },
  'status-first': {
    key: 'status-first', label: '状态优先（运维视角）', desc: '状态列前置 + 大物流色块，配送合并宽列',
    blocks: { showAddress: true, showDeliveryName: true, stateColors: true, groupByState: false, stateColumnFirst: true },
  },
  'status-group': {
    key: 'status-group', label: '按状态分组（分区导航）', desc: '手机按状态分组+小计，桌面左状态导航+右明细',
    blocks: { showAddress: true, showDeliveryName: true, stateColors: true, groupByState: true, stateColumnFirst: true },
  },
};

export const DEFAULT_LAYOUT: OrderListLayoutKey = 'classic';
export const LAYOUT_KEYS = Object.keys(ORDER_LIST_LAYOUTS) as OrderListLayoutKey[];
