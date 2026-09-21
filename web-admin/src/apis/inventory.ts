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
import { getAdminClient, graphQlErrorMsg } from './client';

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

// 库存健康概览（数据看板用）：总SKU + 缺货数。取默认仓 stockLevels：
//  - totalSku = totalItems（服务端精确总数）
//  - outOfStock = 当前页内 stockOnHand ≤ 0 的数量（pageSize=1000 近似，无后端时前端不伪造）
export interface InventoryHealth {
  totalSku: number;
  outOfStock: number;
}

export async function fetchInventoryHealth(): Promise<InventoryHealth | null> {
  try {
    const locations = await fetchStockLocations();
    if (!locations.length) return null;
    const first = await fetchStock(locations[0].id, 1, 1000);
    const outOfStock = first.items.filter((s) => s.stockOnHand <= 0).length;
    return { totalSku: first.totalItems, outOfStock };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询库存健康失败'));
  }
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

// ---- 租户库存仓（方案3）：编码/性质由服务端生成（前端不可指定），归属强制当前租户 ----
// 为什么不再直接用核心 createStockLocation/updateStockLocation：
//   核心入参允许省略 customFields.kind / customFields.code，落库后 kind 取默认 'virtual'、code 为 null，
//   而变体绑定（setVariantBindings）要求 kind='physical' 且 code 归属当前租户 → 前端自建仓必然无法绑定。
//   故统一走 cjk-plugin 的租户级 mutation：服务端自动编码 `{租户编码}-{两位序号}`、强制 physical、
//   校验前缀归属，并禁止改/删系统仓（默认物理仓 + 虚拟仓）。

export interface TenantStockLocation {
  id: string;
  name: string;
  code: string;
  kind: string;
  isSystem: boolean;
  deliveryMethods?: string[] | null;
  serviceCities?: string[] | null;
  lat?: number | null;
  lng?: number | null;
}

export interface TenantInventoryOverview {
  channelCode: string;
  physicalStockEnabled: boolean;
  virtualCode: string;
  virtualLocationId?: string | null;
  defaultPhysicalCode: string;
  defaultPhysicalLocationId?: string | null;
  locations: TenantStockLocation[];
}

export interface TenantLocationInput {
  name: string;
  deliveryMethods?: string[] | null;
  serviceCities?: string[] | null;
  lat?: number | null;
  lng?: number | null;
}

const OVERVIEW_SELECTION = `
  channelCode physicalStockEnabled virtualCode virtualLocationId
  defaultPhysicalCode defaultPhysicalLocationId
  locations { id name code kind isSystem deliveryMethods serviceCities lat lng }
`;

export async function fetchTenantInventoryOverview(): Promise<TenantInventoryOverview> {
  try {
    const { tenantInventoryOverview } = await getAdminClient().request<{
      tenantInventoryOverview: TenantInventoryOverview;
    }>(`query TenantInventoryOverview { tenantInventoryOverview { ${OVERVIEW_SELECTION} } }`);
    return tenantInventoryOverview;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载库存方案失败'));
  }
}

/** 幂等补建系统仓（虚拟仓恒在；开关开启时补默认物理仓）——自愈与「一键初始化」共用 */
export async function ensureTenantInventoryLocations(): Promise<TenantInventoryOverview> {
  try {
    const { ensureTenantInventoryLocations } = await getAdminClient().request<{
      ensureTenantInventoryLocations: TenantInventoryOverview;
    }>(`mutation EnsureTenantInventoryLocations {
      ensureTenantInventoryLocations { ${OVERVIEW_SELECTION} }
    }`);
    return ensureTenantInventoryLocations;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '初始化系统仓失败'));
  }
}

export async function createTenantStockLocation(input: TenantLocationInput): Promise<TenantInventoryOverview> {
  try {
    const { createTenantStockLocation } = await getAdminClient().request<{
      createTenantStockLocation: TenantInventoryOverview;
    }>(
      `mutation CreateTenantStockLocation($input: TenantStockLocationInput!) {
        createTenantStockLocation(input: $input) { ${OVERVIEW_SELECTION} }
      }`,
      { input },
    );
    return createTenantStockLocation;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '新建仓库失败'));
  }
}

export async function updateTenantStockLocation(
  input: TenantLocationInput & { id: string },
): Promise<TenantInventoryOverview> {
  try {
    const { updateTenantStockLocation } = await getAdminClient().request<{
      updateTenantStockLocation: TenantInventoryOverview;
    }>(
      `mutation UpdateTenantStockLocation($input: UpdateTenantStockLocationInput!) {
        updateTenantStockLocation(input: $input) { ${OVERVIEW_SELECTION} }
      }`,
      { input },
    );
    return updateTenantStockLocation;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存仓库失败'));
  }
}

export async function deleteTenantStockLocation(id: string): Promise<TenantInventoryOverview> {
  try {
    const { deleteTenantStockLocation } = await getAdminClient().request<{
      deleteTenantStockLocation: TenantInventoryOverview;
    }>(
      `mutation DeleteTenantStockLocation($id: ID!) {
        deleteTenantStockLocation(id: $id) { ${OVERVIEW_SELECTION} }
      }`,
      { id },
    );
    return deleteTenantStockLocation;
  } catch (e: any) {
    // 后端有删仓前置校验（系统仓 / 有库存 / 被变体绑定 / 有未完成预留），需把原因原样透传给运营
    throw new Error(graphQlErrorMsg(e, '删除仓库失败'));
  }
}
