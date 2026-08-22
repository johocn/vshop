// 库存域 admin-api 调用（Task 9，schema 已实测校准）
// 校准结果（本地 admin-api 实测）：
//   - stockLevels(locationId: ID!, page: Int, pageSize: Int) { totalItems items { id productVariantId
//       stockLocationId stockOnHand stockAllocated } } —— 可用（注意参数是 locationId/page/pageSize，
//       不是计划里的 options:{take,skip}；行类型为 StockLevelRow，无 productId/stockLocated，
//       实际字段为 productVariantId / stockOnHand / stockAllocated）
//   - stockLocations { items { id name } } —— 可用（默认仓 + 二道区仓）
//   - setVariantStock(productVariantId: ID!, stockLocationId: ID!, stockOnHand: Int!) → Boolean —— 可用，
//     替代计划里的 adjustSimpleStock（本地 schema 无此 mutation；setVariantStock 为绝对值设置）
//   - myShopStock / myShopProductStock / myShopStockAdjust —— 租户级接口，superadmin 实测
//     "You are not currently authorized to perform this action"，不可用，故库存列表走 stockLevels
import { getAdminClient } from './client';

export interface StockRow {
  id: string;
  productVariantId: string;
  stockLocationId: string;
  stockOnHand: number;
  stockAllocated: number;
}

export interface StockLocationRow {
  id: string;
  name: string;
}

export async function fetchStock(
  locationId: string,
  page = 1,
  pageSize = 20,
): Promise<{ totalItems: number; items: StockRow[] }> {
  const { stockLevels } = await getAdminClient().request<{
    stockLevels: { totalItems: number; items: StockRow[] };
  }>(
    `query Stock($locationId: ID!, $page: Int, $pageSize: Int) {
      stockLevels(locationId: $locationId, page: $page, pageSize: $pageSize) {
        totalItems items { id productVariantId stockLocationId stockOnHand stockAllocated }
      }
    }`,
    { locationId, page, pageSize },
  );
  return stockLevels;
}

export async function fetchStockLocations(): Promise<StockLocationRow[]> {
  const { stockLocations } = await getAdminClient().request<{
    stockLocations: { items: StockLocationRow[] };
  }>(`query { stockLocations { items { id name } } }`);
  return stockLocations.items;
}

// 库存调整：setVariantStock 为绝对值设置（非增量），调用方需传目标库存数
export async function adjustStock(
  productVariantId: string,
  stockLocationId: string,
  stockOnHand: number,
): Promise<boolean> {
  const { setVariantStock } = await getAdminClient().request<{ setVariantStock: boolean }>(
    `mutation AdjustStock($productVariantId: ID!, $stockLocationId: ID!, $stockOnHand: Int!) {
      setVariantStock(productVariantId: $productVariantId, stockLocationId: $stockLocationId, stockOnHand: $stockOnHand)
    }`,
    { productVariantId, stockLocationId, stockOnHand },
  );
  return setVariantStock;
}
