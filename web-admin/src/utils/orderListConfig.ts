// 订单列表版式配置解析：L1 全局默认 → L2 页面配置 → L3 块定制 → L4 内建默认
import { ORDER_LIST_LAYOUTS, OrderListLayoutKey, DEFAULT_LAYOUT, LAYOUT_KEYS } from '../constants/orderListLayouts';

export interface OrderListConfig {
  layout: OrderListLayoutKey;
  blocks: Record<string, any>; // 块级定制（合并自注册表默认 + 页面 JSON）
}

/** 纯函数：解析布局 key，非法回退默认（L4/L1） */
export function parseLayout(raw: unknown): OrderListLayoutKey {
  if (typeof raw === 'string' && (LAYOUT_KEYS as string[]).includes(raw)) {
    return raw as OrderListLayoutKey;
  }
  return DEFAULT_LAYOUT;
}

/** 纯函数：解析页面配置 JSON（坏 JSON/缺字段回退默认），返回合并后的最终配置 */
export function parseOrderListConfig(json: string | null | undefined): OrderListConfig {
  let page: any = null;
  if (json && typeof json === 'string') {
    try { page = JSON.parse(json); } catch { page = null; }
  }
  const layout = parseLayout(page?.layout);
  const base = ORDER_LIST_LAYOUTS[layout];
  const blocks = { ...base.blocks };
  // L3 块定制：页面 JSON 的 blocks 字段合并覆盖（标量直接覆盖）
  if (page?.blocks && typeof page.blocks === 'object') {
    Object.assign(blocks, page.blocks);
  }
  return { layout, blocks };
}
