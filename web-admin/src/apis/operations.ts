// operations-plugin admin-api 调用（契约已核实 operations.plugin.ts SDL）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface TrendPoint { date: string; orderCount: number; gmv: number }
export interface CategoryTopRow { categoryId: string; categoryName: string; gmv: number; orderCount: number }

export async function fetchSalesTrend(days: number): Promise<TrendPoint[]> {
  try {
    const { salesTrend } = await getAdminClient().request<{ salesTrend: TrendPoint[] }>(
      `query SalesTrend($days: Int!) { salesTrend(days: $days) { date orderCount gmv } }`,
      { days },
    );
    return salesTrend ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询销售趋势失败'));
  }
}

export async function fetchCategoryTop(days: number): Promise<CategoryTopRow[]> {
  try {
    const { categoryTop } = await getAdminClient().request<{ categoryTop: CategoryTopRow[] }>(
      `query CategoryTop($days: Int!) { categoryTop(days: $days) { categoryId categoryName gmv orderCount } }`,
      { days },
    );
    return categoryTop ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询品类排行失败'));
  }
}
