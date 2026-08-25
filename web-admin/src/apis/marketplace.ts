// 商品上架审批 admin-api 封装
import { getAdminClient } from './client';

export interface MarketplaceApprovalItem {
  id: string;
  name: string;
  marketplaceStatus: string | null;
  rejectReason: string | null;
}

/** 拉取待审商品（仅 platform/superadmin） */
export async function fetchPendingProducts(): Promise<MarketplaceApprovalItem[]> {
  const { marketplacePendingProducts } = await getAdminClient().request<{
    marketplacePendingProducts: Array<{
      id: string;
      translations?: Array<{ languageCode: string; name?: string | null }>;
      customFields?: { marketplaceStatus?: string | null; rejectReason?: string | null };
    }>;
  }>(
    `query MarketplacePendingProducts {
      marketplacePendingProducts { id translations { languageCode name } customFields { marketplaceStatus rejectReason } }
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