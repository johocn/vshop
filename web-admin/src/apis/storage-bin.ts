// 库区/库位域 admin-api 调用（Task 9）
// 契约来源：cjk-plugin/src/plugin.ts 的 adminApiExtensions（Task 8 已双注册并部署到生产）
// 三档开关（Channel.customFields.binMode = off/zone/bin）只影响前端门控，接口本身共用同一套。
// 注意：variantBin / generateStandardBins / bindVariantToBin 在 SDL 里是 JSON 标量 —— 只能取字段本身。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface StorageZone {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
}

export interface StorageBin {
  id: string;
  zoneId: string;
  code: string;
  rowNo: number;
  levelNo: number;
  enabled: boolean;
}

export interface VariantBinBinding {
  id: string;
  variantId: string;
  stockLocationId: string;
  zoneId: string;
  binId?: string | null;
  isDefault?: boolean;
  zone?: StorageZone | null;
  bin?: StorageBin | null;
}

/** 库区列表（按 sortOrder, code 排序） */
export async function fetchStorageZones(stockLocationId: string): Promise<StorageZone[]> {
  try {
    const { storageZones } = await getAdminClient().request<{ storageZones: StorageZone[] }>(
      `query StorageZones($stockLocationId: ID!) {
        storageZones(stockLocationId: $stockLocationId) { id code name sortOrder enabled }
      }`,
      { stockLocationId },
    );
    return storageZones ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库区查询失败'));
  }
}

/** 库位列表（按 rowNo, levelNo 排序；zoneId 可选，不传取全仓） */
export async function fetchStorageBins(stockLocationId: string, zoneId?: string): Promise<StorageBin[]> {
  try {
    const { storageBins } = await getAdminClient().request<{ storageBins: StorageBin[] }>(
      `query StorageBins($stockLocationId: ID!, $zoneId: ID) {
        storageBins(stockLocationId: $stockLocationId, zoneId: $zoneId) {
          id zoneId code rowNo levelNo enabled
        }
      }`,
      { stockLocationId, zoneId: zoneId ?? null },
    );
    return storageBins ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库位查询失败'));
  }
}

/** 某 SKU 在某仓的库位绑定（无绑定返回 null） */
export async function fetchVariantBin(
  variantId: string,
  stockLocationId: string,
): Promise<VariantBinBinding | null> {
  try {
    const { variantBin } = await getAdminClient().request<{ variantBin: VariantBinBinding | null }>(
      `query VariantBin($variantId: ID!, $stockLocationId: ID!) {
        variantBin(variantId: $variantId, stockLocationId: $stockLocationId)
      }`,
      { variantId, stockLocationId },
    );
    return variantBin ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库位绑定查询失败'));
  }
}

/** 生成标准库位（幂等）：已存在的库区/库位编码跳过，返回本次新建数量 */
export async function generateStandardBins(
  stockLocationId: string,
): Promise<{ zonesCreated: number; binsCreated: number }> {
  try {
    const { generateStandardBins } = await getAdminClient().request<{
      generateStandardBins: { zonesCreated: number; binsCreated: number };
    }>(
      `mutation GenerateStandardBins($stockLocationId: ID!) {
        generateStandardBins(stockLocationId: $stockLocationId)
      }`,
      { stockLocationId },
    );
    return {
      zonesCreated: generateStandardBins?.zonesCreated ?? 0,
      binsCreated: generateStandardBins?.binsCreated ?? 0,
    };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '生成标准库位失败'));
  }
}

/** 归位（幂等 upsert）：bin 档传 binId（服务端推导 zoneId），zone 档只传 zoneId（binId 置 null） */
export async function bindVariantToBin(input: {
  variantId: string;
  stockLocationId: string;
  zoneId: string;
  binId?: string | null;
}): Promise<VariantBinBinding> {
  try {
    const { bindVariantToBin } = await getAdminClient().request<{ bindVariantToBin: VariantBinBinding }>(
      `mutation BindVariantToBin($input: BindVariantBinInput!) {
        bindVariantToBin(input: $input)
      }`,
      {
        input: {
          variantId: input.variantId,
          stockLocationId: input.stockLocationId,
          zoneId: input.zoneId,
          binId: input.binId ? input.binId : null,
        },
      },
    );
    return bindVariantToBin;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库位绑定失败'));
  }
}

/** 解绑某 SKU 在某仓的库位 */
export async function unbindVariantFromBin(variantId: string, stockLocationId: string): Promise<boolean> {
  try {
    const { unbindVariantFromBin } = await getAdminClient().request<{ unbindVariantFromBin: boolean }>(
      `mutation UnbindVariantFromBin($variantId: ID!, $stockLocationId: ID!) {
        unbindVariantFromBin(variantId: $variantId, stockLocationId: $stockLocationId)
      }`,
      { variantId, stockLocationId },
    );
    return !!unbindVariantFromBin;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库位解绑失败'));
  }
}

/** 删除库位（有 SKU 绑定则服务端拒绝并返回原因） */
export async function deleteStorageBin(id: string): Promise<boolean> {
  try {
    const { deleteStorageBin } = await getAdminClient().request<{ deleteStorageBin: boolean }>(
      `mutation DeleteStorageBin($id: ID!) { deleteStorageBin(id: $id) }`,
      { id },
    );
    return !!deleteStorageBin;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '库位删除失败'));
  }
}