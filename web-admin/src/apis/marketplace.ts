// 商品上架审批 admin-api 封装
import { getAdminClient } from './client';

export interface MarketplaceApprovalItem {
  id: string;
  name: string;
  marketplaceStatus: string | null;
  rejectReason: string | null;
  platformCategoryId?: string | null;
}

/** 拉取待审商品（仅 platform/superadmin） */
export async function fetchPendingProducts(): Promise<MarketplaceApprovalItem[]> {
  const { marketplacePendingProducts } = await getAdminClient().request<{
    marketplacePendingProducts: Array<{
      id: string;
      translations?: Array<{ languageCode: string; name?: string | null }>;
      customFields?: { marketplaceStatus?: string | null; rejectReason?: string | null; platformCategoryId?: string | null };
    }>;
  }>(
    `query MarketplacePendingProducts {
      marketplacePendingProducts { id translations { languageCode name } customFields { marketplaceStatus rejectReason platformCategoryId } }
    }`,
  );
  return (marketplacePendingProducts ?? []).map((p) => {
    const zh = (p.translations ?? []).find(
      (t) => t.languageCode === 'zh_Hans' || t.languageCode === 'zh-hans',
    )?.name;
    const cf = p.customFields ?? {};
    return {
      id: p.id,
      name: zh || p.id,
      marketplaceStatus: cf.marketplaceStatus ?? 'pending',
      rejectReason: cf.rejectReason ?? null,
      platformCategoryId: cf.platformCategoryId ?? null,
    };
  });
}

/** 通过商品上架审批 */
export async function approveProduct(id: string): Promise<void> {
  await getAdminClient().request(
    `mutation ApproveMarketplaceProduct($productId: ID!) {
      approveMarketplaceProduct(productId: $productId)
    }`,
    { productId: id },
  );
}

/** 驳回商品上架审批 */
export async function rejectProduct(id: string, reason: string): Promise<void> {
  await getAdminClient().request(
    `mutation RejectMarketplaceProduct($productId: ID!, $reason: String!) {
      rejectMarketplaceProduct(productId: $productId, reason: $reason)
    }`,
    { productId: id, reason },
  );
}

/** 商户对自身商品提交上架到默认站点（置审核中） */
export async function submitProductToMarketplace(id: string): Promise<void> {
  await getAdminClient().request(
    `mutation SubmitProductToMarketplace($productId: ID!) {
      submitForMarketplaceAdmin(productId: $productId)
    }`,
    { productId: id },
  );
}

/** 已过审商品：供运营查看分类归属 / 手动归类 */
export interface ApprovedItem extends MarketplaceApprovalItem {
  platformCategoryId: string | null;
  needsCategorization: boolean;
  listedInMarketplace: boolean;
}

/** 拉取已过审商品（仅 platform/superadmin） */
export async function fetchApprovedProducts(): Promise<ApprovedItem[]> {
  const { approvedMarketplaceProducts } = await getAdminClient().request<{
    approvedMarketplaceProducts: Array<{
      id: string;
      translations?: Array<{ languageCode: string; name?: string | null }>;
      customFields?: {
        marketplaceStatus?: string | null;
        rejectReason?: string | null;
        platformCategoryId?: string | null;
        needsCategorization?: boolean | null;
        listedInMarketplace?: boolean | null;
      };
    }>;
  }>(
    `query ApprovedMarketplaceProducts {
      approvedMarketplaceProducts { id translations { languageCode name } customFields { marketplaceStatus rejectReason platformCategoryId needsCategorization listedInMarketplace } }
    }`,
  );
  return (approvedMarketplaceProducts ?? []).map((p) => {
    const zh = (p.translations ?? []).find(
      (t) => t.languageCode === 'zh_Hans' || t.languageCode === 'zh-hans',
    )?.name;
    const cf = p.customFields ?? {};
    return {
      id: p.id,
      name: zh || p.id,
      marketplaceStatus: cf.marketplaceStatus ?? 'approved',
      rejectReason: cf.rejectReason ?? null,
      platformCategoryId: cf.platformCategoryId ?? null,
      needsCategorization: !!cf.needsCategorization,
      listedInMarketplace: !!cf.listedInMarketplace,
    };
  });
}

/** 运营设置平台分类：collectionId 为空则置待归类 */
export async function setProductPlatformCategory(productId: string, collectionId: string): Promise<void> {
  await getAdminClient().request(
    `mutation SetProductPlatformCategory($productId: ID!, $collectionId: String) {
      setProductPlatformCategory(productId: $productId, collectionId: $collectionId)
    }`,
    { productId, collectionId: collectionId || null },
  );
}