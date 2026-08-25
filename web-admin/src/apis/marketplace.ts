// 商品上架审批 admin-api 封装
import { getAdminClient } from './client';

export interface MarketplaceProductView {
  id: string;
  name: string;
  listedInMarketplace: boolean;
  marketplaceStatus: string | null;
  merchantRef: string | null;
  rejectReason: string | null;
}

/** 跨租户按状态查询待审商品；status 传 '' 查全部 */
export async function fetchMarketplaceProducts(status = ''): Promise<MarketplaceProductView[]> {
  const { marketplaceProducts } = await getAdminClient().request<{
    marketplaceProducts: MarketplaceProductView[];
  }>(
    `query MarketplaceProducts($status: String) {
      marketplaceProducts(status: $status) { id name listedInMarketplace marketplaceStatus merchantRef rejectReason }
    }`,
    { status: status || null },
  );
  return marketplaceProducts ?? [];
}

export async function submitProductToMarketplace(id: string): Promise<MarketplaceProductView> {
  const { submitProductToMarketplace } = await getAdminClient().request<{
    submitProductToMarketplace: MarketplaceProductView;
  }>(
    `mutation SubmitProduct($id: ID!) { submitProductToMarketplace(id: $id) { id marketplaceStatus listedInMarketplace } }`,
    { id },
  );
  return submitProductToMarketplace;
}

export async function reviewMarketplaceProduct(
  id: string,
  approve: boolean,
  rejectReason = '',
): Promise<MarketplaceProductView> {
  const { reviewMarketplaceProduct } = await getAdminClient().request<{
    reviewMarketplaceProduct: MarketplaceProductView;
  }>(
    `mutation ReviewProduct($id: ID!, $approve: Boolean!, $rejectReason: String) {
      reviewMarketplaceProduct(id: $id, approve: $approve, rejectReason: $rejectReason) {
        id marketplaceStatus listedInMarketplace rejectReason
      }
    }`,
    { id, approve, rejectReason },
  );
  return reviewMarketplaceProduct;
}