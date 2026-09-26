// 库存域 admin-api 调用（Task 9，schema 已实测校准）
// 校准结果（本地 + 生产租户账号实测）：
//   - stockLocations { items { id name } } —— 可用（@Allow(ReadCatalog, ReadStockLocation)；租户管理员有 ReadCatalog）
//   - setVariantStock(productVariantId: ID!, stockLocationId: ID!, stockOnHand: Int!) → Boolean —— 可用，
//     替代计划里的 adjustSimpleStock（本地 schema 无此 mutation；setVariantStock 为绝对值设置）
//   - stockLevels(locationId, page, pageSize) 已弃用（D41）：@Allow(ViewStock)，而 ViewStock 是 inventory-plugin 的
//     超管语义全局库存权限、不在租户白名单内 → 租户管理员恒 403。库存数量统一走 cjk-plugin 租户级 inventoryStockPage
//   - myShopStock / myShopProductStock / myShopStockAdjust —— 租户级接口，superadmin 实测
//     "You are not currently authorized to perform this action"，不可用，故库存列表走 inventoryStockPage
import { getAdminClient, graphQlErrorMsg } from './client';

export interface StockLocationRow {
  id: string;
  name: string;
}

export async function fetchStockLocations(): Promise<StockLocationRow[]> {
  const { stockLocations } = await getAdminClient().request<{
    stockLocations: { items: StockLocationRow[] };
  }>(`query { stockLocations { items { id name } } }`);
  return stockLocations.items;
}

// 库存健康概览（数据看板用）：总SKU + 缺货数。
// 走 cjk-plugin 租户级 inventoryStockPage（@Allow 含 ReadCatalog，租户管理员可用；与「库存明细页」同源同口径，
// 服务端已算好分桶计数，前端不再二次推导）：
//  - totalSku = summary.skuCount（服务端精确总数）
//  - outOfStock = summary.outCount（服务端 bucket='out' 计数）
// 早期实现走核心 stockLevels（需 ViewStock）→ 租户账号恒 403、卡片退化成「−」，见 D41。
export interface InventoryHealth {
  totalSku: number;
  outOfStock: number;
}

export async function fetchInventoryHealth(): Promise<InventoryHealth> {
  try {
    const page = await fetchInventoryStockPage({ page: 1, pageSize: 1 });
    return { totalSku: page.summary.skuCount, outOfStock: page.summary.outCount };
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

// ---- 库存明细聚合页（Plan 2）：一次请求拿齐 KPI / 分桶计数 / 明细行 ----
// 字段对齐后端 cjk-plugin `inventoryStockPage`（Task 2/3 注册在 admin SDL）
export interface InventoryStockQueryInput {
  locationId?: string | null;
  keyword?: string;
  bucket?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryStockRow {
  variantId: string;
  productId: string | null;
  variantName: string;
  sku: string;
  optionText: string | null;
  thumbnail: string | null;
  stockLocationId: string | null;
  locationName: string | null;
  onHand: number;
  allocated: number;
  available: number;
  safetyStock: number;
  /** 货值（分）：最近一次采购/移库成本价 × 现存；无成本价 → 0 */
  value: number;
  costPrice: number | null;
  /** 'out' | 'low' | 'ok'（服务端 bucketOf 结果，前端不重复实现） */
  bucket: string;
  lastMovementAt: string | null;
  lastDirection: string | null;
  lastBizType: string | null;
}

export interface InventoryStockSummary {
  skuCount: number;
  onHandTotal: number;
  allocatedTotal: number;
  availableTotal: number;
  valueTotal: number;
  outCount: number;
  lowCount: number;
  okCount: number;
  outbound7d: number;
}

export interface InventoryStockPage {
  totalItems: number;
  summary: InventoryStockSummary;
  items: InventoryStockRow[];
}

const STOCK_PAGE_SELECTION = `
  totalItems
  summary { skuCount onHandTotal allocatedTotal availableTotal valueTotal outCount lowCount okCount outbound7d }
  items { variantId productId variantName sku optionText thumbnail stockLocationId locationName
          onHand allocated available safetyStock value costPrice bucket lastMovementAt lastDirection lastBizType }
`;

export async function fetchInventoryStockPage(
  input: InventoryStockQueryInput = {},
): Promise<InventoryStockPage> {
  try {
    const { inventoryStockPage } = await getAdminClient().request<{ inventoryStockPage: InventoryStockPage }>(
      `query InventoryStockPage($input: InventoryStockQueryInput) {
        inventoryStockPage(input: $input) { ${STOCK_PAGE_SELECTION} }
      }`,
      { input },
    );
    return inventoryStockPage;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载库存明细失败'));
  }
}

// ---- 预警规则（安全库存；Plan 2）----
export interface InventoryAlertRule {
  variantId: string;
  locationId: string | null;
  safetyStock: number;
  enabled: boolean;
}

export interface InventoryAlertRuleInput {
  variantId: string;
  safetyStock: number;
  enabled?: boolean | null;
  locationId?: string | null;
}

const ALERT_RULE_SELECTION = `variantId locationId safetyStock enabled`;

/** locationId 缺省/空 → 该 SKU 的「全仓通用」规则（服务端哨兵 0） */
export async function fetchInventoryAlertRules(locationId?: string | null): Promise<InventoryAlertRule[]> {
  try {
    const { inventoryAlertRules } = await getAdminClient().request<{ inventoryAlertRules: InventoryAlertRule[] }>(
      `query InventoryAlertRules($locationId: ID) {
        inventoryAlertRules(locationId: $locationId) { ${ALERT_RULE_SELECTION} }
      }`,
      { locationId: locationId ?? null },
    );
    return inventoryAlertRules;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载预警规则失败'));
  }
}

export async function saveInventoryAlertRules(
  locationId: string | null | undefined,
  items: InventoryAlertRuleInput[],
): Promise<InventoryAlertRule[]> {
  try {
    const { saveInventoryAlertRules } = await getAdminClient().request<{ saveInventoryAlertRules: InventoryAlertRule[] }>(
      `mutation SaveInventoryAlertRules($locationId: ID, $items: [InventoryAlertRuleInput!]!) {
        saveInventoryAlertRules(locationId: $locationId, items: $items) { ${ALERT_RULE_SELECTION} }
      }`,
      { locationId: locationId ?? null, items },
    );
    return saveInventoryAlertRules;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存预警规则失败'));
  }
}
