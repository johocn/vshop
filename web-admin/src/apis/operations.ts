// operations-plugin admin-api 调用（契约已核实 operations.plugin.ts SDL）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface TrendPoint { date: string; orderCount: number; gmv: number }
export interface CategoryTopRow { categoryId: string; categoryName: string; gmv: number; orderCount: number; quantity?: number }

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

// ===== 四期增长闭环聚合（operations-plugin 2026-10 新增） =====

/** 复购率（0-100，一位小数）：窗口内有效下单客户中 ≥2 单客户占比 */
export async function fetchRepurchaseRate(days: number): Promise<number> {
  try {
    const { repurchaseRate } = await getAdminClient().request<{ repurchaseRate: number }>(
      `query RepurchaseRate($days: Int!) { repurchaseRate(days: $days) }`,
      { days },
    );
    return repurchaseRate ?? 0;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询复购率失败'));
  }
}

/** 评价概览（当前渠道主评）：均分/差评率/待审数/带图率 */
export interface ReviewOverview {
  totalApproved: number;
  avgRating: number;
  /** 0-100，rating≤2 占比 */
  badRate: number;
  pendingCount: number;
  /** 0-100，带图主评占比 */
  withImagesRate: number;
}

export async function fetchReviewOverview(): Promise<ReviewOverview> {
  try {
    const { reviewOverview } = await getAdminClient().request<{ reviewOverview: ReviewOverview }>(
      `query ReviewOverview { reviewOverview { totalApproved avgRating badRate pendingCount withImagesRate } }`,
    );
    return reviewOverview;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询评价概览失败'));
  }
}

/** 热销商品榜：窗口内有效订单按件数排序，amount 为分 */
export interface ProductSalesRow { productId: string; name: string; quantity: number; amount: number }

export async function fetchProductSalesTop(days: number, take = 5): Promise<ProductSalesRow[]> {
  try {
    const { productSalesTop } = await getAdminClient().request<{ productSalesTop: ProductSalesRow[] }>(
      `query ProductSalesTop($days: Int!, $take: Int) { productSalesTop(days: $days, take: $take) { productId name quantity amount } }`,
      { days, take },
    );
    return productSalesTop ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询热销榜失败'));
  }
}

/** 骑手效率榜：窗口内送达单按骑手聚合，onTimeRate 基于承诺时段（0-100） */
export interface RiderEfficiencyRow { customerId: string; name: string; completed: number; onTimeRate: number }

export async function fetchRiderEfficiency(days: number, take = 5): Promise<RiderEfficiencyRow[]> {
  try {
    const { riderEfficiency } = await getAdminClient().request<{ riderEfficiency: RiderEfficiencyRow[] }>(
      `query RiderEfficiency($days: Int!, $take: Int) { riderEfficiency(days: $days, take: $take) { customerId name completed onTimeRate } }`,
      { days, take },
    );
    return riderEfficiency ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询骑手效率失败'));
  }
}
