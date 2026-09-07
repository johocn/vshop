// 数据看板统计（Task 10，schema 已实测校准）
// 校准结果（本地 admin-api 实测）：
//   - OrderFilterParameter 含 createdAt（after 操作符可用），orders(options:{ filter:{ createdAt:{ after } } }) { totalItems } —— 可用
//   - orders 行含 totalWithTax（单位：分），可汇总今日销售额
//   - stockLevels(locationId,page,pageSize) 遍历统计 stockOnHand <= 5 —— 可用（参考 inventory.ts）
//   - 备注：本地 Vendure 已装 dashboard 插件，dashboardOverview(range:"today") → sales{ orderCount gmv } /
//     inventory{ lowStockCount } 为更准确的"今日"统计源（排除未完成/取消订单）。本轮按计划用订单/库存
//     查询填充真实数据，待 dashboard 插件契约对齐后替换本实现（见计划 Task 10 备注）。
import { getAdminClient } from './client';
import { fetchStock, fetchStockLocations } from './inventory';

export interface TodayOverview {
  /** 今日销售额（单位：分，页面 /100 显示） */
  revenue: number;
  /** 今日订单数（createdAt 今日起） */
  orderCount: number;
  /** 库存预警数（stockOnHand <= 5） */
  lowStock: number;
}

/** 首页工作台 KPI：今日销售额 / 待发货 / 库存预警 */
export interface HomeKpis {
  revenue: number;
  toShip: number;
  lowStock: number;
}

const LOW_STOCK_THRESHOLD = 5;
const STOCK_PAGE_SIZE = 200;

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchTodayOverview(): Promise<TodayOverview> {
  // 今日订单数 + 今日销售额：orders 按 createdAt >= 今日 0 点过滤，汇总 totalWithTax
  // 注：含当日所有 state 的订单（未完成/取消订单会拉高数值），更精确口径待 dashboard 插件 gmv
  const { orders } = await getAdminClient().request<{
    orders: { totalItems: number; items: Array<{ totalWithTax: number }> };
  }>(
    `query TodayOrders($after: DateTime) {
      orders(options: { take: 100, filter: { createdAt: { after: $after } } }) {
        totalItems items { totalWithTax }
      }
    }`,
    { after: todayStartIso() },
  );
  const revenue = orders.items.reduce((s, o) => s + (o.totalWithTax || 0), 0);

  // 库存预警：遍历所有仓库，统计 stockOnHand <= 5 的数量（分页拉全）
  let lowStock = 0;
  const locations = await fetchStockLocations();
  for (const loc of locations) {
    let page = 1;
    let total = 0;
    do {
      const res = await fetchStock(loc.id, page, STOCK_PAGE_SIZE);
      lowStock += res.items.filter((s) => s.stockOnHand <= LOW_STOCK_THRESHOLD).length;
      total = res.totalItems;
      page += 1;
    } while ((page - 1) * STOCK_PAGE_SIZE < total);
  }

  return { revenue, orderCount: orders.totalItems, lowStock };
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
