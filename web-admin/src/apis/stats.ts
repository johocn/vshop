// 数据看板统计：今日概览（今日销售额 / 今日订单数 / 库存预警）
// 统计源：operations-plugin dashboardOverview(range:"today") —— 已支付口径
//（Paid/Shipped/Delivered/PartiallyShipped，排除未完成/取消单），库存预警 = lowStockCount（库存 ≤ 5，插件内统计）。
import { getAdminClient } from './client';

export interface TodayOverview {
  /** 今日销售额（单位：分，页面 /100 显示） */
  revenue: number;
  /** 今日订单数（已支付口径） */
  orderCount: number;
  /** 库存预警数（库存 ≤ 5） */
  lowStock: number;
}

/** 首页工作台 KPI：今日销售额 / 待发货 / 库存预警 */
export interface HomeKpis {
  revenue: number;
  toShip: number;
  lowStock: number;
}

export async function fetchTodayOverview(): Promise<TodayOverview> {
  const { dashboardOverview } = await getAdminClient().request<{
    dashboardOverview: {
      sales: { orderCount: number; gmv: number } | null;
      inventory: { lowStockCount: number } | null;
    } | null;
  }>(
    `query DashboardOverview($range: String!) {
      dashboardOverview(range: $range) {
        sales { orderCount gmv }
        inventory { lowStockCount }
      }
    }`,
    { range: 'today' },
  );
  const sales = dashboardOverview?.sales;
  const inv = dashboardOverview?.inventory;
  return {
    revenue: sales?.gmv ?? 0,
    orderCount: sales?.orderCount ?? 0,
    lowStock: inv?.lowStockCount ?? 0,
  };
}

export async function fetchHomeKpis(): Promise<HomeKpis> {
  // 待发货口径与订单列表「待发货」页签一致：state ∈ PaymentAuthorized / PaymentSettled。
  // 走 orders 查询（基于当前租户渠道上下文，与今日销售额同源，天然按登录租户隔离），
  // 而非 myShopOrders（该接口在部分角色下返回 FORBIDDEN）。
  const [overview, toShipRes] = await Promise.all([
    fetchTodayOverview(),
    getAdminClient().request<{ orders: { totalItems: number } }>(
      `query ToShipOrders {
        orders(options: { take: 1, filter: { state: { in: ["PaymentAuthorized", "PaymentSettled"] } } }) {
          totalItems
        }
      }`,
    ),
  ]);
  return { revenue: overview.revenue, toShip: toShipRes.orders.totalItems ?? 0, lowStock: overview.lowStock };
}
